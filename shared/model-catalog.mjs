/**
 * Audited, finite catalog. Never accept arbitrary model IDs or provider URLs
 * from a public browser; the same API allowlist runs in Lambda.
 * A catalog entry means the provider publishes this model, NOT that a given
 * AWS account has access, that it is free, or that it fits the device.
 */
export const DEFAULT_LOCAL_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';
export const DEFAULT_CLOUD_MODEL = 'bedrock:nova-lite';

export const LOCAL_MODELS = Object.freeze([
  { id: DEFAULT_LOCAL_MODEL, label: 'Qwen 2.5 · 0.5B', description: 'เบา ประหยัดหน่วยความจำ เหมาะเริ่มต้น', vramMB: 945, family: 'Qwen', style: 'ทั่วไป' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 · 1.5B', description: 'ภาษาไทยและการสนทนาดีกว่ารุ่นเล็ก', vramMB: 1630, family: 'Qwen', style: 'ทั่วไป' },
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 · 3B', description: 'สนทนาและเขียนงานซับซ้อนขึ้น ต้องมี GPU', vramMB: 2505, family: 'Qwen', style: 'ทั่วไป' },
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen Coder · 1.5B', description: 'สำหรับโค้ดและดีบัก', vramMB: 1630, family: 'Qwen Coder', style: 'โค้ด' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 · 1B', description: 'โมเดลเล็กจาก Meta', vramMB: 880, family: 'Llama', style: 'ทั่วไป' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 · 3B', description: 'สนทนาและเขียนข้อความ', vramMB: 2264, family: 'Llama', style: 'ทั่วไป' },
  { id: 'Hermes-3-Llama-3.2-3B-q4f16_1-MLC', label: 'Hermes 3 · 3B (Open)', description: 'สาย open-tuned ตอบอย่างยืดหยุ่นขึ้น ไม่รับประกัน uncensored', vramMB: 2264, family: 'Hermes', style: 'เปิดกว้าง' },
  { id: 'OpenHermes-2.5-Mistral-7B-q4f16_1-MLC', label: 'OpenHermes 2.5 · 7B', description: 'เปิดกว้าง/สร้างสรรค์ ใช้หน่วยความจำมาก', vramMB: 4574, family: 'Hermes', style: 'เปิดกว้าง' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', label: 'Phi 3.5 Mini', description: 'คำสั่งและการให้เหตุผล ต้องมี GPU มากขึ้น', vramMB: 3673, family: 'Phi', style: 'ทั่วไป' },
]);

export const CLOUD_MODELS = Object.freeze([
  { id: DEFAULT_CLOUD_MODEL, label: 'Amazon Nova Lite', provider: 'bedrock', modelId: 'amazon.nova-lite-v1:0', supportsImage: true, description: 'รวดเร็ว รองรับรูปภาพและข้อความ', style: 'ทั่วไป' },
  { id: 'bedrock:nova-micro', label: 'Amazon Nova Micro', provider: 'bedrock', modelId: 'amazon.nova-micro-v1:0', supportsImage: false, description: 'ข้อความล้วน ค่าใช้จ่ายต่ำ', style: 'ประหยัด' },
  { id: 'bedrock:nova-pro', label: 'Amazon Nova Pro', provider: 'bedrock', modelId: 'amazon.nova-pro-v1:0', supportsImage: true, description: 'โมเดลใหญ่ขึ้น ต้องมีสิทธิ์ Bedrock', style: 'คุณภาพ' },
  { id: 'openrouter:qwen3-32b', label: 'Qwen3 · 32B', provider: 'openrouter', modelId: 'qwen/qwen3-32b', supportsImage: false, description: 'สนทนาหลายภาษาและเขียนโค้ด', style: 'ทั่วไป' },
  { id: 'openrouter:deepseek-v4-flash', label: 'DeepSeek V4.1 Flash', provider: 'openrouter', modelId: 'deepseek/deepseek-v4.1-flash', supportsImage: true, description: 'โมเดล reasoning/โค้ดพร้อมอ่านภาพ', style: 'คุณภาพ' },
  { id: 'openrouter:dolphin-uncensored', label: 'Dolphin · Venice Uncensored', provider: 'openrouter', modelId: 'cognitivecomputations/dolphin-mistral-24b-venice-edition', supportsImage: false, description: 'รุ่นที่ผู้ให้บริการระบุเป็น Uncensored (ข้อความเท่านั้น)', style: 'Uncensored' },
  {"id":"openrouter:mistral-small-3.2","label":"Mistral Small 3.2 · 24B","provider":"openrouter","modelId":"mistralai/mistral-small-3.2-24b-instruct","supportsImage":true,"description":"คำสั่ง งานสร้างสรรค์ และวิเคราะห์ภาพ","style":"ทั่วไป"},
  {"id":"openrouter:gemma3-27b","label":"Gemma 3 · 27B","provider":"openrouter","modelId":"google/gemma-3-27b-it","supportsImage":true,"description":"หลายภาษาและอ่านภาพ","style":"หลายภาษา"},
  {"id":"openrouter:llama3.3-70b","label":"Llama 3.3 · 70B","provider":"openrouter","modelId":"meta-llama/llama-3.3-70b-instruct","supportsImage":false,"description":"แชตภาษาไทยและงานเขียน","style":"หลายภาษา"},
  {"id":"openrouter:hermes4-70b","label":"Hermes 4 · 70B","provider":"openrouter","modelId":"nousresearch/hermes-4-70b","supportsImage":false,"description":"Open-tuned reasoning และงานสร้างสรรค์ ไม่ใช่ uncensored แบบรับประกัน","style":"เปิดกว้าง"},
  {"id":"openrouter:dolphin3-mistral","label":"Dolphin 3.0 · Mistral 24B","provider":"openrouter","modelId":"cognitivecomputations/dolphin3.0-mistral-24b","supportsImage":false,"description":"Dolphin instruct สำหรับสนทนาและโค้ด","style":"เปิดกว้าง"},
  {"id":"openrouter:dolphin3-r1","label":"Dolphin 3.0 R1 · 24B","provider":"openrouter","modelId":"cognitivecomputations/dolphin3.0-r1-mistral-24b","supportsImage":false,"description":"Dolphin reasoning open-tuned","style":"เปิดกว้าง"},
  {"id":"openrouter:dolphin-llama70b","label":"Dolphin Llama 3 · 70B (Uncensored)","provider":"openrouter","modelId":"cognitivecomputations/dolphin-llama-3-70b","supportsImage":false,"description":"ผู้สร้างระบุเป็น uncensored ข้อจำกัดผู้ให้บริการยังมีผล","style":"Uncensored"},
]);

export function getLocalModel(id) {
  return LOCAL_MODELS.find(model => model.id === id);
}
export function selectCloudModel(id = DEFAULT_CLOUD_MODEL) {
  const match = CLOUD_MODELS.find(model => model.id === id);
  if (!match) throw new Error('ไม่รองรับโมเดล AI ที่เลือก กรุณาเลือกจากรายการที่อนุญาต');
  return match;
}
export function cloudModelAvailable(model, status) {
  if (!model || !status) return false;
  return model.provider === 'openrouter' ? status.openrouterEnabled === true : status.configured === true;
}
