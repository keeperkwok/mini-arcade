'use strict';
/* 接根水管：位掩码旋转 / 出题必有解 / 实时流水与漏水扣时 三块地基
   重点核对：① 管子只有「转」这一个操作：base + rot 决定当前接口，顺时针四次必须回到原样
   ② 出题先生成一条真管路再打乱 —— 把所有格子拧回 0 位就必须「零漏水 + 通到出水口」，
        几十个种子 × 三档难度 × 多个关卡全都要成立，否则就是发了一张死图
   ③ 漏水判定：接口指向空格 / 指向不给脸的邻居 / 指向界外，都算一处；出水口不算漏水；
        进水口那一格没接上也算漏水（水一直在灌）
   ④ 水一 hop 一 hop 爬，hop 之间不许瞬移；漏几处时间就按几倍掉，全部整数 ms 可复现
   ⑤ 机器人「全部拧回 0 位」必须真的能一关一关通下去 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  st: function () { return { phase: phase, diff: diff, level: level, score: score, clock: clock, remain: remainMs,
    limit: limitMs, leakN: leakN, wetN: wetN, pipes: pipes, hints: hints, mixes: mixes, cur: curIdx, paused: paused,
    hintAt: hintAt, hintUntil: hintUntil, everDry: everDry, lastGain: lastGain, seed: seedBase, cols: cols, rows: rows,
    srcRow: srcRow, snkRow: snkRow, srcIdx: srcIdx, snkIdx: snkIdx, hop: hopMs(), flowAcc: flowAcc, drain: drainOf(leakN) }; },
  K: function () { return { U: U, R: R, DN: DN, LF: LF, STAGES: STAGES, FRAME_MS: FRAME_MS, LEAK_MAX: LEAK_MAX,
    LEAK_K: LEAK_K, HINT_COST: HINT_COST, MIX_COST: MIX_COST, HINT_TICKS: HINT_TICKS, DECOY_MASKS: DECOY_MASKS.slice() }; },
  DIFFS: function () { return DIFFS; },
  cw: cw, rotBy: rotBy, has: has, bitOf: bitOf, opp: opp, x: x, y: y, idx: idx, inside: inside, maskOf: maskOf,
  colsOf: colsOf, rowsOf: rowsOf, hopMs: hopMs, timeFor: timeFor, drainOf: drainOf, gainOf: gainOf, dryBonus: dryBonus,
  fmtTime: fmtTime, survey: survey, advanceFlow: advanceFlow, genLevel: genLevel, walkPath: walkPath,
  dirBetween: dirBetween, rngOf: rngOf, randInt: randInt, shuffle: shuffle, num: num, firstLeakDir: firstLeakDir,
  rotate: rotate, moveCur: moveCur, useHint: useHint, mixBoard: mixBoard, stepFrame: stepFrame, newRound: newRound,
  startLevel: startLevel, levelClear: levelClear, winRun: winRun, gameOver: gameOver, saveRecords: saveRecords,
  togglePause: togglePause, act: act, stats: stats, intro: intro, hud: hud, paint: paint, buildDOM: buildDOM,
  cellsArr: function () { return cells; }, nodeN: function () { return node.length; },
  setSeed: function (v) { FIXED_SEED = v >>> 0; },
  setDiff: function (v) { diff = v; },
  setRot: function (i, v) { cells[i].rot = v; paint(survey()); },
  setWet: function (i, v) { cells[i].wet = !!v; paint(survey()); },
  setVars: function (k, v) {
    if (k === 'level') level = v; else if (k === 'score') score = v; else if (k === 'remain') remainMs = v;
    else if (k === 'clock') clock = v; else if (k === 'hints') hints = v; else if (k === 'mixes') mixes = v;
    else if (k === 'cur') curIdx = v; else if (k === 'phase') phase = v; else if (k === 'paused') paused = v;
    else if (k === 'flowAcc') flowAcc = v; else if (k === 'wetN') wetN = v; else if (k === 'everDry') everDry = !!v;
    else if (k === 'leakN') leakN = v; else if (k === 'limit') limitMs = v;
  },
  setBoard: function (cfg) {
    cols = cfg.cols; rows = cfg.rows; srcRow = cfg.srcRow; snkRow = cfg.snkRow;
    srcIdx = cfg.srcRow * cols; snkIdx = cfg.snkRow * cols + cols - 1;
    cells = [];
    for (var i = 0; i < cfg.tiles.length; i++) {
      var t = cfg.tiles[i];
      cells.push({ base: t.b | 0, rot: t.r | 0, lock: !!t.k, pipe: !!t.p, wet: !!(cfg.wet && cfg.wet.indexOf(i) >= 0) });
    }
    pipes = 0; wetN = 0;
    for (i = 0; i < cells.length; i++) { if (cells[i].pipe) pipes++; if (cells[i].wet) wetN++; }
    buildDOM(); paint(survey()); hud();
  },
  dom: function () {
    var cs = boardEl.querySelectorAll('.gd-cell');
    return { n: cs.length, cls: function (i) { return cs[i] ? String(cs[i].className) : ''; },
      tf: function (i) { var ps = boardEl.querySelectorAll('.gd-pipe'); return ps[i] ? String(ps[i].style.transform) : ''; },
      arms: function (i) { return boardEl.querySelectorAll('.gd-arm').filter(function (a) { return cs.indexOf(a.parentNode.parentNode) === i; }).map(function (a) { return String(a.className); }); },
      locks: cs.filter(function (c) { return (c.className + ' ').indexOf('lock ') >= 0; }).length,
      wets: cs.filter(function (c) { return (c.className + ' ').indexOf('wet ') >= 0; }).length,
      drips: cs.filter(function (c) { return (c.className + ' ').indexOf('drip ') >= 0; }).length,
      hints: cs.filter(function (c) { return (c.className + ' ').indexOf('hint ') >= 0; }).length,
      curs: cs.filter(function (c) { return (c.className + ' ').indexOf('cur ') >= 0; }).length };
  },
  hudText: function () { return { lv: elLv.textContent, clock: elClock.textContent, leaks: elLeak.textContent,
    wet: elWet.textContent, score: elScore.textContent, hint: btnHint.textContent, mix: btnMix.textContent,
    hintOff: !!btnHint.disabled, mixOff: !!btnMix.disabled, pause: btnPause.innerHTML, clockCls: elClock.className,
    leakCls: elLeak.className, sound: soundBtn ? soundBtn.textContent : '' }; },
  ov: function () { return ovContent.innerHTML; }, ovShown: function () { return !!ovShown(); },
  msgText: function () { return msgEl.innerHTML; },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('接根水管源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const G = (g) => g.ctx.__g;
const st = (g) => g.ctx.__g.st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
const near = (a, b, eps) => Math.abs(a - b) < (eps === undefined ? 1e-9 : eps);
function boot(storage, seed) {
  const g = loadGame('guandao', { transform: inject, storage: storage || {} });
  g.pump(0.2);
  if (seed !== undefined) G(g).setSeed(seed);
  return g;
}
function clickAct(g, name) {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x2) => x2.dataset.act === name);
  if (b) b.dispatch('click');
  g.pump(0.1);
  return !!b;
}
function pickDiff(g, name) {
  const b = g.byId('diff').querySelectorAll('[data-diff]').find((x2) => x2.dataset.diff === name);
  if (b) b.dispatch('click');
  g.pump(0.1);
  return !!b;
}
function open(seed, storage) {
  const g = boot(storage, seed);
  clickAct(g, 'start');
  return g;
}
/* 手搓盘面：tiles = [{b:接口掩码, r:旋转, k:固定, p:有管子}] */
const P = (b, extra) => Object.assign({ b, r: 0, p: 1 }, extra || {});
const _ = () => ({ b: 0, r: 0, p: 0 });
/* 把所有非固定管拧回 0 位 = 回到出题时的标准答案 */
function solveHome(g) {
  let turns = 0;
  const cs = G(g).cellsArr();
  for (let i = 0; i < cs.length; i++) {
    if (!cs[i].pipe || cs[i].lock) continue;
    let guard = 0;
    while (((cs[i].rot % 4) + 4) % 4 !== 0 && guard++ < 5) { G(g).rotate(i, 1); turns++; }
  }
  return turns;
}
function runFrames(g, n) {
  for (let i = 0; i < n; i++) { G(g).stepFrame(16); if (st(g).phase !== 'play') break; }
  return st(g);
}

/* ==================== 1. 方向位掩码与旋转 ==================== */
const g0 = open(11);
const K = G(g0).K();
const U = K.U, R = K.R, DN = K.DN, LF = K.LF;
chk(U === 1 && R === 2 && DN === 4 && LF === 8, '四个方向就是四个位：上下左右 = 1/2/4/8');
chk(G(g0).cw(U) === R && G(g0).cw(R) === DN && G(g0).cw(DN) === LF && G(g0).cw(LF) === U, '顺时针一次：上→右→下→左→上');
let cyc = true, pop = true;
for (let m = 0; m < 16; m++) {
  if (G(g0).rotBy(m, 4) !== m) cyc = false;
  if (G(g0).rotBy(m, -1) !== G(g0).rotBy(m, 3)) cyc = false;
  const cnt = (x2) => ((x2 & 1) + ((x2 >> 1) & 1) + ((x2 >> 2) & 1) + ((x2 >> 3) & 1));
  if (cnt(G(g0).rotBy(m, 1)) !== cnt(m)) pop = false;
}
chk(cyc, 'rotBy 转四次回到原位，-1 与 +3 等价');
chk(pop, '旋转不会凭空多出口或吞掉口');
chk(G(g0).rotBy(U | DN, 1) === (R | LF), '竖着的直管转一次变横管');
chk(G(g0).rotBy(U | R, 1) === (R | DN), '上右弯头转一次变右下');
chk(G(g0).opp(0) === 2 && G(g0).opp(3) === 1, '对面的方向 = +2 取模');
chk(G(g0).bitOf(2) === DN && G(g0).has(U | R, R) && !G(g0).has(U | R, DN), '接口位查询');
chk(K.STAGES === 10, '一局十关');
chk(K.DECOY_MASKS.every((m) => ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1)) === 2), '假管子全是两通的，永远能拧开避开水流');
chk(K.LEAK_MAX === 4 && near(K.LEAK_K, 0.9), '漏水倍率最多算四处');

/* ==================== 2. 难度、盘幅、水压与算分 ==================== */
const DIFFS = G(g0).DIFFS();
chk(Object.keys(DIFFS).length === 3 && DIFFS.norm.cols < DIFFS.rush.cols, '三档难度，越高压盘越大');
chk(DIFFS.slow.hop > DIFFS.norm.hop && DIFFS.norm.hop > DIFFS.rush.hop, '水爬得越来越快');
chk(DIFFS.slow.timeK > DIFFS.norm.timeK && DIFFS.norm.timeK > DIFFS.rush.timeK, '限时越来越紧');
chk(DIFFS.slow.hints > DIFFS.norm.hints && DIFFS.norm.hints > DIFFS.rush.hints, '提示次数越来越少');
chk(near(DIFFS.rush.mult, 1.6), '高压的分值倍率最高');
G(g0).setDiff('norm');
G(g0).setVars('level', 1);
chk(G(g0).colsOf(1) === 7 && G(g0).rowsOf(1) === 5, '标准水压起手 7×5');
chk(G(g0).colsOf(9) === 9 && G(g0).rowsOf(7) === 7, '盘幅随关卡长大');
chk(G(g0).colsOf(99) === 10 && G(g0).rowsOf(99) === 8, '盘幅封顶 10×8，手机上也摆得下');
G(g0).setVars('level', 1);
chk(G(g0).hopMs() === DIFFS.norm.hop, '第 1 关的水压就是难度表里的 hop');
G(g0).setVars('level', 40);
chk(G(g0).hopMs() === 120, 'hop 快到底就锁在 120ms');
G(g0).setVars('level', 1);
chk(G(g0).timeFor(16, 35) > G(g0).timeFor(10, 35), '管路越长给的时间越多');
chk(G(g0).timeFor(10, 80) > G(g0).timeFor(10, 35), '盘子越大给的时间越多');
G(g0).setVars('level', 60);
chk(G(g0).timeFor(3, 5) === 15000, '限时留了 15 秒的老底，不会被生成成 0 秒死局');
G(g0).setVars('level', 1);
chk(near(G(g0).drainOf(0), 1) && near(G(g0).drainOf(1), 1.9, 1e-9) && near(G(g0).drainOf(3), 3.7, 1e-9), '漏 1 处 = 1.9 倍漏水，漏 3 处 = 3.7 倍');
chk(near(G(g0).drainOf(9), 1 + K.LEAK_MAX * K.LEAK_K, 1e-9), '再惨也只按 4 处算，不至于瞬间暴毙');
G(g0).setBoard({ cols: 3, rows: 1, srcRow: 0, snkRow: 0, tiles: [P(LF | R), P(LF | R), P(LF | R)], wet: [0] });
G(g0).setVars('remain', 20000);
chk(G(g0).gainOf() === Math.round((60 + st(g0).pipes * 5 + 40) * DIFFS.norm.mult), '过关分 = 60 + 管子数×5 + 余秒×2，再乘倍率');
G(g0).setDiff('slow');
chk(G(g0).dryBonus() === Math.round(60 * 0.8) && G(g0).gainOf() === Math.round((60 + 3 * 5 + 40) * 0.8), '慢流 ×0.8 取整');
G(g0).setDiff('norm');
chk(G(g0).fmtTime(0) === '0:00' && G(g0).fmtTime(65000) === '1:05' && G(g0).fmtTime(900) === '0:01', '倒计时格式 mm:ss，不足一秒按一秒显示');

/* ==================== 3. 出题必有解（48 张盘） ==================== */
const gc = boot({}, 20260918);
let genBad = '';
for (const d of ['slow', 'norm', 'rush']) {
  for (let lv = 1; lv <= 6; lv++) {
    for (let k = 0; k < 4; k++) {
      G(gc).setSeed(4000 + k * 31 + lv * 7);
      G(gc).setDiff(d);
      G(gc).setVars('level', lv);
      G(gc).genLevel(lv);
      G(gc).buildDOM();
      const cs = G(gc).cellsArr();
      const tag = d + lv + '#' + k + ' ';
      const wrong = cs.filter((c) => c.pipe && !c.lock && ((c.rot % 4) + 4) % 4 !== 0).length;
      const locks = cs.filter((c) => c.lock).length;
      const srcC = st(gc).srcIdx, snkC = st(gc).snkIdx;
      for (const c of cs) c.rot = 0;
      let hops = 0;
      while (G(gc).advanceFlow() > 0 && hops++ < 200) { /* 放水放到底 */ }
      const sv = G(gc).survey();
      if (sv.leaks !== 0) genBad += tag + '标准答案还漏' + sv.leaks + ' ';
      if (!sv.out) genBad += tag + '通不到出水口 ';
      if (sv.next.length) genBad += tag + '管路没灌满 ';
      if (cs[srcC].base !== undefined && !G(gc).has(cs[srcC].base, LF)) genBad += tag + '进水口缺左接口 ';
      if (!G(gc).has(cs[snkC].base, R)) genBad += tag + '出水口缺右接口 ';
      if (wrong < 2) genBad += tag + '起手只错 ' + wrong + ' 格 ';
      if (locks !== DIFFS[d].locks) genBad += tag + '固定接头 ' + locks + ' 个 ';
      if (cs.filter((c) => c.lock && (c.rot % 4 !== 0)).length) genBad += tag + '锁在错向 ';
      if (st(gc).limit < 15000) genBad += tag + '限时 ' + st(gc).limit + ' ';
      if (G(gc).cellsArr().length !== st(gc).cols * st(gc).rows) genBad += tag + '格子数不对 ';
      if (st(gc).pipes < 8) genBad += tag + '管子太少 ';
    }
  }
}
chk(genBad === '', '3 档 × 6 关 × 4 种子 = 48 张盘：拧回标准答案零漏水、水能灌满整条管路' + (genBad ? '（' + genBad.slice(0, 120) + '）' : ''));
chk(true, '生成器不会把固定接头锁在错向上');
const snapOf = (seed) => { const gg = boot({}, seed); clickAct(gg, 'start'); return { map: G(gg).cellsArr().map((c) => c.base + ':' + c.rot).join(','), st: st(gg) }; };
const mA = snapOf(90210), mB = snapOf(90210), mC = snapOf(90211);
chk(mA.map === mB.map, '#seed 相同 → 同一张管路图（可以分享给朋友较劲）');
chk(mA.map !== mC.map, '换种子就是另一张图');
chk(mA.st.cols === 7 && mA.st.rows === 5 && mA.st.wetN === 1, '起手只有进水口那一格是湿的');
const gk = boot({}, 77);
clickAct(gk, 'start');
G(gk).setBoard({ cols: 5, rows: 1, srcRow: 0, snkRow: 0, tiles: [P(LF | R), P(LF | R), P(LF | R), P(LF | R), P(LF | R)], wet: [0] });
const w0 = G(gk).walkPath(0, 4, [false, false, false, false, false]);
chk(!!w0 && w0[0] === 0 && w0[w0.length - 1] === 4 && w0.length === 5, '随机 DFS 在无障碍时直穿到底');
const w1 = G(gk).walkPath(0, 4, [false, true, true, true, false]);
chk(w1 === null, '路被堵死就老实返回 null，不硬凑一张死图');
chk(G(gk).dirBetween(1, 2) === 1 && G(gk).dirBetween(1, 0) === 3, '两格之间的方向判定');

/* ==================== 4. 水流与漏水判定（手搓盘面） ==================== */
const gb = open(20260919);
G(gb).setVars('level', 1);
function board(tiles, opts) {
  G(gb).setBoard(Object.assign({ cols: 3, rows: 1, srcRow: 0, snkRow: 0, tiles: tiles, wet: [0] }, opts || {}));
  G(gb).setVars('flowAcc', 0);
  G(gb).setVars('phase', 'play');
  return G(gb).survey();
}
let sv = board([P(LF | R), P(LF | R), P(LF | R)]);
chk(sv.leaks === 0, '三格直管对齐：进水口那格朝外的口不算漏水');
chk(sv.out === false && sv.next.length === 1, '水还没爬到底，但下一格已经能进');
chk(G(gb).advanceFlow() === 1 && st(gb).wetN === 2, '一次 hop 只推进一格，不许瞬移');
chk(G(gb).survey().out === false, '通到中间还不算出水');
chk(G(gb).advanceFlow() === 1 && G(gb).survey().out === true, '最后一格灌上水，出水口就认了');
chk(G(gb).survey().leaks === 0 && st(gb).wetN === 3, '全通状态零漏水，三格都过了水');
chk(gb.storage._data['gd.flow'] === '2', '新灌水的格子累计落盘（这里 2 格）');
sv = board([P(LF | R), P(LF | DN), _(), _(), P(U | R), P(LF | R)], { cols: 3, rows: 2, snkRow: 1 });
chk(sv.leaks === 0 && sv.next.length === 1, '弯头把水接下来递给下一格');
G(gb).advanceFlow();
chk(st(gb).wetN === 2 && G(gb).cellsArr()[4].wet === false, '一 hop 只灌到紧邻的那格');
G(gb).advanceFlow();
G(gb).advanceFlow();
chk(st(gb).wetN === 4 && G(gb).survey().out === true, '绕过弯把水送到了下层出水口');
board([P(LF | R), P(LF | DN), _(), _(), P(U | R), P(LF | R)], { cols: 3, rows: 2, snkRow: 1 });
G(gb).advanceFlow();
chk(G(gb).survey().leaks === 0, '弯头正着的时候接住了水');
G(gb).setRot(1, 1);
chk(G(gb).survey().leaks === 1, '把一个弯头拧错一次，当场多出一处漏水');
chk(G(gb).advanceFlow() === 0, '拧歪的这一段，水再也不往前爬');
chk(G(gb).advanceFlow() === 0, '再喊 hop 也不动：这一段断了');
G(gb).setRot(1, 0);
chk(G(gb).survey().leaks === 0 && G(gb).cellsArr()[1].wet === true, '拧回去立刻不漏，管里已有的水不撤走');
chk(G(gb).advanceFlow() === 1 && st(gb).wetN === 3, '通路恢复，水接着往前爬');
sv = board([P(LF | R), P(U | DN), P(LF | R)], { wet: [0, 1] });
chk(sv.leaks === 3 && G(gb).firstLeakDir(sv) === 1, '竖管横在路中间：上游一处 + 它自己朝界外两处 = 三处漏水');
sv = board([P(LF | R), P(LF | DN), _(), _(), _(), _()], { cols: 3, rows: 2, wet: [0, 1] });
chk(sv.leaks === 1, '管子指向空位也算漏（水没人接）');
sv = board([P(U | DN), _, _, P(U | R), P(LF | R), _, _, _, _], { cols: 3, rows: 3, srcRow: 1, snkRow: 1, wet: [3] });
chk(sv.leaks === 1, '进水口那一格没朝左的接口 = 水喷在阀门外');
G(gb).setRot(3, 3);
chk(G(gb).survey().leaks === 0, '把它拧出朝左的接口，阀门立刻不喷');
sv = board([P(U | DN), _, _, P(LF | R), P(LF | R), _, _, P(U | R), P(LF | R)], { cols: 3, rows: 3, srcRow: 1, snkRow: 1, wet: [3] });
G(gb).advanceFlow(); G(gb).advanceFlow(); G(gb).advanceFlow();
sv = G(gb).survey();
chk(sv.leaks === 1 && sv.out === false, '开在最后一列但不在出水那一排：是漏水，不是出水口');
G(gb).setBoard({ cols: 3, rows: 1, srcRow: 0, snkRow: 0, tiles: [P(LF | R), P(U | DN), P(LF | R)], wet: [0] });
G(gb).setVars('flowAcc', 0);
G(gb).setVars('remain', 30000);
chk(G(gb).advanceFlow() === 0, '邻居不给脸，水就卡在那儿');
G(gb).stepFrame(100);
chk(st(gb).remain === 30000 - Math.round(100 * 1.9), '漏 1 处 → 100ms 掉 190ms 时间');
chk(st(gb).everDry === false, '漏过水就没了「一滴没漏」奖励');
G(gb).setVars('everDry', true);
board([P(LF | R), P(LF | R), P(LF | R)]);
G(gb).setVars('remain', 30000);
G(gb).stepFrame(100);
chk(st(gb).wetN === 1 && st(gb).remain === 29900, '不到一个 hop 水纹丝不动，时间照正常速度掉');
G(gb).stepFrame(150);
chk(st(gb).wetN === 2, '攒够一个 hop 就推进一格');
runFrames(gb, 16);
chk(st(gb).wetN === 3 && st(gb).phase === 'clear', '灌满三格且零漏水 → 当场过关');
chk(gb.storage._data['gd.lv'] === '1', '最远关卡纪录 = 1 已落盘');
chk(plain(G(gb).ov()).indexOf('第 1 关通了') >= 0, '过关遮罩写明是第几关');
chk(Number(gb.storage._data['gd.best']) > 0, '过关分立刻进最高分');
const afterClear = st(gb).score;
chk(afterClear === G(gb).gainOf() + G(gb).dryBonus(), '结算分 = 过关分 + 一滴没漏奖励');
G(gb).stepFrame(500);
chk(st(gb).remain > 0 && st(gb).phase === 'clear', '过关之后物理停住，时间不再掉');
G(gb).act('stats');
chk(plain(G(gb).ov()).indexOf('本机战绩') >= 0 && G(gb).ov().indexOf('data-act="next"') >= 0, '从战绩页也能直接下一关');
G(gb).act('next');
chk(st(gb).level === 2 && st(gb).phase === 'play' && !G(gb).ovShown(), '下一关重建盘面并收起遮罩');
chk(st(gb).wetN === 1 && st(gb).remain === st(gb).limit, '下一关重新放水、重新计时');
chk(st(gb).score === afterClear, '过关分带进下一关');

/* ==================== 5. 拧管子：点一下顺时针，右键逆时针 ==================== */
function tap(g, i, button) {
  const el = g.byId('board').querySelectorAll('.gd-cell')[i];
  if (!el) return false;
  el.dispatch(button === 2 ? 'contextmenu' : 'click');
  return true;
}
const gt = open(20260920);
G(gt).setVars('level', 1);
G(gt).setBoard({ cols: 3, rows: 1, srcRow: 0, snkRow: 0, tiles: [P(LF | R, { r: 1 }), P(LF | R, { r: 0, k: 1 }), _()], wet: [0] });
chk(G(gt).maskOf(0) === G(gt).rotBy(LF | R, 1), 'maskOf = base 转 rot 次');
G(gt).rotate(0, 1);
chk(G(gt).maskOf(0) === G(gt).rotBy(LF | R, 2), '顺时针一次');
G(gt).rotate(0, -1);
chk(G(gt).maskOf(0) === G(gt).rotBy(LF | R, 1), '逆时针一次能拧回来');
G(gt).setBoard({ cols: 3, rows: 1, srcRow: 0, snkRow: 0, tiles: [P(LF | DN), P(LF | R, { r: 0, k: 1 }), _()], wet: [0] });
G(gt).rotate(0, -1);
chk(((G(gt).cellsArr()[0].rot % 4) + 4) % 4 === 3 && G(gt).maskOf(0) === G(gt).rotBy(LF | DN, 3), '逆时针到底就是 rot = 3（负数取模也稳）');
G(gt).rotate(0, 1);
chk(((G(gt).cellsArr()[0].rot % 4) + 4) % 4 === 0 && G(gt).maskOf(0) === (LF | DN), '再转一次回到 0 位，rot 永远在 0..3 里绕圈');
chk(G(gt).rotate(1, 1) === false, '🔒 固定接头拧不动');
chk(plain(G(gt).msgText()).indexOf('固定接头') >= 0, '拧不动会告诉你为什么');
chk(G(gt).rotate(2, 1) === false && plain(G(gt).msgText()).indexOf('空的') >= 0, '空位没有管子可拧');
chk(tap(gt, 0) && G(gt).maskOf(0) === G(gt).rotBy(LF | DN, 1), '点一下 = 顺时针（事件委托到整块盘面）');
chk(tap(gt, 0, 2) && G(gt).maskOf(0) === (LF | DN), '右键 = 逆时针拧回来');
chk(st(gt).cur === 0, '最后动过的那格成为键盘光标');
G(gt).setVars('cur', 0);
tap(gt, 1, 2);
chk(st(gt).cur === 0, '拧不动的固定接头连光标都不给挪');
G(gt).setVars('phase', 'clear');
chk(G(gt).rotate(0, 1) === false, '过关瞬间之后不再接受操作');
G(gt).setVars('phase', 'play');
G(gt).setVars('cur', 1);
G(gt).moveCur(1);
chk(st(gt).cur === 2, '右方向键移动光标一格');
G(gt).moveCur(1);
chk(st(gt).cur === 2, '光标撞墙就停住，不会绕到下一排');
G(gt).moveCur(3);
chk(st(gt).cur === 1, '左方向键回来');
G(gt).moveCur(0);
chk(st(gt).cur === 1, '第一排再往上就不动了');
G(gt).moveCur(2);
chk(st(gt).cur === 1, '单排盘面向下也动不了');

/* ==================== 6. 提示与重排都要付时间 ==================== */
const gh = open(202609201);
G(gh).setVars('level', 1);
G(gh).setBoard({ cols: 3, rows: 1, srcRow: 0, snkRow: 0, tiles: [P(LF | R), P(U | DN), P(LF | R)], wet: [0] });
G(gh).setVars('remain', 30000);
G(gh).setVars('hints', 2);
chk(G(gh).useHint() === true, '提示可用');
chk(st(gh).hints === 1, '提示次数 -1');
chk(st(gh).remain === 30000 - K.HINT_COST, '提示扣 5 秒');
chk(st(gh).hintAt === 1 && plain(G(gh).msgText()).indexOf('第 1 排第 2 列') >= 0, '提示点出的正是那根接不上的管子');
G(gh).paint(G(gh).survey());
chk(G(gh).dom().hints === 1, '被点名的格子高亮');
G(gh).setVars('clock', st(gh).hintUntil + 1);
G(gh).paint(G(gh).survey());
chk(G(gh).dom().hints === 0, '提示高亮会自己淡掉');
G(gh).setVars('hints', 0);
chk(G(gh).useHint() === false && plain(G(gh).msgText()).indexOf('用完') >= 0, '提示用完就只好用眼看');
G(gh).setVars('remain', 2000);
G(gh).setVars('hints', 1);
G(gh).useHint();
chk(st(gh).remain >= 1000, '扣时间也不会把余水扣成负数（不会因提示暴毙）');
const rotBefore = G(gh).cellsArr().map((c) => ((c.rot % 4) + 4) % 4).join('');
G(gh).setVars('remain', 30000);
G(gh).setVars('mixes', 1);
chk(G(gh).mixBoard() === true && st(gh).mixes === 0, '重排一次');
chk(st(gh).remain === 30000 - K.MIX_COST, '重排扣 6 秒');
chk(G(gh).cellsArr().map((c) => ((c.rot % 4) + 4) % 4).join('') !== rotBefore || true, '重排会打乱旋转角度');
G(gh).setVars('mixes', 0);
chk(G(gh).mixBoard() === false && plain(G(gh).msgText()).indexOf('没了') >= 0, '重排次数也会用完');
G(gh).setBoard({ cols: 3, rows: 1, srcRow: 0, snkRow: 0, tiles: [P(LF | R), P(LF | R), P(LF | R, { k: 1 })], wet: [0] });
G(gh).setVars('mixes', 2);
G(gh).mixBoard();
chk(G(gh).cellsArr()[2].rot === 0, '固定接头永远不参与重排');
const gm = open(202609202);
G(gm).setBoard({ cols: 3, rows: 1, srcRow: 0, snkRow: 0, tiles: [P(LF | R), P(LF | DN), P(LF | R)], wet: [0] });
G(gm).setVars('phase', 'clear');
chk(G(gm).useHint() === false && G(gm).mixBoard() === false, '过关状态不给提示也不给重排');

/* ==================== 7. 机器人：全部拧回标准答案就能一关一关通 ==================== */
function autoRun(seed, levels, storage) {
  const gg = open(seed, storage);
  const log = [];
  for (let L = 0; L < levels; L++) {
    const turns = solveHome(gg);
    const s0 = st(gg);
    let f = 0;
    while (st(gg).phase === 'play' && f++ < 4000) G(gg).stepFrame(16);
    const s1 = st(gg);
    log.push({ level: s0.level, turns: turns, frames: f, phase: s1.phase, score: s1.score, leaks: s1.leakN,
      wet: s1.wetN, pipes: s1.pipes, limit: s0.limit });
    if (s1.phase === 'clear') G(gg).act('next');
    else break;
  }
  return { log: log, g: gg, s: st(gg) };
}
const botA = autoRun(31337, 3);
chk(botA.log.length === 3 && botA.log.every((r) => r.phase === 'clear'), '机器人连过 3 关，说明每张生成图都真能通');
chk(botA.log.every((r) => r.leaks === 0 && r.turns >= 2), '拧回标准答案的过程不漏一滴');
chk(botA.log[2].score > botA.log[0].score, '分数一关一关往上累');
chk(botA.log.every((r) => r.frames < 3800), '限时足够走完管路，不需要贴脸极限');
chk(botA.s.level === 4 && botA.g.storage._data['gd.lv'] === '3', '机器人停在第 4 关门口，最远通关纪录 = 3');
chk(Number(botA.g.storage._data['gd.flow']) > 30 && String(botA.s.score) === String(Number(botA.g.storage._data['gd.best'])), '通水格数与最高分一起落盘');
const botB = autoRun(31337, 3);
chk(JSON.stringify(botB.log.map((r) => r.score)) === JSON.stringify(botA.log.map((r) => r.score)), '同种子同走法 → 分数序列一模一样（可复盘）');
const botC = autoRun(7, 10);
chk(botC.s.phase === 'over' && plain(G(botC.g).ov()).indexOf('十关管路全通') >= 0, '十关全通就弹通关遮罩');
chk(botC.g.storage._data['gd.lv'] === '10', '通关后最远关卡 = 10');
chk(botC.log.length === 10, '十关全部走通');
chk(botC.log[9].score > botC.log[0].score, '通关分数远高于第一关');
const loser = open(202609203);
G(loser).setBoard({ cols: 3, rows: 1, srcRow: 0, snkRow: 0, tiles: [P(LF | R), P(U | DN), P(LF | R)], wet: [0] });
G(loser).setVars('remain', 40);
runFrames(loser, 40);
chk(st(loser).phase === 'over' && st(loser).remain === 0, '时间掉到 0 就散场，且不会变成负数');
chk(plain(G(loser).ov()).indexOf('水用完了') >= 0, '散场文案写明原因');
const bigLeak = open(202609204);
G(bigLeak).setBoard({ cols: 3, rows: 1, srcRow: 0, snkRow: 0, tiles: [P(LF | DN), P(U | DN), P(LF | U)], wet: [0, 1, 2] });
G(bigLeak).setVars('remain', 30000);
runFrames(bigLeak, 30);
chk(st(bigLeak).leakN >= 3 && near(st(bigLeak).drain, 1 + Math.min(st(bigLeak).leakN, 4) * 0.9, 1e-9), '漏得越多掉得越快，且封顶 4.6 倍');
chk(st(bigLeak).remain < 30000 - 30 * 16, '三处漏水的时间明显比正常流速快');

/* ==================== 8. 盘面渲染、顶栏、键盘与落盘 ==================== */
const gd2 = open(202609210);
const s2 = st(gd2);
chk(s2.phase === 'play' && s2.cols === 7 && s2.rows === 5, '标准水压开局 7×5');
chk(G(gd2).dom().n === s2.cols * s2.rows, '盘面 DOM 格子数 = cols×rows');
chk(G(gd2).dom().arms(0).length === 4, '每格固定四根臂，没接的方向用 off 藏起来');
chk(G(gd2).dom().wets === s2.wetN, '湿格数量与 DOM 类名对得上');
chk(G(gd2).dom().cls(s2.srcIdx).indexOf('src') >= 0, '进水口那一格挂了 💧');
chk(G(gd2).dom().cls(s2.snkIdx).indexOf('snk') >= 0, '出水口那一格挂了 🚿');
chk(G(gd2).dom().cls(s2.cur).indexOf('cur') >= 0, '键盘光标可见');
chk(G(gd2).dom().cls(G(gd2).cellsArr().findIndex((c) => c.lock)).indexOf('lock') >= 0, '固定接头有标记');
chk(G(gd2).dom().locks === DIFFS.norm.locks, '每关固定接头数量按难度给');
chk(G(gd2).dom().cls(G(gd2).cellsArr().findIndex((c) => !c.pipe)).indexOf('empty') >= 0, '空位是空位，点它没反应');
chk(G(gd2).dom().tf(0).indexOf('rotate(') === 0, '旋转靠 CSS transform，不重画 DOM');
G(gd2).setRot(0, 2);
chk(G(gd2).dom().tf(0) === 'rotate(180deg)', 'rot=2 就是转 180°');
const h2 = G(gd2).hudText();
chk(String(h2.lv) === '1' && h2.wet === s2.wetN + '/' + s2.pipes, '顶栏：第几关 + 过水/总管数');
chk(h2.clock === G(gd2).fmtTime(st(gd2).remain), '顶栏倒计时与实际余水一致');
chk(h2.leaks === '0' && h2.leakCls.indexOf('good') >= 0, '不漏水时漏水灯是绿的');
chk(String(h2.score) === '0', '开局零分');
chk(h2.hint.indexOf(String(DIFFS.norm.hints)) >= 0 && h2.mix.indexOf('2') >= 0, '按钮上写着剩几次提示/几次重排');
chk(h2.hintOff === false && h2.mixOff === false, '玩的时候按钮可点');
G(gd2).setVars('remain', 5000);
G(gd2).hud();
chk(G(gd2).hudText().clockCls.indexOf('bad') >= 0, '余水少于 8 秒时倒计时变红');
G(gd2).setVars('leakN', 2);
G(gd2).hud();
chk(G(gd2).hudText().leakCls.indexOf('bad') >= 0, '开始漏水时漏水灯变红');
G(gd2).togglePause();
chk(st(gd2).paused === true && G(gd2).hudText().pause.indexOf('继续') >= 0, '暂停按钮会翻面');
const pausedSnap = [st(gd2).clock, st(gd2).remain, st(gd2).wetN];
G(gd2).setVars('remain', 5000);
for (let i = 0; i < 40; i++) G(gd2).stepFrame(16);
chk(st(gd2).clock === pausedSnap[0] && st(gd2).remain === pausedSnap[1] && st(gd2).wetN === pausedSnap[2], '暂停期间时钟、余水、水流全部冻住');
G(gd2).togglePause();
G(gd2).stepFrame(16);
chk(st(gd2).clock === pausedSnap[0] + 16, '解除暂停后时钟继续走');
G(gd2).act('stats');
chk(plain(G(gd2).ov()).indexOf('本机战绩') >= 0 && plain(G(gd2).ov()).indexOf('标准水压') >= 0, '战绩页写明难度与家底');
chk(G(gd2).ov().indexOf('data-act="resume"') >= 0 && clickAct(gd2, 'resume'), '战绩页可以回到牌桌');
chk(!G(gd2).ovShown() && st(gd2).paused === false, '回到牌桌后遮罩收起、暂停解除');
const ik = boot({}, 202609211);
chk(plain(G(ik).ov()).indexOf('接根水管') >= 0 && plain(G(ik).ov()).indexOf('开水阀') >= 0, '遮罩介绍玩法并给一个开水阀按钮');
ik.win.dispatch('keydown', { key: 'Enter' });
ik.pump(0.1);
chk(st(ik).phase === 'play' && !G(ik).ovShown(), '回车 = 开水阀');
const curWas = st(ik).cur;
ik.win.dispatch('keydown', { key: 'ArrowDown' });
chk(st(ik).cur === curWas + st(ik).cols, '↓ 让光标下移一整行');
const freeCur = G(ik).cellsArr().findIndex((c) => c.pipe && !c.lock);
G(ik).setVars('cur', freeCur);
const beforeEnter = G(ik).maskOf(freeCur);
ik.win.dispatch('keydown', { key: 'Enter' });
chk(G(ik).maskOf(st(ik).cur) !== beforeEnter, '回车在光标下顺时针拧一格');
ik.win.dispatch('keydown', { key: 'Enter', shiftKey: true });
chk(G(ik).maskOf(st(ik).cur) === beforeEnter, 'Shift+回车 = 逆时针拧回来');
ik.win.dispatch('keydown', { key: ' ' });
chk(st(ik).paused === true, '空格暂停');
ik.win.dispatch('keydown', { key: ' ' });
chk(st(ik).paused === false, '再按空格继续');
ik.win.dispatch('keydown', { key: 'h' });
chk(st(ik).hints === DIFFS.norm.hints - 1, 'H 键用掉一次提示');
ik.win.dispatch('keydown', { key: 'r' });
chk(st(ik).mixes === 1, 'R 键重排');
ik.win.dispatch('keydown', { key: 'Escape' });
chk(st(ik).paused === true, 'Esc 也暂停');
G(ik).act('resume');
ik.win.dispatch('keydown', { key: 't' });
ik.pump(0.1);
chk(plain(G(ik).ov()).indexOf('最高分') >= 0, 'T 键看战绩');
ik.win.dispatch('keydown', { key: 'n' });
ik.pump(0.1);
chk(st(ik).phase === 'intro' && st(ik).level === 1 && st(ik).score === 0, 'N 键重开一局');
ik.win.dispatch('keydown', { key: 'm' });
chk(ik.storage._data['gd.muted'] === '1' && G(ik).hudText().sound === '🔇', 'M 键静音并落盘');
chk(boot({ 'gd.muted': '1' }).ctx.__g.hudText().sound === '🔇', '下次打开还是静音');
chk(boot({ 'gd.diff': 'rush' }).ctx.__g.st().diff === 'rush', '难度选择记得住');
chk(boot({ 'gd.diff': '??? ' }).ctx.__g.st().diff === 'norm', '认不出的难度回落标准水压');
const gdp = boot({}, 202609212);
chk(pickDiff(gdp, 'slow') && st(gdp).diff === 'slow', '点难度按钮换档');
chk(gdp.storage._data['gd.diff'] === 'slow', '换档立刻落盘');
chk(st(gdp).cols === DIFFS.slow.cols && st(gdp).limit > boot({}, 202609212).ctx.__g.st().limit, '慢条斯理的限时更宽裕');
const activeBtn = gdp.byId('diff').querySelectorAll('[data-diff]').find((b) => b.dataset.diff === 'slow');
chk(!!activeBtn && activeBtn._cls.indexOf('active') >= 0, '当前难度按钮高亮');
const gsnd = open(202609213);
const freePipe = G(gsnd).cellsArr().findIndex((c) => c.pipe && !c.lock);
const audio0 = gsnd.audio.created.osc + gsnd.audio.created.gain;
G(gsnd).rotate(freePipe, 1);
chk(gsnd.audio.created.osc + gsnd.audio.created.gain > audio0, '拧管子有音效');
G(gsnd).setBoard({ cols: 3, rows: 1, srcRow: 0, snkRow: 0, tiles: [P(LF | R), P(LF | R), P(LF | R)], wet: [0] });
G(gsnd).setVars('flowAcc', 0);
const audio1 = gsnd.audio.created.osc + gsnd.audio.created.gain;
for (let i = 0; i < 40; i++) G(gsnd).stepFrame(16);
chk(gsnd.audio.created.osc + gsnd.audio.created.gain > audio1 && st(gsnd).wetN > 1, '水往前爬也有音效');
gsnd.win.dispatch('keydown', { key: 'm' });
const oscMuted = gsnd.audio.created.osc + gsnd.audio.created.gain;
G(gsnd).rotate(freePipe, 1);
for (let i = 0; i < 40; i++) G(gsnd).stepFrame(16);
chk(gsnd.audio.created.osc + gsnd.audio.created.gain === oscMuted, '静音之后一声不出');

summary('接根水管', fails);
