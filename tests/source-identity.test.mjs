import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const built=await build({entryPoints:['src/core/source-identity.ts'],bundle:true,platform:'node',format:'esm',write:false})
const {sampleFingerprint}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
test('bounded fingerprint matches reselected bytes but rejects changed sample',async()=>{
 const a=new File(['hello'],'x.mp4'),b=new File(['hello'],'y.mp4'),c=new File(['world'],'x.mp4')
 assert.equal(await sampleFingerprint(a),await sampleFingerprint(b))
 assert.notEqual(await sampleFingerprint(a),await sampleFingerprint(c))
})
