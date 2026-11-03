'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {placePanelOnDisplay}=require('../src/panel-layout');

const target={workArea:{x:1600,y:-100,width:1920,height:1080}};
const current={x:120,y:80,width:510,height:760};

test('manual screen placement centers a panel at the requested normalized point',()=>{
  assert.deepEqual(placePanelOnDisplay(current,target,{x:.5,y:.5}),
    {x:2305,y:60,width:510,height:760});
});

test('manual placement clamps panel inside the target screen at all four corners',()=>{
  const area=target.workArea;
  for(const [x,y] of [[0,0],[1,0],[0,1],[1,1]]) {
    const result=placePanelOnDisplay(current,target,{x,y});
    assert.ok(result.x>=area.x && result.y>=area.y);
    assert.ok(result.x+result.width<=area.x+area.width);
    assert.ok(result.y+result.height<=area.y+area.height);
  }
  assert.deepEqual(placePanelOnDisplay(current,target,{x:0,y:0}),
    {x:1600,y:-100,width:510,height:760});
  assert.deepEqual(placePanelOnDisplay(current,target,{x:1,y:1}),
    {x:3010,y:220,width:510,height:760});
});

test('manual placement preserves panel size when it fits the destination',()=>{
  const large={x:50,y:50,width:940,height:890};
  const moved=placePanelOnDisplay(large,target,{x:.5,y:.5});
  assert.equal(moved.width,940);
  assert.equal(moved.height,890);
});

test('manual placement reduces oversize panels to usable screen bounds',()=>{
  const small={workArea:{x:-1280,y:40,width:920,height:650}};
  const result=placePanelOnDisplay({x:0,y:0,width:2100,height:1800},
    small,{x:.9,y:.8});
  assert.equal(result.width,920);
  assert.equal(result.height,650);
  assert.equal(result.x,-1280);
  assert.equal(result.y,40);
});

test('manual placement rejects malformed screen geometry and coordinates',()=>{
  for(const point of [null,{}, {x:NaN,y:0},{x:-.1,y:.5},
    {x:1.1,y:0},{x:0,y:Infinity},{x:0,y:-.01}]) {
    assert.equal(placePanelOnDisplay(current,target,point),null);
  }
  assert.equal(placePanelOnDisplay(current,{workArea:{x:0,y:0,width:-1,height:500}},
    {x:.5,y:.5}),null);
});
