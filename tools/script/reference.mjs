// Keep the file:// bundle and unbundled ES module app on the same offline reference.
import { readFile, writeFile } from 'node:fs/promises';
const doc = await readFile(new URL('../../CODE-EDITOR.md', import.meta.url), 'utf8');
const path = new URL('../../lib/script-reference.js', import.meta.url);
const source =
  '// Generated from CODE-EDITOR.md by tools/script/reference.mjs.\nexport const SCRIPT_REFERENCE=' +
  JSON.stringify(doc.trim()) +
  ';\n';
if (process.argv.includes('--check')) {
  if ((await readFile(path, 'utf8')) !== source) throw Error('Stale scripting reference. Run npm run build.');
} else await writeFile(path, source);
