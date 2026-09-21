/* ═══════════════════════════════════════════════════════════
   ui-rps-online.js — DOM orchestrator for "RPS vs a friend" (online).
   Depends on: window.GameRPSOnline, window.GameAudio
   Polls the room every ~1.2s; every poll tick and every direct action
   response feed the same render(state) function.
═══════════════════════════════════════════════════════════ */
(() => {
  const $ = id => document.getElementById(id);

  let code            = null;
  let playerId        = null; // 'p1' | 'p2'
  let pollTimer        = null;
  let pollInFlight      = false;
  let renderedPickRound   = 0;
  let renderedResultRound = 0;
  let inputMode = 'click'; // 'click' | 'camera'
  let lastSnapshot = null;

  // Camera "hold to confirm": arm on the first detected gesture, lock it
  // in after HOLD_MS as long as it stays steady (same pattern as vs-CPU).
  const HOLD_MS = 3000;
  const GRACE_MS = 350;
  let camUiRaf = null;
  let armGesture = null;
  let armStartTime = null;
  let lastGoodTime = null;
  let capturing = false;

  const PICK_META = {
    rock:     { emoji: '🪨', label: 'Piedra' },
    paper:    { emoji: '📄', label: 'Papel' },
    scissors: { emoji: '✂️', label: 'Tijeras' },
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
    $('pick-round-badge').textContent = `Ronda ${state.round}`;

    $('res-name-me').textContent    = me.name;
    $('res-name-rival').textContent = rival.name;
    setScoreDigit($('res-roll-me'),    state.scores[playerId]);
    setScoreDigit($('res-roll-rival'), state.scores[rivalKey]);
    $('res-round-badge').textContent = `Ronda ${state.round}`;
  }

  function populatePick() {
    $('pick-buttons').querySelectorAll('.btn-pick').forEach(b => {
      b.disabled = false;
      b.classList.remove('selected');
    });
    $('pick-card-click').style.display  = inputMode === 'click'  ? '' : 'none';
    $('pick-card-camera').style.display = inputMode === 'camera' ? '' : 'none';
    if (inputMode === 'camera') {
      resetCamArm();
      $('cam-countdown').textContent = '';
      startCamUiLoop();
    }
  }

  function updatePickWaitUI(alreadyPicked) {
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
      if (inputMode !== 'camera' || activeScreenId() !== 'screen-pick' || capturing || !CameraGesture.isReady()) {
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
          $('cam-countdown').textContent = '¡YA!';
          $('cam-status').textContent = `Detectando: ${PICK_META[armGesture].emoji} ${PICK_META[armGesture].label}`;
          capturing = true;
          finalizeCameraPick(armGesture);
        } else {
          $('cam-countdown').textContent = String(Math.ceil((HOLD_MS - elapsed) / 1000));
          $('cam-status').textContent = `Manteniendo ${PICK_META[armGesture].label}…`;
        }
      } else {
        $('cam-countdown').textContent = '';
        $('cam-status').textContent = CameraGesture.hasDetection()
          ? 'Mano detectada — ajustá el gesto'
          : 'Detectando mano…';
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
      banner.textContent = '🤝 ¡Empate!';
      banner.classList.add('banner-draw');
      GameAudio.playDraw();
    } else if (state.roundWinner === playerId) {
      banner.textContent = '🎉 ¡Ganaste la ronda!';
      banner.classList.add('banner-win');
      $('res-rival-block').classList.add('loser');
      GameAudio.playWin();
    } else {
      banner.textContent = `😅 ¡Ganó ${state[rivalKey].name}!`;
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
      goTo('lobby');
      return;
    }

    updateScoreboards(state, rivalKey);

    if (state.roundWinner) {
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
          stopPolling();
          $('setup-err').textContent = 'La sala expiró o no existe más.';
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
    return $('name-player').value.trim() || 'Jugador';
  }

  async function initCameraIfWanted() {
    const camStatus = $('setup-cam-status');
    camStatus.classList.remove('err');
    camStatus.textContent = '';
    const wantsCamera = document.querySelector('input[name="input-mode"]:checked')?.value === 'camera';
    if (!wantsCamera) { inputMode = 'click'; return; }

    camStatus.textContent = 'Activando cámara…';
    try {
      await CameraGesture.init($('cam-video'), $('cam-overlay'));
      inputMode = 'camera';
    } catch (err) {
      console.error(err);
      camStatus.classList.add('err');
      camStatus.textContent = err.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado — seguimos con el modo click.'
        : 'No se pudo iniciar la cámara — seguimos con el modo click.';
      inputMode = 'click';
      await new Promise(r => setTimeout(r, 1400));
    }
  }

  $('btn-create').addEventListener('click', async () => {
    const btn = $('btn-create');
    $('setup-err').textContent = '';
    btn.disabled = true;
    await initCameraIfWanted();
    try {
      const { code: newCode, playerId: pid, state } = await GameRPSOnline.createRoom(getName());
      code = newCode; playerId = pid;
      HGA.gameStart('online');
      HGA.event('rps_online_room_created');
      render(state);
      startPolling();
    } catch (err) {
      $('setup-err').textContent = 'No se pudo crear la sala. Probá de nuevo.';
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
      $('setup-err').textContent = 'El código tiene 5 caracteres.';
      return;
    }
    btn.disabled = true;
    await initCameraIfWanted();
    try {
      const { playerId: pid, state } = await GameRPSOnline.joinRoom(inputCode, getName());
      code = inputCode; playerId = pid;
      HGA.gameStart('online');
      HGA.event('rps_online_room_joined');
      render(state);
      startPolling();
    } catch (err) {
      $('setup-err').textContent = 'No encontramos esa sala. Revisá el código.';
    }
    btn.disabled = false;
  });

  $('input-code').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().slice(0, 5);
  });
  $('input-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btn-join').click();
  });

  /* Prefill code from a shared link: /rps/online?room=ABCDE */
  (function prefillFromUrl() {
    const room = new URLSearchParams(location.search).get('room');
    if (room) {
      $('input-code').value = room.toUpperCase().slice(0, 5);
      $('join-row').classList.add('show');
    }
  })();

  /* ── Lobby: copy/share invite link ── */

  $('btn-copy-link').addEventListener('click', async () => {
    const url = `${location.origin}/rps/online?room=${code}`;
    const shareData = { title: 'Hand Games', text: `Jugá Piedra Papel Tijeras conmigo — sala ${code}`, url };
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch (_) { /* cancelled, fall through */ }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      ta.remove();
    }
    const btn = $('btn-copy-link');
    const original = btn.textContent;
    btn.textContent = '✅ ¡Copiado!';
    setTimeout(() => { btn.textContent = original; }, 1800);
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
    $('btn-mute').setAttribute('aria-label', muted ? 'Activar audio' : 'Silenciar audio');
    $('btn-mute').title = muted ? 'Activar audio' : 'Silenciar audio';
  });

  window.addEventListener('beforeunload', stopPolling);
})();
