import {FFmpeg} from '@ffmpeg/ffmpeg';
import {validateBurnInput} from './burn-limits';
import {toSRT,type CaptionStyle,type Cue} from './captions';
const CORE='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
const INTER='https://raw.githubusercontent.com/sudesh1456/whisper-caption-editor/main/public/fonts/Inter-Regular.ttf';
function checkAbort(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('已取消烧录','AbortError');}
async function resourceURL(url:string,type:string,signal?:AbortSignal){
  const response=await fetch(url,{signal,credentials:'omit'});
  if(!response.ok)throw Error('烧录运行时下载失败：HTTP '+response.status);
  const blob=await response.blob();checkAbort(signal);
  return URL.createObjectURL(new Blob([blob],{type}));
}
const assColor=(hex:string,alpha=1)=>{
  const clean=hex.replace('#','');
  const a=Math.round((1-Math.max(0,Math.min(alpha,1)))*255).toString(16).padStart(2,'0');
  return `&H${a}${clean.slice(4,6)}${clean.slice(2,4)}${clean.slice(0,2)}`.toUpperCase();
};
function toStyle(s:CaptionStyle,fontName:string){
  const alignment={bottom:2,middle:10,top:6}[s.position];
  return [
    `FontName=${fontName.replace(/[',:=]/g,'')}`,`FontSize=${Math.round(s.fontSize*288/1080)}`,
    `PrimaryColour=${assColor(s.textColor)}`,
    `BackColour=${assColor(s.boxColor,s.boxOpacity)}`,
    `OutlineColour=${assColor(s.boxColor,s.boxOpacity)}`,
    `Bold=${s.bold?1:0}`,'BorderStyle=3','Outline=2','Shadow=0',`Alignment=${alignment}`,'MarginV=24'
  ].join(',');
}
export interface BurnOptions{file:File;duration:number;width:number;height:number;cues:Cue[];style:CaptionStyle;font?:File;onProgress?:(p:number)=>void;signal?:AbortSignal}
/** Requires network for the ffmpeg core and fallback font; user-selected fonts stay local. */
export async function burnVideo(o:BurnOptions):Promise<Blob>{
  validateBurnInput(o.file.size,o.duration,o.width,o.height,o.font?.size??0);
  checkAbort(o.signal);
  const ff=new FFmpeg();
  const urls:string[]=[];
  const abort=()=>ff.terminate();
  o.signal?.addEventListener('abort',abort,{once:true});
  const base=`job-${Date.now()}`;
  const input=`${base}-input.${o.file.name.split('.').pop()?.replace(/[^a-z0-9]/gi,'')||'mp4'}`;
  const subtitle=`${base}.srt`,output=`${base}.mp4`;
  const fontName=o.font?'Noto Sans CJK SC':'Inter';
  const handler=({progress}:{progress:number})=>o.onProgress?.(Math.max(0,Math.min(1,progress)));
  ff.on('progress',handler);
  try{
    const coreURL=await resourceURL(`${CORE}/ffmpeg-core.js`,'text/javascript',o.signal);urls.push(coreURL);
    const wasmURL=await resourceURL(`${CORE}/ffmpeg-core.wasm`,'application/wasm',o.signal);urls.push(wasmURL);
    checkAbort(o.signal);
    await ff.load({coreURL,wasmURL});checkAbort(o.signal);
    await ff.createDir(base);
    const fontResponse=o.font?null:await fetch(INTER,{signal:o.signal,credentials:'omit'});
    if(fontResponse&&!fontResponse.ok)throw Error('默认字体下载失败');
    const fontData=new Uint8Array(await (o.font??fontResponse!).arrayBuffer());checkAbort(o.signal);
    await ff.writeFile(`${base}/font.${o.font?.name.split('.').pop()?.replace(/[^a-z0-9]/gi,'')||'ttf'}`,fontData);
    const videoData=new Uint8Array(await o.file.arrayBuffer());checkAbort(o.signal);
    await ff.writeFile(input,videoData);checkAbort(o.signal);
    await ff.writeFile(subtitle,new TextEncoder().encode(toSRT(o.cues)));
    const filter=`subtitles=${subtitle}:fontsdir=${base}:force_style='${toStyle(o.style,fontName)}'`;
    const code=await ff.exec(['-i',input,'-vf',filter,'-c:v','libx264','-preset','ultrafast','-crf','23','-c:a','aac','-movflags','+faststart',output],-1,{signal:o.signal});
    checkAbort(o.signal);
    if(code!==0)throw Error(`FFmpeg 渲染失败，退出码 ${code}`);
    const result=await ff.readFile(output);
    checkAbort(o.signal);
    return new Blob([result as Uint8Array<ArrayBuffer>],{type:'video/mp4'});
  }finally{
    ff.off('progress',handler);
    o.signal?.removeEventListener('abort',abort);
    ff.terminate();
    urls.forEach(url=>URL.revokeObjectURL(url));
  }
}
