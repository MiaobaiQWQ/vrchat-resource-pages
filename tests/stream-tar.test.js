import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "fflate";
import {
  streamedUnityIndex,
  readStreamedAsset,
  scanTarStream,
} from "../src/archives/stream-tar.js";

function tar(items) {
  const chunks = [];
  for (const [name, bytes] of items) {
    const header = new Uint8Array(512);
    header.set(new TextEncoder().encode(name));
    header.set(
      new TextEncoder().encode(
        bytes.length.toString(8).padStart(11, "0") + "\0",
      ),
      124,
    );
    header[156] = 48;
    chunks.push(
      header,
      bytes,
      new Uint8Array((512 - (bytes.length % 512)) % 512),
    );
  }
  return new Blob([...chunks, new Uint8Array(1024)]);
}

test("流式 Unity 索引只保留小文件，大贴图合并按需提取", async () => {
  const guid = "a".repeat(32),
    image = Uint8Array.from({ length: 600001 }, (_, i) => i % 251);
  const raw = tar([
    [guid + "/asset", image],
    [guid + "/pathname", new TextEncoder().encode("Assets/多层🐈/texture.png")],
    [guid + "/asset.meta", new TextEncoder().encode("guid: data")],
  ]);
  const file = new Blob([gzipSync(new Uint8Array(await raw.arrayBuffer()))]);
  let scans = 0;
  const stream = file.stream.bind(file);
  file.stream = () => {
    scans++;
    return stream();
  };
  const container = await streamedUnityIndex(file, ".unitypackage");
  assert.equal(scans, 1);
  assert.equal(container.entries[0].path, "Assets/多层🐈/texture.png");
  assert.equal(container.entries[0].blob, undefined);
  const [one, two] = await Promise.all([
    readStreamedAsset(container, container.entries[0]),
    readStreamedAsset(container, container.entries[0]),
  ]);
  assert.equal(scans, 2);
  assert.equal(one.size, image.length);
  assert.equal(two, one);
  assert.deepEqual(new Uint8Array(await one.arrayBuffer()), image);
  assert.equal(
    await (
      await readStreamedAsset(container, container.entries[0].meta)
    ).text(),
    "guid: data",
  );
  assert.equal(scans, 2);
});
test("流式解析拒绝越界路径和不完整数据", async () => {
  await assert.rejects(
    () => scanTarStream(tar([["../bad", new Uint8Array(1)]])),
    /越界/,
  );
  const file = tar([["valid", new Uint8Array(700)]]);
  await assert.rejects(() => scanTarStream(file.slice(0, 600)), /不完整/);
});
