# Bloxd Animation Studio — v4.4 Feature Expansion Report

Branch `arena/c9edff0d-bloxdanimationstudio` (base: `main` @ `b636d5d`). Editor version `4.4.0`, project format version `4`.
Every claim below was verified by executing the real app (headless Chromium against `python3 -m http.server 8000`) — nothing is claimed without a passing check.

## 1. Mobs integrated
All **59 official mob types** are listed in the new **Mobs library tab** with their verified integration status, honest badges ("Not riggable"), and a detail dialog per mob (variations, status, audited reason). The audit is reproducible: `tools/audit-mobs.py` → `assets/mob-audit.json` → `node tools/gen-mob-audit-data.mjs` → `lib/mob-audit-data.js` (the generator reproduces the committed module byte-for-byte). Variation lists come from the official mob-settings snapshot (`assets/catalog-sources/mob-settings-audit.md`); texture candidates point at the real default-pack files.

**Result: 59 types audited, 0 usable.** Every creature-named GLB in the pack is a single-node `generated(Clone)` flat icon extrusion (±4×±4×±0.5 — caught-mob inventory art); `67.glb` is an unrigged 456-vertex smooth statue; live-item models are block/prop geometry. No inventory icon or texture atlas was promoted to a "mob", and no substitute or placeholder mob was invented.

## 2. Rigs ready
The honest verdict is that no authentic per-anatomy mob rig can be built from the available public sources (no skins/skeletons exist for the living creatures), so **no mob rig shipped**. Instead the ground is prepared where it is real: `rigAdapter` groundwork, per-joint rig infrastructure (`lib/rig.js`, 10-joint Bob rig unchanged), and the Mobs UI, audit data model and detail dialog that any future verified rig plugs into. Anatomical rigs (wings, tails, quads) will be added only when a legitimate public source publishes animatable original geometry — the audit records exactly what is missing per mob.

## 3. Bob options verified
Adding Bob now opens the **Customization dialog** (dock: Bob tab → character card). Options are limited to verified, locally available data: the official built-in skin tints (Classic/Ember/Frost/Moss — the exact values the Code Editor path always used), the studio's own armor sets (leather/iron/gold/diamond/netherite per slot), and a user-supplied 64×64 skin PNG (≤4 MB, default preserved when absent). Default Bob is unchanged — a default add stores no appearance at all. Appearance is per-instance, editable later via the inspector ("Customize…" + tint select), summarized live in the dialog, persisted in `options.appearance`, normalized on load, and verified to survive save/load with multiple Bobs keeping distinct looks.

## 4. Light-emitting objects
Real THREE lights (not flat brightness) attach to what actually glows: lamps (`#ffbd64`, intensity 12, range 7), fire particles (intensity 3.2, flicker 0.45), sparkles (intensity 1.5, flicker 0.7), plus the new placeable point/spot lights. The lamp's old embedded PointLight was removed — each emitter carries exactly **one managed rig** (`lib/lights.js`: `MAX_DYNAMIC_LIGHTS 40`, particle lights capped at 12; over-cap emitters save a disabled config and stay unlit with an explanatory inspector note). Lights work in edit view, playback, scrubbing, hidden during video export (`setLightVisualsHidden`), and survive save/load (verified: 4 light configs reload and relight).

## 5. Light settings
Per-object controls in the Object inspector: enabled, color, intensity, range, flicker, and for spots cone angle + softness. All edits reach the real `THREE.PointLight`/`SpotLight` and the saved config in one gesture-undoable step; flicker is a pure function of timeline time (frame-exact scrubbing/exports, verified envelope 10–20 of a 20-intensity spot). The new **Lighting library tab** offers Point light, Spot light, and "already luminous" pointers for lantern/fire/sparkles. Invalid saved values normalize to asset presets; a malformed color can no longer poison a project file (guarded at apply time and rejected by `migrateProject`).

## 6. Grouping mechanics
Shift/Ctrl-click toggles whole objects, Shift-drag on empty space rubber-band selects, Select all gathers eligible objects — with visual multi-helpers and a group pivot. Groups are metadata (`id/name/members/expanded`): members keep identities, transforms, materials, lights, rigs and animation. Group move/rotate/scale runs through the existing multi-proxy pivot math (`p′ = pivot + R·(s·(p−pivot))`, one undoable step, auto-key aware). The outliner shows expandable group rows (chevron, click-select, double-click rename); Group/Ungroup/Rename/Select members live in the inspector. Save/load preserves the hierarchy — object **ids are now serialized and restored** so group membership survives reload (verified). No nested groups were added (not yet safe with the pivot model; documented as a limitation).

## 7. Material controls
Per-object inspector section: opacity (transparent sorting), glow (real `emissive` + intensity, separate from illuminating lights), smoothness (mapped to PBR roughness), shininess, texture (catalog name or `asset:<imageId>`, original stays the default, unknown textures toast and keep the previous one), wireframe. **Shininess is real specular**: the vendored three build only compiles `specularIntensity` for `MeshPhysicalMaterial`, so setting shininess converts the mesh's materials to physical copies — reversible, with the original instance/values restored on reset. Studio assets that share material instances (tool + stand) are de-shared on first edit via owned clones, so edits never leak between objects. All of it survives save/load, scrubbing, reset (undoable), and global-override interaction.

## 8. Global overrides
New **Settings dock button + modular panel**. Global texture / smoothness / shininess are a non-destructive layer above per-object settings: disabling or "Reset all" restores every original (verified including the physical-material swap-back). Characters and particle/image shaders are excluded automatically (the panel reports the eligible/excluded counts). Changes are one undoable step, persist in the project, and re-apply after reload.

## 9. Mesh editor
The **Custom Mesh Workshop** (dock button or "＋ New custom mesh") is a genuinely isolated dialog workspace: own camera, grid, removable reference floor, 80-step undo/redo, W/E/R gizmo modes with Shift 15° snapping, per-part transforms and materials, 1–64 parts. Finish validates, saves the mesh as a reusable asset (IndexedDB) and joins the parts into **one** selectable/animatable scene object. "Edit mesh" on a placed mesh round-trips the parts back into the workshop with the Update-asset / Save-as-new choice.

## 10. Mesh persistence
Mesh assets live in browser storage only (`IndexedDB 'bloxd-studio-mesh-assets'`, 200 assets × 2 MB parts, storage-usage readout, storage-limit warnings). The **Meshes library tab** lists saved assets across projects; verified: add to scene, re-edit, duplicate-free updates, full persistence across a page reload.

## 11. Sky
Settings → Sky: enable custom color, picker, reset. The color drives the real scene background (and fog/water through the existing `updateLight` path), previews immediately, is undoable, resets to the original sky, and persists in the project (verified round-trip `#2233ff`).

## 12. Files changed
Modified: `app.js` (v4.4 wiring: light rigs, groups, materials, settings, Bob dialog/appearance, mob/mesh/light library routing, id-preserving persistence, dialogs), `index.html` (dock buttons, library tabs, inspector sections, 4 dialogs, icons), `style.css` (v4.4 block), `lib/assets.js` (lamp embedded light removed), `lib/project-format.js` (v4 additive validation/migration), `package.json` + lock (4.4.0, `test:v5`), and 5 regression suites updated for the intentional version bump and the Bob-customization flow. Added: `lib/lights.js`, `lib/scene-materials.js`, `lib/character-look.js`, `lib/mesh-editor.js`, `lib/mesh-assets.js`, `lib/mob-audit-data.js`, `tools/gen-mob-audit-data.mjs`, `tests/features-v5-unit.mjs`, `tests/features-v5-browser.mjs`.

## 13. Test results (executed this session, headless Chromium + node)
- `features-v5-unit` **43/43** · `features-v5-browser` **55/55**, zero page errors
- `studio` **59/59** · `refinements` **60/60** · `catalog` **37/37** · `keyframe-fix` **43/43**
- `code-studio` 24/24 + unit ✓ · `workspace-upgrade` ✓ · `timeline-density` **90/90** · `v41` **90/90**
- `video-motion` 19/20 and `studio-upgrade` 45/46 — the single failing check in each is `ffprobe` not installed in this sandbox (environment gap; the videos themselves download and are verified by container/size checks)
- `workflow` ✓ · `final-integration` ✓ · `multi-object` ✓ · `script-reference` ✓ · `project-format` ✓ · `tools/script/reference --check` ✓ · `npm run test:code` ✓
- `tests/gemini.mjs` fails at HEAD (not run by `npm test`): it drives an `#ai-dialog` that no longer exists in the app — stale suite predating this branch, documented here rather than papered over.

## 14. Limitations
- **Mob rigs: none.** Zero authentic animatable mob geometry exists in any legitimate public source found; inventory icons/atlas textures are not models. The bloxd.cc live host itself is unreachable from this environment (single probe: connection blocked), so live-host-only assets remain unverified — the audit says so instead of guessing. The cached copies of live-host models already in the repo were analyzed and classified (block/prop geometry).
- Bob customization is intentionally limited to verified data (4 tints, 5 armor sets, custom PNG skin); no official cosmetic catalogue was invented.
- Dynamic lights don't cast shadows (the sun does) and are capped (40 total / 12 emitters) for responsiveness; emissive surfaces glow but there is no post-processing bloom in the vendored renderer.
- Nesting groups is not supported yet; groups transform through the existing pivot system, which is verified for flat groups only.
- The exported WebM was validated by container signature/size and decode path, not by ffprobe frame counts (ffprobe unavailable in this sandbox).
- Custom mesh editor materials share the same real-specular behavior as the main scene; the workshop cannot round-trip meshes built outside its primitive kinds (guarded with a clear message).
