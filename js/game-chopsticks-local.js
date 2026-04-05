/* ═══════════════════════════════════════════════════════════
   game-chopsticks-local.js — Pure game logic for 2-player local (Chopsticks).
   Same rules as vs-CPU but both players are human (handoff device).
   Zero DOM access. Exposes window.GameChopsticksLocal.
═══════════════════════════════════════════════════════════ */
window.GameChopsticksLocal = (() => {

  const EMOJI = ['✊', '☝️', '✌️', '🤟', '🖖'];

  const state = {
    phase:       'setup',
    names:       { p1: 'Jugador 1', p2: 'Jugador 2' },
    mode:        'best-of-3',
    need:        2,
    p1:          { left: 1, right: 1 },
    p2:          { left: 1, right: 1 },
    turn:        'p1',
    scores:      { p1: 0, p2: 0 },
    roundWinner: null,
    winner:      null,
    lastMove:    null,
  };

  function snap() { return JSON.parse(JSON.stringify(state)); }

  function _alive(h) { return h.left > 0 || h.right > 0; }

  function _tap(atk, aHand, def, dHand) {
    const v = atk[aHand] + def[dHand];
    def[dHand] = v >= 5 ? 0 : v;
  }

  function _checkEnd(attacker) {
    const loser = attacker === 'p1' ? 'p2' : 'p1';
    if (!_alive(state[loser])) {
      state.scores[attacker]++;
      if (state.scores[attacker] >= state.need) {
        state.winner      = attacker;
        state.roundWinner = attacker;
        state.phase       = 'gameover';
      } else {
        state.roundWinner = attacker;
        state.phase       = 'round-over';
      }
    } else {
      state.turn = attacker === 'p1' ? 'p2' : 'p1';
    }
  }

  // ── Public API ─────────────────────────────────────────

  function configure(p1Name, p2Name, mode) {
    state.names      = { p1: p1Name || 'Jugador 1', p2: p2Name || 'Jugador 2' };
    state.mode       = mode || 'best-of-3';
    state.need       = state.mode === 'best-of-3' ? 2 : 1;
    state.p1         = { left: 1, right: 1 };
    state.p2         = { left: 1, right: 1 };
    state.turn       = 'p1';
    state.scores     = { p1: 0, p2: 0 };
    state.roundWinner = null;
    state.winner     = null;
    state.lastMove   = null;
    state.phase      = 'game';
    return snap();
  }

  /**
   * Current player taps myHand against opponent's tgtHand.
   * myHand / tgtHand: 'left' | 'right'
   */
  function tap(myHand, tgtHand) {
    if (state.phase !== 'game') return null;
    const cur = state.turn;
    const opp = cur === 'p1' ? 'p2' : 'p1';
    if (state[cur][myHand] === 0 || state[opp][tgtHand] === 0) return null;
    _tap(state[cur], myHand, state[opp], tgtHand);
    state.lastMove = { by: cur, from: myHand, to: tgtHand };
    _checkEnd(cur);
    return snap();
  }

  function nextRound() {
    state.p1         = { left: 1, right: 1 };
    state.p2         = { left: 1, right: 1 };
    state.turn       = 'p1';
    state.roundWinner = null;
    state.lastMove   = null;
    state.phase      = 'game';
    return snap();
  }

  function revenge() {
    state.scores     = { p1: 0, p2: 0 };
    state.p1         = { left: 1, right: 1 };
    state.p2         = { left: 1, right: 1 };
    state.turn       = 'p1';
    state.roundWinner = null;
    state.winner     = null;
    state.lastMove   = null;
    state.phase      = 'game';
    return snap();
  }

  function newGame() {
    Object.assign(state, {
      phase: 'setup', names: { p1: 'Jugador 1', p2: 'Jugador 2' },
      mode: 'best-of-3', need: 2,
      p1: { left: 1, right: 1 }, p2: { left: 1, right: 1 },
      turn: 'p1', scores: { p1: 0, p2: 0 },
      roundWinner: null, winner: null, lastMove: null,
    });
    return snap();
  }

  function getState() { return snap(); }
  function emoji(n)   { return EMOJI[Math.max(0, Math.min(4, n))]; }

  return { configure, tap, nextRound, revenge, newGame, getState, emoji };
})();
