/* ═══════════════════════════════════════════════════════════
   ui-chopsticks-cpu.js — DOM orchestrator for vs-CPU (Chopsticks).
   Depends on: window.GameChopsticksCPU, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
  const G = window.GameChopsticksCPU;

  /* ── i18n ── */
  const _lang = document.documentElement.lang || 'es';
  const T = {
    es: {
      yourTurn:    'Tu turno',
      cpuThinking: 'CPU pensando…',
      selectHand:  'Selecciona tu mano para atacar',
      selectTarget:'Ahora selecciona la mano de la CPU',
      cpuAttacked: (from, to) => `CPU tocó ${_side(from,'es')} → tu ${_side(to,'es')}`,
      youAttacked: (from, to) => `Tocaste ${_side(from,'es')} → CPU ${_side(to,'es')}`,
      roundWon:    n => `¡Ganaste esta partida! (${n})`,
      roundLost:   n => `CPU ganó esta partida (${n})`,
      nextGame:    'Siguiente partida →',
      playerWins:  name => `¡${name} gana!`,
      cpuWins:     '¡CPU gana!',
      subWin:      '¡Eliminaste ambas manos de la CPU!',
      subLoss:     name => `${name} tendrá revancha. ¡A la próxima!`,
      mode3:       r => `Partida ${r}`,
      mode1:       'Partida única',
      left:        'Izq', right: 'Der',
    },
    en: {
      yourTurn:    'Your turn',
      cpuThinking: 'CPU thinking…',
      selectHand:  'Select your hand to attack',
      selectTarget:'Now select the CPU hand to attack',
      cpuAttacked: (from, to) => `CPU tapped ${_side(from,'en')} → your ${_side(to,'en')}`,
      youAttacked: (from, to) => `You tapped ${_side(from,'en')} → CPU ${_side(to,'en')}`,
      roundWon:    n => `You won this game! (${n})`,
      roundLost:   n => `CPU won this game (${n})`,
      nextGame:    'Next game →',
      playerWins:  name => `${name} wins!`,
      cpuWins:     'CPU wins!',
      subWin:      'You eliminated both CPU hands!',
      subLoss:     name => `${name} will get their revenge. Better luck next time!`,
      mode3:       r => `Game ${r}`,
      mode1:       'Single game',
      left:        'L', right: 'R',
    },
    pt: {
      yourTurn:    'Sua vez',
      cpuThinking: 'CPU pensando…',
      selectHand:  'Selecione sua mão para atacar',
      selectTarget:'Agora selecione a mão da CPU',
      cpuAttacked: (from, to) => `CPU tocou ${_side(from,'pt')} → sua ${_side(to,'pt')}`,
      youAttacked: (from, to) => `Você tocou ${_side(from,'pt')} → CPU ${_side(to,'pt')}`,
      roundWon:    n => `Você ganhou esta partida! (${n})`,
      roundLost:   n => `CPU ganhou esta partida (${n})`,
      nextGame:    'Próxima partida →',
      playerWins:  name => `${name} vence!`,
      cpuWins:     'CPU vence!',
      subWin:      'Você eliminou as duas mãos da CPU!',
      subLoss:     name => `${name} vai querer revanche. Até a próxima!`,
      mode3:       r => `Partida ${r}`,
      mode1:       'Partida única',
      left:        'Esq', right: 'Dir',
    },
  };
  const i = T[_lang] || T.es;

  function _side(s, lang) {
    const map = { es: { left: 'izq', right: 'der' }, en: { left: 'left', right: 'right' }, pt: { left: 'esq', right: 'dir' } };
    return (map[lang] || map.es)[s] || s;
  }

  /* ── State ── */
  let _transitioning = false;
  let _selectedHand  = null;   // 'left' | 'right' | null
  let _cpuThinking   = false;
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

  function setScoreDigit(rollEl, value) {
    rollEl.innerHTML = `<span class="score-digit">${value}</span>`;
  }

  function animateScore(rollEl, newValue) {
    const cur = rollEl.querySelector('.score-digit');
    if (!cur) { setScoreDigit(rollEl, newValue); return; }
    if (cur.textContent === String(newValue)) return;
    cur.classList.add('roll-out');
    const next = document.createElement('span');
    next.className = 'score-digit roll-in';
    next.textContent = newValue;
    rollEl.appendChild(next);
    setTimeout(() => { cur.remove(); next.classList.remove('roll-in'); }, 320);
  }

  function typewriter(el, text) {
    el.innerHTML = '';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }
    [...text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'tw-char';
      s.textContent = ch === ' ' ? '\u00a0' : ch;
      s.style.animationDelay = `${i * 45}ms`;
      el.appendChild(s);
    });
  }

  function spawnConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = $('confetti-container');
    c.innerHTML = '';
    const COLORS = ['#7c3aed','#a855f7','#0ea5e9','#22c55e','#f59e0b','#ef4444','#ec4899'];
    for (let k = 0; k < 35; k++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      const w = 6 + Math.random() * 7;
      p.style.cssText = [
        `left:${(Math.random()*100).toFixed(1)}%`, `width:${w.toFixed(1)}px`,
        `height:${(w*(1.4+Math.random())).toFixed(1)}px`,
        `background:${COLORS[Math.floor(Math.random()*COLORS.length)]}`,
        `animation-delay:${(Math.random()*0.9).toFixed(2)}s`,
        `animation-duration:${(0.9+Math.random()*0.7).toFixed(2)}s`,
        `transform:rotate(${Math.floor(Math.random()*360)}deg)`,
        `border-radius:${Math.random()>.5?'50%':'3px'}`,
      ].join(';');
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
    const cur  = activeScreen();
    const next = screens[nextId];
    if (!cur || !next || cur === next) { _transitioning = false; return; }
    const d = `dir-${dir}`;
    cur.classList.add('s-exiting', d);
    cur.classList.remove('active');
    next.classList.add('active', 's-entering', d);
    await Promise.all([onceAnim(cur, 500), onceAnim(next, 500)]);
    cur.classList.remove('s-exiting', d);
    next.classList.remove('s-entering', d);
    _transitioning = false;
  }

  /* ── Board rendering ── */

  function renderHand(id, count, extraClasses) {
    const el = $(id);
    el.className = 'chop-hand';
    if (extraClasses) extraClasses.forEach(c => el.classList.add(c));
    el.querySelector('.h-emoji').textContent = G.emoji(count);
    el.querySelector('.h-count').textContent = count;
    if (count === 0) el.classList.add('elim');
  }

  function renderBoard(state) {
    renderHand('hand-cpu-left',    state.cpu.left);
    renderHand('hand-cpu-right',   state.cpu.right);
    renderHand('hand-player-left', state.player.left);
    renderHand('hand-player-right',state.player.right);

    $('sb-name-player').textContent = state.names.player;
    animateScore($('roll-player'), state.scores.player);
    animateScore($('roll-cpu'),    state.scores.cpu);

    $('turn-badge').textContent = state.turn === 'player' ? i.yourTurn : i.cpuThinking;

    const label = i[_lang === 'es' ? 'left' : 'left'];
    $('h-label-cpu-left').textContent    = i.left;
    $('h-label-cpu-right').textContent   = i.right;
    $('h-label-player-left').textContent = i.left;
    $('h-label-player-right').textContent= i.right;

    if (state.lastMove) {
      const m = state.lastMove;
      $('last-move-text').textContent = m.by === 'player'
        ? i.youAttacked(m.from, m.to)
        : i.cpuAttacked(m.from, m.to);
    } else {
      $('last-move-text').textContent = '';
    }

    const badge = $('game-count-badge');
    if (badge) {
      badge.textContent = state.mode === 'best-of-3'
        ? i.mode3(_gameCount + 1)
        : i.mode1;
    }

    _applyInteractivity(state);
  }

  function _applyInteractivity(state) {
    ['cpu-left','cpu-right','player-left','player-right'].forEach(id => {
      $(`hand-${id}`).classList.remove('selectable','selected','targetable');
    });
    _selectedHand = null;

    if (state.turn === 'player' && state.phase === 'game' && !_cpuThinking) {
      ['left','right'].forEach(s => {
        if (state.player[s] > 0) $(`hand-player-${s}`).classList.add('selectable');
      });
      $('hint-text').textContent = i.selectHand;
    } else {
      $('hint-text').textContent = '';
    }
  }

  /* ── Hand click logic ── */

  function onHandClick(who, side) {
    const state = G.getState();
    if (!state || state.phase !== 'game' || state.turn !== 'player' || _cpuThinking || _transitioning) return;

    if (who === 'player') {
      if (state.player[side] === 0) return;
      _selectedHand = side;
      ['left','right'].forEach(s => {
        const el = $(`hand-player-${s}`);
        el.classList.remove('selectable','selected');
        if (state.player[s] > 0) el.classList.add(s === side ? 'selected' : 'selectable');
      });
      ['left','right'].forEach(s => {
        const el = $(`hand-cpu-${s}`);
        el.classList.remove('targetable');
        if (state.cpu[s] > 0) el.classList.add('targetable');
      });
      $('hint-text').textContent = i.selectTarget;
      GameAudio.playTick();

    } else if (who === 'cpu') {
      if (!_selectedHand || state.cpu[side] === 0) return;
      const newState = G.playerTap(_selectedHand, side);
      if (!newState) return;

      const hitEl = $(`hand-cpu-${side}`);
      hitEl.classList.add('chop-hit');
      setTimeout(() => hitEl.classList.remove('chop-hit'), 400);
      GameAudio.playTick();
      renderBoard(newState);

      if (newState.phase === 'gameover') {
        setTimeout(() => { populateGameover(newState); goTo('gameover'); }, 900);
      } else if (newState.phase === 'round-over') {
        _gameCount++;
        setTimeout(() => { populateRoundOver(newState); goTo('round-over'); }, 900);
      } else {
        _cpuThinking = true;
        $('turn-badge').textContent = i.cpuThinking;
        $('hint-text').textContent  = '';
        setTimeout(() => {
          const after = G.cpuMove();
          if (!after) return;
          const hitEl2 = $(`hand-player-${after.lastMove.to}`);
          hitEl2.classList.add('chop-hit');
          setTimeout(() => hitEl2.classList.remove('chop-hit'), 400);
          GameAudio.playTick();
          renderBoard(after);
          _cpuThinking = false;
          if (after.phase === 'gameover') {
            setTimeout(() => { populateGameover(after); goTo('gameover'); }, 900);
          } else if (after.phase === 'round-over') {
            _gameCount++;
            setTimeout(() => { populateRoundOver(after); goTo('round-over'); }, 900);
          }
        }, 1000);
      }
    }
  }

  /* ── Round over (best-of-3 intermediate) ── */

  function populateRoundOver(state) {
    HGA.roundResult(state.roundWinner, { score_player: state.scores.player, score_cpu: state.scores.cpu });
    const isWin = state.roundWinner === 'player';
    $('ro-trophy').textContent = isWin ? '🏆' : '💻';
    $('ro-title').textContent  = isWin
      ? i.roundWon(`${state.scores.player}—${state.scores.cpu}`)
      : i.roundLost(`${state.scores.player}—${state.scores.cpu}`);
    $('btn-next-game').textContent = i.nextGame;
  }

  /* ── Game over ── */

  function populateGameover(state) {
    HGA.gameOver(state.winner, state.scores);
    const win = state.winner === 'player';
    $('go-trophy').textContent = win ? '🏆' : '🤖';
    typewriter($('go-winner-name'), win ? state.names.player : 'CPU');
    $('go-title-suffix').textContent = win
      ? (i === T.pt ? ' vence!' : i === T.en ? ' wins!' : ' gana!')
      : (i === T.pt ? ' vence!' : i === T.en ? ' wins!' : ' gana!');
    $('go-subtitle').textContent = win ? i.subWin : i.subLoss(state.names.player);
    $('go-name-player').textContent = state.names.player;
    $('go-name-cpu').textContent    = 'CPU';
    setScoreDigit($('go-val-player'), state.scores.player);
    setScoreDigit($('go-val-cpu'),    state.scores.cpu);

    const statsEl = $('session-stats');
    if (statsEl && state.session) {
      const pct = state.session.matches > 0
        ? Math.round((state.session.wins / state.session.matches) * 100) : 0;
      $('stat-matches').textContent = state.session.matches;
      $('stat-wins').textContent    = state.session.wins;
      $('stat-losses').textContent  = state.session.losses;
      $('stat-winpct').textContent  = `${pct}%`;
      statsEl.style.display = 'block';
    }

    if (win) { spawnConfetti(); GameAudio.playFanfare(); }
    else      { GameAudio.playGameDraw(); }
  }

  /* ── Event listeners ── */

  $('btn-start').addEventListener('click', () => {
    const name = $('name-player').value.trim() || 'Jugador';
    const mode = document.querySelector('input[name="mode"]:checked').value;
    _gameCount = 0;
    _cpuThinking = false;
    const state = G.configure(name, mode);
    HGA.gameStart(mode);
    renderBoard(state);
    goTo('game', 'fwd');
    GameAudio.playTick();
  });

  // Hand buttons
  document.querySelectorAll('.chop-hand').forEach(btn => {
    btn.addEventListener('click', () => onHandClick(btn.dataset.who, btn.dataset.side));
  });

  $('btn-next-game').addEventListener('click', () => {
    if (_transitioning) return;
    _cpuThinking = false;
    const state = G.nextRound();
    renderBoard(state);
    goTo('game', 'fwd');
  });

  $('btn-new-series').addEventListener('click', () => {
    if (_transitioning) return;
    G.newGame();
    $('name-player').value = '';
    goTo('setup', 'back');
  });

  $('btn-revenge-go').addEventListener('click', () => {
    if (_transitioning) return;
    $('confetti-container').innerHTML = '';
    $('session-stats').style.display = 'none';
    HGA.revenge();
    _gameCount = 0;
    _cpuThinking = false;
    const state = G.revenge();
    renderBoard(state);
    goTo('game', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-go').addEventListener('click', () => {
    if (_transitioning) return;
    $('confetti-container').innerHTML = '';
    $('session-stats').style.display = 'none';
    G.newGame();
    $('name-player').value = '';
    goTo('setup', 'back');
  });

  $('btn-mute').addEventListener('click', () => {
    const muted = GameAudio.toggle();
    HGA.audioToggle(muted);
    $('btn-mute').textContent = muted ? '🔇' : '🔊';
  });

})();
