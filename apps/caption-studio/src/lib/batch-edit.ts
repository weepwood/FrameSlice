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

/** Retiming is relative to the earliest selected start, not the media origin. */
export function scaleSelected(cues:Cue[],ids:ReadonlySet<string>,factor:number):Cue[]{
  if(!Number.isFinite(factor)||factor<=0||factor>100)throw Error('请输入大于0且不超过100的时间比例');
  const chosen=cues.filter(c=>ids.has(c.id));
  if(!chosen.length||factor===1)return cues;
  const pivot=chosen.reduce((min,c)=>Math.min(min,c.start),Infinity);
  const adjusted=new Map<string,Cue>();
  for(const c of chosen){
    const start=round3(pivot+(c.start-pivot)*factor),end=round3(pivot+(c.end-pivot)*factor);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end-start<.079999)throw Error('校准后存在无效时间或小于80毫秒的字幕，已取消整批修改');
    adjusted.set(c.id,{...c,start,end});
  }
  return sorted(cues.map(c=>adjusted.get(c.id)??c));
}
