/** MIT-derived caption logic, revised for CJK punctuation and invalid timestamps. */
export interface Cue { id: string; start: number; end: number; text: string }
export interface Chunk { text: string; timestamp: [number, number | null] }
export type Issue = 'empty' | 'time' | 'overlap' | 'fast' | 'long';
export interface CaptionStyle {
  fontSize: number;
  textColor: string;
  boxColor: string;
  boxOpacity: number;
  position: 'bottom' | 'middle' | 'top';
  bold: boolean;
}
export const defaultStyle: CaptionStyle = {
  fontSize: 55, textColor: '#ffffff', boxColor: '#111111',
  boxOpacity: 0.6, position: 'bottom', bold: true
};
export const uid = (): string => globalThis.crypto?.randomUUID?.() ?? `cue-${Math.random().toString(36).slice(2)}`;
export const round3 = (n: number) => Math.round(n * 1000) / 1000;
export const sorted = (cues: Cue[]): Cue[] => [...cues].sort((a,b) => a.start - b.start || a.end - b.end);
export const fmt = (seconds: number, format: 'srt' | 'vtt' = 'srt'): string => {
  const ms = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds * 1000 : 0));
  const d = (n: number, width=2) => String(n).padStart(width, '0');
  return `${d(Math.floor(ms / 3600000))}:${d(Math.floor(ms / 60000) % 60)}:${d(Math.floor(ms / 1000) % 60)}${format==='srt'?',':'.'}${d(ms%1000,3)}`;
};
export const shortTime = (s: number) => `${Math.floor(Math.max(s,0)/60).toString().padStart(2,'0')}:${(Math.max(s,0)%60).toFixed(1).padStart(4,'0')}`;
export function parseTime(raw: string): number {
  const v=raw.trim().replace(',', '.');
  if (/^\d+(?:\.\d+)?$/.test(v)) return Number(v);
  const m=/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/.exec(v);
  if(!m) return Number.NaN;
  const h=Number(m[1]||0), min=Number(m[2]), sec=Number(m[3]);
  if(min>59 || sec>59) return Number.NaN;
  return h*3600+min*60+sec+Number((m[4]||'0').padEnd(3,'0'))/1000;
}
export function parseSubtitles(raw: string): Cue[] {
  const blocks=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split(/\n\s*\n/);
  const out:Cue[]=[];
  for(const block of blocks) {
    const lines=block.split('\n');
    const index=lines.findIndex(s=>s.includes('-->'));
    if(index<0) continue;
    const [startRaw, remainder]=lines[index].split(/\s*-->\s*/);
    if(!remainder) continue;
    const start=parseTime(startRaw);
    const end=parseTime(remainder.trim().split(/\s+/)[0]);
    const text=lines.slice(index+1).join('\n').trim();
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!text) continue;
    out.push({id:uid(),start,end,text});
  }
  return sorted(out);
}
export const toSRT=(cues:Cue[])=>sorted(cues).filter(c=>c.end>c.start&&c.text.trim()).map((c,i)=>`${i+1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text.trim()}\n`).join('\n');
export const toVTT=(cues:Cue[])=>`WEBVTT\n\n${sorted(cues).filter(c=>c.end>c.start&&c.text.trim()).map(c=>`${fmt(c.start,'vtt')} --> ${fmt(c.end,'vtt')}\n${c.text.trim()}\n`).join('\n')}`;
export const lintCue=(c:Cue,next?:Cue): Issue[]=>{
  const issues:Issue[]=[];const duration=c.end-c.start;
  if(!c.text.trim())issues.push('empty');
  if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||duration<=0)issues.push('time');
  if(next&&next.start<c.end-0.001)issues.push('overlap');
  if(duration>0&&c.text.replace(/\s/g,'').length/duration>20)issues.push('fast');
  if(c.text.replace(/\s/g,'').length>84)issues.push('long');
  return issues;
};
const normalize=(s:string)=>s.replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
/** CJK-safe split: punctuation first, optional word boundary, and grapheme fallback. */
export function splitText(raw: string, maxChars=36): string[] {
  const text=normalize(raw);
  if(!text)return [];
  const max=Math.max(6, Math.round(maxChars));
  if(Array.from(text).length<=max)return [text];
  const chars=Array.from(text);
  const out:string[]=[];
  let pos=0;
  while(pos<chars.length){
    const remain=chars.slice(pos);
    if(remain.length<=max){out.push(remain.join('').trim());break;}
    const part=remain.slice(0,max);
    let cut=-1;
    // Prefer sentence punctuation within latter 65% of window.
    for(let k=Math.floor(max*.35);k<part.length;k++) if(/[。！？!?；;，,、.]/.test(part[k])) cut=k+1;
    if(cut<0)for(let k=Math.floor(max*.5);k<part.length;k++)if(/\s/.test(part[k]))cut=k+1;
    if(cut<0)cut=max;
    const piece=remain.slice(0,cut).join('').trim();
    if(piece)out.push(piece);
    pos+=cut;
  }
  return out;
}
export function chunksToCues(chunks:Chunk[],maxChars=36,mediaDuration?:number):Cue[]{
  const cues:Cue[]=[];
  chunks.forEach((c,i)=>{
    if(!c.text.trim()||!Number.isFinite(c.timestamp[0]))return;
    const start=Math.max(0,c.timestamp[0]);
    const rawEnd=c.timestamp[1];
    const next=chunks[i+1]?.timestamp[0];
    let end=rawEnd!=null&&rawEnd>start?rawEnd:(next!=null&&next>start?next:start+3);
    if(mediaDuration&&Number.isFinite(mediaDuration))end=Math.min(end,mediaDuration);
    if(end<=start)return;
    const parts=splitText(c.text,maxChars);
    const total=parts.reduce((n,p)=>n+Array.from(p).length,0);
    let cursor=start;
    parts.forEach((piece,j)=>{
      const right=j===parts.length-1?end:cursor+(end-start)*Array.from(piece).length/total;
      cues.push({id:uid(),start:round3(cursor),end:round3(right),text:piece});
      cursor=right;
    });
  });
  return sorted(cues);
}
export function splitCue(cues:Cue[],id:string,position?:number):Cue[]{
  const index=cues.findIndex(c=>c.id===id);
  if(index<0)return cues;
  const c=cues[index];
  const chars=Array.from(c.text);
  if(chars.length<2)return cues;
  const at=round3(position??(c.start+c.end)/2);
  if(!Number.isFinite(at)||at-c.start<.079999||c.end-at<.079999)return cues;
  const middle=Math.max(1,Math.min(chars.length-1,Math.round(chars.length*(at-c.start)/(c.end-c.start))));
  const left=chars.slice(0,middle).join('').trim(),right=chars.slice(middle).join('').trim();
  if(!left||!right)return cues;
  return [...cues.slice(0,index),{...c,end:at,text:left},{id:uid(),start:at,end:c.end,text:right},...cues.slice(index+1)];
}
export function mergeNext(cues:Cue[],id:string):Cue[]{
  const index=cues.findIndex(c=>c.id===id);
  if(index<0||index===cues.length-1)return cues;
  const a=cues[index],b=cues[index+1];
  const glue=/[\u3040-\u30ff\u3400-\u9fff]$/.test(a.text)&&/^[\u3040-\u30ff\u3400-\u9fff]/.test(b.text)?'':' ';
  return [...cues.slice(0,index),{...a,end:Math.max(a.end,b.end),text:a.text+glue+b.text},...cues.slice(index+2)];
}
export function shiftCues(cues:Cue[],offset:number):Cue[]{
  if (!cues.length) return [];
  if(!Number.isFinite(offset))return cues;
  const minimum=cues.reduce((min,c)=>Math.min(min,c.start),Infinity);
  const safe=Math.max(offset,-minimum); // preserve durations, never clamp cue endpoints individually
  return cues.map(c=>({...c,start:round3(c.start+safe),end:round3(c.end+safe)}));
}
