import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { resolveReference } from "../core/paths.js";

export function objMaterialLibraries(text) {
  return [...text.matchAll(/^\s*mtllib\s+(.+?)\s*$/gm)].map((match) =>
    match[1].replace(/^(["'])(.*)\1$/, "$2"),
  );
}

export async function prepareObjMaterials(
  text,
  entry,
  entries,
  catalog,
  images,
  mappings,
  manager,
  warnings,
) {
  const creators = [];
  for (const reference of objMaterialLibraries(text)) {
    let target;
    try {
      target = resolveReference(reference, entry, entries);
    } catch (error) {
      warnings.push(error.message);
      continue;
    }
    if (!target) {
      warnings.push("缺少 OBJ 材质文件：" + reference);
      continue;
    }
    const file = await target.read();
    if (file.size > 8 * 1024 ** 2) {
      warnings.push("OBJ 材质文件过大，已跳过");
      continue;
    }
    const creator = new MTLLoader(manager).parse(await file.text(), "");
    for (const info of Object.values(creator.materialsInfo)) {
      for (const [key, value] of Object.entries(info)) {
        if (!/^(map_|bump$|norm$|disp$)/i.test(key)) continue;
        const path = creator.getTextureParams(value, {}).url;
        try {
          const texture = resolveReference(path, target, entries);
          if (!texture) {
            warnings.push("缺少 OBJ 贴图：" + path);
            delete info[key];
            continue;
          }
          const local = await images.url(texture);
          const alias =
            "local-mtl/" +
            encodeURIComponent(target.id) +
            "/" +
            encodeURIComponent(path);
          mappings.set(alias, local);
          info[key] = value.replace(path, alias);
        } catch (error) {
          warnings.push(error.message);
          delete info[key];
        }
      }
    }
    creators.push(creator);
  }
  if (!creators.length) return null;
  await new Promise((resolve) => {
    const previous = manager.onLoad;
    manager.onLoad = () => {
      manager.onLoad = previous;
      previous?.();
      resolve();
    };
    manager.itemStart("local-obj-materials");
    for (const creator of creators) creator.preload();
    manager.itemEnd("local-obj-materials");
  });
  return {
    create(name) {
      const creator = creators.find((item) =>
        Object.hasOwn(item.materialsInfo, name),
      );
      return creator?.create(name);
    },
  };
}
