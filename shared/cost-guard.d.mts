export interface GuardKey {pk:string;sk:string;period:'day'|'month'}
export interface RiskLimits {day:number;month:number}
export interface GuardSnapshot {
  enabled:boolean;
  mode:string;
  budgetType:string;
  periods:{day:{reservedCents:number;limitCents:number;remainingCents:number};
           month:{reservedCents:number;limitCents:number;remainingCents:number}};
  remainingCents:number;
  global:boolean;
}
export declare const CONTROL_KEY:Readonly<{pk:string;sk:string}>;
export declare const DEFAULT_RISK_LIMITS_CENTS:Readonly<RiskLimits>;
export declare const CHAT_RISK_CENTS:Readonly<Record<string,number>>;
export declare const OTHER_RISK_CENTS:Readonly<Record<string,number>>;
export declare function parseRiskLimits(day?:string|null,month?:string|null):RiskLimits;
export declare function riskReservationCents(kind:string,modelId?:string):number;
export declare function costGuardCounterKeys(now?:Date):GuardKey[];
export declare function spendPlan(kind:'chat'|'image'|'video',modelId?:string,rawDay?:string|null,rawMonth?:string|null,now?:Date):{
 quotaItems:Array<{pk:string;sk:string;limit:number}>;
 budgetItems:Array<{pk:string;sk:string;charge:number;limit:number}>;
 control:{pk:string;sk:string};reservedCents:number;limits:RiskLimits;
};
export declare function controlEnabled(record?:{enabled?:unknown}|null):boolean;
export declare function buildGuardSnapshot(counts:Record<string,number>,controlItem:{enabled?:unknown}|null|undefined,rawDay?:string|null,rawMonth?:string|null,now?:Date):GuardSnapshot;
