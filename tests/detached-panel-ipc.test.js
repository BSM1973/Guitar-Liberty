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

function bootMain() {
  const handlers = new Map();
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
      windows.push(this);
    }
    loadFile(filePath, options) {
      this.loaded = { filePath, options };
      return Promise.resolve();
    }
    isDestroyed() { return this.destroyed; }
    show() { this.shown = true; }
    focus() { this.focused = true; }
    maximize() { this.maximized = true; }
    close() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.webContents.destroyed = true;
      this.emit('closed');
    }
  }
  const app = {
    whenReady: () => Promise.resolve(),
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
      ? { app, ipcMain, dialog: {}, BrowserWindow: FakeBrowserWindow }
      : require(id),
    __dirname: path.join(__dirname, '..', 'src'),
    console,
    process: { platform: 'darwin' },
    setTimeout: () => {}
  }, { filename: 'main.js' });

  return {
    windows, handlers, listeners,
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
