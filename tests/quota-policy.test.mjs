import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_MODELS } from '../shared/model-catalog.mjs';
import { GLOBAL_QUOTAS, CHAT_MODEL_QUOTAS, quotaCounterKey, quotaKeysForSpend, allQuotaKeysForRead, buildQuotaSnapshot } from '../shared/quota-policy.mjs';

const now = new Date('2026-11-01T04:00:00Z');
test('every cloud model has day/month caps',()=>{
  assert.equal(Object.keys(CHAT_MODEL_QUOTAS).length,CLOUD_MODELS.length);
  for (const model of CLOUD_MODELS) {
    const cap=CHAT_MODEL_QUOTAS[model.id];
    assert.ok(cap.day>=1 && cap.month>=cap.day);
    assert.ok(cap.day<=GLOBAL_QUOTAS.chat.day);
  }
});
test('4 independent atomic quota keys on each chat request',()=>{
  const keys=quotaKeysForSpend('chat','openrouter:dolphin-uncensored',now);
  assert.equal(keys.length,4);
  assert.equal(new Set(keys.map(k=>quotaCounterKey(k.pk,k.sk))).size,4);
  assert.ok(keys.some(x=>x.pk==='GLOBAL#DAY' && x.sk.includes('2026-11-01')));
  assert.ok(keys.some(x=>x.pk==='MODEL#MONTH' && x.sk.includes('dolphin')));
});
test('invalid model cannot consume quota or create arbitrary key',()=>{
  assert.throws(()=>quotaKeysForSpend('chat','malicious',now),/Unsupported model/);
});
test('image/video retain global-only caps from previous deployment',()=>{
  for(const k of ['image','video'])assert.equal(quotaKeysForSpend(k,undefined,now).length,2);
});
test('snapshot uses existing global counters and honors daily + monthly limits',()=>{
  const counts={
    [quotaCounterKey('GLOBAL#DAY','2026-11-01#chat')]:11,
    [quotaCounterKey('GLOBAL#MONTH','2026-11#chat')]:29,
    [quotaCounterKey('MODEL#DAY','2026-11-01#bedrock:nova-lite')]:3,
  };
  const snapshot=buildQuotaSnapshot(counts,now);
  assert.equal(snapshot.global.chat.remaining,1);
  assert.equal(snapshot.models['bedrock:nova-lite'].day.remaining,CHAT_MODEL_QUOTAS['bedrock:nova-lite'].day-3);
  assert.equal(snapshot.models['openrouter:dolphin-uncensored'].day.used,0);
  assert.equal(snapshot.resetsAtUTC.day,'2026-11-02T00:00:00.000Z');
});
test('limit reached clamps remaining at zero, does not go negative',()=>{
  const cap=CHAT_MODEL_QUOTAS['openrouter:dolphin-uncensored'];
  const snap=buildQuotaSnapshot({
    [quotaCounterKey('MODEL#DAY','2026-11-01#openrouter:dolphin-uncensored')]:cap.day+5,
    [quotaCounterKey('GLOBAL#MONTH','2026-11#image')]:8,
  },now);
  assert.equal(snap.models['openrouter:dolphin-uncensored'].remaining,0);
  assert.equal(snap.global.image.remaining,0);
});
test('month quota stops even when day quota has remaining',()=>{
 const snap=buildQuotaSnapshot({
  [quotaCounterKey('MODEL#MONTH','2026-11#bedrock:nova-pro')]:CHAT_MODEL_QUOTAS['bedrock:nova-pro'].month,
 },now);
 assert.equal(snap.models['bedrock:nova-pro'].day.used,0);
 assert.equal(snap.models['bedrock:nova-pro'].remaining,0);
});
test('all counters fit single Dynamo BatchGet (<=100) with unique keys',()=>{
 const keys=allQuotaKeysForRead(now);
 assert.ok(keys.length<=100);
 assert.equal(new Set(keys.map(k=>quotaCounterKey(k.pk,k.sk))).size,keys.length);
});
test('new UTC day resets day usage without resetting monthly usage',()=>{
 const counts={
  [quotaCounterKey('GLOBAL#DAY','2026-11-01#chat')]:12,
  [quotaCounterKey('GLOBAL#MONTH','2026-11#chat')]:25,
 };
 const snap=buildQuotaSnapshot(counts,new Date('2026-11-02T02:00:00Z'));
 assert.equal(snap.global.chat.day.used,0);
 assert.equal(snap.global.chat.month.used,25);
});

test('premium models have stricter allowance than standard models',()=>{
  assert.deepEqual(CHAT_MODEL_QUOTAS['openrouter:gpt-6-astra'],{day:2,month:8});
  assert.deepEqual(CHAT_MODEL_QUOTAS['openrouter:claude-fable-5.1'],{day:2,month:8});
  assert.deepEqual(CHAT_MODEL_QUOTAS['openrouter:grok-4.7'],{day:3,month:12});
  const snap=buildQuotaSnapshot({},now);
  assert.equal(snap.models['openrouter:gpt-6-astra'].remaining,2);
});

test('AWS Native has independent per-model quota but shares total chat limits',()=>{
 assert.deepEqual(CHAT_MODEL_QUOTAS['bedrock:run-ai-native'],{day:6,month:24});
 const plan=quotaKeysForSpend('chat','bedrock:run-ai-native',now);
 assert.equal(plan[0].pk,'GLOBAL#DAY');
 assert.equal(plan[1].pk,'GLOBAL#MONTH');
 assert.equal(plan[2].pk,'MODEL#DAY');
 assert.ok(plan[2].sk.includes('bedrock:run-ai-native'));
 const snapshot=buildQuotaSnapshot({},now);
 assert.equal(snapshot.models['bedrock:run-ai-native'].remaining,6);
});
