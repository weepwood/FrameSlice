import {chromium,firefox,webkit} from 'playwright-core';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const name=process.env.BROWSER_ENGINE??'chromium';
const type={chromium,firefox,webkit}[name];
if(!type)throw Error('Unknown browser engine: '+name);
const browser=await type.launch({headless:true,...(name==='chromium'?{executablePath:process.env.CHROME_PATH,args:['--no-sandbox']}:{})});
const url=process.env.APP_URL??'http://127.0.0.1:4173/FrameSlice/';
const report={engine:name,version:browser.version()};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 // For Chromium explicitly exercise missing-picker fallback, not native availability.
 if(name==='chromium')await page.addInitScript(()=>Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:undefined}));
 await page.goto(url,{waitUntil:'networkidle'});
 report.capabilities=await page.evaluate(()=>({secure:isSecureContext,picker:typeof showDirectoryPicker==='function',worker:typeof Worker==='function',indexedDB:typeof indexedDB!=='undefined',offscreen:typeof OffscreenCanvas==='function',videoDecoder:typeof VideoDecoder==='function'}));
 if(report.capabilities.picker)throw Error('Expected a no-picker test environment; review this browser capability change');
 const bytes=Buffer.from((await readFile(new URL('../tests/fixtures/black-h264-aac.mp4.b64',import.meta.url),'utf8')).trim(),'base64');
 await page.locator('input[type=file]').setInputFiles({name:'fallback.mp4',mimeType:'video/mp4',buffer:bytes});
 await page.locator('.file-codec').waitFor();
 const start=page.getByRole('button',{name:/开始分割视频/});
 if(!await start.isDisabled())throw Error('no-picker split must be disabled');
 await page.locator('.fs-capability-notice').getByText(/无损分割需要桌面/).waitFor();
 await page.getByRole('button',{name:'预览分割计划'}).click();
 await page.getByText(/1 个片段 · 下列为媒体包估算/).waitFor();
 report.split='blocked-before-output';report.inspectAndPlan='passed';
 await page.getByRole('button',{name:'定时抽帧'}).click();
 const interval=page.getByRole('spinbutton',{name:'抽帧间隔秒数',exact:true});
 await interval.fill('0.1');await interval.press('Tab');
 if(Number(await interval.getAttribute('aria-valuenow'))!==0.1)throw Error('interval edit not committed');
 const frameAction=page.getByRole('button',{name:/开始提取图片/});
 // Fixture may be shorter than 3s; use the 56s fixture for the >30 limit.
 const many=Buffer.from((await readFile(new URL('../tests/fixtures/many-keyframes-h264.mp4.b64',import.meta.url),'utf8')).trim(),'base64');
 await page.locator('input[type=file]').setInputFiles({name:'many.mp4',mimeType:'video/mp4',buffer:many});
 await page.locator('.file-codec').waitFor();
 await page.locator('.fs-capability-notice').getByText(/不超过 30 张/).waitFor();
 if(!await frameAction.isDisabled())throw Error('no-picker frame limit not enforced');
 report.frameLimit='passed';
 await page.locator('input[type=file]').setInputFiles({name:'fallback.mp4',mimeType:'video/mp4',buffer:bytes});
 await page.locator('.file-codec').waitFor();
 await interval.fill('1');await interval.press('Tab');
 if(Number(await interval.getAttribute('aria-valuenow'))!==1)throw Error('interval edit not committed');
 await frameAction.click();
 await page.locator('.status-card:is(.success,.failure)').waitFor({timeout:60000});
 if(await page.locator('.status-card.success').count()){
   const downloadButton=page.locator('.frame-tile button.frame-download').first();
   await downloadButton.waitFor();
   const [image]=await Promise.all([page.waitForEvent('download'),downloadButton.click()]);
   const data=await readFile(await image.path());
   if(data[0]!==255||data[1]!==216)throw Error('fallback image invalid');
   report.frameDownload='passed';
 }else{
   const error=await page.locator('.status-card.failure').innerText();
   if(!/无法解码|不支持|VideoDecoder|OffscreenCanvas|解码器/i.test(error))throw Error('Unexpected frame error: '+error);
   report.frameDownload={status:'codec-unavailable',message:error};
 }
 if(name==='chromium'&&report.frameDownload!=='passed')throw Error('Chromium fallback JPEG must work');
 await page.getByRole('button',{name:'字幕工作台'}).click();
 const caption=page.locator('.caption-react-host');
 await caption.locator('[data-save=saved]').waitFor();
 await caption.locator('input[accept=".srt,.vtt"]').setInputFiles({name:'local.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:01,000 --> 00:00:03,000\nLocal subtitle\n')});
 const editor=caption.getByRole('textbox',{name:'第 1 条字幕',exact:true});
 await editor.waitFor();await editor.fill('Edited local subtitle');
 await caption.locator('[data-save=saved]').waitFor();
 await page.reload({waitUntil:'networkidle'});
 await page.getByRole('button',{name:'字幕工作台'}).click();
 await editor.waitFor();
 if(await editor.inputValue()!=='Edited local subtitle')throw Error('caption reload lost draft');
 report.captionDraft='passed';
 await mkdir('visual-regression',{recursive:true});
 await page.screenshot({path:'visual-regression/capability-'+name+'.png',animations:'disabled'});
 console.log(JSON.stringify(report));
}finally{
 await writeFile('browser-capability-'+name+'.json',JSON.stringify(report,null,2));
 await browser.close();
}
