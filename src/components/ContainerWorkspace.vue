<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, FileAudio, FileText,
  FileVideo, Folder, FolderOpen, LoaderCircle, PackageOpen, Play, Subtitles,
  X, ShieldCheck,
} from 'lucide-vue-next'
import type { ContainerInspection, ContainerTrack, ContainerOutput, ContainerAction, ContainerFormat } from '../lib/container-ops'
import { scanContainerInWorker, runContainerInWorker } from '../lib/container-client'
import { chooseFolder, supportsFolderWrite, saveBlob } from '../lib/storage'
import { baseName, friendlyError, humanBytes, humanTime } from '../lib/format'
import { workspace } from '../core/workspace'

const props = defineProps<{
  initialFile?: File | null
  handoff?: { file: File; subtitle: File } | null
}>()
const emit = defineEmits<{ (event: 'busy', value: boolean): void }>()
const fileInput = ref<HTMLInputElement | null>(null)
const subtitleInput = ref<HTMLInputElement | null>(null)
const media = ref<File | null>(null)
const subtitle = ref<File | null>(null)
const report = ref<ContainerInspection | null>(null)
const selectedIds = ref<string[]>([])
const format = ref<ContainerFormat>('mkv')
const action = ref<ContainerAction>('extract')
const language = ref('zho')
const confirmed = ref(false)
const folder = ref<FileSystemDirectoryHandle | null>(null)
const stage = ref<'idle' | 'scanning' | 'running' | 'done' | 'error' | 'canceled'>('idle')
const progress = ref(0)
const statusMessage = ref('')
const error = ref('')
const outputs = ref<ContainerOutput[]>([])
const outputPath = ref('')
let scanController: AbortController | null = null
let taskController: AbortController | null = null
let revision = 0

const working = computed(() => stage.value === 'running' || stage.value === 'scanning')
const canRun = computed(() =>
  !!media.value && !!report.value && !working.value && !!selectedIds.value.length &&
  confirmed.value && supportsFolderWrite() &&
  (action.value !== 'package' || format.value !== 'mp4' || !subtitle.value),
)
watch(working, value => emit('busy', value))

function cleanup() {
  scanController?.abort()
  taskController?.abort()
  scanController = null
  taskController = null
}

async function loadFile(next: File | null) {
  if (!next || working.value) return
  cleanup()
  const currentRevision = ++revision
  media.value = next
  subtitle.value = null
  report.value = null
  selectedIds.value = []
  confirmed.value = false
  outputs.value = []
  outputPath.value = ''
  stage.value = 'scanning'
  error.value = ''
  statusMessage.value = '正在读取容器和轨道元信息…'
  scanController = new AbortController()
  try {
    const signal = scanController.signal
    const result = workspace.cached<ContainerInspection>(next,'container-info') ?? await workspace.run('container-scan',next,signal,()=>scanContainerInWorker(next,signal))
    workspace.cache(next,'container-info',result)
    if (revision !== currentRevision) return
    report.value = result
    selectedIds.value = result.tracks.filter(t => t.selectable).map(t => t.id)
    stage.value = 'idle'
    statusMessage.value = `识别到 ${result.tracks.length} 条轨道`
  } catch (cause) {
    if (revision === currentRevision) {
      stage.value = 'error'
      error.value = friendlyError(cause)
    }
  } finally {
    if (revision === currentRevision) scanController = null
  }
}
function chooseFile() { if (!working.value) fileInput.value?.click() }
function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  void loadFile(target.files?.[0] ?? null)
  target.value = ''
}
function onSubtitleChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] || null
  if (file && !/\.(srt|vtt)$/i.test(file.name)) error.value = '只支持 SRT 或 VTT 外部字幕。'
  else if (file && file.size > 4_000_000) error.value = '字幕最大支持 4MB。'
  else { subtitle.value = file; error.value = '' }
  target.value = ''
}
function toggleTrack(track: ContainerTrack) {
  if (!track.selectable || working.value) return
  const current = new Set(selectedIds.value)
  if (current.has(track.id)) current.delete(track.id)
  else current.add(track.id)
  selectedIds.value = [...current]
}
function setAction(next: ContainerAction) {
  if (working.value) return
  action.value = next
  error.value = ''
  if (next === 'extract') subtitle.value = null
}
async function pickFolder() {
  if (working.value) return
  try {
    folder.value = await chooseFolder()
    error.value = ''
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === 'AbortError')) error.value = friendlyError(cause)
  }
}
async function start() {
  if (!media.value || !report.value || working.value || !selectedIds.value.length) return
  if (!confirmed.value) { error.value = '请先确认不支持的字幕、附件及章节不会被保留。'; return }
  if (subtitle.value && (action.value !== 'package' || format.value !== 'mkv')) {
    error.value = '带字幕封装目前只能选择 MKV。'; return
  }
  if (!folder.value) {
    await pickFolder() // MUST open from the click gesture, not from Worker.
  }
  if (!folder.value) { error.value = '请先选择本地导出目录。'; return }
  const controller = new AbortController()
  taskController = controller
  stage.value = 'running'
  progress.value = 0
  error.value = ''
  outputs.value = []
  statusMessage.value = '正在准备输出…'
  try {
    const name = `${baseName(media.value.name)}_tracks_${Date.now()}_${crypto.randomUUID().slice(0,6)}`
    const taskFolder = await folder.value.getDirectoryHandle(name, { create: true })
    outputPath.value = `${folder.value.name}/${taskFolder.name}`
    const current = media.value
    const selectedTracks = [...selectedIds.value]
    const count = await workspace.run(action.value === 'extract' ? 'extract-tracks' : 'remux',current,controller.signal,ctx=>runContainerInWorker({
      file: current,
      folder: taskFolder,
      action: action.value,
      format: format.value,
      selectedIds: selectedTracks,
      subtitle: subtitle.value,
      language: language.value,
      acknowledgeUnlisted: confirmed.value,
    }, controller.signal, {
      onProgress: (fraction, message) => {
        progress.value = Math.max(0, Math.min(1, fraction))
        statusMessage.value = message; ctx.progress(fraction,message)
      },
      onOutput: item => { outputs.value.push(item); ctx.checkpoint(item.filename) },
    }))
    if (controller.signal.aborted) throw new DOMException('已取消任务', 'AbortError')
    progress.value = 1
    stage.value = 'done'
    statusMessage.value = `完成 ${count} 个输出；视频与音频轨道已重新读取校验。`
    try {
      await saveBlob(taskFolder, 'frameslice-tracks-report.json',
        new Blob([JSON.stringify({
          app: 'FrameSlice', action: action.value, input: current.name,
          sourceBytes: current.size, outputFormat: format.value,
          discardedUnsupportedTracksAcknowledged: confirmed.value,
          subtitleSource: subtitle.value?.name || null,
          selectedTrackIds: selectedTracks,
          results: outputs.value,
        }, null, 2)], { type: 'application/json' }),
        new AbortController().signal)
    } catch {
      // Media files are already complete; a JSON report failure is non-fatal.
      statusMessage.value += '（报告写入失败，媒体输出仍已完成）'
    }
  } catch (cause) {
    stage.value = controller.signal.aborted ? 'canceled' : 'error'
    error.value = friendlyError(cause)
    statusMessage.value = controller.signal.aborted ? '任务已取消' : '处理失败'
  } finally {
    taskController = null
  }
}
function cancel() { taskController?.abort() }

watch(() => props.handoff, async handoff => {
  if (!handoff || working.value) return
  await loadFile(handoff.file)
  if (media.value !== handoff.file || !report.value) return
  subtitle.value = handoff.subtitle
  action.value = 'package'
  format.value = 'mkv'
  confirmed.value = false
  statusMessage.value = '已接收字幕工作台的媒体和字幕，请确认轨道后封装。'
}, { immediate: true })

onMounted(() => { if (props.initialFile && !media.value) void loadFile(props.initialFile) })
onBeforeUnmount(() => cleanup())
</script>

<template>
  <div class="ct-workspace">
    <input ref="fileInput" type="file" accept=".mkv,.mp4,.mov,.m4v,.webm,.m4a,.mp3,.flac,.ogg,video/*,audio/*" hidden @change="onFileChange" />
    <input ref="subtitleInput" type="file" accept=".srt,.vtt" hidden @change="onSubtitleChange"/>
    <div class="ct-top-line">
      <div class="ct-top-title"><PackageOpen :size="20"/><div><strong>轨道与容器处理</strong><span>逐轨提取 · 无损重新封装 · MKV 软字幕</span></div></div>
      <button type="button" class="secondary-button" :disabled="working" @click="chooseFile"><FolderOpen :size="15"/> {{ media ? '更换媒体' : '打开媒体文件' }}</button>
    </div>

    <div v-if="media" class="ct-file-card">
      <FileVideo :size="21" color="#647e66"/>
      <div class="ct-file-label"><strong :title="media.name">{{ media.name }}</strong>
        <span>{{ humanBytes(media.size) }}<template v-if="report"> · {{ humanTime(report.duration) }}</template></span></div>
      <LoaderCircle v-if="stage === 'scanning'" :size="19" class="rotating"/>
      <CheckCircle2 v-else-if="report" :size="18" color="#628a68"/>
    </div>

    <div v-if="!media" class="ct-empty" role="button" tabindex="0" @click="chooseFile" @keydown.enter="chooseFile">
      <PackageOpen :size="27"/>
      <strong>选择 MKV / MP4 / 音频文件</strong>
      <p>按需读取本地轨道。大文件不上传，不需要服务器。</p>
    </div>

    <div v-if="report" class="ct-main">
      <div class="ct-card">
        <div class="ct-section-heading"><strong>媒体轨道</strong><span>{{ selectedIds.length }} 条已选 · {{ report.tracks.length }} 条识别</span></div>
        <div class="ct-tracks">
          <button v-for="track in report.tracks" :key="track.id" type="button"
            class="ct-track" :class="{ selected: selectedIds.includes(track.id), disabled: !track.selectable }"
            :disabled="!track.selectable || working" :aria-pressed="selectedIds.includes(track.id)" @click="toggleTrack(track)">
            <span class="ct-track-kind"><FileVideo v-if="track.kind === 'video'" :size="19"/><FileAudio v-else-if="track.kind === 'audio'" :size="19"/><Subtitles v-else :size="19"/></span>
            <span class="ct-track-detail">
              <strong>{{ track.kind === 'video' ? '视频' : track.kind === 'audio' ? '音频' : '字幕 / 其他' }} · {{ track.codecLabel }}</strong>
              <small>{{ track.language || 'und' }} <template v-if="track.name">· {{ track.name }}</template> <template v-if="track.detail">· {{ track.detail }}</template></small>
            </span>
            <span v-if="track.selectable" class="ct-checkbox"><Check v-if="selectedIds.includes(track.id)" :size="14"/></span>
            <span v-else class="ct-unavailable">暂不支持</span>
          </button>
        </div>
      </div>

      <div class="ct-card">
        <div class="ct-section-heading"><strong>输出操作</strong><span>不重新编码音视频</span></div>
        <div class="ct-choices">
          <button type="button" class="ct-choice" :class="{active:action==='extract'}" :disabled="working" @click="setAction('extract')">
            <PackageOpen :size="18"/><strong>逐轨提取</strong><span>每条选定轨道生成独立文件</span>
          </button>
          <button type="button" class="ct-choice" :class="{active:action==='package'}" :disabled="working" @click="setAction('package')">
            <PackageOpen :size="18"/><strong>重新封装</strong><span>组合选定音视频轨道</span>
          </button>
        </div>
        <div v-if="action==='package'" class="ct-option-row">
          <div><strong>目标容器</strong><small>根据编码兼容性决定能否无损导出</small></div>
          <div class="ct-select"><select v-model="format" :disabled="working" aria-label="封装目标格式"><option value="mkv">MKV（推荐）</option><option value="mp4">MP4</option></select><ChevronDown :size="14"/></div>
        </div>
        <div v-if="action==='package' && format==='mkv'" class="ct-option-row">
          <div><strong>附加软字幕</strong><small>添加 SRT / VTT，写入可切换 WebVTT 轨道</small></div>
          <div class="ct-sub-actions">
            <button type="button" class="secondary-button" :disabled="working" @click="subtitleInput?.click"><FileText :size="14"/>{{ subtitle ? '更换字幕' : '添加字幕' }}</button>
            <button v-if="subtitle" type="button" class="ct-icon-btn" aria-label="移除外挂字幕" :disabled="working" @click="subtitle=null"><X :size="16"/></button>
          </div>
        </div>
        <div v-if="subtitle && action==='package'" class="ct-file-note">{{ subtitle.name }} · {{ humanBytes(subtitle.size) }} <span>语言代码：<input v-model="language" :disabled="working" maxlength="3" aria-label="字幕 ISO 639 语言代码"/></span></div>
        <div class="ct-warning">
          <AlertTriangle :size="17"/><div><strong>轨道保留范围</strong>
            <p>浏览器当前只能无损提取或封装已识别的音视频轨道。源文件中的 ASS / PGS / SRT 内嵌字幕、附件、章节及未识别轨道不会自动保留；单独添加的 SRT/VTT 仅可写入 MKV。</p>
            <p v-for="warning in report.warnings" :key="warning">{{ warning }}</p>
          </div>
        </div>
        <label class="ct-ack"><input v-model="confirmed" type="checkbox" :disabled="working"/>
          我已确认只保留所选轨道，其他轨道及附件可能丢失</label>
        <div class="ct-option-row ct-last">
          <div><strong>输出位置</strong><small>{{ folder?.name || '请指定本地文件夹，每次任务独立子目录' }}</small></div>
          <button type="button" class="secondary-button" :disabled="working" @click="pickFolder"><Folder :size="15"/>{{ folder ? '更换目录' : '选择目录' }}</button>
        </div>
        <button v-if="stage !== 'running'" type="button" class="primary-button ct-primary" :disabled="!canRun" @click="start">
          <Play :size="16" fill="currentColor"/>{{ action === 'extract' ? '开始提取所选轨道' : '开始无损重新封装' }}
        </button>
        <button v-else type="button" class="cancel-button ct-primary" @click="cancel">取消处理</button>
        <p v-if="!supportsFolderWrite()" class="ct-hint">此功能需要桌面 Chrome 或 Edge 的文件夹写入权限，不使用内存打包大型视频。</p>
      </div>
    </div>

    <div v-if="stage === 'running' || stage === 'done' || stage === 'error' || stage === 'canceled'" class="ct-result" aria-live="polite">
      <div class="ct-section-heading"><strong>处理结果</strong><span>{{ Math.round(progress * 100) }}%</span></div>
      <p class="ct-muted">{{ statusMessage }}</p>
      <div class="ct-progress"><span :style="{width: (progress*100)+'%'}"/></div>
      <p v-if="outputPath" class="ct-muted">保存目录：{{ outputPath }}</p>
      <div v-for="out in outputs" :key="out.filename" class="ct-output"><CheckCircle2 :size="17"/><strong>{{ out.filename }}</strong><span>{{ humanBytes(out.bytes) }} · {{ out.subtitleTrackAdded ? '字幕轨已写入' : '轨道已校验' }}</span></div>
    </div>
    <div v-if="error" class="ct-error" role="alert"><AlertTriangle :size="16"/>{{ error }}</div>
    <div class="ct-footer"><ShieldCheck :size="14"/>本地处理，不上传视频；已输出文件会重新检查轨道数量、编码与时长。</div>
  </div>
</template>
