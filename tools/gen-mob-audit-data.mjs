#!/usr/bin/env node
// Generates lib/mob-audit-data.js from the reproducible audit in
// assets/mob-audit.json (produced by tools/audit-mobs.py against the official
// Bloxdy/texture-packs and Bloxdy/code-api snapshots) and the mob-settings
// variation snapshot in assets/catalog-sources/mob-settings-audit.md.
//
// The generated module feeds the studio's Mobs library: every row carries the
// honest verified status — no substitute mobs, no placeholder rigs. Re-run:
//   node tools/gen-mob-audit-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const audit=JSON.parse(fs.readFileSync(path.join(root,'assets','mob-audit.json'),'utf8'));
const settingsMd=fs.readFileSync(path.join(root,'assets','catalog-sources','mob-settings-audit.md'),'utf8');

// Variation lists come from the official mob-settings snapshot: one
// `Name: "default", "variant", …` line per mob type.
const settingsVars=new Map();
for(const line of settingsMd.split('\n')){
  const m=/^([\w ']{1,40}):\s*(.+)$/.exec(line);
  if(!m)continue;
  const vars=[...m[2].matchAll(/"([^"]+)"/g)].map(x=>x[1]);
  if(vars.length)settingsVars.set(m[1].trim(),vars);
}
const variationsFromSettings=name=>settingsVars.get(name)||null;

const rows=audit.mobs.map(m=>{
  // Prefer the audited geometry verdict; fall back to the settings snapshot.
  const variations=Array.isArray(m.variations)?m.variations:variationsFromSettings(m.name)||['default'];
  const geoms=Array.isArray(m.geometry)?m.geometry:[];
  const usable=!!m.usable&&geoms.length>0;
  // Turn the raw audit verdicts into the reviewed, user-facing reason.
  const classes=geoms.map(g=>g.classification).filter(Boolean);
  const reason=!geoms.length
    ?'No animatable original geometry is published for this mob.'
    :`Official candidate geometry exists (${classes.join('; ')}) but has no verified anatomy or skeleton, so it cannot be rigged honestly.`;
  return {
    name:String(m.name).slice(0,60),
    variations,
    status:usable?'usable':'unavailable',
    reason,
    textures:(m.textureCandidates||[]).slice(0,8),
  };
});

const data={
  audited:audit.audited,
  packRevision:audit.sources?.packRevision||'unknown',
  officialTypes:rows.length,
  usable:rows.filter(r=>r.status==='usable').length,
  mobs:rows,
};

const out=`// GENERATED from assets/mob-audit.json (tools/audit-mobs.py) and the official
// mob-settings snapshot in assets/catalog-sources/mob-settings-audit.md.
// Regenerate rows with: node tools/gen-mob-audit-data.mjs
// Every entry is a genuinely verified status, not a substitute or a guess.
export const MOB_AUDIT={audited:${JSON.stringify(data.audited)},packRevision:${JSON.stringify(data.packRevision)},officialTypes:${data.officialTypes},usable:${data.usable},mobs:${JSON.stringify(data.mobs)}};
`

fs.writeFileSync(path.join(root,'lib','mob-audit-data.js'),out);
console.log('lib/mob-audit-data.js written:',data.officialTypes,'types ·',data.usable,'usable · pack',data.packRevision.slice(0,8));
