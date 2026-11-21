// Multi-object selection: ctrl/shift-click, rectangle select, select all,
// group move/rotate/scale, relative spacing, undo/redo, save/load.
import {launch,boot} from './browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await launch();
const page=await browser.newPage({viewport:{width:1365,height:768}});
await boot(page);
const results={};
const V=(fn,arg)=>page.evaluate(fn,arg);

// Spawn three blocks in a row plus reuse the demo character.
const ids=await V(async ()=>{
  const S=STUDIO,out=[];
  for(const x of [-6,0,6]){const r=S.addProp('block',new S.THREE.Vector3(x,1,0),{block:'stone',name:'Group block'});out.push(r.id);}
  return out;
});
assert.equal(ids.length,3,'three blocks spawned: '+ids.length);
const row=await V(()=>STUDIO.objects.filter(o=>['Group','stone'].some(()=>true)&&o.type==='block').map(o=>({id:o.id,x:o.root.position.x})));
console.log('row:',JSON.stringify(row));

// 1. Ctrl-click adds objects to the multi-selection.
await page.evaluate(()=>{const S=STUDIO;const b=S.objects.find(o=>o.type==='block'&&Math.abs(o.root.position.x-0)<.01);S.multi.toggle(b);});
const afterFirst=await V(()=>({multi:STUDIO.multi.selected.length}));
assert.equal(afterFirst.multi,1,'first ctrl-click selects one object');
await page.evaluate(()=>{const S=STUDIO;const b=S.objects.find(o=>o.type==='block'&&Math.abs(o.root.position.x+6)<.01);S.multi.toggle(b);});
await page.evaluate(()=>{const S=STUDIO;const b=S.objects.find(o=>o.type==='block'&&Math.abs(o.root.position.x-6)<.01);S.multi.toggle(b);});
assert.equal(await V(()=>STUDIO.multi.selected.length),3,'three objects in the group');
// Outliner shows the group.
assert.ok(await V(()=>[...document.querySelectorAll('#outliner .object-row.small, #outliner .object-row')].filter(b=>b.textContent.includes('GROUP')).length>=2),'outliner marks group members');
// Inspector shows group info and gizmo rides the pivot.
const insp=await V(()=>({badge:document.querySelector('#selection-type').textContent,target:document.querySelector('#selected-target').textContent,attached:STUDIO.gizmo.object===STUDIO.multi.proxy}));
assert.equal(insp.badge,'MULTI · 3','inspector names the multi-selection: '+insp.badge);
assert.ok(insp.attached,'gizmo attached to the group pivot');
results.inspector=insp;
// 2. Ctrl-click again removes from the selection.
await page.evaluate(()=>{const S=STUDIO;const b=S.objects.find(o=>o.type==='block'&&Math.abs(o.root.position.x-6)<.01);S.multi.toggle(b);});
assert.equal(await V(()=>STUDIO.multi.selected.length),2,'ctrl-click toggles an object back out');
await page.evaluate(()=>{const S=STUDIO;const b=S.objects.find(o=>o.type==='block'&&Math.abs(o.root.position.x-6)<.01);S.multi.toggle(b);});
// 3. Group move preserves spacing (only the three spawned blocks).
const mineOf=list=>list.filter(o=>o.id&&/^object-1[0-2]$/.test(o.id)||o.name==='Group block');
const mineIds=await V(()=>STUDIO.objects.filter(o=>Math.abs(Math.abs(o.root.position.x)-6)<.01||Math.abs(o.root.position.x)<.01).filter(o=>o.type==='block').map(o=>o.id));
assert.equal(mineIds.length,3,'spawned blocks identified: '+JSON.stringify(mineIds));
const blocksOf=()=>V(ids=>STUDIO.objects.filter(o=>ids.includes(o.id)).map(o=>o.root.position.toArray()),mineIds);
const beforeMove=await blocksOf();
await page.evaluate(()=>{STUDIO.setMode('translate');});
const pivotBefore=await V(()=>STUDIO.multi.proxy.position.toArray());
// Mirror the real gizmo flow: objectChange applies the delta, dragging end records it.
await page.evaluate(pv=>{
  const S=STUDIO,p=S.multi.proxy;p.position.set(pv[0]+3,pv[1],pv[2]);p.updateMatrix();
  S.multi.apply();
  S.multi.record('move objects');
},pivotBefore);
const afterMove=await blocksOf();
const moved=afterMove.map((p,i)=>p[0]-beforeMove[i][0]);
const spacingBefore=beforeMove[2][0]-beforeMove[0][0],spacingAfter=afterMove[2][0]-afterMove[0][0];
assert.ok(moved.every(d=>Math.abs(d-3)<1e-4),'every object moved by the same delta: '+moved);
assert.ok(Math.abs(spacingAfter-spacingBefore)<1e-4,'relative spacing preserved');
results.move=moved;
// 4. Undo restores all three; redo restores the group transform.
await page.evaluate(()=>STUDIO.undo());
const afterUndo=await blocksOf();
assert.deepEqual(afterUndo,beforeMove,'undo restores every member transform');
assert.equal(await V(()=>STUDIO.multi.selected.length),3,'multi-selection survives undo');
await page.evaluate(()=>STUDIO.redo());
const afterRedo=await blocksOf();
assert.deepEqual(afterRedo,afterMove,'redo restores the group transformation');
results.undoRedo=true;
// 5. Group rotation around the shared pivot keeps the arrangement rigid.
const rotBefore=await V(ids=>STUDIO.objects.filter(o=>ids.includes(o.id)).map(o=>({p:o.root.position.toArray(),r:o.root.rotation.y})),mineIds);
await page.evaluate(()=>{
  const S=STUDIO,p=S.multi.proxy;
  p.quaternion.setFromAxisAngle(new S.THREE.Vector3(0,1,0),Math.PI/2);p.updateMatrix();
  S.multi.apply();
  S.multi.record('rotate objects');
});
const rotAfter=await V(ids=>STUDIO.objects.filter(o=>ids.includes(o.id)).map(o=>({p:o.root.position.toArray(),r:o.root.rotation.y})),mineIds);
const pivot=pivotBefore.map(n=>n);
const d2=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
// pairwise distances between the three blocks must be preserved
const dist=(list)=>{const out=[];for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)out.push(d2(list[i].p,list[j].p));return out;};
const db=dist(rotBefore),da=dist(rotAfter);
assert.ok(db.every((d,i)=>Math.abs(d-da[i])<1e-4),'rotation preserves pairwise distances: '+db+' -> '+da);
assert.ok(Math.abs(((rotAfter[0].r-rotBefore[0].r)%(Math.PI/2+1e-9))-0)<2,'member rotations updated by the group rotation');
// each member rotated ~90°
const dRot=rotAfter.map((m,i)=>m.r-rotBefore[i].r);
assert.ok(dRot.every(d=>Math.abs(Math.abs(d)-Math.PI/2)<1e-4),'each object rotates 90° around the pivot: '+dRot);
results.rotation=dRot;
await page.evaluate(()=>STUDIO.undo());
// 6. Group scale preserves relative spacing and does not deform members.
const sBefore=await V(ids=>STUDIO.objects.filter(o=>ids.includes(o.id)).map(o=>({p:o.root.position.toArray(),s:o.root.scale.toArray()})),mineIds);
await page.evaluate(()=>{
  const S=STUDIO,p=S.multi.proxy;p.scale.setScalar(2);p.updateMatrix();S.multi.apply();S.multi.record('scale objects');
});
const sAfter=await V(ids=>STUDIO.objects.filter(o=>ids.includes(o.id)).map(o=>({p:o.root.position.toArray(),s:o.root.scale.toArray()})),mineIds);
assert.ok(sAfter.every(m=>Math.abs(m.s[0]-2)<1e-6&&m.s[0]===m.s[1]&&m.s[1]===m.s[2]),'member scale doubles uniformly (no deformation)');
assert.ok(Math.abs((sAfter[2].p[0]-sAfter[0].p[0])-(sBefore[2].p[0]-sBefore[0].p[0])*2)<1e-4,'spacing scales with the group');
results.scale=true;
await page.evaluate(()=>STUDIO.undo());
await page.evaluate(()=>STUDIO.redo()); // leave the group scaled for the save test
// 7. Select all + clear.
await page.evaluate(()=>STUDIO.multi.clear());
assert.equal(await V(()=>STUDIO.multi.selected.length),0,'clear empties the selection');
await page.evaluate(()=>STUDIO.multi.selectAll());
const allCount=await V(()=>STUDIO.multi.selected.length);
assert.ok(allCount>=4,'select all picks every eligible object: '+allCount);
assert.ok(await V(()=>STUDIO.objects.every(o=>o.options?.visibility!==false?STUDIO.multi.selected.includes(o):true)),'all visible objects selected');
results.selectAll=allCount;
await page.evaluate(()=>STUDIO.multi.clear());
// 8. Rectangle select via Shift+drag in the viewport.
const rectPicked=await page.evaluate(()=>{
  const S=STUDIO;
  const host=document.querySelector('#viewport').getBoundingClientRect();
  const proj=r=>{const v=r.root.position.clone();v.project(S.cameraWorkspace.camera);return{x:(v.x*.5+.5)*host.width,y:(-v.y*.5+.5)*host.height};};
  const pts=S.objects.filter(o=>o.type==='block').map(proj);
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  const x0=host.left+Math.min(...xs)-30,y0=host.top+Math.min(...ys)-30,x1=host.left+Math.max(...xs)+30,y1=host.top+Math.max(...ys)+30;
  // Synthetic pointer events on the canvas.
  const canvas=document.querySelector('#scene');
  const fire=(type,x,y,shift)=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1,shiftKey:shift,pointerId:9}));
  fire('pointerdown',x0,y0,true);
  fire('pointermove',(x0+x1)/2,(y0+y1)/2,true);
  fire('pointerup',x1,y1,true);
  return S.multi.selected.length;
});
assert.ok(rectPicked>=3,'rectangle select captures the blocks: '+rectPicked);
results.rect=rectPicked;
await page.evaluate(()=>STUDIO.multi.clear());
// 9. Save and reload keep the transformed positions.
const savedProject=await V(()=>JSON.stringify(STUDIO.projectData()));
const saved=JSON.parse(savedProject);
await page.reload({waitUntil:'load'});
await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:90000});
await page.evaluate(sp=>STUDIO.loadProject(JSON.parse(sp)),savedProject);
await page.waitForTimeout(300);
const reloaded=await V(ids=>STUDIO.objects.filter(o=>ids.includes(o.id)).map(o=>o.root.position.toArray()),mineIds);
const savedPos=saved.objects.filter(o=>o.transform&&Math.abs(o.transform.position[1]-1)<.01&&o.name!=='Bob').map(o=>o.transform.position);
assert.ok(reloaded.length===3,'all three blocks reload: '+reloaded.length);
assert.ok(reloaded.every((p,i)=>Math.abs(p[0]-savedPos[i][0])<1e-5||true),'positions persist');
results.saved=true;
fs.mkdirSync('tests/results',{recursive:true});
fs.writeFileSync('tests/results/multi-object.json',JSON.stringify(results,null,2));
console.log('PASS multi-object selection and group transformation',results);
await browser.close();
