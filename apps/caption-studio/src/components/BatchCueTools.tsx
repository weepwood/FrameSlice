import {CaptionNumberField} from './CaptionNumberField';
import {useState} from 'react';
import {Check,CheckCheck,ListChecks,Trash2,X} from 'lucide-react';
import {Checkbox} from '@base-ui/react/checkbox';
import {cleanSelected,shiftSelected,scaleSelected} from '../lib/batch-edit';
import type {Cue} from '../lib/captions';
type Props={cues:Cue[];page:Cue[];shown:Cue[];selected:ReadonlySet<string>;onSelect:(ids:Set<string>)=>void;onChange:(next:Cue[])=>void;onClose:()=>void};
export function BatchCueTools({cues,page,shown,selected,onSelect,onChange,onClose}:Props){
  const [offset,setOffset]=useState('0.5');
  const [notice,setNotice]=useState('');
  const [scale,setScale]=useState('100');
  const count=selected.size,allPage=page.length>0&&page.every(c=>selected.has(c.id)),somePage=page.some(c=>selected.has(c.id));
  function togglePage(checked:boolean){const next=new Set(selected);for(const c of page){if(checked)next.add(c.id);else next.delete(c.id)}onSelect(next)}
  function move(direction:number){
    const value=Number(offset);
    if(!offset.trim()||!Number.isFinite(value)||value<=0){setNotice('请输入大于零的有效偏移秒数');return}
    try{const result=shiftSelected(cues,selected,direction*value);onChange(result);setNotice('已调整选中字幕，可撤销')}catch(e){setNotice(e instanceof Error?e.message:String(e))}
  }
  function remove(){
    if(!count||!window.confirm('删除选中的 '+count+' 条字幕？可以撤销。'))return;
    onChange(cues.filter(c=>!selected.has(c.id)));onSelect(new Set());setNotice('已删除选中字幕，可撤销');
  }
  return <section className="cue-batch-panel" aria-label="多选字幕操作">
    <div className="cue-batch-heading"><strong><ListChecks size={15}/>多选 · {count} 条</strong><button className="icon-btn" aria-label="退出多选" onClick={onClose}><X size={15}/></button></div>
    <div className="cue-batch-actions">
      <label className="cue-batch-check"><Checkbox.Root className="caption-checkbox" aria-label="选择当前页字幕" checked={allPage} indeterminate={!allPage&&somePage} disabled={!page.length} onCheckedChange={checked=>togglePage(checked===true)}><Checkbox.Indicator><Check size={12}/></Checkbox.Indicator></Checkbox.Root><span>当前页</span></label>
      <button className="review-chip" disabled={!shown.length} onClick={()=>onSelect(new Set(shown.map(c=>c.id)))}>选择全部匹配 ({shown.length})</button>
      <button className="review-chip" disabled={!count} onClick={()=>onSelect(new Set())}>清空选择</button>
    </div>
    <div className="cue-batch-actions"><label className="cue-batch-offset"><span>偏移秒数</span><CaptionNumberField label="选中字幕偏移秒数" min={.001} step={.1} compact value={offset===""?null:Number(offset)} onChange={v=>setOffset(v===null?"":String(v))}/></label><button className="review-chip" disabled={!count} onClick={()=>move(-1)}>提前选中</button><button className="review-chip" disabled={!count} onClick={()=>move(1)}>延后选中</button></div>
    <details className="cue-scale-tools"><summary>时间比例校准</summary><div className="cue-batch-actions"><label className="cue-batch-offset"><span>比例 %</span><CaptionNumberField label="选中字幕时间比例" min={.1} max={10000} step={.1} compact value={scale===""?null:Number(scale)} onChange={v=>setScale(v===null?"":String(v))}/></label><button className="review-chip" disabled={!count} onClick={()=>{try{onChange(scaleSelected(cues,selected,Number(scale)/100));setNotice('已按最早选中起点校准，可撤销')}catch(e){setNotice(e instanceof Error?e.message:String(e))}}}>应用比例</button></div><small>100% 不变；以最早选中字幕起点为锚点，调整间隔与持续时间。</small></details>
    <div className="cue-batch-actions"><button className="review-chip" disabled={!count} onClick={()=>{onChange(cleanSelected(cues,selected));setNotice('已整理选中文本，可撤销')}}><CheckCheck size={14}/>整理选中</button><button className="review-chip cue-batch-danger" disabled={!count} onClick={remove}><Trash2 size={14}/>删除选中</button></div>
    {notice&&<div className="cue-batch-notice" role="status">{notice}</div>}
  </section>;
}
