/* ═══════════════════════════════════════════════════════════
   ui-rpsls-cpu.js — DOM orchestrator for vs-CPU (RPSLS).
   Depends on: window.GameRPSLSCPU, window.GameAudio
═══════════════════════════════════════════════════════════ */
(() => {
  const G = window.GameRPSLSCPU;
  const _lang = document.documentElement.lang || 'es';

  const META = G.meta();
  const REASONS = G.reasons();

  const T = {
    es: {
      pickPrompt:   'Elige tu jugada',
      round:        r => `Ronda ${r}`,
      single:       'Intento único',
      youPicked:    p => `Elegiste: ${META[p].es}`,
      cpuPicked:    p => `CPU eligió: ${META[p].es}`,
      bannerWin:    reason => `✅ ¡Ganaste! ${reason}`,
      bannerLoss:   reason => `❌ ¡CPU gana! ${reason}`,
      bannerDraw:   '🤝 ¡Empate!',
      nextRound:    'Siguiente ronda →',
      revenge:      '🔄 Revancha',
      newGame:      'Nueva partida',
      changeMode:   'Cambiar modo',
      youWin:       name => `¡${name} gana!`,
      cpuWins:      '¡CPU gana!',
      subWin:       '¡Tus instintos son imbatibles!',
      subLoss:      name => `${name} lo intentará de nuevo. ¿Revancha?`,
      subDraw:      '¡Nadie pudo con nadie!',
      stats:        'Estadísticas de sesión',
      statMatches:  'Partidas', statWins: 'Victorias',
      statLosses:   'Derrotas', statDraws: 'Empates',
    },
    en: {
      pickPrompt:   'Choose your move',
      round:        r => `Round ${r}`,
      single:       'Single game',
      youPicked:    p => `You picked: ${META[p].en}`,
      cpuPicked:    p => `CPU picked: ${META[p].en}`,
      bannerWin:    reason => `✅ You win! ${reason}`,
      bannerLoss:   reason => `❌ CPU wins! ${reason}`,
      bannerDraw:   '🤝 Draw!',
      nextRound:    'Next round →',
      revenge:      '🔄 Rematch',
      newGame:      'New game',
      changeMode:   'Change mode',
      youWin:       name => `${name} wins!`,
      cpuWins:      'CPU wins!',
      subWin:       'Your instincts are unbeatable!',
      subLoss:      name => `${name} will try again. Rematch?`,
      subDraw:      'Nobody could beat nobody!',
      stats:        'Session stats',
      statMatches:  'Matches', statWins: 'Wins',
      statLosses:   'Losses',  statDraws: 'Draws',
    },
    pt: {
      pickPrompt:   'Escolha sua jogada',
      round:        r => `Rodada ${r}`,
      single:       'Partida única',
      youPicked:    p => `Você escolheu: ${META[p].pt}`,
      cpuPicked:    p => `CPU escolheu: ${META[p].pt}`,
      bannerWin:    reason => `✅ Você vence! ${reason}`,
      bannerLoss:   reason => `❌ CPU vence! ${reason}`,
      bannerDraw:   '🤝 Empate!',
      nextRound:    'Próxima rodada →',
      revenge:      '🔄 Revanche',
      newGame:      'Nova partida',
      changeMode:   'Mudar modo',
      youWin:       name => `${name} vence!`,
      cpuWins:      'CPU vence!',
      subWin:       'Seus instintos são imbatíveis!',
      subLoss:      name => `${name} vai tentar de novo. Revanche?`,
      subDraw:      'Ninguém venceu ninguém!',
      stats:        'Estatísticas da sessão',
      statMatches:  'Partidas', statWins: 'Vitórias',
      statLosses:   'Derrotas', statDraws: 'Empates',
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
    const next = document.createElement('span');
    next.className = 'score-digit roll-in'; next.textContent = nv;
    rollEl.appendChild(next);
    setTimeout(() => { cur.remove(); next.classList.remove('roll-in'); }, 320);
  }

  function typewriter(el, text) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }
    el.innerHTML = [...text].map((ch, k) =>
      `<span class="tw-char" style="animation-delay:${k * 45}ms">${ch === ' ' ? '&nbsp;' : ch}</span>`
    ).join('');
  }

  function spawnConfetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = $('confetti-container'); c.innerHTML = '';
    const COLORS = ['#7c3aed','#a855f7','#0ea5e9','#22c55e','#f59e0b','#ef4444','#ec4899'];
    const frag = document.createDocumentFragment();
    for (let k = 0; k < 35; k++) {
      const p = document.createElement('div'); p.className = 'confetti-piece';
      const w = 6 + Math.random() * 7;
      p.style.cssText = [`left:${(Math.random()*100).toFixed(1)}%`,`width:${w.toFixed(1)}px`,
        `height:${(w*(1.4+Math.random())).toFixed(1)}px`,
        `background:${COLORS[Math.floor(Math.random()*COLORS.length)]}`,
        `animation-delay:${(Math.random()*0.9).toFixed(2)}s`,
        `animation-duration:${(0.9+Math.random()*0.7).toFixed(2)}s`,
        `transform:rotate(${Math.floor(Math.random()*360)}deg)`,
        `border-radius:${Math.random()>.5?'50%':'3px'}`].join(';');
      frag.appendChild(p);
    }
    c.appendChild(frag);
    setTimeout(() => { c.innerHTML = ''; }, 2800);
  }

  /* ── Screens ── */
  const screens = {
    setup:    $('screen-setup'),
    pick:     $('screen-pick'),
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

  /* ── Pick screen ── */
  function populatePick(state) {
    $('sb-name-player').textContent = state.player.name;
    setScoreDigit($('roll-player'), state.scores.player);
    setScoreDigit($('roll-cpu'), state.scores.cpu);
    $('pick-round-badge').textContent = state.mode === 'best-of-3'
      ? i.round(state.round) : i.single;
    $('pick-prompt').textContent = i.pickPrompt;
    document.querySelectorAll('.btn-pick').forEach(b => {
      b.classList.remove('selected');
      b.disabled = false;
    });
  }

  /* ── Result screen ── */
  function populateResult(state) {
    const { player, scores, round, mode, picks, roundWinner, matchWinner, reason } = state;

    $('res-name-player').textContent = player.name;
    const preP = scores.player - (roundWinner === 'player' ? 1 : 0);
    const preC = scores.cpu    - (roundWinner === 'cpu'    ? 1 : 0);
    setScoreDigit($('res-roll-player'), preP);
    setScoreDigit($('res-roll-cpu'), preC);
    $('res-round-badge').textContent = mode === 'best-of-3' ? i.round(round) : i.single;

    // Player pick
    $('res-player-emoji').textContent = META[picks.player].emoji;
    $('res-player-label').textContent = i.youPicked(picks.player);

    // CPU pick - hidden initially
    const cpuEmoji = $('res-cpu-emoji');
    cpuEmoji.textContent = '❓';
    cpuEmoji.classList.remove('cpu-flip-out', 'cpu-flip-in');
    $('res-cpu-label').textContent = '';

    // Banner
    $('result-banner').className = 'result-banner';
    $('result-banner').textContent = '';

    // Buttons
    $('btn-next-round').style.display  = (roundWinner !== 'draw' && matchWinner === null) ? 'flex' : 'none';
    $('btn-retry-round').style.display = roundWinner === 'draw' ? 'flex' : 'none';
  }

  async function animateReveal(state) {
    const { picks, roundWinner, reason, scores } = state;
    const cpuEmoji = $('res-cpu-emoji');
    const countdown = $('cpu-countdown');

    // Countdown
    for (const label of ['3', '2', '1']) {
      countdown.textContent = label;
      countdown.classList.remove('countdown-pop');
      reflow(countdown);
      countdown.classList.add('countdown-pop');
      cpuEmoji.classList.remove('fist-pulse');
      reflow(cpuEmoji);
      cpuEmoji.classList.add('fist-pulse');
      await new Promise(r => setTimeout(r, 220));
    }
    const ya = _lang === 'en' ? 'GO!' : _lang === 'pt' ? 'JÁ!' : '¡YA!';
    countdown.textContent = ya;
    countdown.classList.remove('countdown-pop');
    reflow(countdown);
    countdown.classList.add('countdown-pop');
    cpuEmoji.classList.remove('fist-pulse');

    // Flip reveal
    cpuEmoji.classList.add('cpu-flip-out');
    await new Promise(r => setTimeout(r, 150));
    cpuEmoji.classList.remove('cpu-flip-out');
    cpuEmoji.textContent = META[picks.cpu].emoji;
    $('res-cpu-label').textContent = i.cpuPicked(picks.cpu);
    reflow(cpuEmoji);
    cpuEmoji.classList.add('cpu-flip-in');
    await new Promise(r => setTimeout(r, 150));
    cpuEmoji.classList.remove('cpu-flip-in');

    await new Promise(r => setTimeout(r, 300));

    // Score update
    if (roundWinner === 'player') animateScore($('res-roll-player'), scores.player);
    if (roundWinner === 'cpu')    animateScore($('res-roll-cpu'),    scores.cpu);

    // Banner
    const banner = $('result-banner');
    const reasonText = reason ? (REASONS[reason]?.[_lang] || REASONS[reason]?.es || '') : '';
    if (roundWinner === 'player') {
      banner.textContent = i.bannerWin(reasonText);
      banner.classList.add('banner-win', 'show');
      GameAudio.playWin();
    } else if (roundWinner === 'cpu') {
      banner.textContent = i.bannerLoss(reasonText);
      banner.classList.add('banner-loss', 'show');
      GameAudio.playDraw();
    } else {
      banner.textContent = i.bannerDraw;
      banner.classList.add('banner-draw', 'show');
      GameAudio.playDraw();
    }

    if (state.matchWinner !== null) {
      setTimeout(() => { populateGameover(state); goTo('gameover'); }, 1800);
    }
  }

  /* ── Game over ── */
  function populateGameover(state) {
    HGA.gameOver(state.matchWinner, state.scores, state.round);
    const { player, scores, matchWinner, session } = state;
    const win = matchWinner === 'player';
    $('go-trophy').textContent = win ? '🏆' : (matchWinner === 'draw' ? '🤝' : '🤖');
    typewriter($('go-winner-name'), win ? player.name : (matchWinner === 'draw' ? '' : 'CPU'));
    $('go-title-suffix').textContent = matchWinner === 'draw' ? i.bannerDraw
      : (win ? (_lang==='pt'?' vence!':_lang==='en'?' wins!':' gana!') : (_lang==='pt'?' vence!':_lang==='en'?' wins!':' gana!'));
    $('go-subtitle').textContent = win ? i.subWin : matchWinner === 'draw' ? i.subDraw : i.subLoss(player.name);
    $('go-name-player').textContent = player.name;
    $('go-name-cpu').textContent    = 'CPU';
    setScoreDigit($('go-val-player'), scores.player);
    setScoreDigit($('go-val-cpu'), scores.cpu);

    if (session) {
      const pct = session.matches > 0 ? Math.round(session.wins / session.matches * 100) : 0;
      $('stat-matches').textContent = session.matches;
      $('stat-wins').textContent    = session.wins;
      $('stat-losses').textContent  = session.losses;
      $('stat-draws').textContent   = session.draws;
      $('stat-winpct').textContent  = `${pct}%`;
      $('session-stats').style.display = 'block';
    }

    if (win) { spawnConfetti(); GameAudio.playFanfare(); }
    else if (matchWinner === 'draw') { GameAudio.playDraw(); }
    else { GameAudio.playGameDraw(); }
  }

  /* ── Events ── */
  $('btn-start').addEventListener('click', () => {
    const name = $('name-player').value.trim() || (_lang==='en'?'Player':_lang==='pt'?'Jogador':'Jugador');
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const state = G.configure(name, mode);
    HGA.gameStart(mode);
    populatePick(state);
    goTo('pick', 'fwd');
    GameAudio.playTick();
  });

  document.querySelectorAll('.btn-pick').forEach(btn => {
    btn.addEventListener('pointerdown', () => GameAudio.prime(), { passive: true });
    btn.addEventListener('click', async () => {
      if (transitioning) return;
      const pick = btn.dataset.pick;
      document.querySelectorAll('.btn-pick').forEach(b => { b.disabled = true; b.classList.remove('selected'); });
      btn.classList.add('selected');
      GameAudio.playTick();
      await new Promise(r => setTimeout(r, 150));
      const state = G.playerPick(pick);
      setTimeout(() => {
        HGA.pickMade({ pick, round: state.round });
        HGA.roundResult(state.roundWinner, { pick_player: state.picks?.player, pick_cpu: state.picks?.cpu, round: state.round });
      }, 0);
      populateResult(state);
      await goTo('result', 'fwd');
      animateReveal(state);
    });
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
    HGA.revenge();
    const state = G.revenge();
    populatePick(state);
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-result').addEventListener('click', () => {
    if (transitioning) return;
    G.newGame();
    $('name-player').value = '';
    goTo('setup', 'back');
  });

  $('btn-revenge-go').addEventListener('click', () => {
    if (transitioning) return;
    $('confetti-container').innerHTML = '';
    $('session-stats').style.display = 'none';
    HGA.revenge();
    const state = G.revenge();
    populatePick(state);
    goTo('pick', 'back');
    GameAudio.playTick();
  });

  $('btn-new-game-go').addEventListener('click', () => {
    if (transitioning) return;
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
