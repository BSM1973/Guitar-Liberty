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
// Include the actual DOM tab-state applicator, not an independent mock.
const tabStart=source.indexOf('    function applyGroupTabState(');
const tabEnd=source.indexOf('    function selectTab(',tabStart);
assert.ok(tabStart>=0 && tabEnd>tabStart,'actual tab-state applicator exists');
const piece=source.slice(from,to)+'\n'+source.slice(tabStart,tabEnd);

function mockGroup(id, count) {
  const panes=Array.from({length:count},()=>({hidden:false,firstElementChild:null}));
  const tabs=Array.from({length:count},()=>({
    attrs:{},tabIndex:0,
    classList:{classes:new Set(),toggle(name,on){
      if(on)this.classes.add(name); else this.classes.delete(name);
    }},
    setAttribute(name,value){this.attrs[name]=value;}
  }));
  return {id,selectedTabIndex:0,panes,tabs};
}

function harness(existing={}) {
  const data=new Map(Object.entries(existing));
  const opened=[];
  const groups=new Map([
    ['courses',mockGroup('courses',2)],
    ['practice',mockGroup('practice',2)],
    ['liberty',mockGroup('liberty',1)],
    ['coach',mockGroup('coach',2)]
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
    presetButtons:new Map(['learning','practice','improv'].map(id => [id,{
      classList:{toggle:()=>{}},
      setAttribute:()=>{},
      disabled:false
    }])),
    layoutStyleSelect:{disabled:false,value:'mosaic'},
    screenModeSelect:{disabled:false,value:'secondary-first'},
    activeScreenMode:'secondary-first',
    activeLayoutStyle:'mosaic',
    distributeLayoutButton:{disabled:false},
    screenMapButton:{disabled:false},
    autoLayoutButton:{disabled:false,textContent:'',attrs:{},
      setAttribute(name,value){this.attrs[name]=value;}},activeAutoArrange:false,
    saveLayoutButton:{disabled:false},
    resetLayoutButton:{disabled:false},
    renameWorkspaceButton:{disabled:false,hidden:true},
    deleteWorkspaceButton:{disabled:false,hidden:true},
    createWorkspaceButton:{disabled:false},
    layoutStatus:{textContent:''},
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
  assert.equal(h.groups.get('courses').selectedTabIndex,0,
    'a fresh workspace must not inherit tabs from Apprentissage');
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

test('restoring an independent preset updates hidden panes and aria-selected on real tabs',()=>{
  const h=harness();
  h.groups.get('coach').selectedTabIndex=1;
  h.api.save();
  h.api.apply('practice');
  assert.equal(h.groups.get('coach').selectedTabIndex,0);
  assert.equal(h.groups.get('coach').panes[0].hidden,false);
  assert.equal(h.groups.get('coach').panes[1].hidden,true);
  assert.equal(h.groups.get('coach').tabs[0].attrs['aria-selected'],'true');
  assert.equal(h.groups.get('coach').tabs[1].attrs['aria-selected'],'false');
  h.api.apply('learning');
  assert.equal(h.groups.get('coach').selectedTabIndex,1);
  assert.equal(h.groups.get('coach').panes[0].hidden,true);
  assert.equal(h.groups.get('coach').panes[1].hidden,false);
  assert.equal(h.groups.get('coach').tabs[1].attrs['aria-selected'],'true');
  assert.equal(h.groups.get('coach').tabs[0].tabIndex,-1);
});

test('restoring a preset that detaches its saved dock never briefly opens that drawer',()=>{
  const h=harness();
  h.api.apply('practice',['practice']);
  assert.equal(h.context.active,null);
  assert.equal(h.opened.length,0,
    'a native detached window must not cause a dock flash on restoration');
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

test('named custom preset retains its independent drawer and selected tab', () => {
  const h=harness();
  h.context.workspacePresets.push({
    id:'custom-1',label:'Ma session blues',dock:null,builtIn:false
  });
  h.context.presetButtons.set('custom-1',{
    classList:{toggle:()=>{}},setAttribute:()=>{},disabled:false
  });
  h.api.apply('custom-1');
  assert.equal(h.api.getWidth(),400);
  assert.equal(h.context.active,null,'custom preset starts with a clear central tablature');
  h.api.setWidth(610);
  h.context.active=h.groups.get('coach');
  h.groups.get('coach').selectedTabIndex=1;
  h.api.save();
  h.api.apply('learning');
  h.api.apply('custom-1');
  assert.equal(h.api.getWidth(),610);
  assert.equal(h.context.active.id,'coach');
  assert.equal(h.groups.get('coach').selectedTabIndex,1);
  h.api.apply('practice');
  assert.equal(h.api.getWidth(),400,'Entraînement must not inherit custom width');
});
