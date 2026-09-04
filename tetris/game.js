(() => {
'use strict';

// ---------- 常量 ----------
const COLS = 10, ROWS = 20;
const LOCK_DELAY = 500, MAX_LOCK_RESETS = 15;
const NEXT_COUNT = 3;
const CLEAR_MS = 260;
const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const COLORS = {
  I: '#22d3ee', O: '#fbbf24', T: '#c084fc',
  S: '#34d399', Z: '#f87171', J: '#60a5fa', L: '#fb923c',
};

// 各方块用 N×N 包围盒内的坐标定义(生成状态),按 SRS 规则旋转
const BOX = { I: 4, O: 2, T: 3, S: 3, Z: 3, J: 3, L: 3 };
const BASE_CELLS = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};

const CELLS = {};
for (const type of TYPES) {
  const n = BOX[type];
  const list = [BASE_CELLS[type].map(p => [...p])];
  for (let rot = 1; rot < 4; rot++) {
    list.push(list[rot - 1].map(([x, y]) => [n - 1 - y, x]));
  }
  CELLS[type] = list;
}

// SRS 墙踢表(手册坐标系 y 向上,代码中应用时取反)
const KICKS = {
  JLSTZ: {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  },
  I: {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  },
};

const LINE_SCORES = [0, 100, 300, 500, 800];

// ---------- 元素 ----------
const boardCanvas = document.getElementById('board');
const bctx = boardCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold');
const hctx = holdCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nctx = nextCanvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const btnSound = document.getElementById('btnSound');
const btnPause = document.getElementById('btnPause');

// ---------- 状态 ----------
let board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
let current = null;      // { type, rot, x, y }
let queue = [];
let bag = [];
let holdType = null;
let canHold = true;
let score = 0, lines = 0, level = 1, combo = -1;
let best = Number(localStorage.getItem('tetris.best') || 0);
let startBest = best;
let state = 'ready';     // ready | playing | clearing | paused | over
let dropAcc = 0, lockTimer = 0, lockResets = 0, grounded = false;
let clearingRows = [], clearTimer = 0;
let softDropping = false;
let muted = localStorage.getItem('tetris.muted') === '1';
let cell = 24;

// ---------- 音效 ----------
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
const soundMove   = () => tone(210, 0.03, 'square', 0.04);
const soundRotate = () => tone(360, 0.05, 'triangle', 0.08, 0, 500);
const soundLock   = () => tone(150, 0.06, 'square', 0.09, 0, 90);
const soundDrop   = () => tone(190, 0.07, 'square', 0.1, 0, 80);
const soundHold   = () => tone(500, 0.06, 'sine', 0.09);
const soundClear  = () => { tone(523, 0.09, 'triangle', 0.13); tone(659, 0.09, 'triangle', 0.13, 0.07); tone(784, 0.12, 'triangle', 0.13, 0.14); };
const soundTetris = () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, i * 0.07));
const soundOver   = () => tone(330, 0.7, 'sawtooth', 0.12, 0, 55);
const soundStart  = () => { tone(660, 0.07, 'sine', 0.12); tone(990, 0.09, 'sine', 0.1, 0.06); };
const unlockAudio = () => { ensureAudio(); window.removeEventListener('pointerdown', unlockAudio); window.removeEventListener('keydown', unlockAudio); };
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// ---------- 画布尺寸 ----------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const [canvas, ctx] of [[boardCanvas, bctx], [holdCanvas, hctx], [nextCanvas, nctx]]) {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  cell = boardCanvas.getBoundingClientRect().width / COLS;
  drawAll();
}
window.addEventListener('resize', resize);

// ---------- 方块逻辑 ----------
function cellsOf(piece) {
  return CELLS[piece.type][piece.rot].map(([x, y]) => [piece.x + x, piece.y + y]);
}

function collides(piece) {
  for (const [x, y] of cellsOf(piece)) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y >= 0 && board[y][x]) return true;
  }
  return false;
}

function refillBag() {
  bag = [...TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
}

function fillQueue() {
  if (!bag.length) refillBag();
  while (queue.length < NEXT_COUNT) {
    if (!bag.length) refillBag();
    queue.push(bag.pop());
  }
}

function spawn() {
  fillQueue();
  const type = queue.shift();
  fillQueue();
  const n = BOX[type];
  current = { type, rot: 0, x: Math.floor((COLS - n) / 2), y: 0 };
  canHold = true;
  dropAcc = 0; lockTimer = 0; lockResets = 0; grounded = false;
  drawSide();
  if (collides(current)) gameOver();
}

function tryShift(dx, dy) {
  if (state !== 'playing' || !current) return false;
  const moved = { ...current, x: current.x + dx, y: current.y + dy };
  if (collides(moved)) return false;
  current = moved;
  if (dx !== 0) {
    soundMove();
    if (grounded && lockResets < MAX_LOCK_RESETS) { lockTimer = 0; lockResets++; }
  }
  return true;
}

function rotate(dir) {
  if (state !== 'playing' || !current) return;
  const { type, rot } = current;
  if (type === 'O') { soundRotate(); return; }
  const to = (rot + dir + 4) % 4;
  const kicks = (type === 'I' ? KICKS.I : KICKS.JLSTZ)[rot + '>' + to];
  for (const [dx, dyUp] of kicks) {
    const cand = { type, rot: to, x: current.x + dx, y: current.y - dyUp };
    if (!collides(cand)) {
      current = cand;
      soundRotate();
      if (grounded && lockResets < MAX_LOCK_RESETS) { lockTimer = 0; lockResets++; }
      return;
    }
  }
}

function hold() {
  if (state !== 'playing' || !current || !canHold) return;
  const type = current.type;
  if (holdType) {
    const n = BOX[holdType];
    current = { type: holdType, rot: 0, x: Math.floor((COLS - n) / 2), y: 0 };
    if (collides(current)) { gameOver(); return; }
  } else {
    current = null;
    spawn();
  }
  holdType = type;
  canHold = false;
  dropAcc = 0; lockTimer = 0; lockResets = 0;
  soundHold();
  drawSide();
}

function hardDrop() {
  if (state !== 'playing' || !current) return;
  let dist = 0;
  while (tryShift(0, 1)) dist++;
  score += dist * 2;
  updateStats();
  soundDrop();
  lockPiece();
}

function intervalForLevel() {
  return Math.max(70, 720 - (level - 1) * 58);
}

function isGrounded() {
  return current && collides({ ...current, y: current.y + 1 });
}

function lockPiece() {
  let topOut = false;
  for (const [x, y] of cellsOf(current)) {
    if (y < 0) { topOut = true; continue; }
    board[y][x] = current.type;
  }
  current = null;
  if (topOut) { gameOver(); return; }

  const full = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every(Boolean)) full.push(r);
  }
  if (full.length) {
    combo++;
    clearingRows = full;
    clearTimer = 0;
    state = 'clearing';
    addLineScore(full.length);
    if (full.length === 4) soundTetris(); else soundClear();
  } else {
    combo = -1;
    soundLock();
    spawn();
  }
  drawAll();
}

function addLineScore(n) {
  score += LINE_SCORES[n] * level + (combo > 0 ? 50 * combo * level : 0);
  lines += n;
  level = Math.floor(lines / 10) + 1;
  updateStats(true);
}

function finishClear() {
  for (const r of clearingRows) {
    board.splice(r, 1);
    board.unshift(Array(COLS).fill(0));
  }
  clearingRows = [];
  state = 'playing';
  spawn();
}

// ---------- 主循环 ----------
let lastTime = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(50, now - (lastTime || now));
  lastTime = now;

  if (state === 'clearing') {
    clearTimer += dt;
    if (clearTimer >= CLEAR_MS) finishClear();
    drawAll();
    return;
  }
  if (state !== 'playing' || !current) return;

  if (isGrounded()) {
    lockTimer += dt;
    if (lockTimer >= LOCK_DELAY) {
      lockPiece();
      drawAll();
      return;
    }
  } else {
    if (grounded) lockResets = 0;
    lockTimer = 0;
    dropAcc += dt;
    const interval = softDropping ? Math.min(40, intervalForLevel() / 18) : intervalForLevel();
    while (dropAcc >= interval) {
      dropAcc -= interval;
      if (!tryShift(0, 1)) break;
      if (softDropping) { score += 1; updateStats(); }
    }
  }
  grounded = isGrounded();
  drawAll();
}
requestAnimationFrame((t) => { lastTime = t; frame(t); });

// ---------- 渲染 ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCell(ctx, px, py, size, color, alpha) {
  const r = size * 0.18;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  roundRect(ctx, px + 1, py + 1, size - 2, size - 2, r);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  roundRect(ctx, px + size * 0.14, py + size * 0.1, size * 0.72, size * 0.22, r * 0.6);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, px + size * 0.14, py + size * 0.68, size * 0.72, size * 0.2, r * 0.6);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBoard() {
  const w = boardCanvas.clientWidth, h = boardCanvas.clientHeight;
  bctx.clearRect(0, 0, w, h);

  bctx.strokeStyle = 'rgba(148,163,184,0.08)';
  bctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    bctx.beginPath();
    bctx.moveTo(c * cell, 0);
    bctx.lineTo(c * cell, h);
    bctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    bctx.beginPath();
    bctx.moveTo(0, r * cell);
    bctx.lineTo(w, r * cell);
    bctx.stroke();
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) drawCell(bctx, c * cell, r * cell, cell, COLORS[board[r][c]], 1);
    }
  }

  if (state === 'clearing') {
    const k = clearTimer / CLEAR_MS;
    const flash = 0.85 * (0.4 + 0.6 * Math.abs(Math.sin(k * Math.PI * 3)));
    bctx.fillStyle = 'rgba(255,255,255,' + flash.toFixed(3) + ')';
    for (const r of clearingRows) bctx.fillRect(0, r * cell, COLS * cell, cell);
  }

  if (current && (state === 'playing' || state === 'paused')) {
    const ghost = { ...current };
    while (!collides({ ...ghost, y: ghost.y + 1 })) ghost.y++;
    if (ghost.y !== current.y) {
      for (const [x, y] of cellsOf(ghost)) {
        if (y >= 0) drawCell(bctx, x * cell, y * cell, cell, COLORS[current.type], 0.2);
      }
    }
    for (const [x, y] of cellsOf(current)) {
      if (y >= 0) drawCell(bctx, x * cell, y * cell, cell, COLORS[current.type], 1);
    }
  }
}

function drawMini(ctx, type, w, h, alpha, offsetY) {
  const cells = CELLS[type][0];
  const size = Math.min(w / 4.6, h / 3.6);
  const xs = cells.map(p => p[0]), ys = cells.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const bw = (Math.max(...xs) - minX + 1) * size;
  const bh = (Math.max(...ys) - minY + 1) * size;
  const ox = (w - bw) / 2 - minX * size;
  const oy = offsetY + (h - bh) / 2 - minY * size;
  for (const [x, y] of cells) drawCell(ctx, ox + x * size, oy + y * size, size, COLORS[type], alpha);
}

function drawSide() {
  const hw = holdCanvas.clientWidth, hh = holdCanvas.clientHeight;
  hctx.clearRect(0, 0, hw, hh);
  if (holdType) drawMini(hctx, holdType, hw, hh, canHold ? 1 : 0.35, 0);

  const nw = nextCanvas.clientWidth, nh = nextCanvas.clientHeight;
  nctx.clearRect(0, 0, nw, nh);
  const slot = nh / NEXT_COUNT;
  queue.forEach((type, i) => drawMini(nctx, type, nw, slot, 1, i * slot));
}

function drawAll() {
  drawBoard();
  drawSide();
}

// ---------- 界面 ----------
function updateStats(popScore) {
  scoreEl.textContent = score;
  bestEl.textContent = best;
  levelEl.textContent = level;
  linesEl.textContent = lines;
  if (popScore) {
    scoreEl.classList.remove('pop');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('pop');
  }
}

function showOverlay(html) {
  overlayContent.innerHTML = html;
  overlay.classList.add('show');
}
function hideOverlay() { overlay.classList.remove('show'); }

function startHTML() {
  return '<div class="ov-emoji">🧱</div>' +
    '<h2>俄罗斯方块</h2>' +
    '<div class="key-grid">' +
    '<span>← →</span><span>左右移动</span>' +
    '<span>↑ / X</span><span>旋转(Z 反向)</span>' +
    '<span>↓</span><span>加速下落</span>' +
    '<span>空格</span><span>直接落下</span>' +
    '<span>C</span><span>暂存方块</span>' +
    '<span>P</span><span>暂停</span>' +
    '</div>' +
    '<p class="hint">📱 触屏:拖动移动、点按旋转、快速下滑直落</p>' +
    '<button class="primary" data-act="start">开始游戏</button>';
}

function pauseHTML() {
  return '<div class="ov-emoji">⏸</div>' +
    '<h2>已暂停</h2>' +
    '<div class="ov-actions">' +
    '<button class="primary" data-act="resume">继续</button>' +
    '<button class="ghost" data-act="restart">重新开始</button>' +
    '</div>';
}

function overHTML(isNew) {
  return '<div class="ov-emoji">💥</div>' +
    '<h2>游戏结束</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">' + (isNew ? '🏆 新纪录!' : '最高纪录 ' + best + ' 分') +
    ' · 消行 ' + lines + ' · 等级 ' + level + '</p>' +
    '<button class="primary" data-act="restart">再来一局</button>';
}

// ---------- 流程 ----------
function startGame() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  queue = [];
  bag = [];
  holdType = null;
  canHold = true;
  score = 0; lines = 0; level = 1; combo = -1;
  softDropping = false;
  clearingRows = [];
  startBest = best;
  state = 'playing';
  btnPause.textContent = '⏸';
  hideOverlay();
  spawn();
  updateStats();
  soundStart();
}

function gameOver() {
  state = 'over';
  const isNew = score > startBest;
  if (score > best) {
    best = score;
    localStorage.setItem('tetris.best', String(best));
  }
  updateStats();
  soundOver();
  if (navigator.vibrate) navigator.vibrate(120);
  setTimeout(() => { if (state === 'over') showOverlay(overHTML(isNew)); }, 550);
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    btnPause.textContent = '▶';
    showOverlay(pauseHTML());
  } else if (state === 'paused') {
    state = 'playing';
    btnPause.textContent = '⏸';
    hideOverlay();
  }
}

// ---------- 输入 ----------
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key;

  if (state === 'ready' && (key === 'Enter' || key === ' ')) { e.preventDefault(); startGame(); return; }
  if (state === 'over' && (key === 'Enter' || key === ' ')) { e.preventDefault(); startGame(); return; }
  if (key === 'p' || key === 'P' || key === 'Escape') { togglePause(); return; }
  if (state !== 'playing') return;

  switch (key) {
    case 'ArrowLeft': e.preventDefault(); tryShift(-1, 0); break;
    case 'ArrowRight': e.preventDefault(); tryShift(1, 0); break;
    case 'ArrowDown':
      e.preventDefault();
      if (!softDropping) { softDropping = true; dropAcc = intervalForLevel(); }
      break;
    case 'ArrowUp': case 'x': case 'X': e.preventDefault(); rotate(1); break;
    case 'z': case 'Z': rotate(-1); break;
    case ' ': e.preventDefault(); hardDrop(); break;
    case 'c': case 'C': hold(); break;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowDown') softDropping = false;
});

// 触屏按钮
const tpad = document.getElementById('tpad');
tpad.addEventListener('contextmenu', (e) => e.preventDefault());

function bindRepeat(btn, action) {
  let delayTimer = null, repeatTimer = null;
  const start = (e) => {
    e.preventDefault();
    action();
    delayTimer = setTimeout(() => { repeatTimer = setInterval(action, 90); }, 230);
  };
  const stop = () => {
    clearTimeout(delayTimer);
    clearInterval(repeatTimer);
    delayTimer = repeatTimer = null;
  };
  btn.addEventListener('pointerdown', start);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, stop);
}

function bindTap(btn, action) {
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); action(); });
}

for (const btn of tpad.querySelectorAll('button')) {
  const act = btn.dataset.act;
  if (act === 'left') bindRepeat(btn, () => tryShift(-1, 0));
  else if (act === 'right') bindRepeat(btn, () => tryShift(1, 0));
  else if (act === 'down') bindRepeat(btn, () => { if (state === 'playing' && tryShift(0, 1)) { score += 1; updateStats(); } });
  else if (act === 'rotate') bindTap(btn, () => rotate(1));
  else if (act === 'drop') bindTap(btn, hardDrop);
  else if (act === 'hold') bindTap(btn, hold);
}

// 棋盘手势:拖动移动、点按旋转、快速下滑直落
let swipe = null;
boardCanvas.addEventListener('pointerdown', (e) => {
  swipe = { x: e.clientX, y: e.clientY, lastX: e.clientX, t: performance.now() };
  boardCanvas.setPointerCapture(e.pointerId);
});
boardCanvas.addEventListener('pointermove', (e) => {
  if (!swipe || state !== 'playing') return;
  const dx = e.clientX - swipe.lastX;
  const step = Math.max(18, cell * 0.9);
  if (Math.abs(dx) >= step) {
    const steps = Math.trunc(dx / step);
    for (let i = 0; i < Math.abs(steps); i++) tryShift(Math.sign(steps), 0);
    swipe.lastX = e.clientX;
  }
});
boardCanvas.addEventListener('pointerup', (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  const dt = performance.now() - swipe.t;
  swipe = null;
  if (state !== 'playing') return;
  if (dy > 42 && dy > Math.abs(dx) && dt < 320) { hardDrop(); return; }
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 320) rotate(1);
});
boardCanvas.addEventListener('pointercancel', () => { swipe = null; });

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'start' || act === 'restart') startGame();
  else if (act === 'resume') togglePause();
});

btnPause.addEventListener('click', () => {
  if (state === 'ready' || state === 'over') startGame();
  else togglePause();
});

btnSound.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('tetris.muted', muted ? '1' : '0');
  btnSound.textContent = muted ? '🔇' : '🔊';
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});

// ---------- 启动 ----------
btnSound.textContent = muted ? '🔇' : '🔊';
bestEl.textContent = best;
showOverlay(startHTML());
resize();

})();
