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
    videoEl   = video;
    overlayEl = overlayCanvas;
    octx      = overlayCanvas.getContext('2d');

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise(resolve => { video.onloadedmetadata = resolve; });
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

  function loop() {
    if (videoEl && videoEl.readyState >= 2 && handLandmarker) {
      const res = handLandmarker.detectForVideo(videoEl, performance.now());
      latestLandmarks = (res.landmarks && res.landmarks[0]) || null;
      drawSkeleton(latestLandmarks && !!classifyRPS(latestLandmarks));
    } else {
      latestLandmarks = null;
    }
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
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

  /* Runs a 3-2-1-¡YA! countdown, samples `classify(landmarks)` during the
     reveal window, and resolves the majority gesture.
     onTick(label) fires on each countdown step so callers can drive UI/audio. */
  async function captureWithCountdown({ classify = classifyRPS, revealMs = 450, onTick } = {}) {
    for (const label of ['3', '2', '1']) {
      if (onTick) onTick(label);
      await new Promise(r => setTimeout(r, 600));
    }
    if (onTick) onTick('¡YA!');
    const snapshot = snapshotSquare();

    const samples = [];
    const start = performance.now();
    while (performance.now() - start < revealMs) {
      if (latestLandmarks) {
        const g = classify(latestLandmarks);
        if (g) samples.push(g);
      }
      await new Promise(r => requestAnimationFrame(r));
    }
    if (onTick) onTick('');

    if (!samples.length) return { pick: null, snapshot };
    const counts = {};
    samples.forEach(s => { counts[s] = (counts[s] || 0) + 1; });
    const pick = Object.keys(counts).reduce((a, b) => (counts[a] >= counts[b] ? a : b));
    return { pick, snapshot };
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
    captureWithCountdown,
    isReady:        () => ready,
    hasDetection:   () => !!latestLandmarks,
  };
})();
