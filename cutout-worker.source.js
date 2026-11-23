import { removeBackground } from '@imgly/background-removal';

self.onmessage = async ({ data: { id, blob } }) => {
  try {
    self.postMessage({ id, type: 'progress', message: '正在准备自动抠图，首次需要下载模型资源…' });
    const result = await removeBackground(blob, {
      model: 'isnet_quint8',
      device: 'cpu',
      proxyToWorker: false,
      output: { format: 'image/png', quality: 1 },
      progress: (key, current, total) => self.postMessage({
        id,
        type: 'progress',
        message: key.startsWith('fetch:') && current < total
          ? `正在加载抠图资源 ${Math.round(current / total * 100)}%`
          : '正在识别物品轮廓…'
      })
    });
    self.postMessage({ id, type: 'done', blob: result });
  } catch {
    self.postMessage({ id, type: 'error', message: '自动抠图未完成，可重试或直接使用原图。' });
  }
};
