import {useLayoutEffect,useRef,useState} from 'react';
import {Select} from '@base-ui/react/select';
import {Check,ChevronDown} from 'lucide-react';
type Option<T>={value:T;label:string};
export function CaptionSelect<T extends string|number>({value,options,onChange,label,disabled=false}:{value:T;options:readonly Option<T>[];onChange:(v:T)=>void;label:string;disabled?:boolean}){
 const trigger=useRef<HTMLButtonElement>(null);
 const [container,setContainer]=useState<HTMLElement|ShadowRoot|null>(null);
 useLayoutEffect(()=>{const root=trigger.current?.getRootNode();setContainer(root instanceof ShadowRoot?root:document.body)},[]);
 return <Select.Root items={options} value={value} disabled={disabled} onValueChange={v=>{if(v!==null)onChange(v)}}>
  <Select.Trigger ref={trigger} className="caption-select-trigger" aria-label={label}><Select.Value/><Select.Icon><ChevronDown size={14} aria-hidden="true"/></Select.Icon></Select.Trigger>
  {container&&<Select.Portal container={container}><Select.Positioner className="caption-select-positioner" alignItemWithTrigger={false} align="start" sideOffset={5} collisionPadding={8}><Select.Popup className="caption-select-popup"><Select.List className="caption-select-viewport">{options.map(o=><Select.Item key={o.value} value={o.value} className="caption-select-item"><Select.ItemText>{o.label}</Select.ItemText><Select.ItemIndicator><Check size={13}/></Select.ItemIndicator></Select.Item>)}</Select.List></Select.Popup></Select.Positioner></Select.Portal>}
 </Select.Root>
}
