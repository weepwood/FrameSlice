import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'

test('partial output is removed when a directory write fails', async (t) => {
  const outfile = join(process.cwd(), '.frameslice-storage-smoke-' + process.pid + '.mjs')
  t.after(() => rm(outfile, { force: true }))
  await build({
    entryPoints: ['src/lib/storage.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
  })
  const { saveBlob } = await import(pathToFileURL(outfile).href)
  let aborted = false
  let removed = ''
  const folder = {
    async getFileHandle() {
      return {
        async createWritable() {
          return {
            async write() { throw new Error('disk full') },
            async close() {},
            async abort() { aborted = true },
          }
        },
      }
    },
    async removeEntry(name) { removed = name },
  }
  await assert.rejects(
    saveBlob(folder, 'frame_001.jpg', new Blob(['test']), new AbortController().signal),
    /disk full/,
  )
  assert.equal(aborted, true)
  assert.equal(removed, 'frame_001.jpg')
})
