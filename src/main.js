const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { finiteRect, restorePanelBounds, distributePanelBounds,
  displayTopologyKey } = require('./panel-layout');

// The original workspace stays authoritative. Detached native windows receive
// visual snapshots and forward user actions to the existing UI controls.
let guitarMainWindow = null;
const guitarPanelWindows = new Map();
const detachablePanelIds = new Set([
  'intention', 'guided', 'practice', 'coach', 'liberty',
  'play-with-me', 'session', 'history', 'dashboard'
]);
const workspaceIds = Object.freeze(['learning', 'practice', 'improv']);
const builtinWorkspaceNames = Object.freeze({
  learning: 'APPRENTISSAGE',
  practice: 'ENTRAÎNEMENT',
  improv: 'IMPROVISATION'
});
const MAX_CUSTOM_WORKSPACES = 8;
const layoutStyles = new Set(['mosaic', 'columns', 'cascade']);
const screenModes = new Set(['secondary-first', 'all', 'primary', 'secondary']);
function validScreenMode(value) {
  return screenModes.has(value) ? value : 'secondary-first';
}
function validLayoutStyle(value) {
  return layoutStyles.has(value) ? value : 'mosaic';
}
const defaultWorkspace = 'learning';
let activeWorkspace = defaultWorkspace;
let customWorkspaces = [];
let savedWorkspaces = null;

function cleanWorkspaceName(name) {
  if (typeof name !== 'string') return null;
  const cleaned = name.trim().replace(/\s+/g, ' ');
  return cleaned.length >= 1 && cleaned.length <= 32 &&
    !/[\x00-\x1f\x7f]/.test(cleaned) ? cleaned : null;
}
function allWorkspaceIds() {
  return [...workspaceIds, ...customWorkspaces.map(profile => profile.id)];
}
function isWorkspaceId(id) {
  return typeof id === 'string' &&
    (workspaceIds.includes(id) || customWorkspaces.some(profile => profile.id === id));
}
function listWorkspaceDefinitions() {
  return [
    ...workspaceIds.map(id => ({id, label: builtinWorkspaceNames[id], builtIn: true})),
    ...customWorkspaces.map(profile => ({
      id: profile.id, label: profile.label, builtIn: false
    }))
  ];
}
function workspaceNameAvailable(label, exceptId = null) {
  return !listWorkspaceDefinitions().some(item =>
    item.id !== exceptId &&
    item.label.toLocaleLowerCase('fr') === label.toLocaleLowerCase('fr'));
}
let switchingWorkspace = false;

// Store only window geometry in Electron's per-user app data folder,
// never the contents of a lesson or personal journal.
let savedPanelLayouts = null;
let savedDetachedPanelIds = null;
let layoutSaveTimer = null;
let shuttingDownWorkspace = false;
const MAX_DISPLAY_LAYOUTS = 8;
let activeTopologyKey = null;

function copyPanelBounds(source) {
  const result = {};
  if (!source || typeof source !== 'object') return result;
  for (const id of detachablePanelIds) {
    const rect = finiteRect(source[id]);
    if (rect) result[id] = rect;
  }
  return result;
}

// Keep one bounded set of positions per monitor topology, per workspace.
// A temporary single-screen fallback must not erase the user's carefully
// positioned windows on a disconnected second monitor.
function snapshotActiveTopology() {
  if (!savedWorkspaces || !activeTopologyKey) return;
  const profile = savedWorkspaces[activeWorkspace];
  if (!profile) return;
  const snapshots = profile.displayLayouts;
  if (!Object.hasOwn(snapshots, activeTopologyKey) &&
      Object.keys(snapshots).length >= MAX_DISPLAY_LAYOUTS) {
    delete snapshots[Object.keys(snapshots)[0]];
  }
  snapshots[activeTopologyKey] = copyPanelBounds(profile.panels);
}

function activateTopologyLayout(workspaceId) {
  const profile = savedWorkspaces[workspaceId];
  const stored = activeTopologyKey && profile.displayLayouts[activeTopologyKey];
  if (stored) {
    profile.panels = {...copyPanelBounds(profile.panels), ...copyPanelBounds(stored)};
  }
  savedPanelLayouts = profile.panels;
  return Boolean(stored);
}

function panelLayoutsPath() {
  return path.join(app.getPath('userData'), 'detached-panel-layouts.json');
}
function readPanelLayouts() {
  if (savedWorkspaces) return savedPanelLayouts;
  savedWorkspaces = Object.create(null);
  for (const id of workspaceIds) {
    savedWorkspaces[id] = { panels: {}, openPanels: new Set(), autoArrange: false,
      layoutStyle: 'mosaic', screenMode: 'secondary-first',
      displayLayouts: Object.create(null) };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(panelLayoutsPath(), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Positions des panneaux : valeurs par défaut utilisées');
  }

  // Built-in presets remain permanent. User-created presets are validated
  // before loading saved geometry so malformed files cannot inject controls.
  customWorkspaces = [];
  if (parsed && parsed.version === 1 && Array.isArray(parsed.customWorkspaces)) {
    for (const entry of parsed.customWorkspaces) {
      if (customWorkspaces.length >= MAX_CUSTOM_WORKSPACES) break;
      if (!entry || typeof entry.id !== 'string' ||
          !/^custom-[1-9]\d*$/.test(entry.id) ||
          customWorkspaces.some(profile => profile.id === entry.id)) continue;
      const label = cleanWorkspaceName(entry.label);
      if (!label || !workspaceNameAvailable(label)) continue;
      customWorkspaces.push({id: entry.id, label});
      savedWorkspaces[entry.id] = {panels: {}, openPanels: new Set(), autoArrange: false,
        layoutStyle: 'mosaic', screenMode: 'secondary-first',
        displayLayouts: Object.create(null)};
    }
  }

  // Previously saved single-workspace layouts become Apprentissage. This
  // preserves the user's existing detached arrangement on upgrade.
  const profiles = parsed && parsed.version === 1 && parsed.workspaces &&
    typeof parsed.workspaces === 'object' ? parsed.workspaces : null;
  for (const id of allWorkspaceIds()) {
    const source = profiles ? profiles[id] :
      id === defaultWorkspace && parsed && parsed.version === 1 ? parsed : null;
    if (!source || typeof source !== 'object') continue;
    if (source.panels && typeof source.panels === 'object') {
      for (const panelId of detachablePanelIds) {
        const rect = finiteRect(source.panels[panelId]);
        if (rect) savedWorkspaces[id].panels[panelId] = rect;
      }
    }
    savedWorkspaces[id].autoArrange = source.autoArrange === true;
    savedWorkspaces[id].layoutStyle = validLayoutStyle(source.layoutStyle);
    savedWorkspaces[id].screenMode = validScreenMode(source.screenMode);
    if (source.displayLayouts && typeof source.displayLayouts === 'object' &&
        !Array.isArray(source.displayLayouts)) {
      for (const [key, value] of Object.entries(source.displayLayouts)) {
        if (Object.keys(savedWorkspaces[id].displayLayouts).length >= MAX_DISPLAY_LAYOUTS) break;
        if (key.length > 2048 || !key.startsWith('[[') ||
            !value || typeof value !== 'object' || Array.isArray(value)) continue;
        savedWorkspaces[id].displayLayouts[key] = copyPanelBounds(value);
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

  activeWorkspace = parsed && isWorkspaceId(parsed.activeWorkspace)
    ? parsed.activeWorkspace : defaultWorkspace;
  activeTopologyKey = displayTopologyKey(screen.getAllDisplays());
  activateTopologyLayout(activeWorkspace);
  savedDetachedPanelIds = savedWorkspaces[activeWorkspace].openPanels;
  return savedPanelLayouts;
}
function flushPanelLayouts() {
  if (layoutSaveTimer !== null) {
    clearTimeout(layoutSaveTimer);
    layoutSaveTimer = null;
  }
  if (!savedWorkspaces) return false;
  const filename = panelLayoutsPath();
  const temporary = filename + '.tmp';
  try {
    const workspaces = {};
    for (const id of allWorkspaceIds()) {
      const profile = savedWorkspaces[id];
      workspaces[id] = {
        panels: profile.panels,
        openPanels: Array.from(profile.openPanels),
        autoArrange: profile.autoArrange === true,
        layoutStyle: profile.layoutStyle,
        screenMode: profile.screenMode,
        displayLayouts: profile.displayLayouts
      };
    }
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify({
      version: 1,
      // Compatibility fields for older builds and existing saved layouts.
      panels: savedPanelLayouts,
      openPanels: Array.from(savedDetachedPanelIds),
      activeWorkspace,
      customWorkspaces,
      workspaces
    }, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, filename);
    return true;
  } catch (error) {
    console.warn('Impossible d’enregistrer les espaces de travail :', error);
    try { fs.unlinkSync(temporary); } catch (_) {}
    return false;
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

// A monitor may be unplugged or its usable area may shrink while the
// guitarist is working. Recover existing windows in place: do not recreate
// their renderer, change the detached preference or interrupt playback.
function ensureDetachedPanelVisible(popup) {
  if (!popup || popup.isDestroyed() || popup.isMinimized?.()) return false;
  const current = finiteRect(popup.getNormalBounds?.() || popup.getBounds());
  if (!current) return false;
  const displays = screen.getAllDisplays();
  const preferred = guitarMainWindow && !guitarMainWindow.isDestroyed()
    ? screen.getDisplayMatching(guitarMainWindow.getBounds())
    : screen.getPrimaryDisplay();
  const safe = restorePanelBounds(current, displays, preferred);
  if (['x', 'y', 'width', 'height'].every(key => current[key] === safe[key])) {
    return false;
  }
  popup.setBounds(safe);
  return true;
}

function recoverDetachedPanelsAfterDisplayChange() {
  if (switchingWorkspace || shuttingDownWorkspace) return;
  readPanelLayouts();
  const nextTopology = displayTopologyKey(screen.getAllDisplays());
  const changed = nextTopology !== activeTopologyKey;
  let knownLayout = false;
  if (changed) {
    // Native move/resize events may fire before Electron reports display
    // removal. Keep the last known desktop's stored positions authoritative.
    snapshotActiveTopology();
    activeTopologyKey = nextTopology;
    knownLayout = activateTopologyLayout(activeWorkspace);
  }
  if (savedWorkspaces[activeWorkspace]?.autoArrange) {
    autoArrangeActivePanels();
    if (changed) schedulePanelLayoutSave();
    return;
  }
  if (changed && knownLayout) {
    const displays = screen.getAllDisplays();
    const preferred = guitarMainWindow && !guitarMainWindow.isDestroyed()
      ? screen.getDisplayMatching(guitarMainWindow.getBounds())
      : screen.getPrimaryDisplay();
    for (const [panelId, popup] of guitarPanelWindows) {
      if (popup.isDestroyed() || popup.isMinimized?.()) continue;
      const saved = savedPanelLayouts[panelId];
      const safe = restorePanelBounds(saved, displays, preferred);
      const current = finiteRect(popup.getNormalBounds?.() || popup.getBounds());
      if (!current || !['x','y','width','height'].every(k => current[k] === safe[k])) {
        popup.setBounds(safe);
      }
      rememberPanelBounds(panelId, popup);
    }
  } else {
    for (const popup of guitarPanelWindows.values()) {
      ensureDetachedPanelVisible(popup);
      // The OS may already have moved a panel into view before the display
      // event. Persist that visible fallback even when no clamp was needed.
      rememberPanelBounds(popup._glPanelId, popup);
    }
  }
  if (changed) {
    snapshotActiveTopology();
    schedulePanelLayoutSave();
  }
}

// A profile's automatic mode is opt-in. It reflows only native detached
// windows, not the score, transport, playback engine or minimized panels.
function arrangeActiveDetachedPanels() {
  if (!guitarMainWindow || guitarMainWindow.isDestroyed() ||
      switchingWorkspace || shuttingDownWorkspace) {
    return {arranged:0,displays:0};
  }
  const windows = Array.from(guitarPanelWindows.entries()).filter(([,popup]) =>
    !popup.isDestroyed() && !popup.isMinimized?.());
  const displays = screen.getAllDisplays();
  const preferred = screen.getDisplayMatching(guitarMainWindow.getBounds());
  const layout = distributePanelBounds(
    windows.map(([panelId]) => panelId), displays, preferred,
    savedWorkspaces[activeWorkspace].layoutStyle,
    savedWorkspaces[activeWorkspace].screenMode);
  for (const item of layout) {
    const popup = guitarPanelWindows.get(item.id);
    if (!popup || popup.isDestroyed()) continue;
    if (popup.isMaximized?.()) popup.unmaximize();
    popup.setBounds(item.bounds);
    rememberPanelBounds(item.id, popup);
  }
  return {arranged:layout.length,
    displays:new Set(layout.map(item=>item.displayIndex)).size};
}

function autoArrangeActivePanels() {
  if (!savedWorkspaces?.[activeWorkspace]?.autoArrange ||
      switchingWorkspace || shuttingDownWorkspace) return;
  arrangeActiveDetachedPanels();
  flushPanelLayouts();
}

function rememberPanelBounds(id, popup) {
  if (popup.isDestroyed() || popup.isMinimized?.()) return;
  const layouts = readPanelLayouts();
  // Do not accidentally replace the two-monitor geometry with OS-driven
  // fallback bounds before the display-removed notification arrives.
  if (activeTopologyKey !== displayTopologyKey(screen.getAllDisplays())) return;
  const rect = finiteRect(popup.getNormalBounds?.() || popup.getBounds());
  if (!rect) return;
  if (layouts[id] && ['x','y','width','height'].every(k => layouts[id][k] === rect[k])) return;
  layouts[id] = rect;
  snapshotActiveTopology();
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
  return { id: activeWorkspace, openPanels: Array.from(savedDetachedPanelIds),
    autoArrange: savedWorkspaces[activeWorkspace].autoArrange === true,
    layoutStyle: savedWorkspaces[activeWorkspace].layoutStyle,
    screenMode: savedWorkspaces[activeWorkspace].screenMode };
});

// RÉPARTIR arranges the existing native windows without creating new
// renderers or changing the permanent tablature / playback host. Each profile
// already persists its own bounds; the new positions survive workspace switches.
ipcMain.handle('gl-workspace-distribute', (event, workspaceId) => {
  if (!guitarMainWindow || event.sender !== guitarMainWindow.webContents ||
      typeof workspaceId !== 'string') {
    throw new Error('Répartition non autorisée');
  }
  readPanelLayouts();
  if (!isWorkspaceId(workspaceId) || switchingWorkspace ||
      activeWorkspace !== workspaceId) {
    throw new Error('Espace de travail non actif');
  }
  const result = arrangeActiveDetachedPanels();
  if (!flushPanelLayouts()) throw new Error('Impossible de sauvegarder la répartition');
  return {id: activeWorkspace, ...result};
});

// Choosing a style applies it immediately, even when AUTO is off. Only the
// active profile is modified; other profiles keep their own style and bounds.
ipcMain.handle('gl-workspace-layout-style', (event, workspaceId, requestedStyle) => {
  assertMainWorkspaceSender(event);
  readPanelLayouts();
  if (!isWorkspaceId(workspaceId) || activeWorkspace !== workspaceId ||
      switchingWorkspace || !layoutStyles.has(requestedStyle)) {
    throw new Error('Style de disposition non autorisé');
  }
  const profile = savedWorkspaces[workspaceId];
  const previous = profile.layoutStyle;
  profile.layoutStyle = requestedStyle;
  const result = arrangeActiveDetachedPanels();
  if (!flushPanelLayouts()) {
    profile.layoutStyle = previous;
    throw new Error('Impossible de sauvegarder le style de disposition');
  }
  return {id: workspaceId, style: requestedStyle, ...result};
});

// The selected monitor policy is independent of the layout style and AUTO
// state. Apply it immediately without recreating windows or touching playback.
ipcMain.handle('gl-workspace-screen-mode', (event, workspaceId, requestedMode) => {
  assertMainWorkspaceSender(event);
  readPanelLayouts();
  if (!isWorkspaceId(workspaceId) || activeWorkspace !== workspaceId ||
      switchingWorkspace || !screenModes.has(requestedMode)) {
    throw new Error('Choix des écrans non autorisé');
  }
  const profile = savedWorkspaces[workspaceId];
  const previous = profile.screenMode;
  profile.screenMode = requestedMode;
  const result = arrangeActiveDetachedPanels();
  if (!flushPanelLayouts()) {
    profile.screenMode = previous;
    throw new Error('Impossible de sauvegarder le choix des écrans');
  }
  return {id: workspaceId, mode: requestedMode, ...result};
});

// AUTO ON/OFF belongs to the selected workspace. Older layouts remain
// manual by default so upgrading never unexpectedly moves saved windows.
ipcMain.handle('gl-workspace-auto-arrange', (event, workspaceId, enabled) => {
  assertMainWorkspaceSender(event);
  readPanelLayouts();
  if (!isWorkspaceId(workspaceId) || activeWorkspace !== workspaceId ||
      switchingWorkspace || typeof enabled !== 'boolean') {
    throw new Error('Répartition automatique non autorisée');
  }
  const profile = savedWorkspaces[workspaceId];
  const previous = profile.autoArrange;
  profile.autoArrange = enabled;
  const result = enabled ? arrangeActiveDetachedPanels() :
    {arranged:0,displays:0};
  if (!flushPanelLayouts()) {
    profile.autoArrange = previous;
    throw new Error('Impossible de sauvegarder le mode automatique');
  }
  return {id:workspaceId,enabled,...result};
});

// ENREGISTRER explicitly persists the currently active set of floating
// windows, including geometry, instead of relying solely on debounce.
ipcMain.handle('gl-workspace-save', (event, workspaceId) => {
  if (!guitarMainWindow || event.sender !== guitarMainWindow.webContents ||
      typeof workspaceId !== 'string') {
    throw new Error('Enregistrement non autorisé');
  }
  readPanelLayouts();
  if (!isWorkspaceId(workspaceId)) throw new Error('Espace de travail non autorisé');
  if (switchingWorkspace || activeWorkspace !== workspaceId) {
    throw new Error('Espace de travail non actif');
  }
  for (const popup of guitarPanelWindows.values()) {
    if (!popup.isDestroyed()) rememberPanelBounds(popup._glPanelId, popup);
  }
  if (!flushPanelLayouts()) throw new Error('Impossible de sauvegarder la disposition');
  return { id: activeWorkspace, saved: true };
});

// RÉINITIALISER changes only the selected active layout: no lesson, TAB,
// audio setting or other user-defined workspace is modified.
ipcMain.handle('gl-workspace-reset', async (event, workspaceId) => {
  if (!guitarMainWindow || event.sender !== guitarMainWindow.webContents ||
      typeof workspaceId !== 'string') {
    throw new Error('Réinitialisation non autorisée');
  }
  readPanelLayouts();
  if (!isWorkspaceId(workspaceId)) throw new Error('Réinitialisation non autorisée');
  if (switchingWorkspace || activeWorkspace !== workspaceId) {
    throw new Error('Espace de travail non actif');
  }
  switchingWorkspace = true;
  try {
    const closing = [];
    for (const popup of Array.from(guitarPanelWindows.values())) {
      if (popup.isDestroyed()) continue;
      popup._glCloseReason = 'workspace-reset';
      closing.push(new Promise(resolve => {
        popup.once('closed', resolve);
        popup.close();
      }));
    }
    await Promise.all(closing);
    const resetProfile = { panels: {}, openPanels: new Set(), autoArrange: false,
      layoutStyle: 'mosaic', screenMode: 'secondary-first',
      displayLayouts: Object.create(null) };
    savedWorkspaces[workspaceId] = resetProfile;
    savedPanelLayouts = resetProfile.panels;
    savedDetachedPanelIds = resetProfile.openPanels;
    if (!flushPanelLayouts()) throw new Error('Impossible de sauvegarder la réinitialisation');
    return {id: workspaceId, reset: true, openPanels: []};
  } finally {
    switchingWorkspace = false;
  }
});

// Only the authoritative renderer can manage named workspace presets.
// No custom preset can replace or rename the three built-in modes.
function assertMainWorkspaceSender(event) {
  if (!guitarMainWindow || event.sender !== guitarMainWindow.webContents) {
    throw new Error('Espace de travail non autorisé');
  }
}
ipcMain.handle('gl-workspace-list', event => {
  assertMainWorkspaceSender(event);
  readPanelLayouts();
  return listWorkspaceDefinitions();
});
ipcMain.handle('gl-workspace-create', (event, requestedName) => {
  assertMainWorkspaceSender(event);
  readPanelLayouts();
  if (switchingWorkspace) throw new Error('Changement d’espace en cours');
  const label = cleanWorkspaceName(requestedName);
  if (!label) throw new Error('Le nom doit comporter de 1 à 32 caractères');
  if (!workspaceNameAvailable(label)) throw new Error('Un espace porte déjà ce nom');
  if (customWorkspaces.length >= MAX_CUSTOM_WORKSPACES) {
    throw new Error('Huit espaces personnalisés au maximum');
  }
  let index = 1;
  while (isWorkspaceId('custom-' + index)) index++;
  const id = 'custom-' + index;
  const profile = {id, label};
  customWorkspaces.push(profile);
  savedWorkspaces[id] = {panels: {}, openPanels: new Set(), autoArrange: false,
    layoutStyle: 'mosaic', screenMode: 'secondary-first',
    displayLayouts: Object.create(null)};
  if (!flushPanelLayouts()) {
    customWorkspaces.pop();
    delete savedWorkspaces[id];
    throw new Error('Impossible d’enregistrer cet espace de travail');
  }
  return {id, label, builtIn: false};
});
ipcMain.handle('gl-workspace-rename', (event, id, requestedName) => {
  assertMainWorkspaceSender(event);
  readPanelLayouts();
  if (switchingWorkspace) throw new Error('Changement d’espace en cours');
  const profile = customWorkspaces.find(item => item.id === id);
  if (!profile) throw new Error('Seuls les espaces personnalisés peuvent être renommés');
  const label = cleanWorkspaceName(requestedName);
  if (!label) throw new Error('Le nom doit comporter de 1 à 32 caractères');
  if (!workspaceNameAvailable(label, id)) throw new Error('Un espace porte déjà ce nom');
  const previous = profile.label;
  profile.label = label;
  if (!flushPanelLayouts()) {
    profile.label = previous;
    throw new Error('Impossible d’enregistrer le nouveau nom');
  }
  return {id, label, builtIn: false};
});
ipcMain.handle('gl-workspace-delete', (event, id) => {
  assertMainWorkspaceSender(event);
  readPanelLayouts();
  if (switchingWorkspace) throw new Error('Changement d’espace en cours');
  const index = customWorkspaces.findIndex(item => item.id === id);
  if (index < 0) throw new Error('Les trois espaces principaux ne peuvent pas être supprimés');
  if (id === activeWorkspace) throw new Error('Sélectionner un autre espace avant suppression');
  const removed = customWorkspaces.splice(index, 1)[0];
  const saved = savedWorkspaces[id];
  delete savedWorkspaces[id];
  if (!flushPanelLayouts()) {
    customWorkspaces.splice(index, 0, removed);
    savedWorkspaces[id] = saved;
    throw new Error('Impossible de supprimer cet espace');
  }
  return {id, deleted: true};
});

ipcMain.handle('gl-workspace-switch', async (event, workspaceId) => {
  if (!guitarMainWindow || event.sender !== guitarMainWindow.webContents ||
      typeof workspaceId !== 'string') {
    throw new Error('Espace de travail non autorisé');
  }
  readPanelLayouts();
  if (!isWorkspaceId(workspaceId)) throw new Error('Espace de travail non autorisé');
  if (switchingWorkspace) throw new Error('Changement d’espace déjà en cours');
  if (activeWorkspace === workspaceId) {
    return { id: activeWorkspace, openPanels: Array.from(savedDetachedPanelIds),
      autoArrange: savedWorkspaces[activeWorkspace].autoArrange === true,
      layoutStyle: savedWorkspaces[activeWorkspace].layoutStyle,
      screenMode: savedWorkspaces[activeWorkspace].screenMode };
  }
  // Save the old workspace before closing its native windows. These closes
  // must not be mistaken for a deliberate RATTACHER.
  switchingWorkspace = true;
  try {
    const closing = [];
    for (const popup of Array.from(guitarPanelWindows.values())) {
      if (popup.isDestroyed()) continue;
      popup._glCloseReason = 'workspace-switch';
      rememberPanelBounds(popup._glPanelId, popup);
      closing.push(new Promise(resolve => {
        popup.once('closed', resolve);
        popup.close();
      }));
    }
    // Await native close completion so an old window cannot be mistakenly
    // reused when the same tool is detached in the new workspace.
    await Promise.all(closing);
    activeWorkspace = workspaceId;
    activateTopologyLayout(workspaceId);
    savedDetachedPanelIds = savedWorkspaces[workspaceId].openPanels;
    schedulePanelLayoutSave();
    flushPanelLayouts();
    return { id: workspaceId, openPanels: Array.from(savedDetachedPanelIds),
      autoArrange: savedWorkspaces[workspaceId].autoArrange === true,
      layoutStyle: savedWorkspaces[workspaceId].layoutStyle,
      screenMode: savedWorkspaces[workspaceId].screenMode };
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
  // Save the visible, clamped initial geometry for the current topology.
  // Without this, a newly restored window can keep stale off-screen bounds.
  rememberPanelBounds(panelId, popup);
  // Persist independently for every tool, including user move/resize changes.
  popup.on('move', () => rememberPanelBounds(panelId, popup));
  popup.on('resize', () => rememberPanelBounds(panelId, popup));
  // A minimized panel is not moved until the guitarist restores it.
  popup.on('restore', () => {
    // Minimized panels are not moved during a display change. Apply their
    // saved bounds only when restored, without stealing keyboard focus.
    const stored = readPanelLayouts()[panelId];
    if (stored && !savedWorkspaces[activeWorkspace]?.autoArrange) {
      const displays = screen.getAllDisplays();
      const preferred = screen.getDisplayMatching(guitarMainWindow.getBounds());
      const safe = restorePanelBounds(stored, displays, preferred);
      const current = finiteRect(popup.getNormalBounds?.() || popup.getBounds());
      if (!current || !['x','y','width','height'].every(k => current[k] === safe[k])) {
        popup.setBounds(safe);
      }
    }
    ensureDetachedPanelVisible(popup);
    autoArrangeActivePanels();
  });
  popup.on('close', () => {
    rememberPanelBounds(panelId, popup);
    // Closing a floating window manually (or RATTACHER) turns off automatic
    // reopening. Quitting/closing the main workspace must preserve the layout.
    if (!shuttingDownWorkspace && !switchingWorkspace &&
        popup._glCloseReason !== 'workspace-switch' &&
        popup._glCloseReason !== 'workspace-reset') setDetachedPreference(panelId, false);
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
    autoArrangeActivePanels();
    if (guitarMainWindow && !guitarMainWindow.isDestroyed()) {
      guitarMainWindow.webContents.send(
        'gl-panel-closed', panelId, popup._glCloseReason || 'manual'
      );
    }
  });
  if (!restoring) autoArrangeActivePanels();
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
  // Electron reports monitor changes at runtime. Keep detached panels
  // reachable even if a second monitor disappears during a session.
  screen.on('display-added', recoverDetachedPanelsAfterDisplayChange);
  screen.on('display-removed', recoverDetachedPanelsAfterDisplayChange);
  screen.on('display-metrics-changed', recoverDetachedPanelsAfterDisplayChange);
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
