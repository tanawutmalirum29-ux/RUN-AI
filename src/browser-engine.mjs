import { getLocalModel } from '../shared/model-catalog.mjs';

/**
 * Single WebLLM engine. Switching models explicitly unloads the old engine
 * before downloading/initializing the next to avoid running out of GPU memory.
 * Concurrent load calls are serialized; no reload of the entire webpage.
 */
export function createBrowserModelRuntime(loadWebLLM = () => import('@mlc-ai/web-llm')) {
  let engine = null;
  let activeModelId = null;
  let loading = null;

  async function load(modelId, onProgress = () => {}) {
    if (!getLocalModel(modelId)) throw new Error('โมเดลในเบราว์เซอร์ไม่อยู่ในรายการที่รองรับ');
    if (loading) await loading.catch(() => {});
    if (engine && activeModelId === modelId) return engine;
    const task = (async () => {
      const webllm = await loadWebLLM();
      const record = webllm.prebuiltAppConfig?.model_list?.find(m => m.model_id === modelId);
      if (!record) throw new Error('WebLLM เวอร์ชันนี้ยังไม่มีโมเดลที่เลือก โปรดเลือกตัวอื่น');
      if (engine) {
        const previous = engine;
        engine = null;
        activeModelId = null;
        await previous.unload();
      }
      try {
        const next = await webllm.CreateMLCEngine(modelId, { initProgressCallback: p => onProgress(p.text || 'กำลังโหลดโมเดล...') });
        engine = next;
        activeModelId = modelId;
        return next;
      } catch (error) {
        engine = null;
        activeModelId = null;
        throw error;
      }
    })();
    loading = task;
    try { return await task; }
    finally { if (loading === task) loading = null; }
  }

  return {
    load,
    get activeModelId() { return activeModelId; },
    get loading() { return !!loading; },
  };
}
