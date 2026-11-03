/* Exercise the real screen map renderer, not a copied layout algorithm. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','src','workspace-ui.js'),'utf8');
const start=source.indexOf('    let screenMapRequest = 0;');
const end=source.indexOf("    screenModeSelect.addEventListener('change'",start);
assert.ok(start>=0&&end>start,'screen map handlers must exist');

function node(tag='div') {
  const listeners=new Map();
  const element={
    tag,hidden:false,disabled:false,style:{},textContent:'',title:'',
    children:[],attrs:{},className:'',focused:false,
    classList:{values:new Set(),add(v){this.values.add(v)}},
    append(...items){this.children.push(...items)},
    replaceChildren(...items){this.children=items},
    setAttribute(k,v){this.attrs[k]=v},
    addEventListener(name,callback){listeners.set(name,callback)},
    focus(){this.focused=true},
    fire(name,event={}){return listeners.get(name)?.(event)}
  };
  return element;
}
function harness(overrides={}) {
  const screenMapOverlay=node();
  screenMapOverlay.hidden=true;
  const screenMapButton=node('button');
  const screenMapClose=node('button');
  const screenMapRefresh=node('button');
  const screenMapScreens=node();
  const screenMapMessage=node();
  const screenMapSummary=node();
  const calls=[];
  const map=overrides.map||(()=>Promise.resolve({
    id:'learning',screens:[
      {index:0,main:true,workArea:{x:0,y:0,width:1600,height:900}},
      {index:1,main:false,workArea:{x:1600,y:0,width:1920,height:1080}}
    ],
    panels:[
      {id:'coach',title:'COACH',bounds:{x:1800,y:100,width:500,height:650},
        displayIndex:1,minimized:false},
      {id:'history',title:'HISTORIQUE',bounds:{x:80,y:70,width:510,height:660},
        displayIndex:0,minimized:true}
    ]
  }));
  const focus=overrides.focus||((id,panelId)=>{
    calls.push([id,panelId]);
    return Promise.resolve({id:panelId,focused:true});
  });
  const errors=[];
  const context={
    screenMapOverlay,screenMapButton,screenMapClose,screenMapRefresh,
    screenMapScreens,screenMapMessage,screenMapSummary,
    screenMapPreviousFocus:null,
    workspace:{hidden:false},workspaceSwitchBusy:false,
    suppressPresetSaving:false,activeWorkspaceId:'learning',
    document:{activeElement:node('button'),createElement:node},
    window:{guitarAudio:{workspaceScreenMap:map,workspaceFocusPanel:focus}},
    console:{error:(...args)=>errors.push(args)}
  };
  vm.runInNewContext(source.slice(start,end),context,{filename:'workspace-screen-map-ui.js'});
  return {context,calls,errors,
    open:async()=>{screenMapButton.fire('click');await Promise.resolve();await Promise.resolve()},
    refresh:async()=>{screenMapRefresh.fire('click');await Promise.resolve();await Promise.resolve()}
  };
}

test('PLAN DES ÉCRANS displays connected monitors, scaled windows and minimized labels',async()=>{
  const h=harness();
  await h.open();
  const c=h.context;
  assert.equal(c.screenMapOverlay.hidden,false);
  assert.equal(c.screenMapClose.focused,true);
  assert.equal(c.screenMapScreens.children.length,2);
  assert.equal(c.screenMapScreens.children[0].children[0].textContent,'ÉCRAN 1 — TABLATURE');
  assert.equal(c.screenMapScreens.children[1].children[0].textContent,'ÉCRAN 2 — ANNEXE');
  assert.equal(c.screenMapScreens.children[1].children[2].children.length,1);
  const preview=c.screenMapScreens.children[1].children[2].children[0];
  assert.equal(preview.textContent,'COACH');
  assert.equal(preview.style.left,'10.416666666666668%');
  assert.equal(preview.style.top,'9.25925925925926%');
  assert.equal(c.screenMapSummary.textContent,'2 écrans connectés — 2 fenêtres détachées');
  assert.equal(c.screenMapScreens.children[0].children[3].children[0].classList.values.has('is-minimized'),true);
  assert.match(c.screenMapMessage.textContent,/Clique sur une fenêtre/);
});

test('PLAN DES ÉCRANS locates a native panel without refocusing the score',async()=>{
  const h=harness();
  await h.open();
  const preview=h.context.screenMapScreens.children[1].children[2].children[0];
  preview.fire('click');
  await Promise.resolve();await Promise.resolve();
  assert.deepEqual(h.calls,[['learning','coach']]);
  assert.equal(h.context.screenMapOverlay.hidden,true);
  assert.equal(h.context.document.activeElement.focused,false,
    'explicit panel focus must not return focus to the main app');
});

test('PLAN DES ÉCRANS handles Escape, refresh and late replies safely',async()=>{
  let resolveMap;
  const h=harness({map:()=>new Promise(resolve=>{resolveMap=resolve})});
  h.context.screenMapButton.fire('click');
  assert.equal(h.context.screenMapRefresh.disabled,true);
  let stopped=false;
  h.context.screenMapOverlay.fire('keydown',{key:'Escape',
    preventDefault(){},stopPropagation(){stopped=true}});
  assert.equal(stopped,true);
  assert.equal(h.context.screenMapOverlay.hidden,true);
  resolveMap({id:'learning',screens:[],panels:[]});
  await Promise.resolve();await Promise.resolve();
  assert.equal(h.context.screenMapScreens.children.length,0,
    'stale map must not render over another workspace');
  assert.equal(h.context.document.activeElement.focused,true);
});

test('PLAN DES ÉCRANS reports native failures without losing modal controls',async()=>{
  const h=harness({map:async()=>{throw Error('IPC unavailable')}});
  await h.open();
  assert.equal(h.context.screenMapOverlay.hidden,false);
  assert.equal(h.context.screenMapMessage.textContent,'Impossible de lire les écrans');
  assert.equal(h.context.screenMapRefresh.disabled,false);
  assert.equal(h.errors.length,1);
  h.context.screenMapClose.fire('click');
  assert.equal(h.context.screenMapOverlay.hidden,true);
});
