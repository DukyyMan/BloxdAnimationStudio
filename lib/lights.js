// Managed dynamic-light system. Every light in a scene object is owned by a
// LightRig with a serializable config, so inspector edits, project save/load,
// timeline scrubbing and video export all read the same data. Flicker is a pure
// function of (time, seed): frame-exact for video export and scrubbing, and it
// never mutates the config. Dynamic lights never cast shadows (the sun does) and
// a global cap keeps giant scenes responsive.
import * as THREE from 'three';

export const MAX_DYNAMIC_LIGHTS=40;
export const MAX_EMITTER_LIGHTS=12;

// Sensible defaults per light-emitting thing. Not every object lights up:
// these are the studio assets whose appearance or behavior is luminous.
// `position` is the light's offset inside the object (local space).
export const LIGHT_PRESETS={
  lamp:{enabled:true,kind:'point',color:'#ffbd64',intensity:12,range:7,flicker:0,decay:2,position:[0,2,0]},
  fire:{enabled:true,kind:'point',color:'#ff9a3c',intensity:3.2,range:5.5,flicker:.45,decay:2,position:[0,.7,0]},
  sparkle:{enabled:true,kind:'point',color:'#e6d9ff',intensity:1.5,range:3.2,flicker:.7,decay:2,position:[0,.5,0]},
  'point-light':{enabled:true,kind:'point',color:'#ffffff',intensity:8,range:9,flicker:0,decay:2,position:[0,0,0]},
  'spot-light':{enabled:true,kind:'spot',color:'#fff3d6',intensity:60,range:16,flicker:0,angle:38,soft:.35,decay:2,position:[0,0,0]},
};
export const LIGHT_FIELDS=['enabled','kind','color','intensity','range','flicker','angle','soft','decay','position'];

const hex=v=>typeof v==='string'&&/^#[\da-fA-F]{6}$/.test(v)?v:null;
const num=(v,a,b,d)=>Number.isFinite(+v)?THREE.MathUtils.clamp(+v,a,b):d;
const vec3=(v,def)=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)?v.map(n=>THREE.MathUtils.clamp(n,-20,20)):def.slice();

/** Validate an unknown saved/config object into a complete light config. */
export function normalizeLightConfig(input,preset){
  const base=LIGHT_PRESETS[preset]||LIGHT_PRESETS['point-light'];
  const src=input&&typeof input==='object'?input:{};
  const out={...base};
  if(src.enabled!==undefined)out.enabled=!!src.enabled;
  if(src.kind==='spot'||src.kind==='point')out.kind=src.kind;
  if(hex(src.color))out.color=src.color;
  out.intensity=num(src.intensity,0,200,base.intensity);
  out.range=num(src.range,.5,60,base.range);
  out.flicker=num(src.flicker,0,1,base.flicker);
  out.angle=num(src.angle??base.angle,4,85,base.angle);
  out.soft=num(src.soft??base.soft,0,1,base.soft);
  out.decay=num(src.decay,0,4,base.decay);
  out.position=vec3(src.position,base.position);
  return out;
}

let registry=new Set();let emitterLights=0;
export function lightCount(){return registry.size;}
export function emitterLightCount(){return emitterLights;}
export function canAddEmitterLight(){return emitterLights<MAX_EMITTER_LIGHTS;}
/** Editor-only visuals hide themselves while the clip plays or renders. */
export function setLightVisualsHidden(hidden){for(const rig of registry)if(rig.marker)rig.marker.visible=!hidden&&rig.cfg.enabled;}

/**
 * Attach a managed light to `root`. Config comes from the caller (already
 * normalized). `marker` is an optional editor-visible gizmo child that the
 * animate loop can hide during playback/video. Returns the rig or null.
 */
export function attachLightRig(root,cfg,{marker=null,isEmitter=false}={}){
  if(!root)return null;
  if(registry.size>=MAX_DYNAMIC_LIGHTS)return null;
  if(isEmitter&&!canAddEmitterLight())return null;
  const light=cfg.kind==='spot'
    ?new THREE.SpotLight(cfg.color,cfg.intensity,cfg.range,THREE.MathUtils.degToRad(cfg.angle),cfg.soft,cfg.decay)
    :new THREE.PointLight(cfg.color,cfg.intensity,cfg.range,cfg.decay);
  light.name='Studio light';
  const target=new THREE.Object3D();target.name='Light aim';target.position.set(0,-1,0);
  if(cfg.kind==='spot'){root.add(target);light.target=target;}
  else light.position.set(0,0,0);
  root.add(light);
  const rig={cfg,light,target,marker,isEmitter,root,seed:registry.size};
  registry.add(rig);
  if(isEmitter)emitterLights++;
  applyLightConfig(rig,cfg);
  return rig;
}
/** Live-apply a (new) config. Never disposes the THREE light. */
export function applyLightConfig(rig,cfg){
  if(!rig)return;
  Object.assign(rig.cfg,cfg);
  const c=rig.cfg;
  if(!/^#[\da-fA-F]{6}$/.test(String(c.color??'')))c.color='#ffffff';
  rig.light.color.set(c.color);
  rig.light.intensity=c.enabled?flickerlessIntensity(c):0;
  rig.light.distance=c.range;rig.light.decay=c.decay;
  rig.light.position.set(...c.position);
  if(c.kind==='spot'&&rig.light.isSpotLight){
    rig.light.angle=THREE.MathUtils.degToRad(c.angle);
    rig.light.penumbra=c.soft;
  }
  if(rig.marker)rig.marker.visible=c.enabled;
}
/** Deterministic flicker gain at time t (pure → identical in exports). */
export function flickerGain(t,amount,seed=0){
  if(!amount)return 1;
  const a=.55+.45*Math.sin(t*11.3+seed*17.7);
  const b=.6+.4*Math.sin(t*27.1+seed*9.2);
  return 1-amount*.5*(a*b);
}
function flickerlessIntensity(c){return c.intensity;}
/** Per-frame update: flicker follows timeline time (or a wall-clock preview). */
export function updateLightsAtTime(t){
  for(const rig of registry){
    const c=rig.cfg;
    rig.light.intensity=c.enabled?c.intensity*flickerGain(t,c.flicker,rig.seed||0):0;
  }
}
/** Remove the rig: the caller must also remove the light from its parent. */
export function disposeLightRig(rig){
  if(!rig)return;
  registry.delete(rig);
  if(rig.isEmitter)emitterLights=Math.max(0,emitterLights-1);
  rig.target?.parent?.remove(rig.target);
  rig.light.parent?.remove(rig.light);
  rig.light.dispose();
}
export function disposeLightsOf(root){
  for(const rig of [...registry])if(rig.root===root){disposeLightRig(rig);}
}
/** Editor gizmo for a placed light object. */
export function lightMarker(kind){
  const g=new THREE.Group();
  const core=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),new THREE.MeshBasicMaterial({color:kind==='spot'?0xffe9b0:0xfff6d8}));
  core.name='Light core';g.add(core);
  const wire=kind==='spot'
    ?new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.ConeGeometry(.45,1,10,1,true)),new THREE.LineBasicMaterial({color:0xf5e2a8,transparent:true,opacity:.55}))
    :new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(.3,10,8)),new THREE.LineBasicMaterial({color:0xf5e2a8,transparent:true,opacity:.55}));
  wire.name='Light guide';
  if(kind==='spot'){wire.rotation.x=Math.PI;wire.position.y=-.5;}
  g.add(wire);g.traverse(o=>{o.userData.lightMarker=true;});
  return g;
}
