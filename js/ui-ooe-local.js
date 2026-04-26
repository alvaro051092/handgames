/* ═══════════════════════════════════════════════════════════
   ui-ooe-local.js — DOM orchestrator for 2-player local mode (Par o Impar).
   Depends on: window.GameOOELocal, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
  /* ──────────── State ──────────── */
  let transitioning  = false;
  let pickingPlayer  = 'p1';
  let pendingBet     = null;   // 'par' | 'impar' — P1 only
  let pendingFingers = null;   // 0-5

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

  /* ──────────── Pick Screen ──────────── */

  function resetPickSelections() {
    pendingBet     = null;
    pendingFingers = null;
    $('bet-buttons').querySelectorAll('.btn-bet').forEach(b => {
      b.classList.remove('selected');
      b.disabled = false;
    });
    $('finger-buttons').querySelectorAll('.btn-finger').forEach(b => {
      b.classList.remove('selected');
      b.disabled = false;
    });
    const confirmBtn = $('btn-confirm');
    if (confirmBtn) confirmBtn.disabled = true;
  }

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

    // P1: show bet section + confirm button. P2: hide bet section, auto-submit on finger click.
    const betSection  = $('pick-bet-section');
    const confirmBtn  = $('btn-confirm');
    if (isP1) {
      betSection.style.display = '';
      if (confirmBtn) confirmBtn.style.display = 'flex';
      $('pick-hint').textContent = 'Elige tu apuesta y tus dedos';
    } else {
      betSection.style.display = 'none';
      if (confirmBtn) confirmBtn.style.display = 'none';
      $('pick-hint').textContent = 'Elige cuántos dedos levantas';
    }

    resetPickSelections();
  }

  function populateHandoff(state) {
    $('handoff-player').textContent     = state.players.p2;
    $('handoff-ready-name').textContent = state.players.p2;
  }

  /* ──────────── Result Screen ──────────── */

  function populateResult(state) {
    const { players, scores, round, mode, picks, bet, sum, sumParity, roundWinner, matchWinner } = state;

    const preP1 = scores.p1 - (roundWinner === 'p1' ? 1 : 0);
    const preP2 = scores.p2 - (roundWinner === 'p2' ? 1 : 0);
    $('res-name-p1').textContent = players.p1;
    $('res-name-p2').textContent = players.p2;
    setScoreDigit($('res-roll-p1'), preP1);
    setScoreDigit($('res-roll-p2'), preP2);
    $('res-round-badge').textContent =
      mode === 'best-of-3' ? `Ronda ${round}` : 'Intento único';

    ['res-p1-block', 'res-p2-block'].forEach(id => {
      const el = $(id);
      el.classList.remove('enter-left', 'enter-right', 'loser');
      el.style.opacity = '0';
    });

    $('res-p1-name').textContent  = players.p1;
    $('res-p1-num').textContent   = picks.p1;
    const betLabel = bet === 'par' ? 'PAR' : 'IMPAR';
    $('res-p1-bet').textContent   = `apostó: ${betLabel}`;
    $('res-p1-bet').className     = `res-bet-badge bet-${bet}`;

    $('res-p2-name').textContent  = players.p2;
    $('res-p2-num').textContent   = picks.p2;

    // Sum display — hidden initially
    const sumEl = $('res-sum');
    sumEl.style.opacity = '0';
    $('res-sum-value').textContent  = '';
    $('res-sum-parity').textContent = '';
    $('res-sum-parity').className   = 'res-sum-parity';

    const banner = $('result-banner');
    banner.className   = 'result-banner';
    banner.textContent = '';

    $('btn-next-round').style.display = matchWinner === null ? 'flex' : 'none';
  }

  async function animateResult(state) {
    const { picks, bet, sum, sumParity, roundWinner, players, scores } = state;

    // 1. Both pick blocks slide in simultaneously
    const p1block = $('res-p1-block');
    const p2block = $('res-p2-block');
    p1block.style.opacity = '';
    p2block.style.opacity = '';
    p1block.classList.add('enter-left');
    p2block.classList.add('enter-right');
    await Promise.all([onceAnim(p1block, 700), onceAnim(p2block, 700)]);

    // 2. Dramatic pause
    await new Promise(r => setTimeout(r, 300));

    // 3. Sum display fades in
    const sumEl    = $('res-sum');
    const parityEl = $('res-sum-parity');
    $('res-sum-value').textContent  = `${picks.p1} + ${picks.p2} = ${sum}`;
    parityEl.textContent            = sumParity === 'par' ? 'PAR' : 'IMPAR';
    parityEl.className              = `res-sum-parity ${sumParity}`;
    sumEl.style.transition          = 'opacity 0.3s';
    sumEl.style.opacity             = '1';

    await new Promise(r => setTimeout(r, 300));

    // 4. Score rolls
    if (roundWinner === 'p1') animateScore($('res-roll-p1'), scores.p1);
    if (roundWinner === 'p2') animateScore($('res-roll-p2'), scores.p2);

    // 5. Banner
    const banner = $('result-banner');
    if (roundWinner === 'p1') {
      banner.textContent = `✅ ¡${players.p1} acertó! La suma fue ${sum} (${sumParity === 'par' ? 'par' : 'impar'})`;
      banner.classList.add('banner-win', 'show');
      GameAudio.playWin();
    } else {
      banner.textContent = `🎉 ¡${players.p2} gana! La suma fue ${sum} (${sumParity === 'par' ? 'par' : 'impar'})`;
      banner.classList.add('banner-win', 'show');
      GameAudio.playWin();
    }

    // 6. Loser fades
    if (roundWinner === 'p1') p2block.classList.add('loser');
    if (roundWinner === 'p2') p1block.classList.add('loser');

    // 7. Auto-advance to game over
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
    const { players, scores, matchWinner } = state;

    $('go-trophy').textContent       = '🏆';
    $('go-trophy').style.animation   = '';
    typewriter($('go-winner-name'), players[matchWinner]);
    const loser = matchWinner === 'p1' ? players.p2 : players.p1;
    $('go-title-suffix').textContent = ' gana!';
    $('go-subtitle').textContent     = `${loser} tendrá que mejorar su instinto. ¿Revancha?`;
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
    const state = GameOOELocal.configure(p1, p2, mode);
    HGA.gameStart(mode);
    pickingPlayer = 'p1';
    populatePick(state);
    goTo('pick', 'fwd');
    GameAudio.playTick();
  });

  // Bet button selection (P1 only)
  $('bet-buttons').addEventListener('click', e => {
    const btn = e.target.closest('.btn-bet');
    if (!btn || transitioning || pickingPlayer !== 'p1') return;
    $('bet-buttons').querySelectorAll('.btn-bet').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    pendingBet = btn.dataset.bet;
    const confirmBtn = $('btn-confirm');
    if (confirmBtn) confirmBtn.disabled = pendingBet === null || pendingFingers === null;
    GameAudio.playTick();
  });

  // Finger button — P1 selects + awaits confirm; P2 auto-submits
  $('finger-buttons').addEventListener('click', async e => {
    const btn = e.target.closest('.btn-finger');
    if (!btn || transitioning) return;

    $('finger-buttons').querySelectorAll('.btn-finger').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    pendingFingers = parseInt(btn.dataset.f, 10);
    GameAudio.playTick();

    if (pickingPlayer === 'p1') {
      const confirmBtn = $('btn-confirm');
      if (confirmBtn) confirmBtn.disabled = pendingBet === null || pendingFingers === null;
    } else {
      // P2: auto-submit on finger click
      $('finger-buttons').querySelectorAll('.btn-finger').forEach(b => b.disabled = true);
      await new Promise(r => setTimeout(r, 300));
      const state = GameOOELocal.p2Pick(pendingFingers);
      HGA.pickMade({ player: 'p2', pick_fingers: pendingFingers, round: state.round });
      HGA.roundResult(state.roundWinner, { round: state.round });
      populateResult(state);
      await goTo('result', 'fwd');
      animateResult(state);  // intentionally not awaited
    }
  });

  // Confirm (P1 submits bet + fingers)
  $('btn-confirm').addEventListener('click', async () => {
    if (transitioning || pendingBet === null || pendingFingers === null) return;
    $('bet-buttons').querySelectorAll('.btn-bet').forEach(b => b.disabled = true);
    $('finger-buttons').querySelectorAll('.btn-finger').forEach(b => b.disabled = true);
    $('btn-confirm').disabled = true;
    GameAudio.playTick();
    await new Promise(r => setTimeout(r, 200));
    const state = GameOOELocal.p1Pick(pendingFingers, pendingBet);
    HGA.pickMade({ player: 'p1', pick_fingers: pendingFingers, pick_bet: pendingBet, round: state.round });
    pickingPlayer = 'p2';
    await curtainWrap(() => {
      populateHandoff(state);
      activeScreen().classList.remove('active');
      screens.handoff.classList.add('active');
    });
  });

  $('btn-handoff-ready').addEventListener('click', () => {
    if (transitioning) return;
    const state = GameOOELocal.getState();
    populatePick(state);
    goTo('pick', 'fwd');
    GameAudio.playTick();
  });

  $('btn-next-round').addEventListener('click', () => {
    if (transitioning) return;
    pickingPlayer = 'p1';
    const state = GameOOELocal.nextRound();
    populatePick(state);
    goTo('pick', 'fwd');
  });

  $('btn-revenge').addEventListener('click', () => {
    if (transitioning) return;
    HGA.revenge();
    pickingPlayer = 'p1';
    const state = GameOOELocal.revenge();
    populatePick(state);
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-result').addEventListener('click', () => {
    if (transitioning) return;
    GameOOELocal.newGame();
    $('name-p1').value = '';
    $('name-p2').value = '';
    goTo('setup', 'back');
  });

  $('btn-revenge-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    HGA.revenge();
    pickingPlayer = 'p1';
    const state = GameOOELocal.revenge();
    populatePick(state);
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    GameOOELocal.newGame();
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
