/**
 * Small, portable JSON export summary. Never includes absolute file paths,
 * browser storage handles, source media bytes, or object URLs.
 */
export function createExportManifest({
  source, mode, settings, parts = [], images = [], completedFrames = 0,
  missedFrames = [], elapsedMs = 0, generatedAt = new Date().toISOString(),
}) {
  if (!source || !['split', 'frames'].includes(mode)) {
    throw new Error('无法创建报告：缺少来源文件或任务类型。')
  }
  const name = String(source.name ?? '').slice(0, 512)
  if (!name || !Number.isFinite(source.size) || source.size < 0 ||
      !Number.isFinite(source.duration) || source.duration <= 0 ||
      !Number.isFinite(elapsedMs) || elapsedMs < 0 ||
      !Number.isSafeInteger(completedFrames) || completedFrames < 0) {
    throw new Error('无法创建报告：来源媒体或处理统计数据无效。')
  }
  if (mode === 'split' && !parts.length) throw new Error('当前没有可以报告的视频片段。')
  const outputs = mode === 'split' ? parts.map((part, index) => {
    if (!Number.isFinite(part.size) || part.size <= 0 ||
        !Number.isFinite(part.start) || !Number.isFinite(part.end) || part.end <= part.start ||
        !part.verification?.passed) {
      throw new Error('存在未经过校验的片段，不能生成成功报告。')
    }
    return {
      index: index + 1,
      filename: part.filename,
      bytes: part.size,
      startSeconds: part.start,
      endSeconds: part.end,
      verification: {
        level: part.verification.level,
        passed: true,
        reportedDurationSeconds: part.verification.duration,
        checkedBytes: part.verification.checkedBytes,
        videoPackets: part.verification.videoPackets,
        audioPackets: part.verification.audioPackets,
      },
    }
  }) : images.map((name, index) => ({
    index: index + 1,
    filename: String(name).slice(0, 256),
  }))
  return {
    schemaVersion: 1,
    application: 'FrameSlice',
    generatedAt,
    task: {
      mode,
      status: mode === 'frames' && missedFrames.length ? 'partial' : 'completed',
      elapsedMs: Math.round(elapsedMs),
      settings,
    },
    input: {
      name,
      bytes: source.size,
      durationSeconds: source.duration,
      resolution: { width: source.width, height: source.height },
      videoCodec: source.videoCodec,
      audioCodec: source.audioCodec,
      videoTracks: source.videoTracks,
      audioTracks: source.audioTracks,
    },
    summary: {
      outputCount: mode === 'split' ? outputs.length : completedFrames,
      exportedEntries: outputs.length,
      knownOutputBytes: mode === 'split'
        ? outputs.reduce((sum, item) => sum + item.bytes, 0)
        : null,
      verification: mode === 'split' ? 'per-segment' : 'not-applicable',
    },
    outputs,
    ...(mode==='frames'?{missedFrames:missedFrames.map(timestamp=>({timestamp,reason:'解码无可用画面，已重试一次'}))}:{}),
    notes: [
      '所有源媒体均在本地处理，报告不含视频文件和本地绝对路径。',
      '快速校验核对容器、轨道、时间边界及媒体包数量和字节数，不逐包比较压缩内容。',
      '深度 CRC32 为压缩包一致性检查，并非音视频逐帧解码或密码学完整性证明。',
    ],
  }
}
