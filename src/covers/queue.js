import { storage, saveCover } from "../core/storage.js";
import { extension } from "../core/paths.js";
import { friendlyError } from "../core/async.js";

export class CoverQueue extends EventTarget {
  pending = new Map();
  states = new Map();
  working = false;
  paused = false;
  constructor(catalog, images) {
    super();
    this.catalog = catalog;
    this.images = images;
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            const resource = entry.target.resource;
            if (!this.states.has(resource.id))
              this.pending.set(resource.id, resource);
          }
        this.schedule(0);
      },
      { rootMargin: "180px" },
    );
    document.addEventListener("visibilitychange", () => this.schedule(0));
  }
  // 封面要解析压缩包、跑 three 渲染，很吃主线程；放到浏览器空闲时段做，滚动和输入就不会被顶住。
  schedule(delay = 90) {
    if (this.timer || this.idle) return;
    const run = () => {
      this.timer = 0;
      this.idle = 0;
      this.next();
    };
    if (typeof requestIdleCallback === "function")
      this.idle = requestIdleCallback(run, { timeout: 600 });
    else this.timer = setTimeout(run, delay);
  }
  observe(element, resource) {
    element.resource = resource;
    this.observer.observe(element);
  }
  reset() {
    this.observer.disconnect();
    this.pending.clear();
    if (this.idle) {
      cancelIdleCallback?.(this.idle);
      this.idle = 0;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = 0;
    }
  }
  update(resource, status, extra = {}) {
    const state = { status, ...extra };
    this.states.set(resource.id, state);
    this.dispatchEvent(
      new CustomEvent("cover", { detail: { resource, ...state } }),
    );
  }
  async next() {
    if (this.working || this.paused || document.hidden) return;
    const resource = this.pending.values().next().value;
    if (!resource) return;
    this.pending.delete(resource.id);
    this.working = true;
    const epoch = this.catalog.epoch;
    try {
      this.update(resource, "loading");
      // 封面缓存按“内容指纹”取，而不是按路径：目录整体改名/搬家后仍能认回原来的封面，
      // 不必把所有模型重新渲染一遍。
      const key = [
        resource.name,
        resource.size,
        resource.modified,
        resource.entries?.length || 0,
        "manual-v3",
      ].join(":");
      const cached = await storage("covers", "get", key).catch(() => null);
      if (cached) {
        resource.detectedKind = cached.kind;
        resource.coverGenerated = cached.generated;
        resource.avatars = cached.avatars || resource.avatars;
      }
      let blob = cached?.blob;
      if (!blob) blob = await this.create(resource);
      if (
        !this.catalog.resources.some(
          (item) =>
            item.id === resource.id &&
            item.size === resource.size &&
            item.modified === resource.modified,
        )
      ) {
        this.states.delete(resource.id);
        return;
      }
      if (blob) {
        this.update(resource, "ready", {
          url: URL.createObjectURL(blob),
          generated: resource.coverGenerated,
        });
        if (!cached)
          await saveCover(key, blob, {
            sourceId: resource.sourceId,
            kind: resource.detectedKind || resource.kind,
            generated: resource.coverGenerated,
            avatars: resource.avatars,
          }).catch(() => {});
      } else
        this.update(resource, resource.isWorld ? "world" : "empty", {
          message: resource.isWorld ? "世界不支持预览" : "暂无可展示内容",
        });
    } catch (error) {
      this.update(
        resource,
        error.code === "PASSWORD_REQUIRED" ? "locked" : "error",
        { message: friendlyError(error) },
      );
    } finally {
      this.working = false;
      this.schedule();
    }
  }
  async create(resource) {
    const known = resource.entries.find(
      (entry) =>
        entry.kind === "texture" &&
        /cover|preview|thumbnail|base_resized/i.test(entry.name),
    );
    if (known) return this.images.thumbnail(known);
    await this.catalog.expand(resource, false);
    const textures = resource.entries.filter(
      (entry) => entry.kind === "texture",
    );
    const cover = textures.find((entry) =>
      /(?:^|[\s/_-])(?:cover|preview|thumbnail|main|base_resized)(?:[\s_.-]|$)/i.test(
        entry.path,
      ),
    );
    if (cover) return this.images.thumbnail(cover);
    if (resource.kind === "texture" && textures.length)
      return this.images.thumbnail(textures[0]);
    const first = resource.entries.find((entry) => entry.kind === "texture");
    return first ? this.images.thumbnail(first) : null;
  }
  retry(resource) {
    const state = this.states.get(resource.id);
    if (state?.url) URL.revokeObjectURL(state.url);
    this.states.delete(resource.id);
    this.pending.set(resource.id, resource);
    this.schedule(0);
  }
  forget(sourceId) {
    for (const [id, state] of this.states)
      if (id.startsWith(sourceId + ":")) {
        if (state.url) URL.revokeObjectURL(state.url);
        this.states.delete(id);
        this.pending.delete(id);
      }
  }
}
