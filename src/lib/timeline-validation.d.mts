export interface TimelineBounds { start: number; end: number }
export function timelineTolerance(...durations: number[]): number
export function assertDuration(actual: number, expected: number, tolerance: number): void
export function assertTimeline(actual: TimelineBounds, expected: TimelineBounds, tolerance: number): void
