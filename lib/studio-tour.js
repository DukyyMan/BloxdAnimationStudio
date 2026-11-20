// One modal overlay, with a transparent cutout over the actual control. Tour
// navigation changes the view only; it never adds objects or runs a script.
export function initTours({ prompts, code, syncDock, resize }) {
  const $ = (s) => document.querySelector(s),
    body = document.body,
    overlay = $('#tour-overlay'),
    card = $('#tour-card'),
    hole = $('#tour-hole');
  const panelNames = ['library', 'inspector', 'timeline'];
  function panel(name) {
    for (const p of panelNames) body.classList.toggle('panel-' + p, p === name);
    syncDock();
    resize();
  }
  function inspect(name) {
    panel('inspector');
    $(`[data-inspector="${name}"]`).click();
  }
  const library = () => panel('library'),
    editor = () => {
      if (!$('#code-dialog').open) code.open();
    },
    prompt = () => prompts.open();
  function choose(value) {
    prompt();
    const t = $('#prompt-type');
    if (t.value !== value) {
      t.value = value;
      t.onchange();
    }
  }
  const studio = [
    [
      '#viewport',
      'Viewport',
      'Drag to orbit the scene. Scroll to zoom and click an object to select it.',
      () => panel(null),
    ],
    [
      '.outliner-heading',
      'Scene objects',
      'Use the scene object list to find and select editable characters and props.',
      library,
    ],
    [
      '#asset-search',
      'Asset browser',
      'Search the current library category for a block, item or model.',
      library,
    ],
    [
      () =>
        $('#terrain-toggle').hidden || $('#block-edit-actions').hidden
          ? '[data-library="blocks"]'
          : '#terrain-toggle',
      'Terrain tools',
      'In Blocks, use Place or Remove for individual cells, or Terrain to sculpt with a brush.',
      library,
    ],
    ['[data-library="characters"]', 'Character tools', 'Open Bob to browse character options.', library],
    [
      () =>
        !$('[data-clip="walk"]').getClientRects().length ? '[data-inspector="object"]' : '[data-clip="walk"]',
      'Animation library',
      'Select a character in the object inspector to bake a preset or reuse a saved pose range.',
      () => inspect('object'),
    ],
    [
      '#track-area',
      'Timeline',
      'Scrub the ruler and drag keys to change their timing.',
      () => panel('timeline'),
    ],
    [
      '#cam-capture',
      'Camera controls',
      'Frame a shot and use this control to record the current camera view.',
      () => inspect('camera'),
    ],
    [
      '#sun-pad',
      'Lighting controls',
      'Use the lighting inspector to adjust the sun and environment.',
      () => inspect('light'),
    ],
    [
      '#open-export',
      'Export',
      'Open export to save a still frame, render video or export audio.',
      () => panel(null),
    ],
  ];
  const tours = {
    studio,
    editor: [
      [
        '#code-source',
        'Code Editor',
        'Write a local script here. Validate builds an editable scene preview without applying it.',
        editor,
      ],
      [
        '#code-apply',
        'Run validated script',
        'Validate first, then run to apply the exact checked scene.',
        editor,
      ],
      [
        '.code-library summary',
        'Example library',
        'Preview a working script, insert it at the cursor or replace the editor contents.',
        editor,
      ],
      [
        '#error-inspector summary',
        'Error Inspector',
        'Expand for diagnostics, jump to a source line, or copy a debugging report.',
        editor,
      ],
      [
        '#code-find-toggle',
        'Editing tools',
        'Find and replace text. Use Expand for more editing space.',
        editor,
      ],
      [
        '.code-output summary',
        'Execution output',
        'Review the command log and warnings after validation.',
        editor,
      ],
    ],
    prompt: [
      [
        '#prompt-type',
        'Creation type',
        'Choose a brief. Each type keeps its own settings and manual preview.',
        prompt,
      ],
      [
        '#prompt-fields select',
        'Animation settings',
        'Choose generation mode, planning style, duration and FPS.',
        () => choose('Animation'),
      ],
      [
        '.prompt-tip',
        'Thumbnail reference',
        'Attach the reference to the external chat, not to the studio.',
        () => choose('Thumbnail'),
      ],
      [
        '#prompt-fields textarea',
        'Description fields',
        'Describe the scene in your own words; these details go into the request.',
        prompt,
      ],
      [
        '#prompt-preview',
        'Live preview',
        'Read the assembled instructions or use Edit Preview to make your own copy.',
        prompt,
      ],
      [
        '#prompt-default',
        'Complete mega prompt',
        'Copies the technical guide, working examples and a blank request.',
        prompt,
      ],
      [
        '#prompt-custom',
        'Customized prompt',
        'Copies the full brief including your settings or manual edits.',
        prompt,
      ],
    ],
  };
  let active = null,
    index = 0,
    target,
    restore,
    animation;
  function stored(key, value) {
    try {
      if (value === undefined) return localStorage.getItem('studioTour.' + key);
      localStorage.setItem('studioTour.' + key, value);
    } catch {}
  }
  function history() {
    const done = Object.keys(tours).filter((k) => stored(k) === 'done');
    $('#tour-history').textContent = done.length
      ? 'Completed tours: ' + done.join(', ') + '. You can restart any tour.'
      : 'Choose a walkthrough. Skip or press Escape at any time.';
  }
  function position() {
    if (!active || !target) return;
    const r = target.getBoundingClientRect(),
      h = window.innerHeight,
      w = window.innerWidth;
    const x = Math.max(0, r.left - 3),
      y = Math.max(0, r.top - 3),
      b = Math.min(h, r.bottom + 3);
    Object.assign(hole.style, {
      left: x + 'px',
      top: y + 'px',
      width: Math.max(0, Math.min(w, r.right + 3) - x) + 'px',
      height: Math.max(0, b - y) + 'px',
    });
    card.style.top =
      (b + card.offsetHeight + 12 <= h
        ? b + 8
        : y - card.offsetHeight - 8 >= 0
          ? y - card.offsetHeight - 8
          : Math.max(6, h - card.offsetHeight - 10)) + 'px';
  }
  function step() {
    const steps = tours[active],
      [selector, title, text, prepare] = steps[index];
    prepare();
    const id = typeof selector === 'function' ? selector() : selector;
    target = $(id);
    hole.dataset.target = id;
    if (!target || !target.getClientRects().length) {
      end(false);
      return;
    }
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('#tour-step').textContent = `${active.toUpperCase()} TOUR · ${index + 1} / ${steps.length}`;
    $('#tour-title').textContent = title;
    $('#tour-text').textContent = text;
    $('#tour-back').disabled = index === 0;
    $('#tour-next').textContent = index === steps.length - 1 ? 'Finish' : 'Next';
    if (!overlay.open) overlay.showModal();
    position();
    cancelAnimationFrame(animation);
    const until = performance.now() + 500;
    function settle() {
      position();
      if (active && performance.now() < until) animation = requestAnimationFrame(settle);
    }
    animation = requestAnimationFrame(settle);
  }
  function start(name) {
    if (active) return;
    const openCode = $('#code-dialog').open,
      openPrompt = $('#prompt-dialog').open,
      priorType = $('#prompt-type').value,
      priorTab = $('[data-inspector].active')?.dataset.inspector,
      priorPanels = panelNames.filter((p) => body.classList.contains('panel-' + p));
    $('#help-dialog').close();
    restore = () => {
      if (priorTab && $('[data-inspector].active')?.dataset.inspector !== priorTab)
        $(`[data-inspector="${priorTab}"]`).click();
      if (!openPrompt) $('#prompt-dialog').close();
      if (!openCode) $('#code-dialog').close();
      if ($('#prompt-type').value !== priorType) {
        $('#prompt-type').value = priorType;
        $('#prompt-type').onchange();
      }
      for (const p of panelNames) body.classList.toggle('panel-' + p, priorPanels.includes(p));
      syncDock();
      resize();
    };
    active = name;
    index = 0;
    step();
  }
  function end(done) {
    if (!active) return;
    if (done) stored(active, 'done');
    active = null;
    cancelAnimationFrame(animation);
    overlay.close();
    restore();
    history();
  }
  overlay.oncancel = (e) => {
    e.preventDefault();
    end(false);
  };
  $('#tour-back').onclick = () => {
    index--;
    step();
  };
  $('#tour-skip').onclick = () => end(false);
  $('#tour-next').onclick = () => {
    if (index + 1 === tours[active].length) end(true);
    else {
      index++;
      step();
    }
  };
  document.querySelectorAll('[data-tour]').forEach((b) => (b.onclick = () => start(b.dataset.tour)));
  window.addEventListener('resize', position);
  history();
  const auto = $('#tour-auto');
  auto.checked = stored('auto') === '1';
  auto.onchange = () => stored('auto', auto.checked ? '1' : '0');
  if (auto.checked) {
    const intro = () => {
      auto.checked = false;
      stored('auto', '0');
      if (!document.querySelector('dialog[open]')) start('studio');
    };
    if ($('#device-dialog').open) $('#device-dialog').addEventListener('close', intro, { once: true });
    else setTimeout(intro, 600);
  }
}
