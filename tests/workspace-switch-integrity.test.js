/* Exercise the actual renderer workspace-switch function with async native
 * responses. Ensures floating window snapshots are never from a prior preset.
 * Pure node:test (no Electron GUI required in GitHub CI).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'workspace-ui.js'), 'utf8');
const start = source.indexOf('    async function switchWorkspaceProfile(id) {');
const end = source.indexOf('    // Create and rename', start);
assert.ok(start >= 0 && end > start, 'real workspace switch function exists');

function bootstrap(resolver) {
  const events = [];
  const alerts = [];
  const makeGroup = id => ({
    id, detached: true, lastRemoteMarkup: 'old',
    button: {
      title: 'old title',
      classList: {remove: name => events.push(['button-remove', id, name])}
    }
  });
  const groups = new Map([
    ['practice', makeGroup('practice')],
    ['play-with-me', makeGroup('play-with-me')]
  ]);
  const context = {
    workspace: {hidden: false},
    workspaceSwitchBusy: false,
    workspaceGeneration: 3,
    restorationRequested: false,
    pendingRestoredIds: ['old-window'],
    activeWorkspaceId: 'learning',
    workspacePresets: [
      {id:'learning'}, {id:'practice'}, {id:'improv'}
    ],
    groups,
    detachedAllowed: new Set(groups.keys()),
    savePresetView: () => events.push(['save']),
    updatePresetButtons: () => events.push(['buttons']),
    showWorkspaceStatus: message => events.push(['status', message]),
    closePanel: () => events.push(['close']),
    applyPresetView: (id, detachedIds) => {
      events.push(['apply', id, ...detachedIds]);
      // The real applyPresetView sets the active preset after tab restoration.
      context.activeWorkspaceId = id;
    },
    openDetachedGroup: async (group, restoring) => {
      events.push(['open', group.id, restoring]);
      return true;
    },
    window: {
      guitarAudio: {
        workspaceSwitch: async id => resolver(id)
      },
      alert: message => alerts.push(message)
    },
    console: {error: error => events.push(['error', String(error)])}
  };
  vm.runInNewContext(source.slice(start, end) +
    '\nthis.__switchWorkspaceProfile = switchWorkspaceProfile;', context,
  {filename:'workspace-switch-real.js'});
  return {
    context, events, alerts,
    switchTo: id => context.__switchWorkspaceProfile(id)
  };
}

test('tabs are applied before detached windows receive their first snapshot', async () => {
  const h = bootstrap(async id => ({
    id, openPanels: ['play-with-me', 'practice']
  }));
  const result = await h.switchTo('practice');
  assert.equal(result, true);
  const applyIndex = h.events.findIndex(event => event[0] === 'apply');
  const firstOpen = h.events.findIndex(event => event[0] === 'open');
  assert.ok(applyIndex >= 0 && firstOpen > applyIndex,
    'a native window must never snapshot old workspace tabs');
  assert.deepEqual([...h.events[applyIndex]],
    ['apply', 'practice', 'play-with-me', 'practice']);
  assert.equal(h.context.activeWorkspaceId, 'practice');
  assert.equal(h.context.workspaceGeneration, 4);
  assert.equal(h.context.restorationRequested, true);
  assert.deepEqual([...h.context.pendingRestoredIds], [],
    'old asynchronous restoration must be cancelled');
  assert.equal(h.context.workspaceSwitchBusy, false);
  assert.equal(h.alerts.length, 0);
});

test('failed native workspace switch preserves previous restoration queue', async () => {
  const h = bootstrap(async () => {throw Error('native busy');});
  const result = await h.switchTo('improv');
  assert.equal(result, false);
  assert.equal(h.context.activeWorkspaceId, 'learning');
  assert.equal(h.context.restorationRequested, false);
  assert.deepEqual([...h.context.pendingRestoredIds], ['old-window']);
  assert.equal(h.context.workspaceSwitchBusy, false);
  assert.equal(h.alerts.length, 1);
  assert.equal(h.events.some(event => event[0] === 'open'), false);
});

test('unexpected native data never opens foreign panels', async () => {
  const h = bootstrap(async id => ({id, openPanels: 'invalid'}));
  assert.equal(await h.switchTo('practice'), false);
  assert.equal(h.context.activeWorkspaceId, 'learning');
  assert.deepEqual([...h.context.pendingRestoredIds], ['old-window']);
  assert.equal(h.events.some(event => event[0] === 'open'), false);
});

test('only allowed detached panels reopen, and the main score remains untouched', async () => {
  const h = bootstrap(async id => ({id,openPanels:[
    'practice', 'unknown', 'play-with-me'
  ]}));
  assert.equal(await h.switchTo('improv'), true);
  const actual = h.events.filter(event => event[0] === 'open');
  assert.deepEqual(actual.map(event => event[1]), ['practice','play-with-me']);
  assert.ok(actual.every(event => event[2] === true));
  assert.ok(!source.slice(start,end).includes('window.guitarLibertyAlphaTab'),
    'switching arrangements must not restart the actual playback engine');
});
