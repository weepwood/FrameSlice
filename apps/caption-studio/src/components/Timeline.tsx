import {useEffect,useMemo,useRef,useState} from 'react';
import {Minus,Plus,StepForward} from 'lucide-react';
import {CaptionCheckbox} from './CaptionCheckbox';
import {shortTime,type Cue} from '../lib/captions';
import type {buildCueIndex} from '../lib/cue-index';
interface Props {
  intervalIndex:ReturnType<typeof buildCueIndex>;
  duration:number;cues:Cue[];peaks:number[];time:number;selectedId:string|null;
  onSeek:(v:number)=>void;onSelect:(id:string)=>void;
  onUpdate:(id:string,patch:Partial<Cue>)=>void;
}
type Drag={id:string;side:'start'|'end';value:number};
export function Timeline({intervalIndex,duration,cues,peaks,time,selectedId,onSeek,onSelect,onUpdate}:Props){
  const [span,setSpan]=useState(60);
  const [viewStart,setViewStart]=useState(0);
  const [follow,setFollow]=useState(true);
  const [drag,setDrag]=useState<Drag|null>(null);
  const liveDrag=useRef<Drag|null>(null);
  const scrub=useRef<number|null>(null);
  const canvas=useRef<HTMLCanvasElement>(null);
  const track=useRef<HTMLDivElement>(null);
  const visible=Math.max(1,Math.min(span,Math.max(1,duration)));
  const start=Math.max(0,Math.min(viewStart,Math.max(0,duration-visible)));
  function zoom(next:number,anchor=time){
    const width=Math.max(1,Math.min(600,next)),nextVisible=Math.max(1,Math.min(width,Math.max(1,duration)));
    const fraction=Math.max(0,Math.min(1,(anchor-start)/visible));
    setViewStart(Math.max(0,Math.min(Math.max(0,duration-nextVisible),anchor-fraction*nextVisible)));
    setSpan(width);
  }
  useEffect(()=>{const node=track.current;if(!node)return;const wheel=(e:WheelEvent)=>{
    if(!(e.ctrlKey||e.metaKey||e.shiftKey))return;
    e.preventDefault();setFollow(false);
    if(e.shiftKey&&!e.ctrlKey&&!e.metaKey){setViewStart(Math.max(0,Math.min(Math.max(0,duration-visible),start+(e.deltaX||e.deltaY)*visible/500)));return}
    zoom(visible*(e.deltaY<0?.8:1.25),point(e));
  };node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel)},[start,visible,duration,time]);
  useEffect(()=>{
    if(follow&&time>=start+visible-.3&&duration>visible)setViewStart(Math.min(Math.max(0,duration-visible),Math.floor(time/visible)*visible));
    if(follow&&time<start)setViewStart(Math.max(0,Math.floor(time/visible)*visible));
  },[time,follow,start,visible,duration]);
  useEffect(()=>{
    const node=canvas.current;if(!node)return;
    const paint=()=>{
      const width=Math.max(1,node.clientWidth),height=Math.max(1,node.clientHeight);
      const dpr=Math.min(2,window.devicePixelRatio||1);
      node.width=Math.floor(width*dpr);node.height=Math.floor(height*dpr);
      const ctx=node.getContext('2d');if(!ctx)return;
      ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);
      const tokens=getComputedStyle(node);
      ctx.fillStyle=tokens.getPropertyValue('--fs-raised').trim()||'#e1e6e9';ctx.fillRect(0,0,width,height);
      const center=height/2;
      ctx.fillStyle=tokens.getPropertyValue('--fs-wave').trim()||'#6d8398';
      for(let x=0;x<width;x+=2){
        const a=start+x/width*visible,b=start+(x+2)/width*visible;
        const from=Math.floor(a/Math.max(duration,0.01)*peaks.length);
        const to=Math.max(from+1,Math.ceil(b/Math.max(duration,0.01)*peaks.length));
        let peak=0;
        for(let i=Math.max(0,from);i<Math.min(to,peaks.length);i++)peak=Math.max(peak,peaks[i]);
        if(!peaks.length)continue;
        const h=Math.max(1,peak*(height*.42));
        ctx.fillRect(x,center-h,1.5,2*h);
      }
    };
    const ro=new ResizeObserver(paint);ro.observe(node);
    const theme=new MutationObserver(paint);theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-fs-theme']});
    const scheme=matchMedia('(prefers-color-scheme: dark)');scheme.addEventListener('change',paint);paint();return()=>{ro.disconnect();theme.disconnect();scheme.removeEventListener('change',paint)};
  },[peaks,visible,start,duration]);
  const ticks=useMemo(()=>{
    const step=visible<=5?1:visible<=15?2:visible<=30?5:visible<=90?10:visible<=240?30:60;
    const values:number[]=[];
    for(let v=Math.ceil(start/step)*step;v<start+visible;v+=step)values.push(v);
    return values;
  },[visible,start]);
  const point=(e:{clientX:number})=>{
    const r=track.current?.getBoundingClientRect();
    if(!r)return 0;
    return Math.min(duration,Math.max(0,start+(e.clientX-r.left)/r.width*visible));
  };
  const dragStart=(e:React.PointerEvent,id:string,side:'start'|'end')=>{
    if(e.button!==0||liveDrag.current)return;e.preventDefault();e.stopPropagation();onSelect(id);setFollow(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    const cue=cues.find(c=>c.id===id);
    if(cue){const next={id,side,value:cue[side]};liveDrag.current=next;setDrag(next)};
  };
  const move=(e:React.PointerEvent)=>{
    if(scrub.current===e.pointerId){onSeek(point(e));return}
    const current=liveDrag.current;if(!current)return;
    const cue=cues.find(c=>c.id===current.id);if(!cue)return;
    const raw=point(e),value=Math.round(Math.max(current.side==='start'?0:cue.start+.08,Math.min(current.side==='start'?Math.max(0,cue.end-.08):Math.max(duration,cue.end),raw))*1000)/1000;
    const next={...current,value};liveDrag.current=next;setDrag(next);
  };
  const endDrag=(e:React.PointerEvent)=>{
    if(scrub.current===e.pointerId){onSeek(point(e));scrub.current=null;return}
    if(!liveDrag.current)return;
    move(e);const current=liveDrag.current;liveDrag.current=null;setDrag(null);
    if(current)onUpdate(current.id,{[current.side]:current.value});
  };
  const cancelDrag=()=>{liveDrag.current=null;scrub.current=null;setDrag(null)};
  const displayCues=useMemo(()=>intervalIndex.visible(start,start+visible),[intervalIndex,start,visible]);
  return <section className="timeline surface">
    <div className="section-title timeline-top">
      <div><strong>时间轴</strong><span className="subtle">{shortTime(time)} / {shortTime(duration)}</span></div>
      <div className="timeline-actions">
        <div className="inline-checkbox"><CaptionCheckbox label="跟随播放" checked={follow} onChange={setFollow}/><span onClick={()=>setFollow(v=>!v)}>跟随播放</span></div>
        <button className="icon-btn" aria-label="缩小时间轴" disabled={visible>=Math.min(600,duration)} onClick={()=>zoom(visible*2)}><Minus size={15}/></button>
        <span className="zoom-label">{visible >=60?`${Number((visible/60).toFixed(1))} min`:`${Number(visible.toFixed(2))}s`}</span>
        <button className="icon-btn" aria-label="放大时间轴" disabled={visible<=1} onClick={()=>zoom(visible/2)}><Plus size={15}/></button>
        <button className="icon-btn" aria-label="定位到播放位置" title="定位到播放位置" onClick={()=>setViewStart(Math.max(0,time-visible*.3))}><StepForward size={15}/></button>
      </div>
    </div>
    <div className="timeline-ruler">
      {ticks.map(t=><span className={t-start<visible*.04?'tick-start':start+visible-t<visible*.04?'tick-end':undefined} key={t} style={{left:`${(t-start)/visible*100}%`}}>{shortTime(t)}</span>)}
    </div>
    <div className="timeline-lanes"><div className="timeline-lane-labels" aria-hidden="true"><span>音频</span><span>字幕</span></div><div ref={track} className="timeline-track" onPointerDown={e=>{if(e.button!==0||(e.target as HTMLElement).closest('.cue-bar'))return;e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);scrub.current=e.pointerId;setFollow(false);onSeek(point(e))}} onPointerMove={move} onPointerUp={endDrag} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} tabIndex={0} role="group" aria-label="字幕波形时间轴" onKeyDown={e=>{if(e.target!==e.currentTarget||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();onSeek(e.key==='Home'?0:e.key==='End'?duration:time+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:.1))}}>
      <canvas ref={canvas} className="waveform" role="img" aria-label={peaks.length?"声音波形":"尚未生成波形"}/>{!peaks.length&&<span className="waveform-empty">无音频波形</span>}
      <div className="cue-track">
        {displayCues.map(c=>{
          const s=drag?.id===c.id&&drag.side==='start'?drag.value:c.start;
          const end=drag?.id===c.id&&drag.side==='end'?drag.value:c.end;
          const left=Math.max(0,(s-start)/visible*100),right=Math.min(100,(end-start)/visible*100);
          return <div key={c.id} className={`cue-bar ${selectedId===c.id?'selected':''}`} style={{left:`${left}%`,width:`${Math.max(.25,right-left)}%`}} onClick={e=>{e.stopPropagation();if((e.target as HTMLElement).closest('.resize-handle'))return;onSelect(c.id);onSeek(c.start)}} title={c.text}>
            <span className="resize-handle left" role="slider" aria-label="调整字幕起点" aria-valuemin={0} aria-valuemax={Math.max(0,c.end-.08)} aria-valuenow={s} aria-valuetext={shortTime(s)} tabIndex={0} onPointerDown={e=>dragStart(e,c.id,'start')} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onUpdate(c.id,{start:Math.min(c.end-.08,Math.max(0,c.start+(e.key==='ArrowRight'?.1:-.1)))})}}}/>
            <span className="cue-bar-label">{c.text}</span>
            <span className="resize-handle right" role="slider" aria-label="调整字幕终点" aria-valuemin={c.start+.08} aria-valuemax={Math.max(c.start+.08,duration,c.end)} aria-valuenow={end} aria-valuetext={shortTime(end)} tabIndex={0} onPointerDown={e=>dragStart(e,c.id,'end')} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onUpdate(c.id,{end:Math.min(Math.max(duration,c.end,c.start+.08),Math.max(c.start+.08,c.end+(e.key==='ArrowRight'?.1:-.1)))})}}}/>
          </div>;
        })}
      </div>
      {time>=start&&time<=start+visible&&<div className="playhead" style={{left:`${(time-start)/visible*100}%`}}/>}
    </div></div>
    <div className="timeline-scroll"><input type="range" aria-label="移动时间轴视窗" min={0} max={Math.max(0,duration-visible)} step={.1} value={start} disabled={duration<=visible} onChange={e=>{setViewStart(Number(e.target.value));setFollow(false)}}/></div>

  </section>;
}
