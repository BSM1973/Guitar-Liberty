const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('guitarAudio', {
  loadSample: (fileName) => ipcRenderer.invoke('load-guitar-sample', fileName),
  importScore: () => ipcRenderer.invoke('import-score'),
  readScore: (filePath) => ipcRenderer.invoke('read-score', filePath)
});
