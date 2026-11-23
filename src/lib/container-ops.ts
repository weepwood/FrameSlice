import {
  Conversion, EncodedPacketSink, MkvOutputFormat, Mp4OutputFormat,
  Output, StreamTarget, TextSubtitleSource,
} from 'mediabunny'
import type { InputTrack, InputVideoTrack, InputAudioTrack, OutputFormat } from 'mediabunny'
import { openInput } from './media'
import { baseName, checkCanceled } from './format'
import { probeMatroska } from './mkv-probe.mjs'
import type { MkvProbe } from './mkv-probe.mjs'
import { normalizeSubtitleText } from './subtitle-track.mjs'

export type ContainerKind = 'video' | 'audio' | 'subtitle'
export interface ContainerTrack {
  id: string
  kind: ContainerKind
  codec: string
  codecLabel: string
  language: string
  name: string
  detail: string
  selectable: boolean
}
export interface ContainerInspection {
  name: string
  size: number
  duration: number
  tracks: ContainerTrack[]
  mkv: MkvProbe | null
  warnings: string[]
}
export type ContainerFormat = 'mkv' | 'mp4'
export type ContainerAction = 'extract' | 'package'
export interface ContainerOutput {
  filename: string
  bytes: number
  trackIds: string[]
  verified: true
  subtitleTrackAdded: boolean
}
export interface ContainerOptions {
  file: File
  folder: FileSystemDirectoryHandle
  action: ContainerAction
  format: ContainerFormat
  selectedIds: string[]
  subtitle?: File | null
  language?: string
  acknowledgeUnlisted: boolean
  signal: AbortSignal
  onProgress: (fraction: number, label: string) => void
  onFileStart: (name: string) => void
  onOutput: (result: ContainerOutput) => void
}

function trackId(track: InputTrack): string {
  return `${track.type}:${track.id}`
}

function prettyCodec(codec: string): string {
  return ({ avc: 'H.264', hevc: 'H.265', aac: 'AAC', mp3: 'MP3', opus: 'Opus',
    vorbis: 'Vorbis', flac: 'FLAC', av1: 'AV1', vp9: 'VP9', vp8: 'VP8',
    ac3: 'AC-3', eac3: 'E-AC-3', dts: 'DTS', truehd: 'TrueHD' } as Record<string, string>)[codec] || codec.toUpperCase()
}

export async function inspectContainer(file: File): Promise<ContainerInspection> {
  const input = openInput(file)
  try {
    const [tracks, duration] = await Promise.all([input.getTracks(), input.computeDuration()])
    if (!tracks.length) throw Error('文件未包含可识别的视频或音频轨道。')
    const result: ContainerTrack[] = []
    for (const track of tracks) {
      if (track.type !== 'video' && track.type !== 'audio') continue
      const [codec, language, name] = await Promise.all([
        track.getCodec(), track.getLanguageCode(), track.getName(),
      ])
      const dimension = track.isVideoTrack()
        ? `${await track.getDisplayWidth()} × ${await track.getDisplayHeight()}`
        : track.isAudioTrack()
          ? `${await track.getNumberOfChannels()} 声道 · ${await track.getSampleRate()} Hz`
          : ''
      result.push({
        id: trackId(track), kind: track.type, codec: codec || '',
        codecLabel: codec ? prettyCodec(codec) : '未知编码',
        language: language || 'und', name: name || '',
        detail: dimension, selectable: Boolean(codec),
      })
    }
    const mkv = /\.(mkv|webm)$/i.test(file.name) ? await probeMatroska(file) : null
    const warnings: string[] = []
    if (mkv) {
      if (!mkv.foundTracks) warnings.push('未能完整读取 MKV 轨道表；其他字幕、附件或轨道可能存在。')
      else {
        const unsupported = mkv.tracks.filter(t => t.kind === 'subtitle' || t.kind === 'other')
        for (const t of unsupported) {
          result.push({
            id: `mkv:${t.number}`, kind: 'subtitle', codec: t.codecId,
            codecLabel: t.codecId || '未知轨道',
            language: t.language, name: t.name,
            detail: t.kind === 'subtitle' ? '内嵌字幕：当前仅显示，暂不提取或保留' : '其他轨道：当前不支持',
            selectable: false,
          })
        }
        if (unsupported.length) warnings.push('检测到当前无法复制的内嵌字幕或其他轨道；处理前必须确认不保留。')
      }
      if (mkv.attachments) warnings.push('检测到 MKV 附件；此版本重封装不会保留附件。')
      if (mkv.chapters) warnings.push('检测到章节；此版本重封装不会保留章节。')
    }
    if (!Number.isFinite(duration) || duration <= 0) warnings.push('媒体时长无法确认，请谨慎操作。')
    return { name: file.name, size: file.size, duration, tracks: result, mkv, warnings }
  } finally {
    input.dispose()
  }
}

function outputFormat(format: ContainerFormat): OutputFormat {
  return format === 'mp4' ? new Mp4OutputFormat() : new MkvOutputFormat()
}

function extensionForTrack(codec: string, kind: ContainerKind): { ext: string; format: ContainerFormat } {
  if (kind === 'video') return { ext: 'mkv', format: 'mkv' }
  if (codec === 'aac') return { ext: 'm4a', format: 'mp4' }
  if (codec === 'flac') return { ext: 'flac', format: 'mkv' } // We keep MKV output for a single stream.
  return { ext: 'mkv', format: 'mkv' }
}

async function verifyOutput(file: File, expected: InputTrack[], sourceDuration: number, needsSubtitle: boolean): Promise<void> {
  if (file.size <= 64) throw Error('输出过小，封装可能未完成。')
  const outputInput = openInput(file)
  try {
    const [tracks, duration] = await Promise.all([outputInput.getTracks(), outputInput.computeDuration()])
    const kinds = expected.map(t => t.type).sort().join(',')
    if (tracks.map(t => t.type).sort().join(',') !== kinds) {
      throw Error('输出的音视频轨道数量或类型与选择不一致。')
    }
    const codecs = (await Promise.all(tracks.map(t => t.getCodec()))).map(String).sort().join(',')
    const expectedCodecs = (await Promise.all(expected.map(t => t.getCodec()))).map(String).sort().join(',')
    if (codecs !== expectedCodecs) throw Error('输出轨道编码与源文件不一致，校验失败。')
    if (!Number.isFinite(duration) || duration <= 0 ||
        (Number.isFinite(sourceDuration) && duration > sourceDuration + 3)) {
      throw Error('输出文件时长不合理。')
    }
    for (const track of tracks) {
      const sink = new EncodedPacketSink(track)
      const [first, last] = await Promise.all([sink.getFirstPacket(), sink.getPacket(Infinity)])
      if (!first || !last || first.byteLength <= 0 || last.byteLength <= 0) {
        throw Error('输出的音视频轨道缺少首尾压缩包。')
      }
    }
  } finally {
    outputInput.dispose()
  }
  if (needsSubtitle) {
    const mkv = await probeMatroska(file)
    if (!mkv.foundTracks || !mkv.tracks.some(t => t.kind === 'subtitle' && t.codecId.includes('WEBVTT'))) {
      throw Error('封装后无法检测到 WebVTT 字幕轨道，已取消输出。')
    }
  }
}

async function exportOne(
  options: ContainerOptions,
  selected: InputTrack[],
  filename: string,
  format: ContainerFormat,
  subtitle: { webvtt: string; count: number } | null,
): Promise<ContainerOutput> {
  const { file, folder, signal, onProgress, onFileStart } = options
  checkCanceled(signal)
  // Each task has its own directory. Failures remove only the incomplete output.
  onFileStart(filename)
  const handle = await folder.getFileHandle(filename, { create: true })
  let writable: FileSystemWritableFileStream
  try { writable = await handle.createWritable() }
  catch (error) {
    await folder.removeEntry(filename).catch(() => {})
    throw error
  }
  const input = openInput(file)
  const output = new Output({
    format: outputFormat(format),
    target: new StreamTarget(writable, { chunked: true, chunkSize: 1024 * 1024 }),
  })
  let conversion: Conversion | null = null
  let finalized = false
  const selectedSet = new Set(selected.map(trackId))
  try {
    conversion = await Conversion.init({
      input, output, copy: { mode: 'forced' }, composable: Boolean(subtitle),
      video: (track: InputVideoTrack) => ({ discard: !selectedSet.has(trackId(track)) }),
      audio: (track: InputAudioTrack) => ({ discard: !selectedSet.has(trackId(track)) }),
    })
    const actual = new Set(conversion.utilizedTracks.map(trackId))
    if (!conversion.isValid || actual.size !== selectedSet.size ||
      [...selectedSet].some(id => !actual.has(id))) {
      const failed = conversion.discardedTracks
        .filter(t => selectedSet.has(trackId(t.track)))
        .map(t => `${trackId(t.track)}：${t.reason}`)
      throw Error('选定轨道无法在该容器中直接无损复制：' + (failed.join('；') || '请改用 MKV 或取消不兼容轨道。'))
    }
    checkCanceled(signal)
    const onAbort = () => { void conversion?.cancel().catch(() => {}) }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      conversion.onProgress = value => onProgress(value * .95, '正在无损复制压缩轨道…')
      if (subtitle) {
        const source = new TextSubtitleSource('webvtt')
        output.addSubtitleTrack(source, { languageCode: options.language || 'zho', name: '字幕' })
        await output.start()
        await Promise.all([
          conversion.execute(),
          source.add(subtitle.webvtt).then(() => source.close()),
        ])
        await output.finalize()
      } else {
        await conversion.execute()
      }
      finalized = true
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
    checkCanceled(signal)
    const finished = await handle.getFile()
    onProgress(.96, '正在检查导出文件的轨道与时长…')
    await verifyOutput(finished, selected, await input.computeDuration(), Boolean(subtitle))
    checkCanceled(signal)
    return {
      filename, bytes: finished.size, trackIds: selected.map(trackId),
      verified: true, subtitleTrackAdded: Boolean(subtitle),
    }
  } catch (error) {
    if (!finalized) await output.cancel().catch(() => {})
    else await writable.abort().catch(() => {})
    await folder.removeEntry(filename).catch(() => {})
    throw error
  } finally {
    input.dispose()
  }
}

/**
 * Browser-local file-backed extraction/remux. All outputs use compressed packet
 * copying; incompatible codecs are rejected, NEVER silently transcoded/dropped.
 */
export async function executeContainerTask(options: ContainerOptions): Promise<ContainerOutput[]> {
  const { file, selectedIds, action, format, signal, onProgress, onOutput } = options
  if (!options.folder) throw Error('必须选择本地输出目录。')
  if (!Array.isArray(selectedIds) || selectedIds.length === 0 || selectedIds.length > 64 ||
      new Set(selectedIds).size !== selectedIds.length) throw Error('请选择有效的媒体轨道。')
  if (!['extract', 'package'].includes(action) || !['mkv', 'mp4'].includes(format)) throw Error('不支持的处理任务。')
  if (/\.(mkv|webm)$/i.test(file.name) && !options.acknowledgeUnlisted) {
    throw Error('MKV 可能包含尚不能保留的字幕、字体或章节，请先确认轨道丢弃提示。')
  }
  if (options.subtitle && action !== 'package') throw Error('只支持在重新封装模式下添加软字幕。')
  if (options.subtitle && format !== 'mkv') throw Error('软字幕第一版仅支持写入 MKV。')
  let subtitle: { webvtt: string; count: number } | null = null
  if (options.subtitle) {
    if (options.subtitle.size > 4_000_000) throw Error('SRT/VTT 字幕不得超过 4MB。')
    const text = await options.subtitle.text()
    subtitle = normalizeSubtitleText(text, options.subtitle.name.split('.').pop() || '')
  }
  const input = openInput(file)
  let available: InputTrack[]
  try { available = await input.getTracks() }
  finally { input.dispose() }
  const selected = available.filter(t => selectedIds.includes(trackId(t)))
  if (selected.length !== selectedIds.length ||
    selected.some(t => t.type !== 'video' && t.type !== 'audio')) {
    throw Error('选中的轨道不存在或无法提取，请重新扫描文件。')
  }
  const base = baseName(file.name)
  const plan = action === 'extract'
    ? await Promise.all(selected.map(async track => {
      const codec = await track.getCodec()
      const output = extensionForTrack(codec || '', track.type as ContainerKind)
      return { selected: [track], filename: `${base}_${track.type}_${track.id}.${output.ext}`, format: output.format, subtitle: null }
    }))
    : [{ selected, filename: `${base}_packaged.${format}`, format, subtitle }]
  const results: ContainerOutput[] = []
  for (let i = 0; i < plan.length; i++) {
    checkCanceled(signal)
    const item = plan[i]
    const result = await exportOne(options, item.selected, item.filename, item.format, item.subtitle)
    results.push(result)
    onOutput(result)
    onProgress((i + 1) / plan.length, `已完成 ${i + 1} / ${plan.length} 个输出`)
  }
  return results
}
