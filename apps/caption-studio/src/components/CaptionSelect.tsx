import {useLayoutEffect,useRef,useState} from 'react';
import * as Select from '@radix-ui/react-select';
import {Check,ChevronDown} from 'lucide-react';
type Option<T>={value:T;label:string};
export function CaptionSelect<T extends string|number>({value,options,onChange,label,disabled=false}:{value:T;options:readonly Option<T>[];onChange:(v:T)=>void;label:string;disabled?:boolean}){
 const trigger=useRef<HTMLButtonElement>(null);
 const [container,setContainer]=useState<HTMLElement|null>(null);
 useLayoutEffect(()=>{const root=trigger.current?.getRootNode();setContainer(root instanceof ShadowRoot?root.querySelector<HTMLElement>('#root'):document.body)},[]);
 return <Select.Root value={String(value)} disabled={disabled} onValueChange={v=>{const item=options.find(o=>String(o.value)===v);if(item)onChange(item.value)}}>
  <Select.Trigger ref={trigger} className="caption-select-trigger" aria-label={label}><Select.Value/><Select.Icon asChild><ChevronDown size={14} aria-hidden="true"/></Select.Icon></Select.Trigger>
  {container&&<Select.Portal container={container}><Select.Content position="popper" sideOffset={5} collisionPadding={8} className="caption-select-popup"><Select.Viewport className="caption-select-viewport">{options.map(o=><Select.Item key={o.value} value={String(o.value)} className="caption-select-item"><Select.ItemText>{o.label}</Select.ItemText><Select.ItemIndicator><Check size={13}/></Select.ItemIndicator></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal>}
 </Select.Root>
}
