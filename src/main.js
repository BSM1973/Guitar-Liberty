const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// The original workspace stays authoritative. Detached native windows receive
// visual snapshots and forward user actions to the existing UI controls.
let guitarMainWindow = null;
const guitarPanelWindows = new Map();
const detachablePanelIds = new Set([
  'intention', 'guided', 'practice', 'coach', 'liberty',
  'play-with-me', 'session', 'history', 'dashboard'
]);

ipcMain.handle('gl-panel-open', async (event, panelId, panelTitle) => {
  if (!guitarMainWindow || event.sender !== guitarMainWindow.webContents ||
      typeof panelId !== 'string' || !detachablePanelIds.has(panelId)) {
    throw new Error('Panneau non autorisé');
  }
  const existing = guitarPanelWindows.get(panelId);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { opened: true, reused: true };
  }
  const title = typeof panelTitle === 'string' ? panelTitle.slice(0, 80) : 'Panneau';
  const popup = new BrowserWindow({
    width: 510,
    height: 760,
    minWidth: 350,
    minHeight: 440,
    backgroundColor: '#101a28',
    title: title + ' — Guitare Liberty',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'panel-preload.js')
    }
  });
  guitarPanelWindows.set(panelId, popup);
  popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  popup.loadFile(path.join(__dirname, 'panel-window.html'), {
    query: { panel: panelId, title }
  }).catch(error => {
    console.error('Fenêtre détachée :', error);
    if (!popup.isDestroyed()) popup.close();
  });
  popup.once('ready-to-show', () => {
    if (!popup.isDestroyed()) popup.show();
  });
  popup.on('closed', () => {
    if (guitarPanelWindows.get(panelId) === popup) guitarPanelWindows.delete(panelId);
    if (guitarMainWindow && !guitarMainWindow.isDestroyed()) {
      guitarMainWindow.webContents.send('gl-panel-closed', panelId);
    }
  });
  return { opened: true, reused: false };
});

ipcMain.on('gl-panel-ready', (event, panelId) => {
  if (!detachablePanelIds.has(panelId)) return;
  const popup = guitarPanelWindows.get(panelId);
  if (!popup || popup.isDestroyed() || event.sender !== popup.webContents) return;
  if (guitarMainWindow && !guitarMainWindow.isDestroyed()) {
    guitarMainWindow.webContents.send('gl-panel-request', panelId);
  }
});

ipcMain.on('gl-panel-snapshot', (event, panelId, markup) => {
  if (!guitarMainWindow || event.sender !== guitarMainWindow.webContents ||
      !detachablePanelIds.has(panelId) || typeof markup !== 'string' ||
      markup.length > 600000) return;
  const popup = guitarPanelWindows.get(panelId);
  if (!popup || popup.isDestroyed() || popup.webContents.isDestroyed()) return;
  popup.webContents.send('gl-panel-snapshot', panelId, markup);
});

ipcMain.on('gl-panel-action', (event, panelId, action) => {
  const popup = guitarPanelWindows.get(panelId);
  if (!popup || popup.isDestroyed() || event.sender !== popup.webContents ||
      !guitarMainWindow || guitarMainWindow.isDestroyed() ||
      !action || typeof action !== 'object') return;
  guitarMainWindow.webContents.send('gl-panel-action', panelId, action);
});

ipcMain.on('gl-panel-reattach', (event, panelId) => {
  const popup = guitarPanelWindows.get(panelId);
  if (popup && !popup.isDestroyed() && popup.webContents === event.sender) popup.close();
});

ipcMain.handle('load-guitar-sample', async (_event, fileName) => {
  const allowed = new Set(['E aigue0.aiff','B0.aiff','G0.aiff','D0.aiff','A0.aiff','E0.aiff']);
  if (!allowed.has(fileName)) throw new Error('Invalid guitar sample');
  return fs.promises.readFile(path.join(__dirname, '..', 'assets', 'guitar', 'clean', fileName));
});

ipcMain.handle('import-score', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Importer une tablature',
    properties: ['openFile'],
    // Electron 36/37/38 on macOS has a confirmed native-dialog regression
    // where custom extension filters can grey out every matching file.
    // Let macOS show all files and validate supported extensions after selection.
    filters: process.platform === 'darwin'
      ? [{ name: 'Partitions', extensions: ['*'] }]
      : [
          { name: 'Guitar Pro', extensions: ['gp','gp3','gp4','gp5','gpx'] },
          { name: 'MusicXML', extensions: ['musicxml','xml','mxl'] },
          { name: 'MIDI', extensions: ['mid','midi'] },
          { name: 'Tous les fichiers', extensions: ['*'] }
        ]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath=result.filePaths[0];
  return { name:path.basename(filePath), ext:path.extname(filePath).toLowerCase(), filePath };
});

ipcMain.handle('read-score', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') throw new Error('Chemin de partition invalide');
  const data=await fs.promises.readFile(filePath);
  return new Uint8Array(data);
});

function createWindow() {
  const splash = new BrowserWindow({
    fullscreen: true,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#000000',
    webPreferences: { contextIsolation: true }
  });

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#101216',
    title: 'Guitare Liberty',
    show: false,
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });

  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.once('ready-to-show', () => splash.show());

  guitarMainWindow = win;
  win.on('closed', () => {
    if (guitarMainWindow === win) guitarMainWindow = null;
    for (const popup of guitarPanelWindows.values()) {
      if (!popup.isDestroyed()) popup.close();
    }
    guitarPanelWindows.clear();
  });

  win.maximize();
  win.loadFile(path.join(__dirname, 'index.html'));

  const revealApp = () => {
    if (!splash.isDestroyed()) splash.close();
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  };
  setTimeout(revealApp, 4200);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
