const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { buildTrayIconPng } = require('./tray-icon');

let win;
let tray;

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

  // 如果通过命令行传入了 .md 文件路径，启动后自动打开
  const argFile = process.argv.find((a) => a.toLowerCase().endsWith('.md'));
  if (argFile && fs.existsSync(argFile)) {
    win.webContents.once('did-finish-load', () => {
      const content = fs.readFileSync(argFile, 'utf-8');
      win.webContents.send('load-markdown', { content, filePath: argFile });
    });
  }
}

function createTray() {
  const icon = nativeImage.createFromBuffer(buildTrayIconPng(32, '#D97757', 'letterTArrow'));
  tray = new Tray(icon);
  tray.setToolTip('MD 提词器');

  const menu = Menu.buildFromTemplate([
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
      label: '恢复鼠标点击（关闭穿透）',
      click: () => win.webContents.send('toggle-click-through', false),
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
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  return { content, filePath };
});

ipcMain.handle('read-dropped-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, filePath };
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
