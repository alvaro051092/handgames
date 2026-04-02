/* ═══════════════════════════════════════════════════════════
   game-battle.js — Pure game logic for Battle mode.
   Both players' picks are random (CPU). Zero DOM access.
   Exposes window.GameBattle = { ... }
═══════════════════════════════════════════════════════════ */
window.GameBattle = (() => {
  const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  const PICKS  = ['rock', 'paper', 'scissors'];

  const PICKS_META = {
    rock:     { emoji: '🪨', label: 'Piedra' },
    paper:    { emoji: '📄', label: 'Papel' },
    scissors: { emoji: '✂️',  label: 'Tijeras' },
  };

  const state = {
    players:     { p1: 'Jugador 1', p2: 'Jugador 2' },
    mode:        'best-of-3',
    scores:      { p1: 0, p2: 0 },
    round:       1,
    phase:       'setup',   // setup | ready | result | gameover
    picks:       { p1: null, p2: null },
    roundWinner: null,      // 'p1' | 'p2' | 'draw'
    matchWinner: null,      // 'p1' | 'p2' | 'draw' | null
  };

  function snap()    { return JSON.parse(JSON.stringify(state)); }
  function maxWins() { return state.mode === 'best-of-3' ? 2 : 1; }

  function configure(p1name, p2name, mode) {
    state.players.p1 = p1name || 'Jugador 1';
    state.players.p2 = p2name || 'Jugador 2';
    state.mode        = mode;
    state.scores      = { p1: 0, p2: 0 };
    state.round       = 1;
    state.picks       = { p1: null, p2: null };
    state.roundWinner = null;
    state.matchWinner = null;
    state.phase       = 'ready';
    return snap();
  }

  /**
   * CPU reveals both players' picks simultaneously via Math.random().
   * No human input required.
   */
  function reveal() {
    const p1pick = PICKS[Math.floor(Math.random() * PICKS.length)];
    const p2pick = PICKS[Math.floor(Math.random() * PICKS.length)];
    state.picks = { p1: p1pick, p2: p2pick };

    let winner;
    if (p1pick === p2pick)          winner = 'draw';
    else if (BEATS[p1pick] === p2pick) winner = 'p1';
    else                             winner = 'p2';

    state.roundWinner = winner;
    if (winner !== 'draw') state.scores[winner]++;

    if (state.scores.p1 >= maxWins())      state.matchWinner = 'p1';
    else if (state.scores.p2 >= maxWins()) state.matchWinner = 'p2';
    else if (state.mode === 'single')      state.matchWinner = winner;

    state.phase = 'result';
    return snap();
  }

  function nextRound() {
    state.round++;
    state.picks       = { p1: null, p2: null };
    state.roundWinner = null;
    state.phase       = 'ready';
    return snap();
  }

  function revenge() {
    state.scores      = { p1: 0, p2: 0 };
    state.round       = 1;
    state.picks       = { p1: null, p2: null };
    state.roundWinner = null;
    state.matchWinner = null;
    state.phase       = 'ready';
    return snap();
  }

  function newGame() {
    Object.assign(state, {
      players:     { p1: 'Jugador 1', p2: 'Jugador 2' },
      mode:        'best-of-3',
      scores:      { p1: 0, p2: 0 },
      round:       1,
      phase:       'setup',
      picks:       { p1: null, p2: null },
      roundWinner: null,
      matchWinner: null,
    });
    return snap();
  }

  function picksMeta() { return PICKS_META; }
  function getState()  { return snap(); }

  return { configure, reveal, nextRound, revenge, newGame, picksMeta, getState };
})();
