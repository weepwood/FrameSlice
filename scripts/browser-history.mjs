import {chromium} from 'playwright-core'
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const dir=await mkdtemp(join(tmpdir(),'frameslice-history-'))
const bytes=Buffer.from((await readFile(new URL('../tests/fixtures/black-h264-aac.mp4.b64',import.meta.url),'utf8')).trim(),'base64')
const files=['history-a.mp4','history-b.mp4'].map(n=>join(dir,n))
for(const f of files)await writeFile(f,bytes)
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']})
try{
 const ctx=await browser.newContext();const [a,b]=await Promise.all([ctx.newPage(),ctx.newPage()]);const url=process.env.APP_URL||'http://127.0.0.1:4173/FrameSlice/'
 await Promise.all([a.goto(url),b.goto(url)])
 await Promise.all([a,b].map((p,i)=>p.locator('input[type=file]').first().setInputFiles(files[i])))
 await Promise.all([a,b].map(p=>p.locator('.file-codec').waitFor({timeout:30000})))
 await Promise.all([a,b].map(p=>p.getByRole('button',{name:'任务中心'}).click()))
 for(const p of [a,b])for(const name of ['history-a.mp4','history-b.mp4'])await p.locator('.fs-job-center .fs-center-job').filter({hasText:name}).first().waitFor({timeout:30000})
 await a.evaluate(async()=>{const c=await caches.open('transformers-cache');await c.put('https://huggingface.co/onnx-community/whisper-tiny/resolve/main/config.json',new Response('{}'));await c.put('https://huggingface.co/other/model/resolve/main/config.json',new Response('{}'));const other=await caches.open('unrelated-app');await other.put('/unrelated',new Response('preserved'));localStorage.setItem('unrelated-app-pref','keep');const root=await navigator.storage.getDirectory();const h=await root.getFileHandle('preserved-output.mp4',{create:true});const w=await h.createWritable();await w.write('preserved');await w.close()})
 await a.locator('.fs-storage-diagnostics').getByRole('button',{name:'刷新'}).click();await a.getByRole('button',{name:'清除模型缓存'}).click();await a.getByRole('dialog').getByRole('button',{name:'确认清理'}).click();await a.getByText(/已清除 1 项模型缓存/).waitFor();if(!await a.evaluate(async()=>{const c=await caches.open('transformers-cache');const root=await navigator.storage.getDirectory();return !(await c.match('https://huggingface.co/onnx-community/whisper-tiny/resolve/main/config.json'))&&!!(await c.match('https://huggingface.co/other/model/resolve/main/config.json'))&&!!(await (await caches.open('unrelated-app')).match('/unrelated'))&&localStorage.getItem('unrelated-app-pref')==='keep'&&(await (await (await root.getFileHandle('preserved-output.mp4')).getFile()).text())==='preserved'}))throw Error('cache cleanup crossed its allowed scope')
 await a.getByRole('button',{name:'清除本地任务记录'}).click();await a.getByRole('dialog').getByRole('button',{name:'确认清理'}).click()
 for(const p of [a,b])await p.waitForFunction(()=>!Array.from(document.querySelectorAll('.fs-job-center .fs-center-job')).some(e=>/history-[ab]\.mp4/.test(e.textContent||'')),{},{timeout:30000})
 await b.reload();await b.getByRole('button',{name:'任务中心'}).click();await b.waitForFunction(async()=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open('frameslice-workspace',1);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});try{return await new Promise((res,rej)=>{const q=db.transaction('journal').objectStore('journal').get('snapshot');q.onsuccess=()=>res(!!q.result&&!q.result.jobs.some(j=>/history-[ab]\.mp4/.test(j.asset.name)));q.onerror=()=>rej(q.error)})}finally{db.close()}},{},{timeout:30000});if(await b.locator('.fs-job-center .fs-center-job').filter({hasText:/history-[ab]\.mp4/}).count())throw Error('deleted history returned after reload')
 // Full reset must refuse while another FrameSlice tab is open, then clean app-owned data.
 await a.getByRole('button',{name:'清除本地存储',exact:true}).click();await a.getByRole('dialog').getByRole('button',{name:'确认清理'}).click();await a.getByText(/请关闭其他 FrameSlice 标签页/).waitFor();await a.getByRole('dialog').getByRole('button',{name:'取消'}).click()
 await b.close()
 await a.evaluate(async()=>{
  localStorage.setItem('frameslice.theme','dark');localStorage.setItem('frameslice.batch.v1','{}')
  const c=await caches.open('transformers-cache');await c.put('https://huggingface.co/onnx-community/whisper-tiny/resolve/main/config.json',new Response('{}'))
  const seed=async(name,stores,entries)=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>{for(const s of stores)q.result.createObjectStore(s)};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});try{await new Promise((res,rej)=>{const tx=db.transaction(stores,'readwrite');for(const [store,key,value] of entries)tx.objectStore(store).put(value,key);tx.oncomplete=res;tx.onabort=()=>rej(tx.error)})}finally{db.close()}}
  await seed('frameslice-resume-v1',['sessions','outputs'],[['sessions','test-session',{id:'test-session'}],['outputs',['test-session','a.mp4'],{bytes:10}]])
  await seed('caption-studio',['projects'],[['projects','current',{name:'reset draft'}],['projects','unrelated',{name:'keep'}]])
 })
 await a.getByRole('button',{name:'清除本地存储',exact:true}).click();await a.getByRole('dialog').getByRole('button',{name:'确认清理'}).click();await a.getByText(/已清除本地存储：/).waitFor({timeout:30000})
 if(!await a.evaluate(async()=>{
  const get=async(name,store,key)=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open(name);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});try{return await new Promise((res,rej)=>{const q=db.transaction(store).objectStore(store).get(key);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}finally{db.close()}}
  const c=await caches.open('transformers-cache');const root=await navigator.storage.getDirectory();
  return localStorage.getItem('frameslice.batch.v1')===null&&localStorage.getItem('unrelated-app-pref')==='keep'&&!(await get('frameslice-resume-v1','sessions','test-session'))&&!(await get('frameslice-resume-v1','outputs',['test-session','a.mp4']))&&!(await get('caption-studio','projects','current'))&&!!(await get('caption-studio','projects','unrelated'))&&!(await c.match('https://huggingface.co/onnx-community/whisper-tiny/resolve/main/config.json'))&&!!(await c.match('https://huggingface.co/other/model/resolve/main/config.json'))&&(await (await (await root.getFileHandle('preserved-output.mp4')).getFile()).text())==='preserved'
 }))throw Error('full reset failed or crossed app storage boundary')
 console.log('real cross-tab history merge, clear, reload and scoped full storage reset passed')
}finally{await browser.close();await rm(dir,{recursive:true,force:true})}
