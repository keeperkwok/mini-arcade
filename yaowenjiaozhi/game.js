/* 咬文嚼字 —— 一串没有标点的字，刀落在哪儿，意思就是什么
   机制：每句都藏着你想象不到的几种断法。在字缝里下刀，按「这样读」试一次，
   吃一口粮；把这一句所有能读通的断法全咬出来才算过。语料全部来自
   真实流传的对联/课文断句考点/教材歧义例句，读法由标点版反推断点，
   测试会逐条核对（剥掉标点必须等于原串、几种读法的断点不得重复）。
   纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 语料 ====================
   s = 无标点原串；q = 某种读法的标点版（断点由它反推）；
   x = main 本意 / alt 别解 / mis 课文点名的常见误读；g = 白话解释 */
var POOL = [
  { s: '明日逢春好不晦气', lv: 1, t: '解缙春联', r: [
    { x: 'main', q: '明日逢春好，不晦气。', g: '好兆头的读法：明日立春，天气好，一点都不晦气。' },
    { x: 'alt', q: '明日逢春，好不晦气。', g: '刀口挪一格，「好不」连读就成了「好不晦气」——整句反了。' } ] },
  { s: '终年倒运少有余财', lv: 1, t: '解缙春联', r: [
    { x: 'main', q: '终年倒运少，有余财。', g: '一年到头倒霉事少，还有余钱。' },
    { x: 'alt', q: '终年倒运，少有余财。', g: '换个地方下刀：整年走霉运，难得有几个钱。' } ] },
  { s: '我要炒米饭', lv: 1, t: '饭馆与厨房', r: [
    { x: 'main', q: '我要，炒米饭。', g: '饭馆点菜：给我来一份炒米饭。' },
    { x: 'alt', q: '我要炒，米饭。', g: '厨房里揽活：这盘米饭归我炒。' } ] },
  { s: '今齐地方千里', lv: 1, t: '《邹忌讽齐王纳谏》', r: [
    { x: 'main', q: '今齐地，方千里。', g: '正解：如今齐国的土地，方圆千里。地＝土地，方＝方圆。' },
    { x: 'mis', q: '今齐，地方千里。', g: '课文点名的误读：把「地方」当成今天这一个词。' } ] },
  { s: '咬死了猎人的狗', lv: 1, t: '中学语法例句', r: [
    { x: 'main', q: '咬死了，猎人的狗。', g: '死的是狗：猎人养的那条狗被咬死了。' },
    { x: 'alt', q: '咬死了猎人的，狗。', g: '死的是人：那条狗把主人咬死了。' } ] },
  { s: '三个学校的老师', lv: 1, t: '中学语法例句', r: [
    { x: 'main', q: '三个，学校的老师。', g: '数人头：老师一共三位。' },
    { x: 'alt', q: '三个学校的，老师。', g: '数校门：老师分别来自三所学校。' } ] },

  { s: '南京市长江大桥', lv: 2, t: '断句笑话', r: [
    { x: 'main', q: '南京市，长江大桥。', g: '地名：南京的长江大桥。' },
    { x: 'alt', q: '南京市长，江大桥。', g: '这一句的命门：市长姓江，名大桥。' } ] },
  { s: '其一犬坐于前', lv: 2, t: '《狼》', r: [
    { x: 'main', q: '其一，犬坐于前。', g: '正解：其中一只狼像狗那样蹲在前面。犬＝像狗一样。' },
    { x: 'mis', q: '其一犬，坐于前。', g: '常见误读：变成「其中一条狗坐在前面」。' } ] },
  { s: '中间力拉崩倒之声', lv: 2, t: '《口技》', r: [
    { x: 'main', q: '中，间力拉崩倒之声。', g: '正解：里面夹杂着噼里啪啦崩塌的声音。间＝夹杂。' },
    { x: 'mis', q: '中间，力拉崩倒之声。', g: '误读：把「中间」当方位词，「间」就不是夹杂了。' } ] },
  { s: '下雨天留客天留人不留', lv: 2, t: '待客条子', r: [
    { x: 'main', q: '下雨天留客，天留，人不留。', g: '主人贴条的本意：老天要留你，我可不留。' },
    { x: 'alt', q: '下雨，天留客；天留，人不留。', g: '多咬一口：雨天客难走，天意留而主人不留，念着更酸。' },
    { x: 'alt', q: '下雨天，留客天，留人不？留！', g: '客人重新一断：这种天正是留客天，留不留？留！' } ] },
  { s: '床前明月光疑是地上霜', lv: 2, t: '《静夜思》', r: [
    { x: 'main', q: '床前明月光，疑是地上霜。', g: '五言一句，通行的印本。' },
    { x: 'alt', q: '床前，明月光；疑是，地上霜。', g: '吟诵的断法：二三节奏一拆，两句变四个景。' } ] },
  { s: '清明时节雨纷纷路上行人欲断魂', lv: 2, t: '《清明》', r: [
    { x: 'main', q: '清明时节雨纷纷，路上行人欲断魂。', g: '杜牧《清明》的常读。' },
    { x: 'alt', q: '清明。时节雨纷纷。路上行人，欲断魂。', g: '把七言断成小令：节气单独一顿，画面立刻散了。' } ] },

  { s: '民可使由之不可使知之', lv: 3, t: '《论语》', r: [
    { x: 'main', q: '民可使由之，不可使知之。', g: '传统读法：可以让百姓照着走，不必让他们懂得为什么。' },
    { x: 'alt', q: '民可使，由之；不可使，知之。', g: '近代重读：能使就顺着使，不能使就先教会——一句变成政策。' } ] },
  { s: '无鸡鸭亦可无鱼肉亦可青菜一碟足矣', lv: 3, t: '请客帖子', r: [
    { x: 'main', q: '无鸡鸭亦可，无鱼肉亦可，青菜一碟足矣。', g: '主人念成省吃俭用：鸡鸭鱼肉都不要，一碟青菜就够。' },
    { x: 'alt', q: '无鸡，鸭亦可；无鱼，肉亦可；青菜一碟，足矣。', g: '客人念成菜单：没有鸡就要鸭，没有鱼就要肉，另加一碟青菜。' } ] },
  { s: '枯藤老树昏鸦小桥流水人家', lv: 3, t: '《天净沙·秋思》', r: [
    { x: 'main', q: '枯藤老树昏鸦，小桥流水人家。', g: '印本：两组景，逗号一隔。' },
    { x: 'alt', q: '枯藤、老树、昏鸦、小桥、流水、人家。', g: '顿号拆到底：六个名词各自立一幅画，中间一个动词也没有。' } ] }
];

/* ==================== 规则参数 ==================== */
var PTS = { main: 60, alt: 80, mis: 30 };       // 别解比本意值钱：越往后咬越深
var KIND = { main: '本意', alt: '别解', mis: '误读' };
var DIFFS = {
  easy: { label: '先生带读', slack: 5, hints: 5, mult: 0.8 },
  normal: { label: '自己咬', slack: 3, hints: 3, mult: 1 },
  hard: { label: '刀刀见血', slack: 2, hints: 1, mult: 1.4 }
};
var COMBO_STEP = 0.25, COMBO_MAX = 4;

/* ==================== 解析语料：从标点版反推断点 ==================== */
/* 只把汉字当正文，其余符号（，。、；：？！…—）一律视为「刀口」 */
var CJK = /[\u3400-\u4DBF\u4E00-\u9FFF]/;   // 只把汉字当正文，其余符号（，。、；：？！—）一律算刀口
function cutsOf(q, s) {
  var cuts = [], raw = '', afterPunct = false, i, c;
  for (i = 0; i < q.length; i++) {
    c = q.charAt(i);
    if (CJK.test(c)) {
      if (afterPunct && raw.length) cuts.push(raw.length);
      raw += c;
      afterPunct = false;
    } else afterPunct = true;
  }
  if (raw !== s) return null;                       // 标点版必须与原串逐字对得上
  for (i = 0; i < cuts.length; i++) if (cuts[i] <= 0 || cuts[i] >= s.length) return null;
  return cuts;
}

var ITEMS = [];
(function build() {
  for (var i = 0; i < POOL.length; i++) {
    var p = POOL[i], rs = [], seen = {};
    for (var k = 0; k < p.r.length; k++) {
      var cuts = cutsOf(p.r[k].q, p.s);
      if (!cuts) continue;                          // 数据写错就丢掉这一种读法，绝不让玩家撞上死题
      var sig = cuts.join(',');
      if (seen[sig]) continue;
      seen[sig] = 1;
      rs.push({ x: p.r[k].x, q: p.r[k].q, g: p.r[k].g, cuts: cuts, sig: sig });
    }
    if (rs.length < 2) continue;
    ITEMS.push({ id: i, s: p.s, lv: p.lv, t: p.t, r: rs });
  }
})();
var READ_TOTAL = (function () { var n = 0; for (var i = 0; i < ITEMS.length; i++) n += ITEMS[i].r.length; return n; })();

/* ==================== DOM / 音效 / 存储 ==================== */
function byId(id) { return document.getElementById(id); }
var lineEl = byId('line');
var marksEl = byId('marks');
var msgEl = byId('msg');
var srcEl = byId('src');
var overlayEl = byId('overlay');
var ovContent = byId('overlayContent');
var elLv = byId('lv'); var elProg = byId('prog'); var elBites = byId('bites'); var elScore = byId('score');
var elHintN = byId('hintN');

var SILENT = { tone: function () {}, melody: function () {}, noise: function () {},
  toggle: function () { return true; }, isMuted: function () { return true; },
  setMuted: function () {}, resume: function () {} };
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'yao.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var store = {
  get: function (k, dflt) {
    try { var v = localStorage.getItem(k); return v === null ? dflt : v; }
    catch (e) { return dflt; }
  },
  set: function (k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* 无痕模式下静默降级 */ } },
};
function num(k) { var v = parseInt(store.get(k, '0'), 10); return isNaN(v) ? 0 : v; }

/* ==================== 局面 ==================== */
var diff = 'normal';
var phase = 'intro';
var level = 1;             // 第几句
var item = null;           // 当前句
var gaps = [];             // 每个字缝：0 不断 / 1 断成句读 / 2 断成顿号（只看出刀位置，不看符号）
var found = [];            // 每种读法是否已咬出
var bites = 0;             // 口粮：每次试读吃一口，读不通也吃
var score = 0;
var combo = 0;
var hints = 0;
var runFound = 0;          // 本局咬出的读法数
var dex = {};              // '句id:断点' → 1，跨局收藏
var queue = [];
var flash = null;          // 最近一次咬出的读法，用于高亮

function shuffle(a) {
  var r = a.slice(), i, j, t;
  for (i = r.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    t = r[i]; r[i] = r[j]; r[j] = t;
  }
  return r;
}
function tierFor(lv) { return lv < 5 ? 1 : lv < 10 ? 2 : 3; }
function nextItem() {
  if (!queue.length) {
    var pool = [], t = tierFor(level), i;
    for (i = 0; i < ITEMS.length; i++) if (ITEMS[i].lv === t) pool.push(i);
    if (!pool.length) for (i = 0; i < ITEMS.length; i++) pool.push(i);
    queue = shuffle(pool);
  }
  return ITEMS[queue.shift()];
}
function cutList() {
  var out = [], i;
  for (i = 0; i < gaps.length; i++) if (gaps[i] > 0) out.push(i + 1);
  return out;
}
function unfoundIdx() {
  var out = [], i;
  for (i = 0; i < item.r.length; i++) if (!found[i]) out.push(i);
  return out;
}

/* ==================== 判定 ==================== */
function submit() {
  if (phase !== 'play' || !item) return;
  if (!unfoundIdx().length) { say('这一句已经咬完，等下一句'); return; }
  var cut = cutList();
  if (!cut.length) { say('一个字都没断开，那不叫读 —— 先下刀'); sfx.noise(0.1, 0.1); return; }
  var sig = cut.join(','), hit = -1, dup = -1, i;
  for (i = 0; i < item.r.length; i++) if (item.r[i].sig === sig) { if (found[i]) dup = i; else hit = i; break; }
  if (dup >= 0) { say('这一种早咬出来了：<b>' + item.r[dup].q + '</b>'); return; }

  bites--;
  if (hit >= 0) {
    found[hit] = 1;
    combo++;
    runFound++;
    var r = item.r[hit];
    var gain = Math.round(PTS[r.x] * DIFFS[diff].mult * (1 + Math.min(combo - 1, COMBO_MAX) * COMBO_STEP));
    score += gain;
    var key = item.id + ':' + r.sig;
    if (!dex[key]) { dex[key] = 1; saveDex(); }
    flash = hit;
    sfx.melody(r.x === 'mis' ? [[392, 0.08], [330, 0.14]] : [[659, 0.06], [880, 0.06], [1174, 0.12]]);
    say('<b>' + r.q + '</b> ' + KIND[r.x] + ' +' + gain + ' —— ' + r.g);
    hud(); render();
    if (!unfoundIdx().length) { clearItem(); return; }
    if (bites <= 0) { gameOver('口粮尽了'); return; }
    return;
  }

  combo = 0;
  sfx.tone(200, 0.12, 'sawtooth', 0.14, 0, 120);
  say(nearMiss(cut));
  hud(); render();
  if (bites <= 0) gameOver('口粮尽了');
}

/* 读不通也要给信息：离最近的一种还差几刀、多几刀 */
function nearMiss(cut) {
  var left = unfoundIdx(), best = null, i, j;
  for (i = 0; i < left.length; i++) {
    var cs = item.r[left[i]].cuts, miss = 0, extra = 0;
    for (j = 0; j < cs.length; j++) if (cut.indexOf(cs[j]) < 0) miss++;
    for (j = 0; j < cut.length; j++) if (cs.indexOf(cut[j]) < 0) extra++;
    if (!best || miss + extra < best.miss + best.extra) best = { miss: miss, extra: extra };
  }
  if (!best) return '读不通';
  if (!best.miss && best.extra) return '方向对了，多切 <b>' + best.extra + '</b> 刀 —— 再碎下去句子就散了';
  if (!best.extra && best.miss) return '咬到肉了，还差 <b>' + best.miss + '</b> 刀';
  return '差 <b>' + best.miss + '</b> 刀没切，另有 <b>' + best.extra + '</b> 刀落错了地方';
}

function clearItem() {
  var bonus = 40 + bites * 6;
  score += bonus;
  var first = !dex['done' + item.id];
  if (first) { dex['done' + item.id] = 1; score += 40; saveDex(); }
  store.set('yao.best', Math.max(num('yao.best'), score));
  store.set('yao.level', Math.max(num('yao.level'), level));
  say('本句 ' + item.r.length + ' 种读法全咬通了' + (first ? ' · 首通 +40' : '') + ' —— 剩 ' + bites + ' 口粮兑 <b>' + bonus + '</b>');
  sfx.melody([[523, 0.07], [659, 0.07], [784, 0.07], [1046, 0.14]]);
  hud(); render();
  window.setTimeout(function () { if (phase === 'play') { level++; beginItem(); } }, 1700);
}

function hint() {
  if (phase !== 'play' || !item) return;
  if (hints <= 0) { say('先生的提示用完了 —— 自己再咬一口'); return; }
  var left = unfoundIdx(), i, j, cs;
  for (i = 0; i < left.length; i++) {                  // 先补一刀：某一种读法该断而你没断的地方
    cs = item.r[left[i]].cuts;
    for (j = 0; j < cs.length; j++) {
      if (gaps[cs[j] - 1]) continue;
      gaps[cs[j] - 1] = 1;
      hints--;
      say('先生补一刀：第 <b>' + cs[j] + '</b> 个字后面该断');
      sfx.tone(520, 0.09, 'sine', 0.14);
      hud(); render();
      return;
    }
  }
  for (i = 0; i < left.length; i++) {                  // 都断上了，就擦掉一处多出来的
    cs = item.r[left[i]].cuts;
    for (j = 0; j < gaps.length; j++) {
      if (!gaps[j] || cs.indexOf(j + 1) >= 0) continue;
      gaps[j] = 0;
      hints--;
      say('先生擦一刀：第 <b>' + (j + 1) + '</b> 个字后面不该断');
      sfx.tone(420, 0.09, 'sine', 0.14);
      hud(); render();
      return;
    }
  }
  say('该断的地方都在你手里了，剩下的是另一种读法');
}

/* ==================== 开局 / 换句 / 结算 ==================== */
function beginItem() {
  item = nextItem();
  gaps = [];
  found = [];
  for (var i = 0; i < item.s.length - 1; i++) gaps.push(0);
  for (i = 0; i < item.r.length; i++) found.push(0);
  bites = item.r.length + DIFFS[diff].slack;
  flash = null;
  say('这一句共 <b>' + item.r.length + '</b> 种读法，全部咬出来才往下走');
  srcEl.textContent = '· ' + item.t + ' ·';
  renderLine();
  hud(); render();
}

function newRun(key) {
  if (key && DIFFS[key]) diff = key;
  phase = 'play';
  level = 1;
  score = 0;
  combo = 0;
  runFound = 0;
  queue = [];
  hints = DIFFS[diff].hints;
  store.set('yao.diff', diff);
  hideOverlay();
  beginItem();
  markDiff();
}

function gameOver(reason) {
  if (phase === 'over') return;
  phase = 'over';
  store.set('yao.best', Math.max(num('yao.best'), score));
  store.set('yao.level', Math.max(num('yao.level'), level));
  var miss = unfoundIdx(), i, list = '';
  for (i = 0; i < miss.length; i++) {
    var r = item.r[miss[i]];
    list += '<div class="yw-ans"><b>' + r.q + '</b><span>' + KIND[r.x] + ' · ' + r.g + '</span></div>';
  }
  sfx.melody([[440, 0.12], [330, 0.14], [220, 0.22]]);
  ovContent.innerHTML = '<div class="ov-emoji">🦷</div><h2>' + (reason || '口粮尽了') + '</h2>' +
    '<p class="hint">这一句还剩 ' + miss.length + ' 种读法没咬出来：</p>' + list +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">读到第 ' + level + ' 句 · 本局咬出 ' + runFound + ' 种读法</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再咬一遍</button>' +
    '<button class="ghost" data-act="stats">看战绩</button></div>';
  overlayEl.classList.add('show');
  hud();
}

function showStats() {
  ovContent.innerHTML = '<div class="ov-emoji">📖</div><h2>本机战绩</h2>' +
    '<div class="yw-list">最高分 <b>' + num('yao.best') + '</b><br>最远读到第 <b>' + num('yao.level') + '</b> 句<br>' +
    '历代累计咬出 <b>' + dexReadings() + '</b> 种读法<br>语料共 ' + ITEMS.length + ' 句 / ' + READ_TOTAL + ' 种读法</div>' +
    '<div class="ov-actions"><button class="primary" data-act="close">继续</button>' +
    '<button class="ghost" data-act="again">重新开始</button></div>';
  overlayEl.classList.add('show');
}

function showIntro() {
  phase = 'intro';
  ovContent.innerHTML = '<div class="ov-emoji">🦷</div><h2>咬文嚼字</h2>' +
    '<p class="hint">同一串没有标点的字，<b>刀落在哪儿，意思就是什么</b>。<br>' +
    '「下雨天留客天留人不留」，主人念是逐客，客人念是赖着不走。<br>' +
    '每一句都藏着两三种读法，点字缝下刀，按<b>这样读</b>试一次吃一口粮，<br>' +
    '把一句的所有读法全咬出来才算过关。</p>' +
    '<p class="hint">语料 ' + ITEMS.length + ' 句、' + READ_TOTAL + ' 种读法，取自对联、课文断句考点与教材歧义例句。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开咬</button></div>';
  overlayEl.classList.add('show');
  markDiff();
  hud();
}

function hideOverlay() { overlayEl.classList.remove('show'); }

/* ==================== 渲染 ==================== */
function renderLine() {
  lineEl.innerHTML = '';
  for (var i = 0; i < item.s.length; i++) {
    var z = document.createElement('span');
    z.className = 'zi';
    z.textContent = item.s.charAt(i);
    lineEl.appendChild(z);
    if (i < item.s.length - 1) {
      var gp = document.createElement('button');
      gp.className = 'gap';
      gp.dataset.g = String(i);
      (function (idx) { gp.addEventListener('click', function () { toggleGap(idx); }); })(i);
      lineEl.appendChild(gp);
    }
  }
}

function toggleGap(i) {
  if (phase !== 'play') return;
  sfx.resume();
  gaps[i] = gaps[i] === 0 ? 1 : gaps[i] === 1 ? 2 : 0;
  sfx.tone(gaps[i] ? 660 : 300, 0.05, 'square', 0.1);
  render();
}

function clearGaps() {
  if (phase !== 'play') return;
  for (var i = 0; i < gaps.length; i++) gaps[i] = 0;
  sfx.tone(300, 0.06, 'sine', 0.1);
  render();
}

function render() {
  var kids = lineEl.children, i, n = item ? item.s.length : 0;
  for (i = 0; i < n; i++) {
    var z = kids[i * 2];
    if (!z) continue;
    z.classList.toggle('lit', gaps[i] > 0);
    if (i < n - 1) {
      var g = kids[i * 2 + 1];
      if (g) {
        g.classList.toggle('cut1', gaps[i] === 1);
        g.classList.toggle('cut2', gaps[i] === 2);
        g.textContent = gaps[i] === 1 ? '。' : gaps[i] === 2 ? '、' : '';
      }
    }
  }
  var mk = '', list = item ? item.r : [];
  for (i = 0; i < list.length; i++) {
    var got = !!found[i];
    mk += '<span class="mk' + (got ? ' got' : '') + (i === flash ? ' flash' : '') + (list[i].x === 'mis' && got ? ' wrong' : '') + '">' +
      (got ? KIND[list[i].x] : '？') + '</span>';
  }
  marksEl.innerHTML = mk;
}

function hud() {
  elLv.textContent = String(level);
  elProg.textContent = (item ? found.filter(Boolean).length : 0) + '/' + (item ? item.r.length : 0);
  elBites.textContent = String(bites);
  elScore.textContent = String(score);
  elHintN.textContent = String(hints);
  byId('btnRead').disabled = phase !== 'play';
  byId('btnHint').disabled = phase !== 'play' || hints <= 0;
}

function say(html) { msgEl.innerHTML = html; }

function markDiff() {
  var btns = byId('diff').querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
}

/* 图鉴里既存「某句的某读法」也存「某句整句首通」，计数只数前者 */
function dexReadings() {
  var n = 0, k;
  for (k in dex) if (k.indexOf(':') > 0) n++;
  return n;
}

function saveDex() {
  store.set('yao.dex', Object.keys(dex).join('|'));
  store.set('yao.found', dexReadings());
}

/* ==================== 事件 ==================== */
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

byId('btnRead').addEventListener('click', function () { sfx.resume(); submit(); });
byId('btnHint').addEventListener('click', function () { sfx.resume(); hint(); });
byId('btnClear').addEventListener('click', function () { sfx.resume(); clearGaps(); });
byId('btnStats').addEventListener('click', function () { sfx.resume(); showStats(); });
byId('btnNew').addEventListener('click', function () { sfx.resume(); newRun(); });
soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });

window.addEventListener('keydown', function (e) {
  var k = e.key;
  if (k >= '1' && k <= '9') { if (item && Number(k) - 1 < gaps.length) toggleGap(Number(k) - 1); return; }
  if (k === 'Enter' || k === ' ') { submit(); return; }
  if (k === 'h' || k === 'H') hint();
  else if (k === 'c' || k === 'C') clearGaps();
  else if (k === 't' || k === 'T') showStats();
  else if (k === 'n' || k === 'N') newRun();
  else if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); }
  else if (k === 'Escape') hideOverlay();
});

/* ==================== 启动 ==================== */
(function boot() {
  diff = store.get('yao.diff', 'normal');
  if (!DIFFS[diff]) diff = 'normal';
  hints = DIFFS[diff].hints;
    var raw = store.get('yao.dex', '');
    if (raw) {
      var parts = String(raw).split('|');
      for (var i = 0; i < parts.length; i++) if (parts[i]) dex[parts[i]] = 1;
    }
  item = ITEMS[0];
  gaps = [];
  found = [];
  for (i = 0; i < item.r.length; i++) found.push(0);
  renderLine();
  hud(); render();
  syncSound();
  showIntro();
})();

})();
