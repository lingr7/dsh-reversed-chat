# 版本历史与修复记录

> 返回 [README](../README.md)

## 版本一览

| 版本 | 要点 |
| --- | --- |
| 0.1 | 输入框在活跃会话置顶 |
| 0.2 | 对话栏倒序阅读（最新一轮在最上方） |
| 0.3 | 右侧回合导航条倒序 |
| 0.4 / 0.4.1 | 管理器开关、bundle patch 纪律 |
| 0.5 | profile 层只写覆盖行（修复 patch 双行导致无法开关） |
| 0.5.1 | 修复导航条只剩 1 个点（镜像方式） |
| 0.6.0 | 修复导航条默认高亮最早回合（阅读线探测补偿） |
| 0.7.0 | 更名 `dsh-composer-top` → `dsh-reversed-chat` |
| 0.7.1 | 输入框置顶的顶部留白 / 底部渐隐 |
| 0.7.2 | 输入框置顶后，+ / 命令菜单与各类固定弹层改为向下弹 |
| 0.7.3 | 适配宿主 0.2.2-rc.3：hero 包裹层导致选择器失效（输入框仍在底部） |
| 0.7.4 | 非对话视图（轨迹 / 上下文 / Git …）不再显示输入框 |
| 0.7.5 | 侧边对话 / 智能体团队面板各自置顶 + 倒序；模型选择菜单改为向下弹 |

## 0.7.0 更名

原名 `dsh-composer-top`。旧名只写了「输入框置顶」，新名字覆盖插件做的两件事——「对话栏倒序阅读」+「输入框置顶」。内部包名 / Loader id / 开关属性（`data-dsh-reversed-chat`）同步更名，功能不变。

## 0.5.1 修复：导航条只剩一个跳转点

**现象**：会话有多个回合，右侧导航条却只显示 1 个点；回合越多越明显。

**根因**（0.3 引入）：`scale: 1 -1` 是独立变换属性，按规范组合在 `transform` 之后。

1. 帧（`nav.frame`）自己的 `transform: translateY(-50%)` 被翻转 → 帧下沉自身高度；
2. 每个点（`button[data-index]`）的定位就是它自己的行内 `transform: translate3d(0, start, 0)`，被 `scale: 1 -1` 翻转后点落到槽位的镜像一侧，超出滚动口（`.scroller` 的 `overflow-y: auto`）的裁剪范围；结果只有最靠近裁剪边界的那 1 个点可见。DOM 里点一个不少——TanStack 的 `count`/`getVirtualItems` 完全正常，丢的是**渲染位置**。

**修法**：镜像折进帧自己的 `transform`（`translateY(-50%) scaleY(-1)`，居中项留在镜像外层）；点**不再**反向翻转（字形是水平条，对称）；浮泡文字子元素保留反向翻转。只改 2 条 CSS / 1 条 transform，不动虚拟化、不碰点击与滚动数学。

**验证**（Chromium + 真机同款客户端模块，非模拟）：12 回合会话 12 个点全部可见、最新（turn 12）在最上；2 / 6 回合同理；1 回合会话仍不显示导航条（库存 `items.length < 2` 逻辑）；悬停浮泡中心与点位对齐；点击第 7 个点落到 turn 7 与 turn 6 的视觉分界（上方 turn 7、下方 turn 6，符合倒序阅读）。

## 0.6.0 修复：导航条默认高亮最早回合

**现象**：会话有多个回合时，右侧导航条的「当前回合」实心长条（`.markActive`）总是落在**最早**一回合（画面最下方那个点）；倒序阅读下视线所在的是最新回合（最上方），预期应是最新回合实心。

**根因**（宿主 `@deepseek-ai/dsh-client-ui-chat` 的 `readVisibleTurn()`）：宿主用二分查找求「阅读线所在回合」，前提是 **DOM 顺序 = 视觉上下顺序**（`row.getBoundingClientRect().top` 随 DOM 索引单调递增）。`flex-direction: column-reverse` 只翻转视觉顺序、DOM 仍旧→新，于是：

- 行的 `top` 随 DOM 索引**递减**，二分判据方向相反；
- 查找只会往左收，永远够不到 DOM 末尾的最新行，`reading` 保持初值 `turns[0]` —— **最早回合**；
- `activeTurn` 恒为最早回合 → 轨道实心高亮、自动居中跟随（`scrollToIndex(activeIndex)`）、`aria-current` 一起错。

**修法**（不改宿主、不动 DOM 顺序）：只在宿主探测调用期间补偿几何。插件在 flow 行元素实例上遮蔽 `getBoundingClientRect`，用调用栈识别当前是否为 `readVisibleTurn` 在问（栈帧含 `readVisibleTurn`），是则：

- 按宿主同一公式算阅读线：`scrollport.top + min(96, clientHeight * 0.2)`；
- 在真实几何里找阅读线所在行：倒序下 = 行 `top` 不大于阅读线的行里 `top` 最大者；若没有（阅读线在转写之上）取最上面的行；
- 该行及之前的行返回 `top = line - 1`、之后的返回 `top = line + 2` —— 二分查看到单调递增的假顺序，精确落回该行；
- 非探测调用（锚点捕获/恢复、导航条点击跳转、`align()`）一律拿到**原样 rect**，几何跳转分毫不动。

行元素增删由 `MutationObserver` 即时补挂；切换会话时随主滚动口重挂；插件停用时全部还原（删除实例属性，原型行为恢复）。

**验证**：6 回合会话默认最新回合为实心长条、位于导航条最上；向下滚动读史时长条跟随阅读线；点击跳转、悬停预览、导航条居中跟随照常；`aria-current` 同步正确。

## 0.7.2 修复：输入框置顶后 + / 命令弹窗跑到屏幕外

**现象**：插件启用后，点输入框旁的「+」或输入「/」时，候选菜单仍按“向上弹”渲染；输入框在顶部，菜单整个跑到视口上方看不见。

**根因**（宿主 `ui-input-trigger` / `ui-commands`）：菜单是 `position: absolute; bottom: calc(100% + 4px)`，挂在输入卡片顶部一个 0 高度的 `[data-composer-overlay]` 锚点上；`max-height` 也由 `useAnchoredMaxHeight()` 按“菜单上方的可用空间”计算。输入框贴底时向上弹是对的，贴顶后就出界。

**修法**：

- 活跃会话下把该 overlay 锚点移到卡片底部（CSS），菜单改为 `top: calc(100% + 4px)` 向下展开；
- 菜单打开的瞬间（`MutationObserver` 监听 overlay），按卡片真实几何重新定位：距卡片底部 4px、宽度对齐卡片、`max-height` 按视口剩余空间重算（触发菜单上限 400、popup 选择器上限 320），并用 `!important` 压过宿主内联高度；400ms 轮询再校正一次；
- 覆盖两类菜单：`+` / `/` 的候选菜单（`[data-trigger-menu]`）与 `/model`、`/permission` 等选择器（后者没有稳定属性，用“绝对定位 + 底部锚定”的计算样式识别）。

**验证**：启用后点「+」或输入「/」——菜单出现在输入卡片下方、完整可见、内部可滚动；`/model`、`/permission` 等选择器同理；hero 相（新对话）保持库存的向上弹行为。

### 固定定位弹层（0.7.2 补）

**现象**：点「⚠ 完全权限」下拉、上下文占用环、状态栏「N 轮 · tok/s」「缓存命中」时，弹层仍向上弹，盖住顶部标签/标题栏。

**根因**：这些是宿主 primitives 的「固定定位 + JS 坐标」组件——权限下拉 `Menu`（`side:"top"`、portal 到 `body`）、上下文环 `useAnchoredPosition({side:"top"})` 面板、状态栏统计 `role="dialog"` 弹层；坐标由 JS 写进内联 `style.top`，CSS 改不了方向。

**修法**：

- 弹层出现时（120ms 轮询 + `body` 变更监听）扫描「`position: fixed`、带内联 `top`、水平落在输入卡片范围内、位于组合器区域内」的弹层；
- **首次出现时锁定锚点**：优先找它正下方刚展开的触发按钮（`aria-expanded=true`），放到该按钮下方 8px；找不到则退回「卡片下方 8px」/「组合器下方 8px」，避免二次下移；
- 排除真模态（`aria-modal`）、toast、tooltip；`max-height` 按视口剩余空间限制；翻转过的元素打 `data-dsh-flipped-popover` 标记；
- **坑**：菜单背景在 `MenuSurface` 的内层 `.material`（portal 的 `.backing`）里，检测时必须跳过这两层，否则材质层被重新定位、高度归零 → 菜单背景变透明。

**验证**：重载后依次点「+」「/」「⚠ 完全权限」「上下文环」「状态栏统计项」——均向下展开，且不遮挡触发按钮。

## 0.7.3 修复：宿主 0.2.2-rc.3 下输入框仍钉在底部

**现象**：插件在插件管理里是启用状态，`<html>` 上的 `data-dsh-reversed-chat` 也在，但活跃会话的输入框依旧贴在底部，转写也没倒序——像是插件根本没生效。

**根因**（宿主 `@deepseek-ai/dsh-client-ui-conversation` 的 `ConversationContent` + brand-official 的 `PixelWhale`）：0.2.2-rc.3 把滚动口包进了 `conversation.hero.frame` 槽位，`PixelWhale` 渲染成 `<div class=layer style="display: contents">`：

```text
root[data-phase] > body[data-content-phase][data-conversation-content]
  > div.layer (display: contents)          ← 新增包裹层
    > div[data-conversation-scroll] > … + [data-composer-seat]
```

0.7.2 的规则全写成 `[data-content-phase="active"] > [data-dsh-top-main] > [data-composer-seat]` 这种**直接子代**链，被这层包裹一挡就整张表落空。JS 侧照旧工作（`data-dsh-top-main` 仍然打在滚动口上），所以是"开着、开关属性在、就是没效果"。

第二处：新宿主给座位补了 `margin-top: auto`（用 auto 外边距吃掉滚动口的剩余空间）。auto 外边距把 flex 首项推到**末端**，`order: -1` 压不住——选择器修好之后座位仍会落回底部。

**修法**：

- 祖先链改后代选择器：`[data-content-phase="active"] [data-dsh-top-main]`，对任意数量的布局无关包裹层成立；`> [data-composer-seat]` 这一级保留直接子代，继续排除转写里嵌套会话的座位；
- 座位补 `margin-top: 0`，保持 `position: sticky; top: 0; bottom: auto`；
- 弹层链路（overlay 锚点下移 + fixed 弹层重定位）同样改成后代选择器；
- flow 槽位变成 `display: contents` 锚点后不再生成盒子：`.column` 级的 `column-reverse` 继续生效，插件对锚点强制 `display: flex` 的规则保留——两种宿主结构（锚点成盒 / 锚点 `display: contents`）都成立；
- 右侧导航条重新按"输入框下方"居中：镜像绕帧中心翻转会抵消库存的 `translateY(-50%)`（视觉中心落在自己的 `top` 上），故 `top` 直接取「视口 − 输入框高度」的一半；并给导轨的 sticky 容器加 `top: var(--dsh-composer-height)`，滚动时最上面的点不再钻到输入框底下。

**验证**：从 `app.asar` 提取真实宿主样式模块（`ConversationRoot` / `InputBar` / `ChatView` / `TurnNavigator` / `PixelWhale`，解开 `:global(...)`、类名按模块加前缀还原隔离），配上真实 `lib/client.js`，在无头 Chromium 里搭了一份 0.2.2-rc.3 结构的复刻页，17 项断言全部通过：座位贴顶且滚动后仍贴顶、最新行在最上方且倒序单调、`scrollTop = floor` 落到 0、回底按钮被打标隐藏、`+` 菜单在卡片下方展开、导轨镜像且居中于输入框下方。另在运行中的桌面版 0.2.2-rc.3 窗口里复核：输入框贴顶、会话倒序（最新在最上）、状态行随卡片一起下移。

## 0.7.4 修复：非对话视图也显示输入框

**现象**：会话顶部的视图 tab（轨迹 / 上下文 / Git / 编队 / 统计 …）切到任意一个，输入框仍旧跟着出现。插件把它钉在最上方，于是这些视图的阅读区顶部被一张用不上的输入卡片占住——比 stock 的贴底状态更碍事。

**根因**（宿主 `@deepseek-ai/dsh-client-ui-conversation` 的 `ConversationContent` / `DefaultConversationViews`）：切换视图只替换 `conversation.view` 槽位里的内容，`[data-composer-seat]` 是与会话同级的常驻节点；它跟着会话渲染，不跟视图走，所以在每个视图里都还在。0.7.3 的规则只对 `data-content-phase="active"` 生效，恰好把这些视图里"原本贴底、不易察觉"的座位钉到了最上面。

**修法**：不猜视图 id，改用宿主自己的标记判断"当前是不是对话视图"——对话视图一定挂载转写列 `.column[data-chat-flow]`（有无消息都渲染），其余视图没有：

```css
[data-content-phase="active"] [data-dsh-top-main]:not(:has([data-chat-flow])) > [data-composer-seat] {
  display: none !important;
}
```

- 只隐藏座位本身，不动 overlay 锚点与固定弹层的既有逻辑；
- 不枚举视图 id：上下文 / Git / 编队 / 统计 由未导出的包或第三方插件注册，它们的根节点没有稳定属性；
- 也不看 tab 的 `aria-selected`：那需要把"哪个按钮对应哪个 id"的映射写死，宿主换标签文案就会错。

**验证**：复刻页新增一份非对话视图（`data-conversation-composer-overlay` 视图根 + 60 行内容 + 常驻座位），7 项断言通过——插件标记与主滚动口标记都在、页面没有转写列、座位 `display: none` 且高度 0、滚动后仍隐藏、`scrollTop = floor` 仍落到 0；剥掉这条规则做负向对照，座位复原成 `display: flex`、高度 80。三个既有 chat 复刻页（默认 / 锚点成盒 / 包裹层成盒）各 17 项断言保持全绿——对话视图的输入框照旧贴顶。

## 0.7.5 修复：侧边对话 / 智能体团队面板没有置顶与倒序

**现象**：开启侧边对话或智能体团队后，队友（subagent）的会话面板里输入框仍贴在底部、消息仍是正序——插件在主会话里明明已经生效。

**根因**（宿主 `@deepseek-ai/dsh-client-ui-subagent` 的 `sidebar-chat` + `dsh-client-ui-conversation` 的 `ConversationContent`）：侧边对话不是主会话的嵌套预览，而是**第二个顶层会话体**。它用同一个 `ConversationContent` 骨架再渲染一遍（`conversation.content` 槽位，variant 为 `embedded`），phase 同样是 `active`；面板容器 `[data-sidebar-right-session]` 挂在应用 frame 层，和主会话的 `[data-conversation-content]` 是兄弟关系。

插件原先只标**第一个**顶层滚动口（`if (topLevel && !marked) break` 之类的一次性标记），于是右栏那个滚动口永远拿不到 `data-dsh-top-main`：置顶、倒序、回底改写、读行探测、弹层翻转全都作用不到它。

**修法**：把"单个主滚动口"整体改成"每个顶层会话体各一份"：

- `markMainScroll()` 返回所有顶层滚动口；判据仍是"离它最近的 `[data-conversation-content]` 就是自己父层的那个"，所以转写里内联的嵌套预览依旧不会被标记；
- 其余按滚动口分离的运行时状态全部改成按元素索引的表：行影子的 `flowWatches`、菜单的 `menuWatches`、回底改写的 `flipCleanups`；
- `markToBottomSlot()` 先收集所有会话体的候选再统一清 stale——否则第二个会话体的清扫会把第一个刚打上的标记当成过期删掉（真机上表现为主会话的回底按钮重新冒出来）；
- 固定弹层（权限预设、上下文计量等）按候选弹层横坐标就近挑**自己所属**的输入卡片几何，避免右栏的弹层被主会话的卡片坐标推走。

**验证**：复刻页新增左右两个独立会话体（12 行 / 9 行），逐面板断言两侧都成立——被打标、装了回底改写、`scrollTop = 0`、座位贴各自滚动口顶部且在最新行之上、最新行在最上、完全倒序、滚动后仍贴顶、`scrollTop = floor` 落到 0、回底按钮隐藏、菜单开在自己卡片下方、导轨镜像且居中在自己输入框下方。1300×900 下 30/30 通过（该宽度两栏都触发宿主的 `@container (max-width: 900px)` 隐藏导轨，断言走"隐藏"分支），2400×1000 下 34/34 通过（两栏导轨各自 `matrix(1, 0, 0, -1, 0, -120)` 且各自居中）。另加一份"转写里嵌一个内联预览"的变体：只标 1 个滚动口、嵌套体不带标记也不装改写，20/20 通过。既有 5 份复刻页（默认 / 锚点成盒 / 包裹层成盒 / 非对话视图 / 独立双会话）全部保持全绿。

### 模型 / 推理等级菜单仍然向上弹（0.7.5）

**现象**：输入框置顶后，`+` 和 `/` 的补全菜单已经改成向下弹，但右下角的「模型 / 推理等级」菜单照旧向上弹——盖住顶部的 tab 条。

**根因**：它不是一个绝对定位的普通弹层，而是 **CSS 锚点定位**的 body portal（`dsh-client-ui-model-selection` / `ModelSelect.module.css`）：

```css
.menu { position: fixed; position-anchor: var(--dsh-model-anchor);
        right: anchor(right); bottom: calc(anchor(top) + 8px) }
```

`bottom: anchor(top) + 8px` 把菜单的**下边缘**钉在触发按钮的上边缘——因为 stock 的输入框在底部，向上弹才不挡内容。插件把输入框搬到顶部后，这块空间就成了 tab 条。

**修法**：把下边缘改成上边缘，方向反过来，位置仍由锚点算，不写死偏移：

```css
html[data-dsh-reversed-chat] [style*="--dsh-model-anchor"]:not(button) {
  top: calc(anchor(bottom) + 8px) !important;
  bottom: auto !important;
  align-self: safe start !important;
  max-height: min(360px, calc(100dvh - anchor(bottom) - 24px)) !important;
}
```

- portal 挂在 body 上（不在滚动口里），所以这条规则只带 `html[data-dsh-reversed-chat]` 前缀，不要求祖先链；
- 它没有稳定属性、只有哈希类名；判据是按钮与菜单都会写的那条内联自定义属性 `--dsh-model-anchor`，再加 `:not(button)` 排除触发按钮本身；
- `max-height` 用 `anchor(bottom)` 算出"从按钮下沿到窗口底部还剩多少"，窄屏或窗口很矮时菜单自己收短。

**验证**：新增复刻页照抄 stock 的锚点声明（`position-anchor` / `right: anchor(right)` / `bottom: calc(anchor(top) + 8px)` + 同一组 `max-height` 等），7 项断言通过——菜单在按钮下方、在卡片下方、右边缘对齐按钮、不溢出视口；剥掉这条规则做负向对照，菜单回到按钮上方（`menu.top=12`，正好复现截图里的位置）。
