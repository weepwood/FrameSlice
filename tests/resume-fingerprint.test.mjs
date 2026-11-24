import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const built=await build({entryPoints:['src/core/resume.ts'],bundle:true,platform:'node',format:'esm',write:false})
const {fullFingerprint}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
test('full fingerprint detects changed interior bytes and honors cancellation',async()=>{
 const a=new Uint8Array(9*1024*1024),b=a.slice();b[4*1024*1024+17]=1
 const sig=new AbortController()
 assert.notEqual(await fullFingerprint(new Blob([a]),sig.signal),await fullFingerprint(new Blob([b]),sig.signal))
 assert.equal(await fullFingerprint(new Blob([a]),sig.signal),await fullFingerprint(new Blob([a]),sig.signal))
 sig.abort();await assert.rejects(fullFingerprint(new Blob([a]),sig.signal),{name:'AbortError'})
})
