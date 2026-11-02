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

module.exports = { finiteRect, restorePanelBounds };
