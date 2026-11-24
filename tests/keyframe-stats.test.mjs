import test from 'node:test'
import assert from 'node:assert/strict'
import { VideoPacketStats } from '../src/lib/keyframe-stats.mjs'

const goodShape = { videoTracks: 1, audioTracks: 1, otherTracks: 0, mp4Family: true }

test('keyframe analyzer reports GOP, bitrate and bounded distribution without retaining packets', () => {
  const accumulator = new VideoPacketStats(6, 12)
  for (let index = 0; index < 6; index++) {
    accumulator.add({ timestamp: index, type: index % 2 === 0 ? 'key' : 'delta', byteLength: 100, duration:1 })
  }
  const stats = accumulator.summary(goodShape)
  assert.equal(stats.videoPackets, 6)
  assert.equal(stats.keyframeCount, 3)
  assert.equal(stats.videoBytes, 600)
  assert.equal(stats.maxGopSeconds, 2)
  assert.equal(stats.maxGopVideoBytes, 200)
  assert.equal(stats.estimatedAverageGopSeconds, 2)
  assert.equal(stats.bitrateBins.length, 12)
  assert.equal(stats.keyframeSamples.length, 3)
  assert.equal(stats.structurallyEligible, true)
  assert.deepEqual(stats.warnings, [])
})

test('keyframe analyzer warns on unsupported track shape and long GOP', () => {
  const stats = new VideoPacketStats(65)
  stats.add({ timestamp: 0, byteLength: 10, type: 'key', duration:1 })
  stats.add({ timestamp: 62, byteLength: 10, type: 'key', duration:1 })
  const report = stats.summary({ videoTracks: 1, audioTracks: 2, otherTracks: 0, mp4Family: true })
  assert.equal(report.structurallyEligible, false)
  assert.ok(report.warnings.some(message => message.includes('容器或轨道')))
  assert.ok(report.warnings.some(message => message.includes('30 秒')))
})

test('keyframe analyzer rejects malformed packets and limits samples', () => {
  const stats = new VideoPacketStats(1000)
  assert.throws(() => stats.add({ timestamp: NaN, byteLength: 1, type: 'key', duration:1 }), /异常/)
  assert.throws(() => stats.add({ timestamp: 0, byteLength: -2, type: 'key' }), /异常/)
  assert.throws(() => stats.summary(goodShape), /关键帧/)
  for (let i = 0; i < 500; i++) stats.add({ timestamp: i, byteLength: 1, type: 'key', duration:1 })
  assert.ok(stats.summary(goodShape).keyframeSamples.length <= 80)
})

test('safe GOP index excludes keyframes with leading display pictures',()=>{const s=new VideoPacketStats(2);for(const [timestamp,type,duration] of [[0,'key',.25],[.25,'delta',.125],[.5,'key',.25],[.375,'delta',.125],[.75,'delta',.25],[1,'key',1]])s.add({timestamp,type,duration,byteLength:10});const r=s.summary(goodShape);assert.deepEqual(r.keyframeIndex,[0,.5,1]);assert.deepEqual(r.safeKeyframeIndex,[0,1]);assert.ok(r.warnings.some(x=>x.includes('开放 GOP')))})
