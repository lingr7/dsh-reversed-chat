# dsh-reversed-chat

> DSH Web 客户端插件：**输入框置顶 + 对话倒序阅读**——最新回复紧贴输入框出现，时间线自下而上。

![真机效果演示：输入框置顶 + 消息级倒序](https://raw.githubusercontent.com/lingr7/dsh-reversed-chat/main/assets/demo.gif)

**阅读方向是倒序的（时间线自下而上）**：输入框固定在顶部，紧贴它的是**模型的最新回复**；往下依次是**你刚才的提问**、上一轮回复、更早的提问……越往下越早，正好与默认「最新在底部」的聊天相反。

- **输入框**：活跃会话固定在视口顶部（新对话保持居中）；
- **转写内容**：消息级倒序——最新一条紧贴输入框，历史往下排，从下往上读就是正常时间顺序；
- **右侧回合导航条**：最新回合在最上方，实心长条跟随阅读位置。

## 安装

**从 npm 安装（推荐）**

```bat
dsh plugin --profile desktop add "dsh-reversed-chat"
```

**从 GitHub 安装**

```bat
dsh plugin --profile desktop add "github:lingr7/dsh-reversed-chat"
```

**本地开发（link 安装）** —— 先完全退出 DSH：

```bat
dsh plugin --profile desktop add "link:<plugin-dir>"
```

## 启用与验收

安装后在「插件管理」里启用 `dsh-reversed-chat`，然后 **Ctrl+F5**。验收点：

1. 新建对话：输入框居中；
2. 发送消息：输入框固定在顶部，回复内容出现在顶部（紧贴输入框），旧内容被推向下方；
3. 向下滚动读历史（越往下越旧），「查看更早消息」在底部；
4. 切走再切回会话：落点在顶部（最新）；
5. 右侧回合导航条：最新回合的点在最上，点击跳转 / 悬停预览照常；
6. 右栏、子代理的嵌入会话不受影响。

## 文档

- [实现原理与已知取舍](https://github.com/lingr7/dsh-reversed-chat/blob/main/docs/design.md)
- [版本历史与修复记录](https://github.com/lingr7/dsh-reversed-chat/blob/main/docs/changelog.md)
- [文件结构与打包](https://github.com/lingr7/dsh-reversed-chat/blob/main/docs/packaging.md)

## 链接

- GitHub：<https://github.com/lingr7/dsh-reversed-chat>
- npm：<https://www.npmjs.com/package/dsh-reversed-chat>
- 许可：MIT
