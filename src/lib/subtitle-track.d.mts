export interface SubtitleDocument { webvtt: string; count: number; endSeconds: number }
export function normalizeSubtitleText(raw: string, extension: string): SubtitleDocument
