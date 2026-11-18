// Shared browser launcher for the Playwright suites.
//
// CI / a normal desktop install has Playwright's own Chromium and needs nothing
// special. Some sandboxes cannot download Playwright's browser builds, but a
// Chromium executable is still available (e.g. extracted from the
// @sparticuz/chromium npm package). Point CHROMIUM_PATH at any Chromium
// executable to use it; the helper also exposes the NSS/NSPR shared objects
// that Chromium needs next to a non-system install.
import fs from 'node:fs';
import {chromium} from 'playwright';

const GL_ARGS=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'];

function localChromium(){
  for(const p of [process.env.CHROMIUM_PATH,'/tmp/chromium']){
    if(p&&fs.existsSync(p))return p;
  }
  return null;
}

export async function launch(options={}){
  const args=[...new Set([...GL_ARGS,...(options.args||[])])];
  const path=localChromium();
  if(path){
    // Chromium loads libnss3/libnspr4 from its own directory or the system.
    // The sandbox keeps them in /tmp/al2023/lib (from @sparticuz/chromium).
    const libDir='/tmp/al2023/lib';
    if(fs.existsSync(libDir))process.env.LD_LIBRARY_PATH=[libDir,process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
    return chromium.launch({...options,args,executablePath:path});
  }
  return chromium.launch({...options,args});
}

export {chromium};

// The studio's panels are drawers (v4). The regression suites interact with the
// library, inspector and timeline controls directly, so boot opens all three and
// answers the first-run device question the way a desktop user would.
export async function boot(page,url){
  await page.addInitScript(()=>{try{localStorage.setItem('studioDevice','desktop');}catch(e){}});
  await page.goto(url||process.env.APP_URL||'http://127.0.0.1:8000/',{waitUntil:'load',timeout:60000});
  await page.waitForFunction(()=>window.STUDIO?.ready,null,{timeout:90000});
  await page.waitForFunction(()=>!document.querySelector('#loader'));
  await page.evaluate(()=>document.body.classList.add('panel-library','panel-inspector','panel-timeline'));
  await page.waitForTimeout(450);
  return page;
}
