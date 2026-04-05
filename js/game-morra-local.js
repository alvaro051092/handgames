/* ═══════════════════════════════════════════════════════════
   game-morra-local.js — Pure game logic for 2-player local mode (Morra).
   Both players independently pick fingers (1-5) + guess the total (2-10).
   P1 picks first (private), then P2 picks (private), then reveal.
   Zero DOM access. Exposes window.GameMorraLocal = { ... }
═══════════════════════════════════════════════════════════ */
window.GameMorraLocal = (() => {
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
    phase:       'setup',   // setup | p1-pick | handoff | p2-pick | result | gameover
    picks: {
      p1Fingers: null,
      p1Guess:   null,
      p2Fingers: null,
      p2Guess:   null,
    },
    total:       null,
    roundWinner: null,   // 'p1' | 'p2' | 'draw'
    matchWinner: null,   // 'p1' | 'p2' | null
  };

  function snap()    { return JSON.parse(JSON.stringify(state)); }
  function maxWins() { return state.mode === 'best-of-3' ? 2 : 1; }

  function configure(p1name, p2name, mode) {
    state.players.p1  = p1name || 'Jugador 1';
    state.players.p2  = p2name || 'Jugador 2';
    state.mode        = mode;
    state.scores      = { p1: 0, p2: 0 };
    state.round       = 1;
    state.picks       = { p1Fingers: null, p1Guess: null, p2Fingers: null, p2Guess: null };
    state.total       = null;
    state.roundWinner = null;
    state.matchWinner = null;
    state.phase       = 'p1-pick';
    return snap();
  }

  /** P1 picks fingers + guess, then passes the device. */
  function p1Pick(fingers, guess) {
    state.picks.p1Fingers = fingers;
    state.picks.p1Guess   = guess;
    state.phase           = 'handoff';
    return snap();
  }

  /** P2 picks fingers + guess, resolving the round. */
  function p2Pick(fingers, guess) {
    state.picks.p2Fingers = fingers;
    state.picks.p2Guess   = guess;

    const total = state.picks.p1Fingers + fingers;
    state.total = total;

    const p1Correct = state.picks.p1Guess === total;
    const p2Correct = guess === total;

    if (p1Correct && !p2Correct) {
      state.roundWinner = 'p1';
      state.scores.p1++;
    } else if (p2Correct && !p1Correct) {
      state.roundWinner = 'p2';
      state.scores.p2++;
    } else {
      state.roundWinner = 'draw';
    }

    if (state.roundWinner !== 'draw') {
      if (state.scores.p1 >= maxWins())      state.matchWinner = 'p1';
      else if (state.scores.p2 >= maxWins()) state.matchWinner = 'p2';
      else if (state.mode === 'single')      state.matchWinner = state.roundWinner;
    }

    state.phase = 'result';
    return snap();
  }

  function nextRound() {
    state.round++;
    state.picks       = { p1Fingers: null, p1Guess: null, p2Fingers: null, p2Guess: null };
    state.total       = null;
    state.roundWinner = null;
    state.phase       = 'p1-pick';
    return snap();
  }

  /** Retry a draw round — round number stays the same. */
  function retryRound() {
    state.picks       = { p1Fingers: null, p1Guess: null, p2Fingers: null, p2Guess: null };
    state.total       = null;
    state.roundWinner = null;
    state.phase       = 'p1-pick';
    return snap();
  }

  function revenge() {
    state.scores      = { p1: 0, p2: 0 };
    state.round       = 1;
    state.picks       = { p1Fingers: null, p1Guess: null, p2Fingers: null, p2Guess: null };
    state.total       = null;
    state.roundWinner = null;
    state.matchWinner = null;
    state.phase       = 'p1-pick';
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
      roundWinner: null,
      matchWinner: null,
    });
    return snap();
  }

  function fingersMeta() { return FINGERS_META; }
  function getState()    { return snap(); }

  return { configure, p1Pick, p2Pick, nextRound, retryRound, revenge, newGame, fingersMeta, getState };
})();
