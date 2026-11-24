<script setup lang="ts">
const p=defineProps<{label:string;value:number;min:number;max:number;side:'left'|'right'}>()
const emit=defineEmits<{change:[number]}>()
const clamp=(v:number)=>Math.max(p.min,Math.min(p.max,v))
let initial=0,x=0
function down(e:PointerEvent){if(e.button!==0)return;initial=p.value;x=e.clientX;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}
function move(e:PointerEvent){if(!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId))return;emit('change',clamp(initial+(e.clientX-x)*(p.side==='left'?1:-1)))}
function key(e:KeyboardEvent){if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();emit('change',clamp(e.key==='Home'?p.min:e.key==='End'?p.max:p.value+(e.key==='ArrowRight'?10:-10)*(p.side==='left'?1:-1)))}
</script>
<template><div class="fs-panel-resize" role="separator" aria-orientation="vertical" tabindex="0" :aria-label="label" :aria-valuenow="value" :aria-valuemin="min" :aria-valuemax="max" @pointerdown="down" @pointermove="move" @keydown="key"/></template>
