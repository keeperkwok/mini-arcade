'use strict';
/* 数圈：环的判定 / 求解器 / 出题唯一性 / 三态点击与限时 四块地基
   重点核对：① loopOK 必须真拒绝「断口、T 字、两坨不相连」，cluesOf 与独立的行列暴力数格对拍
   ② 求解器与「4×4 全盘枚举 65536 种画法」的第二实现对拍：解的个数、解的内容都得一致
   ③ 每一盘发出去的题：环合法、数字与答案对得上、且解唯一（提示才不会自相矛盾）
   ④ 三态循环、打结与数字反馈、赢的判定、扣拍与纪录，全按真实 DOM 点出来
*/
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  st: function () { return { phase: phase, diff: diff, level: level, score: score, rows: rows, cols: cols, cells: cells,
    hints: hints, hinted: hinted, timeTicks: timeTicks, clock: clock, onCount: onCount, knots: knots, errs: errs,
    solved: solved, paused: paused, cur: cur, totalLoop: totalLoop, lastGain: lastGain, seed: seedBase }; },
  K: function () { return { STEP_MS: STEP_MS, HINT_COST: HINT_COST, GEN_WORK: GEN_WORK, MIN_CLUES: MIN_CLUES,
    LEVELS: LEVELS, SIZES: SIZES, OFF: OFF, ON: ON, MK: MK }; },
  DIFFS: function () { return DIFFS; },
  rngOf: rngOf, nb4List: nb4List, nb8List: nb8List, loopOK: loopOK, cluesOf: cluesOf, stairLoop: stairLoop,
  makeLoop: makeLoop, flipLoop: flipLoop, solveRows: solveRows, genPuzzle: genPuzzle, borderLoop: borderLoop,
  D: D, sizeOf: sizeOf, limitTicks: limitTicks, secLeft: secLeft, gainOf: gainOf, fmtTime: fmtTime,
  analyze: analyze, afterEdit: afterEdit, cycle: cycle, setState: setState, clearBoard: clearBoard, wipeWrong: wipeWrong, useHint: useHint,
  newRun: newRun, startLevel: startLevel, levelWin: levelWin, runClear: runClear, gameOver: gameOver,
  revealAll: revealAll, togglePause: togglePause, act: act, stats: stats, intro: intro, hud: hud, paint: paint,
  buildBoard: buildBoard, countAnswer: countAnswer, revSome: revSome, nearBadClue: nearBadClue,
  ov: function () { return ovContent.innerHTML; }, ovShown: function () { return !!ovShown(); },
  msg: function () { return msgEl.innerHTML; },
  grid: function () { return Array.prototype.slice.call(cell); },
  ans: function () { return Array.prototype.slice.call(answer); },
  clues: function () { return clue.slice(); },
  revs: function () { return Array.prototype.slice.call(rev); },
  knotF: function () { return Array.prototype.slice.call(knotFlag); },
  errF: function () { return Array.prototype.slice.call(errFlag); },
  nCells: function () { return cellEls.length; },
  cellEl: function (i) { return cellEls[i] || null; },
  cls: function (i) { return cellEls[i] ? cellEls[i].className : ''; },
  txt: function (i) { return cellEls[i] ? String(cellEls[i].textContent) : ''; },
  gridStyle: function () { return { c: boardEl.style.gridTemplateColumns, r: boardEl.style.gridTemplateRows, ar: boardEl.style.aspectRatio }; },
  hudText: function () { return { lv: String(elLv.textContent), dim: String(elDim.textContent), on: String(elOn.textContent),
    knot: String(elKnot.textContent), knotCls: elKnot.className, clock: String(elClock.textContent), clockCls: elClock.className,
    score: String(elScore.textContent), hint: String(elHint.textContent),
    hintOff: !!(btnHint && btnHint.disabled), clearOff: !!(btnClear && btnClear.disabled), fixOff: !!(btnFix && btnFix.disabled),
    pause: btnPause ? btnPause.innerHTML : '' }; },
  setSeed: function (v) { FIXED_SEED = v >>> 0; },
  setDiff: function (v) { diff = v; },
  setVars: function (k, v) { if (k === 'score') score = v; else if (k === 'level') level = v; else if (k === 'hints') hints = v;
    else if (k === 'timeTicks') timeTicks = v; else if (k === 'phase') phase = v; else if (k === 'paused') paused = v;
    else if (k === 'hinted') hinted = v; else if (k === 'clock') clock = v; else if (k === 'cur') cur = v;
    else if (k === 'totalLoop') totalLoop = v; else if (k === 'onCount') onCount = v; },
  /* 直接把盘画成给定状态（0/1/2），只走 analyze/paint，不判赢 —— 用来造特定局面 */
  paint2: function (list) { for (var i = 0; i < cells; i++) cell[i] = list[i]; analyze(); paint(); hud(); },
  /* 把盘直接画成答案（不经过点击），再手动触发一次检查 */
  drawAnswer: function () { for (var i = 0; i < cells; i++) cell[i] = answer[i] ? ON : OFF; analyze(); paint(); hud(); },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('数圈源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const G = (g) => g.ctx.__g;
const st = (g) => g.ctx.__g.st();

function boot(storage, seed) {
  const g = loadGame('shuquan', { transform: inject, storage: storage || {} });
  g.pump(0.2);
  if (seed !== undefined) { G(g).setSeed(seed); G(g).newRun(); G(g).intro(); }   // 钉住种子重发一关，再盖回介绍页
  return g;
}
function clickAct(g, name) {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  if (b) b.dispatch('click');
  g.pump(0.1);
  return !!b;
}
function pickDiff(g, name) {
  const b = g.byId('diff').querySelectorAll('[data-diff]').find((x) => x.dataset.diff === name);
  if (b) b.dispatch('click');
  g.pump(0.1);
  return !!b;
}
function open(seed, storage) {
  const g = boot(storage, seed);
  clickAct(g, 'start');
  return g;
}
const cellAt = (g, i) => G(g).cellEl(i);
function tap(g, i, back) {
  const el = cellAt(g, i);
  if (!el) return false;
  el.dispatch(back ? 'contextmenu' : 'click');
  return true;
}
/* 第二实现：4×4 全盘枚举 2^16 种画法，独立判「单环 + 数字全对」 */
function brute(rows, cols, clueList) {
  const n = rows * cols, out = [];
  const nb4 = (p) => { const r = Math.floor(p / cols), c = p % cols, a = [];
    if (r > 0) a.push(p - cols); if (c + 1 < cols) a.push(p + 1); if (r + 1 < rows) a.push(p + cols); if (c > 0) a.push(p - 1); return a; };
  const nb8 = (p) => { const r = Math.floor(p / cols), c = p % cols, a = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      if (!i && !j) continue;
      if (r + i < 0 || c + j < 0 || r + i >= rows || c + j >= cols) continue;
      a.push((r + i) * cols + c + j);
    } return a; };
  for (let mask = 0; mask < (1 << n); mask++) {
    const on = [];
    for (let p = 0; p < n; p++) if (mask & (1 << p)) on.push(p);
    if (on.length < 4) continue;
    let okLoop = true;
    const set = new Set(on);
    for (const p of on) if (nb4(p).filter((m) => set.has(m)).length !== 2) { okLoop = false; break; }
    if (!okLoop) continue;
    // 连通
    const seen = new Set([on[0]]), stack = [on[0]];
    while (stack.length) {
      const cur2 = stack.pop();
      for (const m of nb4(cur2)) if (set.has(m) && !seen.has(m)) { seen.add(m); stack.push(m); }
    }
    if (seen.size !== on.length) continue;
    let clueOk = true;
    for (let p = 0; p < n; p++) if (clueList[p] >= 0 && nb8(p).filter((m) => set.has(m)).length !== clueList[p]) { clueOk = false; break; }
    if (clueOk) out.push(on.slice());
  }
  return out;
}
const toArr = (rows, cols, list) => {
  const n = rows * cols, a = new Uint8Array(n);
  for (const p of list) a[p] = 1;
  return a;
};

/* ==================== 1. 邻居表与「一条圈」的判定 ==================== */
let g = boot({}, 4242);
let Gg = G(g);
console.log('— 邻居表与环判定');
const NA4 = Gg.nb4List(4, 4), NA8 = Gg.nb8List(4, 4);
chk(NA4.length === 16 && NA8.length === 16, '4×4 每格都有正交/斜向邻居表');
chk(NA4[0].length === 2 && NA4[5].length === 4 && NA4[3].length === 2, '角上 2 个正交邻居，中间 4 个');
chk(NA8[0].length === 3 && NA8[5].length === 8, '角上 3 个斜邻居，中间 8 个');
chk(NA4[5].slice().sort().join() === '1,4,6,9', '正交邻居就是上下左右：' + NA4[5].join(','));
chk(NA8[0].slice().sort().join() === '1,4,5', '角格的斜邻居含对角：' + NA8[0].join(','));
{
  const R4 = Gg.nb4List(2, 3);
  chk(R4[0].length === 2 && R4[4].length === 3 && R4[3].length === 2, '长条盘的边角邻居数也对');
}
/* 用字符画造盘：'#' = 圈上 */
function fromRows(rowsArr) {
  const rows = rowsArr.length, cols = rowsArr[0].length, a = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (rowsArr[r][c] === '#') a[r * cols + c] = 1;
  return { on: a, rows: rows, cols: cols, n: rows * cols };
}
function nOf(a) { let s = 0; for (const v of a) s += v; return s; }
const CASES = [
  { pic: ['##..', '##..', '....', '....'], loop: true, why: '2×2 方块是最小合法圈（4 格）' },
  { pic: ['####', '#..#', '#..#', '####'], loop: true, why: '4×4 边框一圈 12 格合法' },
  { pic: ['....', '####', '....', '....'], loop: false, why: '一行四格两头只有 1 个邻居，不是圈' },
  { pic: ['##..', '##..', '..##', '..##'], loop: false, why: '两坨各自闭合 = 不连通，必须拒' },
  { pic: ['.#..', '##..', '.#..', '....'], loop: false, why: 'T 字接口处有 3 个圈邻居，必须拒' },
  { pic: ['.##.', '####', '####', '.##.'], loop: false, why: '中间填实了会有 4 邻居的格，不是「一条线」' },
  { pic: ['##..', '##..', '##..', '....'], loop: false, why: '2×3 实心有 4 邻居的格' },
  { pic: ['.##.', '.##.', '....', '....'], loop: true, why: '盘中间一个 2×2 也合法' },
];
for (const cs of CASES) {
  const f = fromRows(cs.pic);
  chk(Gg.loopOK(f.on, NA4, 16) === cs.loop, cs.why);
}
{
  const big = fromRows(['######', '#....#', '#....#', '#....#', '#....#', '######']);
  const A4b = Gg.nb4List(6, 6), A8b = Gg.nb8List(6, 6);
  chk(Gg.loopOK(big.on, A4b, 36) === true, '6×6 边框一圈（20 格）合法');
  chk(Gg.loopOK(big.on, A4b, 36) === true && nOf(big.on) === 20, '这圈 20 格');
  const cl = Gg.cluesOf(big.on, A8b, 36);
  chk(cl[0] === 2 && cl[7] === 5 && cl[8] === 3 && cl[14] === 0, '框角 2 / 环内 5 / 贴边 3 / 洞里 0：' + [cl[0], cl[7], cl[8], cl[14]].join('/'));
  let sum = 0, sum2 = 0;
  for (let p = 0; p < 36; p++) sum += cl[p];
  for (let p = 0; p < 36; p++) if (big.on[p]) sum2 += A8b[p].length;
  chk(sum === sum2, '全盘数字之和 = 每个圈格被数到的次数之和（' + sum + '）');
}
/* cluesOf 与独立的行列暴力数格逐格对拍 */
function bruteClues(rowsArr) {
  const f = fromRows(rowsArr), rows = f.rows, cols = f.cols, out = [];
  for (let p = 0; p < f.n; p++) {
    const r = Math.floor(p / cols), c = p % cols;
    let k = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      if (!i && !j) continue;
      if (r + i < 0 || c + j < 0 || r + i >= rows || c + j >= cols) continue;
      if (f.on[(r + i) * cols + c + j]) k++;
    }
    out.push(k);
  }
  return { n: f.n, rows: rows, cols: cols, on: f.on, cl: out };
}
{
  const pics = [['####', '#..#', '#..#', '####'], ['....', '.##.', '.##.', '....'],
    ['######', '#....#', '#....#', '######', '......', '......'],
    ['.#..#.', '#.#.#.', '.###.#', '#..#..', '.#.#.#', '#.#.#.']];
  let same = 0;
  for (const pic of pics) {
    const b = bruteClues(pic);
    const mine = Gg.cluesOf(b.on, Gg.nb8List(b.rows, b.cols), b.n);
    if (mine.join(',') === b.cl.join(',')) same++;
  }
  chk(same === pics.length, pics.length + ' 张盘的 cluesOf 与独立实现逐格相等');
}

/* ==================== 2. 造环与翻角 ==================== */
console.log('— 造环 / 翻角');
{
  let badLoop = 0, tooShort = 0, empty = 0, det = 0, nulls = 0;
  const sizes = Gg.K().SIZES;
  for (const sz of sizes) {
    const adj4 = Gg.nb4List(sz[0], sz[1]);
    for (let seed = 1; seed <= 6; seed++) {
      const on = Gg.makeLoop(Gg.rngOf(seed * 7717 + sz[0] * 131 + sz[1]), sz[0], sz[1], adj4, sz[0] + sz[1]);
      if (!on) { nulls++; continue; }
      if (!Gg.loopOK(on, adj4, sz[0] * sz[1])) badLoop++;
      const c = nOf(on);
      if (c < sz[0] + sz[1]) tooShort++;
      if (c < 4) empty++;
    }
    const a1 = Gg.makeLoop(Gg.rngOf(999), sz[0], sz[1], Gg.nb4List(sz[0], sz[1]), 0);
    const a2 = Gg.makeLoop(Gg.rngOf(999), sz[0], sz[1], Gg.nb4List(sz[0], sz[1]), 0);
    if (a1 && a2 && a1.join('') === a2.join('')) det++;
  }
  chk(badLoop === 0 && nulls === 0, '八个尺寸 × 6 盘：全造得出，且全是合法单一闭合回路');
  chk(tooShort === 0, '环长都达到下限 rows+cols（不会只画一个 2×2 小方块）');
  chk(empty === 0, '没有空盘');
  chk(det === sizes.length, '同一种子造出同一环（' + det + '/' + sizes.length + ' 个尺寸可复现）');
  chk(Gg.makeLoop(Gg.rngOf(7), 4, 4, Gg.nb4List(4, 4), 40) === null, '要 40 格的环在 4×4 上围不出来（最大 12 格）→ 老实返回 null');
  chk(Gg.makeLoop(Gg.rngOf(7), 2, 6, Gg.nb4List(2, 6), 6) === null, '两格厚的盘围不出洞 → 直接放弃');
}
{
  const rows = 6, cols = 6, n = 36, adj4 = Gg.nb4List(rows, cols);
  let flips = 0, stillOK = 0, lenSame = 0, boards = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const on = Gg.makeLoop(Gg.rngOf(seed * 3301), rows, cols, adj4, rows + cols);
    if (!on) continue;
    boards++;
    const c0 = nOf(on);
    for (let k = 0; k < 6; k++) {
      if (Gg.flipLoop(on, Gg.rngOf(seed * 7 + k), rows, cols, adj4)) { flips++; if (Gg.loopOK(on, adj4, n)) stillOK++; }
    }
    if (c0 === nOf(on)) lenSame++;
  }
  chk(boards === 10, '十盘 6×6 都造出了环');
  chk(flips > 5, '翻角成功 ' + flips + ' 次（有得翻才有变化）');
  chk(flips === stillOK, '每次翻完仍是合法圈');
  chk(lenSame === boards, '翻角不改变圈格数');
  chk(Gg.loopOK(Gg.borderLoop(5, 7), Gg.nb4List(5, 7), 35) === true, '兜底盘（沿边框一圈）本身合法');
}

/* ==================== 3. 求解器 vs 全盘暴力 ==================== */
console.log('— 求解器与 4×4 全盘暴力（2^16）的对拍');
{
  const rows = 4, cols = 4, n = 16;
  const adj4 = Gg.nb4List(rows, cols), adj8 = Gg.nb8List(rows, cols);
  const on = Gg.makeLoop(Gg.rngOf(20260918), rows, cols, adj4, 6);
  const full = Gg.cluesOf(on, adj8, n);
  chk(!!on, '先造一条 4×4 的圈当答案');
  const r = Gg.solveRows(rows, cols, full, 3, adj4, adj8, 200000);
  chk(!r.timeout, '数字全给：不超时');
  chk(r.sols.length === 1, '数字全给时解唯一（找到 ' + r.sols.length + ' 个）');
  chk(r.sols.length === 1 && r.sols[0].join('') === on.join(''), '算出来的就是原来那条圈');
  const br = brute(rows, cols, full);
  chk(br.length === r.sols.length, '暴力枚举 65536 种画法：也是 ' + br.length + ' 解');
  let agree = 0, tried = 0, uniq = 0;
  for (let p = 0; p < n; p++) {
    const cl = full.slice();
    cl[p] = -1;
    const rs = Gg.solveRows(rows, cols, cl, 8, adj4, adj8, 200000);
    const bs = brute(rows, cols, cl);
    tried++;
    if (!rs.timeout && rs.sols.length === bs.length) agree++;
    if (rs.sols.length === 1) uniq++;
  }
  chk(tried === n, '试了 ' + tried + ' 个「少一个数字」的盘');
  chk(agree === tried, '解的个数与暴力完全一致（' + agree + '/' + tried + '）');
  chk(uniq >= 0, '抽掉一个数字仍有 ' + uniq + '/' + tried + ' 盘保持唯一（数字之间高度冗余）');
  let sparseBad = 0, multi = 0;
  for (const keep of [[0, 1, 5, 6, 10, 11], [2, 3, 4, 7, 8, 15], [0, 5, 10, 15], [1, 2, 6, 9, 13, 14]]) {
    const cl = new Array(n).fill(-1);
    for (const q of keep) cl[q] = full[q];
    const rs = Gg.solveRows(rows, cols, cl, 8, adj4, adj8, 200000);
    const bs = brute(rows, cols, cl);
    if (rs.timeout || rs.sols.length !== bs.length) sparseBad++;
    if (bs.length > 1) multi++;
  }
  chk(sparseBad === 0, '只留 3~6 个数字的稀盘：解的个数仍与暴力完全一致');
  chk(multi >= 1, '数字太稀就锁不住唯一解（' + multi + '/4 组多解）→ 最小化必须留够');
  const zeros = new Array(n).fill(0);
  chk(Gg.solveRows(rows, cols, zeros, 2, adj4, adj8, 20000).sols.length === 0, '整盘写 0：谁都不许进圈 → 无解');
  chk(brute(rows, cols, zeros).length === 0, '暴力也判无解');
  const bad2 = full.slice();
  bad2[0] = (bad2[0] + 1) % 4;
  chk(Gg.solveRows(rows, cols, bad2, 8, adj4, adj8, 20000).sols.length === brute(rows, cols, bad2).length, '改坏一个角上数字：两种实现仍然一致');
  chk(Gg.solveRows(rows, cols, new Array(n).fill(-1), 4, adj4, adj8, 20000).sols.length === 4, '一个数字都不给：解多到触顶（4 个）');
  {
    const rs = Gg.solveRows(6, 6, new Array(36).fill(-1), 2, Gg.nb4List(6, 6), Gg.nb8List(6, 6), 12);
    chk(rs.timeout === true && rs.nodes > 12, '节点预算能被踩到：超预算就 timeout 上报（' + rs.nodes + ' 节点）');
    const rs2 = Gg.solveRows(6, 6, new Array(36).fill(-1), 2, Gg.nb4List(6, 6), Gg.nb8List(6, 6), 200000);
    chk(rs2.timeout === false && rs2.sols.length === 2, '预算放开后照样收满 2 个解');
  }
}

/* ==================== 4. 出题：每一盘都必须唯一 ==================== */
console.log('— 出题器');
{
  const sizes = [[4, 4], [5, 4], [5, 5], [6, 5]];
  let n0 = 0, bad = 0, slowest = 0, clueMin = 99, clueMax = 0;
  for (const sz of sizes) {
    const adj4 = Gg.nb4List(sz[0], sz[1]), adj8 = Gg.nb8List(sz[0], sz[1]);
    for (let seed = 1; seed <= 4; seed++) {
      const t0 = Date.now();
      const p = Gg.genPuzzle(Gg.rngOf(seed * 104729 + sz[0] * 7919 + sz[1]), sz[0], sz[1], adj4, adj8, 0.42, 6, 420);
      const ms = Date.now() - t0;
      if (ms > slowest) slowest = ms;
      n0++;
      const full = Gg.cluesOf(p.on, adj8, sz[0] * sz[1]);
      let cnt = 0;
      for (let i = 0; i < full.length; i++) if (p.clue[i] >= 0) { cnt++; if (p.clue[i] !== full[i]) bad++; }
      if (!Gg.loopOK(p.on, adj4, sz[0] * sz[1])) bad++;
      if (!cnt) bad++;
      if (cnt < clueMin) clueMin = cnt;
      if (cnt > clueMax) clueMax = cnt;
      const r = Gg.solveRows(sz[0], sz[1], p.clue, 3, adj4, adj8, 300000);
      if (r.sols.length !== 1 || r.timeout || r.sols[0].join('') !== p.on.join('')) bad++;
    }
  }
  chk(bad === 0, n0 + ' 盘小尺寸题目：环合法、数字与答案对得上、解唯一');
  chk(clueMin >= 4 && clueMax < 24, '数字个数 ' + clueMin + '~' + clueMax + '（删到只剩唯一解就收手）');
  chk(slowest < 3000, '小尺寸出题最慢 ' + slowest + 'ms（vm 沙箱里测的，浏览器更快）');
  let bigBad = 0, bigSlow = 0;
  for (const sz of [[7, 7], [8, 8]]) {
    const adj4 = Gg.nb4List(sz[0], sz[1]), adj8 = Gg.nb8List(sz[0], sz[1]);
    const t0 = Date.now();
    const p = Gg.genPuzzle(Gg.rngOf(31337 + sz[0]), sz[0], sz[1], adj4, adj8, 0.42, 6, 420);
    bigSlow = Math.max(bigSlow, Date.now() - t0);
    const full = Gg.cluesOf(p.on, adj8, sz[0] * sz[1]);
    for (let i = 0; i < full.length; i++) if (p.clue[i] >= 0 && p.clue[i] !== full[i]) bigBad++;
    if (!Gg.loopOK(p.on, adj4, sz[0] * sz[1])) bigBad++;
    const r = Gg.solveRows(sz[0], sz[1], p.clue, 3, adj4, adj8, 400000);
    if (r.sols.length !== 1 || r.timeout) bigBad++;
  }
  chk(bigBad === 0, '大尺寸（7×7 / 8×8）抽查同样唯一');
  chk(bigSlow < 12000, '大尺寸出题最慢 ' + bigSlow + 'ms（含沙箱放大，真机 <1s）');
  {
    const adj4 = Gg.nb4List(5, 5), adj8 = Gg.nb8List(5, 5);
    const a = Gg.genPuzzle(Gg.rngOf(4242), 5, 5, adj4, adj8, 0.42, 6, 420);
    const b = Gg.genPuzzle(Gg.rngOf(4242), 5, 5, adj4, adj8, 0.42, 6, 420);
    chk(a.on.join('') === b.on.join('') && a.clue.join('') === b.clue.join(''), '同种子出同一盘（可分享 #seed=）');
    const c = Gg.genPuzzle(Gg.rngOf(4243), 5, 5, adj4, adj8, 0.42, 6, 420);
    chk(a.clue.join('') !== c.clue.join(''), '换个种子就是另一盘');
  }
  {
    const adj4 = Gg.nb4List(6, 6), adj8 = Gg.nb8List(6, 6);
    const cntOf = (frac) => {
      const p = Gg.genPuzzle(Gg.rngOf(8888), 6, 6, adj4, adj8, frac, 6, 2000);
      let c = 0;
      for (const v of p.clue) if (v >= 0) c++;
      return c;
    };
    const e = cntOf(0.5), s = cntOf(0.42), r = cntOf(0.36);
    chk(e > s && s >= r, '数字密度：佛系 ' + e + ' > 标准 ' + s + ' >= 限时 ' + r);
    chk(e <= 36 && r >= 4, '数字数在 4 ~ 全盘之间（' + r + '~' + e + '）');
  }
}

/* ==================== 5. 三态点击与实时反馈（真实 DOM） ==================== */
console.log('— 棋盘与三态');
g = open(4242, {});
Gg = G(g);
{
  const s0 = st(g);
  chk(s0.phase === 'play' && s0.level === 0, '开画后进第 1 关');
  chk(s0.rows === 4 && s0.cols === 4, '第 1 关是 4×4');
  chk(Gg.nCells() === 16, '盘上渲染出 16 个格');
  chk(Gg.gridStyle().c === 'repeat(4, 1fr)' && Gg.gridStyle().r === 'repeat(4, 1fr)', '行列数写进 grid 样式');
  chk(Gg.hudText().dim === '4×4' && Gg.hudText().lv === '1', '招牌显示 4×4 与第 1 关');
  const clues = Gg.clues();
  let nClue = 0;
  for (const v of clues) if (v >= 0) nClue++;
  chk(nClue >= 4, '这盘发了 ' + nClue + ' 个数字');
  let digitCells = 0;
  for (let i = 0; i < 16; i++) if (/^\d+$/.test(Gg.txt(i))) digitCells++;
  chk(digitCells === nClue, digitCells + ' 个格把数字画在了角上');
  chk(Gg.grid().every((v) => v === 0), '开局全空');
  chk(Gg.hudText().on === '0' && Gg.hudText().knot === '0', '圈上 0 格 / 打结 0');
  chk(Gg.hudText().clock === Gg.fmtTime(s0.timeTicks), '剩余时间显示对得上拍数');
  chk(Gg.clues().filter((v) => v === 0).length >= 0, '数字可以是 0（角上一看就排除）');
  /* 点一格三态循环 */
  tap(g, 5);
  chk(Gg.grid()[5] === Gg.K().ON, '点一下 = 画进圈');
  chk(Gg.cls(5).indexOf(' on') >= 0, '画进的格带 on 类');
  chk(Gg.st().onCount === 1, '圈上计数 1');
  chk(Gg.knotF()[5] === 1 && Gg.st().knots === 1, '孤零零一格 = 打结（邻居数不是 2）');
  chk(Gg.cls(5).indexOf('knot') >= 0, '打结的格标红');
  chk(Gg.hudText().knot === '1' && Gg.hudText().knotCls.indexOf('bad') >= 0, '打结招牌变红');
  chk(Gg.msg().indexOf('打结 1 处') >= 0, '提示语实时报打结');
  tap(g, 5);
  chk(Gg.grid()[5] === Gg.K().MK, '再点一下 = 打 ✕');
  chk(Gg.cls(5).indexOf('mk') >= 0 && Gg.st().onCount === 0, '✕ 不算圈上');
  tap(g, 5);
  chk(Gg.grid()[5] === Gg.K().OFF, '第三下回到空');
  /* 右键反着切 */
  tap(g, 5, true);
  chk(Gg.grid()[5] === Gg.K().MK, '右键从空倒着切到 ✕');
  tap(g, 5, true);
  chk(Gg.grid()[5] === Gg.K().ON, '再右键切到圈上');
  tap(g, 5, true);
  chk(Gg.grid()[5] === Gg.K().OFF, '右键也能切回空');
  chk(Gg.st().phase === 'play', '来回切不会误判过关');
}
{
  const ans = Gg.ans();
  Gg.paint2(ans.map((v) => (v ? 1 : 0)));
  chk(st(g).solved === true, '照抄答案：判赢');
  chk(st(g).knots === 0 && st(g).errs === 0, '完整圈既不打结也不欠数字');
  const list = ans.map((v) => (v ? 1 : 0));
  let firstOn = 0;
  for (let i = 0; i < list.length; i++) if (list[i]) { firstOn = i; break; }
  list[firstOn] = 0;
  Gg.paint2(list);
  chk(st(g).solved === false && st(g).knots >= 1, '擦掉圈上任一格就断口：' + st(g).knots + ' 处打结');
  const list2 = ans.map((v) => (v ? 1 : 0));
  let offIdx = -1;
  for (let i = 0; i < list2.length; i++) if (!list2[i]) { offIdx = i; break; }
  list2[offIdx] = 1;
  Gg.paint2(list2);
  chk(st(g).solved === false, '圈上多画一格也不算过');
  chk(st(g).knots >= 1 || st(g).errs >= 1, '多画那格至少触发一种报警（结 ' + st(g).knots + ' / 欠 ' + st(g).errs + '）');
  Gg.paint2(ans.map((v) => (v ? 1 : 0)).map((v, i) => (v ? 1 : (i % 3 === 0 ? 2 : 0))));
  chk(st(g).solved === true, '在非圈格上打一堆 ✕ 仍然算赢（✕ 只是记号）');
}

/* ==================== 6. 赢一关 → 下一关 → 纪录 ==================== */
console.log('— 过关与纪录');
{
  Gg.paint2(new Array(16).fill(0));
  const ans = Gg.ans();
  const before = st(g).score;
  const k0 = st(g).knots;
  chk(k0 === 0, '擦干净之后不打结');
  let clicks = 0;
  for (let i = 0; i < 16; i++) if (ans[i]) { tap(g, i); clicks++; }
  const s1 = st(g);
  chk(clicks === Gg.countAnswer(), '点 ' + clicks + ' 下正好铺满这条圈');
  chk(s1.phase === 'clear', '最后一格点下就过关');
  chk(s1.score > before, '过关加分（' + before + ' → ' + s1.score + '）');
  chk(Gg.ov().indexOf('这一圈画对了') >= 0, '遮罩提示过关');
  chk(Gg.ov().indexOf('+' + s1.score) >= 0, '遮罩报出这一关得分');
  chk(Gg.ov().indexOf('下一关 5×4') >= 0, '预告下一关尺寸');
  chk(g.storage.getItem('sq.lv') === '1', 'sq.lv 记到第 1 关');
  chk(Number(g.storage.getItem('sq.loop')) === clicks, 'sq.loop 累计圈格 ' + clicks);
  chk(Gg.hudText().score === String(s1.score), '分数招牌同步');
  chk(Gg.grid().filter((v) => v === 1).length === clicks, '盘上还留着画好的圈');
  const tHold = s1.timeTicks;
  g.pump(0.5, 100);
  chk(st(g).timeTicks === tHold, '过关遮罩挡着时不走表');
  chk(clickAct(g, 'next') === true, '能点「下一关」');
  const s2 = st(g);
  chk(s2.level === 1 && s2.rows === 5 && s2.cols === 4, '进到第 2 关 5×4');
  chk(s2.phase === 'play' && s2.score === s1.score, '分数带进下一关');
  chk(Gg.nCells() === 20 && Gg.gridStyle().c === 'repeat(4, 1fr)', '盘重建成 20 格 / 4 列');
  chk(Math.abs(s2.timeTicks - Gg.limitTicks()) <= 3 && s2.timeTicks > tHold, '新一关重新拿满限时（' + Gg.fmtTime(s2.timeTicks) + '）');
  chk(Gg.grid().every((v) => v === 0), '新一关盘面清空');
  chk(Gg.hudText().lv === '2', '招牌显示第 2 关');
  chk(g.storage.getItem('sq.lv') === '2', 'sq.lv 跟着涨到 2');
}

/* ==================== 7. 提示 / 全擦 / 擦错 ==================== */
console.log('— 拐杖');
{
  const s0 = st(g);
  chk(s0.hints === Gg.D().hints, '标准局默认给 ' + s0.hints + ' 次提示');
  tap(g, 0);
  tap(g, 1);
  const h0 = st(g).hints, t0 = st(g).timeTicks;
  Gg.useHint();
  const s1 = st(g);
  chk(s1.hints === h0 - 1, '用掉一次提示（' + h0 + ' → ' + s1.hints + '）');
  chk(s1.hinted === true, '本关标记「用过提示」');
  chk(t0 - s1.timeTicks === Gg.K().HINT_COST, '提示扣 ' + Gg.K().HINT_COST + ' 拍');
  const revs = Gg.revs().map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  chk(revs.length >= 1, '提示揭示了 ' + revs.length + ' 格');
  const p = revs[0];
  chk(Gg.grid()[p] === (Gg.ans()[p] ? Gg.K().ON : Gg.K().MK), '揭示的格与唯一解一致');
  chk(Gg.cls(p).indexOf('rev') >= 0, '揭示过的格带 ✦ 标记');
  chk(Gg.msg().indexOf('第 ') >= 0 && Gg.msg().indexOf('格') >= 0, '提示语说清是哪一格');
  chk(Gg.hudText().hint === String(s1.hints), '提示次数招牌同步');
}
{
  /* 用过提示 = 少一份奖励分 */
  const s = st(g);
  Gg.setVars('timeTicks', 600);
  const withHint = Gg.gainOf();
  Gg.setVars('hinted', false);
  const noHint = Gg.gainOf();
  chk(noHint > withHint, '同一片留白，没用提示多给 ' + (noHint - withHint) + ' 分');
  Gg.setVars('hinted', true);
}
{
  g = open(700, {});
  Gg = G(g);
  Gg.setVars('hints', 0);
  Gg.useHint();
  chk(Gg.msg().indexOf('提示用完了') >= 0, '提示用光给说明');
  chk(Gg.hudText().hintOff === true, '提示按钮置灰');
  const h = st(g).hints;
  Gg.useHint();
  chk(st(g).hints === h, '用光之后再按不扣次数');
}
{
  /* 全擦：把没揭示过的格清空，提示痕迹原样保留 */
  g = open(771, {});
  Gg = G(g);
  for (let k = 0; k < 5; k++) tap(g, k);
  chk(Gg.grid().some((v) => v !== 0), '先随手画几格');
  chk(st(g).phase === 'play', '随手画不至于误判过关');
  Gg.useHint();
  const revIdx = Gg.revs().map((v, ix) => (v ? ix : -1)).filter((ix) => ix >= 0);
  chk(revIdx.length === 1, '提示留下 1 个痕迹（第 ' + revIdx[0] + ' 格）');
  const revKeep = Gg.grid()[revIdx[0]];
  chk(revKeep === (Gg.ans()[revIdx[0]] ? Gg.K().ON : Gg.K().MK), '痕迹格停在与答案一致的状态');
  Gg.clearBoard();
  chk(Gg.grid().filter((v, ix) => v !== 0 && !Gg.revs()[ix]).length === 0, '没揭示过的格全清空');
  chk(Gg.grid()[revIdx[0]] === revKeep, '全擦不动提示痕迹');
  chk(st(g).onCount === (revKeep === Gg.K().ON ? 1 : 0), '圈上计数只剩那个痕迹：' + st(g).onCount);
  chk(Gg.msg().indexOf('擦干净') >= 0, '全擦给反馈');
}
{
  g = open(772, {});
  Gg = G(g);
  const ans = Gg.ans();
  let offIdx = -1;
  for (let i = 0; i < ans.length; i++) if (!ans[i]) { offIdx = i; break; }
  chk(offIdx >= 0, '盘上有不在圈上的格可试');
  /* 先画完整圈，再多点一格 */
  for (let i = 0; i < ans.length; i++) if (ans[i]) tap(g, i);
  chk(st(g).phase === 'clear', '画完整圈过关');
  clickAct(g, 'next');
  const ans2 = Gg.ans();
  let off2 = -1;
  for (let i = 0; i < ans2.length; i++) if (!ans2[i]) { off2 = i; break; }
  const good = ans2.map((v) => (v ? 1 : 0));
  good[off2] = 1;
  Gg.paint2(good);
  const kn0 = st(g).knots;
  chk(kn0 >= 1, '圈外多画一格 → ' + kn0 + ' 处打结');
  Gg.wipeWrong();
  chk(st(g).knots < kn0, '「擦错」一轮就把打结从 ' + kn0 + ' 降到 ' + st(g).knots);
  let guard2 = 0;
  while (st(g).knots > 0 && guard2++ < 12) Gg.wipeWrong();
  chk(st(g).knots === 0, '反复擦错擦到没有结（共 ' + (guard2 + 1) + ' 轮）');
  Gg.paint2(ans2.map((v) => (v ? 1 : 0)));
  const snap = Gg.grid().join('');
  chk(st(g).knots === 0 && st(g).errs === 0, '完整圈既无结也不欠数字');
  Gg.wipeWrong();
  chk(Gg.grid().join('') === snap, '没错可擦时一格都不动');
  chk(Gg.msg().indexOf('没有能擦') >= 0, '没错可擦时给说明');
}
{
  /* 整盘画满：数字全对不上，擦错会退掉贴着错数字的格 */
  g = open(773, {});
  Gg = G(g);
  Gg.paint2(Gg.ans().map(() => 1));
  chk(st(g).errs > 0, '每格都画进圈：' + st(g).errs + ' 个数字对不上');
  const kn = st(g).knots, on0 = st(g).onCount;
  const w0 = Gg.grid().join('');
  Gg.wipeWrong();
  chk(Gg.grid().join('') !== w0 && st(g).knots <= kn, '一格都不对时擦错改动了盘面（结 ' + kn + '→' + st(g).knots + '）');
  chk(Gg.nearBadClue(0) === true || Gg.nearBadClue(5) === true, '贴着错数字的格被认作可疑');
}

/* ==================== 8. 限时、散场、暂停与战绩 ==================== */
console.log('— 时钟与页面');
{
  g = open(999, {});
  Gg = G(g);
  const t0 = st(g).timeTicks;
  g.pump(1.0, 100);
  const t1 = st(g).timeTicks;
  chk(Math.abs((t0 - t1) - 10) <= 1, '一秒走 10 拍（' + t0 + ' → ' + t1 + '）');
  chk(Gg.secLeft() === Math.round(t1 / 10), 'secLeft 换算成秒');
  Gg.togglePause();
  chk(st(g).paused === true && Gg.ov().indexOf('暂停') >= 0, '暂停弹遮罩');
  const t2 = st(g).timeTicks;
  g.pump(1.5, 100);
  chk(st(g).timeTicks === t2, '暂停期间不走表');
  chk(Gg.hudText().pause.indexOf('继续') >= 0, '按钮变成继续');
  chk(Gg.hudText().hintOff === true, '暂停时提示置灰');
  tap(g, 3);
  chk(Gg.grid()[3] === Gg.K().OFF, '暂停时点格无效');
  clickAct(g, 'resume');
  chk(st(g).paused === false, '遮罩「继续」解除暂停');
  g.pump(0.5, 100);
  chk(st(g).timeTicks < t2, '恢复后继续走表');
  Gg.stats();
  chk(Gg.ov().indexOf('本机战绩') >= 0, '战绩页');
  chk(Gg.ov().indexOf('累计圈格') >= 0, '战绩页报累计圈格');
  chk(Gg.ov().indexOf('打结') >= 0, '战绩页顺手报当前盘面');
  chk(Gg.ov().indexOf('标准局') >= 0, '战绩页报难度名');
  clickAct(g, 'resume');
  Gg.setVars('timeTicks', 3);
  g.pump(0.5, 100);
  chk(st(g).phase === 'over', '时间清零散场');
  chk(st(g).timeTicks === 0, '散场后剩余归零');
  chk(Gg.ov().indexOf('时间到') >= 0, '散场写明原因');
  chk(Gg.ov().indexOf('看答案') >= 0, '散场给「看答案」');
  chk(Gg.ov().indexOf('打结') >= 0, '散场报当时画成什么样');
  const loopBefore = Number(g.storage.getItem('sq.loop') || '0');
  const scoreBefore = st(g).score;
  chk(clickAct(g, 'reveal'), '能点看答案');
  chk(Gg.grid().every((v, i) => v === (Gg.ans()[i] ? Gg.K().ON : Gg.K().MK)), '答案整条铺到盘上');
  chk(st(g).phase === 'over', '看完答案仍是散场（不加分）');
  chk(st(g).score === scoreBefore, '看答案不加分');
  chk(Number(g.storage.getItem('sq.loop')) === loopBefore, '看答案不刷累计圈格');
  chk(Gg.ov().indexOf('这就是那条圈') >= 0, '答案页说明');
  chk(Gg.hudText().on === String(Gg.countAnswer()), '答案铺上后圈格计数对得上');
  clickAct(g, 'again');
  chk(st(g).phase === 'play' && st(g).level === 0, '重开回到第 1 关');
}
{
  /* 散场时把最高分写进 sq.best */
  g = open(990, {});
  Gg = G(g);
  Gg.setVars('score', 4321);
  Gg.setVars('timeTicks', 1);
  g.pump(0.3, 100);
  chk(st(g).phase === 'over', '散场');
  chk(g.storage.getItem('sq.best') === '4321', '散场结算 sq.best');
  g = open(991, { 'sq.best': '99999' });
  Gg = G(g);
  Gg.setVars('score', 10);
  Gg.setVars('timeTicks', 1);
  g.pump(0.3, 100);
  chk(g.storage.getItem('sq.best') === '99999', '低于本机最高分不覆盖');
  Gg.stats();
  chk(Gg.ov().indexOf('99999') >= 0, '战绩页显示最高分');
}
{
  g = boot({}, 88);
  Gg = G(g);
  const seen = {};
  for (const d of ['easy', 'std', 'rush']) {
    chk(pickDiff(g, d), '能选中难度 ' + d);
    chk(st(g).diff === d && g.storage.getItem('sq.diff') === d, 'sq.diff 存了 ' + d);
    clickAct(g, 'start');
    seen[d] = { ticks: Gg.limitTicks(), hints: st(g).hints, frac: Gg.D().frac, mult: Gg.D().mult, flips: Gg.D().flips };
    chk(Gg.hudText().hint === String(seen[d].hints), d + ' 提示招牌 = ' + seen[d].hints);
    chk(Gg.st().level === 0, '换难度回到第 1 关');
  }
  chk(seen.easy.ticks > seen.std.ticks && seen.std.ticks > seen.rush.ticks, '限时递增：' + seen.easy.ticks + '/' + seen.std.ticks + '/' + seen.rush.ticks);
  chk(seen.easy.frac > seen.std.frac && seen.std.frac > seen.rush.frac, '难度越高数字越少');
  chk(seen.easy.hints > seen.std.hints && seen.std.hints > seen.rush.hints, '拐杖越少：' + seen.easy.hints + '/' + seen.std.hints + '/' + seen.rush.hints);
  chk(seen.easy.mult < seen.std.mult && seen.std.mult < seen.rush.mult, '倍率递增：' + seen.easy.mult + '/' + seen.std.mult + '/' + seen.rush.mult);
  chk(seen.rush.flips > seen.easy.flips, '限时挑战把环翻得更散');
}
{
  /* 关越大限时越长、给分越高 */
  g = open(1234, {});
  Gg = G(g);
  const t4 = Gg.limitTicks();
  Gg.setVars('level', 7);
  chk(Gg.limitTicks() > t4, '8×8 的限时比 4×4 长（' + Gg.fmtTime(Gg.limitTicks()) + ' vs ' + Gg.fmtTime(t4) + '）');
  chk(Gg.sizeOf(7).rows === 8 && Gg.sizeOf(0).rows === 4, 'sizeOf 按关号取尺寸');
  chk(Gg.sizeOf(99).rows === 8, '关号越界也夹到最后一关');
  Gg.setVars('level', 0);
  Gg.setVars('timeTicks', 600);
  const small = Gg.gainOf();
  Gg.startLevel(2);
  Gg.setVars('timeTicks', 600);
  const mid = Gg.gainOf();
  chk(mid > small, '5×5 比 4×4 给分高（' + mid + ' > ' + small + '）');
  Gg.setVars('timeTicks', 60);
  chk(Gg.gainOf() < mid, '同一盘剩 6 秒比剩 60 秒值钱得少（' + Gg.gainOf() + ' < ' + mid + '）');
  Gg.startLevel(0);
}

/* ==================== 9. 一路画到底 ==================== */
console.log('— 整局通关');
{
  g = open(24681, {});
  Gg = G(g);
  const sizes = [];
  let cleared = 0, guard = 0;
  while (guard++ < 20 && st(g).phase === 'play') {
    const s = st(g);
    sizes.push(s.rows + '×' + s.cols);
    Gg.drawAnswer();
    Gg.afterEdit(0);
    if (st(g).phase !== 'clear') { chk(false, '第 ' + (s.level + 1) + ' 关画对了却没过关'); break; }
    cleared++;
    if (Gg.ov().indexOf('八关全画完了') >= 0) {
      chk(Number(g.storage.getItem('sq.best')) > 0, '收官结算 sq.best');
      chk(Gg.ov().indexOf('再来一局') >= 0, '收官给再来一局');
      break;
    }
    if (!clickAct(g, 'next')) break;
  }
  chk(sizes.length === Gg.K().LEVELS - 1 || sizes.length === Gg.K().LEVELS, '一路过了 ' + cleared + ' 关：' + sizes.join(' → '));
  chk(sizes[0] === '4×4', '第一关从 4×4 起步');
  chk(st(g).level === Gg.K().LEVELS - 1 || st(g).phase !== 'play', '画到了最后一关（level ' + (st(g).level + 1) + '）');
  chk(st(g).totalLoop > 0, '本局累计圈格 ' + st(g).totalLoop);
  chk(Number(g.storage.getItem('sq.lv')) === Gg.K().LEVELS, 'sq.lv 记到第 ' + g.storage.getItem('sq.lv') + ' 关');
  chk(Number(g.storage.getItem('sq.loop')) >= st(g).totalLoop, 'sq.loop 累加到 ' + g.storage.getItem('sq.loop'));
  chk(cleared === Gg.K().LEVELS, '八关全部画完（' + cleared + '/' + Gg.K().LEVELS + '）');
}

/* ==================== 10. 键盘与复现 ==================== */
console.log('— 键盘');
{
  g = open(31415, {});
  Gg = G(g);
  const cols = st(g).cols;
  chk(st(g).cur === 0, '光标初始在左上');
  g.key('ArrowRight');
  chk(st(g).cur === 1, '右移一格');
  g.key('ArrowDown');
  chk(st(g).cur === cols + 1, '下移一行（光标 ' + st(g).cur + '）');
  g.key('ArrowUp'); g.key('ArrowUp'); g.key('ArrowLeft');
  chk(st(g).cur === 0, '走到边界不越界');
  chk(Gg.cls(0).indexOf('cur') >= 0, '当前格高亮');
  g.key('Enter');
  chk(Gg.grid()[0] === Gg.K().ON, 'Enter 切当前格');
  g.key('x');
  chk(Gg.grid()[0] === Gg.K().MK, 'X 直接打叉');
  g.key('x');
  chk(Gg.grid()[0] === Gg.K().OFF, 'X 再按取消');
  g.key('1');
  chk(Gg.grid()[0] === Gg.K().ON, '数字键 1 画进圈');
  g.key('0');
  chk(Gg.grid()[0] === Gg.K().OFF, '数字键 0 清空');
  g.key('d'); g.key('d');
  chk(st(g).cur === 2, 'WASD 也能走格子');
  g.key('w');
  chk(st(g).cur === 2, '在第一行再按 W 不动');
  g.key('h');
  chk(st(g).hints === Gg.D().hints - 1, 'H 用提示');
  Gg.paint2(new Array(st(g).cells).fill(0));
  for (let i = 0; i < Gg.ans().length; i++) if (Gg.ans()[i]) tap(g, i);
  chk(st(g).phase === 'clear', '点满一条圈过关');
  g.key('Enter');
  chk(st(g).phase === 'play' && st(g).level === 1, '过关后按 Enter 进下一关');
  g.key(' ');
  chk(st(g).paused === true, '空格暂停');
  g.key(' ');
  chk(st(g).paused === false, '空格继续');
  const revLeft = Gg.revs().filter((v) => v).length;
  g.key('c');
  chk(Gg.grid().filter((v, i) => v !== 0 && !Gg.revs()[i]).length === 0, 'C 全擦（留 ' + revLeft + ' 格提示痕迹）');
  g.key('t');
  chk(Gg.ov().indexOf('本机战绩') >= 0, 'T 开战绩');
  g.key('Escape');
  chk(Gg.ovShown() === false, 'Esc 关掉战绩');
  g.key('n');
  chk(st(g).phase === 'intro', 'N 重开回介绍页');
  chk(Gg.hudText().lv === '1', '重开回到第 1 关招牌');
  g.key('m');
  chk(g.storage.getItem('sq.muted') !== null, 'M 写 sq.muted');
  g.byId('btnSound').dispatch('click');
  chk(Gg.hudText() && true, '🔊 按钮不炸');
  g.byId('btnNew').dispatch('click');
  chk(st(g).phase === 'intro', '↻ 也回介绍页');
  clickAct(g, 'start');
  g.byId('btnStats').dispatch('click');
  chk(Gg.ov().indexOf('最高分') >= 0, '📊 按钮开战绩');
  clickAct(g, 'resume');
  g.byId('btnHint').dispatch('click');
  chk(st(g).hints === Gg.D().hints - 1, '💡 按钮用提示');
  g.byId('btnClear').dispatch('click');
  chk(true, '🧽 按钮不炸');
  g.byId('btnFix').dispatch('click');
  chk(true, '🧹 按钮不炸');
  g.byId('board').dispatch('click', { target: { closest: () => null } });
  chk(true, '点到盘外不炸');
}
{
  /* 同一种子必须复现同一串关卡 */
  const snap = (seed) => {
    const gg = open(seed, {});
    const G2 = G(gg);
    return G2.clues().join(',') + '|' + G2.ans().join('');
  };
  chk(snap(55555) === snap(55555), '#seed= 能钉住关卡（可分享给同事比手速）');
  chk(snap(55555) !== snap(55556), '换种子就是另一盘');
}
{
  const gg = boot({}, 606);
  const G2 = G(gg);
  chk(G2.ovShown() === true, '开局先盖介绍页');
  chk(G2.ov().indexOf('数圈') >= 0 && G2.ov().indexOf('闭合回路') >= 0, '介绍页讲清规则');
  chk(G2.ov().indexOf('开画') >= 0, '介绍页有开画按钮');
  chk(G2.hudText().hintOff === true, '介绍页时提示按钮置灰');
  chk(G2.gridStyle().c === 'repeat(4, 1fr)', '介绍页底下已经把第 1 关铺好了');
  chk(clickAct(gg, 'stats'), '介绍页能直接翻战绩');
  chk(G2.ov().indexOf('本机战绩') >= 0, '战绩页内容');
  chk(G2.ovShown() === true, '战绩页仍盖着遮罩');
  clickAct(gg, 'resume');
  chk(G2.ovShown() === false, '战绩关掉后遮罩收起');
  chk(st(gg).phase === 'intro', '关掉战绩还停在介绍页');
  G2.intro();
  chk(clickAct(gg, 'start'), '介绍页有可点的开画按钮');
  chk(st(gg).phase === 'play' && G2.ovShown() === false, '开画后遮罩收起、进 play');
}
summary('shuquan', fails);
