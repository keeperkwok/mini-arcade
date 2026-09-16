/* 三校 —— 校对错别字换稿费
   规则核心：每段稿子里埋着真实常被写错的字，圈对赚钱、圈错扣钱扣时间；
   截稿前清不干净就退稿（消耗退稿机会），稿费扣穿也完蛋。
   语料与锚点全部内置，锚点用「上下文两串只差一个字」定位，测试会逐段核对。
   纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 稿库：p = 含错别字的原文，e = [[错处上下文, 正处上下文]] ====================
   锚点规则：两个上下文等长、只差一个字，程序按「第一个不同的位置」定位错字。
   所以每处 e 都是真的常见错别字，其余文字必须完全正确。 */
var DOCS = [
  /* ---- 第一档：一处错，句子短 ---- */
  { t: 1, p: '他跑的太快了，一会儿就到。', e: [['的太快', '得太快']] },
  { t: 1, p: '你在说一遍，我没听清。', e: [['你在说', '你再说']] },
  { t: 1, p: '请大家座下，演出就要开始了。', e: [['家座下', '家坐下']] },
  { t: 1, p: '我们要珍昔时间，不要浪费。', e: [['珍昔时', '珍惜时']] },
  { t: 1, p: '今天天汽真好，我们去爬山。', e: [['天天汽', '天天气']] },
  { t: 1, p: '他穿着一件新衣夫，很不合身。', e: [['衣夫，', '衣服，']] },
  { t: 1, p: '我们一起到公圆里放风筝。', e: [['公圆里', '公园里']] },
  { t: 1, p: '他学习非常刻若，成绩最好。', e: [['刻若，', '刻苦，']] },
  { t: 1, p: '他终于名白过来，笑了。', e: [['名白过', '明白过']] },
  { t: 1, p: '妈妈做了一桌子好才。', e: [['好才。', '好菜。']] },

  /* ---- 第二档：两处错 ---- */
  { t: 2, p: '他既使遇到再多困难，也从来不放气。', e: [['既使遇', '即使遇'], ['不放气', '不放弃']] },
  { t: 2, p: '他忙禄得忘了吃饭，一回家就体息。', e: [['忙禄得', '忙碌得'], ['就体息', '就休息']] },
  { t: 2, p: '天气干躁，人也容易急燥。', e: [['干躁，', '干燥，'], ['急燥。', '急躁。']] },
  { t: 2, p: '老师鼓厉我们再接再励。', e: [['鼓厉我', '鼓励我'], ['再接再励', '再接再厉']] },
  { t: 2, p: '他全神惯注地听着，叹了口汽。', e: [['惯注地', '贯注地'], ['口汽。', '口气。']] },
  { t: 2, p: '街上人穿流不息，他迫不急待地赶回去。', e: [['穿流不', '川流不'], ['不急待', '不及待']] },
  { t: 2, p: '昨天开暮式上，他上台赞杨了两位老人。', e: [['开暮式', '开幕式'], ['赞杨了', '赞扬了']] },
  { t: 2, p: '他以为自己走头无路，一心想要抱复。', e: [['走头无', '走投无'], ['抱复。', '报复。']] },
  { t: 2, p: '他迟到的毛病变本加利，大家无可耐何。', e: [['加利，', '加厉，'], ['无可耐何', '无可奈何']] },
  { t: 2, p: '他说完，教室里响起一片掌生，他感概地笑了。', e: [['片掌生', '片掌声'], ['感概地', '感慨地']] },
  { t: 2, p: '领导布署了今年的工作，希望双方融恰相处。', e: [['布署了', '部署了'], ['融恰相', '融洽相']] },
  { t: 2, p: '会议按步就班地进行，大家一如继往地认真。', e: [['按步就', '按部就'], ['一如继往', '一如既往']] },

  /* ---- 第三档：更隐蔽的错 ---- */
  { t: 3, p: '他要学会自已面对这些问题。', e: [['自已面', '自己面']] },
  { t: 3, p: '谁也说不清末来会是什么样子。', e: [['清末来', '清未来']] },
  { t: 3, p: '那栋危楼去年就折除了。', e: [['就折除', '就拆除']] },
  { t: 3, p: '他勤勤恳恳一辈子，就为一家人辛福。', e: [['人辛福', '人幸福']] },
  { t: 3, p: '请你把话说得准却一点。', e: [['准却一', '准确一']] },
  { t: 3, p: '我们要尊守规则，也要遵敬老师。', e: [['尊守规', '遵守规'], ['遵敬老', '尊敬老']] },
  { t: 3, p: '他采取的错施很有效，也把身病当成了考验。', e: [['错施很', '措施很'], ['身病当', '生病当']] },
  { t: 3, p: '他坚持锻练了三十年，情况了解得很清处。', e: [['锻练了', '锻炼了'], ['清处。', '清楚。']] },
  { t: 3, p: '他从小被称为小聪名，成计一直很好。', e: [['聪名，', '聪明，'], ['成计一', '成绩一']] },
  { t: 3, p: '他在这个向目上拿了第一，高心极了。', e: [['向目上', '项目上'], ['高心极', '高兴极']] },
  { t: 3, p: '他知到答案，却没有举手，只是坐着微笑。', e: [['知到答', '知道答']] },
  { t: 3, p: '队伍在窄路上鱼惯前进，谁也不推挤。', e: [['鱼惯前', '鱼贯前']] },

  /* ---- 第四档：又长又密 ---- */
  { t: 4, p: '他即然承认自己做得过份，大家也就不再追究，只希望他以后慢意做事。', e: [['即然承', '既然承'], ['过份，', '过分，'], ['慢意做', '满意做']] },
  { t: 4, p: '幕色降临，他越发爱幕这片土地，连风里都带着熟悉的味道。', e: [['幕色降', '暮色降'], ['爱幕这', '爱慕这']] },
  { t: 4, p: '他站的姿式别扭，形装也不整齐，却一直很有精神。', e: [['姿式别', '姿势别'], ['形装也', '形状也']] },
  { t: 4, p: '他幕名前来应聘，回答得头头是道，可惜形装实在邋遢。', e: [['幕名前', '慕名前'], ['形装实', '形状实']] },
  { t: 4, p: '会上他全神惯注地记录，散会后走得急，把伞忘在了教室里。', e: [['惯注地', '贯注地']] },
  { t: 4, p: '冬天的空气十分干躁，他的嘴唇干裂出血，脾气也比平时急燥。', e: [['干躁，', '干燥，'], ['急燥。', '急躁。']] },
  { t: 4, p: '这份稿子他抄了三遍，纸上还是留了好几个错子。', e: [['个错子。', '个错字。']] },
  { t: 4, p: '他对这份差事并不满义，却每天都认真地把事办妥。', e: [['不满义', '不满意']] },
  { t: 4, p: '他说话算数，从不亏欠别人，只是写字时常常把末来写成未来。', e: [['末来写', '未来写']] },
  { t: 4, p: '他总把责任往外推，长期以往谁都不敢跟他搭档。', e: [['长期以往', '长此以往']] },
  { t: 4, p: '他从不做违心之事，遇到不明白的地方一定要问个消楚。', e: [['消楚。', '清楚。']] },
  { t: 4, p: '这篇文章的结购很松，可是语言生动，读一遍就留下很深的印像。', e: [['结购很', '结构很'], ['印像。', '印象。']] },
];
/* ==================== 档位 ==================== */
var DIFFS = {
  easy: { label: '见习校对', time: 100, fine: 20, life: 4, start: 120, cost: 40, drain: 3 },
  normal: { label: '正式校对', time: 70, fine: 30, life: 3, start: 60, cost: 60, drain: 4 },
  hard: { label: '终审责编', time: 48, fine: 45, life: 2, start: 10, cost: 80, drain: 5 }
};
var REWARD = 40;      // 每揪出一处
var COMBO_BONUS = 12; // 连击加成
var TIME_VALUE = 3;   // 每剩余 1 秒的稿费
var CUT = 4;          // 圈错一次罚的秒数

/* ==================== DOM / 音效 ==================== */
function byId(id) { return document.getElementById(id); }
var docEl = byId('doc');
var noteEl = byId('note');
var fixesEl = byId('fixes');
var barEl = byId('bar');
var overlayEl = byId('overlay');
var ovContent = byId('overlayContent');
var elCoin = byId('coin'); var elLv = byId('lv'); var elLife = byId('life'); var elClock = byId('clock');
var elAskCost = byId('askCost');

var SILENT = { tone: function () {}, melody: function () {}, noise: function () {},
  toggle: function () { return true; }, isMuted: function () { return true; },
  setMuted: function () {}, resume: function () {} };
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'proof.muted' }) : null) || SILENT;
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

/* ==================== 稿件解析：按锚点定位错字 ==================== */
function isPunct(ch) { return /[，。！？；：、,.!?;:]/.test(ch); }

function parseDoc(d) {
  var chars = [];
  for (var i = 0; i < d.p.length; i++) chars.push(d.p.charAt(i));
  var errs = {};
  var pairs = [];
  for (var k = 0; k < d.e.length; k++) {
    var w = d.e[k][0], r = d.e[k][1];
    var at = d.p.indexOf(w);
    if (at < 0) continue;                       // 语料异常时宁可不给分也不卡死
    var off = -1;
    for (var j = 0; j < w.length; j++) if (w.charAt(j) !== r.charAt(j)) { off = j; break; }
    if (off < 0) continue;
    errs[at + off] = { wrong: w.charAt(off), right: r.charAt(off) };
    pairs.push({ wrong: w.charAt(off), right: r.charAt(off) });
  }
  return { chars: chars, errs: errs, total: Object.keys(errs).length, pairs: pairs };
}

/* ==================== 局面 ==================== */
var diff = 'normal';
var phase = 'intro';       // intro | play | over
var doc = null;            // 当前段
var cellEls = [];
var found = {};            // idx → 1（玩家圈对的）
var given = {};            // idx → 1（求助换来的）
var missed = {};           // idx → 1（确定没错、已被划掉的）
var wrongPicks = 0;
var coin = 0;
var life = 3;
var level = 0;             // 已校完段数
var combo = 0;
var hitsThisRun = 0;
var timeLeft = 60;
var timeMax = 60;
var timer = null;
var usedIds = {};
var queue = [];

function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function tierFor(lv) {
  if (lv < 4) return 1;
  if (lv < 9) return 2;
  if (lv < 15) return 3;
  return 4;
}

/* 段序：按档位由浅入深，一档抽完再抽下一档；全部用完 → 重新排队 */
function nextDoc() {
  var tier = tierFor(level);
  if (!queue.length) {
    var pool = [];
    for (var i = 0; i < DOCS.length; i++) if (DOCS[i].t === tier) pool.push(i);
    if (!pool.length) { usedIds = {}; pool = allIndices(); }
    queue = shuffle(pool);
  }
  var guard = 0;
  while (queue.length && guard++ < 60) {
    var idx = queue.shift();
    var d = DOCS[idx];
    var p = parseDoc(d);
    if (p.total > 0) {
      p.source = d;
      p.id = idx;
      return p;
    }
  }
  usedIds = {};
  var fallback = parseDoc(DOCS[0]);
  fallback.source = DOCS[0];
  fallback.id = 0;
  return fallback;
}

function allIndices() {
  var a = [];
  for (var i = 0; i < DOCS.length; i++) a.push(i);
  return a;
}

/* ==================== 计时 ==================== */
function startTimer() {
  stopTimer();
  timer = setInterval(function () { onTick(); }, 100);
}
function stopTimer() { if (timer !== null) { clearInterval(timer); timer = null; } }

function onTick() {
  if (phase !== 'play') return;
  timeLeft -= 0.1;
  if (timeLeft <= 0) {
    timeLeft = 0;
    hud();
    reject('时间到');
    return;
  }
  hud();
}

/* ==================== 判定 ==================== */
function tap(idx) {
  if (phase !== 'play') return;
  if (!doc || found[idx] || given[idx] || missed[idx] || isPunct(doc.chars[idx])) return;
  var el = cellEls[idx];
  if (doc.errs[idx]) {
    if (found[idx]) return;
    found[idx] = 1;
    combo++;
    hitsThisRun++;
    var gain = REWARD + Math.max(0, combo - 1) * COMBO_BONUS;
    coin += gain;
    sfx.tone(720 + Math.min(combo, 6) * 60, 0.07, 'triangle', 0.17);
    showFix(idx, gain, false);
    if (foundCount() >= doc.total) pass();
  } else {
    missed[idx] = 1;
    wrongPicks++;
    combo = 0;
    coin -= DIFFS[diff].fine;
    timeLeft = Math.max(0, timeLeft - CUT);
    sfx.noise(0.1, 0.12);
    sfx.tone(200, 0.12, 'sawtooth', 0.14, 0, 120);
    if (el) {
      el.classList.add('wrong');
      setTimeout(function () { el.classList.remove('wrong'); }, 320);
    }
    noteEl.innerHTML = '这里没错 —— 扣 <b>' + DIFFS[diff].fine + '</b> 稿费、扣 ' + CUT + ' 秒';
    if (coin < 0) { hud(); over('赔穿'); return; }
  }
  render();
  hud();
}

function foundCount() {
  var n = 0;
  for (var i = 0; i < cellEls.length; i++) { if (found[i] || given[i]) n++; }
  return n;
}

function unfound() {
  var out = [];
  for (var k in doc.errs) if (!found[k] && !given[k]) out.push(parseInt(k, 10));
  return out;
}

function pass() {
  var bonus = Math.round(timeLeft) * TIME_VALUE;
  coin += bonus;
  level++;
  stopTimer();
  store.set('proof.level', Math.max(num('proof.level'), level));
  store.set('proof.best', Math.max(num('proof.best'), coin));
  sfx.melody([[659, 0.07], [880, 0.07], [1174, 0.12]]);
  noteEl.innerHTML = '这一段干净了 —— 剩 ' + Math.round(timeLeft) + ' 秒，加 <b>' + bonus + '</b> 稿费';
  hud();
  setTimeout(function () { if (phase === 'play') beginDoc(); }, 900);
}

function reject(reason) {
  stopTimer();
  life--;
  combo = 0;
  var left = unfound();
  for (var i = 0; i < left.length; i++) {
    given[left[i]] = 1;
    showFix(left[i], 0, true);
  }
  render();
  hud();
  sfx.tone(280, 0.18, 'square', 0.14, 0, 150);
  if (reason === '赔穿') { over('赔穿'); return; }
  if (life <= 0) { over('退稿'); return; }
  noteEl.innerHTML = (reason === '时间到' ? '截稿时间过了' : '你主动退稿') +
    ' —— 主编替你改了 ' + left.length + ' 处，退稿机会剩 <b>' + life + '</b>';
  setTimeout(function () { if (phase === 'play') beginDoc(); }, 1400);
}

function showFix(idx, gain, quiet) {
  var e = doc.errs[idx];
  if (!e) return;
  var html = fixesEl.innerHTML;
  if (gain > 0) html += ' <b>' + e.wrong + '</b>→<i>' + e.right + '</i>(+' + gain + ')';
  else html += ' <b>' + e.wrong + '</b>→<i>' + e.right + '</i>' + (quiet ? '(主编改的)' : '');
  fixesEl.innerHTML = html;
}

function askHint() {
  if (phase !== 'play' || !doc) return;
  var cost = DIFFS[diff].cost;
  var left = unfound();
  if (!left.length) { noteEl.innerHTML = '错处都已经找出来了，交下去就好'; return; }
  if (coin < cost) { noteEl.innerHTML = '稿费不够求助（要 ' + cost + '），先自己找'; return; }
  coin -= cost;
  var idx = left[Math.floor(Math.random() * left.length)];
  given[idx] = 1;
  showFix(idx, 0, true);
  sfx.tone(520, 0.09, 'sine', 0.14);
  noteEl.innerHTML = '主编圈了一处给你 —— 花掉 <b>' + cost + '</b> 稿费';
  if (foundCount() >= doc.total) pass();
  render();
  hud();
}

/* ==================== 渲染 ==================== */
function beginDoc() {
  doc = nextDoc();
  found = {}; given = {}; missed = {};
  fixesEl.innerHTML = '';
  timeMax = DIFFS[diff].time;
  timeLeft = timeMax;
  noteEl.innerHTML = '本段有 <b>' + doc.total + '</b> 处错别字';
  renderDoc();
  render();
  hud();
  startTimer();
}

function renderDoc() {
  docEl.innerHTML = '';
  cellEls = [];
  for (var i = 0; i < doc.chars.length; i++) {
    var el = document.createElement('span');
    el.className = isPunct(doc.chars[i]) ? 'g punct' : 'g';
    el.textContent = doc.chars[i];
    el.dataset.idx = String(i);
    (function (idx) {
      el.addEventListener('click', function () { tap(idx); });
    })(i);
    docEl.appendChild(el);
    cellEls.push(el);
  }
}

function render() {
  for (var i = 0; i < cellEls.length; i++) {
    var el = cellEls[i];
    if (!el) continue;
    el.classList.toggle('found', !!found[i]);
    el.classList.toggle('given', !!given[i] && !found[i]);
    el.classList.toggle('miss', !!missed[i] && !found[i] && !given[i]);
  }
  if (barEl) barEl.classList.toggle('low', timeLeft / timeMax < 0.25);
}

function hud() {
  elCoin.textContent = String(coin);
  elLv.textContent = String(level);
  elLife.textContent = String(life);
  elClock.textContent = Math.ceil(timeLeft) + 's';
  elAskCost.textContent = '-' + DIFFS[diff].cost;
  var pct = timeMax ? Math.max(0, Math.min(100, (timeLeft / timeMax) * 100)) : 0;
  barEl.style.width = pct.toFixed(1) + '%';
  var btn = byId('btnAsk');
  if (btn) btn.disabled = phase !== 'play' || coin < DIFFS[diff].cost;
}

/* ==================== 开局 / 结算 ==================== */
function markDiff() {
  var btns = byId('diff').querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
  }
}

function newRun(key) {
  if (key && DIFFS[key]) diff = key;
  var d = DIFFS[diff];
  stopTimer();
  phase = 'play';
  coin = d.start;
  life = d.life;
  level = 0;
  combo = 0;
  wrongPicks = 0;
  hitsThisRun = 0;
  usedIds = {};
  queue = [];
  hideOverlay();
  store.set('proof.diff', diff);
  beginDoc();
  markDiff();
}

/* 收起遮罩就是回到稿纸前：计时器必须跟着走，否则暂停一次就等于后面没有时间压力 */
function hideOverlay() {
  overlayEl.classList.remove('show');
  if (phase === 'play') startTimer();
}

function showIntro() {
  phase = 'intro';
  stopTimer();
  ovContent.innerHTML = '<div class="ov-emoji">✏️</div><h2>三校</h2>' +
    '<p class="hint">你是出版社的校对。<br>稿子里埋着<b>真的常被写错</b>的字：<br>的/得、在/再、部署/布署、通霄/通宵……<br>圈对赚钱，圈错扣钱还扣时间，截稿前清干净。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">上班</button></div>';
  overlayEl.classList.add('show');
  markDiff();
  hud();
}

function over(reason) {
  if (phase === 'over') return;
  phase = 'over';
  stopTimer();
  store.set('proof.best', Math.max(num('proof.best'), coin));
  store.set('proof.level', Math.max(num('proof.level'), level));
  store.set('proof.hits', num('proof.hits') + hitsThisRun);
  var titles = { 赔穿: '稿费扣穿了', 退稿: '主编失去耐心了', 时间到: '赶不上印期' };
  sfx.melody([[440, 0.12], [330, 0.14], [220, 0.22]]);
  ovContent.innerHTML = '<div class="ov-emoji">📕</div><h2>' + (titles[reason] || '下班') + '</h2>' +
    '<p class="final-score">' + coin + '<span> 稿费</span></p>' +
    '<p class="final-sub">校完 ' + level + ' 段 · 揪出 ' + hitsThisRun + ' 个错字 · 误圈 ' + wrongPicks + ' 次</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一班</button>' +
    '<button class="ghost" data-act="stats">看战绩</button></div>';
  overlayEl.classList.add('show');
  hud();
}

function showStats() {
  // 看战绩时不该继续被截稿时间追着跑；关闭遮罩时由 hideOverlay 把表放回去
  if (phase === 'play') stopTimer();
  var best = num('proof.best');
  var lv = num('proof.level');
  var hits = num('proof.hits');
  var totalErr = 0;
  for (var i = 0; i < DOCS.length; i++) totalErr += DOCS[i].e.length;
  ovContent.innerHTML = '<div class="ov-emoji">📊</div><h2>本机战绩</h2>' +
    '<div class="sj-list">最高稿费 <b>' + best + '</b><br>最远校完 <b>' + lv + '</b> 段<br>' +
    '累计揪出 <b>' + hits + '</b> 个错字<br>稿库共 ' + DOCS.length + ' 段 / ' + totalErr + ' 处错（做完会循环抽题）</div>' +
    '<div class="ov-actions"><button class="primary" data-act="close">继续</button>' +
    '<button class="ghost" data-act="again">重新开始</button></div>';
  overlayEl.classList.add('show');
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

byId('btnAsk').addEventListener('click', function () { sfx.resume(); askHint(); });
byId('btnGive').addEventListener('click', function () {
  sfx.resume();
  if (phase === 'play') reject('退稿');
});
byId('btnStats').addEventListener('click', function () { sfx.resume(); showStats(); });
byId('btnNew').addEventListener('click', function () { sfx.resume(); newRun(); });
soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });

window.addEventListener('keydown', function (e) {
  var k = e.key;
  if (k === 'h' || k === 'H') askHint();
  else if (k === 'g' || k === 'G') { if (phase === 'play') reject('退稿'); }
  else if (k === 't' || k === 'T') showStats();
  else if (k === 'n' || k === 'N') newRun();
  else if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); }
  else if (k === 'Escape') { if (phase === 'play') { stopTimer(); showPause(); } else hideOverlay(); }
});

function showPause() {
  ovContent.innerHTML = '<div class="ov-emoji">⏸️</div><h2>喘口气</h2>' +
    '<p class="hint">稿纸还在，时间已经停了</p>' +
    '<div class="ov-actions"><button class="primary" data-act="close">接着校</button></div>';
  overlayEl.classList.add('show');
}

/* ==================== 启动 ==================== */
(function boot() {
  diff = store.get('proof.diff', 'normal');
  if (!DIFFS[diff]) diff = 'normal';
  coin = DIFFS[diff].start;
  life = DIFFS[diff].life;
  timeMax = DIFFS[diff].time;
  timeLeft = timeMax;
  doc = parseDoc(DOCS[0]);
  doc.source = DOCS[0];
  renderDoc();
  render();
  syncSound();
  showIntro();
})();

})();
