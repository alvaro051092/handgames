/* ═══════════════════════════════════════════════════════════
   game-rpsls-cpu.js — Pure game logic for vs-CPU (RPSLS).
   Picks: rock, paper, scissors, lizard, spock.
   Zero DOM access. Exposes window.GameRPSLSCPU.
═══════════════════════════════════════════════════════════ */
window.GameRPSLSCPU = (() => {

  const PICKS = ['rock', 'paper', 'scissors', 'lizard', 'spock'];

  // What each pick defeats (and why)
  const BEATS = {
    rock:     { scissors: 'crushes',   lizard:   'crushes'   },
    paper:    { rock:     'covers',    spock:    'disproves' },
    scissors: { paper:    'cuts',      lizard:   'decapitates'},
    lizard:   { spock:    'poisons',   paper:    'eats'      },
    spock:    { scissors: 'smashes',   rock:     'vaporizes' },
  };

  const META = {
    rock:     { emoji: '🪨', es: 'Piedra',  en: 'Rock',     pt: 'Pedra'   },
    paper:    { emoji: '📄', es: 'Papel',   en: 'Paper',    pt: 'Papel'   },
    scissors: { emoji: '✂️',  es: 'Tijeras', en: 'Scissors', pt: 'Tesoura' },
    lizard:   { emoji: '🦎', es: 'Lagarto', en: 'Lizard',   pt: 'Lagarto' },
    spock:    { emoji: '🖖', es: 'Spock',   en: 'Spock',    pt: 'Spock'   },
  };

  // Reason strings per language: key = `${winner}_${loser}`
  const REASONS = {
    rock_scissors:    { es: 'Piedra aplasta Tijeras',          en: 'Rock crushes Scissors',          pt: 'Pedra esmaga Tesoura'          },
    rock_lizard:      { es: 'Piedra aplasta Lagarto',          en: 'Rock crushes Lizard',            pt: 'Pedra esmaga Lagarto'          },
    paper_rock:       { es: 'Papel cubre Piedra',              en: 'Paper covers Rock',              pt: 'Papel cobre Pedra'             },
    paper_spock:      { es: 'Papel refuta a Spock',            en: 'Paper disproves Spock',          pt: 'Papel refuta Spock'            },
    scissors_paper:   { es: 'Tijeras cortan Papel',            en: 'Scissors cuts Paper',            pt: 'Tesoura corta Papel'           },
    scissors_lizard:  { es: 'Tijeras decapitan Lagarto',       en: 'Scissors decapitates Lizard',    pt: 'Tesoura decapita Lagarto'      },
    lizard_spock:     { es: 'Lagarto envenena a Spock',        en: 'Lizard poisons Spock',           pt: 'Lagarto envenena Spock'        },
    lizard_paper:     { es: 'Lagarto come Papel',              en: 'Lizard eats Paper',              pt: 'Lagarto come Papel'            },
    spock_scissors:   { es: 'Spock destruye Tijeras',          en: 'Spock smashes Scissors',         pt: 'Spock destrói Tesoura'         },
    spock_rock:       { es: 'Spock vaporiza Piedra',           en: 'Spock vaporizes Rock',           pt: 'Spock vaporiza Pedra'          },
  };

  const state = {
    player:      { name: 'Jugador' },
    mode:        'best-of-3',
    scores:      { player: 0, cpu: 0 },
    round:       1,
    phase:       'setup',
    picks:       { player: null, cpu: null },
    roundWinner: null,   // 'player' | 'cpu' | 'draw'
    matchWinner: null,
    reason:      null,   // e.g. 'rock_scissors'
    session: { matches: 0, wins: 0, losses: 0, draws: 0 },
  };

  function snap()    { return JSON.parse(JSON.stringify(state)); }
  function maxWins() { return state.mode === 'best-of-3' ? 2 : 1; }

  function _resolve(a, b) {
    if (a === b) return 'draw';
    return BEATS[a][b] !== undefined ? 'player' : 'cpu';
  }

  function configure(playerName, mode) {
    state.player.name = playerName || 'Jugador';
    state.mode        = mode || 'best-of-3';
    state.scores      = { player: 0, cpu: 0 };
    state.round       = 1;
    state.picks       = { player: null, cpu: null };
    state.roundWinner = null;
    state.matchWinner = null;
    state.reason      = null;
    state.phase       = 'pick';
    return snap();
  }

  function playerPick(pick) {
    const cpu = PICKS[Math.floor(Math.random() * PICKS.length)];
    state.picks.player = pick;
    state.picks.cpu    = cpu;

    const result = _resolve(pick, cpu);
    state.roundWinner = result;

    if (result === 'player') {
      state.scores.player++;
      state.reason = `${pick}_${cpu}`;
    } else if (result === 'cpu') {
      state.scores.cpu++;
      state.reason = `${cpu}_${pick}`;
    } else {
      state.reason = null;
    }

    if (state.scores.player >= maxWins())   state.matchWinner = 'player';
    else if (state.scores.cpu >= maxWins()) state.matchWinner = 'cpu';
    else if (state.mode === 'single')       state.matchWinner = result;

    if (state.matchWinner !== null) {
      state.session.matches++;
      if      (state.matchWinner === 'player') state.session.wins++;
      else if (state.matchWinner === 'cpu')    state.session.losses++;
      else                                     state.session.draws++;
    }

    state.phase = 'result';
    return snap();
  }

  function nextRound() {
    state.round++;
    state.picks       = { player: null, cpu: null };
    state.roundWinner = null;
    state.reason      = null;
    state.phase       = 'pick';
    return snap();
  }

  function revenge() {
    state.scores      = { player: 0, cpu: 0 };
    state.round       = 1;
    state.picks       = { player: null, cpu: null };
    state.roundWinner = null;
    state.matchWinner = null;
    state.reason      = null;
    state.phase       = 'pick';
    return snap();
  }

  function newGame() {
    Object.assign(state, {
      player: { name: 'Jugador' }, mode: 'best-of-3',
      scores: { player: 0, cpu: 0 }, round: 1, phase: 'setup',
      picks: { player: null, cpu: null },
      roundWinner: null, matchWinner: null, reason: null,
    });
    return snap();
  }

  function meta()     { return META; }
  function reasons()  { return REASONS; }
  function getState() { return snap(); }

  return { configure, playerPick, nextRound, revenge, newGame, meta, reasons, getState };
})();
