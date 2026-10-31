export declare const WALLET_PREFIX:string;
export declare function validateAuthenticatedSub(sub:unknown):string;
export declare function walletKey(sub:string):{pk:string;sk:string};
export declare function walletFromItem(item?:{credits?:{N?:string}}|null):{balance:number;currency:string;paymentsEnabled:boolean};
export declare function checkedCreditAmount(value:number):number;
export declare function creditReservationOperation(sub:string,amount:number):{
 Update:{Key:{pk:{S:string};sk:{S:string}};UpdateExpression:string;ConditionExpression:string;ExpressionAttributeValues:{':amount':{N:string}}}
};
