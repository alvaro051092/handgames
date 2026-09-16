/* ═══════════════════════════════════════════════════════════════
   hub-toggle.js — "Con cámara" / "Sin cámara" switch on game hub pages.
   Toggles which set of format cards (#formats-camera / #formats-click)
   is shown. No-ops if the page doesn't have these elements.
═══════════════════════════════════════════════════════════ */
(() => {
  const btnCam    = document.getElementById('toggle-camera');
  const btnClick  = document.getElementById('toggle-click');
  const panelCam  = document.getElementById('formats-camera');
  const panelClick = document.getElementById('formats-click');
  if (!btnCam || !btnClick || !panelCam || !panelClick) return;

  function show(mode) {
    const isCam = mode === 'camera';
    panelCam.style.display   = isCam ? '' : 'none';
    panelClick.style.display = isCam ? 'none' : '';
    btnCam.classList.toggle('active', isCam);
    btnClick.classList.toggle('active', !isCam);
    btnCam.setAttribute('aria-selected', String(isCam));
    btnClick.setAttribute('aria-selected', String(!isCam));
  }

  btnCam.addEventListener('click', () => show('camera'));
  btnClick.addEventListener('click', () => show('click'));
})();
