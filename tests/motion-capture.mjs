// Motion capture conversion tests: synthetic MediaPipe landmarks -> studio poses/keys.
// Run via esbuild bundle (three alias) — see package.json "test:motion".
import assert from 'node:assert/strict';
import { landmarksToPose, buildMotionKeys, cleanFrames, smoothSeries, limbEuler, LM } from '../lib/motion-capture.js';
import { putKey, samplePose } from '../lib/tracks.js';
import { neutralPose } from '../lib/character.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const near = (a, b, e = 2) => Math.abs(a - b) <= e;

// Build 33 synthetic landmarks. Person faces the camera, centered.
// Image coords: x right, y down. Person's left is on image-right (facing camera).
function makeLandmarks(over = {}) {
  const base = {};
  const set = (i, x, y, z = 0, v = 0.99) => { base[i] = { x, y, z, visibility: v }; };
  set(LM.nose, 0.50, 0.25); set(LM.leftEar, 0.55, 0.26); set(LM.rightEar, 0.45, 0.26);
  set(LM.leftEye, 0.53, 0.24); set(LM.rightEye, 0.47, 0.24);
  set(LM.leftShoulder, 0.60, 0.35); set(LM.rightShoulder, 0.40, 0.35);
  set(LM.leftElbow, 0.62, 0.55); set(LM.rightElbow, 0.38, 0.55);
  set(LM.leftWrist, 0.63, 0.75); set(LM.rightWrist, 0.37, 0.75);
  set(LM.leftHip, 0.55, 0.60); set(LM.rightHip, 0.45, 0.60);
  set(LM.leftKnee, 0.55, 0.80); set(LM.rightKnee, 0.45, 0.80);
  set(LM.leftAnkle, 0.55, 0.95); set(LM.rightAnkle, 0.45, 0.95);
  for (const [i, v] of Object.entries(over)) base[i] = { ...base[i], ...v };
  return Array.from({ length: 33 }, (_, i) => base[i] || { x: 0.5, y: 0.5, z: 0, visibility: 0.99 });
}
const framesOf = (lm, count = 5, dt = 0.1) => Array.from({ length: count }, (_, i) => ({ t: i * dt, landmarks: lm }));

// ── limbEuler: hanging limb, forward raise, side raise ──
ok(near(limbEuler([0, -1, 0])[0], 0, 0.01) && near(limbEuler([0, -1, 0])[2], 0, 0.01), 'hanging limb = zero rotation');
ok(near(limbEuler([0, 0, 1])[0], -90, 0.01), 'forward horizontal = x -90 (matches studio presets)');
ok(near(limbEuler([1, 0, 0])[2], 90, 0.01), 'left-out horizontal = z +90 (matches T-pose preset)');
ok(near(limbEuler([-1, 0, 0])[2], -90, 0.01), 'right-out horizontal = z -90');
ok(Math.abs(Math.abs(limbEuler([0, 1, 0])[0]) - 180) < 0.01, 'straight up = x ±180');

// ── Neutral standing pose ──
{
  const s = landmarksToPose(makeLandmarks());
  ok(s && s.detected, 'neutral pose detected');
  ok(near(s.pose.armL[2], 0, 12) && near(s.pose.armR[2], 0, 12), 'neutral arms hang (z≈0), got ' + s.pose.armL + ' / ' + s.pose.armR);
  ok(near(s.pose.legL[0], 0, 8) && near(s.pose.legR[0], 0, 8), 'neutral legs straight');
  ok(near(s.pose.body[0], 0, 8) && near(s.pose.body[2], 0, 8), 'neutral torso upright');
  ok(s.quality > 0.9, 'neutral quality high: ' + s.quality);
}

// ── Both arms raised (out to the sides) ──
{
  const s = landmarksToPose(makeLandmarks({
    [LM.leftElbow]: { x: 0.78, y: 0.35 }, [LM.leftWrist]: { x: 0.88, y: 0.30 },
    [LM.rightElbow]: { x: 0.22, y: 0.35 }, [LM.rightWrist]: { x: 0.12, y: 0.30 },
  }));
  ok(s.pose.armL[2] > 55, 'left arm raised out: z=' + s.pose.armL[2].toFixed(1));
  ok(s.pose.armR[2] < -55, 'right arm raised out: z=' + s.pose.armR[2].toFixed(1));
}

// ── One arm raised: left/right mapping ──
{
  const s = landmarksToPose(makeLandmarks({
    [LM.leftElbow]: { x: 0.78, y: 0.35 }, [LM.leftWrist]: { x: 0.88, y: 0.30 },
  }));
  ok(s.pose.armL[2] > 55, 'raised arm maps to armL (person left)');
  ok(Math.abs(s.pose.armR[2]) < 20, 'lowered arm stays armR≈0, got ' + s.pose.armR[2].toFixed(1));
}

// ── Elbow bend: forearm forward ──
{
  const s = landmarksToPose(makeLandmarks({
    [LM.leftWrist]: { x: 0.62, y: 0.55, z: -0.18 }, // wrist toward camera = forward
  }));
  ok(s.pose.forearmL[0] < -25, 'elbow bends forward (negative x): ' + s.pose.forearmL[0].toFixed(1));
}

// ── Crouch vs jump: hip height drives pose.offset ──
{
  const neutral = framesOf(makeLandmarks());
  const crouchLm = makeLandmarks({
    [LM.leftHip]: { y: 0.74 }, [LM.rightHip]: { y: 0.74 },
    [LM.leftKnee]: { y: 0.84, z: -0.10 }, [LM.rightKnee]: { y: 0.84, z: -0.10 },
  });
  const jumpLm = makeLandmarks({
    [LM.leftHip]: { y: 0.46 }, [LM.rightHip]: { y: 0.46 },
    [LM.leftKnee]: { y: 0.66 }, [LM.rightKnee]: { y: 0.66 },
    [LM.leftAnkle]: { y: 0.82 }, [LM.rightAnkle]: { y: 0.82 },
  });
  const crouch = buildMotionKeys([...neutral, ...framesOf(crouchLm).map(f => ({ ...f, t: f.t + 0.5 }))], { sampleFps: 10 });
  const jump = buildMotionKeys([...neutral, ...framesOf(jumpLm).map(f => ({ ...f, t: f.t + 0.5 }))], { sampleFps: 10 });
  ok(crouch.keys.at(-1).pose.offset < -0.05, 'crouch lowers offset: ' + crouch.keys.at(-1).pose.offset.toFixed(3));
  ok(jump.keys.at(-1).pose.offset > 0.05, 'jump raises offset: ' + jump.keys.at(-1).pose.offset.toFixed(3));
  ok(crouch.keys.at(-1).pose.shinL[0] > 10 || crouch.keys.at(-1).pose.legL[0] < -10, 'crouch bends knees/hips');
}

// ── Walking frame: legs swing opposite ──
{
  const s = landmarksToPose(makeLandmarks({
    [LM.leftKnee]: { y: 0.82, z: -0.15 }, [LM.rightKnee]: { y: 0.82, z: 0.15 },
  }));
  ok(s.pose.legL[0] < -10, 'forward leg swings forward (x<0): ' + s.pose.legL[0].toFixed(1));
  ok(s.pose.legR[0] > 10, 'back leg swings back (x>0): ' + s.pose.legR[0].toFixed(1));
}

// ── Asymmetric arms preserved ──
{
  const s = landmarksToPose(makeLandmarks({
    [LM.leftElbow]: { x: 0.70, y: 0.40 }, [LM.leftWrist]: { x: 0.78, y: 0.28 },
    [LM.rightElbow]: { x: 0.38, y: 0.60 }, [LM.rightWrist]: { x: 0.37, y: 0.80 },
  }));
  ok(Math.abs(s.pose.armL[2] - s.pose.armR[2]) > 30, 'asymmetry preserved: L=' + s.pose.armL[2].toFixed(1) + ' R=' + s.pose.armR[2].toFixed(1));
}

// ── Missing / low-confidence landmarks ──
{
  const s = landmarksToPose(makeLandmarks({ [LM.leftWrist]: { visibility: 0 }, [LM.rightWrist]: { visibility: 0 } }));
  ok(s, 'frame still converts with missing wrists');
  ok(s.quality < 0.95, 'quality drops with missing landmarks: ' + s.quality.toFixed(2));
  ok(Array.isArray(s.pose.armL) && s.pose.armL.every(Number.isFinite), 'missing limb falls back to finite pose');
  ok(landmarksToPose(null) === null && landmarksToPose([]) === null, 'null/empty landmarks -> null (no person)');
  const noBody = makeLandmarks({ [LM.leftHip]: { visibility: 0 }, [LM.rightHip]: { visibility: 0 } });
  ok(landmarksToPose(noBody) === null, 'missing hips -> null');
}

// ── cleanFrames: outlier rejection + gap hold ──
{
  const good = makeLandmarks();
  const frames = framesOf(good, 6);
  frames[2].landmarks[LM.leftWrist] = { x: 0.05, y: 0.05, z: 0, visibility: 0.99 }; // wild jump
  frames[3].landmarks[LM.leftWrist] = { x: 0.63, y: 0.75, z: 0, visibility: 0 };    // missing
  const cleaned = cleanFrames(frames);
  ok(Math.abs(cleaned[2].landmarks[LM.leftWrist].x - 0.63) < 0.05, 'outlier wrist replaced by last good');
  ok(cleaned[3].landmarks[LM.leftWrist].x > 0.5, 'missing wrist held from last good');
}

// ── Smoothing reduces jitter ──
{
  const times = [0, 0.1, 0.2, 0.3, 0.4];
  const noisy = [0, 5, -5, 5, -5];
  const sm = smoothSeries(noisy, times, 0.15);
  const varOf = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length; };
  ok(varOf(sm) < varOf(noisy) * 0.5, 'smoothing reduces variance');
  ok(smoothSeries(noisy, times, 0)[2] === -5, 'tau=0 disables smoothing');
}

// ── Root movement: hip shift -> position delta ──
{
  const a = makeLandmarks();
  const b = makeLandmarks({
    [LM.leftHip]: { x: 0.65 }, [LM.rightHip]: { x: 0.55 },
    [LM.leftShoulder]: { x: 0.70 }, [LM.rightShoulder]: { x: 0.50 },
    [LM.leftElbow]: { x: 0.72 }, [LM.rightElbow]: { x: 0.48 },
    [LM.leftWrist]: { x: 0.73 }, [LM.rightWrist]: { x: 0.47 },
    [LM.leftKnee]: { x: 0.65 }, [LM.rightKnee]: { x: 0.55 },
    [LM.leftAnkle]: { x: 0.65 }, [LM.rightAnkle]: { x: 0.55 },
    [LM.nose]: { x: 0.60 }, [LM.leftEar]: { x: 0.65 }, [LM.rightEar]: { x: 0.55 },
  });
  const { keys } = buildMotionKeys([...framesOf(a), ...framesOf(b).map(f => ({ ...f, t: f.t + 0.5 }))], { sampleFps: 10, smoothing: 0 });
  const dx = keys.at(-1).position[0] - keys[0].position[0];
  ok(dx > 0.05, 'moving image-right moves character +X: dx=' + dx.toFixed(3));
}

// ── buildMotionKeys: timing, shape, studio compatibility ──
{
  const { keys, stats } = buildMotionKeys(framesOf(makeLandmarks(), 21), { sampleFps: 10, startTime: 2, basePosition: [1, 2, 3] });
  ok(keys.length === 21, '21 frames @10fps -> 21 keys, got ' + keys.length);
  ok(Math.abs(keys[0].time - 2) < 1e-9 && Math.abs(keys.at(-1).time - 4) < 1e-6, 'key times span startTime..startTime+duration');
  ok(keys.every(k => k.position.length === 3 && k.rotation.length === 3 && k.scale.length === 3 && k.pose && typeof k.pose.offset === 'number'), 'key shape matches studio tracks');
  ok(keys.every(k => Object.keys(neutralPose()).every(j => j === 'offset' || (Array.isArray(k.pose[j]) && k.pose[j].every(Number.isFinite)))), 'every rig joint present and finite');
  ok(stats.detectionRate === 1 && stats.keys === 21, 'stats reported');
  // Keys must work with the real track sampler (same data manual editing creates).
  const track = [];
  for (const k of keys) putKey(track, k);
  ok(track.length === 21, 'putKey accepts all generated keys');
  const sampled = samplePose(track, 3);
  ok(sampled && sampled.pose && sampled.pose.armL.every(Number.isFinite), 'samplePose reads generated keys');
  ok(Math.abs(sampled.position[0] - 1) < 1e-6, 'sampled root position matches base');
}

// ── Empty / undetected input ──
{
  const { keys, stats } = buildMotionKeys([{ t: 0, landmarks: null }, { t: 0.1, landmarks: null }]);
  ok(keys.length === 0 && stats.detectionRate === 0, 'no person -> no keys, zero detection rate');
}

console.log(`motion-capture smoke OK · ${n} assertions passed`);
