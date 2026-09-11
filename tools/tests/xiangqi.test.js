'use strict';
/* 中国象棋回归：每条规则都用「点棋子 → 点目标 → 看存档棋盘变没变」探针式验证
   A. 记谱法（炮二平五 / 馬8进7）  B. 车路受阻  C. 蹩马腿  D. 炮隔子打
   E. 兵过河  F. 士象将的活动范围  G. 将帅照面  H. 应将  I. 绝杀  J. 困毙
   K. 悔棋 / 换边 / 战绩 / 断点续玩 / 提示可跟走 */
const { loadGame } = require('../smoketest.js');
const { ok, report } = require('./_assert.js');

const COLS = 9, PAD = 44, CELL = 64, W = 600, VIEW = 460;
const chk = (cond, msg) => !!ok(cond, msg);
const idx = (c, r) => r * COLS + c;

function Bd(...placed) {
  const rows = [];
  for (let r = 0; r < 10; r++) rows.push('.........'.split(''));
  for (const one of placed) {
    const [ch, cr] = one.split(':');
    const [c, r] = cr.split(',').map(Number);
    rows[r][c] = ch;
  }
  return rows.map((x) => x.join('')).join('');
}
function boot(storage) {
  const g = loadGame('xiangqi', { storage: storage || {} });
  g.pump(1.5);
  return g;
}
// 只点遮罩上的按钮（smoketest 的 act() 会把侧栏按钮一起点一遍）
function start(g) {
  g.byId('overlay').dispatch('click', { target: { closest: () => ({ dataset: { act: 'start' } }) } });
  g.pump(0.4);
}
function clickTool(g, id) {
  g.byId(id).dispatch('click');
  g.pump(0.4);
}
function tap(g, c, r) {
  const s = VIEW / W;
  g.canvas().dispatch('pointerdown', { pointerId: 1, isPrimary: true, clientX: (PAD + c * CELL) * s, clientY: (PAD + r * CELL) * s });
  g.pump(1.2);
}
const snap = (g) => { try { return JSON.parse(g.storage.getItem('xiangqi.save') || 'null'); } catch (e) { return null; } };
const at = (g, c, r) => { const s = snap(g); return s ? s.bd[idx(c, r)] : '·'; };
const fixture = (bd, turn, extra) => JSON.stringify(Object.assign({ m: 'pvp', s: 1, bd: bd, mv: [], t: turn, q: 0 }, extra || {}));
// 没走成 = 没有存档，或者存档里的局面与起点一致
const unmoved = (g, fromBd) => { const s = snap(g); return !s || s.bd === fromBd; };

/* ==================== A. 记谱 ==================== */
const g1 = boot({ 'xiangqi.mode': 'pvp' });
start(g1);
tap(g1, 7, 7); tap(g1, 4, 7);
chk(at(g1, 4, 7) === 'C' && at(g1, 7, 7) === '.', '红炮平到中路', g1 && at(g1, 4, 7));
chk(g1.byId('notat').textContent === '炮二平五', '棋谱记作「炮二平五」', g1.byId('notat').textContent);
tap(g1, 7, 0); tap(g1, 6, 2);
chk(at(g1, 6, 2) === 'n' && at(g1, 7, 0) === '.', '黑马跳出', at(g1, 6, 2));
chk(g1.byId('notat').textContent === '炮二平五 · 馬8进7', '黑方用 8 路数字记谱', g1.byId('notat').textContent);
chk(g1.byId('moves').textContent === '2', '着数累计 2', g1.byId('moves').textContent);

/* ==================== B. 车路受阻 ==================== */
const g2 = boot({ 'xiangqi.mode': 'pvp' });
start(g2);
tap(g2, 0, 9); tap(g2, 0, 6);
chk(snap(g2) === null, '自家兵挡住的直线走点走不了', snap(g2) && snap(g2).bd);
tap(g2, 0, 9); tap(g2, 0, 8);
chk(at(g2, 0, 8) === 'R' && at(g2, 0, 9) === '.', '车能挺一步', at(g2, 0, 8));
chk(g2.byId('notat').textContent === '車九进一', '边车挺一步记作「車九进一」', g2.byId('notat').textContent);

/* ==================== C. 蹩马腿 ==================== */
const horsePos = Bd('N:4,4', 'p:3,4', 'p:5,4', 'p:6,5', 'k:5,0', 'K:3,9');
const g3 = boot({ 'xiangqi.mode': 'pvp', 'xiangqi.save': fixture(horsePos, 1) });
tap(g3, 4, 4); tap(g3, 2, 3);
chk(unmoved(g3, horsePos), '马腿被别住时跳不过去', snap(g3) && snap(g3).bd);
tap(g3, 4, 4); tap(g3, 3, 2);
chk(at(g3, 3, 2) === 'N' && at(g3, 4, 4) === '.', '另一侧没别腿，马能跳出去', snap(g3) && snap(g3).bd);

/* ==================== D. 炮隔子打 ==================== */
const withScreen = Bd('C:4,3', 'P:4,2', 'p:4,1', 'k:5,0', 'K:3,9');
const g4 = boot({ 'xiangqi.mode': 'pvp', 'xiangqi.save': fixture(withScreen, 1) });
tap(g4, 4, 3); tap(g4, 4, 1);
chk(at(g4, 4, 1) === 'C' && at(g4, 4, 3) === '.', '炮隔一个炮架能吃子', snap(g4) && snap(g4).bd);
const noScreen = Bd('C:4,3', 'p:4,1', 'k:5,0', 'K:3,9');
const g5 = boot({ 'xiangqi.mode': 'pvp', 'xiangqi.save': fixture(noScreen, 1) });
tap(g5, 4, 3); tap(g5, 4, 1);
chk(unmoved(g5, noScreen), '没有炮架时炮不能吃近子', snap(g5) && snap(g5).bd);
tap(g5, 4, 3); tap(g5, 4, 2);
chk(at(g5, 4, 2) === 'C', '炮可以正常平移', at(g5, 4, 2));

/* ==================== E. 兵过河 ==================== */
const pawnCross = Bd('P:4,4', 'k:5,0', 'K:3,9', 'p:6,7');
const g6 = boot({ 'xiangqi.mode': 'pvp', 'xiangqi.save': fixture(pawnCross, 1) });
tap(g6, 4, 4); tap(g6, 4, 5);
chk(unmoved(g6, pawnCross), '兵不能后退', snap(g6) && snap(g6).bd);
tap(g6, 4, 4); tap(g6, 3, 4);
chk(at(g6, 3, 4) === 'P', '过河兵能横走', at(g6, 3, 4));
const pawnHome = Bd('P:4,5', 'k:5,0', 'K:3,9');
const g7 = boot({ 'xiangqi.mode': 'pvp', 'xiangqi.save': fixture(pawnHome, 1) });
tap(g7, 4, 5); tap(g7, 3, 5);
chk(unmoved(g7, pawnHome), '未过河不能横走', snap(g7) && snap(g7).bd);
tap(g7, 4, 5); tap(g7, 4, 4);
chk(at(g7, 4, 4) === 'P', '未过河能直进', at(g7, 4, 4));

/* ==================== F. 士 / 将的活动范围 ==================== */
const guard = Bd('A:4,8', 'k:5,0', 'K:3,9');
const g8 = boot({ 'xiangqi.mode': 'pvp', 'xiangqi.save': fixture(guard, 1) });
tap(g8, 4, 8); tap(g8, 4, 7);
chk(unmoved(g8, guard), '士只能斜走，不能直走', snap(g8) && snap(g8).bd);
tap(g8, 4, 8); tap(g8, 2, 6);
chk(unmoved(g8, guard), '士不能出九宫', snap(g8) && snap(g8).bd);
tap(g8, 4, 8); tap(g8, 3, 7);
chk(at(g8, 3, 7) === 'A', '士斜飞一步', at(g8, 3, 7));
const king = Bd('K:4,9', 'k:3,0', 'R:8,5', 'p:0,0');
const g9 = boot({ 'xiangqi.mode': 'pvp', 'xiangqi.save': fixture(king, 1) });
tap(g9, 4, 9); tap(g9, 3, 8);
chk(unmoved(g9, king), '将帅只能横竖一步', snap(g9) && snap(g9).bd);
tap(g9, 4, 9); tap(g9, 5, 9);
chk(at(g9, 5, 9) === 'K', '帅能在宫内横移', at(g9, 5, 9));

/* ==================== G. 将帅不能照面 ==================== */
const facing = Bd('K:4,9', 'k:4,0', 'P:4,4', 'p:0,7');
const g10 = boot({ 'xiangqi.mode': 'pvp', 'xiangqi.save': fixture(facing, 1) });
tap(g10, 4, 4); tap(g10, 3, 4);
chk(unmoved(g10, facing), '挡架横移会把帅露在将面前 → 非法', snap(g10) && snap(g10).bd);
tap(g10, 4, 4); tap(g10, 4, 3);
chk(at(g10, 4, 3) === 'P', '同样一步直进仍然挡着 → 合法', at(g10, 4, 3));
const facing2 = Bd('K:3,9', 'k:4,0', 'p:0,7');
const g11 = boot({ 'xiangqi.mode': 'pvp', 'xiangqi.save': fixture(facing2, 1) });
tap(g11, 3, 9); tap(g11, 4, 9);
chk(unmoved(g11, facing2), '帅不能走到与将同线的空档上', snap(g11) && snap(g11).bd);

/* ==================== H. 被将必须应将 ==================== */
const checked = Bd('k:4,0', 'R:0,0', 'K:3,9');
const g12 = boot({ 'xiangqi.mode': 'pvp', 'xiangqi.save': fixture(checked, -1) });
tap(g12, 4, 0); tap(g12, 3, 0);
chk(unmoved(g12, checked), '沿被将的横线躲仍然是被将 → 非法', snap(g12) && snap(g12).bd);
tap(g12, 4, 0); tap(g12, 4, 1);
chk(at(g12, 4, 1) === 'k' && at(g12, 4, 0) === '.', '将只能向前走一步应将', snap(g12) && snap(g12).bd);
const g13 = boot({ 'xiangqi.mode': 'mid', 'xiangqi.save': fixture(checked, -1, { m: 'mid', s: 1 }) });
const s13 = snap(g13);
chk(!!s13 && s13.bd[idx(4, 1)] === 'k', '电脑被将时会应将', s13 && s13.bd);
chk(g13.byId('turn').textContent.indexOf('应将') >= 0 || g13.byId('turn').textContent.indexOf('红') >= 0,
  '应将后回合提示正常', g13.byId('turn').textContent);

/* ==================== I. 绝杀 ==================== */
const mate = Bd('k:4,0', 'R:0,1', 'P:4,3', 'R:8,5', 'K:4,9');
const g14 = boot({ 'xiangqi.mode': 'pvp', 'xiangqi.save': fixture(mate, 1) });
tap(g14, 8, 5); tap(g14, 8, 0);
chk(g14.byId('turn').textContent === '红方胜', '沉底车一步绝杀', g14.byId('turn').textContent);
chk(/绝杀/.test(g14.byId('overlayContent').innerHTML), '结算写明「绝杀」', '');
chk(snap(g14) === null, '结束后清掉续玩存档', snap(g14) && 'still');
const g15 = boot({ 'xiangqi.mode': 'hard', 'xiangqi.side': '-1', 'xiangqi.save': fixture(mate, 1, { m: 'hard', s: -1 }) });
chk(g15.byId('turn').textContent === '红方胜', '高手档 AI 能自己算出这一步绝杀', g15.byId('turn').textContent);
chk(g15.byId('notat').textContent === '車一进五', 'AI 的杀着记作「車一进五」', g15.byId('notat').textContent);
chk(g15.storage.getItem('xiangqi.losses') === '1', '玩家输棋计入负场', g15.storage.getItem('xiangqi.losses'));

// 玩家执红绝杀 → 胜场 + 连胜
const g16 = boot({ 'xiangqi.mode': 'mid', 'xiangqi.save': fixture(mate, 1, { m: 'mid', s: 1 }) });
tap(g16, 8, 5); tap(g16, 8, 0);
chk(g16.storage.getItem('xiangqi.wins') === '1', '人机模式赢棋记胜场', g16.storage.getItem('xiangqi.wins'));
chk(g16.storage.getItem('xiangqi.streak') === '1', '连胜同步累计', g16.storage.getItem('xiangqi.streak'));
chk(g16.byId('score').textContent === '1 胜 0 负', '战绩数码片更新', g16.byId('score').textContent);

/* ==================== J. 困毙（无子可走但未被将） ==================== */
const stuck = Bd('k:4,0', 'N:2,2', 'N:6,2', 'P:0,7', 'K:3,9');
const g17 = boot({ 'xiangqi.mode': 'pvp', 'xiangqi.save': fixture(stuck, 1) });
tap(g17, 0, 7); tap(g17, 0, 6);
chk(g17.byId('turn').textContent === '红方胜' && /困毙/.test(g17.byId('overlayContent').innerHTML),
  '黑方无子可动 → 判红方胜（困毙）', g17.byId('turn').textContent);

/* ==================== K. 悔棋 / 换边 / 提示 / 续玩 ==================== */
const g18 = boot({ 'xiangqi.mode': 'mid' });
start(g18);
tap(g18, 7, 7); tap(g18, 4, 7);                       // 红炮二平五，电脑应手
const s18 = snap(g18);
chk(!!s18 && s18.mv.length === 2, '电脑会应一步（2 半着）', s18 && s18.mv);
tap(g18, 8, 7);                                       // 再跳一只马？先选中
const s18b = snap(g18);
chk(!!s18b && s18b.mv.length === 2, '轮到玩家时才允许落子', s18b && s18b.mv.length);
g18.byId('btnUndo').dispatch('click');
g18.pump(0.4);
chk(snap(g18) === null && g18.byId('moves').textContent === '0' && g18.byId('notat').textContent === '尚未开局',
  '悔棋一次退两步回到开局，并清掉空局存档', g18.byId('moves').textContent);

const g19 = boot({ 'xiangqi.mode': 'mid', 'xiangqi.side': '-1' });
g19.pump(1.5);
chk(g19.byId('moves').textContent === '1', '执黑时电脑红先走一步', g19.byId('moves').textContent);
chk(g19.byId('turn').textContent === '黑方(你)', '电脑走完轮到你时提示带身份标记', g19.byId('turn').textContent);
clickTool(g19, 'btnSide');
chk(g19.byId('moves').textContent === '1' && g19.byId('btnSide')._cls.includes('armed'),
  '第一下换边只是请求确认', g19.byId('btnSide')._cls.join(','));
clickTool(g19, 'btnSide');
chk(g19.byId('moves').textContent === '0' && g19.storage.getItem('xiangqi.side') === '1',
  '再点一下换边把先后手交还给玩家', g19.byId('moves').textContent + '/' + g19.storage.getItem('xiangqi.side'));

const g20 = boot({ 'xiangqi.mode': 'pvp' });
start(g20);
tap(g20, 7, 7); tap(g20, 4, 7);
g20.byId('btnHint').dispatch('click');
g20.pump(0.6);
const s20 = snap(g20);
chk(!!s20 && Array.isArray(s20.h), '提示会给出一个建议着法并写进存档', JSON.stringify(s20 && s20.h));
chk(g20.byId('notat').textContent.indexOf('建议') === 0, '棋谱条显示建议着法', g20.byId('notat').textContent);
const before = s20.bd;
tap(g20, s20.h[0] % COLS, (s20.h[0] / COLS) | 0);
tap(g20, s20.h[1] % COLS, (s20.h[1] / COLS) | 0);
const s20b = snap(g20);
chk(!!s20b && s20b.bd !== before && s20b.mv.length === 2 && s20b.mv[1][0] === s20.h[0],
  '照着提示走能落在棋盘上', s20b && JSON.stringify(s20b.mv));

const g21 = boot({ 'xiangqi.mode': 'pvp' });
start(g21);
tap(g21, 1, 7); tap(g21, 4, 7);                        // 另一只炮平中
tap(g21, 0, 3); tap(g21, 0, 4);                        // 黑卒进一步
const data = {};
for (const k of Object.keys(g21.storage._data)) data[k] = g21.storage._data[k];
const g22 = loadGame('xiangqi', { storage: data });
g22.pump(0.5);
chk(/继续上一局/.test(g22.byId('overlayContent').innerHTML), '刷新后有「继续上一局」', '');
chk(g22.byId('moves').textContent === '2' && g22.byId('notat').textContent.indexOf('·') > 0,
  '续玩恢复了 2 半着与整段棋谱', g22.byId('moves').textContent + ' / ' + g22.byId('notat').textContent);
g22.byId('overlay').dispatch('click', { target: { closest: () => ({ dataset: { act: 'resume' } }) } });
g22.pump(0.4);
chk(!g22.byId('overlay')._cls.includes('show'), '遮罩收起可以继续下', '');
tap(g22, 4, 6); tap(g22, 4, 5);
chk(snap(g22) && snap(g22).mv.length === 3, '续玩后落子正常（3 半着）', snap(g22) && snap(g22).mv.length);
tap(g22, 0, 9);
chk(snap(g22) && snap(g22).mv.length === 3, '只点一下棋子是选中，不会误走', snap(g22) && snap(g22).mv.length);

report('中国象棋');
