// Conservative browser WASM limits, not a guarantee of available RAM.
export const BURN_MAX_BYTES=64*1024*1024;
export const BURN_MAX_SECONDS=300;
export const BURN_MAX_PIXELS=1920*1080;
export function validateBurnInput(bytes:number,duration:number,width:number,height:number,fontBytes=0){
  if(!Number.isSafeInteger(bytes)||bytes<=0||bytes>BURN_MAX_BYTES)throw Error('网页烧录仅支持不超过 64 MiB 的视频；大文件请使用软字幕封装。');
  if(!Number.isFinite(duration)||duration<=0||duration>BURN_MAX_SECONDS)throw Error('网页烧录仅支持已知时长且不超过 5 分钟的视频。');
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width*height>BURN_MAX_PIXELS)throw Error('网页烧录仅支持不超过 1080p 像素预算的视频。');
  if(!Number.isSafeInteger(fontBytes)||fontBytes<0||fontBytes>16*1024*1024)throw Error('自定义字体不得超过 16 MiB。');
}
