/* ═══════════════════════════════════════════════════════════
   game-ooe-battle.js — Pure game logic for Battle mode (Par o Impar).
   CPU picks both fingers + assigns random bet to P1. Zero DOM access.
   Exposes window.GameOOEBattle = { ... }
═══════════════════════════════════════════════════════════ */
window.GameOOEBattle = (() => {
  const FINGERS = [0, 1, 2, 3, 4, 5];
  const BETS    = ['par', 'impar'];

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
    phase:       'setup',   // setup | ready | result | gameover
    picks:       { p1: null, p2: null },
    bet:         null,      // 'par' | 'impar' — randomly assigned to P1
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
    state.phase        = 'ready';
    return snap();
  }

  /**
   * CPU picks both players' fingers + assigns a random bet to P1.
   * P1 wins if the bet matches the sum's parity; P2 wins otherwise.
   */
  function reveal() {
    const p1fingers = FINGERS[Math.floor(Math.random() * FINGERS.length)];
    const p2fingers = FINGERS[Math.floor(Math.random() * FINGERS.length)];
    const bet       = BETS[Math.floor(Math.random() * BETS.length)];
    state.picks = { p1: p1fingers, p2: p2fingers };
    state.bet   = bet;

    const sum = p1fingers + p2fingers;
    state.sum       = sum;
    state.sumParity = sum % 2 === 0 ? 'par' : 'impar';

    const winner = state.sumParity === bet ? 'p1' : 'p2';
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
    state.picks       = { p1: null, p2: null };
    state.bet         = null;
    state.sum         = null;
    state.sumParity   = null;
    state.roundWinner = null;
    state.phase       = 'ready';
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

  return { configure, reveal, nextRound, revenge, newGame, fingersMeta, betMeta, getState };
})();
