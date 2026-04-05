/* ═══════════════════════════════════════════════════════════
   game-rpsls-battle.js — Pure game logic for Battle mode (RPSLS).
   CPU picks for both players. Zero DOM access.
   Exposes window.GameRPSLSBattle.
═══════════════════════════════════════════════════════════ */
window.GameRPSLSBattle = (() => {

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

  const META = {
    rock:     { emoji: '🪨', es: 'Piedra',  en: 'Rock',     pt: 'Pedra'   },
    paper:    { emoji: '📄', es: 'Papel',   en: 'Paper',    pt: 'Papel'   },
    scissors: { emoji: '✂️',  es: 'Tijeras', en: 'Scissors', pt: 'Tesoura' },
    lizard:   { emoji: '🦎', es: 'Lagarto', en: 'Lizard',   pt: 'Lagarto' },
    spock:    { emoji: '🖖', es: 'Spock',   en: 'Spock',    pt: 'Spock'   },
  };

  const state = {
    names:       { p1: 'Jugador 1', p2: 'Jugador 2' },
    mode:        'best-of-3',
    scores:      { p1: 0, p2: 0 },
    round:       1,
    phase:       'setup',
    picks:       { p1: null, p2: null },
    roundWinner: null,
    matchWinner: null,
    reason:      null,
  };

  function snap()    { return JSON.parse(JSON.stringify(state)); }
  function maxWins() { return state.mode === 'best-of-3' ? 2 : 1; }

  function configure(p1Name, p2Name, mode) {
    state.names      = { p1: p1Name || 'Jugador 1', p2: p2Name || 'Jugador 2' };
    state.mode       = mode || 'best-of-3';
    state.scores     = { p1: 0, p2: 0 };
    state.round      = 1;
    state.picks      = { p1: null, p2: null };
    state.roundWinner = null;
    state.matchWinner = null;
    state.reason     = null;
    state.phase      = 'battle';
    return snap();
  }

  /** CPU picks for both players and resolves the round. */
  function reveal() {
    const p1 = PICKS[Math.floor(Math.random() * PICKS.length)];
    const p2 = PICKS[Math.floor(Math.random() * PICKS.length)];
    state.picks.p1 = p1;
    state.picks.p2 = p2;

    let result;
    if (p1 === p2)         result = 'draw';
    else if (BEATS[p1][p2]) result = 'p1';
    else                   result = 'p2';

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

    if (state.scores.p1 >= maxWins())      state.matchWinner = 'p1';
    else if (state.scores.p2 >= maxWins()) state.matchWinner = 'p2';
    else if (state.mode === 'single')      state.matchWinner = result;

    state.phase = 'result';
    return snap();
  }

  function nextRound() {
    state.round++;
    state.picks       = { p1: null, p2: null };
    state.roundWinner = null;
    state.reason      = null;
    state.phase       = 'battle';
    return snap();
  }

  function revenge() {
    state.scores      = { p1: 0, p2: 0 };
    state.round       = 1;
    state.picks       = { p1: null, p2: null };
    state.roundWinner = null;
    state.matchWinner = null;
    state.reason      = null;
    state.phase       = 'battle';
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

  function meta()     { return META; }
  function reasons()  { return REASONS; }
  function getState() { return snap(); }

  return { configure, reveal, nextRound, revenge, newGame, meta, reasons, getState };
})();
