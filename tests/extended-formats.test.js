import { test } from "node:test";
import assert from "node:assert/strict";
import { writePsd, initializeCanvas } from "ag-psd";
import { photoshopPixels } from "../src/images/photoshop.js";
import { identifyFile } from "../src/core/signature.js";
import { fileKind, isLibarchiveFormat } from "../src/core/formats.js";
import { prepareObjMaterials } from "../src/viewer/obj-materials.js";
import { LoadingManager } from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { VTKLoader } from "three/addons/loaders/VTKLoader.js";
import { vtkBuffer } from "../src/viewer/extra-models.js";

initializeCanvas(
  () => {
    throw new Error("测试只读取像素");
  },
  (width, height) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  }),
);

test("PSD 与 PSB 合成图保持 RGB 与透明通道，损坏文件明确拒绝", () => {
  const pixels = new Uint8ClampedArray([240, 20, 30, 255, 40, 210, 70, 128]);
  for (const psb of [false, true]) {
    const data = writePsd(
      { width: 2, height: 1, imageData: { width: 2, height: 1, data: pixels } },
      { psb },
    );
    const decoded = photoshopPixels(data);
    assert.equal(decoded.width, 2);
    for (let i = 0; i < pixels.length; i++)
      assert.ok(
        Math.abs(decoded.pixels[i] - pixels[i]) <= (i % 4 === 3 ? 0 : 1),
      );
  }
  assert.throws(() => photoshopPixels(new ArrayBuffer(26)), /签名/);
});

test("扩展格式进入正确解析路径，重命名 PSB 与压缩签名仍可识别", async () => {
  for (const ext of ["3mf", "3ds", "amf", "vtk", "vtp", "wrl", "vrml"])
    assert.equal(fileKind("模型." + ext), "model");
  for (const ext of ["psb", "ktx", "pvr"])
    assert.equal(fileKind("贴图." + ext), "texture");
  for (const ext of ["bz2", "tbz2", "xz", "txz"]) {
    assert.equal(fileKind("包." + ext), "archive");
    assert.equal(isLibarchiveFormat("." + ext), true);
  }
  for (const [bytes, format] of [
    [[66, 90, 104, 57], ".bz2"],
    [[253, 55, 122, 88, 90, 0], ".xz"],
    [[56, 66, 80, 83, 0, 2], ".psb"],
  ])
    assert.equal(
      (await identifyFile(new File([new Uint8Array(bytes)], "改名.data")))
        .format,
      format,
    );
});

test("OBJ 读取带空格的相对 MTL，保留多材质与透明度，缺失文件给出提示", async () => {
  const entry = { path: "角色/model.obj", scope: "a" };
  const mtl = {
    id: "a:mtl",
    path: "材质/body colors.mtl",
    scope: "a",
    read: async () =>
      new Blob(["newmtl Red\nKd 1 0 0\nd 0.5\nnewmtl Blue\nKd 0 0 1"]),
  };
  const text =
    "mtllib ../材质/body colors.mtl\nmtllib missing.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nv 1 1 0\nusemtl Red\nf 1 2 3\nusemtl Blue\nf 2 4 3";
  const warnings = [];
  const materials = await prepareObjMaterials(
    text,
    entry,
    [mtl],
    {},
    {},
    new Map(),
    new LoadingManager(),
    warnings,
  );
  const model = new OBJLoader().setMaterials(materials).parse(text);
  assert.equal(model.children[0].material[0].opacity, 0.5);
  assert.equal(model.children[0].material[1].color.b, 1);
  assert.ok(warnings.some((text) => text.includes("missing.mtl")));
});

test("VTK POLYDATA 实际三角形可解析", () => {
  const text =
    "# vtk DataFile Version 3.0\ntriangle\nASCII\nDATASET POLYDATA\nPOINTS 3 float\n0 0 0  1 0 0  0 1 0\nPOLYGONS 1 4\n3 0 1 2\n";
  const geometry = new VTKLoader().parse(
    vtkBuffer(new TextEncoder().encode(text).buffer),
  );
  assert.equal(geometry.attributes.position.count, 3);
  assert.equal(geometry.index.count, 3);
});
