import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import {
  Input, BlobSource, ALL_FORMATS, Conversion, Output, BufferTarget, MkvOutputFormat,
} from 'mediabunny'
import { probeMatroska } from '../src/lib/mkv-probe.mjs'
import { normalizeSubtitleText } from '../src/lib/subtitle-track.mjs'

function directoryMock() {
  const files = new Map()
  return {
    files,
    async getFileHandle(name) {
      if (!files.has(name)) files.set(name, { bytes: new Uint8Array(0), closed: false })
      const state = files.get(name)
      return {
        async createWritable() {
          return new WritableStream({
            write(chunk) {
              assert.equal(chunk.type, 'write')
              const end = chunk.position + chunk.data.byteLength
              if (state.bytes.length < end) {
                const next = new Uint8Array(end)
                next.set(state.bytes)
                state.bytes = next
              }
              state.bytes.set(chunk.data, chunk.position)
            },
            close() { state.closed = true },
          })
        },
        async getFile() { return new File([state.bytes], name) },
      }
    },
    async removeEntry(name) { files.delete(name) },
  }
}

async function fixture() {
  const source = await readFile(new URL('./fixtures/black-h264-aac.mp4.b64', import.meta.url), 'utf8')
  return new File([Buffer.from(source.trim(), 'base64')], 'sample.mp4', { type: 'video/mp4' })
}

async function createMkv(source) {
  const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS })
  const target = new BufferTarget()
  const output = new Output({ format: new MkvOutputFormat(), target })
  try {
    const conversion = await Conversion.init({ input, output, copy: { mode: 'forced' } })
    assert.ok(conversion.isValid)
    await conversion.execute()
    return new File([target.buffer], 'sample.mkv', { type: 'video/x-matroska' })
  } finally { input.dispose() }
}

test('SRT/VTT conversion validates timestamps and preserves Unicode', () => {
  const cue = '1\n00:00:01,000 --> 00:00:03,000\n中文测试\n'
  const result = normalizeSubtitleText(cue, 'srt')
  assert.equal(result.count, 1)
  assert.match(result.webvtt, /00:00:01\.000 --> 00:00:03\.000/)
  assert.match(result.webvtt, /中文测试/)
  assert.throws(() => normalizeSubtitleText('1\ninvalid --> 00:00:03,000\nhello', 'srt'), /无效/)
  assert.throws(() => normalizeSubtitleText('not a subtitle', 'vtt'), /没有找到/)
})

test('MKV probe detects source track metadata and embedded WebVTT', { timeout: 60_000 }, async () => {
  const mp4 = await fixture()
  const mkv = await createMkv(mp4)
  const probed = await probeMatroska(mkv)
  assert.equal(probed.foundTracks, true)
  assert.equal(probed.tracks.filter(t => t.kind === 'video').length, 1)
  assert.equal(probed.tracks.filter(t => t.kind === 'audio').length, 1)
})

test('real container extraction and remux retain selected video/audio only', { timeout: 75_000 }, async t => {
  const mp4 = await fixture()
  const mkv = await createMkv(mp4)
  const out = join(process.cwd(), '.frameslice-container-test-' + process.pid + '.mjs')
  t.after(() => rm(out, { force: true }))
  await build({ entryPoints: ['src/lib/container-ops.ts'], bundle: true, platform: 'node',
    format: 'esm', packages: 'external', outfile: out })
  const { inspectContainer, executeContainerTask } = await import(pathToFileURL(out).href)
  const report = await inspectContainer(mkv)
  assert.equal(report.tracks.filter(t => t.selectable).length, 2)
  const selectedIds = report.tracks.filter(t => t.selectable).map(t => t.id)
  const dir = directoryMock()
  const run = (overrides) => executeContainerTask({
    file: mkv, folder: dir, action: 'extract', format: 'mkv',
    selectedIds, acknowledgeUnlisted: true, signal: new AbortController().signal,
    onProgress() {}, onFileStart() {}, onOutput() {},
    ...overrides,
  })
  const separated = await run({})
  assert.equal(separated.length, 2)
  for (const item of separated) {
    assert.equal(item.verified, true)
    assert.ok(item.bytes > 80)
    assert.ok(dir.files.get(item.filename)?.closed)
  }
  assert.ok(separated.some(item => item.filename.endsWith('.m4a')))
  const combined = await run({ action: 'package', format: 'mp4', selectedIds })
  assert.equal(combined.length, 1)
  assert.ok(combined[0].filename.endsWith('.mp4'))
  assert.equal(combined[0].trackIds.length, 2)
  await assert.rejects(run({ acknowledgeUnlisted: false }), /确认/)
})

test('external SRT is written as MKV WebVTT track and verified', { timeout: 75_000 }, async t => {
  const mp4 = await fixture()
  const out = join(process.cwd(), '.frameslice-subtitle-test-' + process.pid + '.mjs')
  t.after(() => rm(out, { force: true }))
  await build({ entryPoints: ['src/lib/container-ops.ts'], bundle: true, platform: 'node',
    format: 'esm', packages: 'external', outfile: out })
  const { inspectContainer, executeContainerTask } = await import(pathToFileURL(out).href)
  const report = await inspectContainer(mp4)
  const dir = directoryMock()
  const results = await executeContainerTask({
    file: mp4, folder: dir, action: 'package', format: 'mkv',
    selectedIds: report.tracks.map(t => t.id),
    subtitle: new File(['1\n00:00:00,000 --> 00:00:01,000\nHello FrameSlice\n'], 'test.srt'),
    language: 'eng', acknowledgeUnlisted: true,
    signal: new AbortController().signal,
    onProgress() {}, onFileStart() {}, onOutput() {},
  })
  assert.equal(results.length, 1)
  assert.equal(results[0].subtitleTrackAdded, true)
  const item = dir.files.get(results[0].filename)
  assert.ok(item?.closed)
  const mkv = new File([item.bytes], 'out.mkv')
  const probe = await probeMatroska(mkv)
  assert.ok(probe.tracks.some(t => t.kind === 'subtitle' && t.codecId.includes('WEBVTT')))
})

 test('multiple external subtitle tracks and incompatible merge rejection', {timeout:75000},async t=>{
 const mp4=await fixture(),out=join(process.cwd(),'.frameslice-multi-'+process.pid+'.mjs');t.after(()=>rm(out,{force:true}))
 await build({entryPoints:['src/lib/container-ops.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:out})
 const {inspectContainer,executeContainerTask}=await import(pathToFileURL(out).href)
 const report=await inspectContainer(mp4),folder=directoryMock(),options={file:mp4,folder,action:'package',format:'mkv',selectedIds:report.tracks.map(t=>t.id),acknowledgeUnlisted:true,signal:new AbortController().signal,onProgress(){},onFileStart(){},onOutput(){}}
 const subtitle=(name,text)=>new File(['1\n00:00:00,000 --> 00:00:01,000\n'+text+'\n'],name)
 const result=await executeContainerTask({...options,subtitles:[{file:subtitle('en.srt','Hello'),language:'eng'},{file:subtitle('zh.srt','你好'),language:'zho'}]})
 assert.equal(result[0].subtitleTrackCount,2)
 await assert.rejects(executeContainerTask({...options,action:'merge',mergeFiles:[mp4,mp4]}),/前置包|负时间戳|时间区间|音频存在|首帧时间/)
})
