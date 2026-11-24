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

- 真实 12GB 工作流与普通浏览器 CI 分离；生成文件必须实际分配磁盘且 ffprobe 可读取，拒绝以逻辑 Blob 替代。视觉基线必须明确审核，不自动覆盖。

- 大文件报告仅在实际分割验证通过后报告吞吐；配额预检失败不是引擎性能失败。使用隔离持久化 Chrome profile 获取正常站点配额，不能自动扩大或绕过配额。

- 无损合并必须预扫描每条轨道时间边界和配置，实际输出逐轨 CRC 校验；MP4 独立检查 hdlr 轨道表，拒绝未知轨道。

- 视觉基线审核见 docs/UI_REVIEW.md；必须使用可正常显示 CJK 的测试环境，未经审核的截图不得作为通过基线。

- 批次清理仅删除元数据，不删除文件；批次更新与清理必须使用同一跨标签页锁。

- 批次变更必须通过 scripts/browser-batch-resume.mjs 实际 OPFS 回归。

- 跨标签页历史以事务合并记录为主，运行任务对象不能由远程快照替换；只清理明确结束的记录。

- 配额/权限 DOMException 名称必须跨 Worker 保留；故障测试检查已提交文件不被清理。UI 依赖必须有锁定版本、审计和浏览器回归；禁止未经审核更新视觉基线。

- Reka UI 2.11.0 依赖锁来自真实 CI；保留窄屏布局与工作区挂载。真实大文件通过证据见 REAL_BROWSER_TESTS.md。

- AAC 前置包仅允许用户明确选择后排除完全在播放区间外的单个包；报告排除，其他时序问题拒绝。内嵌未知 MP4 轨道必须显示或明确确认不保留。

- v0.7.0 发布仅包含 #6/#7 已验收内容；统一四个版本字段并验证线上版本与 SHA，正式 Release 使用当版 changelog。后续高风险专项独立 PR。

- MKV 内嵌字幕提取限有明确 BlockDuration 的 S_TEXT/UTF8，仅读必要 EBML 头与字幕文本，拒绝不支持变体；不把 VTT 文本导出称为样式/轨道无损复制。

- 批量检查点清理必须先取得全部 session 锁并单一 IDB 事务删除，不清理用户文件；localStorage 摘要与 IDB 无跨存储原子性。Reka Dialog 必须保留确认和焦点语义。

- 媒体兼容专项脚本 media-compat-real.mjs；必须区分解码成功、逐包一致、AAC 接缝逐采样一致和明确拒绝。真实跨标签页历史 E2E 需验证清理与刷新。
