/* ═══════════════════════════════════════════════════════════
   ui-cpu.js — DOM orchestrator for vs-CPU mode.
   Depends on: window.GameCPU, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
  /* ──────────── State ──────────── */
  let transitioning = false;

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
    next.className = 'score-digit roll-in';
    next.textContent = newValue;
    rollEl.appendChild(next);

    setTimeout(() => {
      cur.remove();
      next.classList.remove('roll-in');
      pulse(rollEl);
    }, ROLL_DUR + 20);
  }

  function pulse(el) {
    el.classList.remove('pulse');
    reflow(el);
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), PULSE_DUR + 20);
  }

  function typewriter(containerEl, text) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      containerEl.textContent = text; return;
    }
    containerEl.innerHTML = [...text].map((ch, i) =>
      `<span class="tw-char" style="animation-delay:${i * 45}ms">${ch === ' ' ? '&nbsp;' : ch}</span>`
    ).join('');
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
    const frag = document.createDocumentFragment();
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
      frag.appendChild(p);
    }
    container.appendChild(frag);
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

  /* ──────────── Screen Populators ──────────── */

  function populatePick(state) {
    $('sb-name-player').textContent = state.player.name;
    $('sb-name-cpu').textContent    = 'CPU';
    setScoreDigit($('roll-player'), state.scores.player);
    setScoreDigit($('roll-cpu'),    state.scores.cpu);
    $('pick-round-badge').textContent =
      state.mode === 'best-of-3' ? `Ronda ${state.round}` : 'Intento único';

    $('pick-buttons').querySelectorAll('.btn-pick').forEach(b => {
      b.disabled = false;
      b.classList.remove('selected', 'bouncing');
    });
  }

  function populateResult(state) {
    const { player, scores, round, mode, picks, roundWinner, matchWinner } = state;
    const meta = GameCPU.picksMeta();

    // Scoreboard — pre-round scores; animation will roll to final
    const prePlayer = scores.player - (roundWinner === 'player' ? 1 : 0);
    const preCpu    = scores.cpu    - (roundWinner === 'cpu'    ? 1 : 0);
    $('res-name-player').textContent = player.name;
    $('res-name-cpu').textContent    = 'CPU';
    setScoreDigit($('res-roll-player'), prePlayer);
    setScoreDigit($('res-roll-cpu'),    preCpu);
    $('res-round-badge').textContent =
      mode === 'best-of-3' ? `Ronda ${round}` : 'Intento único';

    // Player block — hidden; animated in by animateCPUReveal
    const playerBlock = $('res-player-block');
    playerBlock.classList.remove('enter-left', 'loser');
    playerBlock.style.opacity = '0';
    $('res-player-name').textContent  = player.name;
    $('res-player-emoji').textContent = meta[picks.player].emoji;
    $('res-player-label').textContent = meta[picks.player].label;

    // CPU block — visible immediately showing ✊ (fist = mystery)
    const cpuBlock = $('res-cpu-block');
    cpuBlock.classList.remove('enter-right', 'loser');
    cpuBlock.style.opacity = '';
    const cpuEmoji = $('res-cpu-emoji');
    cpuEmoji.textContent = '✊';
    cpuEmoji.classList.remove('cpu-flip-out', 'cpu-flip-in', 'fist-pulse');
    $('res-cpu-label').textContent = '';

    // Countdown — empty initially
    const countdown = $('cpu-countdown');
    countdown.textContent = '';
    countdown.classList.remove('countdown-pop');

    // Banner — hidden
    const banner = $('result-banner');
    banner.className   = 'result-banner';
    banner.textContent = '';

    // Next-round button only when match continues
    $('btn-next-round').style.display = matchWinner === null ? 'flex' : 'none';
  }

  async function animateCPUReveal(state) {
    const meta        = GameCPU.picksMeta();
    const playerBlock = $('res-player-block');
    const cpuBlock    = $('res-cpu-block');
    const cpuEmoji    = $('res-cpu-emoji');
    const countdown   = $('cpu-countdown');

    // 1. Player pick slides in from left; CPU ✊ is already visible
    playerBlock.style.opacity = '';
    playerBlock.classList.add('enter-left');
    await onceAnim(playerBlock, 700);

    // 2. Countdown: 3 → 2 → 1 (200 ms each = 600 ms total)
    for (const label of ['3', '2', '1']) {
      countdown.textContent = label;
      countdown.classList.remove('countdown-pop');
      reflow(countdown);
      countdown.classList.add('countdown-pop');
      cpuEmoji.classList.remove('fist-pulse');
      reflow(cpuEmoji);
      cpuEmoji.classList.add('fist-pulse');
      await new Promise(r => setTimeout(r, 200));
    }

    // ¡YA!
    countdown.textContent = '¡YA!';
    countdown.classList.remove('countdown-pop');
    reflow(countdown);
    countdown.classList.add('countdown-pop');
    cpuEmoji.classList.remove('fist-pulse');

    // 3. CPU flip reveal — out (150 ms), swap emoji, in (150 ms)
    cpuEmoji.classList.add('cpu-flip-out');
    await new Promise(r => setTimeout(r, 150));
    cpuEmoji.classList.remove('cpu-flip-out');
    cpuEmoji.textContent = meta[state.picks.cpu].emoji;
    $('res-cpu-label').textContent = meta[state.picks.cpu].label;
    reflow(cpuEmoji);
    cpuEmoji.classList.add('cpu-flip-in');
    await new Promise(r => setTimeout(r, 150));
    cpuEmoji.classList.remove('cpu-flip-in');

    // 4. Dramatic pause
    await new Promise(r => setTimeout(r, 300));

    // 5. Score rolls
    if (state.roundWinner === 'player') animateScore($('res-roll-player'), state.scores.player);
    if (state.roundWinner === 'cpu')    animateScore($('res-roll-cpu'),    state.scores.cpu);

    // 6. Banner reveal
    const banner = $('result-banner');
    if (state.roundWinner === 'draw') {
      banner.textContent = '🤝 ¡Empate! Nadie anota punto.';
      banner.classList.add('banner-draw', 'show');
      GameAudio.playDraw();
    } else if (state.roundWinner === 'player') {
      banner.textContent = `🎉 ¡${state.player.name} gana la ronda!`;
      banner.classList.add('banner-win', 'show');
      GameAudio.playWin();
    } else {
      banner.textContent = '🤖 ¡CPU gana la ronda!';
      banner.classList.add('banner-loss', 'show');
      GameAudio.playDraw();
    }

    // 7. Loser fades
    if (state.roundWinner === 'player') cpuBlock.classList.add('loser');
    if (state.roundWinner === 'cpu')    playerBlock.classList.add('loser');

    // 8. Auto-advance to game over
    if (state.matchWinner !== null) {
      setTimeout(() => {
        populateGameover(state);
        goTo('gameover', 'fwd');
      }, 1700);
    }
  }

  function populateGameover(state) {
    HGA.gameOver(state.matchWinner, state.scores, state.round);
    const { player, scores, matchWinner, session } = state;

    if (matchWinner === 'draw') {
      $('go-trophy').textContent     = '🤝';
      $('go-trophy').style.animation = 'shakeX 0.6s ease-in-out';
      typewriter($('go-winner-name'), '¡Empate!');
      $('go-title-suffix').textContent = '';
      $('go-subtitle').textContent     = 'Nadie pudo imponerse esta vez.';
      GameAudio.playGameDraw();
    } else if (matchWinner === 'player') {
      $('go-trophy').textContent     = '🏆';
      $('go-trophy').style.animation = '';
      typewriter($('go-winner-name'), player.name);
      $('go-title-suffix').textContent = ' gana!';
      $('go-subtitle').textContent     = '¡Bien jugado! La CPU no tuvo oportunidad.';
      spawnConfetti();
      GameAudio.playFanfare();
    } else {
      $('go-trophy').textContent     = '🤖';
      $('go-trophy').style.animation = '';
      typewriter($('go-winner-name'), 'CPU');
      $('go-title-suffix').textContent = ' gana!';
      $('go-subtitle').textContent     = `${player.name} tendrá que practicar más. ¿Revancha?`;
      GameAudio.playGameDraw();
    }

    $('go-name-player').textContent = player.name;
    $('go-name-cpu').textContent    = 'CPU';
    countUp($('go-val-player'), scores.player);
    countUp($('go-val-cpu'),    scores.cpu);

    // Session statistics
    const PICKS     = ['rock', 'paper', 'scissors'];
    const PICK_LABELS = { rock: '🪨 Piedra', paper: '📄 Papel', scissors: '✂️ Tijeras' };
    const fav = PICKS.reduce((a, b) =>
      session.pickFreq[a] >= session.pickFreq[b] ? a : b
    );
    const winPct = session.matches > 0
      ? Math.round((session.wins / session.matches) * 100)
      : 0;

    $('stat-matches').textContent = session.matches;
    $('stat-wins').textContent    = session.wins;
    $('stat-losses').textContent  = session.losses;
    $('stat-draws').textContent   = session.draws;
    $('stat-fav').textContent     = session.pickFreq[fav] > 0 ? PICK_LABELS[fav] : '—';
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
    const state = GameCPU.configure(name, mode);
    HGA.gameStart(mode);
    populatePick(state);
    goTo('pick', 'fwd');
    GameAudio.playTick();
  });

  $('pick-buttons').addEventListener('pointerdown', () => GameAudio.prime(), { passive: true });

  $('pick-buttons').addEventListener('click', async e => {
    const btn = e.target.closest('.btn-pick');
    if (!btn || btn.disabled || transitioning) return;

    const pick = btn.dataset.pick;
    $('pick-buttons').querySelectorAll('.btn-pick').forEach(b => b.disabled = true);
    btn.classList.add('selected', 'bouncing');
    GameAudio.playTick();

    await onceAnim(btn, 600);
    btn.classList.remove('bouncing');

    const state = GameCPU.playerPick(pick);
    setTimeout(() => {
      HGA.pickMade({ pick, round: state.round });
      HGA.roundResult(state.roundWinner, { pick_player: state.picks.player, pick_cpu: state.picks.cpu, round: state.round });
    }, 0);
    populateResult(state);
    await goTo('result', 'fwd');
    animateCPUReveal(state);  // intentionally not awaited — runs in background
  });

  $('btn-next-round').addEventListener('click', () => {
    if (transitioning) return;
    const state = GameCPU.nextRound();
    populatePick(state);
    goTo('pick', 'fwd');
  });

  $('btn-revenge').addEventListener('click', () => {
    if (transitioning) return;
    HGA.revenge();
    const state = GameCPU.revenge();
    populatePick(state);
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-result').addEventListener('click', () => {
    if (transitioning) return;
    GameCPU.newGame();
    $('name-player').value = '';
    goTo('setup', 'back');
  });

  $('btn-revenge-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    $('session-stats').style.display  = 'none';
    HGA.revenge();
    const state = GameCPU.revenge();
    populatePick(state);
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    $('session-stats').style.display  = 'none';
    GameCPU.newGame();
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
