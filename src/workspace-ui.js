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
    const layoutStyleLabel = document.createElement('label');
    layoutStyleLabel.className = 'gl-workspace-style-label';
    layoutStyleLabel.textContent = 'DISPOSITION';
    const layoutStyleSelect = document.createElement('select');
    layoutStyleSelect.className = 'gl-workspace-style-select';
    layoutStyleSelect.setAttribute('aria-label', 'Style de disposition des fenêtres détachées');
    for (const [value, text] of [
      ['mosaic', 'Mosaïque'], ['columns', 'Colonnes'], ['cascade', 'Cascade']
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      layoutStyleSelect.append(option);
    }
    layoutStyleSelect.value = 'mosaic';
    layoutStyleLabel.append(layoutStyleSelect);
    const screenModeLabel = document.createElement('label');
    screenModeLabel.className = 'gl-workspace-style-label';
    screenModeLabel.textContent = 'ÉCRANS';
    const screenModeSelect = document.createElement('select');
    screenModeSelect.className = 'gl-workspace-style-select gl-workspace-screen-select';
    screenModeSelect.setAttribute('aria-label', 'Écrans utilisés pour les fenêtres détachées');
    for (const [value, text] of [
      ['secondary-first', 'Priorité annexes'],
      ['all', 'Tous les écrans'],
      ['primary', 'Écran principal'],
      ['secondary', 'Annexes uniquement']
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      screenModeSelect.append(option);
    }
    screenModeSelect.value = 'secondary-first';
    screenModeSelect.title = 'Choisir les écrans utilisés par les fenêtres détachées pour cet espace';
    screenModeLabel.append(screenModeSelect);
    const distributeLayoutButton = document.createElement('button');
    distributeLayoutButton.type = 'button';
    distributeLayoutButton.className =
      'gl-workspace-layout-action gl-workspace-layout-distribute';
    distributeLayoutButton.textContent = 'RÉPARTIR';
    distributeLayoutButton.title =
      'Répartir automatiquement les fenêtres détachées sur les écrans disponibles';
    distributeLayoutButton.setAttribute('aria-label',
      'Répartir les fenêtres détachées sur les écrans');
    const screenMapButton = document.createElement('button');
    screenMapButton.type = 'button';
    screenMapButton.className = 'gl-workspace-layout-action gl-workspace-layout-map';
    screenMapButton.textContent = 'PLAN DES ÉCRANS';
    screenMapButton.title = 'Voir les moniteurs et retrouver les fenêtres détachées';
    screenMapButton.setAttribute('aria-label', 'Afficher le plan des écrans');
    const autoLayoutButton = document.createElement('button');
    autoLayoutButton.type = 'button';
    autoLayoutButton.className = 'gl-workspace-layout-action gl-workspace-layout-auto';
    autoLayoutButton.textContent = 'AUTO : NON';
    autoLayoutButton.title =
      'Activer la répartition automatique à l’ouverture des fenêtres et lors des changements d’écran';
    autoLayoutButton.setAttribute('aria-label', 'Répartition automatique des fenêtres détachées');
    autoLayoutButton.setAttribute('aria-pressed', 'false');
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
    presetActions.append(layoutStyleLabel, screenModeLabel, distributeLayoutButton, screenMapButton, autoLayoutButton, saveLayoutButton,
      resetLayoutButton, renameWorkspaceButton, deleteWorkspaceButton);
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

    // Read-only overview of the physical screens and native detached windows.
    // The preview never embeds another tablature or audio renderer.
    const screenMapOverlay = document.createElement('div');
    screenMapOverlay.className = 'gl-workspace-map-overlay';
    screenMapOverlay.hidden = true;
    screenMapOverlay.innerHTML = `
      <section class="gl-workspace-map-dialog" role="dialog" aria-modal="true"
               aria-labelledby="glWorkspaceMapTitle">
        <header class="gl-workspace-map-header">
          <div>
            <h2 id="glWorkspaceMapTitle">PLAN DES ÉCRANS</h2>
            <p class="gl-workspace-map-summary" aria-live="polite"></p>
          </div>
          <button type="button" class="gl-workspace-map-close"
                  aria-label="Fermer le plan des écrans">FERMER</button>
        </header>
        <div class="gl-workspace-map-screens"></div>
        <div class="gl-workspace-map-footer">
          <span class="gl-workspace-map-message" role="status" aria-live="polite"></span>
          <button type="button" class="gl-workspace-map-refresh">ACTUALISER</button>
        </div>
      </section>`;
    workspace.append(screenMapOverlay);
    const screenMapSummary = screenMapOverlay.querySelector('.gl-workspace-map-summary');
    const screenMapScreens = screenMapOverlay.querySelector('.gl-workspace-map-screens');
    const screenMapMessage = screenMapOverlay.querySelector('.gl-workspace-map-message');
    const screenMapClose = screenMapOverlay.querySelector('.gl-workspace-map-close');
    const screenMapRefresh = screenMapOverlay.querySelector('.gl-workspace-map-refresh');

    const groups = new Map();
    let active = null;
    let activeWorkspaceId = 'learning';
    let activeAutoArrange = false;
    let activeLayoutStyle = 'mosaic';
    let activeScreenMode = 'secondary-first';
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
      layoutStyleSelect.disabled = unavailable;
      layoutStyleSelect.value = activeLayoutStyle;
      screenModeSelect.disabled = unavailable;
      screenModeSelect.value = activeScreenMode;
      distributeLayoutButton.disabled = unavailable;
      screenMapButton.disabled = unavailable;
      autoLayoutButton.disabled = unavailable;
      autoLayoutButton.textContent = activeAutoArrange ? 'AUTO : OUI' : 'AUTO : NON';
      autoLayoutButton.setAttribute('aria-pressed', String(activeAutoArrange));
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
      // Reopening a drawer keeps the tab last used in this workspace.
      selectTab(group, typeof index === 'number' ? index : group.selectedTabIndex || 0);
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
      if (typeof closeScreenMap === 'function') closeScreenMap(false);
      savePresetView();
      const previousRestorationRequested = restorationRequested;
      const previousRestoredIds = pendingRestoredIds?.slice() || null;
      workspaceGeneration++;
      // Cancel pending restoration from the former workspace. In particular,
      // a delayed IPC answer must never reopen its floating panels here.
      restorationRequested = true;
      pendingRestoredIds = [];
      workspaceSwitchBusy = true;
      let nativeSwitched = false;
      showWorkspaceStatus('');
      updatePresetButtons();
      try {
        const layout = await window.guitarAudio.workspaceSwitch(id);
        if (!layout || layout.id !== id || !Array.isArray(layout.openPanels)) {
          throw new Error('Disposition non valide');
        }
        nativeSwitched = true;
        activeAutoArrange = layout.autoArrange === true;
        activeLayoutStyle = ['mosaic','columns','cascade'].includes(layout.layoutStyle)
          ? layout.layoutStyle : 'mosaic';
        activeScreenMode = ['secondary-first','all','primary','secondary'].includes(layout.screenMode)
          ? layout.screenMode : 'secondary-first';
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
        if (activeAutoArrange && window.guitarAudio?.workspaceDistribute) {
          try { await window.guitarAudio.workspaceDistribute(id); }
          catch (error) { console.warn('Répartition au changement d’espace :', error); }
        }
        return true;
      } catch (error) {
        if (!nativeSwitched) {
          // The old workspace is still authoritative. Restore its pending
          // windows rather than silently discarding an interrupted session.
          restorationRequested = previousRestorationRequested;
          pendingRestoredIds = previousRestoredIds;
        }
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
        // Do not also close the dock beneath the modal.
        event.stopPropagation();
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

    let screenMapRequest = 0;
    let screenMapPreviousFocus = null;
    let screenMapDisplays = [];
    let screenMapPanels = new Set();
    const screenMapFavoriteSlots = new Map();
    let screenMapFavoritePreview = null;
    let screenMapFavoritePreviewBusy = false;
    let screenMapFavoriteComparison = null;
    let screenMapFavoriteCompareBusy = false;
    let screenMapOverlapFixBusy = false;
    function clearScreenMapFavoriteComparison() {
      if (!screenMapFavoriteComparison) return;
      screenMapFavoriteComparison.section.hidden = true;
      screenMapFavoriteComparison.button.textContent = 'COMPARER';
      screenMapFavoriteComparison.button.setAttribute('aria-pressed','false');
      screenMapFavoriteComparison = null;
    }
    function clearScreenMapFavoritePreview() {
      if (screenMapFavoritePreview) {
        screenMapFavoritePreview.layer.hidden = true;
        screenMapFavoritePreview.button.textContent = 'APERÇU';
        screenMapFavoritePreview.button.setAttribute('aria-pressed','false');
        screenMapFavoritePreview = null;
      }
    }
    let screenMapDraggedId = null;
    let screenMapMoving = false;
    function closeScreenMap(restoreFocus = true) {
      screenMapRequest++;
      screenMapOverlay.hidden = true;
      screenMapMessage.textContent = '';
      screenMapDraggedId = null;
      screenMapDisplays = [];
      screenMapPanels = new Set();
      screenMapFavoriteSlots.clear();
      clearScreenMapFavoritePreview();
      clearScreenMapFavoriteComparison();
      screenMapMoving = false;
      if (restoreFocus) screenMapPreviousFocus?.focus?.();
      screenMapPreviousFocus = null;
    }
    async function focusScreenMapPanel(panelId) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          !window.guitarAudio?.workspaceFocusPanel) return;
      const workspaceId = activeWorkspaceId;
      screenMapMessage.textContent = 'Localisation de la fenêtre…';
      try {
        const result = await window.guitarAudio.workspaceFocusPanel(workspaceId,panelId);
        if (screenMapOverlay.hidden || workspaceId !== activeWorkspaceId) return;
        if (!result || result.id !== panelId || result.focused !== true) {
          throw new Error('Fenêtre non confirmée');
        }
        // Do not return keyboard focus to the main window: the user explicitly
        // chose a detached native panel.
        closeScreenMap(false);
      } catch (error) {
        console.error('Localisation du panneau :',error);
        if (!screenMapOverlay.hidden) {
          screenMapMessage.textContent = 'Impossible de retrouver cette fenêtre';
        }
      }
    }
    async function moveScreenMapPanel(panelId,displayIndex,x,y) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || !screenMapPanels.has(panelId) ||
          !window.guitarAudio?.workspaceMovePanel) return;
      const display = screenMapDisplays.find(item => item.index === displayIndex);
      if (!display?.workArea) return;
      const generation = screenMapRequest;
      const workspaceId = activeWorkspaceId;
      screenMapMoving = true;
      screenMapRefresh.disabled = true;
      screenMapMessage.textContent = 'Déplacement du panneau…';
      try {
        const result = await window.guitarAudio.workspaceMovePanel(
          workspaceId,panelId,displayIndex,display.workArea,x,y);
        if (screenMapOverlay.hidden || generation !== screenMapRequest ||
            workspaceId !== activeWorkspaceId) return;
        if (!result || result.id !== workspaceId ||
            result.panelId !== panelId || result.displayIndex !== displayIndex) {
          throw new Error('Déplacement non confirmé');
        }
        if (result.autoDisabled) {
          activeAutoArrange = false;
          updatePresetButtons();
        }
        // Keep the overview open for several consecutive moves.
        await refreshScreenMap(true);
        if (!screenMapOverlay.hidden && workspaceId === activeWorkspaceId) {
          const panelName = panelId.toLocaleUpperCase('fr');
          screenMapMessage.textContent = panelName + ' déplacé vers l’écran ' +
            (displayIndex+1) + (result.autoDisabled
              ? ' — AUTO désactivé pour cet espace' : '') + '.';
        }
      } catch (error) {
        console.error('Déplacement depuis le plan des écrans :',error);
        if (!screenMapOverlay.hidden && generation === screenMapRequest) {
          screenMapMessage.textContent =
            'Déplacement impossible. Actualise le plan et réessaie.';
        }
      } finally {
        screenMapMoving = false;
        if (!screenMapOverlay.hidden) screenMapRefresh.disabled = false;
      }
    }
    async function organizeScreenMapDisplay(displayIndex) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || !window.guitarAudio?.workspaceArrangeScreen) return;
      const display = screenMapDisplays.find(item => item.index === displayIndex);
      if (!display?.workArea) return;
      const workspaceId = activeWorkspaceId;
      const generation = screenMapRequest;
      screenMapMoving = true;
      screenMapRefresh.disabled = true;
      screenMapMessage.textContent = 'Organisation de l’écran ' + (displayIndex+1) + '…';
      try {
        const result = await window.guitarAudio.workspaceArrangeScreen(
          workspaceId,displayIndex,display.workArea);
        if (screenMapOverlay.hidden || generation !== screenMapRequest ||
            workspaceId !== activeWorkspaceId) return;
        if (!result || result.id !== workspaceId ||
            result.displayIndex !== displayIndex ||
            !Number.isInteger(result.arranged) || result.arranged < 0) {
          throw new Error('Organisation non confirmée');
        }
        if (result.autoDisabled) {
          activeAutoArrange = false;
          updatePresetButtons();
        }
        await refreshScreenMap(true);
        if (!screenMapOverlay.hidden && workspaceId === activeWorkspaceId) {
          const styleNames = {mosaic:'mosaïque',columns:'colonnes',cascade:'cascade'};
          const styleName = styleNames[result.style] || 'disposition sélectionnée';
          screenMapMessage.textContent = result.arranged
            ? 'Écran ' + (displayIndex+1) + ' : ' + result.arranged +
              ' fenêtre' + (result.arranged > 1 ? 's' : '') +
              ' organisée' + (result.arranged > 1 ? 's' : '') +
              ' en ' + styleName +
              (result.autoDisabled ? ' — AUTO désactivé pour cet espace' : '') + '.'
            : 'Aucune fenêtre active à organiser sur cet écran.';
        }
      } catch (error) {
        console.error('Organisation d’un écran :',error);
        if (!screenMapOverlay.hidden && generation === screenMapRequest) {
          screenMapMessage.textContent =
            'Organisation impossible. Actualise le plan et réessaie.';
        }
      } finally {
        screenMapMoving = false;
        if (!screenMapOverlay.hidden) screenMapRefresh.disabled = false;
      }
    }
    async function undoScreenMapDisplay(displayIndex) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || !window.guitarAudio?.workspaceUndoScreen) return;
      const display=screenMapDisplays.find(item=>item.index===displayIndex);
      if (!display?.workArea || display.canUndo!==true) return;
      const workspaceId=activeWorkspaceId;
      const generation=screenMapRequest;
      screenMapMoving=true;
      screenMapRefresh.disabled=true;
      screenMapMessage.textContent='Annulation sur l’écran '+(displayIndex+1)+'…';
      try {
        const result=await window.guitarAudio.workspaceUndoScreen(
          workspaceId,displayIndex,display.workArea);
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId) return;
        if (!result || result.id!==workspaceId ||
            result.displayIndex!==displayIndex ||
            !Number.isInteger(result.restored) || result.restored<1) {
          throw new Error('Annulation non confirmée');
        }
        if (result.autoRestored) {
          activeAutoArrange=true;
          updatePresetButtons();
        }
        await refreshScreenMap(true);
        if (!screenMapOverlay.hidden && workspaceId===activeWorkspaceId) {
          screenMapMessage.textContent='Écran '+(displayIndex+1)+
            ' : disposition précédente restaurée ('+result.restored+
            ' fenêtre'+(result.restored>1?'s':'')+').';
        }
      } catch(error) {
        console.error('Annulation de l’organisation :',error);
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          screenMapMessage.textContent=
            'Annulation impossible : disposition modifiée. Actualise le plan.';
        }
      } finally {
        screenMapMoving=false;
        if (!screenMapOverlay.hidden) screenMapRefresh.disabled=false;
      }
    }
    async function undoScreenMapOverlapFix(displayIndex) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || screenMapOverlapFixBusy ||
          !window.guitarAudio?.workspaceUndoScreenOverlapFix) return;
      const display=screenMapDisplays.find(item=>item.index===displayIndex);
      if (!display?.workArea || display.canUndoCorrection!==true) return;
      if (!window.confirm('Annuler la dernière correction sur l’écran '+
          (displayIndex+1)+' et restaurer les positions précédentes ?')) return;
      const workspaceId=activeWorkspaceId,generation=screenMapRequest;
      screenMapMoving=true;
      screenMapRefresh.disabled=true;
      screenMapMessage.textContent='Restauration de la disposition précédente…';
      try {
        const result=await window.guitarAudio.workspaceUndoScreenOverlapFix(
          workspaceId,displayIndex,display.workArea);
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId) return;
        if (!result || result.id!==workspaceId ||
            result.displayIndex!==displayIndex ||
            result.favoriteUnchanged!==true ||
            !Number.isInteger(result.restored) || result.restored<1) {
          throw new Error('Restauration non confirmée');
        }
        if (result.autoRestored) {
          activeAutoArrange=true;
          updatePresetButtons();
        }
        await refreshScreenMap(true);
        if (!screenMapOverlay.hidden && workspaceId===activeWorkspaceId) {
          screenMapMessage.textContent='Écran '+(displayIndex+1)+
            ' : correction annulée. '+result.restored+' fenêtre'+
            (result.restored>1?'s':'')+' restaurée'+
            (result.restored>1?'s':'')+'. Favori conservé.';
        }
      } catch(error) {
        console.error('Annulation de correction :',error);
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          screenMapMessage.textContent=
            'Annulation indisponible : disposition modifiée. Actualise le plan.';
        }
      } finally {
        screenMapMoving=false;
        if (!screenMapOverlay.hidden) screenMapRefresh.disabled=false;
      }
    }
    async function saveScreenMapFavorite(displayIndex,slot) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || !window.guitarAudio?.workspaceSaveScreenFavorite ||
          !Number.isInteger(slot) || slot<1 || slot>3) return;
      const display=screenMapDisplays.find(item=>item.index===displayIndex);
      if (!display?.workArea) return;
      const existing=display.favorites?.find(item=>item.slot===slot);
      if (existing?.count>0 && !window.confirm(
          'Remplacer le FAVORI '+slot+' de l’écran '+(displayIndex+1)+' ?')) return;
      const workspaceId=activeWorkspaceId,generation=screenMapRequest;
      screenMapMoving=true;
      screenMapRefresh.disabled=true;
      screenMapMessage.textContent='Enregistrement du FAVORI '+slot+'…';
      try {
        const result=await window.guitarAudio.workspaceSaveScreenFavorite(
          workspaceId,displayIndex,display.workArea,slot);
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId) return;
        if (!result || result.id!==workspaceId ||
            result.displayIndex!==displayIndex || result.slot!==slot ||
            !Number.isInteger(result.saved) || result.saved<1) {
          throw new Error('Favori non confirmé');
        }
        await refreshScreenMap(true);
        if (!screenMapOverlay.hidden && workspaceId===activeWorkspaceId) {
          screenMapMessage.textContent='Écran '+(displayIndex+1)+
            ' : FAVORI '+slot+' enregistré ('+result.saved+
            ' fenêtre'+(result.saved>1?'s':'')+').';
        }
      } catch(error) {
        console.error('Enregistrement d’un favori d’écran :',error);
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          screenMapMessage.textContent='Enregistrement du favori impossible.';
        }
      } finally {
        screenMapMoving=false;
        if (!screenMapOverlay.hidden) screenMapRefresh.disabled=false;
      }
    }
    async function renameScreenMapFavorite(displayIndex,slot) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || !window.guitarAudio?.workspaceRenameScreenFavorite ||
          !Number.isInteger(slot) || slot<1 || slot>3) return;
      const display=screenMapDisplays.find(item=>item.index===displayIndex);
      const favorite=display?.favorites?.find(item=>item.slot===slot);
      if (!display?.workArea || !favorite || favorite.count<1) return;
      const raw=window.prompt('Nom du FAVORI '+slot+' (28 caractères maximum) :',
        favorite.name||'FAVORI '+slot);
      if (raw===null) return;
      const name=raw.trim().replace(/\s+/g,' ');
      if (!name || name.length>28) {
        screenMapMessage.textContent='Le nom doit contenir de 1 à 28 caractères.';
        return;
      }
      const workspaceId=activeWorkspaceId,generation=screenMapRequest;
      screenMapMoving=true;
      screenMapRefresh.disabled=true;
      screenMapMessage.textContent='Renommage du FAVORI '+slot+'…';
      try {
        const result=await window.guitarAudio.workspaceRenameScreenFavorite(
          workspaceId,displayIndex,display.workArea,slot,name);
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId) return;
        if (!result || result.id!==workspaceId ||
            result.displayIndex!==displayIndex || result.slot!==slot ||
            result.name!==name) throw new Error('Nom non confirmé');
        await refreshScreenMap(true);
        if (!screenMapOverlay.hidden && workspaceId===activeWorkspaceId) {
          screenMapMessage.textContent='Écran '+(displayIndex+1)+
            ' : FAVORI '+slot+' renommé « '+name+' ».';
        }
      } catch(error) {
        console.error('Renommage du favori d’écran :',error);
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          screenMapMessage.textContent='Renommage du favori impossible.';
        }
      } finally {
        screenMapMoving=false;
        if (!screenMapOverlay.hidden) screenMapRefresh.disabled=false;
      }
    }
    async function deleteScreenMapFavorite(displayIndex,slot) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || !window.guitarAudio?.workspaceDeleteScreenFavorite ||
          !Number.isInteger(slot) || slot<1 || slot>3) return;
      const display=screenMapDisplays.find(item=>item.index===displayIndex);
      const favorite=display?.favorites?.find(item=>item.slot===slot);
      if (!display?.workArea || !favorite || favorite.count<1) return;
      const label=favorite.name||'FAVORI '+slot;
      if (!window.confirm('Supprimer « '+label+' » de l’écran '+
          (displayIndex+1)+' ? Cette action ne peut pas être annulée.')) return;
      const workspaceId=activeWorkspaceId,generation=screenMapRequest;
      screenMapMoving=true;
      screenMapRefresh.disabled=true;
      screenMapMessage.textContent='Suppression du FAVORI '+slot+'…';
      try {
        const result=await window.guitarAudio.workspaceDeleteScreenFavorite(
          workspaceId,displayIndex,display.workArea,slot);
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId) return;
        if (!result || result.id!==workspaceId ||
            result.displayIndex!==displayIndex || result.slot!==slot ||
            result.deleted!==true) throw new Error('Suppression non confirmée');
        await refreshScreenMap(true);
        if (!screenMapOverlay.hidden && workspaceId===activeWorkspaceId) {
          screenMapMessage.textContent='Écran '+(displayIndex+1)+
            ' : '+label+' supprimé. Les fenêtres sont inchangées.';
        }
      } catch(error) {
        console.error('Suppression du favori d’écran :',error);
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          screenMapMessage.textContent='Suppression impossible. Actualise le plan.';
        }
      } finally {
        screenMapMoving=false;
        if (!screenMapOverlay.hidden) screenMapRefresh.disabled=false;
      }
    }
    async function exchangeScreenMapFavorites(displayIndex,fromSlot,toSlot) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || !window.guitarAudio?.workspaceSwapScreenFavorites ||
          !Number.isInteger(fromSlot) || fromSlot<1 || fromSlot>3 ||
          !Number.isInteger(toSlot) || toSlot<1 || toSlot>3 ||
          fromSlot===toSlot) return;
      const display=screenMapDisplays.find(item=>item.index===displayIndex);
      const favorite=display?.favorites?.find(item=>item.slot===fromSlot);
      if (!display?.workArea || !favorite || favorite.count<1) return;
      const workspaceId=activeWorkspaceId,generation=screenMapRequest;
      screenMapMoving=true;
      screenMapRefresh.disabled=true;
      screenMapMessage.textContent='Réorganisation des favoris…';
      try {
        const result=await window.guitarAudio.workspaceSwapScreenFavorites(
          workspaceId,displayIndex,display.workArea,fromSlot,toSlot);
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId) return;
        if (!result || result.id!==workspaceId ||
            result.displayIndex!==displayIndex ||
            result.fromSlot!==fromSlot || result.toSlot!==toSlot ||
            result.swapped!==true) throw new Error('Échange non confirmé');
        screenMapFavoriteSlots.set(displayIndex,toSlot);
        await refreshScreenMap(true);
        if (!screenMapOverlay.hidden && workspaceId===activeWorkspaceId) {
          screenMapMessage.textContent='Écran '+(displayIndex+1)+
            ' : '+(favorite.name||'FAVORI '+fromSlot)+
            ' déplacé vers FAVORI '+toSlot+'. Les fenêtres sont inchangées.';
        }
      } catch(error) {
        console.error('Échange des favoris d’écran :',error);
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          screenMapMessage.textContent='Réorganisation impossible. Actualise le plan.';
        }
      } finally {
        screenMapMoving=false;
        if (!screenMapOverlay.hidden) screenMapRefresh.disabled=false;
      }
    }
    async function applyScreenMapFavorite(displayIndex,slot) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || screenMapOverlapFixBusy ||
          !window.guitarAudio?.workspaceApplyScreenFavorite ||
          !Number.isInteger(slot) || slot<1 || slot>3) return;
      const display=screenMapDisplays.find(item=>item.index===displayIndex);
      const saved=display?.favorites?.find(item=>item.slot===slot);
      if (!display?.workArea || !saved || saved.count<1) return;
      const workspaceId=activeWorkspaceId,generation=screenMapRequest;
      screenMapMoving=true;
      screenMapRefresh.disabled=true;
      screenMapMessage.textContent='Vérification des chevauchements…';
      try {
        // Always re-check immediately before applying, including quick recall;
        // the comparison shown earlier may be outdated after a drag or resize.
        const checked=await window.guitarAudio.workspacePreviewScreenFavorite(
          workspaceId,displayIndex,display.workArea,slot);
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId) return;
        if (!checked || checked.id!==workspaceId ||
            checked.displayIndex!==displayIndex || checked.slot!==slot ||
            !Array.isArray(checked.items)) throw new Error('Contrôle de disposition non confirmé');
        const conflicts=checked.overlaps?.after;
        if (Array.isArray(conflicts) && conflicts.length) {
          const recent=Array.isArray(checked.overlaps.introduced) ?
            checked.overlaps.introduced.length : 0;
          const accepted=window.confirm(
            'ATTENTION : le FAVORI '+slot+' de l’écran '+(displayIndex+1)+
            ' présente '+conflicts.length+' chevauchement'+
            (conflicts.length>1?'s':'')+' entre fenêtres'+
            (recent?' (dont '+recent+' nouveau'+(recent>1?'x':'')+')':'')+
            '. Voulez-vous appliquer cette disposition ?');
          if (!accepted) {
            screenMapMessage.textContent='Application annulée. Aucune fenêtre déplacée.';
            return;
          }
        }
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId) return;
        screenMapMessage.textContent='Application du FAVORI '+slot+'…';
        const result=await window.guitarAudio.workspaceApplyScreenFavorite(
          workspaceId,displayIndex,display.workArea,slot);
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId) return;
        if (!result || result.id!==workspaceId ||
            result.displayIndex!==displayIndex || result.slot!==slot ||
            !Number.isInteger(result.applied) || result.applied<1) {
          throw new Error('Application non confirmée');
        }
        if (result.autoDisabled) {
          activeAutoArrange=false;
          updatePresetButtons();
        }
        await refreshScreenMap(true);
        if (!screenMapOverlay.hidden && workspaceId===activeWorkspaceId) {
          screenMapMessage.textContent='Écran '+(displayIndex+1)+
            ' : FAVORI '+slot+' appliqué à '+result.applied+
            ' fenêtre'+(result.applied>1?'s':'')+
            (result.skipped>0?' ('+result.skipped+' indisponible'+
              (result.skipped>1?'s':'')+')':'')+
            (result.autoDisabled?' — AUTO désactivé':'')+'.';
        }
      } catch(error) {
        console.error('Application d’un favori d’écran :',error);
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          screenMapMessage.textContent='Application impossible. Vérifie les fenêtres et actualise.';
        }
      } finally {
        screenMapMoving=false;
        if (!screenMapOverlay.hidden) screenMapRefresh.disabled=false;
      }
    }
    async function applyScreenMapOverlapFix(displayIndex,slot,token,confirmButton) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || screenMapOverlapFixBusy ||
          !window.guitarAudio?.workspaceApplyScreenOverlapFix ||
          typeof token!=='string' || token.length!==64) return;
      const display=screenMapDisplays.find(item=>item.index===displayIndex);
      const comparison=screenMapFavoriteComparison;
      if (!display?.workArea || comparison?.displayIndex!==displayIndex ||
          comparison.slot!==slot || comparison.fixPlan?.token!==token) return;
      if (!window.confirm('Appliquer la disposition corrigée sur l’écran '+
          (displayIndex+1)+' ? Les fenêtres seront déplacées. '+
          'Le favori enregistré ne sera pas écrasé.')) return;
      const workspaceId=activeWorkspaceId,generation=screenMapRequest;
      screenMapMoving=true;
      screenMapOverlapFixBusy=true;
      confirmButton.disabled=true;
      screenMapRefresh.disabled=true;
      screenMapMessage.textContent='Application de la correction…';
      try {
        const result=await window.guitarAudio.workspaceApplyScreenOverlapFix(
          workspaceId,displayIndex,display.workArea,slot,token);
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId) return;
        if (!result || result.id!==workspaceId ||
            result.displayIndex!==displayIndex || result.slot!==slot ||
            result.collisions!==0 || result.favoriteUnchanged!==true ||
            !Number.isInteger(result.applied) || result.applied<1) {
          throw new Error('Correction non confirmée');
        }
        if (result.autoDisabled) {
          activeAutoArrange=false;
          updatePresetButtons();
        }
        await refreshScreenMap(true);
        if (!screenMapOverlay.hidden && workspaceId===activeWorkspaceId) {
          screenMapMessage.textContent='Écran '+(displayIndex+1)+
            ' : correction appliquée à '+result.applied+' fenêtre'+
            (result.applied>1?'s':'')+
            ', aucun chevauchement. Favori conservé.';
        }
      } catch(error) {
        console.error('Application de la correction des chevauchements :',error);
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          screenMapMessage.textContent=
            'Correction refusée : les fenêtres ont pu changer. Recalcule la disposition.';
          if (screenMapFavoriteComparison) {
            screenMapFavoriteComparison.fixPlan=null;
          }
        }
      } finally {
        screenMapMoving=false;
        screenMapOverlapFixBusy=false;
        if (!screenMapOverlay.hidden) screenMapRefresh.disabled=false;
      }
    }
    async function planScreenMapOverlapFix(displayIndex,slot,section,trigger) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || screenMapOverlapFixBusy ||
          !window.guitarAudio?.workspacePlanScreenOverlapFix) return;
      const display=screenMapDisplays.find(item=>item.index===displayIndex);
      const comparison=screenMapFavoriteComparison;
      if (!display?.workArea || !comparison ||
          comparison.displayIndex!==displayIndex || comparison.slot!==slot ||
          comparison.section!==section) return;
      const workspaceId=activeWorkspaceId,generation=screenMapRequest;
      screenMapOverlapFixBusy=true;
      trigger.disabled=true;
      screenMapMessage.textContent='Calcul d’une disposition sans chevauchement…';
      if (comparison.fixPanel) comparison.fixPanel.hidden=true;
      comparison.fixPlan=null;
      try {
        const plan=await window.guitarAudio.workspacePlanScreenOverlapFix(
          workspaceId,displayIndex,display.workArea,slot);
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId ||
            screenMapFavoriteComparison!==comparison) return;
        if (!plan || plan.id!==workspaceId ||
            plan.displayIndex!==displayIndex || plan.slot!==slot ||
            typeof plan.possible!=='boolean') {
          throw new Error('Calcul non confirmé');
        }
        if (!plan.possible) {
          screenMapMessage.textContent=plan.reason||
            'Aucune disposition sans chevauchement trouvée.';
          return;
        }
        if (!Array.isArray(plan.windows)||!plan.windows.length||
            !Array.isArray(plan.fixed) || plan.collisions!==0 ||
            !/^[a-f0-9]{64}$/.test(plan.token||'')) {
          throw new Error('Plan de correction invalide');
        }
        const area=display.workArea;
        const panel=document.createElement('div');
        panel.className='gl-workspace-map-fix-panel';
        const heading=document.createElement('strong');
        heading.textContent='DISPOSITION CORRIGÉE — AUCUN CHEVAUCHEMENT';
        const caption=document.createElement('p');
        caption.textContent=plan.moved+' fenêtre'+(plan.moved>1?'s':'')+
          ' à repositionner, '+plan.fixed.length+' fenêtre'+
          (plan.fixed.length>1?'s':'')+' hors favori conservée'+
          (plan.fixed.length>1?'s':'')+'.';
        const miniature=document.createElement('div');
        miniature.className='gl-workspace-map-fix-preview';
        miniature.style.aspectRatio=area.width+' / '+area.height;
        const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
        for (const item of [...plan.fixed,...plan.windows]) {
          const r=item?.bounds;
          if (!r || typeof item.title!=='string' ||
              ![r.x,r.y,r.width,r.height].every(Number.isFinite) ||
              r.width<=0 || r.height<=0) continue;
          const piece=document.createElement('div');
          piece.className='gl-workspace-map-fix-window '+
            (plan.fixed.some(entry=>entry.id===item.id)?
              'is-fixed':item.changed?'is-moved':'is-unchanged');
          piece.textContent=item.title;
          piece.title=item.title;
          const left=clamp((r.x-area.x)/area.width*100,0,100);
          const top=clamp((r.y-area.y)/area.height*100,0,100);
          const right=clamp((r.x+r.width-area.x)/area.width*100,0,100);
          const bottom=clamp((r.y+r.height-area.y)/area.height*100,0,100);
          piece.style.left=left+'%';
          piece.style.top=top+'%';
          piece.style.width=Math.max(2,right-left)+'%';
          piece.style.height=Math.max(4,bottom-top)+'%';
          miniature.append(piece);
        }
        const details=document.createElement('div');
        details.className='gl-workspace-map-fix-details';
        for (const item of plan.windows) {
          const line=document.createElement('span');
          line.textContent=item.title+' : '+
            (item.changed ?
              'position corrigée ('+item.bounds.x+', '+item.bounds.y+')' :
              'position conservée');
          details.append(line);
        }
        const note=document.createElement('p');
        note.className='gl-workspace-map-fix-note';
        note.textContent='Prévisualisation uniquement. Les dimensions sont conservées. Le favori reste inchangé.';
        const apply=document.createElement('button');
        apply.type='button';
        apply.className='gl-workspace-map-fix-apply';
        apply.textContent='APPLIQUER LA CORRECTION';
        apply.disabled=plan.moved===0;
        apply.addEventListener('click',function () {
          applyScreenMapOverlapFix(displayIndex,slot,plan.token,apply);
        });
        panel.append(heading,caption,miniature,details,note,apply);
        section.append(panel);
        comparison.fixPanel=panel;
        comparison.fixPlan=plan;
        trigger.textContent='RECALCULER LA CORRECTION';
        screenMapMessage.textContent='Disposition calculée sans chevauchement. '+
          'Aucune fenêtre déplacée. Confirme pour appliquer.';
      } catch(error) {
        console.error('Calcul des corrections de chevauchements :',error);
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          screenMapMessage.textContent='Calcul impossible. Actualise le plan.';
        }
      } finally {
        screenMapOverlapFixBusy=false;
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          trigger.disabled=false;
        }
      }
    }
    async function compareScreenMapFavorite(displayIndex,slot,button,card) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || screenMapFavoritePreviewBusy ||
          screenMapFavoriteCompareBusy ||
          !window.guitarAudio?.workspacePreviewScreenFavorite ||
          !Number.isInteger(slot) || slot<1 || slot>3) return;
      const display=screenMapDisplays.find(item=>item.index===displayIndex);
      const favorite=display?.favorites?.find(item=>item.slot===slot);
      if (!display?.workArea || !favorite || favorite.count<1) return;
      if (screenMapFavoriteComparison &&
          screenMapFavoriteComparison.displayIndex===displayIndex &&
          screenMapFavoriteComparison.slot===slot) {
        clearScreenMapFavoriteComparison();
        screenMapMessage.textContent='Comparaison masquée. Aucune fenêtre déplacée.';
        return;
      }
      clearScreenMapFavoriteComparison();
      clearScreenMapFavoritePreview();
      const workspaceId=activeWorkspaceId,generation=screenMapRequest;
      screenMapFavoriteCompareBusy=true;
      button.disabled=true;
      screenMapMessage.textContent='Comparaison des dispositions…';
      try {
        const result=await window.guitarAudio.workspacePreviewScreenFavorite(
          workspaceId,displayIndex,display.workArea,slot);
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId) return;
        if (!result || result.id!==workspaceId ||
            result.displayIndex!==displayIndex || result.slot!==slot ||
            !Array.isArray(result.items) ||
            !Number.isInteger(result.moving) || result.moving<0 ||
            !Number.isInteger(result.unchanged) || result.unchanged<0 ||
            !Number.isInteger(result.unavailable) || result.unavailable<0 ||
            result.moving+result.unchanged+result.unavailable!==result.items.length) {
          throw new Error('Comparaison non confirmée');
        }
        const area=display.workArea;
        const section=document.createElement('section');
        section.className='gl-workspace-map-comparison';
        const headline=document.createElement('strong');
        headline.className='gl-workspace-map-compare-heading';
        headline.textContent='COMPARAISON — '+(favorite.name||'FAVORI '+slot);
        const counters=document.createElement('div');
        counters.className='gl-workspace-map-compare-counters';
        const labels=[
          [result.moving,'À DÉPLACER','is-moving'],
          [result.unchanged,'INCHANGÉE(S)','is-unchanged'],
          [result.unavailable,'INDISPONIBLE(S)','is-unavailable']
        ];
        for (const [count,name,kind] of labels) {
          const mark=document.createElement('span');
          mark.className='gl-workspace-map-compare-count '+kind;
          mark.textContent=count+' '+name;
          counters.append(mark);
        }
        const views=document.createElement('div');
        views.className='gl-workspace-map-compare-grid';
        const before=document.createElement('div');
        const after=document.createElement('div');
        for (const [parent,title] of [
          [before,'POSITION ACTUELLE'],
          [after,'APRÈS APPLICATION']
        ]) {
          parent.className='gl-workspace-map-compare-column';
          const label=document.createElement('span');
          label.className='gl-workspace-map-compare-label';
          label.textContent=title;
          const miniature=document.createElement('div');
          miniature.className='gl-workspace-map-compare-preview';
          miniature.style.aspectRatio=area.width+' / '+area.height;
          parent.append(label,miniature);
        }
        const details=document.createElement('div');
        details.className='gl-workspace-map-compare-details';
        // The backend computes intersections from actual active windows,
        // including unsaved panels that will remain in their current place.
        const overlaps=result.overlaps &&
          ['before','after','introduced'].every(k=>
            Array.isArray(result.overlaps[k])) ? result.overlaps :
          {before:[],after:[],introduced:[]};
        const overlappingBefore=new Set(overlaps.before.flatMap(p=>p.ids||[]));
        const overlappingAfter=new Set(overlaps.after.flatMap(p=>p.ids||[]));
        const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
        const validRect=r=>r && [r.x,r.y,r.width,r.height].every(Number.isFinite) &&
          r.width>0 && r.height>0;
        const plot=(parent,item,bounds,kind)=>{
          if (!validRect(bounds)) return;
          const left=clamp((bounds.x-area.x)/area.width*100,0,100);
          const top=clamp((bounds.y-area.y)/area.height*100,0,100);
          const right=clamp((bounds.x+bounds.width-area.x)/area.width*100,0,100);
          const bottom=clamp((bounds.y+bounds.height-area.y)/area.height*100,0,100);
          const box=document.createElement('div');
          const collision=parent===before ? overlappingBefore : overlappingAfter;
          box.className='gl-workspace-map-compare-window '+kind+
            (collision.has(item.id)?' has-overlap':'');
          box.textContent=item.title;
          box.title=item.title;
          box.style.left=left+'%';
          box.style.top=top+'%';
          box.style.width=Math.max(2,right-left)+'%';
          box.style.height=Math.max(4,bottom-top)+'%';
          parent.children[1].append(box);
        };
        let availableCount=0;
        for (const item of result.items) {
          if (!item || typeof item.title!=='string' ||
              !['ready','closed','minimized','other-screen'].includes(item.status) ||
              !validRect(item.bounds)) continue;
          const ready=item.status==='ready';
          const current=item.comparison?.currentBounds;
          const validCurrent=ready && validRect(current) &&
            typeof item.comparison.willChange==='boolean';
          const move=validCurrent && item.comparison.willChange;
          const kind=ready ? (move?'is-moving':'is-unchanged') : 'is-unavailable';
          if (validCurrent) {
            // A maximized native window occupies the screen work area,
            // not its saved normal (restored) rectangle.
            plot(before,item,item.comparison.maximizedBefore?area:current,
              kind+' is-before');
            availableCount++;
          }
          plot(after,item,ready && item.comparison?.maximizedAfter ?
            area:item.bounds,kind+' is-after');
          const line=document.createElement('div');
          line.className='gl-workspace-map-compare-detail '+kind;
          const unavailableLabels={closed:'Fermée',minimized:'Réduite',
            'other-screen':'Sur un autre écran'};
          let explanation='';
          if (!ready) explanation=unavailableLabels[item.status]+' — non déplacée';
          else if (!validCurrent) explanation='Position actuelle indisponible';
          else if (!move) explanation='Position et taille inchangées';
          else {
            const dx=item.bounds.x-current.x,dy=item.bounds.y-current.y;
            const resized=item.bounds.width!==current.width ||
              item.bounds.height!==current.height;
            const position=dx!==0 || dy!==0 ?
              'Déplacement '+(dx>=0?'+':'')+dx+' px horizontal, '+
              (dy>=0?'+':'')+dy+' px vertical' : '';
            const dimensions=resized ?
              'Taille '+current.width+'×'+current.height+' → '+
              item.bounds.width+'×'+item.bounds.height : '';
            const maximize=item.comparison.maximizedBefore!==
              item.comparison.maximizedAfter ?
                (item.comparison.maximizedAfter?'Agrandissement':'Retour à la taille normale') : '';
            explanation=[position,dimensions,maximize].filter(Boolean).join(' ; ');
          }
          line.textContent=item.title+' — '+explanation;
          details.append(line);
        }
        if (!details.children.length) throw new Error('Aucune fenêtre à comparer');
        // Windows outside the favorite are never moved by APPLIQUER, but
        // still appear in both comparisons and can cause an intersection.
        if (Array.isArray(result.contextPanels)) {
          for (const item of result.contextPanels) {
            if (!item || typeof item.id!=='string' ||
                typeof item.title!=='string' || !validRect(item.bounds)) continue;
            plot(before,item,item.bounds,'is-unchanged is-context');
            plot(after,item,item.bounds,'is-unchanged is-context');
            const line=document.createElement('div');
            line.className='gl-workspace-map-compare-detail is-unchanged';
            line.textContent=item.title+' — Hors favori : reste en place';
            details.append(line);
          }
        }
        const intersect=(parent,pairs)=>{
          for (const pair of pairs) {
            const r=pair?.bounds;
            if (!validRect(r)) continue;
            const left=clamp((r.x-area.x)/area.width*100,0,100);
            const top=clamp((r.y-area.y)/area.height*100,0,100);
            const right=clamp((r.x+r.width-area.x)/area.width*100,0,100);
            const bottom=clamp((r.y+r.height-area.y)/area.height*100,0,100);
            const zone=document.createElement('div');
            zone.className='gl-workspace-map-compare-intersection';
            zone.style.left=left+'%';
            zone.style.top=top+'%';
            zone.style.width=Math.max(0,right-left)+'%';
            zone.style.height=Math.max(0,bottom-top)+'%';
            zone.title='Zone de chevauchement';
            parent.children[1].append(zone);
          }
        };
        intersect(before,overlaps.before);
        intersect(after,overlaps.after);
        views.append(before,after);
        const footnote=document.createElement('p');
        footnote.className='gl-workspace-map-compare-note';
        footnote.textContent='Simulation sans déplacement. Les fenêtres non enregistrées restent en place.';
        const collisionSummary=document.createElement('div');
        collisionSummary.className='gl-workspace-map-compare-collisions'+
          (overlaps.after.length?' has-warning':'');
        const collisionHeadline=document.createElement('strong');
        collisionHeadline.textContent='CHEVAUCHEMENTS : ACTUEL '+overlaps.before.length+
          '  /  FAVORI '+overlaps.after.length+
          '  /  NOUVEAUX '+overlaps.introduced.length;
        collisionSummary.append(collisionHeadline);
        if (overlaps.after.length) {
          const hint=document.createElement('p');
          hint.textContent='Attention : des fenêtres se superposeront après application.';
          collisionSummary.append(hint);
          for (const pair of overlaps.after) {
            if (!Array.isArray(pair?.titles) || pair.titles.length!==2 ||
                !Number.isFinite(pair.areaPixels)) continue;
            const explanation=document.createElement('span');
            explanation.className='gl-workspace-map-compare-collision-pair';
            explanation.textContent=pair.titles[0]+' / '+pair.titles[1]+
              ' — '+pair.areaPixels+' px²'+
              (overlaps.introduced.some(item=>item.ids?.join('|')===
                pair.ids?.join('|'))?' (nouveau)':' (déjà présent)');
            collisionSummary.append(explanation);
          }
        } else {
          const hint=document.createElement('p');
          hint.textContent='Aucun chevauchement prévu pour les fenêtres actives.';
          collisionSummary.append(hint);
        }
        if (overlaps.after.length) {
          const fixButton=document.createElement('button');
          fixButton.type='button';
          fixButton.className='gl-workspace-map-fix-calculate';
          fixButton.textContent='CORRIGER LES CHEVAUCHEMENTS';
          fixButton.title='Calculer et prévisualiser une disposition sans collision';
          fixButton.addEventListener('click',function () {
            planScreenMapOverlapFix(displayIndex,slot,section,fixButton);
          });
          collisionSummary.append(fixButton);
        }
        section.append(headline,counters,views,details,footnote,collisionSummary);
        card.append(section);
        button.textContent='MASQUER LA COMPARAISON';
        button.setAttribute('aria-pressed','true');
        screenMapFavoriteComparison={displayIndex,slot,section,button};
        screenMapMessage.textContent='Écran '+(displayIndex+1)+' — '+
          result.moving+' changement'+(result.moving>1?'s':'')+
          ', '+result.unchanged+' inchangée'+(result.unchanged>1?'s':'')+
          ', '+result.unavailable+' indisponible'+
          (result.unavailable>1?'s':'')+'. Simulation uniquement.';
      } catch(error) {
        console.error('Comparaison des favoris :',error);
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          screenMapMessage.textContent='Comparaison impossible. Actualise le plan.';
        }
      } finally {
        screenMapFavoriteCompareBusy=false;
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          button.disabled=false;
        }
      }
    }
    async function previewScreenMapFavorite(displayIndex,slot,preview,button) {
      if (screenMapOverlay.hidden || workspace.hidden || workspaceSwitchBusy ||
          screenMapMoving || screenMapFavoritePreviewBusy ||
          screenMapFavoriteCompareBusy ||
          !window.guitarAudio?.workspacePreviewScreenFavorite ||
          !Number.isInteger(slot) || slot<1 || slot>3) return;
      const display=screenMapDisplays.find(item=>item.index===displayIndex);
      const chosen=display?.favorites?.find(item=>item.slot===slot);
      if (!display?.workArea || !chosen || chosen.count<1) return;
      if (screenMapFavoritePreview &&
          screenMapFavoritePreview.displayIndex===displayIndex &&
          screenMapFavoritePreview.slot===slot) {
        clearScreenMapFavoritePreview();
        screenMapMessage.textContent='Aperçu masqué. Les fenêtres sont inchangées.';
        return;
      }
      clearScreenMapFavoritePreview();
      clearScreenMapFavoriteComparison();
      const workspaceId=activeWorkspaceId, generation=screenMapRequest;
      screenMapFavoritePreviewBusy=true;
      button.disabled=true;
      screenMapMessage.textContent='Lecture de l’aperçu du FAVORI '+slot+'…';
      try {
        const result=await window.guitarAudio.workspacePreviewScreenFavorite(
          workspaceId,displayIndex,display.workArea,slot);
        if (screenMapOverlay.hidden || generation!==screenMapRequest ||
            workspaceId!==activeWorkspaceId) return;
        if (!result || result.id!==workspaceId ||
            result.displayIndex!==displayIndex || result.slot!==slot ||
            !Array.isArray(result.items) ||
            !Number.isInteger(result.ready) || result.ready<0) {
          throw new Error('Aperçu non confirmé');
        }
        const area=display.workArea;
        const layer=document.createElement('div');
        layer.className='gl-workspace-map-favorite-overlay';
        layer.setAttribute('aria-hidden','true');
        const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
        let shown=0;
        for (const item of result.items) {
          const r=item?.bounds;
          if (!r || typeof item.title!=='string' ||
              !['ready','closed','minimized','other-screen'].includes(item.status) ||
              ![r.x,r.y,r.width,r.height].every(Number.isFinite) ||
              r.width<=0 || r.height<=0) continue;
          const left=clamp((r.x-area.x)/area.width*100,0,100);
          const top=clamp((r.y-area.y)/area.height*100,0,100);
          const right=clamp((r.x+r.width-area.x)/area.width*100,0,100);
          const bottom=clamp((r.y+r.height-area.y)/area.height*100,0,100);
          const ghost=document.createElement('div');
          ghost.className='gl-workspace-map-favorite-ghost'+
            (item.status==='ready'?'':' is-unavailable');
          const unavailable={closed:'FERMÉ',minimized:'RÉDUIT',
            'other-screen':'AUTRE ÉCRAN'};
          ghost.textContent=item.title+
            (item.status==='ready'?'':' — '+unavailable[item.status]);
          ghost.style.left=left+'%';
          ghost.style.top=top+'%';
          ghost.style.width=Math.max(2,right-left)+'%';
          ghost.style.height=Math.max(4,bottom-top)+'%';
          layer.append(ghost);
          shown++;
        }
        if (!shown) throw new Error('Aucune position valide à prévisualiser');
        preview.append(layer);
        button.disabled=false;
        button.textContent='MASQUER';
        button.setAttribute('aria-pressed','true');
        screenMapFavoritePreview={displayIndex,slot,layer,button};
        const label=chosen.name||'FAVORI '+slot;
        const missing=shown-result.ready;
        screenMapMessage.textContent='Écran '+(displayIndex+1)+
          ' — '+label+' : '+result.ready+' fenêtre'+
          (result.ready>1?'s':'')+' prête'+(result.ready>1?'s':'')+
          (missing>0?' ; '+missing+' indisponible'+(missing>1?'s':''):'')+
          '. Aperçu uniquement : aucune fenêtre déplacée.';
      } catch(error) {
        console.error('Aperçu de favori d’écran :',error);
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          screenMapMessage.textContent='Aperçu impossible. Actualise le plan.';
        }
      } finally {
        screenMapFavoritePreviewBusy=false;
        if (!screenMapOverlay.hidden && generation===screenMapRequest) {
          button.disabled=false;
        }
      }
    }
    function addScreenMapDropTarget(preview,display) {
      preview.addEventListener('dragover',function (event) {
        if (!screenMapDraggedId || screenMapMoving ||
            !screenMapPanels.has(screenMapDraggedId)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        preview.classList.add('is-drop-target');
      });
      preview.addEventListener('dragleave',function (event) {
        if (!preview.contains(event.relatedTarget)) {
          preview.classList.remove('is-drop-target');
        }
      });
      preview.addEventListener('drop',function (event) {
        preview.classList.remove('is-drop-target');
        if (!screenMapDraggedId || screenMapMoving) return;
        event.preventDefault();
        const panelId = screenMapDraggedId;
        screenMapDraggedId = null;
        const rect = preview.getBoundingClientRect();
        const x = rect.width > 0 ? Math.max(0,Math.min(1,
          (event.clientX-rect.left)/rect.width)) : .5;
        const y = rect.height > 0 ? Math.max(0,Math.min(1,
          (event.clientY-rect.top)/rect.height)) : .5;
        moveScreenMapPanel(panelId,display.index,x,y);
      });
    }
    function addScreenMapPanelButton(container,panel,preview,area) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = preview ? 'gl-workspace-map-window' : 'gl-workspace-map-item';
      button.textContent = panel.title;
      button.title = 'Afficher la fenêtre ' + panel.title;
      button.setAttribute('aria-label','Afficher ' + panel.title);
      if (panel.minimized) button.classList.add('is-minimized');
      button.draggable = true;
      button.addEventListener('dragstart',function (event) {
        if (screenMapMoving) { event.preventDefault(); return; }
        screenMapDraggedId = panel.id;
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain',panel.id);
        }
      });
      button.addEventListener('dragend',function () {
        screenMapDraggedId = null;
        screenMapScreens.querySelectorAll('.is-drop-target').forEach(
          element => element.classList.remove('is-drop-target'));
      });
      if (preview) {
        const bounds = panel.bounds;
        const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
        const left = clamp((bounds.x-area.x)/area.width*100,0,100);
        const top = clamp((bounds.y-area.y)/area.height*100,0,100);
        const right = clamp((bounds.x+bounds.width-area.x)/area.width*100,0,100);
        const bottom = clamp((bounds.y+bounds.height-area.y)/area.height*100,0,100);
        button.style.left = left + '%';
        button.style.top = top + '%';
        button.style.width = Math.max(2,right-left) + '%';
        button.style.height = Math.max(4,bottom-top) + '%';
      }
      button.addEventListener('click',function () {
        focusScreenMapPanel(panel.id);
      });
      container.append(button);
    }
    async function refreshScreenMap(allowDuringMove = false) {
      if (screenMapOverlay.hidden || workspace.hidden ||
          (screenMapMoving && allowDuringMove !== true) ||
          !window.guitarAudio?.workspaceScreenMap) return;
      clearScreenMapFavoritePreview();
      clearScreenMapFavoriteComparison();
      const generation = ++screenMapRequest;
      const workspaceId = activeWorkspaceId;
      screenMapRefresh.disabled = true;
      screenMapMessage.textContent = 'Lecture des écrans…';
      try {
        const result = await window.guitarAudio.workspaceScreenMap(workspaceId);
        if (generation !== screenMapRequest || screenMapOverlay.hidden ||
            workspaceId !== activeWorkspaceId) return;
        if (!result || result.id !== workspaceId ||
            !Array.isArray(result.screens) || !Array.isArray(result.panels)) {
          throw new Error('Plan des écrans non confirmé');
        }
        screenMapScreens.replaceChildren();
        screenMapDisplays = result.screens.filter(item =>
          item && Number.isInteger(item.index) && item.workArea);
        const panels = result.panels.filter(item =>
          item && typeof item.id === 'string' && typeof item.title === 'string' &&
          item.bounds && Number.isInteger(item.displayIndex));
        screenMapPanels = new Set(panels.map(item => item.id));
        screenMapSummary.textContent = result.screens.length + ' écran' +
          (result.screens.length > 1 ? 's' : '') + ' connecté' +
          (result.screens.length > 1 ? 's' : '') + ' — ' + panels.length +
          ' fenêtre' + (panels.length > 1 ? 's' : '') + ' détachée' +
          (panels.length > 1 ? 's' : '');
        for (const display of result.screens) {
          const area = display?.workArea;
          if (!area || !Number.isInteger(display.index) ||
              ![area.x,area.y,area.width,area.height].every(Number.isFinite) ||
              area.width <= 0 || area.height <= 0) continue;
          const card = document.createElement('article');
          card.className = 'gl-workspace-map-screen';
          if (display.main) card.classList.add('is-main');
          const heading = document.createElement('h3');
          heading.textContent = 'ÉCRAN ' + (display.index+1) +
            (display.main ? ' — TABLATURE' : ' — ANNEXE');
          const resolution = document.createElement('p');
          resolution.className = 'gl-workspace-map-resolution';
          resolution.textContent = area.width + ' × ' + area.height;
          const preview = document.createElement('div');
          preview.className = 'gl-workspace-map-preview';
          preview.style.aspectRatio = area.width + ' / ' + area.height;
          preview.setAttribute('aria-label','Déposer une fenêtre sur cet écran pour la déplacer');
          addScreenMapDropTarget(preview,display);
          const list = document.createElement('div');
          list.className = 'gl-workspace-map-panel-list';
          const visible = panels.filter(panel => panel.displayIndex === display.index);
          for (const panel of visible) {
            addScreenMapPanelButton(preview,panel,true,area);
            const entry = document.createElement('div');
            entry.className = 'gl-workspace-map-panel-entry';
            addScreenMapPanelButton(entry,panel,false,area);
            const select = document.createElement('select');
            select.className = 'gl-workspace-map-move-select';
            select.setAttribute('aria-label','Déplacer ' + panel.title + ' vers un écran');
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'DÉPLACER…';
            placeholder.disabled = true;
            placeholder.selected = true;
            select.append(placeholder);
            for (const destination of screenMapDisplays) {
              const option = document.createElement('option');
              option.value = String(destination.index);
              option.textContent = 'ÉCRAN ' + (destination.index+1);
              select.append(option);
            }
            select.value = '';
            select.addEventListener('change',function () {
              const destination = Number(select.value);
              select.value = '';
              if (Number.isInteger(destination)) {
                moveScreenMapPanel(panel.id,destination,.5,.5);
              }
            });
            entry.append(select);
            list.append(entry);
          }
          if (!visible.length) {
            const empty = document.createElement('span');
            empty.className = 'gl-workspace-map-empty';
            empty.textContent = 'Aucune fenêtre détachée';
            list.append(empty);
          }
          const controls = document.createElement('div');
          controls.className = 'gl-workspace-map-screen-controls';
          const count = document.createElement('span');
          const activeCount = visible.filter(panel => !panel.minimized).length;
          count.textContent = activeCount + ' fenêtre' +
            (activeCount > 1 ? 's' : '') + ' active' +
            (activeCount > 1 ? 's' : '');
          const organize = document.createElement('button');
          organize.type = 'button';
          organize.className = 'gl-workspace-map-organize';
          organize.textContent = 'ORGANISER';
          organize.title = 'Organiser uniquement les panneaux de l’écran ' +
            (display.index+1) + ' selon la disposition choisie';
          organize.setAttribute('aria-label',
            'Organiser les fenêtres de l’écran ' + (display.index+1));
          organize.disabled = activeCount === 0;
          organize.addEventListener('click',function () {
            organizeScreenMapDisplay(display.index);
          });
          controls.append(count,organize);
          if (display.canUndoCorrection === true) {
            const undoCorrection=document.createElement('button');
            undoCorrection.type='button';
            undoCorrection.className='gl-workspace-map-undo-correction';
            undoCorrection.textContent='ANNULER CORRECTION';
            undoCorrection.title='Retrouver les positions précédant la dernière correction de chevauchements';
            undoCorrection.setAttribute('aria-label',
              'Annuler la dernière correction de l’écran '+(display.index+1));
            undoCorrection.addEventListener('click',function () {
              undoScreenMapOverlapFix(display.index);
            });
            controls.append(undoCorrection);
          }
          if (display.canUndo === true) {
            const undo=document.createElement('button');
            undo.type='button';
            undo.className='gl-workspace-map-undo';
            undo.textContent='ANNULER';
            undo.title='Restaurer les positions avant la dernière organisation';
            undo.setAttribute('aria-label',
              'Annuler la dernière organisation de l’écran '+(display.index+1));
            undo.addEventListener('click',function () {
              undoScreenMapDisplay(display.index);
            });
            controls.append(undo);
          }
          const favorites=document.createElement('div');
          favorites.className='gl-workspace-map-favorites';
          const favoritesLabel=document.createElement('span');
          favoritesLabel.textContent='FAVORIS';
          favoritesLabel.className='gl-workspace-map-favorites-label';
          const slotSelect=document.createElement('select');
          slotSelect.className='gl-workspace-map-favorites-select';
          slotSelect.setAttribute('aria-label',
            'Choisir un favori pour l’écran '+(display.index+1));
          const slots=Array.isArray(display.favorites)?display.favorites:[];
          for (let slot=1;slot<=3;slot++) {
            const option=document.createElement('option');
            option.value=String(slot);
            const saved=slots.find(item=>item.slot===slot);
            option.textContent='FAVORI '+slot+
              (saved?.name?' — '+saved.name:'')+
              (saved?.count>0?' ('+saved.count+')':' — VIDE');
            slotSelect.append(option);
          }
          slotSelect.value=String(screenMapFavoriteSlots.get(display.index)||1);
          const saveFavorite=document.createElement('button');
          saveFavorite.type='button';
          saveFavorite.className='gl-workspace-map-favorite-save';
          saveFavorite.textContent='ENREGISTRER';
          saveFavorite.title='Mémoriser les fenêtres actives de cet écran';
          saveFavorite.disabled=activeCount===0;
          const applyFavorite=document.createElement('button');
          applyFavorite.type='button';
          applyFavorite.className='gl-workspace-map-favorite-apply';
          applyFavorite.textContent='APPLIQUER';
          applyFavorite.title='Restaurer ce favori uniquement sur cet écran';
          const selectedCount=()=>slots.find(item=>
            item.slot===Number(slotSelect.value))?.count||0;
          applyFavorite.disabled=selectedCount()===0;
          slotSelect.addEventListener('change',function () {
            const slot=Number(slotSelect.value);
            if (Number.isInteger(slot) && slot>=1 && slot<=3) {
              screenMapFavoriteSlots.set(display.index,slot);
              applyFavorite.disabled=selectedCount()===0;
              renameFavorite.disabled=selectedCount()===0;
              deleteFavorite.disabled=selectedCount()===0;
              moveUpFavorite.disabled=selectedCount()===0 || slot===1;
              moveDownFavorite.disabled=selectedCount()===0 || slot===3;
              previewFavorite.disabled=selectedCount()===0;
              compareFavorite.disabled=selectedCount()===0;
              if (screenMapFavoriteComparison &&
                  screenMapFavoriteComparison.displayIndex===display.index) {
                clearScreenMapFavoriteComparison();
              }
              if (screenMapFavoritePreview &&
                  screenMapFavoritePreview.displayIndex===display.index) {
                clearScreenMapFavoritePreview();
              }
            }
          });
          saveFavorite.addEventListener('click',function () {
            saveScreenMapFavorite(display.index,Number(slotSelect.value));
          });
          applyFavorite.addEventListener('click',function () {
            applyScreenMapFavorite(display.index,Number(slotSelect.value));
          });
          const renameFavorite=document.createElement('button');
          renameFavorite.type='button';
          renameFavorite.className='gl-workspace-map-favorite-rename';
          renameFavorite.textContent='RENOMMER';
          renameFavorite.title='Donner un nom au favori sélectionné';
          renameFavorite.disabled=selectedCount()===0;
          renameFavorite.addEventListener('click',function () {
            renameScreenMapFavorite(display.index,Number(slotSelect.value));
          });
          const quickFavorites=document.createElement('div');
          quickFavorites.className='gl-workspace-map-favorite-quick';
          for (let slot=1;slot<=3;slot++) {
            const item=slots.find(entry=>entry.slot===slot);
            const quick=document.createElement('button');
            quick.type='button';
            quick.className='gl-workspace-map-favorite-quick-button';
            quick.textContent=item?.name||'FAVORI '+slot;
            quick.disabled=!item || item.count<1;
            quick.title=quick.disabled?'FAVORI '+slot+' vide':
              'Rappeler '+(item.name||'FAVORI '+slot)+' sur l’écran '+
              (display.index+1);
            quick.setAttribute('aria-label',
              'Appliquer '+(item?.name||'FAVORI '+slot)+
              ' sur l’écran '+(display.index+1));
            quick.addEventListener('click',function () {
              screenMapFavoriteSlots.set(display.index,slot);
              applyScreenMapFavorite(display.index,slot);
            });
            quickFavorites.append(quick);
          }
          const favoriteManagement=document.createElement('div');
          favoriteManagement.className='gl-workspace-map-favorite-management';
          const moveUpFavorite=document.createElement('button');
          moveUpFavorite.type='button';
          moveUpFavorite.className='gl-workspace-map-favorite-move';
          moveUpFavorite.textContent='MONTER';
          moveUpFavorite.title='Échanger avec le favori précédent';
          const moveDownFavorite=document.createElement('button');
          moveDownFavorite.type='button';
          moveDownFavorite.className='gl-workspace-map-favorite-move';
          moveDownFavorite.textContent='DESCENDRE';
          moveDownFavorite.title='Échanger avec le favori suivant';
          const deleteFavorite=document.createElement('button');
          deleteFavorite.type='button';
          deleteFavorite.className='gl-workspace-map-favorite-delete';
          deleteFavorite.textContent='SUPPRIMER';
          deleteFavorite.title='Supprimer le favori sélectionné après confirmation';
          const currentSlot=Number(slotSelect.value);
          const hasSelection=selectedCount()>0;
          moveUpFavorite.disabled=!hasSelection || currentSlot===1;
          moveDownFavorite.disabled=!hasSelection || currentSlot===3;
          deleteFavorite.disabled=!hasSelection;
          moveUpFavorite.addEventListener('click',function () {
            const slot=Number(slotSelect.value);
            exchangeScreenMapFavorites(display.index,slot,slot-1);
          });
          moveDownFavorite.addEventListener('click',function () {
            const slot=Number(slotSelect.value);
            exchangeScreenMapFavorites(display.index,slot,slot+1);
          });
          deleteFavorite.addEventListener('click',function () {
            deleteScreenMapFavorite(display.index,Number(slotSelect.value));
          });
          favoriteManagement.append(moveUpFavorite,moveDownFavorite,deleteFavorite);
          const previewFavorite=document.createElement('button');
          previewFavorite.type='button';
          previewFavorite.className='gl-workspace-map-favorite-preview-action';
          previewFavorite.textContent='APERÇU';
          previewFavorite.title='Afficher les positions enregistrées sans déplacer les fenêtres';
          previewFavorite.setAttribute('aria-label',
            'Prévisualiser le favori sélectionné sur l’écran '+(display.index+1));
          previewFavorite.setAttribute('aria-pressed','false');
          previewFavorite.disabled=selectedCount()===0;
          previewFavorite.addEventListener('click',function () {
            previewScreenMapFavorite(display.index,Number(slotSelect.value),
              preview,previewFavorite);
          });
          const compareFavorite=document.createElement('button');
          compareFavorite.type='button';
          compareFavorite.className='gl-workspace-map-favorite-compare-action';
          compareFavorite.textContent='COMPARER';
          compareFavorite.title='Comparer côte à côte les positions actuelles et le favori enregistré';
          compareFavorite.setAttribute('aria-label',
            'Comparer le favori sélectionné avec les fenêtres actuelles de l’écran '+
            (display.index+1));
          compareFavorite.setAttribute('aria-pressed','false');
          compareFavorite.disabled=selectedCount()===0;
          compareFavorite.addEventListener('click',function () {
            compareScreenMapFavorite(display.index,Number(slotSelect.value),
              compareFavorite,favorites);
          });
          favorites.append(favoritesLabel,slotSelect,saveFavorite,applyFavorite,
            renameFavorite,quickFavorites,favoriteManagement,previewFavorite,
            compareFavorite);
          card.append(heading,resolution,preview,list,controls,favorites);
          screenMapScreens.append(card);
        }
        const offscreen = panels.filter(panel => panel.displayIndex < 0);
        if (offscreen.length) {
          const section = document.createElement('div');
          section.className = 'gl-workspace-map-offscreen';
          const title = document.createElement('strong');
          title.textContent = 'FENÊTRES HORS ÉCRAN';
          section.append(title);
          for (const panel of offscreen) addScreenMapPanelButton(section,panel,false,null);
          screenMapScreens.append(section);
        }
        screenMapMessage.textContent =
          'Clique pour retrouver une fenêtre, ou glisse-la vers un autre écran.';
      } catch (error) {
        console.error('Plan des écrans :',error);
        if (generation === screenMapRequest && !screenMapOverlay.hidden) {
          screenMapMessage.textContent = 'Impossible de lire les écrans';
        }
      } finally {
        if (generation === screenMapRequest) screenMapRefresh.disabled = false;
      }
    }
    screenMapButton.addEventListener('click',function () {
      if (workspace.hidden || workspaceSwitchBusy || suppressPresetSaving ||
          !window.guitarAudio?.workspaceScreenMap || !screenMapOverlay.hidden) return;
      screenMapPreviousFocus = document.activeElement;
      screenMapOverlay.hidden = false;
      screenMapClose.focus();
      refreshScreenMap();
    });
    screenMapRefresh.addEventListener('click',function () { refreshScreenMap(); });
    screenMapClose.addEventListener('click',function () { closeScreenMap(); });
    screenMapOverlay.addEventListener('click',function (event) {
      if (event.target === screenMapOverlay) closeScreenMap();
    });
    screenMapOverlay.addEventListener('keydown',function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeScreenMap();
      }
    });

    screenModeSelect.addEventListener('change', async function () {
      if (workspace.hidden || workspaceSwitchBusy || suppressPresetSaving ||
          !window.guitarAudio?.workspaceScreenMode) {
        screenModeSelect.value = activeScreenMode;
        return;
      }
      const requestedMode = screenModeSelect.value;
      if (!['secondary-first','all','primary','secondary'].includes(requestedMode) ||
          requestedMode === activeScreenMode) {
        screenModeSelect.value = activeScreenMode;
        return;
      }
      workspaceSwitchBusy = true;
      updatePresetButtons();
      showWorkspaceStatus('');
      try {
        const result = await window.guitarAudio.workspaceScreenMode(
          activeWorkspaceId, requestedMode);
        if (!result || result.id !== activeWorkspaceId ||
            result.mode !== requestedMode) {
          throw new Error('Choix des écrans non confirmé');
        }
        activeScreenMode = requestedMode;
        const labels = {
          'secondary-first':'Priorité annexes', all:'Tous les écrans',
          primary:'Écran principal', secondary:'Annexes uniquement'
        };
        showWorkspaceStatus('Écrans : ' + labels[requestedMode] + ' — choix enregistré');
      } catch (error) {
        console.error('Choix des écrans :', error);
        showWorkspaceStatus('Impossible de modifier le choix des écrans');
      } finally {
        workspaceSwitchBusy = false;
        updatePresetButtons();
      }
    });

    layoutStyleSelect.addEventListener('change', async function () {
      if (workspace.hidden || workspaceSwitchBusy || suppressPresetSaving ||
          !window.guitarAudio?.workspaceLayoutStyle) {
        layoutStyleSelect.value = activeLayoutStyle;
        return;
      }
      const requestedStyle = layoutStyleSelect.value;
      if (!['mosaic','columns','cascade'].includes(requestedStyle) ||
          requestedStyle === activeLayoutStyle) return;
      workspaceSwitchBusy = true;
      updatePresetButtons();
      showWorkspaceStatus('');
      try {
        const result = await window.guitarAudio.workspaceLayoutStyle(
          activeWorkspaceId, requestedStyle);
        if (!result || result.id !== activeWorkspaceId ||
            result.style !== requestedStyle) {
          throw new Error('Style non confirmé');
        }
        activeLayoutStyle = requestedStyle;
        const labels = {mosaic:'Mosaïque',columns:'Colonnes',cascade:'Cascade'};
        showWorkspaceStatus('Disposition ' + labels[requestedStyle] + ' enregistrée');
      } catch (error) {
        console.error('Style de disposition :', error);
        showWorkspaceStatus('Impossible de changer la disposition');
      } finally {
        workspaceSwitchBusy = false;
        updatePresetButtons();
      }
    });

    autoLayoutButton.addEventListener('click', async function () {
      if (workspace.hidden || workspaceSwitchBusy || suppressPresetSaving ||
          !window.guitarAudio?.workspaceAutoArrange) return;
      const next = !activeAutoArrange;
      workspaceSwitchBusy = true;
      updatePresetButtons();
      showWorkspaceStatus('');
      try {
        const result = await window.guitarAudio.workspaceAutoArrange(activeWorkspaceId,next);
        if (!result || result.id !== activeWorkspaceId ||
            result.enabled !== next) throw new Error('Mode automatique non confirmé');
        activeAutoArrange = next;
        showWorkspaceStatus(next
          ? 'Répartition automatique activée pour cet espace'
          : 'Répartition automatique désactivée pour cet espace');
      } catch (error) {
        console.error('Répartition automatique :', error);
        showWorkspaceStatus('Impossible de modifier le mode automatique');
      } finally {
        workspaceSwitchBusy = false;
        updatePresetButtons();
      }
    });

    distributeLayoutButton.addEventListener('click', async function () {
      if (workspace.hidden || workspaceSwitchBusy || suppressPresetSaving ||
          !window.guitarAudio?.workspaceDistribute) return;
      savePresetView();
      workspaceSwitchBusy = true;
      updatePresetButtons();
      showWorkspaceStatus('');
      try {
        const result = await window.guitarAudio.workspaceDistribute(activeWorkspaceId);
        if (!result || result.id !== activeWorkspaceId ||
            !Number.isInteger(result.arranged) || result.arranged < 0 ||
            !Number.isInteger(result.displays) || result.displays < 0) {
          throw new Error('Répartition non confirmée');
        }
        showWorkspaceStatus(result.arranged
          ? result.arranged + ' fenêtre' + (result.arranged > 1 ? 's' : '') +
            ' répartie' + (result.arranged > 1 ? 's' : '') +
            ' sur ' + result.displays + ' écran' + (result.displays > 1 ? 's' : '')
          : 'Aucune fenêtre détachée à répartir');
      } catch (error) {
        console.error('Répartition des fenêtres :', error);
        showWorkspaceStatus('Répartition impossible');
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
      closeScreenMap(false);
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
        activeAutoArrange = false;
        activeLayoutStyle = 'mosaic';
        activeScreenMode = 'secondary-first';
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
              activeAutoArrange = layout.autoArrange === true;
              activeLayoutStyle = ['mosaic','columns','cascade'].includes(layout.layoutStyle)
                ? layout.layoutStyle : 'mosaic';
              activeScreenMode = ['secondary-first','all','primary','secondary'].includes(layout.screenMode)
                ? layout.screenMode : 'secondary-first';
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
        let openedDuringRestoration = 0;
        while (!workspace.hidden && generation === workspaceGeneration &&
               pendingRestoredIds?.length) {
          const id = pendingRestoredIds.shift();
          const group = groups.get(id);
          if (!group || !detachedAllowed.has(id) || group.detached) continue;
          if (await openDetachedGroup(group, true)) openedDuringRestoration++;
        }
        if (openedDuringRestoration && !workspace.hidden &&
            generation === workspaceGeneration && !pendingRestoredIds?.length &&
            activeAutoArrange && window.guitarAudio?.workspaceDistribute) {
          try { await window.guitarAudio.workspaceDistribute(activeWorkspaceId); }
          catch (error) { console.warn('Répartition après restauration :', error); }
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
      if (event.key === 'Escape' && active && workspaceNameOverlay.hidden &&
          screenMapOverlay.hidden) {
        closePanel();
      }
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
