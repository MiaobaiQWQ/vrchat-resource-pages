import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyError } from "../src/core/async.js";

test("浏览器英文异常翻译成中文", () => {
  const typed = friendlyError(
    new TypeError("Cannot read properties of undefined (reading 'addFiles')"),
  );
  assert.match(typed, /页面状态异常/);
  assert.match(typed, /addFiles/);
  assert.doesNotMatch(typed, /Cannot read/);

  const missing = friendlyError(new ReferenceError("LocalLibrary is not defined"));
  assert.match(missing, /没有完整加载/);

  const network = friendlyError(new TypeError("Failed to fetch"));
  assert.match(network, /读取本地文件失败/);
});

test("中文提示原样保留，不重复包装", () => {
  assert.equal(
    friendlyError(new Error("主贴图未包含在所选来源中")),
    "主贴图未包含在所选来源中",
  );
});

test("已知异常类型与未知英文错误都有中文兜底", () => {
  assert.match(
    friendlyError(Object.assign(new Error("x"), { name: "NotAllowedError" })),
    /尚未获得目录读取权限/,
  );
  const unknown = friendlyError(new Error("Some unexpected failure"));
  assert.match(unknown, /操作未完成/);
  assert.doesNotMatch(unknown, /Some unexpected failure/);
  assert.equal(friendlyError(undefined), "此内容暂时无法预览");
});
