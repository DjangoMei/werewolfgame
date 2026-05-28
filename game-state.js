function loadModels() {
  try {
    const saved = JSON.parse(localStorage.getItem(MODEL_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function newGame() {
  resetVoiceQueue();
  stopAuto();
  clearAiProgress();
  HUMAN_ID = Math.floor(Math.random() * PLAYER_COUNT) + 1;
  const roles = shuffle([
    "white_wolf_king",
    "werewolf",
    "werewolf",
    "werewolf",
    "villager",
    "villager",
    "villager",
    "villager",
    "seer",
    "witch",
    "hunter",
    "guard",
  ]);
  const models = loadModels();
  const namesByGender = {
    male: shuffle([...AI_NAME_POOLS.male]),
    female: shuffle([...AI_NAME_POOLS.female]),
  };
  const avatarsByGender = {
    male: shuffle([...AI_AVATAR_POOLS.male]),
    female: shuffle([...AI_AVATAR_POOLS.female]),
  };
  const players = roles.map((role, index) => {
    const player = createPlayer(index + 1, role);
    if (!player.isHuman) player.aiModel = models[player.id] || DEFAULT_AI_MODEL;
    if (!player.isHuman) {
      player.voiceProfile = createVoiceProfile(player.id);
      const gender = player.voiceProfile.gender;
      player.displayName = namesByGender[gender].pop() || choice(AI_NAME_POOLS[gender]);
      player.avatarUrl = avatarsByGender[gender].pop() || choice(AI_AVATAR_POOLS[gender]);
    }
    return player;
  });

  state = {
    players,
    dayNumber: 1,
    phase: "night_wolf",
    publicLog: [],
    privateLogs: Object.fromEntries(players.map((p) => [p.id, []])),
    eventSeq: 0,
    speeches: [],
    votes: [],
    seerChecks: [],
    night: resetNight(),
    witchState: {
      playerId: getByRoleFrom(players, "witch").id,
      hasAntidote: true,
      hasPoison: true,
    },
    hunterState: {
      playerId: getByRoleFrom(players, "hunter").id,
      hasShot: false,
      pending: false,
      cause: null,
      returnTo: null,
    },
    guardState: {
      playerId: getByRoleFrom(players, "guard").id,
      lastGuardTarget: null,
    },
    sheriffState: {
      enabled: true,
      completed: false,
      sheriffId: null,
      candidates: [],
      pkCandidates: [],
      speechDirection: null,
      speechDirectionDay: null,
      transferFrom: null,
      transferReturn: null,
      badgeDestroyed: false,
    },
    pendingLastWords: [],
    lastWordsReturn: null,
    speechQueue: [],
    pkCandidates: [],
    aiProgress: null,
    winner: null,
    aiProvider: "volcengine-ark",
    actionHint: "身份已发放。点击开始游戏，进入第一夜行动。",
  };

  logPublic(`第 ${state.dayNumber} 夜开始。`);
  for (const wolf of aliveWolves()) {
    logPrivate(wolf.id, `你的狼队友是：${aliveWolves().map((p) => `${p.id}号`).join("、")}。`);
  }
  render();
  $("autoStepBtn").textContent = "开始游戏";
}

function resetNight() {
  return {
    wolfVotes: {},
    wolfKillTarget: null,
    seerTarget: null,
    witchSaveUsedTonight: false,
    witchPoisonTarget: null,
    guardTarget: null,
    deaths: [],
  };
}

function getByRoleFrom(players, role) {
  return players.find((player) => player.role === role);
}

function getPlayer(id) {
  return state.players.find((player) => player.id === Number(id));
}

function alivePlayers() {
  return state.players.filter((player) => player.alive);
}

function aliveIds() {
  return alivePlayers().map((player) => player.id);
}

function aliveWolves() {
  return state.players.filter((player) => player.alive && player.isWolf);
}

function isHumanAlive() {
  return getPlayer(HUMAN_ID).alive;
}

function logPublic(text, extra = {}) {
  state.publicLog.unshift({
    day: state.dayNumber,
    phase: state.phase,
    text,
    order: ++state.eventSeq,
    ...extra,
  });
}

function logPrivate(playerId, text, extra = {}) {
  state.privateLogs[playerId].unshift({
    day: state.dayNumber,
    phase: state.phase,
    text,
    order: ++state.eventSeq,
    ...extra,
  });
}

function publicStateFor(playerId) {
  return {
    dayNumber: state.dayNumber,
    phase: state.phase,
    players: state.players.map((p) => ({
      id: p.id,
      alive: p.alive,
      canSpeak: p.alive,
      canVote: p.alive,
    })),
    speeches: state.speeches,
    votes: state.votes,
    sheriff: {
      enabled: state.sheriffState.enabled,
      completed: state.sheriffState.completed,
      sheriffId: state.sheriffState.sheriffId,
      candidates: state.sheriffState.candidates,
      pkCandidates: state.sheriffState.pkCandidates,
      badgeDestroyed: state.sheriffState.badgeDestroyed,
    },
    publicLog: state.publicLog,
  };
}

function privateStateFor(playerId) {
  const player = getPlayer(playerId);
  const privateState = {
    self: {
      id: player.id,
      role: player.role,
      camp: player.camp,
      alive: player.alive,
    },
    privateLogs: state.privateLogs[playerId],
  };

  if (player.isWolf) {
    privateState.wolfTeammates = state.players
      .filter((p) => p.isWolf)
      .map((p) => p.id);
  }
  if (player.role === "white_wolf_king") {
    privateState.wolfTeammates = state.players.filter((p) => p.isWolf).map((p) => p.id);
  }
  if (player.role === "seer") {
    privateState.seerChecks = state.seerChecks.filter((item) => item.seerId === playerId);
  }
  if (player.role === "witch") {
    privateState.witch = {
      hasAntidote: state.witchState.hasAntidote,
      hasPoison: state.witchState.hasPoison,
      tonightKilled: state.night.wolfKillTarget,
    };
  }
  if (player.role === "hunter") {
    privateState.hunter = {
      hasShot: state.hunterState.hasShot,
      canShoot: state.hunterState.pending,
    };
  }
  if (player.role === "guard") {
    privateState.guard = {
      lastGuardTarget: state.guardState.lastGuardTarget,
      tonightGuarded: state.night.guardTarget,
    };
  }
  return { publicState: publicStateFor(playerId), privateState };
}
