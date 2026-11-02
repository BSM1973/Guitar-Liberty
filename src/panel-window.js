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

  function userIsEditing() {
    const focused = document.activeElement;
    return !!(focused && content.contains(focused) &&
      focused.matches('input:not([type="checkbox"]):not([type="radio"]),textarea,select'));
  }

  function redraw() {
    if (!latestMarkup || latestMarkup === paintedMarkup) return;
    // Avoid destroying an active text field, or replacing a clicked control
    // between pointerdown and pointerup.
    if (pointerDown || userIsEditing() || Date.now() - lastInteraction < 160) return;
    const scrollTop = body.scrollTop;
    content.innerHTML = latestMarkup;
    const group = content.querySelector('.gl-feature-group');
    if (group) group.hidden = false;
    paintedMarkup = latestMarkup;
    loading.hidden = true;
    body.scrollTop = scrollTop;
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

  content.addEventListener('pointerdown', function () { pointerDown = true; });
  window.addEventListener('pointerup', function () { pointerDown = false; redraw(); });
  window.addEventListener('pointercancel', function () { pointerDown = false; redraw(); });
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
