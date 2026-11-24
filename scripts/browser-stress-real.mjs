/** Real local file -> production browser -> native OPFS. No synthetic Blob substitute. */
import {chromium} from 'playwright-core'
import {stat,writeFile,readFile} from 'node:fs/promises'
import {resolve,basename} from 'node:path'
import {platform,arch,totalmem} from 'node:os'
const path=process.argv[2],reportPath=resolve(process.argv[3]||'browser-stress-report.json')
if(!path||!process.env.CHROME_PATH)throw Error('Usage: CHROME_PATH=... node scripts/browser-stress-real.mjs /path/12GB.mp4 report.json')
const input=resolve(path),source=await stat(input)
const minBytes=Number(process.env.STRESS_MIN_BYTES||12000000000)
if(!Number.isSafeInteger(minBytes)||minBytes<1||!source.isFile()||source.size<minBytes)throw Error('真实源文件大小未达到测试门槛')
const timeout=Number(process.env.STRESS_TIMEOUT_MS||7200000)
const origin=process.env.APP_URL||'http://127.0.0.1:4173/FrameSlice/'
const report={kind:'real-browser-opfs',source:{name:basename(input),bytes:source.size},minimumBytes:minBytes,qualifies12GB:source.size>=12000000000,platform:platform(),arch:arch(),systemRamBytes:totalmem(),startedAt:new Date().toISOString(),status:'failed',samples:[],errors:[]}
let browser,interval,started=Date.now()
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']})
 report.browser=browser.version()
 const page=await browser.newPage({acceptDownloads:true})
 page.on('pageerror',e=>report.errors.push(e.message))
 await page.addInitScript(()=>Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:()=>navigator.storage.getDirectory()}))
 await page.goto(origin,{waitUntil:'networkidle'})
 report.storage=await page.evaluate(()=>navigator.storage.estimate())
 if(report.storage.quota-report.storage.usage<source.size*1.05)throw Error('OPFS 可用配额不足')
 const cdp=await page.context().newCDPSession(page)
 await cdp.send('Performance.enable')
 const sample=async()=>{try{const {metrics}=await cdp.send('Performance.getMetrics');const get=name=>metrics.find(m=>m.name===name)?.value??null;report.samples.push({elapsedMs:Date.now()-started,mainJsHeapBytes:get('JSHeapUsedSize'),taskDuration:get('TaskDuration')})}catch{}}
 interval=setInterval(()=>void sample(),5000)
 await sample()
 // Playwright passes a local file path, not a base64 upload or an in-memory buffer.
 await page.locator('input[type=file]').first().setInputFiles(input,{timeout})
 await page.locator('.file-codec').waitFor({timeout})
 await page.getByRole('button',{name:/开始分割视频/}).click()
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
 await sample();report.status='passed'
}catch(e){report.errors.push(String(e));process.exitCode=1}
finally{
 clearInterval(interval);report.elapsedMs=Date.now()-started
 report.sourceReadMiBPerSecond=source.size/1048576/(report.elapsedMs/1000)
 report.measurementLimit='CDP main renderer JS heap is not total browser/Worker/WASM/GPU memory; OPFS is native browser storage, not OS picker.'
 await browser?.close();await writeFile(reportPath,JSON.stringify(report,null,2));console.log(reportPath,report.status)
}
