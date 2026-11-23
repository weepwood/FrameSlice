import type { SplitResult } from '../lib/split'
import type { FrameFormat, FrameSnapshot, FrameWidth } from '../lib/frames'
import type { VerificationLevel } from '../lib/verify'

interface WorkerBase {
  kind: 'start'
  id: number
  file: File
  folder: FileSystemDirectoryHandle | null
}

export type WorkerStart =
  | (WorkerBase & {
      mode: 'split'
      maxBytes: number
      maxSeconds?: number
      verificationLevel: VerificationLevel
    })
  | (WorkerBase & {
      mode: 'frames'
      duration: number
      interval: number
      startTime: number
      endTime: number
      format: FrameFormat
      width: FrameWidth
      quality: number
    })

export type WorkerCommand = WorkerStart | { kind: 'cancel'; id: number }

export type WorkerReply =
  | { kind: 'progress'; id: number; fraction: number; label: string }
  | { kind: 'fileStarted'; id: number; filename: string }
  | { kind: 'saved'; id: number; filename: string }
  | { kind: 'segment'; id: number; result: SplitResult }
  | { kind: 'preview'; id: number; snapshot: FrameSnapshot }
  | { kind: 'complete'; id: number; count: number; elapsedMs: number }
  | { kind: 'error'; id: number; message: string; canceled: boolean }
