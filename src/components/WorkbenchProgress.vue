<script setup lang="ts">
import {computed} from 'vue'
const props=withDefaults(defineProps<{value:number|null;max?:number;label:string;valueText?:string}>(),{max:100})
const maxValue=computed(()=>Number.isFinite(props.max)&&props.max>0?props.max:100)
const current=computed(()=>props.value!==null&&Number.isFinite(props.value)?Math.min(maxValue.value,Math.max(0,props.value)):null)
const percent=computed(()=>current.value===null?0:current.value/maxValue.value*100)
</script>
<template>
  <fluent-progress-bar class="fs-workbench-progress" role="progressbar" thickness="large" :min="0" :max="maxValue" :value="current??undefined" :aria-label="label" :aria-valuemin="0" :aria-valuemax="maxValue" :aria-valuenow="current??undefined" :aria-valuetext="valueText??(current===null?'进度未知':Math.round(percent)+'%')"/>
</template>
