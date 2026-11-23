# Caption Studio / 本地 AI 字幕工作台

**FrameSlice 集成入口：** [https://weepwood.github.io/FrameSlice/subtitles/](https://weepwood.github.io/FrameSlice/subtitles/) · **独立原版：** [https://weepwood.github.io/Caption-Studio/](https://weepwood.github.io/Caption-Studio/)

> 本目录从 [weepwood/Caption-Studio](https://github.com/weepwood/Caption-Studio) 迁入 FrameSlice 单仓库。保留 React 子应用、许可说明与同源 IndexedDB 工程保存逻辑；字幕模块和 Vue 视频模块独立构建，不使用外部 iframe。 · [GitHub Actions 部署记录](https://github.com/weepwood/Caption-Studio/actions)


> 在 [sudesh1456/whisper-caption-editor](https://github.com/sudesh1456/whisper-caption-editor)（MIT）的实现思路上制作的独立优化版本。**保留浏览器本地 Whisper + 字幕编辑 + SRT/VTT + MP4 烧录路径**，重点增强中文字幕、时间轴和项目恢复体验。

## v0.4.0 界面与校对体验更新

本版本增加字幕问题筛选与逐项定位、文本整理、重叠时间修复、全文查找替换、列表分页、播放倍速、单条字幕循环、拖拽导入、快捷键帮助及工作流导航。详细内容见 [CHANGELOG.md](CHANGELOG.md)。

## 快速启动

建议使用 **Node.js 22.12+** 和 **npm 11.6+**（旧 npm 10 在部分 Vitest 依赖组合下可能出现 `edgesOut` 错误）：

```bash
npm install
npm run dev
```

构建与质量检查：

```bash
npm run typecheck
npm test
npm run build
```

> 当前源码包未随附 `node_modules` 或 `package-lock.json`。首次执行 `npm install` 后会生成锁文件，建议提交锁文件并将 CI 的 `npm install` 调整为 `npm ci`。首次语音转录需要从 Hugging Face 下载 Whisper 模型；首次 MP4 烧录需要下载 FFmpeg.wasm core 和默认字体。不存在任何媒体上传到应用服务器的流程。

## v0.3.0：超大视频自动提取音轨

现在可直接导入超过 **350 MB** 的 MP4/WebM/MOV 视频并点击「开始自动转录」。不再因媒体总文件大小被拒绝，也无需手动压缩视频或提取 WAV。

浏览器本地处理链路：

1. Mediabunny `BlobSource` 按区间读取原始文件，仅获取音轨，不解码视频画面。
2. `AudioSampleSink` 在 Web Worker 中解码为 PCM，流式转换成 **16 kHz 单声道**。
3. 将 PCM 分为约 **30 秒窗口，每段重叠 2 秒**，逐段调用 Whisper；字幕增量追加到时间轴。
4. 同步生成不超过 **2200** 个采样峰值的轻量波形；支持取消任务和独立波形提取。

**使用范围与限制：** 支持的文件容器及音频编码由当前浏览器 WebCodecs 能力决定。AAC、MP3、Opus 更适合在 Chrome/Edge 最新版测试。部分 AC-3、DTS、损坏容器、无音轨视频可能提示无法解码。当前为单文件 24 小时音频处理安全上限；真实多 GB 文件需要浏览器端压力测试确认。流式重采样使用线性插值，音频含大量高频噪声时可能不如高质量带限重采样。**该改动只解决音轨提取/识别的整文件加载问题，不改变 ffmpeg.wasm 硬字幕烧录长视频时的内存限制。**

新依赖 [Mediabunny](https://mediabunny.dev/) 使用 MPL-2.0 许可证。模型权重首次下载需要网络，但用户选择的媒体文件不上传到应用服务器。

## 已实现

- **浏览器本地 Whisper**：Tiny / Base / Small 多语言模型；WebGPU 优先或明确选择 CPU/WASM；Web Worker 中进行推理；支持取消任务；模型在浏览器缓存（缓存是否保留依赖浏览器设置）。
- **字幕生成**：原文转录；中文、日文等无空格语言按中文标点和字符数切分，英文同样支持；对原始 Whisper 分段内部的拆分时间仍属于**字符比例估算**，不是逐词强制对齐。
- **编辑器**：视频/音频预览，字幕列表，文本、时间戳编辑，拆分/合并/插入/删除，整体时间偏移，搜索，撤销/重做，重叠/空白/过长/阅读过快提示。
- **波形时间轴**：提取音轨后绘制下采样波形，拖动字幕左右边界调整时间，放大缩小与拖动视窗，当前播放进度跟踪。
- **项目恢复**：IndexedDB 自动保存字幕、样式与项目元数据；不会默认存储媒体原文件。恢复后需要重新关联原来的媒体文件，选择同名媒体时保留字幕。
- **导入导出**：支持 SRT / VTT 字幕导入；可导出 SRT / VTT / JSON 工程；对明显乱码的旧字幕尝试 GB18030 解码。
- **短视频字幕烧录**：延续 FFmpeg.wasm + libass 方案；支持选择本地 TTF/OTF 字体。受浏览器内存、编解码器与字体兼容性影响，**属于实验性功能**。
- **其他**：中文界面、适配桌面与移动端、键盘快捷键、浅色低干扰视觉设计、GitHub Pages Actions 模板。

## 边界与注意事项

1. **纯前端并不等于无网络**：模型权重、运行时 WASM 文件、FFmpeg Core 和备用字体仍需首轮下载。所有媒体本身均在本地处理，没有服务端上传。
2. **视频音轨解码**：改为 Mediabunny + WebCodecs 分段读取；具体编解码能力仍受浏览器和操作系统限制。
3. **长视频性能**：已移除 350 MB 限制，使用 30 秒窗口有界转录；大型/长时文件仍需关注浏览器内存和 GPU 负载。
4. **GPU 不一定更稳定**：WebGPU 与模型量化兼容性依赖浏览器、显卡和 Transformers.js 版本；自动模式下仅在模型初始化失败时尝试 CPU 回退，推理阶段崩溃需手动改选 CPU 后重试。
5. **中文翻译尚未实现**：Whisper `task: translate` 的目标主要是英语，并不能直接作为完整的“翻译成中文字幕”方案。当前实现的是原语言识别、中文分句和人工校对；真正的双语翻译需要额外的翻译模型。
6. **烧录前建议选中文字体**：内置 Inter 备用字体从原项目在运行时下载，通常不含完整中文字符。请手动选择具有对应许可的中文 `.ttf/.otf`；所选字体的内部字体家族名称可能需要与 FFmpeg 的 `FontName` 设置一致。
7. **导出工程不包含视频**：JSON 只包含字幕和样式等元数据；需要用户自己保留原始媒体。
8. **静态 Pages 的路径**：工作流采用仓库名作为 `BASE_PATH`。如果部署到自定义域名或根路径，请调整 `BASE_PATH`。

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `空格` | 播放/暂停（焦点不在输入框时） |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z` 或 `Ctrl/Cmd + Y` | 重做 |
| 时间轴字幕块两端拖动 | 调整开始/结束时间 |
| 时间轴字幕块两端键盘方向键 | 按 0.1 秒微调 |

## 目录

```text
src/
  App.tsx                     工作台 / 状态协调
  components/Timeline.tsx      波形与时间轴交互
  hooks/useHistory.ts          合并连续编辑的撤销栈
  hooks/useTranscriber.ts      Worker 生命周期 / 取消
  workers/transcribe.worker.ts 本地 Whisper 推理
  lib/streaming-audio.ts       PCM 重采样 / 30秒分段 / 波形采样
  lib/captions.ts              字幕编辑和格式转换
  lib/captions.test.ts         格式和字幕处理测试
  lib/storage.ts               IndexedDB 工程保存
  lib/burn.ts                  FFmpeg.wasm MP4 烧录
  styles.css                   完整 UI 样式
```

## 未实现的后续事项

- 中文目标语言翻译及双语字幕轨道
- Whisper 词级时间戳及强制对齐
- VAD 静音检测 / 自动消除幻觉
- 多项目管理与浏览器本地媒体句柄恢复
- 多格式媒体兼容性矩阵与跨浏览器 Playwright E2E
- WebGPU/WASM 资源监控和长时间任务压力测试

详细分析见 [ANALYSIS.md](ANALYSIS.md)，开源说明见 [ATTRIBUTION.md](ATTRIBUTION.md)。
