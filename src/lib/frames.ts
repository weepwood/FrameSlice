import type { ResumeJournal } from '../core/resume'
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

/** Serializable preview payload produced by the worker; object URLs belong to the UI. */
export interface FrameSnapshot {
  name: string
  timestamp: number
  blob: Blob
}

export interface FramesOptions {
  file: File
  duration: number
  interval: number
  startTime: number
  endTime: number
  format: FrameFormat
  width: FrameWidth
  quality: number
  folder: FileSystemDirectoryHandle | null
  signal: AbortSignal
  onProgress: (progress: number, message: string) => void
  onPreview: (preview: FrameSnapshot) => void
  onSaved?: (filename: string) => void
  onFileStart?: (filename: string) => void
  onMissed?: (timestamp: number) => void
  resume?:ResumeJournal
}

async function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas, format: FrameFormat, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: format, quality })
    if (blob.type !== format) throw new Error('浏览器不支持选定的截图编码格式，请选择 JPEG 或 PNG。')
    return blob
  }
  const htmlCanvas = canvas as HTMLCanvasElement
  return new Promise((resolve, reject) => {
    htmlCanvas.toBlob((blob) => blob && blob.type === format ? resolve(blob) : reject(new Error('无法使用选定格式编码截图，请选择 JPEG 或 PNG。')), format, quality)
  })
}

export async function extractFrames(options: FramesOptions): Promise<number> {
  const { file, duration, interval, startTime, endTime, format, width, folder, signal, onProgress, onPreview, onSaved, onFileStart, quality } = options
  checkCanceled(signal)
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(format) ||
      ![0, 1280, 1920, 3840].includes(width) ||
      !Number.isFinite(quality) || quality < 0.1 || quality > 1) {
    throw new Error('截图格式、分辨率或质量参数无效。')
  }
  let timestamps = frameTimes(duration, interval, startTime, endTime)
  // Without a folder picker, retain only a small, bounded set of downloadable frames.
  if (!folder && timestamps.length > 30) {
    throw new Error('当前未选择保存目录。为防止浏览器内存过高，最多支持生成 30 张预览图。请使用 Chrome / Edge 并选择输出目录。')
  }
  const input = openInput(file)
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video || !(await video.canDecode())) throw new Error('当前浏览器无法解码此视频；可尝试 H.264 编码的 MP4。')
    const [displayWidth, displayHeight] = await Promise.all([
      video.getDisplayWidth(), video.getDisplayHeight(),
    ])
    if (!Number.isFinite(displayWidth) || !Number.isFinite(displayHeight) ||
        displayWidth <= 0 || displayHeight <= 0) {
      throw new Error('视频分辨率无效，无法安全生成图片。')
    }
    const actualWidth = width ? Math.min(width, displayWidth) : displayWidth
    const actualHeight = Math.ceil(displayHeight * actualWidth / displayWidth)
    if (actualWidth * actualHeight > 40_000_000) {
      throw new Error('输出画面超过 4000 万像素，请降低截图分辨率。')
    }
    const sink = new CanvasSink(video, { width: actualWidth, poolSize: 2 })
    const extension = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg'
    let completed = 0
    let saved = 0
    const nameFor=(timestamp:number)=>`${baseName(file.name)}_${fileTime(timestamp)}.${extension}`
    if(options.resume){const remaining:number[]=[];for(const t of timestamps){checkCanceled(signal);const name=nameFor(t);if(await options.resume.previous(name)){saved++;onSaved?.(name)}else remaining.push(t)}timestamps=remaining;if(!timestamps.length){onProgress(1,'所有历史图片均已验证');return saved}}
    const missed:number[]=[]
    const save=async (canvas: HTMLCanvasElement | OffscreenCanvas,timestamp:number,index:number) => {
      const name = nameFor(timestamp)
      const blob=await toBlob(canvas,format,quality)
      if(folder){onFileStart?.(name);await saveBlob(folder,name,blob,signal);await options.resume?.commit(name);onSaved?.(name)}
      saved++
      if(!folder||index<12||index%Math.max(1,Math.ceil(timestamps.length/12))===0)onPreview({name,timestamp,blob})
    }
    for await(const result of sink.canvasesAtTimestamps(timestamps)){
      checkCanceled(signal)
      const timestamp=timestamps[completed]
      if(timestamp===undefined)throw Error('解码器返回了多余的抽帧结果')
      if(result)await save(result.canvas,timestamp,completed)
      else missed.push(timestamp)
      completed++
      onProgress(.9*completed/timestamps.length,`正在截取第 ${completed} / ${timestamps.length} 张`)
    }
    missed.push(...timestamps.slice(completed))
    if(missed.length){
      const retrySink=new CanvasSink(video,{width:actualWidth,poolSize:2})
      let i=0
      for await(const result of retrySink.canvasesAtTimestamps(missed)){
        checkCanceled(signal)
        const time=missed[i]
        if(time===undefined)throw Error('解码器返回了多余的重试结果')
        if(result)await save(result.canvas,time,timestamps.indexOf(time))
        else options.onMissed?.(time)
        i++;onProgress(.9+.1*i/missed.length,`正在重试遗漏帧 ${i} / ${missed.length}`)
      }
      for(const time of missed.slice(i))options.onMissed?.(time)
    }
    onProgress(1,`已生成 ${saved} / ${timestamps.length} 张`)
    return saved
  } finally {
    input.dispose()
  }
}
