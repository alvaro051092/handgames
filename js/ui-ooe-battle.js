/* ═══════════════════════════════════════════════════════════
   ui-ooe-battle.js — DOM orchestrator for Battle mode (Par o Impar).
   CPU picks everything; dramatic reveal with bet announcement.
   Depends on: window.GameOOEBattle, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
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

  /* ──────────── Battle Screen ──────────── */

  function populateBattleReady(state) {
    const { players, scores, round, mode } = state;

    $('battle-name-p1').textContent = players.p1;
    $('battle-name-p2').textContent = players.p2;
    setScoreDigit($('battle-roll-p1'), scores.p1);
    setScoreDigit($('battle-roll-p2'), scores.p2);
    $('battle-round-badge').textContent =
      mode === 'best-of-3' ? `Ronda ${round}` : 'Intento único';

    // Reset mystery state
    const p1Num = $('battle-p1-num');
    const p2Num = $('battle-p2-num');
    p1Num.textContent = '?';
    p2Num.textContent = '?';
    p1Num.classList.remove('cpu-flip-out', 'cpu-flip-in', 'fist-pulse');
    p2Num.classList.remove('cpu-flip-out', 'cpu-flip-in', 'fist-pulse');
    $('battle-p1-label').textContent = '';
    $('battle-p2-label').textContent = '';
    $('battle-p1-block').classList.remove('loser');
    $('battle-p2-block').classList.remove('loser');

    // Reset bet display
    const betDisplay = $('battle-bet-display');
    betDisplay.textContent = '';
    betDisplay.style.opacity = '0';

    // Reset countdown
    const cd = $('battle-countdown');
    cd.textContent = '';
    cd.classList.remove('countdown-pop');

    // Reset sum display
    const sumEl = $('battle-sum');
    sumEl.style.opacity = '0';
    $('battle-sum-value').textContent  = '';
    $('battle-sum-parity').textContent = '';
    $('battle-sum-parity').className   = 'res-sum-parity';

    // Banner hidden
    const banner = $('battle-banner');
    banner.className   = 'result-banner';
    banner.textContent = '';

    // Button state
    $('btn-reveal').style.display          = 'flex';
    $('btn-next-round').style.display      = 'none';
    $('btn-revenge').style.display         = 'none';
    $('btn-new-game-battle').style.display = 'none';
  }

  async function animateBattleReveal(state) {
    if (revealing) return;
    revealing = true;

    const { picks, bet, sum, sumParity, roundWinner, players } = state;
    const p1Block   = $('battle-p1-block');
    const p2Block   = $('battle-p2-block');
    const p1Num     = $('battle-p1-num');
    const p2Num     = $('battle-p2-num');
    const countdown = $('battle-countdown');
    const betDisplay = $('battle-bet-display');

    // Hide reveal button
    $('btn-reveal').style.display = 'none';

    // 1. Bet announcement: "P1 apuesta: IMPAR"
    const betLabel = bet === 'par' ? 'PAR' : 'IMPAR';
    betDisplay.textContent = `${players.p1} apuesta: ${betLabel}`;
    betDisplay.className   = `battle-bet-display bet-${bet}`;
    betDisplay.style.transition = 'opacity 0.25s';
    betDisplay.style.opacity    = '1';
    GameAudio.playTick();

    await new Promise(r => setTimeout(r, 700));

    // 2. Countdown 3 → 2 → 1
    for (const label of ['3', '2', '1']) {
      countdown.textContent = label;
      countdown.classList.remove('countdown-pop');
      reflow(countdown);
      countdown.classList.add('countdown-pop');
      p1Num.classList.remove('fist-pulse');
      p2Num.classList.remove('fist-pulse');
      reflow(p1Num); reflow(p2Num);
      p1Num.classList.add('fist-pulse');
      p2Num.classList.add('fist-pulse');
      await new Promise(r => setTimeout(r, 200));
    }

    // ¡YA!
    countdown.textContent = '¡YA!';
    countdown.classList.remove('countdown-pop');
    reflow(countdown);
    countdown.classList.add('countdown-pop');
    p1Num.classList.remove('fist-pulse');
    p2Num.classList.remove('fist-pulse');

    // 3. Double flip: both "?" → actual numbers
    p1Num.classList.add('cpu-flip-out');
    p2Num.classList.add('cpu-flip-out');
    await new Promise(r => setTimeout(r, 150));

    p1Num.classList.remove('cpu-flip-out');
    p2Num.classList.remove('cpu-flip-out');
    p1Num.textContent = picks.p1;
    p2Num.textContent = picks.p2;
    $('battle-p1-label').textContent = GameOOEBattle.fingersMeta()[picks.p1].label;
    $('battle-p2-label').textContent = GameOOEBattle.fingersMeta()[picks.p2].label;
    reflow(p1Num); reflow(p2Num);
    p1Num.classList.add('cpu-flip-in');
    p2Num.classList.add('cpu-flip-in');
    await new Promise(r => setTimeout(r, 150));
    p1Num.classList.remove('cpu-flip-in');
    p2Num.classList.remove('cpu-flip-in');

    // 4. Dramatic pause
    await new Promise(r => setTimeout(r, 300));

    // 5. Sum display fades in
    const sumEl    = $('battle-sum');
    const parityEl = $('battle-sum-parity');
    $('battle-sum-value').textContent  = `${picks.p1} + ${picks.p2} = ${sum}`;
    parityEl.textContent               = sumParity === 'par' ? 'PAR' : 'IMPAR';
    parityEl.className                 = `res-sum-parity ${sumParity}`;
    sumEl.style.transition             = 'opacity 0.3s';
    sumEl.style.opacity                = '1';

    await new Promise(r => setTimeout(r, 300));

    // 6. Score rolls
    if (roundWinner === 'p1') animateScore($('battle-roll-p1'), state.scores.p1);
    if (roundWinner === 'p2') animateScore($('battle-roll-p2'), state.scores.p2);

    // 7. Banner
    const banner = $('battle-banner');
    if (roundWinner === 'p1') {
      banner.textContent = `✅ ¡${players.p1} acierta! La suma fue ${sum} (${sumParity === 'par' ? 'par' : 'impar'})`;
      banner.classList.add('banner-win', 'show');
      GameAudio.playWin();
    } else {
      banner.textContent = `🎉 ¡${players.p2} gana! La suma fue ${sum} (${sumParity === 'par' ? 'par' : 'impar'})`;
      banner.classList.add('banner-win', 'show');
      GameAudio.playWin();
    }

    // 8. Loser fades
    if (roundWinner === 'p1') p2Block.classList.add('loser');
    if (roundWinner === 'p2') p1Block.classList.add('loser');

    HGA.roundResult(roundWinner, { round: state.round });
    revealing = false;

    // 9. Auto-advance or show action buttons
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

  /* ──────────── Game Over Screen ──────────── */

  function populateGameover(state) {
    HGA.gameOver(state.matchWinner, state.scores, state.round);
    const { players, scores, matchWinner } = state;

    const winner = matchWinner === 'p1' ? players.p1 : players.p2;
    $('go-trophy').textContent     = '🏆';
    $('go-trophy').style.animation = '';
    typewriter($('go-winner-name'), winner);
    $('go-title-suffix').textContent = ' gana!';
    $('go-subtitle').textContent     = '¡La suerte y el instinto estuvieron de su lado! ¿Revancha?';
    spawnConfetti();
    GameAudio.playFanfare();

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
    const state = GameOOEBattle.configure(p1, p2, mode);
    HGA.gameStart(mode);
    populateBattleReady(state);
    goTo('battle', 'fwd');
    GameAudio.playTick();
  });

  $('btn-reveal').addEventListener('click', () => {
    if (revealing || transitioning) return;
    const state = GameOOEBattle.reveal();
    animateBattleReveal(state);
  });

  $('btn-next-round').addEventListener('click', () => {
    if (transitioning || revealing) return;
    const state = GameOOEBattle.nextRound();
    populateBattleReady(state);
  });

  $('btn-revenge').addEventListener('click', () => {
    if (transitioning || revealing) return;
    $('confetti-container').innerHTML = '';
    HGA.revenge();
    const state = GameOOEBattle.revenge();
    populateBattleReady(state);
    GameAudio.playTick();
  });

  $('btn-new-game-battle').addEventListener('click', () => {
    if (transitioning || revealing) return;
    $('confetti-container').innerHTML = '';
    GameOOEBattle.newGame();
    $('name-p1').value = '';
    $('name-p2').value = '';
    goTo('setup', 'back');
  });

  $('btn-revenge-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    HGA.revenge();
    const state = GameOOEBattle.revenge();
    populateBattleReady(state);
    goTo('battle', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    GameOOEBattle.newGame();
    $('name-p1').value = '';
    $('name-p2').value = '';
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
