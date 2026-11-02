const { contextBridge, ipcRenderer } = require('electron');

// Dedicated, narrow API for the detached window: no file system, Node, or
// privileged API is exposed to the remote panel renderer.
contextBridge.exposeInMainWorld('guitarDetached', {
  ready: (id) => ipcRenderer.send('gl-panel-ready', id),
  action: (id, action) => ipcRenderer.send('gl-panel-action', id, action),
  reattach: (id) => ipcRenderer.send('gl-panel-reattach', id),
  onSnapshot: (callback) => {
    const listener = (_event, id, markup) => callback(id, markup);
    ipcRenderer.on('gl-panel-snapshot', listener);
    return () => ipcRenderer.removeListener('gl-panel-snapshot', listener);
  }
});
