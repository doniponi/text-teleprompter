// 生成 Windows 应用图标 (build/icon.ico)，复用 tray-icon.js 里的同一套图标绘制代码，
// 保证托盘图标和程序本体图标是同一个设计（陶土色 T + 上滚箭头）。
const fs = require('fs');
const path = require('path');
const { buildTrayIconPng } = require('../tray-icon');

const SIZES = [16, 32, 48, 256];
const COLOR = '#D97757';
const VARIANT = 'letterTArrow';

function buildIco(sizes) {
  const images = sizes.map((size) => buildTrayIconPng(size, COLOR, VARIANT));
  const count = images.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const entries = [];
  for (let i = 0; i < count; i++) {
    const size = sizes[i];
    const png = images[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data
    offset += png.length;
    entries.push(entry);
  }

  return Buffer.concat([header, ...entries, ...images]);
}

const ico = buildIco(SIZES);
const outPath = path.join(__dirname, 'icon.ico');
fs.writeFileSync(outPath, ico);
console.log('wrote', outPath, ico.length, 'bytes');
