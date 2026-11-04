import { storage, purgeSource } from '../core/storage.js';
import { normalizePath, isAuxiliary } from '../core/paths.js';
import { fileKind } from '../core/formats.js';
import { identifyFile } from '../core/signature.js';

export class SourceManager extends EventTarget {
  sources = new Map();
  active = new Map();

  changed(message = '') { this.dispatchEvent(new CustomEvent('change', { detail: message })); }
  async init() {
    try {
      const records = await storage('sources', 'getAll');
      for (const record of records) {
        record.files = [];
        record.status = record.handle ? await record.handle.queryPermission({ mode: 'read' }).catch(() => 'prompt') : 'reselect';
        this.sources.set(record.id, record);
      }
      this.changed();
      for (const source of this.sources.values()) if (source.status === 'granted') await this.scan(source.id);
    } catch (error) { this.changed('浏览器本地存储不可用，本次添加仍可使用：' + error.message); }
  }
  async persist(source) {
    const { files, ...record } = source;
    try { await storage('sources', 'put', source.id, record); }
    catch { this.changed('目录可在本次使用，浏览器未能保存恢复信息'); }
  }
  async addDirectory(handle, { sourceId } = {}) {
    for (const source of this.sources.values()) if (source.handle && await source.handle.isSameEntry(handle).catch(() => false)) {
      await this.scan(source.id); return source;
    }
    const source = { id: sourceId && this.sources.has(sourceId) ? sourceId : crypto.randomUUID(), name: handle.name, handle, kind: 'directory', status: 'granted', files: [], count: 0, size: 0, addedAt: Date.now() };
    this.sources.set(source.id, source); await this.persist(source); await this.scan(source.id); return source;
  }
  async addFiles(files, { folder = false, sourceId } = {}) {
    if (!files.length) return;
    const root = folder ? files[0].webkitRelativePath?.split('/')[0] || '本地文件夹' : files.length === 1 ? files[0].name : `本地文件 · ${files.length} 项`;
    const source = { id: sourceId && this.sources.has(sourceId) ? sourceId : crypto.randomUUID(), name: root, kind: folder ? 'folder-files' : 'files', status: 'session', files: [], count: 0, size: 0, addedAt: Date.now() };
    source.files = await Promise.all(files.map(async file => ({ ...this.entry(source, folder ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name, () => Promise.resolve(file), file), ...await identifyFile(file) })));
    source.files = source.files.filter(file => !isAuxiliary(file.path));
    source.count = source.files.length; source.size = source.files.reduce((n, file) => n + file.size, 0);
    this.sources.set(source.id, source); await this.persist(source); this.changed(`已添加 ${source.count} 个本地文件`); return source;
  }
  entry(source, path, read, info) {
    path = normalizePath(path);
    return { id: `${source.id}:${path}`, sourceId: source.id, sourceName: source.name, sourceKind: source.kind, scope: source.id, path, name: path.split('/').pop(), kind: fileKind(path), size: info.size, modified: info.lastModified || 0, read };
  }
  async scan(id) {
    const source = this.sources.get(id); if (!source?.handle) return;
    this.active.get(id)?.abort(); const controller = new AbortController(); this.active.set(id, controller);
    const files = [], warnings = []; source.status = 'scanning'; this.changed();
    const visit = async (handle, prefix = '') => {
      for await (const [name, child] of handle.entries()) {
        if (controller.signal.aborted) throw new DOMException('已取消读取', 'AbortError');
        const path = normalizePath(prefix + name); if (isAuxiliary(path)) continue;
        if (child.kind === 'directory') await visit(child, path + '/');
        else try { const file = await child.getFile(); files.push({ ...this.entry(source, path, () => child.getFile(), file), ...await identifyFile(file) }); }
        catch (error) { warnings.push(path + '：' + error.message); }
        if (files.length && files.length % 150 === 0) { this.dispatchEvent(new CustomEvent('progress', { detail: { id, count: files.length } })); await new Promise(resolve => setTimeout(resolve, 0)); }
      }
    };
    try {
      await visit(source.handle); if (!this.sources.has(id) || controller.signal.aborted) return;
      source.files = files; source.count = files.length; source.size = files.reduce((n, file) => n + file.size, 0); source.status = 'granted'; source.warnings = warnings; source.scannedAt = Date.now();
      await this.persist(source); this.changed(warnings.length ? `已读取目录，${warnings.length} 个文件暂不可访问` : '目录已更新');
    } catch (error) { if (error.name !== 'AbortError') { source.status = error.name === 'NotAllowedError' ? 'prompt' : 'error'; source.error = error.message; this.changed(); } }
    finally { if (this.active.get(id) === controller) this.active.delete(id); }
  }
  async restore(id) {
    const source = this.sources.get(id); if (!source?.handle) return false;
    const permission = await source.handle.requestPermission({ mode: 'read' });
    source.status = permission; if (permission === 'granted') await this.scan(id); else this.changed('未获得读取权限，可以稍后再次恢复');
    return permission === 'granted';
  }
  async remove(id) {
    this.active.get(id)?.abort(); this.active.delete(id); this.sources.delete(id);
    try { await purgeSource(id); } catch {}
    this.changed('已移除目录记录，磁盘文件未改变');
  }
  files() { return [...this.sources.values()].flatMap(source => source.files || []); }
}
