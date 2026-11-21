import {migrateProject,MAX_DURATION} from '../lib/project-format.js';
import {CameraTrack,keyInterval} from '../lib/tracks.js';
import * as T from 'three';
import assert from 'node:assert/strict';
const base={format:'bloxd-studio',version:2,objects:[{name:'Bob',transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},character:{pose:{head:[1,2,3]},keys:[{time:75,position:[0,1,0],rotation:[1,2,3],scale:[1,2,1],ease:'hold',pose:{head:[5,0,0],move:{head:[.3,0,0]},scale:{armR:[1,1.2,1]}}}]}}],world:{blocks:[]},camera:{keys:[{time:0,position:[0,1,4],target:[0,1,0],fov:45,ease:'hold'}],distortion:[{time:70,amount:.3,ease:'linear'}]},timeline:{duration:180,time:75}};
for(const version of [1,2,3]){const d={...base,version};const migrated=migrateProject(d);assert.deepEqual(migrated.objects,d.objects);assert.deepEqual(migrated.camera,d.camera);assert.equal(migrated.editor.cameraMode,'first-person');assert.equal(d.editor,undefined);}
for(const modify of [d=>d.version=99,d=>d.camera.keys[0].position=[1,2],d=>d.camera.keys[0].quaternion=[0,0,0,0],d=>d.objects[0].character.keys[0].pose.head[0]=NaN,d=>d.objects[0].character.keys[0].pose.head[0]=null,d=>d.timeline.duration=MAX_DURATION+1,d=>d.editor={timeline:{pixelsPerSecond:-3}}]){const d=structuredClone(base);modify(d);assert.throws(()=>migrateProject(d));}
const track=new CameraTrack();track.smooth=false;track.keys=[{time:0,position:[0,0,5],target:[0,0,0],fov:40,ease:'linear'},{time:10,position:[0,0,-5],target:[0,0,0],fov:60}];track.rebuild();
const half=track.sample(5);assert.deepEqual(half.position.toArray(),[0,0,0]);assert.equal(half.fov,50);assert.ok(Math.abs(half.target.distanceTo(half.position)-5)<1e-6);assert.ok(Math.abs(new T.Vector3(0,0,-1).applyQuaternion(half.quaternion).x)>.99,'opposite camera directions never collapse to zero or flip');
track.keys[0].ease='hold';assert.deepEqual(track.sample(9.9).position.toArray(),[0,0,5]);assert.deepEqual(track.sample(10).position.toArray(),[0,0,-5]);
track.keys.push({time:20,position:[4,0,-5],target:[0,0,0],fov:65});track.rebuild();assert.deepEqual(track.sample(10).position.toArray(),[0,0,-5],'a Hold key switches exactly at an interior key timestamp');
const list=Array.from({length:100000},(_,i)=>({time:i}));assert.equal(keyInterval(list,87654.5)[0].time,87654);assert.equal(keyInterval(list,87654)[1].time,87654);
console.log('PASS legacy migrations preserve all channels; malformed projects rejected; quaternion camera orientation, Hold and 100k-key binary interval evaluation');
