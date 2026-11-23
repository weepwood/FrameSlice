import { scanByChunks } from '../src/lib/range-probe.mjs'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const GB = 1_000_000_000
const gigabytes = Number(process.env.STRESS_GB ?? process.argv[2] ?? 12)
if (!Number.isInteger(gigabytes) || gigabytes < 1 || gigabytes > 64) {
  throw new Error('设置 STRESS_GB 为 1–64 之间的整数。')
}
const size = gigabytes * GB
const rssBefore = process.memoryUsage().rss
let peakRss = rssBefore
let maxSlice = 0

// No 12 GB buffer is allocated or stored. This simulates a large range-readable
// Blob and tests incremental reads, offset arithmetic and cancellation points.
const sparse = {
  size,
  slice(start, end) {
    if (!Number.isSafeInteger(start) || end > size || start < 0 || end <= start) {
      throw new Error('请求了越界的 Blob 切片。')
    }
    const length = end - start
    maxSlice = Math.max(maxSlice, length)
    return {
      async arrayBuffer() {
        const data = new Uint8Array(length)
        // Sentinel values depend on logical offsets (including > 4 GiB).
        data[0] = (Math.floor(start / GB) & 0xff)
        data[length - 1] = (Math.floor((end - 1) / GB) & 0xff)
        return data.buffer
      },
    }
  },
}

const begin = performance.now()
const timer = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss)
}, 250)
let report
try {
  report = await scanByChunks(sparse, {
    chunkBytes: 4 * 1024 * 1024,
  })
} finally {
  clearInterval(timer)
}
peakRss = Math.max(peakRss, process.memoryUsage().rss)
if (report.bytesScanned !== size || maxSlice > 4 * 1024 * 1024) {
  throw new Error('压力测试未完成全量逻辑扫描或一次读取超过分块上限。')
}
const peakDelta = peakRss - rssBefore
const threshold = 512 * 1024 * 1024
if (peakDelta > threshold) {
  throw new Error(`进程 RSS 峰值增长过大：${Math.round(peakDelta / 1048576)} MiB`)
}
const result = {
  type: 'synthetic-blob-range-read',
  caveat: '逻辑 12GB 分块测试，不代表真实磁盘速度、12GB MP4 解封装或浏览器 Worker 已实测',
  gigabytes, bytesScanned: report.bytesScanned,
  maxSlice, chunks: report.chunks,
  elapsedMs: Number((performance.now() - begin).toFixed(1)),
  effectiveMiBps: Number(report.mibPerSecond.toFixed(1)),
  rssBeforeMiB: Math.round(rssBefore / 1048576),
  peakRssMiB: Math.round(peakRss / 1048576),
  peakRssIncreaseMiB: Math.round(peakDelta / 1048576),
}
const target = resolve(process.env.STRESS_REPORT_PATH ?? 'stress-report.json')
await mkdir(dirname(target), { recursive: true })
await writeFile(target, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
