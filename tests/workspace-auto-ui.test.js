/* Verify the real AUTO OUI/NON button callback, not a duplicate implementation. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','src','workspace-ui.js'),'utf8');
const start=source.indexOf("    autoLayoutButton.addEventListener('click'");
const end=source.indexOf("    distributeLayoutButton.addEventListener('click'",start);
assert.ok(start>=0 && end>start,'AUTO action is installed before manual RÉPARTIR');

function boot(native, enabled=false) {
  let handler;
  const statuses=[],errors=[];
  const context={
    workspace:{hidden:false},workspaceSwitchBusy:false,suppressPresetSaving:false,
    activeWorkspaceId:'learning',activeAutoArrange:enabled,
    autoLayoutButton:{addEventListener:(event,callback)=>{
      assert.equal(event,'click');handler=callback;
    }},
    window:{guitarAudio:{workspaceAutoArrange:native}},
    updatePresetButtons:()=>{},
    showWorkspaceStatus:message=>statuses.push(message),
    console:{error:(...args)=>errors.push(args)}
  };
  vm.runInNewContext(source.slice(start,end),context,
    {filename:'workspace-auto-button.js'});
  return {click:()=>handler(),context,statuses,errors};
}

test('AUTO activates per workspace and sends an explicit boolean',async()=>{
  const calls=[];
  const h=boot(async (id,enabled)=>{
    calls.push({id,enabled});return {id,enabled,arranged:2,displays:1};
  });
  await h.click();
  assert.deepEqual(calls,[{id:'learning',enabled:true}]);
  assert.equal(h.context.activeAutoArrange,true);
  assert.equal(h.context.workspaceSwitchBusy,false);
  assert.equal(h.statuses.at(-1),'Répartition automatique activée pour cet espace');
  await h.click();
  assert.deepEqual(calls[1],{id:'learning',enabled:false});
  assert.equal(h.context.activeAutoArrange,false);
  assert.equal(h.statuses.at(-1),'Répartition automatique désactivée pour cet espace');
});

test('AUTO failure does not falsely change the active state',async()=>{
  const h=boot(async()=>{throw Error('IPC offline');});
  await h.click();
  assert.equal(h.context.activeAutoArrange,false);
  assert.equal(h.context.workspaceSwitchBusy,false);
  assert.equal(h.statuses.at(-1),'Impossible de modifier le mode automatique');
  assert.equal(h.errors.length,1);
});

test('AUTO cannot be toggled while switching workspaces',async()=>{
  const h=boot(async()=>{throw Error('must not call');});
  h.context.workspaceSwitchBusy=true;
  await h.click();
  assert.equal(h.statuses.length,0);
  assert.equal(h.errors.length,0);
});
