<script setup lang="ts">
import {NumberFieldRoot,NumberFieldInput,NumberFieldDecrement,NumberFieldIncrement} from 'reka-ui'
import {Minus,Plus} from 'lucide-vue-next'
const p=defineProps<{modelValue:number;label:string;min?:number;max?:number;step?:number;disabled?:boolean}>()
const emit=defineEmits<{ 'update:modelValue':[number] }>()
</script>
<template>
 <NumberFieldRoot class="fs-number-field" :model-value="p.modelValue" :min="min" :max="max" :step="step??1" :disabled="disabled" :disable-wheel-change="true" :step-snapping="false" :format-options="{useGrouping:false,maximumFractionDigits:6}" @update:model-value="v=>{if(typeof v==='number'&&Number.isFinite(v))emit('update:modelValue',v)}">
  <div class="fs-number-group">
   <NumberFieldDecrement class="fs-number-step" :aria-label="label+' 减少'"><Minus :size="12"/></NumberFieldDecrement>
   <NumberFieldInput class="fs-number-value" :aria-label="label"/>
   <NumberFieldIncrement class="fs-number-step" :aria-label="label+' 增加'"><Plus :size="12"/></NumberFieldIncrement>
  </div>
 </NumberFieldRoot>
</template>
