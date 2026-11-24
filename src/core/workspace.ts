import { JobJournal } from './job-journal'
/** Framework-neutral shared runtime. Separate Vue/React bundles use the same per-page instance. */
export type JobType = 'inspect' | 'analyze' | 'split' | 'frames' | 'container-scan' | 'extract-tracks' | 'remux' | 'waveform' | 'transcribe' | 'burn'
export type JobStatus = 'queued' | 'running' | 'canceling' | 'completed' | 'partial' | 'failed' | 'canceled' | 'interrupted'
export interface JobError { code: 'aborted' | 'permission' | 'quota' | 'unsupported' | 'engine'; message: string }
export interface MediaAsset { id: string; name: string; bytes: number; lastModified: number; mime: string }
export type RetryParameters = {mode:'split';maxBytes:number;maxSeconds?:number;verificationLevel:'quick'|'deep'} | {mode:'frames';interval:number;startTime:number;endTime:number;format:'image/jpeg'|'image/png'|'image/webp';width:0|1280|1920|3840;quality:number}
export interface RetrySpec { fingerprint:string; parameters:RetryParameters; resumeId?:string }
export interface MediaJob {
  id: string; type: JobType; asset: MediaAsset; status: JobStatus; progress: number; label: string
  createdAt: number; startedAt?: number; endedAt?: number; error?: JobError
  checkpoint?: { count: number; lastOutput: string; updatedAt: number }
  retry?: RetrySpec
}
export interface JobContext { progress(value: number, label?: string): void; checkpoint(output: string): void; partial(label:string):void }
const active = (status: JobStatus) => status === 'queued' || status === 'running' || status === 'canceling'
const abortError = () => new DOMException('任务已取消', 'AbortError')
function classify(error: unknown): JobError {
  const name = error instanceof Error ? error.name : ''
  return { code: name === 'AbortError' ? 'aborted' : name === 'NotAllowedError' || name === 'SecurityError' ? 'permission' : name === 'QuotaExceededError' ? 'quota' : name === 'NotSupportedError' ? 'unsupported' : 'engine', message: (error instanceof Error ? error.message : String(error)).slice(0, 600) }
}
interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const HISTORY_KEY = 'frameslice.jobs.v1'
export class WorkspaceRuntime {
  private assets = new WeakMap<File, MediaAsset>()
  private metadata = new WeakMap<File, Map<string, unknown>>()
  private jobs: MediaJob[] = []
  private listeners = new Set<(jobs: MediaJob[]) => void>()
  private queue: Array<() => void> = []
  private running = false
  private journalRevision=0
  private journalTimestamp=0
  private journal?:JobJournal
  constructor(private storage?: StoragePort, journal?:JobJournal) {
    this.journal=journal
    try {
      this.journalTimestamp=Number(storage?.getItem(HISTORY_KEY+'.timestamp')??0)||0
      const saved: unknown = JSON.parse(storage?.getItem(HISTORY_KEY) ?? '[]')
      if (Array.isArray(saved)) this.jobs = saved.filter(j => j && typeof j.id === 'string' && typeof j.asset?.name === 'string' && typeof j.status === 'string').slice(0, 100).map(j => active(j.status) ? {...j, status:'interrupted', endedAt:Date.now(), label:'上次页面关闭时任务未完成'} : j)
    } catch { /* storage is optional */ }
    if(journal){
      const revision=this.journalRevision
      void journal.read().then(snapshot=>{
        if(revision!==this.journalRevision)return
        if(snapshot&&snapshot.updatedAt>this.journalTimestamp&&Array.isArray(snapshot.jobs)){
          this.jobs=(snapshot.jobs as MediaJob[]).filter(j=>j&&typeof j.id==='string'&&typeof j.asset?.name==='string'&&typeof j.status==='string').slice(0,100).map(j=>active(j.status)?{...j,status:'interrupted',endedAt:Date.now(),label:'上次任务未完成'}:j)
          this.journalTimestamp=snapshot.updatedAt
        }
        this.publish(true)
      }).catch(()=>{})
    }
  }
  asset(file: File): MediaAsset {
    let item = this.assets.get(file)
    if (!item) {
      item = {id:crypto.randomUUID(), name:file.name, bytes:file.size, lastModified:file.lastModified, mime:file.type}
      this.assets.set(file,item)
    }
    return {...item}
  }
  cached<T>(file: File, key: string): T | undefined { return this.metadata.get(file)?.get(key) as T | undefined }
  cache<T>(file: File, key: string, value: T): void {
    let map = this.metadata.get(file)
    if (!map) { map = new Map(); this.metadata.set(file,map) }
    map.set(key,value)
  }
  snapshot(): MediaJob[] { return this.jobs.map(job => ({...job, asset:{...job.asset}, error:job.error&&{...job.error}, checkpoint:job.checkpoint&&{...job.checkpoint},retry:job.retry&&{fingerprint:job.retry.fingerprint,resumeId:job.retry.resumeId,parameters:{...job.retry.parameters}}})) }
  subscribe(fn: (jobs: MediaJob[]) => void): () => void {
    this.listeners.add(fn); fn(this.snapshot())
    return () => { this.listeners.delete(fn) }
  }
  hasActive(): boolean { return this.jobs.some(job => active(job.status)) }
  clearHistory(): void { this.jobs = this.jobs.filter(job => active(job.status)); this.publish(true) }
  private persist(): void {
    this.journalRevision++;this.journalTimestamp=Math.max(Date.now(),this.journalTimestamp+1)
    const jobs=this.snapshot().slice(0,100)
    try { this.storage?.setItem(HISTORY_KEY,JSON.stringify(jobs));this.storage?.setItem(HISTORY_KEY+'.timestamp',String(this.journalTimestamp)) } catch { /* no media bytes or handles persisted */ }
    void this.journal?.write({updatedAt:this.journalTimestamp,jobs}).catch(()=>{})
  }
  private publish(persist = false): void {
    if (persist) this.persist()
    const jobs = this.snapshot()
    for (const fn of this.listeners) { try { fn(jobs) } catch { /* view errors cannot break execution */ } }
  }
  private drain(): void {
    if (this.running) return
    this.queue.shift()?.()
  }
  run<T>(type: JobType, file: File, signal: AbortSignal, work: (ctx: JobContext) => Promise<T>, retry?:RetrySpec): Promise<T> {
    if (signal.aborted) return Promise.reject(abortError())
    const job: MediaJob = {id:crypto.randomUUID(),type,asset:this.asset(file),status:'queued',progress:0,label:'等待资源',createdAt:Date.now(),retry}
    this.jobs.unshift(job)
    this.jobs = [...this.jobs.filter(j => active(j.status)), ...this.jobs.filter(j => !active(j.status)).slice(0,100)]
    return new Promise<T>((resolve,reject) => {
      let lastUpdate = 0, lastSave = 0, partialLabel = ''
      const finish = (status: JobStatus, error?: unknown) => {
        job.status=status;job.endedAt=Date.now();job.label=status==='partial'?partialLabel:status==='completed'?'已完成':status==='canceled'?'已取消':'处理失败'
        if(status==='completed')job.progress=1
        if(error!==undefined)job.error=classify(error)
        signal.removeEventListener('abort',onAbort);this.publish(true)
      }
      const onAbort = () => {
        if(job.status==='queued'){
          this.queue=this.queue.filter(fn=>fn!==execute);finish('canceled',abortError());reject(abortError());this.drain()
        } else if(job.status==='running'){job.status='canceling';job.label='正在取消';this.publish(true)}
      }
      const ctx: JobContext = {
        progress: (value,label) => {
          if(job.status!=='running'||!Number.isFinite(value))return
          job.progress=Math.max(job.progress,Math.max(0,Math.min(1,value)));if(label)job.label=label
          if(Date.now()-lastUpdate>=150){lastUpdate=Date.now();this.publish()}
        },
        partial:label=>{partialLabel=label},
        checkpoint: output => {
          if(job.status!=='running'&&job.status!=='canceling')return
          job.checkpoint={count:(job.checkpoint?.count??0)+1,lastOutput:output.slice(0,512),updatedAt:Date.now()}
          if(Date.now()-lastSave>=1000){lastSave=Date.now();this.publish(true)}
        }
      }
      const execute = () => {
        if(signal.aborted){finish('canceled',abortError());reject(abortError());this.drain();return}
        this.running=true;job.status='running';job.startedAt=Date.now();job.label='正在处理';this.publish(true)
        void (async()=>{
          try {
            const value=await work(ctx)
            if(signal.aborted)throw abortError()
            finish(partialLabel?'partial':'completed');resolve(value)
          } catch(error) {
            const canceled=signal.aborted||(error instanceof Error&&error.name==='AbortError')
            finish(canceled?'canceled':'failed',canceled?abortError():error);reject(canceled?abortError():error)
          } finally {this.running=false;this.drain()}
        })()
      }
      signal.addEventListener('abort',onAbort,{once:true})
      this.queue.push(execute);this.publish(true);this.drain()
    })
  }
}
const globalKey = Symbol.for('frameslice.workspace.v1')
const scope = globalThis as typeof globalThis & { [globalKey]?: WorkspaceRuntime }
function storage(): StoragePort | undefined { try { return typeof window !== 'undefined' ? window.localStorage : undefined } catch { return undefined } }
export const workspace = scope[globalKey] ??= new WorkspaceRuntime(storage(),typeof window!=='undefined'&&typeof indexedDB!=='undefined'?new JobJournal(indexedDB):undefined)
