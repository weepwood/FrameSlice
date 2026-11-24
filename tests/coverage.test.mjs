import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyCoverage,addCoverage,sumCoverage,assertCoverage,assertGopOrder,isLeadingAacPreroll} from '../src/lib/coverage.mjs'
test('packet coverage catches missing or duplicated packets before export',()=>{
 const a=emptyCoverage();addCoverage(a,{byteLength:12});addCoverage(a,{byteLength:8})
 assert.deepEqual(a,{packets:2,bytes:20})
 assert.throws(()=>assertCoverage(a,{packets:1,bytes:20},'video'),/覆盖率/)
 assert.throws(()=>assertCoverage(a,{packets:2,bytes:19},'video'),/覆盖率/)
 assert.doesNotThrow(()=>assertCoverage(a,sumCoverage([{packets:1,bytes:12},{packets:1,bytes:8}]),'video'))
})
test('invalid GOP order rejects both size and duration planning',()=>{
 assert.throws(()=>assertGopOrder([{time:0},{time:0}],1),/时间戳/)
 assert.throws(()=>assertGopOrder([{time:-1}],1),/时间戳/)
 assert.doesNotThrow(()=>assertGopOrder([{time:0},{time:1}],2))
})

test('only a bounded complete AAC preroll before the first video boundary may be excluded',()=>{
 assert.equal(isLeadingAacPreroll('aac',{timestamp:-.021333,duration:.021333},0),true)
 assert.equal(isLeadingAacPreroll('aac',{timestamp:-.01,duration:.021333},0),false)
 assert.equal(isLeadingAacPreroll('aac',{timestamp:-.2,duration:.02},0),false)
 assert.equal(isLeadingAacPreroll('opus',{timestamp:-.02,duration:.02},0),false)
})
