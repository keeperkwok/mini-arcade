/* 连连看 —— 眼力 + 手速：两张同样的牌，通路只穿空位和外圈、拐弯不超过两次，就能连走。
   机制：① 牌面比实际可视范围多一圈「外走廊」，所以贴着边的牌总能绕出去 —— 连通判定
   用「按拐弯次数分层的射线 BFS」来做，顺带把连线画出来，规则和画线是同一套代码；
   ② 全场一个整数「拍」时钟（1 拍 = 0.1 秒）：倒计时、连击窗口、连线残留全按拍算，
   所以任何时刻的局面都能逐步推算，不会有浮点漂移；
   ③ 2.5 秒内接着消就叠连击；牌面一旦没有任何可连的对子就自动洗牌，洗牌次数用完直接散场。
   纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 常量与难度表 ==================== */
var STEP_MS = 100;        // 一拍 = 100ms
var STAGES = 8;           // 一局八盘
var COMBO_GAP = 25;       // 2.5 秒内接着消就叠连击
var PATH_TICKS = 4;       // 连线亮 0.4 秒
var HINT_TICKS = 25;      // 提示高亮 2.5 秒
var HINT_COST = 30;       // 提示扣 3 秒
var MIX_COST = 50;        // 手动洗牌扣 5 秒
var DIFFS = {
  quick: { key: 'quick', label: '眼疾', cols: 6, rows: 4, kinds: 8, time: 95, mult: 0.8, hints: 3, mixes: 3 },
  sharp: { key: 'sharp', label: '手快', cols: 8, rows: 5, kinds: 10, time: 130, mult: 1, hints: 2, mixes: 2 },
  master: { key: 'master', label: '老手', cols: 10, rows: 6, kinds: 12, time: 175, mult: 1.45, hints: 1, mixes: 2 },
};
var PIECES = [
  { k: '🍎', n: '苹果' }, { k: '🍇', n: '葡萄' }, { k: '🍉', n: '西瓜' }, { k: '🍑', n: '桃子' },
  { k: '🥝', n: '猕猴桃' }, { k: '🍋', n: '柠檬' }, { k: '🌶️', n: '辣椒' }, { k: '🍄', n: '蘑菇' },
  { k: '🐞', n: '瓢虫' }, { k: '🦋', n: '蝴蝶' }, { k: '🐟', n: '小鱼' }, { k: '🍩', n: '甜甜圈' },
  { k: '⭐', n: '星星' }, { k: '🔔', n: '铃铛' },
];
var STAGE_NAMES = ['热身', '开胃', '上手', '顺了', '加速', '紧起来', '最后两盘', '收官'];

function rngOf(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FIXED_SEED：地址栏写 #seed=数字 就能钉住同一副牌（同一盘面比谁快）
var FIXED_SEED = (function () {
  var m = /seed=(\d+)/.exec((typeof location !== 'undefined' && location.hash) || '');
  return m ? (parseInt(m[1], 10) >>> 0) : 0;
})();
var seedBase = 0;

/* ==================== 纯规则 ==================== */
function D() { return DIFFS[diff]; }
function gw() { return D().cols + 2; }             // 含外走廊的宽
function gh() { return D().rows + 2; }
function idxOf(x, y) { return y * gw() + x; }
function xOf(i) { return i % gw(); }
function yOf(i) { return (i - (i % gw())) / gw(); }
function inside(i) { var x = xOf(i), y = yOf(i); return x >= 1 && y >= 1 && x <= D().cols && y <= D().rows; }
function occ(i) { return cells[i] > 0; }
function limitTicks() { return Math.max(45, D().time - stage * 10) * 10; }
function gainOf() { return Math.round((12 + Math.max(0, Math.min(combo - 1, 8)) * 3) * D().mult); }
function clearBonus() { return Math.round(ticks * 0.25 * D().mult); }
function fmtTime(tk) {
  var sec = Math.max(0, Math.floor(tk / 10));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
var DIRXY = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function stepTo(i, d) {
  var x = xOf(i) + DIRXY[d][0], y = yOf(i) + DIRXY[d][1];
  if (x < 0 || y < 0 || x >= gw() || y >= gh()) return -1;
  return y * gw() + x;
}

/* 连通判定：按「拐弯次数」一层层往外打射线。
   第 0 层 = 从起点直着能扫到的所有空格；每上一层就多拐一个弯。
   最多允许两次拐弯 —— 这就是连连看的铁律，画线用的也是它算出来的路径。 */
function linkOf(a, b) {
  if (a === b) return null;
  if (cells[a] === 0 || cells[b] === 0) return null;
  if (cells[a] !== cells[b]) return null;
  var swept = {};    // 已经被当作射线起点扫过的格子
  var queued = {};
  var cur = [{ i: a, path: [a] }];
  for (var turn = 0; turn <= 2; turn++) {
    var next = [];
    for (var n = 0; n < cur.length; n++) {
      var node = cur[n];
      swept[node.i] = 1;
      for (var d = 0; d < 4; d++) {
        var cell = node.i;
        var seg = [];                        // 这条射线扫过的空格，最后一起画进连线
        while (true) {
          cell = stepTo(cell, d);
          if (cell < 0) break;
          if (cell === b) return { turns: turn, path: node.path.concat(seg, [cell]) };
          if (occ(cell)) break;              // 撞上别的牌，这条线断了
          if (swept[cell]) break;            // 这格子的四个方向都扫过了，再往下没有新东西
          seg.push(cell);
          if (!queued[cell]) { queued[cell] = 1; next.push({ i: cell, path: node.path.concat(seg) }); }
        }
      }
    }
    cur = next;
    if (!cur.length) break;
  }
  return null;
}

// 所有还能连的对子（同种牌两两试一遍，顺序固定所以可复现）
function pairList() {
  var byKind = {};
  for (var i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    (byKind[cells[i]] = byKind[cells[i]] || []).push(i);
  }
  var out = [];
  var kinds = Object.keys(byKind).sort(function (a, b) { return a - b; });
  for (var k = 0; k < kinds.length; k++) {
    var list = byKind[kinds[k]];
    for (var p = 0; p < list.length; p++) {
      for (var q = p + 1; q < list.length; q++) {
        if (linkOf(list[p], list[q])) out.push([list[p], list[q]]);
      }
    }
  }
  return out;
}
function findPair() {
  var l = pairList();
  return l.length ? l[0] : null;
}
function tileCount() {
  var n = 0;
  for (var i = 0; i < cells.length; i++) if (cells[i]) n++;
  return n;
}

/* 发牌：内圈铺满，每种牌成对出现；洗到至少有一对能连为止 */
function dealBoard(rnd) {
  var total = D().cols * D().rows;
  var pairs = total / 2;
  var kinds = [];
  for (var p = 0; p < pairs; p++) kinds.push(1 + (p % D().kinds));
  var vals = [];
  for (var q = 0; q < kinds.length; q++) { vals.push(kinds[q]); vals.push(kinds[q]); }
  for (var tryN = 0; tryN < 60; tryN++) {
    shuffleArr(vals, rnd);
    cells = new Array(gw() * gh()).fill(0);
    var at = 0;
    for (var y = 1; y <= D().rows; y++) {
      for (var x = 1; x <= D().cols; x++) cells[idxOf(x, y)] = vals[at++];
    }
    if (findPair()) return;
  }
}
function shuffleArr(arr, rnd) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rnd() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
// 洗牌：只把剩下这些牌在原来的占位上重排，牌数与形状不变
function mixBoard(rnd) {
  var slots = [], vals = [];
  for (var i = 0; i < cells.length; i++) if (cells[i]) { slots.push(i); vals.push(cells[i]); }
  if (slots.length < 4) return false;
  for (var tryN = 0; tryN < 80; tryN++) {
    shuffleArr(vals, rnd);
    for (var s = 0; s < slots.length; s++) cells[slots[s]] = vals[s];
    if (findPair()) return true;
  }
  return !!findPair();
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
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'lk.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var boardEl = byId('board'), msgEl = byId('msg');
var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elClock = byId('clock'), elLeft = byId('left'), elCombo = byId('combo'), elScore = byId('score');
var elHint = byId('hintN'), elMix = byId('mixN'), btnHint = byId('btnHint'), btnMix = byId('btnMix'), btnPause = byId('btnPause');
var cellEls = [];

/* ==================== 局面状态 ==================== */
var phase = 'intro';       // intro | play | clear | over
var diff = store.get('lk.diff', 'sharp');
if (!DIFFS[diff]) diff = 'sharp';
var cells = [];
var stage = 0, score = 0, ticks = 0, clock = 0, gap = 999, combo = 0, bestCombo = 0;
var hints = 0, mixes = 0, sel = -1, paused = false;
var pathCells = [], pathUntil = 0, hintPair = null, hintUntil = 0, gone = [], goneUntil = 0;
var lastBonus = 0, lastGain = 0;

/* ==================== 关卡流程 ==================== */
function newRound() {
  score = 0;
  stage = 0;
  combo = 0;
  bestCombo = 0;
  seedBase = (FIXED_SEED || ((Date.now() >>> 0) ^ (Math.floor(Math.random() * 0xffffffff) >>> 0))) >>> 0;
  startStage(0);
}
function startStage(i) {
  stage = i;
  var rnd = rngOf((seedBase + i * 104729) >>> 0);
  dealBoard(rnd);
  ticks = limitTicks();
  clock = 0;
  gap = 999;
  combo = 0;
  sel = -1;
  paused = false;
  pathCells = [];
  hintPair = null;
  gone = [];
  hints = D().hints;
  mixes = D().mixes;
  phase = 'play';
  buildBoard();
  hud();
  paint();
  msg('第 ' + (i + 1) + ' 盘 · <b>' + (cells.length ? tileCount() / 2 : 0) + '</b> 对牌 · 限时 <b>' +
    fmtTime(ticks) + '</b> —— 2.5 秒内接着消就叠连击');
}
function buildBoard() {
  if (!boardEl) return;
  boardEl.style.gridTemplateColumns = 'repeat(' + gw() + ', 1fr)';
  var html = '';
  for (var i = 0; i < cells.length; i++) html += '<div class="lk-cell" data-i="' + i + '"></div>';
  boardEl.innerHTML = html;
  cellEls = boardEl.querySelectorAll('.lk-cell');
}
function pieceOf(i) { return PIECES[(cells[i] - 1) % PIECES.length]; }

/* ==================== 消除 ==================== */
function tap(i) {
  if (phase !== 'play' || paused) return false;
  if (i < 0 || i >= cells.length) return false;
  if (!cells[i]) { if (sel >= 0) { sel = -1; paint(); } return false; }
  if (sel < 0) { sel = i; sfx.tone(660, 0.03, 'triangle', 0.09); paint(); msg('选中 ' + pieceOf(i).n + '，再点一张一样的'); return true; }
  if (sel === i) { sel = -1; paint(); msg('取消选中'); return true; }
  if (cells[sel] !== cells[i]) {
    var old = sel;
    sel = i;
    sfx.tone(240, 0.04, 'square', 0.08);
    paint();
    markBad(old);
    msg('花色不一样 —— 换成 ' + pieceOf(i).n);
    return true;
  }
  var link = linkOf(sel, i);
  if (!link) {
    sfx.tone(180, 0.06, 'sawtooth', 0.1);
    markBad(i);
    msg('<span class="lk-bad">连不过去</span>：拐弯超过两次，或者路上有牌挡着');
    return false;
  }
  removePair(sel, i, link);
  return true;
}
function removePair(a, b, link) {
  cells[a] = 0;
  cells[b] = 0;
  sel = -1;
  combo = gap <= COMBO_GAP ? combo + 1 : 1;
  bestCombo = Math.max(bestCombo, combo);
  gap = 0;
  lastGain = gainOf();
  score += lastGain;
  store.set('lk.pair', num('lk.pair') + 1);
  pathCells = link.path.slice();
  pathUntil = clock + PATH_TICKS;
  gone = [a, b];
  goneUntil = clock + 3;
  sfx.tone(520 + Math.min(combo, 8) * 70, 0.05, 'square', 0.13, 0, 720 + Math.min(combo, 8) * 90);
  if (combo >= 4) sfx.tone(1180, 0.05, 'triangle', 0.08, 0.05);
  hud();
  paint();
  if (tileCount() === 0) { stageClear(); return; }
  if (guardDead()) { hud(); paint(); }
}

/* 死局守卫：一对都连不上时，先免费自动洗一次牌；连洗牌次数都没了就散场 */
function guardDead() {
  if (tileCount() === 0 || findPair()) return false;
  if (mixes > 0) {
    mixes--;
    mixBoard(rngOf((seedBase + clock * 7717 + stage * 131) >>> 0));
    msg('<span class="lk-warn">一对都连不上了，自动洗牌（手动洗牌还剩 ' + mixes + ' 次）</span>');
  } else {
    gameOver('牌面连不动了，也没有洗牌次数');
  }
  return true;
}
function markBad(i) {
  var el = cellEls[i];
  if (!el) return;
  el.classList.add('bad');
}
function useHint() {
  if (phase !== 'play' || paused) return;
  if (hints <= 0) { msg('<span class="lk-bad">提示用完了</span>'); return; }
  var p = findPair();
  if (!p) { msg('<span class="lk-bad">现在一对都连不上</span>'); return; }
  hints--;
  ticks = Math.max(1, ticks - HINT_COST);
  hintPair = p;
  hintUntil = clock + HINT_TICKS;
  sel = -1;
  sfx.tone(900, 0.06, 'sine', 0.12, 0, 1300);
  msg('提示：' + pieceOf(p[0]).n + ' ↔ ' + pieceOf(p[1]).n + '（扣 3 秒）');
  hud();
  paint();
}
function useMix(manual) {
  if (phase !== 'play' || paused) return;
  if (mixes <= 0) { msg('<span class="lk-bad">洗牌次数用完了</span>'); return; }
  mixes--;
  if (manual) ticks = Math.max(1, ticks - MIX_COST);
  var rnd = rngOf((seedBase + clock * 3301 + stage * 17) >>> 0);
  mixBoard(rnd);
  sel = -1;
  hintPair = null;
  sfx.noise(0.18, 0.12);
  msg('重新洗过一副（扣 ' + (manual ? '5' : '0') + ' 秒，还剩 ' + mixes + ' 次）');
  hud();
  paint();
}
function togglePause() {
  if (phase !== 'play') return;
  paused = !paused;
  if (btnPause) btnPause.innerHTML = paused ? '▶<span>继续</span>' : '⏸<span>暂停</span>';
  hud();
}
function stageClear() {
  lastBonus = clearBonus();
  score += lastBonus;
  phase = 'clear';
  saveRecords();
  sfx.melody([[659, 0.06], [880, 0.08], [1175, 0.12]]);
  var more = stage + 1 < STAGES;
  show('<div class="ov-emoji">🧺</div><h2>第 ' + (stage + 1) + ' 盘清空</h2>' +
    '<p class="hint">剩余时间 <b>' + fmtTime(ticks) + '</b> 折算 <b>+' + lastBonus + '</b> 分 · 最高连击 ×' + bestCombo +
    '<br>当前 ' + score + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="' + (more ? 'next' : 'finish') + '">' +
    (more ? '下一盘 ▶' : '收工结算') + '</button><button class="ghost" data-act="stats">战绩</button></div>');
}
function finishRun() {
  phase = 'over';
  saveRecords();
  sfx.melody([[523, 0.09], [659, 0.09], [784, 0.09], [1046, 0.2]]);
  show('<div class="ov-emoji">🏅</div><h2>八盘全清，眼睛还是你的</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">' + D().label + ' · 最高连击 ×' + bestCombo + ' · 纪录 ' + num('lk.best') + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function gameOver(reason) {
  phase = 'over';
  saveRecords();
  sfx.melody([[392, 0.12], [330, 0.14], [262, 0.24]]);
  show('<div class="ov-emoji">⌛</div><h2>' + reason + '</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">' + D().label + ' · 停在第 ' + (stage + 1) + ' 盘 · 最高连击 ×' + bestCombo +
    ' · 纪录 ' + num('lk.best') + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function saveRecords() {
  if (score > num('lk.best')) store.set('lk.best', score);
  var reach = stage + (tileCount() === 0 ? 1 : 0);
  if (reach > num('lk.lv')) store.set('lk.lv', reach);
}

/* ==================== 渲染 ==================== */
function paint() {
  if (!boardEl || !cellEls.length) return;
  var pathSet = {};
  for (var p = 0; p < pathCells.length; p++) pathSet[pathCells[p]] = 1;
  var goneSet = {};
  for (var q = 0; q < gone.length; q++) if (clock < goneUntil) goneSet[gone[q]] = 1;
  var hintSet = {};
  if (hintPair && clock < hintUntil) { hintSet[hintPair[0]] = 1; hintSet[hintPair[1]] = 1; }
  for (var i = 0; i < cellEls.length; i++) {
    var el = cellEls[i];
    var cls = ['lk-cell'];
    var txt = '';
    if (!inside(i)) cls.push('out');
    if (cells[i]) {
      cls.push('tile');
      txt = pieceOf(i).k;
      if (i === sel) cls.push('sel');
      if (hintSet[i]) cls.push('hint');
    } else if (pathSet[i] && clock < pathUntil) {
      cls.push('path');
      txt = '·';
    }
    if (goneSet[i]) cls.push('gone');
    el.className = cls.join(' ');
    if (el.innerHTML !== txt) el.innerHTML = txt;
  }
}
function hud() {
  if (!elLv) return;
  elLv.textContent = stage + 1;
  elClock.textContent = fmtTime(ticks);
  elClock.className = 'value ' + (ticks <= 100 ? 'bad warn' : 'warn');
  elLeft.textContent = tileCount() / 2;
  elCombo.textContent = combo > 1 ? '×' + combo : '—';
  elScore.textContent = score;
  elHint.textContent = hints;
  elMix.textContent = mixes;
  if (btnHint) btnHint.disabled = phase !== 'play' || hints <= 0 || paused;
  if (btnMix) btnMix.disabled = phase !== 'play' || mixes <= 0 || paused;
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
  show('<div class="ov-emoji">🔗</div><h2>连连看</h2>' +
    '<p class="hint">两张<b>一样</b>的牌，中间通路只要满足两件事就能连走：' +
    '<b>只穿过空位和棋盘外圈</b>、<b>拐弯不超过两次</b>。<br>' +
    '<span class="lk-legend"><i>直着能看见 = 0 个弯</i><i>L 形 = 1 个弯</i><i>Z 形 / U 形 = 2 个弯</i><i>贴着边可以绕出外圈</i></span><br>' +
    '<b>' + STAGES + '</b> 一盘接一盘：时间清零、或者牌面连不动又没有洗牌次数，就散场。' +
    '2.5 秒内接着消会叠连击，每对最高 ×3；清空一盘把剩余时间折成分。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开盘</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function stats() {
  show('<h2>本机战绩</h2><div class="lk-ov">' +
    '<p>最高分 <b>' + Math.max(num('lk.best'), score) + '</b> 分 · 难度 <b>' + D().label + '</b></p>' +
    '<p>这一局：' + score + ' 分 · 第 ' + (stage + 1) + '/' + STAGES + ' 盘 · 累计连走 <b>' + num('lk.pair') + '</b> 对</p>' +
    '<p>盘面 ' + D().cols + '×' + D().rows + ' = ' + (D().cols * D().rows / 2) + ' 对 · 首盘限时 ' + D().time + ' 秒 · 每盘减 10 秒（不低于 45）</p>' +
    '<p>倍率 ×' + D().mult + ' · 提示 ' + D().hints + ' 次/盘（扣 3 秒） · 洗牌 ' + D().mixes + ' 次/盘（扣 5 秒） · 本局最高连击 ×' + bestCombo + '</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="' +
    (phase === 'clear' ? (stage + 1 < STAGES ? 'next' : 'finish') : phase === 'play' ? 'resume' : 'again') + '">' +
    (phase === 'play' ? '继续连' : phase === 'clear' ? (stage + 1 < STAGES ? '下一盘 ▶' : '收工结算') : '再来一局') +
    '</button></div>');
}
function act(name) {
  if (name === 'start') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'again') { sfx.resume(); hide(); newRound(); return; }
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
if (boardEl) {
  boardEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-i]') : null;
    if (!t) return;
    sfx.resume();
    tap(+t.dataset.i);
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
  if (k === 's' || k === 'S') { useMix(true); return; }
});
if (btnHint) btnHint.addEventListener('click', function () { sfx.resume(); useHint(); });
if (btnMix) btnMix.addEventListener('click', function () { sfx.resume(); useMix(true); });
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
      store.set('lk.diff', diff);
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
  ticks--;
  gap++;
  if (gap === COMBO_GAP + 1 && combo > 1) { combo = 0; msg('连击断了，2.5 秒内接着消才能叠上去'); }
  if (ticks <= 0) { ticks = 0; hud(); paint(); gameOver('时间到了'); return; }
  if (ticks === 100) msg('<span class="lk-warn">只剩 10 秒了</span>');
  if (clock >= pathUntil && pathCells.length) pathCells = [];
  if (clock >= hintUntil && hintPair) hintPair = null;
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
