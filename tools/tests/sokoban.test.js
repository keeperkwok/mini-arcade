'use strict';
/* 推箱子：出题器 / 求解器 / 步数预算 三块地基
   重点核对：① 「最优步」是现场 BFS 搜出来的真最短 —— 回放这条路径必须刚好把所有箱子推上地台
   ② 关卡由反向拉箱生成，所以任意 seed 任意关都必须有解，且箱子数与地台数永远相等
   ③ 只能推不能拉：向自己的方向挪箱子必须失败；一堵墙、两个箱子连着推也必须失败
   ④ 步数只增不减：撤销能回退局面，但回退不了走过的步；超预算扣加班额度，扣光收摊
   ⑤ 得分公式能按 par / 步数 / 难度倍率逐条手算，房间大小与箱子数查表可得 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  st: function () { return { phase: phase, diff: diff, stage: stage, score: score, lives: lives, hints: hints,
    moves: moves, undos: undos, pushTotal: pushTotal, par: par, popAt: popAt, live: live, hinted: hinted,
    player: player, boxes: boxes.slice(), histLen: hist.length, seed: seedBase, stars: stars, lastGain: lastGain,
    w: room ? room.w : 0, h: room ? room.h : 0, budget: budget() }; },
  room: function () { return { w: room.w, h: room.h, wall: room.wall.slice(), target: room.target.slice(), free: room.free.slice() }; },
  K: function () { return { STAGES: STAGES, MIN_OFF: MIN_OFF, MIN_PULL: MIN_PULL, BFS_CAP: BFS_CAP, ATTEMPTS: ATTEMPTS, DIRS: DIRS }; },
  DIFFS: function () { return DIFFS; },
  nbr: nbr, walk: walk, replay: replay, solve: solve, asc: asc, skey: skey, sortBs: sortBs, allOn: allOn,
  offCount: offCount, cornerOf: cornerOf, connected: connected, buildRoom: buildRoom, shuffle: shuffle,
  pullList: pullList, doPull: doPull, reach: reach, makeLevel: makeLevel, flatLevel: flatLevel, rngOf: rngOf,
  effOf: effOf, starOf: starOf, levelGain: levelGain, budget: budget,
  move: move, undo: undo, useHint: useHint, resetStage: resetStage, startStage: startStage, newRound: newRound,
  act: act, stats: stats, intro: intro, hud: hud, render: render, msg: msg, gameOver: gameOver, finishRun: finishRun,
  overBudget: overBudget, clearStage: clearStage, tapCell: tapCell, hintWord: hintWord,
  cells: function () { return roomEl.querySelectorAll('.sb-cell').map(function (c) { return { cls: c.className, html: c.innerHTML }; }); },
  hudText: function () { return { lv: elLv.textContent, moves: elMoves.textContent, par: elPar.textContent,
    lives: elLives.textContent, score: elScore.textContent, hint: elHint.textContent, undo: elUndo.textContent,
    hintOff: !!btnHint.disabled, undoOff: !!btnUndo.disabled }; },
  ov: function () { return ovContent.innerHTML; }, ovShown: function () { return !!ovShown(); },
  msgText: function () { return msgEl.innerHTML; },
  roomStyle: function () { return { cols: roomEl.style.gridTemplateColumns, rows: roomEl.style.gridTemplateRows, ar: roomEl.style.aspectRatio }; },
  setSeed: function (v) { FIXED_SEED = v >>> 0; }, setDiff: function (v) { diff = v; },
  setVars: function (k, v) { if (k === 'moves') moves = v; else if (k === 'score') score = v; else if (k === 'lives') lives = v;
    else if (k === 'hints') hints = v; else if (k === 'stage') stage = v; else if (k === 'par') par = v; else if (k === 'hinted') hinted = v; },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('推箱子源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const G = (g) => g.ctx.__g;
const st = (g) => g.ctx.__g.st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');

function boot(storage, seed) {
  const g = loadGame('sokoban', { transform: inject, storage: storage || {} });
  g.pump(0.1);
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
// ASCII 小房间：# 墙 . 地台 $ 箱子 * 箱子上地台 @ 人 + 人站在地台上
function mk(lines) {
  const g = ref;
  const h = lines.length, w = lines[0].length;
  const room = { w: w, h: h, wall: [], target: [], free: [] };
  let p = -1;
  const b = [];
  for (let y = 0; y < h; y++) {
    if (lines[y].length !== w) throw new Error('房间第 ' + y + ' 行宽度不一致');
    for (let x = 0; x < w; x++) {
      const c = lines[y][x];
      const i = y * w + x;
      room.wall.push(c === '#');
      room.target.push(c === '.' || c === '*' || c === '+');
      if (c === '@' || c === '+') p = i;
      if (c === '$' || c === '*') b.push(i);
    }
  }
  for (let i = 0; i < w * h; i++) if (!room.wall[i]) room.free.push(i);
  void g;
  return { room: room, p: p, b: b };
}
let ref = null;
const DIR = { up: 0, right: 1, down: 2, left: 3 };
// 最优机器人：每步都问一次 BFS，走它给的第一步
function solveStep(g) { return G(g).solve(G(g).room(), st(g).player, st(g).boxes, 400000); }
const runStat = { pushes: 0, steps: 0 };
function playOneStage(g, cap) {
  runStat.pushes = 0;
  runStat.steps = 0;
  let n = 0;
  while (st(g).phase === 'play' && n < (cap || 600)) {
    const sol = solveStep(g);
    if (!sol) return 'dead';
    const before = st(g).boxes.join(',');
    G(g).move(sol.path[0]);
    if (st(g).boxes.join(',') !== before) runStat.pushes++;
    runStat.steps++;
    n++;
  }
  return st(g).phase;
}
function playRun(g) {
  let guard = 0;
  while (guard++ < 40) {
    const r = playOneStage(g);
    if (r === 'dead') return 'dead';
    if (st(g).phase === 'clear') {
      const more = st(g).stage + 1 < G(g).K().STAGES;
      if (!more) { G(g).act('finish'); break; }
      G(g).act('next');
    } else break;
  }
  return st(g).phase;
}

/* ==================== 1. 难度表与常量 ==================== */
ref = boot();
const D = G(ref).DIFFS();
const K = G(ref).K();
chk(['stack', 'shift', 'hoard'].every((d) => !!D[d]), '三档难度都在表上');
for (const d of ['stack', 'shift', 'hoard']) {
  const c = D[d];
  chk(c.w > 4 && c.h > 4, d + ' 房间够大 (' + c.w + '×' + c.h + ')');
  chk(c.boxes >= 2 && c.boxes <= 3, d + ' 箱子数在 2~3 之间（保证 BFS 一定跑得完）');
  chk(c.walls >= 0 && c.w > 0 && c.pulls > 0 && c.parMin > 0 && c.wallPer > 0, d + ' 出题参数齐全');
  chk(c.slack > 0 && c.hints > 0 && c.lives > 0 && c.mult > 0, d + ' 玩法参数齐全');
  chk(typeof c.label === 'string' && typeof c.key === 'string' && c.key === d, d + ' 有中文名且 key 对得上');
}
chk(D.stack.mult < D.shift.mult && D.shift.mult < D.hoard.mult, '倍率随难度递增');
chk(D.stack.slack > D.shift.slack && D.shift.slack > D.hoard.slack, '步数富余随难度递减');
chk(D.stack.hints >= D.shift.hints && D.shift.hints >= D.hoard.hints, '提示次数随难度递减');
chk(D.hoard.lives <= D.shift.lives && D.stack.lives === D.shift.lives, '加班额度：爆仓更紧');
chk(K.STAGES === 10 && K.MIN_OFF === 2 && K.MIN_PULL === 2 && K.ATTEMPTS === 14, '关卡数与出题门槛是设计值');
chk(K.BFS_CAP >= 60000, 'BFS 上限给足（' + K.BFS_CAP + '）');
chk(JSON.stringify(K.DIRS) === JSON.stringify([[0, -1], [1, 0], [0, 1], [-1, 0]]), '四方向 = 上右下左');
G(ref).act('start');

/* ==================== 2. 纯几何：邻居 / 走一步 ==================== */
const A = mk(['#####', '#@$.#', '#####']);
const R1 = A.room;
chk(G(ref).nbr(R1, 6, DIR.right) === 7 && G(ref).nbr(R1, 6, DIR.left) === 5, 'nbr 左右邻格算对');
chk(G(ref).nbr(R1, 6, DIR.up) === 1 && G(ref).nbr(R1, 6, DIR.down) === 11, 'nbr 上下邻格算对');
chk(G(ref).nbr(R1, 0, DIR.up) === -1 && G(ref).nbr(R1, 0, DIR.left) === -1, '越界返回 -1');
chk(G(ref).nbr(R1, 6, DIR.down) === 11 && R1.wall[11] === true, '墙格仍然有邻居，由 walk 去拒');
const w1 = G(ref).walk(R1, 6, [7], DIR.right);
chk(!!w1 && w1.p === 7 && w1.b[0] === 8 && w1.pushed === true && w1.at === 8, '向右推箱：人进箱位、箱子进目标格');
const w2 = G(ref).walk(R1, 6, [7], DIR.left);
chk(w2 === null, '左边是墙，推不动');
const w3 = G(ref).walk(R1, 6, [7], DIR.up);
chk(w3 === null, '向上没有箱子可推，人自己也上不了墙');
const B = mk(['######', '#@$  #', '#  . #', '######']);
const R2 = B.room;
chk(G(ref).walk(R2, 7, [8, 9], DIR.right) === null, '两个箱子连着：一次只能推一个');
const wFree = G(ref).walk(R2, 7, [8], DIR.down);
chk(!!wFree && wFree.p === 13 && wFree.pushed === false && wFree.at === -1, '空地上走一步不算推箱');
chk(G(ref).allOn(R1, [8]) === true && G(ref).allOn(R1, [7]) === false, 'allOn 只认箱子在全多地台上');
chk(G(ref).offCount(R2, [8, 9]) === 2 && G(ref).offCount(R1, [8]) === 0, 'offCount 数没归位的箱子');
chk(G(ref).sortBs([9, 3, 5]).join(',') === '3,5,9', 'sortBs 按格号升序');
chk(G(ref).skey(4, [9, 3, 5]) === G(ref).skey(4, [5, 9, 3]), '状态键与箱子顺序无关');
chk(G(ref).skey(4, [3]) !== G(ref).skey(5, [3]), '人站不同格就是不同状态');

/* ==================== 3. 死角与走位 ==================== */
const C = mk(['#####', '#.  #', '#####']);
chk(G(ref).cornerOf(C.room, 6) === true, '墙角：两面相邻的墙 = 死角');
const Dn = mk(['#######', '###.###', '### ###', '### ###', '#######']);
chk(G(ref).cornerOf(Dn.room, 17) === false, '走廊中段（只有左右两墙、上下都通）不算死角');
chk(G(ref).cornerOf(Dn.room, 10) === true, '走廊尽头的凹槽算死角');
const Cp = mk(['######', '#.$@ #', '######']);
chk(G(ref).cornerOf(Cp.room, 7) === true, '贴着上下墙的格子也是死角，箱子进去出不来');
const Rk = mk(['######', '#@$. #', '#    #', '######']);
chk(G(ref).reach(Rk.room, 7, 10, [8]).length === 5, '绕一圈能走到的位置，给出最短走位（5 步）');
chk(G(ref).reach(Rk.room, 7, 7, [8]).length === 0, '原地不动 = 空路径');
const Rk2 = mk(['#####', '#@$.#', '#####']);
chk(G(ref).reach(Rk2.room, 6, 8, [7]) === null, '一箱窄道：箱子挡着就过不去');
const Rk3 = mk(['#####', '#@#.#', '#####']);
chk(G(ref).reach(Rk3.room, 6, 8, []) === null, '墙更过不去');

/* ==================== 4. 求解器：真实最短 ==================== */
const S1 = mk(['#####', '#@$.#', '#####']);
const sol1 = G(ref).solve(S1.room, S1.p, S1.b, 400000);
chk(!!sol1 && sol1.dist === 1 && sol1.first === DIR.right, '一步推箱的最优解 = 1 步向右');
chk(G(ref).allOn(S1.room, G(ref).replay(S1.room, S1.p, S1.b, sol1.path).b), '回放最优路径后箱子真的上了地台');
const S2 = mk(['######', '#@$ .#', '######']);
const sol2 = G(ref).solve(S2.room, S2.p, S2.b, 400000);
chk(!!sol2 && sol2.dist === 2, '两格直道 = 2 步');
const S3 = mk(['#######', '#     #', '# @$  #', '#   . #', '#######']);
const sol3 = G(ref).solve(S3.room, S3.p, S3.b, 400000);
chk(!!sol3 && sol3.dist === 4 && sol3.path.filter((d) => d === DIR.down).length === 1, '先横推一格再绕上去往下推 = 4 步');
chk(G(ref).allOn(S3.room, G(ref).replay(S3.room, S3.p, S3.b, sol3.path).b), '复杂路径回放同样通关');
const S4 = mk(['#####', '#*@ #', '#####']);
const sol4 = G(ref).solve(S4.room, S4.p, S4.b, 400000);
chk(!!sol4 && sol4.dist === 0 && sol4.path.length === 0 && sol4.first === -1, '已经摆好 = 0 步');
const S5 = mk(['######', '#.  $#', '#   @#', '######']);
chk(G(ref).solve(S5.room, S5.p, S5.b, 400000) === null, '箱子在死角且没在地台上 = 无解');
const S7 = mk(['########', '#      #', '# @$$  #', '#  ..  #', '########']);
const sol7 = G(ref).solve(S7.room, S7.p, S7.b, 400000);
chk(!!sol7 && sol7.dist >= 6 && sol7.dist > sol3.dist, '两箱两地的关，最优步明显更长（' + (sol7 && sol7.dist) + '）');
chk(G(ref).solve(S7.room, S7.p, S7.b, 3) === null, '展开数超上限时按「搜不出来」返回 null');
const pre7 = G(ref).replay(S7.room, S7.p, S7.b, sol7.path.slice(0, -1));
chk(!!pre7 && G(ref).allOn(S7.room, pre7.b) === false, '少走一步的中间局面合法但还没通关');

/* ==================== 5. 出题器：拉箱一定回得去 ==================== */
const genSeeds = [];
for (let i = 0; i < 8; i++) genSeeds.push(1000 + i * 613);
let genBad = 0, genShort = 0, genBox = 0, genWalls = 0, pars = [];
for (const d of ['stack', 'shift', 'hoard']) {
  for (const sd of genSeeds) {
    for (let stage = 0; stage < K.STAGES; stage++) {
      const lv = G(ref).makeLevel(G(ref).rngOf((sd + stage * 7919) >>> 0), D[d], stage);
      const room = lv.room;
      if (!lv || !room || !lv.b.length) { genBad++; continue; }
      if (lv.b.length !== D[d].boxes) genBox++;
      if (room.target.filter(Boolean).length !== lv.b.length) genBad++;
      if (lv.par < 3) genShort++;
      if (G(ref).offCount(room, lv.b) < K.MIN_OFF) genBad++;
      const again = G(ref).solve(room, lv.p, lv.b, 400000);
      if (!again || again.dist !== lv.par) genBad++;
      const end = G(ref).replay(room, lv.p, lv.b, lv.path);
      if (!end || !G(ref).allOn(room, end.b)) genBad++;
      if (!G(ref).connected(room)) genBad++;
      let borderBad = false;
      for (let y = 0; y < room.h; y++) {
        for (let x = 0; x < room.w; x++) {
          if ((x === 0 || y === 0 || x === room.w - 1 || y === room.h - 1) && !room.wall[y * room.w + x]) borderBad = true;
        }
      }
      if (borderBad) genBad++;
      if (room.wall.filter(Boolean).length > 2 * room.w + 2 * room.h - 4) genWalls++;
      pars.push(D[d].key + lv.par);
    }
  }
}
chk(genBad === 0, '240 套关卡全部：有解 / 最优步自洽 / 回放能通关 / 房间连通 / 四周是墙');
chk(genBox === 0, '每关箱子数 = 难度表规定（最多 3 个，所以 BFS 稳）');
chk(genShort === 0, '没有「一步就完」的废关（全部 ≥3 步）');
chk(genWalls >= Math.floor(pars.length * 0.9), '绝大多数关卡在室内额外撒了墙（' + genWalls + '/' + pars.length + '）');
const parOf = (k) => pars.filter((x) => x.indexOf(k) === 0).map((x) => +x.slice(k.length)).sort((a, b) => a - b);
const pStack = parOf('stack'), pShift = parOf('shift'), pHoard = parOf('hoard');
const med = (a) => a[a.length >> 1];
chk(med(pStack) < med(pShift) && med(pShift) < med(pHoard),
  '难度中位最优步递增：' + med(pStack) + ' < ' + med(pShift) + ' < ' + med(pHoard));
chk(Math.min.apply(null, pHoard) >= 5, '爆仓最难的一关也要 ' + Math.min.apply(null, pHoard) + ' 步');
const same1 = G(ref).makeLevel(G(ref).rngOf(4242), D.shift, 3);
const same2 = G(ref).makeLevel(G(ref).rngOf(4242), D.shift, 3);
chk(JSON.stringify(same1.b) === JSON.stringify(same2.b) && same1.p === same2.p && same1.par === same2.par,
  '同一个种子出同一关（可复现）');
const diff1 = G(ref).makeLevel(G(ref).rngOf(4243), D.shift, 3);
chk(JSON.stringify(diff1.b) !== JSON.stringify(same1.b) || diff1.p !== same1.p, '换个种子就换一盘货');

/* ==================== 6. buildRoom / shuffle 独立可测 ==================== */
const br = G(ref).buildRoom(G(ref).rngOf(7), 6, 6, 2);
chk(br.w === 6 && br.h === 6 && br.wall.length === 36 && br.free.length + br.wall.filter(Boolean).length === 36,
  'buildRoom 的格子总数守恒');
chk(G(ref).connected(br), '随手撒墙也保证地面连通');
const arr = [1, 2, 3, 4, 5];
chk(G(ref).shuffle(arr.slice(), G(ref).rngOf(9)).length === 5, 'shuffle 不增不减');
chk(G(ref).flatLevel(D.shift).par > 0, '保底关也能算出步数（防生成器抽风的兜底）');

/* ==================== 7. 单关流程：最优通关 ==================== */
const store1 = {};
const g1 = open(20260918, store1);
chk(st(g1).phase === 'play' && st(g1).stage === 0, '点「开始上班」进第一关');
chk(st(g1).boxes.length === D.shift.boxes && st(g1).par >= 3, '开局局面来自出题器');
chk(st(g1).budget === st(g1).par + D.shift.slack, '步数上限 = 最优 + 富余');
chk(st(g1).live === true, '开局一定是活局');
chk(st(g1).lives === D.shift.lives && st(g1).hints === D.shift.hints, '加班额度与提示按难度发放');
chk(G(g1).hudText().par === String(st(g1).par), 'HUD 的最优步与状态一致');
chk(G(g1).hudText().moves === st(g1).moves + '/' + st(g1).budget, 'HUD 步数显示成 走过/上限');
const cellAll = G(g1).cells();
chk(cellAll.length === st(g1).w * st(g1).h, '地面格子数 = 房间格数');
chk(cellAll.filter((c) => /(^| )wall/.test(c.cls)).length === st(g1).w * st(g1).h - G(g1).room().free.length,
  '墙的格子数与房间数据一致');
chk(cellAll.filter((c) => /box|box-on/.test(c.cls)).length === st(g1).boxes.length, '屏幕上的箱子数对得上');
chk(cellAll.filter((c) => /\bman\b/.test(c.cls)).length === 1, '只有一个仓管员');
chk(cellAll[st(g1).player].cls.indexOf('man') >= 0, '仓管员画在它的格子上');
chk(G(g1).roomStyle().cols === 'repeat(' + st(g1).w + ', 1fr)', '网格列数按房间宽度写进样式');
chk(G(g1).roomStyle().ar === st(g1).w + ' / ' + st(g1).h, '房间宽高比跟着格子走');
chk(G(g1).ovShown() === false, '进关后遮罩收起');
chk(plain(G(g1).msgText()).indexOf('最优') >= 0, '开局提示说了最优步');
const before1 = st(g1).moves;
chk(G(g1).move(DIR.up) || G(g1).move(DIR.down) || G(g1).move(DIR.left) || G(g1).move(DIR.right), '四方向总有能走的一步');
chk(st(g1).moves === before1 + 1, '走一步计一步');
chk(G(g1).st().histLen === 1, '走过的步进了历史栈');
G(g1).undo();
chk(st(g1).moves === before1 + 1 && st(g1).undos === 1 && st(g1).histLen === 0, '撤销退回局面，但步数不退');
chk(plain(G(g1).msgText()).indexOf('撤销') >= 0, '撤销有反馈文案');
G(g1).undo();
chk(st(g1).undos === 1, '没有历史时撤销不产生任何效果');
chk(G(g1).move(solveStep(g1).path[0]) === true, '按最优的第一步走，一定走得动');
chk(G(g1).hudText().undo === '1', 'HUD 的历史步数同步');
G(g1).useHint();
chk(st(g1).hints === D.shift.hints - 1 && st(g1).hinted === true, '提示扣一次并打上「用过提示」');
chk(G(g1).cells().some((c) => /hint/.test(c.cls)), '提示把该走的一步点亮');
const hudAfterHint = G(g1).hudText();
chk(hudAfterHint.hint === String(st(g1).hints), 'HUD 提示次数同步');
G(g1).setVars('hints', 0);
const h0 = st(g1).hints;
G(g1).useHint();
chk(st(g1).hints === h0, '提示用完就按不动');
chk(plain(G(g1).msgText()).indexOf('用完') >= 0, '提示用完有说明');
G(g1).resetStage(false);
chk(st(g1).moves > 0 && st(g1).histLen === 0, 'R 重置只回局面，步数照旧（不能靠重置刷分）');
G(g1).resetStage(true);
chk(st(g1).moves === 0 && st(g1).undos === 0 && st(g1).player === st(g1).player, '花额度重来才清步数');

/* ==================== 8. 最优通关：得分与星级 ==================== */
const store2 = {};
const g2 = open(20260918, store2);
const s2a = st(g2);
chk(s2a.phase === 'play' && s2a.stage === 0, '另一局也从第 1 关开始');
const end8 = playOneStage(g2);
chk(end8 === 'clear', '最优机器人能把第 1 关推完');
const s2b = st(g2);
const db2 = g2.storage._data;
chk(s2b.moves === s2b.par && runStat.steps === s2b.par, '最优打法的步数恰好等于最优步（' + s2b.moves + '）');
chk(s2b.pushTotal === runStat.pushes && s2b.pushTotal >= 1, '推箱计数只数真正推动的那些步（' + s2b.pushTotal + '/' + runStat.steps + ' 步）');
chk(s2b.pushTotal < s2b.moves, '要走位也要推箱：推箱数少于步数');
const wantGain = Math.round((80 + s2b.par * 18) * 1.6 * D.shift.mult);
chk(s2b.lastGain === wantGain, '本关得分按 (80+最优×18)×1.6×倍率 手算 = ' + wantGain);
chk(s2b.score === wantGain, '累计分等于本关得分（第一关）');
chk(s2b.stars === 3, '步数贴满最优 = 三星');
chk(plain(G(g2).ov()).indexOf('★') >= 0, '过关遮罩画出星级');
chk(db2['sb.best'] === String(s2b.score), '过关即时写入最高分');
chk(db2['sb.lv'] === '1', '过关即时写入最远关卡');
chk(Number(db2['sb.push']) === s2b.pushTotal, '累计推箱次数落盘（每推一下就记一次）');
G(g2).act('next');
chk(st(g2).stage === 1 && st(g2).moves === 0, '下一关步数重新起算');
chk(st(g2).score === wantGain, '分数跨关累计');
chk(st(g2).hints === D.shift.hints, '提示每关重新发');
chk(st(g2).lives === D.shift.lives, '加班额度跨关保留');

/* ==================== 9. 分数公式的手算表 ==================== */
const gd = open(4242, {});
const parNow = st(gd).par;
const slack = D.shift.slack;
const half = Math.ceil(slack * 0.4);
chk(G(gd).budget() === parNow + slack, '上限 = 最优 + 富余');
chk(G(gd).effOf(parNow) === 1.6 && G(gd).starOf(parNow) === 3, '步数=最优：×1.6 三星');
chk(G(gd).effOf(parNow + half) === 1.2 && G(gd).starOf(parNow + half) === 2, '多走一半富余：×1.2 两星');
chk(G(gd).effOf(parNow + half + 1) === 0.9, '仍在预算内：×0.9');
chk(G(gd).effOf(parNow + slack) === 0.9 && G(gd).effOf(parNow + slack + 1) === 0.6, '超预算：×0.6');
chk(G(gd).effOf(1) === 1.6, '比最优还快（理论上不可能）也封顶在 ×1.6');
G(gd).setVars('hinted', true);
chk(G(gd).starOf(parNow) === 2 && G(gd).effOf(parNow) === 1.6, '用过提示：倍率不变但星级封顶两星');
G(gd).setVars('hinted', false);
G(gd).setVars('par', 20);
chk(G(gd).levelGain() === Math.round((80 + 20 * 18) * G(gd).effOf(st(gd).moves) * D.shift.mult), 'levelGain 与公式一致');
const gStack = boot({}, 4242);
G(gStack).act('start');
G(gStack).setDiff('stack');
G(gStack).newRound();
G(gStack).setVars('moves', st(gStack).par);
chk(G(gStack).levelGain() === Math.round((80 + st(gStack).par * 18) * 1.6 * D.stack.mult), '小仓库得分公式一致');
chk(D.stack.mult !== D.hoard.mult && D.hoard.mult > D.shift.mult, '倍率三档互不相同且递增');

/* ==================== 10. 死局：推死了要立刻说 ==================== */
function findDead(g, maxDepth) {
  const room = G(g).room();
  const seen = {};
  function dfs(p, bs, path) {
    if (path.length > maxDepth) return null;
    for (const d of [0, 1, 2, 3]) {
      const r = G(g).walk(room, p, bs, d);
      if (!r) continue;
      const k = G(g).skey(r.p, r.b);
      if (seen[k]) continue;
      seen[k] = 1;
      if (!G(g).solve(room, r.p, r.b, 400000)) return path.concat([d]);
      const more = dfs(r.p, r.b, path.concat([d]));
      if (more) return more;
    }
    return null;
  }
  return dfs(st(g).player, st(g).boxes, []);
}
let deadPath = null;
for (const sd of [20260918, 4242, 777, 55100]) {
  const gt = open(sd, {});
  const found = findDead(gt, 6);
  if (found) { deadPath = { seed: sd, path: found }; break; }
}
chk(!!deadPath, '小房间里总能找到把局面推死的一串走法（seed ' + (deadPath && deadPath.seed) + '，' + (deadPath && deadPath.path.length) + ' 步）');
const g3 = open(deadPath.seed, {});
chk(st(g3).live === true, '开局是活局');
const hintsBefore = st(g3).hints;
G(g3).useHint();
chk(st(g3).hints === hintsBefore - 1, '活局下提示正常扣一次');
G(g3).resetStage(false);
chk(st(g3).hints === hintsBefore - 1, '重置本关不退还用掉的提示');
for (const d of deadPath.path) G(g3).move(d);
chk(st(g3).live === false, '推成死角后系统当场判定死局');
chk(plain(G(g3).msgText()).indexOf('推死') >= 0, '死局文案会提示按撤销');
const hNow = st(g3).hints;
G(g3).useHint();
chk(st(g3).hints === hNow && plain(G(g3).msgText()).indexOf('无解') >= 0, '死局里提示不扣次数，只说无解');
const movesDead = st(g3).moves;
G(g3).undo();
chk(st(g3).live === true && st(g3).moves === movesDead, '退一步回到活局，走过的步数一分不退');
G(g3).undo();
chk(st(g3).undos === 2 && st(g3).moves === movesDead, '撤销次数只增不减');
const g4 = open(20260918, {});
G(g4).resetStage(false);
chk(st(g4).moves === 0 && st(g4).histLen === 0, '重置本关清空历史栈');

/* ==================== 11. 步数预算与加班额度 ==================== */
const store5 = {};
const g5 = open(20260918, store5);
const lives0 = st(g5).lives;
G(g5).setVars('moves', G(g5).budget());
G(g5).move(solveStep(g5).path[0]);
chk(st(g5).phase === 'clear' && st(g5).lives === lives0 - 1, '走过上限立刻扣一次加班额度');
chk(plain(G(g5).ov()).indexOf('超时') >= 0, '遮罩说明是超时');
chk(plain(G(g5).ov()).indexOf(String(lives0 - 1)) >= 0, '遮罩告知还剩几次额度');
clickAct(g5, 'retry');
chk(st(g5).phase === 'play' && st(g5).moves === 0, '花额度重来：局面复位且步数重新起算');
chk(st(g5).lives === lives0 - 1, '重来不退还已经扣掉的额度');
G(g5).setVars('moves', G(g5).budget());
G(g5).move(solveStep(g5).path[0]);
chk(st(g5).lives === lives0 - 2 && st(g5).phase === 'clear', '再超时再扣一次（剩 ' + st(g5).lives + '）');
clickAct(g5, 'retry');
G(g5).setVars('moves', G(g5).budget());
G(g5).move(solveStep(g5).path[0]);
chk(st(g5).phase === 'over' && st(g5).lives === 0, '额度扣光 → 整局结束');
chk(plain(G(g5).ov()).indexOf('搬不完') >= 0, '结算遮罩有结束文案');
chk(g5.storage._data['sb.lv'] === '1', '失败也记下最远关卡');
chk(g5.storage._data['sb.best'] === undefined, '一分未得时不写最高分（首页不会多出一条 0 分脏纪录）');
const g6 = open(20260918, {});
G(g6).gameOver('测试用');
chk(st(g6).phase === 'over', 'gameOver 直接收尾');
G(g6).act('again');
chk(st(g6).phase === 'play' && st(g6).stage === 0 && st(g6).score === 0, '再来一局一切归零');
chk(st(g6).lives === D.shift.lives, '新的一局重新发加班额度');

/* ==================== 12. 十关全清 ==================== */
const store7 = {};
const g7 = boot(store7, 999);
G(g7).act('start');
const ph7 = playRun(g7);
const db7 = g7.storage._data;
chk(ph7 === 'over', '最优机器人打满 10 关后收工');
chk(st(g7).stage === 9, '停在第 10 关');
chk(plain(G(g7).ov()).indexOf('结得漂亮') >= 0, '全清遮罩');
chk(Number(db7['sb.lv']) === 10, '最远关卡记到 10');
chk(Number(db7['sb.best']) === st(g7).score && st(g7).score > 2000, '全清分数记进最高分（' + st(g7).score + '）');
chk(Number(db7['sb.push']) >= st(g7).stage, '累计推箱跨关累加（' + db7['sb.push'] + '）');
const scS = (playRun(gStack), st(gStack).score);
chk(st(gStack).phase === 'over' && scS > 0 && scS < st(g7).score, '小仓库同样十关但分数更低（' + scS + ' < ' + st(g7).score + '）');
const oldBest = Number(db7['sb.best']);
const gLow = boot({ sb: '', 'sb.best': '999999' }, 999);
G(gLow).act('start');
G(gLow).gameOver('测试');
chk(gLow.storage._data['sb.best'] === '999999', '分数更低时不会覆盖旧纪录');
void oldBest;

/* ==================== 13. 输入：点格 / 方向盘 / 键盘 ==================== */
const g8 = open(4242, {});
const roomNow = G(g8).room();
const tapDir = solveStep(g8).path[0];
const tapFrom = st(g8).player;
const tapTo = G(g8).nbr(roomNow, tapFrom, tapDir);
let mBase = st(g8).moves;
G(g8).tapCell(tapTo);
chk(st(g8).moves === mBase + 1, '点目标格子 = 朝那个方向走一步');
G(g8).tapCell(st(g8).player);
chk(st(g8).moves === mBase + 1, '点自己脚下不动');
const btnPad = g8.byId('pad').querySelectorAll('[data-mv]');
chk(btnPad.length === 4, '触屏方向盘四个键');
mBase = st(g8).moves;
const needD = solveStep(g8).path[0];
btnPad.find((b) => +b.dataset.mv === needD).dispatch('click');
chk(st(g8).moves === mBase + 1, '点方向盘走一步');
const oscBefore = g8.audio.created.osc;
mBase = st(g8).moves;
['ArrowUp', 'ArrowRight', 'w', 'd'].forEach((k) => g8.win.dispatch('keydown', { key: k }));
chk(st(g8).moves > mBase, '键盘方向键与 WASD 都能走');
chk(g8.audio.created.osc > oscBefore, '走棋与推箱会发声');
mBase = st(g8).moves;
g8.win.dispatch('keydown', { key: 'h' });
chk(st(g8).hints === D.shift.hints - 1, 'H 键用掉一次提示');
g8.win.dispatch('keydown', { key: 'z' });
chk(st(g8).undos === 1 && st(g8).moves === mBase, 'Z 键撤销但步数照旧');
g8.win.dispatch('keydown', { key: 'r' });
chk(st(g8).histLen === 0 && st(g8).moves === mBase, 'R 键重置本关但不退步数');
g8.win.dispatch('keydown', { key: 't' });
chk(plain(G(g8).ov()).indexOf('本机战绩') >= 0, 'T 键开战绩面板');
chk(plain(G(g8).ov()).indexOf('倍率') >= 0, '战绩面板写了规则参数');
clickAct(g8, 'resume');
chk(G(g8).ovShown() === false, '继续按钮收起遮罩');
g8.win.dispatch('keydown', { key: 'n' });
chk(st(g8).phase === 'intro', 'N 键回到开场');
clickAct(g8, 'start');
chk(st(g8).phase === 'play', '开场按钮能再开工');
chk(G(g8).hintWord(0) === '往上走' && G(g8).hintWord(2) === '往下走', '提示文案说清方向');

/* ==================== 14. 静音 / 难度持久化 / 可复现 ==================== */
const g9 = boot({}, 31415);
const db9 = g9.storage._data;
chk(db9['sb.muted'] === undefined && st(g9).diff === 'shift', '默认中班、未静音');
g9.byId('btnSound').dispatch('click');
chk(db9['sb.muted'] === '1' && g9.byId('btnSound').textContent === '🔇', '静音按钮写盘并换图标');
G(g9).act('start');
const oscMute = g9.audio.created.osc;
G(g9).move(solveStep(g9).path[0]);
G(g9).move(solveStep(g9).path[0]);
chk(g9.audio.created.osc === oscMute, '静音后一步都不发声');
g9.byId('btnSound').dispatch('click');
chk(db9['sb.muted'] === '0', '再点一下取消静音');
const osc2 = g9.audio.created.osc;
G(g9).move(solveStep(g9).path[0]);
chk(g9.audio.created.osc > osc2, '取消静音后恢复发声');
g9.win.dispatch('keydown', { key: 'm' });
chk(db9['sb.muted'] === '1' && g9.byId('btnSound').textContent === '🔇', 'M 键也能静音');
chk(pickDiff(g9, 'hoard') && db9['sb.diff'] === 'hoard', '点难度条会落盘 sb.diff');
chk(st(g9).diff === 'hoard' && st(g9).lives === D.hoard.lives && st(g9).stage === 0, '换难度 = 重开一局');
chk(g9.byId('diff').querySelectorAll('[data-diff]').filter((b) => /active/.test(b.className)).length === 1, '难度条只亮一个选中态');
const restored = boot({ 'sb.diff': 'hoard' });
chk(st(restored).diff === 'hoard' && st(restored).lives === D.hoard.lives, '下次打开仍然记得难度选择');
const bogus = boot({ 'sb.diff': 'nonsense' });
chk(st(bogus).diff === 'shift', '认不出的难度回落到中班');
const gA = boot({}, 24680);
const gB = boot({}, 24680);
G(gA).act('start');
G(gB).act('start');
let sameOk = true;
for (let i = 0; i < 3; i++) {
  const a = st(gA), b = st(gB);
  if (a.par !== b.par || a.player !== b.player || a.boxes.join(',') !== b.boxes.join(',')) sameOk = false;
  G(gA).act('next');
  G(gB).act('next');
}
chk(sameOk, '#seed 钉住前三关：同样的种子发同样的仓库');
const gC = boot({}, 24681);
G(gC).act('start');
chk(st(gC).par !== st(gA).par || st(gC).boxes.join(',') !== st(gA).boxes.join(','), '换种子就是另一串关卡');
const cellsNow = G(gA).cells();
chk(cellsNow.length === st(gA).w * st(gA).h && cellsNow[st(gA).player].cls.indexOf('man') >= 0, '换关后重画的格子与状态一致');
chk(G(gA).hudText().lv === String(st(gA).stage + 1), 'HUD 关数同步');
const done = boot({}, 13579);
G(done).act('start');
for (let i = 0; i < 9; i++) G(done).act('next');
chk(st(done).stage === 9 && st(done).phase === 'play', '第 10 关是最后一关');
chk(G(done).hudText().hintOff === false, '第 10 关仍能按提示');
const stuck = boot({ 'sb.best': '5', 'sb.lv': '3', 'sb.push': '7', 'sb.diff': 'stack' }, 24680);
chk(st(stuck).score === 0 && Number(stuck.storage._data['sb.best']) === 5, '读档不会破坏旧纪录');
G(stuck).act('start');
chk(st(stuck).diff === 'stack' && st(stuck).hints === D.stack.hints, '旧档里的难度会被使用');

summary('推箱子', fails);
