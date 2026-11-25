import {ref,type Ref} from 'vue'
import type {FramePreview,FrameSnapshot} from '../lib/frames'
import {runWorkerJob} from '../lib/worker-client'
import {workspace} from '../core/workspace'
type SourceInfo={duration:number}
export function useTimelinePreviews(file:Ref<File|null>,info:Ref<SourceInfo|null>,onError:(error:unknown)=>void){
  const thumbnails=ref<FramePreview[]>([])
  const loading=ref(false)
  const cache=new Map<string,FramePreview[]>()
  let controller:AbortController|null=null
  let pending:FramePreview[]|null=null
  const release=(rows:FramePreview[])=>{for(const row of rows)URL.revokeObjectURL(row.url);rows.length=0}
  function clear(){
    controller?.abort();controller=null;loading.value=false
    if(pending)release(pending)
    pending=null
    for(const rows of cache.values())release(rows)
    cache.clear();thumbnails.value=[]
  }
  async function load(start=0,end=info.value?.duration??0,level=1){
    const source=file.value,duration=info.value?.duration
    if(!source||!duration||loading.value||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return
    const key=JSON.stringify([start,end,level])
    const hit=cache.get(key)
    if(hit){cache.delete(key);cache.set(key,hit);thumbnails.value=[...hit];return}
    const ctl=new AbortController(),rows:FramePreview[]=[]
    controller=ctl;pending=rows;loading.value=true;thumbnails.value=[]
    const current=()=>controller===ctl&&!ctl.signal.aborted&&file.value===source
    const add=(snapshot:FrameSnapshot)=>{
      if(!current())return
      rows.push({name:snapshot.name,timestamp:snapshot.timestamp,url:URL.createObjectURL(snapshot.blob)})
      thumbnails.value=[...rows]
    }
    let committed=false
    try{
      await workspace.run('frames',source,ctl.signal,ctx=>runWorkerJob({
        mode:'frames',file:source,folder:null,duration,interval:Math.max(.1,(end-start)/12),startTime:start,endTime:end,format:'image/jpeg',width:1280,quality:.5
      },ctl.signal,{onProgress:(p,l)=>ctx.progress(p,l),onSegment:()=>{},onPreview:add}))
      if(current()){
        cache.set(key,rows);committed=true
        while(cache.size>6){const first=cache.keys().next().value!;release(cache.get(first)!);cache.delete(first)}
      }
    }catch(e){if(current())onError(e)}
    finally{
      if(!committed)release(rows)
      if(controller===ctl){controller=null;pending=null;loading.value=false;if(!committed)thumbnails.value=[]}
    }
  }
  return {thumbnails,loading,clear,load}
}
