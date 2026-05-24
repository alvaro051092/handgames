/* ═══════════════════════════════════════════════════════════
   game-ooe-cpu.js — Pure game logic for vs-CPU mode (Par o Impar).
   Zero DOM access. Exposes window.GameOOECPU = { ... }
═══════════════════════════════════════════════════════════ */
window.GameOOECPU = (() => {
  const FINGERS = [0, 1, 2, 3, 4, 5];
  const LS_KEY = 'hg_ooe_session';

  const FINGERS_META = {
    0: { label: '0 dedos' },
    1: { label: '1 dedo' },
    2: { label: '2 dedos' },
    3: { label: '3 dedos' },
    4: { label: '4 dedos' },
    5: { label: '5 dedos' },
  };

  const BET_META = {
    par:   { label: 'Par' },
    impar: { label: 'Impar' },
  };

  const state = {
    player:      { name: 'Jugador' },
    mode:        'best-of-3',
    scores:      { player: 0, cpu: 0 },
    round:       1,
    phase:       'setup',   // setup | pick | result | gameover
    difficulty:  'medium',
    picks:       { player: null, cpu: null },
    bet:         null,      // 'par' | 'impar' — player's bet
    sum:         null,
    sumParity:   null,      // 'par' | 'impar'
    roundWinner: null,      // 'player' | 'cpu'
    matchWinner: null,      // 'player' | 'cpu' | null

    // Session stats — persist across revenge/newGame, cleared only on page reload
    session: {
      matches: 0,
      wins:    0,
      losses:  0,
      betFreq: { par: 0, impar: 0 },
    },
  };

  function snap()    { return JSON.parse(JSON.stringify(state)); }
  function maxWins() { return state.mode === 'best-of-3' ? 2 : 1; }

  /* ── localStorage helpers ── */
  function loadSession() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { const s = JSON.parse(raw); Object.assign(state.session, s); }
    } catch(e) {}
  }
  function saveSession() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state.session)); } catch(e) {}
  }
  function clearSession() {
    state.session = { matches: 0, wins: 0, losses: 0, betFreq: { par: 0, impar: 0 } };
    try { localStorage.removeItem(LS_KEY); } catch(e) {}
  }

  /* ── Smart CPU finger pick based on difficulty ──
     Hard mode: if player bets 'par' more, CPU picks odd fingers (to make sum odd).
     If player bets 'impar' more, CPU picks even fingers. */
  const EVEN_FINGERS = [0, 2, 4];
  const ODD_FINGERS  = [1, 3, 5];
  function cpuSmartFingers() {
    if (state.difficulty === 'easy') return FINGERS[Math.floor(Math.random() * FINGERS.length)];
    const freq = state.session.betFreq;
    const total = freq.par + freq.impar;
    if (total < 3) return FINGERS[Math.floor(Math.random() * FINGERS.length)];
    const favBet = freq.par >= freq.impar ? 'par' : 'impar';
    // counter: if player bets 'par', pick odd to push sum odd
    const pool = favBet === 'par' ? ODD_FINGERS : EVEN_FINGERS;
    const bias = state.difficulty === 'hard' ? 0.65 : 0.35;
    if (Math.random() < bias) return pool[Math.floor(Math.random() * pool.length)];
    return FINGERS[Math.floor(Math.random() * FINGERS.length)];
  }

  // Init: load persisted session
  loadSession();

  function configure(playerName, mode, difficulty) {
    state.player.name  = playerName || 'Jugador';
    state.mode         = mode;
    state.difficulty   = difficulty || 'medium';
    state.scores       = { player: 0, cpu: 0 };
    state.round        = 1;
    state.picks        = { player: null, cpu: null };
    state.bet          = null;
    state.sum          = null;
    state.sumParity    = null;
    state.roundWinner  = null;
    state.matchWinner  = null;
    state.phase        = 'pick';
    return snap();
  }

  /**
   * Player reveals their fingers + bet. CPU picks fingers randomly.
   * No draws possible: sum is always par or impar.
   */
  function playerPick(fingers, bet) {
    const cpuFingers = cpuSmartFingers();
    state.picks.player = fingers;
    state.picks.cpu    = cpuFingers;
    state.bet          = bet;
    state.session.betFreq[bet]++;

    const sum = fingers + cpuFingers;
    state.sum       = sum;
    state.sumParity = sum % 2 === 0 ? 'par' : 'impar';

    const winner = state.sumParity === bet ? 'player' : 'cpu';
    state.roundWinner = winner;
    state.scores[winner]++;

    if (state.scores.player >= maxWins()) {
      state.matchWinner = 'player';
    } else if (state.scores.cpu >= maxWins()) {
      state.matchWinner = 'cpu';
    } else if (state.mode === 'single') {
      state.matchWinner = winner;
    }

    if (state.matchWinner !== null) {
      state.session.matches++;
      if (state.matchWinner === 'player') state.session.wins++;
      else                                state.session.losses++;
      saveSession();
    }

    state.phase = 'result';
    return snap();
  }

  function nextRound() {
    state.round++;
    state.picks       = { player: null, cpu: null };
    state.bet         = null;
    state.sum         = null;
    state.sumParity   = null;
    state.roundWinner = null;
    state.phase       = 'pick';
    return snap();
  }

  function revenge() {
    state.scores      = { player: 0, cpu: 0 };
    state.round       = 1;
    state.picks       = { player: null, cpu: null };
    state.bet         = null;
    state.sum         = null;
    state.sumParity   = null;
    state.roundWinner = null;
    state.matchWinner = null;
    state.phase       = 'pick';
    return snap();
  }

  function newGame() {
    Object.assign(state, {
      player:      { name: 'Jugador' },
      mode:        'best-of-3',
      scores:      { player: 0, cpu: 0 },
      round:       1,
      phase:       'setup',
      picks:       { player: null, cpu: null },
      bet:         null,
      sum:         null,
      sumParity:   null,
      roundWinner: null,
      matchWinner: null,
    });
    // session intentionally NOT reset
    return snap();
  }

  function fingersMeta() { return FINGERS_META; }
  function betMeta()     { return BET_META; }
  function getState()    { return snap(); }

  return { configure, playerPick, nextRound, revenge, newGame, fingersMeta, betMeta, getState, clearSession };
})();
