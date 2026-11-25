import {chromium,firefox,webkit} from 'playwright-core';
import {readFile,writeFile} from 'node:fs/promises';
const engine=process.env.BROWSER_ENGINE??'chromium',type={chromium,firefox,webkit}[engine];
if(!type)throw Error('unknown browser');
const browser=await type.launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROME_PATH,args:['--no-sandbox']}:{})});
const report={engine,version:browser.version(),status:'failed'};
// Uncompressed PCM WAV tests playback independently of OS-specific H.264 codecs.
const samples=8000*8,wav=Buffer.alloc(44+samples*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(1200*Math.sin(2*Math.PI*440*i/8000)),44+i*2);
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},locale:'zh-CN'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APP_URL??'http://127.0.0.1:4173/FrameSlice/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'隐藏检查器'}).click();await page.getByRole('button',{name:'显示检查器'}).click();
 const bytes=Buffer.from((await readFile(new URL('../tests/fixtures/many-keyframes-h264.mp4.b64',import.meta.url),'utf8')).trim(),'base64');
 await page.locator('input[type=file][accept^="video/*,.mp4"]').setInputFiles({name:'cross.mp4',mimeType:'video/mp4',buffer:bytes});
 const vue=page.locator('.fs-preview-panel media-controller');await vue.locator('media-play-button').waitFor();
 const state=async video=>video.evaluate(v=>new Promise(resolve=>{const started=performance.now();const t=setInterval(()=>{if(v.readyState>=1||v.error||performance.now()-started>12000){clearInterval(t);resolve({ready:v.readyState>=1,error:v.error?.code??null,duration:v.duration})}},50)}));
 const native=await state(vue.locator('video'));
 if(native.ready){await vue.locator('media-seek-forward-button').click();if(await vue.locator('video').evaluate(v=>v.currentTime)<4.9)throw Error('Vue seek failed');report.h264='passed'}
 else if(native.error===3||native.error===4)report.h264='native-codec-unavailable';
 else throw Error('unexpected H264 load state '+JSON.stringify(native));
 await page.getByRole('button',{name:'字幕工作台',exact:true}).click();
 const host=page.locator('.caption-react-host');await host.locator('[data-save=saved]').waitFor();
 await host.locator('input[accept^="video/"]').setInputFiles({name:'cross.wav',mimeType:'audio/wav',buffer:wav});
 const cp=host.locator('media-controller');await cp.locator('media-play-button').waitFor();
 const video=cp.locator('video'),audio=await state(video);
 if(!audio.ready||Math.abs(audio.duration-8)>.1)throw Error('WAV not ready '+JSON.stringify(audio));
 await cp.locator('media-time-range input').fill('0.5');
 if(Math.abs(await video.evaluate(v=>v.currentTime)-4)>.2)throw Error('WAV seek failed');
 await cp.locator('media-mute-button').click();
 if(!await video.evaluate(v=>v.muted))throw Error('WAV mute failed');
 await cp.locator('media-playback-rate-menu-button').click();await cp.locator('media-playback-rate-menu').getByRole('menuitemradio',{name:'1.25x',exact:true}).click();
 if(await video.evaluate(v=>v.playbackRate)===1)throw Error('WAV rate failed');
 await cp.locator('media-play-button').click();await video.evaluate(v=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('audio playback did not start')),5000);if(!v.paused){clearTimeout(t);resolve()}else v.addEventListener('play',()=>{clearTimeout(t);resolve()},{once:true})}));
 await cp.locator('media-play-button').click();if(!await video.evaluate(v=>v.paused))throw Error('WAV pause failed');
 if(errors.length)throw Error(errors.join('; '));
 report.audio='passed';report.status='passed';console.log(JSON.stringify(report));
}finally{await writeFile('browser-fluent-cross-'+engine+'.json',JSON.stringify(report,null,2));await browser.close()}
