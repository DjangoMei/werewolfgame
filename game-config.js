const ROLES = {
  werewolf: "狼人",
  white_wolf_king: "白狼王",
  villager: "平民",
  seer: "预言家",
  witch: "女巫",
  hunter: "猎人",
  guard: "守卫",
};

const CAMPS = {
  good: "好人阵营",
  werewolf: "狼人阵营",
};

const ROLE_ART = {
  werewolf: {
    glyph: "狼",
    title: "暗夜狼人",
    subtitle: "潜伏、协商、夜间击杀",
    quote: "藏进人群，等待月亮。",
  },
  white_wolf_king: {
    glyph: "王",
    title: "白狼王",
    subtitle: "狼人阵营核心，参与夜刀",
    quote: "王冠藏在獠牙之后。",
  },
  villager: {
    glyph: "民",
    title: "无畏平民",
    subtitle: "观察发言、票出狼人",
    quote: "没有技能，也没有退路。",
  },
  seer: {
    glyph: "预",
    title: "星象预言家",
    subtitle: "每夜查验一名玩家阵营",
    quote: "真相会在天亮前显影。",
  },
  witch: {
    glyph: "巫",
    title: "秘药女巫",
    subtitle: "一瓶解药，一瓶毒药",
    quote: "生与死，都在瓶口摇晃。",
  },
  hunter: {
    glyph: "猎",
    title: "银弹猎人",
    subtitle: "死亡时可带走一人",
    quote: "最后一枪，留给最像狼的人。",
  },
  guard: {
    glyph: "守",
    title: "长夜守卫",
    subtitle: "每夜守护一名玩家",
    quote: "在门外站到天亮。",
  },
  hidden: {
    glyph: "?",
    title: "身份未明",
    subtitle: "等待发言与票型揭开面具",
    quote: "每个人都可能在说谎。",
  },
};

const PHASE_LABELS = {
  night_wolf: "夜晚 · 狼人行动",
  night_seer: "夜晚 · 预言家行动",
  night_witch: "夜晚 · 女巫行动",
  night_guard: "夜晚 · 守卫行动",
  night_resolve: "天亮 · 死亡结算",
  sheriff_join: "警徽 · 上警报名",
  sheriff_speech: "警徽 · 警上发言",
  sheriff_vote: "警徽 · 警下投票",
  sheriff_pk_speech: "警徽 · PK 发言",
  sheriff_pk_vote: "警徽 · PK 投票",
  sheriff_direction: "警长 · 选择发言顺序",
  sheriff_transfer: "警徽 · 移交或撕毁",
  last_words: "遗言",
  day_speech: "白天 · 发言",
  pk_speech: "白天 · PK 发言",
  day_vote: "白天 · 投票放逐",
  pk_vote: "白天 · PK 投票",
  hunter_shot: "猎人开枪",
  ended: "游戏结束",
};

let HUMAN_ID = 1;
const MODEL_KEY = "ai-werewolf-models";
const DEFAULT_AI_MODEL = "deepseek-v3-2-251201";
const PLAYER_COUNT = 12;
const TABLE_CLOCKWISE_ORDER = [1, 2, 3, 4, 5, 6, 12, 11, 10, 9, 8, 7];

const AI_NAME_POOLS = {
  male: ["阿川", "老周", "小北", "林舟", "阿澈", "江野", "南风", "小满", "陆青", "星河", "阿默", "沈岚"],
  female: ["小鹿", "阿梨", "星眠", "青柠", "南栀", "月白", "小满", "云朵", "知夏", "阿棠", "苏禾", "林晚"],
};

const AI_AVATAR_POOLS = {
  male: Array.from({ length: 10 }, (_, index) => `assets/avatars/male-${String(index + 1).padStart(2, "0")}.svg`),
  female: Array.from({ length: 10 }, (_, index) => `assets/avatars/female-${String(index + 1).padStart(2, "0")}.svg`),
};

let state = null;
let autoTimer = null;
let stepping = false;
let progressTimer = null;

const $ = (id) => document.getElementById(id);

function shuffle(items) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function choice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function isWolfRole(role) {
  return role === "werewolf" || role === "white_wolf_king";
}

function createPlayer(id, role) {
  const camp = isWolfRole(role) ? "werewolf" : "good";
  return {
    id,
    role,
    camp,
    alive: true,
    deathReason: null,
    hasLastWords: false,
    canVote: true,
    canSpeak: true,
    isWolf: isWolfRole(role),
    isVillager: role === "villager",
    isGod: ["seer", "witch", "hunter", "guard"].includes(role),
    isHuman: id === HUMAN_ID,
    aiModel: id === HUMAN_ID ? "human" : DEFAULT_AI_MODEL,
    displayName: id === HUMAN_ID ? "你" : "",
    avatarUrl: null,
  };
}
