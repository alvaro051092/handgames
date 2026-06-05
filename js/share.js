/* ═══════════════════════════════════════════════════════════
   share.js — Injects a "Share result" button into the gameover
   screen so players can share their score/streak.

   - Uses navigator.share (Web Share API) on mobile → native sheet
   - Falls back to clipboard copy on desktop
   - Works across all game modes (vs-cpu, local, battle)
   - Fires an analytics event via HGA if available

   Load order: after analytics.js
═══════════════════════════════════════════════════════════ */
(() => {
  const _lang = (document.documentElement.lang || 'es').slice(0, 2).toLowerCase();

  const T = {
    es: {
      share:    'Compartir resultado',
      copied:   '¡Copiado!',
      shareText: (game, score) => `Acabo de jugar ${game} en handgames.app${score ? ' · ' + score : ''}. ¡A ver si me ganas!`,
      shareTitle: 'Hand Games',
    },
    en: {
      share:    'Share result',
      copied:   'Copied!',
      shareText: (game, score) => `I just played ${game} on handgames.app${score ? ' · ' + score : ''}. Can you beat me?`,
      shareTitle: 'Hand Games',
    },
    pt: {
      share:    'Compartilhar resultado',
      copied:   'Copiado!',
      shareText: (game, score) => `Acabei de jogar ${game} em handgames.app${score ? ' · ' + score : ''}. Consegue me vencer?`,
      shareTitle: 'Hand Games',
    },
  };
  const i = T[_lang] || T.es;

  /* ── Detect game name from URL ── */
  const GAME_NAMES = {
    es: { rps: 'Piedra Papel Tijeras', morra: 'Morra', chopsticks: 'Palillos', 'odd-even': 'Par o Impar', rpsls: 'RPSLS' },
    en: { rps: 'Rock Paper Scissors', morra: 'Morra', chopsticks: 'Chopsticks', 'odd-even': 'Odd or Even', rpsls: 'RPSLS' },
    pt: { rps: 'Pedra Papel Tesoura', morra: 'Morra', chopsticks: 'Palitos', 'odd-even': 'Par ou Ímpar', rpsls: 'RPSLS' },
  };
  const GAME_KEYS  = ['rps', 'morra', 'chopsticks', 'odd-even', 'rpsls'];
  const pathParts  = window.location.pathname.split('/').filter(Boolean);
  const gameKey    = pathParts.find(p => GAME_KEYS.includes(p)) || '';
  const gameName   = (GAME_NAMES[_lang] || GAME_NAMES.es)[gameKey] || 'Hand Games';
  const gameUrl    = gameKey ? `https://handgames.app/${gameKey}/` : 'https://handgames.app/';

  /* ── Build share text: include streak from HGStreak if available ── */
  function buildShareText() {
    let extra = '';
    try {
      if (typeof HGStreak !== 'undefined' && gameKey) {
        const KEY  = `hg_streak_${gameKey}`;
        const data = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (data && data.current > 1) {
          const streakLabel = _lang === 'en' ? `${data.current} win streak 🔥`
            : _lang === 'pt' ? `Sequência de ${data.current} vitórias 🔥`
            : `Racha de ${data.current} 🔥`;
          extra = streakLabel;
        } else if (data) {
          const pct = data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0;
          const pctLabel = _lang === 'en' ? `${pct}% win rate`
            : _lang === 'pt' ? `${pct}% de aproveitamento`
            : `${pct}% de aciertos`;
          extra = pctLabel;
        }
      }
    } catch (_) {}
    return i.shareText(gameName, extra);
  }

  /* ── Inject button into the gameover card ── */
  function injectShareButton() {
    const card = document.querySelector('.gameover-card');
    if (!card || document.getElementById('hg-share-btn')) return;

    const btn = document.createElement('button');
    btn.id        = 'hg-share-btn';
    btn.className = 'btn btn-ghost';
    btn.style.cssText = 'margin-top:var(--sp-3,10px);gap:var(--sp-2,6px);font-size:var(--text-sm,0.875rem);';
    btn.innerHTML = '<span aria-hidden="true">🔗</span> ' + i.share;
    btn.setAttribute('type', 'button');

    btn.addEventListener('click', async () => {
      const text = buildShareText();

      /* Track the share event */
      try { if (typeof HGA !== 'undefined') HGA.event('share', { game: gameKey, lang: _lang }); } catch (_) {}
      try { if (typeof gtag === 'function') gtag('event', 'share', { game: gameKey, lang: _lang }); } catch (_) {}

      if (navigator.share) {
        try {
          await navigator.share({ title: i.shareTitle, text, url: gameUrl });
          return;
        } catch (err) {
          if (err.name === 'AbortError') return; /* User cancelled */
        }
      }

      /* Clipboard fallback */
      try {
        await navigator.clipboard.writeText(text + '\n' + gameUrl);
      } catch (_) {
        /* Legacy execCommand fallback */
        const ta = document.createElement('textarea');
        ta.value = text + '\n' + gameUrl;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }

      /* Show brief confirmation */
      const orig = btn.innerHTML;
      btn.innerHTML = '<span aria-hidden="true">✅</span> ' + i.copied;
      btn.disabled  = true;
      setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 2000);
    });

    /* Insert before gameover-actions or at the end of the card */
    const actions = card.querySelector('.gameover-actions');
    if (actions) {
      card.insertBefore(btn, actions);
    } else {
      card.appendChild(btn);
    }
  }

  /* ── Watch for when #screen-gameover becomes active ── */
  const gameoverScreen = document.getElementById('screen-gameover');
  if (!gameoverScreen) return;

  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        if (gameoverScreen.classList.contains('active')) {
          /* Small delay so gameover content is already populated */
          setTimeout(injectShareButton, 50);
        }
      }
    }
  });

  observer.observe(gameoverScreen, { attributes: true });
})();
