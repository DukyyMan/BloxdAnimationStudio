// A conservative adapter from the previous Studio's script syntax to editable scene commands.
import { interpret, native, record } from './script-interpreter.js';
import { compilePlan } from './ai-commands.js';

const method=(arity,fn)=>native(args=>{if(args.length>arity)throw Error('Extra arguments are not supported by this API.');return fn(args);});
const example = `async function main(api) {
  const { project, scene, timeline, camera, lights } = api;
  project.setMode("animation");
  timeline.setDuration(6);
  const hero = await scene.addCharacter({ id: "hero", name: "Hero", position: { x: 0, y: 1, z: 0 } });
  timeline.keyPose(hero, { time: 1, parts: { rightArm: { rotation: { x: -120 } }, head: { rotation: { y: 20 } } } });
  timeline.keyPose(hero, { time: 3, parts: { rightArm: { rotation: { x: 0 } } } });
  camera.set({ position: { x: 8, y: 6, z: 12 }, target: { x: 0, y: 1, z: 0 }, fov: 45 });
  lights.setEnvironment({ preset: "golden hour" });
}`;
const jointNames={head:'head',body:'body',leftArm:'armL',rightArm:'armR',leftLeg:'legL',rightLeg:'legR',leftElbow:'forearmL',rightElbow:'forearmR',leftKnee:'shinL',rightKnee:'shinR'};
const vec=(v,defaults=[0,0,0])=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Expected a vector { x, y, z }.');for(const k of Object.keys(v))if(!['x','y','z'].includes(k))throw Error('Unknown vector property: '+k);return ['x','y','z'].map((k,i)=>v[k]??defaults[i]);};
const fields=(obj,allowed,label)=>{if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error(label+' must be an object.');for(const k of Object.keys(obj))if(!allowed.includes(k))throw Error('Unsupported '+label+' property: '+k);return obj;};
export function compileScript(code,snapshot,catalog){
 const commands=[],newIds=[],aliases=new Map(), keys=new Map(), cameraKeys=[], existingByAlias=new Map(); let mode='animation';
 for(const o of snapshot.objects){const id=o.options?.scriptId;if(id){if(existingByAlias.has(id))throw Error('Duplicate generated ID in project: '+id);existingByAlias.set(id,o);}}
 const emit=c=>{if(commands.length>=160)throw Error('Too many script commands.');commands.push(c);};
 const handle=id=>record({id});
 const getId=h=>{if(!h||typeof h.id!=='string'||!aliases.has(h.id))throw Error('Use a handle returned by scene.addCharacter or scene.addAsset.');return aliases.get(h.id);};
 const create=(kind,p,extra={})=>{fields(p,['id','name','position','rotation','scale'], 'object');if(typeof p.id!=='string'||!p.id)throw Error('An explicit object id is required.');if(aliases.has(p.id))throw Error('Duplicate script ID: '+p.id);const old=existingByAlias.get(p.id);if(old&&old.type!==kind)throw Error('Generated ID belongs to a different object type: '+p.id);aliases.set(p.id,old?old.id:p.id);if(!old){const c={op:'add',id:p.id,kind,position:p.position?vec(p.position):[0,0,0],...extra};if(p.name!==undefined)c.name=p.name;if(p.rotation)c.rotation=vec(p.rotation);if(p.scale)c.scale=typeof p.scale==='number'?[p.scale,p.scale,p.scale]:vec(p.scale,[1,1,1]);emit(c);newIds.push(p.id);}return handle(p.id);};
 const api=record({
 project:record({setMode:method(1,([v])=>{if(!['animation','thumbnail'].includes(v))throw Error('Mode must be animation or thumbnail.');mode=v;})}),
 scene:record({addCharacter:method(1,([p])=>create('character',p)),addAsset:method(2,([name,p])=>{if(typeof name!=='string')throw Error('Asset name must be a string.');if(catalog.tools.includes(name))return create('tool',p,{asset:name});if(catalog.blocks.some(b=>b.id===name)||catalog.blockAliases?.[name])return create('block',p,{block:name});throw Error('This adapter supports available block IDs and item names only: '+name);})}),
 timeline:record({setDuration:method(1,([seconds])=>emit({op:'duration',seconds})),key:method(2,([h,k])=>{fields(k,['time','position','rotation','scale'],'key');const id=getId(h),key={time:k.time};for(const f of ['position','rotation','scale'])if(k[f]!==undefined)key[f]=typeof k[f]==='number'&&f==='scale'?[k[f],k[f],k[f]]:vec(k[f],f==='scale'?[1,1,1]:[0,0,0]);if(!keys.has(id))keys.set(id,[]);keys.get(id).push(key);}),keyPose:method(2,([h,k])=>{fields(k,['time','parts'],'pose key');fields(k.parts,Object.keys(jointNames),'parts');const joints=Object.entries(k.parts).map(([name,p])=>{fields(p,['rotation'],'part');return {joint:jointNames[name],rotation:vec(p.rotation)};});const id=getId(h);if(!keys.has(id))keys.set(id,[]);keys.get(id).push({time:k.time,joints});}),keyCamera:method(1,([k])=>{fields(k,['time','position','target','fov'],'camera key');cameraKeys.push({time:k.time,position:vec(k.position),target:vec(k.target),...(k.fov===undefined?{}:{fov:k.fov})});})}),
 camera:record({set:method(1,([k])=>{fields(k,['position','target','fov'],'camera');cameraKeys.push({time:0,position:vec(k.position),target:vec(k.target),...(k.fov===undefined?{}:{fov:k.fov})});})}),
 lights:record({setEnvironment:method(1,([p])=>{fields(p,['preset'],'environment');const presets={'daylight':'day','golden hour':'golden','night':'night','studio':'studio','sunrise':'sunrise','sunset':'sunset','moonlight':'moonlight','cinematic':'cinematic'};if(!presets[p.preset])throw Error('Supported presets: daylight, golden hour, sunrise, sunset, night, moonlight, cinematic, studio.');emit({op:'lighting',preset:presets[p.preset]});})}),
 terrain:record({setBlock:method(1,([p])=>{fields(p,['x','y','z','blockName'],'block');emit({op:'terrain_fill',from:[p.x,p.y,p.z],to:[p.x,p.y,p.z],block:p.blockName});})})
 });
 const math=record(Object.fromEntries(['sin','cos','tan','abs','round','floor','ceil','sqrt','min','max','pow'].map(k=>[k,native(args=>Math[k](...args))]).concat([['PI',Math.PI],['E',Math.E]])));
 interpret(code,api,math);
 let skipped=0;
 for(const [id,ks] of keys){const old=snapshot.objects.find(o=>o.id===id),occupied=(old?.character?.keys||old?.keys||[]).map(k=>k.time);const filtered=ks.filter(k=>{if(occupied.some(t=>Math.abs(t-k.time)<.001)){skipped++;return false;}return true;});if(filtered.length)emit({op:'animate',id,replace:false,keys:filtered});}
 const filteredCamera=cameraKeys.filter(k=>{if(snapshot.camera.keys.some(x=>Math.abs(x.time-k.time)<.001)){skipped++;return false;}return true;});if(filteredCamera.length)emit({op:'camera',replace:false,keys:filteredCamera});
 const result=compilePlan({title:'Code scene',summary:'Editable code-generated scene',commands},snapshot,catalog,'edit');
 const oldIds=new Set(snapshot.objects.map(o=>o.id));const created=result.next.objects.filter(o=>!oldIds.has(o.id));created.forEach((o,i)=>{o.options.scriptId=newIds[i];});
 return {result,mode,skipped};
}
export function initCodeStudio(bridge){
 const $=s=>document.querySelector(s),dialog=$('#code-dialog'),source=$('#code-source'),status=$('#code-status');let compiled=null,signature='';source.value=example;
 const report=(s,error=false)=>{status.textContent=s;status.classList.toggle('error',error);};
 const invalidate=()=>{compiled=null;$('#code-apply').disabled=true;};
 $('#open-code').onclick=()=>{if(bridge.prepare()){invalidate();dialog.showModal();}};
 source.oninput=()=>{invalidate();report('Script changed. Validate before generating.');};
 $('#code-example').onclick=()=>{source.value=example;invalidate();report('Example loaded.');};
 $('#code-validate').onclick=()=>{invalidate();try{const snapshot=bridge.snapshot();signature=JSON.stringify(snapshot);compiled=compileScript(source.value,snapshot,bridge.catalog);$('#code-apply').disabled=false;report(`Valid ${compiled.mode} script · ${compiled.result.stats.created} new objects · ${compiled.result.stats.animatedObjects} animated objects · ${compiled.skipped} existing keys preserved. ${compiled.result.warnings.join(' ')}`);}catch(e){report((e.line?`Line ${e.line}, column ${e.column}: `:'')+e.message,true);}};
 $('#code-apply').onclick=()=>{if(!compiled)return;try{bridge.apply(compiled.result,signature,'Code');invalidate();dialog.close();}catch(e){invalidate();report(e.message,true);}};
 return {compile:(code)=>compileScript(code,bridge.snapshot(),bridge.catalog),open:()=>$('#open-code').click()};
}
