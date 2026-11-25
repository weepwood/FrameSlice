import {round3,sorted,type Cue} from './captions';
import {cleanCaptionText} from './review';

export function shiftSelected(cues:Cue[],ids:ReadonlySet<string>,offset:number):Cue[]{
  if(!Number.isFinite(offset)||!ids.size||offset===0)return cues;
  const chosen=cues.filter(c=>ids.has(c.id));
  if(!chosen.length)return cues;
  for(const c of chosen){
    const start=round3(c.start+offset),end=round3(c.end+offset);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw Error('偏移后存在负时间或无效时间，请调整偏移量');
  }
  return sorted(cues.map(c=>ids.has(c.id)?{...c,start:round3(c.start+offset),end:round3(c.end+offset)}:c));
}

export function cleanSelected(cues:Cue[],ids:ReadonlySet<string>):Cue[]{
  let changed=false;
  const result=cues.map(c=>{
    if(!ids.has(c.id))return c;
    const text=cleanCaptionText(c.text);
    if(text===c.text)return c;
    changed=true;return {...c,text};
  });
  return changed?result:cues;
}
