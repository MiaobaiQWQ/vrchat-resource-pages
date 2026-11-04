import { BlobReader, BlobWriter, ZipReader, configure } from "@zip.js/zip.js";
import { gunzipSync } from "fflate";
import { readTar, unityEntries } from "./tar.js";
import { streamedUnityIndex, readStreamedAsset } from "./stream-tar.js";
import { normalizePath, isAuxiliary } from "../core/paths.js";

configure({ useWebWorkers: false });
const LIMIT = 512 * 1024 * 1024;
const cache = new Map();
let gbkCharacters;

function legacyPassword(password) {
  if (!gbkCharacters) {
    gbkCharacters = new Map();
    const decoder = new TextDecoder("gb18030");
    for (let high = 129; high <= 254; high++)
      for (let low = 64; low <= 254; low++) {
        if (low === 127) continue;
        const letter = decoder.decode(new Uint8Array([high, low]));
        if (!letter.includes("\uFFFD")) gbkCharacters.set(letter, [high, low]);
      }
  }
  const bytes = [];
  for (const letter of password) {
    if (letter.codePointAt(0) < 128) bytes.push(letter.codePointAt(0));
    else if (gbkCharacters.has(letter))
      bytes.push(...gbkCharacters.get(letter));
    else return null;
  }
  return new Uint8Array(bytes);
}

async function open(id, file, kind) {
  if (cache.has(id)) {
    const value = cache.get(id);
    cache.delete(id);
    cache.set(id, value);
    return value;
  }
  let container;
  if (kind === ".zip") {
    const reader = new ZipReader(new BlobReader(file), {
      filenameEncoding: "gb18030",
    });
    const entries = (await reader.getEntries())
      .filter((entry) => !entry.directory)
      .flatMap((entry) => {
        try {
          const path = normalizePath(entry.filename, { archive: true });
          return isAuxiliary(path)
            ? []
            : [
                {
                  path,
                  size: entry.uncompressedSize,
                  encrypted: entry.encrypted,
                  original: entry,
                },
              ];
        } catch {
          return [];
        }
      });
    container = { entries, reader, memory: 0 };
  } else if (file.size > 256 * 1024 ** 2) {
    if (file.size > 2 * 1024 ** 3)
      throw new Error("容器超过 2 GB，请先解压后添加目录");
    container = await streamedUnityIndex(file, kind);
  } else {
    let bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 31 && bytes[1] === 139) {
      const size = new DataView(bytes.buffer).getUint32(bytes.length - 4, true);
      if (size > LIMIT) {
        container = await streamedUnityIndex(file, kind);
        cache.set(id, container);
        return container;
      }
      bytes = gunzipSync(bytes, { out: new Uint8Array(size) });
    }
    const files = readTar(bytes);
    if (!files.length) throw new Error("没有找到可识别的 TAR 或 Unity 资源");
    const isUnity =
      kind === ".unitypackage" ||
      files.some((entry) => /^[0-9a-f]{32}\/pathname$/i.test(entry.path));
    container = {
      bytes,
      entries: isUnity ? unityEntries(bytes, files) : files,
      isUnity,
      memory: bytes.byteLength,
    };
  }
  cache.set(id, container);
  let memory = [...cache.values()].reduce((n, value) => n + value.memory, 0);
  for (const [key, value] of cache) {
    if (key === id) continue;
    if (cache.size <= 16 && memory <= 384 * 1024 * 1024) break;
    await value.reader?.close();
    memory -= value.memory;
    cache.delete(key);
  }
  return container;
}

async function execute({
  operation,
  id,
  file,
  kind,
  path,
  password,
  meta,
  sourceId,
}) {
  if (operation === "forget") {
    for (const [key, value] of cache)
      if (key.startsWith(sourceId + ":")) {
        await value.reader?.close();
        cache.delete(key);
      }
    return;
  }
  if (operation === "clear") {
    for (const value of cache.values()) await value.reader?.close();
    cache.clear();
    return;
  }
  const container = await open(id, file, kind);
  if (operation === "list")
    return {
      isUnity: !!container.isUnity,
      entries: container.entries.map(({ original, blob, meta, ...entry }) => ({
        ...entry,
        meta: meta
          ? {
              archivePath: meta.archivePath,
              start: meta.start,
              size: meta.size,
            }
          : undefined,
      })),
    };
  const entry = container.entries.find((entry) => entry.path === path);
  if (!entry) throw new Error("容器中的文件已不存在");
  if (entry.size > 2 * 1024 ** 3)
    throw new Error("单个文件超过 2 GB，请先解压后添加目录");
  if (
    entry.size > LIMIT &&
    !/\.(unitypackage|zip|tar|gz|tgz|7z|rar)$/i.test(entry.path)
  )
    throw new Error("单个文件超过 512 MB，请先解压到本地目录");
  if (container.streamed)
    return readStreamedAsset(container, meta ? entry.meta : entry);
  if (container.bytes) {
    const item = meta ? entry.meta : entry;
    return item
      ? new Blob([container.bytes.subarray(item.start, item.start + item.size)])
      : new Blob();
  }
  if (entry.encrypted && !password) {
    const error = new Error("此资源需要解压密码");
    error.code = "PASSWORD_REQUIRED";
    throw error;
  }
  try {
    return await entry.original.getData(new BlobWriter(), {
      password,
      checkSignature: true,
    });
  } catch (error) {
    if (password && /[^\x00-\x7f]/.test(password)) {
      const rawPassword = legacyPassword(password);
      if (rawPassword)
        try {
          return await entry.original.getData(new BlobWriter(), {
            rawPassword,
            checkSignature: true,
          });
        } catch {}
    }
    if (entry.encrypted) {
      const failure = new Error("密码不正确，或加密文件已损坏");
      failure.code = "PASSWORD_REQUIRED";
      throw failure;
    }
    throw error;
  }
}

self.onmessage = async (event) => {
  const { requestId, ...request } = event.data;
  try {
    self.postMessage({ requestId, result: await execute(request) });
  } catch (error) {
    self.postMessage({ requestId, error: error.message, code: error.code });
  }
};
