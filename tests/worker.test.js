import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { zipSync, strToU8 } from 'fflate';
import { ArchiveClient } from '../src/archives/client.js';

globalThis.Worker = class {
  constructor() { this.worker = new NodeWorker(new URL('./helpers/worker.js', import.meta.url)); this.worker.on('message', data => this.onmessage?.({ data })); this.worker.on('error', error => this.onerror?.(error)); }
  postMessage(data) { this.worker.postMessage(data); }
  terminate() { return this.worker.terminate(); }
};

test('嵌套 ZIP 按需解析，材质读取复用已解出的容器', async () => {
  const inner = zipSync({ '多层/🐈 renamed.txt': strToU8('correct'), '其他/notes.txt': strToU8('notes') }), outer = zipSync({ '更深/内包.zip': inner });
  const client = new ArchiveClient(); let reads = 0;
  try {
    const entry = { id: 'source:outer', sourceId: 'source', path: '外包.zip', modified: 1, read: async () => { reads++; return new Blob([outer]); } };
    const children = await client.children(entry, entry.id); assert.equal(children[0].path, '更深/内包.zip');
    const nested = await client.children(children[0], entry.id); assert.equal(await (await nested[0].read()).text(), 'correct'); assert.equal(await (await nested[1].read()).text(), 'notes');
    assert.equal(reads, 1, '不能为每个材质反复解压上层容器');
  } finally { await client.worker.terminate(); }
});
