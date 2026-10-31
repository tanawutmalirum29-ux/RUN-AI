export interface Turn { role: 'user' | 'assistant'; content: string }
export declare function toOpenRouterMessages(turns: Turn[], imageBase64?: string): Array<{role: 'user' | 'assistant';content: string | Array<unknown>}>;
export declare function extractOpenRouterText(data: unknown): string;
