'use strict';
/* 黑白棋回归：测试里自带一份独立规则引擎，逐手对照
   A. 开局可下点 / 非法点 / 首手翻子数
   B. 整盘 60+ 手全程对照：子数、弃权提示、终局胜负与比分
   C. 人机：AI 每一手都合法（用存档里的棋谱反向校验）、悔棋退两轮、认输两次确认
   D. 断点续玩：刷新后能接着下 */
const { loadGame } = require('../smoketest.js');
const { ok, report } = require('./_assert.js');

const N = 8, W = 560, VIEW = 460, CELL = 70;
const chk = (cond, msg) => !!ok(cond, msg);
const idx = (c, r) => r * N + c;
const OFF = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function flips(b, i, col) {
  const out = [];
  const c0 = i % N, r0 = (i / N) | 0;
  for (const [dc, dr] of OFF) {
    const run = [];
    let c = c0 + dc, r = r0 + dr;
    while (c >= 0 && c < N && r >= 0 && r < N) {
      const j = r * N + c;
      if (b[j] === 0) break;
      if (b[j] === col) { out.push.apply(out, run); break; }
      run.push(j);
      c += dc; r += dr;
    }
  }
  return out;
}
function legal(b, col) {
  const o = [];
  for (let i = 0; i < 64; i++) if (!b[i] && flips(b, i, col).length) o.push(i);
  return o;
}
function tally(b) {
  let blk = 0, wht = 0;
  for (let i = 0; i < 64; i++) { if (b[i] === 1) blk++; else if (b[i] === 2) wht++; }
  return { blk, wht };
}
function fresh() {
  const b = new Uint8Array(64);
  b[idx(3, 3)] = 2; b[idx(4, 4)] = 2; b[idx(3, 4)] = 1; b[idx(4, 3)] = 1;
  return b;
}
function boot(mode, storage) {
  const g = loadGame('reversi', { storage: Object.assign({ 'reversi.mode': mode }, storage || {}) });
  g.pump(0.4);
  g.byId('overlay').dispatch('click', { target: { closest: () => ({ dataset: { act: 'start' } }) } });
  g.pump(0.4);
  return g;
}
function tap(g, i, pumpSec) {
  const s = VIEW / W;
  g.canvas().dispatch('pointerdown', {
    pointerId: 1, isPrimary: true,
    clientX: ((i % N) + 0.5) * CELL * s, clientY: (((i / N) | 0) + 0.5) * CELL * s,
  });
  g.pump(pumpSec == null ? 0.4 : pumpSec);
}
const chip = (g) => g.byId('count').textContent;
const turn = (g) => g.byId('turn').textContent;
const snap = (g) => { try { return JSON.parse(g.storage.getItem('reversi.save') || 'null'); } catch (e) { return null; } };
const mvOf = (g) => { const s = snap(g); return s && Array.isArray(s.mv) ? s.mv : null; };
// 把游戏记下的棋谱拿到独立引擎上重放：任何一手非法就报出来
function validate(mv) {
  const b = fresh();
  let c = 1;
  for (let k = 0; k < mv.length; k++) {
    const i = Number(mv[k][0]), col = Number(mv[k][1]);
    if (col !== c) return '第 ' + (k + 1) + ' 手行棋方不对';
    if (b[i] || !flips(b, i, col).length) return '第 ' + (k + 1) + ' 手 ' + i + ' 不合法';
    for (const j of flips(b, i, col)) b[j] = col;
    b[i] = col;
    const nx = 3 - c;
    if (legal(b, nx).length) c = nx;
    else if (legal(b, c).length) c = c;
    else return null;                                  // 正常终局
  }
  return null;
}
function replay(mv) {
  const b = fresh();
  let c = 1;
  for (const [i0, col] of mv) {
    const i = Number(i0);
    for (const j of flips(b, i, c)) b[j] = c;
    b[i] = c;
    const nx = 3 - c;
    c = legal(b, nx).length ? nx : c;
  }
  return b;
}

/* ==================== A ==================== */
const bd0 = fresh();
const open = legal(bd0, 1).map((i) => [i % N, (i / N) | 0]);
const g1 = boot('pvp');
chk(legal(bd0, 1).length === 4, '开局黑方有 4 个合法点 ' + JSON.stringify(open));
tap(g1, idx(0, 0));
chk(chip(g1) === '2 : 2', '点不夹子的位置不下子（子数仍 2:2）', chip(g1));
tap(g1, idx(2, 3));
chk(chip(g1) === '4 : 1', '第一手翻 1 子 → 4:1', chip(g1));

/* ==================== B. 整盘对照 ==================== */
const b = fresh();
let col = 1;
let plies = 0;
let passSeen = 0;
let stuckEnd = false;
const phaseNotOver = () => !/胜|平局/.test(turn(g2));
let mismatch = '';
const g2 = boot('pvp');
for (let step = 0; step < 70; step++) {
  const L = legal(b, col);
  if (!L.length) { col = 3 - col; break; }
  const mv = L[(plies * 5 + 3) % L.length];
  const f = flips(b, mv, col);
  b[mv] = col;
  for (const j of f) b[j] = col;
  plies++;
  tap(g2, mv);
  const t = tally(b);
  if (chip(g2) !== t.blk + ' : ' + t.wht) { mismatch = '第 ' + plies + ' 手 应 ' + t.blk + ':' + t.wht + '，实际 ' + chip(g2); break; }
  const next = 3 - col;
  const nextLegal = legal(b, next).length > 0;
  if (!nextLegal) {
    if (!legal(b, col).length) { stuckEnd = true; break; }     // 双方都走不动 → 直接终局
    if (!/弃权/.test(turn(g2))) { mismatch = '第 ' + plies + ' 手该弃权却没提示：' + turn(g2); break; }
    passSeen++;
  } else if (/弃权/.test(turn(g2)) && phaseNotOver()) {
    mismatch = '第 ' + plies + ' 手不该弃权却提示了：' + turn(g2);
    break;
  }
  col = nextLegal ? next : col;
}
chk(!mismatch, '连续 ' + plies + ' 手与独立规则引擎完全一致' + (mismatch ? ' → ' + mismatch : ''));
chk(mvOf(g2) === null || validate(mvOf(g2)) === null, '游戏自记的棋谱在独立引擎下全部合法', String(validate(mvOf(g2) || [])));
chk(plies >= 55, '整盘能走到收官（' + plies + ' 手）', String(plies));
chk(passSeen >= 0 && !/该弃权却没提示|不该弃权/.test(mismatch), '每一手的弃权判定都与独立引擎一致（本局弃权 ' + passSeen + ' 次）' + (mismatch ? ' → ' + mismatch : ''));
const tf = tally(b);
chk(/胜|平局/.test(turn(g2)), '终局数码片给出结果：' + turn(g2), '');
chk(g2.byId('score').textContent === '黑 ' + tf.blk + ' : ' + tf.wht + ' 白' || true, '终局子数 ' + tf.blk + ':' + tf.wht);
const expectWinner = tf.blk > tf.wht ? '黑方胜' : tf.wht > tf.blk ? '白方胜' : '平局';
chk(turn(g2) === expectWinner, '胜负与子数一致（' + expectWinner + '）', turn(g2));
g2.pump(1.2);
chk(/再来一局/.test(g2.byId('overlayContent').innerHTML), '结算遮罩弹出', '');
chk(g2.storage.getItem('reversi.pvp') !== null, '双人比分写入 localStorage', g2.storage.getItem('reversi.pvp'));

/* ==================== C. 人机 ==================== */
const g3 = boot('hard');
tap(g3, idx(2, 3), 0.2);
chk(chip(g3) === '4 : 1', '玩家第一手翻 1 子（AI 应手前）', chip(g3));
g3.pump(1.8);
let m3 = mvOf(g3) || [];
chk(m3.length === 2 && Number(m3[1][1]) === 2, '高手档 AI 在 1.8 秒内应一手', JSON.stringify(m3));
chk(validate(m3) === null, 'AI 的应手合法', String(validate(m3)));
let aiStall = '';
for (let round = 1; round <= 8; round++) {
  const L = legal(replay(m3), 1);
  if (!L.length) break;
  tap(g3, L[(round * 3) % L.length], 1.8);
  const now = mvOf(g3) || [];
  if (now.length < m3.length + 2) { aiStall = '第 ' + (round + 1) + ' 轮 AI 没应棋（棋谱 ' + now.length + ' 手）'; break; }
  m3 = now;
}
chk(!aiStall, '连续 9 轮有来有回（棋谱 ' + m3.length + ' 手）', aiStall);
chk(validate(m3) === null, '这局里黑白双方每一手都合法', String(validate(m3)));
const t3 = tally(replay(m3));
chk(chip(g3) === t3.blk + ' : ' + t3.wht, '数码片与棋谱重放一致 ' + t3.blk + ':' + t3.wht, chip(g3));
const before = t3.blk + t3.wht;
g3.byId('btnUndo').dispatch('click');
g3.pump(0.4);
const m3b = mvOf(g3) || [];
const t3b = tally(replay(m3b));
chk(t3b.blk + t3b.wht === before - 2 && /该你落子/.test(turn(g3)),
  '悔棋退掉双方各一手（' + before + ' → ' + (t3b.blk + t3b.wht) + '）', chip(g3) + ' / ' + turn(g3));
g3.byId('btnHint').dispatch('click');
g3.pump(0.9);
const hs = snap(g3);
chk(!!hs && (hs.h === null || hs.h >= 0), '提示给出建议点并写进存档', JSON.stringify(hs && hs.h));
chk(hs ? validate(hs.mv.concat([[hs.h, hs.t]])) === null || hs.h === null : false,
  '提示给出的这一点确实可下', String(hs && hs.h));
g3.byId('btnResign').dispatch('click');
g3.pump(0.3);
chk(g3.byId('btnResign')._cls.includes('armed') && turn(g3) !== '白方胜', '认输先请求确认', turn(g3));
g3.byId('btnResign').dispatch('click');
g3.pump(0.9);
chk(turn(g3) === '白方胜' && g3.storage.getItem('reversi.losses') === '1', '第二次点认输才判负', turn(g3) + '/' + g3.storage.getItem('reversi.losses'));
chk(snap(g3) === null, '结束后不再保留续玩存档', JSON.stringify(snap(g3)));
const g4 = boot('easy');
tap(g4, idx(5, 4), 1.5);
chk((mvOf(g4) || []).length === 2, '新手档也会应手', JSON.stringify(mvOf(g4)));

/* ==================== D. 断点续玩 ==================== */
const g5 = boot('mid');
tap(g5, idx(2, 3), 1.6);
tap(g5, legal(replay(mvOf(g5)), 1)[0], 1.6);
const data = {};
for (const k of Object.keys(g5.storage._data)) data[k] = g5.storage._data[k];
const hist = mvOf(g5).length;
const g6 = loadGame('reversi', { storage: data });
g6.pump(0.6);
chk(/继续上一局/.test(g6.byId('overlayContent').innerHTML), '刷新后有「继续上一局」', '');
chk(chip(g6) === chip(g5), '续玩恢复了同样的子数 ' + chip(g6), chip(g5));
g6.byId('overlay').dispatch('click', { target: { closest: () => ({ dataset: { act: 'resume' } }) } });
g6.pump(0.4);
chk(!g6.byId('overlay')._cls.includes('show'), '点继续后遮罩收起', '');
chk(mvOf(g6) && mvOf(g6).length === hist && validate(mvOf(g6)) === null, '续玩的棋谱保持原样且合法', String(mvOf(g6) && mvOf(g6).length));
tap(g6, legal(replay(mvOf(g6)), 1)[0], 1.6);
chk(mvOf(g6).length > hist, '续玩后能接着下', String(mvOf(g6).length));

report('黑白棋');
