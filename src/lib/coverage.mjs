/** Compare packet metadata from the independent preflight and actual copy/output. */
export function emptyCoverage(){return {packets:0,bytes:0}}
export function addCoverage(total,packet){
 if(!Number.isSafeInteger(packet.byteLength)||packet.byteLength<0)throw Error('媒体包大小无效')
 total.packets++;total.bytes+=packet.byteLength
 if(!Number.isSafeInteger(total.packets)||!Number.isSafeInteger(total.bytes))throw Error('媒体包统计超过安全范围')
}
export function sumCoverage(items){return items.reduce((a,b)=>({packets:a.packets+b.packets,bytes:a.bytes+b.bytes}),emptyCoverage())}
export function assertCoverage(expected,actual,label){
 if(expected.packets!==actual.packets||expected.bytes!==actual.bytes)throw Error('源媒体覆盖率校验失败：'+label+'，预期 '+expected.packets+' 包 / '+expected.bytes+' 字节，实际 '+actual.packets+' 包 / '+actual.bytes+' 字节')
}
export function assertGopOrder(groups,duration){
 if(!groups.length||!Number.isFinite(duration)||duration<=0)throw Error('没有可用的关键帧组')
 for(let i=0;i<groups.length;i++){
  const t=groups[i].time,end=groups[i+1]?.time??duration
  if(!Number.isFinite(t)||t<0||!Number.isFinite(end)||end<=t)throw Error('关键帧时间戳异常，无法安全分割')
 }
}
