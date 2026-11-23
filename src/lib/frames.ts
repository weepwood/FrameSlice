import { CanvasSink } from 'mediabunny'
import { baseName, checkCanceled, fileTime, frameTimes } from './format'
import { openInput } from './media'
import { saveBlob } from './storage'

export type FrameFormat = 'image/jpeg' | 'image/png' | 'image/webp'
export type FrameWidth = 0 | 1280 | 1920 | 3840

export interface FramePreview {
  name: string
  timestamp: number
  url: string
  blob?: Blob
}

export interface FramesOptions {
  file: File
  duration: number
  interval: number
  format: FrameFormat
  width: FrameWidth
  quality: number
  folder: FileSystemDirectoryHandle | null
  signal: AbortSignal
  onProgress: (progress: number, message: string) => void
  onPreview: (preview: FramePreview) => void
}

async function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas, format: FrameFormat, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: format, quality })
  }
  const htmlCanvas = canvas as HTMLCanvasElement
  return new Promise((resolve, reject) => {
    htmlCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法编码当前截图。')), format, quality)
  })
}

export async function extractFrames(options: FramesOptions): Promise<number> {
  const { file, duration, interval, format, width, folder, signal, onProgress, onPreview, quality } = options
  const timestamps = frameTimes(duration, interval)
  // Without a folder picker, retain only a small, bounded set of downloadable frames.
  if (!folder && timestamps.length > 30) {
    throw new Error('当前未选择保存目录。为防止浏览器内存过高，最多支持生成 30 张预览图。请使用 Chrome / Edge 并选择输出目录。')
  }
  const input = openInput(file)
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video || !(await video.canDecode())) throw new Error('当前浏览器无法解码此视频；可尝试 H.264 编码的 MP4。')
    const displayWidth = await video.getDisplayWidth()
    const actualWidth = width ? Math.min(width, displayWidth) : 0
    const sink = new CanvasSink(video, { ...(actualWidth ? { width: actualWidth } : {}), poolSize: 2 })
    const extension = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg'
    let completed = 0
    let saved = 0
    for await (const result of sink.canvasesAtTimestamps(timestamps)) {
      checkCanceled(signal)
      const timestamp = timestamps[completed]
      if (result) {
        const name = `${baseName(file.name)}_${fileTime(timestamp)}.${extension}`
        const blob = await toBlob(result.canvas, format, quality)
        if (folder) await saveBlob(folder, name, blob, signal)
        saved++
        // Preview only a bounded subset of the exported pictures.
        if (completed < 12 || completed % Math.max(1, Math.ceil(timestamps.length / 12)) === 0) {
          onPreview({ name, timestamp, url: URL.createObjectURL(blob), blob: folder ? undefined : blob })
        } else if (!folder) {
          // A folder-less job is limited to <=30, so expose all download links.
          onPreview({ name, timestamp, url: URL.createObjectURL(blob), blob })
        }
      }
      completed++
      onProgress(completed / timestamps.length, `正在截取第 ${completed} / ${timestamps.length} 张`)
    }
    return saved
  } finally {
    input.dispose()
  }
}
