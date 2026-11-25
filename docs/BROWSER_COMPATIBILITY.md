# V1.0 浏览器能力边界

FrameSlice 不按浏览器名称决定全部能力，而是检查安全上下文、目录选择接口，并由媒体引擎确认具体编码能否解码。推荐桌面 Chrome / Edge 的 HTTPS 或 localhost 页面。

| 功能 | 有目录选择能力 | 无目录选择能力 |
| --- | --- | --- |
| 媒体预检、GOP 规划 | 需要 Worker 与可解析容器 | 同左 |
| 无损分割、轨道封装导出 | 需授权目录，输出校验 | 明确禁用，不缓存整段媒体 |
| 抽帧 | 解码支持，逐张落盘 | 最多30张，逐张下载；不支持编码时报告错误 |
| 新建断点续作 | 必须授权目录 | 禁用 |
| 字幕导入、编辑与工程备份 | 依赖浏览器文件与 IndexedDB | 同左 |
| AI 转录、实验性烧录 | 模型/WASM、设备、浏览器能力决定 | 不承诺全浏览器可用 |

## 验收方法
- 正式浏览器门禁固定 Ubuntu 24.04：Playwright 1.55.0 的 Firefox / WebKit 构建支持该平台，Ubuntu 26.04（当前 ubuntu-latest）不受支持。两个引擎均执行，任一失败仍阻塞发布。运行环境变化后必须复核正式视觉候选。
- 正式 Chrome 仍执行真实 OPFS Worker 输出、文件校验、续作、字幕并发、固定截图与性能门禁。
- 新增 `scripts/browser-capability.mjs`。Chromium 人为移除目录选择接口，用真实浏览器验证降级逻辑；Firefox 和 WebKit 保留原生接口，验证实际能力、媒体预检/规划、抽帧上限、可解码则下载 JPEG、不可解码则要求明确错误、字幕编辑及刷新恢复。
- Playwright WebKit 不是实机 Safari，也不代表 iOS Safari；Firefox headless 不是所有操作系统的 Firefox。编解码结果取决于浏览器构建和设备。专项通过不等同全部媒体、全部交互或全部版本兼容。
- CI 输出 `browser-capability-*.json` 与交互截图，保留实际引擎版本和结果。未取得报告前不得宣称该引擎通过。
- 12GB 真实视频、长时间真实 AI、真实设备权限提示和任意复杂格式仍需专项。请用非敏感短样本先验证。

本地执行（预先构建并启动 preview）：
```sh
npm install --no-save --no-package-lock playwright-core@1.55.0
node node_modules/playwright-core/cli.js install firefox webkit
BROWSER_ENGINE=chromium CHROME_PATH=/path/to/chrome node scripts/browser-capability.mjs
BROWSER_ENGINE=firefox node scripts/browser-capability.mjs
BROWSER_ENGINE=webkit node scripts/browser-capability.mjs
```

## V1.0 正式候选实测（CI 45554941662）
Ubuntu 24.04，Chrome 158.0.8127.88（人为关闭目录选择）、Firefox 141.0、WebKit 26.0（原生无目录选择）：三者均通过媒体预检/规划、分割禁止启动、30张抽帧限制、实际JPEG下载及字幕草稿刷新恢复。报告在artifact 14995471961；Chrome完整OPFS媒体测试亦通过。非实机Safari、非全编码与真实AI验收。

## V1.1 资源及桌面交互验收
正式CI运行 `scripts/browser-resource-soak.mjs`（SOAK_MS 默认120000，30–600秒可调），在同一真实浏览器中反复切换合成MP4源、生成不同视窗缩略图并校验缓存淘汰、对象URL计数和最后释放。记录CDP主JS堆样本，不将其等同浏览器总内存或长期稳定性。新增 `browser-desktop-workbench.mjs` 在Chrome/Firefox/WebKit分别验证横纵面板指针/键盘、持久化、窄屏草稿与数值精度。正式报告需独立核验；本地Edge通过不等于另外两引擎通过。
