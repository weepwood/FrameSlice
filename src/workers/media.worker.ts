import { ResumeJournal } from '../core/resume'
import { splitVideo } from '../lib/split'
import { extractFrames } from '../lib/frames'
import { inspectVideo } from '../lib/media'
import { analyzeKeyframes } from '../lib/analyze'
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
    const {kind:_,id:__,file:___,folder:____,resumeId, ...config}=message
    const resume=resumeId&&folder?await ResumeJournal.prepare(resumeId,folder,file,JSON.stringify([file.name,config]),controller.signal,n=>send({kind:'progress',id,fraction:0,label:'正在校验完整源文件 '+Math.round(n*100)+'%'})):undefined
    if (message.mode === 'split') {
      if (!folder && !message.planOnly) throw new Error('视频分割必须有授权的本地输出目录。')
      const results = await splitVideo({
        file,
        folder,
        maxBytes: message.maxBytes,
        planOnly: message.planOnly,
        resume,
        onPlan: entries=>send({kind:'plan',id,entries}),
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
        resume,
        interval: message.interval,
        startTime: message.startTime,
        endTime: message.endTime,
        format: message.format,
        width: message.width,
        quality: message.quality,
        signal: controller.signal,
        onFileStart: filename => send({ kind: 'fileStarted', id, filename }),
        onSaved: filename => send({ kind: 'saved', id, filename }),
        onMissed: timestamp=>send({kind:'missed',id,timestamp}),
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

async function analyze(id: number, file: File, controller: AbortController): Promise<void> {
  try {
    const report = await analyzeKeyframes(file, controller.signal,
      (fraction, label) => send({ kind: 'progress', id, fraction, label }))
    if (!controller.signal.aborted) send({ kind: 'analyzed', id, report })
  } catch (error) {
    send({
      kind: 'error', id,
      canceled: controller.signal.aborted || error instanceof DOMException && error.name === 'AbortError',
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
  if (message.kind !== 'start' && message.kind !== 'inspect' && message.kind !== 'analyze') return
  const controller = new AbortController()
  running = { id: message.id, controller }
  if (message.kind === 'inspect') void inspect(message.id, message.file, controller)
  else if (message.kind === 'analyze') void analyze(message.id, message.file, controller)
  else void run(message, controller)
}
