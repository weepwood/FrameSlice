import {clearWhisperCache} from './model-cache'

const REQUEST='frameslice.reset.request'
const RESULT='frameslice.reset.result'
export function readResetResult():string {try{return sessionStorage.getItem(RESULT)??''}catch{return ''}}
export function consumeResetResult():string {const value=readResetResult();try{sessionStorage.removeItem(RESULT)}catch{}return value}

async function checkIdle(allowedRuntimes:number){
 if(!navigator.locks)throw Error('当前浏览器无法安全检查其他标签页，请使用 Chrome 或 Edge')
 const {held,pending}=await navigator.locks.query()
 const locks=[...(held??[]),...(pending??[])]
 if(locks.filter(l=>l.name?.startsWith('frameslice-runtime-')).length>allowedRuntimes||locks.some(l=>l.name==='frameslice-batch-v1'||l.name?.startsWith('frameslice-resume-')))throw Error('请关闭其他 FrameSlice 标签页并结束所有任务后再清理')
}
export async function requestStorageReset(){
 await checkIdle(1)
 sessionStorage.setItem(REQUEST,'1')
 location.reload()
}
// Only exact application stores, never delete an origin's database or directory indiscriminately.
async function clearStore(database:string,stores:string[],key?:string){
 const db=await new Promise<IDBDatabase|null>((resolve,reject)=>{
  const req=indexedDB.open(database)
  let absent=false,blocked=false
  // Opening an absent database must not leave an empty v1 schema behind.
  req.onupgradeneeded=()=>{absent=true;req.transaction?.abort()}
  req.onsuccess=()=>{if(blocked){req.result.close();return}resolve(req.result)}
  req.onerror=()=>{if(absent)resolve(null);else reject(req.error)}
  req.onblocked=()=>{blocked=true;reject(Error('本地数据库正在被其他页面使用'))}
 })
 if(!db)return
 try{
  const existing=stores.filter(name=>db.objectStoreNames.contains(name))
  if(!existing.length)return
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(existing,'readwrite')
   for(const name of existing){const store=tx.objectStore(name);if(key===undefined)store.clear();else store.delete(key)}
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??Error('本地数据库清理中止'))
  })
 }finally{db.close()}
}
export async function applyRequestedStorageReset(){
 if(sessionStorage.getItem(REQUEST)!=='1')return
 sessionStorage.removeItem(REQUEST)
 try{
  // Run before Vue/React/workspace imports so no autosave or history hydration can resurrect data.
  await checkIdle(0)
  await clearWhisperCache()
  await clearStore('frameslice-workspace',['journal'])
  await clearStore('frameslice-resume-v1',['sessions','outputs'])
  await clearStore('caption-studio',['projects'],'current')
  for(const key of Object.keys(localStorage)){
   if(key.startsWith('frameslice.')||key==='frameslice-workbench-v2'||key.endsWith(':frameslice-workbench-v2'))localStorage.removeItem(key)
  }
  sessionStorage.setItem(RESULT,'已清除本地存储：模型缓存、任务历史、续作检查点、字幕草稿和应用设置。外部导出文件已保留。')
 }catch(e){sessionStorage.setItem(RESULT,'本地存储未完全清除：'+(e instanceof Error?e.message:String(e)))}
}
