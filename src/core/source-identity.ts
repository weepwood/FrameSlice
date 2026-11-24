/** Bounded fingerprint is for an explicit re-run, not proof of full file equality. */
export async function sampleFingerprint(file:File):Promise<string>{
 const size=65536
 const offsets=[0,Math.max(0,Math.floor(file.size/2)-size/2),Math.max(0,file.size-size)]
 const header=new TextEncoder().encode('frameslice-sample-v1:'+file.size+':'+offsets.join(','))
 const slices=await Promise.all(offsets.map(o=>file.slice(o,o+size).arrayBuffer()))
 const bytes=new Uint8Array(header.length+slices.reduce((n,s)=>n+s.byteLength,0))
 bytes.set(header);let offset=header.length
 for(const slice of slices){bytes.set(new Uint8Array(slice),offset);offset+=slice.byteLength}
 const digest=await crypto.subtle.digest('SHA-256',bytes)
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
}
