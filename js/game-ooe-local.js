/* ═══════════════════════════════════════════════════════════
   game-ooe-local.js — Pure game logic for 2-player local mode (Par o Impar).
   P1 bets + picks fingers; P2 just picks fingers.
   Zero DOM access. Exposes window.GameOOELocal = { ... }
═══════════════════════════════════════════════════════════ */
window.GameOOELocal = (() => {
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
    players:     { p1: 'Jugador 1', p2: 'Jugador 2' },
    mode:        'best-of-3',
    scores:      { p1: 0, p2: 0 },
    round:       1,
    phase:       'setup',   // setup | p1-pick | handoff | p2-pick | result | gameover
    picks:       { p1: null, p2: null },
    bet:         null,      // 'par' | 'impar' — P1's bet
    sum:         null,
    sumParity:   null,      // 'par' | 'impar'
    roundWinner: null,      // 'p1' | 'p2'
    matchWinner: null,      // 'p1' | 'p2' | null
  };

  function snap()    { return JSON.parse(JSON.stringify(state)); }
  function maxWins() { return state.mode === 'best-of-3' ? 2 : 1; }

  function configure(p1name, p2name, mode) {
    state.players.p1   = p1name || 'Jugador 1';
    state.players.p2   = p2name || 'Jugador 2';
    state.mode         = mode;
    state.scores       = { p1: 0, p2: 0 };
    state.round        = 1;
    state.picks        = { p1: null, p2: null };
    state.bet          = null;
    state.sum          = null;
    state.sumParity    = null;
    state.roundWinner  = null;
    state.matchWinner  = null;
    state.phase        = 'p1-pick';
    return snap();
  }

  /** P1 picks fingers + declares bet, then passes device. */
  function p1Pick(fingers, bet) {
    state.picks.p1 = fingers;
    state.bet      = bet;
    state.phase    = 'handoff';
    return snap();
  }

  /** P2 picks fingers, resolving the round. */
  function p2Pick(fingers) {
    state.picks.p2 = fingers;

    const sum = state.picks.p1 + fingers;
    state.sum       = sum;
    state.sumParity = sum % 2 === 0 ? 'par' : 'impar';

    // P1 wins if sum matches P1's bet; P2 wins otherwise
    const winner = state.sumParity === state.bet ? 'p1' : 'p2';
    state.roundWinner = winner;
    state.scores[winner]++;

    if (state.scores.p1 >= maxWins()) {
      state.matchWinner = 'p1';
    } else if (state.scores.p2 >= maxWins()) {
      state.matchWinner = 'p2';
    } else if (state.mode === 'single') {
      state.matchWinner = winner;
    }

    state.phase = 'result';
    return snap();
  }

  function nextRound() {
    state.round++;
    state.picks       = { p1: null, p2: null };
    state.bet         = null;
    state.sum         = null;
    state.sumParity   = null;
    state.roundWinner = null;
    state.phase       = 'p1-pick';
    return snap();
  }

  function revenge() {
    state.scores      = { p1: 0, p2: 0 };
    state.round       = 1;
    state.picks       = { p1: null, p2: null };
    state.bet         = null;
    state.sum         = null;
    state.sumParity   = null;
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
      picks:       { p1: null, p2: null },
      bet:         null,
      sum:         null,
      sumParity:   null,
      roundWinner: null,
      matchWinner: null,
    });
    return snap();
  }

  function fingersMeta() { return FINGERS_META; }
  function betMeta()     { return BET_META; }
  function getState()    { return snap(); }

  return { configure, p1Pick, p2Pick, nextRound, revenge, newGame, fingersMeta, betMeta, getState };
})();
