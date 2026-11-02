const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { finiteRect, restorePanelBounds } = require('./panel-layout');

// The original workspace stays authoritative. Detached native windows receive
// visual snapshots and forward user actions to the existing UI controls.
let guitarMainWindow = null;
const guitarPanelWindows = new Map();
const detachablePanelIds = new Set([
  'intention', 'guided', 'practice', 'coach', 'liberty',
  'play-with-me', 'session', 'history', 'dashboard'
]);
const workspaceIds = Object.freeze(['learning', 'practice', 'improv']);
const defaultWorkspace = 'learning';
let activeWorkspace = defaultWorkspace;
let savedWorkspaces = null;
let switchingWorkspace = false;

// Store only window geometry in Electron's per-user app data folder,
// never the contents of a lesson or personal journal.
let savedPanelLayouts = null;
let savedDetachedPanelIds = null;
let layoutSaveTimer = null;
let shuttingDownWorkspace = false;
function panelLayoutsPath() {
  return path.join(app.getPath('userData'), 'detached-panel-layouts.json');
}
function readPanelLayouts() {
  if (savedWorkspaces) return savedPanelLayouts;
  savedWorkspaces = Object.create(null);
  for (const id of workspaceIds) {
    savedWorkspaces[id] = { panels: {}, openPanels: new Set() };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(panelLayoutsPath(), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Positions des panneaux : valeurs par défaut utilisées');
  }

  // Previously saved single-workspace layouts become Apprentissage. This
  // preserves the user's existing detached arrangement on upgrade.
  const profiles = parsed && parsed.version === 1 && parsed.workspaces &&
    typeof parsed.workspaces === 'object' ? parsed.workspaces : null;
  for (const id of workspaceIds) {
    const source = profiles ? profiles[id] :
      id === defaultWorkspace && parsed && parsed.version === 1 ? parsed : null;
    if (!source || typeof source !== 'object') continue;
    if (source.panels && typeof source.panels === 'object') {
      for (const panelId of detachablePanelIds) {
        const rect = finiteRect(source.panels[panelId]);
        if (rect) savedWorkspaces[id].panels[panelId] = rect;
      }
    }
    if (Array.isArray(source.openPanels)) {
      for (const panelId of source.openPanels) {
        if (typeof panelId === 'string' && detachablePanelIds.has(panelId)) {
          savedWorkspaces[id].openPanels.add(panelId);
        }
      }
    }
  }

  activeWorkspace = parsed && workspaceIds.includes(parsed.activeWorkspace)
    ? parsed.activeWorkspace : defaultWorkspace;
  savedPanelLayouts = savedWorkspaces[activeWorkspace].panels;
  savedDetachedPanelIds = savedWorkspaces[activeWorkspace].openPanels;
  return savedPanelLayouts;
}
function flushPanelLayouts() {
  if (layoutSaveTimer !== null) {
    clearTimeout(layoutSaveTimer);
    layoutSaveTimer = null;
  }
  if (!savedWorkspaces) return;
  const filename = panelLayoutsPath();
  const temporary = filename + '.tmp';
  try {
    const workspaces = {};
    for (const id of workspaceIds) {
      const profile = savedWorkspaces[id];
      workspaces[id] = {
        panels: profile.panels,
        openPanels: Array.from(profile.openPanels)
      };
    }
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify({
      version: 1,
      // Compatibility fields for older builds and existing saved layouts.
      panels: savedPanelLayouts,
      openPanels: Array.from(savedDetachedPanelIds),
      activeWorkspace,
      workspaces
    }, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, filename);
  } catch (error) {
    console.warn('Impossible d’enregistrer les espaces de travail :', error);
    try { fs.unlinkSync(temporary); } catch (_) {}
  }
}
function schedulePanelLayoutSave() {
  if (layoutSaveTimer !== null) clearTimeout(layoutSaveTimer);
  layoutSaveTimer = setTimeout(flushPanelLayouts, 400);
}
function setDetachedPreference(id, isDetached) {
  readPanelLayouts();
  if (!detachablePanelIds.has(id)) return;
  if (isDetached === savedDetachedPanelIds.has(id)) return;
  if (isDetached) savedDetachedPanelIds.add(id);
  else savedDetachedPanelIds.delete(id);
  schedulePanelLayoutSave();
}

function rememberPanelBounds(id, popup) {
  if (popup.isDestroyed() || popup.isMinimized?.()) return;
  const rect = finiteRect(popup.getNormalBounds?.() || popup.getBounds());
  if (!rect) return;
  const layouts = readPanelLayouts();
  if (layouts[id] && ['x','y','width','height'].every(k => layouts[id][k] === rect[k])) return;
  layouts[id] = rect;
  schedulePanelLayoutSave();
}


// Only the main renderer may retrieve the saved workspace, and only after
// the user enters the actual music workspace. Nothing opens on the home page.
ipcMain.handle('gl-panel-restore-session', (event) => {
  if (!guitarMainWindow || event.sender !== guitarMainWindow.webContents) {
    throw new Error('Restauration non autorisée');
  }
  readPanelLayouts();
  return Array.from(savedDetachedPanelIds);
});

// Workspace presets share one playback engine and one score. Switching
// changes only the detached window arrangement and saved geometry.
ipcMain.handle('gl-workspace-get', (event) => {
  if (!guitarMainWindow || event.sender !== guitarMainWindow.webContents) {
    throw new Error('Espace de travail non autorisé');
  }
  readPanelLayouts();
  return { id: activeWorkspace, openPanels: Array.from(savedDetachedPanelIds) };
});

ipcMain.handle('gl-workspace-switch', (event, workspaceId) => {
  if (!guitarMainWindow || event.sender !== guitarMainWindow.webContents ||
      typeof workspaceId !== 'string' || !workspaceIds.includes(workspaceId)) {
    throw new Error('Espace de travail non autorisé');
  }
  readPanelLayouts();
  if (activeWorkspace === workspaceId) {
    return { id: activeWorkspace, openPanels: Array.from(savedDetachedPanelIds) };
  }
  // Save the old workspace before closing its native windows. These closes
  // must not be mistaken for a deliberate RATTACHER.
  switchingWorkspace = true;
  try {
    for (const popup of Array.from(guitarPanelWindows.values())) {
      if (popup.isDestroyed()) continue;
      popup._glCloseReason = 'workspace-switch';
      rememberPanelBounds(popup._glPanelId, popup);
      popup.close();
    }
    activeWorkspace = workspaceId;
    savedPanelLayouts = savedWorkspaces[workspaceId].panels;
    savedDetachedPanelIds = savedWorkspaces[workspaceId].openPanels;
    schedulePanelLayoutSave();
    flushPanelLayouts();
    return { id: workspaceId, openPanels: Array.from(savedDetachedPanelIds) };
  } finally {
    switchingWorkspace = false;
  }
});

ipcMain.handle('gl-panel-open', async (event, panelId, panelTitle, restoring = false) => {
  if (!guitarMainWindow || event.sender !== guitarMainWindow.webContents ||
      typeof panelId !== 'string' || !detachablePanelIds.has(panelId)) {
    throw new Error('Panneau non autorisé');
  }
  const existing = guitarPanelWindows.get(panelId);
  if (existing && !existing.isDestroyed()) {
    // Do not steal keyboard focus during automatic workspace restoration.
    if (!restoring) {
      existing.show();
      existing.focus();
    }
    setDetachedPreference(panelId, true);
    return { opened: true, reused: true };
  }
  const title = typeof panelTitle === 'string' ? panelTitle.slice(0, 80) : 'Panneau';
  const currentDisplays = screen.getAllDisplays();
  const preferred = screen.getDisplayMatching(guitarMainWindow.getBounds());
  const bounds = restorePanelBounds(readPanelLayouts()[panelId], currentDisplays, preferred);
  const popup = new BrowserWindow({
    ...bounds,
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
  popup._glPanelId = panelId;
  guitarPanelWindows.set(panelId, popup);
  setDetachedPreference(panelId, true);
  // Persist independently for every tool, including user move/resize changes.
  popup.on('move', () => rememberPanelBounds(panelId, popup));
  popup.on('resize', () => rememberPanelBounds(panelId, popup));
  popup.on('close', () => {
    rememberPanelBounds(panelId, popup);
    // Closing a floating window manually (or RATTACHER) turns off automatic
    // reopening. Quitting/closing the main workspace must preserve the layout.
    if (!shuttingDownWorkspace && !switchingWorkspace &&
        popup._glCloseReason !== 'workspace-switch') setDetachedPreference(panelId, false);
    flushPanelLayouts();
  });
  popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  popup.loadFile(path.join(__dirname, 'panel-window.html'), {
    query: { panel: panelId, title }
  }).catch(error => {
    console.error('Fenêtre détachée :', error);
    if (!popup.isDestroyed()) popup.close();
  });
  popup.once('ready-to-show', () => {
    if (!popup.isDestroyed()) {
      if (restoring && typeof popup.showInactive === 'function') popup.showInactive();
      else popup.show();
    }
  });
  popup.on('closed', () => {
    if (guitarPanelWindows.get(panelId) === popup) guitarPanelWindows.delete(panelId);
    if (guitarMainWindow && !guitarMainWindow.isDestroyed()) {
      guitarMainWindow.webContents.send(
        'gl-panel-closed', panelId, popup._glCloseReason || 'manual'
      );
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
    webPreferences: {
      contextIsolation: true,
      // Keep alphaTab, musical timers and backing clocks active while a detached
      // panel owns keyboard focus or the main window is behind it.
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  splash.loadFile(path.join(__dirname, 'splash.html'));
  splash.once('ready-to-show', () => splash.show());

  guitarMainWindow = win;
  win.on('closed', () => {
    // Close native child windows without clearing the saved detached selection.
    shuttingDownWorkspace = true;
    if (guitarMainWindow === win) guitarMainWindow = null;
    for (const popup of guitarPanelWindows.values()) {
      if (!popup.isDestroyed()) popup.close();
    }
    guitarPanelWindows.clear();
    flushPanelLayouts();
    shuttingDownWorkspace = false;
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

app.on('before-quit', () => {
  shuttingDownWorkspace = true;
  flushPanelLayouts();
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
