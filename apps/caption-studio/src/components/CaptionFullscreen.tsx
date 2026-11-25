import {useEffect,useState,type RefObject} from 'react';
import {Maximize,Minimize} from 'lucide-react';

/** The embedded editor's shadow host is a div. Media Chrome's fullscreen
 * detection assumes a custom-element host, so adapt only this boundary. */
export function CaptionFullscreen({video,onError}:{video:RefObject<HTMLVideoElement|null>;onError:(message:string)=>void}){
 const [active,setActive]=useState(false);
 const enabled=typeof document!=='undefined'&&document.fullscreenEnabled;
 const target=()=>video.current?.closest<HTMLElement>('media-controller');
 useEffect(()=>{
  const sync=()=>{const el=target(),root=el?.getRootNode();setActive(!!el&&(root instanceof ShadowRoot?root.fullscreenElement===el:document.fullscreenElement===el))};
  document.addEventListener('fullscreenchange',sync);sync();
  return()=>document.removeEventListener('fullscreenchange',sync);
 },[video]);
 const toggle=async()=>{
  const el=target();if(!el||!enabled)return;
  try{if(active)await document.exitFullscreen();else await el.requestFullscreen()}
  catch{onError('当前浏览器未能切换播放器全屏。')}
 };
 return <button type="button" className="fs-player-loop fs-player-fullscreen" aria-label={active?'退出全屏':'进入全屏'} title={active?'退出全屏':'进入全屏'} disabled={!enabled} onClick={()=>void toggle()}>{active?<Minimize size={17}/>:<Maximize size={17}/>}</button>
}
