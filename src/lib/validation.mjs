/**
 * Pure, browser-independent input validation.
 * Prevents path-like filenames, unbounded frame schedules and invalid timestamps.
 */
export const MAX_EXTRACTED_FRAMES = 10_000
export const MIN_FRAME_INTERVAL_SECONDS = 0.1

export function safeStem(filename) {
  const raw = typeof filename === 'string' ? filename : ''
  const normalized = raw.normalize('NFKC').replace(/\.[^.]+$/, '')
  let stem = normalized
    .replace(/[^\p{L}\p{N}._-]/gu, '_')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 80)
  // Windows device names are not valid standalone file or directory names.
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = '_' + stem
  return stem || 'video'
}

export function computeFrameCount(duration, interval, start = 0, end = duration) {
  if (![duration, interval, start, end].every(Number.isFinite) ||
      duration <= 0 || interval < MIN_FRAME_INTERVAL_SECONDS ||
      start < 0 || end > duration + 0.000001 || end <= start) {
    throw new Error('截图范围或间隔无效：起点必须小于终点，间隔至少为 0.1 秒，且不得超过视频时长。')
  }
  const count = Math.ceil((end - start - 1e-7) / interval)
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_EXTRACTED_FRAMES) {
    throw new Error('最多允许一次提取 10000 张图片；请增大截图间隔或缩短时间范围。')
  }
  return count
}

export function createFrameTimes(duration, interval, start = 0, end = duration) {
  const count = computeFrameCount(duration, interval, start, end)
  return Array.from({ length: count }, (_, index) => start + index * interval)
}
