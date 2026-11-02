/* Independent panel renderer. No playback engine is started in this window.
   All interactions are relayed to the original controls in the main window. */
(function () {
  'use strict';
  const params = new URLSearchParams(window.location.search);
  const panelId = params.get('panel') || '';
  const panelTitle = params.get('title') || 'PANNEAU';
  const titleNode = document.getElementById('panelWindowTitle');
  const loading = document.getElementById('panelLoading');
  const content = document.getElementById('detachedContent');
  const body = document.getElementById('popoutBody');
  const reattach = document.getElementById('reattachPanel');
  const api = window.guitarDetached;

  document.title = panelTitle + ' — Guitare Liberty';
  titleNode.textContent = panelTitle;

  if (!api || !panelId) {
    loading.textContent = 'Ce panneau ne peut pas être ouvert.';
    return;
  }

  let latestMarkup = '';
  let paintedMarkup = '';
  let pointerDown = false;
  let lastInteraction = 0;
  // Live status fields are updated in place without changing the real controls
  // or interrupting a mouse gesture, keyboard focus, or tempo slider drag.
  const liveIds = [
    'playWithMeState', 'playWithMeText', 'playWithMeProgress',
    'playWithMeRound', 'playWithMeCountdown', 'playWithMeRepeatState',
    'playWithMeSessionProgress', 'playWithMeElapsed', 'practiceStatus',
    'sessionTime', 'sessionReps', 'sessionBestBpm'
  ];

  function userIsEditing() {
    const focused = document.activeElement;
    return !!(focused && content.contains(focused) &&
      focused.matches('input:not([type="checkbox"]):not([type="radio"]),textarea,select'));
  }

  function updateLiveStatuses() {
    if (!latestMarkup) return;
    const template = document.createElement('template');
    template.innerHTML = latestMarkup;
    for (const id of liveIds) {
      const source = template.content.querySelector('[id="' + id + '"]');
      const target = content.querySelector('[id="' + id + '"]');
      if (source && target && target.textContent !== source.textContent) {
        target.textContent = source.textContent;
      }
    }
    // Button states always follow the authoritative playback engine.
    const sources = template.content.querySelectorAll('button[data-gl-remote-key]');
    for (const source of sources) {
      const key = source.getAttribute('data-gl-remote-key');
      const target = content.querySelector('[data-gl-remote-key="' + key + '"]');
      if (!target) continue;
      target.disabled = source.disabled;
      target.className = source.className;
      if (target.textContent !== source.textContent) {
        target.textContent = source.textContent;
      }
    }
  }

  // Reconcile changing labels, state and values without replacing controls.
  // A complete innerHTML rewrite during playback can swallow a mouse click
  // between pointerup and click, reset keyboard focus or break a slider drag.
  function sameStructure(left, right) {
    if (!left || !right || left.nodeType !== right.nodeType ||
        left.nodeName !== right.nodeName ||
        left.childNodes.length !== right.childNodes.length) return false;
    for (let i = 0; i < left.childNodes.length; i++) {
      if (!sameStructure(left.childNodes[i], right.childNodes[i])) return false;
    }
    return true;
  }

  function patchNode(target, source) {
    if (target.nodeType === 3) {
      if (target.nodeValue !== source.nodeValue) target.nodeValue = source.nodeValue;
      return;
    }
    if (target.nodeType !== 1) return;
    const editing = document.activeElement === target ||
      (pointerDown && target.matches('input,select,textarea,button,summary'));
    const preserveValue = editing && target.matches('input,select,textarea');
    for (const attribute of Array.from(target.attributes)) {
      if (!source.hasAttribute(attribute.name) &&
          !(preserveValue && (attribute.name === 'value' ||
                             attribute.name === 'checked' ||
                             attribute.name === 'selected'))) {
        target.removeAttribute(attribute.name);
      }
    }
    for (const attribute of Array.from(source.attributes)) {
      if (preserveValue && (attribute.name === 'value' ||
                            attribute.name === 'checked' ||
                            attribute.name === 'selected')) continue;
      if (target.getAttribute(attribute.name) !== attribute.value) {
        target.setAttribute(attribute.name, attribute.value);
      }
    }
    if (!preserveValue && target.matches('input,textarea')) {
      if (target.type === 'checkbox' || target.type === 'radio') {
        target.checked = source.checked;
      } else if (target.value !== source.value) {
        target.value = source.value;
      }
    } else if (!preserveValue && target.matches('select')) {
      if (target.value !== source.value) target.value = source.value;
    }
    for (let i = 0; i < target.childNodes.length; i++) {
      if (preserveValue && target.nodeName === 'TEXTAREA') break;
      patchNode(target.childNodes[i], source.childNodes[i]);
    }
  }

  function redraw() {
    if (!latestMarkup || latestMarkup === paintedMarkup) return;
    const template = document.createElement('template');
    template.innerHTML = latestMarkup;
    const incoming = template.content.firstElementChild;
    const existing = content.firstElementChild;
    if (incoming && existing && sameStructure(existing, incoming)) {
      patchNode(existing, incoming);
      paintedMarkup = latestMarkup;
      loading.hidden = true;
      return;
    }
    // Structural changes (new history entries or tabs) may need a full render.
    // Do not change the DOM while the user is pressing or editing controls.
    if (pointerDown || userIsEditing() || Date.now() - lastInteraction < 220) {
      updateLiveStatuses();
      return;
    }
    const scrollTop = body.scrollTop;
    const focus = document.activeElement;
    const focusKey = focus && content.contains(focus)
      ? focus.getAttribute('data-gl-remote-key') : null;
    content.innerHTML = latestMarkup;
    const group = content.querySelector('.gl-feature-group');
    if (group) group.hidden = false;
    paintedMarkup = latestMarkup;
    loading.hidden = true;
    body.scrollTop = scrollTop;
    if (focusKey) {
      const replacement = content.querySelector('[data-gl-remote-key="' + focusKey + '"]');
      if (replacement && replacement.matches('button,summary')) {
        replacement.focus({ preventScroll: true });
      }
    }
  }

  api.onSnapshot(function (id, markup) {
    if (id !== panelId || typeof markup !== 'string') return;
    latestMarkup = markup;
    redraw();
  });

  const identifyControl = function (event) {
    const target = event.target;
    if (!target || !target.closest) return null;
    return target.closest('[data-gl-remote-key]');
  };
  const sendAction = function (event, kind) {
    const node = identifyControl(event);
    if (!node || !content.contains(node)) return;
    const key = node.getAttribute('data-gl-remote-key');
    if (!key) return;
    const action = { key: key, kind: kind };
    if (node.matches('input,select,textarea')) {
      action.value = node.value;
      action.checked = node.checked === true;
    }
    lastInteraction = Date.now();
    api.action(panelId, action);
  };

  content.addEventListener('pointerdown', function () {
    pointerDown = true;
    lastInteraction = Date.now();
  });
  // The browser fires click AFTER pointerup. Replacing a button here would
  // discard that click before it can reach the authoritative main window.
  window.addEventListener('pointerup', function () {
    pointerDown = false;
    updateLiveStatuses();
  });
  window.addEventListener('pointercancel', function () {
    pointerDown = false;
    lastInteraction = Date.now();
  });
  content.addEventListener('click', function (event) {
    const target = event.target.closest('button,summary');
    if (target && content.contains(target)) sendAction({target: target}, 'click');
  });
  content.addEventListener('input', function (event) {
    if (event.target.matches('input,textarea')) sendAction(event, 'input');
  });
  content.addEventListener('change', function (event) {
    if (event.target.matches('input,select,textarea')) sendAction(event, 'change');
  });
  content.addEventListener('keydown', function (event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) ||
        !event.target.matches('.gl-feature-tab')) return;
    event.preventDefault();
    sendAction(event, 'key:' + event.key);
  });

  reattach.addEventListener('click', function () {
    api.reattach(panelId);
  });

  // Refresh only when no user control is in the middle of an interaction.
  // The main renderer sends changed snapshots; idle redraw is cheap.
  window.setInterval(redraw, 180);
  api.ready(panelId);
}());
