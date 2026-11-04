import { test } from "node:test";
import assert from "node:assert/strict";
import { readTar, unityEntries } from "../src/archives/tar.js";
import { createResources } from "../src/library/catalog.js";

function tar(items) {
  const chunks = [];
  for (const [name, content] of Object.entries(items)) {
    const body = new TextEncoder().encode(content),
      block = new Uint8Array(512 + Math.ceil(body.length / 512) * 512);
    block.set(new TextEncoder().encode(name));
    block.set(
      new TextEncoder().encode(
        body.length.toString(8).padStart(11, "0") + "\0",
      ),
      124,
    );
    block[156] = 48;
    block.set(body, 512);
    chunks.push(block);
  }
  const out = new Uint8Array(chunks.reduce((n, b) => n + b.length, 1024));
  let at = 0;
  for (const b of chunks) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}
test("Unity GUID 恢复真实路径，保留 meta 引用", () => {
  const guid = "a".repeat(32),
    bytes = tar({
      [guid + "/pathname"]: "Assets/🐈/名字改了.mat",
      [guid + "/asset"]: "material",
      [guid + "/asset.meta"]: "guid: xyz",
    });
  const entries = unityEntries(bytes, readTar(bytes));
  assert.equal(entries[0].path, "Assets/🐈/名字改了.mat");
  assert.equal(entries[0].guid, guid);
  assert.equal(entries[0].meta.size, 9);
});
test("不允许压缩包路径穿越，损坏长度可诊断", () => {
  assert.throws(() => readTar(tar({ "../bad.txt": "x" })), /越界/);
  assert.throws(
    () => readTar(tar({ "large.txt": "data" }).slice(0, 513)),
    /损坏/,
  );
});
test("直接目录的模型、嵌套贴图及不同来源不会串组", () => {
  const files = [
    {
      id: "a:1",
      sourceId: "a",
      path: "Kipfel/model.fbx",
      kind: "model",
      name: "model.fbx",
      size: 1,
      modified: 1,
    },
    {
      id: "a:2",
      sourceId: "a",
      path: "Kipfel/deep/tex.png",
      kind: "texture",
      name: "tex.png",
      size: 2,
    },
    {
      id: "b:1",
      sourceId: "b",
      path: "Kipfel/model.fbx",
      kind: "model",
      name: "model.fbx",
      size: 3,
      modified: 1,
    },
  ];
  const resources = createResources(files);
  assert.equal(resources.length, 2);
  assert.equal(resources[0].entries.length, 2);
  assert.equal(resources[1].entries.length, 1);
});
test("泳衣目录的封面与改名压缩包归为同一资源，多个版本不拆开", () => {
  const files = [
    {
      id: "a:zip",
      sourceId: "a",
      sourceName: "衣服",
      sourceKind: "directory",
      path: "泳装/泳衣/kpfel_skmz1.0.zip",
      kind: "archive",
      name: "kpfel_skmz1.0.zip",
      size: 100,
      modified: 1,
    },
    {
      id: "a:cover",
      sourceId: "a",
      sourceName: "衣服",
      sourceKind: "directory",
      path: "泳装/泳衣/random_base_resized.jpg",
      kind: "texture",
      name: "random_base_resized.jpg",
      size: 10,
      modified: 2,
    },
    {
      id: "a:other",
      sourceId: "a",
      sourceName: "衣服",
      sourceKind: "directory",
      path: "其他/套装/pack.zip",
      kind: "archive",
      name: "pack.zip",
      size: 20,
      modified: 1,
    },
  ];
  const resources = createResources(files);
  assert.equal(resources.length, 2);
  const swim = resources.find((item) => item.name === "泳衣");
  assert.equal(swim.entries.length, 2);
  assert.equal(swim.archives.length, 1);
  assert.equal(swim.category, "衣服");
  assert.equal(swim.subcategory, "泳装");
  assert.equal(swim.size, 110);
});
test("封面所在资源目录统一收纳更深的模型包与材质包", () => {
  const files = [
    {
      id: "s:cover",
      sourceId: "s",
      sourceKind: "directory",
      sourceName: "衣服",
      path: "外套/Example/random_base_resized.jpg",
      name: "random_base_resized.jpg",
      kind: "texture",
      size: 1,
      modified: 1,
    },
    {
      id: "s:model",
      sourceId: "s",
      sourceKind: "directory",
      sourceName: "衣服",
      path: "外套/Example/messy/Models/model.zip",
      name: "model.zip",
      kind: "archive",
      size: 2,
      modified: 1,
    },
    {
      id: "s:mat",
      sourceId: "s",
      sourceKind: "directory",
      sourceName: "衣服",
      path: "外套/Example/messy/Materials/material.zip",
      name: "material.zip",
      kind: "archive",
      size: 3,
      modified: 1,
    },
  ];
  const resources = createResources(files);
  assert.equal(resources.length, 1);
  assert.equal(resources[0].name, "Example");
  assert.equal(resources[0].entries.length, 3);
});
