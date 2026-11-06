import { parseMaterial } from "./metadata.js";
import { extension } from "../core/paths.js";
import { mapLimit } from "../core/async.js";

export async function materialPreviewData(entry, entries) {
  const file = await entry.read();
  if (file.size > 8 * 1024 ** 2) throw new Error("材质文件过大，无法预览");
  const text = await file.text();
  if (!/^\s*Material:/m.test(text))
    throw new Error("此文件不是可读取的 Unity 文本材质");
  const data = parseMaterial(text);
  const candidates = entries.filter((item) => item.kind === "texture");
  const wanted = new Set(
    Object.values(data.slots)
      .map((slot) => slot.guid)
      .filter(Boolean),
  );
  const unresolved = () =>
    [...wanted].some((guid) => !candidates.some((item) => item.guid === guid));
  if (unresolved()) {
    const byPath = new Map(
      candidates.map((item) => [item.scope + ":" + item.path, item]),
    );
    await mapLimit(
      entries.filter(
        (item) => extension(item.path) === ".meta" && item.size < 512000,
      ),
      6,
      async (meta) => {
        const asset = byPath.get(meta.scope + ":" + meta.path.slice(0, -5));
        if (!asset || asset.guid) return;
        try {
          asset.guid = (await (await meta.read()).text()).match(
            /^guid:\s*([a-f0-9]{32})/im,
          )?.[1];
        } catch {}
      },
    );
  }
  const resolve = (guid) => {
    if (!guid) return null;
    const matches = candidates.filter((item) => item.guid === guid);
    const local = matches.filter((item) => item.scope === entry.scope);
    if (local.length === 1) return local[0];
    if (local.length > 1 || matches.length > 1)
      throw new Error("材质贴图引用存在多个候选，请保留唯一的来源或版本");
    return matches[0] || null;
  };
  const skyKeys = [
    "_RightTex",
    "_LeftTex",
    "_UpTex",
    "_DownTex",
    "_FrontTex",
    "_BackTex",
  ];
  const skyFaces = skyKeys.map((key) => resolve(data.slots[key]?.guid));
  if (
    skyKeys.some((key) => data.slots[key]?.guid) &&
    skyFaces.some((face) => !face)
  )
    throw new Error("天空盒材质缺少部分六面贴图，请添加对应的材质包");
  const main = data.main || data.slots._Tex;
  const texture = resolve(main?.guid);
  if (main?.guid && !texture)
    throw new Error("未找到材质引用的主贴图，请添加对应贴图或材质包");
  const alphaTexture = resolve(data.alpha?.guid);
  if (data.alpha?.guid && !alphaTexture)
    throw new Error("未找到材质引用的透明遮罩，请添加对应贴图或材质包");
  return {
    ...data,
    main,
    texture,
    alphaTexture,
    skyFaces: skyFaces.every(Boolean) ? skyFaces : null,
  };
}
