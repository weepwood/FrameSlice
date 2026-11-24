<script setup lang="ts" generic="T extends string|number">
import {SelectRoot,SelectTrigger,SelectValue,SelectPortal,SelectContent,SelectViewport,SelectItem,SelectItemText,SelectItemIndicator} from 'reka-ui'
import {ChevronDown,Check} from 'lucide-vue-next'
const props=defineProps<{modelValue:T;options:readonly {value:T;label:string}[];label:string;disabled?:boolean}>()
const emit=defineEmits<{'update:modelValue':[T]}>()
function change(value:unknown){const option=props.options.find(o=>String(o.value)===String(value));if(option)emit('update:modelValue',option.value)}
</script>
<template><SelectRoot :model-value="String(modelValue)" :disabled="disabled" @update:model-value="change"><SelectTrigger class="fs-select-trigger" :aria-label="label"><SelectValue/><ChevronDown :size="14" aria-hidden="true"/></SelectTrigger><SelectPortal><SelectContent class="fs-select-content" position="popper" :side-offset="5" :collision-padding="8"><SelectViewport class="fs-select-viewport"><SelectItem v-for="option in options" :key="option.value" :value="String(option.value)" class="fs-select-item"><SelectItemText>{{option.label}}</SelectItemText><SelectItemIndicator><Check :size="13"/></SelectItemIndicator></SelectItem></SelectViewport></SelectContent></SelectPortal></SelectRoot></template>
