import {defaultStyle,type CaptionStyle,type Cue} from './captions';
export interface Project {
  version: 1;
  name: string;
  mediaName: string;
  duration: number;
  cues: Cue[];
  style: CaptionStyle;
  updatedAt: number;
}
const DB='caption-studio', STORE='projects', KEY='current';
async function openDb():Promise<IDBDatabase>{
  return await new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function access<T>(mode:IDBTransactionMode, work:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDb();
  try {
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);
      const req=work(tx.objectStore(STORE));
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
      tx.onerror=()=>reject(tx.error);
    });
  } finally { db.close(); }
}
export async function loadProject():Promise<Project|null>{
  return (await access('readonly',s=>s.get(KEY)) as Project|undefined)??null;
}
export async function saveProject(project:Project):Promise<void>{
  await access('readwrite',s=>s.put(project,KEY));
}
export async function clearProject():Promise<void>{
  await access('readwrite',s=>s.delete(KEY));
}
export function verifyProject(x:unknown):Project{
  if(!x||typeof x!=='object')throw Error('不是有效的项目文件');
  const p=x as Partial<Project>;
  if(!Array.isArray(p.cues)||p.cues.length>100000||!p.cues.every(c=>typeof c.text==='string'&&Number.isFinite(c.start)&&Number.isFinite(c.end)))throw Error('字幕格式错误');
  return {
    version:1,name:typeof p.name==='string'?p.name.slice(0,200):'未命名项目',
    mediaName:typeof p.mediaName==='string'?p.mediaName.slice(0,250):'',
    duration:Number.isFinite(p.duration)?Math.max(0,p.duration!):0,
    cues:p.cues.map(c=>({id:typeof c.id==='string'?c.id:crypto.randomUUID(),start:c.start,end:c.end,text:c.text})),
    style:{...defaultStyle,...(p.style||{})},updatedAt:Date.now()
  };
}
