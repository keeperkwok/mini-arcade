'use strict';
/* 四子棋回归：测试里自带一份独立引擎（重力落点 + 四连判定），逐手对照
   A. 竖直 / 水平 / 斜向三种连线都在正确的第几手判胜（顺带验证重力）
   B. 整盘对局：手数、行棋方、终局结果与独立引擎完全一致
   C. 人机：AI 必堵三连、必吃掉眼、每一手都合法；悔棋退两轮；认输两次确认
   D. 满列不可落、键盘落子、断点续玩 */
const { loadGame } = require('../smoketest.js');
const { ok, report } = require('./_assert.js');

const COLS = 7, ROWS = 6, CELL = 80, W = 560, H = 480, VIEW = 460;
const S = VIEW / W;                                  // 桩里 canvas 宽 460，逻辑宽 560
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const NAME = { 1: '红方', 2: '黄方' };
const chk = (cond, msg, detail) => !!ok(cond, msg + (cond ? '' : ' → ' + detail));
const idx = (c, r) => r * COLS + c;

function runAt(b, i, col) {
  const c0 = i % COLS, r0 = (i / COLS) | 0;
  for (const [dc, dr] of DIRS) {
    const cells = [i];
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      let c = c0 + dc * sgn, r = r0 + dr * sgn;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && b[r * COLS + c] === col) {
        cells.push(r * COLS + c); c += dc * sgn; r += dr * sgn;
      }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

// 独立引擎：把一串列号重放到棋盘上
function replay(mv) {
  const b = new Uint8Array(COLS * ROWS), h = new Uint8Array(COLS);
  let color = 1, win = 0, ply = 0, bad = '';
  for (const col of mv) {
    if (!(col >= 0 && col < COLS) || h[col] >= ROWS) { bad = '第 ' + (ply + 1) + ' 手列 ' + col + ' 不可下'; break; }
    const i = idx(col, ROWS - 1 - h[col]);
    b[i] = color; h[col]++; ply++;
    if (runAt(b, i, color)) { win = color; break; }
    color = 3 - color;
  }
  return { b, h, turn: color, win, ply, bad };
}
const legalOf = (st) => { const out = []; for (let c = 0; c < COLS; c++) if (st.h[c] < ROWS) out.push(c); return out; };
// 该颜色下一步能赢在哪一列（没有则 -1）
function winsNow(st, color) {
  const b = Uint8Array.from(st.b), h = Uint8Array.from(st.h);
  for (const c of legalOf(st)) {
    const i = idx(c, ROWS - 1 - h[c]);
    b[i] = color;
    const w = !!runAt(b, i, color);
    b[i] = 0;
    if (w) return c;
  }
  return -1;
}
// 走这一列会不会把「同一列再上一手即赢」的赢点送给对手
function givesAway(st, c, color) {
  const b = Uint8Array.from(st.b), h = Uint8Array.from(st.h);
  b[idx(c, ROWS - 1 - h[c])] = color; h[c]++;
  if (h[c] >= ROWS) return false;
  const j = idx(c, ROWS - 1 - h[c]);
  b[j] = 3 - color;
  return !!runAt(b, j, 3 - color);
}
const cells = (st) => { let r = 0, y = 0; for (const v of st.b) { if (v === 1) r++; else if (v === 2) y++; } return { r, y }; };

function boot(mode, storage) {
  const g = loadGame('siziqi', { storage: Object.assign({ 'siziqi.mode': mode }, storage || {}) });
  g.pump(0.4);
  g.byId('overlay').dispatch('click', { target: { closest: () => ({ dataset: { act: 'start' } }) } });
  g.pump(0.4);
  return g;
}
// 用续玩存档摆局面：restore 按红先行交替，棋谱长度为奇数即轮到执黄的 AI
function bootSave(obj) {
  const g = loadGame('siziqi', { storage: { 'siziqi.mode': obj.m, 'siziqi.save': JSON.stringify(obj) } });
  g.pump(0.4);
  g.byId('overlay').dispatch('click', { target: { closest: () => ({ dataset: { act: 'resume' } }) } });
  g.pump(0.4);
  return g;
}
const tap = (g, c, sec) => {
  g.canvas().dispatch('pointerdown', {
    pointerId: 1, isPrimary: true,
    clientX: (c + 0.5) * CELL * S, clientY: (H / 2) * S,
  });
  g.pump(sec == null ? 0.3 : sec);
};
const key = (g, k) => { g.win.dispatch('keydown', { key: k }); g.pump(0.3); };
const chip = (g) => g.byId('turn').textContent;
const plies = (g) => Number(g.byId('moves').textContent);
const snap = (g) => { try { return JSON.parse(g.storage.getItem('siziqi.save') || 'null'); } catch (e) { return null; } };
const mvOf = (g) => { const s = snap(g); return s && Array.isArray(s.mv) ? s.mv : null; };

/* ==================== A. 三种连线 ==================== */
const CASES = [
  { name: '竖直四连', mv: [0, 1, 0, 1, 0, 1, 0] },
  { name: '水平四连', mv: [0, 0, 1, 1, 2, 2, 3] },
  { name: '斜向四连', mv: [0, 1, 1, 2, 2, 6, 2, 3, 5, 3, 5, 3, 3] },
];
for (const cs of CASES) {
  const want = replay(cs.mv);
  chk(want.win === 1 && want.ply === cs.mv.length, cs.name + '：独立引擎判红第 ' + cs.mv.length + ' 手胜', want.ply + ' 手 / win=' + want.win + cs.bad);
  const g = boot('pvp');
  for (const c of cs.mv) tap(g, c, 0.2);
  chk(plies(g) === want.ply, cs.name + '：游戏也在第 ' + want.ply + ' 手收兵', '手数 ' + plies(g));
  chk(chip(g) === '红方胜', cs.name + '：回合片显示「红方胜」', chip(g));
  g.pump(1.2);
  chk(/再来一局/.test(g.byId('overlayContent').innerHTML), cs.name + '：结算遮罩自动弹出', '');
  chk(snap(g) === null, cs.name + '：终局后不留续玩存档', JSON.stringify(snap(g)));
}

/* ==================== B. 整盘对照 ==================== */
const g2 = boot('pvp');
const played = [];
let st = replay(played);
let mism = '';
for (let n = 0; n < COLS * ROWS; n++) {
  const legal = legalOf(st);
  if (!legal.length) { mism = '独立引擎已满盘，界面却是 ' + chip(g2); break; }
  if (chip(g2) !== NAME[st.turn]) { mism = '第 ' + (n + 1) + ' 手行棋方不对：界面 ' + chip(g2) + ' / 引擎 ' + NAME[st.turn]; break; }
  const enemy = 3 - st.turn;
  let pick = winsNow(st, st.turn);                       // 自己能赢就赢
  if (pick < 0) pick = winsNow(st, enemy);               // 他能赢就堵
  if (pick < 0) {
    const safe = legal.filter((c) => !givesAway(st, c, st.turn));
    const pool = safe.length ? safe : legal;
    pick = pool[n % pool.length];
  }
  tap(g2, pick, 0.2);
  played.push(pick);
  st = replay(played);
  if (st.bad) { mism = st.bad; break; }
  if (plies(g2) !== played.length) { mism = '手数不同步：' + plies(g2) + ' vs ' + played.length; break; }
  if (st.win) {
    if (chip(g2) !== NAME[st.win] + '胜') mism = '胜负判定不符：' + chip(g2) + ' / 引擎 ' + NAME[st.win] + '胜';
    break;
  }
  if (chip(g2) !== NAME[st.turn]) { mism = '第 ' + st.ply + ' 手后行棋方不对：' + chip(g2); break; }
}
const cnt = cells(st);
g2.pump(1.2);
chk(!mism, '整盘 ' + st.ply + ' 手逐手对照一致（红 ' + cnt.r + ' / 黄 ' + cnt.y + '）', mism);
chk(/胜|平局/.test(chip(g2)), '对局正常收尾：' + chip(g2), chip(g2));
const pvpStr = g2.storage.getItem('siziqi.pvp') || '';
chk(st.win ? /^(1:0:0|0:1:0)$/.test(pvpStr) : /^0:0:1$/.test(pvpStr), '双人比分写入 localStorage', pvpStr);
chk(g2.byId('score').textContent === '红 ' + Number((pvpStr || '0:0:0').split(':')[0]) + ' : ' + Number((pvpStr || '0:0:0').split(':')[1]) + ' 黄',
  '战绩片与存储一致', g2.byId('score').textContent);
chk(mvOf(g2) === null, '分出胜负后续玩存档清掉', JSON.stringify(mvOf(g2)));
g2.byId('btnNew').dispatch('click');
g2.pump(0.4);
chk(plies(g2) === 0 && chip(g2) === '红方', '↻ 重新开局回到空盘先手', plies(g2) + '/' + chip(g2));

/* ==================== C. 人机 ==================== */
// C1 必堵三连：红已占底排 0/1/2，轮到 AI 的第 6 手只有第 4 列能救
const gc = bootSave({ m: 'hard', mv: [0, 0, 1, 1, 2], t: 2 });
gc.pump(2.6);
const mvC = mvOf(gc) || [];
chk(mvC.length === 6 && Number(mvC[5]) === 3, '高手 AI 必堵三连（第 6 手落在第 4 列）', JSON.stringify(mvC));
chk(replay(mvC).ply === 6 && !replay(mvC).bad, 'AI 这一手在独立引擎下合法', JSON.stringify(mvC));

// C2 有眼必吃：黄已占底排 0/1/2，第 8 手落第 4 列即胜
const gw = bootSave({ m: 'hard', mv: [5, 0, 6, 1, 5, 2, 6], t: 1 });
gw.pump(2.8);
chk(mvOf(gw) === null, 'AI 抓住必胜手直接终局', JSON.stringify(mvOf(gw)));
chk(chip(gw) === '黄方胜', 'AI 取胜后回合片显示「黄方胜」', chip(gw));
chk(gw.storage.getItem('siziqi.losses') === '1', '被 AI 吃掉记一负', String(gw.storage.getItem('siziqi.losses')));
gw.pump(1.2);
chk(/电脑赢了/.test(gw.byId('overlayContent').innerHTML), '结算遮罩给出「电脑赢了」', '');

// C3 连续对局：玩家尽量不抢先收官，逼 AI 一路应棋；检查每一手合法且不漏赢棋
const g3 = boot('hard');
let m3 = [];
let aiBad = '';
let missWin = '';
let rounds = 0;
for (let round = 1; round <= 7; round++) {
  const cur = replay(m3);
  if (cur.win || !legalOf(cur).length) break;
  if (cur.turn !== 1) { aiBad = '第 ' + (m3.length + 1) + ' 手本该轮到玩家'; break; }
  const legal = legalOf(cur);
  const block = winsNow(cur, 2);                       // 该堵的必堵
  const calm = legal.filter((c) => c !== block && winsNow(cur, 1) !== c);   // 先不结束战斗
  const pool = calm.length ? calm : legal;
  tap(g3, block >= 0 ? block : pool[(round * 2) % pool.length], 2.6);
  const now = mvOf(g3);
  if (!now) { aiBad = ''; rounds++; break; }           // 被 AI 反杀，棋局已结束
  if (now.length < m3.length + 2) { aiBad = '第 ' + (round + 1) + ' 轮 AI 没应棋（棋谱 ' + now.length + ' 手）'; break; }
  rounds++;
  const pre = replay(now.slice(0, now.length - 1));    // AI 动手之前的局面
  if (pre.turn === 2 && !pre.win) {
    const w = winsNow(pre, 2);
    if (w >= 0 && Number(now[now.length - 1]) !== w) {
      missWin = 'AI 能赢在第 ' + (pre.ply + 1) + ' 手落第 ' + (w + 1) + ' 列，却走了第 ' + (Number(now[now.length - 1]) + 1) + ' 列';
    }
  }
  m3 = now;
}
chk(rounds >= 5 && !aiBad, '人机连续 ' + rounds + ' 轮有来有回（棋谱 ' + m3.length + ' 手）', aiBad || '只走了 ' + rounds + ' 轮');
chk(replay(m3).bad === '', '这盘棋双方每一手都合法', String(replay(m3).bad));
chk(!missWin, 'AI 不漏现成赢棋', missWin);

// C4 悔棋：人机模式一次退掉双方各一手，退到空盘时不留脏存档
const gu = bootSave({ m: 'mid', mv: [2], t: 2 });
gu.pump(2.6);
const mvU = mvOf(gu) || [];
chk(mvU.length === 2 && Number(mvU[0]) === 2, '续玩局面里 AI 应了一手', JSON.stringify(mvU));
gu.byId('btnUndo').dispatch('click');
gu.pump(0.4);
chk(plies(gu) === 0 && snap(gu) === null && chip(gu) === '该你落子',
  '悔棋一次退掉双方各一手，回到空盘且不残留存档', plies(gu) + '/' + JSON.stringify(snap(gu)) + '/' + chip(gu));

// C5 提示
const gp = bootSave({ m: 'mid', mv: [2, 4], t: 1 });
gp.pump(0.6);
gp.byId('btnHint').dispatch('click');
gp.pump(2.4);
const hs = snap(gp);
chk(!!hs && hs.h >= 0 && hs.h < COLS, '提示给出一个列建议', JSON.stringify(hs && hs.h));
chk(!!hs && legalOf(replay(hs.mv)).indexOf(hs.h) >= 0, '提示那一列确实还能下', String(hs && hs.h));

// C6 认输必须两次确认
const gr = bootSave({ m: 'mid', mv: [2, 4], t: 1 });
gr.pump(0.6);
gr.byId('btnResign').dispatch('click');
gr.pump(0.3);
chk(gr.byId('btnResign')._cls.includes('armed') && chip(gr) === '该你落子', '认输先请求确认', chip(gr));
chk(/确认认输/.test(gr.byId('btnResign').textContent), '按钮文案变成「确认认输」', gr.byId('btnResign').textContent);
gr.pump(4.4);
chk(!gr.byId('btnResign')._cls.includes('armed') && chip(gr) === '该你落子', '4 秒后自动取消确认', chip(gr));
gr.byId('btnResign').dispatch('click');
gr.pump(0.3);
gr.byId('btnResign').dispatch('click');
gr.pump(1.2);
chk(chip(gr) === '黄方胜' && gr.storage.getItem('siziqi.losses') === '1', '第二次点认输才判负', chip(gr) + '/' + gr.storage.getItem('siziqi.losses'));
chk(snap(gr) === null, '认输后不留续玩存档', JSON.stringify(snap(gr)));

// C7 换档即重开，新手档也应一手
const g4 = boot('easy');
tap(g4, 3, 1.8);
const mv4 = mvOf(g4) || [];
chk(mv4.length === 2 && replay(mv4).bad === '', '新手档 AI 应一手且合法', JSON.stringify(mv4));
chk(/胜.*负/.test(g4.byId('score').textContent), '人机战绩片格式可用', g4.byId('score').textContent);
g4.byId('diff').dispatch('click', { target: { closest: () => ({ dataset: { m: 'mid' } }) } });
g4.pump(1.0);
chk(g4.storage.getItem('siziqi.mode') === 'mid' && plies(g4) === 0, '换难度立刻重开并记住选择', g4.storage.getItem('siziqi.mode') + '/' + plies(g4));

/* ==================== D. 满列 / 键盘 / 续玩 ==================== */
const g5 = boot('pvp');
for (let k = 0; k < 6; k++) tap(g5, 0, 0.2);            // 第 1 列下满 6 子（红黄交替，不成四连）
chk(plies(g5) === 6 && chip(g5) === '红方', '同一列能连下 6 子（红黄交替不判胜）', plies(g5) + '/' + chip(g5));
tap(g5, 0, 0.2);
chk(plies(g5) === 6, '满列点不动：不吃手数', String(plies(g5)));
key(g5, '4');
chk(plies(g5) === 7 && Number(mvOf(g5)[6]) === 3, '数字键 4 直接落第 4 列', JSON.stringify(mvOf(g5)));
key(g5, 'ArrowLeft'); key(g5, 'ArrowLeft'); key(g5, ' ');
chk(plies(g5) === 8 && Number(mvOf(g5)[7]) === 1, '← → 移动 + 空格落下', JSON.stringify(mvOf(g5)));
const data5 = {};
for (const k of Object.keys(g5.storage._data)) data5[k] = g5.storage._data[k];
const g6 = loadGame('siziqi', { storage: data5 });
g6.pump(0.6);
chk(/继续上一局/.test(g6.byId('overlayContent').innerHTML), '刷新后给出「继续上一局」', '');
chk(plies(g6) === 8 && chip(g6) === chip(g5), '续玩恢复同样的手数与行棋方', plies(g6) + '/' + chip(g6));
g6.byId('overlay').dispatch('click', { target: { closest: () => ({ dataset: { act: 'resume' } }) } });
g6.pump(0.4);
chk(!g6.byId('overlay')._cls.includes('show'), '点继续后遮罩收起', '');
tap(g6, 5, 0.3);
chk(plies(g6) === 9, '续玩后能接着下', String(plies(g6)));
key(g6, 'u');
chk(plies(g6) === 8, '双人档键盘 U 只退一手', String(plies(g6)));
const c6 = cells(replay(mvOf(g6)));
chk(c6.r === 4 && c6.y === 4, '退棋后盘面子数正确（红 4 / 黄 4）', JSON.stringify(c6));

report('四子棋');
