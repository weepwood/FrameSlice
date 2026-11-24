import {useEffect,useMemo,useRef,useState} from 'react';
import {Minus,Plus,StepForward} from 'lucide-react';
import {shortTime,type Cue} from '../lib/captions';
interface Props {
  duration:number;cues:Cue[];peaks:number[];time:number;selectedId:string|null;
  onSeek:(v:number)=>void;onSelect:(id:string)=>void;
  onUpdate:(id:string,patch:Partial<Cue>)=>void;
}
type Drag={id:string;side:'start'|'end';value:number};
export function Timeline({duration,cues,peaks,time,selectedId,onSeek,onSelect,onUpdate}:Props){
  const [span,setSpan]=useState(60);
  const [viewStart,setViewStart]=useState(0);
  const [follow,setFollow]=useState(true);
  const [drag,setDrag]=useState<Drag|null>(null);
  const canvas=useRef<HTMLCanvasElement>(null);
  const track=useRef<HTMLDivElement>(null);
  const visible=Math.max(1,Math.min(span,Math.max(1,duration)));
  const start=Math.min(viewStart,Math.max(0,duration-visible));
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
      ctx.fillStyle=tokens.getPropertyValue('--fs-wave-bg').trim()||'#e1e6e9';ctx.fillRect(0,0,width,height);
      const center=height/2;
      ctx.fillStyle=tokens.getPropertyValue('--fs-wave').trim()||'#6d8398';
      for(let x=0;x<width;x+=2){
        const a=start+x/width*visible,b=start+(x+2)/width*visible;
        const from=Math.floor(a/Math.max(duration,0.01)*peaks.length);
        const to=Math.max(from+1,Math.ceil(b/Math.max(duration,0.01)*peaks.length));
        let peak=0;
        for(let i=Math.max(0,from);i<Math.min(to,peaks.length);i++)peak=Math.max(peak,peaks[i]);
        if(!peaks.length)peak=.03;
        const h=Math.max(1,peak*(height*.42));
        ctx.fillRect(x,center-h,1.5,2*h);
      }
    };
    const ro=new ResizeObserver(paint);ro.observe(node);
    const theme=new MutationObserver(paint);theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-fs-theme']});
    const scheme=matchMedia('(prefers-color-scheme: dark)');scheme.addEventListener('change',paint);paint();return()=>{ro.disconnect();theme.disconnect();scheme.removeEventListener('change',paint)};
  },[peaks,visible,start,duration]);
  const ticks=useMemo(()=>{
    const step=visible<=30?5:visible<=90?10:visible<=240?30:60;
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
    e.stopPropagation();onSelect(id);setFollow(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    const cue=cues.find(c=>c.id===id);
    if(cue)setDrag({id,side,value:cue[side]});
  };
  const move=(e:React.PointerEvent)=>{
    if(!drag)return;
    const cue=cues.find(c=>c.id===drag.id);if(!cue)return;
    const raw=point(e),value=Math.round(Math.max(drag.side==='start'?0:cue.start+.08,Math.min(drag.side==='start'?cue.end-.08:duration,raw))*1000)/1000;
    setDrag({...drag,value});
  };
  const endDrag=()=>{if(drag)onUpdate(drag.id,{[drag.side]:drag.value});setDrag(null)};
  const displayCues=cues.filter(c=>c.end>=start&&c.start<=start+visible);
  return <section className="timeline surface">
    <div className="section-title timeline-top">
      <div><strong>时间轴</strong><span className="subtle">{shortTime(time)} / {shortTime(duration)}</span></div>
      <div className="timeline-actions">
        <label className="inline-checkbox"><input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)}/> 跟随播放</label>
        <button className="icon-btn" aria-label="缩小时间轴" onClick={()=>setSpan(Math.min(600,span*2))}><Minus size={15}/></button>
        <span className="zoom-label">{visible >=60?`${Math.round(visible/60)} min`:`${visible}s`}</span>
        <button className="icon-btn" aria-label="放大时间轴" onClick={()=>setSpan(Math.max(10,span/2))}><Plus size={15}/></button>
        <button className="icon-btn" title="定位到播放位置" onClick={()=>setViewStart(Math.max(0,time-visible*.3))}><StepForward size={15}/></button>
      </div>
    </div>
    <div className="timeline-ruler">
      {ticks.map(t=><span key={t} style={{left:`${(t-start)/visible*100}%`}}>{shortTime(t)}</span>)}
    </div>
    <div ref={track} className="timeline-track" onPointerMove={move} onPointerUp={endDrag} onPointerCancel={()=>setDrag(null)} onClick={e=>{if(!(e.target as HTMLElement).closest('.cue-bar'))onSeek(point(e))}}>
      <canvas ref={canvas} className="waveform" aria-label="声音波形"/>
      <div className="cue-track">
        {displayCues.map(c=>{
          const s=drag?.id===c.id&&drag.side==='start'?drag.value:c.start;
          const end=drag?.id===c.id&&drag.side==='end'?drag.value:c.end;
          const left=Math.max(0,(s-start)/visible*100),right=Math.min(100,(end-start)/visible*100);
          return <div key={c.id} className={`cue-bar ${selectedId===c.id?'selected':''}`} style={{left:`${left}%`,width:`${Math.max(.25,right-left)}%`}} onClick={e=>{e.stopPropagation();onSelect(c.id);onSeek(c.start)}} title={c.text}>
            <span className="resize-handle left" role="slider" aria-label="调整字幕起点" tabIndex={0} onPointerDown={e=>dragStart(e,c.id,'start')} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onUpdate(c.id,{start:Math.min(c.end-.08,Math.max(0,c.start+(e.key==='ArrowRight'?.1:-.1)))})}}}/>
            <span className="cue-bar-label">{c.text}</span>
            <span className="resize-handle right" role="slider" aria-label="调整字幕终点" tabIndex={0} onPointerDown={e=>dragStart(e,c.id,'end')} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();onUpdate(c.id,{end:Math.max(c.start+.08,c.end+(e.key==='ArrowRight'?.1:-.1))})}}}/>
          </div>;
        })}
      </div>
      {time>=start&&time<=start+visible&&<div className="playhead" style={{left:`${(time-start)/visible*100}%`}}/>}
    </div>
    <div className="timeline-scroll"><input type="range" aria-label="移动时间轴视窗" min={0} max={Math.max(0,duration-visible)} step={.1} value={start} disabled={duration<=visible} onChange={e=>{setViewStart(Number(e.target.value));setFollow(false)}}/></div>
    <div className="timeline-foot">拖动字幕块两端可调整时间；点击波形跳转。{peaks.length?'已显示音频波形':'转录后显示音频波形'}</div>
  </section>;
}
