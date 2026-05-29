# 后端部署说明

这个项目的后端是 `server.js`，负责托管静态页面并代理调用火山方舟 Ark。外网部署时不要把 API Key 写进前端文件，只在部署平台的环境变量里配置。

## 必需环境变量

```ini
ARK_API_KEY=你的火山方舟 API Key
ARK_ENDPOINT_ID=ep-20260522175712-qq28w
ARK_MODEL_NAME=deepseek-v3-2-251201
PORT=8787
```

建议额外配置：

```ini
ALLOWED_ORIGINS=https://你的个人主页域名
AI_REQUESTS_PER_MINUTE=30
```

`ALLOWED_ORIGINS` 可以用逗号分隔多个来源，例如：

```ini
ALLOWED_ORIGINS=https://example.com,https://www.example.com
```

## 健康检查

部署后访问：

```text
https://api.djangomei.com/api/health
```

应返回：

```json
{"ok":true,"remoteAiConfigured":true}
```

## 当前 djangomei.com 部署

当前公网入口已经接到个人主页同一条 Cloudflare Tunnel：

```text
api.djangomei.com -> Cloudflare Tunnel -> 127.0.0.1:8787
```

本机自启服务：

```text
/Users/djangomei/Library/LaunchAgents/com.djangomei.werewolf-api.plist
```

Cloudflare Tunnel 配置：

```text
/Users/djangomei/.cloudflared/config.yml
```

重启服务：

```bash
launchctl kickstart -k gui/$(id -u)/com.djangomei.werewolf-api
launchctl kickstart -k gui/$(id -u)/com.djangomei.cloudflared.homepage
```

## Docker 部署

```bash
docker build -t ai-werewolf .
docker run -d --name ai-werewolf -p 8787:8787 --env-file .env.local ai-werewolf
```

## Nginx 反向代理示例

把 `werewolf-api.example.com` 换成你的域名：

```nginx
server {
    listen 80;
    server_name werewolf-api.example.com;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

然后用 Certbot 或你的面板开启 HTTPS。

## 前端连接后端

如果前端不是和后端同源托管，修改 `runtime-config.js`：

```js
window.AI_WEREWOLF_CONFIG = {
  apiBaseUrl: "https://你的后端域名",
  enableRemoteAi: true,
};
```

## 后续开发同步规则

每次修改狼人杀游戏后，同步顺序固定为：

```bash
node tools/sync-homepage.js
node --check server.js
node --check game-ai.js
```

然后检查两个 Git 工作区：

```bash
git status --short
git -C /Users/djangomei/Documents/个人主页 status --short
```

确认无误后，把狼人杀仓库提交到 GitHub，同时保留个人主页目录里的 `/werewolf/` 线上版本更新。
