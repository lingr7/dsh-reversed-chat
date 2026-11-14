# 实现原理与已知取舍

> 返回 [README](../README.md)

## 原理

宿主用相属性控制输入框位置（`@deepseek-ai/dsh-client-ui-conversation` / `ConversationRoot.module.css`）：

- `hero` → `justify-content: center` → 居中（不碰）
- `active` → `[data-composer-seat] { position: sticky; bottom: 0; margin-top: auto }` → 贴底（覆盖为贴顶，并清掉 `margin-top: auto`）

`apply(ctx)` 做六件事：

1. `<html>` 打开关属性 `data-dsh-reversed-chat`（停用即消失，布局零残留）；
2. 注入一张样式表，只用稳定锚点（`[data-content-phase]` / `[data-composer-seat]` / `[data-slot=…]` / `[data-chat-flow]`，不碰 CSS Module 哈希类名）；
3. 400ms 轮询给**每一个**最外层会话体滚动口打 `data-dsh-top-main` 标记 —— 主会话与右栏的侧边对话 / 队友面板各一份，转写里内联的嵌套预览不标；
4. 同一轮询按结构给库存「回到底部」槽打 `data-dsh-to-bottom-slot` 标记并隐藏（唯一子元素是纯图标 `<button>` 的浮动容器，且有 flow/composer/nav/tooltip 四道排除）——该槽在库存 DOM 里没有稳定属性、只有哈希类名，所以这里用结构识别而不是 `[class*=…]`；DOM 若变化，最坏结果是该按钮重新出现（纯装饰）；
5. 在主滚动口元素实例上遮蔽 `scrollTop` / `scrollTo`：宿主所有「跳到底部（最新）」的写入（打开会话、跟随流式输出）目标是 `metrics.floor`（最大滚动值），一律改写为跳到顶部（倒序后最新在 `scrollTop 0`）。其余程序化滚动（导航条跳转、锚点恢复）按几何原样放行；
6. 同一轮询维护导航条「当前回合」的几何补偿：在宿主的阅读线探测（`readVisibleTurn`）执行期间遮蔽 flow 行的 `getBoundingClientRect`，让倒序布局下探测落在阅读线所在回合（默认最新），详见 [changelog](changelog.md#060-修复导航条默认高亮最早回合)。

### 倒序为什么安全

- 转写**不是**虚拟化渲染（`@tanstack/react-virtual` 只用于右侧 turn 导航条）；flow 项是 `[data-slot="conversation.chat.flow"]` 的子元素，`flex-direction: column-reverse` 只翻转视觉顺序，DOM 顺序与宿主全部测量逻辑原样；
- 新回复在 DOM 末尾追加 → 视觉上出现在容器顶部（输入框下方）→ 视口钉在 `scrollTop 0` 即时可见，`overflow-anchor: none` 防止滚动锚定把阅读位置拖走；
- 「查看更早消息」按钮翻到最旧一端（底部），语义不变。

### 适配宿主 0.2.2-rc.3（0.7.3）

宿主在 `[data-conversation-content]`（相位体）与 `[data-conversation-scroll]`（滚动口）之间插了一层 `conversation.hero.frame` 槽位（brand-official 的 `PixelWhale` 渲染成 `display: contents` 的 `<div class=layer>` 包住滚动口）。0.7.2 的选择器全是 `[data-content-phase="active"] > [data-dsh-top-main] > [data-composer-seat]` 这种**直接子代**链，被这层包裹一挡就全部落空——插件"开着但输入框还在底部"。

三处改动：

1. **祖先链改成后代选择器**：`[data-content-phase="active"] [data-dsh-top-main]`。标记仍只打在最外层滚动口上，所以后代匹配不会误伤嵌入会话；`> [data-composer-seat]` 这一级保留直接子代，用来排除转写里嵌套会话的 seat。
2. **补 `margin-top: 0`**：宿主用 `margin-top: auto` 给滚动口留白，而 auto 外边距会把 flex 首项推到**末端**——`order: -1` 压不住，座位照样落到底部。
3. **右侧导航条按「输入框下方」重新居中**：宿主把导轨居中在「视口 − 输入框高度」这条带里（默认输入框在底部），输入框上移后这条带偏上半个输入框高度。插件改为在输入框下方的带里居中，并给导轨的 sticky 容器加 `top: var(--dsh-composer-height)`，避免滚动时最上几个点钻到输入框底下。

flow 槽位本身也变成了 `display: contents` 锚点（不再生成盒子）：插件对它强制 `display: flex` 的规则保留，`.column` 级的 `column-reverse` 也保留——锚点成盒时两级翻转复合为一次净翻转，锚点是 `display: contents` 时只由 `.column` 生效，两种宿主结构都成立。

### 只在对话视图挂输入框（0.7.4）

会话顶部的视图 tab（轨迹 / 上下文 / Git / 编队 / 统计 …）只替换 `conversation.view` 槽位里的内容，`[data-composer-seat]` 是**常驻**节点：它与会话同级渲染，不跟视图走。所以每个视图里都有座位——stock 让它贴底，存在感低；插件把它钉到顶部后，它就成了每个视图顶部一张用不上的卡片。

判据用宿主自己的标记，不猜视图身份：

```css
[data-content-phase="active"] [data-dsh-top-main]:not(:has([data-chat-flow])) > [data-composer-seat] { display: none !important }
```

- 对话视图一定挂载转写列 `.column[data-chat-flow]`，其余视图没有（`ChatView` 无条件渲染该列，与有无消息无关）；
- 不枚举视图 id：只有 `chat` 与 `trajectory` 的注册点能在宿主包里看到，其余由未导出的包或第三方插件注册，根节点没有稳定属性；
- 不看 tab 的 `aria-selected`：那要把「按钮文案 → 视图 id」的映射写死，宿主换文案就错。

代价：如果未来宿主把转写列的 `data-chat-flow` 挪走或延迟挂载，这条规则会连对话视图的输入框一起隐藏。0.2.2-rc.3 的 `ChatView.tsx:244` 是无条件渲染，故当前成立；届时的修法是换标记，而不是换回视图 id。

### 多个顶层会话体（0.7.5）

侧边对话（subagent）与智能体团队的队友面板，用的是同一套 `ConversationContent` 骨架（`conversation.content` 槽位、`variant: 'embedded'`），相位同样是 `active`；但它挂在应用 frame 层的 `[data-sidebar-right-session]` 面板里，和主会话的 `[data-conversation-content]` 是**兄弟**，不是嵌套。也就是说：页面上可以同时存在两个（甚至更多）顶层会话体。

所以「主滚动口」从来不是单数。0.7.4 及以前只标第一个顶层滚动口，右栏那份拿不到 `data-dsh-top-main`，插件对它就完全失效（座位贴底、正序）。

判据本身没变——「离它最近的 `[data-conversation-content]` 就是自己父层的那个」——变的是覆盖面：`markMainScroll()` 返回所有符合条件的滚动口，其余按滚动口分离的状态改成以元素为键的表：

| 状态 | 0.7.4 及以前 | 0.7.5 |
| --- | --- | --- |
| 回底改写（`scrollTop` / `scrollTo`） | 单个 `flipTarget` / `flipCleanup` | `flipCleanups: Map<scrollport, cleanup>` |
| 行影子的 MutationObserver | 单个 `rowObserver` | `flowWatches: Map<flow, MutationObserver>` |
| 菜单的 MutationObserver | 单个 `menuObserver` | `menuWatches: Map<overlay, MutationObserver>` |

两个细节：

- `markToBottomSlot()` 必须**先收集所有会话体的候选、再统一清 stale**。逐会话体清扫会把上一个刚打上的标记当成过期删掉（真机症状：主会话的回底按钮重新冒出来）。
- 固定弹层（权限预设、上下文计量等）只按横坐标就近挑**自己所属**的输入卡片几何，避免右栏的弹层被主会话的卡片坐标推走。

内联的嵌套预览仍然不标：「最近的 `[data-conversation-content]` 必须是自己的父层」这条判据没有放松，所以转写里嵌的第二个滚动口（自带 `data-conversation-scroll` + 座位）保持原样，也拿不到回底改写。

### 模型选择菜单的方向（0.7.5）

`+` 和 `/` 的补全菜单走 `[data-composer-overlay]` 这个零高度锚点，插件把锚点挪到卡片下沿就能整体下翻。模型 / 推理等级菜单**不是这一套**：它是 portal 到 body 的 `position: fixed` 弹层，用 **CSS 锚点定位**自己算位置（`dsh-client-ui-model-selection` / `ModelSelect.module.css`）：

```css
.menu { position: fixed; position-anchor: var(--dsh-model-anchor);
        right: anchor(right); bottom: calc(anchor(top) + 8px) }
```

下边缘钉在触发按钮的上边缘——stock 输入框在底部，向上弹正好不挡内容；输入框置顶后，那块空间是 tab 条。修法是把同一个锚点的**另一条边**拿来做上边缘，方向就反过来，偏移仍由锚点实时计算：

```css
html[data-dsh-reversed-chat] [style*="--dsh-model-anchor"]:not(button) {
  top: calc(anchor(bottom) + 8px) !important; bottom: auto !important;
  align-self: safe start !important;
  max-height: min(360px, calc(100dvh - anchor(bottom) - 24px)) !important }
```

两个选择上的理由：

- 判据用那条内联自定义属性 `--dsh-model-anchor`（按钮和菜单都会写），因为 portal 既没有祖先链可挂、也没有稳定属性，只有哈希类名；`:not(button)` 把触发按钮排除掉。因为 portal 在 body 上，规则只带 `html[data-dsh-reversed-chat]` 前缀，不要求 `[data-content-phase]`。
- `max-height` 用 `anchor(bottom)` 算出「从按钮下沿到窗口底部还剩多少」，窗口矮时菜单自己收短；写死 `100vh - 300px` 那套在置顶布局里不成立。

不改成「像 `+` 菜单那样用一个绝对定位容器」是因为那是宿主的实现细节：宿主随时可能把模型菜单也换成 portal，跟着它的锚点走比复制它的布局更稳。
### 导航条倒序为什么安全（0.3，0.5.1 修正镜像方式）

导航条是 TanStack 虚拟化的点列表（`transform` 定位），不能动它的滚动数学，所以在 `nav.frame` 级做整帧**镜像**：`transform: translateY(-50%) scaleY(-1)` —— 库存的 `translateY(-50%)`（居中）留在镜像**外层**，帧的位置分毫不动；点、悬停浮泡随帧一起镜像。稳定锚点：`nav:has(button[data-index])`、`[role="tooltip"]`，零哈希类名。

**两个坑（0.5.1 修复）**：CSS `scale` 属性是独立变换，组合在 `transform` **之后**，所以

- 用 `scale: 1 -1` 直接镜像帧时，帧自己的 `translateY(-50%)` 也被翻转 → 整帧下沉自身高度（最多 420px，半截出屏）；
- 再对每个点 `button[data-index] { scale: 1 -1 }` 时，点的定位就是它自己的行内 `transform: translate3d(0, start, 0)`，被翻转后每个点落到槽位的镜像一侧（滚动口的 `overflow` 裁剪之外）→ 12 个回合的画面里只剩 1 个点可见。

现在的做法：帧用 `transform: translateY(-50%) scaleY(-1)` 镜像；点**不做**反向翻转（点的字形是 20×2 的水平条 `.mark::before`，上下对称，本来不需要翻正）；只有浮泡里的文字子元素反向翻转保持可读（两行上下次序对调，纯装饰取舍）。

**镜像与居中的交互（0.7.3 补充）**：镜像绕帧自身中心翻转，会把库存的 `translateY(-50%)` 抵消掉——帧的**视觉中心落在自己的 `top` 值上**。所以 `top` 直接给「输入框下方这条带的一半高度」即居中；同时给 sticky 容器加 `top: var(--dsh-composer-height)`，让导轨永远从输入框下沿开始。

### 输入框置顶的视觉细节（0.7.1）

置顶后卡片若直接贴着 tab 栏下沿，会同时有两个观感问题：**太挤**，以及卡片自带的柔和阴影（`--dsw-elevation-soft`）被滚动口在顶部裁掉，看起来像“贴边”。0.7.1 的处理：

- **顶部留白 12px**：sticky 座位加 `padding-top`，卡片浮在横线下方，阴影有呼吸空间；留白区用页面底色（`--dsw-alias-bg-base`）铺满，转写内容不会从缝里透出来；
- **底部渐隐 20px**：座位底部内边距 + 背景渐变到透明，向下滚动的内容在卡片下沿柔和淡出，而不是硬切；不滚动时该区域就是页面底色，无副作用；
- 三个尺寸都是 CSS 变量，可直接覆盖微调：`--dsh-reversed-chat-top-gap`（默认 12px）、`--dsh-reversed-chat-bottom-gap`（8px）、`--dsh-reversed-chat-fade`（20px）。

只在 `active` 相生效；`hero`（新对话居中）与 `settling`（切换过渡）保持库存行为。

## 已知取舍（倒序与宿主 JS 假设的偏差）

- 宿主 `readVisibleTurn()` 的二分查找假设「DOM 靠后 = 视觉靠下」：turn 高亮已在 0.6 用「探测期几何补偿」修正（依赖宿主函数名 `readVisibleTurn`；若未来宿主改名/内联导致栈帧缺失，补偿静默失效，回退为 0.5 的「恒最早回合」表现，不会崩溃）。阅读位置捕获/恢复仍按原假设工作，加载更早消息后落点可能轻微偏移。纯体验损耗，不影响功能。
- 库存「回到底部」按钮的可见性/方向逻辑失效，已按结构打标隐藏（`data-dsh-to-bottom-slot`，不依赖哈希类名）；回到最新 = 滚回顶部。若库存 DOM 结构调整导致识别失效，唯一后果是该按钮重新出现（纯装饰）。
- 展开折叠历史后的滚动位置还原不精确（同第一条）。
- 正在运行的「思考中」分隔线的 `nth-last-child` 判定按 DOM 序，反转后出现位置可能不符设计（纯装饰）。
- 导航条：滚动口两端的淡出渐变方向可能对调（纯装饰）；在导航条内滚轮的「向下 = 更旧」手感与视觉移动方向相反（条短时无感）；悬停预览的两行文字（提问/回复）上下次序对调。
- 与 `dsh-layout-control` 的「停靠四角」功能重叠会打架：二选一，或其输入栏保持「完整」。
