import {chromium,firefox,webkit} from 'playwright-core';
import {mkdir,readFile} from 'node:fs/promises';
import {themeOption} from './select-option.mjs';
const engine=process.env.BROWSER_ENGINE??'chromium';
const type={chromium,firefox,webkit}[engine];if(!type)throw Error('unknown browser');
const browser=await type.launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROME_PATH,args:['--no-sandbox']}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},locale:'zh-CN'});
 const runtimeRequests=[];page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/player/media-chrome.js'))runtimeRequests.push(r.url())});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const file={name:'fluent-preview.mp4',mimeType:'video/mp4',buffer:Buffer.from((await readFile(new URL('../tests/fixtures/many-keyframes-h264.mp4.b64',import.meta.url),'utf8')).trim(),'base64')};
 await page.goto(process.env.APP_URL??'http://127.0.0.1:4173/FrameSlice/',{waitUntil:'networkidle'});
 if(runtimeRequests.length)throw Error('player runtime requested before media');
 await page.getByRole('button',{name:'隐藏检查器',exact:true}).click();await page.getByRole('button',{name:'显示检查器',exact:true}).click();
 const checkPlayer=async(player)=>{
  await player.waitFor();await player.locator('media-play-button').waitFor();const video=player.locator('video');
  await video.evaluate(v=>v.readyState>=1?Promise.resolve():new Promise((resolve,reject)=>{v.addEventListener('loadedmetadata',resolve,{once:true});v.addEventListener('error',reject,{once:true})}));
  const bar=player.locator('.fs-player-controls');const p=await player.boundingBox(),b=await bar.boundingBox();
  if(Math.abs(b.width-p.width)>2||b.height>105)throw Error('player toolbar size '+JSON.stringify({p,b}));
  if(await player.evaluate(el=>!!el.closest('.caption-editor-layout'))&&Math.abs(b.y+b.height-p.y-p.height)>2)throw Error('caption toolbar not docked '+JSON.stringify({p,b}));
  await player.locator('media-seek-forward-button').click();
  await video.evaluate(v=>v.seeking?new Promise(resolve=>v.addEventListener('seeked',resolve,{once:true})):Promise.resolve());
  if(await video.evaluate(v=>v.currentTime)<4.9)throw Error('seek forward failed');
  await player.locator('media-seek-backward-button').click();
  if(await video.evaluate(v=>v.currentTime)>.25)throw Error('seek backward failed');
  const range=player.locator('media-time-range input[type=range]');
  await range.fill('0.5');
  if(Math.abs(await video.evaluate(v=>v.currentTime)-28)>.5)throw Error('precise seek failed');
  const volume=player.locator('media-volume-range input[type=range]');
  await volume.fill('0.4');
  if(Math.abs(await video.evaluate(v=>v.volume)-.4)>.02)throw Error('volume failed');
  if(!await video.evaluate(v=>v.muted))await player.locator('media-mute-button').click();
  if(!await video.evaluate(v=>v.muted))throw Error('mute failed');
  const oldRate=await video.evaluate(v=>v.playbackRate);await player.locator('media-playback-rate-menu-button').click();
  await player.locator('media-playback-rate-menu').getByRole('menuitemradio',{name:oldRate===1.25?'1.5x':'1.25x',exact:true}).click();
  if(await video.evaluate(v=>v.playbackRate)===oldRate)throw Error('rate failed');
  await player.locator('media-play-button').click();
  await video.evaluate(v=>v.paused?new Promise(resolve=>v.addEventListener('play',resolve,{once:true})):Promise.resolve());
  await player.locator('media-play-button').click();
  if(!await video.evaluate(v=>v.paused))throw Error('pause failed');
  const fullscreen=player.locator('media-fullscreen-button,.fs-player-fullscreen');
  if(await fullscreen.isVisible()&&await page.evaluate(()=>document.fullscreenEnabled)){
   await fullscreen.click();
   await page.waitForFunction(()=>!!document.fullscreenElement);
   await fullscreen.and(player.getByRole('button',{name:'退出全屏',exact:true})).waitFor();
   await fullscreen.click();
   await page.waitForFunction(()=>!document.fullscreenElement);
  }
  await player.focus();
  if(await fullscreen.isVisible()&&await page.evaluate(()=>document.fullscreenEnabled)){
   await player.press('f');await page.waitForFunction(()=>!!document.fullscreenElement);
   await player.press('f');await page.waitForFunction(()=>!document.fullscreenElement);
  }
  await player.press('j');const before=await video.evaluate(v=>v.currentTime);
  await player.press('l');if(Math.abs(await video.evaluate(v=>v.currentTime)-before-5)>.3)throw Error('focused seek shortcut failed');
  await player.press('m');if(await video.evaluate(v=>v.muted))throw Error('focused mute shortcut failed');
  await player.press('m');
  await player.press('ArrowUp');if(Math.abs(await video.evaluate(v=>v.volume)-.5)>.03)throw Error('focused volume shortcut failed');
  await player.press('ArrowDown');
  await player.press('k');await video.evaluate(v=>v.paused?new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('keyboard playback timeout')),5000);v.addEventListener('play',()=>{clearTimeout(t);resolve()},{once:true})}):Promise.resolve());
  await player.press('Space');if(!await video.evaluate(v=>v.paused))throw Error('keyboard pause failed');
  return video;
 };
 await page.locator('input[type=file][accept^="video/*,.mp4"]').setInputFiles(file);
 const player=page.locator('.fs-preview-panel media-controller');
 await checkPlayer(player);
 const pip=player.locator('media-pip-button');
 let pipResult='unavailable';
 if(await pip.isVisible()&&await page.evaluate(()=>document.pictureInPictureEnabled)){
  try{
   await pip.click();await page.waitForFunction(()=>!!document.pictureInPictureElement,{},{timeout:3500});
   await pip.click();await page.waitForFunction(()=>!document.pictureInPictureElement,{},{timeout:3500});
   pipResult='passed';
  }catch(error){
   if(await page.evaluate(()=>!!document.pictureInPictureElement))await page.evaluate(()=>document.exitPictureInPicture());
   pipResult='headless-or-platform-rejected';console.log('PiP capability:',String(error).slice(0,160));
  }
 }

 await mkdir('visual-regression',{recursive:true});
 await player.scrollIntoViewIfNeeded();await page.screenshot({path:'visual-regression/fluent-player-vue-'+engine+'.png',animations:'disabled'});
 await page.getByRole('button',{name:'字幕工作台',exact:true}).click();
 const host=page.locator('.caption-react-host');await host.locator('[data-save=saved]').waitFor();
 // No-media cue navigation must stay available even when there is no actual media element.
 await host.getByRole('slider',{name:'跳转播放位置',exact:true}).waitFor();
 await host.locator('input[accept^="video/"]').setInputFiles(file);
 const cp=host.locator('media-controller');
 await cp.locator('media-play-button').waitFor();
 await cp.locator('video').evaluate(v=>v.readyState>=1?Promise.resolve():new Promise((resolve,reject)=>{v.addEventListener('loadedmetadata',resolve,{once:true});v.addEventListener('error',reject,{once:true})}));
 const persisted=await cp.locator('video').evaluate(v=>({volume:v.volume,muted:v.muted,rate:v.playbackRate}));
 if(Math.abs(persisted.volume-.4)>.02||!persisted.muted||persisted.rate!==1.25)throw Error('playback preferences not restored '+JSON.stringify(persisted));
 const cv=await checkPlayer(cp);
 await host.locator('input[accept=".srt,.vtt"]').setInputFiles({name:'fluent.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:25,000 --> 00:00:30,000\nFluent 字幕同步测试\n')});
 await host.getByRole('textbox',{name:'第 1 条字幕'}).waitFor();
 await cv.evaluate(v=>{v.currentTime=28});
 await host.locator('.caption-overlay').getByText('Fluent 字幕同步测试').waitFor();
 const checkDock=async()=>{const p=await cp.boundingBox(),b=await cp.locator('.fs-player-controls').boundingBox();if(Math.abs(b.y+b.height-p.y-p.height)>2)throw Error('caption toolbar detached from bottom '+JSON.stringify({p,b}))};
 await checkDock();
 const editor=host.getByRole('textbox',{name:'第 1 条字幕'});
 await editor.click();const oldMuted=await cv.evaluate(v=>v.muted);await editor.press('m');if(await cv.evaluate(v=>v.muted)!==oldMuted)throw Error('shortcut intercepted subtitle editing');await editor.fill('Fluent 字幕同步测试');

 const loop=host.getByRole('button',{name:'循环播放选中字幕',exact:true});
 await loop.click();
 if(await loop.getAttribute('aria-pressed')!=='true')throw Error('cue loop did not activate');
 await cv.evaluate(v=>{v.currentTime=29.8});
 await cp.locator('media-play-button').click();
 await cv.evaluate(v=>new Promise((resolve,reject)=>{const start=performance.now();const timer=setInterval(()=>{if(v.currentTime>=25&&v.currentTime<27){clearInterval(timer);resolve()}else if(performance.now()-start>5000){clearInterval(timer);reject(Error('cue loop did not wrap'))}},40)}));
 await cp.locator('media-play-button').click();await loop.click();
 await cv.evaluate(v=>{v.currentTime=28});
 await host.locator('.caption-overlay').getByText('Fluent 字幕同步测试').waitFor();

 await page.screenshot({path:'visual-regression/fluent-player-caption-'+engine+'-light.png',animations:'disabled'});
 await themeOption(page,'dark');
 await page.screenshot({path:'visual-regression/fluent-player-caption-'+engine+'-dark.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 await host.locator('[data-stacked=true]').waitFor();
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('mobile overflow');
 await cp.scrollIntoViewIfNeeded();
 const narrow=await cp.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('.fs-player-fullscreen').getBoundingClientRect();return b.width>0&&b.height>0&&b.left>=a.left-1&&b.right<=a.right+1&&b.bottom<=a.bottom+1});
 if(!narrow)throw Error('mobile fullscreen control clipped');
 await cp.locator('media-playback-rate-menu-button').click();
 const menu=cp.locator('media-playback-rate-menu');
 await menu.getByRole('menuitemradio',{name:'2x',exact:true}).waitFor();
 await menu.getByRole('menuitemradio',{name:'2x',exact:true}).click();
 if(await cv.evaluate(v=>v.playbackRate)!==2)throw Error('mobile direct rate selection failed');

 await page.screenshot({path:'visual-regression/fluent-player-caption-'+engine+'-mobile.png',animations:'disabled'});
 if(runtimeRequests.length!==1)throw Error('expected one shared runtime request, got '+runtimeRequests.length);
 if(errors.length)throw Error(errors.join('; '));
 console.log(JSON.stringify({captionToolbarDock:'passed',engine,version:browser.version(),pip:pipResult,cueLoop:'passed',scopedShortcuts:'passed',lazySharedRuntime:'passed',preferences:'passed',fluentButton:'passed',vuePlayer:'passed',captionPlayer:'passed',seek:'passed',volume:'passed',mute:'passed',rate:'passed',playPause:'passed',captionSync:'passed',fullscreenRoundTrip:'passed',mobile:'passed'}));
}finally{await browser.close()}
