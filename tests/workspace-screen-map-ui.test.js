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
    value:'',draggable:false,
    children:[],attrs:{},className:'',focused:false,
    classList:{values:new Set(),add(v){this.values.add(v)},
      remove(v){this.values.delete(v)}},
    append(...items){this.children.push(...items)},
    replaceChildren(...items){this.children=items},
    querySelectorAll(){return []},
    contains(other){return this.children.includes(other)},
    getBoundingClientRect(){return {left:0,top:0,width:400,height:250}},
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
  const moves=[];
  const organizations=[];
  const undos=[];
  const favoriteSaves=[];
  const favoriteApplies=[];
  const favoriteRenames=[];
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
  const move=overrides.move||((id,panelId,index,area,x,y)=>{
    moves.push({id,panelId,index,area,x,y});
    return Promise.resolve({id,panelId,displayIndex:index,autoDisabled:true});
  });
  const organize=overrides.organize||((id,index,area)=>{
    organizations.push({id,index,area});
    return Promise.resolve({id,displayIndex:index,arranged:1,
      style:'mosaic',autoDisabled:true});
  });
  const undo=overrides.undo||((id,index,area)=>{
    undos.push({id,index,area});
    return Promise.resolve({id,displayIndex:index,restored:1,autoRestored:true});
  });
  const saveFavorite=overrides.saveFavorite||((id,index,area,slot)=>{
    favoriteSaves.push({id,index,area,slot});
    return Promise.resolve({id,displayIndex:index,slot,saved:1});
  });
  const applyFavorite=overrides.applyFavorite||((id,index,area,slot)=>{
    favoriteApplies.push({id,index,area,slot});
    return Promise.resolve({id,displayIndex:index,slot,applied:1,
      skipped:0,autoDisabled:true});
  });
  const renameFavorite=overrides.renameFavorite||((id,index,area,slot,name)=>{
    favoriteRenames.push({id,index,area,slot,name});
    return Promise.resolve({id,displayIndex:index,slot,name});
  });
  const errors=[];
  const context={
    screenMapOverlay,screenMapButton,screenMapClose,screenMapRefresh,
    screenMapScreens,screenMapMessage,screenMapSummary,
    screenMapPreviousFocus:null,
    workspace:{hidden:false},workspaceSwitchBusy:false,
    suppressPresetSaving:false,activeWorkspaceId:'learning',
    document:{activeElement:node('button'),createElement:node},
    window:{guitarAudio:{workspaceScreenMap:map,workspaceFocusPanel:focus,
      workspaceMovePanel:move,workspaceArrangeScreen:organize,
      workspaceUndoScreen:undo,
      workspaceSaveScreenFavorite:saveFavorite,
      workspaceApplyScreenFavorite:applyFavorite,
      workspaceRenameScreenFavorite:renameFavorite},
      confirm:overrides.confirm||(()=>true),
      prompt:overrides.prompt||(()=>null)},
    activeAutoArrange:true,updatePresetButtons:()=>{context.updated=true},
    console:{error:(...args)=>errors.push(args)}
  };
  vm.runInNewContext(source.slice(start,end),context,{filename:'workspace-screen-map-ui.js'});
  return {context,calls,moves,organizations,undos,
    favoriteSaves,favoriteApplies,favoriteRenames,errors,
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
  assert.equal(c.screenMapScreens.children[0].children[3].children[0]
    .children[0].classList.values.has('is-minimized'),true);
  assert.match(c.screenMapMessage.textContent,/Clique pour retrouver une fenêtre/);
});

test('PLAN DES ÉCRANS locates a native panel without refocusing the score',async()=>{
  const h=harness();
  await h.open();
  const preview=h.context.screenMapScreens.children[1].children[2].children[0];
  preview.fire('click');
  // The click launches an asynchronous IPC handler; wait for its completion.
  await new Promise(resolve=>setImmediate(resolve));
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

test('PLAN DES ÉCRANS moves dragged panel to a precise point on another monitor',async()=>{
  const h=harness();
  await h.open();
  const c=h.context;
  const coach=c.screenMapScreens.children[1].children[2].children[0];
  const target=c.screenMapScreens.children[0].children[2];
  const transfer={effectAllowed:null,dropEffect:null,setData(){}};
  coach.fire('dragstart',{dataTransfer:transfer,preventDefault(){}});
  assert.equal(coach.draggable,true);
  assert.equal(transfer.effectAllowed,'move');
  let accepted=false;
  target.fire('dragover',{preventDefault(){accepted=true},dataTransfer:transfer});
  assert.equal(accepted,true);
  assert.equal(target.classList.values.has('is-drop-target'),true);
  target.fire('drop',{preventDefault(){},clientX:100,clientY:175});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.moves.length,1);
  assert.equal(h.moves[0].id,'learning');
  assert.equal(h.moves[0].panelId,'coach');
  assert.equal(h.moves[0].index,0);
  assert.equal(h.moves[0].x,.25);
  assert.equal(h.moves[0].y,.7);
  assert.equal(c.screenMapOverlay.hidden,false,'map stays open after moving a panel');
  assert.equal(c.activeAutoArrange,false,'manual move disables AUTO in UI');
  assert.equal(c.updated,true);
  assert.match(c.screenMapMessage.textContent,/AUTO désactivé/);
  assert.equal(c.screenMapScreens.children.length,2,'map is refreshed after moving');
});

test('PLAN DES ÉCRANS offers accessible screen selection without drag and drop',async()=>{
  const h=harness();
  await h.open();
  const c=h.context;
  const entry=c.screenMapScreens.children[1].children[3].children[0];
  const selector=entry.children[1];
  assert.match(selector.attrs['aria-label'],/Déplacer COACH vers un écran/);
  assert.equal(selector.children.length,3);
  selector.value='0';
  selector.fire('change');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.moves.length,1);
  assert.equal(h.moves[0].index,0);
  assert.equal(h.moves[0].x,.5);
  assert.equal(h.moves[0].y,.5);
  assert.equal(c.screenMapOverlay.hidden,false);
});

test('PLAN DES ÉCRANS handles a failed native move without closing the overview',async()=>{
  const h=harness({move:async()=>{throw Error('Monitor disconnected')}});
  await h.open();
  const c=h.context;
  const selector=c.screenMapScreens.children[1].children[3].children[0].children[1];
  selector.value='0';
  selector.fire('change');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.screenMapOverlay.hidden,false);
  assert.match(c.screenMapMessage.textContent,/Déplacement impossible/);
  assert.equal(c.screenMapRefresh.disabled,false);
  assert.equal(h.errors.length,1);
});

test('PLAN DES ÉCRANS ignores an in-flight relocation after the map is closed',async()=>{
  let finishMove;
  const h=harness({move:()=>new Promise(resolve=>{finishMove=resolve})});
  await h.open();
  const c=h.context;
  const selector=c.screenMapScreens.children[1].children[3].children[0].children[1];
  selector.value='0';
  selector.fire('change');
  c.screenMapClose.fire('click');
  finishMove({id:'learning',panelId:'coach',displayIndex:0,autoDisabled:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.screenMapOverlay.hidden,true);
  assert.equal(c.activeAutoArrange,true,'stale response must not change UI state');
  assert.equal(h.moves.length,0);
});

test('PLAN DES ÉCRANS shows ORGANISER for each screen and disables empty screens',async()=>{
  const h=harness();
  await h.open();
  const screens=h.context.screenMapScreens.children;
  const mainControl=screens[0].children[4];
  const secondaryControl=screens[1].children[4];
  assert.equal(mainControl.children[0].textContent,'0 fenêtre active');
  assert.equal(mainControl.children[1].textContent,'ORGANISER');
  assert.equal(mainControl.children[1].disabled,true,
    'a minimized panel is not rearranged');
  assert.equal(secondaryControl.children[0].textContent,'1 fenêtre active');
  assert.equal(secondaryControl.children[1].disabled,false);
  assert.match(secondaryControl.children[1].attrs['aria-label'],/écran 2/);
});

test('PLAN DES ÉCRANS organizes only selected monitor and refreshes overview',async()=>{
  const h=harness();
  await h.open();
  const c=h.context;
  const organize=c.screenMapScreens.children[1].children[4].children[1];
  organize.fire('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.organizations.length,1);
  assert.equal(h.organizations[0].id,'learning');
  assert.equal(h.organizations[0].index,1);
  assert.equal(h.organizations[0].area.width,1920);
  assert.equal(c.screenMapOverlay.hidden,false);
  assert.equal(c.activeAutoArrange,false);
  assert.equal(c.updated,true);
  assert.equal(c.screenMapScreens.children.length,2);
  assert.match(c.screenMapMessage.textContent,/Écran 2 : 1 fenêtre organisée en mosaïque/);
  assert.match(c.screenMapMessage.textContent,/AUTO désactivé/);
  assert.equal(c.screenMapRefresh.disabled,false);
});

test('PLAN DES ÉCRANS reports screen organization failure without closing map',async()=>{
  const h=harness({organize:async()=>{throw Error('Display disconnected')}});
  await h.open();
  const c=h.context;
  c.screenMapScreens.children[1].children[4].children[1].fire('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.screenMapOverlay.hidden,false);
  assert.match(c.screenMapMessage.textContent,/Organisation impossible/);
  assert.equal(c.screenMapRefresh.disabled,false);
  assert.equal(c.activeAutoArrange,true);
  assert.equal(h.errors.length,1);
});

test('PLAN DES ÉCRANS ignores organization response after modal closes',async()=>{
  let resolveOrganize;
  const h=harness({organize:()=>new Promise(resolve=>{resolveOrganize=resolve})});
  await h.open();
  const c=h.context;
  c.screenMapScreens.children[1].children[4].children[1].fire('click');
  c.screenMapClose.fire('click');
  resolveOrganize({id:'learning',displayIndex:1,arranged:1,
    style:'mosaic',autoDisabled:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.screenMapOverlay.hidden,true);
  assert.equal(c.activeAutoArrange,true);
});

test('PLAN DES ÉCRANS ignores duplicate organize clicks while native IPC is pending',async()=>{
  let resolveOrganize;
  let count=0;
  const h=harness({organize:()=>{count++;return new Promise(resolve=>{
    resolveOrganize=resolve;
  })}});
  await h.open();
  const c=h.context;
  const button=c.screenMapScreens.children[1].children[4].children[1];
  button.fire('click');
  button.fire('click');
  assert.equal(count,1);
  resolveOrganize({id:'learning',displayIndex:1,arranged:1,
    style:'mosaic',autoDisabled:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.screenMapRefresh.disabled,false);
});

test('PLAN DES ÉCRANS offers ANNULER only for an undoable screen',async()=>{
  let canUndo=true;
  const h=harness({map:async()=>({id:'learning',
    screens:[
      {index:0,main:true,workArea:{x:0,y:0,width:1600,height:900}},
      {index:1,main:false,canUndo,
        workArea:{x:1600,y:0,width:1920,height:1080}}
    ],
    panels:[{id:'coach',title:'COACH',displayIndex:1,minimized:false,
      bounds:{x:1850,y:100,width:520,height:650}}]
  }),undo:async(id,index,area)=>{
    assert.equal(id,'learning');
    assert.equal(index,1);
    assert.equal(area.width,1920);
    canUndo=false;
    return {id,displayIndex:index,restored:1,autoRestored:true};
  }});
  await h.open();
  const c=h.context;
  assert.equal(c.screenMapScreens.children[0].children[4].children.length,2);
  const controls=c.screenMapScreens.children[1].children[4].children;
  assert.equal(controls[2].textContent,'ANNULER');
  assert.match(controls[2].attrs['aria-label'],/écran 2/);
  c.activeAutoArrange=false;
  controls[2].fire('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.activeAutoArrange,true);
  assert.equal(c.updated,true);
  assert.match(c.screenMapMessage.textContent,/disposition précédente restaurée/);
  assert.equal(c.screenMapScreens.children[1].children[4].children.length,2);
  assert.equal(c.screenMapOverlay.hidden,false);
});
test('PLAN DES ÉCRANS reports refused undo without closing the overview',async()=>{
  const h=harness({map:async()=>({id:'learning',
    screens:[{index:0,main:true,canUndo:true,
      workArea:{x:0,y:0,width:1600,height:900}}],
    panels:[{id:'coach',title:'COACH',displayIndex:0,minimized:false,
      bounds:{x:90,y:100,width:520,height:650}}]
  }),undo:async()=>{throw Error('Disposed window was moved')}});
  await h.open();
  const c=h.context;
  c.screenMapScreens.children[0].children[4].children[2].fire('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.screenMapOverlay.hidden,false);
  assert.match(c.screenMapMessage.textContent,/Annulation impossible/);
  assert.equal(c.screenMapRefresh.disabled,false);
  assert.equal(c.activeAutoArrange,true);
  assert.equal(h.errors.length,1);
});

test('PLAN DES ÉCRANS renders three favorites for every monitor',async()=>{
  const h=harness();
  await h.open();
  for(const screen of h.context.screenMapScreens.children.slice(0,2)){
    const favorite=screen.children[5];
    assert.equal(favorite.children[0].textContent,'FAVORIS');
    assert.equal(favorite.children[1].children.length,3);
    assert.equal(favorite.children[1].children[0].textContent,'FAVORI 1 — VIDE');
    assert.equal(favorite.children[2].textContent,'ENREGISTRER');
    assert.equal(favorite.children[3].textContent,'APPLIQUER');
    assert.equal(favorite.children[3].disabled,true);
  }
  assert.equal(h.context.screenMapScreens.children[0].children[5].children[2].disabled,true,
    'minimized panels are not saved as favorites');
  assert.equal(h.context.screenMapScreens.children[1].children[5].children[2].disabled,false);
});

test('PLAN DES ÉCRANS saves favorite 2 and applies it without disturbing the map',async()=>{
  let saved=false;
  const h=harness({map:async()=>({
    id:'learning',
    screens:[
      {index:0,main:true,workArea:{x:0,y:0,width:1600,height:900},
        favorites:[{slot:1,count:0},{slot:2,count:0},{slot:3,count:0}]},
      {index:1,main:false,workArea:{x:1600,y:0,width:1920,height:1080},
        favorites:[{slot:1,count:0},{slot:2,count:saved?1:0},{slot:3,count:0}]}
    ],
    panels:[{id:'coach',title:'COACH',displayIndex:1,minimized:false,
      bounds:{x:1820,y:100,width:500,height:650}}]
  }),saveFavorite:async(id,index,area,slot)=>{
    assert.equal(index,1); assert.equal(slot,2);
    saved=true;
    return {id,displayIndex:index,slot,saved:1};
  }});
  await h.open();
  const c=h.context;
  const favorite=c.screenMapScreens.children[1].children[5];
  const select=favorite.children[1];
  select.value='2';
  select.fire('change');
  assert.equal(favorite.children[3].disabled,true);
  favorite.children[2].fire('click');
  await new Promise(resolve=>setImmediate(resolve));
  const refreshed=c.screenMapScreens.children[1].children[5];
  assert.equal(refreshed.children[1].value,'2');
  assert.equal(refreshed.children[3].disabled,false);
  assert.match(c.screenMapMessage.textContent,/FAVORI 2 enregistré/);
  c.activeAutoArrange=true;
  refreshed.children[3].fire('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.favoriteApplies.length,1);
  assert.equal(h.favoriteApplies[0].index,1);
  assert.equal(h.favoriteApplies[0].slot,2);
  assert.equal(c.activeAutoArrange,false);
  assert.equal(c.updated,true);
  assert.match(c.screenMapMessage.textContent,/FAVORI 2 appliqué/);
  assert.equal(c.screenMapOverlay.hidden,false);
});

test('PLAN DES ÉCRANS asks before overwriting a saved favorite',async()=>{
  let confirmations=0;
  const h=harness({map:async()=>({
    id:'learning',
    screens:[{index:0,main:true,workArea:{x:0,y:0,width:1600,height:900},
      favorites:[{slot:1,count:1},{slot:2,count:0},{slot:3,count:0}]}],
    panels:[{id:'coach',title:'COACH',displayIndex:0,minimized:false,
      bounds:{x:80,y:90,width:510,height:650}}]
  }),confirm:()=>{confirmations++;return false}});
  await h.open();
  const controls=h.context.screenMapScreens.children[0].children[5].children;
  assert.equal(controls[3].disabled,false);
  controls[2].fire('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(confirmations,1);
  assert.equal(h.favoriteSaves.length,0);
  assert.equal(h.context.screenMapOverlay.hidden,false);
});

test('PLAN DES ÉCRANS ignores duplicate favorite application while busy',async()=>{
  let finishApply,count=0;
  const h=harness({map:async()=>({
    id:'learning',
    screens:[{index:0,main:true,workArea:{x:0,y:0,width:1600,height:900},
      favorites:[{slot:1,count:1},{slot:2,count:0},{slot:3,count:0}]}],
    panels:[{id:'coach',title:'COACH',displayIndex:0,minimized:false,
      bounds:{x:80,y:90,width:510,height:650}}]
  }),applyFavorite:()=>{count++;return new Promise(resolve=>{finishApply=resolve})}});
  await h.open();
  const c=h.context;
  const apply=c.screenMapScreens.children[0].children[5].children[3];
  apply.fire('click');
  apply.fire('click');
  assert.equal(count,1);
  finishApply({id:'learning',displayIndex:0,slot:1,applied:1,
    skipped:0,autoDisabled:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.screenMapRefresh.disabled,false);
});

test('PLAN DES ÉCRANS recalls a named favorite directly with one click',async()=>{
  const h=harness({map:async()=>({
    id:'learning',
    screens:[
      {index:0,main:true,workArea:{x:0,y:0,width:1600,height:900},
        favorites:[{slot:1,count:0,name:''},{slot:2,count:0,name:''},{slot:3,count:0,name:''}]},
      {index:1,main:false,workArea:{x:1600,y:0,width:1920,height:1080},
        favorites:[{slot:1,count:1,name:'Accompagnement'},
          {slot:2,count:1,name:'Solo'},
          {slot:3,count:0,name:''}]}
    ],
    panels:[{id:'coach',title:'COACH',displayIndex:1,minimized:false,
      bounds:{x:1880,y:110,width:520,height:650}}]
  })});
  await h.open();
  const c=h.context;
  const favored=c.screenMapScreens.children[1].children[5];
  assert.match(favored.children[1].children[0].textContent,/Accompagnement/);
  const quick=favored.children[5];
  assert.equal(quick.children.length,3);
  assert.equal(quick.children[0].textContent,'Accompagnement');
  assert.equal(quick.children[1].textContent,'Solo');
  assert.equal(quick.children[2].disabled,true);
  assert.equal(c.screenMapScreens.children[0].children[5].children[5].children[0].disabled,true);
  assert.match(quick.children[1].attrs['aria-label'],/écran 2/);
  quick.children[1].fire('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.favoriteApplies.length,1);
  assert.equal(h.favoriteApplies[0].slot,2);
  assert.equal(h.favoriteApplies[0].index,1);
  assert.equal(c.screenMapScreens.children[1].children[5].children[1].value,'2');
  assert.equal(c.screenMapOverlay.hidden,false);
  assert.equal(c.activeAutoArrange,false);
});

test('PLAN DES ÉCRANS renames a selected saved favorite without moving windows',async()=>{
  let name='Accompagnement';
  let promptCalls=0;
  const h=harness({map:async()=>({
    id:'learning',
    screens:[{index:0,main:true,workArea:{x:0,y:0,width:1600,height:900},
      favorites:[{slot:1,count:1,name},{slot:2,count:0,name:''},{slot:3,count:0,name:''}]}],
    panels:[{id:'coach',title:'COACH',displayIndex:0,minimized:false,
      bounds:{x:60,y:90,width:520,height:650}}]
  }),prompt:()=>{promptCalls++;return '  Entraînement   quotidien  ';},
  renameFavorite:async(id,index,area,slot,newName)=>{
    name=newName;
    return {id,displayIndex:index,slot,name:newName};
  }});
  await h.open();
  const c=h.context;
  const rename=c.screenMapScreens.children[0].children[5].children[4];
  assert.equal(rename.textContent,'RENOMMER');
  assert.equal(rename.disabled,false);
  rename.fire('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(promptCalls,1);
  assert.equal(name,'Entraînement quotidien');
  assert.equal(c.screenMapScreens.children[0].children[5].children[5].children[0]
    .textContent,'Entraînement quotidien');
  assert.match(c.screenMapMessage.textContent,/renommé/);
  assert.equal(h.favoriteApplies.length,0);
  assert.equal(h.favoriteSaves.length,0);
});

test('PLAN DES ÉCRANS does not rename canceled or empty favorites',async()=>{
  let asked=0;
  const h=harness({map:async()=>({
    id:'learning',
    screens:[{index:0,main:true,workArea:{x:0,y:0,width:1600,height:900},
      favorites:[{slot:1,count:1,name:'Solo'},{slot:2,count:0,name:''},
        {slot:3,count:0,name:''}]}],
    panels:[{id:'coach',title:'COACH',displayIndex:0,minimized:false,
      bounds:{x:60,y:90,width:520,height:650}}]
  }),prompt:()=>{asked++;return null}});
  await h.open();
  const fav=h.context.screenMapScreens.children[0].children[5].children;
  fav[4].fire('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(asked,1);
  assert.equal(h.favoriteRenames.length,0);
  fav[1].value='2';fav[1].fire('change');
  assert.equal(fav[4].disabled,true);
  fav[4].fire('click');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(asked,1,'unsaved favorite must not prompt');
});

test('PLAN DES ÉCRANS blocks duplicate quick recall while IPC is pending',async()=>{
  let finish,count=0;
  const h=harness({map:async()=>({
    id:'learning',
    screens:[{index:0,main:true,workArea:{x:0,y:0,width:1600,height:900},
      favorites:[{slot:1,count:1,name:'Solo'}]}],
    panels:[{id:'coach',title:'COACH',displayIndex:0,minimized:false,
      bounds:{x:60,y:90,width:520,height:650}}]
  }),applyFavorite:()=>{count++;return new Promise(resolve=>{finish=resolve})}});
  await h.open();
  const quick=h.context.screenMapScreens.children[0].children[5].children[5].children[0];
  quick.fire('click');
  quick.fire('click');
  assert.equal(count,1);
  finish({id:'learning',displayIndex:0,slot:1,applied:1,skipped:0,autoDisabled:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.context.screenMapRefresh.disabled,false);
});
