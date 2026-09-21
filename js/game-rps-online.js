/* ═══════════════════════════════════════════════════════════
   game-rps-online.js — network client for "RPS vs a friend" rooms.
   Talks to /api/rps-room/* (Cloudflare Worker + KV). No DOM access.
   Exposes window.GameRPSOnline.
═══════════════════════════════════════════════════════════ */
window.GameRPSOnline = (() => {
  const BASE = '/api/rps-room';
  const LS_KEY = 'hg_rps_online_seat';

  async function request(path, options) {
    const res = await fetch(BASE + path, options);
    let body = null;
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    return body;
  }

  function saveSeat(code, playerId, name) {
    try { sessionStorage.setItem(LS_KEY, JSON.stringify({ code, playerId, name })); } catch (_) {}
  }
  function loadSeat() {
    try { return JSON.parse(sessionStorage.getItem(LS_KEY) || 'null'); } catch (_) { return null; }
  }
  function clearSeat() {
    try { sessionStorage.removeItem(LS_KEY); } catch (_) {}
  }

  async function createRoom(name) {
    const { code, playerId, state } = await request('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    saveSeat(code, playerId, name);
    return { code, playerId, state };
  }

  async function joinRoom(code, name) {
    const { playerId, state } = await request(`/${code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    saveSeat(code, playerId, name);
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

  return { createRoom, joinRoom, getState, submitPick, nextRound, saveSeat, loadSeat, clearSeat };
})();
