# Whisper Caption Editor：源码审查与优化方案

日期：2026-11-23。原仓库：[sudesh1456/whisper-caption-editor](https://github.com/sudesh1456/whisper-caption-editor)，MIT，默认分支 main。

## 一、原仓库可验证事实

| 文件 | 源码事实 | 当前改进 |
| --- | --- | --- |
| `src/lib/audio.ts` | 完整文件 `arrayBuffer` -> `AudioContext.decodeAudioData` -> 16 kHz mono | 添加波形下采样与大文件阈值；**尚未解决**全量解码峰值内存 |
| `src/lib/captions.ts` | 字符长度按空格分词，Whisper 长段按字符比例推算时码 | 新增中文标点/字符 fallback、无效时间过滤、整体偏移保持长度 |
| `src/hooks/useHistory.ts` | 每次 `set` 都会压入历史栈，文本编辑连续按键可能消耗 100 个历史项 | 相同字幕短时间编辑分组 |
| `src/workers/transcribe.worker.ts` | WebGPU 自动检测，失败后报错，模型单实例复用 | 后端可选，自动模式初始化失败回退 CPU，取消仍通过销毁 Worker |
| `src/components/CueList.tsx` | 主要是列表加文本框、时间输入 | 加入字幕搜索、工具栏、波形时间轴、拖动边界 |
| `src/lib/burn.ts` | FFmpeg.wasm + `libass`，经 CDN 动态加载 Core；短片为主 | 支持自行选择中文字体，保留动态加载与终止 |
| `src/App.tsx` | 21 KB 左右，涵盖大量状态 | 本版本仍保留主工作台组件，但将字幕、音频、存储、历史和时间轴独立模块化 |
| `README.md` | 原仓库 roadmap 明确词级字幕、波形、翻译与 IndexedDB 未实现 | 先实现波形与 IndexedDB；词级时间戳和翻译单列为待办 |

## 二、优先级

### P0：可靠性

- **流式解码**：使用 WebCodecs（可用平台）/ `mediabunny`/ FFmpeg Worker 解封装视频音轨，保持输入音频为分块流，并限制并发。当前版本仅添加风险阈值与提示，不声称已完成。
- **任务生命周期**：用 jobId 丢弃过期 Worker 消息；取消任务销毁 Worker；当前无法立即中断浏览器内部的 `decodeAudioData`，只丢弃解码完成后结果。
- **数据恢复**：字幕与项目风格写 IndexedDB；视频仅存名称，不保存视频 blob；同名媒体重新关联后保留字幕。
- **中文字幕**：正确按 `，。！？；、` 分句；避免无空格文本形成单一长句。

### P1：编辑效率

- 波形画布和字幕块左右边界拖动。
- 搜索字幕，播放状态高亮，键盘微调。
- 文本批量修改/撤销合并，字幕重叠、时间、CPS、过长检查。
- 在全部字幕功能之外，增设工程 JSON 导入导出。

### P2：准确性与体验

- 区分粗字幕段时间戳、词级时间戳与人工调整结果。
- 引入 Whisper `return_timestamps: 'word'` 模式可行性测试（尤其中文/日文词边界）。
- 增加 VAD 静音切分、Whisper 假词/幻觉检测以及读速分段策略。
- 中英双语字幕不应仅依赖 Whisper 翻译任务，需采用独立目标为 `zh` 的机器翻译组件，优先考虑 WASM/WebGPU 按需加载与隐私性。

### P3：视频输出和部署

- 使用桌面 FFmpeg 或 WebAssembly 输出，提供输出耗时与内存预算提示。
- ASS 字幕样式与用户选择 CJK 字体的测量一致性测试。
- Vite 静态部署、CI 类型检查、单元测试、浏览器回归。

## 三、验收标准与当前验证状态

| 检查 | 结论 |
| --- | --- |
| 中文无空格分句、字幕解析、整体平移等核心纯函数 | 已使用本地 TypeScript 编译与 Node smoke tests 验证 |
| 仓库结构和源码已写入归档 | 已完成 |
| 依赖 `npm install`、完整 TypeScript React 构建 | **未验证**（当前运行环境无法访问 npm registry） |
| WebGPU / WASM Whisper 真实视频识别 | **未验证**（需要浏览器与模型文件） |
| 视频烧录真实 FFmpeg Core、字体、编码器 | **未验证**（需要浏览器与运行时资源） |
| GitHub Pages 线上发布 | **未执行**，源码只包含 Actions 模板 |

## 四、部署建议

将此目录创建为自己名下的独立 GitHub 仓库，首次联网执行 `npm install`，提交生成的 `package-lock.json`，随后把 workflow 改回 `npm ci`。请先完成 `.srt/.vtt` 导出、中文转录和播放对齐 E2E，确认 MP4 烧录与中文字体无问题，再发布长期可用版本。

**许可**：保留源项目 MIT 署名；字体、Transformers.js 及 FFmpeg 运行时资源遵守各自许可证。详见 `ATTRIBUTION.md`。


## 2026-11-23：超大媒体自动提取音轨（v0.3.0）

已替换原有 `file.arrayBuffer() + decodeAudioData()` 一次性处理流程。现在通过 Mediabunny BlobSource + WebCodecs 在 Worker 中解码单独音轨；每次仅持有有限 PCM 音频片段，由 Whisper 分段识别并增量追加字幕。删除超 350MB 拦截。补充重叠边界裁剪和有界波形缓存的单元测试。注意浏览器真实 1GB/4GB/12GB 视频兼容性及音频转录完整性尚需端到端压力测试。
