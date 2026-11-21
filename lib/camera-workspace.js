import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';

// Animation camera always remains the export/data camera. Only viewport navigation
// switches; never copy the editor pose back into the animation track.
export class CameraWorkspace{
  constructor(camera,orbit,canvas,helpers){
    this.animation=camera;this.animationOrbit=orbit;this.mode='first-person';this.guides=true;this.showBody=true;this.showFrustum=true;this.editing=false;
    this.editor=camera.clone();this.editor.position.add(new THREE.Vector3(7,4,7));
    this.orbit=new OrbitControls(this.editor,canvas);this.orbit.enableDamping=true;this.orbit.minDistance=.3;this.orbit.maxDistance=1600;this.orbit.enabled=false;this.orbit.target.copy(orbit.target);this.orbit.update();
    // ── The visible animation-camera object ─────────────────────────────────
    // Recognizable silhouette: body, lens, lens ring, viewfinder hump, forward
    // arrow (viewing direction) and an up arrow (orientation indicator). The
    // whole group scales with the editor camera's distance so the object stays
    // findable at any scene scale; scaling never changes its pose.
    this.body=new THREE.Group();this.body.name='Animation camera guide';
    const cyan=0x7fd8e8,deep=0x14333c,lime=0xd9ef9e;
    const shell=new THREE.MeshBasicMaterial({color:cyan});
    const dark=new THREE.MeshBasicMaterial({color:deep});
    const accent=new THREE.MeshBasicMaterial({color:lime});
    const box=new THREE.Mesh(new THREE.BoxGeometry(.78,.52,.44),shell);box.position.z=.05;this.body.add(box);
    const plate=new THREE.Mesh(new THREE.BoxGeometry(.84,.58,.1),dark);plate.position.z=.3;this.body.add(plate);
    const lens=new THREE.Mesh(new THREE.CylinderGeometry(.15,.24,.34,16),dark);lens.rotation.x=Math.PI/2;lens.position.z=-.36;this.body.add(lens);
    const ring=new THREE.Mesh(new THREE.CylinderGeometry(.26,.26,.07,16),accent);ring.rotation.x=Math.PI/2;ring.position.z=-.55;this.body.add(ring);
    const hump=new THREE.Mesh(new THREE.BoxGeometry(.26,.18,.2),shell);hump.position.set(-.12,.34,.12);this.body.add(hump);
    this.forward=new THREE.ArrowHelper(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,0,-.6),2.1,0xe6ef9e,.42,.24);this.body.add(this.forward);
    this.up=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(0,.28,0),.9,0xa8d8df,.22,.14);this.up.userData.isUp=true;this.body.add(this.up);
    // Frustum of the real animation camera: orientation, FOV and aspect follow it.
    this.frustumCamera=camera.clone();this.frustumCamera.far=12;
    this.frustum=new THREE.CameraHelper(this.frustumCamera);this.frustum.material.transparent=true;this.frustum.material.opacity=.45;this.frustum.material.depthWrite=false;
    helpers.add(this.body,this.frustum);this.update();
  }
  get camera(){return this.mode==='scene'?this.editor:this.animation;}
  get controls(){return this.mode==='scene'?this.orbit:this.animationOrbit;}
  setMode(mode){this.mode=mode==='scene'?'scene':'first-person';this.editing=false;this.animationOrbit.enabled=this.mode==='first-person';this.orbit.enabled=this.mode==='scene';this.update();}
  update(){
    const c=this.animation;this.body.position.copy(c.position);this.body.quaternion.copy(c.quaternion);
    // Keep the object comfortably visible from wherever the editor camera is.
    const view=this.mode==='scene'?this.editor:this.animation;
    const dist=view.position.distanceTo(c.position);
    const scale=THREE.MathUtils.clamp(dist*.085,.6,9);
    this.body.scale.setScalar(scale);
    this.body.visible=this.mode==='scene'&&this.guides&&this.showBody;
    this.frustum.visible=this.mode==='scene'&&this.guides&&this.showFrustum;
    if(this.frustum.visible){const f=this.frustumCamera;f.position.copy(c.position);f.quaternion.copy(c.quaternion);f.fov=c.fov;f.aspect=c.aspect;f.updateProjectionMatrix();f.updateMatrixWorld(true);this.frustum.update();}
  }
  data(){return{cameraMode:this.mode,guides:this.guides,showBody:this.showBody,showFrustum:this.showFrustum,editorView:{position:this.editor.position.toArray(),target:this.orbit.target.toArray(),fov:this.editor.fov}};}
  restore(d={}){
    const v=d.editorView,vec=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
    if(v&&vec(v.position)&&vec(v.target)){this.editor.position.fromArray(v.position);this.orbit.target.fromArray(v.target);this.editor.fov=Number.isFinite(v.fov)?v.fov:45;this.editor.updateProjectionMatrix();this.orbit.update();}
    this.guides=d.guides!==false;
    // New per-part toggles; a legacy project that stored guides:false hides both.
    this.showBody=d.showBody!==undefined?!!d.showBody:this.guides;
    this.showFrustum=d.showFrustum!==undefined?!!d.showFrustum:this.guides;
    this.setMode(d.cameraMode);
  }
}
