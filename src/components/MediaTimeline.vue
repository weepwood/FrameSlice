<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue'
import {Minus,Plus,LocateFixed,Magnet,Maximize2,X} from 'lucide-vue-next'
import {anchoredViewport,nearestKey,snapTimeline,visibleKeys} from '../lib/timeline-index.mjs'
import {humanTime} from '../lib/format'
import type {FramePreview} from '../lib/frames'
const p=defineProps<{source:string;duration:number;time:number;thumbnails:FramePreview[];keys:number[];cuts:number[];disabled:boolean;loading:boolean;mode:'split'|'frames';start:number;end:number}>()
const emit=defineEmits<{seek:[number];load:[number,number,number];cancel:[];range:[number,number];cut:[number];moveCut:[number,number];remove:[number]}>()
const zoom=ref(1),offset=ref(0),snap=ref(true)
const track=ref<HTMLElement|null>(null)
type Drag={pointer:number;kind:'track'|'start'|'end'|'cut';origin:number;value:number;cut?:number;clientX:number;moved:boolean}
const drag=ref<Drag|null>(null)
const span=computed(()=>Math.max(.001,p.duration/zoom.value))
const maxOffset=computed(()=>Math.max(0,p.duration-span.value))
const visible=computed(()=>visibleKeys(p.keys,offset.value,offset.value+span.value))
const thumbs=computed(()=>p.thumbnails.filter(t=>t.timestamp>=offset.value&&t.timestamp<=offset.value+span.value))
const ticks=computed(()=>{const step=Math.pow(10,Math.floor(Math.log10(span.value/5)));const spacing=[1,2,5,10].map(n=>n*step).find(n=>n>=span.value/6)??step*10;const out:number[]=[];for(let t=Math.ceil(offset.value/spacing)*spacing;t<=offset.value+span.value&&out.length<12;t+=spacing)out.push(t);return out})
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n))
const round=(n:number)=>Math.round(n*1000)/1000
const pos=(t:number)=>(t-offset.value)/span.value*100
const inView=(t:number)=>pos(t)>=0&&pos(t)<=100
function setZoom(n:number,anchor=p.time){const next=clamp(n,1,64);const pivot=clamp(anchor,offset.value,offset.value+span.value);const start=anchoredViewport(p.duration,span.value,offset.value,p.duration/next,pivot);zoom.value=next;offset.value=start}
function locate(){offset.value=clamp(p.time-span.value/2,0,maxOffset.value)}
function fit(){setZoom(1);offset.value=0}
function wheel(e:WheelEvent){if(!(e.ctrlKey||e.metaKey||e.shiftKey)||p.disabled)return;e.preventDefault();if(e.shiftKey&&!e.ctrlKey&&!e.metaKey){offset.value=clamp(offset.value+(e.deltaX||e.deltaY)*span.value/500,0,maxOffset.value);return}const r=track.value?.getBoundingClientRect();if(!r?.width)return;setZoom(zoom.value*(e.deltaY<0?1.25:.8),offset.value+clamp((e.clientX-r.left)/r.width,0,1)*span.value)}
watch(maxOffset,v=>offset.value=Math.min(offset.value,v))
watch([()=>p.source,()=>p.duration],()=>{offset.value=0;zoom.value=1;drag.value=null})
watch(()=>p.disabled,v=>{if(v)drag.value=null})
onBeforeUnmount(()=>{drag.value=null})
function point(e:{clientX:number},force=false){const r=track.value?.getBoundingClientRect();if(!r?.width)return p.time;const raw=clamp(offset.value+(e.clientX-r.left)/r.width*span.value,0,p.duration);return force?(nearestKey(p.keys,raw)??raw):snap.value?snapTimeline(p.keys,raw,span.value,r.width):raw}
function down(e:PointerEvent,kind:Drag['kind']='track',cut?:number){if(p.disabled||e.button!==0||drag.value||!track.value)return;e.preventDefault();e.stopPropagation();track.value.focus({preventScroll:true});track.value.setPointerCapture(e.pointerId);const t=point(e);drag.value={pointer:e.pointerId,kind,origin:t,value:t,cut,clientX:e.clientX,moved:false}}
function move(e:PointerEvent){const d=drag.value;if(!d||e.pointerId!==d.pointer)return;d.moved||=Math.abs(e.clientX-d.clientX)>4;d.value=point(e,d.kind==='cut');if(d.kind==='start')d.value=clamp(d.value,0,Math.max(0,p.end-.001));if(d.kind==='end')d.value=clamp(d.value,Math.min(p.duration,p.start+.001),p.duration)}
function up(e:PointerEvent){const d=drag.value;if(!d||e.pointerId!==d.pointer)return;move(e);drag.value=null;if(p.disabled)return;if(d.kind==='cut'){if(d.moved&&d.cut!==undefined)emit('moveCut',d.cut,d.value);return}if(d.kind==='start'||d.kind==='end'){if(d.moved)emit('range',d.kind==='start'?d.value:p.start,d.kind==='end'?d.value:p.end);return}emit('seek',round(d.value));if(p.mode==='frames'&&d.moved&&Math.abs(d.value-d.origin)>=.001)emit('range',Math.min(d.origin,d.value),Math.max(d.origin,d.value))}
function keydown(e:KeyboardEvent){if(p.disabled||e.target!==track.value)return;const step=e.shiftKey?1:.1;let t=p.time;if(e.key==='ArrowRight')t+=step;else if(e.key==='ArrowLeft')t-=step;else if(e.key==='Home')t=0;else if(e.key==='End')t=p.duration;else if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(zoom.value*2);return}else if(e.key==='-'){e.preventDefault();setZoom(zoom.value/2);return}else return;e.preventDefault();emit('seek',round(clamp(t,0,p.duration)))}
function changeHandle(side:'start'|'end',value:number){if(!Number.isFinite(value))return;if(side==='start'&&value>=0&&value<p.end)emit('range',value,p.end);if(side==='end'&&value>p.start&&value<=p.duration)emit('range',p.start,value)}
function handleKey(e:KeyboardEvent,side:'start'|'end'){if(p.disabled||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();changeHandle(side,round(clamp((side==='start'?p.start:p.end)+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1:.1),0,p.duration)))}
const rangeStart=computed(()=>drag.value?.kind==='start'?drag.value.value:drag.value?.kind==='track'&&drag.value.moved?Math.min(drag.value.origin,drag.value.value):p.start)
const rangeEnd=computed(()=>drag.value?.kind==='end'?drag.value.value:drag.value?.kind==='track'&&drag.value.moved?Math.max(drag.value.origin,drag.value.value):p.end)
const shownCuts=computed(()=>p.cuts.map(t=>({key:t,time:drag.value?.kind==='cut'&&drag.value.cut===t?drag.value.value:t})).filter(c=>inView(c.time)))
</script>
<template>
<section class="fs-analysis fs-timeline" aria-label="媒体时间轴">
 <div class="fs-analysis-header"><strong>媒体时间轴 · {{humanTime(time)}} / {{humanTime(duration)}}</strong><button v-if="loading" class="secondary-button" @click="emit('cancel')"><X :size="14"/>取消缩略图</button><button v-else class="secondary-button" :disabled="disabled" @click="emit('load',offset,offset+span,zoom)">生成缩略图</button></div>
 <div class="fs-timeline-toolbar fs-timeline-tools">
  <button type="button" class="secondary-button" aria-label="缩小时间轴" :disabled="zoom<=1" @click="setZoom(zoom/2)"><Minus :size="15"/></button>
  <label><input :value="zoom" @input="setZoom(Number(($event.target as HTMLInputElement).value))" type="range" min="1" max="64" step="any" aria-label="时间轴缩放"/></label>
  <button type="button" class="secondary-button" aria-label="放大时间轴" :disabled="zoom>=64" @click="setZoom(zoom*2)"><Plus :size="15"/></button><output>{{Number(zoom.toFixed(1))}}×</output>
  <button class="secondary-button" aria-label="定位到播放位置" @click="locate"><LocateFixed :size="15"/></button>
  <button class="secondary-button" aria-label="适应完整时间轴" @click="fit"><Maximize2 :size="15"/></button>
  <button class="secondary-button fs-snap-toggle" :aria-pressed="snap" aria-label="关键帧吸附" @click="snap=!snap"><Magnet :size="15"/><span>吸附</span></button>
  <button v-if="mode==='split'" class="secondary-button" :disabled="disabled||!keys.length" @click="emit('cut',time)">添加关键帧分割点</button>
 </div>
 <div class="fs-timeline-ruler" aria-hidden="true"><span v-for="t in ticks" :key="t" :style="{left:pos(t)+'%'}">{{span<6?t.toFixed(2)+'s':humanTime(t)}}</span></div>
 <div ref="track" class="fs-timeline-track" tabindex="0" role="group" aria-label="交互时间轴" @keydown="keydown" @wheel="wheel" @pointerdown="down($event)" @pointermove="move" @pointerup="up" @pointercancel="drag=null" @lostpointercapture="drag=null">
  <div class="fs-timeline-thumbs"><img v-for="t in thumbs" :key="t.name" :src="t.url" :alt="humanTime(t.timestamp)" :style="{left:pos(t.timestamp)+'%'}" draggable="false"/></div>
  <div v-if="mode==='frames'" class="fs-timeline-range" :style="{left:Math.max(0,pos(rangeStart))+'%',width:Math.max(0,Math.min(100,pos(rangeEnd))-Math.max(0,pos(rangeStart)))+'%'}"/>
  <i v-for="t in visible" :key="t" class="fs-timeline-key" :style="{left:pos(t)+'%'}"/>
  <button v-for="c in shownCuts" :key="c.key" class="fs-timeline-cut fs-cut-handle" :style="{left:pos(c.time)+'%'}" :disabled="disabled" :aria-label="'移动分割点 '+humanTime(c.key)" :title="humanTime(c.time)" @pointerdown="down($event,'cut',c.key)" @keydown.left.prevent.stop="emit('moveCut',c.key,keys[Math.max(0,keys.indexOf(c.key)-1)]??c.key)" @keydown.right.prevent.stop="emit('moveCut',c.key,keys[Math.min(keys.length-1,keys.indexOf(c.key)+1)]??c.key)"/>
  <template v-if="mode==='frames'"><button v-for="side in (['start','end'] as const)" v-show="inView(side==='start'?rangeStart:rangeEnd)" :key="side" class="fs-range-handle" :class="side" :style="{left:pos(side==='start'?rangeStart:rangeEnd)+'%'}" :disabled="disabled" :aria-label="side==='start'?'拖动抽帧起点':'拖动抽帧终点'" @pointerdown="down($event,side)" @keydown="handleKey($event,side)"/></template>
  <i v-if="inView(time)" class="fs-timeline-play" :style="{left:pos(time)+'%'}"/>
 </div>
 <label class="fs-timeline-slider"><span>视窗</span><input type="range" :min="0" :max="maxOffset" step="any" v-model.number="offset" :disabled="maxOffset===0" aria-label="移动时间轴视窗"/></label>
 <label class="fs-timeline-slider"><span>定位</span><input type="range" :min="0" :max="duration" step=".01" :value="time" :disabled="disabled" @input="emit('seek',Number(($event.target as HTMLInputElement).value))" aria-label="定位播放位置"/></label>
 <div class="fs-timeline-legend"><span><i class="legend-key"/> {{mode==='split'?'安全关键帧':'编码关键帧'}}</span><span><i class="legend-play"/> 播放位置</span><span v-if="mode==='split'"><i class="legend-cut"/> 手动切点</span><span v-else><i class="legend-range"/> 抽帧区间</span></div>
 <div class="fs-timeline-toolbar"><small>{{humanTime(offset)}} — {{humanTime(offset+span)}}</small><small>Ctrl / ⌘ + 滚轮缩放 · Shift + 滚轮平移</small><small v-if="mode==='split'&&cuts.length">手动切点优先</small></div>
 <div v-if="mode==='frames'" class="fs-timeline-toolbar"><label>起点秒 <input type="number" aria-label="时间轴抽帧起点" :value="start" min="0" :max="end" step=".001" :disabled="disabled" @change="e=>changeHandle('start',Number((e.target as HTMLInputElement).value))"/></label><label>终点秒 <input type="number" aria-label="时间轴抽帧终点" :value="end" :min="start" :max="duration" step=".001" :disabled="disabled" @change="e=>changeHandle('end',Number((e.target as HTMLInputElement).value))"/></label></div>
 <div v-if="mode==='split'&&cuts.length" class="fs-timeline-cuts"><button v-for="t in cuts" :key="t" class="secondary-button" :disabled="disabled" @click="emit('remove',t)">{{humanTime(t)}} ×</button></div>
</section>
</template>
