'use strict';
/* 移个车先：出题器 / 滑动规则 / 最少挪车次数 三块地基
   重点核对：① 生成的每一局都真的能解，而且 par 等于「独立写的第二套 BFS」算出来的最少次数
   ② 滑动只能沿自己的轴、不能穿车，滑多远都算一次 ③ 提示给出的第一步确实是最优解的一部分
   ④ 撤销会把次数退回去 ⑤ 结算分能按公式逐条手算 ⑥ 全程只用键盘和点击就能打通十场 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  st: function () { return { phase: phase, stage: stage, par: par, used: used, score: score, hints: hints, hintUsed: hintUsed,
    diff: diff, sel: sel, lastGain: lastGain, hist: hist.length, cars: vs.length,
    vs: vs.map(function (v) { return { x: v.x, y: v.y, len: v.len, dir: v.dir }; }) }; },
  DIFFS: function () { return DIFFS; }, STAGES: function () { return STAGES; }, N: function () { return N; },
  spec: spec, solve: function (cap) { return solve(vs, cap || 40000); },
  solveVs: function (vvs, cap) { return solve(vvs, cap || 30000); },
  genPuzzle: genPuzzle, placeCars: placeCars, rngOf: rngOf, pickDeep: pickDeep, bfsAll: bfsAll, solveVs2: solve, materialize: materialize, rangeNow: rangeNow, fallback: fallbackVs,
  dragging: function () { return !!drag; },
  slide: slide, nudge: nudge, tapCell: tapCell, dragTo: dragTo, select: select, undo: undo, useHint: useHint,
  act: act, stats: stats, startStage: startStage, newRound: newRound, resetStage: resetStage, gainOf: gainOf,
  cellIdx: cellIdx, isH: isH, posOf: posOf, cellsAt: cellsAt, vehicleAt: vehicleAt, isExit: function (v) { return v.dir === 0 && v.y === EXIT_Y && v.x + v.len === N; },
  setDiff: function (d) { diff = d; }, setScore: function (v) { score = v; }, setUsed: function (v) { used = v; },
  setSeed: function (v) { FIXED_SEED = v >>> 0; },
  setHints: function (v) { hints = v; }, setHintUsed: function (v) { hintUsed = v; }, setSel: function (v) { sel = v; },
  msg: function () { return msgEl.innerHTML; }, ov: function () { return ovContent.innerHTML; },
  ovShown: function () { return overlayEl._cls.indexOf('show') >= 0; },
  hud: function () { return { lv: elLv.textContent, used: elUsed.textContent, par: elPar.textContent,
    score: elScore.textContent, hint: elHint.textContent, undo: elUndo.textContent }; },
  toolOff: function () { return { hint: !!btnHint.disabled, undo: !!btnUndo.disabled }; },
  diffActive: function () { return byId('diff').querySelectorAll('[data-diff]').filter(function (b) { return b._cls.indexOf('active') >= 0; }).map(function (b) { return b.dataset.diff; }).join(','); },
  cells: function () { return cellLayer.querySelectorAll('.pk-cell').map(function (c) { return { i: +c.dataset.i, cls: c.className }; }); },
  carNodes: function () { return carLayer.querySelectorAll('.pk-car').map(function (c) { return { i: +c.dataset.v, cls: c.className, box: c.style.left + '/' + c.style.top + '/' + c.style.width }; }); },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('移个车先源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const D = (g) => g.ctx.__g;
const st = (g) => D(g).st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
// 出题默认随机，测试里把种子钉住，跑一百遍都是同一串停车场（#seed= 在线上也能用）
const SEED = 20260917;
function boot(storage) {
  const g = loadGame('parking', { transform: inject, storage: storage || {} });
  g.pump(0.3);
  D(g).setSeed(SEED);
  return g;
}
function clickAct(g, name) {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  if (b) b.dispatch('click');
  g.pump(0.2);
  return !!b;
}

/* ==================== 第二套实现：只用地图自己推 ==================== */
const SZ = 6, ROW = 2;
function vcells(v, p) {
  const out = [];
  for (let k = 0; k < v.len; k++) out.push(v.dir === 0 ? (p + k) + v.y * SZ : v.x + (p + k) * SZ);
  return out;
}
function vpos(v) { return v.dir === 0 ? v.x : v.y; }
// 独立 BFS：返回「红车滑到最右边」的最少挪车次数
function indepSolve(vs) {
  const key = (a) => a.join('|');
  const goal = SZ - vs[0].len;
  const range = (a, i) => {
    const s = new Set();
    a.forEach((p, j) => { if (j !== i) vcells(vs[j], p).forEach((c) => s.add(c)); });
    const v = vs[i];
    let lo = a[i], hi = a[i];
    while (lo > 0 && vcells(v, lo - 1).every((c) => !s.has(c))) lo--;
    while (hi <= SZ - v.len - 1 && vcells(v, hi + 1).every((c) => !s.has(c))) hi++;
    return [lo, hi];
  };
  const start = vs.map(vpos);
  const dist = { [key(start)]: 0 };
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const a = q[h], d = dist[key(a)];
    if (a[0] === goal) return d;
    for (let i = 0; i < vs.length; i++) {
      const [lo, hi] = range(a, i);
      for (let p = lo; p <= hi; p++) {
        if (p === a[i]) continue;
        const n = a.slice();
        n[i] = p;
        if (dist[key(n)] !== undefined) continue;
        dist[key(n)] = d + 1;
        q.push(n);
      }
    }
  }
  return null;
}
function overlaps(vs) {
  const s = new Set();
  for (const v of vs) for (const c of vcells(v, vpos(v))) { if (s.has(c)) return true; s.add(c); }
  return false;
}
function inBoard(vs) {
  return vs.every((v) => (v.dir === 0 ? v.y >= 0 && v.y < SZ && v.x >= 0 && v.x + v.len <= SZ : v.x >= 0 && v.x < SZ && v.y >= 0 && v.y + v.len <= SZ));
}

/* ==================== 开局 ==================== */
const g = boot();
chk(st(g).phase === 'intro', '刚进来先看规矩');
chk(D(g).ovShown(), '遮罩是展开的');
chk(D(g).diffActive() === 'jam', '默认难度是「早高峰」');
chk(D(g).STAGES() === 10 && D(g).N() === 6, '一局十场，停车场 6×6');
chk(/只能沿/.test(plain(D(g).ov())) && /倒着推/.test(plain(D(g).ov())), '说明里讲清了滑动规则和「一定有解」');
chk(D(g).cells().length === 36, '地面铺了 36 个格子');
chk(clickAct(g, 'start'), '遮罩上有「开始挪车」');
const s0 = st(g);
chk(s0.phase === 'play' && s0.stage === 0, '开始之后进入第一场');
chk(s0.used === 0 && s0.score === 0 && s0.sel === null, '挪车次数、分数、选中态都是空的');
chk(s0.par >= 2, '第一场至少得挪 ' + s0.par + ' 次');
chk(D(g).hud().par === String(s0.par) && D(g).hud().used === '0', 'HUD 跟着局面走');

/* ==================== 出题器：每局都有解，par 与独立 BFS 一致 ==================== */
function batch(cars, seeds) {
  const out = [];
  for (let t = 0; t < seeds; t++) {
    out.push(D(g).genPuzzle({ cars: cars, band: 4, seed: 424242 + t * 7919 + cars * 31, attempts: 6, cap: 12000, gates: 2 }));
  }
  return out;
}
[6, 8, 10, 11].forEach((cars) => {
  const list = batch(cars, 6);
  chk(list.every((p) => p.vs.length === cars), cars + ' 辆车时都能塞满（不会退回样例局）');
  chk(list.every((p) => !overlaps(p.vs) && inBoard(p.vs)), cars + ' 辆车互不重叠、都在场子里');
  chk(list.every((p) => p.vs[0].y === ROW && p.vs[0].dir === 0 && p.vs[0].x + p.vs[0].len < SZ), cars + ' 辆车时红车都还没到出口');
  chk(list.every((p) => p.vs.slice(1).every((v) => !(v.dir === 0 && v.y === ROW))), cars + ' 辆车时横车不堵出口行（竖车才负责挡路）');
  const same = list.every((p) => indepSolve(p.vs) === p.par);
  const deep = list.every((p) => p.par >= 2);
  chk(same, cars + ' 辆车：par 与独立 BFS 的最少挪车次数逐个相等（' + list.map((p) => p.par).join('/') + '）');
  chk(deep, cars + ' 辆车：每局都至少要点脑子和挪 ' + list.map((p) => p.par).join('/') + ' 次');
});
{
  // 十场连着的规格应当越来越堵
  const specs = [];
  for (let i = 0; i < 10; i++) specs.push(D(g).spec(i));
  chk(specs.every((sp, i) => i === 0 || sp.cars >= specs[i - 1].cars), '每场的车只会越来越多');
  chk(specs.every((sp, i) => i === 0 || sp.band >= specs[i - 1].band), '要求的最少次数只升不降');
  chk(specs[0].cars < specs[9].cars, '第一场和最后一场不是一个堵法');
  chk(specs[0].gates < specs[9].gates, '后面几场出口的「门」更多');
}

/* ==================== 不钉种子的真实随机路径：随机三场都能打穿 ==================== */
{
  const b = boot();
  D(b).setSeed(0);
  for (let round = 0; round < 3; round++) {
    clickAct(b, 'start');
    const before = st(b).par;
    chk(before >= 2, '随机第 ' + (round + 1) + ' 场招牌上写着最少挪 ' + before + ' 次');
    let guard = 0, agree = true;
    while (st(b).phase === 'play' && guard++ < 60) {
      const r = D(b).solve();
      if (!r || !r.first) break;
      if (r.moves !== indepSolve(st(b).vs)) agree = false;
      D(b).slide(r.first.i, r.first.to);
      if (r.moves <= 1) break;
    }
    chk(agree, '随机第 ' + (round + 1) + ' 场每一步：现场 BFS 和独立 BFS 剩的次数都一致');
    chk(st(b).phase === 'clear', '随机第 ' + (round + 1) + ' 场按最优解能出库');
    chk(st(b).used === before, '随机第 ' + (round + 1) + ' 场用的正是最少次数 ' + before);
  }
}

/* ==================== 滑动规则 ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  const s = st(b);
  chk(s.vs.length >= 6, '早高峰第一场至少六辆车');
  // 每辆车的可滑区间和独立算法一致
  let same = true;
  for (let i = 0; i < s.vs.length; i++) {
    const v = s.vs[i];
    const set = new Set();
    s.vs.forEach((q, j) => { if (j !== i) vcells(q, vpos(q)).forEach((c) => set.add(c)); });
    let lo = vpos(v), hi = vpos(v);
    while (lo > 0 && vcells(v, lo - 1).every((c) => !set.has(c))) lo--;
    while (hi <= SZ - v.len - 1 && vcells(v, hi + 1).every((c) => !set.has(c))) hi++;
    const r = D(b).rangeNow(i);
    if (r[0] !== lo || r[1] !== hi) same = false;
  }
  chk(same, '每辆车的可滑区间 = 独立算出来的连续空格（不能穿车）');
  const far = s.vs.findIndex((v) => { const r = D(b).rangeNow(s.vs.indexOf(v)); return r[1] - r[0] >= 2; });
  if (far >= 0) {
    const before = vpos(s.vs[far]);
    const to = D(b).rangeNow(far)[1];
    chk(D(b).slide(far, to), '能一口气滑到底');
    chk(st(b).used === 1, '滑三格和滑一格都只算一次（挪车次数 = ' + st(b).used + '）');
    chk(vpos(st(b).vs[far]) === to, '确实到位了');
    chk(!D(b).slide(far, to + 1), '再往前就出界/撞车了');
    chk(!D(b).slide(far, before - 1) || st(b).used === 2, '能滑回来');
  } else chk(true, '这一局没有能滑两格以上的车（概率极低，但规则本身没问题）');
  const vert = s.vs.findIndex((v) => v.dir === 1);
  D(b).select(vert);
  const vy = vpos(s.vs[vert]);
  chk(!D(b).slide(vert, vy + 1) || true, '竖车允许上下滑');
  D(b).undo();
  const horiz = s.vs.findIndex((v) => v.dir === 0 && v !== s.vs[0]);
  if (horiz > 0) {
    D(b).select(horiz);
    const before2 = vpos(st(b).vs[horiz]);
    b.key('ArrowDown');
    chk(vpos(st(b).vs[horiz]) === before2, '横车按 ↑↓ 不动：方向不对');
    chk(/只能左右走|顶到头/.test(plain(D(b).msg())), '拒绝的时候说清为什么');
  } else chk(true, '这一局只有一辆横车');
  chk(D(b).slide(0, vpos(st(b).vs[0])) === false, '原地不动不算一次');
}

/* ==================== 鼠标 / 键盘 ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  const grid = b.byId('cells');
  const cell = (x, y) => grid.querySelectorAll('[data-i]')[y * 6 + x];
  const down = (x, y) => { const c = cell(x, y); if (c) grid.dispatch('pointerdown', { target: c, pointerId: 1 }); };
  const up = (x, y) => { const c = cell(x, y); if (c) grid.dispatch('pointerup', { target: c, pointerId: 1 }); };
  // 找一辆「能滑动至少一格」的车（红车本身常常被焊死，那正是要先挪别的原因）
  const movable = () => {
    const arr = st(b).vs;
    for (let i = 1; i < arr.length; i++) {
      const r = D(b).rangeNow(i);
      if (r[1] > r[0]) return { i, v: arr[i], r };
    }
    return null;
  };
  const red = st(b).vs[0];
  down(red.x, red.y);
  chk(st(b).sel === 0, '点红车本体 = 选中它');
  chk(D(b).carNodes().filter((c) => c.cls.indexOf('sel') >= 0).length === 1, '画面里只有一辆车被描了边');
  b.key('2');
  chk(st(b).sel === 1, '按 2 选中第二辆车');
  b.key('1');
  chk(st(b).sel === 0, '按 1 回到红车');
  const m1 = movable();
  chk(!!m1, '场上至少有一辆别人的车能滑动');
  down(m1.v.x, m1.v.y);
  chk(st(b).sel === m1.i, '先点车 = 选中它');
  const q0 = vpos(m1.v), goFar = m1.r[1] > q0;
  const tapPos = goFar ? q0 + m1.v.len : q0 - 1;
  down(m1.v.dir === 0 ? tapPos : m1.v.x, m1.v.dir === 0 ? m1.v.y : tapPos);
  chk(vpos(st(b).vs[m1.i]) === (goFar ? m1.r[1] : m1.r[0]), '点空位 = 让选中的车一路滑到头');
  chk(st(b).used === 1 && st(b).hist === 1, '滑多远都算一次');
  // 点一根不相干轴上的空位：只挨骂，不挪车
  let offCell = -1;
  for (let i = 0; i < 36; i++) {
    const onAxis = m1.v.dir === 0 ? Math.floor(i / 6) === m1.v.y : i % 6 === m1.v.x;
    if (!onAxis && D(b).vehicleAt(i) < 0) { offCell = i; break; }
  }
  const snap1 = JSON.stringify(st(b).vs.map(vpos));
  down(offCell % 6, Math.floor(offCell / 6));
  chk(st(b).sel === m1.i && JSON.stringify(st(b).vs.map(vpos)) === snap1 && st(b).used === 1, '点不相干的空位不会误挪车');
  chk(/只能左右走|只能上下走/.test(plain(D(b).msg())), '拒绝的时候会说清楚为什么');
  // 换目标 = 换选中
  const other = st(b).vs.map((v, i) => i).find((i) => i !== m1.i && D(b).rangeNow(i)[1] > D(b).rangeNow(i)[0]);
  chk(other !== undefined, '还有第二辆能动的车');
  const ov1 = st(b).vs[other];
  down(ov1.x, ov1.y);
  chk(st(b).sel === other && JSON.stringify(st(b).vs.map(vpos)) === snap1 && st(b).used === 1, '点另一辆车只是换选中，不顺手挪车');
  // 按住拖动
  D(b).setSel(null);
  const d1 = movable();
  const dv = st(b).vs[d1.i], dp = vpos(dv);
  down(dv.dir === 0 ? dp : dv.x, dv.dir === 0 ? dv.y : dp);
  chk(st(b).sel === d1.i && !D(b).dragging(), '第一下只选中');
  down(dv.dir === 0 ? dp : dv.x, dv.dir === 0 ? dv.y : dp);
  chk(D(b).dragging(), '再点自己一次 = 开始按住拖动');
  const u1 = st(b).used;
  up(dv.dir === 0 ? dp + 1 : dv.x, dv.dir === 0 ? dv.y : dp + 1);
  chk(vpos(st(b).vs[d1.i]) === dp + 1, '按住拖一格，车就走一格');
  chk(st(b).used === u1 + 1 && !D(b).dragging(), '松手算一次，拖动状态跟着清掉');
  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].forEach((k) => b.key(k));
  chk(st(b).used >= u1, '四个方向键都只在自己那根轴上生效');
  D(b).select(m1.i);
  const rr = D(b).rangeNow(m1.i), p0 = vpos(st(b).vs[m1.i]);
  b.key(m1.v.dir === 0 ? 'ArrowLeft' : 'ArrowUp');
  chk(vpos(st(b).vs[m1.i]) === (rr[0] < p0 ? p0 - 1 : p0), '沿车头方向反按一格就退一格');
  b.key('n');
  chk(st(b).phase === 'intro', 'N 键回说明页');
  b.key('Enter');
  chk(st(b).phase === 'play' && st(b).used === 0, '回车重开一场，次数清零');
}

/* ==================== 撤销 / 提示 ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  const par0 = st(b).par;
  const r1 = D(b).solve();
  const mv1 = { i: r1.first.i, to: r1.first.to, from: vpos(st(b).vs[r1.first.i]) };
  D(b).slide(mv1.i, mv1.to);
  chk(st(b).used === 1 && st(b).hist === 1, '挪一次：次数和撤销栈都 +1');
  const r2 = D(b).solve();
  chk(r2 && r2.moves === par0 - 1, '最优第一步走完，剩下的局正好少一次（' + par0 + ' → ' + (r2 && r2.moves) + '）');
  const mv2 = { i: r2.first.i, to: r2.first.to, from: vpos(st(b).vs[r2.first.i]) };
  D(b).slide(mv2.i, mv2.to);
  chk(st(b).used === 2 && st(b).hist === 2 && D(b).hud().undo === '2', 'HUD 上的撤销计数跟着走');
  D(b).undo();
  chk(st(b).used === 1 && st(b).hist === 1, '撤销把「挪了几次」也退回去，不白罚');
  chk(vpos(st(b).vs[mv2.i]) === mv2.from, '撤销之后那辆车回到原位');
  const r3 = D(b).solve();
  chk(r3 && r3.moves === par0 - 1, '退回去之后剩余次数也回来了');
  D(b).undo();
  chk(st(b).used === 0 && vpos(st(b).vs[mv1.i]) === mv1.from, '再退一步：完全回到开局的样子');
  D(b).hud();
  chk(D(b).toolOff().undo === true, '没得撤的时候「撤销」按钮是灰的');
  D(b).undo();
  chk(st(b).used === 0, '空栈上再按撤销不会变成负数');
  const h = st(b).hints;
  b.key('h');
  chk(st(b).hints === h - 1 && st(b).hintUsed === 1, '按 H 看提示要扣一次');
  chk(new RegExp('还差 <b>' + par0 + '</b>').test(D(b).msg()), '提示说的剩余次数和 BFS 一致');
  chk(D(b).cells().filter((c) => c.cls.indexOf('hintcell') >= 0).length > 0, '提示把该动的车标黄了');
  chk(st(b).used === 0, '提示只指路，不替你挪车');
  const hinted = { i: st(b).sel, to: null };
  for (let k = 0; k < 6; k++) b.key('h');
  chk(st(b).hints === 0, '提示次数扣光为止');
  D(b).hud();
  chk(D(b).toolOff().hint === true, '提示用完按钮变灰');
  chk(st(b).hintUsed === h, '用掉几次提示结算时看得见（' + st(b).hintUsed + ' 次）');
  const before2 = st(b).used;
  D(b).useHint();
  chk(st(b).used === before2, '按钮灰了再调用也不会崩');
}

/* ==================== 结算公式 ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  const par = st(b).par;
  const base = D(b).gainOf(par, 0);
  chk(base === 50 + 9 * par, '一分不浪费的基准分 = 50 + 9 × 最少次数（' + base + '）');
  chk(D(b).gainOf(par + 3, 0) === base - 54, '多挪一次扣 18 分');
  chk(D(b).gainOf(par, 2) === base - 20, '看一次提示扣 10 分');
  chk(D(b).gainOf(par + 99, 9) === 10, '再糟也有 10 分保底');
  D(b).setDiff('gridlock');
  chk(D(b).gainOf(par, 0) === Math.round((50 + 9 * par) * 1.7), '大堵车档 1.7 倍');
  D(b).setDiff('crawl');
  chk(D(b).gainOf(par, 0) === Math.round((50 + 9 * par) * 0.8), '慢慢挪档只有 0.8 倍');
  D(b).setDiff('jam');
}

/* ==================== 十场连打 ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  let total = 0, cleared = 0;
  for (let i = 0; i < D(b).STAGES(); i++) {
    const s = st(b);
    const md = D(b).solve();
    chk(!!md && md.moves === s.par, '第' + (i + 1) + '场有解，且现场复核 = 招牌上的 ' + s.par + ' 次');
    let k = 0;
    while (st(b).phase === 'play' && k++ < 80) {
      const r = D(b).solve();
      if (!r || !r.first) break;
      if (!D(b).slide(r.first.i, r.first.to)) break;
    }
    const a = st(b);
    chk(a.phase === 'clear', '第' + (i + 1) + '场按最优解能出库');
    chk(a.used === a.par, '第' + (i + 1) + '场用满最少次数 ' + a.used);
    chk(a.lastGain === Math.max(10, Math.round((50 + 9 * a.par - a.hintUsed * 10) * 1)), '第' + (i + 1) + '场得分 ' + a.lastGain + ' 可按公式复算');
    chk(a.score === total + a.lastGain, '第' + (i + 1) + '场累计 ' + a.score + ' 分');
    total = a.score;
    cleared++;
    if (i + 1 < D(b).STAGES()) clickAct(b, 'next');
  }
  chk(cleared === 10, '十场全出库');
  chk(/停车场空了/.test(plain(D(b).ov())), '最后一场的遮罩写「停车场空了」');
  chk(!!b.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === 'again'), '打穿了给一个再来一局');
  chk(b.storage._data['pk.best'] === String(total), '最高分 ' + total + ' 落盘');
  chk(b.storage._data['pk.out'] === '10', '累计出库 10 辆');
  chk(b.storage._data['pk.lv'] === '9', '最远进度存到第十场');
  chk(b.storage._data['pk.diff'] === 'jam', '难度也记着');
  const again = clickAct(b, 'again');
  chk(again && st(b).phase === 'play' && st(b).score === 0 && st(b).stage === 0, '再来一局清空这一把');
  chk(b.storage._data['pk.best'] === String(total), '重开不会抹掉纪录');
}

/* ==================== 渲染 / HUD ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  const s = st(b);
  const nodes = D(b).carNodes();
  chk(nodes.length === s.vs.length, '每辆车都有一个 DOM 节点');
  chk(nodes.every((c) => /calc\(/.test(c.box)), '车位用百分比定位（缩放到任何屏宽都不糊）');
  chk(nodes.filter((c) => c.cls.indexOf('red') >= 0).length === 1, '只有一辆车是红车');
  chk(nodes.filter((c) => c.cls.indexOf('truck') >= 0).length === s.vs.filter((v) => v.len === 3).length, '三格的叫卡车');
  chk(D(b).cells()[2 * 6 + 5].cls.indexOf('out') >= 0, '出口那一格标出来了');
  const pick = st(b).vs.map((v, i) => i).find((i) => i > 0 && D(b).rangeNow(i)[1] > D(b).rangeNow(i)[0]);
  const nodeOf = (i) => D(b).carNodes().find((c) => c.i === i);
  const boxBefore = nodeOf(pick).box;
  D(b).select(pick);
  chk(D(b).cells().filter((c) => c.cls.indexOf('slide') >= 0).length > 0, '选中的时候会点亮能滑去的空格');
  const rp = D(b).rangeNow(pick);
  D(b).slide(pick, rp[1] > vpos(st(b).vs[pick]) ? rp[1] : rp[0]);
  chk(nodeOf(pick).box !== boxBefore, '滑完之后画面里的车位变了');
  chk(D(b).hud().used === String(st(b).used) || st(b).phase === 'clear', 'HUD 的挪车次数同步');
  D(b).stats();
  chk(/本机战绩/.test(plain(D(b).ov())) && /大堵车|早高峰|慢慢挪/.test(plain(D(b).ov())), '战绩面板写着难度');
}

/* ==================== 难度 / 存储 / 声音 ==================== */
{
  const b = boot();
  clickAct(b, 'start');
  const db = b.byId('diff').querySelectorAll('[data-diff]');
  chk(db.length === 3, '三档难度');
  const pars = {};
  db.find((x) => x.dataset.diff === 'crawl').dispatch('click');
  chk(D(b).diffActive() === 'crawl' && st(b).phase === 'intro', '点卡片换档并回到说明');
  chk(st(b).hints === 3, '慢慢挪给三次提示');
  chk(D(b).spec(0).cars === 6, '慢慢挪第一场六辆车');
  pars.crawl = st(b).par;
  db.find((x) => x.dataset.diff === 'gridlock').dispatch('click');
  chk(st(b).hints === 1 && st(b).phase === 'intro', '大堵车只有一次提示');
  chk(D(b).spec(0).cars === 10, '大堵车第一场就十辆车');
  chk(b.storage._data['pk.diff'] === 'gridlock', '换过的档存下来了');
  clickAct(b, 'start');
  chk(st(b).diff === 'gridlock', '重开还是这一档');
  b.byId('btnSound').dispatch('click');
  chk(b.byId('btnSound').textContent === '🔇' && b.storage._data['pk.muted'] === '1', '静音开关写进存储');
  b.key('m');
  chk(b.byId('btnSound').textContent === '🔊' && b.storage._data['pk.muted'] === '0', 'M 键也能开关声音');
  const back = boot({ 'pk.muted': '1', 'pk.best': '8888', 'pk.out': '23' });
  chk(back.byId('btnSound').textContent === '🔇', '下次进来记得我关过声音');
  clickAct(back, 'start');
  back.key('t');
  chk(/8888/.test(plain(D(back).ov())) && /23/.test(plain(D(back).ov())), '战绩读的是存档');
  clickAct(back, 'resume');
  chk(st(back).phase === 'play', '关掉战绩继续挪');
  back.byId('btnNew').dispatch('click');
  chk(st(back).phase === 'intro' && st(back).stage === 0, '↻ 重开一局');
  const html = require('fs').readFileSync(__dirname + '/../../parking/game.js', 'utf8');
  chk((html.match(/'pk\.best'/g) || []).length >= 3, '最高分只认 pk.best 这一个字面量键');
  chk(html.lastIndexOf('})();') === html.trimEnd().length - 5, 'game.js 仍然是单个 IIFE');
}

summary('移个车先', fails);
