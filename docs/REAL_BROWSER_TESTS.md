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
