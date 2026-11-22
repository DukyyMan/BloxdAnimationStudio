// Reusable custom-mesh asset library, persisted in IndexedDB so saved meshes
// survive across projects and browser sessions (same storage approach as the
// project recovery store — no server, no paid cloud).
const DB_NAME='bloxd-studio-mesh-assets';
const STORE='meshes';
const MAX_ASSETS=200;
const MAX_PARTS_BYTES=2_000_000;

function open(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error||new Error('Could not open the custom mesh storage.'));
  });
}
export async function listMeshAssets(){
  const db=await open();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'),s=tx.objectStore(STORE);
      const req=s.getAll();req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)));
      tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Could not list custom meshes.'));
    });
  }finally{db.close();}
}
export async function getMeshAsset(id){
  const db=await open();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'),s=tx.objectStore(STORE);
      const req=s.get(id);req.onsuccess=()=>resolve(req.result||null);
      tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Could not read the custom mesh.'));
    });
  }finally{db.close();}
}
/** Validate + store. `parts` mirrors the studio mesh-part schema (1..64 parts). */
export async function saveMeshAsset({id,name,parts,thumb}){
  if(typeof name!=='string'||!name.trim())throw new Error('Name the mesh before saving.');
  if(!Array.isArray(parts)||parts.length<1||parts.length>64)throw new Error('A mesh needs 1–64 parts.');
  const payload=JSON.stringify(parts);
  if(payload.length>MAX_PARTS_BYTES)throw new Error('This mesh is too large to save (2 MB limit).');
  if(typeof thumb!=='string'||!thumb.startsWith('data:image/'))thumb='';
  const db=await open();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite'),s=tx.objectStore(STORE);
      const now=Date.now();
      const put=(rec)=>{const req=s.put(rec);req.onsuccess=()=>resolve(rec);};
      const get=s.get(id||'');
      get.onsuccess=()=>{
        const existing=get.result;
        if(!id&&existing)throw new Error('A mesh with this id already exists.');
        put({id:id||('mesh-'+now.toString(36)+Math.random().toString(36).slice(2,7)),name:String(name).trim().slice(0,60),
          createdAt:existing?.createdAt||now,updatedAt:now,parts,thumb:thumb||existing?.thumb||''});
      };
      tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Could not save the custom mesh.'));
    });
  }finally{db.close();}
}
export async function deleteMeshAsset(id){
  const db=await open();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite'),s=tx.objectStore(STORE);
      const req=s.delete(id);req.onsuccess=()=>resolve(true);
      tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Could not delete the custom mesh.'));
    });
  }finally{db.close();}
}
export async function meshStorageEstimate(){
  try{const e=await navigator.storage?.estimate?.();return e?{usage:e.usage||0,quota:e.quota||0}:null;}
  catch{return null;}
}
export const MESH_LIMITS={MAX_ASSETS,MAX_PARTS_BYTES};
