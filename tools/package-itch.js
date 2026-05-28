const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const outputName = "ai-werewolf-itch-safe.zip";
const outputPath = path.join(root, outputName);
const localizedOutputName = "AI狼人杀-itch-safe.zip";
const localizedOutputPath = path.join(root, localizedOutputName);

const staticFiles = [
  "index.html",
  "runtime-config.js",
  "game-config.js",
  "game-voice.js",
  "game-state.js",
  "game-ai.js",
  "game-rules.js",
  "game-render.js",
  "game-core.js",
  "app.js",
  "styles.css",
  "styles-base.css",
  "styles-theme.css",
  "styles-responsive.css",
  "ITCH_README.md",
  "配置.md",
];

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let j = 0; j < 8; j += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let value = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    value = crcTable[(value ^ buffer[i]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { dosDate, dosTime };
}

function collectFiles(dir, prefix) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const entryName = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, entryName));
    } else if (entry.isFile()) {
      files.push({ fullPath, entryName });
    }
  }
  return files;
}

const files = staticFiles
  .map((entryName) => ({ fullPath: path.join(root, entryName), entryName }))
  .filter((file) => fs.existsSync(file.fullPath));

files.push(...collectFiles(path.join(root, "assets"), "assets"));

const localParts = [];
const centralParts = [];
let offset = 0;

for (const file of files) {
  const source = fs.readFileSync(file.fullPath);
  const compressed = zlib.deflateRawSync(source, { level: 9 });
  const nameBuffer = Buffer.from(file.entryName, "utf8");
  const stats = fs.statSync(file.fullPath);
  const { dosDate, dosTime } = dosDateTime(stats.mtime);
  const checksum = crc32(source);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt16LE(dosTime, 10);
  localHeader.writeUInt16LE(dosDate, 12);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(source.length, 22);
  localHeader.writeUInt16LE(nameBuffer.length, 26);
  localHeader.writeUInt16LE(0, 28);

  localParts.push(localHeader, nameBuffer, compressed);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(dosTime, 12);
  centralHeader.writeUInt16LE(dosDate, 14);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(source.length, 24);
  centralHeader.writeUInt16LE(nameBuffer.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(offset, 42);

  centralParts.push(centralHeader, nameBuffer);
  offset += localHeader.length + nameBuffer.length + compressed.length;
}

const centralDirectory = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

fs.writeFileSync(outputPath, Buffer.concat([...localParts, centralDirectory, end]));
fs.copyFileSync(outputPath, localizedOutputPath);

console.log(`${outputName} ${fs.statSync(outputPath).size} bytes`);
console.log(`${localizedOutputName} ${fs.statSync(localizedOutputPath).size} bytes`);
console.log(`entries ${files.length}`);
