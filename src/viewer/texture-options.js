import { stem, comparisonKey } from "../core/paths.js";
import { isColorTexture } from "../core/formats.js";

export function textureFamily(name) {
  return comparisonKey(
    stem(name)
      .toLowerCase()
      .replace(
        /(?:[\s_-](?:\d+|black|white|navy|red|pink|blue|green|brown|gray|grey|blond|blonde|silver|gold|dark|light|type\d+))+$/g,
        "",
      ),
  );
}

export function randomTextureOptions(entries, currentName, materialName) {
  const usable = entries.filter(
    (entry) =>
      entry.kind === "texture" &&
      isColorTexture(entry.name) &&
      !/cover|preview|thumbnail|base_resized|uvguide|说明|instructions|license/i.test(
        entry.name,
      ),
  );
  const family = textureFamily(currentName || "");
  const sameFamily =
    family.length > 3
      ? usable.filter((entry) => textureFamily(entry.name) === family)
      : [];
  if (sameFamily.length) return sameFamily;
  const key = comparisonKey(materialName || "");
  const byMaterial =
    key.length > 3
      ? usable.filter((entry) => comparisonKey(stem(entry.name)).includes(key))
      : [];
  return byMaterial.length ? byMaterial : usable.length === 1 ? usable : [];
}
