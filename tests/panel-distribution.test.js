/* Native geometry tests for the one-click detached-panel distributor. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {distributePanelBounds, displayTopologyKey} = require('../src/panel-layout');

const screen = (x,y,width,height) => ({workArea:{x,y,width,height}});
const rectOverlap = (a,b) => Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)) *
  Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));

function inside(bounds,area) {
  return bounds.x >= area.x && bounds.y >= area.y &&
    bounds.x+bounds.width <= area.x+area.width &&
    bounds.y+bounds.height <= area.y+area.height;
}
function ids(n) {return Array.from({length:n},(_,i)=>'panel-'+i);}

test('secondary monitor is preferred so the tablature stays unobstructed',()=>{
  const displays=[screen(0,0,1600,900),screen(1600,0,1920,1080)];
  const layout=distributePanelBounds(ids(4),displays,displays[0]);
  assert.equal(layout.length,4);
  assert.deepEqual(layout.map(x=>x.id),ids(4));
  for(const entry of layout) {
    assert.equal(entry.displayIndex,1);
    assert.ok(inside(entry.bounds,displays[1].workArea));
    assert.ok(entry.bounds.width>=350 && entry.bounds.height>=440);
  }
  for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++) {
    assert.equal(rectOverlap(layout[i].bounds,layout[j].bounds),0);
  }
  assert.deepEqual(distributePanelBounds(ids(4),displays,displays[0]),layout,
    'repeat actions must produce the same arrangement');
});

test('multiple secondary displays share windows without overlap',()=>{
  const displays=[
    screen(0,0,1600,900),
    screen(-1920,0,1920,1080),
    screen(1600,0,1920,1080)
  ];
  const layout=distributePanelBounds(ids(8),displays,displays[0]);
  const counts=new Map();
  for(const entry of layout) {
    assert.notEqual(entry.displayIndex,0);
    counts.set(entry.displayIndex,(counts.get(entry.displayIndex)||0)+1);
    assert.ok(inside(entry.bounds,displays[entry.displayIndex].workArea));
  }
  assert.equal(counts.get(1),4);
  assert.equal(counts.get(2),4);
  for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++) {
    assert.equal(rectOverlap(layout[i].bounds,layout[j].bounds),0);
  }
});

test('main screen accepts overflow only after external screen capacity is filled',()=>{
  const displays=[screen(0,0,1600,900),screen(1600,0,1440,900)];
  const layout=distributePanelBounds(ids(4),displays,displays[0]);
  assert.equal(layout.filter(x=>x.displayIndex===1).length,2);
  assert.equal(layout.filter(x=>x.displayIndex===0).length,2);
  for(const entry of layout) {
    assert.ok(inside(entry.bounds,displays[entry.displayIndex].workArea));
  }
});

test('single-monitor fallback tiles windows within the usable area',()=>{
  const displays=[screen(-200,50,1920,1080)];
  const layout=distributePanelBounds(ids(9),displays,displays[0]);
  assert.equal(layout.length,9);
  for(const entry of layout) {
    assert.equal(entry.displayIndex,0);
    assert.ok(inside(entry.bounds,displays[0].workArea));
    assert.ok(entry.bounds.width>=350 && entry.bounds.height>=440);
  }
  for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++) {
    assert.equal(rectOverlap(layout[i].bounds,layout[j].bounds),0);
  }
});

test('more panels than can fit use a visible cascade instead of offscreen windows',()=>{
  const displays=[screen(0,0,1280,800)];
  const layout=distributePanelBounds(ids(9),displays,displays[0]);
  assert.equal(layout.length,9);
  for(const entry of layout)assert.ok(inside(entry.bounds,displays[0].workArea));
  assert.notDeepEqual(layout[0].bounds,layout[1].bounds);
});

test('empty layouts and missing display metadata are safe',()=>{
  assert.deepEqual(distributePanelBounds([],[],null),[]);
  const layout=distributePanelBounds(ids(2),[],null);
  assert.equal(layout.length,2);
  for(const entry of layout)assert.ok(inside(entry.bounds,{x:0,y:0,width:1280,height:800}));
});

test('Mosaïque, Colonnes et Cascade produce distinct deterministic layouts',()=>{
  const displays=[screen(0,0,1600,900),screen(1600,0,1920,1080)];
  const byStyle={};
  for(const style of ['mosaic','columns','cascade']){
    const layout=distributePanelBounds(ids(4),displays,displays[0],style);
    byStyle[style]=layout;
    assert.deepEqual(layout,distributePanelBounds(ids(4),displays,displays[0],style));
    assert.deepEqual(layout.map(entry=>entry.id),ids(4));
    assert.ok(layout.every(entry=>entry.displayIndex===1));
    assert.ok(layout.every(entry=>inside(entry.bounds,displays[1].workArea)));
  }
  assert.notDeepEqual(byStyle.mosaic,byStyle.columns);
  assert.notDeepEqual(byStyle.columns,byStyle.cascade);
  assert.notDeepEqual(byStyle.mosaic,byStyle.cascade);
  assert.equal(byStyle.columns[0].bounds.y,byStyle.columns[3].bounds.y,
    'columns favor tall side-by-side windows');
  for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
    assert.equal(rectOverlap(byStyle.columns[i].bounds,byStyle.columns[j].bounds),0);
  }
  assert.ok(rectOverlap(byStyle.cascade[0].bounds,byStyle.cascade[1].bounds)>0,
    'cascade intentionally overlaps while leaving title bars visible');
  assert.ok(byStyle.cascade[1].bounds.x>byStyle.cascade[0].bounds.x);
  assert.ok(byStyle.cascade[1].bounds.y>byStyle.cascade[0].bounds.y);
});

test('all styles keep windows on-screen with one display and overload',()=>{
  for(const style of ['mosaic','columns','cascade']){
    const displays=[screen(-1600,120,1440,900)];
    const layout=distributePanelBounds(ids(9),displays,displays[0],style);
    assert.equal(layout.length,9);
    for(const entry of layout){
      assert.equal(entry.displayIndex,0);
      assert.ok(inside(entry.bounds,displays[0].workArea),style+' is offscreen');
      assert.ok(entry.bounds.width>0 && entry.bounds.height>0);
    }
  }
});

test('invalid style and old callers preserve the original mosaic',()=>{
  const displays=[screen(0,0,1920,1080)];
  const old=distributePanelBounds(ids(4),displays,displays[0]);
  assert.deepEqual(distributePanelBounds(ids(4),displays,displays[0],'mosaic'),old);
  assert.deepEqual(distributePanelBounds(ids(4),displays,displays[0],'unknown'),old);
  assert.deepEqual(distributePanelBounds([],displays,displays[0],'cascade'),[]);
});

test('ÉCRANS policy targets primary, secondary or all screens independently',()=>{
  const displays=[
    screen(0,0,1600,900),screen(1600,0,1920,1080),
    screen(-1920,0,1920,1080)
  ];
  const names=ids(8);
  for(const style of ['mosaic','columns','cascade']){
    const primary=distributePanelBounds(names,displays,displays[0],style,'primary');
    assert.ok(primary.every(entry=>entry.displayIndex===0),style+' primary');
    const secondary=distributePanelBounds(names,displays,displays[0],style,'secondary');
    assert.ok(secondary.every(entry=>entry.displayIndex!==0),style+' secondary');
    const all=distributePanelBounds(names,displays,displays[0],style,'all');
    assert.ok(new Set(all.map(entry=>entry.displayIndex)).size===3,style+' all');
    for(const layout of [primary,secondary,all]){
      assert.deepEqual(layout.map(entry=>entry.id),names);
      for(const entry of layout){
        assert.ok(inside(entry.bounds,displays[entry.displayIndex].workArea),
          style+' '+entry.displayIndex+' offscreen');
      }
    }
  }
});

test('secondary-only policy safely falls back to main screen after unplug',()=>{
  const displays=[screen(0,0,1440,900),screen(1440,0,1600,900)];
  const two=distributePanelBounds(ids(3),displays,displays[0],'columns','secondary');
  assert.ok(two.every(entry=>entry.displayIndex===1));
  displays.pop();
  const one=distributePanelBounds(ids(3),displays,displays[0],'columns','secondary');
  assert.ok(one.every(entry=>entry.displayIndex===0));
  assert.ok(one.every(entry=>inside(entry.bounds,displays[0].workArea)));
});

test('legacy screen policy remains secondary-first and invalid values fall back',()=>{
  const displays=[screen(0,0,1600,900),screen(1600,0,1440,900)];
  const old=distributePanelBounds(ids(4),displays,displays[0],'mosaic');
  assert.deepEqual(distributePanelBounds(ids(4),displays,displays[0],'mosaic','secondary-first'),old);
  assert.deepEqual(distributePanelBounds(ids(4),displays,displays[0],'mosaic','not-a-mode'),old);
  assert.equal(old.filter(x=>x.displayIndex===1).length,2,
    'legacy behavior keeps secondary monitors preferred');
  assert.equal(old.filter(x=>x.displayIndex===0).length,2,
    'legacy behavior overflows to main monitor');
});

test('display topology identity is order-independent but detects screen geometry',()=>{
  const displays=[
    {id:1,workArea:{x:0,y:0,width:1600,height:900}},
    {id:2,workArea:{x:1600,y:0,width:1920,height:1080}}
  ];
  const original=displayTopologyKey(displays);
  assert.equal(displayTopologyKey(displays.slice().reverse()),original);
  assert.notEqual(displayTopologyKey(displays.slice(0,1)),original);
  assert.notEqual(displayTopologyKey([
    displays[0],{id:2,workArea:{x:1600,y:0,width:1440,height:900}}
  ]),original);
  assert.equal(displayTopologyKey([
    displays[0],{id:3,workArea:displays[1].workArea}
  ]),original,'changing the monitor OS ID must not lose its layout');
  assert.equal(displayTopologyKey([]),displayTopologyKey(null));
});
