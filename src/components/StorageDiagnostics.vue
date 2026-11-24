<script setup lang="ts">
import {ref,onMounted} from 'vue'
import {DialogRoot,DialogPortal,DialogOverlay,DialogContent,DialogTitle,DialogDescription,DialogClose} from 'reka-ui'
import WorkbenchProgress from './WorkbenchProgress.vue'
import {humanBytes} from '../lib/format'
import {workspace} from '../core/workspace'
import {clearWhisperCache,countWhisperCache} from '../lib/model-cache'
import {consumeResetResult,requestStorageReset} from '../lib/reset-storage'
const props=defineProps<{busy:boolean}>()
const emit=defineEmits<{'clear-history':[]}>()
const usage=ref(0),quota=ref(0),persistent=ref(false),message=ref(consumeResetResult()),cacheCount=ref(0),cacheAvailable=ref(typeof caches!=='undefined')
const open=ref(false),cleaning=ref(false),kind=ref<'cache'|'history'|'all'>('cache')
async function refresh(){try{const estimate=await navigator.storage.estimate();usage.value=estimate.usage??0;quota.value=estimate.quota??0;persistent.value=await navigator.storage.persisted()}catch{message.value='当前浏览器无法读取存储信息'}try{cacheCount.value=await countWhisperCache()}catch{cacheAvailable.value=false}}
async function persist(){try{persistent.value=await navigator.storage.persist();message.value=persistent.value?'已启用持久存储':'浏览器未授予持久存储'}catch{message.value='持久存储请求失败'}await refresh()}
function confirm(next:'cache'|'history'|'all'){kind.value=next;message.value='';open.value=true}
async function clean(){if(cleaning.value||props.busy||workspace.hasActive())return;cleaning.value=true;try{if(kind.value==='all'){await requestStorageReset();return}if(kind.value==='cache'){const result=await clearWhisperCache();message.value='已清除 '+result+' 项模型缓存，下次转录可能需要重新下载。'}else{emit('clear-history');message.value='已请求清除结束任务记录；续作检查点和导出文件保留。'}open.value=false;await refresh()}catch(e){message.value='清理未完全完成：'+(e instanceof Error?e.message:String(e))}finally{cleaning.value=false}}
onMounted(refresh)
</script>
<template><section class="fs-analysis fs-storage-diagnostics">
<div class="fs-analysis-header"><strong>本地存储</strong><div class="fs-inline-field"><button type="button" class="secondary-button" :disabled="cleaning" @click="refresh">刷新</button><button type="button" class="secondary-button fs-danger" :disabled="busy||cleaning" @click="confirm('all')">清除本地存储</button></div></div>
<div class="fs-storage-summary"><span class="fs-storage-label" title="浏览器同源站点配额，不代表磁盘剩余空间">站点配额</span><span class="fs-storage-values"><strong>{{humanBytes(usage)}}</strong> / {{quota>0?humanBytes(quota):'未知'}}</span></div>
<WorkbenchProgress class="fs-storage-meter fs-storage-values" :value="quota>0?usage:null" :max="Math.max(quota,1)" label="站点存储使用量" :value-text="quota>0?humanBytes(usage)+' / '+humanBytes(quota):'配额未知'"/>
<div class="fs-storage-row"><div><strong>语音模型缓存</strong><small>{{cacheAvailable?cacheCount+' 项':'不可读取'}}</small></div><button type="button" class="secondary-button" :disabled="busy||cleaning||!cacheAvailable||!cacheCount" @click="confirm('cache')">清除模型缓存</button></div>
<div class="fs-storage-row"><div><strong>任务历史</strong><small>已结束任务</small></div><button type="button" class="secondary-button" :disabled="busy||cleaning" @click="confirm('history')">清除本地任务记录</button></div>
<div class="fs-storage-row"><div><strong>持久存储</strong><small>{{persistent?'已启用':'未启用'}}</small></div><button type="button" class="secondary-button" :disabled="persistent||cleaning" @click="persist">请求持久存储</button></div><p v-if="message&&!open" role="status" class="fs-storage-message">{{message}}</p>
<DialogRoot v-model:open="open"><DialogPortal><DialogOverlay class="fs-dialog-overlay"/><DialogContent class="fs-dialog-content"><DialogTitle>{{kind==='all'?'清除本地存储？':kind==='cache'?'清除语音模型缓存？':'清除已结束的任务记录？'}}</DialogTitle><DialogDescription>{{kind==='all'?'此操作不可撤销：删除本应用的模型缓存、任务历史、续作检查点、字幕草稿和设置，并重新加载页面。请先导出字幕工程、结束任务并关闭其他 FrameSlice 标签页。保留外部导出文件、OPFS 文件及无关应用数据；同源应用共用的 Whisper 模型可能需要重新下载。':kind==='cache'?'仅删除已识别的 Whisper 模型下载资源；相同模型的其他同源应用可能需要重新下载。保留字幕工程和媒体。':'移除结束任务的历史记录，保留续作元数据、目录引用和输出文件。'}}</DialogDescription><p v-if="message" role="alert">{{message}}</p><div class="fs-dialog-actions"><DialogClose as-child><button class="secondary-button" :disabled="cleaning">取消</button></DialogClose><button class="secondary-button fs-danger" :disabled="busy||cleaning" @click="clean">{{cleaning?'清理中…':'确认清理'}}</button></div></DialogContent></DialogPortal></DialogRoot></section></template>
