/* ═══════════════════════════════════════════════════════════
   ui-battle.js — DOM orchestrator for Battle mode.
   Both picks are random; UI shows double-flip reveal.
   Depends on: window.GameBattle, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
  const _lang = (document.documentElement.lang || 'es').slice(0, 2);
  /* Fallback for a stale cached analytics.js that predates HGA.i18n: without it
     "Play!" would throw. Only the keys this file uses. */
  const _L_FALLBACK = {
    es: {
      audioOff:   'Silenciar audio',
      audioOn:    'Activar audio',
      defP1:      'Jugador 1',
      defP2:      'Jugador 2',
      drawRound:  '🤝 ¡Empate! Nadie anota punto.',
      drawTitle:  '¡Empate!',
      go:         '¡YA!',
      pickName: { rock: 'Piedra', paper: 'Papel', scissors: 'Tijeras' },
      round:      n => `Ronda ${n}`,
      single:     'Intento único',
      winRound:   name => `🎉 ¡${name} gana la ronda!`,
      winSuffix:  ' gana!',
    },
    en: {
      audioOff:   'Mute audio',
      audioOn:    'Turn audio on',
      defP1:      'Player 1',
      defP2:      'Player 2',
      drawRound:  '🤝 Draw! Nobody scores.',
      drawTitle:  'Draw!',
      go:         'GO!',
      pickName: { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' },
      round:      n => `Round ${n}`,
      single:     'Single round',
      winRound:   name => `🎉 ${name} wins the round!`,
      winSuffix:  ' wins!',
    },
    pt: {
      audioOff:   'Silenciar áudio',
      audioOn:    'Ativar áudio',
      defP1:      'Jogador 1',
      defP2:      'Jogador 2',
      drawRound:  '🤝 Empate! Ninguém pontua.',
      drawTitle:  'Empate!',
      go:         'JÁ!',
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
      drawSub: 'Nadie pudo imponerse esta vez.',
      winSub: '¡La suerte estuvo de su lado! ¿Revancha?',
    },
    en: {
      drawSub: 'Nobody could get the upper hand this time.',
      winSub: 'Luck was on their side! Rematch?',
    },
    pt: {
      drawSub: 'Ninguém conseguiu se impor desta vez.',
      winSub: 'A sorte estava do lado dele! Revanche?',
    },
  };
  const i = T[_lang] || T.es;

  /* ──────────── State ──────────── */
  let transitioning = false;
  let revealing     = false;

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
    next.className  = 'score-digit roll-in';
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
    battle:   $('screen-battle'),
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

  /**
   * Prepare the battle screen for a new round (ready state).
   * Resets emojis to ✊ and shows "¡Revelar!" button.
   */
  function populateBattleReady(state) {
    const { players, scores, round, mode } = state;

    $('battle-name-p1').textContent = players.p1;
    $('battle-name-p2').textContent = players.p2;
    setScoreDigit($('battle-roll-p1'), scores.p1);
    setScoreDigit($('battle-roll-p2'), scores.p2);
    $('battle-round-badge').textContent =
      mode === 'best-of-3' ? L.round(round) : L.single;

    // Reset both fists
    const p1Emoji = $('battle-p1-emoji');
    const p2Emoji = $('battle-p2-emoji');
    p1Emoji.textContent = '✊';
    p2Emoji.textContent = '✊';
    p1Emoji.classList.remove('cpu-flip-out', 'cpu-flip-in', 'fist-pulse');
    p2Emoji.classList.remove('cpu-flip-out', 'cpu-flip-in', 'fist-pulse');
    $('battle-p1-label').textContent = '';
    $('battle-p2-label').textContent = '';

    // Reset pick blocks (remove loser class)
    $('battle-p1-block').classList.remove('loser');
    $('battle-p2-block').classList.remove('loser');

    // Reset countdown
    const cd = $('battle-countdown');
    cd.textContent = '';
    cd.classList.remove('countdown-pop');

    // Banner hidden
    const banner = $('battle-banner');
    banner.className   = 'result-banner';
    banner.textContent = '';

    // Button state: show Revelar, hide others
    $('btn-reveal').style.display      = 'flex';
    $('btn-next-round').style.display  = 'none';
    $('btn-revenge').style.display     = 'none';
    $('btn-new-game-battle').style.display = 'none';
  }

  async function animateBattleReveal(state) {
    if (revealing) return;
    revealing = true;

    const meta     = GameBattle.picksMeta();
    const p1Block  = $('battle-p1-block');
    const p2Block  = $('battle-p2-block');
    const p1Emoji  = $('battle-p1-emoji');
    const p2Emoji  = $('battle-p2-emoji');
    const countdown = $('battle-countdown');

    // Hide reveal button immediately
    $('btn-reveal').style.display = 'none';

    // Countdown: 3 → 2 → 1 (200 ms each)
    for (const label of ['3', '2', '1']) {
      countdown.textContent = label;
      countdown.classList.remove('countdown-pop');
      reflow(countdown);
      countdown.classList.add('countdown-pop');
      p1Emoji.classList.remove('fist-pulse');
      p2Emoji.classList.remove('fist-pulse');
      reflow(p1Emoji); reflow(p2Emoji);
      p1Emoji.classList.add('fist-pulse');
      p2Emoji.classList.add('fist-pulse');
      await new Promise(r => setTimeout(r, 200));
    }

    // ¡YA!
    countdown.textContent = L.go;
    countdown.classList.remove('countdown-pop');
    reflow(countdown);
    countdown.classList.add('countdown-pop');
    p1Emoji.classList.remove('fist-pulse');
    p2Emoji.classList.remove('fist-pulse');

    // Double flip — both flip simultaneously
    p1Emoji.classList.add('cpu-flip-out');
    p2Emoji.classList.add('cpu-flip-out');
    await new Promise(r => setTimeout(r, 150));

    p1Emoji.classList.remove('cpu-flip-out');
    p2Emoji.classList.remove('cpu-flip-out');
    p1Emoji.textContent = meta[state.picks.p1].emoji;
    p2Emoji.textContent = meta[state.picks.p2].emoji;
    $('battle-p1-label').textContent = L.pickName[state.picks.p1];
    $('battle-p2-label').textContent = L.pickName[state.picks.p2];
    reflow(p1Emoji); reflow(p2Emoji);
    p1Emoji.classList.add('cpu-flip-in');
    p2Emoji.classList.add('cpu-flip-in');
    await new Promise(r => setTimeout(r, 150));
    p1Emoji.classList.remove('cpu-flip-in');
    p2Emoji.classList.remove('cpu-flip-in');

    // Dramatic pause
    await new Promise(r => setTimeout(r, 300));

    // Score rolls
    if (state.roundWinner === 'p1') animateScore($('battle-roll-p1'), state.scores.p1);
    if (state.roundWinner === 'p2') animateScore($('battle-roll-p2'), state.scores.p2);

    // Banner
    const banner = $('battle-banner');
    if (state.roundWinner === 'draw') {
      banner.textContent = L.drawRound;
      banner.classList.add('banner-draw', 'show');
      GameAudio.playDraw();
    } else {
      const wname = state.roundWinner === 'p1' ? state.players.p1 : state.players.p2;
      banner.textContent = L.winRound(wname);
      banner.classList.add('banner-win', 'show');
      GameAudio.playWin();
    }

    // Loser fades
    if (state.roundWinner === 'p1') p2Block.classList.add('loser');
    if (state.roundWinner === 'p2') p1Block.classList.add('loser');

    HGA.roundResult(state.roundWinner, { pick_p1: state.picks.p1, pick_p2: state.picks.p2, round: state.round });
    revealing = false;

    // Auto-advance or show action buttons
    if (state.matchWinner !== null) {
      setTimeout(() => {
        populateGameover(state);
        goTo('gameover', 'fwd');
      }, 1700);
    } else {
      $('btn-next-round').style.display      = 'flex';
      $('btn-revenge').style.display         = 'flex';
      $('btn-new-game-battle').style.display = 'flex';
    }
  }

  function populateGameover(state) {
    HGA.gameOver(state.matchWinner, state.scores, state.round);
    const { players, scores, matchWinner } = state;

    if (matchWinner === 'draw') {
      $('go-trophy').textContent     = '🤝';
      $('go-trophy').style.animation = 'shakeX 0.6s ease-in-out';
      typewriter($('go-winner-name'), L.drawTitle);
      $('go-title-suffix').textContent = '';
      $('go-subtitle').textContent     = i.drawSub;
      GameAudio.playGameDraw();
    } else {
      const winner = matchWinner === 'p1' ? players.p1 : players.p2;
      $('go-trophy').textContent     = '🏆';
      $('go-trophy').style.animation = '';
      typewriter($('go-winner-name'), winner);
      $('go-title-suffix').textContent = L.winSuffix;
      $('go-subtitle').textContent     = i.winSub;
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
    const p1   = $('name-p1').value.trim() || L.defP1;
    const p2   = $('name-p2').value.trim() || L.defP2;
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const state = GameBattle.configure(p1, p2, mode);
    HGA.gameStart(mode);
    populateBattleReady(state);
    goTo('battle', 'fwd');
    GameAudio.playTick();
  });

  $('btn-reveal').addEventListener('click', () => {
    if (revealing || transitioning) return;
    const state = GameBattle.reveal();
    animateBattleReveal(state);
    GameAudio.playTick();
  });

  $('btn-next-round').addEventListener('click', () => {
    if (transitioning || revealing) return;
    const state = GameBattle.nextRound();
    populateBattleReady(state);
    // No screen transition — just reset battle screen in place
  });

  $('btn-revenge').addEventListener('click', () => {
    if (transitioning || revealing) return;
    $('confetti-container').innerHTML = '';
    HGA.revenge();
    const state = GameBattle.revenge();
    populateBattleReady(state);
    GameAudio.playTick();
  });

  $('btn-new-game-battle').addEventListener('click', () => {
    if (transitioning || revealing) return;
    $('confetti-container').innerHTML = '';
    GameBattle.newGame();
    goTo('setup', 'back');
  });

  $('btn-revenge-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    HGA.revenge();
    const state = GameBattle.revenge();
    populateBattleReady(state);
    goTo('battle', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    GameBattle.newGame();
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
