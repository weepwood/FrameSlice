import test from 'node:test'
import assert from 'node:assert/strict'
import { assertDuration, assertTimeline, timelineTolerance } from '../src/lib/timeline-validation.mjs'
test('duration verification rejects truncation and excess, accepts mux rounding', () => {
  assert.throws(() => assertDuration(300, 600, .1), /时长/)
  assert.throws(() => assertDuration(601, 600, .1), /时长/)
  assert.doesNotThrow(() => assertDuration(599.96, 600, .1))
  assert.throws(() => assertDuration(NaN, 600, .1))
})
test('packet-derived tolerance and track bounds catch shifted or truncated audio', () => {
  const tolerance = timelineTolerance(1/30, 1024/48000)
  assert.ok(tolerance >= .05 && tolerance < .1)
  assert.doesNotThrow(() => assertTimeline({start:.02,end:20.02},{start:0,end:20},tolerance))
  assert.throws(() => assertTimeline({start:.3,end:20.3},{start:0,end:20},tolerance), /时间戳/)
  assert.throws(() => assertTimeline({start:0,end:10},{start:0,end:20},tolerance), /时间戳/)
})
