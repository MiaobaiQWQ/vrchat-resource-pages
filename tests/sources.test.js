import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceManager } from '../src/library/sources.js';
import { storage } from '../src/core/storage.js';

test('多个本地来源独立添加与移除，刷新只保存元数据', async () => {
  const manager = new SourceManager();
  const a = await manager.addFiles([new File(['a'], '相同名字.fbx')]);
  const b = await manager.addFiles([new File(['b'], '相同名字.fbx')]);
  assert.equal(manager.sources.size, 2); assert.notEqual(a.files[0].id, b.files[0].id);
  await manager.remove(a.id); assert.equal(manager.files().length, 1); assert.equal(await (await manager.files()[0].read()).text(), 'b');
  const record = await storage('sources', 'get', b.id); assert.equal(record.files, undefined);
  const restored = new SourceManager(); await restored.init(); assert.equal(restored.sources.get(b.id).status, 'reselect');
  await restored.remove(b.id);
});
test('重复目录识别、递归读取与用户触发的权限恢复', async () => {
  let permission = 'granted', scans = 0;
  const child = { kind: 'file', getFile: async () => new File(['data'], '纹理.png') };
  const nested = { kind: 'directory', async *entries() { scans++; yield ['纹理.png', child]; } };
  const handle = { kind: 'directory', name: '资源', queryPermission: async () => permission, requestPermission: async () => permission = 'granted', isSameEntry: async other => other === handle, async *entries() { yield ['多层🧩', nested]; } };
  const manager = new SourceManager(); manager.persist = async () => {};
  const a = await manager.addDirectory(handle); await manager.addDirectory(handle); assert.equal(manager.sources.size, 1);
  assert.equal(manager.files()[0].path, '多层🧩/纹理.png'); assert.equal(scans, 2);
  permission = 'prompt'; await manager.restore(a.id); assert.equal(permission, 'granted');
  await manager.remove(a.id);
});
