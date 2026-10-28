# 实现原理与已知取舍

> 返回 [README](../README.md)

## 原理

宿主用相属性控制输入框位置（`@deepseek-ai/dsh-client-ui-conversation` / `ConversationRoot.module.css`）：

- `hero` → `justify-content: center` → 居中（不碰）
- `active` → `[data-composer-seat] { position: sticky; bottom: 0 }` → 贴底（覆盖为贴顶）

`apply(ctx)` 做六件事：

1. `<html>` 打开关属性 `data-dsh-reversed-chat`（停用即消失，布局零残留）；
2. 注入一张样式表，只用稳定锚点（`[data-content-phase]` / `[data-composer-seat]` / `[data-slot=…]` / `[data-chat-flow]`，不碰 CSS Module 哈希类名）；
3. 400ms 轮询给「最外层会话」滚动口打 `data-dsh-top-main` 标记 —— 子代理面板、右栏会话等嵌入对话永不误伤；
4. 同一轮询按结构给库存「回到底部」槽打 `data-dsh-to-bottom-slot` 标记并隐藏（唯一子元素是纯图标 `<button>` 的浮动容器，且有 flow/composer/nav/tooltip 四道排除）——该槽在库存 DOM 里没有稳定属性、只有哈希类名，所以这里用结构识别而不是 `[class*=…]`；DOM 若变化，最坏结果是该按钮重新出现（纯装饰）；
5. 在主滚动口元素实例上遮蔽 `scrollTop` / `scrollTo`：宿主所有「跳到底部（最新）」的写入（打开会话、跟随流式输出）目标是 `metrics.floor`（最大滚动值），一律改写为跳到顶部（倒序后最新在 `scrollTop 0`）。其余程序化滚动（导航条跳转、锚点恢复）按几何原样放行；
6. 同一轮询维护导航条「当前回合」的几何补偿：在宿主的阅读线探测（`readVisibleTurn`）执行期间遮蔽 flow 行的 `getBoundingClientRect`，让倒序布局下探测落在阅读线所在回合（默认最新），详见 [changelog](changelog.md#060-修复导航条默认高亮最早回合)。

### 倒序为什么安全

- 转写**不是**虚拟化渲染（`@tanstack/react-virtual` 只用于右侧 turn 导航条）；flow 项就是 `[data-slot="conversation.chat.flow"]` 的直接子元素，`flex-direction: column-reverse` 只翻转视觉顺序，DOM 顺序与宿主全部测量逻辑原样；
- 新回复在 DOM 末尾追加 → 视觉上出现在容器顶部（输入框下方）→ 视口钉在 `scrollTop 0` 即时可见，`overflow-anchor: none` 防止滚动锚定把阅读位置拖走；
- 「查看更早消息」按钮翻到最旧一端（底部），语义不变。

### 导航条倒序为什么安全（0.3，0.5.1 修正镜像方式）

导航条是 TanStack 虚拟化的点列表（`transform` 定位），不能动它的滚动数学，所以在 `nav.frame` 级做整帧**镜像**：`transform: translateY(-50%) scaleY(-1)` —— 库存的 `translateY(-50%)`（居中）留在镜像**外层**，帧的位置分毫不动；点、悬停浮泡随帧一起镜像。稳定锚点：`nav:has(button[data-index])`、`[role="tooltip"]`，零哈希类名。

**两个坑（0.5.1 修复）**：CSS `scale` 属性是独立变换，组合在 `transform` **之后**，所以

- 用 `scale: 1 -1` 直接镜像帧时，帧自己的 `translateY(-50%)` 也被翻转 → 整帧下沉自身高度（最多 420px，半截出屏）；
- 再对每个点 `button[data-index] { scale: 1 -1 }` 时，点的定位就是它自己的行内 `transform: translate3d(0, start, 0)`，被翻转后每个点落到槽位的镜像一侧（滚动口的 `overflow` 裁剪之外）→ 12 个回合的画面里只剩 1 个点可见。

现在的做法：帧用 `transform: translateY(-50%) scaleY(-1)` 镜像；点**不做**反向翻转（点的字形是 20×2 的水平条 `.mark::before`，上下对称，本来不需要翻正）；只有浮泡里的文字子元素反向翻转保持可读（两行上下次序对调，纯装饰取舍）。

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
