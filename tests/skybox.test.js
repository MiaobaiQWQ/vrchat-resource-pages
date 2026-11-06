import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cubeFaces,
  shouldShowSky,
  loadSkyTexture,
} from "../src/viewer/skybox.js";

const entry = (name, scope = "a") => ({
  name,
  path: "天空/" + name,
  id: scope + name,
  scope,
  kind: "texture",
});
test("六面天空盒按轴顺序匹配，区分目录、来源及同名前缀", () => {
  const faces = [
    "night_nz.png",
    "night_py.png",
    "night_nx.png",
    "night_pz.png",
    "night_px.png",
    "night_ny.png",
  ].map((name) => entry(name));
  assert.deepEqual(
    cubeFaces(faces[0], faces).map((item) => item.name),
    ["px", "nx", "py", "ny", "pz", "nz"].map(
      (axis) => "night_" + axis + ".png",
    ),
  );
  assert.equal(cubeFaces(faces[0], faces.slice(1)), null);
  assert.equal(cubeFaces(faces[0], [...faces, entry("night_px.jpg")]), null);
  assert.equal(
    cubeFaces(
      faces[0],
      faces.map((face) => ({ ...face, scope: "b" })),
    ),
    null,
  );
});
test("全景自动识别需要内容标记及2比1尺寸，普通贴图保持二维", () => {
  assert.equal(
    shouldShowSky(entry("skybox.jpg"), { width: 1024, height: 512 }, []),
    true,
  );
  assert.equal(
    shouldShowSky(entry("skybox.jpg"), { width: 512, height: 512 }, []),
    false,
  );
  assert.equal(
    shouldShowSky(entry("color.jpg"), { width: 1024, height: 512 }, []),
    false,
  );
  assert.equal(
    shouldShowSky(entry("studio.hdr"), { width: 1024, height: 512 }, []),
    true,
  );
});
test("缺失六面或尺寸不符会提示，不生成错误天空", async () => {
  const faces = ["right", "left", "up", "down", "front", "back"].map((name) =>
    entry(name + ".png"),
  );
  assert.ok(cubeFaces(faces[0], faces));
  await assert.rejects(
    loadSkyTexture(faces[0], faces, {
      decode: async () => ({ width: 128, height: 64 }),
    }),
    /正方形/,
  );
  await assert.rejects(
    loadSkyTexture(entry("bad.jpg"), [], {
      decode: async () => ({ width: 128, height: 128 }),
    }),
    /2:1/,
  );
});
