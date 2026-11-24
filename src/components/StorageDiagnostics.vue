<script setup lang="ts">
import {ref,onMounted} from 'vue'
import {DialogRoot,DialogPortal,DialogOverlay,DialogContent,DialogTitle,DialogDescription,DialogClose} from 'reka-ui'
import {humanBytes} from '../lib/format'
import {workspace} from '../core/workspace'
import {clearWhisperCache,countWhisperCache} from '../lib/model-cache'
const props=defineProps<{busy:boolean}>()
const emit=defineEmits<{'clear-history':[]}>()
const usage=ref(0),quota=ref(0),persistent=ref(false),message=ref(''),cacheCount=ref(0),cacheAvailable=ref(typeof caches!=='undefined')
const open=ref(false),cleaning=ref(false),kind=ref<'cache'|'history'>('cache')
async function refresh(){try{const estimate=await navigator.storage.estimate();usage.value=estimate.usage??0;quota.value=estimate.quota??0;persistent.value=await navigator.storage.persisted()}catch{message.value='当前浏览器无法读取存储信息'}try{cacheCount.value=await countWhisperCache()}catch{cacheAvailable.value=false}}
async function persist(){try{persistent.value=await navigator.storage.persist();message.value=persistent.value?'已启用持久存储':'浏览器未授予持久存储'}catch{message.value='持久存储请求失败'}await refresh()}
function confirm(next:'cache'|'history'){kind.value=next;open.value=true}
async function clean(){if(cleaning.value||props.busy||workspace.hasActive())return;cleaning.value=true;try{if(kind.value==='cache'){const result=await clearWhisperCache();message.value='已清除 '+result+' 项模型缓存，下次转录可能需要重新下载。'}else{emit('clear-history');message.value='已请求清除结束任务记录；续作检查点和导出文件保留。'}open.value=false;await refresh()}catch(e){message.value='清理未完全完成：'+(e instanceof Error?e.message:String(e))}finally{cleaning.value=false}}
onMounted(refresh)
</script>
<template><section class="fs-analysis fs-storage-diagnostics">
<div class="fs-analysis-header"><strong>本地存储</strong><button type="button" class="secondary-button" :disabled="cleaning" @click="refresh">刷新</button></div>
<p class="fs-storage-values">站点存储 {{humanBytes(usage)}} / {{humanBytes(quota)}} · {{persistent?'持久存储':'可能被浏览器回收'}}</p><progress class="fs-storage-values" :value="usage" :max="Math.max(quota,1)"/>
<p class="fs-analysis-disclaimer">站点配额可能包含同域其他应用的数据，不代表磁盘剩余空间。</p>
<div class="fs-storage-row"><div><strong>语音模型缓存</strong><small>{{cacheAvailable?cacheCount+' 项可清理资源':'浏览器不支持或无法读取缓存'}} · 下次使用可能需要联网下载</small></div><button type="button" class="secondary-button fs-danger" :disabled="busy||cleaning||!cacheAvailable||!cacheCount" @click="confirm('cache')">清除模型缓存</button></div>
<div class="fs-storage-row"><div><strong>任务历史</strong><small>仅结束任务的记录，不删除续作检查点或文件</small></div><button type="button" class="secondary-button fs-danger" :disabled="busy||cleaning" @click="confirm('history')">清除本地任务记录</button></div>
<p class="fs-analysis-disclaimer">字幕工程可在字幕工作台导出备份后新建；清理不会删除字幕工程、导出文件、OPFS 输出或其他站点缓存。清理模型前请关闭其他正在转录的标签页。</p>
<button type="button" class="secondary-button" :disabled="persistent||cleaning" @click="persist">请求持久存储</button><p v-if="message" role="status">{{message}}</p>
<DialogRoot v-model:open="open"><DialogPortal><DialogOverlay class="fs-dialog-overlay"/><DialogContent class="fs-dialog-content"><DialogTitle>{{kind==='cache'?'清除语音模型缓存？':'清除已结束的任务记录？'}}</DialogTitle><DialogDescription>{{kind==='cache'?'仅删除已识别的 Whisper 模型下载资源；相同模型的其他同源应用可能需要重新下载。保留字幕工程和媒体。':'移除结束任务的历史记录，保留续作元数据、目录引用和输出文件。'}}</DialogDescription><div class="fs-dialog-actions"><DialogClose as-child><button class="secondary-button" :disabled="cleaning">取消</button></DialogClose><button class="secondary-button fs-danger" :disabled="busy||cleaning" @click="clean">{{cleaning?'清理中…':'确认清理'}}</button></div></DialogContent></DialogPortal></DialogRoot></section></template>
