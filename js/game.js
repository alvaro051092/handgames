/* ═══════════════════════════════════════════════════════════
   game.js — Pure game logic. Zero DOM access.
   Exposes window.Game = { ... }
═══════════════════════════════════════════════════════════ */
window.Game = (() => {
  const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

  const PICKS_META = {
    rock:     { emoji: '🪨', label: 'Piedra' },
    paper:    { emoji: '📄', label: 'Papel' },
    scissors: { emoji: '✂️',  label: 'Tijeras' },
  };

  const state = {
    players:         { p1: 'Jugador 1', p2: 'Jugador 2' },
    mode:            'best-of-3',
    scores:          { p1: 0, p2: 0 },
    round:           1,
    phase:           'setup',   // setup | p1-pick | handoff | p2-pick | result | gameover
    picks:           { p1: null, p2: null },
    roundWinner:     null,      // 'p1' | 'p2' | 'draw'
    matchWinner:     null,      // 'p1' | 'p2' | 'draw' | null
  };

  function snap() { return JSON.parse(JSON.stringify(state)); }

  function maxWins() { return state.mode === 'best-of-3' ? 2 : 1; }

  /* ── Public API ── */

  function configure(p1name, p2name, mode) {
    state.players.p1 = p1name || 'Jugador 1';
    state.players.p2 = p2name || 'Jugador 2';
    state.mode       = mode;
    state.scores     = { p1: 0, p2: 0 };
    state.round      = 1;
    state.picks      = { p1: null, p2: null };
    state.roundWinner  = null;
    state.matchWinner  = null;
    state.phase      = 'p1-pick';
    return snap();
  }

  function p1Pick(pick) {
    state.picks.p1 = pick;
    state.phase    = 'handoff';
    return snap();
  }

  function p2Pick(pick) {
    state.picks.p2 = pick;

    const a = state.picks.p1, b = state.picks.p2;
    let winner;
    if (a === b)          winner = 'draw';
    else if (BEATS[a] === b) winner = 'p1';
    else                  winner = 'p2';

    state.roundWinner = winner;
    if (winner !== 'draw') state.scores[winner]++;

    // Check match end
    if (state.scores.p1 >= maxWins()) {
      state.matchWinner = 'p1';
    } else if (state.scores.p2 >= maxWins()) {
      state.matchWinner = 'p2';
    } else if (state.mode === 'single') {
      state.matchWinner = winner; // could be 'draw'
    }

    // Always show result screen first; ui reads matchWinner to decide next step
    state.phase = 'result';
    return snap();
  }

  function nextRound() {
    state.round++;
    state.picks      = { p1: null, p2: null };
    state.roundWinner  = null;
    state.phase      = 'p1-pick';
    return snap();
  }

  function revenge() {
    state.scores     = { p1: 0, p2: 0 };
    state.round      = 1;
    state.picks      = { p1: null, p2: null };
    state.roundWinner  = null;
    state.matchWinner  = null;
    state.phase      = 'p1-pick';
    return snap();
  }

  function newGame() {
    Object.assign(state, {
      players:      { p1: 'Jugador 1', p2: 'Jugador 2' },
      mode:         'best-of-3',
      scores:       { p1: 0, p2: 0 },
      round:        1,
      phase:        'setup',
      picks:        { p1: null, p2: null },
      roundWinner:  null,
      matchWinner:  null,
    });
    return snap();
  }

  function picksMeta() { return PICKS_META; }
  function getState()  { return snap(); }

  return { configure, p1Pick, p2Pick, nextRound, revenge, newGame, picksMeta, getState };
})();
