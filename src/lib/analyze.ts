import { EncodedPacketSink } from 'mediabunny'
import { checkCanceled } from './format'
import { openInput } from './media'
import { VideoPacketStats } from './keyframe-stats.mjs'
import type { KeyframeStatistics } from './keyframe-stats.mjs'

/**
 * On-demand preflight. Iterates metadata-only packets and stores at most
 * 48 bitrate buckets and 80 keyframe timestamp samples, regardless of file size.
 */
export async function analyzeKeyframes(
  file: File,
  signal: AbortSignal,
  onProgress: (fraction: number, label: string) => void,
): Promise<KeyframeStatistics> {
  checkCanceled(signal)
  const input = openInput(file)
  try {
    const [videos, audios, tracks, duration] = await Promise.all([
      input.getVideoTracks(), input.getAudioTracks(), input.getTracks(), input.computeDuration(),
    ])
    if (!Number.isFinite(duration) || duration <= 0 || videos.length === 0) {
      throw new Error('无法分析：文件没有有效的视频轨道或时长。')
    }
    if (videos.length !== 1) {
      throw new Error('关键帧分析暂时仅支持单视频轨道输入。')
    }
    const stats = new VideoPacketStats(duration)
    const sink = new EncodedPacketSink(videos[0])
    const mp4Family = /\.(mp4|m4v|mov)$/i.test(file.name)
    let packets = 0
    let bytes = 0
    let lastReport = 0
    onProgress(0, '正在扫描视频压缩包索引…')
    for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) {
      checkCanceled(signal)
      stats.add(packet)
      packets++
      bytes += packet.byteLength
      if (packets > 12_000_000) throw new Error('视频压缩包数量超过安全限制，已停止分析。')
      if ((packets & 1023) === 0) {
        // Let CANCEL messages reach this Worker, including for metadata-cached media.
        await new Promise<void>(resolve => setTimeout(resolve, 0))
        checkCanceled(signal)
      }
      const now = performance.now()
      if (now - lastReport > 150) {
        onProgress(Math.min(0.96, bytes / Math.max(1, file.size)),
          '正在扫描视频关键帧…')
        lastReport = now
      }
    }
    checkCanceled(signal)
    const report = stats.summary({
      videoTracks: videos.length,
      audioTracks: audios.length,
      otherTracks: tracks.length - videos.length - audios.length,
      mp4Family,
    })
    onProgress(1, '关键帧统计完成')
    return report
  } finally {
    input.dispose()
  }
}
