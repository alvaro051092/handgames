/* ═══════════════════════════════════════════════════════════
   ui-rps-online.js — DOM orchestrator for "RPS vs a friend" (online).
   Depends on: window.GameRPSOnline, window.GameAudio
   Polls the room every ~1.2s; every poll tick and every direct action
   response feed the same render(state) function.
═══════════════════════════════════════════════════════════ */
(() => {
  const $ = id => document.getElementById(id);

  /* ── Language (ES root, /rps/en/online, /rps/pt/online) ──
     Page language comes from <html lang>; shared strings (camera status,
     GO!, pick labels, audio labels) come from HGA.i18n (analytics.js) with
     the same stale-cache fallback the vs-CPU screens use. Sentences that
     only exist on this screen live in T below. */
  const _lang = (document.documentElement.lang || 'es').slice(0, 2).toLowerCase();
  const LANG  = (_lang === 'en' || _lang === 'pt') ? _lang : 'es';
  const _L_FALLBACK = {
    es: {
      audioOff: 'Silenciar audio', audioOn: 'Activar audio',
      camAdjust: 'Mano detectada — ajustá el gesto',
      camDenied: 'Permiso de cámara denegado — seguimos con el modo click.',
      camDetected: l => `Detectando: ${l}`,
      camFailed: 'No se pudo iniciar la cámara — seguimos con el modo click.',
      camHolding: l => `Manteniendo ${l}…`,
      camSearching: 'Detectando mano…', camStarting: 'Activando cámara…',
      defName: 'Jugador', go: '¡YA!', round: n => `Ronda ${n}`,
      pick: { rock: '🪨 Piedra', paper: '📄 Papel', scissors: '✂️ Tijeras' },
      pickName: { rock: 'Piedra', paper: 'Papel', scissors: 'Tijeras' },
    },
    en: {
      audioOff: 'Mute audio', audioOn: 'Turn audio on',
      camAdjust: 'Hand detected — adjust your gesture',
      camDenied: 'Camera permission denied — continuing in click mode.',
      camDetected: l => `Detected: ${l}`,
      camFailed: 'Could not start the camera — continuing in click mode.',
      camHolding: l => `Holding ${l}…`,
      camSearching: 'Looking for your hand…', camStarting: 'Starting camera…',
      defName: 'Player', go: 'GO!', round: n => `Round ${n}`,
      pick: { rock: '🪨 Rock', paper: '📄 Paper', scissors: '✂️ Scissors' },
      pickName: { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' },
    },
    pt: {
      audioOff: 'Silenciar áudio', audioOn: 'Ativar áudio',
      camAdjust: 'Mão detectada — ajuste o gesto',
      camDenied: 'Permissão da câmera negada — seguimos no modo clique.',
      camDetected: l => `Detectado: ${l}`,
      camFailed: 'Não foi possível iniciar a câmera — seguimos no modo clique.',
      camHolding: l => `Segurando ${l}…`,
      camSearching: 'Procurando sua mão…', camStarting: 'Ativando a câmera…',
      defName: 'Jogador', go: 'JÁ!', round: n => `Rodada ${n}`,
      pick: { rock: '🪨 Pedra', paper: '📄 Papel', scissors: '✂️ Tesoura' },
      pickName: { rock: 'Pedra', paper: 'Papel', scissors: 'Tesoura' },
    },
  };
  const L = (window.HGA && HGA.i18n) || _L_FALLBACK[LANG];

  const T = {
    es: {
      draw:       '🤝 ¡Empate!',
      youWon:     '🎉 ¡Ganaste la ronda!',
      rivalWon:   n => `😅 ¡Ganó ${n}!`,
      roomGone:   'La sala expiró o no existe más.',
      createFail: 'No se pudo crear la sala. Probá de nuevo.',
      codeLen:    'El código tiene 5 caracteres.',
      joinFail:   'No encontramos esa sala. Revisá el código.',
      roomFull:   'Esa sala ya está completa: ya hay dos jugadores.',
    },
    en: {
      draw:       '🤝 Draw!',
      youWon:     '🎉 You won the round!',
      rivalWon:   n => `😅 ${n} wins!`,
      roomGone:   'This room has expired or no longer exists.',
      createFail: 'Could not create the room. Please try again.',
      codeLen:    'The room code has 5 characters.',
      joinFail:   'We could not find that room. Check the code.',
      roomFull:   'That room is already full: two players have joined.',
    },
    pt: {
      draw:       '🤝 Empate!',
      youWon:     '🎉 Você venceu a rodada!',
      rivalWon:   n => `😅 ${n} venceu!`,
      roomGone:   'A sala expirou ou não existe mais.',
      createFail: 'Não foi possível criar a sala. Tente de novo.',
      codeLen:    'O código tem 5 caracteres.',
      joinFail:   'Não encontramos essa sala. Confira o código.',
      roomFull:   'Essa sala já está cheia: já há dois jogadores.',
    },
  }[LANG];

  let code            = null;
  let playerId        = null; // 'p1' | 'p2'
  let pollTimer        = null;
  let pollInFlight      = false;
  let renderedPickRound   = 0;
  let renderedResultRound = 0;
  let inputMode = 'click'; // 'click' | 'camera'
  let lastSnapshot = null;
  let rivalJoinedTracked = false;
  let camStarting = false;   // a CameraGesture.init() is in flight

  // Camera "hold to confirm": arm on the first detected gesture, lock it
  // in after HOLD_MS as long as it stays steady (same pattern as vs-CPU).
  const HOLD_MS = 3000;
  const GRACE_MS = 350;
  let camUiRaf = null;
  let armGesture = null;
  let armStartTime = null;
  let lastGoodTime = null;
  let capturing = false;
  let pickLocked = false; // my pick for this round is already on the server (camera must not re-arm)

  const PICK_META = {
    rock:     { emoji: '🪨', label: L.pickName.rock },
    paper:    { emoji: '📄', label: L.pickName.paper },
    scissors: { emoji: '✂️', label: L.pickName.scissors },
  };

  function screens() {
    return {
      setup:  $('screen-setup'),
      lobby:  $('screen-lobby'),
      pick:   $('screen-pick'),
      result: $('screen-result'),
    };
  }

  function goTo(id) {
    const s = screens();
    if (s[id].classList.contains('active')) return;
    Object.values(s).forEach(el => el.classList.remove('active'));
    s[id].classList.add('active');
  }

  function activeScreenId() {
    return document.querySelector('.screen.active')?.id;
  }

  /* ── Camera lifecycle ──
     The stream is only ON while the pick screen is waiting for MY gesture.
     It is switched OFF (tracks stopped, so the browser's camera indicator
     goes out) in the lobby, once my pick is in, on the result screen, when
     the room disappears, on any create/join error and when the page is left. */
  function stopCamera() {
    if (camUiRaf) cancelAnimationFrame(camUiRaf);
    camUiRaf = null;
    capturing = false;
    resetCamArm();
    try { CameraGesture.stop(); } catch (_) {}
  }

  /* (Re)starts the stream for the pick screen. Permission was already granted
     at create/join, so this does not prompt again; the model is cached. */
  async function ensureCamera() {
    if (inputMode !== 'camera' || pickLocked || camStarting || CameraGesture.isReady()) return;
    camStarting = true;
    try {
      await CameraGesture.init($('cam-video'), $('cam-overlay'));
    } catch (err) {
      console.error(err);
      /* Camera lost (unplugged, revoked): carry on with the buttons. */
      inputMode = 'click';
      stopCamera();
      $('pick-card-click').style.display  = '';
      $('pick-card-camera').style.display = 'none';
      updatePickWaitUI(pickLocked);
    } finally {
      camStarting = false;
    }
    /* The screen moved on while the camera was starting: switch it back off. */
    if (activeScreenId() !== 'screen-pick' || pickLocked) stopCamera();
  }

  /* Back to a clean slate: room gone, new room, new join. Without this a
     stale renderedPickRound made the next room skip populatePick() and left
     the pick buttons disabled/selected. */
  function resetSession() {
    stopPolling();
    stopCamera();
    code = null; playerId = null;
    renderedPickRound = 0; renderedResultRound = 0;
    pickLocked = false; rivalJoinedTracked = false;
    lastSnapshot = null;
    pollInFlight = false;
  }

  function setScoreDigit(el, value) {
    el.innerHTML = `<span class="score-digit">${value}</span>`;
  }

  /* ── Rendering ── */

  function updateScoreboards(state, rivalKey) {
    const me = state[playerId], rival = state[rivalKey];
    $('sb-name-me').textContent    = me.name;
    $('sb-name-rival').textContent = rival.name;
    setScoreDigit($('roll-me'),    state.scores[playerId]);
    setScoreDigit($('roll-rival'), state.scores[rivalKey]);
    $('pick-round-badge').textContent = L.round(state.round);

    $('res-name-me').textContent    = me.name;
    $('res-name-rival').textContent = rival.name;
    setScoreDigit($('res-roll-me'),    state.scores[playerId]);
    setScoreDigit($('res-roll-rival'), state.scores[rivalKey]);
    $('res-round-badge').textContent = L.round(state.round);
  }

  function populatePick() {
    $('pick-buttons').querySelectorAll('.btn-pick').forEach(b => {
      b.disabled = false;
      b.classList.remove('selected');
    });
    pickLocked = false;
    $('pick-card-click').style.display  = inputMode === 'click'  ? '' : 'none';
    $('pick-card-camera').style.display = inputMode === 'camera' ? '' : 'none';
    if (inputMode === 'camera') {
      resetCamArm();
      $('cam-countdown').textContent = '';
      $('cam-status').textContent = L.camSearching;
      startCamUiLoop();
    }
  }

  function updatePickWaitUI(alreadyPicked) {
    pickLocked = !!alreadyPicked;
    $('pick-buttons').style.display     = (inputMode === 'click'  && !alreadyPicked) ? '' : 'none';
    $('pick-wait').style.display        = (inputMode === 'click'  &&  alreadyPicked) ? 'flex' : 'none';
    $('cam-stage').style.display        = (inputMode === 'camera' && !alreadyPicked) ? '' : 'none';
    $('cam-status').style.display       = (inputMode === 'camera' && !alreadyPicked) ? '' : 'none';
    $('pick-wait-camera').style.display = (inputMode === 'camera' &&  alreadyPicked) ? 'flex' : 'none';
  }

  /* ── Camera mode: hold-to-confirm loop (mirrors vs-CPU's) ── */
  function resetCamArm() {
    armGesture = null;
    armStartTime = null;
    lastGoodTime = null;
  }

  function startCamUiLoop() {
    if (camUiRaf) cancelAnimationFrame(camUiRaf);
    resetCamArm();
    capturing = false;

    function tick() {
      if (inputMode !== 'camera' || activeScreenId() !== 'screen-pick' || capturing || pickLocked || !CameraGesture.isReady()) {
        camUiRaf = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const gesture = CameraGesture.classifyCurrent();
      const oval = $('cam-oval');

      if (gesture) {
        oval.classList.add('detected');
        if (gesture !== armGesture) { armGesture = gesture; armStartTime = now; }
        lastGoodTime = now;
      } else {
        oval.classList.remove('detected');
        if (armGesture && now - lastGoodTime > GRACE_MS) resetCamArm();
      }

      if (armGesture) {
        const elapsed = now - armStartTime;
        if (elapsed >= HOLD_MS) {
          $('cam-countdown').textContent = L.go;
          $('cam-status').textContent = L.camDetected(L.pick[armGesture]);
          capturing = true;
          finalizeCameraPick(armGesture);
        } else {
          $('cam-countdown').textContent = String(Math.ceil((HOLD_MS - elapsed) / 1000));
          $('cam-status').textContent = L.camHolding(PICK_META[armGesture].label);
        }
      } else {
        $('cam-countdown').textContent = '';
        $('cam-status').textContent = CameraGesture.hasDetection()
          ? L.camAdjust
          : L.camSearching;
      }

      camUiRaf = requestAnimationFrame(tick);
    }
    tick();
  }

  async function finalizeCameraPick(pick) {
    lastSnapshot = CameraGesture.snapshotSquare();
    resetCamArm();
    try {
      const state = await GameRPSOnline.submitPick(code, playerId, pick);
      HGA.pickMade({ pick, round: state.round, input_mode: 'camera' });
      render(state);
    } catch (_) {
      // transient network hiccup — capturing reset below lets the loop re-arm
    }
    capturing = false;
  }

  function populateResult(state, rivalKey) {
    const myPick    = state[playerId].pick;
    const rivalPick = state[rivalKey].pick;
    const myMeta    = PICK_META[myPick];
    const rivalMeta = PICK_META[rivalPick];

    $('res-me-emoji').textContent    = myMeta.emoji;
    $('res-me-label').textContent    = myMeta.label;
    $('res-rival-emoji').textContent = rivalMeta.emoji;
    $('res-rival-label').textContent = rivalMeta.label;

    const snapImg = $('res-me-snap');
    if (inputMode === 'camera' && lastSnapshot) {
      snapImg.src = lastSnapshot;
      snapImg.style.display = '';
      $('res-me-emoji').style.display = 'none';
    } else {
      snapImg.style.display = 'none';
      $('res-me-emoji').style.display = '';
    }

    $('res-me-block').classList.remove('loser');
    $('res-rival-block').classList.remove('loser');

    const banner = $('result-banner');
    banner.className = 'result-banner show';
    if (state.roundWinner === 'draw') {
      banner.textContent = T.draw;
      banner.classList.add('banner-draw');
      GameAudio.playDraw();
    } else if (state.roundWinner === playerId) {
      banner.textContent = T.youWon;
      banner.classList.add('banner-win');
      $('res-rival-block').classList.add('loser');
      GameAudio.playWin();
    } else {
      banner.textContent = T.rivalWon(state[rivalKey].name);
      banner.classList.add('banner-loss');
      $('res-me-block').classList.add('loser');
      GameAudio.playDraw();
    }
    HGA.roundResult(state.roundWinner === playerId ? 'player' : (state.roundWinner === 'draw' ? 'draw' : 'cpu'), {
      pick_me: myPick, pick_rival: rivalPick, round: state.round,
    });
  }

  function render(state) {
    const rivalKey = playerId === 'p1' ? 'p2' : 'p1';
    const rivalObj = state[rivalKey];

    if (!rivalObj) {
      $('lobby-code').textContent = code;
      stopCamera();                       // nothing to show to the camera while waiting
      goTo('lobby');
      return;
    }

    /* The creator's lobby turned into a match: the invite worked. */
    if (!rivalJoinedTracked && playerId === 'p1') {
      rivalJoinedTracked = true;
      HGA.event('rps_online_rival_joined');
    }

    updateScoreboards(state, rivalKey);

    if (state.roundWinner) {
      stopCamera();
      goTo('result');
      if (renderedResultRound !== state.round) {
        renderedResultRound = state.round;
        populateResult(state, rivalKey);
      }
    } else {
      if (renderedPickRound !== state.round) {
        renderedPickRound = state.round;
        populatePick();
      }
      updatePickWaitUI(!!state[playerId].pick);
      goTo('pick');
      if (state[playerId].pick) stopCamera();        // my pick is in: camera off while waiting
      else if (inputMode === 'camera') {
        if (!camUiRaf) startCamUiLoop();
        ensureCamera();
      }
    }
  }

  /* ── Polling ── */

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      if (pollInFlight || !code) return;
      pollInFlight = true;
      try {
        const state = await GameRPSOnline.getState(code);
        render(state);
      } catch (err) {
        if (String(err.message).includes('not found')) {
          resetSession();
          $('setup-err').textContent = T.roomGone;
          goTo('setup');
        }
      } finally {
        pollInFlight = false;
      }
    }, 1200);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  /* ── Setup screen ── */

  function getName() {
    return $('name-player').value.trim() || L.defName;
  }

  /* Asked AFTER the room was created/joined successfully, so a failed or
     mistyped code never triggers a permission prompt. */
  async function initCameraIfWanted() {
    const camStatus = $('setup-cam-status');
    camStatus.classList.remove('err');
    camStatus.textContent = '';
    const wantsCamera = document.querySelector('input[name="input-mode"]:checked')?.value === 'camera';
    if (!wantsCamera) { inputMode = 'click'; return; }

    camStatus.textContent = L.camStarting;
    try {
      await CameraGesture.init($('cam-video'), $('cam-overlay'));
      inputMode = 'camera';
    } catch (err) {
      console.error(err);
      camStatus.classList.add('err');
      camStatus.textContent = err.name === 'NotAllowedError'
        ? L.camDenied
        : L.camFailed;
      inputMode = 'click';
      await new Promise(r => setTimeout(r, 1400));
    }
  }

  $('btn-create').addEventListener('click', async () => {
    const btn = $('btn-create');
    $('setup-err').textContent = '';
    btn.disabled = true;
    resetSession();
    try {
      const { code: newCode, playerId: pid, state } = await GameRPSOnline.createRoom(getName());
      code = newCode; playerId = pid;
      HGA.event('rps_online_room_created');
      await initCameraIfWanted();
      if (code !== newCode) { btn.disabled = false; return; }   // room vanished while the permission prompt was open
      HGA.gameStart('online');               // after the camera attempt so input_mode is accurate
      render(state);
      startPolling();
    } catch (err) {
      stopCamera();
      $('setup-err').textContent = T.createFail;
    }
    btn.disabled = false;
  });

  $('btn-show-join').addEventListener('click', () => {
    $('join-row').classList.add('show');
    $('input-code').focus();
  });

  $('btn-join').addEventListener('click', async () => {
    const btn = $('btn-join');
    const inputCode = $('input-code').value.trim().toUpperCase();
    $('setup-err').textContent = '';
    if (inputCode.length !== 5) {
      $('setup-err').textContent = T.codeLen;
      return;
    }
    btn.disabled = true;
    resetSession();
    try {
      const { playerId: pid, state } = await GameRPSOnline.joinRoom(inputCode, getName());
      code = inputCode; playerId = pid;
      HGA.event('rps_online_room_joined');
      await initCameraIfWanted();
      if (code !== inputCode) { btn.disabled = false; return; }
      HGA.gameStart('online');
      render(state);
      startPolling();
    } catch (err) {
      stopCamera();
      $('setup-err').textContent = String(err && err.message).includes('room full') ? T.roomFull : T.joinFail;
    }
    btn.disabled = false;
  });

  $('input-code').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().slice(0, 5);
  });
  $('input-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btn-join').click();
  });

  /* Prefill code from a shared link: /rps/online?room=ABCDE (or /rps/en/online, /rps/pt/online) */
  (function prefillFromUrl() {
    const room = new URLSearchParams(location.search).get('room');
    if (room) {
      $('input-code').value = room.toUpperCase().slice(0, 5);
      $('join-row').classList.add('show');
    }
  })();

  /* ── Lobby: invite a friend (Web Share, clipboard fallback) ── */

  const INVITE_T = {
    es: {
      btn:    '📨 Invitar a un amigo',
      title:  'Piedra, Papel o Tijera con un amigo',
      text:   c => `¡Juega Piedra, Papel o Tijera conmigo! Entra a la sala ${c}:`,
      copied: '✅ ¡Enlace copiado! Pégalo en tu chat',
      manual: 'Copia este enlace y envíaselo a tu amigo:',
    },
    en: {
      btn:    '📨 Invite a friend',
      title:  'Rock Paper Scissors with a friend',
      text:   c => `Play Rock Paper Scissors with me! Join room ${c}:`,
      copied: '✅ Link copied! Paste it in your chat',
      manual: 'Copy this link and send it to your friend:',
    },
    pt: {
      btn:    '📨 Convidar um amigo',
      title:  'Pedra, Papel e Tesoura com um amigo',
      text:   c => `Jogue Pedra, Papel e Tesoura comigo! Entre na sala ${c}:`,
      copied: '✅ Link copiado! Cole no seu chat',
      manual: 'Copie este link e envie ao seu amigo:',
    },
  };
  const IT = INVITE_T[LANG];

  /* Deep link understood by prefillFromUrl(). The invite keeps the language
     of whoever sends it: /rps/online (ES), /rps/en/online, /rps/pt/online.
     utm_* lets GA4 attribute the visits an invite brings. */
  const ONLINE_PATH = { es: '/rps/online', en: '/rps/en/online', pt: '/rps/pt/online' }[LANG];
  function inviteUrl() {
    return `${location.origin}${ONLINE_PATH}?room=${encodeURIComponent(code)}&utm_source=invite&utm_medium=share&utm_campaign=rps_online`;
  }

  let inviting = false;
  const inviteBtn = $('btn-copy-link');
  inviteBtn.textContent = IT.btn;
  inviteBtn.setAttribute('aria-live', 'polite');

  inviteBtn.addEventListener('click', async () => {
    if (inviting || !code) return;      // navigator.share() rejects when called twice
    inviting = true;
    const url = inviteUrl();
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: IT.title, text: IT.text(code), url });
          HGA.event('invite_sent', { method: 'share' });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;   // user closed the share sheet
          /* any other failure: fall through to clipboard */
        }
      }
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = url; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
        document.body.appendChild(ta); ta.select();
        try { copied = document.execCommand('copy'); } catch (_) {}
        ta.remove();
      }
      if (copied) {
        HGA.event('invite_sent', { method: 'copy' });
        inviteBtn.textContent = IT.copied;
        setTimeout(() => { inviteBtn.textContent = IT.btn; }, 2400);
      } else {
        /* Clipboard blocked (permissions / insecure context): last resort so
           the player can still copy the link by hand. */
        window.prompt(IT.manual, url);
        HGA.event('invite_manual_shown');   // prompt() cannot tell us whether the link was really copied
      }
    } finally {
      inviting = false;
    }
  });

  /* ── Pick screen ── */

  $('pick-buttons').addEventListener('pointerdown', () => GameAudio.prime(), { passive: true });
  $('pick-buttons').addEventListener('click', async e => {
    const btn = e.target.closest('.btn-pick');
    if (!btn || btn.disabled) return;
    const pick = btn.dataset.pick;
    $('pick-buttons').querySelectorAll('.btn-pick').forEach(b => b.disabled = true);
    btn.classList.add('selected');
    GameAudio.playTick();
    try {
      const state = await GameRPSOnline.submitPick(code, playerId, pick);
      HGA.pickMade({ pick, round: state.round, input_mode: 'online' });
      render(state);
    } catch (_) {
      $('pick-buttons').querySelectorAll('.btn-pick').forEach(b => b.disabled = false);
    }
  });

  /* ── Result screen ── */

  $('btn-next-round').addEventListener('click', async () => {
    const btn = $('btn-next-round');
    btn.disabled = true;
    try {
      const state = await GameRPSOnline.nextRound(code, renderedResultRound);
      render(state);
    } catch (_) {}
    btn.disabled = false;
  });

  $('btn-mute').addEventListener('click', () => {
    const muted = GameAudio.toggle();
    HGA.audioToggle(muted);
    $('btn-mute').textContent = muted ? '🔇' : '🔊';
    $('btn-mute').setAttribute('aria-label', muted ? L.audioOn : L.audioOff);
    $('btn-mute').title = muted ? L.audioOn : L.audioOff;
  });

  /* Leaving the page (or bfcache / tab discard): stop polling and release the camera. */
  function onLeave() { stopPolling(); stopCamera(); }
  window.addEventListener('beforeunload', onLeave);
  window.addEventListener('pagehide', onLeave);
})();
