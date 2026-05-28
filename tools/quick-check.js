const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const rootFiles = [
  "game-config.js",
  "runtime-config.js",
  "game-voice.js",
  "game-state.js",
  "game-ai.js",
  "game-rules.js",
  "game-render.js",
  "app.js",
  "server.js",
];

const styleFiles = ["styles-base.css", "styles-theme.css", "styles-responsive.css"];

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

for (const file of [...rootFiles, ...styleFiles, "index.html"]) {
  if (!fs.existsSync(file)) fail(`missing ${file}`);
}

for (const file of rootFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) fail(`${file} syntax error: ${result.stderr || result.stdout}`);
}

const index = fs.readFileSync("index.html", "utf8");
for (const file of styleFiles) {
  if (!index.includes(`href="${file}"`)) fail(`index.html does not load ${file}`);
}

const render = fs.readFileSync("game-render.js", "utf8");
if (render.includes("renderModels(") || render.includes("data-model-player")) {
  fail("front-end model editor is still referenced");
}

const sizes = [...rootFiles, ...styleFiles, "index.html"].map((file) => ({
  file,
  kb: Math.round((fs.statSync(file).size / 1024) * 10) / 10,
}));

if (!process.exitCode) {
  console.log(`OK ${sizes.map(({ file, kb }) => `${file}:${kb}KB`).join(" ")}`);
}
