// Built-in changelog: menu entry points, reverse-chronological order, search,
// category filters and expandable entries.
import {launch,boot} from './browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await launch();
const page=await browser.newPage({viewport:{width:1365,height:768}});
await boot(page);
const results={};
// Entry point 1: Project menu.
await page.click('#open-project-menu');
await page.click('#open-changelog');
await page.waitForTimeout(120);
assert.ok(await page.evaluate(()=>document.querySelector('#changelog-dialog').open),'changelog opens from the project menu');
// Entries render newest first with version, date and title.
const heads=await page.evaluate(()=>[...document.querySelectorAll('.cl-entry .cl-head')].map(h=>({version:h.querySelector('.cl-version').textContent,date:h.querySelector('.cl-date').textContent,status:!!h.querySelector('.cl-status'),title:h.querySelector('.cl-title').textContent})));
assert.ok(heads.length>=5,'several updates are listed: '+heads.length);
const dates=heads.map(h=>h.date);
const times=heads.map(h=>h.date==='Date not recorded'?NaN:Date.parse(h.date));
for(let i=1;i<heads.length;i++)if(!Number.isNaN(times[i])&&!Number.isNaN(times[i-1]))assert.ok(times[i]<=times[i-1],'entries are newest first');
assert.ok(heads[0].version==='v4.3.0','the newest update comes first');
assert.ok(heads.every(h=>h.status),'every entry shows release/development status');
results.entries=heads.map(h=>h.version);
// Expand/collapse: first entry open by default, clicking toggles.
const firstOpen=await page.evaluate(()=>document.querySelector('.cl-entry').classList.contains('open'));
assert.ok(firstOpen,'newest entry is expanded by default');
await page.click('.cl-entry .cl-head');
assert.ok(await page.evaluate(()=>!document.querySelector('.cl-entry').classList.contains('open')),'clicking collapses');
await page.click('.cl-entry .cl-head');
assert.ok(await page.evaluate(()=>document.querySelector('.cl-entry').classList.contains('open')),'clicking expands again');
// Search filters entries and matches item text.
await page.fill('#changelog-search','autosave');
const matched=await page.evaluate(()=>[...document.querySelectorAll('.cl-entry .cl-version')].map(v=>v.textContent));
assert.ok(matched.includes('v4.2.0')&&!matched.includes('v3.1'),'search matches item text: '+matched.join(','));
assert.ok(await page.evaluate(()=>document.querySelector('.cl-entry').classList.contains('open')),'search results are expanded');
// Empty-state message for nonsense queries.
await page.fill('#changelog-search','zzzznotfound');
assert.ok(await page.evaluate(()=>!document.querySelector('#changelog-empty').hidden),'empty state shown when nothing matches');
await page.fill('#changelog-search','');
// Category chips filter.
const chip=await page.evaluate(()=>{const c=[...document.querySelectorAll('.cl-chip')].find(x=>x.textContent==='Camera');c.click();return true;});
await page.waitForTimeout(80);
const camEntries=await page.evaluate(()=>[...document.querySelectorAll('.cl-entry')].map(e=>({open:e.classList.contains('open'),cats:[...e.querySelectorAll('.cl-cat')].map(c=>c.textContent)})));
assert.ok(camEntries.length>=2,'Camera filter keeps entries with camera sections: '+camEntries.length);
assert.ok(camEntries.every(e=>e.open&&e.cats.length&&e.cats.every(c=>c==='Camera')),'only camera sections shown');
await page.evaluate(()=>{[...document.querySelectorAll('.cl-chip')].find(x=>x.textContent==='Camera').click();});
// Entry point 2: Help dialog.
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
await page.evaluate(()=>document.querySelector('#help-dialog').showModal());
await page.click('#help-changelog');
await page.waitForTimeout(120);
assert.ok(await page.evaluate(()=>document.querySelector('#changelog-dialog').open&&!document.querySelector('#help-dialog').open),'changelog opens from Help');
const listed=await page.evaluate(()=>document.querySelectorAll('.cl-entry').length);
assert.equal(listed,results.entries.length,'clearing filters restores the full list');
await page.screenshot({path:'tests/results/changelog.png'});
results.passed=true;
fs.mkdirSync('tests/results',{recursive:true});
fs.writeFileSync('tests/results/changelog.json',JSON.stringify(results,null,2));
console.log('PASS built-in changelog renders verified history with search and filters',results);
await browser.close();
