// Timeline panel layout: track visibility, resizing, collapsing, persistence.
import {launch,boot} from './browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await launch();
const url=process.env.APP_URL||'http://127.0.0.1:8000/';
async function openPage(w,h,clear=true){
  const page=await browser.newPage({viewport:{width:w,height:h}});
  if(clear)await page.addInitScript(()=>{try{if(!localStorage.getItem('studioTimelinePanelCleared')){localStorage.removeItem('studioTimelinePanel');localStorage.setItem('studioTimelinePanelCleared','1');}}catch(e){}});
  await page.addInitScript(()=>{try{localStorage.setItem('studioDevice','desktop');}catch(e){}});
  await page.goto(url,{waitUntil:'load',timeout:60000});
  await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:90000});
  await page.waitForFunction(()=>!document.querySelector('#loader'));
  await page.evaluate(()=>{document.body.classList.add('panel-timeline');document.getAnimations().forEach(a=>a.finish?.());});
  await page.waitForTimeout(300);
  return page;
}
function metrics(){
  const q=s=>document.querySelector(s);
  const r=e=>{const b=e.getBoundingClientRect();return{top:b.top,bottom:b.bottom,height:b.height};};
  const tl=q('.timeline'),tb=q('.timeline-toolbar'),nav=q('.timeline-navigation'),tr=q('.tracks'),ts=q('#timeline-scroll'),ruler=q('#ruler'),lanes=[...document.querySelectorAll('.track-lane')],foot=q('.timeline-footnote');
  return {
    vh:innerHeight,
    tl:r(tl),toolbar:r(tb),nav:r(nav),tracks:r(tr),scroll:r(ts),ruler:r(ruler),
    lanes:lanes.map(r),footnote:r(foot),
    varTimeline:getComputedStyle(document.documentElement).getPropertyValue('--timeline').trim(),
    collapsed:document.body.classList.contains('timeline-collapsed'),
    scrollClient:ts.clientHeight,scrollWidth:ts.scrollWidth
  };
}
const results={};
// 1. Standard desktop: everything visible and ordered.
{
  const page=await openPage(1365,768);
  const m=await page.evaluate(metrics);
  assert.ok(m.toolbar.top>=m.tl.top-1&&m.toolbar.bottom<=m.nav.top+1,'toolbar above navigation');
  assert.ok(m.ruler.height>=20&&m.lanes.length===2,'ruler and two lanes');
  assert.ok(m.lanes.every(l=>l.height>=29),'both lanes at least 29px');
  assert.ok(m.tracks.bottom<=m.vh+1,'tracks end on screen');
  assert.ok(m.footnote.bottom<=m.vh+1,'footnote on screen');
  assert.ok(m.scrollClient>=86,'scroll viewport has real height');
  results.desktop=Math.round(m.tracks.height);
  // 2. Drag the resizer up ~90px -> taller timeline.
  const before=await page.evaluate(()=>document.querySelector('.timeline').getBoundingClientRect().height);
  const box=await page.locator('#timeline-resizer').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+3);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+3-90,{steps:6});
  await page.mouse.up();
  await page.waitForTimeout(150);
  const after=await page.evaluate(()=>({h:document.querySelector('.timeline').getBoundingClientRect().height,tracks:document.querySelector('.tracks').getBoundingClientRect().height}));
  assert.ok(after.h>before+80,'dragging the divider grows the timeline: '+before+' -> '+after.h);
  results.resized=Math.round(after.h);results.resizedTracks=Math.round(after.tracks);
  assert.ok(after.tracks>results.desktop,'track area grows with the panel');
  // 3. Height persists across reload.
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:90000});
  await page.evaluate(()=>{document.body.classList.add('panel-timeline');document.getAnimations().forEach(a=>a.finish?.());});
  await page.waitForTimeout(250);
  const persisted=await page.evaluate(()=>document.querySelector('.timeline').getBoundingClientRect().height);
  assert.ok(Math.abs(persisted-after.h)<2,'stored height survives a reload: '+persisted+' vs '+after.h);
  results.persisted=Math.round(persisted);
  // 4. Collapse hides the track area but keeps the toolbar; expand restores.
  await page.click('#timeline-collapse');
  await page.waitForTimeout(120);
  const collapsed=await page.evaluate(metrics);
  assert.ok(collapsed.collapsed,'collapsed state set');
  assert.ok(collapsed.tracks.height===0,'track area hidden when collapsed');
  assert.ok(collapsed.toolbar.height>=40,'toolbar still visible when collapsed');
  const dockBottom=await page.evaluate(()=>getComputedStyle(document.querySelector('.dock')).bottom);
  assert.ok(parseFloat(dockBottom)<80,'dock sits near the collapsed timeline: '+dockBottom);
  results.collapsedDock=dockBottom;
  await page.click('#timeline-collapse');
  await page.waitForTimeout(120);
  const expanded=await page.evaluate(()=>({h:document.querySelector('.timeline').getBoundingClientRect().height,tracks:document.querySelector('.tracks').getBoundingClientRect().height}));
  assert.ok(Math.abs(expanded.h-after.h)<2,'expand restores the chosen height');
  assert.ok(expanded.tracks>80,'tracks visible again');
  await page.close();
}
// 5. Short window: toolbar + usable tracks both stay visible.
for(const [w,h] of [[1365,600],[1365,500],[1365,420],[1280,380]]){
  const page=await openPage(w,h);
  const m=await page.evaluate(metrics);
  assert.ok(m.toolbar.top>=0&&m.toolbar.bottom<=m.vh,'toolbar visible at '+w+'x'+h);
  assert.ok(m.scrollClient>=80,'track viewport usable at '+w+'x'+h+': '+m.scrollClient);
  assert.ok(m.lanes.every(l=>l.height>=29),'lanes editable at '+w+'x'+h);
  assert.ok(m.tracks.bottom<=m.vh+1,'no tracks clipped at '+w+'x'+h);
  results['short'+h]=Math.round(m.tracks.height);
  await page.close();
}
// 6. Very small stored height is clamped so the timeline can never be unusable.
{
  const page=await openPage(1365,768,false);
  await page.evaluate(()=>{try{localStorage.setItem('studioTimelinePanel',JSON.stringify({height:60}));}catch(e){}});
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:90000});
  await page.evaluate(()=>{document.body.classList.add('panel-timeline');document.getAnimations().forEach(a=>a.finish?.());});
  await page.waitForTimeout(250);
  const m=await page.evaluate(metrics);
  assert.ok(m.scrollClient>=80,'tiny stored height is clamped to a usable track area: '+m.scrollClient);
  results.clamped=Math.round(m.tracks.height);
  await page.close();
}
// 7. Project save carries the chosen height and collapsed state.
{
  const page=await openPage(1365,768);
  await page.click('#timeline-collapse');
  await page.waitForTimeout(100);
  const saved=await page.evaluate(()=>{const d=STUDIO.projectData();return d.editor?.timelineUI;});
  assert.ok(saved&&saved.collapsed===true,'project data records the collapsed state');
  assert.ok(typeof saved.height==='number','project data records the height');
  await page.close();
}
fs.mkdirSync('tests/results',{recursive:true});
fs.writeFileSync('tests/results/timeline-panel.json',JSON.stringify(results,null,2));
console.log('PASS timeline panel layout, resize, collapse and persistence',results);
await browser.close();
