/** Bounded random-access ISO BMFF track inventory. No media payload is read. */
export interface Box {type:string;start:number;end:number;payload:number}
export async function boxes(file:Blob,start:number,end:number):Promise<Box[]>{
 const result:Box[]=[];let cursor=start
 while(cursor<end){
  if(result.length>=10000||end-cursor<8)throw Error('MP4 box 结构异常')
  const data=await file.slice(cursor,Math.min(cursor+16,end)).arrayBuffer(),v=new DataView(data)
  let length=v.getUint32(0),header=8
  const type=String.fromCharCode(...new Uint8Array(data,4,4))
  if(length===1){if(data.byteLength<16)throw Error('MP4 扩展长度缺失');length=Number(v.getBigUint64(8));header=16}
  else if(length===0)length=end-cursor
  if(!Number.isSafeInteger(length)||length<header||cursor+length>end)throw Error('MP4 box 长度异常')
  result.push({type,start:cursor,end:cursor+length,payload:cursor+header});cursor+=length
 }
 return result
}
export async function inspectMp4Handlers(file:Blob):Promise<string[]>{
 const top=await boxes(file,0,file.size),moovs=top.filter(b=>b.type==='moov')
 if(moovs.length!==1)throw Error('无法唯一识别 MP4 轨道表')
 const moov=moovs[0],tracks=(await boxes(file,moov.payload,moov.end)).filter(b=>b.type==='trak')
 if(!tracks.length||tracks.length>64)throw Error('MP4 轨道数量异常')
 const handlers:string[]=[]
 for(const track of tracks){
  const mdia=(await boxes(file,track.payload,track.end)).filter(b=>b.type==='mdia')
  if(mdia.length!==1)throw Error('MP4 媒体轨结构异常')
  const h=(await boxes(file,mdia[0].payload,mdia[0].end)).filter(b=>b.type==='hdlr')
  if(h.length!==1||h[0].end-h[0].payload<12)throw Error('MP4 轨道类型缺失')
  handlers.push(String.fromCharCode(...new Uint8Array(await file.slice(h[0].payload+8,h[0].payload+12).arrayBuffer())))
 }
 return handlers
}
export async function assertAvOnly(file:Blob,videoCount:number,audioCount:number){
 const handlers=await inspectMp4Handlers(file)
 if(handlers.length!==videoCount+audioCount||handlers.filter(x=>x==='vide').length!==videoCount||handlers.filter(x=>x==='soun').length!==audioCount)throw Error('源文件存在内嵌字幕、数据或未知轨道，拒绝无损编辑以防丢轨')
}
