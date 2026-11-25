<script setup lang="ts">
import {useId} from 'vue'
const props=defineProps<{modelValue:boolean;disabled?:boolean}>()
const emit=defineEmits<{'update:modelValue':[boolean]}>()
const id=useId()
function change(e:Event){emit('update:modelValue',(e.target as HTMLElement&{checked:boolean}).checked)}
</script>
<template><div class="fs-checkbox-field"><fluent-checkbox role="checkbox" :id="id" :aria-labelledby="id+'-label'" :checked.prop="props.modelValue" :aria-checked="String(props.modelValue)" :disabled="disabled||undefined" class="fs-fluent-checkbox" @change="change"/><label :id="id+'-label'" :for="id"><slot/></label></div></template>
