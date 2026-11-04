export function normalizePath(value, { archive = false } = {}) {
  const raw = String(value).normalize('NFC').replaceAll('\\', '/').replace(/^\.\//, '');
  if (archive && (/^(?:\/|[a-z]:)/i.test(raw) || raw.split('/').includes('..'))) throw new Error('压缩包包含越界路径，已跳过');
  const parts = [];
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) throw new Error('引用超出目录范围'); parts.pop(); }
    else parts.push(part);
  }
  return parts.join('/');
}

export const basename = path => String(path).replaceAll('\\', '/').split('/').pop();
export const dirname = path => normalizePath(path).split('/').slice(0, -1).join('/');
export const extension = path => (basename(path).match(/\.[^./]+$/)?.[0] || '').toLowerCase();
export const stem = path => basename(path).replace(/\.[^.]+$/, '');
export const comparisonKey = text => String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const joinPath = (base, path) => normalizePath(`${base}/${path}`);
export const isAuxiliary = path => /(?:^|\/)(?:__MACOSX|\.git|node_modules|Library|Temp|\.Trash)(?:\/|$)|(?:^|\/)\._|(?:^|\/)\.DS_Store$/i.test(path);

export function resolveReference(reference, origin, entries) {
  let input = String(reference).replaceAll('\\', '/');
  try { input = decodeURIComponent(input); } catch {}
  if (/^(?:https?:|\/\/)/i.test(input)) throw new Error('资源包含远程引用，本站仅加载本地关联文件');
  const sameScope = entries.filter(e => e.scope === origin.scope);
  let relative;
  try { relative = joinPath(dirname(origin.path), input); } catch {}
  const direct = sameScope.filter(e => e.path === relative || e.path === normalizePath(input.replace(/^[a-z]:\//i, '')));
  if (direct.length === 1) return direct[0];
  const key = input.normalize('NFKC').toLowerCase();
  const suffix = sameScope.filter(e => key.endsWith('/' + e.path.normalize('NFKC').toLowerCase()));
  if (suffix.length === 1) return suffix[0];
  const name = basename(input).normalize('NFKC').toLowerCase();
  const matches = sameScope.filter(e => basename(e.path).normalize('NFKC').toLowerCase() === name);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`存在同名引用，无法唯一确定：${basename(input)}`);
  return null;
}
