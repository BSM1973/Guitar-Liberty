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
    const drawerHead = document.createElement('div');
    drawerHead.className = 'gl-context-head';
    const drawerTitle = document.createElement('strong');
    drawerTitle.id = 'glContextTitle';
    const closeButton = document.createElement('button');
    closeButton.className = 'gl-context-close';
    closeButton.type = 'button';
    closeButton.title = 'Fermer le panneau';
    closeButton.setAttribute('aria-label', 'Fermer le panneau');
    closeButton.textContent = '×';
    drawerHead.append(drawerTitle, closeButton);
    const drawerBody = document.createElement('div');
    drawerBody.className = 'gl-context-body';
    drawer.append(drawerHead, drawerBody);
    workspace.prepend(rail);
    workspace.append(drawer);

    const groups = new Map();
    let active = null;

    function requestScoreLayout() {
      requestAnimationFrame(function () {
        const api = window.guitarLibertyAlphaTab;
        if (api && typeof api.resize === 'function') api.resize();
        window.dispatchEvent(new Event('resize'));
      });
    }

    function selectTab(group, index) {
      group.tabs.forEach(function (button, n) {
        const isSelected = index === n;
        button.classList.toggle('is-active', isSelected);
        button.setAttribute('aria-selected', String(isSelected));
        group.panes[n].hidden = !isSelected;
        if (isSelected) {
          const inner = group.panes[n].firstElementChild;
          if (inner && (inner.id === 'guidedSession' || inner.id === 'aiListening')) {
            inner.hidden = false;
          }
        }
      });
      drawerBody.scrollTop = 0;
      requestScoreLayout();
    }

    function closePanel() {
      drawer.hidden = true;
      workspace.classList.remove('gl-context-open');
      if (active) {
        active.element.hidden = true;
        active.button.classList.remove('is-active');
        active.button.setAttribute('aria-expanded', 'false');
      }
      active = null;
      scoreButton.classList.add('is-active');
      scoreButton.setAttribute('aria-current', 'page');
      requestScoreLayout();
    }

    function openPanel(id, index) {
      const group = groups.get(id);
      if (!group) return;
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
      drawerTitle.textContent = group.label;
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
        const pane = document.createElement('div');
        pane.className = 'gl-feature-pane';
        pane.hidden = true;
        pane.append(entry.node);
        tabs.append(tab);
        element.append(pane);
        tab.addEventListener('click', function () { selectTab(groups.get(spec.id), index); });
        tabButtons.push(tab);
        panes.push(pane);
      });
      if (nodes.length > 1) element.prepend(tabs);
      drawerBody.append(element);
      groups.set(spec.id, { label: spec.label, button: button, element: element, panes: panes, tabs: tabButtons });
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
