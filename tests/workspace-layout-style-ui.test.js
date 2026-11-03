/* Exercise the real DISPOSITION selector callback in the renderer. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','src','workspace-ui.js'),'utf8');
const start=source.indexOf("    layoutStyleSelect.addEventListener('change'");
const end=source.indexOf("    autoLayoutButton.addEventListener('click'",start);
assert.ok(start>=0 && end>start,'the DISPOSITION selector must have a change callback');

function boot(native,initial='mosaic') {
  let callback;
  const statuses=[],errors=[];
  const selector={
    value:initial,disabled:false,
    addEventListener:(name,fn)=>{assert.equal(name,'change');callback=fn;}
  };
  const context={
    workspace:{hidden:false},workspaceSwitchBusy:false,
    suppressPresetSaving:false,activeWorkspaceId:'learning',
    activeLayoutStyle:initial,layoutStyleSelect:selector,
    window:{guitarAudio:{workspaceLayoutStyle:native}},
    updatePresetButtons:()=>{selector.value=context.activeLayoutStyle;},
    showWorkspaceStatus:message=>statuses.push(message),
    console:{error:(...args)=>errors.push(args)}
  };
  vm.runInNewContext(source.slice(start,end),context,{filename:'workspace-layout-style-ui.js'});
  return {select:async style=>{selector.value=style;await callback();},
    selector,context,statuses,errors};
}

test('DISPOSITION switches to Colonnes and Cascade and confirms persistence',async()=>{
  const calls=[];
  const h=boot(async(id,style)=>{
    calls.push({id,style});return {id,style,arranged:3,displays:1};
  });
  await h.select('columns');
  assert.deepEqual(calls[0],{id:'learning',style:'columns'});
  assert.equal(h.context.activeLayoutStyle,'columns');
  assert.equal(h.selector.value,'columns');
  assert.equal(h.statuses.at(-1),'Disposition Colonnes enregistrée');
  await h.select('cascade');
  assert.deepEqual(calls[1],{id:'learning',style:'cascade'});
  assert.equal(h.context.activeLayoutStyle,'cascade');
  assert.equal(h.statuses.at(-1),'Disposition Cascade enregistrée');
  await h.select('mosaic');
  assert.equal(h.context.activeLayoutStyle,'mosaic');
  assert.equal(h.statuses.at(-1),'Disposition Mosaïque enregistrée');
});

test('failed layout-style request rolls back the selector',async()=>{
  const h=boot(async()=>{throw Error('IPC failed');},'columns');
  await h.select('cascade');
  assert.equal(h.context.activeLayoutStyle,'columns');
  assert.equal(h.selector.value,'columns');
  assert.equal(h.context.workspaceSwitchBusy,false);
  assert.equal(h.statuses.at(-1),'Impossible de changer la disposition');
  assert.equal(h.errors.length,1);
});

test('invalid or busy layout-style changes never call the main process',async()=>{
  let count=0;
  const h=boot(async()=>{count++;return {};});
  h.context.workspaceSwitchBusy=true;
  await h.select('cascade');
  assert.equal(count,0);
  assert.equal(h.selector.value,'mosaic');
  h.context.workspaceSwitchBusy=false;
  await h.select('unknown');
  assert.equal(count,0);
  await h.select('mosaic');
  assert.equal(count,0);
});
