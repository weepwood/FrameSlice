import {useLayoutEffect,useRef} from 'react';
type CheckboxElement=HTMLElement&{checked:boolean;indeterminate:boolean;disabled:boolean};
export function CaptionCheckbox({id,label,checked,indeterminate=false,disabled=false,onChange}:{id?:string;label:string;checked:boolean;indeterminate?:boolean;disabled?:boolean;onChange:(checked:boolean)=>void}){
 const ref=useRef<CheckboxElement>(null);
 useLayoutEffect(()=>{
  const el=ref.current;if(!el)return;
  el.checked=checked;el.indeterminate=indeterminate;el.disabled=disabled;
 },[checked,indeterminate,disabled]);
 return <fluent-checkbox ref={ref} id={id} className="fs-fluent-caption-checkbox" role="checkbox" aria-label={label} aria-checked={indeterminate?'mixed':checked?'true':'false'} disabled={disabled} onChange={e=>onChange((e.currentTarget as CheckboxElement).checked)}/>;
}
