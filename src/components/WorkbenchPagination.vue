<script setup lang="ts">
import {ChevronLeft,ChevronRight} from 'lucide-vue-next'
const props=defineProps<{page:number;pages:number;total:number;label:string;unit?:string}>()
const emit=defineEmits<{change:[number]}>()
</script>
<template>
  <nav v-if="pages>1" class="fs-job-pagination" :aria-label="label">
    <button type="button" class="secondary-button" :disabled="page<=0" @click="emit('change',page-1)"><ChevronLeft :size="14"/>上一页</button>
    <span aria-live="polite">{{page+1}} / {{pages}} <span class="fs-page-total">· {{total}} {{unit??'项'}}</span></span>
    <button type="button" class="secondary-button" :disabled="page>=pages-1" @click="emit('change',page+1)">下一页<ChevronRight :size="14"/></button>
  </nav>
</template>
