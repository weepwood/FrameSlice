import type {BatchResult,BatchSettings} from './batch'
export interface BatchJournal {id:string;settings:BatchSettings;files:{name:string;bytes:number;lastModified:number}[];rows:BatchResult[];updatedAt:number}
const KEY='frameslice.batch.v1'
export function loadBatch():BatchJournal|null{try{const x=JSON.parse(localStorage.getItem(KEY)??'null') as BatchJournal|null;if(!x||!Array.isArray(x.rows)||!Array.isArray(x.files)||x.rows.length>50||x.rows.length!==x.files.length)return null;return {...x,rows:x.rows.map(r=>r.status==='running'||r.status==='waiting'?{...r,status:'interrupted',detail:'上次页面关闭，请重新选择源文件'}:r)}}catch{return null}}
export function saveBatch(journal:BatchJournal){localStorage.setItem(KEY,JSON.stringify(journal))}
export function clearBatch(){localStorage.removeItem(KEY)}
