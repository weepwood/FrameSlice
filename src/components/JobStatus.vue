<script setup lang="ts">
defineProps<{status:string;label:string}>()
</script>
<template><span class="fs-job-status" :data-status="status"><i aria-hidden="true"/>{{label}}</span></template>
