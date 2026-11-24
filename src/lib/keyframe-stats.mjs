import {safeGopGroups,emptyCoverage,assertGopOrder} from './coverage.mjs'
/**
 * Fixed-memory video packet statistics. No encoded bytes are retained.
 * A packet's timestamp is presentation time, while iteration is decode order.
 */
export class VideoPacketStats {
  constructor(duration, bins = 48) {
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(bins) || bins < 8 || bins > 120) {
      throw new Error('视频时长或统计分桶数量无效。')
    }
    this.duration = duration
    this.buckets = new Array(bins).fill(0)
    this.videoPackets = 0
    this.videoBytes = 0
    this.keyframes = 0
    this.firstKeyframe = null
    this.lastKeyframe = null
    this.maxGopSeconds = 0
    this.maxGopBytes = 0
    this.currentGopBytes = 0
    this.currentGopStart = null
    this.nonMonotonicKeyframes = 0
    this.keyframeSamples = []
    this.keyframeIndex = []
    this.gops=[]
  }

  add(packet) {
    const { timestamp, byteLength, type, duration=0 } = packet
    if (!Number.isFinite(timestamp) || timestamp < -0.01 || timestamp > this.duration + 2 ||
      !Number.isSafeInteger(byteLength) || byteLength < 0 || !Number.isFinite(duration) || duration<0) {
      throw new Error('视频媒体包时间戳或大小异常，已停止统计。')
    }
    this.videoPackets++
    this.videoBytes += byteLength
    const bucket = Math.min(this.buckets.length - 1, Math.max(0,
      Math.floor(timestamp / this.duration * this.buckets.length)))
    this.buckets[bucket] += byteLength

    if (type === 'key') {
      if (this.keyframes >= 250_000) throw new Error('关键帧数量超过统计安全上限。')
      this.keyframes++
      this.keyframeIndex.push(timestamp)
      this.gops.push({time:timestamp,minTime:Infinity,maxTime:-Infinity,bytes:0,video:emptyCoverage(),audio:emptyCoverage()})
      if (this.firstKeyframe === null) this.firstKeyframe = timestamp
      if (this.lastKeyframe !== null) {
        const interval = timestamp - this.lastKeyframe
        if (interval < -0.001) this.nonMonotonicKeyframes++
        else this.maxGopSeconds = Math.max(this.maxGopSeconds, interval)
        this.maxGopBytes = Math.max(this.maxGopBytes, this.currentGopBytes)
      }
      this.currentGopBytes = 0
      this.currentGopStart = timestamp
      this.lastKeyframe = timestamp
      // A bounded overview; samples are approximate, not exhaustive.
      if (this.keyframeSamples.length < 80) this.keyframeSamples.push(timestamp)
    }
    if (this.keyframes > 0) {this.currentGopBytes += byteLength;const g=this.gops.at(-1);g.minTime=Math.min(g.minTime,timestamp);g.maxTime=Math.max(g.maxTime,timestamp+duration);g.bytes+=byteLength;g.video.packets++;g.video.bytes+=byteLength}
  }

  summary(trackInfo) {
    if (!this.keyframes || !this.videoPackets) throw new Error('没有可分析的视频关键帧。')
    if (this.lastKeyframe !== null) this.maxGopSeconds = Math.max(
      this.maxGopSeconds, Math.max(0, this.duration - this.lastKeyframe))
    this.maxGopBytes = Math.max(this.maxGopBytes, this.currentGopBytes)
    const bucketSeconds = this.duration / this.buckets.length
    const bitrateBins = this.buckets.map(bytes => +(bytes * 8 / bucketSeconds / 1e6).toFixed(3))
    const maxBitrate = Math.max(...bitrateBins)
    const trackCompatible = trackInfo.videoTracks === 1 && trackInfo.audioTracks <= 1 &&
      trackInfo.otherTracks === 0 && trackInfo.mp4Family
    const warnings = []
    let safeKeyframeIndex=[];try{if(this.nonMonotonicKeyframes===0){assertGopOrder(this.gops,this.duration);safeKeyframeIndex=safeGopGroups(this.gops).map(g=>g.time)}}catch{warnings.push('无法验证独立 GOP 边界，请勿使用手动无损切点。')}
    if(safeKeyframeIndex.length<this.keyframeIndex.length)warnings.push('存在开放 GOP 或不安全关键帧，手动切割仅显示已验证的安全边界。')
    if (!trackCompatible) warnings.push('当前文件的容器或轨道组成不满足现有 MP4 无损分割的要求。')
    if (this.firstKeyframe !== null && this.firstKeyframe > 0.05) warnings.push('视频起始位置没有关键帧，不能确保首段独立播放。')
    if (this.nonMonotonicKeyframes) warnings.push('关键帧时间顺序异常，建议先检查原始文件。')
    if (this.maxGopSeconds > 30) warnings.push('存在超过 30 秒的关键帧间隔，小片段无损切割可能受限。')
    return {
      duration: this.duration,
      videoPackets: this.videoPackets,
      videoBytes: this.videoBytes,
      keyframeCount: this.keyframes,
      firstKeyframe: this.firstKeyframe,
      maxGopSeconds: +this.maxGopSeconds.toFixed(3),
      estimatedAverageGopSeconds: +(this.duration / this.keyframes).toFixed(3),
      maxGopVideoBytes: this.maxGopBytes,
      averageVideoMbps: +(this.videoBytes * 8 / this.duration / 1e6).toFixed(3),
      peakWindowMbps: +maxBitrate.toFixed(3),
      bitrateBins,
      keyframeSamples: this.keyframeSamples,
      keyframeIndex: [...new Set(this.keyframeIndex)].sort((a,b)=>a-b),
      safeKeyframeIndex,
      structurallyEligible: safeKeyframeIndex.length>0&&trackCompatible && this.firstKeyframe !== null &&
        this.firstKeyframe <= 0.05 && this.nonMonotonicKeyframes === 0,
      warnings,
    }
  }
}
