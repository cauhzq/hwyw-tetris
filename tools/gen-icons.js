// 用 Node 原生 zlib 生成 PNG 图标，无需任何图片库或外部依赖
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'icons');
const RES = path.join(__dirname, '..', 'apk-build', 'app', 'res', 'drawable');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(RES, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function makePNG(size, draw) {
  const w = size, h = size;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0;
    for (let x = 0; x < w; x++) {
      const px = draw(x, y, w, h);
      raw[p++] = px[0]; raw[p++] = px[1]; raw[p++] = px[2]; raw[p++] = px[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))
  ]);
}

// 在 4x4 逻辑格子里画一个 T 形四连块（4 种颜色），其余为透明/背景
// cells: 数组 [{x,y,color:[r,g,b]}]
function tetrisDraw(bg, cells, pad, roundBg) {
  return (x, y, w, h) => {
    // round launcher 背景：圆角方块
    if (roundBg) {
      const m = w * 0.16;
      const d = Math.hypot(x - w / 2, y - h / 2);
      if (d > w / 2 - 1) return [0, 0, 0, 0];
    }
    const g = w / 4;
    const gx = Math.floor(x / g), gy = Math.floor(y / g);
    for (const c of cells) {
      if (c.x === gx && c.y === gy) {
        const [r, gg, b] = c.color;
        const px = (x % g), py = (y % g);
        // 高光
        if (px < g * 0.18 || py < g * 0.18) return [Math.min(255, r + 60), Math.min(255, gg + 60), Math.min(255, b + 60), 255];
        return [r, gg, b, 255];
      }
    }
    return bg;
  };
}

const T = [
  { x: 1, y: 0, color: [199, 121, 255] }, // 紫
  { x: 0, y: 1, color: [94, 224, 138] },  // 绿
  { x: 1, y: 1, color: [76, 212, 255] },  // 青
  { x: 2, y: 1, color: [255, 159, 77] }   // 橙
];
const BG = [11, 16, 32, 255];        // 不透明深蓝（PWA）
const BGT = [11, 16, 32, 0];          // 透明（maskable 安全区外）

const targets = [
  { file: 'icon-192.png', size: 192, pad: 0, bg: BG, round: false },
  { file: 'icon-512.png', size: 512, pad: 0, bg: BG, round: false },
  { file: 'icon-180.png', size: 180, pad: 0, bg: BG, round: false },
  { file: 'maskable-512.png', size: 512, pad: 0.16, bg: BGT, round: false },
];

for (const t of targets) {
  const png = makePNG(t.size, tetrisDraw(t.bg, T, t.pad, false));
  fs.writeFileSync(path.join(OUT, t.file), png);
  console.log('wrote', t.file, png.length, 'bytes');
}

// APK launcher（圆角方块背景 + T 块）
const launcher = makePNG(192, tetrisDraw(BG, T, 0, true));
fs.writeFileSync(path.join(RES, 'ic_launcher.png'), launcher);
fs.writeFileSync(path.join(RES, 'ic_launcher_round.png'), launcher);
console.log('wrote ic_launcher.png / ic_launcher_round.png', launcher.length, 'bytes');
console.log('icons generated in', OUT, 'and', RES);
