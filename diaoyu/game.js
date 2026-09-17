/* 钓鱼佬 —— 两段式钓鱼：① 咬钩那一下拼反应（提竿窗口）② 搏鱼拼张力管理
   机制：按住收线 → 张力涨、线长缩；松手 → 张力掉、鱼往外切。鱼会「猛窜」，窜的时候硬拉必断线；
   每窜一次它自己也要掉一层劲（stamina），耐心遛几轮就能把线长收到 0。断线扣一副线，线用完收竿；
   天光计时结束也收竿。纯前端零依赖，搏鱼模型是纯数值，可逐 tick 核对。 */
(function () {
'use strict';

/* ==================== 鱼情数据 ==================== */
var LAYERS = [
  { name: '浅滩', tag: '🌿', depth: 9 },
  { name: '中层', tag: '🪸', depth: 15 },
  { name: '深潭', tag: '🌑', depth: 21 },
];
var SPECIES = [
  { n: '麦穗', e: '🐟', L: 0, lo: 15, hi: 60, price: 9, pw: 0.34, w: 30 },
  { n: '白条', e: '🐟', L: 0, lo: 45, hi: 150, price: 11, pw: 0.48, w: 24 },
  { n: '鲫鱼', e: '🐠', L: 0, lo: 150, hi: 700, price: 16, pw: 0.66, w: 15 },
  { n: '翘嘴', e: '🐠', L: 1, lo: 400, hi: 1700, price: 22, pw: 0.84, w: 16 },
  { n: '鲤鱼', e: '🐡', L: 1, lo: 800, hi: 4200, price: 20, pw: 1.02, w: 14 },
  { n: '草鱼', e: '🐊', L: 1, lo: 1500, hi: 7000, price: 24, pw: 1.18, w: 8, nw: 1.3 },
  { n: '黑鱼', e: '🐍', L: 2, lo: 900, hi: 4800, price: 30, pw: 1.28, w: 9, nw: 1.5 },
  { n: '鲢鳙', e: '🐋', L: 2, lo: 2500, hi: 12000, price: 26, pw: 1.38, w: 7, nw: 2.6 },
  { n: '青鱼王', e: '🐳', L: 2, lo: 8000, hi: 32000, price: 46, pw: 1.58, w: 1.5, nw: 4.5 },
];
var DIFFS = {
  dawn: { label: '清晨', time: 200, lines: 5, bite: 1.15, chum: 4, mult: 0.8, big: 0.15, slow: 1.15 },
  noon: { label: '正午', time: 160, lines: 3, bite: 0.8, chum: 3, mult: 1, big: 0.35, slow: 1 },
  night: { label: '夜钓', time: 140, lines: 2, bite: 0.55, chum: 2, mult: 1.8, big: 0.7, slow: 0.9 },
};
/* 搏鱼模型：每一点都可推算 */
var F = {
  tenUp: 30, tenPw: 14, tenBurst: 70,     // 收线时张力涨速（基础 / 随力量 / 猛窜时追加）
  tenDown: 62, tenHold: 0.4,              // 松手掉压；猛窜时松手也掉得慢
  reel: 3.4, reelPw: 0.9, reelBurst: 0.4, // 收线速度（米/秒）
  outBurst: 0.9, outPw: 0.45, outSwim: 0.2, // 鱼往外切的速度
  fatigue: 0.2, fightMax: 40, tenSafe: 78,
};

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
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'dy.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var sceneEl = byId('scene'), bobEl = byId('bob'), stringEl = byId('string'), shadowEl = byId('shadow');
var fillEl = byId('fill'), stateEl = byId('state'), msgEl = byId('msg');
var elScore = byId('score'), elLines = byId('lines'), elClock = byId('clock');
var elTen = byId('ten'), elDist = byId('dist'), elCombo = byId('combo');

/* ==================== 局面 ==================== */
var phase = 'intro';        // intro / pick / wait / bite / fight / over
var diff = 'noon';
var score = 0;
var lines = 0;
var time = 0;               // 剩余天光（秒）
var combo = 0;
var catchN = 0;
var totalW = 0;
var layer = 0;
var chum = 0;
var fish = null;            // { n, e, pw, price, weight, ... }
var tension = 0;
var dist = 0;
var depth = 0;
var fstate = 'swim';        // swim / rest / burst
var fsTimer = 0;
var stamina = 1;
var bursts = 0;
var fightT = 0;
var reeling = false;
var waitT = 0;
var biteT = 0;
var logList = [];
var bigOne = 0;

function D() { return DIFFS[diff]; }
function rnd(a, b) { return a + Math.random() * (b - a); }
function fmtW(g) { return g >= 1000 ? (g / 1000).toFixed(g >= 10000 ? 0 : 1) + ' 公斤' : Math.round(g) + ' 克'; }
function one(i) { return (Math.random() * i) | 0; }

/* ==================== 鱼情：加权抽签 ==================== */
function weightOf(sp, lv) {
  var d = D(), w = sp.w;
  if (sp.nw > 1) w *= 1 + (sp.nw - 1) * d.big * 3;  // 夜性：越晚越偏大货（逐种族不同偏好，才会改变概率）
  if (sp.L === 2) w *= 0.7 + lv * 0.6;
  return Math.max(0.2, w);
}
function pickFish(lv) {
  var pool = [], i, sum = 0, r;
  for (i = 0; i < SPECIES.length; i++) if (SPECIES[i].L === lv) { var w = weightOf(SPECIES[i], lv); pool.push({ s: SPECIES[i], w: w }); sum += w; }
  r = Math.random() * sum;
  for (i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) return pool[i].s; }
  return pool[pool.length - 1].s;
}
function makeFish(lv) {
  var sp = pickFish(lv), f = {};
  for (var k in sp) if (Object.prototype.hasOwnProperty.call(sp, k)) f[k] = sp[k];
  f.weight = Math.round(rnd(sp.lo, sp.hi) / 5) * 5;
  f.score = gainFor(f, 0);
  return f;
}
function gainFor(f, cb) {
  var base = 20 + f.price * Math.pow(f.weight / 500, 0.7);
  return Math.max(1, Math.round(base * D().mult * (1 + 0.15 * Math.min(cb, 5))));
}

/* ==================== 抛竿 / 咬钩 / 提竿 ==================== */
function setLayer(lv) {
  if (phase !== 'pick' && phase !== 'wait') return;
  layer = Math.max(0, Math.min(LAYERS.length - 1, lv));
  depth = LAYERS[layer].depth;
  if (phase === 'wait') dist = depth;   // 换层后线长跟着水深走
  render(); hud();
}
function cast() {
  if (phase !== 'pick') { if (phase === 'wait') say('竿已经在水里了，等口'); else if (phase === 'bite') strike(); return; }
  sfx.resume();
  phase = 'wait';
  depth = LAYERS[layer].depth;
  waitT = rnd(0.9, 3.4) * D().slow;
  biteT = 0;
  fish = null;
  tension = 0; dist = depth;
  say('抛向' + LAYERS[layer].name + '：' + LAYERS[layer].depth + ' 米水深，等口…（' + LAYERS[layer].name + '里 ' + speciesAt(layer) + '）');
  sfx.tone(300, 0.06, 'sine', 0.1, 0, 160);
  render(); hud();
}
function speciesAt(lv) {
  var out = [], i;
  for (i = 0; i < SPECIES.length; i++) if (SPECIES[i].L === lv) out.push(SPECIES[i].n);
  return out.join(' / ');
}
function chumOnce() {
  if (phase !== 'wait') { say('打窝得在等口的时候打'); return; }
  if (chum <= 0) { say('窝料用完了 —— 剩下的交给耐心'); return; }
  chum--;
  waitT = Math.min(waitT, 0.3);
  sfx.noise(0.12, 0.07);
  say('一把窝料砸下去，水面翻起小泡 —— 口快了');
  hud(); render();
}
function biteNow() {
  phase = 'bite';
  biteT = D().bite;
  bobEl.classList.add('nod');
  sfx.tone(880, 0.05, 'square', 0.12);
  say('🔴 黑漂！<b>提竿</b>（窗口 ' + D().bite.toFixed(2) + ' 秒）');
  hud(); render();
}
function strike() {
  if (phase === 'wait') { waitT += 0.7; say('提早了 —— 竿尖动了动，水面啥也没有（惊了窝，多等 0.7 秒）'); sfx.noise(0.07, 0.06); hud(); return; }
  if (phase !== 'bite') return;
  bobEl.classList.remove('nod');
  fish = makeFish(layer);
  phase = 'fight';
  tension = 18; dist = depth; fstate = 'swim'; fsTimer = rnd(1.4, 2.6);
  stamina = 1; bursts = 0; fightT = 0; reeling = false;
  sfx.tone(520, 0.07, 'triangle', 0.12, 0, 760);
  say('中了！<b>' + fish.n + '</b>（' + fmtW(fish.weight) + '）—— 按住收线，它窜的时候松手');
  hud(); render();
}
function miss() {
  phase = 'wait';
  waitT = rnd(1.1, 3.2) * D().slow;
  bobEl.classList.remove('nod');
  combo = 0;
  sfx.noise(0.14, 0.09);
  say('手慢了 —— 鱼把饵吐了，竿尖只剩一点颤（连竿断了）');
  hud(); render();
}

/* ==================== 搏鱼 ==================== */
function setReel(on) {
  if (phase !== 'fight') return;
  if (reeling === on) return;
  reeling = on;
  if (on) sfx.tone(210, 0.03, 'sawtooth', 0.06);
  render(); hud();
}
function nextFstate() {
  if (fstate === 'burst') { stamina = Math.max(0.15, stamina - F.fatigue); bursts++; }
  if (fstate === 'swim') { fstate = 'rest'; fsTimer = rnd(0.6, 1.3); }
  else if (fstate === 'rest') { fstate = 'burst'; fsTimer = rnd(0.45, 1.05) * (0.7 + 0.6 * stamina); sfx.noise(0.16, 0.12); }
  else { fstate = 'swim'; fsTimer = rnd(1.4, 2.8); }
}
function powerNow() { return (fish ? fish.pw : 1) * (0.4 + 0.6 * stamina); }

function tick(dt) {
  if (phase === 'wait') {
    waitT -= dt;
    if (waitT <= 0) biteNow();
    return;
  }
  if (phase === 'bite') {
    biteT -= dt;
    if (biteT <= 0) miss();
    return;
  }
  if (phase !== 'fight') return;
  var pw = powerNow();
  if (reeling) {
    tension += (F.tenUp + pw * F.tenPw + (fstate === 'burst' ? F.tenBurst : 0)) * dt;
    dist -= Math.max(0.3, F.reel - pw * F.reelPw) * dt * (fstate === 'burst' ? F.reelBurst : 1);
  } else {
    tension -= F.tenDown * dt * (fstate === 'burst' ? F.tenHold : 1);
    if (fstate === 'burst') dist += (F.outBurst + pw * F.outPw) * dt;
    else if (fstate === 'swim') dist += F.outSwim * (0.5 + pw) * dt;
  }
  if (tension < 0) tension = 0;
  if (dist > depth * 1.5) dist = depth * 1.5;
  fightT += dt;
  fsTimer -= dt;
  if (fsTimer <= 0) nextFstate();
  if (tension >= 100) { snap(); return; }
  if (fightT >= F.fightMax) { letgo(); return; }
  if (dist <= 0) { dist = 0; land(); return; }
}

function snap() {
  phase = 'pick';
  reeling = false;
  lines--;
  combo = 0;
  bobEl.classList.remove('nod');
  sfx.noise(0.3, 0.2);
  say('啪 —— <b>断线了</b>！' + (fish ? fish.n : '那条鱼') + ' 带着钩走了（还剩 ' + lines + ' 副线）');
  if (lines <= 0) { hud(); gameOver('鱼线用完了'); return; }
  hud(); render();
}
function letgo() {
  phase = 'pick';
  reeling = false;
  combo = 0;
  sfx.noise(0.18, 0.1);
  say(F.fightMax + ' 秒没遛上来，<b>' + fish.n + '</b> 把钩吐了 —— 连竿断了');
  hud(); render();
}
function land() {
  var f = fish, gain = gainFor(f, combo);
  phase = 'pick';
  reeling = false;
  score += gain; combo++; catchN++; totalW += f.weight;
  bigOne = Math.max(bigOne, f.weight);
  logList.unshift({ n: f.n, e: f.e, w: f.weight, s: gain });
  if (logList.length > 8) logList.pop();
  store.set('dy.best', Math.max(num('dy.best'), score));
  store.set('dy.catch', num('dy.catch') + 1);
  store.set('dy.big', Math.max(num('dy.big'), f.weight));
  sfx.melody([[523, 0.07], [659, 0.07], [880, 0.13]]);
  say('起鱼！<b>' + f.e + ' ' + f.n + ' ' + fmtW(f.weight) + '</b> · +' + gain + ' 分' + (combo > 1 ? '（连竿 ×' + (1 + 0.15 * Math.min(combo - 1, 5)).toFixed(2) + '）' : ''));
  hud(); render();
}

/* ==================== 渲染与提示 ==================== */
var STATE_CN = { swim: '🌊 游动', rest: '😐 停口', burst: '💥 猛窜' };
function render() {
  var pct = Math.max(0, Math.min(100, tension));
  fillEl.style.width = pct + '%';
  fillEl.className = 'dy-fill' + (pct >= F.tenSafe ? ' hot' : '');
  var fr = phase === 'fight' ? Math.max(0, Math.min(1, dist / (depth * 1.5))) : (phase === 'wait' || phase === 'bite' ? 1 : 0);
  shadowEl.style.transform = 'translateY(' + (44 + fr * 150).toFixed(1) + 'px)';
  shadowEl.className = 'dy-shadow' + (phase === 'fight' && fstate === 'burst' ? ' burst' : '');
  shadowEl.textContent = phase === 'fight' && fish ? fish.e : '';
  stringEl.style.height = (34 + fr * 150).toFixed(1) + 'px';
  stringEl.className = 'dy-string' + (tension > 60 ? ' taut' : '');
  var ls = byId('water').querySelectorAll('button');
  for (var i = 0; i < ls.length; i++) {
    ls[i].classList.toggle('on', i === layer);
    ls[i].disabled = phase === 'fight';
  }
  byId('layN').textContent = LAYERS[layer].name.slice(0, 1);
  byId('btnCast').disabled = phase === 'fight';
  byId('btnReel').disabled = phase !== 'fight';
  byId('btnChum').disabled = phase !== 'wait' || chum <= 0;
  stateEl.textContent = phase === 'fight'
    ? STATE_CN[fstate] + ' · 线长 ' + dist.toFixed(1) + ' 米 · 张力 ' + Math.round(tension) + '% · 劲 ' + Math.round(stamina * 100) + '%'
    : (phase === 'bite' ? '🔴 黑漂 —— 提竿！' : phase === 'wait' ? '等口中…（打窝能加快上口）' : '先选一层水，再抛竿');
  hud();
}
function hud() {
  elScore.textContent = String(score);
  elLines.textContent = String(lines);
  elClock.textContent = Math.max(0, Math.ceil(time)) + 's';
  elTen.textContent = Math.round(tension) + '%';
  elDist.textContent = dist.toFixed(1);
  elCombo.textContent = String(combo);
  byId('chumN').textContent = String(chum);
  for (var i = 0; i < 3; i++) byId('fa' + i).textContent = i === layer && phase === 'pick' ? '🎯' : '';
}
function say(html) { msgEl.innerHTML = html; }
function markDiff() {
  var btns = byId('diff').querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
}

/* ==================== 全局流转 ==================== */
function newRun(key) {
  if (key && DIFFS[key]) diff = key;
  var d = D();
  phase = 'pick';
  score = 0; lines = d.lines; time = d.time; combo = 0; catchN = 0; totalW = 0;
  chum = d.chum; fish = null; tension = 0; bigOne = 0; logList = [];
  layer = 0; depth = LAYERS[0].depth; dist = depth; reeling = false;
  store.set('dy.diff', diff);
  hideOverlay();
  say('<b>' + d.label + '</b>：' + d.time + ' 秒天光 · ' + d.lines + ' 副线 —— 断完就收竿，分高算赢');
  render(); hud(); markDiff();
}
function gameOver(reason) {
  if (phase === 'over') return;
  phase = 'over';
  reeling = false;
  store.set('dy.best', Math.max(num('dy.best'), score));
  var list = logList.length ? logList.map(function (x) { return '<i>' + x.e + ' ' + x.n + ' ' + fmtW(x.w) + '</i> +' + x.s; }).join('<br>') : '空军一条 —— 明天再来';
  ovContent.innerHTML = '<div class="ov-emoji">🧺</div><h2>' + (reason || '收竿') + '</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">起鱼 ' + catchN + ' 条 · 共 ' + fmtW(totalW) + ' · 最大 ' + fmtW(bigOne) + '</p>' +
    '<div class="dy-list">' + list + '</div>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再战一天</button>' +
    '<button class="ghost" data-act="stats">看战绩</button></div>';
  overlayEl.classList.add('show');
  hud();
}
function showStats() {
  ovContent.innerHTML = '<div class="ov-emoji">📖</div><h2>本机战绩</h2>' +
    '<div class="dy-list">最高分 <b>' + num('dy.best') + '</b><br>累计起鱼 <b>' + num('dy.catch') + '</b> 条<br>' +
    '单条最重 <b>' + fmtW(num('dy.big')) + '</b></div>' +
    '<div class="ov-actions"><button class="primary" data-act="close">继续</button>' +
    '<button class="ghost" data-act="again">重新开始</button></div>';
  overlayEl.classList.add('show');
}
function showIntro() {
  phase = 'intro';
  ovContent.innerHTML = '<div class="ov-emoji">🎣</div><h2>钓鱼佬</h2>' +
    '<p class="hint">选一层水抛竿：<b>浅滩</b>多小鱼、<b>深潭</b>藏着大货。<br>' +
    '黑漂那一下要立刻<b>提竿</b>；上了鱼就是<b>张力博弈</b> —— 按住收线张力涨、松手张力掉，' +
    '张力满格<b>啪</b>地断线。<br>' +
    '鱼<b>猛窜</b>的时候松手让它拉：每窜一次它自己掉一层劲，遛到没劲了再收。断线三副用完或者天黑，收竿算分。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">下竿</button></div>';
  overlayEl.classList.add('show');
  markDiff();
  hud();
}
function hideOverlay() { overlayEl.classList.remove('show'); }

/* ==================== 事件 ==================== */
byId('water').addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-l]') : null;
  if (!t) return;
  sfx.resume();
  setLayer(Number(t.dataset.l));
  say('换成' + LAYERS[layer].name + '：' + speciesAt(layer) + ' 在这一层');
});
byId('btnCast').addEventListener('click', function () { sfx.resume(); cast(); });
byId('btnChum').addEventListener('click', function () { sfx.resume(); chumOnce(); });
byId('btnReel').addEventListener('pointerdown', function (e) { if (e && e.preventDefault) e.preventDefault(); sfx.resume(); setReel(true); });
byId('btnReel').addEventListener('pointerup', function () { setReel(false); });
byId('btnReel').addEventListener('pointerleave', function () { setReel(false); });
sceneEl.addEventListener('pointerdown', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-l]') : null;
  if (t) return;
  sfx.resume();
  if (phase === 'bite') strike();
  else if (phase === 'fight') setReel(true);
});
sceneEl.addEventListener('pointerup', function () { setReel(false); });
ovContent.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  var act = t && t.dataset ? t.dataset.act : null;
  if (!act) return;
  sfx.resume();
  if (act === 'start' || act === 'again') newRun();
  else if (act === 'stats') showStats();
  else if (act === 'close') { if (phase === 'over') showIntro(); else hideOverlay(); }
});
byId('diff').addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-diff]') : null;
  if (!t || !t.dataset.diff) return;
  sfx.resume();
  newRun(t.dataset.diff);
});
byId('btnStats').addEventListener('click', function () { sfx.resume(); showStats(); });
byId('btnNew').addEventListener('click', function () { sfx.resume(); newRun(); });
soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });

window.addEventListener('keydown', function (e) {
  var k = (e.key || '').toLowerCase();
  if (k === '1' || k === '2' || k === '3') { setLayer(Number(k) - 1); return; }
  if (k === 'c') { cast(); return; }
  if (k === 'h') { chumOnce(); return; }
  if (k === ' ') {
    if (phase === 'bite') strike();
    else if (phase === 'fight') setReel(true);
    else cast();
    e.preventDefault();
    return;
  }
  if (k === 't') { showStats(); return; }
  if (k === 'n') { newRun(); return; }
  if (k === 'm') { sfx.toggle(); syncSound(); return; }
  if (k === 'escape') { if (phase === 'over') hideOverlay(); return; }
});
window.addEventListener('keyup', function (e) { if ((e.key || '').toLowerCase() === ' ') setReel(false); });

/* ==================== 主循环 ==================== */
function frame() {
  var dt = 0.04;
  if (phase === 'over' || phase === 'intro') return;
  if (phase !== 'pick') {
    time -= dt;
    if (time <= 0) { time = 0; render(); gameOver('天黑了，收竿'); return; }
  }
  tick(dt);
  render();
}

/* ==================== 启动 ==================== */
(function boot() {
  diff = store.get('dy.diff', 'noon');
  if (!DIFFS[diff]) diff = 'noon';
  lines = D().lines;
  time = D().time;
  chum = D().chum;
  depth = LAYERS[layer].depth;
  dist = depth;
  render();
  syncSound();
  showIntro();
  window.setInterval(frame, 40);
})();

})();
