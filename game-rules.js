function applyDeath(playerId, reason) {
  const player = getPlayer(playerId);
  if (!player || !player.alive) {
    if (player && player.deathReason && !player.deathReason.includes(reason)) {
      player.deathReason.push(reason);
    }
    return;
  }
  player.alive = false;
  player.canSpeak = false;
  player.canVote = false;
  player.deathReason = [reason];
  if (player.role === "hunter") {
    prepareHunterShot(player, reason);
  }
}

function applyDeathWithReasons(playerId, reasons) {
  const player = getPlayer(playerId);
  if (!player) return;
  const uniqueReasons = [...new Set(reasons)];
  if (player.alive) {
    player.alive = false;
    player.canSpeak = false;
    player.canVote = false;
    player.deathReason = uniqueReasons;
  } else {
    player.deathReason = [...new Set([...(player.deathReason || []), ...uniqueReasons])];
  }
  if (player.role === "hunter") {
    prepareHunterShot(player, uniqueReasons[0]);
  }
}

function addDeathReason(playerId, reason) {
  const player = getPlayer(playerId);
  if (!player.deathReason) player.deathReason = [];
  if (!player.deathReason.includes(reason)) player.deathReason.push(reason);
}

function prepareHunterShot(player, reason) {
  const reasons = player.deathReason || [reason];
  const poisoned = reasons.includes("witch_poison");
  const legalReason = reasons.includes("wolf_kill") || reasons.includes("exile");
  if (!state.hunterState.hasShot && !poisoned && legalReason && aliveIds().length) {
    state.hunterState.pending = true;
    state.hunterState.cause = reason;
  }
}

function checkWin() {
  const alive = alivePlayers();
  const wolves = alive.filter((p) => p.isWolf).length;
  const villagers = alive.filter((p) => p.role === "villager").length;
  const gods = alive.filter((p) => p.isGod).length;
  if (wolves === 0) {
    state.winner = "good";
  } else if (villagers === 0 || gods === 0) {
    state.winner = "werewolf";
  }
  if (state.winner) {
    state.phase = "ended";
    logPublic(`${CAMPS[state.winner]}获胜。所有身份已公开。`);
    stopAuto();
  }
  return Boolean(state.winner);
}

function resolveNightDeaths() {
  const deaths = new Map();
  const killed = state.night.wolfKillTarget;
  if (killed && !state.night.witchSaveUsedTonight && state.night.guardTarget !== killed) {
    deaths.set(killed, ["wolf_kill"]);
  }
  const poisoned = state.night.witchPoisonTarget;
  if (poisoned) {
    deaths.set(poisoned, [...(deaths.get(poisoned) || []), "witch_poison"]);
  }
  for (const [id, reasons] of deaths.entries()) {
    applyDeathWithReasons(id, reasons);
  }
  state.night.deaths = [...deaths.keys()];

  if (state.night.deaths.length) {
    logPublic(`昨晚 ${state.night.deaths.map((id) => `${id}号`).join("、")} 玩家死亡。`);
    for (const id of state.night.deaths) {
      const player = getPlayer(id);
      if (state.dayNumber === 1) player.hasLastWords = true;
    }
  } else {
    logPublic("昨晚是平安夜。");
  }

  if (checkWin()) return;
  if (state.sheriffState.sheriffId && state.night.deaths.includes(state.sheriffState.sheriffId)) {
    scheduleSheriffTransfer(state.sheriffState.sheriffId, "day_after_night");
    return;
  }
  if (state.hunterState.pending) {
    state.phase = "hunter_shot";
    state.actionHint = "猎人死亡，可以选择是否开枪。";
    state.hunterState.returnTo = "day_after_night";
    return;
  }
  queueLastWordsOrDay();
}

function queueLastWordsOrDay() {
  state.pendingLastWords = state.players.filter((p) => p.hasLastWords).map((p) => p.id);
  if (state.pendingLastWords.length) {
    state.phase = "last_words";
    state.lastWordsReturn = "day";
    state.actionHint = "有玩家可以发表遗言。";
    return;
  }
  startSheriffElectionOrDay();
}

function startSheriffElectionOrDay() {
  if (state.dayNumber === 1 && state.sheriffState.enabled && !state.sheriffState.completed) {
    startSheriffJoin();
    return;
  }
  startDaySpeech();
}

function startSheriffJoin() {
  state.phase = "sheriff_join";
  state.sheriffState.speechStartId = nextAliveFrom(Math.floor(Math.random() * PLAYER_COUNT) + 1);
  state.actionHint = "首日警长竞选开始。存活玩家可以选择是否上警。";
  logPublic("警长竞选开始，存活玩家可以选择上警。");
}

function finalizeSheriffCandidates(humanRuns = false) {
  const aiCandidates = alivePlayers()
    .filter((player) => !player.isHuman)
    .filter((player) => {
      if (player.isGod || player.isWolf) return Math.random() < 0.62;
      return Math.random() < 0.24;
    })
    .map((player) => player.id);
  const candidates = [...new Set([...(humanRuns && isHumanAlive() ? [HUMAN_ID] : []), ...aiCandidates])];
  state.sheriffState.candidates = candidates;
  state.sheriffState.pkCandidates = [];
  if (!candidates.length) {
    finishSheriffElection(null, "无人上警，本局没有警徽。");
    return;
  }
  state.speechQueue = orderIdsBySeat(candidates, state.sheriffState.speechStartId);
  state.phase = "sheriff_speech";
  state.actionHint = `警上玩家依次竞选发言：${state.speechQueue.map((id) => `${id}号`).join("、")}。`;
  logPublic(`上警玩家：${state.speechQueue.map((id) => `${id}号`).join("、")}。`);
}

function orderIdsBySeat(ids, startId) {
  const allowed = new Set(ids);
  const queue = [];
  const start = startId || nextAliveFrom(state.dayNumber);
  for (let offset = 0; offset < PLAYER_COUNT; offset += 1) {
    const id = ((start - 1 + offset) % PLAYER_COUNT) + 1;
    if (allowed.has(id) && getPlayer(id).alive) queue.push(id);
  }
  return queue;
}

function finishSheriffElection(sheriffId, message = null) {
  state.sheriffState.completed = true;
  state.sheriffState.candidates = [];
  state.sheriffState.pkCandidates = [];
  state.sheriffState.sheriffId = sheriffId || null;
  state.sheriffState.badgeDestroyed = !sheriffId;
  logPublic(message || (sheriffId ? `${sheriffId}号玩家当选警长，获得警徽。` : "警长竞选未产生警长，警徽流失。"));
  startDaySpeech();
}

function startSheriffPk(tied) {
  state.sheriffState.pkCandidates = tied;
  state.speechQueue = tied.filter((id) => getPlayer(id).alive);
  state.phase = "sheriff_pk_speech";
  state.actionHint = `警长竞选平票，${tied.map((id) => `${id}号`).join("、")} 进入警徽 PK。`;
  logPublic(`警长竞选平票，${tied.map((id) => `${id}号`).join("、")} 进入警徽 PK 发言。`);
}

function scheduleSheriffTransfer(deadSheriffId, returnTo) {
  state.sheriffState.transferFrom = deadSheriffId;
  state.sheriffState.transferReturn = returnTo;
  state.sheriffState.sheriffId = null;
  state.phase = "sheriff_transfer";
  state.actionHint = `${deadSheriffId}号警长出局，请选择移交警徽或撕毁警徽。`;
}

function finishSheriffTransfer(targetId = null) {
  const from = state.sheriffState.transferFrom;
  const returnTo = state.sheriffState.transferReturn;
  if (targetId && getPlayer(targetId)?.alive) {
    state.sheriffState.sheriffId = targetId;
    state.sheriffState.badgeDestroyed = false;
    logPublic(`${from}号警长将警徽移交给 ${targetId}号。`);
  } else {
    state.sheriffState.sheriffId = null;
    state.sheriffState.badgeDestroyed = true;
    logPublic(`${from}号警长撕毁警徽。`);
  }
  state.sheriffState.transferFrom = null;
  state.sheriffState.transferReturn = null;
  if (returnTo === "day_after_night") {
    if (state.hunterState.pending) {
      state.phase = "hunter_shot";
      state.actionHint = "猎人死亡，可以选择是否开枪。";
      state.hunterState.returnTo = "day_after_night";
    } else {
      queueLastWordsOrDay();
    }
  } else {
    if (state.hunterState.pending) {
      state.phase = "hunter_shot";
      state.actionHint = "猎人被放逐，可以选择是否开枪。";
      state.hunterState.returnTo = "night_after_day";
    } else {
      queueLastWordsOrNight();
    }
  }
}

function nextAliveFrom(startId) {
  for (let offset = 0; offset < PLAYER_COUNT; offset += 1) {
    const id = ((startId - 1 + offset) % PLAYER_COUNT) + 1;
    if (getPlayer(id).alive) return id;
  }
  return null;
}

function buildSpeechQueue() {
  const sheriff = getPlayer(state.sheriffState.sheriffId);
  if (sheriff?.alive && state.sheriffState.speechDirectionDay === state.dayNumber) {
    return buildSheriffSpeechQueue(sheriff.id, state.sheriffState.speechDirection);
  }
  const deaths = state.night.deaths;
  const start = deaths.length ? nextAliveFrom(((Math.min(...deaths)) % PLAYER_COUNT) + 1) : nextAliveFrom(state.dayNumber);
  const queue = [];
  if (!start) return queue;
  for (let offset = 0; offset < PLAYER_COUNT; offset += 1) {
    const id = ((start - 1 + offset) % PLAYER_COUNT) + 1;
    if (getPlayer(id).alive) queue.push(id);
  }
  return queue;
}

function tableNeighbor(id, direction) {
  const delta = direction === "right" ? 1 : -1;
  return ((id - 1 + delta + PLAYER_COUNT) % PLAYER_COUNT) + 1;
}

function buildSheriffSpeechQueue(sheriffId, choice) {
  const step = choice === "right_counterclockwise" ? "right" : "left";
  const start = tableNeighbor(sheriffId, step);
  const queue = [];
  let current = start;
  for (let offset = 0; offset < PLAYER_COUNT - 1; offset += 1) {
    if (current !== sheriffId && getPlayer(current)?.alive) queue.push(current);
    current = tableNeighbor(current, step);
  }
  if (getPlayer(sheriffId)?.alive) queue.push(sheriffId);
  return queue;
}

function startDaySpeech() {
  const sheriff = getPlayer(state.sheriffState.sheriffId);
  if (sheriff?.alive && state.sheriffState.speechDirectionDay !== state.dayNumber) {
    state.phase = "sheriff_direction";
    state.actionHint = "警长请选择本轮发言顺序：警长自己将最后发言总结。";
    return;
  }
  state.phase = "day_speech";
  state.speechQueue = buildSpeechQueue();
  state.actionHint = "所有存活玩家按顺序发言。";
  logPublic(`第 ${state.dayNumber} 天发言开始，顺序：${state.speechQueue.map((id) => `${id}号`).join(" → ")}。`);
}

function chooseSheriffSpeechDirection(choice) {
  state.sheriffState.speechDirection = choice;
  state.sheriffState.speechDirectionDay = state.dayNumber;
  logPublic(`警长选择${choice === "left_clockwise" ? "从警长左手边" : "从警长右手边"}开始发言，警长最后总结。`);
  startDaySpeech();
}

function completeSpeech(playerId, text, isPk = false) {
  const speechPhase = state.phase;
  const safeText = cleanPublicSpeech(text);
  state.speeches.unshift({
    day: state.dayNumber,
    playerId,
    text: safeText,
    isPk,
  });
  enqueueAiSpeech(playerId, safeText);
  if (isPk) logPublic(`${playerId}号玩家完成 PK 发言。`);
  state.speechQueue = state.speechQueue.filter((id) => id !== playerId);
  if (!state.speechQueue.length) {
    if (speechPhase === "sheriff_speech") {
      state.phase = "sheriff_vote";
      state.actionHint = "警下玩家为警长投票。";
    } else if (speechPhase === "sheriff_pk_speech") {
      state.phase = "sheriff_pk_vote";
      state.actionHint = "非 PK 玩家在平票警上玩家中再次投票。";
    } else {
      state.phase = isPk ? "pk_vote" : "day_vote";
      state.actionHint = isPk ? "非 PK 玩家在平票玩家中再次投票。" : "所有存活玩家进行放逐投票。";
    }
  }
}

function recordVote(voterId, targetId, round) {
  state.votes.unshift({
    day: state.dayNumber,
    round,
    voterId,
    targetId,
    weight: state.sheriffState?.sheriffId === voterId ? 1.5 : 1,
  });
}

function tallyVotes(votes) {
  const counts = new Map();
  for (const vote of votes) {
    if (vote.targetId) {
      const weight = vote.weight || (state.sheriffState?.sheriffId === vote.voterId ? 1.5 : 1);
      counts.set(vote.targetId, (counts.get(vote.targetId) || 0) + weight);
    }
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length) return { exiled: null, tied: [] };
  const high = entries[0][1];
  const tied = entries.filter(([, count]) => count === high).map(([id]) => id);
  return { exiled: tied.length === 1 ? tied[0] : null, tied };
}

function resolveExile(playerId) {
  applyDeath(playerId, "exile");
  getPlayer(playerId).hasLastWords = true;
  logPublic(`${playerId}号玩家被公投放逐。`);
  if (checkWin()) return;
  if (state.sheriffState.sheriffId === playerId) {
    scheduleSheriffTransfer(playerId, "night_after_day");
    return;
  }
  if (state.hunterState.pending) {
    state.phase = "hunter_shot";
    state.actionHint = "猎人被放逐，可以选择是否开枪。";
    state.hunterState.returnTo = "night_after_day";
    return;
  }
  queueLastWordsOrNight();
}

function queueLastWordsOrNight() {
  state.pendingLastWords = state.players.filter((p) => p.hasLastWords).map((p) => p.id);
  if (state.pendingLastWords.length) {
    state.phase = "last_words";
    state.lastWordsReturn = "night";
    state.actionHint = "被放逐玩家发表遗言。";
  } else {
    startNextNight();
  }
}

function startPk(tied) {
  state.pkCandidates = tied;
  state.speechQueue = tied.filter((id) => getPlayer(id).alive);
  state.phase = "pk_speech";
  state.actionHint = `平票进入 PK：${tied.map((id) => `${id}号`).join("、")}。`;
  logPublic(`最高票平票，${tied.map((id) => `${id}号`).join("、")} 进入 PK 发言。`);
}

function finishDayNoExile() {
  logPublic("第二轮仍然平票，今天无人出局，平安日。");
  startNextNight();
}

function startNextNight() {
  if (checkWin()) return;
  state.dayNumber += 1;
  state.phase = "night_wolf";
  state.night = resetNight();
  state.pkCandidates = [];
  state.speechQueue = [];
  logPublic(`第 ${state.dayNumber} 夜开始。`);
}

function hunterShoot(targetId) {
  if (!state.hunterState.pending || state.hunterState.hasShot) return;
  const hunterId = state.hunterState.playerId;
  state.hunterState.hasShot = true;
  state.hunterState.pending = false;
  if (targetId) {
    applyDeath(targetId, "hunter_shot");
    logPublic(`猎人 ${hunterId}号 开枪带走了 ${targetId}号。`);
  } else {
    logPublic(`猎人 ${hunterId}号 选择不开枪。`);
  }
  if (checkWin()) return;
  if (targetId && state.sheriffState.sheriffId === targetId) {
    scheduleSheriffTransfer(targetId, state.hunterState.returnTo);
    state.hunterState.returnTo = null;
    return;
  }
  const hunter = getPlayer(hunterId);
  if (hunter.hasLastWords) {
    state.phase = "last_words";
    state.pendingLastWords = state.players.filter((p) => p.hasLastWords).map((p) => p.id);
    state.lastWordsReturn = state.hunterState.returnTo === "day_after_night" ? "day" : "night";
  } else if (state.hunterState.returnTo === "day_after_night") {
    queueLastWordsOrDay();
  } else {
    queueLastWordsOrNight();
  }
  state.hunterState.returnTo = null;
}

function isWhiteWolfSuicidePhase() {
  return [
    "sheriff_speech",
    "sheriff_vote",
    "sheriff_pk_speech",
    "sheriff_pk_vote",
    "sheriff_direction",
    "day_speech",
    "day_vote",
    "pk_speech",
    "pk_vote",
  ].includes(state.phase);
}

function whiteWolfSuicide(targetId) {
  const whiteWolf = getByRoleFrom(state.players, "white_wolf_king");
  const target = getPlayer(targetId);
  if (!whiteWolf?.alive || !isWhiteWolfSuicidePhase() || !target?.alive || target.id === whiteWolf.id) return;

  applyDeath(whiteWolf.id, "white_wolf_suicide");
  applyDeath(target.id, "white_wolf_skill");
  logPublic(`白狼王 ${whiteWolf.id}号 自爆，带走了 ${target.id}号。`);

  if (state.sheriffState.sheriffId === whiteWolf.id) {
    state.sheriffState.sheriffId = null;
    state.sheriffState.badgeDestroyed = true;
    logPublic("白狼王自爆，警徽流失。");
  }

  if (checkWin()) return;
  startNextNight();
}

function shouldAiWhiteWolfSuicide() {
  const whiteWolf = getByRoleFrom(state.players, "white_wolf_king");
  if (!whiteWolf?.alive || whiteWolf.isHuman || !isWhiteWolfSuicidePhase()) return false;
  const wolves = aliveWolves().length;
  const aliveCount = aliveIds().length;
  const chance = wolves <= 2 || aliveCount <= 7 ? 0.12 : 0.035;
  return Math.random() < chance;
}

function submitHumanWolfKill(targetId) {
  if (state.phase !== "night_wolf" || !getPlayer(HUMAN_ID).isWolf || !isHumanAlive()) return;
  state.night.wolfVotes[HUMAN_ID] = targetId;
  const wolfVoteText = Object.entries(state.night.wolfVotes)
    .map(([wolfId, voteTarget]) => `${wolfId}号→${voteTarget}号`)
    .join("，");
  state.night.wolfKillTarget = majorityTarget(state.night.wolfVotes);
  logWolfPrivate(`狼队夜间意见：${wolfVoteText}。最终刀口：${state.night.wolfKillTarget}号。`, state.night.wolfVotes, state.night.wolfKillTarget);
  state.phase = "night_seer";
  state.actionHint = "狼队已完成夜间协商，进入预言家行动。";
}

function logWolfPrivate(text, wolfVotes = {}, finalTarget = null) {
  for (const wolf of aliveWolves()) {
    logPrivate(wolf.id, text, {
      kind: "wolf_kill",
      wolfVotes: { ...wolfVotes },
      finalTarget,
    });
  }
}

async function stepAi() {
  if (stepping) return;
  stepping = true;
  try {
  if (state.winner) return;
  state.actionHint = "AI 正在根据场上信息思考...";

  if (shouldAiWhiteWolfSuicide()) {
    const whiteWolf = getByRoleFrom(state.players, "white_wolf_king");
    setAiProgress("技能决策中", 1800);
    render();
    const target = await aiPickTargetSmart(whiteWolf.id, aliveIds().filter((id) => id !== whiteWolf.id), "white_wolf_suicide");
    whiteWolfSuicide(target);
    return;
  }

  if (state.phase === "night_wolf") {
    setAiProgress("狼人夜间协商中", 9000);
    render();
    const wolfChoices = await Promise.all(
      aliveWolves().filter((wolf) => !wolf.isHuman).map(async (wolf) => ({
        wolfId: wolf.id,
        targetId: await aiPickTargetSmart(
        wolf.id,
        aliveIds().filter((id) => id !== wolf.id),
        "kill",
        ),
      })),
    );
    for (const choice of wolfChoices) {
      state.night.wolfVotes[choice.wolfId] = choice.targetId;
    }
    if (getPlayer(HUMAN_ID).isWolf && isHumanAlive() && !state.night.wolfVotes[HUMAN_ID]) {
      state.actionHint = "你是狼人，请参与夜间协商并选择刀人目标。";
      return;
    }
    state.night.wolfKillTarget = majorityTarget(state.night.wolfVotes);
    const wolfVoteText = Object.entries(state.night.wolfVotes)
      .map(([wolfId, voteTarget]) => `${wolfId}号→${voteTarget}号`)
      .join("，");
    logWolfPrivate(`狼队夜间意见：${wolfVoteText}。最终刀口：${state.night.wolfKillTarget}号。`, state.night.wolfVotes, state.night.wolfKillTarget);
    state.phase = "night_seer";
    state.actionHint = "狼人已选择刀口，进入预言家行动。";
  } else if (state.phase === "night_seer") {
    const seer = getByRoleFrom(state.players, "seer");
    if (seer.alive) {
      if (!seer.isHuman) {
        setAiProgress("夜间角色行动中", 7000);
        render();
      }
      const targetId = seer.isHuman
        ? null
        : await aiPickTargetSmart(seer.id, aliveIds().filter((id) => id !== seer.id), "check");
      if (targetId) doSeerCheck(targetId);
      else state.actionHint = "你是预言家，请选择今晚查验对象。";
    } else {
      state.phase = "night_witch";
    }
    if (!seer.alive || !seer.isHuman) state.phase = "night_witch";
  } else if (state.phase === "night_witch") {
    const witch = getByRoleFrom(state.players, "witch");
    if (witch.alive && witch.isHuman) {
      state.actionHint = "你是女巫，请选择是否用药。";
    } else {
      if (witch.alive) {
        setAiProgress("夜间角色行动中", 7000);
        render();
      }
      doWitchAction(await aiWitchActionSmart());
      state.phase = "night_guard";
    }
  } else if (state.phase === "night_guard") {
    const guard = getByRoleFrom(state.players, "guard");
    if (guard.alive && guard.isHuman) {
      state.actionHint = "你是守卫，请选择今晚守护对象。";
    } else {
      if (guard.alive) {
        setAiProgress("夜间角色行动中", 7000);
        render();
        const legal = aliveIds().filter((id) => id !== state.guardState.lastGuardTarget);
        const targetId = await aiPickTargetSmart(guard.id, legal.length ? legal : aliveIds(), "guard");
        doGuardAction(targetId);
      }
      state.phase = "night_resolve";
    }
  } else if (state.phase === "night_resolve") {
    setAiProgress("系统结算夜晚死亡", 1200);
    render();
    resolveNightDeaths();
  } else if (state.phase === "sheriff_join") {
    if (isHumanAlive()) {
      state.actionHint = "请选择是否参与警长竞选。";
    } else {
      finalizeSheriffCandidates(false);
    }
  } else if (state.phase === "sheriff_speech" || state.phase === "sheriff_pk_speech") {
    const current = state.speechQueue[0];
    if (!current) return;
    if (getPlayer(current).isHuman && getPlayer(current).alive) {
      state.actionHint = "轮到你进行警上发言。";
    } else {
      setAiProgress("AI 玩家发言中", 9000);
      render();
      completeSpeech(current, await aiSpeechSmart(current, state.phase === "sheriff_pk_speech"), state.phase === "sheriff_pk_speech");
    }
  } else if (state.phase === "sheriff_vote") {
    if (isHumanAlive() && !state.sheriffState.candidates.includes(HUMAN_ID)) {
      state.actionHint = "你在警下，请为警长投票。";
    } else {
      setAiProgress("警下玩家投票中", 8000);
      render();
      await resolveSheriffVoteRound("first", null);
    }
  } else if (state.phase === "sheriff_pk_vote") {
    if (isHumanAlive() && !state.sheriffState.pkCandidates.includes(HUMAN_ID)) {
      state.actionHint = "请选择警徽 PK 投票对象。";
    } else {
      setAiProgress("警徽 PK 投票中", 8000);
      render();
      await resolveSheriffVoteRound("pk", null);
    }
  } else if (state.phase === "sheriff_direction") {
    const sheriff = getPlayer(state.sheriffState.sheriffId);
    if (sheriff?.isHuman) {
      state.actionHint = "你是警长，请选择本轮发言顺序。";
    } else {
      setAiProgress("警长选择发言顺序中", 1200);
      chooseSheriffSpeechDirection(Math.random() < 0.5 ? "left_clockwise" : "right_counterclockwise");
    }
  } else if (state.phase === "sheriff_transfer") {
    if (state.sheriffState.transferFrom === HUMAN_ID) {
      state.actionHint = "你是出局警长，请选择移交警徽或撕毁警徽。";
    } else {
      const targetId = aliveIds().length ? await aiPickTargetSmart(state.sheriffState.transferFrom, aliveIds(), "sheriff_transfer") : null;
      finishSheriffTransfer(targetId);
    }
  } else if (state.phase === "day_speech" || state.phase === "pk_speech") {
    const current = state.speechQueue[0];
    if (!current) return;
    if (getPlayer(current).isHuman && getPlayer(current).alive) {
      state.actionHint = "轮到你发言。";
    } else {
      setAiProgress(state.phase === "pk_speech" ? "AI 玩家 PK 发言中" : "AI 玩家发言中", 9000);
      render();
      completeSpeech(current, await aiSpeechSmart(current, state.phase === "pk_speech"), state.phase === "pk_speech");
    }
  } else if (state.phase === "day_vote") {
    if (isHumanAlive()) {
      state.actionHint = "轮到你投票，可以弃票。";
    } else {
      setAiProgress("AI 玩家投票中", 9000);
      render();
      await resolveVoteRound("first", null);
    }
  } else if (state.phase === "pk_vote") {
    if (isHumanAlive() && !state.pkCandidates.includes(HUMAN_ID)) {
      state.actionHint = "轮到你在 PK 玩家中投票。";
    } else {
      setAiProgress("AI 玩家 PK 投票中", 9000);
      render();
      await resolveVoteRound("pk", null);
    }
  } else if (state.phase === "last_words") {
    const current = state.pendingLastWords[0];
    if (getPlayer(current)?.isHuman) {
      state.actionHint = "请发表遗言。";
    } else {
      setAiProgress("AI 玩家发表遗言中", 8000);
      render();
      completeLastWords(current, await aiSpeechSmart(current));
    }
  } else if (state.phase === "hunter_shot") {
    const hunter = getPlayer(state.hunterState.playerId);
    if (hunter.isHuman) {
      state.actionHint = "你是猎人，可以选择是否开枪。";
    } else {
      setAiProgress("夜间/技能决策中", 7000);
      render();
      const target = await aiPickTargetSmart(hunter.id, aliveIds(), "shoot");
      hunterShoot(target);
    }
  }
  clearAiProgress();
  render();
  } finally {
    clearAiProgress();
    stepping = false;
  }
}

function doSeerCheck(targetId) {
  const seer = getByRoleFrom(state.players, "seer");
  if (!seer.alive || targetId === seer.id || !getPlayer(targetId)?.alive) return;
  const result = getPlayer(targetId).isWolf ? "werewolf" : "good";
  state.seerChecks.push({ day: state.dayNumber, seerId: seer.id, targetId, result });
  logPrivate(seer.id, `你查验 ${targetId}号 的结果是：${result === "werewolf" ? "狼人" : "好人"}。`);
}

function doWitchAction(action) {
  const witch = getByRoleFrom(state.players, "witch");
  if (!witch.alive) return;
  const killed = state.night.wolfKillTarget;
  if (action.type === "save" && state.witchState.hasAntidote && killed) {
    const isSelfSave = killed === witch.id;
    if (!isSelfSave) {
      state.witchState.hasAntidote = false;
      state.night.witchSaveUsedTonight = true;
      logPrivate(witch.id, `你使用解药救了 ${killed}号。`);
    } else {
      logPrivate(witch.id, "你今晚被刀，规则禁止女巫自救。");
    }
  } else if (action.type === "poison" && state.witchState.hasPoison && action.targetId) {
    const target = getPlayer(action.targetId);
    if (target?.alive) {
      state.witchState.hasPoison = false;
      state.night.witchPoisonTarget = target.id;
      logPrivate(witch.id, `你使用毒药毒了 ${target.id}号。`);
    }
  } else {
    logPrivate(witch.id, "你今晚没有使用药。");
  }
}

function doGuardAction(targetId) {
  const guard = getByRoleFrom(state.players, "guard");
  if (!guard.alive || !targetId || !getPlayer(targetId)?.alive) return;
  if (targetId === state.guardState.lastGuardTarget) {
    logPrivate(guard.id, `守卫不能连续两晚守护 ${targetId}号。`);
    return;
  }
  state.night.guardTarget = targetId;
  state.guardState.lastGuardTarget = targetId;
  logPrivate(guard.id, `你今晚守护了 ${targetId}号。`);
}

async function resolveSheriffVoteRound(round, humanTarget) {
  const candidates = round === "pk" ? state.sheriffState.pkCandidates : state.sheriffState.candidates;
  const legalTargets = candidates.filter((id) => getPlayer(id).alive);
  const voters = aliveIds().filter((id) => !legalTargets.includes(id));
  if (!legalTargets.length || !voters.length) {
    finishSheriffElection(null, "警长竞选无人可投，警徽流失。");
    return;
  }
  const voteBatch = await Promise.all(voters.map(async (voterId) => {
    if (voterId === HUMAN_ID && isHumanAlive()) {
      return { voterId, targetId: humanTarget || null };
    }
    const targetId = await aiPickTargetSmart(voterId, legalTargets, "sheriff_vote", {
      round,
      isPk: round === "pk",
    });
    return { voterId, targetId };
  }));
  for (const { voterId, targetId } of voteBatch) {
    recordVote(voterId, targetId, `sheriff_${round}`);
  }
  const summary = voteBatch.map((v) => `${v.voterId}号→${v.targetId ? `${v.targetId}号` : "弃票"}`).join("，");
  logPublic(`${round === "pk" ? "警徽PK" : "警长竞选"}投票：${summary}。`);
  const tally = tallyVotes(voteBatch);
  if (round === "first" && !tally.exiled && tally.tied.length > 1) {
    startSheriffPk(tally.tied);
  } else if (round === "pk" && !tally.exiled) {
    finishSheriffElection(null, "警徽 PK 再次平票，本局没有警长。");
  } else {
    finishSheriffElection(tally.exiled);
  }
}

async function resolveVoteRound(round, humanTarget) {
  const voters =
    round === "pk"
      ? aliveIds().filter((id) => !state.pkCandidates.includes(id))
      : aliveIds();
  const legalTargets =
    round === "pk" ? state.pkCandidates.filter((id) => getPlayer(id).alive) : aliveIds();
  const voteBatch = [];
  const votePromises = voters.map(async (voterId) => {
    if (voterId === HUMAN_ID && isHumanAlive()) {
      return { voterId, targetId: humanTarget || null };
    }
    const canAbstain = round === "first" && Math.random() < 0.12;
    const targetId = canAbstain
      ? null
      : await aiPickTargetSmart(voterId, legalTargets.filter((id) => id !== voterId), "vote", {
          round,
          isPk: round === "pk",
          allowAbstain: round === "first",
        });
    return { voterId, targetId };
  });
  voteBatch.push(...(await Promise.all(votePromises)));
  for (const { voterId, targetId } of voteBatch) {
    recordVote(voterId, targetId, round);
  }
  const summary = voteBatch.map((v) => `${v.voterId}号→${v.targetId ? `${v.targetId}号` : "弃票"}`).join("，");
  logPublic(`${round === "pk" ? "PK" : "第一轮"}投票：${summary}。`);
  const tally = tallyVotes(voteBatch);
  if (round === "first" && !tally.exiled && tally.tied.length > 1) {
    startPk(tally.tied);
  } else if (round === "pk" && !tally.exiled) {
    finishDayNoExile();
  } else if (tally.exiled) {
    resolveExile(tally.exiled);
  } else {
    finishDayNoExile();
  }
}

function completeLastWords(playerId, text) {
  const player = getPlayer(playerId);
  player.hasLastWords = false;
  state.pendingLastWords = state.pendingLastWords.filter((id) => id !== playerId);
  const safeText = cleanPublicSpeech(text);
  state.speeches.unshift({
    day: state.dayNumber,
    playerId,
    text: `遗言：${safeText}`,
    isLastWords: true,
  });
  enqueueAiSpeech(playerId, safeText, "遗言");
  logPublic(`${playerId}号玩家发表遗言。`);
  if (state.pendingLastWords.length) return;
  if (state.lastWordsReturn === "day") startSheriffElectionOrDay();
  else startNextNight();
  state.lastWordsReturn = null;
}
