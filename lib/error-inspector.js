// Reports contain only script diagnostics and the source the author can see.
function advice(message, category) {
  if (category === 'Warning') return 'Review this behavior before applying the script.';
  if (/unknown object/i.test(message))
    return 'Create the object before referring to it. Check the spelling and case of its ID.';
  if (/unknown block|invalid block/i.test(message))
    return 'This block is not in the available catalog. Use assets.search(query, {category:"block"}) and pass a matching entry’s id.';
  if (/eas(e|ing)|interpolation/i.test(message))
    return 'Choose linear, smooth, in, out, inout, step, bezier or spline.';
  if (/unknown function|not available|not supported/i.test(message))
    return 'Check the Supported API reference for the method, arguments and spelling.';
  if (category === 'Syntax')
    return 'Check the surrounding brackets, quotes and punctuation, then validate again.';
  if (category === 'Runtime (dry run)')
    return 'The interpreter stopped this statement while previewing the script. Check its input values and declarations.';
  if (category === 'Runtime')
    return 'The validated change could not be applied. Validate against the current scene before retrying.';
  return 'Validation could not accept this operation. Check the reported values and validate again.';
}
export function initErrorInspector(source, copy) {
  const $ = (s) => document.querySelector(s),
    list = $('#error-list'),
    lines = $('#code-lines');
  let items = [];
  function location(d) {
    return (
      (d.line
        ? `Line ${d.line}${d.endLine > d.line ? '–' + d.endLine : ''}${d.column ? ', column ' + d.column : ''}`
        : 'Source line unavailable') + (d.command ? ` · Command ${d.command}` : '')
    );
  }
  function report(script = false) {
    const text = source.value.split('\n');
    return [
      'Bloxd Studio Plus — Script diagnostics',
      ...items.map((d, i) => {
        const context = d.line
          ? text
              .slice(d.line - 1, d.endLine || d.line)
              .map((l, j) => `${d.line + j} | ${l}`)
              .join('\n')
          : '';
        return `${i + 1}. ${d.category} · ${location(d)}\n${d.message}\n${advice(d.message, d.category)}${context ? '\n' + context : ''}`;
      }),
      ...(script ? ['Full script:\n' + source.value] : []),
    ].join('\n\n');
  }
  function jump(d) {
    const text = source.value.split('\n'),
      start = text.slice(0, d.line - 1).reduce((n, l) => n + l.length + 1, 0);
    source.focus({ preventScroll: true });
    source.setSelectionRange(start, start + text[d.line - 1].length);
    source.scrollTop =
      (d.line - 1) * parseFloat(getComputedStyle(source).lineHeight) - source.clientHeight / 2;
    source.scrollLeft = 0;
    source.scrollIntoView({ block: 'nearest' });
    lines
      .querySelector(`[data-line="${d.line}"]`)
      ?.animate([{ background: '#feadb0' }, { background: '#692e36' }], 650);
  }
  function drawGutter() {
    const n = source.value.split('\n').length,
      marked = new Set();
    for (const d of items)
      if (d.category !== 'Warning' && d.line)
        for (let i = d.line; i <= Math.min(n, d.endLine || d.line); i++) marked.add(i);
    const fragment = document.createDocumentFragment();
    let plain = [];
    function flush() {
      if (plain.length) {
        fragment.append(plain.join(''));
        plain = [];
      }
    }
    for (let i = 1; i <= n; i++) {
      if (!marked.has(i)) {
        plain.push(i + '\n');
        continue;
      }
      flush();
      const el = document.createElement('span');
      el.className = 'error-line';
      el.dataset.line = i;
      el.textContent = i;
      fragment.append(el, '\n');
    }
    flush();
    lines.replaceChildren(fragment);
    lines.parentNode.style.setProperty('--digits', String(n).length + 'ch');
    lines.scrollTop = source.scrollTop;
  }
  function set(errors = [], validated = false) {
    items = errors;
    const checked = validated;
    const warn = items.filter((d) => d.category === 'Warning').length,
      count = items.length - warn;
    $('#error-count').textContent = checked
      ? `${count} Error${count === 1 ? '' : 's'}${warn ? ' · ' + warn + ' Warning' + (warn === 1 ? '' : 's') : ''}`
      : 'Not checked';
    list.replaceChildren();
    items.forEach((d, i) => {
      d.category ||= 'Validation';
      const el = document.createElement(d.line ? 'button' : 'div');
      el.className = 'diagnostic';
      const title = document.createElement('strong');
      title.textContent = `${d.category === 'Warning' ? 'Warning' : 'Error'} ${i + 1} · ${d.category} — ${location(d)}`;
      el.append(
        title,
        document.createElement('br'),
        d.message,
        document.createElement('br'),
        advice(d.message, d.category),
      );
      if (d.line) el.onclick = () => jump(d);
      list.append(el);
    });
    if (!items.length)
      list.textContent = checked
        ? 'No diagnostics in this validation.'
        : 'Validate the current script to inspect diagnostics.';
    $('#copy-errors').disabled = $('#copy-errors-script').disabled = !items.length;
    drawGutter();
    // Retain the original editor's first-error selection without stealing focus.
    const first = items.find((d) => d.line && d.category !== 'Warning');
    if (first) {
      const rows = source.value.split('\n');
      const offset = rows.slice(0, first.line - 1).reduce((n, s) => n + s.length + 1, 0);
      source.setSelectionRange(offset, offset + rows[first.line - 1].length);
    }
  }
  $('#copy-errors').onclick = () => copy(report());
  $('#copy-errors-script').onclick = () => copy(report(true));
  set();
  return { set };
}
