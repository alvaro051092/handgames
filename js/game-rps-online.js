/* ═══════════════════════════════════════════════════════════
   game-rps-online.js — network client for "RPS vs a friend" rooms.
   Talks to /api/rps-room/* (Cloudflare Worker + KV). No DOM access.
   Exposes window.GameRPSOnline.
═══════════════════════════════════════════════════════════ */
window.GameRPSOnline = (() => {
  const BASE = '/api/rps-room';
  /* Random id for this page load. /join sends it so the server can tell a
     retry from the same player (idempotent) from a third person trying to
     take the second seat of an already full room. */
  const clientId = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);

  async function request(path, options) {
    const res = await fetch(BASE + path, options);
    let body = null;
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    return body;
  }

  async function createRoom(name) {
    const { code, playerId, state } = await request('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return { code, playerId, state };
  }

  async function joinRoom(code, name) {
    const { playerId, state } = await request(`/${code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, clientId }),
    });
    return { playerId, state };
  }

  async function getState(code) {
    const { state } = await request(`/${code}`);
    return state;
  }

  async function submitPick(code, playerId, pick) {
    const { state } = await request(`/${code}/pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, pick }),
    });
    return state;
  }

  async function nextRound(code, round) {
    const { state } = await request(`/${code}/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ round }),
    });
    return state;
  }

  return { createRoom, joinRoom, getState, submitPick, nextRound };
})();
