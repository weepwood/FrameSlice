# FrameSlice

**纯前端 · 本地媒体工作台（v0.6.0）。**

[版本变更](CHANGELOG.md) · [工作台使用指南](docs/WORKBENCH.md) · [线上应用](https://weepwood.github.io/FrameSlice/)

FrameSlice 是基于 Vue 3、TypeScript、Vite 和 [Mediabunny](https://mediabunny.dev/) 的静态网页应用。文件从用户设备按需读取；不会上传到远程服务器。

## 当前功能

- 选择或拖放本地视频，读取时长、尺寸、视频/音频编码信息。
- **无损视频分割：** 支持 **按文件大小 / 按视频时长（分钟）** 两种模式；在关键帧边界切割、保留原始压缩数据并逐片流式写入本地目录。按时长模式不会重新编码，若 GOP 本身超过上限会提示用户增加分割时长。
- **定时抽帧：** 可指定 **开始 / 结束秒数**、截图间隔（至少 0.1 秒）、JPEG/PNG/WebP、输出宽度和 JPEG/WebP 质量；只处理指定区间并逐张保存。
- 取消处理、节流的进度显示、文件列表、抽帧缩略图预览；处理任务运行时提示防误刷新；无后端、无账号。
- 分割片段自动校验；用户可以选择轻量结构检查或逐包 CRC32 对比。
- **按需视频体检：** 点击「分析视频」，在独立 Worker 中扫描视频压缩包索引并显示关键帧数量、最长 GOP 间隔、平均码率与分布图。会结合分割设置给出时长/大小不足的风险提示。
- **处理清单导出：** 成功处理后自动生成 `frameslice-report.json`，包含来源媒体元信息、参数、输出文件及逐段校验结果；使用输出目录时自动保存到当前任务子目录，也可单独下载。
- **分镜拼图 Contact Sheet：** 抽帧完成后，可将最多 12 张已生成的本地预览图制作成带时间戳的 JPEG 图像，方便快速浏览视频内容。
- GitHub Actions 自动部署到 GitHub Pages。

### 支持范围与已知限制

- **推荐桌面 Chrome / Edge**，HTTPS 环境，支持 File System Access API。
- 无损分割输入以 MP4/M4V/MOV 为目标，目前仅支持 **1 条视频轨 + 最多 1 条音轨**；不支持保留字幕轨、多音轨、章节、复杂编辑列表、DRM；部分非标准源视频不保证兼容。
- 按大小分割在 GOP（关键帧组）边界完成，目标值为**文件大小上限**而不是精确每份相等。按媒体包字节数预估并预留 5% 安全余量；导出后会检查实际大小，超限时该片段会被移除并报告错误。按时长分割也无法精确均分，分段位置必须由关键帧决定。
- 由于关键帧、B 帧、编码配置、音频 priming 和时间戳等因素，部分源文件可能无法无损拆分。请先使用短视频进行验证，再尝试 12GB 视频。
- 关键帧体检**不会自动在导入时扫描整段视频**，需要点击「分析视频」；这项操作只依据 MP4 等文件中的压缩包元数据推算 GOP 与码率，不会逐帧解码或验证实际可播放性。
- 码率分布按视频时间平均分为 48 个区间，仅统计视频轨道数据，不包含音轨；最长 GOP 数据量是估算视频轨数据量，不能直接当作最终 MP4 片段大小。
- 分镜图使用 UI 中保留的最多 16 张缩略图、均匀挑选最多 12 张；不重新解码整个视频，不代表逐帧完整内容。
- 分割任务**必须选择输出文件夹**，避免多 GB Blob 在浏览器内存中积压。浏览器不支持文件夹保存时不会开启分割任务。
- 定时抽帧需要浏览器能够解码该视频。支持文件夹保存时逐张写入磁盘；否则最多生成 30 张可单独下载的预览图；单次抽帧上限 10000 张，单张输出画面不能超过 4000 万像素。
- 可选完整指纹断点续作支持无损分割与定时抽帧；重新关联源文件、目录权限及既有成果校验后才跳过。智能模式暂不支持续作。
- 导出性能依赖硬盘 IO、视频封装结构与浏览器实现。**尚未完成 12GB 真实源文件的性能/兼容性回归测试。**
- 第三方依赖会在安装时联网下载；程序运行后没有任何媒体内容上传逻辑。界面仅使用设备系统字体，不请求外部字体服务。

## 轨道提取与无损封装（MKV / MP4）

视频分割工作区新增二级操作「轨道提取与封装」，保持三个一级导航不变。

- 读取 MKV / MP4 / MOV / WebM 的视频、音频轨道，显示编码、语言、名称等元信息。
- 选择轨道逐条提取（如 AAC→M4A、FLAC→FLAC、视频轨→MKV），或无损重新封装为 MKV / MP4。
- 额外导入 SRT / VTT，转成 WebVTT 字幕轨加入 MKV（软字幕，可选择开启/关闭；播放器兼容性需验证）。
- 不支持的内嵌字幕、字体附件及章节 **不会隐式复制**；处理前必须显式确认可能丢失的轨道。
- 使用独立 Web Worker、文件流式保存、输出后重新读取验证轨道与时长；原视频不上传，也不需要后端。

**限制：** 内嵌字幕采用独立有界解析器，仅支持 MKV UTF-8/ASS 与非分片 MP4 tx3g 文本提取；ASS 不包含附件字体，tx3g 不保留样式，PGS、章节、附件及内嵌轨道完整复制尚未实现。输出文件中不能无损复制的轨道将报错，绝不默默丢轨或转码。首版软字幕只支持 MKV WebVTT，未提供 MP4 mov_text。

详细实现、操作步骤和兼容性范围：[MKV 轨道工作台文档](docs/CONTAINER_WORKSPACE.md)。

## 新增功能使用说明

### 视频体检：在分割前了解风险

选择文件并完成基本媒体信息读取后，点击「分析视频」。页面会显示关键帧数、最长关键帧组间隔、视频码率分布和潜在风险。分析可随时取消，并不会上传媒体。体检结果只是**无损分割前的参考**，不是解码或完整性检查的替代品。

### 导出 JSON 校验报告

分割/抽帧任务成功结束后，会显示「导出处理报告 JSON」按钮。若使用浏览器授权的输出目录，系统还会自动将 `frameslice-report.json` 写到本次独立任务子目录。报告记录片段文件名、字节数、时间范围、快速或深度校验结果，不包含设备的绝对文件路径、媒体内容及 Object URL。

### 生成分镜拼图

在定时抽帧任务结束后点击「生成分镜拼图」。工具将从当前保留的本地预览中选择最多 12 张，以 3 列网格排布、添加时间戳，再保存为单张 JPEG。此功能仅用于快速浏览与内容分享，不会增加视频源文件的解析负担。

## Web Worker 化与完整性校验（v0.2 方向）

- **主线程与媒体处理分离：** 媒体信息读取、无损分割、定时抽帧运行在独立 Web Worker，UI 仅负责选择文件、授权输出文件夹和显示结果。
- **可控取消：** Worker 定期让出事件循环以响应中断消息；正常取消会清理当前不完整文件，超时会强制终止并尽量清理正在写入的文件。
- **MP4 输出完整性校验：** 每个片段导出后自动重新打开视频。默认快速校验轨道、编码、时长、关键帧和首尾压缩包；可选逐包 CRC32 深度比对，执行时需要重新读取输出片段（更耗时）。
- **后台截图预览：** 抽帧图片使用 Worker 的 OffscreenCanvas 编码，再将小范围 Blob 发送到 UI 创建 Object URL。
- **大文件压力测试：** 提供可手动运行的 12GB 逻辑 Blob 全范围测试，以及支持用户提供真实 MP4 的磁盘流式分割校验命令。

详细架构、测试运行步骤及局限：[Worker、压力测试与完整性校验](docs/WORKER_STRESS_VERIFICATION.md)。

### 一键运行压力测试

```bash
npm ci
npm run stress:virtual
npm run stress:real -- "/path/to/12GB-video.mp4" "./stress-outputs" 4 quick
# 逐包 CRC32 校验（额外读取全部导出压缩包，耗时会增加）
npm run stress:real -- "/path/to/12GB-video.mp4" "./stress-outputs" 4 deep
```

> `stress:virtual` 的 12GB 为逻辑地址空间，不是视频真实解码或磁盘吞吐测试；`stress:real` 是 Node 文件系统压力测试，与浏览器 Worker 的实际内存曲线不同。**真实 12GB 浏览器端测试仍需目标设备与视频样本。**

## 快速验证（建议先做）

建议先准备一段 6–10 秒的 H.264 + AAC MP4 作为浏览器冒烟测试：设置 1 秒抽帧间隔，验证截图导出；随后测试无损封装并检查输出文件能独立播放。**多片分割仍需使用大于 32 MB、含多个关键帧组的视频进行验证**，之后再测试 12GB 文件。

## 开发

要求 Node.js 22.12+。

```bash
npm ci
npm run dev
```

首次安装推荐使用 `npm ci`，该命令按仓库提交的锁文件安装固定版本的依赖。

运行测试与生产构建：

```bash
npm test
npm run build
npm run preview
```

## 发布到 GitHub Pages

1. 创建仓库 `weepwood/FrameSlice`，默认分支设为 `main`。
2. 将本项目的**文件内容**推送到该仓库的 `main` 分支。
3. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
4. `.github/workflows/deploy.yml` 会在推送时通过 `npm ci` 安装固定依赖、执行生产依赖漏洞扫描、运行单元测试、类型检查、构建并发布。
5. 发布成功后预计站点地址：`https://weepwood.github.io/FrameSlice/`。

> 注意：Vite 配置中的 `base` 在 GitHub Pages 模式下为 `/FrameSlice/`；如果仓库更名，也要同步修改 `vite.config.ts`。

## 结构

```
src/
  App.vue                 主界面与任务协调
  lib/media.ts            媒体文件预检
  lib/analyze.ts          按需视频体检（Worker）
  lib/keyframe-stats.mjs  固定内存关键帧、GOP 和码率统计
  lib/manifest.mjs        JSON 处理与校验报告
  lib/storyboard.ts       12 帧分镜拼图生成
  lib/split.ts            关键帧无损分割与流式写入
  lib/planning.mjs        独立可测试的分段规划器
  lib/frames.ts           WebCodecs 定时抽帧
  lib/verify.ts           分割输出 MP4 的快速/深度校验
  lib/worker-client.ts    主线程与媒体 Worker 通信
  lib/storage.ts          文件夹写入与小文件下载
  lib/format.ts           格式化与时间点计算
  assets/style.css        视觉样式及响应式布局
  workers/media.worker.ts 独立的视频处理与分析线程
.github/workflows/deploy.yml
```

## 设计原则

保持本地处理、拒绝不安全的自动降级、不将大文件复制到内存、错误明确可见、支持中止任务和资源回收。


## 2026-11-23 稳定性与安全专项

- 防止错误、超长、路径式文件名写入输出目录；对 Windows 设备保留名称进行处理。
- 对截图区间、抽帧间隔、数量、格式、质量、图像总像素数设置合理上限。
- 对分割预扫描的关键帧数量和数据包长度进行检查；不一次性加载整个视频。
- 处理单路输出故障时取消 muxer 并等待并发任务结束；图片保存失败时移除不完整输出。
- 处理运行时防误刷新提醒；限制频繁进度更新造成的 UI 卡顿。
- 配置静态 CSP（注意：HTML meta CSP 无法配置 `frame-ancestors` 等 HTTP 响应头策略）；保留最小 CI 权限。
- 提交 `package-lock.json`，使用 `npm ci`，并运行 `npm audit --omit=dev --audit-level=high`。
- 测试覆盖参数校验、按时长边界规划、H.264/AAC 视频重新封装以及小样本多片段输出。

**验证边界：** 自动测试和 npm 审计不代表消除所有漏洞；大型真实视频、恶意损坏媒体、浏览器解码器漏洞、B 帧和 VFR 时间轴、复杂音轨、异常掉电及磁盘不足等仍可能造成失败。详情见 [安全审计与局限](docs/SECURITY_AUDIT.md)。

## 许可证

MIT。详见 `LICENSE`。Mediabunny 项目依据 MPL-2.0 发布，其版权和许可证由原项目保留。


## 统一媒体工作台：视频分割、定时抽帧、字幕工作台

**统一入口：** [https://weepwood.github.io/FrameSlice/](https://weepwood.github.io/FrameSlice/)。

三个功能并列显示在 FrameSlice 主页面的左侧导航：`视频分割`、`定时抽帧`、`字幕工作台`。点击只切换工作区，不跳转新页面，不使用 iframe，切换后会保留已挂载字幕编辑器的状态及先前视频处理结果。

### 字幕编辑器布局与能力

- **工程与字幕操作归位**：字幕工作区顶部工具栏包括「打开媒体」「导入字幕」「打开工程」「导出工程」「新建」。它们**不再占用左侧全局导航**，React 原来的顶栏和二级侧栏在嵌入模式下不会渲染。
- **统一视觉**：字幕 UI 采用 FrameSlice 的灰绿主题、低对比边框、卡片间距和响应式布局；Shadow DOM 隔离字幕应用的 React 全局样式，避免干扰 Vue 侧栏及视频工具。
- **按需启动**：首次点击字幕选项才动态导入 React 打包模块、加载隔离后的样式；首次加载后切换其他工具不会卸载字幕模块。
- **保留功能**：原有 Whisper Web Worker、流式音轨转录、波形时间轴、字幕校对、SRT/VTT/JSON 工程导出和实验性的短视频字幕烧录。
- **工程保存**：使用浏览器 IndexedDB，仅保存字幕和工程元数据，不默认保存视频文件。原仓库仍保留，不会被删除或覆盖。
- **联网边界**：源媒体在本地处理；第一次转录时需联网下载 Whisper 模型及 WASM 资源，首次烧录需下载 FFmpeg Core 等运行时。真实推理/烧录性能依赖设备与浏览器。

### 代码组织

```text
src/App.vue                            Vue 统一壳与三功能导航
src/components/CaptionWorkspace.vue   React 工作区动态挂载及样式隔离
apps/caption-studio/src/App.tsx        React 字幕编辑器（embedded 模式）
apps/caption-studio/src/embed.tsx      React 挂载/卸载 API
apps/caption-studio/vite.config.ts     生成可嵌入的 ES 模块与 CSS
dist/caption/                          构建产物（非源码）
```

### 安装与运行

要求 Node.js 22+、npm 11：

```bash
npm ci
npm ci --prefix apps/caption-studio --ignore-scripts
npm test
npm run build
npm run preview
```

使用 `npm run preview` 在同一页面验证全部三个功能。日常仅调试 Vue 页可以运行 `npm run dev`；字幕子应用在此集成版本中按库形式打包，因此开发时需要重新执行 `npm run build` 并通过 preview 验证一体化效果，原先的独立子站代理不再作为集成入口。

通过 GitHub Actions 每次在主分支更新时重新构建并发布两个技术栈的产物；React 字幕编辑器构建到 `dist/caption/`，由 Vue 页面按需从相同来源加载。执行 `npm test` 会覆盖双方单元测试，独立 Chrome E2E 检查同页切换、字幕 SRT 导入导出、视频任务状态保留及 UI 导航。

字幕子项目的来源、限制和许可证见 [apps/caption-studio/README.md](apps/caption-studio/README.md) 与 [ATTRIBUTION.md](apps/caption-studio/ATTRIBUTION.md)。
