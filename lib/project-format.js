// Versioned, non-destructive project migration and preflight. Runtime-only fields
// are intentionally excluded by the caller; legacy key/pose payloads stay intact.
// v4 adds optional groups, studio settings (global material overrides + custom
// sky) and per-object material / light / appearance configs — all additive, so
// v1–v3 projects keep loading unchanged.
export const PROJECT_VERSION=4;
export const MAX_DURATION=7200;
export function migrateProject(input){
  if(input?.format!=='bloxd-studio'||![1,2,3,4].includes(input.version))throw new Error('Unsupported project format or version. Keep the original file and use a compatible editor.');
  const d=structuredClone(input);
  if(!Array.isArray(d.objects)||d.objects.length>1000||!Array.isArray(d.world?.blocks)||d.world.blocks.length>1500000)throw new Error('Invalid or oversized scene.');
  const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  const numericTree=(value,depth=0)=>{if(depth>30)throw new Error('Project pose data is too deeply nested.');if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Project contains non-finite animation values.');if(value&&typeof value==='object')for(const v of Object.values(value))numericTree(v,depth+1);};
  const pose=p=>{if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('Invalid character pose.');for(const [field,value] of Object.entries(p)){if(field==='move'||field==='scale'){if(!value||typeof value!=='object'||Object.values(value).some(v=>!vector(v)))throw new Error('Invalid body-part transform.');}else if(field==='offset'?!Number.isFinite(value):!vector(value))throw new Error('Invalid pose channel '+field+'.');}};
  const keys=(list,label,camera=false)=>{
    if(!Array.isArray(list))throw new Error('Invalid '+label+' keyframes.');
    for(const k of list){
      numericTree(k);
      if(!k||!Number.isFinite(k.time)||k.time<0||!vector(k.position)||(camera?(!vector(k.target)||!Number.isFinite(k.fov)||k.fov<=0||k.fov>=180):(!vector(k.rotation)||!vector(k.scale))))throw new Error('Invalid '+label+' keyframe at '+k?.time+'.');
    }
  };
  keys(d.camera?.keys,'camera',true);
  const quaternion=q=>Array.isArray(q)&&q.length===4&&q.every(Number.isFinite)&&Math.hypot(...q)>1e-8;
  for(const k of d.camera.keys)if(k.quaternion&&!quaternion(k.quaternion))throw new Error('Invalid camera orientation.');
  if(d.camera.view?.quaternion&&!quaternion(d.camera.view.quaternion))throw new Error('Invalid saved camera orientation.');
  if(d.camera.view&&(!vector(d.camera.view.position)||!vector(d.camera.view.target)||!Number.isFinite(d.camera.view.fov)))throw new Error('Invalid saved camera view.');
  for(const o of d.objects){
    if(!o.transform||!['position','rotation','scale'].every(k=>vector(o.transform[k])))throw new Error('Invalid transform for '+o.name+'.');
    keys(o.character?.keys||o.keys||[],o.name||'object');if(o.character){numericTree(o.character.pose);numericTree(o.character.detached);pose(o.character.pose);for(const k of o.character.keys||[])pose(k.pose);}
    numericTree(o.draft);
  }
  if(!Number.isFinite(d.timeline?.duration)||d.timeline.duration<2||d.timeline.duration>MAX_DURATION)throw new Error('Animation duration must be between 2 and '+MAX_DURATION+' seconds.');
  if(d.camera.distortion){if(!Array.isArray(d.camera.distortion)||d.camera.distortion.some(k=>!Number.isFinite(k.time)||!Number.isFinite(k.amount)))throw new Error('Invalid lens distortion keys.');}
  if(d.editor?.timeline){const v=d.editor.timeline;if(v.pixelsPerSecond!=null&&(!Number.isFinite(v.pixelsPerSecond)||v.pixelsPerSecond<=0))throw new Error('Invalid timeline zoom.');if(v.scrollLeft!=null&&!Number.isFinite(v.scrollLeft))throw new Error('Invalid timeline scroll.');}
  // ── v4 optional sections (additive; absent in older projects) ──
  const hex=v=>typeof v==='string'&&/^#[\da-fA-F]{6}$/.test(v);
  const optionalHex=(v,label)=>{if(v!=null&&!hex(v))throw new Error('Invalid '+label+' color.');};
  const optionalNumber=(v,a,b,label)=>{if(v!=null&&(!Number.isFinite(v)||v<a||v>b))throw new Error('Invalid '+label+'.');};
  if(d.groups!=null){
    if(!Array.isArray(d.groups)||d.groups.length>200)throw new Error('Invalid object groups.');
    const ids=new Set();
    for(const g of d.groups){
      if(!g||typeof g.id!=='string'||g.id.length>60||ids.has(g.id)||typeof g.name!=='string'||g.name.length>60||!Array.isArray(g.members)||g.members.length>1000||g.members.some(m=>typeof m!=='string'))throw new Error('Invalid object group.');
      ids.add(g.id);
    }
  }
  if(d.settings!=null){
    if(typeof d.settings!=='object'||Array.isArray(d.settings))throw new Error('Invalid studio settings.');
    const m=d.settings.material;
    if(m!=null){
      if(typeof m!=='object')throw new Error('Invalid global material settings.');
      if(m.texture!=null&&typeof m.texture!=='string')throw new Error('Invalid global texture.');
      optionalNumber(m.smoothness,0,1,'global smoothness');
      optionalNumber(m.shininess,0,4,'global shininess');
    }
    const s=d.settings.sky;
    if(s!=null){if(typeof s!=='object')throw new Error('Invalid sky settings.');optionalHex(s.color,'sky');if(s.enabled!=null&&typeof s.enabled!=='boolean')throw new Error('Invalid sky setting.');}
  }
  for(const o of d.objects){
    const opts=o.options||{};
    if(opts.light!=null){
      const L=opts.light;if(typeof L!=='object')throw new Error('Invalid light config for '+o.name+'.');
      optionalHex(L.color,'light');
      optionalNumber(L.intensity,0,200,'light intensity');optionalNumber(L.range,.5,60,'light range');
      optionalNumber(L.flicker,0,1,'light flicker');optionalNumber(L.angle,4,85,'light cone');optionalNumber(L.soft,0,1,'light softness');optionalNumber(L.decay,0,4,'light decay');
      if(L.position!=null&&(!Array.isArray(L.position)||L.position.length!==3||L.position.some(v=>!Number.isFinite(v))))throw new Error('Invalid light position.');
    }
    if(opts.appearance!=null){
      const A=opts.appearance;if(typeof A!=='object')throw new Error('Invalid character appearance for '+o.name+'.');
      if(A.tint!=null&&typeof A.tint!=='string')throw new Error('Invalid character tint.');
      if(A.skin!=null&&(typeof A.skin!=='string'||!A.skin.startsWith('data:image/')))throw new Error('Invalid custom skin.');
      if(A.armor!=null&&typeof A.armor==='object')for(const v of Object.values(A.armor))if(v!=null&&typeof v!=='string')throw new Error('Invalid armor selection.');
    }
    if(opts.material!=null){
      const M=opts.material;if(typeof M!=='object')throw new Error('Invalid material settings for '+o.name+'.');
      optionalHex(M.color,'material');optionalHex(M.emissive,'emissive');
      optionalNumber(M.roughness,0,1,'material roughness');optionalNumber(M.metalness,0,1,'material metalness');
      optionalNumber(M.opacity,0,1,'material opacity');optionalNumber(M.emissiveIntensity,0,20,'emissive intensity');optionalNumber(M.specularIntensity,0,4,'material shininess');
      if(M.texture!=null&&typeof M.texture!=='string')throw new Error('Invalid material texture.');
    }
  }
  // Optional additive editor settings migrate without changing legacy animation data.
  d.editor={cameraMode:'first-person',guides:true,timeline:{pixelsPerSecond:null,autoScroll:true,scrollLeft:0},...d.editor};
  return d;
}

// IndexedDB commits are atomic: a failed write never replaces a valid recovery.
export async function recoveryStore(action,data){
  const checked=action==='read'?null:migrateProject(data);
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('bloxd-studio-recovery',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('projects',action==='read'?'readonly':'readwrite'),s=tx.objectStore('projects');let value;
    const r=action==='read'?s.get('latest'):s.put({savedAt:Date.now(),project:checked},'latest');
    r.onsuccess=()=>{value=r.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Recovery write aborted.'));
  });}finally{db.close();}
}
