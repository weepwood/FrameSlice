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
/** Only one complete AAC pre-roll packet ending at the first video boundary is tolerated.
 * The skipped bytes are explicitly reported; other out-of-range audio is rejected.
 */
export function isLeadingAacPreroll(codec,packet,start){
 const eps=0.00001
 return codec==='aac'&&Number.isFinite(packet.timestamp)&&Number.isFinite(packet.duration)&&packet.duration>0&&packet.duration<=.256&&packet.timestamp<start&&packet.timestamp+packet.duration<=start+eps&&start-packet.timestamp<=packet.duration+eps
}
export function assertGopOrder(groups,duration){
 if(!groups.length||!Number.isFinite(duration)||duration<=0)throw Error('没有可用的关键帧组')
 for(let i=0;i<groups.length;i++){
  const t=groups[i].time,end=groups[i+1]?.time??duration
  if(!Number.isFinite(t)||t<0||!Number.isFinite(end)||end<=t)throw Error('关键帧时间戳异常，无法安全分割')
 }
}

/** Decode-order GOPs with leading presentation pictures cannot be independent cut boundaries. */
export function safeGopGroups(groups){
 const eps=1e-5, result=[]
 for(const group of groups){
  if(!Number.isFinite(group.minTime)||!Number.isFinite(group.maxTime)||group.maxTime<=group.minTime)throw Error('视频 GOP 时间范围异常')
  const prev=result.at(-1)
  if(!prev){if(group.minTime<group.time-eps)throw Error('首个 GOP 包含播放边界外的前置画面');result.push({...group,video:{...group.video},audio:{...group.audio}});continue}
  if(group.minTime<group.time-eps||prev.maxTime>group.time+eps){
   prev.minTime=Math.min(prev.minTime,group.minTime);prev.maxTime=Math.max(prev.maxTime,group.maxTime);prev.bytes+=group.bytes;prev.video=sumCoverage([prev.video,group.video]);prev.audio=sumCoverage([prev.audio,group.audio])
  }else result.push({...group,video:{...group.video},audio:{...group.audio}})
 }
 return result
}
