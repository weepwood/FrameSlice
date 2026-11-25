export function CaptionProgress({value,max=100,label}:{value:number|null;max?:number;label:string}){
 const limit=Number.isFinite(max)&&max>0?max:100;
 const current=value!==null&&Number.isFinite(value)?Math.min(limit,Math.max(0,value)):null;
 return <fluent-progress-bar className="caption-progress fs-workbench-progress" role="progressbar" thickness="large" min={0} max={limit} value={current??undefined} aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={current??undefined} aria-valuetext={current===null?'进度未知':Math.round(current/limit*100)+'%'}/>;
}
