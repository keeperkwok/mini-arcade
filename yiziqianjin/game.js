/* 一字千金 —— 用五个坐标锁住一个汉字
   规则核心：每猜一个字，声母/韵母/声调/部首/结构 各判一次对错；命中的轴会锁定答案的确切值，
   候选字随之收窄。猜一次、买一条线索都要花钱，剩下来的金就是得分（一字千金是字面意思）。
   五轴全中也不一定就是这个字——同音同部首的字还在，得再猜一次。
   字表内置在本文件，全部字段经过脚本校验。纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 字表 ====================
   每条：字|声母|韵母|声调|部首|结构
   约定：声母按拼写取（含 y、w 这类起头字母），真正零声母的字（安/爱/儿…）一律不收；
   j q x 后面写的 u 实际是 ü，这里按真实韵母记作 ü。 */
var HANS = [
  /* ---- 左右结构 ---- */
  '他|t|a|1|亻|左右', '你|n|i|3|亻|左右', '什|sh|i|2|亻|左右', '住|zh|u|4|亻|左右', '位|w|ei|4|亻|左右',
  '伴|b|an|4|亻|左右', '仙|x|ian|1|亻|左右', '休|x|iu|1|亻|左右', '体|t|i|3|亻|左右', '何|h|e|2|亻|左右',
  '作|z|uo|4|亻|左右', '代|d|ai|4|亻|左右', '使|sh|i|3|亻|左右',
  '打|d|a|3|扌|左右', '把|b|a|3|扌|左右', '拉|l|a|1|扌|左右', '找|zh|ao|3|扌|左右', '推|t|ui|1|扌|左右',
  '提|t|i|2|扌|左右', '抱|b|ao|4|扌|左右', '拍|p|ai|1|扌|左右', '指|zh|i|3|扌|左右', '掉|d|iao|4|扌|左右',
  '江|j|iang|1|氵|左右', '河|h|e|2|氵|左右', '湖|h|u|2|氵|左右', '海|h|ai|3|氵|左右', '洗|x|i|3|氵|左右',
  '活|h|uo|2|氵|左右', '汗|h|an|4|氵|左右', '池|ch|i|2|氵|左右', '注|zh|u|4|氵|左右', '泪|l|ei|4|氵|左右',
  '波|b|o|1|氵|左右', '清|q|ing|1|氵|左右', '洋|y|ang|2|氵|左右', '沙|sh|a|1|氵|左右', '渐|j|ian|4|氵|左右',
  '说|sh|uo|1|讠|左右', '话|h|ua|4|讠|左右', '语|y|ü|3|讠|左右', '读|d|u|2|讠|左右', '请|q|ing|3|讠|左右',
  '谢|x|ie|4|讠|左右', '课|k|e|4|讠|左右', '记|j|i|4|讠|左右', '认|r|en|4|讠|左右', '论|l|un|4|讠|左右',
  '好|h|ao|3|女|左右', '妈|m|a|1|女|左右', '她|t|a|1|女|左右', '姐|j|ie|3|女|左右', '妹|m|ei|4|女|左右',
  '姓|x|ing|4|女|左右', '妙|m|iao|4|女|左右',
  '机|j|i|1|木|左右', '村|c|un|1|木|左右', '板|b|an|3|木|左右', '样|y|ang|4|木|左右', '松|s|ong|1|木|左右',
  '柏|b|ai|3|木|左右', '桃|t|ao|2|木|左右', '相|x|iang|1|木|左右', '格|g|e|2|木|左右', '桥|q|iao|2|木|左右',
  '明|m|ing|2|日|左右', '时|sh|i|2|日|左右', '晚|w|an|3|日|左右', '晴|q|ing|2|日|左右', '昨|z|uo|2|日|左右',
  '肥|f|ei|2|月|左右', '肚|d|u|4|月|左右', '胜|sh|eng|4|月|左右', '胆|d|an|3|月|左右', '朋|p|eng|2|月|左右',
  '怕|p|a|4|忄|左右', '忙|m|ang|2|忄|左右', '情|q|ing|2|忄|左右', '惊|j|ing|1|忄|左右', '慢|m|an|4|忄|左右',
  '和|h|e|2|禾|左右', '秋|q|iu|1|禾|左右', '种|zh|ong|3|禾|左右', '科|k|e|1|禾|左右', '秒|m|iao|3|禾|左右',
  '称|ch|eng|1|禾|左右', '移|y|i|2|禾|左右',
  '铁|t|ie|3|钅|左右', '银|y|in|2|钅|左右', '钟|zh|ong|1|钅|左右', '错|c|uo|4|钅|左右', '针|zh|en|1|钅|左右',
  '镜|j|ing|4|钅|左右', '铜|t|ong|2|钅|左右',
  '眼|y|an|3|目|左右', '睛|j|ing|1|目|左右', '眠|m|ian|2|目|左右', '盯|d|ing|1|目|左右',
  '玩|w|an|2|王|左右', '现|x|ian|4|王|左右', '理|l|i|3|王|左右', '球|q|iu|2|王|左右', '珠|zh|u|1|王|左右',
  '跑|p|ao|3|足|左右', '跳|t|iao|4|足|左右', '路|l|u|4|足|左右', '踩|c|ai|3|足|左右',
  '饭|f|an|4|饣|左右', '饮|y|in|3|饣|左右', '饱|b|ao|3|饣|左右',
  '被|b|ei|4|衤|左右', '衫|sh|an|1|衤|左右', '裤|k|u|4|衤|左右',
  '视|sh|i|4|礻|左右', '神|sh|en|2|礻|左右', '礼|l|i|3|礻|左右', '祖|z|u|3|礻|左右',
  '阳|y|ang|2|阝|左右', '队|d|ui|4|阝|左右', '院|y|üan|4|阝|左右', '防|f|ang|2|阝|左右', '际|j|i|4|阝|左右',
  '冷|l|eng|3|冫|左右', '冲|ch|ong|1|冫|左右', '决|j|üe|2|冫|左右',
  '鸡|j|i|1|鸟|左右', '欢|h|uan|1|欠|左右', '双|sh|uang|1|又|左右', '联|l|ian|2|耳|左右', '职|zh|i|2|耳|左右',
  '轻|q|ing|1|车|左右', '转|zh|uan|3|车|左右', '软|r|uan|3|车|左右', '轨|g|ui|3|车|左右',
  '粉|f|en|3|米|左右', '粒|l|i|4|米|左右', '精|j|ing|1|米|左右', '料|l|iao|4|米|左右',
  '红|h|ong|2|纟|左右', '织|zh|i|1|纟|左右', '线|x|ian|4|纟|左右', '纸|zh|i|3|纟|左右',
  '地|d|i|4|土|左右', '城|ch|eng|2|土|左右', '坡|p|o|1|土|左右', '塔|t|a|3|土|左右',
  '破|p|o|4|石|左右', '砖|zh|uan|1|石|左右', '硬|y|ing|4|石|左右', '磁|c|i|2|石|左右',
  '蛇|sh|e|2|虫|左右', '蚊|w|en|2|虫|左右', '蚁|y|i|3|虫|左右', '蛙|w|a|1|虫|左右',
  '猫|m|ao|1|犭|左右', '狗|g|ou|3|犭|左右', '狮|sh|i|1|犭|左右', '狠|h|en|3|犭|左右',
  '鲜|x|ian|1|鱼|左右', '驰|ch|i|2|马|左右', '驹|j|ü|1|马|左右', '架|j|ia|4|木|上下',

  /* ---- 上下结构 ---- */
  '字|z|i|4|宀|上下', '客|k|e|4|宀|上下', '家|j|ia|1|宀|上下', '空|k|ong|1|宀|上下', '宝|b|ao|3|宀|上下',
  '室|sh|i|4|宀|上下', '穿|ch|uan|1|宀|上下', '灾|z|ai|1|宀|上下', '宁|n|ing|2|宀|上下', '完|w|an|2|宀|上下',
  '花|h|ua|1|艹|上下', '草|c|ao|3|艹|上下', '菜|c|ai|4|艹|上下', '芳|f|ang|1|艹|上下', '苗|m|iao|2|艹|上下',
  '蓝|l|an|2|艹|上下', '荷|h|e|2|艹|上下', '苦|k|u|3|艹|上下', '芝|zh|i|1|艹|上下', '茶|ch|a|2|艹|上下',
  '星|x|ing|1|日|上下', '早|z|ao|3|日|上下', '昌|ch|ang|1|日|上下', '是|sh|i|4|日|上下', '晨|ch|en|2|日|上下',
  '想|x|iang|3|心|上下', '感|g|an|3|心|上下', '念|n|ian|4|心|上下', '息|x|i|1|心|上下', '思|s|i|1|心|上下',
  '志|zh|i|4|心|上下', '忠|zh|ong|1|心|上下', '急|j|i|2|心|上下', '意|y|i|4|心|上下',
  '李|l|i|3|木|上下', '杏|x|ing|4|木|上下', '雪|x|üe|3|雨|上下', '雷|l|ei|2|雨|上下', '需|x|ü|1|雨|上下',
  '省|sh|eng|3|目|上下', '章|zh|ang|1|立|上下', '等|d|eng|3|⺮|上下', '答|d|a|2|⺮|上下', '笔|b|i|3|⺮|上下',
  '男|n|an|2|田|上下', '美|m|ei|3|羊|上下', '奇|q|i|2|大|上下', '夺|d|uo|2|大|上下', '尖|j|ian|1|小|上下',
  '尘|ch|en|2|小|上下', '只|zh|i|3|口|上下', '吉|j|i|2|口|上下', '名|m|ing|2|口|上下', '多|d|uo|1|夕|上下',
  '岁|s|ui|4|山|上下', '峰|f|eng|1|山|上下', '类|l|ei|4|米|上下', '分|f|en|1|刀|上下', '票|p|iao|4|示|上下',
  '声|sh|eng|1|士|上下', '爷|y|e|2|父|上下', '爸|b|a|4|父|上下', '热|r|e|4|火|上下',
  '包|b|ao|1|勹|包围', '色|s|e|4|色|上下', '景|j|ing|3|日|上下', 

  /* ---- 包围结构 ---- */
  '国|g|uo|2|囗|包围', '团|t|uan|2|囗|包围', '回|h|ui|2|囗|包围', '图|t|u|2|囗|包围', '圈|q|üan|1|囗|包围',
  '近|j|in|4|辶|包围', '进|j|in|4|辶|包围', '过|g|uo|4|辶|包围', '边|b|ian|1|辶|包围', '道|d|ao|4|辶|包围',
  '逃|t|ao|2|辶|包围', '速|s|u|4|辶|包围', '运|y|ün|4|辶|包围', '通|t|ong|1|辶|包围', '连|l|ian|2|辶|包围',
  '闪|sh|an|3|门|包围', '问|w|en|4|门|包围', '间|j|ian|1|门|包围', '闲|x|ian|2|门|包围', '闷|m|en|4|门|包围',
  '闻|w|en|2|门|包围', '阁|g|e|2|门|包围', '风|f|eng|1|风|包围', '区|q|ü|1|匚|包围', '司|s|i|1|口|包围',
  '句|j|ü|4|口|包围', '可|k|e|3|口|包围', '号|h|ao|4|口|包围', '同|t|ong|2|口|包围', '向|x|iang|4|口|包围',

  /* ---- 独体字 ---- */
  '大|d|a|4|大|独体', '小|x|iao|3|小|独体', '月|y|üe|4|月|独体', '羊|y|ang|2|羊|独体', '文|w|en|2|文|独体',
  '到|d|ao|4|刂|左右', '学|x|üe|2|子|上下',
  '山|sh|an|1|山|独体', '水|sh|ui|3|水|独体', '火|h|uo|3|火|独体', '土|t|u|3|土|独体', '木|m|u|4|木|独体',
  '日|r|i|4|日|独体', '田|t|ian|2|田|独体', '口|k|ou|3|口|独体', '人|r|en|2|人|独体', '手|sh|ou|3|手|独体',
  '目|m|u|4|目|独体', '米|m|i|3|米|独体', '竹|zh|u|2|竹|独体', '石|sh|i|2|石|独体', '鸟|n|iao|3|鸟|独体',
  '马|m|a|3|马|独体', '牛|n|iu|2|牛|独体', '虫|ch|ong|2|虫|独体', '车|ch|e|1|车|独体', '门|m|en|2|门|独体',
  '金|j|in|1|金|独体', '天|t|ian|1|大|独体', '白|b|ai|2|白|独体', '十|sh|i|2|十|独体', '百|b|ai|3|白|独体',
  '千|q|ian|1|十|独体', '走|z|ou|3|走|独体', '足|z|u|2|足|独体', '电|d|ian|4|电|独体', '衣|y|i|1|衣|独体',
  '瓜|g|ua|1|瓜|独体', '皮|p|i|2|皮|独体', '骨|g|u|3|骨|独体', '牙|y|a|2|牙|独体', '身|sh|en|1|身|独体',
  '里|l|i|3|里|独体', '长|ch|ang|2|长|独体', '高|g|ao|1|高|独体', '鱼|y|ü|2|鱼|独体', '生|sh|eng|1|生|独体'
];
/* 新手档的答案池（都在 HANS 里，常用、认得出） */
var EASY_CHARS = ('他 你 好 明 山 水 火 木 人 口 手 日 月 田 石 大 小 天 早 星 花 草 家 车 马 牛 羊 鸟 鱼 虫 米 竹 ' +
  '门 问 间 同 走 足 生 里 白 百 十 分 多 名 只 回 国 到 请 谢 打 找 拉 把 河 海 湖 洗 活 说 话 读 课 记 猫 狗 空 字 文 学').split(' ');

var AXES = [
  { key: 'init', label: '声母' },
  { key: 'fin', label: '韵母' },
  { key: 'tone', label: '声调' },
  { key: 'rad', label: '部首' },
  { key: 'str', label: '结构' }
];

var DIFFS = {
  easy: { label: '常用字', budget: 1000, cost: 80, buy: 120, pool: EASY_CHARS },
  normal: { label: '全字库', budget: 1000, cost: 100, buy: 150, pool: null },
  hard: { label: '全字库 · 少钱', budget: 640, cost: 80, buy: 130, pool: null }
};

/* ==================== 解析字表 ==================== */
var TABLE = [];
var BY = {};
(function parse() {
  for (var i = 0; i < HANS.length; i++) {
    var f = HANS[i].split('|');
    if (f.length !== 6) continue;
    var e = { ch: f[0], init: f[1], fin: f[2], tone: f[3], rad: f[4], str: f[5] };
    TABLE.push(e);
    BY[e.ch] = e;
  }
})();

/* ==================== DOM / 音效 ==================== */
function byId(id) { return document.getElementById(id); }
var axesEl = byId('axes');
var logEl = byId('log');
var chipsEl = byId('chips');
var headEl = byId('head');
var buyEl = byId('buy');
var typeEl = byId('type');
var onlyEl = byId('onlyLeft');
var overlayEl = byId('overlay');
var ovContent = byId('overlayContent');
var elCoin = byId('coin'); var elTries = byId('tries'); var elStreak = byId('streak'); var elCand = byId('cand');

var SILENT = { tone: function () {}, melody: function () {}, noise: function () {},
  toggle: function () { return true; }, isMuted: function () { return true; },
  setMuted: function () {}, resume: function () {} };
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'han.muted' }) : null) || SILENT;
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
var answer = null;
var coin = 1000;
var tries = 0;
var streak = 0;
var known = {};        // axis → 答案的确切值（命中或买来的）
var bought = {};       // axis → 1（花钱买的，画虚线区分）
var hist = [];         // 猜过的字
var last = null;       // 最近一次猜测

function poolChars() {
  var p = DIFFS[diff].pool;
  if (!p) return TABLE.map(function (e) { return e.ch; });
  var out = [];
  for (var i = 0; i < p.length; i++) if (BY[p[i]]) out.push(p[i]);
  return out.length ? out : TABLE.map(function (e) { return e.ch; });
}

function candidates() {
  /* 只数本难度答案池里的字：常用字档就该看到常用字，别的档看全库 */
  var pool = poolChars();
  var out = [];
  for (var i = 0; i < pool.length; i++) {
    var e = BY[pool[i]], good = true;
    for (var a in known) if (e[a] !== known[a]) { good = false; break; }
    if (good) out.push(e.ch);
  }
  return out;
}

/* ==================== 猜测 ==================== */
function guess(ch) {
  if (phase !== 'play') return true;
  ch = String(ch || '').trim().charAt(0) || '';
  var e = BY[ch];
  if (!e) {
    headEl.innerHTML = '「' + (ch || '?') + '」不在字库里 —— 换个真正的字';
    sfx.tone(200, 0.1, 'sawtooth', 0.12);
    return false;
  }
  if (hist.indexOf(ch) >= 0) { headEl.innerHTML = '<b>' + ch + '</b> 已经猜过了'; return false; }
  var cost = DIFFS[diff].cost;
  if (coin < cost) { headEl.innerHTML = '金不够猜了'; return false; }
  coin -= cost;
  tries++;
  hist.push(ch);
  var hits = {};
  for (var i = 0; i < AXES.length; i++) {
    var k = AXES[i].key;
    hits[k] = e[k] === answer[k];
    if (hits[k]) known[k] = answer[k];
  }
  last = { ch: ch, hits: hits, e: e };
  if (typeEl) typeEl.value = '';

  if (ch === answer.ch) { win(); renderAll(); return true; }

  var n = AXES.filter(function (a) { return hits[a.key]; }).length;
  if (n === 5) {
    headEl.innerHTML = '<b>' + ch + '</b> 五轴全中，可它不是答案 —— 还有同音同部首的字';
    sfx.melody([[659, 0.06], [659, 0.06], [523, 0.12]]);
  } else if (n >= 3) {
    headEl.innerHTML = '<b>' + ch + '</b> 中 ' + n + ' 轴，越锁越紧';
    sfx.tone(620 + n * 60, 0.08, 'triangle', 0.15);
  } else {
    headEl.innerHTML = '<b>' + ch + '</b> 只中 ' + n + ' 轴';
    sfx.tone(360, 0.08, 'triangle', 0.13);
  }
  var left = candidates().length;
  if (left === 1) headEl.innerHTML += ' · 只剩一个候选了！';
  if (coin < DIFFS[diff].cost) fail('钱花光了');
  renderAll();
  return true;
}

function win() {
  streak++;
  store.set('han.best', Math.max(num('han.best'), coin));
  store.set('han.streak', Math.max(num('han.streak'), streak));
  store.set('han.solved', num('han.solved') + 1);
  headEl.innerHTML = '就是 <b>' + answer.ch + '</b> —— 剩 ' + coin + ' 金';
  sfx.melody([[784, 0.07], [988, 0.07], [1174, 0.07], [1568, 0.16]]);
  phase = 'won';
  ovContent.innerHTML = '<div class="ov-emoji">🎉</div><h2>猜中了</h2>' +
    '<p class="hz-answer">' + answer.ch + '</p>' +
    '<p class="hz-detail"><b>' + answer.init + '</b> · <b>' + answer.fin + '</b> · 第 <b>' + answer.tone + '</b> 声 · 部首 <b>' +
      answer.rad + '</b> · <b>' + answer.str + '</b></p>' +
    '<p class="final-score">' + coin + '<span> 金</span></p>' +
    '<p class="final-sub">猜了 ' + tries + ' 次 · 连胜 ' + streak + ' 题' +
      (coin === num('han.best') ? ' · 新纪录' : '') + '</p>' +
    '<div class="ov-actions"><button class="primary" data-act="next">再来一字</button>' +
    '<button class="ghost" data-act="close">看看盘面</button></div>';
  overlayEl.classList.add('show');
}

function fail(reason) {
  if (phase === 'over') return;
  phase = 'over';
  streak = 0;
  store.set('han.streak', Math.max(num('han.streak'), streak));
  sfx.melody([[440, 0.12], [330, 0.14], [220, 0.22]]);
  headEl.innerHTML = '答案是 <b>' + answer.ch + '</b>';
  ovContent.innerHTML = '<div class="ov-emoji">🪙</div><h2>这一字值千金</h2>' +
    '<p class="hint">' + (reason === '钱花光了' ? '千金花完，还是没猜中' : '放弃本字') + '</p>' +
    '<p class="hz-answer">' + answer.ch + '</p>' +
    '<p class="hz-detail"><b>' + answer.init + '</b> · <b>' + answer.fin + '</b> · 第 <b>' + answer.tone + '</b> 声 · 部首 <b>' +
      answer.rad + '</b> · <b>' + answer.str + '</b><br>你猜了 ' + tries + ' 次，锁定了 ' + Object.keys(known).length + ' 条坐标</p>' +
    '<div class="ov-actions"><button class="primary" data-act="next">再来一字</button></div>';
  overlayEl.classList.add('show');
}

function buy(axis) {
  if (phase !== 'play') return;
  if (!axis || known[axis]) { headEl.innerHTML = '这条坐标已经知道了'; return; }
  var price = DIFFS[diff].buy;
  if (coin < price) { headEl.innerHTML = '金不够买线索（要 ' + price + '）'; return; }
  coin -= price;
  bought[axis] = 1;
  known[axis] = answer[axis];
  var label = (AXES.filter(function (a) { return a.key === axis; })[0] || {}).label || axis;
  headEl.innerHTML = '买下「' + label + '」= <b>' + answer[axis] + '</b> · 花 ' + price + ' 金';
  sfx.tone(880, 0.07, 'sine', 0.14);
  var left = candidates().length;
  if (left === 1) headEl.innerHTML += ' · 只剩一个候选了';
  if (coin < DIFFS[diff].cost && left > 1) { fail('钱花光了'); return; }
  renderAll();
}

/* ==================== 开局 ==================== */
function newPuzzle(keepDiff) {
  var pool = poolChars();
  var ch;
  do { ch = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && ch === (answer && answer.ch));
  answer = BY[ch];
  coin = DIFFS[diff].budget;
  tries = 0;
  known = {};
  bought = {};
  hist = [];
  last = null;
  phase = 'play';
  if (!keepDiff) store.set('han.diff', diff);
  hideOverlay();
  headEl.innerHTML = '新字已就位 · 一次猜 <b>' + DIFFS[diff].cost + '</b> 金，买线索 <b>' + DIFFS[diff].buy + '</b> 金';
  renderAll();
}

function hideOverlay() { overlayEl.classList.remove('show'); }

function showIntro() {
  phase = 'intro';
  ovContent.innerHTML = '<div class="ov-emoji">🈲</div><h2>一字千金</h2>' +
    '<p class="hint">我想好一个字。<br>你每猜一个，我告诉你<b>声母、韵母、声调、部首、结构</b><br>这五条里哪条对。<br>' +
    '猜一次花 ' + DIFFS[diff].cost + ' 金，买一条确切线索花 ' + DIFFS[diff].buy + ' 金，<br>剩下的金就是得分。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开始猜</button></div>';
  overlayEl.classList.add('show');
  markDiff();
  renderAll();
}

/* ==================== 渲染 ==================== */
function renderAxes() {
  var html = '';
  for (var i = 0; i < AXES.length; i++) {
    var a = AXES[i], k = a.key;
    var cls = 'axis';
    var val = '—';
    if (last && last.hits[k]) { cls += ' hit'; val = last.e[k]; }
    else if (bought[k]) { cls += ' bought'; val = known[k]; }
    else if (known[k]) { cls += ' hit'; val = known[k]; }
    else if (last) { val = last.e[k]; }
    html += '<div class="' + cls + '"><span class="k">' + a.label + '</span><span class="v">' + val + '</span></div>';
  }
  axesEl.innerHTML = html;
}

function renderLog() {
  var html = '';
  for (var i = 0; i < hist.length; i++) {
    var ch = hist[i];
    var e = BY[ch];
    var rowCls = 'row' + (ch === answer.ch ? ' win' : '');
    html += '<div class="' + rowCls + '"><span class="c">' + ch + '</span>';
    for (var k = 0; k < AXES.length; k++) {
      var key = AXES[k].key;
      html += '<i class="' + (e[key] === answer[key] ? 'y' : '') + '">' + e[key] + '</i>';
    }
    html += '</div>';
  }
  logEl.innerHTML = html || '<div class="row"><span class="c">?</span><i>猜一个字试试</i></div>';
}

function renderChips() {
  var only = !onlyEl || onlyEl.checked !== false;
  var cands = candidates();
  var set = {};
  for (var i = 0; i < cands.length; i++) set[cands[i]] = 1;
  var list = only ? cands : TABLE.map(function (e) { return e.ch; });
  var html = '';
  for (var j = 0; j < list.length; j++) {
    var ch = list[j];
    var cls = 'chipz' + (hist.indexOf(ch) >= 0 ? ' used' : '') + (only && cands.length === 1 ? ' sole' : '');
    html += '<button class="' + cls + '" data-ch="' + ch + '">' + ch + '</button>';
  }
  chipsEl.innerHTML = html;
  elCand.textContent = String(cands.length);
}

function renderBuy() {
  var btns = buyEl.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    var ax = btns[i].dataset.axis;
    btns[i].classList.toggle('on', !!bought[ax]);
    btns[i].disabled = phase !== 'play' || !!known[ax] || coin < DIFFS[diff].buy;
    btns[i].textContent = (known[ax] ? '✓ ' : '') + btns[i].textContent.replace(/^✓s*/, '').replace(/（.*）$/, '');
  }
}

function renderAll() {
  renderAxes();
  renderLog();
  renderChips();
  renderBuy();
  elCoin.textContent = String(coin);
  elTries.textContent = String(tries);
  elStreak.textContent = String(streak);
}

function markDiff() {
  var btns = byId('diff').querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
  }
}

/* ==================== 事件 ==================== */
ovContent.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  var act = t && t.dataset ? t.dataset.act : null;
  if (!act) return;
  sfx.resume();
  if (act === 'start' || act === 'next') newPuzzle();
  else if (act === 'close') hideOverlay();
});

byId('diff').addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-diff]') : null;
  if (!t || !t.dataset.diff) return;
  sfx.resume();
  diff = t.dataset.diff;
  store.set('han.diff', diff);
  newPuzzle(true);
  markDiff();
});

chipsEl.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-ch]') : null;
  if (!t || !t.dataset.ch) return;
  sfx.resume();
  guess(t.dataset.ch);
});

buyEl.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-axis]') : null;
  if (!t || !t.dataset.axis) return;
  sfx.resume();
  buy(t.dataset.axis);
});

byId('btnGuess').addEventListener('click', function () {
  sfx.resume();
  guess(typeEl && typeEl.value ? typeEl.value : '');
});
if (typeEl) typeEl.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') guess(typeEl.value || '');
});
if (onlyEl) onlyEl.addEventListener('change', renderChips);

byId('btnNew').addEventListener('click', function () { sfx.resume(); newPuzzle(); });
soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });

window.addEventListener('keydown', function (e) {
  var tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  var k = e.key;
  if (k >= '1' && k <= '5') buy(AXES[Number(k) - 1].key);
  else if (k === 'n' || k === 'N') newPuzzle();
  else if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); }
  else if (k === 'Escape') { if (phase === 'play') fail('放弃'); else hideOverlay(); }
});

/* ==================== 启动 ==================== */
(function boot() {
  diff = store.get('han.diff', 'normal');
  if (!DIFFS[diff]) diff = 'normal';
  coin = DIFFS[diff].budget;
  streak = 0;
  var pool = poolChars();
  answer = BY[pool[0]];
  syncSound();
  showIntro();
})();

})();
