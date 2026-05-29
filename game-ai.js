function isHumanTurn() {
  if (!state || state.winner) return true;
  return (
    (state.phase === "night_wolf" &&
      getPlayer(HUMAN_ID).isWolf &&
      isHumanAlive() &&
      Object.keys(state.night.wolfVotes).length > 0 &&
      !state.night.wolfVotes[HUMAN_ID]) ||
    (state.phase === "night_seer" && getByRoleFrom(state.players, "seer").isHuman && isHumanAlive()) ||
    (state.phase === "night_witch" && getByRoleFrom(state.players, "witch").isHuman && isHumanAlive()) ||
    (state.phase === "night_guard" && getByRoleFrom(state.players, "guard").isHuman && isHumanAlive()) ||
    (state.phase === "sheriff_join" && isHumanAlive()) ||
    ((state.phase === "sheriff_speech" || state.phase === "sheriff_pk_speech" || state.phase === "day_speech" || state.phase === "pk_speech") && state.speechQueue[0] === HUMAN_ID) ||
    (state.phase === "sheriff_vote" && isHumanAlive() && !state.sheriffState.candidates.includes(HUMAN_ID)) ||
    (state.phase === "sheriff_pk_vote" && isHumanAlive() && !state.sheriffState.pkCandidates.includes(HUMAN_ID)) ||
    (state.phase === "sheriff_direction" && state.sheriffState.sheriffId === HUMAN_ID) ||
    (state.phase === "sheriff_transfer" && state.sheriffState.transferFrom === HUMAN_ID) ||
    (state.phase === "day_vote" && isHumanAlive()) ||
    (state.phase === "pk_vote" && isHumanAlive() && !state.pkCandidates.includes(HUMAN_ID)) ||
    (state.phase === "last_words" && state.pendingLastWords[0] === HUMAN_ID) ||
    (state.phase === "hunter_shot" && getPlayer(state.hunterState.playerId).isHuman) ||
    state.phase === "ended"
  );
}

function isOpeningWait() {
  return (
    state &&
    state.dayNumber === 1 &&
    state.phase === "night_wolf" &&
    !state.night.wolfKillTarget &&
    Object.keys(state.night.wolfVotes).length === 0
  );
}

function setAiProgress(label, expectedMs = 7000) {
  clearAiProgress();
  state.aiProgress = {
    label,
    startedAt: Date.now(),
    expectedMs,
    percent: 3,
  };
  progressTimer = window.setInterval(() => {
    if (!state.aiProgress) return;
    const elapsed = Date.now() - state.aiProgress.startedAt;
    state.aiProgress.percent = Math.min(96, Math.round((elapsed / state.aiProgress.expectedMs) * 100));
    renderProgress();
  }, 120);
  renderProgress();
}

function clearAiProgress() {
  if (progressTimer) window.clearInterval(progressTimer);
  progressTimer = null;
  if (state) state.aiProgress = null;
  renderProgress();
}

function renderProgress() {
  const box = $("aiProgress");
  if (!box || !state) return;
  if (!state.aiProgress) {
    box.innerHTML = "";
    box.classList.remove("active");
    return;
  }
  box.classList.add("active");
  box.innerHTML = `
    <div class="progress-head">
      <strong>${escapeHtml(state.aiProgress.label)}</strong>
      <span>${state.aiProgress.percent}%</span>
    </div>
    <div class="progress-track">
      <div class="progress-fill" style="width: ${state.aiProgress.percent}%"></div>
    </div>
  `;
}

async function runUntilHumanTurn() {
  if (autoTimer) return;
  $("autoStepBtn").textContent = "暂停自动";
  autoTimer = window.setInterval(async () => {
    if (stepping) return;
    if (isHumanTurn()) {
      stopAuto();
      render();
      return;
    }
    if (isVoiceBlockingProgress()) {
      render();
      return;
    }
    const before = `${state.phase}:${state.dayNumber}:${state.speechQueue.join(",")}:${state.pendingLastWords.join(",")}`;
    await stepAi();
    const after = `${state.phase}:${state.dayNumber}:${state.speechQueue.join(",")}:${state.pendingLastWords.join(",")}`;
    if (state.winner || isHumanTurn() || before === after) {
      stopAuto();
      render();
    }
  }, 180);
}

function majorityTarget(votes) {
  const counts = new Map();
  Object.values(votes)
    .filter(Boolean)
    .forEach((target) => counts.set(target, (counts.get(target) || 0) + 1));
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!best.length) return null;
  const topScore = best[0][1];
  const tied = best.filter(([, score]) => score === topScore).map(([id]) => Number(id));
  return choice(tied);
}

function aiPickTarget(playerId, legalIds, intent = "vote") {
  const view = privateStateFor(playerId);
  const self = getPlayer(playerId);
  const recentVotes = view.publicState.votes.slice(0, 12);
  if (!legalIds.length) return null;

  if (self.isWolf) {
    const teammates = new Set(view.privateState.wolfTeammates || []);
    const candidates = legalIds.filter((id) => !teammates.has(id));
    return choice(candidates.length ? candidates : legalIds);
  }

  if (self.role === "seer") {
    const checked = new Set(state.seerChecks.filter((c) => c.seerId === playerId).map((c) => c.targetId));
    const unchecked = legalIds.filter((id) => !checked.has(id));
    return choice(unchecked.length ? unchecked : legalIds);
  }

  const accused = new Map();
  for (const speech of view.publicState.speeches) {
    const matches = speech.text.match(/\d+号/g) || [];
    for (const match of matches) {
      const id = Number(match.replace("号", ""));
      if (legalIds.includes(id)) accused.set(id, (accused.get(id) || 0) + 1);
    }
  }
  for (const vote of recentVotes) {
    if (legalIds.includes(vote.targetId)) accused.set(vote.targetId, (accused.get(vote.targetId) || 0) + 1);
  }
  if (accused.size && intent === "vote") {
    return [...accused.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return choice(legalIds);
}


function aiSpeech(playerId, isPk = false) {
  const view = privateStateFor(playerId);
  const self = getPlayer(playerId);
  const alive = aliveIds().filter((id) => id !== playerId);
  const prefix = isPk ? "PK发言" : "发言";

  if (self.isWolf) {
    const target = aiPickTarget(playerId, alive, "vote");
    return `${prefix}：我先把焦点放在${target}号身上，他的发言容易被做成抗推位，也可能是关键轮次的突破口。今天我会看谁急着保他、谁又在借他转移视线。`;
  }
  if (self.role === "seer") {
    const checks = view.privateState.seerChecks || [];
    const claim = checks
      .map((check) => `${check.targetId}号${check.result === "werewolf" ? "狼人" : "好人"}`)
      .join("，");
    return `${prefix}：我会给一个明确视角，验人是${claim || "暂时没有有效验人"}。但今天不只看身份，也要看谁在顺着票型找抗推。`;
  }
  if (self.role === "witch") {
    return `${prefix}：我先按平民视角聊，暂时不想把身份信息打太满。当前更关注谁在复读前置位、谁在主动找逻辑。`;
  }
  if (self.role === "hunter") {
    return `${prefix}：我不想太早聊身份，先从行为看。今天优先处理发言摇摆、只跟票但不给理由的人。`;
  }
  if (self.role === "guard") {
    return `${prefix}：我按平民视角先藏一手信息。现在更想听清楚谁在主动盘逻辑，谁只是借别人观点带节奏。`;
  }
  const suspect = aiPickTarget(playerId, alive, "vote");
  return `${prefix}：我是闭眼好人，暂时听下来${suspect}号有点像在找抗推位，我会继续看后置位表态。`;
}

function aiApiBase() {
  const config = window.AI_WEREWOLF_CONFIG || {};
  if (config.enableRemoteAi === false) return null;
  if (config.apiBaseUrl) return String(config.apiBaseUrl).replace(/\/$/, "");
  return window.location.protocol === "file:" ? "http://localhost:8787" : "";
}

async function fetchWithTimeout(url, options, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callAiDecision(playerId, task, options = {}) {
  const baseUrl = aiApiBase();
  if (baseUrl === null) throw new Error("Remote AI disabled by runtime config.");

  const responseSchemas = {
    speech: {
      speech: "公开发言文本，80到180字。神职默认藏身份，女巫和守卫尤其应装作平民，只有关键信息必须公开时才跳身份。狼人多数对局要考虑安排悍跳预言家：若人类狼人已悍跳可配合或放弃，否则 AI 狼人应主动承担悍跳压力。狼人除非明确打倒钩，否则不要长期站在好人视角帮助好人梳理真逻辑，应服务狼队目标：悍跳、抗推、垫飞、保护队友、扰乱站边或制造合理怀疑。不要盲目跟风前置位，要给出自己的判断依据、质疑点或票型推理。狼人应尽量伪装好人，不主动暴露自己是狼或队友信息，但允许极小概率出现现实玩家式失误",
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

  const payload = {
    task,
    playerId,
    legalTargetIds: options.legalTargetIds || [],
    isPk: options.isPk || false,
    round: options.round || null,
    responseSchema: responseSchemas[task],
    view: privateStateFor(playerId),
  };
  const response = await fetchWithTimeout(`${baseUrl}/api/ai-player`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "AI 请求失败");
  return result.content || {};
}

async function aiPickTargetSmart(playerId, legalIds, intent = "vote", options = {}) {
  if (getPlayer(playerId).isHuman) return aiPickTarget(playerId, legalIds, intent);
  try {
    const content = await callAiDecision(playerId, "target", {
      legalTargetIds: legalIds,
      round: options.round || intent,
      isPk: options.isPk || false,
    });
    const targetId = content.targetId === null ? null : Number(content.targetId);
    if (targetId === null && options.allowAbstain) return null;
    if (legalIds.includes(targetId)) return targetId;
  } catch (error) {
    console.warn(`AI target fallback for player ${playerId}:`, error);
  }
  return aiPickTarget(playerId, legalIds, intent);
}

async function aiSpeechSmart(playerId, isPk = false) {
  if (getPlayer(playerId).isHuman) return aiSpeech(playerId, isPk);
  try {
    const content = await callAiDecision(playerId, "speech", { isPk });
    const speech = String(content.speech || "").trim();
    if (speech) {
      return cleanPublicSpeech(speech);
    }
  } catch (error) {
    console.warn(`AI speech fallback for player ${playerId}:`, error);
  }
  return aiSpeech(playerId, isPk);
}

async function aiWitchActionSmart() {
  const witch = getPlayer(state.witchState.playerId);
  if (!witch.alive || witch.isHuman) return aiWitchAction();
  try {
    const legal = aliveIds().filter((id) => id !== witch.id);
    const content = await callAiDecision(witch.id, "witch", { legalTargetIds: legal });
    const action = String(content.action || "none");
    const targetId = Number(content.targetId);
    if (action === "save") return { type: "save" };
    if (action === "poison" && legal.includes(targetId)) return { type: "poison", targetId };
    return { type: "none" };
  } catch (error) {
    console.warn("AI witch fallback:", error);
  }
  return aiWitchAction();
}

function aiWitchAction() {
  const witch = getPlayer(state.witchState.playerId);
  if (!witch.alive) return { type: "none" };
  const killed = state.night.wolfKillTarget;
  const killedSelf = killed === witch.id;
  const canSelfSave = !killedSelf;
  if (killed && state.witchState.hasAntidote && canSelfSave) {
    if (state.dayNumber === 1 || Math.random() < 0.55) {
      return { type: "save" };
    }
  }
  if (state.witchState.hasPoison && state.dayNumber >= 2) {
    const legal = aliveIds().filter((id) => id !== witch.id);
    if (Math.random() < 0.35) return { type: "poison", targetId: aiPickTarget(witch.id, legal, "vote") };
  }
  return { type: "none" };
}


function cleanPublicSpeech(text) {
  return String(text || "")
    .replace(/【[^】]*(deepseek|gpt|claude|gemini|model|模型|ep-\d)[^】]*】/gi, "")
    .replace(/deepseek-v3-2-251201/gi, "")
    .replace(/ep-\d{8,}-[a-z0-9-]+/gi, "")
    .replace(/我是由[^，。！？]*模型[^，。！？]*[，。！？]?/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
