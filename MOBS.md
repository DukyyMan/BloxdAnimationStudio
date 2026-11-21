# Bloxd mobs: status

There is **no Mobs category** in this version. I could not find authentic, verifiable Bloxd mob 3D models (geometry plus rig) from any source I was able to inspect. Placeholder, generic Minecraft-style or rebuilt "lookalike" mobs would break the project rule against fake assets, so none were added.

## What was checked (2026-11)

| Source | What it has | Usable as a 3D mob? |
|---|---|---|
| `Bloxdy/texture-packs` (official GitHub, rev e7c5a7e) | Mob texture atlases (`*_Atlas.png`) and `caught_*` item textures. The `_json` packs hold only `metaData` / `textureOverrides`. | No. Textures only, with no geometry, UV layout or skeleton. |
| `Bloxdy/code-api` `MESH_ENTITY_DOCS.md` | Mesh entity types: Box, BloxdBlock, Person, Leaderboard, ParticleEmitter. | No. There is no mob mesh type and no geometry export. |
| `Bloxdy/code-api` `MOB_SETTINGS.md` | Official mob list, settings and variations. | No. Names and settings only. |
| Local `assets/default-pack/textures/*_Atlas.png` | The same atlases. | No. They cannot be mapped without the official model layout. |
| Local `live-item-models/Caught Mob*` GLB | Flat inventory icons (single quads). | No. These are icons, not models. |

## Official mob names (from `MOB_SETTINGS.md`). All are unverifiable as 3D models, so none are included

- **Farm animals:** Pig, Cow, Sheep, Horse, Camel, Slime
- **Golems:** Cave Golem, Frost Golem, Magma Golem, Spirit Golem
- **Draugr:** Draugr Zombie, Draugr Skeleton, Draugr Knight, Draugr Huntress
- **Frost undead:** Frost Zombie, Frost Skeleton
- **Wild animals:** Wolf, Bear, Deer, Stag, Gold Watermelon Stag, Gorilla, Wildcat
- **Spirit animals:** Spirit Wolf, Spirit Bear, Spirit Stag
- **Other:** 67

## Ready for real models

The part panel and part selection read a **rig adapter** (`lib/rig.js`) rather than hard-coding Bob. If an authentic mob model becomes available under a licence that allows redistribution, you can add it this way:

1. Build its joint groups.
2. Register an adapter whose part ids match those joints.
3. Reuse the existing pose keys, move/scale/detach, save/load and export paths.
