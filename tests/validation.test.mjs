import test from 'node:test'
import assert from 'node:assert/strict'
import { safeStem, computeFrameCount, createFrameTimes } from '../src/lib/validation.mjs'
import { planGroupsByDuration } from '../src/lib/planning.mjs'

test('file stems cannot escape a directory or become Windows device paths', () => {
  assert.equal(safeStem('../../secret.mp4'), '_.._secret')
  assert.equal(safeStem('CON.mp4'), '_CON')
  assert.equal(safeStem('..'), 'video')
  assert.equal(safeStem('a/b\\c.mov'), 'a_b_c')
  assert.ok(safeStem('very-long-name'.repeat(100)).length <= 80)
})

test('frame count uses a bounded, validated start/end range', () => {
  assert.equal(computeFrameCount(3600, 10, 300, 330), 3)
  assert.deepEqual(createFrameTimes(10, 2.5, 2, 9.5), [2, 4.5, 7])
  assert.throws(() => createFrameTimes(3600, 0.1), /10000/)
  assert.throws(() => computeFrameCount(100, 1, -1, 10), /无效/)
  assert.throws(() => computeFrameCount(100, 1, 30, 20), /无效/)
  assert.throws(() => computeFrameCount(100, 1, 0, Infinity), /无效/)
  assert.throws(() => computeFrameCount(100, 0, 0, 10), /无效/)
})

test('duration planner only splits at keyframes without exceeding the limit', () => {
  const groups = [0, 1, 2, 3, 4, 5].map(time => ({ time, bytes: 10 }))
  const result = planGroupsByDuration(groups, 6, 2.5)
  assert.deepEqual(result.map(g => g.map(x => x.time)), [[0, 1], [2, 3], [4, 5]])
  assert.equal(result.flat().length, groups.length)
  for (let i = 0; i < result.length; i++) {
    const next = result[i + 1]?.[0].time ?? 6
    assert.ok(next - result[i][0].time <= 2.5)
  }
})

test('duration planner rejects a too-long GOP or invalid timeline', () => {
  assert.throws(() => planGroupsByDuration([{ time: 0, bytes: 1 }, { time: 5, bytes: 1 }], 6, 2), /关键帧间隔/)
  assert.throws(() => planGroupsByDuration([{ time: 1, bytes: 1 }, { time: 1, bytes: 2 }], 4, 2), /时间戳/)
  assert.throws(() => planGroupsByDuration([], 4, 2), /关键帧/)
  assert.throws(() => planGroupsByDuration([{ time: 0, bytes: 1 }], 5, NaN), /时长/)
})
