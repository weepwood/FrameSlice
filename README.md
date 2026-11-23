# FrameSlice

**纯前端 · 本地视频分割与定时抽帧工作台。**

FrameSlice 是基于 Vue 3、TypeScript、Vite 和 [Mediabunny](https://mediabunny.dev/) 的静态网页应用。文件从用户设备按需读取；不会上传到远程服务器。

## 当前功能（v0.1.0）

- 选择或拖放本地视频，读取时长、尺寸、视频/音频编码信息。
- **无损视频分割（初版）：** 通过预扫描压缩数据包大小，在关键帧附近规划分割位置；复制原始压缩数据包，重新封装为独立 MP4 文件，逐片保存到本地目录。
- **定时抽帧：** 支持间隔秒数、JPEG/PNG/WebP、输出宽度；按时间戳解码后逐张写入本地目录。
- 取消处理、进度显示、文件列表、抽帧缩略图预览；无后端、无账号。
- GitHub Actions 自动部署到 GitHub Pages。

### 支持范围与已知限制

- **推荐桌面 Chrome / Edge**，HTTPS 环境，支持 File System Access API。
- 无损分割输入以 MP4/M4V/MOV 为目标，目前仅支持 **1 条视频轨 + 最多 1 条音轨**；不支持保留字幕轨、多音轨、章节、复杂编辑列表、DRM；部分非标准源视频不保证兼容。
- 分割在 GOP（关键帧组）边界完成，目标值为**文件大小上限**而不是精确每份相等。按媒体包字节数预估并预留 5% 安全余量；导出后会检查实际大小，超限时该片段会被移除并报告错误。
- 由于关键帧、B 帧、编码配置、音频 priming 和时间戳等因素，部分源文件可能无法无损拆分。请先使用短视频进行验证，再尝试 12GB 视频。
- 分割任务**必须选择输出文件夹**，避免多 GB Blob 在浏览器内存中积压。浏览器不支持文件夹保存时不会开启分割任务。
- 定时抽帧需要浏览器能够解码该视频。支持文件夹保存时逐张写入磁盘；否则最多生成 30 张可单独下载的预览图。
- 输出任务不可跨刷新恢复；关闭/刷新标签页会中断工作。取消后已完成的片段仍保留。
- 导出性能依赖硬盘 IO、视频封装结构与浏览器实现。**尚未完成 12GB 真实源文件的性能/兼容性回归测试。**
- 第三方依赖会在安装时联网下载；程序运行后没有任何媒体内容上传逻辑。界面仅使用设备系统字体，不请求外部字体服务。

## 快速验证（建议先做）

建议先准备一段 6–10 秒的 H.264 + AAC MP4 作为浏览器冒烟测试：设置 1 秒抽帧间隔，验证截图导出；随后测试无损封装并检查输出文件能独立播放。**多片分割仍需使用大于 32 MB、含多个关键帧组的视频进行验证**，之后再测试 12GB 文件。

## 开发

要求 Node.js 22.12+。

```bash
npm install
npm run dev
```

运行测试与生产构建：

```bash
npm test
npm run build
npm run preview
```

## 发布到 GitHub Pages

1. 创建仓库 `weepwood/FrameSlice`，默认分支设为 `main`。
2. 将本项目的**文件内容**推送到该仓库的 `main` 分支。
3. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
4. `.github/workflows/deploy.yml` 会在推送时安装依赖、运行单元测试、类型检查、构建并发布。仓库首次创建后建议运行 `npm install` 并提交生成的 `package-lock.json`，随后将工作流的 `npm install` 改为 `npm ci`，以实现完全可复现的依赖安装。
5. 发布成功后预计站点地址：`https://weepwood.github.io/FrameSlice/`。

> 注意：Vite 配置中的 `base` 在 GitHub Pages 模式下为 `/FrameSlice/`；如果仓库更名，也要同步修改 `vite.config.ts`。

## 结构

```
src/
  App.vue                 主界面与任务协调
  lib/media.ts            媒体文件预检
  lib/split.ts            关键帧无损分割与流式写入
  lib/planning.mjs        独立可测试的分段规划器
  lib/frames.ts           WebCodecs 定时抽帧
  lib/storage.ts          文件夹写入与小文件下载
  lib/format.ts           格式化与时间点计算
  assets/style.css        视觉样式及响应式布局
.github/workflows/deploy.yml
```

## 设计原则

保持本地处理、拒绝不安全的自动降级、不将大文件复制到内存、错误明确可见、支持中止任务和资源回收。

## 许可证

MIT。详见 `LICENSE`。Mediabunny 项目依据 MPL-2.0 发布，其版权和许可证由原项目保留。
