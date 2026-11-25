import { chromium } from 'playwright-core';
const chrome=process.env.CHROME_PATH;
if(!chrome)throw Error('CHROME_PATH required');
const url=process.env.APP_URL??'http://127.0.0.1:4173/FrameSlice/';
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.addInitScript(()=>{
    window.__captionFaults={read:0,write:0};
    for(const [method,flag,count] of [['get','fs-test-abort-read','read'],['put','fs-test-abort-write','write']]){
      const original=IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method]=function(...args){
        const request=original.apply(this,args);
        if(this.name==='projects'&&this.transaction.db.name==='caption-studio'&&sessionStorage.getItem(flag)==='1'){
          request.addEventListener('success',()=>{window.__captionFaults[count]++;this.transaction.abort()},{once:true});
        }
        return request;
      };
    }
  });
  const caption=page.locator('.caption-react-host');
  const saved=caption.locator('.caption-save-state[data-save=saved]');
  const readStored=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
    const req=indexedDB.open('caption-studio',1);
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{
      const db=req.result,tx=db.transaction('projects','readonly'),r=tx.objectStore('projects').get('current');
      tx.oncomplete=()=>{db.close();resolve(r.result)};
      tx.onabort=()=>{db.close();reject(tx.error)};
    };
  }));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'字幕工作台'}).click();
  await saved.waitFor();
  await caption.locator('input[accept=".srt,.vtt"]').setInputFiles({name:'recovery.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:01,000 --> 00:00:04,000\nOriginal draft\n')});
  const editor=caption.getByRole('textbox',{name:'第 1 条字幕'});
  await editor.waitFor();
  await page.waitForFunction(()=>document.querySelector('.caption-react-host')?.shadowRoot?.querySelector('.caption-save-state')?.getAttribute('data-save')==='saved');
  if((await readStored()).cues[0].text!=='Original draft')throw Error('initial draft was not saved');
  await page.evaluate(()=>sessionStorage.setItem('fs-test-abort-read','1'));
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'字幕工作台'}).click();
  await caption.getByRole('button',{name:'重试读取'}).waitFor();
  if(!await page.evaluate(()=>window.__captionFaults.read>0))throw Error('read abort not injected');
  if(await caption.locator('.workspace[inert]').count()!==1)throw Error('editor was not protected during read failure');
  await page.waitForTimeout(850);
  await page.evaluate(()=>sessionStorage.removeItem('fs-test-abort-read'));
  if((await readStored()).cues[0].text!=='Original draft')throw Error('read failure overwrote old draft');
  await caption.getByRole('button',{name:'重试读取'}).click();
  await editor.waitFor();
  if(await editor.inputValue()!=='Original draft')throw Error('retry did not restore draft');
  await saved.waitFor();
  await page.evaluate(()=>sessionStorage.setItem('fs-test-abort-write','1'));
  await editor.fill('Edited draft');
  await caption.getByRole('button',{name:'重试保存'}).waitFor();
  if(!await page.evaluate(()=>window.__captionFaults.write>0))throw Error('write abort not injected');
  if((await readStored()).cues[0].text!=='Original draft')throw Error('aborted write changed persisted draft');
  await page.evaluate(()=>sessionStorage.removeItem('fs-test-abort-write'));
  await caption.getByRole('button',{name:'重试保存'}).click();
  await saved.waitFor();
  if((await readStored()).cues[0].text!=='Edited draft')throw Error('save retry failed');
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'字幕工作台'}).click();
  await editor.waitFor();
  if(await editor.inputValue()!=='Edited draft')throw Error('reloaded draft mismatch');
  const large={version:1,name:'Long project',mediaName:'',duration:15000,cues:Array.from({length:5000},(_,i)=>({id:'cue-'+i,start:3600+i*2+.125,end:3600+i*2+1.675,text:'Cue '+i})),style:{}};
  const file={name:'long-project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(large))};
  const canceled=page.waitForEvent('dialog').then(dialog=>dialog.dismiss());
  await caption.locator('input[accept=".json"]').setInputFiles(file);
  await canceled;
  if(await editor.inputValue()!=='Edited draft')throw Error('cancel project replacement lost current draft');
  const confirmed=page.waitForEvent('dialog').then(dialog=>dialog.accept());
  await caption.locator('input[accept=".json"]').setInputFiles(file);
  await confirmed;
  await page.waitForFunction(()=>document.querySelector('.caption-react-host')?.shadowRoot?.querySelector('textarea[aria-label="第 1 条字幕"]')?.value==='Cue 0');
  const first=caption.locator('.cue-row').first();
  if(await first.getByRole('textbox',{name:'开始时间'}).inputValue()!=='01:00:00.125')throw Error('hour/millisecond timestamp not preserved');
  if(await caption.locator('.cue-row').count()!==100)throw Error('large cue list was not paginated');
  await caption.getByRole('slider',{name:'跳转播放位置',exact:true}).fill('13598.5');
  await caption.getByRole('textbox',{name:'第 5000 条字幕'}).waitFor();
  if(await caption.locator('.cue-row').count()!==100)throw Error('large last page count wrong');
  console.log(JSON.stringify({readAbort:'passed',writeAbort:'passed',oldDraftPreserved:'passed',retryAndReload:'passed',projectCancel:'passed',largeProject:5000,exactTime:'passed',followLastPage:'passed'}));
}finally{await browser.close()}
