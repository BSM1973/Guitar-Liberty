/* Renderer tests for the RÉPARTIR action, using the real event callback. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','src','workspace-ui.js'),'utf8');
const start=source.indexOf("    distributeLayoutButton.addEventListener('click'");
const end=source.indexOf("    saveLayoutButton.addEventListener('click'",start);
assert.ok(start>=0 && end>start,'real distribution handler must be present');

function boot(native) {
  let handler;
  const statuses=[],logs=[];
  let saves=0,updates=0;
  const context={
    workspace:{hidden:false},
    workspaceSwitchBusy:false,
    suppressPresetSaving:false,
    activeWorkspaceId:'learning',
    distributeLayoutButton:{addEventListener:(type,fn)=>{
      assert.equal(type,'click');handler=fn;
    }},
    window:{guitarAudio:{workspaceDistribute:native}},
    savePresetView:()=>saves++,
    updatePresetButtons:()=>updates++,
    showWorkspaceStatus:message=>statuses.push(message),
    console:{error:(...args)=>logs.push(args)}
  };
  vm.runInNewContext(source.slice(start,end),context,
    {filename:'workspace-distribute-handler.js'});
  return {click:()=>handler(),context,statuses,logs,
    saves:()=>saves,updates:()=>updates};
}

test('one-click arrangement shows a localized success message and unlocks controls',async()=>{
  const calls=[];
  const h=boot(async id=>{calls.push(id);return {id,arranged:4,displays:2};});
  await h.click();
  assert.deepEqual(calls,['learning']);
  assert.equal(h.statuses.at(-1),'4 fenêtres réparties sur 2 écrans');
  assert.equal(h.context.workspaceSwitchBusy,false);
  assert.equal(h.saves(),1);
  assert.ok(h.updates()>=2);
});

test('zero detached panels produces a useful message without opening windows',async()=>{
  const h=boot(async id=>({id,arranged:0,displays:0}));
  await h.click();
  assert.equal(h.statuses.at(-1),'Aucune fenêtre détachée à répartir');
  assert.equal(h.context.workspaceSwitchBusy,false);
});

test('invalid native response unlocks selector and reports failure',async()=>{
  const h=boot(async id=>({id:'wrong',arranged:3,displays:1}));
  await h.click();
  assert.equal(h.statuses.at(-1),'Répartition impossible');
  assert.equal(h.context.workspaceSwitchBusy,false);
  assert.equal(h.logs.length,1);
});

test('distribution cannot race a workspace switch',async()=>{
  const h=boot(async()=>{throw Error('should not call');});
  h.context.workspaceSwitchBusy=true;
  await h.click();
  assert.equal(h.saves(),0);
  assert.equal(h.statuses.length,0);
});
