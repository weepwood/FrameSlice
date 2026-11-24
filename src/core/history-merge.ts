/** Merge only actual record changes, not the caller's entire stale snapshot. */
type RecordLike={id:string;createdAt:number;status:string}
export function mergeHistory<T extends RecordLike>(previous:T[],updates:T[],removed:string[]=[]):T[]{
 const deleted=new Set(removed),map=new Map<string,T>()
 for(const record of previous)if(!deleted.has(record.id))map.set(record.id,record)
 for(const record of updates)if(!deleted.has(record.id))map.set(record.id,record)
 const rows=[...map.values()].sort((a,b)=>b.createdAt-a.createdAt)
 const active=(r:T)=>['queued','running','canceling'].includes(r.status)
 return [...rows.filter(active),...rows.filter(r=>!active(r)).slice(0,100)]
}
