<script setup lang="ts">
import {computed} from 'vue'
import {ProgressRoot,ProgressIndicator} from 'reka-ui'
const props=withDefaults(defineProps<{value:number|null;max?:number;label:string;valueText?:string}>(),{max:100})
const maxValue=computed(()=>Number.isFinite(props.max)&&props.max>0?props.max:100)
const current=computed(()=>props.value!==null&&Number.isFinite(props.value)?Math.min(maxValue.value,Math.max(0,props.value)):null)
const percent=computed(()=>current.value===null?0:current.value/maxValue.value*100)
</script>
<template>
  <ProgressRoot class="fs-workbench-progress" :model-value="current" :max="maxValue" :get-value-label="()=>label" :get-value-text="()=>valueText??(current===null?'进度未知':Math.round(percent)+'%')">
    <ProgressIndicator class="fs-workbench-progress-fill" :style="{width:percent+'%'}"/>
  </ProgressRoot>
</template>
