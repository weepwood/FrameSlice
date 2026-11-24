import {workspace} from './workspace'
import {sampleFingerprint} from './source-identity'
import {inspectWithWorker,runWorkerJob} from '../lib/worker-client'
import type {WorkerPayload} from '../lib/worker-client'
import {baseName,checkCanceled} from '../lib/format'
import {createExportManifest} from '../lib/manifest.mjs'
import {saveBlob} from '../lib/storage'
import type {SplitResult} from '../lib/split'
import type {RetryParameters} from './workspace'
export interface BatchSettings {mode:'split'|'frames';maxBytes:number;interval:number}
export interface BatchResult {name:string;status:'waiting'|'running'|'interrupted'|'completed'|'partial'|'failed'|'canceled';detail:string}
export async function runBatch(files:File[],folder:FileSystemDirectoryHandle,settings:BatchSettings,signal:AbortSignal,update:(i:number,item:BatchResult)=>void){
 if(settings.mode==='split'&&(!Number.isSafeInteger(settings.maxBytes)||settings.maxBytes<32*1024*1024)||settings.mode==='frames'&&(!Number.isFinite(settings.interval)||settings.interval<.1))throw Error('批量参数无效')
 if(files.length<1||files.length>50)throw Error('每批支持 1–50 个媒体文件')
 for(let i=0;i<files.length;i++){
  const file=files[i];const send=(status:BatchResult['status'],detail:string)=>update(i,{name:file.name,status,detail})
  if(signal.aborted){send('canceled','未启动');continue}
  send('running','读取媒体信息')
  try{
   const source=await workspace.run('inspect',file,signal,()=>inspectWithWorker(file,signal))
   checkCanceled(signal)
   const dir=await folder.getDirectoryHandle(baseName(file.name)+'_batch_'+crypto.randomUUID(),{create:true})
   const params:RetryParameters=settings.mode==='split'?{mode:'split',maxBytes:settings.maxBytes,verificationLevel:'quick'}:{mode:'frames',interval:settings.interval,startTime:0,endTime:source.duration,format:'image/jpeg',width:1920,quality:.9,strategy:'interval',deduplicate:false}
   const payload:WorkerPayload=params.mode==='split'?{...params,file,folder:dir}:{...params,file,folder:dir,duration:source.duration}
   const fingerprint=await sampleFingerprint(file)
   const parts:SplitResult[]=[],images:string[]=[],missed:number[]=[]
   const result=await workspace.run(settings.mode,file,signal,async ctx=>{
    const result=await runWorkerJob(payload,signal,{onProgress:(p,l)=>{ctx.progress(p,l);send('running',l)},onSegment:part=>{parts.push(part);ctx.checkpoint(part.filename)},onSaved:name=>{images.push(name);ctx.checkpoint(name)},onMissed:t=>missed.push(t),onPreview:()=>{}})
    if(missed.length)ctx.partial('抽帧存在遗漏')
    return result
   },{fingerprint,parameters:params})
   const manifest=createExportManifest({source,mode:settings.mode,settings:{...settings},parts,images,completedFrames:settings.mode==='frames'?result.count:0,missedFrames:missed,elapsedMs:result.elapsedMs})
   try{await saveBlob(dir,'frameslice-report.json',new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}),new AbortController().signal);send(missed.length?'partial':'completed',result.count+' 个输出 · '+dir.name)}
   catch{send('partial','媒体已完成，报告保存失败')}
  }catch(e){send(signal.aborted?'canceled':'failed',e instanceof Error?e.message:String(e))}
 }
}
