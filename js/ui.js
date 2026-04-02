/* ═══════════════════════════════════════════════════════════
   ui.js — DOM orchestrator & animation coordinator.
   Depends on: window.Game, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
  /* ──────────── State ──────────── */
  let transitioning = false;
  let pickingPlayer = 'p1';

  /* ──────────── Utilities ──────────── */

  const $ = id => document.getElementById(id);

  /**
   * Wait for animationend on exactly `el` (not bubbled from children).
   * Falls back to timeout to prevent hanging.
   */
  function onceAnim(el, timeout = 500) {
    return new Promise(resolve => {
      const t = setTimeout(resolve, timeout);
      function handler(e) {
        if (e.target !== el) return;           // ignore bubbled child events
        clearTimeout(t);
        el.removeEventListener('animationend', handler);
        resolve();
      }
      el.addEventListener('animationend', handler);
    });
  }

  /** Reset + restart a CSS class-based animation on el. */
  function reflow(el) { void el.offsetWidth; }

  /** Set a score-roll element to a value without animation. */
  function setScoreDigit(rollEl, value) {
    rollEl.innerHTML = `<span class="score-digit">${value}</span>`;
  }

  /**
   * Animate a score-roll from its current value to newValue.
   * Old digit rolls out upward, new digit rolls in from below.
   */
  // Duration of rollOut/rollIn animations in ms — must match --dur-normal in tokens.css
  const ROLL_DUR  = 300;
  const PULSE_DUR = 500; // --dur-slow

  function animateScore(rollEl, newValue) {
    const cur = rollEl.querySelector('.score-digit');
    if (!cur) { setScoreDigit(rollEl, newValue); return; }
    if (cur.textContent === String(newValue)) { pulse(rollEl); return; }

    cur.classList.add('roll-out');

    const next = document.createElement('span');
    next.className = 'score-digit roll-in';
    next.textContent = newValue;
    rollEl.appendChild(next);

    // Use setTimeout instead of animationend — Chrome doesn't fire animationend
    // reliably on position:absolute children inside certain compositing contexts.
    setTimeout(() => {
      cur.remove();
      next.classList.remove('roll-in');
      pulse(rollEl);
    }, ROLL_DUR + 20); // +20ms buffer
  }

  /** Pulse a score-roll container (scale bounce). */
  function pulse(el) {
    el.classList.remove('pulse');
    reflow(el);
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), PULSE_DUR + 20);
  }

  /** Typewriter effect: splits text into animated spans. */
  function typewriter(containerEl, text) {
    containerEl.innerHTML = '';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      containerEl.textContent = text; return;
    }
    [...text].forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'tw-char';
      span.textContent = ch === ' ' ? '\u00a0' : ch;
      span.style.animationDelay = `${i * 45}ms`;
      containerEl.appendChild(span);
    });
  }

  /** Count-up animation. */
  function countUp(el, end, duration = 900) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = end; return;
    }
    const start = performance.now();
    (function frame(now) {
      const p = Math.min((now - start) / duration, 1);
      el.textContent = Math.round(p * p * end);
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = end;
    })(start);
  }

  /** Generate confetti pieces in #confetti-container. */
  function spawnConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const container = $('confetti-container');
    container.innerHTML = '';
    const COLORS = ['#7c3aed','#a855f7','#0ea5e9','#22c55e','#f59e0b','#ef4444','#ec4899','#f97316'];
    for (let i = 0; i < 35; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      const w = 6 + Math.random() * 7;
      p.style.cssText = [
        `left:${(Math.random()*100).toFixed(1)}%`,
        `width:${w.toFixed(1)}px`,
        `height:${(w*(1.4+Math.random())).toFixed(1)}px`,
        `background:${COLORS[Math.floor(Math.random()*COLORS.length)]}`,
        `animation-delay:${(Math.random()*0.9).toFixed(2)}s`,
        `animation-duration:${(0.9+Math.random()*0.7).toFixed(2)}s`,
        `transform:rotate(${Math.floor(Math.random()*360)}deg)`,
        `border-radius:${Math.random()>.5?'50%':'3px'}`,
      ].join(';');
      container.appendChild(p);
    }
    setTimeout(() => { container.innerHTML = ''; }, 2800);
  }

  /* ──────────── Screen Transitions ──────────── */

  const screens = {
    setup:    $('screen-setup'),
    pick:     $('screen-pick'),
    handoff:  $('screen-handoff'),
    result:   $('screen-result'),
    gameover: $('screen-gameover'),
  };

  function activeScreen() { return document.querySelector('.screen.active'); }

  /** Slide both screens simultaneously; resolves after both animations finish. */
  async function goTo(nextId, direction = 'fwd') {
    if (transitioning) return;
    transitioning = true;

    const cur  = activeScreen();
    const next = screens[nextId];
    if (!cur || !next || cur === next) { transitioning = false; return; }

    const dir = `dir-${direction}`;
    cur.classList.add('s-exiting', dir);
    cur.classList.remove('active');
    next.classList.add('active', 's-entering', dir);

    await Promise.all([onceAnim(cur, 500), onceAnim(next, 500)]);

    cur.classList.remove('s-exiting', dir);
    next.classList.remove('s-entering', dir);
    transitioning = false;
  }

  /** Curtain drops → instant swap cb() → curtain rises. */
  async function curtainWrap(cb) {
    const curtain = $('curtain');
    curtain.classList.remove('drop', 'rise');
    reflow(curtain);
    curtain.classList.add('drop');
    await onceAnim(curtain, 600);

    cb();

    curtain.classList.remove('drop');
    reflow(curtain);
    curtain.classList.add('rise');
    await onceAnim(curtain, 600);
    curtain.classList.remove('rise');
  }

  /* ──────────── Screen Populators ──────────── */

  function populatePick(state) {
    const isP1   = pickingPlayer === 'p1';
    const player = isP1 ? state.players.p1 : state.players.p2;

    $('sb-name-p1').textContent = state.players.p1;
    $('sb-name-p2').textContent = state.players.p2;
    setScoreDigit($('roll-p1'), state.scores.p1);
    setScoreDigit($('roll-p2'), state.scores.p2);
    $('pick-round-badge').textContent =
      state.mode === 'best-of-3' ? `Ronda ${state.round}` : 'Intento único';

    $('turn-name').textContent   = player;
    $('turn-avatar').textContent = player.substring(0, 2).toUpperCase();

    $('sb-p1-block').classList.toggle('active-turn',  isP1);
    $('sb-p2-block').classList.toggle('active-turn', !isP1);

    $('pick-buttons').querySelectorAll('.btn-pick').forEach(b => {
      b.disabled = false;
      b.classList.remove('selected', 'bouncing');
    });
  }

  function populateHandoff(state) {
    $('handoff-player').textContent     = state.players.p2;
    $('handoff-ready-name').textContent = state.players.p2;
  }

  function populateResult(state) {
    const { players, scores, round, mode, picks, roundWinner, matchWinner } = state;
    const meta = Game.picksMeta();

    // Scoreboard — show pre-round scores; animateResult will roll them to final
    const preP1 = scores.p1 - (roundWinner === 'p1' ? 1 : 0);
    const preP2 = scores.p2 - (roundWinner === 'p2' ? 1 : 0);
    $('res-name-p1').textContent = players.p1;
    $('res-name-p2').textContent = players.p2;
    setScoreDigit($('res-roll-p1'), preP1);
    setScoreDigit($('res-roll-p2'), preP2);
    $('res-round-badge').textContent =
      mode === 'best-of-3' ? `Ronda ${round}` : 'Intento único';

    // Picks — hidden initially; animated in by animateResult
    ['res-p1-block', 'res-p2-block'].forEach(id => {
      const el = $(id);
      el.classList.remove('enter-left', 'enter-right', 'loser');
      el.style.opacity = '0';
    });

    $('res-p1-name').textContent  = players.p1;
    $('res-p1-emoji').textContent = meta[picks.p1].emoji;
    $('res-p1-label').textContent = meta[picks.p1].label;
    $('res-p2-name').textContent  = players.p2;
    $('res-p2-emoji').textContent = meta[picks.p2].emoji;
    $('res-p2-label').textContent = meta[picks.p2].label;

    // Banner — hidden initially
    const banner = $('result-banner');
    banner.className   = 'result-banner';
    banner.textContent = '';

    // Next-round button only visible when match continues
    $('btn-next-round').style.display = matchWinner === null ? 'flex' : 'none';
  }

  async function animateResult(state) {
    const { roundWinner, matchWinner, players, scores } = state;

    // 1. Reveal picks from opposite sides
    const p1block = $('res-p1-block');
    const p2block = $('res-p2-block');
    p1block.style.opacity = '';
    p2block.style.opacity = '';
    p1block.classList.add('enter-left');
    p2block.classList.add('enter-right');
    await Promise.all([onceAnim(p1block, 700), onceAnim(p2block, 700)]);

    // 2. Dramatic pause
    await new Promise(r => setTimeout(r, 300));

    // 3. Score rolls to updated value (roll from pre-round → post-round)
    if (roundWinner === 'p1') animateScore($('res-roll-p1'), scores.p1);
    if (roundWinner === 'p2') animateScore($('res-roll-p2'), scores.p2);

    // 4. Banner reveal
    const banner = $('result-banner');
    if (roundWinner === 'draw') {
      banner.textContent = '🤝 ¡Empate! Nadie anota punto.';
      banner.classList.add('banner-draw', 'show');
      GameAudio.playDraw();
    } else {
      banner.textContent = `🎉 ¡${players[roundWinner]} gana la ronda!`;
      banner.classList.add('banner-win', 'show');
      GameAudio.playWin();
    }

    // 5. Loser fades out
    if (roundWinner === 'p1') p2block.classList.add('loser');
    if (roundWinner === 'p2') p1block.classList.add('loser');

    // 6. Auto-advance to game over after brief celebration
    if (matchWinner !== null) {
      setTimeout(() => {
        populateGameover(state);
        goTo('gameover', 'fwd');
      }, 1700);
    }
  }

  function populateGameover(state) {
    const { players, scores, matchWinner } = state;

    if (matchWinner === 'draw') {
      $('go-trophy').textContent       = '🤝';
      $('go-trophy').style.animation   = 'shakeX 0.6s ease-in-out';
      typewriter($('go-winner-name'), '¡Empate!');
      $('go-title-suffix').textContent = '';
      $('go-subtitle').textContent     = 'Ningún jugador pudo imponerse.';
      GameAudio.playGameDraw();
    } else {
      $('go-trophy').textContent       = '🏆';
      $('go-trophy').style.animation   = '';
      typewriter($('go-winner-name'), players[matchWinner]);
      const loser = matchWinner === 'p1' ? players.p2 : players.p1;
      $('go-title-suffix').textContent = ' gana!';
      $('go-subtitle').textContent     = `${loser} tendrá que practicar más. ¿Revancha?`;
      spawnConfetti();
      GameAudio.playFanfare();
    }

    $('go-name-p1').textContent = players.p1;
    $('go-name-p2').textContent = players.p2;
    countUp($('go-val-p1'), scores.p1);
    countUp($('go-val-p2'), scores.p2);
  }

  /* ──────────── Event Listeners ──────────── */

  $('btn-start').addEventListener('click', () => {
    const p1   = $('name-p1').value.trim();
    const p2   = $('name-p2').value.trim();
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const state = Game.configure(p1, p2, mode);
    pickingPlayer = 'p1';
    populatePick(state);
    goTo('pick', 'fwd');
    GameAudio.playTick();
  });

  $('pick-buttons').addEventListener('click', async e => {
    const btn = e.target.closest('.btn-pick');
    if (!btn || btn.disabled || transitioning) return;

    const pick = btn.dataset.pick;
    $('pick-buttons').querySelectorAll('.btn-pick').forEach(b => b.disabled = true);
    btn.classList.add('selected', 'bouncing');
    GameAudio.playTick();

    await onceAnim(btn, 600);
    btn.classList.remove('bouncing');

    if (pickingPlayer === 'p1') {
      const state = Game.p1Pick(pick);
      pickingPlayer = 'p2';
      await curtainWrap(() => {
        populateHandoff(state);
        activeScreen().classList.remove('active');
        screens.handoff.classList.add('active');
      });
    } else {
      pickingPlayer = 'p1';
      const state = Game.p2Pick(pick);
      populateResult(state);
      await goTo('result', 'fwd');
      animateResult(state);  // intentionally not awaited — runs in background
    }
  });

  $('btn-handoff-ready').addEventListener('click', () => {
    if (transitioning) return;
    const state = Game.getState();
    populatePick(state);
    goTo('pick', 'fwd');
    GameAudio.playTick();
  });

  $('btn-next-round').addEventListener('click', () => {
    if (transitioning) return;
    pickingPlayer = 'p1';
    const state = Game.nextRound();
    populatePick(state);
    goTo('pick', 'fwd');
  });

  $('btn-revenge').addEventListener('click', () => {
    if (transitioning) return;
    pickingPlayer = 'p1';
    const state = Game.revenge();
    populatePick(state);
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-result').addEventListener('click', () => {
    if (transitioning) return;
    Game.newGame();
    $('name-p1').value = '';
    $('name-p2').value = '';
    goTo('setup', 'back');
  });

  $('btn-revenge-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    pickingPlayer = 'p1';
    const state = Game.revenge();
    populatePick(state);
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    Game.newGame();
    $('name-p1').value = '';
    $('name-p2').value = '';
    goTo('setup', 'back');
  });

  $('btn-mute').addEventListener('click', () => {
    const muted = GameAudio.toggle();
    $('btn-mute').textContent = muted ? '🔇' : '🔊';
    $('btn-mute').setAttribute('aria-label', muted ? 'Activar audio' : 'Silenciar audio');
    $('btn-mute').title = muted ? 'Activar audio' : 'Silenciar audio';
  });

})();
