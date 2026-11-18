// A conservative adapter from the previous Studio's script syntax to editable scene commands.
// Every generated object / keyframe becomes ordinary editor data: it can be selected,
// transformed, re-keyed and deleted in the normal scene editor and timeline.
import { interpret, native, record } from './script-interpreter.js';
import { compilePlan } from './ai-commands.js';
import * as THREE from 'three';

const method=(arity,fn)=>native(args=>{if(args.length>arity)throw Error('Extra arguments are not supported by this API.');return fn(args);});
const vec=(v,defaults=[0,0,0])=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Expected a vector { x, y, z }.');for(const k of Object.keys(v))if(!['x','y','z'].includes(k))throw Error('Unknown vector property: '+k);return ['x','y','z'].map((k,i)=>v[k]??defaults[i]);};
const fields=(obj,allowed,label)=>{if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error(label+' must be an object.');for(const k of Object.keys(obj))if(!allowed.includes(k))throw Error('Unsupported '+label+' property: '+k);return obj;};
const pick=(obj,keys)=>{const out={};for(const k of keys)if(obj[k]!==undefined)out[k]=obj[k];return out;};
const PART_KEYS=['name','size','radius','height','position','rotation','scale','color','roughness','metalness','opacity','emissive','vertices','faces'];
function part(p){if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Part options must be an object.');for(const k of Object.keys(p))if(!PART_KEYS.includes(k))throw Error('Unsupported mesh part property: '+k);const out=pick(p,PART_KEYS);
 for(const k of['position','rotation'])if(out[k]!==undefined&&typeof out[k]==='object'&&!Array.isArray(out[k])){const v=out[k];out[k]=['x','y','z'].map(x=>v[x]??0);}
 if(out.scale!==undefined&&typeof out.scale==='object'&&!Array.isArray(out.scale)){const v=out.scale;out.scale=['x','y','z'].map(x=>v[x]??1);}
 return out;}
function sized(p,n){const o=part(p);if(o.size!==undefined){o.size=Array.isArray(o.size)?o.size.slice(0,n):['x','y','z'].slice(0,n).map(k=>o.size[k]??1);}return o;}
function cleanMaterial(m){fields(m,['color','roughness','metalness','opacity','emissive','emissiveIntensity','texture','flatShading','transparent','wireframe'],'material');const out={};for(const k of Object.keys(m))if(m[k]!==undefined)out[k]=m[k];if(!Object.keys(out).length)throw Error('Supply material properties.');return out;}

const example = `async function main(api) {
  const { project, scene, timeline, camera, lights, terrain, mesh } = api;
  project.setMode("animation");
  project.setGeneratedMode("update");           // or "replace" to rebuild generated content
  timeline.setDuration(8);
  timeline.setFPS(24);
  terrain.generate({ width: 24, depth: 24, biome: "plains", seed: 7 });
  const hero = await scene.addCharacter({ id: "hero", name: "Hero", position: { x: 0, y: 1, z: 0 } });
  timeline.keyPose(hero, { time: 1, parts: { rightArm: { rotation: { x: -120 } }, head: { rotation: { y: 20 } } } });
  timeline.keyPose(hero, { time: 3, parts: { rightArm: { rotation: { x: 0 } } } }, { ease: "smooth" });
  const sword = scene.addMesh(mesh.group("Sword").box({ size: { x: .1, y: .8, z: .1 }, color: "#c8ccd4" }), { id: "sword", name: "Sword" });
  scene.attach(sword, scene.get("hero:rightArm"));
  timeline.key(sword, { time: 2, position: { x: 1, y: 2, z: 0 }, rotation: { x: 0, y: 0, z: 90 } });
  camera.orbit({ target: { x: 0, y: 1, z: 0 }, azimuth: 40, elevation: 22, radius: 12 });
  timeline.keyCamera({ time: 4, target: { x: 0, y: 1, z: 0 }, fov: 50 });
  timeline.keySun({ time: 0, azimuth: -38, elevation: 42, intensity: 3 }, { ease: "smooth" });
  timeline.keySun({ time: 8, azimuth: 120, elevation: 12, intensity: 1.2, color: "#ffb27a" });
  lights.setEnvironment({ preset: "golden hour", exposure: 1.1 });
}`;

const jointNames={head:'head',body:'body',leftArm:'armL',rightArm:'armR',leftLeg:'legL',rightLeg:'legR',leftElbow:'forearmL',rightElbow:'forearmR',leftKnee:'shinL',rightKnee:'shinR'};
const posePresets={Idle:'idle',Walk:'walk',Run:'run',Jump:'jump',Fall:'idle',Punch:'mine',Kick:'mine',Wave:'wave',Dance:'wave',Mine:'mine',Swim:'idle',Death:'sit',Cheer:'wave',Clap:'wave'};
const lightPresets={'daylight':'day','golden hour':'golden','night':'night','studio':'studio','sunrise':'sunrise','sunset':'sunset','moonlight':'moonlight','cinematic':'cinematic'};

function meshGroup(name){
  const parts=[];
  const g=record({
    name,
    box:method(1,([p])=>{parts.push({...sized(p,3),kind:'box'});return g;}),
    sphere:method(1,([p])=>{parts.push({...sized(p,3),kind:'sphere'});return g;}),
    cylinder:method(1,([p])=>{parts.push({...sized(p,3),kind:'cylinder'});return g;}),
    cone:method(1,([p])=>{parts.push({...sized(p,3),kind:'cone'});return g;}),
    plane:method(1,([p])=>{parts.push({...sized(p,2),kind:'plane'});return g;}),
    voxel:method(1,([p])=>{parts.push({...sized(p,3),kind:'voxel'});return g;}),
    faces:method(1,([p])=>{parts.push({...sized(p,3),kind:'faces'});return g;}),
    edit:method(2,([i,p])=>{const idx=+i;if(!Number.isInteger(idx)||idx<0||idx>=parts.length)throw Error('Mesh part index out of range.');parts[idx]={...parts[idx],...part(p)};return g;}),
    clone:method(1,([n])=>meshGroup(typeof n==='string'?n:name)),
    combine:method(1,([other])=>{if(!other||!Array.isArray(other.parts))throw Error('combine needs another mesh group.');parts.push(...other.parts.map(x=>({...x})));return g;}),
    parts
  });
  return g;
}

export function compileScript(code,snapshot,catalog,options={}){
 const commands=[],newIds=[],aliases=new Map(),keys=new Map(),cameraKeys=[],sunKeys=[];let mode='animation',generatedMode=options.replaceGenerated?'replace':'update';
 const existingByAlias=new Map(),known=new Set(),usedIds=new Set();
 for(const o of snapshot.objects){known.add(o.id);const id=o.options?.scriptId;if(id){if(existingByAlias.has(id))throw Error('Duplicate generated ID in project: '+id);existingByAlias.set(id,o);aliases.set(id,o.id);known.add(id);}}
 const emit=c=>{if(commands.length>=160)throw Error('Too many script commands.');commands.push(c);};
 const handle=(id,part)=>record({id,part});
 const resolve=h=>{
   if(!h||typeof h!=='object'||Array.isArray(h))throw Error('Use a handle returned by scene.addCharacter / scene.addAsset / scene.addMesh / scene.get.');
   const id=h.id;if(typeof id!=='string')throw Error('Use a valid object handle.');
   if(!known.has(id))throw Error('Unknown object: '+id);
   usedIds.add(id);const part=h.part?(jointNames[h.part]||h.part):undefined;return {id:aliases.get(id)||id,part};
 };
 const create=(kind,p,extra={})=>{
   fields(p,['id','name','position','rotation','scale','grounded','material','skin','visibility'], 'object');
   if(typeof p.id!=='string'||!p.id)throw Error('An explicit object id is required.');
   if(aliases.has(p.id)&&!existingByAlias.has(p.id))throw Error('Duplicate script ID: '+p.id);
   const old=existingByAlias.get(p.id);if(old&&old.type!==kind)throw Error('Generated ID belongs to a different object type: '+p.id);
   aliases.set(p.id,old?old.id:p.id);usedIds.add(p.id);known.add(p.id);
   if(!old){const c={op:'add',id:p.id,kind,position:p.position?vec(p.position):[0,0,0],...extra};
     if(p.name!==undefined)c.name=p.name;
     if(p.rotation)c.rotation=vec(p.rotation);
     if(p.scale)c.scale=typeof p.scale==='number'?[p.scale,p.scale,p.scale]:vec(p.scale,[1,1,1]);
     if(p.grounded!==undefined)c.grounded=!!p.grounded;
     if(p.skin!==undefined)c.skin=String(p.skin).slice(0,24);
     if(p.visibility!==undefined)c.visibility=!!p.visibility;
     if(p.material)c.material=cleanMaterial(p.material);
     emit(c);newIds.push(p.id);}
   return handle(p.id);
 };
 const api=record({
  project:record({
   setMode:method(1,([v])=>{if(!['animation','thumbnail'].includes(v))throw Error('Mode must be animation or thumbnail.');mode=v;}),
   setGeneratedMode:method(1,([v])=>{if(!['update','replace'].includes(v))throw Error('Generated mode must be update or replace.');generatedMode=v;}),
   setUpdateMode:method(1,([v])=>{if(!['update','replace'].includes(v))throw Error('Update mode must be update or replace.');generatedMode=v;})
  }),
  scene:record({
   addCharacter:method(1,([p])=>create('character',p)),
   addAsset:method(2,([name,p])=>{
     if(name&&typeof name==='object'&&!Array.isArray(name)){const e=fields(name,['id','name','category'],'asset');const cat=e.category||'';name=e.id;p={...p,name:p?.name??e.name};if(cat==='block')return create('block',p,{block:name});if(cat==='item')return create('tool',p,{asset:name});throw Error('This adapter supports block and item assets: '+name);}
     if(typeof name!=='string')throw Error('Asset name must be a string.');
     if(catalog.tools.includes(name))return create('tool',p,{asset:name});
     if(catalog.blocks.some(b=>b.id===name)||catalog.blockAliases?.[name])return create('block',p,{block:name});
     throw Error('This adapter supports available block IDs and item names only: '+name);
   }),
   addMesh:method(2,([group,p])=>{
     if(!group||!Array.isArray(group.parts))throw Error('scene.addMesh needs a mesh group built with mesh.group().');
     fields(p,['id','name','position','rotation','scale','grounded','material','visibility'],'object');
     return create('mesh',p,{parts:group.parts.map(x=>({...x}))});
   }),
   get:method(1,([v])=>{
     if(typeof v!=='string'||!v)throw Error('scene.get needs an object id.');
     const [raw,part]=v.split(':');
     if(!known.has(raw))throw Error('Unknown object: '+raw);
     if(part&&!Object.values(jointNames).includes(part)&&!Object.keys(jointNames).includes(part))throw Error('Unknown body part: '+part);
     usedIds.add(raw);return handle(raw,part);
   }),
   remove:method(1,([h])=>{const {id}=resolve(h);emit({op:'remove',id});return true;}),
   setTransform:method(2,([h,t])=>{
     fields(t,['position','rotation','scale','visibility','opacity'],'transform');
     const {id,part}=resolve(h);
     if(part){if(t.rotation===undefined)throw Error('A body-part handle supports rotation.');emit({op:'pose',id,joints:[{joint:part,rotation:vec(t.rotation)}]});return h;}
     const c={op:'transform',id};
     for(const f of['position','rotation','scale'])if(t[f]!==undefined)c[f]=typeof t[f]==='number'&&f==='scale'?[t[f],t[f],t[f]]:vec(t[f],f==='scale'?[1,1,1]:[0,0,0]);
     if(t.visibility!==undefined)c.visibility=!!t.visibility;
     emit(c);
     if(t.opacity!==undefined)emit({op:'material',id,opacity:t.opacity});
     return h;
   }),
   setMaterial:method(2,([h,m])=>{const {id}=resolve(h);emit({op:'material',id,...cleanMaterial(m)});return h;}),
   attach:method(3,([child,parent,opt={}])=>{
     fields(opt,['position','rotation','scale'],'attach');
     const c=resolve(child);let parentId,part;
     if(parent&&typeof parent==='object'&&!Array.isArray(parent)){const p=resolve(parent);parentId=p.id;part=p.part;}
     else if(typeof parent==='string'){const [raw,pr]=parent.split(':');if(!known.has(raw))throw Error('Unknown object: '+raw);parentId=aliases.get(raw)||raw;usedIds.add(raw);part=pr;}
     else throw Error('Attach needs a parent object handle or id.');
     const a={op:'attach',id:c.id,parent:parentId};
     if(part)a.part=part;
     if(opt.position!==undefined)a.position=vec(opt.position);
     if(opt.rotation!==undefined)a.rotation=vec(opt.rotation);
     if(opt.scale!==undefined)a.scale=typeof opt.scale==='number'?[opt.scale,opt.scale,opt.scale]:vec(opt.scale,[1,1,1]);
     emit(a);return child;
   }),
   detach:method(1,([h])=>{const {id}=resolve(h);emit({op:'detach',id});return h;})
  }),
  terrain:record({
   generate:method(1,([p])=>{fields(p,['width','depth','center','biome','seed','amplitude','frequency','island','decorate','surfaceBlock'],'terrain');emit({op:'terrain_generate',...pick(p,['width','depth','center','biome','seed','amplitude','frequency','island','decorate','surfaceBlock'])});}),
   setBlock:method(1,([p])=>{fields(p,['x','y','z','blockName'],'block');emit({op:'terrain_fill',from:[p.x,p.y,p.z],to:[p.x,p.y,p.z],block:p.blockName});}),
   removeBlock:method(1,([p])=>{fields(p,['x','y','z'],'block');emit({op:'terrain_remove',x:p.x,y:p.y,z:p.z});}),
   clear:method(0,()=>emit({op:'clear_terrain'}))
  }),
  timeline:record({
   setDuration:method(1,([seconds])=>emit({op:'duration',seconds})),
   setFPS:method(1,([fps])=>emit({op:'fps',fps})),
   setPlayhead:method(1,([time])=>emit({op:'seek',time})),
   setInterpolation:method(1,([ease])=>emit({op:'interpolation',ease})),
   key:method(3,([h,k,opt={}])=>{fields(k,['time','position','rotation','scale'],'key');const {id}=resolve(h);const key={time:k.time};for(const f of['position','rotation','scale'])if(k[f]!==undefined)key[f]=typeof k[f]==='number'&&f==='scale'?[k[f],k[f],k[f]]:vec(k[f],f==='scale'?[1,1,1]:[0,0,0]);const ease=k.ease??opt.ease;if(ease!==undefined)key.ease=ease;if(!keys.has(id))keys.set(id,[]);keys.get(id).push(key);}),
   keyPose:method(3,([h,k,opt={}])=>{fields(k,['time','parts'],'pose key');fields(k.parts,Object.keys(jointNames),'parts');const joints=Object.entries(k.parts).map(([name,p])=>{fields(p,['rotation'],'part');return {joint:jointNames[name],rotation:vec(p.rotation)};});const {id}=resolve(h);if(!keys.has(id))keys.set(id,[]);const key={time:k.time,joints};const ease=k.ease??opt.ease;if(ease!==undefined)key.ease=ease;keys.get(id).push(key);}),
   keyCamera:method(2,([k,opt={}])=>{fields(k,['time','position','target','rotation','fov'],'camera key');const key={time:k.time,position:k.position?vec(k.position):undefined,target:k.target?vec(k.target):undefined,fov:k.fov};if(key.position===undefined&&key.target===undefined&&key.fov===undefined)throw Error('Camera keys need a position, target or fov.');const ease=k.ease??opt.ease;if(ease!==undefined)key.ease=ease;cameraKeys.push(key);}),
   keySun:method(2,([k,opt={}])=>{fields(k,['time','azimuth','elevation','intensity','color'],'sun key');const key={time:k.time};for(const f of['azimuth','elevation','intensity','color'])if(k[f]!==undefined)key[f]=k[f];sunKeys.push(key);}),
   preset:method(3,([h,name,opt={}])=>{const preset=posePresets[name];if(!preset)throw Error('Unknown motion preset: '+name+'. Use '+Object.keys(posePresets).join(', ')+'.');const {id}=resolve(h);const c={op:'motion',id,preset};if(opt.time!==undefined)c.start=opt.time;if(opt.duration!==undefined){const start=c.start??0;c.end=start+opt.duration;}if(opt.from!==undefined)c.from=vec(opt.from);if(opt.to!==undefined)c.to=vec(opt.to);if(opt.grounded!==undefined)c.grounded=!!opt.grounded;emit(c);})
  }),
  camera:record({
   set:method(1,([k])=>{fields(k,['position','target','rotation','fov'],'camera');const key={time:0,position:k.position?vec(k.position):undefined,target:k.target?vec(k.target):undefined,fov:k.fov};
     if(k.rotation!==undefined){const e=new THREE.Euler(k.rotation[0]*Math.PI/180,k.rotation[1]*Math.PI/180,k.rotation[2]*Math.PI/180,'XYZ');const dir=new THREE.Vector3(0,0,-1).applyEuler(e);const origin=key.position||[8,6,12];key.target=[origin[0]+dir.x,origin[1]+dir.y,origin[2]+dir.z];}
     if(key.position===undefined&&key.target===undefined&&key.fov===undefined)throw Error('Camera needs a position, target, rotation or fov.');cameraKeys.push(key);}),
   lookAt:method(1,([t])=>{const target=vec(t);cameraKeys.push({time:0,target});}),
   zoom:method(1,([fov])=>cameraKeys.push({time:0,fov})),
   orbit:method(1,([k])=>{fields(k,['target','azimuth','elevation','radius','fov'],'orbit');const target=k.target?vec(k.target):[0,1,0];const az=(k.azimuth??0)*Math.PI/180,el=(k.elevation??20)*Math.PI/180,r=k.radius??10;cameraKeys.push({time:0,position:[target[0]+Math.sin(az)*Math.cos(el)*r,target[1]+Math.sin(el)*r,target[2]+Math.cos(az)*Math.cos(el)*r],target,fov:k.fov});}),
   frame:method(2,([h,k={}])=>{const {id}=resolve(h);const rec=snapshot.objects.find(o=>o.id===(aliases.get(id)||id));const target=rec?.transform?.position||[0,1,0];const view=snapshot.camera?.view?.position||[8,6,12];const dir=new THREE.Vector3(view[0]-target[0],view[1]-target[1],view[2]-target[2]);if(dir.lengthSq()<1e-6)dir.set(1,.6,1);dir.normalize();const dist=k.distance??(rec?.type==='character'?6:8);cameraKeys.push({time:0,position:target.map((n,i)=>n+dir.toArray()[i]*dist),target,fov:k.fov});})
  }),
  lights:record({
   setEnvironment:method(1,([p])=>{fields(p,['preset','exposure','ambient','sky','horizon','fog','fogColor','grade'],'environment');const c={op:'lighting'};if(p.preset!==undefined){if(!lightPresets[p.preset])throw Error('Supported presets: '+Object.keys(lightPresets).join(', ')+'.');c.preset=lightPresets[p.preset];}for(const f of['exposure','ambient','sky','fog','fogColor'])if(p[f]!==undefined)c[f]=p[f];if(Object.keys(c).length===1)throw Error('Supply environment properties.');emit(c);}),
   setSun:method(1,([p])=>{fields(p,['azimuth','elevation','intensity','color','softness'],'sun');const c={op:'lighting'};for(const f of['azimuth','elevation','intensity','color'])if(p[f]!==undefined)c[f]=p[f];if(p.softness!==undefined)c.soft=!!p.softness;if(Object.keys(c).length===1)throw Error('Supply sun properties.');emit(c);})
  }),
  assets:record({
   search:method(2,([query,opt={}])=>{if(typeof query!=='string')throw Error('assets.search needs a query string.');fields(opt,['category','limit'],'search');const limit=Math.max(1,Math.min(100,+opt.limit||20)),q=query.toLowerCase(),out=[];
    const push=(id,name,category)=>{if(out.length>=limit)return;out.push(record({id,name,category}));};
    for(const b of catalog.blocks||[])if(b.label.toLowerCase().includes(q)||b.id.toLowerCase().includes(q))push(b.id,b.label,'block');
    for(const t of catalog.tools||[])if(t.toLowerCase().includes(q))push(t,t,'item');
    for(const m of catalog.sourceModels||[])if(m.toLowerCase().includes(q))push(m,m,'model');
    for(const t of catalog.textures||[])if(t.toLowerCase().includes(q))push(t,t,'texture');
    return out;})
  }),
  mesh:record({group:method(1,([name])=>meshGroup(typeof name==='string'?name:'mesh'))})
 });
 const math=record(Object.fromEntries(['sin','cos','tan','abs','round','floor','ceil','sqrt','min','max','pow'].map(k=>[k,native(args=>Math[k](...args))]).concat([['PI',Math.PI],['E',Math.E]])));
 interpret(code,api,math);
 let skipped=0;
 for(const [id,ks] of keys){const old=snapshot.objects.find(o=>o.id===id),occupied=(old?.character?.keys||old?.keys||[]).map(k=>k.time);
  const filtered=generatedMode==='replace'?ks:ks.filter(k=>{if(occupied.some(t=>Math.abs(t-k.time)<.001)){skipped++;return false;}return true;});
  if(filtered.length)emit({op:'animate',id,replace:generatedMode==='replace',keys:filtered});}
 const view=snapshot.camera?.view||{position:[8,6,12],target:[0,1,0],fov:45};
 for(const k of cameraKeys){if(k.position===undefined)k.position=[...view.position];if(k.target===undefined)k.target=[...view.target];if(k.fov===undefined)k.fov=view.fov;}
 const filteredCamera=generatedMode==='replace'?cameraKeys:cameraKeys.filter(k=>{if(snapshot.camera.keys.some(x=>Math.abs(x.time-k.time)<.001)){skipped++;return false;}return true;});
 if(filteredCamera.length)emit({op:'camera',replace:generatedMode==='replace',keys:filteredCamera});
 if(sunKeys.length)emit({op:'sun',keys:sunKeys});
 if(generatedMode==='replace')for(const o of snapshot.objects){const sid=o.options?.scriptId;if(sid&&!usedIds.has(sid))emit({op:'remove',id:o.id});}
 const result=compilePlan({title:'Code scene',summary:'Editable code-generated scene',commands},snapshot,catalog,'edit');
 const oldIds=new Set(snapshot.objects.map(o=>o.id));const created=result.next.objects.filter(o=>!oldIds.has(o.id));created.forEach((o,i)=>{o.options.scriptId=newIds[i];});
 return {result,mode,skipped,generatedMode};
}
export function initCodeStudio(bridge){
 const $=s=>document.querySelector(s),dialog=$('#code-dialog'),source=$('#code-source'),status=$('#code-status'),replaceBox=$('#code-replace');let compiled=null,signature='';
 source.value=example;
 const report=(s,error=false)=>{status.textContent=s;status.classList.toggle('error',error);};
 const invalidate=()=>{compiled=null;$('#code-apply').disabled=true;};
 $('#open-code').onclick=()=>{if(bridge.prepare()){invalidate();dialog.showModal();}};
 source.oninput=()=>{invalidate();report('Script changed. Validate before generating.');};
 $('#code-example').onclick=()=>{source.value=example;invalidate();report('Example loaded.');};
 $('#code-validate').onclick=()=>{invalidate();try{const snapshot=bridge.snapshot();signature=JSON.stringify(snapshot);compiled=compileScript(source.value,snapshot,bridge.catalog,{replaceGenerated:!!replaceBox?.checked});$('#code-apply').disabled=false;report(`Valid ${compiled.mode} script · ${compiled.result.stats.created} new objects · ${compiled.result.stats.animatedObjects} animated objects · ${compiled.skipped} existing keys preserved${compiled.generatedMode==='replace'?' · replace generated':''}. ${compiled.result.warnings.join(' ')}`);}catch(e){report((e.line?`Line ${e.line}, column ${e.column}: `:'')+e.message,true);}};
 $('#code-apply').onclick=()=>{if(!compiled)return;try{bridge.apply(compiled.result,signature,'Code');invalidate();dialog.close();}catch(e){invalidate();report(e.message,true);}};
 return {compile:(code)=>compileScript(code,bridge.snapshot(),bridge.catalog,{replaceGenerated:!!replaceBox?.checked}),open:()=>$('#open-code').click()};
}
