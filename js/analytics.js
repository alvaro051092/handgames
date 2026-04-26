/* ═══════════════════════════════════════════════════════════
   analytics.js — GA4 + Clarity event tracking helper.
   Auto-detects game / mode / language from the URL.
   Exposes window.HGA with named tracking methods.

   Load order: after audio.js, before ui-*.js
═══════════════════════════════════════════════════════════ */
window.HGA = (() => {
  /* ── Context detection from URL pathname ── */
  const parts = location.pathname.split('/').filter(Boolean);
  const GAMES = new Set(['rps', 'morra', 'chopsticks', 'odd-even', 'rpsls']);
  const LANGS = new Set(['en', 'pt']);

  const game = parts.find(p => GAMES.has(p)) || 'hub';
  const lang = parts.find(p => LANGS.has(p)) || 'es';
  const file = (parts[parts.length - 1] || '').replace(/\.html$/, '');
  const mode = (!file || file === 'index') ? 'hub' : file;

  /* ── Low-level senders ── */

  function track(name, params) {
    try {
      if (typeof gtag === 'function') {
        gtag('event', name, { game, mode, lang, ...params });
      }
    } catch (_) {}
  }

  function claritySet(key, val) {
    try {
      if (typeof clarity === 'function') clarity('set', key, String(val));
    } catch (_) {}
  }

  /* ── Public API ── */

  return {
    /* Called when user clicks Start on the setup screen.
       matchType: 'best-of-3' | 'single' */
    gameStart(matchType) {
      claritySet('game', game);
      claritySet('game_mode', mode);
      claritySet('lang', lang);
      claritySet('match_type', matchType);
      track('game_start', { match_type: matchType });
    },

    /* Called when a human player confirms their pick.
       params: { pick, round } or game-specific fields
       e.g. { pick_fingers: 3, pick_guess: 7, round: 1 } */
    pickMade(params) {
      track('pick_made', params);
    },

    /* Called after each round resolves.
       winner: raw roundWinner from state ('player','cpu','p1','p2','draw')
       extra:  any additional state fields to include */
    roundResult(winner, extra) {
      track('round_result', { round_winner: winner, ...extra });
    },

    /* Called when a match ends (game over screen shown).
       winner:      matchWinner or winner from state
       scores:      state.scores object { player: 2, cpu: 1 } etc.
       totalRounds: state.round */
    gameOver(winner, scores, totalRounds) {
      const flat = {};
      if (scores && typeof scores === 'object') {
        Object.entries(scores).forEach(([k, v]) => { flat['score_' + k] = v; });
      }
      track('game_over', { match_winner: String(winner), total_rounds: totalRounds, ...flat });
    },

    /* Called when a player starts a rematch. */
    revenge() {
      track('revenge');
    },

    /* Called when the mute button is toggled.
       muted: boolean — true = now muted */
    audioToggle(muted) {
      track('audio_toggle', { audio_state: muted ? 'muted' : 'unmuted' });
    },
  };
})();
