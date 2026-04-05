/* ═══════════════════════════════════════════════════════════
   ui-chopsticks-local.js — DOM orchestrator for 2-player local (Chopsticks).
   Depends on: window.GameChopsticksLocal, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
  const G = window.GameChopsticksLocal;

  /* ── i18n ── */
  const _lang = document.documentElement.lang || 'es';
  const T = {
    es: {
      yourTurn:    n => `Turno de ${n}`,
      selectHand:  'Selecciona tu mano para atacar',
      selectTarget:'Ahora selecciona la mano del rival',
      youAttacked: (from, to) => `Tocó ${_side(from,'es')} → rival ${_side(to,'es')}`,
      roundWon:    (name, sc) => `¡${name} ganó esta partida! (${sc})`,
      nextGame:    'Siguiente partida →',
      wins:        name => `¡${name} gana!`,
      sub:         loser => `¡${loser} va a querer revancha!`,
      mode3:       r => `Partida ${r}`,
      mode1:       'Partida única',
      left: 'Izq', right: 'Der',
    },
    en: {
      yourTurn:    n => `${n}'s turn`,
      selectHand:  'Select your hand to attack',
      selectTarget:'Now select the opponent hand',
      youAttacked: (from, to) => `Tapped ${_side(from,'en')} → rival ${_side(to,'en')}`,
      roundWon:    (name, sc) => `${name} won this game! (${sc})`,
      nextGame:    'Next game →',
      wins:        name => `${name} wins!`,
      sub:         loser => `${loser} will want a rematch!`,
      mode3:       r => `Game ${r}`,
      mode1:       'Single game',
      left: 'L', right: 'R',
    },
    pt: {
      yourTurn:    n => `Vez de ${n}`,
      selectHand:  'Selecione sua mão para atacar',
      selectTarget:'Agora selecione a mão do rival',
      youAttacked: (from, to) => `Tocou ${_side(from,'pt')} → rival ${_side(to,'pt')}`,
      roundWon:    (name, sc) => `${name} ganhou esta partida! (${sc})`,
      nextGame:    'Próxima partida →',
      wins:        name => `${name} vence!`,
      sub:         loser => `${loser} vai querer revanche!`,
      mode3:       r => `Partida ${r}`,
      mode1:       'Partida única',
      left: 'Esq', right: 'Dir',
    },
  };
  const i = T[_lang] || T.es;

  function _side(s, lang) {
    const map = { es:{left:'izq',right:'der'}, en:{left:'left',right:'right'}, pt:{left:'esq',right:'dir'} };
    return (map[lang]||map.es)[s]||s;
  }

  /* ── State ── */
  let _transitioning = false;
  let _selectedHand  = null;
  let _gameCount     = 0;

  /* ── Utilities ── */
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
    const next = document.createElement('span');
    next.className = 'score-digit roll-in';
    next.textContent = nv;
    rollEl.appendChild(next);
    setTimeout(() => { cur.remove(); next.classList.remove('roll-in'); }, 320);
  }

  function typewriter(el, text) {
    el.innerHTML = '';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }
    [...text].forEach((ch, k) => {
      const s = document.createElement('span');
      s.className = 'tw-char'; s.textContent = ch === ' ' ? '\u00a0' : ch;
      s.style.animationDelay = `${k * 45}ms`;
      el.appendChild(s);
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

  /* ── Screen transitions ── */
  const screens = {
    setup:       $('screen-setup'),
    game:        $('screen-game'),
    'round-over':$('screen-round-over'),
    gameover:    $('screen-gameover'),
  };

  function activeScreen() { return document.querySelector('.screen.active'); }

  async function goTo(nextId, dir = 'fwd') {
    if (_transitioning) return;
    _transitioning = true;
    const cur = activeScreen(), next = screens[nextId];
    if (!cur || !next || cur === next) { _transitioning = false; return; }
    const d = `dir-${dir}`;
    cur.classList.add('s-exiting', d); cur.classList.remove('active');
    next.classList.add('active', 's-entering', d);
    await Promise.all([onceAnim(cur, 500), onceAnim(next, 500)]);
    cur.classList.remove('s-exiting', d); next.classList.remove('s-entering', d);
    _transitioning = false;
  }

  /* ── Board ── */

  function renderHand(id, count) {
    const el = $(id);
    el.className = 'chop-hand';
    el.querySelector('.h-emoji').textContent = G.emoji(count);
    el.querySelector('.h-count').textContent = count;
    if (count === 0) el.classList.add('elim');
  }

  function renderBoard(state) {
    // P2 at top, P1 at bottom (fixed positions)
    renderHand('hand-p2-left',  state.p2.left);
    renderHand('hand-p2-right', state.p2.right);
    renderHand('hand-p1-left',  state.p1.left);
    renderHand('hand-p1-right', state.p1.right);

    $('sb-name-p1').textContent = state.names.p1;
    $('sb-name-p2').textContent = state.names.p2;
    animateScore($('roll-p1'), state.scores.p1);
    animateScore($('roll-p2'), state.scores.p2);

    $('turn-badge').textContent = i.yourTurn(state.names[state.turn]);

    ['p1','p2'].forEach(p => {
      $(`h-label-${p}-left`).textContent  = i.left;
      $(`h-label-${p}-right`).textContent = i.right;
      $(`label-${p}`).textContent = state.names[p];
    });

    if (state.lastMove) {
      $('last-move-text').textContent = i.youAttacked(state.lastMove.from, state.lastMove.to);
    } else {
      $('last-move-text').textContent = '';
    }

    _applyInteractivity(state);
  }

  function _applyInteractivity(state) {
    ['p1-left','p1-right','p2-left','p2-right'].forEach(id => {
      $(`hand-${id}`).classList.remove('selectable','selected','targetable');
    });
    _selectedHand = null;

    if (state.phase !== 'game') { $('hint-text').textContent = ''; return; }

    const cur = state.turn;           // 'p1' | 'p2'
    const opp = cur === 'p1' ? 'p2' : 'p1';

    ['left','right'].forEach(s => {
      if (state[cur][s] > 0) $(`hand-${cur}-${s}`).classList.add('selectable');
    });
    $('hint-text').textContent = i.selectHand;
  }

  /* ── Click handler ── */

  function onHandClick(who, side) {
    const state = G.getState();
    if (!state || state.phase !== 'game' || _transitioning) return;

    const cur = state.turn;
    const opp = cur === 'p1' ? 'p2' : 'p1';

    if (who === cur) {
      // Selecting attacking hand
      if (state[cur][side] === 0) return;
      _selectedHand = side;

      ['left','right'].forEach(s => {
        const el = $(`hand-${cur}-${s}`);
        el.classList.remove('selectable','selected');
        if (state[cur][s] > 0) el.classList.add(s === side ? 'selected' : 'selectable');
      });
      ['left','right'].forEach(s => {
        const el = $(`hand-${opp}-${s}`);
        el.classList.remove('targetable');
        if (state[opp][s] > 0) el.classList.add('targetable');
      });
      $('hint-text').textContent = i.selectTarget;
      GameAudio.playTick();

    } else if (who === opp) {
      // Executing attack
      if (!_selectedHand || state[opp][side] === 0) return;
      const newState = G.tap(_selectedHand, side);
      if (!newState) return;

      const hitEl = $(`hand-${opp}-${side}`);
      hitEl.classList.add('chop-hit');
      setTimeout(() => hitEl.classList.remove('chop-hit'), 400);
      GameAudio.playTick();
      renderBoard(newState);

      if (newState.phase === 'gameover') {
        setTimeout(() => { populateGameover(newState); goTo('gameover'); }, 900);
      } else if (newState.phase === 'round-over') {
        _gameCount++;
        setTimeout(() => { populateRoundOver(newState); goTo('round-over'); }, 900);
      }
    }
  }

  /* ── Round over ── */

  function populateRoundOver(state) {
    const winner = state.roundWinner;
    $('ro-trophy').textContent = '🏆';
    $('ro-title').textContent  = i.roundWon(state.names[winner], `${state.scores.p1}—${state.scores.p2}`);
    $('btn-next-game').textContent = i.nextGame;
  }

  /* ── Game over ── */

  function populateGameover(state) {
    const winner = state.winner;
    $('go-trophy').textContent = '🏆';
    typewriter($('go-winner-name'), state.names[winner]);
    $('go-title-suffix').textContent = _lang === 'pt' ? ' vence!' : _lang === 'en' ? ' wins!' : ' gana!';
    $('go-subtitle').textContent = i.sub(state.names[winner === 'p1' ? 'p2' : 'p1']);
    $('go-name-p1').textContent  = state.names.p1;
    $('go-name-p2').textContent  = state.names.p2;
    setScoreDigit($('go-val-p1'), state.scores.p1);
    setScoreDigit($('go-val-p2'), state.scores.p2);
    spawnConfetti();
    GameAudio.playFanfare();
  }

  /* ── Events ── */

  $('btn-start').addEventListener('click', () => {
    const p1 = $('name-p1').value.trim() || (_lang === 'en' ? 'Player 1' : _lang === 'pt' ? 'Jogador 1' : 'Jugador 1');
    const p2 = $('name-p2').value.trim() || (_lang === 'en' ? 'Player 2' : _lang === 'pt' ? 'Jogador 2' : 'Jugador 2');
    const mode = document.querySelector('input[name="mode"]:checked').value;
    _gameCount = 0;
    const state = G.configure(p1, p2, mode);
    renderBoard(state);
    goTo('game', 'fwd');
    GameAudio.playTick();
  });

  document.querySelectorAll('.chop-hand').forEach(btn => {
    btn.addEventListener('click', () => onHandClick(btn.dataset.who, btn.dataset.side));
  });

  $('btn-next-game').addEventListener('click', () => {
    if (_transitioning) return;
    const state = G.nextRound();
    renderBoard(state);
    goTo('game', 'fwd');
  });

  $('btn-new-series').addEventListener('click', () => {
    if (_transitioning) return;
    G.newGame();
    $('name-p1').value = ''; $('name-p2').value = '';
    goTo('setup', 'back');
  });

  $('btn-revenge-go').addEventListener('click', () => {
    if (_transitioning) return;
    $('confetti-container').innerHTML = '';
    _gameCount = 0;
    const state = G.revenge();
    renderBoard(state);
    goTo('game', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-go').addEventListener('click', () => {
    if (_transitioning) return;
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
