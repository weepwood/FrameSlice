<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  ArrowDownToLine, ArrowRight, BadgeCheck, Check, ChevronDown, CircleHelp, Clock3,
  FileVideo, Folder, FolderOpen, Github, Image as ImageIcon, Info, Layers2,
  LockKeyhole, PauseCircle, Play, RotateCcw, Scissors, ShieldCheck, SlidersHorizontal,
  Upload, X, Zap, AlertTriangle, Monitor, Film, HardDrive, Settings2,
} from 'lucide-vue-next'
import { humanBytes, humanTime, plannedFrameCount, friendlyError, baseName } from './lib/format'
import { inspectVideo } from './lib/media'
import type { VideoInfo } from './lib/media'
import { extractFrames } from './lib/frames'
import type { FramePreview, FrameFormat, FrameWidth } from './lib/frames'
import { splitVideo } from './lib/split'
import type { SplitResult } from './lib/split'
import { chooseFolder, downloadBlob, supportsFolderWrite } from './lib/storage'

type Mode = 'split' | 'frames'
type Status = 'idle' | 'running' | 'done' | 'error' | 'canceled'

const mode = ref<Mode>('split')
const file = ref<File | null>(null)
const info = ref<VideoInfo | null>(null)
const videoUrl = ref('')
const loading = ref(false)
const dragging = ref(false)
const status = ref<Status>('idle')
const progress = ref(0)
const progressLabel = ref('')
const errorText = ref('')
const outputFolder = ref<FileSystemDirectoryHandle | null>(null)
const selectedFolderName = ref('')
const lastJobFolder = ref('')
const parts = ref<SplitResult[]>([])
const frames = ref<FramePreview[]>([])
const finishedFrames = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)
const confirmation = ref(false)
const currentAbort = ref<AbortController | null>(null)

const splitStrategy = ref<'size' | 'duration'>('size')
const splitMinutes = ref(10)
const size = ref(4)
const sizeUnit = ref<'GB' | 'GiB'>('GB')
const interval = ref(30)
const frameStart = ref(0)
const frameEnd = ref(0)
const imageFormat = ref<FrameFormat>('image/jpeg')
const imageWidth = ref<FrameWidth>(1920)
const jpegQuality = ref(0.9)

const targetBytes = computed(() => Math.floor(size.value * (sizeUnit.value === 'GiB' ? 1024 ** 3 : 1000 ** 3)))
const estimatedParts = computed(() => {
  if (!file.value || !info.value) return 0
  if (splitStrategy.value === 'duration') {
    return Number.isFinite(splitMinutes.value) && splitMinutes.value > 0
      ? Math.max(1, Math.ceil(info.value.duration / (splitMinutes.value * 60)))
      : 0
  }
  return Math.max(1, Math.ceil(file.value.size / Math.max(1, targetBytes.value * 0.95)))
})
const estimatedFrames = computed(() => info.value ? plannedFrameCount(info.value.duration, interval.value, frameStart.value, frameEnd.value) : 0)
const canRun = computed(() => Boolean(file.value && info.value && !loading.value && status.value !== 'running'))
const fileReadable = computed(() => supportsFolderWrite())
const progressPercent = computed(() => Math.round(progress.value * 100))

let parseRevision = 0
async function loadFile(nextFile?: File | null) {
  if (!nextFile || status.value === 'running') return
  if (nextFile.size === 0) { errorText.value = '无法处理空文件。'; return }
  parseRevision += 1
  const revision = parseRevision
  resetOutput()
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  file.value = nextFile
  info.value = null
  videoUrl.value = URL.createObjectURL(nextFile)
  loading.value = true
  errorText.value = ''
  try {
    const inspected = await inspectVideo(nextFile)
    if (revision === parseRevision) {
      info.value = inspected
      frameStart.value = 0
      frameEnd.value = inspected.duration
    }
  } catch (error) {
    if (revision === parseRevision) errorText.value = `文件信息读取失败：${friendlyError(error)}`
  } finally {
    if (revision === parseRevision) loading.value = false
  }
}

function onInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  void loadFile(input.files?.[0])
  input.value = ''
}
function onDrop(event: DragEvent) {
  dragging.value = false
  if (status.value !== 'running') void loadFile(event.dataTransfer?.files[0])
}
function onDragOver(event: DragEvent) {
  event.preventDefault()
  dragging.value = true
}
function onDragLeave(event: DragEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) dragging.value = false
}
function selectFile() { fileInput.value?.click() }
function resetOutput() {
  parts.value = []
  frames.value.forEach((item) => URL.revokeObjectURL(item.url))
  frames.value = []
  finishedFrames.value = 0
  status.value = 'idle'
  progress.value = 0
  progressLabel.value = ''
  confirmation.value = false
  lastJobFolder.value = ''
}
function clearFile() {
  if (status.value === 'running') return
  parseRevision++
  resetOutput()
  file.value = null
  info.value = null
  errorText.value = ''
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  videoUrl.value = ''
}
function changeMode(next: Mode) {
  if (status.value === 'running') return
  mode.value = next
  resetOutput()
  errorText.value = ''
}
async function pickFolder() {
  try {
    const folder = await chooseFolder()
    outputFolder.value = folder
    selectedFolderName.value = folder.name
    errorText.value = ''
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) errorText.value = friendlyError(error)
  }
}
function addPreview(preview: FramePreview) {
  frames.value.push(preview)
  const max = outputFolder.value ? 16 : 30
  while (frames.value.length > max) {
    const old = frames.value.shift()
    if (old) URL.revokeObjectURL(old.url)
  }
}
async function start() {
  if (!file.value || !info.value || status.value === 'running') return
  if (mode.value === 'split' && splitStrategy.value === 'size' && (!Number.isFinite(size.value) || targetBytes.value < 32 * 1024 * 1024)) {
    errorText.value = '分割大小至少为 32 MB。'; return
  }
  if (mode.value === 'split' && splitStrategy.value === 'duration' &&
      (!Number.isFinite(splitMinutes.value) || splitMinutes.value < 0.01)) {
    errorText.value = '分割时长必须有效，且至少为 0.5 秒。'; return
  }
  if (mode.value === 'frames' &&
      (!Number.isFinite(interval.value) || interval.value < 0.1 ||
       !Number.isFinite(frameStart.value) || !Number.isFinite(frameEnd.value) ||
       frameStart.value < 0 || frameEnd.value <= frameStart.value ||
       frameEnd.value > info.value.duration + 0.000001 || estimatedFrames.value === 0)) {
    errorText.value = '截图区间或间隔无效，间隔至少 0.1 秒，且单次最多 10000 张。'; return
  }
  // The directory picker MUST be opened from this user gesture, before async processing.
  if (!outputFolder.value && supportsFolderWrite()) {
    try { await pickFolder() } catch { /* picker manages its own error */ }
  }
  if (mode.value === 'split' && !outputFolder.value) {
    errorText.value = '大视频分割必须先选择输出文件夹。请使用桌面 Chrome / Edge。'; return
  }
  if (mode.value === 'frames' && !outputFolder.value && estimatedFrames.value > 30) {
    errorText.value = '此浏览器不支持直接保存文件夹，单次最多生成 30 张可单独下载的图片。'; return
  }
  if (mode.value === 'split' && info.value.videoTracks !== 1) {
    errorText.value = '目前只支持单视频轨无损切割。'; return
  }
  if (mode.value === 'split' && info.value.audioTracks > 1) {
    errorText.value = '目前最多支持一条音轨，避免导出时丢失其他音轨。'; return
  }
  const currentFile = file.value
  const currentInfo = info.value
  const controller = new AbortController()
  currentAbort.value = controller
  resetOutput()
  status.value = 'running'
  errorText.value = ''
  progressLabel.value = '准备处理…'
  try {
    // Every task receives its own subfolder so an earlier export is never overwritten.
    const jobFolder = outputFolder.value
      ? await outputFolder.value.getDirectoryHandle(
          `${baseName(currentFile.name)}_${mode.value}_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
          { create: true },
        )
      : null
    if (jobFolder) lastJobFolder.value = `${selectedFolderName.value}/${jobFolder.name}`
    if (controller.signal.aborted) throw new DOMException('任务已取消', 'AbortError')
    if (mode.value === 'split') {
      await splitVideo({
        file: currentFile, maxBytes: targetBytes.value,
        maxSeconds: splitStrategy.value === 'duration' ? splitMinutes.value * 60 : undefined,
        folder: jobFolder!, signal: controller.signal,
        onProgress: (value, text) => { progress.value = value; progressLabel.value = text },
        onSegment: (part) => { parts.value.push(part) },
      })
    } else {
      finishedFrames.value = await extractFrames({
        file: currentFile, duration: currentInfo.duration, interval: interval.value,
        startTime: frameStart.value, endTime: frameEnd.value,
        format: imageFormat.value, width: imageWidth.value, quality: jpegQuality.value,
        folder: jobFolder, signal: controller.signal,
        onProgress: (value, text) => { progress.value = value; progressLabel.value = text },
        onPreview: addPreview,
      })
    }
    status.value = 'done'
    progress.value = 1
    progressLabel.value = mode.value === 'split'
      ? `已封装 ${parts.value.length} 个 MP4 片段，建议抽查播放`
      : `已生成 ${finishedFrames.value} 张图片`
  } catch (error) {
    status.value = controller.signal.aborted ? 'canceled' : 'error'
    errorText.value = friendlyError(error)
    progressLabel.value = status.value === 'canceled' ? '已取消' : '处理失败'
  } finally {
    currentAbort.value = null
  }
}
function cancel() { currentAbort.value?.abort() }
function savePreview(preview: FramePreview) {
  if (!preview.blob) return
  downloadBlob(preview.blob, preview.name)
}
function retry() { resetOutput(); errorText.value = '' }

function warnOnUnload(event: BeforeUnloadEvent) {
  if (status.value === 'running') {
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', warnOnUnload)

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnOnUnload)
  currentAbort.value?.abort()
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  for (const preview of frames.value) URL.revokeObjectURL(preview.url)
})
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="identity">
        <div class="mark"><span></span><span></span><span></span></div>
        <div class="brand-lockup"><strong>FrameSlice</strong><small>MEDIA UTILITY</small></div>
      </div>
      <div class="sidebar-label">工作空间</div>
      <nav class="sidebar-nav" aria-label="工具导航">
        <button type="button" class="nav-item" :class="{ active: mode === 'split' }" :disabled="status === 'running'" @click="changeMode('split')">
          <Scissors :size="18" stroke-width="1.9"/> <span>视频分割</span> <span class="nav-index">01</span>
        </button>
        <button type="button" class="nav-item" :class="{ active: mode === 'frames' }" :disabled="status === 'running'" @click="changeMode('frames')">
          <ImageIcon :size="18" stroke-width="1.9"/> <span>定时抽帧</span> <span class="nav-index">02</span>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <div class="local-notice"><ShieldCheck :size="19"/><div><strong>仅在本地处理</strong><span>视频不会上传至服务器</span></div></div>
        <a href="https://github.com/weepwood/FrameSlice" target="_blank" rel="noopener noreferrer" class="sidebar-link"><Github :size="17"/> GitHub 仓库 <ArrowRight :size="15"/></a>
        <div class="sidebar-version">FRAMESLICE / V0.1.0</div>
      </div>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div class="breadcrumbs">工具集 <span class="slash">/</span> <strong>{{ mode === 'split' ? '视频分割' : '定时抽帧' }}</strong></div>
        <div class="top-actions"><span class="privacy-indicator"><span></span> LOCAL ONLY</span><span class="header-separator"></span><span class="browser-label"><Monitor :size="14"/> Desktop</span></div>
      </header>

      <div class="content">
        <div class="page-head">
          <div class="eyebrow"><span class="eyebrow-dash"></span> MEDIA WORKSPACE / {{ mode === 'split' ? '01' : '02' }}</div>
          <h1>{{ mode === 'split' ? '视频分割' : '定时抽帧' }}<span class="heading-period">.</span></h1>
          <p>{{ mode === 'split' ? '将大型视频拆分成独立可播放的 MP4 文件，无需重新编码。' : '按设定时间间隔提取视频画面，批量导出为高质量图片。' }}</p>
        </div>

        <div class="step-head"><span class="step-number">01</span><h2>选择视频</h2><span class="step-description">从本地读取，不经过服务器</span></div>
        <input ref="fileInput" type="file" accept="video/*,.mp4,.m4v,.mov,.mkv,.webm" class="visually-hidden" @change="onInputChange" />
        <section v-if="!file" class="drop-zone" :class="{ dragging }" tabindex="0" role="button" aria-label="选择视频文件" @click="selectFile" @keydown.enter="selectFile" @keydown.space.prevent="selectFile" @dragover="onDragOver" @dragleave="onDragLeave" @drop.prevent="onDrop">
          <div class="drop-icon"><Upload :size="25" :stroke-width="1.6"/></div>
          <strong>拖放视频到这里，或点击选择</strong>
          <p>支持大型本地文件 · 不执行网络上传</p>
          <span class="drop-action">浏览文件 <ArrowRight :size="14"/></span>
        </section>
        <section v-else class="file-card">
          <div class="file-preview">
            <video v-if="videoUrl" :src="videoUrl" muted playsinline preload="metadata"></video>
            <Film :size="23" class="file-preview-icon"/>
          </div>
          <div class="file-meta">
            <div class="file-name" :title="file.name">{{ file.name }}</div>
            <div class="file-sub"><span>{{ humanBytes(file.size) }}</span><span class="separator-dot"></span><span>{{ info ? humanTime(info.duration) : '读取信息中…' }}</span><template v-if="info"><span class="separator-dot"></span><span>{{ info.width }} × {{ info.height }}</span></template></div>
            <div class="file-codec" v-if="info"><span>{{ info.videoCodec }}</span><span v-if="info.audioCodec">{{ info.audioCodec }}</span></div>
          </div>
          <div class="file-state"><span class="status-pill"><Check v-if="info" :size="13"/><span v-else class="small-spinner"></span>{{ info ? '已就绪' : '解析中' }}</span><button type="button" :disabled="status === 'running'" class="file-remove" @click="clearFile" title="移除文件"><X :size="17"/></button></div>
        </section>

        <div class="step-head step-two"><span class="step-number">02</span><h2>处理设置</h2><span class="step-description">按需要配置输出</span></div>
        <section class="config-panel" v-if="mode === 'split'">
          <div class="config-row">
            <div class="setting-copy"><div class="setting-icon"><Scissors :size="19"/></div><div><strong>分割方式</strong><span>按文件容量或视频时长分割</span></div></div>
            <div class="select-wrap"><select v-model="splitStrategy" :disabled="status === 'running'" aria-label="分割方式"><option value="size">按文件大小</option><option value="duration">按视频时长</option></select><ChevronDown :size="14"/></div>
          </div>
          <div v-if="splitStrategy === 'size'" class="config-row">
            <div class="setting-copy"><div class="setting-icon"><Layers2 :size="19"/></div><div><strong>单个文件大小</strong><span>根据关键帧位置自动选择切割点</span></div></div>
            <div class="config-control"><input type="number" v-model.number="size" :disabled="status === 'running'" min="0.032" step="0.1" class="number-input" aria-label="每份目标大小"/><div class="select-wrap"><select v-model="sizeUnit" :disabled="status === 'running'" aria-label="单位"><option value="GB">GB</option><option value="GiB">GiB</option></select><ChevronDown :size="14"/></div></div>
          </div>
          <div v-else class="config-row">
            <div class="setting-copy"><div class="setting-icon"><Clock3 :size="19"/></div><div><strong>每段视频时长</strong><span>以关键帧对齐；超出间隔时将提示无法无损分割</span></div></div>
            <div class="config-control"><input type="number" v-model.number="splitMinutes" :disabled="status === 'running'" min="0.01" max="100000" step="0.5" class="number-input" aria-label="每段时长（分钟）"/><span class="input-suffix">分钟</span></div>
          </div>
          <div class="config-row">
            <div class="setting-copy"><div class="setting-icon"><Zap :size="19"/></div><div><strong>无损快速分割</strong><span>复制压缩数据，尽可能保持原始画质</span></div></div>
            <span class="setting-tag">无需转码</span>
          </div>
          <div class="config-row last">
            <div class="setting-copy"><div class="setting-icon"><FolderOpen :size="19"/></div><div><strong>保存位置</strong><span>{{ selectedFolderName || '请指定本地输出目录' }}</span></div></div>
            <button type="button" :disabled="status === 'running' || !fileReadable" class="secondary-button" @click="pickFolder"><Folder :size="15"/>{{ selectedFolderName ? '更换目录' : '选择目录' }}</button>
          </div>
          <div class="config-footnote"><Info :size="16"/><span>按大小分割保留封装余量；按时长分割在关键帧位置切割，两者都不能保证精确均分。仅支持单视频轨、最多一条音轨。</span></div>
        </section>

        <section class="config-panel" v-else>
          <div class="config-row"><div class="setting-copy"><div class="setting-icon"><Clock3 :size="19"/></div><div><strong>截图间隔</strong><span>从 00:00 开始，每隔指定秒数提取画面</span></div></div><div class="config-control"><input class="number-input" type="number" min="0.1" max="36000" step="0.5" v-model.number="interval" :disabled="status === 'running'" aria-label="抽帧间隔秒数"/><span class="input-suffix">秒</span></div></div>
          <div class="config-row"><div class="setting-copy"><div class="setting-icon"><SlidersHorizontal :size="19"/></div><div><strong>截图时间范围</strong><span>只处理所选区间，避免无关帧与磁盘开销</span></div></div><div class="range-control"><input class="number-input" type="number" min="0" :max="info?.duration" step="0.1" v-model.number="frameStart" :disabled="status === 'running'" aria-label="截图开始秒数"/><span>至</span><input class="number-input" type="number" min="0" :max="info?.duration" step="0.1" v-model.number="frameEnd" :disabled="status === 'running'" aria-label="截图结束秒数"/><span>秒</span></div></div>
          <div class="config-row"><div class="setting-copy"><div class="setting-icon"><ImageIcon :size="19"/></div><div><strong>图片格式</strong><span>选择导出的图片编码格式</span></div></div><div class="select-wrap"><select v-model="imageFormat" :disabled="status === 'running'" aria-label="图片格式"><option value="image/jpeg">JPEG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select><ChevronDown :size="14"/></div></div>
          <div class="config-row"><div class="setting-copy"><div class="setting-icon"><SlidersHorizontal :size="19"/></div><div><strong>输出分辨率</strong><span>保持纵横比；小于设置值的视频不会放大</span></div></div><div class="select-wrap"><select v-model.number="imageWidth" :disabled="status === 'running'" aria-label="最大输出宽度"><option :value="0">原始尺寸</option><option :value="1280">1280 px</option><option :value="1920">1920 px</option><option :value="3840">3840 px</option></select><ChevronDown :size="14"/></div></div>
          <div v-if="imageFormat !== 'image/png'" class="config-row"><div class="setting-copy"><div class="setting-icon"><SlidersHorizontal :size="19"/></div><div><strong>图片压缩质量</strong><span>JPEG / WebP 输出质量，越高文件通常越大</span></div></div><div class="range-control"><input type="range" min="0.5" max="1" step="0.05" v-model.number="jpegQuality" :disabled="status === 'running'" aria-label="截图质量"/><span>{{ Math.round(jpegQuality * 100) }}%</span></div></div>
          <div class="config-row last"><div class="setting-copy"><div class="setting-icon"><FolderOpen :size="19"/></div><div><strong>保存位置</strong><span>{{ selectedFolderName || '未选择目录，最多生成 30 张可下载预览' }}</span></div></div><button type="button" :disabled="status === 'running' || !fileReadable" class="secondary-button" @click="pickFolder"><Folder :size="15"/>{{ selectedFolderName ? '更换目录' : '选择目录' }}</button></div>
          <div class="config-footnote"><Info :size="16"/><span>图片在本地解码并直接写入磁盘；部分 HEVC、AV1 视频取决于浏览器解码能力。</span></div>
        </section>

        <section class="execution" v-if="file && info">
          <div class="execution-summary"><div><span class="summary-label">预计输出</span><strong>{{ mode === 'split' ? `约 ${estimatedParts} 个视频文件` : `${estimatedFrames} 张图片` }}</strong></div><div><span class="summary-label">处理方式</span><strong>{{ mode === 'split' ? (splitStrategy === 'duration' ? '按时长 · 关键帧无损' : '按大小 · 关键帧无损') : '本地解码 · 逐张导出' }}</strong></div><div><span class="summary-label">网络传输</span><strong>0 B <Check :size="14" class="no-upload-check"/></strong></div></div>
          <button v-if="status !== 'running'" type="button" class="primary-button" :disabled="!canRun" @click="start"><Play :size="16" fill="currentColor"/> {{ mode === 'split' ? '开始分割视频' : '开始提取图片' }} <ArrowRight :size="17"/></button>
          <button v-else type="button" class="cancel-button" @click="cancel"><PauseCircle :size="16"/> 取消任务</button>
        </section>
        <div class="empty-action" v-else><Info :size="16"/> {{ loading ? '正在读取媒体信息…' : '请先选择一个视频文件以配置并开始处理。' }}</div>

        <section v-if="status !== 'idle'" class="result-section" aria-live="polite">
          <div class="step-head"><span class="step-number">03</span><h2>任务结果</h2><span class="step-description">{{ status === 'running' ? '处理中' : status === 'done' ? '处理完毕' : '状态信息' }}</span></div>
          <div class="status-card" :class="{ success: status === 'done', failure: status === 'error' }"><div class="status-card-head"><div class="status-icon"><BadgeCheck v-if="status === 'done'" :size="19"/><AlertTriangle v-else-if="status === 'error'" :size="19"/><CircleHelp v-else-if="status === 'canceled'" :size="19"/><RotateCcw v-else :size="19" class="rotating"/></div><div class="status-details"><strong>{{ status === 'running' ? '正在处理' : status === 'done' ? '任务完成' : status === 'canceled' ? '任务已取消' : '处理失败' }}</strong><span>{{ progressLabel }}</span></div><div class="status-percent">{{ progressPercent }}%</div></div><div class="progress-track"><div class="progress-fill" :style="{ width: `${progressPercent}%` }"></div></div><p v-if="lastJobFolder" class="output-path">保存目录：{{ lastJobFolder }}</p><p v-if="errorText" class="status-error">{{ errorText }}</p><button v-if="status === 'error' || status === 'canceled'" type="button" class="text-button" @click="retry">重新配置任务 <ArrowRight :size="14"/></button></div>
          <div v-if="parts.length" class="result-list"><div v-for="item in parts" :key="item.filename" class="result-item"><div class="result-file-icon"><FileVideo :size="18"/></div><div class="result-file-name"><strong>{{ item.filename }}</strong><span>{{ humanTime(item.start) }} — {{ humanTime(item.end) }}</span></div><span class="result-size">{{ humanBytes(item.size) }}</span><Check :size="17" class="result-check"/></div></div>
          <div v-if="frames.length" class="frame-gallery"><div v-for="item in frames" :key="item.name" class="frame-tile"><img :src="item.url" :alt="`截图 ${humanTime(item.timestamp)}`" loading="lazy"/><div class="frame-caption"><span>{{ humanTime(item.timestamp) }}</span><button v-if="item.blob" class="frame-download" type="button" :title="`下载 ${item.name}`" @click="savePreview(item)"><ArrowDownToLine :size="15"/></button><Check v-else :size="14" class="frame-saved"/></div></div></div>
        </section>

        <div v-if="errorText && status === 'idle'" class="inline-error"><AlertTriangle :size="17"/><span>{{ errorText }}</span><button type="button" @click="errorText = ''" aria-label="关闭"><X :size="16"/></button></div>
        <footer class="footer"><span>FrameSlice — Process locally, keep control.</span><span><LockKeyhole :size="13"/> 文件始终保留在你的设备上</span></footer>
      </div>
    </main>
    <aside class="right-panel"><div class="right-panel-inner"><div class="right-eyebrow"><Settings2 :size="14"/> WORKFLOW NOTES</div><h3>简洁、快速、<br/>私密的视频工具。</h3><p>视频文件直接从本地读取。你可以处理数 GB 的视频，而不必等待上传。</p><div class="rule"></div><div class="side-section-title">处理流程</div><div class="workflow-step"><span>01</span><div><strong>选择文件</strong><p>浏览器按需读取本地内容</p></div></div><div class="workflow-step"><span>02</span><div><strong>设置参数</strong><p>分割大小或截图时间间隔</p></div></div><div class="workflow-step"><span>03</span><div><strong>直接保存</strong><p>流式写入电脑指定目录</p></div></div><div class="rule"></div><div class="side-tip"><HardDrive :size="19"/><div><strong>大型文件提示</strong><p>处理 12GB 视频时，请预留至少 12GB 以上的输出空间和一定的临时空间，并保持标签页开启。</p></div></div><div class="side-privacy"><LockKeyhole :size="15"/><span>NO UPLOADS. NO ACCOUNTS.</span></div></div></aside>
  </div>
</template>
