/* ═══════════════════════════════════════════════════════════
   hg-ux.js — shared UX / retention layer for every Hand Games page.

   Loaded (synchronously, via document.write) by analytics.js, so it is
   present on hubs, game screens and online without touching any HTML.
   Everything here is progressive enhancement: each feature looks for
   the DOM it needs and does nothing when it is not there.

   Features
     1. Setup screens (vs-cpu / local / battle / online)
        · `.is-selected` on the chosen `.mode-option` (+ tap feedback) so a
          click always mutates the DOM (Clarity counted CSS-only radio
          changes as "dead clicks")
        · remembers player name + last settings (localStorage) and
          preselects them
        · "Play now" shortcut button at the top of the setup card
        · protects "Play!" against double fire, fills empty names with a
          localized default, emits `play_click` (measures the funnel)
     2. Hub: whole game card is clickable; local stats strip
     3. Chopsticks: tapping a not-yet-usable hand gives feedback
     4. PWA install notice after the first finished match (+ iOS hint)
     5. INP: prime audio on first touch, camera init telemetry

   Depends on (optional): window.HGA, window.GameAudio, window.CameraGesture
   Storage keys: hg_name, hg_prefs_<game>_<mode>, hg_streak_<game> (written
   by streak.js), hg_install_dismissed, hg_ios_hint_shown, hg_pwa_installed
═══════════════════════════════════════════════════════════ */
(() => {
  if (window.HGUX) return;

  const doc = document;
  const ctx = (window.HGA && HGA.ctx) || { game: 'hub', mode: 'hub', lang: 'es' };
  const _l  = (doc.documentElement.lang || ctx.lang || 'es').slice(0, 2).toLowerCase();
  const LANG = (_l === 'en' || _l === 'pt') ? _l : 'es';

  /* ── i18n ── */
  const TXT = {
    es: {
      playNow:   '⚡ Jugar ya',
      or:        'o personaliza tu partida',
      lastCfg:   'Última configuración:',
      quickCfg:  'Configuración rápida:',
      defName:   { 'name-player': 'Jugador', 'name-p1': 'Jugador 1', 'name-p2': 'Jugador 2' },
      statsAria: 'Tus estadísticas',
      games:     n => `${n} ${n === 1 ? 'partida' : 'partidas'}`,
      wins:      n => `${n} ${n === 1 ? 'victoria' : 'victorias'}`,
      streak:    n => `Racha de ${n}`,
      best:      n => `Mejor racha: ${n}`,
      installTitle: 'Instala Hand Games',
      installBody:  'Juega más rápido y sin conexión.',
      install:      'Instalar',
      later:        'Ahora no',
      iosTitle:     'Instala Hand Games',
      iosBody:      ['Toca', 'Compartir', 'y luego «Añadir a pantalla de inicio».'],
    },
    en: {
      playNow:   '⚡ Play now',
      or:        'or customize your game',
      lastCfg:   'Last settings:',
      quickCfg:  'Quick settings:',
      defName:   { 'name-player': 'Player', 'name-p1': 'Player 1', 'name-p2': 'Player 2' },
      statsAria: 'Your stats',
      games:     n => `${n} ${n === 1 ? 'game' : 'games'}`,
      wins:      n => `${n} ${n === 1 ? 'win' : 'wins'}`,
      streak:    n => `${n}-win streak`,
      best:      n => `Best streak: ${n}`,
      installTitle: 'Install Hand Games',
      installBody:  'Play faster, even offline.',
      install:      'Install',
      later:        'Not now',
      iosTitle:     'Install Hand Games',
      iosBody:      ['Tap', 'Share', 'then “Add to Home Screen”.'],
    },
    pt: {
      playNow:   '⚡ Jogar já',
      or:        'ou personalize sua partida',
      lastCfg:   'Última configuração:',
      quickCfg:  'Configuração rápida:',
      defName:   { 'name-player': 'Jogador', 'name-p1': 'Jogador 1', 'name-p2': 'Jogador 2' },
      statsAria: 'Suas estatísticas',
      games:     n => `${n} ${n === 1 ? 'partida' : 'partidas'}`,
      wins:      n => `${n} ${n === 1 ? 'vitória' : 'vitórias'}`,
      streak:    n => `Sequência de ${n}`,
      best:      n => `Melhor sequência: ${n}`,
      installTitle: 'Instale o Hand Games',
      installBody:  'Jogue mais rápido e offline.',
      install:      'Instalar',
      later:        'Agora não',
      iosTitle:     'Instale o Hand Games',
      iosBody:      ['Toque em', 'Compartilhar', 'e depois em “Adicionar à Tela de Início”.'],
    },
  };
  const T = TXT[LANG];

  /* ── helpers ── */
  const $ = id => doc.getElementById(id);
  const ls = {
    get(k)    { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    json(k)   { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } },
  };
  const ss = {
    get(k)    { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
  };
  const track = (name, params) => { try { if (window.HGA) HGA.event(name, params); } catch (_) {} };
  const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const isStandalone = () =>
    !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true);

  /* Run `fn` now if the DOM is parsed, otherwise when it is. */
  function whenReady(fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  /* ═══════════════════════════════════════════════════════════
     1a. `.mode-option` selected state
     The visual state used to live only in CSS (`input:checked + label`):
     the DOM did not change on click, which Clarity reports as a dead
     click on every setup screen. We mirror it with a class, and add a
     short "tapped" class so re-tapping the already-selected option also
     gives visible feedback.
  ═══════════════════════════════════════════════════════════ */
  function syncSelected(root) {
    (root || doc).querySelectorAll('.mode-option').forEach(label => {
      const input = label.querySelector('input[type="radio"]');
      label.classList.toggle('is-selected', !!(input && input.checked));
    });
  }

  doc.addEventListener('change', e => {
    const t = e.target;
    if (!t || !t.matches || !t.matches('.mode-option input[type="radio"]')) return;
    const scope = t.closest('fieldset') || doc;
    syncSelected(scope);
    refreshSummary();
  });

  doc.addEventListener('click', e => {
    const label = e.target.closest && e.target.closest('.mode-option');
    if (!label) return;
    label.classList.add('is-tapped');
    setTimeout(() => label.classList.remove('is-tapped'), 280);
  }, { passive: true });

  /* ═══════════════════════════════════════════════════════════
     1b. Remember name + settings, "Play now", double-fire guard
  ═══════════════════════════════════════════════════════════ */
  const NAME_IDS  = ['name-player', 'name-p1', 'name-p2'];
  const OWN_NAME  = ['name-player', 'name-p1'];   // remembered (p2 is "the friend")
  const PREFS_KEY = `hg_prefs_${ctx.game}_${ctx.mode}`;
  const NAME_KEY  = 'hg_name';
  let hadPrefs = false;

  function isDefaultName(id, v) {
    return Object.values(TXT).some(t => t.defName[id] === v);
  }

  function setupRadios() {
    const setup = $('screen-setup');
    return setup ? Array.from(setup.querySelectorAll('input[type="radio"]')) : [];
  }

  function restoreSettings() {
    /* Name: shared across games. */
    const savedName = ls.get(NAME_KEY);
    OWN_NAME.forEach(id => {
      const el = $(id);
      if (el && !el.value && savedName) el.value = savedName.slice(0, 20);
    });

    /* Radios: per game + screen. Runs synchronously while the page is being
       parsed, i.e. before the user can have touched anything. */
    const prefs = ls.json(PREFS_KEY);
    if (prefs && prefs.radios && typeof prefs.radios === 'object') {
      hadPrefs = true;
      Object.keys(prefs.radios).forEach(name => {
        const input = setupRadios().find(r => r.name === name && r.value === prefs.radios[name]);
        if (input) input.checked = true;
      });
    }
  }

  function saveSettings() {
    const radios = {};
    setupRadios().forEach(r => { if (r.checked) radios[r.name] = r.value; });
    if (Object.keys(radios).length) ls.set(PREFS_KEY, JSON.stringify({ v: 1, radios, t: Date.now() }));
    for (const id of OWN_NAME) {
      const el = $(id);
      const v = el && el.value.trim();
      if (v && !isDefaultName(id, v)) { ls.set(NAME_KEY, v.slice(0, 20)); break; }
    }
  }

  function fillDefaultNames() {
    NAME_IDS.forEach(id => {
      const el = $(id);
      if (el && !el.value.trim()) el.value = T.defName[id];
    });
  }

  /* Human-readable summary of the current setup choice, e.g.
     "Mejor de 3 · Medio". The camera option is only mentioned when picked. */
  function summaryText() {
    const parts = [];
    setupRadios().forEach(r => {
      if (!r.checked) return;
      if (r.name === 'input-mode' && r.value !== 'camera') return;
      const strong = r.closest('.mode-option') && r.closest('.mode-option').querySelector('.mode-text strong');
      if (!strong) return;
      const clone = strong.cloneNode(true);
      clone.querySelectorAll('em').forEach(n => n.remove());
      const txt = clone.textContent.trim();
      if (txt) parts.push(r.name === 'input-mode' ? `📸 ${txt}` : txt);
    });
    return parts.join(' · ');
  }

  let playNowSub = null;
  function refreshSummary() {
    if (!playNowSub) return;
    const sum = summaryText();
    playNowSub.textContent = sum ? `${hadPrefs ? T.lastCfg : T.quickCfg} ${sum}` : '';
  }

  function injectPlayNow(startBtn) {
    if ($('btn-play-now')) return;
    const card = startBtn.closest('.card');
    if (!card) return;

    const wrap = doc.createElement('div');
    wrap.className = 'hg-play-now-wrap';

    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.id = 'btn-play-now';
    btn.className = 'btn btn-primary btn-lg hg-play-now';
    btn.textContent = T.playNow;
    btn.setAttribute('aria-describedby', 'hg-play-now-sub');

    playNowSub = doc.createElement('span');
    playNowSub.id = 'hg-play-now-sub';
    playNowSub.className = 'hg-play-now-sub';

    const or = doc.createElement('span');
    or.className = 'hg-play-now-or';
    or.setAttribute('aria-hidden', 'true');
    or.textContent = T.or;

    wrap.append(btn, playNowSub, or);
    card.insertBefore(wrap, card.firstChild);
    refreshSummary();

    /* Same flow as "Play!": it just clicks it (the double-fire guard and
       the start handler of each game do the rest). */
    btn.addEventListener('click', () => { if (!startBtn.disabled) startBtn.click(); });

    /* Mirror the start button's busy state (camera init, transitions). */
    const mirror = () => {
      const busy = startBtn.disabled || startBtn.classList.contains('btn-loading');
      btn.disabled = busy;
      btn.setAttribute('aria-busy', busy ? 'true' : 'false');
    };
    new MutationObserver(mirror).observe(startBtn, { attributes: true, attributeFilter: ['disabled', 'class'] });
    mirror();
  }

  /* Capture phase on document: runs before any ui-*.js handler. */
  let lastStartAt = 0;
  doc.addEventListener('click', e => {
    const startBtn = e.target.closest && e.target.closest('#btn-start');
    if (startBtn) {
      const now = Date.now();
      if (now - lastStartAt < 800) {        // double click / Enter repeat
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
      lastStartAt = now;
      fillDefaultNames();
      saveSettings();
      const sel = { input_mode: 'click' };   // default for pages without the radio
      setupRadios().forEach(r => { if (r.checked && (r.name === 'difficulty' || r.name === 'input-mode')) sel[r.name === 'difficulty' ? 'difficulty' : 'input_mode'] = r.value; });
      track('play_click', sel);
      return;
    }
    /* Online lobby: remember the name when creating/joining a room. */
    if (e.target.closest && e.target.closest('#btn-create, #btn-join')) saveSettings();
  }, true);

  /* Enter inside a name field starts the game (keyboard.js ignores keys
     typed in inputs); on phones the keyboard's action key reads "Go". */
  doc.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing || e.repeat) return;
    const t = e.target;
    if (!t || !t.id || NAME_IDS.indexOf(t.id) === -1) return;
    const startBtn = $('btn-start');
    if (!startBtn || startBtn.disabled) return;
    e.preventDefault();
    startBtn.click();
  });

  function initSetup() {
    const setup = $('screen-setup');
    if (!setup || setup.dataset.hgUx) return;
    setup.dataset.hgUx = '1';
    restoreSettings();
    syncSelected(setup);
    NAME_IDS.forEach(id => { const el = $(id); if (el) el.setAttribute('enterkeyhint', 'go'); });
    const startBtn = $('btn-start');
    if (startBtn) injectPlayNow(startBtn);
  }

  /* ═══════════════════════════════════════════════════════════
     2. Hub — clickable cards + stats strip
  ═══════════════════════════════════════════════════════════ */
  function initHubCards() {
    /* Main-hub cards are <div>s: the icon, title and blurb looked like
       buttons but did nothing. A click anywhere on the card now follows
       its call-to-action link. */
    doc.querySelectorAll('.game-card').forEach(c => {
      if (c.querySelector('a[href]')) c.classList.add('hg-card-link');
    });
  }

  doc.addEventListener('click', e => {
    const card = e.target.closest && e.target.closest('.game-card');
    if (!card) return;
    if (e.target.closest('a, button, input, select, textarea, summary, label')) return;
    if (e.defaultPrevented) return;
    try { if (String(window.getSelection && getSelection()).length) return; } catch (_) {}
    const a = card.querySelector('a.game-card-cta') || card.querySelector('a[href]');
    if (!a) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) window.open(a.href, '_blank', 'noopener');
    else a.click();
  });

  const STAT_GAMES = ['rps', 'morra', 'chopsticks', 'odd-even', 'rpsls'];

  function readStats(game) {
    const d = ls.json(`hg_streak_${game}`);
    if (!d || typeof d !== 'object') return null;
    const n = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    return { total: n(d.total), wins: n(d.wins), current: n(d.current), best: n(d.best), last: n(d.last) };
  }

  function initStatsStrip() {
    const isHub = doc.body.classList.contains('hub-page') || doc.body.classList.contains('mode-hub');
    if (!isHub || $('hg-stats-strip')) return;
    const games = ctx.game === 'hub' ? STAT_GAMES : [ctx.game];
    const rows = games.map(readStats).filter(Boolean);
    const sum = { total: 0, wins: 0, best: 0, current: 0 };
    let lastTs = -1;
    rows.forEach(r => {
      sum.total += r.total;
      sum.wins  += r.wins;
      sum.best   = Math.max(sum.best, r.best);
      /* "current" = streak of the game played most recently */
      if (r.last > lastTs || (lastTs <= 0 && r.current > sum.current)) { lastTs = r.last; sum.current = r.current; }
    });
    if (sum.total < 1) return;                      // no data → no element, no space

    const chips = [`🎮 ${T.games(sum.total)}`];
    if (sum.wins > 0)    chips.push(`🏆 ${T.wins(sum.wins)}`);
    if (sum.current > 1) chips.push(`🔥 ${T.streak(sum.current)}`);
    else if (sum.best > 2) chips.push(`⭐ ${T.best(sum.best)}`);

    const strip = doc.createElement('div');
    strip.id = 'hg-stats-strip';
    strip.className = 'hg-stats-strip';
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', T.statsAria);
    chips.forEach(txt => {
      const s = doc.createElement('span');
      s.className = 'hg-stats-chip';
      s.textContent = txt;
      strip.appendChild(s);
    });

    const header = doc.querySelector('.hub-header, .mode-header');
    if (header) header.insertAdjacentElement('afterend', strip);
    else if (doc.querySelector('main')) doc.querySelector('main').prepend(strip);
  }

  /* ═══════════════════════════════════════════════════════════
     3. Chopsticks — hands that are not usable yet
     Tapping the opponent's hand before choosing your own (or an
     eliminated hand) did nothing visible. Now the tapped hand shakes and
     your usable hands pulse. Capture phase → the classes are the state
     *before* the game's own click handler runs.
  ═══════════════════════════════════════════════════════════ */
  doc.addEventListener('click', e => {
    const hand = e.target.closest && e.target.closest('.chop-hand');
    if (!hand) return;
    if (hand.classList.contains('selectable') || hand.classList.contains('selected') || hand.classList.contains('targetable')) return;
    hand.classList.add('hg-nudge');
    const hints = doc.querySelectorAll('.chop-hand.selectable');
    hints.forEach(h => h.classList.add('hg-nudge-hint'));
    setTimeout(() => {
      hand.classList.remove('hg-nudge');
      hints.forEach(h => h.classList.remove('hg-nudge-hint'));
    }, 650);
  }, true);

  /* ═══════════════════════════════════════════════════════════
     4. PWA install notice (after a finished match, never on arrival)
  ═══════════════════════════════════════════════════════════ */
  const DISMISS_KEY = 'hg_install_dismissed';
  const DISMISS_MS  = 30 * 24 * 3600 * 1000;
  const IOS_KEY     = 'hg_ios_hint_shown';
  let installBanner = null;

  function isIosSafari() {
    const ua = navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/.test(ua);
  }

  function installAllowed() {
    if (isStandalone() || ls.get('hg_pwa_installed') === '1') return false;
    if (ss.get('hg_install_seen') === '1') return false;                 // once per browser session
    const dismissed = parseInt(ls.get(DISMISS_KEY) || '0', 10);
    if (dismissed && Date.now() - dismissed < DISMISS_MS) return false;
    return true;
  }

  function hideInstall() {
    if (!installBanner) return;
    const b = installBanner;
    installBanner = null;
    b.classList.remove('is-in');
    doc.body.classList.remove('hg-install-open');
    setTimeout(() => b.remove(), reduceMotion() ? 0 : 300);
  }

  function showInstall(kind) {
    if (installBanner) return;
    const box = doc.createElement('aside');
    box.className = 'hg-install';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('aria-label', kind === 'ios' ? T.iosTitle : T.installTitle);

    const icon = doc.createElement('img');
    icon.className = 'hg-install-icon';
    icon.src = '/assets/icon-192.png';
    icon.alt = '';
    icon.width = 40; icon.height = 40;

    const text = doc.createElement('div');
    text.className = 'hg-install-text';
    const strong = doc.createElement('strong');
    strong.textContent = kind === 'ios' ? T.iosTitle : T.installTitle;
    const body = doc.createElement('span');
    if (kind === 'ios') {
      const [a, b, c] = T.iosBody;
      body.append(`${a} `);
      const share = doc.createElement('span');
      share.className = 'hg-install-share';
      share.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      share.append(` ${b}`);
      body.append(share, ` ${c}`);
    } else {
      body.textContent = T.installBody;
    }
    text.append(strong, body);

    box.append(icon, text);

    if (kind === 'native') {
      const cta = doc.createElement('button');
      cta.type = 'button';
      cta.className = 'hg-install-cta';
      cta.textContent = T.install;
      cta.addEventListener('click', async () => {
        const evt = window.__hgInstallEvent;
        if (!evt) { hideInstall(); return; }
        window.__hgInstallEvent = null;              // a prompt event is single-use
        cta.disabled = true;
        try {
          evt.prompt();
          const choice = await evt.userChoice;
          track(choice && choice.outcome === 'accepted' ? 'install_accepted' : 'install_declined');
          if (!choice || choice.outcome !== 'accepted') ls.set(DISMISS_KEY, String(Date.now()));
        } catch (_) {}
        hideInstall();
      });
      box.append(cta);
    }

    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'hg-install-close';
    close.setAttribute('aria-label', T.later);
    close.title = T.later;
    close.textContent = '✕';
    close.addEventListener('click', () => {
      ls.set(DISMISS_KEY, String(Date.now()));
      track('install_dismissed', { kind });
      hideInstall();
    });
    box.append(close);

    /* keyboard.js binds Enter/Space/R globally: keep them local here. */
    box.addEventListener('keydown', e => e.stopPropagation());

    doc.body.append(box);
    installBanner = box;
    doc.body.classList.add('hg-install-open');
    ss.set('hg_install_seen', '1');
    if (kind === 'ios') ls.set(IOS_KEY, '1');
    track('install_prompt_shown', { kind });
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('is-in')));

    /* Leave when the player moves on from the game-over screen. */
    const over = $('screen-gameover');
    if (over) {
      new MutationObserver((_, obs) => {
        if (!over.classList.contains('active')) { obs.disconnect(); hideInstall(); }
      }).observe(over, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function maybeOfferInstall() {
    if (!installAllowed()) return;
    const over = $('screen-gameover');
    if (over && !over.classList.contains('active')) return;              // player already left
    if (window.__hgInstallEvent) showInstall('native');
    else if (isIosSafari() && ls.get(IOS_KEY) !== '1') showInstall('ios');
  }

  /* Called by HGA.gameOver — i.e. only after a finished match. */
  function afterGameOver() {
    /* Let the result settle (confetti, stats) before asking for anything. */
    setTimeout(maybeOfferInstall, 2200);
  }

  /* ═══════════════════════════════════════════════════════════
     5. INP / telemetry
  ═══════════════════════════════════════════════════════════ */
  /* Create the AudioContext on the first touch instead of inside the
     first click handler (it costs tens of ms on phones). */
  doc.addEventListener('pointerdown', () => {
    try { if (window.GameAudio && GameAudio.prime) GameAudio.prime(); } catch (_) {}
  }, { once: true, capture: true, passive: true });

  /* Camera start-up is the slowest user-visible step (model download +
     permission prompt) and the likely cause of "Play! pressed twice, no
     game_start": measure it without touching the games' own code. */
  function wrapCamera() {
    const cg = window.CameraGesture;
    if (!cg || cg.__hgWrapped || typeof cg.init !== 'function') return;
    const orig = cg.init;
    cg.__hgWrapped = true;
    cg.init = function () {
      const t0 = performance.now();
      return Promise.resolve(orig.apply(this, arguments)).then(
        res => { track('camera_init', { ok: 1, ms: Math.round(performance.now() - t0) }); return res; },
        err => {
          track('camera_init', { ok: 0, error: err && err.name, ms: Math.round(performance.now() - t0) });
          /* Don't preselect "camera" next time if it just failed (denied /
             no camera): "Play now" would re-trigger the permission prompt. */
          const prefs = ls.json(PREFS_KEY);
          if (prefs && prefs.radios && prefs.radios['input-mode'] === 'camera') {
            prefs.radios['input-mode'] = 'click';
            ls.set(PREFS_KEY, JSON.stringify(prefs));
          }
          throw err;
        }
      );
    };
  }

  /* Invited visitor: `/rps/online?room=…` (shared from the lobby). */
  let inviteTracked = false;
  function trackInviteLanding() {
    if (inviteTracked) return;
    inviteTracked = true;
    try {
      const p = new URLSearchParams(location.search);
      if (ctx.mode === 'online' && p.get('room')) track('invite_landing');
    } catch (_) {}
  }

  /* ── boot ── */
  function boot() {
    initSetup();
    initHubCards();
    initStatsStrip();
    wrapCamera();
    trackInviteLanding();
  }
  boot();                                   // anchors above this script already exist
  whenReady(boot);                          // idempotent: covers later-parsed DOM (and
                                            // wraps CameraGesture, which loads after us)

  window.HGUX = { afterGameOver, summaryText, version: 1 };
})();
