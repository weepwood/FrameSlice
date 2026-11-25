import {selectOption,themeOption} from './select-option.mjs'
/** Stable, viewport-only candidates on a fresh context. No history/timestamp data. */
import {chromium} from 'playwright-core'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
const dir=process.env.VISUAL_BASELINE_DIR||'visual-candidate';await mkdir(dir,{recursive:true});await mkdir('visual-regression',{recursive:true})
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']})
const results=[]
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844}])for(const theme of ['light','dark']){
  const ctx=await browser.newContext({viewport,deviceScaleFactor:1,colorScheme:theme,locale:'zh-CN',timezoneId:'UTC',reducedMotion:'reduce'})
  try{
   const page=await ctx.newPage();await page.goto(process.env.APP_URL||'http://127.0.0.1:4173/FrameSlice/')
   await themeOption(page,theme)
   for(const [mode,button] of [['split','无损分割'],['frames','定时抽帧'],['captions','字幕工作台'],['jobs','任务中心']]){
    await page.getByRole('button',{name:new RegExp(button)}).first().click()
    if(mode==='captions'){const host=page.locator('.caption-react-host');await host.locator('.caption-action-toolbar').waitFor({timeout:30000});await host.locator('.caption-save-state[data-save="saved"]').waitFor({timeout:30000})}
    if(mode==='jobs')await page.locator('.fs-job-center').waitFor()
    await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})
    if(mode==='captions'&&viewport.width===1440){
      const host=page.locator('.caption-react-host'),frame=host.locator('.video-frame'),root=await host.locator('.caption-editor-layout').boundingBox(),box=await frame.boundingBox();
      const actions=frame.getByRole('button',{name:/选择媒体文件|导入 SRT/});
      if(!root||root.height<609||!box||box.height<210||await actions.count()!==2)throw Error('desktop empty caption preview collapsed');
      for(const action of await actions.all()){const b=await action.boundingBox();if(!b||b.y<box.y||b.y+b.height>box.y+box.height+1)throw Error('empty media action clipped')}
    }
    if(mode==='jobs'){if(await page.locator('.fs-storage-values').count()!==2)throw Error('storage mask missing');const meter=page.getByRole('progressbar',{name:'站点存储使用量'});await meter.waitFor();if(await meter.evaluate(el=>el.tagName==='PROGRESS'||el.getBoundingClientRect().height!==7||!el.querySelector('.fs-workbench-progress-fill')))throw Error('storage meter is not custom styled')}if(viewport.width===390&&await page.getByRole('button',{name:/隐藏检查器|显示检查器/}).count())throw Error('unavailable inspector visible on mobile');if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(mode+' horizontal overflow')
    const name=mode+'-'+theme+'-'+viewport.width+'.png',path=join(dir,name)
    // Storage estimates vary by runner, so mask only their diagnostic value block.
    const mask=mode==='jobs'?[page.locator('.fs-storage-values')]:[]
    await page.screenshot({path,animations:'disabled',caret:'hide',fullPage:false,mask})
    const bytes=await readFile(path);results.push({name,sha256:createHash('sha256').update(bytes).digest('hex'),width:viewport.width,height:viewport.height})
   }
   // Additional interactive evidence is intentionally outside the 16-image baseline.
   const evidence=async(name)=>page.screenshot({path:join('visual-regression',name+'-'+theme+'-'+viewport.width+'.png'),animations:'disabled',caret:'hide'})
   const batch=page.getByRole('combobox',{name:'批处理方式',exact:true});await batch.scrollIntoViewIfNeeded();await batch.click();await page.getByRole('option',{name:'定时抽帧',exact:true}).waitFor();await evidence('menu-batch');await page.keyboard.press('Escape');await page.getByRole('listbox').waitFor({state:'hidden'})
   await page.getByRole('button',{name:'清除本地任务记录'}).click();await page.getByRole('dialog').waitFor();await evidence('storage-confirm');await page.getByRole('dialog').getByRole('button',{name:'取消'}).click()
   await page.getByRole('button',{name:'字幕工作台',exact:true}).click();const caption=page.locator('.caption-react-host');await caption.getByRole('button',{name:'工程操作'}).click();await caption.getByRole('menuitem',{name:'打开工程',exact:true}).waitFor();await evidence('caption-project-menu');await page.keyboard.press('Escape');await caption.getByRole('menu').waitFor({state:'hidden'});await caption.getByRole('tab',{name:'转录',exact:true}).click();const model=caption.getByRole('combobox',{name:'识别模型'});await model.scrollIntoViewIfNeeded();await evidence('caption-transcribe');await model.click();await page.getByRole('option',{name:'Base · 均衡 (~80 MB)',exact:true}).waitFor();await evidence('menu-caption');await page.keyboard.press('Escape');await page.getByRole('listbox').waitFor({state:'hidden'});if(await model.getAttribute('aria-expanded')!=='false')throw Error('Caption popup did not close')
  }finally{await ctx.close()}
 }
 await writeFile(join(dir,'candidate.json'),JSON.stringify({schema:1,chrome:browser.version(),commit:process.env.GITHUB_SHA??null,images:results},null,2))
}finally{await browser.close()}
