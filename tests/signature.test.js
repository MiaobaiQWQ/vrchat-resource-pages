import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifyFile } from '../src/core/signature.js';

test('无扩展名与错误后缀的常见容器按签名识别', async () => {
  assert.deepEqual(await identifyFile(new File([new Uint8Array([80, 75, 3, 4])], '名字乱了')), { kind: 'archive', format: '.zip' });
  assert.deepEqual(await identifyFile(new File(['Kaydara FBX Binary'], '模型.data')), { kind: 'model', format: '.fbx' });
  assert.deepEqual(await identifyFile(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], '贴图')), { kind: 'texture', format: '.png' });
  assert.deepEqual(await identifyFile(new File(['unknown'], '未知')), { kind: 'other' });
});
