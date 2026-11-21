// Motion Capture panel: webcam + video-upload capture, local MediaPipe Pose
// tracking (Web Worker with main-thread fallback), character preview, and
// insertion of native keyframes into the existing timeline via app.js deps.
// Everything runs in the browser; no video ever leaves the device.
import { MP, POSE_CONNECTIONS, buildMotionKeys } from './motion-capture.js';
import { samplePose } from './tracks.js';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Worker source: imports the pinned MediaPipe bundle from the CDN, initializes
// the Pose Landmarker (CPU delegate — WebGL in workers is unreliable), and
// answers frame messages with landmark arrays. Falls back to main thread on error.
const WORKER_SRC = `
let landmarker = null, ready = false;
async function init(msg) {
  const mod = await import(msg.bundle);
  const fileset = await mod.FilesetResolver.forVisionTasks(msg.wasm);
  landmarker = await mod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: msg.model, delegate: 'CPU' },
    runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  ready = true;
}
onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'init') { await init(m); postMessage({ type: 'ready' }); return; }
    if (m.type === 'frame') {
      if (!ready) { postMessage({ type: 'result', id: m.id, landmarks: null }); return; }
      const r = landmarker.detectForVideo(m.bitmap, m.timestamp);
      const lm = r.landmarks && r.landmarks[0] ? r.landmarks[0].map(l => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility })) : null;
      postMessage({ type: 'result', id: m.id, landmarks: lm });
    }
  } catch (err) { postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) }); }
};
`;

export function initMotionCapture(deps) {
  const dialog = $('#mocap-dialog');
  if (!dialog) return null;
  const el = id => dialog.querySelector('#' + id);
  const video = el('mocap-video'), overlay = el('mocap-overlay'), octx = overlay.getContext('2d');
  const upVideo = el('mocap-upload-video');
  const statusEl = el('mocap-status'), warnEl = el('mocap-warn'), progWrap = el('mocap-progress-wrap'), prog = el('mocap-progress');
  const previewWrap = el('mocap-preview-wrap'), scrub = el('mocap-scrub'), previewTime = el('mocap-preview-time');
  const insertWrap = el('mocap-insert-wrap');

  let stream = null, landmarker = null, worker = null, workerReady = false, workerFailed = false;
  let workerReadyPromise = null, workerReadyResolve = null;
  let pending = new Map(), frameSeq = 0, lastTs = 0;
  let frames = [], recording = false, paused = false, recStart = 0, recRaf = 0, detectBusy = false;
  let previewKeys = [], previewStats = null, previewRecord = null, previewBase = null;
  let previewPlaying = false, previewT = 0, previewRaf = 0, previewLast = 0;
  let processing = false, cancelProcessing = false, uploadUrl = null;
  let backendLabel = '';

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('error', isError);
  }
  function setWarn(msg) { warnEl.textContent = msg || ''; warnEl.hidden = !msg; }

  // ── MediaPipe loading (lazy, pinned, graceful failure) ──
  async function ensureMainLandmarker() {
    if (landmarker) return landmarker;
    const mod = await import(MP.bundle);
    const fileset = await mod.FilesetResolver.forVisionTasks(MP.wasm);
    const base = { baseOptions: { modelAssetPath: MP.model }, runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 };
    try {
      landmarker = await mod.PoseLandmarker.createFromOptions(fileset, { ...base, baseOptions: { modelAssetPath: MP.model, delegate: 'GPU' } });
      backendLabel = 'Main thread · GPU';
    } catch (e) {
      landmarker = await mod.PoseLandmarker.createFromOptions(fileset, { ...base, baseOptions: { modelAssetPath: MP.model, delegate: 'CPU' } });
      backendLabel = 'Main thread · CPU';
    }
    return landmarker;
  }
  function ensureWorker() {
    if (worker || workerFailed) return worker;
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      worker = new Worker(url, { type: 'module' });
      workerReadyPromise = new Promise(res => { workerReadyResolve = res; });
      worker.onmessage = e => {
        const m = e.data;
        if (m.type === 'ready') { workerReady = true; backendLabel = 'Worker · CPU'; workerReadyResolve && workerReadyResolve(); return; }
        if (m.type === 'error' && !m.id) { workerFailed = true; return; }
        const p = pending.get(m.id);
        if (p) { pending.delete(m.id); m.type === 'result' ? p.resolve(m.landmarks) : p.reject(new Error(m.message)); }
      };
      worker.onerror = () => { workerFailed = true; for (const p of pending.values()) p.reject(new Error('Tracking worker failed.')); pending.clear(); };
      worker.postMessage({ type: 'init', bundle: MP.bundle, wasm: MP.wasm, model: MP.model });
    } catch (e) { workerFailed = true; worker = null; }
    return worker;
  }
  async function detect(bitmap, timestamp) {
    lastTs = Math.max(lastTs + 1, timestamp);
    const w = ensureWorker();
    if (w && !workerFailed) {
      try {
        if (!workerReady && workerReadyPromise) await Promise.race([workerReadyPromise, new Promise((_, rej) => setTimeout(() => rej(new Error('tracker loading timed out')), 20000))]);
        const id = ++frameSeq;
        const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
        w.postMessage({ type: 'frame', id, bitmap, timestamp: lastTs }, [bitmap]);
        // Wait briefly for the worker; fall through to main thread on timeout/error.
        const lm = await Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('worker timeout')), 4000))]);
        return lm;
      } catch (e) {
        workerFailed = true;
        try { w.terminate(); } catch (_) {}
        worker = null; pending.clear();
      }
    }
    const lm = await ensureMainLandmarker();
    const r = lm.detectForVideo(bitmap, lastTs);
    return r.landmarks && r.landmarks[0] ? r.landmarks[0].map(l => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility })) : null;
  }

  // ── Skeleton overlay ──
  function drawSkeleton(lm) {
    const w = overlay.width, h = overlay.height;
    octx.clearRect(0, 0, w, h);
    if (!lm) return;
    octx.strokeStyle = '#d7fb90'; octx.fillStyle = '#d7fb90'; octx.lineWidth = 2;
    octx.beginPath();
    for (const [a, b] of POSE_CONNECTIONS) {
      const A = lm[a], B = lm[b];
      if (!A || !B || (A.visibility ?? 1) < 0.3 || (B.visibility ?? 1) < 0.3) continue;
      octx.moveTo(A.x * w, A.y * h); octx.lineTo(B.x * w, B.y * h);
    }
    octx.stroke();
    for (const l of lm) {
      if ((l.visibility ?? 1) < 0.3) continue;
      octx.beginPath(); octx.arc(l.x * w, l.y * h, 3, 0, 7); octx.fill();
    }
  }
  function outOfFrame(lm) {
    if (!lm) return false;
    const key = [11, 12, 15, 16, 23, 24, 27, 28];
    return key.some(i => { const l = lm[i]; return l && ((l.visibility ?? 1) >= 0.5) && (l.x < 0.03 || l.x > 0.97 || l.y < 0.03 || l.y > 0.97); });
  }

  // ── Webcam ──
  async function enableCamera() {
    setStatus('Requesting camera…');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      const msg = e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser, then try again.'
        : e.name === 'NotFoundError' ? 'No camera was found on this device.'
        : 'Could not start the camera: ' + e.message;
      setStatus(msg, true); deps.toast(msg); return;
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    overlay.width = video.videoWidth || 640; overlay.height = video.videoHeight || 360;
    el('mocap-cam-enable').disabled = true;
    setStatus('Camera ready. Loading the pose tracker (first use downloads the ~7 MB model)…');
    try { await detectWarmup(); setStatus('Tracker ready (' + backendLabel + '). Press Start recording.'); }
    catch (e) { setStatus('Tracker failed to load — check your internet connection. The rest of the studio is unaffected. (' + e.message + ')', true); }
  }
  async function detectWarmup() {
    // One throwaway detection so model/WASM download happens before recording.
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const bmp = await createImageBitmap(c);
    await detect(bmp, performance.now());
  }
  function stopCamera() {
    recording = false; cancelAnimationFrame(recRaf);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    video.srcObject = null;
    el('mocap-cam-enable').disabled = false;
    el('mocap-rec-start').disabled = true; el('mocap-rec-pause').disabled = true; el('mocap-rec-stop').disabled = true;
    octx.clearRect(0, 0, overlay.width, overlay.height);
  }
  async function recordLoop() {
    if (!recording) return;
    recRaf = requestAnimationFrame(recordLoop);
    if (paused || detectBusy || video.readyState < 2) return;
    detectBusy = true;
    const now = performance.now();
    try {
      const bmp = await createImageBitmap(video);
      const lm = await detect(bmp, now);
      if (!recording) return;
      frames.push({ t: (now - recStart) / 1000, landmarks: lm });
      drawSkeleton(lm);
      const detected = !!lm;
      el('mocap-detect-dot').classList.toggle('on', detected);
      el('mocap-detect-label').textContent = detected ? 'Body detected' : 'No body detected';
      setWarn(outOfFrame(lm) ? '⚠ Part of your body is outside the camera frame — tracking may be inaccurate.' : '');
      el('mocap-rec-time').textContent = ((now - recStart) / 1000).toFixed(1) + ' s · ' + frames.length + ' frames';
    } catch (e) {
      setStatus('Tracking error: ' + e.message, true);
    } finally { detectBusy = false; }
  }
  function startRecording() {
    if (!stream) return;
    frames = []; paused = false; recStart = performance.now(); recording = true;
    el('mocap-rec-start').disabled = true; el('mocap-rec-pause').disabled = false; el('mocap-rec-stop').disabled = false;
    el('mocap-rec-pause').textContent = 'Pause';
    setStatus('Recording… move naturally in front of the camera.');
    recordLoop();
  }
  function togglePause() {
    paused = !paused;
    el('mocap-rec-pause').textContent = paused ? 'Resume' : 'Pause';
    setStatus(paused ? 'Paused — the camera stays on but no frames are captured.' : 'Recording resumed.');
  }
  function stopRecording() {
    recording = false; cancelAnimationFrame(recRaf);
    el('mocap-rec-start').disabled = false; el('mocap-rec-pause').disabled = true; el('mocap-rec-stop').disabled = true;
    const good = frames.filter(f => f.landmarks).length;
    setStatus('Recording stopped: ' + frames.length + ' frames, ' + good + ' with a detected body. Press “Process & preview”.');
    el('mocap-process').disabled = !frames.length;
  }

  // ── Video upload ──
  function loadUpload(file) {
    if (!file) return;
    if (!/^video\//.test(file.type) && !/\.(mp4|webm|mov|mkv)$/i.test(file.name)) {
      setStatus('That file does not look like a video. Choose an MP4 or WebM file.', true); return;
    }
    if (file.size > 500 * 1024 * 1024) { setStatus('That video is over 500 MB — please use a shorter clip.', true); return; }
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    uploadUrl = URL.createObjectURL(file);
    upVideo.src = uploadUrl;
    upVideo.onloadedmetadata = () => {
      const d = upVideo.duration;
      el('mocap-upload-info').textContent = file.name + ' · ' + (Number.isFinite(d) ? d.toFixed(1) + ' s' : 'duration unknown') + ' · ' + (file.size / 1048576).toFixed(1) + ' MB';
      el('mocap-upload-process').disabled = false;
      setStatus('Video loaded. Press “Process video” to track the person in it.');
    };
    upVideo.onerror = () => setStatus('Could not decode that video — the codec may not be supported by this browser. Try MP4 (H.264) or WebM.', true);
  }
  function seekTo(v, t) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Video seek timed out — the file may be corrupt or use an unsupported codec.')), 8000);
      const done = () => { clearTimeout(timer); v.removeEventListener('seeked', done); resolve(); };
      v.addEventListener('seeked', done);
      v.currentTime = t;
    });
  }
  async function processUpload() {
    if (processing || !upVideo.duration) return;
    processing = true; cancelProcessing = false;
    el('mocap-upload-process').disabled = true; el('mocap-upload-cancel').disabled = false;
    progWrap.hidden = false; prog.value = 0;
    frames = [];
    const dur = Math.min(upVideo.duration, 60);
    if (upVideo.duration > 60) setWarn('⚠ Only the first 60 s will be processed (timeline limit).');
    const fps = clamp(parseFloat(el('mocap-fps').value) || 15, 1, 30);
    const step = 1 / fps, total = Math.floor(dur / step);
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 640 / (upVideo.videoWidth || 640));
    canvas.width = Math.round((upVideo.videoWidth || 640) * scale);
    canvas.height = Math.round((upVideo.videoHeight || 360) * scale);
    const cctx = canvas.getContext('2d');
    setStatus('Processing video… loading tracker if needed.');
    try {
      await detectWarmup();
      let found = 0;
      for (let i = 0; i <= total; i++) {
        if (cancelProcessing) { setStatus('Processing cancelled.'); return; }
        const t = i * step;
        await seekTo(upVideo, Math.min(t, Math.max(0, upVideo.duration - 0.05)));
        cctx.drawImage(upVideo, 0, 0, canvas.width, canvas.height);
        const bmp = await createImageBitmap(canvas);
        const lm = await detect(bmp, performance.now());
        frames.push({ t, landmarks: lm });
        if (lm) found++;
        prog.value = Math.round((i / total) * 100);
        el('mocap-progress-label').textContent = 'Frame ' + (i + 1) + ' / ' + (total + 1) + ' · ' + found + ' with a body';
        if (i % 10 === 0) await new Promise(r => setTimeout(r, 0)); // keep UI alive
      }
      setStatus('Done: ' + frames.length + ' frames, ' + found + ' with a detected body. Press “Process & preview” — or adjust settings below and preview.');
      el('mocap-process').disabled = !frames.length;
      if (!found) setStatus('No person was detected in this video. Try a clearer, well-lit clip where the whole body is visible.', true);
    } catch (e) {
      setStatus('Processing failed: ' + e.message, true);
    } finally {
      processing = false;
      el('mocap-upload-process').disabled = false; el('mocap-upload-cancel').disabled = true;
    }
  }

  // ── Preview + key building ──
  function readSettings() {
    return {
      sampleFps: clamp(parseFloat(el('mocap-fps').value) || 15, 1, 60),
      smoothing: clamp(parseFloat(el('mocap-smoothing').value) || 0, 0, 0.3),
      movementScale: clamp(parseFloat(el('mocap-scale').value) || 1, 0.1, 3),
      horizontalSensitivity: clamp(parseFloat(el('mocap-hsens').value) || 1, 0, 3),
      mirror: el('mocap-mirror').checked,
      yawOffsetDeg: clamp(parseFloat(el('mocap-yaw').value) || 0, -180, 180),
      includeYaw: el('mocap-yaw-on').checked,
      includeRoot: el('mocap-root-on').checked,
      reduce: el('mocap-reduce').checked,
      aspect: (upVideo.videoWidth && upVideo.videoHeight) ? upVideo.videoWidth / upVideo.videoHeight : (video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9),
    };
  }
  function rebuildPreview() {
    if (!frames.length) return;
    const target = deps.getTargets().find(r => r.id === el('mocap-target').value) || deps.getTargets()[0];
    if (!target) { setStatus('Add a Bob character to the scene first, then capture motion.', true); return; }
    previewRecord = target;
    previewBase = deps.previewBase(target);
    const s = readSettings();
    const { keys, stats } = buildMotionKeys(frames, { ...s, startTime: 0, basePosition: previewBase.position });
    previewKeys = keys; previewStats = stats;
    el('mocap-quality').textContent =
      'Detection ' + Math.round(stats.detectionRate * 100) + '% · quality ' + Math.round(stats.avgQuality * 100) +
      '% · ' + stats.duration.toFixed(1) + ' s · ' + stats.keys + ' keys at ' + s.sampleFps + ' fps';
    if (stats.detectionRate < 0.5) setWarn('⚠ Tracking quality is low (' + Math.round(stats.detectionRate * 100) + '% of frames). The result may be rough — try better lighting or a closer camera.');
    else setWarn('');
    previewWrap.hidden = false; insertWrap.hidden = false;
    scrub.max = Math.max(0.01, stats.duration); scrub.value = 0; previewT = 0;
    showPreviewAt(0);
    el('mocap-insert-summary').textContent = stats.keys + ' keys · ' + stats.duration.toFixed(1) + ' s';
  }
  function showPreviewAt(t) {
    if (!previewKeys.length || !previewRecord) return;
    const s = samplePose(previewKeys, t);
    if (!s) return;
    deps.previewSample(previewRecord, { pose: s.pose, position: s.position, rotation: s.rotation });
    previewTime.textContent = t.toFixed(2) + ' / ' + previewStats.duration.toFixed(2) + ' s';
  }
  function previewLoop(now) {
    if (!previewPlaying) return;
    previewRaf = requestAnimationFrame(previewLoop);
    const dt = Math.min(0.1, (now - previewLast) / 1000); previewLast = now;
    previewT += dt;
    if (previewT >= previewStats.duration) { previewT = previewStats.duration; setPreviewPlaying(false); }
    scrub.value = previewT;
    showPreviewAt(previewT);
  }
  function setPreviewPlaying(on) {
    previewPlaying = on;
    el('mocap-preview-play').textContent = on ? 'Pause' : 'Play';
    if (on) { previewLast = performance.now(); previewRaf = requestAnimationFrame(previewLoop); }
    else cancelAnimationFrame(previewRaf);
  }
  function endPreview() {
    setPreviewPlaying(false);
    if (previewRecord) deps.previewSample(previewRecord, null);
    previewRecord = null; previewKeys = [];
    previewWrap.hidden = true; insertWrap.hidden = true;
  }
  function discardCapture() {
    frames = []; endPreview();
    el('mocap-process').disabled = true;
    setStatus('Capture discarded. Record again or upload another video.');
  }

  // ── Insert into the real timeline ──
  function insertCapture() {
    if (!previewKeys.length || !previewRecord) return;
    const mode = el('mocap-insert-mode').value;
    let start = clamp(parseFloat(el('mocap-start').value) || 0, 0, 60);
    let replace = false, range = null;
    if (mode === 'append') {
      // Start right after the last existing key; putKey overwrites only the
      // boundary key if one lands exactly on it. Nothing else is removed.
      start = deps.lastKeyTime(previewRecord);
    } else if (mode === 'replace') {
      replace = true; range = [start, start + previewStats.duration];
    } else {
      start = deps.timeline.time;
    }
    const shifted = previewKeys.map(k => ({ ...k, time: start + k.time }));
    if (replace) {
      const existing = deps.countKeysInRange(previewRecord, range[0], range[1]);
      if (existing > 0 && !confirm('This will replace ' + existing + ' existing key(s) on ' + previewRecord.name + ' between ' + range[0].toFixed(2) + ' s and ' + range[1].toFixed(2) + ' s.\n\nContinue? (One Undo restores them.)')) return;
    }
    const res = deps.insertKeys(previewRecord, shifted, { replace, range });
    deps.focusRecord(previewRecord, start);
    deps.toast('Motion capture inserted: ' + res.inserted + ' keys on ' + previewRecord.name + ' from ' + start.toFixed(2) + ' s' + (res.removed ? ' · ' + res.removed + ' replaced' : '') + '. Scrub the timeline or press Play — keys are fully editable. Undo restores the previous animation.');
    setStatus('Inserted ✓ — the movement is now normal editable keyframes on the timeline. Close this panel to edit them.');
  }

  // ── Wiring ──
  function switchTab(which) {
    el('mocap-tab-webcam').classList.toggle('active', which === 'webcam');
    el('mocap-tab-upload').classList.toggle('active', which === 'upload');
    el('mocap-pane-webcam').hidden = which !== 'webcam';
    el('mocap-pane-upload').hidden = which !== 'upload';
  }
  el('mocap-tab-webcam').onclick = () => switchTab('webcam');
  el('mocap-tab-upload').onclick = () => switchTab('upload');
  el('mocap-cam-enable').onclick = enableCamera;
  el('mocap-rec-start').onclick = startRecording;
  el('mocap-rec-pause').onclick = togglePause;
  el('mocap-rec-stop').onclick = stopRecording;
  el('mocap-process').onclick = rebuildPreview;
  el('mocap-upload-process').onclick = processUpload;
  el('mocap-upload-cancel').onclick = () => { cancelProcessing = true; };
  el('mocap-discard').onclick = discardCapture;
  el('mocap-insert').onclick = insertCapture;
  el('mocap-preview-play').onclick = () => setPreviewPlaying(!previewPlaying);
  el('mocap-preview-restart').onclick = () => { previewT = 0; scrub.value = 0; showPreviewAt(0); };
  scrub.oninput = () => { previewT = parseFloat(scrub.value) || 0; showPreviewAt(previewT); };
  for (const id of ['mocap-fps', 'mocap-smoothing', 'mocap-scale', 'mocap-hsens', 'mocap-mirror', 'mocap-yaw', 'mocap-yaw-on', 'mocap-root-on', 'mocap-reduce']) {
    el(id).addEventListener('change', () => { if (frames.length) rebuildPreview(); });
  }
  const fileInput = el('mocap-file');
  el('mocap-choose').onclick = () => fileInput.click();
  fileInput.onchange = () => loadUpload(fileInput.files[0]);
  const drop = el('mocap-drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); loadUpload(e.dataTransfer.files[0]); });
  el('mocap-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    stopCamera(); endPreview();
    cancelProcessing = true;
    if (uploadUrl) { URL.revokeObjectURL(uploadUrl); uploadUrl = null; }
    upVideo.removeAttribute('src'); upVideo.load();
  });
  function populate() {
    const sel = el('mocap-target');
    const targets = deps.getTargets();
    sel.replaceChildren(...targets.map(r => { const o = document.createElement('option'); o.value = r.id; o.textContent = r.name; return o; }));
    const selRec = deps.getSelected();
    if (selRec && targets.includes(selRec)) sel.value = selRec.id;
    el('mocap-start').value = deps.timeline.time.toFixed(2);
    el('mocap-rec-start').disabled = true;
    setStatus('Choose Webcam or Upload Video. Tracking runs locally in your browser — nothing is uploaded.');
  }
  return { open: () => { populate(); dialog.showModal(); } };
}
