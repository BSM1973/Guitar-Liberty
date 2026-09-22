const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('guitarAudio', {
  loadSample: (fileName) => ipcRenderer.invoke('load-guitar-sample', fileName)
});
