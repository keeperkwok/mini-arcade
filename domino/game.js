/* 多米诺 —— 俯视摆骨牌：骨牌倒下去能拍多远，是它的长度决定的。
   机制：自己一张一张摆（位置 + 朝向），按下第一张之后一切交给「递推」——
   每张牌倒下时，顶端画一段半径 = 牌高的圆弧，只有落在下一张牌内侧、
   且命中点够高（擦着牌尖推不动）、转角够顺（太拧的弯传不过去）时才算接上。
   一张牌可以同时拍倒两张，所以链会分叉。摆得疏省牌得高分，摆太疏就断链。
   纯前端零依赖，画布俯视，连锁判定是纯数值，可逐点推算。 */
(function () {
'use strict';

/* ==================== 桌面尺寸与骨牌规格 ==================== */
var VW = 620, VH = 400;            // 画布逻辑尺寸
var TW = 12, TT = 5;               // 牌面宽（扫过的条带宽度）/ 牌厚
var DIFFS = {
  kid: { label: '儿童牌', h: 50, mult: 0.8 },
  std: { label: '标准牌', h: 40, mult: 1 },
  pro: { label: '竞技牌', h: 32, mult: 1.7 },
};
var RULE = {
  hitMin: 1.35,    // 命中高度至少要 1.35 倍牌厚，只擦到牌尖推不动
  latK: 1,         // 横向容差 = latK × 牌宽
  turnMin: 0.3,    // 被推方向与自己朝向的余弦下限：太拧的弯传不过去
  boostK: 1.35,    // 站在 ⚡ 弹板上，这一拍能跨 1.35 倍
  gemK: 0.95,      // 钻石的扫过容差（× 牌宽）
  fall: 0.4,       // 一张牌从被拍到躺平的秒数
  minStep: 8,      // 两张牌的圆心距下限
  dragK: 0.86,     // 拖动连摆的间距 = 最远拍摄距离 × dragK（贴着上限，急弯处会断，得补牌）
  hitLead: 0.25,   // 接触时刻在倒下过程里的起点（越远越晚）
};

/* ==================== 关卡 ==================== */
/* start: 第一张牌（固定不可拆）; crown: 终点; rocks: 不能摆也不能穿过;
   ponds: 不能摆（水里泡不住）; boosts: 站在上面的牌下一拍更远; gems: 顺手扫到有奖 */
var LEVELS = [
  { name: "直巷", cap: 15, hints: 2,
    start: { x: 60, y: 200 }, crown: { x: 330, y: 200, r: 17 },
    rocks: [], ponds: [], boosts: [],
    gems: [],
    route: [[60, 200], [84, 192], [300, 192], [318, 174], [336, 174], [330, 200]] },
  { name: "绕桩", cap: 22, hints: 2,
    start: { x: 70, y: 330 }, crown: { x: 480, y: 130, r: 17 },
    rocks: [
      { x: 255, y: 225, r: 58 }], ponds: [], boosts: [],
    gems: [{ x: 321.3, y: 270.6 }],
    route: [[70, 330], [102, 336], [156, 300], [282, 300], [390, 192], [444, 174], [480, 130]] },
  { name: "水坑", cap: 23, hints: 2,
    start: { x: 60, y: 200 }, crown: { x: 520, y: 215, r: 17 },
    rocks: [], ponds: [
      { x: 295, y: 200, r: 70 }], boosts: [],
    gems: [{ x: 302.9, y: 289 }],
    route: [[60, 200], [120, 246], [228, 246], [264, 282], [354, 282], [480, 210], [520, 215]] },
  { name: "弹板", cap: 25, hints: 2,
    start: { x: 56, y: 340 }, crown: { x: 500, y: 80, r: 17 },
    rocks: [
      { x: 250, y: 290, r: 50 }, { x: 370, y: 160, r: 50 }], ponds: [
      { x: 460, y: 310, r: 52 }], boosts: [
      { x: 283.7, y: 154.3, r: 15 }],
    gems: [{ x: 278.7, y: 149.4 }],
    route: [[56, 340], [66, 318], [156, 228], [174, 228], [192, 210], [228, 210], [354, 84], [462, 84], [498, 48], [500, 80]] },
  { name: "捡钻石", cap: 25, hints: 2,
    start: { x: 56, y: 60 }, crown: { x: 520, y: 330, r: 17 },
    rocks: [
      { x: 300, y: 195, r: 44 }], ponds: [], boosts: [],
    gems: [{ x: 170.6, y: 179.2 }, { x: 276.3, y: 265.8 }, { x: 405.3, y: 287.8 }],
    route: [[56, 60], [66, 84], [174, 192], [228, 210], [282, 264], [354, 264], [444, 318], [520, 330]] },
  { name: "九曲", cap: 24, hints: 2,
    start: { x: 56, y: 56 }, crown: { x: 566, y: 60, r: 17 },
    rocks: [
      { x: 170, y: 200, r: 48 }, { x: 310, y: 200, r: 48 }, { x: 450, y: 200, r: 48 }], ponds: [
      { x: 240, y: 344, r: 38 }], boosts: [],
    gems: [{ x: 257.2, y: 41 }, { x: 426.7, y: 55 }],
    route: [[56, 56], [66, 48], [516, 48], [552, 84], [570, 84], [566, 60]] },
  { name: "窄门", cap: 24, hints: 2,
    start: { x: 56, y: 200 }, crown: { x: 566, y: 200, r: 17 },
    rocks: [
      { x: 250, y: 96, r: 62 }, { x: 250, y: 304, r: 62 }, { x: 420, y: 120, r: 52 }], ponds: [], boosts: [
      { x: 358.9, y: 192, r: 15 }],
    gems: [{ x: 358.9, y: 185 }],
    route: [[56, 200], [66, 192], [534, 192], [552, 174], [570, 174], [566, 200]] },
  { name: "大戏台", cap: 23, hints: 2,
    start: { x: 56, y: 200 }, crown: { x: 560, y: 200, r: 17 },
    rocks: [
      { x: 200, y: 110, r: 50 }, { x: 330, y: 290, r: 50 }, { x: 460, y: 110, r: 50 }], ponds: [
      { x: 265, y: 330, r: 40 }, { x: 400, y: 70, r: 40 }], boosts: [
      { x: 257.2, y: 192, r: 15 }, { x: 392.8, y: 192, r: 15 }],
    gems: [{ x: 223.3, y: 185 }, { x: 325, y: 199 }, { x: 460.6, y: 185 }],
    route: [[56, 200], [66, 192], [516, 192], [534, 174], [560, 200]] },
  { name: "自由场", cap: 26, hints: 1, free: true,
    start: { x: 60, y: 340 }, crown: { x: 560, y: 60, r: 17 },
    rocks: [
      { x: 310, y: 205, r: 40 }], ponds: [], boosts: [
      { x: 274.9, y: 281.9, r: 15 }, { x: 409.7, y: 190.3, r: 15 }],
    gems: [{ x: 173.2, y: 275 }, { x: 304.3, y: 271.8 }, { x: 380.7, y: 209.4 }, { x: 486.6, y: 127 }],
    route: [[60, 340], [120, 282], [282, 282], [300, 264], [336, 264], [480, 120], [498, 120], [560, 60]] },
];

/* ==================== 存储 / DOM / 音效 ==================== */
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
  toggle: function () { return true; }, isMuted: function () { return true; },
  setMuted: function () {}, resume: function () {} };
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'dm.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var cv = byId('cv'), ctx = cv.getContext('2d');
var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elUsed = byId('used'), elCap = byId('cap'), elScore = byId('score'),
  elFell = byId('fell'), elBest = byId('best');
var stateEl = byId('state'), msgEl = byId('msg');

/* ==================== 局面 ==================== */
var phase = 'intro';       // intro / build / play / result / over
var diff = 'std';
var level = 0;             // 关卡下标
var score = 0;
var tiles = [];            // { x, y, d, lock, boost, t, from, ang, fellAt }
var sim = null;            // 最近一次连锁推算
var simT = 0;              // 播放进度（秒）
var cap = 20;
var hints = 2;
var ghostOn = 0;           // 参考摆法剩余显示秒
var cursor = { x: 60, y: 200, d: 0 };
var drag = null;           // { x0, y0, x, y }
var hist = [];
var lastGain = 0;
var cleared = 0;
var fallTotal = 0;
var shakeT = 0;

function D() { return DIFFS[diff]; }
function LV() { return LEVELS[level]; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
function deg(r) { return (r * 180 / Math.PI).toFixed(0); }

/* ==================== 连锁模型：一张怎么推倒下一张 ==================== */
function reachOf(a) { return D().h * (a.boost ? RULE.boostK : 1); }
/* 一张牌倒下能拍到的最远水平距离：顶端要落在下一张牌身上，
   且命中高度 ≥ hitMin × 牌厚（擦着牌尖就没劲） */
function linkMax(h) {
  var need = RULE.hitMin * TT;
  return Math.sqrt(Math.max(0, h * h - need * need));
}
/* a 拍 b：返回能不能接上、为什么不能、接触点距离与命中高度 */
function linkOf(a, b, hv) {
  var dx = b.x - a.x, dy = b.y - a.y;
  var ux = Math.cos(a.d), uy = Math.sin(a.d);
  var s = dx * ux + dy * uy;                 // 沿倒下方向的前进量
  var o = dy * ux - dx * uy;                 // 横向偏差
  if (s <= TT) return { ok: false, why: '它是往别处倒的', s: s, o: o };
  if (Math.abs(o) > TW * RULE.latK) return { ok: false, why: '打偏了，侧面没拍到', s: s, o: o };
  if (s > hv) return { ok: false, why: '够不着，两张牌离得太远', s: s, o: o };
  var hh = Math.sqrt(Math.max(0, hv * hv - s * s));   // 顶端正下方 s 处的高度
  if (hh < RULE.hitMin * TT) return { ok: false, why: '只擦到牌尖，推不动', s: s, o: o };
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  var cos = (dx / len) * Math.cos(b.d) + (dy / len) * Math.sin(b.d);
  if (cos < RULE.turnMin) return { ok: false, why: '方向拧了，它得顺着被推的方向倒', s: s, o: o };
  return { ok: true, s: s, o: o, hh: hh, cos: cos };
}
/* 钻石/皇冠没有朝向，只看有没有被倒下条带扫到 */
function sweepHit(a, px, py, pad, hv) {
  var dx = px - a.x, dy = py - a.y;
  var ux = Math.cos(a.d), uy = Math.sin(a.d);
  var s = dx * ux + dy * uy, o = dy * ux - dx * uy;
  if (s <= 0 || s > hv) return false;
  return Math.abs(o) <= TW * RULE.gemK + pad;
}
/* 线段被石头挡住？ */
function rockBetween(ax, ay, bx, by) {
  var rs = LV().rocks, i, r, dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  if (!len2) return null;
  for (i = 0; i < rs.length; i++) {
    r = rs[i];
    var t = clamp(((r.x - ax) * dx + (r.y - ay) * dy) / len2, 0, 1);
    var px = ax + t * dx, py = ay + t * dy;
    if (dist(px, py, r.x, r.y) < r.r) return r;
  }
  return null;
}
function inZone(list, x, y, pad) {
  for (var i = 0; i < list.length; i++) if (dist(x, y, list[i].x, list[i].y) < list[i].r + pad) return list[i];
  return null;
}
function contactAt(a, s, hv, ta) {
  return ta + (RULE.hitLead + (1 - RULE.hitLead) * clamp(s / hv, 0, 1)) * RULE.fall;
}

/* 整条链的推算：从第一张开始，按时间顺序传播。纯函数，不改状态 */
function simulate() {
  var n = tiles.length, i, standing = {}, pend = [], out;
  var cr = LV().crown, gems = LV().gems;
  var res = { t: [], from: [], order: [], goalAt: -1, goalFrom: -1, gems: [], gemAt: [], standing: n, last: 0, lastT: 0, why: '', whyKind: '' };
  for (i = 0; i < n; i++) standing[i] = true;
  if (!n) { res.standing = 0; res.why = '一张牌都没有'; res.whyKind = 'empty'; return res; }
  function emit(ai, ta) {
    var a = tiles[ai], hv = reachOf(a), j, r;
    for (j = 0; j < n; j++) {
      if (!standing[j]) continue;
      r = linkOf(a, tiles[j], hv);
      if (!r.ok) continue;
      if (rockBetween(a.x, a.y, tiles[j].x, tiles[j].y)) continue;
      pend.push({ at: contactAt(a, r.s, hv, ta), to: j, from: ai });
    }
    if (res.goalAt < 0 && sweepHit(a, cr.x, cr.y, cr.r, hv) && !rockBetween(a.x, a.y, cr.x, cr.y)) {
      var sd = Math.abs((cr.x - a.x) * Math.cos(a.d) + (cr.y - a.y) * Math.sin(a.d));
      res.goalAt = contactAt(a, sd, hv, ta);
      res.goalFrom = ai;
    }
    for (j = 0; j < gems.length; j++) {
      if (res.gems.indexOf(j) >= 0) continue;
      if (sweepHit(a, gems[j].x, gems[j].y, 0, hv)) { res.gems.push(j); res.gemAt.push(ta + RULE.fall * 0.5); }
    }
  }
  standing[0] = false; res.t[0] = 0; res.from[0] = -1; res.order.push(0); res.standing = n - 1;
  emit(0, 0);
  while (pend.length) {
    var bi = 0;
    for (i = 1; i < pend.length; i++) if (pend[i].at < pend[bi].at) bi = i;
    var ev = pend.splice(bi, 1)[0];
    if (!standing[ev.to]) continue;
    standing[ev.to] = false;
    res.standing--;
    res.t[ev.to] = ev.at;
    res.from[ev.to] = ev.from;
    res.order.push(ev.to);
    emit(ev.to, ev.at);   // 它倒下后接着往下拍，倒下时刻就是它开始动的时刻
  }
  out = res.order.length ? res.order[res.order.length - 1] : 0;
  res.last = out; res.lastT = res.t[out] || 0;
  if (!res.standing && res.goalAt < 0) {
    res.why = '牌倒完了，就差一点点没够到皇冠';
    res.whyKind = 'short';
  } else if (res.standing) {
    var a0 = tiles[out], bestJ = -1, bestD = 1e9, bj = null;
    for (i = 0; i < n; i++) {
      if (!standing[i]) continue;
      var dd = dist(a0.x, a0.y, tiles[i].x, tiles[i].y);
      if (dd < bestD) { bestD = dd; bestJ = i; bj = tiles[i]; }
    }
    var rr = linkOf(a0, bj, reachOf(a0));
    res.why = rr.ok ? (rockBetween(a0.x, a0.y, bj.x, bj.y) ? '石头挡在中间，链被砸断了' : '接上了却没轮到它') : rr.why;
    res.whyKind = rr.ok ? 'rock' : 'link';
    res.whyAt = bestJ;
  }
  return res;
}

/* ==================== 摆放合法性 ==================== */
function canPlace(x, y) {
  if (x < 8 || y < 8 || x > VW - 8 || y > VH - 8) return { ok: false, why: '摆在桌面里头' };
  if (inZone(LV().rocks, x, y, 4)) return { ok: false, why: '石头上放不住牌' };
  if (inZone(LV().ponds, x, y, 2)) return { ok: false, why: '水坑里泡不住牌' };
  if (dist(x, y, LV().crown.x, LV().crown.y) < LV().crown.r) return { ok: false, why: '皇冠上不放牌' };
  for (var i = 0; i < tiles.length; i++) if (dist(x, y, tiles[i].x, tiles[i].y) < RULE.minStep) return { ok: false, why: '这张牌边上已经有牌了' };
  if (tiles.length >= cap) return { ok: false, why: '牌数到上限了，省着点摆' };
  return { ok: true };
}
function boostAt(x, y) { return inZone(LV().boosts, x, y, 3); }
/* 点一下不拖：新牌自动朝着「链条往前」的方向 */
function autoAim(x, y) {
  var hv = D().h, best = null, bd = 1e9, i;
  for (i = 0; i < tiles.length; i++) {
    var a = tiles[i];
    if (!sim || sim.t[i] === undefined) continue;
    var r = linkOf(a, { x: x, y: y, d: 0 }, reachOf(a));
    if (!r.ok) continue;
    if (r.s < bd) { bd = r.s; best = a; }
  }
  if (best) return Math.atan2(y - best.y, x - best.x);
  return cursor.d;
}
function pushHist() {
  hist.push(JSON.stringify(tiles.map(function (t) { return { x: t.x, y: t.y, d: t.d, lock: !!t.lock }; })));
  if (hist.length > 30) hist.shift();
}
function addTile(x, y, d) {
  if (phase !== 'build') return false;
  var c = canPlace(x, y);
  if (!c.ok) { say('<span class="bad">' + c.why + '</span>'); sfx.noise(0.08, 0.05); return false; }
  pushHist();
  tiles.push({ x: x, y: y, d: d, lock: false, boost: !!boostAt(x, y), ang: 0 });
  cursor.d = d;
  sfx.tone(420 + tiles.length * 6, 0.04, 'square', 0.08);
  say('摆下第 ' + tiles.length + ' 张（朝 ' + deg(d) + '°）· 剩 ' + (cap - tiles.length) + ' 张额度');
  afterChange();
  return true;
}
function removeAt(x, y) {
  if (phase !== 'build') return false;
  var bi = -1, bd = 1e9, i;
  for (i = 0; i < tiles.length; i++) {
    if (tiles[i].lock) continue;
    var dd = dist(x, y, tiles[i].x, tiles[i].y);
    if (dd < bd) { bd = dd; bi = i; }
  }
  if (bi < 0 || bd > 14) { say('这儿没有牌可拆'); return false; }
  pushHist();
  var t = tiles.splice(bi, 1)[0];
  sfx.noise(0.1, 0.06);
  say('拆掉第 ' + (bi + 1) + ' 张 · 剩 ' + (cap - tiles.length) + ' 张额度');
  afterChange();
  return true;
}
function undo() {
  if (phase !== 'build') return;
  if (!hist.length) { say('没有可撤销的操作'); return; }
  var snap = JSON.parse(hist.pop());
  tiles = snap.map(function (t) { return { x: t.x, y: t.y, d: t.d, lock: !!t.lock, boost: !!boostAt(t.x, t.y), ang: 0 }; });
  sfx.tone(300, 0.05, 'triangle', 0.08);
  say('撤销一步');
  afterChange();
}
function resetLevel() {
  var L = LV();
  cap = L.cap;
  hints = L.hints;
  tiles = [{ x: L.start.x, y: L.start.y, d: startDir(), lock: true, boost: !!boostAt(L.start.x, L.start.y), ang: 0 }];
  tiles[0].n = '起';
  hist = [];
  ghostOn = 0;
  cursor = { x: L.start.x + 40 * Math.cos(startDir()), y: L.start.y + 40 * Math.sin(startDir()), d: startDir() };
  sim = simulate();
  render2(); hud();
}

/* ==================== 参考摆法（提示用，也用来验证关卡有解） ==================== */
function smoothPts(pts, iters) {
  var out = pts.map(function (q) { return [q[0], q[1]]; }), k, i;
  for (k = 0; k < iters; k++) {
    var np = [out[0]];
    for (i = 0; i + 1 < out.length; i++) {
      var a = out[i], b = out[i + 1];
      np.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      np.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    np.push(out[out.length - 1]);
    out = np;
  }
  return out;
}
function routePts() {
  var L = LV();
  if (L.route.length && L.route[0][0] === L.start.x && L.route[0][1] === L.start.y) return smoothPts(L.route, 3);
  return smoothPts([[L.start.x, L.start.y]].concat(L.route), 3);
}
function pointAt(pts, s) {
  var i = 0, a, b, seg;
  while (i + 1 < pts.length) {
    a = pts[i]; b = pts[i + 1]; seg = dist(a[0], a[1], b[0], b[1]);
    if (seg > 0 && s <= seg) return [a[0] + (b[0] - a[0]) * s / seg, a[1] + (b[1] - a[1]) * s / seg, Math.atan2(b[1] - a[1], b[0] - a[0])];
    s -= seg; i++;
  }
  a = pts[pts.length - 2] || pts[0]; b = pts[pts.length - 1];
  return [b[0], b[1], Math.atan2(b[1] - a[1], b[0] - a[0])];
}
function polyLen(pts) {
  var i, sum = 0;
  for (i = 0; i + 1 < pts.length; i++) sum += dist(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  return sum;
}
function canHitCrown(x, y, d) {
  var cr = LV().crown;
  return sweepHit({ x: x, y: y, d: d }, cr.x, cr.y, cr.r, D().h) && !rockBetween(x, y, cr.x, cr.y);
}
/* 起点牌的朝向 = 参考路线在起点处的切线，保证提示和实际摆放一致 */
function startDir() { return pointAt(routePts(), 12)[2]; }
/* 参考摆法：沿平滑折线等距采样，每张对准下一张。
   最后一张要正对皇冠，如果那个转角连上一张都推不动它，就往前退一张收尾。 */
function plan() {
  var L = LV(), h = D().h, cr = L.crown, pts = routePts(), total = polyLen(pts);
  var step = linkMax(h) * RULE.dragK, pos = [], out = [], i, e, s2, dirs;
  var stop = Math.max(step * 0.6, total - cr.r - 4);
  var px = L.start.x, py = L.start.y, q;
  for (s2 = step; s2 < stop; s2 += step) {
    q = pointAt(pts, s2);
    if (dist(q[0], q[1], px, py) < RULE.minStep + 2) continue;
    pos.push(q); px = q[0]; py = q[1];
  }
  q = pointAt(pts, stop);
  if (dist(q[0], q[1], px, py) >= RULE.minStep + 2 && dist(q[0], q[1], cr.x, cr.y) >= cr.r + 2) pos.push(q);
  if (!pos.length) return { pts: out, n: 0, ok: canHitCrown(L.start.x, L.start.y, startDir()) };
  for (e = pos.length - 1; e >= 0; e--) {
    dirs = [];
    for (i = 0; i <= e; i++) {
      var tg = i < e ? pos[i + 1] : [cr.x, cr.y];
      dirs[i] = Math.atan2(tg[1] - pos[i][1], tg[0] - pos[i][0]);
    }
    if (!canHitCrown(pos[e][0], pos[e][1], dirs[e])) continue;
    if (e > 0 && !linkOf({ x: pos[e - 1][0], y: pos[e - 1][1], d: dirs[e - 1] },
      { x: pos[e][0], y: pos[e][1], d: dirs[e] }, h).ok) continue;
    for (i = 0; i <= e; i++) out.push([pos[i][0], pos[i][1], dirs[i]]);
    return { pts: out, n: out.length, ok: true };
  }
  for (i = 0; i < pos.length; i++) {
    var t2 = i + 1 < pos.length ? pos[i + 1] : [cr.x, cr.y];
    out.push([pos[i][0], pos[i][1], Math.atan2(t2[1] - pos[i][1], t2[0] - pos[i][0])]);
  }
  return { pts: out, n: out.length, ok: false };
}
/* ==================== 分数 ==================== */
function gainOf(res) {
  var rows = [], i;
  rows.push({ k: '搭台 ' + (level + 1) + ' 关', v: 30 * (level + 1) });
  rows.push({ k: '连锁 ' + res.order.length + ' 张', v: res.order.length * 8 });
  if (res.gems.length) rows.push({ k: '钻石 ' + res.gems.length + ' 颗', v: res.gems.length * 40 });
  var left = Math.max(0, cap - tiles.length);
  if (left) rows.push({ k: '省牌 ' + left + ' 张', v: left * 18 });
  if (res.order.length === tiles.length) rows.push({ k: '一张没浪费', v: 60 });
  rows.push({ k: '皇冠落地', v: 120 });
  var sum = 0;
  for (i = 0; i < rows.length; i++) sum += rows[i].v;
  return { rows: rows, sum: sum, total: Math.round(sum * D().mult), mult: D().mult };
}

/* ==================== 流转 ==================== */
function afterChange() {
  sim = simulate();
  hud(); render2();
}
function startFall() {
  if (phase === 'play') return;
  if (phase !== 'build') return;
  sim = simulate();
  var i;
  for (i = 0; i < tiles.length; i++) { tiles[i].ang = 0; tiles[i].sounded = false; tiles[i].t = sim.t[i]; }
  crownAng = 0; crownSounded = false; ff = false;
  phase = 'play'; simT = 0;
  sfx.tone(200, 0.06, 'triangle', 0.12, 0, 520);
  say('推倒第一张 —— 剩下的交给物理…');
  hud(); render2();
}
function endAt() {
  var e = (sim ? sim.lastT : 0) + RULE.fall;
  if (sim && sim.goalAt >= 0) e = Math.max(e, sim.goalAt + 0.5);
  return e + 0.25;
}
function finishFall() {
  var res = sim, fellN = res.order.length, i;
  store.set('dm.fall', num('dm.fall') + fellN);
  fallTotal += fellN;
  if (res.goalAt >= 0) {
    var g = gainOf(res);
    lastGain = done[level] ? 0 : g.total;
    if (!done[level]) score += g.total;
    done[level] = true;
    cleared = Math.max(cleared, level + 1);
    store.set('dm.lv', Math.max(num('dm.lv'), cleared));
    store.set('dm.best', Math.max(num('dm.best'), score));
    phase = 'result';
    sfx.melody([[659, 0.09], [784, 0.09], [1046, 0.18]]);
    showResult(res, g);
  } else {
    phase = 'build';
    for (i = 0; i < tiles.length; i++) { tiles[i].ang = 0; tiles[i].t = undefined; }
    sfx.noise(0.16, 0.1);
    say('<span class="bad">链断在第 ' + (res.last + 1) + ' 张后面：' + (res.why || '没接上') + '</span> —— 拆掉重摆，或者把弯转顺一点');
    hud(); render2();
  }
}
function nextLevel() {
  if (level + 1 >= LEVELS.length) { gameOver('全部杀青'); return; }
  level++;
  resetLevel();
  hideOverlay();
  phase = 'build';
  say('<b>' + LV().name + '</b>：这一关 ' + capHint() + ' 张牌额度 · 皇冠在桌面另一头');
  hud(); render2();
}
function capHint() { return String(cap); }
function retryLevel() {
  resetLevel();
  hideOverlay();
  phase = 'build';
  hud(); render2();
}
function gameOver(reason) {
  phase = 'over';
  store.set('dm.best', Math.max(num('dm.best'), score));
  store.set('dm.lv', Math.max(num('dm.lv'), cleared));
  ovContent.innerHTML = '<div class="ov-emoji">🎊</div><h2>' + reason + '</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">通关 ' + cleared + '/' + LEVELS.length + ' · 这一场倒下 ' + fallTotal + ' 张骨牌</p>' +
    '<div class="dm-list">' + recRows() + '</div>' +
    '<div class="ov-actions"><button class="primary" data-act="again">从第一关再来</button>' +
    '<button class="ghost" data-act="stats">看战绩</button></div>';
  overlayEl.classList.add('show');
  hud();
}
function recRows() {
  return '<div class="dm-row"><span>本机最高分</span><b>' + num('dm.best') + '</b></div>' +
    '<div class="dm-row"><span>最高通关</span><b>' + num('dm.lv') + '/' + LEVELS.length + '</b></div>' +
    '<div class="dm-row"><span>累计倒牌</span><b>' + num('dm.fall') + ' 张</b></div>';
}
function showResult(res, g) {
  var rows = '', i;
  for (i = 0; i < g.rows.length; i++) rows += '<div class="dm-row"><span>' + g.rows[i].k + '</span><b>+' + g.rows[i].v + '</b></div>';
  var last = level + 1 >= LEVELS.length;
  var again = lastGain === 0;
  ovContent.innerHTML = '<div class="ov-emoji">👑</div><h2>' + LV().name + ' · 通了</h2>' +
    (again ? '<p class="final-score">0<span> 分</span></p><p class="final-sub">这一关的分早拿过了，随便摆</p>'
           : '<p class="final-score">+' + g.total + '<span> 分</span></p>' +
             '<p class="final-sub">' + g.sum + ' × ' + D().label + '倍率 ' + g.mult + ' —— 当前总分 ' + score + '</p>') +
    '<div class="dm-list">' + rows + '</div>' +
    '<div class="ov-actions"><button class="primary" data-act="' + (last ? 'fin' : 'next') + '">' + (last ? '杀青结账' : '下一关') + '</button>' +
    '<button class="ghost" data-act="stay">留在这一关再摆摆</button></div>';
  overlayEl.classList.add('show');
}
function showStats() {
  ovContent.innerHTML = '<div class="ov-emoji">📖</div><h2>本机战绩</h2>' +
    '<div class="dm-list">' + recRows() + '</div>' +
    '<div class="ov-actions"><button class="primary" data-act="close">继续摆</button>' +
    '<button class="ghost" data-act="restart">从第一关重来</button></div>';
  overlayEl.classList.add('show');
}
function showIntro() {
  phase = 'intro';
  ovContent.innerHTML = '<div class="ov-emoji">🁡</div><h2>多米诺</h2>' +
    '<p class="hint">骨牌倒下去能拍多远，只由它的<b>高度</b>说了算：' +
    '桌面这张牌高 <b>' + D().h + '</b>，最远能拍到 <b>' + linkMax(D().h).toFixed(1) + '</b> 之外的下一张 —— 摆密了浪费牌，摆疏了断链。<br>' +
    '在桌面上<b>按住拖一下</b>就放一张牌（拖动方向＝倒下方向），点一下则自动顺着链条对准。' +
    '🪨 挡路、💧 泡不得、⚡ 站上能跨更远、💎 顺手扫到有奖。<br>' +
    '把 <b>👑</b> 拍倒就过关，用的牌越少分越高。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开始摆牌</button></div>';
  overlayEl.classList.add('show');
  markDiff(); hud();
}
function hideOverlay() { overlayEl.classList.remove('show'); }
function say(html) { msgEl.innerHTML = html; }
function markDiff() {
  var btns = byId('diff').querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
}
function newRun(key) {
  if (key && DIFFS[key]) diff = key;
  level = 0; score = 0; cleared = 0; fallTotal = 0; lastGain = 0;
  cap = LV().cap;
  store.set('dm.diff', diff);
  resetLevel(false);
  hideOverlay();
  phase = 'build';
  say('<b>' + LV().name + '</b>：牌高 ' + D().h + '，最远拍 ' + linkMax(D().h).toFixed(1) + ' · 上限 ' + cap + ' 张');
  markDiff(); hud(); render2();
}
function useHint() {
  if (phase !== 'build') return;
  if (hints <= 0) { say('这一关的参考摆法用完了 —— 剩下的路自己趟'); return; }
  hints--;
  var p = plan();
  ghostOn = 5;
  sfx.tone(700, 0.06, 'sine', 0.1);
  say('虚线是参考答案的一种摆法：约 ' + p.n + ' 张牌就能接上皇冠');
  render2();
  hud();
}
function frame() {
  var dt = ff ? 0.1 : 0.04, i, moving = 0;
  if (phase === 'play') {
    simT += dt;
    for (i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      if (t.t === undefined) continue;
      var pr = clamp((simT - t.t) / RULE.fall, 0, 1);
      if (pr > t.ang) {
        if (!t.sounded && pr > 0) { t.sounded = true; sfx.tone(150 + (i % 9) * 14, 0.03, 'sine', 0.05); }
        t.ang = pr;
      }
      if (pr < 1 && pr > 0) moving++;
    }
    if (sim.goalAt >= 0) crownAng = clamp((simT - sim.goalAt) / RULE.fall, 0, 1);
    if (crownAng > 0 && !crownSounded) { crownSounded = true; sfx.noise(0.22, 0.14); shakeT = 0.3; }
    render2();
    if (!moving && simT >= endAt()) finishFall();
  } else if (phase === 'build') {
    if (ghostOn > 0) { ghostOn -= dt; render2(); }
  }
  if (shakeT > 0) shakeT -= dt;
}

/* ==================== 画布 ==================== */
var crownAng = 0, crownSounded = false, done = {}, ff = false;
function resize() {
  var rect = cv.getBoundingClientRect();
  var cssW = rect.width || VW;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(cssW * dpr));
  cv.height = Math.max(1, Math.round(cssW * dpr * VH / VW));
  var k = (cssW * dpr) / VW;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}
function rr(x, y, w, h, r) {
  var q = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.lineTo(x + w - q, y); ctx.quadraticCurveTo(x + w, y, x + w, y + q);
  ctx.lineTo(x + w, y + h - q); ctx.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  ctx.lineTo(x + q, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - q);
  ctx.lineTo(x, y + q); ctx.quadraticCurveTo(x, y, x + q, y);
  ctx.closePath();
}
function txt(s, x, y, size, color, align) {
  ctx.font = size + 'px -apple-system, "Apple Color Emoji", sans-serif';
  ctx.textAlign = align || 'center';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}
function drawTile(t, i) {
  var h = D().h, pr = (phase === 'build' || phase === 'intro') ? 0 : (t.ang || 0);
  var len = h * Math.sin(pr * Math.PI / 2);
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.d);
  if (len > TT) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    rr(-1, -TW / 2 - 1, len + 3, TW + 2, 3); ctx.fill();
    var lg = ctx.createLinearGradient(0, 0, len, 0);
    if (t.lock) { lg.addColorStop(0, '#fde68a'); lg.addColorStop(1, '#d97706'); }
    else { lg.addColorStop(0, '#f8fafc'); lg.addColorStop(1, '#94a3b8'); }
    ctx.fillStyle = lg;
    rr(0, -TW / 2, len, TW, 3); ctx.fill();
  }
  var th = TT * (1 - pr * 0.72);
  ctx.fillStyle = t.lock ? '#fcd34d' : (t.boost ? '#6ee7b7' : '#f1f5f9');
  rr(-th / 2, -TW / 2, Math.max(1.4, th), TW, 2); ctx.fill();
  ctx.strokeStyle = 'rgba(15, 12, 6, 0.6)'; ctx.lineWidth = 1;
  rr(-th / 2, -TW / 2, Math.max(1.4, th), TW, 2); ctx.stroke();
  if (pr < 1) {
    ctx.strokeStyle = t.lock ? 'rgba(217, 119, 6, 0.9)' : 'rgba(253, 224, 71, 0.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(th / 2 + 1, 0); ctx.lineTo(th / 2 + 9, 0); ctx.stroke();
  }
  ctx.restore();
  if (pr < 0.98) txt(String(i + 1), t.x, t.y + 3, 9, t.lock ? '#7c2d12' : '#0f172a');
}
function link(from, to, color, wdt) {
  ctx.strokeStyle = color; ctx.lineWidth = wdt;
  ctx.setLineDash ? ctx.setLineDash([4, 4]) : 0;
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.setLineDash ? ctx.setLineDash([]) : 0;
}
function render2() {
  var i, L = LV(), h = D().h;
  ctx.clearRect(0, 0, VW, VH);
  ctx.save();
  if (shakeT > 0) ctx.translate((Math.random() - 0.5) * shakeT * 9, (Math.random() - 0.5) * shakeT * 9);
  var g0 = ctx.createLinearGradient(0, 0, VW, VH);
  g0.addColorStop(0, '#6f4a26'); g0.addColorStop(0.55, '#53351a'); g0.addColorStop(1, '#3a2411');
  ctx.fillStyle = g0; ctx.fillRect(-12, -12, VW + 24, VH + 24);
  ctx.strokeStyle = 'rgba(255, 240, 210, 0.05)'; ctx.lineWidth = 1;
  for (i = 0; i < 15; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * 28 + 6);
    ctx.quadraticCurveTo(VW / 2, i * 28 + 6 + (i % 2 ? 13 : -13), VW, i * 28 + 4); ctx.stroke();
  }
  for (i = 0; i < L.ponds.length; i++) {
    var p = L.ponds[i];
    var gp = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    gp.addColorStop(0, 'rgba(14, 116, 144, 0.85)'); gp.addColorStop(1, 'rgba(8, 47, 73, 0.9)');
    ctx.fillStyle = gp;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.82, 0, 0, Math.PI * 2); ctx.fill();
    txt('💧', p.x, p.y + 5, 13, '#bae6fd');
  }
  for (i = 0; i < L.boosts.length; i++) {
    var b = L.boosts[i];
    ctx.fillStyle = 'rgba(251, 191, 36, 0.28)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
    txt('⚡', b.x, b.y + 5, 14, '#fde68a');
  }
  for (i = 0; i < L.rocks.length; i++) {
    var r0 = L.rocks[i];
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath(); ctx.ellipse(r0.x + 3, r0.y + 4, r0.r, r0.r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    var gr = ctx.createRadialGradient(r0.x - r0.r * 0.3, r0.y - r0.r * 0.4, 2, r0.x, r0.y, r0.r);
    gr.addColorStop(0, '#94a3b8'); gr.addColorStop(1, '#475569');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(r0.x, r0.y, r0.r, r0.r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    txt('🪨', r0.x, r0.y + 6, Math.min(28, r0.r * 0.7), '#e2e8f0');
  }
  for (i = 0; i < L.gems.length; i++) {
    var got = sim && sim.gems.indexOf(i) >= 0 && (phase !== 'play' || simT >= (sim.gemAt[sim.gems.indexOf(i)] || 0));
    var gm = L.gems[i];
    ctx.globalAlpha = got ? 0.25 : 1;
    txt('💎', gm.x, gm.y + 6, 17, '#67e8f9');
    ctx.globalAlpha = 1;
  }
  // 皇冠
  ctx.strokeStyle = crownAng > 0 ? '#fcd34d' : 'rgba(252, 211, 77, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(L.crown.x, L.crown.y, L.crown.r + (crownAng > 0 ? crownAng * 10 : 3 + Math.sin(simT * 2) * 1.5), 0, Math.PI * 2); ctx.stroke();
  txt('👑', L.crown.x, L.crown.y + 7 - crownAng * 6, 20 - crownAng * 8, '#fde68a');
  // 预览连线
  if (sim && (phase === 'build' || phase === 'intro')) {
    for (i = 0; i < tiles.length; i++) {
      if (sim.t[i] === undefined) continue;
      var f = sim.from[i];
      if (f >= 0) link(tiles[f], tiles[i], 'rgba(52, 211, 153, 0.7)', 1.6);
    }
    if (sim.goalAt >= 0 && sim.goalFrom >= 0) link(tiles[sim.goalFrom], L.crown, 'rgba(252, 211, 77, 0.9)', 2);
    for (i = 0; i < tiles.length; i++) {
      if (sim.t[i] !== undefined) continue;
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.9)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(tiles[i].x, tiles[i].y, 9, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // 参考摆法
  if (ghostOn > 0) {
    var pl = plan();
    ctx.globalAlpha = clamp(ghostOn / 1.2, 0.2, 1) * 0.8;
    for (i = 0; i < pl.pts.length; i++) {
      ctx.strokeStyle = '#5eead4'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(pl.pts[i][0], pl.pts[i][1], 8, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  for (i = 0; i < tiles.length; i++) drawTile(tiles[i], i);
  // 笔架
  if (phase === 'build') {
    var okp = canPlace(cursor.x, cursor.y).ok;
    ctx.strokeStyle = okp ? 'rgba(94, 234, 212, 0.85)' : 'rgba(248, 113, 113, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cursor.x, cursor.y, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.save();
    ctx.translate(cursor.x, cursor.y); ctx.rotate(cursor.d);
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.6)';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(linkMax(h), 0); ctx.stroke();
    ctx.restore();
  }
  if (drag && drag.moved) {
    var dd = dist(drag.x0, drag.y0, drag.x, drag.y);
    if (dd > 6) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(drag.x0, drag.y0); ctx.lineTo(drag.x, drag.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(94, 234, 212, 0.8)';
      ctx.save(); ctx.translate(drag.x0, drag.y0); ctx.rotate(Math.atan2(drag.y - drag.y0, drag.x - drag.x0));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(linkMax(h), 0); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}
function hud() {
  var fellN = sim ? sim.order.length : 0;
  elLv.textContent = (level + 1) + '/' + LEVELS.length;
  elUsed.textContent = String(tiles.length);
  elCap.textContent = String(cap);
  elScore.textContent = String(score);
  elFell.textContent = String(fellN);
  elBest.textContent = String(num('dm.best'));
  byId('hintN').textContent = String(hints);
  stateEl.textContent = phase === 'build'
    ? LV().name + ' · 牌高 ' + D().h + ' · 最远拍 ' + linkMax(D().h).toFixed(1) + ' · 接上 ' + fellN + '/' + tiles.length + (sim && sim.goalAt >= 0 ? ' · 👑 已接住' : '')
    : (phase === 'play' ? '骨牌正在倒…' + (ff ? '（2.5 倍速）' : '（按 Enter 或点桌面加速）') : phase === 'result' ? '这一关了结' : phase === 'over' ? '杀青' : '先看说明');
  var building = phase === 'build';
  byId('btnFall').disabled = !building;
  byId('btnUndo').disabled = !building || !hist.length;
  byId('btnClear').disabled = !building;
  byId('btnHint').disabled = !building || hints <= 0;
}

/* ==================== 输入 ==================== */
function toWorld(ev) {
  var rect = cv.getBoundingClientRect();
  var w = rect.width || VW, hh = rect.height || (w * VH / VW);
  var x = (ev && ev.clientX != null ? ev.clientX : 0) - (rect.left || 0);
  var y = (ev && ev.clientY != null ? ev.clientY : 0) - (rect.top || 0);
  return { x: clamp(x / w * VW, 0, VW), y: clamp(y / hh * VH, 0, VH) };
}
/* 按住拖动时沿路径按步长补牌：拖得越远补得越多，间距由牌高决定 */
function layAlong(x, y) {
  if (!drag) return;
  var gap = linkMax(D().h) * RULE.dragK;
  if (drag.laid === undefined) { if (!addTile(drag.x0, drag.y0, autoAim(drag.x0, drag.y0))) { drag.laid = -1; return; } drag.laid = 0; drag.lx = drag.x0; drag.ly = drag.y0; }
  if (drag.laid < 0) return;
  var dx = x - drag.lx, dy = y - drag.ly, len = Math.sqrt(dx * dx + dy * dy);
  while (len >= gap) {
    var nx = drag.lx + dx / len * gap, ny = drag.ly + dy / len * gap;
    if (!addTile(nx, ny, Math.atan2(dy, dx))) break;
    drag.lx = nx; drag.ly = ny;
    dx = x - drag.lx; dy = y - drag.ly; len = Math.sqrt(dx * dx + dy * dy);
  }
}
function nearestTile(x, y) {
  var bi = -1, bd = 1e9, i;
  for (i = 0; i < tiles.length; i++) { var dd = dist(x, y, tiles[i].x, tiles[i].y); if (dd < bd) { bd = dd; bi = i; } }
  return bd <= 14 ? bi : -1;
}
cv.addEventListener('pointerdown', function (e) {
  sfx.resume();
  if (phase === 'play') { ff = !ff; hud(); return; }
  if (phase !== 'build') return;
  var p = toWorld(e);
  drag = { x0: p.x, y0: p.y, x: p.x, y: p.y, moved: false };
  cursor.x = p.x; cursor.y = p.y;
  render2();
});
cv.addEventListener('pointermove', function (e) {
  var p = toWorld(e);
  if (phase !== 'build') return;
  if (drag) {
    if (dist(drag.x0, drag.y0, p.x, p.y) > 8) drag.moved = true;
    drag.x = p.x; drag.y = p.y;
    layAlong(p.x, p.y);   // 按住拖 = 沿路等距铺一排
  }
  cursor.x = p.x; cursor.y = p.y;
  render2();
});
cv.addEventListener('pointerup', function (e) {
  if (phase !== 'build' || !drag) { drag = null; return; }
  var p = toWorld(e), d0 = drag;
  drag = null;
  cursor.x = d0.x0; cursor.y = d0.y0;
  if (d0.moved) {
    if (d0.laid === undefined) addTile(d0.x0, d0.y0, Math.atan2(d0.y - d0.y0, d0.x - d0.x0));
  } else {
    var ni = nearestTile(d0.x0, d0.y0);
    if (ni >= 0 && !tiles[ni].lock) removeAt(d0.x0, d0.y0);
    else addTile(d0.x0, d0.y0, autoAim(d0.x0, d0.y0));
  }
});
cv.addEventListener('pointercancel', function () { drag = null; });
cv.addEventListener('contextmenu', function (e) {
  if (e && e.preventDefault) e.preventDefault();
  if (phase !== 'build') return;
  var p = toWorld(e);
  removeAt(p.x, p.y);
});

window.addEventListener('keydown', function (e) {
  var k = (e.key || '').toLowerCase();
  var step = (e.shiftKey ? 24 : 10);
  if (k === 'arrowleft' || k === 'arrowright' || k === 'arrowup' || k === 'arrowdown') {
    if (phase !== 'build') return;
    if (k === 'arrowleft') cursor.x = clamp(cursor.x - step, 4, VW - 4);
    if (k === 'arrowright') cursor.x = clamp(cursor.x + step, 4, VW - 4);
    if (k === 'arrowup') cursor.y = clamp(cursor.y - step, 4, VH - 4);
    if (k === 'arrowdown') cursor.y = clamp(cursor.y + step, 4, VH - 4);
    render2();
    e.preventDefault();
    return;
  }
  if (k === ',' || k === '<') { cursor.d -= Math.PI / 12; render2(); hud(); return; }
  if (k === '.' || k === '>') { cursor.d += Math.PI / 12; render2(); hud(); return; }
  if (k === ' ') { if (phase === 'build') addTile(cursor.x, cursor.y, cursor.d); e.preventDefault(); return; }
  if (k === 'enter') { if (phase === 'play') { ff = !ff; } else startFall(); hud(); return; }
  if (k === 'x') { removeAt(cursor.x, cursor.y); return; }
  if (k === 'z') { undo(); return; }
  if (k === 'h') { useHint(); return; }
  if (k === 'r') { retryLevel(); return; }
  if (k === 't') { showStats(); return; }
  if (k === 'n') { newRun(); return; }
  if (k === 'm') { sfx.toggle(); syncSound(); return; }
  if (k === '1' || k === '2' || k === '3') { newRun(['kid', 'std', 'pro'][Number(k) - 1]); return; }
  if (k === 'escape') { if (phase === 'over' || phase === 'result') hideOverlay(); return; }
});

ovContent.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  var act = t && t.dataset ? t.dataset.act : null;
  if (!act) return;
  sfx.resume();
  if (act === 'start' || act === 'again' || act === 'restart') newRun();
  else if (act === 'next') nextLevel();
  else if (act === 'stay') { hideOverlay(); reStand(); phase = 'build'; say('牌子躺好了，接着改'); hud(); render2(); }
  else if (act === 'stats') showStats();
  else if (act === 'fin') gameOver('全部杀青');
  else if (act === 'close') { if (phase === 'over') showIntro(); else { hideOverlay(); if (phase === 'result') { reStand(); phase = 'build'; } } }
});
function reStand() {
  var i;
  for (i = 0; i < tiles.length; i++) { tiles[i].ang = 0; tiles[i].t = undefined; tiles[i].sounded = false; }
  crownAng = 0; crownSounded = false; simT = 0;
}
byId('btnFall').addEventListener('click', function () { sfx.resume(); startFall(); });
byId('btnUndo').addEventListener('click', function () { sfx.resume(); undo(); });
byId('btnClear').addEventListener('click', function () { sfx.resume(); removeAt(cursor.x, cursor.y); });
byId('btnHint').addEventListener('click', function () { sfx.resume(); useHint(); });
byId('btnStats').addEventListener('click', function () { sfx.resume(); showStats(); });
byId('btnNew').addEventListener('click', function () { sfx.resume(); newRun(); });
byId('btnSound').addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });
byId('diff').addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-diff]') : null;
  if (!t || !t.dataset.diff) return;
  sfx.resume();
  newRun(t.dataset.diff);
});

/* ==================== 启动 ==================== */
(function boot() {
  diff = store.get('dm.diff', 'std');
  if (!DIFFS[diff]) diff = 'std';
  cap = LV().cap;
  resetLevel(false);
  resize();
  window.addEventListener('resize', resize);
  syncSound();
  showIntro();
  window.setInterval(frame, 40);
})();

})();
