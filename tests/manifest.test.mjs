import test from 'node:test'
import assert from 'node:assert/strict'
import { createExportManifest } from '../src/lib/manifest.mjs'

const source = {
  name: 'my_video.mp4', size: 12_000_000_000, duration: 3600,
  width: 1920, height: 1080, videoCodec: 'avc1.640028',
  audioCodec: 'mp4a.40.2', videoTracks: 1, audioTracks: 1,
}
const part = {
  filename: 'my_video_part_001.mp4', size: 3_990_000_000,
  start: 0, end: 1200,
  verification: {
    level: 'deep', passed: true, duration: 1200,
    checkedBytes: 3_970_000_000, videoPackets: 90000, audioPackets: 46000,
  },
}

test('split manifest retains per-segment integrity evidence but no local path', () => {
  const manifest = createExportManifest({
    source, mode: 'split', settings: { strategy: 'size', maxBytes: 4_000_000_000 },
    parts: [part], elapsedMs: 150000, generatedAt: '2026-11-23T12:00:00.000Z',
  })
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.summary.outputCount, 1)
  assert.equal(manifest.outputs[0].verification.level, 'deep')
  assert.equal(manifest.outputs[0].bytes, 3_990_000_000)
  assert.equal(manifest.task.status, 'completed')
  assert.ok(!JSON.stringify(manifest).includes('file:///'))
  assert.ok(!JSON.stringify(manifest).includes('/home/'))
})

test('manifest rejects unverified video and supports frame batches', () => {
  assert.throws(() => createExportManifest({
    source, mode: 'split', settings: {}, parts: [{ ...part, verification: { passed: false } }],
  }), /未经过校验/)
  const manifest = createExportManifest({
    source, mode: 'frames', settings: { intervalSeconds: 15 },
    images: ['frame_00.jpg', 'frame_01.jpg'], completedFrames: 2,
  })
  assert.equal(manifest.summary.outputCount, 2)
  assert.equal(manifest.summary.knownOutputBytes, null)
  assert.equal(manifest.outputs[0].filename, 'frame_00.jpg')
})
