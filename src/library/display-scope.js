import { extension } from "../core/paths.js";
import { skyHint } from "../viewer/skybox.js";
export const displayKinds = {
  all: "所有展示类型",
  sky: "天空盒",
  material: "材质",
  texture: "贴图",
  model: "模型与道具",
  archive: "待解析资源包",
};
export function displayKind(resource) {
  if (
    resource.isWorld ||
    resource.category === "世界" ||
    /(?:^|\/)(?:插件与工具|音频|视频|动作与表情|世界)(?:\/|$)/.test(
      resource.path,
    )
  )
    return null;
  const entries = resource.entries || [];
  if ((resource.detectedKind || resource.kind) === "model") return "model";
  if (
    skyHint(resource.path) &&
    entries.some(
      (entry) => entry.kind === "texture" || extension(entry.path) === ".mat",
    )
  )
    return "sky";
  if (entries.some((entry) => extension(entry.path) === ".mat"))
    return "material";
  if ((resource.detectedKind || resource.kind) === "texture") return "texture";
  return resource.kind === "archive" ? "archive" : null;
}
