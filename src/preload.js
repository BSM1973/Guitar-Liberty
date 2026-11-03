const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('guitarAudio', {
  loadSample: (fileName) => ipcRenderer.invoke('load-guitar-sample', fileName),
  importScore: () => ipcRenderer.invoke('import-score'),
  readScore: (filePath) => ipcRenderer.invoke('read-score', filePath),
  // Detached panels keep the original controls and application state in this window.
  panelOpen: (id, title, restoring = false) =>
    ipcRenderer.invoke('gl-panel-open', id, title, Boolean(restoring)),
  panelRestorable: () => ipcRenderer.invoke('gl-panel-restore-session'),
  workspaceGet: () => ipcRenderer.invoke('gl-workspace-get'),
  workspaceSwitch: (id) => ipcRenderer.invoke('gl-workspace-switch', id),
  workspaceList: () => ipcRenderer.invoke('gl-workspace-list'),
  workspaceCreate: (name) => ipcRenderer.invoke('gl-workspace-create', name),
  workspaceRename: (id, name) => ipcRenderer.invoke('gl-workspace-rename', id, name),
  workspaceDelete: (id) => ipcRenderer.invoke('gl-workspace-delete', id),
  workspaceDistribute: (id) => ipcRenderer.invoke('gl-workspace-distribute', id),
  workspaceAutoArrange: (id, enabled) =>
    ipcRenderer.invoke('gl-workspace-auto-arrange', id, Boolean(enabled)),
  workspaceSave: (id) => ipcRenderer.invoke('gl-workspace-save', id),
  workspaceReset: (id) => ipcRenderer.invoke('gl-workspace-reset', id),
  panelSnapshot: (id, markup) => ipcRenderer.send('gl-panel-snapshot', id, markup),
  onPanelAction: (callback) => {
    const listener = (_event, panelId, action) => callback(panelId, action);
    ipcRenderer.on('gl-panel-action', listener);
    return () => ipcRenderer.removeListener('gl-panel-action', listener);
  },
  onPanelRequest: (callback) => {
    const listener = (_event, panelId) => callback(panelId);
    ipcRenderer.on('gl-panel-request', listener);
    return () => ipcRenderer.removeListener('gl-panel-request', listener);
  },
  onPanelClosed: (callback) => {
    const listener = (_event, panelId) => callback(panelId);
    ipcRenderer.on('gl-panel-closed', listener);
    return () => ipcRenderer.removeListener('gl-panel-closed', listener);
  }
});
