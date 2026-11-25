<script setup lang="ts">
import WorkspaceHeader from './components/WorkspaceHeader.vue'
import SidebarStatus from './components/SidebarStatus.vue'
import JobStatus from './components/JobStatus.vue'
import { ChevronDown, ListChecks, FileVideo } from 'lucide-vue-next'
import WorkbenchNumber from "./components/WorkbenchNumber.vue"
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowDownToLine, ArrowRight, BadgeCheck, Check, CircleHelp, Clock3,
  Subtitles, PackageOpen, Folder, FolderOpen, Image as ImageIcon, Info, Layers2,
  PauseCircle, Play, RotateCcw, Scissors, ShieldCheck, SlidersHorizontal,
  Upload, X, AlertTriangle, Film, PanelRight,
} from 'lucide-vue-next'
import { humanBytes, humanTime, plannedFrameCount, friendlyError, baseName } from './lib/format'
import type { VideoInfo } from './lib/media'
import type { FramePreview, FrameSnapshot, FrameFormat, FrameWidth, FrameStrategy } from './lib/frames'
import type { SplitResult, SplitPlanEntry } from './lib/split'
import { chooseFolder, downloadBlob, supportsFolderWrite, saveBlob } from './lib/storage'
import { inspectWithWorker, runWorkerJob, analyzeWithWorker } from './lib/worker-client'
import type { WorkerPayload } from './lib/worker-client'
import type { VerificationLevel } from './lib/verify'
import type { KeyframeStatistics } from './lib/keyframe-stats.mjs'
import { createExportManifest } from './lib/manifest.mjs'
import { createStoryboard } from './lib/storyboard'
import CaptionWorkspace from './components/CaptionWorkspace.vue'
import {readResetResult} from './lib/reset-storage'
import ContainerWorkspace from './components/ContainerWorkspace.vue'
import MediaTimeline from './components/MediaTimeline.vue'
import {SplitterGroup,SplitterPanel,SplitterResizeHandle,SliderRoot,SliderTrack,SliderRange,SliderThumb,CollapsibleRoot,CollapsibleTrigger,CollapsibleContent} from 'reka-ui'
import MediaResourceLibrary from './components/MediaResourceLibrary.vue'
import WorkbenchCheckbox from './components/WorkbenchCheckbox.vue'
import WorkbenchProgress from './components/WorkbenchProgress.vue'
import WorkbenchSelect from './components/WorkbenchSelect.vue'
import MediaResults from './components/MediaResults.vue'
import {useTimelinePreviews} from './composables/useTimelinePreviews'
import WorkbenchButton from './components/WorkbenchButton.vue'
import {version} from '../package.json'
import JobCenter from './components/JobCenter.vue'
import { workspace } from './core/workspace'
import type { MediaJob, RetryParameters } from './core/workspace'
import { createResumeSession,loadResumeSession,authorizeResumeFolder } from './core/resume'
import type { ResumeSession } from './core/resume'
import {nearestKey} from './lib/timeline-index.mjs'
import { sampleFingerprint } from './core/source-identity'

type Mode = 'split' | 'frames' | 'captions'
type Status = 'idle' | 'running' | 'done' | 'error' | 'canceled'

const startInCaption = window.location.hash === '#captions'
const mode = ref<Mode>(startInCaption ? 'captions' : 'split')
const captionVisited = ref(startInCaption)
const videoTool = ref<'split' | 'container'>('split')
const containerVisited = ref(false)
const containerBusy = ref(false)
const recentJobs = ref<MediaJob[]>([])
const retryTarget=ref<MediaJob|null>(null)
const retryNotice=ref('')
const resumeEnabled=ref(false)
const resumeSession=ref<ResumeSession|null>(null)
const theme=ref<'system'|'light'|'dark'>('system')
try{const saved=localStorage.getItem('frameslice.theme');if(saved==='light'||saved==='dark')theme.value=saved}catch{}
function applyTheme(){document.documentElement.dataset.fsTheme=theme.value;try{localStorage.setItem('frameslice.theme',theme.value)}catch{}}
applyTheme()
const unsubscribeJobs = workspace.subscribe(jobs => { recentJobs.value = jobs })
const jobLabels: Record<string, string> = {inspect:'媒体读取',analyze:'视频体检',split:'无损分割',frames:'定时抽帧','container-scan':'轨道读取','extract-tracks':'轨道提取',remux:'重新封装',waveform:'波形',transcribe:'语音转录',burn:'字幕烧录'}
const jobStates: Record<string,string> = {queued:'等待中',running:'运行中',canceling:'取消中',completed:'已完成',partial:'部分完成',failed:'失败',canceled:'已取消',interrupted:'已中断'}
const subtitleHandoff = ref<{ file: File; subtitle: File } | null>(null)
const file = ref<File | null>(null)
const mediaLibrary=ref<File[]>([])
const leftWidth=ref(232),rightWidth=ref(288),inspectorOpen=ref(true)
try{const p=JSON.parse(localStorage.getItem('frameslice.layout')??'{}');if(Number.isFinite(p.left))leftWidth.value=Math.min(320,Math.max(190,p.left));if(Number.isFinite(p.right))rightWidth.value=Math.min(400,Math.max(240,p.right));if(typeof p.inspector==='boolean')inspectorOpen.value=p.inspector}catch{}
function saveLayout(){try{localStorage.setItem('frameslice.layout',JSON.stringify({left:leftWidth.value,right:rightWidth.value,inspector:inspectorOpen.value}))}catch{}}
const mediaQuery=window.matchMedia('(min-width:1141px)')
const wideLayout=ref(mediaQuery.matches)
function onViewport(e:MediaQueryListEvent){wideLayout.value=e.matches}
onMounted(()=>mediaQuery.addEventListener('change',onViewport))
onBeforeUnmount(()=>mediaQuery.removeEventListener('change',onViewport))
function importMedia(){const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='video/*,.mp4,.mov,.mkv,.webm';input.onchange=()=>{const files=Array.from(input.files??[]).slice(0,50);for(const item of files)if(mediaLibrary.value.length<50)mediaLibrary.value.push(item);if(!file.value&&files[0])void loadFile(files[0])};input.click()}
function removeMedia(item:File){if(file.value===item)clearFile();mediaLibrary.value=mediaLibrary.value.filter(f=>f!==item)}
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
const missedFrames=ref<number[]>([])
const splitPlan=ref<SplitPlanEntry[]>([])
const planKey=ref('')
const planning=ref(false)
const planError=ref('')
let planAbort:AbortController|null=null
const jobElapsedMs = ref(0)
const mediaAnalysis = ref<KeyframeStatistics | null>(null)
const analyzing = ref(false)
const analysisProgress = ref(0)
const analysisError = ref('')
const exportReportJson = ref('')
const reportNotice = ref('')
const savedFrameNames = ref<string[]>([])
let storyboardRevision=0
const storyboardBusy = ref(false)
const storyboardError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const confirmation = ref(false)
const currentAbort = ref<AbortController | null>(null)

const splitStrategy = ref<'size' | 'duration'>('size')
const manualCuts=ref<number[]>([])
const frameStrategy=ref<FrameStrategy>('interval')
const deduplicate=ref(false)
const candidateCount=ref(3),minSharpness=ref(0),sceneThreshold=ref(.24)
const filteredCount=ref(0)
const resetResult=Boolean(readResetResult())
const showJobs=ref(resetResult),jobsVisited=ref(resetResult)
const pageDescriptor=computed(()=>showJobs.value?{title:'任务中心',description:'查看处理进度、历史记录与批量任务',icon:Layers2}:mode.value==='captions'?{title:'字幕工作台',description:'编辑字幕、语音转录与精确校对',icon:Subtitles}:mode.value==='frames'?{title:'定时抽帧',description:'按时间区间提取和管理视频画面',icon:ImageIcon}:videoTool.value==='container'?{title:'轨道与封装',description:'提取轨道、重新封装与无损剪辑',icon:PackageOpen}:{title:'视频分割',description:'按大小或时长无损分割本地视频',icon:Scissors})
const activeJobs=computed(()=>recentJobs.value.filter(j=>['queued','running','canceling'].includes(j.status)).length)

const settingsTarget=ref<HTMLElement|null>(null)
const actionTarget=ref<HTMLElement|null>(null)
const actionInToolbar=computed(()=>Boolean(actionTarget.value&&wideLayout.value&&!showJobs.value&&mode.value!=='captions'&&!(mode.value==='split'&&videoTool.value==='container')))
const settingsInInspector=computed(()=>Boolean(settingsTarget.value&&wideLayout.value&&inspectorOpen.value&&!showJobs.value&&mode.value!=='captions'&&!(mode.value==='split'&&videoTool.value==='container')))
const previewVideo=ref<HTMLVideoElement|null>(null)
watch([mode,showJobs,videoTool,status],()=>{if(showJobs.value||mode.value==='captions'||(mode.value==='split'&&videoTool.value==='container')||status.value==='running')previewVideo.value?.pause()})
const timelineTime=ref(0)
const timeline=useTimelinePreviews(file,info,e=>{errorText.value=friendlyError(e)})
const timelineThumbnails=timeline.thumbnails,timelineLoading=timeline.loading,loadTimeline=timeline.load
function clearTimeline(){timeline.clear();timelineTime.value=0;manualCuts.value=[]}
function seekTimeline(time:number){if(!Number.isFinite(time))return;const next=Math.max(0,Math.min(info.value?.duration??0,time));timelineTime.value=next;const video=previewVideo.value;if(video&&video.readyState>=1&&Math.abs(video.currentTime-next)>.001){try{video.currentTime=next}catch{/* unsupported browser preview; processing remains available */}}}
function moveManualCut(old:number,time:number){const key=nearestKey(mediaAnalysis.value?.safeKeyframeIndex??[],time);if(key===undefined||key<=0||key>=(info.value?.duration??0)||!manualCuts.value.includes(old)||manualCuts.value.some(x=>x===key&&x!==old))return;manualCuts.value=manualCuts.value.map(x=>x===old?key:x).sort((a,b)=>a-b)}
function addManualCut(time:number){const keys=mediaAnalysis.value?.safeKeyframeIndex??[];const key=nearestKey(keys,time);if(key===undefined||key<=0||key>=(info.value?.duration??0)){errorText.value='请选择有效的内部关键帧边界';return}manualCuts.value=[...new Set([...manualCuts.value,key])].sort((a,b)=>a-b);splitStrategy.value='size'}
const splitMinutes = ref(10)
const verificationLevel = ref<VerificationLevel>('quick')
const size = ref(4)
const sizeUnit = ref<'GB' | 'GiB'>('GB')
const interval = ref(30)
const frameStart = ref(0)
const frameEnd = ref(0)
const imageFormat = ref<FrameFormat>('image/jpeg')
const imageWidth = ref<FrameWidth>(1920)
const jpegQuality = ref(0.9)

const targetBytes = computed(() => Math.floor(size.value * (sizeUnit.value === 'GiB' ? 1024 ** 3 : 1000 ** 3)))
const currentPlanKey=computed(()=>JSON.stringify([file.value?.name,file.value?.size,file.value?.lastModified,splitStrategy.value,targetBytes.value,splitMinutes.value,manualCuts.value]))
const visiblePlan=computed(()=>planKey.value===currentPlanKey.value?splitPlan.value:[])
const estimatedParts = computed(() => {
  if(visiblePlan.value.length)return visiblePlan.value.length
  if(manualCuts.value.length)return manualCuts.value.length+1
  if (!file.value || !info.value) return 0
  if (splitStrategy.value === 'duration') {
    return Number.isFinite(splitMinutes.value) && splitMinutes.value > 0
      ? Math.max(1, Math.ceil(info.value.duration / (splitMinutes.value * 60)))
      : 0
  }
  return Math.max(1, Math.ceil(file.value.size / Math.max(1, targetBytes.value * 0.95)))
})
const estimatedFrames = computed(() => info.value ? plannedFrameCount(info.value.duration, interval.value, frameStart.value, frameEnd.value) : 0)
const fileReadable = computed(() => supportsFolderWrite())
const outputAvailable=computed(()=>fileReadable.value||!!outputFolder.value||!!resumeSession.value)
const outputLimit=computed(()=>{
  if(outputAvailable.value)return ''
  if(mode.value==='split')return '当前浏览器不支持选择本地输出目录，无损分割需要桌面 Chrome / Edge。仍可查看媒体信息和分割规划。'
  if(estimatedFrames.value>30)return '当前浏览器不支持选择本地输出目录；请缩短区间或增加间隔，使抽帧数量不超过 30 张。'
  return ''
})
const canRun = computed(() => Boolean(file.value && info.value && !loading.value && !analyzing.value && !planning.value && status.value !== 'running' && !outputLimit.value))
const progressPercent = computed(() => Math.round(progress.value * 100))

let parseRevision = 0
let inspectController: AbortController | null = null
let analysisController: AbortController | null = null
async function loadFile(nextFile?: File | null) {
  if (!nextFile || status.value === 'running') return
  if (nextFile.size === 0) { errorText.value = '无法处理空文件。'; return }
  inspectController?.abort()
  planAbort?.abort();splitPlan.value=[];planKey.value='';planError.value=''
  clearAnalysis()
  inspectController = new AbortController()
  parseRevision += 1
  clearTimeline();resumeSession.value=null
  if(nextFile&&!mediaLibrary.value.includes(nextFile)&&mediaLibrary.value.length<50)mediaLibrary.value.push(nextFile)
  const revision = parseRevision
  resetOutput()
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  file.value = nextFile
  info.value = null
  videoUrl.value = URL.createObjectURL(nextFile)
  loading.value = true
  errorText.value = ''
  try {
    const signal = inspectController.signal
    const inspected = workspace.cached<VideoInfo>(nextFile, 'video-info') ?? await workspace.run('inspect', nextFile, signal, () => inspectWithWorker(nextFile, signal))
    workspace.cache(nextFile, 'video-info', inspected)
    if (revision === parseRevision) {
      info.value = inspected
      frameStart.value = 0
      frameEnd.value = inspected.duration
    }
  } catch (error) {
    if (revision === parseRevision) errorText.value = `文件信息读取失败：${friendlyError(error)}`
  } finally {
    if (revision === parseRevision) {
      loading.value = false
      inspectController = null
    }
  }
}

function clearAnalysis() {
  analysisController?.abort()
  analysisController = null
  mediaAnalysis.value = null
  analyzing.value = false
  analysisProgress.value = 0
  analysisError.value = ''
}
async function runAnalysis() {
  if (!file.value || !info.value || analyzing.value || status.value === 'running') return
  const targetFile = file.value
  const controller = new AbortController()
  analysisController = controller
  analyzing.value = true
  analysisError.value = ''
  analysisProgress.value = 0
  try {
    const report = workspace.cached<KeyframeStatistics>(targetFile, 'gop') ?? await workspace.run('analyze', targetFile, controller.signal, ctx => analyzeWithWorker(targetFile, controller.signal, fraction => {
      analysisProgress.value = Math.max(0, Math.min(1, fraction)); ctx.progress(fraction)
    }))
    workspace.cache(targetFile, 'gop', report)
    if (!controller.signal.aborted && file.value === targetFile) mediaAnalysis.value = report
  } catch (error) {
    if (!controller.signal.aborted && file.value === targetFile) {
      analysisError.value = friendlyError(error)
    }
  } finally {
    if (analysisController === controller) {
      analyzing.value = false
      analysisController = null
    }
  }
}
function cancelAnalysis() { analysisController?.abort() }

const analysisWarnings = computed(() => {
  const result = mediaAnalysis.value
  if (!result) return []
  const warnings = [...result.warnings]
  if (mode.value === 'split' && splitStrategy.value === 'duration' &&
      result.maxGopSeconds > splitMinutes.value * 60 + 0.001) {
    warnings.push('最长关键帧间隔超过当前目标分割时长，需要增大时长才能保证无损分割。')
  }
  if (mode.value === 'split' && splitStrategy.value === 'size' &&
      result.maxGopVideoBytes > targetBytes.value * 0.95) {
    warnings.push('至少一个视频关键帧组的字节数已超过分割容量预算；加上音轨后更可能无法切割。')
  }
  return warnings
})
const maxAnalysisBitrate = computed(() => Math.max(0.001, ...(mediaAnalysis.value?.bitrateBins ?? [])))

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
  missedFrames.value=[];filteredCount.value=0
  jobElapsedMs.value = 0
  exportReportJson.value = ''
  reportNotice.value = ''
  savedFrameNames.value = []
  storyboardRevision++
  storyboardBusy.value = false
  storyboardError.value = ''
  status.value = 'idle'
  progress.value = 0
  progressLabel.value = ''
  confirmation.value = false
  lastJobFolder.value = ''
}
function clearFile() {
  if (status.value === 'running') return
  clearTimeline();resumeSession.value=null
  parseRevision++
  planAbort?.abort();splitPlan.value=[];planKey.value='';planError.value=''
  inspectController?.abort()
  inspectController = null
  loading.value = false
  clearAnalysis()
  resetOutput()
  file.value = null
  info.value = null
  errorText.value = ''
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  videoUrl.value = ''
}
function acceptSubtitleHandoff(event: Event) {
  const data = (event as CustomEvent<{ file: File; subtitle: File }>).detail
  if (!data || !(data.file instanceof File) || !(data.subtitle instanceof File) ||
    status.value === 'running' || containerBusy.value) return
  subtitleHandoff.value = { file: data.file, subtitle: data.subtitle }
  containerVisited.value = true
  videoTool.value = 'container'
  mode.value = 'split'
}
onMounted(() => window.addEventListener('frameslice:subtitle-package', acceptSubtitleHandoff))

function changeVideoTool(next: 'split' | 'container') {
  if (containerBusy.value || status.value === 'running' || videoTool.value === next) return
  if (next === 'container') containerVisited.value = true
  videoTool.value = next
}
function changeMode(next: Mode) {
  if (status.value === 'running' || containerBusy.value || next === mode.value) return
  if (next === 'captions') captionVisited.value = true
  // The #captions fragment is only a compatibility deep link.
  // Switching tool tabs must stay in the same page without navigation.
  if (window.location.hash === '#captions') {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  // Switching between video tools resets the prior tool's result, but entering
  // and leaving the subtitle editor must not destroy either workspace's state.
  if (mode.value !== 'captions' && next !== 'captions') {
    resetOutput()
    errorText.value = ''
  }
  mode.value = next
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
function addPreview(snapshot: FrameSnapshot) {
  const preview: FramePreview = {
    name: snapshot.name, timestamp: snapshot.timestamp, sharpness:snapshot.sharpness,
    url: URL.createObjectURL(snapshot.blob),
    blob: outputFolder.value ? undefined : snapshot.blob,
  }
  frames.value.push(preview)
  const max = outputFolder.value||resumeSession.value ? 16 : 30
  while (frames.value.length > max) {
    const old = frames.value.shift()
    if (old) URL.revokeObjectURL(old.url)
  }
}
async function previewSplitPlan(){
  if(!file.value||!info.value||planning.value||status.value==='running')return
  const target=file.value,key=currentPlanKey.value,controller=new AbortController();planAbort=controller;planning.value=true;planError.value=''
  try{await workspace.run('analyze',target,controller.signal,ctx=>runWorkerJob({mode:'split',file:target,folder:null,planOnly:true,maxBytes:targetBytes.value,manualCuts:manualCuts.value.length?[...manualCuts.value]:undefined,maxSeconds:splitStrategy.value==='duration'?splitMinutes.value*60:undefined,verificationLevel:verificationLevel.value},controller.signal,{onProgress:(p,l)=>ctx.progress(p,l),onSegment:()=>{},onPreview:()=>{},onPlan:entries=>{if(!controller.signal.aborted&&file.value===target&&key===currentPlanKey.value){splitPlan.value=entries;planKey.value=key}}}))}
  catch(e){if(!controller.signal.aborted)planError.value=friendlyError(e)}finally{if(planAbort===controller){planning.value=false;planAbort=null}}
}
function requestRetry(job:MediaJob){
  if(status.value==='running'||containerBusy.value||!job.retry)return
  resumeSession.value=null;retryTarget.value=job;retryNotice.value='请选择原始视频以重新关联。'
  const input=document.createElement('input');input.type='file';input.accept='video/*,.mp4,.mov,.mkv,.webm';input.onchange=e=>void relinkRetry(e);input.click()
}
async function relinkRetry(event:Event){
  const input=event.target as HTMLInputElement,target=retryTarget.value,selected=input.files?.[0];input.value='';retryTarget.value=null
  if(!target?.retry||!selected)return
  try{
    if(selected.size!==target.asset.bytes||await sampleFingerprint(selected)!==target.retry.fingerprint)throw Error('源文件大小或抽样指纹不一致，拒绝重新关联。')
    const params=target.retry.parameters
    changeMode(params.mode);if(params.mode==='split')changeVideoTool('split')
    await loadFile(selected)
    if(file.value!==selected||!info.value)throw Error('源媒体读取失败')
    if(params.mode==='split'){
      splitStrategy.value=params.maxSeconds===undefined?'size':'duration';sizeUnit.value='GB';size.value=params.maxBytes/1e9;splitMinutes.value=(params.maxSeconds??600)/60;verificationLevel.value=params.verificationLevel;manualCuts.value=params.manualCuts??[]
    }else{interval.value=params.interval;frameStart.value=params.startTime;frameEnd.value=params.endTime;imageFormat.value=params.format;imageWidth.value=params.width;jpegQuality.value=params.quality;frameStrategy.value=params.strategy??'interval';deduplicate.value=!!params.deduplicate;candidateCount.value=params.candidates??3;minSharpness.value=params.minSharpness??0;sceneThreshold.value=params.sceneThreshold??.24}
    outputFolder.value=null;selectedFolderName.value=''
    resumeSession.value=target.retry.resumeId?await loadResumeSession(target.retry.resumeId)??null:null
    resumeEnabled.value=!!resumeSession.value
    retryNotice.value=resumeSession.value?'已恢复参数与原目录引用，点击开始后验证完整源文件和历史输出。':'已恢复参数；请选择新目录重新处理。'
  }catch(e){retryNotice.value=friendlyError(e)}
}
async function start() {
  if (!file.value || !info.value || planning.value || status.value === 'running') return
  if(outputLimit.value){errorText.value=outputLimit.value;return}
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
  if(mode.value==='frames'&&(frameStrategy.value!=='interval'||deduplicate.value)&&(resumeEnabled.value||resumeSession.value)){errorText.value='智能抽帧暂不支持断点续作，请关闭续作或使用定时抽帧';return}
  if(resumeSession.value){try{await authorizeResumeFolder(resumeSession.value.folder)}catch(e){errorText.value=friendlyError(e);return}}
  if (!resumeSession.value && !outputFolder.value && supportsFolderWrite()) {
    try { await pickFolder() } catch { /* picker manages its own error */ }
  }
  if(resumeEnabled.value&&!outputFolder.value&&!resumeSession.value){errorText.value='断点续作需要已授权的本地输出目录。请选择目录或关闭续作。';return}
  if (mode.value === 'split' && !outputFolder.value && !resumeSession.value) {
    errorText.value = '大视频分割必须先选择输出文件夹。请使用桌面 Chrome / Edge。'; return
  }
  if (mode.value === 'frames' && !outputFolder.value && !resumeSession.value && estimatedFrames.value > 30) {
    errorText.value = '此浏览器不支持直接保存文件夹，单次最多生成 30 张可单独下载的图片。'; return
  }
  if (mode.value === 'split' && info.value.videoTracks !== 1) {
    errorText.value = '目前只支持单视频轨无损切割。'; return
  }
  if (mode.value === 'split' && info.value.audioTracks > 1) {
    errorText.value = '目前最多支持一条音轨，避免导出时丢失其他音轨。'; return
  }
  // Avoid processing two expensive jobs in parallel with the analysis scan.
  if (analyzing.value) { errorText.value = '请先完成或取消视频体检后再开始处理。'; return }
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
    const jobFolder = resumeSession.value?.folder ?? (outputFolder.value
      ? await outputFolder.value.getDirectoryHandle(
          `${baseName(currentFile.name)}_${mode.value}_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
          { create: true },
        )
      : null)
    if(resumeEnabled.value && jobFolder && !resumeSession.value)resumeSession.value=await createResumeSession(jobFolder)
    if (jobFolder) lastJobFolder.value = `${selectedFolderName.value}/${jobFolder.name}`
    if (controller.signal.aborted) throw new DOMException('任务已取消', 'AbortError')
    const payload: WorkerPayload = mode.value === 'split'
      ? {
          mode: 'split', file: currentFile, folder: jobFolder,
          maxBytes: targetBytes.value,
          maxSeconds: splitStrategy.value === 'duration'&&!manualCuts.value.length ? splitMinutes.value * 60 : undefined,
          manualCuts:manualCuts.value.length?[...manualCuts.value]:undefined,
          verificationLevel: verificationLevel.value,
        }
      : {
          mode: 'frames', file: currentFile, folder: jobFolder,
          duration: currentInfo.duration, interval: interval.value,
          startTime: frameStart.value, endTime: frameEnd.value,
          format: imageFormat.value, width: imageWidth.value, quality: jpegQuality.value,
          strategy:frameStrategy.value,deduplicate:deduplicate.value,...(frameStrategy.value==='sharpest'?{candidates:candidateCount.value,minSharpness:minSharpness.value}:frameStrategy.value==='scene'?{sceneThreshold:sceneThreshold.value}:{}),
        }
    const retryParameters:RetryParameters=payload.mode==='split'?{mode:'split',maxBytes:payload.maxBytes,maxSeconds:payload.maxSeconds,manualCuts:payload.manualCuts,verificationLevel:payload.verificationLevel}:{mode:'frames',interval:payload.interval,startTime:payload.startTime,endTime:payload.endTime,format:payload.format,width:payload.width,quality:payload.quality,strategy:payload.strategy,deduplicate:payload.deduplicate,candidates:payload.candidates,minSharpness:payload.minSharpness,sceneThreshold:payload.sceneThreshold}
    const resumeId=resumeSession.value?.id
    if(resumeId)payload.resumeId=resumeId
    const fingerprint=await sampleFingerprint(currentFile)
    const summary = await workspace.run(payload.mode, currentFile, controller.signal, async ctx => {
      const result=await runWorkerJob(payload, controller.signal, {
      onProgress: (value, text) => { progress.value = value; progressLabel.value = text; ctx.progress(value, text) },
      onSegment: part => { parts.value.push(part); ctx.checkpoint(part.filename) },
      onPreview: addPreview,
      onSaved: name => { savedFrameNames.value.push(name); ctx.checkpoint(name) },
      onMissed: time=>missedFrames.value.push(time),
      onFiltered:()=>filteredCount.value++,
      onPlan: entries=>{splitPlan.value=entries;planKey.value=currentPlanKey.value},
      })
      if(missedFrames.value.length)ctx.partial('存在遗漏帧，已重试')
      return result
    },{fingerprint,parameters:retryParameters,resumeId})
    jobElapsedMs.value = summary.elapsedMs
    if (mode.value === 'frames') finishedFrames.value = summary.count
    // Human-readable JSON alongside the media outputs; no original file paths.
    const report = createExportManifest({
      source: currentInfo,
      mode: mode.value === 'split' ? 'split' : 'frames',
      settings: mode.value === 'split'
        ? { strategy: splitStrategy.value, targetBytes: splitStrategy.value === 'size' ? targetBytes.value : null,
            maxSeconds: splitStrategy.value === 'duration' ? splitMinutes.value * 60 : null,
            verificationLevel: verificationLevel.value,manualCuts:manualCuts.value }
        : { intervalSeconds: interval.value, startSeconds: frameStart.value,
            endSeconds: frameEnd.value, format: imageFormat.value,
            width: imageWidth.value, quality: jpegQuality.value,strategy:frameStrategy.value,deduplicate:deduplicate.value,candidates:candidateCount.value,minSharpness:minSharpness.value,sceneThreshold:sceneThreshold.value,filteredCount:filteredCount.value },
      parts: parts.value,
      images: jobFolder ? savedFrameNames.value : frames.value.map(item => item.name),
      completedFrames: finishedFrames.value,
      missedFrames: missedFrames.value,
      elapsedMs: summary.elapsedMs,
    })
    exportReportJson.value = JSON.stringify(report, null, 2)
    if (jobFolder) {
      try {
        await saveBlob(jobFolder, 'frameslice-report.json',
          new Blob([exportReportJson.value], { type: 'application/json' }), new AbortController().signal)
        reportNotice.value = '处理报告已保存到输出目录'
      } catch (error) {
        reportNotice.value = '自动保存报告失败，可以点击下方按钮下载：' + friendlyError(error)
      }
    }
    status.value = 'done'
    if(!missedFrames.value.length)resumeSession.value=null
    progress.value = 1
    progressLabel.value = mode.value === 'split'
      ? `已封装并校验 ${parts.value.length} 个 MP4 片段`
      : `已生成 ${finishedFrames.value} 张图片${missedFrames.value.length?'，仍遗漏 '+missedFrames.value.length+' 张':''}`
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
function downloadManifest() {
  if (!exportReportJson.value || !file.value) return
  downloadBlob(new Blob([exportReportJson.value], { type: 'application/json;charset=utf-8' }),
    baseName(file.value.name) + '_report.json')
}
async function downloadStoryboard() {
  if (!frames.value.length || storyboardBusy.value || !file.value) return
  const revision=++storyboardRevision,source=file.value,previews=[...frames.value]
  storyboardBusy.value = true
  storyboardError.value = ''
  try {
    const blob = await createStoryboard(previews, source.name)
    if(revision===storyboardRevision&&file.value===source)downloadBlob(blob, baseName(source.name) + '_storyboard.jpg')
  } catch (error) {
    if(revision===storyboardRevision)storyboardError.value = friendlyError(error)
  } finally {
    if(revision===storyboardRevision)storyboardBusy.value = false
  }
}
function retry() { resetOutput(); errorText.value = '' }

function warnOnUnload(event: BeforeUnloadEvent) {
  if (status.value === 'running' || containerBusy.value || workspace.hasActive()) {
    event.preventDefault()
    event.returnValue = ''
  }
}
window.addEventListener('beforeunload', warnOnUnload)

onBeforeUnmount(() => {
  storyboardRevision++
  clearTimeline()
  unsubscribeJobs()
  window.removeEventListener('frameslice:subtitle-package', acceptSubtitleHandoff)
  inspectController?.abort()
  analysisController?.abort()
  planAbort?.abort()
  window.removeEventListener('beforeunload', warnOnUnload)
  currentAbort.value?.abort()
  if (videoUrl.value) URL.revokeObjectURL(videoUrl.value)
  for (const preview of frames.value) URL.revokeObjectURL(preview.url)
})
</script>

<template>
  <SplitterGroup id="frameslice-workbench" direction="horizontal" auto-save-id="frameslice-workbench-v2" :keyboard-resize-by="1" class="app-shell fs-workbench fs-reka-workbench" :class="{ 'caption-active': mode === 'captions'&&!showJobs, 'jobs-active':showJobs, 'inspector-hidden':!inspectorOpen }" :style="{'--fs-left-width':leftWidth+'px','--fs-right-width':rightWidth+'px'}">
    <SplitterPanel id="frameslice-resources" :order="1" size-unit="px" :default-size="leftWidth" :min-size="190" :max-size="320" as="aside" class="sidebar">
      <div class="identity">
        <div class="mark"><span></span><span></span><span></span></div>
        <div class="brand-lockup"><strong>FrameSlice</strong><small>本地媒体工具</small></div>
      </div>
      <div class="sidebar-label">工作空间</div>
      <nav class="sidebar-nav" aria-label="工具导航">
        <button type="button" class="nav-item" :class="{ active: !showJobs&&mode === 'split' }" :aria-current="!showJobs&&mode === 'split' ? 'page' : undefined" :disabled="status === 'running' || containerBusy" @click="showJobs=false;changeMode('split')">
          <Scissors :size="18" stroke-width="1.9"/> <span>视频分割</span> 
        </button>
        <button type="button" class="nav-item" :class="{ active: !showJobs&&mode === 'frames' }" :aria-current="!showJobs&&mode === 'frames' ? 'page' : undefined" :disabled="status === 'running' || containerBusy" @click="showJobs=false;changeMode('frames')">
          <ImageIcon :size="18" stroke-width="1.9"/> <span>定时抽帧</span> 
        </button>
        <button type="button" class="nav-item" :class="{ active: !showJobs&&mode === 'captions' }" :aria-current="!showJobs&&mode === 'captions' ? 'page' : undefined" :disabled="status === 'running' || containerBusy" @click="showJobs=false;changeMode('captions')"><Subtitles :size="18" stroke-width="1.9"/><span>字幕工作台</span></button>
        <button type="button" class="nav-item" :class="{active:showJobs}" :aria-current="showJobs ? 'page' : undefined" @click="showJobs=true;jobsVisited=true"><Layers2 :size="18"/><span>任务中心</span></button>
      </nav>
      <div class="fs-sidebar-collections">
      <MediaResourceLibrary :assets="mediaLibrary" :current="file" :disabled="status==='running'||containerBusy" @import="importMedia" @select="loadFile" @remove="removeMedia"/>
      <CollapsibleRoot class="fs-job-history">
        <CollapsibleTrigger class="fs-history-trigger fs-collection-heading"><span><ListChecks :size="14"/>任务记录</span><span class="fs-collection-count">{{activeJobs ? activeJobs+' 进行中' : recentJobs.length}}<ChevronDown :size="13" class="fs-history-chevron"/></span></CollapsibleTrigger><CollapsibleContent>
        <div v-if="!recentJobs.length" class="fs-collection-empty">暂无任务</div>
        <div v-for="job in recentJobs.slice(0, 8)" :key="job.id" class="fs-job-row fs-resource-item" :title="job.error?.message || job.asset.name">
          <div class="fs-resource-line"><FileVideo :size="15" class="fs-resource-icon"/><div class="fs-resource-copy"><strong>{{ job.asset.name }}</strong><span class="fs-resource-meta"><small>{{ jobLabels[job.type] }}</small><JobStatus :status="job.status" :label="jobStates[job.status]||job.status"/></span></div></div>
          <WorkbenchProgress v-if="['queued','running','canceling'].includes(job.status)" :value="job.progress" :max="1" label="任务进度" />
          <small v-if="job.checkpoint">已写入 {{ job.checkpoint.count }} 项</small>
          <button v-if="job.retry && (job.retry.resumeId || ['failed','canceled','interrupted','partial'].includes(job.status))" type="button" class="fs-job-clear" @click="requestRetry(job)">重新关联并重试</button>
        </div>
        <p v-if="retryNotice" role="status">{{retryNotice}}</p>
        <div v-if="recentJobs.length" class="fs-collection-actions"><button type="button" class="fs-job-clear" @click="showJobs=true;jobsVisited=true">查看全部</button><button type="button" class="fs-job-clear" @click="workspace.clearHistory()">清除已结束记录</button></div>
      </CollapsibleContent></CollapsibleRoot>
      </div>
      <SidebarStatus v-model="theme" :version="version" @update:model-value="applyTheme"/>
    </SplitterPanel>
    <SplitterResizeHandle id="frameslice-resource-handle" class="fs-reka-handle" aria-label="调整资源栏宽度" :disabled="!wideLayout"/>
    <SplitterPanel id="frameslice-editor" :order="2" :min-size="30" as="main" class="workspace">
      <WorkspaceHeader :title="pageDescriptor.title" :description="pageDescriptor.description" :icon="pageDescriptor.icon">
        <WorkbenchButton v-if="wideLayout&&!showJobs&&mode!=='captions'&&!(mode==='split'&&videoTool==='container')" :label="inspectorOpen?'隐藏检查器':'显示检查器'" :aria-pressed="inspectorOpen" class="fs-inspector-toggle" @click="inspectorOpen=!inspectorOpen;saveLayout()"><PanelRight :size="16"/><span>检查器</span></WorkbenchButton><div ref="actionTarget" class="fs-primary-target"></div>
      </WorkspaceHeader>
      <JobCenter v-if="jobsVisited" v-show="showJobs" :jobs="recentJobs" :labels="jobLabels" :states="jobStates" @retry="job=>{showJobs=false;requestRetry(job)}" @clear="workspace.clearHistory()"/>
      <div v-if="captionVisited" v-show="!showJobs && mode === 'captions'" class="caption-page fs-workspace-body">
        <CaptionWorkspace />
      </div>

      <div v-show="!showJobs && mode !== 'captions'" class="content fs-workspace-body">

        <div class="fs-source-toolbar"><h2>{{mode==='split'&&videoTool==='container'?'媒体操作':'源视频'}}</h2><div v-if="mode === 'split'" class="video-tool-switch" role="group" aria-label="视频工具操作">
          <button type="button" :class="{ active: videoTool === 'split' }" :aria-pressed="videoTool==='split'" :disabled="status === 'running' || containerBusy" @click="changeVideoTool('split')"><Scissors :size="15"/> 无损分割</button>
          <button type="button" :class="{ active: videoTool === 'container' }" :aria-pressed="videoTool==='container'" :disabled="status === 'running' || containerBusy" @click="changeVideoTool('container')"><PackageOpen :size="15"/> 轨道提取与封装</button>
        </div></div>
        <ContainerWorkspace v-if="containerVisited" v-show="mode === 'split' && videoTool === 'container'" :initial-file="file" :handoff="subtitleHandoff" @busy="containerBusy = $event"/>
        <div v-show="mode !== 'split' || videoTool === 'split'">
        <input ref="fileInput" type="file" accept="video/*,.mp4,.m4v,.mov,.mkv,.webm" class="visually-hidden" @change="onInputChange" />
        <section v-if="!file" class="drop-zone" :class="{ dragging }" tabindex="0" role="button" aria-label="选择视频文件" @click="selectFile" @keydown.enter="selectFile" @keydown.space.prevent="selectFile" @dragover="onDragOver" @dragleave="onDragLeave" @drop.prevent="onDrop">
          <div class="drop-icon"><Upload :size="25" :stroke-width="1.6"/></div>
          <strong>拖放视频文件</strong>
          <p>MP4、MOV、MKV、WebM 等本地媒体</p>
          <span class="drop-action">选择文件 <ArrowRight :size="14"/></span>
          <span class="fs-drop-hint">{{mode==='split'?'导入后可预览关键帧与分割计划':'导入后可选择时间范围、抽帧策略和输出格式'}}</span>
        </section>
        <section v-else class="file-card">
          <div class="file-preview">
            <Film :size="23" class="file-preview-icon"/>
          </div>
          <div class="file-meta">
            <div class="file-name" :title="file.name">{{ file.name }}</div>
            <div class="file-sub"><span>{{ humanBytes(file.size) }}</span><span class="separator-dot"></span><span>{{ info ? humanTime(info.duration) : loading ? '读取信息中…' : '无法读取媒体信息' }}</span><template v-if="info"><span class="separator-dot"></span><span>{{ info.width }} × {{ info.height }}</span></template></div>
            <div class="file-codec" v-if="info"><span>{{ info.videoCodec }}</span><span v-if="info.audioCodec">{{ info.audioCodec }}</span></div>
          </div>
          <div class="file-state"><span class="status-pill" :data-state="info?'ready':loading?'loading':'error'" role="status" :aria-label="info?'媒体已就绪':loading?'正在解析媒体':'媒体读取失败'"><Check v-if="info" :size="13"/><span v-else-if="loading" class="small-spinner"></span><X v-else :size="13"/>{{ info ? '已就绪' : loading ? '解析中' : '读取失败' }}</span><button type="button" :disabled="status === 'running'" class="file-remove" @click="clearFile" title="移除文件"><X :size="17"/></button></div>
        </section>

        <section v-if="file&&info" class="fs-preview-panel" aria-label="视频预览"><div class="fs-preview-header"><h2>视频预览</h2><span>{{humanTime(timelineTime)}} / {{humanTime(info.duration)}}</span></div><media-controller class="fs-media-player" noautohide="" gesturesdisabled="">
<video ref="previewVideo" :key="videoUrl" :src="videoUrl" slot="media" playsinline preload="metadata" aria-label="源视频播放器" @timeupdate="e=>{const v=e.target as HTMLVideoElement;if(Number.isFinite(v.currentTime))timelineTime=v.currentTime}" @loadedmetadata="timelineTime>0 && seekTimeline(timelineTime)"/>
<media-loading-indicator slot="centered-chrome"></media-loading-indicator>
<div class="fs-player-controls" noautohide="">
  <media-time-range></media-time-range>
  <media-control-bar>
    <media-seek-backward-button seekoffset="5"></media-seek-backward-button><media-play-button></media-play-button><media-seek-forward-button seekoffset="5"></media-seek-forward-button>
    <media-time-display showduration=""></media-time-display><span class="fs-player-spacer"></span>
    <media-mute-button></media-mute-button><media-volume-range></media-volume-range><media-playback-rate-button rates="0.25 0.5 0.75 1 1.25 1.5 2"></media-playback-rate-button><media-pip-button></media-pip-button><media-fullscreen-button></media-fullscreen-button>
  </media-control-bar>
</div></media-controller><p v-if="info" class="fs-preview-hint">预览取决于浏览器解码支持；无损处理仍以媒体引擎校验为准。</p></section>
        <MediaTimeline v-if="file && info" :source="videoUrl" :duration="info.duration" :time="timelineTime" :thumbnails="timelineThumbnails" :keys="mode==='frames'?(mediaAnalysis?.keyframeIndex??[]):(mediaAnalysis?.safeKeyframeIndex??[])" :cuts="manualCuts" :disabled="status==='running'" :loading="timelineLoading" :mode="mode==='frames'?'frames':'split'" :start="frameStart" :end="frameEnd" @seek="seekTimeline" @load="loadTimeline" @cancel="timeline.cancel" @move-cut="moveManualCut" @range="(s,e)=>{frameStart=s;frameEnd=e}" @cut="addManualCut" @remove="t=>manualCuts=manualCuts.filter(x=>x!==t)"/>
        <section v-if="file && info" class="fs-analysis" aria-label="视频体检与关键帧分析">
          <div class="fs-analysis-header">
            <div class="fs-analysis-heading">
              <div class="fs-analysis-icon"><SlidersHorizontal :size="17"/></div>
              <div><strong>视频体检</strong><span>按需扫描关键帧与码率，不重新编码</span></div>
            </div>
            <button v-if="!analyzing" type="button" class="fs-tool-button"
              :disabled="status === 'running'" @click="runAnalysis">
              <RotateCcw v-if="mediaAnalysis" :size="14"/><Play v-else :size="14"/>
              {{ mediaAnalysis ? '重新分析' : '分析视频' }}
            </button>
            <button v-else type="button" class="fs-tool-button" @click="cancelAnalysis"><X :size="14"/> 取消分析</button>
          </div>
          <div v-if="analyzing" class="fs-analysis-progress" role="status">
            <div class="fs-analysis-track"><div :style="{ width: Math.round(analysisProgress * 100) + '%' }"></div></div>
            <span>正在后台分析媒体索引 · {{ Math.round(analysisProgress * 100) }}%</span>
          </div>
          <p v-if="analysisError" class="fs-analysis-warning">{{ analysisError }}</p>
          <template v-if="mediaAnalysis">
            <div class="fs-analysis-metrics">
              <div><span>关键帧数量</span><strong>{{ mediaAnalysis.keyframeCount.toLocaleString() }}</strong></div>
              <div><span>最长 GOP</span><strong>{{ mediaAnalysis.maxGopSeconds.toFixed(2) }} <small>秒</small></strong></div>
              <div><span>平均视频码率</span><strong>{{ mediaAnalysis.averageVideoMbps.toFixed(2) }} <small>Mbps</small></strong></div>
              <div><span>最大 GOP 数据量</span><strong>{{ humanBytes(mediaAnalysis.maxGopVideoBytes) }}</strong></div>
            </div>
            <div class="fs-analysis-chart-heading"><span>视频码率分布</span><span>48 个时间区间 · 非音轨码率</span></div>
            <div class="fs-analysis-chart" role="img" aria-label="视频码率随时间变化的柱状图">
              <span v-for="(rate, index) in mediaAnalysis.bitrateBins" :key="index"
                :title="'区间 ' + (index + 1) + ' / 48 · ' + rate.toFixed(2) + ' Mbps'"
                :style="{ height: Math.max(3, rate / maxAnalysisBitrate * 100) + '%' }"></span>
            </div>
            <div class="fs-analysis-chart-footer"><span>00:00:00</span><span>{{ humanTime(mediaAnalysis.duration) }}</span></div>
            <div class="fs-analysis-assessment" :class="{ caution: analysisWarnings.length || !mediaAnalysis.structurallyEligible }">
              <ShieldCheck v-if="!analysisWarnings.length && mediaAnalysis.structurallyEligible" :size="15"/>
              <AlertTriangle v-else :size="15"/>
              <span>{{ analysisWarnings.length ? '发现可能影响无损分割的情况' :
                mediaAnalysis.structurallyEligible ? '容器与轨道结构满足当前无损分割的基本前提' : '当前文件结构存在分割限制' }}</span>
            </div>
            <p v-for="(message, index) in analysisWarnings" :key="index" class="fs-analysis-warning">{{ message }}</p>
            <p class="fs-analysis-disclaimer">提示：结果根据媒体索引的元数据推算，不保证所有标记的关键帧均可解码；最终以导出后的 MP4 校验为准。</p>
          </template>
        </section>

        <Teleport :to="settingsTarget || 'body'" :disabled="!settingsInInspector"><section class="fs-output-settings" aria-label="输出设置"><div class="step-head step-two"><h2>输出设置</h2></div>
        <section class="config-panel" v-if="mode === 'split'">
          <div class="config-row">
            <div class="setting-copy"><div class="setting-icon"><Scissors :size="19"/></div><div><strong>分割方式</strong></div></div>
            <WorkbenchSelect v-model="splitStrategy" label="分割方式" :disabled="status==='running'" :options="([{value:'size',label:'按文件大小'},{value:'duration',label:'按视频时长'}] as const)"/>
          </div>
          <div v-if="splitStrategy === 'size'" class="config-row">
            <div class="setting-copy"><div class="setting-icon"><Layers2 :size="19"/></div><div><strong>单个文件大小</strong></div></div>
            <div class="config-control"><WorkbenchNumber  v-model="size" :disabled="status === 'running'" :min="0.032" :step="0.1"   label="每份目标大小"/><WorkbenchSelect v-model="sizeUnit" label="单位" :disabled="status==='running'" :options="([{value:'GB',label:'GB'},{value:'GiB',label:'GiB'}] as const)"/></div>
          </div>
          <div v-else class="config-row">
            <div class="setting-copy"><div class="setting-icon"><Clock3 :size="19"/></div><div><strong>每段视频时长</strong></div></div>
            <div class="config-control"><WorkbenchNumber  v-model="splitMinutes" :disabled="status === 'running'" :min="0.01" :max="100000" :step="0.5"   label="每段时长（分钟）"/><span class="input-suffix">分钟</span></div>
          </div>
          <div class="config-row">
            <div class="setting-copy"><div class="setting-icon"><ShieldCheck :size="19"/></div><div><strong>输出完整性校验</strong><span>深度校验额外逐包读取 CRC32</span></div></div>
            <WorkbenchSelect v-model="verificationLevel" label="视频输出校验等级" :disabled="status==='running'" :options="([{value:'quick',label:'快速校验（推荐）'},{value:'deep',label:'逐包深度校验'}] as const)"/>
          </div>
          <div class="config-row last">
            <div class="setting-copy"><div class="setting-icon"><FolderOpen :size="19"/></div><div><strong>保存位置</strong><span>{{ resumeSession?.folder.name || selectedFolderName || (fileReadable?'请指定本地输出目录':'当前浏览器不支持目录选择') }}</span></div></div>
            <button type="button" :disabled="status === 'running' || !fileReadable" class="secondary-button" @click="pickFolder"><Folder :size="15"/>{{ selectedFolderName ? '更换目录' : '选择目录' }}</button>
          </div>
          <div class="config-footnote"><Info :size="16"/><span>无损切割按关键帧对齐，不能精确均分。支持单视频轨、最多一条音轨。</span></div>
        </section>

        <section class="config-panel" v-else>
          <div class="config-row"><div class="setting-copy"><div><strong>抽帧策略</strong></div></div><WorkbenchSelect v-model="frameStrategy" label="抽帧策略" :disabled="status==='running'" :options="([{value:'interval',label:'定时抽帧'},{value:'sharpest',label:'最清晰帧'},{value:'scene',label:'场景变化'},{value:'keyframes',label:'关键帧'}] as const)"/></div>
          <div v-if="frameStrategy==='sharpest'" class="config-row"><label>每窗口候选数 <WorkbenchNumber  v-model="candidateCount" :min="1" :max="12" :disabled="status==='running'" label="每窗口候选数"/></label><label>最低清晰度 <WorkbenchNumber  v-model="minSharpness" :min="0" :max="260100" :step="10" :disabled="status==='running'" label="最低清晰度"/></label></div>
          <div v-if="frameStrategy==='scene'" class="config-row"><label>场景差异阈值 {{sceneThreshold.toFixed(2)}} <input type="range" v-model.number="sceneThreshold" min="0" max="1" step=".01" :disabled="status==='running'"/></label></div>
          <div class="config-row"><WorkbenchCheckbox v-model="deduplicate" :disabled="status==='running'">过滤最近 64 张近似重复画面</WorkbenchCheckbox></div>
          <div class="config-row"><div class="setting-copy"><div class="setting-icon"><Clock3 :size="19"/></div><div><strong>截图间隔</strong></div></div><div class="config-control"><WorkbenchNumber   :min="0.1" :max="36000" :step="0.5" v-model="interval" :disabled="status === 'running'"  label="抽帧间隔秒数"/><span class="input-suffix">秒</span></div></div>
          <div class="config-row"><div class="setting-copy"><div class="setting-icon"><SlidersHorizontal :size="19"/></div><div><strong>截图时间范围</strong></div></div><div class="range-control"><WorkbenchNumber   :min="0" :max="info?.duration" :step="0.1" v-model="frameStart" :disabled="status === 'running'"  label="截图开始秒数"/><span>至</span><WorkbenchNumber   :min="0" :max="info?.duration" :step="0.1" v-model="frameEnd" :disabled="status === 'running'"  label="截图结束秒数"/><span>秒</span></div></div>
          <div class="config-row"><div class="setting-copy"><div class="setting-icon"><ImageIcon :size="19"/></div><div><strong>图片格式</strong></div></div><WorkbenchSelect v-model="imageFormat" label="图片格式" :disabled="status==='running'" :options="([{value:'image/jpeg',label:'JPEG'},{value:'image/png',label:'PNG'},{value:'image/webp',label:'WebP'}] as const)"/></div>
          <div class="config-row"><div class="setting-copy"><div class="setting-icon"><SlidersHorizontal :size="19"/></div><div><strong>输出分辨率</strong><span>不放大原图</span></div></div><WorkbenchSelect v-model="imageWidth" label="最大输出宽度" :disabled="status==='running'" :options="([{value:0,label:'原始尺寸'},{value:1280,label:'1280 px'},{value:1920,label:'1920 px'},{value:3840,label:'3840 px'}] as const)"/></div>
          <div v-if="imageFormat !== 'image/png'" class="config-row"><div class="setting-copy"><div class="setting-icon"><SlidersHorizontal :size="19"/></div><div><strong>图片压缩质量</strong></div></div><div class="range-control"><SliderRoot class="fs-slider" :model-value="[jpegQuality]" :min="0.5" :max="1" :step="0.05" :disabled="status==='running'" @update:model-value="v=>{if(v?.length)jpegQuality=v[0]}"><SliderTrack class="fs-slider-track"><SliderRange class="fs-slider-range"/></SliderTrack><SliderThumb class="fs-slider-thumb" aria-label="截图质量"/></SliderRoot><span>{{ Math.round(jpegQuality * 100) }}%</span></div></div>
          <div class="config-row last"><div class="setting-copy"><div class="setting-icon"><FolderOpen :size="19"/></div><div><strong>保存位置</strong><span>{{ selectedFolderName || (fileReadable?'未选择目录，最多生成 30 张可下载预览':'不支持目录选择，最多 30 张单独下载') }}</span></div></div><button type="button" :disabled="status === 'running' || !fileReadable" class="secondary-button" @click="pickFolder"><Folder :size="15"/>{{ selectedFolderName ? '更换目录' : '选择目录' }}</button></div>
          <div class="config-footnote"><Info :size="16"/><span>HEVC、AV1 解码取决于浏览器支持。</span></div>
        </section>

        </section></Teleport>
        <section v-if="file && info && mode==='split'" class="fs-analysis">
          <div class="fs-analysis-header"><strong>GOP 分割规划预览</strong><button v-if="!planning" class="secondary-button" type="button" :disabled="status==='running'" @click="previewSplitPlan">预览分割计划</button><button v-else type="button" class="secondary-button" @click="planAbort?.abort()">取消规划</button></div>
          <p v-if="planError" class="fs-analysis-warning">{{planError}}</p>
          <p v-if="visiblePlan.length">{{visiblePlan.length}} 个片段 · 下列为媒体包估算，不含实际容器封装开销。</p>
          <div v-for="(part,i) in visiblePlan.slice(0,50)" :key="i" class="fs-job-row"><strong>片段 {{i+1}} · {{humanTime(part.start)}} – {{humanTime(part.end)}}</strong><small>{{humanBytes(part.estimatedBytes)}} · 视频 {{part.videoPackets}} 包 / 音频 {{part.audioPackets}} 包</small></div>
          <p v-if="visiblePlan[0]?.excludedPreroll" class="fs-analysis-warning">首段不复制 {{visiblePlan[0].excludedPreroll.packets}} 个 AAC 前置包（完全位于视频开始之前），将写入报告。</p>
          <p v-if="visiblePlan.length>50">仅显示前 50 段。</p>
        </section>
        <section v-if="file && info" class="fs-analysis"><WorkbenchCheckbox v-model="resumeEnabled" :disabled="status==='running'||!!resumeSession||!outputAvailable||(mode==='frames'&&(frameStrategy!=='interval'||deduplicate))">启用断点续作（额外读取完整源文件与输出文件，需要本地目录）</WorkbenchCheckbox><p v-if="resumeSession">已关联续作目录：{{resumeSession.folder.name}} <button type="button" class="secondary-button" :disabled="status==='running'" @click="resumeSession=null;resumeEnabled=false">新建任务</button></p></section>
        <div v-if="file&&info&&!outputAvailable" class="fs-capability-notice" role="status"><Info :size="16"/><span>{{outputLimit||'当前浏览器不支持本地目录选择；仅提供最多 30 张图片的单独下载，不支持断点续作。实际解码取决于浏览器与编码。'}}</span></div>
        <section class="execution" v-if="file && info">
          <div class="execution-summary"><div><span class="summary-label">预计输出</span><strong>{{ mode === 'split' ? `约 ${estimatedParts} 个视频文件` : `${estimatedFrames} 张图片` }}</strong></div><div><span class="summary-label">处理方式</span><strong>{{ mode === 'split' ? (splitStrategy === 'duration' ? '按时长 · 关键帧无损' : '按大小 · 关键帧无损') : '本地解码 · 逐张导出' }}</strong></div><div><span class="summary-label">保存位置</span><strong class="fs-output-location" :title="resumeSession?.folder.name || selectedFolderName || '未指定'">{{resumeSession?.folder.name || selectedFolderName || '未指定'}}</strong></div></div>
          <Teleport :to="actionTarget || 'body'" :disabled="!actionInToolbar"><button v-if="status !== 'running'" type="button" class="primary-button" :disabled="!canRun" @click="start"><Play :size="16" fill="currentColor"/> {{ mode === 'split' ? '开始分割视频' : '开始提取图片' }} <ArrowRight :size="17"/></button>
          <button v-else type="button" class="cancel-button" @click="cancel"><PauseCircle :size="16"/> 取消任务</button></Teleport>
        </section>
        <div class="empty-action" v-else-if="file"><Info :size="16"/> {{ loading ? '正在读取媒体信息…' : '媒体尚未就绪，请检查文件格式。' }}</div>

        <section v-if="status !== 'idle'" class="result-section" aria-live="polite">
          <div class="step-head"><h2>任务结果</h2><span class="step-description">{{ status === 'running' ? '处理中' : status === 'done' ? '处理完毕' : '状态信息' }}</span></div>
          <div class="status-card" :class="{ success: status === 'done', failure: status === 'error' }"><div class="status-card-head"><div class="status-icon"><BadgeCheck v-if="status === 'done'" :size="19"/><AlertTriangle v-else-if="status === 'error'" :size="19"/><CircleHelp v-else-if="status === 'canceled'" :size="19"/><RotateCcw v-else :size="19" class="rotating"/></div><div class="status-details"><strong>{{ status === 'running' ? '正在处理' : status === 'done' ? '任务完成' : status === 'canceled' ? '任务已取消' : '处理失败' }}</strong><span>{{ progressLabel }}</span></div><div class="status-percent">{{ progressPercent }}%</div></div><div class="progress-track"><div class="progress-fill" :style="{ width: `${progressPercent}%` }"></div></div><p v-if="lastJobFolder" class="output-path">保存目录：{{ lastJobFolder }}</p><p v-if="jobElapsedMs > 0" class="output-path">后台处理耗时：{{ (jobElapsedMs / 1000).toFixed(1) }} 秒</p><p v-if="errorText" class="status-error">{{ errorText }}</p><button v-if="status === 'error' || status === 'canceled'" type="button" class="text-button" @click="retry">重新配置任务 <ArrowRight :size="14"/></button></div>
          <MediaResults :parts="parts" :frames="frames" @save="savePreview"/>
          <div v-if="status === 'done' && (exportReportJson || frames.length)" class="fs-result-tools">
            <button v-if="exportReportJson" type="button" class="fs-tool-button" @click="downloadManifest">
              <ArrowDownToLine :size="15"/> 导出处理报告 JSON
            </button>
            <button v-if="frames.length" type="button" class="fs-tool-button" :disabled="storyboardBusy"
              @click="downloadStoryboard">
              <ImageIcon :size="15"/> {{ storyboardBusy ? '正在生成分镜图…' : '生成分镜拼图（最多 12 张）' }}
            </button>
            <span v-if="reportNotice" class="fs-result-note">{{ reportNotice }}</span>
          </div>
          <p v-if="filteredCount" class="fs-analysis-disclaimer">已主动过滤 {{filteredCount}} 张相似或无明显场景变化的候选画面，不计为遗漏。</p>
          <p v-if="missedFrames.length" class="fs-analysis-warning">有 {{missedFrames.length}} 个时间点重试后仍无画面，详见 JSON 报告：{{missedFrames.slice(0,10).map(t=>t.toFixed(3)+'s').join('、')}}</p>
          <p v-if="storyboardError" class="fs-analysis-warning">{{ storyboardError }}</p>

        </section>

        <div v-if="errorText && status === 'idle'" class="inline-error"><AlertTriangle :size="17"/><span>{{ errorText }}</span><button type="button" @click="errorText = ''" aria-label="关闭"><X :size="16"/></button></div>
        </div>

      </div>
    </SplitterPanel>
    <SplitterResizeHandle v-if="wideLayout&&inspectorOpen&&!showJobs&&mode!=='captions'&&!(mode==='split'&&videoTool==='container')" id="frameslice-inspector-handle" class="fs-reka-handle" aria-label="调整检查器宽度"/>
    <SplitterPanel v-if="wideLayout&&inspectorOpen&&!showJobs&&mode!=='captions'&&!(mode==='split'&&videoTool==='container')" id="frameslice-inspector" :order="3" size-unit="px" :default-size="rightWidth" :min-size="240" :max-size="400" as="aside" class="right-panel" aria-label="媒体检查器">
      <div class="right-panel-inner fs-inspector">
        <header class="fs-inspector-heading"><PanelRight :size="16"/><h2>检查器</h2></header>
        <section class="fs-inspector-section fs-inspector-source" :class="{'is-empty':!file}">
          <h3>源媒体</h3>
          <template v-if="file">
            <p class="fs-inspector-filename" :title="file.name">{{file.name}}</p>
            <dl>
              <div><dt>文件大小</dt><dd>{{humanBytes(file.size)}}</dd></div>
              <div><dt>时长</dt><dd>{{info ? humanTime(info.duration) : '读取中'}}</dd></div>
              <div v-if="info"><dt>画面尺寸</dt><dd>{{info.width}} × {{info.height}}</dd></div>
              <div v-if="info"><dt>视频编码</dt><dd>{{info.videoCodec}}</dd></div>
              <div v-if="info"><dt>音频编码</dt><dd>{{info.audioCodec || '无'}}</dd></div>
            </dl>
          </template>
          <p v-else class="fs-inspector-empty"><Film :size="14"/> 尚未导入媒体</p>
        </section>
        <div ref="settingsTarget" class="fs-settings-target"></div>
        <section v-if="info" class="fs-inspector-section fs-inspector-output">
          <h3>当前输出</h3>
          <dl>
            <div><dt>操作</dt><dd>{{mode==='split'?'无损分割':'抽帧'}}</dd></div>
            <div><dt>预计数量</dt><dd>{{info ? (mode==='split' ? '约 '+estimatedParts+' 段' : '约 '+estimatedFrames+' 张') : '—'}}</dd></div>
            <div><dt>目录</dt><dd>{{resumeSession?.folder.name || selectedFolderName || '未指定'}}</dd></div>
            <div v-if="mode==='split'"><dt>完整性校验</dt><dd>{{verificationLevel==='deep'?'逐包 CRC32':'快速校验'}}</dd></div>
            <div v-else><dt>格式</dt><dd>{{imageFormat.split('/')[1]?.toUpperCase()}}</dd></div>
          </dl>
          <p v-if="mode==='frames'&&frameStrategy!=='interval'" class="fs-inspector-empty">实际抽帧数量取决于所选策略与过滤结果。</p>
        </section>
        <section class="fs-inspector-section fs-inspector-task">
          <h3>任务状态</h3>
          <p class="fs-inspector-state"><span :class="['fs-state-dot',status]"/>{{status==='running'?'正在处理':status==='done'?'已完成':status==='error'?'处理失败':status==='canceled'?'已取消':loading?'读取媒体':info?'等待开始':'等待导入'}}</p>
          <template v-if="status==='running'"><WorkbenchProgress :value="progressPercent" label="当前任务进度"/><p>{{progressLabel}}</p></template>
          <p v-if="status==='error'" class="fs-danger">{{errorText}}</p>
        </section>
      </div>
    </SplitterPanel>
  </SplitterGroup>
</template>
