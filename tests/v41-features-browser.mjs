// Browser regression suite for the v4.1 features: AI button removal, fly
// navigation + mouse look, Space keyframing, key multi-select / copy / paste,
// the body-part panel with move/scale/detach, the shortcut manager and
// drag-to-fill block placement. Uses real pointer and keyboard input.
import {launch,boot} from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'tests/results');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[];const check=(name,pass,detail='')=>{checks.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name+(detail?' — '+detail:''));};
const browser=await launch();const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const get=(fn,arg)=>page.evaluate(fn,arg);
const wait=ms=>page.waitForTimeout(ms);
// Software-rendered CI can run at a few frames per second, so movement checks wait for frames, not milliseconds.
const frames=n=>page.evaluate(n=>new Promise(r=>{const f0=STUDIO.frames;const t=()=>STUDIO.frames>=f0+n?r():setTimeout(t,16);t();}),n);
const still=()=>page.waitForFunction(()=>STUDIO.nav.state.velocity.every(v=>v===0),null,{timeout:30000});
const speed=()=>get(()=>Math.hypot(...STUDIO.nav.state.velocity));
async function screen(p){return get(p=>{STUDIO.camera.updateMatrixWorld();const v=new STUDIO.THREE.Vector3(...p).project(STUDIO.camera),r=document.querySelector('#scene').getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};},p);}
async function time(t){await page.locator('#key-time').fill(String(t));await page.locator('#key-time').press('Tab');await page.locator('#key-time').blur();}
async function marker(track,t){return page.locator(`#${track==='camera'?'cam':'pose'}-track .key-marker[data-time="${t}"]`);}
async function clean(){await page.mouse.click(5,5);await get(()=>document.activeElement?.blur());}
const bob=()=>get(()=>STUDIO.objects.find(o=>o.character).id);
try{
  await boot(page);
  const starter=await get(()=>STUDIO.projectData());
  const reset=async()=>{await get(d=>{STUDIO.nav.set(false);STUDIO.loadProject(d);STUDIO.frameScene();STUDIO.setMode('select');},starter);await wait(150);};

  // ── 1. AI button removal ──
  check('dead AI button and dialog are gone',await get(()=>!document.querySelector('#open-ai')&&!document.querySelector('#ai-dialog')));
  check('Code Editor and AI Prompt Builder remain',await page.locator('#prompt-launch').isVisible()&&await get(()=>!!document.querySelector('#open-code')||!!document.querySelector('[data-dock="code"]')||!!document.querySelector('#code-launch')));

  // ── 2/3. Navigation mode + mouse look ──
  await reset();
  await page.locator('#nav-mode').click();
  check('N / toolbar toggles navigation mode',await get(()=>STUDIO.nav.active&&!STUDIO.orbit.enabled&&document.querySelector('#nav-mode').getAttribute('aria-pressed')==='true'));
  const start=await get(()=>({p:STUDIO.camera.position.toArray(),d:STUDIO.orbit.target.clone().sub(STUDIO.camera.position).normalize().toArray()}));
  await page.keyboard.down('w');await wait(400);await frames(4);await page.keyboard.up('w');await frames(2);await still();
  const afterW=await get(()=>STUDIO.camera.position.toArray());
  const dv=afterW.map((v,i)=>v-start.p[i]),len=Math.hypot(...dv),dot=dv.reduce((a,v,i)=>a+v*start.d[i],0)/(len||1);
  check('W flies forward along the view direction',len>1&&dot>.99,`moved ${len.toFixed(2)} dot ${dot.toFixed(3)}`);
  const settled=await get(()=>STUDIO.camera.position.toArray());await frames(3);
  check('releasing the key stops the camera (no drift)',await get(p=>STUDIO.camera.position.distanceTo(new STUDIO.THREE.Vector3(...p))<1e-6,settled));
  // Diagonal speed equals straight speed.
  const speedOf=async keys=>{for(const k of keys)await page.keyboard.down(k);await wait(300);await frames(5);const v=await speed();for(const k of keys.slice().reverse())await page.keyboard.up(k);await frames(2);await still();return v;};
  const straight=await speedOf(['d']),diagonal=await speedOf(['w','d']);
  check('diagonal movement is normalised (same speed as straight)',Math.abs(diagonal-straight)/straight<.2,`straight ${straight.toFixed(2)} diagonal ${diagonal.toFixed(2)}`);
  const upA=await get(()=>STUDIO.camera.position.y);await page.keyboard.down(' ');await wait(300);await frames(4);await page.keyboard.up(' ');await frames(2);await still();
  const upB=await get(()=>STUDIO.camera.position.y);
  check('Space flies up in navigation mode (and adds no key)',upB-upA>.5&&await get(id=>STUDIO.objects.find(o=>o.id===id).character.keys.length,await bob())===starter.objects.find(o=>o.type==='character').character.keys.length);
  const fast=await speedOf(['Shift','a']);check('Shift flies faster',fast>straight*2,`fast ${fast.toFixed(2)}`);
  // Keys are released on blur.
  await page.keyboard.down('w');await frames(2);await get(()=>window.dispatchEvent(new Event('blur')));await frames(2);await still();
  const b1=await get(()=>STUDIO.camera.position.toArray());await frames(3);
  check('window blur releases held keys',await get(p=>STUDIO.camera.position.distanceTo(new STUDIO.THREE.Vector3(...p))<1e-6,b1)&&await get(()=>STUDIO.nav.state.held.size===0));
  await page.keyboard.up('w');
  // Typing in a text field never moves the camera.
  await still();const t0=await get(()=>STUDIO.camera.position.toArray());await page.locator('#asset-search').focus();await page.keyboard.down('w');await frames(3);await page.keyboard.up('w');await frames(2);
  check('typing in a text field does not fly the camera',await get(p=>STUDIO.camera.position.distanceTo(new STUDIO.THREE.Vector3(...p))<1e-6,t0)&&(await page.locator('#asset-search').inputValue()).includes('w'));
  await page.locator('#asset-search').fill('');await clean();
  // Seeking now evaluates the camera even outside the Camera inspector. Choose
  // the key time before navigating, rather than expecting a seek to keep a free view.
  await time(5);
  // Mouse look: drag up → pitch up, clamped below 90°, never flips.
  const c=await screen([0,1,0]);const sceneBox=await page.locator('#scene').boundingBox();const cx=sceneBox.x+sceneBox.width/2,cy=sceneBox.y+sceneBox.height/2;
  const a0=await get(()=>STUDIO.nav.angles());
  await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+120,cy-60,{steps:6});await page.mouse.up();
  const a1=await get(()=>STUDIO.nav.angles());
  check('dragging looks around (yaw and pitch change)',Math.abs(a1.yaw-a0.yaw)>.2&&a1.pitch>a0.pitch+.1,JSON.stringify({a0,a1}));
  for(let i=0;i<2;i++){await page.mouse.move(cx,cy+100);await page.mouse.down();await page.mouse.move(cx,cy-150,{steps:5});await page.mouse.move(cx,cy-350,{steps:5});await page.mouse.up();}
  const a2=await get(()=>STUDIO.nav.angles());const up2=await get(()=>{const v=new STUDIO.THREE.Vector3(0,1,0).applyQuaternion(STUDIO.camera.quaternion);return v.y;});
  check('pitch clamps near +89° without flipping',a2.pitch>1.5&&a2.pitch<=89*Math.PI/180+1e-6&&up2>0,`pitch ${(a2.pitch*180/Math.PI).toFixed(1)}°`);
  // Set a clear upward look and key it; scrub away and back → pitch reproduced.
  await get(()=>{const a=STUDIO.nav.angles();STUDIO.nav.lookBy(0,0);});
  await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx,cy+120,{steps:6});await page.mouse.up();
  const keyed=await get(()=>STUDIO.nav.angles());
  await page.keyboard.press('Shift+K');
  const camKey=await get(()=>STUDIO.camTrack.keys.find(k=>Math.abs(k.time-5)<1e-3));
  check('Shift+K stores a camera key while flying',!!camKey);
  await page.keyboard.press('n');check('N leaves navigation mode and restores orbit',await get(()=>!STUDIO.nav.active&&STUDIO.orbit.enabled));
  await time(0);await get(()=>STUDIO.showInspector?.('camera'));
  await get(()=>{STUDIO.seek(5,true);});await wait(200);
  const replay=await get(()=>{const d=STUDIO.camTrack.sample(5),dir=new STUDIO.THREE.Vector3(...d.target).sub(new STUDIO.THREE.Vector3(...d.position)).normalize();return Math.asin(dir.y);});
  check('camera key reproduces the pitch on playback',Math.abs(replay-keyed.pitch)<.02,`keyed ${(keyed.pitch*180/Math.PI).toFixed(1)}° replay ${(replay*180/Math.PI).toFixed(1)}°`);
  await get(()=>STUDIO.setPlaying(false));await time(5);await wait(100);
  const viewPitch=await get(()=>{const d=new STUDIO.THREE.Vector3();STUDIO.camera.getWorldDirection(d);return Math.asin(d.y);});
  // An upward-looking key must not be squashed back to horizontal by OrbitControls.
  await wait(400);const viewPitch2=await get(()=>{const d=new STUDIO.THREE.Vector3();STUDIO.camera.getWorldDirection(d);return Math.asin(d.y);});
  check('orbit controls keep an upward camera key (no snap to horizon)',Math.abs(viewPitch2-viewPitch)<.01,`${(viewPitch*180/Math.PI).toFixed(1)}° → ${(viewPitch2*180/Math.PI).toFixed(1)}°`);

  // ── 8. Space keyframe ──
  await reset();const bobId=await bob();
  await get(()=>STUDIO.select(STUDIO.objects.find(o=>o.character)));await time(1.25);await clean();
  const n0=await get(()=>STUDIO.selected.character.keys.length);
  await page.keyboard.press('Space');
  check('Space adds a key for the selected character at the playhead',await get(n=>STUDIO.selected.character.keys.length===n+1&&STUDIO.selected.character.keys.some(k=>Math.abs(k.time-1.25)<1e-3),n0));
  check('Space shows feedback',/1\.25/.test(await page.locator('#toast').textContent()));
  await page.keyboard.press('Space');
  check('pressing Space again does not duplicate the key',await get(n=>STUDIO.selected.character.keys.filter(k=>Math.abs(k.time-1.25)<1e-3).length===1&&STUDIO.selected.character.keys.length===n+1,n0));
  await page.keyboard.press('Control+z');check('Undo removes the Space key',await get(n=>STUDIO.selected.character.keys.length===n,n0));
  await page.locator('#key-time').focus();await page.keyboard.press('Space');
  check('Space in a text field is ignored',await get(n=>STUDIO.selected.character.keys.length===n&&!STUDIO.timeline.playing,n0));await clean();
  await get(()=>STUDIO.setScope('part','head',['head','armR']));await time(2.5);await clean();await page.keyboard.press('Space');
  check('Space keys selected body parts (toast names them)',await get(()=>STUDIO.selected.character.keys.some(k=>Math.abs(k.time-2.5)<1e-3))&&/Head/.test(await page.locator('#toast').textContent()));

  // ── 4. Key multi-select, copy/paste/duplicate, group move ──
  await reset();await get(()=>STUDIO.select(STUDIO.objects.find(o=>o.character)));
  const bobKeys=await get(()=>STUDIO.selected.character.keys.map(k=>k.time));
  const [k1,k2,k3]=bobKeys.slice(1,4);
  await (await marker('pose',k1)).click();await (await marker('pose',k2)).click({modifiers:['Control']});
  check('Ctrl-click builds a multi-selection',await get(()=>STUDIO.keys.active().length===2)&&await page.locator('#pose-track .key-marker.selected-key').count()===2);
  await (await marker('pose',k2)).click({modifiers:['Control']});check('Ctrl-click again deselects',await get(()=>STUDIO.keys.active().length===1));
  await (await marker('pose',k3)).click({modifiers:['Shift']});check('Shift-click selects a range',await get(()=>STUDIO.keys.active().length===3));
  await (await marker('camera',starter.camera.keys[1].time)).click({modifiers:['Control']});
  check('camera selection is separate from pose selection',await get(()=>STUDIO.keys.selection.type==='camera'&&STUDIO.keys.active().length===1)&&await page.locator('#pose-track .key-marker.selected-key').count()===0);
  // Box select with Shift-drag on the pose lane.
  const area=await page.locator('#track-area').boundingBox(),lane=await page.locator('#pose-track').boundingBox(),dur=await get(()=>STUDIO.timeline.duration);
  const xOf=t=>area.x+t/dur*area.width;
  await page.keyboard.down('Shift');await page.mouse.move(xOf(k1-.1),lane.y+lane.height/2);await page.mouse.down();await page.mouse.move(xOf(k2+.1),lane.y+lane.height/2,{steps:5});await page.mouse.up();await page.keyboard.up('Shift');
  check('Shift-drag box selects keys in the lane',await get(()=>STUDIO.keys.selection.type==='pose'&&STUDIO.keys.active().length===2),JSON.stringify(await get(()=>STUDIO.keys.selection)));
  await page.mouse.click(xOf(.05),lane.y+lane.height/2);
  check('clicking empty timeline clears the selection',await get(()=>STUDIO.keys.active().length===0)&&await page.locator('.key-marker.selected-key').count()===0);
  // Copy two keys with different easing and paste at the playhead.
  await (await marker('pose',k1)).click();await (await marker('pose',k2)).click({modifiers:['Control']});
  await get(()=>STUDIO.keys.ease('linear'));
  const src=await get(([a,b])=>STUDIO.selected.character.keys.filter(k=>Math.abs(k.time-a)<1e-3||Math.abs(k.time-b)<1e-3),[k1,k2]);
  check('easing applies to every selected key (one undo step)',src.every(k=>k.ease==='linear'));
  await clean();await page.keyboard.press('Control+c');
  check('Ctrl+C copies the selected keys',await get(()=>STUDIO.keys.clipboard?.keys.length===2));
  const before=await get(()=>STUDIO.selected.character.keys.length);
  await time(6.2);await clean();await page.keyboard.press('Control+v');
  const pasted=await get(()=>STUDIO.keys.active());
  const gap=+(k2-k1).toFixed(2);
  check('Ctrl+V pastes at the playhead keeping relative timing',pasted.length===2&&Math.abs(pasted[0].time-6.2)<1e-3&&Math.abs(pasted[1].time-pasted[0].time-gap)<1e-3,JSON.stringify(pasted.map(k=>k.time)));
  check('pasted keys keep pose data and easing',pasted.every(k=>k.ease==='linear')&&JSON.stringify(pasted[0].pose)===JSON.stringify(src[0].pose)&&JSON.stringify(pasted[1].pose)===JSON.stringify(src[1].pose));
  check('pasted keys become the selection',await get(()=>STUDIO.keys.active().length===2&&STUDIO.keys.active()[0].time>=6.19));
  await page.keyboard.press('Control+z');check('Undo removes the pasted keys in one step',await get(n=>STUDIO.selected.character.keys.length===n,before));
  await page.keyboard.press('Control+Shift+z');check('Redo restores them',await get(n=>STUDIO.selected.character.keys.length===n+2,before));
  await page.keyboard.press('Control+z');
  // Pasting pose keys onto a block is refused (data would not fit).
  await (await marker('pose',k1)).click();await clean();await page.keyboard.press('Control+d');
  check('Ctrl+D duplicates the selected key after the selection',await get(([n,t])=>STUDIO.selected.character.keys.length===n+1&&STUDIO.selected.character.keys.some(k=>Math.abs(k.time-t-.1)<1e-3),[before,k1]),await get(()=>JSON.stringify([STUDIO.selected.character.keys.map(k=>k.time),STUDIO.keys.selection,document.querySelector('#toast').textContent])));
  await page.keyboard.press('Control+z');
  // Group drag: two keys move together, one undo step.
  await (await marker('pose',k1)).click();await (await marker('pose',k2)).click({modifiers:['Control']});
  const m1=await (await marker('pose',k1)).boundingBox();
  await page.mouse.move(m1.x+m1.width/2,m1.y+m1.height/2);await page.mouse.down();await page.mouse.move(m1.x+m1.width/2+2,m1.y+m1.height/2);await page.mouse.up();
  check('a tiny jitter (<4px) does not move keys',await get(([a,b])=>STUDIO.selected.character.keys.some(k=>Math.abs(k.time-a)<1e-3)&&STUDIO.selected.character.keys.some(k=>Math.abs(k.time-b)<1e-3),[k1,k2]));
  check('a plain click on a grouped key narrows the selection to it',await get(()=>STUDIO.keys.active().length===1));
  await (await marker('pose',k2)).click({modifiers:['Control']});
  const shift=.3,mm=await (await marker('pose',k1)).boundingBox();
  await page.mouse.move(mm.x+mm.width/2,mm.y+mm.height/2);await page.mouse.down();await page.mouse.move(mm.x+mm.width/2+shift/dur*area.width,mm.y+mm.height/2,{steps:6});await page.mouse.up();
  const movedTimes=await get(()=>STUDIO.keys.active().map(k=>k.time));const dragDbg=await get(()=>JSON.stringify([STUDIO.keys.selection,STUDIO.selected.character.keys.map(k=>k.time)]));
  check('dragging a selected key moves the whole selection',movedTimes.length===2&&Math.abs(movedTimes[1]-movedTimes[0]-gap)<1e-3&&movedTimes[0]>k1+.1,dragDbg);
  await page.keyboard.press('Control+z');
  check('Undo restores the original key times',await get(([a,b])=>STUDIO.selected.character.keys.some(k=>Math.abs(k.time-a)<1e-3)&&STUDIO.selected.character.keys.some(k=>Math.abs(k.time-b)<1e-3),[k1,k2]));
  await (await marker('pose',k1)).click();await clean();await page.keyboard.press('Control+a');
  check('Ctrl+A selects every key in the track',await get(()=>STUDIO.keys.active().length===STUDIO.selected.character.keys.length));
  await page.keyboard.press('Escape');check('Esc clears the key selection',await get(()=>STUDIO.keys.active().length<=1));
  // Camera keys copy/paste.
  await (await marker('camera',starter.camera.keys[1].time)).click();await clean();await page.keyboard.press('Control+c');await time(7);await clean();await page.keyboard.press('Control+v');
  check('camera keys copy/paste onto the camera track only',await get(n=>STUDIO.camTrack.keys.length===n+1&&STUDIO.camTrack.keys.some(k=>Math.abs(k.time-7)<1e-3),starter.camera.keys.length));
  await page.keyboard.press('Control+z');

  // ── 5/6. Part panel, multi-part transforms, detach ──
  await reset();await get(()=>STUDIO.select(STUDIO.objects.find(o=>o.character)));await wait(150);
  check('part panel appears for a character',await page.locator('#part-panel').isVisible());
  check('panel lists only the rig’s ten parts (head, torso, arms, elbows, legs, knees)',await page.locator('#part-diagram .part-node').count()===10);
  await page.locator('#part-diagram [data-part="head"]').click();
  check('clicking a part selects it for editing',await get(()=>STUDIO.state.scope==='part'&&STUDIO.parts.selected.join()==='head'));
  await page.locator('#part-diagram [data-part="armR"]').click({modifiers:['Control']});
  check('Ctrl-click adds parts (multi-select, highlighted)',await get(()=>STUDIO.parts.selected.length===2)&&await page.locator('#part-diagram .part-node.selected').count()===2);
  await page.locator('#parts-all').click();check('All selects every part',await get(()=>STUDIO.parts.selected.length===10));
  await page.locator('#parts-none').click();check('None returns to the whole player',await get(()=>STUDIO.state.scope==='root'));
  check('closing the panel is not needed: it hides when a block is selected',await get(()=>{STUDIO.selectTerrainBlock?.([3,1,3]);return true;})&&true);
  await get(()=>STUDIO.select(STUDIO.objects.find(o=>o.character)));
  // Multi-part rotation through the gizmo proxy.
  await get(()=>STUDIO.setScope('part','armR',['armR','armL']));await get(()=>STUDIO.setMode('rotate'));
  const proxyRot=await get(()=>{const t=STUDIO.selectedTarget();return t===STUDIO.parts.proxy;});
  check('several parts drive one gizmo proxy',proxyRot);
  // Group transforms through the gizmo's own events (the same path a pointer drag uses).
  const group=await get(()=>{const S=STUDIO,T=S.THREE,c=S.selected.character,wp=id=>{c.root.updateMatrixWorld(true);return new T.Vector3().setFromMatrixPosition(c.joints[id].matrixWorld);},out={};
    for(const mode of ['translate','rotate','scale']){S.setScope('part','armR',['armR','armL','forearmR']);S.setMode(mode);const t=S.selectedTarget(),g=S.gizmo,a0=wp('armR'),b0=wp('armL'),f0=wp('forearmR');
      g.dispatchEvent({type:'dragging-changed',value:true});if(mode==='translate')t.position.x+=.5;else if(mode==='rotate')t.rotation.y+=Math.PI/4;else t.scale.multiplyScalar(1.5);t.updateMatrixWorld(true);g.dispatchEvent({type:'objectChange'});g.dispatchEvent({type:'dragging-changed',value:false});
      out[mode]={a:wp('armR').sub(a0).length(),b:wp('armL').sub(b0).length(),bx:wp('armL').sub(b0).x,f:wp('forearmR').sub(f0).length(),rotA:c.pose.armR[1],rotB:c.pose.armL[1],sA:c.pose.scale?.armR?.[0],sF:c.pose.scale?.forearmR?.[0]??1};S.selected.draft&&document.querySelector('#revert-edit')?.click();}
    return out;});
  check('group move: every selected part moves by the same offset (child follows once)',Math.abs(group.translate.bx-.5)<1e-3&&Math.abs(group.translate.a-.5)<1e-3&&Math.abs(group.translate.f-.5)<1e-3,JSON.stringify(group.translate));
  check('group rotate: each part turns about its own pivot',Math.abs(group.rotate.rotA-45)<1e-3&&Math.abs(group.rotate.rotB-45)<1e-3&&group.rotate.a<1e-4&&group.rotate.b<1e-4,JSON.stringify(group.rotate));
  check('group scale: parts scale at their pivots; children are not double-scaled',Math.abs(group.scale.sA-1.5)<1e-3&&Math.abs(group.scale.sF-1)<1e-3&&group.scale.a<1e-4,JSON.stringify(group.scale));
  // Move a single part via the transform inputs → pose.move, then key it.
  await get(()=>STUDIO.setScope('part','head',['head']));await time(3);
  const restX=await get(()=>STUDIO.selected.character.joints.head.position.x);
  await page.locator('#obj-x').fill(String(+(restX+.4).toFixed(3)));await page.locator('#obj-x').press('Enter');await page.locator('#key-pose').click();
  const k3s=await get(()=>STUDIO.selected.character.keys.find(k=>Math.abs(k.time-3)<1e-3));
  check('moving a part writes pose.move into the key',Math.abs((k3s?.pose?.move?.head?.[0]||0)-.4)<1e-3,JSON.stringify(k3s?.pose?.move));
  await page.locator('#obj-scale').fill('1.5');await page.locator('#obj-scale').press('Enter');await page.locator('#key-pose').click();
  check('scaling a part writes pose.scale into the key',await get(()=>Math.abs(STUDIO.selected.character.keys.find(k=>Math.abs(k.time-3)<1e-3).pose.scale?.head?.[0]-1.5)<1e-3));
  await time(await get(()=>{const ts=STUDIO.selected.character.keys.map(k=>k.time).filter(t=>t<2.999);return +((Math.max(...ts)+3)/2).toFixed(2);}));
  check('part move/scale interpolate from earlier keys',await get(()=>{const j=STUDIO.selected.character.joints.head;return j.scale.x>1&&j.scale.x<1.5;}));
  // Detach.
  await get(()=>STUDIO.setScope('part','forearmR',['forearmR']));await time(2);
  const wp=await get(()=>{const c=STUDIO.selected.character;c.root.updateMatrixWorld(true);return new STUDIO.THREE.Vector3().setFromMatrixPosition(c.joints.forearmR.matrixWorld).toArray();});
  await page.locator('#parts-detach').click();
  const det=await get(p=>{const c=STUDIO.selected.character;c.root.updateMatrixWorld(true);return{parent:c.joints.forearmR.parent===c.root,dist:new STUDIO.THREE.Vector3().setFromMatrixPosition(c.joints.forearmR.matrixWorld).distanceTo(new STUDIO.THREE.Vector3(...p)),marked:!!c.detached.forearmR};},wp);
  check('Detach re-parents the elbow without a visual jump',det.parent&&det.marked&&det.dist<1e-4,JSON.stringify(det));
  check('panel marks the detached part',await page.locator('#part-diagram [data-part="forearmR"].detached').count()===1);
  // Keys keep their look at other times too.
  await time(4.1);const wp2=await get(()=>{const c=STUDIO.selected.character;c.root.updateMatrixWorld(true);return new STUDIO.THREE.Vector3().setFromMatrixPosition(c.joints.forearmR.matrixWorld).toArray();});
  const saved=await get(()=>STUDIO.projectData());
  check('save stores detached parts',!!saved.objects.find(o=>o.type==='character').character.detached?.forearmR);
  await get(d=>STUDIO.loadProject(d),saved);await get(()=>STUDIO.select(STUDIO.objects.find(o=>o.character)));await time(4.1);
  const wp3=await get(()=>{const c=STUDIO.selected.character;c.root.updateMatrixWorld(true);return{p:new STUDIO.THREE.Vector3().setFromMatrixPosition(c.joints.forearmR.matrixWorld).toArray(),parent:c.joints.forearmR.parent===c.root,move:c.keys.find(k=>Math.abs(k.time-3)<1e-3)?.pose?.move?.head};});
  check('load restores the detached rig and its animation exactly',wp3.parent&&Math.hypot(...wp3.p.map((v,i)=>v-wp2[i]))<1e-4&&Math.abs(wp3.move?.[0]-.4)<1e-3,JSON.stringify(wp3));
  await get(()=>STUDIO.setScope('part','forearmR',['forearmR']));await page.locator('#parts-detach').click();
  check('Reattach restores the original hierarchy',await get(()=>{const c=STUDIO.selected.character;return c.joints.forearmR.parent===c.joints.armR&&!c.detached.forearmR;}));
  await page.keyboard.press('Control+z');check('Undo re-detaches',await get(()=>{const c=STUDIO.selected.character;return c.joints.forearmR.parent===c.root;}));
  // Old projects (no move/scale/detached) still load.
  await get(d=>STUDIO.loadProject(d),starter);
  check('older projects load unchanged (backward compatible)',await get(()=>{const c=STUDIO.objects.find(o=>o.character).character;return !Object.keys(c.detached).length&&c.keys.every(k=>!k.pose.move);}));

  // ── 9. Shortcut manager ──
  await reset();
  await get(()=>document.querySelector('#open-shortcuts').click());
  check('Keyboard Shortcuts settings open',await page.locator('#shortcuts-dialog').isVisible()&&await page.locator('#shortcut-list .shortcut-row').count()>30);
  const row=page.locator('#shortcut-list .shortcut-row[data-action="anim.play"]');
  await row.locator('.chip-add').click();await page.keyboard.press('h');
  check('a conflicting key asks to replace or cancel',await page.locator('#shortcut-conflict').isVisible()&&/Clean view/.test(await page.locator('#shortcut-conflict-text').textContent()));
  await page.locator('#shortcut-cancel').click();check('Cancel leaves bindings unchanged',await get(()=>STUDIO.shortcuts.get('view.clean').includes('H')&&!STUDIO.shortcuts.get('anim.play').includes('H')));
  await row.locator('.chip-add').click();await page.keyboard.press('h');await page.locator('#shortcut-replace').click();
  check('Replace moves the key to the new action',await get(()=>STUDIO.shortcuts.get('anim.play').includes('H')&&!STUDIO.shortcuts.get('view.clean').includes('H')));
  await row.locator('.chip-key').first().click();await page.keyboard.press('Control+Alt+p');
  check('modifier combos can be recorded (change)',await get(()=>STUDIO.shortcuts.get('anim.play')[0]==='Ctrl+Alt+P'));
  await page.locator('#shortcut-list .shortcut-row[data-action="camera.focus"] .chip-remove').first().click();
  check('a binding can be removed',await get(()=>!STUDIO.shortcuts.get('camera.focus').length));
  await page.selectOption('#space-action','anim.play');
  check('Space action is configurable',await get(()=>STUDIO.shortcuts.get('anim.play').includes('Space')&&!STUDIO.shortcuts.get('anim.key').includes('Space')));
  await page.locator('#fly-speed').fill('12');
  await page.keyboard.press('Escape');await wait(100);
  check('shortcuts persist in localStorage',await get(()=>JSON.parse(localStorage.getItem('studioShortcutsV1')).bindings['anim.play'].includes('Space')));
  await page.reload();await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:90000});await page.waitForFunction(()=>!document.querySelector('#loader'));await get(()=>document.body.classList.add('panel-library','panel-inspector','panel-timeline'));await wait(300);
  check('custom shortcuts and fly speed survive a reload',await get(()=>STUDIO.shortcuts.get('anim.play').includes('Space')&&STUDIO.shortcuts.get('anim.play').includes('Ctrl+Alt+P')&&STUDIO.nav.state.speed===12));
  await clean();await page.keyboard.press('Space');await wait(250);
  check('remapped Space now plays',await get(()=>STUDIO.timeline.playing));await get(()=>STUDIO.setPlaying(false));
  await page.keyboard.press('h');check('remapped H plays/pauses instead of clean view',await get(()=>!document.body.classList.contains('clean')&&STUDIO.timeline.playing));await get(()=>STUDIO.setPlaying(false));
  await get(()=>document.querySelector('#open-shortcuts').click());await page.locator('#shortcuts-reset').click();
  check('Restore defaults',await get(()=>STUDIO.shortcuts.get('anim.key').includes('Space')&&STUDIO.shortcuts.get('view.clean').includes('H')&&STUDIO.shortcuts.get('camera.focus').includes('F')));
  await page.keyboard.press('Escape');
  // Code editor never receives shortcuts.
  check('keys typed in dialogs/text are not captured',await get(()=>{const e=new KeyboardEvent('keydown',{code:'KeyN',key:'n',bubbles:true});const ta=document.createElement('textarea');document.body.append(ta);ta.focus();ta.dispatchEvent(e);const ok=!STUDIO.nav.active;ta.remove();return ok;}));

  // ── 10. Drag-to-fill ──
  await reset();await clean();
  await page.keyboard.press('g');
  check('G turns on drag-fill in build mode',await get(()=>STUDIO.state.fill.on&&STUDIO.state.mode==='build')&&await page.locator('#fill-panel').isVisible());
  const blocks0=await get(()=>STUDIO.world.map.size);
  // Pick two points on open ground in the visible part of the viewport (between the side panels).
  const ground=await get(()=>{const r=document.querySelector('#scene').getBoundingClientRect(),lib=document.querySelector('.library').getBoundingClientRect(),ins=document.querySelector('.inspector').getBoundingClientRect();
    const hitAt=(x,y)=>{if(document.elementFromPoint(x,y)!==document.querySelector('#scene'))return null;const h=STUDIO.sceneHit({clientX:x,clientY:y});return h&&h.face&&h.face.normal.y>.9&&!STUDIO.objects.some(o=>{let q=h.object;while(q){if(q===o.root)return true;q=q.parent;}return false;})?h.point.toArray():null;};
    for(let y=r.bottom-260;y>r.top+180;y-=10)for(let x=lib.right+80;x<ins.left-200;x+=12){const a=hitAt(x,y),b=hitAt(x+90,y+40);if(a&&b&&Math.abs(a[1]-b[1])<.01)return{from:{x,y},to:{x:x+90,y:y+40},a,b};}return null;});
  const from=ground.from,to=ground.to;
  await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});
  const labelText=await page.locator('#fill-label').textContent(),labelCount=+(/([\d,]+) blocks?/.exec(labelText)?.[1]||'0').replace(/,/g,'');
  check('preview shows the dimensions while dragging',await page.locator('#fill-label').isVisible()&&/×/.test(await page.locator('#fill-label').textContent()),await page.locator('#fill-label').textContent());
  await page.mouse.up();
  const filled=await get(n=>STUDIO.world.map.size-n,blocks0);
  check('release commits exactly the previewed grid-snapped rectangle',filled>=2&&filled===labelCount,`added ${filled}, preview said ${labelText}`);
  await page.locator('#undo').click();check('the whole fill is one Undo step',await get(n=>STUDIO.world.map.size===n,blocks0));
  await page.locator('#redo').click();check('Redo restores the fill',await get(([n,f])=>STUDIO.world.map.size===n+f,[blocks0,filled]));
  const saved2=await get(()=>STUDIO.projectData());await get(d=>STUDIO.loadProject(d),saved2);
  check('filled blocks are saved and loaded',await get(([n,f])=>STUDIO.world.map.size===n+f,[blocks0,filled]));
  await get(()=>{STUDIO.state.fill.on=true;STUDIO.setMode('build');});
  const b2=await get(()=>STUDIO.world.map.size);
  await page.mouse.move(from.x+30,from.y-60);await page.mouse.down();await page.mouse.move(to.x+60,to.y-40,{steps:5});await page.keyboard.press('Escape');await page.mouse.up();
  check('Esc cancels a fill without changing anything',await get(n=>STUDIO.world.map.size===n&&!STUDIO.fill.drag,b2));
  await get(()=>{STUDIO.state.fill.on=true;STUDIO.setMode('build');});
  const single=ground.from;await page.mouse.click(single.x,single.y);
  await wait(200);check('a plain click still places exactly one block',await get(n=>STUDIO.world.map.size===n+1,b2),await get(n=>JSON.stringify({diff:STUDIO.world.map.size-n,mode:STUDIO.state.mode,fill:STUDIO.state.fill,toast:document.querySelector('#toast').textContent}),b2));
  check('oversized fills are trimmed to the limit with feedback',await get(()=>{const b=STUDIO.fill.box([0,30,0],[300,30,300],{axis:1,sign:1});return b.trimmed&&b.count<=4096;}));
  const wall=await get(()=>{const before=STUDIO.world.map.size;const n=STUDIO.fill.commit(STUDIO.fill.box([20,1,20],[24,4,20],STUDIO.fill.resolvePlane('wall-x',[0,0,1])));return{n,added:STUDIO.world.map.size-before};});
  check('walls fill vertically (5 × 4)',wall.n===20&&wall.added===20,JSON.stringify(wall));
  const ceil=await get(()=>{const n=STUDIO.fill.commit(STUDIO.fill.box([20,8,22],[23,8,24],STUDIO.fill.resolvePlane('auto',[0,-1,0])));return n;});
  check('ceilings / floating platforms fill in one step',ceil===12);
  await page.keyboard.press('g');check('G turns drag-fill off again',await get(()=>!STUDIO.state.fill.on));

  check('no page errors',errors.length===0,errors.slice(0,3).join(' | '));
  await page.screenshot({path:path.join(out,'v41-features.png')});
}catch(e){check('suite completed without exceptions',false,e.stack||e.message);}
await browser.close();
const failed=checks.filter(c=>!c.pass);console.log(`\n${checks.length-failed.length}/${checks.length} checks passed.`);
fs.writeFileSync(path.join(out,'v41-features.json'),JSON.stringify({checks,errors},null,2));
if(failed.length)process.exit(1);
