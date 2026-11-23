import test from 'node:test'
import assert from 'node:assert/strict'
import { planGroups } from '../src/lib/planning.mjs'

const MB = 1_000_000

test('greedy planner respects conservative size budget', () => {
  const groups = [{ bytes: 20*MB }, { bytes: 30*MB }, { bytes: 40*MB }, { bytes: 20*MB }]
  const result = planGroups(groups, 100*MB)
  assert.deepEqual(result.map(g => g.reduce((n, x) => n + x.bytes, 0)), [90*MB, 20*MB])
})

test('does not split inside a GOP', () => {
  const data = [80*MB, 80*MB, 20*MB].map(bytes => ({ bytes }))
  const result = planGroups(data, 100*MB)
  assert.equal(result.length, 3)
  assert.equal(result.flat().length, data.length)
})

test('reject impossible group', () => {
  assert.throws(() => planGroups([{ bytes: 100*MB }], 100*MB))
})

test('reject too-small limit', () => {
  assert.throws(() => planGroups([{ bytes: 1 }], 1))
})

test('12 GB of GOPs produces parts within 4 GB ceiling', () => {
  const source = Array.from({ length: 6000 }, (_, index) => ({ bytes: 2*MB, index }))
  const parts = planGroups(source, 4_000_000_000)
  assert.equal(parts.flat().length, source.length)
  for (const part of parts) {
    assert.ok(part.reduce((sum, item) => sum + item.bytes, 0) <= 4_000_000_000)
  }
  assert.equal(parts.length, 4) // Conservative margin can require a smaller final part.
})
