/** Presentation timeline checks; tolerances are based on packet duration and mux rounding. */
export function timelineTolerance(...durations) {
  return Math.min(2, Math.max(0.05, ...durations.filter(d => Number.isFinite(d) && d > 0).map(d => d * 2 + 0.02)))
}
export function assertDuration(actual, expected, tolerance) {
  if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(expected) || expected <= 0 ||
      !Number.isFinite(tolerance) || tolerance < 0 || Math.abs(actual - expected) > tolerance + 1e-6) {
    throw Error('校验失败：输出时长偏离预期。')
  }
}
export function assertTimeline(actual, expected, tolerance) {
  if (![actual.start, actual.end, expected.start, expected.end].every(Number.isFinite) ||
      actual.end <= actual.start || expected.end <= expected.start ||
      !Number.isFinite(tolerance) || tolerance < 0 ||
      Math.abs(actual.start - expected.start) > tolerance + 1e-6 ||
      Math.abs(actual.end - expected.end) > tolerance + 1e-6) {
    throw Error('校验失败：输出轨道时间戳与源数据不一致。')
  }
}
