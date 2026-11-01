import test from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_MODELS } from '../shared/model-catalog.mjs';
import {
 CONTROL_KEY,DEFAULT_RISK_LIMITS_CENTS,CHAT_RISK_CENTS,
 parseRiskLimits,riskReservationCents,costGuardCounterKeys,
 spendPlan,controlEnabled,buildGuardSnapshot
} from '../shared/cost-guard.mjs';

const now = new Date('2026-11-01T23:59:59.000Z');
test('default guard limits are finite and modest; invalid configuration fails closed',()=>{
 assert.deepEqual(parseRiskLimits(),{day:300,month:1500});
 for(const bad of ['unlimited','0','-1','1.25','9999999','NaN']) {
  assert.throws(()=>parseRiskLimits(bad,'1500'),/Invalid|exceeds/);
 }
 assert.throws(()=>parseRiskLimits('2000','1500'),/cannot exceed/);
 assert.deepEqual(parseRiskLimits('200','1000'),{day:200,month:1000});
});
test('every provider model has a bounded charge, even free endpoints',()=>{
 assert.equal(Object.keys(CHAT_RISK_CENTS).length,CLOUD_MODELS.length);
 for(const model of CLOUD_MODELS) {
  assert.ok(riskReservationCents('chat',model.id)>=1);
  assert.ok(riskReservationCents('chat',model.id)<=DEFAULT_RISK_LIMITS_CENTS.day);
 }
 assert.throws(()=>riskReservationCents('chat','hacked'),/Unsupported/);
 assert.equal(riskReservationCents('video'),250);
 assert.equal(riskReservationCents('image'),35);
});
test('spent request updates global quota, model quota, risk day and month together',()=>{
 const plan=spendPlan('chat','bedrock:nova-pro',undefined,undefined,now);
 assert.equal(plan.quotaItems.length,4);
 assert.equal(plan.budgetItems.length,2);
 assert.equal(plan.budgetItems[0].pk,'RISK#DAY');
 assert.equal(plan.budgetItems[1].pk,'RISK#MONTH');
 assert.equal(plan.reservedCents,35);
 assert.deepEqual(plan.control,CONTROL_KEY);
 const names=[...plan.quotaItems,...plan.budgetItems].map(x=>x.pk+'|'+x.sk);
 assert.equal(new Set(names).size,names.length);
});
test('big video reservation can be denied by configured daily limit',()=>{
 assert.throws(()=>spendPlan('video',undefined,'100','1000',now),/smaller/);
 assert.equal(spendPlan('video',undefined,'300','1500',now).reservedCents,250);
});
test('kill switch explicit false denies; missing default compatible; malformed fails closed',()=>{
 assert.equal(controlEnabled(null),true);
 assert.equal(controlEnabled(undefined),true);
 assert.equal(controlEnabled({enabled:true}),true);
 assert.equal(controlEnabled({enabled:false}),false);
 assert.equal(controlEnabled({}),false);
 assert.equal(controlEnabled({enabled:'true'}),false);
});
test('snapshot shows risk reservations not AWS actual spending',()=>{
 const keys=costGuardCounterKeys(now);
 const snap=buildGuardSnapshot({
  [keys[0].pk+'|'+keys[0].sk]:280,
  [keys[1].pk+'|'+keys[1].sk]:1000
 },{enabled:false},undefined,undefined,now);
 assert.equal(snap.enabled,false);
 assert.equal(snap.periods.day.remainingCents,20);
 assert.equal(snap.periods.month.remainingCents,500);
 assert.equal(snap.remainingCents,20);
 assert.equal(snap.budgetType,'risk-reservations-not-actual-billing');
});
test('risk counter rotates at UTC midnight without resetting month',()=>{
 const keys=costGuardCounterKeys(new Date('2026-11-02T00:00:01Z'));
 assert.equal(keys[0].sk,'2026-11-02');
 assert.equal(keys[1].sk,'2026-11');
});
test('risk model guard cannot be lifted by switching model IDs',()=>{
 for(const model of CLOUD_MODELS){
   const plan=spendPlan('chat',model.id,undefined,undefined,now);
   assert.equal(plan.budgetItems.length,2);
   assert.equal(plan.budgetItems[0].sk,'2026-11-01');
   assert.equal(plan.budgetItems[1].sk,'2026-11');
 }
});

test('frontier requests are charged deliberately conservative risk reservations',()=>{
  assert.equal(riskReservationCents('chat','openrouter:gpt-6-astra'),75);
  assert.equal(riskReservationCents('chat','openrouter:claude-fable-5.1'),75);
  assert.equal(riskReservationCents('chat','openrouter:gpt-6-luna'),6);
  assert.equal(riskReservationCents('chat','openrouter:gemini-4-argon'),35);
  const expensive=spendPlan('chat','openrouter:gpt-6-astra',undefined,undefined,now);
  assert.equal(expensive.reservedCents,75);
  assert.equal(expensive.budgetItems.length,2);
  assert.throws(()=>spendPlan('chat','openrouter:gpt-6-astra','50','1500',now),/smaller/);
});

test('AWS Native uses cheap Nova Micro risk allowance and all shared atomic cost counters',()=>{
 assert.equal(riskReservationCents('chat','bedrock:run-ai-native'),3);
 const plan=spendPlan('chat','bedrock:run-ai-native',undefined,undefined,now);
 assert.equal(plan.quotaItems.length,4);
 assert.equal(plan.budgetItems.length,2);
 assert.equal(plan.reservedCents,3);
 assert.equal(plan.quotaItems[2].pk,'MODEL#DAY');
 assert.ok(plan.quotaItems[2].sk.includes('bedrock:run-ai-native'));
});
