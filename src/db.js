const DB = 'run-ai-v1';
function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction(mode, fn) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode);
    const req = fn(tx.objectStore('files'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
export const listAssets = () => transaction('readonly', s => s.getAll());
export const saveAsset = (file, name = file.name) => transaction('readwrite', s => s.put({
  id: crypto.randomUUID(), file, name, type: file.type || 'application/octet-stream', size: file.size, created: Date.now(),
}));
export const deleteAsset = id => transaction('readwrite', s => s.delete(id));
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
  });
}
export async function photoBytes(file) {
  let url = URL.createObjectURL(file);
  let element;
  try {
    if (file.type.startsWith('video/')) {
      element = document.createElement('video'); element.src = url; element.muted = true; element.playsInline = true; element.preload = 'auto';
      await new Promise((resolve, reject) => { element.onloadeddata = resolve; element.onerror = () => reject(new Error('อ่านวิดีโอไม่ได้')); });
      if (element.duration > 0.5) {
        element.currentTime = Math.min(0.5, element.duration / 2);
        await new Promise(resolve => { element.onseeked = resolve; setTimeout(resolve, 1500); });
      }
    } else if (file.type.startsWith('image/')) {
      element = new Image(); element.src = url;
      await element.decode();
    } else return '';
    const width = element.videoWidth || element.naturalWidth || 512;
    const height = element.videoHeight || element.naturalHeight || 512;
    const scale = Math.min(512 / Math.max(width, height), 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(element, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.65).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}
