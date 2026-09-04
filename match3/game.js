(() => {
'use strict';

/* ==================== 常量与元素 ==================== */
const FRUITS = ['🍎', '🍇', '🍊', '🍋', '🍉', '🫐', '🥝'];
const TINTS = [
  'rgba(248, 113, 113, 0.20)', 'rgba(167, 139, 250, 0.22)', 'rgba(251, 146, 60, 0.20)',
  'rgba(250, 204, 21, 0.20)', 'rgba(74, 222, 128, 0.20)', 'rgba(96, 165, 250, 0.22)',
  'rgba(45, 212, 191, 0.20)',
];
const SIZE = 8;
const SP_NONE = 0, SP_CROSS = 1, SP_BOMB = 2;
const SP_MARK = { 1: '✨', 2: '💥' };

const wrapEl = document.getElementById('boardWrap');
const boardEl = document.getElementById('board');
const layerEl = document.getElementById('layer');
const overlayEl = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const movesEl = document.getElementById('moves');
const trayEl = document.getElementById('tray');
const btnSound = document.getElementById('btnSound');
const btnHint = document.getElementById('btnHint');
const btnNew = document.getElementById('btnNew');
const modeEl = document.getElementById('mode');

/* ==================== 状态 ==================== */
let types = +(localStorage.getItem('match3.types') || 6);
if ([5, 6, 7].indexOf(types) < 0) types = 6;
let muted = localStorage.getItem('match3.muted') === '1';

let grid = [];
let tileSeq = 0;
let level = 1, score = 0, movesLeft = 20, movesTotal = 20;
let goals = [];
let busy = false, ended = false;
let sel = null, press = null;
let cellPx = 48, gapPx = 6;
let hintTimer = null;

/* ==================== 音效 ==================== */
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function tone(freq, dur, type = 'sine', vol = 0.15, delay = 0, slideTo = 0) {
  if (muted || !audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}
const soundSwap = () => tone(500, 0.05, 'sine', 0.06, 0, 640);
const soundBad = () => tone(180, 0.12, 'sawtooth', 0.07, 0, 120);
const soundPop = (combo) => tone(420 + combo * 110, 0.08, 'triangle', 0.1, 0, 620 + combo * 130);
const soundSpecial = () => [660, 880, 1180].forEach((f, i) => tone(f, 0.1, 'square', 0.07, i * 0.05));
const soundLevel = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.15, 'triangle', 0.12, i * 0.1));
const soundFail = () => [440, 349, 262].forEach((f, i) => tone(f, 0.22, 'sine', 0.12, i * 0.16));
const unlockAudio = () => {
  ensureAudio();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

/* ==================== 小工具 ==================== */
const tr = (x, y) => 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
const at = (r, c) => (r < 0 || c < 0 || r >= SIZE || c >= SIZE ? null : grid[r][c]);
const key = (r, c) => r * SIZE + c;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const rnd = (n) => Math.floor(Math.random() * n);

/* ==================== 关卡 ==================== */
function levelPlan(L) {
  const goalKinds = L <= 2 ? 1 : L <= 5 ? 2 : 3;
  const need = Math.min(10 + (L - 1) * 3, 26);
  const pool = [];
  for (let i = 0; i < types; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) { const j = rnd(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const gs = [];
  for (let i = 0; i < goalKinds; i++) gs.push({ t: pool[i], need, got: 0 });
  return { goals: gs, moves: 20 + Math.min(L, 14) };
}

function startLevel(L, keepScore) {
  level = Math.max(1, L);
  const plan = levelPlan(level);
  goals = plan.goals;
  movesTotal = plan.moves;
  movesLeft = movesTotal;
  if (!keepScore) score = 0;
  ended = false;
  busy = false;
  sel = null;
  hideOverlay();
  buildBoard();
  renderTray();
  syncUI();
}

/* ==================== 棋盘 ==================== */
function computeCell() {
  const avail = Math.max(280, Math.min(wrapEl.clientWidth || 560, 620)) - 20;
  gapPx = Math.max(3, Math.round(avail * 0.012));
  cellPx = Math.max(28, Math.floor((avail - (SIZE + 1) * gapPx) / SIZE));
  boardEl.style.setProperty('--cell', cellPx + 'px');
  boardEl.style.setProperty('--gap', gapPx + 'px');
  boardEl.style.setProperty('--rows', SIZE);
  boardEl.style.setProperty('--cols', SIZE);
}

function makeTile(t, r, c) {
  const tile = { id: ++tileSeq, t, sp: SP_NONE, r, c, el: null };
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.id = tile.id;
  el.textContent = FRUITS[t];
  el.style.setProperty('--tint', TINTS[t]);
  tile.el = el;
  layerEl.appendChild(el);
  return tile;
}

function buildBoard() {
  layerEl.innerHTML = '';
  grid = [];
  for (let r = 0; r < SIZE; r++) {
    grid.push([]);
    for (let c = 0; c < SIZE; c++) grid[r].push(null);
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      let t, guard = 0;
      do { t = rnd(types); guard++; } while (guard < 40 && wouldMatch(r, c, t));
      grid[r][c] = makeTile(t, r, c);
    }
  }
  let tries = 0;
  while (!findMove() && tries++ < 30) shuffleTypes();
  computeCell();
  layout();
}

function wouldMatch(r, c, t) {
  const a = at(r, c - 1), b = at(r, c - 2);
  if (a && b && a.t === t && b.t === t) return true;
  const d = at(r - 1, c), e = at(r - 2, c);
  return !!(d && e && d.t === t && e.t === t);
}

function shuffleTypes() {
  const list = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) list.push(grid[r][c]);
  for (let i = list.length - 1; i > 0; i--) { const j = rnd(i + 1); [list[i], list[j]] = [list[j], list[i]]; }
  let n = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const t = list[n++];
    grid[r][c] = t; t.r = r; t.c = c;
  }
}

function posOf(r, c) {
  return [gapPx + c * (cellPx + gapPx), gapPx + r * (cellPx + gapPx)];
}

function layout() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = grid[r][c];
      if (!t) continue;
      const [x, y] = posOf(t.r, t.c);
      t.el.style.transform = tr(x, y);
      t.el.style.setProperty('--tx', x + 'px');
      t.el.style.setProperty('--ty', y + 'px');
    }
  }
}

function paintTile(t) {
  t.el.textContent = '';
  const label = document.createElement('span');
  label.textContent = FRUITS[t.t];
  t.el.appendChild(label);
  t.el.className = 'tile' + (t.sp ? ' special' : '') + (t.sp === SP_BOMB ? ' bomb' : '');
  t.el.style.setProperty('--tint', TINTS[t.t]);
  if (t.sp) {
    const m = document.createElement('i');
    m.className = 'mark';
    m.textContent = SP_MARK[t.sp];
    t.el.appendChild(m);
  }
}

/* ==================== 消除 ==================== */
function findRuns() {
  const runs = [];
  for (let r = 0; r < SIZE; r++) {
    let c = 0;
    while (c < SIZE) {
      const t = at(r, c);
      if (!t) { c++; continue; }
      let e = c + 1;
      while (e < SIZE && at(r, e) && at(r, e).t === t.t) e++;
      if (e - c >= 3) {
        const cells = [];
        for (let x = c; x < e; x++) cells.push({ r, c: x });
        runs.push({ cells, type: t.t, len: e - c, dir: 'h' });
      }
      c = Math.max(e, c + 1);
    }
  }
  for (let c = 0; c < SIZE; c++) {
    let r = 0;
    while (r < SIZE) {
      const t = at(r, c);
      if (!t) { r++; continue; }
      let e = r + 1;
      while (e < SIZE && at(e, c) && at(e, c).t === t.t) e++;
      if (e - r >= 3) {
        const cells = [];
        for (let y = r; y < e; y++) cells.push({ r: y, c });
        runs.push({ cells, type: t.t, len: e - r, dir: 'v' });
      }
      r = Math.max(e, r + 1);
    }
  }
  return runs;
}

function blastCells(t, r, c) {
  const cells = [];
  if (t.sp === SP_CROSS) {
    for (let x = 0; x < SIZE; x++) cells.push({ r, c: x });
    for (let y = 0; y < SIZE; y++) cells.push({ r: y, c });
  } else if (t.sp === SP_BOMB) {
    for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) cells.push({ r: y, c: x });
  }
  return cells;
}

// 返回本次要消除的格子集合 + 需要新生成的特殊宝石
function planClears(runs, extraCells) {
  const toClear = new Set();
  const spawns = [];
  for (const run of runs) {
    run.cells.forEach((p) => toClear.add(key(p.r, p.c)));
    if (run.len >= 5) spawns.push({ r: run.cells[(run.cells.length / 2) | 0].r, c: run.cells[(run.cells.length / 2) | 0].c, t: run.type, sp: SP_BOMB });
    else if (run.len === 4) {
      const p = run.dir === 'h' ? run.cells[1] : run.cells[Math.floor(run.cells.length / 2)];
      spawns.push({ r: p.r, c: p.c, t: run.type, sp: SP_CROSS });
    }
  }
  (extraCells || []).forEach((p) => { if (at(p.r, p.c)) toClear.add(key(p.r, p.c)); });
  // 特殊宝石被波及 → 连锁引爆
  const queue = [];
  toClear.forEach((k) => {
    const t = grid[(k / SIZE) | 0][k % SIZE];
    if (t && t.sp) queue.push(t);
  });
  const triggered = new Set();
  while (queue.length) {
    const t = queue.pop();
    if (triggered.has(t.id)) continue;
    triggered.add(t.id);
    for (const p of blastCells(t, t.r, t.c)) {
      if (p.r < 0 || p.c < 0 || p.r >= SIZE || p.c >= SIZE) continue;
      const kk = key(p.r, p.c);
      if (toClear.has(kk)) continue;
      toClear.add(kk);
      const nt = grid[p.r][p.c];
      if (nt && nt.sp) queue.push(nt);
    }
  }
  // 新宝石所在位置不被清除
  for (const s of spawns) toClear.delete(key(s.r, s.c));
  return { toClear, spawns, blasts: triggered.size };
}

async function clearOnce(runs, extraCells, combo) {
  const plan = planClears(runs, extraCells);
  if (!plan.toClear.size && !plan.spawns.length) return 0;
  const cells = [];
  plan.toClear.forEach((k) => {
    const r = (k / SIZE) | 0, c = k % SIZE;
    const t = grid[r][c];
    if (!t) return;
    cells.push(t);
    grid[r][c] = null;
    t.el.classList.add('pop');
    const el = t.el;
    setTimeout(() => el.remove(), 260);
  });
  // 目标与得分
  let gained = 0;
  for (const t of cells) {
    gained += 30 + 20 * (combo - 1);
    for (const g of goals) if (g.t === t.t && g.got < g.need) g.got++;
  }
  score += gained;
  for (const s of plan.spawns) {
    const old = at(s.r, s.c);
    if (old) { old.el.remove(); grid[s.r][s.c] = null; }
    const nt = makeTile(s.t, s.r, s.c);
    nt.sp = s.sp;
    paintTile(nt);
    grid[s.r][s.c] = nt;
    soundSpecial();
  }
  if (cells.length) {
    soundPop(combo);
    fx(cells, gained, combo);
  }
  layout();
  renderTray();
  syncUI();
  await sleep(250);
  return cells.length;
}

function fx(cells, gained, combo) {
  const colors = cells.map((t) => TINTS[t.t]);
  const n = Math.min(cells.length, 14);
  for (let i = 0; i < n; i++) {
    const t = cells[(i * Math.max(1, Math.floor(cells.length / n))) % cells.length];
    const [x, y] = posOf(t.r, t.c);
    for (let s = 0; s < 3; s++) {
      const sp = document.createElement('i');
      sp.className = 'fx spark';
      sp.style.background = colors[(i + s) % colors.length].replace('0.2', '0.95');
      sp.style.left = Math.round(x + cellPx * 0.3) + 'px';
      sp.style.top = Math.round(y + cellPx * 0.3) + 'px';
      sp.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
      sp.style.setProperty('--dy', (Math.random() * -50 - 10) + 'px');
      sp.style.animationDelay = (Math.random() * 0.08) + 's';
      layerEl.appendChild(sp);
      setTimeout(() => sp.remove(), 700);
    }
  }
  const head = cells[0];
  const [fx0, fy0] = posOf(head.r, head.c);
  const label = document.createElement('b');
  label.className = 'fx float';
  label.style.left = (fx0 + cellPx / 2) + 'px';
  label.style.top = fy0 + 'px';
  label.textContent = '+' + gained + (combo > 1 ? ' 连锁×' + combo : '');
  layerEl.appendChild(label);
  setTimeout(() => label.remove(), 1000);
  if (cells.length >= 8 || combo >= 3) {
    boardEl.classList.add('shake');
    setTimeout(() => boardEl.classList.remove('shake'), 460);
  }
}

async function collapse() {
  const fresh = [];
  for (let c = 0; c < SIZE; c++) {
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      const t = grid[r][c];
      if (!t) continue;
      if (write !== r) { grid[write][c] = t; grid[r][c] = null; t.r = write; t.c = c; }
      write--;
    }
    for (let r = write; r >= 0; r--) {
      const t = makeTile(rnd(types), r, c);
      grid[r][c] = t;
      const [x, y] = posOf(r, c);
      t.el.style.transition = 'none';
      t.el.style.transform = tr(x, y - (write + 1) * (cellPx + gapPx));
      fresh.push(t);
    }
  }
  await sleep(20);
  fresh.forEach((t) => { t.el.classList.add('spawn'); t.el.style.transition = ''; });
  layout();
  await sleep(220);
  fresh.forEach((t) => t.el.classList.remove('spawn'));
}

async function resolve(extraCells) {
  let combo = 0, cleared = 0;
  let pending = extraCells || null;
  while (combo < 15) {
    const runs = findRuns();
    if (!runs.length && !pending) break;
    combo++;
    const n = await clearOnce(runs, pending, combo);
    pending = null;
    cleared += n;
    if (!n && !runs.length) break;
    await collapse();
  }
  return cleared;
}

/* ==================== 可行走法 ==================== */
function swapData(a, b) {
  const ta = grid[a.r][a.c], tb = grid[b.r][b.c];
  grid[a.r][a.c] = tb; grid[b.r][b.c] = ta;
  if (ta) { ta.r = b.r; ta.c = b.c; }
  if (tb) { tb.r = a.r; tb.c = a.c; }
  return [ta, tb];
}

function findMove() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      for (const d of [[0, 1], [1, 0]]) {
        const b = { r: r + d[0], c: c + d[1] };
        if (b.r >= SIZE || b.c >= SIZE) continue;
        const a = { r, c };
        swapData(a, b);
        const ok = findRuns().length > 0 || (at(a.r, a.c) && at(a.r, a.c).sp) || (at(b.r, b.c) && at(b.r, b.c).sp);
        swapData(a, b);
        if (ok) return { a, b };
      }
    }
  }
  return null;
}

async function reshuffle() {
  busy = true;
  toast('没有可消除的组合，自动洗牌 🔀');
  tone(300, 0.2, 'triangle', 0.08, 0, 700);
  let tries = 0;
  do { shuffleTypes(); tries++; } while (!findMove() && tries < 40);
  layout();
  await sleep(320);
  busy = false;
}

/* ==================== 交换 ==================== */
async function trySwap(a, b) {
  if (busy || ended) return;
  if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return;
  const ta = at(a.r, a.c), tb = at(b.r, b.c);
  if (!ta || !tb) return;
  busy = true;
  sel = null;
  clearHint();
  swapData(a, b);
  layout();
  soundSwap();
  await sleep(200);
  const runs = findRuns();
  const special = (at(a.r, a.c) && at(a.r, a.c).sp) || (at(b.r, b.c) && at(b.r, b.c).sp);
  if (!runs.length && !special) {
    swapData(a, b);
    layout();
    soundBad();
    await sleep(200);
    busy = false;
    return;
  }
  movesLeft--;
  syncUI();
  const extra = !runs.length && special ? [a, b] : null;
  await resolve(extra);
  if (!findMove()) await reshuffle();
  busy = false;
  checkLevel();
}

function checkLevel() {
  const done = goals.every((g) => g.got >= g.need);
  if (done) {
    ended = true;
    const bonus = movesLeft * 200;
    score += bonus;
    const stars = movesLeft >= movesTotal * 0.4 ? 3 : movesLeft >= movesTotal * 0.15 ? 2 : 1;
    saveBest();
    soundLevel();
    confetti();
    showOverlay('<div class="ov-emoji">' + '⭐'.repeat(stars) + '</div><h2>第 ' + level + ' 关通过！</h2>' +
      '<div class="final-score">' + score + '<span> 分</span></div>' +
      '<p class="final-sub">剩余 ' + movesLeft + ' 步 · 奖励 ' + bonus + ' 分</p>' +
      '<button class="primary" data-act="next">下一关 ▶</button>');
    localStorage.setItem('match3.level', String(level + 1));
    return;
  }
  if (movesLeft <= 0) {
    ended = true;
    saveBest();
    soundFail();
    const detail = goals.map((g) => FRUITS[g.t] + ' ' + Math.min(g.got, g.need) + '/' + g.need).join(' ');
    showOverlay('<div class="ov-emoji">🥀</div><h2>步数用完了</h2>' +
      '<div class="final-score">' + score + '<span> 分</span></div>' +
      '<p class="hint-text">目标 ' + detail + '</p>' +
      '<button class="primary" data-act="retry">再试一次</button>');
  }
}

function saveBest() {
  const prev = +(localStorage.getItem('match3.best') || 0);
  if (score > prev) localStorage.setItem('match3.best', String(score));
}

/* ==================== 界面 ==================== */
function syncUI() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  movesEl.textContent = movesLeft;
  movesEl.classList.toggle('moves-low', movesLeft <= 5);
}

function renderTray() {
  trayEl.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'goal';
  head.innerHTML = '<span class="g-emoji">🎯</span><span class="g-num">目标</span>';
  trayEl.appendChild(head);
  for (const g of goals) {
    const el = document.createElement('div');
    el.className = 'goal' + (g.got >= g.need ? ' done' : '');
    const pct = Math.min(100, Math.round((g.got / g.need) * 100));
    el.innerHTML = '<span class="g-emoji">' + FRUITS[g.t] + '</span>' +
      '<span class="g-num">' + Math.min(g.got, g.need) + '/' + g.need + '</span>' +
      '<span class="g-bar"><i class="g-fill" style="width:' + pct + '%"></i></span>';
    trayEl.appendChild(el);
  }
  const bestEl = document.createElement('div');
  bestEl.className = 'goal';
  bestEl.innerHTML = '<span class="g-emoji">🏆</span><span class="g-num">最高 ' +
    Math.max(+(localStorage.getItem('match3.best') || 0), score) + '</span>';
  trayEl.appendChild(bestEl);
}

function showOverlay(html) {
  overlayContent.innerHTML = html;
  overlayEl.classList.add('show');
}
function hideOverlay() { overlayEl.classList.remove('show'); }

let toastEl = null, toastTimer = null;
function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.querySelector('.board-outer').appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function confetti(n) {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#34d399', '#22d3ee', '#fbbf24', '#f472b6', '#a78bfd'];
  for (let i = 0; i < (n || 70); i++) {
    const s = document.createElement('i');
    s.style.left = (Math.random() * 100) + '%';
    s.style.background = colors[i % colors.length];
    s.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    s.style.setProperty('--dy', '460px');
    s.style.setProperty('--rot', (Math.random() * 1000 - 500) + 'deg');
    s.style.animationDuration = (1.4 + Math.random() * 1.4) + 's';
    s.style.animationDelay = (Math.random() * 0.6) + 's';
    box.appendChild(s);
  }
  document.querySelector('.board-outer').appendChild(box);
  setTimeout(() => box.remove(), 3600);
}

/* ==================== 提示 ==================== */
function showHint() {
  if (busy || ended) return;
  clearHint();
  const m = findMove();
  if (!m) { toast('暂时没有可消除的组合'); return; }
  [at(m.a.r, m.a.c), at(m.b.r, m.b.c)].forEach((t) => t && t.el.classList.add('hint'));
  hintTimer = setTimeout(clearHint, 2000);
  tone(880, 0.07, 'sine', 0.05, 0, 1200);
}
function clearHint() {
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  layerEl.querySelectorAll('.hint').forEach((el) => el.classList.remove('hint'));
}

/* ==================== 输入 ==================== */
function tileFromEvent(ev) {
  const el = ev.target.closest ? ev.target.closest('.tile') : null;
  if (!el) return null;
  const id = +el.dataset.id;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const t = grid[r][c];
    if (t && t.id === id) return t;
  }
  return null;
}

function onDown(ev) {
  if (busy || ended) return;
  const t = tileFromEvent(ev);
  if (!t) { sel = null; layout(); return; }
  press = { tile: t, x: ev.clientX, y: ev.clientY, done: false };
  ev.preventDefault();
}

function onMove(ev) {
  if (!press || busy || ended) return;
  const dx = ev.clientX - press.x, dy = ev.clientY - press.y;
  if (Math.abs(dx) < cellPx * 0.42 && Math.abs(dy) < cellPx * 0.42) return;
  const from = press.tile;
  const dr = Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? 1 : -1) : 0;
  const dc = dr ? 0 : (dx > 0 ? 1 : -1);
  press = null;
  const a = { r: from.r, c: from.c };
  const b = { r: from.r + dr, c: from.c + dc };
  trySwap(a, b);
}

function onUp(ev) {
  if (!press) return;
  const p = press;
  press = null;
  if (busy || ended) return;
  const moved = Math.abs(ev.clientX - p.x) + Math.abs(ev.clientY - p.y) > 8;
  if (moved) return;
  const t = p.tile;
  if (sel && sel.id === t.id) { sel = null; layout(); return; }
  if (sel) {
    const a = { r: sel.r, c: sel.c }, b = { r: t.r, c: t.c };
    const adjacent = Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
    sel = null;
    if (adjacent) { trySwap(a, b); return; }
  }
  sel = t;
  soundPick();
  layout();
}
function soundPick() { tone(520, 0.04, 'sine', 0.06, 0, 640); }

/* ==================== 启动 ==================== */
function setTypes(n) {
  types = [5, 6, 7].indexOf(n) >= 0 ? n : 6;
  localStorage.setItem('match3.types', String(types));
  modeEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.types === types));
}

btnSound.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('match3.muted', muted ? '1' : '0');
  btnSound.textContent = muted ? '🔇' : '🔊';
  btnSound.classList.toggle('active', muted);
});
btnHint.addEventListener('click', showHint);
btnNew.addEventListener('click', () => startLevel(level, false));
modeEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-types]');
  if (!b) return;
  setTypes(+b.dataset.types);
  startLevel(1, false);
});
overlayContent.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  hideOverlay();
  if (btn.dataset.act === 'next') startLevel(level + 1, true);
  else startLevel(level, false);
});

layerEl.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', () => { press = null; });

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'n') startLevel(level, false);
  else if (k === 'h') showHint();
});

let rafId = null;
window.addEventListener('resize', () => {
  if (rafId) return;
  rafId = requestAnimationFrame(() => { rafId = null; computeCell(); layout(); });
});

btnSound.textContent = muted ? '🔇' : '🔊';
btnSound.classList.toggle('active', muted);
setTypes(types);
computeCell();
startLevel(1, false);

})();
