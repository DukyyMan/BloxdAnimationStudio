// v4.4 feature flows in the real app: managed lights, Bob customization,
// inspector materials with real specular, global override settings, custom sky,
// multi-selection/grouping, the honest Mobs library and the isolated Custom
// Mesh Editor with its persisted asset library.
import {launch,boot} from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const results=path.join(root,'tests/results');fs.mkdirSync(results,{recursive:true});
const checks=[],errors=[];
function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name+(detail?' — '+detail:''));}
const browser=await launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1280,height:820},deviceScaleFactor:1,acceptDownloads:true});
const page=await context.newPage();
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR:',e.message);});
page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log('CONSOLE ERROR:',m.text());}});
page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
const get=fn=>page.evaluate(fn);
async function input(id,value){await page.locator(id).evaluate((el,v)=>{el.focus();el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function setCheck(id,value){await page.locator(id).evaluate((el,v)=>{el.focus();el.checked=v;el.dispatchEvent(new Event('change',{bubbles:true}));},value);}
const near=(a,b,eps=1e-3)=>Math.abs(a-b)<eps;
try{
  await boot(page,process.env.APP_URL||'http://127.0.0.1:8000/');
  const originalSky=await get(()=>STUDIO.scene.background&&STUDIO.scene.background.isColor?STUDIO.scene.background.getHexString():null);

  // ── Lighting library: placeable lights + managed rigs ────────────────────
  await page.locator('[data-library="lights"]').click();
  check('Lighting library lists the placeable lights and the already-luminous assets',await get(()=>document.querySelectorAll('#asset-grid .asset-card').length>=5));
  await page.locator('#asset-grid [data-asset="point-light"]').click();
  const pointRec=await get(()=>{const r=STUDIO.objects.at(-1);return {type:r.type,rig:r.options.light,point:!!r.root.children.find(c=>c.isPointLight)};});
  check('a placed point light is a real THREE PointLight with default config',pointRec.type==='point-light'&&pointRec.point&&pointRec.rig.color==='#ffffff'&&pointRec.rig.intensity===8,JSON.stringify(pointRec));
  await page.locator('#asset-grid [data-asset="spot-light"]').click();
  const spotRec=await get(()=>{const r=STUDIO.objects.at(-1);return {type:r.type,rig:r.options.light,spot:!!r.root.children.find(c=>c.isSpotLight),angle:r.root.children.find(c=>c.isSpotLight)?.angle};});
  check('a placed spot light is a real THREE SpotLight with a cone',spotRec.spot&&spotRec.rig.kind==='spot'&&Math.abs(spotRec.angle-38*Math.PI/180)<.01,JSON.stringify(spotRec));
  await input('#light-angle',60);
  check('cone angle edits reach the spot light',await get(()=>Math.abs(STUDIO.objects.at(-1).root.children.find(c=>c.isSpotLight).angle-60*Math.PI/180)<.01));
  await input('#light-intensity',20);await input('#light-color','#33ff66');
  const spotCheck=await get(()=>{const s=STUDIO.objects.at(-1).root.children.find(c=>c.isSpotLight);return {i:s.intensity,c:s.color.getHexString(),cfg:{...STUDIO.objects.at(-1).options.light}};});
  check('intensity and color edits reach the real light and its saved config',spotCheck.i===20&&spotCheck.c==='33ff66'&&spotCheck.cfg.intensity===20&&spotCheck.cfg.color==='#33ff66',JSON.stringify(spotCheck));
  await input('#light-flicker',.5);
  await page.evaluate(()=>STUDIO.seek(1));const f1=await get(()=>STUDIO.objects.at(-1).root.children.find(c=>c.isSpotLight).intensity);
  await page.evaluate(()=>STUDIO.seek(2.7));const f2=await get(()=>STUDIO.objects.at(-1).root.children.find(c=>c.isSpotLight).intensity);
  check('flicker follows timeline scrubbing and stays in the envelope',f1!==f2&&f1<=20.001&&f2<=20.001&&f1>=10&&f2>=10,f1.toFixed(2)+' → '+f2.toFixed(2));
  await input('#light-flicker',0);
  const lamp=await get(()=>{const r=STUDIO.objects.find(o=>o.type==='lamp');const lights=r.root.children.filter(c=>c.isPointLight||c.isSpotLight).length;return {type:r.type,lights,rig:r.options.light};});
  check('the starter lamp carries exactly one managed light rig (no embedded duplicates)',lamp.type==='lamp'&&lamp.lights===1&&lamp.rig.color==='#ffbd64'&&lamp.rig.intensity===12,JSON.stringify(lamp));
  await page.locator('[data-library="fx"]').click();await page.locator('#asset-grid [data-asset="fire"]').click();
  const fire=await get(()=>{const r=STUDIO.objects.at(-1);return {type:r.type,rig:r.options.light};});
  check('an emitter prop gets its own flickering light preset',fire.type==='particles'&&!!fire.rig&&fire.rig.enabled&&fire.rig.flicker>0,JSON.stringify(fire));
  const lightRound=await get(()=>STUDIO.projectData());
  await page.evaluate(d=>STUDIO.loadProject(d),lightRound);
  const lightsAfterLoad=await get(()=>STUDIO.objects.filter(r=>r.options.light).map(r=>({t:r.type,live:r.root.children.find(c=>c.isPointLight||c.isSpotLight)?.intensity})));
  check('light configs survive a project reload and light the scene again',lightsAfterLoad.length===4&&lightsAfterLoad.every(l=>l.live>0),JSON.stringify(lightsAfterLoad));

  // ── Mobs library: honest, verified audit ──────────────────────────────────
  await page.locator('[data-library="mobs"]').click();
  const mobInfo=await get(()=>({cards:document.querySelectorAll('#asset-grid .asset-card').length,total:document.querySelector('#catalog-count').textContent,badges:[...document.querySelectorAll('#asset-grid .mob-status')].map(b=>b.textContent).filter((v,i,a)=>a.indexOf(v)===i)}));
  check('the Mobs library paginates the full audited catalog',mobInfo.cards===48&&mobInfo.total.includes('59'),mobInfo.total);
  check('every mob card carries the honest not-riggable badge',mobInfo.badges.length===1&&mobInfo.badges[0].includes('Not riggable'),mobInfo.badges.join('|'));
  await page.locator('#asset-grid .asset-card').first().click();
  const mobDialog=await get(()=>({open:document.querySelector('#mob-dialog').open,name:document.querySelector('#mob-detail-name').textContent,status:document.querySelector('#mob-detail-status').textContent,reason:document.querySelector('#mob-detail-reason').textContent.length}));
  check('mob detail explains the verified reason instead of faking a rig',mobDialog.open&&mobDialog.reason>20&&/not|cannot|No /i.test(mobDialog.status+mobDialog.reason),JSON.stringify(mobDialog).slice(0,150));
  await page.locator('#mob-dialog .dialog-close').click();

  // ── Bob customization ─────────────────────────────────────────────────────
  const bobCountBefore=await get(()=>STUDIO.objects.filter(r=>r.character).length);
  await page.locator('[data-library="characters"]').click();await page.locator('.character-card').click();
  check('adding Bob opens the customization screen',await page.evaluate(()=>document.querySelector('#bob-dialog').open));
  await page.locator('#bob-tints button[data-tint="ember"]').click();
  await page.locator('#bob-armor-helmet').selectOption('iron');
  const summary=await get(()=>document.querySelector('#bob-summary').textContent);
  check('the dialog summarizes the chosen appearance live',summary.includes('Ember')&&summary.toLowerCase().includes('helmet'),summary);
  await page.locator('#bob-apply').click();
  const customBob=await get(()=>{const bobs=STUDIO.objects.filter(r=>r.character);const r=bobs.at(-1);return {count:bobs.length,color:r.character.material.color.getHexString(),appearance:r.options.appearance};});
  check('the customized Bob spawns with the chosen tint and armor',customBob.count===bobCountBefore+1&&customBob.color==='ff9a5a'&&customBob.appearance?.tint==='ember'&&customBob.appearance?.armor?.helmet==='iron',JSON.stringify(customBob));
  check('the default Bob keeps his exact default look',await get(()=>STUDIO.objects[0].character&&STUDIO.objects.find(r=>r.character).character.material.color.getHexString()==='ffffff'));
  await page.evaluate(()=>STUDIO.select(STUDIO.objects.filter(r=>r.character).at(-1)));
  await input('#bob-tint','moss');
  const tintLive=await get(()=>({color:STUDIO.objects.filter(r=>r.character).at(-1).character.material.color.getHexString(),app:STUDIO.objects.filter(r=>r.character).at(-1).options.appearance}));
  check('the inspector re-styles an existing Bob per instance',tintLive.color==='8fd17a'&&tintLive.app.tint==='moss',JSON.stringify(tintLive));
  const bobProject=await get(()=>STUDIO.projectData());
  await page.evaluate(d=>STUDIO.loadProject(d),bobProject);
  const bobAfterLoad=await get(()=>STUDIO.objects.filter(r=>r.character).map(r=>({c:r.character.material.color.getHexString(),a:r.options.appearance?.tint||null})));
  check('per-instance appearances survive a project reload',bobAfterLoad.length===2&&bobAfterLoad[0].c==='ffffff'&&!bobAfterLoad[0].a&&bobAfterLoad[1].a==='moss'&&bobAfterLoad[1].c==='8fd17a',JSON.stringify(bobAfterLoad));

  // ── Inspector materials ───────────────────────────────────────────────────
  await page.evaluate(()=>STUDIO.select(STUDIO.objects.find(r=>r.type==='block')));
  await input('#mat-opacity',.5);
  await input('#mat-glow-color','#ff2200');await page.locator('#mat-glow').check();
  await input('#mat-glow-power',2);
  const glowCheck=await get(()=>{const m=[];STUDIO.selected.root.traverse(o=>{if(o.isMesh)for(const mm of (Array.isArray(o.material)?o.material:[o.material]))if(mm.isMeshStandardMaterial)m.push(mm);});return {opacity:m[0].opacity,transparent:m[0].transparent,emissive:m[0].emissive.getHexString(),power:m[0].emissiveIntensity};});
  check('opacity and emissive glow edit the real material',glowCheck.opacity===.5&&glowCheck.transparent&&glowCheck.emissive==='ff2200'&&glowCheck.power===2,JSON.stringify(glowCheck));
  await page.evaluate(()=>STUDIO.seek(2));
  check('material edits hold while scrubbing the timeline',await get(()=>{const m=[];STUDIO.selected.root.traverse(o=>{if(o.isMesh)for(const mm of (Array.isArray(o.material)?o.material:[o.material]))if(mm.isMeshStandardMaterial)m.push(mm);});return m[0].opacity===.5;}));
  await input('#mat-shininess',3);
  const shiny=await get(()=>{const m=[];STUDIO.selected.root.traverse(o=>{if(o.isMesh)for(const mm of (Array.isArray(o.material)?o.material:[o.material]))if(mm.isMeshStandardMaterial)m.push(mm);});return {physical:m[0].isMeshPhysicalMaterial,spec:m[0].specularIntensity};});
  check('shininess converts to a physical material with real specularIntensity',shiny.physical&&shiny.spec===3,JSON.stringify(shiny));
  await input('#mat-smoothness',.8);
  check('smoothness maps to PBR roughness',await get(()=>{const m=[];STUDIO.selected.root.traverse(o=>{if(o.isMesh)for(const mm of (Array.isArray(o.material)?o.material:[o.material]))if(mm.isMeshStandardMaterial)m.push(mm);});return Math.abs(m[0].roughness-.2)<1e-4;}));
  const matProject=await get(()=>STUDIO.projectData());
  await page.evaluate(d=>STUDIO.loadProject(d),matProject);
  await page.evaluate(()=>STUDIO.select(STUDIO.objects.find(r=>r.type==='block')));
  const matAfter=await get(()=>{const m=[];STUDIO.selected.root.traverse(o=>{if(o.isMesh)for(const mm of (Array.isArray(o.material)?o.material:[o.material]))if(mm.isMeshStandardMaterial)m.push(mm);});return {opacity:m[0].opacity,emissive:m[0].emissive.getHexString(),physical:m[0].isMeshPhysicalMaterial,spec:m[0].specularIntensity};});
  check('the full material spec survives a project reload',matAfter.opacity===.5&&matAfter.emissive==='ff2200'&&matAfter.physical&&matAfter.spec===3,JSON.stringify(matAfter));
  await page.locator('#material-reset').click();
  const matReset=await get(()=>{const r=STUDIO.selected;const m=[];r.root.traverse(o=>{if(o.isMesh)for(const mm of (Array.isArray(o.material)?o.material:[o.material]))if(mm.isMeshStandardMaterial)m.push(mm);});return {std:m[0].isMeshStandardMaterial&&!m[0].isMeshPhysicalMaterial,opacity:m[0].opacity,emissive:m[0].emissive.getHexString(),noSpec:m[0].specularIntensity===undefined,cleared:r.options.material===undefined};});
  check('material reset brings the untouched original back',matReset.std&&matReset.opacity===1&&matReset.emissive==='000000'&&matReset.noSpec&&matReset.cleared,JSON.stringify(matReset));
  await page.locator('#undo').click();
  check('material reset is undoable',await get(()=>{const m=[];STUDIO.selected.root.traverse(o=>{if(o.isMesh)for(const mm of (Array.isArray(o.material)?o.material:[o.material]))if(mm.isMeshStandardMaterial)m.push(mm);});return m[0].isMeshPhysicalMaterial&&m[0].specularIntensity===3;}));
  await page.locator('#material-reset').click();

  // ── Global settings: non-destructive overrides + custom sky ──────────────
  await page.locator('#open-settings').click();
  check('the Settings dock button opens the modular panel',await page.evaluate(()=>document.querySelector('#settings-dialog').open));
  await setCheck('#settings-smoothness-on',true);await input('#settings-smoothness',.9);
  const override=await get(()=>{const b=STUDIO.objects.find(r=>r.type==='block');const m=[];b.root.traverse(o=>{if(o.isMesh)for(const mm of (Array.isArray(o.material)?o.material:[o.material]))if(mm.isMeshStandardMaterial)m.push(mm);});const bob=STUDIO.objects.filter(r=>r.character).at(-1);return {blockRough:m[0].roughness,bobColor:bob.character.material.color.getHexString(),note:document.querySelector('#settings-material-note').textContent};});
  check('global smoothness overrides eligible objects but never Bob’s skin',near(override.blockRough,.1)&&override.bobColor==='8fd17a'&&override.note.includes('eligible'),JSON.stringify(override));
  await setCheck('#settings-shininess-on',true);await input('#settings-shininess',2.5);
  check('global shininess reaches eligible materials as real specular',await get(()=>{const m=[];STUDIO.objects.find(r=>r.type==='block').root.traverse(o=>{if(o.isMesh)for(const mm of (Array.isArray(o.material)?o.material:[o.material]))if(mm.isMeshStandardMaterial)m.push(mm);});return m[0].isMeshPhysicalMaterial&&m[0].specularIntensity===2.5;}));
  await setCheck('#settings-texture-on',true);await input('#settings-texture','grass');
  check('the global texture override applies a catalog texture',await get(()=>{const m=[];STUDIO.objects.find(r=>r.type==='block').root.traverse(o=>{if(o.isMesh)for(const mm of (Array.isArray(o.material)?o.material:[o.material]))if(mm.isMeshStandardMaterial)m.push(mm);});return !!m[0].map;}));
  await page.locator('#settings-material-reset').click();
  const afterReset=await get(()=>{const m=[];STUDIO.objects.find(r=>r.type==='block').root.traverse(o=>{if(o.isMesh)for(const mm of (Array.isArray(o.material)?o.material:[o.material]))if(mm.isMeshStandardMaterial)m.push(mm);});return {rough:m[0].roughness,std:m[0].isMeshStandardMaterial&&!m[0].isMeshPhysicalMaterial,spec:m[0].specularIntensity,mapIsTex:!!(m[0].map&&m[0].map.isTexture)};});
  check('Reset all returns every original material',near(afterReset.rough,1)&&afterReset.std&&afterReset.spec===undefined&&afterReset.mapIsTex,JSON.stringify(afterReset));
  await setCheck('#settings-sky-enabled',true);await input('#settings-sky-color','#ff0044');
  const skyOn=await get(()=>STUDIO.scene.background.getHexString());
  check('the custom sky color becomes the real scene background',skyOn==='ff0044',skyOn);
  await page.locator('#settings-sky-reset').click();
  const skyOff=await get(()=>({hex:STUDIO.scene.background.getHexString(),enabled:STUDIO.settings.data.sky.enabled}));
  check('Reset to the original sky restores the default background',!skyOff.enabled&&(skyOff.hex===originalSky||skyOff.hex!=='ff0044'),skyOff.hex+' vs '+originalSky);
  await setCheck('#settings-sky-enabled',true);
  await page.locator('#settings-dialog .dialog-close').click();
  await page.locator('#undo').click();
  check('settings changes are undoable',await page.evaluate(s=>!STUDIO.settings.data.sky.enabled&&STUDIO.scene.background.getHexString()===s,originalSky));
  await page.locator('#open-settings').click();
  await setCheck('#settings-sky-enabled',true);await input('#settings-sky-color','#2233ff');
  const settingsProject=await get(()=>STUDIO.projectData());
  await page.evaluate(d=>STUDIO.loadProject(d),settingsProject);
  check('settings persist in the project and re-apply after reload',await get(()=>{const s=STUDIO.settings.data;return s.sky.enabled&&s.sky.color==='#2233ff'&&STUDIO.scene.background.getHexString()==='2233ff';}));
  await page.locator('#settings-dialog .dialog-close').click();

  // ── Multi-selection & grouping ────────────────────────────────────────────
  await page.evaluate(()=>STUDIO.select(STUDIO.objects.find(r=>r.type==='lamp')));
  await page.locator('#select-all-objects').click();
  const allCount=await get(()=>STUDIO.multi.selected.length);
  check('Select all gathers the eligible objects',allCount>=8,allCount+' objects');
  await page.evaluate(()=>{STUDIO.multi.clear();STUDIO.setMode('select');});
  // Find a screen point whose real raycast resolves to exactly the target record.
  const points=await get(()=>{
    const findPoint=rec=>{
      const box=new STUDIO.THREE.Box3().setFromObject(rec.root);
      const view=document.querySelector('#scene').getBoundingClientRect();
      const corners=[[0,0,0],[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],[1,1,1],[.5,.5,.5],[.5,.9,.5],[.9,.5,.5],[.5,.5,.9],[.1,.9,.1],[.9,.9,.9]];
      for(const c of corners){
        const p=new STUDIO.THREE.Vector3(box.min.x+c[0]*(box.max.x-box.min.x),box.min.y+c[1]*(box.max.y-box.min.y),box.min.z+c[2]*(box.max.z-box.min.z)).project(STUDIO.camera);
        const x=Math.round(view.x+(p.x*.5+.5)*view.width),y=Math.round(view.y+(-p.y*.5+.5)*view.height);
        if(document.elementFromPoint(x,y)!==document.querySelector('#scene'))continue;
        const hit=STUDIO.sceneHit({clientX:x,clientY:y});
        if(!hit)continue;
        let o=hit.object;while(o&&!STUDIO.objects.some(r=>r.root===o))o=o.parent;
        if(o&&STUDIO.objects.find(r=>r.root===o)===rec)return {x,y};
      }
      return null;
    };
    return {lamp:findPoint(STUDIO.objects.find(o=>o.type==='lamp')),block:findPoint(STUDIO.objects.find(o=>o.type==='block'))};
  });
  check('canvas raycasts resolve to the intended records',!!points.lamp&&!!points.block,JSON.stringify(points));
  // Shift-click adds whole objects to the multi-selection (Ctrl works too).
  await page.keyboard.down('Shift');
  await page.mouse.click(points.lamp.x,points.lamp.y);
  await page.mouse.click(points.block.x,points.block.y);
  await page.keyboard.up('Shift');
  const multiTwo=await get(()=>({n:STUDIO.multi.selected.length,types:STUDIO.multi.selected.map(r=>r.type).sort()}));
  check('Shift-click adds a second object to the selection',multiTwo.n===2&&multiTwo.types.includes('lamp')&&multiTwo.types.includes('block'),JSON.stringify(multiTwo));
  await page.locator('#group-create').click();
  const group1=await get(()=>({groups:STUDIO.groups.list.length,g:STUDIO.groups.list[0],shown:document.querySelector('#outliner').textContent.includes(STUDIO.groups.list[0]?.name||'')}));
  check('the group is created from the selection and listed in the outliner',group1.groups===1&&group1.g.members.length===2&&group1.shown,JSON.stringify(group1.g));
  const before=await get(()=>STUDIO.multi.selected.map(r=>r.root.position.toArray()));
  await page.evaluate(()=>{const p=STUDIO.multi.proxy;p.position.set(p.position.x+1.5,0,p.position.z+0.5);STUDIO.multi.apply();STUDIO.multi.record('move objects');});
  const moved=await get(()=>STUDIO.multi.selected.map(r=>r.root.position.toArray()));
  const relOk=Math.abs((moved[0][0]-before[0][0])-(moved[1][0]-before[1][0]))<1e-6&&Math.abs((moved[0][2]-before[0][2])-(moved[1][2]-before[1][2]))<1e-6;
  check('moving the group preserves every member’s relative transform',relOk&&moved[0][0]-before[0][0]>0.9,JSON.stringify({before,moved}));
  await page.locator('#undo').click();
  const undone=await get(()=>STUDIO.multi.selected.map(r=>r.root.position.toArray()));
  check('a group move is one undo step',undone[0].every((v,i)=>near(v,before[0][i],1e-6))&&undone[1].every((v,i)=>near(v,before[1][i],1e-6)),JSON.stringify(undone));
  await page.evaluate(()=>STUDIO.groups.rename(STUDIO.groups.list[0],'Fort'));
  const renamed=await get(()=>({name:STUDIO.groups.list[0].name,shown:document.querySelector('#outliner').textContent.includes('Fort'),members:STUDIO.groups.members(STUDIO.groups.list[0]).length}));
  check('renaming a group updates the outliner live',renamed.name==='Fort'&&renamed.shown&&renamed.members===2,JSON.stringify(renamed));
  const groupProject=await get(()=>STUDIO.projectData());
  await page.evaluate(d=>STUDIO.loadProject(d),groupProject);
  const hierarchy=await get(()=>{const g=STUDIO.groups.list[0];return {name:g?.name,linked:STUDIO.objects.filter(r=>r.groupId).length,live:g?STUDIO.groups.members(g).length:0};});
  check('save/load keeps the group hierarchy intact',hierarchy.name==='Fort'&&hierarchy.linked===hierarchy.live&&hierarchy.live===2,JSON.stringify(hierarchy));
  await page.evaluate(()=>STUDIO.groups.ungroup());
  const ungrouped=await get(()=>({groups:STUDIO.groups.list.length,linked:STUDIO.objects.filter(r=>r.groupId).length,pos:STUDIO.objects.find(r=>r.type==='lamp').root.position.toArray()}));
  check('ungrouping keeps every identity and transform',ungrouped.groups===0&&ungrouped.linked===0&&near(ungrouped.pos[0],before[0][0],1e-5),JSON.stringify(ungrouped));

  // ── Custom Mesh Editor ────────────────────────────────────────────────────
  await page.waitForTimeout(1200);
  const assets0=await get(()=>STUDIO.meshEditor.assets().length);
  await page.locator('#open-mesh-editor').click();
  const editor1=await get(()=>({open:document.querySelector('#mesh-editor-dialog').open,canvas:!!document.querySelector('#mesh-editor-host canvas'),parts:document.querySelector('[data-me=partcount]').textContent}));
  check('the mesh editor opens an isolated workspace with its own viewport',editor1.open&&editor1.canvas,JSON.stringify(editor1));
  await page.locator('[data-me-add="box"]').click();
  const editor2=await get(()=>({count:document.querySelector('[data-me=partcount]').textContent,rows:document.querySelectorAll('[data-me=parts] .me-part').length||document.querySelectorAll('[data-me=parts] > *').length}));
  check('parts can be added in the editor',editor2.rows>0,JSON.stringify(editor2));
  await page.locator('[data-me=finish]').click();
  await page.waitForTimeout(900);   // finish saves the asset (IndexedDB) before joining the scene
  const meshObj=await get(()=>{const r=STUDIO.objects.find(r=>r.type==='mesh');return r?{name:r.name,meshes:r.root.children.filter(c=>c.isMesh).length,selected:STUDIO.selected===r}:null;});
  check('Finish joins the parts into one selectable scene object',!!meshObj&&meshObj.meshes>=1,JSON.stringify(meshObj));
  await page.waitForTimeout(2600);
  const assets1=await get(()=>STUDIO.meshEditor.assets().length);
  check('the finished mesh is stored as a reusable library asset',assets1===assets0+1,assets0+' → '+assets1);
  await page.reload();await boot(page,process.env.APP_URL||'http://127.0.0.1:8000/');
  await page.locator('[data-library="meshes"]').click();await page.waitForTimeout(1500);
  const assets2=await get(()=>STUDIO.meshEditor.assets().length);
  check('custom mesh assets persist across a page reload',assets2===assets1,assets1+' → '+assets2);
  await page.locator('[data-library="meshes"]').click();await page.waitForTimeout(600);
  const meshCards=await get(()=>document.querySelectorAll('#asset-grid .asset-card').length);
  check('the Meshes library category lists persisted assets',meshCards===assets2,meshCards+' cards · '+assets2+' assets');
  await page.evaluate(()=>document.querySelector('#asset-grid .asset-card')?.click());
  check('a library mesh can be re-added to any scene',await get(()=>STUDIO.objects.some(r=>r.type==='mesh')));
  await page.evaluate(()=>STUDIO.select(STUDIO.objects.find(r=>r.type==='mesh')));
  const editVisible=await page.locator('#edit-mesh').isVisible();
  await page.locator('#edit-mesh').click();
  const reEdit=await get(()=>({open:document.querySelector('#mesh-editor-dialog').open,update:!!document.querySelector('[data-me=save-update]')}));
  check('Edit mesh reopens the editor on the stored asset',editVisible&&reEdit.open&&reEdit.update,JSON.stringify({editVisible,reEdit}));
  await page.locator('[data-me=save-update]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-me=cancel]').click();
  await page.waitForTimeout(600);
  const assets3=await get(()=>STUDIO.meshEditor.assets().length);
  check('saving edits updates the existing asset (no duplicate)',assets3===assets2,assets2+' → '+assets3);

  // ── Combined integration ──────────────────────────────────────────────────
  await page.evaluate(()=>STUDIO.select(STUDIO.objects.filter(r=>r.character).at(-1)));
  await input('#bob-tint','moss');   // re-style after the reload (per-instance)
  await page.evaluate(()=>{
    const lamp=STUDIO.objects.find(r=>r.type==='lamp');
    const bob=STUDIO.objects.filter(r=>r.character).at(-1);
    const block=STUDIO.objects.find(r=>r.type==='block');
    STUDIO.multi.toggle(lamp);STUDIO.multi.toggle(bob);STUDIO.multi.toggle(block);
  });
  await page.locator('#group-create').click();
  const integProject=await get(()=>STUDIO.projectData());
  await page.evaluate(d=>STUDIO.loadProject(d),integProject);
  const integ=await get(()=>{
    const g=STUDIO.groups.list.at(-1);
    const lamp=STUDIO.objects.find(r=>r.type==='lamp');
    const bob=STUDIO.objects.filter(r=>r.character).at(-1);
    const block=STUDIO.objects.find(r=>r.type==='block');
    const light=lamp.root.children.find(c=>c.isPointLight||c.isSpotLight);
    const mats=[];block.root.traverse(o=>{if(o.isMesh)for(const mm of (Array.isArray(o.material)?o.material:[o.material]))if(mm.isMeshStandardMaterial)mats.push(mm);});
    return {members:g?g.members.length:0,lightOn:light?light.intensity>0:false,lampCfg:lamp.options.light?.color,
      bobTint:bob.options.appearance?.tint,bobColor:bob.character.material.color.getHexString(),
      blockOpacity:mats[0]?.opacity,meshAlive:STUDIO.objects.some(r=>r.type==='mesh')};
  });
  check('groups preserve customized Bobs, lights, materials and meshes through save/load',
    integ.members===3&&integ.lightOn&&integ.lampCfg==='#ffbd64'&&integ.bobTint==='moss'&&integ.bobColor==='8fd17a'&&integ.blockOpacity===1&&integ.meshAlive,JSON.stringify(integ));
  await page.evaluate(()=>STUDIO.groups.select(STUDIO.groups.list.at(-1)));
  await page.evaluate(()=>{const p=STUDIO.multi.proxy;p.position.set(p.position.x,2,p.position.z);STUDIO.multi.apply();STUDIO.multi.record('move group');});
  const integMove=await get(()=>{const g=STUDIO.groups.list.at(-1);return STUDIO.groups.members(g).map(x=>x.root.position.y);});
  check('the combined group transforms as one',integMove.length===3&&integMove.every(y=>near(y,2,.4)),JSON.stringify(integMove));
  await page.screenshot({path:path.join(results,'features-v5.png')});
  check('no unexpected runtime or loading errors',errors.length===0,errors[0]||'');
}catch(e){console.log('SUITE ERROR:',e&&e.stack||e);throw e;}finally{
  await browser.close();
  const failed=checks.filter(c=>!c.pass).length;
  console.log(`\nfeatures-v5-browser: ${checks.length-failed}/${checks.length} checks passed.`);
  process.exit(failed||errors.length?1:0);
}
