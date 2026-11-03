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
    restore() { this.minimized=false; this.emit('restore'); }
    minimize() { this.minimized=true; }
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
            getDisplayMatching: bounds => {
              const visible = area => {
                const rect = area.workArea || area;
                return Math.max(0, Math.min(bounds.x+bounds.width,rect.x+rect.width) -
                  Math.max(bounds.x,rect.x)) *
                  Math.max(0, Math.min(bounds.y+bounds.height,rect.y+rect.height) -
                  Math.max(bounds.y,rect.y));
              };
              return displays.reduce((best,display) =>
                !best || visible(display)>visible(best) ? display : best,
                null) || displays[0];
            },
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
    {id:'learning', openPanels:[], autoArrange:false,layoutStyle:'mosaic',screenMode:'secondary-first'});

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
  )), {id:'practice',openPanels:['practice'],autoArrange:false,layoutStyle:'mosaic',screenMode:'secondary-first'});
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
  )),{id:'learning',openPanels:['practice'],autoArrange:false,layoutStyle:'mosaic',screenMode:'secondary-first'});
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

test('DISPOSITION style persists independently and rearranges existing windows immediately',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-layout-style-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({layoutDirectory:folder,displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const setStyle=h.handlers.get('gl-workspace-layout-style');
  const switchTo=h.handlers.get('gl-workspace-switch');
  const open=h.handlers.get('gl-panel-open');
  const get=h.handlers.get('gl-workspace-get');
  assert.equal(get({sender}).layoutStyle,'mosaic');
  for(const id of ['coach','practice','history','play-with-me'])await open({sender},id,id);
  const windows=h.windows.slice(2);
  const before=windows.map(w=>w.getBounds());
  const columns=setStyle({sender},'learning','columns');
  assert.equal(columns.style,'columns');
  assert.equal(columns.arranged,4);
  assert.equal(columns.displays,1);
  assert.equal(get({sender}).layoutStyle,'columns');
  const columnBounds=windows.map(w=>w.getBounds());
  assert.notDeepEqual(columnBounds,before);
  assert.equal(columnBounds[0].y,columnBounds[3].y);
  const cascade=setStyle({sender},'learning','cascade');
  assert.equal(cascade.style,'cascade');
  const cascadeBounds=windows.map(w=>w.getBounds());
  assert.ok(cascadeBounds[1].x>cascadeBounds[0].x);
  assert.ok(cascadeBounds[1].y>cascadeBounds[0].y);
  assert.equal(h.windows[1].destroyed,false,'score and playback host stay mounted');

  const training=await switchTo({sender},'practice');
  assert.equal(training.layoutStyle,'mosaic');
  assert.equal(setStyle({sender},'practice','columns').style,'columns');
  const created=h.handlers.get('gl-workspace-create')({sender},'Session colonnes');
  assert.equal((await switchTo({sender},created.id)).layoutStyle,'mosaic');
  setStyle({sender},created.id,'cascade');
  assert.equal((await switchTo({sender},'learning')).layoutStyle,'cascade');
  h.windows[1].close();

  const stored=JSON.parse(fs.readFileSync(
    path.join(folder,'detached-panel-layouts.json'),'utf8'));
  assert.equal(stored.workspaces.learning.layoutStyle,'cascade');
  assert.equal(stored.workspaces.practice.layoutStyle,'columns');
  assert.equal(stored.workspaces.improv.layoutStyle,'mosaic');
  assert.equal(stored.workspaces[created.id].layoutStyle,'cascade');
  const restarted=bootMain({layoutDirectory:folder});
  await Promise.resolve();
  const nextSender=restarted.windows[1].webContents;
  assert.equal(restarted.handlers.get('gl-workspace-get')({sender:nextSender}).layoutStyle,'cascade');
  assert.equal((await restarted.handlers.get('gl-workspace-switch')({sender:nextSender},created.id)).layoutStyle,'cascade');
  await restarted.handlers.get('gl-workspace-reset')({sender:nextSender},created.id);
  assert.equal(restarted.handlers.get('gl-workspace-get')({sender:nextSender}).layoutStyle,'mosaic');
  assert.equal((await restarted.handlers.get('gl-workspace-switch')({sender:nextSender},'learning')).layoutStyle,'cascade',
    'reset of a custom workspace must not affect built-in layouts');
});

test('invalid, inactive and unauthorized DISPOSITION requests cannot alter saved styles',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-layout-style-invalid-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const h=bootMain({layoutDirectory:folder});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const setStyle=h.handlers.get('gl-workspace-layout-style');
  assert.throws(()=>setStyle({sender:{}},'learning','columns'),/non autorisé/);
  assert.throws(()=>setStyle({sender},'practice','columns'),/non autorisé/);
  assert.throws(()=>setStyle({sender},'learning','tiles'),/non autorisé/);
  assert.throws(()=>setStyle({sender},'learning',{}),/non autorisé/);
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).layoutStyle,'mosaic');
  const file=path.join(folder,'detached-panel-layouts.json');
  h.windows[1].close();
  const stored=JSON.parse(fs.readFileSync(file,'utf8'));
  stored.workspaces.learning.layoutStyle='dangerous-unknown';
  fs.writeFileSync(file,JSON.stringify(stored));
  const restarted=bootMain({layoutDirectory:folder});
  await Promise.resolve();
  assert.equal(restarted.handlers.get('gl-workspace-get')({
    sender:restarted.windows[1].webContents
  }).layoutStyle,'mosaic','corrupt saved style falls back to Mosaïque');
});

test('ÉCRANS policy is per workspace, applies immediately and survives restart',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-screen-policy-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({layoutDirectory:folder,displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const open=h.handlers.get('gl-panel-open');
  const setScreen=h.handlers.get('gl-workspace-screen-mode');
  const switchTo=h.handlers.get('gl-workspace-switch');
  const setStyle=h.handlers.get('gl-workspace-layout-style');
  const get=h.handlers.get('gl-workspace-get');
  assert.equal(get({sender}).screenMode,'secondary-first');
  for(const id of ['coach','practice','history'])await open({sender},id,id);
  const windows=h.windows.slice(2);
  const before=windows.map(w=>w.getBounds());
  assert.equal(setScreen({sender},'learning','primary').mode,'primary');
  assert.ok(windows.every(w=>w.getBounds().x<1600));
  assert.notDeepEqual(windows.map(w=>w.getBounds()),before);
  setStyle({sender},'learning','cascade');
  assert.equal(setScreen({sender},'learning','secondary').mode,'secondary');
  assert.ok(windows.every(w=>w.getBounds().x>=1600));
  assert.equal(get({sender}).layoutStyle,'cascade',
    'screen choice must not reset Mosaïque/Colonnes/Cascade');
  assert.equal(get({sender}).screenMode,'secondary');

  assert.equal((await switchTo({sender},'practice')).screenMode,'secondary-first');
  setScreen({sender},'practice','all');
  const custom=h.handlers.get('gl-workspace-create')({sender},'Studio multi-écrans');
  await switchTo({sender},custom.id);
  setScreen({sender},custom.id,'primary');
  assert.equal((await switchTo({sender},'learning')).screenMode,'secondary');
  h.windows[1].close();

  const saved=JSON.parse(fs.readFileSync(
    path.join(folder,'detached-panel-layouts.json'),'utf8'));
  assert.equal(saved.workspaces.learning.screenMode,'secondary');
  assert.equal(saved.workspaces.practice.screenMode,'all');
  assert.equal(saved.workspaces.improv.screenMode,'secondary-first');
  assert.equal(saved.workspaces[custom.id].screenMode,'primary');
  const restarted=bootMain({layoutDirectory:folder});
  await Promise.resolve();
  const nextSender=restarted.windows[1].webContents;
  assert.equal(restarted.handlers.get('gl-workspace-get')({sender:nextSender}).screenMode,'secondary');
  assert.equal((await restarted.handlers.get('gl-workspace-switch')({sender:nextSender},custom.id)).screenMode,'primary');
  await restarted.handlers.get('gl-workspace-reset')({sender:nextSender},custom.id);
  assert.equal(restarted.handlers.get('gl-workspace-get')({sender:nextSender}).screenMode,'secondary-first');
  assert.equal((await restarted.handlers.get('gl-workspace-switch')({sender:nextSender},'learning')).screenMode,'secondary');
});

test('ÉCRANS rejects invalid and unauthorized policies and recovers malformed JSON',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-screen-policy-security-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const h=bootMain({layoutDirectory:folder});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const setScreen=h.handlers.get('gl-workspace-screen-mode');
  assert.throws(()=>setScreen({sender:{}},'learning','primary'),/non autorisé/);
  assert.throws(()=>setScreen({sender},'practice','primary'),/non autorisé/);
  assert.throws(()=>setScreen({sender},'learning','invalid'),/non autorisé/);
  assert.throws(()=>setScreen({sender},'learning',{}),/non autorisé/);
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).screenMode,'secondary-first');
  h.windows[1].close();
  const file=path.join(folder,'detached-panel-layouts.json');
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  saved.workspaces.learning.screenMode='garbage';
  fs.writeFileSync(file,JSON.stringify(saved));
  const restarted=bootMain({layoutDirectory:folder});
  await Promise.resolve();
  assert.equal(restarted.handlers.get('gl-workspace-get')({
    sender:restarted.windows[1].webContents
  }).screenMode,'secondary-first');
});

test('secondary-only AUTO recovers on monitor disconnect without changing music host',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  h.handlers.get('gl-workspace-screen-mode')({sender},'learning','secondary');
  h.handlers.get('gl-workspace-auto-arrange')({sender},'learning',true);
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  await h.handlers.get('gl-panel-open')({sender},'practice','ENTRAÎNEMENT');
  const windows=h.windows.slice(2);
  assert.ok(windows.every(w=>w.getBounds().x>=1600));
  const initialCount=h.windows.length;
  displays.pop();
  h.emitDisplay('display-removed');
  assert.equal(h.windows.length,initialCount,'monitor changes must not duplicate renderers');
  assert.ok(windows.every(w=>w.getBounds().x+w.getBounds().width<=1600));
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).screenMode,'secondary');
  assert.equal(h.windows[1].destroyed,false,'main playback and tablature remain active');
});

test('manual windows return to their exact second-monitor positions on reconnect',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-topology-return-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const displays=[
    {id:11,workArea:{x:0,y:0,width:1600,height:900}},
    {id:22,workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({layoutDirectory:folder,displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const open=h.handlers.get('gl-panel-open');
  await open({sender},'coach','COACH');
  await open({sender},'play-with-me','JOUE AVEC MOI');
  const [coach,play]=h.windows.slice(2);
  const coachHome={x:1820,y:100,width:510,height:700};
  const playHome={x:2590,y:170,width:590,height:740};
  coach.setBounds(coachHome);
  play.setBounds(playHome);
  const count=h.windows.length;
  const renderer=coach.webContents;
  displays.pop();
  // Simulate the OS moving a window before the display-removed event.
  coach.setBounds({x:90,y:90,width:510,height:700});
  h.emitDisplay('display-removed');
  assert.ok(coach.getBounds().x+coach.getBounds().width<=1600);
  assert.ok(play.getBounds().x+play.getBounds().width<=1600);
  const fallback=coach.getBounds();
  coach.setBounds({x:270,y:140,width:510,height:700});
  assert.notDeepEqual(coach.getBounds(),fallback,
    'single-monitor manual edits should have their own snapshot');
  displays.push({id:22,workArea:{x:1600,y:0,width:1920,height:1080}});
  h.emitDisplay('display-added');
  assert.deepEqual(coach.getBounds(),coachHome);
  assert.deepEqual(play.getBounds(),playHome);
  assert.equal(h.windows.length,count,'no new renderer or duplicated audio');
  assert.equal(coach.webContents,renderer);
  assert.equal(coach.focused,false,'monitor recovery must not steal focus');
  h.windows[1].close();
  const stored=JSON.parse(fs.readFileSync(
    path.join(folder,'detached-panel-layouts.json'),'utf8'));
  assert.equal(Object.keys(stored.workspaces.learning.displayLayouts).length,2);
  assert.deepEqual(stored.workspaces.learning.panels.coach,coachHome);
});

test('reconnect restores the old monitor geometry even after app restart offline',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-topology-restart-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const displays=[
    {id:1,workArea:{x:0,y:0,width:1600,height:900}},
    {id:2,workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({layoutDirectory:folder,displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  const original={x:1940,y:150,width:530,height:650};
  h.windows[2].setBounds(original);
  displays.pop();
  h.emitDisplay('display-removed');
  const oneScreen=h.windows[2].getBounds();
  assert.ok(oneScreen.x+oneScreen.width<=1600);
  h.windows[1].close();

  const restartedDisplays=[{id:1,workArea:{x:0,y:0,width:1600,height:900}}];
  const restarted=bootMain({layoutDirectory:folder,displays:restartedDisplays});
  await Promise.resolve();
  const nextSender=restarted.windows[1].webContents;
  await restarted.handlers.get('gl-panel-open')({sender:nextSender},'coach','COACH',true);
  assert.deepEqual(restarted.windows[2].getBounds(),oneScreen);
  restartedDisplays.push({id:2,workArea:{x:1600,y:0,width:1920,height:1080}});
  restarted.emitDisplay('display-added');
  assert.deepEqual(restarted.windows[2].getBounds(),original,
    'manual geometry must survive an offline restart');
});

test('manual topology snapshots stay independent across workspaces and display resolutions',async()=>{
  const displays=[
    {id:1,workArea:{x:0,y:0,width:1600,height:900}},
    {id:2,workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const open=h.handlers.get('gl-panel-open');
  const switchTo=h.handlers.get('gl-workspace-switch');
  await open({sender},'coach','COACH');
  const learning={x:1850,y:100,width:510,height:650};
  h.windows.at(-1).setBounds(learning);
  await switchTo({sender},'practice');
  await open({sender},'coach','COACH');
  const training={x:2480,y:220,width:560,height:650};
  h.windows.at(-1).setBounds(training);
  displays[1].workArea={x:1600,y:0,width:1500,height:850};
  h.emitDisplay('display-metrics-changed');
  const resized=h.windows.at(-1).getBounds();
  assert.notDeepEqual(resized,training);
  displays[1].workArea={x:1600,y:0,width:1920,height:1080};
  h.emitDisplay('display-metrics-changed');
  assert.deepEqual(h.windows.at(-1).getBounds(),training,
    'restoring monitor resolution restores this workspace geometry');
  await switchTo({sender},'learning');
  await open({sender},'coach','COACH');
  assert.deepEqual(h.windows.at(-1).getBounds(),learning,
    'workspace switching must not import another workspace position');
  await switchTo({sender},'practice');
  await open({sender},'coach','COACH');
  assert.deepEqual(h.windows.at(-1).getBounds(),training);
});

test('minimized panel returns to its saved monitor after reconnect only on restore',async()=>{
  const displays=[
    {id:1,workArea:{x:0,y:0,width:1600,height:900}},
    {id:2,workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  const popup=h.windows.at(-1);
  const saved={x:2100,y:170,width:530,height:640};
  popup.setBounds(saved);
  popup.minimized=true;
  displays.pop();
  h.emitDisplay('display-removed');
  assert.deepEqual(popup.getBounds(),saved);
  popup.minimized=false;
  popup.emit('restore');
  assert.ok(popup.getBounds().x+popup.getBounds().width<=1600);
  popup.minimized=true;
  displays.push({id:2,workArea:{x:1600,y:0,width:1920,height:1080}});
  h.emitDisplay('display-added');
  assert.ok(popup.getBounds().x<1600,'minimized window must not be moved on hotplug');
  popup.minimized=false;
  popup.emit('restore');
  assert.deepEqual(popup.getBounds(),saved);
  assert.equal(popup.focused,false);
});

test('AUTO follows the main score window across screens, not individual drag pixels',async()=>{
  const displays=[
    {id:1,workArea:{x:0,y:0,width:1600,height:900}},
    {id:2,workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const main=h.windows[1];
  const open=h.handlers.get('gl-panel-open');
  const setAuto=h.handlers.get('gl-workspace-auto-arrange');
  setAuto({sender},'learning',true);
  await open({sender},'coach','COACH');
  await open({sender},'history','HISTORIQUE');
  const [coach,history]=h.windows.slice(2);
  assert.ok(coach.getBounds().x>=1600 && history.getBounds().x>=1600);
  const count=h.windows.length;
  const originalWebContents=coach.webContents;

  main.setBounds({x:1780,y:60,width:1440,height:900});
  assert.ok(coach.getBounds().x+coach.getBounds().width<=1600);
  assert.ok(history.getBounds().x+history.getBounds().width<=1600);
  const custom={x:85,y:100,width:510,height:640};
  coach.setBounds(custom);
  main.setBounds({x:1860,y:90,width:1400,height:870});
  assert.deepEqual(coach.getBounds(),custom,
    'a move inside the same screen must not trigger a redundant reflow');

  main.setBounds({x:40,y:30,width:1440,height:850});
  assert.ok(coach.getBounds().x>=1600 && history.getBounds().x>=1600);
  assert.equal(h.windows.length,count);
  assert.equal(coach.webContents,originalWebContents,
    'no detached renderer or audio playback engine should be recreated');
  assert.equal(main.destroyed,false);
});

test('main window display tracking respects each workspace and manual layouts',async()=>{
  const displays=[
    {id:1,workArea:{x:0,y:0,width:1600,height:900}},
    {id:2,workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const main=h.windows[1];
  const open=h.handlers.get('gl-panel-open');
  const setAuto=h.handlers.get('gl-workspace-auto-arrange');
  const setMode=h.handlers.get('gl-workspace-screen-mode');
  const switchTo=h.handlers.get('gl-workspace-switch');

  await open({sender},'coach','COACH');
  const manual=h.windows.at(-1);
  const manualBounds={x:1790,y:90,width:540,height:690};
  manual.setBounds(manualBounds);
  main.setBounds({x:1760,y:40,width:1400,height:900});
  assert.deepEqual(manual.getBounds(),manualBounds,
    'manual workspace must not follow the main window');
  await switchTo({sender},'practice');
  setAuto({sender},'practice',true);
  setMode({sender},'practice','primary');
  await open({sender},'coach','COACH');
  const training=h.windows.at(-1);
  assert.ok(training.getBounds().x>=1600,
    'primary mode follows the current score display');
  main.setBounds({x:50,y:30,width:1400,height:850});
  assert.ok(training.getBounds().x+training.getBounds().width<=1600,
    'primary mode follows the main window back to the first display');
  await switchTo({sender},'learning');
  await open({sender},'coach','COACH');
  assert.deepEqual(h.windows.at(-1).getBounds(),manualBounds,
    'the original manual workspace retains its independent geometry');
});

test('minimizing the main window defers AUTO redistribution until restore',async()=>{
  const displays=[
    {id:1,workArea:{x:0,y:0,width:1600,height:900}},
    {id:2,workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const main=h.windows[1];
  h.handlers.get('gl-workspace-auto-arrange')({sender},'learning',true);
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  const popup=h.windows.at(-1);
  const initial=popup.getBounds();
  main.minimized=true;
  main.setBounds({x:1800,y:50,width:1440,height:900});
  assert.deepEqual(popup.getBounds(),initial);
  main.minimized=false;
  main.emit('restore');
  assert.ok(popup.getBounds().x+popup.getBounds().width<=1600);
  assert.equal(popup.focused,false,'restore must not steal keyboard focus');
});

test('PLAN DES ÉCRANS maps real monitors, native windows and minimized state',async()=>{
  const displays=[
    {id:11,workArea:{x:0,y:0,width:1600,height:900}},
    {id:22,workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const map=h.handlers.get('gl-workspace-screen-map');
  const open=h.handlers.get('gl-panel-open');
  const empty=map({sender},'learning');
  assert.equal(empty.id,'learning');
  assert.equal(empty.screens.length,2);
  assert.equal(empty.screens[0].main,true);
  assert.equal(empty.screens[1].main,false);
  assert.deepEqual([...empty.panels],[]);
  await open({sender},'coach','COACH');
  await open({sender},'history','HISTORIQUE');
  const [coach,history]=h.windows.slice(2);
  coach.setBounds({x:1900,y:90,width:510,height:640});
  history.setBounds({x:100,y:70,width:530,height:670});
  history.minimized=true;
  const data=map({sender},'learning');
  assert.equal(data.panels.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(
    data.panels.map(p=>[p.id,p.title,p.displayIndex,p.minimized]))),[
    ['coach','COACH',1,false],['history','HISTORIQUE',0,true]
  ]);
  assert.deepEqual({...data.panels[0].bounds},coach.getBounds());
  assert.equal(data.style,'mosaic');
  assert.equal(data.mode,'secondary-first');
  assert.equal(data.auto,false);
  assert.equal(h.windows.length,4,'preview must not open another window');
  assert.equal(h.windows[1].focused,false,'preview must not steal focus');
});

test('PLAN DES ÉCRANS locates existing native panels without recreating playback',async()=>{
  const h=bootMain();
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  const popup=h.windows.at(-1);
  const renderer=popup.webContents;
  popup.minimized=true;
  popup.focused=false;
  const result=h.handlers.get('gl-workspace-focus-panel')({sender},'learning','coach');
  assert.deepEqual({...result},{id:'coach',focused:true});
  assert.equal(popup.focused,true);
  assert.equal(popup.shown,true);
  assert.equal(popup.webContents,renderer);
  assert.equal(h.windows.length,3);
  assert.equal(h.windows[1].destroyed,false);
});

test('PLAN DES ÉCRANS blocks detached renderers and foreign workspaces',async()=>{
  const h=bootMain();
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  const popup=h.windows.at(-1);
  const map=h.handlers.get('gl-workspace-screen-map');
  const focus=h.handlers.get('gl-workspace-focus-panel');
  for(const event of [{sender:{}},{sender:popup.webContents}]){
    assert.throws(()=>map(event,'learning'),/non autorisé/);
    assert.throws(()=>focus(event,'learning','coach'),/non autorisé/);
  }
  assert.throws(()=>map({sender},'practice'),/non autorisé/);
  assert.throws(()=>focus({sender},'practice','coach'),/non autorisé/);
  assert.throws(()=>focus({sender},'learning','not-a-panel'),/non autorisé/);
  assert.throws(()=>focus({sender},'learning','history'),/indisponible/);
  assert.equal(popup.focused,false);
});

test('PLAN DES ÉCRANS reflects display removal and active workspace changes',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const map=h.handlers.get('gl-workspace-screen-map');
  const open=h.handlers.get('gl-panel-open');
  await open({sender},'coach','COACH');
  h.windows.at(-1).setBounds({x:1810,y:70,width:510,height:650});
  assert.equal(map({sender},'learning').panels[0].displayIndex,1);
  displays.pop();
  h.emitDisplay('display-removed');
  assert.equal(map({sender},'learning').screens.length,1);
  assert.equal(map({sender},'learning').panels[0].displayIndex,0);
  await h.handlers.get('gl-workspace-switch')({sender},'practice');
  assert.equal(map({sender},'practice').panels.length,0);
  assert.throws(()=>map({sender},'learning'),/non autorisé/);
});

test('PLAN DES ÉCRANS moves native panel to selected monitor and persists geometry',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-screen-move-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:-100,width:1920,height:1080}}
  ];
  const h=bootMain({layoutDirectory:folder,displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  const popup=h.windows.at(-1);
  const renderer=popup.webContents;
  const area={...displays[1].workArea};
  const result=h.handlers.get('gl-workspace-move-panel')(
    {sender},'learning','coach',1,area,.5,.5);
  assert.equal(result.id,'learning');
  assert.equal(result.panelId,'coach');
  assert.equal(result.displayIndex,1);
  assert.equal(result.autoDisabled,false);
  assert.deepEqual({...result.bounds},{x:2305,y:60,width:510,height:760});
  assert.deepEqual(popup.getBounds(),{x:2305,y:60,width:510,height:760});
  assert.equal(h.handlers.get('gl-workspace-screen-map')({sender},'learning')
    .panels[0].displayIndex,1);
  assert.equal(h.windows.length,3,'must not create another native renderer');
  assert.equal(popup.webContents,renderer);
  assert.equal(popup.focused,false,'manual move must not steal focus');
  const saved=JSON.parse(fs.readFileSync(
    path.join(folder,'detached-panel-layouts.json'),'utf8'));
  assert.deepEqual(saved.workspaces.learning.panels.coach,popup.getBounds());
  assert.deepEqual(saved.workspaces.learning.displayLayouts[
    Object.keys(saved.workspaces.learning.displayLayouts)[0]].coach,popup.getBounds());
});

test('PLAN DES ÉCRANS manual relocation disables AUTO only for the active workspace',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  const open=h.handlers.get('gl-panel-open');
  const auto=h.handlers.get('gl-workspace-auto-arrange');
  const move=h.handlers.get('gl-workspace-move-panel');
  const get=h.handlers.get('gl-workspace-get');
  await open({sender},'coach','COACH');
  auto({sender},'learning',true);
  const coach=h.windows.at(-1);
  assert.ok(coach.getBounds().x>=1600);
  const moved=move({sender},'learning','coach',0,{...displays[0].workArea},.7,.5);
  assert.equal(moved.autoDisabled,true);
  assert.equal(get({sender}).autoArrange,false);
  assert.ok(coach.getBounds().x<1600);
  const after=coach.getBounds();
  await open({sender},'history','HISTORIQUE');
  assert.deepEqual(coach.getBounds(),after,'opening another panel cannot override manual move');
  await h.handlers.get('gl-workspace-switch')({sender},'practice');
  assert.equal(get({sender}).autoArrange,false);
  auto({sender},'practice',true);
  await h.handlers.get('gl-workspace-switch')({sender},'learning');
  assert.equal(get({sender}).autoArrange,false);
  await h.handlers.get('gl-workspace-switch')({sender},'practice');
  assert.equal(get({sender}).autoArrange,true);
});

test('PLAN DES ÉCRANS moves minimized panels and keeps the overview accessible',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'history','HISTORIQUE');
  const popup=h.windows.at(-1);
  popup.minimized=true;
  const result=h.handlers.get('gl-workspace-move-panel')(
    {sender},'learning','history',1,{...displays[1].workArea},.2,.3);
  assert.equal(result.panelId,'history');
  assert.equal(popup.isMinimized(),false);
  assert.ok(popup.getBounds().x>=1600);
  assert.equal(h.windows[1].focused,true,
    'map remains in the foreground after a minimized panel is restored');
});

test('PLAN DES ÉCRANS rejects stale monitor, foreign workspace and malformed move',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  const popup=h.windows.at(-1);
  const before=popup.getBounds();
  const move=h.handlers.get('gl-workspace-move-panel');
  const area={...displays[1].workArea};
  const args=['learning','coach',1,area,.5,.5];
  assert.throws(()=>move({sender:popup.webContents},...args),/non autorisé/);
  assert.throws(()=>move({sender},'practice',...args.slice(1)),/non autorisé/);
  assert.throws(()=>move({sender},'learning','unknown',1,area,.5,.5),/non autorisé/);
  assert.throws(()=>move({sender},'learning','coach',10,area,.5,.5),/modifiés/);
  assert.throws(()=>move({sender},'learning','coach',1,area,-.01,.5),/non autorisé/);
  assert.throws(()=>move({sender},'learning','coach',1,area,NaN,.5),/non autorisé/);
  assert.throws(()=>move({sender},'learning','coach',1,{...area,width:1000},.5,.5),
    /modifiés/);
  displays[1].workArea={...area,width:1800};
  assert.throws(()=>move({sender},...args),/modifiés/);
  assert.deepEqual(popup.getBounds(),before);
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).autoArrange,false);
});

test('ORGANISER arranges only non-minimized panels on one screen in columns',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-organize-screen-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({layoutDirectory:folder,displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  h.handlers.get('gl-workspace-layout-style')({sender},'learning','columns');
  const open=h.handlers.get('gl-panel-open');
  await open({sender},'coach','COACH');
  await open({sender},'history','HISTORIQUE');
  await open({sender},'practice','ENTRAÎNEMENT');
  await open({sender},'session','SESSION');
  const [coach,history,practice,session]=h.windows.slice(2);
  coach.setBounds({x:1850,y:80,width:550,height:650});
  history.setBounds({x:1950,y:120,width:520,height:680});
  practice.setBounds({x:200,y:100,width:510,height:670});
  session.setBounds({x:2600,y:140,width:530,height:660});
  session.minimized=true;
  const untouched=practice.getBounds(),minimized=session.getBounds();
  const originalWindows=h.windows.length;
  const result=h.handlers.get('gl-workspace-arrange-screen')(
    {sender},'learning',1,{...displays[1].workArea});
  assert.equal(result.id,'learning');
  assert.equal(result.arranged,2);
  assert.equal(result.displayIndex,1);
  assert.equal(result.style,'columns');
  assert.equal(result.autoDisabled,false);
  assert.deepEqual(practice.getBounds(),untouched,'other monitor untouched');
  assert.deepEqual(session.getBounds(),minimized,'minimized panel untouched');
  assert.equal(session.isMinimized(),true);
  assert.equal(h.windows.length,originalWindows,'must not create native windows');
  const a=coach.getBounds(),b=history.getBounds();
  for(const rect of [a,b]){
    assert.ok(rect.x>=1600&&rect.x+rect.width<=3520);
    assert.ok(rect.y>=0&&rect.y+rect.height<=1080);
  }
  assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x,
    'column windows must not overlap horizontally');
  const saved=JSON.parse(fs.readFileSync(
    path.join(folder,'detached-panel-layouts.json'),'utf8'));
  assert.deepEqual(saved.workspaces.learning.panels.coach,a);
  assert.deepEqual(saved.workspaces.learning.panels.history,b);
  assert.deepEqual(saved.workspaces.learning.panels.practice,untouched);
  assert.equal(saved.workspaces.learning.layoutStyle,'columns');
});

test('ORGANISER respects Cascade and disables AUTO only for this workspace',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  h.handlers.get('gl-workspace-layout-style')({sender},'learning','cascade');
  for(const id of ['coach','history','session']){
    await h.handlers.get('gl-panel-open')({sender},id,id.toUpperCase());
  }
  const popups=h.windows.slice(2);
  for(const [i,popup] of popups.entries()){
    popup.setBounds({x:1700+i*70,y:100+i*40,width:550,height:680});
  }
  h.handlers.get('gl-workspace-auto-arrange')({sender},'learning',true);
  const result=h.handlers.get('gl-workspace-arrange-screen')(
    {sender},'learning',1,{...displays[1].workArea});
  assert.equal(result.arranged,3);
  assert.equal(result.style,'cascade');
  assert.equal(result.autoDisabled,true);
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).autoArrange,false);
  const [a,b]=popups.map(p=>p.getBounds());
  const overlap=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*
    Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  assert.ok(overlap>0,'cascade retains deliberate overlap');
  await h.handlers.get('gl-workspace-switch')({sender},'practice');
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).autoArrange,false);
  h.handlers.get('gl-workspace-auto-arrange')({sender},'practice',true);
  await h.handlers.get('gl-workspace-switch')({sender},'learning');
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).autoArrange,false);
  await h.handlers.get('gl-workspace-switch')({sender},'practice');
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).autoArrange,true);
});

test('ORGANISER rejects stale monitor and foreign renderer without moving windows',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  const popup=h.windows.at(-1);
  popup.setBounds({x:1800,y:100,width:500,height:700});
  const original=popup.getBounds();
  const arrange=h.handlers.get('gl-workspace-arrange-screen');
  const area={...displays[1].workArea};
  assert.throws(()=>arrange({sender:popup.webContents},'learning',1,area),
    /non autorisé/);
  assert.throws(()=>arrange({sender},'practice',1,area),/non autorisée/);
  assert.throws(()=>arrange({sender},'learning',-1,area),/non autorisée/);
  assert.throws(()=>arrange({sender},'learning',2,area),/modifiés/);
  assert.throws(()=>arrange({sender},'learning',1,{...area,width:1800}),
    /modifiés/);
  displays[1].workArea={...area,width:1700};
  assert.throws(()=>arrange({sender},'learning',1,area),/modifiés/);
  assert.deepEqual(popup.getBounds(),original);
});

test('ORGANISER does not alter AUTO or wake panels on an empty monitor',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'history','HISTORIQUE');
  const popup=h.windows.at(-1);
  popup.setBounds({x:1800,y:100,width:520,height:700});
  popup.minimized=true;
  h.handlers.get('gl-workspace-auto-arrange')({sender},'learning',true);
  const result=h.handlers.get('gl-workspace-arrange-screen')(
    {sender},'learning',1,{...displays[1].workArea});
  assert.equal(result.arranged,0);
  assert.equal(result.autoDisabled,false);
  assert.equal(popup.isMinimized(),true);
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).autoArrange,true);
});

test('ANNULER ORGANISER restores only the selected monitor and keeps minimized panels',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gl-undo-screen-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({layoutDirectory:folder,displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  h.handlers.get('gl-workspace-layout-style')({sender},'learning','columns');
  for (const id of ['coach','history','practice','session']) {
    await h.handlers.get('gl-panel-open')({sender},id,id.toUpperCase());
  }
  const [coach,history,practice,session]=h.windows.slice(2);
  coach.setBounds({x:1850,y:90,width:520,height:650});
  history.setBounds({x:2450,y:100,width:530,height:650});
  practice.setBounds({x:100,y:90,width:500,height:650});
  session.setBounds({x:2900,y:90,width:500,height:650});
  session.minimized=true;
  const all=[coach,history,practice,session];
  const before=all.map(p=>p.getBounds());
  const windowCount=h.windows.length;
  const area={...displays[1].workArea};
  const organize=h.handlers.get('gl-workspace-arrange-screen');
  const undo=h.handlers.get('gl-workspace-undo-screen');
  const map=()=>h.handlers.get('gl-workspace-screen-map')({sender},'learning');
  assert.equal(map().screens[1].canUndo,false);
  assert.equal(organize({sender},'learning',1,area).arranged,2);
  assert.equal(map().screens[1].canUndo,true);
  assert.equal(map().screens[0].canUndo,false);
  assert.equal(undo({sender},'learning',1,area).restored,2);
  assert.deepEqual(all.map(p=>p.getBounds()),before);
  assert.equal(session.isMinimized(),true);
  assert.equal(h.windows.length,windowCount);
  assert.equal(map().screens[1].canUndo,false);
  const saved=JSON.parse(fs.readFileSync(
    path.join(folder,'detached-panel-layouts.json'),'utf8'));
  assert.deepEqual(saved.workspaces.learning.panels.coach,before[0]);
  assert.deepEqual(saved.workspaces.learning.panels.history,before[1]);
  assert.deepEqual(saved.workspaces.learning.panels.practice,before[2]);
  assert.throws(()=>undo({sender},'learning',1,area),/indisponible/);
});

test('ANNULER refuses manually moved windows and altered monitor geometry',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  for (const id of ['coach','history']) {
    await h.handlers.get('gl-panel-open')({sender},id,id.toUpperCase());
  }
  const [a,b]=h.windows.slice(2);
  a.setBounds({x:1850,y:90,width:500,height:650});
  b.setBounds({x:2550,y:100,width:500,height:650});
  const area={...displays[1].workArea};
  const organize=h.handlers.get('gl-workspace-arrange-screen');
  const undo=h.handlers.get('gl-workspace-undo-screen');
  organize({sender},'learning',1,area);
  const moved={...a.getBounds(),x:a.getBounds().x+10};
  a.setBounds(moved);
  assert.throws(()=>undo({sender},'learning',1,area),/indisponible/);
  assert.deepEqual(a.getBounds(),moved);
  organize({sender},'learning',1,area);
  displays[1].workArea={...area,width:1800};
  assert.throws(()=>undo({sender},'learning',1,area),/indisponible/);
});

test('ANNULER restores previously enabled AUTO after organizing one display',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  const coach=h.windows.at(-1);
  coach.setBounds({x:1850,y:90,width:500,height:650});
  h.handlers.get('gl-workspace-auto-arrange')({sender},'learning',true);
  const before=coach.getBounds();
  const area={...displays[1].workArea};
  const organized=h.handlers.get('gl-workspace-arrange-screen')(
    {sender},'learning',1,area);
  assert.equal(organized.arranged,1);
  assert.equal(organized.autoDisabled,true);
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).autoArrange,false);
  const undone=h.handlers.get('gl-workspace-undo-screen')(
    {sender},'learning',1,area);
  assert.equal(undone.autoRestored,true);
  assert.equal(h.handlers.get('gl-workspace-get')({sender}).autoArrange,true);
  assert.deepEqual(coach.getBounds(),before);
});

test('ANNULER is invalidated when switching workspaces',async()=>{
  const displays=[
    {workArea:{x:0,y:0,width:1600,height:900}},
    {workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const h=bootMain({displays});
  await Promise.resolve();
  const sender=h.windows[1].webContents;
  await h.handlers.get('gl-panel-open')({sender},'coach','COACH');
  h.windows.at(-1).setBounds({x:1810,y:90,width:510,height:670});
  const area={...displays[1].workArea};
  h.handlers.get('gl-workspace-arrange-screen')({sender},'learning',1,area);
  await h.handlers.get('gl-workspace-switch')({sender},'practice');
  await h.handlers.get('gl-workspace-switch')({sender},'learning');
  assert.throws(()=>h.handlers.get('gl-workspace-undo-screen')(
    {sender},'learning',1,area),/indisponible/);
});
