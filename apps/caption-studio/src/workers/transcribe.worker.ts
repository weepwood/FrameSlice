/// <reference lib="webworker" />
import {pipeline,WhisperTextStreamer,type AutomaticSpeechRecognitionPipeline,type ProgressInfo,type WhisperTokenizer} from '@huggingface/transformers';
import {ALL_FORMATS,AudioSampleSink,BlobSource,Input} from 'mediabunny';
import type {Chunk} from '../lib/captions';
import {keepWindowChunk,MonoResampler,PeakCollector,WindowCollector,type AudioWindow} from '../lib/streaming-audio';

export type Device='auto'|'webgpu'|'wasm';
export type WorkerRequest={type:'transcribe'|'waveform';jobId:number;file:File;model:string;language:string|null;device:Device};
export type WorkerResponse=
 | {type:'loading';jobId:number;progress:number;loaded:number;total:number}
 | {type:'ready';jobId:number;device:'webgpu'|'wasm'}
 | {type:'progress';jobId:number;stage:'extracting'|'transcribing';processed:number;total:number;segments:number}
 | {type:'peaks';jobId:number;peaks:number[]}
 | {type:'partial';jobId:number;text:string}
 | {type:'segments';jobId:number;chunks:Chunk[]}
 | {type:'done';jobId:number;seconds:number;device:string;segments:number}
 | {type:'error';jobId:number;message:string};
const emit=(msg:WorkerResponse)=>self.postMessage(msg);
let cache:{model:string;device:'webgpu'|'wasm';asr:AutomaticSpeechRecognitionPipeline}|null=null;
async function canWebGPU(){
 try{const gpu=(navigator as Navigator & {gpu?:{requestAdapter():Promise<unknown>}}).gpu;return Boolean(gpu&&await gpu.requestAdapter())}
 catch{return false}
}
async function getModel(req:WorkerRequest){
 const requested=req.device==='auto'?(await canWebGPU()?'webgpu':'wasm'):req.device;
 if(cache?.model===req.model&&cache.device===requested)return cache;
 await cache?.asr.dispose();cache=null;
 const load=async(device:'webgpu'|'wasm')=>{
   const asr=await pipeline('automatic-speech-recognition',req.model,{
     device,
     dtype:device==='webgpu'?{encoder_model:'fp32',decoder_model_merged:'q4'}:'q8',
     progress_callback:(p:ProgressInfo)=>{
       if(p.status==='progress_total')emit({type:'loading',jobId:req.jobId,progress:p.progress,loaded:p.loaded,total:p.total});
     }
   }) as AutomaticSpeechRecognitionPipeline;
   cache={model:req.model,device,asr};return cache;
 };
 try{return await load(requested)}
 catch(error){if(req.device==='auto'&&requested==='webgpu')return await load('wasm');throw error}
}
async function transcribeWindow(req:WorkerRequest,window:AudioWindow,asr:AutomaticSpeechRecognitionPipeline):Promise<Chunk[]>{
 let partial='';
 const streamer=new WhisperTextStreamer(asr.tokenizer as WhisperTokenizer,{
   skip_prompt:true,callback_function:(str:string)=>{
     partial+=str;emit({type:'partial',jobId:req.jobId,text:partial.slice(-400)});
   }
 });
 const output=await asr(window.audio,{
   return_timestamps:true,chunk_length_s:30,stride_length_s:0,
   ...(req.model.endsWith('.en')?{}:{language:req.language??undefined,task:'transcribe'}),
   streamer
 });
 const result=Array.isArray(output)?output[0]:output;
 return ((result.chunks??[]) as Chunk[]).flatMap(c=>{
   const start=window.start+c.timestamp[0];
   const end=window.start+(c.timestamp[1]??Math.min(c.timestamp[0]+2,window.audio.length/16000));
   if(!c.text.trim()||!Number.isFinite(start)||!Number.isFinite(end))return [];
   if(!keepWindowChunk(start,end,window.start,window.last))return [];
   return [{text:c.text,timestamp:[Math.max(0,start),Math.min(window.end,Math.max(start+.01,end))] as [number,number]}];
 });
}
async function execute(req:WorkerRequest){
 const started=performance.now();
 const input=new Input({source:new BlobSource(req.file),formats:ALL_FORMATS});
 try{
   const track=await input.getPrimaryAudioTrack();
   if(!track)throw Error('视频中未找到音轨，无法进行语音识别。');
   if(!await track.canDecode())throw Error('当前浏览器无法解码该音轨。建议使用最新版 Chrome/Edge，或先转成 AAC/MP3/Opus。');
   const duration=await track.computeDuration();
   if(!Number.isFinite(duration)||duration<0||duration>86400)throw Error('无法读取音频时长，或超过 24 小时的安全处理上限。');
   const peaks=new PeakCollector(duration),resampler=new MonoResampler(),collector=new WindowCollector();
   let asr:AutomaticSpeechRecognitionPipeline|null=null,device='none',segments=0,elapsed=0,lastUpdate=0;
   if(req.type==='transcribe'){
     const loaded=await getModel(req);asr=loaded.asr;device=loaded.device;
     emit({type:'ready',jobId:req.jobId,device:loaded.device});
   }
   const processWindow=async(window:AudioWindow)=>{
     if(!asr)return;
     emit({type:'progress',jobId:req.jobId,stage:'transcribing',processed:window.start,total:duration,segments});
     const chunks=await transcribeWindow(req,window,asr);
     if(chunks.length)emit({type:'segments',jobId:req.jobId,chunks});
     segments++;
     emit({type:'progress',jobId:req.jobId,stage:'transcribing',processed:window.last?duration:Math.min(duration,window.start+29),total:duration,segments});
   };
   // BlobSource performs byte-range reads, never file.arrayBuffer() on the whole video.
   const sink=new AudioSampleSink(track);
   let pending:AudioWindow|null=null;
   for await(const sample of sink.samples()){
     let data:Float32Array;
     try{
       const channels:Float32Array[]=[];
       for(let ch=0;ch<sample.numberOfChannels;ch++){
         const plane=new Float32Array(sample.numberOfFrames);
         sample.copyTo(plane,{planeIndex:ch,format:'f32-planar'});
         channels.push(plane);
       }
       data=resampler.convert(sample.timestamp,sample.sampleRate,channels);
       elapsed=Math.max(elapsed,sample.timestamp+sample.duration);
     }finally{sample.close()}
     peaks.add(data);
     if(req.type==='transcribe'){
       for(const window of collector.push(data)){
         if(pending)await processWindow(pending);
         pending=window;
       }
     }
     if(elapsed-lastUpdate>=5){
       lastUpdate=elapsed;
       emit({type:'peaks',jobId:req.jobId,peaks:peaks.values()});
       emit({type:'progress',jobId:req.jobId,stage:'extracting',processed:Math.min(elapsed,duration),total:duration,segments});
     }
   }
   if(req.type==='transcribe'){
     const final=collector.finish();
     if(final){if(pending)await processWindow(pending);await processWindow(final)}
     else if(pending)await processWindow({...pending,last:true});
   }
   emit({type:'peaks',jobId:req.jobId,peaks:peaks.values()});
   emit({type:'done',jobId:req.jobId,seconds:(performance.now()-started)/1000,device,segments});
 }finally{input.dispose()}
}
self.onmessage=async(event:MessageEvent<WorkerRequest>)=>{
 const req=event.data;
 try{await execute(req)}
 catch(err){const msg=err instanceof Error?err.message:String(err);emit({type:'error',jobId:req.jobId,message:'自动提取音轨或转录失败：'+msg})}
};
