# Attribution / 来源说明

本项目基于 MIT 开源项目 [sudesh1456/whisper-caption-editor](https://github.com/sudesh1456/whisper-caption-editor) 的功能、架构和部分字幕算法设计进行独立改造。

- 原作者：Sudesh / sudesh1456
- 原项目许可：MIT
- 核心参考：Whisper Web Worker、16 kHz PCM 转换、SRT/VTT 字幕处理、FFmpeg.wasm 烧录方式
- 本版本新增：中文/日文字符分句、编辑工程 IndexedDB 持久化、波形时间轴和拖动校时、中文 UI、搜索、分段质量提示与浏览器运行后端手动切换
- **没有内置任何字体文件或媒体样例**。烧录默认在运行时请求原项目的 Inter 字体；中文请自行提供许可允许的中文 TTF/OTF 字体。字体许可证由其权利人决定。
- Transformers.js、FFmpeg.wasm 等依赖及运行时资源保留各自独立许可；FFmpeg Core 的实际分发和许可证合规需独立核查，尤其是打包和再分发场景。
