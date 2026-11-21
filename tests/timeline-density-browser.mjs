import {launch,boot} from './browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await launch(),page=await browser.newPage({viewport:{width:1400,height:900}});
try{
 await boot(page);
 const result=await page.evaluate(()=>{
  const S=STUDIO,r=S.objects.find(o=>o.character),originalRoots=S.objects.map(o=>o.root),key=structuredClone(r.character.keys[0]);
  S.timeline.duration=1800;S.timelineView.pixelsPerSecond=80;S.timelineView.autoScroll=false;
  r.character.keys=Array.from({length:10000},(_,i)=>({...structuredClone(key),time:i*.18,position:[Math.sin(i*.03)*4,1,0]}));S.select(r);
  const markers=document.querySelectorAll('#pose-track .key-marker').length,start=performance.now();
  for(let i=0;i<100;i++)S.seek(i*13.71);
  return{keys:r.character.keys.length,markers,seek100Ms:performance.now()-start,sameRoots:S.objects.every((o,i)=>o.root===originalRoots[i]),scrollWidth:document.querySelector('#timeline-scroll').scrollWidth};
 });
 assert.equal(result.keys,10000);assert.ok(result.markers<300,'offscreen keys are not rebuilt as DOM markers');assert.ok(result.sameRoots,'scrubbing never rebuilds scene roots');assert.ok(result.seek100Ms<5000,'100 scrubs must stay responsive');assert.ok(result.scrollWidth>100000);
 // A hovered transform handle must not steal a fly-mode look/movement gesture.
 await page.evaluate(()=>{STUDIO.setMode('rotate');STUDIO.gizmo.axis='X';});
 await page.locator('#nav-mode').click();
 assert.ok(await page.evaluate(()=>STUDIO.nav.active&&!STUDIO.gizmo.enabled&&STUDIO.gizmo.axis===null));
 const before=await page.evaluate(()=>STUDIO.camera.position.toArray());
 await page.keyboard.down('w');await page.waitForFunction(()=>Math.hypot(...STUDIO.nav.state.velocity)>5);await page.keyboard.up('w');
 assert.ok(await page.evaluate(a=>STUDIO.camera.position.distanceTo(new STUDIO.THREE.Vector3(...a))>.1,before));
 await page.keyboard.press('n');assert.ok(await page.evaluate(()=>!STUDIO.nav.active&&STUDIO.gizmo.enabled));result.flyGizmoGuard=true;
 // Imported clip pause/time is editing state, not just a static mesh snapshot.
 result.pausedImport=await page.evaluate(async()=>{
   const S=STUDIO,T=S.THREE,d=S.projectData(),root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial());mesh.name='Probe';root.add(mesh);
   root.animations=[new T.AnimationClip('Move',2,[new T.VectorKeyframeTrack('Probe.position',[0,2],[0,0,0,2,0,0])])];
   d.objects=[{name:'Imported animation test',type:'import',transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},options:{},object:root.toJSON(),keys:[],animPlaying:false,mixerTime:1}];d.editor.selection=0;
   await S.loadProject(d);const r=S.selected;return r.mixer?.time===1&&r.action?.paused===true&&Math.abs(r.root.children[0].position.x-1)<1e-8;
 });assert.ok(result.pausedImport,'paused imported animation frame must survive load');
 fs.mkdirSync('tests/results',{recursive:true});fs.writeFileSync('tests/results/timeline-density.json',JSON.stringify(result,null,2));
 console.log('PASS 10,000-key / 30-minute browser timeline density and scene reuse',result);
}finally{await browser.close();}
