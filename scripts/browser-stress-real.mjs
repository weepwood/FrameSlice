import {selectOption,themeOption} from './select-option.mjs'
/** Real local file -> production browser -> native OPFS. No synthetic Blob substitute. */
import {chromium} from 'playwright-core'
import {stat,writeFile,readFile,mkdtemp,rm,statfs} from 'node:fs/promises'
import {resolve,basename,join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {platform,arch,totalmem,tmpdir} from 'node:os'
const path=process.argv[2],reportPath=resolve(process.argv[3]||'browser-stress-report.json')
if(!path||!process.env.CHROME_PATH)throw Error('Usage: CHROME_PATH=... node scripts/browser-stress-real.mjs /path/12GB.mp4 report.json')
const input=resolve(path),source=await stat(input)
const minBytes=Number(process.env.STRESS_MIN_BYTES||12000000000)
if(!Number.isSafeInteger(minBytes)||minBytes<1||!source.isFile()||source.size<minBytes)throw Error('真实源文件大小未达到测试门槛')
const timeout=Number(process.env.STRESS_TIMEOUT_MS||7200000)
const scenario=process.env.STRESS_SCENARIO||'success',deep=process.env.STRESS_DEEP==='1',runs=Number(process.env.STRESS_RUNS||1)
if(!['success','cancel','quota'].includes(scenario)||!Number.isInteger(runs)||runs<1||runs>2||scenario!=='success'&&runs!==1)throw Error('invalid scenario')
const origin=process.env.APP_URL||'http://127.0.0.1:4173/FrameSlice/'
const report={kind:'real-browser-opfs',source:{name:basename(input),bytes:source.size},minimumBytes:minBytes,qualifies12GB:source.size>=12000000000,platform:platform(),arch:arch(),systemRamBytes:totalmem(),startedAt:new Date().toISOString(),status:'failed',scenario,deep,runs,runReports:[],samples:[],errors:[]}
let context,interval,started=Date.now(),sampling=false,processingStarted=null
const profile=await mkdtemp(join(tmpdir(),'frameslice-chrome-profile-'))
async function processMetrics(){if(platform()!=='linux')return null;try{const rows=execFileSync('ps',['-eo','pid=,ppid=,rss='],{encoding:'utf8'}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number));const ids=new Set([process.pid]);let changed=true;while(changed){changed=false;for(const [pid,ppid] of rows)if(ids.has(ppid)&&!ids.has(pid)){ids.add(pid);changed=true}}let rss=0,readBytes=0,writeBytes=0;for(const [pid,,kb] of rows)if(ids.has(pid)){rss+=kb*1024;try{const io=await readFile('/proc/'+pid+'/io','utf8');readBytes+=Number(io.match(/^read_bytes:\s*(\d+)/m)?.[1]??0);writeBytes+=Number(io.match(/^write_bytes:\s*(\d+)/m)?.[1]??0)}catch{}}return {processTreeRssBytes:rss,processTreeReadBytes:readBytes,processTreeWriteBytes:writeBytes}}catch{return null}}
try{
 // Use a real persistent profile rather than an incognito context (whose OPFS quota is much lower).
 context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox'],acceptDownloads:true})
 report.browser=context.browser()?.version()??'unknown';report.profile='persistent-isolated'
 const page=context.pages()[0]??await context.newPage()
 page.on('pageerror',e=>report.errors.push(e.message))
 await page.addInitScript(()=>Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:()=>navigator.storage.getDirectory()}))
 await page.goto(origin,{waitUntil:'networkidle'})
 const cdp=await page.context().newCDPSession(page)
 report.storageDefault=await page.evaluate(()=>navigator.storage.estimate())
 const fs=await statfs(profile);report.physicalFreeBytes=fs.bavail*fs.bsize
 const requestedQuota=Number(process.env.STRESS_OPFS_QUOTA_BYTES||0)
 if(requestedQuota){
  const location=new URL(origin);if(!['127.0.0.1','localhost'].includes(location.hostname)||!Number.isSafeInteger(requestedQuota)||requestedQuota<(scenario==='quota'?32*1024*1024:source.size*1.05)||requestedQuota>report.physicalFreeBytes-2*1024**3)throw Error('受控配额仅限本地测试且须有实际磁盘余量')
  await cdp.send('Storage.overrideQuotaForOrigin',{origin:location.origin,quotaSize:requestedQuota})
  report.quotaOverride={requestedBytes:requestedQuota,...await cdp.send('Storage.getUsageAndQuota',{origin:location.origin})}
  if(!report.quotaOverride.overrideActive)throw Error('测试配额未生效')
 }
 report.storage=await page.evaluate(()=>navigator.storage.estimate())
 // Chromium may deliberately round or cap the web-exposed estimate; an explicit CDP override is separately verified.
 const effective=report.quotaOverride?.overrideActive?report.quotaOverride:report.storage
 report.effectiveQuotaBytes=effective.quota;report.effectiveAvailableBytes=effective.quota-effective.usage
 if((scenario!=='quota'&&report.effectiveAvailableBytes<source.size*1.05)||report.physicalFreeBytes<source.size*1.1)throw Error('OPFS 可用配额或实际磁盘不足')
 await cdp.send('Performance.enable')
 const sample=async()=>{if(sampling)return;sampling=true;try{const {metrics}=await cdp.send('Performance.getMetrics');const get=name=>metrics.find(m=>m.name===name)?.value??null;report.samples.push({elapsedMs:Date.now()-started,mainJsHeapBytes:get('JSHeapUsedSize'),taskDuration:get('TaskDuration'),...await processMetrics()})}catch{}finally{sampling=false}}
 interval=setInterval(()=>void sample(),5000)
 await sample()
 // Playwright passes a local file path, not a base64 upload or an in-memory buffer.
 await page.locator('input[type=file]').first().setInputFiles(input,{timeout})
 await page.locator('.file-codec').waitFor({timeout})
 if(deep)await selectOption(page,'视频输出校验等级','逐包深度校验')
 const listFiles=()=>page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),files=[];for await(const [dir,handle] of root.entries())if(handle.kind==='directory')for await(const [name,child] of handle.entries())if(child.kind==='file'){const f=await child.getFile();files.push({dir,name,bytes:f.size})}return files})
 for(let run=0;run<runs;run++){
 if(run>0){await page.reload();await page.locator('input[type=file]').first().setInputFiles(input,{timeout});await page.locator('.file-codec').waitFor({timeout});if(deep)await selectOption(page,'视频输出校验等级','逐包深度校验')}
 const runStarted=Date.now();processingStarted??=runStarted
 await page.getByRole('button',{name:/开始分割视频/}).click()
 if(scenario==='cancel'){
  await page.locator('.result-list').waitFor({timeout});await page.getByRole('button',{name:'取消任务'}).click();await page.getByText('任务已取消',{exact:true}).waitFor({timeout:30000});report.files=await listFiles();const mp4=report.files.filter(f=>f.name.endsWith('.mp4'));if(!mp4.length||mp4.some(f=>f.bytes<=0)||mp4.length!==await page.locator('.result-list .result-item').count())throw Error('取消后片段与已完成清单不一致');report.status='passed';break
 }
 if(scenario==='quota'){
  await page.locator('.status-card.failure').waitFor({timeout});report.expectedFailure=await page.locator('.status-card.failure').innerText();if(!/quota|配额|空间|disk/i.test(report.expectedFailure))throw Error('未观察到真实配额异常：'+report.expectedFailure);report.files=await listFiles();if(report.files.some(f=>f.name.endsWith('.mp4')&&f.bytes===0))throw Error('配额失败遗留空文件');report.status='passed';break
 }
 await page.waitForFunction(()=>document.querySelector('.status-card')?.matches('.success,.failure'),{},{timeout})
 if(await page.locator('.status-card.failure').count())throw Error(await page.locator('.status-card.failure').innerText())
 const [dl]=await Promise.all([page.waitForEvent('download',{timeout:30000}),page.getByRole('button',{name:/导出处理报告 JSON/}).click()])
 report.manifest=JSON.parse(await readFile(await dl.path(),'utf8'))
 report.files=await page.evaluate(async()=>{
  const root=await navigator.storage.getDirectory(),files=[]
  for await(const [dir,handle] of root.entries())if(handle.kind==='directory')for await(const [name,child] of handle.entries())if(child.kind==='file'){const f=await child.getFile();files.push({dir,name,bytes:f.size})}
  return files
 })
 const outputs=report.manifest.outputs
 report.outputBytes=outputs.reduce((n,o)=>n+o.bytes,0)
 report.outputCount=outputs.length
 report.peakMainJsHeapBytes=Math.max(0,...report.samples.map(s=>s.mainJsHeapBytes??0))
 if(!outputs.length||report.manifest.task.status!=='completed'||!outputs.every(o=>o.verification.passed&&report.files.some(f=>f.name===o.filename&&f.bytes===o.bytes)))throw Error('实际文件与校验报告不一致')
 if(report.manifest.input.bytes!==source.size||report.errors.length)throw Error('源媒体大小不一致或浏览器运行错误')
 if(source.size>=12000000000&&outputs.length<2)throw Error('12GB 严格 4GB 分割未产生多个文件')
 if(deep&&!outputs.every(o=>o.verification.level==='deep'&&o.verification.checkedBytes>0))throw Error('未实际执行逐包深度校验')
 report.runReports.push({elapsedMs:Date.now()-runStarted,manifest:report.manifest,outputBytes:report.outputBytes,outputCount:report.outputCount})
 await sample();report.status='passed'
 if(run+1<runs){await page.evaluate(async()=>{const root=await navigator.storage.getDirectory();for await(const [name] of root.entries())await root.removeEntry(name,{recursive:true})});report.status='failed'}
 }
}catch(e){report.errors.push(String(e));process.exitCode=1}
finally{
 clearInterval(interval);report.elapsedMs=Date.now()-started
 report.processingElapsedMs=processingStarted===null?null:Date.now()-processingStarted
 report.sourceReadMiBPerSecond=report.status==='passed'&&scenario==='success'&&report.processingElapsedMs>0?source.size*runs/1048576/(report.processingElapsedMs/1000):null
 report.peakProcessTreeRssBytes=report.samples.some(s=>s.processTreeRssBytes!==undefined)?Math.max(...report.samples.map(s=>s.processTreeRssBytes??0)):null
 report.measurementLimit='Linux sampled process tree RSS includes shared pages counted more than once; /proc I/O counters can decrease as children exit and exclude cached I/O. CDP main JS heap is not total browser memory. OPFS is native browser storage, not OS picker.'
 try{await context?.close()}finally{await writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await rm(profile,{recursive:true,force:true})}
}
