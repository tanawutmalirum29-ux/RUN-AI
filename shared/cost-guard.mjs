/**
 * RUN-AI operational cost guard.
 *
 * Values are RISK RESERVATIONS IN CENTS, not provider invoices or a promise
 * that actual AWS/OpenRouter charges cannot exceed this number.
 * Actual billing includes API, hosting, storage, retries and third parties.
 * Count each accepted request, including failed upstream calls, so attacks
 * cannot keep retrying high-priced models without consuming allowance.
 */
import { CLOUD_MODELS } from './model-catalog.mjs';
import { quotaKeysForSpend } from './quota-policy.mjs';

export const CONTROL_KEY = Object.freeze({ pk: 'CONTROL', sk: 'PAID_AI' });
export const DEFAULT_RISK_LIMITS_CENTS = Object.freeze({ day: 300, month: 1500 });

const weights = Object.fromEntries(CLOUD_MODELS.map(model => {
  // Explicit risk weights; these are NOT current model prices.
  if (model.id === 'bedrock:nova-micro') return [model.id, 3];
  if (model.id === 'bedrock:nova-lite') return [model.id, 8];
  if (model.id === 'bedrock:nova-pro') return [model.id, 35];
  if (model.tier === 'frontier') {
    const frontierRisk = {
      "openrouter:gpt-6-luna": 6,
      "openrouter:gpt-6.1-terra": 20,
      "openrouter:gpt-6.1-sol": 35,
      "openrouter:gpt-6-astra": 75,
      "openrouter:claude-sonnet-5.5": 35,
      "openrouter:claude-opus-5.5": 55,
      "openrouter:claude-fable-5.1": 75,
      "openrouter:gemini-4-argon": 35,
      "openrouter:grok-4.7": 25
    };
    // Conservative per-call risk reservations, NOT model prices or actual billing.
    return [model.id, frontierRisk[model.id]];
  }
  if (model.modelId.endsWith(':free')) return [model.id, 2];
  if (model.style === 'Uncensored') return [model.id, 25];
  return [model.id, 20];
}));
export const CHAT_RISK_CENTS = Object.freeze(weights);
export const OTHER_RISK_CENTS = Object.freeze({ image: 35, video: 250 });

export function parseRiskLimits(rawDay, rawMonth) {
  function parse(value, defaultValue) {
    if (value == null || value === '') return defaultValue;
    if (!/^[1-9][0-9]{0,5}$/.test(String(value))) {
      throw new Error('Invalid risk budget limit; only positive whole USD cents are accepted');
    }
    const number = Number(value);
    // Intentionally disallow a huge, accidental "unlimited" budget.
    if (number > 100000) throw new Error('Risk budget exceeds safety maximum of 100000 cents');
    return number;
  }
  const day = parse(rawDay, DEFAULT_RISK_LIMITS_CENTS.day);
  const month = parse(rawMonth, DEFAULT_RISK_LIMITS_CENTS.month);
  if (day > month) throw new Error('Risk daily budget cannot exceed monthly budget');
  return { day, month };
}

export function riskReservationCents(kind, modelId) {
  if (kind === 'chat') {
    if (!Object.hasOwn(CHAT_RISK_CENTS, modelId)) throw new Error('Unsupported model for cost protection');
    return CHAT_RISK_CENTS[modelId];
  }
  if (!Object.hasOwn(OTHER_RISK_CENTS, kind)) throw new Error('Unsupported operation for cost protection');
  return OTHER_RISK_CENTS[kind];
}

export function costGuardCounterKeys(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('Invalid guard date');
  const utc = now.toISOString();
  return [
    { pk: 'RISK#DAY', sk: utc.slice(0, 10), period: 'day' },
    { pk: 'RISK#MONTH', sk: utc.slice(0, 7), period: 'month' },
  ];
}

export function spendPlan(kind, modelId, rawDay, rawMonth, now = new Date()) {
  const limits = parseRiskLimits(rawDay,rawMonth);
  const reservedCents = riskReservationCents(kind,modelId);
  if (reservedCents > limits.day || reservedCents > limits.month) {
    throw new Error('Risk budget is smaller than the selected model request');
  }
  return {
    quotaItems: quotaKeysForSpend(kind,modelId,now),
    budgetItems: costGuardCounterKeys(now).map(({pk,sk,period})=>({
      pk,sk,charge:reservedCents,limit:limits[period],
    })),
    control: CONTROL_KEY,
    reservedCents,
    limits,
  };
}

// Missing control item keeps compatibility with existing RUN-AI deployments.
// An explicitly created item, however, must have enabled === true.
// A malformed item fails closed.
export function controlEnabled(record) {
  return record == null ? true : record.enabled === true;
}

export function buildGuardSnapshot(counts, controlItem, rawDay, rawMonth, now = new Date()) {
  const limits = parseRiskLimits(rawDay,rawMonth);
  const keys = costGuardCounterKeys(now);
  const periods = Object.fromEntries(keys.map(({pk,sk,period})=>{
    const original = counts[pk+'|'+sk];
    const reservedCents = Number.isSafeInteger(Number(original)) && Number(original) >= 0
      ? Number(original) : 0;
    return [period, {
      reservedCents,
      limitCents: limits[period],
      remainingCents: Math.max(0,limits[period]-reservedCents),
    }];
  }));
  return {
    enabled: controlEnabled(controlItem),
    mode: controlItem == null ? 'default-enabled' : 'explicit-control',
    budgetType: 'risk-reservations-not-actual-billing',
    periods,
    remainingCents: Math.min(periods.day.remainingCents,periods.month.remainingCents),
    global: true,
  };
}
