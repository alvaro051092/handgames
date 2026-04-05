/* ═══════════════════════════════════════════════════════════
   game-rpsls-local.js — Pure game logic for 2-player local (RPSLS).
   Zero DOM access. Exposes window.GameRPSLSLocal.
═══════════════════════════════════════════════════════════ */
window.GameRPSLSLocal = (() => {

  const PICKS = ['rock', 'paper', 'scissors', 'lizard', 'spock'];

  const BEATS = {
    rock:     { scissors: true, lizard:   true },
    paper:    { rock:     true, spock:    true },
    scissors: { paper:    true, lizard:   true },
    lizard:   { spock:    true, paper:    true },
    spock:    { scissors: true, rock:     true },
  };

  const REASONS = {
    rock_scissors:    { es: 'Piedra aplasta Tijeras',     en: 'Rock crushes Scissors',       pt: 'Pedra esmaga Tesoura'     },
    rock_lizard:      { es: 'Piedra aplasta Lagarto',     en: 'Rock crushes Lizard',         pt: 'Pedra esmaga Lagarto'     },
    paper_rock:       { es: 'Papel cubre Piedra',         en: 'Paper covers Rock',           pt: 'Papel cobre Pedra'        },
    paper_spock:      { es: 'Papel refuta a Spock',       en: 'Paper disproves Spock',       pt: 'Papel refuta Spock'       },
    scissors_paper:   { es: 'Tijeras cortan Papel',       en: 'Scissors cuts Paper',         pt: 'Tesoura corta Papel'      },
    scissors_lizard:  { es: 'Tijeras decapitan Lagarto',  en: 'Scissors decapitates Lizard', pt: 'Tesoura decapita Lagarto' },
    lizard_spock:     { es: 'Lagarto envenena a Spock',   en: 'Lizard poisons Spock',        pt: 'Lagarto envenena Spock'   },
    lizard_paper:     { es: 'Lagarto come Papel',         en: 'Lizard eats Paper',           pt: 'Lagarto come Papel'       },
    spock_scissors:   { es: 'Spock destruye Tijeras',     en: 'Spock smashes Scissors',      pt: 'Spock destrói Tesoura'    },
    spock_rock:       { es: 'Spock vaporiza Piedra',      en: 'Spock vaporizes Rock',        pt: 'Spock vaporiza Pedra'     },
  };

  const state = {
    names:       { p1: 'Jugador 1', p2: 'Jugador 2' },
    mode:        'best-of-3',
    scores:      { p1: 0, p2: 0 },
    round:       1,
    phase:       'setup',   // setup | p1-pick | handoff | p2-pick | result | gameover
    picks:       { p1: null, p2: null },
    roundWinner: null,
    matchWinner: null,
    reason:      null,
  };

  function snap()    { return JSON.parse(JSON.stringify(state)); }
  function maxWins() { return state.mode === 'best-of-3' ? 2 : 1; }

  function _resolve(a, b) {
    if (a === b) return 'draw';
    return BEATS[a][b] ? 'p1' : 'p2';
  }

  function configure(p1Name, p2Name, mode) {
    state.names      = { p1: p1Name || 'Jugador 1', p2: p2Name || 'Jugador 2' };
    state.mode       = mode || 'best-of-3';
    state.scores     = { p1: 0, p2: 0 };
    state.round      = 1;
    state.picks      = { p1: null, p2: null };
    state.roundWinner = null;
    state.matchWinner = null;
    state.reason     = null;
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
    const p1 = state.picks.p1, p2 = pick;
    const result = _resolve(p1, p2);
    state.roundWinner = result;

    if (result === 'p1') {
      state.scores.p1++;
      state.reason = `${p1}_${p2}`;
    } else if (result === 'p2') {
      state.scores.p2++;
      state.reason = `${p2}_${p1}`;
    } else {
      state.reason = null;
    }

    if (state.scores.p1 >= maxWins())   state.matchWinner = 'p1';
    else if (state.scores.p2 >= maxWins()) state.matchWinner = 'p2';
    else if (state.mode === 'single')   state.matchWinner = result;

    state.phase = 'result';
    return snap();
  }

  function nextRound() {
    state.round++;
    state.picks       = { p1: null, p2: null };
    state.roundWinner = null;
    state.reason      = null;
    state.phase       = 'p1-pick';
    return snap();
  }

  function revenge() {
    state.scores      = { p1: 0, p2: 0 };
    state.round       = 1;
    state.picks       = { p1: null, p2: null };
    state.roundWinner = null;
    state.matchWinner = null;
    state.reason      = null;
    state.phase       = 'p1-pick';
    return snap();
  }

  function newGame() {
    Object.assign(state, {
      names: { p1: 'Jugador 1', p2: 'Jugador 2' }, mode: 'best-of-3',
      scores: { p1: 0, p2: 0 }, round: 1, phase: 'setup',
      picks: { p1: null, p2: null },
      roundWinner: null, matchWinner: null, reason: null,
    });
    return snap();
  }

  function reasons()  { return REASONS; }
  function getState() { return snap(); }

  return { configure, p1Pick, p2Pick, nextRound, revenge, newGame, reasons, getState };
})();
