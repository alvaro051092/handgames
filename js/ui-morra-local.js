/* ═══════════════════════════════════════════════════════════
   ui-morra-local.js — DOM orchestrator for 2-player local mode (Morra).
   Depends on: window.GameMorraLocal, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
  /* ──────────── State ──────────── */
  let transitioning  = false;
  let pendingFingers = null;
  let pendingGuess   = null;
  let currentPicker  = null;   // 'p1' | 'p2'

  /* ──────────── Utilities ──────────── */

  const $ = id => document.getElementById(id);

  function onceAnim(el, timeout = 500) {
    return new Promise(resolve => {
      const t = setTimeout(resolve, timeout);
      function handler(e) {
        if (e.target !== el) return;
        clearTimeout(t);
        el.removeEventListener('animationend', handler);
        resolve();
      }
      el.addEventListener('animationend', handler);
    });
  }

  function reflow(el) { void el.offsetWidth; }

  function setScoreDigit(rollEl, value) {
    rollEl.innerHTML = `<span class="score-digit">${value}</span>`;
  }

  const ROLL_DUR  = 300;
  const PULSE_DUR = 500;

  function animateScore(rollEl, newValue) {
    const cur = rollEl.querySelector('.score-digit');
    if (!cur) { setScoreDigit(rollEl, newValue); return; }
    if (cur.textContent === String(newValue)) { pulse(rollEl); return; }
    cur.classList.add('roll-out');
    const next = document.createElement('span');
    next.className   = 'score-digit roll-in';
    next.textContent = newValue;
    rollEl.appendChild(next);
    setTimeout(() => { cur.remove(); next.classList.remove('roll-in'); pulse(rollEl); }, ROLL_DUR + 20);
  }

  function pulse(el) {
    el.classList.remove('pulse');
    reflow(el);
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), PULSE_DUR + 20);
  }

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

  /* ──────────── Pick Screen ──────────── */

  function resetPickSelections() {
    pendingFingers = null;
    pendingGuess   = null;
    $('finger-buttons').querySelectorAll('.btn-finger').forEach(b => {
      b.classList.remove('selected');
      b.disabled = false;
    });
    $('guess-buttons').querySelectorAll('.btn-guess').forEach(b => {
      b.classList.remove('selected');
      b.disabled = false;
    });
    $('btn-confirm').disabled = true;
  }

  function populatePick(state, picker) {
    currentPicker = picker;
    const name = picker === 'p1' ? state.players.p1 : state.players.p2;
    $('pick-turn-name').textContent  = name;
    $('sb-name-p1').textContent      = state.players.p1;
    $('sb-name-p2').textContent      = state.players.p2;
    setScoreDigit($('roll-p1'), state.scores.p1);
    setScoreDigit($('roll-p2'), state.scores.p2);
    $('pick-round-badge').textContent =
      state.mode === 'best-of-3' ? `Ronda ${state.round}` : 'Intento único';
    resetPickSelections();
  }

  /* ──────────── Handoff Screen ──────────── */

  function populateHandoff(state) {
    $('handoff-next-name').textContent = state.players.p2;
  }

  /* ──────────── Result Screen ──────────── */

  function populateResult(state) {
    const { players, scores, round, mode, picks, roundWinner, matchWinner } = state;

    const preP1 = scores.p1 - (roundWinner === 'p1' ? 1 : 0);
    const preP2 = scores.p2 - (roundWinner === 'p2' ? 1 : 0);
    $('res-name-p1').textContent = players.p1;
    $('res-name-p2').textContent = players.p2;
    setScoreDigit($('res-roll-p1'), preP1);
    setScoreDigit($('res-roll-p2'), preP2);
    $('res-round-badge').textContent =
      mode === 'best-of-3' ? `Ronda ${round}` : 'Intento único';

    // P1 block
    const p1Block = $('res-p1-block');
    p1Block.classList.remove('enter-left', 'loser');
    $('res-p1-name').textContent  = players.p1;
    $('res-p1-num').textContent   = picks.p1Fingers;
    $('res-p1-guess').textContent = `apostó: ${picks.p1Guess}`;

    // P2 block
    const p2Block = $('res-p2-block');
    p2Block.classList.remove('enter-right', 'loser');
    $('res-p2-name').textContent  = players.p2;
    $('res-p2-num').textContent   = picks.p2Fingers;
    $('res-p2-guess').textContent = `apostó: ${picks.p2Guess}`;

    // Total
    $('res-total-value').textContent = `${picks.p1Fingers} + ${picks.p2Fingers} = ${state.total}`;

    // Banner
    const banner = $('result-banner');
    banner.className   = 'result-banner';
    banner.textContent = '';

    $('btn-next-round').style.display  = (roundWinner !== 'draw' && matchWinner === null) ? 'flex' : 'none';
    $('btn-retry-round').style.display = roundWinner === 'draw' ? 'flex' : 'none';
  }

  function animateResult(state) {
    const { picks, total, roundWinner } = state;
    const p1Block = $('res-p1-block');
    const p2Block = $('res-p2-block');

    p1Block.classList.add('enter-left');
    p2Block.classList.add('enter-right');

    setTimeout(() => {
      if (roundWinner === 'p1') animateScore($('res-roll-p1'), state.scores.p1);
      if (roundWinner === 'p2') animateScore($('res-roll-p2'), state.scores.p2);

      const banner = $('result-banner');
      if (roundWinner === 'p1') {
        banner.textContent = `✅ ¡${state.players.p1} acertó! La suma era ${total}`;
        banner.classList.add('banner-win', 'show');
        GameAudio.playWin();
        p2Block.classList.add('loser');
      } else if (roundWinner === 'p2') {
        banner.textContent = `✅ ¡${state.players.p2} acertó! La suma era ${total}`;
        banner.classList.add('banner-win', 'show');
        GameAudio.playWin();
        p1Block.classList.add('loser');
      } else if (picks.p1Guess === total && picks.p2Guess === total) {
        banner.textContent = `🤝 ¡Empate! Los dos acertaron — suma ${total}`;
        banner.classList.add('banner-draw', 'show');
        GameAudio.playDraw();
      } else {
        banner.textContent = `🤝 ¡Empate! Nadie acertó — suma ${total}`;
        banner.classList.add('banner-draw', 'show');
        GameAudio.playDraw();
      }

      if (state.matchWinner !== null) {
        setTimeout(() => {
          populateGameover(state);
          goTo('gameover', 'fwd');
        }, 1700);
      }
    }, 600);
  }

  /* ──────────── Game Over Screen ──────────── */

  function populateGameover(state) {
    const { players, scores, matchWinner } = state;

    if (matchWinner === 'p1') {
      $('go-trophy').textContent     = '🏆';
      typewriter($('go-winner-name'), players.p1);
      $('go-title-suffix').textContent = ' gana!';
      $('go-subtitle').textContent     = `¡Dedos certeros! ${players.p2} tendrá su revancha.`;
      spawnConfetti();
      GameAudio.playFanfare();
    } else if (matchWinner === 'p2') {
      $('go-trophy').textContent     = '🏆';
      typewriter($('go-winner-name'), players.p2);
      $('go-title-suffix').textContent = ' gana!';
      $('go-subtitle').textContent     = `¡Dedos certeros! ${players.p1} tendrá su revancha.`;
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
    const p1 = $('name-p1').value.trim();
    const p2 = $('name-p2').value.trim();
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const state = GameMorraLocal.configure(p1, p2, mode);
    populatePick(state, 'p1');
    goTo('pick', 'fwd');
    GameAudio.playTick();
  });

  // Finger button selection
  $('finger-buttons').addEventListener('click', e => {
    const btn = e.target.closest('.btn-finger');
    if (!btn || transitioning) return;
    $('finger-buttons').querySelectorAll('.btn-finger').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    pendingFingers = parseInt(btn.dataset.f, 10);
    $('btn-confirm').disabled = pendingFingers === null || pendingGuess === null;
    GameAudio.playTick();
  });

  // Guess button selection
  $('guess-buttons').addEventListener('click', e => {
    const btn = e.target.closest('.btn-guess');
    if (!btn || transitioning) return;
    $('guess-buttons').querySelectorAll('.btn-guess').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    pendingGuess = parseInt(btn.dataset.g, 10);
    $('btn-confirm').disabled = pendingFingers === null || pendingGuess === null;
    GameAudio.playTick();
  });

  // Confirm pick
  $('btn-confirm').addEventListener('click', async () => {
    if (transitioning || pendingFingers === null || pendingGuess === null) return;
    $('finger-buttons').querySelectorAll('.btn-finger').forEach(b => b.disabled = true);
    $('guess-buttons').querySelectorAll('.btn-guess').forEach(b => b.disabled = true);
    $('btn-confirm').disabled = true;
    GameAudio.playTick();

    if (currentPicker === 'p1') {
      const state = GameMorraLocal.p1Pick(pendingFingers, pendingGuess);
      populateHandoff(state);
      await goTo('handoff', 'fwd');
    } else {
      const state = GameMorraLocal.p2Pick(pendingFingers, pendingGuess);
      populateResult(state);
      await goTo('result', 'fwd');
      animateResult(state);
    }
  });

  // Handoff → P2 picks
  $('btn-handoff-ready').addEventListener('click', () => {
    if (transitioning) return;
    const state = GameMorraLocal.getState();
    populatePick(state, 'p2');
    goTo('pick', 'fwd');
    GameAudio.playTick();
  });

  $('btn-next-round').addEventListener('click', () => {
    if (transitioning) return;
    const state = GameMorraLocal.nextRound();
    populatePick(state, 'p1');
    goTo('pick', 'fwd');
  });

  $('btn-retry-round').addEventListener('click', () => {
    if (transitioning) return;
    const state = GameMorraLocal.retryRound();
    populatePick(state, 'p1');
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-revenge').addEventListener('click', () => {
    if (transitioning) return;
    const state = GameMorraLocal.revenge();
    populatePick(state, 'p1');
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-result').addEventListener('click', () => {
    if (transitioning) return;
    GameMorraLocal.newGame();
    $('name-p1').value = '';
    $('name-p2').value = '';
    goTo('setup', 'back');
  });

  $('btn-revenge-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    const state = GameMorraLocal.revenge();
    populatePick(state, 'p1');
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    GameMorraLocal.newGame();
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
