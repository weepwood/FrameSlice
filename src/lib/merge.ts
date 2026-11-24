import {EncodedPacket,EncodedPacketSink,EncodedVideoPacketSource,EncodedAudioPacketSource,Mp4OutputFormat,Output,StreamTarget} from 'mediabunny'
import {openInput} from './media'
import {checkCanceled} from './format'
import {PacketFingerprint,includePacketTime,fingerprintTrack,compareFingerprints} from './verify'
import type {TrackTimeline} from './verify'
import {assertAvOnly} from './mp4-track-guard'
function signature(config:VideoDecoderConfig|AudioDecoderConfig){const {description,...rest}=config;const bytes=description?Array.from(ArrayBuffer.isView(description)?new Uint8Array(description.buffer,description.byteOffset,description.byteLength):new Uint8Array(description)):[];return JSON.stringify([Object.entries(rest).sort(([a],[b])=>a.localeCompare(b)),bytes])}
const epsilon=.001
const timeline=():TrackTimeline=>({start:Infinity,end:-Infinity,maxPacketDuration:0})
/** Strict AV concatenation: every input has the same track topology, config and metadata.
 * Audio priming, gaps, overlapping packets, and unsupported tracks are rejected.
 */
export async function mergeVideoOnly(files:File[],folder:FileSystemDirectoryHandle,signal:AbortSignal,onProgress:(n:number,label:string)=>void,onFileStart:(name:string)=>void){
 if(files.length<2||files.length>50)throw Error('请选择 2–50 个 MP4/MOV 视频')
 const inputs=files.map(openInput)
 try{
  const segments=await Promise.all(inputs.map(async(input,i)=>{
   checkCanceled(signal);if(!/\.(mp4|m4v|mov)$/i.test(files[i].name))throw Error('仅支持 MP4/MOV 输入')
   const [all,videos,audios,duration]=await Promise.all([input.getTracks(),input.getVideoTracks(),input.getAudioTracks(),input.computeDuration()])
   if(videos.length!==1||audios.length>8||all.length!==videos.length+audios.length||!Number.isFinite(duration)||duration<=0)throw Error('只允许一个视频轨和最多八个音轨')
   await assertAvOnly(files[i],videos.length,audios.length)
   const video=videos[0],codec=await video.getCodec(),config=await video.getDecoderConfig(),rotation=await video.getRotation(),sink=new EncodedPacketSink(video),first=await sink.getFirstPacket()
   if(!codec||!config||!first||first.type!=='key'||Math.abs(first.timestamp)>epsilon)throw Error('输入编码配置或首帧时间边界不兼容')
   const audio=await Promise.all(audios.map(async a=>{const codec=await a.getCodec(),config=await a.getDecoderConfig(),languageCode=await a.getLanguageCode(),name=await a.getName();if(!codec||!config)throw Error('音轨编码配置缺失');return {codec,config,languageCode:languageCode||'und',name:name||'',sink:new EncodedPacketSink(a)}}))
   return {codec,config,rotation,duration,sink,audio}
  }))
  const first=segments[0]
  if(segments.some(s=>s.codec!==first.codec||signature(s.config)!==signature(first.config)||s.rotation!==first.rotation||s.audio.length!==first.audio.length||s.audio.some((a,i)=>a.codec!==first.audio[i].codec||signature(a.config)!==signature(first.audio[i].config)||a.languageCode!==first.audio[i].languageCode||a.name!==first.audio[i].name)))throw Error('输入视频或音轨配置、数量、顺序、语言或名称不一致')
  // Preflight all track timelines without loading packet bytes; no output until all inputs are accepted.
  for(const s of segments){
   for(const [i,sink] of [s.sink,...s.audio.map(a=>a.sink)].entries()){
    const time=timeline();let count=0,previousEnd=0
    for await(const p of sink.packets(undefined,undefined,{metadataOnly:true})){
     checkCanceled(signal);includePacketTime(time,p)
     if(p.timestamp < -epsilon||p.timestamp+p.duration>s.duration+epsilon)throw Error('输入包含负时间戳、编码前置包或越界媒体包')
     if(i>0&&Math.abs(p.timestamp-previousEnd)>epsilon)throw Error('音频存在间隙或重叠，无法安全无损合并')
     previousEnd=p.timestamp+p.duration;if((++count&1023)===0)await new Promise<void>(r=>setTimeout(r,0))
    }
    if(!count||Math.abs(time.start)>epsilon||Math.abs(time.end-s.duration)>epsilon)throw Error('音视频轨道必须完整覆盖同一时间区间，拒绝不对齐的输入')
   }
  }
  const filename='frameslice-merged.mp4';onFileStart(filename);const handle=await folder.getFileHandle(filename,{create:true})
  let output:Output|undefined,complete=false
  try{
   output=new Output({format:new Mp4OutputFormat(),target:new StreamTarget(await handle.createWritable(),{chunked:true,chunkSize:1024*1024})})
   const video=new EncodedVideoPacketSource(first.codec);output.addVideoTrack(video,{rotation:first.rotation})
   const audio=first.audio.map(a=>{const source=new EncodedAudioPacketSource(a.codec);output!.addAudioTrack(source,{languageCode:a.languageCode,name:a.name});return source})
   await output.start()
   const digests=Array.from({length:1+audio.length},()=>new PacketFingerprint()),times=digests.map(timeline),seq=digests.map(()=>0)
   // Each producer traverses the whole sequence independently to avoid blocking interleaved mux queues at clip boundaries.
   const pumpVideo=async()=>{let offset=0;for(const s of segments){for await(const p of s.sink.packets()){checkCanceled(signal);const packet=new EncodedPacket(p.data,p.type,offset+p.timestamp,p.duration,seq[0]++,p.byteLength,p.sideData);await video.add(packet,seq[0]===1?{decoderConfig:first.config}:undefined);digests[0].add(p.data);includePacketTime(times[0],packet);if((seq[0]&1023)===0)await new Promise<void>(r=>setTimeout(r,0))}offset+=s.duration;onProgress(.8*offset/segments.reduce((n,s)=>n+s.duration,0),'正在合并视频轨')}video.close()}
   const pumps=[pumpVideo(),...audio.map(async(source,i)=>{let offset=0;for(const s of segments){for await(const p of s.audio[i].sink.packets()){checkCanceled(signal);const packet=new EncodedPacket(p.data,p.type,offset+p.timestamp,p.duration,seq[i+1]++,p.byteLength,p.sideData);await source.add(packet,seq[i+1]===1?{decoderConfig:first.audio[i].config}:undefined);digests[i+1].add(p.data);includePacketTime(times[i+1],packet);if((seq[i+1]&1023)===0)await new Promise<void>(r=>setTimeout(r,0))}offset+=s.duration}source.close()})]
   try{await Promise.all(pumps)}catch(e){await output.cancel().catch(()=>{});await Promise.allSettled(pumps);throw e}
   await output.finalize();checkCanceled(signal);const file=await handle.getFile(),readback=openInput(file)
   try{
    const [v,a]=await Promise.all([readback.getVideoTracks(),readback.getAudioTracks()]);await assertAvOnly(file,v.length,a.length)
    if(v.length!==1||a.length!==audio.length)throw Error('合并输出轨道数量不一致')
    const tracks=[...v,...a],expected=[first.codec,...first.audio.map(a=>a.codec)]
    for(let i=0;i<tracks.length;i++){
     if(await tracks[i].getCodec()!==expected[i])throw Error('合并输出编码不一致')
     const sink=new EncodedPacketSink(tracks[i]),[head,tail]=await Promise.all([sink.getFirstPacket(),sink.getPacket(Infinity)])
     if(!head||!tail||i===0&&head.type!=='key'||Math.abs(head.timestamp-times[i].start)>epsilon||Math.abs(tail.timestamp+tail.duration-times[i].end)>epsilon)throw Error('合并输出时间边界不一致')
     compareFingerprints(digests[i].digest(),await fingerprintTrack(sink,signal),'轨道 '+(i+1))
    }
   }finally{readback.dispose()}
   complete=true;onProgress(1,'合并及逐轨深度校验完成');return {filename,bytes:file.size,trackIds:['video',...audio.map((_,i)=>'audio:'+(i+1))]}
  }finally{if(!complete){await output?.cancel().catch(()=>{});await folder.removeEntry(filename).catch(()=>{})}}
 }finally{for(const input of inputs)input.dispose()}
}
