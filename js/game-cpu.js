/* ═══════════════════════════════════════════════════════════
   game-cpu.js — Pure game logic for vs-CPU mode. Zero DOM access.
   Exposes window.GameCPU = { ... }
═══════════════════════════════════════════════════════════ */
window.GameCPU = (() => {
  const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  const PICKS  = ['rock', 'paper', 'scissors'];

  const PICKS_META = {
    rock:     { emoji: '🪨', label: 'Piedra' },
    paper:    { emoji: '📄', label: 'Papel' },
    scissors: { emoji: '✂️',  label: 'Tijeras' },
  };

  const LS_KEY = 'hg_rps_session';

  const state = {
    player:      { name: 'Jugador' },
    mode:        'best-of-3',
    difficulty:  'medium',   // 'easy' | 'medium' | 'hard'
    scores:      { player: 0, cpu: 0 },
    round:       1,
    phase:       'setup',   // setup | pick | result | gameover
    picks:       { player: null, cpu: null },
    roundWinner: null,      // 'player' | 'cpu' | 'draw'
    matchWinner: null,      // 'player' | 'cpu' | 'draw' | null

    // Session stats — persist across revenge/newGame, cleared only on page reload
    session: {
      matches:  0,
      wins:     0,
      losses:   0,
      draws:    0,
      pickFreq:    { rock: 0, paper: 0, scissors: 0 },
      pickHistory: [],
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
    state.session = { matches: 0, wins: 0, losses: 0, draws: 0, pickFreq: { rock: 0, paper: 0, scissors: 0 }, pickHistory: [] };
    try { localStorage.removeItem(LS_KEY); } catch(e) {}
  }

  /* ── Smart CPU pick ── */
  const COUNTER = { rock: 'paper', paper: 'scissors', scissors: 'rock' };
  function cpuSmartPick() {
    if (state.difficulty === 'easy') return PICKS[Math.floor(Math.random() * PICKS.length)];
    const freq = state.session.pickFreq;
    const total = freq.rock + freq.paper + freq.scissors;
    if (total === 0) return PICKS[Math.floor(Math.random() * PICKS.length)];
    const most = PICKS.reduce((a, b) => freq[a] >= freq[b] ? a : b);
    const counter = COUNTER[most];
    const r = Math.random();
    if (state.difficulty === 'medium') return r < 0.35 ? counter : PICKS[Math.floor(Math.random() * PICKS.length)];
    /* hard */ return r < 0.65 ? counter : PICKS[Math.floor(Math.random() * PICKS.length)];
  }

  // Init: load persisted session
  loadSession();

  /* ── Public API ── */

  function configure(playerName, mode, difficulty) {
    state.player.name  = playerName || 'Jugador';
    state.mode         = mode;
    state.difficulty   = difficulty || 'medium';
    state.scores       = { player: 0, cpu: 0 };
    state.round        = 1;
    state.picks        = { player: null, cpu: null };
    state.roundWinner  = null;
    state.matchWinner  = null;
    state.phase        = 'pick';
    return snap();
  }

  /**
   * Player reveals their pick. CPU picks instantly via Math.random().
   * Round and match are resolved in one step — no handoff needed.
   */
  function playerPick(pick) {
    const cpuPick = cpuSmartPick();
    state.picks.player = pick;
    state.picks.cpu    = cpuPick;

    // Track pick frequency for session stats
    state.session.pickFreq[pick]++;
    state.session.pickHistory.push(pick);
    if (state.session.pickHistory.length > 20) state.session.pickHistory.shift();

    const a = pick, b = cpuPick;
    let winner;
    if (a === b)             winner = 'draw';
    else if (BEATS[a] === b) winner = 'player';
    else                     winner = 'cpu';

    state.roundWinner = winner;
    if (winner !== 'draw') state.scores[winner]++;

    // Check match end
    if (state.scores.player >= maxWins()) {
      state.matchWinner = 'player';
    } else if (state.scores.cpu >= maxWins()) {
      state.matchWinner = 'cpu';
    } else if (state.mode === 'single') {
      state.matchWinner = winner; // may be 'draw'
    }

    // Update session when match ends
    if (state.matchWinner !== null) {
      state.session.matches++;
      if      (state.matchWinner === 'player') state.session.wins++;
      else if (state.matchWinner === 'cpu')    state.session.losses++;
      else                                     state.session.draws++;
      saveSession();
    }

    state.phase = 'result';
    return snap();
  }

  function nextRound() {
    state.round++;
    state.picks      = { player: null, cpu: null };
    state.roundWinner = null;
    state.phase      = 'pick';
    return snap();
  }

  function revenge() {
    state.scores      = { player: 0, cpu: 0 };
    state.round       = 1;
    state.picks       = { player: null, cpu: null };
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
      roundWinner: null,
      matchWinner: null,
    });
    // session intentionally NOT reset — stats persist across matches
    return snap();
  }

  function picksMeta() { return PICKS_META; }
  function getState()  { return snap(); }

  return { configure, playerPick, nextRound, revenge, newGame, picksMeta, getState, clearSession };
})();
