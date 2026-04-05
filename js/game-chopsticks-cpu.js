/* ═══════════════════════════════════════════════════════════
   game-chopsticks-cpu.js — Pure game logic for vs-CPU (Chopsticks).
   Rules: each player has 2 hands (left, right) starting at 1 finger.
   Tap one of your hands against one opponent hand; fingers add up.
   Hand reaches 5+ → eliminated (set to 0). Both hands 0 → you lose.
   No splitting. Zero DOM access. Exposes window.GameChopsticksCPU.
═══════════════════════════════════════════════════════════ */
window.GameChopsticksCPU = (() => {

  const EMOJI = ['✊', '☝️', '✌️', '🤟', '🖖'];

  const state = {
    phase:       'setup',   // setup | game | round-over | gameover
    names:       { player: 'Jugador', cpu: 'CPU' },
    mode:        'best-of-3',
    need:        2,          // wins required
    player:      { left: 1, right: 1 },
    cpu:         { left: 1, right: 1 },
    turn:        'player',  // 'player' | 'cpu'
    scores:      { player: 0, cpu: 0 },
    roundWinner: null,      // 'player' | 'cpu' | null
    winner:      null,      // final match winner
    lastMove:    null,      // { by, from, to }

    // Session — persists across revenge/newGame, reset on page reload
    session: { matches: 0, wins: 0, losses: 0 },
  };

  function snap() { return JSON.parse(JSON.stringify(state)); }

  function _alive(h) { return h.left > 0 || h.right > 0; }

  function _tap(atk, aHand, def, dHand) {
    const v = atk[aHand] + def[dHand];
    def[dHand] = v >= 5 ? 0 : v;
  }

  /** CPU prefers killing moves, otherwise random. */
  function _cpuPick() {
    const mine = ['left', 'right'].filter(h => state.cpu[h] > 0);
    const tgts = ['left', 'right'].filter(h => state.player[h] > 0);
    for (const m of mine) {
      for (const t of tgts) {
        if (state.cpu[m] + state.player[t] >= 5) return { m, t };
      }
    }
    return {
      m: mine[Math.floor(Math.random() * mine.length)],
      t: tgts[Math.floor(Math.random() * tgts.length)],
    };
  }

  function _checkEnd(attacker) {
    const loser = attacker === 'player' ? 'cpu' : 'player';
    if (!_alive(state[loser])) {
      state.scores[attacker]++;
      if (state.scores[attacker] >= state.need) {
        state.winner      = attacker;
        state.roundWinner = attacker;
        state.phase       = 'gameover';
        state.session.matches++;
        if (attacker === 'player') state.session.wins++;
        else                       state.session.losses++;
      } else {
        state.roundWinner = attacker;
        state.phase       = 'round-over';
      }
    } else {
      state.turn = attacker === 'player' ? 'cpu' : 'player';
    }
  }

  // ── Public API ─────────────────────────────────────────

  function configure(playerName, mode) {
    state.names.player = playerName || 'Jugador';
    state.mode         = mode || 'best-of-3';
    state.need         = state.mode === 'best-of-3' ? 2 : 1;
    state.player       = { left: 1, right: 1 };
    state.cpu          = { left: 1, right: 1 };
    state.turn         = 'player';
    state.scores       = { player: 0, cpu: 0 };
    state.roundWinner  = null;
    state.winner       = null;
    state.lastMove     = null;
    state.phase        = 'game';
    return snap();
  }

  /** Player taps myHand (their hand) against tgtHand (CPU's hand). */
  function playerTap(myHand, tgtHand) {
    if (state.phase !== 'game' || state.turn !== 'player') return null;
    if (state.player[myHand] === 0 || state.cpu[tgtHand] === 0) return null;
    _tap(state.player, myHand, state.cpu, tgtHand);
    state.lastMove = { by: 'player', from: myHand, to: tgtHand };
    _checkEnd('player');
    return snap();
  }

  /** Execute one CPU move. Call after playerTap when turn === 'cpu'. */
  function cpuMove() {
    if (state.phase !== 'game' || state.turn !== 'cpu') return null;
    const { m, t } = _cpuPick();
    _tap(state.cpu, m, state.player, t);
    state.lastMove = { by: 'cpu', from: m, to: t };
    _checkEnd('cpu');
    return snap();
  }

  /** Reset hands for next game in a best-of-3 series. */
  function nextRound() {
    state.player      = { left: 1, right: 1 };
    state.cpu         = { left: 1, right: 1 };
    state.turn        = 'player';
    state.roundWinner = null;
    state.lastMove    = null;
    state.phase       = 'game';
    return snap();
  }

  function revenge() {
    state.scores      = { player: 0, cpu: 0 };
    state.player      = { left: 1, right: 1 };
    state.cpu         = { left: 1, right: 1 };
    state.turn        = 'player';
    state.roundWinner = null;
    state.winner      = null;
    state.lastMove    = null;
    state.phase       = 'game';
    return snap();
  }

  function newGame() {
    Object.assign(state, {
      phase: 'setup', names: { player: 'Jugador', cpu: 'CPU' },
      mode: 'best-of-3', need: 2,
      player: { left: 1, right: 1 }, cpu: { left: 1, right: 1 },
      turn: 'player', scores: { player: 0, cpu: 0 },
      roundWinner: null, winner: null, lastMove: null,
    });
    return snap();
  }

  function getState() { return snap(); }
  function emoji(n)   { return EMOJI[Math.max(0, Math.min(4, n))]; }

  return { configure, playerTap, cpuMove, nextRound, revenge, newGame, getState, emoji };
})();
