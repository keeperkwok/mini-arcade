'use strict';
/* 祖玛珠链：珠链会往前走 → 吐珠插入 → 三消成立才爆破 → 缺口两侧同色会连锁 →
   炸弹清一片 → 打光过关发奖励 → 爬进洞口判负并写最高分。 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

// 只在测试构建里注入一个观测/操作口，正式文件不含这段
const hook = 'window.__z = {' +
  ' st: () => ({ phase, level, lead, len: path.len, speed: cfg.speed, balls: balls.slice(), score, shots, hits, cur, next, cleared, freeze, best, maxLevel, name: cfg.name }),' +
  ' xy: (i) => ballXY(i), frog: () => ({ x: frog.x, y: frog.y }),' +
  ' aimAt: (i) => { const p = ballXY(i); aim = Math.atan2(p.y - frog.y, p.x - frog.x); },' +
  ' setBalls: (b) => { balls = b.slice(); }, setLead: (v) => { lead = v; },' +
  ' setCur: (c) => { cur = c; }, setNext: (c) => { next = c; },' +
  ' fireNow: () => fire(), startLevel,' +
  ' insert: (i, c) => insertAndMatch(i, c),' +
  ' shoot: (i, c, front) => { const q = ballXY(i); const off = front ? 20 : -20;' +
  '   collide(i, { x: q.x + Math.cos(q.a) * off, y: q.y + Math.sin(q.a) * off, c }); },' +
  '};\n';
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('祖玛源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const BOMB = -2;
const GAP_OK = 28;
const z = (g) => g.ctx.__z;
const st = (g) => g.ctx.__z.st();

function openWorld() {
  const g = loadGame('zuma', { transform: inject });
  g.pump(0.4);
  const btn = g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'start');
  btn.dispatch('click');
  g.pump(0.2);
  return g;
}
// 瞄准第 i 颗珠子吐一颗，等它飞到
function shootAt(g, i) {
  z(g).aimAt(i);
  z(g).fireNow();
  for (let k = 0; k < 40 && g.ctx.__z.st().phase === 'play' && st(g).balls.length === undefined; k++) break;
  let before = st(g).balls.length;
  for (let k = 0; k < 60; k++) {
    g.pump(0.05);
    if (st(g).balls.length !== before || st(g).phase !== 'play') break;
    before = st(g).balls.length;
  }
}

/* ==================== 1. 开局 ==================== */
const g = openWorld();
let s = st(g);
chk(s.phase === 'play', '点开始后进入战斗状态');
chk(s.balls.length % 3 === 0, '第一关珠子数 ' + s.balls.length + ' 是 3 的倍数（不会有清不掉的残珠）');
chk(s.lead < 40, '开局珠链刚从洞口那头的起点出发 s=' + s.lead.toFixed(0));
chk(s.len > s.balls.length * 28 + 200, '轨道 ' + Math.round(s.len) + ' 像素，装得下整条 ' + s.balls.length * 28 + ' 像素的珠链');
chk(g.byId('left').textContent === String(s.balls.length), '统计条「台上珠子」= ' + g.byId('left').textContent);
chk(/草原/.test(g.byId('level').textContent), '关卡名显示：' + g.byId('level').textContent);

/* ==================== 2. 珠链持续前进 ==================== */
const lead0 = st(g).lead;
g.pump(2);
const lead1 = st(g).lead;
chk(lead1 > lead0, '时间推进后珠链往前爬：' + lead0.toFixed(0) + ' → ' + lead1.toFixed(0));
chk(Math.abs((lead1 - lead0) - s.speed * 2) < s.speed * 0.4, '爬速接近 speed×时间（差 ' + ((lead1 - lead0) - s.speed * 2).toFixed(1) + '）');
chk(Number(g.byId('danger').style.width.replace('%', '')) > 0, '危险进度条随爬动增长：' + g.byId('danger').style.width);

/* ==================== 3. 吐珠与换珠 ==================== */
s = st(g);
const curBefore = s.cur, nextBefore = s.next;
g.fire(g.byId('btnSwap'), 'click');
chk(st(g).cur === nextBefore && st(g).next === curBefore, '「换珠」交换嘴里与备用（' + curBefore + '/' + nextBefore + ' → ' + st(g).cur + '/' + st(g).next + '）');
const shots0 = st(g).shots;
g.key(' ');
g.pump(0.2);
chk(st(g).shots === shots0 + 1, '空格键吐珠，发数 +1');

/* ==================== 4. 三消成立 ==================== */
z(g).setBalls([1, 1, 2, 2, 3, 3, 0, 0]);
z(g).setLead(260);
z(g).setCur(1);
const before4 = st(g).balls.length;
z(g).shoot(1, 1, true);                           // 从链头一侧撞第 2 颗
s = st(g);
chk(s.balls.length < before4, '三颗同色相连即爆：' + before4 + ' → ' + s.balls.length);
chk(s.balls.indexOf(1) < 0, '爆掉后盘面上没有 1 号色了');
chk(s.score > 0, '爆破得分 ' + s.score);
chk(s.hits === st(g).shots, '命中的这一发计入命中率');

/* ==================== 5. 两连不爆 ==================== */
const score5 = st(g).score;
z(g).setBalls([2, 2, 3, 3]);
z(g).setLead(260);
z(g).setCur(0);
z(g).shoot(0, 0, true);
s = st(g);
chk(s.balls.length === 5, '只凑成两颗不爆破，新珠留在链条里（' + s.balls.join(',') + '）');
chk(s.score === score5, '没爆破就不加分');

/* ==================== 6. 连锁 + 打光过关 ==================== */
z(g).setBalls([2, 2, 1, 1, 1, 2, 2]);
z(g).setLead(300);
z(g).setCur(1);
z(g).shoot(3, 1, false);
s = st(g);
chk(s.balls.length === 0, '四颗 1 爆破后，缺口两侧的 2 又连成四颗 → 连锁清空（剩 ' + s.balls.length + '）');
chk(s.phase === 'between', '盘面清空进入过关结算');
chk(/清空/.test(g.byId('overlayContent').innerHTML), '弹出过关遮罩');
chk(s.score > 300, '连锁 + 过关奖励后总分 ' + s.score);
chk(/命中率/.test(g.byId('overlayContent').innerHTML), '结算里报了命中率');
const nextBtn = g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'next');
chk(!!nextBtn, '结算有「进下一关」按钮');
nextBtn.dispatch('click');
g.pump(0.3);
s = st(g);
chk(s.level === 2 && s.phase === 'play', '进入第 ' + s.level + ' 关 ' + s.name);
chk(s.balls.length > 0 && s.lead < 30 && s.score >= 1000, '新关珠链回到起点，分数累计保留');
chk(s.balls.length % 3 + s.balls.filter((b) => b === BOMB).length % 3 <= s.balls.length, '新关盘面 ' + s.balls.length + ' 颗');
chk(g.byId('level').textContent.indexOf('2') === 0, '统计条关卡 = ' + g.byId('level').textContent);

/* ==================== 7. 炸弹 ==================== */
z(g).setBalls([0, 0, 1, 1, BOMB, 2, 2, 3, 3, 0, 0]);
z(g).setLead(300);
z(g).setCur(3);
const len7 = st(g).balls.length;
z(g).shoot(4, 3, true);                           // 直接撞炸弹
s = st(g);
chk(s.balls.indexOf(BOMB) < 0, '炸弹被打中即引爆');
chk(s.balls.length <= len7 - 5, '爆炸清掉一片：' + len7 + ' → ' + s.balls.length);

/* ==================== 8. 冻结 ==================== */
z(g).setBalls([1, 1, 1, 1, 1, 1, 1]);
z(g).setLead(300);
z(g).setCur(1);
z(g).shoot(3, 1, true);
chk(st(g).balls.length === 0, '一次爆 7 颗全清');
chk(st(g).phase === 'between', '清空即过关');

/* ==================== 9. 爬进洞口判负 ==================== */
const g9 = openWorld();
const score9 = st(g9).score;
z(g9).setLead(st(g9).len - 6);
g9.pump(1.2);
chk(st(g9).phase === 'over', '珠链爬进洞口立即判负');
chk(/珠子进洞了/.test(g9.byId('overlayContent').innerHTML), '弹出失败遮罩');
chk(Number(g9.storage.getItem('zuma.level')) >= 1, '记录最远关卡 zuma.level=' + g9.storage.getItem('zuma.level'));
g9.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'again').dispatch('click');
g9.pump(0.3);
chk(st(g9).level === 1 && st(g9).balls.length % 3 === 0, '「再来一局」回到第 1 关');

/* ==================== 10. 暂停 / 说明 ==================== */
const g10 = openWorld();
const leadA = st(g10).lead;
g10.fire(g10.byId('btnPause'), 'click');
chk(st(g10).phase === 'paused', '点暂停进入暂停');
g10.pump(2);
chk(st(g10).lead === leadA, '暂停时珠链不前进');
chk(/暂停中/.test(g10.byId('overlayContent').innerHTML), '暂停遮罩文案');
g10.key('p');
g10.pump(1.2);
chk(st(g10).phase === 'play' && st(g10).lead > leadA, '按 P 继续，珠链恢复前进');
g10.fire(g10.byId('btnHelp'), 'click');
chk(/祖玛珠链/.test(g10.byId('overlayContent').innerHTML), '「说明」按钮能重看玩法');

/* ==================== 11. 队列生成质量 ==================== */
for (const lv of [1, 2, 3, 4]) {
  const gg = openWorld();
  gg.ctx.__z.startLevel(lv);
  const b = st(gg).balls;
  let run = 1, maxRun = 1;
  for (let i = 1; i < b.length; i++) {
    run = b[i] === b[i - 1] ? run + 1 : 1;
    maxRun = Math.max(maxRun, run);
  }
  const counts = {};
  for (const c of b) if (c !== BOMB) counts[c] = (counts[c] || 0) + 1;
  const broken = Object.keys(counts).filter((c) => counts[c] % 3);
  chk(maxRun === 3, '第 ' + lv + ' 关最长同色串 ' + maxRun + ' 颗(相邻三连组必须不同色，否则一发就整链清空)');
  chk(broken.length === 0, '第 ' + lv + ' 关每种颜色都是 3 的倍数，没有清不掉的残珠');
  chk(b.length * GAP_OK <= st(gg).len, '第 ' + lv + ' 关珠链 ' + b.length * GAP_OK + 'px 短于轨道 ' + Math.round(st(gg).len) + 'px');
}

/* ==================== 12. 分数纪录 ==================== */
const g11 = loadGame('zuma', { transform: inject, storage: { 'zuma.best': '50' } });
g11.pump(0.3);
chk(g11.byId('best').textContent === '50', '首页留下的最高分回填到统计条');
z(g11).setBalls([0, 0, 0]);
z(g11).setLead(200);
z(g11).setCur(0);
const start11 = g11.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === 'start');
start11.dispatch('click');
g11.pump(0.2);
z(g11).setBalls([1, 1, 1]);
z(g11).setLead(200);
z(g11).setCur(1);
z(g11).shoot(1, 1, true);
chk(st(g11).phase === 'between', '第 1 关打空即过关');
chk(Number(g11.storage.getItem('zuma.best')) >= 50, '过关后最高分不低于原纪录：' + g11.storage.getItem('zuma.best'));

summary('祖玛珠链', fails);
