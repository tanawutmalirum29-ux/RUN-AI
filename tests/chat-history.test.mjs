import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConversation } from '../shared/chat-history.mjs';

function valid(turns) {
  assert.ok(turns.length > 0);
  assert.equal(turns[0].role, 'user');
  assert.equal(turns.at(-1).role, 'user');
  for (let i = 1; i < turns.length; i++) assert.notEqual(turns[i].role, turns[i-1].role);
}
test('first message without prior history', () => {
  assert.deepEqual(buildConversation([], 'สวัสดี'), [{ role: 'user', content: 'สวัสดี' }]);
});
test('welcome assistant is excluded, including legacy saved greeting', () => {
  const result = buildConversation([{ role: 'assistant', text: 'สวัสดี ยินดีต้อนรับสู่ RUN AI' }], 'สวัสดี');
  assert.deepEqual(result, [{ role: 'user', content: 'สวัสดี' }]);
});
test('ordinary follow-up retains proper pairs', () => {
  const result = buildConversation([
    {role:'assistant',text:'Welcome'},
    {role:'user',text:'สวัสดี'},
    {role:'assistant',text:'สวัสดีครับ'},
  ], 'ตอนนี้กี่โมง');
  assert.deepEqual(result.map(x=>x.role), ['user','assistant','user']);
  valid(result);
});
test('failed prior user request must not be resent or create adjacent user turns', () => {
  const result = buildConversation([
    {role:'assistant',text:'Welcome'},
    {role:'user',text:'ก่อนหน้านี้ส่งไม่สำเร็จ'},
    {role:'assistant',text:'ไม่สำเร็จ: A conversation must start with a user message',error:true},
  ], 'สวัสดีครับ');
  assert.deepEqual(result, [{role:'user',content:'สวัสดีครับ'}]);
});
test('switching from Browser AI to Bedrock skips prior failure and orphan turn', () => {
  const history = [
    {role:'assistant',text:'Welcome'},
    {role:'user',text:'คำถามแรก'},
    {role:'assistant',text:'คำตอบแรก'},
    {role:'user',text:'ถามต่อแต่ระบบล้มเหลว'},
    {role:'assistant',text:'ไม่สำเร็จ',error:true},
  ];
  const result=buildConversation(history,'คำถามใหม่');
  assert.deepEqual(result.map(x=>x.content), ['คำถามแรก','คำตอบแรก','คำถามใหม่']);
  valid(result);
});
test('consecutive messages of same role are merged', () => {
  const result=buildConversation([
    {role:'user',text:'สวัสดี'},
    {role:'user',text:'วันนี้เป็นอย่างไร'},
    {role:'assistant',text:'สบายดี'},
    {role:'assistant',text:'ขอบคุณ'},
  ],'คำถามถัดไป');
  assert.deepEqual(result.map(x=>x.role),['user','assistant','user']);
  assert.match(result[0].content,/วันนี้เป็นอย่างไร/);
  assert.match(result[1].content,/ขอบคุณ/);
  valid(result);
});
test('all invalid, empty or unknown messages are ignored', () => {
  const result=buildConversation([
    null, 'broken', {role:'system',text:'hello'}, {role:'assistant',text:'greeting'},
    {role:'user',text:' '}, {role:'user',text:34}, {role:'assistant',text:'error',error:true}
  ], 'งานใหม่');
  assert.deepEqual(result,[{role:'user',content:'งานใหม่'}]);
});
test('long context trimming still begins with user and ends with user', () => {
  const history=[];
  for(let i=0;i<50;i++){history.push({role:'user',text:'question '+i});history.push({role:'assistant',text:'answer '+i});}
  const result=buildConversation(history,'new question',{maxHistoryMessages:9});
  valid(result);
  assert.ok(result.length<=10);
});
test('welcome markers and malformed input cannot poison chat', () => {
  for(const h of [undefined,{},[],[{role:'assistant',text:'ignore',isWelcome:true}]]) {
    valid(buildConversation(h,'ถามใหม่'));
  }
});
test('empty current prompt is rejected early',()=>{
  assert.throws(()=>buildConversation([], '  '),/must not be empty/);
});
test('Bedrock adapter from canonical turns has only valid role/content blocks',()=>{
  const turns=buildConversation([
    {role:'assistant',text:'Welcome'},
    {role:'user',text:'one'},
    {role:'assistant',text:'two'},
    {role:'user',text:'orphan'},
    {role:'assistant',text:'failed',error:true}
  ],'new');
  const messages=turns.map(turn=>({role:turn.role,content:[{text:turn.content}]}));
  assert.deepEqual(messages.map(m=>m.role),['user','assistant','user']);
  assert.equal(messages.at(-1).content[0].text,'new');
});

test('maxHistoryMessages zero means no prior context',()=>{
  const result=buildConversation([{role:'user',text:'old'},{role:'assistant',text:'answer'}], 'new', {maxHistoryMessages:0});
  assert.deepEqual(result,[{role:'user',content:'new'}]);
});
