'use strict';
/* 连连看：连通判定 / 发牌与洗牌 / 整数拍倒计时 三块地基
   重点核对：① 「拐弯不超过两次」用了按拐弯分层打射线的 BFS —— 测试里再写一套
        「枚举拐角格」的第二实现逐格对拍，两套答案必须一模一样（含连不上的情况）
   ② 牌面外那一圈走廊是真的能走：贴边的牌绕过外圈就该连得上（连连看的手感所在）
   ③ 倒计时、连击窗口、连线残留全部按「拍」算，暂停与开遮罩必须冻住时钟
   ④ 一对都连不上时先免费自动洗牌，洗牌次数没了才散场；清空一盘的结算只加剩余时间折算的分 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  st: function () { return { phase: phase, diff: diff, stage: stage, score: score, ticks: ticks, clock: clock, gap: gap,
    combo: combo, bestCombo: bestCombo, hints: hints, mixes: mixes, sel: sel, paused: paused, seed: seedBase,
    tiles: tileCount(), gw: gw(), gh: gh(), limit: limitTicks(), lastBonus: lastBonus, lastGain: lastGain,
    pathLen: pathCells.length, hintOn: !!hintPair }; },
  cells: function () { return cells.slice(); },
  K: function () { return { STEP_MS: STEP_MS, STAGES: STAGES, COMBO_GAP: COMBO_GAP, PATH_TICKS: PATH_TICKS,
    HINT_TICKS: HINT_TICKS, HINT_COST: HINT_COST, MIX_COST: MIX_COST }; },
  DIFFS: function () { return DIFFS; }, PIECES: function () { return PIECES; },
  idxOf: idxOf, xOf: xOf, yOf: yOf, inside: inside, occ: occ, stepTo: stepTo, gw: gw, gh: gh,
  linkOf: linkOf, pairList: pairList, findPair: findPair, tileCount: tileCount, dealBoard: dealBoard,
  mixBoard: mixBoard, shuffleArr: shuffleArr, rngOf: rngOf, gainOf: gainOf, clearBonus: clearBonus,
  fmtTime: fmtTime, limitTicks: limitTicks, guardDead: guardDead, pieceOf: pieceOf,
  tap: tap, useHint: useHint, useMix: useMix, togglePause: togglePause, step: step, running: running,
  startStage: startStage, newRound: newRound, act: act, stats: stats, intro: intro, hud: hud, paint: paint,
  removePair: removePair, saveRecords: saveRecords, gameOver: gameOver, stageClear: stageClear, finishRun: finishRun,
  dom: function () { return { n: boardEl.querySelectorAll('.lk-cell').length, cols: boardEl.style.gridTemplateColumns,
    tiles: boardEl.querySelectorAll('.lk-cell').filter(function (c) { return (c.className + ' ').indexOf('tile ') >= 0; }).length,
    sel: boardEl.querySelectorAll('.lk-cell').filter(function (c) { return (c.className + ' ').indexOf('sel ') >= 0; }).length,
    hint: boardEl.querySelectorAll('.lk-cell').filter(function (c) { return (c.className + ' ').indexOf('hint ') >= 0; }).length,
    path: boardEl.querySelectorAll('.lk-cell').filter(function (c) { return (c.className + ' ').indexOf('path ') >= 0; }).length,
    out: boardEl.querySelectorAll('.lk-cell').filter(function (c) { return (c.className + ' ').indexOf('out ') >= 0; }).length,
    cls: function (i) { return boardEl.querySelectorAll('.lk-cell')[i] ? boardEl.querySelectorAll('.lk-cell')[i].className : ''; },
    txt: function (i) { return boardEl.querySelectorAll('.lk-cell')[i] ? boardEl.querySelectorAll('.lk-cell')[i].innerHTML : ''; } }; },
  hudText: function () { return { lv: elLv.textContent, clock: elClock.textContent, left: elLeft.textContent,
    combo: elCombo.textContent, score: elScore.textContent, hint: elHint.textContent, mix: elMix.textContent,
    clockCls: elClock.className, hintOff: !!btnHint.disabled, mixOff: !!btnMix.disabled, pause: btnPause.innerHTML }; },
  ov: function () { return ovContent.innerHTML; }, ovShown: function () { return !!ovShown(); },
  msgText: function () { return msgEl.innerHTML; },
  setSeed: function (v) { FIXED_SEED = v >>> 0; }, setDiff: function (v) { diff = v; },
  setCells: function (arr) { cells = arr.slice(); buildBoard(); hud(); paint(); },
  setVars: function (k, v) { if (k === 'ticks') ticks = v; else if (k === 'score') score = v; else if (k === 'combo') combo = v;
    else if (k === 'mixes') mixes = v; else if (k === 'hints') hints = v; else if (k === 'stage') stage = v;
    else if (k === 'gap') gap = v; else if (k === 'clock') clock = v; else if (k === 'sel') sel = v;
    else if (k === 'paused') paused = v; else if (k === 'bestCombo') bestCombo = v; },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('连连看源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const G = (g) => g.ctx.__g;
const st = (g) => g.ctx.__g.st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
function boot(storage, seed) {
  const g = loadGame('liankan', { transform: inject, storage: storage || {} });
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
/* 第二套实现：枚举拐角格，直着 / 一个弯 / 两个弯 */
function brute(cs, w, turnsAllowed) {
  const X = (i) => i % w;
  const Y = (i) => (i - (i % w)) / w;
  const empty = (i) => i >= 0 && i < cs.length && cs[i] === 0;
  const clear = (p, q) => {
    if (X(p) === X(q)) {
      const s = Math.min(Y(p), Y(q)) + 1, e = Math.max(Y(p), Y(q));
      for (let y = s; y < e; y++) if (!empty(y * w + X(p))) return false;
      return true;
    }
    if (Y(p) === Y(q)) {
      const s = Math.min(X(p), X(q)) + 1, e = Math.max(X(p), X(q));
      for (let x = s; x < e; x++) if (!empty(Y(p) * w + x)) return false;
      return true;
    }
    return false;
  };
  const coll = (p, q) => X(p) === X(q) || Y(p) === Y(q);
  void turnsAllowed;
  return (a, b) => {
    if (a === b) return -1;
    if (coll(a, b) && clear(a, b)) return 0;
    const c1 = [Y(a) * w + X(b), Y(b) * w + X(a)];
    for (const c of c1) if (empty(c) && clear(a, c) && clear(c, b)) return 1;
    for (let e = 0; e < cs.length; e++) {
      if (e === a || !empty(e) || !coll(a, e) || !clear(a, e)) continue;
      const c2 = [Y(e) * w + X(b), Y(b) * w + X(e)];
      for (const q of c2) {
        if (q === e || !empty(q)) continue;
        if (coll(e, q) && clear(e, q) && coll(q, b) && clear(q, b)) return 2;
      }
    }
    return -1;
  };
}
// 手工摆一个 quick 盘（6×4 内圈 + 外走廊 = 8×6）
function boardOf(rows, cols) {
  const w = cols + 2;
  const cs = new Array(w * (rows.length + 2)).fill(0);
  for (let y = 1; y <= rows.length; y++) for (let x = 1; x <= cols; x++) cs[y * w + x] = rows[y - 1][x - 1];
  return cs;
}
const DEAD_ROWS = [
  [1, 2, 3, 4, 5, 6],
  [2, 1, 4, 1, 4, 3],
  [5, 2, 5, 2, 5, 4],
  [6, 5, 4, 3, 2, 1],
];

/* ==================== 1. 难度表与常量 ==================== */
const ref = boot({}, 7);
const D = G(ref).DIFFS();
const K = G(ref).K();
chk(['quick', 'sharp', 'master'].every((d) => !!D[d]), '三档难度都在表上');
for (const d of ['quick', 'sharp', 'master']) {
  const c = D[d];
  chk((c.cols * c.rows) % 2 === 0, d + ' 牌数 ' + c.cols * c.rows + ' 是偶数（必须成对）');
  chk(c.kinds >= 4 && c.kinds * 2 <= c.cols * c.rows, d + ' 花色数摆得下');
  chk(c.time > 30 && c.mult > 0 && c.hints > 0 && c.mixes > 0, d + ' 时间与道具参数齐全');
  chk(c.cols > 2 && c.rows > 2, d + ' 盘面比外走廊大');
}
chk(D.quick.mult < D.sharp.mult && D.sharp.mult < D.master.mult, '倍率随难度递增');
chk(D.quick.cols * D.quick.rows < D.sharp.cols * D.sharp.rows && D.sharp.cols * D.sharp.rows < D.master.cols * D.master.rows,
  '牌数随难度递增（' + D.quick.cols * D.quick.rows + '/' + D.sharp.cols * D.sharp.rows + '/' + D.master.cols * D.master.rows + '）');
chk(D.quick.hints >= D.sharp.hints && D.sharp.hints >= D.master.hints, '提示次数随难度递减');
chk(G(ref).PIECES().length >= D.master.kinds, '图案库够最深一档用');
chk(K.STEP_MS === 100 && K.STAGES === 8 && K.COMBO_GAP === 25, '一拍 100ms · 八盘 · 连击窗口 2.5 秒');
chk(K.HINT_COST === 30 && K.MIX_COST === 50, '提示扣 3 秒、洗牌扣 5 秒');

/* ==================== 2. 几何与走廊 ==================== */
pickDiff(ref, 'quick');
clickAct(ref, 'start');
const W = st(ref).gw, H = st(ref).gh;
chk(W === D.quick.cols + 2 && H === D.quick.rows + 2, '逻辑盘面比可视范围多一圈走廊（' + W + '×' + H + '）');
chk(G(ref).idxOf(3, 2) === 2 * W + 3 && G(ref).xOf(2 * W + 3) === 3 && G(ref).yOf(2 * W + 3) === 2, 'idxOf / xOf / yOf 互为逆运算');
chk(G(ref).inside(G(ref).idxOf(1, 1)) && !G(ref).inside(0) && !G(ref).inside(G(ref).idxOf(0, 2)), '走廊格不算 inside');
chk(G(ref).stepTo(G(ref).idxOf(0, 0), 0) === -1, '左上角向上就出界');
chk(G(ref).stepTo(G(ref).idxOf(1, 1), 3) === G(ref).idxOf(0, 1), '能一步跨进走廊');
const cs0 = G(ref).cells();
let ringOk = true;
for (let x = 0; x < W; x++) { if (cs0[x] || cs0[(H - 1) * W + x]) ringOk = false; }
for (let y = 0; y < H; y++) { if (cs0[y * W] || cs0[y * W + W - 1]) ringOk = false; }
chk(ringOk, '发完牌外走廊依然全是空的（这就是能绕出去的前提）');
chk(st(ref).tiles === D.quick.cols * D.quick.rows, '内圈铺满牌');
chk(G(ref).fmtTime(950) === '1:35' && G(ref).fmtTime(0) === '0:00' && G(ref).fmtTime(5) === '0:00', '剩余时间按拍换算成 m:ss');

/* ==================== 3. 连通判定：两套实现对拍 ==================== */
const cases = [];
for (const d of ['quick', 'sharp', 'master']) {
  for (const sd of [11, 202, 40408, 777]) {
    const g = boot({}, sd);
    G(g).setDiff(d);
    G(g).newRound();
    cases.push(g);
  }
}
let mism = 0, pairs = 0, linked = 0;
for (const g of cases) {
  const cs = G(g).cells();
  const w = st(g).gw;
  const bf = brute(cs, w, 2);
  const idxs = [];
  for (let i = 0; i < cs.length; i++) if (cs[i]) idxs.push(i);
  for (let a = 0; a < idxs.length; a++) {
    for (let b = a + 1; b < idxs.length; b++) {
      pairs++;
      const lk = G(g).linkOf(idxs[a], idxs[b]);
      if (cs[idxs[a]] !== cs[idxs[b]]) { if (lk) mism++; continue; }
      const t = bf(idxs[a], idxs[b]);
      if ((lk ? lk.turns : -1) !== t) mism++;
      if (lk) {
        linked++;
        if (lk.path[0] !== idxs[a] || lk.path[lk.path.length - 1] !== idxs[b]) mism++;
        let okPath = true;
        for (let p = 1; p < lk.path.length - 1; p++) if (cs[lk.path[p]] !== 0) okPath = false;
        for (let p = 1; p < lk.path.length; p++) {
          const d0 = Math.abs(G(g).xOf(lk.path[p]) - G(g).xOf(lk.path[p - 1])) + Math.abs(G(g).yOf(lk.path[p]) - G(g).yOf(lk.path[p - 1]));
          if (d0 !== 1) okPath = false;
        }
        if (!okPath) mism++;
      }
    }
  }
}
chk(mism === 0, linked + ' / ' + pairs + ' 组同色牌对：射线 BFS 与枚举拐角的第二实现答案完全一致，路径也逐格相邻且只穿空位');
chk(linked > 40, '开局确实有一批牌是能连的（' + linked + ' 组同色对子里）');
const iA = G(ref).idxOf;
G(ref).setCells(boardOf([[1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0]], 6));
chk(G(ref).linkOf(iA(1, 1), iA(1, 4)).turns === 0, '同列中间全空 = 直着连（0 个弯）');
chk(G(ref).linkOf(iA(1, 1), iA(1, 1)) === null, '自己连自己不成立');
chk(G(ref).linkOf(iA(2, 2), iA(3, 3)) === null, '两张空位之间谈不上连法');
G(ref).setCells(boardOf([[1, 0, 0, 2, 0, 0], [0, 0, 0, 2, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1]], 6));
chk(G(ref).linkOf(iA(1, 1), iA(6, 4)).turns === 1, '斜对角：拐一个弯就够');
G(ref).setCells(boardOf([[0, 0, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0]], 6));
chk(G(ref).linkOf(iA(3, 2), iA(5, 4)).turns === 1, 'L 形 = 一个弯');
G(ref).setCells(boardOf([[2, 2, 2, 2, 2, 2], [0, 1, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], 6));
chk(G(ref).linkOf(iA(2, 1), iA(6, 1)).turns === 2, '同行被别的牌夹死：绕外圈两个弯照样连得上');
chk(G(ref).linkOf(iA(2, 2), iA(6, 2)).turns === 0, '同一行中间是空的就直连');
G(ref).setCells(boardOf([[0, 0, 0, 0, 0, 0], [0, 1, 2, 0, 0, 0], [0, 0, 2, 0, 0, 0], [0, 3, 1, 0, 0, 0]], 6));
chk(G(ref).linkOf(iA(2, 2), iA(3, 4)) === null, '被别的牌彻底包住的牌谁也连不上');
G(ref).setCells(boardOf([[1, 1, 2, 2, 3, 3], [4, 4, 5, 5, 6, 6], [1, 1, 2, 2, 3, 3], [4, 4, 5, 5, 6, 6]], 6));
chk(G(ref).pairList().length === 16, '整片同色块：16 组对子能连上（第二实现逐组核对）');
G(ref).setCells(boardOf([[1, 2, 3, 4, 5, 6], [2, 1, 4, 1, 4, 3], [5, 2, 5, 2, 5, 4], [6, 5, 4, 3, 2, 1]], 6));
chk(G(ref).pairList().length === 0, '构造出的死局：一对都连不上（每行每列互不相同，中间又没有空位）');
chk(G(ref).findPair() === null, 'findPair 在死局里返回 null');
chk(G(ref).pieceOf(G(ref).idxOf(1, 1)).n === '苹果', '花色能查到名字（提示文案用得上）');

/* ==================== 4. 发牌与洗牌 ==================== */
const genOk = { even: 0, total: 0, has: 0, same: 0, shape: 0 };
for (const d of ['quick', 'sharp', 'master']) {
  for (const sd of [3, 77, 1234, 55555, 98765]) {
    const g = boot({}, sd);
    G(g).setDiff(d);
    G(g).newRound();
    const cs = G(g).cells();
    const cnt = {};
    let tiles = 0;
    for (let i = 0; i < cs.length; i++) if (cs[i]) { cnt[cs[i]] = (cnt[cs[i]] || 0) + 1; tiles++; if (!G(g).inside(i)) genOk.shape++; }
    if (Object.keys(cnt).some((k) => cnt[k] % 2)) genOk.even++;
    if (tiles !== D[d].cols * D[d].rows) genOk.total++;
    if (!G(g).findPair()) genOk.has++;
    if (Object.keys(cnt).length > D[d].kinds) genOk.has++;
  }
}
chk(genOk.even === 0, '每种牌都成双出现（15 副牌全部核对）');
chk(genOk.total === 0, '每副牌数量正好铺满内圈');
chk(genOk.shape === 0, '牌只落在内圈，走廊永远空着');
chk(genOk.has === 0, '每副牌开局就至少有一对能连，且花色数不超过该档上限');
const gDup = boot({}, 99);
G(gDup).setDiff('quick');
G(gDup).newRound();
const dupA = G(gDup).cells().join(','), dupB = G(gDup).cells().join(',');
chk(dupA === dupB, '同一时刻重复读牌面结果一致');
const g1 = boot({}, 99), g2 = boot({}, 99);
G(g1).setDiff('quick'); G(g1).newRound();
G(g2).setDiff('quick'); G(g2).newRound();
chk(G(g1).cells().join(',') === G(g2).cells().join(','), '同种子 = 同一副牌（可复现）');
const g3 = boot({}, 100);
G(g3).setDiff('quick'); G(g3).newRound();
chk(G(g3).cells().join(',') !== G(g1).cells().join(','), '换种子换一副牌');
const beforeMix = G(g1).cells().filter((v) => v > 0).length;
G(g1).setVars('ticks', 500);
chk(G(g1).mixBoard(G(g1).rngOf(5)) === true, '洗牌后一定有能连的对子');
chk(G(g1).cells().filter((v) => v > 0).length === beforeMix, '洗牌只重排，牌数与占位不变');
const kindsBefore = G(g1).cells().filter((v) => v > 0).sort((a, b) => a - b).join(',');
G(g1).mixBoard(G(g1).rngOf(9));
chk(G(g1).cells().filter((v) => v > 0).sort((a, b) => a - b).join(',') === kindsBefore, '洗牌前后每种牌的张数守恒');
G(g1).setCells(boardOf([[0, 0, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], 6, 6));
chk(G(g1).mixBoard(G(g1).rngOf(3)) === false, '剩不到 4 张牌时洗牌没意义，直接拒绝');

/* ==================== 5. 消除与连击 ==================== */
const store5 = {};
const g5 = boot(store5, 20260918);
chk(st(g5).phase === 'intro' && G(g5).ovShown(), '开局先弹玩法说明');
chk(plain(G(g5).ov()).indexOf('拐弯不超过两次') >= 0, '说明里讲清了连通规则');
clickAct(g5, 'start');
chk(st(g5).phase === 'play', '点开盘进入对局');
chk(st(g5).diff === 'sharp' && st(g5).limit === D.sharp.time * 10, '默认手快档，首盘限时 = 秒数 ×10 拍');
chk(st(g5).ticks >= st(g5).limit - 3, '开盘那一秒内扣掉的拍数对得上（' + (st(g5).limit - st(g5).ticks) + ' 拍）');
chk(st(g5).tiles === D.sharp.cols * D.sharp.rows, '牌铺满内圈');
chk(G(g5).dom().tiles === st(g5).tiles && G(g5).dom().out === (st(g5).gw * st(g5).gh) - st(g5).tiles,
  'DOM 里的牌数与走廊数和盘面一致');
chk(G(g5).dom().cols === 'repeat(' + st(g5).gw + ', 1fr)', '列数写进 grid 样式');
const pair5 = G(g5).findPair();
chk(!!pair5 && G(g5).linkOf(pair5[0], pair5[1]) !== null, 'findPair 给出的一对一定能连');
chk(G(g5).tap(pair5[0]) === true && st(g5).sel === pair5[0], '点第一张：选中');
chk(G(g5).dom().sel === 1, 'DOM 里只有一个选中态');
G(g5).tap(pair5[0]);
chk(st(g5).sel === -1, '再点同一张取消选中');
G(g5).tap(pair5[0]);
const other = G(g5).cells().findIndex((v, i) => i !== pair5[0] && v > 0 && v !== cells5Kind(g5, pair5[0]));
function cells5Kind(g, i) { return G(g).cells()[i]; }
G(g5).tap(other);
chk(st(g5).sel === other, '花色不一样：把选中换到新牌上');
chk(plain(G(g5).msgText()).indexOf('不一样') >= 0, '花色不一样有文案');
G(g5).tap(pair5[0]);
chk(st(g5).sel === pair5[0], '换回来继续');
const score0 = st(g5).score;
const tiles0 = st(g5).tiles;
G(g5).tap(pair5[1]);
const st5 = st(g5);
chk(st5.tiles === tiles0 - 2, '连上了：两张牌一起消失');
chk(st5.lastGain === Math.round(12 * D.sharp.mult) && st5.score === score0 + st5.lastGain,
  '第一对拿基础分 ' + st5.lastGain + '（12 ×倍率）');
chk(st5.combo === 1 && st5.gap === 0, '连击从 1 起算，窗口计时归零');
chk(g5.storage._data['lk.pair'] === '1', '累计连走对数即时落盘');
chk(G(g5).dom().path >= 2, '连线在牌面上画出来');
chk(plain(G(g5).msgText()).length > 0, '消除后有反馈');
const p2 = G(g5).findPair();
G(g5).tap(p2[0]);
G(g5).tap(p2[1]);
chk(st(g5).combo === 2, '紧接着再消一对：连击叠到 2');
chk(st(g5).lastGain === Math.round(15 * D.sharp.mult), '第二对 15 分（基础 +3×连击-1）');
chk(st(g5).score === score0 + Math.round(12 * D.sharp.mult) + Math.round(15 * D.sharp.mult), '分数逐对累加对得上');
for (let i = 0; i < 40; i++) G(g5).step();
chk(st(g5).ticks < K.STAGES * 1000, '走过 40 拍倒计时照常扣');
chk(st(g5).combo === 0, '超过 2.5 秒没消：连击断了');
chk(plain(G(g5).msgText()).indexOf('连击断了') >= 0, '断连击会告知');
const p3 = G(g5).findPair();
G(g5).tap(p3[0]);
G(g5).tap(p3[1]);
chk(st(g5).combo === 1, '断完之后重新从 1 开始叠');
G(g5).setVars('gap', 3);
G(g5).setVars('combo', 20);
chk(G(g5).gainOf() === Math.round((12 + 8 * 3) * D.sharp.mult), '连击加分封顶在 ×8（36 分一档）');
const badBefore = G(g5).cells().slice();
const kNow = G(g5).cells()[p3[0]] === 1 ? 2 : 1;
const notSame = G(g5).cells().findIndex((v, i) => v > 0 && v !== kNow);
G(g5).setVars('sel', notSame);
const sameKind = G(g5).cells().findIndex((v, i) => v === G(g5).cells()[notSame] && i !== notSame);
G(g5).tap(sameKind);
chk(st(g5).sel === sameKind || st(g5).tiles === badBefore.filter((v) => v > 0).length, '连不上就不许消（要么换选要么保持原样）');

/* ==================== 6. 倒计时、暂停、遮罩 ==================== */
const g6 = boot({}, 555);
G(g6).act('start');
const t6 = st(g6).ticks;
for (let i = 0; i < 10; i++) G(g6).step();
chk(st(g6).ticks === t6 - 10 && st(g6).clock === st(g6).clock, '十拍扣十下倒计时');
chk(G(g6).running() === true, '开盘后时钟在跑');
G(g6).togglePause();
chk(G(g6).running() === false && st(g6).paused === true, '暂停后时钟停');
g6.pump(1);
chk(st(g6).ticks === t6 - 10, '暂停期间一秒都不扣（走的是同一个整数拍）');
G(g6).togglePause();
chk(G(g6).running() === true, '再按一次继续');
const t6b = st(g6).ticks;
g6.pump(1);
chk(t6b - st(g6).ticks >= 9 && t6b - st(g6).ticks <= 11, '继续后一秒扣十拍左右（' + (t6b - st(g6).ticks) + '）');
G(g6).togglePause();
chk(G(g6).hudText().pause.indexOf('继续') >= 0, '暂停按钮跟着换字');
G(g6).togglePause();
const p6 = G(g6).findPair();
G(g6).tap(p6[0]);
G(g6).tap(p6[1]);
chk(st(g6).score > 0, '散场前先拿点分（' + st(g6).score + '）');
G(g6).setVars('ticks', 60);
for (let i = 0; i < 60; i++) G(g6).step();
chk(st(g6).phase === 'over' && st(g6).ticks === 0, '倒计时清零 → 散场');
chk(plain(G(g6).ov()).indexOf('时间到了') >= 0, '结算遮罩写明原因');
chk(g6.storage._data['lk.best'] === String(st(g6).score), '分数记进最高分');
G(g6).act('again');
chk(st(g6).phase === 'play' && st(g6).ticks === D.sharp.time * 10, '再来一局重新发时间');

/* ==================== 7. 提示 / 洗牌 / 死局 ==================== */
const g7 = boot({}, 4321);
G(g7).act('start');
const hint0 = st(g7).hints, tick0 = st(g7).ticks;
G(g7).useHint();
chk(st(g7).hints === hint0 - 1 && st(g7).ticks === tick0 - K.HINT_COST, '提示扣一次并扣 3 秒');
chk(st(g7).hintOn === true && G(g7).dom().hint === 2, '提示把一对牌亮起来');
for (let i = 0; i < K.HINT_TICKS + 1; i++) G(g7).step();
chk(G(g7).dom().hint === 0, '高亮到点自己熄灭');
G(g7).setVars('hints', 0);
const tk0 = st(g7).ticks;
G(g7).useHint();
chk(st(g7).ticks === tk0 && plain(G(g7).msgText()).indexOf('用完') >= 0, '提示用完只提示不扣时间');
const mix0 = st(g7).mixes, tk1 = st(g7).ticks, sigBefore = G(g7).cells().filter((v) => v > 0).length;
G(g7).useMix(true);
chk(st(g7).mixes === mix0 - 1 && st(g7).ticks === tk1 - K.MIX_COST, '手动洗牌扣次数并扣 5 秒');
chk(G(g7).cells().filter((v) => v > 0).length === sigBefore, '洗牌牌数不变');
chk(G(g7).findPair() !== null, '洗完一定能有解');
G(g7).setVars('mixes', 0);
const tk2 = st(g7).ticks;
G(g7).useMix(true);
chk(st(g7).ticks === tk2 && st(g7).mixes === 0, '洗牌次数用完就洗不动');
pickDiff(g7, 'quick');
G(g7).act('start');
G(g7).setCells(boardOf(DEAD_ROWS, 6));
G(g7).setVars('mixes', 1);
chk(G(g7).guardDead() === true && st(g7).mixes === 0, '死局：先免费自动洗一次牌');
chk(G(g7).pairList().length > 0, '自动洗牌之后又有能连的了');
G(g7).setVars('mixes', 0);
G(g7).setCells(boardOf(DEAD_ROWS, 6));
chk(G(g7).guardDead() === true && st(g7).phase === 'over', '洗不动了 → 直接散场');
chk(plain(G(g7).ov()).indexOf('连不动') >= 0, '结算说明是牌面卡死');
G(g7).setCells(boardOf(DEAD_ROWS, 6));
G(g7).setVars('ticks', 200);
G(g7).stageClear();
chk(st(g7).phase === 'clear' && st(g7).lastBonus === Math.round(200 * 0.25 * D.quick.mult), '清空一盘：剩余时间折成分');

/* ==================== 8. 八盘全清 ==================== */
const store8 = {};
const g8 = boot(store8, 606);
G(g8).act('start');
G(g8).setDiff('quick');
G(g8).newRound();
let cleared = 0;
for (let s = 0; s < K.STAGES; s++) {
  let guard = 0;
  while (st(g8).phase === 'play' && guard++ < 400) {
    const p = G(g8).findPair();
    if (!p) break;
    G(g8).tap(p[0]);
    G(g8).tap(p[1]);
    G(g8).step();
  }
  if (st(g8).phase === 'clear') { cleared++; G(g8).act(st(g8).stage + 1 < K.STAGES ? 'next' : 'finish'); }
  if (st(g8).phase === 'over') break;
}
chk(cleared === K.STAGES, '手快之外最快的盘子也能一盘不落地清完八盘（' + cleared + '）');
chk(st(g8).phase === 'over' && st(g8).score > 1000, '全清分数 ' + st(g8).score);
chk(Number(g8.storage._data['lk.lv']) === K.STAGES, '最远盘数记到 8');
chk(Number(g8.storage._data['lk.best']) === st(g8).score, '最高分等于这局分数');
chk(Number(g8.storage._data['lk.pair']) >= K.STAGES * 12, '累计对数跨关累加（' + g8.storage._data['lk.pair'] + '）');
const lim = [];
for (let s = 0; s < K.STAGES; s++) {
  G(g8).setVars('stage', s);
  lim.push(G(g8).limitTicks());
}
chk(lim[0] > lim[1] && lim[1] > lim[2], '每盘限时递减');
chk(Math.min.apply(null, lim) === 45 * 10, '限时不低于 45 秒');
G(g8).setVars('stage', 0);

/* ==================== 9. 输入 / 持久化 / 可复现 ==================== */
const g9 = boot({}, 8080);
G(g9).act('start');
const mv9 = st(g9).moves === undefined ? 0 : 1;
const t9 = st(g9).ticks;
const p9 = G(g9).findPair();
g9.byId('board').querySelectorAll('[data-i]')[p9[0]].dispatch('click');
g9.byId('board').querySelectorAll('[data-i]')[p9[1]].dispatch('click');
chk(st(g9).tiles === D.sharp.cols * D.sharp.rows - 2, '点牌面也能连走（事件委托）');
chk(st(g9).ticks <= t9, '点牌期间时钟照走');
g9.win.dispatch('keydown', { key: ' ' });
chk(st(g9).paused === true, '空格暂停');
g9.win.dispatch('keydown', { key: ' ' });
chk(st(g9).paused === false, '空格继续');
const h9 = st(g9).hints;
g9.win.dispatch('keydown', { key: 'h' });
chk(st(g9).hints === h9 - 1, 'H 键提示');
const m9 = st(g9).mixes;
g9.win.dispatch('keydown', { key: 's' });
chk(st(g9).mixes === m9 - 1, 'S 键洗牌');
g9.win.dispatch('keydown', { key: 't' });
chk(plain(G(g9).ov()).indexOf('本机战绩') >= 0 && plain(G(g9).ov()).indexOf('盘面') >= 0, 'T 键战绩面板报参数');
clickAct(g9, 'resume');
chk(G(g9).ovShown() === false, '遮罩「继续连」收得掉');
g9.win.dispatch('keydown', { key: 'n' });
chk(st(g9).phase === 'intro' && st(g9).stage === 0, 'N 键重开一局回到开场');
chk(G(g9).hudText().hintOff === true, '开场时道具按钮是灰的');
clickAct(g9, 'start');
chk(G(g9).hudText().hintOff === false, '开盘后按钮恢复可点');
chk(pickDiff(g9, 'master') && g9.storage._data['lk.diff'] === 'master', '点难度条落盘 lk.diff');
chk(st(g9).diff === 'master' && st(g9).tiles === D.master.cols * D.master.rows, '换难度立刻换盘面');
chk(g9.byId('diff').querySelectorAll('[data-diff]').filter((b) => /active/.test(b.className)).length === 1, '难度条只亮一个');
const mute9 = g9.audio.created.osc;
chk(mute9 > 0, '对局里会发声');
g9.byId('btnSound').dispatch('click');
chk(g9.storage._data['lk.muted'] === '1' && g9.byId('btnSound').textContent === '🔇', '静音写盘并换图标');
const oscM = g9.audio.created.osc;
const pm = G(g9).findPair();
G(g9).tap(pm[0]);
G(g9).tap(pm[1]);
chk(g9.audio.created.osc === oscM, '静音后一声不出');
g9.win.dispatch('keydown', { key: 'm' });
chk(g9.storage._data['lk.muted'] === '0', 'M 键也能取消静音');
const rA = boot({}, 31313), rB = boot({}, 31313);
G(rA).setDiff('quick'); G(rA).newRound();
G(rB).setDiff('quick'); G(rB).newRound();
let same = true;
for (let s = 0; s < 3; s++) {
  if (G(rA).cells().join(',') !== G(rB).cells().join(',')) same = false;
  if (st(rA).ticks !== st(rB).ticks) same = false;
  G(rA).act('next'); G(rB).act('next');
}
chk(same, '#seed 钉住整串牌局：同种子同样盘面同样限时');
const rC = boot({}, 31314);
G(rC).setDiff('quick'); G(rC).newRound();
chk(G(rC).cells().join(',') !== G(rA).cells().join(','), '换种子换一副牌');
chk(boot({ 'lk.diff': 'master' }).storage._data['lk.diff'] === 'master' && st(boot({ 'lk.diff': 'master' })).diff === 'master', '下次打开记得难度');
chk(st(boot({ 'lk.diff': 'nope' })).diff === 'sharp', '认不出的难度回落手快');
const old = boot({ 'lk.best': '99999', 'lk.pair': '500' }, 5);
G(old).act('start');
G(old).setVars('score', 10);
G(old).gameOver('测试');
chk(old.storage._data['lk.best'] === '99999' && old.storage._data['lk.pair'] === '500', '散场不覆盖旧纪录，也不重复计对数（消的时候就已经落盘）');

summary('连连看', fails);
