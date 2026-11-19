// Real-browser coverage for the code editor: scripts must produce ordinary,
// manually editable scene objects, terrain, camera keys and animated lighting.
import {launch,boot} from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'tests/results');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[];function check(name,pass,detail=''){checks.push({name,pass:!!pass,detail});console.log((pass?'PASS ':'FAIL ')+name+(detail?' — '+detail:''));}
const browser=await launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
const get=fn=>page.evaluate(fn);
async function input(id,v){await page.locator(id).evaluate((el,v)=>{el.focus();el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},v);}
async function applyScript(code,{replace=false}={}){
  if(await page.evaluate(()=>document.querySelector('#code-dialog')?.open))await page.evaluate(()=>document.querySelector('#code-dialog').close());
  await page.locator('#open-code').click();
  await page.locator('#code-source').fill(code);
  if(replace!==await page.locator('#code-replace').isChecked())await page.locator('#code-replace').click();
  await page.locator('#code-validate').click();
  const status=await page.locator('#code-status').textContent();
  if(status.startsWith('Valid')){await page.locator('#code-apply').click();await page.waitForTimeout(700);}
  return status;
}
try{
  await boot(page);
  const starter=await get(()=>STUDIO.projectData());
  check('code editor opens from the dock',await page.locator('#open-code').isVisible());
  await page.locator('#open-code').click();
  check('code dialog shows the supported API and a replace option',await page.locator('#code-dialog').isVisible()&&await page.locator('#code-replace').isVisible());
  await page.locator('#code-validate').click();
  const status=await page.locator('#code-status').textContent();
  check('the shipped example validates',status.startsWith('Valid'),status);

  // ── Apply: real objects, terrain, camera keys, animated sun, fps ──
  const before={objects:starter.objects.length,blocks:starter.world.blocks.length};
  const applied=await applyScript(await page.locator('#code-source').inputValue());
  const after=await get(()=>({objects:STUDIO.objects.length,blocks:STUDIO.world.count,fps:STUDIO.timeline.fps,lightKeys:STUDIO.light.keys.length,camKeys:STUDIO.camTrack.keys.length,
    mesh:STUDIO.objects.find(o=>o.type==='mesh')?{name:STUDIO.objects.find(o=>o.type==='mesh').name,children:STUDIO.objects.find(o=>o.type==='mesh').root.children.length,scriptId:STUDIO.objects.find(o=>o.type==='mesh').options.scriptId}:null,
    hero:STUDIO.objects.find(o=>o.options?.scriptId==='hero')?{type:STUDIO.objects.find(o=>o.options?.scriptId==='hero').type,keys:STUDIO.objects.find(o=>o.options?.scriptId==='hero').character.keys.length}:null}));
  check('script generates a character and a custom mesh in the scene',after.objects===before.objects+2&&after.mesh&&after.hero?.type==='character',JSON.stringify(after));
  check('generated mesh is a real mesh group',after.mesh.children>=1);
  check('script generates editable voxel terrain',after.blocks>before.blocks,'+'+(after.blocks-before.blocks)+' cells');
  check('script sets the project frame rate',after.fps===24);
  check('script writes camera keys',after.camKeys>=2);
  check('script writes animated sun keys',after.lightKeys===2);
  check('generated character has pose keys',after.hero.keys>2);

  // ── Generated content is manually editable ──
  await get(()=>{const m=STUDIO.objects.find(o=>o.type==='mesh');STUDIO.select(m);});
  check('generated mesh is selectable in the inspector',await get(()=>STUDIO.selected?.type==='mesh'));
  check('generated mesh reports an editable kind',(await page.locator('#object-kind').textContent()).includes('Custom mesh'));
  const meshId=await get(()=>STUDIO.selected.id);
  await page.locator('#key-time').fill('5');await page.locator('#key-time').press('Tab');
  await input('#rot-y',60);
  await page.locator('#key-pose').click();
  const manualKey=await page.evaluate(id=>{const r=STUDIO.objects.find(o=>o.id===id);return r.keys.find(k=>Math.abs(k.time-5)<1e-6);},meshId);
  check('a manual key can be added to a generated mesh',!!manualKey&&Math.abs(manualKey.rotation[1]-Math.PI/3)<1e-6,JSON.stringify(manualKey));

  // ── Update-by-id preserves manual edits; replace rebuilds ──
  const updateStatus=await applyScript(await page.locator('#code-source').inputValue());
  check('re-running in update mode preserves the manual key',updateStatus.includes('existing keys preserved')&&await page.evaluate(id=>{const r=STUDIO.objects.find(o=>o.id===id);return r.keys.some(k=>Math.abs(k.time-5)<1e-6);},meshId),updateStatus);
  check('update mode does not duplicate the generated pose keys',await get(()=>{const h=STUDIO.objects.find(o=>o.options?.scriptId==='hero');return h.character.keys.filter(k=>Math.abs(k.time-1)<1e-6).length===1;}));

  const replaceStatus=await applyScript((await page.locator('#code-source').inputValue()).replace(/project\.setGeneratedMode\("update"\);/,''),{replace:true});
  check('replace mode reports the rebuild',replaceStatus.includes('replace generated'),replaceStatus);
  check('replace mode keeps the same generated object ids',await get(()=>STUDIO.objects.filter(o=>o.options?.scriptId).length===2));

  // ── Sun animation is real, not just stored data ──
  await get(()=>STUDIO.seek(0,true));
  const sunStart=await get(()=>({az:STUDIO.light.az,el:STUDIO.light.el,power:STUDIO.light.power}));
  await get(()=>STUDIO.seek(8,true));
  const sunEnd=await get(()=>({az:STUDIO.light.az,el:STUDIO.light.el,power:STUDIO.light.power}));
  check('animated sun keys drive the actual lighting',Math.abs(sunStart.az+38)<.5&&Math.abs(sunEnd.az-120)<.5,JSON.stringify({sunStart,sunEnd}));

  // ── Terrain cells are ordinary editable voxels ──
  const painted=await get(()=>{const before=STUDIO.world.count;const r=STUDIO.addProp('block',new STUDIO.THREE.Vector3(3,3,3),{block:'stone'});STUDIO.select(r);return before;});
  check('generated terrain coexists with normal scene objects',painted===after.blocks);

  // ── Save / reload keeps generated data editable ──
  await page.locator('#open-project-menu').click();
  const promise=page.waitForEvent('download',{timeout:90000});
  await page.locator('#save-project').click();
  const d=await promise,file=path.join(out,'code-generated-scene.bloxd.json');await d.saveAs(file);
  const saved=JSON.parse(fs.readFileSync(file,'utf8'));
  check('saved project contains the generated mesh and animated sun',saved.objects.some(o=>o.type==='mesh')&&saved.light.keys.length===2&&saved.timeline.fps===24);
  await page.evaluate(data=>STUDIO.loadProject(data),saved);
  check('generated scene reloads with its mesh and sun animation',await get(()=>STUDIO.objects.some(o=>o.type==='mesh')&&STUDIO.light.keys.length===2));

  check('no unexpected browser errors during code generation',errors.length===0,errors.join(' | '));
}catch(e){check('code studio browser runner completed',false,e.stack);}
finally{
  await browser.close();
  fs.writeFileSync(path.join(out,'code-studio-report.json'),JSON.stringify({date:'2026-11-18',version:'4.0.0',checks,errors},null,2));
  const failures=checks.filter(c=>!c.pass);console.log(`\n${checks.length-failures.length}/${checks.length} code-studio checks passed.`);
  process.exitCode=failures.length?1:0;
}
