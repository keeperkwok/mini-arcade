(() => {
'use strict';

/* ==================== 常量 ==================== */
const DIFFS = {
  easy:   { name: '入门', clues: 46 },
  medium: { name: '简单', clues: 40 },
  hard:   { name: '中等', clues: 34 },
  expert: { name: '困难', clues: 29 },
  master: { name: '专家', clues: 25 },
};
const DIFF_KEYS = Object.keys(DIFFS);
const HINTS_PER_GAME = 3;
const GEN_BUDGET_MS = 900;
const NOTE_MASK = 0x3fe; // bits 1..9

const boardEl = document.getElementById('board');
const overlayEl = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const timeEl = document.getElementById('time');
const mistakesEl = document.getElementById('mistakes');
const bestEl = document.getElementById('best');
const digitsEl = document.getElementById('digits');
const diffEl = document.getElementById('diff');
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');
const btnUndo = document.getElementById('btnUndo');
const btnNote = document.getElementById('btnNote');
const btnErase = document.getElementById('btnErase');
const btnHint = document.getElementById('btnHint');

/* ==================== 单位与邻居 ==================== */
const PEERS = [];
(function buildPeers() {
  for (let i = 0; i < 81; i++) {
    const r = (i / 9) | 0, c = i % 9;
    const set = new Set();
    const boxRow = ((r / 3) | 0) * 3, boxCol = ((c / 3) | 0) * 3;
    for (let k = 0; k < 9; k++) {
      set.add(r * 9 + k);                 // 同行
      set.add(k * 9 + c);                 // 同列
      set.add((boxRow + ((k / 3) | 0)) * 9 + boxCol + (k % 3)); // 同宫
    }
    set.delete(i);
    PEERS.push(Array.from(set));
  }
})();

/* ==================== 状态 ==================== */
let diff = localStorage.getItem('sudoku.diff') || 'medium';
if (!DIFFS[diff]) diff = 'medium';

let solution = null;
let puzzle = [];
let values = [];
let notes = [];
let givenFlags = [];
let sel = -1;
let noteMode = false;
let pick = 0;
let mistakes = 0;
let hintsLeft = HINTS_PER_GAME;
let seconds = 0;
let timerId = null;
let generating = false;
let finished = false;
let history = [];
let cells = [];
let muted = localStorage.getItem('sudoku.muted') === '1';

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
const soundPlace = () => tone(600, 0.05, 'triangle', 0.09, 0, 760);
const soundNote  = () => tone(880, 0.03, 'square', 0.05);
const soundErase = () => tone(240, 0.06, 'sine', 0.07, 0, 160);
const soundBad   = () => tone(160, 0.2, 'sawtooth', 0.1, 0, 90);
const soundHint  = () => [784, 1047].forEach((f, i) => tone(f, 0.12, 'sine', 0.1, i * 0.07));
const soundWin   = () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, i * 0.09));
const unlockAudio = () => {
  ensureAudio();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

/* ==================== 小工具 ==================== */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const fmtTime = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
function popcount(x) {
  x -= (x >> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >> 24;
}

/* ==================== 题面生成 ==================== */
function genFull() {
  const g = new Array(81).fill(0);
  const rowM = new Array(9).fill(0);
  const colM = new Array(9).fill(0);
  const boxM = new Array(9).fill(0);
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  function step(i) {
    if (i === 81) return true;
    const r = (i / 9) | 0, c = i % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
    const used = rowM[r] | colM[c] | boxM[b];
    const cand = shuffle(digits.filter((d) => !(used & (1 << d))));
    for (const d of cand) {
      const bit = 1 << d;
      g[i] = d; rowM[r] |= bit; colM[c] |= bit; boxM[b] |= bit;
      if (step(i + 1)) return true;
      g[i] = 0; rowM[r] &= ~bit; colM[c] &= ~bit; boxM[b] &= ~bit;
    }
    return false;
  }
  step(0);
  return g;
}

function usedMask(g, i) {
  let m = 0;
  const peers = PEERS[i];
  for (let k = 0; k < peers.length; k++) {
    const v = g[peers[k]];
    if (v) m |= 1 << v;
  }
  return m;
}

// 统计解的数量(达到 limit 即停止)
function countSolutions(grid, limit) {
  const g = grid.slice();
  let count = 0;

  function solve() {
    if (count >= limit) return;
    let best = -1, bestFree = 0, bestBits = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const free = (~usedMask(g, i)) & NOTE_MASK;
      const bits = popcount(free);
      if (bits === 0) return;
      if (bits < bestBits) { bestBits = bits; best = i; bestFree = free; }
    }
    if (best < 0) { count++; return; }
    let m = bestFree;
    while (m) {
      const bit = m & -m;
      m -= bit;
      g[best] = Math.log2(bit) | 0;
      solve();
      g[best] = 0;
      if (count >= limit) return;
    }
  }
  solve();
  return count;
}

function dig(solutionGrid, targetClues) {
  const p = solutionGrid.slice();
  let clues = 81;
  const t0 = Date.now();
  for (let pass = 0; pass < 3 && clues > targetClues; pass++) {
    const order = shuffle(Array.from({ length: 81 }, (_, i) => i));
    let moved = false;
    for (const i of order) {
      if (clues <= targetClues) break;
      if (Date.now() - t0 > GEN_BUDGET_MS) break;
      if (p[i] === 0) continue;
      p[i] = 0;
      if (countSolutions(p, 2) === 1) { clues--; moved = true; }
      else p[i] = solutionGrid[i];
    }
    if (!moved || Date.now() - t0 > GEN_BUDGET_MS) break;
  }
  return { puzzle: p, clues };
}

/* ==================== 局面生命周期 ==================== */
function startPuzzle() {
  stopTimer();
  seconds = 0;
  mistakes = 0;
  hintsLeft = HINTS_PER_GAME;
  sel = -1;
  noteMode = false;
  pick = 0;
  finished = false;
  history = [];
  timeEl.textContent = '0:00';
  mistakesEl.textContent = '0';
  updateBestLabel();
  updateDiffButtons();
  generating = true;
  showOverlay('<div class="spinner"></div><p class="hint">正在出题…</p>');
  setTimeout(() => {
    solution = genFull();
    const dug = dig(solution, DIFFS[diff].clues);
    puzzle = dug.puzzle;
    values = puzzle.slice();
    notes = new Array(81).fill(0);
    givenFlags = puzzle.map((v) => v !== 0);
    generating = false;
    hideOverlay();
    buildBoard();
    refresh();
    startTimer();
    save();
  }, 30);
}

function resumeFrom(saveObj) {
  diff = saveObj.diff;
  solution = saveObj.solution;
  puzzle = saveObj.puzzle;
  values = saveObj.values;
  notes = saveObj.notes;
  mistakes = saveObj.mistakes || 0;
  hintsLeft = saveObj.hintsLeft == null ? HINTS_PER_GAME : saveObj.hintsLeft;
  seconds = saveObj.seconds || 0;
  sel = saveObj.sel == null ? -1 : saveObj.sel;
  finished = false;
  givenFlags = puzzle.map((v) => v !== 0);
  history = [];
  noteMode = false;
  pick = 0;
  timeEl.textContent = fmtTime(seconds);
  mistakesEl.textContent = String(mistakes);
  updateBestLabel();
  updateDiffButtons();
  buildBoard();
  refresh();
  startTimer();
}

function snapshot() {
  history.push({ v: values.slice(), n: notes.slice(), m: mistakes, sel });
  if (history.length > 120) history.shift();
}

function undo() {
  if (finished || !history.length) return;
  const s = history.pop();
  values = s.v; notes = s.n; mistakes = s.m; sel = s.sel;
  mistakesEl.textContent = String(mistakes);
  soundErase();
  refresh();
  save();
}

/* ==================== 交互 ==================== */
function conflicts() {
  const bad = new Set();
  for (let i = 0; i < 81; i++) {
    const v = values[i];
    if (!v) continue;
    const peers = PEERS[i];
    for (let k = 0; k < peers.length; k++) {
      if (values[peers[k]] === v) { bad.add(i); bad.add(peers[k]); }
    }
  }
  return bad;
}

function isBad(i) {
  const v = values[i];
  if (!v) return false;
  const peers = PEERS[i];
  for (let k = 0; k < peers.length; k++) if (values[peers[k]] === v) return true;
  return false;
}

function inputDigit(d) {
  if (finished || generating) return;
  if (sel < 0) {
    for (let i = 0; i < 81; i++) if (!givenFlags[i] && !values[i]) { sel = i; break; }
    if (sel < 0) return;
  }
  if (givenFlags[sel]) return;
  if (noteMode) {
    if (values[sel]) return;
    snapshot();
    notes[sel] ^= 1 << d;
    soundNote();
    refresh();
    save();
    return;
  }
  if (values[sel] === d) return;
  snapshot();
  const prevWrong = isBad(sel);
  values[sel] = d;
  notes[sel] = 0;
  pick = d;
  const wrong = isBad(sel);
  if (wrong && !prevWrong) {
    mistakes++;
    mistakesEl.textContent = String(mistakes);
    soundBad();
  } else {
    soundPlace();
  }
  if (wrong) clearPeerNotes(d, sel);
  refresh();
  animateCell(sel);
  checkWin();
  save();
}

function clearPeerNotes(d, except) {
  const bit = 1 << d;
  const peers = PEERS[except];
  for (let k = 0; k < peers.length; k++) {
    const j = peers[k];
    if (values[j]) continue;
    notes[j] &= ~bit;
  }
}

function inputErase() {
  if (finished || generating || sel < 0 || givenFlags[sel]) return;
  if (!values[sel] && !notes[sel]) return;
  snapshot();
  values[sel] = 0;
  notes[sel] = 0;
  soundErase();
  refresh();
  save();
}

function useHint() {
  if (finished || generating || hintsLeft <= 0) return;
  let pool = [];
  if (sel >= 0 && !givenFlags[sel] && values[sel] !== solution[sel]) pool = [sel];
  else {
    for (let i = 0; i < 81; i++) if (!givenFlags[i] && values[i] !== solution[i]) pool.push(i);
  }
  if (!pool.length) return;
  const i = pool[(Math.random() * pool.length) | 0];
  snapshot();
  values[i] = solution[i];
  notes[i] = 0;
  clearPeerNotes(solution[i], i);
  sel = i;
  hintsLeft--;
  soundHint();
  refresh();
  animateCell(i);
  checkWin();
  save();
}

function moveSel(dr, dc) {
  if (sel < 0) { sel = 40; refresh(); return; }
  const r = (((sel / 9) | 0) + dr + 9) % 9;
  const c = ((sel % 9) + dc + 9) % 9;
  sel = r * 9 + c;
  refresh();
  const el = cells[sel].el;
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
}

function checkWin() {
  for (let i = 0; i < 81; i++) if (!values[i]) return;
  if (conflicts().size) return;
  finished = true;
  stopTimer();
  const prev = Number(localStorage.getItem('sudoku.best.' + diff) || 0);
  const isNew = !prev || seconds < prev;
  if (isNew) localStorage.setItem('sudoku.best.' + diff, String(seconds));
  updateBestLabel();
  localStorage.removeItem('sudoku.save');
  soundWin();
  if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
  setTimeout(() => showOverlay(winHTML(isNew, prev)), 420);
}

/* ==================== 渲染 ==================== */
function cellSize() {
  const avail = Math.min(window.innerWidth, 560) - 48;
  return Math.max(28, Math.min(56, Math.floor(avail / 9)));
}

function buildBoard() {
  document.body.style.setProperty('--cell', cellSize() + 'px');
  if (cells.length === 81) return;
  boardEl.innerHTML = '';
  cells = [];
  for (let i = 0; i < 81; i++) {
    const r = (i / 9) | 0, c = i % 9;
    const el = document.createElement('button');
    el.className = 'cell' + (c === 2 || c === 5 ? ' rb' : '') + (r === 2 || r === 5 ? ' cb' : '');
    el.dataset.i = i;
    el.innerHTML = '<span class="v"></span><span class="notes"></span>';
    boardEl.appendChild(el);
    cells.push({ el, v: el.firstChild, n: el.lastChild });
  }
}

function refresh() {
  const bad = conflicts();
  const selVal = sel >= 0 ? values[sel] : 0;
  const sr = sel >= 0 ? (sel / 9) | 0 : -1;
  const sc = sel >= 0 ? sel % 9 : -1;
  const sBox = sel >= 0 ? ((sr / 3) | 0) * 3 + ((sc / 3) | 0) : -1;

  for (let i = 0; i < 81; i++) {
    const r = (i / 9) | 0, c = i % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
    const el = cells[i].el;
    const v = values[i];
    const cls = ['cell'];
    if (c === 2 || c === 5) cls.push('rb');
    if (r === 2 || r === 5) cls.push('cb');
    if (givenFlags[i]) cls.push('given');
    else cls.push('filled');
    if (i === sel) cls.push('sel');
    else if (v && selVal && v === selVal) cls.push('same');
    else if (sel >= 0 && (r === sr || c === sc || b === sBox)) cls.push('peer');
    if (v && bad.has(i)) cls.push('bad');
    el.className = cls.join(' ');

    cells[i].v.textContent = v || '';
    const n = notes[i];
    if (!v && n) {
      let html = '';
      for (let d = 1; d <= 9; d++) html += '<i>' + (n & (1 << d) ? d : '') + '</i>';
      cells[i].n.innerHTML = html;
    } else if (cells[i].n.firstChild) {
      cells[i].n.innerHTML = '';
    }
  }

  const counts = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) if (values[i]) counts[values[i]]++;
  for (const btn of digitsEl.children) {
    const d = Number(btn.dataset.d);
    const left = 9 - counts[d];
    btn.disabled = left <= 0 || finished || generating;
    btn.lastChild.textContent = left > 0 ? left : '';
    btn.classList.toggle('on', pick === d);
  }
  btnNote.classList.toggle('active', noteMode);
  btnUndo.disabled = !history.length || finished;
  btnHint.disabled = hintsLeft <= 0 || finished;
  btnHint.lastChild.textContent = '提示' + (hintsLeft > 0 ? hintsLeft : '');
  btnErase.disabled = sel < 0 || (sel >= 0 && givenFlags[sel]);
}

function animateCell(i) {
  const el = cells[i] && cells[i].el;
  if (!el) return;
  el.classList.add('pop');
  setTimeout(() => el.classList.remove('pop'), 320);
}

function updateBestLabel() {
  const b = Number(localStorage.getItem('sudoku.best.' + diff) || 0);
  bestEl.textContent = b ? fmtTime(b) : '--';
}

function updateDiffButtons() {
  for (const btn of diffEl.querySelectorAll('button')) {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  }
}

/* ==================== overlay ==================== */
function showOverlay(html) { overlayContent.innerHTML = html; overlayEl.classList.add('show'); }
function hideOverlay() { overlayEl.classList.remove('show'); }

function winHTML(isNew, prev) {
  const sub = isNew
    ? (prev ? '🏆 新纪录!原纪录 ' + fmtTime(prev) : '🏆 首个纪录!')
    : '最佳 ' + fmtTime(prev);
  return '<div class="ov-emoji">🎯</div>' +
    '<h2>完成!</h2>' +
    '<p class="final-score">' + fmtTime(seconds) + '</p>' +
    '<p class="final-sub">' + DIFFS[diff].name + ' · 错误 ' + mistakes + ' 次 · ' + sub + '</p>' +
    '<div class="ov-actions">' +
    '<button class="primary" data-act="next">下一题</button>' +
    '<button class="ghost" data-act="close">回看盘面</button>' +
    '</div>';
}

/* ==================== 计时与存档 ==================== */
function startTimer() {
  stopTimer();
  timerId = setInterval(() => {
    seconds++;
    timeEl.textContent = fmtTime(seconds);
    if (seconds % 5 === 0) save();
  }, 1000);
}
function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}

function save() {
  if (finished || generating) return;
  try {
    localStorage.setItem('sudoku.save', JSON.stringify({
      diff, puzzle, solution, values, notes, mistakes, hintsLeft, seconds, sel,
    }));
  } catch (e) { /* 空间不足时忽略 */ }
}

/* ==================== 输入绑定 ==================== */
let pressTimer = null, pressedI = -1, longFired = false;

boardEl.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.cell');
  if (!el || finished || generating) return;
  pressedI = Number(el.dataset.i);
  longFired = false;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    longFired = true;
    sel = pressedI;
    if (!givenFlags[sel] && !values[sel]) noteMode = true;
    refresh();
    soundNote();
    if (navigator.vibrate) navigator.vibrate(18);
  }, 420);
});
boardEl.addEventListener('pointermove', () => clearTimeout(pressTimer));
boardEl.addEventListener('pointerup', () => clearTimeout(pressTimer));
boardEl.addEventListener('pointercancel', () => clearTimeout(pressTimer));

boardEl.addEventListener('click', (e) => {
  clearTimeout(pressTimer);
  if (longFired) { longFired = false; return; }
  const el = e.target.closest('.cell');
  if (!el || finished || generating) return;
  const i = Number(el.dataset.i);
  if (sel === i && !givenFlags[i] && values[i] && !noteMode) { inputErase(); return; }
  sel = i;
  if (givenFlags[i]) noteMode = false;
  refresh();
});

digitsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-d]');
  if (!btn) return;
  if (sel < 0) { sel = 40; refresh(); }
  inputDigit(Number(btn.dataset.d));
});

overlayEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'next') startPuzzle();
  else if (btn.dataset.act === 'close') hideOverlay();
});

btnNew.addEventListener('click', startPuzzle);
btnUndo.addEventListener('click', undo);
btnErase.addEventListener('click', inputErase);
btnHint.addEventListener('click', useHint);
btnNote.addEventListener('click', () => {
  noteMode = !noteMode;
  refresh();
  soundNote();
});

btnSound.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('sudoku.muted', muted ? '1' : '0');
  btnSound.textContent = muted ? '🔇' : '🔊';
});

diffEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-diff]');
  if (!btn || generating) return;
  const next = btn.dataset.diff;
  const saved = loadSave();
  if (saved && saved.diff === next) { stopTimer(); resumeFrom(saved); return; }
  diff = next;
  localStorage.setItem('sudoku.diff', diff);
  localStorage.removeItem('sudoku.save');
  startPuzzle();
});

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k >= '1' && k <= '9') { inputDigit(Number(k)); e.preventDefault(); return; }
  if (k === '0' || k === 'Backspace' || k === 'Delete') { inputErase(); e.preventDefault(); return; }
  if (k === 'ArrowUp') { moveSel(-1, 0); e.preventDefault(); return; }
  if (k === 'ArrowDown') { moveSel(1, 0); e.preventDefault(); return; }
  if (k === 'ArrowLeft') { moveSel(0, -1); e.preventDefault(); return; }
  if (k === 'ArrowRight') { moveSel(0, 1); e.preventDefault(); return; }
  const low = k.toLowerCase();
  if (low === 'n') { noteMode = !noteMode; refresh(); }
  else if (low === 'u') undo();
  else if (low === 'h') useHint();
  else if (low === 'r') startPuzzle();
});

window.addEventListener('resize', () => {
  document.body.style.setProperty('--cell', cellSize() + 'px');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopTimer();
  else if (!finished && !generating && solution) startTimer();
});

/* ==================== 存档读取 ==================== */
function loadSave() {
  try {
    const raw = localStorage.getItem('sudoku.save');
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!Array.isArray(s.puzzle) || !Array.isArray(s.values) || !Array.isArray(s.solution)) return null;
    if (s.puzzle.length !== 81 || s.values.length !== 81 || s.solution.length !== 81) return null;
    if (!DIFFS[s.diff]) return null;
    for (let i = 0; i < 81; i++) if (s.puzzle[i] && s.puzzle[i] !== s.solution[i]) return null;
    return s;
  } catch (e) { return null; }
}

/* ==================== 键盘面板构建 ==================== */
digitsEl.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) =>
  '<button data-d="' + d + '">' + d + '<i></i></button>').join('');

/* ==================== 启动 ==================== */
btnSound.textContent = muted ? '🔇' : '🔊';
const saved = loadSave();
if (saved) {
  resumeFrom(saved);
} else {
  startPuzzle();
}

})();
