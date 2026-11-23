/**
 * Bounded-memory ranged Blob reader. Reusable for real local Files and sparse
 * synthetic Blob implementations in stress tests. This does NOT validate MP4.
 */
export async function scanByChunks(file, {
  chunkBytes = 4 * 1024 * 1024,
  signal,
  onProgress,
} = {}) {
  if (!Number.isSafeInteger(file?.size) || file.size < 0 ||
      !Number.isSafeInteger(chunkBytes) || chunkBytes < 4096 ||
      chunkBytes > 8 * 1024 * 1024) {
    throw new Error('无效的大文件读取压力测试参数。')
  }
  const started = performance.now()
  let bytesScanned = 0
  let chunks = 0
  let maxChunkBytes = 0
  let sampleChecksum = 2166136261
  while (bytesScanned < file.size) {
    if (signal?.aborted) throw new DOMException('压力测试已取消', 'AbortError')
    const length = Math.min(chunkBytes, file.size - bytesScanned)
    const block = await file.slice(bytesScanned, bytesScanned + length).arrayBuffer()
    if (block.byteLength !== length) throw new Error('分块读取返回了错误的字节数。')
    // Probe a sparse subset. Not a cryptographic or exhaustive checksum.
    const view = new Uint8Array(block)
    sampleChecksum = Math.imul(sampleChecksum ^ view[0], 16777619) >>> 0
    sampleChecksum = Math.imul(sampleChecksum ^ view[view.length - 1], 16777619) >>> 0
    bytesScanned += block.byteLength
    chunks++
    maxChunkBytes = Math.max(maxChunkBytes, block.byteLength)
    if ((chunks & 127) === 0) {
      onProgress?.(bytesScanned / Math.max(1, file.size))
      // Yield to macrotasks so cancellation messages can be serviced.
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
  onProgress?.(1)
  const elapsedMs = Math.max(0.01, performance.now() - started)
  return {
    logicalSize: file.size, bytesScanned, chunks, maxChunkBytes,
    sampleChecksum, elapsedMs,
    mibPerSecond: bytesScanned / (1024 * 1024) / (elapsedMs / 1000),
  }
}
