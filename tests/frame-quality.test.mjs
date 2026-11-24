import test from 'node:test'
import assert from 'node:assert/strict'
import {measureFrame,hashDistance,sceneDistance} from '../src/lib/frame-quality.mjs'
import {planManualGroups} from '../src/lib/planning.mjs'
test('sharpness and scene metrics distinguish flat and textured samples',()=>{
 const flat=new Uint8ClampedArray(64*36*4),edges=flat.slice();for(let i=0;i<edges.length;i+=4){const v=(i/4%2)?255:0;edges[i]=edges[i+1]=edges[i+2]=v}
 const a=measureFrame(flat,64,36),b=measureFrame(edges,64,36)
 assert.ok(b.sharpness>a.sharpness);assert.ok(sceneDistance(a.histogram,b.histogram)>.4);assert.equal(hashDistance(b.hash,b.hash),0)
})
test('manual GOP planning rejects invalid boundaries and covers all groups',()=>{
 const g=[0,2,4,6].map(time=>({time,bytes:10}));assert.deepEqual(planManualGroups(g,[4,2]),[[g[0]],[g[1]],g.slice(2)]);assert.throws(()=>planManualGroups(g,[3]))
})
