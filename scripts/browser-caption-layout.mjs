import {chromium} from 'playwright-core';
import {mkdir} from 'node:fs/promises';
import {themeOption} from './select-option.mjs';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(process.env.APP_URL??'http://127.0.0.1:4173/FrameSlice/',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'字幕工作台'}).click();
 const host=page.locator('.caption-react-host');
 await host.locator('[data-save=saved]').waitFor();
 const main=host.locator('.main-column'),side=host.locator('.side-panel');
 const align=async()=>{const a=await main.boundingBox(),b=await side.boundingBox();if(Math.abs(a.y-b.y)>1||Math.abs(a.y+a.height-b.y-b.height)>1)throw Error('editor panels not aligned')};
 await align();
 const frame=host.locator('.video-frame');
 const emptyButtons=frame.getByRole('button',{name:/选择媒体文件|导入 SRT/});
 const checkEmpty=async()=>{
  const root=await host.locator('.caption-editor-layout').boundingBox(),box=await frame.boundingBox();
  if(!root||root.height<609||!box||box.height<210||await emptyButtons.count()!==2)throw Error('empty desktop panel collapsed');
  for(const button of await emptyButtons.all()){
   const b=await button.boundingBox();if(!b||b.y<box.y||b.y+b.height>box.y+box.height+1)throw Error('empty media action clipped');
  }
 };
 await checkEmpty();
 await page.setViewportSize({width:1280,height:720});await checkEmpty();
 await page.setViewportSize({width:1440,height:900});await checkEmpty();
 if(await host.getByRole('toolbar',{name:'字幕校对工具'}).count())throw Error('empty toolbar visible');
 await host.getByRole('button',{name:'加载示例字幕'}).click();
 await host.getByRole('textbox',{name:'第 1 条字幕',exact:true}).waitFor();
 const toolbar=host.getByRole('toolbar',{name:'字幕校对工具'});
 await toolbar.getByRole('button',{name:'更多字幕操作'}).click();
 await host.getByRole('menuitem',{name:'整理文本'}).click();
 await host.locator('.review-notice').waitFor();
 await toolbar.getByRole('button',{name:'更多字幕操作'}).click();
 await host.getByRole('menuitem',{name:'查找并替换'}).click();
 await host.getByRole('textbox',{name:'替换为'}).waitFor();
 await toolbar.getByRole('button',{name:'更多字幕操作'}).click();
 await host.getByRole('menuitem',{name:'关闭替换'}).click();
 await host.getByRole('textbox',{name:'替换为'}).waitFor({state:'detached'});
 await align();
 await mkdir('visual-regression',{recursive:true});
 await themeOption(page,'light');await page.screenshot({path:'visual-regression/editor-redesign-light.png',animations:'disabled'});
 await themeOption(page,'dark');await page.screenshot({path:'visual-regression/editor-redesign-dark.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 await toolbar.scrollIntoViewIfNeeded();
 if(await toolbar.evaluate(el=>el.scrollWidth>el.clientWidth+1)||await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('mobile editor overflow');
 const labels=await host.locator('.timeline-ruler span').evaluateAll(els=>els.map(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})));
 if(labels.length<2||labels.some((r,i)=>i>0&&r.left<labels[i-1].right+2))throw Error('narrow ruler labels overlap');
 await page.screenshot({path:'visual-regression/editor-redesign-dark-390.png',animations:'disabled'});
 console.log(JSON.stringify({emptyToolsHidden:'passed',alignedPanels:'passed',baseUIMenu:'passed',replace:'passed',mobile:'passed'}));
}finally{await browser.close()}
