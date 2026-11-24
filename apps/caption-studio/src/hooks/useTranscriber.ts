import {useCallback,useEffect,useRef,useState} from 'react';
import type {Chunk} from '../lib/captions';
import type {Device,WorkerRequest,WorkerResponse} from '../workers/transcribe.worker';
import {workspace} from '../../../../src/core/workspace';
export type TranscriptionState={phase:'idle'|'loading'|'extracting'|'running'|'done'|'error';progress:number;processed:number;total:number;segments:number;partial:string;device:string;message:string;seconds:number};
const initial:TranscriptionState={phase:'idle',progress:0,processed:0,total:0,segments:0,partial:'',device:'',message:'',seconds:0};
export function useTranscriber(onResult:(chunks:Chunk[])=>void,onPeaks:(peaks:number[])=>void){
 const [state,setState]=useState<TranscriptionState>(initial);
 const controller=useRef<AbortController|null>(null);
 const sequence=useRef(0);
 const onResultRef=useRef(onResult);
 const onPeaksRef=useRef(onPeaks);
 useEffect(()=>{onResultRef.current=onResult},[onResult]);
 useEffect(()=>{onPeaksRef.current=onPeaks},[onPeaks]);
 const stop=useCallback(()=>{
   sequence.current++;controller.current?.abort();controller.current=null;setState(initial);
 },[]);
 useEffect(()=>()=>{sequence.current++;controller.current?.abort()},[]);
 const start=useCallback((file:File,type:'transcribe'|'waveform',model:string,language:string|null,device:Device)=>{
   controller.current?.abort();
   const jobId=++sequence.current;
   const task=new AbortController();controller.current=task;
   setState({...initial,phase:type==='waveform'?'extracting':'loading',message:'等待媒体处理资源'});
   void workspace.run(type,file,task.signal,ctx=>new Promise<void>((resolve,reject)=>{
     const w=new Worker(new URL('../workers/transcribe.worker.ts',import.meta.url),{type:'module'});
     let settled=false;
     const finish=(error?:unknown)=>{
       if(settled)return;settled=true;
       task.signal.removeEventListener('abort',cancel);w.terminate();
       if(error!==undefined)reject(error);else resolve();
     };
     const cancel=()=>finish(new DOMException('任务已取消','AbortError'));
     task.signal.addEventListener('abort',cancel,{once:true});
     if(task.signal.aborted){cancel();return;}
     w.onmessage=(event:MessageEvent<WorkerResponse>)=>{
       const msg=event.data;if(msg.jobId!==sequence.current||settled)return;
       if(msg.type==='loading'){setState(s=>({...s,phase:'loading',progress:msg.progress,message:''}));ctx.progress(msg.progress/100,'下载模型');}
       if(msg.type==='ready')setState(s=>({...s,phase:'extracting',device:msg.device,message:''}));
       if(msg.type==='progress'){
         setState(s=>({...s,phase:msg.stage==='transcribing'?'running':'extracting',processed:msg.processed,total:msg.total,segments:msg.segments,progress:msg.total>0?100*msg.processed/msg.total:0,message:''}));
         ctx.progress(msg.total>0?msg.processed/msg.total:0,msg.stage==='transcribing'?'字幕识别':'提取音轨');
       }
       if(msg.type==='partial')setState(s=>({...s,partial:msg.text}));
       if(msg.type==='segments')onResultRef.current(msg.chunks);
       if(msg.type==='peaks')onPeaksRef.current(msg.peaks);
       if(msg.type==='done'){
         setState(s=>({...s,phase:'done',seconds:msg.seconds,device:msg.device,segments:msg.segments,progress:100,message:''}));finish();
       }
       if(msg.type==='error')finish(Error(msg.message));
     };
     w.onerror=e=>finish(Error(e.message||'音轨处理 Worker 出现异常'));
     w.onmessageerror=()=>finish(Error('音轨处理 Worker 消息异常'));
     const req:WorkerRequest={type,jobId,file,model,language,device};
     try{w.postMessage(req)}catch(e){finish(e)}
   })).catch(e=>{
     if(jobId===sequence.current&&!task.signal.aborted)setState(s=>({...s,phase:'error',message:e instanceof Error?e.message:String(e)}));
   }).finally(()=>{if(controller.current===task)controller.current=null});
 },[]);
 return {state,transcribe:(file:File,model:string,language:string|null,device:Device)=>start(file,'transcribe',model,language,device),extractWaveform:(file:File)=>start(file,'waveform','',null,'auto'),stop};
}
