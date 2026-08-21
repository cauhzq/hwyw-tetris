'use strict';
(function () {
  // ===================== 音效（Web Audio 实时合成） =====================
  const Sound = (function () {
    let ctx = null, on = true;
    function ac() {
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
      return ctx;
    }
    function tone(freq, dur, type, vol, slideTo) {
      if (!on) return;
      const c = ac(); if (!c) return;
      if (c.state === 'suspended') c.resume();
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
      g.gain.setValueAtTime((vol || 0.06), c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur);
    }
    return {
      toggle() { on = !on; return on; },
      get enabled() { return on; },
      move() { tone(220, 0.04, 'square', 0.04); },
      rotate() { tone(420, 0.05, 'square', 0.05, 560); },
      drop() { tone(160, 0.06, 'sawtooth', 0.06, 90); },
      lock() { tone(300, 0.05, 'triangle', 0.05); },
      clear() { tone(660, 0.08, 'triangle', 0.08, 1320); setTimeout(() => tone(990, 0.1, 'triangle', 0.08, 1760), 80); },
      gameover() { tone(330, 0.5, 'sawtooth', 0.1, 80); setTimeout(() => tone(160, 0.6, 'sawtooth', 0.1, 60), 120); }
    };
  })();

  // ===================== API 抽象层 =====================
  // 后端可用时用云端排行榜；不可用时降级到 localStorage（本地模式）
  let currentUser = null;
  let backend = false;
  let token = null;
  const API_BASE = (window.GAME_CONFIG && window.GAME_CONFIG.apiBase) || '';
  const LS_USERS = 'tetris_users', LS_TOKEN = 'tetris_token';

  const api = {
    get mode() { return backend ? '云端' : '本地'; },
    get user() { return currentUser; },
    async init() {
      if (!API_BASE) { backend = false; return false; }
      try {
        const r = await fetch(API_BASE + '/api/health', { cache: 'no-store' });
        const ct = r.headers.get('content-type') || '';
        backend = r.ok && ct.indexOf('json') !== -1;
      } catch (e) { backend = false; }
      return backend;
    },
    _memStore: null,
    _ensure() {
      if (this._memStore) return this._memStore;
      try { this._memStore = JSON.parse(localStorage.getItem(LS_USERS) || '{}'); } catch (e) { this._memStore = {}; }
      return this._memStore;
    },
    _ls() { return this._ensure(); },
    _lsSave(u) { this._memStore = u; try { localStorage.setItem(LS_USERS, JSON.stringify(u)); } catch (e) {} },
    async register(username, password) {
      if (backend) {
        const r = await fetch(API_BASE + '/api/register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || '注册失败');
        return { username };
      }
      const u = this._ls();
      if (u[username]) throw new Error('用户名已存在');
      u[username] = { password, best: 0, scores: [] };
      this._lsSave(u);
      return { username };
    },
    async login(username, password) {
      if (backend) {
        const r = await fetch(API_BASE + '/api/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || '登录失败');
        token = j.token;
        try { localStorage.setItem(LS_TOKEN, token); } catch (e) {}
        currentUser = { username, best: j.best };
        return currentUser;
      }
      const u = this._ls();
      if (!u[username] || u[username].password !== password) throw new Error('用户名或密码错误');
      currentUser = { username, best: u[username].best || 0 };
      return currentUser;
    },
    async submitScore(score) {
      if (backend) {
        if (!token) return;
        const r = await fetch(API_BASE + '/api/score', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, score })
        });
        const j = await r.json();
        if (r.ok && currentUser) currentUser.best = j.best;
        return;
      }
      if (!currentUser) return;
      const u = this._ls();
      if (u[currentUser.username]) {
        u[currentUser.username].scores.push(score);
        if (score > (u[currentUser.username].best || 0)) u[currentUser.username].best = score;
        this._lsSave(u);
        currentUser.best = u[currentUser.username].best;
      }
    },
    async leaderboard() {
      if (backend) {
        const r = await fetch(API_BASE + '/api/leaderboard', { cache: 'no-store' });
        const j = await r.json();
        return j.list || [];
      }
      const u = this._ls();
      return Object.entries(u)
        .map(([username, o]) => ({ username, best: o.best || 0 }))
        .sort((a, b) => b.best - a.best)
        .slice(0, 50);
    },
    logout() { token = null; currentUser = null; try { localStorage.removeItem(LS_TOKEN); } catch (e) {} }
  };

  // ===================== 游戏核心 =====================
  const COLS = 10, ROWS = 20;
  const SHAPES = {
    I: { color: '#4cd4ff', m: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
    O: { color: '#ffd24d', m: [[1,1],[1,1]] },
    T: { color: '#c779ff', m: [[0,1,0],[1,1,1],[0,0,0]] },
    S: { color: '#5ee08a', m: [[0,1,1],[1,1,0],[0,0,0]] },
    Z: { color: '#ff6b8a', m: [[1,1,0],[0,1,1],[0,0,0]] },
    J: { color: '#6b8bff', m: [[1,0,0],[1,1,1],[0,0,0]] },
    L: { color: '#ff9f4d', m: [[0,0,1],[1,1,1],[0,0,0]] }
  };
  const TYPES = Object.keys(SHAPES);

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const nextCv = document.getElementById('next');
  const nextCtx = nextCv.getContext('2d');
  const holdCv = document.getElementById('hold');
  const holdCtx = holdCv.getContext('2d');

  let cell = 24, board = [], cur = null, next = null, hold = null, canHold = true;
  let score = 0, lines = 0, level = 1, dropMs = 800, lastDrop = 0, raf = 0;
  let running = false, paused = false, gameOver = false;
  let bag = [];

  function newBag() {
    const b = TYPES.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }
  function nextType() {
    if (!bag.length) bag = newBag();
    return bag.pop();
  }
  function makePiece(type) {
    const s = SHAPES[type];
    return { type, m: s.m.map(r => r.slice()), color: s.color, x: 0, y: 0 };
  }
  function rotateCW(m) {
    const n = m.length, res = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) res[x][n - 1 - y] = m[y][x];
    return res;
  }
  function collide(p) {
    const n = p.m.length;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!p.m[y][x]) continue;
      const bx = p.x + x, by = p.y + y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
    return false;
  }
  function spawn() {
    cur = makePiece(nextType());
    cur.x = ((COLS - cur.m.length) / 2) | 0;
    cur.y = -topOffset(cur);
    next = makePiece(nextType());
    canHold = true;
    if (collide(cur)) endGame();
  }
  function topOffset(p) {
    for (let y = 0; y < p.m.length; y++) if (p.m[y].some(v => v)) return y;
    return 0;
  }
  function merge() {
    const n = cur.m.length;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (cur.m[y][x]) {
        const by = cur.y + y;
        if (by >= 0) board[by][cur.x + x] = cur.color;
      }
    }
  }
  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every(v => v)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(0));
        cleared++; y++;
      }
    }
    if (cleared) {
      const pts = [0, 100, 300, 500, 800][cleared] || 800;
      score += pts * level;
      lines += cleared;
      level = Math.floor(lines / 10) + 1;
      dropMs = Math.max(90, 800 - (level - 1) * 65);
      Sound.clear();
    }
  }
  function step() {
    cur.y++;
    if (collide(cur)) { cur.y--; merge(); clearLines(); spawn(); }
    else { Sound.move(); }
  }
  function hardDrop() {
    let d = 0;
    while (!collide({ ...cur, y: cur.y + 1 })) { cur.y++; d++; }
    score += d * 2;
    merge(); clearLines(); Sound.drop(); spawn();
  }
  function move(dx) { cur.x += dx; if (!collide(cur)) Sound.move(); else cur.x -= dx; }
  function rotate() {
    const r = rotateCW(cur.m);
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      const test = { ...cur, m: r, x: cur.x + k };
      if (!collide(test)) { cur.m = r; cur.x += k; Sound.rotate(); return; }
    }
  }
  function doHold() {
    if (!canHold) return;
    if (hold) { const t = hold.type; hold = makePiece(cur.type); cur = makePiece(t); cur.x = ((COLS - cur.m.length) / 2) | 0; cur.y = -topOffset(cur); }
    else { hold = makePiece(cur.type); spawn(); }
    canHold = false;
    Sound.rotate();
  }
  function ghostY() {
    const g = { ...cur };
    while (!collide({ ...g, y: g.y + 1 })) g.y++;
    return g.y;
  }

  // ---------- 渲染 ----------
  function resize() {
    const wrap = canvas.parentElement;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = Math.floor(Math.min(w / COLS, h / ROWS));
  }
  function drawCell(c, x, y, color, sz, ghost) {
    const px = x * sz, py = y * sz;
    if (ghost) {
      c.fillStyle = color;
      c.globalAlpha = 0.22;
      c.fillRect(px + 1, py + 1, sz - 2, sz - 2);
      c.globalAlpha = 1;
      return;
    }
    c.fillStyle = color;
    c.fillRect(px, py, sz, sz);
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillRect(px, py, sz, Math.max(2, sz * 0.14));
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(px, py + sz - Math.max(2, sz * 0.14), sz, Math.max(2, sz * 0.14));
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.strokeRect(px + 0.5, py + 0.5, sz - 1, sz - 1);
  }
  function render() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#070b18';
    ctx.fillRect(0, 0, w, h);
    // 网格
    ctx.strokeStyle = 'rgba(120,140,255,0.08)';
    for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, ROWS * cell); ctx.stroke(); }
    for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(COLS * cell, y * cell); ctx.stroke(); }
    // 已落定方块
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (board[y][x]) drawCell(ctx, x, y, board[y][x], cell);
    if (cur) {
      // 落点预览
      const gy = ghostY();
      const n = cur.m.length;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (cur.m[y][x]) {
        const by = gy + y; if (by >= 0) drawCell(ctx, cur.x + x, by, cur.color, cell, true);
      }
      // 当前方块
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (cur.m[y][x]) {
        const by = cur.y + y; if (by >= 0) drawCell(ctx, cur.x + x, by, cur.color, cell);
      }
    }
    updateHud();
    drawMini(nextCtx, next);
    drawMini(holdCtx, hold);
  }
  function drawMini(c, p) {
    const sz = 20;
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    if (!p) return;
    const n = p.m.length;
    let minX = n, maxX = -1, minY = n, maxY = -1;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (p.m[y][x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const pw = (maxX - minX + 1) * sz, ph = (maxY - minY + 1) * sz;
    const ox = (c.canvas.width - pw) / 2, oy = (c.canvas.height - ph) / 2;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (p.m[y][x]) {
      c.fillStyle = p.color;
      c.fillRect(ox + (x - minX) * sz, oy + (y - minY) * sz, sz, sz);
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.strokeRect(ox + (x - minX) * sz + 0.5, oy + (y - minY) * sz + 0.5, sz - 1, sz - 1);
    }
  }
  function updateHud() {
    document.getElementById('hudScore').textContent = score;
    document.getElementById('hudLevel').textContent = level;
    document.getElementById('hudLines').textContent = lines;
    document.getElementById('hudBest').textContent = (currentUser && currentUser.best) ? currentUser.best : score;
    document.getElementById('hudMode').textContent = api.mode;
  }

  function loop(ts) {
    if (!running) return;
    if (!paused && !gameOver) {
      if (ts - lastDrop > dropMs) { step(); lastDrop = ts; }
    }
    render();
    raf = requestAnimationFrame(loop);
  }

  function startGame() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    score = 0; lines = 0; level = 1; dropMs = 800; bag = [];
    hold = null; canHold = true; gameOver = false; paused = false;
    next = makePiece(nextType());
    spawn();
    running = true; lastDrop = performance.now();
    document.getElementById('pauseOverlay').classList.add('hidden');
    show('game');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }
  function endGame() {
    gameOver = true; running = false;
    Sound.gameover();
    document.getElementById('finalScore').textContent = score;
    document.getElementById('finalBest').textContent = (currentUser && currentUser.best) ? Math.max(currentUser.best, score) : score;
    const note = document.getElementById('syncNote');
    api.submitScore(score).then(() => {
      if (backend) note.textContent = '✅ 成绩已同步到云端排行榜';
      else note.textContent = '💾 成绩已保存到本机（联网模式可跨手机排名）';
      if (currentUser) document.getElementById('finalBest').textContent = currentUser.best;
    }).catch(() => { note.textContent = '⚠️ 成绩保存失败，仍记录于本局'; });
    setTimeout(() => show('gameOver'), 350);
  }
  function togglePause() {
    if (!running || gameOver) return;
    paused = !paused;
    document.getElementById('pauseOverlay').classList.toggle('hidden', !paused);
  }

  // ===================== 屏幕管理 =====================
  const screens = {
    login: document.getElementById('loginScreen'),
    game: document.getElementById('gameScreen'),
    gameOver: document.getElementById('gameOverScreen'),
    leaderboard: document.getElementById('leaderboardScreen')
  };
  function show(name) { Object.values(screens).forEach(s => s.classList.remove('active')); screens[name].classList.add('active'); }
  function refreshMode() { document.getElementById('modeText').textContent = '模式：' + api.mode + '（' + (API_BASE ? '已配置云端' : '单机/本地') + '）'; }

  // ===================== 输入 =====================
  const keyMap = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'soft',
    ' ': 'hard', 'h': 'hold', 'H': 'hold', 'p': 'pause', 'P': 'pause'
  };
  window.addEventListener('keydown', (e) => {
    if (!screens.game.classList.contains('active')) return;
    const act = keyMap[e.key];
    if (!act) return;
    e.preventDefault();
    if (act === 'pause') { togglePause(); return; }
    if (paused || gameOver) return;
    doAct(act);
  });
  function doAct(act) {
    if (act === 'left') move(-1);
    else if (act === 'right') move(1);
    else if (act === 'rotate') rotate();
    else if (act === 'soft') { cur.y++; if (collide(cur)) { cur.y--; merge(); clearLines(); spawn(); } else { score += 1; } }
    else if (act === 'hard') hardDrop();
    else if (act === 'hold') doHold();
  }
  // 触屏按钮（含长按连发）
  const repeatActs = { left: -1, right: 1, soft: 'soft' };
  let repeatTimer = null, repeatAct = null;
  document.querySelectorAll('.ctrl').forEach(btn => {
    const act = btn.dataset.act;
    const down = (e) => {
      e.preventDefault();
      if (screens.game.classList.contains('active') && !paused && !gameOver) doAct(act);
      if (repeatActs[act] !== undefined) startRepeat(act);
    };
    const up = () => stopRepeat();
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
  });
  function startRepeat(act) {
    stopRepeat();
    repeatAct = act;
    let count = 0;
    const tick = () => {
      if (!screens.game.classList.contains('active') || paused || gameOver) return;
      if (repeatAct === 'soft') doAct('soft');
      else move(repeatAct === 'left' ? -1 : 1);
      count++;
      const rate = count < 4 ? 170 : 55;
      repeatTimer = setTimeout(tick, rate);
    };
    repeatTimer = setTimeout(tick, 200);
  }
  function stopRepeat() { if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null; } repeatAct = null; }
  // 画布滑动手势
  let touchStart = null;
  canvas.addEventListener('pointerdown', (e) => { touchStart = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!touchStart || paused || gameOver) { touchStart = null; return; }
    const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y, adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx < 18 && ady < 18) { rotate(); } // 轻点旋转
    else if (adx > ady) { move(dx > 0 ? 1 : -1); }
    else if (dy > 0) { hardDrop(); }
    touchStart = null;
  });

  // ===================== UI 事件 =====================
  function bind(id, fn) { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); }
  bind('loginBtn', () => doAuth('login'));
  bind('regBtn', () => doAuth('register'));
  bind('lbBtnLogin', async () => { await renderLeaderboard(); show('leaderboard'); });
  bind('lbBtnOver', async () => { await renderLeaderboard(); show('leaderboard'); });
  bind('lbBackBtn', () => show(gameOver ? 'gameOver' : 'login'));
  bind('playAgainBtn', () => startGame());
  bind('logoutBtn', () => { api.logout(); currentUser = null; show('login'); refreshMode(); });
  bind('pauseBtn', togglePause);
  bind('soundBtn', () => { const on = Sound.toggle(); document.getElementById('soundBtn').textContent = on ? '🔊' : '🔇'; });
  bind('pauseOverlay', togglePause);
  bind('installBtn', () => { if (deferredPrompt) deferredPrompt.prompt(); });

  async function doAuth(kind) {
    const u = document.getElementById('loginUser').value.trim();
    const p = document.getElementById('loginPass').value;
    const err = document.getElementById('loginErr');
    err.textContent = '';
    if (u.length < 2 || u.length > 20) { err.textContent = '用户名需 2-20 个字符'; return; }
    if (!p) { err.textContent = '请输入密码'; return; }
    try {
      if (kind === 'register') { await api.register(u, p); }
      await api.login(u, p);
      document.getElementById('soundBtn').textContent = Sound.enabled ? '🔊' : '🔇';
      startGame();
    } catch (e) { err.textContent = e.message || '操作失败'; }
  }

  async function renderLeaderboard() {
    const list = document.getElementById('lbList');
    document.getElementById('lbMode').textContent = '当前模式：' + api.mode;
    list.innerHTML = '<li><span class="nm">加载中…</span></li>';
    try {
      const data = await api.leaderboard();
      if (!data.length) { list.innerHTML = '<li><span class="nm">还没有记录，快去玩一局！</span></li>'; return; }
      list.innerHTML = '';
      data.forEach((it, i) => {
        const li = document.createElement('li');
        if (currentUser && it.username === currentUser.username) li.className = 'me';
        li.innerHTML = '<span class="rk">' + (i + 1) + '</span><span class="nm">' + escapeHtml(it.username) + '</span><span class="sc">' + it.best + '</span>';
        list.appendChild(li);
      });
    } catch (e) {
      list.innerHTML = '<li><span class="nm">加载失败</span></li>';
    }
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // PWA 安装提示
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.getElementById('installBtn').style.display = ''; });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; document.getElementById('installBtn').style.display = 'none'; });

  // ===================== 启动 =====================
  window.addEventListener('resize', () => { if (screens.game.classList.contains('active')) resize(); });
  api.init().then(() => { refreshMode(); }).catch(() => refreshMode());
  resize();
})();
