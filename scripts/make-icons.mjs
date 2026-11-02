// Writes the PWA icons as PNG files using only Node's zlib.
// The mark is a warm gold stopwatch (#F5BE86 ring and hands, #EAB308 crown and centre) on a
// deep matte tile (#0B0D12).
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function render(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4);
  const bg = [11, 13, 18];
  const amber = [245, 190, 134];
  const deep = [234, 179, 8];
  const corner = maskable ? 0 : size * 0.22;
  const inset = maskable ? 0 : size * 0.04;
  const scale = maskable ? 0.72 : 1;
  const c = size / 2;
  const ringR = size * 0.27 * scale;
  const ringW = size * 0.055 * scale;
  const ss = 4; // supersampling per axis

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const fx = x + (sx + 0.5) / ss;
          const fy = y + (sy + 0.5) / ss;
          // Rounded tile
          const lo = inset + corner;
          const hi = size - inset - corner;
          const qx = Math.max(lo - fx, 0, fx - hi);
          const qy = Math.max(lo - fy, 0, fy - hi);
          const inTile = fx >= inset && fx <= size - inset && fy >= inset && fy <= size - inset && Math.hypot(qx, qy) <= corner;
          if (!inTile) continue;
          let col = bg;
          const d = Math.hypot(fx - c, fy - c);
          // Ring, open at the top right like a progress arc
          const ang = Math.atan2(fy - c, fx - c);
          const inArc = !(ang > -Math.PI / 2 && ang < -Math.PI / 6);
          if (Math.abs(d - ringR) <= ringW / 2 && inArc) col = amber;
          // Clock hands
          const handW = ringW * 0.8;
          if (distToSegment(fx, fy, c, c, c, c - ringR * 0.55) <= handW / 2) col = amber;
          if (distToSegment(fx, fy, c, c, c + ringR * 0.42, c + ringR * 0.18) <= handW / 2) col = amber;
          // Stopwatch crown: a short stem and a cap above the ring
          if (distToSegment(fx, fy, c, c - ringR - ringW * 0.5, c, c - ringR - ringW * 1.4) <= ringW * 0.45) col = deep;
          if (distToSegment(fx, fy, c - ringW * 1.1, c - ringR - ringW * 1.75, c + ringW * 1.1, c - ringR - ringW * 1.75) <= ringW * 0.42) col = deep;
          if (d <= ringW * 0.75) col = deep;
          r += col[0];
          g += col[1];
          b += col[2];
          a += 1;
        }
      }
      const i = (y * size + x) * 4;
      const n = ss * ss;
      if (a > 0) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePng(size, px);
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
];
for (const [name, size, maskable] of targets) {
  writeFileSync(join(outDir, name), render(size, { maskable }));
}
console.log(`Icons written to ${outDir}`);

// Android launcher icons, when the Capacitor project exists. Legacy icons use the rounded
// tile; the adaptive foreground (108dp) uses the full-bleed maskable art, which already keeps
// the mark inside the safe zone.
const res = join(root, 'android', 'app', 'src', 'main', 'res');
if (existsSync(res)) {
  const densities = [
    ['mdpi', 48, 108],
    ['hdpi', 72, 162],
    ['xhdpi', 96, 216],
    ['xxhdpi', 144, 324],
    ['xxxhdpi', 192, 432],
  ];
  for (const [d, legacy, adaptive] of densities) {
    const dir = join(res, `mipmap-${d}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ic_launcher.png'), render(legacy, { maskable: false }));
    writeFileSync(join(dir, 'ic_launcher_round.png'), render(legacy, { maskable: false }));
    writeFileSync(join(dir, 'ic_launcher_foreground.png'), render(adaptive, { maskable: true }));
  }
  console.log(`Android launcher icons written to ${res}`);
}
