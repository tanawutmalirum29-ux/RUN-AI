import { randomUUID } from 'node:crypto';
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand, StartAsyncInvokeCommand, GetAsyncInvokeCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient, UpdateItemCommand, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const db = new DynamoDBClient({});
const s3 = new S3Client({});
const textAI = new BedrockRuntimeClient({ region: 'us-east-1' });
const imageAI = new BedrockRuntimeClient({ region: 'us-west-2' });
const videoAI = new BedrockRuntimeClient({ region: 'us-west-2' });
const table = process.env.USAGE_TABLE!;
const bucket = process.env.OUTPUT_BUCKET!;
const limits = { chat: 40, image: 5, video: 1 } as const;

type Identity = { sub?: string; claims?: Record<string, unknown> };
type Event = { arguments: { action: string; payload: string }; identity?: Identity };
type ActionPayload = {
  prompt?: string;
  history?: Array<{ role: string; text: string }>;
  image?: string;
  aspect?: string;
  negative?: string;
  duration?: string;
  jobId?: string;
  key?: string;
};

function context(event: Event) {
  const sub = String(event.identity?.sub || event.identity?.claims?.sub || '');
  const email = String(event.identity?.claims?.email || '').toLowerCase();
  if (!sub || !email) throw new Error('กรุณาเข้าสู่ระบบด้วยอีเมล');
  const allowlist = (process.env.RUN_AI_ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const allowed = allowlist.includes(email);
  const enabled = process.env.RUN_AI_ENABLE_BEDROCK === '1';
  return { sub, email, allowed, enabled };
}
function assertReady(c: ReturnType<typeof context>) {
  if (!c.allowed || !c.enabled) {
    throw new Error('ยังไม่เปิด Cloud AI: ตั้งค่า RUN_AI_ENABLE_BEDROCK=1 และ RUN_AI_ALLOWED_EMAILS ใน Amplify แล้ว Deploy อีกครั้ง');
  }
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
async function spend(sub: string, kind: keyof typeof limits) {
  const day = new Date().toISOString().slice(0, 10);
  try {
    await db.send(new UpdateItemCommand({
      TableName: table,
      Key: { pk: { S: 'LIMIT#' + sub }, sk: { S: day + '#' + kind } },
      UpdateExpression: 'SET #n = if_not_exists(#n, :zero) + :one',
      ConditionExpression: 'attribute_not_exists(#n) OR #n < :limit',
      ExpressionAttributeNames: { '#n': 'count' },
      ExpressionAttributeValues: { ':zero': { N: '0' }, ':one': { N: '1' }, ':limit': { N: String(limits[kind]) } },
    }));
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') throw new Error('ใช้โควตา AI ประจำวันครบแล้ว (' + limits[kind] + ' ครั้ง/วัน)');
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
  const duration = p.duration === '9s' ? '9s' : '5s';
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
  const c = context(event);
  const action = event.arguments.action;
  if (!event.arguments.payload || event.arguments.payload.length > 780_000) throw new Error('ข้อมูลที่ส่งใหญ่เกิน 780 KB');
  let p: ActionPayload;
  try { p = JSON.parse(event.arguments.payload); } catch { throw new Error('รูปแบบข้อมูล JSON ไม่ถูกต้อง'); }
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('ข้อมูลไม่ถูกต้อง');
  if (action === 'status') return JSON.stringify({
    configured: c.enabled, allowed: c.allowed,
    models: { chat: 'Amazon Nova Lite', image: 'Stable Image Core', video: 'Luma Ray2' },
    dailyLimits: limits,
  });
  if (action === 'file-url') {
    assertReady(c);
    const key = String(p.key || '');
    if (!key.startsWith('assets/' + c.sub + '/') && !key.startsWith('videos/' + c.sub + '/')) throw new Error('ไฟล์นี้ไม่ใช่ของบัญชีคุณ');
    return JSON.stringify({ url: await signed(key) });
  }
  assertReady(c);
  if (action === 'video-status') return JSON.stringify(await getVideo(c.sub, p));
  if (action === 'chat') {
    const prompt = cleanPrompt(p.prompt, 6000);
    await spend(c.sub, 'chat');
    return JSON.stringify(await ask(c.sub, { ...p, prompt }));
  }
  if (action === 'image') {
    cleanPrompt(p.prompt, 2000);
    await spend(c.sub, 'image');
    return JSON.stringify(await createImage(c.sub, p));
  }
  if (action === 'video-start') {
    cleanPrompt(p.prompt, 2500);
    await spend(c.sub, 'video');
    return JSON.stringify(await startVideo(c.sub, p));
  }
  throw new Error('คำสั่งไม่รองรับ');
};
