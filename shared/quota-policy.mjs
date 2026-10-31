/**
 * Public playground usage policy.
 * All limits are GLOBAL across browsers, and enforced with DynamoDB
 * TransactWriteItems conditional updates before any paid model call.
 * Counts include accepted attempts, including failed upstream requests:
 * this intentionally protects against repeated costly failures.
 */
import { CLOUD_MODELS } from './model-catalog.mjs';

export const GLOBAL_QUOTAS = Object.freeze({
  chat: { day: 12, month: 60 },
  image: { day: 2, month: 8 },
  video: { day: 1, month: 1 },
});
const providerDefault = model => model.provider === 'bedrock'
  ? model.id === 'bedrock:nova-pro' ? { day: 2, month: 8 } : { day: 8, month: 30 }
  : model.style === 'Uncensored' ? { day: 3, month: 9 } : { day: 5, month: 20 };
export const CHAT_MODEL_QUOTAS = Object.freeze(Object.fromEntries(
  CLOUD_MODELS.map(model => [model.id, Object.freeze(providerDefault(model))])
));

function periods(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('Invalid quota date');
  const date = now.toISOString();
  return { day: date.slice(0,10), month: date.slice(0,7) };
}
export function quotaCounterKey(pk, sk) { return pk + '|' + sk; }
export function quotaKeysForSpend(kind, modelId, now = new Date()) {
  const period = periods(now);
  const limits = GLOBAL_QUOTAS[kind];
  if (!limits) throw new Error('Unsupported quota category');
  const items = [
    { pk:'GLOBAL#DAY', sk: period.day + '#' + kind, limit: limits.day },
    { pk:'GLOBAL#MONTH', sk: period.month + '#' + kind, limit: limits.month },
  ];
  if (kind === 'chat') {
    const cap = CHAT_MODEL_QUOTAS[modelId];
    if (!cap) throw new Error('Unsupported model quota');
    items.push(
      { pk:'MODEL#DAY', sk: period.day + '#' + modelId, limit: cap.day },
      { pk:'MODEL#MONTH', sk: period.month + '#' + modelId, limit: cap.month },
    );
  }
  return items;
}
export function allQuotaKeysForRead(now = new Date()) {
  const values = [];
  for (const kind of Object.keys(GLOBAL_QUOTAS)) {
    values.push(...quotaKeysForSpend(kind, undefined, now));
  }
  for (const modelId of Object.keys(CHAT_MODEL_QUOTAS)) {
    const items = quotaKeysForSpend('chat', modelId, now);
    values.push(...items.slice(2));
  }
  return [...new Map(values.map(x => [quotaCounterKey(x.pk,x.sk),{pk:x.pk,sk:x.sk}])).values()];
}
function row(counts, pk, sk, limit) {
  const original = counts[quotaCounterKey(pk,sk)] ?? 0;
  const used = Number.isFinite(Number(original)) ? Math.max(0,Math.floor(Number(original))) : 0;
  return { used, limit, remaining: Math.max(0,limit-used) };
}
export function buildQuotaSnapshot(counts = {}, now = new Date()) {
  const period = periods(now);
  const dayReset = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1)).toISOString();
  const monthReset = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();
  function make(pkDay, pkMonth, skDay, skMonth, caps) {
    const day = row(counts,pkDay,skDay,caps.day);
    const month = row(counts,pkMonth,skMonth,caps.month);
    return { day, month, remaining: Math.min(day.remaining,month.remaining) };
  }
  const global = Object.fromEntries(Object.entries(GLOBAL_QUOTAS).map(([kind,caps])=>[
    kind,make('GLOBAL#DAY','GLOBAL#MONTH',period.day+'#'+kind,period.month+'#'+kind,caps)
  ]));
  const models = Object.fromEntries(Object.entries(CHAT_MODEL_QUOTAS).map(([id,caps])=>[
    id, make('MODEL#DAY','MODEL#MONTH',period.day+'#'+id,period.month+'#'+id,caps)
  ]));
  return {
    checkedAt: now.toISOString(),
    resetsAtUTC: { day: dayReset, month: monthReset },
    scope: 'globalWebsite',
    counting: 'acceptedRequestsIncludingFailures',
    global, models,
  };
}
