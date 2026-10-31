import outputs from '../amplify_outputs.json';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';

export const cloudConfigured = Boolean(outputs?.data?.url && outputs?.data?.api_key);
if (cloudConfigured) Amplify.configure(outputs);
let client;
function guestToken() {
  const key = 'run-ai-anonymous-capability-v1';
  let token = localStorage.getItem(key);
  if (!token || !/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i.test(token)) {
    token = crypto.randomUUID() + ':' + crypto.randomUUID();
    localStorage.setItem(key, token);
  }
  return token;
}
export async function runCloud(action, payload = {}) {
  if (!cloudConfigured) throw new Error('ยังไม่เชื่อม AWS Backend: ตรวจสถานะ Amplify Deploy');
  if (!client) client = generateClient({ authMode: 'apiKey' });
  // Idempotency token for all paid operations: retries cannot silently
  // spend the same request a second time when the token is reused.
  const isPaid = action === 'chat' || action === 'image' || action === 'video-start';
  const requestId = isPaid ? (payload.requestId || crypto.randomUUID()) : undefined;
  const result = await client.mutations.runAI({
    action, payload: JSON.stringify({ ...payload, ...(requestId ? { requestId } : {}), visitorToken: guestToken() }),
  });
  if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join(' / '));
  if (!result.data) throw new Error('AWS ไม่ส่งข้อมูลกลับ');
  return JSON.parse(result.data);
}

/**
 * Only the Cognito userPool can invoke account actions. The public API key
 * cannot use runAIAccount, and the server infers wallet owner from JWT.
 */
export async function runAccount(action, payload = {}) {
  if (!cloudConfigured) throw new Error('ยังไม่ได้เชื่อม AWS Backend');
  if (!client) client = generateClient();
  const result = await client.mutations.runAIAccount({
    action, payload: JSON.stringify(payload)
  }, { authMode: 'userPool' });
  if (result.errors?.length) throw new Error(result.errors.map(e=>e.message).join(' / '));
  if (!result.data) throw new Error('AWS ไม่ส่งข้อมูลบัญชีกลับ');
  return JSON.parse(result.data);
}
