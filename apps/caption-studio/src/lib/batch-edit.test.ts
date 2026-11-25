import {describe,it,expect} from 'vitest';
import {shiftSelected,cleanSelected,scaleSelected} from './batch-edit';
const cues=[{id:'a',start:1,end:2,text:'A  B'},{id:'b',start:2,end:3,text:' C  D '},{id:'c',start:4,end:5,text:'E'}];
describe('selected cue edits',()=>{
  it('shifts only selected cues and keeps duration and stable identities',()=>{
    const next=shiftSelected(cues,new Set(['a','c']),1.125);
    expect(next.map(c=>c.id)).toEqual(['b','a','c']);
    expect(next[0]).toBe(cues[1]);
    expect(next[1].start).toBe(2.125);expect(next[1].end).toBe(3.125);
    expect(cues[0].start).toBe(1);
  });
  it('rejects negative starts and invalid durations atomically',()=>{
    expect(()=>shiftSelected(cues,new Set(['a','c']),-1.1)).toThrow();
    expect(()=>shiftSelected([{...cues[0],end:1}],new Set(['a']),1)).toThrow();
    expect(shiftSelected(cues,new Set(['a']),NaN)).toBe(cues);
    expect(shiftSelected(cues,new Set(['missing']),1)).toBe(cues);
  });
  it('scales from earliest selected start and preserves unrelated cues',()=>{
    const result=scaleSelected(cues,new Set(['a','c']),1.5);
    expect(result[0]).toEqual({...cues[0],start:1,end:2.5});
    expect(result[1]).toBe(cues[1]);
    expect(result[2]).toEqual({...cues[2],start:5.5,end:7});
    expect(()=>scaleSelected(cues,new Set(['a']),.001)).toThrow();
    expect(()=>scaleSelected(cues,new Set(['a']),Infinity)).toThrow();
  });
  it('cleans selected text without changing other cues',()=>{
    const next=cleanSelected(cues,new Set(['b']));
    expect(next[0]).toBe(cues[0]);expect(next[1].text).toBe('C D');
    expect(cleanSelected(cues,new Set(['c']))).toBe(cues);
  });
});
