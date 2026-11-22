// The isolated Custom Mesh Editor: a self-contained 3D workspace with its own
// renderer, camera, lights and undo history. It never touches the main scene —
// parts are plain JSON (the studio's mesh-part schema) until "Finish" hands
// them back to the caller, which then builds the object in the real scene.
//
// Supported editing (matches what buildMeshParts can actually build):
//   • box / sphere / cylinder / cone / plane parts, 1–64 per mesh
//   • move / rotate / scale a selected part (gizmo + numeric fields)
//   • per-part material: color, roughness, metalness, opacity, emissive +
//     intensity, specular (shininess), texture from the studio catalog or an
//     image asset, wireframe, flat shading
//   • delete / duplicate parts, undo / redo, save / load reusable assets
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { TransformControls } from '../vendor/controls/TransformControls.js';
import { normalizeMaterialSpec, resolveSpecTexture } from './scene-materials.js';
import { listMeshAssets, saveMeshAsset, deleteMeshAsset, meshStorageEstimate, MESH_LIMITS } from './mesh-assets.js';

const KIND_LABELS={box:'Box',sphere:'Sphere',cylinder:'Cylinder',cone:'Cone',plane:'Plane'};
const KIND_DEFAULTS={
  box:{size:[1,1,1]},
  sphere:{radius:.5},
  cylinder:{radius:.4,height:1},
  cone:{radius:.45,height:1},
  plane:{size:[1.4,1.4]},
};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

function partGeometry(p){
  switch(p.kind){
    case 'box':case 'voxel':return new THREE.BoxGeometry(...(p.size||[1,1,1]));
    case 'sphere':return new THREE.SphereGeometry(p.radius??.5,Math.max(4,Math.min(48,p.width??24)),Math.max(3,Math.min(32,p.height??16)));
    case 'cylinder':return new THREE.CylinderGeometry(p.radius??.5,p.radius??.5,p.height??1,24);
    case 'cone':return new THREE.ConeGeometry(p.radius??.5,p.height??1,24);
    case 'plane':return new THREE.PlaneGeometry(...(p.size||[1,1]));
    default:return null;
  }
}

export function createMeshEditor({host,textures={},imageAssets=[],assetId=null,initialName='Custom mesh',initialParts=null,onFinished,onCancelled}){
  // ── DOM ──────────────────────────────────────────────────────────────────
  host.innerHTML=`
  <div class="mesh-editor">
    <div class="mesh-editor-main">
      <div class="mesh-editor-toolbar">
        <span class="mesh-editor-title">CUSTOM MESH WORKSHOP <small>isolated · the main scene is untouched</small></span>
        <button class="me-btn" data-me="undo" title="Undo (Ctrl+Z)">Undo</button>
        <button class="me-btn" data-me="redo" title="Redo (Ctrl+Shift+Z)">Redo</button>
        <span class="me-sep"></span>
        <label class="me-name">Name <input data-me="name" maxlength="60" value="${esc(initialName)}"></label>
        <button class="me-btn" data-me="save-new">Save as asset</button>
        ${assetId?'<button class="me-btn" data-me="save-update" title="Overwrite the asset this mesh was opened from">Update asset</button>':''}
        <span class="me-sep"></span>
        <button class="me-btn accent" data-me="finish" title="Validate, then add this mesh to the main scene">✔ Finish · Add to Scene</button>
        <button class="me-btn" data-me="cancel">Close</button>
      </div>
      <div class="mesh-editor-workspace">
        <div class="mesh-canvas-wrap"><canvas data-me="canvas"></canvas>
          <div class="mesh-view-hint">Drag orbit · Right-drag pan · W move / E rotate / R scale · Del removes part</div>
          <div class="mesh-editor-status" data-me="status">Workshop ready.</div>
        </div>
        <aside class="mesh-editor-side">
          <div class="me-section"><b>Add part</b><div class="me-add-row">
            ${Object.entries(KIND_LABELS).map(([k,l])=>`<button class="me-chip" data-me-add="${k}">+ ${l}</button>`).join('')}
            <button class="me-chip" data-me="duplicate" title="Duplicate the selected part">⧉ Duplicate</button>
          </div></div>
          <div class="me-section"><b>Parts <span data-me="partcount"></span></b><div class="me-part-list" data-me="parts"></div></div>
          <div class="me-section" data-me="props" hidden><b>Selected part</b>
            <label>Kind <select data-me="kind">${Object.entries(KIND_LABELS).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label>
            <label class="me-size-row" data-me="row-size">Size x/y/z <input data-me="size0" type="number" step="0.05"><input data-me="size1" type="number" step="0.05"><input data-me="size2" type="number" step="0.05"></label>
            <label class="me-size-row" data-me="row-radius">Radius <input data-me="radius" type="number" step="0.05"></label>
            <label class="me-size-row" data-me="row-height">Height <input data-me="height" type="number" step="0.05"></label>
            <label class="me-size-row">Position x/y/z <input data-me="pos0" type="number" step="0.05"><input data-me="pos1" type="number" step="0.05"><input data-me="pos2" type="number" step="0.05"></label>
            <label class="me-size-row">Rotation ° x/y/z <input data-me="rot0" type="number" step="5"><input data-me="rot1" type="number" step="5"><input data-me="rot2" type="number" step="5"></label>
            <label class="me-size-row">Scale x/y/z <input data-me="scl0" type="number" step="0.1"><input data-me="scl1" type="number" step="0.1"><input data-me="scl2" type="number" step="0.1"></label>
            <div class="me-tool-row"><button class="me-chip" data-me-mode="translate">W Move</button><button class="me-chip" data-me-mode="rotate">E Rotate</button><button class="me-chip" data-me-mode="scale">R Scale</button></div>
          </div>
          <div class="me-section" data-me="material" hidden><b>Material of part</b>
            <label>Color <input data-me="color" type="color" value="#ffffff"></label>
            <label class="me-slider">Roughness <input data-me="roughness" type="range" min="0" max="1" step="0.01"><output data-me="roughness-o"></output></label>
            <label class="me-slider">Metalness <input data-me="metalness" type="range" min="0" max="1" step="0.01"><output data-me="metalness-o"></output></label>
            <label class="me-slider">Opacity <input data-me="opacity" type="range" min="0.05" max="1" step="0.01"><output data-me="opacity-o"></output></label>
            <label class="me-slider">Shininess <input data-me="specular" type="range" min="0" max="2" step="0.05"><output data-me="specular-o"></output></label>
            <label>Glow color <input data-me="emissive" type="color" value="#000000"></label>
            <label class="me-slider">Glow strength <input data-me="emissiveIntensity" type="range" min="0" max="5" step="0.1"><output data-me="emissiveIntensity-o"></output></label>
            <label>Texture <input data-me="texture" list="me-texture-list" placeholder="catalog texture or asset id" autocomplete="off"></label>
            <datalist id="me-texture-list"></datalist>
            <div class="me-tool-row">
              <button class="me-chip" data-me="tex-clear">No texture</button>
              <label class="me-check"><input type="checkbox" data-me="wireframe"> Wireframe</label>
              <label class="me-check"><input type="checkbox" data-me="flat"> Flat shading</label>
            </div>
            <button class="me-btn" data-me="mat-reset">Reset material</button>
          </div>
          <div class="me-section"><b>Saved mesh assets</b><div class="me-asset-list" data-me="assets"></div>
          <div class="me-tool-row"><button class="me-btn" data-me="assets-refresh">Refresh</button><span class="me-storage" data-me="storage"></span></div></div>
        </aside>
      </div>
    </div>
  </div>`;
  const q=s=>host.querySelector(s),qa=s=>[...host.querySelectorAll(s)];
  const canvas=q('[data-me=canvas]'),status=q('[data-me=status]');
  const say=m=>{if(!disposed)status.textContent=m;};

  // ── Renderer + isolated scene ────────────────────────────────────────────
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x1d262b);
  const camera=new THREE.PerspectiveCamera(50,1,.05,300);camera.position.set(3.2,2.6,4.4);
  const hemi=new THREE.HemisphereLight(0xf4f8ee,0x3c4640,1.35);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xfff2dd,2.4);sun.position.set(4,7,5);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-8;sun.shadow.camera.right=8;sun.shadow.camera.top=8;sun.shadow.camera.bottom=-8;
  scene.add(sun);
  const grid=new THREE.GridHelper(10,10,0x6a7d6c,0x49584c);grid.position.y=-.502;scene.add(grid);
  // Reference floor block: a deletable stand-in so height is readable.
  const floorMat=new THREE.MeshStandardMaterial({color:0x7ba05f,roughness:1});
  const floor=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),floorMat);floor.position.y=-.5;
  floor.receiveShadow=true;floor.castShadow=true;floor.name='Reference floor block';floor.userData.floor=true;
  scene.add(floor);
  const partsGroup=new THREE.Group();partsGroup.name='Mesh parts';scene.add(partsGroup);
  const orbit=new OrbitControls(camera,canvas);orbit.enableDamping=true;orbit.dampingFactor=.1;orbit.target.set(0,.2,0);
  const gizmo=new TransformControls(camera,canvas);gizmo.setSize(.8);scene.add(gizmo);
  const selectionBox=new THREE.BoxHelper(new THREE.Object3D(),0xd7fb90);selectionBox.visible=false;selectionBox.material.depthTest=false;scene.add(selectionBox);

  // ── State ────────────────────────────────────────────────────────────────
  let parts=Array.isArray(initialParts)&&initialParts.length?initialParts.map(p=>({kind:'box',name:'Part',...structuredClone(p)})):[];
  let currentAssetId=assetId,selected=-1,historyStack=[],futureStack=[],disposed=false,rotSnap=null;
  const meshes=new Map();
  function nameInput(){return q('[data-me=name]').value.trim()||'Custom mesh';}
  function snapshot(){return JSON.stringify(parts);}
  function pushHistory(label){historyStack.push({label,state:snapshot()});if(historyStack.length>80)historyStack.shift();futureStack.length=0;}
  function undo(){const e=historyStack.pop();if(!e){say('Nothing to undo.');return;}futureStack.push({label:e.label,state:snapshot()});parts=JSON.parse(e.state);if(selected>=parts.length)selected=parts.length-1;rebuild();say('Undo: '+e.label);}
  function redo(){const e=futureStack.pop();if(!e){say('Nothing to redo.');return;}historyStack.push({label:e.label,state:snapshot()});parts=JSON.parse(e.state);rebuild();say('Redo: '+e.label);}

  function materialFor(p){
    // Shininess is real specular: the vendored three only compiles
    // specularIntensity for MeshPhysicalMaterial, so parts with a shininess
    // value get a physical material (same parameters, USE_SPECULAR shader).
    const Ctor=p.specularIntensity!=null?THREE.MeshPhysicalMaterial:THREE.MeshStandardMaterial;
    const mat=new Ctor({color:p.color??'#ffffff',roughness:p.roughness??.85,metalness:p.metalness??0,
      opacity:p.opacity??1,transparent:(p.opacity??1)<1,wireframe:!!p.wireframe,flatShading:!!p.flatShading});
    if(p.emissive&&p.emissive!=='#000000'){mat.emissive=new THREE.Color(p.emissive);mat.emissiveIntensity=p.emissiveIntensity??1;}
    if(p.specularIntensity!=null)mat.specularIntensity=p.specularIntensity;
    if(p.texture){const t=resolveSpecTexture({texture:p.texture},textures,imageAssets);if(t.texture)mat.map=t.texture;else say('Texture "'+p.texture+'" not found — kept untextured.');}
    return mat;
  }
  function rebuild(){
    for(const m of meshes.values()){partsGroup.remove(m);m.geometry.dispose();m.material.dispose();}
    meshes.clear();
    parts.forEach((p,i)=>{
      const geo=partGeometry(p);if(!geo)return;
      const mesh=new THREE.Mesh(geo,materialFor(p));
      mesh.name=p.name||KIND_LABELS[p.kind]||('Part '+(i+1));
      if(p.position)mesh.position.fromArray(p.position);
      if(p.rotation)mesh.rotation.set(...p.rotation.map(THREE.MathUtils.degToRad));
      if(p.scale)mesh.scale.fromArray(p.scale);
      mesh.castShadow=mesh.receiveShadow=true;mesh.userData.partIndex=i;
      partsGroup.add(mesh);meshes.set(i,mesh);
    });
    if(selected>=0&&meshes.has(selected)){gizmo.attach(meshes.get(selected));selectionBox.setFromObject(meshes.get(selected));selectionBox.visible=true;}
    else{gizmo.detach();selectionBox.visible=false;}
    refreshPropsUI();refreshPartList();
  }
  function readBackTransform(){
    if(selected<0)return;const mesh=meshes.get(selected),p=parts[selected];if(!mesh||!p)return;
    p.position=mesh.position.toArray().map(v=>+v.toFixed(4));
    p.rotation=['x','y','z'].map(a=>+THREE.MathUtils.radToDeg(mesh.rotation[a]).toFixed(2));
    p.scale=mesh.scale.toArray().map(v=>+v.toFixed(4));
  }
  gizmo.addEventListener('objectChange',()=>{readBackTransform();refreshPropsUI();});
  gizmo.addEventListener('dragging-changed',e=>{orbit.enabled=!e.value;if(!e.value){readBackTransform();pushHistory('move part');refreshPartList();}});
  gizmo.addEventListener('change',()=>{if(gizmo.object)selectionBox.setFromObject(gizmo.object);});

  function select(i){selected=(i>=0&&i<parts.length)?i:-1;rebuild();}
  function addPart(kind){
    if(parts.length>=64){say('A mesh can hold at most 64 parts.');return;}
    const def=KIND_DEFAULTS[kind]||KIND_DEFAULTS.box;
    const p={kind,name:KIND_LABELS[kind]+' '+(parts.length+1),color:'#d8e4d2',roughness:.85,metalness:0,opacity:1,
      position:[0,.55,0],rotation:[0,0,0],scale:[1,1,1],...structuredClone(def)};
    parts.push(p);pushHistory('add '+KIND_LABELS[kind]);select(parts.length-1);say('Added '+KIND_LABELS[kind]+' part.');
  }
  function duplicatePart(){
    if(selected<0){say('Select a part to duplicate.');return;}
    if(parts.length>=64){say('A mesh can hold at most 64 parts.');return;}
    const copy=structuredClone(parts[selected]);copy.name=(parts[selected].name||'Part')+' copy';
    copy.position=[copy.position[0]+.4,copy.position[1],copy.position[2]];
    parts.splice(selected+1,0,copy);pushHistory('duplicate part');select(selected+1);say('Part duplicated.');
  }
  function deletePart(){
    if(selected<0){say('Select a part to remove.');return;}
    const p=parts.splice(selected,1)[0];pushHistory('delete '+p.name);select(Math.min(selected,parts.length-1));say('Removed '+p.name+'.');
  }
  function deleteSelectedOrFloor(){
    if(gizmo.object===floor){floor.visible=false;say('Reference floor hidden (Delete again to restore).');return;}
    if(gizmo.object&&!gizmo.object.userData.floor){deletePart();return;}
    if(!floor.visible){floor.visible=true;say('Reference floor restored.');}
  }

  // ── Side panel wiring ────────────────────────────────────────────────────
  const list=q('[data-me=parts]'),propsBox=q('[data-me=props]'),matBox=q('[data-me=material]');
  function refreshPartList(){
    q('[data-me=partcount]').textContent='('+parts.length+'/64)';
    list.replaceChildren();
    if(!parts.length){const d=document.createElement('div');d.className='me-empty';d.textContent='Empty mesh — add a part to begin.';list.append(d);return;}
    parts.forEach((p,i)=>{
      const row=document.createElement('button');row.className='me-part-row'+(i===selected?' sel':'');
      row.innerHTML=`<i style="background:${esc(p.color||'#fff')}"></i><span>${esc(p.name||KIND_LABELS[p.kind])}</span><small>${esc(p.kind)}</small>`;
      row.onclick=()=>select(i);list.append(row);
    });
  }
  function syncFields(sel,path,val){const el=q('[data-me='+sel+']');if(el&&document.activeElement!==el)el.value=val;}
  function refreshPropsUI(){
    const p=selected>=0?parts[selected]:null;
    propsBox.hidden=matBox.hidden=!p;if(!p)return;
    q('[data-me=kind]').value=KIND_LABELS[p.kind]?p.kind:'box';
    const isBox=p.kind==='box'||p.kind==='voxel',isPlane=p.kind==='plane',hasR='radius' in KIND_DEFAULTS[p.kind],hasH='height' in KIND_DEFAULTS[p.kind];
    q('[data-me=row-size]').hidden=!(isBox||isPlane);q('[data-me=row-radius]').hidden=!hasR;q('[data-me=row-height]').hidden=!hasH;
    ['size','pos','rot','scl'].forEach(pre=>{for(let i=0;i<3;i++){const el=q(`[data-me=${pre}${i}]`);if(!el)continue;
      const v=pre==='size'?(p.size?.[i]??1):pre==='pos'?(p.position?.[i]??0):pre==='rot'?(p.rotation?.[i]??0):(p.scale?.[i]??1);
      if(document.activeElement!==el)el.value=(+v).toFixed(2).replace(/\.00$/,'');}});
    syncFields('radius','r',(p.radius??.5));syncFields('height','h',(p.height??1));
    q('[data-me=color]').value=/^#[\da-fA-F]{6}$/.test(p.color||'')?p.color:'#ffffff';
    for(const [key,def] of [['roughness',.85],['metalness',0],['opacity',1],['specular',p.specularIntensity??1],['emissiveIntensity',p.emissiveIntensity??1]]){
      const el=q('[data-me='+key+']');if(el){el.value=p[key]??def;q(`[data-me=${key}-o]`).textContent=(+(p[key]??def)).toFixed(2);}}
    q('[data-me=emissive]').value=/^#[\da-fA-F]{6}$/.test(p.emissive||'')?p.emissive:'#000000';
    q('[data-me=texture]').value=p.texture||'';
    q('[data-me=wireframe]').checked=!!p.wireframe;q('[data-me=flat]').checked=!!p.flatShading;
  }
  function commit(label,fn){pushHistory(label);fn();rebuild();}
  propsBox.addEventListener('change',e=>{
    const t=e.target.getAttribute('data-me');const p=parts[selected];if(!p)return;
    const N=+e.target.value;
    if(t==='kind'){commit('change part shape',()=>{const keep={...p};const def=KIND_DEFAULTS[e.target.value]||{};Object.assign(p,def);p.kind=e.target.value;if('size' in def&&!("size" in KIND_DEFAULTS[keep.kind]))delete p.size;});}
    else if(t?.startsWith('size')){const i=+t.slice(4);commit('resize part',()=>{p.size=p.size||[1,1,1];p.size[i]=Math.max(.02,N);});}
    else if(t==='radius'){commit('resize part',()=>{p.radius=Math.max(.02,N);});}
    else if(t==='height'){commit('resize part',()=>{p.height=Math.max(.02,N);});}
    else if(t?.startsWith('pos')){commit('move part',()=>{p.position=p.position||[0,0,0];p.position[+t.slice(3)]=N;});}
    else if(t?.startsWith('rot')){commit('rotate part',()=>{p.rotation=p.rotation||[0,0,0];p.rotation[+t.slice(3)]=N;});}
    else if(t?.startsWith('scl')){commit('scale part',()=>{p.scale=p.scale||[1,1,1];p.scale[+t.slice(3)]=Math.max(.02,N);});}
  });
  matBox.addEventListener('input',e=>{
    const t=e.target.getAttribute('data-me');const p=parts[selected];if(!p)return;
    if(t==='color'){p.color=e.target.value;}
    else if(['roughness','metalness','opacity','emissiveIntensity'].includes(t)){p[t]=+e.target.value;q(`[data-me=${t}-o]`).textContent=(+e.target.value).toFixed(2);}
    else if(t==='specular'){p.specularIntensity=+e.target.value;q('[data-me=specular-o]').textContent=(+e.target.value).toFixed(2);}
    else if(t==='emissive'){p.emissive=e.target.value;}
    else if(t==='texture'){p.texture=e.target.value.trim()||undefined;}
    else if(t==='wireframe'){p.wireframe=e.target.checked;}
    else if(t==='flat'){p.flatShading=e.target.checked;}
    rebuild();
  });
  matBox.addEventListener('change',e=>{if(['color','roughness','metalness','opacity','specular','emissive','emissiveIntensity','texture','wireframe','flat'].includes(e.target.getAttribute('data-me')))pushHistory('edit material');});
  q('[data-me=mat-reset]').onclick=()=>{const p=parts[selected];if(!p)return;commit('reset material',()=>{delete p.color;delete p.roughness;delete p.metalness;delete p.opacity;delete p.emissive;delete p.emissiveIntensity;delete p.specularIntensity;delete p.texture;delete p.wireframe;delete p.flatShading;});say('Material reset to studio defaults.');};
  qa('[data-me-add]').forEach(b=>b.onclick=()=>addPart(b.getAttribute('data-me-add')));
  qa('[data-me-mode]').forEach(b=>b.onclick=()=>{gizmo.setMode(b.getAttribute('data-me-mode'));});
  q('[data-me=undo]').onclick=undo;q('[data-me=redo]').onclick=redo;
  q('[data-me=duplicate]').onclick=duplicatePart;
  q('[data-me=cancel]').onclick=()=>onCancelled?.();

  // Texture suggestions: a bounded slice of catalog names + image assets.
  {
    const dl=q('#me-texture-list');const names=Object.keys(textures).slice(0,1200);
    for(const n of names){const o=document.createElement('option');o.value=n;dl.append(o);}
    for(const a of imageAssets){const o=document.createElement('option');o.value='asset:'+a.id;o.textContent=a.name+' (image asset)';dl.append(o);}
  }

  // ── Asset library (IndexedDB) ────────────────────────────────────────────
  async function refreshAssets(){
    if(disposed)return;
    const host2=q('[data-me=assets]');host2.replaceChildren();
    try{
      const assets=await listMeshAssets();
      if(!assets.length){const d=document.createElement('div');d.className='me-empty';d.textContent='No saved meshes yet.';host2.append(d);}
      for(const a of assets){
        const row=document.createElement('div');row.className='me-asset-row';
        row.innerHTML=`<span class="me-asset-name" title="${esc(a.name)}">${esc(a.name)}</span>
          <button class="me-chip" data-open="${esc(a.id)}">Open</button>
          <button class="me-chip" data-del="${esc(a.id)}" title="Delete asset">✕</button>`;
        row.querySelector('[data-open]').onclick=async()=>{
          const fresh=await listMeshAssets().then(list=>list.find(x=>x.id===a.id));if(!fresh)return;
          parts=structuredClone(fresh.parts);currentAssetId=fresh.id;q('[data-me=name]').value=fresh.name;
          historyStack=[];futureStack=[];selected=-1;rebuild();say('Opened asset "'+fresh.name+'".');
        };
        row.querySelector('[data-del]').onclick=async()=>{await deleteMeshAsset(a.id);refreshAssets();say('Deleted asset.');};
        host2.append(row);
      }
    }catch(err){const d=document.createElement('div');d.className='me-empty';d.textContent='Mesh storage unavailable: '+err.message;host2.append(d);}
    const est=await meshStorageEstimate();
    if(disposed)return;
    const storage=q('[data-me=storage]');if(storage)storage.textContent=est&&est.quota?('Storage '+(est.usage/1048576).toFixed(1)+' MB used'):'';
  }
  async function saveAsset(update){
    const name=nameInput();
    try{
      const thumb=renderer.domElement.toDataURL('image/png');
      const rec=await saveMeshAsset({id:update?currentAssetId:null,name,parts:structuredClone(parts),thumb});
      currentAssetId=rec.id;q('[data-me=name]').value=rec.name;
      if(!update)addUpdateButton();refreshAssets();
      say('Saved mesh asset "'+rec.name+'".');
    }catch(err){say('Save failed: '+err.message);}
  }
  function addUpdateButton(){
    if(q('[data-me=save-update]'))return;
    const b=document.createElement('button');b.className='me-btn';b.setAttribute('data-me','save-update');b.textContent='Update asset';b.title='Overwrite the asset this mesh was opened from';
    b.onclick=()=>saveAsset(true);q('[data-me=save-new]').after(b);
  }
  q('[data-me=save-new]').onclick=()=>saveAsset(false);
  q('[data-me=assets-refresh]').onclick=refreshAssets;

  // ── Finish / validate ────────────────────────────────────────────────────
  q('[data-me=finish]').onclick=async()=>{
    if(!parts.length){say('Add at least one part before finishing.');return;}
    for(const p of parts){
      if(!KIND_LABELS[p.kind]){say('Part "'+p.name+'" has an unsupported kind.');return;}
      if(p.kind==='box'&&(p.size||[1,1,1]).some(v=>!(v>.001&&v<50))){say('Part "'+p.name+'" has an invalid size.');return;}
    }
    // Finishing always leaves a reusable asset behind (new asset, or an update
    // when the workspace was opened from one). Storage problems never block
    // finishing the mesh itself.
    let savedId=currentAssetId;
    try{
      const thumb=renderer.domElement.toDataURL('image/png');
      const rec=await saveMeshAsset({id:currentAssetId,name:nameInput(),parts:structuredClone(parts),thumb});
      savedId=rec.id;currentAssetId=rec.id;
      addUpdateButton();refreshAssets();
      say('Saved mesh asset "'+rec.name+'".');
    }catch(err){say('Asset could not be saved ('+err.message+') — the mesh is still added to the scene.');}
    onFinished?.({name:nameInput(),parts:structuredClone(parts),assetId:savedId});
  };

  // ── Keyboard + resize + loop ─────────────────────────────────────────────
  const keydown=e=>{
    if(disposed)return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
    if(e.ctrlKey||e.metaKey)return;
    if(e.target.matches('input,select,textarea'))return;
    if(e.key==='w'||e.key==='W')gizmo.setMode('translate');
    if(e.key==='e'||e.key==='E')gizmo.setMode('rotate');
    if(e.key==='r'||e.key==='R')gizmo.setMode('scale');
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelectedOrFloor();}
  };
  const keyup=e=>{if(e.key==='Shift')gizmo.setRotationSnap(null);};
  const shiftDown=e=>{if(e.key==='Shift'&&gizmo.object)gizmo.setRotationSnap(THREE.MathUtils.degToRad(15));};
  document.addEventListener('keydown',keydown,true);document.addEventListener('keydown',shiftDown,true);document.addEventListener('keyup',keyup,true);
  function resize(){
    const wrap=canvas.parentElement,w=wrap.clientWidth,h=wrap.clientHeight;
    if(!w||!h)return;renderer.setSize(w,h,false);renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));
    camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  const ro=new ResizeObserver(()=>resize());ro.observe(canvas.parentElement);
  function tick(){if(disposed)return;orbit.update();renderer.render(scene,camera);requestAnimationFrame(tick);}
  resize();rebuild();refreshAssets();refreshPartList();tick();

  return {
    parts:()=>structuredClone(parts),
    dispose(){
      if(disposed)return;disposed=true;
      document.removeEventListener('keydown',keydown,true);document.removeEventListener('keydown',shiftDown,true);document.removeEventListener('keyup',keyup,true);
      ro.disconnect();gizmo.dispose();orbit.dispose();
      for(const m of meshes.values()){m.geometry.dispose();m.material.dispose();}
      floor.geometry.dispose();floorMat.dispose();grid.geometry.dispose();grid.material.dispose();
      selectionBox.geometry.dispose();selectionBox.material.dispose();renderer.dispose();
      host.innerHTML='';
    },
  };
}
/** Extract editable part specs back out of a mesh object in the main scene. */
export function extractMeshParts(root){
  const parts=[];
  root?.traverse(o=>{
    if(!o.isMesh||!o.geometry?.parameters)return;
    const g=o.geometry,kind=g.type.replace('Geometry','').toLowerCase();
    if(!KIND_LABELS[kind])return;
    const mat=Array.isArray(o.material)?o.material[0]:o.material;
    const p={kind,name:o.name||'Part '+(parts.length+1),
      position:o.position.toArray().map(v=>+v.toFixed(4)),
      rotation:['x','y','z'].map(a=>+THREE.MathUtils.radToDeg(o.rotation[a]).toFixed(2)),
      scale:o.scale.toArray().map(v=>+v.toFixed(4))};
    if(kind==='box')p.size=[+g.parameters.width.toFixed(4),+g.parameters.height.toFixed(4),+g.parameters.depth.toFixed(4)];
    if(kind==='plane')p.size=[+g.parameters.width.toFixed(4),+g.parameters.height.toFixed(4)];
    if(kind==='sphere'){p.radius=+g.parameters.radius.toFixed(4);p.width=g.parameters.widthSegments;p.height=g.parameters.heightSegments;}
    if(kind==='cylinder'||kind==='cone'){p.radius=+g.parameters.radius.toFixed(4);p.height=+g.parameters.height.toFixed(4);}
    if(mat?.color)p.color='#'+mat.color.getHexString();
    if(mat){p.roughness=+mat.roughness.toFixed(2);p.metalness=+mat.metalness.toFixed(2);p.opacity=+mat.opacity.toFixed(2);
      if(mat.specularIntensity!=null)p.specularIntensity=+mat.specularIntensity.toFixed(2);
      if(mat.emissive&&mat.emissiveIntensity>0)p.emissive='#'+mat.emissive.getHexString(),p.emissiveIntensity=+mat.emissiveIntensity.toFixed(2);
      if(mat.wireframe)p.wireframe=true;if(mat.flatShading)p.flatShading=true;}
    parts.push(p);
  });
  return parts;
}
export {MESH_LIMITS};
