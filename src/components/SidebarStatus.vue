<script setup lang="ts">
import {Github,ShieldCheck,SunMoon} from 'lucide-vue-next'
import WorkbenchSelect from './WorkbenchSelect.vue'
defineProps<{modelValue:'system'|'light'|'dark';version:string}>()
const emit=defineEmits<{'update:modelValue':['system'|'light'|'dark']}>()
</script>
<template>
<div class="sidebar-bottom fs-sidebar-status" aria-label="外观与应用信息">
 <div class="fs-sidebar-appearance"><SunMoon :size="15" aria-hidden="true"/><WorkbenchSelect :model-value="modelValue" label="主题" :options="([{value:'system',label:'跟随系统'},{value:'light',label:'浅色'},{value:'dark',label:'深色'}] as const)" @update:model-value="emit('update:modelValue',$event)"/></div>
 <div class="fs-sidebar-meta"><span class="fs-local-status" title="源媒体在本地处理"><ShieldCheck :size="14" aria-hidden="true"/><span>本地处理</span></span><span class="fs-sidebar-version">v{{version}}</span><a href="https://github.com/weepwood/FrameSlice" target="_blank" rel="noopener noreferrer" class="fs-sidebar-github" aria-label="GitHub 仓库" title="GitHub 仓库"><Github :size="16"/></a></div>
</div>
</template>
