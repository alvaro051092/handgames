/* ═══════════════════════════════════════════════════════════
   game-morra-cpu.js — Pure game logic for vs-CPU mode (Morra).
   Both player and CPU pick fingers (1-5) + guess the total (2-10).
   Zero DOM access. Exposes window.GameMorraCPU = { ... }
═══════════════════════════════════════════════════════════ */
window.GameMorraCPU = (() => {
  const FINGERS = [1, 2, 3, 4, 5];

  const FINGERS_META = {
    1: { label: '1 dedo' },
    2: { label: '2 dedos' },
    3: { label: '3 dedos' },
    4: { label: '4 dedos' },
    5: { label: '5 dedos' },
  };

  const state = {
    player:      { name: 'Jugador' },
    mode:        'best-of-3',
    scores:      { player: 0, cpu: 0 },
    round:       1,
    phase:       'setup',   // setup | pick | result | gameover
    picks: {
      playerFingers: null,
      playerGuess:   null,
      cpuFingers:    null,
      cpuGuess:      null,
    },
    total:       null,
    roundWinner: null,   // 'player' | 'cpu' | 'draw'
    matchWinner: null,   // 'player' | 'cpu' | null

    // Session stats — persist across revenge/newGame, cleared only on page reload
    session: {
      matches: 0,
      wins:    0,
      losses:  0,
    },
  };

  function snap()    { return JSON.parse(JSON.stringify(state)); }
  function maxWins() { return state.mode === 'best-of-3' ? 2 : 1; }

  /**
   * CPU knows its own fingers; guesses a valid total from [cpuF+1 .. cpuF+5].
   * This gives CPU a ~1/5 chance of being correct — same as an optimal player.
   */
  function cpuSmartGuess(cpuF) {
    const min = cpuF + 1;
    const max = cpuF + 5;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function configure(playerName, mode) {
    state.player.name = playerName || 'Jugador';
    state.mode        = mode;
    state.scores      = { player: 0, cpu: 0 };
    state.round       = 1;
    state.picks       = { playerFingers: null, playerGuess: null, cpuFingers: null, cpuGuess: null };
    state.total       = null;
    state.roundWinner = null;
    state.matchWinner = null;
    state.phase       = 'pick';
    return snap();
  }

  /**
   * Player reveals their fingers + guess. CPU picks simultaneously.
   * If both or neither are correct → draw (round will be retried).
   */
  function playerPick(playerFingers, playerGuess) {
    const cpuF = FINGERS[Math.floor(Math.random() * FINGERS.length)];
    const cpuG = cpuSmartGuess(cpuF);

    state.picks.playerFingers = playerFingers;
    state.picks.playerGuess   = playerGuess;
    state.picks.cpuFingers    = cpuF;
    state.picks.cpuGuess      = cpuG;

    const total = playerFingers + cpuF;
    state.total = total;

    const playerCorrect = playerGuess === total;
    const cpuCorrect    = cpuG === total;

    if (playerCorrect && !cpuCorrect) {
      state.roundWinner = 'player';
      state.scores.player++;
    } else if (cpuCorrect && !playerCorrect) {
      state.roundWinner = 'cpu';
      state.scores.cpu++;
    } else {
      state.roundWinner = 'draw';
      // No score change; round will be retried
    }

    if (state.roundWinner !== 'draw') {
      if (state.scores.player >= maxWins())      state.matchWinner = 'player';
      else if (state.scores.cpu >= maxWins())    state.matchWinner = 'cpu';
      else if (state.mode === 'single')          state.matchWinner = state.roundWinner;

      if (state.matchWinner !== null) {
        state.session.matches++;
        if (state.matchWinner === 'player') state.session.wins++;
        else                                state.session.losses++;
      }
    }

    state.phase = 'result';
    return snap();
  }

  function nextRound() {
    state.round++;
    state.picks       = { playerFingers: null, playerGuess: null, cpuFingers: null, cpuGuess: null };
    state.total       = null;
    state.roundWinner = null;
    state.phase       = 'pick';
    return snap();
  }

  /** Retry a draw round — round number stays the same. */
  function retryRound() {
    state.picks       = { playerFingers: null, playerGuess: null, cpuFingers: null, cpuGuess: null };
    state.total       = null;
    state.roundWinner = null;
    state.phase       = 'pick';
    return snap();
  }

  function revenge() {
    state.scores      = { player: 0, cpu: 0 };
    state.round       = 1;
    state.picks       = { playerFingers: null, playerGuess: null, cpuFingers: null, cpuGuess: null };
    state.total       = null;
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
      picks:       { playerFingers: null, playerGuess: null, cpuFingers: null, cpuGuess: null },
      total:       null,
      roundWinner: null,
      matchWinner: null,
    });
    // session intentionally NOT reset
    return snap();
  }

  function fingersMeta() { return FINGERS_META; }
  function getState()    { return snap(); }

  return { configure, playerPick, nextRound, retryRound, revenge, newGame, fingersMeta, getState };
})();
