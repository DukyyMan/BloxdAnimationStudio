// Minimal browser smoke test using the locally available chromium build.
// Usage: node tests/browser-smoke.mjs [url]
import {launch} from './browser.mjs';
const url=process.argv[2]||'http://127.0.0.1:8000/';
let browser;
try{
  browser=await launch({args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:1280,height:820}});
  const errors=[];
  page.on('pageerror',e=>errors.push('PAGEERROR '+e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text());});
  page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
  await page.goto(url,{waitUntil:'load',timeout:60000});
  await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:90000});
  const info=await page.evaluate(()=>({objects:STUDIO.objects.length,blocks:STUDIO.world.count,shadow:STUDIO.renderer.shadowMap.enabled,toneMapping:STUDIO.renderer.toneMapping}));
  console.log('OK',JSON.stringify(info));
  console.log('errors:',errors.slice(0,10));
  await page.screenshot({path:'tests/results/browser-smoke.png'});
}catch(e){console.error('FAIL',e.message);process.exitCode=1;}
finally{if(browser)await browser.close();}
