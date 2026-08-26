const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu, Tray, nativeImage, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { buildTrayIconPng } = require('./tray-icon');

let win;
let tray;

// 统一的文件加载逻辑：根据扩展名决定怎么读、怎么转换成渲染进程能直接展示的内容。
// 打开对话框、拖拽文件、命令行传参、刷新按钮都走这一个函数，保证行为一致。
async function loadFileByPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.convertToHtml({ buffer });
    return { type: 'html', content: result.value, filePath };
  }
  if (ext === '.md' || ext === '.markdown') {
    return { type: 'markdown', content: fs.readFileSync(filePath, 'utf-8'), filePath };
  }
  // .txt 以及其它未知的文本类扩展名，按纯文本处理
  return { type: 'text', content: fs.readFileSync(filePath, 'utf-8'), filePath };
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 500,
    x: 100,
    y: 100,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    focusable: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  Menu.setApplicationMenu(null);

  win.loadFile('index.html');

  // 如果通过命令行传入了文件路径，启动后自动打开
  const argFile = process.argv.find((a) => /\.(md|markdown|txt|docx)$/i.test(a));
  if (argFile && fs.existsSync(argFile)) {
    win.webContents.once('did-finish-load', async () => {
      const data = await loadFileByPath(argFile);
      win.webContents.send('load-file', data);
    });
  }
}

function createTray() {
  const icon = nativeImage.createFromBuffer(buildTrayIconPng(32, '#D97757', 'letterTArrow'));
  tray = new Tray(icon);
  tray.setToolTip('文本提词器');

  const menu = Menu.buildFromTemplate([
    {
      label: '显示窗口（从最小化恢复）',
      click: () => {
        win.restore();
        win.show();
      },
    },
    { type: 'separator' },
    {
      label: '显示/隐藏工具栏',
      click: () => win.webContents.send('toggle-controls'),
    },
    {
      label: '播放/暂停',
      click: () => win.webContents.send('toggle-play'),
    },
    {
      label: '打开文件…',
      click: () => win.webContents.send('request-open-file'),
    },
    {
      label: '重新读取当前文件',
      click: () => win.webContents.send('request-reload-file'),
    },
    {
      label: '恢复鼠标点击（关闭穿透）',
      click: () => win.webContents.send('toggle-click-through', false),
    },
    {
      label: '恢复默认外观（字色/透明度）',
      click: () => win.webContents.send('reset-appearance'),
    },
    { type: 'separator' },
    {
      label: '重置窗口位置',
      click: () => win.setPosition(100, 100),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => tray.popUpContextMenu());
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // 全局快捷键：即使窗口处于鼠标穿透状态也能控制
  globalShortcut.register('Control+Alt+T', () => {
    win.webContents.send('toggle-click-through');
  });
  globalShortcut.register('Control+Alt+Space', () => {
    win.webContents.send('toggle-play');
  });
  globalShortcut.register('Control+Alt+Up', () => {
    win.webContents.send('speed-delta', 10);
  });
  globalShortcut.register('Control+Alt+Down', () => {
    win.webContents.send('speed-delta', -10);
  });
  globalShortcut.register('Control+Alt+O', () => {
    win.webContents.send('request-open-file');
  });
  globalShortcut.register('Control+Alt+H', () => {
    win.webContents.send('toggle-controls');
  });
  globalShortcut.register('Control+Alt+R', () => {
    win.restore();
    win.show();
  });
  globalShortcut.register('Control+Alt+C', () => {
    win.webContents.send('reset-appearance');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-file-dialog', async () => {
  // 两个坑都在这：
  // 1) win 是 focusable:false，原生"模态"对话框需要依附一个能被激活的父窗口，
  //    传 win 当 parent 会导致 Windows 建立不起模态关系，对话框创建阶段直接卡死，
  //    连窗口都不会出现——所以不传 parent，做成独立的非模态对话框。
  // 2) win 常年 alwaysOnTop('screen-saver')，这是 Windows 里最高的置顶档位，
  //    普通对话框窗口即使正常弹出也会被压在它下面、看不见也点不到，
  //    所以弹窗前先临时取消置顶，关闭后再恢复。
  win.setAlwaysOnTop(false);
  let result;
  try {
    result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: '支持的文档', extensions: ['md', 'markdown', 'txt', 'docx'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
  } finally {
    win.setAlwaysOnTop(true, 'screen-saver');
  }
  if (result.canceled || result.filePaths.length === 0) return null;
  return loadFileByPath(result.filePaths[0]);
});

ipcMain.handle('load-file-by-path', async (event, filePath) => {
  try {
    return await loadFileByPath(filePath);
  } catch (e) {
    return null;
  }
});

ipcMain.on('set-click-through', (event, ignore) => {
  win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('close-app', () => {
  app.quit();
});

ipcMain.on('minimize-app', () => {
  win.minimize();
});

// 一键识别窗口背后的真实背景色：先隐藏窗口露出背后的画面，截屏采样窗口所在区域，
// 算出平均颜色，再把窗口显示回来。用来判断该用深色字还是白色字。
ipcMain.handle('detect-background', async () => {
  const wasVisible = win.isVisible();
  win.hide();
  try {
    await new Promise((resolve) => setTimeout(resolve, 120));

    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const scaleFactor = display.scaleFactor || 1;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * scaleFactor),
        height: Math.round(display.size.height * scaleFactor),
      },
    });
    if (!sources.length) return null;
    const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
    const img = source.thumbnail;
    if (img.isEmpty()) return null;

    const imgSize = img.getSize();
    const relX = Math.round((bounds.x - display.bounds.x) * scaleFactor);
    const relY = Math.round((bounds.y - display.bounds.y) * scaleFactor);
    const w = Math.round(bounds.width * scaleFactor);
    const h = Math.round(bounds.height * scaleFactor);

    const x = Math.max(0, Math.min(relX, imgSize.width - 1));
    const y = Math.max(0, Math.min(relY, imgSize.height - 1));
    const cropRect = {
      x,
      y,
      width: Math.max(1, Math.min(w, imgSize.width - x)),
      height: Math.max(1, Math.min(h, imgSize.height - y)),
    };

    const cropped = img.crop(cropRect);
    const tiny = cropped.resize({ width: 1, height: 1, quality: 'good' });
    const bitmap = tiny.toBitmap(); // BGRA
    if (bitmap.length < 3) return null;
    return { r: bitmap[2], g: bitmap[1], b: bitmap[0] };
  } finally {
    if (wasVisible) win.show();
  }
});
