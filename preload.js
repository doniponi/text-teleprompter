const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  loadFileByPath: (filePath) => ipcRenderer.invoke('load-file-by-path', filePath),
  getPathForFile: (file) => (webUtils ? webUtils.getPathForFile(file) : file.path),
  setClickThrough: (ignore) => ipcRenderer.send('set-click-through', ignore),
  closeApp: () => ipcRenderer.send('close-app'),
  minimizeApp: () => ipcRenderer.send('minimize-app'),
  detectBackground: () => ipcRenderer.invoke('detect-background'),
  onLoadFile: (cb) => ipcRenderer.on('load-file', (e, data) => cb(data)),
  onToggleClickThrough: (cb) => ipcRenderer.on('toggle-click-through', (e, forceValue) => cb(forceValue)),
  onTogglePlay: (cb) => ipcRenderer.on('toggle-play', cb),
  onSpeedDelta: (cb) => ipcRenderer.on('speed-delta', (e, delta) => cb(delta)),
  onRequestOpenFile: (cb) => ipcRenderer.on('request-open-file', cb),
  onRequestReloadFile: (cb) => ipcRenderer.on('request-reload-file', cb),
  onToggleControls: (cb) => ipcRenderer.on('toggle-controls', cb),
});
