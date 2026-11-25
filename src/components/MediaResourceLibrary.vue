<script setup lang="ts">
import {computed,ref} from 'vue'
import {FileVideo,Plus,X,Folder} from 'lucide-vue-next'
import WorkbenchButton from './WorkbenchButton.vue'
import {humanBytes} from '../lib/format'
const props=defineProps<{assets:File[];current:File|null;disabled:boolean}>()
const query=ref('')
const filtered=computed(()=>{const term=query.value.trim().toLocaleLowerCase();return props.assets.filter(asset=>asset.name.toLocaleLowerCase().includes(term))})
const keys=new WeakMap<File,number>();let seq=0
function key(asset:File){if(!keys.has(asset))keys.set(asset,++seq);return keys.get(asset)!}
const emit=defineEmits<{import:[];select:[File];remove:[File]}>()
</script>
<template><section class="fs-media-library" :class="{'is-empty':!assets.length}"><div class="fs-collection-heading"><span><Folder :size="14"/>媒体资源</span><WorkbenchButton label="添加媒体资源" :disabled="disabled" @click="emit('import')"><Plus :size="15"/></WorkbenchButton></div><p v-if="!assets.length" class="fs-collection-empty">暂无媒体</p><input v-if="assets.length>5||query" v-model="query" class="fs-library-search" type="search" aria-label="搜索媒体资源" placeholder="搜索媒体资源"/><p v-if="assets.length&&!filtered.length" class="fs-analysis-disclaimer">没有匹配的媒体</p><div v-for="asset in filtered" :key="key(asset)" class="fs-library-row fs-resource-item" :class="{selected:asset===current}"><button type="button" :disabled="disabled" :title="asset.name" :aria-pressed="asset===current" @click="emit('select',asset)"><FileVideo :size="15" class="fs-resource-icon"/><span class="fs-resource-copy">{{asset.name}}<small>{{humanBytes(asset.size)}}</small></span></button><button type="button" :disabled="disabled" :aria-label="'移除 '+asset.name" @click="emit('remove',asset)"><X :size="13"/></button></div></section></template>
