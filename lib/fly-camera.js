// Navigation ("fly") camera maths. Pure functions over plain numbers/arrays so
// they can be tested without a browser; the editor applies the results to the
// existing three.js camera and OrbitControls target (one camera, no second rig).
//
// Conventions: yaw rotates around world +Y (0 = looking toward -Z, like three.js
// cameras), pitch is elevation in radians (+ looks up). Pitch is clamped short
// of ±90° so the view can never flip over the pole.

export const PITCH_LIMIT=89*Math.PI/180;
export const FLY_DEFAULTS={speed:6,fastMultiplier:3.5,sensitivity:.0035,lookDistance:6,acceleration:14};

export function clampPitch(p){return Math.max(-PITCH_LIMIT,Math.min(PITCH_LIMIT,p));}
/** Unit view direction for yaw/pitch. */
export function directionFromAngles(yaw,pitch){
  const c=Math.cos(pitch);return[-Math.sin(yaw)*c,Math.sin(pitch),-Math.cos(yaw)*c];
}
/** Yaw/pitch for a (not necessarily unit) direction. */
export function anglesFromDirection(d){
  const len=Math.hypot(d[0],d[1],d[2])||1,x=d[0]/len,y=d[1]/len,z=d[2]/len;
  return{yaw:Math.atan2(-x,-z),pitch:clampPitch(Math.asin(Math.max(-1,Math.min(1,y))))};
}
/** Apply a mouse delta (pixels). Moving the mouse right turns right; up looks up. */
export function applyLook(yaw,pitch,dx,dy,sensitivity=FLY_DEFAULTS.sensitivity){
  let y=yaw-dx*sensitivity;
  // Keep yaw bounded to avoid precision loss after long sessions.
  y=Math.atan2(Math.sin(y),Math.cos(y));
  return{yaw:y,pitch:clampPitch(pitch-dy*sensitivity)};
}
/**
 * Desired velocity (world units/s) for the held movement actions.
 * Forward/back follow the full view direction (including pitch); strafing stays
 * horizontal; up/down are world-vertical. The combined input is normalized, so
 * diagonals are never faster than straight moves.
 */
export function moveVector(held,yaw,pitch,{speed=FLY_DEFAULTS.speed,fastMultiplier=FLY_DEFAULTS.fastMultiplier}={}){
  const has=id=>held.has?held.has(id):!!held[id];
  const f=(has('nav.forward')?1:0)-(has('nav.back')?1:0);
  const s=(has('nav.right')?1:0)-(has('nav.left')?1:0);
  const u=(has('nav.up')?1:0)-(has('nav.down')?1:0);
  if(!f&&!s&&!u)return[0,0,0];
  const fwd=directionFromAngles(yaw,pitch),right=[Math.cos(yaw),0,-Math.sin(yaw)];
  const v=[fwd[0]*f+right[0]*s,fwd[1]*f+u,fwd[2]*f+right[2]*s];
  const len=Math.hypot(v[0],v[1],v[2]);if(len<1e-9)return[0,0,0];
  const k=speed*(has('nav.fast')?fastMultiplier:1)/len;
  return[v[0]*k,v[1]*k,v[2]*k];
}
/** Frame-rate independent smoothing of the current velocity toward the target. */
export function smoothVelocity(current,target,dt,acceleration=FLY_DEFAULTS.acceleration){
  const a=1-Math.exp(-acceleration*Math.max(0,dt));
  return current.map((c,i)=>Math.abs(target[i])<1e-9&&Math.abs(c+(target[i]-c)*a)<1e-3?0:c+(target[i]-c)*a);
}
