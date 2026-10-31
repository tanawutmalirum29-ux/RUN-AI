import { createHash, randomUUID } from 'node:crypto';
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand, StartAsyncInvokeCommand, GetAsyncInvokeCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, TransactWriteItemsCommand, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const db = new DynamoDBClient({});
const s3 = new S3Client({});
const textAI = new BedrockRuntimeClient({ region: 'us-east-1' });
const imageAI = new BedrockRuntimeClient({ region: 'us-west-2' });
const videoAI = new BedrockRuntimeClient({ region: 'us-west-2' });
const table = process.env.USAGE_TABLE!;
const bucket = process.env.OUTPUT_BUCKET!;
// These limits apply to the ENTIRE public website, not just one device.
const dailyLimits = { chat: 12, image: 2, video: 1 } as const;
const monthlyLimits = { chat: 60, image: 8, video: 1 } as const;

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
};

function context() {
  return { enabled: process.env.RUN_AI_ENABLE_BEDROCK !== '0' };
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
async function spend(kind: keyof typeof dailyLimits) {
  const iso = new Date().toISOString();
  const day = iso.slice(0, 10);
  const month = iso.slice(0, 7);
  const update = (pk: string, sk: string, max: number) => ({
    Update: {
      TableName: table,
      Key: { pk: { S: pk }, sk: { S: sk } },
      UpdateExpression: 'SET #counter = if_not_exists(#counter, :zero) + :one',
      ConditionExpression: 'attribute_not_exists(#counter) OR #counter < :max',
      ExpressionAttributeNames: { '#counter': 'count' },
      ExpressionAttributeValues: {
        ':zero': { N: '0' }, ':one': { N: '1' }, ':max': { N: String(max) },
      },
    },
  });
  try {
    // Atomic global day+month limits. A new browser cannot reset them.
    await db.send(new TransactWriteItemsCommand({
      TransactItems: [
        update('GLOBAL#MONTH', month + '#' + kind, monthlyLimits[kind]),
        update('GLOBAL#DAY', day + '#' + kind, dailyLimits[kind]),
      ],
    }));
  } catch (e: any) {
    if (e?.name === 'TransactionCanceledException' || e?.name === 'ConditionalCheckFailedException') {
      throw new Error('ครบโควตา AI แบบรวมของเว็บ (' + kind + ') กรุณาลองวัน/เดือนถัดไป');
    }
    throw e;
  }
}
async function signed(key: string) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 900 });
}
async function ask(sub: string, p: ActionPayload) {
  const prompt = cleanPrompt(p.prompt, 6000);
  const bytes = inputImage(p.image);
  const history = Array.isArray(p.history) ? p.history.slice(-10)
    .filter(x => ['user', 'assistant'].includes(x.role) && typeof x.text === 'string')
    .map(x => ({ role: x.role, content: [{ text: x.text.slice(0, 3500) }] })) : [];
  const content: any[] = [{ text: prompt }];
  if (bytes) content.push({ image: { format: 'jpeg', source: { bytes } } });
  const response = await textAI.send(new ConverseCommand({
    modelId: 'amazon.nova-lite-v1:0',
    system: [{ text: 'You are RUN AI, a useful creative studio assistant. Reply in the same language as the user. Be accurate and do not pretend to see unprovided media.' }],
    messages: [...history, { role: 'user', content }] as any,
    inferenceConfig: { maxTokens: 1100, temperature: 0.6 },
  }));
  const answer = (response.output?.message?.content || []).map(x => x.text || '').join('\n');
  return { text: answer || '(โมเดลไม่ส่งข้อความกลับ)' };
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
  if (action === 'status') return JSON.stringify({
    configured: c.enabled, allowed: true, anonymous: true,
    models: { chat: 'Amazon Nova Lite', image: 'Stable Image Core', video: 'Luma Ray2' },
    dailyLimits, monthlyLimits,
  });
  if (action === 'file-url') {
    const sub = visitorId(p);
    const key = String(p.key || '');
    if (!key.startsWith('assets/' + sub + '/') && !key.startsWith('videos/' + sub + '/')) throw new Error('ไฟล์นี้ไม่ใช่ของบัญชีคุณ');
    return JSON.stringify({ url: await signed(key) });
  }
  const sub = visitorId(p);
  if (action === 'video-status') return JSON.stringify(await getVideo(sub, p));
  assertReady(c);
  if (action === 'chat') {
    const prompt = cleanPrompt(p.prompt, 6000);
    await spend( 'chat');
    return JSON.stringify(await ask(sub, { ...p, prompt }));
  }
  if (action === 'image') {
    cleanPrompt(p.prompt, 2000);
    await spend( 'image');
    return JSON.stringify(await createImage(sub, p));
  }
  if (action === 'video-start') {
    cleanPrompt(p.prompt, 2500);
    await spend( 'video');
    return JSON.stringify(await startVideo(sub, p));
  }
  throw new Error('คำสั่งไม่รองรับ');
};
