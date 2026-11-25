import {useMemo,useState,useLayoutEffect,useRef} from 'react';
import {ArrowDownUp,CheckCheck,LocateFixed,Replace,ScanText,ShieldAlert,ListChecks,Ellipsis} from 'lucide-react';
import {cleanCaptionText,reviewCues,repairOverlaps,replaceCaptionText} from '../lib/review';
import type {Cue} from '../lib/captions';
import {Toolbar} from '@base-ui/react/toolbar';
import {Menu} from '@base-ui/react/menu';

interface Props {
  cues:Cue[];
  review:ReturnType<typeof reviewCues>;
  visibleCues:Cue[];
  query:string;
  onlyIssues:boolean;
  followPlayback:boolean;
  selectedId:string|null;
  batchMode:boolean;
  onOpenBatch:()=>void;
  onToggleIssues:(next:boolean)=>void;
  onFollowPlayback:(next:boolean)=>void;
  onNavigate:(id:string)=>void;
  onChange:(update:(prev:Cue[])=>Cue[])=>void;
}

export function ReviewTools({cues,review,visibleCues,query,onlyIssues,followPlayback,selectedId,batchMode,onOpenBatch,onToggleIssues,onFollowPlayback,onNavigate,onChange}:Props){
  const [replaceOpen,setReplaceOpen]=useState(false);
  const [replacement,setReplacement]=useState('');
  const [notice,setNotice]=useState('');
  const trigger=useRef<HTMLButtonElement>(null);
  const [container,setContainer]=useState<HTMLElement|ShadowRoot|null>(null);
  useLayoutEffect(()=>{const root=trigger.current?.getRootNode();setContainer(root instanceof ShadowRoot?root:document.body)},[cues.length>0]);
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
  if(!cues.length)return null;
  return <div className="review-toolbox">
    <Toolbar.Root className="review-controls" aria-label="字幕校对工具">
      <Toolbar.Button className={`review-chip ${onlyIssues?'active':''}`} aria-pressed={onlyIssues} onClick={()=>onToggleIssues(!onlyIssues)} title="仅显示需要校对的字幕"><ShieldAlert size={14}/>问题筛选 <span>{review.affected}</span></Toolbar.Button>
      <Toolbar.Button className="review-chip review-icon" aria-label="下一项" disabled={!problems.length} onClick={goNext} title="下一条问题字幕"><LocateFixed size={15}/></Toolbar.Button>
      <Toolbar.Button className={`review-chip review-icon ${followPlayback?'active':''}`} aria-label="跟随" aria-pressed={followPlayback} onClick={()=>onFollowPlayback(!followPlayback)} title="播放时跟随字幕"><ScanText size={15}/></Toolbar.Button>
      <Toolbar.Separator className="review-separator"/>
      {!batchMode&&<Toolbar.Button className="review-chip" onClick={onOpenBatch}><ListChecks size={14}/>多选编辑</Toolbar.Button>}
      <Menu.Root><Toolbar.Button render={<Menu.Trigger ref={trigger}/>} className="review-chip review-icon" aria-label="更多字幕操作" title="替换、整理与修复"><Ellipsis size={17}/></Toolbar.Button>
      {container&&<Menu.Portal container={container}><Menu.Positioner align="end" sideOffset={6} collisionPadding={10} className="caption-menu-positioner"><Menu.Popup className="caption-project-menu">
        <Menu.Item className="caption-menu-item" onClick={()=>setReplaceOpen(v=>!v)}><Replace size={15}/>{replaceOpen?'关闭替换':'查找并替换'}</Menu.Item>
        <Menu.Separator className="caption-menu-divider"/>
        <Menu.Item className="caption-menu-item" onClick={cleanup}><CheckCheck size={15}/>整理文本</Menu.Item>
        <Menu.Item className="caption-menu-item" onClick={fixTime}><ArrowDownUp size={15}/>修复重叠</Menu.Item>
      </Menu.Popup></Menu.Positioner></Menu.Portal>}</Menu.Root>
    </Toolbar.Root>
    {replaceOpen&&<div className="replace-panel">
      <div className="replace-panel-heading"><span>查找并替换</span><small>使用上方搜索词，按原样匹配文本</small></div>
      <div className="replace-input-row"><input value={replacement} maxLength={200} onChange={e=>setReplacement(e.target.value)} aria-label="替换为" placeholder="替换为…"/><button className="btn small primary" disabled={!query||!replacements} onClick={replaceAll}>替换 {replacements} 条</button></div>
    </div>}
    {notice&&<div className="review-notice" role="status">{notice}<button aria-label="关闭提示" onClick={()=>setNotice('')}>×</button></div>}
  </div>;
}
