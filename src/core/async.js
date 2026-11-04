export async function mapLimit(items, concurrency, visit) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        output[index] = await visit(items[index], index);
      }
    }),
  );
  return output;
}

const hasChinese = (text) => /[\u4e00-\u9fff]/.test(text);

// 浏览器抛出的英文异常（TypeError / ReferenceError / 网络错误等）直接弹给用户看不懂，
// 这里统一翻成中文；已经有中文的原始提示原样保留，避免覆盖掉更具体的说明。
const patterns = [
  [
    /Cannot read propert(?:y|ies) of (?:undefined|null) \(reading '([^']+)'\)/,
    (match) => `页面状态异常（读取“${match[1]}”时对象为空），请刷新后重试`,
  ],
  [
    /Cannot set propert(?:y|ies) of (?:undefined|null) \(setting '([^']+)'\)/,
    (match) => `页面状态异常（写入“${match[1]}”时对象为空），请刷新后重试`,
  ],
  [
    /^([\w$.]+) is not defined\b/,
    (match) => `页面脚本没有完整加载（缺少 ${match[1]}），请刷新页面后重试`,
  ],
  [
    /^([\w$.]+) is not a function\b/,
    (match) => `当前页面或浏览器不支持该操作（${match[1]}），请刷新后重试`,
  ],
  [
    /Failed to fetch|NetworkError|Load failed|network error/i,
    () => "读取本地文件失败，请确认文件没有被移动、占用或删除",
  ],
  [
    /NotReadableError|could not be read/i,
    () => "文件无法读取，可能正被其他程序占用，关掉占用它的程序后重试",
  ],
  [
    /out of memory|allocation failed|Array buffer allocation/i,
    () => "内存不足：请先解压大文件，或改用更小的模型与贴图",
  ],
  [
    /The operation was aborted|aborted/i,
    () => "操作已取消",
  ],
];

export function friendlyError(error) {
  if (error?.name === "NotAllowedError")
    return "尚未获得目录读取权限，请点击“恢复访问”";
  if (error?.name === "NotFoundError")
    return "文件已移动或删除，请刷新对应目录";
  if (error?.name === "QuotaExceededError")
    return "浏览器本地空间不足，本次仍可预览，封面可能无法保存";
  if (error?.name === "SecurityError")
    return "浏览器安全策略阻止了此操作，请通过 localhost 或 HTTPS 打开本站";
  const message = String(error?.message || "").trim();
  if (message && hasChinese(message)) return message;
  for (const [pattern, render] of patterns) {
    const match = message.match(pattern);
    if (match) return render(match);
  }
  if (message)
    return `操作未完成（${error?.name || "未知错误"}），请刷新后重试；详情见浏览器控制台`;
  return "此内容暂时无法预览";
}
