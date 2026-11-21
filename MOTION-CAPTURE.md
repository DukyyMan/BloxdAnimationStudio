# Motion Capture

Record yourself with a webcam or upload a video; the studio tracks your body
locally in the browser and turns the movement into **real, editable keyframes**
on the existing Bob character — the same key data that manual posing creates,
so it scrubs, edits, saves, renders and exports like any other animation.

## How it works

1. **Capture** — Webcam (live skeleton overlay, pause/resume, duration,
   body-detection indicator, out-of-frame warnings) or video upload
   (MP4/WebM, drag-and-drop, frame-by-frame processing with progress + cancel).
2. **Track** — [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)
   (Tasks Vision **0.10.14**, pinned) detects 33 body landmarks per frame.
   Tracking runs in a Web Worker (CPU) with a main-thread GPU fallback.
   **Nothing is uploaded** — video never leaves the device.
3. **Convert** — `lib/motion-capture.js` maps landmarks to Bob's actual rig
   (10 joints: body, head, arm/forearm/leg/shin L/R, plus root position/yaw and
   vertical `offset`), with outlier rejection, gap interpolation, confidence
   filtering and exponential smoothing.
4. **Preview** — the captured movement plays on the real Bob in the scene
   (scrub/play/pause) before anything is written.
5. **Insert** — keys are written with the same `putKey` path as baked clips:
   one Undo step, replace-range / append / at-playhead modes, confirmation
   before overwriting existing keys. Other tracks are never touched.

## Internet requirement

The studio itself works fully offline. Motion Capture additionally needs
internet **once** to download the pinned MediaPipe library (jsDelivr) and the
~7 MB `pose_landmarker_lite` model (Google's model host); the browser then
caches them. If the download fails, the panel reports it and the rest of the
studio is unaffected. The WASM runtime (~20 MB) is deliberately not vendored
into the repo.

## Calibration & limitations (honest ones)

- One camera cannot measure true depth or real-world scale. Turning (root yaw)
  and forward/back movement are estimates from landmark depth — use
  **Facing offset** and **Movement scale** to calibrate.
- Feet are not locked to the ground; some foot sliding may remain.
- Root movement uses a deadband so small jitter does not drift Bob.
- Long videos are capped at 60 s (timeline limit); sample rates 12–30 fps.
- Anatomical left/right is preserved (your left arm drives Bob's left arm)
  regardless of the mirrored webcam preview. Enable **Mirror input** only for
  videos that were saved mirrored.

## Files

| File | Role |
|---|---|
| `lib/motion-capture.js` | Pure conversion/smoothing/resampling (Node-testable) |
| `lib/motion-capture-ui.js` | Panel, webcam, upload, worker tracking, preview |
| `tests/motion-capture.mjs` | 40-assertion conversion + timeline-compat tests (`npm run test:motion`) |
| `index.html` / `style.css` / `app.js` | Dialog markup, styles, wiring (insert mirrors `bakeClipInto`) |

## Testing status

Conversion, smoothing, root movement, left/right mapping, missing-landmark
handling and key/timeline compatibility are covered by automated tests.
Live webcam/video tracking requires a real browser with camera access and
internet for the model download, so it must be verified manually in the
deployed site — it was not exercised in the build sandbox.
