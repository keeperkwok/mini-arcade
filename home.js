(() => {
'use strict';

// 新增游戏:1) 在本目录新建文件夹(如 2048/)放入 index.html 等文件
//          2) 在 GAMES 数组中添加一条记录(href 指向新文件夹)
//          3) 想让用户在首页看到本机纪录,再补 prefix 与 records() 即可
const GAMES = [
  {
    id: 'snake',
    emoji: '🐍',
    name: '贪吃蛇',
    desc: '经典街机复刻,平滑动画、粒子特效与限时金星挑战。',
    tags: ['经典', '反应'],
    href: 'snake/index.html',
    prefix: 'snake.',
    records: () => [scoreRec('snake.best', '分')],
    totals: () => [num('snake.best')],
  },
  {
    id: 'bingfeng',
    emoji: '🐝',
    name: '兵蜂大作战',
    desc: 'TwinBee 风格云端射击:打云掉铃铛、变色强化、连击加分、BOSS 大战。',
    tags: ['经典', '射击'],
    href: 'bingfeng/index.html',
    prefix: 'twinbee.',
    records: () => [scoreRec('twinbee.best', '分')],
    totals: () => [num('twinbee.best')],
  },
  {
    id: 'contra',
    emoji: '🪖',
    name: '魂斗罗',
    desc: '经典横版突击:八方向射击、机枪/散射/激光强化、摧毁要塞 BOSS。',
    tags: ['经典', '射击'],
    href: 'contra/index.html',
    prefix: 'contra.',
    records: () => [scoreRec('contra.best', '分')],
    totals: () => [num('contra.best')],
  },
  {
    id: '2048',
    emoji: '🔢',
    name: '2048',
    desc: '滑动合并数字、动画顺滑过渡,合成 2048 还能继续冲击更高分。',
    tags: ['益智'],
    href: '2048/index.html',
    prefix: '2048.',
    records: () => [scoreRec('2048.best', '分')],
    totals: () => [num('2048.best')],
  },
  {
    id: 'tetris',
    emoji: '🧱',
    name: '俄罗斯方块',
    desc: 'SRS 旋转与墙踢、幽灵投影、暂存方块、连击加分、触屏拖动操作。',
    tags: ['经典', '益智'],
    href: 'tetris/index.html',
    prefix: 'tetris.',
    records: () => [scoreRec('tetris.best', '分')],
    totals: () => [num('tetris.best')],
  },
  {
    id: 'minesweeper',
    emoji: '💣',
    name: '扫雷',
    desc: '三档难度、首点必安全、长按/右键插旗、数字快速翻开。',
    tags: ['益智'],
    href: 'minesweeper/index.html',
    prefix: 'minesweeper.',
    records: () => [timeRec([
      { key: 'minesweeper.best.beginner', name: '初级' },
      { key: 'minesweeper.best.intermediate', name: '中级' },
      { key: 'minesweeper.best.expert', name: '高级' },
    ])],
  },
  {
    id: 'solitaire',
    emoji: '🃏',
    name: '纸牌接龙',
    desc: 'Klondike 全规则:拖拽/点选双交互、提示、无限撤销、自动收牌。',
    tags: ['经典', '纸牌'],
    href: 'solitaire/index.html',
    prefix: 'klondike.',
    records: () => [
      scoreRec('klondike.best.1', '翻 1 张'),
      scoreRec('klondike.best.3', '翻 3 张'),
    ],
    totals: () => [num('klondike.best.1'), num('klondike.best.3')],
  },
  {
    id: 'sonar',
    emoji: '📡',
    name: '声纳扫雷',
    desc: '全黑海域靠声纳听位：波纹扫过的格子只亮 1.5 秒，确认才能永久点亮。',
    tags: ['益智', '记忆'],
    href: 'sonar/index.html',
    prefix: 'sonar.',
    records: () => [timeRec([
      { key: 'sonar.best.easy', name: '近海' },
      { key: 'sonar.best.medium', name: '海峡' },
      { key: 'sonar.best.hard', name: '深海' },
    ]), scoreRec('sonar.best', '分')],
    totals: () => [num('sonar.best')],
  },
  {
    id: 'spider',
    emoji: '🕷️',
    name: '蜘蛛纸牌',
    desc: '两副牌 104 张、10 列大场面:凑齐 8 组同花色 K→A 即通关。',
    tags: ['经典', '纸牌'],
    href: 'spider/index.html',
    prefix: 'spider.',
    // 蜘蛛纸牌起手 500 分,只有超过起步分才算真纪录
    records: () => [
      scoreRec('spider.best.1', '单花色', 500),
      scoreRec('spider.best.2', '双花色', 500),
      scoreRec('spider.best.4', '四花色', 500),
    ],
    totals: () => [num('spider.best.1'), num('spider.best.2'), num('spider.best.4')].map((v) => Math.max(0, v - 500)),
  },
  {
    id: 'match3',
    emoji: '🍉',
    name: '水果消消乐',
    desc: '关卡目标制三消:4 连十字宝石、5 连炸弹宝石、连锁引爆、死局自动洗牌。',
    tags: ['益智', '消除'],
    href: 'match3/index.html',
    prefix: 'match3.',
    records: () => [levelRec('match3.level', '已通到第'), scoreRec('match3.best', '分')],
    totals: () => [num('match3.best')],
  },
  {
    id: 'sudoku',
    emoji: '🧮',
    name: '数独',
    desc: '五档难度、题题唯一解:铅笔笔记、提示、无限撤销,还能关掉页面接着下。',
    tags: ['益智', '数字'],
    href: 'sudoku/index.html',
    prefix: 'sudoku.',
    records: () => [timeRec([
      { key: 'sudoku.best.easy', name: '入门' },
      { key: 'sudoku.best.medium', name: '简单' },
      { key: 'sudoku.best.hard', name: '中等' },
      { key: 'sudoku.best.expert', name: '困难' },
      { key: 'sudoku.best.master', name: '专家' },
    ])],
    resume: () => {
      const s = json('sudoku.save');
      if (!s || !Array.isArray(s.values)) return null;
      const filled = s.values.filter((v) => v > 0).length;
      if (!filled) return null;
      const names = { easy: '入门', medium: '简单', hard: '中等', expert: '困难', master: '专家' };
      return '继续未完局 · ' + (names[s.diff] || '数独') + ' · 已填 ' + filled + '/81 · ' + fmtTime(s.seconds || 0);
    },
  },
  {
    id: 'kenken',
    emoji: '➗',
    name: '算独',
    desc: '带运算的数独：每行每列不重复，粗线笼里的数字要能凑出目标数与运算。',
    tags: ['益智', '数字'],
    href: 'kenken/index.html',
    prefix: 'kenken.',
    records: () => [timeRec([
      { key: 'kenken.best.easy', name: '四宫' },
      { key: 'kenken.best.medium', name: '五宫' },
      { key: 'kenken.best.hard', name: '六宫' },
      { key: 'kenken.best.expert', name: '六宫·难' },
    ])],
    resume: () => {
      const s = json('kenken.save');
      if (!s || !Array.isArray(s.values) || !Array.isArray(s.cages) || !s.cages.length) return null;
      const givens = s.cages.filter((c) => typeof c === 'string' && c.indexOf('=|') === 0).length;
      const blank = s.values.length - givens;
      const filled = s.values.filter((v) => v > 0).length - givens;
      if (!(filled > 0) || !(blank > 0) || filled >= blank) return null;
      const names = { easy: '四宫', medium: '五宫', hard: '六宫', expert: '六宫·难' };
      return '继续未完局 · ' + (names[s.diff] || '算独') + ' · 已填 ' + filled + '/' + blank + ' · ' + fmtTime(s.seconds || 0);
    },
  },
  {
    id: 'xigua',
    emoji: '🍈',
    name: '合成大西瓜',
    desc: '手写圆形刚体物理:同果相碰合成更大一颗,连锁爆分,堆过危险线就输。',
    tags: ['休闲', '物理'],
    href: 'xigua/index.html',
    prefix: 'xigua.',
    records: () => [scoreRec('xigua.best', '分')],
    totals: () => [num('xigua.best')],
  },
  {
    id: 'plinko',
    emoji: '🎰',
    name: '幸运弹珠台',
    desc: '弹珠 + Roguelike：撞钉攒分、外侧槽翻倍，每轮三选一强化滚雪球。',
    tags: ['休闲', '构筑', '物理'],
    href: 'plinko/index.html',
    prefix: 'plinko.',
    records: () => [roundRec('plinko.round', '最远撑到第'), scoreRec('plinko.best', '分')],
    totals: () => [num('plinko.best')],
  },
  {
    id: 'luosi',
    emoji: '🔩',
    name: '拧螺丝',
    desc: '多层板材拆解:被上层压住的螺丝拧不动,同色凑满 3 颗销毁,7 格塞满即败。',
    tags: ['益智', '解压'],
    href: 'luosi/index.html',
    prefix: 'luosi.',
    records: () => [levelRec('luosi.level', '最远到第'), scoreRec('luosi.best', '分')],
    totals: () => [num('luosi.best')],
  },
  {
    id: 'fanpai',
    emoji: '🀄',
    name: '翻牌堆',
    desc: '多层牌墙一张压一张：被压住的看不见图案也拿不走，翻开才取得走。',
    tags: ['益智', '消除'],
    href: 'fanpai/index.html',
    prefix: 'fanpai.',
    records: () => [levelRec('fanpai.level', '最远到第'), scoreRec('fanpai.best', '分')],
    totals: () => [num('fanpai.best')],
  },
  {
    id: 'zuma',
    emoji: '🐸',
    name: '祖玛珠链',
    desc: '珠子沿轨道往洞口爬：转炮台吐珠，同色三连即爆，消得越多顶得越回去。',
    tags: ['经典', '消除'],
    href: 'zuma/index.html',
    prefix: 'zuma.',
    records: () => [levelRec('zuma.level', '最远到第'), scoreRec('zuma.best', '分')],
    totals: () => [num('zuma.best')],
  },
  {
    id: 'nonogram',
    emoji: '🧩',
    name: '数织',
    desc: '行首列首的数字就是线索：纯逻辑推出像素画，涂错当场提醒，还能接着上次的拼。',
    tags: ['益智', '图形'],
    href: 'nonogram/index.html',
    prefix: 'nonogram.',
    records: () => [timeRec([
      { key: 'nonogram.best.easy', name: '5×5' },
      { key: 'nonogram.best.medium', name: '10×10' },
      { key: 'nonogram.best.hard', name: '15×15' },
      { key: 'nonogram.best.expert', name: '20×20' },
    ])],
    resume: () => {
      const s = json('nonogram.save');
      if (!s || typeof s.sol !== 'string' || typeof s.cell !== 'string') return null;
      if (s.cell.length !== s.sol.length) return null;
      const need = s.sol.split('').filter((ch) => ch === '1').length;
      const done = s.cell.split('').filter((ch) => ch === '1').length;
      if (!need || !done || done >= need) return null;
      const names = { easy: '5×5', medium: '10×10', hard: '15×15', expert: '20×20' };
      return '继续未完局 · ' + (names[s.diff] || '数织') + ' · 已涂 ' + done + '/' + need + ' 格 · ' + fmtTime(s.seconds || 0);
    },
  },
  {
    id: 'cube',
    emoji: '🧊',
    name: '魔方',
    desc: '没引 3D 库：贴纸逐块投影、剔背面、按远近排序画出来，按住贴纸拖就能转层。',
    tags: ['益智', '空间'],
    href: 'cube/index.html',
    prefix: 'cube.',
    records: () => [timeRec([
      { key: 'cube.best.2', name: '二阶' },
      { key: 'cube.best.3', name: '三阶' },
      { key: 'cube.best.4', name: '四阶' },
    ])],
    resume: () => {
      const s = json('cube.save');
      if (!s || !Array.isArray(s.faces) || s.faces.length !== 6) return null;
      const n = Number(s.size) || 0;
      if (!(n >= 2 && n <= 4) || s.faces.some((row) => typeof row !== 'string' || row.length !== n * n)) return null;
      const moved = Number(s.moves) || 0;
      if (!moved) return null;
      return '继续未完局 · ' + n + ' 阶魔方 · 已转 ' + moved + ' 步 · ' + fmtTime(s.seconds || 0);
    },
  },
  {
    id: 'wuziqi',
    emoji: '⚫',
    name: '五子棋',
    desc: '15×15 木盘连成五子：三档 AI 会做棋也会堵，双人对战、悔棋提示、五连高亮。',
    tags: ['对战', '棋类'],
    href: 'wuziqi/index.html',
    prefix: 'wuziqi.',
    records: () => [scoreRec('wuziqi.wins', '胜'), scoreRec('wuziqi.streak', '连胜')],
    totals: () => [num('wuziqi.wins')],
    resume: () => {
      const s = json('wuziqi.save');
      if (!s || !Array.isArray(s.mv) || !s.mv.length) return null;
      const names = { easy: '新手', mid: '棋友', hard: '高手' };
      return '继续未完局 · 五子棋 · 已下 ' + s.mv.length + ' 手 · 轮到' +
        (s.mv.length % 2 ? '白' : '黑') + (names[s.m] ? ' · vs ' + names[s.m] + ' AI' : ' · 双人对战');
    },
  },
  {
    id: 'xiangqi',
    emoji: '🐉',
    name: '中国象棋',
    desc: '完整规则带应将：蹩马腿、塞象眼、隔山打炮、白脸将，中文记谱、三档 AI、可换边。',
    tags: ['对战', '棋类'],
    href: 'xiangqi/index.html',
    prefix: 'xiangqi.',
    records: () => [scoreRec('xiangqi.wins', '胜'), scoreRec('xiangqi.streak', '连胜')],
    totals: () => [num('xiangqi.wins')],
    resume: () => {
      const s = json('xiangqi.save');
      if (!s || typeof s.bd !== 'string' || s.bd.length !== 90) return null;
      const plies = Array.isArray(s.mv) ? s.mv.length : 0;
      if (!plies && !/[1-9]/.test(s.bd)) return null;
      const names = { easy: '新手', mid: '棋友', hard: '高手' };
      const who = names[s.m] ? (Number(s.s) === -1 ? '你执黑 · vs ' + names[s.m] + ' AI' : '你执红 · vs ' + names[s.m] + ' AI')
        : '轮到' + (Number(s.t) === -1 ? '黑' : '红');
      return '继续未完局 · 中国象棋 · 已走 ' + plies + ' 步 · ' + who;
    },
  },
  {
    id: 'reversi',
    emoji: '🌓',
    name: '黑白棋',
    desc: '夹住就翻色：位置权重 + 机动性 + 残局算子的 AI，走不动自动弃权，见分比子数。',
    tags: ['对战', '棋类'],
    href: 'reversi/index.html',
    prefix: 'reversi.',
    records: () => [scoreRec('reversi.wins', '胜'), scoreRec('reversi.streak', '连胜')],
    totals: () => [num('reversi.wins')],
    resume: () => {
      const s = json('reversi.save');
      if (!s || !Array.isArray(s.mv) || !s.mv.length) return null;
      return '继续未完局 · 黑白棋 · 第 ' + (s.mv.length + 1) + ' 手 · 轮到' + (Number(s.t) === 2 ? '白' : '黑');
    },
  },
  {
    id: 'siziqi',
    emoji: '🔴',
    name: '四子棋',
    desc: '重力落子抢连线：横竖斜先连四子者胜，AI 先赢后堵、还会算多层陷阱。',
    tags: ['对战', '棋类'],
    href: 'siziqi/index.html',
    prefix: 'siziqi.',
    records: () => [scoreRec('siziqi.wins', '胜'), scoreRec('siziqi.streak', '连胜')],
    totals: () => [num('siziqi.wins')],
    resume: () => {
      const s = json('siziqi.save');
      if (!s || !Array.isArray(s.mv) || !s.mv.length) return null;
      return '继续未完局 · 四子棋 · 已落 ' + s.mv.length + ' 子 · 轮到' + (s.mv.length % 2 ? '黄' : '红');
    },
  },
  {
    id: 'baozhiqi',
    emoji: '🧺',
    name: '保质期',
    desc: '整仓货和你都在倒计时：走一步全场老一格，还能把自己的鲜度倒给相邻那格让它停下。',
    tags: ['益智', '策略'],
    href: 'baozhiqi/index.html',
    prefix: 'baozhiqi.',
    records: () => [levelRec('baozhiqi.level', '最远到第'), scoreRec('baozhiqi.best', '分')],
    totals: () => [num('baozhiqi.best')],
  },
];

/* ==================== 本机存储读取 ==================== */
const store = {};
try {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) store[k] = localStorage.getItem(k);
  }
} catch (e) { /* 隐私模式或 file:// 受限时静默降级为"无纪录" */ }

const num = (k) => {
  const v = Number(store[k]);
  return Number.isFinite(v) ? v : 0;
};
const json = (k) => {
  try { return store[k] ? JSON.parse(store[k]) : null; } catch (e) { return null; }
};
const fmtInt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0');

function scoreRec(key, unit, min) {
  const v = num(key);
  if (v <= (min || 0)) return null;
  return { tone: 'gold', text: '🏆 ' + fmtInt(v) + ' ' + unit };
}
function timeRec(variants) {
  let best = null;
  let done = 0;
  for (const v of variants) {
    const s = num(v.key);
    if (s > 0) {
      done++;
      if (!best || s < best.s) best = { s, name: v.name };
    }
  }
  if (!best) return null;
  const tail = variants.length > 1 ? ' · ' + done + '/' + variants.length + ' 难度' : '';
  return { tone: 'cyan', text: '⏱ ' + fmtTime(best.s) + ' ' + best.name + tail, count: done };
}
function levelRec(key, label) {
  const v = num(key);
  if (v <= 1) return null;
  return { tone: 'amber', text: '🚩 ' + label + ' ' + v + ' 关' };
}
function roundRec(key, label) {
  const v = num(key);
  if (v <= 1) return null;
  return { tone: 'amber', text: '🚩 ' + label + ' ' + v + ' 轮' };
}

// 是否玩过:碰过任意纪录/设置键即算,但只点过静音不算
function isPlayed(g) {
  if (!g.prefix) return false;
  return Object.keys(store).some((k) => k.indexOf(g.prefix) === 0 && k.slice(-6) !== '.muted');
}

function computeViews() {
  return GAMES.map((g) => {
    const recs = (g.records ? g.records() : []).filter(Boolean);
    const total = g.totals ? g.totals().reduce((a, b) => a + (b > 0 ? b : 0), 0) : 0;
    const counted = recs.reduce((n, r) => n + (r.count || (r.text.indexOf('🏆') === 0 ? 1 : 0)), 0);
    return { g, recs, total, counted, played: isPlayed(g), resume: g.resume ? g.resume() : null };
  });
}
let views = computeViews();

/* ==================== 渲染 ==================== */
const grid = document.getElementById('games');
const hud = document.getElementById('hud');
const filtersEl = document.getElementById('filters');
const emptyEl = document.getElementById('empty');
let filter = 'all';

const TAGS = ['all', 'played', 'fresh'];
for (const g of GAMES) {
  for (const t of g.tags) if (TAGS.indexOf(t) < 0) TAGS.push(t);
}

function match(v) {
  if (filter === 'all') return true;
  if (filter === 'played') return v.played;
  if (filter === 'fresh') return !v.played;
  return v.g.tags.indexOf(filter) >= 0;
}

function recHTML(recs) {
  if (!recs.length) return '<div class="rec"><span class="rec-item muted">还没玩过 · 去开一题</span></div>';
  return '<div class="rec">' + recs.slice(0, 2).map((r) =>
    '<span class="rec-item ' + r.tone + '">' + r.text + '</span>').join('') + '</div>';
}

function renderCards() {
  const shown = views.filter(match);
  emptyEl.hidden = shown.length > 0;
  grid.innerHTML = shown.map(({ g, recs, played }, i) => {
    const tags = g.tags.map((t) => '<span>' + t + '</span>').join('');
    const head = '<div class="card-top">' +
      '<span class="card-emoji">' + g.emoji + '</span>' +
      '<h3>' + g.name + (played ? '<i class="tick" title="本机已有纪录">✓</i>' : '') + '</h3>' +
      '<span class="card-cta" aria-hidden="true">▶</span>' +
      '</div>';
    const body = head + '<p>' + g.desc + '</p>' + recHTML(recs) + '<div class="tags">' + tags + '</div>';
    if (g.soon) {
      return '<div class="card soon" style="--i:' + i + '" aria-disabled="true"><span class="badge">即将上线</span>' + body + '</div>';
    }
    return '<a class="card' + (played ? ' played' : '') + '" style="--i:' + i + '" href="' + g.href + '">' + body + '</a>';
  }).join('');
}

function renderHud() {
  const played = views.filter((v) => v.played).length;
  const scoreTotal = views.reduce((a, v) => a + v.total, 0);
  const recCount = views.reduce((a, v) => a + v.counted, 0);
  const resume = views.find((v) => v.resume);
  const stats = '<div class="pstats">' +
    '<div class="pstat"><b>' + played + '<small>/' + GAMES.length + '</small></b><span>玩过</span></div>' +
    '<div class="pstat"><b>' + fmtInt(scoreTotal) + '</b><span>累计最高分</span></div>' +
    '<div class="pstat"><b>' + recCount + '</b><span>项纪录</span></div>' +
    '</div>';
  const pill = resume ? '<a class="pcontinue" href="' + resume.g.href + '"><i>▶</i>' + resume.resume + '</a>' : '';
  const clear = played ? '<button class="pclear" id="btnClearRecs" title="清除本机所有游戏纪录与设置(不影响游戏文件)">清空纪录</button>' : '';
  const origin = location.hostname || 'file:// 本地打开';
  const note = '<p class="pnote">纪录只存在本机浏览器 · 当前来源 ' + origin + ' · 换域名/换设备/无痕窗口都不互通</p>';
  hud.innerHTML = stats + pill + clear + note;
  const btn = document.getElementById('btnClearRecs');
  if (btn) btn.addEventListener('click', clearRecords);
}

function renderFilters() {
  const countOf = (key) => views.filter((v) => (key === 'played' ? v.played : key === 'fresh' ? !v.played : v.g.tags.indexOf(key) >= 0)).length;
  const label = { all: '全部', played: '已玩', fresh: '没玩过' };
  filtersEl.innerHTML = TAGS.map((t) => '<button data-f="' + t + '" aria-pressed="' + (t === filter) + '">' +
    (label[t] || t) + '<small>' + countOf(t) + '</small></button>').join('');
}

function clearRecords() {
  const keys = [];
  for (const g of GAMES) {
    if (!g.prefix) continue;
    for (const k of Object.keys(store)) if (k.indexOf(g.prefix) === 0) keys.push(k);
  }
  const msg = '将清除 ' + keys.length + ' 项本机纪录与设置(最高分、最佳用时、难度选择、静音开关等)。\n各游戏文件不受影响。确定继续?';
  if (!confirm(msg)) return;
  try { for (const k of keys) localStorage.removeItem(k); } catch (e) { return; }
  for (const k of keys) delete store[k];
  boot();
}

function boot() {
  views = computeViews();
  renderHud();
  renderFilters();
  renderCards();
}

filtersEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-f]');
  if (!btn) return;
  filter = btn.dataset.f;
  renderFilters();
  renderCards();
});

boot();

})();
