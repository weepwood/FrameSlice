# 真实浏览器专项验收

## 12GB 真实文件
需要真实 MP4（至少 12,000,000,000 字节）、目标设备 Chrome 和足够磁盘/OPFS 配额。测试通过本地文件选择路径加载，不创建虚拟 Blob，不将视频上传。
1. 安装两个工作区依赖；`npm install --no-save --no-package-lock playwright-core@1.55.0`；`npm run build`。
2. 另一个终端执行 `npm run preview`。
3. `CHROME_PATH=/path/to/chrome node scripts/browser-stress-real.mjs /path/to/real-12GB.mp4 browser-stress-report.json`。
4. 核对报告的源文件实际字节、分割片数、输出文件大小、校验结果、耗时、CDP 主渲染进程 JS Heap。实际浏览器总内存（Worker/WASM/GPU）需要设备侧进程监测，报告不可当成全进程峰值。
5. OPFS 使用真实浏览器目录句柄；操作系统文件选择器/外部磁盘还需要人工验证。低于 12GB 的开发测试须显式设置 STRESS_MIN_BYTES；报告标记是否达到 12GB，不能冒充验收。

## AI 真实专项
`.github/workflows/ai-real.yml` 在模型/烧录/CSP 高风险改动时运行，并支持手动触发。使用 espeak-ng 生成语音、FFmpeg 生成短 MP4；实际加载 Whisper Tiny English、WASM 推理、验证字幕词、检查浏览器缓存、重复推理、烧录并使用 ffprobe/ffmpeg 校验和解码。缓存存在并重复识别不等于完全离线成功；离线测试另行补充。需要 Hugging Face、CDN 网络及 Chrome 编解码能力，失败报告须保留。

## v0.6 CI 基准与回归
浏览器门禁使用仓库短 MP4 样本生成 browser-benchmark.json（qualifies12GB=false），并采集 light/dark、桌面及移动端截图。真实 12GB 仍须提供实际源文件和足够磁盘；不可使用短样本替代。输出 mtime、跨标签页锁及篡改拒绝通过真实 Chrome OPFS 测试覆盖。性能指标包含主线程 JS 堆峰值、输出字节和端到端源字节/秒（非纯 IO 吞吐）。

Pages 产物使用 github-pages-${GITHUB_RUN_ATTEMPT}，避免同一运行的重试产物重复；检查必须仅找到一个有效匹配产物。

## 生成真实大型测试视频
`node scripts/generate-large-media.mjs /tmp/frameslice-large-media` 生成至少 12GB 的非稀疏真实编码 MP4；源是重复编码的视频样本，不是多编码、多轨真实用户素材。需要至少 32GB 可用空间。专项工作流 large-media.yml 使用浏览器 OPFS 分割。Linux 采样进程树 RSS 含共享页重复统计，/proc IO 计数为近似值而非纯磁盘吞吐。
视觉差异：安装 Pillow，人工审核后解压选定的工作流截图为 baseline 目录，运行 `python scripts/compare-visual.py baseline current --output visual-diff`；禁止自动覆盖基线。

## 首轮真实大文件结果（2026-11-24）
运行 45402145525，真实 H.264 MP4 12,948,073,305 B，已分配 12,948,078,592 B，468 秒，39 次重复，Chrome 158。隐式临时浏览器 context 的 OPFS quota 10,737,491,968 B，预检失败；未开始处理，无内存采样和有效吞吐量，旧报告的 4311.54 MiB/s 无意义。改为隔离持久化 profile（不放宽配额、不伪造目录），失败不输出吞吐，完整报告写入日志，待复测。

- 第二轮 45402914819：持久化 profile 的实际配额仍约 10 GiB，预检再次失败，吞吐正确为 null。第三轮允许测试脚本显式设置 STRESS_OPFS_QUOTA_BYTES=15000000000，通过 CDP Storage.overrideQuotaForOrigin 仅针对 localhost 的隔离 profile；检查真实可用磁盘、记录默认/实际配额及 overrideActive。不是生产功能或默认配额验收，仍用真实 OPFS 读写，不虚拟化文件。

- 第三轮 45403386427：CDP quota 15,000,000,000 B，overrideActive=true，物理可用 77,885,366,272 B，navigator.storage.estimate 仍为 10,737,420,024 B。预检误使用网页估计值停止，未处理。受控测试以 CDP 已确认配额为预检依据，同时保留原网页估计值，最终必须以真实文件写入及校验为准。

## 第四轮通过（2026-11-24）
CI 45403900533 / artifact 14925370006，63e05c0。12,948,073,305 B 实际 H.264，四个输出共 12,947,966,762 B，处理 85,486 ms（144.44756987 MiB/s），进程树 RSS 峰值采样 1,672,740,864 B，主 JS 堆 4,537,348 B。15GB 显式 CDP 配额；重复编码无音轨、快速验证，不代表普通配额、多轨、深度验证及纯 IO 吞吐。

新增深度专项：STRESS_DEEP=1 STRESS_RUNS=2 连续两次完整源处理，轮间只清理隔离测试 profile 的 OPFS；STRESS_SCENARIO=cancel 在已提交片段后取消；STRESS_SCENARIO=quota 低 CDP 配额实际写入触发失败。均不代表真实物理磁盘耗尽。

## 12GB 深度及故障专项首次通过
CI 45407279930 / artifact 14927132702（a84d3eb）。12,948,073,305 B H.264，468 秒，15 GB 受控 OPFS。两轮分别 199751 / 202832 ms，各 4 个输出共 12,947,966,762 B，各逐包 CRC32 检查 12,947,902,110 B。总处理 403538 ms（61.19991157 MiB/s，含轮间清理），RSS 采样峰值 1,685,843,968 B，主 JS heap 7,830,256 B。取消场景 25305 ms，仅保留已完成 3,790,308,437 B 片段。1 GB 受控配额场景 6924 ms 触发真实 quota error，输出为空。后两场景为快速校验，非深度中途取消；非物理磁盘耗尽或系统权限撤销。最新提交 4cf3946 的独立复测仍在运行。

## 原生系统目录权限撤销验收（人工环境，未完成）
Chrome 桌面真实目录选择器选一个专用测试目录，开启续作，处理短视频并保留结果；在站点权限设置撤销文件编辑授权，刷新后重新关联源文件，拒绝授权时不得覆盖既有输出；重新授权原目录后完整指纹核对并恢复。记录 Chrome/OS 版本、权限状态、输出 mtime 和错误名称。OPFS/模拟 NotAllowedError 测试不能替代此项。禁止对实际用户数据目录进行破坏性测试。

## #10 新 GOP 引擎复测
45410598844 / artifact 14929326151：两次真实 12GB 深度处理总 405672 ms，60.877975 MiB/s，RSS 1,718,296,576 B，主 JS 堆 6,043,320 B。取消 25274 ms、1 GB 受控配额写入失败 6906 ms，均通过。原生目录撤销：隔离 Linux Chromium 144.0.7559.96 原生 GUI 尝试，127.0.0.1 被环境组织策略拦截，未进入目录选择器；未绕过策略，未验收。临时测试文件保持不变。

## PR #13 真实媒体与模型缓存验收（2026-11-25）
- Whisper / FFmpeg：CI 45425639766 / artifact 14934259185，报告 status=passed、errors/network 均为空。实际 Whisper Tiny English 首次识别 10,943 ms，缓存后再次识别 9,951 ms；识别文本包含 Hello World。H.264 字幕烧录 61,351 B、6.640998 s，ffprobe 确认视频流，FFmpeg 完整解码成功。模型缓存清理前实际找到 7 个 onnx-community/whisper-tiny.en 下载资源，执行任务中心清理后剩余 0；模拟缓存隔离另由 Chrome 功能脚本覆盖。此项验证模型资源删除，不代表其他同源应用不会需要重新下载。
- 12GB 深度专项：CI 45425639756 / artifact 14936658340。真实源 12,948,073,305 B、468 s；受控隔离 Chromium profile，CDP 显式 OPFS 配额 15,000,000,000 B，物理可用磁盘 77,851,066,368 B。连续两轮深度分割分别 148,442 ms / 151,017 ms，每轮 4 个文件，输出共 12,947,966,762 B；8 个分段均逐包 CRC32 验证通过。总耗时 302,765 ms，报告吞吐 82.09 MiB/s（端到端源读取估算，不是纯磁盘 IO），采样进程树 RSS 峰值 1,722,023,936 B，主 JS Heap 峰值 8,015,060 B。取消场景 26,244 ms、1GB 受控配额故障场景 5,988 ms 均通过。限制：Linux RSS 采样含共享页重复统计；CDP 配额覆盖仅用于隔离测试，不代表默认浏览器配额、物理磁盘耗尽或 OS 目录授权撤销。
- 复杂编码与字幕兼容：CI 45425639899 通过；报告 artifact 14936083450。
