/* 绝对音感 —— 三种听力轮次轮换：辨音程 / 跟弹旋律 / 听和弦性质
   机制：耳朵(耳力)是唯一资源，答错罚一口耳力但**退还一次回放**；每关只许回放 N 次，
   演奏厅档 N=1 —— 一遍定生死。音高全部用 WebAudio 现场合成（MIDI 编号 → 440·2^(n-69)/12），
   题目、选项、正解都是纯数据，所以「听」不到的自动化测试也能逐题核对判定与音乐理论一致。
   纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 音乐数据 ==================== */
var INTERVALS = { 0: '纯一度', 1: '小二度', 2: '大二度', 3: '小三度', 4: '大三度', 5: '纯四度',
  6: '增四度', 7: '纯五度', 8: '小六度', 9: '大六度', 10: '小七度', 11: '大七度', 12: '纯八度' };
var RATIOS = { 0: '1:1', 3: '6:5', 4: '5:4', 5: '4:3', 7: '3:2', 9: '5:3', 12: '2:1' };
var CHORDS = {
  maj: { name: '大三和弦', steps: [0, 4, 7], tip: '亮而稳，大调的主干' },
  min: { name: '小三和弦', steps: [0, 3, 7], tip: '暗而柔，小调的底色' },
  dim: { name: '减三和弦', steps: [0, 3, 6], tip: '两个小三度叠起来，发紧' },
  aug: { name: '增三和弦', steps: [0, 4, 8], tip: '两个大三度叠起来，发飘' },
  sus4: { name: '挂四和弦', steps: [0, 5, 7], tip: '三度让位给四度，悬在那儿' },
  dom7: { name: '属七和弦', steps: [0, 4, 7, 10], tip: '大三和弦 + 小七度，急着解决' },
  maj7: { name: '大七和弦', steps: [0, 4, 7, 11], tip: '亮上加亮，都市夜味' },
  min7: { name: '小七和弦', steps: [0, 3, 7, 10], tip: '暗而不堵，爵士第一课' },
};
var CH_TRIAD = ['maj', 'min', 'dim', 'aug', 'sus4'];
var CH_FULL = ['maj', 'min', 'dim', 'aug', 'sus4', 'dom7', 'maj7', 'min7'];
var INT_POOL = [[0, 3, 4, 7], [2, 3, 4, 5, 7, 9], [1, 2, 3, 4, 6, 7, 8, 10, 11, 12]];
var SCALE = [60, 62, 64, 65, 67, 69, 71, 72];
var SOLFEGE = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si', '高do'];
var LETTERS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'];
var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
var MODES = ['int', 'melody', 'chord'];
var OPTN = [4, 5, 6];   // 每关几个选项，随难度档增长
var MODE_CN = { int: '辨音程', melody: '跟弹旋律', chord: '听和弦' };

/* ==================== 难度 ==================== */
var DIFFS = {
  warm: { label: '热身房', ears: 8, hints: 5, replays: 5, mult: 0.8, down: false },
  pro: { label: '琴房', ears: 4, hints: 3, replays: 3, mult: 1, down: false },
  hall: { label: '演奏厅', ears: 1, hints: 1, replays: 1, mult: 1.6, down: true },
};
function tierFor(level) { return level <= 4 ? 0 : level <= 9 ? 1 : 2; }
function modeFor(level) { return MODES[(level - 1) % 3]; }
function melodyLen(level) { return 2 + Math.min(4, Math.floor((level - 1) / 5)); }

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
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'yin.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var notesEl = byId('notes'), keysEl = byId('keys'), ansEl = byId('answers'), msgEl = byId('msg');
var elLv = byId('lv'), elMode = byId('mode'), elEars = byId('ears'), elScore = byId('score');
var elReN = byId('reN'), elHintN = byId('hintN');

function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
function noteName(midi) { return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1); }
function degOf(midi) { return SCALE.indexOf(midi); }
function pick(a) { return a[(Math.random() * a.length) | 0]; }

/* ==================== 局面 ==================== */
var phase = 'intro';
var diff = 'pro';
var level = 1;
var score = 0;
var ears = 0;
var streak = 0;
var runRight = 0;
var hints = 0;
var q = null;
var replays = 0;
var attempt = [];
var locked = false;
var missed = false;      // 本关是否已经答错过（听对回血的门槛）
var litFrom = -1, litTo = -1;    // 正在发光的音符区间（视觉上跟着响）

/* ==================== 出题 ==================== */
function optsFor(list, ans, n) {
  var out = [ans], i;
  var rest = list.filter(function (v) { return v !== ans; });
  rest = rest.sort(function () { return Math.random() - 0.5; });
  for (i = 0; i < rest.length && out.length < n; i++) out.push(rest[i]);
  return out.sort(function (a, b) { return (typeof a === 'number' ? a : 0) - (typeof b === 'number' ? b : 0) || (a < b ? -1 : 1); });
}

function build(levelNo, d) {
  var mode = modeFor(levelNo), tier = tierFor(levelNo);
  if (mode === 'int') {
    var pool = INT_POOL[tier], ans = pick(pool);
    var low = 48 + ((Math.random() * 17) | 0);
    var down = d.down && ans > 0 && Math.random() < 0.5;
    var hi = low + ans;
    return { mode: 'int', tier: tier, ans: ans, semi: ans,
      notes: down ? [hi, low] : [low, hi],
      opts: optsFor(pool, ans, OPTN[tier]) };
  }
  if (mode === 'chord') {
    var cpool = tier === 0 ? CHORDS_LIST(2) : tier === 1 ? CH_TRIAD : CH_FULL;
    var key = pick(cpool);
    var root = 53 + ((Math.random() * 12) | 0);
    return { mode: 'chord', tier: tier, ans: key, semi: null,
      notes: CHORDS[key].steps.map(function (s) { return root + s; }),
      opts: optsFor(cpool, key, Math.min(OPTN[tier], cpool.length)) };
  }
  var len = melodyLen(levelNo), seq = [], guard = 0;
  var s0 = 1 + ((Math.random() * 6) | 0);            // 首音别贴边，留出去两头走的余地
  var lo = Math.max(0, s0 - 3), high = Math.min(SCALE.length - 1, s0 + 3);
  seq.push(SCALE[s0]);
  while (seq.length < len && guard++ < 500) {
    var cand = SCALE[lo + ((Math.random() * (high - lo + 1)) | 0)];
    if (cand === seq[seq.length - 1]) continue;      // 相邻两音不重复，免得数不出几个音
    seq.push(cand);
  }
  return { mode: 'melody', tier: tier, ans: seq.slice(), semi: null, notes: seq, opts: SCALE.slice() };
}
function CHORDS_LIST(n) { return CH_TRIAD.slice(0, n); }

function beginLevel() {
  var d = DIFFS[diff];
  q = build(level, d);
  replays = d.replays;
  attempt = [];
  missed = false;
  locked = false;
  litFrom = -1; litTo = -1;
  say(q.mode === 'melody' ? '仔细听：' + q.notes.length + ' 个音，跟着在琴键上弹出来'
    : q.mode === 'int' ? '两个音相距多远？' : '这个和弦是什么性质？');
  render(); hud();
  window.setTimeout(playQ, 300);
}

/* ==================== 播放 ==================== */
function playQ() {
  if (!q || (phase !== 'play' && phase !== 'over')) return;
  sfx.resume();
  if (q.mode === 'int') {
    sfx.tone(hz(q.notes[0]), 0.4, 'triangle', 0.16, 0);
    sfx.tone(hz(q.notes[1]), 0.5, 'triangle', 0.16, 0.46);
    lit(0, 2);
  } else if (q.mode === 'chord') {
    for (var i = 0; i < q.notes.length; i++) sfx.tone(hz(q.notes[i]), 1.0, 'triangle', 0.11, i * 0.01);
    lit(0, q.notes.length);
  } else {
    for (var k = 0; k < q.notes.length; k++) sfx.tone(hz(q.notes[k]), 0.24, 'square', 0.12, k * 0.3);
    lit(0, q.notes.length);
  }
}
function lit(a, b) {
  litFrom = a; litTo = b;
  window.setTimeout(function () { litFrom = -1; litTo = -1; render(); }, (q.mode === 'int' ? 1000 : q.mode === 'melody' ? q.notes.length * 300 + 240 : 1100));
  render();
}
function replay() {
  if (phase !== 'play' || locked) return;
  sfx.resume();
  if (replays <= 0) { say('回放次数用完了 —— 耳朵里剩下多少就是多少'); sfx.noise(0.08, 0.08); return; }
  replays--;
  hud();
  playQ();
}

/* ==================== 判定 ==================== */
function clearLevel() {
  var d = DIFFS[diff];
  var base = q.mode === 'int' ? 60 : q.mode === 'chord' ? (q.notes.length > 3 ? 100 : 80) : 40 + 25 * q.notes.length;
  var gain = Math.round(base * d.mult * (1 + 0.2 * Math.min(streak, 5)));
  score += gain; streak++; runRight++;
  var healed = !missed && ears < d.ears;
  if (healed) ears++;
  store.set('yin.right', num('yin.right') + 1);
  store.set('yin.best', Math.max(num('yin.best'), score));
  store.set('yin.round', Math.max(num('yin.round'), level + 1));
  locked = true;
  sfx.melody([[659, 0.07], [784, 0.07], [1046, 0.14]]);
  say((healed ? '一次听对，耳力回一口（' + ears + '/' + d.ears + '）· ' : '') + '<b>' + answerText(q) + '</b> · +' + gain + ' 分' + (streak > 1 ? ' · 连对 ×' + (1 + 0.2 * Math.min(streak - 1, 5)).toFixed(1) : ''));
  hud(); render();
  window.setTimeout(function () { if (phase === 'play') { level++; beginLevel(); } }, 1900);
}

function answerText(qq) {
  if (qq.mode === 'int') {
    var r = RATIOS[qq.ans];
    return INTERVALS[qq.ans] + '（' + qq.ans + ' 个半音' + (r ? '，频率比 ' + r : '') + '）：'
      + noteName(qq.notes[0]) + (qq.notes[1] > qq.notes[0] ? ' ↑ ' : qq.notes[1] < qq.notes[0] ? ' ↓ ' : ' = ') + noteName(qq.notes[1]);
  }
  if (qq.mode === 'chord') {
    return CHORDS[qq.ans].name + '：' + qq.notes.map(noteName).join(' ') + ' —— ' + CHORDS[qq.ans].tip;
  }
  return '旋律 ' + qq.notes.map(function (m) { return SOLFEGE[degOf(m)]; }).join(' ');
}

function punish(extra) {
  var d = DIFFS[diff];
  ears--;
  streak = 0;
  missed = true;
  if (replays < d.replays) replays++;          // 罚耳力，但把耳朵还给你
  hud();
  if (ears <= 0) { gameOver('耳力用尽'); return; }
  say(extra + ' · 还剩 ' + ears + ' 分耳力（退还一次回放）');
}

function wrongInt(chosen) {
  var gap = q.ans - chosen;
  return '不是「' + INTERVALS[chosen] + '」—— 答案比它' + (gap > 0 ? '宽 ' + gap : '窄 ' + (-gap)) + ' 个半音，再听音与音之间的那段距离';
}
function wrongChord(chosen) {
  var a = CHORDS[q.ans], b = CHORDS[chosen];
  if (a.steps[1] === b.steps[1]) {
    return '不是「' + b.name + '」—— 不过三度性质听对了（' + (a.steps[1] === 4 ? '下面是大三度' : '下面是小三度') + '），毛病出在更上面的那个音';
  }
  return '不是「' + b.name + '」—— 它是偏' + (a.steps[1] === 4 ? '亮' : '暗') + '的那一类，根音上面的三度听反了';
}

function answer(v) {
  if (phase !== 'play' || locked || !q || q.mode === 'melody') return;
  sfx.resume();
  if (q.opts.indexOf(v) < 0) { say('选项里没有这一项'); return; }
  if (v === q.ans) { clearLevel(); return; }
  punish(q.mode === 'int' ? wrongInt(v) : wrongChord(v));
  render();
}

function keyTap(i) {
  if (phase !== 'play' || locked || !q || q.mode !== 'melody') return;
  sfx.resume();
  var midi = SCALE[i];
  sfx.tone(hz(midi), 0.2, 'square', 0.13);
  attempt.push(i);
  render();
  var k = attempt.length - 1;
  if (midi !== q.notes[k]) {
    var msg = '第 ' + (k + 1) + ' 个音就不对：你弹的是 ' + SOLFEGE[i] + '，' +
      (midi < q.notes[k] ? '原曲那儿更高' : '原曲那儿更低') + '（共 ' + q.notes.length + ' 个音，从头再来）';
    attempt = [];
    punish(msg);
    render();
    return;
  }
  if (attempt.length === q.notes.length) { clearLevel(); return; }
  say('对了 ' + attempt.length + '/' + q.notes.length + ' 个音，继续');
}

/* ==================== 提示：消掉干扰项 / 指一个音 ==================== */
function hint() {
  if (phase !== 'play' || locked || !q) return;
  if (hints <= 0) { say('提示用完了 —— 只能靠耳朵'); return; }
  hints--;
  sfx.tone(520, 0.09, 'sine', 0.14);
  if (q.mode === 'melody') {
    litFrom = attempt.length; litTo = attempt.length + 1;
    sfx.tone(hz(q.notes[attempt.length]), 0.3, 'square', 0.12);
    window.setTimeout(function () { litFrom = -1; litTo = -1; render(); }, 700);
    say('先生透个气：第 ' + (attempt.length + 1) + ' 个音就在这排键上亮着的那一枚');
  } else {
    var kills = q.opts.filter(function (v) { return v !== q.ans; }).sort(function () { return Math.random() - 0.5; }).slice(0, 2);
    q.opts = q.opts.filter(function (v) { return kills.indexOf(v) < 0; });
    say('划掉两个不搭的选项，剩下 ' + q.opts.length + ' 选 1');
  }
  hud(); render();
}

/* ==================== 全局流转 ==================== */
function newRun(key) {
  if (key && DIFFS[key]) diff = key;
  phase = 'play';
  level = 1; score = 0; ears = DIFFS[diff].ears; streak = 0; runRight = 0;
  hints = DIFFS[diff].hints;
  store.set('yin.diff', diff);
  hideOverlay();
  beginLevel();
  markDiff();
}

function gameOver(reason) {
  if (phase === 'over') return;
  phase = 'over';
  locked = true;
  store.set('yin.best', Math.max(num('yin.best'), score));
  store.set('yin.round', Math.max(num('yin.round'), level));
  sfx.melody([[440, 0.12], [330, 0.14], [220, 0.22]]);
  ovContent.innerHTML = '<div class="ov-emoji">🎧</div><h2>' + (reason || '耳朵累了') + '</h2>' +
    '<p class="hint">这一题的正确答案是</p>' +
    '<p class="ga-ans">' + answerText(q) + '</p>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">听到第 ' + level + ' 关 · 本局听对 ' + runRight + ' 题</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再听一遍</button>' +
    '<button class="ghost" data-act="stats">看战绩</button></div>';
  overlayEl.classList.add('show');
  hud();
}

function showStats() {
  ovContent.innerHTML = '<div class="ov-emoji">📖</div><h2>本机战绩</h2>' +
    '<div class="ga-list">最高分 <b>' + num('yin.best') + '</b><br>最远听到第 <b>' + num('yin.round') + '</b> 关<br>' +
    '历代累计听对 <b>' + num('yin.right') + '</b> 题</div>' +
    '<div class="ov-actions"><button class="primary" data-act="close">继续</button>' +
    '<button class="ghost" data-act="again">重新开始</button></div>';
  overlayEl.classList.add('show');
}

function showIntro() {
  phase = 'intro';
  ovContent.innerHTML = '<div class="ov-emoji">🎧</div><h2>绝对音感</h2>' +
    '<p class="hint">三种轮次轮换：<b>辨音程</b>（两个音相距多远）、<b>跟弹旋律</b>（听几句在琴键上按回去）、' +
    '<b>听和弦</b>（大三大小减增挂四，七和弦在后面等你）。<br>' +
    '唯一的资源是<b>耳力</b>：答错扣一分耳力，但会<b>退还一次回放</b> —— 耳力耗尽才算输。<br>' +
    '演奏厅档只许听一遍。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开听</button></div>';
  overlayEl.classList.add('show');
  markDiff();
  hud();
}
function hideOverlay() { overlayEl.classList.remove('show'); }

/* ==================== 渲染 ==================== */
function render() {
  var i, html = '';
  var n = q ? q.notes.length : 0;
  for (i = 0; i < n; i++) {
    var on = q && i >= litFrom && i < litTo;
    html += '<i class="np' + (on ? ' on' : '') + (q && q.mode === 'melody' ? ' mel' : '') + '"></i>';
  }
  notesEl.innerHTML = html;
  var kh = '';
  var kLive = !!(q && q.mode === 'melody');
  for (i = 0; i < SCALE.length; i++) {
    var kOn = kLive && i >= litFrom && i < litTo;
    kh += '<button class="key' + (kLive ? ' live' : '') + (kOn ? ' flash' : '') + '" data-k="' + i + '">' +
      SOLFEGE[i] + '<b>' + LETTERS[i].toUpperCase() + '</b></button>';
  }
  keysEl.innerHTML = kh;
  var keyOff = !(kLive && phase === 'play' && !locked);
  for (i = 0; i < keysEl.children.length; i++) keysEl.children[i].disabled = keyOff;
  var ah = '';
  if (q && q.mode !== 'melody') {
    for (i = 0; i < q.opts.length; i++) {
      var v = q.opts[i];
      var label = q.mode === 'int' ? INTERVALS[v] : CHORDS[v].name;
      ah += '<button class="opt" data-i="' + (i + 1) + '" data-v="' + v + '"><small>' + (i + 1) + '</small>' + label + '</button>';
    }
  }
  ansEl.innerHTML = ah;
  var optOff = !(phase === 'play' && !locked);
  for (i = 0; i < ansEl.children.length; i++) ansEl.children[i].disabled = optOff;
  ansEl.className = 'ga-opts' + (q && q.mode === 'chord' ? ' wide' : '');
  keysEl.className = 'ga-keys' + (q && q.mode === 'melody' ? ' hot' : '');
}

function hud() {
  elLv.textContent = String(level);
  elMode.textContent = q ? MODE_CN[q.mode] : '—';
  elEars.textContent = String(ears);
  elScore.textContent = String(score);
  elReN.textContent = String(replays);
  elHintN.textContent = String(hints);
  byId('btnReplay').disabled = phase !== 'play' || locked;
  byId('btnHint').disabled = phase !== 'play' || locked || hints <= 0;
}
function say(html) { msgEl.innerHTML = html; }
function markDiff() {
  var btns = byId('diff').querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
}

/* ==================== 事件 ==================== */
ansEl.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-v]') : null;
  if (!t || t.disabled) return;
  var raw = t.dataset.v;
  answer(q && q.mode === 'chord' ? raw : Number(raw));
});
keysEl.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-k]') : null;
  if (!t || t.disabled) return;
  keyTap(Number(t.dataset.k));
});
ovContent.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  var act = t && t.dataset ? t.dataset.act : null;
  if (!act) return;
  sfx.resume();
  if (act === 'start' || act === 'again') newRun();
  else if (act === 'stats') showStats();
  else if (act === 'close') { if (phase === 'play') hideOverlay(); else showIntro(); }
});
byId('diff').addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-diff]') : null;
  if (!t || !t.dataset.diff) return;
  sfx.resume();
  newRun(t.dataset.diff);
});
byId('btnReplay').addEventListener('click', function () { sfx.resume(); replay(); });
byId('btnHint').addEventListener('click', function () { sfx.resume(); hint(); });
byId('btnStats').addEventListener('click', function () { sfx.resume(); showStats(); });
byId('btnNew').addEventListener('click', function () { sfx.resume(); newRun(); });
soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });

window.addEventListener('keydown', function (e) {
  var k = (e.key || '').toLowerCase();
  if (k === ' ' || k === 'enter') { replay(); e.preventDefault(); return; }
  // 只有旋律轮里 a-k 才是琴键；否则 h 会被当成第 6 个音，把「H = 提示」吃掉
  var ki = q && q.mode === 'melody' ? LETTERS.indexOf(k) : -1;
  if (ki >= 0) { keyTap(ki); return; }
  if (k >= '1' && k <= '9' && q && q.mode !== 'melody') {
    var idx = Number(k) - 1;
    if (idx < q.opts.length) answer(q.opts[idx]);
    return;
  }
  if (k === 'h') hint();
  else if (k === 't') showStats();
  else if (k === 'n') newRun();
  else if (k === 'm') { sfx.toggle(); syncSound(); }
  else if (k === 'escape') hideOverlay();
});

/* ==================== 启动 ==================== */
(function boot() {
  diff = store.get('yin.diff', 'pro');
  if (!DIFFS[diff]) diff = 'pro';
  ears = DIFFS[diff].ears;
  q = build(1, DIFFS[diff]);
  replays = DIFFS[diff].replays;
  render();
  hud();
  syncSound();
  showIntro();
})();

})();
