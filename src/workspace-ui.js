/* Guitare Liberty — modular workspace. Keep the alphaTab score and real transport
   mounted at all times; move existing panels rather than duplicating controls. */
(function () {
  'use strict';

  const glyphs = {
    tab: '<path d="M4 5h16M4 9h16M4 13h16M4 17h16M4 21h16"/><path d="M8 3v20M16 3v20"/>',
    book: '<path d="M12 7c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V6c-3-1-6-1-9 1Z"/><path d="M12 7v14"/>',
    dashboard: '<rect x="3" y="3" width="7" height="8" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    guided: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
    sliders: '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2" fill="#162234"/><circle cx="16" cy="12" r="2" fill="#162234"/><circle cx="8" cy="19" r="2" fill="#162234"/>',
    heart: '<path d="M20.5 8.5c0 4-8.5 10-8.5 10s-8.5-6-8.5-10a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2Z"/>',
    mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V22M8 22h8"/>',
    sparkle: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
    music: '<path d="M9 19V5l12-2v14"/><circle cx="6" cy="19" r="3"/><circle cx="18" cy="17" r="3"/>',
    activity: '<path d="M2 12h4l3-7 4 14 3-7h6"/>',
    history: '<path d="M3 11a9 9 0 1 1 3 7M3 4v7h7"/><path d="M12 6v6l4 2"/>'
  };
  const sections = [
    { id: 'courses', label: 'COURS', icon: 'book', panes: [
      ['Bibliothèque', '.course-nav'], ['Cours actuel', '.lesson-card'],
      ['Vidéo', '.video-stage'], ['Tutoriel', '.tutorial-notice']
    ] },
    { id: 'dashboard', label: 'PARCOURS', icon: 'dashboard', panes: [
      ['Tableau de bord', '.student-dashboard'], ['Progression', '.learning-path']
    ] },
    { id: 'intention', label: 'INTENTION MUSICALE', icon: 'target', panes: [
      ['Ton intention musicale', '.music-goals'], ['Temps de pratique', '.time-session']
    ] },
    { id: 'guided', label: 'SÉANCE GUIDÉE', icon: 'guided', panes: [
      ['Séance guidée', '.guided-session']
    ] },
    { id: 'practice', label: 'ENTRAÎNEMENT', icon: 'sliders', panes: [
      ['Boucles et répétitions', '.practice-panel'], ['Métronome', '.metronome-panel']
    ] },
    { id: 'coach', label: 'COACHS', icon: 'heart', panes: [
      ['Coach humaniste', '.human-coach'], ['Coach IA', '.ai-coach']
    ] },
    { id: 'listen', label: 'ÉCOUTE ET ANALYSE IA', icon: 'mic', panes: [
      ['Analyse de ton jeu', '.ai-listening']
    ] },
    { id: 'liberty', label: 'MODE LIBERTÉ', icon: 'sparkle', panes: [
      ['Mode Liberté', '.liberty-mode']
    ] },
    { id: 'play-with-me', label: 'JOUE AVEC MOI', icon: 'music', panes: [
      ['Joue avec moi', '.play-with-me']
    ] },
    { id: 'session', label: 'SESSION', icon: 'activity', panes: [
      ['Statistiques', '.session-stats'], ['Bilan', '.session-insight']
    ] },
    { id: 'history', label: 'HISTORIQUE', icon: 'history', panes: [
      ['Historique', '.history-panel'], ['Mémoire', '.guitar-memory'],
      ['Journal', '.guitar-journal']
    ] }
  ];

  const descriptions = {
    courses: 'Cours, tablatures et supports',
    dashboard: 'Ton parcours en un coup d’œil',
    intention: 'Choisis ton objectif musical',
    guided: 'Avance à ton propre rythme',
    practice: 'Boucles, tempo et précision',
    coach: 'Des conseils adaptés à ton jeu',
    listen: 'Écoute et analyse de ta guitare',
    liberty: 'Apprends, joue et libère-toi',
    'play-with-me': 'Écoute, réponds, joue',
    session: 'Ton activité et tes progrès',
    history: 'Retrouve ton évolution'
  };

  function svg(name) {
    return '<svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + glyphs[name] + '</svg>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    const workspace = document.getElementById('appWorkspace');
    if (!workspace || workspace.dataset.glWorkspaceReady === 'true') return;
    const content = Array.from(workspace.children).find(function (node) {
      return node.tagName === 'SECTION';
    });
    const toolbar = content && content.querySelector('.toolbar');
    const scoreHead = content && content.querySelector('.score-head');
    const paper = content && content.querySelector('.paper');
    const progress = content && content.querySelector('.transport');
    if (!content || !toolbar || !scoreHead || !paper || !progress) return;
    workspace.dataset.glWorkspaceReady = 'true';
    content.classList.add('gl-workspace-content');

    const transportDock = document.createElement('div');
    transportDock.className = 'gl-transport-dock';
    transportDock.setAttribute('aria-label', 'Transport permanent');
    toolbar.classList.add('gl-permanent-toolbar');
    transportDock.append(toolbar, progress);
    const workspacePresetBar = document.createElement('div');
    workspacePresetBar.className = 'gl-workspace-presets';
    workspacePresetBar.setAttribute('role', 'group');
    workspacePresetBar.setAttribute('aria-label', 'Espaces de travail');
    const presetCaption = document.createElement('span');
    presetCaption.className = 'gl-workspace-preset-caption';
    presetCaption.textContent = 'ESPACE DE TRAVAIL';
    workspacePresetBar.append(presetCaption);
    const workspacePresets = [
      { id: 'learning', label: 'APPRENTISSAGE', dock: 'courses' },
      { id: 'practice', label: 'ENTRAÎNEMENT', dock: 'practice' },
      { id: 'improv', label: 'IMPROVISATION', dock: 'liberty' }
    ];
    const presetButtons = new Map();
    const presetButtonList = document.createElement('div');
    presetButtonList.className = 'gl-workspace-preset-list';
    presetButtonList.setAttribute('aria-label', 'Choisir un espace de travail');
    const createWorkspaceButton = document.createElement('button');
    createWorkspaceButton.type = 'button';
    createWorkspaceButton.className = 'gl-workspace-preset gl-workspace-preset-create';
    createWorkspaceButton.textContent = 'NOUVEL ESPACE';
    createWorkspaceButton.title = 'Créer un espace de travail avec un nom personnalisé';
    createWorkspaceButton.setAttribute('aria-label', 'Créer un espace de travail');

    // Only pre-defined presets are protected. Extra presets are loaded from
    // the native app-data file, not from names interpolated into HTML.
    function renderWorkspacePresets(definitions) {
      const fixed = [
        {id:'learning',label:'APPRENTISSAGE',dock:'courses',builtIn:true},
        {id:'practice',label:'ENTRAÎNEMENT',dock:'practice',builtIn:true},
        {id:'improv',label:'IMPROVISATION',dock:'liberty',builtIn:true}
      ];
      const extra = Array.isArray(definitions) ? definitions.filter(function (item) {
        return item && typeof item.id === 'string' &&
          /^custom-[1-9]\d*$/.test(item.id) &&
          typeof item.label === 'string' && item.label.length >= 1 &&
          item.label.length <= 32 && !fixed.some(base => base.id === item.id);
      }).slice(0,8).map(item => ({
        id:item.id,label:item.label,dock:null,builtIn:false
      })) : [];
      workspacePresets.splice(0, workspacePresets.length, ...fixed, ...extra);
      presetButtons.clear();
      presetButtonList.replaceChildren();
      for (const preset of workspacePresets) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gl-workspace-preset';
        button.textContent = preset.label;
        button.setAttribute('data-gl-workspace', preset.id);
        button.setAttribute('aria-pressed', String(preset.id === 'learning'));
        button.title = preset.label + ' — disposition personnalisable';
        if (preset.id === 'learning') button.classList.add('is-active');
        button.addEventListener('click', function () {
          switchWorkspaceProfile(preset.id);
        });
        presetButtons.set(preset.id, button);
        presetButtonList.append(button);
      }
      presetButtonList.append(createWorkspaceButton);
    }
    renderWorkspacePresets(workspacePresets);
    workspacePresetBar.append(presetButtonList);
    const presetActions = document.createElement('div');
    presetActions.className = 'gl-workspace-preset-actions';
    const saveLayoutButton = document.createElement('button');
    saveLayoutButton.type = 'button';
    saveLayoutButton.className = 'gl-workspace-layout-action';
    saveLayoutButton.textContent = 'ENREGISTRER';
    saveLayoutButton.title = 'Enregistrer les fenêtres et la disposition de cet espace';
    saveLayoutButton.setAttribute('aria-label', 'Enregistrer la disposition de cet espace');
    const resetLayoutButton = document.createElement('button');
    resetLayoutButton.type = 'button';
    resetLayoutButton.className = 'gl-workspace-layout-action gl-workspace-layout-reset';
    resetLayoutButton.textContent = 'RÉINITIALISER';
    resetLayoutButton.title = 'Retrouver la disposition initiale de cet espace uniquement';
    resetLayoutButton.setAttribute('aria-label', 'Réinitialiser cet espace de travail');
    const layoutStatus = document.createElement('span');
    layoutStatus.className = 'gl-workspace-layout-status';
    layoutStatus.setAttribute('role', 'status');
    layoutStatus.setAttribute('aria-live', 'polite');
    const renameWorkspaceButton = document.createElement('button');
    renameWorkspaceButton.type = 'button';
    renameWorkspaceButton.className = 'gl-workspace-layout-action';
    renameWorkspaceButton.textContent = 'RENOMMER';
    renameWorkspaceButton.title = 'Renommer cet espace personnalisé';
    renameWorkspaceButton.hidden = true;
    const deleteWorkspaceButton = document.createElement('button');
    deleteWorkspaceButton.type = 'button';
    deleteWorkspaceButton.className = 'gl-workspace-layout-action gl-workspace-layout-delete';
    deleteWorkspaceButton.textContent = 'SUPPRIMER';
    deleteWorkspaceButton.title = 'Supprimer cet espace personnalisé';
    deleteWorkspaceButton.hidden = true;
    presetActions.append(saveLayoutButton, resetLayoutButton,
      renameWorkspaceButton, deleteWorkspaceButton);
    workspacePresetBar.append(presetActions, layoutStatus);
    transportDock.prepend(workspacePresetBar);
    content.prepend(transportDock);

    const scoreArea = document.createElement('div');
    scoreArea.className = 'gl-score-area';
    scoreArea.id = 'glScoreArea';
    scoreArea.append(scoreHead, paper);
    transportDock.after(scoreArea);

    const rail = document.createElement('nav');
    rail.className = 'gl-icon-rail';
    rail.setAttribute('aria-label', 'Navigation Guitare Liberty');
    const railBrand = document.createElement('div');
    railBrand.className = 'gl-rail-brand';
    railBrand.textContent = 'GL';
    railBrand.title = 'Guitare Liberty';
    rail.append(railBrand);

    const scoreButton = document.createElement('button');
    scoreButton.type = 'button';
    scoreButton.className = 'gl-rail-button is-active';
    scoreButton.title = 'Tablature';
    scoreButton.setAttribute('aria-label', 'Tablature');
    scoreButton.setAttribute('aria-current', 'page');
    scoreButton.innerHTML = svg('tab') + '<span class="gl-rail-text">TAB</span>';
    rail.append(scoreButton);

    const railDivider = document.createElement('div');
    railDivider.className = 'gl-rail-divider';
    railDivider.setAttribute('aria-hidden', 'true');
    rail.append(railDivider);

    const drawer = document.createElement('aside');
    drawer.className = 'gl-context-panel';
    drawer.hidden = true;
    drawer.setAttribute('aria-label', 'Panneaux Guitare Liberty');
    drawer.setAttribute('aria-labelledby', 'glContextTitle');
    const drawerHead = document.createElement('div');
    drawerHead.className = 'gl-context-head';
    const drawerIdentity = document.createElement('div');
    drawerIdentity.className = 'gl-context-identity';
    const drawerIcon = document.createElement('span');
    drawerIcon.className = 'gl-context-icon';
    drawerIcon.setAttribute('aria-hidden', 'true');
    const drawerCopy = document.createElement('div');
    drawerCopy.className = 'gl-context-copy';
    const drawerTitle = document.createElement('strong');
    drawerTitle.id = 'glContextTitle';
    const drawerSubtitle = document.createElement('small');
    drawerSubtitle.className = 'gl-context-subtitle';
    drawerCopy.append(drawerTitle, drawerSubtitle);
    drawerIdentity.append(drawerIcon, drawerCopy);
    const detachButton = document.createElement('button');
    detachButton.className = 'gl-context-detach';
    detachButton.type = 'button';
    detachButton.title = 'Ouvrir ce panneau dans une fenêtre indépendante';
    detachButton.setAttribute('aria-label', 'Détacher le panneau');
    detachButton.textContent = 'DÉTACHER';
    detachButton.hidden = true;
    const closeButton = document.createElement('button');
    closeButton.className = 'gl-context-close';
    closeButton.type = 'button';
    closeButton.title = 'Fermer le panneau';
    closeButton.setAttribute('aria-label', 'Fermer le panneau');
    closeButton.textContent = '×';
    drawerHead.append(drawerIdentity, detachButton, closeButton);
    const drawerBody = document.createElement('div');
    drawerBody.className = 'gl-context-body';
    drawer.append(drawerHead, drawerBody);
    // A single resize handle serves all contextual panels without touching
    // any original feature component or the tablature.
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'gl-panel-resize-handle';
    resizeHandle.setAttribute('role', 'separator');
    resizeHandle.setAttribute('aria-orientation', 'vertical');
    resizeHandle.setAttribute('aria-label', 'Redimensionner le panneau latéral');
    resizeHandle.setAttribute('title', 'Glisser pour ajuster la largeur. Double-clic : largeur initiale.');
    resizeHandle.tabIndex = 0;
    drawer.prepend(resizeHandle);
    workspace.prepend(rail);
    workspace.append(drawer);

    // Native-looking navy name dialog, scoped to the musical workspace.
    // Names are always rendered as text; no user-entered HTML is evaluated.
    const workspaceNameOverlay = document.createElement('div');
    workspaceNameOverlay.className = 'gl-workspace-name-overlay';
    workspaceNameOverlay.hidden = true;
    workspaceNameOverlay.innerHTML = `
      <form class="gl-workspace-name-form" role="dialog"
            aria-modal="true" aria-labelledby="glWorkspaceNameTitle">
        <h2 id="glWorkspaceNameTitle" class="gl-workspace-name-title"></h2>
        <label class="gl-workspace-name-label" for="glWorkspaceNameInput">
          NOM DE L’ESPACE DE TRAVAIL
        </label>
        <input id="glWorkspaceNameInput" type="text" maxlength="32"
               autocomplete="off" spellcheck="false" required>
        <p class="gl-workspace-name-error" role="alert" aria-live="assertive"></p>
        <div class="gl-workspace-name-actions">
          <button type="button" class="gl-workspace-name-cancel">ANNULER</button>
          <button type="submit" class="gl-workspace-name-submit">VALIDER</button>
        </div>
      </form>`;
    workspace.append(workspaceNameOverlay);
    const workspaceNameForm = workspaceNameOverlay.querySelector('form');
    const workspaceNameInput = workspaceNameOverlay.querySelector('#glWorkspaceNameInput');
    const workspaceNameTitle = workspaceNameOverlay.querySelector('#glWorkspaceNameTitle');
    const workspaceNameError = workspaceNameOverlay.querySelector('.gl-workspace-name-error');
    const workspaceNameCancel = workspaceNameOverlay.querySelector('.gl-workspace-name-cancel');
    const workspaceNameSubmit = workspaceNameOverlay.querySelector('.gl-workspace-name-submit');

    const groups = new Map();
    let active = null;
    let activeWorkspaceId = 'learning';
    let workspaceSwitchBusy = false;
    let workspaceGeneration = 0;
    // Do not overwrite an existing saved preset with the initial home-button
    // navigation before the persisted active mode has been read from Electron.
    let suppressPresetSaving = true;
    const detachedAllowed = new Set([
      'dashboard', 'intention', 'guided', 'practice', 'coach', 'liberty',
      'play-with-me', 'session', 'history'
    ]);
    const remoteKeys = new Map();
    let remoteSerial = 0;

    function markRemoteControls(group) {
      const nodes = group.element.querySelectorAll('button,input,select,textarea,summary');
      nodes.forEach(function (node) {
        if (node.hasAttribute('data-gl-remote-key')) return;
        const key = 'remote-' + (++remoteSerial);
        node.setAttribute('data-gl-remote-key', key);
        remoteKeys.set(key, { id: group.id, node: node });
      });
    }

    function snapshotMarkup(group) {
      markRemoteControls(group);
      const cloned = group.element.cloneNode(true);
      cloned.hidden = false;
      const originals = group.element.querySelectorAll('input,select,textarea,canvas');
      const copies = cloned.querySelectorAll('input,select,textarea,canvas');
      originals.forEach(function (node, index) {
        const copy = copies[index];
        if (!copy) return;
        if (node.tagName === 'INPUT') {
          if (node.type === 'checkbox' || node.type === 'radio') {
            copy.toggleAttribute('checked', node.checked);
          } else {
            copy.setAttribute('value', node.value);
          }
        } else if (node.tagName === 'SELECT') {
          Array.from(copy.options).forEach(function (option, optionIndex) {
            option.toggleAttribute('selected',
              !!node.options[optionIndex] && node.options[optionIndex].selected);
          });
        } else if (node.tagName === 'TEXTAREA') {
          copy.textContent = node.value;
        } else if (node.tagName === 'CANVAS') {
          // A chart painted on canvas is not preserved by cloneNode.
          // Mirror its pixels as a non-interactive preview.
          try {
            const image = document.createElement('img');
            image.src = node.toDataURL('image/png');
            image.className = 'gl-detached-chart';
            image.alt = node.getAttribute('aria-label') || 'Graphique de progression';
            copy.replaceWith(image);
          } catch (_) {}
        }
      });
      return cloned.outerHTML;
    }

    function publishSnapshot(group, force) {
      if (!group || !group.detached || !window.guitarAudio?.panelSnapshot) return;
      const markup = snapshotMarkup(group);
      if (force || markup !== group.lastRemoteMarkup) {
        group.lastRemoteMarkup = markup;
        window.guitarAudio.panelSnapshot(group.id, markup);
      }
    }

    function actOnOriginal(groupId, action) {
      if (!action || typeof action.key !== 'string') return;
      const entry = remoteKeys.get(action.key);
      const group = groups.get(groupId);
      if (!entry || !group || entry.id !== groupId || !group.element.contains(entry.node)) return;
      const element = entry.node;
      if (action.kind === 'click' &&
          (element.matches('button') || element.matches('summary'))) {
        element.click();
      } else if (action.kind === 'input' || action.kind === 'change') {
        if (!element.matches('input,select,textarea')) return;
        if (element.type === 'checkbox' || element.type === 'radio') {
          element.checked = action.checked === true;
        } else if (typeof action.value === 'string') {
          element.value = action.value;
        }
        element.dispatchEvent(new Event(action.kind, { bubbles: true }));
      } else if (typeof action.kind === 'string' && action.kind.startsWith('key:') &&
                 element.matches('.gl-feature-tab')) {
        const key = action.kind.slice(4);
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
          element.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
        }
      }
      publishSnapshot(group, true);
    }

    if (window.guitarAudio?.onPanelAction) {
      window.guitarAudio.onPanelAction(actOnOriginal);
      window.guitarAudio.onPanelRequest(function (id) {
        publishSnapshot(groups.get(id), true);
      });
      window.guitarAudio.onPanelClosed(function (id, reason) {
        // A delayed close from an old workspace must not unset a newly opened
        // panel that happens to have the same ID in the new workspace.
        if (reason === 'workspace-switch' || reason === 'workspace-reset') return;
        const group = groups.get(id);
        if (!group || !group.detached) return;
        group.detached = false;
        group.lastRemoteMarkup = '';
        group.button.classList.remove('gl-is-detached');
        group.button.title = group.label;
        // Changing a workspace is NOT a manual RATTACHER.
        if (reason !== 'workspace-switch' && !workspaceSwitchBusy && !workspace.hidden) {
          openPanel(id, group.selectedTabIndex || 0);
        }
      });
    }

    // Keep the tablature comfortably wide on large screens. When there is
    // insufficient room, overlay the drawer rather than squeezing the score.
    const WIDTH_KEY = 'guitar-liberty-panel-width';
    const PRESET_KEY = 'guitar-liberty-workspace-ui-';
    const DEFAULT_WIDTH = 400;
    const MIN_SCORE_WIDTH = 950;
    const WIDTH_STEP = 20;

    function readPresetView(id) {
      const preset = workspacePresets.find(item => item.id === id);
      if (!preset) return {width: DEFAULT_WIDTH, dock: null, tabs: {}};
      const fallback = {width: DEFAULT_WIDTH, dock: preset.dock, tabs: {}};
      try {
        const saved = JSON.parse(localStorage.getItem(PRESET_KEY + id) || 'null');
        if (saved && typeof saved === 'object') {
          const width = Number.isFinite(saved.width) ? saved.width : DEFAULT_WIDTH;
          const dock = typeof saved.dock === 'string' && groups.has(saved.dock)
            ? saved.dock : null;
          const tabs = saved.tabs && typeof saved.tabs === 'object' ? saved.tabs : {};
          return {width: width, dock: dock, tabs: tabs};
        }
        // Migrate the old single drawer width for existing installations.
        if (id === 'learning') {
          const oldWidth = Number.parseInt(localStorage.getItem(WIDTH_KEY), 10);
          if (Number.isFinite(oldWidth)) fallback.width = oldWidth;
        }
      } catch (_) {}
      return fallback;
    }

    let preferredWidth = readPresetView(activeWorkspaceId).width;
    let panelWidth = preferredWidth;
    let draggingPointerId = null;
    function savePresetView() {
      if (suppressPresetSaving || workspaceSwitchBusy) return;
      const tabs = {};
      groups.forEach(function (group) {
        if (Number.isInteger(group.selectedTabIndex)) tabs[group.id] = group.selectedTabIndex;
      });
      const view = {
        width: preferredWidth,
        dock: active ? active.id : null,
        tabs: tabs
      };
      try { localStorage.setItem(PRESET_KEY + activeWorkspaceId, JSON.stringify(view)); }
      catch (_) {}
    }

    function updatePresetButtons() {
      presetButtons.forEach(function (button, id) {
        const selected = id === activeWorkspaceId;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
        button.disabled = workspaceSwitchBusy;
      });
      const unavailable = workspaceSwitchBusy || suppressPresetSaving;
      saveLayoutButton.disabled = unavailable;
      resetLayoutButton.disabled = unavailable;
      const isCustom = workspacePresets.some(preset =>
        preset.id === activeWorkspaceId && !preset.builtIn);
      renameWorkspaceButton.hidden = !isCustom;
      deleteWorkspaceButton.hidden = !isCustom;
      renameWorkspaceButton.disabled = unavailable;
      deleteWorkspaceButton.disabled = unavailable;
      createWorkspaceButton.disabled = unavailable ||
        workspacePresets.filter(preset => !preset.builtIn).length >= 8;
    }

    function showWorkspaceStatus(message) {
      layoutStatus.textContent = message;
    }

    async function refreshWorkspacePresets() {
      if (!window.guitarAudio?.workspaceList) return;
      const definitions = await window.guitarAudio.workspaceList();
      if (!Array.isArray(definitions)) throw new Error('Liste des espaces indisponible');
      renderWorkspacePresets(definitions);
      updatePresetButtons();
    }

    function applyPresetView(id, restoringDetachedIds = []) {
      activeWorkspaceId = id;
      suppressPresetSaving = true;
      try {
        const view = readPresetView(id);
        preferredWidth = view.width;
        updateDrawerGeometry();
        // Fully restore the real DOM (aria-selected, hidden panes and tabs),
        // not just the saved index. Detached windows snapshot this DOM.
        groups.forEach(function (group) {
          const index = view.tabs[group.id];
          applyGroupTabState(group, index);
          if (group.detached) publishSnapshot(group);
        });
        updatePresetButtons();
        const dockGroup = groups.get(view.dock);
        const willDetach = restoringDetachedIds.includes(view.dock);
        if (dockGroup && !dockGroup.detached && !willDetach) {
          openPanel(dockGroup.id, dockGroup.selectedTabIndex || 0);
        } else closePanel();
      } finally {
        suppressPresetSaving = false;
        updatePresetButtons();
      }
    }

    function panelBounds() {
      const railWidth = window.innerWidth <= 740 ? 58 : 78;
      const minimum = window.innerWidth < 700 ? 260 : 300;
      const maximum = Math.max(minimum, Math.min(640, window.innerWidth - railWidth - 220));
      return { railWidth: railWidth, minimum: minimum, maximum: maximum };
    }

    function clampWidth(width) {
      const bounds = panelBounds();
      return Math.min(bounds.maximum, Math.max(bounds.minimum, Math.round(width)));
    }

    function updateDrawerGeometry() {
      const bounds = panelBounds();
      // Preserve the preferred width when the app window is temporarily narrow.
      panelWidth = clampWidth(preferredWidth);
      workspace.style.setProperty('--gl-drawer-width', panelWidth + 'px');
      resizeHandle.setAttribute('aria-valuemin', String(bounds.minimum));
      resizeHandle.setAttribute('aria-valuemax', String(bounds.maximum));
      resizeHandle.setAttribute('aria-valuenow', String(panelWidth));
      resizeHandle.setAttribute('aria-valuetext', panelWidth + ' pixels');
      const shouldOverlay = window.innerWidth - bounds.railWidth - panelWidth < MIN_SCORE_WIDTH;
      const wasOverlay = workspace.classList.contains('gl-panel-overlay');
      const wasDocked = workspace.classList.contains('gl-panel-docked');
      workspace.classList.toggle('gl-panel-overlay', shouldOverlay);
      workspace.classList.toggle('gl-panel-docked', !shouldOverlay);
      return wasOverlay !== shouldOverlay || wasDocked !== !shouldOverlay;
    }

    function setDrawerWidth(width, persist) {
      preferredWidth = clampWidth(width);
      const modeChanged = updateDrawerGeometry();
      if (persist) {
        savePresetView();
      }
      return modeChanged;
    }

    resizeHandle.addEventListener('pointerdown', function (event) {
      if (!active || event.button !== 0 || draggingPointerId !== null) return;
      event.preventDefault();
      draggingPointerId = event.pointerId;
      document.documentElement.classList.add('gl-panel-is-resizing');
      resizeHandle.setPointerCapture(event.pointerId);
    });

    resizeHandle.addEventListener('pointermove', function (event) {
      if (draggingPointerId !== event.pointerId) return;
      const changed = setDrawerWidth(window.innerWidth - event.clientX, false);
      if (changed) requestScoreLayout();
    });

    function endPanelResize(event) {
      if (draggingPointerId !== event.pointerId) return;
      draggingPointerId = null;
      document.documentElement.classList.remove('gl-panel-is-resizing');
      if (resizeHandle.hasPointerCapture(event.pointerId)) {
        resizeHandle.releasePointerCapture(event.pointerId);
      }
      setDrawerWidth(panelWidth, true);
      requestScoreLayout();
    }

    resizeHandle.addEventListener('pointerup', endPanelResize);
    resizeHandle.addEventListener('pointercancel', endPanelResize);
    resizeHandle.addEventListener('lostpointercapture', function (event) {
      if (draggingPointerId !== event.pointerId) return;
      draggingPointerId = null;
      document.documentElement.classList.remove('gl-panel-is-resizing');
      setDrawerWidth(panelWidth, true);
      requestScoreLayout();
    });

    resizeHandle.addEventListener('dblclick', function () {
      setDrawerWidth(DEFAULT_WIDTH, true);
      requestScoreLayout();
    });
    resizeHandle.addEventListener('keydown', function (event) {
      const bounds = panelBounds();
      const step = event.shiftKey ? WIDTH_STEP * 2 : WIDTH_STEP;
      let next = panelWidth;
      if (event.key === 'ArrowLeft') next += step;
      else if (event.key === 'ArrowRight') next -= step;
      else if (event.key === 'Home') next = bounds.minimum;
      else if (event.key === 'End') next = bounds.maximum;
      else return;
      event.preventDefault();
      setDrawerWidth(next, true);
      requestScoreLayout();
    });

    // One-way resize listener: never redispatch resize from this callback.
    window.addEventListener('resize', updateDrawerGeometry);
    updateDrawerGeometry();

    function requestScoreLayout() {
      requestAnimationFrame(function () {
        const api = window.guitarLibertyAlphaTab;
        if (api && typeof api.resize === 'function') api.resize();
        window.dispatchEvent(new Event('resize'));
      });
    }

    function applyGroupTabState(group, selectedIndex) {
      if (!group || !group.panes.length) return;
      const index = Number.isInteger(selectedIndex) &&
        selectedIndex >= 0 && selectedIndex < group.panes.length
        ? selectedIndex : 0;
      group.selectedTabIndex = index;
      group.panes.forEach(function (pane, n) {
        pane.hidden = n !== index;
        if (n === index) {
          const inner = pane.firstElementChild;
          if (inner && (inner.id === 'guidedSession' || inner.id === 'aiListening')) {
            inner.hidden = false;
          }
        }
      });
      group.tabs.forEach(function (button, n) {
        const selected = n === index;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
    }

    function selectTab(group, index) {
      applyGroupTabState(group, index);
      drawerBody.scrollTop = 0;
      requestScoreLayout();
      publishSnapshot(group);
      savePresetView();
    }

    function closePanel() {
      drawer.hidden = true;
      document.documentElement.classList.remove('gl-panel-is-resizing');
      workspace.classList.remove('gl-context-open');
      if (active) {
        active.element.hidden = true;
        active.button.classList.remove('is-active');
        active.button.setAttribute('aria-expanded', 'false');
      }
      active = null;
      scoreButton.classList.add('is-active');
      scoreButton.setAttribute('aria-current', 'page');
      savePresetView();
      requestScoreLayout();
    }

    function openPanel(id, index) {
      const group = groups.get(id);
      if (!group) return;
      if (group.detached && window.guitarAudio?.panelOpen) {
        if (typeof index === 'number') selectTab(group, index);
        window.guitarAudio.panelOpen(id, group.label).catch(console.error);
        publishSnapshot(group, true);
        return;
      }
      if (active === group && typeof index !== 'number') {
        closePanel();
        return;
      }
      if (active) {
        active.element.hidden = true;
        active.button.classList.remove('is-active');
        active.button.setAttribute('aria-expanded', 'false');
      }
      active = group;
      scoreButton.classList.remove('is-active');
      scoreButton.removeAttribute('aria-current');
      group.element.hidden = false;
      drawer.hidden = false;
      workspace.classList.add('gl-context-open');
      updateDrawerGeometry();
      drawerTitle.textContent = group.label;
      detachButton.hidden = !detachedAllowed.has(id) ||
        !window.guitarAudio?.panelOpen;
      drawerSubtitle.textContent = descriptions[id] || 'Espace musical';
      drawerIcon.innerHTML = svg(group.icon);
      group.button.classList.add('is-active');
      group.button.setAttribute('aria-expanded', 'true');
      selectTab(group, typeof index === 'number' ? index : 0);
    }

    sections.forEach(function (spec) {
      const nodes = spec.panes.map(function (definition) {
        return { title: definition[0], node: workspace.querySelector(definition[1]) };
      }).filter(function (item) { return Boolean(item.node); });
      if (!nodes.length) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gl-rail-button';
      button.title = spec.label;
      button.setAttribute('aria-label', spec.label);
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', 'gl-panel-' + spec.id);
      button.innerHTML = svg(spec.icon) + '<span class="gl-rail-text">' + spec.label + '</span>';
      rail.append(button);
      const element = document.createElement('div');
      element.className = 'gl-feature-group';
      element.id = 'gl-panel-' + spec.id;
      element.hidden = true;
      const tabs = document.createElement('div');
      tabs.className = 'gl-feature-tabs';
      tabs.setAttribute('role', 'tablist');
      const panes = [];
      const tabButtons = [];
      nodes.forEach(function (entry, index) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'gl-feature-tab';
        tab.textContent = entry.title;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', 'false');
        tab.id = 'gl-tab-' + spec.id + '-' + index;
        tab.setAttribute('aria-controls', 'gl-pane-' + spec.id + '-' + index);
        tab.tabIndex = -1;
        const pane = document.createElement('div');
        pane.className = 'gl-feature-pane';
        pane.id = 'gl-pane-' + spec.id + '-' + index;
        pane.setAttribute('role', 'tabpanel');
        pane.setAttribute('aria-labelledby', tab.id);
        pane.hidden = true;
        pane.append(entry.node);
        if ((entry.node.classList.contains('video-stage') ||
             entry.node.classList.contains('tutorial-notice'))) {
          const placeholder = document.createElement('p');
          placeholder.className = 'gl-feature-empty';
          placeholder.textContent = entry.node.classList.contains('video-stage')
            ? 'Aucune vidéo disponible pour ce cours pour le moment.'
            : 'Aucun tutoriel disponible pour ce cours pour le moment.';
          pane.append(placeholder);
        }
        tabs.append(tab);
        element.append(pane);
        tab.addEventListener('click', function () { selectTab(groups.get(spec.id), index); });
        tab.addEventListener('keydown', function (event) {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const last = tabButtons.length - 1;
          const next = event.key === 'Home' ? 0 :
            event.key === 'End' ? last :
            (index + (event.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length;
          selectTab(groups.get(spec.id), next);
          tabButtons[next].focus();
        });
        tabButtons.push(tab);
        panes.push(pane);
      });
      if (nodes.length > 1) element.prepend(tabs);
      drawerBody.append(element);
      groups.set(spec.id, {
        id: spec.id, label: spec.label, icon: spec.icon, button: button,
        element: element, panes: panes, tabs: tabButtons,
        detached: false, selectedTabIndex: 0, lastRemoteMarkup: ''
      });
      button.addEventListener('click', function () { openPanel(spec.id); });
    });

    // Keep import available in its original course workflow.
    const importButton = workspace.querySelector('#importScore');
    const courses = groups.get('courses');
    if (importButton && courses) {
      courses.panes[0].prepend(importButton);
    }
    // This old scroll-only control has no purpose in the docked workspace.
    const backTop = content.querySelector('.back-to-top-wrap');
    if (backTop) backTop.hidden = true;

    function setPanelDetachedAppearance(group, detached) {
      group.detached = detached;
      group.button.classList.toggle('gl-is-detached', detached);
      group.button.title = detached ? group.label + ' — fenêtre détachée' : group.label;
      if (detached && active === group) closePanel();
    }

    async function openDetachedGroup(group, restoring) {
      if (!group || !detachedAllowed.has(group.id) ||
          !window.guitarAudio?.panelOpen) return false;
      // Mark the group before the native window loads: it can request its first
      // snapshot before the async IPC opening call resolves.
      setPanelDetachedAppearance(group, true);
      group.lastRemoteMarkup = '';
      try {
        const result = await window.guitarAudio.panelOpen(group.id, group.label, restoring);
        if (!result?.opened || !group.detached) {
          if (group.detached) setPanelDetachedAppearance(group, false);
          return false;
        }
        publishSnapshot(group, true);
        return true;
      } catch (error) {
        setPanelDetachedAppearance(group, false);
        console.error('Impossible d’ouvrir le panneau détaché :', error);
        return false;
      }
    }

    async function switchWorkspaceProfile(id) {
      if (workspace.hidden || workspaceSwitchBusy || id === activeWorkspaceId ||
          !workspacePresets.some(preset => preset.id === id) ||
          !window.guitarAudio?.workspaceSwitch) return false;
      savePresetView();
      workspaceGeneration++;
      // Cancel pending restoration from the former workspace. In particular,
      // a delayed IPC answer must never reopen its floating panels here.
      restorationRequested = true;
      pendingRestoredIds = [];
      workspaceSwitchBusy = true;
      showWorkspaceStatus('');
      updatePresetButtons();
      try {
        const layout = await window.guitarAudio.workspaceSwitch(id);
        if (!layout || layout.id !== id || !Array.isArray(layout.openPanels)) return false;
        // The main process has closed the old windows, preserving their layout.
        groups.forEach(function (group) {
          group.detached = false;
          group.lastRemoteMarkup = '';
          group.button.classList.remove('gl-is-detached');
          group.button.title = group.label;
        });
        closePanel();
        // Restore tab contents BEFORE creating floating windows. Otherwise
        // the initial snapshots can show tabs from the preceding workspace.
        applyPresetView(id, layout.openPanels);
        for (const panelId of layout.openPanels) {
          const group = groups.get(panelId);
          if (!group || !detachedAllowed.has(panelId)) continue;
          await openDetachedGroup(group, true);
        }
        return true;
      } catch (error) {
        console.error('Impossible de changer d’espace de travail :', error);
        window.alert('Le changement d’espace de travail a échoué.');
        return false;
      } finally {
        workspaceSwitchBusy = false;
        updatePresetButtons();
      }
    }

    // Create and rename never manipulate a lesson or audio player. Only the
    // named preset list and its saved window arrangement are modified.
    let workspaceNameMode = 'create';
    let workspaceNameBusy = false;
    let workspaceNamePreviousFocus = null;
    let workspaceNameEditedId = null;
    function closeWorkspaceNameDialog() {
      if (workspaceNameBusy) return;
      workspaceNameOverlay.hidden = true;
      workspaceNameError.textContent = '';
      workspaceNamePreviousFocus?.focus?.();
      workspaceNamePreviousFocus = null;
    }
    function openWorkspaceNameDialog(mode) {
      if (workspace.hidden || workspaceSwitchBusy || suppressPresetSaving ||
          !window.guitarAudio?.workspaceCreate) return;
      const preset = workspacePresets.find(item => item.id === activeWorkspaceId);
      if (mode === 'rename' && (!preset || preset.builtIn)) return;
      workspaceNameMode = mode;
      workspaceNameEditedId = mode === 'rename' ? activeWorkspaceId : null;
      workspaceNamePreviousFocus = document.activeElement;
      workspaceNameTitle.textContent = mode === 'create'
        ? 'CRÉER UN ESPACE DE TRAVAIL' : 'RENOMMER L’ESPACE DE TRAVAIL';
      workspaceNameSubmit.textContent = mode === 'create' ? 'CRÉER' : 'ENREGISTRER';
      workspaceNameInput.value = mode === 'rename' ? preset.label : '';
      workspaceNameInput.disabled = false;
      workspaceNameSubmit.disabled = false;
      workspaceNameError.textContent = '';
      workspaceNameOverlay.hidden = false;
      workspaceNameInput.focus();
      if (mode === 'rename') workspaceNameInput.select();
    }
    createWorkspaceButton.addEventListener('click', function () {
      openWorkspaceNameDialog('create');
    });
    renameWorkspaceButton.addEventListener('click', function () {
      openWorkspaceNameDialog('rename');
    });
    workspaceNameCancel.addEventListener('click', closeWorkspaceNameDialog);
    workspaceNameOverlay.addEventListener('click', function (event) {
      if (event.target === workspaceNameOverlay) closeWorkspaceNameDialog();
    });
    workspaceNameOverlay.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeWorkspaceNameDialog();
      }
    });
    workspaceNameForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (workspaceNameBusy || workspaceSwitchBusy) return;
      const name = workspaceNameInput.value.trim().replace(/\s+/g, ' ');
      if (!name || name.length > 32) {
        workspaceNameError.textContent = 'Saisis un nom de 1 à 32 caractères.';
        workspaceNameInput.focus();
        return;
      }
      const alreadyNamed = workspacePresets.some(preset =>
        preset.id !== workspaceNameEditedId &&
        preset.label.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr'));
      if (alreadyNamed) {
        workspaceNameError.textContent = 'Un espace porte déjà ce nom.';
        return;
      }
      workspaceNameBusy = true;
      workspaceSwitchBusy = true;
      workspaceNameInput.disabled = true;
      workspaceNameSubmit.disabled = true;
      updatePresetButtons();
      try {
        let nextWorkspaceId = null;
        if (workspaceNameMode === 'create') {
          const created = await window.guitarAudio.workspaceCreate(name);
          if (!created?.id) throw new Error('Création non confirmée');
          nextWorkspaceId = created.id;
        } else {
          const renamed = await window.guitarAudio.workspaceRename(workspaceNameEditedId, name);
          if (!renamed?.id) throw new Error('Renommage non confirmé');
        }
        await refreshWorkspacePresets();
        workspaceNameBusy = false;
        workspaceSwitchBusy = false;
        updatePresetButtons();
        closeWorkspaceNameDialog();
        if (nextWorkspaceId) {
          const switched = await switchWorkspaceProfile(nextWorkspaceId);
          showWorkspaceStatus(switched
            ? 'Nouvel espace créé' : 'Espace créé — sélectionne-le pour l’ouvrir');
        } else {
          showWorkspaceStatus('Espace renommé');
        }
      } catch (error) {
        console.error('Nom de l’espace de travail :', error);
        workspaceNameError.textContent = error?.message || 'Opération impossible';
      } finally {
        workspaceNameBusy = false;
        workspaceSwitchBusy = false;
        workspaceNameInput.disabled = false;
        workspaceNameSubmit.disabled = false;
        updatePresetButtons();
      }
    });

    deleteWorkspaceButton.addEventListener('click', async function () {
      if (workspace.hidden || workspaceSwitchBusy || suppressPresetSaving ||
          !window.guitarAudio?.workspaceDelete) return;
      const previous = workspacePresets.find(item => item.id === activeWorkspaceId);
      if (!previous || previous.builtIn) return;
      if (!window.confirm('Supprimer définitivement l’espace « ' + previous.label +
          ' » et sa disposition ? Les trois espaces principaux seront conservés.')) return;
      // The native bridge refuses deleting an active preset, so switch first.
      if (!(await switchWorkspaceProfile('learning'))) return;
      workspaceSwitchBusy = true;
      updatePresetButtons();
      try {
        const result = await window.guitarAudio.workspaceDelete(previous.id);
        if (!result?.deleted) throw new Error('Suppression non confirmée');
        try { localStorage.removeItem(PRESET_KEY + previous.id); } catch (_) {}
        await refreshWorkspacePresets();
        showWorkspaceStatus('Espace supprimé');
      } catch (error) {
        console.error('Suppression de l’espace :', error);
        showWorkspaceStatus('Suppression impossible');
      } finally {
        workspaceSwitchBusy = false;
        updatePresetButtons();
      }
    });

    saveLayoutButton.addEventListener('click', async function () {
      if (workspace.hidden || workspaceSwitchBusy || suppressPresetSaving ||
          !window.guitarAudio?.workspaceSave) return;
      savePresetView(); // Persist the current sidebar before locking the selector.
      workspaceSwitchBusy = true;
      updatePresetButtons();
      showWorkspaceStatus('');
      try {
        const result = await window.guitarAudio.workspaceSave(activeWorkspaceId);
        if (!result?.saved || result.id !== activeWorkspaceId) {
          throw new Error('Sauvegarde non confirmée');
        }
        showWorkspaceStatus('Disposition enregistrée');
      } catch (error) {
        console.error('Enregistrement de la disposition :', error);
        showWorkspaceStatus('Enregistrement impossible');
      } finally {
        workspaceSwitchBusy = false;
        updatePresetButtons();
      }
    });

    resetLayoutButton.addEventListener('click', async function () {
      if (workspace.hidden || workspaceSwitchBusy || suppressPresetSaving ||
          !window.guitarAudio?.workspaceReset) return;
      const preset = workspacePresets.find(item => item.id === activeWorkspaceId);
      if (!window.confirm('Réinitialiser uniquement l’espace « ' +
          (preset?.label || activeWorkspaceId) + ' » ? Les autres espaces seront conservés.')) return;
      workspaceSwitchBusy = true;
      workspaceGeneration++;
      updatePresetButtons();
      showWorkspaceStatus('');
      try {
        const result = await window.guitarAudio.workspaceReset(activeWorkspaceId);
        if (!result?.reset || result.id !== activeWorkspaceId) {
          throw new Error('Réinitialisation non confirmée');
        }
        // The native process closed floating panels without affecting playback.
        // Discard any leftover startup restoration for this reset workspace.
        restorationRequested = true;
        pendingRestoredIds = [];
        groups.forEach(function (group) {
          group.detached = false;
          group.lastRemoteMarkup = '';
          group.button.classList.remove('gl-is-detached');
          group.button.title = group.label;
          group.selectedTabIndex = 0;
        });
        closePanel();
        try { localStorage.removeItem(PRESET_KEY + activeWorkspaceId); } catch (_) {}
        applyPresetView(activeWorkspaceId);
        showWorkspaceStatus('Disposition initiale restaurée');
      } catch (error) {
        console.error('Réinitialisation de la disposition :', error);
        showWorkspaceStatus('Réinitialisation impossible');
      } finally {
        workspaceSwitchBusy = false;
        updatePresetButtons();
      }
    });

    detachButton.addEventListener('click', async function () {
      const group = active;
      if (!group || !detachedAllowed.has(group.id)) return;
      detachButton.disabled = true;
      try {
        const opened = await openDetachedGroup(group, false);
        if (!opened) window.alert('Impossible d’ouvrir la fenêtre détachée.');
      } finally {
        detachButton.disabled = false;
      }
    });

    // Restore only once, on the first entry into the music workspace.
    // Opening the home page again in the same session must never re-open
    // windows that the guitarist has deliberately closed.
    let restorationRequested = false;
    let restorationInProgress = false;
    let pendingRestoredIds = null;
    async function restoreDetachedPanels() {
      if (workspace.hidden || restorationInProgress ||
          !window.guitarAudio?.panelRestorable) return;
      restorationInProgress = true;
      const generation = workspaceGeneration;
      try {
        if (!restorationRequested) {
          restorationRequested = true;
          let saved;
          if (window.guitarAudio.workspaceGet) {
            // Populate dynamic names before selecting the last active preset.
            if (window.guitarAudio.workspaceList) {
              await refreshWorkspacePresets();
              if (generation !== workspaceGeneration) return;
            }
            const layout = await window.guitarAudio.workspaceGet();
            if (generation !== workspaceGeneration) return;
            if (layout && workspacePresets.some(preset => preset.id === layout.id)) {
              activeWorkspaceId = layout.id;
              applyPresetView(layout.id, Array.isArray(layout.openPanels)
                ? layout.openPanels : []);
            } else suppressPresetSaving = false;
            saved = layout?.openPanels;
          } else {
            saved = await window.guitarAudio.panelRestorable();
          }
          if (generation !== workspaceGeneration) return;
          pendingRestoredIds = Array.isArray(saved) ? saved : [];
        }
        // If the guitarist briefly returns to the welcome page, resume any
        // remaining windows on the next workspace entry rather than losing them.
        while (!workspace.hidden && generation === workspaceGeneration &&
               pendingRestoredIds?.length) {
          const id = pendingRestoredIds.shift();
          const group = groups.get(id);
          if (!group || !detachedAllowed.has(id) || group.detached) continue;
          await openDetachedGroup(group, true);
        }
      } catch (error) {
        // Recover on the next entry if the main process temporarily failed.
        restorationRequested = false;
        pendingRestoredIds = null;
        console.warn('Restauration de l’espace musical indisponible :', error);
      } finally {
        restorationInProgress = false;
      }
    }

    // Audio/playback timing stays in the original renderer. Replicate only
    // the visual state, more frequently during JOUE AVEC MOI and loop work,
    // so the detached display does not visibly lag the main transport.
    const lastPublished = new Map();
    window.setInterval(function () {
      if (workspace.hidden) return;
      const now = performance.now();
      groups.forEach(function (group) {
        if (!group.detached) return;
        const minInterval = group.id === 'play-with-me' ? 100 :
          group.id === 'practice' ? 200 : 500;
        if (now - (lastPublished.get(group.id) || 0) < minInterval) return;
        lastPublished.set(group.id, now);
        publishSnapshot(group);
      });
    }, 100);

    scoreButton.addEventListener('click', function () {
      closePanel();
      scoreArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    closeButton.addEventListener('click', closePanel);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && active) closePanel();
    });

    window.guitarLibertyWorkspaceUI = {
      openPanel: openPanel,
      closePanel: closePanel,
      restoreDetachedPanels: restoreDetachedPanels,
      openTarget: function (target) {
        if (target === 'courses') openPanel('courses');
        else if (target === 'coach') openPanel('coach', 1);
        else if (target === 'listen') openPanel('listen');
        else closePanel();
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
    };
    requestScoreLayout();
  });
}());
