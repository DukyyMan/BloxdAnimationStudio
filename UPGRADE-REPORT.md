# Animation Studio 4.2 — implementation report

Branch: `arena/6b34b6de-bloxdanimationstudio`  
Repository verified: `https://github.com/DukyyMan/BloxdAnimationStudio.git`  
Date: 21 November 2026

**Status: feature groups 2–6 implemented. Authentic mob integration remains blocked; group 1 is not complete.** No merge, deployment, branch switch or replacement art was performed. Code Editor, AI Prompt Builder and the existing feature systems remain in place. No Motion Capture feature was added.

## 1. Authentic mobs — audit completed, integration blocked

Inspected the existing asset documentation, manifests, CSV/catalog, normalized BloxdHub/game mappings, original model files, compressed local asset loader/builder, character rig adapter, importer and animation paths. Rechecked the official texture-pack tree and current Code API mob documentation through GitHub.

The reproducible audit covers **59 official mob types** and **64 local candidate model records**. `assets/mob-audit.json` records filenames, source URLs/revisions, original Git blob verification, SHA-256, node/mesh/skin/animation/image counts, geometry bounds and texture/mapping candidates. Rebuild it with `npm run test:mobs`.

**Genuinely integrated usable mobs: none.** Inventory graphics and texture atlases were not passed off as living creatures. In particular, `67.glb` really is 3D geometry, correcting the older report, but its single combined mesh has no original skeleton, anatomical hierarchy or clips. A correct anatomical separation/pivot layout was not established, so no invented rig was attached.

Exact existing 67 source:
https://github.com/Bloxdy/texture-packs/blob/e7c5a7e17f895c7df6bfe788667ccb7cbdee00c9/default/models/67.glb

Local file: `assets/default-pack/models/67.glb`  
Original Git blob: `5112f81b91fb6be522b0b22292871ca27eaa59fc`  
SHA-256: `03fb84cbfe917f328e0a4e8e3e93aa51cb856bbce7ef1e4796a961771fec2edb`

Some caught-mob models are extruded pixel icons, not literally a single quad; nonzero thickness does not make them the creature model. The full source findings and restrictions are in `MOBS.md`. Live Bloxd/BloxdHub hosts are outside this sandbox's outbound allowlist; only their already-packaged references could be inspected. This is not a claim that authentic creature models do not exist elsewhere.

**Not tested/claimed:** usable mob spawning, anatomical mob editing, mob round-trip or the requested Bob-plus-authentic-mob combined test. These require original, verifiable creature assets and a correct rig first.

## 2. Save and continue

Downloadable project saving **already existed**, using format versions 1/2. It already serialized actor pose/transform tracks, camera keys, easing fields, terrain, scene objects, custom visuals, detached Bob joints and audio. That system was extended rather than replaced.

- Version 3 retains older project support and preserves animation payloads rather than filtering away old key fields.
- Adds editor camera view/mode, guides, timeline zoom/scroll/Follow, actor/part selection, Auto-key/Onion preferences, preset speed/manual state, current camera quaternion, and imported clip playback/time state.
- Keeps all keys and exact timestamps, including keys outside a temporarily shortened duration.
- Preserves distortion-key easing instead of dropping it on load.
- Saves embedded textures, original asset references, detached-part data and unapplied drafts; explicit Save still commits pending edits at their chosen times as before.
- Adds a visible header unsaved indicator, before-unload warning and a cancellable discard warning on opening a different file.
- Adds Save as / download copy. This remains a portable file workflow, not a backend project database.
- Adds format/pose/camera/timeline validation, useful load/save errors and rollback after asynchronous object creation fails.
- Adds a 15-second change-based IndexedDB recovery snapshot. Transactions are atomic, invalid snapshots are rejected before writing, and writes are skipped during loading/importing/rendering/playback/gizmo drags. Recovery never clears the unsaved indicator. Browser quota/storage failures advise downloading JSON instead.

Recovery is browser-local and may be unavailable in restricted/opaque contexts or cleared by the browser. A downloaded JSON is the portable backup. Undo history is not persisted across project loads.

## 3. Reliable camera movement

Reused the existing fly math, shortcut manager and pointer handling. Movement follows camera yaw/pitch, combines inputs with normalized speed, and retains smooth acceleration with **immediate stopping** when movement keys are released.

- WASD; Space/E up; Q/C down; Shift faster.
- Drag to look, clamped pitch, existing speed/sensitivity/invert settings.
- Fly toggle, active styling, control hints and Escape exit retained.
- Viewport activation/focus, key release, focus/visibility loss and input/dialog guards prevent stuck movement or typing conflicts.
- Modifier chords are not swallowed as movement, including when modifier keys themselves have custom bindings.
- A fly drag no longer falls through into object selection or build actions; fly entry leaves conflicting paint/fill modes.

The browser tests send real keyboard and mouse events for movement and mouse look. Blur cleanup is also exercised programmatically. This is not a manual user-acceptance test on every browser/OS.

## 4. Two independent camera modes

The existing `camera` remains the animation/export camera. `CameraWorkspace` owns a separate editor camera and navigation controls; scene navigation never copies its pose back into the animation camera.

- **First-person camera:** viewport renders the animation camera; fly navigation edits that view.
- **Camera object / Scene view:** viewport renders the independently navigable editor camera. The animation camera has a cyan camera body/lens, forward arrow and translucent frustum.
- Click the camera body or **Edit camera** to use existing move/rotate handles on the animation camera, then **Key camera** to record it.
- Guide visibility is in the Camera inspector. Frustum depth is intentionally bounded for clarity; its orientation, FOV and aspect follow the actual animation camera.
- Switching modes does not rewrite camera keys. Both cameras use the real viewport aspect ratio.
- Still/video clean rendering continues to use the animation camera and hides editor helpers.
- Toolbar groups wrap within open drawers; labels follow their actual height. The taller timeline's controls/scrollbar fit without covering its pose lane. Tour cards are clamped onscreen around the changed layout.

Camera-object transform event routing and key creation are integration-tested. Actual pointer dragging of the camera gizmo itself has not received a separate manual acceptance pass; existing character gizmo dragging is covered by the regression suites.

## 5. Camera scrubbing and interpolation

Removed free-view suppression from timeline evaluation: character/object poses and the animation camera are sampled from the same requested time, regardless of which inspector tab is open. Scene view stays independent while the animation camera body/frustum update. First-person view shows that same animated camera.

Position retains the existing linear or arc-length-parameterized spline travel and per-key easing. Orientation uses quaternion interpolation (including saved quaternion keys, with legacy position/target keys adapted); FOV interpolates with the same eased segment fraction. Hold changes exactly at the next key timestamp. Track interval lookup now uses binary search.

Idle OrbitControls updates no longer erase a sampled camera's rotation/roll or introduce view drift after scrubbing/export; explicit navigation still works. Export captures/restores the current camera quaternion as well as position/target/FOV.

## 6. Long, scrollable timeline

The existing key lanes now live inside a real horizontal scroll viewport. Existing time-to-position math uses the full content rectangle, so scrolling/zooming does not retime keys.

- − / +, continuous zoom slider, Fit and Ctrl/Cmd+wheel zoom.
- Wheel/trackpad and scrollbar horizontal navigation; visible time-range readout.
- Zoom anchors the visible playhead or viewport centre.
- Configurable Follow scrolls during playback without changing timestamps.
- Duration supports 2–7,200 seconds, while the eight-second default stays unchanged.
- Existing selection, multi-selection, range selection, drag/group retiming, copy/paste, duplicate and Undo/Redo paths are reused.
- Ruler labels are limited to the visible range. Dense tracks omit offscreen DOM markers; sampling does not rebuild scene objects.

## Tests and build

Reports/videos/screenshots are generated under ignored `tests/results/`, not committed as bulk artifacts. The initially failing regression runs were corrected and the affected suites rerun individually/in batches; these results are not a claim that the first `npm test` invocation passed.

Verified results:
- Build produces the self-contained offline editor (~7.89 MB).
- New project-format/interpolation unit suite passes, including legacy preservation, malformed-data rejection, exact Hold boundaries and 100,000-key interval lookup.
- New combined browser integration suite: **46/46 passed** (real navigation/mouse input; camera modes/scrubbing; zoomed copy/paste/group drag/Undo; save/download/page reload/continue; corrupt-load rollback; atomic recovery protection; real 48-frame scene-mode export and decoded video verification).
- Dense browser timeline: **10,000 keys / 30 minutes**, 96 visible pose markers, 100 seeks in approximately **56–127 ms** across the measured runs, with all scene root identities unchanged. This is a focused local measurement, not a universal performance guarantee.
- Existing Code Editor/reference/unit tests pass; v4.1 unit suite **77/77** passes.
- Eleven existing smoke suites pass: animation clips, armor, Bloxd schematics, cinematic build, FX, prefabs, render distance, terrain brush, terrain generation, video assembly and VoxelForge codec.
- Existing core studio browser suite **58/58**, refinements **60/60**, keyframe workflows **43/43**, video/motion/export **36/36**, and previous-feature browser suite **90/90** pass.
- Asset catalog regression **37/37**, Code Editor browser **24/24**, offline/restricted-preview suite **18/18**, workspace upgrade browser, and full prompt/editor/tour/offline-workflow tests pass.
- Additional real-input regression checks confirm hovered transform handles cannot steal fly-mode movement; a paused imported animation clip restores its exact mixer time and frame. Camera-object rotation Undo/Redo preserves roll.
- WebM/Opus and H.264 MP4 outputs were decoded with FFmpeg/ffprobe. Export success/cancel restoration, retained downloads and real-time fallback were checked.

Earlier regression runs exposed outdated format-version assertions, historical world-click coordinates covered by the relocated dock, and test assumptions that seeking should leave the first-person camera unchanged. The affected tests now explicitly handle the new version/warning/camera behavior and use unobstructed real input points. They were not disabled. A real export-state regression (idle controls overwriting sampled orientation) was fixed in the application.

## Changed files

Application/build:
- `app.js`, `index.html`, `style.css`, `START-HERE.html`
- `lib/camera-workspace.js`, `lib/project-format.js`
- `lib/tracks.js`, `lib/key-edit.js`, `lib/rig.js`, `lib/studio-tour.js`
- `package.json`, `package-lock.json`

Asset audit/docs:
- `tools/audit-mobs.py`
- `assets/mob-audit.json`, `assets/catalog-sources/mob-settings-audit.md`
- `MOBS.md`, `ASSET-LIBRARY.md`, `README.md`, `UPGRADE-REPORT.md`

Tests:
- `tests/project-format.mjs`, `tests/studio-upgrade-browser.mjs`, `tests/timeline-density-browser.mjs`
- `tests/studio.mjs`, `tests/refinements.mjs`, `tests/keyframe-fix.mjs`
- `tests/v41-features-browser.mjs`, `tests/video-motion.mjs`, `tests/offline-v2.mjs`

## Remaining limitations

1. Authentic mob integration and the required mob-inclusive combined scenario are **not complete**.
2. Browser recovery is one local recovery snapshot, not cloud storage or a multi-project service; use downloaded JSON copies for backups.
3. Editor undo history and temporary imported video-assembly files are not persisted in animation project JSON (the existing assembly interface already labels these as tab-local).
4. Video encoding remains dependent on browser encoder support; existing real-time fallback and unsupported-format errors are retained.
5. Tests ran in headless Chromium with software WebGL; no claim of Safari/Firefox/mobile manual acceptance or production deployment is made.
