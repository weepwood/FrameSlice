# FrameSlice AI 协作说明

- 主分支 main，Vue 3 / React 字幕子应用、Mediabunny、WebCodecs；静态 GitHub Pages。
- 保持源媒体本地处理，避免把大文件整体载入内存；任何可能丢轨或转码的行为都要提示并获得确认。
- 中文 Git commit；独立分支、PR，按风险分级测试，CI 未通过不得合并或发布。
- 安装：`npm ci` 与 `npm ci --prefix apps/caption-studio --ignore-scripts`；测试 `npm test`，构建 `npm run build`。
- 真实 12GB 浏览器测试不能用逻辑 Blob 或 Node 压测冒充；记录测试样本、平台、浏览器、实际写入及校验结果。
- 统一任务核心使用 [docs/JOB_CORE.md](docs/JOB_CORE.md)；各媒体 Worker 必须经过统一调度，不能并行启动高负载操作。
- 共享语义样式 Token 位于 src/assets/tokens.css，Vue 主文档提供变量，React Shadow DOM 继承；不要为同一控件另建硬编码主题。
- 当前进度与后续优先级见 [docs/ROADMAP.md](docs/ROADMAP.md)。每次交接更新真实状态，明确未验收项。

- 续作规则：仅完整源指纹、参数、目录身份、输出指纹均匹配才允许跳过；禁止覆盖未知历史输出。参考 src/core/resume.ts。

- 智能抽帧使用有界小画布传统指标，不宣称全帧最优；手动切割必须由引擎验证精确 GOP 边界；新增工作台组件保留现有三个工具入口及共享令牌。

- 高风险续作/抽帧改动必须运行 scripts/browser-resume.mjs（真实 Chrome OPFS、跨刷新恢复），不只运行单元测试。

- v0.6 工作台使用指南见 docs/WORKBENCH.md；正式发布必须等待生产部署及浏览器门禁成功，CHANGELOG 必须明确真实 12GB 等未验收事项。

- 部署必须核对线上 frameslice-version.json 的 SHA；Pages 产物暂不可见可有限重试，不能跳过浏览器门禁。短样本报告 qualifies12GB=false，不算 12GB 验收。

- 批次恢复不得凭元数据跳过旧结果：必须通过 ResumeJournal 完整文件指纹与 Web Locks；本地存储诊断不得自动删除用户文件。

- 无损剪辑拒绝非 GOP 边界；合并首版只允许同编码配置单视频轨无音频/字幕的输入，不得静默丢轨。多字幕需校验输出轨数量。
