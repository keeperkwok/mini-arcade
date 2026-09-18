/* 接根水管 —— 实时流水的管子拼图：水已经在流，你边漏边接。
   机制：① 每格管子只有「转」这一个操作（点一下顺时针 90°，右键逆时针），
        位置不许挪，所以拼法是纯逻辑题；
   ② 水从左边 💧 进、从右边 🚿 出，一 hop 一 hop 往前爬（整数 ms 计时），
      接口对不上的地方当场漏水，漏几处时间就按几倍往下掉 —— 这是紧迫感的全部来源；
   ③ 出题先生成一条「一定能接通」的管路（随机 DFS + 一段回环岔路），再打乱旋转，
      所以每一关都有解；固定接头 🔒 开局就拧对了，是给的一点点仁慈。
   纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 方向与零件 ==================== */
var U = 1, R = 2, DN = 4, LF = 8;      // 位掩码：上右下左
var DIRX = [0, 1, 0, -1], DIRY = [-1, 0, 1, 0];
var ARM = ['u', 'r', 'd', 'l'];
var DNAME = ['上', '右', '下', '左'];
var FRAME_MS = 16;
var STAGES = 10;                       // 一局十关
var LEAK_MAX = 4;                      // 漏水倍率的封顶
var LEAK_K = 0.9;                      // 每处漏水额外消耗 0.9 倍时间
var HINT_TICKS = 2600;                 // 提示高亮持续时间 ms
var HINT_COST = 5000;                  // 提示扣的时间
var MIX_COST = 6000;                   // 重排扣的时间
var DECOY_MASKS = [U | DN, LF | R, U | R, R | DN, DN | LF, LF | U];   // 只给两通零件，保证能拧开

function cw(m) { return ((m << 1) | (m >> 3)) & 15; }
function rotBy(m, k) { var r = m; for (var i = 0; i < ((k % 4) + 4) % 4; i++) r = cw(r); return r; }
function has(m, bit) { return (m & bit) !== 0; }
function bitOf(d) { return 1 << d; }
function opp(d) { return (d + 2) % 4; }

function rngOf(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// FIXED_SEED：地址栏写 #seed=数字 就能复现同一批管路
var FIXED_SEED = (function () {
  var m = /seed=(\d+)/.exec((typeof location !== 'undefined' && location.hash) || '');
  return m ? (parseInt(m[1], 10) >>> 0) : 0;
})();
var seedBase = 0;
var rnd = rngOf(1);
function randInt(n) { return Math.floor(rnd() * n); }
function shuffle(a) {
  var arr = a.slice();
  for (var i = arr.length - 1; i > 0; i--) { var j = randInt(i + 1); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}

/* ==================== 难度与曲线 ==================== */
var DIFFS = {
  slow: { key: 'slow', label: '慢条斯理', cols: 6, rows: 5, hop: 330, mult: 0.8, timeK: 1.4, decoy: 0.16, locks: 1, hints: 3 },
  norm: { key: 'norm', label: '标准水压', cols: 7, rows: 5, hop: 250, mult: 1, timeK: 1, decoy: 0.26, locks: 2, hints: 2 },
  rush: { key: 'rush', label: '高压冲刺', cols: 8, rows: 6, hop: 185, mult: 1.6, timeK: 0.76, decoy: 0.34, locks: 3, hints: 1 },
};
function D() { return DIFFS[diff]; }
function colsOf(lv) { return Math.min(D().cols + Math.floor((lv - 1) / 4), 10); }
function rowsOf(lv) { return Math.min(D().rows + Math.floor((lv - 1) / 3), 8); }
function hopMs() { return Math.max(120, D().hop - (level - 1) * 8); }
function timeFor(pathLen, total) {
  var base = 7000 + pathLen * 2500 + total * 130;
  return Math.round(Math.max(15000, base * D().timeK - (level - 1) * 450));
}
function drainOf(leaks) { return 1 + Math.min(leaks, LEAK_MAX) * LEAK_K; }
function gainOf() { return Math.round((60 + pipes * 5 + Math.round(remainMs / 1000) * 2) * D().mult); }
function dryBonus() { return Math.round(60 * D().mult); }
function fmtTime(ms) {
  var s = Math.ceil(ms / 1000);
  return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
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
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'gd.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var boardEl = byId('board');
var msgEl = byId('msg');
var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elClock = byId('clock'), elLeak = byId('leaks'), elWet = byId('wet'), elScore = byId('score');
var btnPause = byId('btnPause'), btnHint = byId('btnHint'), btnMix = byId('btnMix');

/* ==================== 局面状态 ==================== */
var phase = 'intro';        // intro | play | clear | over
var diff = store.get('gd.diff', 'norm');
if (!DIFFS[diff]) diff = 'norm';
var level = 1, score = 0, clock = 0, flowAcc = 0, remainMs = 30000, limitMs = 30000;
var cols = 7, rows = 5, srcRow = 0, snkRow = 0, srcIdx = 0, snkIdx = 0;
var cells = [], node = [];
var curIdx = 0;             // 键盘光标
var leakN = 0, pipes = 0, wetN = 0, hints = 2, mixes = 2;
var hintAt = -1, hintUntil = -1, paused = false, leaksTotal = 0, everDry = true, lastGain = 0;
var lastKey = '';

function x(i) { return i % cols; }
function y(i) { return Math.floor(i / cols); }
function idx(cx, cy) { return cy * cols + cx; }
function inside(cx, cy) { return cx >= 0 && cy >= 0 && cx < cols && cy < rows; }
function maskOf(i) { var t = cells[i]; return t && t.pipe ? rotBy(t.base, t.rot) : 0; }

/* ==================== 出题：先保证能通，再打乱 ==================== */
function walkPath(from, to, blocked) {
  var seen = [], path = [];
  for (var i = 0; i < cols * rows; i++) seen.push(false);
  function dfs(i) {
    seen[i] = true;
    path.push(i);
    if (i === to) return true;
    var order = shuffle([0, 1, 2, 3]);
    for (var k = 0; k < 4; k++) {
      var d = order[k], nx = x(i) + DIRX[d], ny = y(i) + DIRY[d];
      if (!inside(nx, ny)) continue;
      var j = idx(nx, ny);
      if (seen[j] || (blocked[j] && j !== to)) continue;
      if (dfs(j)) return true;
    }
    path.pop();
    return false;
  }
  return dfs(from) ? path : null;
}
function dirBetween(a, b) {
  for (var d = 0; d < 4; d++) if (x(a) + DIRX[d] === x(b) && y(a) + DIRY[d] === y(b)) return d;
  return -1;
}
function genLevel(lv) {
  cols = colsOf(lv); rows = rowsOf(lv);
  srcRow = randInt(rows); snkRow = randInt(rows);
  srcIdx = idx(0, srcRow); snkIdx = idx(cols - 1, snkRow);
  var n = cols * rows, i;
  var mask = [];
  for (i = 0; i < n; i++) mask.push(0);
  var used = [];
  for (i = 0; i < n; i++) used.push(false);
  var main = walkPath(srcIdx, snkIdx, used);
  if (!main || main.length < 3) return genLevel(lv);
  var pathLen = main.length;
  for (i = 0; i < main.length; i++) {
    var c = main[i];
    used[c] = true;
    if (i === 0) mask[c] |= LF;
    if (i === main.length - 1) mask[c] |= R;
    if (i > 0) mask[c] |= bitOf(dirBetween(c, main[i - 1]));
    if (i < main.length - 1) mask[c] |= bitOf(dirBetween(c, main[i + 1]));
  }
  // 岔路：从主路的一格绕回主路的另一格，形成三通/四通回路（不会漏水，只是更费神）
  var blocked = [];
  for (i = 0; i < n; i++) blocked[i] = used[i];
  for (var att = 0; att < 8; att++) {
    var a = randInt(Math.max(1, main.length - 4)) + 1;
    var b = a + 3 + randInt(Math.max(1, main.length - a - 3));
    if (b >= main.length) continue;
    var detour = walkPath(main[a], main[b], blocked);
    if (!detour || detour.length < 3 || detour.length > 9) continue;
    for (i = 1; i < detour.length - 1; i++) { blocked[detour[i]] = true; pathLen++; }
    mask[detour[0]] |= bitOf(dirBetween(detour[0], detour[1]));
    mask[detour[detour.length - 1]] |= bitOf(dirBetween(detour[detour.length - 1], detour[detour.length - 2]));
    for (i = 1; i < detour.length - 1; i++) {
      mask[detour[i]] |= bitOf(dirBetween(detour[i], detour[i - 1]));
      mask[detour[i]] |= bitOf(dirBetween(detour[i], detour[i + 1]));
    }
    break;
  }
  cells = [];
  pipes = 0;
  for (i = 0; i < n; i++) {
    var m = mask[i], pipe = m !== 0;
    if (pipe) pipes++;
    cells.push({ base: m, rot: 0, lock: false, pipe: pipe, wet: false });
  }
  // 空位撒点假管子：两通零件，拧一拧就能避开水流
  for (i = 0; i < n; i++) {
    if (cells[i].pipe || rnd() > D().decoy) continue;
    cells[i].base = DECOY_MASKS[randInt(DECOY_MASKS.length)];
    cells[i].pipe = true;
    pipes++;
  }
  // 主路上的固定接头（开局就是对的）
  var locked = 0, want = Math.min(D().locks, Math.max(0, main.length - 2));
  var order = shuffle(main.slice(1, main.length - 1));
  for (i = 0; i < order.length && locked < want; i++) {
    var t = cells[order[i]];
    if (t.lock || t.base === 0) continue;
    t.lock = true;
    locked++;
  }
  // 打乱：至少拧错 2 格，别一进来就白送
  var wrong = 0;
  for (i = 0; i < n; i++) {
    var c2 = cells[i];
    if (!c2.pipe || c2.lock) continue;
    c2.rot = randInt(4);
    if (c2.rot % 4 !== 0) wrong++;
  }
  if (wrong < 2) {
    for (i = 0; i < main.length && wrong < 2; i++) {
      var c3 = cells[main[i]];
      if (c3.lock) continue;
      c3.rot = (c3.rot + 1) % 4;
      wrong++;
    }
  }
  cells[srcIdx].wet = true;      // 水已经灌进进水口那一格
  wetN = 1;
  limitMs = timeFor(pathLen, n);
  remainMs = limitMs;
  clock = 0; flowAcc = 0;
  leakN = 0; leaksTotal = 0; everDry = true; lastGain = 0;
  hints = D().hints;
  mixes = 2;
  hintAt = -1; hintUntil = -1;
  curIdx = srcIdx;
}

/* ==================== 水流：一 hop 一 hop 往前爬 ==================== */
function survey() {
  var leaks = 0, out = false, next = [], fixes = [], drip = [], i, d;
  for (i = 0; i < cells.length; i++) drip.push(0);
  // 进水口：水永远在往里灌，那一格没接上就是当场喷水
  if (!has(maskOf(srcIdx), LF)) { leaks++; drip[srcIdx] |= LF; }
  for (i = 0; i < cells.length; i++) {
    var t = cells[i];
    if (!t.pipe || !t.wet) continue;
    var m = maskOf(i);
    for (d = 0; d < 4; d++) {
      if (!has(m, bitOf(d))) continue;
      var nx = x(i) + DIRX[d], ny = y(i) + DIRY[d];
      if (!inside(nx, ny)) {
        if (d === 1 && x(i) === cols - 1 && y(i) === snkRow) { out = true; continue; }
        if (d === 3 && x(i) === 0 && y(i) === srcRow) continue;   // 进水口：水就是从这儿来的，不算漏
        leaks++; drip[i] |= bitOf(d); continue;
      }
      var j = idx(nx, ny), tj = cells[j];
      if (!tj.pipe) { leaks++; drip[i] |= bitOf(d); continue; }
      if (!has(maskOf(j), bitOf(opp(d)))) {
        leaks++;
        drip[i] |= bitOf(d);
        if (!tj.lock) fixes.push(j);        // 该拧的是隔壁那根，不是这一根
        continue;
      }
      if (!tj.wet) next.push(j);
    }
  }
  return { leaks: leaks, out: out, next: next, fixes: fixes, drip: drip };
}
function advanceFlow() {
  var sv = survey(), added = 0, i;
  for (i = 0; i < sv.next.length; i++) {
    var j = sv.next[i];
    if (cells[j].wet) continue;
    cells[j].wet = true;
    added++; wetN++;
    store.set('gd.flow', num('gd.flow') + 1);
  }
  if (added) { sfx.tone(320 + Math.min(wetN, 12) * 26, 0.04, 'sine', 0.11); }
  return added;
}
function leakReport(sv) {
  leakN = sv.leaks;
  if (leakN > 0) everDry = false;
  return leakN;
}
function firstLeakDir(sv) {
  for (var i = 0; i < sv.drip.length; i++) {
    var m = sv.drip[i];
    if (!m) continue;
    for (var d = 0; d < 4; d++) if (m & bitOf(d)) return d;
  }
  return -1;
}
function stateKey(sv) {
  var wet = 0;
  for (var i = 0; i < cells.length; i++) if (cells[i].wet) wet = wet * 2 + 1; else wet *= 2;
  return sv.leaks + '|' + (sv.out ? 1 : 0) + '|' + wet + '|' + hintAt + '|' + curIdx;
}
function stepFrame(ms) {
  if (phase !== 'play' || paused || ovShown()) return;
  clock += ms;
  flowAcc += ms;
  var guard = 0;
  while (flowAcc >= hopMs() && guard++ < 6) {
    flowAcc -= hopMs();
    if (!advanceFlow()) break;
  }
  var sv = survey();
  leakReport(sv);
  var drain = Math.round(ms * drainOf(leakN));
  remainMs -= drain;
  if (remainMs <= 0) { remainMs = 0; hud(); gameOver('水用完了'); return; }
  if (sv.out && leakN === 0) { levelClear(sv); return; }
  var key = stateKey(sv);
  if (key !== lastKey) { lastKey = key; paint(sv); }
  hud();
}

/* ==================== 操作 ==================== */
function rotate(i, dir) {
  if (phase !== 'play' || paused) return false;
  var t = cells[i];
  if (!t || !t.pipe) { msg('这一格是空的，没管子可拧'); return false; }
  if (t.lock) { sfx.tone(180, 0.05, 'square', 0.09); msg('<span class="gd-bad">🔒 固定接头</span> 这格拧不动'); return false; }
  t.rot = (((t.rot + dir) % 4) + 4) % 4;
  curIdx = i;
  sfx.tone(520 + (i % 5) * 40, 0.03, 'triangle', 0.09);
  var sv = survey();
  leakReport(sv);
  lastKey = '';
  hud();
  var d0 = firstLeakDir(sv);
  msg((dir > 0 ? '<b>顺时针</b>' : '<b>逆时针</b>') + '拧了一格 · 漏 ' + leakN + ' 处' +
    (d0 >= 0 ? '，先堵朝<b>' + DNAME[d0] + '</b>的那个口' : '，接口全对上了'));
  return true;
}
function moveCur(dir) {
  var nx = x(curIdx) + DIRX[dir], ny = y(curIdx) + DIRY[dir];
  if (!inside(nx, ny)) return;
  curIdx = idx(nx, ny);
  lastKey = '';
  hud();
}
function useHint() {
  if (phase !== 'play') return false;
  if (hints <= 0) { msg('<span class="gd-bad">提示用完了</span> 自己看一眼哪儿在喷水'); return false; }
  var sv = survey();
  leakReport(sv);
  var target = -1, i;
  for (i = 0; i < sv.fixes.length; i++) { if (target < 0 || sv.fixes[i] < target) target = sv.fixes[i]; }
  if (target < 0) {
    for (i = 0; i < cells.length; i++) {
      var t = cells[i];
      if (!t.pipe || t.lock || t.wet) continue;
      if (((t.rot % 4) + 4) % 4 !== 0) { target = i; break; }
    }
  }
  if (target < 0) { msg('<span class="gd-good">管子都拧对了</span>，水已经快到底了'); return false; }
  hints--;
  remainMs = Math.max(1000, remainMs - HINT_COST);
  hintAt = target; hintUntil = clock + HINT_TICKS;
  lastKey = '';
  sfx.melody([[520, 0.05], [700, 0.07]]);
  msg('<span class="gd-good">💡 第 ' + (y(target) + 1) + ' 排第 ' + (x(target) + 1) + ' 列</span>那格的接口没对上（扣 5 秒）');
  hud();
  return true;
}
function mixBoard() {
  if (phase !== 'play') return false;
  if (mixes <= 0) { msg('<span class="gd-bad">重排次数没了</span> 硬着头皮接吧'); return false; }
  mixes--;
  remainMs = Math.max(1000, remainMs - MIX_COST);
  for (var i = 0; i < cells.length; i++) {
    var t = cells[i];
    if (!t.pipe || t.lock) continue;
    t.rot = (t.rot + 1 + randInt(3)) % 4;
  }
  lastKey = '';
  sfx.noise(0.12, 0.1);
  msg('🔀 全盘重拧（扣 6 秒）—— 剩下的路自己走');
  hud();
  return true;
}

/* ==================== 关卡流程 ==================== */
function newRound() {
  level = 1;
  score = 0;
  paused = false;
  seedBase = (FIXED_SEED || ((Date.now() >>> 0) ^ (Math.floor(Math.random() * 0xffffffff) >>> 0))) >>> 0;
  rnd = rngOf(seedBase);
  genLevel(1);
  buildDOM();
  phase = 'play';
  lastKey = '';
  paint(survey());
  hud();
  msg('第 <b>1</b> 关 · ' + pipes + ' 根管子 · ' + fmtTime(limitMs) + ' —— 水已经开始流了');
}
function startLevel(lv) {
  level = lv;
  genLevel(lv);
  buildDOM();
  phase = 'play';
  lastKey = '';
  hide();
  paint(survey());
  hud();
  msg('第 <b>' + lv + '</b> 关 · ' + cols + '×' + rows + ' · ' + pipes + ' 根管子 · ' + fmtTime(limitMs));
}
function levelClear(sv) {
  phase = 'clear';
  var gain = gainOf();
  lastGain = gain;
  score += gain;
  if (everDry) score += dryBonus();
  if (score > num('gd.best')) store.set('gd.best', score);
  if (level > num('gd.lv')) store.set('gd.lv', level);
  sfx.melody([[659, 0.06], [880, 0.08], [1175, 0.12]]);
  if (level >= STAGES) { winRun(); return; }
  show('<div class="ov-emoji">🚿</div><h2>第 ' + level + ' 关通了</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<div class="gd-ov"><p>' + wetN + ' 格全过水 · 余水 <b>' + fmtTime(remainMs) + '</b> · 本关 +' + gain + ' 分' +
    (everDry ? ' · <span class="gd-good">一滴没漏 +' + dryBonus() + '</span>' : '') + '</p>' +
    '<p>下一关 ' + Math.min(colsOf(level + 1), 10) + '×' + Math.min(rowsOf(level + 1), 8) + '，水压更高</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="next">下一关</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function winRun() {
  phase = 'over';
  saveRecords();
  sfx.melody([[523, 0.09], [659, 0.09], [784, 0.09], [1046, 0.22]]);
  show('<div class="ov-emoji">🏆</div><h2>十关管路全通</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">' + D().label + ' · 累计通水 ' + num('gd.flow') + ' 格 · 纪录 ' + num('gd.best') + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function gameOver(why) {
  phase = 'over';
  saveRecords();
  sfx.melody([[392, 0.12], [330, 0.14], [262, 0.24]]);
  show('<div class="ov-emoji">🕳️</div><h2>' + (why || '水用完了') + '</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">' + D().label + ' · 停在第 ' + level + ' 关 · 这一关漏过 ' + (everDry ? '0' : '若干') + ' 次' +
    ' · 累计通水 ' + num('gd.flow') + ' 格 · 纪录 ' + num('gd.best') + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function saveRecords() {
  if (score > num('gd.best')) store.set('gd.best', score);
  if (level > num('gd.lv')) store.set('gd.lv', level);
}
function togglePause() {
  if (phase !== 'play') return;
  paused = !paused;
  hud();
}
function act(name) {
  if (name === 'start') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'again') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'next') { sfx.resume(); startLevel(level + 1); return; }
  if (name === 'resume') { hide(); paused = false; hud(); return; }
  if (name === 'stats') { stats(); return; }
}

/* ==================== 渲染 ==================== */
function buildDOM() {
  if (!boardEl) return;
  boardEl.innerHTML = '';
  node = [];
  boardEl.style.gridTemplateColumns = 'repeat(' + cols + ', var(--cell))';
  for (var i = 0; i < cells.length; i++) {
    var el = document.createElement('div');
    el.className = 'gd-cell';
    el.attrs.role = 'gridcell';
    el.dataset.i = String(i);
    var pipe = document.createElement('div');
    pipe.className = 'gd-pipe';
    var arms = [];
    for (var d = 0; d < 4; d++) {
      var a = document.createElement('i');
      a.className = 'gd-arm ' + ARM[d];
      pipe.appendChild(a);
      arms.push(a);
    }
    var core = document.createElement('i');
    core.className = 'gd-core';
    pipe.appendChild(core);
    el.appendChild(pipe);
    var lock = document.createElement('span');
    lock.className = 'gd-lock';
    lock.textContent = '🔒';
    el.appendChild(lock);
    boardEl.appendChild(el);
    node.push({ el: el, pipe: pipe, arms: arms, lock: lock });
  }
}
function paint(sv) {
  if (!boardEl || !node.length) return;
  var s = sv || survey();
  for (var i = 0; i < cells.length; i++) {
    var t = cells[i], nd = node[i];
    if (!nd) continue;
    var cls = 'gd-cell';
    if (!t.pipe) cls += ' empty';
    if (t.wet) cls += ' wet';
    if (t.lock) cls += ' lock';
    if (i === srcIdx) cls += ' src';
    if (i === snkIdx) cls += ' snk';
    if (i === curIdx) cls += ' cur';
    if (i === hintAt && clock < hintUntil) cls += ' hint';
    var dm = s.drip[i] || 0;
    if (dm) cls += ' leaky drip';
    nd.el.className = cls;
    nd.pipe.style.transform = 'rotate(' + (t.rot * 90) + 'deg)';
    nd.lock.className = 'gd-lock' + (t.lock ? '' : ' hide');
    var baseRot = ((t.rot % 4) + 4) % 4;
    for (var d = 0; d < 4; d++) {
      var on = (t.base & bitOf(d)) ? 1 : 0;
      var curDir = (d + baseRot) % 4;
      var drips = (dm & bitOf(curDir)) ? 1 : 0;
      nd.arms[d].className = 'gd-arm ' + ARM[d] + (on ? '' : ' off') + (drips ? ' drip' : '');
    }
  }
}
function hud() {
  if (!elLv) return;
  elLv.textContent = level;
  elClock.textContent = fmtTime(remainMs);
  elLeak.textContent = leakN;
  elWet.textContent = wetN + '/' + pipes;
  elScore.textContent = score;
  elClock.className = 'value ' + (remainMs < 8000 ? 'bad' : remainMs < 18000 ? 'warn' : 'warn');
  elLeak.className = 'value ' + (leakN ? 'bad' : 'good');
  btnHint.textContent = '💡<span>提示 ' + hints + '</span>';
  btnMix.textContent = '🔀<span>重排 ' + mixes + '</span>';
  btnHint.disabled = phase !== 'play' || hints <= 0;
  btnMix.disabled = phase !== 'play' || mixes <= 0;
  btnPause.innerHTML = paused ? '▶<span>继续</span>' : '⏸<span>暂停</span>';
}
function msg(html) { if (msgEl) msgEl.innerHTML = html; }
function show(html) {
  if (!ovContent) return;
  ovContent.innerHTML = html;
  overlayEl.classList.add('show');
}
function hide() { if (overlayEl) overlayEl.classList.remove('show'); }
function ovShown() { return !!(overlayEl && overlayEl._cls && overlayEl._cls.indexOf('show') >= 0); }
function intro() {
  phase = 'intro';
  hud();
  show('<div class="ov-emoji">🔧</div><h2>接根水管</h2>' +
    '<p class="hint">水从左边 <b>💧</b> 灌进来，接到右边 <b>🚿</b> 就通关。<br>' +
    '管子<b>只许转不许挪</b>：点一下顺时针 90°，右键逆时针。<br>' +
    '接口对不上就是<b>漏水</b>：漏一处时间双倍掉，漏三处基本宣告。水一 hop 一 hop 往前爬，' +
    '<b>边漏边接</b>才是这关的心跳。<br>🔒 是固定接头（开局就对），空位上还可能有些假管子别理。' +
    '共 <b>' + STAGES + '</b> 关，越往后盘越大、水爬得越快。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开水阀</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function stats() {
  show('<h2>本机战绩</h2><div class="gd-ov">' +
    '<p>最高分 <b>' + Math.max(num('gd.best'), score) + '</b> 分 · 难度 <b>' + D().label + '</b></p>' +
    '<p>这一局：' + score + ' 分 · 第 ' + level + '/' + STAGES + ' 关 · 累计通水 <b>' + num('gd.flow') + '</b> 格</p>' +
    '<p>本关盘面 ' + cols + '×' + rows + ' · 管子 ' + pipes + ' 根 · 已过水 ' + wetN + ' 格 · 限时 ' + fmtTime(limitMs) + '</p>' +
    '<p>当前漏水 <b>' + leakN + '</b> 处（时间 ×' + drainOf(leakN).toFixed(1) + '） · 余水 ' + fmtTime(remainMs) +
    ' · 提示剩 ' + hints + ' 次 · 重排剩 ' + mixes + ' 次 · 倍率 ×' + D().mult + '</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="' + (phase === 'play' ? 'resume' : phase === 'clear' ? 'next' : 'again') + '">' +
    (phase === 'play' ? '继续接' : phase === 'clear' ? '下一关' : '再来一局') + '</button></div>');
}

/* ==================== 输入 ==================== */
function cellFromEvent(ev) {
  var t = ev && ev.target && ev.target.closest ? ev.target.closest('[data-i]') : null;
  if (!t) return -1;
  var i = parseInt(t.dataset.i, 10);
  return isNaN(i) ? -1 : i;
}
if (boardEl) {
  boardEl.addEventListener('click', function (ev) {
    sfx.resume();
    var i = cellFromEvent(ev);
    if (i >= 0) rotate(i, 1);
  });
  boardEl.addEventListener('contextmenu', function (ev) {
    ev.preventDefault && ev.preventDefault();
    var i = cellFromEvent(ev);
    if (i >= 0) rotate(i, -1);
  });
}
window.addEventListener('keydown', function (ev) {
  var k = ev.key;
  if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); return; }
  if (k === 't' || k === 'T') { stats(); return; }
  if (k === 'n' || k === 'N') { newRound(); intro(); return; }
  if (phase === 'intro') { if (k === 'Enter' || k === ' ') act('start'); return; }
  if (phase === 'clear') { if (k === 'Enter' || k === ' ') act('next'); return; }
  if (phase === 'over') { if (k === 'Enter' || k === ' ') act('again'); return; }
  if (phase !== 'play') return;
  if (k === 'ArrowUp') { moveCur(0); lastKey = ''; paint(survey()); return; }
  if (k === 'ArrowRight') { moveCur(1); lastKey = ''; paint(survey()); return; }
  if (k === 'ArrowDown') { moveCur(2); lastKey = ''; paint(survey()); return; }
  if (k === 'ArrowLeft') { moveCur(3); lastKey = ''; paint(survey()); return; }
  if (k === 'Enter' || k === ' ') {
    ev.preventDefault && ev.preventDefault();
    if (k === ' ') { togglePause(); return; }
    rotate(curIdx, ev.shiftKey ? -1 : 1);
    return;
  }
  if (k === 'h' || k === 'H') { useHint(); return; }
  if (k === 'r' || k === 'R') { mixBoard(); return; }
  if (k === 'Escape') { paused = true; hud(); return; }
});
if (btnPause) btnPause.addEventListener('click', function () { sfx.resume(); togglePause(); });
if (btnHint) btnHint.addEventListener('click', function () { sfx.resume(); useHint(); });
if (btnMix) btnMix.addEventListener('click', function () { sfx.resume(); mixBoard(); });
if (byId('btnStats')) byId('btnStats').addEventListener('click', function () { sfx.resume(); stats(); });
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
      store.set('gd.diff', diff);
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

/* ==================== 主循环 ==================== */
var rafId = 0;
function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
var last = nowMs(), acc = 0;
function lastDt() {
  var now = nowMs();
  var dt = Math.min(Math.max(now - last, 0), 120);
  acc += dt;
  var use = 0;
  if (acc >= FRAME_MS) { use = Math.min(acc, FRAME_MS * 4); acc -= use; }
  return use;
}
function draw() {
  rafId = window.requestAnimationFrame(draw);
  stepFrame(lastDt());
  last = nowMs();
}
newRound();
phase = 'intro';
intro();
syncSound();
syncDiff();
if (window.requestAnimationFrame) rafId = window.requestAnimationFrame(draw);
})();
