import { EncodedPacketSink } from 'mediabunny'
import { checkCanceled } from './format'
import { openInput } from './media'

export type VerificationLevel = 'quick' | 'deep'

export interface PacketDigest {
  packets: number
  bytes: number
  crc32: number
}

export interface VerificationReport {
  level: VerificationLevel
  passed: true
  duration: number
  videoPackets: number | null
  audioPackets: number | null
  checkedBytes: number
}

/** Streaming CRC32 is a corruption check, NOT a cryptographic authenticity proof. */
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < CRC_TABLE.length; n++) {
  let value = n
  for (let k = 0; k < 8; k++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  CRC_TABLE[n] = value >>> 0
}

export class PacketFingerprint {
  private state = 0xffffffff
  private packets = 0
  private bytes = 0

  add(data: Uint8Array): void {
    if (!(data instanceof Uint8Array)) throw new Error('校验失败：无效的媒体包数据。')
    this.packets++
    this.bytes += data.byteLength
    for (let i = 0; i < data.byteLength; i++) {
      this.state = CRC_TABLE[(this.state ^ data[i]) & 0xff] ^ (this.state >>> 8)
    }
  }

  digest(): PacketDigest {
    return { packets: this.packets, bytes: this.bytes, crc32: (this.state ^ 0xffffffff) >>> 0 }
  }
}

export interface VerificationOptions {
  file: File
  videoCodec: string
  audioCodec: string | null
  expectedDuration: number
  level: VerificationLevel
  signal: AbortSignal
  expectedVideo?: PacketDigest
  expectedAudio?: PacketDigest
}

function requirePacket(packet: { byteLength: number } | null, track: string): void {
  if (!packet || !Number.isFinite(packet.byteLength) || packet.byteLength <= 0) {
    throw new Error(`校验失败：${track}缺少完整的首尾媒体包。`)
  }
}

async function fingerprintTrack(sink: EncodedPacketSink, signal: AbortSignal): Promise<PacketDigest> {
  const checksum = new PacketFingerprint()
  for await (const packet of sink.packets()) {
    checkCanceled(signal)
    checksum.add(packet.data)
  }
  return checksum.digest()
}

function compareFingerprints(expected: PacketDigest | undefined, actual: PacketDigest, label: string) {
  if (!expected || expected.packets !== actual.packets ||
      expected.bytes !== actual.bytes || expected.crc32 !== actual.crc32) {
    throw new Error(`深度校验失败：${label}的媒体包数、字节数或 CRC32 与原始数据不一致。`)
  }
}

/**
 * Reopens the finalized MP4 from disk. Quick mode verifies metadata and edge packets.
 * Deep mode reads every packet and compares CRC32 with the bytes copied by the muxer.
 */
export async function verifySegment(options: VerificationOptions): Promise<VerificationReport> {
  const { file, videoCodec, audioCodec, expectedDuration, signal, level } = options
  checkCanceled(signal)
  if (!Number.isFinite(expectedDuration) || expectedDuration <= 0 || file.size <= 0) {
    throw new Error('校验失败：输出片段大小或预期时长无效。')
  }
  const input = openInput(file)
  try {
    const [videos, audios, allTracks, duration] = await Promise.all([
      input.getVideoTracks(), input.getAudioTracks(), input.getTracks(), input.computeDuration(),
    ])
    if (videos.length !== 1 || audios.length !== (audioCodec ? 1 : 0) ||
        allTracks.length !== videos.length + audios.length) {
      throw new Error('校验失败：导出视频的轨道数量与原文件不一致。')
    }
    if (!Number.isFinite(duration) || duration <= 0 || duration > expectedDuration + 2) {
      throw new Error('校验失败：导出视频时长无效或偏离预期。')
    }
    const currentVideoCodec = await videos[0].getCodec()
    if (currentVideoCodec !== videoCodec) throw new Error('校验失败：视频编码格式发生变化。')
    if (audioCodec && (await audios[0].getCodec()) !== audioCodec) {
      throw new Error('校验失败：音频编码格式发生变化。')
    }
    const videoSink = new EncodedPacketSink(videos[0])
    const [firstVideo, lastVideo] = await Promise.all([
      videoSink.getFirstPacket(), videoSink.getPacket(Infinity),
    ])
    requirePacket(firstVideo, '视频轨道')
    requirePacket(lastVideo, '视频轨道')
    if (firstVideo?.type !== 'key') {
      throw new Error('校验失败：视频片段没有从可独立解码的关键帧开始。')
    }

    let audioSink: EncodedPacketSink | null = null
    if (audioCodec) {
      audioSink = new EncodedPacketSink(audios[0])
      const [firstAudio, lastAudio] = await Promise.all([
        audioSink.getFirstPacket(), audioSink.getPacket(Infinity),
      ])
      requirePacket(firstAudio, '音频轨道')
      requirePacket(lastAudio, '音频轨道')
    }
    let checkedBytes = (firstVideo?.byteLength ?? 0) + (lastVideo?.byteLength ?? 0)
    if (level === 'deep') {
      const actualVideo = await fingerprintTrack(videoSink, signal)
      compareFingerprints(options.expectedVideo, actualVideo, '视频')
      checkedBytes = actualVideo.bytes
      if (audioSink) {
        const actualAudio = await fingerprintTrack(audioSink, signal)
        compareFingerprints(options.expectedAudio, actualAudio, '音频')
        checkedBytes += actualAudio.bytes
      }
    }
    checkCanceled(signal)
    return {
      level,
      passed: true,
      duration,
      videoPackets: level === 'deep' ? options.expectedVideo?.packets ?? null : null,
      audioPackets: level === 'deep' ? options.expectedAudio?.packets ?? null : null,
      checkedBytes,
    }
  } finally {
    input.dispose()
  }
}
