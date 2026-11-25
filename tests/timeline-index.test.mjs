import test from 'node:test'
import assert from 'node:assert/strict'
import {nearestKey,visibleKeys} from '../src/lib/timeline-index.mjs'
import {candidateTimes} from '../src/lib/frame-quality.mjs'
test('precise index and bounded visual sampling',()=>{const keys=Array.from({length:250000},(_,i)=>i*.5);assert.equal(nearestKey(keys,10000.24),10000);assert.equal(nearestKey(keys,10000.26),10000.5);assert.ok(visibleKeys(keys,0,125000).length<=200);assert.deepEqual(visibleKeys(keys,4,5),[4,4.5])})
test('candidate budget and end boundary',()=>{const ts=candidateTimes(1,2,5,12);assert.equal(ts.length,12);assert.ok(ts.every(t=>t>=1&&t<2));assert.throws(()=>candidateTimes(0,1,1,13))})

test('viewport zoom preserves the anchor and clamps both edges',async()=>{
 const {anchoredViewport}=await import('../src/lib/timeline-index.mjs');
 assert.equal(anchoredViewport(100,50,10,25,30),20);
 assert.equal(anchoredViewport(100,25,75,100,100),0);
 assert.equal(anchoredViewport(100,25,75,12.5,100),87.5);
});
test('keyframe snap uses pixel tolerance, not an unbounded nearest jump',async()=>{
 const {snapTimeline}=await import('../src/lib/timeline-index.mjs');
 assert.equal(snapTimeline([0,5,10],4.9,10,500),5);
 assert.equal(snapTimeline([0,5,10],4,10,500),4);
 assert.equal(snapTimeline([],4,10,500),4);
});
