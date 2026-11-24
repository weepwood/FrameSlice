/** Stable, viewport-only candidates on a fresh context. No history/timestamp data. */
import {chromium} from 'playwright-core'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
const dir=process.env.VISUAL_BASELINE_DIR||'visual-candidate';await mkdir(dir,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']})
const results=[]
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844}])for(const theme of ['light','dark']){
  const ctx=await browser.newContext({viewport,deviceScaleFactor:1,colorScheme:theme,locale:'zh-CN',timezoneId:'UTC',reducedMotion:'reduce'})
  try{
   const page=await ctx.newPage();await page.goto(process.env.APP_URL||'http://127.0.0.1:4173/FrameSlice/')
   await page.getByRole('combobox',{name:'主题'}).selectOption(theme)
   for(const [mode,button] of [['split','无损分割'],['frames','定时抽帧'],['captions','字幕工作台'],['jobs','任务中心']]){
    await page.getByRole('button',{name:new RegExp(button)}).first().click()
    if(mode==='captions')await page.locator('.caption-react-host').locator('.caption-action-toolbar').waitFor({timeout:30000})
    if(mode==='jobs')await page.locator('.fs-job-center').waitFor()
    await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(mode+' horizontal overflow')
    const name=mode+'-'+theme+'-'+viewport.width+'.png',path=join(dir,name)
    // Storage estimates vary by runner, so mask only their diagnostic value block.
    const mask=mode==='jobs'?[page.locator('.fs-storage-diagnostics')]:[]
    await page.screenshot({path,animations:'disabled',caret:'hide',fullPage:false,mask})
    const bytes=await readFile(path);results.push({name,sha256:createHash('sha256').update(bytes).digest('hex'),width:viewport.width,height:viewport.height})
   }
  }finally{await ctx.close()}
 }
 await writeFile(join(dir,'candidate.json'),JSON.stringify({schema:1,chrome:browser.version(),commit:process.env.GITHUB_SHA??null,images:results},null,2))
}finally{await browser.close()}
