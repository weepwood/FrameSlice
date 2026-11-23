import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'

export interface VideoInfo {
  name: string
  size: number
  duration: number
  width: number
  height: number
  videoCodec: string
  audioCodec: string | null
  videoTracks: number
  audioTracks: number
  hasDecodableVideo: boolean
}

export function openInput(file: File): Input {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
}

export async function inspectVideo(file: File): Promise<VideoInfo> {
  const input = openInput(file)
  try {
    const [videoTracks, audioTracks, duration] = await Promise.all([
      input.getVideoTracks(), input.getAudioTracks(), input.computeDuration(),
    ])
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new Error('文件中没有可以识别的视频轨道。')
    const audio = await video.getPrimaryPairableAudioTrack()
    const [width, height, videoCodec, audioCodec, decodable] = await Promise.all([
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      video.getCodecParameterString(),
      audio?.getCodecParameterString() ?? Promise.resolve(null),
      video.canDecode(),
    ])
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法读取视频时长。')
    return {
      name: file.name, size: file.size, duration,
      width, height, videoCodec: videoCodec || '未知', audioCodec,
      videoTracks: videoTracks.length, audioTracks: audioTracks.length,
      hasDecodableVideo: decodable,
    }
  } finally {
    input.dispose()
  }
}
