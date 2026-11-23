import { splitVideo } from '../lib/split'
import { extractFrames } from '../lib/frames'
import { inspectVideo } from '../lib/media'
import type { WorkerCommand, WorkerReply, WorkerStart } from './protocol'

const scope = self as unknown as {
  postMessage: (message: WorkerReply) => void
  onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null
}
let running: { id: number; controller: AbortController } | null = null

function send(message: WorkerReply): void {
  scope.postMessage(message)
}

async function run(message: WorkerStart, controller: AbortController): Promise<void> {
  const { id, file, folder } = message
  const begin = performance.now()
  try {
    let count = 0
    if (message.mode === 'split') {
      if (!folder) throw new Error('视频分割必须有授权的本地输出目录。')
      const results = await splitVideo({
        file,
        folder,
        maxBytes: message.maxBytes,
        maxSeconds: message.maxSeconds,
        verificationLevel: message.verificationLevel,
        signal: controller.signal,
        onFileStart: filename => send({ kind: 'fileStarted', id, filename }),
        onProgress: (fraction, label) => send({ kind: 'progress', id, fraction, label }),
        onSegment: result => { count++; send({ kind: 'segment', id, result }) },
      })
      count = results.length
    } else {
      if (typeof OffscreenCanvas === 'undefined') {
        throw new Error('当前浏览器不支持 Worker 内抽帧所需的 OffscreenCanvas。请升级桌面 Chrome 或 Edge。')
      }
      count = await extractFrames({
        file,
        folder,
        duration: message.duration,
        interval: message.interval,
        startTime: message.startTime,
        endTime: message.endTime,
        format: message.format,
        width: message.width,
        quality: message.quality,
        signal: controller.signal,
        onFileStart: filename => send({ kind: 'fileStarted', id, filename }),
        onSaved: filename => send({ kind: 'saved', id, filename }),
        onProgress: (fraction, label) => send({ kind: 'progress', id, fraction, label }),
        onPreview: snapshot => send({ kind: 'preview', id, snapshot }),
      })
    }
    if (controller.signal.aborted) throw new DOMException('任务已取消', 'AbortError')
    send({ kind: 'complete', id, count, elapsedMs: performance.now() - begin })
  } catch (error) {
    send({
      kind: 'error',
      id,
      canceled: controller.signal.aborted || error instanceof DOMException && error.name === 'AbortError',
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    running = null
  }
}

async function inspect(id: number, file: File, controller: AbortController): Promise<void> {
  try {
    const info = await inspectVideo(file)
    if (!controller.signal.aborted) send({ kind: 'inspected', id, info })
  } catch (error) {
    send({
      kind: 'error', id, canceled: controller.signal.aborted,
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    running = null
  }
}

scope.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const message = event.data
  if (message.kind === 'cancel') {
    if (running?.id === message.id) running.controller.abort()
    return
  }
  if (running) return
  if (message.kind !== 'start' && message.kind !== 'inspect') return
  const controller = new AbortController()
  running = { id: message.id, controller }
  if (message.kind === 'inspect') void inspect(message.id, message.file, controller)
  else void run(message, controller)
}
