/* 24 点速算 —— 四张牌三步合并，最后剩的那一张正好等于目标
   机制：① 每次只能挑两张牌 + 一个运算符，两张塌成一张：4 → 3 → 2 → 1。中间值一律用分数
        精确存（8 ÷ (3 − 8/3) ＝ 24 全靠分数中间值），除零算非法；减法和除法看选牌先后，
        先点的那张在前 —— 于是「一对牌一个运算符」永远只有一个结果，不会点下去才发现反了。
      ② 发题用穷举求解器现算：先确认这四张确实合得出目标才发；每合完一步再跑一遍求解器，
        一旦剩下这几张无论怎么合都到不了目标，当场判「算死了」——只能撤销或换题，
        不许再随手合一个数骗自己「万一就是 24 呢」。
      ③ 每局限时按「拍」走（1 拍 = 0.1 秒）：留白越多分越高，超过连击窗口就断连击。
   纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 规则常量 ==================== */
var CARDS = 4;              // 每题四张牌
var STEP_MS = 100;          // 一拍 = 0.1 秒
var HINT_COST = 45;         // 请一次提示扣 4.5 秒
var HINT_TICKS = 26;        // 提示高亮能留 2.6 秒
var NUM_MIN = 1, NUM_MAX = 13;   // 牌面就是扑克点数
var GEN_TRIES = 900;        // 出题重采上限
var DIFFS = {
  easy: { key: 'easy', label: '慢慢算', mult: 0.8, rounds: 6, sec: 40, floor: 30, step: 1, hints: 4, skips: 4, combo: 0, goals: [24], want: 'int' },
  std: { key: 'std', label: '标准局', mult: 1, rounds: 8, sec: 26, floor: 16, step: 1, hints: 3, skips: 3, combo: 9, goals: [24], want: 'any' },
  rush: { key: 'rush', label: '抢答赛', mult: 1.6, rounds: 6, sec: 30, floor: 18, step: 2, hints: 2, skips: 2, combo: 12, goals: [24, 12, 36], want: 'frac' },
};
var OPS = [
  { op: 'add', n: '加', sym: '＋' }, { op: 'sub', n: '减', sym: '－' },
  { op: 'mul', n: '乘', sym: '×' }, { op: 'div', n: '除', sym: '÷' },
];

function rngOf(seed) {
  var s = seed >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// FIXED_SEED：地址栏写 #seed=数字 就能钉住同一串题（同事之间比谁快）
var FIXED_SEED = (function () {
  var m = /seed=(\d+)/.exec((typeof location !== 'undefined' && location.hash) || '');
  return m ? (parseInt(m[1], 10) >>> 0) : 0;
})();
var seedBase = 0;

/* ==================== 纯规则：分数 ==================== */
/* 分数一律约到最简、分母为正；F(分子, 分母) 里分母为 0 直接返回 null = 这一步非法。
   撤销要把两张源牌塞回原位：先塞小下标、再塞大下标，顺序反了就错位。 */
function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { var t = a % b; a = b; b = t; }
  return a || 1;
}
function F(n, d) {
  if (!d) return null;
  if (d < 0) { n = -n; d = -d; }
  var g = gcd(n, d);
  return { n: n / g, d: d / g };
}
function fi(n) { return { n: n, d: 1 }; }
function fadd(a, b) { return F(a.n * b.d + b.n * a.d, a.d * b.d); }
function fsub(a, b) { return F(a.n * b.d - b.n * a.d, a.d * b.d); }
function fmul(a, b) { return F(a.n * b.n, a.d * b.d); }
function fdiv(a, b) { return b.n === 0 ? null : F(a.n * b.d, a.d * b.n); }
function feq(a, b) { return a.n === b.n && a.d === b.d; }
function isInt(a) { return a.d === 1; }
function fmt(a) { return a.d === 1 ? String(a.n) : a.n + '/' + a.d; }
/* 一次合并的所有可能结果：加减乘除之外，减法与除法还要看两张牌的先后 */
function combine(a, b, op) {
  if (op === 'add') return fadd(a, b);
  if (op === 'sub') return fsub(a, b);
  if (op === 'mul') return fmul(a, b);
  if (op === 'div') return fdiv(a, b);
  return null;
}

/* ==================== 纯规则：穷举求解 ==================== */
/* 任取两张 ×（加、乘、减两个方向、除两个方向）→ 把结果塞回去递归。
   返回第一步 {a, b, op, val}：a、b 是下标，减法除法谁是前项全写在下标顺序里，
   所以「先点 a 再点 b 然后按 op」必然复现 val —— 提示不会把你往坑里带。
   intOnly = true 时只承认「全程不出现分数」的走法 —— 用来判定这题是不是硬题。 */
function solveStep(vals, goal, intOnly) {
  var i, j, q, t;
  if (vals.length === 1) return feq(vals[0], goal) ? { done: true } : null;
  for (i = 0; i < vals.length; i++) {
    for (j = i + 1; j < vals.length; j++) {
      var a = vals[i], b = vals[j], rest = [];
      for (q = 0; q < vals.length; q++) if (q !== i && q !== j) rest.push(vals[q]);
      var tries = [
        { a: i, b: j, op: 'add', r: fadd(a, b) }, { a: i, b: j, op: 'mul', r: fmul(a, b) },
        { a: i, b: j, op: 'sub', r: fsub(a, b) }, { a: j, b: i, op: 'sub', r: fsub(b, a) },
        { a: i, b: j, op: 'div', r: fdiv(a, b) }, { a: j, b: i, op: 'div', r: fdiv(b, a) },
      ];
      for (t = 0; t < tries.length; t++) {
        var r = tries[t].r;
        if (!r) continue;
        if (intOnly && !isInt(r)) continue;
        var step = { a: tries[t].a, b: tries[t].b, op: tries[t].op, val: r };
        if (!rest.length) { if (feq(r, goal)) return step; continue; }
        if (solveStep(rest.concat([r]), goal, intOnly)) return step;
      }
    }
  }
  return null;
}
function solvable(vals, goal, intOnly) {
  if (!vals.length) return false;
  return !!solveStep(vals, goal, intOnly);
}
/* 这堆牌合到目标还差几步：每合一次少一张，纯算张数就是答案 */
function stepsLeft(vals) { return Math.max(0, vals.length - 1); }
/* 发题：随机四张 → 求解器验有解；want 决定「必须是硬题」还是「必须不用分数也能做」 */
function genPuzzle(rnd, goal, want) {
  for (var t = 0; t < GEN_TRIES; t++) {
    var nums = [], i;
    for (i = 0; i < CARDS; i++) nums.push(NUM_MIN + Math.floor(rnd() * (NUM_MAX - NUM_MIN + 1)));
    var vals = nums.map(fi);
    if (!solvable(vals, fi(goal), false)) continue;
    var pureInt = solvable(vals, fi(goal), true);
    if (want === 'int' && !pureInt) continue;
    if (want === 'frac' && pureInt) continue;
    return { nums: nums, intOnly: pureInt, goal: goal };
  }
  return null;
}

/* ==================== 得分 ==================== */
function D() { return DIFFS[diff]; }
function goalNow() { var gs = D().goals; return gs[round % gs.length]; }
function limitSec() { return Math.max(D().floor, D().sec - D().step * round); }
function limitTicks() { return Math.round(limitSec() * 10); }
function secLeft() { return Math.floor(Math.max(0, timeTicks) / 10); }
function comboMul() { return 1 + Math.min(6, streak) * 0.15; }
function gainOf() {
  return Math.round((24 + secLeft() * 1.3 + (lastHard ? 20 : 0) + (hinted ? 0 : 16)) * comboMul() * D().mult);
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
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'pt.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var cardsEl = byId('cards'), opsEl = byId('ops'), msgEl = byId('msg');
var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elGoal = byId('goal'), elCombo = byId('combo'), elClock = byId('clock'), elScore = byId('score');
var elHint = byId('hintN'), elUndo = byId('undoN'), elSkip = byId('skipN');
var btnHint = byId('btnHint'), btnUndo = byId('btnUndo'), btnSkip = byId('btnSkip'), btnPause = byId('btnPause');
var cardEls = [], opEls = opsEl ? [].slice.call(opsEl.querySelectorAll('[data-op]')) : [];

/* ==================== 对局状态 ==================== */
var phase = 'intro';        // intro | play | clear | over
var diff = store.get('pt.diff', 'std');
if (!DIFFS[diff]) diff = 'std';
var hand = [];              // 手上的牌：{ n, d, mix }
var hist = [];              // 合并历史，供撤销
var sel = [];               // 选中的两张牌下标（先点的在前）
var round = 0, score = 0, streak = 0, bestStreak = 0, solvedRun = 0;
var hints = 0, skips = 0, hinted = false, lastHard = false, stuck = false;
var goal = 24, timeTicks = 0, clock = 0;
var hintStep = null, hintUntil = 0, lastGain = 0, badUntil = 0;
var paused = false;

/* ==================== 题目流程 ==================== */
function newRound() {
  score = 0; round = 0; streak = 0; bestStreak = 0; solvedRun = 0;
  seedBase = (FIXED_SEED || ((Date.now() >>> 0) ^ (Math.floor(Math.random() * 0xffffffff) >>> 0))) >>> 0;
  hints = D().hints; skips = D().skips;
  startPuzzle(0);
}
function startPuzzle(i) {
  round = i;
  goal = goalNow();
  var rnd = rngOf((seedBase + i * 7919 + goal * 131) >>> 0);
  var p = genPuzzle(rnd, goal, D().want) || genPuzzle(rnd, 24, 'any') || { nums: [1, 2, 3, 4], intOnly: false, goal: 24 };
  goal = p.goal || goal;
  hand = p.nums.map(function (n) { return { n: n, d: 1, mix: false }; });
  hist = []; sel = []; stuck = false; hinted = false; lastHard = !p.intOnly;
  hintStep = null; hintUntil = 0;
  timeTicks = limitTicks();
  phase = 'play';
  if (round + 1 > num('pt.lv')) store.set('pt.lv', round + 1);
  buildCards();
  hud();
  paint();
  msg('第 ' + (round + 1) + '/' + D().rounds + ' 题 · 目标 <b>' + goal + '</b> · ' + p.nums.join(' , ') +
    (lastHard ? ' · <span class="pt-warn">这题非得借分数不可</span>' : '') + ' —— 点两张牌，再点运算符');
}
/* 还剩这几张牌能不能合出目标：合完立刻检查，出不来就是「算死了」 */
function alive() { return solvable(hand.map(function (c) { return { n: c.n, d: c.d }; }), fi(goal), false); }
function tryMerge(op) {
  if (phase !== 'play' || paused) return false;
  if (sel.length !== 2) { flash('先点两张牌（' + sel.length + '/2）'); return false; }
  if (stuck) { flash('这一堆已经算死了 —— 撤销或换题'); return false; }
  var a = hand[sel[0]], b = hand[sel[1]];
  var r = combine(a, b, op);
  if (!r) { flash('<span class="pt-bad">0 不能当除数</span>'); return false; }
  var hi = sel[0], lo = sel[1];
  if (hi > lo) { var t = hi; hi = lo; lo = t; }
  hist.push({ i: hi, j: lo, x: hand[hi], y: hand[lo], op: op, got: { n: r.n, d: r.d } });
  hand.splice(lo, 1);
  hand.splice(hi, 1);
  hand.push({ n: r.n, d: r.d, mix: true });
  sel = [];
  store.set('pt.calc', num('pt.calc') + 1);
  hintStep = null;
  sfx.tone(420 + 40 * hand.length, 0.05, 'triangle', 0.08);
  if (hand.length === 1) {
    if (feq(hand[0], fi(goal))) { roundWin(); return true; }
    stuck = true;
    flash('只剩 <b>' + fmt(hand[0]) + '</b> —— 不等于 ' + goal + '，<span class="pt-bad">算死了</span>');
  } else if (!alive()) {
    stuck = true;
    flash('合完这一步，' + hand.map(function (c) { return fmt(c); }).join(' 和 ') +
      ' 无论怎么合都到不了 ' + goal + ' 了 —— <span class="pt-bad">算死了</span>，撤销或换题');
  } else {
    flash('合出 <b>' + fmt(r) + '</b> · 手里还剩 ' + hand.length + ' 张 · 再合 ' + stepsLeft(hand) + ' 步见分晓');
  }
  hud();
  paint();
  return true;
}
function undoMerge() {
  if (phase !== 'play' || !hist.length) { flash('<span class="pt-bad">没有可撤销的合并</span>'); return false; }
  var s = hist.pop();
  hand.pop();                                   // 最近一次合并的结果永远排在最后一张
  hand.splice(s.i, 0, s.x);                     // 再把原来那两张按原位塞回去（先小下标后大下标）
  hand.splice(s.j, 0, s.y);
  sel = [];
  stuck = false;
  sfx.tone(240, 0.04, 'sine', 0.06);
  hud();
  paint();
  flash('退回一步 —— 现在是 ' + hand.map(function (c) { return fmt(c); }).join(' , ') +
    (alive() ? '' : ' <span class="pt-bad">（还是算死了）</span>'));
  return true;
}
function skipPuzzle() {
  if (phase !== 'play') return false;
  if (skips <= 0) { flash('<span class="pt-bad">换题次数用完了</span>'); return false; }
  skips--; streak = 0;
  sfx.tone(200, 0.06, 'sawtooth', 0.07);
  startPuzzle(round);
  flash('换一题 —— <span class="pt-warn">连击断了</span>，剩下的时间接着用');
  return true;
}
function useHint() {
  if (phase !== 'play' || paused) return false;
  if (hints <= 0) { flash('<span class="pt-bad">提示用完了</span>'); return false; }
  if (stuck) { flash('这一堆已经算死了，提示也救不回来 —— 撤销或换题'); return false; }
  var st = solveStep(hand.map(function (c) { return { n: c.n, d: c.d }; }), fi(goal), false);
  if (!st) { flash('看不出解法 —— 这题大概是走不通了'); return false; }
  hints--; hinted = true; streak = 0;
  timeTicks = Math.max(10, timeTicks - HINT_COST);
  hintStep = st; hintUntil = clock + HINT_TICKS;
  sfx.tone(760, 0.06, 'sine', 0.09);
  hud();
  paint();
  var na = fmt(hand[st.a]), nb = fmt(hand[st.b]);
  var sym = st.op === 'add' ? '＋' : st.op === 'sub' ? '－' : st.op === 'mul' ? '×' : '÷';
  msg('提示：先点 <b>' + na + '</b> 再点 <b>' + nb + '</b>，然后按 <b>' + sym + '</b> ＝ <b>' + fmt(st.val) +
    '</b>（还剩 ' + stepsLeft(hand) + ' 步 · 扣 4.5 秒）');
  return true;
}
function roundWin() {
  lastGain = gainOf();
  score += lastGain;
  solvedRun++;
  streak = secLeft() >= D().combo ? streak + 1 : 0;
  if (streak > bestStreak) bestStreak = streak;
  if (score > num('pt.best')) store.set('pt.best', score);
  store.set('pt.solved', num('pt.solved') + 1);
  sfx.melody([660, 880, 1180], 0.08, 'triangle');
  hud();
  paint();
  if (round + 1 >= D().rounds) { runClear(); return; }
  startPuzzle(round + 1);
  msg('答对！这一题进账 <b>+' + lastGain + '</b> 分（剩 ' + secLeft() + ' 秒 ×' + comboMul().toFixed(2) + '）' +
    (streak > 1 ? ' · <span class="pt-good">' + streak + ' 连击</span>' : '') +
    ' —— 第 ' + (round + 1) + ' 题 目标 <b>' + goal + '</b>');
}
function runClear() {
  phase = 'clear';
  if (score > num('pt.best')) store.set('pt.best', score);
  show('<div class="ov-emoji">🧮</div><h2>全对！</h2>' +
    '<p class="hint">' + D().rounds + ' 题全部合出来了，最高 <b>' + bestStreak + '</b> 连击，' +
    '累计 <b>' + score + '</b> 分。</p>' +
    '<div class="pt-ov"><p>本机最高 <b>' + Math.max(num('pt.best'), score) + '</b> 分 · 这一局答对 ' + solvedRun + ' 题</p>' +
    '<p>换题还剩 ' + skips + ' 次 · 提示用过 ' + (hinted ? '不止一次' : '零次') + '</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function gameOver(reason) {
  phase = 'over';
  if (score > num('pt.best')) store.set('pt.best', score);
  sfx.tone(150, 0.2, 'sawtooth', 0.09);
  hud();
  show('<div class="ov-emoji">⌛</div><h2>' + reason + '</h2>' +
    '<div class="pt-ov"><p>这一局 <b>' + score + '</b> 分 · 答到第 ' + (round + 1) + '/' + D().rounds + ' 题（目标 ' + goal + '）</p>' +
    '<p>牌面 ' + hand.map(function (c) { return fmt(c); }).join(' , ') + (stuck ? ' · <span class="pt-bad">已算死</span>' : '') + '</p>' +
    '<p>这一局答对 ' + solvedRun + ' 题 · 最高 ' + bestStreak + ' 连击 · 累计答对 ' + num('pt.solved') + ' 题</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function togglePause() {
  if (phase !== 'play') return;
  paused = !paused;
  if (btnPause) btnPause.innerHTML = paused ? '▶<span>继续</span>' : '⏸<span>暂停</span>';
  if (paused) show('<h2>暂停</h2><p class="hint">牌不动，计时的表也不走。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="resume">继续算</button></div>');
  else hide();
  hud();
}

/* ==================== 渲染 ==================== */
function buildCards() {
  if (!cardsEl) return;
  var html = '';
  for (var i = 0; i < CARDS; i++) html += '<div class="pt-card" data-c="' + i + '"></div>';
  cardsEl.innerHTML = html;
  cardEls = cardsEl.querySelectorAll('.pt-card');
}
function paint() {
  if (!cardEls.length) return;
  for (var i = 0; i < CARDS; i++) {
    var el = cardEls[i], c = hand[i];
    if (!c) {
      el.className = 'pt-card hole';
      el.textContent = '';
      continue;
    }
    var cls = 'pt-card';
    if (c.mix) cls += ' mix';
    if (!isInt(c)) cls += ' frac';
    if (sel.indexOf(i) >= 0) cls += ' sel';
    if (stuck) cls += ' dead';
    if (hintStep && clock < hintUntil && (hintStep.a === i || hintStep.b === i)) cls += ' hint';
    if (clock < badUntil) cls += ' bad';
    el.className = cls;
    el.textContent = fmt(c);
  }
  for (var q = 0; q < opEls.length; q++) {
    var armed = sel.length === 2 && !stuck && phase === 'play' && !paused;
    if (opEls[q]) opEls[q].disabled = !armed;
  }
}
function hud() {
  if (!elLv) return;
  elLv.textContent = round + 1;
  elGoal.textContent = goal;
  elCombo.textContent = '×' + comboMul().toFixed(2);
  elClock.textContent = fmtTime(timeTicks);
  elClock.className = 'value ' + (timeTicks <= 80 ? 'bad warn' : 'warn');
  elScore.textContent = score;
  elHint.textContent = hints;
  elUndo.textContent = hist.length;
  elSkip.textContent = skips;
  if (btnHint) btnHint.disabled = phase !== 'play' || hints <= 0 || paused;
  if (btnUndo) btnUndo.disabled = phase !== 'play' || !hist.length || paused;
  if (btnSkip) btnSkip.disabled = phase !== 'play' || skips <= 0 || paused;
}
function flash(html) { msg(html); badUntil = clock + 3; hud(); paint(); }
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
  show('<div class="ov-emoji">🧮</div><h2>24 点速算</h2>' +
    '<p class="hint">四张牌、三个运算符名额：每次挑<b>两张牌</b>配一个 <b>＋－×÷</b>，两张合成一张，' +
    '合到只剩一张正好等于目标就答对。<b>先点的牌在前</b>（减法和除法在意先后），' +
    '中间值可以是分数 —— 像 3 3 8 8 只能靠 8÷(3−8÷3)。<br>' +
    '每道题单独限时，留白越多分越高；合出一手永远到不了目标的牌会被判<b>算死了</b>，' +
    '只能撤销或换题（换题断连击）。<b>' + DIFFS[diff].rounds + '</b> 题一局。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开算</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function stats() {
  show('<h2>本机战绩</h2><div class="pt-ov">' +
    '<p>最高分 <b>' + Math.max(num('pt.best'), score) + '</b> 分 · 难度 <b>' + D().label + '</b></p>' +
    '<p>这一局：' + score + ' 分 · 第 ' + (round + 1) + '/' + D().rounds + ' 题 · 答对 ' + solvedRun + ' 题 · 最高 ' + bestStreak + ' 连击</p>' +
    '<p>累计答对 <b>' + num('pt.solved') + '</b> 题 · 累计合并 <b>' + num('pt.calc') + '</b> 次</p>' +
    '<p>当前牌面 ' + hand.map(function (c) { return fmt(c); }).join(' , ') + ' · 目标 ' + goal +
    ' · ' + (alive() ? '还能合出来' : '<span class="pt-bad">已经算死</span>') + '</p>' +
    '<p>单题限时 ' + limitSec() + ' 秒 · 提示扣 4.5 秒（' + hints + ' 次）· 换题 ' + skips + ' 次 · 倍率 ×' + D().mult + '</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="' +
    (phase === 'play' ? 'resume' : phase === 'clear' || phase === 'over' ? 'again' : 'start') + '">' +
    (phase === 'play' ? '继续算' : phase === 'intro' ? '开算' : '再来一局') + '</button></div>');
}
function act(name) {
  if (name === 'start' || name === 'again') { sfx.resume(); hide(); newRound(); return; }
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
function toggleSel(i) {
  if (phase !== 'play' || paused || stuck) return;
  if (!hand[i]) return;
  var at = sel.indexOf(i);
  if (at >= 0) sel.splice(at, 1);
  else {
    sel.push(i);
    if (sel.length > 2) sel.shift();
  }
  sfx.tone(520 + 60 * sel.length, 0.03, 'square', 0.05);
  hud();
  paint();
  if (sel.length === 2) {
    var w = combine(hand[sel[0]], hand[sel[1]], 'add');
    msg('先 <b>' + fmt(hand[sel[0]]) + '</b> 后 <b>' + fmt(hand[sel[1]]) + '</b> · 挑个运算符（加法 ' + (w ? fmt(w) : '—') + '）');
  } else if (sel.length === 1) msg('已选 <b>' + fmt(hand[sel[0]]) + '</b> · 再点一张');
  else msg('两张牌都没选');
}
if (cardsEl) {
  cardsEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-c]') : null;
    if (!t) return;
    sfx.resume();
    toggleSel(+t.dataset.c);
  });
}
if (opsEl) {
  opsEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-op]') : null;
    if (!t) return;
    sfx.resume();
    tryMerge(t.dataset.op);
  });
}
window.addEventListener('keydown', function (ev) {
  var k = ev.key;
  if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); return; }
  if (k === 't' || k === 'T') { stats(); return; }
  if (k === 'n' || k === 'N') { newRound(); intro(); return; }
  if (k === 'Escape') { if (phase === 'play' && ovShown()) hide(); return; }
  if (phase === 'intro') { if (k === 'Enter' || k === ' ') act('start'); return; }
  if (phase === 'clear' || phase === 'over') { if (k === 'Enter' || k === ' ') act('again'); return; }
  if (phase !== 'play') return;
  if (k === ' ') { ev.preventDefault && ev.preventDefault(); togglePause(); return; }
  if (k === 'h' || k === 'H') { useHint(); return; }
  if (k === 'u' || k === 'U') { undoMerge(); return; }
  if (k === 'r' || k === 'R') { skipPuzzle(); return; }
  var map = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', x: 'mul', X: 'mul' };
  if (k in map) { ev.preventDefault && ev.preventDefault(); tryMerge(map[k]); return; }
  if (k >= '1' && k <= '9') {
    var i = +k - 1;
    if (i < hand.length) toggleSel(i);
    return;
  }
});
if (btnHint) btnHint.addEventListener('click', function () { sfx.resume(); useHint(); });
if (btnUndo) btnUndo.addEventListener('click', function () { sfx.resume(); undoMerge(); });
if (btnSkip) btnSkip.addEventListener('click', function () { sfx.resume(); skipPuzzle(); });
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
      store.set('pt.diff', diff);
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
  if (timeTicks <= 0) { timeTicks = 0; hud(); paint(); gameOver('时间到了，这一题没合出来'); return; }
  if (timeTicks === 80) msg('<span class="pt-warn">只剩 8 秒了</span>');
  if (clock >= hintUntil) hintStep = null;
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
