/**
 * Normalize legacy UI messages into alternating user/assistant turns for
 * both WebLLM and Bedrock Converse. Error bubbles and welcome messages
 * are never sent to models. A final unanswered user request is discarded
 * before appending the new request (e.g. after a previous failed call).
 *
 * This module deliberately has no browser or AWS dependencies.
 */
export function buildConversation(history, prompt, options = {}) {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new TypeError('Current user prompt must not be empty');
  }
  const historyLimit = Math.max(0, Math.min(24, options.maxHistoryMessages ?? 10));
  const charLimit = Math.max(100, Math.min(6000, options.maxCharsPerHistoryMessage ?? 3000));
  const turns = [];
  // Bound parsing work even for bad or malicious historical payloads.
  const source = Array.isArray(history) ? history.slice(-100) : [];
  for (const entry of source) {
    if (!entry || typeof entry !== 'object' || entry.error || entry.isWelcome) continue;
    if (entry.role !== 'user' && entry.role !== 'assistant') continue;
    if (typeof entry.text !== 'string') continue;
    const text = entry.text.trim().slice(0, charLimit);
    if (!text) continue;
    if (!turns.length && entry.role !== 'user') continue;
    const last = turns[turns.length - 1];
    if (last?.role === entry.role) {
      // Merge adjacent equal-role turns, preserving original ordering.
      last.content = (last.content + '\n\n' + text).slice(-charLimit);
    } else {
      turns.push({ role: entry.role, content: text });
    }
  }

  // A dangling user turn has no valid assistant response. Retrying should
  // not silently resend that previous failed question.
  if (turns[turns.length - 1]?.role === 'user') turns.pop();

  // Fit the context window while keeping a valid initial user turn.
  const recent = historyLimit === 0 ? [] : turns.slice(-historyLimit);
  while (recent.length && recent[0].role !== 'user') recent.shift();
  recent.push({ role: 'user', content: prompt.trim() });
  return recent;
}
