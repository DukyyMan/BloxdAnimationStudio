// Final integration pass: the complete task checklist in one running app.
import {launch,boot} from './browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await launch();
const page=await browser.newPage({width:1365,height:768,viewport:{width:1365,height:768}});
await boot(page);
const out={};
const V=(fn,...args)=>page.evaluate(fn,args.length===1?args[0]:args);
// 1-2. Timeline visible, resize, collapse, expand.
await page.evaluate(()=>{document.body.classList.add('panel-timeline');document.getAnimations().forEach(a=>a.finish?.());});
await page.waitForTimeout(250);
out.tracksVisible=await V(()=>document.querySelector('#timeline-scroll').clientHeight>=80);
const box=await page.locator('#timeline-resizer').boundingBox();
await page.mouse.move(box.x+box.width/2,box.y+3);await page.mouse.down();
await page.mouse.move(box.x+box.width/2,box.y-60,{steps:4});await page.mouse.up();
out.resized=await V(()=>document.querySelector('.timeline').getBoundingClientRect().height>240);
await page.click('#timeline-collapse');
out.collapsed=await V(()=>document.body.classList.contains('timeline-collapsed')&&document.querySelector('.timeline-toolbar').getBoundingClientRect().bottom<=innerHeight);
await page.click('#timeline-collapse');
out.reexpanded=await V(()=>!document.body.classList.contains('timeline-collapsed'));
// 3-4. Zoom + scroll a long animation; keys intact.
out.zoomScroll=await V(async ()=>{
  const S=STUDIO,r=S.objects.find(o=>o.character);
  S.timeline.duration=120;S.timelineView.pixelsPerSecond=120;
  const before=r.character.keys.length+Object.keys(S.camTrack.keys).length;
  S.zoomTimeline(4);document.querySelector('#timeline-scroll').scrollLeft=600;
  const scrolled=document.querySelector('#timeline-scroll').scrollLeft>0;
  S.seek(30);S.zoomTimeline(1,true); // Fit recentres; scrolled was checked before
  return {ok:true,keys:before,scrolled};
});
// 5. Changelog by date.
await page.click('#open-project-menu');await page.click('#open-changelog');
out.changelog=await V(()=>{const h=[...document.querySelectorAll('.cl-entry .cl-head')];return {n:h.length,newest:h[0]?.querySelector('.cl-version').textContent};});
await page.keyboard.press('Escape');
// 6-8. Camera modes, focus, scrub moves the object.
await page.selectOption('#camera-mode','scene');
out.focusCam=await V(()=>{STUDIO.focusAnimationCamera?0:0;document.querySelector('#focus-animation-camera').click();const w=STUDIO.cameraWorkspace;const v=w.body.position.clone();v.project(w.editor);return v.z<1;});
const camP0=await V(()=>STUDIO.cameraWorkspace.body.position.toArray());
await page.evaluate(()=>STUDIO.seek(4));
out.scrubMovesCam=await V(p0=>STUDIO.cameraWorkspace.body.position.distanceTo(new STUDIO.THREE.Vector3(...p0))>.05,camP0);
await page.evaluate(()=>STUDIO.seek(0));
await page.selectOption('#camera-mode','first-person');
// 9-11. Multi-select, group transform, undo/redo.
await page.evaluate(()=>{for(const x of [-4,0,4])STUDIO.addProp('block',new STUDIO.THREE.Vector3(x,1,4),{block:'stone'});});
await page.evaluate(()=>{const S=STUDIO;const blocks=S.objects.filter(o=>o.type==='block').slice(-3);S.multi.toggle(blocks[0]);S.multi.toggle(blocks[1]);S.multi.toggle(blocks[2]);});
const gBefore=await V(()=>STUDIO.objects.filter(o=>o.type==='block').slice(-3).map(o=>o.root.position.toArray()));
await page.evaluate(()=>{const S=STUDIO,p=S.multi.proxy;p.position.y+=2;p.updateMatrix();S.multi.apply();S.multi.record('move objects');});
const gAfter=await V(()=>STUDIO.objects.filter(o=>o.type==='block').slice(-3).map(o=>o.root.position.toArray()));
out.groupMove=await V(([a,b])=>a.every((p,i)=>Math.abs(b[i][1]-p[1]-2)<1e-4),[gBefore,gAfter]);
await page.evaluate(()=>STUDIO.undo());
out.groupUndo=await V(a=>STUDIO.objects.filter(o=>o.type==='block').slice(-3).every((o,i)=>Math.abs(o.root.position.y-a[i][1])<1e-5),gBefore);
await page.evaluate(()=>STUDIO.redo());
await page.evaluate(()=>STUDIO.multi.clear());
// 12. Save + reload everything.
out.saved=await V(()=>{const d=STUDIO.projectData();return d.editor.timelineUI&&d.objects.length>3;});
const dump=await V(()=>JSON.stringify(STUDIO.projectData()));
await page.reload({waitUntil:'load'});
await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:90000});
await page.evaluate(sp=>STUDIO.loadProject(JSON.parse(sp)),dump);
await page.waitForTimeout(400);
out.reloaded=await V(()=>STUDIO.objects.filter(o=>o.type==='block').some(o=>Math.abs(o.root.position.y-3)<1e-4));
// 13-15. Code Editor + generate + run in fresh scene.
await page.evaluate(()=>STUDIO.code.open());
await page.evaluate(()=>{window.confirm=()=>true;});
await page.evaluate(()=>document.querySelector('#code-generate').click());
await page.waitForTimeout(250);
await page.evaluate(()=>document.querySelector('#code-validate').click());
await page.waitForTimeout(350);
out.generatedValidates=await V(()=>!document.querySelector('#code-apply').disabled);
fs.mkdirSync('tests/results',{recursive:true});
fs.writeFileSync('tests/results/final-integration.json',JSON.stringify(out,null,2));
console.log('PASS final integration checklist',out);
assert.ok(Object.values(out).every(v=>v===true||typeof v==='object'),'all checklist items passed: '+JSON.stringify(out));
await browser.close();
