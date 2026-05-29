const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

loadLocalEnv();

const PORT = Number(process.env.PORT || 8787);
const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_ENDPOINT_ID = process.env.ARK_ENDPOINT_ID || "ep-20260522175712-qq28w";
const ARK_MODEL_NAME = process.env.ARK_MODEL_NAME || "deepseek-v3-2-251201";
const ARK_BASE_URL =
  process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const ALLOWED_ORIGINS = parseList(process.env.ALLOWED_ORIGINS);
const AI_REQUESTS_PER_MINUTE = Number(process.env.AI_REQUESTS_PER_MINUTE || 30);
const rateLimitBuckets = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin) {
  if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes("*")) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

function corsHeaders(req) {
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return headers;
}

function clientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function isRateLimited(req) {
  if (!Number.isFinite(AI_REQUESTS_PER_MINUTE) || AI_REQUESTS_PER_MINUTE <= 0) return false;
  const ip = clientIp(req);
  const now = Date.now();
  const current = rateLimitBuckets.get(ip);
  if (!current || now - current.startedAt >= 60_000) {
    rateLimitBuckets.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > AI_REQUESTS_PER_MINUTE;
}

function send(req, res, statusCode, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    ...corsHeaders(req),
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function buildSystemPrompt() {
  return [
    "你正在扮演 12 人狼人杀标准局中的一个 AI 玩家。",
    "规则是中国大陆常见 12 人预女猎守警徽局：白狼王、3普通狼人、4平民、预言家、女巫、猎人、守卫，屠边。",
    "首日有警长竞选，警长持警徽，白天放逐投票按 1.5 票计算；警长出局可以移交或撕毁警徽。",
    "女巫不可自救。守卫每夜守护一名玩家。",
    "如果你是狼人，公开发言时应尽量伪装成好人，不主动暴露狼队友、刀口或狼人身份；但可以保留现实玩家小概率失误的自然感。",
    "如果你是女巫、守卫、猎人等神职，默认不要轻易主动亮身份，尤其女巫和守卫应优先伪装成平民；只有在保护关键信息、避免抗推、对跳或局势需要时才暴露身份。",
    "如果你是狼人阵营，大多数对局应安排至少一名狼人上警悍跳预言家。若人类狼人已经明显悍跳，AI 狼人可以视情况配合或放弃悍跳；若没有狼人悍跳，AI 狼人应主动承担悍跳或补跳压力。",
    "如果你是狼人，除非明确采用倒钩狼打法，否则不要长期站在好人视角帮助好人梳理真逻辑；你的公开发言应服务于狼队目标，例如悍跳、抗推、垫飞、保护队友、扰乱站边或制造合理怀疑。",
    "发言不要机械复读或盲目跟风前置位观点。你需要给出自己的判断依据，可以参考他人发言，但要加入独立视角、质疑点或票型推理。",
    "你只能使用请求中提供的 publicState 和 privateState，不得假装知道其他隐藏身份。",
    "发言要像真人文字局，短而有判断，能结合公开发言、死亡、票型和你的私密信息。",
    "所有输出必须是 JSON，不要 Markdown，不要解释。",
  ].join("\n");
}

function buildUserPrompt(payload) {
  return JSON.stringify(
    {
      task: payload.task,
      playerId: payload.playerId,
      legalTargetIds: payload.legalTargetIds || [],
      isPk: Boolean(payload.isPk),
      round: payload.round || null,
      responseSchema: payload.responseSchema,
      view: payload.view,
    },
    null,
    2,
  );
}

function parseAiJsonContent(content) {
  const text = String(content || "{}").trim();
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw error;
  }
}

async function callArk(payload) {
  if (!ARK_API_KEY) {
    throw new Error("Missing ARK_API_KEY. Set it in .env.local or environment variables.");
  }
  const response = await fetch(ARK_BASE_URL, {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: {
      Authorization: `Bearer ${ARK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ARK_ENDPOINT_ID,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(payload) },
      ],
      temperature: payload.task === "speech" ? 0.85 : 0.35,
      max_tokens: payload.task === "speech" ? 260 : 120,
      response_format: { type: "json_object" },
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Ark API ${response.status}: ${raw.slice(0, 500)}`);
  }
  const data = JSON.parse(raw);
  const content = data.choices?.[0]?.message?.content || "{}";
  return {
    content: parseAiJsonContent(content),
  };
}

async function handleAi(req, res) {
  try {
    if (!isOriginAllowed(req.headers.origin)) {
      send(req, res, 403, JSON.stringify({ ok: false, error: "Origin is not allowed." }));
      return;
    }
    if (isRateLimited(req)) {
      send(req, res, 429, JSON.stringify({ ok: false, error: "Too many AI requests. Try again later." }));
      return;
    }
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || "{}");
    const result = await callArk(payload);
    send(req, res, 200, JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    send(
      req,
      res,
      200,
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(__dirname, decodeURIComponent(safePath));
  if (!filePath.startsWith(__dirname)) {
    send(req, res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      send(req, res, 404, "Not Found", "text/plain; charset=utf-8");
      return;
    }
    send(req, res, 200, content, MIME_TYPES[path.extname(filePath)] || "application/octet-stream");
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(req.headers.origin)) {
      send(req, res, 403, "");
      return;
    }
    send(req, res, 204, "");
    return;
  }
  if (req.method === "GET" && req.url === "/api/health") {
    send(req, res, 200, JSON.stringify({ ok: true, remoteAiConfigured: Boolean(ARK_API_KEY) }));
    return;
  }
  if (req.method === "POST" && req.url === "/api/ai-player") {
    await handleAi(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/favicon.ico") {
    send(req, res, 204, "");
    return;
  }
  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }
  send(req, res, 405, "Method Not Allowed", "text/plain; charset=utf-8");
});

server.listen(PORT, () => {
  console.log(`AI Werewolf server running at http://localhost:${PORT}`);
  console.log(`AI provider configured for ${ARK_MODEL_NAME}`);
});
