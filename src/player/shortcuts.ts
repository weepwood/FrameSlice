// Scoped to the focused player. Native form fields and menu controls own their keys.
export function playerShortcut(event:KeyboardEvent,scope?:HTMLElement){
 if(event.defaultPrevented||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
 const player=scope??event.currentTarget as HTMLElement;
 if(event.composedPath().some(node=>node instanceof Element&&node!==player&&node.matches('input,textarea,select,button,a,[contenteditable],[role=button],[role=slider],[role=menu],[role=menuitemradio],[role=checkbox]')))return;
 const v=player.querySelector('video');if(!v||v.readyState<1)return;
 const key=event.key.toLowerCase();
 if(key===' '||key==='k'){event.preventDefault();if(v.paused)void v.play().catch(()=>{});else v.pause()}
 else if(key==='j'||key==='l'||key==='arrowleft'||key==='arrowright'){
  event.preventDefault();v.currentTime=Math.max(0,Math.min(Number.isFinite(v.duration)?v.duration:Infinity,v.currentTime+(['j','arrowleft'].includes(key)?-5:5)));
 }else if(key==='m'){event.preventDefault();v.muted=!v.muted}
 else if(key==='arrowup'||key==='arrowdown'){event.preventDefault();v.volume=Math.max(0,Math.min(1,v.volume+(key==='arrowup'?.1:-.1)))}
 else if(key==='f'){
  const button=player.querySelector<HTMLElement>('media-fullscreen-button,.fs-player-fullscreen');
  if(button&&button.getAttribute('aria-disabled')!=='true'&&!button.hasAttribute('disabled')&&button.getBoundingClientRect().width){event.preventDefault();button.click()}
 }
}
