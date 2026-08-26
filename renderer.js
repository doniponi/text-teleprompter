const appEl = document.getElementById('app');
const contentEl = document.getElementById('content');
const filenameEl = document.getElementById('filename');
const btnOpen = document.getElementById('btn-open');
const btnPlay = document.getElementById('btn-play');
const btnClickThrough = document.getElementById('btn-clickthrough');
const btnHide = document.getElementById('btn-hide');
const btnMinimize = document.getElementById('btn-minimize');
const btnClose = document.getElementById('btn-close');
const speedInput = document.getElementById('speed');
const speedVal = document.getElementById('speed-val');
const fontsizeInput = document.getElementById('fontsize');
const fontsizeVal = document.getElementById('fontsize-val');
const btnFontsizeMinus = document.getElementById('fontsize-minus');
const btnFontsizePlus = document.getElementById('fontsize-plus');
const opacityInput = document.getElementById('opacity');
const mirrorInput = document.getElementById('mirror');

let charsPerMinute = parseInt(speedInput.value, 10);
let playing = false;
let clickThrough = false;
let lastTs = null;

// 之前按"一行能放多少字"理论估算 px/秒，没算标题、段落间距这些不含文字的
// 空白高度，实际要滚的距离比理论值大，看起来就比设定的"字/分钟"慢。
// 改成直接量实际排版结果：真实内容高度 ÷ 真实字符数 = 每个字对应多少像素，
// 换算标题/段落间距等一切排版开销都自动算进去了，不用再猜。
let pxPerChar = 1.2;

function recalibrateSpeed() {
  const children = contentEl.children;
  if (!children.length) return;
  const first = children[0];
  const last = children[children.length - 1];
  const contentHeight = last.offsetTop + last.offsetHeight - first.offsetTop;
  const charCount = contentEl.textContent.replace(/\s+/g, '').length;
  if (charCount > 0 && contentHeight > 0) {
    pxPerChar = contentHeight / charCount;
  }
}

function currentPxPerSecond() {
  return pxPerChar * (charsPerMinute / 60);
}

function loadContent({ content, filePath }) {
  contentEl.innerHTML = marked.parse(content);
  contentEl.scrollTop = 0;
  filenameEl.textContent = filePath ? filePath.split(/[\\/]/).pop() : '未命名';
  filenameEl.title = filePath || '';
  recalibrateSpeed();
}

// 记录当前视口顶部对应的是哪个段落、以及滚动到了该段落的百分之几，
// 这样字号变化导致重新排版后，能把同一段落的相同位置滚回视口顶部，而不是跳到别处。
function captureScrollAnchor() {
  const children = contentEl.children;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.offsetTop + el.offsetHeight > contentEl.scrollTop) {
      const fraction = el.offsetHeight > 0 ? (contentEl.scrollTop - el.offsetTop) / el.offsetHeight : 0;
      return { index: i, fraction: Math.max(0, fraction) };
    }
  }
  return null;
}

function restoreScrollAnchor(anchor) {
  if (!anchor) return;
  const el = contentEl.children[anchor.index];
  if (!el) return;
  contentEl.scrollTop = el.offsetTop + anchor.fraction * el.offsetHeight;
}

function setFontSize(px) {
  const anchor = captureScrollAnchor();
  contentEl.style.fontSize = px + 'px';
  restoreScrollAnchor(anchor);
  recalibrateSpeed();
}

function setOpacity(percent) {
  const alpha = percent / 100;
  document.getElementById('titlebar').style.background = `rgba(20,20,20,${0.3 + alpha * 0.5})`;
  document.getElementById('controls').style.background = `rgba(20,20,20,${0.2 + alpha * 0.5})`;
  contentEl.style.background = `rgba(0,0,0,${alpha})`;
}

// 每帧要滚动的距离常常不到 1px（比如 200 字/分对应每秒才几像素）。
// scrollTop 的写入会把小数部分直接舍掉，如果每帧都读当前 scrollTop 再加，
// 舍掉的小数永远补不回来，播放看起来就跟没反应一样。用一个独立变量
// 攒住这部分小数，攒够 1px 再真正写进 scrollTop。
let scrollRemainder = 0;

function setPlaying(v) {
  const wasPlaying = playing;
  playing = v;
  btnPlay.textContent = playing ? '⏸' : '▶';
  if (playing && !wasPlaying) {
    lastTs = null;
    scrollRemainder = 0;
    requestAnimationFrame(tick);
  }
}

function tick(ts) {
  if (!playing) return;
  if (lastTs == null) lastTs = ts;
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  const delta = currentPxPerSecond() * dt + scrollRemainder;
  const wholePx = Math.trunc(delta);
  scrollRemainder = delta - wholePx;
  if (wholePx !== 0) contentEl.scrollTop += wholePx;
  requestAnimationFrame(tick);
}

// 穿透模式下窗口整体会忽略鼠标事件，工具栏也够不着；
// 用 forward:true 让主进程继续转发 mousemove，据此按鼠标是否悬停在
// 工具栏上动态切换"是否真的忽略"，让工具栏在穿透模式下依然可点。
let osIgnoring = false;

function setClickThrough(v) {
  clickThrough = v;
  osIgnoring = v;
  window.api.setClickThrough(v);
  btnClickThrough.classList.toggle('active', v);
  document.title = v ? 'MD 提词器 (穿透中，工具栏可点 / Ctrl+Alt+T 恢复)' : 'MD 提词器';
}

document.addEventListener('mousemove', (e) => {
  if (!clickThrough) return;
  const overControls = !!(e.target && e.target.closest && e.target.closest('#titlebar, #controls'));
  const shouldIgnore = !overControls;
  if (shouldIgnore !== osIgnoring) {
    osIgnoring = shouldIgnore;
    window.api.setClickThrough(shouldIgnore);
  }
});

// --- UI events ---
btnOpen.addEventListener('click', async () => {
  const res = await window.api.openFileDialog();
  if (res) loadContent(res);
});

btnPlay.addEventListener('click', () => setPlaying(!playing));

btnClickThrough.addEventListener('click', () => setClickThrough(!clickThrough));

btnHide.addEventListener('click', () => {
  appEl.classList.toggle('controls-hidden');
});

btnMinimize.addEventListener('click', () => window.api.minimizeApp());
btnClose.addEventListener('click', () => window.api.closeApp());

speedInput.addEventListener('input', () => {
  charsPerMinute = parseInt(speedInput.value, 10);
  speedVal.textContent = charsPerMinute;
});
fontsizeInput.addEventListener('input', () => {
  fontsizeVal.textContent = fontsizeInput.value;
  setFontSize(parseInt(fontsizeInput.value, 10));
});

function stepFontSize(delta) {
  const min = parseInt(fontsizeInput.min, 10);
  const max = parseInt(fontsizeInput.max, 10);
  const next = Math.max(min, Math.min(max, parseInt(fontsizeInput.value, 10) + delta));
  fontsizeInput.value = next;
  fontsizeVal.textContent = next;
  setFontSize(next);
}
btnFontsizeMinus.addEventListener('click', () => stepFontSize(-1));
btnFontsizePlus.addEventListener('click', () => stepFontSize(1));
opacityInput.addEventListener('input', () => {
  setOpacity(parseInt(opacityInput.value, 10));
});
mirrorInput.addEventListener('change', () => {
  contentEl.classList.toggle('mirror', mirrorInput.checked);
});

// --- drag & drop ---
['dragenter', 'dragover'].forEach((evt) =>
  appEl.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
  })
);

appEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const filePath = window.api.getPathForFile(file);
  if (!filePath) return;
  const res = await window.api.readDroppedFile(filePath);
  if (res) loadContent(res);
});

// --- IPC from main (global shortcuts, work even without window focus) ---
window.api.onLoadMarkdown((data) => loadContent(data));
window.api.onToggleClickThrough((forceValue) =>
  setClickThrough(forceValue !== undefined ? forceValue : !clickThrough)
);
window.api.onTogglePlay(() => setPlaying(!playing));
window.api.onSpeedDelta((delta) => {
  charsPerMinute = Math.max(50, Math.min(600, charsPerMinute + delta * 2));
  speedInput.value = charsPerMinute;
  speedVal.textContent = charsPerMinute;
});
window.api.onRequestOpenFile(async () => {
  const res = await window.api.openFileDialog();
  if (res) loadContent(res);
});
window.api.onToggleControls(() => appEl.classList.toggle('controls-hidden'));

// init
fontsizeVal.textContent = fontsizeInput.value;
setFontSize(parseInt(fontsizeInput.value, 10));
setOpacity(parseInt(opacityInput.value, 10));
