/* ═══════════════════════════════════════════════════════════
   lang-nav.js — Auto-injects language switcher on game pages
   that don't have one (vs-cpu, local, battle).

   URL convention:
     ES  →  /game/page.html          (or /game/)
     EN  →  /game/en/page.html       (or /game/en/)
     PT  →  /game/pt/page.html       (or /game/pt/)

   Load order: independent, after DOM ready.
═══════════════════════════════════════════════════════════ */
(() => {
  /* Skip if a lang-nav is already present in the page */
  if (document.querySelector('.lang-nav')) return;

  const currentLang = (document.documentElement.lang || 'es').slice(0, 2).toLowerCase();
  const path        = window.location.pathname;

  /* ── Build alternate URLs ── */
  const parts = path.split('/').filter(Boolean);
  /* Remove any existing lang segment ('en' | 'pt') to get the base path */
  const LANGS = new Set(['en', 'pt']);
  const base  = parts.filter(p => !LANGS.has(p));   /* e.g. ['rps', 'vs-cpu.html'] */

  /* Insert lang segment between game segment (idx 0) and the rest */
  function buildUrl(lang) {
    if (base.length === 0) {
      return lang === 'es' ? '/' : `/${lang}/`;
    }
    let segments;
    if (lang === 'es') {
      segments = [...base];
    } else {
      /* Insert lang after the first segment (the game folder) */
      segments = [base[0], lang, ...base.slice(1)];
    }
    const joined = '/' + segments.join('/');
    /* Preserve trailing slash for directory-style URLs */
    return path.endsWith('/') && !joined.endsWith('/') ? joined + '/' : joined;
  }

  const urls = { es: buildUrl('es'), en: buildUrl('en'), pt: buildUrl('pt') };

  /* ── Build nav element ── */
  const nav = document.createElement('nav');
  nav.className = 'lang-nav';
  nav.setAttribute('aria-label', 'Idioma');

  ['es', 'en', 'pt'].forEach(lang => {
    if (lang === currentLang) {
      const span = document.createElement('span');
      span.className = 'lang-link active';
      span.textContent = lang.toUpperCase();
      span.setAttribute('aria-current', 'true');
      nav.appendChild(span);
    } else {
      const a = document.createElement('a');
      a.className = 'lang-link';
      a.href      = urls[lang];
      a.textContent = lang.toUpperCase();
      nav.appendChild(a);
    }
  });

  /* ── Inline minimal styles (mirrors layout.css .lang-nav) ──
     Needed because some game pages may load layout.css too,
     but the fixed positioning must match exactly. */
  nav.style.cssText = [
    'position:fixed',
    'top:var(--sp-4,12px)',
    /* Offset to the left of the mute button (44px wide + 12px gap + 12px right) = 68px */
    'right:68px',
    'display:flex',
    'gap:var(--sp-2,6px)',
    'z-index:600',
  ].join(';');

  document.body.prepend(nav);
})();
