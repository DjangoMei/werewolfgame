# AI Werewolf itch.io package

This zip is safe to upload as an itch.io HTML5 game package.

Important:

- Do not put Ark / Volcengine API keys in this static package.
- itch.io serves all files publicly, so any key included here can be copied by players.
- See `配置.md` for the editable model / endpoint / backend configuration notes.
- For live model calls, deploy `server.js` on a Node-capable host and set environment variables there:
  - `ARK_API_KEY`
  - `ARK_ENDPOINT_ID`
  - `ARK_MODEL_NAME`
- Then edit `runtime-config.js` before zipping/uploading:

```js
window.AI_WEREWOLF_CONFIG = {
  apiBaseUrl: "https://your-backend.example",
  enableRemoteAi: true,
};
```

If no backend is configured, the game still runs with built-in fallback AI logic, but not live model calls.
