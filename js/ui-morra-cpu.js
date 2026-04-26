/* ═══════════════════════════════════════════════════════════
   ui-morra-cpu.js — DOM orchestrator for vs-CPU mode (Morra).
   Depends on: window.GameMorraCPU, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
  /* ──────────── State ──────────── */
  let transitioning    = false;
  let pendingFingers   = null;   // 1-5
  let pendingGuess     = null;   // 2-10

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

  function populatePick(state) {
    $('sb-name-player').textContent = state.player.name;
    $('sb-name-cpu').textContent    = 'CPU';
    setScoreDigit($('roll-player'), state.scores.player);
    setScoreDigit($('roll-cpu'),    state.scores.cpu);
    $('pick-round-badge').textContent =
      state.mode === 'best-of-3' ? `Ronda ${state.round}` : 'Intento único';
    resetPickSelections();
  }

  /* ──────────── Result Screen ──────────── */

  function populateResult(state) {
    const { player, scores, round, mode, picks, roundWinner, matchWinner } = state;

    const prePlayer = scores.player - (roundWinner === 'player' ? 1 : 0);
    const preCpu    = scores.cpu    - (roundWinner === 'cpu'    ? 1 : 0);
    $('res-name-player').textContent = player.name;
    $('res-name-cpu').textContent    = 'CPU';
    setScoreDigit($('res-roll-player'), prePlayer);
    setScoreDigit($('res-roll-cpu'),    preCpu);
    $('res-round-badge').textContent =
      mode === 'best-of-3' ? `Ronda ${round}` : 'Intento único';

    // Player block — hidden initially
    const playerBlock = $('res-player-block');
    playerBlock.classList.remove('enter-left', 'loser');
    playerBlock.style.opacity = '0';
    $('res-player-name').textContent  = player.name;
    $('res-player-num').textContent   = picks.playerFingers;
    $('res-player-guess').textContent = `apostó: ${picks.playerGuess}`;

    // CPU block — "?" initially
    const cpuBlock = $('res-cpu-block');
    cpuBlock.classList.remove('enter-right', 'loser');
    cpuBlock.style.opacity = '';
    const cpuNum = $('res-cpu-num');
    cpuNum.textContent = '?';
    cpuNum.classList.remove('cpu-flip-out', 'cpu-flip-in', 'fist-pulse');
    $('res-cpu-guess').textContent = '';

    // Countdown
    const countdown = $('cpu-countdown');
    countdown.textContent = '';
    countdown.classList.remove('countdown-pop');

    // Total — hidden
    const totalEl = $('res-total');
    totalEl.style.opacity = '0';
    $('res-total-value').textContent = '';

    // Banner — hidden
    const banner = $('result-banner');
    banner.className   = 'result-banner';
    banner.textContent = '';

    // Button visibility
    $('btn-next-round').style.display  = (roundWinner !== 'draw' && matchWinner === null) ? 'flex' : 'none';
    $('btn-retry-round').style.display = roundWinner === 'draw' ? 'flex' : 'none';
  }

  async function animateCPUReveal(state) {
    const { picks, total, roundWinner } = state;
    const playerBlock = $('res-player-block');
    const cpuBlock    = $('res-cpu-block');
    const cpuNum      = $('res-cpu-num');
    const countdown   = $('cpu-countdown');

    // 1. Player block slides in
    playerBlock.style.opacity = '';
    playerBlock.classList.add('enter-left');
    await onceAnim(playerBlock, 700);

    // 2. Countdown 3 → 2 → 1
    for (const label of ['3', '2', '1']) {
      countdown.textContent = label;
      countdown.classList.remove('countdown-pop');
      reflow(countdown);
      countdown.classList.add('countdown-pop');
      cpuNum.classList.remove('fist-pulse');
      reflow(cpuNum);
      cpuNum.classList.add('fist-pulse');
      await new Promise(r => setTimeout(r, 200));
    }

    // ¡YA!
    countdown.textContent = '¡YA!';
    countdown.classList.remove('countdown-pop');
    reflow(countdown);
    countdown.classList.add('countdown-pop');
    cpuNum.classList.remove('fist-pulse');

    // 3. CPU flip: ? → actual fingers
    cpuNum.classList.add('cpu-flip-out');
    await new Promise(r => setTimeout(r, 150));
    cpuNum.classList.remove('cpu-flip-out');
    cpuNum.textContent = picks.cpuFingers;
    $('res-cpu-guess').textContent = `apostó: ${picks.cpuGuess}`;
    reflow(cpuNum);
    cpuNum.classList.add('cpu-flip-in');
    await new Promise(r => setTimeout(r, 150));
    cpuNum.classList.remove('cpu-flip-in');

    // 4. Pause
    await new Promise(r => setTimeout(r, 300));

    // 5. Total fades in
    const totalEl = $('res-total');
    $('res-total-value').textContent = `${picks.playerFingers} + ${picks.cpuFingers} = ${total}`;
    totalEl.style.transition = 'opacity 0.3s';
    totalEl.style.opacity    = '1';

    await new Promise(r => setTimeout(r, 300));

    // 6. Score roll
    if (roundWinner === 'player') animateScore($('res-roll-player'), state.scores.player);
    if (roundWinner === 'cpu')    animateScore($('res-roll-cpu'),    state.scores.cpu);

    // 7. Banner
    const banner = $('result-banner');
    if (roundWinner === 'player') {
      banner.textContent = `✅ ¡Acertaste! La suma era ${total}`;
      banner.classList.add('banner-win', 'show');
      GameAudio.playWin();
    } else if (roundWinner === 'cpu') {
      banner.textContent = `❌ ¡La CPU acertó! La suma era ${total}`;
      banner.classList.add('banner-loss', 'show');
      GameAudio.playDraw();
    } else if (picks.playerGuess === total && picks.cpuGuess === total) {
      banner.textContent = `🤝 ¡Empate! Los dos acertaron — suma ${total}`;
      banner.classList.add('banner-draw', 'show');
      GameAudio.playDraw();
    } else {
      banner.textContent = `🤝 ¡Empate! Nadie acertó — suma ${total}`;
      banner.classList.add('banner-draw', 'show');
      GameAudio.playDraw();
    }

    // 8. Loser fades
    if (roundWinner === 'player') cpuBlock.classList.add('loser');
    if (roundWinner === 'cpu')    playerBlock.classList.add('loser');

    // 9. Auto-advance to game over
    if (state.matchWinner !== null) {
      setTimeout(() => {
        populateGameover(state);
        goTo('gameover', 'fwd');
      }, 1700);
    }
  }

  /* ──────────── Game Over Screen ──────────── */

  function populateGameover(state) {
    HGA.gameOver(state.matchWinner, state.scores, state.round);
    const { player, scores, matchWinner, session } = state;

    if (matchWinner === 'player') {
      $('go-trophy').textContent     = '🏆';
      $('go-trophy').style.animation = '';
      typewriter($('go-winner-name'), player.name);
      $('go-title-suffix').textContent = ' gana!';
      $('go-subtitle').textContent     = '¡Tus dedos no mienten! La CPU no pudo con tu instinto.';
      spawnConfetti();
      GameAudio.playFanfare();
    } else {
      $('go-trophy').textContent     = '🤖';
      $('go-trophy').style.animation = '';
      typewriter($('go-winner-name'), 'CPU');
      $('go-title-suffix').textContent = ' gana!';
      $('go-subtitle').textContent     = `${player.name} tendrá que mejorar su Morra. ¿Revancha?`;
      GameAudio.playGameDraw();
    }

    $('go-name-player').textContent = player.name;
    $('go-name-cpu').textContent    = 'CPU';
    countUp($('go-val-player'), scores.player);
    countUp($('go-val-cpu'),    scores.cpu);

    // Session stats
    const winPct = session.matches > 0
      ? Math.round((session.wins / session.matches) * 100)
      : 0;

    $('stat-matches').textContent = session.matches;
    $('stat-wins').textContent    = session.wins;
    $('stat-losses').textContent  = session.losses;
    $('stat-winpct').textContent  = `${winPct}%`;

    const statsEl = $('session-stats');
    statsEl.style.display = 'block';
    statsEl.classList.remove('fade-in');
    reflow(statsEl);
    statsEl.classList.add('fade-in');
  }

  /* ──────────── Event Listeners ──────────── */

  $('btn-start').addEventListener('click', () => {
    const name = $('name-player').value.trim();
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const state = GameMorraCPU.configure(name, mode);
    HGA.gameStart(mode);
    populatePick(state);
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

  // Confirm (reveal)
  $('btn-confirm').addEventListener('click', async () => {
    if (transitioning || pendingFingers === null || pendingGuess === null) return;
    $('finger-buttons').querySelectorAll('.btn-finger').forEach(b => b.disabled = true);
    $('guess-buttons').querySelectorAll('.btn-guess').forEach(b => b.disabled = true);
    $('btn-confirm').disabled = true;
    GameAudio.playTick();
    await new Promise(r => setTimeout(r, 200));
    const state = GameMorraCPU.playerPick(pendingFingers, pendingGuess);
    HGA.pickMade({ pick_fingers: pendingFingers, pick_guess: pendingGuess, round: state.round });
    HGA.roundResult(state.roundWinner, { pick_player_fingers: state.picks.playerFingers, pick_cpu_fingers: state.picks.cpuFingers, round: state.round });
    populateResult(state);
    await goTo('result', 'fwd');
    animateCPUReveal(state);  // intentionally not awaited
  });

  $('btn-next-round').addEventListener('click', () => {
    if (transitioning) return;
    const state = GameMorraCPU.nextRound();
    populatePick(state);
    goTo('pick', 'fwd');
  });

  $('btn-retry-round').addEventListener('click', () => {
    if (transitioning) return;
    const state = GameMorraCPU.retryRound();
    populatePick(state);
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-revenge').addEventListener('click', () => {
    if (transitioning) return;
    HGA.revenge();
    const state = GameMorraCPU.revenge();
    populatePick(state);
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-result').addEventListener('click', () => {
    if (transitioning) return;
    GameMorraCPU.newGame();
    $('name-player').value = '';
    goTo('setup', 'back');
  });

  $('btn-revenge-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    $('session-stats').style.display  = 'none';
    HGA.revenge();
    const state = GameMorraCPU.revenge();
    populatePick(state);
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    $('session-stats').style.display  = 'none';
    GameMorraCPU.newGame();
    $('name-player').value = '';
    goTo('setup', 'back');
  });

  $('btn-mute').addEventListener('click', () => {
    const muted = GameAudio.toggle();
    HGA.audioToggle(muted);
    $('btn-mute').textContent = muted ? '🔇' : '🔊';
    $('btn-mute').setAttribute('aria-label', muted ? 'Activar audio' : 'Silenciar audio');
    $('btn-mute').title = muted ? 'Activar audio' : 'Silenciar audio';
  });

})();
