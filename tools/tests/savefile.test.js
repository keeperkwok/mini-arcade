'use strict';
/* 存档契约：游戏真的写出来的 localStorage，首页 home.js 的 resume() 必须读得懂。
   两边各改各的字段时，这里会第一时间炸，而不是让用户悄悄丢掉一局进度。 */
const { loadGame } = require('../smoketest.js');
const { mountHome, cardHTML } = require('./_home.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };
const pill = (H) => (H.hud.innerHTML.match(/继续未完局[^<]*/) || [''])[0];
const actBtn = (g, act) => g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === act);
const snap = (g) => Object.assign({}, g.storage._data);

/* ---------- 魔方：打乱 + 转两步 ---------- */
{
  const g = loadGame('cube', {});
  g.pump(0.3);
  actBtn(g, 'start').dispatch('click');
  g.pump(0.5);
  chk(!!g.storage.getItem('cube.save'), '打乱后魔方就写了 cube.save');
  g.key('U'); g.pump(0.4);
  g.key('R'); g.pump(0.4);
  g.pump(11);
  const seed = snap(g);
  chk(Object.keys(seed).every((k) => k.indexOf('cube.') === 0), '魔方只写 cube.* 键：' + Object.keys(seed).join(','));
  const H = mountHome({ seed });
  const p = pill(H);
  chk(/继续未完局 · 3 阶魔方 · 已转 2 步 · 0:1/.test(p), '首页读得懂魔方存档：' + (p || '(没出药丸)'));
  // 通关后 cube.save 会被删掉（game.js 里 onSolved 做了），所以这里只验空值与脏值
  chk(/cube\.save/.test(JSON.stringify(seed)), '样本里确实带着 cube.save');
  const empty = mountHome({ seed: Object.assign({}, seed, { 'cube.save': '' }) });
  chk(pill(empty) === '', 'cube.save 被清空后药丸消失');
  const junk = mountHome({ seed: { 'cube.save': '1234' } });
  chk(pill(junk) === '', '首页遇到非 JSON 的 cube.save 不乱说话');
}

/* ---------- 数织：接着上次的题涂三格 ---------- */
{
  const HEART = '0110111111111110111000100';
  const seedIn = {
    'nonogram.diff': 'easy',
    'nonogram.save': JSON.stringify({ diff: 'easy', seconds: 41, mistakes: 0, hintsLeft: 3, sol: HEART, cell: '0'.repeat(25) }),
  };
  const g = loadGame('nonogram', { storage: seedIn });
  g.pump(0.4);
  const resume = actBtn(g, 'resume');
  chk(!!resume, '数织带存档启动会问「接着拼」');
  (resume || actBtn(g, 'start')).dispatch('click');
  g.pump(0.3);
  const cells = g.byId('ngBoard').querySelectorAll('.c');
  const paint = (el) => {
    el.dispatch('pointerdown', { pointerType: 'mouse', button: 0, clientX: 5, clientY: 5 });
    g.fire(g.doc.body, 'pointerup', { pointerType: 'mouse' });
    g.pump(0.1);
  };
  for (const idx of [1, 2, 6]) {
    for (let k = 0; k < 3 && !cells[idx]._cls.includes('f'); k++) paint(cells[idx]);
  }
  g.pump(1);
  const seed = snap(g);
  const s = JSON.parse(seed['nonogram.save']);
  chk(s.sol === HEART, '续玩不会换题（sol 与存档一致）');
  chk(s.seconds >= 41, '续玩保留了已用的秒数（' + s.seconds + '）');
  chk(Object.keys(seed).every((k) => k.indexOf('nonogram.') === 0), '数织只写 nonogram.* 键');
  const H = mountHome({ seed });
  const p = pill(H);
  chk(/继续未完局 · 5×5 · 已涂 3\/17 格 · 0:4/.test(p), '首页读得懂数织存档：' + (p || '(没出药丸)'));
  chk(/class="card played"/.test(cardHTML(H.grid, 'nonogram')), '有存档即算玩过数织');
  // 涂满之后不该再催着续玩
  const done = mountHome({ seed: { 'nonogram.save': JSON.stringify({ diff: 'easy', seconds: 10, sol: HEART, cell: HEART }) } });
  chk(pill(done) === '', '数织已经涂满时不再出续玩药丸');
}

/* ---------- 两家都有存档：按注册表顺序只出一枚 ---------- */
{
  const merged = Object.assign({},
    snap(loadGame('cube', {})),
    {
      'cube.save': JSON.stringify({ size: 3, moves: 4, seconds: 20, faces: ['012345012', '345012345', '012345012', '345012345', '012345012', '345012345'] }),
      'nonogram.save': JSON.stringify({ diff: 'medium', seconds: 88, sol: '1'.repeat(20) + '0'.repeat(80), cell: '1'.repeat(7) + '0'.repeat(93) }),
    });
  const H = mountHome({ seed: merged });
  chk(/继续未完局 · 10×10 · 已涂 7\/20 格/.test(pill(H)), '两个未完局同时存在时只出一枚，且数织优先于魔方：' + pill(H));
  chk((H.hud.innerHTML.match(/继续未完局/g) || []).length === 1, '续玩入口不会重复堆叠');
}

/* ---------- 四款对战棋类：真写出来的存档，首页都要读得懂 ---------- */
{
  const VIEW = 460;
  const start5 = (g) => {
    g.pump(0.4);
    g.byId('overlay').dispatch('click', { target: { closest: () => ({ dataset: { act: 'start' } }) } });
    g.pump(0.4);
  };
  const tapper = (g, W, PAD, CELL) => (c, r) => {
    const k = VIEW / W;
    g.canvas().dispatch('pointerdown', { pointerId: 1, isPrimary: true, clientX: (PAD + c * CELL) * k, clientY: (PAD + r * CELL) * k });
    g.pump(0.6);
  };

  // 五子棋：黑白各一子
  const gw = loadGame('wuziqi', { storage: { 'wuziqi.mode': 'pvp' } });
  start5(gw);
  const tapW = tapper(gw, 640, 40, 40);
  tapW(7, 7); tapW(8, 8);
  const seedW = snap(gw);
  chk(!!seedW['wuziqi.save'], '五子棋落两子后写出 wuziqi.save');
  const pw = pill(mountHome({ seed: seedW }));
  chk(/继续未完局 · 五子棋 · 已下 2 手 · 轮到黑 · 双人对战/.test(pw), '首页读得懂五子棋存档：' + (pw || '(没出药丸)'));

  // 中国象棋：炮二平五 + 馬8进7
  const gx = loadGame('xiangqi', { storage: { 'xiangqi.mode': 'pvp' } });
  start5(gx);
  const tapX = tapper(gx, 600, 44, 64);
  tapX(7, 7); tapX(4, 7); tapX(7, 0); tapX(6, 2);
  const seedX = snap(gx);
  chk(!!seedX['xiangqi.save'], '象棋走两步后写出 xiangqi.save');
  chk(JSON.parse(seedX['xiangqi.save']).bd.length === 90, '象棋存档里的棋盘串是 90 格（首页按这个长度校验）');
  const px = pill(mountHome({ seed: seedX }));
  chk(/继续未完局 · 中国象棋 · 已走 2 步 · 轮到红/.test(px), '首页读得懂象棋存档：' + (px || '(没出药丸)'));

  // 黑白棋：占两个角位
  const gr = loadGame('reversi', { storage: { 'reversi.mode': 'pvp' } });
  start5(gr);
  const tapR = tapper(gr, 560, 0, 70);
  tapR(2, 3); tapR(2, 2);          // 必须点合法开局点：(2,3) 后白回 (2,2)
  const seedR = snap(gr);
  chk(!!seedR['reversi.save'], '黑白棋落两子后写出 reversi.save');
  const pr = pill(mountHome({ seed: seedR }));
  chk(/继续未完局 · 黑白棋 · 第 3 手 · 轮到黑/.test(pr), '首页读得懂黑白棋存档：' + (pr || '(没出药丸)'));

  // 四子棋：两列各落一子
  const gs = loadGame('siziqi', { storage: { 'siziqi.mode': 'pvp' } });
  start5(gs);
  const tapS = tapper(gs, 560, 0, 80);
  tapS(2, 3); tapS(3, 3);
  const seedS = snap(gs);
  chk(!!seedS['siziqi.save'], '四子棋落两子后写出 siziqi.save');
  const ps = pill(mountHome({ seed: seedS }));
  chk(/继续未完局 · 四子棋 · 已落 2 子 · 轮到红/.test(ps), '首页读得懂四子棋存档：' + (ps || '(没出药丸)'));

  // 人机档要说清对手是谁
  const ps2 = pill(mountHome({ seed: Object.assign({}, seedS, { 'siziqi.save': JSON.stringify({ m: 'hard', mv: [2, 3, 4] }) }) }));
  chk(/已落 3 子 · 轮到黄/.test(ps2), '四子棋续玩药丸会报手数与行棋方：' + ps2);
  chk(/胜$/.test(cardHTML(mountHome({ seed: { 'wuziqi.wins': '3', 'wuziqi.streak': '2' } }).grid, 'wuziqi')) ||
      /🏆 3 胜/.test(cardHTML(mountHome({ seed: { 'wuziqi.wins': '3', 'wuziqi.streak': '2' } }).grid, 'wuziqi')),
      '五子棋卡片显示胜场纪录');
}

/* ---------- 一夫当关：真点三座塔、真守完一波，首页要读得懂这份档 ---------- */
{
  // 桩里 canvas 的 getBoundingClientRect 是 460×460，游戏内坐标才是 440×320
  const tap = (g, c, r) => {
    g.canvas().dispatch('pointerdown', {
      pointerId: 1, isPrimary: true,
      clientX: (c * 40 + 20) / 440 * 460, clientY: (r * 40 + 20) / 320 * 460,
    });
    g.pump(0.2);
  };
  const g = loadGame('dangguan', {});
  g.pump(0.4);
  chk(/一夫当关/.test(g.byId('overlayContent').innerHTML) && /路障/.test(g.byId('overlayContent').innerHTML),
    '一夫当关开场就讲清「塔和墙都是路障」');
  chk(!actBtn(g, 'resume'), '无存档时不问要不要继续');
  actBtn(g, 'start').dispatch('click');
  g.pump(0.3);
  chk(g.byId('gold').textContent === '210', '标准难度起手 210 金');
  chk(g.byId('route').textContent.indexOf('11') >= 0, '空场路线 11 格，实时报给玩家：' + g.byId('route').textContent);
  tap(g, 2, 3);
  chk(g.byId('gold').textContent === '160', '点一下草地就建起连弩（-50 金）');
  tap(g, 5, 4);
  chk(g.byId('route').textContent.indexOf('13') >= 0, '塔一落地路线就变长：' + g.byId('route').textContent);
  tap(g, 8, 3);
  chk(g.byId('gold').textContent === '60' && g.byId('bricks').textContent === '10', '三座塔 150 金，砖一块没花');
  g.byId('btnWave').dispatch('click');
  for (let k = 0; k < 3600 && g.byId('wave').textContent === '1'; k++) g.tick(16);
  chk(g.byId('wave').textContent === '2', '第 1 波守住 → 进第 2 波备战');
  const seed = snap(g);
  const sv = seed['dangguan.save'] ? JSON.parse(seed['dangguan.save']) : null;
  chk(!!sv && sv.wave === 2 && sv.towers.length === 3, '清波当场写出 dangguan.save：' + JSON.stringify(sv && { w: sv.wave, t: sv.towers.length, g: sv.gold }));
  chk(seed['dangguan.wave'] === '1' && +seed['dangguan.best'] === sv.score, '波数与分数也当场入档（不用等城破）');
  chk(Object.keys(seed).every((k) => k.indexOf('dangguan.') === 0), '一夫当关只写 dangguan.* 键：' + Object.keys(seed).join(','));
  const H = mountHome({ seed });
  chk(new RegExp('继续未完局 · 一夫当关 · 已守 1 波 · 3 座塔 · 金币 ' + sv.gold).test(pill(H)),
    '首页读得懂一夫当关存档：' + (pill(H) || '(没出药丸)'));
  chk(/class="card played"/.test(cardHTML(H.grid, 'dangguan')), '有存档即算玩过一夫当关');
  const empty = mountHome({ seed: { 'dangguan.save': '' } });
  chk(pill(empty) === '', 'dangguan.save 清空后药丸消失');
  const back = loadGame('dangguan', { storage: JSON.parse(JSON.stringify(seed)) });
  back.pump(0.4);
  chk(!!actBtn(back, 'resume'), '重新打开游戏会问「继续第 2 波」');
  actBtn(back, 'resume').dispatch('click');
  back.pump(0.3);
  chk(back.byId('gold').textContent === String(sv.gold), '续档后金币与存档一致（' + back.byId('gold').textContent + '）');
}

summary('存档契约', fails);
