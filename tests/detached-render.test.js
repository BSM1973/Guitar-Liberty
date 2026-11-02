/* Regression tests for the real detached window incremental DOM synchronizer.
 * A tiny DOM stand-in checks control identity and state without a browser/audio.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '..', 'src', 'panel-window.js'), 'utf8');
const start = script.indexOf('  function sameStructure(left, right) {');
const end = script.indexOf('  function redraw() {', start);
assert.ok(start >= 0 && end > start, 'detached window must expose tree reconciliation');

class TextNode {
  constructor(value) {
    this.nodeType = 3;
    this.nodeName = '#text';
    this.nodeValue = value;
    this.childNodes = [];
  }
}
class ElementNode {
  constructor(tag, properties = {}, children = []) {
    this.nodeType = 1;
    this.nodeName = tag.toUpperCase();
    this.attributesByName = new Map(Object.entries(properties.attributes || {}));
    this.childNodes = children;
    this.value = properties.value || '';
    this.checked = !!properties.checked;
    this.type = properties.type || '';
  }
  get attributes() {
    return Array.from(this.attributesByName, ([name, value]) => ({ name, value }));
  }
  hasAttribute(name) { return this.attributesByName.has(name); }
  getAttribute(name) { return this.attributesByName.get(name) || null; }
  setAttribute(name, value) { this.attributesByName.set(name, String(value)); }
  removeAttribute(name) { this.attributesByName.delete(name); }
  matches(selectors) {
    return selectors.split(',').some(selector => selector.trim().toUpperCase() === this.nodeName);
  }
}
const node = (tag, attributes, children = [], other = {}) =>
  new ElementNode(tag, {attributes, ...other}, children);
const text = value => new TextNode(value);
function synchronizer(activeElement, pointerDown = false) {
  const context = { document: { activeElement }, pointerDown };
  vm.runInNewContext(script.slice(start, end), context, {filename:'panel-window-sync.js'});
  return context;
}

test('JOUE AVEC MOI countdown updates without replacing its visual node', () => {
  const oldText = text('REPRISE 4.0 s');
  const old = node('div', {id:'playWithMeCountdown',class:'counting'}, [oldText]);
  const fresh = node('div', {id:'playWithMeCountdown',class:'active'}, [text('REPRISE 3.9 s')]);
  const sync = synchronizer(null);
  assert.equal(sync.sameStructure(old, fresh), true);
  sync.patchNode(old, fresh);
  assert.strictEqual(old.childNodes[0], oldText, 'text node identity must be preserved');
  assert.equal(oldText.nodeValue, 'REPRISE 3.9 s');
  assert.equal(old.getAttribute('class'), 'active');
});

test('button disabled and label follow original player without losing DOM button', () => {
  const old = node('button', {class:'play',disabled:'',id:'playWithMeNext'}, [text('SUIVANT')]);
  const fresh = node('button', {class:'play active',id:'playWithMeNext'}, [text('CONTINUER')]);
  const sync = synchronizer(null);
  sync.patchNode(old,fresh);
  assert.equal(old.hasAttribute('disabled'), false);
  assert.equal(old.getAttribute('class'), 'play active');
  assert.equal(old.childNodes[0].nodeValue, 'CONTINUER');
});

test('an edited or dragged loop field is not overwritten by a remote snapshot', () => {
  const old = node('input',{type:'number',value:'5' },[],{type:'number',value:'5'});
  const fresh = node('input',{type:'number',value:'7'},[],{type:'number',value:'7'});
  const sync = synchronizer(old);
  sync.patchNode(old,fresh);
  assert.equal(old.value,'5', 'focused input keeps the user value');
  assert.equal(old.getAttribute('value'),'5');
  sync.document.activeElement = null;
  sync.patchNode(old,fresh);
  assert.equal(old.value,'7', 'value synchronizes after focus leaves the field');

  const range = node('input',{type:'range',value:'100'},[],{type:'range',value:'100'});
  const moving = node('input',{type:'range',value:'130'},[],{type:'range',value:'130'});
  const pointer = synchronizer(null,true);
  pointer.patchNode(range,moving);
  assert.equal(range.value,'100','dragged range keeps its current value');
});

test('structural changes are detected for a delayed full redraw', () => {
  const before = node('div',{},[node('p',{},[text('Une session')])]);
  const after = node('div',{},[
    node('p',{},[text('Une session')]),
    node('p',{},[text('Nouvelle session')])
  ]);
  const sync = synchronizer(null);
  assert.equal(sync.sameStructure(before,after),false);
});

test('pointerup never triggers a wholesale redraw before click', () => {
  assert.match(script,
    /window\.addEventListener\('pointerup', function \(\) \{\s*pointerDown = false;\s*updateLiveStatuses\(\);/);
  assert.match(script, /content\.addEventListener\('click', function \(event\)/);
});
