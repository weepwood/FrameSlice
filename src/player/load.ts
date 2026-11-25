// Both independently built applications load the same ESM URL. The browser
// module map deduplicates evaluation and transfer; no second controller runtime.
import {version} from '../../package.json';
let pending:Promise<void>|undefined;
export function loadMediaPlayer():Promise<void>{
 if(customElements.get('media-controller'))return Promise.resolve();
 if(!pending){
  const url=new URL('/FrameSlice/player/media-chrome.js?v='+encodeURIComponent(version),location.origin).href;
  pending=(import.meta.env.DEV?import('./register'):import(/* @vite-ignore */url))
   .then(()=>{if(!customElements.get('media-controller'))throw Error('播放器组件注册失败')})
   .catch(error=>{pending=undefined;throw error});
 }
 return pending;
}
