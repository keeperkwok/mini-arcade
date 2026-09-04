(() => {
'use strict';

/* ==================== 世界与水果表 ==================== */
const WORLD_W = 460, WORLD_H = 575;
const DANGER_Y = 88;          // 危险线
const SPAWN_Y = 54;           // 投放高度
const GRAVITY = 1750;
const STEP = 1 / 180;         // 固定物理步长
const DROP_COOLDOWN = 0.26;
const DANGER_LIMIT = 1.15;    // 越线滞留上限(秒)
const COMBO_WINDOW = 0.9;

const FRUITS = [
  { e: '🍒', name: '樱桃',   r: 17,  c1: '#fecaca', c2: '#dc2626' },
  { e: '🍓', name: '草莓',   r: 23,  c1: '#fecdd3', c2: '#e11d48' },
  { e: '🍇', name: '葡萄',   r: 29,  c1: '#ddd6fe', c2: '#7c3aed' },
  { e: '🍊', name: '橘子',   r: 36,  c1: '#fed7aa', c2: '#ea580c' },
  { e: '🍋', name: '柠檬',   r: 44,  c1: '#fef08a', c2: '#ca8a04' },
  { e: '🍎', name: '苹果',   r: 53,  c1: '#fecaca', c2: '#b91c1c' },
  { e: '🍐', name: '雪梨',   r: 62,  c1: '#ecfccb', c2: '#65a30d' },
  { e: '🍑', name: '蜜桃',   r: 72,  c1: '#fbcfe8', c2: '#db2777' },
  { e: '🥥', name: '椰子',   r: 83,  c1: '#e7e5e4', c2: '#78716c' },
  { e: '🍈', name: '哈密瓜', r: 95,  c1: '#bbf7d0', c2: '#16a34a' },
  { e: '🍉', name: '大西瓜', r: 108, c1: '#86efac', c2: '#15803d' },
];
const MAX_STAGE = FRUITS.length - 1;
const SPAWN_WEIGHTS = [34, 28, 22, 16];
const PTS = FRUITS.map((_, s) => ((s + 1) * (s + 2) / 2) * 5);

/* ==================== 元素 ==================== */
const canvas = document.getElementById('stage-canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const nextEl = document.getElementById('next');
const stageEl = document.getElementById('stage');
const btnSound = document.getElementById('btnSound');
const btnPause = document.getElementById('btnPause');
const btnRestart = document.getElementById('btnRestart');

/* ==================== 状态 ==================== */
let fruits = [];
let parts = [];
let pops = [];
let score = 0;
let best = Number(localStorage.getItem('xigua.best') || 0);
let maxStage = 0;
let merges = 0;
let cur = 0, next = 0;
let aimX = WORLD_W / 2;
let cool = 0;
let acc = 0, last = 0;
let over = false, paused = false, started = false;
let dangerT = 0;
let combo = 0, comboT = 0, bestCombo = 0;
let shake = 0, flash = 0;
let scale = 1;
let muted = localStorage.getItem('xigua.muted') === '1';

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
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}
function noise(dur, vol) {
  if (muted || !audioCtx) return;
  const n = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = audioCtx.createBufferSource();
  const g = audioCtx.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(audioCtx.destination);
  src.start();
}
const soundDrop = () => tone(300, 0.08, 'sine', 0.08, 0, 170);
const soundMerge = (s) => { tone(240 + s * 90, 0.12, 'triangle', 0.13, 0, 420 + s * 120); noise(0.05, 0.05); };
const soundBig = (s) => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, i * 0.06)); noise(0.16, 0.08); };
const soundWin = () => [659, 784, 988, 1319, 1568].forEach((f, i) => tone(f, 0.2, 'triangle', 0.13, i * 0.09));
const soundOver = () => { tone(320, 0.7, 'sawtooth', 0.13, 0, 50); noise(0.4, 0.07); };
const unlockAudio = () => {
  ensureAudio();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

/* ==================== 工具 ==================== */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rnd = (n) => Math.floor(Math.random() * n);
function rollStage() {
  let total = 0;
  for (const w of SPAWN_WEIGHTS) total += w;
  let x = Math.random() * total;
  for (let i = 0; i < SPAWN_WEIGHTS.length; i++) {
    x -= SPAWN_WEIGHTS[i];
    if (x < 0) return i;
  }
  return 0;
}
function makeFruit(s, x, y, vx, vy) {
  const f = FRUITS[s];
  return {
    s, x, y, vx, vy, r: f.r, m: f.r * f.r,
    grace: 0.55, popIn: 0.16, spin: (Math.random() - 0.5) * 0.5, rot: Math.random() * 6.28,
    dead: false,
  };
}

/* ==================== 画布尺寸 ==================== */
function resize() {
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width || WORLD_W;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssW * (WORLD_H / WORLD_W) * dpr));
  scale = cssW / WORLD_W;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
}
window.addEventListener('resize', resize);

/* ==================== 物理 ==================== */
function integrate(h) {
  for (const f of fruits) {
    if (f.dead) continue;
    f.vy += GRAVITY * h;
    f.vx *= 0.9992;
    f.x += f.vx * h;
    f.y += f.vy * h;
    f.rot += f.spin * h;
    if (f.grace > 0) f.grace -= h;
    if (f.popIn > 0) f.popIn -= h;

    if (f.x - f.r < 0) { f.x = f.r; f.vx = Math.abs(f.vx) * 0.22; }
    if (f.x + f.r > WORLD_W) { f.x = WORLD_W - f.r; f.vx = -Math.abs(f.vx) * 0.22; }
    if (f.y + f.r > WORLD_H) {
      f.y = WORLD_H - f.r;
      if (f.vy > 0) f.vy = -f.vy * 0.06;
      if (Math.abs(f.vy) < 30) f.vy = 0;
      f.vx *= 0.84;
      f.spin *= 0.8;
    }
    if (f.y - f.r < -160) { f.y = -160 + f.r; f.vy = Math.abs(f.vy) * 0.2; }
  }
}

function resolvePair(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const rr = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  let d = Math.sqrt(d2);
  let nx, ny;
  if (d < 0.0001) { d = 0.0001; nx = 0; ny = -1; } else { nx = dx / d; ny = dy / d; }
  const im1 = 1 / a.m, im2 = 1 / b.m, imSum = im1 + im2;
  const pen = rr - d;
  const corr = (pen / imSum) * 0.62;
  a.x -= nx * corr * im1; a.y -= ny * corr * im1;
  b.x += nx * corr * im2; b.y += ny * corr * im2;

  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn > 0) return;
  const j = (-(1 + 0.05) * vn) / imSum;
  a.vx -= j * nx * im1; a.vy -= j * ny * im1;
  b.vx += j * nx * im2; b.vy += j * ny * im2;
  const tx = -ny, ty = nx;
  const vt = rvx * tx + rvy * ty;
  const jt = (-vt / imSum) * 0.3;
  a.vx -= jt * tx * im1; a.vy -= jt * ty * im1;
  b.vx += jt * tx * im2; b.vy += jt * ty * im2;
}

function solveCollisions() {
  const n = fruits.length;
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < n; i++) {
      const a = fruits[i];
      if (a.dead) continue;
      for (let j = i + 1; j < n; j++) {
        const b = fruits[j];
        if (b.dead) continue;
        resolvePair(a, b);
      }
    }
  }
}

function overlapsNew(f) {
  for (const o of fruits) {
    if (o === f || o.dead) continue;
    const dx = o.x - f.x, dy = o.y - f.y, rr = (o.r + f.r) * 0.82;
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}

function tryMerges() {
  let again = true, guard = 0;
  while (again && guard++ < 24) {
    again = false;
    outer:
    for (let i = 0; i < fruits.length; i++) {
      const a = fruits[i];
      if (a.dead) continue;
      for (let j = i + 1; j < fruits.length; j++) {
        const b = fruits[j];
        if (b.dead || b.s !== a.s) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        mergePair(a, b);
        again = true;
        break outer;
      }
    }
  }
  if (fruits.some((f) => f.dead)) fruits = fruits.filter((f) => !f.dead);
}

function mergePair(a, b) {
  a.dead = b.dead = true;
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
  const vx = (a.vx + b.vx) / 2, vy = (a.vy + b.vy) / 2 - 40;
  merges++;
  comboT = COMBO_WINDOW;
  combo++;
  if (combo > bestCombo) bestCombo = combo;

  if (a.s >= MAX_STAGE) {
    // 两颗大西瓜相遇 → 一起爆开
    gain(500, x, y, '双瓜爆炸 +500');
    burst(x, y, 26, FRUITS[MAX_STAGE]);
    shakeIt(9); flash = 0.5;
    soundBig(MAX_STAGE);
    return;
  }
  const ns = a.s + 1;
  const f = makeFruit(ns, x, y, vx, vy);
  f.grace = 0.2;
  fruits.push(f);
  if (ns > maxStage) {
    maxStage = ns;
    stageEl.textContent = FRUITS[ns].e;
  }
  let pts = PTS[ns];
  if (combo > 1) pts += (combo - 1) * 12;
  gain(pts, x, y, combo > 1 ? 'x' + combo + ' 连锁 +' + pts : '+' + pts);
  burst(x, y, 8 + ns * 2, FRUITS[ns]);
  soundMerge(ns);
  if (ns >= 7) { soundBig(ns); shakeIt(4 + ns * 0.6); flash = ns >= MAX_STAGE ? 0.6 : 0.25; }
  if (ns === MAX_STAGE) { soundWin(); shakeIt(14); flash = 0.8; if (navigator.vibrate) navigator.vibrate([25, 40, 25, 40, 60]); }
  else if (navigator.vibrate) navigator.vibrate(8 + ns);
}

function bump(el) {
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function gain(pts, x, y, text) {
  score += pts;
  scoreEl.textContent = score;
  bump(scoreEl);
  popAt(x, y, text);
  if (score > best) {
    best = score;
    bestEl.textContent = best;
    localStorage.setItem('xigua.best', String(best));
  }
}

function step(h) {
  integrate(h);
  // 先判合成再分离,否则同阶段水果永远只会被推到"刚好相切"而合不成
  tryMerges();
  solveCollisions();
}

/* ==================== 特效 ==================== */
function burst(x, y, count, fruit) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 240;
    parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      life: 0.4 + Math.random() * 0.45, max: 0.85,
      size: 2 + Math.random() * 4, color: Math.random() < 0.5 ? fruit.c1 : fruit.c2,
    });
  }
}
function popAt(x, y, text) {
  pops.push({ x, y, text, life: 0.95, max: 0.95 });
}
function shakeIt(v) { shake = Math.max(shake, v); }

function updateFx(dt) {
  for (const p of parts) {
    p.vy += 900 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  if (parts.length) parts = parts.filter((p) => p.life > 0);
  for (const p of pops) { p.y -= 42 * dt; p.life -= dt; }
  if (pops.length) pops = pops.filter((p) => p.life > 0);
  if (shake > 0) shake = Math.max(0, shake - dt * 26);
  if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
  if (comboT > 0) {
    comboT -= dt;
    if (comboT <= 0) combo = 0;
  }
}

function checkDanger(dt) {
  let hot = false;
  for (const f of fruits) {
    if (f.dead || f.grace > 0) continue;
    if (f.y - f.r < DANGER_Y && Math.abs(f.vy) < 70) { hot = true; break; }
  }
  dangerT = hot ? dangerT + dt : Math.max(0, dangerT - dt * 2);
  if (dangerT >= DANGER_LIMIT) gameOver();
}

/* ==================== 渲染 ==================== */
function draw() {
  ctx.save();
  if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  ctx.clearRect(-20, -20, WORLD_W + 40, WORLD_H + 40);

  // 背景与容器
  const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  bg.addColorStop(0, '#0e1729');
  bg.addColorStop(1, '#070c17');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
  ctx.lineWidth = 1;
  for (let gx = 46; gx < WORLD_W; gx += 46) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, WORLD_H); ctx.stroke();
  }

  // 危险线
  const pulse = dangerT > 0 ? 0.35 + 0.45 * Math.sin(Date.now() / 90) : 0.3;
  ctx.save();
  ctx.setLineDash([9, 8]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = dangerT > 0 ? 'rgba(248, 113, 113,' + pulse + ')' : 'rgba(251, 191, 36, 0.3)';
  ctx.beginPath(); ctx.moveTo(0, DANGER_Y); ctx.lineTo(WORLD_W, DANGER_Y); ctx.stroke();
  ctx.restore();
  if (dangerT > 0) {
    const g = ctx.createLinearGradient(0, 0, 0, DANGER_Y);
    g.addColorStop(0, 'rgba(239, 68, 68, 0.22)');
    g.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD_W, DANGER_Y);
    ctx.fillStyle = 'rgba(252, 165, 165, 0.9)';
    ctx.font = '700 13px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ 越线 ' + Math.round((1 - dangerT / DANGER_LIMIT) * 100) + '%', WORLD_W / 2, DANGER_Y - 10);
  }

  // 水果
  for (const f of fruits) drawFruit(f);

  // 投放指引
  if (!over && !paused) {
    const r = FRUITS[cur].r;
    const x = clamp(aimX, r, WORLD_W - r);
    ctx.save();
    ctx.setLineDash([4, 9]);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.32)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, SPAWN_Y + r); ctx.lineTo(x, WORLD_H); ctx.stroke();
    ctx.restore();
    const bob = Math.sin(Date.now() / 320) * 3;
    drawFruitAt(cur, x, SPAWN_Y + bob, 1, 0);
  }

  // 粒子
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, 6.2832);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 飘字
  for (const p of pops) {
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = a;
    ctx.font = '800 ' + (15 + (1 - a) * 4) + 'px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(4, 8, 16, 0.85)';
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.text.indexOf('连锁') > 0 ? '#fdba74' : '#a7f3d0';
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;

  // 连锁 HUD
  if (combo > 1 && comboT > 0) {
    ctx.font = '800 22px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(253, 186, 116,' + clamp(comboT / COMBO_WINDOW, 0, 1) + ')';
    ctx.fillText('COMBO x' + combo, 14, 30);
  }

  if (flash > 0.01) {
    ctx.fillStyle = 'rgba(255, 255, 255,' + flash * 0.25 + ')';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }
  ctx.restore();
}

function drawFruit(f) {
  const k = f.popIn > 0 ? 1 + 0.2 * Math.sin((1 - f.popIn / 0.16) * Math.PI) : 1;
  drawFruitAt(f.s, f.x, f.y, k, f.rot);
}

function drawFruitAt(s, x, y, k, rot) {
  const f = FRUITS[s];
  const r = f.r * k;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot * 0.25);
  const g = ctx.createRadialGradient(-r * 0.32, -r * 0.36, r * 0.15, 0, 0, r);
  g.addColorStop(0, f.c1);
  g.addColorStop(1, f.c2);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 6.2832);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.strokeStyle = 'rgba(4, 8, 16, 0.4)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 0.36, r * 0.22, 0, 6.2832);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fill();
  ctx.font = Math.round(r * 1.34) + 'px "Apple Color Emoji", "Segoe UI Emoji", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(f.e, 0, r * 0.06);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

/* ==================== 流程 ==================== */
function reset() {
  fruits = [];
  parts = [];
  pops = [];
  score = 0;
  merges = 0;
  maxStage = 0;
  combo = 0; comboT = 0; bestCombo = 0;
  dangerT = 0;
  cool = 0;
  over = false; paused = false; started = true;
  cur = rollStage();
  next = rollStage();
  aimX = WORLD_W / 2;
  scoreEl.textContent = '0';
  bestEl.textContent = best;
  stageEl.textContent = FRUITS[0].e;
  nextEl.textContent = FRUITS[next].e;
  btnPause.textContent = '⏸';
  btnPause.classList.remove('active');
  hideOverlay();
}

function drop() {
  if (over || paused || cool > 0) return;
  const r = FRUITS[cur].r;
  const x = clamp(aimX, r, WORLD_W - r);
  const f = makeFruit(cur, x, SPAWN_Y, 0, 140);
  fruits.push(f);
  if (overlapsNew(f)) { gameOver(); return; }
  ensureAudio();
  soundDrop();
  cur = next;
  next = rollStage();
  nextEl.textContent = FRUITS[next].e;
  cool = DROP_COOLDOWN;
  f.grace = 0.6;
}

function gameOver() {
  if (over) return;
  over = true;
  soundOver();
  shakeIt(12);
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
  const isRec = score >= best && score > 0;
  setTimeout(() => showOverlay(overHTML(isRec)), 520);
}

function overHTML(isRec) {
  return '<div class="ov-emoji">' + FRUITS[maxStage].e + '</div>' +
    '<h2>' + (isRec ? '新纪录!' : '游戏结束') + '</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">最大 ' + FRUITS[maxStage].name + ' · 合成 ' + merges + ' 次 · 最高连锁 x' + bestCombo + '</p>' +
    '<p class="hint">历史最高 <b>' + best + '</b> 分</p>' +
    '<button class="primary" data-act="again">再来一局</button>';
}

function showOverlay(html) { overlayContent.innerHTML = html; overlay.classList.add('show'); }
function hideOverlay() { overlay.classList.remove('show'); }

function togglePause(force) {
  if (over) return;
  paused = force === undefined ? !paused : force;
  btnPause.textContent = paused ? '▶' : '⏸';
  btnPause.classList.toggle('active', paused);
  if (paused) showOverlay('<div class="ov-emoji">⏸️</div><h2>已暂停</h2><p class="hint">点继续或按 <kbd>P</kbd> 回到果园</p><button class="primary" data-act="resume">继续</button>');
  else hideOverlay();
}

/* ==================== 主循环 ==================== */
function frame(t) {
  const dt = Math.max(0, Math.min(0.05, (t - last) / 1000 || 0));
  last = t;
  if (started && !over && !paused) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n++ < 16) { step(STEP); acc -= STEP; }
    if (cool > 0) cool = Math.max(0, cool - dt);
    updateFx(dt);
    if (!over) checkDanger(dt);
  }
  draw();
  requestAnimationFrame(frame);
}

/* ==================== 输入 ==================== */
function worldX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) / (rect.width / WORLD_W);
}

canvas.addEventListener('pointermove', (e) => {
  if (over || paused) return;
  aimX = clamp(worldX(e.clientX), 0, WORLD_W);
});
canvas.addEventListener('pointerdown', (e) => {
  ensureAudio();
  if (over || paused) return;
  aimX = clamp(worldX(e.clientX), 0, WORLD_W);
  if (canvas.setPointerCapture && e.pointerId !== undefined) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (over || paused) return;
  aimX = clamp(worldX(e.clientX), 0, WORLD_W);
  drop();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'again') reset();
  else if (btn.dataset.act === 'resume') togglePause(false);
});

btnRestart.addEventListener('click', reset);
btnPause.addEventListener('click', () => togglePause());
btnSound.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('xigua.muted', muted ? '1' : '0');
  btnSound.textContent = muted ? '🔇' : '🔊';
});

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === 'ArrowLeft') { aimX = clamp(aimX - 16, 0, WORLD_W); e.preventDefault(); }
  else if (k === 'ArrowRight') { aimX = clamp(aimX + 16, 0, WORLD_W); e.preventDefault(); }
  else if (k === ' ' || k === 'Enter' || k === 'ArrowDown') { ensureAudio(); drop(); e.preventDefault(); }
  else if (k === 'p' || k === 'P') togglePause();
  else if (k === 'r' || k === 'R') reset();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && !over) togglePause(true);
});

/* ==================== 启动 ==================== */
btnSound.textContent = muted ? '🔇' : '🔊';
resize();
reset();
requestAnimationFrame((t) => { last = t; frame(t); });

})();
