import { test } from "node:test";
import assert from "node:assert/strict";
import { displayKind } from "../src/library/display-scope.js";
test("展示仅保留天空盒、材质贴图、模型道具和待解析容器", () => {
  assert.equal(displayKind({ kind: "model", path: "props/chair" }), "model");
  assert.equal(
    displayKind({
      kind: "texture",
      path: "天空盒/day",
      entries: [{ kind: "texture", path: "day.png" }],
    }),
    "sky",
  );
  assert.equal(
    displayKind({
      kind: "unity",
      path: "cloth",
      entries: [{ path: "cloth.mat" }],
    }),
    "material",
  );
  for (const kind of ["audio", "video", "document", "world", "other"])
    assert.equal(displayKind({ kind, path: "resource" }), null);
  assert.equal(displayKind({ kind: "archive", path: "插件与工具/ABT" }), null);
  assert.equal(displayKind({ kind: "archive", path: "unknown" }), "archive");
});
