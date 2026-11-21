"""Reproducible geometry/provenance inventory. Never promotes icons to rigs.
Uses only the packaged pack and the official Code API snapshot; no network.
"""
from pathlib import Path
import json, struct, re, hashlib
ROOT=Path(__file__).resolve().parents[1]
A=ROOT/'assets'
settings=(A/'catalog-sources/mob-settings-audit.md').read_text()
section=settings.split('Some mob types support variations')[1].split('```')[1]
names=re.findall(r'^([^:\n]+): ', section, re.M)
manifest=json.loads((A/'default-pack-manifest.json').read_text())
byfile={r['path']:r for r in manifest['files']}
registry=json.loads((A/'catalog-sources/game-asset-registry.json').read_text())
pack=A/'default-pack'
normal=lambda s:re.sub(r'[^a-z0-9]','',s.lower())
def inspect(p):
 b=p.read_bytes();size=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+size]);rel=str(p.relative_to(A))
 # Manifest keys use upstream default/, not local default-pack/.
 upstream='default/'+str(p.relative_to(pack)) if p.is_relative_to(pack) else None
 record=byfile.get(upstream,{})
 live=next((r for r in json.loads((A/'catalog-sources/live-item-models-manifest.json').read_text())if r.get('file')==rel),{})
 return {'file':'assets/'+rel,'source':f'https://github.com/Bloxdy/texture-packs/blob/{manifest["revision"]}/{upstream}' if upstream else live.get('url'),
  'sha256':hashlib.sha256(b).hexdigest(),'gitBlob':record.get('gitBlob'),
  'gitBlobVerified':hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==record['gitBlob'] if record.get('gitBlob') else None,
  'nodes':[{'name':n.get('name'),'mesh':n.get('mesh'),'children':n.get('children',[])} for n in d.get('nodes',[])],
  'meshes':len(d.get('meshes',[])),'skins':len(d.get('skins',[])),'animations':len(d.get('animations',[])),
  'embeddedImages':len(d.get('images',[])),
  'positionAccessors':[{'vertices':a['count'],'min':a.get('min'),'max':a.get('max')}for a in d.get('accessors',[])if a.get('type')=='VEC3' and 'min'in a],
  'classification':'unrigged combined 3D mesh; anatomical partition/pivots not verified'if p.stem=='67' else 'inventory/prop geometry, not the living creature'}
models=sorted([*(pack/'models').glob('*.glb'),*(A/'live-item-models').glob('*.glb')])
textures=sorted([*(pack/'textures').glob('*.png'),*(A/'live-textures').glob('*.png')])
entries=[]
for name in names:
 key=normal(name)
 candidates=[p for p in models if normal(p.stem)==key or normal(p.stem).startswith('caughtmob'+key)]
 tex=[str(p.relative_to(ROOT)) for p in textures if key in normal(p.stem) and ('atlas'in p.stem.lower() or normal(p.stem)==key)]
 mappings=sorted(k for k in registry if key in normal(k))
 entries.append({'name':name,'usable':False,'geometry':[inspect(p) for p in candidates], 'textureCandidates':tex,'gameMappingCandidates':mappings,'reason':'No verified anatomy/rig for the living mob. Inventory icons and texture atlases are not usable mob rigs.'})
report={'audited':'2026-11-21','sources':{'packRevision':manifest['revision'],'officialPackTreeRechecked':'2e793bc63ebffe2333039516c9d9be55f504c20c','codeApiRevision':'fe6e92a78c19ca3ffaecd9b72d37dcfc7aec92ad','codeApiFile':'MOB_SETTINGS.md','codeApiSnapshotSHA256':hashlib.sha256((A/'catalog-sources/mob-settings-audit.md').read_bytes()).hexdigest(),'hubMapping':'assets/catalog-sources/hub-block-registry.json','gameMapping':'assets/catalog-sources/game-asset-registry.json'},'usableCount':0,'limitations':['Live BloxdHub/game hosts are not reachable in this coding environment (outbound allowlist). Local recorded mappings and packaged geometry were inspected.','No original living-creature skeleton or anatomical part meshes verified. No fake rig or replacement art added.','67.glb is genuinely three-dimensional, but its one combined mesh has no skeleton, part hierarchy or animations. It is not promoted to Mobs.'],'mobs':entries}
(A/'mob-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'Audited {len(entries)} official mob types: {sum(len(e["geometry"])for e in entries)} candidate model records, 0 promoted to usable mobs.')

if any(g.get('gitBlobVerified') is False for e in entries for g in e['geometry']):
 raise SystemExit('Asset audit failed: an original model differs from its recorded Git blob.')
