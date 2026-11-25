import {describe,it,expect} from 'vitest';
import {buildCueIndex} from './cue-index';
import type {Cue} from './captions';
describe('cue interval index',()=>{
  it('matches list semantics at boundaries and overlaps, including unsorted imports',()=>{
    const cues:Cue[]=[{id:'a',start:4,end:9,text:'a'},{id:'b',start:0,end:12,text:'b'},{id:'c',start:5,end:6,text:'c'},{id:'d',start:12,end:13,text:'d'}];
    const index=buildCueIndex(cues);
    for(let t=-1;t<=14;t+=.25)expect(index.active(t)).toBe(cues.find(c=>c.start<=t&&t<c.end)??null);
    for(let t=0;t<14;t+=.5)expect(index.visible(t,t+1)).toEqual(cues.filter(c=>c.end>=t&&c.start<=t+1));
  });
  it('queries a 100000 cue project including its last cue',()=>{
    const cues=Array.from({length:100000},(_,i)=>({id:String(i),start:i*2,end:i*2+1,text:'test'}));
    const index=buildCueIndex(cues);
    expect(index.active(199998.5)).toBe(cues[99999]);
    expect(index.active(199999)).toBeNull();
    expect(index.visible(199990,199999)).toEqual(cues.slice(-5));
  });
  it('rejects invalid intervals and non-finite query coordinates',()=>{
    const index=buildCueIndex([{id:'bad',start:1,end:0,text:''},{id:'nan',start:NaN,end:5,text:''}]);
    expect(index.active(1)).toBeNull();expect(index.visible(0,10)).toEqual([]);expect(index.visible(NaN,5)).toEqual([]);
  });
});
