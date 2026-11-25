# FrameSlice 样式维护边界

## 所有权
| 文件 | 职责 |
| --- | --- |
| src/assets/fluent-theme.css | 官方 Fluent 设计令牌的浅深主题映射；不放业务布局 |
| src/assets/tokens.css | 主应用语义令牌及全局密度 |
| src/assets/style.css、workbench.css、unified-workbench.css | Vue 宿主外壳及工作区布局；不直接控制 React 内部 |
| src/assets/number-field.css、fluent-controls.css | 跨框架公共控件外观；焦点、禁用、状态、浮层；不写业务面板尺寸 |
| src/assets/fluent-player.css | 两套播放器共有外观及 Media Chrome 公开接口 |
| apps/caption-studio/src/styles.css | 字幕应用基础、独立入口、既有表单及组件结构；历史规则仅按证据迁移 |
| apps/caption-studio/src/editor-layout.css | 面板尺寸、调整手柄、滚动、响应式堆叠与结构基础 |
| apps/caption-studio/src/caption-workbench.css | 字幕工作台专属视觉及最终业务状态；时间轴/字幕行/辅助面板/字幕播放器停靠 |
| apps/caption-studio/src/caption-style-entry.ts | 统一导入顺序；禁止各入口复制该列表 |

## 隔离与变更原则
Vue 宿主加载字幕 CSS 文本到独立 ShadowRoot；公共控件样式必须在宿主与 ShadowRoot 分别可用，这不是可删除的重复网络/运行时依赖。主题令牌由宿主继承，独立开发入口自行加载主题。公共样式不得依靠穿透 Shadow DOM 的选择器。官方 Fluent 使用公开 part 和令牌；Media Chrome 使用公开 part、slot、属性和 CSS 自定义属性；Reka/Base UI 继续拥有浮层、焦点和精确输入，禁止用 CSS 模拟其行为。

优先编辑拥有该属性的原规则，不增加末尾补丁。相同 selector/property/value/importance 的无条件重复声明应删除；保留有条件的媒体查询、容器查询、特性查询以及不同值的兼容回退。不同选择器的层叠可能有意保留，禁止自动合并全部同名选择器或删除所有历史主题。不得在没有跨入口证据时移除独立入口的样式。避免新增 !important；已有布局库内联尺寸覆盖需说明。

## 验收
运行 node scripts/check-caption-css.mjs 和 node scripts/check-ui-budget.mjs。CSS 检查覆盖三个字幕样式文件的顶层完全相同声明及两个入口的导入约定；不声称等价于完整 CSS 静态分析。正式 CI 同时检查真实交互、四工作区固定视口截图和原 2% 门禁。纯治理变更应先比较修改前后相同浏览器和视口，发现差异需解释并人工审核。V1.2.1 本轮本地16图最大差异0%，不因此替代正式候选审批。

保留独立开发入口、主题切换、真实播放器、字幕时间轴及表单/弹层测试。只有正式候选来源、ZIP摘要、截图哈希与尺寸全部可核验并实际审阅后，才归档旧基线并批准新基线。不得为通过门禁放宽阈值。
