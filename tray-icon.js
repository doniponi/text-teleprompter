const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function inRoundedRect(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - 1 - r);
  const cy = Math.min(Math.max(y, r), h - 1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function sign(p1x, p1y, p2x, p2y, p3x, p3y) {
  return (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// 三条左对齐、依次变短的横线：代表提词器里逐行滚动的文字
function glyphLines(size) {
  const marginX = Math.round(size * 0.22);
  const maxW = size - marginX * 2;
  const widths = [1, 0.75, 0.5].map((f) => Math.round(maxW * f));
  const barH = Math.max(2, Math.round(size * 0.12));
  const gap = Math.max(2, Math.round(size * 0.11));
  const totalH = barH * 3 + gap * 2;
  const startY = Math.round((size - totalH) / 2);
  return (x, y) => {
    for (let i = 0; i < 3; i++) {
      const y0 = startY + i * (barH + gap);
      if (y >= y0 && y < y0 + barH && x >= marginX && x < marginX + widths[i]) return true;
    }
    return false;
  };
}

// 三个堆叠的向上箭头：代表文字持续向上自动滚动
function glyphChevrons(size) {
  const cx = size / 2;
  const w = size * 0.52;
  const h = size * 0.15;
  const gap = size * 0.09;
  const stroke = Math.max(1.4, size * 0.1);
  const totalH = h * 3 + gap * 2;
  const startY = (size - totalH) / 2;
  return (x, y) => {
    for (let k = 0; k < 3; k++) {
      const topY = startY + k * (h + gap);
      const apex = [cx, topY];
      const left = [cx - w / 2, topY + h];
      const right = [cx + w / 2, topY + h];
      const d = Math.min(
        distToSegment(x, y, apex[0], apex[1], left[0], left[1]),
        distToSegment(x, y, apex[0], apex[1], right[0], right[1])
      );
      if (d <= stroke / 2) return true;
    }
    return false;
  };
}

// 播放三角形：代表提词器正在自动播放/滚动
function glyphPlay(size) {
  const ax = size * 0.32, ay = size * 0.24;
  const bx = size * 0.32, by = size * 0.76;
  const cx = size * 0.76, cy = size * 0.5;
  return (x, y) => inTriangle(x + 0.5, y + 0.5, ax, ay, bx, by, cx, cy);
}

// 字母 T：品牌字标
function glyphLetterT(size) {
  const margin = Math.round(size * 0.24);
  const topH = Math.max(2, Math.round(size * 0.16));
  const stemW = Math.max(2, Math.round(size * 0.16));
  const stemX0 = Math.round(size / 2 - stemW / 2);
  return (x, y) => {
    const inTop = y >= margin && y < margin + topH && x >= margin && x < size - margin;
    const inStem = y >= margin && y < size - margin && x >= stemX0 && x < stemX0 + stemW;
    return inTop || inStem;
  };
}

// 字母 T + 上滚箭头：字标 + 顶上一个向上的箭头，表示"文字往上滚"
function glyphLetterTArrow(size) {
  const cx = size / 2;
  const chevronY0 = size * 0.1;
  const chevronH = size * 0.15;
  const chevronW = size * 0.34;
  const chevronStroke = Math.max(1.4, size * 0.095);
  const apex = [cx, chevronY0];
  const left = [cx - chevronW / 2, chevronY0 + chevronH];
  const right = [cx + chevronW / 2, chevronY0 + chevronH];

  const margin = Math.round(size * 0.24);
  const barY0 = Math.round(size * 0.42);
  const barH = Math.max(2, Math.round(size * 0.12));
  const stemW = Math.max(2, Math.round(size * 0.16));
  const stemX0 = Math.round(cx - stemW / 2);
  const stemY1 = Math.round(size * 0.82);

  return (x, y) => {
    const d = Math.min(
      distToSegment(x, y, apex[0], apex[1], left[0], left[1]),
      distToSegment(x, y, apex[0], apex[1], right[0], right[1])
    );
    if (d <= chevronStroke / 2) return true;
    const inTop = y >= barY0 && y < barY0 + barH && x >= margin && x < size - margin;
    const inStem = y >= barY0 && y < stemY1 && x >= stemX0 && x < stemX0 + stemW;
    return inTop || inStem;
  };
}

const GLYPHS = {
  lines: glyphLines,
  chevrons: glyphChevrons,
  play: glyphPlay,
  letterT: glyphLetterT,
  letterTArrow: glyphLetterTArrow,
};

function buildTrayIconPng(size = 32, bgHex = '#8b5cf6', variant = 'lines') {
  const [br, bgc, bb] = hexToRgb(bgHex);
  const radius = size * 0.24;
  const rowSize = size * 4 + 1;
  const raw = Buffer.alloc(rowSize * size);
  const isGlyph = (GLYPHS[variant] || GLYPHS.lines)(size);

  for (let y = 0; y < size; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const off = rowStart + 1 + x * 4;
      if (!inRoundedRect(x, y, size, size, radius)) {
        raw[off] = 0;
        raw[off + 1] = 0;
        raw[off + 2] = 0;
        raw[off + 3] = 0;
        continue;
      }
      if (isGlyph(x, y)) {
        raw[off] = 255;
        raw[off + 1] = 255;
        raw[off + 2] = 255;
        raw[off + 3] = 255;
      } else {
        raw[off] = br;
        raw[off + 1] = bgc;
        raw[off + 2] = bb;
        raw[off + 3] = 255;
      }
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  const ihdr = chunk('IHDR', ihdrData);
  const idat = chunk('IDAT', zlib.deflateSync(raw));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

module.exports = { buildTrayIconPng };
