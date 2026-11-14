// api.js — the small, secure web API behind the Telegram Mini App.
// No extra packages. Every request must carry Telegram's signed login data (initData), so nobody can read
// or change anybody else's account. Only started when MINIAPP_ORIGIN is set in .env.
import http from 'node:http';
import crypto from 'node:crypto';

// Telegram signs initData with a key derived from the bot token. https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData, botToken, maxAgeSec = 86400, now = Date.now()) {
  const params = new URLSearchParams(String(initData || '')), hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(String(botToken)).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest();
  if (!crypto.timingSafeEqual(calc, Buffer.from(hash, 'hex'))) return null;
  const age = now / 1000 - Number(params.get('auth_date') || 0);
  if (!(age >= -300 && age <= maxAgeSec)) return null;                  // too old (or from the future)
  try { const u = JSON.parse(params.get('user') || '{}'); return u && u.id ? u : null; } catch { return null; }
}

export function startApi({ port = 3000, origins = [], token, W, canSee, isAdm, build = '' }) {
  const allow = new Set(origins), hits = new Map();
  const limited = (key, max) => { const t = Date.now(), w = (hits.get(key) || []).filter(x => t - x < 60000); w.push(t); hits.set(key, w); return w.length > max; };
  setInterval(() => { const t = Date.now(); for (const [k, w] of hits) if (!w.some(x => t - x < 60000)) hits.delete(k); }, 120000).unref();
  const send = (res, code, body, cors) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors }); res.end(JSON.stringify(body)); };
  const readBody = req => new Promise((ok, bad) => {
    let n = 0, b = '';
    req.on('data', c => { n += c.length; if (n > 20000) { bad(Object.assign(new Error('That request is too large.'), { code: 413 })); req.destroy(); } else b += c; });
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { bad(Object.assign(new Error('Invalid request.'), { code: 400 })); } });
    req.on('error', bad);
  });
  const E = (code, message) => Object.assign(new Error(message), { code });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const need = (uid, label) => { if (!canSee(uid, label)) throw E(403, 'That part is not switched on for your account.'); };
  const targetInfo = t => ({ kind: t?.kind, count: t?.kind === 'numbers' ? (t.numbers || []).length : (t?.ids || []).length, name: t?.name });

  const routes = {
    'GET /api/me': uid => {
      const p = W.prof(uid), C = Object.values(W.load(uid, 'contacts', {})), me = W.waMe(uid), now = Date.now();
      return {
        id: uid, name: p.name || '', role: W.isOwner(uid) ? 'owner' : isAdm(uid) ? 'admin' : 'user', build,
        wa: { linked: W.linked(uid), up: W.isUp(uid), number: me?.number || '', name: me?.name || '' },
        plan: { name: p.plan || '', expires: p.expires || null, expired: W.expired(p), paused: !!p.paused, daysLeft: p.expires ? Math.ceil((p.expires - now) / 864e5) : null },
        usage: { today: p.sent?.n || 0, limit: p.limit, total: p.total || 0 },
        counts: {
          contacts: C.filter(x => !x.out).length, groups: Object.keys(W.load(uid, 'groups', {})).length,
          scheduledPosts: W.load(uid, 'posts', []).filter(x => x.status === 'scheduled').length, scheduledMessages: W.load(uid, 'msgs', []).filter(x => x.status === 'scheduled').length,
          lists: Object.keys(W.load(uid, 'lists', {})).length + Object.keys(W.load(uid, 'grouplists', {})).length
        },
        features: { post: canSee(uid, '✍️ Post'), schedule: canSee(uid, '🗓 Schedule a post'), messages: canSee(uid, '✉️ Messages'), sending: canSee(uid, '📡 Sending now'), lists: canSee(uid, '🏷 Lists') }
      };
    },
    'GET /api/posts': uid => {
      need(uid, '🗓 Schedule a post');
      return { posts: W.load(uid, 'posts', []).filter(p => p.status === 'scheduled').sort((a, b) => a.at - b.at).slice(0, 100).map(p => ({ id: p.id, type: p.type, text: p.type === 'text' ? p.text || '' : p.caption || '', at: p.at, repeat: p.repeat || 'none', bg: p.bg || null })) };
    },
    'DELETE /api/posts/:id': (uid, { id }) => {
      need(uid, '🗓 Schedule a post');
      const P = W.load(uid, 'posts', []), p = P.find(x => String(x.id) === id && x.status === 'scheduled'); if (!p) throw E(404, 'That post is no longer scheduled.');
      p.status = 'cancelled'; W.save(uid, 'posts', P); W.logActivity(uid, 'app-cancel-post', id); return { ok: true };
    },
    'POST /api/posts': async (uid, _p, body) => {
      need(uid, '✍️ Post');
      const text = String(body.text ?? '').trim(); if (!text) throw E(400, 'Write something first.'); if (text.length > 700) throw E(400, 'Keep it under 700 characters.');
      if (!W.linked(uid)) throw E(400, 'Link WhatsApp in the bot first.');
      const pf = W.prof(uid), bg = /^#[0-9a-f]{6}$/i.test(body.bg || '') ? body.bg.toUpperCase() : pf.color;
      const p = { type: 'text', text, bg, tc: pf.textColor, font: pf.font, aud: 'all', id: Date.now() };
      const sg = W.checkSpam(uid, p); if (!sg.ok) throw E(400, `This post ${sg.reason}.`);
      if (body.when === 'later') {
        const at = Number(body.at); if (!(at > Date.now() + 30000)) throw E(400, 'Pick a time in the future.'); if (at > Date.now() + 90 * 864e5) throw E(400, 'Pick a time within 90 days.');
        const P = W.load(uid, 'posts', []); P.push({ ...p, at, repeat: 'none', status: 'scheduled' }); W.save(uid, 'posts', P); W.logActivity(uid, 'app-schedule-post', p.id);
        return { scheduled: true, at };
      }
      if (!W.isUp(uid)) throw E(400, 'WhatsApp is not connected right now.');
      const run = W.runPost(uid, p); W.logActivity(uid, 'app-post-now', p.id);
      const early = await Promise.race([run.then(() => null, e => e), sleep(800)]);   // report instant failures (limit, plan, spam) straight away
      if (early instanceof Error) throw E(400, early.message);
      run.catch(() => {}); return { started: true };
    },
    'GET /api/messages': uid => {
      need(uid, '✉️ Messages');
      return { messages: W.load(uid, 'msgs', []).filter(m => m.status === 'scheduled').sort((a, b) => a.at - b.at).slice(0, 100).map(m => ({ id: m.id, type: m.type, text: m.type === 'text' ? m.text || '' : m.caption || '', at: m.at, repeat: m.repeat || 'none', target: targetInfo(m.target) })) };
    },
    'DELETE /api/messages/:id': (uid, { id }) => {
      need(uid, '✉️ Messages');
      const M = W.load(uid, 'msgs', []), m = M.find(x => String(x.id) === id && x.status === 'scheduled'); if (!m) throw E(404, 'That message is no longer scheduled.');
      m.status = 'cancelled'; W.save(uid, 'msgs', M); W.logActivity(uid, 'app-cancel-message', id); return { ok: true };
    },
    'GET /api/jobs': uid => { need(uid, '📡 Sending now'); return { jobs: W.activeJobs(uid).map(j => ({ id: j.id, type: j.type, preview: j.preview, total: j.total, sent: j.sent, started: j.started, stopping: !!j.cancel })) }; },
    'POST /api/jobs/:id/stop': (uid, { id }) => { need(uid, '📡 Sending now'); const n = W.cancelJobs(uid, id); if (!n) throw E(404, 'That send already finished.'); W.logActivity(uid, 'app-stop-send', id); return { ok: true }; },
    'GET /api/lists': uid => {
      need(uid, '🏷 Lists');
      const row = ([name, v]) => ({ name, count: v.length });
      return { numbers: Object.entries(W.load(uid, 'lists', {})).map(row), groups: Object.entries(W.load(uid, 'grouplists', {})).map(row) };
    }
  };
  const compiled = Object.entries(routes).map(([k, fn]) => { const [method, pattern] = k.split(' '); return { method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn }; });

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const cors = origin && allow.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Max-Age': '600' } : {};
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      const path = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '') || '/';
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (limited('ip:' + ip, 300)) return send(res, 429, { error: 'Too many requests. Please wait a minute.' }, cors);
      if (path === '/api/health') return send(res, 200, { ok: true, build }, cors);
      const m = /^tma (.+)$/s.exec(req.headers.authorization || ''), user = m && verifyInitData(m[1], token);
      if (!user) return send(res, 401, { error: 'Open this app from the bot in Telegram.' }, cors);
      const uid = String(user.id);
      if (limited('u:' + uid, 120)) return send(res, 429, { error: 'Too many requests. Please wait a minute.' }, cors);
      if (!W.users().includes(uid)) return send(res, 403, { error: 'Open the bot and send /start first.' }, cors);
      for (const r of compiled) {
        if (r.method !== req.method) continue; const hit = r.re.exec(path); if (!hit) continue;
        const body = req.method === 'POST' ? await readBody(req) : {};
        return send(res, 200, await r.fn(uid, hit.groups || {}, body), cors);
      }
      return send(res, 404, { error: 'Not found.' }, cors);
    } catch (e) {
      const code = Number(e?.code) >= 400 && Number(e?.code) < 600 ? Number(e.code) : 500;
      if (code === 500) console.error('api error', e?.message);
      send(res, code, { error: code === 500 ? 'Something went wrong on the server.' : e.message }, cors);
    }
  });
  server.listen(port, '0.0.0.0', () => console.log(`Mini App API listening on ${port} for ${[...allow].join(', ') || '(no origin set)'}`));
  return server;
}
