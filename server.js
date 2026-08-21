'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data.json');

// ---------- 数据存储（JSON 文件，无数据库依赖） ----------
let db = { users: {}, sessions: {} };
function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    db = JSON.parse(raw);
    if (!db.users) db.users = {};
    if (!db.sessions) db.sessions = {};
  } catch (e) {
    save();
  }
}
function save() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
}
load();

const SECRET = 'tetris-hwyw-secret-2026';
function hash(s) { return crypto.createHash('sha256').update(s + SECRET).digest('hex'); }
function newToken() { return crypto.randomBytes(24).toString('hex'); }

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => {
      try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  // ---------- API ----------
  if (p.startsWith('/api/')) {
    if (p === '/api/health') { send(res, 200, { ok: true, game: 'tetris', version: 'HWYW-1.0.0' }); return; }

    if (req.method === 'POST' && p === '/api/register') {
      const b = await readBody(req);
      const u = String(b.username || '').trim();
      const pw = String(b.password || '');
      if (!u || !pw) return send(res, 400, { error: '用户名和密码必填' });
      if (u.length > 20 || u.length < 2) return send(res, 400, { error: '用户名需 2-20 个字符' });
      if (db.users[u]) return send(res, 409, { error: '用户名已存在' });
      db.users[u] = { password: hash(pw), best: 0, scores: [] };
      save();
      return send(res, 200, { ok: true });
    }

    if (req.method === 'POST' && p === '/api/login') {
      const b = await readBody(req);
      const u = String(b.username || '').trim();
      const pw = String(b.password || '');
      const user = db.users[u];
      if (!user || user.password !== hash(pw)) return send(res, 401, { error: '用户名或密码错误' });
      const token = newToken();
      db.sessions[token] = u;
      save();
      return send(res, 200, { ok: true, token, username: u, best: user.best });
    }

    if (req.method === 'POST' && p === '/api/score') {
      const b = await readBody(req);
      const token = b.token || '';
      const u = db.sessions[token];
      if (!u) return send(res, 401, { error: '请先登录' });
      const s = Math.max(0, Math.floor(Number(b.score) || 0));
      const user = db.users[u];
      user.scores.push(s);
      if (s > user.best) user.best = s;
      save();
      return send(res, 200, { ok: true, best: user.best });
    }

    if (p === '/api/leaderboard') {
      const list = Object.entries(db.users)
        .map(([username, user]) => ({ username, best: user.best || 0 }))
        .sort((a, b) => b.best - a.best)
        .slice(0, 50);
      return send(res, 200, { list });
    }

    return send(res, 404, { error: 'not found' });
  }

  // ---------- 静态文件 ----------
  let fp = p === '/' ? '/index.html' : p;
  const full = path.join(PUBLIC_DIR, fp);
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('🧱 HWYW俄罗斯方块 后端已启动: http://localhost:' + PORT);
});
