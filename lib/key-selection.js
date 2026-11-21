// Multi-key selection, clipboard and group moves for the existing pose and
// camera tracks. Keys are identified by time: every track keeps at most one key
// per time (see putKey / KEY_EPS), so a time list survives the cloning that
// undo/redo and track replacement perform.
import { KEY_EPS } from './tracks.js';

const copy=v=>JSON.parse(JSON.stringify(v));
export const round2=t=>Math.round(t*100)/100;
const same=(a,b)=>Math.abs(a-b)<=KEY_EPS;

export function emptySelection(){return{type:null,owner:null,times:[],anchor:null};}
export function isSelected(sel,type,owner,time){return!!sel&&sel.type===type&&(type==='camera'||sel.owner===owner)&&sel.times.some(t=>same(t,time));}
function sorted(times){return[...new Set(times.map(round2))].sort((a,b)=>a-b);}
/** Single selection (plain click). */
export function selectOnly(type,owner,time){return{type,owner:type==='camera'?null:owner,times:[time],anchor:time};}
/** Ctrl/Cmd-click: toggle one key. A different track starts a new selection. */
export function toggleKey(sel,type,owner,time){
  if(!sel||sel.type!==type||(type!=='camera'&&sel.owner!==owner))return selectOnly(type,owner,time);
  const has=sel.times.some(t=>same(t,time));
  const times=has?sel.times.filter(t=>!same(t,time)):sorted([...sel.times,time]);
  return{type,owner:sel.owner,times,anchor:has?(times[0]??null):time};
}
/** Shift-click: every key between the anchor and the clicked key (inclusive). */
export function rangeSelect(sel,type,owner,time,keys){
  const anchor=sel&&sel.type===type&&(type==='camera'||sel.owner===owner)&&sel.anchor!=null?sel.anchor:time;
  const lo=Math.min(anchor,time)-KEY_EPS,hi=Math.max(anchor,time)+KEY_EPS;
  return{type,owner:type==='camera'?null:owner,times:sorted(keys.filter(k=>k.time>=lo&&k.time<=hi).map(k=>k.time)),anchor};
}
/** Rectangle (time window) selection; additive keeps the existing keys of the same track. */
export function rectSelect(sel,type,owner,keys,t0,t1,additive=false){
  const lo=Math.min(t0,t1)-KEY_EPS,hi=Math.max(t0,t1)+KEY_EPS;
  const picked=keys.filter(k=>k.time>=lo&&k.time<=hi).map(k=>k.time);
  const keep=additive&&sel&&sel.type===type&&(type==='camera'||sel.owner===owner)?sel.times:[];
  const times=sorted([...keep,...picked]);
  return{type,owner:type==='camera'?null:owner,times,anchor:times[0]??null};
}
export function selectAll(type,owner,keys){const times=sorted(keys.map(k=>k.time));return{type,owner:type==='camera'?null:owner,times,anchor:times[0]??null};}
/** The selected key objects, in time order. */
export function selectedKeys(sel,keys){if(!sel?.times?.length)return[];return keys.filter(k=>sel.times.some(t=>same(t,k.time))).sort((a,b)=>a.time-b.time);}

/** Clipboard payload: deep copies with times relative to the first copied key. */
export function copyKeys(sel,keys,meta={}){
  const list=selectedKeys(sel,keys);if(!list.length)return null;
  const start=list[0].time;
  return{type:sel.type,...meta,span:round2(list.at(-1).time-start),keys:list.map(k=>({...copy(k),time:round2(k.time-start)}))};
}
/**
 * Paste clipboard keys so the first lands at `at`, preserving relative timing
 * and every key field (pose, transform, held item, easing, fov …). Keys that
 * land on an existing key replace it. Returns the new key list and pasted times.
 */
export function pasteKeys(keys,clip,at,{maxTime=60}={}){
  const out=keys.map(copy),times=[];let dropped=0;
  for(const k of clip.keys){
    const time=round2(at+k.time);
    if(time<0||time>maxTime+KEY_EPS){dropped++;continue;}
    // Exact replacement (not putKey): a pasted key keeps its own easing, or lack of it.
    const i=out.findIndex(o=>same(o.time,time)),key={...copy(k),time};
    if(i>=0)out[i]=key;else out.push(key);times.push(time);
  }
  return{keys:out.sort((a,b)=>a.time-b.time),times:sorted(times),dropped};
}
/** Clamp a group delta so every selected key stays inside [0,duration]. */
export function clampDelta(sel,delta,duration){
  if(!sel?.times?.length)return 0;
  const lo=Math.min(...sel.times),hi=Math.max(...sel.times);
  return Math.max(-lo,Math.min(duration-hi,delta));
}
/**
 * Move every selected key by `delta` seconds. Moved keys keep all data; an
 * unselected key at a destination time is replaced (same rule as a single drag).
 */
export function moveKeys(keys,sel,delta,duration){
  const d=round2(clampDelta(sel,delta,duration));
  const moving=selectedKeys(sel,keys);if(!moving.length||!d)return{keys:keys.map(copy),times:sel.times.slice(),delta:0};
  const movedTimes=moving.map(k=>round2(k.time+d));
  const out=keys.filter(k=>!moving.includes(k)&&!movedTimes.some(t=>same(t,k.time))).map(copy);
  for(const k of moving)out.push({...copy(k),time:round2(k.time+d)});
  out.sort((a,b)=>a.time-b.time);
  return{keys:out,times:sorted(movedTimes),delta:d};
}
/** Remove the selected keys. */
export function deleteKeys(keys,sel){const list=selectedKeys(sel,keys);return keys.filter(k=>!list.includes(k)).map(copy);}
/** Where a duplicate of the selection should start: the playhead, or just after the selection. */
export function duplicateStart(sel,playhead,step=.1){
  if(!sel?.times?.length)return playhead;
  const last=Math.max(...sel.times);
  if(playhead>last+KEY_EPS)return round2(playhead);
  return round2(last+Math.max(step,.01));
}
