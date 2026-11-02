/* Electron IPC contract tests for detached panels.
 * These tests do not simulate audio output; they verify that a detached window
 * commands only the main renderer and never creates a duplicate playback host.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const os = require('node:os');


function bootMain(options = {}) {
  const handlers = new Map();
  const layoutDirectory = options.layoutDirectory || fs.mkdtempSync(path.join(os.tmpdir(), 'gl-panel-ipc-'));
  const displays = options.displays || [
    { workArea: {x: 0, y: 0, width: 1920, height: 1040} }
  ];
  const listeners = new Map();
  const windows = [];
  class FakeWebContents {
    constructor() { this.sent = []; this.destroyed = false; }
    send(channel, ...args) { this.sent.push({channel, args}); }
    setWindowOpenHandler(handler) { this.windowOpenHandler = handler; }
    isDestroyed() { return this.destroyed; }
  }
  class FakeBrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new FakeWebContents();
      this.destroyed = false;
      this.shown = false;
      this.focused = false;
      this.bounds = { x: options.x || 0, y: options.y || 0,
        width: options.width || 1440, height: options.height || 900 };
      windows.push(this);
    }
    loadFile(filePath, options) {
      this.loaded = { filePath, options };
      return Promise.resolve();
    }
    isDestroyed() { return this.destroyed; }
    show() { this.shown = true; }
    showInactive() { this.shown = true; this.shownInactive = true; }
    focus() { this.focused = true; }
    maximize() { this.maximized = true; }
    getBounds() { return {...this.bounds}; }
    getNormalBounds() { return {...this.bounds}; }
    setBounds(value) { this.bounds = {...value}; this.emit('move'); this.emit('resize'); }
    isMinimized() { return false; }
    close() {
      if (this.destroyed) return;
      this.emit('close');
      this.destroyed = true;
      this.webContents.destroyed = true;
      this.emit('closed');
    }
  }
  const app = {
    whenReady: () => Promise.resolve(),
    getPath: name => name === 'userData' ? layoutDirectory : layoutDirectory,
    on: () => {},
    quit: () => {}
  };
  const ipcMain = {
    handle: (channel, callback) => handlers.set(channel, callback),
    on: (channel, callback) => listeners.set(channel, callback)
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  vm.runInNewContext(source, {
    require: (id) => id === 'electron'
      ? {
          app, ipcMain, dialog: {}, BrowserWindow: FakeBrowserWindow,
          screen: {
            getAllDisplays: () => displays,
            getDisplayMatching: () => displays[0],
            getPrimaryDisplay: () => displays[0]
          }
        }
      : id === './panel-layout'
        ? require(path.join(__dirname, '..', 'src', 'panel-layout.js'))
        : require(id),
    __dirname: path.join(__dirname, '..', 'src'),
    console,
    process: { platform: 'darwin' },
    setTimeout: () => 1,
    clearTimeout: () => {}
  }, { filename: 'main.js' });

  return {
    windows, handlers, listeners, layoutDirectory,
    emit: (channel, sender, ...args) => {
      assert.ok(listeners.has(channel), 'Listener missing for ' + channel);
      listeners.get(channel)({ sender }, ...args);
    }
  };
}

test('floating PLAY/Joue avec moi actions use only the original playback window', async () => {
  const harness = bootMain();
  await Promise.resolve(); // app.whenReady resolves and creates splash + main
  assert.equal(harness.windows.length, 2);
  const main = harness.windows[1];
  assert.equal(main.options.webPreferences.backgroundThrottling, false);

  const open = harness.handlers.get('gl-panel-open');
  assert.equal(typeof open, 'function');
  const result = await open({sender: main.webContents}, 'play-with-me', 'JOUE AVEC MOI');
  assert.equal(result.opened, true);
  assert.equal(harness.windows.length, 3);
  const popup = harness.windows[2];
  assert.match(popup.loaded.filePath, /panel-window\.html$/);
  assert.notEqual(popup.webContents, main.webContents);
  assert.equal(popup.options.webPreferences.nodeIntegration, false);
  assert.equal(popup.options.webPreferences.contextIsolation, true);
  assert.equal(popup.options.webPreferences.sandbox, true);

  harness.emit('gl-panel-ready', popup.webContents, 'play-with-me');
  assert.deepEqual([...main.webContents.sent.at(-1).args], ['play-with-me']);
  assert.equal(main.webContents.sent.at(-1).channel, 'gl-panel-request');

  harness.emit('gl-panel-snapshot', main.webContents, 'play-with-me', '<div>ÉCOUTE</div>');
  assert.equal(popup.webContents.sent.at(-1).channel, 'gl-panel-snapshot');
  assert.deepEqual([...popup.webContents.sent.at(-1).args], ['play-with-me', '<div>ÉCOUTE</div>']);

  const playAction = {key: 'remote-play-with-me', kind: 'click'};
  harness.emit('gl-panel-action', popup.webContents, 'play-with-me', playAction);
  assert.equal(main.webContents.sent.at(-1).channel, 'gl-panel-action');
  assert.equal(main.webContents.sent.at(-1).args[1].key, playAction.key);
  assert.equal(harness.windows.length, 3, 'action must not create another playback window');

  const reopened = await open({sender: main.webContents}, 'play-with-me', 'JOUE AVEC MOI');
  assert.equal(reopened.reused, true);
  assert.equal(harness.windows.length, 3, 'reopening must focus existing native panel');
});

test('invalid or foreign detached commands cannot reach the audio engine', async () => {
  const harness = bootMain();
  await Promise.resolve();
  const main = harness.windows[1];
  const open = harness.handlers.get('gl-panel-open');
  await assert.rejects(
    open({sender: main.webContents}, 'unknown-panel', 'Not allowed'),
    /non autorisé/
  );
  const impostor = {sent: []};
  await assert.rejects(
    open({sender: impostor}, 'practice', 'ENTRAÎNEMENT'),
    /non autorisé/
  );
  await open({sender: main.webContents}, 'practice', 'ENTRAÎNEMENT');
  const popup = harness.windows[2];

  const count = main.webContents.sent.length;
  harness.emit('gl-panel-action', impostor, 'practice', {key:'fake', kind:'click'});
  harness.emit('gl-panel-action', popup.webContents, 'play-with-me', {key:'wrong', kind:'click'});
  assert.equal(main.webContents.sent.length, count, 'foreign input must be ignored');

  harness.emit('gl-panel-action', popup.webContents, 'practice', {key:'loop-start',kind:'change',value:'4'});
  assert.equal(main.webContents.sent.at(-1).channel, 'gl-panel-action');
  assert.equal(main.webContents.sent.at(-1).args[1].value, '4');

  const snapshotCount = popup.webContents.sent.length;
  harness.emit('gl-panel-snapshot', impostor, 'practice', '<p>forged</p>');
  assert.equal(popup.webContents.sent.length, snapshotCount);
});

test('STOP/close/reattach lifetime keeps only one main playback context', async () => {
  const harness = bootMain();
  await Promise.resolve();
  const main = harness.windows[1];
  const open = harness.handlers.get('gl-panel-open');
  await open({sender: main.webContents}, 'practice', 'ENTRAÎNEMENT');
  await open({sender: main.webContents}, 'play-with-me', 'JOUE AVEC MOI');
  const practice = harness.windows[2];
  const playWithMe = harness.windows[3];

  harness.emit('gl-panel-action', playWithMe.webContents, 'play-with-me', {key:'stop',kind:'click'});
  assert.equal(main.webContents.sent.at(-1).channel, 'gl-panel-action');

  harness.emit('gl-panel-reattach', practice.webContents, 'practice');
  assert.equal(practice.destroyed, true);
  assert.deepEqual([...main.webContents.sent.at(-1).args], ['practice']);
  assert.equal(main.webContents.sent.at(-1).channel, 'gl-panel-closed');

  main.close();
  assert.equal(playWithMe.destroyed, true, 'main close must close every native panel');
});

test('main STOP ends JOUE AVEC MOI timers even during detached control', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
  assert.match(source, /function stop\(\)\s*\{\s*\/\/[^\n]*\n[^\n]*\n\s*if\(playWithMeActive\)stopPlayWithMe\(\)/);
  assert.match(source, /playWithMeStart\?\.addEventListener\('click',startPlayWithMe\)/);
  assert.match(source, /playWithMeStop\?\.addEventListener\('click',stopPlayWithMe\)/);
  for (const file of ['workspace-ui.js','panel-window.js']) {
    const script = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
    assert.doesNotThrow(() => new Function(script), file + ' should parse');
  }
});


test('each detached panel restores its own position and dimensions on the next launch', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-persist-layout-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const displays = [
    { workArea: {x: 0, y: 0, width: 1920, height: 1040} },
    { workArea: {x: 1920, y: 0, width: 1440, height: 900} }
  ];
  const one = bootMain({ layoutDirectory: folder, displays });
  await Promise.resolve();
  const opener = one.handlers.get('gl-panel-open');
  await opener({sender: one.windows[1].webContents}, 'practice', 'ENTRAÎNEMENT');
  await opener({sender: one.windows[1].webContents}, 'play-with-me', 'JOUE AVEC MOI');
  one.windows[2].setBounds({ x: 2210, y: 95, width: 620, height: 680 });
  one.windows[3].setBounds({ x: 110, y: 130, width: 470, height: 600 });
  one.windows[2].close();
  one.windows[3].close();

  const json = JSON.parse(fs.readFileSync(
    path.join(folder, 'detached-panel-layouts.json'), 'utf8'));
  assert.equal(json.version, 1);
  assert.deepEqual(json.panels.practice, {x: 2210, y: 95, width: 620, height: 680});
  assert.deepEqual(json.panels['play-with-me'], {x: 110, y: 130, width: 470, height: 600});

  const two = bootMain({ layoutDirectory: folder, displays });
  await Promise.resolve();
  const reopen = two.handlers.get('gl-panel-open');
  await reopen({sender: two.windows[1].webContents}, 'practice', 'ENTRAÎNEMENT');
  await reopen({sender: two.windows[1].webContents}, 'play-with-me', 'JOUE AVEC MOI');
  assert.deepEqual(two.windows[2].getBounds(), {x: 2210, y: 95, width: 620, height: 680});
  assert.deepEqual(two.windows[3].getBounds(), {x: 110, y: 130, width: 470, height: 600});
});

test('a disconnected monitor does not leave the detached panel off screen', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-unplug-layout-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const pathName = path.join(folder, 'detached-panel-layouts.json');
  fs.writeFileSync(pathName, JSON.stringify({
    version: 1,
    panels: {practice: { x: 2400, y: 140, width: 600, height: 650 }}
  }));
  const one = bootMain({ layoutDirectory: folder, displays: [
    { workArea: {x: 0, y: 0, width: 1600, height: 900} }
  ]});
  await Promise.resolve();
  await one.handlers.get('gl-panel-open')({
    sender: one.windows[1].webContents
  }, 'practice', 'ENTRAÎNEMENT');
  assert.deepEqual(one.windows[2].getBounds(),
    { x: 500, y: 125, width: 600, height: 650 });
});

test('a corrupted or invalid layout file falls back to safe native window bounds', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-corrupt-layout-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const filename = path.join(folder, 'detached-panel-layouts.json');
  fs.writeFileSync(filename, '{broken');
  const one = bootMain({ layoutDirectory: folder });
  await Promise.resolve();
  await one.handlers.get('gl-panel-open')({
    sender: one.windows[1].webContents
  }, 'guided', 'SÉANCE GUIDÉE');
  const bounds = one.windows[2].getBounds();
  assert.equal(bounds.width, 510);
  assert.equal(bounds.height, 760);
  assert.ok(bounds.x >= 0 && bounds.y >= 0);
});


test('saved floating windows return after entering the workspace, with no premature popup', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-restore-session-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const first = bootMain({layoutDirectory: folder});
  await Promise.resolve();
  const opening = first.handlers.get('gl-panel-open');
  await opening({sender: first.windows[1].webContents}, 'practice', 'ENTRAÎNEMENT');
  await opening({sender: first.windows[1].webContents}, 'play-with-me', 'JOUE AVEC MOI');
  first.windows[2].setBounds({x: 120, y: 95, width: 550, height: 700});
  first.windows[3].setBounds({x: 780, y: 85, width: 600, height: 760});

  // Closing the main workspace is not an intentional reattach.
  first.windows[1].close();
  const state = JSON.parse(fs.readFileSync(
    path.join(folder, 'detached-panel-layouts.json'), 'utf8'));
  assert.deepEqual([...state.openPanels].sort(), ['play-with-me', 'practice']);
  assert.deepEqual(state.panels.practice, {x:120,y:95,width:550,height:700});
  assert.deepEqual(state.panels['play-with-me'], {x:780,y:85,width:600,height:760});

  const next = bootMain({layoutDirectory: folder});
  await Promise.resolve();
  assert.equal(next.windows.length, 2,
    'no floating window should appear on the welcome screen');
  const restore = next.handlers.get('gl-panel-restore-session');
  assert.equal(typeof restore, 'function');
  await assert.rejects(
    async () => restore({sender: {id:'other'}}),
    /non autorisée/,
    'untrusted renderers may not read or trigger a previous layout'
  );
  const ids = restore({sender: next.windows[1].webContents});
  assert.deepEqual([...ids].sort(), ['play-with-me', 'practice']);
  for (const id of ids) {
    const result = await next.handlers.get('gl-panel-open')({
      sender: next.windows[1].webContents
    }, id, id, true);
    assert.equal(result.opened, true);
  }
  assert.equal(next.windows.length, 4);
  assert.deepEqual(next.windows[2].getBounds(), state.panels.practice);
  assert.deepEqual(next.windows[3].getBounds(), state.panels['play-with-me']);
  next.windows[2].emit('ready-to-show');
  next.windows[3].emit('ready-to-show');
  assert.equal(next.windows[2].shownInactive, true);
  assert.equal(next.windows[3].shownInactive, true);
  assert.equal(next.windows[2].focused, false);
  assert.equal(next.windows[3].focused, false);
});

test('closing or reattaching a floating panel removes it from next-session restoration', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-close-session-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const first = bootMain({layoutDirectory: folder});
  await Promise.resolve();
  const open = first.handlers.get('gl-panel-open');
  const main = first.windows[1];
  await open({sender: main.webContents}, 'practice', 'ENTRAÎNEMENT');
  await open({sender: main.webContents}, 'play-with-me', 'JOUE AVEC MOI');
  first.emit('gl-panel-reattach', first.windows[2].webContents, 'practice');
  assert.equal(first.windows[2].destroyed, true);
  main.close();

  const next = bootMain({layoutDirectory: folder});
  await Promise.resolve();
  const restore = next.handlers.get('gl-panel-restore-session');
  assert.deepEqual([...restore({sender: next.windows[1].webContents})],
    ['play-with-me'], 'reattached panel should not reopen');

  await next.handlers.get('gl-panel-open')({
    sender: next.windows[1].webContents
  }, 'play-with-me', 'JOUE AVEC MOI', true);
  next.windows[2].close();
  const afterManualClose = bootMain({layoutDirectory: folder});
  await Promise.resolve();
  assert.deepEqual([...afterManualClose.handlers.get('gl-panel-restore-session')({
    sender: afterManualClose.windows[1].webContents
  })], [], 'manually closed panel should not reopen');
});

test('older saved layouts without openPanels are valid and restore no windows', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-old-session-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  fs.writeFileSync(path.join(folder, 'detached-panel-layouts.json'), JSON.stringify({
    version: 1, panels: {practice: {x:50,y:50,width:500,height:700}}
  }));
  const startup = bootMain({layoutDirectory: folder});
  await Promise.resolve();
  const restore = startup.handlers.get('gl-panel-restore-session');
  assert.deepEqual([...restore({sender: startup.windows[1].webContents})], []);
  assert.equal(startup.windows.length, 2);
});
