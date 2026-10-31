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
  const result = await client.mutations.runAI({
    action, payload: JSON.stringify({ ...payload, visitorToken: guestToken() }),
  });
  if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join(' / '));
  if (!result.data) throw new Error('AWS ไม่ส่งข้อมูลกลับ');
  return JSON.parse(result.data);
}
