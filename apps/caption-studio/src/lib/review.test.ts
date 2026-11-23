import {describe,expect,it} from 'vitest';
import {cleanCaptionText,getProblemCueIds,repairOverlaps,replaceCaptionText} from './review';
import type {Cue} from './captions';
const cues:Cue[]=[
  {id:'one',start:0,end:2.8,text:'你好，世界'},
  {id:'two',start:2.5,end:4,text:'Testing example'},
  {id:'three',start:5,end:6,text:' '},
];
describe('subtitle review actions',()=>{
  it('cleans whitespace without removing content or line breaks',()=>{
    expect(cleanCaptionText(' 你好  ， 世界  \n next   line ! ')).toBe('你好， 世界\nnext line!');
  });
  it('identifies issue cues',()=>{
    expect(getProblemCueIds(cues)).toEqual(['one','three']);
  });
  it('repairs safe overlaps without mutating inputs',()=>{
    const result=repairOverlaps(cues);
    expect(result[0].end).toBe(2.5);
    expect(cues[0].end).toBe(2.8);
    expect(result[1].end).toBe(4);
  });
  it('leaves unrepairable overlaps visible for manual correction',()=>{
    const r=repairOverlaps([{id:'a',start:0,end:2,text:'a'},{id:'b',start:.05,end:3,text:'b'}]);
    expect(r[0].end).toBe(2);
  });
  it('replaces literal punctuation and ignores case',()=>{
    expect(replaceCaptionText('C++ and c++','c++','$1')).toBe('$1 and $1');
    expect(replaceCaptionText('abc','', 'x')).toBe('abc');
  });
});
