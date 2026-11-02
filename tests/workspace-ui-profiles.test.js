/* Test the real saved drawer UI for each workspace, without an Electron window. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','src','workspace-ui.js'),'utf8');
const from=source.indexOf("    const WIDTH_KEY = 'guitar-liberty-panel-width';");
const to=source.indexOf('    function panelBounds() {',from);
assert.ok(from>=0&&to>from,'per-workspace saved layout implementation exists');
const piece=source.slice(from,to);

function harness(existing={}) {
  const data=new Map(Object.entries(existing));
  const opened=[];
  const groups=new Map([
    ['courses',{id:'courses',selectedTabIndex:0,panes:[{},{}]}],
    ['practice',{id:'practice',selectedTabIndex:0,panes:[{},{}]}],
    ['liberty',{id:'liberty',selectedTabIndex:0,panes:[{}]}],
    ['coach',{id:'coach',selectedTabIndex:0,panes:[{},{}]}]
  ]);
  const context={
    workspacePresets:[
      {id:'learning',dock:'courses'},{id:'practice',dock:'practice'},
      {id:'improv',dock:'liberty'}
    ],
    localStorage:{
      getItem:k=>data.has(k)?data.get(k):null,
      setItem:(k,v)=>data.set(k,v)
    },
    groups,activeWorkspaceId:'learning',workspaceSwitchBusy:false,
    suppressPresetSaving:false,active:{id:'courses'},
    updateDrawerGeometry:()=>{},
    updatePresetButtons:()=>{},
    openPanel:(id,index)=>{opened.push({id,index});context.active=groups.get(id)},
    closePanel:()=>{context.active=null}
  };
  vm.runInNewContext(piece+
    '\nthis.__presetTest={read:readPresetView,save:savePresetView,apply:applyPresetView,setWidth:n=>preferredWidth=n,getWidth:()=>preferredWidth};',
    context,{filename:'workspace-profile-persistence.js'});
  return {context,groups,data,opened,api:context.__presetTest};
}

test('each preset remembers its panel, width and selected tabs independently',()=>{
  const h=harness();
  h.api.setWidth(475);
  h.groups.get('courses').selectedTabIndex=1;
  h.api.save();

  h.api.apply('practice');
  assert.equal(h.api.getWidth(),400);
  assert.equal(h.opened.at(-1).id,'practice');
  h.api.setWidth(585);
  h.groups.get('practice').selectedTabIndex=1;
  h.api.save();

  h.api.apply('improv');
  assert.equal(h.api.getWidth(),400);
  assert.equal(h.opened.at(-1).id,'liberty');
  h.api.setWidth(515);
  h.api.save();

  h.api.apply('learning');
  assert.equal(h.api.getWidth(),475);
  assert.equal(h.opened.at(-1).id,'courses');
  assert.equal(h.groups.get('courses').selectedTabIndex,1);
  h.api.apply('practice');
  assert.equal(h.api.getWidth(),585);
  assert.equal(h.groups.get('practice').selectedTabIndex,1);
  h.api.apply('improv');
  assert.equal(h.api.getWidth(),515);
});

test('older drawer width is migrated only to Apprentissage',()=>{
  const h=harness({'guitar-liberty-panel-width':'540'});
  assert.equal(h.api.read('learning').width,540);
  assert.equal(h.api.read('practice').width,400);
  assert.equal(h.api.read('improv').width,400);
});

test('closing a workspace drawer saves a null dock only for that preset',()=>{
  const h=harness();
  h.api.save();
  h.context.active=null;
  h.api.save();
  assert.equal(JSON.parse(h.data.get('guitar-liberty-workspace-ui-learning')).dock,null);
  h.api.apply('practice');
  h.api.save();
  assert.equal(JSON.parse(h.data.get('guitar-liberty-workspace-ui-practice')).dock,'practice');
  assert.equal(JSON.parse(h.data.get('guitar-liberty-workspace-ui-learning')).dock,null);
});
