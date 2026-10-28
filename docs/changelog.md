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
