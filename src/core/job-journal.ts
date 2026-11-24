import {mergeHistory} from './history-merge'
/** Metadata-only IndexedDB journal with transactional per-record merging. */
export interface JournalSnapshot { updatedAt:number; jobs:unknown[] }
export class JobJournal {
 private db:Promise<IDBDatabase>|undefined
 private pending:Promise<void>=Promise.resolve()
 constructor(private factory:IDBFactory){}
 private open():Promise<IDBDatabase>{
  if(!this.db)this.db=new Promise((resolve,reject)=>{
   const req=this.factory.open('frameslice-workspace',1)
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('journal'))req.result.createObjectStore('journal')}
   let abandoned=false
   req.onsuccess=()=>{if(abandoned){req.result.close();return}req.result.onversionchange=()=>{req.result.close();this.db=undefined};req.result.onclose=()=>{this.db=undefined};resolve(req.result)}
   req.onerror=()=>{this.db=undefined;reject(req.error)}
   req.onblocked=()=>{abandoned=true;this.db=undefined;reject(Error('任务历史数据库升级被其他标签页阻塞'))}
  })
  return this.db
 }
 async read():Promise<JournalSnapshot|null>{
  const db=await this.open()
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('journal','readonly'),req=tx.objectStore('journal').get('snapshot')
   req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error)
  })
 }
 write(snapshot:JournalSnapshot,removed:string[]=[]):Promise<void>{
  // Clone before queueing: Vue reactive proxies must never reach IndexedDB.
  const data=JSON.parse(JSON.stringify(snapshot)) as JournalSnapshot
  this.pending=this.pending.catch(()=>{}).then(async()=>{
   const db=await this.open()
   await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('journal','readwrite'),store=tx.objectStore('journal'),req=store.get('snapshot')
    req.onsuccess=()=>{const old=req.result as JournalSnapshot|undefined;type Row={id:string;createdAt:number;status:string};const rows=mergeHistory((old?.jobs??[]) as Row[],data.jobs as Row[],removed);store.put({updatedAt:Math.max(data.updatedAt,(old?.updatedAt??0)+1),jobs:rows},'snapshot')}
    req.onerror=()=>tx.abort()
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new DOMException('任务历史事务中止','AbortError'))
   })
  })
  return this.pending
 }
}
