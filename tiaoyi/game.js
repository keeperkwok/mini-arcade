/* 跳一跳 —— 按住蓄力、松手落台：把「距离 = 蓄力时长的纯函数」当成全部手感。
   机制：① 蓄力时长（整数 ms）经抛物线距离公式算出落点，飞多久也是它的函数，
        所以同一发力度的轨迹可以一帧一帧复现，测试能拿着公式对拍；
   ② 落点判定只认「横向落在哪个台子的范围内 + 起跳高度够不够」：正中算完美吃连击，
        踩边算过，跳到下一个台子算串跳（多给分），够不着或者飞过头就直接掉下去；
   ③ 原版规则里最狠的一条：站着不动超过几秒判负 —— 所以这是个实时计时游戏，不是回合制。
   纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 场地常量（逻辑坐标系 480×420） ==================== */
var W = 480, H = 420;
var FRAME_MS = 16;
var GROUND = 356;          // 台子顶面最低
var SKY = 150;             // 台子顶面最高
var PLAYER_W = 26;
var PLAYER_H = 34;
var EDGE = 3;              // 落点容差：压着台子边也算上
var TOL_HIT = 26;          // 稳：离中心不超过这个
var TOL_PERFECT = 11;      // 完美：正中白心
var MAX_UP = 72;           // 最高能跳上去的高度差
var ARC_K = 0.10;          // 抛物线拱高系数（按距离）
var DIST_A = 26, DIST_B = 0.58, DIST_C = 0.00012;   // 距离 = A + B·t + C·t²
var AIR_A = 280, AIR_B = 0.12;                      // 飞行时长 = A + B·蓄力
var FALL_MS = 620;
var JUMPS_PER_LEVEL = 8;
var MAX_LEVEL = 20;
var COMBO_CAP = 8;
var CAM_X = 150;           // 玩家稳定在画面这个横向位置
var DIFFS = {
  easy: { key: 'easy', label: '慢慢跳', charge: 1800, idle: 8000, gapK: 0.86, wideK: 1.18, mult: 0.8 },
  norm: { key: 'norm', label: '标准手感', charge: 1500, idle: 6000, gapK: 1, wideK: 1, mult: 1 },
  hard: { key: 'hard', label: '极限距离', charge: 1250, idle: 4600, gapK: 1.14, wideK: 0.84, mult: 1.6 },
};

function rngOf(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// FIXED_SEED：地址栏写 #seed=数字 就能复现同一串台子
var FIXED_SEED = (function () {
  var m = /seed=(\d+)/.exec((typeof location !== 'undefined' && location.hash) || '');
  return m ? (parseInt(m[1], 10) >>> 0) : 0;
})();
var seedBase = 0;
var rnd = rngOf(1);
function randIn(range) { return range[0] + rnd() * (range[1] - range[0]); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ==================== 纯规则：距离 / 时长 / 关卡 / 算分 ==================== */
function D() { return DIFFS[diff]; }
function chargeCap() { return D().charge; }
function idleLimit() { return D().idle; }
function distOf(ms) { var t = clamp(ms, 0, chargeCap()); return DIST_A + DIST_B * t + DIST_C * t * t; }
function airOf(ms) { return AIR_A + AIR_B * clamp(ms, 0, chargeCap()); }
function chargeFor(dist) {                       // 反解：想跳这么远要蓄多久
  var a = DIST_C, b = DIST_B, c = DIST_A - dist;
  var disc = b * b - 4 * a * c;
  if (disc < 0) return chargeCap();
  var t = (-b + Math.sqrt(disc)) / (2 * a);
  return clamp(t, 0, chargeCap());
}
function levelOf(jumps) { return Math.min(1 + Math.floor(jumps / JUMPS_PER_LEVEL), MAX_LEVEL); }
function gapRange(lv) {
  var lo = (78 + Math.min(96, (lv - 1) * 9)) * D().gapK;
  var hi = (216 + Math.min(430, (lv - 1) * 24)) * D().gapK;
  return [lo, Math.min(hi, distOf(chargeCap()) - 40)];
}
function widthRange(lv) {
  var lo = Math.max(26, (64 - (lv - 1) * 3)) * D().wideK;
  var hi = Math.max(48, (116 - (lv - 1) * 4)) * D().wideK;
  return [lo, hi];
}
function dyRange(lv) { var d = Math.min(64, 22 + (lv - 1) * 4); return [-d, d]; }
function levelMult(lv) { return 1 + 0.05 * (lv - 1); }
function comboMult(c) { return 1 + Math.min(c, COMBO_CAP) * 0.25; }
function bonusOf(off) { return off <= TOL_PERFECT ? 20 : off <= TOL_HIT ? 6 : 0; }
function gainOf(off, passed, combo) {
  return Math.round((10 + bonusOf(off) + Math.max(0, passed - 1) * 15) *
    comboMult(combo) * D().mult * levelMult(level));
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
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'ty.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var cv = byId('cv');
var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
var barEl = byId('bar'), barTEl = byId('barT'), msgEl = byId('msg');
var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elCombo = byId('combo'), elIdle = byId('idle'), elJumps = byId('jumps'), elScore = byId('score');
var btnJump = byId('btnJump');

/* ==================== 局面状态 ==================== */
var phase = 'intro';        // intro | play | over
var diff = store.get('ty.diff', 'norm');
if (!DIFFS[diff]) diff = 'norm';
var state = 'aim';          // aim | charge | fly | fall
var plats = [];
var cur = 0;                // 脚下台子下标
var px = 0, py = 0;         // 玩家（世界坐标，py = 脚底）
var chargeMs = 0, flyT = 0, flyDur = 0, sx = 0, sy = 0, ex = 0, ey = 0, arcH = 0, fallT = 0;
var idleMs = 0, capped = false, squash = 0;
var level = 1, score = 0, jumps = 0, combo = 0, bestCombo = 0, perfects = 0, lastGain = 0;
var camX = 0, camTo = 0, clock = 0, paused = false, runStart = 0;

function platTop(p) { return p.y; }
function curPlat() { return plats[cur]; }
function playerOn() { return plats[cur] ? cur : -1; }
function tNow() { return clock - runStart; }

/* ==================== 台子生成 ==================== */
function newPlats() {
  plats = [];
  var first = { x: 70, y: 300, w: 118 };
  plats.push(first);
  px = first.x + first.w / 2;
  py = first.y;
  cur = 0;
  ensurePlats();
}
function genMore() {
  var last = plats[plats.length - 1];
  var lv = level;
  var gap = Math.round(randIn(gapRange(lv)));
  var w = Math.round(randIn(widthRange(lv)));
  var dy = Math.round(randIn(dyRange(lv)));
  var ny = clamp(last.y + dy, SKY, GROUND);
  if (Math.abs(ny - last.y) < 6) ny = clamp(last.y - dy, SKY, GROUND);   // 别老在同一个高度上蹭
  plats.push({ x: last.x + last.w + gap, y: ny, w: w });
}
function ensurePlats() {
  var guard = 0;
  while (plats.length && plats[plats.length - 1].x < camTo + W + 900 && guard++ < 60) genMore();
}
function platAt(wx) {
  for (var i = 0; i < plats.length; i++) {
    var p = plats[i];
    if (wx >= p.x - EDGE && wx <= p.x + p.w + EDGE) return i;
  }
  return -1;
}

/* ==================== 跳跃流程 ==================== */
function startCharge() {
  if (phase !== 'play' || paused || state !== 'aim') return false;
  state = 'charge';
  chargeMs = 0;
  capped = false;
  idleMs = 0;
  sfx.resume();
  return true;
}
function release() {
  if (state !== 'charge') return false;
  var d = distOf(chargeMs);
  sx = px; sy = py;
  ex = px + d;
  arcH = 42 + d * ARC_K;
  flyT = 0;
  flyDur = airOf(chargeMs);
  // 落点：找横向命中的台子；没有就掉下去；太高跳不上去也算撞沿
  var hit = platAt(ex);
  ey = hit >= 0 ? plats[hit].y : GROUND + 200;
  if (hit >= 0 && plats[hit].y < py - MAX_UP) { hit = -1; ey = GROUND + 200; }
  landing = hit;
  state = 'fly';
  sfx.tone(300 + chargeMs * 0.5, 0.07, 'triangle', 0.15, 0, 620 + chargeMs * 0.6);
  hud();
  return true;
}
var landing = -1;
function arcY(t) { return sy + (ey - sy) * t - arcH * 4 * t * (1 - t); }
function land() {
  px = ex;
  if (landing >= 0) {
    var p = plats[landing];
    py = p.y;
    var passed = landing - cur;
    var off = Math.abs(px - (p.x + p.w / 2));
    var isPerfect = off <= TOL_PERFECT;
    var isEdge = px < p.x || px > p.x + p.w;
    var hopped = passed < 1;                       // 没上台子，只是在原地蹦了一下
    combo = isPerfect && !hopped ? combo + 1 : 0;
    bestCombo = Math.max(bestCombo, combo);
    if (isPerfect && !hopped) perfects++;
    var gain = hopped ? Math.round(2 * D().mult * levelMult(level)) : gainOf(off, passed, combo);
    score += gain;
    lastGain = gain;
    jumps += passed;
    cur = landing;
    level = levelOf(jumps);
    if (level > num('ty.lv')) store.set('ty.lv', level);
    store.set('ty.jump', num('ty.jump') + passed);
    idleMs = 0;
    state = 'aim';
    chargeMs = 0;
    squash = 1;
    camTo = px - CAM_X;
    ensurePlats();
    if (hopped) {
      sfx.tone(240, 0.05, 'sine', 0.1);
      msg('<span class="ty-warn">原地蹦了一下</span> 没上台子，+' + gain + ' 分意思意思');
    } else if (isPerfect) {
      sfx.melody([[784, 0.05], [1046, 0.07], [1318, 0.1]]);
      msg('<span class="ty-good">正中白心 ×' + combo + '</span> 这一下 +' + gain + ' 分' +
        (passed > 1 ? '（串了 ' + passed + ' 台）' : ''));
    } else if (isEdge) {
      sfx.tone(420, 0.06, 'square', 0.13);
      msg('<span class="ty-warn">踩边过的</span> +' + gain + ' 分，连击断了');
    } else {
      sfx.tone(520, 0.06, 'square', 0.13);
      msg('落台 +' + gain + ' 分 · 离中心 ' + Math.round(off) + 'px');
    }
  } else {
    state = 'fall';
    fallT = 0;
    sfx.melody([[330, 0.1], [247, 0.16]]);
    msg('<span class="ty-bad">扑空了</span> —— 蓄力 ' + Math.round(chargeMs) + 'ms 跳了 ' +
      Math.round(ex - sx) + 'px');
  }
  hud();
}
function gameOver(why) {
  phase = 'over';
  state = 'aim';
  saveRecords();
  sfx.melody([[392, 0.12], [330, 0.14], [262, 0.24]]);
  show('<div class="ov-emoji">🕳️</div><h2>' + (why || '掉下去了') + '</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">' + D().label + ' · 第 ' + level + ' 关 · 跳了 ' + jumps + ' 台 · 最长连击 ×' + bestCombo +
    ' · 累计跳数 ' + num('ty.jump') + ' · 纪录 ' + num('ty.best') + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function winHint() {
  return '蓄力 ' + Math.round(chargeMs) + ' / ' + chargeCap() + 'ms → 能跳 ' + Math.round(distOf(chargeMs)) + 'px';
}
function saveRecords() {
  if (score > num('ty.best')) store.set('ty.best', score);
  if (level > num('ty.lv')) store.set('ty.lv', level);
}

/* ==================== 帧推进（整数 ms） ==================== */
function stepFrame(ms) {
  if (phase !== 'play' || paused || ovShown()) return;
  clock += ms;
  if (state === 'aim') {
    idleMs += ms;
    if (squash > 0) squash = Math.max(0, squash - ms / 220);
    if (idleMs >= idleLimit()) { gameOver('站着不动超过 ' + (idleLimit() / 1000).toFixed(1) + ' 秒'); return; }
  } else if (state === 'charge') {
    chargeMs = Math.min(chargeCap(), chargeMs + ms);
    if (chargeMs >= chargeCap() && !capped) {
      capped = true;
      sfx.tone(180, 0.09, 'sawtooth', 0.12);
      msg('<span class="ty-bad">满力了！</span>再不解手就要飞过头');
    }
  } else if (state === 'fly') {
    flyT += ms;
    var t = clamp(flyT / flyDur, 0, 1);
    px = sx + (ex - sx) * t;
    py = arcY(t);
    if (flyT >= flyDur) land();
  } else if (state === 'fall') {
    fallT += ms;
    py += ms * 0.62;
    if (fallT >= FALL_MS) { gameOver('掉下去了'); return; }
  }
  camTo = Math.max(camTo, px - CAM_X);
  camX += (camTo - camX) * Math.min(1, ms / 90);
  hud();
}

/* ==================== 渲染 ==================== */
function resize() {
  if (!cv || !ctx) return;
  var rect = cv.getBoundingClientRect();
  var cssW = rect.width || W;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(cssW * dpr));
  cv.height = Math.max(1, Math.round(cssW * (H / W) * dpr));
  var k = cv.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}
function draw() {
  rafId = window.requestAnimationFrame(draw);
  if (!ctx) return;
  stepFrame(lastDt());
  last = nowMs();
  ctx.clearRect(0, 0, W, H);
  var sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0f1a22');
  sky.addColorStop(1, '#06080d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // 远景横纹（跟着相机慢速视差）
  ctx.fillStyle = 'rgba(148,163,184,0.07)';
  for (var b = 0; b < 7; b++) {
    var bx = ((b * 173 - camX * 0.28) % (W + 220)) - 110;
    ctx.fillRect(bx, 60 + b * 16, 96, 4);
  }
  // 台子
  for (var i = 0; i < plats.length; i++) {
    var p = plats[i];
    var dx = p.x - camX;
    if (dx > W + 160 || dx + p.w < -160) continue;
    var h = GROUND - p.y + 70;
    ctx.fillStyle = i === cur ? '#1d3a4a' : '#16283a';
    roundRect(dx, p.y, p.w, h, 7);
    ctx.fill();
    ctx.fillStyle = i === cur ? 'rgba(52,211,153,0.9)' : 'rgba(56,189,248,0.7)';
    ctx.fillRect(dx, p.y, p.w, 4);
    // 白心：完美落点
    var cxp = dx + p.w / 2;
    ctx.beginPath();
    ctx.ellipse(cxp, p.y + 2, Math.min(11, p.w / 4), 3.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(248,250,252,0.85)';
    ctx.fill();
  }
  // 影子 + 棋子（蓄力时压扁，起跳前拉高）
  var pdx = px - camX;
  var under = platAt(px);
  var groundY = under >= 0 ? plats[under].y : GROUND;
  var shadowK = clamp(1 - (groundY - py) / 240, 0.25, 1);
  ctx.beginPath();
  ctx.ellipse(pdx, groundY + 3, 15 * shadowK, 4.4 * shadowK, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(4,8,12,0.55)';
  ctx.fill();
  var sq = state === 'charge' ? 1 - 0.34 * (chargeMs / chargeCap()) : 1 + 0.16 * squash;
  var sw = 1 + 0.22 * (1 - sq);
  ctx.save();
  ctx.translate(pdx, py);
  ctx.scale(sw, sq);
  ctx.fillStyle = '#e2f4ff';
  roundRect(-PLAYER_W / 2, -PLAYER_H, PLAYER_W, PLAYER_H, 6);
  ctx.fill();
  ctx.fillStyle = '#0f1a22';
  ctx.beginPath();
  ctx.arc(0, -PLAYER_H + 9, 5.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = state === 'charge' ? '#fbbf24' : '#34d399';
  ctx.fillRect(-PLAYER_W / 2, -12, PLAYER_W, 5);
  ctx.restore();
  // 力度条（画布上再画一份，手机上看得更清）
  if (state === 'charge' || state === 'fly') {
    var pct = state === 'charge' ? chargeMs / chargeCap() : 1 - clamp(flyT / flyDur, 0, 1);
    ctx.fillStyle = 'rgba(226,244,255,0.16)';
    ctx.fillRect(18, H - 26, 150, 8);
    ctx.fillStyle = capped ? '#f87171' : '#fbbf24';
    ctx.fillRect(18, H - 26, 150 * clamp(pct, 0, 1), 8);
    ctx.fillStyle = 'rgba(226,244,255,0.75)';
    ctx.font = '11px system-ui';
    ctx.fillText(state === 'charge' ? Math.round(distOf(chargeMs)) + 'px' : '飞行中', 18, H - 32);
  }
  if (state === 'aim' && phase === 'play') {
    ctx.fillStyle = 'rgba(226,244,255,0.55)';
    ctx.font = '12px system-ui';
    ctx.fillText('按住起跳 · 下一个台子在 ' + Math.round(plats[cur + 1].x + plats[cur + 1].w / 2 - px) + 'px 外', 18, H - 32);
  }
}
function roundRect(x, y, w, h, r) {
  var rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/* ==================== HUD / 遮罩 ==================== */
function hud() {
  if (!elLv) return;
  elLv.textContent = level;
  elCombo.textContent = combo > 0 ? '×' + combo : '—';
  elIdle.textContent = Math.max(0, (idleLimit() - idleMs) / 1000).toFixed(1) + 's';
  elIdle.className = 'value ' + (idleLimit() - idleMs < 2000 ? 'bad' : 'warn');
  elJumps.textContent = jumps;
  elScore.textContent = score;
  var pct = state === 'charge' ? Math.round(100 * chargeMs / chargeCap()) : 0;
  barEl.style.width = pct + '%';
  barTEl.textContent = '力度 ' + pct + '%' + (capped ? ' 满' : '');
  if (btnJump) btnJump.innerHTML = state === 'charge' ? '🚀<span>松手跳</span>' : '🦘<span>按住跳</span>';
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
  show('<div class="ov-emoji">🦘</div><h2>跳一跳</h2>' +
    '<p class="hint"><b>按住画面（或空格）蓄力，松手起跳</b>：蓄得越久跳得越远，' +
    '落点距离就是蓄力时长的函数 —— 满力 ' + chargeCap() + 'ms 能飞 ' + Math.round(distOf(chargeCap())) + 'px。<br>' +
    '落在台子<b>正中白心</b>算完美，连击越高分涨得越凶；踩到边缘只算过；' +
    '<b>一口气串两台</b>有额外分；够不着或者飞过头就直接掉下去。<br>' +
    '最狠的一条：<b>站着不动超过 ' + (idleLimit() / 1000).toFixed(1) + ' 秒判负</b>，所以别磨蹭。' +
    '每 ' + JUMPS_PER_LEVEL + ' 台升一关，台子更窄、距离更远。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开始跳</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function stats() {
  show('<h2>本机战绩</h2><div class="ty-ov">' +
    '<p>最高分 <b>' + Math.max(num('ty.best'), score) + '</b> 分 · 难度 <b>' + D().label + '</b></p>' +
    '<p>这一局：' + score + ' 分 · 第 ' + level + ' 关 · 跳了 ' + jumps + ' 台 · 最长连击 ×' + bestCombo + '</p>' +
    '<p>满力 <b>' + chargeCap() + 'ms = ' + Math.round(distOf(chargeCap())) + 'px</b> · 站桩上限 ' +
    (idleLimit() / 1000).toFixed(1) + 's · 得分倍率 ×' + D().mult + ' · 关卡加成 ×' + levelMult(level).toFixed(2) + '</p>' +
    '<p>累计跳数 <b>' + num('ty.jump') + '</b> 台 · 最高到第 ' + num('ty.lv') + ' 关 · 本局正中 ' + perfects + ' 次</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="' + (phase === 'play' ? 'resume' : 'again') + '">' +
    (phase === 'play' ? '继续跳' : '再来一局') + '</button></div>');
}
function act(name) {
  if (name === 'start') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'again') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'resume') { hide(); paused = false; hud(); return; }
  if (name === 'stats') { stats(); return; }
}
function newRound() {
  score = 0; jumps = 0; combo = 0; bestCombo = 0; perfects = 0; level = 1; lastGain = 0;
  chargeMs = 0; idleMs = 0; capped = false; squash = 0; fallT = 0; flyT = 0;
  paused = false;
  seedBase = (FIXED_SEED || ((Date.now() >>> 0) ^ (Math.floor(Math.random() * 0xffffffff) >>> 0))) >>> 0;
  rnd = rngOf(seedBase);
  runStart = clock;
  camTo = 0; camX = 0;
  newPlats();
  camTo = Math.max(0, px - CAM_X);
  camX = camTo;
  ensurePlats();
  phase = 'play';
  state = 'aim';
  hud();
  msg('第 <b>1</b> 关 · 按住蓄力，松手起跳（站桩限 ' + (idleLimit() / 1000).toFixed(1) + ' 秒）');
}
function togglePause() {
  if (phase !== 'play') return;
  paused = !paused;
  hud();
}

/* ==================== 输入 ==================== */
function press() {
  sfx.resume();
  if (phase === 'intro') { act('start'); return; }
  if (phase === 'over') { act('again'); return; }
  if (paused) return;
  startCharge();
}
function unpress() {
  if (phase !== 'play') return;
  release();
}
if (cv) {
  cv.addEventListener('pointerdown', function (ev) { ev.preventDefault && ev.preventDefault(); press(); });
  cv.addEventListener('pointerup', unpress);
  cv.addEventListener('pointercancel', unpress);
}
window.addEventListener('pointerup', unpress);
window.addEventListener('keydown', function (ev) {
  var k = ev.key;
  if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); return; }
  if (k === 't' || k === 'T') { stats(); return; }
  if (k === 'n' || k === 'N') { newRound(); intro(); return; }
  if (k === 'p' || k === 'P') { togglePause(); return; }
  if (k === ' ' || k === 'Enter') {
    ev.preventDefault && ev.preventDefault();
    if (phase !== 'play') { if (phase === 'intro') act('start'); else if (phase === 'over') act('again'); return; }
    if (paused) return;
    if (!ev.repeat) press();
    return;
  }
  if (k === 'Escape') { paused = true; hud(); return; }
});
window.addEventListener('keyup', function (ev) {
  if (ev.key === ' ' || ev.key === 'Enter') unpress();
});
if (btnJump) {
  btnJump.addEventListener('pointerdown', function (ev) { ev.preventDefault && ev.preventDefault(); press(); });
  btnJump.addEventListener('pointerup', unpress);
}
if (soundBtn) soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });
if (byId('btnStats')) byId('btnStats').addEventListener('click', function () { sfx.resume(); stats(); });
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
      store.set('ty.diff', diff);
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
var rafId = 0;
resize();
if (window.addEventListener) window.addEventListener('resize', resize);
if (cv && 'ResizeObserver' in window) { try { new window.ResizeObserver(resize).observe(cv); } catch (e) { /* 老浏览器忽略 */ } }
newRound();
phase = 'intro';
intro();
syncSound();
syncDiff();
if (window.requestAnimationFrame) rafId = window.requestAnimationFrame(draw);
})();
