export function planGroups<T extends { bytes: number }>(groups: T[], maxBytes: number): T[][]

export function planGroupsByDuration<T extends { time: number; bytes: number }>(groups: T[], duration: number, maxSeconds: number): T[][]

export function planManualGroups<T extends {time:number;bytes:number}>(groups:T[],cuts:number[]):T[][]

export function selectGopRange<T extends {time:number;bytes:number}>(groups:T[],duration:number,start:number,end:number):{groups:T[];end:T|null}
