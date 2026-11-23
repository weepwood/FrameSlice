/**
 * Real-file end-to-end MP4 stress runner.
 *
 * Usage:
 *   node scripts/stress-real.mjs "/path/to/12gb.mp4" "./outputs" 4 quick
 *   node scripts/stress-real.mjs "./sample.mp4" "./outputs" 4 deep
 *
 * This uses Node's file-backed Blob: no full-file readFile() calls.
 * It exercises the SAME split.ts + verify.ts engine as the browser, but not
 * the browser Worker / File System Access implementation.
 */
import { openAsBlob } from 'node:fs'
import { open, mkdir, rm, writeFile, stat } from 'node:fs/promises'
import { resolve, basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const [sourceArg, outputArg = './stress-outputs', sizeArg = '4', verification = 'quick'] = process.argv.slice(2)
if (!sourceArg) {
  console.error('用法: node scripts/stress-real.mjs "<视频路径>" "<输出目录>" [GB=4] [quick|deep]')
  process.exit(2)
}
if (!['quick', 'deep'].includes(verification)) throw new Error('校验级别必须为 quick 或 deep。')
const sizeGB = Number(sizeArg)
if (!Number.isFinite(sizeGB) || sizeGB < 0.032 || sizeGB > 1000) {
  throw new Error('分割大小必须是 0.032–1000 GB 之间的有效数字。')
}
const inputPath = resolve(sourceArg)
const outputParent = resolve(outputArg)
const fileInfo = await stat(inputPath)
if (!fileInfo.isFile()) throw new Error('输入路径必须是视频文件。')
const folderPath = join(outputParent, 'frameslice-' + Date.now().toString(36))
await mkdir(folderPath, { recursive: true })
const source = await openAsBlob(inputPath, { type: 'video/mp4' })
Object.defineProperty(source, 'name', { value: basename(inputPath) })

class NodeDirectory {
  constructor(path) { this.path = path }
  async getFileHandle(name) {
    if (name !== basename(name)) throw new Error('禁止输出路径包含目录分隔符。')
    const target = join(this.path, name)
    return {
      async createWritable() {
        const handle = await open(target, 'w+')
        let cursor = 0
        return new WritableStream({
          async write(chunk) {
            if (chunk?.type === 'seek') { cursor = chunk.position; return }
            if (chunk?.type === 'truncate') { await handle.truncate(chunk.size); return }
            const data = chunk?.type === 'write' ? chunk.data : chunk
            const position = chunk?.type === 'write' ? chunk.position : cursor
            if (!(data instanceof Uint8Array) || !Number.isSafeInteger(position)) {
              throw new Error('不支持的输出文件流写入参数。')
            }
            let written = 0
            while (written < data.byteLength) {
              const result = await handle.write(data, written, data.byteLength - written, position + written)
              if (result.bytesWritten <= 0) throw new Error('磁盘写入不完整。')
              written += result.bytesWritten
            }
            cursor = position + data.byteLength
          },
          async close() { await handle.close() },
          async abort() {
            await handle.close().catch(() => {})
            await rm(target, { force: true }).catch(() => {})
          },
        })
      },
      async getFile() {
        const file = await openAsBlob(target, { type: 'video/mp4' })
        Object.defineProperty(file, 'name', { value: name })
        return file
      },
    }
  }
  async removeEntry(name) {
    await rm(join(this.path, name), { force: true })
  }
}

const buildTarget = resolve('.frameslice-real-stress-' + process.pid + '.mjs')
await build({
  entryPoints: ['src/lib/split.ts'], bundle: true, format: 'esm', platform: 'node',
  packages: 'external', outfile: buildTarget,
})
let elapsedMs, results, error
let peakRSS = process.memoryUsage().rss
const monitor = setInterval(() => { peakRSS = Math.max(peakRSS, process.memoryUsage().rss) }, 500)
const controller = new AbortController()
process.on('SIGINT', () => controller.abort())
const begin = performance.now()
try {
  const { splitVideo } = await import(pathToFileURL(buildTarget).href)
  let lastPercent = -1
  results = await splitVideo({
    file: source,
    maxBytes: Math.floor(sizeGB * 1_000_000_000),
    folder: new NodeDirectory(folderPath),
    signal: controller.signal,
    verificationLevel: verification,
    onSegment(result) {
      console.log('校验完成:', result.filename, result.size, result.verification.level)
    },
    onProgress(progress, label) {
      const percent = Math.floor(progress * 100)
      if (percent >= lastPercent + 5) {
        console.log(percent + '%', label)
        lastPercent = percent
      }
    },
  })
} catch (cause) {
  error = cause instanceof Error ? cause.message : String(cause)
  throw cause
} finally {
  elapsedMs = performance.now() - begin
  clearInterval(monitor)
  peakRSS = Math.max(peakRSS, process.memoryUsage().rss)
  await rm(buildTarget, { force: true })
  const report = {
    mode: 'real-disk-node',
    limitation: '真实 MP4 解封装与校验测试；并非浏览器 Worker 的实际内存数据',
    file: basename(inputPath),
    inputBytes: fileInfo.size,
    outputFolder: folderPath,
    targetGB: sizeGB,
    verification,
    elapsedSeconds: Number((elapsedMs / 1000).toFixed(2)),
    peakRssMiB: Math.round(peakRSS / 1048576),
    error: error ?? null,
    segments: results ?? [],
  }
  await writeFile(join(folderPath, 'stress-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
