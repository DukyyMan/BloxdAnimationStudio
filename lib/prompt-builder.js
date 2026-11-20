import { SCRIPT_REFERENCE } from './script-reference.js';
import { CODE_EXAMPLES } from './code-examples.js';

const plans = ['Overall Description', 'Detailed Storyboard', 'Second-by-Second Storyboard'];
const animation = [
  'Animation planning style',
  'Duration',
  'Seconds',
  'FPS',
  'Custom FPS',
  'Animation idea',
  'Characters',
  'Environment',
  'Objects and props',
  'Camera',
  'Lighting',
];
const schemas = {
  Animation: animation,
  Thumbnail: [
    'Thumbnail description',
    'Main subject',
    'Characters',
    'Environment',
    'Objects and props',
    'Camera angle',
    'Lighting',
    'Composition preferences',
  ],
  'Custom Scene / Environment': [
    'Environment type',
    'Terrain',
    'Biome',
    'Dimensions or approximate scale',
    'Blocks and structures',
    'Decorations',
    'Lighting',
    'Camera',
  ],
  'Character Animation': [...animation, 'Body parts and poses'],
  'Camera Animation': [...animation, 'Shot sequence'],
  'Custom Object / Model': [
    'Object type',
    'Size',
    'Shape',
    'Materials',
    'Colors',
    'Individual components',
    'Animated?',
  ],
  'Other / Custom Request': ['Request'],
};
const choices = {
  'Generated mode': ['update', 'replace'],
  'Animation planning style': plans,
  Duration: ['Let the AI decide', 'Set seconds'],
  FPS: ['24', '12', '30', '60', 'Custom'],
  'Animated?': ['No', 'Yes'],
};
const reminder =
  'Upload your reference image directly to the external AI chat when you send the generated prompt.';
const examples = CODE_EXAMPLES.map((e) => `${e.name}\n${e.code}`).join('\n\n');
export function initPromptBuilder(catalog) {
  const $ = (s) => document.querySelector(s),
    dialog = $('#prompt-dialog'),
    preview = $('#prompt-preview'),
    type = $('#prompt-type'),
    fields = $('#prompt-fields'),
    note = $('#prompt-note');
  const technical = `Write a complete, pasteable Bloxd Studio Plus script, not a JSON command plan. Return only the script, without Markdown fences. Use only documented methods. Respect the execution limits; never invent assets, body parts or host APIs. Plan unsupported requests using supported approximations, noted in script comments. Use bounded fills rather than loops of setBlock calls.\n\n${SCRIPT_REFERENCE}\n\nAvailable block ID examples from this installation: ${catalog.blocks
    .slice(0, 32)
    .map((b) => b.id)
    .join(
      ', ',
    )}. Use api.assets.search for additional catalog entries.\n\nWorking script library\n${examples}`;
  const defaultPrompt =
    technical +
    '\n\nREQUEST\nCreation type: [describe your goal]\nGenerated mode: update unless explicitly requested otherwise.\nDescribe your scene, timing, characters, objects, camera and lighting here.';
  $('#script-reference').textContent = SCRIPT_REFERENCE;
  for (const name of Object.keys(schemas)) type.add(new Option(name, name));
  const drafts = new Map();
  let controls = new Map();
  function draft() {
    if (!drafts.has(type.value)) drafts.set(type.value, { values: {}, manual: null });
    return drafts.get(type.value);
  }
  function refresh() {
    const d = draft(),
      parts = ['Creation type: ' + type.value];
    let valid = true;
    for (const [k, input] of controls) {
      const visible = !(
        (k === 'Seconds' && controls.get('Duration').value !== 'Set seconds') ||
        (k === 'Custom FPS' && controls.get('FPS').value !== 'Custom')
      );
      input.parentElement.hidden = !visible;
      if (!visible) continue;
      if (!input.checkValidity()) valid = false;
      if (input.value.trim()) parts.push(`${k}: ${input.value.trim()}`);
    }
    if (type.value === 'Thumbnail')
      parts.push(
        'Inspect the attached reference image and recreate its subject, framing, lighting and composition with the supported API. Set project.setMode("thumbnail").',
      );
    const manual = d.manual !== null;
    preview.value = manual ? d.manual : 'REQUEST\n' + parts.join('\n') + '\n\n' + technical;
    preview.readOnly = !manual;
    $('#prompt-regenerate').hidden = !manual;
    $('#prompt-edit').disabled = manual;
    $('#prompt-custom').disabled = !manual && !valid;
    note.textContent = manual
      ? 'Editing your own copy. Settings will not replace it until you regenerate.'
      : valid
        ? 'Preview follows your settings. Copy it when ready.'
        : 'Check the numeric fields before copying.';
  }
  function render() {
    const values = draft().values;
    fields.replaceChildren();
    controls = new Map();
    if (type.value === 'Thumbnail') {
      const p = document.createElement('p');
      p.className = 'prompt-tip';
      p.textContent = reminder;
      fields.append(p);
    }
    for (const k of ['Generated mode', ...schemas[type.value], 'Additional instructions']) {
      const label = document.createElement('label');
      let input;
      if (choices[k]) {
        input = document.createElement('select');
        choices[k].forEach((v) => input.add(new Option(v, v)));
      } else if (['Seconds', 'Custom FPS'].includes(k)) {
        input = document.createElement('input');
        const fps = k === 'Custom FPS';
        Object.assign(input, {
          type: 'number',
          min: fps ? '1' : '2',
          max: fps ? '120' : '60',
          step: fps ? '1' : 'any',
          required: true,
          value: fps ? '24' : '8',
        });
      } else {
        input = document.createElement('textarea');
        input.rows = 3;
      }
      input.setAttribute('aria-label', k);
      if (values[k] !== undefined) input.value = values[k];
      label.append(k, input);
      fields.append(label);
      controls.set(k, input);
      input.oninput = () => {
        values[k] = input.value;
        refresh();
      };
    }
    refresh();
  }
  type.onchange = render;
  render();
  preview.oninput = () => {
    draft().manual = preview.value;
  };
  $('#prompt-edit').onclick = () => {
    draft().manual = preview.value;
    refresh();
    preview.focus();
  };
  $('#prompt-regenerate').onclick = () => {
    draft().manual = null;
    refresh();
  };
  $('#prompt-select').onclick = () => {
    preview.focus();
    preview.select();
  };
  $('#prompt-reset').onclick = () => {
    if (!confirm('Reset all prompt settings and manual previews?')) return;
    drafts.clear();
    type.value = 'Animation';
    render();
  };
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement('textarea');
      t.value = text;
      dialog.append(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      if (!ok) {
        note.textContent = 'Clipboard unavailable. Select the preview and copy it manually.';
        return;
      }
    }
    note.textContent = 'Copied to clipboard.';
  }
  $('#prompt-custom').onclick = () => copy(preview.value);
  $('#prompt-default').onclick = () => copy(defaultPrompt);
  $('#prompt-launch').onclick = $('#open-prompt').onclick = () => dialog.showModal();
  return {
    open: () => {
      if (!dialog.open) dialog.showModal();
    },
  };
}
