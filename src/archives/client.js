import { extension, isAuxiliary, normalizePath } from "../core/paths.js";
import { fileKind, isLibarchiveFormat } from "../core/formats.js";
import { storage } from "../core/storage.js";
import { assetUrl } from "../core/assets.js";

export class ArchiveClient {
  worker;
  sequence = 0;
  tasks = new Map();
  passwords = new Map();
  otherArchives = new Map();
  constructor() {
    this.worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = ({ data }) => {
      const task = this.tasks.get(data.requestId);
      if (!task) return;
      this.tasks.delete(data.requestId);
      clearTimeout(task.timer);
      if (data.error)
        task.reject(Object.assign(new Error(data.error), { code: data.code }));
      else task.resolve(data.result);
    };
    this.worker.onerror = () => {
      for (const task of this.tasks.values()) {
        clearTimeout(task.timer);
        task.reject(new Error("本地解析器停止，请刷新页面重试"));
      }
      this.tasks.clear();
    };
  }
  request(payload) {
    return new Promise((resolve, reject) => {
      const requestId = ++this.sequence;
      const timer = setTimeout(() => {
        this.tasks.delete(requestId);
        reject(new Error("解析耗时过长，请先解压此资源再添加目录"));
      }, 120000);
      this.tasks.set(requestId, { resolve, reject, timer });
      this.worker.postMessage({ requestId, ...payload });
    });
  }
  async password(resourceId) {
    if (this.passwords.has(resourceId)) return this.passwords.get(resourceId);
    const saved = await storage(
      "preferences",
      "get",
      "password:" + resourceId,
    ).catch(() => "");
    this.passwords.set(resourceId, saved || "");
    return saved || "";
  }
  async setPassword(resourceId, password, remember) {
    this.passwords.set(resourceId, password);
    if (remember)
      await storage("preferences", "put", "password:" + resourceId, password);
    else
      await storage("preferences", "delete", "password:" + resourceId).catch(
        () => {},
      );
  }
  async children(entry, resourceId) {
    const kind = entry.format || extension(entry.path),
      file = await entry.read();
    if (isLibarchiveFormat(kind)) return this.otherChildren(entry, resourceId);
    const listing = await this.request({
      operation: "list",
      id: entry.id,
      file,
      kind,
    });
    return listing.entries
      .filter((item) => !isAuxiliary(item.path))
      .map((item) => ({
        id: entry.id + "!/" + item.path,
        sourceId: entry.sourceId,
        scope: entry.id,
        path: item.path,
        name: item.path.split("/").pop(),
        kind: fileKind(item.path),
        size: item.size,
        modified: entry.modified,
        guid: item.guid,
        packageId: listing.isUnity ? entry.id : undefined,
        encrypted: item.encrypted,
        read: async () =>
          this.request({
            operation: "read",
            id: entry.id,
            file,
            kind,
            path: item.path,
            password: await this.password(resourceId),
          }),
        readMeta: item.meta
          ? async () =>
              this.request({
                operation: "read",
                id: entry.id,
                file,
                kind,
                path: item.path,
                meta: true,
              })
          : undefined,
      }));
  }
  async otherChildren(entry, resourceId) {
    const open = async () => {
      if (this.otherArchives.has(entry.id))
        return this.otherArchives.get(entry.id);
      if (entry.size > 512 * 1024 * 1024)
        throw new Error("此压缩容器超过 512 MB，请先解压到目录");
      const { Archive } = await import("libarchive.js");
      Archive.init({
        workerUrl: assetUrl("vendor/libarchive/worker-bundle.js"),
      });
      const reader = await Archive.open(await entry.read());
      try {
        const password = await this.password(resourceId);
        if (password) await reader.usePassword(password);
        const items = await reader.getFilesArray();
        const record = { reader, items };
        this.otherArchives.set(entry.id, record);
        if (this.otherArchives.size > 2) {
          const key = this.otherArchives.keys().next().value;
          await this.otherArchives.get(key).reader.close();
          this.otherArchives.delete(key);
        }
        return record;
      } catch (error) {
        await reader.close();
        throw Object.assign(
          new Error("容器无法读取；如已加密，请设置此资源的密码后重试"),
          { code: "PASSWORD_REQUIRED" },
        );
      }
    };
    const record = await open();
    return record.items.flatMap(({ file, path }) => {
      let normalized;
      try {
        normalized = normalizePath(path + file.name, { archive: true });
      } catch {
        return [];
      }
      if (isAuxiliary(normalized)) return [];
      return [
        {
          id: entry.id + "!/" + normalized,
          sourceId: entry.sourceId,
          scope: entry.id,
          path: normalized,
          name: file.name,
          kind: fileKind(normalized),
          size: file.size,
          modified: entry.modified,
          read: async () => {
            if (file.size > 512 * 1024 * 1024)
              throw new Error("单个文件超过浏览器解析限制");
            const current = await open();
            const item = current.items.find(
              (item) => item.path + item.file.name === path + file.name,
            );
            return item.file.extract();
          },
        },
      ];
    });
  }
  forget(sourceId) {
    this.request({ operation: "forget", sourceId }).catch(() => {});
    for (const key of this.passwords.keys())
      if (key.startsWith(sourceId + ":")) this.passwords.delete(key);
    for (const [key, value] of this.otherArchives)
      if (key.startsWith(sourceId + ":")) {
        value.reader.close();
        this.otherArchives.delete(key);
      }
  }
}
