# AI 狼人杀

一个浏览器端运行的 12 人标准局狼人杀文字游戏，支持预言家、女巫、猎人、守卫、狼人和平民等身份。玩家抽取自己的身份后，与 AI 玩家一起完成夜晚行动、白天发言、投票放逐和胜负结算。

## 功能特点

- 12 人标准局：预言家、女巫、猎人、守卫、狼人、平民。
- 完整昼夜流程：夜晚行动、警长竞选、公开发言、投票、PK、遗言与结算。
- AI 玩家逻辑：内置 fallback AI，可在没有远程模型时离线运行。
- 可选大模型接入：通过 `server.js` 代理调用火山方舟 Ark / DeepSeek 模型，避免前端暴露 API Key。
- 静态发布友好：可打包为 itch.io HTML5 游戏。

## 本地运行

直接打开 `index.html` 可以运行静态版本，游戏会使用内置 AI 逻辑。

如需启用远程 AI，请先创建 `.env.local`：

```ini
ARK_API_KEY=你的火山方舟 API Key
ARK_ENDPOINT_ID=ep-20260522175712-qq28w
ARK_MODEL_NAME=deepseek-v3-2-251201
PORT=8787
```

然后启动本地服务：

```bash
node server.js
```

打开：

```text
http://localhost:8787
```

## 前端远程 AI 配置

`runtime-config.js` 控制前端是否调用远程后端：

```js
window.AI_WEREWOLF_CONFIG = {
  apiBaseUrl: "",
  enableRemoteAi: false,
};
```

部署后端后，可以改为：

```js
window.AI_WEREWOLF_CONFIG = {
  apiBaseUrl: "https://your-backend.example",
  enableRemoteAi: true,
};
```

## 发布说明

- 不要把 `.env.local` 或 API Key 打包进静态站点。
- itch.io 只托管公开静态文件，远程 AI 需要单独部署 `server.js`。
- `ITCH_README.md` 记录了 itch.io 打包相关注意事项。

## 项目结构

```text
index.html              游戏页面入口
app.js                  前端启动入口
game-state.js           游戏状态
game-rules.js           核心规则与流程
game-ai.js              AI 决策逻辑
game-render.js          界面渲染
game-voice.js           发言与文本表现
game-config.js          游戏配置
runtime-config.js       运行时远程 AI 配置
server.js               可选 Node 后端代理
assets/avatars/         玩家头像资源
tools/                  打包与维护脚本
```

