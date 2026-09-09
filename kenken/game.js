(() => {
'use strict';

/* 算独 KenKen：每行每列 1~N 不重复；每个粗线笼子带「目标数 + 运算」，
   笼内数字按该运算组合必须能得到目标数。单格笼直接给出数字。 */

const DIFFS = {
  easy:   { n: 4, maxCage: 2, singleP: 0.16, fancy: 0.25, minSingle: 1, label: '四宫' },
  medium: { n: 5, maxCage: 3, singleP: 0.13, fancy: 0.35, minSingle: 1, label: '五宫' },
  hard:   { n: 6, maxCage: 3, singleP: 0.11, fancy: 0.45, label: '六宫' },
  expert: { n: 6, maxCage: 4, singleP: 0.07, fancy: 0.6, label: '六宫·难' },
};
const DIFF_KEYS = Object.keys(DIFFS);
const HINTS_PER_GAME = 3;
const GEN_BUDGET_MS = 1500;
const NODE_LIMIT = 60000;

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

let diff = localStorage.getItem('kenken.diff') || 'medium';
if (!DIFFS[diff]) diff = 'medium';

let N = DIFFS[diff].n;
let solution = [];
let cages = [];
let cellCage = [];
let values = [];
let notes = [];
let givenFlags = [];
let sel = -1;
let noteMode = false;
let mistakes = 0;
let hintsLeft = HINTS_PER_GAME;
let seconds = 0;
let timerId = null;
let busy = false;
let finished = false;
let history = [];
let cells = [];

/* ==================== 音效（共享层） ==================== */
const sfx = window.Sfx.create({ storageKey: 'kenken.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';
const sndPlace = () => sfx.tone(600, 0.05, 'triangle', 0.09, 0, 760);
const sndNote = () => sfx.tone(880, 0.03, 'square', 0.05);
const sndErase = () => sfx.tone(240, 0.06, 'sine', 0.07, 0, 160);
const sndBad = () => sfx.tone(150, 0.2, 'sawtooth', 0.1, 0, 90);
const sndHint = () => sfx.melody([784, 1047]);
const sndWin = () => sfx.melody([523, 659, 784, 1047, 1319], 0.09);
window.addEventListener('pointerdown', () => sfx.resume());
window.addEventListener('keydown', () => sfx.resume());

/* ==================== 小工具 ==================== */
const rint = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rint(a.length)];
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rint(i + 1);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
const fmtTime = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const bestKey = () => 'kenken.best.' + diff;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
};

/* ==================== 生成：拉丁方 ==================== */
function genLatin(n) {
  const grid = new Array(n * n).fill(0);
  const rowMask = new Array(n).fill(0);
  const colMask = new Array(n).fill(0);
  function fill(i) {
    if (i >= n * n) return true;
    const r = (i / n) | 0, c = i % n;
    for (const v of shuffle(Array.from({ length: n }, (_, k) => k + 1))) {
      if ((rowMask[r] | colMask[c]) & (1 << v)) continue;
      grid[i] = v; rowMask[r] |= 1 << v; colMask[c] |= 1 << v;
      if (fill(i + 1)) return true;
      grid[i] = 0; rowMask[r] &= ~(1 << v); colMask[c] &= ~(1 << v);
    }
    return false;
  }
  fill(0);
  return grid;
}

/* ==================== 生成：笼子划分 + 运算 ==================== */
function evalOp(op, vs) {
  if (op === '+') return vs.reduce((a, b) => a + b, 0);
  if (op === '×') return vs.reduce((a, b) => a * b, 1);
  if (op === '-') return Math.abs(vs[0] - vs[1]);
  return Math.max(vs[0], vs[1]) / Math.min(vs[0], vs[1]);
}

function buildCages(cfg) {
  const n = cfg.n, total = n * n;
  const owner = new Array(total).fill(-1);
  const list = [];
  for (const start of shuffle(Array.from({ length: total }, (_, i) => i))) {
    if (owner[start] >= 0) continue;
    const ci = list.length;
    const cage = [start];
    owner[start] = ci;
    // minSingle: 入门档至少留一个单格已知笼，否则低概率下整盘没有已知数，新手无处下手
    const want = (cfg.minSingle && !list.length) ? 1
      : Math.random() < cfg.singleP ? 1 : 2 + rint(cfg.maxCage - 1);
    while (cage.length < want) {
      const tail = cage[cage.length - 1];
      const r = (tail / n) | 0, c = tail % n;
      const near = [];
      if (r > 0 && owner[tail - n] < 0) near.push(tail - n);
      if (r < n - 1 && owner[tail + n] < 0) near.push(tail + n);
      if (c > 0 && owner[tail - 1] < 0) near.push(tail - 1);
      if (c < n - 1 && owner[tail + 1] < 0) near.push(tail + 1);
      if (!near.length) break;
      const nx = pick(near);
      cage.push(nx); owner[nx] = ci;
    }
    cage.sort((a, b) => a - b);
    list.push({ cells: cage, op: '', target: 0 });
  }
  for (const cage of list) {
    const vs = cage.cells.map((i) => solution[i]);
    if (vs.length === 1) { cage.op = '='; cage.target = vs[0]; continue; }
    const plain = ['+', '×'];
    const fancy = [];
    if (vs.length === 2 && vs[0] !== vs[1]) { fancy.push('-', '÷'); }
    const useFancy = fancy.length && Math.random() < cfg.fancy;
    cage.op = useFancy ? pick(fancy) : pick(plain);
    cage.target = evalOp(cage.op, vs);
  }
  return list;
}

// 笼内约束：filled 已填值，rest 还剩几个空格
function cageOK(cage, filled, rest) {
  const t = cage.target;
  if (cage.op === '=') return filled[0] === t;
  if (cage.op === '+') {
    const s = filled.reduce((a, b) => a + b, 0);
    return s + rest <= t && s + rest * N >= t;
  }
  if (cage.op === '×') {
    const p = filled.reduce((a, b) => a * b, 1);
    if (p === 0 || t % p !== 0) return false;
    const q = t / p;
    return q >= 1 && q <= Math.pow(N, rest);
  }
  if (cage.op === '-') {
    if (filled.length >= 2) return Math.abs(filled[0] - filled[1]) === t;
    if (filled.length === 1) { const v = filled[0]; return v + t <= N || v - t >= 1; }
    return true;
  }
  if (cage.op === '÷') {
    if (filled.length >= 2) {
      const hi = Math.max(filled[0], filled[1]), lo = Math.min(filled[0], filled[1]);
      return lo > 0 && hi % lo === 0 && hi / lo === t;
    }
    if (filled.length === 1) { const v = filled[0]; return v * t <= N || (t > 0 && v % t === 0 && v / t <= N); }
    return true;
  }
  return true;
}

// 统计解的数量（到 limit 就停），保证题目唯一解
function countSolutions(limit) {
  const total = N * N;
  const grid = new Array(total).fill(0);
  const rowMask = new Array(N).fill(0);
  const colMask = new Array(N).fill(0);
  const cageFilled = cages.map(() => []);
  const cageRest = cages.map((c) => c.cells.length);
  let nodes = 0, found = 0, empties = total;

  cages.forEach((c, ci) => {
    if (c.op !== '=') return;
    const i = c.cells[0];
    grid[i] = c.target;
    rowMask[(i / N) | 0] |= 1 << c.target;
    colMask[i % N] |= 1 << c.target;
    cageFilled[ci].push(c.target);
    cageRest[ci]--;
    empties--;
  });

  function search() {
    if (!empties) { found++; return found >= limit; }
    if (nodes++ > NODE_LIMIT) return true; // 超时当作"不唯一"，换题
    let bestI = -1, bestC = null, bestLen = 99;
    for (let i = 0; i < total; i++) {
      if (grid[i]) continue;
      const r = (i / N) | 0, c = i % N, ci = cellCage[i];
      const cand = [];
      for (let v = 1; v <= N; v++) {
        if ((rowMask[r] | colMask[c]) & (1 << v)) continue;
        if (!cageOK(cages[ci], cageFilled[ci].concat(v), cageRest[ci] - 1)) continue;
        cand.push(v);
      }
      if (cand.length < bestLen) { bestLen = cand.length; bestI = i; bestC = cand; if (!cand.length) break; }
    }
    if (bestI < 0 || !bestC.length) return false;
    const r = (bestI / N) | 0, c = bestI % N, ci = cellCage[bestI];
    for (const v of bestC) {
      grid[bestI] = v; rowMask[r] |= 1 << v; colMask[c] |= 1 << v;
      cageFilled[ci].push(v); cageRest[ci]--; empties--;
      if (search()) return true;
      grid[bestI] = 0; rowMask[r] &= ~(1 << v); colMask[c] &= ~(1 << v);
      cageFilled[ci].pop(); cageRest[ci]++; empties++;
    }
    return false;
  }
  search();
  return found;
}

function genPuzzle() {
  const cfg = DIFFS[diff];
  N = cfg.n;
  const deadline = performance.now() + GEN_BUDGET_MS;
  for (const mc of [cfg.maxCage, 2, 1]) {
    const useCfg = Object.assign({}, cfg, { maxCage: mc });
    for (let attempt = 0; attempt < 80; attempt++) {
      solution = genLatin(N);
      cages = buildCages(useCfg);
      cellCage = new Array(N * N).fill(0);
      cages.forEach((c, ci) => c.cells.forEach((i) => { cellCage[i] = ci; }));
      if (countSolutions(2) === 1) return true;
      if (performance.now() > deadline && mc === cfg.maxCage) break;
    }
  }
  return false;
}

/* ==================== 生命周期 ==================== */
function newPuzzle() {
  if (busy) return;
  busy = true;
  stopTimer();
  finished = false;
  seconds = 0; mistakes = 0; hintsLeft = HINTS_PER_GAME;
  noteMode = false; btnNote.classList.remove('on');
  history = []; sel = -1;
  showOverlay('<div class="ov-emoji">🧮</div><h2>出题中…</h2><p class="hint">正在生成唯一解的算独</p>');
  setTimeout(() => {
    genPuzzle();
    values = new Array(N * N).fill(0);
    notes = new Array(N * N).fill(0);
    givenFlags = new Array(N * N).fill(false);
    for (const c of cages) if (c.op === '=') { values[c.cells[0]] = c.target; givenFlags[c.cells[0]] = true; }
    buildBoard();
    render();
    busy = false;
    hideOverlay();
    startTimer();
    save();
  }, 30);
}

function resumeFrom(o) {
  N = DIFFS[o.diff].n;
  cages = o.cages.map((s) => {
    const p = s.split(':');
    const h = p[0].split('|');
    return { cells: p[1].split(',').map(Number), op: h[0], target: +h[1] };
  });
  cellCage = new Array(N * N).fill(0);
  cages.forEach((c, ci) => c.cells.forEach((i) => { cellCage[i] = ci; }));
  solution = o.sol.split('').map(Number);
  values = o.values.slice(0, N * N);
  notes = o.notes.slice(0, N * N);
  givenFlags = new Array(N * N).fill(false);
  for (const c of cages) if (c.op === '=') givenFlags[c.cells[0]] = true;
  sel = o.sel == null ? -1 : o.sel;
  seconds = o.seconds || 0;
  mistakes = o.mistakes || 0;
  hintsLeft = o.hintsLeft == null ? HINTS_PER_GAME : o.hintsLeft;
  finished = false;
  history = [];
  buildBoard();
  render();
  hideOverlay();
  startTimer();
}

function snapshot() { history.push({ v: values.slice(), n: notes.slice() }); if (history.length > 150) history.shift(); }

function undo() {
  if (busy || finished) return;
  const s = history.pop();
  if (!s) return;
  values = s.v; notes = s.n;
  sndErase();
  render(); save();
}

/* ==================== 存档 ==================== */
function save() {
  if (finished || busy) return;
  store.set('kenken.save', JSON.stringify({
    diff, values, notes, seconds, mistakes, hintsLeft, sel,
    sol: solution.join(''),
    cages: cages.map((c) => c.op + '|' + c.target + ':' + c.cells.join(',')),
  }));
}
function loadSave() {
  const raw = store.get('kenken.save');
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return o && Array.isArray(o.values) && o.diff === diff && Array.isArray(o.cages) && o.cages.length ? o : null;
  } catch (e) { return null; }
}

/* ==================== 计时 ==================== */
function startTimer() {
  stopTimer();
  timeEl.textContent = fmtTime(seconds);
  timerId = setInterval(() => {
    seconds++;
    timeEl.textContent = fmtTime(seconds);
    if (seconds % 5 === 0) save();
  }, 1000);
}
function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

/* ==================== 冲突 ==================== */
function conflicts() {
  const bad = new Set();
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      for (let k = c + 1; k < N; k++) {
        const a = values[r * N + c], b = values[r * N + k];
        if (a && a === b) { bad.add(r * N + c); bad.add(r * N + k); }
        const d = values[c * N + r], e = values[k * N + r];
        if (d && d === e) { bad.add(c * N + r); bad.add(k * N + r); }
      }
    }
  }
  for (const cage of cages) {
    const filled = [];
    let rest = 0, first = -1;
    cage.cells.forEach((i, k) => {
      if (values[i]) { filled.push(values[i]); if (first < 0) first = k; } else rest++;
    });
    if (!filled.length || cageOK(cage, filled, rest)) continue;
    for (let k = 0; k < first + filled.length; k++) bad.add(cage.cells[k]);
  }
  return bad;
}

function isComplete() {
  for (let i = 0; i < N * N; i++) if (!values[i]) return false;
  return conflicts().size === 0;
}

/* ==================== 渲染 ==================== */
function buildBoard() {
  boardEl.innerHTML = '';
  cells = [];
  boardEl.style.gridTemplateColumns = 'repeat(' + N + ', 1fr)';
  for (let i = 0; i < N * N; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.i = String(i);
    const lab = document.createElement('span');
    lab.className = 'cage-label';
    const num = document.createElement('span');
    num.className = 'num';
    const nt = document.createElement('span');
    nt.className = 'notes';
    el.appendChild(lab); el.appendChild(num); el.appendChild(nt);
    boardEl.appendChild(el);
    cells.push({ el, num, notesEl: nt, label: lab });
  }
}

const notesText = (mask) => {
  const out = [];
  for (let d = 1; d <= N; d++) if (mask & (1 << d)) out.push(d);
  return out.join(' ');
};

function render() {
  const bad = conflicts();
  const selVal = sel >= 0 ? values[sel] : 0;
  const sr = sel >= 0 ? (sel / N) | 0 : -1;
  const sc = sel >= 0 ? sel % N : -1;
  const selCage = sel >= 0 ? cellCage[sel] : -1;
  for (let i = 0; i < N * N; i++) {
    const r = (i / N) | 0, c = i % N, ci = cellCage[i];
    const cls = ['cell'];
    if (c === N - 1 || cellCage[i + 1] !== ci) cls.push('rb');
    if (r === N - 1 || cellCage[i + N] !== ci) cls.push('cb');
    if (r === 0 || cellCage[i - N] !== ci) cls.push('lt');
    if (c === 0 || cellCage[i - 1] !== ci) cls.push('lf');
    if (givenFlags[i]) cls.push('given');
    else if (values[i]) cls.push('filled');
    if (i === sel) cls.push('sel');
    else if (values[i] && selVal && values[i] === selVal) cls.push('same');
    else if (sel >= 0 && (r === sr || c === sc || ci === selCage)) cls.push('peer');
    if (values[i] && bad.has(i)) cls.push('bad');
    cells[i].el.className = cls.join(' ');
    const cage = cages[ci];
    cells[i].label.textContent = cage && cage.cells[0] === i ? (cage.op === '=' ? cage.target + '=' : cage.target + cage.op) : '';
    cells[i].num.textContent = values[i] || '';
    cells[i].notesEl.textContent = values[i] ? '' : notesText(notes[i]);
  }
  mistakesEl.textContent = String(mistakes);
  timeEl.textContent = fmtTime(seconds);
  const b = Number(store.get(bestKey()) || 0);
  bestEl.textContent = b ? fmtTime(b) : '--';
  renderDigits();
}

function renderDigits() {
  const used = new Array(N + 1).fill(0);
  for (const v of values) if (v) used[v]++;
  for (const b of digitsEl.querySelectorAll('button')) {
    const d = +b.dataset.d;
    if (d > N) { b.hidden = true; continue; }
    b.hidden = false;
    const left = N - used[d];
    b.disabled = left <= 0 && !noteMode;
    b.innerHTML = d + '<small>' + left + '</small>';
    b.className = noteMode ? 'noteon' : '';
  }
}

/* ==================== 遮罩 ==================== */
function showOverlay(html) { overlayContent.innerHTML = html; overlayEl.classList.add('show'); }
function hideOverlay() { overlayEl.classList.remove('show'); }

function showWin() {
  const prev = Number(store.get(bestKey()) || 0);
  const isNew = !prev || seconds < prev;
  if (isNew) store.set(bestKey(), String(seconds));
  store.del('kenken.save');
  sndWin();
  showOverlay(
    '<div class="ov-emoji">🏆</div><h2>解开了</h2>' +
    '<p class="final-score">' + fmtTime(seconds) + '</p>' +
    '<p class="final-sub">' + DIFFS[diff].label + ' · 错误 ' + mistakes + ' 次 · 提示 ' + (HINTS_PER_GAME - hintsLeft) + ' 次' +
    (isNew ? ' · 新纪录' : ' · 最佳 ' + fmtTime(prev)) + '</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一题</button>' +
    '<button class="ghost" data-act="next">换难度</button></div>');
}

/* ==================== 交互 ==================== */
function put(d) {
  if (busy || finished || sel < 0 || givenFlags[sel]) return;
  snapshot();
  if (noteMode) {
    if (values[sel]) { history.pop(); return; }
    notes[sel] = (notes[sel] & (1 << d)) ? notes[sel] & ~(1 << d) : notes[sel] | (1 << d);
    sndNote();
  } else {
    values[sel] = values[sel] === d ? 0 : d;
    notes[sel] = 0;
    if (values[sel]) {
      if (d !== solution[sel]) { mistakes++; sndBad(); } else sndPlace();
      for (let i = 0; i < N * N; i++) if (i !== sel && !values[i]) notes[i] &= ~(1 << d);
    } else sndErase();
  }
  render();
  if (isComplete()) win();
  else save();
}

function erase() {
  if (busy || finished || sel < 0 || givenFlags[sel]) return;
  if (!values[sel] && !notes[sel]) return;
  snapshot();
  values[sel] = 0; notes[sel] = 0;
  sndErase();
  render(); save();
}

function hint() {
  if (busy || finished || hintsLeft <= 0) return;
  let target = sel >= 0 && !values[sel] && !givenFlags[sel] ? sel : -1;
  if (target < 0) {
    const empty = [];
    for (let i = 0; i < N * N; i++) if (!values[i] && !givenFlags[i]) empty.push(i);
    if (!empty.length) return;
    target = pick(empty);
  }
  snapshot();
  hintsLeft--;
  values[target] = solution[target];
  notes[target] = 0;
  sel = target;
  sndHint();
  render(); save();
  if (isComplete()) win();
}

function win() {
  finished = true;
  stopTimer();
  showWin();
}

function moveSel(dr, dc) {
  if (busy || finished) return;
  if (sel < 0) { sel = 0; render(); return; }
  let nr = ((sel / N) | 0) + dr, nc = (sel % N) + dc;
  if (nr < 0) nr = N - 1; else if (nr >= N) nr = 0;
  if (nc < 0) nc = N - 1; else if (nc >= N) nc = 0;
  sel = nr * N + nc;
  render();
}

boardEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-i]');
  if (!el || busy || finished) return;
  const i = +el.dataset.i;
  if (sel === i && values[i] && !givenFlags[i]) { erase(); return; }
  sel = i;
  render();
});

let pressTimer = null;
boardEl.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-i]');
  if (!el) return;
  pressTimer = setTimeout(() => {
    pressTimer = null;
    noteMode = !noteMode;
    sel = +el.dataset.i;
    render();
    sndNote();
  }, 480);
});
['pointerup', 'pointermove', 'pointercancel'].forEach((t) =>
  boardEl.addEventListener(t, () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }));

digitsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-d]');
  if (b && !b.disabled) put(+b.dataset.d);
});

function setDiff(next) {
  diff = next;
  store.set('kenken.diff', diff);
  store.del('kenken.save');
  N = DIFFS[diff].n;
  for (const btn of diffEl.querySelectorAll('button')) btn.classList.toggle('active', btn.dataset.diff === diff);
  newPuzzle();
}

diffEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-diff]');
  if (!btn || btn.dataset.diff === diff) return;
  setDiff(btn.dataset.diff);
});

overlayEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'again') newPuzzle();
  else if (btn.dataset.act === 'next') setDiff(DIFF_KEYS[(DIFF_KEYS.indexOf(diff) + 1) % DIFF_KEYS.length]);
});

btnNew.addEventListener('click', () => { store.del('kenken.save'); newPuzzle(); });
btnUndo.addEventListener('click', undo);
btnErase.addEventListener('click', erase);
btnHint.addEventListener('click', hint);
btnNote.addEventListener('click', () => { noteMode = !noteMode; render(); });
btnSound.addEventListener('click', () => { btnSound.textContent = sfx.toggle() ? '🔇' : '🔊'; });

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k >= '1' && k <= '9') { if (+k <= N) put(+k); return; }
  if (k === 'ArrowUp') { moveSel(-1, 0); e.preventDefault(); }
  else if (k === 'ArrowDown') { moveSel(1, 0); e.preventDefault(); }
  else if (k === 'ArrowLeft') { moveSel(0, -1); e.preventDefault(); }
  else if (k === 'ArrowRight') { moveSel(0, 1); e.preventDefault(); }
  else if (k === 'Backspace' || k === 'Delete') erase();
  else if (k === 'u' || k === 'U') undo();
  else if (k === 'n' || k === 'N') { noteMode = !noteMode; render(); }
  else if (k === 'h' || k === 'H') hint();
});

window.addEventListener('pagehide', save);

/* ==================== 启动 ==================== */
(function boot() {
  for (let d = 1; d <= 6; d++) {
    const b = document.createElement('button');
    b.dataset.d = String(d);
    b.textContent = String(d);
    digitsEl.appendChild(b);
  }
  for (const btn of diffEl.querySelectorAll('button')) btn.classList.toggle('active', btn.dataset.diff === diff);
  const saved = loadSave();
  if (saved) { resumeFrom(saved); return; }
  N = DIFFS[diff].n;
  solution = []; cages = []; cellCage = new Array(N * N).fill(0);
  values = new Array(N * N).fill(0);
  notes = new Array(N * N).fill(0);
  givenFlags = new Array(N * N).fill(false);
  buildBoard();
  render();
  newPuzzle();
})();

})();
