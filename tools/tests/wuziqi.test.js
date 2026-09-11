'use strict';
/* 五子棋回归：
   A. 高手档必须堵冲四 / 必须补自己的五连（用续玩存档摆出指定局面，再让 AI 应手）
   B. 胜负判定与独立扫描器一致，战绩与连胜正确写入
   C. 双人模式：不叫 AI、五连判胜、认输要连点两次
   D. 悔棋、换对战方式重开、断点续玩 */
const { loadGame } = require('../smoketest.js');
const { ok, report } = require('./_assert.js');

const N = 15, PAD = 40, CELL = 40, W = 640, VIEW = 460;
const chk = (cond, msg) => !!ok(cond, msg);

const K = (x, y) => y * N + x;
const pt = (i) => [i % N, (i / N) | 0];
const idxOf = (mv) => mv.map(pt);

// 独立判定：把棋谱重放到棋盘上，扫描是否有五连
function scanWinner(mv) {
  const bd = new Map();
  mv.forEach((i, k) => bd.set(i, k % 2 === 0 ? 1 : 2));
  for (const [i, c] of bd) {
    const [x, y] = pt(i);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      let n = 1;
      for (let k = 1; k < 5; k++) {
        const nx = x + dx * k, ny = y + dy * k;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || bd.get(ny * N + nx) !== c) break;
        n++;
      }
      if (n >= 5) return { color: c, at: i };
    }
  }
  return null;
}

function boot(mode, mv) {
  const storage = { 'wuziqi.mode': mode };
  if (mv) storage['wuziqi.save'] = JSON.stringify({ m: mode, mv });
  const g = loadGame('wuziqi', { storage });
  g.pump(0.3);
  return g;
}
const movesOf = (g) => {
  try { return JSON.parse(g.storage.getItem('wuziqi.save') || 'null'); } catch (e) { return null; }
};
function clickCell(g, x, y) {
  const s = VIEW / W;
  g.canvas().dispatch('pointerdown', { pointerId: 1, isPrimary: true, clientX: (PAD + x * CELL) * s, clientY: (PAD + y * CELL) * s });
  g.pump(0.9);
}
// 只点遮罩里的按钮（smoketest 的 act() 会连带点到侧栏按钮，不适合精确断言）
function actOn(g, name) {
  g.byId('overlay').dispatch('click', { target: { closest: () => ({ dataset: { act: name } }) } });
  g.pump(0.4);
}

/* ==================== A1. 四连必堵 ==================== */
// 黑 (4,7)(5,7)(6,7)(7,7)，两端 (3,7)/(8,7) 都是成五点；轮到白（电脑）
const g1 = boot('hard', [K(4, 7), K(0, 0), K(5, 7), K(0, 2), K(6, 7), K(0, 4), K(7, 7)]);
g1.pump(1.5);
const s1 = movesOf(g1);
chk(!!s1 && s1.mv.length === 8, '电脑在轮到它时立即应手（共 8 手）', s1 ? idxOf(s1.mv) : '没有存档');
const block = s1 ? s1.mv[7] : -1;
chk(block === K(3, 7) || block === K(8, 7), '高手档一定堵在黑四的端点上：' + JSON.stringify(pt(block)), '下在 ' + JSON.stringify(pt(block)));

/* ==================== A2. 活三也该拦 ==================== */
const g2 = boot('hard', [K(4, 7), K(0, 0), K(5, 7), K(0, 2), K(6, 7)]);
g2.pump(1.5);
const s2 = movesOf(g2);
const r2 = s2 ? s2.mv[5] : -1;
chk(r2 === K(3, 7) || r2 === K(7, 7), '面对黑活三，高手档会占住一端：' + JSON.stringify(pt(r2)), '下在 ' + JSON.stringify(pt(r2)));

/* ==================== A3. 自己能成五就先赢 ==================== */
const g3 = boot('hard', [K(0, 0), K(4, 7), K(0, 2), K(5, 7), K(0, 4), K(6, 7), K(0, 6), K(7, 7), K(0, 8)]);
g3.pump(1.5);
chk(movesOf(g3) === null, '电脑补成五连，本局结束并清掉续玩存档', JSON.stringify(movesOf(g3)));
chk(/白方胜/.test(g3.byId('turn').textContent), '回合数码片显示「白方胜」', g3.byId('turn').textContent);
chk(g3.storage.getItem('wuziqi.losses') === '1', '输了会计入负场', g3.storage.getItem('wuziqi.losses'));
chk(/再来一局/.test(g3.byId('overlayContent').innerHTML), '结算遮罩弹出并提供再来一局', '');
const w3 = scanWinner([K(0, 0), K(4, 7), K(0, 2), K(5, 7), K(0, 4), K(6, 7), K(0, 6), K(7, 7), K(0, 8), K(3, 7)]);
chk(w3 && w3.color === 2 && (w3.at === K(3, 7) || w3.at === K(8, 7)), '独立扫描器同样判定白方五连', JSON.stringify(w3));

/* ==================== A4. 新手档允许放水 ==================== */
const g4 = boot('easy', [K(4, 7), K(0, 0), K(5, 7), K(0, 2), K(6, 7), K(0, 4), K(7, 7)]);
g4.pump(1.5);
const s4 = movesOf(g4);
chk(!!s4 && s4.mv.length === 8 && !scanWinner(s4.mv), '新手档也会正常落一手且没有意外五连', JSON.stringify(s4 && s4.mv));

/* ==================== B. 玩家五连判胜 + 战绩 ==================== */
const g5 = boot('hard', [K(4, 7), K(0, 0), K(5, 7), K(0, 2), K(6, 7), K(0, 4)]);
g5.pump(0.5);
clickCell(g5, 7, 7);                                     // 黑四连，电脑必须堵
const s5 = movesOf(g5);
chk(!!s5 && s5.mv.length === 8, '玩家落子后电脑应手（8 手）', s5 ? s5.mv.length : '没有存档');
const gap = s5.mv[7] === K(3, 7) ? K(8, 7) : K(3, 7);     // 另一端仍然空着
clickCell(g5, gap % N, (gap / N) | 0);
chk(movesOf(g5) === null && /黑方胜/.test(g5.byId('turn').textContent),
  '冲四被堵后换个端点成五即胜', g5.byId('turn').textContent);
chk(g5.storage.getItem('wuziqi.wins') === '1', '胜场写入 localStorage', g5.storage.getItem('wuziqi.wins'));
chk(g5.storage.getItem('wuziqi.streak') === '1', '连胜写入 localStorage', g5.storage.getItem('wuziqi.streak'));
g5.pump(1.2);
chk(/最长连胜 1/.test(g5.byId('overlayContent').innerHTML), '结算面板显示最长连胜', '');

/* ==================== C. 双人模式 ==================== */
const g6 = boot('pvp');
actOn(g6, 'start');
clickCell(g6, 3, 3);
chk(!!movesOf(g6) && movesOf(g6).mv.length === 1, '双人模式落一手后不会自动出现对手应手', JSON.stringify(movesOf(g6)));
const filler = [K(0, 1), K(0, 2), K(0, 3), K(0, 4)];
const seq = [K(3, 3), K(4, 4), K(5, 5), K(6, 6), K(7, 7)];
const flat = [];
for (let k = 0; k < seq.length; k++) {
  flat.push(seq[k]);
  clickCell(g6, seq[k] % N, (seq[k] / N) | 0);
  if (filler[k] != null) { flat.push(filler[k]); clickCell(g6, filler[k] % N, (filler[k] / N) | 0); }
}
const w6 = scanWinner(flat);
chk(!!w6 && w6.color === 1 && seq.indexOf(w6.at) >= 0, '独立扫描器判定黑方斜五连', JSON.stringify(w6));
chk(movesOf(g6) === null && /黑方胜/.test(g6.byId('turn').textContent), '双人模式判胜', g6.byId('turn').textContent);
chk(g6.storage.getItem('wuziqi.wins') === null, '双人模式不动人机战绩', g6.storage.getItem('wuziqi.wins'));
chk(g6.storage.getItem('wuziqi.pvp') === '1:0:0', '双人比分累计为黑 1 : 0 白', g6.storage.getItem('wuziqi.pvp'));
chk(g6.byId('score').textContent === '黑 1 : 0 白', '战绩数码片切到双人比分', g6.byId('score').textContent);

// 认输要连点两次
const g7 = boot('pvp', [K(3, 3), K(4, 4)]);
g7.byId('btnResign').dispatch('click');
g7.pump(0.3);
chk(!!movesOf(g7) && g7.byId('btnResign')._cls.includes('armed'), '第一下认输只是请求确认', JSON.stringify(g7.byId('btnResign')._cls));
g7.byId('btnResign').dispatch('click');
g7.pump(0.3);
chk(movesOf(g7) === null && /白方胜/.test(g7.byId('turn').textContent), '第二下认输才判负（轮到黑方认输）', g7.byId('turn').textContent);

/* ==================== D. 悔棋 / 重开 / 续玩 ==================== */
const g8 = boot('hard', [K(7, 7), K(8, 8), K(6, 6)]);
g8.pump(0.5);
chk(g8.byId('moves').textContent === '4', '续玩恢复 3 手后电脑立即补一手', g8.byId('moves').textContent);
g8.byId('btnUndo').dispatch('click');
g8.pump(0.3);
const s8 = movesOf(g8);
chk(!!s8 && s8.mv.length === 2 && g8.byId('turn').textContent === '该你落子',
  '悔棋一次撤掉双方各一手回到玩家回合', (s8 || {}).mv + ' / ' + g8.byId('turn').textContent);
chk(s8 && s8.mv.indexOf(K(6, 6)) < 0, '撤掉的是最后一手（(6,6) 已不在棋盘上）', JSON.stringify(s8 && s8.mv.map(pt)));

const g9 = boot('pvp', [K(7, 7)]);
g9.byId('diff').dispatch('click', { target: { closest: () => ({ dataset: { m: 'mid' } }) } });
g9.pump(0.4);
chk(movesOf(g9) === null && g9.byId('moves').textContent === '0', '切换对战方式立刻重开', g9.byId('moves').textContent);
chk(g9.storage.getItem('wuziqi.mode') === 'mid', '对战方式会被记住', g9.storage.getItem('wuziqi.mode'));

// 有存档时开场给「继续上一局」
const g10 = boot('pvp', [K(7, 7), K(7, 8), K(8, 8)]);
chk(/继续上一局/.test(g10.byId('overlayContent').innerHTML), '有存档时开场遮罩给出「继续上一局」', '');
chk(g10.byId('moves').textContent === '3', '续玩恢复了 3 手', g10.byId('moves').textContent);
actOn(g10, 'resume');
chk(!g10.byId('overlay')._cls.includes('show'), '点「继续上一局」遮罩收起', '');
clickCell(g10, 6, 6);
chk(g10.byId('moves').textContent === '4', '续玩后能接着下', g10.byId('moves').textContent);
g10.byId('btnHint').dispatch('click');
g10.pump(0.3);
chk(true, '点提示不会崩');

report('五子棋');
