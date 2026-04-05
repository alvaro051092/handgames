/* ═══════════════════════════════════════════════════════════
   ui-rpsls-local.js — DOM orchestrator for 2-player local (RPSLS).
   Depends on: window.GameRPSLSLocal, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
  const G = window.GameRPSLSLocal;
  const _lang = document.documentElement.lang || 'es';
  const REASONS = G.reasons();

  const META = {
    rock:     { emoji: '🪨', es: 'Piedra',  en: 'Rock',     pt: 'Pedra'   },
    paper:    { emoji: '📄', es: 'Papel',   en: 'Paper',    pt: 'Papel'   },
    scissors: { emoji: '✂️',  es: 'Tijeras', en: 'Scissors', pt: 'Tesoura' },
    lizard:   { emoji: '🦎', es: 'Lagarto', en: 'Lizard',   pt: 'Lagarto' },
    spock:    { emoji: '🖖', es: 'Spock',   en: 'Spock',    pt: 'Spock'   },
  };

  const T = {
    es: {
      round:      r => `Ronda ${r}`,
      single:     'Intento único',
      p1Pick:     name => `${name}, elige tu jugada`,
      p2Pick:     name => `${name}, elige tu jugada`,
      handoffMsg: name => `Pasa el dispositivo a ${name}`,
      handoffBtn: 'Listo →',
      bannerWin:  (name, reason) => `🏆 ¡${name} gana! ${reason}`,
      bannerDraw: '🤝 ¡Empate!',
      nextRound:  'Siguiente ronda →',
      revenge:    '🔄 Revancha',
      newGame:    'Nueva partida',
      wins:       name => `¡${name} gana!`,
      sub:        loser => `¡${loser} quiere revancha!`,
      subDraw:    '¡Nadie pudo con nadie!',
    },
    en: {
      round:      r => `Round ${r}`,
      single:     'Single game',
      p1Pick:     name => `${name}, choose your move`,
      p2Pick:     name => `${name}, choose your move`,
      handoffMsg: name => `Pass the device to ${name}`,
      handoffBtn: 'Ready →',
      bannerWin:  (name, reason) => `🏆 ${name} wins! ${reason}`,
      bannerDraw: '🤝 Draw!',
      nextRound:  'Next round →',
      revenge:    '🔄 Rematch',
      newGame:    'New game',
      wins:       name => `${name} wins!`,
      sub:        loser => `${loser} wants a rematch!`,
      subDraw:    'Nobody could beat nobody!',
    },
    pt: {
      round:      r => `Rodada ${r}`,
      single:     'Partida única',
      p1Pick:     name => `${name}, escolha sua jogada`,
      p2Pick:     name => `${name}, escolha sua jogada`,
      handoffMsg: name => `Passe o dispositivo para ${name}`,
      handoffBtn: 'Pronto →',
      bannerWin:  (name, reason) => `🏆 ${name} vence! ${reason}`,
      bannerDraw: '🤝 Empate!',
      nextRound:  'Próxima rodada →',
      revenge:    '🔄 Revanche',
      newGame:    'Nova partida',
      wins:       name => `${name} vence!`,
      sub:        loser => `${loser} quer revanche!`,
      subDraw:    'Ninguém venceu ninguém!',
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
    pick:     $('screen-pick'),
    handoff:  $('screen-handoff'),
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

  let _currentPicker = 'p1';
  let _names = { p1: '', p2: '' };

  function populatePick(state) {
    _currentPicker = state.phase === 'p1-pick' ? 'p1' : 'p2';
    const name = state.names[_currentPicker];
    $('pick-prompt').textContent = _currentPicker === 'p1' ? i.p1Pick(name) : i.p2Pick(name);
    $('pick-round-badge').textContent = state.mode === 'best-of-3'
      ? i.round(state.round) : i.single;
    setScoreDigit($('roll-p1'), state.scores.p1);
    setScoreDigit($('roll-p2'), state.scores.p2);
    $('sb-name-p1').textContent = state.names.p1;
    $('sb-name-p2').textContent = state.names.p2;
    document.querySelectorAll('.btn-pick').forEach(b => {
      b.classList.remove('selected'); b.disabled = false;
    });
  }

  function populateHandoff(state) {
    const nextName = state.names.p2;
    $('handoff-msg').textContent = i.handoffMsg(nextName);
    $('btn-handoff-ready').textContent = i.handoffBtn;
  }

  function populateResult(state) {
    const { picks, scores, roundWinner, reason, round, mode, names } = state;
    setScoreDigit($('res-roll-p1'), scores.p1 - (roundWinner === 'p1' ? 1 : 0));
    setScoreDigit($('res-roll-p2'), scores.p2 - (roundWinner === 'p2' ? 1 : 0));
    $('res-name-p1').textContent = names.p1;
    $('res-name-p2').textContent = names.p2;
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

    $('btn-next-round').style.display  = (roundWinner !== 'draw' && state.matchWinner === null) ? 'flex' : 'none';
    $('btn-retry-round').style.display = roundWinner === 'draw' ? 'flex' : 'none';
  }

  function populateGameover(state) {
    const { names, scores, matchWinner } = state;
    const win = matchWinner !== 'draw';
    $('go-trophy').textContent = win ? '🏆' : '🤝';
    typewriter($('go-winner-name'), win ? names[matchWinner] : '');
    $('go-title-suffix').textContent = win
      ? (_lang==='pt'?' vence!':_lang==='en'?' wins!':' ¡gana!')
      : i.subDraw;
    $('go-subtitle').textContent = win
      ? i.sub(names[matchWinner === 'p1' ? 'p2' : 'p1'])
      : '';
    $('go-name-p1').textContent = names.p1;
    $('go-name-p2').textContent = names.p2;
    setScoreDigit($('go-val-p1'), scores.p1);
    setScoreDigit($('go-val-p2'), scores.p2);
    if (win) { spawnConfetti(); GameAudio.playFanfare(); }
    else      { GameAudio.playDraw(); }
  }

  /* ── Events ── */
  $('btn-start').addEventListener('click', () => {
    const p1 = $('name-p1').value.trim() || (_lang==='en'?'Player 1':_lang==='pt'?'Jogador 1':'Jugador 1');
    const p2 = $('name-p2').value.trim() || (_lang==='en'?'Player 2':_lang==='pt'?'Jogador 2':'Jugador 2');
    const mode = document.querySelector('input[name="mode"]:checked').value;
    _names = { p1, p2 };
    const state = G.configure(p1, p2, mode);
    populatePick(state);
    goTo('pick', 'fwd');
    GameAudio.playTick();
  });

  document.querySelectorAll('.btn-pick').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (transitioning) return;
      const pick = btn.dataset.pick;
      document.querySelectorAll('.btn-pick').forEach(b => { b.disabled = true; b.classList.remove('selected'); });
      btn.classList.add('selected');
      GameAudio.playTick();
      const state = G.getState();
      if (state.phase === 'p1-pick') {
        G.p1Pick(pick);
        populateHandoff(G.getState());
        await goTo('handoff', 'fwd');
      } else {
        const result = G.p2Pick(pick);
        populateResult(result);
        await goTo('result', 'fwd');
        if (result.matchWinner !== null) {
          setTimeout(() => { populateGameover(result); goTo('gameover'); }, 1800);
        }
      }
    });
  });

  $('btn-handoff-ready').addEventListener('click', () => {
    if (transitioning) return;
    const state = G.getState();
    // Reset to p2 pick
    const next = { ...state, phase: 'p2-pick' };
    populatePick({ ...state, phase: 'p2-pick', names: state.names });
    // Manually set phase label
    $('pick-prompt').textContent = i.p2Pick(state.names.p2);
    goTo('pick', 'fwd');
    GameAudio.playTick();
  });

  $('btn-next-round').addEventListener('click', () => {
    if (transitioning) return;
    const state = G.nextRound();
    populatePick(state);
    goTo('pick', 'fwd');
  });

  $('btn-retry-round').addEventListener('click', () => {
    if (transitioning) return;
    const state = G.nextRound();
    populatePick(state);
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-revenge').addEventListener('click', () => {
    if (transitioning) return;
    const state = G.revenge();
    populatePick(state);
    goTo('pick', 'back');
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
    const state = G.revenge();
    populatePick(state);
    goTo('pick', 'back');
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
    $('btn-mute').textContent = muted ? '🔇' : '🔊';
  });

})();
