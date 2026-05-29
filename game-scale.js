const GAME_DESIGN_WIDTH = 1366;
const GAME_COMPACT_WIDTH = 900;

let gameScaleFrame = null;
let gameScaleObserver = null;

function scheduleGameScale() {
  if (gameScaleFrame) window.cancelAnimationFrame(gameScaleFrame);
  gameScaleFrame = window.requestAnimationFrame(applyGameScale);
}

function applyGameScale() {
  gameScaleFrame = null;
  const viewport = $("gameViewport");
  const stage = $("gameScaleStage");
  const shell = $("gameShell");
  if (!viewport || !stage || !shell) return;

  const availableWidth = Math.max(320, Math.floor(viewport.clientWidth));
  const compact = availableWidth < GAME_COMPACT_WIDTH;
  const scale = compact ? 1 : Math.min(1, availableWidth / GAME_DESIGN_WIDTH);
  const logicalWidth = compact ? availableWidth : Math.max(availableWidth, GAME_DESIGN_WIDTH);

  viewport.classList.toggle("game-compact-scale", compact);
  viewport.style.setProperty("--game-ui-scale", scale.toFixed(4));
  viewport.style.setProperty("--game-logical-width", `${logicalWidth}px`);
  viewport.style.setProperty("--game-stage-width", `${Math.ceil(logicalWidth * scale)}px`);

  const measuredHeight = shell.scrollHeight || shell.offsetHeight || window.innerHeight;
  viewport.style.setProperty("--game-stage-height", `${Math.ceil(measuredHeight * scale)}px`);
}

function initGameScale() {
  const viewport = $("gameViewport");
  if (!viewport) return;
  if (gameScaleObserver) gameScaleObserver.disconnect();
  if (typeof ResizeObserver === "function") {
    gameScaleObserver = new ResizeObserver(scheduleGameScale);
    gameScaleObserver.observe(viewport);
  }
  window.addEventListener("resize", scheduleGameScale, { passive: true });
  window.addEventListener("orientationchange", scheduleGameScale, { passive: true });
  scheduleGameScale();
}
