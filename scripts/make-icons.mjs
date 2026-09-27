// Renders the VaultFill icon (indigo rounded square, white keyhole) to PNGs without any image deps.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** 'fg' | 'bg' | null for a point in the unit square. */
function shade(x, y) {
  const r = 0.22;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return null;
  const hole = (x - 0.5) ** 2 + (y - 0.4) ** 2 <= 0.13 ** 2;
  const stem = y >= 0.4 && y <= 0.74 && Math.abs(x - 0.5) <= 0.055 + (y - 0.4) * 0.12;
  return hole || stem ? 'fg' : 'bg';
}

function png(size) {
  const ss = 4;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      let a = 0, rr = 0, gg = 0, bb = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
          if (!c) continue;
          a++;
          const [r, g, b] = c === 'fg' ? [255, 255, 255] : [79, 70, 229];
          rr += r; gg += g; bb += b;
        }
      }
      const o = 1 + px * 4;
      if (a) {
        row[o] = rr / a;
        row[o + 1] = gg / a;
        row[o + 2] = bb / a;
        row[o + 3] = (255 * a) / (ss * ss);
      }
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icon', { recursive: true });
for (const s of [16, 32, 48, 96, 128]) writeFileSync(`public/icon/${s}.png`, png(s));
console.log('icons written');
