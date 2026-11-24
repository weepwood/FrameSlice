import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,Activity,AlertTriangle,ArrowDownToLine,AudioLines,Check,ChevronDown,Clock3,Download,FileAudio,FileText,FileVideo,FolderOpen,HardDriveDownload,Info,Languages,LoaderCircle,Pause,Play,Plus,RotateCcw,Scissors,Search,Settings2,ShieldCheck,SkipBack,SkipForward,Split,Subtitles,Trash2,Undo2,Redo2,UploadCloud,WandSparkles,X,Keyboard,Repeat2} from 'lucide-react';
import {Tabs} from '@base-ui/react/tabs';
import {Checkbox} from '@base-ui/react/checkbox';
import {ProjectMenu} from './components/ProjectMenu';
import {CaptionProgress} from './components/CaptionProgress';
import {CaptionSelect} from './components/CaptionSelect';
import {Timeline} from './components/Timeline';
import {ReviewTools} from './components/ReviewTools';
import {useHistory} from './hooks/useHistory';
import {useTranscriber} from './hooks/useTranscriber';
import {chunksToCues,defaultStyle,fmt,lintCue,mergeNext,parseSubtitles,parseTime,round3,shiftCues,shortTime,sorted,splitCue,toSRT,toVTT,uid,type CaptionStyle,type Chunk,type Cue,type Issue} from './lib/captions';
import {clearProject,loadProject,saveProject,verifyProject,type Project} from './lib/storage';
import type {Device} from './workers/transcribe.worker';
import {workspace} from '../../../src/core/workspace';

const MODELS=[
  {id:'onnx-community/whisper-tiny',title:'Tiny · 快速',size:'~40 MB'},
  {id:'onnx-community/whisper-base',title:'Base · 均衡',size:'~80 MB'},
  {id:'onnx-community/whisper-small',title:'Small · 较准确',size:'~250 MB'},
  {id:'onnx-community/whisper-tiny.en',title:'Tiny · 仅英语',size:'~40 MB'},
  {id:'onnx-community/whisper-base.en',title:'Base · 仅英语',size:'~80 MB'},
];
const LANGS=[['auto','自动检测'],['chinese','中文'],['english','英语'],['japanese','日语'],['korean','韩语'],['spanish','西班牙语'],['french','法语'],['german','德语'],['russian','俄语'],['hindi','印地语']];
type Tab='cues'|'transcribe'|'style'|'export';
type RenderState={phase:'idle'|'working'|'error';progress:number;message:string};
const issueNames:Record<Issue,string>={empty:'空白内容',time:'无效时间',overlap:'时间重叠',fast:'阅读太快',long:'字幕过长'};
const download=(data:Blob,name:string)=>{
  const href=URL.createObjectURL(data),a=document.createElement('a');
  a.href=href;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),15000);
};
const sizeText=(b:number)=>b>1024*1024?`${(b/1024/1024).toFixed(1)} MB`:`${(b/1024).toFixed(0)} KB`;
const baseName=(n:string)=>n.replace(/\.[^.]+$/,'')||'captions';
const sampleCues: Cue[]=[
  {id:uid(),start:0.4,end:3.1,text:'欢迎使用 Caption Studio。'},
  {id:uid(),start:3.3,end:6.7,text:'所有视频和字幕编辑都在你的浏览器中进行。'},
  {id:uid(),start:7,end:10.8,text:'导入本地视频，即可体验 AI 转录与精确校对。'},
];
function iconStatus(text:string){return <span className="pill-status"><ShieldCheck size={13}/>{text}</span>}

export default function App({embedded=false}:{embedded?:boolean}={}){
  const [file,setFile]=useState<File|null>(null);
  const [projectName,setProjectName]=useState('未命名项目');
  const [originalMediaName,setOriginalMediaName]=useState('');
  const [duration,setDuration]=useState(0);
  const [time,setTime]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [peaks,setPeaks]=useState<number[]>([]);
  const [model,setModel]=useState(MODELS[1].id);
  const [language,setLanguage]=useState('auto');
  const [device,setDevice]=useState<Device>('auto');
  const [maxChars,setMaxChars]=useState(30);
  const [style,setStyle]=useState<CaptionStyle>(defaultStyle);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [tab,setTab]=useState<Tab>('cues');
  const [query,setQuery]=useState('');
  const [onlyIssues,setOnlyIssues]=useState(false);
  const [cuePage,setCuePage]=useState(0);
  const [followPlayback,setFollowPlayback]=useState(true);
  const [playbackRate,setPlaybackRate]=useState(1);
  const [loopSelected,setLoopSelected]=useState(false);
  const [shortcutsOpen,setShortcutsOpen]=useState(false);
  const [dragging,setDragging]=useState(false);
  const dragDepth=useRef(0);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState<'loading'|'saved'|'saving'|'error'>('loading');
  const [hydrated,setHydrated]=useState(false);
  const [renderState,setRenderState]=useState<RenderState>({phase:'idle',progress:0,message:''});
  const [font,setFont]=useState<File|null>(null);
  const [shift,setShift]=useState('0.5');
  const video=useRef<HTMLVideoElement>(null);
  const mediaInput=useRef<HTMLInputElement>(null);
  const captionsInput=useRef<HTMLInputElement>(null);
  const projectInput=useRef<HTMLInputElement>(null);
  const fontInput=useRef<HTMLInputElement>(null);
  const searchInput=useRef<HTMLInputElement>(null);
  const cueListRef=useRef<HTMLDivElement>(null);
  const renderAbort=useRef<AbortController|null>(null);
  useEffect(()=>()=>renderAbort.current?.abort(),[]);
  const {value:cues,set:setCues,reset:resetCues,undo,redo,canUndo,canRedo}=useHistory<Cue[]>([]);
  const [mediaURL,setMediaURL]=useState<string|null>(null);
  useEffect(()=>{
    if(!file){setMediaURL(null);return}
    const url=URL.createObjectURL(file);setMediaURL(url);
    return()=>URL.revokeObjectURL(url);
  },[file]);
  const isVideo=Boolean(file?.type.startsWith('video/')||file?.name.match(/\.(mp4|mov|webm|m4v)$/i));
  const effectiveDuration=cues.reduce((max,cue)=>Math.max(max,cue.end),duration);
  const activeCue=useMemo(()=>cues.find(c=>time>=c.start&&time<c.end)??null,[cues,time]);
  const selectedCue=cues.find(c=>c.id===selectedId)??null;
  const problemCount=useMemo(()=>cues.reduce((n,c,i)=>n+lintCue(c,cues[i+1]).length,0),[cues]);
  const shown=useMemo(()=>cues.filter((c,i)=>(!onlyIssues||lintCue(c,cues[i+1]).length>0)&&c.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())),[cues,query,onlyIssues]);
  const cueIndex=useMemo(()=>new Map(cues.map((cue,i)=>[cue.id,i])),[cues]);
  const pageCount=Math.max(1,Math.ceil(shown.length/100));
  const currentPage=Math.min(cuePage,pageCount-1);
  const pageCues=shown.slice(currentPage*100,(currentPage+1)*100);
  useEffect(()=>setCuePage(0),[query,onlyIssues]);
  useEffect(()=>{
    if(!followPlayback||tab!=='cues'||query||onlyIssues||!activeCue)return;
    const index=cueIndex.get(activeCue.id);
    if(index!==undefined){
      const nextPage=Math.floor(index/100);
      if(nextPage!==currentPage){setCuePage(nextPage);return;}
    }
    const active=cueListRef.current?.querySelector('[data-current="true"]');
    if(active && !active.contains(document.activeElement))active.scrollIntoView({block:'nearest',behavior:'smooth'});
  },[activeCue?.id,followPlayback,tab,query,onlyIssues,cueIndex,currentPage]);
  useEffect(()=>{if(video.current)video.current.playbackRate=playbackRate},[playbackRate,mediaURL]);
  const onChunks=useCallback((chunks:Chunk[])=>{
    setCues(previous=>sorted([...previous,...chunksToCues(chunks,maxChars,duration||undefined)]));
    setSelectedId(null);
  },[duration,maxChars,setCues]);
  const transcriber=useTranscriber(onChunks,setPeaks);
  const busy=['loading','extracting','running'].includes(transcriber.state.phase);

  useEffect(()=>{
    let cancelled=false;
    loadProject().then(p=>{
      if(!p||cancelled)return;
      const clean=verifyProject(p);
      setProjectName(clean.name);setOriginalMediaName(clean.mediaName);
      setDuration(clean.duration);setStyle(clean.style);resetCues(clean.cues);
    }).then(()=>{if(!cancelled)setSaved('saved')}).catch(()=>{if(!cancelled)setSaved('error')}).finally(()=>{if(!cancelled)setHydrated(true)});
    return()=>{cancelled=true};
  },[resetCues]);
  useEffect(()=>{
    if(!hydrated)return;
    setSaved('saving');
    const timer=setTimeout(()=>{
      const p:Project={version:1,name:projectName,mediaName:file?.name||originalMediaName,duration:effectiveDuration,cues,style,updatedAt:Date.now()};
      saveProject(p).then(()=>setSaved('saved')).catch(()=>setSaved('error'));
    },600);
    return()=>clearTimeout(timer);
  },[hydrated,projectName,file,originalMediaName,effectiveDuration,cues,style]);

  const loadMedia=(f:File)=>{
    renderAbort.current?.abort();
    if(!f.type.startsWith('video/')&&!f.type.startsWith('audio/')&&!/\.(mp4|mov|webm|m4v|mp3|m4a|wav|ogg|flac|aac)$/i.test(f.name)){
      setError('请选择音频或视频文件');return;
    }
    const relink=Boolean(cues.length&&(!file&&!originalMediaName||originalMediaName===f.name));
    if(cues.length&&!relink&&!window.confirm('打开新媒体将清空当前字幕。请先导出工程或字幕。确定继续？'))return;
    transcriber.stop();setError('');setFile(f);
    if(!relink){setProjectName(baseName(f.name));setDuration(0);setSelectedId(null);resetCues([])}
    setOriginalMediaName(f.name);setTime(0);setPeaks([]);
    setRenderState({phase:'idle',progress:0,message:''});
  };
  const openMediaOrSubtitle=(f:File)=>{
    if(/\.(srt|vtt)$/i.test(f.name)){void importSubtitles(f);return;}
    if(/\.json$/i.test(f.name)){void importProject(f);return;}
    loadMedia(f);
  };
  const importSubtitles=async(f:File)=>{
    setError('');
    try{
      const buffer=await f.arrayBuffer();
      let text=new TextDecoder('utf-8').decode(buffer);
      if((text.match(/�/g)||[]).length>2)text=new TextDecoder('gb18030').decode(buffer);
      const parsed=parseSubtitles(text);
      if(!parsed.length)throw Error('未检测到有效的字幕时间轴');
      resetCues(parsed);setSelectedId(parsed[0].id);setTab('cues');
      if(!file)setProjectName(baseName(f.name));
    }catch(e){setError(`字幕导入失败：${String(e instanceof Error?e.message:e)}`)}
  };
  const importProject=async(f:File)=>{
    renderAbort.current?.abort();
    try{
      const p=verifyProject(JSON.parse(await f.text()));
      transcriber.stop();setFile(null);setPeaks([]);setTime(0);
      setDuration(p.duration);setProjectName(p.name);setOriginalMediaName(p.mediaName);
      setStyle(p.style);resetCues(p.cues);setSelectedId(null);setError('');setTab('cues');
    }catch(e){setError(`项目导入失败：${String(e instanceof Error?e.message:e)}`)}
  };
  const reset=async()=>{
    renderAbort.current?.abort();
    transcriber.stop();resetCues([]);setFile(null);setPeaks([]);setProjectName('未命名项目');
    setOriginalMediaName('');setDuration(0);setTime(0);setSelectedId(null);setStyle(defaultStyle);setError('');
    try{await clearProject()}catch{/* next autosave will replace */}
  };
  const seek=(s:number)=>{
    const t=Math.max(0,Math.min(s,effectiveDuration));
    if(video.current)video.current.currentTime=t;
    setTime(t);
  };
  const play=()=>{if(!video.current)return;if(video.current.paused)void video.current.play();else video.current.pause()};
  const startTranscription=()=>{
    if(!file)return;
    if(cues.length&&!window.confirm('重新转录将替换当前所有字幕。是否继续？'))return;
    setError('');setPeaks([]);resetCues([]);setSelectedId(null);setTab('transcribe');
    // Automatically extract the original File audio in a Worker, no 350 MB cap.
    transcriber.transcribe(file,model,language==='auto'?null:language,device);
  };
  const makeWaveform=()=>{
    if(!file)return;
    setError('');setPeaks([]);setTab('transcribe');transcriber.extractWaveform(file);
  };
  const cancelTask=()=>{transcriber.stop()};
  const updateCue=(id:string,patch:Partial<Cue>)=>setCues(list=>{
    const next=list.map(c=>c.id===id?{...c,...patch}:c);
    return 'start' in patch?sorted(next):next;
  },'text' in patch?`text:${id}`:'');
  const insertAfter=(id?:string)=>{
    const index=id?cues.findIndex(c=>c.id===id):cues.length-1;
    const start=index>=0?(cues[index]?.end||0):0;
    const next=cues[index+1]?.start;
    const end=next&&next>start+0.1?Math.min(next,start+2):start+2;
    const cue:Cue={id:uid(),start:round3(start),end:round3(end),text:''};
    setCues(list=>[...list.slice(0,index+1),cue,...list.slice(index+1)]);setSelectedId(cue.id);
  };
  const jumpToCue=(id:string)=>{
    const cue=cues.find(c=>c.id===id);
    if(!cue)return;
    setTab('cues');setOnlyIssues(false);setQuery('');setCuePage(Math.floor((cueIndex.get(id)??0)/100));setSelectedId(id);seek(cue.start);
    window.requestAnimationFrame(()=>cueListRef.current?.querySelector(`[data-cue-id="${id}"]`)?.scrollIntoView({block:'center',behavior:'smooth'}));
  };
  const exportAs=(kind:'srt'|'vtt'|'json')=>{
    const valid=cues.filter(c=>c.end>c.start&&c.text.trim());
    if(!valid.length){setError('没有可导出的有效字幕');return;}
    const p:Project={version:1,name:projectName,mediaName:file?.name||originalMediaName,duration:effectiveDuration,cues,style,updatedAt:Date.now()};
    const data=kind==='srt'?toSRT(valid):kind==='vtt'?toVTT(valid):JSON.stringify(p,null,2);
    download(new Blob([data],{type:kind==='json'?'application/json':'text/plain;charset=utf-8'}),`${baseName(projectName)}.${kind}`);
  };
  const renderVideo=async()=>{
    if(!file||!isVideo||!cues.length||renderAbort.current)return;
    setError('');setRenderState({phase:'working',progress:0,message:'正在下载 FFmpeg 并准备文件…'});
    const controller=new AbortController();renderAbort.current=controller;
    try{
      const {burnVideo}=await import('./lib/burn');
      const width=video.current?.videoWidth??0,height=video.current?.videoHeight??0;
      const out=await workspace.run('burn',file,controller.signal,ctx=>burnVideo({file,duration,width,height,cues,style,font:font??undefined,signal:controller.signal,onProgress:p=>{setRenderState({phase:'working',progress:p,message:'正在编码视频…'});ctx.progress(p,'正在编码视频')}}));
      download(out,`${baseName(projectName)}-captioned.mp4`);
      setRenderState({phase:'idle',progress:0,message:'视频已导出'});
    }catch(e){setRenderState({phase:'error',progress:0,message:controller.signal.aborted?'已取消渲染':String(e instanceof Error?e.message:e)})}
    finally{renderAbort.current=null}
  };
  const exportProject=()=>{
    const p:Project={version:1,name:projectName,mediaName:file?.name||originalMediaName,duration:effectiveDuration,cues,style,updatedAt:Date.now()};
    download(new Blob([JSON.stringify(p,null,2)],{type:'application/json'}),`${baseName(projectName)}.caption-project.json`);
  };
  useEffect(()=>{
    const handle=(e:KeyboardEvent)=>{
      const input=(e.target as HTMLElement).closest('textarea,input,select,[contenteditable]');
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){
        e.preventDefault();setTab('cues');setOnlyIssues(false);
        window.requestAnimationFrame(()=>searchInput.current?.focus());return;
      }
      if(e.key==='Escape'&&shortcutsOpen){setShortcutsOpen(false);return;}
      if(input||shortcutsOpen)return;
      if(e.key==='?'){e.preventDefault();setShortcutsOpen(true);return;}
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){
        e.preventDefault();if(e.shiftKey)redo();else undo();
      }else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}
      else if(e.code==='Space'||e.key.toLowerCase()==='k'){e.preventDefault();play()}
      else if(e.key.toLowerCase()==='j'){e.preventDefault();seek(time-5)}
      else if(e.key.toLowerCase()==='l'){e.preventDefault();seek(time+5)}
    };
    window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);
  });
  const mediaMissing=Boolean(originalMediaName&&!file);

  return <div className={`app-shell ${embedded?'embedded':''} ${dragging?'dragging':''}`}
    onDragEnter={e=>{if(Array.from(e.dataTransfer.types).includes('Files')){dragDepth.current++;setDragging(true)}}}
    onDragOver={e=>{if(Array.from(e.dataTransfer.types).includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy'}}}
    onDragLeave={e=>{if(Array.from(e.dataTransfer.types).includes('Files')){dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)setDragging(false)}}}
    onDrop={e=>{e.preventDefault();dragDepth.current=0;setDragging(false);if(e.dataTransfer.files[0])openMediaOrSubtitle(e.dataTransfer.files[0])}}>
    {dragging&&<div className="file-drop-overlay" role="status"><div><UploadCloud size={30}/><strong>松开以导入文件</strong><span>支持音视频、SRT、VTT 与字幕工程</span></div></div>}
    {!embedded&&<header className="topbar">
      <div className="brand"><span className="brand-mark"><AudioLines size={20} strokeWidth={2.5}/></span><div><b>caption<span className="brand-light">studio</span></b><small>LOCAL FIRST EDITOR</small></div></div>
      <span className="header-divider"/>
      <div className="project-name"><input aria-label="项目名称" value={projectName} onChange={e=>setProjectName(e.target.value)} maxLength={100}/><ChevronDown size={14}/></div>
      <div className="header-spacer"/>
      <div className="save-indicator">{saved==='saved'?<Check size={14}/>:saved==='saving'?<LoaderCircle className="spin" size={14}/>:<AlertTriangle size={14}/>} <span>{saved==='saved'?'已保存到本地':saved==='saving'?'正在保存':saved==='loading'?'正在读取':'保存失败'}</span></div>
      <button className="btn small icon-help" onClick={()=>setShortcutsOpen(true)} title="查看键盘快捷键" aria-label="键盘快捷键"><Keyboard size={17}/></button>
      <button className="btn small outline" onClick={exportProject}><HardDriveDownload size={16}/>导出工程</button>
      <button className="btn small primary" onClick={()=>mediaInput.current?.click()}><FolderOpen size={16}/>打开媒体</button>
    </header>}
    <input ref={mediaInput} type="file" accept="video/*,audio/*,.mp4,.m4a,.webm,.wav,.mov" hidden onChange={e=>{if(e.target.files?.[0])loadMedia(e.target.files[0]);e.target.value=''}}/>
    <input ref={captionsInput} type="file" accept=".srt,.vtt" hidden onChange={e=>{if(e.target.files?.[0])void importSubtitles(e.target.files[0]);e.target.value=''}}/>
    <input ref={projectInput} type="file" accept=".json" hidden onChange={e=>{if(e.target.files?.[0])void importProject(e.target.files[0]);e.target.value=''}}/>
    <input ref={fontInput} type="file" accept=".ttf,.otf" hidden onChange={e=>{setFont(e.target.files?.[0]??null);e.target.value=''}}/>

    <div className="workspace">
      {!embedded&&<aside className="nav-rail" aria-label="工作区">
        <span className="rail-label">FRAMESLICE / WORKSPACE</span>
        <a href="/FrameSlice/" className="rail-item frame-home-link"><ArrowLeft size={18}/>返回视频工具</a>
        <button className="rail-item selected"><Subtitles size={18}/>字幕工作台</button>
        <div className="rail-spacer"/>
        <div className="rail-info"><ShieldCheck size={17}/><div><b>纯本地处理</b><small>媒体不会上传到服务端。模型与运行资源需首次联网下载。</small></div></div>
        <button className="rail-item reset" onClick={()=>{if(window.confirm('确定新建空白工程？未导出的媒体不会保存。'))void reset()}}><RotateCcw size={17}/>新建工程</button>
        <div className="rail-version">FRAMESLICE / CAPTION STUDIO · 0.4.0</div>
      </aside>}
      <main className="editor-area">
        {embedded&&<div className="caption-action-toolbar" role="toolbar" aria-label="字幕工作台操作">
          <div className="caption-project-group">
            <div className="caption-project-field"><input aria-label="字幕工程名称" placeholder="工程名称" value={projectName} onChange={e=>setProjectName(e.target.value)} maxLength={100}/></div>
            <span className="caption-save-state" data-save={saved} role="status">{saved==='saved'?'已保存':saved==='saving'?'保存中…':saved==='loading'?'读取中…':'保存异常'}</span>
          </div>
          <div className="caption-toolbar-actions">
            {(busy||transcriber.state.phase==='error'||transcriber.state.phase==='done')&&tab!=='transcribe'&&<button className="btn outline caption-task-status" onClick={()=>setTab('transcribe')}>{busy?'转录 / 波形 '+Math.round(transcriber.state.progress)+'%':transcriber.state.phase==='error'?'处理失败 · 查看':'处理完成 · 查看'}</button>}
            <button className="btn outline" onClick={()=>captionsInput.current?.click()}><FileText size={15}/>导入字幕</button>
            <ProjectMenu onOpen={()=>projectInput.current?.click()} onExport={exportProject} onNew={()=>{if(window.confirm('确定新建空白工程？未导出的内容可能丢失。'))void reset()}} canPackage={!!file&&!!cues.length&&!busy} onPackage={()=>{if(!file||!cues.length||busy)return;window.dispatchEvent(new CustomEvent('frameslice:subtitle-package',{detail:{file,subtitle:new File([toSRT(cues)],'caption-export.srt',{type:'text/plain;charset=utf-8'})}}))}}/>
            <button className="btn primary" onClick={()=>mediaInput.current?.click()}><FileVideo size={15}/>打开媒体</button>
          </div>
        </div>}
        {!embedded&&<div className="editor-header">
          <div><div className="eyebrow">EDITOR / LOCAL WORKSPACE</div><h1>字幕编辑工作台</h1><p>导入媒体 · 本地识别 · 精确校对 · 导出成片</p></div>
          <div className="editor-header-actions">{iconStatus('无需上传视频')}<span className="line-separator"/><span className="header-meta">{cues.length} 条字幕</span></div>
        </div>
        }
        {error&&<div className="error-banner" role="alert"><AlertTriangle size={16}/><span>{error}</span><button aria-label="关闭错误提示" onClick={()=>setError('')}><X size={16}/></button></div>}
        {mediaMissing&&<div className="notice-banner"><Info size={16}/>已恢复字幕工程，但媒体文件不会自动保存。请重新打开「{originalMediaName}」以继续视频预览。</div>}
        <div className="content-grid">
          <div className="main-column">
            <section className="video-panel surface">
              <div className="section-title"><div><strong>视频预览</strong></div><span className="chip">{isVideo?'视频':'本地媒体'}</span></div>
              <div className="video-frame">
                {mediaURL?<>
                  <video ref={video} src={mediaURL} playsInline onTimeUpdate={e=>{
                     const v=e.currentTarget;
                     if(loopSelected&&selectedCue&&selectedCue.end>selectedCue.start&&!v.paused&&(v.currentTime>=selectedCue.end||v.currentTime<selectedCue.start)){
                       v.currentTime=selectedCue.start;
                     }
                     setTime(v.currentTime);
                   }} onLoadedMetadata={e=>{if(Number.isFinite(e.currentTarget.duration))setDuration(e.currentTarget.duration);e.currentTarget.playbackRate=playbackRate}} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onClick={play}/>
                  {activeCue&&<div className={`caption-overlay ${style.position}`}><span style={{color:style.textColor,backgroundColor:colorAlpha(style.boxColor,style.boxOpacity),fontSize:`clamp(14px,${(style.fontSize/1080*100).toFixed(2)}cqh,${style.fontSize}px)`,fontWeight:style.bold?700:400}}>{activeCue.text}</span></div>}
                  {!isVideo&&<div className="audio-backdrop"><Activity size={50} strokeWidth={1.1}/><p>音频预览</p></div>}
                </>:<div className="empty-media"><div className="empty-icon"><UploadCloud size={25}/></div><h2>打开媒体或字幕</h2><p>MP4、WebM、MP3、WAV</p><div className="empty-actions"><button className="btn primary" onClick={()=>mediaInput.current?.click()}><FileVideo size={16}/>选择媒体文件</button><button className="btn outline" onClick={()=>captionsInput.current?.click()}><FileText size={16}/>导入 SRT / VTT</button></div>{!cues.length&&<button className="text-button" onClick={()=>{resetCues(sampleCues.map(c=>({...c,id:uid()})));setSelectedId(null);setProjectName('示例字幕')}}>加载示例字幕</button>}</div>}
              </div>
              <div className="playback-controls">
                <button className="play-button" onClick={play} disabled={!file} aria-label={playing?'暂停':'播放'}>{playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button>
                <button className="icon-btn" aria-label="后退 5 秒" title="后退 5 秒" onClick={()=>seek(time-5)}><SkipBack size={17}/></button>
                <button className="icon-btn" aria-label="前进 5 秒" title="前进 5 秒" onClick={()=>seek(time+5)}><SkipForward size={17}/></button>
                <span className="playback-time">{shortTime(time)} <span>/ {shortTime(effectiveDuration)}</span></span>
                <input type="range" min={0} max={effectiveDuration||1} step={.01} value={Math.min(time,effectiveDuration)} aria-label="跳转播放位置" onChange={e=>seek(Number(e.target.value))}/>
                <button className={`icon-btn loop-button ${loopSelected?'active':''}`} disabled={!selectedCue||!file} aria-pressed={loopSelected} title="循环播放已选字幕" aria-label="循环播放选中字幕" onClick={()=>{if(!loopSelected&&selectedCue)seek(selectedCue.start);setLoopSelected(v=>!v)}}><Repeat2 size={17}/></button>
                <label className="speed-control"><span>倍速</span><CaptionSelect label="播放速度" value={playbackRate} onChange={setPlaybackRate} options={[.5,.75,1,1.25,1.5,2].map(value=>({value,label:value+"×"}))}/></label>
              </div>
              <div className="media-info"><div><FileAudio size={15}/><span>{file?.name??'尚未打开媒体文件'}</span></div><span>{file?sizeText(file.size):'—'}</span></div>
            </section>
            <Timeline duration={effectiveDuration} cues={cues} peaks={peaks} time={time} selectedId={selectedId} onSeek={seek} onSelect={setSelectedId} onUpdate={updateCue}/>

          </div>
          <aside className="side-panel surface">
            <Tabs.Root value={tab} onValueChange={value=>setTab(value as Tab)} className="caption-inspector-tabs">
            <Tabs.List className="side-tabs" aria-label="工作区功能">
              <Tabs.Tab value="cues" className={tab==='cues'?'active':''}><Subtitles size={16}/>字幕</Tabs.Tab>
              <Tabs.Tab value="transcribe" className={tab==='transcribe'?'active':''}><AudioLines size={16}/>转录{busy&&<span className="caption-running-dot"/>}</Tabs.Tab>
              <Tabs.Tab value="style" className={tab==='style'?'active':''}><Settings2 size={16}/>样式</Tabs.Tab>
              <Tabs.Tab value="export" className={tab==='export'?'active':''}><ArrowDownToLine size={16}/>导出</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="transcribe" className="caption-tab-content">
            <section className="transcribe-panel surface">
              <div className="section-title"><div><strong>语音转录</strong></div><span className="chip"><Activity size={13}/> 本地模型</span></div>
              <div className="settings-grid">
                <div className="caption-field"><span>识别模型</span><CaptionSelect label="识别模型" value={model} disabled={busy} onChange={setModel} options={MODELS.map(m=>({value:m.id,label:m.title+" ("+m.size+")"}))}/></div>
                <div className="caption-field"><span>原文语言</span><CaptionSelect label="原文语言" value={language} disabled={busy||model.endsWith('.en')} onChange={setLanguage} options={LANGS.map(([value,label])=>({value,label}))}/></div>
                <div className="caption-field"><span>计算后端</span><CaptionSelect<Device> label="计算后端" value={device} disabled={busy} onChange={setDevice} options={[{value:"auto",label:"自动（GPU 优先）"},{value:"webgpu",label:"WebGPU"},{value:"wasm",label:"CPU / WASM"}]}/></div>
                <label>每条字幕最大字符 <input type="number" min={8} max={120} value={maxChars} disabled={busy} onChange={e=>setMaxChars(Math.min(120,Math.max(8,Number(e.target.value)||30)))}/></label>
              </div>
              <div className="transcribe-bottom"><div className="transcribe-helper"><Info size={15}/><span>首次转录需下载模型。</span></div>
                {busy?<button className="btn danger-ghost" onClick={cancelTask}><X size={15}/>取消任务</button>:<button className="btn primary" disabled={!file} onClick={()=>void startTranscription()}><WandSparkles size={16}/>{cues.length?'重新生成字幕':'开始自动转录'}</button>}</div>
              {transcriber.state.phase==='loading'&&<div className="task-status"><LoaderCircle className="spin" size={15}/>正在准备模型 {Math.round(transcriber.state.progress)}% <CaptionProgress value={transcriber.state.progress} label="转录进度"/></div>}
              {transcriber.state.phase==='extracting'&&<div className="task-status"><LoaderCircle className="spin" size={15}/>正在从媒体分段提取音轨 · {Math.round(transcriber.state.progress)}% <CaptionProgress value={transcriber.state.progress} label="转录进度"/></div>}
              {transcriber.state.phase==='running'&&<div className="task-status"><LoaderCircle className="spin" size={15}/>正在使用 {transcriber.state.device==='webgpu'?'WebGPU':'WASM'} 分段识别 · {Math.round(transcriber.state.progress)}% · {transcriber.state.segments} 段完成 <CaptionProgress value={transcriber.state.progress} label="转录进度"/> {transcriber.state.partial&&<span className="transcript-snippet">{transcriber.state.partial}</span>}</div>}
              {transcriber.state.phase==='done'&&<div className="task-status done"><Check size={15}/>处理完成 · {transcriber.state.segments} 个识别分段 · {transcriber.state.seconds.toFixed(1)} 秒</div>}
              {transcriber.state.phase==='error'&&<div className="task-status failed"><AlertTriangle size={15}/>{transcriber.state.message}</div>}
            </section>
            </Tabs.Panel>
            <Tabs.Panel value="cues" className="caption-tab-content">
              <div className="side-tools"><div className="subtitle-search"><Search size={15}/><input ref={searchInput} placeholder="搜索字幕" aria-label="搜索字幕" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="history-buttons"><button className="icon-btn" disabled={!canUndo} onClick={undo} title="撤销 (Ctrl+Z)"><Undo2 size={16}/></button><button className="icon-btn" disabled={!canRedo} onClick={redo} title="重做"><Redo2 size={16}/></button></div></div>
              <ReviewTools cues={cues} query={query} onlyIssues={onlyIssues} followPlayback={followPlayback} selectedId={selectedId}
                onToggleIssues={setOnlyIssues} onFollowPlayback={setFollowPlayback} onNavigate={jumpToCue} onChange={setCues}/>
              <div className="cue-stats"><span>{shown.length} / {cues.length} 条字幕</span><div className="cue-pagination"><button disabled={currentPage===0} title="上一页字幕" onClick={()=>setCuePage(p=>Math.max(0,p-1))}>‹</button><span>{currentPage+1}/{pageCount}</span><button disabled={currentPage>=pageCount-1} title="下一页字幕" onClick={()=>setCuePage(p=>Math.min(pageCount-1,p+1))}>›</button></div><span className={problemCount?'issue-count':''}>{problemCount?<AlertTriangle size={13}/>:<Check size={13}/>} {problemCount} 项检查提示</span></div>
              <div className="cue-list" ref={cueListRef}>
                {!cues.length?<div className="empty-cues"><FileText size={29}/><h3>还没有字幕</h3><button className="btn outline" onClick={()=>insertAfter()}><Plus size={15}/>新增字幕</button></div>:shown.length===0?<div className="empty-cues"><Search size={22}/>没有匹配的字幕</div>:
                  pageCues.map((c)=>{const index=cueIndex.get(c.id)??-1,issues=lintCue(c,cues[index+1]);return <article key={c.id} data-cue-id={c.id} data-current={activeCue?.id===c.id} className={`cue-row ${selectedId===c.id?'selected':''} ${activeCue?.id===c.id?'playing':''}`} onClick={()=>setSelectedId(c.id)}>
                    <div className="cue-row-top"><button className="cue-number" onClick={e=>{e.stopPropagation();seek(c.start);setSelectedId(c.id)}}>{String(index+1).padStart(2,'0')}</button><span className="cue-duration">{(c.end-c.start).toFixed(1)}s</span><div className="cue-row-actions"><button title="在当前位置拆分" onClick={()=>setCues(xs=>splitCue(xs,c.id))}><Scissors size={14}/></button><button title="与下一条合并" disabled={index===cues.length-1} onClick={()=>setCues(xs=>mergeNext(xs,c.id))}><Split size={14}/></button><button title="新增下一条" onClick={()=>insertAfter(c.id)}><Plus size={14}/></button><button title="删除字幕" onClick={()=>setCues(xs=>xs.filter(x=>x.id!==c.id))}><Trash2 size={14}/></button></div></div>
                    <textarea aria-label={`第 ${index+1} 条字幕`} rows={Math.max(2,Math.min(4,Math.ceil(c.text.length/30)))} value={c.text} onChange={e=>updateCue(c.id,{text:e.target.value})} onFocus={()=>setSelectedId(c.id)}/>
                    <div className="cue-row-bottom"><TimeEditor label="开始时间" time={c.start} onCommit={v=>updateCue(c.id,{start:v})}/><span>→</span><TimeEditor label="结束时间" time={c.end} onCommit={v=>updateCue(c.id,{end:v})}/><button className="cue-seek" onClick={()=>{seek(c.start);setSelectedId(c.id)}} title="跳转到字幕"><Play size={12}/></button></div>
                    {issues.length>0&&<div className="cue-issues">{issues.map(issue=><span key={issue}>{issueNames[issue]}</span>)}</div>}
                  </article>})}
              </div>
              <div className="cue-footer"><div className="shift-controls"><span>整体偏移</span><input aria-label="偏移秒数" type="number" step="0.1" value={shift} onChange={e=>setShift(e.target.value)}/><span>秒</span><button onClick={()=>setCues(c=>shiftCues(c,-(Number(shift)||0)))} title="提前字幕">−</button><button onClick={()=>setCues(c=>shiftCues(c,Number(shift)||0))} title="延后字幕">+</button></div><button className="btn outline full" onClick={()=>insertAfter(cues[cues.length-1]?.id)}><Plus size={15}/>新增字幕</button></div>
            </Tabs.Panel>
            <Tabs.Panel value="style" className="style-editor caption-tab-content">
              <div className="section-subheading"><strong>预览样式</strong></div>
              <div className="style-fields">
                <label>字号 <div className="size-range"><input type="range" min={24} max={92} value={style.fontSize} onChange={e=>setStyle(s=>({...s,fontSize:Number(e.target.value)}))}/><output>{style.fontSize}px</output></div></label>
                <label>文字颜色 <input type="color" value={style.textColor} onChange={e=>setStyle(s=>({...s,textColor:e.target.value}))}/></label>
                <label>背景颜色 <input type="color" value={style.boxColor} onChange={e=>setStyle(s=>({...s,boxColor:e.target.value}))}/></label>
                <label>背景透明度 <div className="size-range"><input type="range" min={0} max={100} value={style.boxOpacity*100} onChange={e=>setStyle(s=>({...s,boxOpacity:Number(e.target.value)/100}))}/><output>{Math.round(style.boxOpacity*100)}%</output></div></label>
                <div className="caption-field"><span>字幕位置</span><CaptionSelect<CaptionStyle["position"]> label="字幕位置" value={style.position} onChange={position=>setStyle(s=>({...s,position}))} options={[{value:"bottom",label:"底部居中"},{value:"middle",label:"画面居中"},{value:"top",label:"顶部居中"}]}/></div>
                <div className="switch-row"><label htmlFor="caption-bold">文字加粗</label><Checkbox.Root id="caption-bold" aria-label="文字加粗" className="caption-checkbox" checked={style.bold} onCheckedChange={checked=>setStyle(s=>({...s,bold:checked===true}))}><Checkbox.Indicator><Check size={12}/></Checkbox.Indicator></Checkbox.Root></div>
              </div>
              <button className="btn outline full" onClick={()=>setStyle(defaultStyle)}>恢复默认样式</button>
              <div className="style-note"><Info size={15}/> 浏览器字幕预览与 FFmpeg 烧录可能存在字体度量差异。中文烧录建议手动选择支持中文的字体文件。</div>
            </Tabs.Panel>
            <Tabs.Panel value="export" className="export-editor caption-tab-content">
              <div className="section-subheading"><strong>字幕文件</strong></div>
              <div className="export-grid"><button disabled={!cues.length} onClick={()=>exportAs('srt')}><FileText size={22}/><strong>SRT</strong><small>通用字幕文件</small><Download size={15}/></button><button disabled={!cues.length} onClick={()=>exportAs('vtt')}><FileText size={22}/><strong>VTT</strong><small>网页视频字幕</small><Download size={15}/></button></div>
              <button className="btn outline full" onClick={exportProject}><HardDriveDownload size={16}/>导出可恢复的 JSON 工程</button>
              <div className="section-subheading render-heading"><strong>烧录字幕到视频</strong><small>实验功能 · 适合短视频</small></div>
              <button className="file-pick" onClick={()=>fontInput.current?.click()}><Languages size={17}/>{font?.name||'选择中文字体 .ttf / .otf（推荐）'}<ChevronDown size={14}/></button>
              {renderState.phase==='working'?<div className="render-progress"><CaptionProgress value={renderState.progress} max={1} label="烧录进度"/><span>{renderState.message} {Math.round(renderState.progress*100)}%</span><button className="btn outline full" onClick={()=>renderAbort.current?.abort()}>取消烧录</button></div>:<button className="btn primary full" disabled={!isVideo||!cues.length} onClick={()=>void renderVideo()}><FileVideo size={16}/>生成带字幕 MP4</button>}
              {renderState.phase==='error'&&<div className="style-note warning">{renderState.message}</div>}
              {renderState.message&&renderState.phase==='idle'&&<div className="task-status done"><Check size={15}/>{renderState.message}</div>}
              <div className="style-note"><AlertTriangle size={15}/> 实验性烧录：最大 64 MiB、5 分钟、1080p 像素预算，仍可能占用大量内存。长视频建议使用软字幕封装或桌面 FFmpeg。</div>
            </Tabs.Panel>
            </Tabs.Root>
          </aside>
        </div>
        
        <div className="bottom-meta"><div><Clock3 size={14}/> {effectiveDuration?`媒体时长 ${fmt(effectiveDuration,'vtt')}`:'等待媒体'} <span className="dot">·</span>{selectedCue?`已选中第 ${cues.findIndex(c=>c.id===selectedId)+1} 条字幕`:'未选择字幕'}</div><div><button onClick={()=>void makeWaveform()} disabled={!file||busy}><AudioLines size={14}/> {peaks.length?'重新提取波形':'提取音频波形'}</button><span className="dot">·</span><a href="https://github.com/sudesh1456/whisper-caption-editor" target="_blank" rel="noreferrer">原项目 / MIT</a></div></div>
      </main>
    </div>
    {shortcutsOpen&&<div className="shortcut-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)setShortcutsOpen(false)}}>
      <div className="shortcut-dialog" role="dialog" aria-modal="true" aria-label="键盘快捷键">
        <div className="shortcut-heading"><div><Keyboard size={20}/><strong>键盘快捷键</strong></div><button aria-label="关闭快捷键" onClick={()=>setShortcutsOpen(false)}><X size={18}/></button></div>
        <div className="shortcut-grid"><span>播放 / 暂停</span><kbd>Space</kbd><span>后退 / 前进 5 秒</span><div><kbd>J</kbd> <kbd>L</kbd></div><span>查找字幕</span><kbd>Ctrl / ⌘ + K</kbd><span>撤销</span><kbd>Ctrl / ⌘ + Z</kbd><span>重做</span><kbd>Ctrl / ⌘ + Shift + Z</kbd><span>查看帮助</span><kbd>?</kbd></div>
        <p>编辑文本时不会触发播放快捷键，支持时间轴拖拽校时。</p>
      </div>
    </div>}
  </div>;
}

function TimeEditor({time,label,onCommit}:{time:number;label:string;onCommit:(time:number)=>void}){
  const [draft,setDraft]=useState<string|null>(null);
  const commit=()=>{if(draft!==null){const value=parseTime(draft);if(Number.isFinite(value)&&value>=0)onCommit(round3(value));setDraft(null)}};
  return <input className="time-input" aria-label={label} title={label} value={draft??shortTime(time)} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape')setDraft(null)}}/>;
}
function colorAlpha(hex:string,a:number){const h=hex.replace('#','');return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`}
