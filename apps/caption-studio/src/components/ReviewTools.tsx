import {useMemo,useState} from 'react';
import {ArrowDownUp,CheckCheck,ChevronDown,ChevronUp,LocateFixed,Replace,ScanText,ShieldAlert} from 'lucide-react';
import {cleanCaptionText,reviewCues,repairOverlaps,replaceCaptionText} from '../lib/review';
import type {Cue} from '../lib/captions';

interface Props {
  cues:Cue[];
  review:ReturnType<typeof reviewCues>;
  visibleCues:Cue[];
  query:string;
  onlyIssues:boolean;
  followPlayback:boolean;
  selectedId:string|null;
  onToggleIssues:(next:boolean)=>void;
  onFollowPlayback:(next:boolean)=>void;
  onNavigate:(id:string)=>void;
  onChange:(update:(prev:Cue[])=>Cue[])=>void;
}

export function ReviewTools({cues,review,visibleCues,query,onlyIssues,followPlayback,selectedId,onToggleIssues,onFollowPlayback,onNavigate,onChange}:Props){
  const [replaceOpen,setReplaceOpen]=useState(false);
  const [replacement,setReplacement]=useState('');
  const [notice,setNotice]=useState('');
  const problems=useMemo(()=>visibleCues.filter(c=>review.byId.has(c.id)).map(c=>c.id),[visibleCues,review]);
  const term=query.trim();
  const replacements=useMemo(()=>term?cues.filter(c=>c.text.toLocaleLowerCase().includes(term.toLocaleLowerCase())).length:0,[cues,term]);
  const goNext=()=>{
    if(!problems.length)return;
    const index=problems.indexOf(selectedId||'');
    onNavigate(problems[(index+1)%problems.length]);
  };
  const cleanup=()=>{
    const modified=cues.filter(c=>c.text!==cleanCaptionText(c.text)).length;
    if(!modified){setNotice('字幕文本已经整洁，无需处理');return;}
    onChange(list=>list.map(c=>({...c,text:cleanCaptionText(c.text)})));
    setNotice(`已整理 ${modified} 条字幕，可通过撤销恢复`);
  };
  const fixTime=()=>{
    const fixed=repairOverlaps(cues).filter((c,i)=>c.end!==cues[i].end).length;
    if(!fixed){setNotice('没有可以安全修复的重叠时间');return;}
    onChange(repairOverlaps);
    setNotice(`已修复 ${fixed} 处时间重叠，可通过撤销恢复`);
  };
  const replaceAll=()=>{
    if(!query.trim()||!replacements)return;
    onChange(list=>list.map(c=>({...c,text:replaceCaptionText(c.text,term,replacement)})));
    setNotice(`已替换 ${replacements} 条字幕，可通过撤销恢复`);
  };
  return <div className="review-toolbox">
    <div className="review-controls">
      <button className={`review-chip ${onlyIssues?'active':''}`} aria-pressed={onlyIssues} onClick={()=>onToggleIssues(!onlyIssues)} title="仅显示需要校对的字幕"><ShieldAlert size={14}/>问题筛选 <span>{review.affected}</span></button>
      <button className="review-chip" disabled={!problems.length} onClick={goNext} title="定位下一条存在问题的字幕"><LocateFixed size={14}/>下一项</button>
      <button className={`review-chip ${followPlayback?'active':''}`} aria-pressed={followPlayback} onClick={()=>onFollowPlayback(!followPlayback)} title="播放时自动滚动字幕列表"><ScanText size={14}/>跟随</button>
      <button className={`review-chip ${replaceOpen?'active':''}`} aria-expanded={replaceOpen} disabled={!cues.length} onClick={()=>setReplaceOpen(v=>!v)} title="批量查找和替换字幕"><Replace size={14}/>替换 {replaceOpen?<ChevronUp size={12}/>:<ChevronDown size={12}/>}</button>
    </div>
    {replaceOpen&&<div className="replace-panel">
      <div className="replace-panel-heading"><span>查找并替换</span><small>使用上方搜索词，按原样匹配文本</small></div>
      <div className="replace-input-row"><input value={replacement} maxLength={200} onChange={e=>setReplacement(e.target.value)} aria-label="替换为" placeholder="替换为…"/><button className="btn small primary" disabled={!query||!replacements} onClick={replaceAll}>替换 {replacements} 条</button></div>
    </div>}
    <div className="review-batch-actions"><span>批量处理</span><button onClick={cleanup} disabled={!cues.length} title="清理重复空格与标点前空格，不更改说话内容"><CheckCheck size={14}/>整理文本</button><button onClick={fixTime} disabled={!cues.length} title="只修复能保持最小时长的重叠字幕"><ArrowDownUp size={14}/>修复重叠</button></div>
    {notice&&<div className="review-notice" role="status">{notice}<button aria-label="关闭提示" onClick={()=>setNotice('')}>×</button></div>}
  </div>;
}
