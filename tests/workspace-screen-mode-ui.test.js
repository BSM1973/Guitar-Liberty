/* Exercise the real ÉCRANS dropdown callback and IPC contract. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','src','workspace-ui.js'),'utf8');
const start=source.indexOf("    screenModeSelect.addEventListener('change'");
const end=source.indexOf("    layoutStyleSelect.addEventListener('change'",start);
assert.ok(start>=0 && end>start,'the ÉCRANS selector callback must exist');

function boot(native,initial='secondary-first') {
  let callback;
  const statuses=[],errors=[];
  const selector={value:initial,disabled:false,
    addEventListener:(name,fn)=>{assert.equal(name,'change');callback=fn;}};
  const context={
    workspace:{hidden:false},workspaceSwitchBusy:false,
    suppressPresetSaving:false,activeWorkspaceId:'learning',
    activeScreenMode:initial,screenModeSelect:selector,
    window:{guitarAudio:{workspaceScreenMode:native}},
    updatePresetButtons:()=>{selector.value=context.activeScreenMode;},
    showWorkspaceStatus:message=>statuses.push(message),
    console:{error:(...args)=>errors.push(args)}
  };
  vm.runInNewContext(source.slice(start,end),context,{filename:'workspace-screen-mode-ui.js'});
  return {select:async mode=>{selector.value=mode;await callback();},
    selector,context,statuses,errors};
}

test('ÉCRANS switches among main, secondary, all and secondary-first policies',async()=>{
  const calls=[];
  const h=boot(async(id,mode)=>{
    calls.push({id,mode});return {id,mode,arranged:3,displays:1};
  });
  for(const [mode,label] of [
    ['primary','Écran principal'],['secondary','Annexes uniquement'],
    ['all','Tous les écrans'],['secondary-first','Priorité annexes']
  ]){
    await h.select(mode);
    assert.deepEqual(calls.at(-1),{id:'learning',mode});
    assert.equal(h.context.activeScreenMode,mode);
    assert.equal(h.selector.value,mode);
    assert.equal(h.statuses.at(-1),'Écrans : '+label+' — choix enregistré');
  }
  assert.equal(calls.length,4);
});

test('ÉCRANS failure rolls back without claiming a successful change',async()=>{
  const h=boot(async()=>{throw Error('IPC failed');},'all');
  await h.select('primary');
  assert.equal(h.context.activeScreenMode,'all');
  assert.equal(h.selector.value,'all');
  assert.equal(h.context.workspaceSwitchBusy,false);
  assert.equal(h.statuses.at(-1),'Impossible de modifier le choix des écrans');
  assert.equal(h.errors.length,1);
});

test('ÉCRANS ignores invalid, redundant or busy changes',async()=>{
  let calls=0;
  const h=boot(async()=>{calls++;return {};});
  h.context.workspaceSwitchBusy=true;
  await h.select('primary');
  assert.equal(h.selector.value,'secondary-first');
  h.context.workspaceSwitchBusy=false;
  await h.select('unknown');
  assert.equal(h.selector.value,'secondary-first');
  await h.select('secondary-first');
  assert.equal(calls,0);
});
