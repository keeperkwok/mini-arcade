/* 面馆高峰期 —— 时间管理：一份面要过三道手（🔥 下锅 → 🥘 炒浇头 → 🛎️ 上桌），
   而店里只有一口锅一口炒锅，煮好的面赖在锅里不去加浇头就会坨，坨了只能倒掉。
   机制：① 全场用一个整数「拍」做时钟（1 拍 = 0.1 秒），出单间隔、煮面、炒锅、耐心全部按拍计数，
   所以任何时刻的局面都能逐步推算 —— 只要算得出下一拍谁该干什么，就不会手忙脚乱；
   ② 时段每 60 秒升一级：出单更快、耐心更短，攒到一定时段才会加锅加炒位；
   ③ 分数只跟「上菜时的剩余耐心」和「连击」较劲，信誉扣光就关张。纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 常量与规格 ==================== */
var STEP_MS = 100;              // 一个模拟步长 = 100ms = 1 拍
var RUSH = 600;                 // 一个时段 60 秒
var BOIL = 60;                  // 煮面 6 秒
var SPOIL = 70;                 // 煮好之后再赖锅 7 秒就坨
var WOK = 45;                   // 炒浇头 4.5 秒
var TEA = 60;                   // 送一杯茶：续 6 秒耐心
var COUNTER = 4;                // 出餐台只有 4 个位
var MAXLIVE = 7;                // 店里最多同时 7 张单子
var REP_MAX = 100;
var RUSH_NAMES = ['开门', '早市', '午市', '排队', '翻台', '高峰', '爆单', '打烊前'];
var DISHES = [
  { name: '阳春面', emoji: '🍜', price: 8, pat: 300 },
  { name: '葱油拌面', emoji: '🥢', price: 10, pat: 320 },
  { name: '雪菜肉丝面', emoji: '🥬', price: 12, pat: 330 },
  { name: '大排面', emoji: '🍖', price: 14, pat: 360 },
  { name: '麻酱凉面', emoji: '🥜', price: 12, pat: 300 },
  { name: '酸辣汤面', emoji: '🌶️', price: 11, pat: 310 },
  { name: '鳝丝面', emoji: '🐟', price: 18, pat: 400 },
  { name: '腰花面', emoji: '🫘', price: 20, pat: 430 },
];
var DIFFS = {
  simmer: { label: '慢火', pots: 2, woks: 1, spawn: 1.3, patmul: 1.3, mult: 0.8, rep: 100 },
  noon: { label: '午市', pots: 1, woks: 1, spawn: 1, patmul: 1, mult: 1, rep: 90 },
  rush: { label: '高峰期', pots: 1, woks: 1, spawn: 0.8, patmul: 0.8, mult: 1.7, rep: 80 },
};
var PEN_WALK = 12;              // 客人等超时走人
var PEN_POUR = 5;               // 倒掉一坨面
var PEN_SERVE = 2;              // 正常上菜回一点信誉

function rngOf(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FIXED_SEED：地址栏里写 #seed=数字 就能钉住一整串来客顺序（同一串单子比谁快），不写就是随机
var FIXED_SEED = (function () {
  var m = /seed=(\d+)/.exec((typeof location !== 'undefined' && location.hash) || '');
  return m ? (parseInt(m[1], 10) >>> 0) : 0;
})();

/* ==================== 纯规则：都由 lv / 难度查表，随时可推算 ==================== */
function D() { return DIFFS[diff]; }
function potCap() { return Math.min(3, D().pots + Math.floor(lv / 3)); }
function wokCap() { return Math.min(2, D().woks + (lv >= 4 ? 1 : 0)); }
function spawnGap() { return Math.max(16, Math.round((78 - lv * 6) * D().spawn)); }
function patOf(dish) { return Math.max(110, Math.round((dish.pat - lv * 14) * D().patmul)); }
function rushName(atLv) { return atLv < RUSH_NAMES.length ? RUSH_NAMES[atLv] : '第 ' + (atLv + 1) + ' 轮'; }
function comboMult() { return 1 + Math.min(combo, 6) * 0.25; }
// 上菜那一瞬间的分：菜价 + 剩耐心（最多算 20）× 连击 × 难度倍率
function serveGain(o) {
  var fresh = Math.max(0, Math.min(o.patLeft, 200));
  return Math.max(1, Math.round((o.dish.price + Math.floor(fresh / 10)) * comboMult() * D().mult));
}
function secOf(ticks) { return (ticks / 10).toFixed(1); }
function clockText(t) {
  var s = Math.floor(t / 10);
  return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
}

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
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'mg.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var ordersEl = byId('orders'), potsEl = byId('pots'), woksEl = byId('woks'), cntEl = byId('counter');
var msgEl = byId('msg'), overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elClock = byId('clock'), elRep = byId('rep'), elServed = byId('served');
var elCombo = byId('combo'), elScore = byId('score'), elTea = byId('teaN');
var btnPause = byId('btnPause'), btnTea = byId('btnTea');

/* ==================== 局面 ==================== */
var diff = 'noon';
if (DIFFS[store.get('mg.diff', '')]) diff = store.get('mg.diff', 'noon');
var orders, pots, woks, counter, clock, lv, score, served, lost, poured, combo, bestCombo, rep, tea;
var nextSpawn, seq, phase = 'intro', paused = false, seedBase = 0, rnd = rngOf(1), evLog = [];

function freeIdx(arr) { for (var i = 0; i < arr.length; i++) if (arr[i] === -1) return i; return -1; }
function idxOf(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i] === id) return i; return -1; }
function orderById(id) { for (var i = 0; i < orders.length; i++) if (orders[i].id === id) return orders[i]; return null; }
function live() { return orders.filter(function (o) { return o.state !== 'gone'; }); }
// 卡片顺序：谁耐心少谁排前面，键盘 1~7 跟这个顺序一一对应
function sorted() {
  return live().slice().sort(function (a, b) { return a.patLeft - b.patLeft || a.id - b.id; });
}
function clearSlots(id) {
  var k = idxOf(pots, id); if (k >= 0) pots[k] = -1;
  k = idxOf(woks, id); if (k >= 0) woks[k] = -1;
  k = idxOf(counter, id); if (k >= 0) counter[k] = -1;
}
function log(icon, html) { evLog.unshift({ t: clock, icon: icon, text: html }); if (evLog.length > 24) evLog.pop(); }

function startRun() {
  orders = []; pots = []; woks = []; counter = []; evLog = [];
  for (var c = 0; c < COUNTER; c++) counter.push(-1);
  clock = 0; lv = 0; score = 0; served = 0; lost = 0; poured = 0;
  combo = 0; bestCombo = 0; rep = D().rep; tea = 1; seq = 1;
  seedBase = (FIXED_SEED || Math.floor(Math.random() * 2147483647)) >>> 0;
  rnd = rngOf(seedBase);
  nextSpawn = 12;
  paused = false;
  resizeStations();
  phase = 'open';
  log('🔔', '开张，' + D().label + '档，信誉 <b>' + rep + '</b>');
  hud(); paint(true);
}
function resizeStations() {
  while (pots.length < potCap()) pots.push(-1);
  while (woks.length < wokCap()) woks.push(-1);
}

/* ==================== 每一拍 ==================== */
function step() {
  clock++;
  if (clock % RUSH === 0) {
    lv++;
    tea = Math.min(3, tea + 1);
    resizeStations();
    log('⏰', '进入 <b>' + rushName(lv) + '</b>：锅 ' + potCap() + ' 口 · 炒锅 ' + wokCap() + ' 口 · 间隔 ' + spawnGap() / 10 + ' 秒');
    sfx.tone(660, 0.09, 'triangle', 0.07);
    msg('时段升到 <b>' + rushName(lv) + '</b>：出单更快、耐心更短');
  }
  if (clock >= nextSpawn) {
    spawn();
    nextSpawn = clock + spawnGap();
  }
  var i, o;
  for (i = 0; i < pots.length; i++) {
    o = orderById(pots[i]);
    if (!o) continue;
    o.t++;
    if (o.state === 'boiling' && o.t >= BOIL) {
      o.state = 'cooked';
      sfx.tone(880, 0.05, 'sine', 0.05);
      msg('<b>' + o.dish.name + '</b> 熟了 —— 快去加浇头，赖锅里会坨');
    } else if (o.state === 'cooked' && o.t >= BOIL + SPOIL) {
      o.state = 'burnt';
      log('💀', '<b>' + o.dish.name + '</b> 在锅里坨了');
      sfx.noise(0.14, 0.08);
      msg('坨了…… 这锅只能 <b>倒掉</b> 再重煮');
    }
  }
  for (i = 0; i < woks.length; i++) {
    o = orderById(woks[i]);
    if (!o) continue;
    o.t++;
    if (o.state === 'wokking' && o.t >= WOK) {
      o.state = 'plated';
      if (moveToCounter(o)) woks[i] = -1;    // 出餐台有空位就腾开炒锅
      else msg('出餐台满了，这盘先占着炒锅');
    }
  }
  for (i = 0; i < orders.length; i++) {
    o = orders[i];
    if (o.state === 'gone') continue;
    o.patLeft--;
    if (o.patLeft <= 0) walkout(o);
  }
  hud();
}
function moveToCounter(o) {
  var k = freeIdx(counter);
  if (k < 0) return false;
  counter[k] = o.id;
  return true;
}
function spawn() {
  if (live().length >= MAXLIVE) { msg('店里坐满了 <b>' + MAXLIVE + '</b> 张单子，先把手上的做完'); return; }
  var pick = DISHES[Math.floor(rnd() * DISHES.length) % DISHES.length];
  var pat = patOf(pick);
  var o = { id: seq++, dish: pick, state: 'queue', t: 0, pat: pat, patLeft: pat, born: clock };
  orders.push(o);
  log('🧾', '新单 <b>' + pick.name + '</b>（' + pat / 10 + ' 秒内要端上去）');
  sfx.tone(520, 0.04, 'sine', 0.04);
}
function walkout(o) {
  clearSlots(o.id);
  o.state = 'gone';
  lost++;
  combo = 0;
  rep -= PEN_WALK;
  log('💢', '<b>' + o.dish.name + '</b> 等到天荒地老，客人走了');
  sfx.noise(0.2, 0.1);
  msg('客人 <b>' + o.dish.name + '</b> 拂袖而去：信誉 -' + PEN_WALK);
  checkRep();
}
function checkRep() {
  if (rep > 0) return;
  rep = 0;
  phase = 'over';
  var best = num('mg.best');
  if (score > best) store.set('mg.best', score);
  if (lv > num('mg.lv')) store.set('mg.lv', lv);
  sfx.melody([392, 330, 262], 0.16);
  over();
}

/* ==================== 玩家动作 ==================== */
// 每张卡片当前该干什么，以及能不能干
function actionOf(o) {
  if (o.state === 'queue') return { name: '下锅', cls: '', can: freeIdx(pots) >= 0 && pots.length > 0, why: '灶上 ' + pots.length + ' 口锅全占着 —— 先把熟了的面挪去炒锅' };
  if (o.state === 'boiling') return { name: '煮着呢', cls: 'wait', can: false, why: '还差 <b>' + secOf(BOIL - o.t) + '</b> 秒才熟' };
  if (o.state === 'cooked') return { name: '加浇头', cls: 'done', can: freeIdx(woks) >= 0, why: '炒锅没空 —— 先把手上炒好的端走' };
  if (o.state === 'burnt') return { name: '倒掉', cls: 'bad', can: true, why: '' };
  if (o.state === 'wokking') return { name: '炒着呢', cls: 'wait', can: false, why: '浇头还差 <b>' + secOf(WOK - o.t) + '</b> 秒' };
  if (o.state === 'plated') return { name: '上桌', cls: 'done', can: true, why: '' };
  return { name: '—', cls: 'wait', can: false, why: '' };
}
function refuse(why) {
  sfx.noise(0.05, 0.05);
  if (why) msg(why);
}
function doAction(id) {
  if (phase !== 'open') return false;
  var o = orderById(id);
  if (!o || o.state === 'gone') return false;
  var a = actionOf(o);
  if (!a.can) { refuse(a.why); return false; }
  if (o.state === 'queue') {
    var k = freeIdx(pots);
    pots[k] = o.id;
    o.state = 'boiling';
    o.t = 0;
    sfx.tone(300, 0.05, 'triangle', 0.05);
    msg('<b>' + o.dish.name + '</b> 下锅，' + BOIL / 10 + ' 秒后熟');
  } else if (o.state === 'cooked') {
    var w = freeIdx(woks);
    var pk = idxOf(pots, o.id);
    if (pk >= 0) pots[pk] = -1;
    woks[w] = o.id;
    o.state = 'wokking';
    o.t = 0;
    sfx.tone(520, 0.05, 'square', 0.05);
    msg('<b>' + o.dish.name + '</b> 下炒锅，锅腾出来了');
  } else if (o.state === 'plated') {
    serve(o);
  } else if (o.state === 'burnt') {
    pour(o);
  }
  hud(); paint(true);
  return true;
}
function serve(o) {
  var gain = serveGain(o);
  clearSlots(o.id);
  settleCounter();                 // 台面或炒锅腾出位子，就让赖着的盘子补位
  o.state = 'gone';
  served++;
  store.set('mg.serve', num('mg.serve') + 1);
  score += gain;
  combo++;
  if (combo > bestCombo) bestCombo = combo;
  rep = Math.min(REP_MAX, rep + PEN_SERVE);
  log('🛎️', '<b>' + o.dish.name + '</b> 上桌 +' + gain + '（连击 ×' + comboMult().toFixed(2) + '）');
  sfx.melody([660, 880], 0.06);
  msg('上菜 <b>' + o.dish.name + '</b> +' + gain + ' 分 · 连击 <b>' + combo + '</b>');
}
function pour(o) {
  clearSlots(o.id);
  o.state = 'queue';
  o.t = 0;
  poured++;
  combo = 0;
  rep -= PEN_POUR;
  log('🗑️', '倒掉一坨 <b>' + o.dish.name + '</b>，客人重新点');
  sfx.noise(0.16, 0.09);
  msg('倒掉重做：信誉 -' + PEN_POUR + '，客人还在等');
  checkRep();
}
function settleCounter() {
  for (var i = 0; i < woks.length; i++) {
    var o = orderById(woks[i]);
    if (o && o.state === 'plated' && moveToCounter(o)) woks[i] = -1;
  }
}
function useTea() {
  if (phase !== 'open') return false;
  if (tea <= 0) { refuse('茶用完了 —— 每过一个时段补一杯'); return false; }
  var list = live();
  if (!list.length) { refuse('这会儿没人等'); return false; }
  var t = list[0];
  for (var i = 1; i < list.length; i++) if (list[i].patLeft < t.patLeft) t = list[i];
  tea--;
  var was = t.patLeft;
  t.patLeft = Math.min(t.pat, t.patLeft + TEA);
  log('🍵', '给 <b>' + t.dish.name + '</b> 送茶，续了 ' + (t.patLeft - was) / 10 + ' 秒');
  sfx.tone(980, 0.07, 'sine', 0.05);
  msg('送茶给 <b>' + t.dish.name + '</b>：耐心 +' + (t.patLeft - was) / 10 + ' 秒');
  hud(); paint(true);
  return true;
}
function togglePause() {
  if (phase !== 'open') return;
  paused = !paused;
  sfx.tone(paused ? 420 : 620, 0.04, 'sine', 0.04);
  msg(paused ? '<span class="mg-paused">⏸ 已暂停</span>，锅里的面不会等你' : '继续营业');
  hud();
}

/* ==================== 渲染 ==================== */
var lastSig = '', lastSlotSig = '';
function sigOf() {
  return sorted().map(function (o) { return o.id + ':' + o.state + ':' + actionOf(o).name; }).join('|');
}
function slotSig() {
  var out = [];
  for (var i = 0; i < pots.length; i++) out.push('p' + pots[i] + (pots[i] >= 0 ? ':' + orderById(pots[i]).state : ''));
  for (var j = 0; j < woks.length; j++) out.push('w' + woks[j] + (woks[j] >= 0 ? ':' + orderById(woks[j]).state : ''));
  out.push('c' + counter.join(','));
  return out.join('|');
}
function cardHtml(o, n) {
  var a = actionOf(o);
  var pct = Math.max(0, Math.min(100, Math.round(o.patLeft / o.pat * 100)));
  var mood = o.patLeft / o.pat <= 0.18 ? ' angry' : (o.patLeft / o.pat <= 0.4 ? ' urgent' : '');
  return '<div class="mg-card' + mood + '" data-oid="' + o.id + '">' +
    '<div class="mg-face">' + o.dish.emoji + '</div>' +
    '<div class="mg-body">' +
    '<div class="mg-name">' + o.dish.name + '<i>#' + o.id + ' · ¥' + o.dish.price + ' · ' + n + '</i></div>' +
    '<div class="mg-bar"><i class="mg-bf" style="width:' + pct + '%"></i></div>' +
    '<div class="mg-state">' + stateText(o) + '</div>' +
    '</div>' +
    '<div class="mg-act"><button class="mg-go ' + a.cls + '" data-go="' + o.id + '">' + a.name + '</button></div>' +
    '</div>';
}
function stateText(o) {
  var left = '<b>' + Math.ceil(o.patLeft / 10) + '</b> 秒翻脸';
  if (o.state === 'queue') return '门口等着 · ' + left;
  if (o.state === 'boiling') return '🔥 煮着呢，还差 <b>' + secOf(Math.max(0, BOIL - o.t)) + '</b> 秒熟 · ' + left;
  if (o.state === 'cooked') return '🔥 熟了！赖锅 <b>' + secOf(o.t - BOIL) + '</b> 秒，<b>' + secOf(Math.max(0, BOIL + SPOIL - o.t)) + '</b> 秒后坨';
  if (o.state === 'burnt') return '💀 坨了，占着锅 · ' + left;
  if (o.state === 'wokking') return '🥘 炒浇头，还差 <b>' + secOf(Math.max(0, WOK - o.t)) + '</b> 秒 · ' + left;
  return '🛎️ 做好了等端走 · ' + left;
}
function slotHtml(o, kind) {
  if (!o) return '<div class="mg-slot"><em>空着</em></div>';
  var cls = 'mg-slot busy', fill = 0, sub = '';
  if (kind === 'pot') {
    if (o.state === 'burnt') { cls = 'mg-slot spoil'; fill = 100; sub = '坨了 · 倒掉'; }
    else if (o.state === 'cooked') { cls = 'mg-slot hold'; fill = 100; sub = '熟了 · 加浇头'; }
    else { fill = Math.round(o.t / BOIL * 100); sub = '煮 ' + secOf(o.t) + '/' + secOf(BOIL); }
  } else if (kind === 'wok') {
    if (o.state === 'plated') { cls = 'mg-slot ready'; fill = 100; sub = '出餐台满 · 上桌'; }
    else { cls = 'mg-slot busy'; fill = Math.round(o.t / WOK * 100); sub = '炒 ' + secOf(o.t) + '/' + secOf(WOK); }
  }
  return '<div class="' + cls + '"><em>' + o.dish.emoji + ' ' + o.dish.name + '</em><small>' + sub + '</small>' +
    '<i class="mg-fill" style="width:' + Math.max(0, Math.min(100, fill)) + '%"></i></div>';
}
function paint(force) {
  if (!ordersEl) return;
  var sig = sigOf();
  if (force === true || sig !== lastSig) {
    lastSig = sig;
    var list = sorted(), html = '';
    if (!list.length) html = '<p class="mg-empty">暂时没有客人 —— 先把灶擦干净</p>';
    for (var i = 0; i < list.length; i++) html += cardHtml(list[i], i + 1);
    ordersEl.innerHTML = html;
  } else {
    updateTimes();
  }
  var ss = slotSig();
  if (force === true || ss !== lastSlotSig) {
    lastSlotSig = ss;
    var ps = '';
    for (var p = 0; p < pots.length; p++) ps += slotHtml(orderById(pots[p]), 'pot');
    potsEl.innerHTML = ps;
    var ws = '';
    for (var w = 0; w < woks.length; w++) ws += slotHtml(orderById(woks[w]), 'wok');
    woksEl.innerHTML = ws;
    var cs = '';
    for (var c = 0; c < counter.length; c++) cs += counter[c] === -1
      ? '<div class="mg-slot"><em>空位</em></div>'
      : '<div class="mg-slot ready"><em>' + orderById(counter[c]).dish.emoji + '</em><small>等上桌</small></div>';
    cntEl.innerHTML = cs;
  } else {
    updateSlots();
  }
}
// 占用没变就只刷进度和秒数
function updateSlots() {
  var rows = [[potsEl, pots, 'pot'], [woksEl, woks, 'wok']];
  for (var r = 0; r < rows.length; r++) {
    var nodes = rows[r][0].querySelectorAll('.mg-slot');
    var arr = rows[r][1], kind = rows[r][2];
    for (var i = 0; i < nodes.length && i < arr.length; i++) {
      var o = orderById(arr[i]);
      if (!o) continue;
      var fill = nodes[i].querySelectorAll('.mg-fill')[0];
      var small = nodes[i].querySelectorAll('small')[0];
      var total = kind === 'pot' ? BOIL : WOK;
      if (fill) fill.style.width = Math.max(0, Math.min(100, Math.round(o.t / total * 100))) + '%';
      if (small && o.state === (kind === 'pot' ? 'boiling' : 'wokking')) {
        small.innerHTML = (kind === 'pot' ? '煮 ' : '炒 ') + secOf(o.t) + '/' + secOf(total);
      }
    }
  }
}
// 只改时间和进度条，不重建 DOM（一秒十次，手机上也只动十几个属性）
function updateTimes() {
  var nodes = ordersEl.querySelectorAll('.mg-card');
  var list = sorted();
  for (var i = 0; i < nodes.length && i < list.length; i++) {
    var o = list[i], n = nodes[i];
    var bar = n.querySelectorAll('.mg-bf')[0];
    if (bar) bar.style.width = Math.max(0, Math.min(100, Math.round(o.patLeft / o.pat * 100))) + '%';
    var st = n.querySelectorAll('.mg-state')[0];
    if (st) st.innerHTML = stateText(o);
    var go = n.querySelectorAll('[data-go]')[0];
    if (go) go.innerHTML = actionOf(o).name;
  }
}
function hud() {
  if (!elLv) return;
  elLv.textContent = rushName(lv);
  elClock.textContent = clockText(clock);
  elRep.textContent = rep;
  elRep.className = 'value ' + (rep <= 30 ? 'bad' : (rep <= 60 ? 'warn' : 'good'));
  elServed.textContent = served;
  elCombo.textContent = '×' + comboMult().toFixed(1);
  elScore.textContent = score;
  elTea.textContent = tea;
  if (btnTea) { btnTea.disabled = tea <= 0 || phase !== 'open'; }
  if (btnPause) btnPause.innerHTML = (paused ? '▶' : '⏸') + '<span>' + (paused ? '继续' : '暂停') + '</span>';
}
function msg(html) { if (msgEl) msgEl.innerHTML = html; }

/* ==================== 遮罩 ==================== */
function show(html) {
  if (!ovContent) return;
  ovContent.innerHTML = html;
  overlayEl.classList.add('show');
}
function hide() { if (overlayEl) overlayEl.classList.remove('show'); }
function ovShown() { return overlayEl && overlayEl._cls ? overlayEl._cls.indexOf('show') >= 0 : false; }
function legend() {
  return '<div class="ov-legend"><span>🧾 点单</span><span>🔥 煮 ' + BOIL / 10 + 's</span>' +
    '<span>🥘 炒 ' + WOK / 10 + 's</span><span>💀 赖锅 ' + SPOIL / 10 + 's 就坨</span>' +
    '<span>🍵 续 ' + TEA / 10 + 's</span><span>💢 走人 -' + PEN_WALK + ' 信誉</span></div>';
}
function intro() {
  phase = 'intro';
  hud();
  show('<h2>🍜 面馆高峰期</h2><p>只有 <b>' + D().pots + '</b> 口锅、<b>' + D().woks +
    '</b> 口炒锅。客人进门就掐表：<b>下锅 → 加浇头 → 上桌</b>，三道手一道都不能省。</p>' +
    '<p>面熟了还赖在锅里 <b>' + SPOIL / 10 + ' 秒</b>就坨，坨了只能倒掉重做；客人等超时直接走人，信誉扣光就关张。</p>' +
    legend() +
    '<div class="ov-actions"><button class="primary" data-act="start">开始营业</button></div>');
}
function flowHtml() {
  var out = '';
  for (var i = 0; i < Math.min(evLog.length, 8); i++) {
    out += '<li><span class="t">' + clockText(evLog[i].t) + '</span><span>' + evLog[i].icon + '</span><b>' + evLog[i].text + '</b></li>';
  }
  return out ? '<ul class="mg-log">' + out + '</ul>' : '<p>还没有流水</p>';
}
function stats() {
  show('<h2>📊 本机战绩</h2><p>最高营业额 <b>' + num('mg.best') + '</b> 分 · 累计出餐 <b>' + num('mg.serve') +
    '</b> 碗 · 最远做到 <b>' + rushName(num('mg.lv')) + '</b></p>' +
    '<p>本局：时段 <b>' + rushName(lv) + '</b> · 出餐 <b>' + served + '</b> · 赶走 <b>' + lost +
    '</b> · 倒掉 <b>' + poured + '</b> · 最高连击 <b>×' + (1 + Math.min(bestCombo, 6) * 0.25).toFixed(2) + '</b></p>' +
    flowHtml() +
    '<div class="ov-actions"><button class="primary" data-act="' + (phase === 'over' ? 'again' : 'resume') + '">' +
    (phase === 'over' ? '再来一单' : '继续营业') + '</button></div>');
}
function over() {
  show('<h2>🚪 关张了</h2><p>信誉被扣光，今天做到 <b>' + rushName(lv) + '</b>。</p>' +
    '<div class="mg-flow"><span>营业额</span><b>' + score + ' 分</b><span>出餐</span><b>' + served + ' 碗</b>' +
    '<span>被赶走的客人</span><b>' + lost + ' 位</b><span>倒掉的面</span><b>' + poured + ' 坨</b>' +
    '<span>最高连击</span><b>×' + (1 + Math.min(bestCombo, 6) * 0.25).toFixed(2) + '</b><span>本机最高</span><b>' + num('mg.best') + ' 分</b></div>' +
    flowHtml() +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一单</button>' +
    '<button data-act="stats">看战绩</button></div>');
}
function act(name) {
  if (name === 'start') { sfx.resume(); hide(); startRun(); return; }
  if (name === 'again') { sfx.resume(); hide(); startRun(); return; }
  if (name === 'resume') { hide(); hud(); paint(true); return; }
  if (name === 'stats') { stats(); return; }
}

/* ==================== 输入 ==================== */
if (ordersEl) {
  ordersEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-go]') : null;
    if (!t) t = ev.target && ev.target.closest ? ev.target.closest('[data-oid]') : null;
    sfx.resume();
    if (!t) return;
    var id = +(t.dataset.go !== undefined && t.dataset.go !== null ? t.dataset.go : t.dataset.oid);
    doAction(id);
  });
}
if (btnPause) btnPause.addEventListener('click', togglePause);
if (btnTea) btnTea.addEventListener('click', useTea);
if (byId('btnStats')) byId('btnStats').addEventListener('click', stats);
if (soundBtn) soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });
if (overlayEl) {
  overlayEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (t) act(t.dataset.act);
  });
}
if (window.addEventListener) {
  window.addEventListener('keydown', function (ev) {
    var k = ev.key;
    if (k === 'Escape') { if (ovShown()) { act('resume'); } return; }
    if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); return; }
    if (k === 't' || k === 'T') { stats(); return; }
    if (k === 'n' || k === 'N') { newRound(); return; }
    if (phase === 'intro') { if (k === 'Enter' || k === ' ') act('start'); return; }
    if (phase === 'over') { if (k === 'Enter' || k === ' ') act('again'); return; }
    if (k === ' ' || k === 'p' || k === 'P') { togglePause(); return; }
    if (k === 'q' || k === 'Q') { useTea(); return; }
    if (phase !== 'open' || paused) return;
    if (k >= '1' && k <= '9') {
      var list = sorted();
      var idx = +k - 1;
      if (idx < list.length) doAction(list[idx].id);
      else msg('第 <b>' + k + '</b> 号位子上没人');
    }
  });
}
(function () {
  var btns = byId('diff') ? byId('diff').querySelectorAll('[data-diff]') : [];
  for (var i = 0; i < btns.length; i++) {
    (function (b) {
      b.addEventListener('click', function () {
        diff = b.dataset.diff;
        store.set('mg.diff', diff);
        syncDiff();
        newRound();
      });
    })(btns[i]);
  }
})();
function syncDiff() {
  var btns = byId('diff').querySelectorAll('[data-diff]');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
}
function newRound() { startRun(); intro(); }

/* ==================== 主循环：整数拍，暂停/开遮罩就冻住 ==================== */
var prev = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
var acc = 0, rafId = 0;
function running() { return phase === 'open' && !paused && !ovShown(); }
function frame(now) {
  rafId = window.requestAnimationFrame(frame);
  var dt = Math.min(now - prev, 2000);
  if (dt < 0) dt = 0;
  prev = now;
  if (!running()) { acc = 0; return; }
  acc += dt;
  var guard = 0;
  while (acc >= STEP_MS && guard++ < 30) { acc -= STEP_MS; step(); }
  if (acc > STEP_MS * 30) acc = 0;
  paint();
}
if (window.requestAnimationFrame) rafId = window.requestAnimationFrame(frame);

/* ==================== 开局 ==================== */
syncSound();
syncDiff();
startRun();
intro();
})();
