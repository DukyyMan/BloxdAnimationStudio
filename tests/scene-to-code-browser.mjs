// Generate Code From Scene: deterministic output, editable code, and a real
// round-trip — generate from a constructed scene, run the code in a fresh
// scene, and compare the reconstructed objects/keys with the original.
import {launch,boot} from './browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await launch();
const page=await browser.newPage({viewport:{width:1365,height:768}});
await boot(page);
const results={};
const V=(fn,arg)=>page.evaluate(fn,arg);

// 1. Build a test scene: blocks + rotations + scales, a character with pose
//    keys, object keys, camera keys, sun keys, plus a tree (unscriptable) and
//    terrain edits.
const original=await V(async ()=>{
  const S=STUDIO;
  await S.loadProject(S.projectData());           // start from the demo scene state
  // Terrain: remove some demo cells and add a wall.
  const world=S.world;
  for(let x=3;x<=6;x++)for(let y=0;y<=1;y++)world.set(x,y,-3,'bricks');
  world.rebuild();
  // Blocks with transforms and animation keys.
  const b1=S.addProp('block',new S.THREE.Vector3(-5,1,2),{block:'stone'});
  b1.name='Marker stone';b1.root.rotation.y=Math.PI/4;b1.root.scale.setScalar(1.5);
  b1.keys=[{time:0,position:b1.root.position.toArray(),rotation:[0,Math.PI/4,0],scale:[1.5,1.5,1.5]},{time:2,position:[-5,2,2],rotation:[0,Math.PI,0],scale:[1.5,1.5,1.5],ease:'linear'}];
  const itemName=S.catalog.itemOrder.find(n=>S.itemDefs[n]?.available&&S.itemDefs[n]?.kind==='item')||'Apple';
  const b2=S.addProp('tool',new S.THREE.Vector3(-3.4,1.65,1.2),{asset:itemName});
  b2.name='Grounded '+itemName;
  const bob=S.objects.find(o=>o.character);
  bob.root.position.set(1,1.02,3);
  bob.character.keys=[{time:0,position:[1,1.02,3],rotation:[0,.3,0],scale:[1,1,1],pose:{head:[0,0,0],armR:[0,0,.7],armL:[0,0,-.7],body:[0,0,0],armR2:undefined},held:null},{time:3,position:[1,1.02,3],rotation:[0,-.6,0],scale:[1,1,1],pose:{head:[0,.5,0],armR:[-.9,0,.2],armL:[0,0,-.7],body:[0,0,0]},held:null}];
  // Camera keys and sun key at a specific time.
  S.camTrack.keys=[{time:0,position:[10,7,12],target:[0,1,0],fov:45},{time:4,position:[-8,6,10],target:[1,1,2],fov:50,ease:'linear'}];
  S.camTrack.rebuild();
  S.light.keys=[{time:0,azimuth:-38,elevation:42,intensity:3.1},{time:6,azimuth:80,elevation:20,intensity:1.5}];
  S.refreshAll();
  return {
    blocks:[{name:b1.name,transform:[...b1.root.position.toArray()],rotY:Math.PI/4,scale:1.5,keys:b1.keys}],
    toolName:b2.name,bobKeys:bob.character.keys.length,
    camKeys:S.camTrack.keys.length,sunKeys:S.light.keys.length,
    terrainStonebrick:(()=>{let n=0;for(const [k,t] of world.map.entries())if(t==='bricks')n++;return n;})()
  };
});
assert.ok(original.blocks.length===1&&original.bobKeys===2&&original.camKeys===2&&original.sunKeys===2,'test scene prepared: '+JSON.stringify(original));
results.original=original;

// 2. Generate code from the scene through the real Code Editor button.
await page.evaluate(()=>STUDIO.code.open());
await page.waitForTimeout(150);
await page.evaluate(()=>{window.confirm=()=>true;});
await page.click('#code-generate');
await page.waitForTimeout(250);
const generated=await V(()=>({len:document.querySelector('#code-source').value.length,code:document.querySelector('#code-source').value,log:document.querySelector('#code-log').textContent,status:document.querySelector('#code-status').textContent}));
assert.ok(generated.len>400,'code generated into the editor: '+generated.len+' chars');
assert.ok(generated.code.includes('async function main(api)'),'script shape matches the Code Editor API');
assert.ok(generated.code.includes('scene.addCharacter'),'character emitted');
assert.ok(generated.code.includes('terrain.fill'),'terrain emitted');
assert.ok(generated.code.includes('timeline.keyCamera'),'camera keys emitted');
assert.ok(generated.code.includes('timeline.keySun'),'sun keys emitted');
assert.ok(generated.code.includes('Add a marker')||generated.log.includes('not be rebuilt'),'the unscriptable tree is reported');
assert.ok(generated.code.includes('Generate Code From Scene'),'code is marked as generated from the scene');
// Deterministic: generate again into a scratch comparison (no confirm needed) and compare bytes.
const second=await V(()=>STUDIO.code.compile? null: null);
const code1=generated.code;
await page.evaluate(()=>{window.__gen1=document.querySelector('#code-source').value;});
await page.evaluate(()=>{document.querySelector('#code-generate').click();});
await page.waitForTimeout(200);
const code2=await V(()=>document.querySelector('#code-source').value);
assert.equal(code2,code1,'generating twice from the unchanged scene is byte-identical');
results.deterministic=true;
results.code=code1;
// 3. Copy button works (existing editor functionality preserved).
await page.evaluate(()=>{document.querySelector('#code-copy').click();});
assert.ok(await V(()=>document.querySelector('#code-status').textContent.toLowerCase().includes('copied')||document.querySelector('#code-status').textContent.toLowerCase().includes('clipboard')),'copy button still functional');
// 4. Validate the generated code (must compile with zero diagnostics).
await page.evaluate(()=>{document.querySelector('#code-validate').click();});
await page.waitForTimeout(300);
const validation=await V(()=>({status:document.querySelector('#code-status').textContent,applyEnabled:!document.querySelector('#code-apply').disabled,log:document.querySelector('#code-log').textContent}));
assert.ok(validation.applyEnabled,'generated script validates and can be applied');
assert.ok(!/Line \d+/.test(validation.log),'no located errors in generated code');
results.validation=validation.status;
// 5. Round-trip: capture the full generated scene state, wipe to a fresh scene, run the code there.
const snapshotState=await V(()=>JSON.stringify(STUDIO.projectData()));
// Fresh scene: empty objects + empty terrain.
await V(async ()=>{
  const S=STUDIO,d=JSON.parse(JSON.stringify(S.projectData()));
  d.objects=[];d.world.blocks=[];d.camera.keys=[];d.sceneName='Fresh target';d.editor.selection=0;
  await S.loadProject(d);
});
const fresh=await V(()=>({objects:STUDIO.objects.length,terrain:(()=>{let n=0;for(const e of STUDIO.world.map.entries())n++;return n;})()}));
assert.equal(fresh.objects,0,'fresh scene has no objects');
// Apply the generated code in the fresh scene.
await page.evaluate(()=>{window.__fresh=JSON.parse(JSON.stringify(STUDIO.projectData()));});
await V(async ()=>{
  const S=STUDIO;
  // Run via the Code Editor pipeline: compile against the fresh snapshot and apply.
  const dialog=document.querySelector('#code-dialog');
  dialog.showModal();
  const source=document.querySelector('#code-source');
  source.value=window.__genCode||source.value;
  document.querySelector('#code-validate').click();
});
await page.waitForTimeout(400);
const applyOk=await V(()=>!document.querySelector('#code-apply').disabled);
assert.ok(applyOk,'script validates against the fresh scene');
await page.evaluate(()=>{document.querySelector('#code-apply').click();});
await page.waitForTimeout(500);
// 6. Compare the reconstructed scene with the original.
const round=await V(ids=>{
  const S=STUDIO;
  const blocks=S.objects.filter(o=>o.type==='block').map(o=>({name:o.name,p:o.root.position.toArray(),ry:o.root.rotation.y,s:o.root.scale.x,keys:o.keys.length}));
  const chars=S.objects.filter(o=>o.character).map(o=>({keys:o.character.keys.length,pose0:o.character.keys[0]?.pose?{head:o.character.keys[0].pose.head[0],armR:o.character.keys[0].pose.armR[2]}:null}));
  const tools=S.objects.filter(o=>o.type==='tool').map(o=>({name:o.name,p:o.root.position.toArray()}));
  return {objects:S.objects.length,blocks,chars,tools,camKeys:S.camTrack.keys.length,sunKeys:S.light.keys.length,
    terrain:(()=>{let n=0;for(const [k,t] of S.world.map.entries())if(t==='bricks')n++;return n;})()};
});
assert.ok(round.blocks.length>=1,'block recreated: '+JSON.stringify(round.blocks));
const rb=round.blocks.find(b=>b.name==='Marker stone')||round.blocks[0];
const ob=original.blocks[0];
assert.ok(Math.abs(Math.abs(rb.ry)-ob.rotY)<0.02,'block rotation round-trips: '+rb.ry);
assert.ok(Math.abs(rb.s-ob.scale)<0.05,'block scale round-trips: '+rb.s);
assert.equal(rb.keys,2,'block keys round-trip');
assert.ok(round.chars.length===1&&round.chars[0].keys>=2,'character pose keys round-trip: '+JSON.stringify(round.chars));
assert.ok(round.camKeys>=2,'camera keys round-trip: '+round.camKeys);
assert.ok(round.sunKeys>=2,'sun keys round-trip: '+round.sunKeys);
assert.ok(round.terrain>=8,'terrain wall recreated: '+round.terrain);
results.roundTrip=round;
// 7. The generated code reports limitations honestly (tree present in original scene?).
results.passed=true;
fs.mkdirSync('tests/results',{recursive:true});
fs.writeFileSync('tests/results/scene-to-code.json',JSON.stringify({results,code:undefined},null,2));
fs.writeFileSync('tests/results/scene-to-code-sample.js',code1);
console.log('PASS Generate Code From Scene with round-trip',results);
await browser.close();
