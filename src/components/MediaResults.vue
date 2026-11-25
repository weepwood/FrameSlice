<script setup lang="ts">
import WorkbenchPagination from './WorkbenchPagination.vue'
import {computed,ref,watch,nextTick} from 'vue'
import {FileVideo,Check,ArrowDownToLine,ChevronLeft,ChevronRight,Maximize2,X,Grid2X2,Grid3X3,Image as ImageIcon} from 'lucide-vue-next'
import {DialogRoot,DialogPortal,DialogOverlay,DialogContent,DialogTitle,DialogDescription,DialogClose,ToggleGroupRoot,ToggleGroupItem} from 'reka-ui'
import {humanTime,humanBytes} from '../lib/format'
import type {SplitResult} from '../lib/split'
import type {FramePreview} from '../lib/frames'
const props=defineProps<{parts:SplitResult[];frames:FramePreview[]}>()
const emit=defineEmits<{save:[FramePreview]}>()
const density=ref<'compact'|'large'>('compact'),open=ref(false),selectedName=ref('')
const partPage=ref(0),partQuery=ref('')
const partPageSize=50
const matchingParts=computed(()=>{const term=partQuery.value.trim().toLocaleLowerCase();return props.parts.filter(p=>p.filename.toLocaleLowerCase().includes(term))})
const partBytes=computed(()=>props.parts.reduce((total,p)=>total+p.size,0))
const partPageCount=computed(()=>Math.max(1,Math.ceil(matchingParts.value.length/partPageSize)))
const visibleParts=computed(()=>matchingParts.value.slice(partPage.value*partPageSize,(partPage.value+1)*partPageSize))
watch(()=>props.parts,()=>{partPage.value=0;partQuery.value=''})
watch(partQuery,()=>{partPage.value=0})
watch(partPageCount,n=>{partPage.value=Math.min(partPage.value,n-1)})
const selectedIndex=computed(()=>props.frames.findIndex(item=>item.name===selectedName.value))
const selected=computed(()=>props.frames[selectedIndex.value])
let opener:HTMLElement|null=null
function show(item:FramePreview,event:MouseEvent){opener=event.currentTarget as HTMLElement;selectedName.value=item.name;open.value=true}
function keepGalleryFocus(){const previous=document.activeElement;void nextTick(()=>{if(!open.value)return;const dialog=document.querySelector<HTMLElement>('.fs-gallery-dialog');if(dialog&&(document.activeElement===document.body||previous instanceof HTMLButtonElement&&previous.disabled&&document.activeElement===previous))dialog.focus()})}
function move(delta:number){const item=props.frames[selectedIndex.value+delta];if(item){selectedName.value=item.name;keepGalleryFocus()}}
function keydown(event:KeyboardEvent){if(event.altKey||event.ctrlKey||event.metaKey)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1)}else if(event.key==='Home'||event.key==='End'){event.preventDefault();const item=props.frames[event.key==='Home'?0:props.frames.length-1];if(item){selectedName.value=item.name;keepGalleryFocus()}}}
function restoreFocus(event:Event){event.preventDefault();void nextTick(()=>{if(opener?.isConnected)opener.focus();else document.querySelector<HTMLElement>('.frame-gallery .frame-preview-button')?.focus();opener=null})}
watch(selected, item=>{if(!item&&open.value)open.value=false})
</script>
<template>
<section v-if="parts.length" class="fs-part-results" aria-label="分割结果"><header class="fs-result-toolbar"><div><strong>分割结果 · {{parts.length}} 个片段</strong><small>共 {{humanBytes(partBytes)}} · 已校验输出</small></div><input v-if="parts.length>5||partQuery" v-model="partQuery" type="search" aria-label="搜索分割结果" placeholder="搜索片段名称"/></header><WorkbenchPagination :page="partPage" :pages="partPageCount" :total="matchingParts.length" label="分割结果分页" unit="个片段" @change="partPage=$event"/><p v-if="!matchingParts.length" class="fs-analysis-disclaimer">没有匹配的片段</p><div class="result-list"><div v-for="item in visibleParts" :key="item.filename" class="result-item"><div class="result-file-icon"><FileVideo :size="18"/></div><div class="result-file-name"><strong>{{ item.filename }}</strong><span>{{ humanTime(item.start) }} — {{ humanTime(item.end) }} · {{ item.verification.level === 'deep' ? '逐包 CRC32 已校验' : 'MP4 结构已校验' }}</span></div><span class="result-size">{{ humanBytes(item.size) }}</span><Check :size="17" class="result-check"/></div></div></section>
<section v-if="frames.length" class="fs-frame-results" aria-label="抽帧预览">
  <header class="fs-gallery-header">
    <div><strong><ImageIcon :size="16"/> 抽帧预览 <span class="fs-gallery-count">{{frames.length}}</span></strong><small>仅显示最近预览</small></div>
    <ToggleGroupRoot type="single" :model-value="density" aria-label="画廊布局" class="fs-gallery-density" @update:model-value="v=>{if(v==='compact'||v==='large')density=v}">
      <ToggleGroupItem value="compact" aria-label="紧凑网格"><Grid3X3 :size="16"/></ToggleGroupItem>
      <ToggleGroupItem value="large" aria-label="大图网格"><Grid2X2 :size="16"/></ToggleGroupItem>
    </ToggleGroupRoot>
  </header>
  <div class="frame-gallery" :class="'density-'+density"><article v-for="item in frames" :key="item.name" class="frame-tile">
    <button type="button" class="frame-preview-button" :aria-label="'预览 '+item.name" @click="show(item,$event)"><img :src="item.url" :alt="`截图 ${humanTime(item.timestamp)}`" loading="lazy"/><span class="fs-gallery-expand"><Maximize2 :size="14"/></span></button>
    <div class="frame-caption"><span>{{humanTime(item.timestamp)}}<small v-if="item.sharpness!==undefined"> · Q {{item.sharpness.toFixed(1)}}</small></span><button v-if="item.blob" class="frame-download" type="button" :title="`下载 ${item.name}`" :aria-label="`下载 ${item.name}`" @click="emit('save',item)"><ArrowDownToLine :size="15"/></button><span v-else class="fs-gallery-saved" title="已保存至输出目录"><Check :size="14" class="frame-saved"/></span></div>
  </article></div>
  <DialogRoot v-model:open="open"><DialogPortal><DialogOverlay class="fs-dialog-overlay fs-gallery-overlay"/><DialogContent class="fs-dialog-content fs-gallery-dialog" @keydown="keydown" @close-auto-focus="restoreFocus">
    <template v-if="selected"><div class="fs-gallery-dialog-header"><div><DialogTitle>{{selected.name}}</DialogTitle><DialogDescription>{{humanTime(selected.timestamp)}} · {{selectedIndex+1}} / {{frames.length}} · {{selected.blob?'可下载':'已保存至输出目录'}}</DialogDescription></div><DialogClose as-child><button class="fs-gallery-icon" type="button" aria-label="关闭预览"><X :size="20"/></button></DialogClose></div>
    <div class="fs-gallery-viewer"><img :src="selected.url" :alt="'完整截图 '+humanTime(selected.timestamp)"/></div>
    <div class="fs-gallery-dialog-footer"><div><button class="fs-gallery-icon" type="button" aria-label="上一张" :disabled="selectedIndex<=0" @click="move(-1)"><ChevronLeft :size="20"/></button><span>{{selectedIndex+1}} / {{frames.length}}</span><button class="fs-gallery-icon" type="button" aria-label="下一张" :disabled="selectedIndex>=frames.length-1" @click="move(1)"><ChevronRight :size="20"/></button></div><small>← → 切换 · Home / End 首尾 · Esc 关闭</small><button v-if="selected.blob" class="secondary-button" type="button" @click="emit('save',selected)"><ArrowDownToLine :size="15"/> 下载图片</button><span v-else class="fs-gallery-saved"><Check :size="16"/> 已保存</span></div></template>
  </DialogContent></DialogPortal></DialogRoot>
</section>
</template>
