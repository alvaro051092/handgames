/* ═══════════════════════════════════════════════════════════
   game-ooe-cpu.js — Pure game logic for vs-CPU mode (Par o Impar).
   Zero DOM access. Exposes window.GameOOECPU = { ... }
═══════════════════════════════════════════════════════════ */
window.GameOOECPU = (() => {
  const FINGERS = [0, 1, 2, 3, 4, 5];

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

  function configure(playerName, mode) {
    state.player.name  = playerName || 'Jugador';
    state.mode         = mode;
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
    const cpuFingers = FINGERS[Math.floor(Math.random() * FINGERS.length)];
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

  return { configure, playerPick, nextRound, revenge, newGame, fingersMeta, betMeta, getState };
})();
