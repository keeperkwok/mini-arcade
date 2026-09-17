/* 鼓机十六步 —— 先当作曲家，再当鼓手：
   ① 编曲台上是 4 条声部（🥁 底鼓 / 🪘 军鼓 / 🪲 踩镲 / 🔔 铃鼓）× 16 步的网格，点格子写鼓点，机器替你循环播放；
   ② 按下演奏之后鼓声就归你了 —— 节拍器只留四 clicks，你必须在判定窗内敲对那一条道，PERFECT / GOOD / MISS，
      漏掉的那一拍只会响一声闷响；③ 音符写越密风险倍率越高，段与段之间还会提速，鼓手幽灵会往你的拍子里塞花（⚡）。
   时间轴全部用整数毫秒（performance.now 减掉暂停时长），每个音符的到期时刻 = 段起点 + 步号 × 步长，
   所以「什么时候该敲哪一下」完全可以推算，测试也能一秒不差地复现。纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 常量 ==================== */
var STEPS = 16, MAX_BARS = 12, BARS_PER_LV = 3, COUNT_IN = 4;
var PERFECT_BASE = 100, GOOD_BASE = 45;
var BEATS = [0, 4, 8, 12];
var TRACKS = [
  { name: '底鼓', emoji: '🥁', key: 'D', k: 'd', c: ['#f87171', '#b91c1c'] },
  { name: '军鼓', emoji: '🪘', key: 'F', k: 'f', c: ['#fbbf24', '#b45309'] },
  { name: '踩镲', emoji: '🪲', key: 'J', k: 'j', c: ['#38bdf8', '#0369a1'] },
  { name: '铃鼓', emoji: '🔔', key: 'K', k: 'k', c: ['#a78bfa', '#6d28d9'] },
];
var DIFFS = {
  loose: { label: '热身', bpm: 76, step: 5, perfect: 70, good: 150, ghost: 0.15, mult: 0.8, lives: 5 },
  funk: { label: '放克', bpm: 96, step: 6, perfect: 52, good: 115, ghost: 0.42, mult: 1, lives: 3 },
  blast: { label: '炸场', bpm: 124, step: 7, perfect: 40, good: 90, ghost: 0.7, mult: 1.8, lives: 2 },
};
var PRESETS = [
  { name: '动次打次', rows: ['x...x...x...x...', '....x.......x...', '..x...x...x...x.', '............x...'] },
  { name: '放克十六分', rows: ['x......x..x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.', '.....x..........'] },
  { name: '摇滚基本', rows: ['x.......x..x....', '....x.......x...', '..x..x..x..x..x.', '................'] },
  { name: 'BOSSA', rows: ['x.....x...x.....', '......x.....x..x', 'x.x.x.x.x.x.x.x.', '..x.......x.....'] },
  { name: 'Trap', rows: ['x.....x.x.......', '........x.......', 'x.xxx.xxx.xxx.xx', '...........x....'] },
];

function rngOf(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// FIXED_SEED：地址栏写 #seed=数字 就能钉住幽灵鼓手的加花
var FIXED_SEED = (function () {
  var m = /seed=(\d+)/.exec((typeof location !== 'undefined' && location.hash) || '');
  return m ? (parseInt(m[1], 10) >>> 0) : 0;
})();

/* ==================== 纯规则 ==================== */
function D() { return DIFFS[diff]; }
function bpmAt(atLv) { return D().bpm + atLv * D().step; }
function stepMsAt(bpm) { return Math.round(60000 / bpm / 4); }   // 十六分音符，整数毫秒
function notes() { var n = 0; for (var t = 0; t < 4; t++) for (var s = 0; s < STEPS; s++) if (pat[t][s]) n++; return n; }
function riskMult() { return 1 + Math.min(notes(), 32) / 32; }
function comboMult() { return 1 + Math.min(combo, 20) * 0.1; }
function gainOf(base) { return Math.max(1, Math.round(base * comboMult() * riskMult() * D().mult)); }
function ghostChance() { return Math.min(0.95, D().ghost + lv * 0.02); }
function isBeat(s) { return BEATS.indexOf(s) >= 0; }
function emptyPat() {
  var out = [];
  for (var t = 0; t < 4; t++) { out.push([]); for (var s = 0; s < STEPS; s++) out[t].push(false); }
  return out;
}
function clonePat(p) { return p.map(function (row) { return row.slice(); }); }

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
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'gj.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var gridEl = byId('grid'), rulerEl = byId('ruler'), lanesEl = byId('lanes'), presetEl = byId('presets');
var msgEl = byId('msg'), overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elMode = byId('mode'), elBpm = byId('bpm'), elBars = byId('bars'), elCombo = byId('combo');
var elAcc = byId('acc'), elScore = byId('score'), elNotes = byId('noteN');
var btnPlay = byId('btnPlay'), btnPause = byId('btnPause'), btnClear = byId('btnClear'), btnRand = byId('btnRand');

function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0; }

/* ==================== 局面 ==================== */
var diff = 'funk';
if (DIFFS[store.get('gj.diff', '')]) diff = store.get('gj.diff', 'funk');
var pat = emptyPat(), ghost = emptyPat(), presetIdx = -1;
var phase = 'intro', paused = false;
var t0 = 0, stepMs = 156, lastStep = -1, headStep = -1, counting = false;
var bars, lv, score, combo, bestCombo, perfect, good, miss, strays, lives, pending, seedBase, rnd, lastJudge, lastGain;
var flashes = [], rafId = 0, frozenSince = -1, cellCache = null;

function cells() {
  if (!gridEl) return [];
  if (!cellCache) cellCache = gridEl.querySelectorAll('.gj-cell');
  return cellCache;
}
function cellNode(tr, s) { var list = cells(); var i = tr * STEPS + s; return i < list.length ? list[i] : null; }

function buildGrid() {
  if (!gridEl) return;
  var html = '';
  for (var t = 0; t < 4; t++) {
    html += '<div class="gj-row" data-t="' + t + '"><span class="gj-lab"><b>' + TRACKS[t].emoji + '</b>' +
      TRACKS[t].name + ' <i>' + TRACKS[t].key + '</i></span><div class="gj-cells">';
    for (var s = 0; s < STEPS; s++) {
      html += '<button class="gj-cell' + (isBeat(s) ? ' beat' : '') + (pat[t][s] ? ' on' : '') + (ghost[t][s] ? ' ghost' : '') +
        '" data-t="' + t + '" data-s="' + s + '" style="--t1:' + TRACKS[t].c[0] + ';--t2:' + TRACKS[t].c[1] + '"></button>';
    }
    html += '</div></div>';
  }
  gridEl.innerHTML = html;
  var marks = '<span class="gj-lab"></span><div class="gj-marks">';
  for (var b = 0; b < STEPS; b++) marks += '<span class="gj-mark' + (isBeat(b) ? ' beat' : '') + '" data-m="' + b + '">' + (b + 1) + '</span>';
  rulerEl.innerHTML = marks + '</div>';
  var pads = '';
  for (var k = 0; k < 4; k++) {
    pads += '<button class="gj-pad" data-lane="' + k + '" style="--t1:' + TRACKS[k].c[0] + ';--t2:' + TRACKS[k].c[1] + '">' +
      '<b>' + TRACKS[k].emoji + '</b><span>' + TRACKS[k].name + '</span><i>' + TRACKS[k].key + '</i></button>';
  }
  lanesEl.innerHTML = pads;
  headStep = -1;
  cellCache = null;
}
function buildPresets() {
  if (!presetEl) return;
  var html = '';
  for (var i = 0; i < PRESETS.length; i++) {
    html += '<button class="gj-preset' + (i === presetIdx ? ' active' : '') + '" data-p="' + i + '">' + PRESETS[i].name + '</button>';
  }
  presetEl.innerHTML = html;
}
function applyPreset(i) {
  if (i < 0 || i >= PRESETS.length) return false;
  pat = emptyPat(); ghost = emptyPat();
  for (var t = 0; t < 4; t++) {
    var row = PRESETS[i].rows[t];
    for (var s = 0; s < STEPS; s++) pat[t][s] = row.charAt(s) === 'x';
  }
  presetIdx = i;
  buildGrid(); buildPresets(); hud();
  if (phase === 'play') { buildBar(); }
  msg('换上 <b>' + PRESETS[i].name + '</b>：' + notes() + ' 个音符，风险倍率 ×' + riskMult().toFixed(2));
  return true;
}
function clearPat() {
  pat = emptyPat(); ghost = emptyPat(); presetIdx = -1;
  buildGrid(); buildPresets(); hud();
  if (phase === 'play') buildBar();
  msg('清空了 —— 十六步全是空拍，先写点什么吧');
}
function rollDice() {
  pat = emptyPat(); ghost = emptyPat(); presetIdx = -1;
  var r = rngOf((nowMs() * 977) >>> 0);
  for (var s = 0; s < STEPS; s++) {
    if (isBeat(s) || r() < 0.22) pat[0][s] = true;
    if (s % 4 === 2 || r() < 0.1) pat[1][s] = true;
    if (r() < 0.55) pat[2][s] = true;
    if (r() < 0.12) pat[3][s] = true;
  }
  buildGrid(); buildPresets(); hud();
  if (phase === 'play') buildBar();
  msg('骰子掷出 ' + notes() + ' 个音符，风险倍率 ×' + riskMult().toFixed(2) + ' —— denser 更难也更值钱');
}
function toggleCell(tr, s) {
  if (phase === 'play') { refuse('演奏中改不了鼓点 —— 先暂停，或者等这一段打完'); return false; }
  pat[tr][s] = !pat[tr][s];
  ghost[tr][s] = false;
  presetIdx = -1;
  var node = cellNode(tr, s);
  if (node) node.className = 'gj-cell' + (isBeat(s) ? ' beat' : '') + (pat[tr][s] ? ' on' : '') + (headStep === s ? ' head' : '');
  buildPresets(); hud();
  return true;
}

/* ==================== 时间轴 ==================== */
function buildBar() {
  pending = [];
  for (var t = 0; t < 4; t++) {
    for (var s = 0; s < STEPS; s++) {
      if (!pat[t][s]) continue;
      var at = t0 + s * stepMs;
      if (phase === 'play' && counting) continue;   // 计数小节只留 clicks，不判音符
      pending.push({ t: t, s: s, at: at, judged: false });
    }
  }
  pending.sort(function (a, b) { return a.at - b.at; });
  lastStep = Math.floor((nowMs() - t0) / stepMs);
  if (lastStep < 0) lastStep = 0;
}
function startBarClock(at) {
  stepMs = stepMsAt(bpmAt(phase === 'play' ? lv : 0));
  t0 = at;
  headStep = -1;
  frozenSince = -1;
  buildBar();
}
function barEnd() { return t0 + STEPS * stepMs; }

function soundOf(tr, vol) {
  if (tr === 0) { sfx.tone(58, 0.16, 'sine', 0.2 * vol); sfx.tone(120, 0.04, 'triangle', 0.08 * vol); }
  else if (tr === 1) { sfx.noise(0.09, 0.15 * vol); sfx.tone(190, 0.05, 'triangle', 0.07 * vol); }
  else if (tr === 2) { sfx.noise(0.035, 0.09 * vol); }
  else { sfx.tone(1180, 0.11, 'triangle', 0.09 * vol); }
}
function fireStep(s) {
  if (isBeat(s) || (phase === 'play' && counting)) sfx.tone(1500, 0.022, 'square', phase === 'play' ? 0.05 : 0.03);
  if (phase !== 'edit') return;
  for (var t = 0; t < 4; t++) if (pat[t][s]) soundOf(t, 1);
}
function ghostFill() {
  if (rnd() >= ghostChance()) return 0;
  var added = 0;
  var n = 1 + Math.floor(rnd() * 3);
  for (var i = 0; i < n; i++) {
    var tr = Math.floor(rnd() * 4);
    var s = STEPS - 6 + Math.floor(rnd() * 6);
    if (pat[tr][s]) continue;
    pat[tr][s] = true;
    ghost[tr][s] = true;
    added++;
  }
  if (added) {
    buildGrid();
    sfx.tone(240, 0.06, 'sawtooth', 0.05);
    msg('幽灵鼓手塞了 <b>' + added + '</b> 个花（⚡）—— 留着还是删掉，你说了算');
  }
  return added;
}
function endBar() {
  t0 += STEPS * stepMs;
  if (phase === 'edit') { buildBar(); return; }
  if (counting) { counting = false; buildBar(); return; }
  flushMisses(t0);
  bars++;
  store.set('gj.bars', num('gj.bars') + 1);
  if (bars % BARS_PER_LV === 0 && bars < MAX_BARS) {
    lv++;
    msg('提速到 <b>' + bpmAt(lv) + ' BPM</b>（步长 ' + stepMsAt(bpmAt(lv)) + ' 毫秒）');
    sfx.melody([520, 660], 0.05);
  }
  ghostFill();
  stepMs = stepMsAt(bpmAt(lv));
  bank();
  buildBar();
  hud();
  if (bars >= MAX_BARS) win();
}
function bank() {
  if (score > num('gj.best')) store.set('gj.best', score);
  if (lv > num('gj.lv')) store.set('gj.lv', lv);
}
function accuracy() {
  var hit = perfect + good;
  var total = perfect + good + miss;
  if (!total) return -1;
  return Math.round((hit / total) * 10000) / 100;                  // 命中率：PERFECT 和 GOOD 都算命中
}
function perfectRate() {
  var total = perfect + good + miss;
  return total ? Math.round(perfect * 100 / total) : 0;
}

/* ==================== 判定 ==================== */
function hit(tr, at) {
  if (phase !== 'play' || paused) return null;
  var now = at === undefined ? nowMs() : at;
  flashPad(tr);
  var best = null;
  for (var i = 0; i < pending.length; i++) {
    var p = pending[i];
    if (p.judged || p.t !== tr) continue;
    var dev = Math.abs(now - p.at);
    if (dev > D().good) { if (p.at - now > D().good) break; continue; }
    if (!best || p.at < best.at) best = p;
  }
  if (!best) {
    strays++;
    combo = 0;
    sfx.noise(0.02, 0.03);
    lastJudge = '空打';
    msg('这条道上没拍子 —— <b>空打断连击</b>，别乱敲');
    hud();
    return null;
  }
  best.judged = true;
  var dev2 = Math.abs(now - best.at);
  var kind = dev2 <= D().perfect ? 'perfect' : 'good';
  combo++;                                  // 这一击本身就计入连击倍率
  if (combo > bestCombo) bestCombo = combo;
  if (kind === 'perfect') { perfect++; addScore(PERFECT_BASE); } else { good++; addScore(GOOD_BASE); }
  soundOf(tr, kind === 'perfect' ? 1 : 0.8);
  lastJudge = kind === 'perfect' ? 'PERFECT' : 'GOOD';
  flash(best, kind === 'perfect' ? 'hit' : 'taped');
  hud();
  return kind;
}
function addScore(base) {
  var g = gainOf(base);
  score += g;
  lastGain = g;
}
function missNote(p) {
  p.judged = true;
  miss++;
  combo = 0;
  lives--;
  soundOf(p.t, 0.25);
  lastJudge = 'MISS';
  flash(p, 'miss');
  msg('<b>' + TRACKS[p.t].name + '</b> 那一拍漏了，只剩闷响 —— 剩余 <b>' + Math.max(0, lives) + '</b> 次机会');
  hud();
  if (lives <= 0) gameOver();
}
function flushMisses(cutAt) {
  for (var i = 0; i < pending.length; i++) {
    var p = pending[i];
    if (p.judged) continue;
    if (p.at + D().good < cutAt) missNote(p);
  }
}
function flash(p, cls) {
  var node = cellNode(p.t, p.s);
  if (node) node.classList.add(cls);
  flashes.push({ i: p.t * STEPS + p.s, cls: cls });
  if (flashes.length > 24) flashes.shift();
}
function flashPad(tr) {
  var pads = lanesEl ? lanesEl.querySelectorAll('.gj-pad') : [];
  var n = pads[tr];
  if (n) { n.classList.add('lit'); flashes.push({ pad: tr, cls: 'lit' }); }
}
function clearFlashes() {
  var list = cells();
  for (var i = 0; i < flashes.length; i++) {
    var f = flashes[i];
    if (f.pad !== undefined) {
      var pads = lanesEl.querySelectorAll('.gj-pad');
      if (pads[f.pad]) pads[f.pad].classList.remove('lit');
      continue;
    }
    if (list[f.i]) list[f.i].classList.remove(f.cls);
  }
  flashes = [];
}

/* ==================== 每帧 ==================== */
var prev = nowMs(), prevHudStep = -1;
function running() { return (phase === 'edit' || phase === 'play') && !paused && !ovShown(); }
function frame(now) {
  rafId = window.requestAnimationFrame(frame);
  if (!running()) { if (frozenSince < 0) frozenSince = now; prev = now; return; }
  if (frozenSince >= 0) { shiftClock(now - frozenSince); frozenSince = -1; }
  var guard = 0;
  while (now >= barEnd() && guard++ < 12) endBar();
  var s = Math.floor((now - t0) / stepMs);
  if (s < 0) s = 0;
  while (lastStep < s && guard++ < 80) { lastStep++; if (lastStep < STEPS) fireStep(lastStep); }
  if (phase === 'play') flushMisses(now);
  paintHead(s);
  if (s !== prevHudStep) { prevHudStep = s; hud(); }
  prev = now;
}
function paintHead(s) {
  if (s === headStep) return;
  clearFlashes();
  var old = headStep;
  headStep = s;
  if (old >= 0 && old < STEPS) {
    for (var t = 0; t < 4; t++) { var a = cellNode(t, old); if (a) a.classList.remove('head'); }
    var om = rulerEl.querySelectorAll('[data-m]')[old];
    if (om) om.classList.remove('now');
  }
  if (s >= 0 && s < STEPS) {
    for (var k = 0; k < 4; k++) { var c = cellNode(k, s); if (c) c.classList.add('head'); }
    var m = rulerEl.querySelectorAll('[data-m]')[s];
    if (m) m.classList.add('now');
  }
}

/* ==================== HUD / 提示 ==================== */
var hudMemo = {};
function setTxt(el, key, v) {
  if (!el) return;
  if (hudMemo[key] === v) return;
  hudMemo[key] = v;
  el.innerHTML = v;
}
function hud() {
  if (!elMode) return;
  setTxt(elMode, 'mode', phase === 'play' ? (paused ? '暂停' : '演奏') : (phase === 'edit' ? '编曲' : '待命'));
  setTxt(elBpm, 'bpm', String(bpmAt(phase === 'play' ? lv : 0)));
  setTxt(elBars, 'bars', (phase === 'play' || phase === 'over' || phase === 'clear' ? bars : 0) + '/' + MAX_BARS);
  setTxt(elCombo, 'combo', String(combo));
  var ac = accuracy();
  setTxt(elAcc, 'acc', ac < 0 ? '—' : ac + '%');
  setTxt(elScore, 'score', String(score));
  setTxt(elNotes, 'notes', String(notes()));
  setTxt(btnPlay, 'play', phase === 'play' ? '✖<span>停止</span>' : '▶<span>演奏</span>');
  setTxt(btnPause, 'pause', paused ? '▶<span>继续</span>' : '⏸<span>暂停</span>');
  if (btnClear) btnClear.disabled = phase === 'play' || notes() === 0;
  if (btnRand) btnRand.disabled = phase === 'play';
}
function msg(html) { if (msgEl) msgEl.innerHTML = html; }
function refuse(html) { sfx.noise(0.05, 0.05); msg(html); }

/* ==================== 遮罩 ==================== */
function show(html) { if (!ovContent) return; ovContent.innerHTML = html; overlayEl.classList.add('show'); }
function hide() { if (overlayEl) overlayEl.classList.remove('show'); }
function ovShown() { return overlayEl && overlayEl._cls ? overlayEl._cls.indexOf('show') >= 0 : false; }
function sheet() {
  return '<div class="ov-key">' + TRACKS.map(function (t) { return '<span>' + t.emoji + ' <b>' + t.key + '</b></span>'; }).join('') + '</div>';
}
function intro() {
  phase = 'intro';
  paused = false;
  show('<h2>🥁 鼓机十六步</h2><p>上面是 <b>4 条声部 × 16 步</b> 的鼓机。先在编曲台上点格子写一段律动，' +
    '机器会替你循环播放；写满意了按 <b>▶ 演奏</b>，鼓声就交给你自己 —— 节拍器只会留四下 clicks，' +
    '该敲的那一拍必须在 <b>±' + D().good + ' 毫秒</b>里按对道（<b>±' + D().perfect + ' 毫秒</b>算 PERFECT）。</p>' +
    '<p>音符写越密风险倍率越高（现在 <b>×' + riskMult().toFixed(2) + '</b>），每打完 <b>' + BARS_PER_LV +
    '</b> 段提速一档，打完 <b>' + MAX_BARS + '</b> 段收工；漏一拍扣一次机会，' + D().label + '档只有 <b>' + D().lives + '</b> 次。</p>' +
    sheet() +
    '<div class="ov-actions"><button class="primary" data-act="start">进编曲台</button>' +
    '<button data-act="play">直接开打</button></div>');
  hud();
}
function stats() {
  var rows = phase === 'play' || phase === 'over' || phase === 'clear'
    ? '<p>这一把：段 <b>' + bars + '</b> · PERFECT <b>' + perfect + '</b> · GOOD <b>' + good + '</b> · MISS <b>' + miss +
      '</b> · 空打 <b>' + strays + '</b> · 最高连击 <b>' + bestCombo + '</b></p>'
    : '';
  show('<h2>📊 本机战绩</h2><p>最高分 <b>' + num('gj.best') + '</b> · 累计打完 <b>' + num('gj.bars') +
    '</b> 段 · 最快敲到 <b>' + bpmAt(num('gj.lv')) + ' BPM</b></p>' + rows +
    '<div class="ov-actions"><button class="primary" data-act="' + (phase === 'intro' ? 'start' : 'resume') + '">' +
    (phase === 'intro' ? '进编曲台' : '继续') + '</button></div>');
}
function report(title, line) {
  show('<h2>' + title + '</h2><p>' + line + '</p>' +
    '<div class="ov-score"><span>得分</span><b>' + score + '</b><span>PERFECT</span><b>' + perfect + '</b>' +
    '<span>GOOD</span><b>' + good + '</b><span>MISS</span><b>' + miss + '</b>' +
    '<span>空打</span><b>' + strays + '</b><span>最高连击</span><b>' + bestCombo + '</b>' +
    '<span>段数</span><b>' + bars + '/' + MAX_BARS + '</b><span>本机最高</span><b>' + num('gj.best') + '</b></div>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一遍</button>' +
    '<button data-act="edit">回编曲台</button></div>');
}
function gameOver() {
  phase = 'over';
  bank();
  sfx.melody([300, 240, 180], 0.12);
  report('💥 打崩了', '漏了 ' + miss + ' 拍，机会用完 —— 第 ' + (bars + 1) + ' 段停在 ' + bpmAt(lv) + ' BPM');
  hud();
}
function win() {
  phase = 'clear';
  bank();
  sfx.melody([660, 880, 1040], 0.09);
  report('🏆 收工', MAX_BARS + ' 段全打完了，最后一段是 ' + bpmAt(lv) + ' BPM，PERFECT 率 ' + perfectRate() + '%');
  hud();
}
function act(name) {
  if (name === 'start') { sfx.resume(); hide(); intoEdit(); return; }
  if (name === 'edit') { sfx.resume(); hide(); intoEdit(); return; }
  if (name === 'play') { sfx.resume(); hide(); startPlay(); return; }
  if (name === 'again') { sfx.resume(); hide(); startPlay(); return; }
  if (name === 'resume') { hide(); if (phase === 'intro') intoEdit(); else hud(); return; }
  if (name === 'stats') { stats(); return; }
}
function intoEdit() {
  clearFlashes();
  phase = 'edit';
  paused = false;
  combo = 0;
  startBarClock(nowMs());
  hud();
  msg('编曲台：<b>点格子</b>开关音符，四条道都能写。想省事就按下面的预设');
}
function startPlay() {
  clearFlashes();
  phase = 'play';
  paused = false;
  bars = 0; lv = 0; score = 0; combo = 0; bestCombo = 0;
  perfect = 0; good = 0; miss = 0; strays = 0; lives = D().lives;
  lastJudge = ''; lastGain = 0;
  seedBase = (FIXED_SEED || Math.floor(Math.random() * 2147483647)) >>> 0;
  rnd = rngOf(seedBase);
  counting = true;
  stepMs = stepMsAt(bpmAt(0));
  startBarClock(nowMs() - (STEPS - COUNT_IN) * stepMs);
  hud();
  msg('预备 —— 四下 clicks 之后，' + notes() + ' 个音符就要靠你的 <b>D F J K</b> 了');
}
// 暂停或翻开遮罩期间时间轴整体平移：鼓点不会偷偷溜走
function shiftClock(gap) {
  if (gap <= 0) return;
  t0 += gap;
  for (var i = 0; i < pending.length; i++) pending[i].at += gap;
  lastStep = -1;
  headStep = -1;
}
function togglePause() {
  if (phase !== 'edit' && phase !== 'play') return;
  paused = !paused;
  msg(paused ? '<b>⏸ 暂停</b> —— 时间轴冻住，鼓点不会偷偷溜走' : '继续');
  sfx.tone(paused ? 420 : 700, 0.04, 'sine', 0.04);
  hud();
}

/* ==================== 输入 ==================== */
if (gridEl) {
  gridEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-s]') : null;
    sfx.resume();
    if (!t) return;
    toggleCell(+t.dataset.t, +t.dataset.s);
  });
}
if (lanesEl) {
  lanesEl.addEventListener('pointerdown', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-lane]') : null;
    if (!t) return;
    sfx.resume();
    if (phase !== 'play') { sfx.noise(0.03, 0.04); msg('先在编曲台上按 <b>▶ 演奏</b>，再敲打击板'); return; }
    hit(+t.dataset.lane);
  });
}
if (presetEl) {
  presetEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-p]') : null;
    if (!t) return;
    sfx.resume();
    applyPreset(+t.dataset.p);
  });
}
if (btnPlay) btnPlay.addEventListener('click', function () { sfx.resume(); if (phase === 'play') intoEdit(); else if (phase === 'edit') startPlay(); else intoEdit(); });
if (btnPause) btnPause.addEventListener('click', togglePause);
if (btnClear) btnClear.addEventListener('click', function () { clearPat(); });
if (btnRand) btnRand.addEventListener('click', rollDice);
if (byId('btnStats')) byId('btnStats').addEventListener('click', stats);
if (byId('btnNew')) byId('btnNew').addEventListener('click', function () { clearPat(); intro(); });
if (soundBtn) soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });
if (overlayEl) {
  overlayEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (t) act(t.dataset.act);
  });
}
if (window.addEventListener) {
  window.addEventListener('keydown', function (ev) {
    var k = String(ev.key || '').toLowerCase();
    if (ev.key === 'Escape') { if (ovShown()) act('resume'); else togglePause(); return; }
    if (ev.key === ' ') {
      if (phase === 'intro') { act('start'); return; }
      if (phase === 'over' || phase === 'clear') { act('again'); return; }
      togglePause();
      ev.preventDefault();
      return;
    }
    if (k === 'm') { sfx.toggle(); syncSound(); return; }
    if (k === 't') { stats(); return; }
    if (ev.key === 'Enter') {
      if (phase === 'intro') { act('start'); return; }
      if (phase === 'over' || phase === 'clear') { act('again'); return; }
      if (phase === 'edit') startPlay();
      return;
    }
    if (k === 'c') { if (phase !== 'play') clearPat(); return; }
    if (k === 'r') { if (phase !== 'play') rollDice(); return; }
    if (phase !== 'play' || paused) return;
    for (var i = 0; i < 4; i++) {
      if (k === TRACKS[i].k) { hit(i); return; }
    }
  });
}
(function () {
  var btns = byId('diff') ? byId('diff').querySelectorAll('[data-diff]') : [];
  for (var i = 0; i < btns.length; i++) {
    (function (b) {
      b.addEventListener('click', function () {
        diff = b.dataset.diff;
        store.set('gj.diff', diff);
        syncDiff();
        if (phase === 'play') intoEdit();
        hud();
        msg('换到 <b>' + D().label + '</b> 档：' + D().bpm + ' BPM 起跳，判定 ±' + D().perfect + ' / ±' + D().good + ' 毫秒');
      });
    })(btns[i]);
  }
})();
function syncDiff() {
  var btns = byId('diff').querySelectorAll('[data-diff]');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
}

/* ==================== 开局 ==================== */
bars = 0; lv = 0; score = 0; combo = 0; bestCombo = 0;
perfect = 0; good = 0; miss = 0; strays = 0; lives = 0; pending = [];
rnd = rngOf(1); lastJudge = ''; lastGain = 0;
applyPreset(1);
buildGrid();
buildPresets();
syncSound();
syncDiff();
intro();
if (window.requestAnimationFrame) rafId = window.requestAnimationFrame(frame);
})();
