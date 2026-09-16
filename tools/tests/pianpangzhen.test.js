'use strict';
/* 偏旁阵：方位即结构（横排只认左右、竖排只认上下、包围框不分方向）→ 品字三连 →
   字表自洽 → 步数/关卡经济 → 死局自动洗牌与洗牌耗尽 → 图鉴与纪录写入。 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = 'window.__p = {' +
  ' st: () => ({ phase, level, need, made, merged, steps, score, combo, hints, shuffles, diff: diff,' +
  '   dex: Object.keys(dex).length, chars: CHARS.length, pool: POOL.length, entries: ENTRIES.length }),' +
  ' board: () => board.slice(), setBoard: (b) => { board = b.slice(); sel = []; render(); },' +
  ' tap: tapCell, combine, findMoves, tripleChar, lform: isLTromino, at, playable: ensurePlayable,' +
  ' newRun, hint: useHint, shuffleTool: useShuffle, buildTable, tagOf, table: () => ({ LR, TB, ENC, TRI }),' +
  ' look: () => ({ lr: LOOK.lr, tb: LOOK.tb, enc: LOOK.enc, tris: TRIS, diffs: DIFFS, cols: COLS, rows: ROWS }),' +
  ' setScore: (v) => { score = v; render(); }, setSteps: (v) => { steps = v; render(); },' +
  ' setShuffles: (v) => { shuffles = v; }, setHints: (v) => { hints = v; },' +
  ' text: (i) => (cellEls[i] ? String(cellEls[i].textContent) : null),' +
  ' cls: (i) => (cellEls[i] ? cellEls[i]._cls.join(" ") : ""),' +
  ' cellCount: () => cellEls.length, msg: () => msgEl.innerHTML, dexStr: () => dexChars().join(""),' +
  '}\n';
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('偏旁阵源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const D = (g) => g.ctx.__p;
const st = (g) => D(g).st();
const C = (g) => D(g).look().cols;
const R = (g) => D(g).look().rows;
const idx = (g, c, r) => r * C(g) + c;
// 空格用 〇 占位：它不在任何字表里，所以不会凭空多出可拼的对
function layout(g, cells) {
  const b = new Array(C(g) * R(g)).fill('〇');
  for (const one of cells) b[idx(g, one[0], one[1])] = one[2];
  D(g).setBoard(b);
  return b;
}

function boot(storage) {
  const g = loadGame('pianpangzhen', { transform: inject, storage: storage || {} });
  g.pump(0.3);
  g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'start').dispatch('click');
  g.pump(0.2);
  return g;
}

/* ==================== 一、字表自洽 ==================== */
let g = boot();
const T = D(g).table();
let bad = [];
const seenPair = {};
for (const one of [['lr', T.LR], ['tb', T.TB], ['enc', T.ENC]]) {
  for (const row of one[1]) {
    const a = row[0], b = row[1], ch = row[2];
    if ([...a].length !== 1 || [...b].length !== 1 || [...ch].length !== 1) bad.push(one[0] + ':' + row.join('+'));
    if (a === ch || b === ch) bad.push('自引用 ' + one[0] + ':' + row.join('+'));
    if (a === '〇' || b === '〇') bad.push('占位部件混进字表 ' + row.join('+'));
    const key = one[0] + a + b;
    if (seenPair[key] && seenPair[key] !== ch) bad.push('同一对部件映射到两个字 ' + key);
    seenPair[key] = ch;
  }
}
chk(bad.length === 0, '三张字表共 ' + (T.LR.length + T.TB.length + T.ENC.length) + ' 条，字段/自引用/映射冲突全部干净' +
  (bad.length ? ' —— 问题：' + bad.slice(0, 3).join(' | ') : ''));
chk(T.TRI.length === 10, '品字形表 10 条（品晶森淼焱垚鑫犇磊众）');
const chCount = {};
for (const row of [].concat(T.LR, T.TB, T.ENC)) chCount[row[2]] = (chCount[row[2]] || 0) + 1;
chk(Object.keys(chCount).every((ch) => chCount[ch] === 1),
  '没有一个字能被两种方式拼出来（不会出现"横着也是它、竖着也是它"）');

/* ==================== 二、方位决定结构 ==================== */
layout(g, [[2, 2, '日'], [3, 2, '月']]);
let m = D(g).combine(idx(g, 2, 2), idx(g, 3, 2));
chk(m && m.ch === '明' && m.kind === 'lr', '日左月右（横排）→ 明');
chk(D(g).combine(idx(g, 3, 2), idx(g, 2, 2)).ch === '明', '先点哪个都一样：认的是空间方位，不是点击顺序');
layout(g, [[2, 2, '月'], [3, 2, '日']]);
chk(D(g).combine(idx(g, 2, 2), idx(g, 3, 2)) === null, '月左日右 → 拼不成（左右部件不能颠倒）');
layout(g, [[2, 2, '日'], [2, 3, '月']]);
chk(D(g).combine(idx(g, 2, 2), idx(g, 2, 3)) === null, '日月竖着贴 → 拼不成（左右结构不许竖拼）');
layout(g, [[2, 2, '宀'], [2, 3, '子']]);
chk(D(g).combine(idx(g, 2, 2), idx(g, 2, 3)).ch === '字', '宀上子下（竖排）→ 字');
layout(g, [[2, 2, '子'], [2, 3, '宀']]);
chk(D(g).combine(idx(g, 2, 2), idx(g, 2, 3)) === null, '子在上、宀在下 → 拼不成');
layout(g, [[2, 2, '宀'], [3, 2, '子']]);
chk(D(g).combine(idx(g, 2, 2), idx(g, 3, 2)) === null, '上下结构横着贴 → 拼不成');
layout(g, [[1, 1, '囗'], [1, 2, '玉']]);
chk(D(g).combine(idx(g, 1, 1), idx(g, 1, 2)).ch === '国', '包围框不分方向：囗在上、玉在下也算 国');
layout(g, [[1, 1, '玉'], [2, 1, '囗']]);
chk(D(g).combine(idx(g, 1, 1), idx(g, 2, 1)).ch === '国', '框在右边、横着贴也认 国');
layout(g, [[1, 1, '木'], [1, 3, '子']]);
chk(D(g).findMoves().length === 0, '隔着一格不算相邻（木与子拉开两行就没步了）');
layout(g, [[1, 1, '木'], [2, 2, '子']]);
chk(D(g).findMoves().length === 0, '斜对角不算相邻');
layout(g, [[1, 1, '日'], [1, 2, '十']]);
chk(D(g).findMoves().length === 1, '全盘只留一处可拼时，findMoves 恰好报 1 步');

/* ==================== 三、品字形三连 ==================== */
const tri = (g, cells) => D(g).tripleChar(cells.map((x) => idx(g, x[0], x[1])));
layout(g, [[2, 2, '日'], [2, 3, '日'], [3, 3, '日']]);
chk(D(g).lform([idx(g, 2, 2), idx(g, 2, 3), idx(g, 3, 3)]), '2×2 缺一角 = 品字 L 形');
chk(tri(g, [[2, 2, '日'], [2, 3, '日'], [3, 3, '日']]).ch === '晶', '三个 日 连成 L → 晶');
layout(g, [[2, 2, '口'], [3, 2, '口'], [3, 3, '口']]);
chk(tri(g, [[2, 2, '口'], [3, 2, '口'], [3, 3, '口']]).ch === '品', '换个朝向的 L 也算：口口口 → 品');
layout(g, [[2, 2, '日'], [2, 3, '日'], [2, 4, '日']]);
chk(tri(g, [[2, 2, '日'], [2, 3, '日'], [2, 4, '日']]) === null, '三个 日 排成一条直线不算品字');
layout(g, [[2, 2, '艹'], [2, 3, '艹'], [3, 3, '艹']]);
chk(tri(g, [[2, 2, '艹'], [2, 3, '艹'], [3, 3, '艹']]) === null, '没有三叠字的部件（艹）连成品字也不算');
layout(g, [[2, 2, '日'], [2, 3, '日'], [3, 3, '木']]);
chk(tri(g, [[2, 2, '日'], [2, 3, '日'], [3, 3, '木']]) === null, '三格里混进别的部件就不算');

/* 走一遍真实点击：两格同部件时会等着第三格 */
g = boot();
layout(g, [[2, 2, '日'], [3, 2, '日'], [3, 3, '日']]);
const t0 = st(g);
D(g).tap(idx(g, 2, 2));
D(g).tap(idx(g, 3, 2));
chk(st(g).made === t0.made && /再找一个连成品字/.test(D(g).msg()), '横着两个 日 拼不成字，但会等你找第三个：' + D(g).msg());
D(g).tap(idx(g, 3, 3));
chk(st(g).made === t0.made + 1 && st(g).score - t0.score >= 40, '第三格点下 → 合成 晶，分值远高于普通字（+' + (st(g).score - t0.score) + '）');

/* ==================== 四、合成账目 ==================== */
g = boot();
D(g).setScore(0);
// 多留一对 日/月 当备胎：整盘用占位符填时合成后可能无路可拼，会自动洗牌把下面的位置断言全打乱
layout(g, [[2, 2, '日'], [3, 2, '月'], [2, 4, '日'], [3, 4, '月']]);
const a0 = st(g);
D(g).tap(idx(g, 2, 2)); D(g).tap(idx(g, 3, 2));
const a1 = st(g);
chk(a1.made === a0.made + 1, '拼对一步 → 本关进度 +1');
chk(a1.combo === a0.combo + 1, '连击 +1');
chk(a1.score > a0.score, '拼对一步 → 加分（' + a1.score + '）');
chk(a1.steps === a0.steps - 1, '合成同样消耗一步');
chk(a1.dex === a0.dex + 1 && D(g).dexStr().indexOf('明') >= 0, '拼出的 明 进了图鉴');
chk(/<b>明<\/b> 左右结构/.test(D(g).msg()), '消息条讲清拼成了什么、什么结构：' + D(g).msg());
const bd = D(g).board();
chk(bd[idx(g, 2, 2)] !== '' && bd[idx(g, 2, 3)] !== '', '消掉两格后上方下落、顶上补新部件，不留空洞');
chk(bd.indexOf('') < 0, '下落 + 补充之后盘面上没有空格');
chk(bd[idx(g, 2, 0)] !== '〇' && bd[idx(g, 3, 0)] !== '〇', '新部件从各自那一列的最上方补进来');
chk(bd[idx(g, 2, 6)] === '〇', '消掉的两格靠上方下落补齐，下方不动（下落方向正确）');

layout(g, [[2, 2, '日'], [3, 2, '月']]);
const d0 = st(g);
const before2 = st(g);
D(g).tap(idx(g, 2, 2)); D(g).tap(idx(g, 3, 2));
chk(st(g).dex === d0.dex, '再拼一次 明 不会重复计入图鉴');
chk(st(g).score - before2.score < 60, '第二次拼同一个字分数明显更低（没有 +25 新字奖）：+' + (st(g).score - before2.score));

/* ==================== 五、拼错吃步 ==================== */
g = boot();
layout(g, [[2, 2, '月'], [3, 2, '日']]);
const e0 = st(g);
D(g).tap(idx(g, 2, 2)); D(g).tap(idx(g, 3, 2));
const e1 = st(g);
chk(e1.combo === 0, '拼不成 → 连击清零');
chk(e1.steps === e0.steps - 1, '拼不成也照扣一步（这就是难度所在）');
chk(e1.score === e0.score && e1.made === e0.made, '拼不成不加分也不推进度');
chk(/拼不成/.test(D(g).msg()), '失败有说明：' + D(g).msg());
layout(g, [[2, 2, '日'], [4, 2, '月']]);
const f0 = st(g);
D(g).tap(idx(g, 2, 2)); D(g).tap(idx(g, 4, 2));
chk(st(g).steps === f0.steps && st(g).combo === f0.combo, '点两个不相邻的格子只是换选中，不罚步');

/* ==================== 六、关卡经济 ==================== */
g = boot();
chk(st(g).level === 1 && st(g).need === 5 && st(g).steps === 10, '第 1 关：拼 5 个字、预算 10 步');
for (let k = 0; k < 8 && st(g).phase === 'play' && st(g).level === 1; k++) {
  const mv = D(g).findMoves().find((x) => x.length === 2);
  if (!mv) break;
  D(g).tap(mv[0]); D(g).tap(mv[1]);
}
chk(st(g).level === 2, '拼满 5 个 → 升到第 2 关');
chk(st(g).need === 6 && st(g).steps === 11, '第 2 关要 6 个字、步数预算重发（6+5）：' + st(g).need + '/' + st(g).steps);
chk(st(g).made === 0, '本关进度清零');
chk(/升到第 2 关/.test(D(g).msg()), '升关写进消息，并把剩余步折成分数：' + D(g).msg());

g = boot();
D(g).setSteps(1);
const lv0 = st(g).level;
layout(g, [[2, 2, '月'], [3, 2, '日']]);
D(g).tap(idx(g, 2, 2)); D(g).tap(idx(g, 3, 2));
chk(st(g).phase === 'over', '最后一步拼错 → 步数用尽，本局结束');
chk(/步数用尽/.test(g.byId('overlayContent').innerHTML), '结算面板写明结束原因');
chk(Number(g.storage.getItem('rad.best')) >= 0 && g.storage.getItem('rad.level') !== null,
  '结束时写入 rad.best 与 rad.level（level=' + g.storage.getItem('rad.level') + '）');

/* ==================== 七、死局与洗牌 ==================== */
g = boot();
layout(g, []);
D(g).setShuffles(2);
chk(D(g).findMoves().length === 0, '人造一个无解盘面');
D(g).playable();
chk(st(g).shuffles === 1, '无处可拼 → 自动洗一次牌，次数 -1');
chk(D(g).findMoves().length > 0, '洗完之后确实有步可走');
layout(g, []);
D(g).setShuffles(0);
D(g).playable();
chk(st(g).phase === 'over', '洗牌次数用尽又无处可拼 → 判死局结束');
chk(/拼不出/.test(g.byId('overlayContent').innerHTML), '结算文案区分死局：' + (g.byId('overlayContent').innerHTML.match(/<h2>[^<]+/) || [''])[0]);
g = boot();
layout(g, []);
D(g).setShuffles(0);
const sh0 = st(g).shuffles;
D(g).shuffleTool();
chk(st(g).shuffles === sh0 && st(g).phase === 'play', '没有次数时手动洗牌不生效');
chk(/用完/.test(D(g).msg()), '并且会说明：' + D(g).msg());
D(g).setShuffles(1);
D(g).shuffleTool();
chk(st(g).shuffles === 0 && st(g).combo === 0, '手动洗牌会消耗次数并清空连击');

/* ==================== 八、提示 ==================== */
g = boot();
layout(g, [[2, 2, '日'], [3, 2, '月']]);
D(g).setHints(2);
const h0 = st(g).hints;
D(g).hint();
chk(st(g).hints === h0 - 1, '点提示扣一次');
const hl = [];
for (let i = 0; i < D(g).cellCount(); i++) if (/hint/.test(D(g).cls(i))) hl.push(i);
chk(hl.length >= 1, '提示给可拼的格子加上 .hint（高亮 ' + hl.length + ' 格）');
D(g).setHints(0);
D(g).hint();
chk(/没有提示/.test(D(g).msg()), '提示用光时说清楚：' + D(g).msg());

/* ==================== 九、难度与部件池 ==================== */
g = boot();
D(g).newRun('easy');
const easySet = {};
D(g).look().diffs.easy.pool.forEach((x) => { easySet[x] = 1; });
const offEasy = D(g).board().filter((x) => !easySet[x]);
chk(offEasy.length === 0, '新手档盘面只会出现常用部件（越界 ' + offEasy.length + ' 格）');
chk(st(g).entries > 20 && st(g).entries < T.LR.length + T.TB.length + T.ENC.length,
  '新手档字表按部件过滤后 ' + st(g).entries + ' 条（全表 ' + (T.LR.length + T.TB.length + T.ENC.length) + ' 条）');
chk(st(g).hints === 5 && st(g).shuffles === 5 && st(g).steps === 12, '新手档更宽松：5 提示 / 5 洗牌 / 每关多 7 步');
D(g).newRun('hard');
chk(st(g).hints === 1 && st(g).shuffles === 2 && st(g).steps === 9, '最难档收紧到 1 提示 / 2 洗牌 / 每关多 4 步');
chk(st(g).chars > 300, '标准全字表可达 ' + st(g).chars + ' 个字');

/* ==================== 十、渲染、纪录与静音 ==================== */
g = boot();
chk(D(g).cellCount() === C(g) * R(g), 'DOM 里有 ' + D(g).cellCount() + ' 个格子（' + C(g) + '×' + R(g) + '）');
layout(g, [[2, 2, '日'], [3, 2, '月']]);
chk(D(g).text(idx(g, 2, 2)) === '日' && D(g).text(idx(g, 3, 2)) === '月', '格子里的字与数据一致');
chk(/↔/.test(D(g).tagOf('日')), '日 的角标含 ↔（能左右拼）：' + D(g).tagOf('日'));
chk(/↕/.test(D(g).tagOf('宀')), '宀 的角标含 ↕（能当字头）：' + D(g).tagOf('宀'));
chk(/△/.test(D(g).tagOf('口')), '口 的角标含 △（能三叠成品字）：' + D(g).tagOf('口'));
D(g).tap(idx(g, 2, 2));
chk(/sel/.test(D(g).cls(idx(g, 2, 2))), '选中的格子带 .sel');
D(g).tap(idx(g, 2, 2));
chk(!/sel/.test(D(g).cls(idx(g, 2, 2))), '再点一次取消选中');

const g2 = boot({ 'rad.best': '99999', 'rad.level': '9', 'rad.dex': '明好妈', 'rad.diff': 'hard' });
chk(st(g2).diff === 'hard', '开局读回上次选的难度');
chk(st(g2).dex === 3, '开局读回图鉴：已收 3 字');
layout(g2, [[2, 2, '日'], [3, 2, '月']]);
D(g2).tap(idx(g2, 2, 2)); D(g2).tap(idx(g2, 3, 2));
chk(Number(g2.storage.getItem('rad.best')) === 99999, '分数没超过旧纪录时不覆盖 rad.best');
chk(g2.storage.getItem('rad.dex').length === 3, '明 已在图鉴里 → 键长度不变');
D(g2).newRun('easy');
chk(g2.storage.getItem('rad.diff') === 'easy', '换难度会写回 rad.diff');

const g3 = boot({ 'rad.muted': '1' });
const osc = g3.audio.created.osc;
layout(g3, [[2, 2, '日'], [3, 2, '月']]);
D(g3).tap(idx(g3, 2, 2)); D(g3).tap(idx(g3, 3, 2));
chk(g3.audio.created.osc === osc, '静音档位下拼字不发声');
chk(g3.byId('btnSound').textContent === '🔇', '静音状态反映在按钮上');

/* 键盘 */
const g4 = boot();
const steps0 = st(g4).steps;
g4.key('s');
chk(st(g4).shuffles === D(g4).st().shuffles && st(g4).steps === steps0, '按 S 洗牌不吃步数');
g4.key('h');
chk(st(g4).hints === 2 || st(g4).hints === 4, '按 H 用掉一次提示');
g4.key('Escape');
chk(!/show/.test(g4.byId('overlay')._cls.join(' ')), '按 Esc 收起遮罩');

summary('偏旁阵', fails);
