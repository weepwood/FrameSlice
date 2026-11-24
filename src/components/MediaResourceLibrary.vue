<script setup lang="ts">
import {FileVideo} from 'lucide-vue-next'
import WorkbenchButton from './WorkbenchButton.vue'
import {humanBytes} from '../lib/format'
defineProps<{assets:File[];current:File|null;disabled:boolean}>()
const emit=defineEmits<{import:[];select:[File];remove:[File]}>()
</script>
<template><section class="fs-media-library"><div class="fs-analysis-header"><strong>媒体资源</strong><WorkbenchButton label="添加媒体资源" :disabled="disabled" @click="emit('import')">＋</WorkbenchButton></div><p v-if="!assets.length" class="fs-analysis-disclaimer">导入本地视频，按需读取。</p><div v-for="(asset,i) in assets" :key="i" class="fs-library-row" :class="{selected:asset===current}"><button type="button" :disabled="disabled" :title="asset.name" @click="emit('select',asset)"><FileVideo :size="15"/><span>{{asset.name}}<small>{{humanBytes(asset.size)}}</small></span></button><button type="button" :disabled="disabled" :aria-label="'移除 '+asset.name" @click="emit('remove',asset)">×</button></div></section></template>
