export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface HistoryOptions {
  maxHistoryMessages?: number;
  maxCharsPerHistoryMessage?: number;
}
export declare function buildConversation(
  history: unknown,
  prompt: string,
  options?: HistoryOptions
): ChatTurn[];
