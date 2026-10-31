import test from 'node:test';
import assert from 'node:assert/strict';
import {walletKey,walletFromItem,checkedCreditAmount,creditReservationOperation} from '../shared/wallet-policy.mjs';

test('wallet lookup uses server authenticated identity',()=>{
 assert.deepEqual(walletKey('123e4567-e89b-12d3-a456-426614174000'),{
  pk:'WALLET#123e4567-e89b-12d3-a456-426614174000',sk:'BALANCE'
 });
 for(const invalid of ['','../../CONTROL',undefined,null,'bad id','a'.repeat(129)]){
  assert.throws(()=>walletKey(invalid),/Authenticated/);
 }
});
test('a new authenticated account displays zero balance, never mock credits',()=>{
 assert.deepEqual(walletFromItem(),{balance:0,currency:'RUN_CREDIT',paymentsEnabled:false});
 assert.equal(walletFromItem({credits:{N:'120'}}).balance,120);
});
test('reject negative or corrupt stored wallet balances',()=>{
 for(const x of ['-5','NaN','1.5','999999999999999999']) {
  assert.throws(()=>walletFromItem({credits:{N:x}}),/Invalid/);
 }
});
test('no wallet debit without real positive integer credit amount',()=>{
 for(const x of [0,-1,1.5,NaN,1e10,'100',null]) {
  assert.throws(()=>checkedCreditAmount(x),/range/);
 }
 assert.equal(checkedCreditAmount(40),40);
});
test('wallet debit blueprint requires existing balance, never negative',()=>{
 const operation=creditReservationOperation('user_42',50);
 assert.match(operation.Update.ConditionExpression,/credits >= :amount/);
 assert.match(operation.Update.ConditionExpression,/attribute_exists/);
 assert.equal(operation.Update.ExpressionAttributeValues[':amount'].N,'50');
 assert.equal(operation.Update.Key.pk.S,'WALLET#user_42');
});
