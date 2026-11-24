/** Non-fragmented, UTF-8 tx3g text export. Strictly bounded sample tables and simple edits. */
import {boxes,type Box} from './mp4-track-guard'
import {checkCanceled} from './format'
import {normalizeSubtitleText} from './subtitle-track.mjs'
const utf8=new TextDecoder('utf-8',{fatal:true})
const LIMIT=50000
const single=(list:Box[],kind:string)=>{const found=list.filter(x=>x.type===kind);if(found.length!==1)throw Error('缺少或重复 MP4 '+kind);return found[0]}
async function children(file:Blob,b:Box){return boxes(file,b.payload,b.end)}
async function metadata(file:Blob,b:Box){if(b.end-b.payload>4000000)throw Error('MP4 字幕元数据过大');return new DataView(await file.slice(b.payload,b.end).arrayBuffer())}
function u64(v:DataView,o:number){const n=Number(v.getBigUint64(o));if(!Number.isSafeInteger(n))throw Error('MP4 大整数超限');return n}
function ticks(v:DataView){const version=v.getUint8(0);if(version!==0&&version!==1)throw Error('未知 MP4 时间版本');const n=v.getUint32(version===1?20:12);if(!n)throw Error('无效时间基准');return n}
async function inventory(file:Blob){const top=await boxes(file,0,file.size),moov=single(top,'moov'),list=await children(file,moov),tracks=list.filter(b=>b.type==='trak');if(tracks.length>64||top.some(b=>b.type==='moof')||list.some(b=>b.type==='mvex'))throw Error('不支持分片 MP4 字幕');return {top,list,tracks}}
async function tables(file:Blob,track:Box){const list=await children(file,track),mdia=await children(file,single(list,'mdia')),minf=await children(file,single(mdia,'minf')),stbl=await children(file,single(minf,'stbl')),desc=single(stbl,'stsd'),v=await metadata(file,desc);if(v.byteLength<16||v.getUint32(4)!==1||String.fromCharCode(...new Uint8Array(v.buffer,12,4))!=='tx3g')throw Error('不是单描述 tx3g 字幕轨');return {list,mdia,stbl}}
export async function listMp4TextTracks(file:Blob){try{const {tracks}=await inventory(file),out:number[]=[];for(const [i,t] of tracks.entries()){try{await tables(file,t);out.push(i)}catch{}}return out}catch{return []}}
function stamp(ms:number){const n=Math.round(ms);return [Math.floor(n/3600000),Math.floor(n/60000)%60,Math.floor(n/1000)%60].map(x=>String(x).padStart(2,'0')).join(':')+'.'+String(n%1000).padStart(3,'0')}
export async function extractMp4Text(file:Blob,index:number,signal:AbortSignal){
 const {top,list,tracks}=await inventory(file);if(!Number.isInteger(index)||!tracks[index])throw Error('无效 MP4 字幕索引')
 const t=await tables(file,tracks[index]),scale=ticks(await metadata(file,single(t.mdia,'mdhd'))),movieScale=ticks(await metadata(file,single(list,'mvhd')))
 if(t.stbl.some(b=>['ctts','stz2','senc','saiz','saio'].includes(b.type)))throw Error('不支持复杂时间表或加密字幕')
 let offset=0,windowStart=0,windowEnd=Infinity
 const edts=t.list.find(b=>b.type==='edts')
 if(edts){const v=await metadata(file,single(await children(file,edts),'elst')),version=v.getUint8(0),count=v.getUint32(4),width=version===1?20:12;if(version>1||count<1||count>2||v.byteLength!==8+count*width)throw Error('不支持复杂 edit list');let empty=0,mediaCount=0
  for(let i=0;i<count;i++){const p=8+i*width,dur=version===1?u64(v,p):v.getUint32(p),time=version===1?Number(v.getBigInt64(p+8)):v.getInt32(p+4),rate=v.getInt32(p+width-4);if(rate!==65536||!Number.isSafeInteger(time)||!dur)throw Error('不支持变速字幕 edit list');if(time===-1&&i===0&&count===2){empty=dur/movieScale*1000;continue}if(time<0||++mediaCount!==1)throw Error('不支持复杂字幕 edit list');windowStart=time/scale*1000;windowEnd=windowStart+dur/movieScale*1000;offset=empty-windowStart}
  if(mediaCount!==1)throw Error('缺少有效字幕 edit list')
 }
 const sizes=await metadata(file,single(t.stbl,'stsz')),fixed=sizes.getUint32(4),n=sizes.getUint32(8);if(n<1||n>LIMIT||sizes.byteLength!==12+(fixed?0:n*4))throw Error('字幕样本数量异常')
 const size=(i:number)=>fixed||sizes.getUint32(12+4*i)
 const time=await metadata(file,single(t.stbl,'stts')),entries=time.getUint32(4);if(entries<1||entries>LIMIT||time.byteLength!==8+entries*8)throw Error('字幕时间表异常')
 const durations:number[]=[];for(let i=0;i<entries;i++){const c=time.getUint32(8+8*i),d=time.getUint32(12+8*i);if(durations.length+c>n)throw Error('字幕时间数量不一致');for(let j=0;j<c;j++)durations.push(d)}if(durations.length!==n)throw Error('字幕时间数量不一致')
 const map=await metadata(file,single(t.stbl,'stsc')),m=map.getUint32(4);if(m<1||m>LIMIT||map.byteLength!==8+m*12||map.getUint32(8)!==1)throw Error('字幕 chunk 表异常')
 const chunks=t.stbl.filter(b=>b.type==='stco'||b.type==='co64');if(chunks.length!==1)throw Error('字幕偏移表异常')
 const off=await metadata(file,chunks[0]),cn=off.getUint32(4),wide=chunks[0].type==='co64',w=wide?8:4;if(cn<1||cn>LIMIT||off.byteLength!==8+cn*w)throw Error('字幕 chunk 数量异常')
 for(let i=0;i<m;i++){const p=8+i*12;if(map.getUint32(p)>cn||i>0&&map.getUint32(p)<=map.getUint32(p-12)||!map.getUint32(p+4)||map.getUint32(p+8)!==1)throw Error('字幕 chunk 映射无效')}
 const mdats=top.filter(b=>b.type==='mdat'),cues:string[]=[];let sample=0,chunkMap=0,cursor=0,total=0
 for(let chunk=1;chunk<=cn;chunk++){checkCanceled(signal);if(chunkMap+1<m&&map.getUint32(8+(chunkMap+1)*12)===chunk)chunkMap++;const num=map.getUint32(12+chunkMap*12);let pos=wide?u64(off,8+(chunk-1)*w):off.getUint32(8+(chunk-1)*w)
  for(let j=0;j<num;j++){checkCanceled(signal);if(sample>=n)throw Error('字幕样本映射超限');const bytes=size(sample),duration=durations[sample++],start=cursor/scale*1000,end=(cursor+duration)/scale*1000;cursor+=duration;total+=bytes
   if(bytes<2||bytes>16384||total>4000000||!Number.isSafeInteger(pos+bytes)||!mdats.some(b=>pos>=b.payload&&pos+bytes<=b.end))throw Error('字幕样本越界或超限')
   const data=new Uint8Array(await file.slice(pos,pos+bytes).arrayBuffer());pos+=bytes;const length=new DataView(data.buffer).getUint16(0);if(length>bytes-2)throw Error('字幕文本长度异常');if(!length)continue
   if(end<=windowStart||start>=windowEnd)continue
   // Clip only at explicit presentation edit bounds. Styling modifiers are intentionally omitted.
   const begin=Math.max(start,windowStart)+offset,finish=Math.min(end,windowEnd)+offset;if(begin<0||Math.round(finish)<=Math.round(begin))throw Error('字幕时间异常')
   const raw=utf8.decode(data.subarray(2,2+length)).replace(/\r\n?/g,'\n').trim();if(!raw||raw.includes('\0')||/\n\s*\n/.test(raw))throw Error('无法无歧义转换 tx3g 文本')
   cues.push(stamp(begin)+' --> '+stamp(finish)+'\n'+raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'\n')
  }
 }
 if(sample!==n||!cues.length)throw Error('字幕样本数量不一致或无文本')
 const result=normalizeSubtitleText('WEBVTT\n\n'+cues.join('\n'),'vtt');if(result.count!==cues.length)throw Error('字幕条目回读不一致');return result
}
