import { test } from "node:test";
import assert from "node:assert/strict";
import { randomTextureOptions } from "../src/viewer/texture-options.js";

test("随机配色保留同系列与数据贴图边界", () => {
  const textures = [
    "skmz_tex_navy.png",
    "skmz_tex_white.png",
    "skmz_tex_Normal.png",
    "base_resized.jpg",
    "hair_blue.png",
  ].map((name) => ({ kind: "texture", name }));
  assert.deepEqual(
    randomTextureOptions(textures, "skmz_tex_navy.png", "material").map(
      (item) => item.name,
    ),
    ["skmz_tex_navy.png", "skmz_tex_white.png"],
  );
  assert.deepEqual(
    randomTextureOptions(textures, "unknown.png", "unknown"),
    [],
  );
});
