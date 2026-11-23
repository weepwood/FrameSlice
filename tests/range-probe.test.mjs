import test from 'node:test'
import assert from 'node:assert/strict'
import { scanByChunks } from '../src/lib/range-probe.mjs'

test('incremental range reader visits every byte without a whole-file allocation', async () => {
  const source = new Blob([new Uint8Array(9 * 1024 * 1024 + 7)])
  const result = await scanByChunks(source, { chunkBytes: 1024 * 1024 })
  assert.equal(result.logicalSize, source.size)
  assert.equal(result.bytesScanned, source.size)
  assert.equal(result.chunks, 10)
  assert.equal(result.maxChunkBytes, 1024 * 1024)
})

test('range reader aborts after a cooperative yield', async () => {
  const ctrl = new AbortController()
  const file = { size: 129 * 4096, slice(start, end) { return new Blob([new Uint8Array(end - start)]) } }
  await assert.rejects(scanByChunks(file, {
    chunkBytes: 4096, signal: ctrl.signal,
    onProgress(fraction) { if (fraction < 1) ctrl.abort() },
  }), error => error.name === 'AbortError')
})

test('invalid range parameters reject before reading', async () => {
  await assert.rejects(scanByChunks({ size: Number.MAX_SAFE_INTEGER + 1 }), /参数/)
  await assert.rejects(scanByChunks({ size: 1000 }, { chunkBytes: 1 }), /参数/)
})
