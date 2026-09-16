/* 偏旁阵 —— 方向敏感的部件拼字
   规则核心：相邻两个部件能不能拼成字，取决于它们的「空间方位」：
   横排只认左右结构（左边那个必须是左偏旁），竖排只认上下结构（上边那个必须是字头），
   囗/门/辶这类包围框则不分方向。三个相同部件连成品字形 = 晶/鑫/淼。
   纯前端零依赖，字表内置在本文件。 */
(function () {
'use strict';

/* ==================== 字表：[左, 右, 字] ==================== */
var LR = [
  ['亻', '也', '他'], ['亻', '尔', '你'], ['亻', '门', '们'], ['亻', '十', '什'], ['亻', '主', '住'],
  ['亻', '立', '位'], ['亻', '半', '伴'], ['亻', '火', '伙'], ['亻', '山', '仙'], ['亻', '白', '伯'],
  ['亻', '本', '体'], ['亻', '木', '休'], ['亻', '尤', '优'], ['亻', '韦', '伟'], ['亻', '专', '传'],
  ['亻', '可', '何'], ['亻', '乍', '作'], ['亻', '介', '价'], ['亻', '弋', '代'], ['亻', '古', '估'],
  ['亻', '戈', '伐'], ['亻', '千', '仟'], ['亻', '衣', '依'], ['亻', '犬', '伏'],
  ['口', '马', '吗'], ['口', '巴', '吧'], ['口', '尼', '呢'], ['口', '未', '味'], ['口', '斤', '听'],
  ['口', '十', '叶'], ['口', '鸟', '鸣'], ['口', '昌', '唱'], ['口', '我', '哦'], ['口', '及', '吸'],
  ['女', '马', '妈'], ['女', '子', '好'], ['女', '也', '她'], ['女', '且', '姐'], ['女', '未', '妹'],
  ['女', '乃', '奶'], ['女', '生', '姓'], ['女', '少', '妙'], ['女', '家', '嫁'],
  ['木', '几', '机'], ['木', '寸', '村'], ['木', '不', '杯'], ['木', '反', '板'], ['木', '羊', '样'],
  ['木', '公', '松'], ['木', '白', '柏'], ['木', '风', '枫'], ['木', '兆', '桃'], ['木', '目', '相'],
  ['木', '各', '格'], ['木', '对', '树'], ['木', '华', '桦'], ['木', '交', '校'], ['木', '木', '林'],
  ['氵', '可', '河'], ['氵', '每', '海'], ['氵', '工', '江'], ['氵', '也', '池'], ['氵', '先', '洗'],
  ['氵', '舌', '活'], ['氵', '干', '汗'], ['氵', '主', '注'], ['氵', '胡', '湖'], ['氵', '目', '泪'],
  ['氵', '由', '油'], ['氵', '白', '泊'], ['氵', '皮', '波'], ['氵', '包', '泡'], ['氵', '少', '沙'],
  ['氵', '青', '清'], ['氵', '羊', '洋'], ['氵', '分', '汾'], ['氵', '于', '污'], ['氵', '句', '沟'],
  ['讠', '兑', '说'], ['讠', '舌', '话'], ['讠', '吾', '语'], ['讠', '卖', '读'], ['讠', '青', '请'],
  ['讠', '射', '谢'], ['讠', '果', '课'], ['讠', '己', '记'], ['讠', '上', '让'], ['讠', '人', '认'],
  ['讠', '十', '计'], ['讠', '丁', '订'], ['讠', '平', '评'], ['讠', '司', '词'], ['讠', '寺', '诗'],
  ['讠', '式', '试'], ['讠', '炎', '谈'], ['讠', '只', '识'], ['讠', '仑', '论'], ['讠', '成', '诚'],
  ['扌', '丁', '打'], ['扌', '巴', '把'], ['扌', '立', '拉'], ['扌', '戈', '找'], ['扌', '隹', '推'],
  ['扌', '是', '提'], ['扌', '卓', '掉'], ['扌', '包', '抱'], ['扌', '白', '拍'], ['扌', '旨', '指'],
  ['扌', '兆', '挑'], ['扌', '爪', '抓'], ['扌', '少', '抄'], ['扌', '皮', '披'], ['扌', '未', '抹'],
  ['扌', '工', '扛'], ['扌', '寺', '持'], ['扌', '斗', '抖'],
  ['火', '丁', '灯'], ['火', '考', '烤'], ['火', '尧', '烧'], ['火', '少', '炒'], ['火', '包', '炮'],
  ['火', '山', '灿'], ['火', '因', '烟'],
  ['日', '月', '明'], ['日', '寸', '时'], ['日', '免', '晚'], ['日', '西', '晒'], ['日', '乍', '昨'],
  ['日', '青', '晴'], ['日', '音', '暗'], ['日', '召', '昭'],
  ['月', '巴', '肥'], ['月', '土', '肚'], ['月', '生', '胜'], ['月', '旦', '胆'], ['月', '月', '朋'],
  ['忄', '白', '怕'], ['忄', '亡', '忙'], ['忄', '青', '情'], ['忄', '京', '惊'], ['忄', '每', '悔'],
  ['忄', '吾', '悟'], ['忄', '艮', '恨'],
  ['禾', '口', '和'], ['禾', '火', '秋'], ['禾', '中', '种'], ['禾', '只', '积'], ['禾', '斗', '科'],
  ['禾', '少', '秒'], ['禾', '尔', '称'], ['禾', '多', '移'],
  ['钅', '失', '铁'], ['钅', '艮', '银'], ['钅', '中', '钟'], ['钅', '戋', '钱'], ['钅', '昔', '错'],
  ['钅', '竟', '镜'], ['钅', '冈', '钢'], ['钅', '同', '铜'], ['钅', '十', '针'], ['钅', '丁', '钉'],
  ['钅', '句', '钩'], ['马', '也', '驰'], ['马', '户', '驴'], ['马', '句', '驹'], ['鱼', '羊', '鲜'],
  ['虫', '它', '蛇'], ['虫', '文', '蚊'], ['虫', '义', '蚁'], ['虫', '胡', '蝴'], ['虫', '我', '蛾'],
  ['犭', '苗', '猫'], ['犭', '句', '狗'], ['犭', '艮', '狠'], ['犭', '虫', '独'], ['犭', '师', '狮'],
  ['犭', '王', '狂'], ['犭', '昔', '猎'],
  ['王', '元', '玩'], ['王', '见', '现'], ['王', '里', '理'], ['王', '求', '球'], ['王', '朱', '珠'],
  ['王', '不', '环'], ['目', '艮', '眼'], ['目', '青', '睛'], ['目', '民', '眠'], ['目', '丁', '盯'],
  ['耳', '关', '联'], ['耳', '又', '取'], ['耳', '只', '职'], ['耳', '令', '聆'],
  ['白', '勺', '的'], ['子', '小', '孙'], ['子', '亥', '孩'], ['力', '口', '加'], ['工', '力', '功'],
  ['且', '力', '助'], ['云', '力', '动'], ['又', '力', '劝'], ['足', '包', '跑'], ['足', '兆', '跳'],
  ['足', '各', '路'], ['足', '艮', '跟'], ['足', '采', '踩'], ['饣', '反', '饭'], ['饣', '欠', '饮'],
  ['饣', '我', '饿'], ['饣', '包', '饱'], ['饣', '交', '饺'], ['衤', '皮', '被'], ['衤', '彡', '衫'],
  ['衤', '谷', '裕'], ['礻', '见', '视'], ['礻', '羊', '祥'], ['礻', '乙', '礼'], ['礻', '土', '社'],
  ['礻', '且', '祖'], ['礻', '申', '神'], ['礻', '兄', '祝'], ['阝', '日', '阳'], ['阝', '人', '队'],
  ['阝', '东', '陈'], ['阝', '完', '院'], ['阝', '余', '除'], ['阝', '可', '阿'], ['阝', '示', '际'],
  ['阝', '方', '防'], ['阝', '介', '阶'], ['阝', '元', '阮'], ['冫', '令', '冷'], ['冫', '水', '冰'],
  ['冫', '中', '冲'], ['冫', '夬', '决'], ['冫', '兄', '况'], ['冫', '欠', '次'], ['又', '鸟', '鸡'],
  ['又', '欠', '欢'], ['又', '寸', '对'], ['又', '隹', '难'], ['又', '戈', '戏'],
  ['车', '九', '轨'], ['车', '专', '转'], ['车', '仑', '轮'], ['车', '欠', '软'], ['米', '斗', '料'],
  ['米', '立', '粒'], ['米', '分', '粉'], ['米', '青', '精'], ['纟', '工', '红'], ['纟', '只', '织'],
  ['纟', '于', '纤'], ['纟', '合', '给'], ['广', '木', '床'], ['广', '占', '店'], ['广', '土', '庄'],
  ['广', '大', '庆'], ['广', '坐', '座'], ['广', '皮', '疲'], ['广', '丙', '病'], ['尸', '毛', '尾'],
  ['尸', '至', '屋'], ['尸', '古', '居'], ['石', '皮', '破'], ['石', '专', '砖'], ['石', '出', '础'],
  ['石', '少', '砂'], ['土', '也', '地'], ['土', '不', '坏'], ['土', '成', '城'], ['土', '皮', '坡'],
  ['土', '夬', '块'], ['矢', '口', '知'], ['者', '阝', '都'], ['古', '攵', '故'], ['占', '戈', '战'],
  ['至', '刂', '到'], ['斤', '欠', '欣'], ['七', '刀', '切'], ['古', '月', '胡'], ['十', '口', '古'],
  ['谷', '欠', '欲'], ['人', '人', '从']
];

/* ==================== 字表：[上, 下, 字] ==================== */
var TB = [
  ['宀', '子', '字'], ['宀', '元', '完'], ['宀', '豕', '家'], ['宀', '工', '空'], ['宀', '女', '安'],
  ['宀', '匕', '它'], ['宀', '丁', '宁'], ['宀', '寸', '守'], ['宀', '吕', '宫'], ['宀', '各', '客'],
  ['宀', '至', '室'], ['宀', '牙', '穿'], ['宀', '犬', '突'], ['宀', '火', '灾'], ['宀', '玉', '宝'],
  ['宀', '牛', '牢'], ['宀', '九', '究'], ['宀', '力', '穷'], ['宀', '于', '宇'], ['宀', '与', '写'],
  ['艹', '化', '花'], ['艹', '早', '草'], ['艹', '采', '菜'], ['艹', '约', '药'], ['艹', '方', '芳'],
  ['艹', '田', '苗'], ['艹', '平', '苹'], ['艹', '监', '蓝'], ['艹', '之', '芝'], ['艹', '何', '荷'],
  ['艹', '古', '苦'], ['艹', '可', '苛'], ['艹', '山', '芯'],
  ['木', '子', '李'], ['木', '口', '杏'], ['口', '木', '呆'], ['口', '王', '呈'], ['日', '十', '早'],
  ['日', '生', '星'], ['日', '干', '旱'], ['日', '一', '旦'], ['日', '日', '昌'],
  ['音', '心', '意'], ['相', '心', '想'], ['咸', '心', '感'], ['今', '心', '念'], ['自', '心', '息'],
  ['因', '心', '恩'], ['刃', '心', '忍'], ['士', '心', '志'], ['亡', '心', '忘'], ['中', '心', '忠'],
  ['奴', '心', '怒'], ['田', '心', '思'], ['己', '心', '忌'], ['小', '大', '尖'], ['小', '土', '尘'],
  ['大', '可', '奇'], ['大', '寸', '夺'], ['山', '夕', '岁'], ['山', '石', '岩'], ['山', '风', '岚'],
  ['口', '八', '只'], ['厶', '口', '台'], ['士', '口', '吉'], ['口', '力', '另'], ['刀', '口', '召'],
  ['八', '刀', '分'], ['八', '厶', '公'], ['夕', '口', '名'], ['夕', '夕', '多'], ['田', '力', '男'],
  ['米', '犬', '类'], ['雨', '彐', '雪'], ['雨', '田', '雷'], ['雨', '而', '需'], ['雨', '令', '零'],
  ['雨', '务', '雾'], ['立', '日', '音'], ['立', '早', '章'], ['少', '目', '省'], ['白', '水', '泉'],
  ['白', '王', '皇'], ['一', '白', '百'], ['鱼', '日', '鲁'], ['禾', '子', '季'], ['禾', '日', '香'],
  ['禾', '乃', '秀'], ['人', '云', '会'], ['又', '土', '圣'], ['土', '土', '圭'], ['尸', '并', '屏'],
  ['⺮', '寺', '等'], ['⺮', '同', '筒'], ['⺮', '毛', '笔'], ['⺮', '合', '答'], ['石', '水', '泵'],
  ['羊', '大', '美'], ['疒', '羊', '痒'], ['合', '手', '拿'], ['火', '火', '炎'], ['口', '口', '吕'],
  
];

/* ==================== 字表：[外, 内, 字]（包围框不分方向） ==================== */
var ENC = [
  ['辶', '斤', '近'], ['辶', '元', '远'], ['辶', '文', '这'], ['辶', '寸', '过'], ['辶', '井', '进'],
  ['辶', '力', '边'], ['辶', '车', '连'], ['辶', '首', '道'], ['辶', '军', '运'], ['辶', '关', '送'],
  ['辶', '兆', '逃'], ['辶', '束', '速'], ['辶', '米', '迷'], ['辶', '千', '迁'], ['辶', '甬', '通'],
  ['门', '口', '问'], ['门', '人', '闪'], ['门', '日', '间'], ['门', '木', '闲'], ['门', '心', '闷'],
  ['门', '耳', '闻'], ['门', '兑', '阅'], ['门', '活', '阔'], ['门', '各', '阁'], ['门', '马', '闯'],
  ['门', '才', '闭'], ['囗', '玉', '国'], ['囗', '才', '团'], ['囗', '元', '园'], ['囗', '韦', '围'],
  ['囗', '大', '因'], ['囗', '木', '困'], ['囗', '人', '囚'], ['囗', '口', '回']
];

/* 品字形：三个相同部件连成 L 形（2×2 缺一角） */
var TRI = [
  ['口', '品'], ['日', '晶'], ['木', '森'], ['水', '淼'], ['火', '焱'],
  ['土', '垚'], ['金', '鑫'], ['牛', '犇'], ['石', '磊'], ['人', '众']
];

/* 常用部件（新手档只用这些，保证拼得出、认得全） */
var EASY = ['亻', '口', '女', '木', '氵', '讠', '扌', '火', '日', '月', '禾', '心', '宀', '艹', '山',
  '土', '大', '小', '人', '力', '又', '白', '田', '目', '石', '王', '子', '中', '工', '可', '也',
  '生', '青', '包', '皮', '少', '十', '八', '刀', '二', '一'];

var PTS = { lr: 10, tb: 12, enc: 15, tri: 40 };
var DIFFS = {
  easy: { label: '常用部件', pool: EASY, hints: 5, shuffles: 5, slack: 7, poolSize: 20 },
  normal: { label: '全部部件', pool: null, hints: 3, shuffles: 3, slack: 5, poolSize: 28 },
  hard: { label: '全部部件 · 少提示', pool: null, hints: 1, shuffles: 2, slack: 4, poolSize: 36 }
};

var COLS = 7;
var ROWS = 7;

/* ==================== DOM / 音效 ==================== */
function byId(id) { return document.getElementById(id); }
var gridEl = byId('grid');
var overlayEl = byId('overlay');
var ovContent = byId('overlayContent');
var msgEl = byId('msg');
var elLv = byId('lv'); var elProg = byId('prog'); var elSteps = byId('steps'); var elScore = byId('score');
var elHintN = byId('hintN'); var elShuffleN = byId('shuffleN'); var elDexN = byId('dexN');

var SILENT = { tone: function () {}, melody: function () {}, noise: function () {},
  toggle: function () { return true; }, isMuted: function () { return true; },
  setMuted: function () {}, resume: function () {} };
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'rad.muted' }) : null) || SILENT;
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

/* ==================== 字表索引（按难度过滤） ==================== */
var ENTRIES = [];
var LOOK = { lr: {}, tb: {}, enc: {} };
var TRIS = {};
var POOL = [];
var TAGS = {};
var INPOOL = {};
var CHARS = [];
var IDX = { tbB: {}, lrA: {}, lrB: {} };

function buildTable(diffKey) {
  var allow = DIFFS[diffKey].pool;
  var allowSet = null;
  if (allow) {
    allowSet = {};
    for (var i = 0; i < allow.length; i++) allowSet[allow[i]] = 1;
  }
  function usable(parts) {
    if (!allowSet) return true;
    for (var j = 0; j < parts.length; j++) if (!allowSet[parts[j]]) return false;
    return true;
  }
  ENTRIES = [];
  LOOK = { lr: {}, tb: {}, enc: {} };
  TAGS = {};
  var count = {};
  var k;
  function add(list, kind) {
    for (var n = 0; n < list.length; n++) {
      var e = list[n];
      if (!usable([e[0], e[1]])) continue;
      ENTRIES.push({ a: e[0], b: e[1], ch: e[2], kind: kind });
      if (kind === 'enc') { LOOK.enc[e[0] + e[1]] = e[2]; LOOK.enc[e[1] + e[0]] = e[2]; }
      else LOOK[kind][e[0] + e[1]] = e[2];
      count[e[0]] = (count[e[0]] || 0) + 1;
      count[e[1]] = (count[e[1]] || 0) + 1;
      role(e[0], kind); role(e[1], kind);
    }
  }
  function role(rad, kind) {
    if (!TAGS[rad]) TAGS[rad] = {};
    if (kind === 'lr') TAGS[rad].h = 1;
    else if (kind === 'tb') TAGS[rad].v = 1;
    else TAGS[rad].e = 1;
  }
  add(LR, 'lr'); add(TB, 'tb'); add(ENC, 'enc');
  TRIS = {};
  for (k = 0; k < TRI.length; k++) {
    if (allowSet && !allowSet[TRI[k][0]]) continue;
    TRIS[TRI[k][0]] = TRI[k][1];
    count[TRI[k][0]] = (count[TRI[k][0]] || 0) + 2;
    if (!TAGS[TRI[k][0]]) TAGS[TRI[k][0]] = {};
    TAGS[TRI[k][0]].t = 1;
  }
  POOL = [];
  INPOOL = {};
  IDX = { tbB: {}, lrA: {}, lrB: {} };
  // 只取「能拼的字最多」的那批部件：盘面才有得拼，也先学到最常用的部件
  var limit = DIFFS[diffKey].poolSize || 28;
  var rs = Object.keys(count).sort(function (a, b) {
    return count[b] - count[a] || (a < b ? -1 : 1);
  }).slice(0, limit);
  for (k = 0; k < rs.length; k++) {
    INPOOL[rs[k]] = 1;
    var n = Math.min(6, Math.max(2, count[rs[k]]));
    for (var q = 0; q < n; q++) POOL.push(rs[k]);
  }
  var cmap = {};
  for (k = 0; k < ENTRIES.length; k++) cmap[ENTRIES[k].ch] = 1;
  var tk = Object.keys(TRIS);
  for (k = 0; k < tk.length; k++) cmap[TRIS[tk[k]]] = 1;
  CHARS = Object.keys(cmap).sort();
  // 倒排：知道一个部件，就能捞出所有能跟它配对的部件（定向补充用）
  for (k = 0; k < ENTRIES.length; k++) {
    var en = ENTRIES[k];
    if (!INPOOL[en.a] || !INPOOL[en.b]) continue;
    if (en.kind === 'tb') { (IDX.tbB[en.b] = IDX.tbB[en.b] || []).push(en.a); }
    else if (en.kind === 'lr') {
      (IDX.lrA[en.a] = IDX.lrA[en.a] || []).push(en.b);
      (IDX.lrB[en.b] = IDX.lrB[en.b] || []).push(en.a);
    }
  }
}

function tagOf(rad) {
  var g = TAGS[rad];
  if (!g) return '';
  var s = '';
  if (g.h) s += '\u2194';
  if (g.v) s += '\u2195';
  if (g.e) s += '\u22a1';
  if (g.t) s += '\u25b3';
  return s;
}

/* ==================== 局面 ==================== */
var diff = 'normal';
var phase = 'intro';
var board = [];
var cellEls = [];
var sel = [];
var level = 1;
var need = 5;
var made = 0;
var merged = 0;
var steps = 12;
var score = 0;
var combo = 0;
var hints = 3;
var shuffles = 3;
var dex = {};
var lastResult = null;

function colOf(i) { return i % COLS; }
function rowOf(i) { return (i - colOf(i)) / COLS; }
function at(c, r) { return r * COLS + c; }
function adjacent(i, j) {
  return Math.abs(colOf(i) - colOf(j)) + Math.abs(rowOf(i) - rowOf(j)) === 1;
}
function pickOne(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : '口'; }
function spawnRad() { return pickOne(POOL); }

/* 定向补充：新部件落到 (c,r) 时，优先考虑跟紧邻的格子直接配成对，
   这样盘面不会因为随机补充而慢慢干涸（干涸才是这款的失败原因） */
function spawnAt(c, r) {
  if (Math.random() < 0.62) {
    var cand = [];
    if (r + 1 < ROWS && board[at(c, r + 1)] && IDX.tbB[board[at(c, r + 1)]]) cand = cand.concat(IDX.tbB[board[at(c, r + 1)]]);
    if (c > 0 && board[at(c - 1, r)] && IDX.lrA[board[at(c - 1, r)]]) cand = cand.concat(IDX.lrA[board[at(c - 1, r)]]);
    if (c + 1 < COLS && board[at(c + 1, r)] && IDX.lrB[board[at(c + 1, r)]]) cand = cand.concat(IDX.lrB[board[at(c + 1, r)]]);
    if (cand.length) return pickOne(cand);
  }
  return spawnRad();
}

function scramble() {
  var all = board.slice();
  for (var i = all.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = all[i]; all[i] = all[j]; all[j] = t;
  }
  board = all;
}

function scrambleUntilMove() {
  var guard = 0;
  do { scramble(); } while (!findMoves().length && guard++ < 60);
  if (!findMoves().length) seedPairs(4);
}

function fillBoard() {
  board = [];
  for (var i = 0; i < ROWS * COLS; i++) board.push(spawnRad());
  seedPairs(6);
  if (!findMoves().length) scrambleUntilMove();
}

/* 开局直接埋若干对：第一屏就有得拼 */
function seedPairs(count) {
  var guard = 0;
  for (var n = 0; n < count && guard++ < 400; n++) {
    var e = pickOne(ENTRIES);
    if (!e) return;
    if (e.kind === 'lr') {
      var c = Math.floor(Math.random() * (COLS - 1));
      var r = Math.floor(Math.random() * ROWS);
      board[at(c, r)] = e.a; board[at(c + 1, r)] = e.b;
    } else if (e.kind === 'tb') {
      var c2 = Math.floor(Math.random() * COLS);
      var r2 = Math.floor(Math.random() * (ROWS - 1));
      board[at(c2, r2)] = e.a; board[at(c2, r2 + 1)] = e.b;
    } else {
      var c3 = Math.floor(Math.random() * COLS);
      var r3 = Math.floor(Math.random() * (ROWS - 1));
      board[at(c3, r3)] = e.a; board[at(c3, r3 + 1)] = e.b;
    }
  }
}

/* 方位决定可用的结构：横排只认左右、竖排只认上下、包围框不分方向 */
function combine(i, j) {
  var A = board[i], B = board[j];
  if (!A || !B) return null;
  var horizontal = rowOf(i) === rowOf(j);
  var first = horizontal ? (colOf(i) < colOf(j) ? A : B) : (rowOf(i) < rowOf(j) ? A : B);
  var second = first === A ? B : A;
  var key = first + second;
  if (horizontal && LOOK.lr[key]) return { ch: LOOK.lr[key], kind: 'lr' };
  if (!horizontal && LOOK.tb[key]) return { ch: LOOK.tb[key], kind: 'tb' };
  if (LOOK.enc[key]) return { ch: LOOK.enc[key], kind: 'enc' };
  return null;
}

/* 三格连成品字 = 落在同一个 2×2 里的 L 形 */
function isLTromino(idxs) {
  if (idxs.length !== 3) return false;
  var cs = [], rs = [], seen = {}, k;
  for (k = 0; k < 3; k++) {
    cs.push(colOf(idxs[k]));
    rs.push(rowOf(idxs[k]));
    seen[rowOf(idxs[k]) + ',' + colOf(idxs[k])] = 1;
  }
  if (Math.max.apply(null, cs) - Math.min.apply(null, cs) !== 1) return false;
  if (Math.max.apply(null, rs) - Math.min.apply(null, rs) !== 1) return false;
  return Object.keys(seen).length === 3;
}

function tripleChar(idxs) {
  if (!isLTromino(idxs)) return null;
  var rad = board[idxs[0]];
  if (!rad || !TRIS[rad]) return null;
  for (var k = 1; k < idxs.length; k++) if (board[idxs[k]] !== rad) return null;
  return { ch: TRIS[rad], kind: 'tri' };
}

function findMoves() {
  var out = [];
  var r, c, i;
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      i = at(c, r);
      if (!board[i]) continue;
      if (c + 1 < COLS && combine(i, at(c + 1, r))) out.push([i, at(c + 1, r)]);
      if (r + 1 < ROWS && combine(i, at(c, r + 1))) out.push([i, at(c, r + 1)]);
    }
  }
  for (r = 0; r + 1 < ROWS; r++) {
    for (c = 0; c + 1 < COLS; c++) {
      var shapes = [
        [at(c, r), at(c, r + 1), at(c + 1, r + 1)],
        [at(c, r), at(c + 1, r), at(c + 1, r + 1)],
        [at(c + 1, r), at(c, r), at(c + 1, r + 1)],
        [at(c + 1, r), at(c, r + 1), at(c + 1, r + 1)],
      ];
      for (var s = 0; s < shapes.length; s++) if (tripleChar(shapes[s])) out.push(shapes[s]);
    }
  }
  return out;
}

/* ==================== 分数 / 关卡 ==================== */
function multiplier() { return 1 + Math.min(combo, 4) * 0.5; }
function needFor(lv) { return 4 + lv; }
function stepsFor(lv) { return needFor(lv) + DIFFS[diff].slack; }

function recordLevel() { store.set('rad.level', Math.max(num('rad.level'), level)); }

function useStep() {
  steps = steps > 0 ? steps - 1 : 0;
  if (steps === 0 && made < need) gameOver('步数');
}

function failAttempt(idxs) {
  for (var k = 0; k < idxs.length; k++) {
    (function (el) {
      if (!el) return;
      el.classList.add('bad');
      setTimeout(function () { el.classList.remove('bad'); }, 260);
    })(cellEls[idxs[k]]);
  }
  combo = 0;
  lastResult = { ch: null, kind: 'bad' };
  sfx.tone(180, 0.12, 'sawtooth', 0.14, 0, 110);
  msgEl.innerHTML = '拼不成字 · 这一步也算一次 · 还剩 <b>' + (steps - 1) + '</b> 步';
  useStep();
}

function commitMerge(idxs, ch, kind) {
  var k;
  for (k = 0; k < idxs.length; k++) board[idxs[k]] = '';
  combo++;
  var gain = Math.round(PTS[kind] * multiplier());
  score += gain;
  made++;
  merged++;
  lastResult = { ch: ch, kind: kind, gain: gain };
  var isNew = !dex[ch];
  if (isNew) { dex[ch] = 1; score += 25; store.set('rad.dex', dexChars().join('')); }
  dropAndFill();
  for (k = 0; k < idxs.length; k++) {
    if (cellEls[idxs[k]]) cellEls[idxs[k]].classList.add('new');
  }
  var names = { lr: '左右', tb: '上下', enc: '包围', tri: '品字' };
  var txt = '<b>' + ch + '</b> ' + names[kind] + '结构 · <span class="up">+' + gain + '</span>';
  if (isNew) txt += ' · ⭐ 新字 +25';
  msgEl.innerHTML = txt;
  if (kind === 'tri') sfx.melody([[523, 0.07], [659, 0.07], [784, 0.07], [1046, 0.12]]);
  else sfx.tone(480 + Math.min(combo, 8) * 46, 0.07, 'triangle', 0.16);
  flashPop(ch, kind === 'tri');
  if (made >= need) { levelUp(); }
  else { useStep(); }
  store.set('rad.best', Math.max(num('rad.best'), score));
  ensurePlayable();
}

/* 盘面干涸就是这款的失败方式：先自动洗牌救场，没牌可洗才判死局 */
function ensurePlayable() {
  if (phase !== 'play') return true;
  if (findMoves().length) return true;
  if (shuffles > 0) {
    shuffles--;
    scrambleUntilMove();
    sel = [];
    msgEl.innerHTML += ' · 无处可拼，自动洗牌（剩 <b>' + shuffles + '</b> 次）';
    sfx.noise(0.14, 0.1);
    render();
    return true;
  }
  gameOver('死局');
  return false;
}

function levelUp() {
  var bonus = steps * 5;
  score += bonus;
  level++;
  made = 0;
  need = needFor(level);
  steps = stepsFor(level);
  recordLevel();
  sfx.melody([[659, 0.08], [880, 0.08], [1174, 0.16]]);
  msgEl.innerHTML += ' · 升到第 ' + level + ' 关（余步兑 +' + bonus + '）';
  store.set('rad.best', Math.max(num('rad.best'), score));
}

function dropAndFill() {
  var c, r, write;
  for (c = 0; c < COLS; c++) {
    var col = [];
    for (r = ROWS - 1; r >= 0; r--) if (board[at(c, r)]) col.push(board[at(c, r)]);
    write = 0;
    for (r = ROWS - 1; r >= 0; r--, write++) {
      board[at(c, r)] = write < col.length ? col[write] : spawnAt(c, r);
    }
  }
}

function flashPop(ch, big) {
  var el = document.createElement('div');
  el.className = big ? 'pop big' : 'pop';
  el.textContent = ch;
  var host = gridEl.parentNode;
  host.appendChild(el);
  setTimeout(function () { host.removeChild(el); }, 900);
}

/* ==================== 选格 ==================== */
function tapCell(idx) {
  if (phase !== 'play' || !board[idx]) return;
  var pos = sel.indexOf(idx);
  if (pos >= 0) {
    if (sel.length === 1) sel = [];
    else sel.splice(pos, 1);
    render();
    return;
  }
  if (!sel.length) { sel = [idx]; render(); return; }
  var last = sel[sel.length - 1];
  if (!adjacent(last, idx)) { sel = [idx]; render(); return; }

  if (sel.length === 2) {
    var three = sel.concat([idx]);
    var tri = tripleChar(three);
    sel.push(idx);
    if (tri) { resolveSel(three, tri); }
    else { failAttempt(three); sel = [idx]; }
    render();
    return;
  }

  var pair = sel.concat([idx]);
  var hit = combine(pair[0], pair[1]);
  if (hit) {
    resolveSel(pair, hit);
  } else if (TRIS[board[idx]] && board[idx] === board[sel[0]]) {
    sel.push(idx);
    msgEl.innerHTML = '两个 <b>' + board[idx] + '</b> 了 · 再找一个连成品字';
    sfx.tone(660, 0.05, 'triangle', 0.1);
  } else {
    failAttempt(pair);
    sel = [idx];
  }
  render();
}

function resolveSel(idxs, hit) {
  sel = [];
  commitMerge(idxs, hit.ch, hit.kind);
}

/* ==================== 工具 ==================== */
function useHint() {
  if (phase !== 'play') return;
  if (hints <= 0) { msgEl.innerHTML = '没有提示了'; return; }
  var moves = findMoves();
  if (!moves.length) { msgEl.innerHTML = '没有可拼的相邻对，试试洗牌'; return; }
  hints--;
  var m = pickOne(moves);
  for (var k = 0; k < m.length; k++) {
    (function (el) {
      if (!el) return;
      el.classList.add('hint');
      setTimeout(function () { el.classList.remove('hint'); }, 1800);
    })(cellEls[m[k]]);
  }
  msgEl.innerHTML = '提示：亮起来的 <b>' + m.length + '</b> 格可以拼（剩 <b>' + hints + '</b> 次）';
  sfx.tone(880, 0.06, 'sine', 0.12);
  render();
}

function useShuffle() {
  if (phase !== 'play') return;
  if (shuffles <= 0) { msgEl.innerHTML = '洗牌次数用完了'; return; }
  shuffles--;
  scrambleUntilMove();
  sel = [];
  combo = 0;
  sfx.noise(0.14, 0.1);
  msgEl.innerHTML = '已洗牌（剩 <b>' + shuffles + '</b> 次）· 连击清零';
  render();
}

function dexChars() { return Object.keys(dex).sort(); }

function loadDex() {
  dex = {};
  var s = store.get('rad.dex', '');
  for (var i = 0; i < s.length; i++) dex[s.charAt(i)] = 1;
}

function showDex() {
  var ks = dexChars();
  var left = [];
  for (var i = 0; i < CHARS.length; i++) if (!dex[CHARS[i]]) left.push(CHARS[i]);
  var html = '<div class="ov-emoji">📖</div><h2>字图鉴 ' + ks.length + ' / ' + CHARS.length + '</h2>' +
    '<p class="hint">这一档最多能拼出 ' + CHARS.length + ' 个字，<br>已收 ' + ks.length + ' 个，还差 ' + left.length + ' 个</p>' +
    '<p class="chars">' + (ks.length ? ks.join(' ') : '还没拼出字，先在盘面上找相邻的两个部件') + '</p>' +
    '<div class="ov-actions"><button class="primary" data-act="close">继续拼</button></div>';
  ovContent.innerHTML = html;
  overlayEl.classList.add('show');
}

/* ==================== 渲染 ==================== */
function buildCells() {
  gridEl.innerHTML = '';
  cellEls = [];
  gridEl.style.setProperty('--n', String(COLS));
  for (var i = 0; i < ROWS * COLS; i++) {
    var el = document.createElement('button');
    el.className = 'cell';
    el.type = 'button';
    el.dataset.idx = String(i);
    (function (idx) {
      el.addEventListener('click', function () { tapCell(idx); });
    })(i);
    gridEl.appendChild(el);
    cellEls.push(el);
  }
}

function render() {
  var i;
  for (i = 0; i < cellEls.length; i++) {
    var el = cellEls[i];
    if (!el) continue;
    el.textContent = board[i] || '';
    el.setAttribute('data-tag', tagOf(board[i]));
    el.classList.toggle('gone', !board[i]);
    el.classList.toggle('sel', sel.indexOf(i) >= 0);
    el.classList.toggle('tri', !!board[i] && !!TRIS[board[i]]);
  }
  elLv.textContent = String(level);
  elProg.textContent = made + '/' + need;
  elSteps.textContent = String(steps);
  elScore.textContent = String(score);
  elHintN.textContent = String(hints);
  elShuffleN.textContent = String(shuffles);
  elDexN.textContent = dexChars().length + '/' + CHARS.length;
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
  buildTable(diff);
  level = 1; need = needFor(level); made = 0; merged = 0;
  steps = stepsFor(level); score = 0; combo = 0;
  hints = d.hints; shuffles = d.shuffles;
  sel = []; lastResult = null;
  buildCells();
  fillBoard();
  phase = 'play';
  hideOverlay();
  markDiff();
  render();
  store.set('rad.diff', diff);
  msgEl.innerHTML = '本关拼出 <b>' + need + '</b> 个字 · 步数预算 <b>' + steps + '</b>';
}

function hideOverlay() { overlayEl.classList.remove('show'); }

function showIntro() {
  phase = 'intro';
  ovContent.innerHTML = '<div class="ov-emoji">🈵</div><h2>偏旁阵</h2>' +
    '<p class="hint">盘面上全是偏旁部件。<br>点两个<b>相邻</b>的：横排只认左右结构，<br>竖排只认上下结构，包围框（囗门辶）不分方向。<br>三个相同部件连成品字 = 晶 · 鑫 · 淼。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开始拼字</button></div>';
  overlayEl.classList.add('show');
  markDiff();
  render();
}

function gameOver(reason) {
  if (phase === 'over') return;
  phase = 'over';
  sel = [];
  store.set('rad.best', Math.max(num('rad.best'), score));
  recordLevel();
  store.set('rad.dex', dexChars().join(''));
  sfx.melody([[440, 0.12], [330, 0.14], [220, 0.22]]);
  ovContent.innerHTML = '<div class="ov-emoji">' + (reason === '死局' ? '🧱' : '⌛') + '</div>' +
    '<h2>' + (reason === '死局' ? '一个也拼不出了' : '步数用尽') + '</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">停在第 ' + level + ' 关 · 本局合成 ' + merged + ' 字 · 图鉴已收 ' + dexChars().length + ' 字</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="dex">看图鉴</button></div>';
  overlayEl.classList.add('show');
  render();
}

/* ==================== 事件绑定 ==================== */
ovContent.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  var act = t && t.dataset ? t.dataset.act : null;
  if (!act) return;
  sfx.resume();
  if (act === 'start' || act === 'again') newRun();
  else if (act === 'dex') showDex();
  else if (act === 'close') hideOverlay();
});

byId('diff').addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('[data-diff]') : null;
  if (!t || !t.dataset.diff) return;
  sfx.resume();
  newRun(t.dataset.diff);
});

gridEl.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('.cell') : null;
  if (t) sfx.resume();
});

byId('btnHint').addEventListener('click', function () { sfx.resume(); useHint(); });
byId('btnShuffle').addEventListener('click', function () { sfx.resume(); useShuffle(); });
byId('btnDex').addEventListener('click', function () { sfx.resume(); showDex(); });
byId('btnNew').addEventListener('click', function () { sfx.resume(); newRun(); });
soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });

window.addEventListener('keydown', function (e) {
  var k = e.key;
  if (k === 'h' || k === 'H') useHint();
  else if (k === 's' || k === 'S') useShuffle();
  else if (k === 'd' || k === 'D') showDex();
  else if (k === 'n' || k === 'N') newRun();
  else if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); }
  else if (k === 'Escape') { sel = []; hideOverlay(); render(); }
});

/* ==================== 启动 ==================== */
(function boot() {
  diff = store.get('rad.diff', 'normal');
  if (!DIFFS[diff]) diff = 'normal';
  loadDex();
  buildTable(diff);
  buildCells();
  fillBoard();
  syncSound();
  showIntro();
})();

})();
