/* Test the real original-control relay used by detached windows. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'..','src','workspace-ui.js'),'utf8');
const begin = source.indexOf('    function actOnOriginal(groupId, action) {');
const end = source.indexOf('    if (window.guitarAudio?.onPanelAction)',begin);
if(begin<0||end<0)throw Error('Actual detached handler not found');

function harness() {
  const clicks=[],events=[],published=[];
  const groups=new Map(),remoteKeys=new Map();
  function button(groupId,key) {
    const node={
      type:'button',
      matches: s=>s==='button' || s==='button,select' || s==='button,summary',
      click:()=>clicks.push(key),
    };
    remoteKeys.set(key,{id:groupId,node});
    return node;
  }
  function input(groupId,key,type) {
    const node={
      type,value:'',checked:false,
      matches:s=>s==='input,select,textarea',
      dispatchEvent:e=>events.push({key,type:e.type,value:node.value,checked:node.checked})
    };
    remoteKeys.set(key,{id:groupId,node});
    return node;
  }
  const practiceButton=button('practice','loop');
  const startButton=button('play-with-me','start');
  const loopStart=input('practice','start-bar','number');
  const loopEnabled=input('practice','loop-enabled','checkbox');
  for(const id of ['practice','play-with-me']) {
    groups.set(id,{
      element:{contains:n=>Array.from(remoteKeys.values()).some(entry=>entry.id===id && entry.node===n)}
    });
  }
  const ctx={groups,remoteKeys,publishSnapshot:(group,force)=>published.push({group,force}),
    Event,KeyboardEvent:class { constructor(type,init){this.type=type;this.key=init.key} }
  };
  vm.runInNewContext(source.slice(begin,end),ctx,{filename:'workspace-relay.js'});
  return {ctx,clicks,events,published,practiceButton,startButton,loopStart,loopEnabled};
}

test('loop actions from a floating panel invoke precisely the original loop control',()=>{
  const x=harness();
  x.ctx.actOnOriginal('practice',{key:'loop',kind:'click'});
  assert.deepEqual(x.clicks,['loop']);
  assert.equal(x.published.length,1);
  x.ctx.actOnOriginal('play-with-me',{key:'loop',kind:'click'});
  assert.deepEqual(x.clicks,['loop'],'foreign panel action must be rejected');
});

test('floating JOUE AVEC MOI start invokes only the original control',()=>{
  const x=harness();
  x.ctx.actOnOriginal('play-with-me',{key:'start',kind:'click'});
  assert.deepEqual(x.clicks,['start']);
  assert.equal(x.published.length,1);
});

test('loop bar and checkbox changes are forwarded to original inputs',()=>{
  const x=harness();
  x.ctx.actOnOriginal('practice',{key:'start-bar',kind:'change',value:'7'});
  x.ctx.actOnOriginal('practice',{key:'loop-enabled',kind:'change',checked:true});
  assert.deepEqual(x.events,[
    {key:'start-bar',type:'change',value:'7',checked:false},
    {key:'loop-enabled',type:'change',value:'',checked:true}
  ]);
  assert.equal(x.loopStart.value,'7');
  assert.equal(x.loopEnabled.checked,true);
});
