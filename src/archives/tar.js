import { normalizePath, isAuxiliary } from '../core/paths.js';

const decode = bytes => new TextDecoder().decode(bytes).replace(/\0[\s\S]*$/, '').trim();
export function readTar(bytes) {
  const files = []; let nextName = '';
  for (let position = 0; position + 512 <= bytes.length;) {
    const header = bytes.subarray(position, position + 512); if (header.every(byte => byte === 0)) break;
    const rawSize = header.subarray(124, 136);
    const size = rawSize[0] & 128 ? Number(rawSize.reduce((n, b, i) => n * 256n + BigInt(i ? b : b & 127), 0n)) : parseInt(decode(rawSize), 8) || 0;
    if (!Number.isSafeInteger(size) || size < 0 || position + 512 + size > bytes.length) throw new Error('TAR 文件长度或索引损坏');
    const prefix = decode(header.subarray(345, 500));
    let path = (prefix ? prefix + '/' : '') + decode(header.subarray(0, 100));
    const start = position + 512, type = header[156];
    if (type === 76) nextName = decode(bytes.subarray(start, start + size));
    else if (type === 120) { const match = decode(bytes.subarray(start, start + size)).match(/(?:^|\n)\d+ path=(.*)/); if (match) nextName = match[1]; }
    else if (type === 0 || type === 48) {
      path = normalizePath(nextName || path, { archive: true }); nextName = '';
      if (!isAuxiliary(path)) files.push({ path, start, size });
    }
    position = start + Math.ceil(size / 512) * 512;
  }
  return files;
}

export function unityEntries(bytes, files) {
  const byPath = new Map(files.map(file => [file.path, file]));
  return files.filter(file => file.path.endsWith('/pathname')).flatMap(file => {
    const guid = file.path.split('/')[0], data = byPath.get(guid + '/asset'); if (!data) return [];
    const path = normalizePath(decode(bytes.subarray(file.start, file.start + file.size)), { archive: true });
    return [{ ...data, path, guid, meta: byPath.get(guid + '/asset.meta') }];
  });
}
