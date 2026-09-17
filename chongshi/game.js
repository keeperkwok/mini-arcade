/* 虫食算 —— 一道被虫蛀掉几个数字的竖式：把它们全填回来。填错不判死，但虫当场再咬掉一格
   你原本看得见的数字 —— 信息只会越来越少，牙数耗尽这道算式就报废了。
   机制：竖式按位推演，进位与借位同样是未知数的一部分；出题时挖完空立刻用「列向 DFS + 进位状态」
   数一遍解的个数，必须恰好一解才发给你，所以不存在「填哪个都对」的废题。纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 难度与关卡曲线 ==================== */
var DIFFS = {
  snack: { label: '当点心', bites: 3, clues: 5, swaps: 2, mult: 0.8, ops: ['+'], k0: 2, w0: 2, wmax: 3 },
  meal: { label: '正餐', bites: 2, clues: 3, swaps: 1, mult: 1, ops: ['+', '-'], k0: 3, w0: 2, wmax: 4 },
  feast: { label: '盛宴', bites: 1, clues: 1, swaps: 1, mult: 1.7, ops: ['+', '-', '×'], k0: 3, w0: 3, wmax: 4 },
};
function widthFor(level, d) { return Math.min(d.wmax, d.w0 + Math.floor((level - 1) / 3)); }
function blankFor(level, d) { return Math.min(d.k0 + Math.floor((level - 1) / 2), 6); }
function opFor(level, d) {
  if (level === 1) return d.ops[0];
  return d.ops[Math.min(d.ops.length - 1, Math.floor((level - 1) / 2))];
}
var SIGNS = { '+': '＋', '-': '－', '×': '×' };

/* ==================== 数论小工具 ==================== */
function digs(n) { return String(n).split('').map(function (c) { return +c; }); }
function nlen(n) { return String(n).length; }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ==================== 竖式结构
   pz = { op, w, A:[cell], B:[cell], R:[cell] }，行数组下标 0 = 最高位
   cell = { real 这一位有没有数字, g 真实数字, nz 首位(不可为 0), b 被蛀掉, eaten 本局新咬的 } */
function cellOf(real, g, nz) { return { real: real, g: g, nz: !!nz, b: false, eaten: false }; }
function rowOf(ds, w) {
  var pad = w - ds.length, out = [];
  for (var i = 0; i < w; i++) out.push(i < pad ? cellOf(false, 0, false) : cellOf(true, ds[i - pad], i === pad));
  return out;
}
function buildPz(op, a, b, r) {
  var w = Math.max(nlen(a), nlen(b), nlen(r));
  return { op: op, w: w, A: rowOf(digs(a), w), B: rowOf(digs(b), w), R: rowOf(digs(r), w) };
}
function rowArr(pz, row) { return row === 0 ? pz.A : row === 1 ? pz.B : pz.R; }
function cellAt(pz, idx) { return rowArr(pz, Math.floor(idx / pz.w))[idx % pz.w]; }

/* ==================== 求解器：列向 DFS（一次一位，状态只有进位/借位） ==================== */
var FULL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
function cands(c) {
  if (!c.real) return [0];                       // 这一位根本没有数字
  if (!c.b) return [c.g];
  if (!c.nz) return FULL;
  return [1, 2, 3, 4, 5, 6, 7, 8, 9];
}
function fit(c, d) {
  if (!c.real) return d === 0;                   // 缺位 ⇔ 算出来这一位是 0 且不再往左进
  if (!c.b) return c.g === d;
  return c.nz ? d !== 0 : true;
}
// 返回 { count, first }，count 到 limit 就停（够用就立刻回，性能很省）
function solve(pz, limit) {
  var w = pz.w, op = pz.op, out = { count: 0, first: null };
  var cur = { A: [], B: [], R: [] };
  (function step(p, carry) {
    if (out.count >= limit) return;
    if (p === w) {
      if (carry !== 0) return;
      out.count++;
      if (!out.first) out.first = { A: cur.A.slice(), B: cur.B.slice(), R: cur.R.slice() };
      return;
    }
    var ix = w - 1 - p, ca = pz.A[ix], cb = op === '×' ? pz.B[w - 1] : pz.B[ix], cr = pz.R[ix];
    var la = cands(ca), lb = cands(cb);
    for (var i = 0; i < la.length; i++) {
      for (var j = 0; j < lb.length; j++) {
        var da = la[i], db = lb[j], s, rr, c2;
        if (op === '+') { s = da + db + carry; rr = s % 10; c2 = (s - rr) / 10; }
        else if (op === '-') { s = da - db - carry; if (s < 0) { s += 10; c2 = 1; } else { c2 = 0; } rr = s; }
        else { s = da * db + carry; rr = s % 10; c2 = (s - rr) / 10; }
        if (!fit(cr, rr)) continue;
        cur.A[ix] = da; cur.B[ix] = op === '×' ? (ix === w - 1 ? db : 0) : db; cur.R[ix] = rr;
        step(p + 1, c2);
        if (out.count >= limit) return;
      }
    }
  })(0, 0);
  return out;
}
function solvable(pz) { return solve(pz, 1).count >= 1; }
// 咬过一格之后原答案必须依然成立（信息流失但不能变成死题）
function truthMatches(pz, sol) {
  var rows = ['A', 'B', 'R'];
  for (var r = 0; r < 3; r++) {
    var arr = pz[rows[r]];
    for (var i = 0; i < pz.w; i++) {
      var want = arr[i].real ? arr[i].g : 0;
      if (sol[rows[r]][i] !== want) return false;
    }
  }
  return true;
}

/* ==================== 出题 ==================== */
function carryCount(a, b, r) {
  var da = digs(a), db = digs(b), n = da.length, c = 0, k = 0;
  for (var p = 0; p < n; p++) {
    var x = (da[n - 1 - p] || 0) + (db[n - 1 - p] || 0) + c;
    if (x >= 10) k++;
    c = x >= 10 ? 1 : 0;
  }
  return k;
}
function borrowCount(a, b) {
  var da = digs(a), db = digs(b), n = da.length, bor = 0, k = 0;
  for (var p = 0; p < n; p++) {
    var x = (da[n - 1 - p] || 0) - (db[n - 1 - p] || 0) - bor;
    if (x < 0) { k++; bor = 1; } else bor = 0;
  }
  return k;
}
function sample(op, w) {
  var lo = Math.max(1, Math.pow(10, w - 2)), hi = Math.pow(10, w - 1) - 1, t;
  if (op === '+') {
    for (t = 0; t < 200; t++) {
      var a = randInt(lo, hi), b = randInt(lo, hi), r = a + b;
      if (nlen(r) !== w || carryCount(a, b, r) < 1) continue;
      return { a: a, b: b, r: r };
    }
  } else if (op === '-') {
    var alo = Math.pow(10, w - 1), ahi = Math.pow(10, w) - 1;
    for (t = 0; t < 300; t++) {
      var a2 = randInt(alo, ahi), b2 = randInt(1, hi), r2 = a2 - b2;
      if (nlen(r2) !== w || borrowCount(a2, b2) < 1) continue;
      return { a: a2, b: b2, r: r2 };
    }
  } else {
    for (t = 0; t < 300; t++) {
      var a3 = randInt(lo, hi), d = randInt(2, 9), r3 = a3 * d;
      if (nlen(r3) !== w) continue;
      return { a: a3, b: d, r: r3 };
    }
  }
  return null;
}
// 挖空：至少咬掉「上面一行」与「结果行」各一格，且不能把整题吃光
function dig(pz, k) {
  var top = [], res = [], all = [], w = pz.w, ix;
  for (ix = 0; ix < w; ix++) {
    if (pz.A[ix].real) { top.push(ix); all.push(ix); }
    if (pz.B[ix].real) { top.push(w + ix); all.push(w + ix); }
    if (pz.R[ix].real) { res.push(2 * w + ix); all.push(2 * w + ix); }
  }
  if (top.length < 2 || res.length < 1 || all.length < k + 2) return 0;
  var chosen = [pickOne(res)];
  chosen.push(pickOne(top));
  var guard = 0;
  while (chosen.length < Math.min(k, all.length) && guard++ < 80) {
    var c = pickOne(all);
    if (chosen.indexOf(c) < 0) chosen.push(c);
  }
  for (var i = 0; i < chosen.length; i++) cellAt(pz, chosen[i]).b = true;
  return chosen.length;
}
function generate(level, diff) {
  var d = DIFFS[diff], want = blankFor(level, d), op = opFor(level, d), w = widthFor(level, d);
  for (var k = want; k >= 2; k--) {
    for (var t = 0; t < 400; t++) {
      var s = sample(op, w);
      if (!s) break;
      var pz = buildPz(op, s.a, s.b, s.r);
      if (!dig(pz, k)) break;
      var sol = solve(pz, 2);
      if (sol.count === 1 && truthMatches(pz, sol.first)) { pz.gain = k; return pz; }
    }
  }
  return null;
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
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'cs.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var formEl = byId('form'), padEl = byId('pad'), msgEl = byId('msg');
var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elGap = byId('gap'), elBites = byId('bites'), elScore = byId('score');
var elClue = byId('clueN'), elSwap = byId('swapN'), btnClue = byId('btnClue'), btnSwap = byId('btnSwap');

/* ==================== 局面 ==================== */
var diff = 'meal';
if (!DIFFS[store.get('cs.diff', '')]) diff = 'meal'; else diff = store.get('cs.diff', 'meal');
var level, score, bites, clues, swaps, streak, solvedTotal, savedAt, lastGain, pz, fill, sel, phase = 'intro';

function best() { return num('cs.best'); }

function newRound() {
  var d = DIFFS[diff];
  level = 1; score = 0; bites = d.bites; clues = d.clues; swaps = d.swaps; streak = 0;
  solvedTotal = 0; savedAt = 0; lastGain = 0;
  nextPz();
}
function nextPz() {
  var tries = 0;
  while (tries++ < 40) {
    pz = generate(level, diff);
    if (pz) break;
  }
  if (!pz) {                                     // 出题器兜底：降到最小规模
    var s = sample('+', 2), a = s || { a: 26, b: 45, r: 71 };
    pz = buildPz('+', a.a, a.b, a.r);
    dig(pz, 2);
  }
  fill = [];
  for (var i = 0; i < pz.w * 3; i++) fill.push(null);
  sel = firstBlank();
  phase = 'play';
  render(); hud(); say('挑一个空格，把蛀掉的数字填回来');
}
function blanks() {
  var out = [], w = pz.w;
  for (var row = 0; row < 3; row++) {
    var arr = rowArr(pz, row);
    for (var i = 0; i < w; i++) if (arr[i].real && arr[i].b) out.push(row * w + i);
  }
  return out;
}
function firstBlank() { var b = blanks(); return b.length ? b[0] : -1; }
function gapLeft() {
  var n = 0, list = blanks();
  for (var i = 0; i < list.length; i++) if (fill[list[i]] === null) n++;
  return n;
}

/* ==================== 渲染 ==================== */
function render() {
  if (!formEl) return;
  var w = pz.w, html = '';
  function cells(row) {
    var arr = rowArr(pz, row), out = '';
    for (var i = 0; i < w; i++) {
      var c = arr[i], idx = row * w + i;
      if (!c.real) { out += '<span class="cs-d ghost">·</span>'; continue; }
      if (!c.b) { out += '<span class="cs-d known">' + c.g + '</span>'; continue; }
      var v = fill[idx], cls = 'cs-d blank';
      if (v !== null) cls += ' filled';
      if (c.eaten) cls += ' eaten';
      if (sel === idx) cls += ' sel';
      out += '<button class="' + cls + '" data-i="' + idx + '">' + (v === null ? (c.eaten ? '🐛' : '?') : v) + '</button>';
    }
    return out;
  }
  html += '<span class="cs-sign"></span>' + cells(0);
  html += '<span class="cs-sign">' + SIGNS[pz.op] + '</span>' + cells(1);
  html += '<span class="cs-sign"></span><i class="cs-line"></i>';
  html += '<span class="cs-sign"></span>' + cells(2);
  formEl.style.gridTemplateColumns = '28px repeat(' + w + ', 42px)';
  formEl.innerHTML = html;
  pad();
}
function pad() {
  if (padEl && !padEl._built) {
    var h = '';
    for (var i = 1; i <= 9; i++) h += '<button data-k="' + i + '">' + i + '</button>';
    h += '<button data-k="0">0</button><button class="wide" data-k="del">⌫ 擦掉</button>';
    padEl.innerHTML = h;
    padEl._built = true;
    for (var k = 0; k < padEl.children.length; k++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          if (btn.disabled) return;
          if (btn.dataset.k === 'del') erase(); else put(+btn.dataset.k);
        });
      })(padEl.children[k]);
    }
  }
  var sel0 = sel >= 0 ? cellAt(pz, sel) : null;
  var zero = padEl ? padEl.querySelector('[data-k="0"]') : null;
  if (zero) zero.disabled = phase !== 'play' || !sel0 || (sel0.nz === true);
}
function hud() {
  if (!elLv) return;
  elLv.textContent = level;
  elGap.textContent = gapLeft();
  elBites.textContent = bites;
  elScore.textContent = score;
  elClue.textContent = clues;
  elSwap.textContent = swaps;
  btnClue.disabled = phase !== 'play' || clues <= 0 || sel < 0;
  btnSwap.disabled = phase !== 'play' || swaps <= 0;
}
function say(html) { if (msgEl) msgEl.innerHTML = html; }
function plain(h) { return String(h).replace(/<[^>]*>/g, ''); }

/* ==================== 输入 ==================== */
function select(idx) {
  var c = idx >= 0 ? cellAt(pz, idx) : null;
  if (!c || !c.real || !c.b) return;
  sel = idx; render(); hud();
}
function move(delta) {
  var list = blanks();
  if (!list.length) return;
  var at = list.indexOf(sel);
  if (at < 0) at = 0;
  else at = ((at + delta) % list.length + list.length) % list.length;
  select(list[at]);
}
function put(d) {
  if (phase !== 'play' || sel < 0) return;
  var c = cellAt(pz, sel);
  if (c.nz && d === 0) { sfx.noise(0.05, 0.05); say('这一位是<b>首位</b>，不能填 0'); return; }
  fill[sel] = d;
  sfx.tone(520 + d * 26, 0.05, 'square', 0.09);
  var next = -1, list = blanks();
  for (var i = 0; i < list.length; i++) {
    if (fill[list[i]] === null) { next = list[i]; break; }
  }
  if (next < 0) { render(); hud(); check(); return; }
  sel = next;
  render(); hud();
}
function erase() {
  if (phase !== 'play' || sel < 0) return;
  if (fill[sel] === null) { var list = blanks(); for (var i = list.length - 1; i >= 0; i--) if (fill[list[i]] !== null) { sel = list[i]; break; } }
  fill[sel] = null;
  render(); hud();
  say('擦掉了一格，重新想');
}
function numberRow(row) {
  var arr = rowArr(pz, row), n = 0;
  for (var i = 0; i < pz.w; i++) {
    var c = arr[i];
    var v = c.real ? (c.b ? fill[row * pz.w + i] : c.g) : 0;
    n = n * 10 + (v === null ? 0 : v);
  }
  return n;
}
function check() {
  var na = numberRow(0), nb = numberRow(1), nr = numberRow(2);
  var want = pz.op === '+' ? na + nb : pz.op === '-' ? na - nb : na * nb;
  if (want === nr) { pass(); return; }
  failWith(na, nb, nr, want);
}

/* ==================== 判定与反馈 ==================== */
function combo() { return Math.min(2, 1 + streak * 0.15); }
function pass() {
  var d = DIFFS[diff];
  var nb = blanks().length;
  var gain = Math.round((28 + nb * 16 + bites * 22 + (pz.w - 2) * 12 + carryOf(pz)) * d.mult * combo());
  lastGain = gain;
  score += gain; streak++; solvedTotal++;
  level++;
  sfx.melody([[660, 0.08], [880, 0.09], [1170, 0.13]], 0.075);
  save();
  phase = 'clear';
  hud();
  show('<div class="cs-ov">算式<b>成立</b>了！这一题 ' + nb + ' 格全填回，虫一口没咬着</div>' +
    '<p class="final-score">+' + gain + '<span> 分</span></p>' +
    '<p class="final-sub">' + lineText(pz) + ' · 连击 ×' + combo().toFixed(2) + ' · 还剩 ' + bites + ' 颗牙</p>' +
    '<div class="ov-actions"><button class="primary" data-act="next">下一题 ▶</button>' +
    '<button class="ghost" data-act="stats">看战绩</button></div>');
}
function carryOf(p) {
  if (p.op === '+') return carryCount(numberRow2(p, 0), numberRow2(p, 1), 0) * 6;
  if (p.op === '-') return borrowCount(numberRow2(p, 0), numberRow2(p, 1)) * 6;
  return 8;
}
function numberRow2(p, row) {
  var arr = rowArr(p, row), n = 0;
  for (var i = 0; i < p.w; i++) n = n * 10 + (arr[i].real ? arr[i].g : 0);
  return n;
}
function lineText(p) {
  return numberRow2(p, 0) + ' ' + p.op + ' ' + numberRow2(p, 1) + ' = ' + numberRow2(p, 2);
}
function failWith(na, nb, nr, want) {
  streak = 0;
  var where;
  if (pz.op === '-' && want < 0) where = '被减数比减数还小，不够减';
  else if (nlen(want) !== nlen(nr) && nr !== 0) where = '结果有 ' + nlen(want) + ' 位，你填的只有 ' + nlen(nr) + ' 位';
  else if (nlen(want) !== nlen(nr)) where = '结果位数不对：应该是 ' + nlen(want) + ' 位数';
  else {
    var a = String(want), b = String(nr), p = 0;
    for (var i = 0; i < a.length; i++) if (a[a.length - 1 - i] !== b[b.length - 1 - i]) { p = i + 1; break; }
    where = '从右数第 ' + p + ' 位对不上';
  }
  sfx.noise(0.14, 0.12);
  var bitten = bite();
  hud();
  if (bites <= 0) { gameOver(); return; }
  say('<span class="wrong">' + where + '</span> —— 虫当场又咬掉' + (bitten >= 0 ? ' <b>1</b> 格' : '不动') +
    '，还能被咬 <b>' + bites + '</b> 次');
  render();
}
// 随机吃一格原本看得见的数字
function bite() {
  var pool = [], w = pz.w;
  for (var row = 0; row < 3; row++) {
    var arr = rowArr(pz, row);
    for (var i = 0; i < w; i++) if (arr[i].real && !arr[i].b) pool.push(row * w + i);
  }
  bites--;
  if (!pool.length) return -1;
  var idx = pickOne(pool), c = cellAt(pz, idx);
  c.b = true; c.eaten = true;
  if (sel < 0) sel = idx;
  return idx;
}

/* ==================== 道具 ==================== */
function clue() {
  if (phase !== 'play' || clues <= 0) return;
  if (sel < 0) { say('先点一个空格再问放大镜'); return; }
  var c = cellAt(pz, sel), t = c.g, kind = (sel + level) % 3, txt;
  clues--;
  sfx.tone(980, 0.09, 'triangle', 0.11);
  if (kind === 0) txt = '这一位是<b>' + (t % 2 ? '奇数' : '偶数') + '</b>';
  else if (kind === 1) txt = '这一位<b>' + (t >= 5 ? '不小于 5' : '小于 5') + '</b>';
  else {
    var fake = (t + 3) % 10, pair = [t, fake].sort(function () { return Math.random() - 0.5; });
    txt = '放大镜只给两个可能：<b>' + pair[0] + '</b> 或 <b>' + pair[1] + '</b>';
  }
  say('🔍 ' + txt + '（还剩 ' + clues + ' 次）');
  hud();
}
function swap() {
  if (phase !== 'play' || swaps <= 0) return;
  swaps--;
  sfx.tone(420, 0.07, 'triangle', 0.1);
  say('换了一题，规模一样，数字全换了');
  nextPz();
  hud();
}

/* ==================== 遮罩 ==================== */
function show(html) {
  if (!ovContent) return;
  ovContent.innerHTML = html;
  overlayEl.classList.add('show');
  hud();
}
function hide() { if (overlayEl) overlayEl.classList.remove('show'); }
function intro() {
  phase = 'intro';
  show('<div class="ov-emoji">🐛</div><h2>虫食算</h2>' +
    '<p class="hint">一道竖式被虫蛀掉了几个数字。按位往回推 —— <b>进位借位也算账</b>。<br>' +
    '填错不判死，但它会<b>当场再吃掉一个你看得见的数</b>：' +
    '<b>' + DIFFS[diff].bites + '</b> 颗牙咬完，这道算式就报废。<br>' +
    '<span class="cs-carry">每题都是现场用求解器验过的「恰好一解」，不存在填哪个都对的水题</span></p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开吃</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function gameOver() {
  phase = 'over';
  save();
  sfx.melody([[320, 0.12], [240, 0.16], [170, 0.24]], 0.12);
  show('<div class="ov-emoji">🦠</div><h2>算式被吃光了</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">咬回 <b>' + solvedTotal + '</b> 道 · 撑到第 ' + level + ' 题 · 本机最高 ' + best() + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
  hud();
}
function stats() {
  show('<h2>本机战绩</h2><div class="cs-list">' +
    '<p>最高分 <b>' + Math.max(best(), score) + '</b> 分 · 当前难度 <b>' + DIFFS[diff].label + '</b></p>' +
    '<p>这一局：咬回 ' + solvedTotal + ' 道 · 第 ' + level + ' 题 · ' + score + ' 分</p>' +
    '<p>历代累计咬回 <b>' + num('cs.solved') + '</b> 道竖式</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="' + (phase === 'over' ? 'again' : phase === 'clear' ? 'next' : 'resume') + '">' +
    (phase === 'play' ? '继续算' : phase === 'clear' ? '下一题 ▶' : '再来一局') + '</button></div>');
}

/* ==================== 存档 ==================== */
function save() {
  if (score > best()) store.set('cs.best', String(score));
  if (level - 1 > num('cs.lv')) store.set('cs.lv', String(level - 1));
  var add = solvedTotal - savedAt;
  if (add > 0) { store.set('cs.solved', String(num('cs.solved') + add)); savedAt = solvedTotal; }
  store.set('cs.diff', diff);
}

/* ==================== 交互 ==================== */
function act(name) {
  if (name === 'start') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'again') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'next') { hide(); nextPz(); return; }
  if (name === 'resume') { hide(); hud(); return; }
  if (name === 'stats') { stats(); return; }
}
if (formEl) {
  formEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-i]') : null;
    if (!t) return;
    sfx.resume();
    select(+t.dataset.i);
  });
}
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
        store.set('cs.diff', diff);
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
byId('btnClue').addEventListener('click', clue);
byId('btnSwap').addEventListener('click', swap);
byId('btnStats').addEventListener('click', stats);
byId('btnNew').addEventListener('click', function () { newRound(); intro(); });
if (soundBtn) soundBtn.addEventListener('click', function () { sfx.toggle(); syncSound(); });

window.addEventListener('keydown', function (ev) {
  var k = ev.key;
  if (k === 'Escape') { if (phase === 'play') hide(); else if (phase === 'intro') act('start'); return; }
  if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); return; }
  if (k === 't' || k === 'T') { stats(); return; }
  if (k === 'n' || k === 'N') { newRound(); intro(); return; }
  if (phase !== 'play') {
    if (k === 'Enter' || k === ' ') { act(phase === 'clear' ? 'next' : 'start'); }
    return;
  }
  if (k >= '0' && k <= '9') { put(+k); return; }
  if (k === 'Backspace' || k === 'Delete') { erase(); return; }
  if (k === 'ArrowLeft') { move(-1); return; }
  if (k === 'ArrowRight') { move(1); return; }
  if (k === 'ArrowUp') { move(-pz.w); return; }
  if (k === 'ArrowDown') { move(pz.w); return; }
  if (k === 'b' || k === 'B') { clue(); return; }
  if (k === 'r' || k === 'R') { swap(); return; }
});

/* ==================== 开局 ==================== */
syncSound();
syncDiff();
newRound();
intro();
})();
