export const rates=[.25,.5,.75,1,1.25,1.5,2] as const;
export type PlaybackPreferences={volume:number;muted:boolean;rate:number};
const key='frameslice.playback.v1';
export function readPlaybackPreferences():PlaybackPreferences{
 try{
  const p=JSON.parse(localStorage.getItem(key)||'null');
  if(p&&typeof p.volume==='number'&&Number.isFinite(p.volume)&&p.volume>=0&&p.volume<=1&&typeof p.muted==='boolean'&&rates.some(r=>r===p.rate))return {volume:p.volume,muted:p.muted,rate:p.rate};
 }catch{}
 return {volume:1,muted:false,rate:1};
}
export function restorePlayback(v:HTMLVideoElement){
 const p=readPlaybackPreferences();v.volume=p.volume;v.muted=p.muted;v.playbackRate=p.rate;
}
export function savePlayback(v:HTMLVideoElement){
 if(!rates.some(r=>r===v.playbackRate)||!Number.isFinite(v.volume))return;
 try{localStorage.setItem(key,JSON.stringify({volume:v.volume,muted:v.muted,rate:v.playbackRate}))}catch{}
}
