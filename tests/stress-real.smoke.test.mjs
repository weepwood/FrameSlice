import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('real-disk stress runner produces a verified MP4 without buffering entire file', { timeout: 60_000 }, async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'frameslice-real-smoke-'))
  t.after(() => rm(workspace, { recursive: true, force: true }))
  const input = join(workspace, 'fixture.mp4')
  const encoded = await readFile(new URL('./fixtures/black-h264-aac.mp4.b64', import.meta.url), 'utf8')
  await writeFile(input, Buffer.from(encoded.trim(), 'base64'))
  execFileSync(process.execPath,
    ['scripts/stress-real.mjs', input, join(workspace, 'output'), '4', 'quick'],
    { timeout: 45_000, stdio: 'pipe', maxBuffer: 1024 * 1024 },
  )
  const directories = await readdir(join(workspace, 'output'))
  assert.equal(directories.length, 1)
  const output = join(workspace, 'output', directories[0])
  const report = JSON.parse(await readFile(join(output, 'stress-report.json'), 'utf8'))
  assert.equal(report.error, null)
  assert.ok(report.segments.length >= 1)
  for (const segment of report.segments) {
    assert.ok(segment.verification.passed)
    assert.ok((await stat(join(output, segment.filename))).size > 0)
  }
})
