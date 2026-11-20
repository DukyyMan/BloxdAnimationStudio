// Coverage guard for the author-facing documentation. Read the actual adapter
// registrations (not a second hand-maintained method list).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'acorn';
import { SCRIPT_REFERENCE } from '../lib/script-reference.js';
const ast = parse(await readFile(new URL('../lib/code-studio.js', import.meta.url), 'utf8'), {
  ecmaVersion: 'latest',
  sourceType: 'module',
});
function registration(fn, id) {
  const body = ast.body.map((n) => n.declaration || n).find((n) => n.id?.name === fn).body.body;
  return body.flatMap((n) => n.declarations || []).find((d) => d.id.name === id).init.arguments[0].properties;
}
for (const group of registration('compileScript', 'api'))
  for (const method of group.value.arguments[0].properties) {
    const signature = group.key.name + '.' + method.key.name;
    assert.ok(SCRIPT_REFERENCE.includes(signature), `Missing API documentation: ${signature}`);
  }
for (const part of registration('meshGroup', 'g').filter((p) => p.value.type === 'CallExpression'))
  assert.ok(
    SCRIPT_REFERENCE.includes('.' + part.key.name + '('),
    `Missing mesh builder documentation: ${part.key.name}`,
  );
console.log('PASS documentation covers registered script and mesh methods');
