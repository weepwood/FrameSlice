<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {humanTime} from '../lib/format'
import type {FramePreview} from '../lib/frames'
const p=defineProps<{duration:number;time:number;thumbnails:FramePreview[];keys:number[];cuts:number[];disabled:boolean;loading:boolean;mode:'split'|'frames';start:number;end:number}>()
const emit=defineEmits<{seek:[number];load:[];range:[number,number];cut:[number];remove:[number]}>()
const zoom=ref(1),offset=ref(0),drag=ref<number|null>(null),dragEnd=ref<number|null>(null)
const span=computed(()=>p.duration/zoom.value)
const maxOffset=computed(()=>Math.max(0,p.duration-span.value))
watch(maxOffset,v=>offset.value=Math.min(offset.value,v))
watch(()=>p.duration,()=>{offset.value=0;zoom.value=1})
function point(e:PointerEvent){const r=(e.currentTarget as HTMLElement).getBoundingClientRect();return Math.max(0,Math.min(p.duration,offset.value+(e.clientX-r.left)/r.width*span.value))}
function down(e:PointerEvent){if(p.disabled)return;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);drag.value=point(e);dragEnd.value=drag.value}
function move(e:PointerEvent){if(drag.value!==null)dragEnd.value=point(e)}
function up(e:PointerEvent){if(drag.value===null)return;const end=point(e),start=drag.value;drag.value=null;dragEnd.value=null;emit('seek',end);if(p.mode==='frames'&&Math.abs(end-start)>=.1)emit('range',Math.min(start,end),Math.max(start,end))}
const pos=(t:number)=>(t-offset.value)/span.value*100
const rangeStart=computed(()=>drag.value===null?p.start:Math.min(drag.value,dragEnd.value??drag.value))
const rangeEnd=computed(()=>drag.value===null?p.end:Math.max(drag.value,dragEnd.value??drag.value))
</script>
<template><section class="fs-analysis fs-timeline" aria-label="媒体时间轴">
 <div class="fs-analysis-header"><strong>媒体时间轴 · {{humanTime(time)}} / {{humanTime(duration)}}</strong><button class="secondary-button" :disabled="disabled||loading" @click="emit('load')">{{loading?'生成中…':'生成缩略图'}}</button></div>
 <div class="fs-timeline-toolbar"><label>缩放 <input v-model.number="zoom" type="range" min="1" max="16" step="1" aria-label="时间轴缩放"/></label><button v-if="mode==='split'" class="secondary-button" :disabled="disabled||!keys.length" @click="emit('cut',time)">添加关键帧分割点</button></div>
 <div class="fs-timeline-track" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="drag=null;dragEnd=null">
  <div class="fs-timeline-thumbs"><img v-for="t in thumbnails.filter(t=>pos(t.timestamp)>=0&&pos(t.timestamp)<=100)" :key="t.name" :src="t.url" :alt="humanTime(t.timestamp)" :style="{left:pos(t.timestamp)+'%'}" draggable="false"/></div>
  <div v-if="mode==='frames'" class="fs-timeline-range" :style="{left:Math.max(0,pos(rangeStart))+'%',width:Math.max(0,Math.min(100,pos(rangeEnd))-Math.max(0,pos(rangeStart)))+'%'}"/>
  <i v-for="t in keys.filter(t=>pos(t)>=0&&pos(t)<=100)" :key="t" class="fs-timeline-key" :style="{left:pos(t)+'%'}"/>
  <i v-for="t in cuts.filter(t=>pos(t)>=0&&pos(t)<=100)" :key="'c'+t" class="fs-timeline-cut" :style="{left:pos(t)+'%'}"/>
  <i v-if="pos(time)>=0&&pos(time)<=100" class="fs-timeline-play" :style="{left:pos(time)+'%'}"/>
 </div>
 <input type="range" :min="0" :max="maxOffset" step=".1" v-model.number="offset" :disabled="maxOffset===0" aria-label="移动时间轴视窗"/>
 <input type="range" :min="0" :max="duration" step=".01" :value="time" :disabled="disabled" @input="emit('seek',Number(($event.target as HTMLInputElement).value))" aria-label="定位播放位置"/>
 <div class="fs-timeline-toolbar"><small>{{humanTime(offset)}} — {{humanTime(offset+span)}} · {{mode==='frames'?'拖拽区间设置抽帧范围':'分析后可吸附至已索引关键帧样本；手动点覆盖自动分割规则'}}</small></div>
 <div v-if="mode==='split'&&cuts.length" class="fs-timeline-cuts"><button v-for="t in cuts" :key="t" class="secondary-button" :disabled="disabled" @click="emit('remove',t)">{{humanTime(t)}} ×</button></div>
</section></template>
