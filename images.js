/* Image processing and IndexedDB persistence. Photos never leave this browser. */
window.YouqiImages = (() => {
  'use strict';
  const cache = new Map(), urls = new Map();
  const demoCutouts = new Set([1, 2, 4, 6, 9]);
  function demoAsset(id) {
    const match = /^youqi-demo-photo-v1-([0-9])$/.exec(id || '');
    if (!match) return null;
    const index = Number(match[1]), cutout = demoCutouts.has(index);
    return { original: `demo-${index}-original.jpg`, image: cutout ? `demo-${index}-cutout.webp` : `demo-${index}-original.jpg`, cutout };
  }
  async function fetchDemoPhoto(path) {
    const response = await fetch(new URL(path, document.baseURI));
    if (!response.ok) throw new Error('示例图片暂时无法读取，请稍后重试');
    return response.blob();
  }
  let database, worker, pending, requestId = 0;
  function db() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('youqi-images-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('assets', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('当前浏览器无法保存图片，请检查存储权限'));
      request.onblocked = () => reject(new Error('图片存储被其他窗口占用，请关闭后重试'));
    });
    return database;
  }
  async function get(id) {
    if (!id) return null;
    if (cache.has(id)) return cache.get(id);
    const store = (await db()).transaction('assets').objectStore('assets');
    let result = await new Promise((resolve, reject) => { const q = store.get(id); q.onsuccess = () => resolve(q.result || null); q.onerror = () => reject(q.error); });
    const demo = demoAsset(id);
    if (!result && demo) {
      const original = await fetchDemoPhoto(demo.original), blob = demo.cutout ? await fetchDemoPhoto(demo.image) : original;
      result = { id, original, blob, cutout: demo.cutout };
    }
    if (result) cache.set(id, result);
    return result;
  }
  async function put(asset) {
    const transaction = (await db()).transaction('assets', 'readwrite');
    transaction.objectStore('assets').put(asset);
    await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(new Error('图片保存失败，可能是浏览器空间不足')); transaction.onabort = transaction.onerror; });
    cache.set(asset.id, asset);
    if (urls.has(asset.id)) { URL.revokeObjectURL(urls.get(asset.id)); urls.delete(asset.id); }
  }
  async function discard(id) {
    if (!id) return;
    const transaction = (await db()).transaction('assets', 'readwrite');
    transaction.objectStore('assets').delete(id);
    await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
    cache.delete(id);
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  }
  function url(id) {
    if (!id) return '';
    if (urls.has(id)) return urls.get(id);
    const asset = cache.get(id);
    if (!asset) { const demo = demoAsset(id); return demo ? new URL(demo.image, document.baseURI).href : ''; }
    const address = URL.createObjectURL(asset.blob); urls.set(id, address); return address;
  }
  const canvasBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法处理此图片')), 'image/webp', 0.9));
  async function prepare(file) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片');
    if (file.size > 20 * 1024 * 1024) throw new Error('单张图片不能超过 20 MB');
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw new Error('图片无法读取，请更换图片'); }
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000) throw new Error('图片像素过大，请压缩后再试');
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height)), canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvasBlob(canvas);
    } finally { bitmap.close(); }
  }
  async function crop(blob) {
    const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] > 12) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
    }
    if (right < 0) throw new Error('没有识别到物品主体，可使用原图或更换图片');
    const width = right - left + 1, height = bottom - top + 1, scale = Math.min(1, 640 / Math.max(width, height)), output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(width * scale)); output.height = Math.max(1, Math.round(height * scale));
    output.getContext('2d').drawImage(canvas, left, top, width, height, 0, 0, output.width, output.height);
    return canvasBlob(output);
  }
  function cancel() {
    worker?.terminate(); worker = null;
    if (pending) { const active = pending; pending = null; clearTimeout(active.timer); active.reject(new DOMException('已取消抠图', 'AbortError')); }
  }
  async function remove(blob, progress) {
    if (pending) throw new Error('另一张图片正在处理中');
    if (!worker) {
      worker = new Worker(new URL('cutout-worker.js', document.baseURI), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (!pending || pending.id !== data.id) return;
        if (data.type === 'progress') { pending.progress(data.message); return; }
        const active = pending; pending = null; clearTimeout(active.timer);
        if (data.type === 'done') active.resolve(data.blob); else active.reject(new Error(data.message));
      };
      worker.onerror = () => {
        const active = pending; pending = null; worker?.terminate(); worker = null;
        if (active) { clearTimeout(active.timer); active.reject(new Error('抠图资源加载失败，可重试或使用原图')); }
      };
    }
    const id = ++requestId;
    const result = await new Promise((resolve, reject) => {
      pending = { id, resolve, reject, progress, timer: setTimeout(() => { const active = pending; pending = null; worker?.terminate(); worker = null; active?.reject(new Error('处理时间较长，可重试或使用原图')); }, 240000) };
      worker.postMessage({ id, blob });
    });
    return crop(result);
  }
  const dataUrl = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('备份图片读取失败')); reader.readAsDataURL(blob); });
  function fromDataUrl(value) {
    if (typeof value !== 'string' || value.length > 8 * 1024 * 1024 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('备份图片格式不正确');
    const [header, data] = value.split(','), bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    return new Blob([bytes], { type: header.slice(5, header.indexOf(';')) });
  }
  async function exportAssets(ids) {
    const output = [];
    for (const id of new Set(ids.filter(Boolean))) {
      const asset = await get(id);
      if (!asset) throw new Error('部分图片已丢失，无法生成完整备份；可先编辑相关记录移除缺失图片');
      output.push({ id, image: await dataUrl(asset.blob), original: await dataUrl(asset.original), cutout: asset.cutout === true });
    }
    return output;
  }
  const kind = id => (cache.get(id) || demoAsset(id))?.cutout ? '抠图结果' : '原图';
  return { get, put, discard, url, kind, prepare, remove, cancel, exportAssets, fromDataUrl };
})();
