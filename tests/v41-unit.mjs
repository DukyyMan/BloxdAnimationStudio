// Unit tests for the v4.1 libraries: shortcuts, fly camera, key selection,
// drag-fill boxes and part move/scale/detach maths. Bundled with the three alias.
import * as THREE from 'three';
import {ShortcutManager,comboFromEvent,normalizeCombo,keyName,isTypingTarget} from '../lib/shortcuts.js';
import {PITCH_LIMIT,directionFromAngles,anglesFromDirection,applyLook,moveVector,smoothVelocity} from '../lib/fly-camera.js';
import {emptySelection,selectOnly,toggleKey,rangeSelect,rectSelect,selectAll,selectedKeys,copyKeys,pasteKeys,moveKeys,clampDelta,deleteKeys,duplicateStart} from '../lib/key-selection.js';
import {fillBox,resolvePlane,boxCells,describeBox,FILL_MAX_BLOCKS} from '../lib/block-fill.js';
import {createCharacter,applyPose,neutralPose,copyPose,blendPose,setDetached,jointRootMatrix,rebasePose,ensurePoseExtras,compactPose} from '../lib/character.js';
import {mirrorPose} from '../lib/anim-clips.js';
import {rigAdapter,topLevelParts} from '../lib/rig.js';
import {validateDraft,stageEdit,mergeEdit} from '../lib/key-edit.js';

let pass=0,fail=0;const check=(name,ok,detail='')=>{ok?pass++:fail++;console.log((ok?'PASS ':'FAIL ')+name+(detail&&!ok?' — '+detail:''));};
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
const ev=(code,mods={})=>({code,key:code.replace(/^Key/,'').toLowerCase(),...mods});

// ── Shortcuts ──
const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
let sm=new ShortcutManager({storage});
check('Ctrl+Shift+Z normalises from an event',comboFromEvent(ev('KeyZ',{ctrlKey:true,shiftKey:true}))==='Ctrl+Shift+Z');
check('Cmd counts as Ctrl (macOS)',comboFromEvent(ev('KeyS',{metaKey:true}))==='Ctrl+S');
check('normalizeCombo orders modifiers',normalizeCombo('shift+ctrl+k')==='Ctrl+Shift+K');
check('physical key code is layout independent',keyName({code:'KeyW',key:'z'})==='W');
check('Space defaults to keyframe in the editor',sm.match(ev('Space'),['editor','global'])==='anim.key');
check('W is Move gizmo in the editor but a fly hold key in navigation',sm.match(ev('KeyW'),['editor','global'])==='tool.move'&&sm.holdActionsFor(ev('KeyW')).includes('nav.forward'));
check('placing context wins: R rotates the placement preview',sm.match(ev('KeyR'),['placing','editor','global'])==='place.rotate'&&sm.match(ev('KeyR'),['editor','global'])==='tool.scale');
let r=sm.bind('anim.play','K');
check('conflict is detected and nothing changes without replace',!r.ok&&r.conflicts.some(a=>a.id==='anim.key')&&sm.get('anim.key').includes('K'));
r=sm.bind('anim.play','K',{replace:true});
check('replace moves the combo to the new action',r.ok&&sm.get('anim.play').includes('K')&&!sm.get('anim.key').includes('K'));
check('change persists to localStorage',JSON.parse(store.get('studioShortcutsV1')).bindings['anim.play'].includes('K'));
check('persisted bindings reload in a new manager',new ShortcutManager({storage}).get('anim.play').includes('K'));
sm.unbind('anim.key','Space');check('removing a binding leaves the action unassigned for that key',sm.match(ev('Space'),['editor'])===null);
check('modifier-only combo rejected for non-hold actions',!!sm.validate('anim.play','Shift'));
check('modifier-only combo allowed for hold actions (Ctrl = fly down)',sm.bind('nav.down','Ctrl').ok&&sm.holdActionsFor({code:'ControlLeft',key:'Control'}).includes('nav.down'));
check('browser-reserved Ctrl+W refused',!!sm.validate('anim.play','Ctrl+W'));
sm.resetAll();check('restore defaults',sm.get('anim.key').join()==='Space,K'&&sm.get('anim.play').join()==='P'&&!sm.get('nav.down').includes('Ctrl'));
store.set('studioShortcutsV1','{not json');check('corrupt storage falls back to defaults',new ShortcutManager({storage}).get('anim.key').includes('Space'));
store.set('studioShortcutsV1',JSON.stringify({version:1,bindings:{'anim.play':['Space'],'nope':['X']}}));
const loaded=new ShortcutManager({storage});check('stored data cannot create a conflict',loaded.match(ev('Space'),['editor'])!==null&&[loaded.get('anim.key').includes('Space'),loaded.get('anim.play').includes('Space')].filter(Boolean).length===1);
check('typing targets are recognised',isTypingTarget({tagName:'INPUT'})&&isTypingTarget({tagName:'TEXTAREA'})&&isTypingTarget({isContentEditable:true})&&!isTypingTarget({tagName:'BUTTON'}));

// ── Fly camera ──
const d0=directionFromAngles(0,0);check('yaw 0 looks toward −Z',near(d0[2],-1)&&near(d0[0],0));
const a1=anglesFromDirection(directionFromAngles(1.1,-.4));check('angles ⇄ direction round-trip',near(a1.yaw,1.1)&&near(a1.pitch,-.4));
let look={yaw:0,pitch:0};for(let i=0;i<200;i++)look=applyLook(look.yaw,look.pitch,0,-50);
check('pitch clamps at +89° and never flips',near(look.pitch,PITCH_LIMIT)&&directionFromAngles(look.yaw,look.pitch)[1]<1);
for(let i=0;i<400;i++)look=applyLook(look.yaw,look.pitch,0,50);check('pitch clamps at −89°',near(look.pitch,-PITCH_LIMIT));
const fwd=moveVector(new Set(['nav.forward']),0,0,{speed:6}),diag=moveVector(new Set(['nav.forward','nav.right']),0,0,{speed:6});
check('forward follows the view direction',near(fwd[2],-6)&&near(fwd[0],0));
check('diagonal movement is normalised',near(Math.hypot(...diag),6));
const pitched=moveVector(new Set(['nav.forward']),0,Math.PI/4,{speed:6});check('forward flies along the pitched view',pitched[1]>0&&near(Math.hypot(...pitched),6));
const up=moveVector(new Set(['nav.up']),0,Math.PI/3,{speed:6});check('up is world up regardless of pitch',near(up[1],6)&&near(up[0],0)&&near(up[2],0));
check('Shift multiplies speed',near(Math.hypot(...moveVector(new Set(['nav.forward','nav.fast']),0,0,{speed:6,fastMultiplier:3.5})),21));
check('opposite keys cancel',Math.hypot(...moveVector(new Set(['nav.forward','nav.back']),0,0))===0);
let v=[0,0,0];v=smoothVelocity(v,[6,0,0],1/60);check('velocity eases in (smooth start)',v[0]>0&&v[0]<6);
for(let i=0;i<120;i++)v=smoothVelocity(v,[6,0,0],1/60);check('velocity reaches the target speed',near(v[0],6,.01));
for(let i=0;i<120;i++)v=smoothVelocity(v,[0,0,0],1/60);check('velocity settles to exactly zero after release',v[0]===0);

// ── Key selection ──
const keys=[0,1,2,3,4].map(t=>({time:t,position:[t,0,0],rotation:[0,0,0],scale:[1,1,1],ease:t===2?'linear':undefined,pose:{offset:0,head:[t,0,0]}})).map(k=>{if(!k.ease)delete k.ease;return k;});
let sel=selectOnly('pose','bob',1);sel=toggleKey(sel,'pose','bob',3);
check('Ctrl-click toggles keys into the selection',selectedKeys(sel,keys).map(k=>k.time).join()==='1,3');
sel=toggleKey(sel,'pose','bob',3);check('Ctrl-click again removes a key',selectedKeys(sel,keys).map(k=>k.time).join()==='1');
sel=rangeSelect(sel,'pose','bob',3,keys);check('Shift-click selects the range from the anchor',selectedKeys(sel,keys).map(k=>k.time).join()==='1,2,3');
check('a camera click starts a separate selection',toggleKey(sel,'camera',null,2).type==='camera'&&toggleKey(sel,'camera',null,2).times.join()==='2');
check('box select by time span',rectSelect(emptySelection(),'pose','bob',keys,.5,2.5).times.join()==='1,2');
check('additive box select keeps the old selection',rectSelect(selectOnly('pose','bob',4),'pose','bob',keys,.5,1.5,true).times.join()==='1,4');
check('select all',selectAll('pose','bob',keys).times.length===5);
const clip=copyKeys(rectSelect(emptySelection(),'pose','bob',keys,1,2),keys,{character:true});
check('copy stores relative offsets',clip.keys.map(k=>k.time).join()==='0,1'&&clip.span===1);
let pasted=pasteKeys(keys,clip,3.5,{maxTime:8});
check('paste lands relative to the playhead preserving spacing',pasted.times.join()==='3.5,4.5');
const p45=pasted.keys.find(k=>k.time===4.5);check('paste keeps every field incl. easing',p45.ease==='linear'&&p45.pose.head[0]===2&&p45.position[0]===2);
check('paste does not alias the source keys',p45.pose!==keys[2].pose);
pasted=pasteKeys(keys,clip,3,{maxTime:8});check('paste replaces keys at the same time instead of duplicating',pasted.keys.length===5&&pasted.keys.filter(k=>k.time===3).length===1&&pasted.keys.find(k=>k.time===3).pose.head[0]===1);
check('paste drops keys past the limit',pasteKeys(keys,clip,59.5,{maxTime:60}).dropped===1);
sel=selectAll('pose','bob',keys.slice(1,3));
check('group move delta clamps at 0',clampDelta(sel,-5,8)===-1);
const moved=moveKeys(keys,{type:'pose',owner:'bob',times:[1,2]},.5,8);
check('selected keys move together and keep relative timing',moved.times.join()==='1.5,2.5'&&moved.keys.length===5&&moved.keys.find(k=>k.time===2.5).ease==='linear');
const over=moveKeys(keys,{type:'pose',owner:'bob',times:[1,2]},1,8);check('moving onto an unselected key replaces it (no duplicates)',over.keys.length===4&&over.keys.filter(k=>k.time===3).length===1&&over.keys.find(k=>k.time===3).pose.head[0]===2);
check('delete selected keys',deleteKeys(keys,{type:'pose',owner:'bob',times:[0,4]}).map(k=>k.time).join()==='1,2,3');
check('duplicate starts after the selection when the playhead is inside it',duplicateStart({times:[1,2]},1.5,.1)>2);

// ── Drag-fill ──
check('floor plane from an up-facing hit',JSON.stringify(resolvePlane('auto',[0,1,0]))===JSON.stringify({axis:1,sign:1}));
check('wall plane from a side hit',resolvePlane('auto',[1,0,0]).axis===0&&resolvePlane('auto',[0,0,-1]).axis===2&&resolvePlane('auto',[0,0,-1]).sign===-1);
check('ceiling: down-facing hit grows downward',resolvePlane('auto',[0,-1,0]).sign===-1);
let box=fillBox([0,1,0],[3,1,-2],resolvePlane('floor',[0,1,0]));
check('floor box is grid snapped with inclusive corners',box.size.join()==='4,1,3'&&box.count===12&&box.min.join()==='0,1,-2');
check('box cells enumerate exactly the count',[...boxCells(box)].length===12);
box=fillBox([0,1,0],[3,1,0],resolvePlane('floor',[0,1,0]),{layers:3});check('layers make a platform/slab',box.size[1]===3&&box.count===12);
box=fillBox([0,1,0],[4,4,0],resolvePlane('wall-x',[0,1,0]));check('wall spans width × height in its own plane',box.size.join()==='5,4,1'&&box.min[1]===1&&box.max[1]===4);
box=fillBox([0,1,0],[2,1,2],resolvePlane('floor',[0,1,0]),{raise:4});check('raise lifts a floor into a floating platform',box.min[1]===5&&box.size.join()==='3,1,3');
box=fillBox([0,0,0],[200,0,200],resolvePlane('floor',[0,1,0]));check('oversized fills are trimmed with feedback',box.trimmed&&box.count<=FILL_MAX_BLOCKS&&/limit/i.test(describeBox(box)));
check('dimension label shows size and count',/4 × 1 × 3/.test(describeBox(fillBox([0,1,0],[3,1,-2],resolvePlane('floor',[0,1,0])))));

// ── Parts: move / scale / detach ──
const c=createCharacter();c.root.updateMatrixWorld(true);
const pose=neutralPose();ensurePoseExtras(pose);pose.move.head=[.2,.1,0];pose.scale.armR=[1.5,1,1];applyPose(c,pose);
check('pose.move offsets the joint from its rest position',near(c.joints.head.position.x,c.joints.head.userData.rest[0]+.2));
check('pose.scale scales the part',near(c.joints.armR.scale.x,1.5));
applyPose(c,neutralPose());check('older poses without extras reset move/scale (backward compatible)',near(c.joints.head.position.x,c.joints.head.userData.rest[0])&&near(c.joints.armR.scale.x,1));
const mid=blendPose(neutralPose(),pose,.5);check('move/scale interpolate between keys',near(mid.move.head[0],.1)&&near(mid.scale.armR[0],1.25));
check('compactPose drops identity extras',!('move' in compactPose(Object.assign(neutralPose(),{move:{head:[0,0,0]}}))));
const mir=mirrorPose(pose);check('mirror swaps sides and flips move x',mir.scale.armL?.[0]===1.5&&near(mir.move.head[0],-.2));
const p2=neutralPose();p2.body=[0,40,0];p2.forearmR=[-30,0,10];applyPose(c,p2);c.root.updateMatrixWorld(true);
const before=new THREE.Vector3().setFromMatrixPosition(c.joints.forearmR.matrixWorld);
const base=new THREE.Vector3().setFromMatrixPosition(jointRootMatrix(c,'forearmR',p2)).toArray();
const conv=rebasePose(p2,'forearmR',jointRootMatrix(c,'forearmR',p2),new THREE.Matrix4(),base);
setDetached(c,'forearmR',base);applyPose(c,conv);c.root.updateMatrixWorld(true);
const after=new THREE.Vector3().setFromMatrixPosition(c.joints.forearmR.matrixWorld);
check('detach re-parents the joint to the character root',c.joints.forearmR.parent===c.root&&!!c.detached.forearmR);
check('detached part keeps its world position (no jump)',before.distanceTo(after)<1e-5,before.toArray()+' vs '+after.toArray());
const p3=copyPose(conv);p3.body=[0,0,0];applyPose(c,p3);c.root.updateMatrixWorld(true);
check('detached part no longer follows its parent',new THREE.Vector3().setFromMatrixPosition(c.joints.forearmR.matrixWorld).distanceTo(after)<1e-5);
check('the mesh and held-item mount stay intact',c.joints.forearmR.children.length>0&&!!c.mount);
setDetached(c,'forearmR',null);check('reattach restores the original parent',c.joints.forearmR.parent===c.joints.forearmR.userData.restParent&&!c.detached.forearmR);
check('rig adapter lists the ten real joints only',rigAdapter(c).parts.length===10&&rigAdapter({joints:{head:{}}}).parts.length===1);
check('group transforms skip descendants of selected parts',topLevelParts(c,['armR','forearmR','head']).join()==='armR,head');

// ── Key editing accepts the new pose fields ──
const st0={transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},pose:neutralPose()},st1=JSON.parse(JSON.stringify(st0));ensurePoseExtras(st1.pose);st1.pose.move.head=[0,1,0];st1.pose.scale.armR=[2,1,1];
const draft=stageEdit(st0,st1,null,1);let okDraft=true;try{validateDraft(draft,st1);}catch(e){okDraft=false;}
const merged=mergeEdit(st0,draft);
let okOld=true;try{validateDraft({...draft,changes:[{path:['pose','move','head','1'],value:1}]},st0);}catch(e){okOld=false;}
check('a move edit validates against an older pose without extras',okOld);
let badRejected=false;try{validateDraft({...draft,changes:[{path:['pose','move','tail','1'],value:1}]},st0);}catch(e){badRejected=true;}
check('unknown part paths are rejected',badRejected);
check('pending edits record pose.move/scale and validate',okDraft&&draft.changes.some(c=>c.path.join('.')==='pose.move.head.1'));
check('merging a move edit into an older pose creates the extras',merged.pose.move?.head?.[1]===1&&merged.pose.scale?.armR?.[0]===2);

console.log(`\n${pass} passed, ${fail} failed`);if(fail)process.exit(1);
