const fs = require("node:fs");
const path = require("node:path");

const sourceRoot = path.resolve(__dirname, "..");
const homepageRoot = process.env.HOMEPAGE_ROOT || "/Users/djangomei/Documents/个人主页";
const targetRoot = path.join(homepageRoot, "werewolf");

const files = [
  "index.html",
  "game-config.js",
  "game-voice.js",
  "game-state.js",
  "game-ai.js",
  "game-rules.js",
  "game-render.js",
  "game-scale.js",
  "game-core.js",
  "app.js",
  "styles.css",
  "styles-base.css",
  "styles-theme.css",
  "styles-responsive.css",
];

function copyFile(relativePath) {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(targetRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDirectory(relativePath) {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(targetRoot, relativePath);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}

function writeRuntimeConfig() {
  const runtimeConfig = `window.AI_WEREWOLF_CONFIG = {
  apiBaseUrl: "https://api.djangomei.com",
  enableRemoteAi: true,
};
`;
  fs.writeFileSync(path.join(targetRoot, "runtime-config.js"), runtimeConfig);
}

fs.mkdirSync(targetRoot, { recursive: true });
for (const file of files) copyFile(file);
copyDirectory("assets");
writeRuntimeConfig();

console.log(`Synced AI Werewolf static files to ${targetRoot}`);
