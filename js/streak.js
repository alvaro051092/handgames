/* ═══════════════════════════════════════════════════════════
   streak.js — Persistent win-streak tracker using localStorage.
   No login, no backend. Tracks per-game stats across visits.

   Exposes window.HGStreak with one public method:
     HGStreak.recordResult(game, isWin)
       → updates localStorage, injects/refreshes streak banner
          inside .gameover-card if present in the DOM.

   Load order: after analytics.js, before ui-*.js
═══════════════════════════════════════════════════════════ */

window.HGStreak = (() => {

  /* ── Storage helpers ── */
  const KEY = g => `hg_streak_${g}`;

  function load(game) {
    try {
      const raw = localStorage.getItem(KEY(game));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) { return null; }
  }

  function save(game, data) {
    try { localStorage.setItem(KEY(game), JSON.stringify(data)); } catch (_) {}
  }

  function defaults() {
    return { current: 0, best: 0, wins: 0, losses: 0, total: 0 };
  }

  /* ── Core logic ── */
  function recordResult(game, isWin) {
    const d = load(game) || defaults();

    d.total += 1;
    if (isWin) {
      d.wins += 1;
      d.current += 1;
      if (d.current > d.best) d.best = d.current;
    } else {
      d.losses += 1;
      d.current = 0;
    }

    save(game, d);
    _render(game, d, isWin);
    return d;
  }

  /* ── DOM injection ── */
  function _render(game, d, isWin) {
    /* Find or create the streak banner inside .gameover-card */
    const card = document.querySelector('.gameover-card');
    if (!card) return;

    let banner = document.getElementById('hg-streak-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'hg-streak-banner';
      banner.className = 'hg-streak-banner';

      /* Insert before the actions row so it's visible without scroll */
      const actions = card.querySelector('.gameover-actions');
      if (actions) {
        card.insertBefore(banner, actions);
      } else {
        card.appendChild(banner);
      }
    }

    const newBest = d.current > 0 && d.current === d.best && d.best > 1;
    const winPct  = d.total > 0 ? Math.round((d.wins / d.total) * 100) : 0;

    /* Labels based on page lang (detected from html[lang] or navigator) */
    const lang = (document.documentElement.lang || navigator.language || 'es').slice(0, 2).toLowerCase();
    const T = _labels(lang);

    /* Streak fire emoji ramps up with streak length */
    const fireLevel = d.current >= 5 ? '🔥🔥🔥' : d.current >= 3 ? '🔥🔥' : d.current > 0 ? '🔥' : '';

    banner.innerHTML = `
      <div class="hg-streak-inner">
        <div class="hg-streak-row hg-streak-main">
          ${isWin && d.current > 1
            ? `<span class="hg-streak-fire">${fireLevel}</span>
               <span class="hg-streak-label">${T.streak} <strong>${d.current}</strong></span>
               ${newBest ? `<span class="hg-streak-badge">${T.newRecord}</span>` : ''}`
            : isWin
              ? `<span class="hg-streak-fire">🎉</span>
                 <span class="hg-streak-label">${T.firstWin}</span>`
              : `<span class="hg-streak-fire">💪</span>
                 <span class="hg-streak-label">${T.keepGoing}</span>`
          }
        </div>
        <div class="hg-streak-row hg-streak-stats">
          <span class="hg-stat"><strong>${d.wins}</strong> ${T.wins}</span>
          <span class="hg-sep">·</span>
          <span class="hg-stat"><strong>${d.losses}</strong> ${T.losses}</span>
          <span class="hg-sep">·</span>
          <span class="hg-stat"><strong>${winPct}%</strong> ${T.winRate}</span>
          ${d.best > 1 ? `<span class="hg-sep">·</span><span class="hg-stat">🔥 <strong>${d.best}</strong> ${T.best}</span>` : ''}
        </div>
      </div>
    `;

    /* Kick a brief entrance animation */
    banner.classList.remove('hg-streak-in');
    void banner.offsetWidth; /* reflow */
    banner.classList.add('hg-streak-in');
  }

  function _labels(lang) {
    const MAP = {
      en: {
        streak: 'Win streak:',
        newRecord: '🏅 New record!',
        firstWin: 'First win — keep it up!',
        keepGoing: 'Keep going, you\'ll get there!',
        wins: 'wins',
        losses: 'losses',
        winRate: 'win rate',
        best: 'best streak',
      },
      pt: {
        streak: 'Sequência:',
        newRecord: '🏅 Novo recorde!',
        firstWin: 'Primeira vitória — continue assim!',
        keepGoing: 'Continue tentando!',
        wins: 'vitórias',
        losses: 'derrotas',
        winRate: 'aproveitamento',
        best: 'melhor sequência',
      },
    };
    return MAP[lang] || {
      streak: 'Racha:',
      newRecord: '🏅 ¡Nuevo récord!',
      firstWin: '¡Primera victoria — sigue así!',
      keepGoing: '¡Sigue intentándolo!',
      wins: 'victorias',
      losses: 'derrotas',
      winRate: 'aciertos',
      best: 'mejor racha',
    };
  }

  return { recordResult };
})();
