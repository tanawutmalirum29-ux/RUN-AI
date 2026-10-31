export type QuotaKind = 'chat'|'image'|'video';
export interface QuotaKey { pk:string; sk:string; limit:number }
export interface QuotaRow { used:number; limit:number; remaining:number }
export interface QuotaEntry { day:QuotaRow; month:QuotaRow; remaining:number }
export interface QuotaSnapshot {
 checkedAt:string; resetsAtUTC:{day:string;month:string};
 scope:string; counting:string; global: Record<QuotaKind,QuotaEntry>;
 models:Record<string,QuotaEntry>;
}
export declare const GLOBAL_QUOTAS:Readonly<Record<QuotaKind,{day:number;month:number}>>;
export declare const CHAT_MODEL_QUOTAS:Readonly<Record<string,{day:number;month:number}>>;
export declare function quotaCounterKey(pk:string,sk:string):string;
export declare function quotaKeysForSpend(kind:QuotaKind,modelId?:string,now?:Date):QuotaKey[];
export declare function allQuotaKeysForRead(now?:Date):Pick<QuotaKey,'pk'|'sk'>[];
export declare function buildQuotaSnapshot(counts?:Record<string,number>,now?:Date):QuotaSnapshot;
