/* 推箱子 —— 仓库搬箱：一次只能推一个，只能推不能拉，顶进墙角就永远拿不出来。
   机制：① 关卡用「反向拉箱」生成——先把箱子摆在卸货位上，再按合法的逆操作把它们拉乱，
   倒带回放就是一份现成解法，所以每一关都保证有解；
   ② 「最优步」是现场 BFS 搜出来的真实最短步数（状态 = 仓管员位置 + 箱子集合），
   所以分数只跟你的手顺较劲：步数越接近最优，倍率越高；
   ③ 每一步都会重新搜一次，推成死局立刻告诉你，别硬走 —— 撤销免费，但走掉的步数不退。
   纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 常量与难度表 ==================== */
var STAGES = 10;
var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // 上 右 下 左
var DIFFS = {
  stack: { key: 'stack', label: '小仓库', w: 6, h: 6, boxes: 2, walls: 1, wallPer: 5, pulls: 22, parMin: 11, slack: 30, hints: 3, lives: 3, mult: 0.8 },
  shift: { key: 'shift', label: '中班', w: 7, h: 7, boxes: 3, walls: 3, wallPer: 4, pulls: 30, parMin: 15, slack: 24, hints: 2, lives: 3, mult: 1 },
  hoard: { key: 'hoard', label: '爆仓', w: 8, h: 7, boxes: 3, walls: 6, wallPer: 3, pulls: 40, parMin: 21, slack: 17, hints: 1, lives: 2, mult: 1.7 },
};
var MIN_OFF = 2;        // 打乱之后至少还要有 2 个箱子没归位，否则太没意思
var MIN_PULL = 2;       // 至少要成功拉箱两次，不然局面基本没动过
var BFS_CAP = 120000;   // 单次搜索的展开上限，超了就算这关太难，换一盘
var ATTEMPTS = 14;      // 每关最多试多少套局面，试不出来就取手顺最深的那套

function rngOf(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FIXED_SEED：地址栏写 #seed=数字 就能钉住整串关卡（同一批仓库比谁步数少）
var FIXED_SEED = (function () {
  var m = /seed=(\d+)/.exec((typeof location !== 'undefined' && location.hash) || '');
  return m ? (parseInt(m[1], 10) >>> 0) : 0;
})();
var seedBase = 0;

/* ==================== 纯规则：房间 / 邻居 / 求解 ==================== */
function nbr(room, i, d) {
  var x = i % room.w + DIRS[d][0];
  var y = ((i - (i % room.w)) / room.w) + DIRS[d][1];
  if (x < 0 || y < 0 || x >= room.w || y >= room.h) return -1;
  return y * room.w + x;
}
function blocked(room, bs, i) { return room.wall[i] || bs.indexOf(i) >= 0; }
function asc(a, b) { return a - b; }
function sortBs(bs) { return bs.slice().sort(asc); }
function skey(p, bs) { return sortBs(bs).join(',') + '|' + p; }
function allOn(room, bs) {
  for (var i = 0; i < bs.length; i++) if (!room.target[bs[i]]) return false;
  return true;
}
function offCount(room, bs) {
  var n = 0;
  for (var i = 0; i < bs.length; i++) if (!room.target[bs[i]]) n++;
  return n;
}

// 一个格子是不是「死角」（两面朝墙，箱子进去就出不来）
function cornerOf(room, i) {
  var bad = 0;
  for (var d = 0; d < 4; d++) {
    var n = nbr(room, i, d);
    if (n < 0 || room.wall[n]) bad++;
  }
  if (bad < 2) return false;
  // 两面墙必须相邻（成 L 形），面对面两墙是通道中间，不算死
  for (var a = 0; a < 4; a++) {
    var b = (a + 1) % 4;
    var na = nbr(room, i, a), nb = nbr(room, i, b);
    var wa = na < 0 || room.wall[na], wb = nb < 0 || room.wall[nb];
    if (wa && wb) return true;
  }
  return false;
}

/* BFS 求最少步数：状态 = 仓管员位置 + 箱子集合。胜利是「所有箱子在卸货位」这一整类状态。 */
function solve(room, p0, bs0, cap) {
  var start = sortBs(bs0);
  if (allOn(room, start)) return { dist: 0, path: [], first: -1 };
  var limit = cap || BFS_CAP;
  var startKey = skey(p0, start);
  var dist = {}; dist[startKey] = 0;
  var from = {};
  var queue = [{ p: p0, b: start, k: startKey }];
  var head = 0, expanded = 0;
  while (head < queue.length) {
    var cur = queue[head++];
    expanded++;
    if (expanded > limit) return null;         // 搜不完：当作太难，换一盘
    for (var d = 0; d < 4; d++) {
      var np = nbr(room, cur.p, d);
      if (np < 0 || room.wall[np]) continue;
      var nb = cur.b;
      var bi = cur.b.indexOf(np);
      if (bi >= 0) {
        var dest = nbr(room, np, d);
        if (dest < 0 || room.wall[dest] || cur.b.indexOf(dest) >= 0) continue;
        nb = sortBs(cur.b.slice(0, bi).concat(cur.b.slice(bi + 1), [dest]));
      }
      var k = skey(np, nb);
      if (k in dist) continue;
      dist[k] = dist[cur.k] + 1;
      from[k] = { prev: cur.k, d: d };
      if (allOn(room, nb)) {
        var path = [];
        var walk = k;
        while (from[walk]) { path.unshift(from[walk].d); walk = from[walk].prev; }
        return { dist: path.length, path: path, first: path[0] };
      }
      queue.push({ p: np, b: nb, k: k });
    }
  }
  return null;                                  // 无解（死局）
}

// 按一串方向走完，返回终局；测试用来自查「解法回放」
function replay(room, p, bs, path) {
  var man = p, boxes = bs.slice();
  for (var i = 0; i < path.length; i++) {
    var r = walk(room, man, boxes, path[i]);
    if (!r) return null;
    man = r.p; boxes = r.b;
  }
  return { p: man, b: boxes };
}
// 走一步：返回新状态，走不动返回 null
function walk(room, p, bs, d) {
  var np = nbr(room, p, d);
  if (np < 0 || room.wall[np]) return null;
  var bi = bs.indexOf(np);
  if (bi < 0) return { p: np, b: bs.slice(), pushed: false, at: -1 };
  var dest = nbr(room, np, d);
  if (dest < 0 || room.wall[dest] || bs.indexOf(dest) >= 0) return null;
  var nb = bs.slice();
  nb[bi] = dest;
  return { p: np, b: nb, pushed: true, at: dest };
}

/* ==================== 出题：盖房间 → 摆箱子 → 反向拉乱 ==================== */
function buildRoom(rnd, w, h, wallCount) {
  var n = w * h;
  var wall = new Array(n);
  for (var i = 0; i < n; i++) {
    var x = i % w, y = (i - x) / w;
    wall[i] = (x === 0 || y === 0 || x === w - 1 || y === h - 1);
  }
  var inner = [];
  for (var j = 0; j < n; j++) if (!wall[j]) inner.push(j);
  for (var attempt = 0; attempt < 40; attempt++) {
    var w2 = wall.slice();
    var pick = inner.slice();
    shuffle(pick, rnd);
    for (var k = 0; k < wallCount && k < pick.length - 6; k++) w2[pick[k]] = true;
    var room = { w: w, h: h, wall: w2, target: new Array(w * h).fill(false), free: [] };
    for (var c = 0; c < w * h; c++) if (!room.wall[c]) room.free.push(c);
    if (room.free.length < 10 || !connected(room)) continue;
    return room;
  }
  var plain = { w: w, h: h, wall: wall, target: new Array(w * h).fill(false), free: [] };
  for (var q = 0; q < w * h; q++) if (!plain.wall[q]) plain.free.push(q);
  return plain;
}
function connected(room) {
  var seen = {};
  var stack = [room.free[0]];
  seen[stack[0]] = 1;
  while (stack.length) {
    var cur = stack.pop();
    for (var d = 0; d < 4; d++) {
      var nx = nbr(room, cur, d);
      if (nx < 0 || room.wall[nx] || seen[nx]) continue;
      seen[nx] = 1;
      stack.push(nx);
    }
  }
  return Object.keys(seen).length === room.free.length;
}
function shuffle(arr, rnd) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// 空格走位：仓管员只走空地（不能穿箱子），返回一串方向；走不通返回 null
function reach(room, from, to, bs) {
  if (from === to) return [];
  var prev = {};
  prev[from] = -1;
  var q = [from], head = 0;
  while (head < q.length) {
    var cur = q[head++];
    for (var d = 0; d < 4; d++) {
      var nx = nbr(room, cur, d);
      if (nx < 0 || room.wall[nx] || bs.indexOf(nx) >= 0 || (nx in prev)) continue;
      prev[nx] = cur * 4 + d;
      if (nx === to) {
        var out = [], c = nx;
        while (c !== from) { var v = prev[c]; out.unshift(v % 4); c = (v - (v % 4)) / 4; }
        return out;
      }
      q.push(nx);
    }
  }
  return null;
}

// 能拉的组合：箱子朝 d 挪一格（那一格必须空），仓管员再退一格（也必须空）
function pullList(room, bs) {
  var out = [];
  for (var i = 0; i < bs.length; i++) {
    for (var d = 0; d < 4; d++) {
      var mid = nbr(room, bs[i], d);
      var back = mid < 0 ? -1 : nbr(room, mid, d);
      if (mid < 0 || back < 0) continue;
      if (room.wall[mid] || room.wall[back]) continue;
      if (bs.indexOf(mid) >= 0 || bs.indexOf(back) >= 0) continue;
      out.push({ i: i, d: d, mid: mid, back: back });
    }
  }
  return out;
}
// 执行一次拉箱：调用前先把仓管员挪到 mv.mid（doPull 只负责搬箱 + 后退）
function doPull(room, p, bs, mv) {
  var nb = bs.slice();
  nb[mv.i] = mv.mid;
  return { p: mv.back, b: nb };
}

/* 一关：盖房间 → 摆到「已经码好」的局面 → 反着拉乱 → BFS 求出真实最优步
   拉之前先让仓管员走到箱子那一侧，走不过去就换一箱，所以拉得动也拉得够乱。
   房间大小、箱子数、墙数都写死在难度表里（每档最多 3 箱），所以 BFS 一定跑得完，
   「这关还是活的」这个判断也就不会骗人。 */
function tryLevel(rnd, cfg, stage, minOff) {
    var room = buildRoom(rnd, cfg.w, cfg.h, cfg.walls + Math.floor(stage / cfg.wallPer));
    var cells = room.free.slice();
    shuffle(cells, rnd);
    var boxes = cells.slice(0, cfg.boxes);
    for (var i = 0; i < boxes.length; i++) room.target[boxes[i]] = true;
    var cur = { p: cells[cfg.boxes], b: boxes.slice() };
    var pulled = 0, last = null;
    for (var step = 0; step < cfg.pulls + stage * 4; step++) {
      var list = pullList(room, cur.b);
      if (!list.length) break;
      shuffle(list, rnd);
      var hit = null;
      for (var t = 0; t < list.length; t++) {
        var mv = list[t];
        if (last && mv.i === last.i && (mv.d + 2) % 4 === last.d) continue;   // 别原路拉回去
        if (reach(room, cur.p, mv.mid, cur.b) === null) continue;             // 人走不过去
        hit = mv;
        break;
      }
      if (!hit) break;
      cur.p = hit.mid;
      cur = doPull(room, cur.p, cur.b, hit);
      last = hit;
      pulled++;
    }
    if (pulled < MIN_PULL) return null;
    if (offCount(room, cur.b) < minOff) return null;
    var sol = solve(room, cur.p, cur.b, BFS_CAP);
    if (!sol || sol.dist < 3) return null;
    return { room: room, p: cur.p, b: sortBs(cur.b), par: sol.dist, path: sol.path, pulled: pulled };
}

function makeLevel(rnd, cfg, stage) {
  var best = null;
  var minPar = cfg.parMin + Math.round(stage * 0.6);
  for (var attempt = 0; attempt < ATTEMPTS; attempt++) {
    var got = tryLevel(rnd, cfg, stage, MIN_OFF);
    if (!got) continue;
    if (!best || got.par > best.par) best = got;
    if (got.par >= minPar) return got;
  }
  if (best) return best;
  // 连着 14 套都被否（房间太挤）：放宽到「只有一个箱子没归位也行」再来一轮
  for (var retry = 0; retry < 8; retry++) {
    var loose = tryLevel(rnd, cfg, stage, 1);
    if (loose && (!best || loose.par > best.par)) best = loose;
  }
  return best || flatLevel(cfg);
}
// 保底关：一箱一地的直路，推两步到位（正常永远走不到，只防生成器抽风）
function flatLevel(cfg) {
  var w = cfg.w, h = cfg.h, n = w * h;
  var room = { w: w, h: h, wall: new Array(n), target: new Array(n).fill(false), free: [] };
  for (var i = 0; i < n; i++) {
    var x = i % w, y = (i - x) / w;
    room.wall[i] = (x === 0 || y === 0 || x === w - 1 || y === h - 1);
  }
  for (var q = 0; q < n; q++) if (!room.wall[q]) room.free.push(q);
  var box = w + 1;
  room.target[box + 2] = true;
  room.target[box + 3] = true;
  return { room: room, p: box + 4, b: [box], par: 4, path: [1, 1, 1, 1], pulled: 0 };
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
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'sb.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var roomEl = byId('room'), msgEl = byId('msg');
var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elMoves = byId('moves'), elPar = byId('par'), elLives = byId('lives'), elScore = byId('score');
var elHint = byId('hintN'), elUndo = byId('undoN'), btnHint = byId('btnHint'), btnUndo = byId('btnUndo');
var cellEls = [];

/* ==================== 局面状态 ==================== */
var phase = 'intro';       // intro | play | clear | over
var diff = store.get('sb.diff', 'shift');
if (!DIFFS[diff]) diff = 'shift';
var stage = 0, score = 0, lives = 3, hints = 3, moves = 0, undos = 0, pushTotal = 0;
var room = null, player = 0, boxes = [], start0 = 0, startBoxes = [], targets = [];
var par = 0, live = true, hist = [], hintStep = -1, hinted = false, lastGain = 0, stars = 0, popAt = -1;

function D() { return DIFFS[diff]; }
function budget() { return par + D().slack; }
function effOf(m) {
  var half = Math.ceil(D().slack * 0.4);
  if (m <= par) return 1.6;
  if (m <= par + half) return 1.2;
  if (m <= budget()) return 0.9;
  return 0.6;
}
function starOf(m) {
  var half = Math.ceil(D().slack * 0.4);
  if (m <= par && !hinted) return 3;
  if (m <= par + half) return 2;
  return 1;
}
function levelGain() { return Math.round((80 + par * 18) * effOf(moves) * D().mult); }

/* ==================== 关卡流程 ==================== */
function newRound() {
  score = 0;
  stage = 0;
  lives = D().lives;
  pushTotal = 0;
  seedBase = (FIXED_SEED || ((Date.now() >>> 0) ^ (Math.floor(Math.random() * 0xffffffff) >>> 0))) >>> 0;
  startStage(0);
}
function startStage(i) {
  stage = i;
  var cfg = D();
  var rnd = rngOf((seedBase + i * 7919) >>> 0);
  var lv = makeLevel(rnd, cfg, i);
  room = lv.room;
  targets = room.target.slice();
  start0 = lv.p;
  startBoxes = lv.b.slice();
  player = lv.p;
  boxes = lv.b.slice();
  par = lv.par;
  moves = 0;
  undos = 0;
  pushTotal = 0;
  hinted = false;
  hintStep = -1;
  hist = [];
  lives = Math.max(1, lives);
  hints = cfg.hints;
  popAt = -1;
  phase = 'play';
  live = solve(room, player, boxes) !== null;
  buildBoard();
  hud();
  render();
  msg('把 <b>' + boxes.length + '</b> 个箱子推上 <b>' + targets.filter(Boolean).length + '</b> 个 ● 地台 —— 最优 <b>' + par + '</b> 步，走满 <b>' + budget() + '</b> 步算加班');
}
function resetStage(fresh) {
  player = start0;
  boxes = startBoxes.slice();
  popAt = -1;
  hist = [];
  hintStep = -1;
  live = true;
  if (fresh) { moves = 0; undos = 0; }   // 花掉一次加班额度的重来，步数才算新的
  render();
  hud();
}
function undo() {
  if (phase !== 'play' || !hist.length) { sfx.tone(150, 0.05, 'square', 0.1); return; }
  var s = hist.pop();
  player = s.p;
  boxes = s.b;
  undos++;
  hintStep = -1;
  popAt = -1;
  live = s.live;
  sfx.tone(520, 0.04, 'triangle', 0.1);
  render();
  hud();
  msg('撤销回上一步（走掉的步数可不退回来）');
}
function move(d) {
  if (phase !== 'play') return false;
  var r = walk(room, player, boxes, d);
  if (!r) {
    var np = nbr(room, player, d);
    sfx.tone(130, 0.06, 'sawtooth', 0.09);
    msg(np >= 0 && room.wall[np] ? '<span class="sb-bad">那是墙，撞了会疼</span>' : '<span class="sb-bad">这个方向推不动</span>');
    hintStep = -1;
    render();
    return false;
  }
  hist.push({ p: player, b: boxes.slice(), live: live });
  player = r.p;
  boxes = r.b;
  moves++;
  hintStep = -1;
  popAt = r.pushed ? r.at : -1;
  if (r.pushed) {
    pushTotal++;
    store.set('sb.push', num('sb.push') + 1);
    sfx.tone(300 + (room.target[r.p] ? 160 : 0), 0.05, 'square', 0.12, 0, 240);
  } else {
    sfx.tone(200, 0.02, 'triangle', 0.05);
  }
  if (allOn(room, boxes)) { clearStage(); return true; }
  if (moves > budget()) { overBudget(); return true; }
  live = solve(room, player, boxes) !== null;
  if (!live) msg('<span class="sb-bad">推死了 —— 按 <kbd>Z</kbd> 撤销，或 <kbd>R</kbd> 重置本关</span>');
  render();
  hud();
  return true;
}
function overBudget() {
  lives--;
  render();
  hud();
  if (lives <= 0) { gameOver('加班额度用完了'); return; }
  phase = 'clear';
  sfx.melody([[330, 0.1], [262, 0.16]]);
  show('<div class="ov-emoji">⏰</div><h2>超时了</h2>' +
    '<p class="hint">这一关走了 <b>' + moves + '</b> 步，上限 <b>' + budget() + '</b> 步。<br>' +
    '还剩 <b>' + lives + '</b> 次加班额度，局面回到开局的样子。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="retry">重来这关</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function clearStage() {
  lastGain = levelGain();
  stars = starOf(moves);
  score += lastGain;
  phase = 'clear';
  if (score > num('sb.best')) store.set('sb.best', score);
  if (stage + 1 > num('sb.lv')) store.set('sb.lv', stage + 1);
  sfx.melody([[659, 0.07], [880, 0.09], [1046, 0.14]]);
  render();
  hud();
  var more = stage + 1 < STAGES;
  show('<div class="ov-emoji">🎉</div><h2>第 ' + (stage + 1) + ' 关清库</h2>' +
    '<p class="sb-stars">' + '★'.repeat(stars) + '<span style="opacity:.35">' + '★'.repeat(3 - stars) + '</span></p>' +
    '<p class="hint">' + moves + ' 步 / 最优 <b>' + par + '</b> 步 · 倍率 ×' + effOf(moves) +
    (hinted ? ' · 用过提示' : '') + '<br><b>+' + lastGain + '</b> 分，累计 ' + score + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="' + (more ? 'next' : 'finish') + '">' +
    (more ? '下一关 ▶' : '收工结算') + '</button><button class="ghost" data-act="stats">战绩</button></div>');
}
function finishRun() {
  phase = 'over';
  if (score > num('sb.best')) store.set('sb.best', score);
  if (STAGES > num('sb.lv')) store.set('sb.lv', STAGES);
  sfx.melody([[523, 0.1], [659, 0.1], [784, 0.1], [1046, 0.2]]);
  show('<div class="ov-emoji">🏅</div><h2>今天这班结得漂亮</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">' + D().label + ' · ' + STAGES + ' 关全清 · 最高纪录 ' + num('sb.best') + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再上一班</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function gameOver(reason) {
  phase = 'over';
  if (score > num('sb.best')) store.set('sb.best', score);
  if (stage + 1 > num('sb.lv')) store.set('sb.lv', stage + 1);
  sfx.melody([[392, 0.12], [330, 0.14], [262, 0.24]]);
  show('<div class="ov-emoji">📦</div><h2>搬不完，真搬不完</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">' + reason + ' · 停在第 ' + (stage + 1) + ' 关 · 最高纪录 ' + num('sb.best') + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">重新开班</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function useHint() {
  if (phase !== 'play') return;
  if (hints <= 0) { msg('<span class="sb-bad">提示用完了</span>'); return; }
  var sol = solve(room, player, boxes);
  if (!sol) { msg('<span class="sb-bad">这局面已经无解了，撤销或重置吧</span>'); return; }
  hints--;
  hinted = true;
  hintStep = sol.path[0];
  sfx.tone(880, 0.06, 'sine', 0.12);
  render();
  hud();
  msg('最优还剩 <b>' + sol.dist + '</b> 步：' + hintWord(hintStep));
}
function hintWord(d) {
  return ['往上走', '往右走', '往下走', '往左走'][d] || '接着走';
}

/* ==================== 渲染 ==================== */
function buildBoard() {
  if (!roomEl) return;
  roomEl.style.gridTemplateColumns = 'repeat(' + room.w + ', 1fr)';
  roomEl.style.gridTemplateRows = 'repeat(' + room.h + ', 1fr)';
  roomEl.style.aspectRatio = room.w + ' / ' + room.h;
  var html = '';
  for (var i = 0; i < room.w * room.h; i++) html += '<div class="sb-cell" data-i="' + i + '"></div>';
  roomEl.innerHTML = html;
  cellEls = roomEl.querySelectorAll('.sb-cell');
}
function render() {
  if (!roomEl || !cellEls.length) return;
  for (var i = 0; i < cellEls.length; i++) {
    var el = cellEls[i];
    var cls = ['sb-cell'];
    var txt = '';
    if (room.wall[i]) {
      cls.push('wall');
      txt = '<span class="sb-wall">▨</span>';
    } else {
      if (room.target[i]) cls.push('drop');
      var bi = boxes.indexOf(i);
      if (bi >= 0) {
        cls.push(room.target[i] ? 'box-on' : 'box');
        txt = '<span class="sb-box">📦</span>';
        if (i === popAt) cls.push('pop');
      } else if (i === player) {
        cls.push('man');
        txt = '<span class="sb-man">' + (phase === 'play' && !live ? '😵' : '🧍') + '</span>';
      }
    }
    if (hintStep >= 0 && i === player) cls.push('hint');
    if (hintStep >= 0 && i === nbr(room, player, hintStep)) cls.push('hint-to');
    if (hintStep >= 0 && boxes.indexOf(nbr(room, player, hintStep)) >= 0) {
      var pd = nbr(room, nbr(room, player, hintStep), hintStep);
      if (pd === i) cls.push('hint-push');
    }
    el.className = cls.join(' ');
    el.innerHTML = txt;
  }
}
function msg(html) { if (msgEl) msgEl.innerHTML = html; }
function hud() {
  if (!elLv) return;
  elLv.textContent = stage + 1;
  elMoves.textContent = moves + '/' + budget();
  elPar.textContent = par;
  elLives.textContent = lives;
  elScore.textContent = score;
  elHint.textContent = hints;
  elUndo.textContent = hist.length;
  if (btnHint) btnHint.disabled = phase !== 'play' || hints <= 0;
  if (btnUndo) btnUndo.disabled = phase !== 'play' || hist.length === 0;
}
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
  show('<div class="ov-emoji">📦</div><h2>推箱子</h2>' +
    '<p class="hint">规则老得掉牙，也狠得掉牙：<b>一次只能推一个</b>，<b>只能推不能拉</b>，' +
    '箱子顶进墙角就永远拿不出来了。<br>' +
    '<span class="sb-ov"><i>🧍 仓管员（你）</i><i>📦 货箱</i><i>● 卸货位</i><i>▨ 墙</i></span><br>' +
    '关卡是<b>从「已经码好」倒着拉乱</b>生成的，所以一定解得开；「最优步」是现场算出来的真最短，' +
    '走得越贴它，分越高。走完 <b>最优 + 富余</b> 步还没清库，就要扣一次加班额度。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开始上班</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function stats() {
  var want = room ? targets.filter(Boolean).length : D().boxes;
  show('<h2>本机战绩</h2><div class="sb-ov">' +
    '<p>最高分 <b>' + Math.max(num('sb.best'), score) + '</b> 分 · 难度 <b>' + D().label + '</b></p>' +
    '<p>这一局：' + score + ' 分 · 第 ' + (stage + 1) + '/' + STAGES + ' 关 · 累计推箱 <b>' + num('sb.push') + '</b> 次</p>' +
    '<p>每关 ' + D().boxes + ' 箱 × ' + want + ' 个地台 · 加班额度 ' + D().lives + ' 次 · 提示 ' + D().hints + ' 次/关 · 倍率 ×' + D().mult + '</p>' +
    '<p>步数评分：≤最优 ×1.6 · ≤最优+' + Math.ceil(D().slack * 0.4) + ' ×1.2 · ≤' + budget() + ' ×0.9</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="' +
    (phase === 'clear' ? (stage + 1 < STAGES ? 'next' : 'finish') : phase === 'play' ? 'resume' : 'again') + '">' +
    (phase === 'play' ? '继续搬' : phase === 'clear' ? (stage + 1 < STAGES ? '下一关 ▶' : '收工结算') : '再来一局') +
    '</button></div>');
}
function act(name) {
  if (name === 'start') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'again') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'next') { hide(); startStage(stage + 1); return; }
  if (name === 'finish') { hide(); finishRun(); return; }
  if (name === 'retry') { hide(); resetStage(true); phase = 'play'; return; }
  if (name === 'resume') { hide(); hud(); render(); return; }
  if (name === 'stats') { stats(); return; }
}

/* ==================== 输入 ==================== */
if (roomEl) {
  roomEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-i]') : null;
    if (!t) return;
    sfx.resume();
    tapCell(+t.dataset.i);
  });
}
function tapCell(i) {
  if (phase !== 'play') return;
  if (i === player) return;
  var px = player % room.w, py = (player - px) / room.w;
  var x = i % room.w, y = (i - x) / room.w;
  var dx = x - px, dy = y - py;
  var d = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  move(d);
}
if (byId('pad')) {
  byId('pad').addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-mv]') : null;
    if (!t) return;
    sfx.resume();
    move(+t.dataset.mv);
  });
}
window.addEventListener('keydown', function (ev) {
  var k = ev.key;
  if (k === 'Escape') { if (ovShown() && phase === 'play') hide(); return; }
  if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); return; }
  if (k === 't' || k === 'T') { stats(); return; }
  if (k === 'n' || k === 'N') { newRound(); intro(); return; }
  if (phase === 'intro') { if (k === 'Enter' || k === ' ') act('start'); return; }
  if (phase === 'clear') { if (k === 'Enter' || k === ' ') act(stage + 1 < STAGES ? 'next' : 'finish'); return; }
  if (phase === 'over') { if (k === 'Enter' || k === ' ') act('again'); return; }
  if (phase !== 'play') return;
  if (k === 'z' || k === 'Z') { undo(); return; }
  if (k === 'h' || k === 'H') { useHint(); return; }
  if (k === 'r' || k === 'R') { resetStage(false); msg('回到这关刚上班的样子 —— 不过走掉的步数还是你的'); return; }
  if (k === 'ArrowUp' || k === 'w' || k === 'W') { move(0); return; }
  if (k === 'ArrowRight' || k === 'd' || k === 'D') { move(1); return; }
  if (k === 'ArrowDown' || k === 's' || k === 'S') { move(2); return; }
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { move(3); return; }
});
if (btnHint) btnHint.addEventListener('click', function () { sfx.resume(); useHint(); });
if (btnUndo) btnUndo.addEventListener('click', function () { sfx.resume(); undo(); });
if (byId('btnReset')) byId('btnReset').addEventListener('click', function () { sfx.resume(); resetStage(false); msg('回到这关刚上班的样子 —— 不过走掉的步数还是你的'); });
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
      store.set('sb.diff', diff);
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

/* ==================== 开局 ==================== */
syncSound();
syncDiff();
newRound();
intro();
})();
