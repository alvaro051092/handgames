/* ═══════════════════════════════════════════════════════════
   camera-gesture.js — front-camera hand gesture detection.
   Loads MediaPipe HandLandmarker lazily (only when a game asks for
   camera mode), runs entirely client-side. No server round-trip,
   no video ever leaves the device.

   Public API: window.CameraGesture
═══════════════════════════════════════════════════════════ */
window.CameraGesture = (() => {
  const VISION_PKG   = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
  const VISION_WASM  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
  const MODEL_URL    = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

  let handLandmarker = null;
  let stream         = null;
  let rafId          = null;
  let videoEl        = null;
  let overlayEl      = null;
  let octx           = null;
  let latestLandmarks = null;
  let ready          = false;
  /* Every init()/stop() bumps this. An init() that finds the number changed
     after an await was cancelled by stop() (or superseded by a newer init()):
     it releases whatever it opened and returns without marking itself ready. */
  let generation     = 0;
  let cancelWait     = null;   // resolves the "waiting for video metadata" promise early

  /* ── Landmark geometry ── */

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  /* Returns [index, middle, ring, pinky] extended booleans (0-4 fingers). */
  function extendedFingers(lm) {
    const wrist = lm[0];
    const fingers = [
      { tip: lm[8],  mcp: lm[5]  },
      { tip: lm[12], mcp: lm[9]  },
      { tip: lm[16], mcp: lm[13] },
      { tip: lm[20], mcp: lm[17] },
    ];
    return fingers.map(f => dist(f.tip, wrist) > dist(f.mcp, wrist) * 1.25);
  }

  function countExtendedFingers(lm) {
    return extendedFingers(lm).filter(Boolean).length;
  }

  /* Thumb extends sideways, not upward — measured against the pinky
     knuckle rather than the wrist, which is the standard trick for it. */
  function isThumbExtended(lm) {
    const thumbTip = lm[4], thumbMcp = lm[2], pinkyMcp = lm[17];
    return dist(thumbTip, pinkyMcp) > dist(thumbMcp, pinkyMcp) * 1.1;
  }

  /* Full 0-5 count, thumb included — used by counting games (Morra, etc.) */
  function countFingers1to5(lm) {
    return countExtendedFingers(lm) + (isThumbExtended(lm) ? 1 : 0);
  }

  /* rock | paper | scissors | null (ambiguous — keep sampling) */
  function classifyRPS(lm) {
    const ext = extendedFingers(lm);
    const count = ext.filter(Boolean).length;
    if (count === 0) return 'rock';
    if (count >= 4)  return 'paper';
    if (count === 2 && ext[0] && ext[1]) return 'scissors';
    return null;
  }

  /* ── Camera + model lifecycle ── */

  async function init(video, overlayCanvas) {
    const gen = ++generation;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }   // never leave an older stream running
    videoEl   = video;
    overlayEl = overlayCanvas;
    octx      = overlayCanvas.getContext('2d');

    const s = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    const release = () => { s.getTracks().forEach(t => t.stop()); if (stream === s) stream = null; };

    /* From here the camera is ON. Any failure (metadata, model import, wasm,
       WebGL delegate) or a cancel must switch it OFF again before returning
       or throwing, otherwise the browser's camera indicator stays lit. */
    try {
      if (gen !== generation) { release(); return; }
      stream = s;
      video.srcObject = s;
      await new Promise(resolve => { cancelWait = resolve; video.onloadedmetadata = resolve; });
      cancelWait = null;
      if (gen !== generation) { release(); return; }
      overlayCanvas.width  = video.videoWidth;
      overlayCanvas.height = video.videoHeight;

      if (!handLandmarker) {
        const { HandLandmarker, FilesetResolver } = await import(VISION_PKG);
        const vision = await FilesetResolver.forVisionTasks(VISION_WASM);
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        });
        if (gen !== generation) { release(); return; }
      }
    } catch (err) {
      release();
      throw err;
    }

    ready = true;
    loop();
  }

  function drawSkeleton(detected) {
    if (!octx) return;
    octx.clearRect(0, 0, overlayEl.width, overlayEl.height);
    if (!latestLandmarks) return;
    octx.fillStyle = detected ? '#22c55e' : '#a855f7';
    for (const p of latestLandmarks) {
      octx.beginPath();
      octx.arc(p.x * overlayEl.width, p.y * overlayEl.height, 4, 0, Math.PI * 2);
      octx.fill();
    }
  }

  /* detectForVideo() runs the model synchronously on the main thread
     (~10-30 ms on phones). Doing that on every display frame (60-120 Hz)
     starves click handlers and hurts INP; ~20 detections/s is plenty for a
     gesture that has to be held steady for 3 s. */
  const DETECT_INTERVAL_MS = 50;
  let lastDetectAt = 0;

  function loop(now) {
    const t = typeof now === 'number' ? now : performance.now();
    if (videoEl && videoEl.readyState >= 2 && handLandmarker) {
      if (t - lastDetectAt >= DETECT_INTERVAL_MS) {
        lastDetectAt = t;
        const res = handLandmarker.detectForVideo(videoEl, performance.now());
        latestLandmarks = (res.landmarks && res.landmarks[0]) || null;
        drawSkeleton(latestLandmarks && !!classifyRPS(latestLandmarks));
      }
    } else {
      latestLandmarks = null;
    }
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    generation++;                       // cancels an init() that is still awaiting
    if (cancelWait) { cancelWait(); cancelWait = null; }
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    latestLandmarks = null;
    ready = false;
  }

  /* ── Capture ── */

  function snapshotSquare(size = 200) {
    if (!videoEl || !videoEl.videoWidth) return null;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    const side = Math.min(vw, vh);
    ctx.drawImage(videoEl, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL('image/jpeg', 0.85);
  }

  function classifyCurrent(classify = classifyRPS) {
    return latestLandmarks ? classify(latestLandmarks) : null;
  }

  function countFingersCurrent() {
    return latestLandmarks ? countFingers1to5(latestLandmarks) : null;
  }

  return {
    init,
    stop,
    classifyRPS,
    classifyCurrent,
    countExtendedFingers,
    countFingers1to5,
    countFingersCurrent,
    snapshotSquare,
    isReady:        () => ready,
    isActive:       () => !!(stream && stream.active),
    hasDetection:   () => !!latestLandmarks,
  };
})();
