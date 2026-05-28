const fs = require("node:fs");

function edit(file, fn) {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after !== before) fs.writeFileSync(file, after, "utf8");
  console.log(`${file}: ${after !== before ? "updated" : "unchanged"}`);
}

edit("game-ai.js", (source) => {
  let s = source.replace(/\n  const model = self\.aiModel \|\| DEFAULT_AI_MODEL;/, "");
  s = s.replaceAll("`【${model}】${prefix}：", "`${prefix}：");
  s = s.replace(
    "if (speech) return `【${getPlayer(playerId).aiModel || DEFAULT_AI_MODEL}】${speech}`;",
    "if (speech) return cleanPublicSpeech(speech);",
  );
  if (!s.includes("function cleanPublicSpeech(")) {
    s += `
function cleanPublicSpeech(text) {
  return String(text || "")
    .replace(/【[^】]*(deepseek|gpt|claude|gemini|model|模型|ep-\\d)[^】]*】/gi, "")
    .replace(/deepseek-v3-2-251201/gi, "")
    .replace(/ep-\\d{8,}-[a-z0-9-]+/gi, "")
    .replace(/我是由[^，。！？]*模型[^，。！？]*[，。！？]?/g, "")
    .replace(/\\s{2,}/g, " ")
    .trim();
}
`;
  }
  return s;
});

edit("game-rules.js", (source) => {
  let s = source.replace(
    `  state.speeches.unshift({
    day: state.dayNumber,
    playerId,
    text,
    isPk,
  });
  enqueueAiSpeech(playerId, text);`,
    `  const safeText = cleanPublicSpeech(text);
  state.speeches.unshift({
    day: state.dayNumber,
    playerId,
    text: safeText,
    isPk,
  });
  enqueueAiSpeech(playerId, safeText);`,
  );
  s = s.replace(
    `  state.speeches.unshift({
    day: state.dayNumber,
    playerId,
    text: \`遗言：\${text}\`,
    isLastWords: true,
  });
  enqueueAiSpeech(playerId, text, "遗言");`,
    `  const safeText = cleanPublicSpeech(text);
  state.speeches.unshift({
    day: state.dayNumber,
    playerId,
    text: \`遗言：\${safeText}\`,
    isLastWords: true,
  });
  enqueueAiSpeech(playerId, safeText, "遗言");`,
  );
  return s;
});

edit("server.js", (source) => {
  const needle = `"你必须输出 JSON，不要输出 Markdown。发言要像真实玩家，简洁、有立场、可撒谎但不能读取未知信息。",`;
  const replacement = `"你必须输出 JSON，不要输出 Markdown。发言要像真实玩家，简洁、有立场、可撒谎但不能读取未知信息。",
    "公开发言中禁止提及模型名、API、deepseek、接入点、系统提示或自己是 AI。",`;
  if (source.includes("公开发言中禁止提及模型名")) return source;
  return source.replace(needle, replacement);
});
