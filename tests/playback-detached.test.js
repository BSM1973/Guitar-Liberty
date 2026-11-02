/* Playback state regression tests for the original JOUE AVEC MOI engine.
 * Extracts the actual function bodies from src/renderer.js and executes them
 * with a controlled alphaTab stub. This does not measure real audio latency.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');

function practiceFunctionContext() {
  const start = source.indexOf('function stopPlayWithMe(){');
  const end = source.indexOf('function startPlayWithMeTimedAnswer(){', start);
  if (start === -1 || end === -1) throw new Error('Cannot find JOUE AVEC MOI engine');
  const actualFunctions = source.slice(start, end);
  const calls = [];
  const controls = {};
  [
    'playWithMeStart', 'playWithMeReplay', 'playWithMeRestart', 'playWithMeResume',
    'playWithMeNext', 'playWithMeStop', 'playWithMeCountdown', 'playWithMeElapsed'
  ].forEach(key => controls[key] = { disabled: false, textContent: '' });
  const api = {
    tickPosition: -1,
    play() { calls.push(['play', this.tickPosition]); },
    pause() { calls.push(['pause', this.tickPosition]); }
  };
  const context = {
    ...controls, calls, api,
    window: { guitarLibertyAlphaTab: api },
    playWithMeActive: false, playWithMePhase: 'idle',
    playWithMeRange: null, playWithMeLastTick: -1,
    playWithMeRoundCount: 0, playWithMePhraseRepeat: 0,
    playWithMeAnswerTimer: null, playWithMeCountdownTimer: null,
    playWithMeElapsedTimer: null, playWithMeStartedAt: 0,
    playWithMeText: { textContent: '' },
    practiceScore: { tempo: 90 },
    practiceLoop: true,
    loopToggle: { textContent: '', classList: { remove: (v) => calls.push(['classRemove',v]) } },
    playWithMeTicks: () => ({ start: 1920, end: 5760 }),
    clearPracticeRange: (a) => calls.push(['clearPracticeRange',a]),
    stop: () => calls.push(['stopPreviousTransport']),
    playWithMePaint: (state) => { context.playWithMePhase = state; calls.push(['paint', state]); },
    playWithMeSessionProgress: { textContent: '' },
    playWithMeProgress: { textContent: '' },
    playWithMeRound: { textContent: '' },
    playWithMeRepeatState: { textContent: '' },
    tempo: {value:'90'},
    Date, Math, String,
    setInterval: (_handler, milliseconds) => { calls.push(['setInterval', milliseconds]); return 42; },
    clearInterval: (handle) => calls.push(['clearInterval',handle]),
    clearTimeout: (handle) => calls.push(['clearTimeout',handle]),
  };
  vm.runInNewContext(actualFunctions, context, { filename: 'renderer-play-with-me.js' });
  return context;
}

test('JOUE AVEC MOI starts on the original alphaTab engine and first selected bar', () => {
  const ctx = practiceFunctionContext();
  ctx.startPlayWithMe();
  assert.equal(ctx.playWithMeActive, true);
  assert.equal(ctx.practiceLoop, false, 'loop must not compete with play-with-me');
  assert.equal(ctx.calls.filter(c => c[0] === 'stopPreviousTransport').length, 1,
    'previous transport and backing must be stopped before the session starts');
  assert.equal(ctx.api.tickPosition, 1920);
  assert.equal(ctx.calls.filter(c => c[0] === 'play').length, 1,
    'only one alphaTab playback call is allowed');
  assert.equal(ctx.playWithMeStart.disabled, true);
  assert.equal(ctx.playWithMeStop.disabled, false);
  assert.deepEqual([...ctx.calls.find(c => c[0] === 'play')], ['play', 1920]);
});

test('JOUE AVEC MOI STOP clears timers and pauses the same original alphaTab', () => {
  const ctx = practiceFunctionContext();
  ctx.startPlayWithMe();
  ctx.stopPlayWithMe();
  assert.equal(ctx.playWithMeActive, false);
  assert.equal(ctx.playWithMeRange, null);
  assert.equal(ctx.playWithMePhase, 'idle');
  assert.equal(ctx.playWithMeStart.disabled, false);
  assert.equal(ctx.playWithMeStop.disabled, true);
  assert.equal(ctx.calls.filter(c => c[0] === 'pause').length, 1);
  assert.ok(ctx.calls.some(c => c[0] === 'clearInterval' && c[1] === 42));
});

test('main PLAY/STOP explicitly exits active JOUE AVEC MOI and alphaTab loop', () => {
  assert.match(source, /function stop\(\)\s*\{[\s\S]*?if\(playWithMeActive\)stopPlayWithMe\(\)/);
  assert.match(source, /document\.querySelector\('#play'\)\.onclick=async\(\)=>\{\s*\/\/[^\n]*\n\s*if\(playWithMeActive\)\{stop\(\);return;\}/);
  assert.match(source, /loopToggle\.onclick=\(\)=>\{/);
});
