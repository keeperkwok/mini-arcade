'use strict';
/* 首页进度中心：在 DOM 桩里真跑 home.js，核对卡片/统计/续玩药丸/筛选/清空，
   以及存储被禁时的降级。新增游戏后请顺手补一条卡片纪录断言。 */
const fs = require('fs');
const path = require('path');
const { ok, note, report } = require('./_assert.js');
const { ROOT, read, mountHome, cardHTML, cardIds, chipNames, clickChip } = require('./_home.js');

// 卡片数从 home.js 的 GAMES 里数出来，新增游戏不用再改这个测试
const GAME_COUNT = [...read('home.js').matchAll(/^    id: '[a-z0-9]+',$/gm)].length;
ok(GAME_COUNT >= 19, 'GAMES 注册表读到 ' + GAME_COUNT + ' 条');

/* ==================== 一、有纪录 ==================== */
const seed = {
  'snake.best': '1234', 'snake.muted': '0',
  '2048.best': '20480',
  'match3.level': '7', 'match3.best': '15300', 'match3.types': '111',
  'sudoku.best.medium': '412', 'sudoku.best.hard': '1580',
  'sudoku.save': JSON.stringify({ diff: 'hard', values: Array(81).fill(0).map((_, i) => (i < 30 ? 5 : 0)), seconds: 96 }),
  'spider.best.4': '500',              // 恰好等于起步分：不该算纪录
  'klondike.best.1': '128',
  'minesweeper.best.beginner': '38',
  'luosi.best': '900',
};
const H = mountHome({ seed });
const { grid, hud, filters, empty, storage, reg } = H;

const cards = cardIds(grid);
ok(cards.length === GAME_COUNT, '首页渲染 ' + GAME_COUNT + ' 张卡片（实际 ' + cards.length + '）');
ok(cards.every((id) => fs.existsSync(path.join(ROOT, id, 'index.html'))), '每张卡片的 href 都指向真实文件');
ok(/class="card played/.test(grid.innerHTML), '已玩卡片带 .played 类');
ok(/class="tick"/.test(grid.innerHTML), '已玩卡片带 ✓ 角标');
ok(/🏆 1,234 分/.test(grid.innerHTML), '贪吃蛇显示 🏆 1,234 分');
ok(/🚩 已通到第 7 关/.test(grid.innerHTML), '水果消消乐显示关卡纪录');
ok(/⏱ 6:52 简单 · 2\/5 难度/.test(grid.innerHTML), '数独显示最佳用时与已完成难度数');
ok(!/spider[^"]*" *>[^<]*🏆/.test(grid.innerHTML), '蜘蛛纸牌 500 起步分不算纪录');
ok(/还没玩过/.test(grid.innerHTML), '没玩过的游戏显示占位文案');

const hudHTML = hud.innerHTML;
ok(hudHTML.indexOf('<b>8<small>/' + GAME_COUNT + '</small></b><span>玩过') >= 0, '统计条显示玩过 8/' + GAME_COUNT);
ok(/<b>38,042<\/b>/.test(hudHTML), '累计最高分 38,042（蜘蛛牌已扣起步分）');
ok(/继续未完局 · 中等 · 已填 30\/81 · 1:36/.test(hudHTML), '数独续玩药丸文案正确');
ok(/file:\/\/ 本地打开/.test(hudHTML), 'file:// 打开时提示语正确');
const clearBtn = reg.get('btnClearRecs');
ok(!!clearBtn, 'HUD 里有清空纪录按钮');

/* ==================== 二、筛选 ==================== */
const chips = chipNames(filters);
ok(chips[0] === 'all' && chips[1] === 'played' && chips[2] === 'fresh', '筛选含 全部/已玩/没玩过');
ok(new Set(chips).size === chips.length, '筛选项无重复');
ok(chips.length >= 12, chips.length + ' 个筛选项（3 状态 + ' + (chips.length - 3) + ' 标签）');
ok(/data-f="益智" aria-pressed="false"/.test(filters.innerHTML), '标签筛选处于未选中态');

clickChip(filters, 'fresh');
const fresh = cardIds(grid);
ok(fresh.length === GAME_COUNT - 8 && empty.hidden === true, '没玩过筛选：剩 ' + fresh.length + ' 张，空提示隐藏');
ok(!fresh.some((h) => h === 'snake'), '没玩过结果排除贪吃蛇');
clickChip(filters, 'played');
ok(cardIds(grid).length === 8, '已玩筛选：8 张');
clickChip(filters, '射击');
ok(cardIds(grid).length === 2, '射击标签筛选：2 张');
clickChip(filters, '纸牌');
ok(!/bingfeng|snake/.test(grid.innerHTML) && /solitaire/.test(grid.innerHTML), '纸牌标签筛选正确');
clickChip(filters, 'all');
ok(cardIds(grid).length === GAME_COUNT, '回到全部：' + GAME_COUNT + ' 张');

/* ==================== 三、清空纪录 ==================== */
const PREFIXES = /^(snake|2048|match3|sudoku|klondike|luosi|minesweeper|spider)\./;
const before = Object.keys(storage._data).filter((k) => PREFIXES.test(k)).length;
H.setConfirm(false);
clearBtn.click();
ok(Object.keys(storage._data).length === Object.keys(seed).length, '取消确认时不删任何键');
H.setConfirm(true);
clearBtn.click();
const after = Object.keys(storage._data).filter((k) => PREFIXES.test(k)).length;
ok(before > 0 && after === 0, '确认后清空 ' + before + ' 个键（剩余 ' + after + '）');
ok(/<b>0<small>\/\d+<\/small><\/b>/.test(hud.innerHTML) && !/继续未完局/.test(hud.innerHTML), '清空后统计归零、续玩药丸消失');
ok(!/🏆|⏱ |🚩/.test(grid.innerHTML), '清空后卡片不再显示任何纪录');
ok(!/class="tick"|card played/.test(grid.innerHTML), '清空后卡片去掉已玩标记');
ok(!/pclear/.test(hud.innerHTML), '清空后隐藏清空纪录按钮');

/* ==================== 四、空纪录 / 存储被禁 ==================== */
const E = mountHome({ seed: {} });
ok(cardIds(E.grid).length === GAME_COUNT, '空存储仍渲染 ' + GAME_COUNT + ' 张卡片');
ok(!/class="tick"/.test(E.grid.innerHTML) && /还没玩过/.test(E.grid.innerHTML), '空存储无已玩标记、显示占位文案');
ok(/<b>0<small>\/\d+<\/small><\/b>/.test(E.hud.innerHTML), '空存储统计条归零');

const B = mountHome({ storageBlocked: true, protocol: 'https:', hostname: 'keeperkwok.github.io' });
ok(cardIds(B.grid).length === GAME_COUNT, '存储被禁（无痕/隐私限制）时静默降级，仍渲染 ' + GAME_COUNT + ' 张卡片');
ok(/keeperkwok\.github\.io/.test(B.hud.innerHTML), '非 file:// 时提示语用真实域名');

/* ==================== 五、home.css 覆盖 ==================== */
const css = read('home.css');
const used = new Set();
for (const blob of [grid.innerHTML, hud.innerHTML, filters.innerHTML]) {
  for (const m of blob.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => c && used.add(c));
}
for (const sel of ['app', 'hero', 'foot']) used.add(sel);
const missing = [...used].filter((c) => !new RegExp('\\.' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\w-)').test(css));
ok(missing.length === 0, 'home.css 覆盖首页用到的全部 ' + used.size + ' 个类名' + (missing.length ? '，缺少: ' + missing.join(', ') : ''));

/* ==================== 六、三款新游戏的纪录显示 ==================== */
// 声纳扫雷：最佳用时 + 最佳分同屏
let S = mountHome({ seed: { 'sonar.diff': 'medium', 'sonar.best.medium': '125', 'sonar.best.hard': '400', 'sonar.best': '3594', 'sonar.plays': '7' } });
let sc = cardHTML(S.grid, 'sonar');
ok(/⏱ 2:05 海峡 · 2\/3 难度/.test(sc), '声纳卡片：最快海域 + 已完成难度数');
ok(/🏆 3,594 分/.test(sc), '声纳卡片：同时显示最佳分');
ok(/class="card played"/.test(sc), '声纳卡片：有纪录即标记已玩');
ok(new RegExp('<b>1<small>\\/' + GAME_COUNT + '<\\/small><\\/b><span>玩过').test(S.hud.innerHTML), '声纳计入首页统计 1/' + GAME_COUNT);
ok(/<b>3,594<\/b><span>累计最高分/.test(S.hud.innerHTML), '声纳最佳分计入累计最高分');
S = mountHome({ seed: { 'sonar.muted': '1' } });
ok(!/class="card played"/.test(cardHTML(S.grid, 'sonar')), '只点过静音的游戏不算已玩');
S = mountHome({ seed: { 'sonar.best': '0', 'sonar.diff': 'easy' } });
sc = cardHTML(S.grid, 'sonar');
ok(!/⏱|🏆/.test(sc) && /还没玩过 · 去开一题/.test(sc), '0 分 0 秒不写垃圾纪录上首页');
ok(/class="card played"/.test(sc), '选过难度即算已玩（与数独等一致）');

// 算独：分难度最佳用时 + 续玩药丸要扣掉单格已知笼
const kenkenSave = (filled, givens, seconds) => JSON.stringify({
  diff: 'hard', seconds,
  values: Array(36).fill(0).map((_, i) => (i < filled + givens ? 3 : 0)),
  notes: Array(36).fill(0),
  cages: [].concat(
    Array.from({ length: givens }, (_, i) => '=|' + (i + 1) + ':' + i),
    Array.from({ length: 12 }, (_, i) => '+|9:' + (givens + i * 2) + ',' + (givens + i * 2 + 1))),
});
let K = mountHome({ seed: { 'kenken.best.hard': '301', 'kenken.save': kenkenSave(5, 4, 73) } });
ok(/⏱ 5:01 六宫 · 1\/4 难度/.test(cardHTML(K.grid, 'kenken')), '算独卡片：分难度最佳用时');
ok(/继续未完局 · 六宫 · 已填 5\/32 · 1:13/.test(K.hud.innerHTML), '算独续玩药丸：' + (K.hud.innerHTML.match(/继续未完局[^<]*/) || ['未渲染'])[0]);
for (const [s, why] of [
  [kenkenSave(0, 4, 10), '一格没填'],
  [kenkenSave(32, 4, 10), '已经填满'],
  ['{bad', 'JSON 损坏'],
  [JSON.stringify({ diff: 'hard', values: [], cages: [] }), '空存档'],
]) {
  const h = mountHome({ seed: { 'kenken.save': s } });
  ok(!/继续未完局/.test(h.hud.innerHTML), '算独' + why + '时不显示续玩药丸');
}
const BOTH = mountHome({
  seed: {
    'sudoku.save': JSON.stringify({ diff: 'expert', values: Array(81).fill(0).map((_, i) => (i < 20 ? 7 : 0)), seconds: 60 }),
    'kenken.save': kenkenSave(5, 4, 73),
  },
});
ok(/继续未完局 · 困难 · 已填 20\/81/.test(BOTH.hud.innerHTML), '两款都有存档时药丸只出现一枚（数独优先）');

// 幸运弹珠台：最远轮次 + 最高分
let P = mountHome({ seed: { 'plinko.round': '9', 'plinko.best': '12480', 'plinko.plays': '3' } });
let pc = cardHTML(P.grid, 'plinko');
ok(/🚩 最远撑到第 9 轮/.test(pc), '弹珠台卡片：最远轮次');
ok(/🏆 12,480 分/.test(pc), '弹珠台卡片：同时显示最高分');
P = mountHome({ seed: { 'plinko.round': '1' } });
ok(!/🚩/.test(cardHTML(P.grid, 'plinko')), '撑到第 1 轮不算纪录（人人都到得了，避免噪音）');
P = mountHome({ seed: { 'plinko.round': '0', 'plinko.best': '0' } });
ok(!/🚩|🏆/.test(cardHTML(P.grid, 'plinko')), '弹珠台全 0 不显示纪录');
ok(/data-f="构筑"/.test(P.filters.innerHTML) && /data-f="记忆"/.test(P.filters.innerHTML), '新标签 记忆/构筑 出现在筛选栏');
ok(P.grid.innerHTML.length > 0 && !/undefined|NaN/.test(P.grid.innerHTML), '空纪录时首页不出现 undefined/NaN');

/* ==================== 八、翻牌堆 / 祖玛 / 数织 / 魔方 ==================== */
const pad1 = (ones, len) => '1'.repeat(ones) + '0'.repeat(Math.max(0, len - ones));
const nonoSave = (diff, done, need, seconds) => JSON.stringify({
  diff, seconds, mistakes: 0, hintsLeft: 3, sol: pad1(need, 100), cell: pad1(done, 100),
});

// 翻牌堆、祖玛：关卡与最高分同屏
let F = mountHome({ seed: { 'fanpai.level': '9', 'fanpai.best': '2760' } });
let fc = cardHTML(F.grid, 'fanpai');
ok(/🚩 最远到第 9 关/.test(fc), '翻牌堆卡片：最远关卡');
ok(/🏆 2,760 分/.test(fc), '翻牌堆卡片：同时显示最高分');
F = mountHome({ seed: { 'fanpai.level': '1', 'fanpai.best': '0' } });
ok(!/🚩|🏆/.test(cardHTML(F.grid, 'fanpai')), '翻牌堆第 1 关 / 0 分不算纪录');
let Z = mountHome({ seed: { 'zuma.level': '6', 'zuma.best': '4820', 'zuma.muted': '1' } });
let zc = cardHTML(Z.grid, 'zuma');
ok(/🚩 最远到第 6 关/.test(zc) && /🏆 4,820 分/.test(zc), '祖玛卡片：关卡 + 最高分同屏');
ok(/class="card played"/.test(zc), '祖玛卡片：有纪录即标记已玩');
Z = mountHome({ seed: { 'zuma.best': '0', 'zuma.muted': '1' } });
zc = cardHTML(Z.grid, 'zuma');
ok(!/🏆|🚩/.test(zc) && /还没玩过/.test(zc), '祖玛 0 分不写垃圾纪录');
ok(/class="card played"/.test(zc), '祖玛：碰过关也算已玩（与其它一致）');

// 数织：分难度最佳用时 + 续玩药丸
let N = mountHome({ seed: { 'nonogram.best.medium': '315', 'nonogram.save': nonoSave('medium', 37, 52, 73) } });
ok(/⏱ 5:15 10×10 · 1\/4 难度/.test(cardHTML(N.grid, 'nonogram')), '数织卡片：最快 10×10 + 已完成难度数');
ok(/继续未完局 · 10×10 · 已涂 37\/52 格 · 1:13/.test(N.hud.innerHTML),
  '数织续玩药丸：' + (N.hud.innerHTML.match(/继续未完局[^<]*/) || ['未渲染'])[0]);
for (const [raw, why] of [
  [nonoSave('medium', 0, 52, 10), '一格没涂'],
  [nonoSave('medium', 52, 52, 10), '已经涂满'],
  ['{bad', 'JSON 损坏'],
  [JSON.stringify({ diff: 'nope', sol: '', cell: '' }), '难度不认识'],
  [JSON.stringify({ diff: 'expert', sol: pad1(52, 100) }), '缺 cell 字段'],
]) {
  const h = mountHome({ seed: { 'nonogram.save': raw } });
  ok(!/继续未完局/.test(h.hud.innerHTML), '数织' + why + '时不显示续玩药丸');
}

// 魔方：分阶数最佳用时 + 未完局续玩（2/3/4 阶各记一条）
const cubeSave = (size, moves, seconds) => JSON.stringify({
  size, moves, seconds, scramble: "R U R' U'",
  faces: ['0123', '3210', '1023', '2301', '0132', '3021'].map((row) => row.slice(0, size * size).padEnd(size * size, '0')),
});
let Q = mountHome({ seed: { 'cube.best.3': '212', 'cube.best.4': '905', 'cube.save': cubeSave(3, 5, 41) } });
const qc = cardHTML(Q.grid, 'cube');
ok(/⏱ 3:32 三阶 · 2\/3 难度/.test(qc), '魔方卡片：三阶最快 + 已完成阶数 2/3');
ok(/继续未完局 · 3 阶魔方 · 已转 5 步 · 0:41/.test(Q.hud.innerHTML),
  '魔方续玩药丸：' + (Q.hud.innerHTML.match(/继续未完局[^<]*/) || ['未渲染'])[0]);
Q = mountHome({ seed: { 'cube.muted': '1' } });
ok(!/class="card played"/.test(cardHTML(Q.grid, 'cube')), '魔方只点过静音不算已玩');
Q = mountHome({ seed: { 'cube.size': '4' } });
ok(/class="card played"/.test(cardHTML(Q.grid, 'cube')) && /还没玩过/.test(cardHTML(Q.grid, 'cube')),
  '魔方选过阶数即算已玩，但没成绩仍显示占位文案');
for (const [raw, why] of [
  ['{bad', 'JSON 损坏'],
  ['{"size":3,"faces":["000"],"moves":2,"seconds":9}', '盘面残缺'],
  ['{"size":9,"faces":["000","000","000","000","000","000"],"moves":2}', '阶数越界'],
  ['{"size":3,"faces":["012","345","012","345","012","345"],"moves":0,"seconds":9}', '一步没转'],
]) {
  const h = mountHome({ seed: { 'cube.save': raw } });
  ok(!/继续未完局/.test(h.hud.innerHTML), '魔方' + why + '时不显示续玩药丸');
}

// 都有未完局时，药丸只出一枚（按 GAMES 顺序，数独在前）
const BOTH2 = mountHome({
  seed: {
    'sudoku.save': JSON.stringify({ diff: 'easy', values: Array(81).fill(0).map((_, i) => (i < 10 ? 3 : 0)), seconds: 30 }),
    'nonogram.save': nonoSave('easy', 3, 12, 20),
    'cube.save': cubeSave(3, 5, 41),
  },
});
ok(/继续未完局 · 入门 · 已填 10\/81/.test(BOTH2.hud.innerHTML), '多款都有存档时首页只给一枚续玩药丸');
ok((BOTH2.hud.innerHTML.match(/继续未完局/g) || []).length === 1, '续玩药丸确实只有一枚');

ok(/data-f="图形"/.test(N.filters.innerHTML) && /data-f="空间"/.test(Q.filters.innerHTML), '新标签 图形/空间 进入筛选栏');
for (const h of [F, Z, N, Q]) {
  ok(h.grid.innerHTML.length > 0 && !/undefined|NaN/.test(h.grid.innerHTML), '新游戏卡片区无 undefined/NaN');
}

/* ==================== 七、节拍雨 / 一夫当关 ==================== */
const BEAT = mountHome({ seed: { 'beat.best.mid': '48210', 'beat.best.hard': '98765', 'beat.combo.easy': '110', 'beat.combo.hard': '247' } });
const bc = cardHTML(BEAT.grid, 'jiepaiyu');
ok(/class="card played"/.test(bc), '有成绩即算玩过节拍雨');
ok(/🏆 98,765 分/.test(bc), '节拍雨卡片显示最高分（带千分位）');
ok(/🔥 最长连击 247/.test(bc), '最长连击跨三首曲子取最大的那条');
const DG = mountHome({ seed: { 'dangguan.wave': '14', 'dangguan.best': '3210', 'dangguan.diff': 'hard' } });
const dc = cardHTML(DG.grid, 'dangguan');
ok(/🚩 最高守到第 14 关/.test(dc), '一夫当关卡片显示守到的波次');
ok(/🏆 3,210 分/.test(dc), '一夫当关卡片显示最高分');
const MUTE_ONLY = mountHome({ seed: { 'beat.muted': '1', 'dangguan.muted': '1' } });
ok(!/class="card played"/.test(cardHTML(MUTE_ONLY.grid, 'jiepaiyu')), '只点过静音不算玩过节拍雨');
ok(!/class="card played"/.test(cardHTML(MUTE_ONLY.grid, 'dangguan')), '同理只静音不算玩过一夫当关');
const REAL_SAVE = JSON.stringify({ diff: 'mid', wave: 3, gold: 604, lives: 20, bricks: 17, score: 310, kills: 7,
  seconds: 12, towers: [['bolt', 2, 3, 1], ['bolt', 3, 5, 1], ['bolt', 8, 3, 1]], walls: [] });
const RESUME = mountHome({ seed: { 'dangguan.save': REAL_SAVE } });
ok(/继续未完局 · 一夫当关 · 已守 2 波 · 3 座塔 · 金币 604/.test(RESUME.hud.innerHTML),
  '首页读得懂一夫当关的续档：' + (RESUME.hud.innerHTML.match(/继续未完局[^<]*/) || ['(没出药丸)'])[0]);
for (const [raw, why] of [
  ['{bad', 'JSON 损坏'],
  ['1234', '不是对象'],
  ['{"wave":1,"gold":1,"lives":1,"towers":[],"walls":[]}', '还没守住过一波'],
  ['{"wave":9,"gold":1,"lives":1,"towers":"nope","walls":[]}', '塔表不是数组'],
  ['{"wave":9,"gold":1,"lives":1,"towers":[["bolt",99,1,1]],"walls":[]}', '塔的坐标越界'],
  ['{"wave":9,"gold":1,"lives":1,"towers":[["bolt",1,1,9]],"walls":[]}', '塔的等级越界'],
  ['{"wave":9,"gold":1,"lives":1,"towers":[],"walls":[[3,99]]}', '墙的行号越界'],
]) {
  const h = mountHome({ seed: { 'dangguan.save': raw } });
  ok(!/继续未完局/.test(h.hud.innerHTML), '一夫当关' + why + '时不显示续玩药丸');
}
ok(/data-f="音乐"/.test(BEAT.filters.innerHTML) && /data-f="塔防"/.test(DG.filters.innerHTML), '新标签 音乐/塔防 进入筛选栏');
for (const h of [BEAT, DG]) {
  ok(h.grid.innerHTML.length > 0 && !/undefined|NaN/.test(h.grid.innerHTML), '两款新游戏的卡片区无 undefined/NaN');
}

/* ==================== 九、三款文字游戏 ==================== */
const TXT = mountHome({ seed: {
  'rad.best': '2704', 'rad.level': '7', 'rad.dex': '明好妈林声', 'rad.diff': 'hard',
  'proof.best': '3440', 'proof.level': '11', 'proof.hits': '27', 'proof.diff': 'easy',
  'han.best': '900', 'han.solved': '12', 'han.streak': '5', 'han.diff': 'normal',
} });
const piz = cardHTML(TXT.grid, 'pianpangzhen');
ok(/🏆 2,704 分/.test(piz), '偏旁阵卡片显示最高分（带千分位）');
ok(/📚 字图鉴已收 5 个/.test(piz), '偏旁阵卡片显示图鉴数（键存字串，长度即数量）');
const sj = cardHTML(TXT.grid, 'sanjiao');
ok(/🏆 3,440 稿费/.test(sj), '三校卡片把分数单位写成「稿费」而不是「分」');
ok(/🚩 最远校完 11 段/.test(sj), '三校卡片显示校完段数，单位是「段」');
const hz = cardHTML(TXT.grid, 'yiziqianjin');
ok(/🏆 900 金/.test(hz), '一字千金卡片显示剩余千金即得分');
ok(/🔥 最长连胜 5/.test(hz), '一字千金卡片显示历史最长连胜');
for (const [id, html] of [['pianpangzhen', piz], ['sanjiao', sj], ['yiziqianjin', hz]]) {
  ok(/class="card played/.test(html), id + ' 有成绩即算玩过');
  ok((html.match(/class="rec-item/g) || []).length === 2, id + ' 卡片铺满两条纪录（多余的留在游戏内战绩页，不会被静默挤掉）');
  ok(!/undefined|NaN/.test(html), id + ' 卡片区无 undefined/NaN');
}
ok(new RegExp('<b>3<small>\\/' + GAME_COUNT + '<\\/small><\\/b><span>玩过').test(TXT.hud.innerHTML), '统计条按 ' + GAME_COUNT + ' 款计算，玩过 3 款');
ok(/<b>7,044<\/b>/.test(TXT.hud.innerHTML), '三款分数并入累计最高分 2,704+3,440+900 = 7,044');
const TXT_MUTE = mountHome({ seed: { 'rad.muted': '1', 'proof.muted': '1', 'han.muted': '1' } });
for (const id of ['pianpangzhen', 'sanjiao', 'yiziqianjin']) {
  ok(!/class="card played/.test(cardHTML(TXT_MUTE.grid, id)), id + ' 只点过静音不算玩过');
}
const TXT_DIFF = mountHome({ seed: { 'han.diff': 'hard', 'proof.muted': '1' } });
ok(/class="card played/.test(cardHTML(TXT_DIFF.grid, 'yiziqianjin')), '一字千金只要动过难度选择就算玩过');
ok(!/class="card played/.test(cardHTML(TXT_DIFF.grid, 'sanjiao')), '三校只改过静音开关不算玩过');
ok(/data-f="文字"/.test(TXT.filters.innerHTML), '新标签 文字 进入筛选栏');
clickChip(TXT.filters, '文字');
ok(cardIds(TXT.grid).join(',') === 'pianpangzhen,sanjiao,yiziqianjin,yaowenjiaozhi',
  '按「文字」筛选命中四款，且按注册表顺序排列（新游戏只往末尾追加）');

/* ==================== 十、咬文嚼字 ==================== */
const YAO = mountHome({ seed: {
  'rad.best': '2704', 'proof.best': '3440', 'han.best': '900',
  'yao.best': '3418', 'yao.level': '12', 'yao.found': '25', 'yao.diff': 'normal',
  'yao.dex': '9:2,5,7|9:5,7|done9',
} });
const yao = cardHTML(YAO.grid, 'yaowenjiaozhi');
ok(/🏆 3,418 分/.test(yao), '咬文嚼字卡片显示最高分');
ok(/🚩 累计咬出 25 种/.test(yao), '卡片显示历代累计咬出的读法种数（图鉴计数，不含整句首通标记）');
ok(/class="card played/.test(yao), '咬文嚼字有成绩即算玩过');
ok((yao.match(/class="rec-item/g) || []).length === 2, '咬文嚼字卡片只铺两条纪录');
ok(!/undefined|NaN|3418<\/b><\/span>/.test(yao.replace(/🏆 3,418 分/, '')), '卡片区不泄漏原始存档串');
ok(new RegExp('<b>4<small>\\/' + GAME_COUNT + '<\\/small><\\/b><span>玩过').test(YAO.hud.innerHTML), '加上咬文嚼字共 4 款玩过');
ok(/<b>10,462<\/b>/.test(YAO.hud.innerHTML), '四款文字游戏分数并进累计最高分 7,044+3,418 = 10,462');
const YAO_MUTE = mountHome({ seed: { 'yao.muted': '1' } });
ok(!/class="card played/.test(cardHTML(YAO_MUTE.grid, 'yaowenjiaozhi')), '咬文嚼字只点过静音不算玩过');
const YAO_FRESH = mountHome({ seed: { 'yao.level': '1' } });
ok(/class="card played/.test(cardHTML(YAO_FRESH.grid, 'yaowenjiaozhi')), '只读到过第 1 句也算玩过');
ok(!/🏆|🚩/.test(cardHTML(YAO_FRESH.grid, 'yaowenjiaozhi')), '没分数没图鉴时卡片不硬凑纪录');
clickChip(YAO.filters, '文字');
ok(cardIds(YAO.grid).join(',') === 'pianpangzhen,sanjiao,yiziqianjin,yaowenjiaozhi',
  '按「文字」筛选现在恰好命中四款');
clickChip(YAO.filters, 'all');
ok(cardIds(YAO.grid).indexOf('yaowenjiaozhi') > cardIds(YAO.grid).indexOf('yiziqianjin'), '新游戏排在注册表末尾，不会插队');

/* ==================== 十一、五款新游：一笔画 / 绝对音感 / 分拣工厂 / 钓鱼佬 / 多米诺 ==================== */
const NEW5 = [
  ['yibihua', '一笔画', 'yi', 'lines', '累计描线 1,234 条'],
  ['yingan', '绝对音感', 'yin', 'right', '累计听对 1,234 题'],
  ['fenjian', '分拣工厂', 'fj', 'sort', '累计入库 1,234 件'],
  ['diaoyu', '钓鱼佬', 'dy', 'catch', '累计起鱼 1,234 条'],
  ['domino', '多米诺', 'dm', 'fall', '累计倒牌 1,234 张'],
];
const SEED5 = {};
for (const [, , pfx, unit] of NEW5) { SEED5[pfx + '.best'] = '1234'; SEED5[pfx + '.' + unit] = '1234'; }
const N5 = mountHome({ seed: SEED5 });
for (const [id, name, , , rec] of NEW5) {
  const html = cardHTML(N5.grid, id);
  ok(/🏆 1,234 分/.test(html), name + ' 卡片显示最高分（带千分位）');
  ok(html.indexOf('🚩 ' + rec) >= 0, name + ' 卡片显示累计纪录「' + rec + '」');
  ok(/class="card played/.test(html), name + ' 有成绩即算玩过');
  ok((html.match(/class="rec-item/g) || []).length === 2, name + ' 卡片只铺两条纪录（多余的留在游戏内战绩页）');
  ok(!/undefined|NaN/.test(html), name + ' 卡片区无 undefined/NaN');
}
ok(new RegExp('<b>5<small>\\/' + GAME_COUNT + '<\\/small><\\/b><span>玩过').test(N5.hud.innerHTML),
  '五款新游一起计入首页统计 5/' + GAME_COUNT);
ok(/<b>6,170<\/b><span>累计最高分/.test(N5.hud.innerHTML), '五款分数并进累计最高分 1,234 × 5 = 6,170');
const N5_MUTE = mountHome({ seed: { 'yi.muted': '1', 'yin.muted': '1', 'fj.muted': '1', 'dy.muted': '1', 'dm.muted': '1' } });
for (const [id, name] of NEW5) {
  ok(!/class="card played/.test(cardHTML(N5_MUTE.grid, id)), name + ' 只点过静音不算玩过');
}
const N5_DIFF = mountHome({ seed: { 'dm.diff': 'pro' } });
ok(/class="card played/.test(cardHTML(N5_DIFF.grid, 'domino')), '多米诺只换过骨牌规格也算玩过');
const CHIPS5 = chipNames(N5.filters);
ok(CHIPS5.indexOf('收集') >= 0, '钓鱼佬带来新标签 收集');
for (const t of ['音乐', '塔防', '图形', '空间']) ok(CHIPS5.indexOf(t) >= 0, '标签 ' + t + ' 在筛选栏里');
const TAG5 = {
  收集: 'diaoyu',
  塔防: 'dangguan,fenjian',
  音乐: 'jiepaiyu,yingan',
  图形: 'nonogram,yibihua',
  空间: 'cube,yibihua',
  记忆: 'sonar,yingan',
  物理: 'xigua,plinko,domino',
};
for (const t of Object.keys(TAG5)) {
  clickChip(N5.filters, t);
  ok(cardIds(N5.grid).join(',') === TAG5[t], '按「' + t + '」筛选命中 ' + TAG5[t]);
}
clickChip(N5.filters, 'all');
ok(cardIds(N5.grid).length === GAME_COUNT, '标签筛完回到全部：' + GAME_COUNT + ' 张');

report('首页进度中心');
