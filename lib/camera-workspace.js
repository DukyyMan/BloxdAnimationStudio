import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';

// Animation camera always remains the export/data camera. Only viewport navigation
// switches; never copy the editor pose back into the animation track.
export class CameraWorkspace{
  constructor(camera,orbit,canvas,helpers){
    this.animation=camera;this.animationOrbit=orbit;this.mode='first-person';this.guides=true;this.editing=false;
    this.editor=camera.clone();this.editor.position.add(new THREE.Vector3(7,4,7));
    this.orbit=new OrbitControls(this.editor,canvas);this.orbit.enableDamping=true;this.orbit.minDistance=.3;this.orbit.maxDistance=1600;this.orbit.enabled=false;this.orbit.target.copy(orbit.target);this.orbit.update();
    this.body=new THREE.Group();this.body.name='Animation camera guide';
    const material=new THREE.MeshBasicMaterial({color:0x83d4e7});
    const box=new THREE.Mesh(new THREE.BoxGeometry(.65,.45,.4),material);this.body.add(box);
    const lens=new THREE.Mesh(new THREE.CylinderGeometry(.16,.23,.28,12),material);lens.rotation.x=Math.PI/2;lens.position.z=-.3;this.body.add(lens);
    this.body.add(new THREE.ArrowHelper(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,0,-.45),1.3,0xe6ef9e,.3,.18));
    this.frustumCamera=camera.clone();this.frustumCamera.far=7;
    this.frustum=new THREE.CameraHelper(this.frustumCamera);this.frustum.material.transparent=true;this.frustum.material.opacity=.45;this.frustum.material.depthWrite=false;
    helpers.add(this.body,this.frustum);this.update();
  }
  get camera(){return this.mode==='scene'?this.editor:this.animation;}
  get controls(){return this.mode==='scene'?this.orbit:this.animationOrbit;}
  setMode(mode){this.mode=mode==='scene'?'scene':'first-person';this.editing=false;this.animationOrbit.enabled=this.mode==='first-person';this.orbit.enabled=this.mode==='scene';this.update();}
  update(){
    const c=this.animation;this.body.position.copy(c.position);this.body.quaternion.copy(c.quaternion);
    this.body.visible=this.frustum.visible=this.mode==='scene'&&this.guides;
    if(this.frustum.visible){const f=this.frustumCamera;f.position.copy(c.position);f.quaternion.copy(c.quaternion);f.fov=c.fov;f.aspect=c.aspect;f.updateProjectionMatrix();f.updateMatrixWorld(true);this.frustum.update();}
  }
  data(){return{cameraMode:this.mode,guides:this.guides,editorView:{position:this.editor.position.toArray(),target:this.orbit.target.toArray(),fov:this.editor.fov}};}
  restore(d={}){
    const v=d.editorView,vec=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
    if(v&&vec(v.position)&&vec(v.target)){this.editor.position.fromArray(v.position);this.orbit.target.fromArray(v.target);this.editor.fov=Number.isFinite(v.fov)?v.fov:45;this.editor.updateProjectionMatrix();this.orbit.update();}
    this.guides=d.guides!==false;this.setMode(d.cameraMode);
  }
}
