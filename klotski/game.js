/* 华容道 —— 四列五行的木匣里把曹操挪到出口
   机制：① 木块只能整格横竖滑，不能旋转、不能抬起来跨过、更不能重叠 —— 于是「这一关到底
        有没有解」根本不显然：出题先把曹操钉在出口随机塞盘（起点天然已解），再从这盘向外
        一层层铺开，专挑铺得最远那一层的局面当开局，所以发出去的每一盘都必定有解；
      ② 「最优 N 步」是现场 BFS 量出来的真最短：局面规范化（同类木块互换算同一盘），
        于是提示永远是正解的第一步，走得越贴最优这一关分越高；
      ③ 全场一个整数「拍」时钟（1 拍 = 0.1 秒）：倒计时按拍走，暂停与开遮罩冻住一切。
   收官是老祖宗的原题横刀立马 —— 开局固定，最优 112 步也是量好后写死的。
   纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 规则常量 ==================== */
var COLS = 4, ROWS = 5, N = COLS * ROWS;
var STEP_MS = 100;
var STAGES = 10;
var GOAL_X = 1, GOAL_Y = 3;   // 曹操左上角落在这格 = 到出口
var HINT_COST = 80;           // 请一次军师扣 8 秒
var STATE_CAP = 120000;       // 量最优步时的状态上限，撞上了就认输
var GEN_CAP = 60000;          // 出题预算：铺不到目标层就换一盘，别把浏览器跑僵
var TSZ = 1 << 18;            // 已见局面表：开放寻址，装载率压在 0.5 以下
var TMASK = TSZ - 1;
var SAMPLES = 8;              // 最外层最多留几个候选局面
var MAX_VERIFY = 20;          // 最多验几个候选的真最短
var MAX_TRIES = 8;            // 出题重摆次数

var KIND = {
  cao: { w: 2, h: 2 },
  gen: { w: 1, h: 2 },        // 竖将
  wide: { w: 2, h: 1 },       // 横将
  man: { w: 1, h: 1 },        // 兵
};
var LABEL = { cao: 1, gen: 2, wide: 3, man: 4 };   // 占用图里的类别标记（0 = 空格）
var DIRS = [
  { dx: 0, dy: -1, n: '上' }, { dx: 1, dy: 0, n: '右' },
  { dx: 0, dy: 1, n: '下' }, { dx: -1, dy: 0, n: '左' },
];
var GEN_NAMES = ['张飞', '赵云', '马超', '黄忠', '周仓'];
var WIDE_NAMES = ['关羽', '关平'];
var STAGE_NAMES = ['岔口', '伏兵', '拦路', '围堵', '断路', '铁桶', '锁江', '困兽', '十面', '横刀立马'];
/* 每关的木料配方（竖将/横将/小兵，曹操固定一块）。这是实测挑出来的：
   18 格只剩两个空位时最容易出死结，而横将太多（比如四横将）随机塞盘经常塞不进去，
   竖将超过五个又常常整盘卡成几十格的小连通块 —— 想要「最优四十步往上」只能选下面这些。 */
var STAGE_SPECS = [
  { gen: 2, wide: 1, man: 5 }, { gen: 3, wide: 1, man: 3 }, { gen: 2, wide: 2, man: 3 },
  { gen: 3, wide: 1, man: 5 }, { gen: 2, wide: 2, man: 5 }, { gen: 3, wide: 2, man: 2 },
  { gen: 4, wide: 1, man: 2 }, { gen: 4, wide: 1, man: 4 }, { gen: 2, wide: 3, man: 4 },
  { gen: 4, wide: 1, man: 4 },
];
var PAR_BAND = [
  [4, 12], [5, 14], [6, 16], [10, 20], [11, 24],
  [15, 28], [20, 34], [24, 40], [30, 52],
];
// 收官即老祖宗原题横刀立马：曹操居顶正中，四竖将占四角，关羽横刀拦腰，四兵堵死底心
var CLASSIC = [
  { k: 'cao', x: 1, y: 0 },
  { k: 'gen', x: 0, y: 0 }, { k: 'gen', x: 3, y: 0 }, { k: 'gen', x: 0, y: 3 }, { k: 'gen', x: 3, y: 3 },
  { k: 'wide', x: 1, y: 2 },
  { k: 'man', x: 1, y: 3 }, { k: 'man', x: 2, y: 3 }, { k: 'man', x: 1, y: 4 }, { k: 'man', x: 2, y: 4 },
];
var DIFFS = {
  story: { key: 'story', label: '慢慢挪', mult: 0.8, hints: 4, timeK: 2.2, pad: 46 },
  classic: { key: 'classic', label: '标准局', mult: 1, hints: 3, timeK: 1.7, pad: 28 },
  blitz: { key: 'blitz', label: '急行军', mult: 1.6, hints: 1, timeK: 1.25, pad: 14 },
};

function rngOf(seed) {
  var s = seed >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// FIXED_SEED：地址栏写 #seed=数字 就能钉住同一串关卡（同一盘棋比谁步数少）
var FIXED_SEED = (function () {
  var m = /seed=(\d+)/.exec((typeof location !== 'undefined' && location.hash) || '');
  return m ? (parseInt(m[1], 10) >>> 0) : 0;
})();
var seedBase = 0;

/* ==================== 纯规则：局面 / 滑动 / BFS ==================== */
/* 状态用一个扁平数组存：[x0,y0,x1,y1,...]，下标与 kinds 一一对应；kinds[0] 永远是 cao */
function flatOf(pieces) {
  var a = [];
  for (var i = 0; i < pieces.length; i++) a.push(pieces[i].x, pieces[i].y);
  return a;
}
function kindsOf(pieces) {
  var a = [];
  for (var i = 0; i < pieces.length; i++) a.push(pieces[i].k);
  return a;
}
function isGoal(flat) { return flat[0] === GOAL_X && flat[1] === GOAL_Y; }
/* 规范化：占用图本身就带着类别标记（空格 0、曹操 1、竖将 2、横将 3、兵 4），
   两个只差「同类木块互换」的局面画出来的图一模一样 —— 于是图即指纹。
   20 格每格 5 种取值，按五进制折成两个数再拼成一个整数（5^20 < 2^53，精确无损），
   比字符串快得多：BFS 一次要算上百万个指纹。 */
var P5 = [1, 5, 25, 125, 625, 3125, 15625, 78125, 390625, 1953125];
var B10 = 9765625;                 // 5^10
var KA = 0, KB = 0;                // 上一次 keyOf 算出的高低两段（热循环里省掉除法）
var DXS = [0, 1, 0, -1], DYS = [-1, 0, 1, 0];
var TA = new Int32Array(TSZ), TB = new Int32Array(TSZ);   // 空位标 -1，每次搜索前清一遍
function keyOf(g) {
  var a = 0, b = 0, i;
  for (i = 0; i < 10; i++) a += g[i] * P5[i];
  for (i = 10; i < N; i++) b += g[i] * P5[i - 10];
  KA = a; KB = b;
  return a * B10 + b;
}
/* 没见过的局面顺手记进表里：整数键的开放寻址表，比 Object 的数字键快好几倍
   —— BFS 一个局面要试几十次滑动，这里省一点，整局就省一大截 */
function seenPut(a, b) {
  var h = (Math.imul(a, 2654435761) ^ Math.imul(b, 40503)) & TMASK;
  var guard = 0;
  while (TA[h] !== -1) {
    if (TA[h] === a && TB[h] === b) return false;
    h = (h + 1) & TMASK;
    if (++guard > 4096) return false;      // 表挤爆了当成「走过」：宁缺不卡死（预算本来就远小于表容量）
  }
  TA[h] = a; TB[h] = b;
  return true;
}
function gridOf(flat, kinds) {
  var g = new Uint8Array(N);
  for (var i = 0; i < kinds.length; i++) {
    var k = KIND[kinds[i]], x = flat[2 * i], y = flat[2 * i + 1], v = LABEL[kinds[i]];
    for (var a = 0; a < k.h; a++) for (var b = 0; b < k.w; b++) g[(y + a) * COLS + x + b] = v;
  }
  return g;
}
/* 只查「前沿」那一列/行：它不可能是木块自己占的格子，所以带着自己的整张占用表也能直接判 */
function canSlide(g, flat, kinds, i, dir) {
  var k = KIND[kinds[i]], x = flat[2 * i], y = flat[2 * i + 1], d = DIRS[dir];
  var nx = x + d.dx, ny = y + d.dy, a, b;
  if (nx < 0 || ny < 0 || nx + k.w > COLS || ny + k.h > ROWS) return false;
  if (d.dx === 1) { for (a = 0; a < k.h; a++) if (g[(y + a) * COLS + nx + k.w - 1]) return false; }
  else if (d.dx === -1) { for (a = 0; a < k.h; a++) if (g[(y + a) * COLS + nx]) return false; }
  else if (d.dy === 1) { for (b = 0; b < k.w; b++) if (g[(ny + k.h - 1) * COLS + x + b]) return false; }
  else { for (b = 0; b < k.w; b++) if (g[ny * COLS + x + b]) return false; }
  return true;
}
/* 一层层往外推的搜索核心，两种用法共用一套推进：
     goal  —— 从当前局面正着走，撞上「曹操进出口」就收，得到真最短 + 整条最短路；
     depth —— 从钉好在出口的已解局面反着铺开，铺到第 want 层，把那一层的局面留几个当候选。
   maxDepth / maxStates 是止损预算：局面图（空格 0 + 类别标记）就是队列里的通行证，
   木块挪一步只改图上四格，所以一格一格增量地画比每次重画快得多。 */
function search(flat, kinds, maxDepth, maxStates, mode, rnd) {
  var lim = maxDepth > 0 ? maxDepth : 999;
  var cap = maxStates > 0 ? maxStates : STATE_CAP;
  var nn = kinds.length, pw = [], ph = [], pl = [], i, j;
  for (i = 0; i < nn; i++) { pw.push(KIND[kinds[i]].w); ph.push(KIND[kinds[i]].h); pl.push(LABEL[kinds[i]]); }
  var g = new Uint8Array(N);
  /* 把某个木块按新位置画进图里（v = 0 就是擦掉） */
  function stamp(qq, x, y, v) {
    for (var r = 0; r < ph[qq]; r++) for (var cc = 0; cc < pw[qq]; cc++) g[(y + r) * COLS + x + cc] = v;
  }
  function redraw(st) {
    for (var t = 0; t < N; t++) g[t] = 0;
    for (t = 0; t < nn; t++) stamp(t, st[2 * t], st[2 * t + 1], pl[t]);
  }
  TA.fill(-1); TB.fill(-1);
  var list = [flat], dep = [0], fa = [-1], mi = [-1], md = [-1];
  redraw(flat);
  keyOf(g);
  seenPut(KA, KB);
  if (mode !== 'depth' && isGoal(flat)) return { par: 0, path: [], states: 1 };
  var head = 0, goal = -1, lv = 0, samples = [], lvlN = 0, ix = 0;
  while (head < list.length) {
    if (list.length > cap) {
      return mode === 'depth'
        ? { depth: lv, samples: samples, states: list.length, overflow: true }
        : { par: -1, path: [], overflow: true, states: list.length };
    }
    var st = list[head], sd = dep[head];
    head++;
    if (sd + 1 > lim) continue;                     // 深度超预算：这层只见过的局面不再往下探
    redraw(st);
    for (ix = 0; ix < nn; ix++) {
      var x = st[2 * ix], y = st[2 * ix + 1], w = pw[ix], h = ph[ix];
      for (var dir = 0; dir < 4; dir++) {
        var nx = x + DXS[dir], ny = y + DYS[dir];
        if (nx < 0 || ny < 0 || nx + w > COLS || ny + h > ROWS) continue;
        var free = true, t2;
        if (dir === 1) { for (t2 = 0; t2 < h && free; t2++) if (g[(y + t2) * COLS + nx + w - 1]) free = false; }
        else if (dir === 3) { for (t2 = 0; t2 < h && free; t2++) if (g[(y + t2) * COLS + nx]) free = false; }
        else if (dir === 2) { for (t2 = 0; t2 < w && free; t2++) if (g[(ny + h - 1) * COLS + x + t2]) free = false; }
        else { for (t2 = 0; t2 < w && free; t2++) if (g[ny * COLS + x + t2]) free = false; }
        if (!free) continue;
        stamp(ix, x, y, 0);
        stamp(ix, nx, ny, pl[ix]);
        keyOf(g);
        var isNew = seenPut(KA, KB);
        stamp(ix, nx, ny, 0);
        stamp(ix, x, y, pl[ix]);
        if (!isNew) continue;
        var ns = st.slice();
        ns[2 * ix] = nx;
        ns[2 * ix + 1] = ny;
        list.push(ns); dep.push(sd + 1); fa.push(head - 1); mi.push(ix); md.push(dir);
        if (sd + 1 !== lv) { lv = sd + 1; samples = []; lvlN = 0; }   // 入队按层递增，换层就重攒
        if (mode === 'depth') {
          lvlN++;
          if (samples.length < SAMPLES) samples.push(ns);
          else if (rnd && rnd() < SAMPLES / lvlN) samples[Math.floor(rnd() * SAMPLES)] = ns;
        } else if (ix === 0 && nx === GOAL_X && ny === GOAL_Y) { goal = list.length - 1; break; }
      }
      if (goal >= 0) break;
    }
    if (goal >= 0) break;
  }
  if (mode === 'depth') return { depth: lv, samples: samples, states: list.length };
  if (goal < 0) return null;                        // 预算内走不到出口
  var path = [];
  for (j = goal; fa[j] >= 0; j = fa[j]) path.push({ i: mi[j], dir: md[j] });
  path.reverse();
  return { par: path.length, path: path, states: list.length };
}
function bfs(flat, kinds, maxDepth, maxStates) { return search(flat, kinds, maxDepth, maxStates, 'goal'); }

/* ==================== 纯规则：出题 ==================== */
function shuffled(list, rnd) {
  var a = list.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
/* 先把曹操钉死在出口，再把它余下的木块随机塞进空格 —— 起点天然「已解」 */
function packAtGoal(rnd, spec) {
  var kinds = ['cao'], flat = [GOAL_X, GOAL_Y];
  var i, j, a, b;
  var g = gridOf(flat, kinds);                      // 先只画曹操，塞一个标一个
  for (i = 0; i < spec.gen; i++) { kinds.push('gen'); flat.push(0, 0); }
  for (i = 0; i < spec.wide; i++) { kinds.push('wide'); flat.push(0, 0); }
  for (i = 0; i < spec.man; i++) { kinds.push('man'); flat.push(0, 0); }
  for (i = 1; i < kinds.length; i++) {
    var k = KIND[kinds[i]], spots = [];
    for (j = 0; j < N; j++) {
      var x = j % COLS, y = (j - x) / COLS;
      if (x + k.w > COLS || y + k.h > ROWS) continue;
      var free = true;
      for (a = 0; a < k.h && free; a++) for (b = 0; b < k.w; b++) if (g[(y + a) * COLS + x + b]) { free = false; break; }
      if (free) spots.push(j);
    }
    spots = shuffled(spots, rnd);
    if (!spots.length) return null;
    var c = spots[0];
    flat[2 * i] = c % COLS;
    flat[2 * i + 1] = (c - (c % COLS)) / COLS;
    for (a = 0; a < k.h; a++) for (b = 0; b < k.w; b++) g[flat[2 * i + 1] * COLS + flat[2 * i] + a * COLS + b] = LABEL[kinds[i]];
  }
  return { flat: flat, kinds: kinds };
}
/* ==================== 纯规则：出题 ==================== */
function nameFor(kinds, idx) {
  var g = 0, w = 0, i;
  for (i = 0; i < idx; i++) { if (kinds[i] === 'gen') g++; if (kinds[i] === 'wide') w++; }
  if (kinds[idx] === 'cao') return '曹操';
  if (kinds[idx] === 'gen') return GEN_NAMES[g % GEN_NAMES.length];
  if (kinds[idx] === 'wide') return WIDE_NAMES[w % WIDE_NAMES.length];
  return '兵';
}
function toPieces(flat, kinds) {
  var out = [];
  for (var i = 0; i < kinds.length; i++) {
    out.push({ k: kinds[i], x: flat[2 * i], y: flat[2 * i + 1], w: KIND[kinds[i]].w, h: KIND[kinds[i]].h, name: nameFor(kinds, i) });
  }
  return out;
}
/* 出题：随机塞一盘已解的 → 从它向外铺到目标层 → 挑最外层的局面当开局 → 正向量真最短。
   为什么不是「倒着随机走 K 步」：二十格塞得只剩两个空，随机走几步就在原地打转，
   八关里能走出的最优步往往只有一两步；按 BFS 层数挑，才真挑得到 N 步开外的死结。
   最外层的局面到「这一盘已解局面」正好 want 步，所以它的真最短天然 <= band[1]。 */
function genStage(rnd, spec, band) {
  var want = band[1], mid = (band[0] + band[1]) / 2, best = null, verified = 0;
  for (var t = 0; t < MAX_TRIES && verified < MAX_VERIFY; t++) {
    var packed = packAtGoal(rnd, spec);
    if (!packed) continue;
    var f = search(packed.flat, packed.kinds, want, GEN_CAP, 'depth', rnd);
    if (!f.samples.length) continue;
    for (var s = 0; s < f.samples.length && verified < MAX_VERIFY; s++) {
      var start = f.samples[s];
      if (isGoal(start)) continue;                  // 曹操自己还压在出口上 = 开局即通关
      verified++;
      var r = bfs(start, packed.kinds, want, GEN_CAP);
      if (!r || r.par < 0) continue;
      var cand = { pieces: toPieces(start, packed.kinds), par: r.par };
      if (r.par >= band[0]) return cand;
      if (!best || Math.abs(r.par - mid) < Math.abs(best.par - mid)) best = cand;
    }
  }
  return best;
}
function classicPieces() {
  var kinds = [], flat = [];
  for (var i = 0; i < CLASSIC.length; i++) { kinds.push(CLASSIC[i].k); flat.push(CLASSIC[i].x, CLASSIC[i].y); }
  return toPieces(flat, kinds);
}
var CLASSIC_PAR = 112;      // 原题横刀立马的真最短（一格算一步；测试用另一套 BFS 复核这个数）
function stagePar(pieces) {
  var r = bfs(flatOf(pieces), kindsOf(pieces));
  return r && r.par >= 0 ? r.par : 0;
}

/* ==================== 得分 ==================== */
function D() { return DIFFS[diff]; }
function timeLimit() { return Math.round((par * D().timeK + D().pad) * 10); }
function secLeft() { return Math.floor(Math.max(0, timeTicks) / 10); }
/* 步数效率：走得比最优多就越不值钱，最差也留四折，别把人气跑 */
function effOf() { return Math.max(0.4, Math.min(1, par / Math.max(moves, 1))); }
function levelGain() {
  var gain = Math.round((18 + par * 4.5 * effOf() + Math.min(90, secLeft()) * 1.1 + (hintsUsed ? 0 : 26)) * D().mult);
  return gain;
}
function fmtTime(ticks) {
  var s = Math.max(0, Math.ceil(ticks / 10));
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}

/* ==================== 基础设施 ==================== */
function byId(id) { return document.getElementById(id); }
var store = {
  get: function (k, dflt) {
    try { var v = localStorage.getItem(k); return v === null ? dflt : v; }
    catch (e) { return dflt; }
  },
  set: function (k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* 无痕模式静默降级 */ } },
};
function num(k) { var v = parseInt(store.get(k, '0'), 10); return isNaN(v) ? 0 : v; }
var SILENT = {
  resume: function () {}, toggle: function () { return false; }, setMuted: function () { return false; },
  isMuted: function () { return true; }, tone: function () {}, noise: function () {}, melody: function () {},
};
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'kl.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var boardEl = byId('board'), piecesEl = byId('pieces'), msgEl = byId('msg');
var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elPar = byId('par'), elSteps = byId('steps'), elClock = byId('clock'), elScore = byId('score');
var elHint = byId('hintN'), elUndo = byId('undoN'), btnHint = byId('btnHint'), btnUndo = byId('btnUndo'), btnPause = byId('btnPause');
var pieceEls = [];

/* ==================== 局面状态 ==================== */
var phase = 'intro';        // intro | play | clear | over
var diff = store.get('kl.diff', 'classic');
if (!DIFFS[diff]) diff = 'classic';
var pcs = [];               // 当前木块（下标 0 = 曹操）
var par = 0;                // 本关真实最优步
var stage = 0, score = 0, moves = 0, levelMoves = 0;
var timeTicks = 0, clock = 0, ticks2 = 0;
var hints = 0, hintsUsed = 0, undos = 0, undoStack = [];
var sel = -1, paused = false;
var hintMove = null, hintUntil = 0, lastGain = 0, nudge = -1, nudgeUntil = 0;
var drag = null;

/* ==================== 关卡流程 ==================== */
function newRound() {
  score = 0; moves = 0; stage = 0; undos = 0;
  seedBase = (FIXED_SEED || ((Date.now() >>> 0) ^ (Math.floor(Math.random() * 0xffffffff) >>> 0))) >>> 0;
  startStage(0);
}
function startStage(i) {
  stage = i;
  var spec = STAGE_SPECS[i], band = PAR_BAND[Math.min(i, PAR_BAND.length - 1)];
  if (i === STAGES - 1) {
    pcs = classicPieces();
    par = CLASSIC_PAR;                              // 原题的 112 步是提前 BFS 量好写死的，开局不必现算
  } else {
    var rnd = rngOf((seedBase + i * 7919) >>> 0);
    var made = genStage(rnd, spec, band);
    if (!made) { pcs = classicPieces(); par = stagePar(pcs); }
    else { pcs = made.pieces; par = made.par; }     // 出题时量过的就是真最短，别再量一遍
  }
  levelMoves = 0; hintsUsed = 0; undoStack = []; hints = D().hints;
  timeTicks = timeLimit();
  sel = 0; paused = false; hintMove = null;
  phase = 'play';
  if (stage + 1 > num('kl.lv')) store.set('kl.lv', stage + 1);
  buildBoard();
  hud();
  paint();
  msg('第 ' + (i + 1) + ' 关 · <b>' + STAGE_NAMES[i] + '</b> · ' + pcs.length + ' 块木料 · 最优 <b>' + par +
    '</b> 步 —— 把 曹操 拖到底下出口');
}
/* 挪一格：成功返回 true，并把这一步记进撤销栈与总步数 */
function tryStep(i, dir) {
  if (phase !== 'play' || paused || !pcs.length) return false;
  if (i < 0 || i >= pcs.length || dir < 0 || dir > 3) return false;
  var flat = flatOf(pcs), kinds = kindsOf(pcs), g = gridOf(flat, kinds);
  if (!canSlide(g, flat, kinds, i, dir)) {
    nudge = i; nudgeUntil = clock + 3;
    sfx.tone(190, 0.05, 'square', 0.07);
    sel = i;
    paint();
    msg('<span class="kl-bad">' + pcs[i].name + ' 挪不动</span>——' + DIRS[dir].n + '边被堵住了');
    return false;
  }
  undoStack.push({ i: i, x: pcs[i].x, y: pcs[i].y });
  pcs[i].x += DIRS[dir].dx;
  pcs[i].y += DIRS[dir].dy;
  moves++; levelMoves++;
  store.set('kl.step', num('kl.step') + 1);
  sel = i;
  hintMove = null;
  sfx.tone(300 + 26 * dir + pcs[i].w * 40, 0.035, 'triangle', 0.075);
  hud();
  paint();
  if (isGoal(flatOf(pcs))) { levelClear(); return true; }
  var left = Math.max(0, timeTicks);
  msg(pcs[i].name + ' 往' + DIRS[dir].n + ' · 已挪 <b>' + levelMoves + '</b> 步 / 最优 ' + par +
    ' 步 · 效率 <b>×' + effOf().toFixed(2) + '</b>' + (left <= 80 ? ' <span class="kl-warn">时间不多了</span>' : ''));
  return true;
}
function undoStep() {
  if (!undoStack.length) { msg('<span class="kl-bad">没有可撤销的步</span>'); return false; }
  var s = undoStack.pop();
  pcs[s.i].x = s.x; pcs[s.i].y = s.y;
  undos++;
  sel = s.i;
  sfx.tone(230, 0.04, 'sine', 0.06);
  hud();
  paint();
  msg('退回一步 —— <span class="kl-warn">步数不退，撤销只是给你重看局面</span>（累计撤销 ' + undos + ' 次）');
  return true;
}
function useHint() {
  if (phase !== 'play' || paused) return false;
  if (hints <= 0) { msg('<span class="kl-bad">军师请不动了</span>'); return false; }
  var r = bfs(flatOf(pcs), kindsOf(pcs));
  if (!r || !r.path.length) { msg('看不出路 —— 这一局大概是走不通了，换个思路'); return false; }
  hints--; hintsUsed++;
  timeTicks = Math.max(10, timeTicks - HINT_COST);
  hintMove = r.path[0];
  hintUntil = clock + 14;
  sfx.tone(760, 0.06, 'sine', 0.09);
  hud();
  paint();
  msg('军师说：把 <b>' + pcs[hintMove.i].name + '</b> 往' + DIRS[hintMove.dir].n +
    ' —— 照这条路走还剩 <b>' + r.par + '</b> 步（扣 8 秒）');
  return true;
}
function levelClear() {
  phase = 'clear';
  lastGain = levelGain();
  score += lastGain;
  if (score > num('kl.best')) store.set('kl.best', score);
  sfx.melody([523, 659, 784, 1047], 0.09, 'triangle');
  hud();
  var last = stage + 1 >= STAGES;
  show('<div class="ov-emoji">' + (last ? '🏆' : '🏮') + '</div><h2>' + (last ? '走出华容道' : '过关') + '</h2>' +
    '<p class="hint"><b>' + STAGE_NAMES[stage] + '</b> 拿下：曹操出匣用了 <b>' + levelMoves + '</b> 步，' +
    '最优 ' + par + ' 步，效率 <b>×' + effOf().toFixed(2) + '</b>，本关进账 <b>+' + lastGain + '</b> 分。</p>' +
    '<div class="kl-ov"><p>累计 <b>' + score + '</b> 分 · 第 ' + (stage + 1) + '/' + STAGES + ' 关 · 剩余 ' + fmtTime(timeTicks) + '</p>' +
    '<p>下一关木料更多，两个空位照样挤得你喘不过气。</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="' + (last ? 'finish' : 'next') + '">' +
    (last ? '收工结算' : '下一关 ▶') + '</button>' +
    '<button class="ghost" data-act="again">重开一局</button></div>');
}
function finishRun() {
  phase = 'over';
  if (score > num('kl.best')) store.set('kl.best', score);
  show('<div class="ov-emoji">🏆</div><h2>关云长义释曹操</h2>' +
    '<p class="hint">十关全走通，累计 <b>' + score + '</b> 分 —— 一共挪了 <b>' + moves + '</b> 步，撤销 ' + undos + ' 次。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function gameOver(reason) {
  phase = 'over';
  if (score > num('kl.best')) store.set('kl.best', score);
  sfx.tone(150, 0.2, 'sawtooth', 0.09);
  hud();
  show('<div class="ov-emoji">⌛</div><h2>' + reason + '</h2>' +
    '<div class="kl-ov"><p>这一局 <b>' + score + '</b> 分 · 走到第 ' + (stage + 1) + '/' + STAGES + ' 关（' + STAGE_NAMES[stage] + '）</p>' +
    '<p>本关挪了 ' + levelMoves + ' 步，最优 ' + par + ' 步 · 累计挪步 ' + num('kl.step') + ' 步</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function togglePause() {
  if (phase !== 'play') return;
  paused = !paused;
  if (btnPause) btnPause.innerHTML = paused ? '▶<span>继续</span>' : '⏸<span>暂停</span>';
  if (paused) show('<h2>暂停</h2><p class="hint">木块不动，计时的表也不走。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="resume">继续挪</button></div>');
  else hide();
  hud();
}

/* ==================== 渲染 ==================== */
function buildBoard() {
  if (!piecesEl) return;
  var html = '';
  for (var i = 0; i < pcs.length; i++) {
    html += '<div class="kl-piece" data-i="' + i + '">' + pcs[i].name + '</div>';
  }
  piecesEl.innerHTML = html;
  pieceEls = piecesEl.querySelectorAll('.kl-piece');
}
function pct(v, total) { return (v * 100 / total) + '%'; }
function paint() {
  if (!pieceEls.length) return;
  for (var i = 0; i < pcs.length && i < pieceEls.length; i++) {
    var el = pieceEls[i], p = pcs[i];
    el.style.left = pct(p.x, COLS);
    el.style.top = pct(p.y, ROWS);
    el.style.width = pct(p.w, COLS);
    el.style.height = pct(p.h, ROWS);
    var cls = 'kl-piece ' + p.k;
    if (i === sel) cls += ' sel';
    if (hintMove && hintMove.i === i && clock < hintUntil) cls += ' hint';
    if (nudge === i && clock < nudgeUntil) cls += ' nudge';
    if (el.className !== cls) el.className = cls;
  }
}
function hud() {
  if (!elLv) return;
  elLv.textContent = stage + 1;
  elPar.textContent = par;
  elSteps.textContent = levelMoves;
  elClock.textContent = fmtTime(timeTicks);
  elClock.className = 'value ' + (timeTicks <= 100 ? 'bad warn' : 'warn');
  elScore.textContent = score;
  elHint.textContent = hints;
  elUndo.textContent = undoStack.length;
  if (btnHint) btnHint.disabled = phase !== 'play' || hints <= 0 || paused;
  if (btnUndo) btnUndo.disabled = phase !== 'play' || !undoStack.length || paused;
}
function msg(html) { if (msgEl) msgEl.innerHTML = html; }
function show(html) {
  if (!ovContent) return;
  ovContent.innerHTML = html;
  overlayEl.classList.add('show');
}
function hide() { if (overlayEl) overlayEl.classList.remove('show'); }
function ovShown() { return overlayEl && overlayEl._cls && overlayEl._cls.indexOf('show') >= 0; }
function intro() {
  phase = 'intro';
  hud();
  show('<div class="ov-emoji">🏮</div><h2>华容道</h2>' +
    '<p class="hint">曹操败走华容道，关羽在这儿把关。<b>木块只能整格横竖滑</b>：不能旋转、不能抬起跨过、' +
    '更不能重叠。四个竖将两格长，关羽横着一格长，兵卒一格 —— 二十个格子只留<b>两个空位</b>，' +
    '所以每一步都得先想好退路。<br>' +
    '把 <b>曹操</b> 拖到底部正中的 <b>华容道口</b> 就过关。招牌上的「最优」是 BFS 量出来的真最短（收官原题那 112 步也是量好后写死的），' +
    '走得越贴它分越高。<b>' + STAGES + '</b> 关越来越挤，收官是老祖宗的原题 <b>横刀立马</b>。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开匣</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function stats() {
  show('<h2>本机战绩</h2><div class="kl-ov">' +
    '<p>最高分 <b>' + Math.max(num('kl.best'), score) + '</b> 分 · 难度 <b>' + D().label + '</b></p>' +
    '<p>这一局：' + score + ' 分 · 第 ' + (stage + 1) + '/' + STAGES + ' 关 · 累计挪步 <b>' + num('kl.step') + '</b> 步</p>' +
    '<p>本关最优 <b>' + par + '</b> 步 · 已挪 ' + levelMoves + ' 步 · 效率 ×' + effOf().toFixed(2) + ' · 剩余 ' + fmtTime(timeTicks) + '</p>' +
    '<p>限时 =（最优步 × ' + D().timeK + ' + ' + D().pad + '）秒 · 军师 ' + D().hints + ' 次/关（扣 8 秒） · 倍率 ×' + D().mult + '</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="' +
    (phase === 'clear' ? (stage + 1 < STAGES ? 'next' : 'finish') : phase === 'play' ? 'resume' : 'again') + '">' +
    (phase === 'play' ? '继续挪' : phase === 'clear' ? (stage + 1 < STAGES ? '下一关 ▶' : '收工结算') : '再来一局') +
    '</button></div>');
}
function act(name) {
  if (name === 'start' || name === 'again') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'next') { hide(); startStage(stage + 1); return; }
  if (name === 'finish') { hide(); finishRun(); return; }
  if (name === 'resume') {
    hide();
    if (phase === 'play') { paused = false; if (btnPause) btnPause.innerHTML = '⏸<span>暂停</span>'; }
    hud();
    paint();
    return;
  }
  if (name === 'stats') { stats(); return; }
}

/* ==================== 输入 ==================== */
function cellMetrics() {
  var r = boardEl && boardEl.getBoundingClientRect ? boardEl.getBoundingClientRect() : { width: 340, height: 425 };
  var w = (r.width || 340) / COLS, h = (r.height || 425) / ROWS;
  return { w: w || 85, h: h || 85 };
}
function dragStep(ev) {
  if (!drag || phase !== 'play' || paused) return;
  var m = cellMetrics();
  var dx = (ev.clientX - drag.x0) / m.w, dy = (ev.clientY - drag.y0) / m.h;
  if (!drag.axis) {
    if (Math.abs(dx) < 0.55 && Math.abs(dy) < 0.55) return;
    drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }
  for (var guard = 0; guard < 3; guard++) {
    if (drag.axis === 'x') {
      var wantX = Math.round(dx);
      if (wantX > drag.done) { if (!tryStep(drag.i, 1)) break; drag.done++; }
      else if (wantX < drag.done) { if (!tryStep(drag.i, 3)) break; drag.done--; }
      else break;
    } else {
      var wantY = Math.round(dy);
      if (wantY > drag.done) { if (!tryStep(drag.i, 2)) break; drag.done++; }
      else if (wantY < drag.done) { if (!tryStep(drag.i, 0)) break; drag.done--; }
      else break;
    }
  }
}
if (piecesEl) {
  piecesEl.addEventListener('pointerdown', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-i]') : null;
    if (!t) return;
    sfx.resume();
    var i = +t.dataset.i;
    sel = i;
    drag = { i: i, x0: ev.clientX || 0, y0: ev.clientY || 0, done: 0, axis: '' };
    paint();
    hud();
    if (ev.preventDefault) ev.preventDefault();
  });
}
if (window.addEventListener) {
  window.addEventListener('pointermove', function (ev) { dragStep(ev); });
  window.addEventListener('pointerup', function () { drag = null; });
  window.addEventListener('pointercancel', function () { drag = null; });
}
if (boardEl) {
  boardEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-i]') : null;
    if (!t) return;
    sel = +t.dataset.i;
    paint();
    msg('选中 <b>' + pcs[sel].name + '</b>（' + pcs[sel].w + '×' + pcs[sel].h + '）· 拖它，或者用方向键');
  });
}
window.addEventListener('keydown', function (ev) {
  var k = ev.key;
  if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); return; }
  if (k === 't' || k === 'T') { stats(); return; }
  if (k === 'n' || k === 'N') { newRound(); intro(); return; }
  if (k === 'Escape') { if (phase === 'play' && ovShown()) hide(); return; }
  if (phase === 'intro') { if (k === 'Enter' || k === ' ') act('start'); return; }
  if (phase === 'clear') { if (k === 'Enter' || k === ' ') act(stage + 1 < STAGES ? 'next' : 'finish'); return; }
  if (phase === 'over') { if (k === 'Enter' || k === ' ') act('again'); return; }
  if (phase !== 'play') return;
  if (k === ' ') { ev.preventDefault && ev.preventDefault(); togglePause(); return; }
  if (k === 'h' || k === 'H') { useHint(); return; }
  if (k === 'u' || k === 'U') { undoStep(); return; }
  if (k === 'Tab') {
    ev.preventDefault && ev.preventDefault();
    sel = pcs.length ? (sel + 1) % pcs.length : -1;
    paint();
    if (sel >= 0) msg('换成 <b>' + pcs[sel].name + '</b>');
    return;
  }
  var map = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
  if (!(k in map)) return;
  ev.preventDefault && ev.preventDefault();
  if (sel < 0) sel = 0;
  tryStep(sel, map[k]);
});
if (btnHint) btnHint.addEventListener('click', function () { sfx.resume(); useHint(); });
if (btnUndo) btnUndo.addEventListener('click', function () { sfx.resume(); undoStep(); });
if (btnPause) btnPause.addEventListener('click', function () { sfx.resume(); togglePause(); });
if (byId('btnStats')) byId('btnStats').addEventListener('click', stats);
if (byId('btnNew')) byId('btnNew').addEventListener('click', function () { newRound(); intro(); });
if (soundBtn) soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });
if (overlayEl) {
  overlayEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (t) act(t.dataset.act);
  });
}
(function () {
  var btns = byId('diff').querySelectorAll('[data-diff]');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-diff]') : null;
      if (!b || !DIFFS[b.dataset.diff]) return;
      diff = b.dataset.diff;
      store.set('kl.diff', diff);
      syncDiff();
      newRound();
      intro();
    });
  }
})();
function syncDiff() {
  var btns = byId('diff').querySelectorAll('[data-diff]');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
}

/* ==================== 主循环：整数拍 ==================== */
function running() { return phase === 'play' && !paused && !ovShown(); }
function step() {
  clock++;
  timeTicks--;
  if (timeTicks <= 0) { timeTicks = 0; hud(); paint(); gameOver('时间到了，曹操没挤出去'); return; }
  if (timeTicks === 100) msg('<span class="kl-warn">只剩 10 秒了</span>');
  if (clock >= hintUntil && hintMove) hintMove = null;
  hud();
  paint();
}
var prev = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
var acc = 0;
function frame(now) {
  rafId = window.requestAnimationFrame(frame);
  var dt = Math.min(now - prev, 2000);
  if (dt < 0) dt = 0;
  prev = now;
  if (!running()) { acc = 0; return; }
  acc += dt;
  var guard = 0;
  while (acc >= STEP_MS && guard++ < 20) { acc -= STEP_MS; step(); }
}
var rafId = 0;
if (window.requestAnimationFrame) rafId = window.requestAnimationFrame(frame);

/* ==================== 开局 ==================== */
syncSound();
syncDiff();
newRound();
intro();
})();
