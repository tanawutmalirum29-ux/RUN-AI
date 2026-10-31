import { createHash, randomUUID } from 'node:crypto';
import { buildConversation } from '../../../shared/chat-history.mjs';
import { DEFAULT_CLOUD_MODEL, selectCloudModel } from '../../../shared/model-catalog.mjs';
import { GLOBAL_QUOTAS, quotaKeysForSpend, allQuotaKeysForRead, quotaCounterKey, buildQuotaSnapshot } from '../../../shared/quota-policy.mjs';
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
type Event = { arguments: { action: string; payload: string }; info?: { fieldName?: string } };
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
async function quotaStatus() {
  const keys = allQuotaKeysForRead(new Date());
  const result = await db.send(new BatchGetItemCommand({
    RequestItems: { [table]: { Keys: keys.map(key => ({
      pk: { S: key.pk }, sk: { S: key.sk },
    })), ConsistentRead: true } },
  }));
  if (Object.keys(result.UnprocessedKeys ?? {}).length) {
    // Never incorrectly present unprocessed counters as 0 usage.
    throw new Error('ยังอ่านโควตาได้ไม่ครบ กรุณากดรีเฟรชสถานะ');
  }
  const counts: Record<string,number> = {};
  for (const item of result.Responses?.[table] ?? []) {
    const pk = item.pk?.S, sk = item.sk?.S;
    if (pk && sk) counts[quotaCounterKey(pk,sk)] = Number(item.count?.N ?? 0);
  }
  return buildQuotaSnapshot(counts,new Date());
}
async function spend(kind: 'chat'|'image'|'video', modelId?: string) {
  const keys = quotaKeysForSpend(kind,modelId,new Date());
  const update = ({pk,sk,limit}: {pk:string;sk:string;limit:number}) => ({
    Update: {
      TableName: table,
      Key: { pk: { S: pk }, sk: { S: sk } },
      UpdateExpression: 'SET #counter = if_not_exists(#counter, :zero) + :one',
      ConditionExpression: 'attribute_not_exists(#counter) OR #counter < :max',
      ExpressionAttributeNames: { '#counter': 'count' },
      ExpressionAttributeValues: {
        ':zero': { N: '0' }, ':one': { N: '1' }, ':max': { N: String(limit) },
      },
    },
  });
  try {
    // Four atomic counters for chat (global + selected model, each day/month).
    await db.send(new TransactWriteItemsCommand({TransactItems:keys.map(update)}));
  } catch(e:any) {
    if(e?.name==='TransactionCanceledException'||e?.name==='ConditionalCheckFailedException') {
      throw new Error('โควตาโมเดลหรือโควตารวมของเว็บหมดแล้ว กรุณาดูจำนวนคงเหลือ');
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
  if (action === 'status' || action === 'quota') {
    const quota = await quotaStatus();
    return JSON.stringify({
      configured: c.enabled, openrouterEnabled: c.openrouterEnabled,
      allowed: true, anonymous: true,
      models: { chat: 'Multiple providers', image: 'Stable Image Core', video: 'Luma Ray2' },
      dailyLimits: Object.fromEntries(Object.entries(GLOBAL_QUOTAS).map(([k,v])=>[k,v.day])),
      monthlyLimits: Object.fromEntries(Object.entries(GLOBAL_QUOTAS).map(([k,v])=>[k,v.month])),
      quota,
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
    await spend('chat',chosen.id);
    return JSON.stringify(await ask(sub, { ...p, prompt }));
  }
  if (action === 'image') {
    assertReady(c);
    cleanPrompt(p.prompt, 2000);
    await spend( 'image');
    return JSON.stringify(await createImage(sub, p));
  }
  if (action === 'video-start') {
    assertReady(c);
    cleanPrompt(p.prompt, 2500);
    await spend( 'video');
    return JSON.stringify(await startVideo(sub, p));
  }
  throw new Error('คำสั่งไม่รองรับ');
};
