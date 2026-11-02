/* The real workspace restoration function must be lazy and idempotent. */
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workspaceSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'workspace-ui.js'), 'utf8');
const rendererSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
const start = workspaceSource.indexOf('    let restorationRequested = false;');
const end = workspaceSource.indexOf('    // Audio/playback timing stays', start);
assert.ok(start > 0 && end > start, 'workspace restoration function must exist');

function boot({ids = ['practice', 'play-with-me'], hidden = true} = {}) {
  const workspace = {hidden};
  const groups = new Map([
    ['practice', {id:'practice', detached:false}],
    ['play-with-me', {id:'play-with-me', detached:false}],
    ['coach', {id:'coach', detached:false}]
  ]);
  const allowed = new Set(groups.keys());
  const openings = [];
  let reads = 0;
  let provider = async () => ids;
  let onOpen = () => {};
  const context = {
    workspace, groups, detachedAllowed: allowed, workspaceGeneration: 0,
    console: { warn: () => {} },
    window: {guitarAudio: { panelRestorable: () => { reads++; return provider(); } }},
    openDetachedGroup: async (group, restoring) => {
      openings.push({id:group.id, restoring});
      group.detached = true;
      onOpen(group.id);
      return true;
    }
  };
  vm.runInNewContext(workspaceSource.slice(start, end), context);
  return {
    workspace, groups, openings, restore: () => context.restoreDetachedPanels(),
    reads: () => reads, setProvider: (fn) => {provider=fn;}, onOpen: fn => {onOpen=fn;}
  };
}

test('floating panels do not open on home; all saved panels open once on workspace entry', async () => {
  const app = boot();
  await app.restore();
  assert.equal(app.reads(), 0);
  assert.equal(app.openings.length, 0);
  app.workspace.hidden = false;
  await app.restore();
  assert.deepEqual(app.openings.map(x=>x.id), ['practice','play-with-me']);
  assert.ok(app.openings.every(x=>x.restoring));
  assert.equal(app.reads(), 1);
  await app.restore();
  assert.equal(app.openings.length, 2, 'must not duplicate previously restored windows');
  assert.equal(app.reads(), 1);
});

test('remaining floating windows restore after briefly returning to home', async () => {
  const app = boot({ids:['practice','coach','play-with-me'],hidden:false});
  app.onOpen(id => {if (id === 'practice') app.workspace.hidden=true;});
  await app.restore();
  assert.deepEqual(app.openings.map(x=>x.id), ['practice']);
  app.workspace.hidden=false;
  await app.restore();
  assert.deepEqual(app.openings.map(x=>x.id), ['practice','coach','play-with-me']);
  assert.equal(app.reads(), 1);
});

test('unknown saved panel IDs are ignored and intentional closing stays closed', async () => {
  const app = boot({ids:['practice','obsolete-panel'],hidden:false});
  await app.restore();
  assert.deepEqual(app.openings.map(x=>x.id), ['practice']);
  app.groups.get('practice').detached = false; // user closed the window
  await app.restore();
  assert.equal(app.openings.length, 1);
});

test('temporary IPC restoration failure can be retried on next entry', async () => {
  const app = boot({ids:['coach'],hidden:false});
  app.setProvider(async () => {throw Error('IPC unavailable');});
  await app.restore();
  assert.equal(app.openings.length,0);
  app.setProvider(async () => ['coach']);
  await app.restore();
  assert.deepEqual(app.openings.map(x=>x.id), ['coach']);
  assert.equal(app.reads(),2);
});

test('workspace entry calls restore; showing home does not restore anything', () => {
  const entry = rendererSource.slice(
    rendererSource.indexOf('function openWorkspace(target){'),
    rendererSource.indexOf('function showHome(){'));
  const home = rendererSource.slice(
    rendererSource.indexOf('function showHome(){'),
    rendererSource.indexOf("document.querySelector('#homeStart')"));
  assert.match(entry, /restoreDetachedPanels\?\.\(\)/);
  assert.doesNotMatch(home, /restoreDetachedPanels/);
});
