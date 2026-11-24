import test from 'node:test'
import assert from 'node:assert/strict'
import {nearestKey,visibleKeys} from '../src/lib/timeline-index.mjs'
import {candidateTimes} from '../src/lib/frame-quality.mjs'
test('precise index and bounded visual sampling',()=>{const keys=Array.from({length:250000},(_,i)=>i*.5);assert.equal(nearestKey(keys,10000.24),10000);assert.equal(nearestKey(keys,10000.26),10000.5);assert.ok(visibleKeys(keys,0,125000).length<=200);assert.deepEqual(visibleKeys(keys,4,5),[4,4.5])})
test('candidate budget and end boundary',()=>{const ts=candidateTimes(1,2,5,12);assert.equal(ts.length,12);assert.ok(ts.every(t=>t>=1&&t<2));assert.throws(()=>candidateTimes(0,1,1,13))})
