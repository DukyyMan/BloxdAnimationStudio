// Editing is a draft until Apply. Carry only changed channels across a seek;
// the other animated channels must continue to sample at the chosen time.
const copy=value=>value==null?null:JSON.parse(JSON.stringify(value));
export function plainState(state){return{transform:copy(state.transform),pose:copy(state.pose),held:copy(state.held)};}
function numericLeaves(value,path=[],out=[]){
 if(typeof value==='number'&&Number.isFinite(value))out.push({path,value});
 else if(value&&typeof value==='object')for(const key of Object.keys(value))numericLeaves(value[key],[...path,key],out);
 return out;
}
function readPath(value,path){for(const key of path){if(value==null)return undefined;value=value[key];}return value;}
export function stageEdit(before,after,prior,time){
 const changes=new Map((prior?.changes||[]).map(c=>[JSON.stringify(c.path),copy(c)]));let changed=false;
 for(const c of numericLeaves(plainState(after))){let old=readPath(before,c.path);if(old===undefined&&c.path[0]==='pose'&&c.path[1] in EXTRA_DEFAULTS)old=EXTRA_DEFAULTS[c.path[1]];if(typeof old==='number'&&Math.abs(c.value-old)>1e-9){changes.set(JSON.stringify(c.path),c);changed=true;}}
 if(!changed)return copy(prior);
 return{original:plainState(prior?.original||before),changes:[...changes.values()],time};
}
// Optional per-part pose channels (pose.move / pose.scale) may be missing from
// older keys; create them with their neutral value before merging a change.
const EXTRA_DEFAULTS={move:0,scale:1};
function extraContainer(result,path){
 if(path.length!==4||path[0]!=='pose'||!(path[1] in EXTRA_DEFAULTS)||!result.pose||typeof path[2]!=='string'||!/^[0-2]$/.test(String(path[3])))return null;
 const map=result.pose[path[1]]&&typeof result.pose[path[1]]==='object'?result.pose[path[1]]:(result.pose[path[1]]={});
 if(!Array.isArray(map[path[2]]))map[path[2]]=[0,1,2].map(()=>EXTRA_DEFAULTS[path[1]]);
 return map[path[2]];
}
export function mergeEdit(base,draft){
 const result=plainState(base);if(!draft)return result;
 for(const {path,value}of draft.changes){let cursor=result;for(let i=0;i<path.length-1;i++){cursor=cursor?.[path[i]];if(cursor==null)break;}if(cursor==null)cursor=extraContainer(result,path);if(cursor&&typeof cursor[path.at(-1)]==='number')cursor[path.at(-1)]=value;}
 return result;
}
export function keyFromState(state,time,character=false,ease){
 return{time,...copy(state.transform),...(character?{pose:copy(state.pose),held:copy(state.held)}:{}),...(ease?{ease}:{})};
}
export function stateFromKey(key,character=false){
 return{transform:{position:[...key.position],rotation:[...key.rotation],scale:[...key.scale]},pose:character?copy(key.pose):null,held:character?copy(key.held):null};
}
export function validateDraft(draft,reference){
 if(!draft)return null;
 const vec=v=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000);
 const validTransform=t=>t&&vec(t.position)&&vec(t.rotation)&&vec(t.scale);
 if(!validTransform(draft.original?.transform)||!Number.isFinite(draft.time)||draft.time<0||draft.time>60||!Array.isArray(draft.changes)||draft.changes.length>60)throw new Error('Invalid pending keyframe edit.');
 if(reference.pose){if(!draft.original.pose)throw new Error('Missing pending pose.');for(const key of Object.keys(reference.pose)){const value=draft.original.pose[key];if(key==='move'||key==='scale'){if(value!==undefined&&(typeof value!=='object'||!value||Object.values(value).some(v=>!vec(v))))throw new Error('Invalid pending pose.');continue;}if(key==='offset'?!Number.isFinite(value):!vec(value))throw new Error('Invalid pending pose.');}}
 if(draft.original.held&&!validTransform(draft.original.held))throw new Error('Invalid pending held item.');
 const allowed=new Set(numericLeaves({...reference,held:reference.held||{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}}).map(c=>JSON.stringify(c.path)));
 for(const c of draft.changes)if(!Array.isArray(c.path)||c.path.some(key=>['__proto__','constructor','prototype'].includes(key))||!(allowed.has(JSON.stringify(c.path))||(reference.pose&&c.path.length===4&&c.path[0]==='pose'&&(c.path[1] in EXTRA_DEFAULTS)&&Array.isArray(reference.pose[c.path[2]])&&/^[0-2]$/.test(String(c.path[3]))))||!Number.isFinite(c.value)||Math.abs(c.value)>100000)throw new Error('Invalid pending transform channel.');
 return{original:plainState(draft.original),changes:copy(draft.changes),time:draft.time};
}
