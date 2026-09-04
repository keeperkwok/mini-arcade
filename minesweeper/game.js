(() => {
'use strict';

// ---------- 常量与元素 ----------
const DIFFS = {
  beginner:     { name: '初级', rows: 9,  cols: 9,  mines: 10 },
  intermediate: { name: '中级', rows: 16, cols: 16, mines: 40 },
  expert:       { name: '高级', rows: 16, cols: 30, mines: 99 },
};
const LONG_PRESS_MS = 380;
const MAX_CELL = { beginner: 44, intermediate: 34, expert: 28 };

const boardEl = document.getElementById('board');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const minesLeftEl = document.getElementById('minesLeft');
const timeEl = document.getElementById('time');
const bestTimeEl = document.getElementById('bestTime');
const btnSound = document.getElementById('btnSound');
const btnFlag = document.getElementById('btnFlag');
const btnRestart = document.getElementById('btnRestart');
const diffEl = document.getElementById('diff');

// ---------- 状态 ----------
let diff = localStorage.getItem('minesweeper.diff') || 'beginner';
if (!DIFFS[diff]) diff = 'beginner';

let rows = 0, cols = 0, mineCount = 0;
let cells = [];         // { mine, revealed, flagged, adj, el }
let started = false, over = false;
let revealedCount = 0, flagCount = 0;
let timerId = null, seconds = 0, timerRunning = false;
let flagMode = false;
let muted = localStorage.getItem('minesweeper.muted') === '1';

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
const soundReveal = () => tone(520, 0.04, 'triangle', 0.06);
const soundFlag   = () => tone(300, 0.06, 'square', 0.07, 0, 380);
const soundBoom   = () => { tone(120, 0.5, 'sawtooth', 0.18, 0, 40); tone(80, 0.6, 'square', 0.1, 0.05, 30); };
const soundWin    = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.14, i * 0.1));
const unlockAudio = () => { ensureAudio(); window.removeEventListener('pointerdown', unlockAudio); window.removeEventListener('keydown', unlockAudio); };
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// ---------- 计时器 ----------
function startTimer() {
  stopTimer();
  timerRunning = true;
  timerId = setInterval(() => {
    seconds = Math.min(999, seconds + 1);
    timeEl.textContent = seconds;
  }, 1000);
}
function stopTimer() {
  timerRunning = false;
  if (timerId) { clearInterval(timerId); timerId = null; }
}

// ---------- 棋盘构建 ----------
function cellSize() {
  const fit = Math.floor((Math.min(window.innerWidth, 760) - 60) / cols);
  return Math.max(24, Math.min(MAX_CELL[diff], fit));
}

function newGame() {
  const d = DIFFS[diff];
  rows = d.rows; cols = d.cols; mineCount = d.mines;
  started = false; over = false;
  revealedCount = 0; flagCount = 0;
  stopTimer();
  seconds = 0;
  timeEl.textContent = '0';
  updateBestLabel();

  boardEl.style.setProperty('--cols', cols);
  boardEl.style.setProperty('--cell', cellSize() + 'px');
  boardEl.innerHTML = '';
  cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const el = document.createElement('button');
      el.className = 'cell';
      el.dataset.i = r * cols + c;
      boardEl.appendChild(el);
      cells.push({ mine: false, revealed: false, flagged: false, adj: 0, el });
    }
  }
  minesLeftEl.textContent = mineCount;
  hideOverlay();
}

function layoutOnly() {
  boardEl.style.setProperty('--cell', cellSize() + 'px');
}

// ---------- 雷与数字 ----------
function neighbors(i) {
  const r = (i / cols) | 0, c = i % cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
    }
  }
  return out;
}

function placeMines(safeIndex) {
  const total = rows * cols;
  let forbidden = new Set([safeIndex]);
  for (const n of neighbors(safeIndex)) forbidden.add(n);
  if (total - forbidden.size < mineCount) forbidden = new Set([safeIndex]);

  const pool = [];
  for (let i = 0; i < total; i++) {
    if (!forbidden.has(i)) pool.push(i);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (let k = 0; k < mineCount; k++) cells[pool[k]].mine = true;
  for (let i = 0; i < total; i++) {
    cells[i].adj = neighbors(i).filter(n => cells[n].mine).length;
  }
}

// ---------- 翻开 ----------
function revealFrom(startIndex) {
  const queue = [[startIndex, 0]];
  const seen = new Set([startIndex]);
  while (queue.length) {
    const [i, depth] = queue.shift();
    const cell = cells[i];
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    revealedCount++;
    scheduleReveal(cell, depth);
    if (cell.adj === 0) {
      for (const n of neighbors(i)) {
        if (!seen.has(n) && !cells[n].flagged) {
          seen.add(n);
          queue.push([n, depth + 1]);
        }
      }
    }
  }
}

function scheduleReveal(cell, depth) {
  const delay = Math.min(depth * 16, 480);
  setTimeout(() => {
    cell.el.classList.add('revealed');
    if (cell.adj > 0) {
      cell.el.textContent = cell.adj;
      cell.el.classList.add('n' + cell.adj);
    }
  }, delay);
}

function chord(i) {
  const cell = cells[i];
  if (cell.adj === 0) return;
  const ns = neighbors(i);
  const flags = ns.filter(n => cells[n].flagged).length;
  if (flags !== cell.adj) return;

  for (const n of ns) {
    if (cells[n].mine && !cells[n].flagged && !cells[n].revealed) {
      boom(n);
      return;
    }
  }
  soundReveal();
  for (const n of ns) {
    if (!cells[n].revealed && !cells[n].flagged && !cells[n].mine) revealFrom(n);
  }
  checkWin();
}

// ---------- 插旗 ----------
function toggleFlag(i) {
  const cell = cells[i];
  if (over || cell.revealed) return;
  if (!started) {
    started = true;
    placeMines(i);
    startTimer();
  }
  cell.flagged = !cell.flagged;
  flagCount += cell.flagged ? 1 : -1;
  cell.el.textContent = cell.flagged ? '🚩' : '';
  cell.el.classList.toggle('flag', cell.flagged);
  minesLeftEl.textContent = mineCount - flagCount;
  soundFlag();
}

// ---------- 胜负 ----------
function handleTap(i) {
  if (over) return;
  const cell = cells[i];
  if (!started) {
    started = true;
    placeMines(i);
    startTimer();
  }
  if (flagMode && !cell.revealed) { toggleFlag(i); return; }
  if (cell.flagged) return;
  if (cell.revealed) { chord(i); return; }
  if (cell.mine) { boom(i); return; }
  soundReveal();
  revealFrom(i);
  checkWin();
}

function boom(i) {
  over = true;
  stopTimer();
  const hit = cells[i];
  hit.el.classList.add('revealed', 'mine', 'boom');
  hit.el.textContent = '💥';
  soundBoom();
  if (navigator.vibrate) navigator.vibrate([60, 40, 80]);
  boardEl.classList.add('shake');
  setTimeout(() => boardEl.classList.remove('shake'), 500);

  cells.forEach((cell, idx) => {
    if (idx === i) return;
    setTimeout(() => {
      if (over && cell.mine && !cell.flagged) {
        cell.el.classList.add('revealed', 'mine');
        cell.el.textContent = '💣';
      } else if (over && !cell.mine && cell.flagged) {
        cell.el.classList.add('wrong');
        cell.el.textContent = '❌';
      }
    }, 150 + Math.random() * 550);
  });
  setTimeout(() => { if (over) showOverlay(loseHTML()); }, 1100);
}

function checkWin() {
  if (over) return;
  if (revealedCount !== rows * cols - mineCount) return;
  over = true;
  stopTimer();
  cells.forEach(cell => {
    if (cell.mine && !cell.flagged) {
      cell.flagged = true;
      cell.el.textContent = '🚩';
      cell.el.classList.add('flag');
    }
  });
  minesLeftEl.textContent = '0';

  const key = 'minesweeper.best.' + diff;
  const prev = Number(localStorage.getItem(key) || 0);
  const isNew = !prev || seconds < prev;
  if (isNew) localStorage.setItem(key, String(seconds));
  updateBestLabel();
  soundWin();
  setTimeout(() => { if (over) showOverlay(winHTML(isNew, prev)); }, 500);
}

// ---------- 界面 ----------
function updateBestLabel() {
  const prev = Number(localStorage.getItem('minesweeper.best.' + diff) || 0);
  bestTimeEl.textContent = prev ? prev + 's' : '--';
}

function showOverlay(html) {
  overlayContent.innerHTML = html;
  overlay.classList.add('show');
}
function hideOverlay() { overlay.classList.remove('show'); }

function winHTML(isNew, prev) {
  let sub;
  if (isNew) sub = prev ? '🏆 新纪录!原纪录 ' + prev + ' 秒' : '🏆 首个纪录!';
  else sub = '最佳 ' + prev + ' 秒';
  return '<div class="ov-emoji">😎</div>' +
    '<h2>排雷成功!</h2>' +
    '<p class="final-score">' + seconds + '<span> 秒</span></p>' +
    '<p class="final-sub">' + sub + '</p>' +
    '<button class="primary" data-act="again">再来一局</button>';
}

function loseHTML() {
  return '<div class="ov-emoji">💥</div>' +
    '<h2>踩雷了!</h2>' +
    '<p class="hint">坚持了 ' + seconds + ' 秒 · 排雷需要严密推理(和一点运气)</p>' +
    '<button class="primary" data-act="again">再来一局</button>';
}

// ---------- 输入 ----------
boardEl.addEventListener('click', (e) => {
  if (longPressed) { longPressed = false; return; }
  const el = e.target.closest('.cell');
  if (!el) return;
  handleTap(Number(el.dataset.i));
});

boardEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const el = e.target.closest('.cell');
  if (!el || over) return;
  toggleFlag(Number(el.dataset.i));
});

// 长按插旗(触屏)
let pressTimer = null, pressIndex = -1, longPressed = false;
let pressX = 0, pressY = 0;

boardEl.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.cell');
  if (!el || over) return;
  pressIndex = Number(el.dataset.i);
  pressX = e.clientX; pressY = e.clientY;
  longPressed = false;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    longPressed = true;
    toggleFlag(pressIndex);
    if (navigator.vibrate) navigator.vibrate(25);
  }, LONG_PRESS_MS);
});

function cancelPress(e) {
  if (e && e.clientX !== undefined) {
    if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > 14) {
      clearTimeout(pressTimer);
      return;
    }
    return;
  }
  clearTimeout(pressTimer);
}
boardEl.addEventListener('pointermove', cancelPress);
boardEl.addEventListener('pointerup', () => clearTimeout(pressTimer));
boardEl.addEventListener('pointercancel', () => clearTimeout(pressTimer));
boardEl.addEventListener('pointerleave', () => clearTimeout(pressTimer));

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (btn && btn.dataset.act === 'again') newGame();
});

btnRestart.addEventListener('click', newGame);

btnFlag.addEventListener('click', () => {
  flagMode = !flagMode;
  btnFlag.classList.toggle('active', flagMode);
});

btnSound.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('minesweeper.muted', muted ? '1' : '0');
  btnSound.textContent = muted ? '🔇' : '🔊';
});

diffEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-diff]');
  if (!btn) return;
  diff = btn.dataset.diff;
  localStorage.setItem('minesweeper.diff', diff);
  updateDiffButtons();
  newGame();
});

function updateDiffButtons() {
  for (const btn of diffEl.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'f' || e.key === 'F') {
    flagMode = !flagMode;
    btnFlag.classList.toggle('active', flagMode);
  } else if (e.key === 'r' || e.key === 'R') {
    newGame();
  }
});

window.addEventListener('resize', layoutOnly);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && timerRunning) stopTimer();
  else if (!document.hidden && started && !over && !timerRunning) startTimer();
});

// ---------- 启动 ----------
btnSound.textContent = muted ? '🔇' : '🔊';
updateDiffButtons();
newGame();

})();
