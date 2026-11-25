import type {Cue} from './captions';

/** Build once per cue edit. Preserve original list order for overlapping cues. */
export function buildCueIndex(cues:readonly Cue[]){
  const entries=cues.map((cue,order)=>({cue,order}))
    .filter(({cue})=>Number.isFinite(cue.start)&&Number.isFinite(cue.end)&&cue.end>cue.start)
    .sort((a,b)=>a.cue.start-b.cue.start||a.order-b.order);
  const maxEnds:number[]=[];
  let maxEnd=-Infinity;
  for(const {cue} of entries){maxEnd=Math.max(maxEnd,cue.end);maxEnds.push(maxEnd)}
  function lowerBound(values:number[],value:number,strict:boolean){
    let lo=0,hi=values.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(strict?values[mid]<=value:values[mid]<value)lo=mid+1;else hi=mid}
    return lo;
  }
  function upperStart(value:number){
    let lo=0,hi=entries.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(entries[mid].cue.start<=value)lo=mid+1;else hi=mid}
    return lo;
  }
  return {
    active(time:number):Cue|null{
      if(!Number.isFinite(time))return null;
      const lo=lowerBound(maxEnds,time,true),hi=upperStart(time);
      let result:typeof entries[number]|undefined;
      for(let i=lo;i<hi;i++){const e=entries[i];if(e.cue.end>time&&(!result||e.order<result.order))result=e}
      return result?.cue??null;
    },
    visible(start:number,end:number):Cue[]{
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return [];
      const lo=lowerBound(maxEnds,start,false),hi=upperStart(end);
      return entries.slice(lo,hi).filter(({cue})=>cue.end>=start).sort((a,b)=>a.order-b.order).map(({cue})=>cue);
    }
  };
}
