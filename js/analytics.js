/* ═══════════════════════════════════════════════════════════
   analytics.js — GA4 + Clarity event tracking helper.
   Auto-detects game / mode / language from the URL.
   Exposes window.HGA with named tracking methods.

   Load order: after audio.js, before ui-*.js

   Also the single bootstrap present on EVERY page (hubs, game screens,
   blog): it captures PWA install events and loads js/hg-ux.js, the
   shared UX/retention layer (setup helpers, install prompt, hub stats).
═══════════════════════════════════════════════════════════ */

/* ── PWA install: capture the event as early as possible ──
   Chrome fires `beforeinstallprompt` once; we keep it (and suppress the
   default mini-infobar) so hg-ux.js can offer the install after the first
   finished game instead of on arrival. */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  window.__hgInstallEvent = e;
});
window.addEventListener('appinstalled', () => {
  window.__hgInstallEvent = null;
  try { localStorage.setItem('hg_pwa_installed', '1'); } catch (_) {}
  try { if (window.HGA) HGA.event('pwa_installed'); } catch (_) {}
});

window.HGA = (() => {
  /* ── Context detection from URL pathname ── */
  const parts = location.pathname.split('/').filter(Boolean);
  const GAMES = new Set(['rps', 'morra', 'chopsticks', 'odd-even', 'rpsls']);
  const LANGS = new Set(['en', 'pt']);

  const game = parts.find(p => GAMES.has(p)) || 'hub';
  const lang = parts.find(p => LANGS.has(p)) || 'es';
  /* Language folders and game folders are not screens: /en/, /rps/en/ and
     /rps/ are all the "hub" of their scope (before, /en/ reported mode 'en'). */
  const rest = parts.filter(p => !LANGS.has(p) && !GAMES.has(p));
  const file = (rest[rest.length - 1] || '').replace(/\.html$/, '');
  const mode = (!file || file === 'index') ? 'hub' : file;

  /* ── Low-level senders ── */

  /* Runs `fn` after the browser has had a chance to paint the result of
     the current interaction (analytics must never sit on the critical
     path of a click: INP). Falls back to a timer when rAF is paused
     (background tab) so events are not lost. */
  function later(fn) {
    let done = false;
    const run = () => { if (!done) { done = true; try { fn(); } catch (_) {} } };
    try { requestAnimationFrame(() => setTimeout(run, 0)); } catch (_) {}
    setTimeout(run, 250);
  }

  /* game_start / game_over must reach GA4 and Clarity exactly once per
     match: swallow an identical event fired again within 1.5 s (double
     "Play!" click, Enter key repeat, double-fired handler). */
  const recent = new Map();
  function isDuplicate(name, params) {
    const key = name + '|' + JSON.stringify(params || {});
    const now = Date.now();
    const prev = recent.get(key);
    recent.set(key, now);
    return prev !== undefined && now - prev < 1500;
  }

  function track(name, params) {
    later(() => {
      try {
        if (typeof gtag === 'function') {
          gtag('event', name, { game, mode, lang, ...params });
        }
      } catch (_) {}
    });
  }

  function claritySet(key, val) {
    later(() => {
      try {
        if (typeof clarity === 'function') clarity('set', key, String(val));
      } catch (_) {}
    });
  }

  function clarityEvent(name) {
    later(() => {
      try {
        if (typeof clarity === 'function') clarity('event', name);
      } catch (_) {}
    });
  }

  /* Setup-screen choices, read from the DOM at the moment the match
     starts (the radios are still there while the start handler runs). */
  function readSetup() {
    const out = {};
    try {
      const diff = document.querySelector('input[name="difficulty"]:checked');
      const inp  = document.querySelector('input[name="input-mode"]:checked');
      if (diff) out.difficulty = diff.value;
      /* The radio is the *intent*. If the camera was requested but failed
         (denied / no device) the game continues in click mode, so report
         'camera' only when CameraGesture is actually running. */
      const wantsCam = !!inp && inp.value === 'camera';
      const camOn = !!(window.CameraGesture && typeof CameraGesture.isReady === 'function' && CameraGesture.isReady());
      out.input_mode = (wantsCam && camOn) ? 'camera' : 'click';
    } catch (_) {}
    return out;
  }

  /* ── Shared UI strings (ES / EN / PT) ──
     Texts that several ui-*.js files print from JavaScript (round badge,
     "GO!", draw banner, camera status, audio labels, RPS pick labels).
     Resolved once for the page language; game-specific sentences stay in
     each ui-*.js file's own `T` table. Spanish values are the original
     texts, unchanged. */
  const I18N = {
    es: {
      round:      n => `Ronda ${n}`,
      single:     'Intento único',
      go:         '¡YA!',
      drawRound:  '🤝 ¡Empate! Nadie anota punto.',
      winRound:   name => `🎉 ¡${name} gana la ronda!`,
      cpuWinRound:'🤖 ¡CPU gana la ronda!',
      drawTitle:  '¡Empate!',
      winSuffix:  ' gana!',
      defName:    'Jugador',
      defP1:      'Jugador 1',
      defP2:      'Jugador 2',
      audioOn:    'Activar audio',
      audioOff:   'Silenciar audio',
      camStarting:'Activando cámara…',
      camDenied:  'Permiso de cámara denegado — seguimos con el modo click.',
      camFailed:  'No se pudo iniciar la cámara — seguimos con el modo click.',
      camSearching:'Detectando mano…',
      camAdjust:  'Mano detectada — ajustá el gesto',
      camShowFingers: 'Mano detectada — mostrá tus dedos',
      camPickBetFirst:'Elegí tu apuesta primero',
      camDetected: l => `Detectando: ${l}`,
      camHolding:  l => `Manteniendo ${l}…`,
      pick: { rock: '🪨 Piedra', paper: '📄 Papel', scissors: '✂️ Tijeras' },
      pickName: { rock: 'Piedra', paper: 'Papel', scissors: 'Tijeras' },
      finger:     n => `${n} ${n === 1 ? 'dedo' : 'dedos'}`,
      guessed:    'apostó:',
      even: 'Par', odd: 'Impar',
    },
    en: {
      round:      n => `Round ${n}`,
      single:     'Single round',
      go:         'GO!',
      drawRound:  '🤝 Draw! Nobody scores.',
      winRound:   name => `🎉 ${name} wins the round!`,
      cpuWinRound:'🤖 CPU wins the round!',
      drawTitle:  'Draw!',
      winSuffix:  ' wins!',
      defName:    'Player',
      defP1:      'Player 1',
      defP2:      'Player 2',
      audioOn:    'Turn audio on',
      audioOff:   'Mute audio',
      camStarting:'Starting camera…',
      camDenied:  'Camera permission denied — continuing in click mode.',
      camFailed:  'Could not start the camera — continuing in click mode.',
      camSearching:'Looking for your hand…',
      camAdjust:  'Hand detected — adjust your gesture',
      camShowFingers: 'Hand detected — show your fingers',
      camPickBetFirst:'Choose your bet first',
      camDetected: l => `Detected: ${l}`,
      camHolding:  l => `Holding ${l}…`,
      pick: { rock: '🪨 Rock', paper: '📄 Paper', scissors: '✂️ Scissors' },
      pickName: { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' },
      finger:     n => `${n} ${n === 1 ? 'finger' : 'fingers'}`,
      guessed:    'guessed:',
      even: 'Even', odd: 'Odd',
    },
    pt: {
      round:      n => `Rodada ${n}`,
      single:     'Tentativa única',
      go:         'JÁ!',
      drawRound:  '🤝 Empate! Ninguém pontua.',
      winRound:   name => `🎉 ${name} vence a rodada!`,
      cpuWinRound:'🤖 A CPU vence a rodada!',
      drawTitle:  'Empate!',
      winSuffix:  ' vence!',
      defName:    'Jogador',
      defP1:      'Jogador 1',
      defP2:      'Jogador 2',
      audioOn:    'Ativar áudio',
      audioOff:   'Silenciar áudio',
      camStarting:'Ativando a câmera…',
      camDenied:  'Permissão da câmera negada — seguimos no modo clique.',
      camFailed:  'Não foi possível iniciar a câmera — seguimos no modo clique.',
      camSearching:'Procurando sua mão…',
      camAdjust:  'Mão detectada — ajuste o gesto',
      camShowFingers: 'Mão detectada — mostre seus dedos',
      camPickBetFirst:'Escolha sua aposta primeiro',
      camDetected: l => `Detectado: ${l}`,
      camHolding:  l => `Segurando ${l}…`,
      pick: { rock: '🪨 Pedra', paper: '📄 Papel', scissors: '✂️ Tesoura' },
      pickName: { rock: 'Pedra', paper: 'Papel', scissors: 'Tesoura' },
      finger:     n => `${n} ${n === 1 ? 'dedo' : 'dedos'}`,
      guessed:    'apostou:',
      even: 'Par', odd: 'Ímpar',
    },
  };

  let match = { startedAt: 0, difficulty: undefined, input_mode: undefined };

  /* Drops undefined values (gtag would serialise them as "undefined"). */
  function clean(obj) {
    const o = {};
    Object.keys(obj).forEach(k => { if (obj[k] !== undefined && obj[k] !== null) o[k] = obj[k]; });
    return o;
  }

  /* ── Public API ── */

  return {
    /* Page context, shared with hg-ux.js */
    ctx: { game, mode, lang },

    /* Shared UI strings for the page language (see I18N above) */
    i18n: I18N[lang] || I18N.es,

    /* Called when user clicks Start on the setup screen.
       matchType: 'best-of-3' | 'single' | 'online' */
    gameStart(matchType) {
      const setup = readSetup();
      if (isDuplicate('game_start', { matchType, ...setup })) return;
      match = { startedAt: Date.now(), difficulty: setup.difficulty, input_mode: setup.input_mode };
      claritySet('game', game);
      claritySet('game_mode', mode);
      claritySet('lang', lang);
      claritySet('match_type', matchType);
      if (setup.difficulty) claritySet('difficulty', setup.difficulty);
      clarityEvent('game_start');
      track('game_start', clean({ match_type: matchType, difficulty: setup.difficulty, input_mode: setup.input_mode }));
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
      if (isDuplicate('game_over', { winner: String(winner), scores, totalRounds })) return;

      const flat = {};
      if (scores && typeof scores === 'object') {
        Object.entries(scores).forEach(([k, v]) => { flat['score_' + k] = v; });
      }
      const w = String(winner);
      /* vs-CPU has a human side ('player'); local/battle report p1/p2. */
      const result = mode === 'vs-cpu'
        ? (w === 'player' ? 'win' : w === 'draw' ? 'draw' : 'loss')
        : (w === 'draw' ? 'draw' : w);

      clarityEvent('game_over');
      track('game_over', clean({
        match_winner: w,
        result,
        total_rounds: totalRounds,
        difficulty: match.difficulty,
        input_mode: match.input_mode,
        duration_s: match.startedAt ? Math.round((Date.now() - match.startedAt) / 1000) : undefined,
        ...flat,
      }));

      /* ── Streak / stats tracking: only matches with a human side vs the
         CPU. Local (2P) and battle (CPU vs CPU) report winners 'p1'/'p2'
         and must not count as the player's wins or losses. ── */
      try {
        if (typeof HGStreak !== 'undefined' && game !== 'hub' && mode === 'vs-cpu') {
          if (w === 'draw') {
            if (HGStreak.recordDraw) HGStreak.recordDraw(game);
          } else {
            HGStreak.recordResult(game, w === 'player');
          }
        }
      } catch (_) {}

      /* Install nudge etc. — only after a finished match. */
      try { if (window.HGUX) HGUX.afterGameOver(result); } catch (_) {}
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

    /* Generic event for share, invite, install, etc. */
    event(name, params) {
      track(name, params || {});
    },
  };
})();

/* ── Tag Clarity sessions that run as an installed app ── */
try {
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  if (standalone && typeof clarity === 'function') clarity('set', 'display_mode', 'standalone');
} catch (_) {}

/* ── UX layer: loaded synchronously so it can pre-select saved settings
   before first paint and register its handlers before the ui-*.js ones.
   (Plain document.write of a same-origin script: parser-blocking like any
   classic <script>, no extra HTML needed on the ~80 pages.) ──
   Bump the ?v= below whenever hg-ux.js changes (and the analytics.js ?v=
   in the HTML, otherwise browsers keep the old loader: worker.js caches
   *.js as immutable for a year). */
(function loadUx() {
  const src = '/js/hg-ux.js?v=1';
  try {
    if (document.readyState === 'loading') {
      document.write('<script src="' + src + '"><\/script>');
    } else {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      document.head.appendChild(s);
    }
  } catch (_) {}
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
    const L = HGA.i18n;
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-label', muted ? L.audioOn : L.audioOff);
    btn.title = muted ? L.audioOn : L.audioOff;
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
