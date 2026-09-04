(() => {
'use strict';

// ---------- 常量与元素 ----------
const SIZE = 4;
const WIN_VALUE = 2048;
const SWIPE_MIN = 24;
const ANIM_MS = 135;

const tilesEl = document.getElementById('tiles');
const gridBg = document.getElementById('gridBg');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const maxTileEl = document.getElementById('maxTile');
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');

for (let i = 0; i < SIZE * SIZE; i++) {
  const cell = document.createElement('i');
  cell.className = 'cell-bg';
  gridBg.appendChild(cell);
}

// ---------- 状态 ----------
let grid = [];
let score = 0;
let best = Number(localStorage.getItem('2048.best') || 0);
let startBest = best;   // 本局开始时的纪录,用于判断"新纪录"
let won = false;        // 达成 2048 且尚未弹出胜利结算
let winShown = false;   // 胜利结算只弹一次
let keepPlaying = false;
let over = false;
let busy = false;
let muted = localStorage.getItem('2048.muted') === '1';

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
const soundMove = () => tone(240, 0.05, 'sine', 0.05);
const soundMerge = (value) => {
  const base = 300 + Math.min(11, Math.log2(value)) * 40;
  tone(base, 0.08, 'triangle', 0.13);
  tone(base * 1.5, 0.1, 'triangle', 0.11, 0.05);
};
const soundWin = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.15, i * 0.11));
const soundOver = () => tone(300, 0.5, 'sawtooth', 0.11, 0, 70);
const unlockAudio = () => { ensureAudio(); window.removeEventListener('pointerdown', unlockAudio); window.removeEventListener('keydown', unlockAudio); };
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// ---------- 方块 ----------
function positionEl(el, row, col) {
  el.style.translate =
    'calc(' + col + ' * (100% + var(--gap))) calc(' + row + ' * (100% + var(--gap)))';
}

function makeTile(value, row, col, anim) {
  const el = document.createElement('div');
  const colorClass = value <= 2048 ? 't' + value : 'tbig';
  el.className = 'tile ' + colorClass + (anim ? ' ' + anim : '');
  el.textContent = value;
  positionEl(el, row, col);
  tilesEl.appendChild(el);
  return el;
}

function emptyCells() {
  const list = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) list.push([r, c]);
    }
  }
  return list;
}

function spawnRandom() {
  const cells = emptyCells();
  if (!cells.length) return false;
  const [r, c] = cells[(Math.random() * cells.length) | 0];
  const value = Math.random() < 0.9 ? 2 : 4;
  grid[r][c] = { value, el: makeTile(value, r, c, 'spawn') };
  return true;
}

function maxTile() {
  let m = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c]) m = Math.max(m, grid[r][c].value);
    }
  }
  return m;
}

// ---------- 移动与合并 ----------
const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

function move(dirName) {
  if (over || busy || (won && !keepPlaying)) return;
  const [dr, dc] = DIRS[dirName];
  const rows = [0, 1, 2, 3];
  const cols = [0, 1, 2, 3];
  if (dr === 1) rows.reverse();
  if (dc === 1) cols.reverse();

  let moved = false;
  let gained = 0;
  let mergedMax = 0;
  const mergedCells = new Set();
  const removedEls = [];

  for (const r of rows) {
    for (const c of cols) {
      const tile = grid[r][c];
      if (!tile) continue;
      let nr = r, nc = c;
      for (;;) {
        const tr = nr + dr, tc = nc + dc;
        if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
        const target = grid[tr][tc];
        if (!target) { nr = tr; nc = tc; continue; }
        if (target.value === tile.value && !mergedCells.has(tr * SIZE + tc)) { nr = tr; nc = tc; }
        break;
      }
      if (nr === r && nc === c) continue;

      moved = true;
      grid[r][c] = null;
      const target = grid[nr][nc];
      if (target) {
        const value = tile.value * 2;
        gained += value;
        mergedCells.add(nr * SIZE + nc);
        positionEl(tile.el, nr, nc);
        tile.el.style.zIndex = '1';
        removedEls.push(tile.el, target.el);
        grid[nr][nc] = { value, el: makeTile(value, nr, nc, 'merge') };
        mergedMax = Math.max(mergedMax, value);
        if (value >= WIN_VALUE && !winShown) won = true;
      } else {
        grid[nr][nc] = tile;
        positionEl(tile.el, nr, nc);
      }
    }
  }

  if (!moved) return;

  busy = true;
  score += gained;
  if (score > best) {
    best = score;
    localStorage.setItem('2048.best', String(best));
  }
  updateStats(gained > 0);
  if (mergedMax) soundMerge(mergedMax); else soundMove();

  setTimeout(() => {
    for (const el of removedEls) el.remove();
    busy = false;
    spawnRandom();
    updateStats(false);
    if (won && !keepPlaying) {
      showOverlay(winHTML());
      soundWin();
      winShown = true;
      won = false;
      return;
    }
    if (!canMove()) {
      over = true;
      soundOver();
      showOverlay(overHTML());
    }
  }, ANIM_MS);
}

function canMove() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const tile = grid[r][c];
      if (!tile) return true;
      const right = c + 1 < SIZE ? grid[r][c + 1] : null;
      const down = r + 1 < SIZE ? grid[r + 1][c] : null;
      if ((right && right.value === tile.value) || (down && down.value === tile.value)) return true;
    }
  }
  return false;
}

// ---------- 界面 ----------
function updateStats(popScore) {
  scoreEl.textContent = score;
  bestEl.textContent = best;
  maxTileEl.textContent = maxTile();
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

function winHTML() {
  return '<div class="ov-emoji">🎉</div>' +
    '<h2>达成 2048!</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="hint">传说中的方块已经到手,还要继续冲击更高分吗?</p>' +
    '<div class="ov-actions">' +
    '<button class="primary" data-act="continue">继续挑战</button>' +
    '<button class="ghost" data-act="new">新游戏</button>' +
    '</div>';
}

function overHTML() {
  const isNew = score > startBest;
  return '<div class="ov-emoji">💥</div>' +
    '<h2>无路可走</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">' + (isNew ? '🏆 新纪录!' : '最高纪录 ' + best + ' 分') + '</p>' +
    '<div class="ov-actions"><button class="primary" data-act="new">再来一局</button></div>';
}

function reset() {
  tilesEl.innerHTML = '';
  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  score = 0;
  won = false;
  winShown = false;
  keepPlaying = false;
  over = false;
  busy = false;
  startBest = best;
  spawnRandom();
  spawnRandom();
  hideOverlay();
  updateStats(false);
}

// ---------- 输入 ----------
const KEY_DIRS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
};

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const dir = KEY_DIRS[e.key];
  if (dir) {
    e.preventDefault();
    move(dir);
  }
});

let pointerStart = null;
document.querySelector('.board-wrap').addEventListener('pointerdown', (e) => {
  pointerStart = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointerup', (e) => {
  if (!pointerStart) return;
  const dx = e.clientX - pointerStart.x;
  const dy = e.clientY - pointerStart.y;
  pointerStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
  else move(dy > 0 ? 'down' : 'up');
});
window.addEventListener('pointercancel', () => { pointerStart = null; });

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'continue') {
    keepPlaying = true;
    hideOverlay();
  } else if (btn.dataset.act === 'new') {
    reset();
  }
});

btnNew.addEventListener('click', reset);
btnSound.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('2048.muted', muted ? '1' : '0');
  btnSound.textContent = muted ? '🔇' : '🔊';
});

// ---------- 启动 ----------
btnSound.textContent = muted ? '🔇' : '🔊';
bestEl.textContent = best;
reset();

})();
