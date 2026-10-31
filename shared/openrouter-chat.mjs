/**
 * OpenAI-compatible OpenRouter chat adapter. Model IDs and remote URLs
 * are validated separately by the server-side allowlist.
 */
export function toOpenRouterMessages(turns, imageBase64) {
  if (!Array.isArray(turns) || turns[0]?.role !== 'user') {
    throw new Error('บทสนทนาต้องเริ่มต้นด้วยข้อความจากผู้ใช้');
  }
  const messages = turns.map((turn, index) => {
    if (!['user', 'assistant'].includes(turn.role) || typeof turn.content !== 'string') {
      throw new Error('รูปแบบประวัติสนทนาไม่ถูกต้อง');
    }
    if (index > 0 && turns[index - 1]?.role === turn.role) {
      throw new Error('ข้อความที่มีบทบาทเดียวกันต้องไม่ติดกัน');
    }
    return { role: turn.role, content: turn.content };
  });
  if (imageBase64) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) || imageBase64.length > 720000) {
      throw new Error('ข้อมูลภาพไม่ถูกต้องหรือใหญ่เกินกำหนด');
    }
    const last = messages[messages.length - 1];
    if (last?.role !== 'user') throw new Error('ภาพต้องแนบกับข้อความผู้ใช้');
    last.content = [
      { type: 'text', text: last.content },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imageBase64 } },
    ];
  }
  return messages;
}
export function extractOpenRouterText(data) {
  if (!data || typeof data !== 'object') throw new Error('OpenRouter ตอบกลับผิดรูปแบบ');
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content
    : Array.isArray(content) ? content.filter(x => x?.type === 'text' && typeof x.text === 'string').map(x => x.text).join('\n')
    : '';
  if (!text.trim()) throw new Error('OpenRouter ไม่ส่งข้อความกลับจากโมเดล');
  return text.trim().slice(0, 16000);
}
