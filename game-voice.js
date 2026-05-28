const VOICE_KEY = "ai-werewolf-voice-enabled";

const voiceRuntime = {
  enabled: localStorage.getItem(VOICE_KEY) !== "false",
  supported: typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
  voices: [],
  queue: [],
  current: null,
  speaking: false,
};

function initSpeechVoices() {
  if (!voiceRuntime.supported) return;
  const refresh = () => {
    voiceRuntime.voices = window.speechSynthesis.getVoices();
    if (typeof renderVoiceControls === "function") renderVoiceControls();
  };
  refresh();
  window.speechSynthesis.onvoiceschanged = refresh;
}

function createVoiceProfile(playerId) {
  const gender = choice(["male", "female"]);
  return {
    gender,
    pitch: gender === "male" ? 0.72 + Math.random() * 0.22 : 1.02 + Math.random() * 0.22,
    rate: 0.92 + Math.random() * 0.18,
    voiceOffset: Math.floor(Math.random() * 1000) + playerId,
    voiceName: null,
  };
}

function voiceGenderLabel(profile) {
  if (!profile) return "随机音色";
  return profile.gender === "male" ? "男声" : "女声";
}

function getBrowserVoice(profile) {
  if (!voiceRuntime.supported) return null;
  if (!profile) return null;
  const voices = voiceRuntime.voices.length ? voiceRuntime.voices : window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (profile.voiceName) return voices.find((voice) => voice.name === profile.voiceName) || null;

  const zhVoices = voices.filter((voice) => /zh|cmn|yue/i.test(`${voice.lang} ${voice.name}`));
  const pool = zhVoices.length ? zhVoices : voices;
  const femaleWords = ["female", "女", "xiaoxiao", "xiaoyi", "huihui", "yaoyao", "tingting", "hanhan", "mei"];
  const maleWords = ["male", "男", "yunxi", "yunjian", "kangkang", "zhiyu"];
  const words = profile.gender === "male" ? maleWords : femaleWords;
  const genderPool = pool.filter((voice) => words.some((word) => voice.name.toLowerCase().includes(word.toLowerCase())));
  const finalPool = genderPool.length ? genderPool : pool;
  const selected = finalPool[profile.voiceOffset % finalPool.length];
  profile.voiceName = selected.name;
  return selected;
}

function resetVoiceQueue() {
  voiceRuntime.queue = [];
  voiceRuntime.current = null;
  voiceRuntime.speaking = false;
  if (voiceRuntime.supported) window.speechSynthesis.cancel();
  if (typeof renderVoiceControls === "function") renderVoiceControls();
}

function cleanSpeechText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/<[^>]*>/g, "")
    .slice(0, 260);
}

function enqueueAiSpeech(playerId, text, prefix = "发言") {
  if (!voiceRuntime.enabled || !voiceRuntime.supported || !state) return;
  const player = getPlayer(playerId);
  if (!player || player.isHuman) return;
  const speechText = cleanSpeechText(text);
  if (!speechText) return;
  voiceRuntime.queue.push({ playerId, text: speechText, prefix });
  playNextVoice();
  if (typeof renderVoiceControls === "function") renderVoiceControls();
}

function isVoiceBlockingProgress() {
  return voiceRuntime.enabled && voiceRuntime.supported && (voiceRuntime.speaking || voiceRuntime.queue.length > 0);
}

function playNextVoice() {
  if (!voiceRuntime.enabled || !voiceRuntime.supported || voiceRuntime.speaking || !voiceRuntime.queue.length) return;
  const item = voiceRuntime.queue.shift();
  const player = getPlayer(item.playerId);
  if (!player) return;
  const utterance = new SpeechSynthesisUtterance(`${item.playerId}号玩家${item.prefix}。${item.text}`);
  utterance.lang = "zh-CN";
  utterance.pitch = player.voiceProfile?.pitch || 1;
  utterance.rate = player.voiceProfile?.rate || 1;
  utterance.voice = getBrowserVoice(player.voiceProfile);
  voiceRuntime.current = item;
  voiceRuntime.speaking = true;
  utterance.onend = finishCurrentVoice;
  utterance.onerror = finishCurrentVoice;
  window.speechSynthesis.speak(utterance);
  if (typeof renderVoiceControls === "function") renderVoiceControls();
}

function finishCurrentVoice() {
  voiceRuntime.current = null;
  voiceRuntime.speaking = false;
  if (typeof renderVoiceControls === "function") renderVoiceControls();
  window.setTimeout(playNextVoice, 120);
}

function toggleVoiceEnabled() {
  voiceRuntime.enabled = !voiceRuntime.enabled;
  localStorage.setItem(VOICE_KEY, String(voiceRuntime.enabled));
  if (!voiceRuntime.enabled) {
    voiceRuntime.queue = [];
    voiceRuntime.current = null;
    voiceRuntime.speaking = false;
    if (voiceRuntime.supported) window.speechSynthesis.cancel();
  } else {
    playNextVoice();
  }
  renderVoiceControls();
}

function skipCurrentVoice() {
  if (!voiceRuntime.supported) return;
  voiceRuntime.queue = [];
  window.speechSynthesis.cancel();
  voiceRuntime.current = null;
  voiceRuntime.speaking = false;
  window.setTimeout(runUntilHumanTurn, 120);
  renderVoiceControls();
}
