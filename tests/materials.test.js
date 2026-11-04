import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createMeshMaterial } from "../src/viewer/materials.js";

function geometry(withColors) {
  const shape = new THREE.BufferGeometry();
  shape.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(9), 3),
  );
  if (withColors)
    shape.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array([1, 1, 1, 1, 1, 1]), 3),
    );
  return shape;
}

// FBXLoader 把 vertexColors 写在共享材质上：一个网格带 color 图层，同材质的其它网格都会跟着开启，
// 缺少 color 属性的网格会按 (0, 0, 0, 1) 采样，整块变黑（Christmas Suit 的 11 / 19 个槽位）。
test("同一材质的网格缺少 color 图层时不启用顶点色，也不使用黑色基色", () => {
  const shared = new THREE.MeshPhongMaterial({ color: 0xcccccc });
  shared.vertexColors = true;
  const material = createMeshMaterial(shared, geometry(false));
  assert.equal(material.vertexColors, false);
  assert.notEqual(material.color.getHex(), 0x000000);
});

test("网格自身带 color 图层时保留顶点色", () => {
  const shared = new THREE.MeshPhongMaterial({ color: 0xcccccc });
  shared.vertexColors = true;
  assert.equal(createMeshMaterial(shared, geometry(true)).vertexColors, true);
});

test("有主贴图时基色为白，顶点色仍按当前网格判断", () => {
  const shared = new THREE.MeshPhongMaterial({ color: 0x000000 });
  shared.vertexColors = true;
  shared.map = new THREE.Texture();
  const plain = createMeshMaterial(shared, geometry(false)),
    painted = createMeshMaterial(shared, geometry(true));
  assert.equal(plain.color.getHex(), 0xffffff);
  assert.equal(plain.vertexColors, false);
  assert.equal(painted.vertexColors, true);
  assert.equal(painted.map, shared.map);
});
