import type { ContainerInspection, ContainerOutput, ContainerOptions } from './container-ops'

type Request =
  | { kind: 'scan'; id: number; file: File }
  | { kind: 'run'; id: number; options: Omit<ContainerOptions, 'signal' | 'onProgress' | 'onFileStart' | 'onOutput'> }
  | { kind: 'cancel'; id: number }
type Reply =
  | { kind: 'scanDone'; id: number; data: ContainerInspection }
  | { kind: 'progress'; id: number; fraction: number; label: string }
  | { kind: 'started'; id: number; filename: string }
  | { kind: 'output'; id: number; result: ContainerOutput }
  | { kind: 'done'; id: number; count: number }
  | { kind: 'error'; id: number; canceled: boolean; message: string; errorName?:string }

export function scanContainerInWorker(file: File, signal: AbortSignal): Promise<ContainerInspection> {
  if (signal.aborted) return Promise.reject(new DOMException('已取消', 'AbortError'))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/container.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const close = () => {
      if (settled) return false
      settled = true
      signal.removeEventListener('abort', cancel)
      worker.terminate()
      return true
    }
    const cancel = () => { if (close()) reject(new DOMException('读取已取消', 'AbortError')) }
    worker.onmessage = (e: MessageEvent<Reply>) => {
      if (e.data.id !== 1 || settled) return
      const msg = e.data
      if (msg.kind === 'scanDone' && close()) resolve(msg.data)
      if (msg.kind === 'error' && close()) reject(new DOMException(msg.message,msg.errorName||'OperationError'))
    }
    worker.onerror = e => { if (close()) reject(new Error(e.message || '轨道分析 Worker 运行失败。')) }
    worker.onmessageerror = () => { if (close()) reject(new Error('轨道分析消息不可读取。')) }
    signal.addEventListener('abort', cancel, { once: true })
    try { worker.postMessage({ kind: 'scan', id: 1, file } satisfies Request) }
    catch (error) { if (close()) reject(error) }
    if (signal.aborted) cancel()
  })
}

export interface ContainerTaskCallbacks {
  onProgress: (fraction: number, label: string) => void
  onOutput: (result: ContainerOutput) => void
}

export function runContainerInWorker(
  options: Omit<ContainerOptions, 'signal' | 'onProgress' | 'onFileStart' | 'onOutput'>,
  signal: AbortSignal,
  callbacks: ContainerTaskCallbacks,
): Promise<number> {
  if (signal.aborted) return Promise.reject(new DOMException('已取消', 'AbortError'))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/container.worker.ts', import.meta.url), { type: 'module' })
    const incomplete = new Set<string>()
    let settled = false
    let watchdog: ReturnType<typeof setTimeout> | null = null
    const close = () => {
      if (settled) return false
      settled = true
      if (watchdog) clearTimeout(watchdog)
      signal.removeEventListener('abort', cancel)
      worker.terminate()
      return true
    }
    const fail = (error: Error) => {
      if (!close()) return
      void Promise.allSettled([...incomplete].map(name => options.folder.removeEntry(name)))
        .finally(() => reject(error))
    }
    const cancel = () => {
      if (settled || watchdog) return
      worker.postMessage({ kind: 'cancel', id: 1 } satisfies Request)
      watchdog = setTimeout(() => {
        fail(new DOMException('任务取消超时，已强制终止并尝试清理未完成文件。', 'AbortError'))
      }, 10_000)
    }
    worker.onmessage = (e: MessageEvent<Reply>) => {
      const message = e.data
      if (message.id !== 1 || settled) return
      switch (message.kind) {
        case 'progress':
          callbacks.onProgress(message.fraction, message.label)
          break
        case 'started':
          incomplete.add(message.filename)
          break
        case 'output':
          incomplete.delete(message.result.filename)
          callbacks.onOutput(message.result)
          break
        case 'done':
          if (close()) resolve(message.count)
          break
        case 'error':
          fail(message.canceled || signal.aborted ?
            new DOMException(message.message, 'AbortError') : new DOMException(message.message,message.errorName||'OperationError'))
          break
      }
    }
    worker.onerror = e => fail(new Error(e.message || '容器处理 Worker 运行失败。'))
    worker.onmessageerror = () => fail(new Error('容器处理 Worker 数据传输失败。'))
    signal.addEventListener('abort', cancel, { once: true })
    try { worker.postMessage({ kind: 'run', id: 1, options } satisfies Request) }
    catch (error) { fail(error instanceof Error ? error : new Error(String(error))) }
    if (signal.aborted) cancel()
  })
}
