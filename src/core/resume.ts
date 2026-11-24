import type {SplitResult} from '../lib/split'
export interface ResumeSession {id:string;folder:FileSystemDirectoryHandle;source?:string;config?:string}
interface SavedOutput {name:string;bytes:number;digest:string;part?:SplitResult}
const CHUNK=4*1024*1024
function check(signal:AbortSignal){if(signal.aborted)throw new DOMException('任务已取消','AbortError')}
/** Chained SHA-256 covers every byte in bounded chunks; not a standard file SHA-256. */
export async function fullFingerprint(blob:Blob,signal:AbortSignal,progress?:(n:number)=>void):Promise<string>{
 let state=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('frameslice-full-v1:'+blob.size)))
 for(let offset=0;offset<blob.size;offset+=CHUNK){
  check(signal);const bytes=new Uint8Array(await blob.slice(offset,offset+CHUNK).arrayBuffer())
  const data=new Uint8Array(state.length+bytes.length);data.set(state);data.set(bytes,state.length)
  state=new Uint8Array(await crypto.subtle.digest('SHA-256',data.buffer));progress?.((offset+bytes.length)/blob.size)
 }
 check(signal);return Array.from(state,x=>x.toString(16).padStart(2,'0')).join('')
}
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const req=indexedDB.open('frameslice-resume-v1',1)
 req.onupgradeneeded=()=>{req.result.createObjectStore('sessions');req.result.createObjectStore('outputs')}
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('续作数据库被阻塞'))
})}
async function read<T>(store:string,key:IDBValidKey):Promise<T|undefined>{const db=await open();try{return await new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store).get(key);req.onsuccess=()=>resolve(req.result as T|undefined);req.onerror=()=>reject(req.error)})}finally{db.close()}}
async function write(store:string,key:IDBValidKey,value:unknown):Promise<void>{const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}}
export async function createResumeSession(folder:FileSystemDirectoryHandle):Promise<ResumeSession>{const session={id:crypto.randomUUID(),folder};await write('sessions',session.id,session);return session}
export function loadResumeSession(id:string){return read<ResumeSession>('sessions',id)}
export async function authorizeResumeFolder(folder:FileSystemDirectoryHandle):Promise<void>{
 const h=folder as FileSystemDirectoryHandle & {queryPermission?:(o:{mode:'readwrite'})=>Promise<PermissionState>;requestPermission?:(o:{mode:'readwrite'})=>Promise<PermissionState>}
 if(!h.queryPermission||await h.queryPermission({mode:'readwrite'})==='granted')return
 if(!h.requestPermission||await h.requestPermission({mode:'readwrite'})!=='granted')throw new DOMException('原输出目录授权已失效，请重新授权','NotAllowedError')
}
export class ResumeJournal {
 constructor(private session:ResumeSession,private signal:AbortSignal){}
 static async prepare(id:string,folder:FileSystemDirectoryHandle,file:File,config:string,signal:AbortSignal,progress:(n:number)=>void){
  const session=await loadResumeSession(id)
  if(!session||!await session.folder.isSameEntry(folder))throw Error('续作目录与原目录不一致')
  if(session.config!==undefined&&session.config!==config)throw Error('续作参数已改变，请新建任务')
  const source=await fullFingerprint(file,signal,progress)
  if(session.source!==undefined&&session.source!==source)throw Error('源文件完整指纹不一致，禁止跳过历史输出')
  if(session.source===undefined){session.source=source;session.config=config;await write('sessions',id,session)}
  return new ResumeJournal(session,signal)
 }
 async previous(name:string):Promise<SavedOutput|undefined>{
  check(this.signal);const previous=await read<SavedOutput>('outputs',[this.session.id,name])
  let file:File|undefined
  try{file=await (await this.session.folder.getFileHandle(name)).getFile()}catch(e){if(!(e instanceof DOMException&&e.name==='NotFoundError'))throw e}
  if(!file)return undefined
  if(!previous||file.size!==previous.bytes||await fullFingerprint(file,this.signal)!==previous.digest)throw Error('历史文件缺少可信检查点或内容已改变：'+name+'。请移出该文件后重试，或新建任务。')
  return previous
 }
 async commit(name:string,part?:SplitResult):Promise<void>{
  const file=await (await this.session.folder.getFileHandle(name)).getFile()
  await write('outputs',[this.session.id,name],{name,bytes:file.size,digest:await fullFingerprint(file,this.signal),part})
 }
}

/** Deletes only metadata and persisted handle references; never calls removeEntry on user folders. */
export async function forgetResumeSession(id:string):Promise<void>{
 if(!navigator.locks)throw Error('浏览器不支持安全清理互斥锁')
 await navigator.locks.request('frameslice-resume-'+id,{ifAvailable:true},async lock=>{
  if(!lock)throw Error('任务仍在执行，不能清除检查点')
  const db=await open()
  try{await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(['sessions','outputs'],'readwrite')
   tx.objectStore('sessions').delete(id)
   const req=tx.objectStore('outputs').openCursor(IDBKeyRange.bound([id],[id,[]],false,true))
   req.onsuccess=()=>{const cursor=req.result;if(cursor){cursor.delete();cursor.continue()}}
   req.onerror=()=>tx.abort()
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??Error('检查点清理中止'))
  })}finally{db.close()}
 })
}
export async function resumePermission(id:string):Promise<PermissionState|'missing'>{
 const session=await loadResumeSession(id);if(!session)return 'missing'
 const h=session.folder as FileSystemDirectoryHandle & {queryPermission?:(o:{mode:'readwrite'})=>Promise<PermissionState>}
 return h.queryPermission?await h.queryPermission({mode:'readwrite'}):'granted'
}
