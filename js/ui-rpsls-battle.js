/* ═══════════════════════════════════════════════════════════
   ui-rpsls-battle.js — DOM orchestrator for Battle mode (RPSLS).
   Depends on: window.GameRPSLSBattle, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
  const G = window.GameRPSLSBattle;
  const _lang = document.documentElement.lang || 'es';

  const META = G.meta();
  const REASONS = G.reasons();

  const T = {
    es: {
      round:      r => `Ronda ${r}`,
      single:     'Intento único',
      reveal:     '¡Revelar!',
      bannerWin:  (name, reason) => `🏆 ¡${name} gana! ${reason}`,
      bannerDraw: '🤝 ¡Empate!',
      nextRound:  'Siguiente ronda →',
      revenge:    '🔄 Revancha',
      newGame:    'Nueva partida',
      changeMode: 'Cambiar modo',
      wins:       name => `¡${name} gana!`,
      sub:        (w, l) => `${w} dominó. ¡${l} no tuvo suerte!`,
      subDraw:    '¡Nadie pudo con nadie esta vez!',
    },
    en: {
      round:      r => `Round ${r}`,
      single:     'Single game',
      reveal:     'Reveal!',
      bannerWin:  (name, reason) => `🏆 ${name} wins! ${reason}`,
      bannerDraw: '🤝 Draw!',
      nextRound:  'Next round →',
      revenge:    '🔄 Rematch',
      newGame:    'New game',
      changeMode: 'Change mode',
      wins:       name => `${name} wins!`,
      sub:        (w, l) => `${w} dominated. ${l} had no luck!`,
      subDraw:    "Nobody could beat anybody this time!",
    },
    pt: {
      round:      r => `Rodada ${r}`,
      single:     'Partida única',
      reveal:     'Revelar!',
      bannerWin:  (name, reason) => `🏆 ${name} vence! ${reason}`,
      bannerDraw: '🤝 Empate!',
      nextRound:  'Próxima rodada →',
      revenge:    '🔄 Revanche',
      newGame:    'Nova partida',
      changeMode: 'Mudar modo',
      wins:       name => `${name} vence!`,
      sub:        (w, l) => `${w} dominou. ${l} não teve sorte!`,
      subDraw:    'Ninguém venceu ninguém desta vez!',
    },
  };
  const i = T[_lang] || T.es;

  /* ── Utils ── */
  let transitioning = false;
  const $ = id => document.getElementById(id);

  function onceAnim(el, timeout = 500) {
    return new Promise(resolve => {
      const t = setTimeout(resolve, timeout);
      function h(e) { if (e.target !== el) return; clearTimeout(t); el.removeEventListener('animationend', h); resolve(); }
      el.addEventListener('animationend', h);
    });
  }
  function reflow(el) { void el.offsetWidth; }
  function setScoreDigit(rollEl, v) { rollEl.innerHTML = `<span class="score-digit">${v}</span>`; }
  function animateScore(rollEl, nv) {
    const cur = rollEl.querySelector('.score-digit');
    if (!cur) { setScoreDigit(rollEl, nv); return; }
    if (cur.textContent === String(nv)) return;
    cur.classList.add('roll-out');
    const next = document.createElement('span'); next.className = 'score-digit roll-in'; next.textContent = nv;
    rollEl.appendChild(next);
    setTimeout(() => { cur.remove(); next.classList.remove('roll-in'); }, 320);
  }
  function typewriter(el, text) {
    el.innerHTML = '';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }
    [...text].forEach((ch, k) => {
      const s = document.createElement('span'); s.className = 'tw-char';
      s.textContent = ch === ' ' ? '\u00a0' : ch;
      s.style.animationDelay = `${k * 45}ms`; el.appendChild(s);
    });
  }
  function spawnConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = $('confetti-container'); c.innerHTML = '';
    const COLORS = ['#7c3aed','#a855f7','#0ea5e9','#22c55e','#f59e0b','#ef4444','#ec4899'];
    for (let k = 0; k < 35; k++) {
      const p = document.createElement('div'); p.className = 'confetti-piece';
      const w = 6 + Math.random()*7;
      p.style.cssText = [`left:${(Math.random()*100).toFixed(1)}%`,`width:${w.toFixed(1)}px`,
        `height:${(w*(1.4+Math.random())).toFixed(1)}px`,
        `background:${COLORS[Math.floor(Math.random()*COLORS.length)]}`,
        `animation-delay:${(Math.random()*0.9).toFixed(2)}s`,
        `animation-duration:${(0.9+Math.random()*0.7).toFixed(2)}s`,
        `transform:rotate(${Math.floor(Math.random()*360)}deg)`,
        `border-radius:${Math.random()>.5?'50%':'3px'}`].join(';');
      c.appendChild(p);
    }
    setTimeout(() => { c.innerHTML = ''; }, 2800);
  }

  /* ── Screens ── */
  const screens = {
    setup:    $('screen-setup'),
    battle:   $('screen-battle'),
    result:   $('screen-result'),
    gameover: $('screen-gameover'),
  };
  function activeScreen() { return document.querySelector('.screen.active'); }
  async function goTo(nextId, dir = 'fwd') {
    if (transitioning) return;
    transitioning = true;
    const cur = activeScreen(), next = screens[nextId];
    if (!cur || !next || cur === next) { transitioning = false; return; }
    const d = `dir-${dir}`;
    cur.classList.add('s-exiting', d); cur.classList.remove('active');
    next.classList.add('active', 's-entering', d);
    await Promise.all([onceAnim(cur, 500), onceAnim(next, 500)]);
    cur.classList.remove('s-exiting', d); next.classList.remove('s-entering', d);
    transitioning = false;
  }

  function populateBattle(state) {
    $('sb-name-p1').textContent = state.names.p1;
    $('sb-name-p2').textContent = state.names.p2;
    setScoreDigit($('roll-p1'), state.scores.p1);
    setScoreDigit($('roll-p2'), state.scores.p2);
    $('battle-round-badge').textContent = state.mode === 'best-of-3'
      ? i.round(state.round) : i.single;
    // Reset fists
    $('battle-fist-p1').textContent = '✊';
    $('battle-fist-p2').textContent = '✊';
    $('btn-reveal').textContent = i.reveal;
    $('btn-reveal').disabled = false;
  }

  async function animateReveal(state) {
    const { picks, roundWinner, reason, scores, names } = state;

    // Animate fists opening
    const f1 = $('battle-fist-p1'), f2 = $('battle-fist-p2');
    f1.classList.add('fist-open');
    f2.classList.add('fist-open');
    await new Promise(r => setTimeout(r, 350));
    f1.textContent = META[picks.p1].emoji;
    f2.textContent = META[picks.p2].emoji;
    f1.classList.remove('fist-open');
    f2.classList.remove('fist-open');

    await new Promise(r => setTimeout(r, 400));

    // Populate result screen
    const { round, mode } = state;
    $('res-name-p1').textContent = names.p1;
    $('res-name-p2').textContent = names.p2;
    setScoreDigit($('res-roll-p1'), scores.p1 - (roundWinner === 'p1' ? 1 : 0));
    setScoreDigit($('res-roll-p2'), scores.p2 - (roundWinner === 'p2' ? 1 : 0));
    $('res-round-badge').textContent = mode === 'best-of-3' ? i.round(round) : i.single;
    $('res-p1-emoji').textContent = META[picks.p1].emoji;
    $('res-p2-emoji').textContent = META[picks.p2].emoji;
    $('res-p1-label').textContent = META[picks.p1][_lang] || META[picks.p1].es;
    $('res-p2-label').textContent = META[picks.p2][_lang] || META[picks.p2].es;

    const banner = $('result-banner');
    const reasonText = reason ? (REASONS[reason]?.[_lang] || '') : '';
    if (roundWinner === 'draw') {
      banner.textContent = i.bannerDraw;
      banner.className = 'result-banner banner-draw show';
      GameAudio.playDraw();
    } else {
      const winnerName = names[roundWinner];
      banner.textContent = i.bannerWin(winnerName, reasonText);
      banner.className = 'result-banner banner-win show';
      if (roundWinner === 'p1') animateScore($('res-roll-p1'), scores.p1);
      else                      animateScore($('res-roll-p2'), scores.p2);
      GameAudio.playWin();
    }

    $('btn-next-round').style.display  = (state.matchWinner === null) ? 'flex' : 'none';
    $('btn-revenge').style.display     = state.matchWinner !== null ? 'inline-flex' : 'none';
    $('btn-new-game-result').style.display = 'inline-flex';

    await goTo('result', 'fwd');

    if (state.matchWinner !== null) {
      setTimeout(() => { populateGameover(state); goTo('gameover'); }, 1800);
    }
  }

  function populateGameover(state) {
    HGA.gameOver(state.matchWinner, state.scores, state.round);
    const { names, scores, matchWinner } = state;
    const isDraw = matchWinner === 'draw';
    $('go-trophy').textContent = isDraw ? '🤝' : '🏆';
    typewriter($('go-winner-name'), isDraw ? '' : names[matchWinner]);
    $('go-title-suffix').textContent = isDraw ? i.subDraw
      : (_lang==='pt'?' vence!':_lang==='en'?' wins!':' ¡gana!');
    $('go-subtitle').textContent = isDraw ? ''
      : i.sub(names[matchWinner], names[matchWinner === 'p1' ? 'p2' : 'p1']);
    $('go-name-p1').textContent = names.p1;
    $('go-name-p2').textContent = names.p2;
    setScoreDigit($('go-val-p1'), scores.p1);
    setScoreDigit($('go-val-p2'), scores.p2);
    if (!isDraw) { spawnConfetti(); GameAudio.playFanfare(); }
    else { GameAudio.playDraw(); }
  }

  /* ── Events ── */
  $('btn-start').addEventListener('click', () => {
    const p1 = $('name-p1').value.trim() || (_lang==='en'?'Player 1':_lang==='pt'?'Jogador 1':'Jugador 1');
    const p2 = $('name-p2').value.trim() || (_lang==='en'?'Player 2':_lang==='pt'?'Jogador 2':'Jugador 2');
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const state = G.configure(p1, p2, mode);
    HGA.gameStart(mode);
    populateBattle(state);
    goTo('battle', 'fwd');
    GameAudio.playTick();
  });

  $('btn-reveal').addEventListener('click', async () => {
    if (transitioning) return;
    $('btn-reveal').disabled = true;
    GameAudio.playTick();
    const state = G.reveal();
    await animateReveal(state);
    HGA.roundResult(state.roundWinner, { pick_p1: state.picks?.p1, pick_p2: state.picks?.p2, round: state.round });
  });

  $('btn-next-round').addEventListener('click', () => {
    if (transitioning) return;
    const state = G.nextRound();
    populateBattle(state);
    goTo('battle', 'fwd');
  });

  $('btn-revenge').addEventListener('click', () => {
    if (transitioning) return;
    HGA.revenge();
    const state = G.revenge();
    populateBattle(state);
    goTo('battle', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-result').addEventListener('click', () => {
    if (transitioning) return;
    G.newGame();
    $('name-p1').value = ''; $('name-p2').value = '';
    goTo('setup', 'back');
  });

  $('btn-revenge-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    HGA.revenge();
    const state = G.revenge();
    populateBattle(state);
    goTo('battle', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    G.newGame();
    $('name-p1').value = ''; $('name-p2').value = '';
    goTo('setup', 'back');
  });

  $('btn-mute').addEventListener('click', () => {
    const muted = GameAudio.toggle();
    HGA.audioToggle(muted);
    $('btn-mute').textContent = muted ? '🔇' : '🔊';
  });

})();
