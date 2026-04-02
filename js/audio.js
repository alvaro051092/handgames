/* ═══════════════════════════════════════════════════════════
   audio.js — Web Audio API, zero external files.
   Exposes window.GameAudio = { ... }
═══════════════════════════════════════════════════════════ */
window.GameAudio = (() => {
  let ctx  = null;
  let muted = false;

  function context() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq = 440, type = 'sine', dur = 0.12, gain = 0.18, delay = 0 } = {}) {
    if (muted) return;
    try {
      const c   = context();
      const osc = c.createOscillator();
      const g   = c.createGain();
      osc.connect(g);
      g.connect(c.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime + delay);
      g.gain.setValueAtTime(gain, c.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
      osc.start(c.currentTime + delay);
      osc.stop(c.currentTime + delay + dur + 0.05);
    } catch (_) {}
  }

  /* ── Sound effects ── */

  function playTick() {
    tone({ freq: 520, type: 'triangle', dur: 0.07, gain: 0.12 });
  }

  function playWin() {
    tone({ freq: 523, dur: 0.1,  gain: 0.18 });
    tone({ freq: 659, dur: 0.1,  gain: 0.18, delay: 0.10 });
    tone({ freq: 784, dur: 0.18, gain: 0.22, delay: 0.20 });
  }

  function playDraw() {
    tone({ freq: 400, type: 'triangle', dur: 0.18, gain: 0.14 });
    tone({ freq: 350, type: 'triangle', dur: 0.18, gain: 0.14, delay: 0.12 });
  }

  function playFanfare() {
    [
      { freq: 523,  delay: 0,    dur: 0.14 },
      { freq: 659,  delay: 0.14, dur: 0.14 },
      { freq: 784,  delay: 0.28, dur: 0.14 },
      { freq: 1047, delay: 0.42, dur: 0.35, gain: 0.28 },
    ].forEach(p => tone({ ...p, gain: p.gain ?? 0.22 }));
  }

  function playGameDraw() {
    tone({ freq: 440, type: 'triangle', dur: 0.25, gain: 0.14 });
    tone({ freq: 330, type: 'triangle', dur: 0.25, gain: 0.14, delay: 0.18 });
  }

  /* ── Mute control ── */
  function toggle() { muted = !muted; return muted; }
  function isMuted() { return muted; }

  return { playTick, playWin, playDraw, playFanfare, playGameDraw, toggle, isMuted };
})();
