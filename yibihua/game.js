/* 一笔画 —— 点阵里藏着一幅画的所有线段：挑对起点、不抬笔、不重描，每条线恰好描一遍
   机制：关卡由「不重复边的随机游走」生成，那条游走本身就是解；每描一条线都用欧拉通路
   定理判一次（剩下没描的线必须连成一片、奇数度的点恰好 0 个或 2 个且笔尖就在其中之一上），
   描出「怎么走都描不完」的那一笔当场判死笔，洗一笔费一滴墨，墨尽判负。纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 难度与关卡曲线 ==================== */
var DIFFS = {
  doodle: { label: '随便涂涂', ink: 8, hints: 6, mult: 0.8 },
  normal: { label: '一笔到底', ink: 4, hints: 3, mult: 1 },
  master: { label: '不许洗笔', ink: 1, hints: 1, mult: 1.6 }
};
function boardFor(level) { return level <= 3 ? 3 : level <= 8 ? 4 : 5; }
function targetFor(level) {
  var n = boardFor(level), cap = n === 3 ? 10 : n === 4 ? 18 : 28;
  return Math.min(cap, 4 + level);
}
var PAL = ['#38bdf8', '#818cf8', '#a78bfa', '#f472b6'];

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
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'yi.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var cv = byId('cv');
var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
var overlayEl = byId('overlay');
var ovContent = byId('overlayContent');
var elLv = byId('lv'); var elLines = byId('lines'); var elInk = byId('ink'); var elScore = byId('score');
var elHintN = byId('hintN'); var msgEl = byId('msg');

/* ==================== 图结构 ==================== */
var N = 3;                 // 每边几个点
var adj = {};              // 点 → 相邻点（含斜向）
var req = {};              // 关卡线段：'a-b' → [a,b]
var deg = {};              // 每个点的线数
var edges = [];            // 线段数组
var solution = [];         // 生成时那条游走，本身就是解
var startNodes = [];       // 合法起点

function ek(a, b) { return a < b ? a + '-' + b : b + '-' + a; }

function buildAdj(n) {
  var out = {}, r, c, dr, dc;
  for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
    var list = [], i = r * n + c;
    for (dr = -1; dr <= 1; dr++) for (dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      var rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      list.push(rr * n + cc);
    }
    out[i] = list;
  }
  return out;
}

/* 随机游走且不重复走同一条边；走不动就整次重来，取描得最长的那次 */
function gen(n, target) {
  var best = [], attempt, step;
  for (attempt = 0; attempt < 80; attempt++) {
    var used = {}, seq = [], cur = (Math.random() * n * n) | 0;
    for (step = 0; step < target; step++) {
      var opts = [], nb = adj[cur], i;
      for (i = 0; i < nb.length; i++) if (!used[ek(cur, nb[i])]) opts.push(nb[i]);
      if (!opts.length) break;
      var to = opts[(Math.random() * opts.length) | 0];
      used[ek(cur, to)] = 1;
      seq.push([cur, to]);
      cur = to;
    }
    if (seq.length > best.length) best = seq;
    if (best.length >= target) break;
  }
  req = {}; deg = {}; edges = [];
  for (var i = 0; i < best.length; i++) {
    var a = best[i][0], b = best[i][1], k = ek(a, b);
    if (req[k]) continue;
    req[k] = [a, b];
    edges.push(req[k]);
    deg[a] = (deg[a] || 0) + 1;
    deg[b] = (deg[b] || 0) + 1;
  }
  solution = best;
}

function liveAdj(live) {
  var m = {}, k;
  for (k in live) {
    var a = live[k][0], b = live[k][1];
    (m[a] = m[a] || []).push(b);
    (m[b] = m[b] || []).push(a);
  }
  return m;
}
function countKeys(o) { var n = 0, k; for (k in o) n++; return n; }

/* 欧拉判定：笔尖在 p，剩下的线 live 还能不能一笔画完
   ①剩下的线必须全在 p 能到达的那一片里 ②奇数度的点 0 个（回路）或 2 个且 p 是其中之一 */
function canFinish(p, live) {
  var total = countKeys(live);
  if (!total) return true;
  var la = liveAdj(live);
  if (!(la[p] || []).length) return false;
  var d = {}, seenE = {}, stack = [p], cnt = 0, i;
  d[p] = 0;
  while (stack.length) {
    var v = stack.pop(), nb = la[v] || [];
    for (i = 0; i < nb.length; i++) {
      var e = ek(v, nb[i]);
      if (seenE[e]) continue;
      seenE[e] = 1; cnt++;
      d[v] = (d[v] || 0) + 1;
      d[nb[i]] = (d[nb[i]] || 0) + 1;
      if (stack.indexOf(nb[i]) < 0) stack.push(nb[i]);
    }
  }
  if (cnt !== total) return false;
  var odd = 0, hasP = false, k;
  for (k in d) if (d[k] % 2 === 1) { odd++; if (Number(k) === p) hasP = true; }
  if (!odd) return true;
  return odd === 2 && hasP;
}

/* ==================== 局面 ==================== */
var phase = 'intro';
var diff = 'normal';
var level = 1;
var score = 0;
var ink = 0;               // 还能洗几笔
var hints = 0;
var runLines = 0;
var drawn = {};
var trail = [];            // 笔尖走过的点，trail[0] 是下笔处
var pen = -1;
var locked = false;        // 结算/死笔动画期间不许操作
var hintMark = null;       // { node: i } 或 { edge: 'a-b' }
var fatalEdge = null;      // 判死的那一条线
var pulse = 0;

function liveNow() {
  var m = {}, k;
  for (k in req) if (!drawn[k]) m[k] = req[k];
  return m;
}
function remain() { return countKeys(liveNow()); }
function canStart(i) { return startNodes.indexOf(i) >= 0; }

function pickStarts() {
  var out = [], live = liveNow(), i;
  for (i = 0; i < N * N; i++) if (deg[i] && canFinish(i, live)) out.push(i);
  startNodes = out;
  return out;
}

/* ==================== 描线 ==================== */
function tap(i) {
  if (phase !== 'play' || locked || i < 0) return;
  sfx.resume();
  if (pen < 0) {
    if (!canStart(i)) {
      sfx.tone(230, 0.06, 'square', 0.09);
      say('这个点下不了笔：从这儿起步注定描不完。<b>空心圈</b>才是合法起点');
      return;
    }
    pen = i; trail = [i]; hintMark = null;
    sfx.tone(520, 0.06, 'triangle', 0.12);
    say('下笔了。接着点与它有线相连的点，每条线只能描一遍');
    hud();
    return;
  }
  if (i === pen) { say('笔尖还停在这个点上'); return; }
  var k = ek(pen, i);
  if (!req[k]) { sfx.tone(230, 0.05, 'square', 0.08); say('这两个点之间<b>没有线</b>，换一条'); return; }
  if (drawn[k]) { sfx.tone(230, 0.05, 'square', 0.08); say('这条线<b>描过了</b>，一笔不能重描'); return; }
  doDraw(k, i);
}

function doDraw(k, to) {
  drawn[k] = 1;
  trail.push(to);
  pen = to;
  hintMark = null;
  var live = liveNow(), left = countKeys(live);
  if (!left) { sfx.melody([[659, 0.06], [784, 0.06], [988, 0.06], [1318, 0.14]]); finishStroke(); return; }
  if (!canFinish(pen, live)) { fatalEdge = k; sfx.tone(190, 0.22, 'sawtooth', 0.16, 0, 90); deadPen(); return; }
  sfx.tone(400 + 28 * (trail.length % 9), 0.05, 'triangle', 0.1);
  say('描了 <b>' + (edges.length - left) + '/' + edges.length + '</b> 条线，还剩 ' + left + ' 条');
  hud();
}

function deadPen() {
  if (ink <= 0) { gameOver('墨尽了'); return; }
  ink--;
  locked = true;
  say('第 <b>' + (trail.length - 1) + '</b> 笔之后就已经描不完了 —— 洗一笔墨（还剩 ' + ink + ' 滴）');
  hud();
  window.setTimeout(function () { if (phase === 'play') resetStroke('笔洗净了，重新下笔'); }, 1500);
}

function wash() {
  if (phase !== 'play' || locked) return;
  sfx.resume();
  if (pen < 0) { say('笔还没下，洗什么墨'); return; }
  if (ink <= 0) { say('墨瓶空了 —— 这一笔只能描完它'); return; }
  ink--;
  sfx.noise(0.14, 0.1);
  resetStroke('自己洗了笔，费一滴墨（还剩 ' + ink + ' 滴）');
}

function resetStroke(msg) {
  drawn = {}; trail = []; pen = -1; fatalEdge = null; hintMark = null; locked = false;
  hud();
  if (msg) say(msg);
}

function finishStroke() {
  var d = DIFFS[diff];
  var gain = Math.round((40 + edges.length * 12) * d.mult);
  var perfect = ink === d.ink;
  if (perfect) gain += Math.round(30 * d.mult);
  score += gain;
  runLines += edges.length;
  store.set('yi.lines', num('yi.lines') + edges.length);
  store.set('yi.best', Math.max(num('yi.best'), score));
  store.set('yi.level', Math.max(num('yi.level'), level + 1));
  locked = true;
  say('<b>' + edges.length + '</b> 条线一笔描完' + (perfect ? ' · 一滴墨没费 +' : ' +') + gain + ' 分');
  hud();
  window.setTimeout(function () { if (phase === 'play') { level++; beginLevel(); } }, 1500);
}

/* ==================== 提示 ==================== */
function hint() {
  if (phase !== 'play' || locked) return;
  if (hints <= 0) { say('先生的提示用完了 —— 自己找下一个落点'); return; }
  if (pen < 0) {
    var s = pickStarts();
    if (!s.length) { say('这关找不到合法起点，重开一局试试'); return; }
    hints--; hintMark = { node: s[0] };
    sfx.tone(520, 0.09, 'sine', 0.14);
    say('先生替你下笔：从 <b>' + spot(s[0]) + '</b> 起步才描得完');
    hud();
    return;
  }
  var live = liveNow(), nb = adj[pen], i;
  for (i = 0; i < nb.length; i++) {
    var k = ek(pen, nb[i]);
    if (!req[k] || drawn[k]) continue;
    var tryLive = {}, key;
    for (key in live) if (key !== k) tryLive[key] = live[key];
    if (!canFinish(nb[i], tryLive)) continue;
    hints--; hintMark = { edge: k };
    sfx.tone(520, 0.09, 'sine', 0.14);
    say('下一笔走 <b>' + spot(pen) + ' → ' + spot(nb[i]) + '</b>，这样还剩的路才连得上');
    hud();
    return;
  }
  say('这一笔怎么走都描不完，洗笔重来的成本比硬撑低');
}
function spot(i) { return '第 ' + ((i % N) + 1) + ' 列' + '第 ' + (((i / N) | 0) + 1) + ' 行'; }

/* ==================== 关卡 / 全局 ==================== */
function beginLevel() {
  N = boardFor(level);
  adj = buildAdj(N);
  gen(N, targetFor(level));
  drawn = {}; trail = []; pen = -1; fatalEdge = null; hintMark = null; locked = false;
  ink = DIFFS[diff].ink;
  pickStarts();
  say('第 ' + level + ' 关：' + N + '×' + N + ' 点阵，' + edges.length + ' 条线，一笔画完');
  hud();
}

function newRun(key) {
  if (key && DIFFS[key]) diff = key;
  phase = 'play';
  level = 1; score = 0; runLines = 0;
  hints = DIFFS[diff].hints;
  store.set('yi.diff', diff);
  hideOverlay();
  beginLevel();
  markDiff();
}

function gameOver(reason) {
  if (phase === 'over') return;
  phase = 'over';
  store.set('yi.best', Math.max(num('yi.best'), score));
  store.set('yi.level', Math.max(num('yi.level'), level));
  sfx.melody([[440, 0.12], [330, 0.14], [220, 0.22]]);
  ovContent.innerHTML = '<div class="ov-emoji">🖌️</div><h2>' + (reason || '笔废了') + '</h2>' +
    '<p class="hint">这一关还剩 <b>' + remain() + '</b> 条线没描完。<br>' +
    '诀窍：只能从<b>奇数度</b>的点起步，别把某片线描成孤岛。</p>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">画到第 ' + level + ' 关 · 本局描线 ' + runLines + ' 条</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一笔</button>' +
    '<button class="ghost" data-act="stats">看战绩</button></div>';
  overlayEl.classList.add('show');
  hud();
}

function showStats() {
  ovContent.innerHTML = '<div class="ov-emoji">📖</div><h2>本机战绩</h2>' +
    '<div class="yb-list">最高分 <b>' + num('yi.best') + '</b><br>最远画到第 <b>' + num('yi.level') + '</b> 关<br>' +
    '历代累计描线 <b>' + num('yi.lines') + '</b> 条</div>' +
    '<div class="ov-actions"><button class="primary" data-act="close">继续</button>' +
    '<button class="ghost" data-act="again">重新开始</button></div>';
  overlayEl.classList.add('show');
}

function showIntro() {
  phase = 'intro';
  ovContent.innerHTML = '<div class="ov-emoji">🖌️</div><h2>一笔画</h2>' +
    '<p class="hint">点阵里藏着一幅画的<b>所有线段</b>：<br>' +
    '挑一个点下笔，不抬笔、不重描，把每条线恰好描一遍。<br>' +
    '有些点进去走不出来 —— 欧拉三百年前就给过答案：<br>' +
    '只有<b>连着奇数条线</b>的点才能当起点和终点。<br>' +
    '描错一笔，剩下的线成了孤岛，就得洗一笔墨；墨尽判负。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">下笔</button></div>';
  overlayEl.classList.add('show');
  markDiff();
  hud();
}
function hideOverlay() { overlayEl.classList.remove('show'); }

/* ==================== 渲染 ==================== */
var W = 0, H = 0, PAD = 46;
function resize() {
  var rect = cv.getBoundingClientRect();
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = rect.width || 380;
  H = rect.height || W;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function gap() { return (Math.min(W, H) - 2 * PAD) / (N - 1); }
function px(i) { return { x: PAD + (i % N) * gap(), y: PAD + (((i / N) | 0)) * gap() }; }
function nodeAt(x, y) {
  var best = -1, bd = 1e9, r = gap() * 0.46, i;
  for (i = 0; i < N * N; i++) {
    var p = px(i), d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bd) { bd = d; best = i; }
  }
  return bd <= r * r ? best : -1;
}
function line(a, b, color, w, dash) {
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.setLineDash(dash || []);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.setLineDash([]);
}
function dot(p, r, fill, stroke, w) {
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w || 2; ctx.stroke(); }
}

function draw() {
  if (!ctx || !W) return;
  pulse++;
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  var i, k, p;
  /* 底纹：整张点阵 */
  for (i = 0; i < N * N; i++) dot(px(i), 2.2, 'rgba(148,163,184,0.22)');
  /* 待描的线：浅色凹槽 */
  for (k in req) {
    if (drawn[k]) continue;
    var e = req[k];
    line(px(e[0]), px(e[1]), 'rgba(148,163,184,0.34)', 4, [2, 8]);
  }
  /* 描过的线：由冷到暖的渐变 */
  for (i = 0; i + 1 < trail.length; i++) {
    var t = i / Math.max(1, trail.length - 1);
    var c = PAL[Math.min(PAL.length - 1, Math.floor(t * PAL.length))];
    line(px(trail[i]), px(trail[i + 1]), c, 6);
  }
  /* 判死的那一条 */
  if (fatalEdge && req[fatalEdge]) {
    var f = req[fatalEdge];
    line(px(f[0]), px(f[1]), '#f87171', 7);
  }
  /* 合法起点：空心圈 */
  if (pen < 0) {
    for (i = 0; i < startNodes.length; i++) {
      p = px(startNodes[i]);
      dot(p, 10 + (pulse % 40) / 12, null, 'rgba(56,189,248,0.55)', 2);
    }
  }
  /* 提示 */
  if (hintMark) {
    if (hintMark.node != null) {
      p = px(hintMark.node);
      dot(p, 13 + Math.sin(pulse / 9) * 2, null, '#fbbf24', 3);
    } else if (req[hintMark.edge]) {
      var h = req[hintMark.edge];
      line(px(h[0]), px(h[1]), 'rgba(251,191,36,0.75)', 5, [6, 6]);
    }
  }
  /* 点与笔 */
  for (i = 0; i < N * N; i++) {
    p = px(i);
    if (!deg[i] && !(trail.indexOf(i) >= 0)) continue;
    dot(p, 5.5, '#0b1220', i === pen ? '#f472b6' : 'rgba(226,232,240,0.55)', 2);
  }
  if (pen >= 0) {
    p = px(pen);
    dot(p, 9 + Math.sin(pulse / 7) * 2.5, 'rgba(244,114,182,0.30)', '#f472b6', 2);
    dot(p, 3.4, '#fbcfe8');
  }
}

function frame() {
  draw();
  window.requestAnimationFrame(frame);
}

/* ==================== HUD ==================== */
function hud() {
  elLv.textContent = String(level);
  elLines.textContent = (edges.length ? edges.length - remain() : 0) + '/' + edges.length;
  elInk.textContent = String(ink);
  elScore.textContent = String(score);
  elHintN.textContent = String(hints);
  byId('btnHint').disabled = phase !== 'play' || hints <= 0 || locked;
  byId('btnWash').disabled = phase !== 'play' || locked || ink <= 0;
}
function say(html) { msgEl.innerHTML = html; }
function markDiff() {
  var btns = byId('diff').querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
}

/* ==================== 事件 ==================== */
function evtNode(ev) {
  var rect = cv.getBoundingClientRect();
  var sx = rect.width || W, sy = rect.height || H;
  var x = ((ev.clientX - (rect.left || 0)) / sx) * W;
  var y = ((ev.clientY - (rect.top || 0)) / sy) * H;
  return nodeAt(x, y);
}
var dragging = false;
cv.addEventListener('pointerdown', function (ev) {
  sfx.resume();
  if (phase !== 'play' || locked) return;
  var i = evtNode(ev);
  if (i < 0) return;
  if (pen < 0) { tap(i); dragging = true; return; }
  if (i === pen) { dragging = true; return; }
  tap(i);
  dragging = true;
});
cv.addEventListener('pointermove', function (ev) {
  if (!dragging || phase !== 'play' || locked) return;
  var i = evtNode(ev);
  if (i >= 0 && i !== pen) tap(i);
});
cv.addEventListener('pointerup', function () { dragging = false; });
cv.addEventListener('pointercancel', function () { dragging = false; });

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

byId('btnHint').addEventListener('click', function () { sfx.resume(); hint(); });
byId('btnWash').addEventListener('click', function () { sfx.resume(); wash(); });
byId('btnStats').addEventListener('click', function () { sfx.resume(); showStats(); });
byId('btnNew').addEventListener('click', function () { sfx.resume(); newRun(); });
soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });

window.addEventListener('keydown', function (e) {
  var k = (e.key || '').toLowerCase();
  if (k === 'h') hint();
  else if (k === 'r') wash();
  else if (k === 't') showStats();
  else if (k === 'n') newRun();
  else if (k === 'm') { sfx.toggle(); syncSound(); }
  else if (k === 'escape') hideOverlay();
});

/* ==================== 启动 ==================== */
(function boot() {
  diff = store.get('yi.diff', 'normal');
  if (!DIFFS[diff]) diff = 'normal';
  hints = DIFFS[diff].hints;
  N = boardFor(1);
  adj = buildAdj(N);
  gen(N, targetFor(1));
  pickStarts();
  resize();
  window.addEventListener('resize', resize);
  hud();
  syncSound();
  showIntro();
  window.requestAnimationFrame(frame);
})();

})();
