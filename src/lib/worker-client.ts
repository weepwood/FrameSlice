import type { SplitResult } from './split'
import type { FrameSnapshot } from './frames'
import type { WorkerStart, WorkerReply } from '../workers/protocol'

export type WorkerPayload =
  | Omit<Extract<WorkerStart, { mode: 'split' }>, 'kind' | 'id'>
  | Omit<Extract<WorkerStart, { mode: 'frames' }>, 'kind' | 'id'>

export interface WorkerCallbacks {
  onProgress: (fraction: number, label: string) => void
  onSegment: (result: SplitResult) => void
  onPreview: (snapshot: FrameSnapshot) => void
}

export interface JobSummary {
  count: number
  elapsedMs: number
}

/**
 * Each job owns its Worker. The input File and authorized directory handle are
 * structured-cloned; video bytes are NOT copied into a 12 GB ArrayBuffer.
 *
 * Cancel is cooperative first. A 10-second watchdog forcibly terminates a stuck
 * worker, then attempts to remove only the file currently being written.
 */
export function runWorkerJob(
  payload: WorkerPayload,
  signal: AbortSignal,
  callbacks: WorkerCallbacks,
): Promise<JobSummary> {
  if (signal.aborted) return Promise.reject(new DOMException('任务已取消', 'AbortError'))
  if (typeof Worker === 'undefined') {
    return Promise.reject(new Error('此浏览器不支持 Web Worker，请升级桌面 Chrome 或 Edge。'))
  }
  return new Promise<JobSummary>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/media.worker.ts', import.meta.url), { type: 'module' })
    const id = 1 // A new worker exists for exactly one job.
    const incomplete = new Set<string>()
    let settled = false
    let watchdog: ReturnType<typeof setTimeout> | undefined

    function close(): void {
      if (watchdog !== undefined) clearTimeout(watchdog)
      signal.removeEventListener('abort', abort)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
    }

    function fail(error: Error): void {
      if (settled) return
      settled = true
      close()
      reject(error)
    }

    function succeed(result: JobSummary): void {
      if (settled) return
      settled = true
      close()
      resolve(result)
    }

    function abort(): void {
      if (settled) return
      try {
        worker.postMessage({ kind: 'cancel', id })
      } catch {
        // Watchdog will handle an unresponsive or already closed worker.
      }
      if (watchdog !== undefined) return
      watchdog = setTimeout(() => {
        if (settled) return
        worker.terminate()
        // Never delete already verified output. If a worker is killed during a
        // writable operation, remove only outputs that never reported completion.
        const folder = payload.folder
        const pending = Array.from(incomplete)
        void Promise.allSettled(pending.map(name => folder?.removeEntry(name)))
          .finally(() => fail(new DOMException('取消操作超时，已强制停止处理。未完成的文件已尽量清理。', 'AbortError')))
      }, 10_000)
    }

    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (settled || event.data.id !== id) return
      const message = event.data
      switch (message.kind) {
        case 'progress':
          callbacks.onProgress(message.fraction, message.label)
          break
        case 'fileStarted':
          incomplete.add(message.filename)
          break
        case 'saved':
          incomplete.delete(message.filename)
          break
        case 'segment':
          incomplete.delete(message.result.filename)
          callbacks.onSegment(message.result)
          break
        case 'preview':
          callbacks.onPreview(message.snapshot)
          break
        case 'complete':
          succeed({ count: message.count, elapsedMs: message.elapsedMs })
          break
        case 'error':
          fail(message.canceled || signal.aborted
            ? new DOMException(message.message, 'AbortError')
            : new Error(message.message))
          break
      }
    }
    worker.onerror = event => {
      fail(new Error(`处理线程运行异常：${event.message || '未知错误'}`))
    }
    worker.onmessageerror = () => {
      fail(new Error('处理线程的数据传输失败，请检查浏览器对文件与目录句柄的支持。'))
    }

    signal.addEventListener('abort', abort, { once: true })
    try {
      worker.postMessage({ ...payload, kind: 'start', id } satisfies WorkerStart)
      if (signal.aborted) abort()
    } catch (error) {
      fail(new Error(`无法启动媒体处理线程：${error instanceof Error ? error.message : String(error)}`))
    }
  })
}
