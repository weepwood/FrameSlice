<script setup lang="ts">
import {FileVideo,Check,ArrowDownToLine} from 'lucide-vue-next'
import {humanTime,humanBytes} from '../lib/format'
import type {SplitResult} from '../lib/split'
import type {FramePreview} from '../lib/frames'
defineProps<{parts:SplitResult[];frames:FramePreview[]}>()
const emit=defineEmits<{save:[FramePreview]}>()
</script>
<template>
<div v-if="parts.length" class="result-list"><div v-for="item in parts" :key="item.filename" class="result-item"><div class="result-file-icon"><FileVideo :size="18"/></div><div class="result-file-name"><strong>{{ item.filename }}</strong><span>{{ humanTime(item.start) }} — {{ humanTime(item.end) }} · {{ item.verification.level === 'deep' ? '逐包 CRC32 已校验' : 'MP4 结构已校验' }}</span></div><span class="result-size">{{ humanBytes(item.size) }}</span><Check :size="17" class="result-check"/></div></div>
<div v-if="frames.length" class="frame-gallery"><div v-for="item in frames" :key="item.name" class="frame-tile"><img :src="item.url" :alt="`截图 ${humanTime(item.timestamp)}`" loading="lazy"/><div class="frame-caption"><span>{{ humanTime(item.timestamp) }}<small v-if="item.sharpness!==undefined"> · Q {{item.sharpness.toFixed(1)}}</small></span><button v-if="item.blob" class="frame-download" type="button" :title="`下载 ${item.name}`" @click="emit('save',item)"><ArrowDownToLine :size="15"/></button><Check v-else :size="14" class="frame-saved"/></div></div></div>
</template>
