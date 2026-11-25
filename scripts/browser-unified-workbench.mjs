import {chromium} from 'playwright-core';
import {mkdir,readFile} from 'node:fs/promises';
import {themeOption} from './select-option.mjs';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('frameslice.jobs.v1',JSON.stringify(Array.from({length:8},(_,i)=>({id:'unified-'+i,type:i%2?'frames':'split',asset:{id:'asset-'+i,name:'history-'+i+'.mp4',bytes:123,lastModified:0,mime:'video/mp4'},status:i===0?'failed':'completed',progress:i===0?.5:1,label:'测试记录',createdAt:1000+i})))));
 await page.goto(process.env.APP_URL??'http://127.0.0.1:4173/FrameSlice/',{waitUntil:'networkidle'});
 await mkdir('visual-regression',{recursive:true});
 const header=page.locator('.fs-workspace-header'),status=page.locator('.fs-sidebar-status');
 const modes=[['视频分割','split'],['定时抽帧','frames'],['字幕工作台','captions'],['任务中心','jobs']];
 const check=async(title)=>{
   await header.getByRole('heading',{name:title,exact:true}).waitFor();
   if(await page.locator('h1:visible').count()!==1)throw Error('duplicate workspace title');
   const height=(await status.boundingBox()).height;if(height>80)throw Error('sidebar status too tall: '+height);
   const body=page.locator('.fs-workspace-body:visible');if(await body.count()!==1)throw Error('expected one visible workspace body');
   const h=await header.boundingBox(),b=await body.boundingBox();if(Math.abs(h.x-b.x)>1||Math.abs(h.width-b.width)>1)throw Error('workspace shell alignment');
 };
 for(const theme of ['light','dark']){
  await themeOption(page,theme);
  for(const [title,key] of modes){
   await page.getByRole('button',{name:title,exact:true}).click();await check(title);
   if(key==='captions')await page.locator('.caption-react-host [data-save=saved]').waitFor();
   if(key==='split'||key==='frames'){
    const inspector=page.getByRole('complementary',{name:'媒体检查器'});
    if(await inspector.locator('.fs-inspector-output').count())throw Error('empty inspector shows redundant output summary');
    const output=inspector.getByRole('region',{name:'输出设置'});
    const r=await output.boundingBox(),h=await inspector.boundingBox();
    if(!r||!h||r.y-h.y>150)throw Error('output settings not prioritized');
    const drop=await page.getByRole('button',{name:'选择视频文件',exact:true}).boundingBox();
    if(!drop||drop.height<220)throw Error('empty import surface collapsed');
   }

   await page.screenshot({path:'visual-regression/unified-'+key+'-'+theme+'.png',animations:'disabled'});
  }
 }
 await page.getByRole('button',{name:'视频分割',exact:true}).click();
 const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'添加媒体资源'}).click()]);
 const bytes=Buffer.from((await readFile(new URL('../tests/fixtures/black-h264-aac.mp4.b64',import.meta.url),'utf8')).trim(),'base64');
 await chooser.setFiles([{name:'unified-source.mp4',mimeType:'video/mp4',buffer:bytes}]);
 await page.locator('.file-codec').waitFor();
 await page.locator('.fs-library-row.selected').waitFor();
 await page.getByRole('complementary',{name:'媒体检查器'}).getByText('当前输出',{exact:true}).waitFor();
 await page.getByRole('button',{name:/任务记录/}).click();
 await page.locator('.fs-job-history .fs-job-status').first().waitFor();
 const statusHeight=(await status.boundingBox()).height;
 if(statusHeight>80)throw Error('populated collections expanded status');
 await page.getByRole('button',{name:'任务中心',exact:true}).click();
 await page.locator('.fs-center-job .fs-job-status').first().waitFor();
 await page.screenshot({path:'visual-regression/unified-populated-dark.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 for(const [title,key] of modes){
  await page.getByRole('button',{name:title,exact:true}).click();await header.getByRole('heading',{name:title,exact:true}).waitFor();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('mobile overflow '+key);
  if(key==='captions')await page.locator('.caption-react-host [data-stacked=true]').waitFor();
 }
 await themeOption(page,'light');await page.screenshot({path:'visual-regression/unified-mobile.png',animations:'disabled'});
 if(errors.length)throw Error(errors.join('; '));
 console.log(JSON.stringify({inspectorEmptyAndLoaded:'passed',sharedHeader:'passed',sharedBody:'passed',compactStatusHeight:statusHeight,resources:'passed',sharedJobStatus:'passed',theme:'passed',mobile:'passed'}));
}finally{await browser.close()}
