import { test } from "node:test";
import assert from "node:assert/strict";
import { readDrop } from "../src/library/drop.js";

const fileEntry = (name, content = "x") => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (resolve) => resolve(new File([content], name)),
});

const dirEntry = (name, children) => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader() {
    let served = false;
    return {
      readEntries(resolve) {
        if (served) return resolve([]);
        served = true;
        resolve(children);
      },
    };
  },
});

test("拖入目录句柄时按目录来源处理", async () => {
  const handle = { kind: "directory", name: "整理结果" };
  const result = await readDrop({
    items: [{ kind: "file", getAsFileSystemHandle: async () => handle }],
  });
  assert.deepEqual(result.directories, [handle]);
  assert.equal(result.files.length, 0);
});

test("没有目录句柄能力时递归读取文件夹", async () => {
  const entry = dirEntry("衣服", [
    fileEntry("body.fbx"),
    dirEntry("Tex", [fileEntry("skin.png")]),
  ]);
  const result = await readDrop({
    items: [
      {
        kind: "file",
        webkitGetAsEntry: () => entry,
        getAsFile: () => null,
      },
    ],
  });
  assert.equal(result.folders.length, 1);
  assert.equal(result.folders[0].root, "衣服");
  assert.deepEqual(
    result.folders[0].files.map((file) => file.webkitRelativePath),
    ["衣服/body.fbx", "衣服/Tex/skin.png"],
  );
});

test("散装文件与空拖入", async () => {
  const file = new File(["x"], "cover.png");
  const dropped = await readDrop({
    items: [{ kind: "file", getAsFile: () => file }],
  });
  assert.deepEqual(dropped.files, [file]);
  assert.deepEqual(await readDrop({ items: [] }), {
    directories: [],
    files: [],
    folders: [],
  });
});
