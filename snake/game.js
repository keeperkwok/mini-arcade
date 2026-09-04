(() => {
'use strict';

// ===================== 常量 =====================
const COLS = 21, ROWS = 21;
const BASE_INTERVAL = 150, MIN_INTERVAL = 68;
const SPEEDUP_PER_LEVEL = 12, FOODS_PER_LEVEL = 4;
const BONUS_EVERY = 5, BONUS_DURATION = 6500, BONUS_POINTS = 5;

// ===================== DOM =====================
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const boardWrap = document.querySelector('.board-wrap');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const levelEl = document.getElementById('level');
const btnPause = document.getElementById('btnPause');
const btnSound = document.getElementById('btnSound');
const dpad = document.getElementById('dpad');

// ===================== 状态 =====================
let cell = 24;
let state = 'menu'; // menu | running | paused | over
let snake = [], prevSnake = [];
let dir = { x: 1, y: 0 }, dirQueue = [];
let food = null, bonus = null;
let score = 0, foods = 0, level = 1, interval = BASE_INTERVAL;
let best = Number(localStorage.getItem('snake.best') || 0);
let muted = localStorage.getItem('snake.muted') === '1';
let lastTickTime = 0, lastT = 1, pausedAt = 0;
let shake = 0, prevNow = performance.now();
let particles = [];

// ===================== 工具 =====================
const lerp = (a, b, t) => a + (b - a) * t;
function norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }

// ===================== 音效 (WebAudio 合成) =====================
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
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
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}
const soundEat   = () => tone(500, 0.11, 'square', 0.13, 0, 760);
const soundBonus = () => { tone(660, 0.09, 'triangle', 0.16); tone(880, 0.09, 'triangle', 0.16, 0.08); tone(1174, 0.16, 'triangle', 0.16, 0.16); };
const soundLevel = () => { tone(587, 0.08, 'sine', 0.14); tone(880, 0.1, 'sine', 0.14, 0.07); };
const soundOver  = () => tone(320, 0.55, 'sawtooth', 0.15, 0, 65);
const soundStart = () => { tone(660, 0.07, 'sine', 0.12); tone(990, 0.09, 'sine', 0.1, 0.06); };

const unlockAudio = () => { ensureAudio(); window.removeEventListener('pointerdown', unlockAudio); window.removeEventListener('keydown', unlockAudio); };
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// ===================== 尺寸 =====================
function resize() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 10) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cell = rect.width / COLS;
}
new ResizeObserver(resize).observe(canvas);
resize();

// ===================== 游戏流程 =====================
function reset() {
  snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
  prevSnake = snake.map(s => ({ ...s }));
  dir = { x: 1, y: 0 };
  dirQueue = [];
  score = 0; foods = 0; level = 1;
  interval = BASE_INTERVAL;
  food = null; bonus = null;
  food = spawnCell();
  particles.length = 0;
  lastT = 1;
}

function spawnCell() {
  const taken = new Set(snake.map(s => s.x + ',' + s.y));
  if (food) taken.add(food.x + ',' + food.y);
  if (bonus) taken.add(bonus.x + ',' + bonus.y);
  const free = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!taken.has(x + ',' + y)) free.push({ x, y });
    }
  }
  return free.length ? free[(Math.random() * free.length) | 0] : null;
}

function start() {
  if (state === 'running') return;
  reset();
  state = 'running';
  hideOverlay();
  updateHUD(false);
  updatePauseIcon();
  lastTickTime = performance.now();
  lastT = 0;
  soundStart();
}

function pause() {
  if (state !== 'running') return;
  state = 'paused';
  pausedAt = performance.now();
  showOverlay(pauseHTML());
  updatePauseIcon();
}

function resume() {
  if (state !== 'paused') return;
  state = 'running';
  lastTickTime += performance.now() - pausedAt;
  hideOverlay();
  updatePauseIcon();
}

function handlePrimary() {
  if (state === 'running') pause();
  else if (state === 'paused') resume();
  else start();
}

function die() {
  state = 'over';
  lastT = 1;
  shake = 1;
  const h = snake[0];
  burst((h.x + 0.5) * cell, (h.y + 0.5) * cell, ['#f87171', '#fb923c', '#fda4af'], 26, 0.35);
  soundOver();
  const isNew = score > best;
  if (isNew) { best = score; localStorage.setItem('snake.best', String(best)); }
  updateHUD(false);
  updatePauseIcon();
  setTimeout(() => { if (state === 'over') showOverlay(overHTML(isNew)); }, 600);
}

// ===================== 逻辑步进 =====================
function step(now) {
  prevSnake = snake.map(s => ({ x: s.x, y: s.y }));

  while (dirQueue.length) {
    const d = dirQueue.shift();
    if (d.x !== -dir.x || d.y !== -dir.y) { dir = d; break; }
  }

  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) { die(); return; }

  const eatingFood = food && head.x === food.x && head.y === food.y;
  const eatingBonus = bonus && head.x === bonus.x && head.y === bonus.y;
  const grow = eatingFood || eatingBonus;
  const body = grow ? snake : snake.slice(0, -1);
  if (body.some(s => s.x === head.x && s.y === head.y)) { die(); return; }

  snake.unshift(head);
  if (!grow) snake.pop();

  if (eatingFood) onEatFood(now);
  else if (eatingBonus) onEatBonus(now);

  if (bonus && now >= bonus.expires) {
    burst((bonus.x + 0.5) * cell, (bonus.y + 0.5) * cell, ['#94a3b8', '#64748b'], 8, 0.12);
    bonus = null;
  }
}

function onEatFood(now) {
  score += 1;
  foods += 1;
  burst((food.x + 0.5) * cell, (food.y + 0.5) * cell, ['#fb7185', '#fbbf24', '#34d399'], 14, 0.26);
  soundEat();
  food = spawnCell();
  const newLevel = Math.floor(foods / FOODS_PER_LEVEL) + 1;
  if (newLevel > level) {
    level = newLevel;
    interval = Math.max(MIN_INTERVAL, BASE_INTERVAL - (level - 1) * SPEEDUP_PER_LEVEL);
    soundLevel();
  }
  if (foods % BONUS_EVERY === 0 && !bonus) {
    const c = spawnCell();
    if (c) bonus = { x: c.x, y: c.y, expires: now + BONUS_DURATION };
  }
  updateHUD(true);
}

function onEatBonus() {
  score += BONUS_POINTS;
  burst((bonus.x + 0.5) * cell, (bonus.y + 0.5) * cell, ['#fde68a', '#fbbf24', '#f59e0b'], 22, 0.34);
  bonus = null;
  soundBonus();
  updateHUD(true);
}

// ===================== 粒子 =====================
function burst(px, py, colors, count = 14, speed = 0.28) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (0.4 + Math.random() * 0.6) * speed;
    particles.push({
      x: px, y: py,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      r: 1.5 + Math.random() * 2.5,
      life: 400 + Math.random() * 300, max: 700,
      color: colors[(Math.random() * colors.length) | 0],
    });
  }
  if (particles.length > 320) particles.splice(0, particles.length - 320);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const f = Math.exp(-dt * 0.003);
    p.vx *= f; p.vy *= f;
  }
}

// ===================== 渲染 =====================
function drawBoard(w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.75);
  g.addColorStop(0, '#111c33');
  g.addColorStop(1, '#0a1120');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.022)';
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if ((x + y) & 1) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

function drawFood(now) {
  if (!food) return;
  const cx = (food.x + 0.5) * cell, cy = (food.y + 0.5) * cell;
  const pulse = 1 + Math.sin(now * 0.006) * 0.09;
  const r = cell * 0.3 * pulse;
  ctx.save();
  ctx.shadowColor = 'rgba(248,113,113,0.9)';
  ctx.shadowBlur = cell * 0.7;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.15, cx, cy, r);
  g.addColorStop(0, '#ffe4e6');
  g.addColorStop(0.35, '#fb7185');
  g.addColorStop(1, '#e11d48');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#4ade80';
  ctx.beginPath(); ctx.ellipse(cx + r * 0.3, cy - r * 1.05, r * 0.34, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.4, r * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function starPath(r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 === 0 ? r : r * 0.48;
    const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawBonus(now) {
  if (!bonus) return;
  const cx = (bonus.x + 0.5) * cell, cy = (bonus.y + 0.5) * cell;
  const f = Math.max(0, Math.min(1, (bonus.expires - now) / BONUS_DURATION));
  const blink = f < 0.28 ? 0.55 + (Math.sin(now * 0.03) * 0.5 + 0.5) * 0.45 : 1;
  const R = cell * 0.36 * (1 + Math.sin(now * 0.008) * 0.07);
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.strokeStyle = 'rgba(251,191,36,0.9)';
  ctx.lineWidth = Math.max(2, cell * 0.08);
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.56, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
  ctx.stroke();
  ctx.translate(cx, cy);
  ctx.rotate(now * 0.0012);
  ctx.shadowColor = 'rgba(251,191,36,0.95)';
  ctx.shadowBlur = cell * 0.55;
  const g = ctx.createLinearGradient(-R, -R, R, R);
  g.addColorStop(0, '#fde68a');
  g.addColorStop(1, '#f59e0b');
  ctx.fillStyle = g;
  starPath(R);
  ctx.fill();
  ctx.restore();
}

function drawCross(ex, ey, r) {
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = Math.max(1.5, cell * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ex - r, ey - r); ctx.lineTo(ex + r, ey + r);
  ctx.moveTo(ex + r, ey - r); ctx.lineTo(ex - r, ey + r);
  ctx.stroke();
}

function drawSnake(t) {
  const pts = [];
  for (let i = 0; i < snake.length; i++) {
    const c = snake[i];
    const p = prevSnake[i] || prevSnake[prevSnake.length - 1] || c;
    pts.push({ x: (lerp(p.x, c.x, t) + 0.5) * cell, y: (lerp(p.y, c.y, t) + 0.5) * cell });
  }
  const head = pts[0], tail = pts[pts.length - 1];

  const grad = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
  grad.addColorStop(0, '#67e8f9');
  grad.addColorStop(0.5, '#34d399');
  grad.addColorStop(1, '#0f766e');

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(52,211,153,0.45)';
  ctx.shadowBlur = cell * 0.55;
  ctx.strokeStyle = grad;
  ctx.lineWidth = cell * 0.7;
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = cell * 0.22;
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();

  const d = pts.length > 1 ? norm(head.x - pts[1].x, head.y - pts[1].y) : { x: dir.x, y: dir.y };
  const px = -d.y, py = d.x;
  ctx.save();
  ctx.shadowColor = 'rgba(103,232,249,0.6)';
  ctx.shadowBlur = cell * 0.4;
  ctx.fillStyle = '#a7f3d0';
  ctx.beginPath(); ctx.arc(head.x, head.y, cell * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  const fOff = cell * 0.13, pOff = cell * 0.17, eyeR = cell * 0.115;
  for (const s of [-1, 1]) {
    const ex = head.x + d.x * fOff + px * pOff * s;
    const ey = head.y + d.y * fOff + py * pOff * s;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2); ctx.fill();
    if (state === 'over') {
      drawCross(ex, ey, eyeR * 0.6);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(ex + d.x * eyeR * 0.4, ey + d.y * eyeR * 0.4, eyeR * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawParticles() {
  if (!particles.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const a = Math.max(p.life / p.max, 0);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function render(now) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (shake > 0) {
    const s = shake * shake * 8;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
  drawBoard(w, h);
  const t = (state === 'running' || state === 'paused') ? lastT : 1;
  drawFood(now);
  drawBonus(now);
  drawSnake(t);
  drawParticles();
  if (shake > 0) {
    ctx.fillStyle = 'rgba(244,63,94,' + (shake * 0.12).toFixed(3) + ')';
    ctx.fillRect(-10, -10, w + 20, h + 20);
  }
  ctx.restore();
}

// ===================== 主循环 =====================
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(now - prevNow, 50);
  prevNow = now;

  if (state === 'running') {
    let guard = 0;
    while (state === 'running' && now - lastTickTime >= interval && guard++ < 8) {
      lastTickTime += interval;
      step(now);
    }
    if (state === 'running') lastT = Math.min((now - lastTickTime) / interval, 1);
  }

  updateParticles(dt);
  if (shake > 0) shake = Math.max(0, shake - dt / 450);
  render(now);
}
requestAnimationFrame(loop);

// ===================== HUD / 覆盖层 =====================
function updateHUD(pop) {
  scoreEl.textContent = score;
  bestEl.textContent = best;
  levelEl.textContent = level;
  if (pop) {
    scoreEl.classList.remove('pop');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('pop');
  }
}

function updatePauseIcon() {
  btnPause.textContent = state === 'running' ? '⏸' : '▶';
}

function updateSoundIcon() {
  btnSound.textContent = muted ? '🔇' : '🔊';
}

function showOverlay(html) { overlayContent.innerHTML = html; overlay.classList.add('show'); }
function hideOverlay() { overlay.classList.remove('show'); }

const menuHTML = () =>
  '<div class="ov-emoji">🐍</div>' +
  '<h2>准备好了吗？</h2>' +
  '<p class="hint">按 <kbd>空格</kbd> 或点击屏幕开始</p>' +
  '<div class="key-grid">' +
  '<span>⬆⬇⬅➡ / WASD</span><span>移动</span>' +
  '<span>空格</span><span>开始 / 暂停</span>' +
  '<span>✨ 金星</span><span>+5 分（限时）</span>' +
  '</div>';

const pauseHTML = () =>
  '<div class="ov-emoji">⏸</div>' +
  '<h2>已暂停</h2>' +
  '<p class="hint">按 <kbd>空格</kbd> 或点击屏幕继续</p>';

const overHTML = (isNew) =>
  '<div class="ov-emoji">' + (isNew ? '🏆' : '💫') + '</div>' +
  '<h2>' + (isNew ? '新纪录！' : '游戏结束') + '</h2>' +
  '<p class="final-score">' + score + '<span> 分</span></p>' +
  '<p class="final-sub">最高纪录 ' + best + ' · 蛇长 ' + snake.length + ' 节</p>' +
  '<button class="primary" data-restart>再来一局</button>' +
  '<p class="hint">按 <kbd>空格</kbd> 快速重开</p>';

// ===================== 输入 =====================
const KEYS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

function queueDir(d) {
  const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
  if ((d.x === last.x && d.y === last.y) || (d.x === -last.x && d.y === -last.y)) return;
  if (dirQueue.length < 3) dirQueue.push(d);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); handlePrimary(); return; }
  if (e.code === 'Enter') { if (state !== 'running') handlePrimary(); return; }
  const k = KEYS[e.code];
  if (!k) return;
  e.preventDefault();
  if (state === 'menu' || state === 'over') start();
  queueDir({ x: k[0], y: k[1] });
});

overlay.addEventListener('click', (e) => {
  if (e.target.closest('[data-restart]')) { start(); return; }
  if (state === 'running') return;
  if (state === 'paused') resume(); else start();
});

btnPause.addEventListener('click', handlePrimary);
btnSound.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('snake.muted', muted ? '1' : '0');
  updateSoundIcon();
  if (!muted) { ensureAudio(); tone(880, 0.06, 'sine', 0.1); }
});

// 触屏滑动
let touchStart = null;
boardWrap.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
}, { passive: true });
boardWrap.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (Math.max(adx, ady) < 12) {
    if (state === 'menu' || state === 'over') start();
    else if (state === 'paused') resume();
  } else {
    if (state === 'menu' || state === 'over') start();
    queueDir(adx > ady ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
  }
  touchStart = null;
});

// 虚拟方向键
const DPAD_MAP = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
dpad.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('button[data-dir]');
  if (!b) return;
  e.preventDefault();
  if (state === 'menu' || state === 'over') start();
  else if (state === 'paused') resume();
  queueDir(DPAD_MAP[b.dataset.dir]);
});

// 切后台自动暂停
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'running') pause();
});

// ===================== 初始化 =====================
reset();
updateHUD(false);
updatePauseIcon();
updateSoundIcon();
showOverlay(menuHTML());

// URL 带 #play 时自动开局(便于演示/测试)
if (location.hash === '#play') start();

})();
