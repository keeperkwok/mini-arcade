/* 分拣工厂 —— 传送带不改路，只改方向：每一格地板就是一个箭头，包裹顺箭头一路走到底。
   玩家手里只有扳手：转一格花一把，转错一格全场当场改道。把每种包裹送进对应货架，
   送错、掉出流水线、时限内没送完都要扣信誉。纯前端零依赖，格子逻辑全是纯数据。 */
(function () {
'use strict';

/* ==================== 工厂数据 ==================== */
var W = 9, H = 6, N = W * H;
var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];      // 0 东 1 南 2 西 3 北
var ARROW = ['→', '↓', '←', '↑'];
var FLOOR = 0, WALL = 1, SHELF = 2, CHUTE = 3;
var TYPES = [
  { name: '冰鲜', box: '🧊', into: '冷藏柜' },
  { name: '易碎', box: '🏺', into: '软垫架' },
  { name: '贵重', box: '💰', into: '保险柜' },
  { name: '普通', box: '📦', into: '普通货架' },
];
var DIFFS = {
  calm: { label: '闲时夜班', speed: 700, spawn: 6, base: 5, types: 3, wrench: 12, regen: 2, lives: 6, hints: 5, mult: 0.8, rush: false },
  daily: { label: '白班流水线', speed: 520, spawn: 5, base: 7, types: 4, wrench: 9, regen: 3, lives: 4, hints: 3, mult: 1, rush: false },
  promo: { label: '大促', speed: 380, spawn: 4, base: 9, types: 4, wrench: 7, regen: 4, lives: 3, hints: 1, mult: 1.7, rush: true },
};
var TICK = 40;

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
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'fj.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var beltEl = byId('belt'), queueEl = byId('queue'), msgEl = byId('msg');
var elLv = byId('lv'), elTodo = byId('todo'), elScore = byId('score');
var elWr = byId('wrench'), elLives = byId('lives'), elClock = byId('clock');

/* ==================== 局面 ==================== */
var kind = new Array(N), dir = new Array(N), shel = new Array(N), mark = new Array(N);
var phase = 'intro';
var diff = 'daily';
var level = 1;
var score = 0;
var lives = 0;
var wrench = 0;
var hints = 0;
var streak = 0;
var runSort = 0;
var boxes = [];
var queue = [];
var shelves = [];
var inlet = 0;
var steps = 0;
var nextSpawn = 1;
var left = 0;
var regenAcc = 0;
var beltAcc = 0;
var cur = 0;
var seq = 0;
var planCells = [];

function idx(x, y) { return y * W + x; }
function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
function cx(i) { return i % W; }
function cy(i) { return (i / W) | 0; }
function pick(a) { return a[(Math.random() * a.length) | 0]; }
function shuffled(a) {
  var out = a.slice(), i, j, t;
  for (i = out.length - 1; i > 0; i--) { j = (Math.random() * (i + 1)) | 0; t = out[i]; out[i] = out[j]; out[j] = t; }
  return out;
}

/* ==================== 关卡参数（全部可推算） ==================== */
function D() { return DIFFS[diff]; }
function lv0(lv) { return lv || level; }
function speed(lv) { return Math.max(220, D().speed - 12 * (lv0(lv) - 1)); }
function spawnEvery(lv) { return Math.max(4, D().spawn - Math.floor((lv0(lv) - 1) / 3)); }
function boxesFor(lv) { return Math.min(26, D().base + lv0(lv) - 1); }
function typeCount(lv) { return Math.min(TYPES.length, D().types + Math.floor((lv0(lv) - 1) / 4)); }
function wallCount(lv) { return 3 + Math.min(7, Math.floor(lv0(lv) / 2)); }
function chuteCount(lv) { return (diff === 'calm' && lv0(lv) < 3) ? 0 : Math.min(3, 1 + Math.floor((lv0(lv) - 1) / 6)); }
function limitSec(lv) { return Math.round((boxesFor(lv) * (spawnEvery(lv) + 9) + 40) * speed(lv) / 1000); }

/* ==================== 出图：保证每个货架都到得了 ==================== */
function passable(i) { return kind[i] === FLOOR; }
function reachable() {
  var seen = new Array(N), stack = [inlet], i;
  for (i = 0; i < N; i++) seen[i] = false;
  seen[inlet] = true;
  while (stack.length) {
    var u = stack.pop(), ux = cx(u), uy = cy(u);
    for (var dr = 0; dr < 4; dr++) {
      var nx = ux + DX[dr], ny = uy + DY[dr];
      if (!inb(nx, ny)) continue;
      var v = idx(nx, ny);
      if (seen[v] || !passable(v)) continue;
      seen[v] = true;
      stack.push(v);
    }
  }
  for (i = 0; i < N; i++) {
    if (kind[i] === SHELF) {
      var has = false;
      for (var q = 0; q < 4; q++) {
        var sx = cx(i) + DX[q], sy = cy(i) + DY[q];
        if (inb(sx, sy) && seen[idx(sx, sy)]) has = true;
      }
      if (!has) return false;
    } else if (kind[i] === FLOOR && !seen[i]) return false;
  }
  return true;
}

function genBoard(lv) {
  var tries, i, s;
  for (tries = 0; tries < 300; tries++) {
    for (i = 0; i < N; i++) { kind[i] = FLOOR; shel[i] = -1; dir[i] = 0; }   // 默认整条带子顺流朝右
    var churn = Math.min(15, 4 + lv), cl = [];
    for (i = 0; i < N; i++) cl.push(i);
    cl = shuffled(cl);
    for (var cc = 0; cc < cl.length && churn > 0; cc++) { if (kind[cl[cc]] === FLOOR && cl[cc] !== inlet) { dir[cl[cc]] = (Math.random() * 4) | 0; churn--; } }
    inlet = idx(0, 1 + ((Math.random() * (H - 2)) | 0));
    var nT = typeCount(lv);
    var spots = [];
    for (s = 0; s < H; s++) spots.push(idx(W - 1, s));
    for (s = 0; s < W - 1; s++) spots.push(idx(s, H - 1));
    spots = shuffled(spots);
    shelves = [];
    var ok = true;
    for (var t = 0; t < nT; t++) {
      var got = -1;
      for (s = 0; s < spots.length; s++) {
        var c = spots[s];
        if (c === inlet || nextTo(c, shelves)) continue;
        got = c; break;
      }
      if (got < 0) { ok = false; break; }
      kind[got] = SHELF; shel[got] = t; shelves.push(got);
    }
    if (!ok) continue;
    var open = [];
    for (i = 0; i < N; i++) if (kind[i] === FLOOR && i !== inlet && cx(i) > 0) open.push(i);
    open = shuffled(open);
    var wn = Math.min(wallCount(lv), open.length - 12), placed = 0;
    for (s = 0; s < open.length && placed < wn; s++) {
      var w = open[s];
      if (nextTo(w, shelves)) continue;
      kind[w] = WALL; placed++;
    }
    if (placed < wn) continue;
    var cn = chuteCount(lv), cp = 0;
    for (s = 0; s < open.length && cp < cn; s++) {
      var u = open[s];
      if (kind[u] !== FLOOR || Math.abs(cx(u) - cx(inlet)) < 3 || nextTo(u, shelves)) continue;
      kind[u] = CHUTE; cp++;
    }
    if (cp < cn) continue;
    if (!reachable()) continue;
    dir[inlet] = 0;                  // 入口那格默认朝右，先把货送进车间
    return true;
  }
  return false;
}
function fallbackBoard(lv) {                        // 随机太背也要有班可上
  var i;
  for (i = 0; i < N; i++) { kind[i] = FLOOR; shel[i] = -1; dir[i] = (Math.random() * 4) | 0; }
  inlet = idx(0, 1 + ((Math.random() * (H - 2)) | 0));
  shelves = [];
  var nT = typeCount(lv), top = Math.max(0, ((H - nT) >> 1));
  for (i = 0; i < N; i++) dir[i] = 0;
  for (i = 0; i < nT; i++) { var c = idx(W - 1, Math.min(H - 1, top + i)); kind[c] = SHELF; shel[c] = i; shelves.push(c); }
  dir[inlet] = 0;
  cur = inlet;
}
function nextTo(i, list) {
  for (var k = 0; k < list.length; k++) {
    if (Math.abs(cx(i) - cx(list[k])) + Math.abs(cy(i) - cy(list[k])) <= 1) return true;
  }
  return false;
}

/* ==================== 开班 ==================== */
function beginLevel() {
  var d = D();
  if (!genBoard(level)) fallbackBoard(level);
  boxes = [];
  queue = [];
  var n = boxesFor(level), t;
  for (var s = 0; s < n; s++) {
    t = (Math.random() * typeCount(level)) | 0;
    queue.push({ type: t, rush: !!d.rush && s % 3 === 2 });
  }
  planCells = [];
  for (t = 0; t < N; t++) mark[t] = 0;
  steps = 0;
  nextSpawn = 1;
  wrench = d.wrench;
  hints = d.hints;
  regenAcc = 0;
  beltAcc = 0;
  left = limitSec(level);
  cur = inlet;
  phase = 'play';
  store.set('fj.level', Math.max(num('fj.level'), level));
  say('<b>第 ' + level + ' 班</b>：' + n + ' 件货 · 时限 ' + left + ' 秒 · ' + d.wrench + ' 把扳手 —— 送完这班就收工');
  render(); hud();
}

/* ==================== 流水线 ==================== */
function frame() {
  var dt = TICK / 1000;
  if (phase !== 'play') return;
  left -= dt;
  if (left <= 0) { left = 0; timeout(); return; }
  regenAcc += dt;
  while (regenAcc >= D().regen) {
    regenAcc -= D().regen;
    if (wrench < D().wrench) { wrench++; flash(elWr); }
  }
  beltAcc += TICK;
  var sp = speed(level);
  while (beltAcc >= sp && phase === 'play') {
    beltAcc -= sp;
    beltStep();
  }
  hud();
}

function beltStep() {
  steps++;
  if (queue.length && steps >= nextSpawn) {
    var o = queue.shift();
    boxes.push({ id: ++seq, type: o.type, rush: o.rush, x: cx(inlet), y: cy(inlet), moves: 0, bump: 0, done: false });
    nextSpawn = steps + spawnEvery(level);
    sfx.tone(320, 0.05, 'sine', 0.08);
  }
  var order = boxes.slice().reverse();
  for (var i = 0; i < order.length; i++) {
    var b = order[i];
    if (b.done) continue;
    advance(b);
    if (!b.done && b.rush) advance(b);
  }
  if (phase !== 'play') return;
  boxes = boxes.filter(function (x) { return !x.done; });
  render(); hud();
  if (!queue.length && !boxes.length) endLevel(true);
}

function advance(b) {
  var here = idx(b.x, b.y), dr = dir[here];
  var nx = b.x + DX[dr], ny = b.y + DY[dr];
  if (!inb(nx, ny)) { requeue(b, edgeName(nx, ny)); return; }
  var to = idx(nx, ny);
  if (kind[to] === WALL) { b.bump++; return; }               // 撞上货架腿：原地等扳手
  if (kind[to] === CHUTE) { fail(b, '掉进了碎包机'); return; }
  b.x = nx; b.y = ny; b.moves++;
  if (kind[to] === SHELF) {
    if (shel[to] === b.type) arrive(b, to);
    else crash(b, to);
  }
}

function arrive(b, to) {
  b.done = true;
  var d = D();
  var base = (b.rush ? 90 : 60) + 8 * level;
  var gain = Math.round(base * d.mult * (1 + 0.2 * Math.min(streak, 5)));
  score += gain; streak++; runSort++;
  store.set('fj.sort', num('fj.sort') + 1);
  store.set('fj.best', Math.max(num('fj.best'), score));
  sfx.melody([[659, 0.06], [988, 0.09]]);
  say('<b>' + TYPES[b.type].box + ' ' + TYPES[b.type].into + '</b> 入库 + ' + gain + ' 分'
    + (b.rush ? '（加急件）' : '') + (streak > 1 ? ' · 连送 ×' + (1 + 0.2 * Math.min(streak - 1, 5)).toFixed(1) : '')
    + ' · 走了 ' + b.moves + ' 格');
}

function crash(b, to) {
  b.done = true;
  hurt('送错架：' + TYPES[b.type].name + ' 塞进了 ' + TYPES[shel[to]].into);
}
function requeue(b, edge) {
  b.done = true;
  streak = 0;
  queue.push({ type: b.type, rush: b.rush });
  sfx.noise(0.1, 0.1);
  say(TYPES[b.type].box + ' 从'+ edge + '掉出车间 —— 重新排队，后面还压着 ' + queue.length + ' 件');
  hud();
}
function edgeName(nx, ny) { return nx < 0 ? '左边' : ny < 0 ? '上边' : nx >= W ? '右边' : '下边'; }
function fail(b, how) { b.done = true; hurt(how); }

function hurt(msg) {
  lives--;
  streak = 0;
  sfx.noise(0.18, 0.16);
  if (lives <= 0) { hud(); gameOver(msg + ' —— 信誉清零'); return; }
  say(msg + ' · 信誉 -1（剩 ' + lives + '）');
  hud();
}

function timeout() {
  var miss = queue.length + boxes.length;
  queue = [];
  boxes = [];
  if (!miss) { endLevel(true); return; }
  lives -= miss;
  streak = 0;
  sfx.noise(0.3, 0.18);
  if (lives <= 0) { hud(); gameOver('时限到，还压着 ' + miss + ' 单'); return; }
  say('时限到了，' + miss + ' 单没送完 —— 信誉 -' + miss + '（剩 ' + lives + '）');
  endLevel(false);
}

function endLevel(cleared) {
  var d = D();
  var bonus = 0;
  if (cleared) {
    bonus = Math.round((50 + 25 * level + 8 * wrench) * d.mult);
    score += bonus;
    store.set('fj.best', Math.max(num('fj.best'), score));
    sfx.melody([[659, 0.07], [880, 0.07], [1175, 0.14]]);
    say('<b>第 ' + level + ' 班收工</b> · 结余 ' + wrench + ' 把扳手 · 奖金 +' + bonus + ' 分');
  }
  phase = 'rest';
  level++;
  store.set('fj.level', Math.max(num('fj.level'), level));
  hud();
  window.setTimeout(function () { if (phase === 'rest') beginLevel(); }, cleared ? 1600 : 2000);
}

/* ==================== 找路线（0-1 代价：转一格算一次） ==================== */
function planRoute(b) {
  var dist = new Array(N), prev = new Array(N), pd = new Array(N), done = new Array(N);
  var i;
  for (i = 0; i < N; i++) { dist[i] = 1e9; prev[i] = -1; pd[i] = -1; done[i] = false; }
  var start = idx(b.x, b.y);
  dist[start] = 0;
  for (;;) {
    var u = -1, best = 1e9;
    for (i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = true;
    if (kind[u] !== FLOOR) continue;
    for (var dr = 0; dr < 4; dr++) {
      var nx = cx(u) + DX[dr], ny = cy(u) + DY[dr];
      if (!inb(nx, ny)) continue;
      var v = idx(nx, ny);
      if (kind[v] === WALL || kind[v] === CHUTE) continue;
      if (kind[v] === SHELF && shel[v] !== b.type) continue;
      var c = dist[u] + (dir[u] === dr ? 0 : 1);
      if (c < dist[v]) { dist[v] = c; prev[v] = u; pd[v] = dr; }
    }
  }
  var goal = -1, gb = 1e9;
  for (i = 0; i < shelves.length; i++) {
    var s = shelves[i];
    if (shel[s] === b.type && dist[s] < gb) { gb = dist[s]; goal = s; }
  }
  if (goal < 0 || gb >= 1e9) return null;
  var cells = [], dirs = [];
  for (var p = goal; p >= 0; p = prev[p]) { cells.push(p); dirs.push(pd[p]); if (p === start) break; }
  cells.reverse(); dirs.reverse();
  return { cells: cells, dirs: dirs, cost: gb, goal: goal };
}

function frontBox() {
  var best = null;
  for (var i = 0; i < boxes.length; i++) if (!best || boxes[i].id < best.id) best = boxes[i];
  return best;
}

function clearMarks() {
  for (var i = 0; i < N; i++) mark[i] = 0;
  planCells = [];
  render();
}

function hint() {
  if (phase !== 'play') return;
  var b = frontBox();
  if (!b) { say('线上没货，先喘口气'); return; }
  if (hints <= 0) { say('画线笔用完了 —— 剩下的靠自己'); return; }
  var r = planRoute(b);
  if (!r) { say('这一件眼下绕不过去，先把它前面那格转开'); return; }
  hints--;
  for (var i = 0; i < r.cells.length; i++) mark[r.cells[i]] = 1;
  planCells = r.cells.slice();
  sfx.tone(760, 0.08, 'sine', 0.11);
  say('路线画好：' + TYPES[b.type].box + ' → ' + TYPES[b.type].into + '，照虚线补 ' + fixList(r).length + ' 下扳手');
  hud(); render();
  window.setTimeout(clearMarks, 4500);
}
function fixList(r) {                       // 虚线上哪几格还得转、转成哪个方向
  var out = [];
  for (var i = 0; i < r.cells.length - 1; i++) {
    if (dir[r.cells[i]] !== r.dirs[i + 1]) out.push({ cell: r.cells[i], to: r.dirs[i + 1], from: dir[r.cells[i]] });
  }
  return out;
}

function showNext() {
  if (phase !== 'play') return;
  var b = frontBox();
  if (!b) { say('下一件还没打进来单'); return; }
  for (var i = 0; i < shelves.length; i++) if (shel[shelves[i]] === b.type) mark[shelves[i]] = 2;
  planCells = shelves.slice();
  sfx.tone(560, 0.07, 'sine', 0.1);
  say('下一件：' + TYPES[b.type].box + ' ' + TYPES[b.type].name + ' —— 送进高亮那座 ' + TYPES[b.type].into + (b.rush ? '（加急）' : ''));
  render();
  window.setTimeout(clearMarks, 4500);
}

/* ==================== 扳手 ==================== */
function rotate(i, stepBy) {
  if (phase !== 'play') return;
  cur = i;
  if (kind[i] !== FLOOR) { say('货架、架腿和碎包机都转不动'); sfx.noise(0.07, 0.07); hud(); return; }
  if (wrench <= 0) { say('扳手用完了 —— 等工具车补一把（每 ' + D().regen + ' 秒一把）'); sfx.noise(0.09, 0.09); hud(); return; }
  wrench--;
  dir[i] = (dir[i] + (stepBy > 0 ? 1 : 3)) % 4;
  if (mark[i] === 1) { mark[i] = 0; }
  sfx.tone(150 + dir[i] * 45, 0.05, 'square', 0.09);
  render(); hud();
}

/* ==================== 全局流转 ==================== */
function newRun(key) {
  if (key && DIFFS[key]) diff = key;
  phase = 'play';
  level = 1; score = 0; lives = D().lives; streak = 0; runSort = 0;
  store.set('fj.diff', diff);
  hideOverlay();
  beginLevel();
  markDiff();
}

function gameOver(reason) {
  if (phase === 'over') return;
  phase = 'over';
  store.set('fj.best', Math.max(num('fj.best'), score));
  sfx.melody([[440, 0.12], [330, 0.14], [220, 0.22]]);
  ovContent.innerHTML = '<div class="ov-emoji">🏭</div><h2>' + (reason || '仓库停工') + '</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">上到第 ' + level + ' 班 · 本班送出 ' + runSort + ' 件</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一班</button>' +
    '<button class="ghost" data-act="stats">看战绩</button></div>';
  overlayEl.classList.add('show');
  hud();
}

function showStats() {
  ovContent.innerHTML = '<div class="ov-emoji">📦</div><h2>本机战绩</h2>' +
    '<div class="fj-list">最高分 <b>' + num('fj.best') + '</b><br>最远上到第 <b>' + num('fj.level') + '</b> 班<br>' +
    '历代累计入库 <b>' + num('fj.sort') + '</b> 件</div>' +
    '<div class="ov-actions"><button class="primary" data-act="close">继续</button>' +
    '<button class="ghost" data-act="again">重新开始</button></div>';
  overlayEl.classList.add('show');
}

function showIntro() {
  phase = 'intro';
  ovContent.innerHTML = '<div class="ov-emoji">🏭</div><h2>分拣工厂</h2>' +
    '<p class="hint">流水线上每一格都是一个箭头，包裹<b>顺着箭头</b>走：撞上货架腿就原地等你，掉出车间只是<b>重新排队</b>（时间照样在跑）。<br>' +
    '你改不了路，只能<b>转方向</b>：点一格转 90°，一把扳手一次。转过的格子会立刻改写<b>全场</b>的走向 —— ' +
    '后面还在跑的那几件也跟着改道。<br>' +
    '🧊 进冷藏柜、🏺 进软垫架、💰 进保险柜：<b>送错架</b>、被<b>碎包机</b>吞了、时限到还压着单，都扣信誉；信誉清零就破产。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开班</button></div>';
  overlayEl.classList.add('show');
  markDiff();
  hud();
}
function hideOverlay() { overlayEl.classList.remove('show'); }

/* ==================== 渲染 ==================== */
function render() {
  var i, html = '', onCell = {};
  for (i = 0; i < boxes.length; i++) {
    var k = idx(boxes[i].x, boxes[i].y);
    (onCell[k] = onCell[k] || []).push(boxes[i]);
  }
  for (i = 0; i < N; i++) {
    var cls = 'fj-c', inner;
    if (kind[i] === FLOOR) { inner = '<i class="ar">' + ARROW[dir[i]] + '</i>'; }
    else if (kind[i] === WALL) { inner = '<i class="ar wt">▩</i>'; cls += ' wl'; }
    else if (kind[i] === CHUTE) { inner = '<i class="hz">🗑️</i>'; cls += ' ct'; }
    else { inner = '<i class="sf">' + TYPES[shel[i]].box + '</i>'; cls += ' sf' + shel[i]; }
    if (i === inlet) cls += ' inl';
    if (i === cur && phase === 'play') cls += ' cur';
    if (mark[i] === 1) cls += ' pl';
    if (mark[i] === 2) cls += ' gt';
    var bs = onCell[i];
    if (bs) {
      inner += '<i class="bx' + (bs[0].rush ? ' rj' : '') + '">' + TYPES[bs[0].type].box + '</i>';
      if (bs.length > 1) inner += '<b class="cn">' + bs.length + '</b>';
    }
    html += '<button class="' + cls + '" data-i="' + i + '">' + inner + '</button>';
  }
  beltEl.innerHTML = html;
  var q = '', shown = 0;
  for (i = 0; i < queue.length && shown < 12; i++, shown++) {
    q += '<i class="q' + (queue[i].rush ? ' rj' : '') + '">' + TYPES[queue[i].type].box + '</i>';
  }
  if (queue.length > shown) q += '<b class="more">+' + (queue.length - shown) + '</b>';
  queueEl.innerHTML = q || '<b class="more">最后一件</b>';
}

function hud() {
  elLv.textContent = String(level);
  elTodo.textContent = String(queue.length + boxes.length);
  elScore.textContent = String(score);
  elWr.textContent = String(wrench);
  elLives.textContent = String(lives);
  elClock.textContent = Math.ceil(left) + 's';
  byId('hintN').textContent = String(hints);
  byId('btnHint').disabled = phase !== 'play' || hints <= 0;
}
function flash(el) {
  if (!el || !el.classList) return;
  el.classList.add('pop');
  window.setTimeout(function () { el.classList.remove('pop'); }, 260);
}
function say(html) { msgEl.innerHTML = html; }
function markDiff() {
  var btns = byId('diff').querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
}

/* ==================== 事件 ==================== */
beltEl.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-i]') : null;
  if (!t) return;
  sfx.resume();
  rotate(Number(t.dataset.i), e.shiftKey ? -1 : 1);
});
beltEl.addEventListener('contextmenu', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-i]') : null;
  if (!t) return;
  if (e.preventDefault) e.preventDefault();
  rotate(Number(t.dataset.i), -1);
});
beltEl.addEventListener('pointerover', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-i]') : null;
  if (!t) return;
  var v = Number(t.dataset.i);
  if (v === cur) return;
  cur = v;
  render();
});
ovContent.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  var act = t && t.dataset ? t.dataset.act : null;
  if (!act) return;
  sfx.resume();
  if (act === 'start' || act === 'again') newRun();
  else if (act === 'stats') showStats();
  else if (act === 'close') { if (phase === 'play' || phase === 'rest') hideOverlay(); else showIntro(); }
});
byId('diff').addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-diff]') : null;
  if (!t || !t.dataset.diff) return;
  sfx.resume();
  newRun(t.dataset.diff);
});
byId('btnHint').addEventListener('click', function () { sfx.resume(); hint(); });
byId('btnPlan').addEventListener('click', function () { sfx.resume(); showNext(); });
byId('btnStats').addEventListener('click', function () { sfx.resume(); showStats(); });
byId('btnNew').addEventListener('click', function () { sfx.resume(); newRun(); });
soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });

window.addEventListener('keydown', function (e) {
  var k = (e.key || '').toLowerCase();
  if (k === 'arrowright' || k === 'd') { cur = inb(cx(cur) + 1, cy(cur)) ? idx(cx(cur) + 1, cy(cur)) : cur; render(); return; }
  if (k === 'arrowleft' || k === 'a') { cur = inb(cx(cur) - 1, cy(cur)) ? idx(cx(cur) - 1, cy(cur)) : cur; render(); return; }
  if (k === 'arrowdown' || k === 's') { cur = inb(cx(cur), cy(cur) + 1) ? idx(cx(cur), cy(cur) + 1) : cur; render(); return; }
  if (k === 'arrowup' || k === 'w') { cur = inb(cx(cur), cy(cur) - 1) ? idx(cx(cur), cy(cur) - 1) : cur; render(); return; }
  if (k === ' ' || k === 'enter') { rotate(cur, 1); e.preventDefault(); return; }
  if (k === 'x') { rotate(cur, -1); return; }
  if (k === 'h') { hint(); return; }
  if (k === 'p') { showNext(); return; }
  if (k === 't') { showStats(); return; }
  if (k === 'n') { newRun(); return; }
  if (k === 'm') { sfx.toggle(); syncSound(); return; }
  if (k === 'escape') hideOverlay();
});

/* ==================== 启动 ==================== */
(function boot() {
  diff = store.get('fj.diff', 'daily');
  if (!DIFFS[diff]) diff = 'daily';
  lives = D().lives;
  wrench = D().wrench;
  hints = D().hints;
  if (!genBoard(1)) fallbackBoard(1);
  cur = inlet;
  render();
  hud();
  syncSound();
  showIntro();
  window.setInterval(frame, TICK);
})();

})();
