import {useCallback,useEffect,useRef,useState} from 'react';
import type {Chunk} from '../lib/captions';
import type {Device,WorkerRequest,WorkerResponse} from '../workers/transcribe.worker';
export type TranscriptionState={phase:'idle'|'loading'|'extracting'|'running'|'done'|'error';progress:number;processed:number;total:number;segments:number;partial:string;device:string;message:string;seconds:number};
const initial:TranscriptionState={phase:'idle',progress:0,processed:0,total:0,segments:0,partial:'',device:'',message:'',seconds:0};
/** Extraction and Whisper inference both happen in a cancellable module Worker. */
export function useTranscriber(onResult:(chunks:Chunk[])=>void,onPeaks:(peaks:number[])=>void){
 const [state,setState]=useState<TranscriptionState>(initial);
 const worker=useRef<Worker|null>(null);
 const sequence=useRef(0);
 const onResultRef=useRef(onResult);
 const onPeaksRef=useRef(onPeaks);
 useEffect(()=>{onResultRef.current=onResult},[onResult]);
 useEffect(()=>{onPeaksRef.current=onPeaks},[onPeaks]);
 const stop=useCallback(()=>{
   sequence.current++;worker.current?.terminate();worker.current=null;setState(initial);
 },[]);
 useEffect(()=>()=>{worker.current?.terminate()},[]);
 const start=useCallback((file:File,type:'transcribe'|'waveform',model:string,language:string|null,device:Device)=>{
   worker.current?.terminate();
   const jobId=++sequence.current;
   const w=new Worker(new URL('../workers/transcribe.worker.ts',import.meta.url),{type:'module'});
   worker.current=w;
   setState({...initial,phase:type==='waveform'?'extracting':'loading'});
   w.onmessage=(event:MessageEvent<WorkerResponse>)=>{
     const msg=event.data;if(msg.jobId!==sequence.current)return;
     if(msg.type==='loading')setState(s=>({...s,phase:'loading',progress:msg.progress}));
     if(msg.type==='ready')setState(s=>({...s,phase:'extracting',device:msg.device}));
     if(msg.type==='progress')setState(s=>({
       ...s,phase:msg.stage==='transcribing'?'running':'extracting',
       processed:msg.processed,total:msg.total,segments:msg.segments,
       progress:msg.total>0?100*msg.processed/msg.total:0,
     }));
     if(msg.type==='partial')setState(s=>({...s,partial:msg.text}));
     if(msg.type==='segments')onResultRef.current(msg.chunks);
     if(msg.type==='peaks')onPeaksRef.current(msg.peaks);
     if(msg.type==='done'){
       setState(s=>({...s,phase:'done',seconds:msg.seconds,device:msg.device,segments:msg.segments,progress:100}));
       w.terminate();if(worker.current===w)worker.current=null;
     }
     if(msg.type==='error'){
       setState(s=>({...s,phase:'error',message:msg.message}));
       w.terminate();if(worker.current===w)worker.current=null;
     }
   };
   w.onerror=e=>{
     if(jobId!==sequence.current)return;
     setState(s=>({...s,phase:'error',message:e.message||'音轨处理 Worker 出现异常'}));
     w.terminate();if(worker.current===w)worker.current=null;
   };
   const req:WorkerRequest={type,jobId,file,model,language,device};
   w.postMessage(req);
 },[]);
 return {
   state,
   transcribe:(file:File,model:string,language:string|null,device:Device)=>start(file,'transcribe',model,language,device),
   extractWaveform:(file:File)=>start(file,'waveform','',null,'auto'),
   stop,
 };
}
