export interface PacketCoverage { packets:number; bytes:number }
export function emptyCoverage():PacketCoverage
export function addCoverage(total:PacketCoverage,packet:{byteLength:number}):void
export function sumCoverage(items:PacketCoverage[]):PacketCoverage
export function assertCoverage(expected:PacketCoverage,actual:PacketCoverage,label:string):void
export function assertGopOrder(groups:{time:number}[],duration:number):void
