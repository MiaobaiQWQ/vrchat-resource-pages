import { extension, isAuxiliary } from '../core/paths.js';
import { fileKind } from '../core/formats.js';
import { storage } from '../core/storage.js';

export class ArchiveClient {
  worker;
  sequence = 0;
  tasks = new Map();
  passwords = new Map();
  constructor() {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      const task = this.tasks.get(data.requestId); if (!task) return; this.tasks.delete(data.requestId); clearTimeout(task.timer);
      if (data.error) task.reject(Object.assign(new Error(data.error), { code: data.code })); else task.resolve(data.result);
    };
    this.worker.onerror = () => { for (const task of this.tasks.values()) { clearTimeout(task.timer); task.reject(new Error('本地解析器停止，请刷新页面重试')); } this.tasks.clear(); };
  }
  request(payload) {
    return new Promise((resolve, reject) => {
      const requestId = ++this.sequence;
      const timer = setTimeout(() => { this.tasks.delete(requestId); reject(new Error('解析耗时过长，请先解压此资源再添加目录')); }, 120000);
      this.tasks.set(requestId, { resolve, reject, timer }); this.worker.postMessage({ requestId, ...payload });
    });
  }
  async password(resourceId) {
    if (this.passwords.has(resourceId)) return this.passwords.get(resourceId);
    const saved = await storage('preferences', 'get', 'password:' + resourceId).catch(() => '');
    this.passwords.set(resourceId, saved || ''); return saved || '';
  }
  async setPassword(resourceId, password, remember) {
    this.passwords.set(resourceId, password);
    if (remember) await storage('preferences', 'put', 'password:' + resourceId, password);
    else await storage('preferences', 'delete', 'password:' + resourceId).catch(() => {});
  }
  async children(entry, resourceId) {
    const kind = extension(entry.path), file = await entry.read();
    if (['.rar', '.7z'].includes(kind)) throw new Error(`${kind.slice(1).toUpperCase()} 暂不能在此浏览器中解析，请先解压后添加目录`);
    const listing = await this.request({ operation: 'list', id: entry.id, file, kind });
    return listing.entries.filter(item => !isAuxiliary(item.path)).map(item => ({
      id: entry.id + '!/' + item.path, sourceId: entry.sourceId, scope: entry.id, path: item.path, name: item.path.split('/').pop(), kind: fileKind(item.path), size: item.size,
      modified: entry.modified, guid: item.guid, packageId: listing.isUnity ? entry.id : undefined, encrypted: item.encrypted,
      read: async () => this.request({ operation: 'read', id: entry.id, file: await entry.read(), kind, path: item.path, password: await this.password(resourceId) }),
      readMeta: item.meta ? async () => this.request({ operation: 'read', id: entry.id, file: await entry.read(), kind, path: item.path, meta: true }) : undefined,
    }));
  }
  forget(sourceId) { for (const key of this.passwords.keys()) if (key.startsWith(sourceId + ':')) this.passwords.delete(key); }
}
