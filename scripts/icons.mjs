// Genera los iconos PNG sin dependencias: fondo oscuro, anillo claro y un punto naranja de "aviso".
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [17, 17, 17], FG = [246, 245, 241], ACCENT = [255, 90, 31];

function crc32(buf) {
  let crc = ~0;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, color) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = color(x, y);
      raw.set([r, g, b], y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Muestra un píxel en coordenadas normalizadas (0..1).
function shade(u, v) {
  const dx = u - 0.5, dy = v - 0.5, d = Math.hypot(dx, dy);
  const ax = u - 0.5 - 0.19 * Math.SQRT1_2, ay = v - 0.5 + 0.19 * Math.SQRT1_2;
  if (Math.hypot(ax, ay) < 0.075) return ACCENT;
  if (Math.hypot(ax, ay) < 0.11) return BG;
  if (d < 0.22 && d > 0.155) return FG;
  return BG;
}

function icon(size) {
  const S = 4;
  return png(size, (x, y) => {
    const acc = [0, 0, 0];
    for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
      const c = shade((x + (i + 0.5) / S) / size, (y + (j + 0.5) / S) / size);
      acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
    }
    return acc.map(n => Math.round(n / (S * S)));
  });
}

const dir = new URL('../public/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, dir), icon(size));
}
writeFileSync(new URL('icon.svg', dir), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="22" fill="#111"/>
<circle cx="50" cy="50" r="18.75" fill="none" stroke="#f6f5f1" stroke-width="6.5"/>
<circle cx="63.4" cy="36.6" r="11" fill="#111"/>
<circle cx="63.4" cy="36.6" r="7.5" fill="#ff5a1f"/>
</svg>
`);
console.log('Iconos generados en public/icons');
