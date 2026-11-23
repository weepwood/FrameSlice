import { safeStem, computeFrameCount, createFrameTimes } from './validation.mjs'

export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1000) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = -1
  do { value /= 1000; i++ } while (value >= 1000 && i < units.length - 1)
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`
}

export function humanTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const n = Math.floor(seconds)
  const parts = [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60]
  return parts.map((value, i) => (i === 0 ? String(value) : String(value).padStart(2, '0'))).join(':')
}

export function baseName(name: string): string {
  return safeStem(name)
}

export function fileTime(seconds: number): string {
  const whole = Math.floor(seconds)
  const milliseconds = Math.round((seconds - whole) * 1000)
  const safeWhole = whole + (milliseconds === 1000 ? 1 : 0)
  const suffix = milliseconds !== 0 && milliseconds !== 1000
    ? `-${String(milliseconds).padStart(3, '0')}`
    : ''
  return humanTime(safeWhole).replace(/:/g, '-') + suffix
}

export function plannedFrameCount(duration: number, interval: number, start = 0, end = duration): number {
  try { return computeFrameCount(duration, interval, start, end) } catch { return 0 }
}

export function frameTimes(duration: number, interval: number, start = 0, end = duration): number[] {
  return createFrameTimes(duration, interval, start, end)
}

export function checkCanceled(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('已取消处理', 'AbortError')
}

export function friendlyError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return '任务已取消。之前完成的文件会保留在输出目录。'
  if (err instanceof Error) return err.message
  return String(err)
}
