import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTar, unityEntries } from '../src/archives/tar.js';
import { createResources } from '../src/library/catalog.js';

function tar(items) {
  const chunks = [];
  for (const [name, content] of Object.entries(items)) {
    const body = new TextEncoder().encode(content), block = new Uint8Array(512 + Math.ceil(body.length / 512) * 512);
    block.set(new TextEncoder().encode(name)); block.set(new TextEncoder().encode(body.length.toString(8).padStart(11, '0') + '\0'), 124); block[156] = 48; block.set(body, 512); chunks.push(block);
  }
  const out = new Uint8Array(chunks.reduce((n, b) => n + b.length, 1024)); let at = 0; for (const b of chunks) { out.set(b, at); at += b.length; } return out;
}
test('Unity GUID 恢复真实路径，保留 meta 引用', () => {
  const guid = 'a'.repeat(32), bytes = tar({ [guid + '/pathname']: 'Assets/🐈/名字改了.mat', [guid + '/asset']: 'material', [guid + '/asset.meta']: 'guid: xyz' });
  const entries = unityEntries(bytes, readTar(bytes)); assert.equal(entries[0].path, 'Assets/🐈/名字改了.mat'); assert.equal(entries[0].guid, guid); assert.equal(entries[0].meta.size, 9);
});
test('不允许压缩包路径穿越，损坏长度可诊断', () => {
  assert.throws(() => readTar(tar({ '../bad.txt': 'x' })), /越界/);
  assert.throws(() => readTar(tar({ 'large.txt': 'data' }).slice(0, 513)), /损坏/);
});
test('直接目录的模型、嵌套贴图及不同来源不会串组', () => {
  const files = [
    { id: 'a:1', sourceId: 'a', path: 'Kipfel/model.fbx', kind: 'model', name: 'model.fbx', size: 1, modified: 1 },
    { id: 'a:2', sourceId: 'a', path: 'Kipfel/deep/tex.png', kind: 'texture', name: 'tex.png', size: 2 },
    { id: 'b:1', sourceId: 'b', path: 'Kipfel/model.fbx', kind: 'model', name: 'model.fbx', size: 3, modified: 1 },
  ];
  const resources = createResources(files); assert.equal(resources.length, 2); assert.equal(resources[0].entries.length, 2); assert.equal(resources[1].entries.length, 1);
});
