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

  const state = {
    player:      { name: 'Jugador' },
    mode:        'best-of-3',
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
      pickFreq: { rock: 0, paper: 0, scissors: 0 },
    },
  };

  function snap()    { return JSON.parse(JSON.stringify(state)); }
  function maxWins() { return state.mode === 'best-of-3' ? 2 : 1; }

  /* ── Public API ── */

  function configure(playerName, mode) {
    state.player.name  = playerName || 'Jugador';
    state.mode         = mode;
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
    const cpuPick = PICKS[Math.floor(Math.random() * PICKS.length)];
    state.picks.player = pick;
    state.picks.cpu    = cpuPick;

    // Track pick frequency for session stats
    state.session.pickFreq[pick]++;

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

  return { configure, playerPick, nextRound, revenge, newGame, picksMeta, getState };
})();
