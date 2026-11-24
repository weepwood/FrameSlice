import test from 'node:test'
import assert from 'node:assert/strict'
import {selectGopRange} from '../src/lib/planning.mjs'
test('exact range preserves exclusive end and rejects non-GOP timestamps',()=>{const g=[0,2,4,6].map(time=>({time,bytes:10}));assert.deepEqual(selectGopRange(g,8,2,6),{groups:g.slice(1,3),end:g[3]});assert.deepEqual(selectGopRange(g,8,4,8),{groups:g.slice(2),end:null});assert.throws(()=>selectGopRange(g,8,1,6));assert.throws(()=>selectGopRange(g,8,2,5))})
