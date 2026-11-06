import { test } from "node:test";
import assert from "node:assert/strict";
import { materialPreviewData } from "../src/unity/material-preview.js";
import { surfacePreview } from "../src/viewer/surface.js";
import { releaseObject } from "../src/viewer/engine.js";
const guid = "1".repeat(32);
const mat = (body) => ({
  scope: "a",
  kind: "unity",
  path: "cloth.mat",
  read: async () =>
    new Blob(["Material:\n  m_Name: Cloth\n  m_SavedProperties:\n" + body]),
});
test("独立材质通过GUID读取主贴图，保留颜色、透明度和UV", async () => {
  const texture = { scope: "a", kind: "texture", guid, path: "renamed.png" };
  const data = await materialPreviewData(
    mat(
      `    m_TexEnvs:\n    - _MainTex:\n        m_Texture: {fileID: 2800000, guid: ${guid}, type: 3}\n        m_Scale: {x: 2, y: 3}\n        m_Offset: {x: 0.2, y: 0.4}\n    m_Floats:\n    - _Mode: 3\n    m_Colors:\n    - _Color: {r: 0.5, g: 0.7, b: 1, a: 0.4}`,
    ),
    [texture],
  );
  assert.equal(data.texture, texture);
  assert.deepEqual(data.main.scale, [2, 3]);
  assert.deepEqual(data.main.offset, [0.2, 0.4]);
  assert.equal(data.transparent, true);
  assert.equal(data.color[3], 0.4);
});
test("松散目录从meta恢复GUID，缺失贴图不误显示成纯色", async () => {
  const entry = mat(
    `    m_TexEnvs:\n    - _MainTex:\n        m_Texture: {fileID: 2800000, guid: ${guid}, type: 3}`,
  );
  await assert.rejects(materialPreviewData(entry, []), /未找到/);
  const texture = { scope: "a", kind: "texture", path: "image.png" };
  const meta = {
    scope: "a",
    path: "image.png.meta",
    size: 64,
    read: async () => new Blob(["guid: " + guid]),
  };
  assert.equal(
    (await materialPreviewData(entry, [texture, meta])).texture,
    texture,
  );
});
test("纯色材质展示保持颜色与透明度，球体和平面生成可见网格", async () => {
  const data = await materialPreviewData(
    mat("    m_Colors:\n    - _Color: {r: 0.2, g: 0.4, b: 0.8, a: 0.5}"),
    [],
  );
  for (const shape of ["sphere", "plane"]) {
    const loaded = await surfacePreview(data, {}, shape);
    const mesh = loaded.object.children[0];
    assert.ok(mesh.geometry.attributes.position.count > 0);
    assert.equal(mesh.material.opacity, 0.5);
    assert.equal(mesh.material.transparent, true);
    assert.equal(mesh.material.emissive, undefined);
    releaseObject(loaded.object);
  }
});
