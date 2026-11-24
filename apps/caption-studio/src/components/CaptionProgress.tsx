import {Progress} from '@base-ui/react/progress';
export function CaptionProgress({value,max=100,label}:{value:number|null;max?:number;label:string}){
 const limit=Number.isFinite(max)&&max>0?max:100;
 const current=value!==null&&Number.isFinite(value)?Math.min(limit,Math.max(0,value)):null;
 return <Progress.Root className="caption-progress" value={current} max={limit} aria-label={label}><Progress.Track className="caption-progress-track"><Progress.Indicator className="caption-progress-fill"/></Progress.Track></Progress.Root>
}
