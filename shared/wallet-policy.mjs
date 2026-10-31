/**
 * Server-only wallet rules. No anonymous visitor capabilities are accepted.
 * No customer credit issuance without a verified payment webhook.
 * Currency is internal "credits" measured in non-negative integers,
 * independent from THB and provider cost reservations.
 */
export const WALLET_PREFIX = 'WALLET#';
export function validateAuthenticatedSub(sub) {
  if (typeof sub !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(sub)) {
    throw new Error('Authenticated user identity required');
  }
  return sub;
}
export function walletKey(sub) {
  return { pk: WALLET_PREFIX + validateAuthenticatedSub(sub), sk: 'BALANCE' };
}
export function walletFromItem(item) {
  const raw = item?.credits?.N ?? '0';
  const balance = Number(raw);
  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw new Error('Invalid credit balance');
  }
  return { balance, currency:'RUN_CREDIT', paymentsEnabled:false };
}
/**
 * A blueprint for future verified checkout settlement, not a grant endpoint:
 * only a webhook worker with valid signature may execute these DB operations.
 * Its transaction must ALSO include an immutable, unique payment ID PutItem.
 */
export function checkedCreditAmount(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 100000) {
    throw new Error('Credit amount out of permitted range');
  }
  return value;
}
export function creditReservationOperation(sub, amount) {
  const key=walletKey(sub);
  const quantity=checkedCreditAmount(amount);
  return {
    Update: {
      Key:{pk:{S:key.pk},sk:{S:key.sk}},
      UpdateExpression:'SET credits = credits - :amount',
      ConditionExpression:'attribute_exists(pk) AND credits >= :amount',
      ExpressionAttributeValues:{':amount':{N:String(quantity)}},
    }
  };
}
