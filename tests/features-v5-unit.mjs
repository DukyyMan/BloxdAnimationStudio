// v4.4 feature systems, tested headlessly (no DOM): mob audit honesty, managed
// lights, the material override layer, Bob appearance rules and the v4 project
// format. Bundled with the three alias so `three` resolves to the vendored build.
import * as THREE from 'three';
import { normalizeLightConfig, attachLightRig, applyLightConfig, disposeLightRig, disposeLightsOf, updateLightsAtTime, flickerGain, LIGHT_PRESETS, MAX_EMITTER_LIGHTS } from '../lib/lights.js';
import { normalizeMaterialSpec, applyMaterialSpec, restoreOriginalMaterials, materialOriginals, applyGlobalMaterialOverrides, materialOverrideEligible, resolveSpecTexture, specHasContent } from '../lib/scene-materials.js';
import { normalizeAppearance, applyAppearance, appearanceSummary, SKIN_TINTS } from '../lib/character-look.js';
import { migrateProject, PROJECT_VERSION } from '../lib/project-format.js';
import { MOB_AUDIT } from '../lib/mob-audit-data.js';

let pass=0,fail=0;
const ok=(cond,msg,detail='')=>{if(cond){pass++;console.log('PASS '+msg+(detail?' — '+detail:''));}else{fail++;console.log('FAIL '+msg+(detail?' — '+detail:''));}};
const near=(a,b,eps=1e-4)=>Math.abs(a-b)<eps;

// ── Feature 1: the mob audit is honest ──────────────────────────────────────
ok(MOB_AUDIT.officialTypes===59&&MOB_AUDIT.usable===0,'mob audit covers 59 official types and promotes none without verification',MOB_AUDIT.officialTypes+' types · '+MOB_AUDIT.usable+' usable');
ok(MOB_AUDIT.mobs.every(m=>m.name&&Array.isArray(m.variations)&&m.variations.length&&m.status==='unavailable'&&typeof m.reason==='string'&&m.reason.length>20),'every mob entry documents its variations and the honest reason it is not riggable');
ok(MOB_AUDIT.mobs.some(m=>m.name==='Pig'&&m.variations.includes('default'))&&MOB_AUDIT.mobs.some(m=>m.name==='Draugr Zombie'&&m.variations.length>5),'official variation lists carried over from the code-api snapshot');
ok(!MOB_AUDIT.mobs.some(m=>m.status!=='unavailable'),'no substitute or placeholder mob is labelled as a working mob');

// ── Feature 3: managed lights ────────────────────────────────────────────────
{
  const cfg=normalizeLightConfig({intensity:'bad',color:'zzz',range:-5,flicker:9,angle:4000,position:[99,2,-3]},'fire');
  ok(cfg.color===LIGHT_PRESETS.fire.color&&cfg.intensity===LIGHT_PRESETS.fire.intensity,'invalid light values fall back to the asset preset',JSON.stringify(cfg));
  ok(cfg.flicker===1&&cfg.angle===85&&cfg.range===.5&&cfg.position.every(n=>Math.abs(n)<=20),'light config is clamped to safe ranges');
  const a=flickerGain(3.7,.5),b=flickerGain(3.7,.5);
  ok(a===b&&a<1&&a>0,'flicker is a pure function of time — frame-exact scrubbing and exports',a.toFixed(3));
  ok(flickerGain(1,0)===1,'zero flicker keeps full intensity');
  const root=new THREE.Group();
  const rig=attachLightRig(root,normalizeLightConfig(null,'fire'));
  ok(!!rig&&rig.light.parent===root&&rig.light.isPointLight,'a rig attaches its real THREE light into the object');
  applyLightConfig(rig,{enabled:false});
  ok(rig.light.intensity===0,'disabled light contributes nothing');
  applyLightConfig(rig,{enabled:true,color:'#ff0000',intensity:5,range:3});
  ok(near(rig.light.intensity,5)&&rig.light.color.getHexString()==='ff0000'&&rig.light.distance===3,'applyLightConfig updates intensity, color and range live',rig.light.intensity);
  updateLightsAtTime(2.5);
  const withFlicker=rig.light.intensity;
  ok(withFlicker<=5.001&&withFlicker>=2.5,'flicker update stays within the configured envelope',withFlicker.toFixed(3));
  disposeLightRig(rig);
  ok(rig.light.parent===null,'disposed rig removes its light');
  // Emitter cap (particle lights) — over the cap, attach returns null.
  const emitterRoots=[];let attached=0;
  for(let i=0;i<MAX_EMITTER_LIGHTS+3;i++){
    const r=new THREE.Group();emitterRoots.push(r);
    if(attachLightRig(r,normalizeLightConfig(null,'fire'),{isEmitter:true}))attached++;
  }
  ok(attached===MAX_EMITTER_LIGHTS,'particle lights cap at '+MAX_EMITTER_LIGHTS+' for performance',attached+' attached');
  for(const r of emitterRoots)disposeLightsOf(r);
}

// ── Feature 5: material specs + override layer ──────────────────────────────
{
  const mat=new THREE.MeshStandardMaterial({color:0xcccccc,roughness:1});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat);
  const root=new THREE.Group();root.add(mesh);
  const out=applyMaterialSpec(root,{opacity:.5,roughness:.2,specularIntensity:2.5,emissive:'#ff8800',emissiveIntensity:1.5,color:'#101010'});
  ok(out.applied&&near(mesh.material.opacity,.5)&&mesh.material.transparent,'opacity applies with transparent blending');
  ok(near(mesh.material.roughness,.2),'smoothness maps to PBR roughness (user-facing smoothness = 1 − roughness)');
  ok(mesh.material.isMeshPhysicalMaterial&&near(mesh.material.specularIntensity,2.5),'shininess swaps the material to MeshPhysicalMaterial so specularIntensity drives the real USE_SPECULAR shader');
  ok(mesh.material.color.getHexString()==='101010'&&near(mesh.material.opacity,.5)&&mesh.material.emissive.getHexString()==='ff8800','the physical copy carries every other edited value');
  ok(near(mesh.material.roughness,.2),'roughness survives the specular conversion');
  const originals=materialOriginals(root);
  ok(originals.length===1&&near(originals[0].original.roughness,1),'the untouched material state was remembered');
  restoreOriginalMaterials(root);
  ok(mesh.material.isMeshStandardMaterial&&!mesh.material.isMeshPhysicalMaterial,'reset swaps the physical specular material back out');
  const owned=mesh.material;
  ok(near(owned.roughness,1)&&near(owned.opacity,1)&&owned.emissive.getHexString()==='000000'&&owned.specularIntensity===undefined&&owned.transparent===false&&owned.color.getHexString()==='cccccc','reset restores every original value without leaving specular residue');
  ok(near(mat.roughness,1)&&near(mat.opacity,1)&&mat.emissive.getHex()===0&&mat.specularIntensity===undefined,'the shared original instance stays untouched for other records');
  ok(!specHasContent({})&&specHasContent({color:'#abcdef'}),'spec content detection');
  ok(normalizeMaterialSpec({opacity:7}).opacity===1&&normalizeMaterialSpec({roughness:-3}).roughness===0,'out-of-range spec values clamp',JSON.stringify(normalizeMaterialSpec({opacity:7,roughness:-3})));
  // Opacity-only edits must not convert the material class and must not touch
  // the shared original instance (tool/stand records share materials).
  const mat2=new THREE.MeshStandardMaterial({color:0xffffff});
  const mesh2=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat2);
  root.add(mesh2);
  applyMaterialSpec(root,{opacity:.4});
  ok(mesh2.material.isMeshStandardMaterial&&near(mesh2.material.opacity,.4)&&mesh2.material!==mat2&&near(mat2.opacity,1),'opacity-only edits own a clone while the shared original stays untouched');
  restoreOriginalMaterials(root);
  ok(near(mesh2.material.opacity,1)&&mesh2.material.isMeshStandardMaterial&&!mesh2.material.isMeshPhysicalMaterial&&near(mat2.opacity,1),'second mesh resets independently without touching the shared original');
  ok(!materialOverrideEligible({character:{}})&&!materialOverrideEligible({type:'particles'}),'characters and particle shaders keep their own look under global overrides');
  ok(materialOverrideEligible({type:'block'})&&materialOverrideEligible({type:'mesh'}),'blocks and custom meshes accept global overrides');
  const blockRoot=new THREE.Group();
  const bm=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1});
  const bmesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),bm);blockRoot.add(bmesh);
  const blockRec={type:'block',root:blockRoot,options:{}};
  applyGlobalMaterialOverrides([blockRec],{material:{texture:'',smoothness:.9,shininess:3}},{});
  ok(near(bmesh.material.roughness,.1)&&bmesh.material.isMeshPhysicalMaterial&&bmesh.material.specularIntensity===3,'global smoothness/shininess overrides reach the real material (shininess via physical specular)',String(bmesh.material.roughness));
  applyGlobalMaterialOverrides([blockRec],{material:{texture:'',smoothness:null,shininess:null}},{});
  ok(bmesh.material.isMeshStandardMaterial&&!bmesh.material.isMeshPhysicalMaterial&&near(bmesh.material.roughness,1)&&bmesh.material.specularIntensity===undefined&&near(bm.roughness,1),'disabling overrides restores the original material values on the owned clone');
  ok(resolveSpecTexture({texture:'nope'},{}).texture===null,'unknown textures resolve to null instead of crashing');
}

// ── Feature 2: Bob appearance rules ─────────────────────────────────────────
{
  ok(SKIN_TINTS.ember.color===0xff9a5a&&SKIN_TINTS.frost.color===0x7fd4ff&&SKIN_TINTS.moss.color===0x8fd17a,'tints match the values the Code Editor path has always used');
  ok(normalizeAppearance(null)===null&&normalizeAppearance('junk')===null&&normalizeAppearance({tint:'nope'})===null,'junk appearance input normalizes to the default look');
  const mat=new THREE.MeshStandardMaterial({color:0xffffff});
  const c={material:mat,joints:{},armorRoots:[],armor:null};
  applyAppearance(c,{tint:'ember'});
  ok(mat.color.getHex()===0xff9a5a,'tint changes the real skin material');
  applyAppearance(c,null);
  ok(mat.color.getHex()===0xffffff,'null appearance restores the exact default Bob color');
  ok(appearanceSummary({tint:'frost'}).includes('Frost')&&appearanceSummary(null)==='Default appearance','appearance summaries describe the real state');
}

// ── Feature 6/8 + persistence: v4 project format ────────────────────────────
{
  ok(PROJECT_VERSION===4,'project format version is 4');
  const v3={format:'bloxd-studio',version:3,timeline:{duration:8},world:{blocks:[],size:18,seed:42},camera:{keys:[]},
    objects:[{name:'Bob',type:'character',transform:{position:[0,1,0],rotation:[0,0,0],scale:[1,1,1]},
      character:{pose:{offset:0,head:[0,0,0],body:[0,0,0],armR:[0,0,0],armL:[0,0,0],forearmR:[0,0,0],forearmL:[0,0,0],legR:[0,0,0],legL:[0,0,0],shinR:[0,0,0],shinL:[0,0,0]},keys:[],tool:'none',held:null,preset:'idle',live:false,manual:true,speed:1}}]};
  const migrated=migrateProject(v3);
  ok(migrated.version===3&&migrated.objects.length===1,'v3 projects migrate unchanged');
  const v4={...structuredClone(v3),version:4,
    groups:[{id:'g1',name:'Fort',members:['object-1']}],
    settings:{material:{texture:'grass',smoothness:.8,shininess:2},sky:{enabled:true,color:'#2233aa'}},
    objects:[{...structuredClone(v3.objects[0]),options:{appearance:{tint:'ember'},material:{opacity:.6,specularIntensity:2},
      light:{kind:'spot',color:'#ffffff',intensity:20,range:10,flicker:.3,angle:40,soft:.5,decay:2,position:[0,1,0]}}}]};
  const m4=migrateProject(v4);
  ok(m4.groups.length===1&&m4.settings.sky.enabled&&m4.objects[0].options.light.kind==='spot'&&m4.objects[0].options.appearance.tint==='ember','v4 groups, settings, lights, materials and appearances survive migration');
  const bad=structuredClone(v4);bad.objects[0].options.light.intensity='x';
  let threw=false;try{migrateProject(bad);}catch{threw=true;}
  ok(threw,'invalid light data is rejected, not silently saved');
  const badSky=structuredClone(v4);badSky.settings.sky.color='red';
  threw=false;try{migrateProject(badSky);}catch{threw=true;}
  ok(threw,'invalid sky colors are rejected');
  const badGroup=structuredClone(v4);badGroup.groups[0].members='object-1';
  threw=false;try{migrateProject(badGroup);}catch{threw=true;}
  ok(threw,'invalid group member lists are rejected');
}

console.log(`\nfeatures-v5-unit: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
