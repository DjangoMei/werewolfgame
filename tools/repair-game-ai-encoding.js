const fs = require("node:fs");

let source = fs.readFileSync("game-ai.js", "utf8");

function replaceBlock(startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`Unable to find block: ${startMarker}`);
  }
  source = source.slice(0, start) + replacement.trimEnd() + "\n\n" + source.slice(end);
}

source = source.replace(/const matches = speech\.text\.match\(.+?\) \|\| \[\];/, 'const matches = speech.text.match(/\\d+号/g) || [];');
source = source.replace(/const id = Number\(match\.replace\(.+?, ""\)\);/, 'const id = Number(match.replace("号", ""));');

replaceBlock(
  "function aiSpeech(",
  "function aiApiBase()",
  `
function aiSpeech(playerId, isPk = false) {
  const view = privateStateFor(playerId);
  const self = getPlayer(playerId);
  const alive = aliveIds().filter((id) => id !== playerId);
  const prefix = isPk ? "PK发言" : "发言";

  if (self.isWolf) {
    const target = aiPickTarget(playerId, alive, "vote");
    return \`\${prefix}：我是好人视角，目前更怀疑\${target}号的发言和票型，今天可以重点听他解释。\`;
  }
  if (self.role === "seer") {
    const checks = view.privateState.seerChecks || [];
    const claim = checks
      .map((check) => \`\${check.targetId}号\${check.result === "werewolf" ? "狼人" : "好人"}\`)
      .join("，");
    return \`\${prefix}：我会给一个明确视角，验人是\${claim || "暂时没有有效验人"}。但今天不只看身份，也要看谁在顺着票型找抗推。\`;
  }
  if (self.role === "witch") {
    return \`\${prefix}：我先按平民视角聊，暂时不想把身份信息打太满。当前更关注谁在复读前置位、谁在主动找逻辑。\`;
  }
  if (self.role === "hunter") {
    return \`\${prefix}：我不想太早聊身份，先从行为看。今天优先处理发言摇摆、只跟票但不给理由的人。\`;
  }
  if (self.role === "guard") {
    return \`\${prefix}：我按平民视角先藏一手信息。现在更想听清楚谁在主动盘逻辑，谁只是借别人观点带节奏。\`;
  }
  const suspect = aiPickTarget(playerId, alive, "vote");
  return \`\${prefix}：我是闭眼好人，暂时听下来\${suspect}号有点像在找抗推位，我会继续看后置位表态。\`;
}
`,
);

replaceBlock(
  "  const responseSchemas = {",
  "  const payload = {",
  `
  const responseSchemas = {
    speech: {
      speech: "公开发言文本，80到180字。神职默认藏身份，女巫和守卫尤其应装作平民，只有关键信息必须公开时才跳身份。狼人多数对局要考虑安排悍跳预言家：若人类狼人已悍跳可配合或放弃，否则 AI 狼人应主动承担悍跳压力。不要盲目跟风前置位，要给出自己的判断依据、质疑点或票型推理。狼人应尽量伪装好人，不主动暴露自己是狼或队友信息，但允许极小概率出现现实玩家式失误",
    },
    target: {
      targetId: "从 legalTargetIds 中选择一个玩家编号；允许弃票时可以为 null",
      reason: "一句话说明选择原因",
    },
    witch: {
      action: "save、poison、none 三选一",
      targetId: "action 为 poison 时从 legalTargetIds 里选；其他情况为 null",
      reason: "一句话说明用药原因",
    },
  };
`,
);

const cleanPublicSpeechReplacement = `
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

const cleanStart = source.indexOf("function cleanPublicSpeech(");
if (cleanStart >= 0) {
  source = source.slice(0, cleanStart) + cleanPublicSpeechReplacement.trimEnd() + "\n";
} else {
  source = source.replace(/\nundefined(?:\nundefined)*\s*$/g, "");
  source += "\n" + cleanPublicSpeechReplacement.trimEnd() + "\n";
}

fs.writeFileSync("game-ai.js", source, "utf8");
console.log("game-ai.js repaired as utf8");
