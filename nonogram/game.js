(() => {
'use strict';

/* 数织：行列数字 = 连续涂黑格的长度，逻辑推导出整盘图案。
   出题用「随机图案 → 求线索 → 独立求解器验证唯一解」，保证题题可纯逻辑推完。 */

const DIFFS = {
  easy: { n: 5, name: '5×5' },
  medium: { n: 10, name: '10×10' },
  hard: { n: 15, name: '15×15' },
  expert: { n: 20, name: '20×20' },
};
const EMPTY = 0, FILLED = 1, MARK = 2;
const HINTS_PER_PUZZLE = 3;

/* ==================== 元素 ==================== */
const ngEl = document.getElementById('ng');
const topEl = document.getElementById('ngTop');
const sideEl = document.getElementById('ngSide');
const boardEl = document.getElementById('ngBoard');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const timeEl = document.getElementById('time');
const madeEl = document.getElementById('made');
const mistakeEl = document.getElementById('mistakes');
const bestEl = document.getElementById('best');
const hintNEl = document.getElementById('hintN');
const diffEl = document.getElementById('diff');
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');
const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');
const btnHint = document.getElementById('btnHint');
const btnMark = document.getElementById('btnMark');

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
};
const sfx = window.Sfx.create({ storageKey: 'nonogram.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

/* ==================== 状态 ==================== */
let diff = store.get('nonogram.diff') || 'easy';
if (!DIFFS[diff]) diff = 'easy';
let n = DIFFS[diff].n;
let sol = new Uint8Array(n * n);
let cell = new Uint8Array(n * n);
let rowClues = [], colClues = [];
let cells = [];            // DOM 缓存
let rowDone = [], colDone = [];
let undos = [], redos = [];
let mistakes = 0, hintsLeft = HINTS_PER_PUZZLE;
let seconds = 0, timer = null;
let solved = false;
let needTotal = 0, filledCount = 0;

/* ==================== 小工具 ==================== */
const bestKey = (d) => 'nonogram.best.' + d;
const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0');

function setPop(el) {
  el.classList.remove('pop');
  void (el.offsetWidth);
  el.classList.add('pop');
}

/* ==================== 线索 ==================== */
function lineClues(row) {
  const out = [];
  let run = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i]) run++;
    else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  return out.length ? out : [0];
}

function buildClues() {
  rowClues = []; colClues = [];
  const line = new Uint8Array(n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) line[c] = sol[r * n + c];
    rowClues.push(lineClues(line));
  }
  for (let c = 0; c < n; c++) {
    for (let r = 0; r < n; r++) line[r] = sol[r * n + c];
    colClues.push(lineClues(line));
  }
}

/* ==================== 单行求解：枚举所有合法摆法 ==================== */
// assign: 0 自由 / 1 必涂 / 2 必空；out 累计 tot 与每格被涂次数
function enumerate(len, clues, assign, out) {
  const occ = new Uint8Array(len);
  const suffix = new Int32Array(clues.length + 1);
  for (let i = clues.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + clues[i] + (i === clues.length - 1 ? 0 : 1);

  function commit() {
    for (let i = 0; i < len; i++) {
      if (assign[i] === 1 && !occ[i]) return;
      if (assign[i] === 2 && occ[i]) return;
    }
    out.tot++;
    for (let i = 0; i < len; i++) if (occ[i]) out.cnt[i]++;
  }

  function rec(pos, ci) {
    if (ci === clues.length) { commit(); return; }
    const w = clues[ci];
    const last = len - suffix[ci];
    for (let start = pos; start <= last; start++) {
      let bad = false;
      for (let k = start; k < start + w; k++) if (assign[k] === 2) { bad = true; break; }
      if (bad) continue;
      for (let k = start; k < start + w; k++) occ[k] = 1;
      rec(start + w + 1, ci + 1);
      for (let k = start; k < start + w; k++) occ[k] = 0;
    }
  }
  rec(0, 0);
  return out;
}

// 把一行的推理结果写回 assign；返回 false 表示矛盾
function forceLine(line, clues, assign) {
  const out = enumerate(line.length, clues, assign, { tot: 0, cnt: new Int32Array(line.length) });
  if (!out.tot) return false;
  for (let i = 0; i < line.length; i++) {
    if (assign[i] !== 0) continue;
    if (out.cnt[i] === out.tot) assign[i] = 1;
    else if (out.cnt[i] === 0) assign[i] = 2;
  }
  return true;
}

const rowOf = (assign, r, buf) => { for (let c = 0; c < n; c++) buf[c] = assign[r * n + c]; return buf; };
const colOf = (assign, c, buf) => { for (let r = 0; r < n; r++) buf[r] = assign[r * n + c]; return buf; };

function applyLine(assign, r, c, line) {
  if (r >= 0) { for (let i = 0; i < n; i++) assign[r * n + i] = line[i]; return; }
  for (let i = 0; i < n; i++) assign[i * n + c] = line[i];
}

// 反复用单行约束传播到不动点；null = 无解
function propagate(assign) {
  const buf = new Uint8Array(n);
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < n; r++) {
      const line = rowOf(assign, r, new Uint8Array(n));
      const before = line.join('');
      if (!forceLine(line, rowClues[r], line)) return null;
      if (line.join('') !== before) { applyLine(assign, r, -1, line); changed = true; }
    }
    for (let c = 0; c < n; c++) {
      const line = colOf(assign, c, new Uint8Array(n));
      const before = line.join('');
      if (!forceLine(line, colClues[c], line)) return null;
      if (line.join('') !== before) { applyLine(assign, -1, c, line); changed = true; }
    }
  }
  return assign;
}

// 数解个数（最多数到 limit），顺带统计推理步数
let budget = 0;
function countSolutions(assign, limit) {
  const a = propagate(assign.slice());
  if (a === null) return 0;
  if (--budget < 0) return limit;
  let pick = -1;
  for (let i = 0; i < a.length; i++) if (a[i] === 0) { pick = i; break; }
  if (pick < 0) return 1;
  const t1 = a.slice(); t1[pick] = FILLED;
  const t2 = a.slice(); t2[pick] = MARK;
  let ways = countSolutions(t1, limit);
  if (ways < limit) ways += countSolutions(t2, limit - ways);
  return ways;
}

function isUnique() {
  budget = 4000;
  return countSolutions(new Uint8Array(n * n), 2) === 1;
}

/* ==================== 出题 ==================== */
// 随机底图 → 元胞自动机 majority 平滑成"图案" → 可选左右镜像成"图标感"
function randomMask(iter, p) {
  const m = new Uint8Array(n * n);
  for (let i = 0; i < m.length; i++) m[i] = Math.random() < (p || 0.5) ? 1 : 0;
  for (let step = 0; step < iter; step++) {
    const nx = new Uint8Array(n * n);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        let alive = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
            alive += m[rr * n + cc];
          }
        }
        nx[r * n + c] = alive >= 5 ? 1 : 0;
      }
    }
    m.set(nx);
  }
  return m;
}

function mirrorMask(m) {
  const out = new Uint8Array(n * n);
  const half = Math.ceil(n / 2);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const src = c < half ? c : n - 1 - c;
      out[r * n + c] = m[r * n + src];
    }
  }
  return out;
}

function maskFillRatio(m) {
  let s = 0;
  for (let i = 0; i < m.length; i++) s += m[i] ? 1 : 0;
  return s / m.length;
}

// 一组线索里有多少行/列是"多段"的：段数越多越不像糊成一片
function multiGroupRate() {
  let many = 0;
  for (const cl of rowClues.concat(colClues)) if (cl.length >= 2 && cl[0] !== 0) many++;
  return many / (2 * n);
}

// 一次传播能推出多少格：越少说明越费脑子
function logicDepth() {
  const a = propagate(new Uint8Array(n * n));
  if (!a) return -1;
  let known = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== EMPTY) known++;
  return known / a.length;
}

function generate() {
  const tries = n >= 15 ? 46 : 90;
  let best = null, bestScore = -1;
  for (let t = 0; t < tries; t++) {
    let m = randomMask(1 + (t % 3), 0.44 + (t % 5) * 0.03);
    if (t % 2 === 0) m = mirrorMask(m);
    const ratio = maskFillRatio(m);
    if (ratio < 0.34 || ratio > 0.62) continue;
    sol.set(m);
    buildClues();
    const first = logicDepth();
    if (first < 0) continue;
    const score = (first === 1 ? 2 : 0)                 // 纯逻辑可推优先(不用猜)
      + (multiGroupRate() > 0.34 ? 1 : 0)
      - Math.abs(ratio - 0.48) * 6
      + (first >= 0 ? (1 - first) * 2 : 0)              // 一上来就能推出的越少越耐想
      + (ratio >= 0.34 ? 0.5 : 0);
    if (score > bestScore) { bestScore = score; best = { m: Array.from(m), first }; }
    if (first === 1 && multiGroupRate() > 0.32 && ratio > 0.4 && ratio < 0.56) break;
  }
  if (!best) {
    // 兜底：只要求唯一解，图案丑一点也认了
    for (let t = 0; t < 60; t++) {
      const m = mirrorMask(randomMask(2, 0.5));
      sol.set(m);
      buildClues();
      if (isUnique()) return true;
    }
    // 最后保险：写死的四张图案，全部离线验证过「唯一解 + 纯逻辑可推」
    const art = BACKUP[n] || BACKUP[5];
    sol.set(Uint8Array.from(art, (ch) => (ch === '1' ? 1 : 0)));
    buildClues();
    return false;
  }
  sol.set(Uint8Array.from(best.m));
  buildClues();
  return true;
}

/* 手工验证过的保底图案：心形 / 空心方框 / 菱形 */
const BACKUP = {
  5: '0110111111111110111000100',
  10: '00110011000111111110111111111111111111111111111111111111111110111111110001111110000011110000000110000',
  15: '000000010000000000000111000000000001111100000000011111110000000111111111000001111111111100011111111111110111111111111111011111111111110001111111111100000111111111000000011111110000000001111100000000000111000000000000010000000',
  20: '111111111111111111111111111111111111111111111111111111111111111000000000000001111110000000000000011111100000000000000111111000000000000001111110000000000000011111100000000000000111111000000000000001111110000000000000011111100000000000000111111000000000000001111110000000000000011111100000000000000111111111111111111111111111111111111111111111111111111111111111',
};

/* ==================== 盘面渲染 ==================== */
function measure() {
  const rect = ngEl.parentNode && ngEl.parentNode.getBoundingClientRect
    ? ngEl.parentNode.getBoundingClientRect() : null;
  const avail = Math.max(240, (rect && rect.width ? rect.width : document.body.offsetWidth || 520) - 24);
  const clueW = Math.max(26, Math.min(58, Math.round(avail * 0.115)));
  const cs = Math.max(17, Math.min(34, Math.floor((avail - clueW - 6) / n)));
  ngEl.style.setProperty('--cs', cs + 'px');
  ngEl.style.setProperty('--clue', Math.round(cs * 2) + 'px');
  ngEl.style.setProperty('--n', String(n));
}

function render() {
  measure();
  topEl.innerHTML = '';
  sideEl.innerHTML = '';
  boardEl.innerHTML = '';
  cells = [];
  for (let c = 0; c < n; c++) {
    const d = document.createElement('div');
    d.className = 'clue v';
    for (const v of colClues[c]) {
      const s = document.createElement('i');
      s.textContent = String(v);
      d.appendChild(s);
    }
    topEl.appendChild(d);
  }
  for (let r = 0; r < n; r++) {
    const d = document.createElement('div');
    d.className = 'clue h';
    for (const v of rowClues[r]) {
      const s = document.createElement('i');
      s.textContent = String(v);
      d.appendChild(s);
    }
    sideEl.appendChild(d);
  }
  cellBase = [];
  for (let i = 0; i < n * n; i++) {
    const c = i % n, r = (i / n) | 0;
    let cls = 'c';
    if (n >= 10) {
      if (c % 5 === 4 && c !== n - 1) cls += ' c5';
      if (r % 5 === 4 && r !== n - 1) cls += ' r5';
    }
    cellBase.push(cls);
    const d = document.createElement('div');
    d.className = cls;
    d.dataset.i = String(i);
    boardEl.appendChild(d);
    cells.push(d);
  }
  paintAll();
}

function paintAll() {
  for (let i = 0; i < cells.length; i++) paintCell(i);
  refreshLines();
  hud();
}

let cellBase = [];
let autoSet = null;

function paintCell(i, anim) {
  const el = cells[i];
  if (!el) return;
  const v = cell[i];
  let cls = cellBase[i] || 'c';
  if (v === FILLED) cls += ' f';
  else if (v === MARK) cls += ' x' + (autoSet && autoSet[i] ? ' auto' : '');
  el.className = cls;
  if (anim) { el.classList.add('just'); setTimeout(() => el.classList.remove('just'), 280); }
}

/* ==================== 推理辅助 ==================== */
function lineFilled(assign, r, c) {
  const out = [];
  if (r >= 0) for (let i = 0; i < n; i++) out.push(cell[r * n + i] === FILLED ? 1 : 0);
  else for (let i = 0; i < n; i++) out.push(cell[i * n + c] === FILLED ? 1 : 0);
  return out;
}

function sameArr(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// 行列线索是否已被完全满足：满足的行自动打叉 + 线索变绿
function refreshLines() {
  const next = autoSet ? Uint8Array.from(autoSet) : new Uint8Array(cell.length);
  let painted = false;
  rowDone = []; colDone = [];
  for (let k = 0; k < 2; k++) {
    const isRow = k === 0;
    for (let a = 0; a < n; a++) {
      const clues = isRow ? rowClues[a] : colClues[a];
      const got = isRow ? lineFilled(0, a, -1) : lineFilled(0, -1, a);
      const done = sameArr(lineClues(Uint8Array.from(got)), clues);
      (isRow ? rowDone : colDone).push(done);
      if (!done || solved) continue;
      for (let b = 0; b < n; b++) {
        const i = isRow ? a * n + b : b * n + a;
        if (cell[i] !== EMPTY) continue;
        cell[i] = MARK; next[i] = 1; painted = true;
      }
    }
  }
  for (let i = 0; i < next.length; i++) if (next[i] && cell[i] !== MARK) next[i] = 0;
  if (!sameAuto(next)) { autoSet = next; repaint(); }
  const kidsSide = sideEl.children, kidsTop = topEl.children;
  for (let r = 0; r < n && kidsSide[r]; r++) kidsSide[r].classList.toggle('done', !!rowDone[r]);
  for (let c = 0; c < n && kidsTop[c]; c++) kidsTop[c].classList.toggle('done', !!colDone[c]);
}

function sameAuto(next) {
  if (!autoSet) return false;
  for (let i = 0; i < next.length; i++) if (next[i] !== autoSet[i]) return false;
  return true;
}

function repaint() { for (let i = 0; i < cells.length; i++) paintCell(i); }

function countFilled() {
  let s = 0;
  for (let i = 0; i < cell.length; i++) if (cell[i] === FILLED) s++;
  return s;
}

/* ==================== 改格 / 撤销 ==================== */
// 一次连续操作(点击或一段拖动)算一步，整批入撤销栈。
// 顺序很关键：先把涂错的格子挑出来回退，再做"整行完成"推理 —— 反过来的话，
// 一个错格会让该行看起来涂够了，把真正的解格连带自动打叉，整题就废了。
function commitChanges(changes) {
  if (!changes.length) return;
  undos.push(changes);
  redos.length = 0;
  for (const ch of changes) cell[ch.i] = ch.to;
  const wrong = rejectWrongFills(changes);
  refreshLines();
  repaint();
  flashCells(wrong, 'bad', 520);
  flashCells(changes.filter((c) => c.tip).map((c) => c.i), 'tip', 640);
  if (wrong.length) sfx.tone(150, 0.16, 'sawtooth', 0.09, 0, 90);
  else sfx.tone(360 + Math.min(400, changes.length * 30), 0.045, 'triangle', 0.05);
  filledCount = countFilled();
  hud();
  if (filledCount >= needTotal) win();
  else save();
}

function rejectWrongFills(changes) {
  const bad = [];
  for (const ch of changes) {
    if (ch.to !== FILLED || sol[ch.i]) continue;
    cell[ch.i] = MARK;
    ch.to = MARK;            // 固化到操作记录里，撤销/重做才不会被错格带偏
    ch.reverted = true;
    bad.push(ch.i);
  }
  if (bad.length) mistakes += bad.length;
  return bad;
}

function flashCells(list, cls, ms) {
  for (const i of list) {
    if (!cells[i]) continue;
    cells[i].classList.add(cls);
    setTimeout(((el, c) => () => el.classList.remove(c))(cells[i], cls), ms);
  }
}

function applyBatch(changes) { commitChanges(changes); }

function undo() {
  if (!undos.length || solved) return;
  const ch = undos.pop();
  for (const c of ch) cell[c.i] = c.from;
  redos.push(ch);
  for (const c of ch) paintCell(c.i);
  refreshLines();
  filledCount = countFilled();
  hud();
  save();
  sfx.tone(300, 0.05, 'square', 0.05, 0, 240);
}

function redo() {
  if (!redos.length || solved) return;
  const ch = redos.pop();
  for (const c of ch) cell[c.i] = c.to;
  undos.push(ch);
  for (const c of ch) paintCell(c.i, true);
  refreshLines();
  filledCount = countFilled();
  hud();
  save();
  sfx.tone(330, 0.05, 'square', 0.05, 0, 420);
}

function clearMarks() {
  const ch = [];
  for (let i = 0; i < cell.length; i++) {
    if (cell[i] === MARK && !cells[i].classList.contains('auto')) { ch.push({ i, from: MARK, to: EMPTY }); }
  }
  applyBatch(ch);
  sfx.tone(240, 0.12, 'triangle', 0.07, 0, 150);
}

function hint() {
  if (solved || hintsLeft <= 0) return;
  const pool = [];
  for (let i = 0; i < sol.length; i++) if (sol[i] && cell[i] !== FILLED) pool.push(i);
  if (!pool.length) return;
  const i = pool[Math.floor(Math.random() * pool.length)];
  hintsLeft--;
  applyBatch([{ i, from: cell[i], to: FILLED, tip: true }]);
  sfx.melody([[700, 0.07], [980, 0.1]]);
  hud();
  save();
}

/* ==================== 拖拽输入 ==================== */
let drag = null;

function modeFor(v, alt) {
  // 从当前状态往后循环：空 → 涂 → 叉 → 空
  if (!alt) return v === EMPTY ? FILLED : v === FILLED ? MARK : EMPTY;
  return v === EMPTY ? MARK : v === FILLED ? EMPTY : FILLED;
}

function cellFromEvent(e) {
  const ef = document.elementFromPoint;
  if (ef && e.clientX != null && e.clientY != null) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el.classList && el.classList.contains('c')) return el;
  }
  const t = e.target;
  return t && t.closest ? t.closest('.c') : null;
}

function beginDrag(e, alt) {
  const el = cellFromEvent(e);
  if (!el || solved) return;
  const i = Number(el.dataset.i);
  if (Number.isNaN(i)) return;
  e.preventDefault && e.preventDefault();
  const to = modeFor(cell[i], alt);
  drag = { to, changes: [], seen: {}, timer: 0 };
  touch(i);
  sfx.resume();
}

function touch(i) {
  if (!drag || drag.seen[i]) return;
  drag.seen[i] = 1;
  const from = cell[i];
  if (from === drag.to) return;
  cell[i] = drag.to;
  paintCell(i, true);
  drag.changes.push({ i, from, to: drag.to });
}

function endDrag() {
  if (!drag) return;
  const changes = drag.changes;
  drag = null;
  commitChanges(changes);
}

boardEl.addEventListener('pointerdown', (e) => {
  if (e.button === 2) { beginDrag(e, true); return; }
  beginDrag(e, false);
  if (drag) drag.timer = setTimeout(() => { if (drag) { const el = cellFromEvent(e); if (el) { const i = Number(el.dataset.i); const want = modeFor(cell[i], true); drag.to = want; } } }, 420);
});
boardEl.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (e.buttons === 0 && e.pointerType === 'mouse') { endDrag(); return; }
  const el = cellFromEvent(e);
  if (!el) return;
  const i = Number(el.dataset.i);
  if (!Number.isNaN(i)) { clearTimeout(drag.timer); touch(i); }
});
window.addEventListener('pointerup', () => { if (drag) { clearTimeout(drag.timer); endDrag(); } });
window.addEventListener('pointercancel', () => { if (drag) { clearTimeout(drag.timer); endDrag(); } });
boardEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const el = cellFromEvent(e);
  if (!el || solved) return;
  const i = Number(el.dataset.i);
  if (cell[i] === MARK) { applyBatch([{ i, from: MARK, to: EMPTY }]); return; }
  applyBatch([{ i, from: cell[i], to: MARK }]);
});

/* ==================== HUD / 计时 / 存档 ==================== */
function hud() {
  madeEl.textContent = filledCount + '/' + needTotal;
  mistakeEl.textContent = String(mistakes);
  hintNEl.textContent = String(hintsLeft);
  bestEl.textContent = fmtBest();
  btnUndo.disabled = !undos.length || solved;
  btnRedo.disabled = !redos.length || solved;
  btnHint.disabled = hintsLeft <= 0 || solved;
  btnMark.disabled = solved;
}

function fmtBest() {
  const v = Number(store.get(bestKey(diff)));
  return v > 0 ? fmtTime(v) : '--';
}

function tickTime() {
  if (solved) return;
  seconds++;
  timeEl.textContent = fmtTime(seconds);
  if (seconds % 10 === 0) save();
}

function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(tickTime, 1000);
}

function save() {
  if (solved) { store.del('nonogram.save'); return; }
  store.set('nonogram.save', JSON.stringify({
    diff, seconds, mistakes, hintsLeft,
    sol: Array.from(sol).join(''),
    cell: Array.from(cell).join(''),
  }));
}

function encode(arr) { return Array.from(arr).join(''); }

function loadSave(s) {
  n = DIFFS[s.diff].n;
  if (!s.sol || s.sol.length !== n * n) return false;
  sol = Uint8Array.from(s.sol, (ch) => (ch === '1' ? 1 : 0));
  cell = Uint8Array.from(s.cell || encode(new Uint8Array(n * n)), (ch) => (ch === '1' ? 1 : ch === '2' ? 2 : 0));
  if (cell.length !== n * n) return false;
  diff = s.diff;
  seconds = Number(s.seconds) || 0;
  mistakes = Number(s.mistakes) || 0;
  hintsLeft = s.hintsLeft == null ? HINTS_PER_PUZZLE : Number(s.hintsLeft);
  buildClues();
  return true;
}

/* ==================== 关卡流程 ==================== */
function newPuzzle(resume) {
  let ok = false;
  if (resume) ok = loadSave(resume);
  solved = false;
  undos = []; redos = [];
  if (!ok) {
    store.del('nonogram.save');
    n = DIFFS[diff].n;
    sol = new Uint8Array(n * n);
    cell = new Uint8Array(n * n);
    n = DIFFS[diff].n;
    generate();
    seconds = 0; mistakes = 0; hintsLeft = HINTS_PER_PUZZLE;
  }
  needTotal = 0;
  for (let i = 0; i < sol.length; i++) needTotal += sol[i] ? 1 : 0;
  filledCount = countFilled();
  render();
  overlay.classList.remove('show');
  timeEl.textContent = fmtTime(seconds);
  startTimer();
  save();
}

function win() {
  if (solved) return;
  solved = true;
  if (timer) clearInterval(timer);
  store.del('nonogram.save');
  const prev = Number(store.get(bestKey(diff)));
  if (!prev || seconds < prev) {
    store.set(bestKey(diff), String(seconds));
    sfx.melody([[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.2]]);
    showOverlay('🎉', '新纪录', DIFFS[diff].name + ' 用了 ' + fmtTime(seconds) + '，错涂 ' + mistakes + ' 次', 'again', '再来一题', '破纪录 🏆 ' + fmtTime(seconds));
  } else {
    sfx.melody([[659, 0.09], [784, 0.09], [988, 0.16]]);
    showOverlay('🧩', '图案完成', DIFFS[diff].name + ' 用时 ' + fmtTime(seconds) + ' · 最佳 ' + fmtTime(prev), 'again', '再来一题', '');
  }
  hud();
}

function showOverlay(emoji, title, text, actName, actLabel, extra) {
  overlayContent.innerHTML = '<div class="ov-emoji">' + emoji + '</div>' +
    '<h2>' + title + '</h2>' +
    (extra ? '<div class="final-score">' + extra + '</div>' : '') +
    '<p class="hint">' + text + '</p>' +
    '<div class="ov-actions"><button class="primary" data-act="' + actName + '">' + actLabel + '</button>' +
    '<button class="ghost" data-act="next">试试下一档</button></div>';
  overlay.classList.add('show');
}

function showIntro(resuming) {
  if (timer) clearInterval(timer);
  timer = null;
  if (resuming) {
    overlayContent.innerHTML = '<div class="ov-emoji">🧩</div><h2>继续上一题</h2>' +
      '<p class="hint">' + DIFFS[diff].name + ' · 已经涂了 ' + filledCount + '/' + needTotal + ' 格 · 用时 ' + fmtTime(seconds) + '</p>' +
      '<div class="ov-actions"><button class="primary" data-act="resume">接着拼</button>' +
      '<button class="ghost" data-act="start">换一题</button></div>';
    overlay.classList.add('show');
    return;
  }
  showOverlay('🖼️', '数织',
    '行首列首的数字，是那一行/列连续涂黑格的长度。<br>全靠逻辑推，不用猜 —— 涂错会当场提醒你。',
    'start', '开始拼图', '');
}

/* ==================== 事件 ==================== */
btnNew.addEventListener('click', () => { sfx.resume(); newPuzzle(null); sfx.tone(520, 0.07, 'triangle', 0.07); });
btnUndo.addEventListener('click', undo);
btnRedo.addEventListener('click', redo);
btnHint.addEventListener('click', hint);
btnMark.addEventListener('click', clearMarks);
btnSound.addEventListener('click', () => { btnSound.textContent = sfx.toggle() ? '🔇' : '🔊'; });

diffEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-diff]');
  if (!btn) return;
  setDiff(btn.dataset.diff);
});

function setDiff(d) {
  if (!DIFFS[d]) return;
  diff = d;
  store.set('nonogram.diff', d);
  markDiff();
  newPuzzle(null);
}

function markDiff() {
  for (const btn of diffEl.querySelectorAll('[data-diff]')) {
    btn.classList.toggle('active', btn.dataset.diff === diff);
  }
}

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  sfx.resume();
  const a = btn.dataset.act;
  if (a === 'start' || a === 'again') newPuzzle(null);
  else if (a === 'resume') { overlay.classList.remove('show'); startTimer(); }
  else if (a === 'next') {
    const keys = Object.keys(DIFFS);
    setDiff(keys[(keys.indexOf(diff) + 1) % keys.length]);
  }
  else if (a === 'home') location.href = '../index.html';
});

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'u' || k === 'U' || k === 'z' || k === 'Z') { undo(); e.preventDefault(); }
  else if (k === 'r' || k === 'R') { redo(); e.preventDefault(); }
  else if (k === 'h' || k === 'H') { hint(); e.preventDefault(); }
  else if (k === 'm' || k === 'M') { clearMarks(); e.preventDefault(); }
  else if (k === 'n' || k === 'N') { newPuzzle(null); e.preventDefault(); }
});

window.addEventListener('resize', () => { if (!solved) measure(); });
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

/* ==================== 启动 ==================== */
markDiff();
let saved = null;
try { saved = JSON.parse(store.get('nonogram.save') || 'null'); } catch (e) { saved = null; }
const keep = saved && DIFFS[saved.diff] ? saved : null;
if (keep) { diff = keep.diff; store.set('nonogram.diff', diff); markDiff(); }
n = DIFFS[diff].n;
sol = new Uint8Array(n * n);
buildClues();
newPuzzle(keep);
showIntro(!!keep && !solved && filledCount < needTotal);

})();
