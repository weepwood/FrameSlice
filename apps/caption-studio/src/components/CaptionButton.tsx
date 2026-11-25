import type {ReactNode} from 'react';
export function CaptionButton({primary=false,full=false,disabled=false,onClick,children}:{primary?:boolean;full?:boolean;disabled?:boolean;onClick:()=>void;children:ReactNode}){
 return <fluent-button role="button" type="button" appearance={primary?'primary':'outline'} size="small" className={'fs-caption-fluent-button'+(full?' full':'')} disabled={disabled} onClick={()=>{if(!disabled)onClick()}}>{children}</fluent-button>;
}
