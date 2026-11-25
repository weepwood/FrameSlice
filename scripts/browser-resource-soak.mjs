import {chromium} from 'playwright-core';
import {readFile,writeFile} from 'node:fs/promises';
const durationMs=Number(process.env.SOAK_MS||120000);
if(!Number.isInteger(durationMs)||durationMs<30000||durationMs>600000)throw Error('SOAK_MS must be 30–600 seconds');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
const report={kind:'thumbnail-resource-soak',durationMs,status:'failed',cycles:0,windows:0,maxLivePreviewUrls:0,samples:[],errors:[]};
const start=Date.now();
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  const live=new Set();let created=0,released=0;
  URL.createObjectURL=blob=>{const url=create(blob);if(blob.type==='image/jpeg'){live.add(url);created++}return url};
  URL.revokeObjectURL=url=>{if(live.delete(url))released++;return revoke(url)};
  window.__previewStats=()=>({live:live.size,created,released});
 });
 await page.goto(process.env.APP_URL??'http://127.0.0.1:4173/FrameSlice/',{waitUntil:'networkidle'});
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 const input=page.locator('input[type=file][accept^="video/*,.mp4"]');
 const bytes=Buffer.from((await readFile(new URL('../tests/fixtures/many-keyframes-h264.mp4.b64',import.meta.url),'utf8')).trim(),'base64');
 const timeline=page.getByRole('region',{name:'媒体时间轴'});
 const stats=()=>page.evaluate(()=>window.__previewStats());
 const sample=async()=>{const {metrics}=await cdp.send('Performance.getMetrics');const urls=await stats();report.samples.push({elapsedMs:Date.now()-start,mainJsHeapBytes:metrics.find(m=>m.name==='JSHeapUsedSize')?.value??null,...urls});report.maxLivePreviewUrls=Math.max(report.maxLivePreviewUrls,urls.live)};
 do{
  await input.setInputFiles({name:'soak-'+report.cycles+'.mp4',mimeType:'video/mp4',buffer:bytes});
  await page.locator('.file-codec').waitFor();
  if((await stats()).live!==0)throw Error('previous source retained preview URLs');
  await timeline.getByRole('button',{name:'放大时间轴'}).click();
  await timeline.getByRole('button',{name:'放大时间轴'}).click();
  await timeline.getByRole('button',{name:'放大时间轴'}).click();
  const offset=timeline.getByRole('slider',{name:'移动时间轴视窗'});
  for(let i=0;i<8;i++){
   await offset.fill(String(i*6));
   await timeline.getByRole('button',{name:'生成缩略图'}).click();
   await timeline.getByRole('button',{name:'生成缩略图'}).waitFor({timeout:30000});
   if(!(await timeline.locator('img').count()))throw Error('empty preview window');
   const v=await stats();if(v.live>78||v.created-v.released!==v.live)throw Error('thumbnail cache bound or accounting violated '+JSON.stringify(v));
   report.windows++;await sample();
   await page.waitForTimeout(150);
  }
  report.cycles++;
  // Let queued callbacks settle before exercising another source in the same page.
  await page.waitForTimeout(500);
 }while(Date.now()-start<durationMs);
 await input.setInputFiles({name:'final-source.mp4',mimeType:'video/mp4',buffer:bytes});
 await page.locator('.file-codec').waitFor();
 const end=await stats();
 if(end.live!==0||end.created!==end.released||report.errors.length||report.cycles<2)throw Error('final cleanup or runtime failure '+JSON.stringify(end));
 report.final=end;await sample();report.status='passed';
}catch(e){report.errors.push(String(e));process.exitCode=1}
finally{report.elapsedMs=Date.now()-start;await writeFile('browser-resource-soak.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,samples:report.samples.length}));await browser.close()}
