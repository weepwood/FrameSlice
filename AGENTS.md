# FrameSlice AI 协作说明

- 主分支 main，Vue 3 / React 字幕子应用、Mediabunny、WebCodecs；静态 GitHub Pages。
- 保持源媒体本地处理，避免把大文件整体载入内存；任何可能丢轨或转码的行为都要提示并获得确认。
- 中文 Git commit；独立分支、PR，按风险分级测试，CI 未通过不得合并或发布。
- 安装：`npm ci` 与 `npm ci --prefix apps/caption-studio --ignore-scripts`；测试 `npm test`，构建 `npm run build`。
- 真实 12GB 浏览器测试不能用逻辑 Blob 或 Node 压测冒充；记录测试样本、平台、浏览器、实际写入及校验结果。
- 当前进度与后续优先级见 [docs/ROADMAP.md](docs/ROADMAP.md)。每次交接更新真实状态，明确未验收项。
