(() => {
'use strict';

/* 中国象棋 —— 正规规则完整实现：
   马有蹩腿、相塞田眼、炮隔子打、兵过河能横走、士将不出宫、将帅不许照面；
   走完不能让自己被将（应将），无子可走即负（将死 / 困毙）。
   AI：子力 + 位置评估，negamax + alpha-beta + 吃子静态搜索，迭代加深，三档对应不同搜索预算。 */

const COLS = 9, ROWS = 10, TOTAL = COLS * ROWS;
const CELL = 64, PAD = 44;
const W = PAD * 2 + CELL * (COLS - 1);            // 600
const H = PAD * 2 + CELL * (ROWS - 1);            // 664
const RED = 1, BLACK = -1;
const MATE = 100000, INF = 1e9;
const QUIET_DRAW = 120;                           // 连续 120 半着无吃子判和

const START = [
  'rnbakabnr',
  '.........',
  '.c.....c.',
  'p.p.p.p.p',
  '.........',
  '.........',
  'P.P.P.P.P',
  '.C.....C.',
  '.........',
  'RNBAKABNR',
];
const CH = {
  K: '帥', A: '仕', B: '相', N: '馬', R: '車', C: '炮', P: '兵',
  k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒',
};
const VAL = { K: 10000, A: 120, B: 120, N: 435, R: 960, C: 485, P: 100 };
const MODES = {
  pvp: { ai: false, name: '双人对战', depth: 0, ms: 0, noise: 0, pick: 1 },
  easy: { ai: true, lv: 'easy', name: '人机 · 新手', depth: 1, ms: 30, noise: 90, pick: 3, blunder: 0.22 },
  mid: { ai: true, lv: 'mid', name: '人机 · 棋友', depth: 3, ms: 200, noise: 24, pick: 2, blunder: 0.06 },
  hard: { ai: true, lv: 'hard', name: '人机 · 高手', depth: 4, ms: 520, noise: 0, pick: 1, blunder: 0 },
};
const SIDE_NAME = { 1: '红方', '-1': '黑方' };

/* ==================== 元素 ==================== */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const turnEl = document.getElementById('turn');
const movesEl = document.getElementById('moves');
const scoreEl = document.getElementById('score');
const notatEl = document.getElementById('notat');
const diffEl = document.getElementById('diff');
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');
const btnUndo = document.getElementById('btnUndo');
const btnHint = document.getElementById('btnHint');
const btnSide = document.getElementById('btnSide');
const btnResign = document.getElementById('btnResign');

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
};
const sfx = window.Sfx.create({ storageKey: 'xiangqi.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

/* ==================== 状态 ==================== */
let bd = new Array(TOTAL).fill('');
let plies = [];                                    // {f, t, cap, note, quiet}
let turn = RED;
let phase = 'intro';                               // intro | play | over
let winner = 0, why = '';
let sel = -1;                                      // 选中的子
let targets = [];                                  // 选中子的合法落点
let thinking = false;
let aiTimer = null;
let anim = null;                                   // {m, t0} 落子动画
let hintMove = null;
let checkSq = -1;                                  // 被将的帅/将
let resignArm = -99;                           // 认输 / 换边都要连点两次，避免误触
let sideArm = -99;
let tNow = 0;
let quiet = 0;
let mode = store.get('xiangqi.mode') || 'mid';
if (!MODES[mode]) mode = 'mid';
let humanSide = Number(store.get('xiangqi.side')) === BLACK ? BLACK : RED;
let sess = { b: 0, w: 0, d: 0 };
let wins = Number(store.get('xiangqi.wins')) || 0;
let losses = Number(store.get('xiangqi.losses')) || 0;
let draws = Number(store.get('xiangqi.draws')) || 0;
let bestStreak = Number(store.get('xiangqi.streak')) || 0;
let streak = Number(store.get('xiangqi.cur')) || 0;
try {
  const p = (store.get('xiangqi.pvp') || '').split(':');
  if (p.length === 3) sess = { b: Number(p[0]) || 0, w: Number(p[1]) || 0, d: Number(p[2]) || 0 };
} catch (e) { /* 忽略 */ }

const aiSide = () => (MODES[mode].ai ? -humanSide : 0);
const canMove = (side) => phase === 'play' && !thinking && !(MODES[mode].ai && side === aiSide());

/* ==================== 棋盘小工具 ==================== */
const idx = (c, r) => r * COLS + c;
const colOf = (i) => i % COLS;
const rowOf = (i) => (i / COLS) | 0;
const inB = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
const sideOf = (p) => (p ? (p === p.toUpperCase() ? RED : BLACK) : 0);
const ownSide = (side, r) => (side === RED ? r >= 5 : r <= 4);          // 还在本方半场
const inPalace = (side, c, r) => c >= 3 && c <= 5 && (side === RED ? r >= 7 : r <= 2);
const other = (s) => -s;
const clone = () => bd.slice();
const ser = (b) => b.map((p) => p || '.').join('');
function loadBd(str) {
  const b = new Array(TOTAL).fill('');
  for (let i = 0; i < TOTAL; i++) {
    const ch = str && str[i];
    b[i] = ch && ch !== '.' ? ch : '';
  }
  return b;
}

const O_OFF = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const D_OFF = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const N_OFF = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

/* ==================== 走法生成 ==================== */
function pushMove(b, side, f, t, out) {
  const q = b[t];
  if (q && sideOf(q) === side) return;
  out.push({ f, t, cap: q || '', p: b[f] });
}

function slide(b, side, c, r, f, u, out) {
  for (const [dc, dr] of O_OFF) {
    let cc = c + dc, rr = r + dr, screens = 0;
    while (inB(cc, rr)) {
      const t = idx(cc, rr), q = b[t];
      if (q) {
        if (screens === 0) {
          if (u === 'R' && sideOf(q) !== side) out.push({ f, t, cap: q, p: b[f] });
          if (u === 'C') screens = 1;
          else break;
        } else {
          if (u === 'C' && sideOf(q) !== side) out.push({ f, t, cap: q, p: b[f] });
          break;
        }
      } else if (u === 'R' || (u === 'C' && screens === 0)) {
        out.push({ f, t, cap: '', p: b[f] });
      }
      cc += dc; rr += dr;
    }
  }
}

function pseudoMoves(b, side, out) {
  if (!out) out = [];
  out.length = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const f = idx(c, r), p = b[f];
      if (!p || sideOf(p) !== side) continue;
      const u = p.toUpperCase();
      if (u === 'R' || u === 'C') { slide(b, side, c, r, f, u, out); continue; }
      if (u === 'N') {
        for (const [dc, dr] of N_OFF) {
          const cc = c + dc, rr = r + dr;
          if (!inB(cc, rr)) continue;
          const leg = Math.abs(dc) === 2 ? idx(c + (dc > 0 ? 1 : -1), r) : idx(c, r + (dr > 0 ? 1 : -1));
          if (b[leg]) continue;                              // 蹩马腿
          pushMove(b, side, f, idx(cc, rr), out);
        }
        continue;
      }
      if (u === 'B') {
        for (const [dc, dr] of D_OFF) {
          const cc = c + dc * 2, rr = r + dr * 2;
          if (!inB(cc, rr) || !ownSide(side, rr)) continue;   // 相不能过河
          if (b[idx(c + dc, r + dr)]) continue;               // 塞象眼
          pushMove(b, side, f, idx(cc, rr), out);
        }
        continue;
      }
      if (u === 'A') {
        for (const [dc, dr] of D_OFF) {
          const cc = c + dc, rr = r + dr;
          if (!inB(cc, rr) || !inPalace(side, cc, rr)) continue;
          pushMove(b, side, f, idx(cc, rr), out);
        }
        continue;
      }
      if (u === 'K') {
        for (const [dc, dr] of O_OFF) {
          const cc = c + dc, rr = r + dr;
          if (!inB(cc, rr) || !inPalace(side, cc, rr)) continue;
          pushMove(b, side, f, idx(cc, rr), out);
        }
        // 白脸将：同列无遮挡时可直接吃掉对方将帅
        for (const dr of [-1, 1]) {
          let rr = r + dr;
          while (rr >= 0 && rr < ROWS) {
            const q = b[idx(c, rr)];
            if (q) {
              if (sideOf(q) !== side && q.toUpperCase() === 'K') {
                out.push({ f, t: idx(c, rr), cap: q, p });
              }
              break;
            }
            rr += dr;
          }
        }
        continue;
      }
      // 兵 / 卒
      const fwd = side === RED ? -1 : 1;
      if (inB(c, r + fwd)) pushMove(b, side, f, idx(c, r + fwd), out);
      if (!ownSide(side, r)) {                                // 过河后可横走
        if (inB(c - 1, r)) pushMove(b, side, f, idx(c - 1, r), out);
        if (inB(c + 1, r)) pushMove(b, side, f, idx(c + 1, r), out);
      }
    }
  }
  return out;
}

function kingSq(b, side) {
  const k = side === RED ? 'K' : 'k';
  for (let i = 0; i < TOTAL; i++) if (b[i] === k) return i;
  return -1;
}

// (c,r) 是否被 by 方攻击
function attacked(b, target, by) {
  const c = colOf(target), r = rowOf(target);
  for (const [dc, dr] of O_OFF) {
    let cc = c + dc, rr = r + dr, screens = 0;
    while (inB(cc, rr)) {
      const q = b[idx(cc, rr)];
      if (q) {
        if (screens === 0) {
          if (sideOf(q) === by) {
            const u = q.toUpperCase();
            const far = Math.max(Math.abs(cc - c), Math.abs(rr - r));
            if (u === 'R' || u === 'K') return true;
            if (u === 'P' && far === 1) {
              if (dc !== 0 && (by === RED ? rr <= 4 : rr >= 5)) return true;   // 过河兵横吃
              if (dr !== 0 && (by === RED ? dr === 1 : dr === -1)) return true; // 正面兵
            }
          }
          screens = 1;
        } else {
          if (sideOf(q) === by && q.toUpperCase() === 'C') return true;      // 炮隔一子
          break;
        }
      }
      cc += dc; rr += dr;
    }
  }
  for (const [dc, dr] of N_OFF) {
    const cc = c + dc, rr = r + dr;
    if (!inB(cc, rr)) continue;
    const q = b[idx(cc, rr)];
    if (!q || sideOf(q) !== by || q.toUpperCase() !== 'N') continue;
    const leg = Math.abs(dc) === 2 ? idx(cc + (dc > 0 ? -1 : 1), rr) : idx(cc, rr + (dr > 0 ? -1 : 1));
    if (!b[leg]) return true;
  }
  return false;
}

function inCheck(b, side) {
  const s = kingSq(b, side);
  if (s < 0) return true;
  return attacked(b, s, other(side));
}

function legalMoves(b, side, out) {
  const ms = pseudoMoves(b, side, out || []);
  const legal = [];
  for (const m of ms) {
    b[m.t] = b[m.f]; b[m.f] = '';
    if (!inCheck(b, side)) legal.push(m);
    b[m.f] = b[m.t]; b[m.t] = m.cap;
  }
  return legal;
}

function make(b, m) { m.prev = b[m.t]; b[m.t] = b[m.f]; b[m.f] = ''; }
function unmake(b, m) { b[m.f] = b[m.t]; b[m.t] = m.prev || ''; m.cap = m.prev || ''; }

/* ==================== 评估与搜索 ==================== */
function posBonus(u, side, c, r) {
  const crossed = side === RED ? r <= 4 : r >= 5;
  const adv = side === RED ? Math.max(0, 4 - r) : Math.max(0, r - 5);
  const center = 4 - Math.abs(c - 4);
  if (u === 'P') return crossed ? 44 + adv * 16 + center * 9 : center * 3;
  if (u === 'N') return center * 9 + (crossed ? 26 : 0) + adv * 7;
  if (u === 'C') return center * 8 + (crossed ? 18 : 6);
  if (u === 'R') return center * 7 + 20 + adv * 9;
  return 0;
}

function evaluate(b, side) {
  let s = 0;
  for (let i = 0; i < TOTAL; i++) {
    const p = b[i];
    if (!p) continue;
    const u = p.toUpperCase();
    const own = sideOf(p);
    s += (VAL[u] + posBonus(u, own, colOf(i), rowOf(i))) * (own === RED ? 1 : -1);
  }
  return side === RED ? s : -s;
}

function orderMoves(ms) {
  for (const m of ms) {
    m.sc = m.cap ? 2000 + VAL[m.cap.toUpperCase()] * 8 - VAL[m.p.toUpperCase()] : 0;
  }
  ms.sort((a, b) => b.sc - a.sc);
  return ms;
}

let nodes = 0, deadline = 0, aborted = false;

function outOfTime() {
  if (aborted) return true;
  if ((++nodes & 511) === 0 && Date.now() > deadline) aborted = true;
  return aborted;
}

function quiesce(b, side, alpha, beta, depth, ply) {
  const stand = evaluate(b, side);
  if (stand >= beta) return stand;
  if (depth <= 0) return stand;
  if (stand > alpha) alpha = stand;
  if (outOfTime()) return alpha;
  const ms = pseudoMoves(b, side, []);
  const caps = [];
  for (const m of ms) if (m.cap) caps.push(m);
  orderMoves(caps);
  for (const m of caps) {
    make(b, m);
    const v = m.cap.toUpperCase() === 'K' ? MATE - ply * 2 : -quiesce(b, -side, -beta, -alpha, depth - 1, ply + 1);
    unmake(b, m);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
    if (aborted) break;
  }
  return alpha;
}

function negamax(b, side, depth, alpha, beta, ply) {
  if (depth <= 0) return quiesce(b, side, alpha, beta, 4, ply);
  if (outOfTime()) return alpha;
  const ms = orderMoves(pseudoMoves(b, side, []));
  if (!ms.length) return -MATE + ply * 2;
  let best = -INF;
  for (const m of ms) {
    make(b, m);
    const v = m.cap.toUpperCase() === 'K' ? MATE - ply * 2 : -negamax(b, -side, depth - 1, -beta, -alpha, ply + 1);
    unmake(b, m);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta || aborted) break;
  }
  return best;
}

// 返回 [{m, v}] 由强到弱
function rankMoves(b, side, cfg) {
  nodes = 0; aborted = false;
  deadline = Date.now() + cfg.ms;
  const legal = legalMoves(b, side);
  orderMoves(legal);
  if (legal.length === 1) return [{ m: legal[0], v: 0 }];
  let ranked = legal.map((m) => ({ m, v: 0 }));
  for (let d = 1; d <= cfg.depth; d++) {
    const round = [];
    let alpha = -INF;
    let broken = false;
    for (const m of legal) {
      make(b, m);
      const v = m.cap.toUpperCase() === 'K' ? MATE : -negamax(b, -side, d - 1, -INF, -alpha, 1);
      unmake(b, m);
      round.push({ m, v });
      if (v > alpha) alpha = v;
      if (aborted) { broken = true; break; }
    }
    if (broken || !round.length) break;
    round.sort((x, y) => y.v - x.v);
    ranked = round;
    for (let k = 0; k < legal.length && k < round.length; k++) legal[k] = round[k].m;
    if (round[0].v >= MATE - 20) break;                     // 已经算到杀棋
  }
  return ranked;
}

function think(b, side, cfg) {
  const ranked = rankMoves(b, side, cfg);
  if (!ranked.length) return null;
  let pool = ranked.slice(0, cfg.pick || 1);
  if (cfg.blunder && Math.random() < cfg.blunder) pool = ranked.slice(0, Math.min(6, ranked.length));
  if (cfg.noise) pool = pool.map((x) => ({ m: x.m, v: x.v + Math.random() * cfg.noise }));
  pool.sort((a, b2) => b2.v - a.v);
  return pool[0].m;
}

/* ==================== 棋谱记法（炮二平五 / 马8进7） ==================== */
const RED_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const lineName = (c, side) => (side === RED ? RED_NUM[COLS - 1 - c] : String(c + 1));

function notation(b, m) {
  const p = b[m.f];
  if (!p) return '?';
  const side = sideOf(p);
  const u = p.toUpperCase();
  const fc = colOf(m.f), fr = rowOf(m.f), tc = colOf(m.t), tr = rowOf(m.t);
  const name = CH[p];
  let head;
  const same = [];
  if (u !== 'A' && u !== 'B' && u !== 'K') {
    for (let r = 0; r < ROWS; r++) if (b[idx(fc, r)] === p) same.push(r);
  }
  if (same.length > 1) {
    same.sort((a, b2) => (side === RED ? a - b2 : b2 - a));         // 越靠近对方越“前”
    const pos = same.indexOf(fr);
    head = (same.length === 2 ? ['前', '后'][pos] : ['前', '中', '后'][pos]) + name;
  } else {
    head = name + lineName(fc, side);
  }
  if (fr === tr) return head + '平' + lineName(tc, side);
  const fwd = side === RED ? tr < fr : tr > fr;
  const verb = fwd ? '进' : '退';
  if (u === 'N' || u === 'B' || u === 'A') return head + verb + lineName(tc, side);
  const steps = Math.abs(tr - fr);
  return head + verb + (side === RED ? RED_NUM[steps - 1] : String(steps));
}

/* ==================== 行棋 ==================== */
function playMove(m) {
  const note = notation(bd, m);
  const cap = m.cap;
  make(bd, m);
  plies.push({ f: m.f, t: m.t, cap, note, side: sideOf(m.p), p: m.p });
  anim = { f: m.f, t: m.t, p: bd[m.t], t0: tNow };
  sel = -1;
  targets = [];
  hintMove = null;
  quiet = cap ? 0 : quiet + 1;
  turn = other(turn);
  checkSq = inCheck(bd, turn) ? kingSq(bd, turn) : -1;
  if (cap) { sfx.noise(0.09, 0.14); sfx.tone(180, 0.1, 'triangle', 0.16); }
  else { sfx.tone(sideOf(m.p) === RED ? 330 : 260, 0.06, 'triangle', 0.18); sfx.noise(0.04, 0.05, 0.01); }
  if (checkSq >= 0) sfx.tone(880, 0.12, 'square', 0.1, 0.08);

  if (!legalMoves(bd, turn).length) finish(other(turn), checkSq >= 0 ? '绝杀' : '困毙');
  else if (quiet >= QUIET_DRAW) finish(0, '和棋');
  else afterMove();
}

function afterMove() {
  hud();
  save();
  const s = aiSide();
  if (phase === 'play' && s === turn) scheduleAi();
}

function scheduleAi() {
  thinking = true;
  hud();
  if (aiTimer) clearTimeout(aiTimer);
  aiTimer = setTimeout(() => {
    aiTimer = null;
    thinking = false;
    if (phase !== 'play') return;
    const m = think(bd, turn, MODES[mode]);
    if (!m) { finish(other(turn), '无路'); return; }
    playMove(m);
  }, 200 + Math.random() * 220);
}

function finish(win, reason) {
  phase = 'over';
  thinking = false;
  winner = win;
  why = reason || '';
  const ai = MODES[mode].ai;
  if (ai) {
    if (win === humanSide) {
      wins++; streak++;
      if (streak > bestStreak) bestStreak = streak;
      store.set('xiangqi.wins', String(wins));
      store.set('xiangqi.streak', String(bestStreak));
      store.set('xiangqi.cur', String(streak));
      sfx.melody([[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.2]]);
    } else if (win) {
      losses++; streak = 0;
      store.set('xiangqi.losses', String(losses));
      store.set('xiangqi.cur', '0');
      sfx.melody([[392, 0.12], [311, 0.16], [233, 0.24]]);
    } else {
      draws++;
      store.set('xiangqi.draws', String(draws));
      sfx.melody([[440, 0.12], [440, 0.16]]);
    }
  } else {
    if (win === RED) sess.b++; else if (win === BLACK) sess.w++; else sess.d++;
    store.set('xiangqi.pvp', sess.b + ':' + sess.w + ':' + sess.d);
    if (win) sfx.melody([[587, 0.09], [784, 0.09], [988, 0.18]]);
  }
  store.del('xiangqi.save');
  hud();
  setTimeout(showResult, 700);
}

function resign() {
  if (phase !== 'play' || thinking) return;
  if (tNow - resignArm > 4) {
    resignArm = tNow;
    sfx.tone(660, 0.07, 'square', 0.12);
    hud();
    return;
  }
  resignArm = -99;
  finish(MODES[mode].ai ? other(humanSide) : other(turn), '认输');
}

function undo() {
  if (thinking || !plies.length) return;
  if (phase === 'over') { phase = 'play'; winner = 0; why = ''; overlay.classList.remove('show'); }
  const ai = MODES[mode].ai;
  let keep = plies.length - (ai ? 2 : 1);
  if (keep < 0) keep = 0;
  while (plies.length > keep) {
    const m = plies.pop();
    bd[m.f] = bd[m.t];
    bd[m.t] = m.cap;
    turn = m.side;
  }
  if (ai && turn === aiSide() && plies.length) {
    const m = plies.pop();
    bd[m.f] = bd[m.t];
    bd[m.t] = m.cap;
    turn = m.side;
  }
  quiet = 0;
  for (let k = plies.length - 1; k >= 0 && !plies[k].cap; k--) quiet++;
  sel = -1;
  targets = [];
  hintMove = null;
  anim = null;
  checkSq = inCheck(bd, turn) ? kingSq(bd, turn) : -1;
  sfx.tone(240, 0.09, 'sine', 0.14, 0, 170);
  hud();
  save();
}

function hint() {
  if (phase !== 'play' || thinking) return;
  const m = think(bd, turn, MODES.hard);
  if (!m) return;
  hintMove = { f: m.f, t: m.t, note: notation(bd, m) };
  sfx.tone(880, 0.08, 'square', 0.1);
  hud();
  save();
}

function newBoard() {
  bd = new Array(TOTAL).fill('');
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = START[r][c];
      bd[idx(c, r)] = ch === '.' ? '' : ch;
    }
  }
}

function newGame(keepPhase) {
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  newBoard();
  plies = [];
  turn = RED;
  winner = 0;
  why = '';
  sel = -1;
  targets = [];
  hintMove = null;
  anim = null;
  checkSq = -1;
  thinking = false;
  resignArm = -99;
  sideArm = -99;
  quiet = 0;
  phase = keepPhase || 'play';
  store.del('xiangqi.save');
  hud();
  const s = aiSide();
  if (phase === 'play' && s === turn) scheduleAi();
}

/* ==================== 断点续玩 ==================== */
function save() {
  if (phase !== 'play') return;
  if (!plies.length) { store.del('xiangqi.save'); return; }
  store.set('xiangqi.save', JSON.stringify({
    m: mode, s: humanSide, bd: ser(bd), q: quiet, t: turn,
    h: hintMove ? [hintMove.f, hintMove.t] : null,
    mv: plies.map((p) => [p.f, p.t]),
  }));
}

function restore(s) {
  if (!s || typeof s !== 'object' || typeof s.bd !== 'string' || s.bd.length !== TOTAL) return false;
  mode = MODES[s.m] ? s.m : mode;
  humanSide = Number(s.s) === BLACK ? BLACK : RED;
  phase = 'play';
  const list = Array.isArray(s.mv) ? s.mv : [];
  // 1) 正常存档：从初始局面重放棋谱，结果必须与存档棋盘完全一致
  newBoard();
  plies = [];
  turn = RED;
  quiet = 0;
  let bad = false;
  for (const pair of list) {
    const f = Number(pair[0]), t = Number(pair[1]);
    const m = legalMoves(bd, turn).find((x) => x.f === f && x.t === t);
    if (!m) { bad = true; break; }
    const note = notation(bd, m);
    const cap = m.cap;
    make(bd, m);
    plies.push({ f, t, cap, note, side: turn, p: m.p });
    quiet = cap ? 0 : quiet + 1;
    turn = other(turn);
  }
  let ok = !bad && ser(bd) === s.bd;
  // 2) 复盘/残局：棋谱对不上时直接采用存档局面，只放弃悔棋
  if (!ok) {
    bd = loadBd(s.bd);
    plies = [];
    turn = (s.t === RED || s.t === BLACK) ? s.t : (list.length % 2 ? BLACK : RED);
    quiet = Number(s.q) || 0;
  }
  if (kingSq(bd, RED) < 0 || kingSq(bd, BLACK) < 0) return false;
  if (inCheck(bd, other(turn))) return false;                 // 轮到谁走，对方就不该正被将
  if (Array.isArray(s.h)) {
    const f = s.h[0], t = s.h[1];
    const m = legalMoves(bd, turn).find((x) => x.f === f && x.t === t);
    if (m) hintMove = { f, t, note: notation(bd, m) };
  }
  sel = -1;
  targets = [];
  anim = null;
  winner = 0;
  why = '';
  thinking = false;
  checkSq = inCheck(bd, turn) ? kingSq(bd, turn) : -1;
  if (!legalMoves(bd, turn).length) { finish(other(turn), checkSq >= 0 ? '绝杀' : '困毙'); return true; }
  return true;
}

/* ==================== 界面 ==================== */
function materialDiff() {
  let s = 0;
  for (let i = 0; i < TOTAL; i++) {
    const p = bd[i];
    if (!p) continue;
    s += (p === p.toUpperCase() ? 1 : -1) * VAL[p.toUpperCase()];
  }
  return s;
}

function hud() {
  const ai = MODES[mode].ai;
  movesEl.textContent = String(plies.length);
  turnEl.classList.toggle('red', turn === RED);
  turnEl.classList.toggle('black', turn === BLACK);
  turnEl.classList.toggle('think', thinking);
  turnEl.classList.toggle('check', checkSq >= 0 && phase === 'play');
  if (phase === 'over') {
    turnEl.textContent = winner ? (SIDE_NAME[winner] + '胜') : '和棋';
  } else if (thinking) {
    turnEl.textContent = '电脑思考中';
  } else {
    const who = SIDE_NAME[turn];
    const tag = ai ? (turn === humanSide ? '(你)' : '(电脑)') : '';
    turnEl.textContent = who + tag + (checkSq >= 0 ? ' 应将' : '');
  }
  if (ai) {
    scoreEl.textContent = wins + ' 胜 ' + losses + ' 负' + (streak > 1 ? ' · ' + streak + ' 连胜' : '');
  } else {
    scoreEl.textContent = '红 ' + sess.b + ' : ' + sess.w + ' 黑';
  }
  if (hintMove) notatEl.textContent = '建议 ' + hintMove.note;
  else if (!plies.length) notatEl.textContent = '尚未开局';
  else notatEl.textContent = plies.slice(-5).map((p) => p.note).join(' · ');
  btnUndo.disabled = !plies.length || thinking;
  btnHint.disabled = phase !== 'play' || thinking;
  btnResign.disabled = phase !== 'play' || thinking;
  btnSide.disabled = !ai;
  const sideOn = ai && phase === 'play' && !thinking && tNow - sideArm <= 4;
  btnSide.lastChild.textContent = sideOn ? '确认换边' : (humanSide === BLACK ? '执黑' : '换边');
  btnSide.classList.toggle('armed', sideOn);
  const armed = tNow - resignArm <= 4;
  btnResign.lastChild.textContent = armed ? '确认认输' : '认输';
  btnResign.classList.toggle('armed', armed);
}

function showIntro(hasSave) {
  overlayContent.innerHTML = '<div class="ov-emoji">🐉</div><h2>中国象棋</h2>' +
    '<p class="hint">楚河汉界，将帅对垒。马踩别腿、相塞田眼、炮隔子打、<br>将帅不许照面，无子可走就算输。</p>' +
    '<div class="report"><div><b>👥</b><span>双人轮流走</span></div>' +
    '<div><b>🤖</b><span>三档 AI 对战</span></div>' +
    '<div><b>' + (MODES[mode].ai ? (humanSide === RED ? '执红' : '执黑') : '红先') + '</b><span>' + (MODES[mode].ai ? '当前选边' : '红方先行') + '</span></div></div>' +
    '<div class="ov-actions">' +
    (hasSave ? '<button class="primary" data-act="resume">继续上一局</button>' : '') +
    '<button class="' + (hasSave ? 'ghost' : 'primary') + '" data-act="start">开新局</button>' +
    '</div>';
  overlay.classList.add('show');
}

function showResult() {
  const ai = MODES[mode].ai;
  let emoji = '🤝', title = '和棋';
  if (winner) {
    const good = ai ? winner === humanSide : true;
    emoji = good ? '🏆' : '💀';
    title = SIDE_NAME[winner] + '胜 · ' + (why || '将死');
    if (ai) title = (winner === humanSide ? '你将帅赢了' : '电脑赢了') + ' · ' + (why || '将死');
  }
  const diff = materialDiff();
  overlayContent.innerHTML = '<div class="ov-emoji">' + emoji + '</div><h2>' + title + '</h2>' +
    '<div class="report"><div><b>' + plies.length + '</b><span>半着数</span></div>' +
    '<div><b>' + (diff === 0 ? '均势' : (diff > 0 ? '红 +' + Math.round(diff / 100) : '黑 +' + Math.round(-diff / 100))) + '</b><span>终局子力</span></div>' +
    '<div><b>' + (ai ? wins + '-' + losses : sess.b + ':' + sess.w) + '</b><span>' + (ai ? '胜-负 · 最长连胜 ' + bestStreak : '红-黑') + '</span></div></div>' +
    '<p class="hint">' + (ai ? '点两下「认输」可以中途认负，悔棋一次退两步' : '换边按钮可以把红黑方对调') + '</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="undo">悔棋复盘</button>' +
    '<button class="ghost" data-act="home">回主页</button></div>';
  overlay.classList.add('show');
}

function markMode() {
  for (const btn of diffEl.querySelectorAll('[data-m]')) {
    btn.classList.toggle('active', btn.dataset.m === mode);
  }
}

/* ==================== 画面 ==================== */
function resize() {
  const rect = cv.getBoundingClientRect();
  const cssW = rect.width || W;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(cssW * dpr));
  cv.height = Math.max(1, Math.round(cssW * (H / W) * dpr));
  const k = cv.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}

const X = (c) => PAD + c * CELL;
const Y = (r) => PAD + r * CELL;

function drawBoard() {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#f6e3bf');
  g.addColorStop(0.55, '#eed4a6');
  g.addColorStop(1, '#e0bd83');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(140, 92, 34, 0.06)';
  for (let i = 0; i < 26; i++) ctx.fillRect(0, (i * 27 + Math.sin(i * 2.1) * 8) % H, W, 1.6);

  ctx.strokeStyle = 'rgba(72, 42, 12, 0.8)';
  ctx.lineCap = 'square';
  ctx.lineWidth = 1.2;
  for (let r = 0; r < ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(X(0), Y(r)); ctx.lineTo(X(COLS - 1), Y(r)); ctx.stroke();
  }
  for (let c = 0; c < COLS; c++) {
    if (c === 0 || c === COLS - 1) {
      ctx.beginPath(); ctx.moveTo(X(c), Y(0)); ctx.lineTo(X(c), Y(ROWS - 1)); ctx.stroke();
      continue;
    }
    ctx.beginPath(); ctx.moveTo(X(c), Y(0)); ctx.lineTo(X(c), Y(4)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(c), Y(5)); ctx.lineTo(X(c), Y(9)); ctx.stroke();
  }
  ctx.lineWidth = 2.6;
  ctx.strokeRect(X(0) - 6, Y(0) - 6, (COLS - 1) * CELL + 12, (ROWS - 1) * CELL + 12);
  ctx.lineWidth = 1.2;
  for (const r0 of [0, 7]) {
    ctx.beginPath(); ctx.moveTo(X(3), Y(r0)); ctx.lineTo(X(5), Y(r0 + 2)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(5), Y(r0)); ctx.lineTo(X(3), Y(r0 + 2)); ctx.stroke();
  }
  // 炮位与兵位的标记
  ctx.lineWidth = 1.6;
  const mark = (c, r) => {
    const x = X(c), y = Y(r), d = 5, l = 8;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if (c === 0 && sx < 0) continue;
      if (c === COLS - 1 && sx > 0) continue;
      ctx.beginPath();
      ctx.moveTo(x + sx * d, y + sy * d + sy * l);
      ctx.lineTo(x + sx * d, y + sy * d);
      ctx.lineTo(x + sx * d + sx * l, y + sy * d);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + sx * d + sx * l, y + sy * d + sy * l);
      ctx.lineTo(x + sx * d, y + sy * d + sy * l);
      ctx.lineTo(x + sx * d, y + sy * d + sy * l - l);
      ctx.stroke();
    }
  };
  for (const c of [1, 7]) { mark(c, 2); mark(c, 7); }
  for (const c of [0, 2, 4, 6, 8]) { mark(c, 3); mark(c, 6); }

  ctx.fillStyle = 'rgba(72, 42, 12, 0.34)';
  ctx.font = 'italic 30px "Songti SC", "STSong", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('楚  河', X(2) - 4, Y(4) + CELL / 2);
  ctx.fillText('漢  界', X(6) + 4, Y(4) + CELL / 2);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = 'rgba(72, 42, 12, 0.5)';
  for (let c = 0; c < COLS; c++) {
    ctx.fillText(RED_NUM[COLS - 1 - c], X(c), H - 14);
    ctx.fillText(String(c + 1), X(c), 14);
  }
}

function drawDisc(x, y, p, scale, alpha, ring) {
  const red = sideOf(p) === RED;
  const r = (CELL * 0.46) * scale;
  if (r <= 0.5) return;
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.2, x, y, r);
  g.addColorStop(0, '#fffaf0');
  g.addColorStop(0.7, '#f3e2bd');
  g.addColorStop(1, '#cdae78');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = red ? '#b3261e' : '#26303f';
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(x, y, r - 1.6, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = red ? 'rgba(179,38,30,.45)' : 'rgba(38,48,63,.45)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, r - 5.5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = red ? '#a51c14' : '#1b2430';
  ctx.font = 'bold ' + Math.round(r * 1.12) + 'px "Songti SC", "STSong", "PingFang SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(CH[p], x, y + r * 0.05);
  if (ring) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function cornerMark(i, color) {
  const x = X(colOf(i)), y = Y(rowOf(i)), d = CELL * 0.42, l = 10;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * d, y + sy * d - sy * l);
    ctx.lineTo(x + sx * d, y + sy * d);
    ctx.lineTo(x + sx * d - sx * l, y + sy * d);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBoard();

  const last = plies[plies.length - 1];
  const pulse = 0.45 + 0.55 * Math.abs(Math.sin(tNow * 2.4));
  if (last && phase !== 'over') {
    cornerMark(last.f, 'rgba(52, 211, 153, 0.55)');
    if (!(anim && tNow - anim.t0 < 0.24)) cornerMark(last.t, 'rgba(52, 211, 153, 0.9)');
  }

  if (sel >= 0 && bd[sel]) {
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 204, 21, ' + pulse.toFixed(3) + ')';
    ctx.lineWidth = 3.4;
    ctx.shadowColor = 'rgba(250, 204, 21, 0.7)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(X(colOf(sel)), Y(rowOf(sel)), CELL * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    for (const m of targets) {
      const x = X(colOf(m.t)), y = Y(rowOf(m.t));
      if (m.cap) {
        ctx.strokeStyle = 'rgba(248, 113, 113, 0.92)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, CELL * 0.5, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(34, 211, 238, 0.75)';
        ctx.beginPath(); ctx.arc(x, y, 7 + 1.6 * Math.sin(tNow * 5), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(34, 211, 238, 0.22)';
        ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  if (hintMove && phase === 'play') {
    const a = 0.5 + 0.5 * Math.sin(tNow * 5);
    ctx.save();
    ctx.strokeStyle = 'rgba(34, 211, 238, ' + a.toFixed(3) + ')';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(X(colOf(hintMove.f)), Y(rowOf(hintMove.f)));
    ctx.lineTo(X(colOf(hintMove.t)), Y(rowOf(hintMove.t)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(X(colOf(hintMove.t)), Y(rowOf(hintMove.t)), CELL * 0.52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const animating = anim && tNow - anim.t0 < 0.24;
  for (let i = 0; i < TOTAL; i++) {
    const p = bd[i];
    if (!p) continue;
    if (animating && i === anim.t) continue;
    drawDisc(X(colOf(i)), Y(rowOf(i)), p, 1, 1, i === checkSq && phase === 'play' ? 'rgba(248, 113, 113, ' + pulse.toFixed(3) + ')' : null);
  }
  if (animating) {
    const k = (tNow - anim.t0) / 0.24;
    const e = 1 - Math.pow(1 - k, 3);
    const x = X(colOf(anim.f)) + (X(colOf(anim.t)) - X(colOf(anim.f))) * e;
    const y = Y(rowOf(anim.f)) + (Y(rowOf(anim.t)) - Y(rowOf(anim.f))) * e;
    drawDisc(x, y, anim.p, 1);
  }

  if (phase === 'over' && winner) {
    const k1 = kingSq(bd, winner), k2 = kingSq(bd, other(winner));
    if (k2 >= 0) {
      ctx.strokeStyle = 'rgba(250, 204, 21, ' + pulse.toFixed(3) + ')';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(X(colOf(k2)), Y(rowOf(k2)), CELL * 0.55, 0, Math.PI * 2); ctx.stroke();
    }
  }
}

function frame(t) {
  const now = t || 0;
  const dt = Math.min(0.05, Math.max(0, (now - (frame.last || now)) / 1000));
  frame.last = now;
  tNow += dt;
  if (resignArm > -90 && tNow - resignArm > 4) { resignArm = -99; hud(); }
  if (sideArm > -90 && tNow - sideArm > 4) { sideArm = -99; hud(); }
  draw();
  requestAnimationFrame(frame);
}

/* ==================== 输入 ==================== */
function sqFrom(ev) {
  const rect = cv.getBoundingClientRect();
  const s = (rect.width || W) / W;
  const x = ((ev.clientX || 0) - rect.left) / s;
  const y = ((ev.clientY || 0) - rect.top) / s;
  const c = Math.round((x - PAD) / CELL), r = Math.round((y - PAD) / CELL);
  if (!inB(c, r)) return -1;
  if (Math.abs(x - X(c)) > CELL * 0.52 || Math.abs(y - Y(r)) > CELL * 0.52) return -1;
  return idx(c, r);
}

function tap(i) {
  if (phase !== 'play' || thinking || i < 0) return;
  if (sel >= 0) {
    for (const x of targets) if (x.t === i) { playMove(x); return; }
    if (i === sel) { sel = -1; targets = []; hud(); return; }
  }
  const p = bd[i];
  if (p && sideOf(p) === turn && canMove(turn)) {
    sel = i;
    const all = legalMoves(bd, turn);
    targets = [];
    for (const m of all) if (m.f === i) targets.push(m);
    hintMove = null;
    sfx.tone(targets.length ? 720 : 200, 0.05, 'square', targets.length ? 0.1 : 0.14);
  } else {
    sel = -1;
    targets = [];
  }
  hud();
}

cv.addEventListener('pointerdown', (e) => { sfx.resume(); tap(sqFrom(e)); });
btnSound.addEventListener('click', () => { btnSound.textContent = sfx.toggle() ? '🔇' : '🔊'; });
btnNew.addEventListener('click', () => { sfx.resume(); newGame('play'); });
btnUndo.addEventListener('click', () => { sfx.resume(); undo(); });
btnHint.addEventListener('click', () => { sfx.resume(); hint(); });
btnResign.addEventListener('click', () => { sfx.resume(); resign(); });
btnSide.addEventListener('click', () => {
  sfx.resume();
  if (!MODES[mode].ai || phase !== 'play' || thinking) return;
  if (plies.length && tNow - sideArm > 4) {
    sideArm = tNow;
    sfx.tone(600, 0.07, 'square', 0.1);
    hud();
    return;
  }
  sideArm = -99;
  humanSide = other(humanSide);
  store.set('xiangqi.side', String(humanSide));
  sfx.tone(600, 0.07, 'square', 0.1);
  newGame('play');
});

diffEl.addEventListener('click', (e) => {
  const btn = e.target.closest ? e.target.closest('[data-m]') : null;
  if (!btn || !MODES[btn.dataset.m]) return;
  sfx.resume();
  mode = btn.dataset.m;
  store.set('xiangqi.mode', mode);
  markMode();
  sfx.tone(660, 0.06, 'square', 0.1);
  newGame('play');
});

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!btn) return;
  sfx.resume();
  const a = btn.dataset.act;
  if (a === 'start' || a === 'again') newGame('play');
  else if (a === 'resume') { overlay.classList.remove('show'); hud(); }
  else if (a === 'undo') undo();
  else if (a === 'home') location.href = '../index.html';
});

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'u' || k === 'U') { sfx.resume(); undo(); e.preventDefault(); }
  else if (k === 'h' || k === 'H') { sfx.resume(); hint(); e.preventDefault(); }
  else if (k === 'r' || k === 'R') { resign(); e.preventDefault(); }
  else if (k === 'n' || k === 'N') { newGame('play'); e.preventDefault(); }
  else if (k === 'Escape') { sel = -1; targets = []; hud(); }
});

window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

/* ==================== 启动 ==================== */
markMode();
resize();
let saved = null;
try { saved = JSON.parse(store.get('xiangqi.save') || 'null'); } catch (e) { saved = null; }
const ok0 = !!(saved && typeof saved === 'object' && typeof saved.bd === 'string' &&
  saved.bd.length === TOTAL && Array.isArray(saved.mv) &&
  (saved.mv.length > 0 || saved.t === RED || saved.t === BLACK));
const keep = ok0 && restore(saved);
if (!keep) newGame('play');
hud();
showIntro(keep);
if (keep && phase === 'play') {
  const s = aiSide();
  if (s === turn) scheduleAi();
}
requestAnimationFrame((t) => { frame.last = t; frame(t); });

})();
