import type { SplitResult, SplitPlanEntry } from './split'
import type { FrameSnapshot } from './frames'
import type { VideoInfo } from './media'
import type { KeyframeStatistics } from './keyframe-stats.mjs'
import type { WorkerStart, WorkerReply } from '../workers/protocol'

export type WorkerPayload =
  | Omit<Extract<WorkerStart, { mode: 'split' }>, 'kind' | 'id'>
  | Omit<Extract<WorkerStart, { mode: 'frames' }>, 'kind' | 'id'>

export interface WorkerCallbacks {
  onProgress: (fraction: number, label: string) => void
  onSegment: (result: SplitResult) => void
  onPreview: (snapshot: FrameSnapshot) => void
  onSaved?: (filename: string) => void
  onPlan?: (entries:SplitPlanEntry[])=>void
  onMissed?: (timestamp:number)=>void
  onFiltered?:(timestamp:number,reason:string)=>void
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
      // A fatal Worker error may happen before split.ts can clean up its
      // active writable. Completed and verified files are NOT in this set.
      const pending = Array.from(incomplete)
      if (payload.folder && pending.length) {
        void Promise.allSettled(pending.map(name => payload.folder!.removeEntry(name)))
          .finally(() => reject(error))
      } else {
        reject(error)
      }
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
        case 'inspected':
          break
        case 'progress':
          callbacks.onProgress(message.fraction, message.label)
          break
        case 'fileStarted':
          incomplete.add(message.filename)
          break
        case 'saved':
          incomplete.delete(message.filename)
          callbacks.onSaved?.(message.filename)
          break
        case 'plan':
          callbacks.onPlan?.(message.entries)
          break
        case 'filtered':
          callbacks.onFiltered?.(message.timestamp,message.reason)
          break
        case 'missed':
          callbacks.onMissed?.(message.timestamp)
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

/** Media metadata inspection also runs away from the UI thread. */
export function inspectWithWorker(file: File, signal: AbortSignal): Promise<VideoInfo> {
  if (signal.aborted) return Promise.reject(new DOMException('读取已取消', 'AbortError'))
  if (typeof Worker === 'undefined') return Promise.reject(new Error('当前浏览器不支持 Web Worker。'))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/media.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    function settle(callback: () => void): void {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', cancel)
      worker.terminate()
      callback()
    }
    function cancel(): void {
      settle(() => reject(new DOMException('读取已取消', 'AbortError')))
    }
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const message = event.data
      if (message.id !== 1) return
      if (message.kind === 'inspected') settle(() => resolve(message.info))
      if (message.kind === 'error') settle(() => reject(new Error(message.message)))
    }
    worker.onerror = event => settle(() => reject(new Error('读取媒体信息时处理线程异常：' + event.message)))
    worker.onmessageerror = () => settle(() => reject(new Error('媒体信息在 Worker 与网页之间传输失败。')))
    signal.addEventListener('abort', cancel, { once: true })
    try { worker.postMessage({ kind: 'inspect', id: 1, file }) }
    catch (error) { settle(() => reject(error instanceof Error ? error : new Error(String(error)))) }
    if (signal.aborted) cancel()
  })
}

/** Bounded-memory, on-demand keyframe analysis in a dedicated Worker. */
export function analyzeWithWorker(
  file: File,
  signal: AbortSignal,
  onProgress: (fraction: number, label: string) => void,
): Promise<KeyframeStatistics> {
  if (signal.aborted) return Promise.reject(new DOMException('分析已取消', 'AbortError'))
  if (typeof Worker === 'undefined') return Promise.reject(new Error('当前浏览器不支持 Web Worker。'))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/media.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    function finish(callback: () => void): void {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', cancel)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      callback()
    }
    function cancel(): void {
      finish(() => reject(new DOMException('分析已取消', 'AbortError')))
    }
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const message = event.data
      if (message.id !== 1 || settled) return
      switch (message.kind) {
        case 'progress':
          onProgress(message.fraction, message.label)
          break
        case 'analyzed':
          finish(() => resolve(message.report))
          break
        case 'error':
          finish(() => reject(message.canceled || signal.aborted
            ? new DOMException(message.message, 'AbortError')
            : new Error(message.message)))
          break
      }
    }
    worker.onerror = event => finish(() => reject(new Error('媒体体检线程运行错误：' + event.message)))
    worker.onmessageerror = () => finish(() => reject(new Error('媒体体检结果传输失败。')))
    signal.addEventListener('abort', cancel, { once: true })
    try {
      worker.postMessage({ kind: 'analyze', id: 1, file })
      if (signal.aborted) cancel()
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))))
    }
  })
}
