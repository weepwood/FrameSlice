<script setup lang="ts">
import {LockKeyhole} from 'lucide-vue-next'
defineProps<{title:string;description:string;icon:object}>()
</script>
<template>
<header class="topbar fs-workspace-header">
  <div class="fs-workspace-heading">
    <div class="fs-workspace-symbol"><component :is="icon" :size="19" :stroke-width="1.8"/></div>
    <div class="fs-workspace-title"><h1>{{title}}</h1><p>{{description}}</p></div>
  </div>
  <div class="top-actions"><span class="privacy-indicator"><LockKeyhole :size="13"/> 本地处理</span><slot/></div>
</header>
</template>
