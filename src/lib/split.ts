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
import { planGroups, planGroupsByDuration } from './planning.mjs'
import { emptyCoverage, addCoverage, sumCoverage, assertCoverage, assertGopOrder, isLeadingAacPreroll } from './coverage.mjs'
import type { PacketCoverage } from './coverage.mjs'
import { openInput } from './media'
import { PacketFingerprint, verifySegment, includePacketTime } from './verify'
import type { VerificationLevel, VerificationReport, TrackTimeline } from './verify'

interface Group {
  time: number
  packet: EncodedPacket
  bytes: number
  video: PacketCoverage
  audio: PacketCoverage
}

interface Segment {
  start: Group
  end: Group | null
  estimatedBytes: number
  video: PacketCoverage
  audio: PacketCoverage
}

export interface SplitPlanEntry { start:number; end:number; estimatedBytes:number; videoPackets:number; audioPackets:number; excludedPreroll?:PacketCoverage }

export interface SplitResult {
  filename: string
  size: number
  start: number
  end: number
  verification: VerificationReport
  excludedPreroll?:PacketCoverage
}

export interface SplitOptions {
  file: File
  maxBytes: number
  maxSeconds?: number
  verificationLevel?: VerificationLevel
  folder: FileSystemDirectoryHandle | null
  planOnly?: boolean
  onPlan?: (entries: SplitPlanEntry[]) => void
  signal: AbortSignal
  onProgress: (fraction: number, label: string) => void
  onSegment: (result: SplitResult) => void
  onFileStart?: (filename: string) => void
}

/**
 * Give the dedicated worker time to process CANCEL messages.
 * Without a macrotask yield, a long chain of already-resolved promises can starve onmessage.
 */
async function yieldForCancellation(index: number, signal: AbortSignal): Promise<void> {
  if ((index & 1023) === 0) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    checkCanceled(signal)
  }
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
  const { file, maxBytes, maxSeconds, folder, signal, onProgress, onSegment } = options
  const verificationLevel = options.verificationLevel ?? 'quick'
  if (!/\.(mp4|m4v|mov)$/i.test(file.name)) {
    throw new Error('无损分割目前优先支持 MP4 / M4V / MOV 输入；其他容器请先转换为 MP4。')
  }
  const input = openInput(file)
  const results: SplitResult[] = []
  let lastProgressAt = -Infinity
  function report(value: number, message: string, force = false) {
    const now = performance.now()
    if (force || now - lastProgressAt >= 150) {
      onProgress(value, message)
      lastProgressAt = now
    }
  }
  try {
    checkCanceled(signal)
    const [videos, audios, allTracks, duration] = await Promise.all([
      input.getVideoTracks(), input.getAudioTracks(), input.getTracks(), input.computeDuration(),
    ])
    if (videos.length !== 1 || audios.length > 1 || allTracks.length !== videos.length + audios.length) {
      throw new Error('当前无损分割只支持 1 条视频轨道、最多 1 条音频轨道，且不能包含字幕或其他轨道；已停止处理以避免丢失数据。')
    }
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('视频时长无效，已停止处理。')
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
    report(0.01, '正在扫描关键帧与压缩数据索引…', true)
    let videoBytesScanned = 0
    let scannedVideoPackets = 0
    // metadataOnly avoids materializing a 12 GB file during preflight.
    for await (const packet of videoSink.packets(undefined, undefined, { metadataOnly: true })) {
      checkCanceled(signal)
      await yieldForCancellation(++scannedVideoPackets, signal)
      if (!Number.isSafeInteger(packet.byteLength) || packet.byteLength < 0) {
        throw new Error('媒体包的字节大小无效，已停止处理。')
      }
      if (packet.type === 'key') {
        if (groups.length >= 250_000) throw new Error('关键帧数量过多，超过资源安全上限。')
        groups.push({ time: packet.timestamp, packet, bytes: 0, video: emptyCoverage(), audio: emptyCoverage() })
      }
      if (!groups.length) throw new Error('视频开始处没有可用关键帧，无法保证输出片段独立播放。')
      addCoverage(groups[groups.length - 1].video,packet)
      groups[groups.length - 1].bytes += packet.byteLength
      videoBytesScanned += packet.byteLength
      report(Math.min(0.07, 0.01 + 0.06 * videoBytesScanned / Math.max(1, file.size)), '正在扫描关键帧与压缩数据索引…')
    }
    assertGopOrder(groups,duration)
    const excludedPreroll=emptyCoverage()
    // Add audio payload sizes to the GOP containing the corresponding presentation time.
    if (audioSink) {
      report(0.07, '正在统计音轨大小…', true)
      let scannedAudioPackets = 0
      for await (const packet of audioSink.packets(undefined, undefined, { metadataOnly: true })) {
        checkCanceled(signal)
        await yieldForCancellation(++scannedAudioPackets, signal)
        if (!Number.isSafeInteger(packet.byteLength) || packet.byteLength < 0) {
          throw new Error('音频媒体包的字节大小无效。')
        }
        if(excludedPreroll.packets===0&&isLeadingAacPreroll(audioCodec,packet,groups[0].time)){
          addCoverage(excludedPreroll,packet);continue
        }
        if (!Number.isFinite(packet.timestamp) || packet.timestamp < groups[0].time || packet.timestamp >= duration) {
          throw Error('音轨包含分割边界外的媒体包；为避免静默丢失，请先无损重新封装或使用兼容源文件。')
        }
        const group = groups[groupIndex(groups, packet.timestamp)]
        addCoverage(group.audio,packet)
        group.bytes += packet.byteLength
      }
    }
    const packed = maxSeconds === undefined
      ? planGroups(groups, maxBytes)
      : planGroupsByDuration(groups, duration, maxSeconds)
    const segments: Segment[] = packed.map((section, index) => {
      const nextStart = packed[index + 1]?.[0] ?? null
      return { start: section[0], end: nextStart,
        estimatedBytes: section.reduce((sum, g) => sum + g.bytes, 0),
        video: sumCoverage(section.map(g=>g.video)), audio:sumCoverage(section.map(g=>g.audio)) }
    })
    options.onPlan?.(segments.map((s,i)=>({start:s.start.time,end:s.end?.time??duration,estimatedBytes:s.estimatedBytes,videoPackets:s.video.packets,audioPackets:s.audio.packets,...(i===0&&excludedPreroll.packets?{excludedPreroll}: {})})))
    if (options.planOnly) return []
    if (!folder) throw Error('必须选择输出目录。')
    report(0.12, `已找到 ${segments.length} 个片段；开始无损封装…`, true)

    for (let i = 0; i < segments.length; i++) {
      checkCanceled(signal)
      const seg = segments[i]
      const startTime = seg.start.time
      const endTime = seg.end?.time ?? duration
      const filename = `${baseName(file.name)}_part_${String(i + 1).padStart(3, '0')}.mp4`
      options.onFileStart?.(filename)
      const fileHandle = await folder.getFileHandle(filename, { create: true })
      let writable: FileSystemWritableFileStream
      try {
        writable = await fileHandle.createWritable()
      } catch (error) {
        await folder.removeEntry(filename).catch(() => {})
        throw error
      }
      const output = new Output({
        format: new Mp4OutputFormat(),
        target: new StreamTarget(writable, { chunked: true, chunkSize: 1024 * 1024 }),
      })
      const videoSource = new EncodedVideoPacketSource(videoCodec)
      output.addVideoTrack(videoSource, { rotation: await video.getRotation() })
      const audioSource = audioCodec ? new EncodedAudioPacketSource(audioCodec) : null
      if (audioSource) output.addAudioTrack(audioSource)
      const videoTime: TrackTimeline = { start: Infinity, end: -Infinity, maxPacketDuration: 0 }
      const audioTime: TrackTimeline = { start: Infinity, end: -Infinity, maxPacketDuration: 0 }
      const copiedVideo=emptyCoverage(),copiedAudio=emptyCoverage()
      let finalized = false
      let committed = false
      const sourceVideoFingerprint = verificationLevel === 'deep' ? new PacketFingerprint() : null
      const sourceAudioFingerprint = verificationLevel === 'deep' && audio ? new PacketFingerprint() : null
      try {
        await output.start()
        const pumpVideo = async () => {
          let first = true
          let videoPacketsProcessed = 0
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
            await yieldForCancellation(++videoPacketsProcessed, signal)
            const shifted = new EncodedPacket(
              packet.data, packet.type, packet.timestamp - startTime,
              packet.duration, packet.sequenceNumber, packet.byteLength, packet.sideData,
            )
            await videoSource.add(shifted, first ? { decoderConfig: videoConfig } : undefined)
            includePacketTime(videoTime, shifted)
            addCoverage(copiedVideo,packet)
            sourceVideoFingerprint?.add(packet.data)
            first = false
            const fraction = Math.min(1, Math.max(0, (packet.timestamp - startTime) / Math.max(1, endTime - startTime)))
            report(0.12 + 0.88 * (i + fraction) / segments.length,
              `正在写入片段 ${i + 1} / ${segments.length} · 无损复制`)
          }
          videoSource.close()
        }
        const pumpAudio = async () => {
          if (!audioSink || !audioSource || !audioConfig) return
          let audioPacketsProcessed = 0
          const firstPacket = (await audioSink.getPacket(startTime)) ?? (await audioSink.getFirstPacket())
          if (!firstPacket) { audioSource.close(); return }
          let first = true
          for await (const packet of audioSink.packets(firstPacket)) {
            checkCanceled(signal)
            await yieldForCancellation(++audioPacketsProcessed, signal)
            if (packet.timestamp >= endTime) break
            if (packet.timestamp < startTime) continue
            const shifted = new EncodedPacket(
              packet.data, packet.type, packet.timestamp - startTime,
              packet.duration, packet.sequenceNumber, packet.byteLength, packet.sideData,
            )
            await audioSource.add(shifted, first ? { decoderConfig: audioConfig } : undefined)
            includePacketTime(audioTime, shifted)
            addCoverage(copiedAudio,packet)
            sourceAudioFingerprint?.add(packet.data)
            first = false
          }
          audioSource.close()
        }
        // Concurrent pumping prevents the muxer's audio/video queues from growing unbounded.
        const pumps = [pumpVideo(), pumpAudio()]
        try {
          await Promise.all(pumps)
        } catch (error) {
          // Cancel the muxer before waiting for both producers to settle.
          // Otherwise a surviving producer could keep writing into a failed output.
          await output.cancel().catch(() => {})
          await Promise.allSettled(pumps)
          throw error
        }
        assertCoverage(seg.video,copiedVideo,'视频轨')
        assertCoverage(seg.audio,copiedAudio,'音频轨')
        await output.finalize()
        finalized = true
        const finalFile = await fileHandle.getFile()
        if (maxSeconds === undefined && finalFile.size > maxBytes) {
          await folder.removeEntry(filename).catch(() => {})
          throw new Error(`片段 ${i + 1} 实际大小超过上限（封装开销高于预估），已移除该片段。请减小目标大小后重试。`)
        }
        report(0.12 + 0.88 * (i + 0.98) / segments.length,
          `正在校验片段 ${i + 1} / ${segments.length}…`, true)
        const verification = await verifySegment({
          file: finalFile,
          videoCodec,
          audioCodec,
          expectedDuration: endTime - startTime,
          level: verificationLevel,
          signal,
          expectedVideoCoverage: seg.video,
          expectedAudioCoverage: audio ? seg.audio : undefined,
          expectedVideoTime: videoTime,
          expectedAudioTime: audio ? audioTime : undefined,
          expectedVideo: sourceVideoFingerprint?.digest(),
          expectedAudio: sourceAudioFingerprint?.digest(),
        })
        checkCanceled(signal)
        const result: SplitResult = { filename, size: finalFile.size, start: startTime, end: endTime, verification, ...(i===0&&excludedPreroll.packets?{excludedPreroll}:{}) }
        results.push(result)
        committed = true
        onSegment(result)
        report(0.12 + 0.88 * (i + 1) / segments.length, `已完成片段 ${i + 1} / ${segments.length}`, true)
      } catch (err) {
        if (!finalized) await output.cancel().catch(() => {})
        // A file is only considered complete after the chosen integrity check.
        if (!committed) await folder.removeEntry(filename).catch(() => {})
        throw err
      }
    }
    return results
  } finally {
    input.dispose()
  }
}
