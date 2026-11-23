export type MkvTrackKind = 'video' | 'audio' | 'subtitle' | 'other'
export interface MkvTrackHeader {
  number: number
  kind: MkvTrackKind
  codecId: string
  language: string
  name: string
}
export interface MkvProbe {
  foundTracks: boolean
  tracks: MkvTrackHeader[]
  attachments: boolean
  chapters: boolean
  scannedBytes: number
  reason?: string
}
export function probeMatroska(file: Blob): Promise<MkvProbe>
