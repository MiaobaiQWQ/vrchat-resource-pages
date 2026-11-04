import { basename, comparisonKey, dirname, extension, stem } from '../core/paths.js';
import { materialKey } from '../core/formats.js';
import { mapLimit } from '../core/async.js';

const guidPattern = /guid:\s*([0-9a-f]{32})/i;
const nameOf = text => (text.match(/^\s*m_Name:\s*(.+)$/m)?.[1] || '').trim();
const section = (text, name) => text.match(new RegExp(`^  ${name}:\\s*\\n([\\s\\S]*?)(?=^  [A-Za-z_][\\w]*:|$(?![\\s\\S]))`, 'm'))?.[1] || '';

export function parseMaterial(text) {
  const textureSection = section(text, 'm_TexEnvs'), slots = {};
  for (const match of textureSection.matchAll(/^\s*-\s+(_\w+):([^]*?)(?=^\s*-\s+_\w+:|$(?![^]))/gm)) {
    const body = match[2], guid = body.match(/m_Texture:\s*\{([^}]+)\}/)?.[1].match(guidPattern)?.[1];
    const xy = (name, fallback) => { const part = body.match(new RegExp(name + ':\\s*\\{([^}]+)')); return part ? ['x', 'y'].map((axis, i) => Number(part[1].match(new RegExp(axis + ':\\s*([-+.\\deE]+)'))?.[1] ?? fallback[i])) : fallback; };
    slots[match[1]] = { guid: guid && !/^0+$/.test(guid) ? guid : null, scale: xy('m_Scale', [1, 1]), offset: xy('m_Offset', [0, 0]) };
  }
  const numbers = Object.fromEntries([...((section(text, 'm_Floats') + section(text, 'm_Ints')).matchAll(/^\s*-\s+(_\w+):\s*([-+.\deE]+)/gm))].map(match => [match[1], Number(match[2])]));
  const colors = section(text, 'm_Colors'), rgba = colors.match(/-\s*_(?:BaseColor|Color):\s*\{([^}]+)\}/)?.[1];
  const color = rgba ? ['r', 'g', 'b', 'a'].map(axis => Number(rgba.match(new RegExp(axis + ':\\s*([-+.\\deE]+)'))?.[1] ?? 1)) : [1, 1, 1, 1];
  const mode = numbers._RenderingMode ?? numbers._Mode;
  const clipped = mode === 1 || numbers._AlphaClip === 1 || numbers._AlphaClipEnable === 1 || /_ALPHATEST_ON/.test(text);
  const transparent = mode === 2 || mode === 3 || numbers._Surface === 1 || /_ALPHABLEND_ON|_ALPHAPREMULTIPLY_ON|_SURFACE_TYPE_TRANSPARENT/.test(text);
  const main = ['_MainTex', '_BaseMap', '_BaseColorMap', '_Albedo'].map(name => slots[name]).find(slot => slot?.guid);
  return { name: nameOf(text), main, alpha: slots._AlphaMask || slots._ClippingMask, color, transparent, cutoff: clipped ? Math.max(0, Math.min(1, numbers._Cutoff ?? numbers._AlphaClipThreshold ?? .5)) : 0, cull: numbers._Cull };
}

export function parsePrefab(text) {
  const nodes = new Map(), transforms = new Map(), meshFilters = new Map(), renderers = [], overrides = [];
  for (const block of text.split(/^--- !u!/m)) {
    const header = block.match(/^(\d+) &(-?\d+)/); if (!header) continue;
    const type = Number(header[1]), id = header[2], go = block.match(/m_GameObject:\s*\{fileID:\s*(-?\d+)/)?.[1];
    if (type === 1) nodes.set(id, { name: nameOf(block), active: !/^  m_IsActive:\s*0\s*$/m.test(block) });
    if (type === 4 || type === 224) transforms.set(id, { go, parent: block.match(/m_Father:\s*\{fileID:\s*(-?\d+)/)?.[1] });
    if (type === 33) meshFilters.set(go, block.match(/m_Mesh:\s*\{([^}]+)\}/)?.[1].match(guidPattern)?.[1]);
    if (type === 23 || type === 137) {
      const materials = [...section(block, 'm_Materials').matchAll(/-\s*\{([^}]+)\}/g)].map(match => match[1].match(guidPattern)?.[1] || null);
      renderers.push({ go, materials, meshGuid: block.match(/m_Mesh:\s*\{([^}]+)\}/)?.[1].match(guidPattern)?.[1], enabled: !/^  m_Enabled:\s*0\s*$/m.test(block) });
    }
    if (type === 1001) for (const change of block.split(/^    - target:/m).slice(1)) {
      if (!/propertyPath:\s*m_Materials\.Array\.data\[\d+\]/.test(change)) continue;
      const target = change.match(/^\s*\{([^}]+)\}/)?.[1].match(guidPattern)?.[1], material = change.match(/objectReference:\s*\{([^}]+)\}/)?.[1].match(guidPattern)?.[1];
      if (target && material) overrides.push({ target, material });
    }
  }
  const transformByObject = new Map([...transforms.values()].map(item => [item.go, item]));
  return { overrides, renderers: renderers.flatMap(renderer => {
    const node = nodes.get(renderer.go); if (!node) return [];
    let active = node.active && renderer.enabled, transform = transformByObject.get(renderer.go); const seen = new Set();
    while (transform?.parent && !seen.has(transform.parent)) { seen.add(transform.parent); transform = transforms.get(transform.parent); if (transform && nodes.get(transform.go)?.active === false) active = false; }
    return [{ ...renderer, meshGuid: renderer.meshGuid || meshFilters.get(renderer.go), name: node.name, active }];
  }) };
}

export function parseRemaps(text) {
  const output = new Map();
  for (const item of section(text, 'externalObjects').split(/^  - first:/m)) {
    const name = item.match(/^\s+name:\s*(.+)$/m)?.[1], target = item.match(/second:\s*\{([^}]+)\}/)?.[1].match(guidPattern)?.[1];
    if (/type:\s*UnityEngine:Material/.test(item) && name && target) output.set(materialKey(name), target);
  }
  return output;
}

export async function buildBindings(resource, model) {
  const entries = resource.references || resource.entries, byGuid = new Map(), byName = new Map(), materialData = new Map(), rendererData = new Map();
  const scoped = [...entries].sort((a, b) => Number(b.scope === model.scope) - Number(a.scope === model.scope));
  for (const entry of scoped) if (entry.guid && !byGuid.has(entry.guid)) byGuid.set(entry.guid, entry);
  const looseMeta = entries.filter(entry => extension(entry.path) === '.meta' && entry.size < 512000);
  await mapLimit(looseMeta, 6, async entry => { try { const guid = (await (await entry.read()).text()).match(/^guid:\s*(\w{32})/m)?.[1]; const asset = entries.find(asset => asset.scope === entry.scope && asset.path === entry.path.slice(0, -5)); if (guid && asset && !byGuid.has(guid)) { byGuid.set(guid, asset); asset.guid ||= guid; } } catch {} });
  await mapLimit(entries.filter(entry => extension(entry.path) === '.mat'), 5, async entry => {
    try {
      const meta = parseMaterial(await (await entry.read()).text());
      const data = { ...meta, path: entry.path, texture: byGuid.get(meta.main?.guid), alphaTexture: byGuid.get(meta.alpha?.guid), scale: meta.main?.scale || [1, 1], offset: meta.main?.offset || [0, 0] };
      if (entry.guid) materialData.set(entry.guid, data);
      const key = materialKey(meta.name || stem(entry.path)); if (!byName.has(key)) byName.set(key, data);
    } catch {}
  });
  let modelMeta = '';
  try {
    if (model.readMeta) modelMeta = await (await model.readMeta()).text();
    else { const entry = looseMeta.find(entry => entry.path === model.path + '.meta'); if (entry) modelMeta = await (await entry.read()).text(); }
  } catch {}
  const modelGuid = model.guid || modelMeta.match(/^guid:\s*(\w{32})/m)?.[1];
  for (const [name, guid] of parseRemaps(modelMeta)) if (materialData.has(guid)) byName.set(name, materialData.get(guid));
  const modelName = comparisonKey(stem(model.path)), prefabs = entries.filter(entry => extension(entry.path) === '.prefab').sort((a, b) => {
    const score = entry => (comparisonKey(stem(entry.path)).includes(modelName) ? 1000 : 0) + (entry.scope === model.scope ? 100 : 0) - (/sample|demo|afk/i.test(entry.path) ? 500 : 0);
    return score(b) - score(a) || a.path.localeCompare(b.path);
  });
  let origin = '', variants = [];
  for (const prefab of prefabs) {
    const parsed = parsePrefab(await (await prefab.read()).text());
    const renderers = parsed.renderers.filter(renderer => modelGuid && renderer.meshGuid === modelGuid);
    if (renderers.length) {
      for (const renderer of renderers) rendererData.set(comparisonKey(renderer.name), { active: renderer.active, slots: renderer.materials.map(guid => materialData.get(guid) || null) });
      origin = prefab.path; break;
    }
    if (!variants.length && modelGuid) {
      const guids = [...new Set(parsed.overrides.filter(override => override.target === modelGuid).map(override => override.material))];
      variants = guids.filter(guid => materialData.has(guid)).map(guid => ({ folder: comparisonKey(basename(dirname(materialData.get(guid).path))), data: materialData.get(guid) }));
      if (variants.length) origin = prefab.path;
    }
  }
  return {
    origin,
    visibility: name => rendererData.get(comparisonKey(name))?.active,
    resolve(name, material, slot, used) {
      const binding = rendererData.get(comparisonKey(name));
      if (binding) {
        if (used.length && used.length <= binding.slots.length && used.at(-1) >= binding.slots.length && used.includes(slot)) slot = used.indexOf(slot);
        if (binding.slots[slot]) return binding.slots[slot];
      }
      const key = comparisonKey(name), matching = variants.filter(variant => variant.folder.length > 2 && (key.includes(variant.folder) || key.length > 2 && variant.folder.includes(key)));
      if (matching.length === 1) return matching[0].data;
      return byName.get(materialKey(material));
    },
  };
}

export function describeUnity(text, name) {
  if (/\.anim$/i.test(name)) return { type: '动画 / 表情', details: [/m_Legacy:\s*1/.test(text) ? '旧版动画' : 'AnimationClip', `帧率 ${text.match(/m_SampleRate:\s*([\d.]+)/)?.[1] || '未标注'}`, `${[...text.matchAll(/(?:attribute:|propertyName:)\s*blendShape\./g)].length} 个表情曲线引用`] };
  if (/\.controller$/i.test(name)) return { type: '动画控制器', details: [`${[...text.matchAll(/AnimatorState:/g)].length} 个状态`, `${[...text.matchAll(/m_AnimatorParameters:/g)].length} 组参数配置`] };
  if (/\.prefab$/i.test(name)) { const data = parsePrefab(text); return { type: '预制体', details: [`${data.renderers.length} 个网格渲染器`, `${data.overrides.length} 个材质覆盖`] }; }
  if (/\.mat$/i.test(name)) { const data = parseMaterial(text); return { type: '材质', details: [data.name || stem(name), data.main?.guid ? '包含主贴图引用' : '纯色或外部着色材质', data.transparent ? '透明混合' : data.cutoff ? '透明裁切' : '不透明'] }; }
  return { type: 'Unity 资源', details: [nameOf(text) || name] };
}
