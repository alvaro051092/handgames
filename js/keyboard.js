/* ═══════════════════════════════════════════════════════════
   keyboard.js — Keyboard shortcuts for game pages.

   Pick screens  : 1/2/3/4/5 trigger pick buttons in order
   Result screen : Enter / Space → "Siguiente ronda" or "Revancha"
   Gameover      : Enter → Revancha, N → Nueva partida
   Global        : M → toggle mute

   Auto-detects which pick buttons exist, so it works across
   RPS (3), RPSLS (5), Odd-Even (fingers 0-5), Morra, Chopsticks.

   Load order: after ui-*.js
═══════════════════════════════════════════════════════════ */
(() => {
  /* Only activate on game pages (not hub/index) */
  const path = window.location.pathname;
  const isGamePage = /\/(vs-cpu|local|battle)\.html$/.test(path);
  if (!isGamePage) return;

  /* Helper: find first visible, non-disabled button matching selector */
  function findBtn(selector) {
    const el = document.querySelector(selector);
    return el && !el.disabled && el.offsetParent !== null ? el : null;
  }

  /* Show a subtle keyboard hint on first keypress (once per session) */
  let hintShown = false;
  function showHint(key, label) {
    if (hintShown) return;
    hintShown = true;
    const tip = document.createElement('div');
    tip.setAttribute('aria-live', 'polite');
    tip.style.cssText = [
      'position:fixed','bottom:var(--sp-4,12px)','left:50%',
      'transform:translateX(-50%)',
      'background:rgba(124,58,237,.85)',
      'color:#fff','font-size:12px','font-weight:700',
      'padding:6px 14px','border-radius:999px',
      'pointer-events:none','z-index:9999',
      'opacity:0','transition:opacity .2s',
    ].join(';');
    tip.textContent = `⌨ ${key} → ${label}`;
    document.body.appendChild(tip);
    requestAnimationFrame(() => { tip.style.opacity = '1'; });
    setTimeout(() => {
      tip.style.opacity = '0';
      setTimeout(() => tip.remove(), 300);
    }, 2000);
  }

  /* ── Haptic feedback helper (mobile only, silent fail everywhere else) ── */
  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) {}
  }

  /* ── On desktop, show Enter-to-play hint on setup screen ── */
  (function showSetupHint() {
    const isTouchOnly = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (isTouchOnly) return; // desktop only
    const setup = document.getElementById('screen-setup');
    const startBtn = document.getElementById('btn-start');
    if (!setup || !startBtn) return;
    const tip = document.createElement('div');
    tip.style.cssText = [
      'position:absolute', 'bottom:-28px', 'left:50%',
      'transform:translateX(-50%)',
      'font-size:11px', 'font-weight:600',
      'color:var(--clr-text-subtle)',
      'white-space:nowrap', 'pointer-events:none',
      'opacity:0', 'transition:opacity .4s',
    ].join(';');
    tip.textContent = '⌨ Enter para jugar';
    // Translate based on lang
    const lang = (document.documentElement.lang || 'es').slice(0, 2);
    if (lang === 'en') tip.textContent = '⌨ Press Enter to play';
    if (lang === 'pt') tip.textContent = '⌨ Enter para jogar';
    startBtn.style.position = 'relative';
    startBtn.appendChild(tip);
    // Show after 1.5s if user hasn't interacted
    const timer = setTimeout(() => { tip.style.opacity = '1'; }, 1500);
    startBtn.addEventListener('click', () => { clearTimeout(timer); tip.remove(); }, { once: true });
    startBtn.addEventListener('pointerdown', () => { tip.style.opacity = '0'; }, { once: true });
  })();

  document.addEventListener('keydown', e => {
    /* Ignore when typing in an input */
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    /* Ignore with modifier keys */
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const key = e.key;

    /* ── M → mute toggle ── */
    if (key === 'm' || key === 'M') {
      const muteBtn = document.getElementById('btn-mute');
      if (muteBtn) { muteBtn.click(); return; }
    }

    /* ── Number keys → pick buttons ── */
    const numMatch = key.match(/^[1-6]$/);
    if (numMatch) {
      const idx    = parseInt(key, 10) - 1;
      const screen = document.querySelector('#screen-pick.active, #screen-game.active');
      if (!screen) return;
      const picks  = screen.querySelectorAll('.btn-pick:not([disabled])');
      if (picks[idx]) {
        e.preventDefault();
        vibrate(12);
        picks[idx].click();
        const label = picks[idx].querySelector('.pick-label')?.textContent
          || picks[idx].getAttribute('aria-label') || key;
        showHint(key, label);
      }
      return;
    }

    /* ── Enter / Space → primary action button ── */
    if (key === 'Enter' || key === ' ') {
      /* Prevent space from scrolling */
      if (key === ' ') e.preventDefault();

      /* Result screen: next round */
      const nextRound = findBtn('#btn-next-round');
      if (nextRound) { nextRound.click(); return; }

      /* Gameover: revenge */
      const revenge = findBtn('#btn-revenge-go');
      if (revenge) { revenge.click(); return; }

      /* Start game from setup */
      const start = findBtn('#btn-start');
      if (start) { start.click(); return; }
    }

    /* ── R → revancha ── */
    if (key === 'r' || key === 'R') {
      const revenge = findBtn('#btn-revenge') || findBtn('#btn-revenge-go');
      if (revenge) { e.preventDefault(); revenge.click(); }
    }

    /* ── Escape → nueva partida / back (only when no overlay is open) ── */
    if (key === 'Escape') {
      /* Bail out if any modal/overlay is visible (e.g. HTP dialog in RPSLS) */
      const openOverlay = document.querySelector('[role="dialog"]');
      if (openOverlay && getComputedStyle(openOverlay).opacity !== '0'
          && openOverlay.style.pointerEvents !== 'none') return;
      const newGame = findBtn('#btn-new-game-go') || findBtn('#btn-new-game-result');
      if (newGame) { newGame.click(); }
    }
  });
})();
