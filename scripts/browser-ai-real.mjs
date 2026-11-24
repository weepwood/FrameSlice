/** Opt-in real inference + actual FFmpeg WASM burn on production-built app. */
import {chromium} from 'playwright-core'
import {writeFile,stat} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
const media=process.argv[2],font=process.argv[3],reportPath=process.argv[4]||'browser-ai-report.json'
if(!media||!process.env.CHROME_PATH)throw Error('Usage: CHROME_PATH=... node scripts/browser-ai-real.mjs speech.mp4 font.ttf [report.json]')
const report={kind:'real-whisper-and-ffmpeg',startedAt:new Date().toISOString(),status:'failed',errors:[],network:[],phases:{}}
let browser
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']})
 const page=await browser.newPage({acceptDownloads:true})
 page.on('dialog',d=>void d.accept())
 page.on('pageerror',e=>report.errors.push(e.message))
 page.on('requestfailed',r=>report.network.push({host:new URL(r.url()).hostname,error:r.failure()?.errorText}))
 await page.goto(process.env.APP_URL||'http://127.0.0.1:4173/FrameSlice/',{waitUntil:'networkidle'})
 await page.getByRole('button',{name:'字幕工作台'}).click()
 const panel=page.locator('.caption-react-host')
 await panel.locator('.caption-action-toolbar').waitFor({timeout:30000})
 await panel.locator('input[accept^="video/*"]').setInputFiles(media)
 await panel.locator('video').evaluate(v=>v.readyState>=1?Promise.resolve():new Promise((resolve,reject)=>{v.addEventListener('loadedmetadata',resolve,{once:true});v.addEventListener('error',reject,{once:true})}))
 await panel.locator('.transcribe-panel select').nth(0).selectOption('onnx-community/whisper-tiny.en')
 await panel.locator('.transcribe-panel select').nth(2).selectOption('wasm')
 async function infer(){
  const start=Date.now()
  await panel.getByRole('button',{name:/开始自动转录|重新生成字幕/}).click()
  await panel.locator('.transcribe-panel .task-status.done,.transcribe-panel .task-status.failed').waitFor({timeout:600000})
  if(await panel.locator('.transcribe-panel .task-status.failed').count())throw Error(await panel.locator('.transcribe-panel .task-status.failed').innerText())
  const text=(await panel.locator('.cue-row textarea').evaluateAll(nodes=>nodes.map(n=>n.value))).join(' ')
  if(!/hello|world|frameslice/i.test(text))throw Error('真实推理未生成预期测试词：'+text)
  return {elapsedMs:Date.now()-start,text}
 }
 report.phases.whisper=await infer()
 report.cache=await page.evaluate(async()=>{const entries=[];for(const name of await caches.keys()){const c=await caches.open(name);entries.push({name,count:(await c.keys()).length})}return entries})
 if(!report.cache.some(c=>c.count>0))throw Error('未检测到模型资源缓存')
 report.phases.cachedInference=await infer()
 await panel.getByRole('tab',{name:'导出'}).click()
 if(font)await panel.locator('input[accept=".ttf,.otf"]').setInputFiles(font)
 const start=Date.now()
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:600000}),panel.getByRole('button',{name:'生成带字幕 MP4'}).click()])
 const output=await download.path(),size=(await stat(output)).size
 if(size<1000)throw Error('烧录输出无效')
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}))
 if(!probe.streams.some(s=>s.codec_type==='video')||Number(probe.format.duration)<=0)throw Error('烧录输出无法读取')
 report.phases.burn={elapsedMs:Date.now()-start,bytes:size,duration:Number(probe.format.duration),videoCodec:probe.streams.find(s=>s.codec_type==='video').codec_name}
 // Verify actual frames can be decoded, not only container metadata.
 execFileSync('ffmpeg',['-v','error','-i',output,'-f','null','-'],{stdio:'pipe'})
 report.status='passed'
}catch(e){report.errors.push(String(e));process.exitCode=1}
finally{await browser?.close();await writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))}
