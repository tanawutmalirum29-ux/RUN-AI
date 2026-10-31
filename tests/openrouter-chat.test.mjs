import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConversation } from '../shared/chat-history.mjs';
import { toOpenRouterMessages, extractOpenRouterText } from '../shared/openrouter-chat.mjs';
import { CLOUD_MODELS, selectCloudModel } from '../shared/model-catalog.mjs';

const turns = buildConversation([
  {role:'assistant',text:'welcome'},
  {role:'user',text:'สวัสดี'},
  {role:'assistant',text:'สวัสดีครับ'},
  {role:'user',text:'คำถามที่ล้มเหลว'},
  {role:'assistant',text:'ไม่สำเร็จ',error:true},
], 'ช่วยตอบภาษาไทย');
test('OpenRouter receives valid alternating chat after a failed history',()=>{
  const messages=toOpenRouterMessages(turns);
  assert.deepEqual(messages.map(x=>x.role),['user','assistant','user']);
  assert.equal(messages.at(-1).content,'ช่วยตอบภาษาไทย');
});
test('OpenRouter image attaches only to latest user turn',()=>{
  const messages=toOpenRouterMessages([{role:'user',content:'ดูรูปภาพนี้'}], 'YWJj');
  assert.equal(messages[0].content[0].type,'text');
  assert.equal(messages[0].content[1].image_url.url,'data:image/jpeg;base64,YWJj');
});
test('OpenRouter message structure rejects malformed history',()=>{
  assert.throws(()=>toOpenRouterMessages([{role:'assistant',content:'hello'}]),/ผู้ใช้/);
  assert.throws(()=>toOpenRouterMessages([{role:'user',content:'one'},{role:'user',content:'two'}]),/ติดกัน/);
  assert.throws(()=>toOpenRouterMessages([{role:'user',content:'hello'}],'^^'),/ไม่ถูกต้อง/);
});
test('OpenRouter completion supports string and text parts',()=>{
  assert.equal(extractOpenRouterText({choices:[{message:{content:'ตอบภาษาไทย'}}]}),'ตอบภาษาไทย');
  assert.equal(extractOpenRouterText({choices:[{message:{content:[{type:'text',text:'hello'},{type:'text',text:' world'}]}}]}),'hello\n world');
});
test('OpenRouter empty/error completion does not become a success',()=>{
  assert.throws(()=>extractOpenRouterText({choices:[{message:{content:''}}]}),/ไม่ส่งข้อความ/);
  assert.throws(()=>extractOpenRouterText({error:{message:'quota'}}),/ไม่ส่งข้อความ/);
});
test('Dolphin model is whitelisted and text-only; Nova Lite is vision enabled',()=>{
  assert.equal(selectCloudModel('openrouter:dolphin-uncensored').supportsImage,false);
  assert.equal(selectCloudModel('bedrock:nova-lite').supportsImage,true);
});
test('provider catalog cannot contain client-configurable URLs or keys',()=>{
  assert.ok(CLOUD_MODELS.every(x=>x.provider==='bedrock'||x.provider==='openrouter'));
  assert.ok(CLOUD_MODELS.every(x=>!Object.hasOwn(x,'baseURL')&&!Object.hasOwn(x,'apiKey')));
});
