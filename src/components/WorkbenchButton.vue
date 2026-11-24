<script setup lang="ts">
withDefaults(defineProps<{variant?:'primary'|'secondary';disabled?:boolean;label?:string}>(),{variant:'secondary'})
</script>
<template><button type="button" :class="variant==='primary'?'primary-button':'secondary-button'" :disabled="disabled" :aria-label="label"><slot/></button></template>
