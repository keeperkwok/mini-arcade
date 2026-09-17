/* 移个车先 —— 6×6 停车场里的 Rush Hour：每辆车只能沿自己车头那根轴滑，滑多远都只算一次；
   把红色那辆开到右边的 🚪 就算出库。
   机制：① 关卡是「从终局倒着随机走」生成的 —— 滑动是可逆的，所以倒着走出来的局面一定回得去，
   不存在死局；② par 是现场 BFS 算出的「最少挪几次」，提示用的也是同一套 BFS，所以提示永远是最优一步；
   ③ 分数只跟「比最优多挪了几次」较劲，背板没有意义，因为每关都是当场生成的。纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 常量与关卡规格 ==================== */
var N = 6, EXIT_Y = 2, RED = 0, STAGES = 10;
var CELL = 100 / N;
var DIFFS = {
  crawl: { label: '慢慢挪', cars: 6, band: 3, hints: 3, mult: 0.8 },
  jam: { label: '早高峰', cars: 8, band: 4, hints: 2, mult: 1 },
  gridlock: { label: '大堵车', cars: 10, band: 6, hints: 1, mult: 1.7 },
};
var PAINT = [
  ['#f87171', '#b91c1c'], ['#fbbf24', '#b45309'], ['#34d399', '#047857'],
  ['#38bdf8', '#0369a1'], ['#a78bfa', '#6d28d9'], ['#f472b6', '#be185d'],
  ['#94a3b8', '#475569'], ['#4ade80', '#15803d'], ['#fb923c', '#c2410c'],
];
var FACE = ['🚗', '🚙', '🚕', '🚓', '🚌', '🚚', '🛻', '🏎️', '🚐'];

/* ==================== 纯逻辑：车与格子 ==================== */
function isH(v) { return v.dir === 0; }
function posOf(v) { return isH(v) ? v.x : v.y; }
function setPos(v, p) { if (isH(v)) v.x = p; else v.y = p; }
function cellIdx(x, y) { return y * N + x; }
function cellsAt(v, p) {
  var out = [];
  for (var k = 0; k < v.len; k++) out.push(isH(v) ? cellIdx(p + k, v.y) : cellIdx(v.x, p + k));
  return out;
}
// 除 skip 之外所有车占的格子
function fillGrid(vs, arr, grid, skip) {
  for (var i = 0; i < grid.length; i++) grid[i] = 0;
  for (var k = 0; k < vs.length; k++) {
    if (k === skip) continue;
    var cs = cellsAt(vs[k], arr[k]);
    for (var c = 0; c < cs.length; c++) grid[cs[c]] = 1;
  }
}
function fits(vs, arr, i, p, grid) {
  var cs = cellsAt(vs[i], p);
  for (var c = 0; c < cs.length; c++) if (grid[cs[c]]) return false;
  return true;
}
// 车辆 i 沿自己那根轴能到的连续区间（滑东西不能穿车，所以是一段连着的）
function rangeOf(vs, arr, i, grid) {
  fillGrid(vs, arr, grid, i);
  var lo = arr[i], hi = arr[i], last = vs[i].len - 1;
  while (lo > 0 && fits(vs, arr, i, lo - 1, grid)) lo--;
  while (hi < N - last - 1 && fits(vs, arr, i, hi + 1, grid)) hi++;
  return [lo, hi];
}

/* ==================== BFS：整张滑动图上逐层铺开 ====================
   状态 = 每辆车沿自己轴的坐标。图是无向的（滑过去就能滑回来），所以
   「从终局往外铺」和「从题目往终局铺」得到的是同一套最短距离。 */
function bfsAll(base, start, cap, stopWhen) {
  var grid = new Array(N * N);
  var dist = {}, parent = {}, queue = [start.slice()], head = 0, n = 1;
  var sk = start.join(',');
  dist[sk] = 0;
  while (head < queue.length && n < cap) {
    var a = queue[head++], key = a.join(','), d = dist[key];
    if (stopWhen && stopWhen(a, d)) return { dist: dist, parent: parent, at: a, moves: d, full: true };
    for (var i = 0; i < base.length; i++) {
      var r = rangeOf(base, a, i, grid);
      for (var p = r[0]; p <= r[1]; p++) {
        if (p === a[i]) continue;
        var next = a.slice();
        next[i] = p;
        var nk = next.join(',');
        if (dist[nk] !== undefined) continue;
        dist[nk] = d + 1;
        parent[nk] = [key, i, p];
        queue.push(next);
        if (++n >= cap) break;
      }
      if (n >= cap) break;
    }
  }
  return { dist: dist, parent: parent, at: null, moves: -1, full: n < cap };
}
function firstMove(res) {
  var chain = [], key = res.at.join(','), guard = 0;
  while (res.parent[key] && guard++ < 400) {
    var p = res.parent[key];
    chain.unshift({ i: p[1], to: p[2] });
    key = p[0];
  }
  return chain.length ? chain[0] : null;
}
// 从当前局面求「最少挪几次能把红车放出去」，顺带给出最优第一步
function solve(vs, cap) {
  var goal = N - vs[RED].len;
  var res = bfsAll(vs, vs.map(posOf), cap || 20000, function (a) { return a[RED] === goal; });
  if (!res.at) return null;
  return { moves: res.moves, first: res.moves ? firstMove(res) : null };
}

/* ==================== 出题：从终局倒推 ==================== */
function rngOf(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 摆 count 辆车：红车先停在出口口上；横车不许进入出口行（进去了就永远挡路，
// 会把整张滑动图压扁），竖车可以横穿出口行 —— 深度就是从「谁来给竖车让路」里长出来的
function placeCars(count, rnd, gates) {
  var vs = [{ x: N - 2, y: EXIT_Y, len: 2, dir: 0 }];
  var used = new Array(N * N);
  var red = cellsAt(vs[0], vs[0].x);
  for (var r = 0; r < red.length; r++) used[red[r]] = 1;
  // 先立几辆「门」：竖着跨过出口行，红车非把它们挪开不可 —— 深度就是从这儿长出来的
  for (var t = 0; t < (gates || 0) && t < count - 1; t++) {
    var col = Math.floor(rnd() * (N - 2));
    var len = rnd() < 0.6 ? 2 : 3;
    var lo = Math.max(0, Math.min(EXIT_Y - len + 1, N - len));
    var hi = Math.min(EXIT_Y, N - len);
    var y0 = lo + Math.floor(rnd() * (hi - lo + 1)), ok = true;
    for (var k = 0; k < len; k++) if (used[cellIdx(col, y0 + k)]) ok = false;
    if (!ok) continue;
    for (var k2 = 0; k2 < len; k2++) used[cellIdx(col, y0 + k2)] = 1;
    vs.push({ x: col, y: y0, len: len, dir: 1 });
  }
  for (var guard = 0; vs.length < count && guard < 200; guard++) {
    var dir = rnd() < 0.5 ? 0 : 1;
    var len = rnd() < 0.7 ? 2 : 3;
    var hi = N - len;
    var pool = [];
    for (var across = 0; across < N; across++) {
      if (dir === 0 && across === EXIT_Y) continue;
      var weight = Math.abs(across - EXIT_Y) <= 1 ? 3 : 1;
      for (var along = 0; along <= hi; along++) {
        var cand = dir === 0 ? { x: along, y: across, len: len, dir: 0 } : { x: across, y: along, len: len, dir: 1 };
        var mine = cellsAt(cand, posOf(cand)), ok = true;
        for (var k = 0; k < mine.length; k++) if (used[mine[k]]) { ok = false; break; }
        if (!ok) continue;
        for (var w = 0; w < weight; w++) pool.push(cand);
      }
    }
    if (!pool.length) continue;
    guard = 0;
    var pick = pool[Math.floor(rnd() * pool.length)];
    var cs = cellsAt(pick, posOf(pick));
    for (var c = 0; c < cs.length; c++) used[cs[c]] = 1;
    vs.push(pick);
  }
  return vs.length === count ? vs : null;
}
function materialize(base, arr) {
  return base.map(function (v, i) {
    return isH(v) ? { x: arr[i], y: v.y, len: v.len, dir: 0 } : { x: v.x, y: arr[i], len: v.len, dir: 1 };
  });
}
function fallbackVs() {
  return [{ x: 0, y: EXIT_Y, len: 2, dir: 0 }, { x: 4, y: 1, len: 2, dir: 1 }];
}
/* 深度怎么量：胜利条件是「红车滑到出口」这一整族状态，不是某一个终局。
   所以先把连通分量铺开，再从所有「红车已经在出口」的状态同时反向铺一层，
   每个状态拿到的层号才是它真正的最少挪车次数。分量太大铺不满时退回启发式，
   反正最终 par 一定由 solve() 现场复核一遍。 */
function reachFrom(base, start, cap) {
  var spread = bfsAll(base, start, cap, null);
  if (!spread.full) return { map: spread.dist, exact: false };
  var grid = new Array(N * N);
  var goal = N - base[RED].len;
  var d2 = {}, queue = [], head = 0;
  for (var key in spread.dist) {
    var parts = key.split(',');
    if (+parts[RED] === goal) {
      d2[key] = 0;
      queue.push(parts.map(function (x) { return +x; }));
    }
  }
  while (head < queue.length) {
    var a = queue[head++], d = d2[a.join(',')];
    for (var i = 0; i < base.length; i++) {
      var r = rangeOf(base, a, i, grid);
      for (var p = r[0]; p <= r[1]; p++) {
        if (p === a[i]) continue;
        var next = a.slice();
        next[i] = p;
        var nk = next.join(',');
        if (d2[nk] !== undefined || spread.dist[nk] === undefined) continue;
        d2[nk] = d + 1;
        queue.push(next);
      }
    }
  }
  return { map: d2, exact: true };
}
function pickDeep(base, floor, cap, rnd) {
  var reach = reachFrom(base, base.map(posOf), cap);
  var dmap = reach.map;
  var found = [], maxd = 0;
  for (var key in dmap) {
    var d = dmap[key];
    if (+key.split(',')[RED] >= N - base[RED].len) continue;
    if (d > maxd) maxd = d;
    if (d >= floor) found.push({ key: key, d: d });
  }
  if (!found.length) return null;
  var tier = [];
  for (var i = 0; i < found.length; i++) if (found[i].d >= maxd - 2) tier.push(found[i]);
  var chosen = tier[Math.floor(rnd() * tier.length)];
  return { arr: chosen.key.split(',').map(function (v) { return +v; }), d: chosen.d, maxd: maxd, exact: reach.exact };
}
function materialize(base, arr) {
  return base.map(function (v, i) {
    return isH(v) ? { x: arr[i], y: v.y, len: v.len, dir: 0 } : { x: v.x, y: arr[i], len: v.len, dir: 1 };
  });
}
function fallbackVs() {
  return [{ x: 0, y: EXIT_Y, len: 2, dir: 0 }, { x: 4, y: 1, len: 2, dir: 1 }];
}
function genPuzzle(sp) {
  var rnd = rngOf(sp.seed), best = null;
  for (var a = 0; a < sp.attempts; a++) {
    var base = placeCars(sp.cars, rnd, sp.gates);
    if (!base) continue;
    var deep = pickDeep(base, 3, sp.cap || 12000, rnd);
    if (!deep) continue;
    var vs = materialize(base, deep.arr);
    // par 只认正向 BFS 的结果：量不准（分量太大铺不满）就丢掉这一副牌，宁可重摆
    var check = solve(vs, 30000);
    if (check && check.moves >= 2 && (!best || check.moves > best.par)) best = { vs: vs, par: check.moves };
    if (best && best.par >= sp.band) break;
  }
  if (!best) best = { vs: fallbackVs(), par: 2 };
  return best;
}

/* ==================== 存储 / 音效 / DOM ==================== */
function byId(id) { return document.getElementById(id); }
var store = {
  get: function (k, dflt) {
    try { var v = localStorage.getItem(k); return v === null ? dflt : v; }
    catch (e) { return dflt; }
  },
  set: function (k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* 无痕模式静默降级 */ } },
};
function num(k) { var v = parseInt(store.get(k, '0'), 10); return isNaN(v) ? 0 : v; }

var SILENT = { tone: function () {}, melody: function () {}, noise: function () {},
  toggle: function () { return true; }, isMuted: function () { return true; }, setMuted: function () {}, resume: function () {} };
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'pk.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var cellLayer = byId('cells'), carLayer = byId('cars'), msgEl = byId('msg');
var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elUsed = byId('used'), elPar = byId('par'), elScore = byId('score');
var elHint = byId('hintN'), elUndo = byId('undoN'), btnHint = byId('btnHint'), btnUndo = byId('btnUndo');

/* ==================== 局面 ==================== */
var diff = 'dark';
if (DIFFS[store.get('pk.diff', '')]) diff = store.get('pk.diff', 'dark'); else diff = 'jam';
function D() { return DIFFS[diff]; }
var stage, vs, par, used, score, hints, hintUsed, hist, sel, drag, hintMove, phase = 'intro', lastGain = 0;

// FIXED_SEED：地址栏里写 #seed=数字 就能钉住一整串关卡（同一天同一题），不写就是每场随机
var FIXED_SEED = (function () {
  var m = /seed=(\d+)/.exec((typeof location !== 'undefined' && location.hash) || '');
  return m ? (parseInt(m[1], 10) >>> 0) : 0;
})();

function spec(i) {
  var d = D();
  return {
    cars: Math.min(11, d.cars + Math.floor(i / 4)),
    band: d.band + Math.floor(i * 0.5),
    gates: Math.min(3, Math.max(1, Math.floor((i + 1) / 2))),
    cap: 12000,
    seed: ((FIXED_SEED || Math.floor(Math.random() * 2147483647)) + i * 7919) >>> 0,
    attempts: 6,
  };
}
function newRound() { score = 0; startStage(0); }
function startStage(i) {
  stage = i;
  var sp = spec(i);
  var p = genPuzzle(sp);
  vs = p.vs;
  par = p.par;
  used = 0; hints = D().hints; hintUsed = 0; hist = []; sel = null; drag = null; hintMove = null;
  phase = 'play';
  buildCars();
  hud(); render();
  msg('一共有 <b>' + vs.length + '</b> 辆车堵在这儿，最少挪 <b>' + par + '</b> 次能把红车放出去');
}
function resetStage() {
  // 撤销到原样：把每辆车开回出生点
  for (var k = hist.length - 1; k >= 0; k--) setPos(vs[hist[k].i], hist[k].from);
  used = 0; hist = []; sel = null; hintMove = null;
  hud(); render();
}

/* ==================== 走子 ==================== */
function rangeNow(i) {
  var arr = vs.map(posOf), grid = new Array(N * N);
  return rangeOf(vs, arr, i, grid);
}
function occupyMap() {
  var grid = new Array(N * N), arr = vs.map(posOf);
  for (var k = 0; k < vs.length; k++) {
    var cs = cellsAt(vs[k], arr[k]);
    for (var c = 0; c < cs.length; c++) grid[cs[c]] = k;
  }
  return grid;
}
function vehicleAt(idx) {
  var grid = occupyMap();
  return grid[idx] === undefined || grid[idx] === null ? -1 : grid[idx] - 0;
}
function slide(i, to) {
  if (phase !== 'play') return false;
  var cur = posOf(vs[i]);
  if (to === cur) return false;
  var r = rangeNow(i);
  if (to < r[0] || to > r[1]) { sfx.noise(0.05, 0.05); msg('这辆车<b>只能沿车头那根轴</b>滑，而且中间不能穿过别的车'); return false; }
  hist.push({ i: i, from: cur, to: to });
  setPos(vs[i], to);
  used++;
  hintMove = null;
  sfx.tone(isH(vs[i]) ? 360 : 300, 0.05, 'square', 0.06);
  if (i === RED && to === N - vs[RED].len) { escaped(); return true; }
  hud(); render();
  return true;
}
function nudge(i, delta) {
  var to = posOf(vs[i]) + delta;
  var r = rangeNow(i);
  if (to < r[0] || to > r[1]) { sfx.noise(0.05, 0.05); msg('这边<b>顶到头了</b>'); return false; }
  return slide(i, to);
}
// 点地面格子：有车就选中，空位就尽量滑过去
function tapCell(idx) {
  if (phase !== 'play') return;
  var x = idx % N, y = Math.floor(idx / N);
  var who = vehicleAt(idx);
  if (who >= 0) {
    if (sel === who) { drag = { i: who, x: x, y: y }; }
    else { select(who); }
    return;
  }
  if (sel === null) { msg('先点一辆<b>车</b>，再点你想让它去的位置'); return; }
  var v = vs[sel], r = rangeNow(sel), cur = posOf(v), cs = cellsAt(v, cur);
  if (isH(v) && y !== v.y) { rejectAxis(); return; }
  if (!isH(v) && x !== v.x) { rejectAxis(); return; }
  var along = isH(v) ? x : y;
  var leftmost = cur, rightmost = cur + v.len - 1;
  var to;
  if (along > rightmost) to = r[1];
  else if (along < leftmost) to = r[0];
  else return;   // 点在自己身上
  if (to === cur) { msg('这边<b>没有空位</b>了'); return; }
  slide(sel, to);
}
function rejectAxis() {
  sfx.noise(0.05, 0.05);
  msg('横车只能左右走，<b>竖车只能上下走</b> —— 先把它让开的那条道腾出来');
}
function dragTo(idx) {
  if (!drag || phase !== 'play') return;
  var v = vs[drag.i], r = rangeNow(drag.i), cur = posOf(v);
  var x = idx % N, y = Math.floor(idx / N);
  var along = isH(v) ? x : y;
  var anchor = isH(v) ? (drag.x - cur) : (drag.y - cur);
  var to = Math.max(r[0], Math.min(r[1], along - anchor));
  if (to !== cur) slide(drag.i, to);
  drag = null;
}
function select(i) {
  sel = i;
  sfx.tone(520, 0.04, 'triangle', 0.05);
  var v = vs[i], r = rangeNow(i);
  msg((i === RED ? '<b>红车</b>' : '第 <b>' + (i + 1) + '</b> 号车') + '可以滑到 ' +
    (isH(v) ? '第 ' + (r[0] + 1) + ' ~ ' + (r[1] + v.len) + ' 列' : '第 ' + (r[0] + 1) + ' ~ ' + (r[1] + v.len) + ' 行') + '（算一次）');
  render();
}
function undo() {
  if (phase === 'clear') return;
  var m = hist.pop();
  if (!m) { msg('还没挪过呢'); return; }
  setPos(vs[m.i], m.from);
  used = Math.max(0, used - 1);
  sel = m.i;
  hintMove = null;
  sfx.tone(240, 0.05, 'sine', 0.05);
  hud(); render();
}
function useHint() {
  if (phase !== 'play' || hints <= 0) return;
  var s = solve(vs, 30000);
  if (!s || !s.first) { msg('算不出来了 —— 这局只能硬想'); return; }
  hints--; hintUsed++;
  hintMove = s.first;
  sel = s.first.i;
  sfx.melody([[880, 0.06], [1180, 0.08]], 0.06);
  msg('提示：把<b>第 ' + (s.first.i + 1) + ' 号车</b>滑到' +
    (isH(vs[s.first.i]) ? '第 ' + (s.first.to + 1) + ' 列' : '第 ' + (s.first.to + 1) + ' 行') + '（还差 <b>' + s.moves + '</b> 次出去）');
  hud(); render();
}

/* ==================== 结算 ==================== */
function gainOf(u, hu) {
  var d = D();
  var over = Math.max(0, u - par);
  return Math.max(10, Math.round((50 + 9 * par - over * 18 - hu * 10) * d.mult));
}
function escaped() {
  lastGain = gainOf(used, hintUsed);
  score += lastGain;
  addOut();
  save();
  phase = 'clear';
  sfx.melody([[520, 0.08], [700, 0.08], [900, 0.1], [1180, 0.16]], 0.08);
  hud(); render();
  var last = stage + 1 >= STAGES;
  show('<div class="ov-emoji">🅿️</div><h2>' + (last ? '停车场空了' : '滴 — 出库') + '</h2>' +
    '<p class="final-score">+' + lastGain + '<span> 分</span></p>' +
    '<p class="final-sub">挪了 ' + used + ' 次（最少 ' + par + ' 次）· 用了 ' + hintUsed + ' 次提示' +
    (last ? '' : ' · 前面还有 ' + (STAGES - stage - 1) + ' 场堵车') + '</p>' +
    '<div class="ov-actions"><button class="primary" data-act="' + (last ? 'again' : 'next') + '">' +
    (last ? '全部出库，再来一局' : '下一场 ▶') + '</button><button class="ghost" data-act="stats">战绩</button></div>');
}
function addOut() { store.set('pk.out', String(num('pk.out') + 1)); }
function save() {
  if (score > num('pk.best')) store.set('pk.best', String(score));
  if (stage > num('pk.lv')) store.set('pk.lv', String(stage));
  store.set('pk.diff', diff);
}

/* ==================== 渲染 ==================== */
function buildCells() {
  if (!cellLayer) return;
  var html = '';
  for (var i = 0; i < N * N; i++) html += '<div class="pk-cell" data-i="' + i + '"></div>';
  cellLayer.innerHTML = html;
}
function buildCars() {
  if (!carLayer) return;
  var html = '';
  for (var i = 0; i < vs.length; i++) {
    html += '<div class="pk-car" data-v="' + i + '">' + (i === RED ? '🚗' : FACE[i % FACE.length]) + '</div>';
  }
  carLayer.innerHTML = html;
}
function render() {
  if (!carLayer) return;
  var nodes = carLayer.querySelectorAll('.pk-car');
  var r = sel === null ? null : rangeNow(sel);
  for (var i = 0; i < nodes.length; i++) {
    var v = vs[i], el = nodes[i];
    var w = isH(v) ? v.len : 1, h = isH(v) ? 1 : v.len;
    el.style.left = 'calc(' + (v.x * CELL) + '% + 4px)';
    el.style.top = 'calc(' + (v.y * CELL) + '% + 4px)';
    el.style.width = 'calc(' + (w * CELL) + '% - 8px)';
    el.style.height = 'calc(' + (h * CELL) + '% - 8px)';
    el.className = 'pk-car ' + (isH(v) ? 'h' : 'v') + (v.len === 3 ? ' truck' : '') +
      (i === RED ? ' red' : '') + (sel === i ? ' sel' : '');
    el.style.setProperty('--c1', PAINT[i % PAINT.length][0]);
    el.style.setProperty('--c2', PAINT[i % PAINT.length][1]);
  }
  var cells = cellLayer.querySelectorAll('.pk-cell');
  var occ = occupyMap();
  for (var c = 0; c < cells.length; c++) {
    var cls = 'pk-cell';
    if (occ[c] === undefined || occ[c] === null) cls += ' free';
    if (sel !== null && r) {
      var v = vs[sel];
      var x = c % N, y = Math.floor(c / N);
      var along = isH(v) ? x : y;
      var inLine = isH(v) ? y === v.y : x === v.x;
      if (inLine && along >= r[0] && along <= r[1] + v.len - 1 && occ[c] === undefined) cls += ' slide';
    }
    if (hintMove) {
      var hv = vs[hintMove.i], hcs = cellsAt(hv, hintMove.to);
      for (var k = 0; k < hcs.length; k++) if (hcs[k] === c) cls += ' hintcell';
    }
    if (c === cellIdx(N - 1, EXIT_Y)) cls += ' out';
    cells[c].className = cls;
  }
}
function msg(html) { if (msgEl) msgEl.innerHTML = html; }
function hud() {
  if (!elLv) return;
  elLv.textContent = stage + 1;
  elUsed.textContent = used;
  elPar.textContent = par;
  elScore.textContent = score;
  elHint.textContent = hints;
  elUndo.textContent = hist.length;
  btnHint.disabled = phase !== 'play' || hints <= 0;
  btnUndo.disabled = hist.length === 0;
}
function show(html) {
  if (!ovContent) return;
  ovContent.innerHTML = html;
  overlayEl.classList.add('show');
}
function hide() { if (overlayEl) overlayEl.classList.remove('show'); }
function intro() {
  phase = 'intro';
  show('<div class="ov-emoji">🚗</div><h2>移个车先</h2>' +
    '<p class="hint">整个停车场只有 <b>红车</b> 要下班。每辆车只能沿<b>车头那根轴</b>前后滑，' +
    '滑一格和滑到底都只算<b>一次</b>。<br>' +
    '<span class="ov-legend"><i>🚗 你要放出去的车</i><i>🚪 出口在第三行</i><i>💡 提示＝最优一步</i></span><br>' +
    '关卡是从出口<b>倒着推</b>出来的，所以每场堵车都保证有解；分数只看你比最少次数多挪了几次。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开始挪车</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function stats() {
  show('<h2>本机战绩</h2><div class="pk-ov">' +
    '<p>最高分 <b>' + Math.max(num('pk.best'), score) + '</b> 分 · 难度 <b>' + D().label + '</b></p>' +
    '<p>这一局：' + score + ' 分 · 第 ' + (stage + 1) + ' 场 · 已放出去 <b>' + num('pk.out') + '</b> 辆</p>' +
    '<p>每场 ' + STAGES + ' 关 · 车辆 ' + D().cars + ' 起步 · 提示 ' + D().hints + ' 次/场 · 倍率 ×' + D().mult + '</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="' + (phase === 'clear' ? 'next' : 'resume') + '">' +
    (phase === 'play' ? '继续挪' : phase === 'clear' ? '下一场 ▶' : '再来一局') + '</button></div>');
}
function act(name) {
  if (name === 'start') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'again') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'next') {
    hide();
    if (stage + 1 >= STAGES) { newRound(); intro(); return; }
    startStage(stage + 1);
    return;
  }
  if (name === 'retry') { hide(); startStage(stage); return; }
  if (name === 'resume') { hide(); hud(); render(); return; }
  if (name === 'stats') { stats(); return; }
}

/* ==================== 输入 ==================== */
if (cellLayer) {
  cellLayer.addEventListener('pointerdown', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-i]') : null;
    sfx.resume();
    if (!t) return;
    tapCell(+t.dataset.i);
  });
  cellLayer.addEventListener('pointerup', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-i]') : null;
    if (!t || !drag) return;
    dragTo(+t.dataset.i);
  });
  cellLayer.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-i]') : null;
    if (t && drag) drag = null;
  });
}
window.addEventListener('keydown', function (ev) {
  var k = ev.key;
  if (k === 'Escape') { if (phase === 'play') hide(); return; }
  if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); return; }
  if (k === 't' || k === 'T') { stats(); return; }
  if (k === 'n' || k === 'N') { newRound(); intro(); return; }
  if (phase === 'intro') { if (k === 'Enter' || k === ' ') act('start'); return; }
  if (phase === 'clear') { if (k === 'Enter' || k === ' ') act('next'); return; }
  if (phase !== 'play') return;
  if (k === 'z' || k === 'Z') { undo(); return; }
  if (k === 'h' || k === 'H') { useHint(); return; }
  if (k === 'r' || k === 'R') { resetStage(); msg('回到开局的样子（挪车次数也清零）'); return; }
  if (k >= '1' && k <= '9') { var i = +k - 1; if (i < vs.length) select(i); return; }
  if (sel === null) { msg('先按 <kbd>1</kbd>~<kbd>9</kbd> 或点一辆车'); return; }
  var horiz = isH(vs[sel]);
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    if (!horiz) { rejectAxis(); return; }
    nudge(sel, k === 'ArrowRight' ? 1 : -1);
    return;
  }
  if (k === 'ArrowUp' || k === 'ArrowDown') {
    if (horiz) { rejectAxis(); return; }
    nudge(sel, k === 'ArrowDown' ? 1 : -1);
    return;
  }
});
btnHint.addEventListener('click', useHint);
btnUndo.addEventListener('click', undo);
byId('btnStats').addEventListener('click', stats);
byId('btnNew').addEventListener('click', function () { newRound(); intro(); });
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
    (function (b) {
      b.addEventListener('click', function () {
        diff = b.dataset.diff;
        store.set('pk.diff', diff);
        syncDiff();
        newRound();
        intro();
      });
    })(btns[i]);
  }
})();
function syncDiff() {
  var btns = byId('diff').querySelectorAll('[data-diff]');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
}

/* ==================== 开局 ==================== */
buildCells();
syncSound();
syncDiff();
newRound();
intro();
})();
