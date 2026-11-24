/** Metadata-only IndexedDB journal. The entire bounded snapshot is atomically replaced. */
export interface JournalSnapshot { updatedAt:number; jobs:unknown[] }
export class JobJournal {
 private db:Promise<IDBDatabase>|undefined
 private pending:Promise<void>=Promise.resolve()
 constructor(private factory:IDBFactory){}
 private open():Promise<IDBDatabase>{
  if(!this.db)this.db=new Promise((resolve,reject)=>{
   const req=this.factory.open('frameslice-workspace',1)
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('journal'))req.result.createObjectStore('journal')}
   req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();this.db=undefined};resolve(req.result)}
   req.onerror=()=>reject(req.error)
   req.onblocked=()=>reject(Error('任务历史数据库升级被其他标签页阻塞'))
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
 write(snapshot:JournalSnapshot):Promise<void>{
  // Clone before queueing: Vue reactive proxies must never reach IndexedDB.
  const data=JSON.parse(JSON.stringify(snapshot)) as JournalSnapshot
  this.pending=this.pending.catch(()=>{}).then(async()=>{
   const db=await this.open()
   await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('journal','readwrite');tx.objectStore('journal').put(data,'snapshot')
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
   })
  })
  return this.pending
 }
}
