# Authentic Bloxd mob audit — 21 November 2026

**No usable mobs were added. Feature 1 is not complete.** No placeholder, inventory icon, billboard or guessed skeleton has been promoted to an animatable creature.

## Reproducible results

Run `python3 tools/audit-mobs.py`. The generated `assets/mob-audit.json` records **59 official mob types**, their local texture candidates, **64 candidate model records**, exact source URLs, local filenames, SHA-256 hashes, original Git blobs where available, node names, mesh/skin/animation counts and position-accessor bounds. The official name/variation snapshot is `assets/catalog-sources/mob-settings-audit.md`.

The audit inspects the existing manifests/catalog inputs and original GLB JSON chunks, not just asset filenames. The existing build pipeline flattens static source geometry into a compressed local bank (`tools/build-asset-library.py` → `lib/asset-data.js` → `lib/assets.js`). That static bank is not a source skeleton. Original GLBs remain packaged, and were inspected directly.

### Important correction to the previous report

`assets/default-pack/models/67.glb` **is genuinely three-dimensional**, not an icon. It has one mesh node named `cube`, 456 position vertices, bounds approximately `[-1.6875, 0, -0.28125]`–`[1.6901, 2.9504, 1.375]`, UVs and one embedded PNG. However, it has **no skin, skeleton, anatomical part hierarchy or animation clips**. A correct anatomical partition and joint pivots have not been verified. It remains available as its original **static source model**, not a claimed fully animatable mob.

Exact source: https://github.com/Bloxdy/texture-packs/blob/e7c5a7e17f895c7df6bfe788667ccb7cbdee00c9/default/models/67.glb

Git blob: `5112f81b91fb6be522b0b22292871ca27eaa59fc`.

The `Caught Mob …` GLBs are inventory representations. Many contain **extruded pixel-icon geometry**, not literally one quad as the older notes said. Their nonzero thickness does **not** make them the corresponding living creature. These have no verified creature anatomy or rig.

## Sources actually checked

| Source | Finding |
|---|---|
| Packaged `assets/default-pack/` + manifests, pinned `e7c5a7e17f895c7df6bfe788667ccb7cbdee00c9` | Original GLBs, embedded images and separate atlas PNGs; candidate geometry details in the audit JSON. No usable original mob rig verified. |
| Official `Bloxdy/texture-packs` GitHub tree, rechecked at `2e793bc63ebffe2333039516c9d9be55f504c20c` | Public inventory models and textures; a filename is not evidence of a rig. Existing art was not replaced or upgraded wholesale. |
| Official `Bloxdy/code-api`, revision `fe6e92a78c19ca3ffaecd9b72d37dcfc7aec92ad`, `MOB_SETTINGS.md` | Current official names and variations; settings, not model geometry. |
| Current official `MESH_ENTITY_DOCS.md` | Mesh APIs document boxes, blocks, persons and other entities, not an original downloadable mob skeleton. |
| Packaged `assets/live-item-models/`, `assets/live-models/`, `assets/live-model-images/` and recorded game/BloxdHub mappings | Static graphics, textures and inventory references. `lifeformMeshToBodyPart` is empty in the packaged game mapping. No verified anatomical mob mesh mapping found. |

The coding environment permits outbound access to GitHub and package registries, **not the live Bloxd/BloxdHub hosts**. Consequently the local recorded public-client references were inspected, but their current servers could not be queried for unpublished/new creature models. This is not a claim that authentic models do not exist anywhere.

## Integration/testing limitation

No Mobs category with usable entries, mob rig, mob animation round-trip, or Bob-plus-mob combined export test can honestly be claimed. To finish this group, obtain original living-creature geometry, matching UVs/textures, anatomical hierarchy/skeleton (or a verifiably correct partition), and redistribution permission. The existing `lib/rig.js` adapter and animation/body-part tools should be extended with each actual anatomy; they must not be forced into Bob's ten joints.
