import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const dir=await mkdtemp(join(tmpdir(),'frameslice-workspace-'))
const out=join(dir,'workspace.mjs')
await build({entryPoints:['src/core/workspace.ts'],bundle:true,platform:'node',format:'esm',outfile:out})
const {WorkspaceRuntime}=await import(pathToFileURL(out).href)
await rm(dir,{recursive:true,force:true})
const file=new File(['media'],'clip.mp4',{lastModified:42})
const signal=()=>new AbortController().signal
test('queues expensive work, cancels waiting jobs, and records validated output',async()=>{
 const runtime=new WorkspaceRuntime()
 let release
 const order=[]
 const first=runtime.run('split',file,signal(),async ctx=>{
   order.push('first');ctx.progress(.5);ctx.checkpoint('part.mp4');await new Promise(r=>release=r);return 1
 })
 const cancel=new AbortController()
 const pending=runtime.run('burn',file,cancel.signal,async()=>{throw Error('must not execute')})
 const next=runtime.run('frames',file,signal(),async()=>{order.push('next');return 2})
 const rejection=assert.rejects(pending,{name:'AbortError'});cancel.abort();await rejection
 assert.deepEqual(order,['first']);release();assert.equal(await first,1);assert.equal(await next,2)
 assert.deepEqual(order,['first','next'])
 assert.equal(runtime.snapshot().find(j=>j.type==='split').checkpoint.count,1)
 assert.equal(runtime.snapshot().find(j=>j.type==='burn').status,'canceled')
})
test('active abort releases slot only after worker settles',async()=>{
 const runtime=new WorkspaceRuntime();const controller=new AbortController()
 let release;let nextStarted=false
 const first=runtime.run('transcribe',file,controller.signal,async()=>await new Promise(r=>release=r))
 const next=runtime.run('frames',file,signal(),async()=>{nextStarted=true})
 const rejection=assert.rejects(first,{name:'AbortError'});controller.abort()
 assert.equal(runtime.snapshot().find(j=>j.type==='transcribe').status,'canceling');assert.equal(nextStarted,false)
 release();await rejection;await next;assert.equal(nextStarted,true)
})
test('asset identity is file-object scoped; interrupted metadata restores without source bytes',async()=>{
 const map=new Map();const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}
 const runtime=new WorkspaceRuntime(storage)
 assert.equal(runtime.asset(file).id,runtime.asset(file).id)
 assert.notEqual(runtime.asset(file).id,runtime.asset(new File(['media'],'clip.mp4',{lastModified:42})).id)
 runtime.cache(file,'gop',{count:3});assert.deepEqual(runtime.cached(file,'gop'),{count:3})
 let release;const job=runtime.run('split',file,signal(),async ctx=>{ctx.checkpoint('part.mp4');await new Promise(r=>release=r)})
 const restored=new WorkspaceRuntime(storage);assert.equal(restored.snapshot()[0].status,'interrupted')
 assert.equal(restored.snapshot()[0].checkpoint.lastOutput,'part.mp4')
 release();await job;runtime.clearHistory();assert.equal(runtime.snapshot().length,0)
})

test('priority changes queued order without preempting the current task',async()=>{const runtime=new WorkspaceRuntime(),file=new File(['x'],'x.mp4'),signal=new AbortController().signal;let release;const order=[];const first=runtime.run('split',file,signal,async()=>{await new Promise(r=>release=r)});const low=runtime.run('frames',file,signal,async()=>{order.push('low')},undefined,'background');const high=runtime.run('frames',file,signal,async()=>{order.push('high')},undefined,'high');release();await Promise.all([first,low,high]);assert.deepEqual(order,['high','low'])})

test('two runtimes preserve independent history changes and explicit clear',async()=>{const map=new Map();const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};const a=new WorkspaceRuntime(storage),b=new WorkspaceRuntime(storage);await a.run('split',file,signal(),async()=>{});await b.run('frames',file,signal(),async()=>{});const c=new WorkspaceRuntime(storage);assert.equal(c.snapshot().length,2);c.clearHistory();assert.equal(JSON.parse(storage.getItem('frameslice.jobs.v1')).length,0)})
