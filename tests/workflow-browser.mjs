import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { boot, launch } from './browser.mjs';
const browser = await launch(),
  ctx = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 0.5,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
const page = await ctx.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const q = (s) => page.locator(s),
  click = (s) => q(s).click(),
  text = (s) => q(s).textContent(),
  val = (s) => q(s).inputValue(),
  clip = () => page.evaluate(() => navigator.clipboard.readText());
try {
  await boot(page);
  await page.evaluate(() => STUDIO.renderer.setPixelRatio(0.4));
  await click('#open-code');
  const testedExamples = await page.evaluate(() => {
    const select = document.querySelector('#code-example-select');
    for (const option of select.options) {
      select.value = option.value;
      select.onchange();
      STUDIO.code.compile(document.querySelector('#code-example-preview').textContent);
    }
    select.selectedIndex = 0;
    select.onchange();
    return select.options.length;
  });
  console.log('PASS ' + testedExamples + ' editor examples against the live catalog and starter project');
  await q('#code-source').fill('async function main(api){\napi.terrain.clear();\n}');
  await click('#code-validate');
  assert.equal(await text('#error-count'), '0 Errors · 1 Warning');
  const script =
    'async function main(api) {\napi.scene.get("missing"); api.scene.get("absent");\napi.terrain.fill({\nfrom:{},to:{x:2},blockName:"fake"\n});\n}';
  await q('#code-source').fill(script);
  await click('#code-validate');
  await click('#error-inspector summary');
  assert.equal(await text('#error-count'), '3 Errors');
  assert.deepEqual(await q('.error-line').allTextContents(), ['2', '3', '4', '5']);
  await q('.diagnostic').last().click();
  assert.equal(await q('#code-source').evaluate((e) => e.selectionStart), script.indexOf('api.terrain'));
  assert.ok(await q('#error-list').isVisible());
  await click('#copy-errors');
  assert.match(await clip(), /Command 1[\s\S]*Unknown block[\s\S]*3 \| api\.terrain/);
  await click('#copy-errors-script');
  assert.ok((await clip()).endsWith(script));
  await q('#code-source').fill('async function main(api) { const n=; }');
  assert.equal(await text('#error-count'), 'Not checked');
  await click('#code-validate');
  assert.match(await text('#error-list'), /Syntax/);
  assert.equal(await text('#error-count'), '1 Error');
  const valid = 'async function main(api) {api.terrain.setBlock({x:30,y:1,z:30,blockName:"stone"});}';
  await q('#code-source').fill(valid);
  await click('#code-validate');
  assert.equal(await text('#error-count'), '0 Errors');
  assert.equal(await q('.error-line').count(), 0);
  await page.evaluate(() => STUDIO.world.set(34, 1, 30, 'snow'));
  await click('#code-apply');
  assert.match(await text('#error-list'), /Runtime.*Source line unavailable/s);
  assert.equal(await q('.error-line').count(), 0);
  await click('#code-validate');
  await click('#code-apply');
  assert.equal(await page.evaluate(() => STUDIO.world.get(30, 1, 30)), 'stone');
  // Use the real manual block editing handler against the generated cell.
  await page.evaluate(() => {
    const B = STUDIO,
      get = () => B.world.meshes.find((m) => m.userData.cells?.some((c) => c.join(',') === '30,1,30')),
      mesh = get();
    if (!mesh) throw Error('Generated cell is not rendered');
    const hit = {
      object: mesh,
      point: new B.THREE.Vector3(30.5, 2, 30.5),
      face: { normal: new B.THREE.Vector3(0, 1, 0) },
    };
    if (!B.editBlock(hit, false)) throw Error('Manual add failed');
    const m = get();
    if (
      !B.editBlock(
        { object: m, instanceId: m.userData.cells.findIndex((c) => c.join(',') === '30,1,30') },
        true,
      )
    )
      throw Error('Manual erase failed');
  });
  await click('#open-code');
  await q('#code-source').fill(
    'async function main(api){api.terrain.generate({center:[30,30],width:4,depth:4,biome:"forest",amplitude:4});}',
  );
  await click('#code-validate');
  await click('#code-apply');
  assert.ok(await page.evaluate(() => STUDIO.world.get(30, 2, 30)));
  console.log('PASS diagnostics, copying, stale validation and manual/script terrain');
  await click('#open-code');
  await click('#open-prompt');
  const type = q('#prompt-type'),
    field = (k) => q('#prompt-fields').getByLabel(k, { exact: true });
  await field('Animation idea').fill('Race through a clearing');
  await field('FPS').selectOption('Custom');
  await field('Custom FPS').fill('48');
  await field('Duration').selectOption('Set seconds');
  await field('Seconds').fill('6');
  assert.match(await val('#prompt-preview'), /Custom FPS: 48/);
  await click('#prompt-custom');
  assert.ok((await clip()).includes('Race through a clearing'));
  await click('#prompt-default');
  assert.ok(!(await clip()).includes('Race through'));
  assert.match(await clip(), /terrain.fill[\s\S]*REQUEST/);
  for (const [kind, label] of [
    ['Thumbnail', 'Main subject'],
    ['Custom Scene / Environment', 'Terrain'],
    ['Custom Object / Model', 'Individual components'],
    ['Character Animation', 'Body parts and poses'],
    ['Camera Animation', 'Shot sequence'],
    ['Other / Custom Request', 'Request'],
  ]) {
    await type.selectOption(kind);
    await field(label).fill('My ' + kind);
    assert.ok((await val('#prompt-preview')).includes('My ' + kind));
    if (kind === 'Thumbnail') assert.match(await text('.prompt-tip'), /Upload your reference image/);
  }
  await type.selectOption('Animation');
  assert.equal(await field('Animation idea').inputValue(), 'Race through a clearing');
  await click('#prompt-edit');
  await q('#prompt-preview').fill('Manually edited');
  await click('#prompt-select');
  assert.equal(await q('#prompt-preview').evaluate((e) => e.selectionEnd), 15);
  await click('#prompt-dialog .dialog-close');
  await click('#open-prompt');
  assert.equal(await val('#prompt-preview'), 'Manually edited');
  await type.selectOption('Thumbnail');
  await type.selectOption('Animation');
  await click('#prompt-custom');
  assert.equal(await clip(), 'Manually edited');
  await click('#prompt-regenerate');
  assert.match(await val('#prompt-preview'), /Race through a clearing/);
  page.once('dialog', (d) => d.accept());
  await click('#prompt-reset');
  assert.equal(await field('Animation idea').inputValue(), '');
  await click('#prompt-dialog .dialog-close');
  await click('#code-dialog .dialog-close');
  console.log('PASS local prompt settings, previews, clipboard and reset');
  for (const kind of ['studio', 'editor', 'prompt']) {
    await click('#help-btn');
    await click(`#help-dialog [data-tour="${kind}"]`);
    assert.match(await text('#tour-step'), /1 \//);
    await click('#tour-next');
    await click('#tour-back');
    assert.match(await text('#tour-step'), /1 \//);
    let count = 0;
    while ((await q('#tour-overlay').isVisible()) && count++ < 15) {
      const rect = await q('#tour-hole').boundingBox();
      assert.ok(rect.width > 0 && rect.height > 0);
      assert.ok(
        await q(await q('#tour-hole').getAttribute('data-target'))
          .first()
          .isVisible(),
      );
      await click('#tour-next');
    }
    assert.ok(await page.evaluate((k) => localStorage.getItem('studioTour.' + k) === 'done', kind));
  }
  await click('#help-btn');
  await click('#help-dialog [data-tour="studio"]');
  await click('#tour-skip');
  await click('#help-btn');
  await click('#help-dialog [data-tour="studio"]');
  await page.keyboard.press('Escape');
  assert.ok(!(await q('#tour-overlay').isVisible()));
  assert.deepEqual(errors, []);
  console.log('PASS inspector, clipboard, apply error, manual/script terrain, all prompt forms and tours');
  await page.close();
  const offline = await browser.newContext({
    offline: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 0.6,
  });
  const local = await offline.newPage();
  const remote = [];
  local.on('request', (r) => {
    if (/^https?:/.test(r.url())) remote.push(r.url());
  });
  await local.addInitScript(() => localStorage.setItem('studioTour.auto', '1'));
  await boot(local, pathToFileURL(path.resolve('START-HERE.html')).href);
  await local.locator('#tour-skip').click();
  assert.equal(await local.evaluate(() => localStorage.getItem('studioTour.auto')), '0');
  await local.locator('#prompt-launch').click();
  await local.getByLabel('Animation idea', { exact: true }).fill('Offline test');
  assert.match(await local.locator('#prompt-preview').inputValue(), /Animation idea: Offline test/);
  assert.ok(
    await local.locator('#prompt-dialog').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    'mobile width does not overflow',
  );
  assert.deepEqual(remote, []);
  console.log('PASS standalone prompt generation with network disabled');
} finally {
  await browser.close();
}
