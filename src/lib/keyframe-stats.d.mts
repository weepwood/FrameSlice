export interface KeyframeStatistics {
  duration: number
  videoPackets: number
  videoBytes: number
  keyframeCount: number
  firstKeyframe: number | null
  maxGopSeconds: number
  estimatedAverageGopSeconds: number
  maxGopVideoBytes: number
  averageVideoMbps: number
  peakWindowMbps: number
  bitrateBins: number[]
  keyframeSamples: number[]
  keyframeIndex:number[]
  safeKeyframeIndex:number[]
  structurallyEligible: boolean
  warnings: string[]
}
export interface TrackShape {
  videoTracks: number
  audioTracks: number
  otherTracks: number
  mp4Family: boolean
}
export class VideoPacketStats {
  constructor(duration: number, bins?: number)
  add(packet: { timestamp: number; byteLength: number; type: string; duration?:number }): void
  summary(info: TrackShape): KeyframeStatistics
}
