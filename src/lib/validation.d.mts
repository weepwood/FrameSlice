export const MAX_EXTRACTED_FRAMES: number
export const MIN_FRAME_INTERVAL_SECONDS: number
export function safeStem(filename: string): string
export function computeFrameCount(duration: number, interval: number, start?: number, end?: number): number
export function createFrameTimes(duration: number, interval: number, start?: number, end?: number): number[]
