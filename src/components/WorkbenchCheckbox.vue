<script setup lang="ts">
import {useId} from 'vue'
import {CheckboxRoot,CheckboxIndicator} from 'reka-ui'
import {Check} from 'lucide-vue-next'
const props=defineProps<{modelValue:boolean;disabled?:boolean}>()
const emit=defineEmits<{'update:modelValue':[boolean]}>()
const id=useId()
</script>
<template><div class="fs-checkbox-field"><CheckboxRoot :id="id" :model-value="props.modelValue" :disabled="disabled" class="fs-checkbox" @update:model-value="emit('update:modelValue',$event===true)"><CheckboxIndicator class="fs-checkbox-indicator"><Check :size="12" :stroke-width="2.6"/></CheckboxIndicator></CheckboxRoot><label :for="id"><slot/></label></div></template>
