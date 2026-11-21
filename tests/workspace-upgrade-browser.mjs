import assert from 'node:assert/strict';
import {launch,boot} from './browser.mjs';
const browser=await launch();
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await boot(page);
 await page.locator('#open-code').click();
 const source=page.locator('#code-source');
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await source.fill('copy me');await source.selectText();await page.locator('#code-copy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'copy me');
 await source.selectText();await page.locator('#code-cut').click();await page.waitForFunction(()=>document.querySelector('#code-source').value==='');assert.equal(await source.inputValue(),'');
 await page.locator('#code-paste').click();await page.waitForFunction(()=>document.querySelector('#code-source').value==='copy me');assert.equal(await source.inputValue(),'copy me');
 await page.locator('#code-undo').click();assert.equal(await source.inputValue(),'');await page.locator('#code-redo').click();assert.equal(await source.inputValue(),'copy me');
 await source.fill('alpha\nbeta');
 await source.press('End');await source.press('Enter');await source.type('gamma');
 assert.match(await source.inputValue(),/gamma/);
 await page.locator('#code-find-toggle').click();await page.locator('#code-find').fill('beta');await page.locator('#code-replace-text').fill('delta');await page.locator('#code-find-next').click();await page.locator('#code-replace-one').click();assert.match(await source.inputValue(),/delta/);
 await page.locator('.code-library summary').click();assert.ok(await page.locator('#code-example-preview').textContent());
 await source.focus();await source.press('Control+End');await page.locator('#code-insert').click();assert.match(await source.inputValue(),/addCharacter/);
 page.once('dialog',d=>d.dismiss());const before=await source.inputValue();await page.locator('#code-example').click();assert.equal(await source.inputValue(),before,'cancel replacement preserves source');
 await source.fill('async function main(api) { api.timeline.setPlayhead(999); }');await page.locator('#code-validate').click();assert.match(await page.locator('#code-status').textContent(),/^Valid/);await page.locator('#code-apply').click();assert.equal(await page.evaluate(()=>STUDIO.timeline.time),await page.evaluate(()=>STUDIO.timeline.duration));
 // Partial JSON plans never apply on validation; dependent commands stop again.
 // v4.1 removed the unused AI command dialog (#open-ai / #ai-dialog); the AI Prompt Builder and Code Editor stay.
 // The partial-plan rule it covered is still checked on the command compiler that remains in lib/ai-commands.js:
 // an invalid plan never applies, dependent commands keep failing, and the error names the command.
 assert.equal(await page.locator('#open-ai').count(),0,'unused AI command button removed');assert.equal(await page.locator('#ai-dialog').count(),0,'unused AI dialog removed');
 const plan={title:'Recovery',summary:'',commands:[{op:'add',id:'bad',kind:'missing',position:[0,0,0]},{op:'transform',id:'bad',position:[1,0,0]},{op:'seek',time:2}]};
 const countBefore=await page.evaluate(()=>STUDIO.objects.length);
 const compileError=p=>page.evaluate(p=>{try{STUDIO.ai.compile(p);return'';}catch(e){return e.message;}},p);
 assert.match(await compileError(plan),/Command 1/);assert.equal(await page.evaluate(()=>STUDIO.objects.length),countBefore);
 assert.match(await compileError({...plan,commands:plan.commands.slice(1)}),/Command 1/,'dependent command still fails once the add is skipped');
 assert.equal(await compileError({...plan,commands:plan.commands.slice(2)}),'','remaining independent command validates');assert.equal(await page.evaluate(()=>STUDIO.objects.length),countBefore);
 // Drop on a clean character track. The actual drag/drop handlers bake real keys.
 await page.evaluate(()=>{const r=STUDIO.objects.find(x=>x.character);STUDIO.select(r);r.character.keys=[];STUDIO.seek(0);});
 await page.evaluate(()=>{const lane=document.querySelector('#pose-track'),rect=lane.getBoundingClientRect(),dt=new DataTransfer();dt.setData('application/x-studio-animation',JSON.stringify({type:'builtin',name:'wave'}));lane.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:rect.left+rect.width*.125}));});
 const count=await page.evaluate(()=>STUDIO.selected.character.keys.length);assert.ok(count>2,'drop bakes keys');
 await page.evaluate(()=>{const lane=document.querySelector('#pose-track'),rect=lane.getBoundingClientRect(),dt=new DataTransfer();dt.setData('application/x-studio-animation',JSON.stringify({type:'builtin',name:'wave'}));lane.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:rect.left+rect.width*.125}));});
 assert.equal(await page.evaluate(()=>STUDIO.selected.character.keys.length),count,'overlap preserves keys');
 let replies=['My wave','0, 8','A saved wave'];page.on('dialog',d=>d.accept(replies.shift()));await page.locator('#save-custom-animation').click();assert.equal(await page.locator('#custom-animation-list option').count(),2);
 await page.evaluate(()=>{STUDIO.selected.character.keys=[];STUDIO.seek(0);});await page.locator('#custom-animation-list').selectOption('0');await page.locator('#custom-animation-add').click();assert.equal(await page.evaluate(()=>STUDIO.selected.character.keys.length),count,'saved animation is reusable');
 await page.reload();await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:90000});assert.equal(await page.locator('#custom-animation-list option').count(),2,'saved animation survives reload');
 assert.deepEqual(errors,[]);console.log('PASS editor interactions, seek, drop, overlap and custom animation persistence');
}finally{await browser.close();}
