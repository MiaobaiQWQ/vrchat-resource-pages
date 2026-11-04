import { storage, saveCover } from '../core/storage.js';
import { extension } from '../core/paths.js';
import { friendlyError } from '../core/async.js';

export class CoverQueue extends EventTarget {
  pending = new Map();
  states = new Map();
  working = false;
  paused = false;
  constructor(catalog, images) {
    super(); this.catalog = catalog; this.images = images;
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        const resource = entry.target.resource;
        if (!this.states.has(resource.id)) this.pending.set(resource.id, resource);
      }
      this.next();
    }, { rootMargin: '180px' });
    document.addEventListener('visibilitychange', () => this.next());
  }
  observe(element, resource) { element.resource = resource; this.observer.observe(element); }
  reset() { this.observer.disconnect(); this.pending.clear(); }
  update(resource, status, extra = {}) {
    const state = { status, ...extra }; this.states.set(resource.id, state); this.dispatchEvent(new CustomEvent('cover', { detail: { resource, ...state } }));
  }
  async next() {
    if (this.working || this.paused || document.hidden) return;
    const resource = this.pending.values().next().value; if (!resource) return;
    this.pending.delete(resource.id); this.working = true;
    const epoch = this.catalog.epoch;
    try {
      this.update(resource, 'loading');
      const key = resource.id + ':' + resource.size + ':' + resource.modified + ':v1';
      const cached = await storage('covers', 'get', key).catch(() => null);
      let blob = cached?.blob;
      if (!blob) blob = await this.create(resource);
      if (epoch !== this.catalog.epoch) { this.states.delete(resource.id); return; }
      if (blob) {
        this.update(resource, 'ready', { url: URL.createObjectURL(blob), generated: resource.coverGenerated });
        if (!cached) await saveCover(key, blob).catch(() => {});
      } else this.update(resource, resource.isWorld ? 'world' : 'empty', { message: resource.isWorld ? '世界不支持预览' : '暂无可展示内容' });
    } catch (error) {
      this.update(resource, error.code === 'PASSWORD_REQUIRED' ? 'locked' : 'error', { message: friendlyError(error) });
    } finally { this.working = false; setTimeout(() => this.next(), 90); }
  }
  async create(resource) {
    await this.catalog.expand(resource, false);
    const textures = resource.entries.filter(entry => entry.kind === 'texture');
    const cover = textures.find(entry => /(?:^|[\s/_-])(?:cover|preview|thumbnail|main|base_resized)(?:[\s_.-]|$)/i.test(entry.path));
    if (cover) return this.images.thumbnail(cover);
    if (resource.kind === 'texture' && textures.length) return this.images.thumbnail(textures[0]);
    await this.catalog.expand(resource, true);
    if (resource.isWorld) return null;
    const model = this.catalog.chooseModel(resource);
    if (model) {
      const engine = await import('../viewer/engine.js');
      const loaded = await engine.loadModel(resource, model, this.catalog, this.images, { thumbnail: true });
      try { resource.coverGenerated = true; return await engine.modelCover(loaded); }
      finally { engine.releaseObject(loaded.object); }
    }
    const first = resource.entries.find(entry => entry.kind === 'texture');
    return first ? this.images.thumbnail(first) : null;
  }
  retry(resource) { const state = this.states.get(resource.id); if (state?.url) URL.revokeObjectURL(state.url); this.states.delete(resource.id); this.pending.set(resource.id, resource); this.next(); }
  forget(sourceId) {
    for (const [id, state] of this.states) if (id.startsWith(sourceId + ':')) { if (state.url) URL.revokeObjectURL(state.url); this.states.delete(id); this.pending.delete(id); }
  }
}
