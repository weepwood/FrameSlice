import {lintCue, type Cue, type Issue} from './captions';

/** Preserve the user's words while cleaning accidental spacing. */
export function cleanCaptionText(text:string):string {
  return text.split('\n').map(line=>line
    .replace(/[\t\u00a0]+/g,' ')
    .replace(/ {2,}/g,' ')
    .replace(/\s+([，。！？、；：,.!?;:])/g,'$1')
    .replace(/([（「『【])\s+/g,'$1')
    .replace(/\s+([）」』】])/g,'$1')
    .trim()).join('\n').trim();
}

export function getProblemCueIds(cues:Cue[]):string[] {
  return cues.filter((cue,index)=>lintCue(cue,cues[index+1]).length>0).map(cue=>cue.id);
}

/** Only change timing when a safe gap can be created. No cue is deleted or shortened below 120ms. */
export function repairOverlaps(cues:Cue[]):Cue[] {
  const out=cues.map(c=>({...c}));
  for(let i=0;i<out.length-1;i++){
    const current=out[i],next=out[i+1];
    if(!Number.isFinite(current.end)||!Number.isFinite(next.start))continue;
    if(current.end>next.start&&next.start-current.start>=.12){
      current.end=Math.round(next.start*1000)/1000;
    }
  }
  return out;
}

export function replaceCaptionText(text:string,term:string,replacement:string):string {
  if(!term)return text;
  return text.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),()=>replacement);
}


export const issueNames:Record<Issue,string>={empty:'空白内容',time:'无效时间',overlap:'时间重叠',fast:'阅读太快',long:'字幕过长'};
export function reviewCues(cues:readonly Cue[]){
  const byId=new Map<string,Issue[]>(),counts:Record<Issue,number>={empty:0,time:0,overlap:0,fast:0,long:0};
  let total=0;
  for(let i=0;i<cues.length;i++){
    const issues=lintCue(cues[i],cues[i+1]);
    if(!issues.length)continue;
    byId.set(cues[i].id,issues);
    for(const issue of issues){counts[issue]++;total++}
  }
  return {byId,counts,total,affected:byId.size};
}
