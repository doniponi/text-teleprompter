const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readDroppedFile: (filePath) => ipcRenderer.invoke('read-dropped-file', filePath),
  getPathForFile: (file) => (webUtils ? webUtils.getPathForFile(file) : file.path),
  setClickThrough: (ignore) => ipcRenderer.send('set-click-through', ignore),
  closeApp: () => ipcRenderer.send('close-app'),
  minimizeApp: () => ipcRenderer.send('minimize-app'),
  onLoadMarkdown: (cb) => ipcRenderer.on('load-markdown', (e, data) => cb(data)),
  onToggleClickThrough: (cb) => ipcRenderer.on('toggle-click-through', (e, forceValue) => cb(forceValue)),
  onTogglePlay: (cb) => ipcRenderer.on('toggle-play', cb),
  onSpeedDelta: (cb) => ipcRenderer.on('speed-delta', (e, delta) => cb(delta)),
  onRequestOpenFile: (cb) => ipcRenderer.on('request-open-file', cb),
  onToggleControls: (cb) => ipcRenderer.on('toggle-controls', cb),
});
