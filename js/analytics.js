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

  function clarityEvent(name) {
    try {
      if (typeof clarity === 'function') clarity('event', name);
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
      clarityEvent('game_start');
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
      clarityEvent('game_over');
      track('game_over', { match_winner: String(winner), total_rounds: totalRounds, ...flat });

      /* ── Streak tracking (only for vs-CPU and single-player modes) ── */
      try {
        if (typeof HGStreak !== 'undefined' && game !== 'hub') {
          /* winner values: 'player' = human won, anything else = loss/draw */
          const isWin = String(winner) === 'player';
          HGStreak.recordResult(game, isWin);
        }
      } catch (_) {}
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

    /* Generic event for share, etc. */
    event(name, params) {
      track(name, params || {});
    },
  };
})();

/* ── Haptic feedback on pick buttons (mobile, silent fail elsewhere) ── */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.btn-pick').forEach(btn => {
    btn.addEventListener('pointerdown', () => {
      try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) {}
    }, { passive: true });
  });
});

/* ── Sync mute button icon on page load ── */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-mute');
  if (!btn) return;
  try {
    const muted = localStorage.getItem('hg_muted') === '1';
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-label', muted ? 'Activar audio' : 'Silenciar audio');
    btn.title = muted ? 'Activar audio' : 'Silenciar audio';
  } catch (_) {}
});

/* ── Service Worker registration + offline toast ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      /* Show a subtle "available offline" toast the first time the SW installs */
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && !navigator.serviceWorker.controller) {
            _showOfflineToast();
          }
        });
      });
    }).catch(() => {});
  });
}

function _showOfflineToast() {
  try {
    const lang = (document.documentElement.lang || 'es').slice(0, 2);
    const msg  = lang === 'en' ? '✓ Available offline'
               : lang === 'pt' ? '✓ Disponível offline'
               : '✓ Disponible sin conexión';
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText = [
      'position:fixed','bottom:var(--sp-6,20px)','left:50%',
      'transform:translateX(-50%) translateY(12px)',
      'background:rgba(34,197,94,.92)',
      'color:#fff','font-size:13px','font-weight:700',
      'padding:8px 18px','border-radius:999px',
      'pointer-events:none','z-index:9999',
      'opacity:0','transition:opacity .35s, transform .35s',
    ].join(';');
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(8px)';
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  } catch (_) {}
}
