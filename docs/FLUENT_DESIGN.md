# Fluent 2 工作台设计与播放器迁移

基线：V1.1.1（8fb541f），开发分支 feat/fluent-media，目标 V1.2.0。正式版本保持不变。

## 主题与公共控件

- Microsoft Fluent UI Web Components 3.2.4（MIT）与官方 Fluent Tokens 1.0.0-alpha.25（MIT），固定版本。后者为预发布依赖，仅用于生成静态主题文件，不在运行时调用。
- `node scripts/generate-fluent-theme.mjs` 从 webLightTheme / webDarkTheme 生成 `fluent-theme.css`，映射既有语义令牌；品牌前景与填充分离，主题、系统主题和嵌入 Shadow DOM 共享。勿手改生成文件。
- Vue WorkbenchButton（检查器和媒体资源入口等）迁移到 fluent-button，保留显式 button 角色；其余原生/Reka/Base UI 控件保持已验证交互，通过 fluent-controls.css 统一视觉。后续逐项审查可迁移控件、键盘与焦点、Shadow DOM、尺寸及精度，不盲目同时引入两套组件。
- 保留 react-resizable-panels 布局。后续按钮、选择器、输入、复选框、菜单、标签、进度和弹窗应逐项登记实际库归属与未迁移原因。

## 播放器

Media Chrome 4.19.5（MIT）提供真实媒体元素的播放、跳转、进度、音量、速度、画中画入口等控制，Vue 与 React 使用同一版本和 fluent-player.css。字幕无媒体状态保留虚拟时间轴；原字幕选中循环、字幕叠加及安全切点逻辑保留。嵌入编辑器使用小型 CaptionFullscreen 适配 ShadowRoot 的真实 fullscreenElement，避免 Media Chrome 误判退出状态；不支持标准 Fullscreen API 时禁用该入口。画中画能力取决于浏览器，DOM 字幕并不保证出现在画中画中。

## 验收及后续

83项单测、生产构建、两侧生产依赖安全审计零已知漏洞。真实 Edge 已验证两播放器的播放暂停、前后跳转、进度、音量状态、静音、倍速、全屏往返、字幕叠加、390px全屏按钮可见及四工作区统一布局，原媒体冒烟通过。16张本地视觉候选哈希验证；新增 browser-fluent-player.mjs 纳入正式CI。测试使用短合成视频，未验收实际画中画、带音轨声学输出、Firefox/WebKit新增播放器、数小时或12GB大文件。未批准新基线。
新增依赖增大包体积：主入口 gzip 31.88→95.00KB，字幕入口 197.70→约246.73KB。后续先拆分按需加载及避免重复播放器运行时，再集中迁移剩余控件和三浏览器回归。保留2%视觉门禁及V1.1.1发布资产。
