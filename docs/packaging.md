# 文件结构与打包

> 返回 [README](../README.md)

## 文件

```
package.json       dsh.client 声明（platform web, inject []）+ dsh.bundle.patch 声明
                   + locale / icon 的 exports（管理器显示元数据）
cordis.patch.yml   - insert: 一条 Loader 条目 → 管理器列表/开关的数据源（唯一插入处）
locale/en.json     英文显示元数据：meta.title / meta.description
locale/zh.json     中文显示元数据
icon.svg           插件图标（exports["./icon"]，≤256 KiB）
lib/index.js       宿主半边占位（空 apply，供 Loader 条目挂载）
lib/client.js      浏览器半边：window.__ModuleLoader__.load({ id, factory })，导出 { inject, apply }
```

## 为什么需要 cordis.patch.yml（插件管理器可见性）

插件管理器的列表读的是 **Loader（cordis 加载树）条目**（`dsh-host-plugin-inventory` 的 `readPluginInventory()` 遍历 `ctx.loader.entries()`），而 `dsh.client` 声明只驱动**客户端扫描器**加载 `lib/client.js` —— 两条通道互不相干。没有 `- insert` 行 = 功能生效但管理器里没有名字和开关。`dsh.bundle.patch` 声明让 `dsh plugin add` 在安装时自动应用该补丁。

**insert 只能存在一处。** bundle 通道下（`dsh.profile.bundles` 含本包）这一行由插件自带的 `cordis.patch.yml` 提供；profile 的 `cordis.patch.yml` 只允许写 id 覆盖行（例如默认关的 `disabled: true`）。若 profile 再镜像一条同样的 `insert`，合成结果会出现**两行同 id**：管理器的 `listPlugins()` 找不到“唯一”补丁行，该行变成只读（界面提示「当前 profile 的 patch 无法唯一定位这一项」），开关失效；同时 Loader 按 id 后写覆盖，默认开关状态还会随两行先后顺序翻转（disable 行在 insert 之前就会变成默认开启）。`dsh-better-sidebar` 的 bundle patch 注释里也警告过 manual mount line 必须删除。

## Bundle patch 纪律与默认关（0.4 / 0.4.1 / 0.5）

**宿主硬性要求**：「bundle patch 含配置/表达式, 热挂载仅支持纯 insert; 重启后由 bundle 层生效」。因此：

- 插件自带的 `cordis.patch.yml` 永远是**纯 insert**（只有 `id` + `name`，无配置字段、无 `!!js` 表达式）→ `dsh plugin add` 可以热挂载，安装即时生效（启用状态下）；这也是该行**唯一**的插入处；
- **默认状态不属于 bundle patch**：本机「默认关」由 profile 补丁层的 id 覆盖行承载（`- id: dsh-reversed-chat` + `disabled: true`，与 better-sidebar 禁用行同形态）。客户端扫描器跳过被禁用的 Loader 条目（`processOne()` 的 `entry.disabled` 检查），`lib/client.js` 不装配，布局零改动；
- **profile 层只写覆盖行，绝不重复 insert**（0.5 修正）：此前 profile 里镜像了一条 insert，合成出两行同 id，管理器把该行标为 `unaddressable`（「当前 profile 的 patch 无法唯一定位这一项」）而无法开关；
- 管理器开关 = `setPluginEnabled` → `writePluginEnabled` 增删/改写 profile 层的 id 覆盖行并热重载 Loader 条目（`composeEntries` 统一合成有效状态）→ **Ctrl+F5** 后客户端装配清单随之变化；
- 首次开关操作后，状态完全由管理器接管：第一次启用会删掉覆盖行（bundle 层本身就是 enabled），之后再停用会重新追加 `- id: dsh-reversed-chat` + `disabled: true`。

## 显示元数据与打包（0.5）

- 管理器 / bundle 详情里的标题与说明来自 `locale/<lang>.json` 的 `meta.title` / `meta.description`（本包提供 `locale/en.json`、`locale/zh.json`，经 `exports["./locale/*.json"]` 暴露）；
- 图标来自 `exports["./icon"]` → `icon.svg`（宿主支持 SVG/PNG/JPEG/WebP，≤256 KiB，`data:` 内联后交给界面）；
- `package.json` 的 `files` 必须同时包含 `lib`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`：**漏掉 `cordis.patch.yml` 时打包产物会缺 bundle patch**，`dsh plugin add` 直接失败（本地 `link:` 安装不受影响）；
- 这些元数据只用稳定的 `dsh`/`exports` 约定，不读运行时状态，因此管理器不激活插件也能显示。

## 参考

- `dsh-layout-control`（思路来源：overlay + 稳定锚点 + 属性开关）：`%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-layout-control`，[GitHub](https://github.com/LzqSuShi/dsh-layout-control)
- `dsh-better-sidebar`（client 插件写法范本）：[GitHub](https://github.com/omdsh-dev/DSH-better-sidebar)
- 宿主侧代码：asar 内 `dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`（`ChatView`、`ScrollFollow`、flow slot 注册）与 `dsh-client-ui-conversation/lib/client.js`（`ConversationContent`、`conversationPhase()`）
