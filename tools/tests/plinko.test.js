'use strict';
/* 幸运弹珠台：发射与落槽 → 撞钉攒分 × 槽位倍率 → 达标三选一 → 未达标结束 */
const { loadGame } = require('../smoketest.js');
const { ok, report } = require('./_assert.js');

const by = (g, i) => g.byId(i);
const setTarget = (v) => (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  let out = src.split('target = 60;').join('target = ' + v + ';');
  out = out.replace('target = Math.round((60 + Math.pow(round, 1.62) * 46) * S.targetMul);', 'target = ' + v + ';');
  if (out === src) throw new Error('transform 未命中，检查 plinko 源码');
  return out;
};

/* ---------- 通关分支：目标分设成 10 ---------- */
const g = loadGame('plinko', { storage: {}, transform: setTarget(10) });
g.pump(0.4);
ok(by(g, 'overlay')._cls.includes('show') && /幸运弹珠台/.test(by(g, 'overlayContent').innerHTML), '开场说明遮罩');
const start = by(g, 'overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'start');
start.dispatch('click');
g.pump(0.3);
ok(!by(g, 'overlay')._cls.includes('show'), '开一局后遮罩关闭');
ok(by(g, 'ballsLeft').textContent === '球 ×3', '每轮 3 颗球: ' + by(g, 'ballsLeft').textContent);
ok(by(g, 'round').textContent === '0/10', '目标分 10: ' + by(g, 'round').textContent);
ok(by(g, 'turn').textContent === '1', '第 1 轮');

// 瞄准 + 发射
g.fire(by(g, 'btnAimL'), 'click');
g.fire(by(g, 'btnAimR'), 'click');
g.fire(by(g, 'btnAimR'), 'click');
g.key('ArrowLeft'); g.key('ArrowRight');
ok(by(g, 'score').textContent === '0', '还没发射不计分');
g.clickAt(150, 380);
g.pump(0.2);
ok(by(g, 'ballsLeft').textContent === '球 ×2', '发射消耗一颗: ' + by(g, 'ballsLeft').textContent);
g.pump(9);
const s1 = +by(g, 'score').textContent;
ok(s1 > 0, '球落定后得分 ' + s1 + '（撞钉累计 × 槽位倍率）');
ok(+by(g, 'goal').style.width !== NaN && by(g, 'goal').style.width !== '', '进度条更新 ' + by(g, 'goal').style.width);

// 空格逐发：每发都要等球落定才能发下一颗
g.key(' ');
g.pump(0.2);
ok(by(g, 'ballsLeft').textContent === '球 ×1', '空格也能发射: ' + by(g, 'ballsLeft').textContent);
g.pump(9);
g.key(' ');
g.pump(0.2);
ok(by(g, 'ballsLeft').textContent === '球 ×0', '打完最后一颗: ' + by(g, 'ballsLeft').textContent);
const beforeEmpty = +by(g, 'score').textContent;
g.key(' ');
g.pump(0.5);
ok(by(g, 'ballsLeft').textContent === '球 ×0', '没球时空放不报错');
for (let k = 0; k < 14 && !by(g, 'overlay')._cls.includes('show'); k++) g.pump(2);
const cards = by(g, 'overlayContent').querySelectorAll('.pcard');
ok(by(g, 'overlay')._cls.includes('show'), '本轮结算弹出');
ok(cards.length === 3, '三选一强化卡: ' + cards.length + ' 张');
const roundScore = +by(g, 'round').textContent.split('/')[0];
ok(roundScore >= 10, '本轮 ' + roundScore + ' 分 ≥ 目标 10');
const txt = cards.map((c) => c.querySelector('.cn').textContent).join('/');
ok(/[^\s]+\/[^\s]+\/[^\s]+/.test(txt), '卡片有名称: ' + txt);
cards[0].dispatch('click');
g.pump(0.5);
ok(!by(g, 'overlay')._cls.includes('show'), '选卡后进入下一轮');
ok(by(g, 'turn').textContent === '2', '轮次推进到 2');
ok(by(g, 'ballsLeft').textContent === '球 ×3' || by(g, 'ballsLeft').textContent === '球 ×4', '新轮球数 ' + by(g, 'ballsLeft').textContent);
ok(+by(g, 'score').textContent >= roundScore, '总分保留 ' + by(g, 'score').textContent);

// 再来一轮，验证强化会累积（球数只增不减）
const ballsNow = +by(g, 'ballsLeft').textContent.replace(/\D/g, '');
for (let k = 0; k < 40 && !by(g, 'overlay')._cls.includes('show'); k++) {
  g.clickAt(120 + k * 6, 360);
  g.pump(7);
}
const cards2 = by(g, 'overlayContent').querySelectorAll('.pcard');
ok(cards2.length === 3, '第 2 轮也能三选一: ' + cards2.map((c) => c.querySelector('.cn').textContent).join('/'));
cards2[Math.min(1, cards2.length - 1)].dispatch('click');
g.pump(0.5);
const ballsNext = +by(g, 'ballsLeft').textContent.replace(/\D/g, '');
ok(ballsNext >= ballsNow, '强化后球数不倒退 ' + ballsNow + ' → ' + ballsNext);
ok(by(g, 'turn').textContent === '3', '第 3 轮');
ok(+g.storage._data['plinko.plays'] === 1, '局数记 1 次');

/* ---------- 失败分支：目标分设成天文数字 ---------- */
const h = loadGame('plinko', { storage: {}, transform: setTarget(999999) });
h.pump(0.3);
h.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'start').dispatch('click');
h.pump(0.2);
for (let k = 0; k < 3; k++) { h.clickAt(200, 400); h.pump(8); }
for (let k = 0; k < 14 && !h.byId('overlay')._cls.includes('show'); k++) h.pump(2);
ok(/止步/.test(h.byId('overlayContent').innerHTML), '达不到目标 → 结束: ' + h.byId('turn').textContent + ' 轮');
ok(+h.storage._data['plinko.best'] > 0, '最高分写入 ' + h.storage._data['plinko.best']);
ok(+h.storage._data['plinko.round'] === 1, '最远轮数写入 ' + h.storage._data['plinko.round']);
const again = h.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'again');
again.dispatch('click');
h.pump(0.4);
ok(h.byId('turn').textContent === '1' && +h.byId('score').textContent === 0, '重开归零');
ok(h.byId('ballsLeft').textContent === '球 ×3', '成长值不带到下一局');
ok(h.draws() > 5000, 'canvas 持续绘制 ' + h.draws() + ' 次');


report('幸运弹珠台');
