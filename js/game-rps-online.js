/* ═══════════════════════════════════════════════════════════
   game-rps-online.js — network client for "RPS vs a friend" rooms.
   Talks to /api/rps-room/* (Cloudflare Worker + KV). No DOM access.
   Exposes window.GameRPSOnline.
═══════════════════════════════════════════════════════════ */
window.GameRPSOnline = (() => {
  const BASE = '/api/rps-room';
  /* Random id for this browser tab. It is what the server uses to recognise a
     seat: /join sends it so a retry or a reload of the same player gets the same
     seat back (idempotent) while a third person gets 409 "room full"; GET sends
     it as a header so the server may return the player's OWN pick (rival picks
     stay hidden until the round is resolved). Kept in sessionStorage so a
     reload keeps it; per tab, so two tabs are two players.
     Protocol v2: the id is also the player's credential. create/join announce
     `v: 2` and /pick and /next must carry the same `clientId` (the server answers
     403 to anyone else, even with the right room code). A server that predates v2
     ignores the extra fields, so this client keeps working against it. */
  const CID_KEY = 'hg_rps_cid';
  const genId = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const clientId = (() => {
    try {
      let v = sessionStorage.getItem(CID_KEY);
      if (!v) { v = genId(); sessionStorage.setItem(CID_KEY, v); }
      return v;
    } catch (_) { return genId(); }     // storage blocked: still unique for this page load
  })();

  const PROTOCOL = 2;

  async function request(path, options) {
    const res = await fetch(BASE + path, options);
    let body = null;
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error(body?.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  const post = (path, payload) => request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  async function createRoom(name) {
    const { code, playerId, state } = await post('', { name, clientId, v: PROTOCOL });
    return { code, playerId, state };
  }

  async function joinRoom(code, name) {
    const { playerId, state } = await post(`/${code}/join`, { name, clientId, v: PROTOCOL });
    return { playerId, state };
  }

  async function getState(code) {
    const { state } = await request(`/${code}`, { headers: { 'X-HG-Client': clientId } });
    return state;
  }

  /* `round` is the round this pick is for: if the room has moved on (a delayed
     request), the server refuses it instead of applying it to the next round. */
  async function submitPick(code, playerId, pick, round) {
    const { state } = await post(`/${code}/pick`, { playerId, pick, round, clientId });
    return state;
  }

  async function nextRound(code, round) {
    const { state } = await post(`/${code}/next`, { round, clientId });
    return state;
  }

  return { createRoom, joinRoom, getState, submitPick, nextRound };
})();
