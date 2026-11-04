export async function mapLimit(items, concurrency, visit) {
  const output = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; output[index] = await visit(items[index], index); }
  }));
  return output;
}

export function friendlyError(error) {
  if (error?.name === 'NotAllowedError') return '尚未获得目录读取权限，请点击“恢复访问”';
  if (error?.name === 'NotFoundError') return '文件已移动或删除，请刷新对应目录';
  if (error?.name === 'QuotaExceededError') return '浏览器本地空间不足，本次仍可预览，封面可能无法保存';
  return error?.message || '此内容暂时无法预览';
}
