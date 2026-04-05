/* ═══════════════════════════════════════════════════════════
   game-morra-battle.js — Pure game logic for Battle mode (Morra).
   CPU picks fingers + guesses for BOTH players. Closest guess wins.
   Ties (equidistant) go to P1. Zero DOM access.
   Exposes window.GameMorraBattle = { ... }
═══════════════════════════════════════════════════════════ */
window.GameMorraBattle = (() => {
  const FINGERS_META = {
    1: { label: '1 dedo' },
    2: { label: '2 dedos' },
    3: { label: '3 dedos' },
    4: { label: '4 dedos' },
    5: { label: '5 dedos' },
  };

  const state = {
    players:     { p1: 'Jugador 1', p2: 'Jugador 2' },
    mode:        'best-of-3',
    scores:      { p1: 0, p2: 0 },
    round:       1,
    phase:       'setup',   // setup | ready | result | gameover
    picks: {
      p1Fingers: null,
      p1Guess:   null,
      p2Fingers: null,
      p2Guess:   null,
    },
    total:        null,
    p1Correct:    null,   // boolean
    p2Correct:    null,   // boolean
    roundWinner:  null,   // 'p1' | 'p2'
    matchWinner:  null,   // 'p1' | 'p2' | null
  };

  function snap()    { return JSON.parse(JSON.stringify(state)); }
  function maxWins() { return state.mode === 'best-of-3' ? 2 : 1; }

  /** Smart guess: knows own fingers, picks from valid total range. */
  function smartGuess(ownF) {
    const min = ownF + 1;
    const max = ownF + 5;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function configure(p1name, p2name, mode) {
    state.players.p1  = p1name || 'Jugador 1';
    state.players.p2  = p2name || 'Jugador 2';
    state.mode        = mode;
    state.scores      = { p1: 0, p2: 0 };
    state.round       = 1;
    state.picks       = { p1Fingers: null, p1Guess: null, p2Fingers: null, p2Guess: null };
    state.total       = null;
    state.p1Correct   = null;
    state.p2Correct   = null;
    state.roundWinner = null;
    state.matchWinner = null;
    state.phase       = 'ready';
    return snap();
  }

  /**
   * CPU picks fingers + guesses for both players.
   * Winner = whoever's guess is closer to the total.
   * Ties (equidistant) go to P1 — no replays in battle mode.
   */
  function reveal() {
    const p1f = 1 + Math.floor(Math.random() * 5);
    const p2f = 1 + Math.floor(Math.random() * 5);
    const p1g = smartGuess(p1f);
    const p2g = smartGuess(p2f);

    state.picks = { p1Fingers: p1f, p1Guess: p1g, p2Fingers: p2f, p2Guess: p2g };

    const total = p1f + p2f;
    state.total = total;

    const d1 = Math.abs(p1g - total);
    const d2 = Math.abs(p2g - total);

    state.p1Correct = p1g === total;
    state.p2Correct = p2g === total;

    // Closest guess wins; P1 wins ties
    const winner = d1 <= d2 ? 'p1' : 'p2';
    state.roundWinner = winner;
    state.scores[winner]++;

    if (state.scores.p1 >= maxWins())      state.matchWinner = 'p1';
    else if (state.scores.p2 >= maxWins()) state.matchWinner = 'p2';
    else if (state.mode === 'single')      state.matchWinner = winner;

    state.phase = 'result';
    return snap();
  }

  function nextRound() {
    state.round++;
    state.picks       = { p1Fingers: null, p1Guess: null, p2Fingers: null, p2Guess: null };
    state.total       = null;
    state.p1Correct   = null;
    state.p2Correct   = null;
    state.roundWinner = null;
    state.phase       = 'ready';
    return snap();
  }

  function revenge() {
    state.scores      = { p1: 0, p2: 0 };
    state.round       = 1;
    state.picks       = { p1Fingers: null, p1Guess: null, p2Fingers: null, p2Guess: null };
    state.total       = null;
    state.p1Correct   = null;
    state.p2Correct   = null;
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
      picks:       { p1Fingers: null, p1Guess: null, p2Fingers: null, p2Guess: null },
      total:       null,
      p1Correct:   null,
      p2Correct:   null,
      roundWinner: null,
      matchWinner: null,
    });
    return snap();
  }

  function fingersMeta() { return FINGERS_META; }
  function getState()    { return snap(); }

  return { configure, reveal, nextRound, revenge, newGame, fingersMeta, getState };
})();
