/* Custom workspace selector tests against the actual renderer function. */
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'..','src','workspace-ui.js'),'utf8');
const from=source.indexOf('    function renderWorkspacePresets(definitions) {');
const to=source.indexOf('    renderWorkspacePresets(workspacePresets);',from);
assert.ok(from>=0 && to>from,'custom preset rendering function must exist');
const renderCode=source.slice(from,to);

function harness() {
  const calls=[];
  class Element {
    constructor(tag) {this.tag=tag;this.textContent='';this.attributes={};this.children=[];this.listeners=new Map();this.className='';this.title='';this.classList={add:()=>{},remove:()=>{},toggle:()=>{}};}
    setAttribute(k,v){this.attributes[k]=v;}
    addEventListener(name,handler){this.listeners.set(name,handler);}
    append(child){this.children.push(child);}
    replaceChildren(...items){this.children=[...items];}
    click(){this.listeners.get('click')?.();}
  }
  const workspacePresets=[
    {id:'learning',label:'APPRENTISSAGE',dock:'courses'},
    {id:'practice',label:'ENTRAÎNEMENT',dock:'practice'},
    {id:'improv',label:'IMPROVISATION',dock:'liberty'}
  ];
  const presetButtons=new Map();
  const presetButtonList=new Element('div');
  const createWorkspaceButton=new Element('button');
  const context={
    workspacePresets,presetButtons,presetButtonList,createWorkspaceButton,
    document:{createElement:tag=>new Element(tag)},
    switchWorkspaceProfile:id=>calls.push(id)
  };
  vm.runInNewContext(renderCode,context,{filename:'custom-selector.js'});
  return {render:context.renderWorkspacePresets,workspacePresets,presetButtons,presetButtonList,createWorkspaceButton,calls};
}

test('three fixed presets are always present alongside safely rendered custom names',()=>{
  const h=harness();
  h.render([
    {id:'custom-1',label:'Mes accords'},
    {id:'custom-2',label:'Blues français'},
    {id:'bad;id',label:'Ignore me'}
  ]);
  assert.deepEqual([...h.presetButtons.keys()],
    ['learning','practice','improv','custom-1','custom-2']);
  assert.equal(h.presetButtonList.children.at(-1),h.createWorkspaceButton);
  assert.equal(h.presetButtons.get('custom-2').textContent,'Blues français');
  assert.equal(h.workspacePresets.find(p=>p.id==='custom-1').dock,null);
  h.presetButtons.get('custom-2').click();
  assert.deepEqual(h.calls,['custom-2']);
});

test('changing custom presets rebuilds the selector without stale buttons',()=>{
  const h=harness();
  h.render([{id:'custom-1',label:'Avant'}]);
  const first=h.presetButtons.get('custom-1');
  h.render([{id:'custom-1',label:'Après'},{id:'custom-3',label:'Nouveau'}]);
  assert.notEqual(h.presetButtons.get('custom-1'),first);
  assert.equal(h.presetButtons.get('custom-1').textContent,'Après');
  assert.equal(h.presetButtonList.children.length,6);
  h.render([]);
  assert.equal(h.presetButtons.has('custom-1'),false);
  assert.equal(h.presetButtonList.children.length,4);
});

test('custom workspace names are set as text, never evaluated as HTML',()=>{
  const h=harness();
  const literal='<img src=x onerror=alert(1)>';
  h.render([{id:'custom-1',label:literal}]);
  assert.equal(h.presetButtons.get('custom-1').textContent,literal);
  assert.equal(h.presetButtons.get('custom-1').children.length,0);
});
