'use strict';

// Bounds in Electron use desktop-independent pixels (DIP). Keep this module
// free of Electron so its multi-monitor behavior can be regression tested.
const MIN_WIDTH = 350;
const MIN_HEIGHT = 440;
const DEFAULT_WIDTH = 510;
const DEFAULT_HEIGHT = 760;

function finiteRect(value) {
  if (!value || typeof value !== 'object') return null;
  const { x, y, width, height } = value;
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0 || width > 10000 || height > 10000) return null;
  if (Math.abs(x) > 100000 || Math.abs(y) > 100000) return null;
  return { x: Math.round(x), y: Math.round(y),
    width: Math.round(width), height: Math.round(height) };
}

function overlap(a, b) {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return w * h;
}

function restorePanelBounds(saved, displays, preferredDisplay) {
  const valid = finiteRect(saved);
  const areas = (Array.isArray(displays) ? displays : [])
    .map(display => finiteRect(display && (display.workArea || display)))
    .filter(Boolean);
  // Electron always has a primary screen, but keep a safe desktop fallback.
  if (!areas.length) areas.push({ x: 0, y: 0, width: 1280, height: 800 });
  const preferred = finiteRect(preferredDisplay && (preferredDisplay.workArea || preferredDisplay));
  const preferredArea = areas.find(a => preferred && overlap(a, preferred) > 0) || areas[0];

  let workArea = preferredArea;
  let onScreen = false;
  if (valid) {
    let bestArea = 0;
    for (const area of areas) {
      const visible = overlap(valid, area);
      if (visible > bestArea) {
        bestArea = visible;
        workArea = area;
      }
    }
    // A disconnected monitor or stale coordinates should never hide a window.
    onScreen = bestArea >= Math.min(valid.width * valid.height * .1, 12000);
    if (!onScreen) workArea = preferredArea;
  }

  const width = Math.min(workArea.width,
    Math.max(MIN_WIDTH, valid ? valid.width : DEFAULT_WIDTH));
  const height = Math.min(workArea.height,
    Math.max(MIN_HEIGHT, valid ? valid.height : DEFAULT_HEIGHT));
  const x = valid && onScreen
    ? Math.max(workArea.x, Math.min(valid.x, workArea.x + workArea.width - width))
    : workArea.x + Math.max(0, Math.floor((workArea.width - width) / 2));
  const y = valid && onScreen
    ? Math.max(workArea.y, Math.min(valid.y, workArea.y + workArea.height - height))
    : workArea.y + Math.max(0, Math.floor((workArea.height - height) / 2));
  return { x, y, width, height };
}


// Stable identity for the current desktop geometry, independent of Electron's
// display enumeration order or transient OS display IDs. Use work areas so
// reconnecting a monitor to a different port still restores its positions.
function displayTopologyKey(displays) {
  const screens = (Array.isArray(displays) ? displays : []).map(display => {
    const area = finiteRect(display && (display.workArea || display));
    if (!area) return null;
    return [area.x,area.y,area.width,area.height];
  }).filter(Boolean);
  if (!screens.length) screens.push([0,0,1280,800]);
  screens.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(screens);
}

// Deterministic one-click layout for detached windows. Use other monitors
// first to keep the central tablature visible on the main display. Bounds
// remain per workspace in the native layout store.
function distributePanelBounds(panelIds, displays, preferredDisplay,
    style = 'mosaic', screenMode = 'secondary-first') {
  const ids = Array.isArray(panelIds) ? panelIds : [];
  if (!ids.length) return [];
  // Unknown or older saved preferences retain the original mosaic behavior.
  if (!['mosaic', 'columns', 'cascade'].includes(style)) style = 'mosaic';
  if (!['secondary-first', 'all', 'primary', 'secondary'].includes(screenMode)) {
    screenMode = 'secondary-first';
  }
  const GAP = 12;
  const MARGIN = 12;
  const TARGET_WIDTH = 480;
  const TARGET_HEIGHT = 500;
  const MAX_WIDTH = 700;
  const MAX_HEIGHT = 850;
  const areas = (Array.isArray(displays) ? displays : [])
    .map((display, index) => ({
      index, area: finiteRect(display && (display.workArea || display))
    })).filter(item => item.area);
  if (!areas.length) {
    areas.push({index: 0, area: {x:0,y:0,width:1280,height:800}});
  }
  const preferred = finiteRect(preferredDisplay &&
    (preferredDisplay.workArea || preferredDisplay));
  const main = areas.find(item => preferred && overlap(item.area, preferred) > 0) ||
    areas[0];
  const others = areas.filter(item => item !== main)
    .sort((a,b) => a.area.x-b.area.x || a.area.y-b.area.y);
  // Respect each workspace's monitor policy. If a secondary monitor is
  // unplugged, "secondary only" falls back to the display with the score.
  const candidates = screenMode === 'primary' ? [main] :
    screenMode === 'secondary' ? (others.length ? others : [main]) :
    screenMode === 'all' ? [main,...others] :
    (others.length ? [...others,main] : [main]);
  const buckets = candidates.map(item => {
    const {area} = item;
    const maxColumns = Math.max(1,Math.floor(
      (area.width - 2*MARGIN + GAP) / (TARGET_WIDTH + GAP)));
    const maxRows = Math.max(1,Math.floor(
      (area.height - 2*MARGIN + GAP) / (TARGET_HEIGHT + GAP)));
    return {...item, maxColumns, maxRows,
      capacity:maxColumns*maxRows, assigned:[]};
  });
  // Balance across the eligible monitors by comfortable capacity. The
  // legacy policy prioritizes secondary monitors before using the main one.
  ids.forEach((id,position) => {
    let eligible = buckets.filter((bucket,index) =>
      (screenMode !== 'secondary-first' || others.length === 0 ||
        index < others.length) &&
      bucket.assigned.length < bucket.capacity);
    if (!eligible.length) eligible = buckets.filter(bucket =>
      bucket.assigned.length < bucket.capacity);
    if (!eligible.length) eligible = buckets;
    eligible.sort((a,b) =>
      a.assigned.length/a.capacity - b.assigned.length/b.capacity ||
      a.index-b.index);
    eligible[0].assigned.push({id,position});
  });
  const result = new Array(ids.length);
  for (const bucket of buckets) {
    const {area,assigned} = bucket;
    const count = assigned.length;
    if (!count) continue;
    let maxColumns = bucket.maxColumns;
    let maxRows = bucket.maxRows;
    if (count > maxColumns*maxRows) {
      // Tight but still non-overlapping tiles if the display is large enough.
      maxColumns = Math.max(1,Math.floor(
        (area.width - 2*MARGIN + GAP) / (MIN_WIDTH + GAP)));
      maxRows = Math.max(1,Math.floor(
        (area.height - 2*MARGIN + GAP) / (MIN_HEIGHT + GAP)));
    }
    // Cascade deliberately overlaps windows, leaving each title bar reachable.
    // It also provides a safe fallback when a grid cannot fit minimum sizes.
    function cascade() {
      const width = Math.max(1,Math.min(area.width-2*MARGIN,
        Math.max(MIN_WIDTH,Math.min(MAX_WIDTH,Math.floor(area.width*.72)))));
      const height = Math.max(1,Math.min(area.height-2*MARGIN,
        Math.max(MIN_HEIGHT,Math.min(MAX_HEIGHT,Math.floor(area.height*.72)))));
      const rangeX = Math.max(0,area.width-2*MARGIN-width);
      const rangeY = Math.max(0,area.height-2*MARGIN-height);
      const stepX = Math.max(1,Math.min(36,Math.floor(rangeX/Math.max(1,count-1))));
      const stepY = Math.max(1,Math.min(32,Math.floor(rangeY/Math.max(1,count-1))));
      assigned.forEach((item,i) => {
        const x = area.x+MARGIN+(rangeX ? (i*stepX)%(rangeX+1) : 0);
        const y = area.y+MARGIN+(rangeY ? (i*stepY)%(rangeY+1) : 0);
        result[item.position] = {id:item.id,displayIndex:bucket.index,
          bounds:{x,y,width,height}};
      });
    }
    if (style === 'cascade') {
      cascade();
      continue;
    }
    if (style === 'columns') {
      // Favor a single row of tall, side-by-side columns; wrap only if
      // needed, and never shrink below Electron's minimum panel height.
      const columns = Math.min(count,Math.max(1,Math.floor(
        (area.width-2*MARGIN+GAP)/(MIN_WIDTH+GAP))));
      const rows = Math.ceil(count/columns);
      const cellWidth = (area.width-2*MARGIN-(columns-1)*GAP)/columns;
      const cellHeight = (area.height-2*MARGIN-(rows-1)*GAP)/rows;
      if (cellWidth < MIN_WIDTH || cellHeight < MIN_HEIGHT) {
        cascade();
        continue;
      }
      const width = Math.round(Math.min(MAX_WIDTH,cellWidth));
      const height = Math.round(Math.min(MAX_HEIGHT,cellHeight));
      assigned.forEach((item,i) => {
        const col = i%columns;
        const row = Math.floor(i/columns);
        const x = Math.round(area.x+MARGIN+col*(cellWidth+GAP)+(cellWidth-width)/2);
        const y = Math.round(area.y+MARGIN+row*(cellHeight+GAP)+(cellHeight-height)/2);
        result[item.position] = {id:item.id,displayIndex:bucket.index,
          bounds:{x,y,width,height}};
      });
      continue;
    }
    if (count <= maxColumns*maxRows) {
      const rows = Math.ceil(count/maxColumns);
      const columns = Math.ceil(count/rows);
      const cellWidth = (area.width-2*MARGIN-(columns-1)*GAP)/columns;
      const cellHeight = (area.height-2*MARGIN-(rows-1)*GAP)/rows;
      const width = Math.round(Math.min(MAX_WIDTH,cellWidth));
      const height = Math.round(Math.min(MAX_HEIGHT,cellHeight));
      assigned.forEach((item,i) => {
        const row = Math.floor(i/columns);
        const col = i%columns;
        const rowCount = Math.min(columns,count-row*columns);
        const rowWidth = rowCount*cellWidth+(rowCount-1)*GAP;
        const rowStart = area.x+MARGIN+
          (area.width-2*MARGIN-rowWidth)/2;
        const x = Math.round(rowStart+col*(cellWidth+GAP)+(cellWidth-width)/2);
        const y = Math.round(area.y+MARGIN+row*(cellHeight+GAP)+
          (cellHeight-height)/2);
        result[item.position] = {id:item.id,displayIndex:bucket.index,
          bounds:{x,y,width,height}};
      });
    } else {
      // Preserve the legacy overflow fallback for the mosaic style.
      cascade();
    }
  }
  return result;
}

module.exports = { finiteRect, restorePanelBounds, distributePanelBounds,
  displayTopologyKey };
