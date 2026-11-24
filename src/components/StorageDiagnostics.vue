<script setup lang="ts">
import {ref,onMounted} from 'vue'
import {humanBytes} from '../lib/format'
const usage=ref(0),quota=ref(0),persistent=ref(false),message=ref('')
async function refresh(){try{const estimate=await navigator.storage.estimate();usage.value=estimate.usage??0;quota.value=estimate.quota??0;persistent.value=await navigator.storage.persisted()}catch{message.value='当前浏览器无法读取存储信息'}}
async function persist(){try{persistent.value=await navigator.storage.persist();message.value=persistent.value?'已启用持久存储':'浏览器未授予持久存储'}catch{message.value='持久存储请求失败'}await refresh()}
onMounted(refresh)
</script>
<template><section class="fs-analysis fs-storage-diagnostics"><div class="fs-analysis-header"><strong>本地存储诊断</strong><button type="button" class="secondary-button" @click="refresh">刷新</button></div><p class="fs-storage-values">站点存储 {{humanBytes(usage)}} / {{humanBytes(quota)}} · {{persistent?'持久存储':'可能被浏览器回收'}}</p><progress class="fs-storage-values" :value="usage" :max="Math.max(quota,1)"/><p class="fs-analysis-disclaimer">此处为浏览器站点配额，不代表系统磁盘剩余空间。不会自动删除输出或模型缓存。</p><button type="button" class="secondary-button" :disabled="persistent" @click="persist">请求持久存储</button><p v-if="message" role="status">{{message}}</p></section></template>
