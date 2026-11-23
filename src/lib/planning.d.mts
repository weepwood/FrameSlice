export function planGroups<T extends { bytes: number }>(groups: T[], maxBytes: number): T[][]

export function planGroupsByDuration<T extends { time: number; bytes: number }>(groups: T[], duration: number, maxSeconds: number): T[][]
