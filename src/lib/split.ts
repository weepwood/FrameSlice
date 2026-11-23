import {
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
} from 'mediabunny'
import { baseName, checkCanceled } from './format'
import { planGroups } from './planning.mjs'
import { openInput } from './media'

interface Group {
  time: number
  packet: EncodedPacket
  bytes: number
}

interface Segment {
  start: Group
  end: Group | null
  estimatedBytes: number
}

export interface SplitResult {
  filename: string
  size: number
  start: number
  end: number
}

export interface SplitOptions {
  file: File
  maxBytes: number
  folder: FileSystemDirectoryHandle
  signal: AbortSignal
  onProgress: (fraction: number, label: string) => void
  onSegment: (result: SplitResult) => void
}

function groupIndex(groups: Group[], timestamp: number): number {
  let lo = 0
  let hi = groups.length
  while (lo < hi) {
    const m = (lo + hi) >>> 1
    if (groups[m].time <= timestamp) lo = m + 1
    else hi = m
  }
  return Math.max(0, lo - 1)
}

export async function splitVideo(options: SplitOptions): Promise<SplitResult[]> {
  const { file, maxBytes, folder, signal, onProgress, onSegment } = options
  if (!/\.(mp4|m4v|mov)$/i.test(file.name)) {
    throw new Error('无损分割目前优先支持 MP4 / M4V / MOV 输入；其他容器请先转换为 MP4。')
  }
  const input = openInput(file)
  const results: SplitResult[] = []
  try {
    checkCanceled(signal)
    const [videos, audios, allTracks, duration] = await Promise.all([
      input.getVideoTracks(), input.getAudioTracks(), input.getTracks(), input.computeDuration(),
    ])
    if (videos.length !== 1 || audios.length > 1 || allTracks.length !== videos.length + audios.length) {
      throw new Error('当前无损分割只支持 1 条视频轨道、最多 1 条音频轨道，且不能包含字幕或其他轨道；已停止处理以避免丢失数据。')
    }
    const video = videos[0]
    const audio = await video.getPrimaryPairableAudioTrack()
    if (audios.length && !audio) throw new Error('视频和音频轨道不可配对；为防止丢失音轨，已停止处理。')
    const [videoCodec, audioCodec, videoConfig, audioConfig] = await Promise.all([
      video.getCodec(), audio?.getCodec() ?? Promise.resolve(null),
      video.getDecoderConfig(), audio?.getDecoderConfig() ?? Promise.resolve(null),
    ])
    if (!videoCodec || !videoConfig || (audio && (!audioCodec || !audioConfig))) {
      throw new Error('视频或音频的编码配置不完整，无法安全无损重新封装。')
    }

    const videoSink = new EncodedPacketSink(video)
    const audioSink = audio ? new EncodedPacketSink(audio) : null
    const groups: Group[] = []
    onProgress(0.01, '正在扫描关键帧与压缩数据索引…')
    // metadataOnly avoids materializing a 12 GB file during preflight.
    for await (const packet of videoSink.packets(undefined, undefined, { metadataOnly: true })) {
      checkCanceled(signal)
      if (packet.type === 'key') groups.push({ time: packet.timestamp, packet, bytes: 0 })
      if (!groups.length) throw new Error('视频开始处没有可用关键帧，无法保证输出片段独立播放。')
      groups[groups.length - 1].bytes += packet.byteLength
    }
    if (!groups.length) throw new Error('视频没有可用关键帧。')
    // Add audio payload sizes to the GOP containing the corresponding presentation time.
    if (audioSink) {
      onProgress(0.07, '正在统计音轨大小…')
      for await (const packet of audioSink.packets(undefined, undefined, { metadataOnly: true })) {
        checkCanceled(signal)
        groups[groupIndex(groups, packet.timestamp)].bytes += packet.byteLength
      }
    }
    const packed = planGroups(groups, maxBytes)
    const segments: Segment[] = packed.map((section, index) => {
      const nextStart = packed[index + 1]?.[0] ?? null
      return { start: section[0], end: nextStart,
        estimatedBytes: section.reduce((sum, g) => sum + g.bytes, 0) }
    })
    onProgress(0.12, `已找到 ${segments.length} 个片段；开始无损封装…`)

    for (let i = 0; i < segments.length; i++) {
      checkCanceled(signal)
      const seg = segments[i]
      const startTime = seg.start.time
      const endTime = seg.end?.time ?? duration
      const filename = `${baseName(file.name)}_part_${String(i + 1).padStart(3, '0')}.mp4`
      const fileHandle = await folder.getFileHandle(filename, { create: true })
      const writable = await fileHandle.createWritable()
      const output = new Output({
        format: new Mp4OutputFormat(),
        target: new StreamTarget(writable, { chunked: true, chunkSize: 1024 * 1024 }),
      })
      const videoSource = new EncodedVideoPacketSource(videoCodec)
      output.addVideoTrack(videoSource, { rotation: await video.getRotation() })
      const audioSource = audioCodec ? new EncodedAudioPacketSource(audioCodec) : null
      if (audioSource) output.addAudioTrack(audioSource)
      let finalized = false
      try {
        await output.start()
        const pumpVideo = async () => {
          let first = true
          // Preflight uses metadata-only packets to avoid loading gigabytes into memory.
          // Mediabunny requires a real encoded start packet for a full-data iterator.
          // The end boundary may remain metadata-only: it is only used as an exclusive marker.
          const startPacket = await videoSink.getKeyPacket(startTime)
          if (!startPacket || startPacket.isMetadataOnly || startPacket.type !== 'key' ||
              (seg.start.packet.sequenceNumber >= 0 && startPacket.sequenceNumber >= 0 &&
               startPacket.sequenceNumber !== seg.start.packet.sequenceNumber)) {
            throw new Error('无法从视频中重新定位分割起点的完整关键帧；已停止，避免输出损坏的视频。')
          }
          for await (const packet of videoSink.packets(startPacket, seg.end?.packet)) {
            checkCanceled(signal)
            const shifted = new EncodedPacket(
              packet.data, packet.type, packet.timestamp - startTime,
              packet.duration, packet.sequenceNumber, packet.byteLength, packet.sideData,
            )
            await videoSource.add(shifted, first ? { decoderConfig: videoConfig } : undefined)
            first = false
            const fraction = Math.min(1, Math.max(0, (packet.timestamp - startTime) / Math.max(1, endTime - startTime)))
            onProgress(0.12 + 0.88 * (i + fraction) / segments.length,
              `正在写入片段 ${i + 1} / ${segments.length} · 无损复制`)
          }
          videoSource.close()
        }
        const pumpAudio = async () => {
          if (!audioSink || !audioSource || !audioConfig) return
          const firstPacket = (await audioSink.getPacket(startTime)) ?? (await audioSink.getFirstPacket())
          if (!firstPacket) { audioSource.close(); return }
          let first = true
          for await (const packet of audioSink.packets(firstPacket)) {
            checkCanceled(signal)
            if (packet.timestamp >= endTime) break
            if (packet.timestamp < startTime) continue
            const shifted = new EncodedPacket(
              packet.data, packet.type, packet.timestamp - startTime,
              packet.duration, packet.sequenceNumber, packet.byteLength, packet.sideData,
            )
            await audioSource.add(shifted, first ? { decoderConfig: audioConfig } : undefined)
            first = false
          }
          audioSource.close()
        }
        // Concurrent pumping prevents the muxer's audio/video queues from growing unbounded.
        await Promise.all([pumpVideo(), pumpAudio()])
        await output.finalize()
        finalized = true
        const finalFile = await fileHandle.getFile()
        if (finalFile.size > maxBytes) {
          await folder.removeEntry(filename).catch(() => {})
          throw new Error(`片段 ${i + 1} 实际大小超过上限（封装开销高于预估），已移除该片段。请减小目标大小后重试。`)
        }
        const result = { filename, size: finalFile.size, start: startTime, end: endTime }
        results.push(result)
        onSegment(result)
        onProgress(0.12 + 0.88 * (i + 1) / segments.length, `已完成片段 ${i + 1} / ${segments.length}`)
      } catch (err) {
        if (!finalized) {
          await output.cancel().catch(() => {})
          await folder.removeEntry(filename).catch(() => {})
        }
        throw err
      }
    }
    return results
  } finally {
    input.dispose()
  }
}
