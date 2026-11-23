import type { VideoInfo } from './media'
import type { SplitResult } from './split'

export interface ExportManifestOptions {
  source: VideoInfo
  mode: 'split' | 'frames'
  settings: Record<string, unknown>
  parts?: SplitResult[]
  images?: string[]
  completedFrames?: number
  elapsedMs?: number
  generatedAt?: string
}
export function createExportManifest(options: ExportManifestOptions): Record<string, unknown>
