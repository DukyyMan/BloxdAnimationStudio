// Camera mode switching, visible camera object, Focus Camera, toggles,
// scrubbing/playback motion of the object, and editor/animation camera isolation.
import {launch,boot} from './browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await launch();
const page=await browser.newPage({viewport:{width:1365,height:768}});
await boot(page);
const results={};
const V=(fn,arg)=>page.evaluate(fn,arg);
// 1. Mode selector exists with both options and indicates the active mode.
const opts=await V(()=>[...document.querySelectorAll('#camera-mode option')].map(o=>o.value));
assert.deepEqual(opts,['first-person','scene'],'both camera modes offered');
assert.ok(await V(()=>!document.querySelector('#camera-mode').classList.contains('scene-active')),'first-person is the active mode initially');
// 2. Switch to Scene View: object appears, distinct, scaled, with direction+orientation.
await page.selectOption('#camera-mode','scene');
await page.waitForTimeout(200);
const scene1=await V(()=>{const w=STUDIO.cameraWorkspace;return{
  active:document.querySelector('#camera-mode').classList.contains('scene-active'),
  bodyVisible:w.body.visible,frustumVisible:w.frustum.visible,
  meshes:w.body.children.filter(o=>o.isMesh).length,
  arrows:w.body.children.filter(o=>o.type==='ArrowHelper').length,
  bodyScale:w.body.scale.x,bodyPos:w.body.position.toArray().map(n=>+n.toFixed(3)),
  equalsAnimCam:w.body.position.distanceTo(w.animation.position)<1e-6};});
assert.ok(scene1.active,'scene mode clearly indicated');
assert.ok(scene1.bodyVisible&&scene1.frustumVisible,'camera object and frustum visible in scene view');
assert.ok(scene1.meshes>=4&&scene1.arrows>=2,'recognizable body with direction and orientation indicators');
assert.ok(scene1.equalsAnimCam,'object pose equals the animation camera');
assert.ok(scene1.bodyScale>=.6,'object scaled to be findable');
results.scene=scene1;
// 3. Focus Camera moves the editor view toward the object without moving the animation camera.
const animBefore=await V(()=>STUDIO.camera.position.toArray());
await page.click('#focus-animation-camera');
await page.waitForTimeout(250);
const focused=await V(()=>{const w=STUDIO.cameraWorkspace;return{
  editorPos:w.editor.position.toArray(),
  onScreen:(()=>{const v=w.body.position.clone();v.project(w.editor);return v.z<1&&Math.abs(v.x)<1.2&&Math.abs(v.y)<1.2;})(),
  animUnchanged:w.animation.position.toArray().map(n=>+n.toFixed(5))};});
assert.ok(focused.onScreen,'camera object is in view after Focus camera');
assert.deepEqual(focused.animUnchanged,animBefore.map(n=>+n.toFixed(5)),'Focus never moves the animation camera');
results.focused=focused;
// 4. Show/hide controls for object and frustum.
await page.evaluate(()=>document.querySelector('[data-inspector="camera"]').click());
await page.waitForTimeout(120);
await page.evaluate(()=>{const t=document.querySelector('#camera-frustum-toggle');t.checked=false;t.dispatchEvent(new Event('change'));});
assert.ok(await V(()=>!STUDIO.cameraWorkspace.frustum.visible&&STUDIO.cameraWorkspace.body.visible),'frustum toggle hides only the frustum');
await page.evaluate(()=>{const t=document.querySelector('#camera-body-toggle');t.checked=false;t.dispatchEvent(new Event('change'));});
assert.ok(await V(()=>!STUDIO.cameraWorkspace.body.visible),'camera object toggle hides the body');
await page.evaluate(()=>{const t=document.querySelector('#camera-body-toggle');t.checked=true;t.dispatchEvent(new Event('change'));});
await page.evaluate(()=>{const t=document.querySelector('#camera-frustum-toggle');t.checked=true;t.dispatchEvent(new Event('change'));});
assert.ok(await V(()=>STUDIO.cameraWorkspace.body.visible&&STUDIO.cameraWorkspace.frustum.visible),'toggles restore visibility');
// 5. Scrubbing moves the object; playback travels through the scene.
const p0=await V(()=>STUDIO.cameraWorkspace.body.position.toArray());
await page.evaluate(()=>STUDIO.seek(4));
await page.waitForTimeout(150);
const p4=await V(()=>STUDIO.cameraWorkspace.body.position.toArray());
assert.ok(Math.hypot(...p0.map((n,i)=>n-p4[i]))>.05,'scrubbing moves the camera object');
await page.evaluate(()=>STUDIO.seek(0));
await page.evaluate(()=>STUDIO.setPlaying(true));
await page.waitForTimeout(700);
const pPlay=await V(()=>STUDIO.cameraWorkspace.body.position.toArray());
await page.evaluate(()=>STUDIO.setPlaying(false));
assert.ok(Math.hypot(...p4.map((n,i)=>n-pPlay[i]))>.05,'playback moves the camera object');
results.scrub={p0,p4};
// 6. Editor navigation never writes to the animation camera.
const before=await V(()=>({anim:STUDIO.camera.position.toArray(),editor:STUDIO.cameraWorkspace.editor.position.toArray()}));
await page.evaluate(()=>{const w=STUDIO.cameraWorkspace;w.editor.position.add(new STUDIO.THREE.Vector3(2,1,2));w.orbit.target.add(new STUDIO.THREE.Vector3(0,1,0));w.orbit.update();w.update();});
const after=await V(()=>({anim:STUDIO.camera.position.toArray()}));
assert.deepEqual(after.anim.map(n=>+n.toFixed(6)),before.anim.map(n=>+n.toFixed(6)),'moving the editor camera never moves the animation camera');
// 7. Transform the animation camera via Edit camera + gizmo; object follows.
await page.click('#edit-animation-camera');
await page.waitForTimeout(150);
assert.ok(await V(()=>STUDIO.cameraWorkspace.editing&&STUDIO.gizmo.object===STUDIO.camera),'Edit camera selects the animation camera for transforms');
const objBefore=await V(()=>STUDIO.cameraWorkspace.body.position.toArray());
await page.evaluate(()=>{STUDIO.camera.position.x+=2;STUDIO.cameraWorkspace.update();});
assert.ok(await V(b=>STUDIO.cameraWorkspace.body.position.x-b[0]>1.9,objBefore),'moving the animation camera updates the object');
await page.evaluate(()=>{STUDIO.camera.position.x-=2;STUDIO.cameraWorkspace.update();STUDIO.cameraWorkspace.editing=false;});
// 8. Back to first-person: viewport camera is the animation camera; object hidden.
await page.selectOption('#camera-mode','first-person');
await page.waitForTimeout(150);
assert.ok(await V(()=>STUDIO.cameraWorkspace.mode==='first-person'&&!STUDIO.cameraWorkspace.body.visible&&!STUDIO.cameraWorkspace.frustum.visible),'first-person hides scene-view helpers');
assert.ok(await V(()=>{const c=STUDIO.cameraWorkspace;return c.camera===c.animation;}),'first-person renders the animation camera');
// 9. First-person WASD still works.
await page.evaluate(()=>document.querySelector('#nav-mode').click());
await page.keyboard.down('w');await page.waitForFunction(()=>Math.hypot(...STUDIO.nav.state.velocity)>5,null,{timeout:5000});await page.keyboard.up('w');
assert.ok(await V(()=>STUDIO.nav.active),'fly navigation available in first-person');
await page.keyboard.press('n');
results.passed=true;
fs.mkdirSync('tests/results',{recursive:true});
fs.writeFileSync('tests/results/camera-object.json',JSON.stringify(results,null,2));
console.log('PASS camera modes, visible object, focus, toggles, scrub/playback isolation',results);
await browser.close();
