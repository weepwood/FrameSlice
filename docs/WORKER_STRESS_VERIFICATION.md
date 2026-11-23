# FrameSlice：Web Worker、完整性校验与大文件测试

## 1. 处理架构

```text
Vue UI（主线程）
  ├── file picker / 文件展示 / 控制按钮
  ├── inspectWithWorker ──▶ 每次读取媒体信息的短生命周期 Worker
  └── runWorkerJob ──▶ 每个处理任务独立 Worker
                            ├── BlobSource + Mediabunny
                            ├── 分割：预扫关键帧 → 规划 → 流式封装 → 完整性校验
                            └── 抽帧：WebCodecs + OffscreenCanvas → Blob → 本地写入
  ◀── progress / fileStarted / saved / segment / preview / complete / error
```

浏览器中 `File`、`Blob` 和用户授权的 `FileSystemDirectoryHandle` 通过结构化克隆发送到 Worker。**不把 12GB 视频复制为单个 ArrayBuffer**。目录选择只能在 UI 中由用户触发；Worker 只使用已授权的句柄。

Worker 在处理媒体包时定期让出事件循环以接收取消消息。正常取消触发 AbortController，并清理当前不完整文件。若 Worker 持续无响应超过 10 秒，将终止线程并尝试移除已上报为正在写入的文件，已校验完成的输出将保留。断电、浏览器崩溃或强制关闭时无法保证完全清理。

## 2. 视频输出完整性校验

分割页新增 **快速校验** 和 **逐包深度校验**，均在每片 MP4 写入完成后执行。只有校验成功才会出现在结果列表中；失败会删除当前片段并停止整个任务，已完成片段保留。

| 校验档位 | 检查项目 | 代价 |
| --- | --- | --- |
| 快速（默认） | 输出非空、MP4 可解析、视频/音频轨数、编码匹配、时长合理、首尾压缩包可读取、首包是关键帧 | 少量随机读取，适合 12GB 大文件 |
| 深度（可选） | 快速校验 + 对每个轨道遍历完整压缩数据包，用 CRC32 比对复制前后的包数、总字节和内容 | 需要重读每片输出；大型视频会显著增加处理时间和磁盘 I/O |

**校验边界：** CRC32 是错误检测码，不是抗恶意篡改的加密摘要。两种模式都不能证明源文件没有既有的解码错误，也不能替代视频逐帧解码、播放和音视频同步测试。复杂 B 帧、VFR、多音轨、HEVC/edit list 仍存在兼容风险。

## 3. 自动化 12GB 逻辑文件测试

在 GitHub Actions 的 **12GB 逻辑文件压力测试（按需运行）** 工作流中可调整 1–64GB 逻辑文件大小，也可以在本地运行：

```bash
npm ci
npm run stress:virtual
# 指定虚拟大小（GB）
STRESS_GB=12 npm run stress:virtual
```

虚拟文件不会在内存中生成 12GB 数据，也不会产生 12GB 真实视频。测试通过 `Blob.slice(start,end).arrayBuffer()` 模拟读取覆盖整个 12GB 逻辑地址空间，跟踪进程 RSS、单次缓冲区上限和读入字节数。结果写入 `stress-report.json` 并在 Actions 中上传工件。

CI 运行结果（2026-11-23，GitHub hosted Ubuntu runner）：

- 逻辑文件 12,000,000,000 字节，2862 次分块读取，最大单次读取 4,194,304 字节；
- 峰值 RSS 从 42MiB 到 76MiB，增长约 34MiB；
- 读数来源是内存构造的虚拟切片。**不能将报告中的吞吐视为真实磁盘读写速度，更不能宣称真实 12GB MP4 已通过。**

## 4. 真实 MP4 端到端压力测试（本地）

要求 Node.js 22.17+、足够的磁盘空间，以及一份您自己提供的 MP4。脚本使用 `fs.openAsBlob` 返回磁盘背书 Blob，调用与网页相同的 `splitVideo` 和 `verifySegment` 模块，不一次读取整个文件；输出到独立测试目录并生成 `stress-report.json`。

```bash
npm ci
# 参数：输入文件、输出父目录、每份目标 GB、校验模式
npm run stress:real -- "/path/to/12GB-video.mp4" "./stress-outputs" 4 quick
# 若需要全量压缩包 CRC32 复核
npm run stress:real -- "/path/to/12GB-video.mp4" "./stress-outputs" 4 deep
```

输出报告包含输入大小、目标大小、片段列表、校验结果、任务耗时和 **Node 进程 RSS 峰值**。该脚本验证真实文件的解析/流式切割/输出校验能力，但**不直接验证 Chrome Worker 的性能**。若要验证浏览器真实 12GB 表现，需在 Chrome/Edge 的 FrameSlice 页面用同一文件执行一次，观察 Chrome 任务管理器的 CPU/内存、实际导出时长，并抽查音视频播放及同步。

## 5. Chrome 真实 Worker 测试

GitHub Actions 有独立的 **Chrome 真实浏览器 Worker 冒烟测试** 工作流，用生产构建在 Chromium 环境运行：

1. 将内置 H.264/AAC MP4 导入页面并等待 Worker 完成媒体解析；
2. 用 OPFS 的真实原生 `FileSystemDirectoryHandle` 替代操作系统文件夹选择器；
3. 经 `postMessage` 将授权的原生句柄克隆到 Worker；
4. 由 Worker 分割视频，并检查页面校验结果与输出目录中 MP4 文件；
5. 由 Worker 抽帧，并验证输出目录中的 JPEG 与预览图。

此冒烟测试使用很小的视频样本，不能代替不同编码、长视频和真实 12GB 压力测试。

## 6. 接下来仍需覆盖

- 在 Windows/macOS 桌面版 Chrome、Edge 使用 12GB 源文件执行完整流程；
- 检查长 GOP、B 帧、VFR、部分不规范时间轴的切分兼容性与音视频同步；
- 磁盘空间不足、中途拔盘、浏览器崩溃和权限撤销等异常；
- 真实视频的分段校验报告导出为 JSON/CSV、吞吐/内存图表与性能回归阈值。

FrameSlice 是本地处理工具，压力测试不向远程服务发送用户视频。
