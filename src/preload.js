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
  workspaceScreenMap: (id) => ipcRenderer.invoke('gl-workspace-screen-map', id),
  workspaceFocusPanel: (id, panelId) =>
    ipcRenderer.invoke('gl-workspace-focus-panel', id, panelId),
  workspaceMovePanel: (id, panelId, displayIndex, area, x, y) =>
    ipcRenderer.invoke('gl-workspace-move-panel',
      id, panelId, displayIndex, area, x, y),
  workspaceArrangeScreen: (id, displayIndex, area) =>
    ipcRenderer.invoke('gl-workspace-arrange-screen', id, displayIndex, area),
  workspaceUndoScreen: (id, displayIndex, area) =>
    ipcRenderer.invoke('gl-workspace-undo-screen', id, displayIndex, area),
  workspaceSaveScreenFavorite: (id, displayIndex, area, slot) =>
    ipcRenderer.invoke('gl-workspace-save-screen-favorite',
      id, displayIndex, area, slot),
  workspaceApplyScreenFavorite: (id, displayIndex, area, slot) =>
    ipcRenderer.invoke('gl-workspace-apply-screen-favorite',
      id, displayIndex, area, slot),
  workspacePreviewScreenFavorite: (id, displayIndex, area, slot) =>
    ipcRenderer.invoke('gl-workspace-preview-screen-favorite',
      id, displayIndex, area, slot),
  workspacePlanScreenOverlapFix: (id, displayIndex, area, slot) =>
    ipcRenderer.invoke('gl-workspace-plan-screen-overlap-fix',
      id, displayIndex, area, slot),
  workspaceApplyScreenOverlapFix: (id, displayIndex, area, slot, token) =>
    ipcRenderer.invoke('gl-workspace-apply-screen-overlap-fix',
      id, displayIndex, area, slot, token),
  workspaceUndoScreenOverlapFix: (id, displayIndex, area) =>
    ipcRenderer.invoke('gl-workspace-undo-screen-overlap-fix',
      id, displayIndex, area),
  workspaceRenameScreenFavorite: (id, displayIndex, area, slot, name) =>
    ipcRenderer.invoke('gl-workspace-rename-screen-favorite',
      id, displayIndex, area, slot, name),
  workspaceDeleteScreenFavorite: (id, displayIndex, area, slot) =>
    ipcRenderer.invoke('gl-workspace-delete-screen-favorite',
      id, displayIndex, area, slot),
  workspaceSwapScreenFavorites: (id, displayIndex, area, fromSlot, toSlot) =>
    ipcRenderer.invoke('gl-workspace-swap-screen-favorites',
      id, displayIndex, area, fromSlot, toSlot),
  workspaceLayoutStyle: (id, style) =>
    ipcRenderer.invoke('gl-workspace-layout-style', id, style),
  workspaceScreenMode: (id, mode) =>
    ipcRenderer.invoke('gl-workspace-screen-mode', id, mode),
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
