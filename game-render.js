function render() {
  renderStatus();
  renderPlayers();
  renderIdentityCard();
  renderSkillPanel();
  renderPhase();
  renderVoiceControls();
  renderActions();
  renderLogs();
  if (typeof scheduleGameScale === "function") scheduleGameScale();
}

function roleArtFor(player, visible = true) {
  return ROLE_ART[visible ? player.role : "hidden"];
}

function renderStatus() {
  const alive = alivePlayers();
  $("statusStrip").innerHTML = [
    ["阶段", PHASE_LABELS[state.phase]],
    ["轮次", `第 ${state.dayNumber} 天`],
    ["存活", `${alive.length}/${PLAYER_COUNT}`],
    ["板子配置", "4狼 · 4民 · 4神"],
    ["警徽", state.sheriffState.sheriffId ? `${state.sheriffState.sheriffId}号警长` : state.sheriffState.completed ? "无警长" : "待竞选"],
  ]
    .map(([label, value]) => `<div class="status-item"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
  $("aliveCount").textContent = `${alive.length} 人存活`;
}

function renderPlayers() {
  const grid = $("playersGrid");
  const template = $("playerCardTemplate");
  grid.innerHTML = "";
  for (const player of state.players) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.add(`seat-${player.id}`);
    const side = player.id <= PLAYER_COUNT / 2 ? "left" : "right";
    const slot = side === "left" ? player.id - 1 : PLAYER_COUNT - player.id;
    const y = 10 + slot * 16;
    node.classList.add(`seat-${side}`);
    node.style.setProperty("--seat-x", side === "left" ? "23%" : "77%");
    node.style.setProperty("--seat-y", `${y}%`);
    node.classList.toggle("human", player.isHuman);
    node.classList.toggle("dead", !player.alive);
    node.classList.toggle("known-wolf", getPlayer(HUMAN_ID).isWolf && player.isWolf && player.id !== HUMAN_ID);
    if (state.winner) node.classList.add("winner");
    node.querySelector(".player-id").textContent = `#${player.id}${player.isHuman ? " · 你" : ""}`;
    node.querySelector(".player-name").textContent = player.isHuman ? "" : player.displayName || "";
    node.querySelector(".player-state").textContent = player.alive ? "存活" : "出局";
    const knownWolfTeammate = getPlayer(HUMAN_ID).isWolf && player.isWolf && player.id !== HUMAN_ID;
    const roleVisible = state.winner || player.isHuman || knownWolfTeammate;
    const visibleRole = roleVisible ? ROLES[player.role] : "身份隐藏";
    const tagClass = roleVisible ? player.camp : "hidden";
    const art = roleArtFor(player, roleVisible);
    const avatar = node.querySelector(".player-avatar");
    if (player.avatarUrl) {
      avatar.className = "player-avatar portrait";
      avatar.innerHTML = `<img src="${escapeHtml(player.avatarUrl)}" alt="${escapeHtml(player.displayName || `${player.id}号`)}头像">`;
    } else {
      avatar.textContent = art.glyph;
      avatar.className = `player-avatar ${roleVisible ? player.role : "hidden"}`;
    }
    node.querySelector(".player-meta").innerHTML = `<span class="tag ${tagClass}">${visibleRole}</span>`;
    const notes = [];
    if (state.sheriffState.sheriffId === player.id) notes.push("警长 · 警徽票 1.5");
    if (!player.alive && player.deathReason) notes.push(`死因：${state.winner ? player.deathReason.join(" + ") : "未公开"}`);
    if (player.role === "witch" && (state.winner || player.isHuman)) {
      notes.push(`解药${state.witchState.hasAntidote ? "可用" : "已用"} · 毒药${state.witchState.hasPoison ? "可用" : "已用"}`);
    }
    node.querySelector(".player-note").textContent = notes.join("｜");
    grid.appendChild(node);
  }
}

function playerDisplayName(playerOrId) {
  const player = typeof playerOrId === "number" ? getPlayer(playerOrId) : playerOrId;
  if (!player) return "未知玩家";
  return `${player.id}号${player.isHuman ? " · 你" : player.displayName ? ` · ${player.displayName}` : ""}`;
}

function renderIdentityCard() {
  const human = getPlayer(HUMAN_ID);
  const art = roleArtFor(human, true);
  $("identityCard").className = `identity-card role-${human.role}`;
  $("identityCard").innerHTML = `
    <div class="card-rune ${human.role}">${art.glyph}</div>
    <div class="card-copy">
      <span class="card-kicker">你的身份卡</span>
      <h2>${art.title}</h2>
      <p>${art.subtitle}</p>
      <blockquote>${art.quote}</blockquote>
    </div>
  `;
}

function skillButton(label, hint, active = false, spent = false) {
  return `
    <div class="skill-button ${active ? "active" : ""} ${spent ? "spent" : ""}">
      <strong>${label}</strong>
      <span>${hint}</span>
    </div>
  `;
}

function renderSkillPanel() {
  const human = getPlayer(HUMAN_ID);
  const isTurn = isHumanTurn();
  let skills = "";
  if (human.role === "seer") {
    skills = skillButton("查验", "每晚查一名玩家阵营", state.phase === "night_seer" && isTurn);
  } else if (human.role === "witch") {
    skills = [
      skillButton("解药", state.witchState.hasAntidote ? "救今晚刀口" : "已经使用", state.phase === "night_witch" && state.witchState.hasAntidote, !state.witchState.hasAntidote),
      skillButton("毒药", state.witchState.hasPoison ? "毒一名存活玩家" : "已经使用", state.phase === "night_witch" && state.witchState.hasPoison, !state.witchState.hasPoison),
      skillButton("不用药", "保留药品进入天亮", state.phase === "night_witch"),
    ].join("");
  } else if (human.role === "hunter") {
    skills = skillButton("开枪", state.hunterState.hasShot ? "已经开枪" : "死亡时可发动", state.phase === "hunter_shot" && isTurn, state.hunterState.hasShot);
  } else if (human.role === "guard") {
    skills = skillButton("守护", state.guardState.lastGuardTarget ? `上夜守护 ${state.guardState.lastGuardTarget}号` : "每夜守护一名玩家", state.phase === "night_guard" && isTurn);
  } else if (human.isWolf) {
    skills = [
      skillButton("夜刀", "夜晚由狼队协商目标", state.phase === "night_wolf"),
      human.role === "white_wolf_king" ? skillButton("自爆", "白天可自爆并带走一名玩家", isWhiteWolfSuicidePhase()) : "",
      skillButton("伪装", "白天隐藏身份争取抗推", state.phase === "day_speech" && isTurn),
    ].join("");
  } else {
    skills = [
      skillButton("发言", "用逻辑和票型找狼", state.phase === "day_speech" && isTurn),
      skillButton("投票", "白天放逐可疑玩家", state.phase === "day_vote" && isTurn),
    ].join("");
  }
  $("skillPanel").innerHTML = `
    <div class="skill-title">技能盘</div>
    <div class="skill-grid">${skills}</div>
  `;
}

function renderPhase() {
  const human = getPlayer(HUMAN_ID);
  const privateLog = state.privateLogs[HUMAN_ID].slice(0, 4).map((item) => item.text);
  $("phaseCard").innerHTML = `
    <h2>${PHASE_LABELS[state.phase]}</h2>
    <p>${state.actionHint || ""}</p>
    <p>你的身份：<strong>${ROLES[human.role]}</strong> · ${CAMPS[human.camp]}${human.alive ? "" : " · 已出局"}</p>
    ${privateLog.length ? `<p>你的私密信息：${privateLog.join(" / ")}</p>` : ""}
  `;
}

function renderVoiceControls() {
  const box = $("voicePanel");
  if (!box) return;
  box.innerHTML = "";
  if (!voiceRuntime.supported) {
    box.innerHTML = `<div class="voice-head"><strong>AI 语音</strong><span>当前浏览器不支持语音朗读</span></div>`;
    return;
  }

  const current = voiceRuntime.current;
  const status = current
    ? "AI 玩家语音播放中"
    : voiceRuntime.queue.length
      ? `队列中 ${voiceRuntime.queue.length} 条`
      : "等待 AI 发言";

  const head = document.createElement("div");
  head.className = "voice-head";
  const title = document.createElement("strong");
  title.textContent = "AI 语音";
  const info = document.createElement("span");
  info.textContent = voiceRuntime.enabled ? status : "已关闭";
  head.append(title, info);

  const controls = document.createElement("div");
  controls.className = "button-row voice-actions";
  const toggle = button(voiceRuntime.enabled ? "关闭语音" : "开启语音", toggleVoiceEnabled);
  const skip = button("跳过语音", skipCurrentVoice);
  skip.disabled = !voiceRuntime.current && !voiceRuntime.queue.length;
  controls.append(toggle, skip);
  box.append(head, controls);
}

function renderActions() {
  const panel = $("actionPanel");
  panel.innerHTML = "";

  if (state.phase === "ended") {
    panel.innerHTML = `<div class="form-row"><strong>${CAMPS[state.winner]}获胜</strong><span>身份已在玩家席位公开。</span></div>`;
    return;
  }

  appendWhiteWolfSuicideControl(panel);

  if (state.phase === "night_wolf" && getPlayer(HUMAN_ID).isWolf && isHumanAlive() && Object.keys(state.night.wolfVotes).length) {
    const wolfAdvice = Object.entries(state.night.wolfVotes)
      .filter(([wolfId]) => Number(wolfId) !== HUMAN_ID)
      .map(([wolfId, targetId]) => `${wolfId}号建议刀 ${targetId}号`)
      .join("，") || "等待狼队意见";
    const legalTargets = aliveIds().filter((id) => id !== HUMAN_ID);
    const form = targetForm("选择狼队刀口", legalTargets, "确认刀人", (targetId) => {
      submitHumanWolfKill(targetId);
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    });
    const advice = document.createElement("div");
    advice.className = "wolf-advice";
    advice.textContent = wolfAdvice;
    form.appendChild(advice);
    panel.appendChild(form);
    return;
  }

  if (state.phase === "night_seer" && getByRoleFrom(state.players, "seer").isHuman && isHumanAlive()) {
    panel.appendChild(targetForm("选择查验对象", aliveIds().filter((id) => id !== HUMAN_ID), "查验", (targetId) => {
      doSeerCheck(targetId);
      state.phase = "night_witch";
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    }));
    return;
  }

  if (state.phase === "night_witch" && getByRoleFrom(state.players, "witch").isHuman && isHumanAlive()) {
    const killed = state.night.wolfKillTarget;
    const canSave = state.witchState.hasAntidote && killed && killed !== HUMAN_ID;
    const canPoison = state.witchState.hasPoison;
    const wrap = document.createElement("div");
    wrap.className = "form-row";
    wrap.innerHTML = `<strong>今晚刀口：${killed ? `${killed}号` : "无"}</strong>`;
    const buttons = document.createElement("div");
    buttons.className = "button-row";
    const saveBtn = button("使用解药", () => {
      doWitchAction({ type: "save" });
      state.phase = "night_guard";
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    });
    saveBtn.disabled = !canSave;
    const poisonSelect = select(aliveIds().filter((id) => id !== HUMAN_ID));
    const poisonBtn = button("使用毒药", () => {
      doWitchAction({ type: "poison", targetId: Number(poisonSelect.value) });
      state.phase = "night_guard";
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    });
    poisonBtn.disabled = !canPoison;
    const noneBtn = button("不用药", () => {
      doWitchAction({ type: "none" });
      state.phase = "night_guard";
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    });
    buttons.append(saveBtn, poisonSelect, poisonBtn, noneBtn);
    wrap.appendChild(buttons);
    panel.appendChild(wrap);
    return;
  }

  if (state.phase === "night_guard" && getByRoleFrom(state.players, "guard").isHuman && isHumanAlive()) {
    const legalTargets = aliveIds().filter((id) => id !== state.guardState.lastGuardTarget);
    panel.appendChild(targetForm("选择守护对象", legalTargets.length ? legalTargets : aliveIds(), "确认守护", (targetId) => {
      doGuardAction(targetId);
      state.phase = "night_resolve";
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    }));
    return;
  }

  if (state.phase === "sheriff_join" && isHumanAlive()) {
    const join = button("上警竞选", () => {
      finalizeSheriffCandidates(true);
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    });
    const pass = button("不上警", () => {
      finalizeSheriffCandidates(false);
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    });
    const row = document.createElement("div");
    row.className = "button-row";
    row.append(join, pass);
    panel.append(formBlock("警长竞选", document.createTextNode("首日可选择是否上警。警长投票按 1.5 票计算。"), row));
    return;
  }

  if ((state.phase === "sheriff_speech" || state.phase === "sheriff_pk_speech" || state.phase === "day_speech" || state.phase === "pk_speech") && state.speechQueue[0] === HUMAN_ID) {
    const area = document.createElement("textarea");
    const isSheriffSpeech = state.phase === "sheriff_speech" || state.phase === "sheriff_pk_speech";
    area.placeholder = isSheriffSpeech ? "输入你的警上发言..." : "输入你的发言...";
    const submit = button("发表", () => {
      const text = area.value.trim() || (isSheriffSpeech ? "我参与警长竞选，请大家结合后续发言判断。" : "我先过，听后置位发言。");
      completeSpeech(HUMAN_ID, text, state.phase === "pk_speech" || state.phase === "sheriff_pk_speech");
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    });
    panel.append(formBlock(isSheriffSpeech ? "轮到你警上发言" : "轮到你发言", area, submit));
    return;
  }

  if (state.phase === "sheriff_vote" && isHumanAlive() && !state.sheriffState.candidates.includes(HUMAN_ID)) {
    panel.appendChild(targetForm("选择警长投票", state.sheriffState.candidates, "投票", async (targetId) => {
      await resolveSheriffVoteRound("first", targetId);
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    }));
    return;
  }

  if (state.phase === "sheriff_pk_vote" && isHumanAlive() && !state.sheriffState.pkCandidates.includes(HUMAN_ID)) {
    panel.appendChild(targetForm("选择警徽 PK 投票", state.sheriffState.pkCandidates, "投票", async (targetId) => {
      await resolveSheriffVoteRound("pk", targetId);
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    }));
    return;
  }

  if (state.phase === "sheriff_direction" && state.sheriffState.sheriffId === HUMAN_ID) {
    const left = button("左手边开始", () => {
      chooseSheriffSpeechDirection("left_clockwise");
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    });
    const right = button("右手边开始", () => {
      chooseSheriffSpeechDirection("right_counterclockwise");
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    });
    const row = document.createElement("div");
    row.className = "button-row";
    row.append(left, right);
    panel.append(formBlock("选择发言顺序", document.createTextNode("警长自己会最后发言总结。"), row));
    return;
  }

  if (state.phase === "sheriff_transfer" && state.sheriffState.transferFrom === HUMAN_ID) {
    panel.appendChild(targetForm("移交警徽", aliveIds(), "移交", (targetId) => {
      finishSheriffTransfer(targetId);
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    }, true, "撕毁警徽"));
    return;
  }

  if (state.phase === "day_vote" && isHumanAlive()) {
    panel.appendChild(targetForm("选择放逐投票", aliveIds().filter((id) => id !== HUMAN_ID), "投票", async (targetId) => {
      await resolveVoteRound("first", targetId);
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    }, true));
    return;
  }

  if (state.phase === "pk_vote" && isHumanAlive() && !state.pkCandidates.includes(HUMAN_ID)) {
    panel.appendChild(targetForm("选择 PK 投票", state.pkCandidates, "投票", async (targetId) => {
      await resolveVoteRound("pk", targetId);
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    }));
    return;
  }

  if (state.phase === "last_words" && state.pendingLastWords[0] === HUMAN_ID) {
    const area = document.createElement("textarea");
    area.placeholder = "输入遗言...";
    const submit = button("发表遗言", () => {
      completeLastWords(HUMAN_ID, area.value.trim() || "遗言结束。");
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    });
    panel.append(formBlock("你的遗言", area, submit));
    return;
  }

  if (state.phase === "hunter_shot" && getPlayer(state.hunterState.playerId).isHuman) {
    panel.appendChild(targetForm("猎人是否开枪", aliveIds(), "开枪", (targetId) => {
      hunterShoot(targetId);
      render();
      window.setTimeout(runUntilHumanTurn, 120);
    }, true, "不开枪"));
    return;
  }

  const startLabel = isOpeningWait() ? "开始第一夜" : "推进一步";
  const startAction = isOpeningWait() ? runUntilHumanTurn : stepAi;
  const next = button(startLabel, startAction);
  panel.append(formBlock(isOpeningWait() ? "准备开始" : "等待系统或 AI 行动", document.createTextNode(state.actionHint || "点击推进。"), next));
}

function appendWhiteWolfSuicideControl(panel) {
  const human = getPlayer(HUMAN_ID);
  if (human.role !== "white_wolf_king" || !human.alive || !isWhiteWolfSuicidePhase()) return;
  const legalTargets = aliveIds().filter((id) => id !== HUMAN_ID);
  if (!legalTargets.length) return;
  panel.appendChild(targetForm("白狼王自爆", legalTargets, "自爆带走", (targetId) => {
    whiteWolfSuicide(targetId);
    render();
    window.setTimeout(runUntilHumanTurn, 120);
  }));
}

function formBlock(title, content, action) {
  const block = document.createElement("div");
  block.className = "form-row";
  const label = document.createElement("strong");
  label.textContent = title;
  block.append(label, content, action);
  return block;
}

function button(text, onClick) {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}

function select(ids) {
  const el = document.createElement("select");
  for (const id of ids) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${id}号`;
    el.appendChild(option);
  }
  return el;
}

function targetForm(title, ids, actionText, onSubmit, allowAbstain = false, abstainText = "弃票") {
  const wrap = document.createElement("div");
  wrap.className = "form-row";
  const label = document.createElement("strong");
  label.textContent = title;
  const row = document.createElement("div");
  row.className = "button-row";
  const targetSelect = select(ids);
  const submit = button(actionText, () => onSubmit(Number(targetSelect.value)));
  row.append(targetSelect, submit);
  if (allowAbstain) {
    row.appendChild(button(abstainText, () => onSubmit(null)));
  }
  wrap.append(label, row);
  return wrap;
}

function renderLogs() {
  $("speechOrder").textContent = state.speechQueue.length
    ? `当前：${state.speechQueue[0]}号`
    : "暂无队列";
  $("speechLog").innerHTML =
    state.speeches
      .map(
        (speech) =>
          `<div class="speech-entry">
            <div class="speech-avatar">${speechAvatarHtml(speech.playerId)}</div>
            <div class="speech-body">
              <strong>第${speech.day}天 ${escapeHtml(playerDisplayName(speech.playerId))}</strong>
              <p>${escapeHtml(speech.text)}</p>
            </div>
          </div>`,
      )
      .join("") || `<div class="speech-entry speech-empty">暂无公开发言。</div>`;

  const voteCards = renderVoteCards();
  const logEntries = renderEventLogEntries();
  $("publicLog").innerHTML = `${voteCards}${logEntries}`;
}

function renderEventLogEntries() {
  const publicItems = state.publicLog.map((item) => ({ ...item, private: false }));
  const privateItems = getWolfPrivateLogItems();
  return [...publicItems, ...privateItems]
    .sort((a, b) => (b.order || 0) - (a.order || 0))
    .map((item) => item.kind === "wolf_kill" ? renderWolfKnifeCard(item) : renderTextLogEntry(item))
    .join("");
}

function getWolfPrivateLogItems() {
  const human = getPlayer(HUMAN_ID);
  if (!human?.isWolf) return [];
  return state.privateLogs[HUMAN_ID]
    .filter((item) => item.kind === "wolf_kill" || item.text.includes("最终刀口") || item.text.includes("狼队夜间意见"))
    .map((item) => ({ ...item, private: true }));
}

function renderTextLogEntry(item) {
  const label = item.private ? `仅你可见 · 第${item.day}天` : `第${item.day}天`;
  const cls = item.private ? "log-entry private-log-entry" : "log-entry";
  return `<div class="${cls}"><strong>${label}</strong><br>${escapeHtml(item.text)}</div>`;
}

function renderWolfKnifeCard(item) {
  const votes = Object.entries(item.wolfVotes || {}).map(([wolfId, targetId]) => ({
    voterId: Number(wolfId),
    targetId: Number(targetId),
    weight: 1,
  }));
  const finalTarget = item.finalTarget ? Number(item.finalTarget) : null;
  if (!votes.length) return renderTextLogEntry(item);
  const totals = new Map();
  for (const vote of votes) totals.set(vote.targetId, (totals.get(vote.targetId) || 0) + 1);
  const max = Math.max(...totals.values(), 1);
  const bars = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([target, count]) => `
      <div class="vote-bar ${target === finalTarget ? "final-target" : ""}">
        <span>${escapeHtml(playerDisplayName(target))}${target === finalTarget ? " · 最终刀口" : ""}</span>
        <div class="vote-track"><i style="width:${Math.max(8, (count / max) * 100)}%"></i></div>
        <strong>${count}</strong>
      </div>
    `)
    .join("");
  const chips = votes
    .map((vote) => `<span class="vote-chip wolf-chip">${escapeHtml(playerDisplayName(vote.voterId))} → ${escapeHtml(playerDisplayName(vote.targetId))}</span>`)
    .join("");
  return `
    <section class="vote-card wolf-knife-card">
      <div class="vote-card-title"><strong>仅你可见 · 第${item.day}天 · 狼队刀口</strong><span>${finalTarget ? `最终：${finalTarget}号` : "待定"}</span></div>
      <div class="vote-bars">${bars}</div>
      <div class="vote-chips">${chips}</div>
    </section>
  `;
}

function renderVoteCards() {
  const groups = new Map();
  for (const vote of state.votes) {
    const key = `${vote.day}:${vote.round}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(vote);
  }
  return [...groups.entries()]
    .map(([, votes]) => renderVoteCard(votes))
    .join("");
}

function renderVoteCard(votes) {
  if (!votes.length) return "";
  const label = voteRoundLabel(votes[0].round);
  const totals = new Map();
  for (const vote of votes) {
    const target = vote.targetId || "abstain";
    totals.set(target, (totals.get(target) || 0) + (vote.weight || 1));
  }
  const max = Math.max(...totals.values(), 1);
  const bars = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([target, count]) => {
      const targetLabel = target === "abstain" ? "弃票" : playerDisplayName(Number(target));
      return `
        <div class="vote-bar ${target === "abstain" ? "abstain" : ""}">
          <span>${escapeHtml(targetLabel)}</span>
          <div class="vote-track"><i style="width:${Math.max(8, (count / max) * 100)}%"></i></div>
          <strong>${count}</strong>
        </div>
      `;
    })
    .join("");
  const chips = votes
    .map((vote) => {
      const target = vote.targetId ? playerDisplayName(vote.targetId) : "弃票";
      const weight = vote.weight === 1.5 ? " · 1.5票" : "";
      return `<span class="vote-chip ${vote.targetId ? "" : "abstain"}">${escapeHtml(playerDisplayName(vote.voterId))} → ${escapeHtml(target)}${weight}</span>`;
    })
    .join("");
  return `
    <section class="vote-card">
      <div class="vote-card-title"><strong>第${votes[0].day}天 · ${label}</strong><span>${votes.length} 人投票</span></div>
      <div class="vote-bars">${bars}</div>
      <div class="vote-chips">${chips}</div>
    </section>
  `;
}

function speechAvatarHtml(playerId) {
  const player = getPlayer(playerId);
  if (!player) return "";
  if (player.avatarUrl) {
    return `<img src="${escapeHtml(player.avatarUrl)}" alt="${escapeHtml(player.displayName || `${player.id}号`)}头像">`;
  }
  return `<span>#${player.id}</span>`;
}

function voteRoundLabel(round) {
  const labels = {
    first: "放逐投票",
    pk: "PK 投票",
    sheriff_first: "警长竞选投票",
    sheriff_pk: "警徽 PK 投票",
  };
  return labels[round] || round;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stopAuto() {
  if (autoTimer) window.clearInterval(autoTimer);
  autoTimer = null;
  $("autoStepBtn").textContent = "继续自动";
}

function toggleAuto() {
  if (autoTimer) {
    stopAuto();
    return;
  }
  runUntilHumanTurn();
}

function resetOpeningScreen() {
  stopAuto();
  clearAiProgress();
  document.body.classList.remove("game-ready");
  const drawStage = $("drawStage");
  const startButton = $("startGameBtn");
  if (drawStage) drawStage.className = "draw-stage";
  if (startButton) {
    startButton.disabled = false;
    startButton.textContent = "开始游戏";
  }
}

function renderDrawCardFace() {
  const human = getPlayer(HUMAN_ID);
  const art = roleArtFor(human, true);
  $("drawCardFace").innerHTML = `
    <div class="draw-role">
      <div class="card-rune ${human.role}">${art.glyph}</div>
      <strong>${art.title}</strong>
      <span>${ROLES[human.role]} · ${CAMPS[human.camp]}</span>
    </div>
  `;
}

function beginOpeningDraw() {
  const startButton = $("startGameBtn");
  const drawStage = $("drawStage");
  startButton.disabled = true;
  startButton.textContent = "洗牌中...";
  newGame();
  renderDrawCardFace();
  drawStage.classList.add("drawing");
  window.setTimeout(() => {
    drawStage.classList.add("revealed");
    startButton.textContent = "进入牌桌";
  }, 900);
  window.setTimeout(() => {
    document.body.classList.add("game-ready");
    startButton.disabled = false;
    if (typeof scheduleGameScale === "function") scheduleGameScale();
  }, 1900);
}

function initGameApp() {
  document.body.classList.remove("game-ready");
  if (typeof initGameScale === "function") initGameScale();
  initSpeechVoices();
  $("startGameBtn").addEventListener("click", beginOpeningDraw);
  $("newGameBtn").addEventListener("click", resetOpeningScreen);
  $("autoStepBtn").addEventListener("click", toggleAuto);
}
