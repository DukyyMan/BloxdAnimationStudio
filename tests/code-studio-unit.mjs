import assert from 'node:assert/strict';
import { compileScript } from '../lib/code-studio.js';
import { CODE_EXAMPLES } from '../lib/code-examples.js';

const catalog={
  blocks:[{id:'grass',label:'Grass',solid:true},{id:'stone',label:'Stone',solid:true},{id:'sand',label:'Sand',solid:true},{id:'snow',label:'Snow',solid:true},{id:'dirt',label:'Dirt',solid:true}],
  blockAliases:{},
  tools:['Diamond Pickaxe','Gold Pickaxe','none'],
  sourceModels:['ufo'],
  textures:['grass.png'],
  lights:{golden:{az:1},day:{az:2},night:{az:3},studio:{az:4},sunrise:{az:5},sunset:{az:6},moonlight:{az:7},cinematic:{az:8}}
};
const base={serial:0,sceneName:'Test',world:{blocks:[],size:1,seed:1},objects:[],light:{},camera:{keys:[],smooth:false,view:{position:[8,6,12],target:[0,1,0],fov:45}},timeline:{duration:8,time:0,playing:false,cameraEnabled:true},selection:{id:null},mode:'select'};
const run=(code,snapshot=base,options)=>compileScript(code,snapshot,catalog,options);

// ── Original behaviour: generated data is ordinary, editable, and update-by-id ──
const source=`async function main(api) {
 const { scene, timeline, camera, lights } = api;
 const hero = await scene.addCharacter({id:"hero",position:{x:1,y:1,z:0}});
 timeline.setDuration(6);
 timeline.keyPose(hero,{time:1,parts:{rightArm:{rotation:{x:-120}}}});
 timeline.keyPose(hero,{time:3,parts:{head:{rotation:{y:30}}}});
 camera.set({position:{x:8,y:6,z:12},target:{x:0,y:1,z:0}});
 lights.setEnvironment({preset:"golden hour"});
}`;
const first=run(source);
assert.equal(first.result.next.objects.length,1);
const hero=first.result.next.objects[0];
assert.equal(hero.options.scriptId,'hero');
assert.equal(hero.character.keys.find(k=>k.time===1).pose.armR[0],-120);
assert.equal(hero.character.keys.find(k=>k.time===3).pose.head[1],30);
assert.equal(first.result.next.camera.keys.length,1);
assert.equal(base.objects.length,0,'compileScript must not mutate the input snapshot');
const second=run(source,first.result.next);
assert.equal(second.result.next.objects.length,1);
assert.equal(second.skipped,3,'existing keys are preserved, not duplicated');
assert.deepEqual(second.result.next.objects[0].character.keys,hero.character.keys);

// ── Safety ──
assert.throws(()=>run('async function main(api) { fetch("https://example.com"); }'),/not available/);
assert.throws(()=>run('async function main(api) { while (true) {} }'),/limit/i);
assert.throws(()=>run('async function main(api) { api.scene.addCharacter({}); }'),/id is required/);
assert.throws(()=>run('async function main(api) { api.scene.addAsset("Nope",{id:"x"}); }'),/supports available/);

// ── Custom meshes are real geometry data, not placeholders ──
const mesh=run(`async function main(api) {
 const { scene, mesh } = api;
 const sword = scene.addMesh(mesh.group("Sword")
   .box({ size: { x: .1, y: .8, z: .1 }, color: "#c8ccd4" })
   .sphere({ radius: .2, position: { y: .5 }, color: "#ffd27a" }), { id: "sword", name: "Sword" });
}`);
const sword=mesh.result.next.objects.find(o=>o.id===mesh.result.next.objects.find(x=>x.options.scriptId==='sword').id);
assert.equal(sword.type,'mesh');
assert.equal(sword.options.parts.length,2);
assert.equal(sword.options.parts[0].kind,'box');
assert.equal(sword.options.parts[0].size[1],.8);
assert.equal(sword.options.parts[1].kind,'sphere');
assert.equal(sword.options.parts[1].color,'#ffd27a');

// mesh.edit / clone / combine
const combined=run(`async function main(api) {
 const { scene, mesh } = api;
 const a = mesh.group("a").box({ size: { x: 1, y: 1, z: 1 } });
 const b = a.clone("b").box({ size: { x: 2, y: 2, z: 2 } });
 a.combine(b);
 a.edit(0, { color: "#ff0000" });
 scene.addMesh(a, { id: "combo" });
}`);
const combo=combined.result.next.objects.find(o=>o.options.scriptId==='combo');
assert.equal(combo.options.parts.length,2,'combine merges parts');
assert.equal(combo.options.parts[0].color,'#ff0000','edit mutates a part');

// ── Terrain generation ──
const terrain=run(`async function main(api) { api.terrain.generate({ width: 12, depth: 12, biome: "plains", seed: 7 }); }`);
assert.ok(terrain.result.next.world.blocks.length>100,'terrain.generate writes cells');
assert.ok(terrain.result.next.world.blocks.some(([,b])=>b==='grass'),'plains are grass-topped');
const desert=run(`async function main(api) { api.terrain.generate({ width: 8, depth: 8, biome: "desert", seed: 2 }); }`);
assert.ok(desert.result.next.world.blocks.some(([,b])=>b==='sand'));
const removed=run(`async function main(api) { api.terrain.setBlock({x:1,y:0,z:1,blockName:"stone"}); api.terrain.removeBlock({x:1,y:0,z:1}); }`);
assert.equal(removed.result.next.world.blocks.length,0,'removeBlock erases the cell');

// ── Transforms, materials, attachments ──
const staged=run(`async function main(api) {
 const { scene } = api;
 const hero = await scene.addCharacter({ id: "hero" });
 const rock = await scene.addAsset("stone", { id: "rock", name: "Rock" });
 scene.setTransform(rock, { position: { x: 2, y: 1, z: 3 }, rotation: { y: 45 }, scale: { x: 2, y: 2, z: 2 } });
 scene.setMaterial(rock, { color: "#3366ff", roughness: .2, metalness: .8 });
 scene.attach(rock, scene.get("hero:rightArm"), { position: { x: 0, y: -.4, z: 0 } });
}`);
const rockRec=staged.result.next.objects.find(o=>o.options.scriptId==='rock');
assert.deepEqual(rockRec.transform.position,[2,1,3]);
assert.equal(rockRec.options.material.color,'#3366ff');
assert.equal(rockRec.options.material.metalness,.8);
assert.equal(rockRec.options.attach.parent,staged.result.next.objects.find(o=>o.options.scriptId==='hero').id);
assert.equal(rockRec.options.attach.part,'armR');
assert.equal(rockRec.options.attach.position[1],-.4);

// limb handles
const limb=run(`async function main(api) { const h = await api.scene.addCharacter({id:"h"}); api.scene.setTransform(api.scene.get("h:leftLeg"), { rotation: { x: -90 } }); }`);
const limbRec=limb.result.next.objects[0];
assert.equal(limbRec.character.pose.legL[0],-90,'a limb handle poses that joint');

// ── Timeline: fps, easing, sun animation, motion presets ──
const timed=run(`async function main(api) {
 const { timeline, camera } = api;
 timeline.setFPS(30); timeline.setInterpolation("smooth");
 timeline.keySun({ time: 0, azimuth: -38, elevation: 42, intensity: 3 });
 timeline.keySun({ time: 6, azimuth: 120, elevation: 12, intensity: 1, color: "#ffb27a" });
 camera.orbit({ target: { x: 0, y: 1, z: 0 }, azimuth: 40, elevation: 22, radius: 12 });
}`);
assert.equal(timed.result.next.timeline.fps,30);
assert.equal(timed.result.next.light.keys.length,2);
assert.equal(timed.result.next.light.keys[1].color,'#ffb27a');
assert.equal(timed.result.next.camera.keys.length,1);
const cam=timed.result.next.camera.keys[0];
assert.ok(Math.abs(Math.hypot(cam.position[0]-0,cam.position[1]-1,cam.position[2]-0)-12)<1e-6,'orbit radius is honoured');
const eased=run(`async function main(api) { const h=await api.scene.addCharacter({id:"h"}); api.timeline.keyPose(h,{time:1,parts:{head:{rotation:{y:30}}}},{ease:"inout"}); }`);
assert.equal(eased.result.next.objects[0].character.keys.find(k=>k.time===1).ease,'inout');
const moved=run(`async function main(api) { const h=await api.scene.addCharacter({id:"h"}); api.timeline.preset(h,"Walk",{time:0,duration:4}); }`);
assert.ok(moved.result.next.objects[0].character.keys.length>10,'preset bakes motion keys');

// ── Replace-generated mode ──
const replace=run(`async function main(api) { api.project.setGeneratedMode("replace"); const h=await api.scene.addCharacter({id:"hero"}); api.timeline.keyPose(h,{time:2,parts:{head:{rotation:{y:10}}}}); }`,first.result.next);
assert.ok(replace.result.next.objects.length<first.result.next.objects.length||replace.generatedMode==='replace');
assert.ok(replace.result.warnings.some(w=>/Replaces/.test(w)),'replace mode says what it replaces');
const stale=run(`async function main(api) { api.project.setGeneratedMode("replace"); const h=await api.scene.addCharacter({id:"hero"}); api.timeline.keyPose(h,{time:4,parts:{head:{rotation:{y:10}}}}); }`,first.result.next);
const staleHero=stale.result.next.objects.find(o=>o.options.scriptId==='hero');
assert.ok(staleHero.character.keys.some(k=>k.time===4)&&!staleHero.character.keys.some(k=>k.time===1||k.time===3),'replace mode rebuilds the track');
const removedObj=run(`async function main(api) { api.project.setGeneratedMode("replace"); }`,first.result.next);
assert.equal(removedObj.result.next.objects.length,0,'replace mode deletes generated objects the script no longer creates');

// ── Camera helpers and asset search ──
const framed=run(`async function main(api) { const h=await api.scene.addCharacter({id:"h",position:{x:0,y:1,z:0}}); api.camera.frame(h,{distance:5}); }`);
assert.ok(framed.result.next.camera.keys.length>=1);
const found=run(`async function main(api) { const r = api.assets.search("pick", {limit:5}); if (r.length) await api.scene.addAsset("Diamond Pickaxe", {id:"found"}); }`);
assert.equal(found.result.next.objects.length,1,'asset search results can be placed');
assert.equal(found.result.next.objects[0].options.asset,'Diamond Pickaxe');

console.log('Code studio: editable generated data, meshes, terrain, attachments, materials, animated sun, fps, easing, replace-generated, asset search, preserved keys, rejected unsafe scripts.');

// Seek validates input and clamps finite times to the current project duration.
for (const [input, expected] of [[0,0],[4,4],[8,8],[-10,0],[99,8]]) {
 const result=run(`async function main(api) { api.timeline.setPlayhead(${input}); }`);
 assert.equal(result.result.next.timeline.time,expected);
}
for (const input of ['', '""', 'null', '"oops"', '1 / 0']) {
 assert.throws(()=>run(`async function main(api) { api.timeline.setPlayhead(${input}); }`),/finite number/);
}

for (const example of CODE_EXAMPLES) assert.doesNotThrow(()=>run(example.code), example.name);

const motionAgain=run(`async function main(api) { const h=await api.scene.addCharacter({id:"h"}); api.timeline.preset(h,"Walk",{time:0,duration:4}); }`,moved.result.next);
assert.deepEqual(motionAgain.result.next.objects[0].character.keys,moved.result.next.objects[0].character.keys,'update preserves existing motion keys');
assert.ok(motionAgain.skipped>0);
assert.ok(run(`async function main(api) { const h=await api.scene.addCharacter({id:"h"}); api.timeline.preset(h,"Punch",{time:0,duration:1}); }`).result.warnings.some(w=>/legacy approximation/.test(w)));
assert.throws(()=>run(`async function main(api) { await api.scene.addCharacter({id:"hero"}); await api.scene.addCharacter({id:"hero"}); }`,first.result.next),/Duplicate script ID/);

const sunAgain=run(`async function main(api) { api.timeline.keySun({time:0,azimuth:10}); api.timeline.keySun({time:4,azimuth:20}); }`,timed.result.next);
assert.equal(sunAgain.result.next.light.keys.find(k=>k.time===0).azimuth,-38,'update preserves existing sun key');
assert.ok(sunAgain.result.next.light.keys.some(k=>k.time===4));
const opacity=run(`async function main(api) { const b=api.scene.addAsset("stone",{id:"b"}); api.scene.setTransform(b,{opacity:.5}); }`);
assert.equal(opacity.result.next.objects[0].options.material.opacity,.5);

const cameraRotation=run(`async function main(api) { api.timeline.keyCamera({time:2,position:{x:0,y:1,z:5},rotation:{x:0,y:0,z:0}}); }`);
assert.deepEqual(cameraRotation.result.next.camera.keys.find(k=>k.time===2).target,[0,1,4]);
assert.throws(()=>run(`async function main(api) { const h=await api.scene.addCharacter({id:"h"}); api.timeline.preset(h,"Walk",{time:7,duration:2}); }`,moved.result.next),/fit within/);
assert.throws(()=>run(`async function main(api) { api.timeline.setInterpolation("fast"); }`),/Supported: linear, smooth/);

// Diagnostics keep exact call sites through the VM and deferred key/command compiler.
const issues=body=>{try{run(`async function main(api) {\n${body}\n}`);}catch(e){return e.diagnostics||[e];}throw Error('Expected diagnostics');};
let problems=issues('api.scene.get("absent"); api.scene.get("other");\napi.timeline.setFPS(0);\napi.timeline.setInterpolation("fast");');
assert.deepEqual(problems.map(e=>[e.line,e.command]),[[2,undefined],[2,undefined],[3,1],[4,2]]);
assert.ok(problems[0].column<problems[1].column);
problems=issues('api.timeline.keyCamera({time:2,fov:1});\napi.timeline.keyCamera({time:3,fov:500});');
assert.deepEqual(problems.map(e=>[e.line,e.command]),[[2,1],[3,1]]);
assert.equal(issues('api.timeline.setDuration(65);')[0].line,2);
assert.equal(issues('api.terrain.fill({\nfrom:{}, to:{}, blockName:"absent"\n});')[0].endLine,4);
assert.throws(()=>run(' '.repeat(64001)),e=>!e.line,'no invented source line for size limit');
assert.equal(issues('const a = ;')[0].category,'Syntax');
const cells={...base,world:{...base.world,blocks:[['0,0,0','snow'],['49,2,49','dirt']]}};
const script=(body,snap=cells)=>run(`async function main(api){${body}}`,snap).result.next;
const gen='api.terrain.generate({width:4,depth:4,biome:"desert",amplitude:0,decorate:false});';
assert.equal(new Map(script(gen).world.blocks).get('0,0,0'),'snow');
const regenerated=new Map(script('api.project.setGeneratedMode("replace");'+gen).world.blocks);
assert.equal(regenerated.get('0,0,0'),'sand');assert.equal(regenerated.get('49,2,49'),'dirt');
const shell=new Map(script('api.terrain.clear();api.terrain.fill({from:{},to:{x:2,y:2,z:2},blockName:"stone",hollow:true});').world.blocks);
assert.equal(shell.size,26);assert.ok(!shell.has('1,1,1'));
assert.equal(new Map(script('api.terrain.setBlock({x:0,y:0,z:0,blockName:"grass"});').world.blocks).get('0,0,0'),'grass');
assert.equal(script('api.terrain.clear();').world.blocks.length,0);
assert.equal(script('const items=api.assets.search("",{category:"item",limit:1});api.scene.addAsset(items[0],{id:"pick"});').objects[0].type,'tool');
console.log('PASS located multi-diagnostics, grouped keys, fill bounds, generation modes, catalog filtering and every library example.');
assert.deepEqual(issues('var x=1;\nvar y=2;').map(e=>e.line),[2,3]);
assert.equal(issues('let n=missingVariable;')[0].category,'Runtime (dry run)');
const survivor=script('const one=api.scene.addAsset("stone",{id:"discard"});api.scene.remove(one);api.scene.addCharacter({id:"survivor"});');
assert.equal(survivor.objects[0].options.scriptId,'survivor');
assert.deepEqual(run('async function main(api){\napi.terrain.clear();\n}').warningDetails.map(d=>[d.line,d.command]),[[2,1]]);
assert.throws(()=>script('api.terrain.fill({from:{},to:{x:55},blockName:"stone"});'),/Box end/);
assert.throws(()=>script('api.terrain.fill({from:{},to:{x:50,y:50,z:50},blockName:"stone"});'),/too large/);
