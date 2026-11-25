import {selectOption,themeOption} from './select-option.mjs'
import {chromium} from 'playwright-core'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const dir=await mkdtemp(join(tmpdir(),'frameslice-batch-'))
const files=['first.mp4','second.mp4'].map(n=>join(dir,n))
const bytes=Buffer.from((await readFile(new URL('../tests/fixtures/black-h264-aac.mp4.b64',import.meta.url),'utf8')).trim(),'base64')
for(const file of files)await writeFile(file,bytes)
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']})
try{
 const context=await browser.newContext()
 await context.addInitScript(()=>Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:()=>navigator.storage.getDirectory()}))
 const page=await context.newPage();await page.goto(process.env.APP_URL||'http://127.0.0.1:4173/FrameSlice/')
 const center=page.locator('.fs-job-center')
 await page.getByRole('button',{name:'任务中心'}).click()
 await center.getByLabel('批量媒体文件').setInputFiles(files)
 await selectOption(page,'批处理方式','定时抽帧',center)
 await center.getByRole('spinbutton',{name:'批量抽帧间隔秒数'}).fill('0.5')
 await center.getByRole('button',{name:'选择目录并开始批处理'}).click()
 const waitBatch=async()=>{await page.waitForFunction(()=>{const b=JSON.parse(localStorage.getItem('frameslice.batch.v1')||'null');return b?.rows?.length===2&&b.rows.every(r=>r.status==='completed')},{},{timeout:60000});await center.getByRole('button',{name:'选择目录并开始批处理'}).waitFor({timeout:30000});await page.waitForFunction(async()=>navigator.locks.request('frameslice-batch-v1',{ifAvailable:true},lock=>!!lock),{},{timeout:30000})}
 await waitBatch()
 const listing=()=>page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),out=[];for await(const [dir,h] of root.entries())if(h.kind==='directory')for await(const [name,f] of h.entries())if(f.kind==='file'&&name.endsWith('.jpg')){const v=await f.getFile();out.push({dir,name,size:v.size,mtime:v.lastModified,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await v.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('')})}return out})
 const before=await listing();if(before.length<4)throw Error('batch generated too few outputs')
 const lost=before[0];await page.evaluate(async x=>{const r=await navigator.storage.getDirectory(),d=await r.getDirectoryHandle(x.dir);await d.removeEntry(x.name)},lost)
 await page.reload();await page.getByRole('button',{name:'任务中心'}).click();await center.getByLabel('批量媒体文件').setInputFiles(files)
 const tab=await context.newPage();await tab.goto(page.url());await tab.evaluate(()=>new Promise((resolve,reject)=>navigator.locks.request('frameslice-batch-v1',async()=>{resolve(true);await new Promise(r=>globalThis.releaseBatchLock=r)}).catch(reject)))
 await center.getByRole('button',{name:'验证并恢复批次'}).click();await center.getByText(/另一标签页正在执行或管理批次/).waitFor({timeout:30000})
 await tab.evaluate(()=>globalThis.releaseBatchLock());await tab.close()
 await center.getByRole('button',{name:'验证并恢复批次'}).click()
 // A prior completed snapshot is not evidence for the new run: wait for the regenerated file.
 await page.waitForFunction(async x=>{try{const r=await navigator.storage.getDirectory(),d=await r.getDirectoryHandle(x.dir);await d.getFileHandle(x.name);return true}catch{return false}},lost,{timeout:60000})
 await waitBatch()
 const after=await listing();const changed=before.filter(x=>x.dir!==lost.dir||x.name!==lost.name).filter(x=>!after.some(y=>y.dir===x.dir&&y.name===x.name&&y.size===x.size&&y.mtime===x.mtime&&y.sha256===x.sha256));if(after.length!==before.length||changed.length)throw Error('batch resume overwrote verified outputs: '+JSON.stringify({lost,changed,before,after,journal:await page.evaluate(()=>JSON.parse(localStorage.getItem('frameslice.batch.v1')))}));if(!after.some(x=>x.dir===lost.dir&&x.name===lost.name&&x.sha256===lost.sha256))throw Error('recovered frame differs from original')
 const ids=await page.evaluate(()=>JSON.parse(localStorage.getItem('frameslice.batch.v1')).sessions)
 const lockedTab=await context.newPage();await lockedTab.goto(page.url());await lockedTab.evaluate(id=>new Promise((resolve,reject)=>navigator.locks.request('frameslice-resume-'+id,async()=>{resolve(true);await new Promise(r=>globalThis.releaseSessionLock=r)}).catch(reject)),ids.at(-1));await center.getByRole('button',{name:'删除批次检查点（保留文件）'}).click();await page.getByRole('dialog').getByRole('button',{name:'确认删除'}).click();await center.getByText(/任务仍在执行，不能清除检查点/).waitFor({timeout:30000});const allExist=await page.evaluate(async ids=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open('frameslice-resume-v1',1);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});try{return await Promise.all(ids.map(id=>new Promise((res,rej)=>{const q=db.transaction('sessions').objectStore('sessions').get(id);q.onsuccess=()=>res(!!q.result);q.onerror=()=>rej(q.error)})))}finally{db.close()}},ids);if(!allExist.every(Boolean))throw Error('partial checkpoint cleanup while a session was locked');await lockedTab.evaluate(()=>globalThis.releaseSessionLock());await lockedTab.close()
 await page.evaluate(()=>{const old=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(key){const req=old.call(this,key);if(this.name==='sessions'&&typeof key==='string'&&!key.startsWith('cleanup:')){IDBObjectStore.prototype.delete=old;const tx=this.transaction;req.addEventListener('success',()=>{globalThis.framesliceInjectedAbort=true;tx.abort()},{once:true})}return req}})
 await center.getByRole('button',{name:'删除批次检查点（保留文件）'}).click();await page.getByRole('dialog').getByRole('button',{name:'确认删除'}).click();try{await center.getByText(/检查点清理中止|AbortError/).waitFor({timeout:15000})}catch(e){throw Error('IDB abort UI missing: injected='+await page.evaluate(()=>!!globalThis.framesliceInjectedAbort)+'; '+await center.innerText())}if(!await page.evaluate(()=>!!globalThis.framesliceInjectedAbort))throw Error('IDB abort injection did not execute');const rollback=await page.evaluate(async ids=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('frameslice-resume-v1',1);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});try{const keys=[...ids,'cleanup:'+JSON.parse(localStorage.getItem('frameslice.batch.v1')).id];return await Promise.all(keys.map(k=>new Promise((r,j)=>{const q=db.transaction('sessions').objectStore('sessions').get(k);q.onsuccess=()=>r(!!q.result);q.onerror=()=>j(q.error)})))}finally{db.close()}},ids);if(!rollback.slice(0,-1).every(Boolean)||rollback.at(-1))throw Error('IDB abort left partial cleanup');
 await page.evaluate(()=>{const old=Storage.prototype.removeItem;Storage.prototype.removeItem=function(key){if(key==='frameslice.batch.v1'){Storage.prototype.removeItem=old;throw new DOMException('injected summary clear failure','QuotaExceededError')}return old.call(this,key)}})
 await center.getByRole('button',{name:'删除批次检查点（保留文件）'}).click();await page.getByRole('dialog').getByRole('button',{name:'确认删除'}).click()
 await center.getByText(/injected summary clear failure/).waitFor({timeout:30000});if(!await page.evaluate(()=>localStorage.getItem('frameslice.batch.v1')))throw Error('failure injection did not preserve stale summary');await page.reload();await page.getByRole('button',{name:'任务中心'}).click()
 await page.waitForFunction(()=>!localStorage.getItem('frameslice.batch.v1'),{},{timeout:30000})
 const removed=await page.evaluate(async ids=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open('frameslice-resume-v1',1);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});try{return await Promise.all(ids.map(id=>new Promise((res,rej)=>{const q=db.transaction('sessions').objectStore('sessions').get(id);q.onsuccess=()=>res(q.result===undefined);q.onerror=()=>rej(q.error)})))}finally{db.close()}},ids)
 if(!removed.every(Boolean)||(await listing()).length!==after.length)throw Error('metadata cleanup did not preserve output files')
 console.log('batch OPFS resume, cross-tab lock and metadata-only cleanup passed')
}finally{await browser.close();await rm(dir,{recursive:true,force:true})}
