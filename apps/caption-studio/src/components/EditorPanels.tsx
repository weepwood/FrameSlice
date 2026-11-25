import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Group,Panel,Separator,type Layout} from 'react-resizable-panels';

const KEY='frameslice.caption.layout.v1';
const defaultLayout={viewer:70,inspector:30};
function loadLayout():Layout{
 try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(v&&Number.isFinite(v.viewer)&&Number.isFinite(v.inspector)&&Math.abs(v.viewer+v.inspector-100)<.01&&v.inspector>=20&&v.inspector<=50)return {viewer:v.viewer,inspector:v.inspector}}catch{}
 return defaultLayout;
}
export function EditorPanels({viewer,inspector}:{viewer:ReactNode;inspector:ReactNode}){
 const root=useRef<HTMLDivElement>(null);
 const [stacked,setStacked]=useState(false);
 const [initial]=useState(loadLayout);
 useLayoutEffect(()=>{
  const el=root.current;if(!el)return;
  const update=()=>setStacked(el.clientWidth<760);
  update();const observer=new ResizeObserver(update);observer.observe(el);return()=>observer.disconnect();
 },[]);
 return <div ref={root} className="caption-editor-layout" data-stacked={stacked}>
  <Group id="caption-workbench" className="caption-panel-group" orientation={stacked?'vertical':'horizontal'} disabled={stacked} disableCursor defaultLayout={initial} onLayoutChanged={layout=>{if(!stacked&&layout.inspector>=20&&layout.inspector<=50)try{localStorage.setItem(KEY,JSON.stringify(layout))}catch{}}}>
   <Panel id="viewer" defaultSize="70%" minSize={stacked?"0%":"50%"} className="caption-panel-inner">{viewer}</Panel>
   <Separator id="caption-inspector-divider" className="caption-panel-divider" aria-label="调整字幕检查器宽度" disabled={stacked}/>
   <Panel id="inspector" defaultSize="30%" minSize={stacked?"0%":"300px"} maxSize={stacked?"100%":"50%"} className="caption-panel-inner">{inspector}</Panel>
  </Group>
 </div>;
}
