(() => {
'use strict';

/* 幸运弹珠台：每轮若干颗球，拖拽瞄准发射，撞钉加分、进槽翻倍；
   打完后若达到目标分就能三选一强化，越滚越大，达不到就结束。 */

const W = 460, H = 620;
const BIN_Y = 540;
const LAUNCH = { x: W / 2, y: 42 };
const GRAVITY = 1500;
const STEP = 1 / 180;
const BALL_R = 8;
const MAX_BALLS = 16;
const POWER = 620;
const MAX_ANGLE = 1.15;           // 与竖直方向的最大夹角(弧度)
const BIN_MUL = [5, 3, 2, 1, 0.5, 0.5, 1, 2, 3, 5];
const PEG_COLORS = {
  gray: ['#94a3b8', '#475569'], gold: ['#fde68a', '#d97706'], blue: ['#a5f3fc', '#0891b2'],
  purple: ['#ddd6fe', '#7c3aed'], red: ['#fecaca', '#dc2626'],
};

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const overlayEl = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const roundEl = document.getElementById('round');
const turnEl = document.getElementById('turn');
const scoreEl = document.getElementById('score');
const goalEl = document.getElementById('goal');
const ballsEl = document.getElementById('ballsLeft');
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');
const btnFire = document.getElementById('btnFire');
const btnAimL = document.getElementById('btnAimL');
const btnAimR = document.getElementById('btnAimR');

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
};
const sfx = window.Sfx.create({ storageKey: 'plinko.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

/* ==================== 状态 ==================== */
let pegs = [];
let balls = [];
let parts = [];
let pops = [];
let acc = 0;
let last = 0;
let phase = 'intro';       // intro | aim | rolling | cards | over
let round = 1;
let roundScore = 0;
let total = 0;
let target = 60;
let ballsLeft = 3;
let angle = 0;
let aiming = false;
let shake = 0;
let flash = 0;
let combo = 0;
let comboT = 0;

// 可被强化卡改动的成长值
let S = {};
function freshStats() {
  S = { ballsPer: 3, basePts: 2, rest: 0.52, goldP: 0.1, splitP: 0.07, edgeMul: 1, guide: 0, targetMul: 1, blueP: 0.09, redP: 0.05 };
}
freshStats();

const CARDS = [
  { id: 'ball', e: '⚪', n: '多带一球', d: '每轮球数 +1', w: 10, cap: 6, apply() { S.ballsPer += 1; } },
  { id: 'base', e: '✨', n: '钉伤提升', d: '每次撞钉 +1 分', w: 10, cap: 8, apply() { S.basePts += 1; } },
  { id: 'gold', e: '🥇', n: '点金手', d: '金钉更常见', w: 9, cap: 5, apply() { S.goldP += 0.07; } },
  { id: 'bounce', e: '🏀', n: '橡胶涂层', d: '弹力更强，撞钉更多', w: 9, cap: 5, apply() { S.rest += 0.07; } },
  { id: 'split', e: '🔮', n: '细胞分裂', d: '分裂钉更常见', w: 8, cap: 4, apply() { S.splitP += 0.05; } },
  { id: 'edge', e: '🎯', n: '边缘加成', d: '两侧高分槽 ×1.4', w: 8, cap: 4, apply() { S.edgeMul *= 1.4; } },
  { id: 'aim', e: '🧲', n: '制导球', d: '球会飘向外侧高分槽', w: 7, cap: 3, apply() { S.guide += 1; } },
  { id: 'blue', e: '💠', n: '倍率宝石', d: '蓝钉更常见', w: 7, cap: 4, apply() { S.blueP += 0.06; } },
  { id: 'cheap', e: '🕊️', n: '减压', d: '目标分 -12%', w: 6, cap: 3, rare: true, apply() { S.targetMul *= 0.88; } },
  { id: 'luck', e: '🌟', n: '幸运星', d: '立刻把 5 颗钉子点成金', w: 6, cap: 9, rare: true, apply() { turnGold(5); } },
];
const taken = {};

/* ==================== 盘面 ==================== */
function rollType() {
  const r = Math.random();
  if (r < S.goldP) return 'gold';
  if (r < S.goldP + S.blueP) return 'blue';
  if (r < S.goldP + S.blueP + S.splitP) return 'purple';
  if (r < S.goldP + S.blueP + S.splitP + S.redP) return 'red';
  return 'gray';
}

function layoutPegs() {
  pegs = [];
  const rows = 9, top = 128, dy = 44;
  for (let r = 0; r < rows; r++) {
    const y = top + r * dy;
    const cols = 8 + (r % 2);
    const gap = W / (cols + 1);
    for (let c = 1; c <= cols; c++) {
      pegs.push({ x: c * gap, y, r: 6.5, type: rollType(), hit: 0, dead: false });
    }
  }
}

function turnGold(k) {
  const pool = pegs.filter((p) => !p.dead && p.type === 'gray');
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  for (const p of pool.slice(0, k)) p.type = 'gold';
}

const binW = () => W / BIN_MUL.length;
const binValue = (i) => {
  const m = BIN_MUL[i];
  return (i <= 1 || i >= BIN_MUL.length - 2) ? m * S.edgeMul : m;
};

/* ==================== 发射与物理 ==================== */
function fire() {
  if (phase !== 'aim' || ballsLeft <= 0) return;
  ballsLeft--;
  const a = angle;
  const dirx = Math.sin(a), diry = Math.cos(a);
  balls.push({
    x: LAUNCH.x + dirx * 16, y: LAUNCH.y + diry * 16,
    vx: dirx * POWER, vy: diry * POWER,
    r: BALL_R, m: 1, pts: 0, mult: 1, t: 0, dead: false, trail: [],
  });
  sfx.tone(420, 0.07, 'triangle', 0.1, 0, 700);
  phase = 'rolling';
  hud();
}

function integrate(h) {
  for (const b of balls) {
    if (b.dead) continue;
    b.vy += GRAVITY * h;
    if (S.guide && b.y > 200) b.vx += Math.sign(b.x - W / 2 || 1) * 26 * S.guide * h;
    b.vx *= 0.9995;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.t += h;
    if (b.trail.length > 10 || (b.trail.length && ((b.x * 7 + b.y * 13) | 0) % 3 === 0)) b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 12) b.trail.shift();

    if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * S.rest; }
    if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * S.rest; }
    if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * S.rest; }

    for (const p of pegs) {
      if (p.dead) continue;
      const dx = b.x - p.x, dy = b.y - p.y, rr = b.r + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const nx = dx / d, ny = dy / d;
      b.x = p.x + nx * rr; b.y = p.y + ny * rr;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        const j = -(1 + S.rest) * vn;
        b.vx += j * nx; b.vy += j * ny;
      }
      hitPeg(b, p);
    }
    // 底部槽壁（用一列小圆当作静态障碍）
    for (const d of dividers()) {
      const dx = b.x - d.x, dy = b.y - d.y, rr = b.r + d.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const dist = Math.sqrt(d2) || 0.0001;
      const nx = dx / dist, ny = dy / dist;
      b.x = d.x + nx * rr; b.y = d.y + ny * rr;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { const j = -(1 + S.rest * 0.7) * vn; b.vx += j * nx; b.vy += j * ny; }
    }
    if (b.y + b.r >= H - 6 || b.t > 12) land(b);
  }
  // 球撞球
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.dead) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b2 = balls[j];
      if (b2.dead) continue;
      const dx = b2.x - a.x, dy = b2.y - a.y, rr = a.r + b2.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const nx = dx / d, ny = dy / d;
      const pen = ((rr - d) / 2) * 0.8;
      a.x -= nx * pen; a.y -= ny * pen; b2.x += nx * pen; b2.y += ny * pen;
      const vn = (b2.vx - a.vx) * nx + (b2.vy - a.vy) * ny;
      if (vn < 0) {
        const jimp = (-(1 + 0.6) * vn) / 2;
        a.vx -= jimp * nx; a.vy -= jimp * ny;
        b2.vx += jimp * nx; b2.vy += jimp * ny;
      }
    }
  }
}

let divCache = null;
function dividers() {
  if (divCache) return divCache;
  divCache = [];
  for (let k = 1; k < BIN_MUL.length; k++) {
    const x = k * binW();
    for (let y = BIN_Y + 10; y < H - 4; y += 12) divCache.push({ x, y, r: 4.5 });
  }
  return divCache;
}

function hitPeg(b, p) {
  if (p.hit > 0) return;
  p.hit = 1;
  combo = comboT > 0 ? combo + 1 : 1;
  comboT = 0.6;
  const gain = Math.round(S.basePts * b.mult * (1 + Math.min(combo, 20) * 0.05));
  b.pts += gain;
  pop('+' + gain, p.x, p.y);
  spark(p.x, p.y, PEG_COLORS[p.type][0], p.type === 'gray' ? 4 : 10);
  if (p.type === 'gold') {
    p.dead = true;
    sfx.tone(1180, 0.1, 'triangle', 0.11, 0, 1600);
  } else if (p.type === 'blue') {
    b.mult = Math.min(12, b.mult * 2);
    p.dead = true;
    sfx.tone(880, 0.12, 'sine', 0.1, 0, 1320);
    pop('×' + b.mult, p.x, p.y - 14);
  } else if (p.type === 'purple') {
    p.type = 'gray';
    if (balls.length < MAX_BALLS) {
      balls.push({ x: p.x, y: p.y - 2, vx: (Math.random() - 0.5) * 260, vy: -140, r: BALL_R, m: 1, pts: 0, mult: b.mult, t: 0, dead: false, trail: [] });
    }
    sfx.tone(660, 0.12, 'square', 0.08, 0, 990);
  } else if (p.type === 'red') {
    p.dead = true;
    shake = 1;
    flash = 0.5;
    sfx.noise(0.35, 0.2);
    for (const q of pegs) {
      if (q.dead || q === p) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y) < 58) {
        q.dead = true;
        b.pts += Math.round(S.basePts * 2);
        spark(q.x, q.y, PEG_COLORS.red[0], 4);
      }
    }
  } else {
    sfx.tone(300 + Math.random() * 120 + Math.min(combo, 14) * 26, 0.045, 'triangle', 0.07);
  }
}

function land(b) {
  if (b.dead) return;
  b.dead = true;
  const i = Math.max(0, Math.min(BIN_MUL.length - 1, Math.floor(b.x / binW())));
  const gain = Math.round(Math.max(1, b.pts) * binValue(i));
  total += gain;
  roundScore += gain;
  b.pts = 0;
  spark(b.x, H - 20, i <= 1 || i >= BIN_MUL.length - 2 ? PEG_COLORS.gold[0] : PEG_COLORS.blue[0], 12);
  pop((BIN_MUL[i] >= 3 ? '爆!' : '') + '+' + gain, b.x, H - 34);
  sfx.tone(520 + (BIN_MUL[i] >= 3 ? 400 : 0), 0.12, 'triangle', 0.11, 0, 900);
  hud();
}

function pop(text, x, y) { pops.push({ x, y, life: 0.9, text }); }

function spark(x, y, color, n) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * 6.283, s = 60 + Math.random() * 200;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.4 + Math.random() * 0.4, color });
  }
}

/* ==================== 轮次流程 ==================== */
function startRound() {
  balls = [];
  ballsLeft = S.ballsPer;
  roundScore = 0;
  combo = 0;
  layoutPegs();
  phase = 'aim';
  hideOverlay();
  hud();
}

function endRound() {
  if (roundScore >= target) { showCards(); return; }
  gameOver();
}

function nextRound() {
  round++;
  target = Math.round((60 + Math.pow(round, 1.62) * 46) * S.targetMul);
  startRound();
}

function showCards() {
  phase = 'cards';
  const pool = CARDS.filter((c) => (taken[c.id] || 0) < (c.cap || 99));
  const picks = [];
  const bag = pool.slice();
  while (picks.length < 3 && bag.length) {
    let sum = 0;
    for (const c of bag) sum += c.w;
    let r = Math.random() * sum;
    let idx = 0;
    for (let i = 0; i < bag.length; i++) { r -= bag[i].w; if (r <= 0) { idx = i; break; } }
    picks.push(bag.splice(idx, 1)[0]);
  }
  cardChoices = picks;
  const html = picks.map((c, i) =>
    '<button class="pcard' + (c.rare ? ' rare' : '') + '" data-act="card' + i + '">' +
    '<span class="ce">' + c.e + '</span><span class="cn">' + c.n + '</span>' +
    '<span class="cd">' + c.d + '</span></button>').join('');
  showOverlay(
    '<div class="ov-emoji">🎁</div><h2>第 ' + round + ' 轮达成</h2>' +
    '<p class="final-score">' + roundScore + '<span> / ' + target + ' 分</span></p>' +
    '<p class="final-sub">挑一张强化，下一轮目标 ' + Math.round((60 + Math.pow(round + 1, 1.62) * 46) * S.targetMul) + ' 分</p>' +
    '<div class="cards">' + html + '</div>');
  sfx.melody([659, 880, 1175], 0.08);
}

let cardChoices = [];

function pickCard(i) {
  const c = cardChoices[i];
  if (!c) return;
  taken[c.id] = (taken[c.id] || 0) + 1;
  c.apply();
  sfx.tone(760, 0.09, 'triangle', 0.1, 0, 1100);
  nextRound();
}

function gameOver() {
  phase = 'over';
  const pb = Number(store.get('plinko.best') || 0);
  const pr = Number(store.get('plinko.round') || 0);
  if (total > pb) store.set('plinko.best', String(total));
  if (round > pr) store.set('plinko.round', String(round));
  sfx.tone(220, 0.5, 'sawtooth', 0.12, 0, 70);
  showOverlay(
    '<div class="ov-emoji">💔</div><h2>第 ' + round + ' 轮止步</h2>' +
    '<p class="final-score">' + total + '<span> 分</span></p>' +
    '<p class="final-sub">本轮 ' + roundScore + '/' + target + ' · 最佳 ' + Math.max(pb, total) +
    ' 分 · 最远第 ' + Math.max(pr, round) + ' 轮</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="home">回游戏厅</button></div>');
}

function newGame() {
  freshStats();
  for (const k of Object.keys(taken)) delete taken[k];
  round = 1;
  total = 0;
  target = 60;
  parts = []; pops = []; balls = [];
  store.set('plinko.plays', String(Number(store.get('plinko.plays') || 0) + 1));
  startRound();
}

/* ==================== HUD ==================== */
function livePts() {
  let n = 0;
  for (const b of balls) if (!b.dead) n += b.pts;
  return n;
}

function hud() {
  const shown = roundScore + livePts();
  roundEl.textContent = shown + '/' + target;
  turnEl.textContent = String(round);
  scoreEl.textContent = String(total);
  goalEl.style.width = Math.min(100, Math.round((shown / target) * 100)) + '%';
  ballsEl.textContent = '球 ×' + ballsLeft;
}

function showOverlay(html) { overlayContent.innerHTML = html; overlayEl.classList.add('show'); }
function hideOverlay() { overlayEl.classList.remove('show'); }

function showIntro() {
  showOverlay(
    '<div class="ov-emoji">🎰</div><h2>幸运弹珠台</h2>' +
    '<p class="hint">拖拽瞄准发射弹珠，撞钉加分、落进外侧高分槽。<br>' +
    '每轮打满球后结算：达到目标分就能<b>三选一</b>强化，<br>越滚越大，达不到就结束。</p>' +
    '<div class="legend"><i class="g">● 撞钉 +分</i><i class="y">◆ 金钉 6 分后消失</i><i class="b">◆ 蓝钉 本球翻倍</i>' +
    '<i class="p">◆ 紫钉 分裂</i><i class="r">◆ 红钉 引爆周围</i></div>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开一局</button></div>');
}

/* ==================== 画面 ==================== */
function resize() {
  const rect = cv.getBoundingClientRect();
  const cssW = rect.width || W;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(cssW * dpr));
  cv.height = Math.max(1, Math.round(cssW * (H / W) * dpr));
  const k = cv.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b1424');
  g.addColorStop(1, '#060b16');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (shake > 0) {
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake * 10, (Math.random() - 0.5) * shake * 10);
  }

  // 槽位
  const bw = binW();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < BIN_MUL.length; i++) {
    const hot = i <= 1 || i >= BIN_MUL.length - 2;
    ctx.fillStyle = hot ? 'rgba(251, 191, 36, 0.12)' : 'rgba(34, 211, 238, 0.06)';
    ctx.fillRect(i * bw + 2, BIN_Y + 8, bw - 4, H - BIN_Y - 12);
    ctx.fillStyle = hot ? '#fbbf24' : '#67e8f9';
    ctx.font = '700 15px ui-monospace, Menlo, monospace';
    const v = binValue(i);
    ctx.fillText('×' + (v % 1 ? v.toFixed(1) : v), i * bw + bw / 2, H - 22);
  }
  ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
  for (let k = 1; k < BIN_MUL.length; k++) {
    ctx.fillRect(k * bw - 3, BIN_Y + 6, 6, H - BIN_Y - 10);
  }

  // 钉子
  for (const p of pegs) {
    if (p.dead) continue;
    const col = PEG_COLORS[p.type];
    const glow = p.hit > 0 ? p.hit : 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + glow * 3.5, 0, 6.284);
    ctx.fillStyle = col[0];
    ctx.globalAlpha = 0.25 + glow * 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (p.type === 'gray' ? 0.62 : 0.78), 0, 6.284);
    ctx.fillStyle = col[1];
    ctx.fill();
    if (p.type !== 'gray') {
      ctx.strokeStyle = col[0];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.95, 0, 6.284);
      ctx.stroke();
    }
  }

  // 瞄准
  if (phase === 'aim' && ballsLeft > 0) {
    const dirx = Math.sin(angle), diry = Math.cos(angle);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.moveTo(LAUNCH.x, LAUNCH.y);
    let px = LAUNCH.x + dirx * 16, py = LAUNCH.y + diry * 16;
    let vx = dirx * POWER, vy = diry * POWER;
    for (let k = 0; k < 46; k++) {
      vy += GRAVITY * 0.022; px += vx * 0.022; py += vy * 0.022;
      if (px < 4 || px > W - 4 || py > H - 20) break;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(LAUNCH.x, LAUNCH.y, 13, 0, 6.284);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 12px ui-monospace, Menlo, monospace';
    ctx.fillText(String(ballsLeft), LAUNCH.x, LAUNCH.y);
  }

  // 球
  for (const b of balls) {
    if (b.dead) continue;
    for (let k = 0; k < b.trail.length; k++) {
      const t = b.trail[k];
      ctx.globalAlpha = (k / b.trail.length) * 0.35;
      ctx.beginPath();
      ctx.arc(t.x, t.y, b.r * (0.4 + (k / b.trail.length) * 0.6), 0, 6.284);
      ctx.fillStyle = '#a7f3d0';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const bg = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, b.r);
    bg.addColorStop(0, '#f8fafc');
    bg.addColorStop(1, b.mult > 1 ? '#22d3ee' : '#94a3b8');
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, 6.284);
    ctx.fillStyle = bg;
    ctx.fill();
    if (b.pts > 0) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = '700 11px ui-monospace, Menlo, monospace';
      ctx.fillText(String(b.pts), b.x, b.y - b.r - 8);
    }
  }

  // 粒子与飘字
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1.6, p.y - 1.6, 3.2, 3.2);
  }
  ctx.globalAlpha = 1;
  for (const p of pops) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 14px ui-monospace, Menlo, monospace';
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;

  if (shake > 0) ctx.restore();
  if (flash > 0) {
    ctx.fillStyle = 'rgba(251, 191, 36,' + (flash * 0.18).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

/* ==================== 主循环 ==================== */
function frame(t) {
  requestAnimationFrame(frame);
  const now = t || 0;
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0));
  last = now;
  if (phase === 'rolling' || phase === 'aim') {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 40) { integrate(STEP); acc -= STEP; }
    if (comboT > 0) { comboT = Math.max(0, comboT - dt); if (!comboT) combo = 0; }
    for (const p of pegs) if (p.hit > 0) p.hit = Math.max(0, p.hit - dt * 4);
    balls = balls.filter((b) => !b.dead);
    if (phase === 'rolling' && !balls.length) {
      if (ballsLeft > 0) phase = 'aim';
      else {
        phase = 'settling';
        setTimeout(() => { if (phase === 'settling') endRound(); }, 320);
      }
    }
  }
  for (const p of parts) { p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  parts = parts.filter((p) => p.life > 0);
  for (const p of pops) { p.y -= 34 * dt; p.life -= dt; }
  pops = pops.filter((p) => p.life > 0);
  if (shake > 0) shake = Math.max(0, shake - dt * 3.2);
  if (flash > 0) flash = Math.max(0, flash - dt * 1.8);
  draw();
}

/* ==================== 输入 ==================== */
function aimAt(ev) {
  const rect = cv.getBoundingClientRect();
  const x = ((ev.clientX || 0) - rect.left) / (rect.width || W) * W;
  const y = ((ev.clientY || 0) - rect.top) / (rect.width || W) * H;
  const dx = x - LAUNCH.x, dy = Math.max(20, y - LAUNCH.y);
  angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, Math.atan2(dx, dy)));
}

cv.addEventListener('pointerdown', (e) => {
  sfx.resume();
  if (phase !== 'aim') return;
  aiming = true;
  aimAt(e);
});
cv.addEventListener('pointermove', (e) => { if (aiming) aimAt(e); });
function release() {
  if (!aiming) return;
  aiming = false;
  if (phase === 'aim') fire();
}
cv.addEventListener('pointerup', release);
cv.addEventListener('pointercancel', release);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

btnFire.addEventListener('click', () => { sfx.resume(); if (phase === 'aim') fire(); });
btnAimL.addEventListener('click', () => { angle = Math.max(-MAX_ANGLE, angle - 0.09); });
btnAimR.addEventListener('click', () => { angle = Math.min(MAX_ANGLE, angle + 0.09); });

overlayEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const a = btn.dataset.act;
  if (a === 'start' || a === 'again') newGame();
  else if (a === 'home') location.href = '../index.html';
  else if (a.indexOf('card') === 0) pickCard(+a.slice(4));
});

btnNew.addEventListener('click', () => { newGame(); });
btnSound.addEventListener('click', () => { btnSound.textContent = sfx.toggle() ? '🔇' : '🔊'; });

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft') { angle = Math.max(-MAX_ANGLE, angle - 0.06); e.preventDefault(); }
  else if (k === 'ArrowRight') { angle = Math.min(MAX_ANGLE, angle + 0.06); e.preventDefault(); }
  else if (k === ' ' || k === 'Enter') { if (phase === 'aim') fire(); e.preventDefault(); }
});

/* ==================== 启动 ==================== */
resize();
window.addEventListener('resize', resize);
layoutPegs();
hud();
showIntro();
requestAnimationFrame(frame);

})();
