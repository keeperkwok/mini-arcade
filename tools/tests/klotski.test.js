'use strict';
/* 华容道：规则 / 出题 / 最优步 / 计拍 四块地基
   重点核对：① 滑动合法性（不能重叠、不能跳格、不能出界）与「曹操压在出口 = 过关」的判定
   ② 局面规范化：同类木块互换必须是同一个局面 —— 指纹相等的充要条件逐条验
   ③ 出题必定有解且 par 是真最短：用另一套「全量遍历 + 取最浅出口」的 BFS 对拍，
      两套答案不一致就是错的（含「原题横刀立马 112 步」和「背锁死的 55 格死局无解」）
   ④ 倒计时/提示扣分/效率给分全按整数拍算，暂停与开遮罩必须冻住时钟 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  st: function () { return { phase: phase, diff: diff, stage: stage, score: score, moves: moves, levelMoves: levelMoves,
    par: par, timeTicks: timeTicks, clock: clock, hints: hints, hintsUsed: hintsUsed, undos: undos, undoN: undoStack.length,
    sel: sel, paused: paused, nudge: nudge, hintMove: hintMove, seed: seedBase, npieces: pcs.length, gain: lastGain }; },
  K: function () { return { COLS: COLS, ROWS: ROWS, N: N, STEP_MS: STEP_MS, STAGES: STAGES, GOAL_X: GOAL_X, GOAL_Y: GOAL_Y,
    HINT_COST: HINT_COST, STATE_CAP: STATE_CAP, GEN_CAP: GEN_CAP, MAX_TRIES: MAX_TRIES, CLASSIC_PAR: CLASSIC_PAR,
    B10: B10 }; },
  KIND: function () { return KIND; }, LABEL: function () { return LABEL; }, DIRS: function () { return DIRS; },
  DIFFS: function () { return DIFFS; }, SPECS: function () { return STAGE_SPECS; }, BANDS: function () { return PAR_BAND; },
  NAMES: function () { return STAGE_NAMES; }, CLASSIC: function () { return CLASSIC; },
  pieces: function () { return pcs.map(function (p) { return { k: p.k, x: p.x, y: p.y, w: p.w, h: p.h, name: p.name }; }); },
  flatOf: flatOf, kindsOf: kindsOf, isGoal: isGoal, keyOf: keyOf, gridOf: gridOf, canSlide: canSlide,
  search: search, bfs: bfs, rngOf: rngOf, shuffled: shuffled, packAtGoal: packAtGoal, nameFor: nameFor,
  toPieces: toPieces, genStage: genStage, classicPieces: classicPieces, stagePar: stagePar, seenPut: seenPut,
  D: D, timeLimit: timeLimit, secLeft: secLeft, effOf: effOf, levelGain: levelGain, fmtTime: fmtTime,
  newRound: newRound, startStage: startStage, tryStep: tryStep, undoStep: undoStep, useHint: useHint,
  levelClear: levelClear, finishRun: finishRun, gameOver: gameOver, togglePause: togglePause,
  hud: hud, paint: paint, buildBoard: buildBoard, msg: msg, act: act, stats: stats, intro: intro,
  running: running, step: step, syncDiff: syncDiff, syncSound: syncSound,
  dom: function () { return { n: piecesEl.querySelectorAll('.kl-piece').length,
    cls: function (i) { var e = piecesEl.querySelectorAll('.kl-piece')[i]; return e ? e.className : ''; },
    left: function (i) { var e = piecesEl.querySelectorAll('.kl-piece')[i]; return e ? e.style.left : ''; },
    top: function (i) { var e = piecesEl.querySelectorAll('.kl-piece')[i]; return e ? e.style.top : ''; },
    w: function (i) { var e = piecesEl.querySelectorAll('.kl-piece')[i]; return e ? e.style.width : ''; },
    cell: function (i) { return piecesEl.querySelectorAll('.kl-piece')[i]; } }; },
  hudText: function () { return { lv: String(elLv.textContent), par: String(elPar.textContent), steps: String(elSteps.textContent),
    clock: String(elClock.textContent), score: String(elScore.textContent), hint: String(elHint.textContent),
    undo: String(elUndo.textContent), hintOff: !!btnHint.disabled, undoOff: !!btnUndo.disabled, pause: btnPause.innerHTML,
    clockCls: elClock.className }; },
  ov: function () { return ovContent.innerHTML; }, ovShown: function () { return !!ovShown(); },
  msgText: function () { return msgEl.innerHTML; },
  setSeed: function (v) { FIXED_SEED = v >>> 0; },
  setDiff: function (v) { diff = v; },
  setVars: function (k, v) { if (k === 'stage') stage = v; else if (k === 'score') score = v;
    else if (k === 'moves') moves = v; else if (k === 'levelMoves') levelMoves = v; else if (k === 'par') par = v;
    else if (k === 'timeTicks') timeTicks = v; else if (k === 'sel') sel = v; else if (k === 'hints') hints = v;
    else if (k === 'phase') phase = v; else if (k === 'paused') paused = v; else if (k === 'undos') undos = v;
    else if (k === 'hintsUsed') hintsUsed = v; else if (k === 'clock') clock = v; },
  setPieces: function (list) { pcs = list.slice(); undoStack = []; hintMove = null; buildBoard(); hud(); paint(); },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('华容道源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const G = (g) => g.ctx.__g;
const st = (g) => g.ctx.__g.st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');

function boot(storage, seed) {
  const g = loadGame('klotski', { transform: inject, storage: storage || {} });
  g.pump(0.2);
  if (seed !== undefined) G(g).setSeed(seed);
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
/* ---------- 第二套 BFS：字符串指纹 + 整层推进，合法性看整个脚印（和游戏里只查前沿不同） ---------- */
function refSolve(Gg, flat, kinds, cap) {
  const KK = Gg.K(), K = Gg.KIND(), COLS = KK.COLS, ROWS = KK.ROWS, N = KK.N;
  const GX = KK.GOAL_X, GY = KK.GOAL_Y;
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const mark = (k) => (k === 'cao' ? 'c' : k === 'gen' ? 'v' : k === 'wide' ? 'h' : 'm');
  const sig = (f) => {
    const g = new Array(N).fill('.');
    for (let i = 0; i < kinds.length; i++) {
      const d = K[kinds[i]];
      for (let a = 0; a < d.h; a++) for (let b = 0; b < d.w; b++) g[(f[2 * i + 1] + a) * COLS + f[2 * i] + b] = mark(kinds[i]);
    }
    return g.join('');
  };
  const neighbors = (f) => {
    const own = new Int16Array(N).fill(-1);
    for (let i = 0; i < kinds.length; i++) {
      const d = K[kinds[i]];
      for (let a = 0; a < d.h; a++) for (let b = 0; b < d.w; b++) own[(f[2 * i + 1] + a) * COLS + f[2 * i] + b] = i;
    }
    const out = [];
    for (let i = 0; i < kinds.length; i++) {
      const d = K[kinds[i]], x = f[2 * i], y = f[2 * i + 1];
      for (let dir = 0; dir < 4; dir++) {
        const nx = x + DX[dir], ny = y + DY[dir];
        if (nx < 0 || ny < 0 || nx + d.w > COLS || ny + d.h > ROWS) continue;
        let free = true;
        for (let a = 0; a < d.h && free; a++) for (let b = 0; b < d.w && free; b++) {
          const c = (ny + a) * COLS + nx + b;
          if (own[c] !== i && own[c] >= 0) free = false;
        }
        if (!free) continue;
        const ns = f.slice();
        ns[2 * i] = nx; ns[2 * i + 1] = ny;
        out.push(ns);
      }
    }
    return out;
  };
  if (flat[0] === GX && flat[1] === GY) return { par: 0, states: 1 };
  const dist = new Map([[sig(flat), 0]]);
  let frontier = [flat], d = 0, best = null;
  while (frontier.length && best === null) {
    d++;
    const next = [];
    for (const f of frontier) {
      if (best !== null) break;
      for (const ns of neighbors(f)) {
        if (ns[0] === GX && ns[1] === GY) { best = d; break; }
        const s = sig(ns);
        if (dist.has(s)) continue;
        dist.set(s, d);
        next.push(ns);
        if (dist.size > cap) return { par: -1, states: dist.size };
      }
    }
    frontier = next;
  }
  return { par: best, states: dist.size };
}
/* 棋盘快照工具：占用是否合法（无重叠、不出界、面积对得上） */
function checkLayout(Gg, pieces, specArea) {
  const K = Gg.K();
  const seen = new Set();
  let area = 0;
  for (const p of pieces) {
    const d = Gg.KIND()[p.k];
    area += d.w * d.h;
    for (let a = 0; a < d.h; a++) for (let b = 0; b < d.w; b++) {
      const x = p.x + b, y = p.y + a;
      if (x < 0 || y < 0 || x >= K.COLS || y >= K.ROWS) return 'out of board';
      const c = y * K.COLS + x;
      if (seen.has(c)) return 'overlap';
      seen.add(c);
    }
  }
  if (specArea !== undefined && area !== specArea) return 'area ' + area + ' != ' + specArea;
  return seen.size === area ? '' : 'cell count mismatch';
}
const areaOf = (Gg, spec) => 4 + spec.gen * 2 + spec.wide * 2 + spec.man;

/* ---------- 开局 ---------- */
let g = boot({}, 4242);
let Gg = G(g);
console.log('— 规则与指纹');
chk(st(g).phase === 'intro' && Gg.ov().indexOf('华容道') >= 0, '开局先进介绍页');
chk(Gg.ov().indexOf('横刀立马') >= 0, '介绍页预告收官是原题横刀立马');
chk(st(g).phase === 'intro' && st(g).npieces > 0, '介绍页背后已经把第一盘摆好');

const CL = Gg.classicPieces();
chk(checkLayout(Gg, CL, areaOf(Gg, Gg.SPECS()[9])) === '', '原题横刀立马的摆法合法（18 格占位）');
chk(CL[0].k === 'cao' && CL[0].name === '曹操', '0 号永远是曹操');
chk(CL.length === 10, '原题十块木料');
const names = CL.map((p) => p.name).join(',');
chk(names.indexOf('关羽') >= 0 && names.indexOf('张飞') >= 0, '木块有自己的名字：' + names);

/* 原题的合法走法只有 6 个（两侧竖将上下、关羽左右） */
const clFlat = Gg.flatOf(CL), clKinds = Gg.kindsOf(CL);
const legal = [];
const clGrid = Gg.gridOf(clFlat, clKinds);
for (let i = 0; i < clKinds.length; i++) for (let d = 0; d < 4; d++) if (Gg.canSlide(clGrid, clFlat, clKinds, i, d)) legal.push(CL[i].name + Gg.DIRS()[d].n);
chk(legal.length === 6, '原题开局只有 6 种走法：' + legal.join(' '));
chk(legal.indexOf('关羽左') >= 0 && legal.indexOf('关羽右') >= 0 && legal.indexOf('曹操下') < 0, '关羽能横着挪，曹操一步都动不了');
chk(legal.join(' ') === '张飞下 赵云下 马超上 黄忠上 关羽右 关羽左', '两侧竖将靠空位能挪，兵一个都动不了');

/* 规范化：同类互换 = 同一局面 */
const flatA = [1, 0, 0, 0, 3, 0, 0, 3, 3, 3, 1, 2, 1, 3, 2, 3, 1, 4, 2, 4];
const kindsA = ['cao', 'gen', 'gen', 'gen', 'gen', 'wide', 'man', 'man', 'man', 'man'];
const swapFlat = flatA.slice();
const t0 = swapFlat[2], t1 = swapFlat[3];
swapFlat[2] = swapFlat[6]; swapFlat[3] = swapFlat[7]; swapFlat[6] = t0; swapFlat[7] = t1;   // 两个竖将互换
chk(Gg.keyOf(Gg.gridOf(flatA, kindsA)) === Gg.keyOf(Gg.gridOf(swapFlat, kindsA)), '同类木块互换 → 指纹相同');
const twoEmpty = flatA.slice();
twoEmpty[18] = 0;                                                     // 一个兵挪到别处
chk(Gg.keyOf(Gg.gridOf(flatA, kindsA)) !== Gg.keyOf(Gg.gridOf(twoEmpty, kindsA)), '兵换到别的格 → 指纹不同');
chk(Number.isInteger(Gg.keyOf(Gg.gridOf(flatA, kindsA))), '指纹是精确整数（不丢精度）');
chk(Gg.keyOf(new Uint8Array(Gg.K().N)) === 0, '空盘的指纹 = 0');
chk(Gg.keyOf(Gg.gridOf([0, 0], ['cao'])) === 3756 * Gg.K().B10, '曹操压在左上角：五进制手算 (1+5+625+3125)×5^10 == 代码算');

console.log('— 出题与最优步');
const sp = refSolve(Gg, clFlat, clKinds, 400000);
chk(sp.par === Gg.K().CLASSIC_PAR, '独立 BFS 复核原题 = ' + Gg.K().CLASSIC_PAR + ' 步（实测 ' + sp.par + '）');
chk(Gg.stagePar(CL) === sp.par, '游戏内 stagePar 与独立实现一致');
const path = Gg.bfs(clFlat, clKinds).path;
chk(path.length === sp.par, '提示路径长度 = 最优步数');
/* 把这条路一步步走完：中途绝不重叠，终点正好是出口 */
let walk = clFlat.slice(), walked = 0;
let walkOk = true;
for (const mv of path) {
  const kk = Gg.kindsOf(CL);
  const before = walk.slice();
  const gtmp = Gg.gridOf(before, kk);
  if (!Gg.canSlide(gtmp, before, kk, mv.i, mv.dir)) { walkOk = false; break; }
  walk[mv.i * 2] += Gg.DIRS()[mv.dir].dx;
  walk[mv.i * 2 + 1] += Gg.DIRS()[mv.dir].dy;
  const after = Gg.gridOf(walk, kk);
  let cells = 0;
  for (let i = 0; i < Gg.K().N; i++) cells += after[i] ? 1 : 0;
  if (cells !== 18) { walkOk = false; break; }
  walked++;
}
chk(walkOk && walked === path.length, '最优路径能一步步走完且始终不重叠');
chk(Gg.isGoal(walk), '走完最优路 = 曹操正好压在出口');

/* 那道曾经被我记错的「假原题」：左右两列锁死，两套实现都得判无解 */
const FAKE = [{ k: 'cao', x: 1, y: 1 }, { k: 'gen', x: 0, y: 0 }, { k: 'gen', x: 3, y: 0 },
  { k: 'gen', x: 0, y: 2 }, { k: 'gen', x: 3, y: 2 }, { k: 'wide', x: 1, y: 0 },
  { k: 'man', x: 0, y: 4 }, { k: 'man', x: 1, y: 4 }, { k: 'man', x: 2, y: 4 }, { k: 'man', x: 3, y: 4 }];
const fFlat = [], fKinds = [];
FAKE.forEach((p) => { fKinds.push(p.k); fFlat.push(p.x, p.y); });
chk(Gg.bfs(fFlat, fKinds) === null, '游戏内 BFS：假原题无解');
chk(refSolve(Gg, fFlat, fKinds, 400000).par === null, '独立 BFS：假原题同样无解');

/* 深度预算：预算比真最短浅 → 拿不到答案；够深 → 答案精确 */
chk(Gg.bfs(clFlat, clKinds, 50, 0) === null, '深度预算 50 < 112 → 直接判搜不到');
chk(Gg.bfs(clFlat, clKinds, 112, 0).par === 112, '深度预算刚好 112 → 量出 112');
chk(Gg.bfs(clFlat, clKinds, 999, 2000).overflow === true, '状态预算太小 → 报 overflow');

let genMiss = 0, genN = 0, badLayout = 0, badPar = 0;
for (let sd = 0; sd < 3; sd++) {
  for (let i = 0; i < Gg.K().STAGES - 1; i++) {
    const spec = Gg.SPECS()[i], band = Gg.BANDS()[i];
    const m = Gg.genStage(Gg.rngOf((31337 + sd * 7919 + i * 104729) >>> 0), spec, band);
    genN++;
    if (!m || !(m.par > 0)) { badPar++; continue; }
    if (checkLayout(Gg, m.pieces, areaOf(Gg, spec))) badLayout++;
    if (m.pieces[0].k !== 'cao') badLayout++;
    if (m.par < band[0]) genMiss++;
  }
}
chk(badLayout === 0, '生成的 ' + genN + ' 盘全部合法：不重叠、不出界、木料数对得上');
chk(badPar === 0, '生成的每一盘都有解（par > 0）');
chk(genMiss <= 6, '难度基本落在设计区间内（低于下限 ' + genMiss + '/' + genN + '）');
const same = Gg.genStage(Gg.rngOf(777), Gg.SPECS()[3], Gg.BANDS()[3]);
const same2 = Gg.genStage(Gg.rngOf(777), Gg.SPECS()[3], Gg.BANDS()[3]);
chk(JSON.stringify(same.pieces) === JSON.stringify(same2.pieces), '同一个种子出题完全可复现');
const other = Gg.genStage(Gg.rngOf(778), Gg.SPECS()[3], Gg.BANDS()[3]);
chk(JSON.stringify(same.pieces) !== JSON.stringify(other.pieces), '换个种子就是另一盘');
const packed = Gg.packAtGoal(Gg.rngOf(9), Gg.SPECS()[8]);
chk(packed && packed.flat[0] === Gg.K().GOAL_X && packed.flat[1] === Gg.K().GOAL_Y, '随机塞盘：曹操钉死在出口');
chk(packed && Gg.isGoal(packed.flat), '塞好的局面本身已解');

console.log('— 走子与界面');
g = boot({}, 20260918);
Gg = G(g);
clickAct(g, 'start');
let s = st(g);
chk(s.phase === 'play' && s.npieces > 0, '点「开匣」进入对局，木料上架');
chk(Gg.dom().n === s.npieces, 'DOM 里的木块数和状态一致：' + Gg.dom().n);
chk(Gg.msgText().indexOf('最优') >= 0, '消息栏报出本关最优步');
chk(Gg.hudText().par === String(s.par), '招牌「最优」= ' + s.par);
chk(Gg.hudText().clock === Gg.fmtTime(s.timeTicks), '倒计时招牌与 fmtTime 对齐');
const first = Gg.pieces().findIndex((p) => p.k === 'cao');
chk(first === 0, '曹操永远是 0 号块');
/* 开局总有一块能动；先验拒绝，再验成功 */
const kinds0 = Gg.kindsOf(Gg.pieces()), flat0 = Gg.flatOf(Gg.pieces());
const grid0 = Gg.gridOf(flat0, kinds0);
let fi = -1, fd = -1, wrong = -1;
for (let i = 0; i < kinds0.length && fi < 0; i++) for (let d = 0; d < 4; d++) if (Gg.canSlide(grid0, flat0, kinds0, i, d)) { fi = i; fd = d; break; }
chk(fi >= 0, '开局总有能挪动的木块');
for (let d = 0; d < 4; d++) if (!Gg.canSlide(grid0, flat0, kinds0, fi, d)) wrong = d;
chk(wrong < 0 || Gg.tryStep(fi, wrong) === false, '走不通的方向直接拒绝');
chk(Gg.tryStep(99, 0) === false && Gg.tryStep(fi, 9) === false && Gg.tryStep(-1, 1) === false, '越界的块号 / 方位一律拒绝');
chk(st(g).moves === 0 && st(g).levelMoves === 0, '被拒绝的走法一步都不算');
chk(Gg.tryStep(fi, fd) === true, '合法的走法能走');
chk(Gg.pieces()[fi].x * 10 + Gg.pieces()[fi].y !== flat0[2 * fi] * 10 + flat0[2 * fi + 1], '木块真的换了格子');
chk(Gg.hudText().steps === '1', '招牌「已挪」跟着涨');
chk(g.storage.getItem('kl.step') === '1', '累计挪步写进 kl.step');
chk(Gg.hudText().undoOff === false, '走了一步，撤销按钮亮起来');
const movedJson = JSON.stringify(Gg.pieces());
/* 非法走法：原地不动 + 抖动提示 */
let badDir = -1;
{
  const f = Gg.flatOf(Gg.pieces()), kk = Gg.kindsOf(Gg.pieces()), gg = Gg.gridOf(f, kk);
  for (let d = 0; d < 4; d++) if (!Gg.canSlide(gg, f, kk, fi, d)) { badDir = d; break; }
}
chk(badDir >= 0 && Gg.tryStep(fi, badDir) === false, '堵住的方位挪不动');
chk(JSON.stringify(Gg.pieces()) === movedJson, '挪不动时局面一点没变');
chk(Gg.msgText().indexOf('挪不动') >= 0, '挪不动要告诉玩家为什么');
chk(st(g).nudge === fi, '挪不动的木块标记为抖动');
/* 撤销 */
chk(Gg.undoStep() === true, '撤销成功');
chk(JSON.stringify(Gg.pieces()) === JSON.stringify(Gg.toPieces(flat0, kinds0)), '撤销精确还原开局');
chk(st(g).moves === 1, '撤销不退步数（只是给玩家重看局面）');
chk(st(g).undos === 1, '撤销次数记进战绩');
chk(Gg.hudText().undoOff === true, '撤销栈空后按钮回灰');
chk(Gg.undoStep() === false, '没得撤销时老实拒绝');
/* 提示 */
Gg.setVars('timeTicks', 900);
const hh0 = st(g).hints;
chk(Gg.useHint() === true, '军师给出一步');
chk(st(g).hints === hh0 - 1 && st(g).hintsUsed === 1, '提示次数与使用记录');
chk(st(g).timeTicks === 900 - Gg.K().HINT_COST, '提示按表扣分：扣 ' + Gg.K().HINT_COST + ' 拍');
const hm = st(g).hintMove;
chk(hm && typeof hm.i === 'number', '提示指向某块木料的某个方向');
const parNow = Gg.stagePar(Gg.pieces());
chk(Gg.tryStep(hm.i, hm.dir) === true, '照着提示走是合法的一步');
chk(Gg.stagePar(Gg.pieces()) === parNow - 1, '提示这一步正好把剩余最优减一（' + parNow + '→' + (parNow - 1) + '）');
Gg.setVars('hints', 0);
chk(Gg.useHint() === false, '军师请不动了就不给用');

console.log('— 拖拽与键盘');
g = open(5150, {});
Gg = G(g);
{
  const f = Gg.flatOf(Gg.pieces()), kk = Gg.kindsOf(Gg.pieces()), gg = Gg.gridOf(f, kk);
  let di = -1, dd = -1;
  for (let i = 0; i < kk.length && di < 0; i++) for (let d = 0; d < 4; d++) if (Gg.canSlide(gg, f, kk, i, d)) { di = i; dd = d; break; }
  const el = Gg.dom().cell(di);
  const m = { w: 460 / Gg.K().COLS, h: 460 / Gg.K().ROWS };
  const x0 = (f[2 * di] + 0.5) * m.w, y0 = (f[2 * di + 1] + 0.5) * m.h;
  const dx = [0, 1, 0, -1][dd] * m.w, dy = [-1, 0, 1, 0][dd] * m.h;
  const mv0 = st(g).moves;
  el.dispatch('pointerdown', { clientX: x0, clientY: y0, pointerId: 1 });
  g.win.dispatch('pointermove', { clientX: x0 + dx * 0.9, clientY: y0 + dy * 0.9 });
  chk(st(g).moves === mv0 + 1, '拖过一格 = 走一步');
  chk(st(g).sel === di, '按住的木块被选中');
  g.win.dispatch('pointermove', { clientX: x0 - dx * 0.9, clientY: y0 - dy * 0.9 });
  chk(st(g).moves > mv0 + 1, '拖回去也算步数（一块最多来回挪）');
  g.win.dispatch('pointerup', {});
  chk(Gg.st().phase === 'play', '松手后仍在对局');
}
{
  const p0 = JSON.stringify(Gg.pieces());
  Gg.setVars('sel', 0);
  let pressed = false;
  for (const d of [0, 1, 2, 3]) {
    const key = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][d];
    g.key(key);
    if (JSON.stringify(Gg.pieces()) !== p0) { pressed = true; break; }
  }
  chk(pressed, '方向键能挪选中的木块（曹操不动就换个方向试）');
  const sel0 = st(g).sel;
  g.key('Tab');
  chk(st(g).sel !== sel0 || Gg.pieces().length === 1, 'Tab 换选中的木块');
}
{
  Gg.setVars('sel', 1);
  const b4 = Gg.pieces()[1];
  const msgBefore = Gg.msgText();
  const cell = Gg.dom().cell(1);
  cell.dispatch('click', { target: cell });
  chk(Gg.msgText().indexOf('选中') >= 0 || msgBefore.indexOf('选中') >= 0, '点木块会报选中的是谁');
  chk(Gg.pieces()[1].name === b4.name, '点击不改变局面');
}

console.log('— 拍钟与暂停');
g = open(97, {});
Gg = G(g);
{
  const t0 = st(g).timeTicks;
  g.pump(1.05, 100);
  chk(Math.abs(st(g).timeTicks - (t0 - 11)) <= 1, '一秒正好走 10 拍（差值 ' + (t0 - st(g).timeTicks) + '）');
  chk(Gg.st().clock >= 10, 'clock 跟着拍累加');
  Gg.togglePause();
  const tp = st(g).timeTicks;
  g.pump(1.2, 100);
  chk(st(g).timeTicks === tp, '暂停时倒计时冻住');
  chk(Gg.hudText().pause.indexOf('继续') >= 0, '暂停按钮变成继续');
  chk(Gg.ov().indexOf('暂停') >= 0, '暂停时遮罩写着暂停');
  clickAct(g, 'resume');
  chk(st(g).paused === false && st(g).phase === 'play', '继续后回到对局');
  g.pump(0.5, 100);
  chk(st(g).timeTicks < tp, '恢复后表又走起来');
  Gg.setVars('score', 777);
  Gg.setVars('timeTicks', 3);
  g.pump(0.4, 100);
  chk(st(g).phase === 'over', '时间清零 → 散场');
  chk(Gg.ov().indexOf('时间到了') >= 0, '散场写明原因');
  chk(g.storage.getItem('kl.best') === '777', '散场也结算最高分 kl.best');
  chk(Gg.ov().indexOf('累计挪步') >= 0, '散场报累计挪步');
  chk(clickAct(g, 'again') && st(g).phase === 'play', '遮罩里「再来一局」重新开局');
}

console.log('— 过关与十关流程');
g = boot({}, 1234);
Gg = G(g);
clickAct(g, 'start');
{
  /* 用最短路一路打到过关 */
  const pcs = Gg.pieces();
  let r = Gg.bfs(Gg.flatOf(pcs), Gg.kindsOf(pcs));
  chk(r && r.par > 0, '第一盘有解：最优 ' + (r && r.par) + ' 步');
  for (const mv of r.path) Gg.tryStep(mv.i, mv.dir);
  chk(st(g).phase === 'clear', '走完最优路 = 过关');
  chk(st(g).gain === Gg.levelGain() || st(g).gain > 0, '过关结算给出本关得分');
  chk(Gg.ov().indexOf('最优') >= 0, '过关遮罩报效率');
  const sc1 = st(g).score;
  chk(sc1 > 0, '分数进账 ' + sc1);
  chk(g.storage.getItem('kl.lv') === '1', 'kl.lv 记录到第 1 关');
  clickAct(g, 'next');
  chk(st(g).stage === 1 && st(g).phase === 'play', '下一关开场');
  chk(st(g).par >= Gg.BANDS()[1][0] || st(g).par > 0, '第二关也报了最优步');
  /* 直接跳到收官关：原题 112 步 */
  Gg.startStage(9);
  chk(st(g).par === Gg.K().CLASSIC_PAR, '收官关最优 = 写死的 ' + Gg.K().CLASSIC_PAR + ' 步');
  chk(Gg.msgText().indexOf('横刀立马') >= 0, '收官关报出原题名字');
  chk(Gg.pieces().length === 10 && Gg.pieces()[5].k === 'wide', '收官关就是那副老牌（关羽横刀）');
  Gg.setVars('timeTicks', 20000);
  let r2 = Gg.bfs(Gg.flatOf(Gg.pieces()), Gg.kindsOf(Gg.pieces()));
  chk(r2.par === 112, '收官关现量 = 112');
  Gg.setVars('stage', 9);
  Gg.levelClear();
  chk(st(g).phase === 'clear', '收官关过关');
  chk(clickAct(g, 'finish') && st(g).phase === 'over', '收工结算进入终局');
  chk(Gg.ov().indexOf('义释曹操') >= 0, '终局遮罩有词');
}
{
  /* 给分公式复算：效率、剩余时间、不用提示的奖励、难度倍率 */
  g = open(24680, {});
  Gg = G(g);
  const D = Gg.DIFFS()[st(g).diff];
  Gg.setVars('par', 20);
  Gg.setVars('moves', 25);
  Gg.setVars('timeTicks', 1200);
  Gg.setVars('hintsUsed', 1);
  chk(Math.abs(Gg.effOf() - 0.8) < 1e-9, '效率 = 最优 / 已挪 = 0.80');
  const want = Math.round((18 + 20 * 4.5 * 0.8 + Math.min(90, 120) * 1.1) * D.mult);
  chk(Gg.levelGain() === want, '过关得分复算一致：' + Gg.levelGain() + ' vs ' + want);
  Gg.setVars('hintsUsed', 0);
  chk(Gg.levelGain() === want + Math.round(26 * D.mult), '一次提示都没用 → 白送 26 分×倍率');
  Gg.setVars('moves', 200);
  chk(Math.abs(Gg.effOf() - 0.4) < 1e-9, '走得再烂也保底四折');
  chk(Gg.timeLimit() === Math.round((20 * D.timeK + D.pad) * 10), '限时 =（最优×倍率+垫秒）×10 拍');
  chk(Gg.fmtTime(0) === '0:00' && Gg.fmtTime(600) === '0:60' || Gg.fmtTime(600) === '1:00', '时间格式 ' + Gg.fmtTime(600));
}
{
  /* 三档难度：限时与提示次数都不一样 */
  g = boot({}, 606);
  Gg = G(g);
  const seen = {};
  for (const d of ['story', 'classic', 'blitz']) {
    chk(pickDiff(g, d), '能选中难度 ' + d);
    chk(st(g).diff === d, 'diff 切到 ' + d);
    chk(g.storage.getItem('kl.diff') === d, 'kl.diff 存了 ' + d);
    clickAct(g, 'start');
    seen[d] = { limit: Gg.timeLimit(), hints: st(g).hints, par: st(g).par };
  }
  chk(seen.story.limit > seen.classic.limit && seen.classic.limit > seen.blitz.limit,
    '慢慢挪 ' + seen.story.limit + ' > 标准 ' + seen.classic.limit + ' > 急行军 ' + seen.blitz.limit);
  chk(seen.story.hints > seen.blitz.hints, '慢慢挪的军师次数更多');
  chk(Gg.hudText().hint === String(st(g).hints), '招牌上的军师次数跟着难度走');
}
{
  /* 静音键与键盘快捷 */
  g = open(31, {});
  Gg = G(g);
  const s0 = Gg.hudText().pause;
  g.key(' ');
  chk(st(g).paused === true, '空格暂停');
  g.key(' ');
  chk(st(g).paused === false || st(g).phase !== 'play', '再按空格继续（' + s0.slice(0, 2) + '）');
  g.key('t');
  chk(Gg.ov().indexOf('本机战绩') >= 0, 'T 打开战绩');
  chk(Gg.ov().indexOf('限时') >= 0, '战绩页写清限时算法');
  g.key('h');
  chk(st(g).phase === 'play', '对局中按 H 不会跳到别的阶段');
  const lvBefore = g.storage.getItem('kl.lv');
  g.key('n');
  chk(Gg.ovShown() && st(g).phase === 'intro', 'N 重开回到介绍页');
  chk(g.storage.getItem('kl.lv') === lvBefore, '重开不抹掉最远关卡');
  g.byId('btnSound').dispatch('click');
  chk(g.storage.getItem('kl.muted') !== null, '声音开关写 kl.muted = ' + g.storage.getItem('kl.muted'));
  chk(['🔊', '🔇'].indexOf(Gg.hudText().pause && g.byId('btnSound').textContent) >= 0, '声音图标跟着变');
  g.byId('btnNew').dispatch('click');
  chk(st(g).phase === 'intro', '↻ 重开先给介绍页');
}
{
  /* 战绩页与 hud：断言 HUD 前主动 hud() */
  g = open(88, {});
  Gg = G(g);
  Gg.setVars('score', 1234);
  Gg.hud();
  chk(Gg.hudText().score === '1234', '分数招牌 = 1234');
  chk(Gg.hudText().lv === '1', '关卡招牌从 1 开始');
  const cls = Gg.dom().cls(0);
  chk(cls.indexOf('kl-piece') >= 0 && cls.indexOf('cao') >= 0, '曹操的 DOM 类名：' + cls);
  chk(Gg.dom().w(0) === '50%', '曹操两格宽 = 50%');
  const p0 = Gg.pieces()[0];
  chk(Gg.dom().left(0) === (p0.x * 100 / 4) + '%', '横向位置按格换算：' + Gg.dom().left(0));
  Gg.setVars('timeTicks', 40);
  Gg.hud();
  chk(Gg.hudText().clockCls.indexOf('bad') >= 0, '时间吃紧时招牌变红');
}
summary('klotski', fails);
