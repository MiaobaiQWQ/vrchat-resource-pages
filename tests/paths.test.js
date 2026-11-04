import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePath, resolveReference } from '../src/core/paths.js';
import { detectAvatars, fileKind } from '../src/core/formats.js';

test('中文、emoji、混合分隔符与上级引用', () => {
  assert.equal(normalizePath('衣服\\🪐 Space Cat/./贴图.png'), '衣服/🪐 Space Cat/贴图.png');
  assert.equal(normalizePath('Assets/Models/../Textures/a.png'), 'Assets/Textures/a.png');
  assert.throws(() => normalizePath('../escape.png', { archive: true }));
  assert.throws(() => normalizePath('C:/asset.png', { archive: true }));
});
test('同目录引用优先，不猜测存在歧义的重名文件', () => {
  const entries = [{ path: 'a/color.png', scope: 'one' }, { path: 'b/color.png', scope: 'one' }, { path: 'a/color.png', scope: 'two' }];
  assert.equal(resolveReference('../b/color.png', { path: 'a/model.gltf', scope: 'one' }, entries), entries[1]);
  assert.throws(() => resolveReference('color.png', { path: 'c/model.fbx', scope: 'one' }, entries), /同名/);
  assert.throws(() => resolveReference('https://example.com/file', { path: 'm.gltf', scope: 'one' }, entries), /远程/);
});
test('模型标注只匹配明确名称，不把英文单词误认成模型', () => {
  assert.deepEqual(detectAvatars('【Kipfel・Manuka】🐈 对应森羅'), ['Kipfel', 'Manuka', 'Shinra']);
  assert.deepEqual(detectAvatars('slime homemade'), []);
  assert.equal(fileKind('任意名字.FBX'), 'model');
  assert.equal(fileKind('emotes.anim'), 'unity');
});
