import { createHash, randomUUID } from 'node:crypto';
import { walletKey, walletFromItem, validateAuthenticatedSub } from '../../../shared/wallet-policy.mjs';
import { buildConversation } from '../../../shared/chat-history.mjs';
import { DEFAULT_CLOUD_MODEL, selectCloudModel } from '../../../shared/model-catalog.mjs';
import { GLOBAL_QUOTAS, allQuotaKeysForRead, quotaCounterKey, buildQuotaSnapshot } from '../../../shared/quota-policy.mjs';
import { CONTROL_KEY, costGuardCounterKeys, buildGuardSnapshot, spendPlan } from '../../../shared/cost-guard.mjs';
import { toOpenRouterMessages, extractOpenRouterText } from '../../../shared/openrouter-chat.mjs';
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand, StartAsyncInvokeCommand, GetAsyncInvokeCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, TransactWriteItemsCommand, BatchGetItemCommand, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const db = new DynamoDBClient({});
const s3 = new S3Client({});
const textAI = new BedrockRuntimeClient({ region: 'us-east-1' });
const imageAI = new BedrockRuntimeClient({ region: 'us-west-2' });
const videoAI = new BedrockRuntimeClient({ region: 'us-west-2' });
const table = process.env.USAGE_TABLE!;
const bucket = process.env.OUTPUT_BUCKET!;
type Event = {
  arguments: { action: string; payload: string };
  info?: { fieldName?: string };
  identity?: { sub?: string; claims?: { sub?: string } };
};
type ActionPayload = {
  prompt?: string;
  history?: Array<{ role: string; text: string }>;
  image?: string;
  aspect?: string;
  negative?: string;
  duration?: string;
  jobId?: string;
  key?: string;
  visitorToken?: string;
  model?: string;
  requestId?: string;
};

function context() {
  return {
    enabled: process.env.RUN_AI_ENABLE_BEDROCK !== '0',
    openrouterEnabled: process.env.RUN_AI_OPENROUTER_ENABLED === '1' && Boolean(process.env.OPENROUTER_API_KEY),
  };
}
function visitorId(p: ActionPayload): string {
  const token = String(p.visitorToken || '');
  if (!/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i.test(token)) {
    throw new Error('ข้อมูลผู้เยี่ยมชมไม่ถูกต้อง กรุณารีเฟรชเว็บไซต์');
  }
  return createHash('sha256').update(token).digest('hex');
}
function assertReady(c: ReturnType<typeof context>) {
  if (!c.enabled) throw new Error('AWS AI ถูกปิดโดยผู้ดูแล');
}
function cleanPrompt(prompt: unknown, max: number) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > max) {
    throw new Error('ข้อความคำสั่งว่างหรือยาวเกินกำหนด');
  }
  return prompt.trim();
}
function inputImage(data: unknown): Uint8Array | undefined {
  if (!data) return undefined;
  if (typeof data !== 'string' || data.length > 720_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new Error('รูปใหญ่เกินไป กรุณาย่อให้มีขนาดไม่เกิน 500 KB');
  }
  return new Uint8Array(Buffer.from(data, 'base64'));
}
function guardConfig() {
  return {
    day: process.env.RUN_AI_RISK_DAY_CENTS,
    month: process.env.RUN_AI_RISK_MONTH_CENTS,
  };
}
function paidVideoEnabled() { return process.env.RUN_AI_PAID_VIDEO_ENABLED === '1'; }
async function quotaStatus() {
  const now = new Date();
  const keys = [
    ...allQuotaKeysForRead(now),
    ...costGuardCounterKeys(now).map(({pk,sk})=>({pk,sk})),
    CONTROL_KEY,
  ];
  const result = await db.send(new BatchGetItemCommand({
    RequestItems: { [table]: { Keys: keys.map(key => ({
      pk: { S: key.pk }, sk: { S: key.sk },
    })), ConsistentRead: true } },
  }));
  if (Object.keys(result.UnprocessedKeys ?? {}).length) {
    // Do not report a false zero when DynamoDB throttles a partial read.
    throw new Error('ยังอ่านโควตาได้ไม่ครบ กรุณากดรีเฟรชสถานะ');
  }
  const counts: Record<string,number> = {};
  let control: { enabled?: unknown } | null = null;
  for (const item of result.Responses?.[table] ?? []) {
    const pk = item.pk?.S, sk = item.sk?.S;
    if (!pk || !sk) continue;
    if (pk === CONTROL_KEY.pk && sk === CONTROL_KEY.sk) {
      control = { enabled: item.enabled?.BOOL === true ? true : false };
    } else {
      counts[quotaCounterKey(pk,sk)] = Number(item.count?.N ?? item.reservedCents?.N ?? 0);
    }
  }
  const costGuard = buildGuardSnapshot(
    counts,control,guardConfig().day,guardConfig().month,now,
  );
  return { quota:buildQuotaSnapshot(counts,now), costGuard };
}
function validatedRequestId(p: ActionPayload) {
  // Older clients that lack requestId remain compatible; all new clients
  // provide a UUID so retrying an identical request cannot bill twice.
  if (p.requestId == null) return randomUUID();
  if (typeof p.requestId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.requestId)) {
    throw new Error('รหัสคำขอไม่ถูกต้อง');
  }
  return p.requestId.toLowerCase();
}
async function spend(kind: 'chat'|'image'|'video', sub: string, p: ActionPayload, modelId?: string) {
  const config = guardConfig();
  const plan = spendPlan(kind,modelId,config.day,config.month,new Date());
  const quotaUpdate = ({pk,sk,limit}:{pk:string;sk:string;limit:number}) => ({
    Update: {
      TableName:table, Key:{pk:{S:pk},sk:{S:sk}},
      UpdateExpression:'SET #count = if_not_exists(#count, :zero) + :one',
      ConditionExpression:'attribute_not_exists(#count) OR #count < :max',
      ExpressionAttributeNames:{'#count':'count'},
      ExpressionAttributeValues:{
        ':zero':{N:'0'},':one':{N:'1'},':max':{N:String(limit)},
      },
    },
  });
  const riskUpdate = ({pk,sk,charge,limit}:{pk:string;sk:string;charge:number;limit:number}) => ({
    Update: {
      TableName:table, Key:{pk:{S:pk},sk:{S:sk}},
      UpdateExpression:'SET #cost = if_not_exists(#cost, :zero) + :charge',
      ConditionExpression:'attribute_not_exists(#cost) OR #cost <= :room',
      ExpressionAttributeNames:{'#cost':'reservedCents'},
      ExpressionAttributeValues:{
        ':zero':{N:'0'},':charge':{N:String(charge)},
        ':room':{N:String(limit-charge)},
      },
    },
  });
  const requestId = validatedRequestId(p);
  const now = new Date();
  const operations = [
    { ConditionCheck:{
      TableName:table, Key:{pk:{S:CONTROL_KEY.pk},sk:{S:CONTROL_KEY.sk}},
      ConditionExpression:'attribute_not_exists(pk) OR #enabled = :yes',
      ExpressionAttributeNames:{'#enabled':'enabled'},
      ExpressionAttributeValues:{':yes':{BOOL:true}},
    } },
    ...plan.quotaItems.map(quotaUpdate),
    ...plan.budgetItems.map(riskUpdate),
    { Put:{
      TableName:table,
      Item:{
        pk:{S:'REQUEST#'+sub},sk:{S:requestId},
        kind:{S:kind},model:{S:modelId || kind},
        reservedCents:{N:String(plan.reservedCents)},
        createdAt:{S:now.toISOString()},
        expiresAt:{N:String(Math.floor(now.getTime()/1000)+90*24*3600)},
      },
      ConditionExpression:'attribute_not_exists(pk)',
    } },
  ];
  try {
    await db.send(new TransactWriteItemsCommand({TransactItems:operations}));
  } catch(e:any) {
    if (e?.name === 'TransactionCanceledException' || e?.name === 'ConditionalCheckFailedException') {
      if (e?.CancellationReasons?.at(-1)?.Code === 'ConditionalCheckFailed') {
        throw new Error('คำขอนี้ถูกส่งไปแล้ว จึงไม่เรียก AI หรือหักโควตาซ้ำ');
      }
      throw new Error('AI ถูกปิดหรือโควตา/งบความเสี่ยงของเว็บเต็มแล้ว กรุณาตรวจสถานะ');
    }
    throw e;
  }
}
async function signed(key: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 900 });
}
async function ask(sub: string, p: ActionPayload) {
  const chosen = selectCloudModel(p.model ?? DEFAULT_CLOUD_MODEL);
  const prompt = cleanPrompt(p.prompt, 6000);
  const image = inputImage(p.image);
  if (image && !chosen.supportsImage) throw new Error('โมเดลที่เลือกไม่รองรับรูปภาพ');
  const turns = buildConversation(p.history, prompt, {
    maxHistoryMessages: 10, maxCharsPerHistoryMessage: 3500,
  });
  if (chosen.provider === 'openrouter') {
    if (!context().openrouterEnabled) throw new Error('OpenRouter ยังไม่พร้อม: ตั้งค่า OPENROUTER_API_KEY ใน Amplify Secrets');
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 45000);
    let response: Response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY,
          'Content-Type': 'application/json',
          'X-Title': 'RUN AI Playground',
        },
        body: JSON.stringify({
          model: chosen.modelId,
          messages: toOpenRouterMessages(turns, image ? Buffer.from(image).toString('base64') : undefined),
          temperature: 0.6,
          max_tokens: 900,
          stream: false,
        }),
        signal: abort.signal,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error('OpenRouter ตอบช้าเกิน 45 วินาที');
      throw new Error('ไม่สามารถเชื่อมต่อ OpenRouter ได้');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('OpenRouter Key ไม่ถูกต้องหรือไม่มีสิทธิ์');
      if (response.status === 402) throw new Error('เครดิต OpenRouter ไม่เพียงพอ');
      if (response.status === 429) throw new Error('OpenRouter จำกัดจำนวนคำขอชั่วคราว');
      throw new Error('OpenRouter ส่งข้อผิดพลาด HTTP ' + response.status + ' (อาจไม่มีโมเดลหรือบริการไม่พร้อม)');
    }
    if (Number(response.headers.get('content-length') || 0) > 250000) {
      throw new Error('ผลลัพธ์ OpenRouter ใหญ่เกินกำหนด');
    }
    const responseText = await response.text();
    if (responseText.length > 250000) throw new Error('ผลลัพธ์ OpenRouter ใหญ่เกินกำหนด');
    let body: unknown;
    try { body = JSON.parse(responseText); } catch { throw new Error('OpenRouter ส่งผลลัพธ์ที่ไม่ใช่ JSON'); }
    return { text: extractOpenRouterText(body), model: chosen.id };
  }
  const messages = turns.map(turn => ({
    role: turn.role,
    content: [{ text: turn.content }] as any[],
  }));
  if (image) messages[messages.length - 1].content.push({ image: { format: 'jpeg', source: { bytes: image } } });
  const response = await textAI.send(new ConverseCommand({
    modelId: chosen.modelId,
    system: [{ text: 'You are RUN AI, a creative studio assistant. Respond in the language of the user. Never pretend to have examined media that was not provided.' }],
    messages: messages as any,
    inferenceConfig: { maxTokens: 1100, temperature: 0.6 },
  }));
  const answer = (response.output?.message?.content || []).map(x => x.text || '').join('\n');
  return { text: answer || '(โมเดลไม่ส่งข้อความกลับ)', model: chosen.id };
}
async function createImage(sub: string, p: ActionPayload) {
  const prompt = cleanPrompt(p.prompt, 2000);
  const aspects = ['1:1', '16:9', '9:16', '3:2', '2:3'];
  const aspect = aspects.includes(p.aspect || '') ? p.aspect : '1:1';
  const body = JSON.stringify({
    prompt, aspect_ratio: aspect, output_format: 'jpeg',
    ...(p.negative ? { negative_prompt: String(p.negative).slice(0, 1000) } : {}),
  });
  const response = await imageAI.send(new InvokeModelCommand({
    modelId: 'stability.stable-image-core-v1:1',
    body: Buffer.from(body),
    contentType: 'application/json',
    accept: 'application/json',
  }));
  const data = JSON.parse(Buffer.from(response.body).toString('utf8'));
  if (!data.images?.[0]) throw new Error('โมเดลไม่ได้ส่งภาพกลับ: ' + (data.finish_reasons?.[0] || 'unknown'));
  const key = 'assets/' + sub + '/' + randomUUID() + '.jpg';
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: Buffer.from(data.images[0], 'base64'), ContentType: 'image/jpeg',
  }));
  return { key, url: await signed(key), model: 'Stable Image Core' };
}
async function startVideo(sub: string, p: ActionPayload) {
  const prompt = cleanPrompt(p.prompt, 2500);
  const aspect = ['16:9', '9:16', '1:1', '4:3', '3:4'].includes(p.aspect || '') ? p.aspect : '16:9';
  // Cap generated video at five seconds to limit anonymous paid usage.
  const duration = '5s';
  const id = randomUUID();
  const prefix = 'videos/' + sub + '/' + id + '/';
  const image = inputImage(p.image);
  const modelInput: any = {
    prompt, aspect_ratio: aspect, duration, resolution: '720p', loop: false,
  };
  if (image) {
    modelInput.keyframes = {
      frame0: { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(image).toString('base64') } },
    };
  }
  const out = await videoAI.send(new StartAsyncInvokeCommand({
    modelId: 'luma.ray-v2:0',
    modelInput,
    outputDataConfig: { s3OutputDataConfig: { s3Uri: 's3://' + bucket + '/' + prefix } },
  }));
  if (!out.invocationArn) throw new Error('สร้างงานวิดีโอไม่สำเร็จ');
  await db.send(new PutItemCommand({
    TableName: table,
    Item: {
      pk: { S: 'JOB#' + out.invocationArn }, sk: { S: 'OWNER' },
      owner: { S: sub }, prefix: { S: prefix }, prompt: { S: prompt }, created: { S: new Date().toISOString() },
    },
  }));
  return { jobId: out.invocationArn, status: 'Submitted', model: 'Luma Ray2' };
}
async function getVideo(sub: string, p: ActionPayload) {
  if (!p.jobId || !/^arn:aws:bedrock:/.test(p.jobId) || p.jobId.length > 500) throw new Error('รหัสงานไม่ถูกต้อง');
  const record = await db.send(new GetItemCommand({
    TableName: table, Key: { pk: { S: 'JOB#' + p.jobId }, sk: { S: 'OWNER' } },
  }));
  if (!record.Item || record.Item.owner?.S !== sub) throw new Error('ไม่พบงานวิดีโอของบัญชีนี้');
  const prefix = record.Item.prefix?.S;
  if (!prefix?.startsWith('videos/' + sub + '/')) throw new Error('ไม่พบที่จัดเก็บงาน');
  const job = await videoAI.send(new GetAsyncInvokeCommand({ invocationArn: p.jobId }));
  if (job.status === 'Failed') return { status: 'Failed', reason: job.failureMessage || 'สร้างวิดีโอไม่สำเร็จ' };
  if (job.status !== 'Completed') return { status: job.status || 'InProgress' };
  const result = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 100 }));
  const video = result.Contents?.find(x => x.Key?.toLowerCase().endsWith('.mp4'));
  if (!video?.Key) return { status: 'Processing', reason: 'สร้างสำเร็จแล้ว กำลังรอไฟล์ MP4 ใน S3' };
  return { status: 'Completed', key: video.Key, url: await signed(video.Key) };
}
export const handler = async (event: Event): Promise<string> => {
  if (event.info?.fieldName === 'health') return 'RUN-AI API ready';
  const c = context();
  const action = event.arguments.action;
  if (!event.arguments.payload || event.arguments.payload.length > 780_000) throw new Error('ข้อมูลที่ส่งใหญ่เกิน 780 KB');
  let p: ActionPayload;
  try { p = JSON.parse(event.arguments.payload); } catch { throw new Error('รูปแบบข้อมูล JSON ไม่ถูกต้อง'); }
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('ข้อมูลไม่ถูกต้อง');
  // This action lives on runAIAccount, protected by Cognito userPool auth.
  // The user ID is taken exclusively from AppSync-verified identity, NOT JSON.
  if (event.info?.fieldName === 'runAIAccount') {
    const sub = validateAuthenticatedSub(event.identity?.sub ?? event.identity?.claims?.sub);
    if (action !== 'wallet-status') throw new Error('บัญชียังไม่รองรับคำสั่งนี้');
    const key = walletKey(sub);
    const result = await db.send(new GetItemCommand({
      TableName: table,
      Key: {pk:{S:key.pk},sk:{S:key.sk}},
      ConsistentRead:true,
    }));
    return JSON.stringify(walletFromItem(result.Item));
  }
  if (action === 'status' || action === 'quota') {
    const { quota, costGuard } = await quotaStatus();
    const allowed = costGuard.enabled;
    return JSON.stringify({
      // Providers remain configured, but UI must not offer paid calls when
      // a live operator kill switch has been activated.
      configured: c.enabled && allowed,
      openrouterEnabled: c.openrouterEnabled && allowed,
      paidVideoEnabled: paidVideoEnabled() && c.enabled && allowed,
      paidApiEnabled:allowed,
      anonymous: true,
      models:{ chat:'Multiple providers', image:'Stable Image Core', video:'Luma Ray2' },
      dailyLimits:Object.fromEntries(Object.entries(GLOBAL_QUOTAS).map(([k,v])=>[k,v.day])),
      monthlyLimits:Object.fromEntries(Object.entries(GLOBAL_QUOTAS).map(([k,v])=>[k,v.month])),
      quota, costGuard,
    });
  }
  if (action === 'file-url') {
    const sub = visitorId(p);
    const key = String(p.key || '');
    if (!key.startsWith('assets/' + sub + '/') && !key.startsWith('videos/' + sub + '/')) throw new Error('ไฟล์นี้ไม่ใช่ของบัญชีคุณ');
    return JSON.stringify({ url: await signed(key) });
  }
  const sub = visitorId(p);
  if (action === 'video-status') return JSON.stringify(await getVideo(sub, p));
  if (action === 'chat') {
    const prompt = cleanPrompt(p.prompt, 6000);
    const chosen = selectCloudModel(p.model ?? DEFAULT_CLOUD_MODEL);
    // Validate permissions and modality before using a paid quota.
    if (chosen.provider === 'openrouter' && !c.openrouterEnabled) throw new Error('ยังไม่ได้ตั้งค่า OpenRouter API Key ใน AWS');
    if (chosen.provider === 'bedrock') assertReady(c);
    if (p.image && !chosen.supportsImage) throw new Error('โมเดลที่เลือกไม่รองรับภาพ');
    await spend('chat',sub,p,chosen.id);
    return JSON.stringify(await ask(sub, { ...p, prompt }));
  }
  if (action === 'image') {
    assertReady(c);
    cleanPrompt(p.prompt, 2000);
    await spend('image',sub,p);
    return JSON.stringify(await createImage(sub, p));
  }
  if (action === 'video-start') {
    assertReady(c);
    cleanPrompt(p.prompt, 2500);
    if (!paidVideoEnabled()) throw new Error('วิดีโอแบบเสียเงินปิดไว้เพื่อป้องกันค่าใช้จ่าย โปรดเปิดใช้งานโดยผู้ดูแล');
    await spend('video',sub,p);
    return JSON.stringify(await startVideo(sub, p));
  }
  throw new Error('คำสั่งไม่รองรับ');
};
