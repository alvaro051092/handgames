/* ═══════════════════════════════════════════════════════════
   ui-morra-battle.js — DOM orchestrator for Battle mode (Morra).
   CPU picks everything; closest guess wins. Dramatic reveal.
   Depends on: window.GameMorraBattle, window.GameAudio
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
    battle:   $('screen-battle'),
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

  /* ──────────── Battle Screen ──────────── */

  function populateBattle(state) {
    $('battle-name-p1').textContent = state.players.p1;
    $('battle-name-p2').textContent = state.players.p2;
    $('sb-name-p1').textContent     = state.players.p1;
    $('sb-name-p2').textContent     = state.players.p2;
    setScoreDigit($('roll-p1'), state.scores.p1);
    setScoreDigit($('roll-p2'), state.scores.p2);
    $('battle-round-badge').textContent =
      state.mode === 'best-of-3' ? `Ronda ${state.round}` : 'Intento único';

    // Reset fists
    const fist1 = $('battle-fist-p1');
    const fist2 = $('battle-fist-p2');
    fist1.textContent = '✊';
    fist2.textContent = '✊';
    fist1.classList.remove('fist-open');
    fist2.classList.remove('fist-open');

    $('btn-reveal').disabled = false;
    revealing = false;
  }

  /* ──────────── Result Screen ──────────── */

  function populateResult(state) {
    const { players, scores, picks, total, roundWinner, p1Correct, p2Correct, matchWinner } = state;

    const preP1 = scores.p1 - (roundWinner === 'p1' ? 1 : 0);
    const preP2 = scores.p2 - (roundWinner === 'p2' ? 1 : 0);
    $('res-name-p1').textContent = players.p1;
    $('res-name-p2').textContent = players.p2;
    setScoreDigit($('res-roll-p1'), preP1);
    setScoreDigit($('res-roll-p2'), preP2);
    $('res-round-badge').textContent =
      state.mode === 'best-of-3' ? `Ronda ${state.round}` : 'Intento único';

    $('res-p1-name').textContent  = players.p1;
    $('res-p1-num').textContent   = picks.p1Fingers;
    $('res-p1-guess').textContent = `apostó: ${picks.p1Guess}`;

    $('res-p2-name').textContent  = players.p2;
    $('res-p2-num').textContent   = picks.p2Fingers;
    $('res-p2-guess').textContent = `apostó: ${picks.p2Guess}`;

    $('res-total-value').textContent = `${picks.p1Fingers} + ${picks.p2Fingers} = ${total}`;

    const banner = $('result-banner');
    banner.className   = 'result-banner';
    banner.textContent = '';

    const p1Block = $('res-p1-block');
    const p2Block = $('res-p2-block');
    p1Block.classList.remove('enter-left', 'loser');
    p2Block.classList.remove('enter-right', 'loser');

    // Animate
    p1Block.classList.add('enter-left');
    p2Block.classList.add('enter-right');

    setTimeout(() => {
      if (roundWinner === 'p1') animateScore($('res-roll-p1'), scores.p1);
      if (roundWinner === 'p2') animateScore($('res-roll-p2'), scores.p2);

      if (p1Correct && !p2Correct) {
        banner.textContent = `✅ ¡${players.p1} acertó el total ${total}!`;
        banner.classList.add('banner-win', 'show');
        p2Block.classList.add('loser');
        GameAudio.playWin();
      } else if (p2Correct && !p1Correct) {
        banner.textContent = `✅ ¡${players.p2} acertó el total ${total}!`;
        banner.classList.add('banner-win', 'show');
        p1Block.classList.add('loser');
        GameAudio.playWin();
      } else {
        const d1 = Math.abs(picks.p1Guess - total);
        const d2 = Math.abs(picks.p2Guess - total);
        const winnerName = roundWinner === 'p1' ? players.p1 : players.p2;
        const loserBlock = roundWinner === 'p1' ? p2Block : p1Block;
        const diff = Math.min(d1, d2);
        banner.textContent = `🎯 ¡${winnerName} estuvo más cerca! (±${diff} del total ${total})`;
        banner.classList.add('banner-win', 'show');
        loserBlock.classList.add('loser');
        GameAudio.playWin();
      }

      if (matchWinner !== null) {
        setTimeout(() => {
          populateGameover(state);
          goTo('gameover', 'fwd');
        }, 1700);
      }
    }, 600);

    $('btn-next-round').style.display = matchWinner === null ? 'flex' : 'none';
  }

  /* ──────────── Game Over Screen ──────────── */

  function populateGameover(state) {
    const { players, scores, matchWinner } = state;

    $('go-trophy').textContent     = '🏆';
    $('go-trophy').style.animation = '';
    const winnerName = matchWinner === 'p1' ? players.p1 : players.p2;
    const loserName  = matchWinner === 'p1' ? players.p2 : players.p1;
    typewriter($('go-winner-name'), winnerName);
    $('go-title-suffix').textContent = ' gana!';
    $('go-subtitle').textContent     = `¡La suerte le sonrió! ${loserName} pedirá revancha.`;
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
    const state = GameMorraBattle.configure(p1, p2, mode);
    populateBattle(state);
    goTo('battle', 'fwd');
    GameAudio.playTick();
  });

  $('btn-reveal').addEventListener('click', async () => {
    if (transitioning || revealing) return;
    revealing = true;
    $('btn-reveal').disabled = true;

    // Animate fists opening
    const fist1 = $('battle-fist-p1');
    const fist2 = $('battle-fist-p2');

    GameAudio.playTick();
    await new Promise(r => setTimeout(r, 150));
    fist1.classList.add('fist-open');
    fist2.classList.add('fist-open');
    await new Promise(r => setTimeout(r, 300));

    const state = GameMorraBattle.reveal();
    fist1.textContent = state.picks.p1Fingers;
    fist2.textContent = state.picks.p2Fingers;
    await new Promise(r => setTimeout(r, 400));

    populateResult(state);
    await goTo('result', 'fwd');
  });

  $('btn-next-round').addEventListener('click', () => {
    if (transitioning) return;
    const state = GameMorraBattle.nextRound();
    populateBattle(state);
    goTo('battle', 'fwd');
  });

  $('btn-revenge').addEventListener('click', () => {
    if (transitioning) return;
    const state = GameMorraBattle.revenge();
    populateBattle(state);
    goTo('battle', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-result').addEventListener('click', () => {
    if (transitioning) return;
    GameMorraBattle.newGame();
    $('name-p1').value = '';
    $('name-p2').value = '';
    goTo('setup', 'back');
  });

  $('btn-revenge-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    const state = GameMorraBattle.revenge();
    populateBattle(state);
    goTo('battle', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    GameMorraBattle.newGame();
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
