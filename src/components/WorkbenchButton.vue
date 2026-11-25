<script setup lang="ts">
withDefaults(defineProps<{variant?:'primary'|'secondary';disabled?:boolean;label?:string}>(),{variant:'secondary'})
</script>
<template><fluent-button role="button" type="button" class="fs-fluent-button" :appearance="variant==='primary'?'primary':'outline'" size="small" :disabled="disabled||undefined" :aria-label="label"><slot/></fluent-button></template>
