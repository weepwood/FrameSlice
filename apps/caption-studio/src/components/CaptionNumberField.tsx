import {NumberField} from '@base-ui/react/number-field';
import {Minus,Plus} from 'lucide-react';
type Props={label:string;value:number|null;onChange:(v:number|null)=>void;min?:number;max?:number;step?:number;disabled?:boolean;compact?:boolean};
export function CaptionNumberField({label,value,onChange,min,max,step=1,disabled,compact}:Props){
 return <NumberField.Root className={'fs-number-field'+(compact?' compact':'')} value={value} min={min} max={max} step={step} disabled={disabled} format={{useGrouping:false,maximumFractionDigits:6}} onValueChange={onChange} allowWheelScrub={false} snapOnStep={false}>
  <NumberField.Group className="fs-number-group">
   <NumberField.Decrement className="fs-number-step" aria-label={label+' 减少'}><Minus size={12}/></NumberField.Decrement>
   <NumberField.Input className="fs-number-value" role="spinbutton" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value??undefined}/>
   <NumberField.Increment className="fs-number-step" aria-label={label+' 增加'}><Plus size={12}/></NumberField.Increment>
  </NumberField.Group>
 </NumberField.Root>
}
