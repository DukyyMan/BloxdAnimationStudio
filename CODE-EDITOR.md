# Local Code Editor API

Open `</>` in the dock. Scripts are **interpreted locally** in a bounded JavaScript subset, not executed by the browser. There is no DOM, network, import, `eval`, timers or arbitrary host access. Use `async function main(api) { ... }`. The interpreter supports variables, functions, conditions, bounded loops, arrays, objects and a limited `Math` (sin, cos, tan, abs, round, floor, ceil, sqrt, min, max, pow, PI, E). Limits include 64,000 source characters, 125,000 interpreter steps, a 1,450 ms execution budget, call depth 30, and at most 160 emitted commands. Each plan permits 80 new objects, 12,000 terrain writes, 50,000 final cells and 6,000 generated keys. Grouped camera, sun and object commands accept 1–120 keys each. Objects and keys become normal editable studio data. The source is not included in project files: save it separately.

Validate builds a dry-run snapshot. Run applies that exact snapshot as one undoable change; it refuses to apply if the scene changed since validation. The Error Inspector lists detected syntax, validation and apply-time errors separately from warnings. Click a located diagnostic to jump there, or copy a report with context and optionally your script. A parse failure stops at the first syntax error. Validation can recover at main-statement and command boundaries; fix earlier failures first, since later commands may depend on them. Limits and scene-wide errors may stop analysis or have no single source line. A script fails atomically: no partial scene is applied. For JSON plans, the local command-plan panel can explicitly skip a failed command or validate a successful prefix; each remaining command is revalidated from the original snapshot, so missing dependencies fail instead of being silently ignored. Review and apply separately; nothing is automatically retried or applied.

## Coordinates and IDs

Arrays support indexing, `length`, `push`, `pop`, `slice`, `map` and `forEach`; strings support indexing and `length`, not arbitrary JS methods.

Vectors are `{x, y, z}` (omitted axes default to 0, or 1 for scale). Y is up; rotations are degrees. Times are seconds. Characters use the built-in editable Bob rig. IDs are required, unique simple identifiers (letter followed by letters, digits, `_` or `-`, at most 48 characters). Do not use `camera`, `all`, prototype names or reserved `object-N` IDs for new objects. Object coordinates are −50…50, scale .05…10, rotation −7200…7200 degrees (joint rotation −720…720). Existing generated IDs survive project save/load. `scene.get("hero:rightArm")` returns a joint handle. Parts: `head`, `body`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg`, `leftElbow`, `rightElbow`, `leftKnee`, `rightKnee`.

## Project and scene

- `project.setMode("animation" | "thumbnail")`: label only, not a separate rendering mode.
- `project.setGeneratedMode("update" | "replace")` (alias `project.setUpdateMode`): set **before** other calls. Default update reuses generated IDs, retains their transforms and skips occupied object, camera and sun keys and overlapping motion presets. Replace can replace whole generated tracks, camera keys and remove generated objects omitted from the script. It can remove manual keys on those tracks. Terrain and lighting calls change shared scene data in either mode. Review warnings; Undo restores the previous scene.
- `scene.addCharacter({id, name?, position?, rotation?, scale?, skin?, grounded?, visibility?, material?})` returns a handle. Built-in skin tints: `default`, `ember`, `frost`, `moss`.
- `scene.addAsset(blockIdOrItemName, {id, name?, position?, rotation?, scale?, grounded?, visibility?, material?})` creates a block or tool. Use an available catalog ID/name. `assets.search(query, {limit?})` returns entries; search includes models and textures but `addAsset` only supports blocks/items. Filter by `{category:"block"}`, `item`, `model` or `texture`; limit defaults to 20 (max 100). Results have `{id,name,category}`. Pass a block/item entry directly to addAsset, or its id.
- `scene.addMesh(group, {id, name?, position?, rotation?, scale?, grounded?, visibility?, material?})` creates editable custom mesh data.
- `scene.get(idOrPartId)`, `scene.remove(handle)`, `scene.setTransform(handle, {position?, rotation?, scale?, visibility?, opacity?})`, `scene.setMaterial(handle, {color?, roughness?, metalness?, opacity?, emissive?, emissiveIntensity?, texture?, flatShading?, transparent?, wireframe?})`.
- `scene.attach(child, parentHandleOrId, {position?, rotation?, scale?})`, `scene.detach(child)`. Joint handles accept rotation in `setTransform`.

## Meshes

`mesh.group(name)` returns a builder with `.box(options)`, `.sphere(options)`, `.cylinder(options)`, `.cone(options)`, `.plane(options)`, `.voxel(options)`, `.faces(options)`, `.edit(index, options)`, `.clone(name)` and `.combine(other)`. Part properties are `name`, `size`, `radius`, `height`, `position`, `rotation`, `scale`, `color`, `roughness`, `metalness`, `opacity`, `emissive`, `vertices`, `faces`. The command validator enforces geometry and material limits. `clone` creates a new empty builder; use `combine` to copy parts. Meshes allow 1–64 parts. Box/voxel size is three axes; plane size two axes; sphere uses radius, cone/cylinder radius and height. Faces take vertex triples and faces of 3–8 zero-based indices. See **Simple sword** in the library.

## Terrain

- `terrain.generate({width?, depth?, center?, biome?, seed?, amplitude?, frequency?, island?, decorate?, surfaceBlock?})`: biome `plains`, `desert`, `forest`, `snow`, `mountain`, `canyon`, `islands`. Center is a two-number array. Width/depth are 4–48. In update mode generation only fills empty cells; in replace mode it regenerates the bounded generation region, including manual blocks there. Neither mode wipes unrelated terrain.
- `terrain.setBlock({x,y,z,blockName})`, `terrain.removeBlock({x,y,z})`, `terrain.clear()`. Coordinates are integer grid cells. Use exact catalog IDs or available aliases. `setBlock` deliberately overwrites the targeted cell in either mode. `clear()` deliberately clears all cells in either mode; do not call it unless requested. Terrain cells are not scene objects.
- `terrain.fill({from:{x,y,z}, to:{x,y,z}, blockName, hollow?})` writes an inclusive axis-aligned box in one command. Corners must be ordered and integer coordinates within −50…50. Equal axes make rows, floors or walls. Hollow writes only the shell (it does not clear an existing interior). `blockName:"air"` carves cells. Use exact block IDs from `assets.search`, not guessed display names.

## Timeline

- `timeline.setDuration(seconds)` (2–60), `timeline.setFPS(fps)` (integer 1–120), `timeline.setPlayhead(time)`, `timeline.setInterpolation(ease)`. Seek accepts finite numbers and clamps to [0, duration]; missing/non-numeric values are errors.
- `timeline.key(handle, {time, position?, rotation?, scale?}, {ease?})`.
- `timeline.keyPose(handle, {time, parts: {rightArm: {rotation: {x:-90}}}}, {ease?})`.
- `timeline.keyCamera({time, position?, target?, fov?}, {ease?})`; missing values use the current camera view. `rotation` may be used instead of `target` to set the viewing direction.
- `timeline.keySun({time, azimuth?, elevation?, intensity?, color?})`. Sun keys use the lighting track; an `ease` option is accepted for compatibility but has no effect and produces a warning.
- `timeline.preset(character, name, {time?, duration?, from?, to?, grounded?})`: defaults time 0 and duration 2 seconds. Native command motions: `Idle`, `Walk`, `Run`, `Jump`, `Wave`, `Mine`, `Sit`. Legacy compatibility names `Fall`, `Punch`, `Kick`, `Dance`, `Swim`, `Death`, `Cheer`, `Clap` currently map to approximations and emit warnings. For dedicated motion use the inspector's animation library instead. Presets bake keys, and in update mode an occupied range is skipped rather than overwritten.
- Key/default easing names: `linear`, `smooth`, `in`, `out`, `inout`, `step`, `bezier`, `spline`. The timeline's manual key UI also offers `hold`; it is distinct from the scripting API's accepted names.

## Camera and lighting

`camera.set({position?, target?, rotation?, fov?})`, `camera.lookAt(vector)`, `camera.zoom(fov)`, `camera.orbit({target?, azimuth?, elevation?, radius?, fov?})`, `camera.frame(handle, {distance?, fov?})`. FOV is 25–90 degrees. Camera position is within ±80, target within ±50, with at least half a block separation. These create keys at 0; update mode preserves an existing camera key at that time. `frame` uses the snapshot, so newly created objects use a default target until applied.

`lights.setEnvironment({preset?, exposure?, ambient?, sky?, fog?, fogColor?})`: presets `daylight`, `golden hour`, `night`, `studio`, `sunrise`, `sunset`, `moonlight`, `cinematic`. `lights.setSun({azimuth?, elevation?, intensity?, color?, softness?})`. Color is `#RRGGBB`. Sun azimuth is −180…180, elevation 5…90 (0…90 on sun keys), intensity 0…6, ambient 0…3 and exposure .2…3. The accepted environment fields `horizon` and `grade` are not applied.

## Complete example

```js
async function main(api) {
  api.project.setGeneratedMode("update");
  api.timeline.setDuration(8);
  const hero = await api.scene.addCharacter({id: "hero", position: {x: 0, y: 1, z: 0}});
  api.timeline.keyPose(hero, {time: 1, parts: {rightArm: {rotation: {x: -90}}}});
  api.timeline.keyPose(hero, {time: 3, parts: {rightArm: {rotation: {x: 0}}}}, {ease: "smooth"});
  api.camera.orbit({target: {x: 0, y: 1, z: 0}, azimuth: 40, elevation: 20, radius: 12});
  api.lights.setEnvironment({preset: "golden hour"});
  api.timeline.setPlayhead(1);
}
```

## Animation library and limitations

Select a character in the inspector. Click a preset to bake keys at the playhead, use Chain to queue presets, or drag one onto the pose lane. Drag/drop refuses occupied ranges and animations extending beyond the project duration. Saved custom animations use a time range of existing pose keys (not a key selection), are stored in this browser's local storage and can be added to another character. They are not embedded in the project. There is no script API to save, load, blend or schedule custom clips. Move or delete the resulting individual keys using the normal timeline; these are not independent resizable/movable clip objects, and there is no automatic blending. Click-baking/Chain uses the existing behavior and can replace keys in its range. The library contains idle, walk, run, wave, jump, mine, dance, spin, punch, kick, backflip, sneak, death, cheer, clap and swim.

Run `npm run test:code` for compiler tests and `npm run build` to rebuild the standalone editor. The interpreter derives from DukyyMan/BloxdAnimationMaker (MIT); its license and Acorn's license are in `tools/script/`.

## Generate Code From Scene

The **Generate code from scene** button in the Code Editor toolbar is the reverse of the AI Prompt Builder: it inspects the actual scene data and deterministically emits a script that rebuilds it through this same scripting API. It is fully local — no AI, no network request, no API key — and the same unchanged scene always produces byte-identical code (no timestamps in the output).

- Generated sections: timeline settings, terrain as merged `terrain.fill` runs, characters (with pose keys), block/item assets (with exact ids and transforms), custom meshes, object/camera/sun keys, environment and sun settings.
- Existing generated IDs (`options.scriptId`) are reused; other object ids are derived from their names.
- The generated code replaces the editor contents only after a confirmation, is fully editable, and is applied through the normal Validate → Run flow (one undoable change).
- Scene features the scripting API cannot express — decorative trees/rocks/lamps, imported and voxel models, attachments, armor, held items, detached parts, per-part move/scale channels, body lift, Hold easing, quaternion camera roll, custom skybox/textures, image objects and imported audio — are **not** faked: they are listed in the Error Inspector as "Not scriptable" and summarized in the execution output after generation.

## Authoring workflow

Open **AI Prompt Builder** in the studio header or Code Editor. Pick a creation type and describe the result. The customized copy includes this reference and the same runnable examples as the editor library. Manual previews stay separate per type during the session; Regenerate adopts the current settings. No account or network request is involved. The Tour button in the dock offers studio, editor and prompt-builder walkthroughs.

For maintainers: edit this Markdown as the source of truth, update `lib/code-examples.js` and its compiler tests, then run `npm run build`. This refreshes `lib/script-reference.js` for both the modular and standalone app. `npm run test:code` checks the generated reference and compiles every library script. Run `npm run test:workflow` with the local server on port 8000 for end-to-end checks.
