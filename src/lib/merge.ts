import {EncodedPacket,EncodedPacketSink,EncodedVideoPacketSource,Mp4OutputFormat,Output,StreamTarget} from 'mediabunny'
import {openInput} from './media'
import {checkCanceled} from './format'
import {PacketFingerprint,includePacketTime,verifySegment} from './verify'
import type {TrackTimeline} from './verify'
function signature(config:VideoDecoderConfig){const {description,...rest}=config;const bytes=description?Array.from(ArrayBuffer.isView(description)?new Uint8Array(description.buffer,description.byteOffset,description.byteLength):new Uint8Array(description)):[];return JSON.stringify([Object.entries(rest).sort(([a],[b])=>a.localeCompare(b)),bytes])}
/** Initial conservative lossless join: one video track, zero audio/subtitle tracks.
 * Reject mismatched codec descriptions/rotation, negative/nonzero starts, and incomplete timelines.
 */
export async function mergeVideoOnly(files:File[],folder:FileSystemDirectoryHandle,signal:AbortSignal,onProgress:(n:number,label:string)=>void,onFileStart:(name:string)=>void){
 if(files.length<2||files.length>50)throw Error('请选择 2–50 个无音轨 MP4 视频')
 const inputs=files.map(openInput)
 try{
  const tracks=await Promise.all(inputs.map(async (input,i)=>{
   checkCanceled(signal);if(!/\.(mp4|m4v|mov)$/i.test(files[i].name))throw Error('仅支持 MP4/MOV 输入')
   const all=await input.getTracks(),videos=await input.getVideoTracks()
   if(all.length!==1||videos.length!==1)throw Error('合并首版仅支持单视频轨、无音轨/字幕轨，拒绝丢轨')
   const video=videos[0],codec=await video.getCodec(),config=await video.getDecoderConfig(),rotation=await video.getRotation(),duration=await input.computeDuration(),sink=new EncodedPacketSink(video),first=await sink.getFirstPacket()
   if(!codec||!config||!first||first.type!=='key'||first.timestamp!==0||!Number.isFinite(duration)||duration<=0)throw Error('输入编码配置或首帧时间边界不兼容')
   return {codec,config,rotation,duration,sink}
  }))
  const first=tracks[0];if(tracks.some(t=>t.codec!==first.codec||signature(t.config)!==signature(first.config)||t.rotation!==first.rotation))throw Error('编码配置或旋转方向不一致，无法无损合并')
  const filename='frameslice-merged.mp4';onFileStart(filename);const handle=await folder.getFileHandle(filename,{create:true})
  let output:Output|undefined,complete=false
  try{
   output=new Output({format:new Mp4OutputFormat(),target:new StreamTarget(await handle.createWritable(),{chunked:true,chunkSize:1024*1024})})
   const source=new EncodedVideoPacketSource(first.codec);output.addVideoTrack(source,{rotation:first.rotation});await output.start()
   const fingerprint=new PacketFingerprint(),timeline:TrackTimeline={start:Infinity,end:-Infinity,maxPacketDuration:0};let offset=0,seq=0
   for(let i=0;i<tracks.length;i++){
    const track=tracks[i];let end=0;for await(const packet of track.sink.packets()){
     checkCanceled(signal);if(packet.timestamp<0||packet.timestamp+packet.duration>track.duration+.001)throw Error('输入包含不支持的时间边界')
     const shifted=new EncodedPacket(packet.data,packet.type,offset+packet.timestamp,packet.duration,seq++,packet.byteLength,packet.sideData)
     await source.add(shifted,seq===1?{decoderConfig:first.config}:undefined);fingerprint.add(packet.data);includePacketTime(timeline,shifted);end=Math.max(end,packet.timestamp+packet.duration)
     if((seq&1023)===0){await new Promise<void>(r=>setTimeout(r,0));onProgress((i+Math.min(1,end/track.duration))/tracks.length*.9,'正在无损合并 '+(i+1)+' / '+tracks.length)}
    }
    if(Math.abs(end-track.duration)>.001)throw Error('输入视频轨时长不完整')
    offset+=track.duration
   }
   source.close();await output.finalize();checkCanceled(signal);const file=await handle.getFile()
   await verifySegment({file,videoCodec:first.codec,audioCodec:null,expectedDuration:offset,level:'deep',signal,expectedVideo:fingerprint.digest(),expectedVideoTime:timeline})
   complete=true;onProgress(1,'合并及深度校验完成');return {filename,bytes:file.size}
  }finally{if(!complete){await output?.cancel().catch(()=>{});await folder.removeEntry(filename).catch(()=>{})}}
 }finally{for(const input of inputs)input.dispose()}
}
