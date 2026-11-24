<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { AlertTriangle, RefreshCw, LoaderCircle } from 'lucide-vue-next'

type CaptionEmbedModule = {
  mountCaptionWorkspace: (target: HTMLElement) => () => void
}

const host = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const error = ref('')
let dispose: (() => void) | null = null
let active = true
let generation = 0

async function mountWorkspace() {
  const container = host.value
  if (!container || !active || dispose) return
  const sequence = ++generation
  loading.value = true
  error.value = ''
  try {
    const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
    const cssUrl = base + 'caption/caption-workspace.css'
    const jsUrl = base + 'caption/caption-workspace.js'
    const [response, module] = await Promise.all([
      fetch(cssUrl, { credentials: 'same-origin' }),
      import(/* @vite-ignore */ jsUrl) as Promise<CaptionEmbedModule>,
    ])
    if (!response.ok) throw new Error(`字幕样式载入失败（HTTP ${response.status}）`)
    if (typeof module.mountCaptionWorkspace !== 'function') {
      throw new Error('字幕工作区入口不完整，请重新部署。')
    }
    const cssText = await response.text()
    if (!active || sequence !== generation) return
    const shadow = container.shadowRoot ?? container.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = `:host{display:block;min-width:0;color:var(--fs-text,#292d27);background:transparent;}\n` + cssText
    const mountPoint = document.createElement('div')
    mountPoint.id = 'root'
    shadow.replaceChildren(style, mountPoint)
    dispose = module.mountCaptionWorkspace(mountPoint)
    loading.value = false
  } catch (cause) {
    if (!active || sequence !== generation) return
    loading.value = false
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

onMounted(() => { void mountWorkspace() })
onBeforeUnmount(() => {
  active = false
  generation++
  dispose?.()
  dispose = null
})
</script>

<template>
  <div class="caption-embedded-workspace" aria-label="字幕编辑工作台">
    <div v-if="loading" class="caption-embed-feedback" role="status">
      <LoaderCircle :size="22" class="rotating"/>
      <strong>正在载入字幕编辑器</strong>
      <span>仅首次进入时加载 React 工作区和相应组件，不会上传媒体文件。</span>
    </div>
    <div v-if="error" class="caption-embed-feedback error" role="alert">
      <AlertTriangle :size="22"/>
      <strong>字幕编辑器未能载入</strong>
      <span>{{ error }}</span>
      <button type="button" class="secondary-button" @click="mountWorkspace"><RefreshCw :size="15"/> 重试</button>
    </div>
    <div ref="host" class="caption-react-host" :class="{ 'is-ready': !loading && !error }"></div>
  </div>
</template>
