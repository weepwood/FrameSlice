import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { Input, BlobSource, ALL_FORMATS, EncodedPacketSink } from 'mediabunny'

function createMemoryDirectory() {
  const saved = new Map()
  return {
    saved,
    async getFileHandle(name) {
      if (!saved.has(name)) saved.set(name, { data: new Uint8Array(0), closed: false })
      const entry = saved.get(name)
      return {
        async createWritable() {
          return new WritableStream({
            write(chunk) {
              assert.equal(chunk.type, 'write')
              const end = chunk.position + chunk.data.byteLength
              if (entry.data.byteLength < end) {
                const buffer = new Uint8Array(end)
                buffer.set(entry.data)
                entry.data = buffer
              }
              entry.data.set(chunk.data, chunk.position)
            },
            close() { entry.closed = true },
          })
        },
        async getFile() {
          return new File([entry.data], name, { type: 'video/mp4' })
        },
      }
    },
    async removeEntry(name) { saved.delete(name) },
  }
}

test('MP4 splitting uses a full start packet and produces a playable container', { timeout: 60_000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'frameslice-split-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const source = join(dir, 'sample.mp4')
  try {
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=10',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100',
      '-t', '3.3', '-c:v', 'libx264', '-preset', 'ultrafast',
      '-crf', '35', '-g', '10', '-keyint_min', '10', '-sc_threshold', '0',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '32k',
      '-movflags', '+faststart', source,
    ], { timeout: 25_000 })
  } catch (error) {
    throw new Error('Unable to generate MP4 integration fixture: ' + String(error))
  }
  const file = new File([await readFile(source)], 'sample.mp4', { type: 'video/mp4' })
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack()
    assert.ok(video)
    const sink = new EncodedPacketSink(video)
    const keys = []
    for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) {
      if (packet.type === 'key') keys.push(packet)
    }
    assert.ok(keys.length >= 2, 'sample should contain multiple keyframes')
    assert.equal(keys[0].isMetadataOnly, true)
    const actualStart = await sink.getKeyPacket(keys[0].timestamp)
    assert.ok(actualStart)
    assert.equal(actualStart.isMetadataOnly, false)
    let count = 0
    for await (const packet of sink.packets(actualStart, keys[1])) {
      assert.equal(packet.isMetadataOnly, false)
      count++
    }
    assert.ok(count > 0, 'full start packet + metadata-only end boundary must work')
  } finally {
    input.dispose()
  }

  const outfile = join(dir, 'split.mjs')
  await build({
    entryPoints: ['src/lib/split.ts'],
    bundle: true, platform: 'node', format: 'esm',
    packages: 'external', outfile,
  })
  const { splitVideo } = await import(pathToFileURL(outfile).href)
  const folder = createMemoryDirectory()
  const segments = []
  const results = await splitVideo({
    file,
    maxBytes: 32 * 1024 * 1024,
    folder,
    signal: new AbortController().signal,
    onProgress() {},
    onSegment(segment) { segments.push(segment) },
  })
  assert.equal(results.length, 1)
  assert.equal(segments.length, 1)
  const name = results[0].filename
  assert.ok(folder.saved.has(name))
  assert.ok(folder.saved.get(name).closed)
  const outputFile = new File([folder.saved.get(name).data], name, { type: 'video/mp4' })
  const resultInput = new Input({ source: new BlobSource(outputFile), formats: ALL_FORMATS })
  try {
    const video = await resultInput.getPrimaryVideoTrack()
    assert.ok(video, 'output should contain a video track')
    assert.ok((await resultInput.computeDuration()) > 0, 'output should have a positive duration')
    assert.equal((await resultInput.getAudioTracks()).length, 1, 'output should retain audio')
  } finally {
    resultInput.dispose()
  }
})
