/* 摸黑 —— 回合制潜行：你走一步，守卫才走一步。守卫按固定的换岗路线与朝向巡逻，
   光锥（半角 45°、距离看难度）照到的格子站进去就被发现。
   机制：① 巡逻是确定性的时间表，所以「哪一回合哪一格是安全的」完全可以推算 —— 出题时用
   不扔石子的 BFS 现场证明这一关有解（那条解就是 par 步数）；② 🪨 石子能把守卫调开，属于
   额外手段，因此「不用石子也有解」这个保证永远成立；③ 被发现退回本关开头、回合清零，
   等于把这张时间表重播一遍，背板就是实力。纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 地图与关卡（关卡数据由离线求解器生成并逐关验过有解） ==================== */
var W = 14, H = 9;
var FOV = 0.785;                       // 半角 45°：整个光锥 90°
var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
var FNAME = ['东', '南', '西', '北'];
var FANG = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
/* GEN:LEVELS：以下 8 关由离线生成器搜索得到（模板见 tools 备忘），入档前逐关验证过
   「不扔石子也能走出最短解」，且视野越远越难走（鬼影档 par ≥ 潜行档 + 2、≥ 无障碍最短路 ×1.4）。 */
var LEVELS = [
  { name: "岗楼后墙", map: [
    '##############',
    '##H..##S....##',
    '##..........##',
    '######.##..###',
    '#####..*#...##',
    '#E..#..*#...##',
    '#.........####',
    '#...##########',
    '##############'
  ], guards: [{ path: [[1, 6], [9, 6]] }] },
  { name: "工具间", map: [
    '##############',
    '#...#H..#.*.##',
    '#...........##',
    '##.##..*##.###',
    '##.###.##S..##',
    '##......#...##',
    '##......#..E##',
    '##############',
    '##############'
  ], guards: [{ path: [[1, 2], [11, 2]] }] },
  { name: "夜班走廊", map: [
    '##############',
    '###S...#...###',
    '###........###',
    '###...H###.###',
    '######*##...##',
    '#...........##',
    '#.....*.#...##',
    '#E..##########',
    '##############'
  ], guards: [{ path: [[1, 5], [11, 5]] }] },
  { name: "洗衣房", map: [
    '##############',
    '######S...####',
    '#E..##*..*####',
    '#........#####',
    '##.##.......##',
    '#...........##',
    '#H.......#####',
    '##############',
    '##############'
  ], guards: [{ path: [[1, 5], [11, 5]] }, { path: [[5, 4], [11, 4]] }] },
  { name: "锅炉间", map: [
    '##############',
    '#E..#####...##',
    '#...........##',
    '##.##H.**#.###',
    '#...#....#.###',
    '#...####.#.###',
    '#####S.....###',
    '#####......###',
    '##############'
  ], guards: [{ path: [[1, 2], [11, 2]] }, { path: [[5, 4], [8, 4]] }] },
  { name: "仓库", map: [
    '##############',
    '#H..#...#..E##',
    '#...........##',
    '##.###.#######',
    '##.##S...#####',
    '#...#....#####',
    '#...#*..*#####',
    '#...#....#####',
    '##############'
  ], guards: [{ path: [[1, 2], [11, 2]] }, { path: [[5, 7], [8, 7]] }] },
  { name: "侧门", map: [
    '##############',
    '##....#...*H##',
    '##..........##',
    '######......##',
    '######.##*####',
    '#...#S..#.####',
    '#...........##',
    '#########..E##',
    '##############'
  ], guards: [{ path: [[2, 1], [5, 1]] }, { path: [[6, 3], [11, 3]] }, { path: [[2, 2], [11, 2]] }] },
  { name: "放风场", map: [
    '##############',
    '#########..E##',
    '#S.*#...#...##',
    '#*..........##',
    '#...#####...##',
    '##.#######.###',
    '##......#...##',
    '##.....H....##',
    '##############'
  ], guards: [{ path: [[2, 2], [2, 7]] }, { path: [[9, 1], [9, 4]] }, { path: [[10, 1], [10, 7]] }] }
];
/* GEN:END */

/* ==================== 难度 ==================== */
var DIFFS = {
  sneak: { label: '潜行', alarms: 3, see: 4.6, stones: 4, hints: 3, mult: 0.8 },
  dark: { label: '摸黑', alarms: 2, see: 5.6, stones: 3, hints: 2, mult: 1 },
  ghost: { label: '鬼影', alarms: 1, see: 6.6, stones: 2, hints: 1, mult: 1.8 },
};

/* ==================== 纯逻辑：解析 / 巡逻 / 视野 / 求解 ==================== */
function parseMap(lv) {
  var grid = [], sx = -1, sy = -1, ex = -1, ey = -1, hx = -1, hy = -1, gems = [], t;
  for (var y = 0; y < H; y++) {
    t = lv.map[y];
    var row = [];
    for (var x = 0; x < W; x++) {
      var c = t.charAt(x);
      if (c === '#') row.push(1);
      else {
        row.push(0);
        if (c === 'S') { sx = x; sy = y; }
        else if (c === 'E') { ex = x; ey = y; }
        else if (c === 'H') { hx = x; hy = y; }
        else if (c === '*') gems.push([x, y]);
      }
    }
    grid.push(row);
  }
  return { grid: grid, s: [sx, sy], e: [ex, ey], h: [hx, hy], gems: gems };
}
function wallOf(md, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  return md.grid[y][x] === 1;
}
function dirTo(x, y, tx, ty) {
  if (tx > x) return 0;
  if (ty > y) return 1;
  if (tx < x) return 2;
  return 3;
}
// 沿 4 向朝目标走一格：优先差得多的那条轴，被墙挡住就换另一条
function stepToward(md, x, y, tx, ty) {
  var dx = tx - x, dy = ty - y, tryA = [];
  if (Math.abs(dx) >= Math.abs(dy)) tryA = [dx > 0 ? 0 : dx < 0 ? 2 : -1, dy > 0 ? 1 : dy < 0 ? 3 : -1];
  else tryA = [dy > 0 ? 1 : dy < 0 ? 3 : -1, dx > 0 ? 0 : dx < 0 ? 2 : -1];
  for (var i = 0; i < 2; i++) {
    var d = tryA[i];
    if (d < 0) continue;
    if (!wallOf(md, x + DX[d], y + DY[d])) return d;
  }
  return -1;
}
function schedules(md, lv, upto) {
  var out = [];
  for (var i = 0; i < lv.guards.length; i++) {
    var arr = [], x = lv.guards[i].path[0][0], y = lv.guards[i].path[0][1], wi = 1 % lv.guards[i].path.length;
    var gd = lv.guards[i];
    var face = gd.face != null ? gd.face : dirTo(x, y, gd.path[wi][0], gd.path[wi][1]);
    for (var t = 0; t <= upto; t++) {
      arr.push({ x: x, y: y, face: face });
      if (t === upto) break;
      var tgt = gd.path[wi], d = stepToward(md, x, y, tgt[0], tgt[1]);
      if (d >= 0) { x += DX[d]; y += DY[d]; face = d; }
      if (x === tgt[0] && y === tgt[1]) wi = (wi + 1) % gd.path.length;
    }
    out.push(arr);
  }
  return out;
}
// 从 (px,py) 看 (x,y) 有没有被墙挡住：沿边采样
function clearShot(md, px, py, x, y) {
  var dx = x - px, dy = y - py, n = Math.max(Math.abs(dx), Math.abs(dy));
  for (var i = 1; i < n; i++) {
    var fx = px + dx * i / n, fy = py + dy * i / n;
    if (wallOf(md, Math.round(fx), Math.round(fy))) return false;
  }
  return true;
}
function angDelta(a, b) {
  var d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}
function seenSet(md, px, py, face, see) {
  var out = {}, fa = FANG[face];
  out[px + ',' + py] = 1;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (wallOf(md, x, y)) continue;
      var dx = x - px, dy = y - py, dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < 0.5 || dd > see) continue;
      if (angDelta(Math.atan2(dy, dx), fa) > FOV) continue;
      if (!clearShot(md, px, py, x, y)) continue;
      out[x + ',' + y] = 1;
    }
  }
  return out;
}
var DAN = null;                       // 每关/每次重播算一遍，逐回合缓存
function dangerCached(md, lv, sched, see, t) {
  if (!DAN) DAN = [];
  if (!DAN[t]) DAN[t] = dangerAt(md, lv, sched, see, t);
  return DAN[t];
}
function dangerAt(md, lv, sched, see, t) {
  var out = {};
  for (var i = 0; i < lv.guards.length; i++) {
    var p = sched[i][t];
    var s = seenSet(md, p.x, p.y, p.face, see);
    for (var k in s) out[k] = 1;
  }
  return out;
}
// 不扔石子的 BFS：状态 = (x, y, 是否背着人, 回合)，返回最短解路径（找不到返回 null）
function solveSilent(md, lv, see, maxTurns) {
  var sched = schedules(md, lv, maxTurns);
  var dan = [];
  for (var t = 0; t <= maxTurns; t++) dan.push(dangerAt(md, lv, sched, see, t));
  var start = md.s[0] + ',' + md.s[1] + ',0,0';
  var q = [{ x: md.s[0], y: md.s[1], c: 0, t: 0, via: null }];
  var seen = {};
  seen[start] = q[0];
  var head = 0;
  while (head < q.length) {
    var cur = q[head++];
    if (cur.t >= maxTurns) continue;
    for (var d = 0; d <= 4; d++) {
      var nx = d === 4 ? cur.x : cur.x + DX[d];
      var ny = d === 4 ? cur.y : cur.y + DY[d];
      if (wallOf(md, nx, ny)) continue;
      var nt = cur.t + 1;
      if (dan[nt][nx + ',' + ny]) continue;
      var nc = cur.c || (nx === md.h[0] && ny === md.h[1]) ? 1 : 0;
      if (cur.c) nc = 1;
      var key = nx + ',' + ny + ',' + nc + ',' + nt;
      if (seen[key]) continue;
      var node = { x: nx, y: ny, c: nc, t: nt, via: cur };
      seen[key] = node;
      if (nc && nx === md.e[0] && ny === md.e[1]) {
        var path = [], p = node;
        while (p) { path.unshift([p.x, p.y]); p = p.via; }
        return { steps: nt, path: path };
      }
      q.push(node);
    }
  }
  return null;
}
function stoneLanding(md, px, py, tx, ty, range) {
  var dx = tx - px, dy = ty - py, steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (!steps) return null;
  var sx = dx / steps, sy = dy / steps, last = null;
  for (var i = 1; i <= steps; i++) {
    var x = Math.round(px + sx * i), y = Math.round(py + sy * i);
    if (i > range) break;
    if (wallOf(md, x, y)) break;
    last = [x, y];
    if (x === tx && y === ty) break;
  }
  return last;
}

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
  toggle: function () { return true; }, isMuted: function () { return true; }, setMuted: function () {}, resume: function () {} };
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'mh.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var cv = byId('cv');
var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elTurn = byId('turn'), elAlarm = byId('alarm'), elCarry = byId('carry');
var elSteps = byId('steps'), elScore = byId('score');
var elStone = byId('stoneN'), elHint = byId('hintN'), btnStone = byId('btnStone'), btnHint = byId('btnHint');

/* ==================== 局面 ==================== */
var diff = 'dark';
if (!DIFFS[store.get('mh.diff', '')]) diff = 'dark'; else diff = store.get('mh.diff', 'dark');
var lv, md, sched, par, turn, px, py, carry, alarms, stones, hints, score, guards, gemsGot, gemLeft, aim, hintPath, phase = 'intro';

function D() { return DIFFS[diff]; }
function lvIdx() { return lv; }

function newRound() {
  score = 0;
  startLevel(0);
}
function startLevel(i) {
  lv = i;
  md = parseMap(LEVELS[lv]);
  DAN = null;
  var s = solveSilent(md, LEVELS[lv], D().see, 200);
  par = s ? s.steps : 40;
  sched = schedules(md, LEVELS[lv], 200);
  turn = 0; px = md.s[0]; py = md.s[1]; carry = false;
  alarms = D().alarms; stones = D().stones; hints = D().hints;
  gemsGot = 0; gemLeft = md.gems.map(function () { return false; });
  aim = false; hintPath = null;
  guards = LEVELS[lv].guards.map(function (g, k) {
    return { i: k, x: sched[k][0].x, y: sched[k][0].y, face: sched[k][0].face, alert: 0, tx: 0, ty: 0 };
  });
  phase = 'play';
  hud(); draw();
}
function resetLevel() {
  var keep = alarms, sc = score, st = stones, hi = hints;
  turn = 0; px = md.s[0]; py = md.s[1]; carry = false;
  DAN = null;
  gemsGot = 0; gemLeft = gemLeft.map(function () { return false; });
  aim = false; hintPath = null;
  sched = schedules(md, LEVELS[lv], 200);
  guards = LEVELS[lv].guards.map(function (g, k) {
    return { i: k, x: sched[k][0].x, y: sched[k][0].y, face: sched[k][0].face, alert: 0, tx: 0, ty: 0 };
  });
  alarms = keep; score = sc; stones = st; hints = hi;
}

/* ==================== 一回合 ==================== */
function advance(nx, ny) {
  if (nx !== undefined) { px = nx; py = ny; }
  if (!carry && px === md.h[0] && py === md.h[1]) {
    carry = true;
    sfx.melody([[700, 0.08], [950, 0.12]], 0.07);
    say('你把人质<b>背</b>了起来 —— 现在走不动快了，直奔 🚪');
  }
  for (var gi = 0; gi < md.gems.length; gi++) {
    if (!gemLeft[gi] && md.gems[gi][0] === px && md.gems[gi][1] === py) {
      gemLeft[gi] = true; gemsGot++;
      sfx.tone(1180, 0.08, 'triangle', 0.12);
    }
  }
  var done = carry && px === md.e[0] && py === md.e[1];
  turnStep();
  if (done) { rescue(); return; }
  if (isSeen(px, py)) { spotted(); return; }
  hud(); draw();
}
function turnStep() {
  turn++;
  for (var i = 0; i < guards.length; i++) {
    var gd = guards[i], p = sched[i][Math.min(turn, 199)];
    if (gd.alert > 0) {
      var d = stepToward(md, gd.x, gd.y, gd.tx, gd.ty);
      if (d >= 0) { gd.x += DX[d]; gd.y += DY[d]; gd.face = d; }
      gd.alert--;
    } else if (gd.x !== p.x || gd.y !== p.y) {
      var d2 = stepToward(md, gd.x, gd.y, p.x, p.y);
      if (d2 >= 0) { gd.x += DX[d2]; gd.y += DY[d2]; gd.face = d2; }
      else { gd.x = p.x; gd.y = p.y; gd.face = p.face; }
    } else { gd.x = p.x; gd.y = p.y; gd.face = p.face; }
  }
}
function isSeen(x, y) {
  var key = x + ',' + y;
  for (var i = 0; i < guards.length; i++) {
    var gd = guards[i];
    if (seenSet(md, gd.x, gd.y, gd.face, D().see)[key]) return true;
  }
  return false;
}
function distracted() {
  for (var i = 0; i < guards.length; i++) if (guards[i].alert > 0 || offPatrol(i)) return true;
  return false;
}
function offPatrol(i) {
  var p = sched[i][Math.min(turn, 199)];
  return guards[i].x !== p.x || guards[i].y !== p.y;
}
function spotted() {
  alarms--;
  sfx.noise(0.2, 0.18);
  sfx.melody([[420, 0.1], [300, 0.16]], 0.09);
  if (alarms <= 0) { gameOver(); return; }
  draw();
  show('<div class="ov-emoji">🚨</div><h2>被发现了</h2>' +
    '<p class="hint">哨兵把你退回门口，换岗表<b>从头重播</b>。<br>还剩 <b>' + alarms + '</b> 次警报。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="retry">摸回去 ↺</button></div>');
  phase = 'caught';
  hud();
}
function rescue() {
  var d = D();
  var over = Math.max(0, stepsTaken() - par);
  var gain = Math.max(12, Math.round((70 + 26 * (lv + 1) + gemsGot * 45 + alarms * 40 + stones * 12 - over * 7) * d.mult));
  lastGain = gain;
  score += gain;
  sfx.melody([[520, 0.09], [660, 0.09], [780, 0.1], [1040, 0.16]], 0.08);
  save();
  addSaved();
  phase = 'clear';
  hud();
  var last = lv + 1 >= LEVELS.length;
  show('<div class="ov-emoji">' + (last ? '🏳️' : '🕵️') + '</div><h2>' + LEVELS[lv].name + ' · 出来了</h2>' +
    '<p class="final-score">+' + gain + '<span> 分</span></p>' +
    '<p class="final-sub">用了 ' + stepsTaken() + ' 步（表上最短 ' + par + '）· 捡到 💎 ' + gemsGot +
    ' · 剩 ' + alarms + ' 次警报 · 超出一步扣 7 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="' + (last ? 'again' : 'next') + '">' +
    (last ? '全出来了，再来一局' : '下一关 ▶') + '</button><button class="ghost" data-act="stats">战绩</button></div>');
}
var lastGain = 0;
function stepsTaken() { return turn; }
function gameOver() {
  phase = 'over';
  save();
  sfx.melody([[300, 0.14], [220, 0.18], [160, 0.26]], 0.13);
  show('<div class="ov-emoji">🔦</div><h2>灯全亮了</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">救到第 ' + (lv + 1) + ' 关 · 本机最高 ' + num('mh.best') + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button><button class="ghost" data-act="stats">战绩</button></div>');
  hud();
}
function save() {
  if (score > num('mh.best')) store.set('mh.best', String(score));
  if (lv > num('mh.lv')) store.set('mh.lv', String(lv));
  store.set('mh.diff', diff);
}
function addSaved() { store.set('mh.save', String(num('mh.save') + 1)); }

/* ==================== 道具 ==================== */
function toggleAim() {
  if (phase !== 'play') return;
  if (stones <= 0) { say('没有石子了'); return; }
  aim = !aim;
  btnStone.classList.toggle('armed', aim);
  hud(); draw();
}
function throwAt(x, y) {
  var land = stoneLanding(md, px, py, x, y, 7);
  if (!land) { say('这个方向扔不出去（撞墙或太近）'); return; }
  stones--;
  aim = false;
  btnStone.classList.remove('armed');
  sfx.noise(0.08, 0.1);
  var heard = 0;
  for (var i = 0; i < guards.length; i++) {
    var gd = guards[i], dd = Math.abs(gd.x - land[0]) + Math.abs(gd.y - land[1]);
    if (dd <= 8) { gd.alert = 3; gd.tx = land[0]; gd.ty = land[1]; heard++; }
  }
  say('石子落在 <b>' + land[0] + ',' + land[1] + '</b>，' + heard + ' 名守卫过去查探');
  advance(undefined, undefined);
}
function useHint() {
  if (phase !== 'play' || hints <= 0) return;
  if (distracted()) { say('守卫被石子引开了，<b>换岗表不作数</b> —— 这一回合的路线没法预测'); return; }
  var s = silentFrom(px, py, carry ? 1 : 0, turn);
  if (!s) { say('这一步之后<b>已经没有干净的路</b>了：等一回合或退回重来'); return; }
  hints--;
  hintPath = s.path;
  sfx.tone(880, 0.07, 'triangle', 0.1);
  say('路线给你（还需要 <b>' + s.steps + '</b> 步）：绿点是接下来几回合能站的地方');
  hud(); draw();
}
// 从当前 (x,y,carry,turn) 往后接着算，保证提示与判定用的是同一张表
function silentFrom(x, y, c, t0) {
  var lvObj = LEVELS[lv], maxT = 200;
  var dan = [];
  for (var t = t0; t <= maxT; t++) dan.push(dangerCached(md, lvObj, sched, D().see, t));
  var q = [{ x: x, y: y, c: c, t: t0, via: null }], seen = {}, head = 0;
  seen[x + ',' + y + ',' + c + ',' + t0] = q[0];
  while (head < q.length) {
    var cur = q[head++];
    if (cur.t >= maxT) continue;
    for (var d = 0; d <= 4; d++) {
      var nx = d === 4 ? cur.x : cur.x + DX[d];
      var ny = d === 4 ? cur.y : cur.y + DY[d];
      if (wallOf(md, nx, ny)) continue;
      var nt = cur.t + 1;
      if (dan[nt - t0][nx + ',' + ny]) continue;
      var nc = cur.c || ((nx === md.h[0] && ny === md.h[1]) ? 1 : 0);
      var key = nx + ',' + ny + ',' + nc + ',' + nt;
      if (seen[key]) continue;
      var node = { x: nx, y: ny, c: nc, t: nt, via: cur };
      seen[key] = node;
      if (nc && nx === md.e[0] && ny === md.e[1]) {
        var path = [], p = node;
        while (p) { path.unshift([p.x, p.y, p.t]); p = p.via; }
        return { steps: nt - t0, path: path };
      }
      q.push(node);
    }
  }
  return null;
}

/* ==================== 输入 ==================== */
function tryMove(d) {
  if (phase === 'caught') { retry(); return; }
  if (phase !== 'play') return;
  var nx = px + DX[d], ny = py + DY[d];
  if (wallOf(md, nx, ny)) { sfx.noise(0.05, 0.05); say('这格是<b>墙</b>，过不去'); return; }
  hintPath = null;
  advance(nx, ny);
}
function retry() {
  hide();
  resetLevel();
  phase = 'play';
  hud(); draw();
}
if (cv) {
  cv.addEventListener('pointerdown', function (ev) {
    if (phase !== 'play') return;
    var r = cv.getBoundingClientRect();
    var x = Math.floor((ev.clientX - r.left) / (r.width || 1) * W);
    var y = Math.floor((ev.clientY - r.top) / (r.height || 1) * H);
    sfx.resume();
    if (aim) { throwAt(x, y); return; }
    if (x === px && y === py) { hintPath = null; advance(undefined, undefined); return; }
    if (Math.abs(x - px) + Math.abs(y - py) === 1) {
      var d = x > px ? 0 : y > py ? 1 : x < px ? 2 : 3;
      tryMove(d);
    } else say('一次只能走一格；要引开守卫先按 <kbd>Q</kbd> 装石子');
  });
}
window.addEventListener('keydown', function (ev) {
  var k = ev.key;
  if (k === 'Escape') { if (phase === 'play') hide(); return; }
  if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); return; }
  if (k === 't' || k === 'T') { stats(); return; }
  if (k === 'n' || k === 'N') { newRound(); intro(); return; }
  if (phase === 'intro') { if (k === 'Enter' || k === ' ') { act('start'); } return; }
  if (phase === 'caught') { if (k === 'Enter' || k === ' ') retry(); return; }
  if (phase === 'clear') { if (k === 'Enter' || k === ' ') act('next'); return; }
  if (phase !== 'play') return;
  if (k === 'ArrowUp' || k === 'w' || k === 'W') { tryMove(3); return; }
  if (k === 'ArrowRight' || k === 'd' || k === 'D') { tryMove(0); return; }
  if (k === 'ArrowDown' || k === 's' || k === 'S') { tryMove(1); return; }
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { tryMove(2); return; }
  if (k === '.') { hintPath = null; advance(undefined, undefined); return; }
  if (k === 'q' || k === 'Q') { toggleAim(); return; }
  if (k === 'h' || k === 'H') { useHint(); return; }
  if (k === 'r' || k === 'R') { resetLevel(); hud(); draw(); say('重播换岗表：回到这一关开头（不掉警报）'); return; }
});

/* ==================== 绘制 ==================== */
function cell() { return cv ? cv.getBoundingClientRect().width / W : 40; }
function txt(ch, x, y, size) {
  if (!ctx) return;
  ctx.font = (size || 20) + 'px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
}
function rect(x, y, w, h, color) {
  if (!ctx) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}
function draw() {
  if (!ctx) return;
  var u = 40;
  rect(0, 0, W * u, H * u, '#070b14');
  var t = Math.min(turn, 199);
  var dan = dangerCached(md, LEVELS[lv], sched, D().see, t);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var isWall = md.grid[y][x] === 1;
      if (isWall) rect(x * u, y * u, u - 1, u - 1, '#1b2436');
      else {
        rect(x * u, y * u, u - 1, u - 1, '#0d1524');
        if (dan[x + ',' + y]) rect(x * u, y * u, u - 1, u - 1, 'rgba(251,191,36,0.22)');
      }
    }
  }
  // 下一回合的光锥（预告），只画未被引开时的表
  var next = dangerCached(md, LEVELS[lv], sched, D().see, Math.min(t + 1, 199));
  for (var k2 in next) {
    if (dan[k2]) continue;
    var p = k2.split(',');
    rect(+p[0] * u + 2, +p[1] * u + 2, u - 5, u - 5, 'rgba(251,191,36,0.09)');
  }
  if (hintPath) {
    for (var i = 1; i < Math.min(hintPath.length, 7); i++) {
      var hp = hintPath[i];
      ctx.strokeStyle = 'rgba(163,230,53,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hp[0] * u + u / 2, hp[1] * u + u / 2, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (md.e[0] >= 0) txt('🚪', md.e[0] * u + u / 2, md.e[1] * u + u / 2 + 2, 22);
  if (!carry && md.h[0] >= 0) txt('💛', md.h[0] * u + u / 2, md.h[1] * u + u / 2 + 2, 20);
  for (var gi = 0; gi < md.gems.length; gi++) if (!gemLeft[gi]) txt('💎', md.gems[gi][0] * u + u / 2, md.gems[gi][1] * u + u / 2 + 2, 17);
  for (var j = 0; j < guards.length; j++) {
    var gd = guards[j];
    txt('👁️', gd.x * u + u / 2, gd.y * u + u / 2 + 2, 20);
    txt(FNAME[gd.face], gd.x * u + u / 2, gd.y * u + 9, 9);
  }
  txt(carry ? '🧍' : '🕵️', px * u + u / 2, py * u + u / 2 + 2, 22);
  if (aim) {
    ctx.strokeStyle = 'rgba(34,211,238,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px * u - 2, py * u - 2, u + 3, u + 3);
  }
}
function say(html) { if (overlayEl && !overlayEl.classList.contains('show')) msgToTitle(html); }
function msgToTitle(html) {
  var el = byId('subline');
  if (!el) {
    el = document.createElement('p');
    el.id = 'subline';
    el.className = 'mh-line';
    if (cv && cv.parentNode) cv.parentNode.insertBefore(el, cv.nextSibling);
  }
  el.innerHTML = html;
}
function hud() {
  if (!elLv) return;
  elLv.textContent = lv + 1;
  elTurn.textContent = turn;
  elAlarm.textContent = alarms;
  elCarry.textContent = carry ? '背着人' : (aim ? '瞄准中' : '空');
  elSteps.textContent = stepsTaken() + '/' + par;
  elScore.textContent = score;
  elStone.textContent = stones;
  elHint.textContent = hints;
  btnStone.disabled = phase !== 'play' || stones <= 0;
  btnHint.disabled = phase !== 'play' || hints <= 0;
  byId('btnWait').disabled = phase !== 'play';
}
function show(html) {
  if (!ovContent) return;
  ovContent.innerHTML = html;
  overlayEl.classList.add('show');
}
function hide() { if (overlayEl) overlayEl.classList.remove('show'); }
function intro() {
  phase = 'intro';
  show('<div class="ov-emoji">🕵️</div><h2>摸黑</h2>' +
    '<p class="hint">你走一步，守卫才走一步。他们的换岗路线是<b>固定时间表</b>，' +
    '半角 45° 的光锥照到的格子（画面里发黄的）站进去就被发现。<br>' +
    '<span class="mh-legend"><i>🚪 出口</i><i>💛 人质</i><i>👁️ 守卫</i><i>💎 顺手牵</i><i>🪨 石子调虎离山</i></span><br>' +
    '被发现有 <b>' + D().alarms + '</b> 次机会；这一步之后要走到哪儿，可以按 <kbd>H</kbd> 让时间表替你算。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">摸进去</button><button class="ghost" data-act="stats">战绩</button></div>');
  draw();
}
function stats() {
  show('<h2>本机战绩</h2><div class="mh-ov">' +
    '<p>最高分 <b>' + Math.max(num('mh.best'), score) + '</b> 分 · 难度 <b>' + D().label + '</b></p>' +
    '<p>这一局：' + score + ' 分 · 第 ' + (lv + 1) + ' 关「' + LEVELS[lv].name + '」 · 已救 ' + num('mh.save') + ' 人</p>' +
    '<p>共 ' + LEVELS.length + ' 关 · 视野 ' + D().see.toFixed(1) + ' 格 · 警报 ' + D().alarms + ' 次</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="' + (phase === 'over' ? 'again' : phase === 'clear' ? 'next' : 'resume') + '">' +
    (phase === 'play' ? '继续摸' : phase === 'clear' ? '下一关 ▶' : '再来一局') + '</button></div>');
}
function act(name) {
  if (name === 'start') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'again') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'retry') { retry(); return; }
  if (name === 'next') {
    hide();
    if (lv + 1 >= LEVELS.length) { newRound(); intro(); return; }
    startLevel(lv + 1);
    return;
  }
  if (name === 'resume') { hide(); hud(); draw(); return; }
  if (name === 'stats') { stats(); return; }
}

/* ==================== 绑定 ==================== */
(function () {
  var btns = byId('diff').querySelectorAll('[data-diff]');
  for (var i = 0; i < btns.length; i++) {
    (function (b) {
      b.addEventListener('click', function () {
        diff = b.dataset.diff;
        store.set('mh.diff', diff);
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
btnStone.addEventListener('click', toggleAim);
btnHint.addEventListener('click', useHint);
byId('btnWait').addEventListener('click', function () { if (phase === 'play') { hintPath = null; advance(undefined, undefined); } });
byId('btnStats').addEventListener('click', stats);
byId('btnNew').addEventListener('click', function () { newRound(); intro(); });
if (soundBtn) soundBtn.addEventListener('click', function () { sfx.toggle(); syncSound(); });
if (overlayEl) {
  overlayEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (t) act(t.dataset.act);
  });
}

/* ==================== 开局 ==================== */
var rafId = 0;
function frame() {
  rafId = window.requestAnimationFrame(frame);
  draw();
}
syncSound();
syncDiff();
newRound();
intro();
if (window.requestAnimationFrame) rafId = window.requestAnimationFrame(frame);
})();
