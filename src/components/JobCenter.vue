<script setup lang="ts">
import {computed,ref} from 'vue'
import type {MediaJob} from '../core/workspace'
import {humanBytes} from '../lib/format'
const props=defineProps<{jobs:MediaJob[];labels:Record<string,string>;states:Record<string,string>}>()
const emit=defineEmits<{retry:[MediaJob];clear:[]}>()
const filter=ref('all'),search=ref(''),group=ref(false)
const active=(j:MediaJob)=>['queued','running','canceling'].includes(j.status)
const failed=(j:MediaJob)=>['failed','canceled','interrupted','partial'].includes(j.status)
const filtered=computed(()=>props.jobs.filter(j=>(filter.value==='all'||filter.value==='active'&&active(j)||filter.value==='failed'&&failed(j)||filter.value==='completed'&&j.status==='completed')&&j.asset.name.toLowerCase().includes(search.value.toLowerCase())))
const groups=computed(()=>{const map=new Map<string,MediaJob[]>();for(const j of filtered.value){const key=group.value?j.asset.name:'全部任务';const items=map.get(key)??[];items.push(j);map.set(key,items)}return Array.from(map.entries())})
function exportReport(){const url=URL.createObjectURL(new Blob([JSON.stringify(filtered.value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='frameslice-job-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
</script>
<template><div class="content fs-job-center"><div class="page-head"><div class="eyebrow">MEDIA WORKSPACE / 04</div><h1>任务中心<span class="heading-period">.</span></h1><p>统一查看本地任务状态、输出检查点与失败原因。</p></div>
 <div class="fs-center-metrics"><button class="secondary-button" @click="filter='all'">全部 {{jobs.length}}</button><button class="secondary-button" @click="filter='active'">进行中 {{jobs.filter(active).length}}</button><button class="secondary-button" @click="filter='failed'">需处理 {{jobs.filter(failed).length}}</button><button class="secondary-button" @click="filter='completed'">完成 {{jobs.filter(j=>j.status==='completed').length}}</button></div>
 <div class="fs-center-toolbar"><input v-model="search" placeholder="搜索媒体名称" aria-label="搜索任务"/><label><input type="checkbox" v-model="group"/> 按媒体分组</label><button class="secondary-button" @click="exportReport">导出历史 JSON</button><button class="secondary-button" @click="emit('clear')">清除结束记录</button></div>
 <p v-if="!filtered.length" class="fs-analysis-disclaimer">暂无符合条件的任务</p>
 <section v-for="[name,items] in groups" :key="name" class="fs-analysis"><h3>{{name}}</h3><article v-for="j in items" :key="j.id" class="fs-center-job"><div><strong>{{labels[j.type]}} · {{states[j.status]}}</strong><small>{{j.asset.name}} · {{humanBytes(j.asset.bytes)}}</small><small>{{j.label}} · {{new Date(j.createdAt).toLocaleString()}}</small><small v-if="j.checkpoint">已确认 {{j.checkpoint.count}} 个输出 · {{j.checkpoint.lastOutput}}</small><p v-if="j.error" class="fs-analysis-warning">{{j.error.code}}：{{j.error.message}}</p></div><div><progress :value="j.progress" max="1"/><small>{{Math.round(j.progress*100)}}%</small><button v-if="j.retry&&failed(j)" class="secondary-button" @click="emit('retry',j)">重新关联并重试</button></div></article></section>
 </div></template>
