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
