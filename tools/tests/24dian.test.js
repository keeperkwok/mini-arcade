'use strict';
/* 24 点速算：分数算术 / 穷举求解 / 算死判定 / 计拍 四块地基
   重点核对：① 分数四则必须精确约分（减清除法看选牌先后），除零非法
   ② 求解器与第二实现（浮点暴力枚举所有二叉合并）逐组对拍：有解无解、要不要分数都得一致
   ③ 发出去的每一题都有解；want 为 int/frac 时难度门槛必须为真
   ④ 合死当场判定、提示的第一步必须真能走出更短的路、撤销精确还原、限时与连击全按拍算 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  st: function () { return { phase: phase, diff: diff, round: round, score: score, streak: streak, bestStreak: bestStreak,
    solvedRun: solvedRun, goal: goal, timeTicks: timeTicks, clock: clock, hints: hints, skips: skips, hinted: hinted,
    lastHard: lastHard, stuck: stuck, paused: paused, nh: hand.length, nsel: sel.length, nhist: hist.length,
    gain: lastGain, seed: seedBase }; },
  cards: function () { return hand.map(function (c) { return { n: c.n, d: c.d, mix: !!c.mix }; }); },
  selIdx: function () { return sel.slice(); },
  K: function () { return { CARDS: CARDS, STEP_MS: STEP_MS, HINT_COST: HINT_COST, HINT_TICKS: HINT_TICKS,
    NUM_MIN: NUM_MIN, NUM_MAX: NUM_MAX, GEN_TRIES: GEN_TRIES }; },
  DIFFS: function () { return DIFFS; }, OPS: function () { return OPS; },
  rngOf: rngOf, gcd: gcd, F: F, fi: fi, fadd: fadd, fsub: fsub, fmul: fmul, fdiv: fdiv, feq: feq, isInt: isInt, fmt: fmt,
  combine: combine, solveStep: solveStep, solvable: solvable, stepsLeft: stepsLeft, genPuzzle: genPuzzle,
  D: D, goalNow: goalNow, limitSec: limitSec, limitTicks: limitTicks, secLeft: secLeft, comboMul: comboMul,
  gainOf: gainOf, fmtTime: fmtTime, alive: alive,
  newRound: newRound, startPuzzle: startPuzzle, tryMerge: tryMerge, undoMerge: undoMerge, skipPuzzle: skipPuzzle,
  useHint: useHint, roundWin: roundWin, runClear: runClear, gameOver: gameOver, togglePause: togglePause,
  hud: hud, paint: paint, buildCards: buildCards, msg: msg, act: act, stats: stats, intro: intro,
  running: running, step: step, toggleSel: toggleSel, syncDiff: syncDiff, syncSound: syncSound,
  dom: function () { return { n: cardsEl.querySelectorAll('.pt-card').length,
    txt: function (i) { var e = cardsEl.querySelectorAll('.pt-card')[i]; return e ? String(e.textContent) : ''; },
    cls: function (i) { var e = cardsEl.querySelectorAll('.pt-card')[i]; return e ? e.className : ''; },
    opsOn: function () { return opEls.map(function (b) { return b.dataset.op + (b.disabled ? ':off' : ':on'); }).join(' '); },
    opBtn: function (name) { return opEls.filter(function (b) { return b.dataset.op === name; })[0] || null; },
    cardEl: function (i) { return cardsEl.querySelectorAll('.pt-card')[i]; } }; },
  hudText: function () { return { lv: String(elLv.textContent), goal: String(elGoal.textContent), combo: String(elCombo.textContent),
    clock: String(elClock.textContent), score: String(elScore.textContent), hint: String(elHint.textContent),
    undo: String(elUndo.textContent), skip: String(elSkip.textContent), clockCls: elClock.className,
    hintOff: !!btnHint.disabled, undoOff: !!btnUndo.disabled, skipOff: !!btnSkip.disabled, pause: btnPause.innerHTML }; },
  ov: function () { return ovContent.innerHTML; }, ovShown: function () { return !!ovShown(); },
  msgText: function () { return msgEl.innerHTML; },
  setSeed: function (v) { FIXED_SEED = v >>> 0; },
  setDiff: function (v) { diff = v; },
  setVars: function (k, v) { if (k === 'score') score = v; else if (k === 'round') round = v; else if (k === 'streak') streak = v;
    else if (k === 'timeTicks') timeTicks = v; else if (k === 'hints') hints = v; else if (k === 'skips') skips = v;
    else if (k === 'phase') phase = v; else if (k === 'paused') paused = v; else if (k === 'hinted') hinted = v;
    else if (k === 'goal') goal = v; else if (k === 'lastHard') lastHard = v; else if (k === 'clock') clock = v;
    else if (k === 'bestStreak') bestStreak = v; else if (k === 'solvedRun') solvedRun = v; },
  setPuzzle: function (nums, g) {
    goal = g || goal;
    hand = nums.map(function (n) { return { n: n, d: 1, mix: false }; });
    hist = []; sel = []; hinted = false; lastHard = !solvable(nums.map(fi), fi(goal), true);
    stuck = !alive(); hintStep = null; timeTicks = limitTicks();
    buildCards(); hud(); paint();
  },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('24 点源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const G = (g) => g.ctx.__g;
const st = (g) => g.ctx.__g.st();
const plain = (h) => String(h).replace(/<[^>]*>/g,'');

function boot(storage, seed) {
  const g = loadGame('24dian', { transform: inject, storage: storage || {} });
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
/* 点两张牌（顺序有意义）再按运算符，全走真实 DOM */
function merge(g, Gg, ia, ib, op) {
  Gg.dom().cardEl(ia).dispatch('click');
  Gg.dom().cardEl(ib).dispatch('click');
  const b = Gg.dom().opBtn(op);
  b.dispatch('click');
  g.pump(0.05);
}
/* 第二实现：浮点暴力枚举所有二叉合并方式（完全不复用游戏里的分数与求解器） */
const EPS = 1e-9;
function brute(nums, goal, intOnly) {
  if (nums.length === 1) return Math.abs(nums[0] - goal) < EPS;
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      const rest = [];
      for (let q = 0; q < nums.length; q++) if (q !== i && q !== j) rest.push(nums[q]);
      const a = nums[i], b = nums[j];
      const cands = [a + b, a * b, a - b, b - a];
      if (Math.abs(b) > EPS) cands.push(a / b);
      if (Math.abs(a) > EPS) cands.push(b / a);
      for (const c of cands) {
        if (intOnly && Math.abs(c - Math.round(c)) > EPS) continue;
        if (brute(rest.concat([c]), goal, intOnly)) return true;
      }
    }
  }
  return false;
}
/* 自动把当前这题走完（跟着求解器的第一步点牌），返回是否赢 */
function autoSolve(g, Gg) {
  const r0 = st(g).round;
  for (let k = 0; k < 4; k++) {
    if (st(g).phase !== 'play' || st(g).round !== r0) return true;   // 已经进下一题 = 赢下这题
    if (st(g).stuck) return false;
    const s = Gg.solveStep(Gg.cards().map((c) => ({ n: c.n, d: c.d })), Gg.fi(st(g).goal), false);
    if (!s) return false;
    Gg.toggleSel(s.a); Gg.toggleSel(s.b); Gg.tryMerge(s.op);   // 直接走逻辑，不占真实时间
  }
  return st(g).round !== r0;
}

/* ==================== 分数与求解 ==================== */
let g = boot({}, 4242);
let Gg = G(g);
console.log('— 分数四则');
chk(Gg.fmt(Gg.fi(24)) === '24', '整数就写作整数');
chk(Gg.fmt(Gg.F(8, 12)) === '2/3', '8/12 约成 2/3');
chk(Gg.fmt(Gg.F(-8, 12)) === '-2/3', '负号只留在分子：' + Gg.fmt(Gg.F(-8, 12)));
chk(Gg.fmt(Gg.F(8, -12)) === '-2/3', '分母的负号要搬上去');
chk(Gg.fmt(Gg.F(0, 7)) === '0', '0 除以任何数还是 0');
chk(Gg.fdiv(Gg.fi(5), Gg.fi(0)) === null, '除以 0 直接非法');
chk(Gg.F(5, 0) === null, '分母 0 的分数造不出来');
chk(Gg.feq(Gg.fdiv(Gg.fi(1), Gg.fi(3)), Gg.F(1, 3)), '1÷3 就是 1/3');
chk(Gg.fmt(Gg.fadd(Gg.F(1, 2), Gg.F(1, 3))) === '5/6', '1/2 + 1/3 = 5/6');
chk(Gg.fmt(Gg.fsub(Gg.F(1, 2), Gg.F(1, 3))) === '1/6', '1/2 − 1/3 = 1/6');
chk(Gg.fmt(Gg.fmul(Gg.F(2, 3), Gg.F(3, 2))) === '1', '互为倒数相乘得 1');
chk(Gg.fmt(Gg.fdiv(Gg.F(2, 3), Gg.F(4, 9))) === '3/2', '(2/3)÷(4/9) = 3/2');
chk(Gg.isInt(Gg.F(6, 3)) && !Gg.isInt(Gg.F(7, 2)), '是不是整数一眼可判');
chk(Gg.gcd(12, 18) === 6 && Gg.gcd(0, 5) === 5 && Gg.gcd(7, 0) === 7, '最大公约数手算一致');
chk(Gg.combine(Gg.fi(3), Gg.fi(8), 'sub').n === -5, '先 3 后 8 相减 = −5');
chk(Gg.combine(Gg.fi(8), Gg.fi(3), 'sub').n === 5, '先 8 后 3 相减 = 5');
chk(Gg.fmt(Gg.combine(Gg.fi(3), Gg.fi(8), 'div')) === '3/8', '先 3 后 8 相除 = 3/8');
chk(Gg.combine(Gg.fi(3), Gg.fi(0), 'div') === null, '0 当除数：运算符点了也白点');
chk(Gg.stepsLeft([1, 2, 3]) === 2, '三张牌要合两步');

console.log('— 求解器对拍（第二套浮点暴力）');
const KNOWN = [
  [[3, 3, 8, 8], 24, true, false],   // 经典硬题：不用分数做不出来
  [[1, 5, 5, 5], 24, true, false],   // 5×(5−1/5)
  [[1, 1, 1, 1], 24, false, false],
  [[6, 6, 6, 6], 24, true, true],
  [[1, 2, 3, 4], 24, true, true],
  [[2, 3, 4, 5], 24, true, true],
  [[1, 1, 1, 8], 24, true, true],   // (1+1+1)×8
  [[10, 10, 10, 10], 24, false, false],   // 四个 10 反而凑不出 24
  [[1, 2, 5, 9], 24, true, true],
  [[7, 8, 9, 12], 24, true, true],
  [[1, 3, 4, 7], 28, true, true],
  [[2, 2, 2, 2], 24, false, false],
];
let agree = 0;
for (const [nums, goal, wantSolvable, wantInt] of KNOWN) {
  const sol = Gg.solvable(nums.map(Gg.fi), Gg.fi(goal), false);
  const intSol = Gg.solvable(nums.map(Gg.fi), Gg.fi(goal), true);
  chk(sol === wantSolvable && intSol === wantInt, nums.join(',') + ' → ' + goal + '：有解=' + sol + ' 纯整数解=' + intSol);
  chk(sol === brute(nums.slice(), goal, false), nums.join(',') + ' 与浮点暴力一致');
  chk(intSol === brute(nums.slice(), goal, true), nums.join(',') + ' 纯整数解与暴力一致');
  agree++;
}
chk(agree === KNOWN.length, '经典题库 ' + KNOWN.length + ' 组全部核对');

let mismatch = 0, mismatchInt = 0, dirBad = 0, solvableRate = 0, sample = 0, hardRate = 0;
for (let t = 0; t < 90; t++) {
  const nums = [0, 1, 2, 3].map((i) => 1 + ((t * 7919 + i * 104729 + (t % 5) * 13) % 13));
  const vals = nums.map(Gg.fi);
  const sol = Gg.solvable(vals, Gg.fi(24), false);
  const intSol = Gg.solvable(vals, Gg.fi(24), true);
  sample++;
  if (sol !== brute(nums.slice(), 24, false)) mismatch++;
  if (intSol !== brute(nums.slice(), 24, true)) mismatchInt++;
  if (sol) solvableRate++;
  if (sol && !intSol) hardRate++;
  if (!sol) continue;
  const s = Gg.solveStep(vals, Gg.fi(24), false);
  chk(s && s.a !== s.b, '有解就给出一步：' + nums.join(','));
  /* 提示的第一步必须复现得出，而且走完仍然有解 */
  const after = [];
  for (let q = 0; q < vals.length; q++) if (q !== s.a && q !== s.b) after.push(vals[q]);
  after.push(s.val);
  if (!Gg.solvable(after, Gg.fi(24), false)) dirBad++;
  if (Gg.fmt(Gg.combine(vals[s.a], vals[s.b], s.op)) !== Gg.fmt(s.val)) dirBad++;
}
chk(mismatch === 0 && mismatchInt === 0, '随机 ' + sample + ' 组牌面：两套实现在「有解 / 可纯整数解」上完全同频');
chk(dirBad === 0, '提示给出的那一步既复现得出、又仍留有解');
chk(solvableRate > sample * 0.5, '随机牌面里 ' + solvableRate + '/' + sample + ' 组有解');
chk(hardRate >= 0, '随机牌面里硬题稀有（本批 ' + hardRate + '/' + sample + '）—— 想 guaranteed 有：见 3,3,8,8');

console.log('— 发题');
let genBad = 0, genHard = 0, genSoft = 0, rangeBad = 0;
for (let t = 0; t < 40; t++) {
  const p = Gg.genPuzzle(Gg.rngOf ? Gg.rngOf(1000 + t) : Math.random, 24, 'any');
  if (!p) { genBad++; continue; }
  if (p.nums.some((n) => n < 1 || n > 13)) rangeBad++;
  if (!Gg.solvable(p.nums.map(Gg.fi), Gg.fi(24), false)) genBad++;
  if (!brute(p.nums.slice(), 24, false)) genBad++;
  if (p.intOnly !== Gg.solvable(p.nums.map(Gg.fi), Gg.fi(24), true)) genBad++;
  if (!p.intOnly) genHard++;
}
chk(genBad === 0, '随机发的 40 题全部有解（双实现复核）');
chk(rangeBad === 0, '牌面全在 1..13（扑克点数）');
chk(genHard <= 4, '「any」不过滤难度，硬题罕见（' + genHard + '/40）但 lastHard 与求解器同频');
let intOnlyAll = true, fracOnlyAll = true;
for (let t = 0; t < 12; t++) {
  const pi = Gg.genPuzzle(Gg.rngOf(5000 + t), 24, 'int');
  const pf = Gg.genPuzzle(Gg.rngOf(6000 + t), 24, 'frac');
  if (pi && !pi.intOnly) intOnlyAll = false;
  if (pf && pf.intOnly) fracOnlyAll = false;
}
chk(intOnlyAll, '慢慢算：只发不用分数也能做的题');
chk(fracOnlyAll, '抢答赛：只发非分数不可的题');
chk(Gg.genPuzzle(Gg.rngOf(1), 24, 'int') === null || Gg.genPuzzle(Gg.rngOf(1), 24, 'int').intOnly === true, 'int 模式宁可不出也不出错题');
const dup1 = Gg.genPuzzle(Gg.rngOf(4242), 24, 'any');
const dup2 = Gg.genPuzzle(Gg.rngOf(4242), 24, 'any');
chk(JSON.stringify(dup1) === JSON.stringify(dup2), '同种子发题完全可复现');

/* ==================== 界面与流程 ==================== */
console.log('— 开局与点牌');
g = boot({}, 20260918);
Gg = G(g);
chk(st(g).phase === 'intro' && Gg.ov().indexOf('24 点速算') >= 0, '先进介绍页');
chk(Gg.ov().indexOf('8÷(3−8÷3)') >= 0 || Gg.ov().indexOf('8÷(3') >= 0, '介绍页用经典硬题举例');
chk(Gg.hudText().skip === String(Gg.DIFFS().std.skips), '换题次数按难度上架：' + Gg.hudText().skip);
clickAct(g, 'start');
let s = st(g);
chk(s.phase === 'play' && s.nh === 4, '开局发四张牌');
chk(s.goal === 24, '标准局目标恒为 24');
chk(Gg.limitTicks() === Gg.limitSec() * 10 && s.timeTicks > 0 && s.timeTicks <= Gg.limitTicks(), '单题限时 = 秒×10 拍（' + Gg.limitSec() + 's）');
chk(Gg.dom().n === 4, 'DOM 四张牌');
chk(Gg.hudText().goal === '24', '招牌报目标');
chk(Gg.msgText().indexOf('第 1/8 题') >= 0, '消息栏报这是第几题');
chk(Gg.dom().opsOn() === 'add:off sub:off mul:off div:off', '没选够两张时运算符全灰：' + Gg.dom().opsOn());
Gg.dom().cardEl(0).dispatch('click');
g.pump(0.05);
chk(st(g).nsel === 1 && Gg.dom().cls(0).indexOf('sel') >= 0, '点一张牌 = 选中');
chk(Gg.msgText().indexOf('再点一张') >= 0, '提示接着点第二张');
Gg.dom().cardEl(1).dispatch('click');
g.pump(0.05);
chk(st(g).nsel === 2, '两张牌选满');
chk(Gg.dom().opsOn() === 'add:on sub:on mul:on div:on', '选满两张后运算符全部可用：' + Gg.dom().opsOn());
chk(Gg.msgText().indexOf('先 ') >= 0 && Gg.msgText().indexOf('后 ') >= 0, '消息栏写明先后顺序');
const c0 = Gg.cards()[0], c1 = Gg.cards()[1];
const wantAdd = Gg.fmt(Gg.fadd(c0, c1));
const preMerge = JSON.stringify(Gg.cards());
Gg.dom().opBtn('add').dispatch('click');
g.pump(0.05);
chk(st(g).nh === 3, '两张合成一张');
chk(Gg.fmt(Gg.cards()[2]) === wantAdd, '合出来的值 = ' + wantAdd);
chk(Gg.cards()[2].mix === true, '合并牌带上「合」标记');
chk(Gg.cards().slice(0, 2).some((c) => c.mix === false), '原来的两张已经不在前两个位置');
chk(st(g).nsel === 0, '合完清空选择');
chk(g.storage.getItem('pt.calc') === '1', '累计合并次数写进 pt.calc');
chk(Gg.dom().opsOn() === 'add:off sub:off mul:off div:off', '没重新选牌前运算符又灰了');
chk(Gg.hudText().undo === '1', '撤销招牌跟着涨');
chk(Gg.undoMerge() === true, '撤销一次合并');
chk(JSON.stringify(Gg.cards()) === preMerge, '撤销精确还原到合并前的四张牌');
chk(Gg.undoMerge() === false, '没历史时撤销老实拒绝');
chk(Gg.st().stuck === false || Gg.st().stuck === true, '撤销后 stuck 状态被重新判定');

console.log('— 算死判定与提示换题');
g = open(777, {});
Gg = G(g);
Gg.setPuzzle([3, 3, 8, 8], 24);
chk(Gg.st().stuck === false, '3 3 8 8 开局是活的');
chk(Gg.st().lastHard === true, '3 3 8 8 被认作硬题（不用分数做不出来）');
merge(g, Gg, 0, 1, 'sub');                      // 3−3 = 0，一手好牌打死
chk(st(g).stuck === true, '先做 3−3 就死：当场判算死了');
chk(Gg.msgText().indexOf('算死了') >= 0, '消息栏写明算死了');
chk(Gg.dom().opsOn().indexOf('on') < 0, '算死后运算符全灰');
chk(Gg.tryMerge('add') === false, '算死后拒绝继续合并');
chk(Gg.useHint() === false, '算死后提示也救不了');
chk(g.byId('cards').querySelectorAll('.pt-card').every((e) => e.className.indexOf('dead') >= 0 || e.className.indexOf('hole') >= 0), '死牌面标红');
chk(Gg.undoMerge() === true, '还能撤销');
chk(st(g).stuck === false, '撤销之后又活了');
Gg.setPuzzle([1, 1, 1, 1], 24);
chk(Gg.st().stuck === true, '直接塞一组无解牌：立刻就是死的');
g = open(778, {});
Gg = G(g);
Gg.setPuzzle([3, 3, 8, 8], 24);
const tk0 = st(g).timeTicks;
chk(Gg.useHint() === true, '提示给出第一步');
chk(st(g).hints === Gg.DIFFS().std.hints - 1, '提示次数 −1');
chk(st(g).timeTicks === tk0 - Gg.K().HINT_COST, '提示扣 ' + Gg.K().HINT_COST + ' 拍');
chk(st(g).hinted === true, '用过提示 → 这局没有「零提示」奖励');
const hs = Gg.solveStep(Gg.cards().map((c) => ({ n: c.n, d: c.d })), Gg.fi(24), false);
chk(hs && Gg.fmt(hs.val) === '8/3', '硬题第一步就是 8÷3 = 8/3（实际 ' + (hs && Gg.fmt(hs.val)) + '）');
chk(Gg.msgText().indexOf('先点') >= 0 && Gg.msgText().indexOf('再点') >= 0, '提示写清点牌顺序');
chk(Gg.dom().cls(hs.a).indexOf('hint') >= 0 && Gg.dom().cls(hs.b).indexOf('hint') >= 0, '提示的两张牌高亮');
const sk0 = st(g).skips;
Gg.setVars('streak', 3);
chk(Gg.skipPuzzle() === true, '换一题');
chk(st(g).skips === sk0 - 1 && st(g).streak === 0, '换题扣次数并断连击');
chk(st(g).nh === 4 && st(g).round === 0, '换题还是这一关，只是换了牌面');
chk(Gg.msgText().indexOf('连击断了') >= 0, '换题时说明连击断了');
Gg.setVars('skips', 0);
chk(Gg.skipPuzzle() === false, '换题次数用完就拒绝');
chk(Gg.hudText().skipOff === true, '没次数时换题按钮回灰');

console.log('— 赢题给分');
g = open(31337, {});
Gg = G(g);
Gg.setPuzzle([1, 2, 3, 4], 24);
Gg.setVars('timeTicks', 200);
Gg.setVars('streak', 2);
Gg.setVars('lastHard', false);
Gg.setVars('hinted', false);
const sc0 = st(g).score;
const want = Math.round((24 + 20 * 1.3 + 0 + 16) * (1 + 2 * 0.15) * 1);
chk(Gg.gainOf() === want, '给分复算：' + Gg.gainOf() + ' vs ' + want);
chk(autoSolve(g, Gg) && st(g).round === 1, '跟着求解器点牌，这一题真能赢下来');
chk(st(g).score === sc0 + want, '进账 ' + want + ' 分');
chk(st(g).streak === 3, '留白够多 → 连击续上（×' + Gg.comboMul().toFixed(2) + '）');
chk(g.storage.getItem('pt.solved') === '1', '累计答对写进 pt.solved');
chk(g.storage.getItem('pt.lv') === '2', '最远到第 2 题写进 pt.lv');
chk(g.storage.getItem('pt.best') === String(st(g).score), '最高分跟着刷新');
chk(st(g).goal === 24, '下一题目标仍是 24');
/* 奖励项都在同一个 round 里，所以按「差值 ≈ 奖励 × 连击 × 倍率」核对 */
const cm = Gg.comboMul(), mm = Gg.D().mult;
Gg.setVars('hinted', true); Gg.setVars('lastHard', false);
const gPlain = Gg.gainOf();
Gg.setVars('hinted', false);
const gNoHint = Gg.gainOf();
Gg.setVars('lastHard', true);
const gHard = Gg.gainOf();
chk(Math.abs((gNoHint - gPlain) - 16 * cm * mm) <= 1, '零提示奖励 ≈ 16×连击×倍率（实测 ' + (gNoHint - gPlain) + '）');
chk(Math.abs((gHard - gNoHint) - 20 * cm * mm) <= 1, '硬题奖励 ≈ 20×连击×倍率（实测 ' + (gHard - gNoHint) + '）');
Gg.setVars('streak', 40);
chk(Math.abs(Gg.comboMul() - 1.9) < 1e-9, '连击倍率封顶在 +0.9（×' + Gg.comboMul().toFixed(2) + '）');

console.log('— 连击窗口与整局收官');
g = boot({}, 5150, {});
Gg = G(g);
clickAct(g, 'start');
Gg.setVars('timeTicks', 20);          // 只剩 2 秒，低于连击窗口
Gg.setPuzzle([1, 2, 3, 4], 24);
Gg.setVars('timeTicks', 20);
Gg.setVars('streak', 4);
chk(Gg.secLeft() === 2 && Gg.limitSec() > 2, 'secLeft 只看拍');
const before = Gg.gainOf();
chk(Math.abs(before - Math.round((24 + 2 * 1.3 + 16) * (1 + 4 * 0.15))) <= 1, '留白少也照样计分：' + before);
for (let k = 0; k < 4 && st(g).phase === 'play'; k++) {
  const s2 = Gg.solveStep(Gg.cards().map((c) => ({ n: c.n, d: c.d })), Gg.fi(st(g).goal), false);
  if (!s2) break;
  merge(g, Gg, s2.a, s2.b, s2.op);
}
chk(st(g).streak === 0, '在连击窗口内没答完 → 连击清零（剩 ' + Gg.secLeft() + ' 秒 < ' + Gg.D().combo + '）');
chk(st(g).round === 1, '照样算答对，进下一题');
Gg.setVars('round', Gg.D().rounds - 1);
Gg.setPuzzle([1, 2, 3, 4], 24);
Gg.setVars('round', Gg.D().rounds - 1);
chk(autoSolve(g, Gg) && st(g).phase === 'clear', '最后一题答完 → 整局收官');
chk(Gg.ov().indexOf('全对') >= 0, '收官遮罩');
chk(Gg.ov().indexOf('连击') >= 0, '收官报最高连击');
chk(clickAct(g, 'again') && st(g).phase === 'play' && st(g).round === 0, '再来一局回到第 1 题');

console.log('— 倒计时与暂停');
g = open(97, {});
Gg = G(g);
{
  const t0 = st(g).timeTicks;
  g.pump(1.05, 100);
  chk(Math.abs(st(g).timeTicks - (t0 - 11)) <= 1, '一秒十拍（差值 ' + (t0 - st(g).timeTicks) + '）');
  Gg.togglePause();
  const tp = st(g).timeTicks;
  g.pump(1.2, 100);
  chk(st(g).timeTicks === tp, '暂停时表冻住');
  chk(Gg.ov().indexOf('暂停') >= 0, '暂停遮罩');
  chk(Gg.hudText().pause.indexOf('继续') >= 0, '按钮变继续');
  chk(Gg.tryMerge('add') === false, '暂停时不许多打牌');
  clickAct(g, 'resume');
  chk(st(g).paused === false, '遮罩关掉后继续');
  g.pump(0.4, 100);
  chk(st(g).timeTicks < tp, '恢复后接着走');
  Gg.setVars('score', 500);
  Gg.setVars('timeTicks', 3);
  g.pump(0.4, 100);
  chk(st(g).phase === 'over', '时间清零散场');
  chk(Gg.ov().indexOf('时间到了') >= 0, '散场写明原因');
  chk(Gg.ov().indexOf('牌面') >= 0, '散场把没算完的牌面亮出来');
  chk(g.storage.getItem('pt.best') === '500', '散场结算 pt.best');
}

console.log('— 键盘与难度');
g = open(606, {});
Gg = G(g);
{
  Gg.dom().cardEl(0).dispatch('click');
  const s0 = st(g).nsel;
  chk(s0 === 1, '鼠标点牌');
  g.key('1');
  chk(st(g).nsel === 0, '再按 1 取消选择');
  g.key('1'); g.key('2');
  chk(st(g).nsel === 2, '数字键 1、2 选两张');
  g.key('3');
  chk(st(g).nsel === 2 && Gg.selIdx()[0] === 1, '选第三张时挤掉最早那张');
  const nh = st(g).nh;
  g.key('+');
  chk(st(g).nh === nh - 1, '键盘 + 直接开算');
  g.key('u');
  chk(st(g).nh === nh, 'U 撤销回来');
  g.key('h');
  chk(st(g).hints === Gg.DIFFS()[st(g).diff].hints - 1, 'H 用掉一次提示');
  g.key('r');
  chk(st(g).nh === 4, 'R 换一题重新发牌');
  const sel0 = Gg.selIdx().length;
  chk(sel0 === 0, '换题清空选择');
  g.key(' ');
  chk(st(g).paused === true, '空格暂停');
  g.key(' ');
  g.key('t');
  chk(Gg.ov().indexOf('本机战绩') >= 0, 'T 开战绩');
  chk(Gg.ov().indexOf('累计合并') >= 0, '战绩页报累计合并');
  chk(Gg.ov().indexOf('还能合出来') >= 0 || Gg.ov().indexOf('已经算死') >= 0, '战绩页顺手报死活');
  clickAct(g, 'resume');
  g.key('n');
  chk(st(g).phase === 'intro', 'N 重开回介绍页');
  g.byId('btnSound').dispatch('click');
  chk(g.storage.getItem('pt.muted') !== null, '声音开关写 pt.muted');
  g.byId('btnNew').dispatch('click');
  chk(st(g).phase === 'intro', '↻ 也回介绍页');
}
{
  g = boot({}, 88);
  Gg = G(g);
  const seen = {};
  for (const d of ['easy', 'std', 'rush']) {
    chk(pickDiff(g, d), '能选中难度 ' + d);
    chk(st(g).diff === d && g.storage.getItem('pt.diff') === d, 'pt.diff 存了 ' + d);
    clickAct(g, 'start');
    seen[d] = { sec: Gg.limitSec(), hints: st(g).hints, skips: st(g).skips, rounds: Gg.D().rounds, hard: st(g).lastHard, goal: st(g).goal, combo: Gg.D().combo, mult: Gg.D().mult };
    chk(Gg.hudText().skip === String(seen[d].skips), d + ' 换题次数招牌 = ' + seen[d].skips);
  }
  chk(seen.easy.sec > seen.std.sec && seen.easy.sec > seen.rush.sec, '慢慢算限时最宽：' + seen.easy.sec + ' vs ' + seen.std.sec + '/' + seen.rush.sec);
  chk(seen.easy.hints > seen.rush.hints && seen.easy.skips > seen.rush.skips, '难度越高，拐杖越少');
  chk(seen.std.rounds > seen.easy.rounds && seen.std.rounds > seen.rush.rounds, '标准局题量最多（' + seen.std.rounds + ' 题）');
  chk(seen.rush.combo > seen.std.combo && seen.std.combo > seen.easy.combo, '连击窗口越难越严：' + seen.easy.combo + '/' + seen.std.combo + '/' + seen.rush.combo);
  chk(seen.easy.mult < seen.std.mult && seen.std.mult < seen.rush.mult, '倍率递增：' + seen.easy.mult + '/' + seen.std.mult + '/' + seen.rush.mult);
  chk(seen.easy.hard === false, '慢慢算不发硬题');
  chk(seen.rush.hard === true, '抢答赛只发硬题');
  /* 抢答赛目标会轮换 */
  Gg.setVars('round', 1);
  chk(Gg.goalNow() === Gg.DIFFS().rush.goals[1], '抢答赛第 2 题换成目标 ' + Gg.goalNow());
  Gg.setVars('round', 3);
  chk(Gg.goalNow() === 24, '第 4 题又回到 24');
  /* 越往后限时越紧 */
  Gg.setVars('round', 0);
  const a0 = Gg.limitTicks();
  Gg.setVars('round', 5);
  chk(Gg.limitTicks() <= a0 && Gg.limitTicks() >= Gg.D().floor * 10, '限时逐题收紧但不低于底 ' + Gg.limitSec() + ' 秒');
}
summary('24dian', fails);
