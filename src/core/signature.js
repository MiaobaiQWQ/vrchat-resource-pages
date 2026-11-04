import { fileKind } from "./formats.js";

export async function identifyFile(file, name = file.name) {
  const fallback = { kind: fileKind(name) };
  if (fallback.kind !== "other") return fallback;
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer()),
    text = new TextDecoder().decode(bytes);
  const starts = (signature) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (starts([80, 75, 3, 4]) || starts([80, 75, 5, 6]))
    return { kind: "archive", format: ".zip" };
  if (starts([31, 139])) return { kind: "archive", format: ".gz" };
  if (starts([55, 122, 188, 175, 39, 28]))
    return { kind: "archive", format: ".7z" };
  if (text.startsWith("Rar!")) return { kind: "archive", format: ".rar" };
  if (text.startsWith("Kaydara FBX Binary"))
    return { kind: "model", format: ".fbx" };
  if (text.startsWith("glTF")) return { kind: "model", format: ".glb" };
  if (starts([137, 80, 78, 71, 13, 10, 26, 10]))
    return { kind: "texture", format: ".png" };
  if (starts([255, 216, 255])) return { kind: "texture", format: ".jpg" };
  if (text.startsWith("8BPS")) return { kind: "texture", format: ".psd" };
  if (text.startsWith("DDS ")) return { kind: "texture", format: ".dds" };
  return fallback;
}
