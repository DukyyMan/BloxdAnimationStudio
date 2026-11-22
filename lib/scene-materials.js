// Per-object material editing + the non-destructive global override layer.
//
// A material spec is the user-facing shape used by the inspector, the Code
// Editor and project files: {color, roughness, metalness, opacity, emissive,
// emissiveIntensity, texture, transparent, flatShading, wireframe,
// specularIntensity}. Applying it records the untouched values once per
// material, so resetting or disabling overrides brings the original art back.
// Smoothness is the user-facing inverse of the PBR roughness; Shininess maps to
// the renderer's specularIntensity (specular highlight strength), not to color.
import * as THREE from 'three';

const SPEC_KEYS=['color','roughness','metalness','opacity','emissive','emissiveIntensity','texture','transparent','flatShading','wireframe','specularIntensity'];
const hex=v=>typeof v==='string'&&/^#[\da-fA-F]{6}$/.test(v)?v:null;
const num=(v,a,b)=>Number.isFinite(+v)?THREE.MathUtils.clamp(+v,a,b):undefined;

export function normalizeMaterialSpec(input){
  const out={};
  if(!input||typeof input!=='object')return out;
  if(hex(input.color))out.color=input.color;
  if(num(input.roughness,0,1)!==undefined)out.roughness=num(input.roughness,0,1);
  if(num(input.metalness,0,1)!==undefined)out.metalness=num(input.metalness,0,1);
  if(num(input.opacity,0,1)!==undefined)out.opacity=num(input.opacity,0,1);
  if(hex(input.emissive))out.emissive=input.emissive;
  if(num(input.emissiveIntensity,0,20)!==undefined)out.emissiveIntensity=num(input.emissiveIntensity,0,20);
  if(num(input.specularIntensity,0,4)!==undefined)out.specularIntensity=num(input.specularIntensity,0,4);
  if(typeof input.texture==='string')out.texture=input.texture.slice(0,300);
  if(input.transparent!==undefined)out.transparent=!!input.transparent;
  if(input.flatShading!==undefined)out.flatShading=!!input.flatShading;
  if(input.wireframe!==undefined)out.wireframe=!!input.wireframe;
  return out;
}
export function specHasContent(spec){return spec&&Object.keys(normalizeMaterialSpec(spec)).length>0;}

function snapshot(m){
  return {
    color:(m.color||new THREE.Color(0xffffff)).clone(),roughness:m.roughness,metalness:m.metalness,opacity:m.opacity,
    transparent:m.transparent,emissive:(m.emissive||new THREE.Color(0x000000)).clone(),emissiveIntensity:m.emissiveIntensity,
    map:m.map||null,
    // specularIntensity only exists on MeshPhysicalMaterial — never write the
    // dead property onto a plain MeshStandardMaterial original.
    ...(m.specularIntensity!==undefined?{specularIntensity:m.specularIntensity}:{}),
    flatShading:!!m.flatShading,wireframe:!!m.wireframe,
  };
}
function restore(m,snap){
  // Exotic standard-flagged materials may lack color/emissive — restore only
  // what both the material and the snapshot actually have.
  if(m.color&&snap.color)m.color.copy(snap.color);m.roughness=snap.roughness;m.metalness=snap.metalness;
  m.opacity=snap.opacity;m.transparent=snap.transparent;if(m.emissive&&snap.emissive)m.emissive.copy(snap.emissive);
  m.emissiveIntensity=snap.emissiveIntensity;m.map=snap.map;
  if(snap.specularIntensity!==undefined)m.specularIntensity=snap.specularIntensity;
  m.flatShading=snap.flatShading;m.wireframe=snap.wireframe;m.needsUpdate=true;
}
/** First application memorizes the untouched state for reset / override-off. */
function rememberOriginal(m){
  if(!m.userData.__materialOriginal)m.userData.__materialOriginal=snapshot(m);
}
// ── Real specular (shininess) ────────────────────────────────────────────────
// The vendored three build only compiles the specularIntensity uniform for
// MeshPhysicalMaterial (USE_SPECULAR); plain MeshStandardMaterial ignores it.
// Setting shininess therefore converts the mesh's material(s) to a physical
// copy once, and reset/override-off swaps the original material instance back.
function copyStandardFields(target,m){
  // Explicit copy: Material.copy()/clone() JSON-serialize userData, which would
  // destroy the remembered original snapshot (Color instances → bare numbers).
  target.name=m.name;
  target.color=m.color?m.color.clone():new THREE.Color(0xffffff);target.roughness=m.roughness;target.metalness=m.metalness;
  target.map=m.map;target.lightMap=m.lightMap;target.lightMapIntensity=m.lightMapIntensity;
  target.aoMap=m.aoMap;target.aoMapIntensity=m.aoMapIntensity;
  target.emissive=m.emissive?m.emissive.clone():new THREE.Color(0x000000);target.emissiveIntensity=m.emissiveIntensity;target.emissiveMap=m.emissiveMap;
  target.bumpMap=m.bumpMap;target.bumpScale=m.bumpScale;
  target.normalMap=m.normalMap;target.normalMapType=m.normalMapType;if(m.normalScale)target.normalScale=m.normalScale.clone();
  target.displacementMap=m.displacementMap;target.displacementScale=m.displacementScale;target.displacementBias=m.displacementBias;
  target.roughnessMap=m.roughnessMap;target.metalnessMap=m.metalnessMap;
  target.alphaMap=m.alphaMap;target.alphaTest=m.alphaTest;
  target.envMap=m.envMap;target.envMapIntensity=m.envMapIntensity;target.combine=m.combine;
  target.wireframe=m.wireframe;target.flatShading=m.flatShading;
  target.fog=m.fog;target.blending=m.blending;target.side=m.side;target.vertexColors=m.vertexColors;
  target.transparent=m.transparent;target.opacity=m.opacity;target.depthTest=m.depthTest;target.depthWrite=m.depthWrite;
  target.toneMapped=m.toneMapped;target.shadowSide=m.shadowSide;
  target.needsUpdate=true;
  return target;
}
function physicalCopy(m){
  // MeshPhysicalMaterial.copy() reads physical-only fields (sheen/clearcoat
  // scales…) that a MeshStandardMaterial source does not have, so the standard
  // property set is copied explicitly instead.
  const p=copyStandardFields(new THREE.MeshPhysicalMaterial(),m);
  p.userData=m.userData;        // keep the original-state bookkeeping shared
  return p;
}
function swapToPhysical(o){
  const created=[];
  const swapOne=m=>{const p=physicalCopy(m);created.push(p);return p;};
  if(Array.isArray(o.material)){
    o.userData.__materialSwapBack??={original:o.material.slice()};
    o.material=o.material.map(swapOne);
  }else{
    o.userData.__materialSwapBack??={original:o.material};
    o.material=swapOne(o.material);
  }
  return created;
}
function swapBack(o){
  const s=o.userData?.__materialSwapBack;
  if(!s)return false;
  const old=Array.isArray(o.material)?o.material.slice():[o.material];
  o.material=s.original;
  delete o.userData.__materialSwapBack;
  for(const m of old)m?.dispose?.();
  return true;
}
/** Give a mesh its own instances, then convert them once to physical materials. */
export function ensureSpecularPhysical(o){
  const mats=Array.isArray(o.material)?o.material.slice():[o.material];
  if(mats.every(m=>m?.isMeshPhysicalMaterial))return [];
  const owned=mats.map(m=>{
    if(!m||!m.isMeshStandardMaterial||m.isMeshPhysicalMaterial||m.userData.__ownedMaterial)return m;
    rememberOriginal(m);
    const own=copyStandardFields(new THREE.MeshStandardMaterial(),m);
    own.userData=Object.assign({},m.userData,{__ownedMaterial:true});
    return own;
  });
  if(Array.isArray(o.material))o.material=owned;
  else o.material=owned[0];
  return swapToPhysical(o);
}
export function materialOriginals(root){
  const out=[];
  root?.traverse?.(o=>{if(o.isMesh)for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m?.userData?.__materialOriginal)out.push({material:m,original:m.userData.__materialOriginal});});
  return out;
}
/** Resolve a texture reference: catalog key, 'asset:<imageId>' or data URL. */
export function resolveSpecTexture(spec,textures={},imageAssets=[]){
  const name=spec?.texture;
  if(!name||typeof name!=='string')return {texture:null,reason:'none'};
  if(name.startsWith('asset:')){
    const asset=imageAssets.find(a=>a.id===name.slice(6)&&a.tex);
    return asset?{texture:asset.tex}:{texture:null,reason:'missing image asset'};
  }
  if(name.startsWith('data:image/'))return {texture:null,reason:'embedded textures are not supported on scene objects; save them as an image asset or mesh asset first'};
  if(textures[name])return {texture:textures[name]};
  return {texture:null,reason:'unknown texture'};
}
/**
 * Apply a material spec to every mesh material of `root`. `textures` maps
 * catalog texture names to THREE textures; `imageAssets` the studio image
 * assets ({id,tex}). Returns {applied, skipped:[reasons]}.
 */
export function applyMaterialSpec(root,spec,{textures={},imageAssets=[]}={}){
  const out={applied:false,skipped:[]};
  const clean=normalizeMaterialSpec(spec);
  if(!root||!Object.keys(clean).length)return out;
  const tex=resolveSpecTexture(clean,textures,imageAssets);
  if(clean.texture&&tex.texture===null&&tex.reason!=='none')out.skipped.push(tex.reason);
  root.traverse(o=>{
    if(!o.isMesh)return;
    if(clean.specularIntensity===undefined)swapBack(o);   // shininess removed → un-convert
    else ensureSpecularPhysical(o);                       // own + convert every slot exactly once
    const list=Array.isArray(o.material)?o.material:[o.material];
    for(let i=0;i<list.length;i++){
      let m=list[i];
      if(!m||!m.isMeshStandardMaterial)continue;
      rememberOriginal(m);
      // Studio assets often share material instances across records (tool +
      // stand copies…). Editing must never leak between objects, so on first
      // edit the mesh gets its own clone; the shared instance stays untouched.
      if(!m.userData.__ownedMaterial){
        const own=copyStandardFields(new THREE.MeshStandardMaterial(),m);
        own.userData=Object.assign({},m.userData,{__ownedMaterial:true});
        if(Array.isArray(o.material)){o.material=o.material.slice();o.material[i]=own;}
        else o.material=own;
        m=own;
      }
      if(clean.color)m.color.set(clean.color);
      if(clean.roughness!==undefined)m.roughness=clean.roughness;
      if(clean.metalness!==undefined)m.metalness=clean.metalness;
      if(clean.opacity!==undefined){m.opacity=clean.opacity;m.transparent=clean.transparent||clean.opacity<1;}
      else if(clean.transparent!==undefined)m.transparent=clean.transparent;
      if(clean.emissive){m.emissive.set(clean.emissive);m.emissiveIntensity=clean.emissiveIntensity??1;}
      if(clean.emissiveIntensity!==undefined&&clean.emissive)m.emissiveIntensity=clean.emissiveIntensity;
      if(clean.specularIntensity!==undefined)m.specularIntensity=clean.specularIntensity;
      if(clean.texture!==undefined){m.map=tex.texture||null;m.needsUpdate=true;}
      if(clean.flatShading!==undefined)m.flatShading=clean.flatShading;
      if(clean.wireframe!==undefined)m.wireframe=clean.wireframe;
      m.needsUpdate=true;out.applied=true;
    }
  });
  return out;
}
/** Restore every touched material of `root` to its pre-edit state. */
export function restoreOriginalMaterials(root){
  if(!root)return false;
  let any=false;
  root.traverse(o=>{
    if(!o.isMesh)return;
    if(swapBack(o))any=true;
  });
  for(const {material,original} of materialOriginals(root)){restore(material,original);any=true;}
  return any;
}

// ── Global override layer ────────────────────────────────────────────────────
// settings.material = {texture:'', smoothness:null|0..1, shininess:null|0..1}.
// null/'' means "no override". Overrides never rewrite r.options.material:
// they sit above it and are reverted per material on disable.
export function materialOverrideEligible(r){
  if(!r)return false;
  if(r.character)return false;             // characters keep their skin art
  if(r.type==='particles'||r.type==='image')return false; // shaders / basic panels
  return true;
}
export function globalOverrideSummary(objects,settings){
  const eligible=objects.filter(materialOverrideEligible);
  return {eligible:eligible.length,excluded:objects.length-eligible.length,
    excludedTypes:[...new Set(objects.filter(r=>!materialOverrideEligible(r)).map(r=>r.character?'character':r.type))]};
}
export function applyGlobalMaterialOverrides(objects,settings,{textures={},imageAssets=[]}={}){
  const cfg=settings?.material||{};
  const active=cfg.texture||cfg.smoothness!=null||cfg.shininess!=null;
  for(const r of objects){
    if(!materialOverrideEligible(r))continue;
    // Always start from the object's own edited state (spec if present), then stack overrides.
    if(specHasContent(r.options?.material))applyMaterialSpec(r.root,r.options.material,{textures,imageAssets});
    else restoreOriginalMaterials(r.root);
    if(!active)continue;
    r.root.traverse(o=>{
      if(!o.isMesh)return;
      if(cfg.shininess!=null)ensureSpecularPhysical(o);    // own + convert once per mesh
      const list=Array.isArray(o.material)?o.material:[o.material];
      for(let i=0;i<list.length;i++){
        let m=list[i];
        if(!m||!m.isMeshStandardMaterial)continue;
        rememberOriginal(m);
        if(cfg.texture){
          const t=resolveSpecTexture({texture:cfg.texture},textures,imageAssets);
          if(t.texture){m.map=t.texture;m.needsUpdate=true;}
        }
        if(cfg.smoothness!=null){m.roughness=1-THREE.MathUtils.clamp(cfg.smoothness,0,1);m.needsUpdate=true;}
        if(cfg.shininess!=null){m.specularIntensity=THREE.MathUtils.clamp(cfg.shininess,0,4);m.needsUpdate=true;}
      }
    });
  }
  return active;
}
