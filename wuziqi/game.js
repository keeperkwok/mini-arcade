(() => {
'use strict';

/* 五子棋：黑白轮流在交叉点落子，横竖斜任意方向先连成五子者胜（无禁手）。
   人机走法来自「棋形打分 + 攻防合一 + 高手档两步预判」：
   把落点周围 4 个方向各取 9 格编成 0/1/2 字符串，查棋形表得到该方向的分值，四向求和即为这一手的价值。 */

const N = 15;
const CELL = 40, PAD = 40;
const W = PAD * 2 + CELL * (N - 1);            // 640 逻辑坐标
const BLACK = 1, WHITE = 2;
const FIVE = 10000000;
const AI_COLOR = WHITE;                        // 人机模式下电脑执白后手

const MODES = {
  pvp: { ai: false, name: '双人对战', w: 0.8 },
  easy: { ai: true, lv: 'easy', name: '人机 · 新手', w: 0.35 },
  mid: { ai: true, lv: 'mid', name: '人机 · 棋友', w: 0.8 },
  hard: { ai: true, lv: 'hard', name: '人机 · 高手', w: 0.95 },
};
const NAME = { 1: '黑方', 2: '白方' };

/* 棋形表：1=己方 0=空 2=对方或边墙，匹配时必须盖住中心落点 */
const PATS = [
  ['11111', FIVE],
  ['011110', 1000000],                        // 活四
  ['01111', 100000], ['11110', 100000], ['11011', 100000], ['10111', 100000], ['11101', 100000], // 冲四
  ['01110', 55000],                           // 活三
  ['01101', 42000], ['01011', 42000], ['11010', 42000], ['10110', 42000], ['011010', 42000], ['010110', 42000],
  ['11100', 9000], ['00111', 9000], ['11001', 9000], ['10011', 9000], ['10101', 9000],           // 眠三
  ['21110', 9000], ['01112', 9000], ['21101', 9000], ['10112', 9000],
  ['0110', 1600], ['1100', 1600], ['0011', 1600], ['0101', 1600], ['1010', 1600], ['1001', 1600], // 活二
  ['011', 420], ['110', 420], ['101', 420],
  ['01', 60], ['10', 60], ['1', 12],
];
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

/* ==================== 元素 ==================== */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const turnEl = document.getElementById('turn');
const movesEl = document.getElementById('moves');
const scoreEl = document.getElementById('score');
const diffEl = document.getElementById('diff');
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');
const btnUndo = document.getElementById('btnUndo');
const btnHint = document.getElementById('btnHint');
const btnResign = document.getElementById('btnResign');

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
};
const sfx = window.Sfx.create({ storageKey: 'wuziqi.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

/* ==================== 状态 ==================== */
const board = new Uint8Array(N * N);
let moves = [];                                // {i, c, t}
let turn = BLACK;
let phase = 'intro';                           // intro | play | over
let winner = 0;
let winLine = null;
let thinking = false;
let aiTimer = null;
let mode = store.get('wuziqi.mode') || 'mid';
if (!MODES[mode]) mode = 'mid';
let hoverIdx = -1;
let hintIdx = -1;
let tNow = 0;
let resignArm = -99;                           // 认输要连点两次，第一次只是「确认」
let sess = { b: 0, w: 0, d: 0 };               // 双人模式本局比分

// 人机战绩
let wins = Number(store.get('wuziqi.wins')) || 0;
let losses = Number(store.get('wuziqi.losses')) || 0;
let draws = Number(store.get('wuziqi.draws')) || 0;
let bestStreak = Number(store.get('wuziqi.streak')) || 0;
let streak = Number(store.get('wuziqi.cur')) || 0;
try {
  const p = (store.get('wuziqi.pvp') || '').split(':');
  if (p.length === 3) sess = { b: Number(p[0]) || 0, w: Number(p[1]) || 0, d: Number(p[2]) || 0 };
} catch (e) { /* 忽略 */ }

/* ==================== 小工具 ==================== */
const xy = (i) => [i % N, (i / N) | 0];
const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : y * N + x);
const other = (c) => (c === BLACK ? WHITE : BLACK);
const px = (i) => PAD + (i % N) * CELL;
const py = (i) => PAD + ((i / N) | 0) * CELL;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ==================== 棋形评估 ==================== */
function shapeScore(s) {
  let best = 0;
  for (const [pat, val] of PATS) {
    if (val <= best) break;
    let from = 0;
    for (;;) {
      const k = s.indexOf(pat, from);
      if (k < 0) break;
      if (k <= 4 && k + pat.length > 4) { best = val; break; }
      from = k + 1;
    }
  }
  return best;
}

// 假设在 i 落一枚 color，四个方向能凑出的棋形总分
function lineScore(bd, i, color) {
  const x0 = i % N, y0 = (i / N) | 0;
  let total = 0;
  for (let d = 0; d < 4; d++) {
    const dx = DIRS[d][0], dy = DIRS[d][1];
    let s = '';
    for (let k = -4; k <= 4; k++) {
      const j = at(x0 + dx * k, y0 + dy * k);
      if (j < 0) s += '2';
      else s += k === 0 ? '1' : bd[j] === color ? '1' : bd[j] === 0 ? '0' : '2';
    }
    total += shapeScore(s);
  }
  return total;
}

// 候选点：已有棋子周围 2 格内的空位
function candidates(bd) {
  const flag = new Uint8Array(N * N);
  let any = false;
  for (let i = 0; i < N * N; i++) {
    if (!bd[i]) continue;
    any = true;
    const x = i % N, y = (i / N) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const j = at(x + dx, y + dy);
        if (j >= 0 && !bd[j]) flag[j] = 1;
      }
    }
  }
  const out = [];
  if (!any) return [(N * N) >> 1];
  for (let i = 0; i < N * N; i++) if (flag[i]) out.push(i);
  return out;
}

// 连子数：在 i 落 color 后最长能连几颗
function runAt(bd, i, color) {
  const x0 = i % N, y0 = (i / N) | 0;
  let best = null;
  for (const [dx, dy] of DIRS) {
    const back = [], fwd = [];
    for (let k = 1; k <= N; k++) {
      const j = at(x0 - dx * k, y0 - dy * k);
      if (j < 0 || bd[j] !== color) break;
      back.push(j);
    }
    for (let k = 1; k <= N; k++) {
      const j = at(x0 + dx * k, y0 + dy * k);
      if (j < 0 || bd[j] !== color) break;
      fwd.push(j);
    }
    const line = back.reverse().concat([i], fwd);
    if (!best || line.length > best.length) best = line;
  }
  return best && best.length >= 5 ? best : null;
}

function findFive(cands, color) {
  for (const i of cands) if (runAt(board, i, color)) return i;
  return -1;
}

/* ==================== AI ==================== */
function aiMove(color) {
  const lv = MODES[mode].lv;
  const w = MODES[mode].w;
  const opp = other(color);
  const cands = candidates(board);
  if (!cands.length) return -1;

  const mine = findFive(cands, color);
  if (mine >= 0) return mine;                               // 自己能成五，直接赢
  const theirs = findFive(cands, opp);
  if (theirs >= 0 && (lv !== 'easy' || Math.random() < 0.55)) return theirs; // 必须堵

  const mid = (N - 1) / 2;
  const scored = cands.map((i) => {
    const a = lineScore(board, i, color);
    const b = lineScore(board, i, opp);
    const [x, y] = xy(i);
    const central = 12 - (Math.abs(x - mid) + Math.abs(y - mid));
    return { i, a, b, v: a + w * b + central + (lv === 'easy' ? Math.random() * 26000 : 0) };
  }).sort((p, q) => q.v - p.v);

  if (lv !== 'hard') {
    if (lv === 'easy') {
      const pool = scored.slice(0, Math.min(5, scored.length));
      return pool[Math.floor(Math.random() * pool.length)].i;
    }
    return scored[0].i;
  }

  // 高手档：预判对手最强回应，扣分后再选
  let best = scored[0], bestVal = -Infinity;
  for (const c of scored.slice(0, 6)) {
    board[c.i] = color;
    let reply = 0;
    for (const j of candidates(board)) {
      const r = lineScore(board, j, opp);
      if (r > reply) reply = r;
    }
    board[c.i] = 0;
    const val = c.a + w * c.b - 0.55 * reply;
    if (val > bestVal) { bestVal = val; best = c; }
  }
  return best.i;
}

/* ==================== 落子与胜负 ==================== */
function play(i, silent) {
  if (phase !== 'play' || i < 0 || board[i]) return false;
  board[i] = turn;
  moves.push({ i, c: turn, t: tNow });
  hintIdx = -1;
  if (!silent) {
    sfx.tone(turn === BLACK ? 300 : 380, 0.05, 'triangle', 0.2);
    sfx.noise(0.05, 0.05, 0.01);
  }
  const line = runAt(board, i, turn);
  if (line) { finish(turn, line); return true; }
  if (moves.length === N * N) { finish(0, null); return true; }
  turn = other(turn);
  afterMove();
  return true;
}

function afterMove() {
  hud();
  save();
  const m = MODES[mode];
  if (phase === 'play' && m.ai && turn === AI_COLOR) scheduleAi();
}

function scheduleAi() {
  thinking = true;
  hud();
  const delay = 220 + Math.random() * 260;
  if (aiTimer) clearTimeout(aiTimer);
  aiTimer = setTimeout(() => {
    aiTimer = null;
    if (phase !== 'play') { thinking = false; return; }
    const mv = aiMove(AI_COLOR);
    thinking = false;
    play(mv);
  }, delay);
}

function finish(win, line) {
  phase = 'over';
  thinking = false;
  winner = win;
  winLine = line;
  turn = win || turn;
  const m = MODES[mode];
  if (m.ai) {
    if (win === BLACK) {
      wins++; streak++;
      if (streak > bestStreak) bestStreak = streak;
      store.set('wuziqi.wins', String(wins));
      store.set('wuziqi.streak', String(bestStreak));
      store.set('wuziqi.cur', String(streak));
      sfx.melody([[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.2]]);
    } else if (win === WHITE) {
      losses++; streak = 0;
      store.set('wuziqi.losses', String(losses));
      store.set('wuziqi.cur', '0');
      sfx.melody([[392, 0.12], [311, 0.16], [233, 0.24]]);
    } else {
      draws++;
      store.set('wuziqi.draws', String(draws));
      sfx.melody([[440, 0.12], [440, 0.16]]);
    }
  } else if (win) {
    if (win === BLACK) sess.b++; else sess.w++;
    store.set('wuziqi.pvp', sess.b + ':' + sess.w + ':' + sess.d);
    sfx.melody([[587, 0.09], [784, 0.09], [988, 0.18]]);
  } else {
    sess.d++;
    store.set('wuziqi.pvp', sess.b + ':' + sess.w + ':' + sess.d);
  }
  store.del('wuziqi.save');
  hud();
  setTimeout(showResult, 620);
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
  const m = MODES[mode];
  if (!m.ai) { finish(other(turn), null); return; }
  finish(AI_COLOR, null);
}

function undo() {
  if (thinking || !moves.length) return;
  if (phase === 'over') { phase = 'play'; winner = 0; winLine = null; overlay.classList.remove('show'); }
  const m = MODES[mode];
  let n = m.ai ? 2 : 1;
  if (moves.length < n) n = moves.length;
  for (let k = 0; k < n; k++) { const last = moves.pop(); board[last.i] = 0; }
  turn = moves.length ? other(moves[moves.length - 1].c) : BLACK;
  if (m.ai && turn === AI_COLOR && moves.length) {
    const last = moves.pop(); board[last.i] = 0;
    turn = other(last.c);
  }
  hintIdx = -1;
  sfx.tone(240, 0.09, 'sine', 0.14, 0, 170);
  hud();
  save();
}

function hint() {
  if (phase !== 'play' || thinking) return;
  const keep = mode;
  mode = 'hard';                              // 用最强档来给建议
  const mv = aiMove(turn);
  mode = keep;
  if (mv < 0) return;
  hintIdx = mv;
  sfx.tone(880, 0.08, 'square', 0.1);
}

function newGame(keepPhase) {
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  board.fill(0);
  moves = [];
  turn = BLACK;
  winner = 0;
  winLine = null;
  thinking = false;
  hintIdx = -1;
  resignArm = -99;
  phase = keepPhase || 'play';
  store.del('wuziqi.save');
  hud();
  const m = MODES[mode];
  if (phase === 'play' && m.ai && turn === AI_COLOR) scheduleAi();
}

/* ==================== 存档 ==================== */
function save() {
  if (phase !== 'play') return;
  if (!moves.length) { store.del('wuziqi.save'); return; }
  store.set('wuziqi.save', JSON.stringify({ m: mode, mv: moves.map((m) => m.i) }));
}

function restore(s) {
  newGame('play');
  mode = MODES[s.m] ? s.m : mode;
  store.set('wuziqi.mode', mode);
  markMode();
  const list = Array.isArray(s.mv) ? s.mv : [];
  for (const i of list) {
    if (typeof i !== 'number' || i < 0 || i >= N * N || board[i]) continue;
    board[i] = turn;
    moves.push({ i, c: turn, t: tNow - 1 });
    const line = runAt(board, i, turn);
    if (line) { finish(turn, line); return; }
    turn = other(turn);
  }
  hud();
  if (phase === 'play') afterMove();
}

/* ==================== 界面 ==================== */
function hud() {
  const m = MODES[mode];
  movesEl.textContent = String(moves.length);
  turnEl.classList.toggle('black', turn === BLACK);
  turnEl.classList.toggle('white', turn === WHITE);
  turnEl.classList.toggle('think', thinking);
  if (phase === 'over') {
    turnEl.textContent = winner ? NAME[winner] + '胜' : '平局';
  } else if (thinking) {
    turnEl.textContent = '电脑思考中';
  } else {
    turnEl.textContent = m.ai ? (turn === BLACK ? '该你落子' : '该电脑') : NAME[turn];
  }
  if (m.ai) {
    scoreEl.textContent = wins + ' 胜 ' + losses + ' 负' + (streak > 1 ? ' · ' + streak + ' 连胜' : '');
  } else {
    scoreEl.textContent = '黑 ' + sess.b + ' : ' + sess.w + ' 白';
  }
  btnUndo.disabled = !moves.length || thinking;
  btnHint.disabled = phase !== 'play' || thinking;
  const armed = tNow - resignArm <= 4;
  btnResign.disabled = phase !== 'play' || thinking;
  btnResign.lastChild.textContent = armed ? '确认认输' : '认输';
  btnResign.classList.toggle('armed', armed);
}

function showIntro(hasSave) {
  overlayContent.innerHTML = '<div class="ov-emoji">⚫</div><h2>五子棋</h2>' +
    '<p class="hint">15×15 棋盘，横竖斜先连成五子者胜。<br>' +
    '可以两人轮流点，也可以挑一档 AI 对战。</p>' +
    '<div class="modes">' +
    '<div><b>👥 双人对战</b>同屏轮流下，比分自动累计</div>' +
    '<div><b>🤖 人机三档</b>你执黑先行，高手档会预判两步</div>' +
    '</div>' +
    '<div class="ov-actions">' +
    (hasSave ? '<button class="primary" data-act="resume">继续上一局</button>' : '') +
    '<button class="' + (hasSave ? 'ghost' : 'primary') + '" data-act="start">开新局</button>' +
    '</div>';
  overlay.classList.add('show');
}

function showResult() {
  const m = MODES[mode];
  let emoji = '🤝', title = '平局', sub = '棋盘下满了，谁也没能连成五子';
  if (winner === BLACK) { emoji = m.ai ? '🎉' : '⚫'; title = m.ai ? '你赢了！' : '黑方胜'; }
  else if (winner === WHITE) { emoji = m.ai ? '🤖' : '⚪'; title = m.ai ? '电脑赢了' : '白方胜'; }
  if (winner && !m.ai) sub = NAME[winner] + '连成五子，比分 ' + sess.b + ' : ' + sess.w;
  else if (winner) sub = '用了 ' + moves.length + ' 手' + (winner === BLACK && streak > 1 ? ' · 当前 ' + streak + ' 连胜' : '');
  const best = bestStreak;
  overlayContent.innerHTML = '<div class="ov-emoji">' + emoji + '</div><h2>' + title + '</h2>' +
    (winLine ? '<p class="hint">五连在这里 ↗ 已经帮你标出来了</p>' : '<p class="hint">中盘认负</p>') +
    '<div class="final-score">' + (m.ai ? (wins + '-' + losses) : (sess.b + ':' + sess.w)) +
    '<span>' + (m.ai ? '胜-负 · 最长连胜 ' + best : '黑-白 · 本局共 ' + moves.length + ' 手') + '</span></div>' +
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
  cv.height = cv.width;
  const k = cv.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}

function drawBoard() {
  const g = ctx.createLinearGradient(0, 0, W, W);
  g.addColorStop(0, '#ecc389');
  g.addColorStop(0.5, '#dfa869');
  g.addColorStop(1, '#c98a52');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, W);
  ctx.fillStyle = 'rgba(120, 70, 20, 0.05)';
  for (let i = 0; i < 30; i++) ctx.fillRect(0, (i * 23 + Math.sin(i * 1.7) * 6) % W, W, 1.5);

  const x0 = PAD, y0 = PAD, x1 = PAD + (N - 1) * CELL, y1 = PAD + (N - 1) * CELL;
  ctx.strokeStyle = 'rgba(74, 40, 10, 0.62)';
  ctx.lineWidth = 1;
  for (let k = 0; k < N; k++) {
    const p = PAD + k * CELL;
    const hw = k === 0 || k === N - 1 ? 1.6 : 0.9;
    ctx.lineWidth = hw;
    ctx.beginPath(); ctx.moveTo(x0, p + 0.5); ctx.lineTo(x1, p + 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p + 0.5, y0); ctx.lineTo(p + 0.5, y1); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(74, 40, 10, 0.75)';
  for (const [sx, sy] of [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]]) {
    ctx.beginPath();
    ctx.arc(PAD + sx * CELL, PAD + sy * CELL, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStone(i, color, scale, alpha) {
  const r = CELL * 0.45 * scale;
  if (r <= 0.4) return;
  const x = px(i), y = py(i);
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2.5;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.15, x, y, r);
  if (color === BLACK) {
    g.addColorStop(0, '#6b7684');
    g.addColorStop(0.45, '#232a36');
    g.addColorStop(1, '#080b12');
  } else {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#eaeef5');
    g.addColorStop(1, '#b0bac9');
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, W);
  drawBoard();

  for (let k = 0; k < moves.length; k++) {
    const m = moves[k];
    const age = (tNow - m.t) / 0.18;
    const e = age >= 1 ? 1 : 1 - Math.pow(1 - age, 3);
    drawStone(m.i, m.c, 0.45 + 0.55 * e + (e < 1 ? 0.12 * Math.sin(e * Math.PI) : 0));
  }

  const last = moves[moves.length - 1];
  if (last && phase !== 'over') {
    const pulse = 0.55 + 0.45 * Math.sin(tNow * 4);
    ctx.strokeStyle = 'rgba(248, 113, 113, ' + pulse.toFixed(3) + ')';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(px(last.i), py(last.i), CELL * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (winLine && winLine.length) {
    const a = 0.55 + 0.45 * Math.sin(tNow * 3.2);
    const first = winLine[0], end = winLine[winLine.length - 1];
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 204, 21, ' + a.toFixed(3) + ')';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(250, 204, 21, 0.8)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(px(first), py(first));
    ctx.lineTo(px(end), py(end));
    ctx.stroke();
    ctx.restore();
    for (const i of winLine) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px(i), py(i), CELL * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (hintIdx >= 0 && phase === 'play') {
    const a = 0.5 + 0.5 * Math.sin(tNow * 5);
    ctx.strokeStyle = 'rgba(34, 211, 238, ' + a.toFixed(3) + ')';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(px(hintIdx), py(hintIdx), CELL * 0.52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const canHover = phase === 'play' && !thinking && hoverIdx >= 0 && !board[hoverIdx] &&
    !(MODES[mode].ai && turn === AI_COLOR);
  if (canHover) {
    drawStone(hoverIdx, turn, 1, 0.34);
  }
}

function frame(t) {
  const dt = clamp((t - (frame.last || t)) / 1000, 0, 0.05);
  frame.last = t;
  tNow += dt;
  if (resignArm > -90 && tNow - resignArm > 4) { resignArm = -99; hud(); }
  draw();
  requestAnimationFrame(frame);
}

/* ==================== 输入 ==================== */
function cellFrom(ev) {
  const rect = cv.getBoundingClientRect();
  const s = (rect.width || W) / W;
  const x = ((ev.clientX || 0) - rect.left) / s;
  const y = ((ev.clientY || 0) - rect.top) / s;
  const gx = Math.round((x - PAD) / CELL);
  const gy = Math.round((y - PAD) / CELL);
  if (gx < 0 || gy < 0 || gx >= N || gy >= N) return -1;
  const j = gy * N + gx;
  if (Math.abs(x - px(j)) > CELL * 0.55 || Math.abs(y - py(j)) > CELL * 0.55) return -1;
  return j;
}

cv.addEventListener('pointerdown', (e) => {
  sfx.resume();
  if (phase !== 'play' || thinking) return;
  const i = cellFrom(e);
  if (i < 0 || board[i]) return;
  play(i);
});
cv.addEventListener('pointermove', (e) => {
  const i = cellFrom(e);
  hoverIdx = i;
  cv.style.cursor = i >= 0 && !board[i] && phase === 'play' ? 'pointer' : 'default';
});
cv.addEventListener('pointerleave', () => { hoverIdx = -1; });

btnSound.addEventListener('click', () => { btnSound.textContent = sfx.toggle() ? '🔇' : '🔊'; });
btnNew.addEventListener('click', () => { sfx.resume(); newGame('play'); });
btnUndo.addEventListener('click', () => { sfx.resume(); undo(); });
btnHint.addEventListener('click', () => { sfx.resume(); hint(); });
btnResign.addEventListener('click', () => { sfx.resume(); resign(); });

diffEl.addEventListener('click', (e) => {
  const btn = e.target.closest ? e.target.closest('[data-m]') : null;
  if (!btn || !MODES[btn.dataset.m]) return;
  sfx.resume();
  mode = btn.dataset.m;
  store.set('wuziqi.mode', mode);
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
  else if (a === 'resume') { overlay.classList.remove('show'); }
  else if (a === 'undo') { undo(); }
  else if (a === 'home') location.href = '../index.html';
});

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'u' || k === 'U') { undo(); e.preventDefault(); }
  else if (k === 'h' || k === 'H') { sfx.resume(); hint(); e.preventDefault(); }
  else if (k === 'r' || k === 'R') { resign(); e.preventDefault(); }
  else if (k === 'n' || k === 'N') { newGame('play'); e.preventDefault(); }
});

window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

/* ==================== 启动 ==================== */
markMode();
resize();
let saved = null;
try { saved = JSON.parse(store.get('wuziqi.save') || 'null'); } catch (e) { saved = null; }
const hasSave = saved && Array.isArray(saved.mv) && saved.mv.length > 0 && MODES[saved.m];
newGame('play');
hud();
if (hasSave) {
  restore(saved);
  if (phase === 'play') showIntro(true);
} else {
  showIntro(false);
}
requestAnimationFrame((t) => { frame.last = t; frame(t); });

})();
