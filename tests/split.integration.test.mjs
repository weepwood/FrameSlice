import test from 'node:test'
import assert from 'node:assert/strict'
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
  // Tiny H.264/AAC fixture is checked in as Base64 to avoid an FFmpeg dependency.
  const encoded = await readFile(new URL('./fixtures/black-h264-aac.mp4.b64', import.meta.url), 'utf8')
  const fixture = Buffer.from(encoded.trim(), 'base64')
  assert.equal(fixture.byteLength, 2414, 'the fixture must be intact')
  const file = new File([fixture], 'sample.mp4', { type: 'video/mp4' })
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

  // Keep the temporary bundle under the project root so Node resolves mediabunny from node_modules.
  const outfile = join(process.cwd(), '.frameslice-split-smoke-' + process.pid + '.mjs')
  t.after(() => rm(outfile, { force: true }))
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

  // Exercise multiple independently playable MP4s, not just a one-part remux.
  const probe = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  let maxSeconds
  try {
    const track = await probe.getPrimaryVideoTrack()
    const sink = new EncodedPacketSink(track)
    const boundaries = []
    for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) {
      if (packet.type === 'key') boundaries.push(packet.timestamp)
    }
    const duration = await probe.computeDuration()
    const gaps = boundaries.map((time, index) =>
      (boundaries[index + 1] ?? duration) - time)
    maxSeconds = Math.max(0.5, ...gaps) + 0.01
    assert.ok(duration > maxSeconds, 'fixture should admit more than one time-based segment')
  } finally {
    probe.dispose()
  }
  const timedFolder = createMemoryDirectory()
  const timed = await splitVideo({
    file,
    maxBytes: 32 * 1024 * 1024,
    maxSeconds,
    folder: timedFolder,
    signal: new AbortController().signal,
    onProgress() {},
    onSegment() {},
  })
  assert.ok(timed.length >= 2, 'duration mode must create at least two parts')
  for (const segment of timed) {
    assert.ok(segment.end - segment.start <= maxSeconds + 0.002)
    const item = timedFolder.saved.get(segment.filename)
    assert.ok(item?.closed)
    const output = new File([item.data], segment.filename, { type: 'video/mp4' })
    const parsed = new Input({ source: new BlobSource(output), formats: ALL_FORMATS })
    try {
      assert.ok(await parsed.getPrimaryVideoTrack(), 'every part must contain video')
      assert.equal((await parsed.getAudioTracks()).length, 1, 'every part must retain audio')
      assert.ok((await parsed.computeDuration()) > 0)
    } finally {
      parsed.dispose()
    }
  }

})
