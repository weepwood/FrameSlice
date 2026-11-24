<script setup lang="ts">
import {computed,ref,onBeforeUnmount} from 'vue'
import {chooseFolder} from '../lib/storage'
import {runBatch} from '../core/batch'
import {loadBatch,saveBatch,clearBatch} from '../core/batch-journal'
import type {BatchJournal} from '../core/batch-journal'
import type {BatchResult} from '../core/batch'
import type {MediaJob} from '../core/workspace'
import {humanBytes} from '../lib/format'
const props=defineProps<{jobs:MediaJob[];labels:Record<string,string>;states:Record<string,string>}>()
const emit=defineEmits<{retry:[MediaJob];clear:[]}>()
const filter=ref('all'),search=ref(''),group=ref(false)
const batchFiles=ref<File[]>([]),batchMode=ref<'split'|'frames'>('split'),batchSize=ref(4),batchInterval=ref(30),batchRows=ref<BatchResult[]>([]),batchBusy=ref(false),batchError=ref('')
let batchController:AbortController|null=null
const recoveredBatch=ref<BatchJournal|null>(loadBatch())
let lastPersist=0
function persistBatch(j:BatchJournal,force=false){if(!force&&Date.now()-lastPersist<500)return;lastPersist=Date.now();try{saveBatch({...j,rows:j.rows.map(r=>({...r})),updatedAt:Date.now()})}catch{batchError.value='批量历史持久化失败'}}
function discardBatch(){try{clearBatch()}catch{}recoveredBatch.value=null}
if(recoveredBatch.value){batchRows.value=recoveredBatch.value.rows;batchMode.value=recoveredBatch.value.settings.mode;batchSize.value=recoveredBatch.value.settings.maxBytes/1e9;batchInterval.value=recoveredBatch.value.settings.interval}
function selectBatch(e:Event){const el=e.target as HTMLInputElement;batchFiles.value=Array.from(el.files??[]).slice(0,50);el.value='';batchRows.value=[]}
async function startBatch(){if(batchBusy.value||!batchFiles.value.length)return;batchBusy.value=true;batchError.value='';const ctl=new AbortController();batchController=ctl;try{const folder=await chooseFolder();const settings={mode:batchMode.value,maxBytes:Math.floor(batchSize.value*1e9),interval:batchInterval.value};const files=[...batchFiles.value];batchRows.value=files.map(f=>({name:f.name,status:'waiting',detail:'等待处理'}));const journal:BatchJournal={id:crypto.randomUUID(),settings,files:files.map(f=>({name:f.name,bytes:f.size,lastModified:f.lastModified})),rows:batchRows.value,updatedAt:Date.now()};recoveredBatch.value=journal;persistBatch(journal,true);await runBatch(files,folder,settings,ctl.signal,(i,row)=>{batchRows.value[i]=row;persistBatch(journal,row.status!=='running')});persistBatch(journal,true)}catch(e){batchError.value=e instanceof Error?e.message:String(e)}finally{batchBusy.value=false;batchController=null}}
onBeforeUnmount(()=>batchController?.abort())
const active=(j:MediaJob)=>['queued','running','canceling'].includes(j.status)
const failed=(j:MediaJob)=>['failed','canceled','interrupted','partial'].includes(j.status)
const filtered=computed(()=>props.jobs.filter(j=>(filter.value==='all'||filter.value==='active'&&active(j)||filter.value==='failed'&&failed(j)||filter.value==='completed'&&j.status==='completed')&&j.asset.name.toLowerCase().includes(search.value.toLowerCase())))
const groups=computed(()=>{const map=new Map<string,MediaJob[]>();for(const j of filtered.value){const key=group.value?j.asset.name:'全部任务';const items=map.get(key)??[];items.push(j);map.set(key,items)}return Array.from(map.entries())})
function exportReport(){const url=URL.createObjectURL(new Blob([JSON.stringify(filtered.value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='frameslice-job-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
</script>
<template><div class="content fs-job-center"><div class="page-head"><div class="eyebrow">MEDIA WORKSPACE / 04</div><h1>任务中心<span class="heading-period">.</span></h1><p>统一查看本地任务状态、输出检查点与失败原因。</p></div>
 <div class="fs-center-metrics"><button class="secondary-button" @click="filter='all'">全部 {{jobs.length}}</button><button class="secondary-button" @click="filter='active'">进行中 {{jobs.filter(active).length}}</button><button class="secondary-button" @click="filter='failed'">需处理 {{jobs.filter(failed).length}}</button><button class="secondary-button" @click="filter='completed'">完成 {{jobs.filter(j=>j.status==='completed').length}}</button></div>
 <div class="fs-center-toolbar"><input v-model="search" placeholder="搜索媒体名称" aria-label="搜索任务"/><label><input type="checkbox" v-model="group"/> 按媒体分组</label><button class="secondary-button" @click="exportReport">导出历史 JSON</button><button class="secondary-button" @click="emit('clear')">清除结束记录</button></div>
 <section class="fs-analysis fs-batch"><h3>批量媒体处理</h3><p v-if="recoveredBatch&&!batchBusy" class="fs-analysis-disclaimer">保留上次批次参数及结果；重新选择需处理的源文件并授权新目录，不会自动跳过或覆盖旧文件。<button class="secondary-button" @click="discardBatch">清除批次历史</button></p><p class="fs-analysis-disclaimer">选择最多 50 个视频，按同一规则顺序处理。每个文件单独导出，失败不阻塞后续文件。</p><div class="fs-center-toolbar"><label class="secondary-button">选择视频<input type="file" multiple accept="video/*,.mp4,.mov,.mkv,.webm" aria-label="批量媒体文件" :disabled="batchBusy" @change="selectBatch"/></label><span>{{batchFiles.length}} 个文件</span><select v-model="batchMode" :disabled="batchBusy" aria-label="批处理方式"><option value="split">无损分割</option><option value="frames">定时抽帧</option></select><label v-if="batchMode==='split'">大小 GB <input v-model.number="batchSize" type="number" min=".032" step=".1" :disabled="batchBusy"/></label><label v-else>间隔秒 <input v-model.number="batchInterval" type="number" min=".1" :disabled="batchBusy"/></label><button v-if="!batchBusy" class="secondary-button" :disabled="!batchFiles.length" @click="startBatch">选择目录并开始批处理</button><button v-else class="secondary-button" @click="batchController?.abort()">取消批处理</button></div><p v-if="batchError" class="fs-analysis-warning">{{batchError}}</p><div v-for="(row,i) in batchRows" :key="i" class="fs-job-row"><strong>{{row.name}} · {{row.status}}</strong><small>{{row.detail}}</small></div></section>
 <p v-if="!filtered.length" class="fs-analysis-disclaimer">暂无符合条件的任务</p>
 <section v-for="[name,items] in groups" :key="name" class="fs-analysis"><h3>{{name}}</h3><article v-for="j in items" :key="j.id" class="fs-center-job"><div><strong>{{labels[j.type]}} · {{states[j.status]}}</strong><small>{{j.asset.name}} · {{humanBytes(j.asset.bytes)}}</small><small>{{j.label}} · {{new Date(j.createdAt).toLocaleString()}}</small><small v-if="j.checkpoint">已确认 {{j.checkpoint.count}} 个输出 · {{j.checkpoint.lastOutput}}</small><p v-if="j.error" class="fs-analysis-warning">{{j.error.code}}：{{j.error.message}}</p></div><div><progress :value="j.progress" max="1"/><small>{{Math.round(j.progress*100)}}%</small><button v-if="j.retry&&(failed(j)||!!j.retry.resumeId)" class="secondary-button" @click="emit('retry',j)">重新关联并重试</button></div></article></section>
 </div></template>
