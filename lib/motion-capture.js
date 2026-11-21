// Motion capture: MediaPipe Pose landmarks -> Bloxd character pose samples -> native keyframes.
//
// Pure data module (no DOM, no THREE) so the conversion is unit-testable in Node.
// The studio rig (lib/character.js) uses pose = {offset, joint:[x,y,z] in DEGREES}
// with THREE Euler order 'XYZ' (R = Rx*Ry*Rz, verified against vendor/three.module.js).
// Character local axes: +X = character's left, +Y = up, +Z = forward (faces +Z at yaw 0).
// MediaPipe image landmarks: x right, y down (both normalized 0..1), z depth
// (smaller = closer to the camera, roughly x-scale). Anatomical left/right labels
// (11 = left shoulder, ...) are used directly, so left/right mapping does not depend
// on whether the preview is mirrored; the `mirror` option only flips roll signs for
// videos that were saved mirrored.

export const MP = {
  // Pinned MediaPipe Tasks Vision 0.10.14 (Apache-2.0). Loaded at runtime from
  // jsDelivr so the studio stays a single self-contained file; vendoring the WASM
  // runtime would add ~20 MB. The studio works fully offline without it.
  bundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  // Pose Landmarker "lite" float16 model (~7 MB, downloaded once, then browser-cached).
  model: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  version: '0.10.14',
};

// MediaPipe Pose landmark indices (33 landmarks).
export const LM = {
  nose: 0, leftEye: 2, rightEye: 5, leftEar: 7, rightEar: 8,
  leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16, leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28,
  leftHeel: 29, rightHeel: 30, leftFoot: 31, rightFoot: 32,
};
export const KEY_LANDMARKS = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Convert one image-space landmark to person space [u, v, w]:
// u = toward the person's left, v = up, w = out of the chest (character +Z).
// `aspect` corrects the independent x/y normalization so directions are isotropic.
export function toPersonSpace(lm, aspect = 1, mirror = false) {
  const u = (mirror ? -1 : 1) * (lm.x - 0.5) * aspect;
  const v = -(lm.y - 0.5);
  const w = -(lm.z || 0);
  return [u, v, w];
}

// Absolute Euler (degrees, y=0) that points a hanging limb (rest dir [0,-1,0])
// along unit direction d in person space, for THREE order XYZ (R = Rx*Ry*Rz):
//   dir = (sin z, -cos z * cos x, -cos z * sin x)  =>  z = asin(u), x = atan2(-w, -v)
export function limbEuler(d) {
  const u = clamp(d[0], -1, 1);
  return [Math.atan2(-d[2], -d[1]) * R2D, 0, Math.asin(u) * R2D];
}

function visible(lm, minVis) {
  return lm && Number.isFinite(lm.x) && Number.isFinite(lm.y) && (lm.visibility ?? 1) >= minVis;
}

// Convert one frame of MediaPipe landmarks into a studio pose sample.
// Returns null when the frame has no usable body (no person detected).
// opts: {aspect, mirror, minVis, yawOffsetDeg, includeYaw}
export function landmarksToPose(landmarks, opts = {}) {
  const { aspect = 1, mirror = false, minVis = 0.5, yawOffsetDeg = 0, includeYaw = true } = opts;
  if (!landmarks || landmarks.length < 33) return null;
  const P = i => visible(landmarks[i], minVis) ? toPersonSpace(landmarks[i], aspect, mirror) : null;
  const hipL = P(LM.leftHip), hipR = P(LM.rightHip);
  const shL = P(LM.leftShoulder), shR = P(LM.rightShoulder);
  if (!hipL || !hipR || !shL || !shR) return null;
  const hipMid = mid(hipL, hipR), shMid = mid(shL, shR);

  // Quality: fraction of key landmarks visible this frame.
  let vis = 0;
  for (const i of KEY_LANDMARKS) if (P(i)) vis++;
  const quality = vis / KEY_LANDMARKS.length;

  // Torso: spine direction hip->shoulder. Rest torso dir is +Y.
  const spine = norm(sub(shMid, hipMid));
  const body = [
    clamp(Math.atan2(spine[2], spine[1]) * R2D, -80, 80),   // lean forward/back
    0,
    clamp(Math.atan2(-spine[0], spine[1]) * R2D, -60, 60),  // lean left/right
  ];
  // Root yaw from the shoulder line in person space: character +X (left) should
  // align with the shoulder line, so yaw = atan2(-w, u) of (leftShoulder - rightShoulder).
  const shLine = sub(shL, shR);
  let yaw = Math.atan2(-shLine[2], shLine[0]);
  // Torso twist: shoulder yaw minus hip yaw (clamped; depth estimates are noisy).
  const hipLine = sub(hipL, hipR);
  const hipYaw = Math.atan2(-hipLine[2], hipLine[0]);
  let twist = yaw - hipYaw;
  while (twist > Math.PI) twist -= 2 * Math.PI;
  while (twist < -Math.PI) twist += 2 * Math.PI;
  body[1] = clamp(twist * R2D, -45, 45);
  if (!includeYaw) yaw = 0;
  yaw += yawOffsetDeg * D2R;

  // Head: forward = nose - ear midpoint; roll from the ear line.
  let headAbs = [0, 0, 0];
  const nose = P(LM.nose), earL = P(LM.leftEar), earR = P(LM.rightEar);
  if (nose && earL && earR) {
    const f = norm(sub(nose, mid(earL, earR)));
    const earVec = sub(earL, earR);
    headAbs = [
      clamp(Math.atan2(-f[1], f[2]) * R2D, -70, 70),
      clamp(Math.atan2(f[0], f[2]) * R2D, -80, 80),
      clamp(-Math.atan2(earVec[1], earVec[0]) * R2D, -45, 45),
    ];
  }
  const head = headAbs.map((v, i) => clamp(v - body[i], -90, 90));

  // Limbs. Arms are children of the body joint, so subtract the body Euler;
  // legs hang from the hips group (no rotation), so they are absolute.
  function limb(parentIdx, jointIdx, endIdx, parentEuler, hinge) {
    const a = P(parentIdx), b = P(jointIdx), c = P(endIdx);
    if (!a || !b || !c) return null;
    const upper = norm(sub(b, a)), lower = norm(sub(c, b));
    if (len(sub(b, a)) < 1e-6 || len(sub(c, b)) < 1e-6) return null;
    const absU = limbEuler(upper), absL = limbEuler(lower);
    const joint = absU.map((v, i) => v - parentEuler[i]);
    const child = absL.map((v, i) => v - absU[i]);
    if (hinge === 'elbow') child[0] = clamp(child[0], -170, 15); // bends forward (negative x)
    if (hinge === 'knee') child[0] = clamp(child[0], -15, 170);  // bends backward (positive x)
    joint[0] = clamp(joint[0], -180, 180);
    joint[2] = clamp(joint[2], -170, 170);
    child[2] = clamp(child[2], -120, 120);
    return { joint, child };
  }
  const armL = limb(LM.leftShoulder, LM.leftElbow, LM.leftWrist, body, 'elbow');
  const armR = limb(LM.rightShoulder, LM.rightElbow, LM.rightWrist, body, 'elbow');
  const legL = limb(LM.leftHip, LM.leftKnee, LM.leftAnkle, [0, 0, 0], 'knee');
  const legR = limb(LM.rightHip, LM.rightKnee, LM.rightAnkle, [0, 0, 0], 'knee');

  const pose = {
    offset: 0, // filled by buildMotionKeys from hip height deltas
    body, head,
    armL: armL ? armL.joint : [0, 0, 0],
    forearmL: armL ? armL.child : [0, 0, 0],
    armR: armR ? armR.joint : [0, 0, 0],
    forearmR: armR ? armR.child : [0, 0, 0],
    legL: legL ? legL.joint : [0, 0, 0],
    shinL: legL ? legL.child : [0, 0, 0],
    legR: legR ? legR.joint : [0, 0, 0],
    shinR: legR ? legR.child : [0, 0, 0],
  };
  return { pose, hip: hipMid, yaw, quality, detected: true };
}

// --- Temporal cleanup -------------------------------------------------------

// Per-landmark outlier rejection + short-gap hold/interpolation.
// frames: [{t, landmarks|null}] sorted by t. Returns cleaned frames (new array).
export function cleanFrames(frames, { minVis = 0.5, maxGap = 0.5, maxJump = 0.45 } = {}) {
  const out = frames.map(f => ({ t: f.t, landmarks: f.landmarks ? f.landmarks.map(l => ({ ...l })) : null }));
  if (!out.length) return out;
  for (let i = 0; i < 33; i++) {
    let lastGood = -1, lastVal = null;
    for (let f = 0; f < out.length; f++) {
      const lm = out[f].landmarks?.[i];
      const ok = lm && (lm.visibility ?? 1) >= minVis;
      if (ok && lastVal) {
        const d = Math.hypot(lm.x - lastVal.x, lm.y - lastVal.y);
        if (d > maxJump && f - lastGood <= 3) { out[f].landmarks[i] = { ...lastVal, visibility: 0 }; continue; }
      }
      if (ok) { lastGood = f; lastVal = lm; }
      else if (lastVal && out[f].landmarks && out[f].t - out[lastGood].t <= maxGap) {
        out[f].landmarks[i] = { ...lastVal, visibility: Math.min(lastVal.visibility ?? 1, 0.49) };
      }
    }
    // Linearly interpolate remaining short gaps between good samples.
    let prev = -1;
    for (let f = 0; f <= out.length; f++) {
      const good = f < out.length && out[f].landmarks?.[i] && (out[f].landmarks[i].visibility ?? 1) >= minVis;
      if (good) {
        if (prev >= 0 && f - prev > 1 && out[f].t - out[prev].t <= maxGap * 2) {
          const a = out[prev].landmarks[i], b = out[f].landmarks[i];
          for (let g = prev + 1; g < f; g++) {
            const k = (out[g].t - out[prev].t) / (out[f].t - out[prev].t || 1);
            out[g].landmarks[i] = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * k, visibility: 0.6 };
          }
        }
        prev = f;
      }
    }
  }
  return out;
}

// Exponential smoothing of numeric channels. tau=0 disables smoothing.
export function smoothSeries(values, times, tau) {
  if (!tau || tau <= 0 || values.length < 2) return values.slice();
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    const dt = Math.max(1e-3, times[i] - times[i - 1]);
    const a = 1 - Math.exp(-dt / tau);
    out.push(out[i - 1] + (values[i] - out[i - 1]) * a);
  }
  return out;
}

const JOINT_KEYS = ['body', 'head', 'armL', 'forearmL', 'armR', 'forearmR', 'legL', 'shinL', 'legR', 'shinR'];
function lerpAngle(a, b, f) {
  let d = ((b - a + 540) % 360) - 180;
  return a + d * f;
}

// Build native studio keyframes from captured frames.
// frames: [{t, landmarks}] (t in seconds, any origin). Returns {keys, stats}.
// opts: {startTime, basePosition:[x,y,z], sampleFps, smoothing (tau seconds),
//        movementScale, horizontalSensitivity, aspect, mirror, minVis,
//        yawOffsetDeg, includeYaw, includeRoot, reduce, personHeightUnits}
export function buildMotionKeys(frames, opts = {}) {
  const o = {
    startTime: 0, basePosition: [0, 0, 0], sampleFps: 15, smoothing: 0.06,
    movementScale: 1, horizontalSensitivity: 1, aspect: 1, mirror: false,
    minVis: 0.5, yawOffsetDeg: 0, includeYaw: true, includeRoot: true,
    reduce: false, personHeightUnits: 1.75,
    ...opts,
  };
  const cleaned = cleanFrames(frames, { minVis: o.minVis });
  const samples = [];
  let detected = 0, qualitySum = 0;
  for (const f of cleaned) {
    const s = landmarksToPose(f.landmarks, o);
    if (s) { samples.push({ t: f.t, ...s }); detected++; qualitySum += s.quality; }
  }
  const stats = {
    frames: frames.length, detected,
    detectionRate: frames.length ? detected / frames.length : 0,
    avgQuality: detected ? qualitySum / detected : 0,
    duration: frames.length > 1 ? frames.at(-1).t - frames[0].t : 0,
    keys: 0,
  };
  if (samples.length < 2) return { keys: [], stats };

  // Reference frame: first sample with good quality (stable origin for root deltas).
  const ref = samples.find(s => s.quality > 0.7) || samples[0];
  const t0 = samples[0].t;
  // Person size in normalized units: shoulder-to-ankle distance at the reference frame.
  const refLm = cleaned.find(f => Math.abs(f.t - ref.t) < 1e-9)?.landmarks;
  let personSize = 0.8;
  if (refLm) {
    const sh = toPersonSpace(refLm[LM.leftShoulder], o.aspect, o.mirror);
    const an = toPersonSpace(refLm[LM.leftAnkle], o.aspect, o.mirror);
    personSize = Math.max(0.2, len(sub(sh, an)));
  }
  const unit = o.personHeightUnits / personSize; // normalized units -> studio units

  // Per-sample root deltas + offset, then smooth every channel.
  const times = samples.map(s => s.t);
  const raw = {
    dx: samples.map(s => (s.hip[0] - ref.hip[0]) * unit * o.movementScale * o.horizontalSensitivity),
    dy: samples.map(s => (s.hip[1] - ref.hip[1]) * unit * o.movementScale),
    dz: samples.map(s => (s.hip[2] - ref.hip[2]) * unit * o.movementScale * o.horizontalSensitivity),
    yaw: samples.map(s => s.yaw),
    offset: samples.map(s => (s.hip[1] - ref.hip[1]) * unit * o.movementScale),
  };
  // Deadband on horizontal root motion so tiny landmark jitter cannot drift the character.
  for (let i = 0; i < raw.dx.length; i++) {
    if (Math.abs(raw.dx[i]) < 0.015) raw.dx[i] = 0;
    if (Math.abs(raw.dz[i]) < 0.015) raw.dz[i] = 0;
  }
  const sm = {
    dx: smoothSeries(raw.dx, times, o.smoothing),
    dy: smoothSeries(raw.dy, times, o.smoothing),
    dz: smoothSeries(raw.dz, times, o.smoothing),
    yaw: smoothSeries(raw.yaw, times, Math.max(o.smoothing, 0.12)),
    offset: smoothSeries(raw.offset, times, o.smoothing),
  };
  const poseSm = {};
  for (const k of JOINT_KEYS) {
    poseSm[k] = [0, 1, 2].map(axis => smoothSeries(samples.map(s => s.pose[k][axis]), times, o.smoothing));
  }

  const sampleAt = t => {
    // Binary search for bracketing samples.
    let lo = 0, hi = samples.length - 1;
    if (t <= times[0]) lo = hi = 0;
    else if (t >= times.at(-1)) lo = hi = samples.length - 1;
    else { while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; } }
    const f = hi === lo ? 0 : (t - times[lo]) / (times[hi] - times[lo] || 1);
    const pose = { offset: sm.offset[lo] + (sm.offset[hi] - sm.offset[lo]) * f };
    for (const k of JOINT_KEYS) pose[k] = [0, 1, 2].map(axis => lerpAngle(poseSm[k][axis][lo], poseSm[k][axis][hi], f));
    return {
      pose,
      dx: sm.dx[lo] + (sm.dx[hi] - sm.dx[lo]) * f,
      dy: sm.dy[lo] + (sm.dy[hi] - sm.dy[lo]) * f,
      dz: sm.dz[lo] + (sm.dz[hi] - sm.dz[lo]) * f,
      yaw: sm.yaw[lo] + (sm.yaw[hi] - sm.yaw[lo]) * f,
    };
  };

  const dur = times.at(-1) - t0;
  const step = 1 / clamp(o.sampleFps, 1, 60);
  const keys = [];
  let lastKept = null;
  for (let t = t0; t <= t0 + dur + 1e-6; t += step) {
    const s = sampleAt(t);
    const key = {
      time: o.startTime + (t - t0),
      position: o.includeRoot
        ? [o.basePosition[0] + s.dx, o.basePosition[1] + s.dy, o.basePosition[2] + s.dz]
        : [...o.basePosition],
      rotation: [0, o.includeYaw ? s.yaw : 0, 0],
      scale: [1, 1, 1],
      pose: s.pose,
    };
    if (o.reduce && lastKept) {
      let maxD = 0;
      for (const k of JOINT_KEYS) for (let a = 0; a < 3; a++) maxD = Math.max(maxD, Math.abs(key.pose[k][a] - lastKept.pose[k][a]));
      maxD = Math.max(maxD, Math.abs(key.pose.offset - lastKept.pose.offset) * 40);
      const dt = key.time - lastKept.time;
      if (maxD < 0.75 && dt < 0.25) continue; // near-duplicate: skip
    }
    keys.push(key); lastKept = key;
  }
  if (keys.length && keys.at(-1).time < o.startTime + dur - 1e-6) {
    const s = sampleAt(t0 + dur);
    keys.push({
      time: o.startTime + dur,
      position: o.includeRoot ? [o.basePosition[0] + s.dx, o.basePosition[1] + s.dy, o.basePosition[2] + s.dz] : [...o.basePosition],
      rotation: [0, o.includeYaw ? s.yaw : 0, 0],
      scale: [1, 1, 1], pose: s.pose,
    });
  }
  stats.keys = keys.length;
  return { keys, stats };
}

// Skeleton connections for the live overlay (index pairs).
export const POSE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];
