import { basename, dirname, stem, extension, comparisonKey } from '../core/paths.js';
import { detectAvatars } from '../core/formats.js';

export function createResources(files) {
  const resources = [], folders = new Map();
  for (const file of files) {
    if (file.kind === 'archive') {
      resources.push({ id: file.id, sourceId: file.sourceId, name: stem(file.name), path: file.path, kind: 'archive', size: file.size, modified: file.modified, entries: [file], archives: [file], avatars: detectAvatars(file.path), warnings: [] });
    } else {
      const key = file.sourceId + ':' + dirname(file.path);
      if (!folders.has(key)) folders.set(key, []); folders.get(key).push(file);
    }
  }
  const assigned = new Set();
  for (const [key, entries] of folders) {
    const models = entries.filter(entry => entry.kind === 'model');
    if (!models.length) continue;
    const first = models[0], directory = dirname(first.path), prefix = directory ? directory + '/' : '';
    const related = files.filter(file => file.sourceId === first.sourceId && file.kind !== 'archive' && (file.path.startsWith(prefix)));
    related.forEach(file => assigned.add(file.id));
    resources.push({ id: key + ':model', sourceId: first.sourceId, name: directory ? basename(directory) : stem(first.name), path: directory || first.path, kind: 'model', size: related.reduce((n, e) => n + e.size, 0), modified: Math.max(...models.map(m => m.modified)), entries: related, avatars: detectAvatars(directory + ' ' + models.map(m => m.name).join(' ')), warnings: [] });
  }
  for (const [key, entries] of folders) {
    const remaining = entries.filter(entry => !assigned.has(entry.id));
    const textures = remaining.filter(entry => entry.kind === 'texture');
    if (textures.length) {
      const first = textures[0], directory = dirname(first.path);
      resources.push({ id: key + ':textures', sourceId: first.sourceId, name: directory ? basename(directory) : textures.length === 1 ? stem(first.name) : '图像与贴图', path: directory || first.path, kind: 'texture', size: textures.reduce((n, entry) => n + entry.size, 0), modified: Math.max(...textures.map(t => t.modified)), entries: remaining, avatars: detectAvatars(textures.map(e => e.path).join(' ')), warnings: [] });
    }
    for (const file of remaining.filter(entry => !['texture', 'unity'].includes(entry.kind))) {
      resources.push({ id: file.id, sourceId: file.sourceId, name: file.name, path: file.path, kind: file.kind, size: file.size, modified: file.modified, entries: [file], avatars: detectAvatars(file.path), warnings: [] });
    }
    const unity = remaining.filter(entry => entry.kind === 'unity' && extension(entry.path) !== '.meta');
    if (unity.length && !textures.length) {
      const file = unity[0]; resources.push({ id: key + ':unity', sourceId: file.sourceId, name: dirname(file.path) ? basename(dirname(file.path)) : stem(file.name), path: dirname(file.path), kind: 'unity', size: unity.reduce((n, e) => n + e.size, 0), modified: file.modified, entries: remaining, avatars: detectAvatars(file.path), warnings: [] });
    }
  }
  return resources;
}

export class Catalog extends EventTarget {
  resources = [];
  urls = new Map();
  epoch = 0;
  constructor(sources, archives) { super(); this.sources = sources; this.archives = archives; }
  rebuild() { this.epoch++; this.resources = createResources(this.sources.files()); this.dispatchEvent(new Event('change')); }
  async expand(resource, full = false) {
    const field = full ? 'fullPromise' : 'listPromise';
    if (resource[field]) return resource[field];
    resource[field] = (async () => {
      if (full) await this.expand(resource, false);
      const visited = resource.visited ||= new Set();
      const walk = async (entry, depth) => {
        if (depth > 6) { resource.warnings.push('嵌套超过 6 层，请先解压此资源'); return; }
        if (visited.has(entry.id)) return;
        if (!full && extension(entry.path) === '.unitypackage') return;
        try {
          const children = await this.archives.children(entry, resource.id); visited.add(entry.id);
          for (const child of children) {
            if (!resource.entries.some(e => e.id === child.id)) resource.entries.push(child);
            if (child.kind === 'archive') await walk(child, depth + 1);
          }
        } catch (error) { resource.warnings.push(`${entry.name}：${error.message}`); if (error.code === 'PASSWORD_REQUIRED') { resource.locked = true; throw error; } }
      };
      for (const entry of [...resource.entries].filter(e => e.kind === 'archive')) await walk(entry, 0);
      resource.models = resource.entries.filter(e => e.kind === 'model'); resource.textures = resource.entries.filter(e => e.kind === 'texture');
      if (resource.models.length) resource.detectedKind = 'model'; else if (resource.textures.length) resource.detectedKind = 'texture';
      resource.isWorld = resource.entries.some(e => e.kind === 'world') && !resource.models.length;
      if (!resource.avatars.length) resource.avatars = detectAvatars(resource.entries.map(entry => entry.path).join(' '));
      if (!resource.avatars.length) for (const entry of resource.entries.filter(e => /(?:readme|说明|対応|about)/i.test(e.name) && e.size < 100000).slice(0, 5)) {
        try { resource.avatars.push(...detectAvatars(await (await entry.read()).slice(0, 32000).text())); } catch {}
      }
      resource.avatars = [...new Set(resource.avatars)]; return resource;
    })();
    try { return await resource[field]; } catch (error) { resource[field] = null; throw error; }
  }
  async retry(resource, password, remember) {
    await this.archives.setPassword(resource.id, password, remember); resource.locked = false; resource.warnings = []; resource.listPromise = null; resource.fullPromise = null;
    return this.expand(resource, true);
  }
  async url(entry) {
    if (!this.urls.has(entry.id)) this.urls.set(entry.id, entry.read().then(blob => URL.createObjectURL(blob)).catch(error => { this.urls.delete(entry.id); throw error; }));
    return this.urls.get(entry.id);
  }
  async removeSource(id) {
    for (const [key, promise] of this.urls) if (key.startsWith(id + ':')) { URL.revokeObjectURL(await promise.catch(() => '')); this.urls.delete(key); }
    this.archives.forget(id); await this.sources.remove(id);
  }
  chooseModel(resource) {
    const models = resource.entries.filter(entry => entry.kind === 'model');
    return [...models].sort((a, b) => modelScore(b, resource.name) - modelScore(a, resource.name) || b.path.localeCompare(a.path, undefined, { numeric: true }))[0];
  }
  compatibleModels(resource) {
    if (!resource.avatars.length) return [];
    return this.resources.filter(other => other.id !== resource.id && (other.kind === 'model' || other.detectedKind === 'model') && other.avatars.some(name => resource.avatars.includes(name)));
  }
}

function modelScore(entry, title) {
  const name = comparisonKey(stem(entry.path)), target = comparisonKey(title);
  return entry.size / 1e6 + (name === target ? 2000 : name.includes(target) ? 1000 : 0) - (/sample|demo|accessor|only|mobile/i.test(entry.path) ? 300 : 0);
}
