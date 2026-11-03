/* ═══════════════════════════════════════════════════════════
   ui-cpu.js — DOM orchestrator for vs-CPU mode.
   Depends on: window.GameCPU, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
  /* ──────────── State ──────────── */
  const _lang = (document.documentElement.lang || 'es').slice(0, 2);
  /* Fallback for a stale cached analytics.js that predates HGA.i18n: without it
     "Play!" would throw. Only the keys this file uses. */
  const _L_FALLBACK = {
    es: {
      audioOff:   'Silenciar audio',
      audioOn:    'Activar audio',
      camAdjust:  'Mano detectada — ajustá el gesto',
      camDenied:  'Permiso de cámara denegado — seguimos con el modo click.',
      camDetected: l => `Detectando: ${l}`,
      camFailed:  'No se pudo iniciar la cámara — seguimos con el modo click.',
      camHolding:  l => `Manteniendo ${l}…`,
      camSearching:'Detectando mano…',
      camStarting:'Activando cámara…',
      cpuWinRound:'🤖 ¡CPU gana la ronda!',
      defName:    'Jugador',
      drawRound:  '🤝 ¡Empate! Nadie anota punto.',
      drawTitle:  '¡Empate!',
      go:         '¡YA!',
      pick: { rock: '🪨 Piedra', paper: '📄 Papel', scissors: '✂️ Tijeras' },
      pickName: { rock: 'Piedra', paper: 'Papel', scissors: 'Tijeras' },
      round:      n => `Ronda ${n}`,
      single:     'Intento único',
      winRound:   name => `🎉 ¡${name} gana la ronda!`,
      winSuffix:  ' gana!',
    },
    en: {
      audioOff:   'Mute audio',
      audioOn:    'Turn audio on',
      camAdjust:  'Hand detected — adjust your gesture',
      camDenied:  'Camera permission denied — continuing in click mode.',
      camDetected: l => `Detected: ${l}`,
      camFailed:  'Could not start the camera — continuing in click mode.',
      camHolding:  l => `Holding ${l}…`,
      camSearching:'Looking for your hand…',
      camStarting:'Starting camera…',
      cpuWinRound:'🤖 CPU wins the round!',
      defName:    'Player',
      drawRound:  '🤝 Draw! Nobody scores.',
      drawTitle:  'Draw!',
      go:         'GO!',
      pick: { rock: '🪨 Rock', paper: '📄 Paper', scissors: '✂️ Scissors' },
      pickName: { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' },
      round:      n => `Round ${n}`,
      single:     'Single round',
      winRound:   name => `🎉 ${name} wins the round!`,
      winSuffix:  ' wins!',
    },
    pt: {
      audioOff:   'Silenciar áudio',
      audioOn:    'Ativar áudio',
      camAdjust:  'Mão detectada — ajuste o gesto',
      camDenied:  'Permissão da câmera negada — seguimos no modo clique.',
      camDetected: l => `Detectado: ${l}`,
      camFailed:  'Não foi possível iniciar a câmera — seguimos no modo clique.',
      camHolding:  l => `Segurando ${l}…`,
      camSearching:'Procurando sua mão…',
      camStarting:'Ativando a câmera…',
      cpuWinRound:'🤖 A CPU vence a rodada!',
      defName:    'Jogador',
      drawRound:  '🤝 Empate! Ninguém pontua.',
      drawTitle:  'Empate!',
      go:         'JÁ!',
      pick: { rock: '🪨 Pedra', paper: '📄 Papel', scissors: '✂️ Tesoura' },
      pickName: { rock: 'Pedra', paper: 'Papel', scissors: 'Tesoura' },
      round:      n => `Rodada ${n}`,
      single:     'Tentativa única',
      winRound:   name => `🎉 ${name} vence a rodada!`,
      winSuffix:  ' vence!',
    },
  };
  const L = (window.HGA && HGA.i18n) || _L_FALLBACK[_lang] || _L_FALLBACK.es;   // shared ES/EN/PT strings (analytics.js)

  /* Sentences specific to this screen */
  const T = {
    es: {
      draw:    'Nadie pudo imponerse esta vez.',
      win:     '¡Bien jugado! La CPU no tuvo oportunidad.',
      loss:    n => `${n} tendrá que practicar más. ¿Revancha?`,
    },
    en: {
      draw:    'Nobody could get the upper hand this time.',
      win:     'Well played! The CPU never stood a chance.',
      loss:    n => `${n} will have to practise more. Rematch?`,
    },
    pt: {
      draw:    'Ninguém conseguiu se impor desta vez.',
      win:     'Muito bem! A CPU não teve chance.',
      loss:    n => `${n} vai ter que treinar mais. Revanche?`,
    },
  };
  const i = T[_lang] || T.es;
  let transitioning = false;
  let inputMode = 'click'; // 'click' | 'camera'
  let camUiRaf = null;
  let lastSnapshot = null;

  // Camera "hold to confirm": arm on the first detected gesture, lock it
  // in after HOLD_MS as long as it stays steady. GRACE_MS tolerates a
  // brief detection flicker without resetting the hold.
  const HOLD_MS = 3000;
  const GRACE_MS = 350;
  let armGesture = null;
  let armStartTime = null;
  let lastGoodTime = null;
  let capturing = false;

  /* ──────────── Utilities ──────────── */

  const $ = id => document.getElementById(id);

  /* Camera-only elements. All six RPS/Morra vs-CPU pages (ES/EN/PT) now carry
     the camera markup, but $cam() stays tolerant: if a stale or trimmed page
     lacks one of these ids (#setup-cam-status, the click/camera pick cards,
     the snapshot <img>), a detached stand-in keeps the reads/writes harmless
     instead of throwing before the game starts. */
  const $cam = id => document.getElementById(id) || document.createElement('div');

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
    const _esc = c => c === ' ' ? '&nbsp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : c;
    containerEl.innerHTML = [...text].map((ch, i) =>
      `<span class="tw-char" style="animation-delay:${i * 45}ms">${_esc(ch)}</span>`
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
    document.querySelectorAll('.btn:not(.btn-pick):not(.btn-mute)').forEach(b => b.classList.add('btn-loading'));

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
    document.querySelectorAll('.btn-loading').forEach(b => b.classList.remove('btn-loading'));
  }

  /* ──────────── Screen Populators ──────────── */

  function populatePick(state) {
    $('sb-name-player').textContent = state.player.name;
    $('sb-name-cpu').textContent    = 'CPU';
    setScoreDigit($('roll-player'), state.scores.player);
    setScoreDigit($('roll-cpu'),    state.scores.cpu);
    $('pick-round-badge').textContent =
      state.mode === 'best-of-3' ? L.round(state.round) : L.single;

    $('pick-buttons').querySelectorAll('.btn-pick').forEach(b => {
      b.disabled = false;
      b.classList.remove('selected', 'bouncing');
    });

    $cam('pick-card-click').style.display  = inputMode === 'click'  ? '' : 'none';
    $cam('pick-card-camera').style.display = inputMode === 'camera' ? '' : 'none';
    if (inputMode === 'camera') {
      $('cam-status').textContent = L.camSearching;
      $('cam-countdown').textContent = '';
      startCamUiLoop();
    }
  }

  /* ── Camera mode: hold-to-confirm loop. Arms on the first gesture
     detected, locks it in once held steadily for HOLD_MS. ── */
  function resetCamArm() {
    armGesture = null;
    armStartTime = null;
    lastGoodTime = null;
  }

  function startCamUiLoop() {
    if (camUiRaf) cancelAnimationFrame(camUiRaf);
    resetCamArm();
    capturing = false;

    function tick() {
      if (inputMode !== 'camera' || activeScreen()?.id !== 'screen-pick' || capturing || !CameraGesture.isReady()) {
        camUiRaf = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const gesture = CameraGesture.classifyCurrent();
      const oval = $('cam-oval');

      if (gesture) {
        oval.classList.add('detected');
        if (gesture !== armGesture) { armGesture = gesture; armStartTime = now; }
        lastGoodTime = now;
      } else {
        oval.classList.remove('detected');
        if (armGesture && now - lastGoodTime > GRACE_MS) resetCamArm();
      }

      if (armGesture) {
        const elapsed = now - armStartTime;
        if (elapsed >= HOLD_MS) {
          $('cam-countdown').textContent = L.go;
          $('cam-status').textContent = L.camDetected(pickLabel(armGesture));
          capturing = true;
          finalizeCameraPick(armGesture);
        } else {
          $('cam-countdown').textContent = String(Math.ceil((HOLD_MS - elapsed) / 1000));
          $('cam-status').textContent = L.camHolding(pickLabel(armGesture));
        }
      } else {
        $('cam-countdown').textContent = '';
        $('cam-status').textContent = CameraGesture.hasDetection()
          ? L.camAdjust
          : L.camSearching;
      }

      camUiRaf = requestAnimationFrame(tick);
    }
    tick();
  }

  function stopCamUiLoop() {
    if (camUiRaf) cancelAnimationFrame(camUiRaf);
    camUiRaf = null;
  }

  function pickLabel(g) {
    return L.pick[g] || g;
  }

  async function finalizeCameraPick(pick) {
    lastSnapshot = CameraGesture.snapshotSquare();
    resetCamArm();
    const state = GameCPU.playerPick(pick);
    setTimeout(() => {
      HGA.pickMade({ pick, round: state.round, input_mode: 'camera' });
      HGA.roundResult(state.roundWinner, { pick_player: state.picks.player, pick_cpu: state.picks.cpu, round: state.round });
    }, 0);
    populateResult(state);
    await goTo('result', 'fwd');
    animateCPUReveal(state);
    capturing = false;
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
      mode === 'best-of-3' ? L.round(round) : L.single;

    // Player block — hidden; animated in by animateCPUReveal
    const playerBlock = $('res-player-block');
    playerBlock.classList.remove('enter-left', 'loser');
    playerBlock.style.opacity = '0';
    $('res-player-name').textContent  = player.name;
    $('res-player-emoji').textContent = meta[picks.player].emoji;
    $('res-player-label').textContent = L.pickName[picks.player];
    const snapImg = $cam('res-player-snap');
    if (inputMode === 'camera' && lastSnapshot) {
      snapImg.src = lastSnapshot;
      snapImg.style.display = '';
      $('res-player-emoji').style.display = 'none';
    } else {
      snapImg.style.display = 'none';
      $('res-player-emoji').style.display = '';
    }

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
    countdown.textContent = L.go;
    countdown.classList.remove('countdown-pop');
    reflow(countdown);
    countdown.classList.add('countdown-pop');
    cpuEmoji.classList.remove('fist-pulse');

    // 3. CPU flip reveal — out (150 ms), swap emoji, in (150 ms)
    cpuEmoji.classList.add('cpu-flip-out');
    await new Promise(r => setTimeout(r, 150));
    cpuEmoji.classList.remove('cpu-flip-out');
    cpuEmoji.textContent = meta[state.picks.cpu].emoji;
    $('res-cpu-label').textContent = L.pickName[state.picks.cpu];
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
      banner.textContent = L.drawRound;
      banner.classList.add('banner-draw', 'show');
      GameAudio.playDraw();
    } else if (state.roundWinner === 'player') {
      banner.textContent = L.winRound(state.player.name);
      banner.classList.add('banner-win', 'show');
      GameAudio.playWin();
    } else {
      banner.textContent = L.cpuWinRound;
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
      typewriter($('go-winner-name'), L.drawTitle);
      $('go-title-suffix').textContent = '';
      $('go-subtitle').textContent     = i.draw;
      GameAudio.playGameDraw();
    } else if (matchWinner === 'player') {
      $('go-trophy').textContent     = '🏆';
      $('go-trophy').style.animation = '';
      typewriter($('go-winner-name'), player.name);
      $('go-title-suffix').textContent = L.winSuffix;
      $('go-subtitle').textContent     = i.win;
      spawnConfetti();
      GameAudio.playFanfare();
    } else {
      $('go-trophy').textContent     = '🤖';
      $('go-trophy').style.animation = '';
      typewriter($('go-winner-name'), 'CPU');
      $('go-title-suffix').textContent = L.winSuffix;
      $('go-subtitle').textContent     = i.loss(player.name);
      GameAudio.playGameDraw();
    }

    $('go-name-player').textContent = player.name;
    $('go-name-cpu').textContent    = 'CPU';
    countUp($('go-val-player'), scores.player);
    countUp($('go-val-cpu'),    scores.cpu);

    // Session statistics
    const PICKS     = ['rock', 'paper', 'scissors'];
    const PICK_LABELS = L.pick;
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

  $('btn-start').addEventListener('click', async () => {
    const name = $('name-player').value.trim() || L.defName;
    const difficulty = document.querySelector('input[name=\"difficulty\"]:checked')?.value || 'medium';
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const wantsCamera = document.querySelector('input[name="input-mode"]:checked')?.value === 'camera';
    const startBtn = $('btn-start');
    const camStatus = $cam('setup-cam-status');
    camStatus.classList.remove('err');
    camStatus.textContent = '';

    if (wantsCamera) {
      startBtn.disabled = true;
      camStatus.textContent = L.camStarting;
      try {
        await CameraGesture.init($('cam-video'), $('cam-overlay'));
        inputMode = 'camera';
      } catch (err) {
        console.error(err);
        camStatus.classList.add('err');
        camStatus.textContent = err.name === 'NotAllowedError'
          ? L.camDenied
          : L.camFailed;
        inputMode = 'click';
        await new Promise(r => setTimeout(r, 1400));
      }
      startBtn.disabled = false;
    } else {
      inputMode = 'click';
    }

    const state = GameCPU.configure(name, mode, difficulty);
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
      HGA.pickMade({ pick, round: state.round, input_mode: 'click' });
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
    if (inputMode === 'camera') { CameraGesture.stop(); stopCamUiLoop(); }
    GameCPU.newGame();
    $cam('setup-cam-status').textContent = '';
    $cam('setup-cam-status').classList.remove('err');
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
    if (inputMode === 'camera') { CameraGesture.stop(); stopCamUiLoop(); }
    $('confetti-container').innerHTML = '';
    $('session-stats').style.display  = 'none';
    GameCPU.newGame();
    $cam('setup-cam-status').textContent = '';
    $cam('setup-cam-status').classList.remove('err');
    goTo('setup', 'back');
  });

  $('btn-mute').addEventListener('click', () => {
    const muted = GameAudio.toggle();
    HGA.audioToggle(muted);
    $('btn-mute').textContent = muted ? '🔇' : '🔊';
    $('btn-mute').setAttribute('aria-label', muted ? L.audioOn : L.audioOff);
    $('btn-mute').title = muted ? L.audioOn : L.audioOff;
  });

})();
