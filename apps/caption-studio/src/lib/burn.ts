import {FFmpeg} from '@ffmpeg/ffmpeg';
import {fetchFile,toBlobURL} from '@ffmpeg/util';
import {toSRT,type CaptionStyle,type Cue} from './captions';
const CORE='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
const INTER='https://raw.githubusercontent.com/sudesh1456/whisper-caption-editor/main/public/fonts/Inter-Regular.ttf';
let instance:FFmpeg|null=null;
async function createFFmpeg(){
  if(instance)return instance;
  const ff=new FFmpeg();
  await ff.load({coreURL:await toBlobURL(`${CORE}/ffmpeg-core.js`,'text/javascript'),wasmURL:await toBlobURL(`${CORE}/ffmpeg-core.wasm`,'application/wasm')});
  instance=ff;return ff;
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
export interface BurnOptions{file:File;cues:Cue[];style:CaptionStyle;font?:File;onProgress?:(p:number)=>void;signal?:AbortSignal}
/** Requires network for the ffmpeg core and fallback font; user-selected fonts stay local. */
export async function burnVideo(o:BurnOptions):Promise<Blob>{
  const ff=await createFFmpeg();
  const base=`job-${Date.now()}`;
  const input=`${base}-input.${o.file.name.split('.').pop()?.replace(/[^a-z0-9]/gi,'')||'mp4'}`;
  const subtitle=`${base}.srt`,output=`${base}.mp4`;
  const fontName=o.font?'Noto Sans CJK SC':'Inter';
  const handler=({progress}:{progress:number})=>o.onProgress?.(Math.max(0,Math.min(1,progress)));
  ff.on('progress',handler);
  try{
    await ff.createDir(base);
    await ff.writeFile(`${base}/font.${o.font?.name.split('.').pop()||'ttf'}`,await fetchFile(o.font||INTER));
    await ff.writeFile(input,await fetchFile(o.file));
    await ff.writeFile(subtitle,new TextEncoder().encode(toSRT(o.cues)));
    const filter=`subtitles=${subtitle}:fontsdir=${base}:force_style='${toStyle(o.style,fontName)}'`;
    const code=await ff.exec(['-i',input,'-vf',filter,'-c:v','libx264','-preset','ultrafast','-crf','23','-c:a','aac','-movflags','+faststart',output],-1,{signal:o.signal});
    if(code!==0)throw Error(`FFmpeg 渲染失败，退出码 ${code}`);
    const result=await ff.readFile(output);
    return new Blob([result as Uint8Array<ArrayBuffer>],{type:'video/mp4'});
  }finally{
    ff.off('progress',handler);
    await Promise.allSettled([ff.deleteFile(input),ff.deleteFile(subtitle),ff.deleteFile(output),ff.deleteFile(`${base}/font.${o.font?.name.split('.').pop()||'ttf'}`),ff.deleteDir(base)]);
  }
}
