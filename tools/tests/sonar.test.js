'use strict';
/* 声纳扫雷：声纳会消散 → 确认永久点亮 → 踩雷判负 → 连锁与插旗通关 → 纪录写入 */
const { loadGame } = require('../smoketest.js');
const { ok, report } = require('./_assert.js');

const g = loadGame('sonar', { storage: { 'sonar.diff': 'easy' } });
const byId = (i) => g.byId(i);
const pips = () => byId('pips').textContent;
const overlay = byId('overlay');

g.pump(0.4);
ok(overlay._cls.includes('show') && /声纳扫雷/.test(byId('overlayContent').innerHTML), '开场说明遮罩显示');
ok(byId('clear').textContent === '0/88' && byId('score').textContent === '0', '近海 10×10：HUD 初始 0/88 · 0 分');

// 开始
const start = byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'start');
start.dispatch('click');
g.pump(0.3);
ok(!overlay._cls.includes('show'), '点「下潜开始」后遮罩关闭');
ok(pips() === '●●●●●', '声纳初始 5 发: ' + pips());
ok(byId('btnPing')._cls.includes('on'), '默认工具=声纳');

// 声纳：消耗 1 发、不揭示格子
const cellSize = 460 / 10;
const at = (r, c) => [c * cellSize + cellSize / 2, r * cellSize + cellSize / 2];
// 第一次动作决定布雷位置：该格与周围 8 格必定无雷，后面的「确认」也借用这个安全圈
const FIRST = at(4, 4);
g.clickAt(...FIRST);
g.pump(0.2);
ok(pips() === '●●●●○', '发一次声纳 → 剩 4 发: ' + pips());
ok(byId('clear').textContent === '0/88', '声纳不会永久扫清格子: ' + byId('clear').textContent);
ok(+byId('score').textContent === 0, '声纳不计分');

// 连发 4 次打空，检查充能
for (let k = 0; k < 4; k++) { g.clickAt(...at(1, 1)); g.pump(0.1); }
ok(pips() === '○○○○○', '声纳打空: ' + pips());
g.clickAt(...at(2, 2)); g.pump(0.1);
ok(pips() === '○○○○○', '没声纳时点击不产生负数');
g.pump(2.6);
ok(/[●]/.test(pips()), '充能恢复: ' + pips());

// 工具：确认
byId('btnProbe').dispatch('click');
ok(byId('btnProbe')._cls.includes('on') && !byId('btnPing')._cls.includes('on'), '切到确认工具');
g.clickAt(...FIRST);
g.pump(0.2);
const cleared1 = +byId('clear').textContent.split('/')[0];
ok(cleared1 > 0, '确认安全圈 → 永久扫清 ' + cleared1 + ' 格(含零数连锁)');
ok(+byId('score').textContent > 0, '计分 ' + byId('score').textContent);

// 插旗 + 右键
const scoreBefore = +byId('score').textContent;
const clearBefore = byId('clear').textContent;
byId('btnFlag').dispatch('click');
g.clickAt(...at(0, 0));
g.clickAt(...at(0, 1));
ok(byId('clear').textContent === clearBefore && +byId('score').textContent === scoreBefore,
  '插旗不扫格也不计分（旗子只画在 canvas 上）');

// pips 是限流刷新（约 10Hz）的显示，比对发数前先闲置充满：满弹时不再充能，读数才不会漂
g.pump(9);
ok(pips() === '●●●●●', '闲置一会儿后声纳回满: ' + pips());
const pipsFull = pips();
g.clickAt(...at(0, 2));
ok(pips() === pipsFull, '插旗不消耗声纳: ' + pips());

byId('btnProbe').dispatch('click'); // 切回确认档，验证右键的临时切旗会被还原
g.fire(g.canvas(), 'pointerdown', { clientX: at(9, 9)[0], clientY: at(9, 9)[1], button: 2, pointerId: 3 });
ok(pips() === pipsFull, '右键插旗不消耗声纳: ' + pips());
ok(byId('btnProbe')._cls.includes('on') && !byId('btnFlag')._cls.includes('on'), '右键插旗完会还原成原工具');
g.pump(0.15);
ok(!overlay._cls.includes('show'), '只插几面旗不会误判通关或判负');

// 键盘切工具
g.key('2');
ok(byId('btnProbe')._cls.includes('on'), '按 2 → 确认工具');
g.key(' ');
g.pump(0.2);
ok(byId('btnProbe')._cls.includes('on'), '空格执行当前工具（仍停在确认档）');

// 一路确认直到踩雷 → 失败结算
let probeGuard = 0;
while (!overlay._cls.includes('show') && probeGuard < 100) {
  g.clickAt(...at((probeGuard / 10) | 0, probeGuard % 10));
  probeGuard++;
  g.pump(0.05);
}
ok(overlay._cls.includes('show'), '踩到水雷 → 弹出失败遮罩(试了 ' + probeGuard + ' 次)');
ok(/撞上水雷/.test(byId('overlayContent').innerHTML), '失败文案正确');
ok(+g.storage._data['sonar.best'] > 0, '最高分已写入: ' + g.storage._data['sonar.best']);
ok(+g.storage._data["sonar.plays"] === 1, "首局才计 1 局: " + g.storage._data["sonar.plays"]);
const lostCleared = byId('clear').textContent;
ok(/^0\/88$|\/88$/.test(lostCleared), '分母始终是安全格总数: ' + lostCleared);

// 再来一局
const again = byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'again');
again.dispatch('click');
g.pump(0.3);
ok(byId('clear').textContent === '0/88' && +byId('score').textContent === 0, '重开归零');
ok(pips() === '●●●●●', '重开声纳回满');

// 换难度
byId('diff').querySelectorAll('button')[1].dispatch('click');
g.pump(0.3);
ok(byId('clear').textContent === '0/168', '海峡 14×14 → 安全格 168: ' + byId('clear').textContent);
ok(g.storage._data['sonar.diff'] === 'medium', '难度持久化');

// 通关路径（把雷数改成 0 来走胜利分支）
const gw = loadGame('sonar', {
  storage: { 'sonar.diff': 'easy' },
  transform: (src) => src.replace('easy:   { n: 10, mines: 12', 'easy:   { n: 10, mines: 0'),
});
gw.pump(0.3);
const st = gw.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'start');
st.dispatch('click');
gw.pump(0.2);
gw.byId('btnProbe').dispatch('click');
gw.pump(1.2);
gw.clickAt(230, 230);
gw.pump(0.3);
ok(gw.byId('clear').textContent === '100/100', '零雷盘一次连锁扫清全部: ' + gw.byId('clear').textContent);
ok(/海域扫清/.test(gw.byId('overlayContent').innerHTML), '胜利结算弹出');
ok(+gw.storage._data['sonar.best.easy'] > 0, '最佳用时写入: ' + gw.storage._data['sonar.best.easy'] + 's');
ok(+gw.storage._data['sonar.best'] > 1000, '胜利奖励计入最高分: ' + gw.storage._data['sonar.best']);
ok(gw.draws() > 1000, 'canvas 持续绘制 ' + gw.draws() + ' 次');


report('声纳扫雷');
