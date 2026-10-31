import outputs from '../amplify_outputs.json';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
export const cloudConfigured = Boolean(outputs?.auth?.user_pool_id && outputs?.data?.url);
if (cloudConfigured) Amplify.configure(outputs);
let client;
export async function runCloud(action, payload = {}) {
  if (!cloudConfigured) throw new Error('ยังไม่มี AWS Backend — ให้เชื่อม repository กับ Amplify Gen 2 ก่อน');
  if (!client) client = generateClient({ authMode: 'userPool' });
  const result = await client.mutations.runAI({ action, payload: JSON.stringify(payload) });
  if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join(' / '));
  if (!result.data) throw new Error('AWS ไม่ส่งข้อมูลกลับ');
  return JSON.parse(result.data);
}
