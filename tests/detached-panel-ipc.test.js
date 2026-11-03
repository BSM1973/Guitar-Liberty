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
  const screenListeners = new Map();
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
    isMinimized() { return !!this.minimized; }
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
            getPrimaryDisplay: () => displays[0],
            on: (name, callback) => screenListeners.set(name, callback)
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
    windows, handlers, listeners, layoutDirectory, displays,
    emitDisplay: name => {
      assert.ok(screenListeners.has(name), 'Screen listener missing for ' + name);
      screenListeners.get(name)();
    },
    emit: (channel, sender, ...args) => {
      assert.ok(listeners.has(channel), 'Listener missing for ' + channel);
      listeners.get(channel)({ sender }, ...args);
    }
  };
}

test('unplugging a second monitor moves detached windows back without restarting playback', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-hotplug-'));
  t.after(() => fs.rmSync(folder, {recursive:true,force:true}));
  const displays = [
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h = bootMain({layoutDirectory:folder, displays});
  await Promise.resolve();
  const sender = h.windows[1].webContents;
  const open = h.handlers.get('gl-panel-open');
  await open({sender}, 'practice', 'ENTRAÎNEMENT');
  await open({sender}, 'play-with-me', 'JOUE AVEC MOI');
  const practice = h.windows[2];
  const play = h.windows[3];
  practice.setBounds({x:1880,y:100,width:580,height:720});
  play.setBounds({x:2600,y:130,width:620,height:700});
  const count = h.windows.length;
  const previousWebContents = [practice.webContents,play.webContents];

  displays.splice(1,1);
  h.emitDisplay('display-removed');
  assert.equal(h.windows.length,count,'no duplicate audio or window renderer');
  assert.equal(practice.webContents,previousWebContents[0]);
  assert.equal(play.webContents,previousWebContents[1]);
  for(const popup of [practice,play]) {
    assert.equal(popup.destroyed,false);
    const bounds=popup.getBounds();
    assert.ok(bounds.x>=0 && bounds.x+bounds.width<=1600);
    assert.ok(bounds.y>=0 && bounds.y+bounds.height<=900);
  }
  assert.equal(h.handlers.get('gl-panel-restore-session')({sender}).length,2);
  h.windows[1].close();
  const saved=JSON.parse(fs.readFileSync(
    path.join(folder,'detached-panel-layouts.json'),'utf8'));
  assert.equal(saved.openPanels.length,2,
    'monitor recovery must not mark windows as reattached');
  assert.deepEqual(saved.panels.practice,practice.getBounds());
  assert.deepEqual(saved.panels['play-with-me'],play.getBounds());
});

test('display work-area resize clamps panels without changing their detached state',async()=>{
  const displays=[{workArea:{x:0,y:0,width:1800,height:1050}}];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'coach','COACHS');
  const popup=h.windows[2];
  popup.setBounds({x:1250,y:300,width:520,height:680});
  displays[0].workArea={x:0,y:0,width:1400,height:780};
  h.emitDisplay('display-metrics-changed');
  assert.deepEqual(popup.getBounds(),{x:880,y:100,width:520,height:680});
  assert.equal(popup.destroyed,false);
  assert.deepEqual([...h.handlers.get('gl-panel-restore-session')({sender})],['coach']);
  const before=popup.getBounds();
  h.emitDisplay('display-metrics-changed');
  assert.deepEqual(popup.getBounds(),before,'repeat notifications are idempotent');
});

test('minimized detached windows recover only on restore, without stealing focus',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1600,height:900}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'coach','COACHS');
  const popup=h.windows[2];
  popup.setBounds({x:1900,y:100,width:500,height:600});
  popup.minimized=true;
  displays.pop();
  h.emitDisplay('display-removed');
  assert.equal(popup.getBounds().x,1900,'do not unexpectedly restore minimized windows');
  popup.minimized=false;
  popup.emit('restore');
  assert.ok(popup.getBounds().x+popup.getBounds().width<=1600);
  assert.equal(popup.focused,false,'recovery must not force keyboard focus');
});

test('AUTO per workspace reflows on new panels, monitor add/remove and close',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const setAuto=h.handlers.get('gl-workspace-auto-arrange');
  const open=h.handlers.get('gl-panel-open');
  const count=h.windows.length;
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).autoArrange,false);
  const enabled=setAuto({sender},'learning',true);
  assert.deepEqual({...enabled},{id:'learning',enabled:true,arranged:0,displays:0});
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).autoArrange,true);
  await open({sender},'coach','COACH');
  const coach=h.windows.at(-1);
  assert.ok(coach.getBounds().x>=1600,'new panel should auto-open on second screen');
  await open({sender},'play-with-me','JOUE AVEC MOI');
  const play=h.windows.at(-1);
  const first=coach.getBounds(),second=play.getBounds();
  assert.ok(first.x>=1600 && second.x>=1600);
  assert.notDeepEqual(first,second,'two panels should not overlap by default');
  assert.equal(h.windows.length,count+2,'no extra audio or playback renderers');

  displays.pop();
  h.emitDisplay('display-removed');
  for(const popup of [coach,play]){
    const bounds=popup.getBounds();
    assert.ok(bounds.x>=0 && bounds.x+bounds.width<=1600);
    assert.ok(bounds.y>=0 && bounds.y+bounds.height<=900);
  }
  displays.push({workArea:{x:1600,y:0,width:1920,height:1080}});
  h.emitDisplay('display-added');
  assert.ok(coach.getBounds().x>=1600 && play.getBounds().x>=1600,
    'hotplug should auto-return to secondary monitor');

  play.close();
  assert.equal(play.destroyed,true);
  assert.equal(coach.destroyed,false);
  assert.ok(coach.getBounds().x>=1600);
  assert.deepEqual([...h.handlers.get('gl-panel-restore-session')({sender})],['coach']);
  assert.equal(h.windows[1].destroyed,false,'the main playback engine must survive');
  const disabled=setAuto({sender},'learning',false);
  assert.equal(disabled.enabled,false);
  coach.setBounds({x:80,y:80,width:500,height:620});
  await open({sender},'history','HISTORIQUE');
  assert.deepEqual(coach.getBounds(),{x:80,y:80,width:500,height:620},
    'manual layout must remain untouched when AUTO is off');
});

test('AUTO preference persists independently for built-in and custom workspaces',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-auto-workspaces-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const h=bootMain({layoutDirectory:folder});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const setAuto=h.handlers.get('gl-workspace-auto-arrange');
  const switchTo=h.handlers.get('gl-workspace-switch');
  assert.throws(()=>setAuto({sender:{}},'learning',true),/non autorisé/);
  assert.throws(()=>setAuto({sender},'practice',true),/non autorisée/);
  assert.throws(()=>setAuto({sender},'learning','true'),/non autorisée/);
  assert.equal(setAuto({sender},'learning',true).enabled,true);
  assert.equal((await switchTo({sender},'practice')).autoArrange,false);
  assert.equal(setAuto({sender},'practice',true).enabled,true);
  const custom=h.handlers.get('gl-workspace-create')({sender},'Studio multi-écrans');
  assert.equal((await switchTo({sender},custom.id)).autoArrange,false);
  assert.equal(setAuto({sender},custom.id,true).enabled,true);
  assert.equal((await switchTo({sender},'learning')).autoArrange,true);
  assert.equal((await switchTo({sender},'improv')).autoArrange,false);
  h.windows[1].close();

  const saved=JSON.parse(fs.readFileSync(
    path.join(folder,'detached-panel-layouts.json'),'utf8'));
  assert.equal(saved.workspaces.learning.autoArrange,true);
  assert.equal(saved.workspaces.practice.autoArrange,true);
  assert.equal(saved.workspaces.improv.autoArrange,false);
  assert.equal(saved.workspaces[custom.id].autoArrange,true);
  const restarted=bootMain({layoutDirectory:folder});
  await Promise.resolve();
  const nextSender=restarted.windows[1].webContents;
  assert.equal(restarted.handlers.get('gl-workspace-get')({sender:nextSender}).autoArrange,false);
  assert.equal((await restarted.handlers.get('gl-workspace-switch')({sender:nextSender},custom.id)).autoArrange,true);
  const reset=await restarted.handlers.get('gl-workspace-reset')({sender:nextSender},custom.id);
  assert.equal(reset.reset,true);
  assert.equal(restarted.handlers.get('gl-workspace-get')({sender:nextSender}).autoArrange,false);
  assert.equal((await restarted.handlers.get('gl-workspace-switch')({sender:nextSender},'learning')).autoArrange,true,
    'resetting a custom workspace must not change built-in AUTO preferences');
});

test('AUTO respects minimized windows and does not steal focus during hotplug',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  h.handlers.get('gl-workspace-auto-arrange')({sender},'learning',true);
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  const popup=h.windows.at(-1);
  popup.minimized=true;
  const before=popup.getBounds();
  displays.pop();
  h.emitDisplay('display-removed');
  assert.deepEqual(popup.getBounds(),before);
  popup.minimized=false;
  popup.emit('restore');
  const recovered=popup.getBounds();
  assert.ok(recovered.x>=0 && recovered.x+recovered.width<=1600);
  assert.equal(popup.focused,false);
  assert.equal(h.windows[1].destroyed,false);
});

test('RÉPARTIR repositions native windows on secondary screen without affecting playback',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const main=h.windows[1],sender=main.webContents;
  const open=h.handlers.get('gl-panel-open');
  const ids=['practice','coach','play-with-me','history'];
  for(const id of ids)await open({sender},id,id);
  const mainBounds=main.getBounds();
  const panels=h.windows.slice(2);
  const contents=panels.map(p=>p.webContents);
  const result=h.handlers.get('gl-workspace-distribute')({sender},'learning');
  assert.deepEqual({...result},{id:'learning',arranged:4,displays:1});
  assert.deepEqual(main.getBounds(),mainBounds,'central tablature must stay in place');
  assert.equal(h.windows.length,6,'no duplicate renderers or audio hosts');
  for(let i=0;i<panels.length;i++) {
    const popup=panels[i],bounds=popup.getBounds();
    assert.equal(popup.webContents,contents[i]);
    assert.ok(bounds.x>=1600 && bounds.x+bounds.width<=3520);
    assert.ok(bounds.y>=0 && bounds.y+bounds.height<=1080);
    assert.equal(popup.focused,false,'distribution must not steal keyboard focus');
    assert.equal(popup.destroyed,false);
  }
  assert.deepEqual([...h.handlers.get('gl-panel-restore-session')({sender})].sort(),
    [...ids].sort());
});

test('automatic positions persist separately in each workspace and after switching back',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-distribute-profiles-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({layoutDirectory:folder,displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const open=h.handlers.get('gl-panel-open');
  const distribute=h.handlers.get('gl-workspace-distribute');
  const switchTo=h.handlers.get('gl-workspace-switch');
  for(const id of ['coach','practice','history','play-with-me'])
    await open({sender},id,id);
  distribute({sender},'learning');
  const learning=new Map(h.windows.slice(2).map(p=>[p._glPanelId,p.getBounds()]));
  await switchTo({sender},'practice');
  for(const id of ['coach','practice'])await open({sender},id,id);
  const second=distribute({sender},'practice');
  assert.equal(second.arranged,2);
  const practice=new Map(h.windows.slice(-2).map(p=>[p._glPanelId,p.getBounds()]));
  assert.notDeepEqual(practice.get('coach'),learning.get('coach'),
    'workspace layout must be independent');
  await switchTo({sender},'learning');
  const expected=h.handlers.get('gl-panel-restore-session')({sender});
  assert.deepEqual([...expected].sort(),['coach','history','play-with-me','practice']);
  for(const id of expected)await open({sender},id,id,true);
  const restored=new Map(h.windows.slice(-4).map(p=>[p._glPanelId,p.getBounds()]));
  for(const [id,bounds] of learning)assert.deepEqual(restored.get(id),bounds);
  h.windows[1].close();
  const file=JSON.parse(fs.readFileSync(
    path.join(folder,'detached-panel-layouts.json'),'utf8'));
  assert.deepEqual(file.workspaces.learning.panels.coach,learning.get('coach'));
  assert.deepEqual(file.workspaces.practice.panels.coach,practice.get('coach'));
});

test('custom spaces retain their own automatic distribution after switching',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const custom=h.handlers.get('gl-workspace-create')({sender},'Mes solos');
  await h.handlers.get('gl-workspace-switch')({sender},custom.id);
  for(const id of ['coach','play-with-me','history'])
    await h.handlers.get('gl-panel-open')({sender},id,id);
  const result=h.handlers.get('gl-workspace-distribute')({sender},custom.id);
  assert.equal(result.id,custom.id);
  assert.equal(result.arranged,3);
  const expected=new Map(h.windows.slice(2).map(p=>[p._glPanelId,p.getBounds()]));
  await h.handlers.get('gl-workspace-switch')({sender},'learning');
  assert.deepEqual([...h.handlers.get('gl-panel-restore-session')({sender})],[]);
  await h.handlers.get('gl-workspace-switch')({sender},custom.id);
  const restored=h.handlers.get('gl-panel-restore-session')({sender});
  assert.deepEqual([...restored].sort(),['coach','history','play-with-me']);
  for(const id of restored)await h.handlers.get('gl-panel-open')({sender},id,id,true);
  const actual=new Map(h.windows.slice(-3).map(p=>[p._glPanelId,p.getBounds()]));
  for(const [id,bounds] of expected)assert.deepEqual(actual.get(id),bounds);
});

test('RÉPARTIR rejects foreign or inactive workspace requests and handles no panels',async()=>{
  const h=bootMain();
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const distribute=h.handlers.get('gl-workspace-distribute');
  assert.throws(()=>distribute({sender:{}},'learning'),/non autorisée/);
  assert.throws(()=>distribute({sender},'practice'),/non actif/);
  assert.throws(()=>distribute({sender},'unknown'),/non actif/);
  assert.deepEqual({...distribute({sender},'learning')},
    {id:'learning',arranged:0,displays:0});
  assert.equal(h.windows.length,2);
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  const popup=h.windows[2];
  popup.minimized=true;
  const before=popup.getBounds();
  assert.equal(distribute({sender},'learning').arranged,0);
  assert.deepEqual(popup.getBounds(),before,'minimized panels must not be moved');
});

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
  assert.deepEqual([...main.webContents.sent.at(-1).args], ['practice', 'manual']);
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


test('Apprentissage, Entraînement and Improvisation keep independent floating layouts', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-workspaces-'));
  t.after(() => fs.rmSync(directory, {recursive:true, force:true}));
  const h = bootMain({layoutDirectory: directory});
  await Promise.resolve();
  const sender = h.windows[1].webContents;
  const get = h.handlers.get('gl-workspace-get');
  const switchTo = h.handlers.get('gl-workspace-switch');
  const open = h.handlers.get('gl-panel-open');
  assert.deepEqual(JSON.parse(JSON.stringify(get({sender}))),
    {id:'learning', openPanels:[], autoArrange:false});

  await open({sender}, 'coach', 'COACHS');
  const original = h.windows[2];
  original.setBounds({x:150,y:110,width:520,height:720});
  const training = await switchTo({sender}, 'practice');
  assert.equal(training.id, 'practice');
  assert.deepEqual([...training.openPanels], []);
  assert.equal(original.destroyed, true);
  assert.equal(h.windows[1].destroyed, false, 'TAB/transport stay in their original window');
  const lastClose = sender.sent.filter(e => e.channel === 'gl-panel-closed').at(-1);
  assert.equal(lastClose.args[1], 'workspace-switch');

  await open({sender}, 'practice', 'ENTRAÎNEMENT');
  h.windows[3].setBounds({x:600,y:120,width:570,height:690});
  const improvisation = await switchTo({sender}, 'improv');
  assert.deepEqual([...improvisation.openPanels], []);
  await open({sender}, 'liberty', 'MODE LIBERTÉ');
  h.windows[4].setBounds({x:890,y:80,width:470,height:680});

  const learning = await switchTo({sender}, 'learning');
  assert.deepEqual([...learning.openPanels], ['coach']);
  await open({sender}, 'coach', 'COACHS', true);
  assert.deepEqual(h.windows[5].getBounds(),
    {x:150,y:110,width:520,height:720});

  const trainingAgain = await switchTo({sender}, 'practice');
  assert.deepEqual([...trainingAgain.openPanels], ['practice']);
  await open({sender}, 'practice', 'ENTRAÎNEMENT', true);
  assert.deepEqual(h.windows[6].getBounds(),
    {x:600,y:120,width:570,height:690});

  const layouts = JSON.parse(fs.readFileSync(
    path.join(directory, 'detached-panel-layouts.json'), 'utf8'));
  assert.equal(layouts.version, 1);
  assert.equal(layouts.activeWorkspace, 'practice');
  assert.deepEqual(layouts.workspaces.learning.openPanels, ['coach']);
  assert.deepEqual(layouts.workspaces.practice.openPanels, ['practice']);
  assert.deepEqual(layouts.workspaces.improv.openPanels, ['liberty']);
  assert.deepEqual(layouts.workspaces.improv.panels.liberty,
    {x:890,y:80,width:470,height:680});

  const anotherRun = bootMain({layoutDirectory: directory});
  await Promise.resolve();
  const nextSender = anotherRun.windows[1].webContents;
  assert.deepEqual(JSON.parse(JSON.stringify(
    anotherRun.handlers.get('gl-workspace-get')({sender:nextSender})
  )), {id:'practice',openPanels:['practice'],autoArrange:false});
});

test('reattaching a panel only affects the active workspace preset', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-preset-close-'));
  t.after(() => fs.rmSync(directory, {recursive:true, force:true}));
  const h = bootMain({layoutDirectory:directory});
  await Promise.resolve();
  const sender = h.windows[1].webContents;
  const open = h.handlers.get('gl-panel-open');
  const switchTo = h.handlers.get('gl-workspace-switch');
  await open({sender}, 'play-with-me', 'JOUE AVEC MOI');
  await switchTo({sender}, 'practice');
  await open({sender}, 'play-with-me', 'JOUE AVEC MOI');
  h.emit('gl-panel-reattach', h.windows[3].webContents, 'play-with-me');
  assert.equal(h.windows[3].destroyed, true);
  const training = await switchTo({sender}, 'learning');
  assert.deepEqual([...training.openPanels], ['play-with-me']);
  const other = await switchTo({sender}, 'practice');
  assert.deepEqual([...other.openPanels], []);
});

test('legacy layouts migrate to Apprentissage without losing panel dimensions', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-preset-migrate-'));
  t.after(() => fs.rmSync(directory, {recursive:true, force:true}));
  fs.writeFileSync(path.join(directory, 'detached-panel-layouts.json'),
    JSON.stringify({version:1,
      panels:{practice:{x:140,y:80,width:520,height:650}},
      openPanels:['practice']}));
  const h = bootMain({layoutDirectory:directory});
  await Promise.resolve();
  const sender = h.windows[1].webContents;
  assert.deepEqual(JSON.parse(JSON.stringify(
    h.handlers.get('gl-workspace-get')({sender})
  )),{id:'learning',openPanels:['practice']});
  await h.handlers.get('gl-panel-open')({sender},'practice','ENTRAÎNEMENT',true);
  assert.deepEqual(h.windows[2].getBounds(),
    {x:140,y:80,width:520,height:650});
  const next = await h.handlers.get('gl-workspace-switch')({sender},'improv');
  assert.deepEqual([...next.openPanels],[]);
});

test('invalid or unauthorized workspace requests cannot alter the active preset', async () => {
  const h = bootMain();await Promise.resolve();
  const sender = h.windows[1].webContents;
  const swap = h.handlers.get('gl-workspace-switch');
  const get = h.handlers.get('gl-workspace-get');
  await assert.rejects(swap({sender}, 'unknown'), /non autorisé/);
  await assert.rejects(swap({sender:{}}, 'practice'), /non autorisé/);
  assert.throws(() => get({sender:{}}), /non autorisé/);
  assert.equal(get({sender}).id,'learning');
  assert.equal(h.windows.length,2);
});


test('ENREGISTRER saves the active workspace geometry without changing other profiles', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-layout-save-'));
  t.after(() => fs.rmSync(directory, {recursive:true, force:true}));
  const h = bootMain({layoutDirectory:directory});
  await Promise.resolve();
  const sender = h.windows[1].webContents;
  const open = h.handlers.get('gl-panel-open');
  const switchTo = h.handlers.get('gl-workspace-switch');
  const save = h.handlers.get('gl-workspace-save');
  await open({sender}, 'coach', 'COACHS');
  h.windows[2].setBounds({x:250,y:100,width:510,height:660});
  assert.deepEqual(JSON.parse(JSON.stringify(save({sender}, 'learning'))),
    {id:'learning',saved:true});
  await switchTo({sender}, 'practice');
  await open({sender}, 'play-with-me', 'JOUE AVEC MOI');
  h.windows[3].setBounds({x:750,y:100,width:510,height:700});
  assert.deepEqual(JSON.parse(JSON.stringify(save({sender}, 'practice'))),
    {id:'practice',saved:true});
  const saved = JSON.parse(fs.readFileSync(path.join(directory,
    'detached-panel-layouts.json'),'utf8'));
  assert.deepEqual(saved.workspaces.learning.panels.coach,
    {x:250,y:100,width:510,height:660});
  assert.deepEqual(saved.workspaces.practice.panels['play-with-me'],
    {x:750,y:100,width:510,height:700});
  assert.deepEqual(saved.workspaces.learning.openPanels,['coach']);
  assert.deepEqual(saved.workspaces.practice.openPanels,['play-with-me']);
});

test('RÉINITIALISER closes only the selected preset and retains other layouts', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-layout-reset-'));
  t.after(() => fs.rmSync(directory,{recursive:true,force:true}));
  const h = bootMain({layoutDirectory:directory});
  await Promise.resolve();
  const sender = h.windows[1].webContents;
  const open = h.handlers.get('gl-panel-open');
  const switchTo = h.handlers.get('gl-workspace-switch');
  const reset = h.handlers.get('gl-workspace-reset');
  await open({sender}, 'coach', 'COACHS');
  h.windows[2].setBounds({x:150,y:90,width:520,height:650});
  await switchTo({sender},'practice');
  await open({sender}, 'practice', 'ENTRAÎNEMENT');
  h.windows[3].setBounds({x:840,y:110,width:500,height:700});
  await switchTo({sender},'improv');
  await open({sender}, 'liberty', 'MODE LIBERTÉ');
  h.windows[4].setBounds({x:1000,y:80,width:440,height:610});
  const resetResult = await reset({sender},'improv');
  assert.deepEqual(JSON.parse(JSON.stringify(resetResult)),
    {id:'improv',reset:true,openPanels:[]});
  assert.equal(h.windows[4].destroyed,true);
  assert.equal(h.windows[1].destroyed,false,'central score must remain open');
  const closed = sender.sent.filter(entry => entry.channel === 'gl-panel-closed').at(-1);
  assert.deepEqual([...closed.args],['liberty','workspace-reset']);
  const saved = JSON.parse(fs.readFileSync(
    path.join(directory,'detached-panel-layouts.json'),'utf8'));
  assert.deepEqual(saved.workspaces.improv.openPanels,[]);
  assert.deepEqual(saved.workspaces.improv.panels,{});
  assert.deepEqual(saved.workspaces.learning.openPanels,['coach']);
  assert.deepEqual(saved.workspaces.practice.openPanels,['practice']);
  assert.deepEqual(saved.workspaces.practice.panels.practice,
    {x:840,y:110,width:500,height:700});
  const learning = await switchTo({sender},'learning');
  assert.deepEqual([...learning.openPanels],['coach']);
  await open({sender},'coach','COACHS',true);
  assert.deepEqual(h.windows[5].getBounds(),
    {x:150,y:90,width:520,height:650});
});

test('workspace save and reset reject foreign senders or inactive presets', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'gl-layout-auth-'));
  t.after(() => fs.rmSync(directory,{recursive:true,force:true}));
  const h = bootMain({layoutDirectory:directory});
  await Promise.resolve();
  const sender = h.windows[1].webContents;
  const impostor = {sent:[]};
  const save = h.handlers.get('gl-workspace-save');
  const reset = h.handlers.get('gl-workspace-reset');
  assert.throws(() => save({sender:impostor},'learning'),/non autorisé/);
  assert.throws(() => save({sender},'unknown'),/non autorisé/);
  assert.throws(() => save({sender},'practice'),/non actif/);
  await assert.rejects(reset({sender:impostor},'learning'),/non autorisée/);
  await assert.rejects(reset({sender},'unknown'),/non autorisée/);
  await assert.rejects(reset({sender},'practice'),/non actif/);
  const state = h.handlers.get('gl-workspace-get')({sender});
  assert.equal(state.id,'learning');
  assert.equal(h.windows.length,2);
});


test('named custom spaces are validated, unique and cannot overwrite built-in names', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-named-spaces-'));
  t.after(() => fs.rmSync(folder,{recursive:true,force:true}));
  const h=bootMain({layoutDirectory:folder});await Promise.resolve();
  const sender=h.windows[1].webContents;
  const list=h.handlers.get('gl-workspace-list');
  const create=h.handlers.get('gl-workspace-create');
  const rename=h.handlers.get('gl-workspace-rename');
  assert.deepEqual(JSON.parse(JSON.stringify(list({sender}))).map(p=>p.id),
    ['learning','practice','improv']);
  const created=create({sender},'  Blues   Jazz  ');
  assert.deepEqual(JSON.parse(JSON.stringify(created)),
    {id:'custom-1',label:'Blues Jazz',builtIn:false});
  assert.equal(list({sender}).length,4);
  assert.throws(()=>create({sender},'blues jazz'),/déjà ce nom/);
  assert.throws(()=>create({sender},'APPRENTISSAGE'),/déjà ce nom/);
  assert.throws(()=>create({sender},'   '),/1 à 32/);
  assert.throws(()=>create({sender},'x'.repeat(33)),/1 à 32/);
  assert.throws(()=>rename({sender},'learning','Cours'),/personnalisés/);
  assert.throws(()=>rename({sender},'custom-1','Entraînement'),/déjà ce nom/);
  const renamed=rename({sender},'custom-1','Mes accords');
  assert.deepEqual(JSON.parse(JSON.stringify(renamed)),
    {id:'custom-1',label:'Mes accords',builtIn:false});
  const saved=JSON.parse(fs.readFileSync(
    path.join(folder,'detached-panel-layouts.json'),'utf8'));
  assert.deepEqual(saved.customWorkspaces,[{id:'custom-1',label:'Mes accords'}]);
  const next=bootMain({layoutDirectory:folder});await Promise.resolve();
  assert.equal(next.handlers.get('gl-workspace-list')({
    sender:next.windows[1].webContents
  }).at(-1).label,'Mes accords');
});

test('custom workspace has its own floating panels and remains active after restart',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-personal-layout-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const h=bootMain({layoutDirectory:folder});await Promise.resolve();
  const sender=h.windows[1].webContents;
  const create=h.handlers.get('gl-workspace-create');
  const select=h.handlers.get('gl-workspace-switch');
  const open=h.handlers.get('gl-panel-open');
  const named=create({sender},'Impro Fusion');
  const selected=await select({sender},named.id);
  assert.equal(selected.id,named.id);
  await open({sender},'practice','ENTRAÎNEMENT');
  const floating=h.windows[2];
  floating.setBounds({x:750,y:120,width:590,height:690});
  await select({sender},'learning');
  assert.equal(floating.destroyed,true);
  assert.deepEqual([...h.handlers.get('gl-workspace-get')({sender}).openPanels],[]);
  const again=await select({sender},named.id);
  assert.deepEqual([...again.openPanels],['practice']);
  await open({sender},'practice','ENTRAÎNEMENT',true);
  assert.deepEqual(h.windows[3].getBounds(),
    {x:750,y:120,width:590,height:690});
  h.windows[1].close();
  const reopened=bootMain({layoutDirectory:folder});await Promise.resolve();
  const nextSender=reopened.windows[1].webContents;
  assert.equal(reopened.handlers.get('gl-workspace-get')({sender:nextSender}).id,named.id);
  const restored=reopened.handlers.get('gl-panel-restore-session')({sender:nextSender});
  assert.deepEqual([...restored],['practice']);
});

test('custom presets can be deleted only when inactive; other layouts stay safe',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-custom-delete-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const h=bootMain({layoutDirectory:folder});await Promise.resolve();
  const sender=h.windows[1].webContents;
  const create=h.handlers.get('gl-workspace-create');
  const select=h.handlers.get('gl-workspace-switch');
  const deleteCustom=h.handlers.get('gl-workspace-delete');
  const first=create({sender},'Solo');
  const second=create({sender},'Composition');
  await select({sender},first.id);
  await assert.rejects(async()=>deleteCustom({sender},first.id),/autre espace/);
  await select({sender},second.id);
  assert.deepEqual(JSON.parse(JSON.stringify(deleteCustom({sender},first.id))),
    {id:first.id,deleted:true});
  assert.throws(()=>deleteCustom({sender},'learning'),/trois espaces/);
  assert.throws(()=>deleteCustom({sender},'ghost'),/trois espaces/);
  assert.deepEqual([...h.handlers.get('gl-workspace-list')({sender})].map(p=>p.id),
    ['learning','practice','improv',second.id]);
  await select({sender},'learning');
  assert.deepEqual(JSON.parse(JSON.stringify(deleteCustom({sender},second.id))),
    {id:second.id,deleted:true});
  assert.equal(h.handlers.get('gl-workspace-list')({sender}).length,3);
  const contents=JSON.parse(fs.readFileSync(
    path.join(folder,'detached-panel-layouts.json'),'utf8'));
  assert.deepEqual(contents.customWorkspaces,[]);
  assert.ok(contents.workspaces.learning,'default profile must survive');
});

test('custom workspace count and authorization are enforced in native IPC', async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-custom-limit-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const h=bootMain({layoutDirectory:folder});await Promise.resolve();
  const sender=h.windows[1].webContents;
  const bad={};
  const create=h.handlers.get('gl-workspace-create');
  const list=h.handlers.get('gl-workspace-list');
  const rename=h.handlers.get('gl-workspace-rename');
  const remove=h.handlers.get('gl-workspace-delete');
  assert.throws(()=>create({sender:bad},'Test'),/non autorisé/);
  assert.throws(()=>list({sender:bad}),/non autorisé/);
  assert.throws(()=>rename({sender:bad},'custom-1','Test'),/non autorisé/);
  assert.throws(()=>remove({sender:bad},'custom-1'),/non autorisé/);
  for(let i=1;i<=8;i++){
    const custom=create({sender},'Cours '+i);
    assert.equal(custom.id,'custom-'+i);
  }
  assert.throws(()=>create({sender},'Cours 9'),/Huit espaces/);
  assert.equal(list({sender}).length,11);
});

test('malformed custom preset metadata is rejected without losing base profiles', async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-custom-corrupt-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  fs.writeFileSync(path.join(folder,'detached-panel-layouts.json'),JSON.stringify({
    version:1,activeWorkspace:'custom-999',
    customWorkspaces:[
      {id:'custom-1',label:'Ma séance'},
      {id:'evil;id',label:'Not allowed'},
      {id:'custom-2',label:'Ma séance'},
      {id:'custom-3',label:'APPRENTISSAGE'}
    ],
    workspaces:{'custom-1':{panels:{},openPanels:['coach']}}
  }));
  const h=bootMain({layoutDirectory:folder});await Promise.resolve();
  const sender=h.windows[1].webContents;
  const ids=[...h.handlers.get('gl-workspace-list')({sender})].map(p=>p.id);
  assert.deepEqual(ids,['learning','practice','improv','custom-1']);
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).id,'learning');
  await h.handlers.get('gl-workspace-switch')({sender},'custom-1');
  assert.deepEqual([...h.handlers.get('gl-panel-restore-session')({sender})],
    ['coach']);
});
