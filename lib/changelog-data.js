// ── Built-in changelog data ──────────────────────────────────────────────────
// MAINTAINER RULE (see README → "Changelog policy"): every feature update or
// bug-fix update shipped to this project MUST add an entry here in the same
// change. Add new entries at the TOP of CHANGELOG (reverse chronological).
//
// Entry shape:
// {
//   version:  '4.3.0',            // shown verbatim; use the package.json version
//   date:     '2026-11-21',       // ISO date the update was completed/merged
//   title:    'Short summary',
//   status:   'release'           // 'release'    = merged/published update
//                                 // 'development'= built on a branch, shipped inside a later release
//                                 // 'in progress'= this working branch, not yet merged
//   note:     'optional one-line context, e.g. where it was verified',
//   sections: [ { category: 'Timeline', items: ['…', '…'] } ]
// }
// Only record work that actually exists in the code. Dates must come from git
// history, merged reports or release records — never invent them.

export const CHANGELOG=[
{
  version:'4.3.0',date:'2026-11-21',title:'Timeline repair, camera visibility, multi-object editing & scene-to-code',
  status:'in progress',
  note:'Built on the 4.2 workspace; this working branch is not merged yet.',
  sections:[
    {category:'Timeline',items:[
      'Fixed the compressed timeline layout: the track area is now a protected flex region that always keeps a ruler and editable lanes, with the toolbar clamped above it.',
      'Added a draggable divider on the timeline edge to change its height, with a minimum that always leaves the tracks editable and a maximum that never covers the viewport.',
      'Added a collapse button that hides the track area while keeping the transport visible, and restores the chosen height on expand.',
      'Timeline height and collapsed state persist in the browser and travel inside saved projects.',
      'Double-clicking the divider resets the timeline to its default height.'
    ]},
    {category:'New Features',items:[
      'Added the built-in Changelog (this panel) with search, category filters and expandable entries; it opens from the Project menu and the Help dialog.',
      'Added multi-object selection: Ctrl/Shift-click scene objects, drag a selection rectangle, Select all, then move, rotate or scale the group together around a shared pivot as one undoable action.',
      'Added Generate Code From Scene in the Code Editor: deterministic, fully local code generation that rebuilds the current scene and its keyframes through the real scripting API — no AI, no network.'
    ]},
    {category:'Camera',items:[
      'Made the animation camera object reliably visible in Scene View with a scaled body, direction arrow, orientation wedge and frustum sized to the scene.',
      'Added a camera mode selector highlight, Focus Camera action and camera-object show/hide controls in the viewport toolbar and Camera inspector.'
    ]}
  ]
},
{
  version:'4.2.0',date:'2026-11-21',title:'Project saving, camera workspace & long timeline',
  status:'release',
  note:'Merged to main as PR #6 (commit 4ba48f7) on 21 November 2026.',
  sections:[
    {category:'New Features',items:[
      'Project format v3: editor camera mode/view, timeline zoom/scroll/Follow, selection, Auto-key/Onion preferences and imported-clip state save with the project; legacy projects still open.',
      'Visible unsaved indicator, before-unload warning, Save as / download copy and a cancellable discard warning.',
      '15-second change-based autosave recovery snapshot in the browser (IndexedDB) with atomic writes and invalid-snapshot rejection.',
      'Timeline duration now spans 2–7,200 seconds with horizontal scrolling, zoom slider, Fit, Ctrl/Cmd+wheel zoom and Follow-playhead.'
    ]},
    {category:'Camera',items:[
      'Two independent camera modes: First-person (animation camera) and Camera object / Scene view with a separately navigable editor camera.',
      'The animation camera shows a body, lens, forward arrow and frustum in Scene View; click it or press Edit camera to move/rotate it, then Key camera.',
      'Camera scrubbing uses quaternion orientation with per-key easing and FOV interpolation; idle view updates no longer erase sampled roll.'
    ]},
    {category:'Bug Fixes',items:[
      'Fly navigation stops immediately on key release and no longer swallows modifier chords or falls through into build actions.',
      'Keys and exact timestamps survive a temporarily shortened duration; distortion-key easing is preserved on load.'
    ]},
    {category:'Timeline',items:[
      'The key lanes moved into a real scroll viewport; existing selection, multi-select, copy/paste, duplicate and group-drag paths were kept intact.'
    ]}
  ]
},
{
  version:'4.1',date:'2026-11-21',title:'Fly navigation, shortcuts, key selection & body-part editing',
  status:'development',
  note:'Verified on a development branch on 21 November 2026; the features shipped inside the 4.2 update rather than as a separate release.',
  sections:[
    {category:'Animation',items:[
      'Multi-keyframe selection with Ctrl/Shift+click and box select, copy/paste, duplicate and group dragging in the timeline.',
      'Body parts gained move and scale handles, multi-part selection in the floating Parts panel, and Detach that frees a part from its joint without breaking the rig.'
    ]},
    {category:'New Features',items:[
      'WASD fly navigation (Space/E up, Q/C down, Shift faster, drag to look) with a fly toggle and control hints.',
      'Keyboard shortcut settings with rebindable actions, conflict warnings and shortcut chips in the shortcuts dialog.',
      'Drag-rectangle block Fill (G) builds floors, walls, ceilings and platforms with raise/layer controls.'
    ]}
  ]
},
{
  version:'4.0',date:'2026-10-23',title:'Expanded game asset library & local Code Editor',
  status:'release',
  note:'Verified on 23 October 2026 (see TESTED.md).',
  sections:[
    {category:'Asset Library',items:[
      'Expanded the library to 1,309 base block names / 4,032 block states, 1,110 item entries and 1,674 source-model choices with pagination and group filters.',
      'Original default-pack assets byte-verified against upstream (3,486 files); slabs, stairs, doors, furniture and cutout plants use correct geometry.',
      'Unavailable entries are named in a Coverage dialog instead of being replaced with invented substitutes.'
    ]},
    {category:'Code Editor',items:[
      'Added the local Code Editor with a bounded JavaScript interpreter: validate, dry-run snapshot and one-click atomic apply.',
      'Added the editable command-plan validator with per-command diagnostics and the AI Prompt Builder for local scene planning.'
    ]},
    {category:'New Features',items:[
      'Terrain-block selection converts one instanced cell into an independent editable block; transforms and keys keep Undo/Redo.'
    ]}
  ]
},
{
  version:'3.1',date:'2026-10-23',title:'Video download fix & direct motion',
  status:'release',
  note:'Verified 23 October 2026 (tests/historical/v3.1-verified-video-motion-report.json).',
  sections:[
    {category:'Bug Fixes',items:[
      'Video export keeps the finished clip in the Export panel behind an explicit Download button instead of attempting a blockable automatic download.',
      'Frame-by-frame rendering with explicit timestamps; genuine MP4/WebM containers with matching codecs rather than renamed files.'
    ]},
    {category:'Animation',items:[
      'Rotation now interpolates the shortest quaternion path between saved endpoints; Full spins opts into explicit revolution counts.'
    ]}
  ]
},
{
  version:'3.0',date:'2026-10-22',title:'Standalone offline editor',
  status:'release',
  note:'Verified 22 October 2026 (tests/historical/v3.0-gemini-standalone-report.json).',
  sections:[
    {category:'New Features',items:[
      'The editor became a fully self-contained offline HTML file with embedded assets and libraries.'
    ]},
    {category:'Improvements',items:[
      'External model/plan integration ran entirely through mocked, user-supplied keys with review-before-apply and atomic batches. That integration was later removed; the local Code Editor replaced it in 4.0.'
    ]}
  ]
},
{
  version:'2.1',date:null,title:'Keyframe fixes, original tool textures & imports',
  status:'release',
  note:'Release date not recorded in project documentation; the fixes are verified as retained in later suites.',
  sections:[
    {category:'Bug Fixes',items:[
      'Fixed the late-first-key defect and the edit-loss-on-scrub defect in the keyframe system.'
    ]},
    {category:'New Features',items:[
      'Original-color tool textures, manual editing mode, model imports (GLB/OBJ/STL/PLY) and local MP3 export.'
    ]}
  ]
}
];

export const CHANGELOG_CATEGORIES=['New Features','Improvements','Bug Fixes','Performance','Asset Library','Animation','Camera','Timeline','Code Editor'];
