import { test } from "node:test";
import assert from "node:assert/strict";
import { createResources } from "../src/library/catalog.js";
import { fileKind } from "../src/core/formats.js";

let sequence = 0;
function entry(path, { sourceId = "src", sourceKind = "directory", sourceName = "整理结果" } = {}) {
  sequence++;
  return {
    id: `${sourceId}:${path}`,
    sourceId,
    sourceName,
    sourceKind,
    path,
    name: path.split("/").pop(),
    kind: fileKind(path),
    size: 1000 + sequence,
    modified: 1700000000000 + sequence,
  };
}

const byId = (resources) => new Map(resources.map((item) => [item.id, item]));
const paths = (resource) => resource.entries.map((item) => item.path).sort();

test("商品目录里的压缩包、封面与贴图合成一个资源", () => {
  const resources = createResources([
    entry("衣服/连衣裙与套装/套装A/pack.zip"),
    entry("衣服/连衣裙与套装/套装A/base_resized.jpg"),
    entry("衣服/连衣裙与套装/套装A/tex.png"),
  ]);
  assert.equal(resources.length, 1);
  const [resource] = resources;
  assert.equal(resource.kind, "archive");
  assert.equal(resource.name, "套装A");
  assert.equal(resource.category, "衣服");
  assert.deepEqual(paths(resource), [
    "衣服/连衣裙与套装/套装A/base_resized.jpg",
    "衣服/连衣裙与套装/套装A/pack.zip",
    "衣服/连衣裙与套装/套装A/tex.png",
  ]);
});

test("父目录成资源后，带封面的子目录不会被并进去", () => {
  const resources = createResources([
    entry("角色模型/A/pack.zip"),
    entry("角色模型/A/Variants/body.fbx"),
    entry("角色模型/A/Variants/cover.png"),
    entry("角色模型/A/Variants/pack2.zip"),
  ]);
  const map = byId(resources);
  assert.equal(resources.length, 2);
  assert.deepEqual(paths(map.get("src:角色模型/A:bundle")), ["角色模型/A/pack.zip"]);
  assert.deepEqual(paths(map.get("src:角色模型/A/Variants:bundle")), [
    "角色模型/A/Variants/body.fbx",
    "角色模型/A/Variants/cover.png",
    "角色模型/A/Variants/pack2.zip",
  ]);
});

test("没有压缩包的模型目录会连同贴图合成模型资源", () => {
  const resources = createResources([
    entry("配饰/帽子/hat.fbx"),
    entry("配饰/帽子/tex.png"),
  ]);
  assert.equal(resources.length, 1);
  assert.equal(resources[0].kind, "model");
  assert.equal(resources[0].name, "帽子");
  assert.equal(resources[0].category, "配饰");
  assert.deepEqual(paths(resources[0]), ["配饰/帽子/hat.fbx", "配饰/帽子/tex.png"]);
});

test("剩下的贴图与 Unity 文件各自成项", () => {
  const resources = createResources([
    entry("材质与贴图/贴图包/a.png"),
    entry("材质与贴图/贴图包/b.png"),
    entry("材质与贴图/材质包/body.mat"),
  ]);
  const map = byId(resources);
  assert.equal(map.get("src:材质与贴图/贴图包:textures").kind, "texture");
  assert.equal(map.get("src:材质与贴图/材质包:unity").kind, "unity");
});

test("直接添加的散装压缩包每个各成一项", () => {
  const resources = createResources([
    entry("pack.zip", { sourceId: "files", sourceKind: "files", sourceName: "下载" }),
  ]);
  assert.equal(resources.length, 1);
  assert.equal(resources[0].id, "files:pack.zip");
  assert.equal(resources[0].name, "pack");
});

test("上万文件时按目录建索引，不出现平方级耗时", () => {
  const files = [];
  for (let product = 0; product < 1000; product++) {
    const folder = `衣服/分类${product % 12}/${product}号商品`;
    for (const name of ["body.fbx", "tex.png", "base_resized.jpg", "pack.zip"])
      files.push(entry(`${folder}/${name}`));
  }
  const started = performance.now();
  const resources = createResources(files);
  const elapsed = performance.now() - started;
  assert.ok(resources.length >= 1000, "每个商品目录都应成项");
  assert.ok(elapsed < 3000, `4000 个文件解析耗时 ${elapsed.toFixed(0)} ms，疑似退化成平方级`);
});
