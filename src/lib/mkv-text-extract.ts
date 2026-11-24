// Deliberately bounded subset of Matroska: S_TEXT/UTF8 with explicit BlockDuration.
import {checkCanceled} from './format'
import {normalizeSubtitleText} from './subtitle-track.mjs'
interface Element {id:number;start:number;end:number}
function vint(b:Uint8Array,offset:number,id=false){const first=b[offset];if(!first)throw Error('无效 EBML VINT');let n=1;while(n<=8&&!(first&(128>>(n-1))))n++;if(n>(id?4:8)||offset+n>b.length)throw Error('截断 EBML VINT');let v=id?first:first&(255>>n),unknown=!id&&v===(255>>n);for(let i=1;i<n;i++){v=v*256+b[offset+i];unknown=unknown&&b[offset+i]===255}if(!unknown&&!Number.isSafeInteger(v))throw Error('EBML 长度超出安全范围');return {n,v,unknown}}
const decoder=new TextDecoder('utf-8',{fatal:true})
function stamp(ms:number){const n=Math.round(ms);return [Math.floor(n/3600000),Math.floor(n/60000)%60,Math.floor(n/1000)%60].map(x=>String(x).padStart(2,'0')).join(':')+'.'+String(n%1000).padStart(3,'0')}
export async function extractMkvText(file:Blob,track:number,signal:AbortSignal){
 if(!Number.isSafeInteger(track)||track<1)throw Error('无效字幕轨编号')
 let count=0,scale=1000000,found=false,trackCount=0,total=0,clusters=0
 const cues:{start:number;end:number;text:string}[]=[]
 const read=async(s:number,e:number)=>{checkCanceled(signal);if(e<s||e>file.size)throw Error('EBML 读取越界');return new Uint8Array(await file.slice(s,e).arrayBuffer())}
 async function* elements(start:number,end:number,allowSegment=false):AsyncGenerator<Element>{
  for(let p=start;p<end;){if(++count>2000000)throw Error('EBML 元素数量超过安全上限');const b=await read(p,Math.min(end,p+12)),i=vint(b,0,true),s=vint(b,i.n),a=p+i.n+s.n,e=s.unknown&&allowSegment&&i.v===0x18538067?end:a+s.v;if((s.unknown&&!(allowSegment&&i.v===0x18538067))||!Number.isSafeInteger(e)||e<a||e>end)throw Error('不支持未知长度或损坏的 EBML 元素');yield {id:i.v,start:a,end:e};p=e;if((count&1023)===0)await new Promise<void>(r=>setTimeout(r,0))}
 }
 async function uint(e:Element){if(e.end-e.start<1||e.end-e.start>8)throw Error('EBML 整数无效');let v=0;for(const x of await read(e.start,e.end))v=v*256+x;if(!Number.isSafeInteger(v))throw Error('EBML 整数超限');return v}
 async function block(e:Element,base:number,duration:number|undefined){
  const head=await read(e.start,Math.min(e.end,e.start+11)),t=vint(head,0)
  if(t.v!==track)return
  if(t.unknown||head.length<t.n+3||head[t.n+2]&6)throw Error('不支持字幕块 lacing')
  if(duration===undefined||duration<=0)throw Error('字幕块没有明确持续时间')
  const relative=new DataView(head.buffer).getInt16(t.n),start=(base+relative)*scale/1e6,end=start+duration*scale/1e6
  const bytes=e.end-e.start-t.n-3;total+=bytes
  if(bytes<1||bytes>16384||total>4000000||cues.length>=50000||!Number.isFinite(end)||start<0||end<=start||Math.round(end)<=Math.round(start))throw Error('字幕块超限或时间异常')
  const text=decoder.decode(await read(e.start+t.n+3,e.end)).replace(/\r\n?/g,'\n').trim()
  if(!text||text.includes('\0')||/\n\s*\n/.test(text))throw Error('无法无歧义转换字幕文本')
  cues.push({start,end,text:text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')})
 }
 let segment:Element|undefined
 for await(const e of elements(0,file.size,true)){if(e.id===0x18538067){if(segment)throw Error('不支持多 Segment');segment=e}}
 if(!segment)throw Error('未找到 MKV Segment')
 // First pass only metadata. Never load media payloads.
 for await(const e of elements(segment.start,segment.end)){
  if(e.id===0x1549a966)for await(const x of elements(e.start,e.end))if(x.id===0x2ad7b1)scale=await uint(x)
  if(e.id===0x1654ae6b)for await(const t of elements(e.start,e.end))if(t.id===0xae){let n=0,kind=0,codec='',unsupported=false;for await(const x of elements(t.start,t.end)){if(x.id===0xd7)n=await uint(x);if(x.id===0x83)kind=await uint(x);if(x.id===0x86){if(x.end-x.start>80)throw Error('编码标识过长');codec=decoder.decode(await read(x.start,x.end))}if([0x6d80,0x23314f,0x56aa,0x56bb,0x63a2].includes(x.id))unsupported=true}if(n===track){trackCount++;found=kind===17&&codec==='S_TEXT/UTF8'&&!unsupported}}
 }
 if(!found||trackCount!==1||!Number.isSafeInteger(scale)||scale<=0)throw Error('只支持无压缩、无附加时间变换的 S_TEXT/UTF8 字幕轨')
 for await(const e of elements(segment.start,segment.end))if(e.id===0x1f43b675){
  if(++clusters>200000)throw Error('Cluster 数量超限');let base:number|undefined
  for await(const x of elements(e.start,e.end)){
   if(x.id===0xe7){if(base!==undefined)throw Error('重复 Cluster 时间戳');base=await uint(x)}
   if(x.id===0xa3||x.id===0xa0){if(base===undefined)throw Error('Cluster 缺少前置时间戳')
    if(x.id===0xa3){await block(x,base,undefined);continue}
    let b:Element|undefined,d:number|undefined
    for await(const y of elements(x.start,x.end)){if(y.id===0xa1){if(b)throw Error('重复 Block');b=y}if(y.id===0x9b)d=await uint(y)}
    if(b)await block(b,base,d)
   }
  }
 }
 if(!cues.length)throw Error('没有可导出的文本字幕')
 cues.sort((a,b)=>a.start-b.start||a.end-b.end)
 const vtt='WEBVTT\n\n'+cues.map(c=>stamp(c.start)+' --> '+stamp(c.end)+'\n'+c.text+'\n').join('\n')
 const normalized=normalizeSubtitleText(vtt,'vtt');if(normalized.count!==cues.length)throw Error('字幕条目数量不一致')
 return normalized
}
