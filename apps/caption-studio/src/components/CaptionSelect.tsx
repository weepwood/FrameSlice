import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown} from 'lucide-react';
type Option<T>={value:T;label:string};
export function CaptionSelect<T extends string|number>({value,options,onChange,label,disabled=false}:{value:T;options:readonly Option<T>[];onChange:(v:T)=>void;label:string;disabled?:boolean}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[index,setIndex]=useState(0),[position,setPosition]=useState({left:0,top:0,width:0,maxHeight:240});
 const search=useRef({text:'',time:0});
 const selected=Math.max(0,options.findIndex(o=>o.value===value));
 const close=()=>setOpen(false);
 function show(){if(!disabled&&options.length){setIndex(selected);setOpen(true)}}
 function choose(i:number){const item=options[i];if(item&&!disabled){onChange(item.value);close();trigger.current?.focus()}}
 useLayoutEffect(()=>{if(!open)return;
  const place=()=>{const t=trigger.current;if(!t)return;const r=t.getBoundingClientRect(),width=Math.min(innerWidth-16,Math.max(r.width,150)),below=innerHeight-r.bottom-12,above=r.top-12;
   if(r.bottom<0||r.top>innerHeight){setOpen(false);return}
   const up=below<Math.min(160,options.length*32+8)&&above>below,maxHeight=Math.max(40,Math.min(280,up?above:below)),height=Math.min(maxHeight,options.length*32+8);
   setPosition({left:Math.max(8,Math.min(r.left,innerWidth-width-8)),top:up?Math.max(8,r.top-height-5):r.bottom+5,width,maxHeight})};
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)}
 },[open,options.length]);
 useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{const path=e.composedPath();if(!path.includes(trigger.current!)&&!path.includes(menu.current!))setOpen(false)};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true)},[open]);
 useEffect(()=>{if(disabled)setOpen(false)},[disabled]);
 useEffect(()=>{if(open)menu.current?.querySelector('[data-highlighted=true]')?.scrollIntoView({block:'nearest'})},[index,open]);
 const root=trigger.current?.getRootNode();const portal=root instanceof ShadowRoot?root:document.body;
 return <><button type="button" className="caption-select-trigger" ref={trigger} role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined} aria-activedescendant={open?id+'-'+index:undefined} disabled={disabled} onClick={()=>open?close():show()} onBlur={close} onKeyDown={e=>{
  if(e.key==='Tab'){close();return}
  if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close();return}
  if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(e.key)){e.preventDefault();if(!open){show();return}if(e.key==='Enter'||e.key===' '){choose(index);return}setIndex(i=>e.key==='Home'?0:e.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,i+(e.key==='ArrowDown'?1:-1))));return}
  if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();const now=Date.now(),q=(now-search.current.time>700?'':search.current.text)+e.key.toLocaleLowerCase();search.current={text:q,time:now};const i=options.findIndex(o=>o.label.toLocaleLowerCase().startsWith(q));if(i>=0){if(!open)show();setIndex(i)}}
 }}><span>{options[selected]?.label??String(value)}</span><ChevronDown size={14} aria-hidden="true"/></button>
 {open&&createPortal(<div ref={menu} id={id} role="listbox" aria-label={label} className="caption-select-popup" style={position}>{options.map((o,i)=><div key={o.value} id={id+'-'+i} role="option" aria-selected={o.value===value} data-highlighted={i===index} onPointerMove={()=>setIndex(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(i)}><span>{o.label}</span>{o.value===value&&<Check size={13}/>}</div>)}</div>,portal)}</>
}
