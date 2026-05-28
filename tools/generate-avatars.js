const fs = require("node:fs");
const path = require("node:path");

const outDir = path.join(__dirname, "..", "assets", "avatars");
fs.mkdirSync(outDir, { recursive: true });

const skin = ["#f2c9a0", "#d7a37a", "#8b5e45", "#c98d62", "#efb47d"];
const hair = ["#2d201b", "#4b2d20", "#6b3f26", "#1f1c1b", "#7d6047"];
const tops = ["#3f7d8c", "#9a3f58", "#d2a044", "#52639f", "#527f58", "#7e4a9b", "#a75d39", "#2f8f83", "#99624d", "#485a75"];
const backgrounds = ["#244b5a", "#5b3444", "#6b5128", "#39476b", "#33594a"];

function avatarSvg(index, gender) {
  const face = skin[index % skin.length];
  const hairColor = hair[(index * 2) % hair.length];
  const top = tops[index % tops.length];
  const bg = backgrounds[index % backgrounds.length];
  const female = gender === "female";
  const hairShape = female
    ? `<path d="M34 42c0-17 12-28 30-28s30 11 30 28v25c-10-9-49-9-60 0z" fill="${hairColor}"/>`
    : `<path d="M35 42c4-18 16-27 31-27 17 0 28 10 31 27-17-8-40-8-62 0z" fill="${hairColor}"/>`;
  const extra = female
    ? `<circle cx="47" cy="56" r="4" fill="#e9a4af"/><circle cx="81" cy="56" r="4" fill="#e9a4af"/>`
    : `<path d="M54 70q10 7 20 0" stroke="${hairColor}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="${bg}"/>
  <circle cx="64" cy="60" r="39" fill="${face}"/>
  ${hairShape}
  <circle cx="50" cy="58" r="4" fill="#171717"/>
  <circle cx="78" cy="58" r="4" fill="#171717"/>
  <path d="M55 78q9 8 18 0" stroke="#7b3f35" stroke-width="4" fill="none" stroke-linecap="round"/>
  ${extra}
  <path d="M25 128c5-26 23-41 39-41s34 15 39 41z" fill="${top}"/>
  <path d="M31 119c18 8 48 8 66 0" stroke="rgba(255,255,255,.25)" stroke-width="5" fill="none"/>
</svg>
`;
}

for (let i = 1; i <= 10; i += 1) {
  fs.writeFileSync(path.join(outDir, `male-${String(i).padStart(2, "0")}.svg`), avatarSvg(i, "male"));
  fs.writeFileSync(path.join(outDir, `female-${String(i).padStart(2, "0")}.svg`), avatarSvg(i + 10, "female"));
}

console.log("generated 20 avatars");
