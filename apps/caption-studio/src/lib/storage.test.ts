import {describe,it,expect} from 'vitest';
import {verifyProject} from './storage';
describe('project validation',()=>{
  it('preserves content and repairs duplicate identities',()=>{
    const p=verifyProject({version:1,cues:[{id:'same',start:3600.125,end:3601.675,text:'one'},{id:'same',start:3602,end:3603,text:'two'}]});
    expect(new Set(p.cues.map(c=>c.id)).size).toBe(2);
    expect(p.cues.map(c=>c.text)).toEqual(['one','two']);
    expect(p.cues[0].start).toBe(3600.125);
  });
  it('normalizes malformed preview styles without losing cues',()=>{
    const p=verifyProject({version:1,cues:[{id:'a',start:1,end:2,text:'kept'}],style:{fontSize:1000,boxOpacity:-2,boxColor:42,position:'other',bold:'yes'}});
    expect(p.style).toEqual({fontSize:92,textColor:'#ffffff',boxColor:'#111111',boxOpacity:0,position:'bottom',bold:true});
    expect(p.cues[0].text).toBe('kept');
  });
  it('rejects future versions and malformed rows rather than overwriting drafts',()=>{
    expect(()=>verifyProject({version:2,cues:[]})).toThrow();
    expect(()=>verifyProject({version:1,cues:[null]})).toThrow();
    expect(()=>verifyProject({version:1,cues:[{start:NaN,end:2,text:'x'}]})).toThrow();
  });
});
