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
    let blocked=false;
    request.onblocked=()=>{blocked=true;reject(new Error('字幕草稿数据库被其他页面占用，请关闭后重试'))};
    request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result)};
    request.onerror=()=>reject(request.error);
  });
}
async function access<T>(mode:IDBTransactionMode, work:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDb();
  try {
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);
      let result:T;
      let requestError:DOMException|null=null;
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(tx.error??requestError??new DOMException('字幕草稿事务已中止','AbortError'));
      const req=work(tx.objectStore(STORE));
      req.onsuccess=()=>{result=req.result};
      req.onerror=()=>{requestError=req.error};
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
  if(p.version!==undefined&&p.version!==1)throw Error('不支持的字幕工程版本');
  if(!Array.isArray(p.cues)||p.cues.length>100000||!p.cues.every(c=>c&&typeof c==='object'&&typeof c.text==='string'&&Number.isFinite(c.start)&&Number.isFinite(c.end)))throw Error('字幕格式错误');
  const ids=new Set<string>();
  const cues=p.cues.map(c=>{let id=typeof c.id==='string'&&c.id?c.id:crypto.randomUUID();while(ids.has(id))id=crypto.randomUUID();ids.add(id);return {id,start:c.start,end:c.end,text:c.text}});
  const source:Partial<CaptionStyle>=p.style??{};
  const color=(v:unknown,fallback:string)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v:fallback;
  const style:CaptionStyle={fontSize:typeof source.fontSize==='number'&&Number.isFinite(source.fontSize)?Math.min(92,Math.max(24,source.fontSize)):defaultStyle.fontSize,textColor:color(source.textColor,defaultStyle.textColor),boxColor:color(source.boxColor,defaultStyle.boxColor),boxOpacity:typeof source.boxOpacity==='number'&&Number.isFinite(source.boxOpacity)?Math.min(1,Math.max(0,source.boxOpacity)):defaultStyle.boxOpacity,position:source.position==='top'||source.position==='middle'||source.position==='bottom'?source.position:defaultStyle.position,bold:typeof source.bold==='boolean'?source.bold:defaultStyle.bold};
  return {
    version:1,name:typeof p.name==='string'?p.name.slice(0,200):'未命名项目',
    mediaName:typeof p.mediaName==='string'?p.mediaName.slice(0,250):'',
    duration:Number.isFinite(p.duration)?Math.max(0,p.duration!):0,
    cues,
    style,updatedAt:Date.now()
  };
}
