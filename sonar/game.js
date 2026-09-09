(() => {
'use strict';

/* 声纳扫雷：海面全黑。声纳免费但信息会消散（波纹扫过的格子只亮一下），
   「确认」能把格子永久点亮但要冒踩雷的风险，插旗标记全部水雷也能通关。 */

const DIFFS = {
  easy:   { n: 10, mines: 12, label: '近海' },
  medium: { n: 14, mines: 28, label: '海峡' },
  hard:   { n: 18, mines: 50, label: '深海' },
};
const WORLD = 460;
const PING_SPEED = 560;
const LIT = 1.5;
const SONAR_MAX = 5;
const RECHARGE = 1.25;
const CHAIN_WINDOW = 6;
const NUM_COLORS = ['', '#60a5fa', '#34d399', '#fbbf24', '#f97316', '#f472b6', '#22d3ee', '#e2e8f0', '#f87171'];

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const overlayEl = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const clearEl = document.getElementById('clear');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const timeEl = document.getElementById('time');
const pipsEl = document.getElementById('pips');
const chargeEl = document.getElementById('charge');
const multEl = document.getElementById('multbox');
const diffEl = document.getElementById('diff');
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');
const toolBtns = { ping: document.getElementById('btnPing'), probe: document.getElementById('btnProbe'), flag: document.getElementById('btnFlag') };

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
};

let diff = store.get('sonar.diff') || 'medium';
if (!DIFFS[diff]) diff = 'medium';

const sfx = window.Sfx.create({ storageKey: 'sonar.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

let n = DIFFS[diff].n;
let cell = WORLD / n;
let mines = DIFFS[diff].mines;
let mine, adj, revealed, flagged, litAt;
let pings = [];
let sonar = SONAR_MAX;
let charge = 0;
let state = 'intro';
let tool = 'ping';
let score = 0;
let cleared = 0;
let chain = 0;
let chainT = 0;
let seconds = 0;
let clock = 0;
let last = 0;
let cursor = -1;
let hover = -1;
let shake = 0;
let flash = 0;
let raf = 0;
let hudT = 0;

/* ==================== 局面 ==================== */
function reset() {
  n = DIFFS[diff].n;
  cell = WORLD / n;
  mines = DIFFS[diff].mines;
  const total = n * n;
  mine = new Array(total).fill(false);
  adj = new Array(total).fill(0);
  revealed = new Array(total).fill(false);
  flagged = new Array(total).fill(false);
  litAt = new Array(total).fill(-99);
  pings = [];
  sonar = SONAR_MAX;
  charge = 0;
  score = 0;
  cleared = 0;
  chain = 0;
  chainT = 0;
  seconds = 0;
  cursor = (total / 2) | 0;
  state = 'ready';
  shake = 0;
  flash = 0;
  bestEl.textContent = String(Number(store.get('sonar.best') || 0));
  syncTools();
  hud();
  hideOverlay();
}

const nb = (i) => {
  const r = (i / n) | 0, c = i % n, out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      out.push(rr * n + cc);
    }
  }
  return out;
};

// 首次动作后才布雷：保证第一下不踩雷，且周围无雷（有信息起点）
function placeMines(safe) {
  const total = n * n;
  const banned = new Set([safe, ...nb(safe)]);
  const pool = [];
  for (let i = 0; i < total; i++) if (!banned.has(i)) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  store.set('sonar.plays', String(Number(store.get('sonar.plays') || 0) + 1));
  const count = Math.min(mines, pool.length);
  for (let k = 0; k < count; k++) mine[pool[k]] = true;
  mines = count;
  for (let i = 0; i < total; i++) adj[i] = nb(i).filter((j) => mine[j]).length;
}

/* ==================== 动作 ==================== */
function doPing(i) {
  if (sonar < 1) { sfx.tone(180, 0.08, 'square', 0.06); flash = 0.25; return; }
  sonar -= 1;
  const r = (i / n) | 0, c = i % n;
  const px = (c + 0.5) * cell, py = (r + 0.5) * cell;
  pings.push({ x: px, y: py, t0: clock });
  const maxD = Math.sqrt(2) * WORLD;
  for (let k = 0; k < n * n; k++) {
    const rr = (k / n) | 0, cc = k % n;
    const d = Math.hypot((cc + 0.5) * cell - px, (rr + 0.5) * cell - py);
    const hit = clock + d / PING_SPEED;
    if (d <= maxD && hit > litAt[k]) litAt[k] = hit;
  }
  sfx.tone(300, 0.5, 'sine', 0.1, 0, 120);
  sfx.tone(90, 0.6, 'sine', 0.05, 0.12, 50);
}

function reveal(i) {
  const stack = [i];
  let got = 0;
  while (stack.length) {
    const k = stack.pop();
    if (revealed[k] || flagged[k] || mine[k]) continue;
    revealed[k] = true;
    cleared++;
    got++;
    if (adj[k] === 0) for (const j of nb(k)) if (!revealed[j] && !mine[j]) stack.push(j);
  }
  if (got) {
    const mult = chain >= 3 ? 2 : 1;
    score += got * 10 * mult;
    sfx.tone(520 + Math.min(got, 12) * 26, 0.09, 'triangle', 0.11, 0, 700 + got * 18);
  }
  checkWin();
}

function doProbe(i) {
  if (mine[i]) { lose(i); return; }
  chain = clock - chainT < CHAIN_WINDOW ? chain + 1 : 1;
  chainT = clock;
  reveal(i);
  hud();
}

function doFlag(i) {
  if (revealed[i]) return;
  flagged[i] = !flagged[i];
  sfx.tone(flagged[i] ? 700 : 420, 0.05, 'square', 0.07);
  if (flagged[i] && allMinesFlagged()) win(true);
  hud();
}

function allMinesFlagged() {
  let f = 0;
  for (let i = 0; i < n * n; i++) if (flagged[i]) f++;
  if (f !== mines) return false;
  for (let i = 0; i < n * n; i++) if (flagged[i] && !mine[i]) return false;
  return true;
}

function checkWin() {
  if (state !== 'playing' && state !== 'ready') return;
  if (cleared === n * n - mines) win(false);
}

function win(byFlag) {
  state = 'won';
  const bonus = Math.round(800 + Math.round(sonar) * 60 + Math.max(0, 1500 - seconds * 4) + (byFlag ? 400 : 0));
  score += bonus;
  const key = 'sonar.best';
  const prev = Number(store.get(key) || 0);
  if (score > prev) store.set(key, String(score));
  const tk = 'sonar.best.' + diff;
  const pt = Number(store.get(tk) || 0);
  const secs = Math.round(seconds);
  if (secs > 0 && (!pt || secs < pt)) store.set(tk, String(secs));
  bestEl.textContent = String(Math.max(prev, score));
  sfx.melody([523, 659, 784, 1047, 1319], 0.09);
  showOverlay(
    '<div class="ov-emoji">🎉</div><h2>海域扫清</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">' + DIFFS[diff].label + ' ' + n + '×' + n + ' · ' + mines + ' 颗水雷' + (byFlag ? ' · 全部标记' : '') +
    ' · 用时 ' + fmtTime(seconds) + ' · 奖励 +' + bonus + '</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再打一局</button>' +
    '<button class="ghost" data-act="home">回游戏厅</button></div>');
}

function lose(i) {
  state = 'lost';
  shake = 1;
  flash = 1;
  sfx.noise(0.5, 0.22);
  sfx.tone(90, 0.7, 'sawtooth', 0.16, 0, 40);
  const prev = Number(store.get('sonar.best') || 0);
  if (score > prev) store.set('sonar.best', String(score));
  bestEl.textContent = String(Math.max(prev, score));
  showOverlay(
    '<div class="ov-emoji">💥</div><h2>撞上水雷</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">扫清 ' + cleared + '/' + (n * n - mines) + ' 格 · 坚持 ' + fmtTime(seconds) +
    ' · 最佳 ' + Math.max(prev, score) + '</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="home">回游戏厅</button></div>');
}

/* ==================== HUD ==================== */
const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0');

function hud() {
  clearEl.textContent = cleared + '/' + (n * n - mines);
  scoreEl.textContent = String(score);
  timeEl.textContent = fmtTime(seconds);
  const full = Math.floor(sonar);
  pipsEl.textContent = '●'.repeat(full) + '○'.repeat(Math.max(0, SONAR_MAX - full));
  chargeEl.style.width = Math.round((sonar % 1) * 100) + '%';
  multEl.textContent = chain >= 3 ? '连扫 ×2' : '';
}

function syncTools() {
  for (const k of Object.keys(toolBtns)) toolBtns[k].classList.toggle('on', k === tool);
}

function setTool(t) { tool = t; syncTools(); }

/* ==================== 遮罩 ==================== */
function showOverlay(html) { overlayContent.innerHTML = html; overlayEl.classList.add('show'); }
function hideOverlay() { overlayEl.classList.remove('show'); }

function showIntro() {
  showOverlay(
    '<div class="ov-emoji">📡</div><h2>声纳扫雷</h2>' +
    '<p class="hint">海面一片漆黑，你只有两种手段：<br>' +
    '<b style="color:var(--cyan)">🔊 声纳</b> 免费发一波波纹，扫到的格子只亮 1.5 秒，全靠记<br>' +
    '<b style="color:var(--emerald)">✅ 确认</b> 能把格子永久点亮，但踩到雷就结束<br>' +
    '🚩 标记全部水雷同样通关</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">下潜开始</button></div>');
}

/* ==================== 画布 ==================== */
function resize() {
  const rect = cv.getBoundingClientRect();
  const cssW = rect.width || WORLD;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(cssW * dpr));
  cv.height = Math.max(1, Math.round(cssW * dpr));
  const k = (cssW * dpr) / WORLD;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}

function cellAt(ev) {
  const rect = cv.getBoundingClientRect();
  const x = (ev.clientX != null ? ev.clientX : 0) - rect.left;
  const y = (ev.clientY != null ? ev.clientY : 0) - rect.top;
  const w = rect.width || WORLD;
  const px = (x / w) * WORLD, py = (y / w) * WORLD;
  const c = Math.floor(px / cell), r = Math.floor(py / cell);
  if (r < 0 || c < 0 || r >= n || c >= n) return -1;
  return r * n + c;
}

function draw() {
  ctx.clearRect(0, 0, WORLD, WORLD);
  const g = ctx.createLinearGradient(0, 0, 0, WORLD);
  g.addColorStop(0, '#071322');
  g.addColorStop(1, '#040a14');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD, WORLD);

  if (shake > 0) {
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake * 9, (Math.random() - 0.5) * shake * 9);
  }

  // 网格
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < n; i++) {
    ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, WORLD);
    ctx.moveTo(0, i * cell); ctx.lineTo(WORLD, i * cell);
  }
  ctx.stroke();

  // 格子内容
  for (let i = 0; i < n * n; i++) {
    const r = (i / n) | 0, c = i % n;
    const x = c * cell, y = r * cell;
    let a = 0;
    if (revealed[i]) a = 1;
    else {
      const since = clock - litAt[i];
      if (since >= 0 && since < LIT) a = 1 - since / LIT;
    }
    if (state === 'lost' && mine[i]) a = 1;
    if (flagged[i] && (a > 0 || state !== 'intro')) {
      ctx.globalAlpha = Math.max(a, 0.9);
      ctx.fillStyle = 'rgba(251, 191, 36, 0.12)';
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.font = Math.round(cell * 0.52) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🚩', x + cell / 2, y + cell / 2 + 1);
      ctx.globalAlpha = 1;
      continue;
    }
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    if (mine[i]) {
      ctx.fillStyle = 'rgba(248, 113, 113,' + (0.18 + 0.32 * a) + ')';
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.fillStyle = '#fecaca';
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, cell * 0.22, 0, 6.284);
      ctx.fill();
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.beginPath();
      ctx.moveTo(x + cell * 0.28, y + cell * 0.28); ctx.lineTo(x + cell * 0.72, y + cell * 0.72);
      ctx.moveTo(x + cell * 0.72, y + cell * 0.28); ctx.lineTo(x + cell * 0.28, y + cell * 0.72);
      ctx.stroke();
    } else {
      ctx.fillStyle = revealed[i] ? 'rgba(52, 211, 153, 0.1)' : 'rgba(34, 211, 238, 0.13)';
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      if (adj[i]) {
        ctx.fillStyle = NUM_COLORS[Math.min(8, adj[i])];
        ctx.font = '700 ' + Math.round(cell * 0.56) + 'px ui-monospace, Menlo, monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(adj[i]), x + cell / 2, y + cell / 2 + 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 声纳波纹
  for (const p of pings) {
    const age = clock - p.t0;
    const rad = age * PING_SPEED;
    const fade = Math.max(0, 1 - rad / (WORLD * 1.35));
    if (fade <= 0) continue;
    for (let k = 0; k < 3; k++) {
      const rr = rad - k * 16;
      if (rr <= 0) continue;
      ctx.strokeStyle = 'rgba(34, 211, 238,' + (fade * (0.5 - k * 0.14)).toFixed(3) + ')';
      ctx.lineWidth = 2.4 - k * 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr, 0, 6.284);
      ctx.stroke();
    }
  }

  // 光标
  const cur = hover >= 0 ? hover : cursor;
  if (cur >= 0 && state !== 'intro') {
    const r = (cur / n) | 0, c = cur % n;
    ctx.strokeStyle = tool === 'probe' ? 'rgba(52, 211, 153, 0.9)' : tool === 'flag' ? 'rgba(251, 191, 36, 0.9)' : 'rgba(34, 211, 238, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(c * cell + 1.5, r * cell + 1.5, cell - 3, cell - 3);
  }

  if (shake > 0) ctx.restore();
  if (flash > 0) {
    ctx.fillStyle = 'rgba(248, 113, 113,' + (flash * 0.22).toFixed(3) + ')';
    ctx.fillRect(0, 0, WORLD, WORLD);
  }
}

/* ==================== 主循环 ==================== */
function frame(t) {
  raf = requestAnimationFrame(frame);
  const now = t || 0;
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0));
  last = now;
  clock += dt;
  if (state === 'playing' || state === 'ready') {
    seconds += dt;
    if (sonar < SONAR_MAX) {
      charge += dt;
      while (charge >= RECHARGE && sonar < SONAR_MAX) { charge -= RECHARGE; sonar += 1; }
      if (sonar >= SONAR_MAX) charge = 0;
    }
    if (chain && clock - chainT > CHAIN_WINDOW) chain = 0;
  }
  pings = pings.filter((p) => (clock - p.t0) * PING_SPEED < WORLD * 1.4);
  if (shake > 0) shake = Math.max(0, shake - dt * 3);
  if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
  draw();
  hudT += dt;
  if (hudT > 0.1) { hudT = 0; hud(); }
}

/* ==================== 输入 ==================== */
function act(i) {
  if (i < 0 || state === 'intro') return;
  if (state === 'won' || state === 'lost') return;
  if (state === 'ready') { placeMines(i); state = 'playing'; }
  if (tool === 'flag') { doFlag(i); return; }
  if (revealed[i] || flagged[i]) return;
  if (tool === 'ping') doPing(i);
  else doProbe(i);
}

cv.addEventListener('pointerdown', (e) => {
  sfx.resume();
  hover = cellAt(e);
  if (e.button === 2) { if (hover >= 0) { const old = tool; setTool('flag'); act(hover); setTool(old); } return; }
  cursor = hover;
  act(hover);
});
cv.addEventListener('pointermove', (e) => { hover = cellAt(e); });
cv.addEventListener('pointerleave', () => { hover = -1; });
cv.addEventListener('contextmenu', (e) => { e.preventDefault(); });

for (const k of Object.keys(toolBtns)) toolBtns[k].addEventListener('click', () => setTool(k));

diffEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-diff]');
  if (!btn) return;
  diff = btn.dataset.diff;
  store.set('sonar.diff', diff);
  for (const b of diffEl.querySelectorAll('button')) b.classList.toggle('active', b.dataset.diff === diff);
  reset();
});

overlayEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'start' || btn.dataset.act === 'again') reset();
  else if (btn.dataset.act === 'home') location.href = '../index.html';
});

btnNew.addEventListener('click', reset);
btnSound.addEventListener('click', () => { btnSound.textContent = sfx.toggle() ? '🔇' : '🔊'; });

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === '1') setTool('ping');
  else if (k === '2') setTool('probe');
  else if (k === '3') setTool('flag');
  else if (k === 'ArrowLeft') { cursor = cursor % n === 0 ? cursor + n - 1 : cursor - 1; hover = -1; }
  else if (k === 'ArrowRight') { cursor = cursor % n === n - 1 ? cursor - n + 1 : cursor + 1; hover = -1; }
  else if (k === 'ArrowUp') { cursor = (cursor - n + n * n) % (n * n); hover = -1; }
  else if (k === 'ArrowDown') { cursor = (cursor + n) % (n * n); hover = -1; }
  else if (k === ' ' || k === 'Enter') { act(cursor); e.preventDefault(); }
  else return;
  if (state === 'ready') { /* 键盘首次动作也会布雷 */ }
});

/* ==================== 启动 ==================== */
resize();
window.addEventListener('resize', resize);
for (const b of diffEl.querySelectorAll('button')) b.classList.toggle('active', b.dataset.diff === diff);
reset();
state = 'intro';
showIntro();
hud();
raf = requestAnimationFrame(frame);

})();
