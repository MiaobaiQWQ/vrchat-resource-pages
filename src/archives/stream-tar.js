import { normalizePath, isAuxiliary } from "../core/paths.js";

const decode = (bytes) =>
  new TextDecoder()
    .decode(bytes)
    .replace(/\0[\s\S]*$/, "")
    .trim();
const MAX_EXPANDED = 2 * 1024 ** 3;

export async function scanTarStream(file, { targets } = {}) {
  const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const gzip = signature[0] === 31 && signature[1] === 139;
  const stream = gzip
    ? file.stream().pipeThrough(new DecompressionStream("gzip"))
    : file.stream();
  const reader = stream.getReader(),
    records = new Map();
  let header = new Uint8Array(512),
    headerAt = 0,
    current = null,
    total = 0,
    nextName = "",
    finished = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_EXPANDED)
        throw new Error("展开数据超过 2 GB，请先解压后添加本地目录");
      let at = 0;
      while (at < value.length && !finished) {
        if (!current) {
          const size = Math.min(512 - headerAt, value.length - at);
          header.set(value.subarray(at, at + size), headerAt);
          headerAt += size;
          at += size;
          if (headerAt !== 512) continue;
          headerAt = 0;
          if (header.every((byte) => byte === 0)) {
            finished = true;
            break;
          }
          const prefix = decode(header.subarray(345, 500)),
            raw = decode(header.subarray(0, 100)),
            type = header[156];
          const length = parseInt(decode(header.subarray(124, 136)), 8) || 0;
          if (
            !Number.isSafeInteger(length) ||
            length < 0 ||
            length > MAX_EXPANDED
          )
            throw new Error("TAR 文件长度异常");
          const path = normalizePath(
            nextName || (prefix ? prefix + "/" : "") + raw,
            { archive: true },
          );
          nextName = "";
          const keep =
            type === 76 ||
            type === 120 ||
            (targets
              ? targets.has(path)
              : length <= 256 * 1024 && !isAuxiliary(path));
          current = {
            path,
            type,
            size: length,
            left: length,
            padding: (512 - (length % 512)) % 512,
            parts: [],
            keep,
          };
        }
        if (current.left) {
          const size = Math.min(current.left, value.length - at);
          if (current.keep) current.parts.push(value.slice(at, at + size));
          at += size;
          current.left -= size;
          if (current.left) continue;
        }
        if (current.padding) {
          const size = Math.min(current.padding, value.length - at);
          current.padding -= size;
          at += size;
          if (current.padding) continue;
        }
        const completed = current,
          data = current.keep ? new Blob(current.parts) : undefined;
        current = null;
        if (completed.type === 0 || completed.type === 48)
          records.set(completed.path, {
            archivePath: completed.path,
            size: completed.size,
            blob: data,
          });
        if (completed.type === 76)
          nextName = decode(new Uint8Array(await data.arrayBuffer()));
        if (completed.type === 120)
          nextName =
            (await data.text()).match(/(?:^|\n)\d+ path=(.*)/)?.[1] || "";
      }
    }
    if (current || headerAt) throw new Error("TAR 数据不完整");
  } finally {
    await reader.cancel().catch(() => {});
  }
  return records;
}

export async function streamedUnityIndex(file, kind) {
  const records = await scanTarStream(file),
    entries = [];
  const unity =
    kind === ".unitypackage" ||
    [...records.keys()].some((path) => /^[a-f0-9]{32}\/pathname$/i.test(path));
  if (!unity)
    return {
      streamed: true,
      file,
      entries: [...records.values()].map((record) => ({
        ...record,
        path: record.archivePath,
      })),
      memory: 0,
      targets: new Map(),
    };
  for (const [path, record] of records) {
    if (!path.endsWith("/pathname") || !record.blob) continue;
    const guid = path.split("/")[0],
      asset = records.get(guid + "/asset");
    if (!asset) continue;
    const name = normalizePath(
      (await record.blob.text()).replace(/\0[\s\S]*$/, "").trim(),
      { archive: true },
    );
    entries.push({
      ...asset,
      path: name,
      guid,
      meta: records.get(guid + "/asset.meta"),
    });
  }
  const memory = [...records.values()].reduce(
    (count, record) => count + (record.blob?.size || 0),
    0,
  );
  return {
    streamed: true,
    isUnity: true,
    file,
    entries,
    memory,
    targets: new Map(),
  };
}

export function readStreamedAsset(container, entry) {
  if (!entry) return Promise.resolve(new Blob());
  if (entry.blob) return Promise.resolve(entry.blob);
  if (container.targets.has(entry.archivePath))
    return Promise.resolve(container.targets.get(entry.archivePath));
  container.pending ||= new Map();
  const promise = new Promise((resolve, reject) => {
    const requests = container.pending.get(entry.archivePath) || [];
    requests.push({ resolve, reject });
    container.pending.set(entry.archivePath, requests);
  });
  if (!container.extracting) {
    container.extracting = true;
    setTimeout(async () => {
      try {
        while (container.pending.size) {
          const requests = container.pending;
          container.pending = new Map();
          try {
            const records = await scanTarStream(container.file, {
              targets: new Set(requests.keys()),
            });
            for (const [path, waiting] of requests) {
              const blob = records.get(path)?.blob;
              if (blob) {
                container.targets.set(path, blob);
                while (
                  [...container.targets.values()].reduce(
                    (n, item) => n + item.size,
                    0,
                  ) >
                    256 * 1024 ** 2 &&
                  container.targets.size > 1
                )
                  container.targets.delete(
                    container.targets.keys().next().value,
                  );
                waiting.forEach((request) => request.resolve(blob));
              } else
                waiting.forEach((request) =>
                  request.reject(new Error("大包内未找到所需资源")),
                );
            }
          } catch (error) {
            for (const waiting of requests.values())
              waiting.forEach((request) => request.reject(error));
          }
        }
      } finally {
        container.extracting = false;
      }
    }, 20);
  }
  return promise;
}
