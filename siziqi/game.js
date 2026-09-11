(() => {
'use strict';

/* 四子棋（Connect Four）：每一手选一列，棋子受重力落到该列最低的空格；
   横、竖、斜任意方向先连成四子者胜，42 子下满算平局。
   AI 先做「我能赢 / 他能赢 / 别送赢点」三步战术判断，再跑 negamax + alpha-beta，
   三档难度只改搜索深度与是否放水。 */

const COLS = 7, ROWS = 6, CELL = 80;
const W = COLS * CELL;                       // 560
const H = ROWS * CELL;                       // 480
const CELLS = COLS * ROWS;                   // 42
const RED = 1, YEL = 2;
const NAME = { 1: '红方', 2: '黄方' };
const HUMAN = RED;                           // 人机模式下玩家执红先行
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const ORDER = [3, 2, 4, 1, 5, 0, 6];         // 中心优先的搜索顺序
const COLWT = [3, 5, 7, 10, 7, 5, 3];        // 列价值（中心列最吃香）
const BIG = 1e6;
const MODES = {
  pvp: { ai: false, name: '双人对战', depth: 0 },
  easy: { ai: true, lv: 'easy', name: '人机 · 新手', depth: 1, noise: 260 },
  mid: { ai: true, lv: 'mid', name: '人机 · 棋友', depth: 4, ms: 220 },
  hard: { ai: true, lv: 'hard', name: '人机 · 高手', depth: 7, ms: 420 },
};

// 所有长度为 4 的连线（用于静态评估），开局一次性生成
const WINDOWS = (() => {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dc, dr] of DIRS) {
        const e = c + 3 * dc, f = r + 3 * dr;
        if (e < 0 || e >= COLS || f < 0 || f >= ROWS) continue;
        const w = [];
        for (let k = 0; k < 4; k++) w.push((r + k * dr) * COLS + (c + k * dc));
        out.push(w);
      }
    }
  }
  return out;
})();

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
const sfx = window.Sfx.create({ storageKey: 'siziqi.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

/* ==================== 状态 ==================== */
const bd = new Uint8Array(CELLS);            // r=0 在顶部，i = r*COLS+c
const ht = new Uint8Array(COLS);             // 每列已经落了几颗
let history = [];                            // {i, c, color}
let turn = RED;
let phase = 'intro';                         // intro | play | over
let winner = 0;
let winCells = [];                           // 获胜的那条连线
let thinking = false;
let aiTimer = null;
let hintCol = -1;
let hoverCol = -1;
let activeCol = 3;                           // 键盘当前指向的列
let anim = null;                             // {i, c, color, t0}
let resignArm = -99;
let tNow = 0;
let mode = store.get('siziqi.mode') || 'mid';
if (!MODES[mode]) mode = 'mid';
let wins = Number(store.get('siziqi.wins')) || 0;
let losses = Number(store.get('siziqi.losses')) || 0;
let draws = Number(store.get('siziqi.draws')) || 0;
let bestStreak = Number(store.get('siziqi.streak')) || 0;
let streak = 0;
let sess = { r: 0, y: 0, d: 0 };
try {
  const p = (store.get('siziqi.pvp') || '').split(':');
  if (p.length === 3) sess = { r: Number(p[0]) || 0, y: Number(p[1]) || 0, d: Number(p[2]) || 0 };
} catch (e) { /* 忽略 */ }

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const colOf = (i) => i % COLS;
const rowOf = (i) => (i / COLS) | 0;
const opp = (c) => 3 - c;
const isAiTurn = () => MODES[mode].ai && turn === YEL;
// 该列落子后的格子序号（列已满返回 -1）
const landing = (c) => (c < 0 || c >= COLS || ht[c] >= ROWS ? -1 : (ROWS - 1 - ht[c]) * COLS + c);
const legalCols = () => { const out = []; for (const c of ORDER) if (ht[c] < ROWS) out.push(c); return out; };
const filled = () => { let n = 0; for (let c = 0; c < COLS; c++) n += ht[c]; return n; };

/* ==================== 规则 ==================== */
// 从 (i) 出发沿方向 (dc,dr) 数同色连子，返回 >=4 时整条连线（按列、行排序）
function runAt(b, i, color) {
  const c0 = colOf(i), r0 = rowOf(i);
  for (const [dc, dr] of DIRS) {
    const cells = [i];
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      let c = c0 + dc * sgn, r = r0 + dr * sgn;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && b[r * COLS + c] === color) {
        cells.push(r * COLS + c);
        c += dc * sgn; r += dr * sgn;
      }
    }
    if (cells.length >= 4) {
      cells.sort((x, y) => (colOf(x) - colOf(y)) || (rowOf(x) - rowOf(y)));
      return cells;
    }
  }
  return null;
}

// 现在行棋方能否一步获胜（返回列号，不能则 -1）
function winningCol(b, h, color) {
  for (const c of ORDER) {
    if (h[c] >= ROWS) continue;
    const i = (ROWS - 1 - h[c]) * COLS + c;
    b[i] = color;
    const ok = !!runAt(b, i, color);
    b[i] = 0;
    if (ok) return c;
  }
  return -1;
}

// 我走 c 列之后，对手是否只要在同一列再走一手就赢（俗称「送赢点」）
function givesAway(c, enemy) {
  const r = ROWS - 1 - ht[c];
  if (r - 1 < 0) return false;
  const i = (r - 1) * COLS + c;
  if (bd[i]) return false;
  bd[i] = enemy;
  const ok = !!runAt(bd, i, enemy);
  bd[i] = 0;
  return ok;
}

/* ==================== AI ==================== */
function evaluate(b, h, color) {
  const me = color, op = 3 - color;
  let s = 0;
  for (const w of WINDOWS) {
    let m = 0, o = 0;
    for (const i of w) { const v = b[i]; if (v === me) m++; else if (v === op) o++; }
    if (m && o) continue;
    if (m === 4) s += 100000; else if (m === 3) s += 120; else if (m === 2) s += 18;
    if (o === 4) s -= 100000; else if (o === 3) s -= 165; else if (o === 2) s -= 22;
  }
  for (const c of ORDER) {
    for (let r = ROWS - 1; r >= ROWS - h[c]; r--) {
      const v = b[r * COLS + c];
      const bonus = r >= ROWS - 3 ? 3 : 1;             // 靠下的格子更有用
      if (v === me) s += COLWT[c] * bonus;
      else if (v === op) s -= COLWT[c] * bonus;
    }
  }
  return s;
}

let deadline = 0, aborted = false, nodes = 0;

// 返回「color 视角」的最好分数；找到赢棋就按层数尽早取胜
function score(b, h, color, depth, alpha, beta, ply) {
  if ((++nodes & 127) === 0 && Date.now() > deadline) aborted = true;
  if (aborted) return evaluate(b, h, color);
  const win = winningCol(b, h, color);
  if (win >= 0) return BIG - ply;
  if (depth <= 0) return evaluate(b, h, color);
  let best = -Infinity, any = false;
  for (const c of ORDER) {
    if (h[c] >= ROWS) continue;
    any = true;
    const i = (ROWS - 1 - h[c]) * COLS + c;
    b[i] = color; h[c]++;
    const v = -score(b, h, 3 - color, depth - 1, -beta, -alpha, ply + 1);
    h[c]--; b[i] = 0;
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta || aborted) break;
  }
  return any ? best : 0;                              // 满盘且没人赢 = 平局
}

function aiPick(cfg) {
  const legal = legalCols();
  if (!legal.length) return -1;
  const me = turn, op = 3 - turn;
  const win = winningCol(bd, ht, me);
  if (win >= 0) return win;
  const threat = winningCol(bd, ht, op);
  if (threat >= 0 && (!cfg.noise || Math.random() < 0.4)) return threat;
  let cands = legal;
  if (!cfg.noise) {
    const safe = legal.filter((c) => !givesAway(c, op));
    if (safe.length) cands = safe;
  }
  deadline = Date.now() + (cfg.noise ? 120 : (cfg.ms || 260));
  aborted = false;
  nodes = 0;
  const scored = [];
  for (const c of cands) {
    const i = (ROWS - 1 - ht[c]) * COLS + c;
    bd[i] = me; ht[c]++;
    let v = -score(bd, ht, op, cfg.depth - 1, -BIG, BIG, 1) + COLWT[c] * 2;
    if (cfg.noise) v += Math.random() * cfg.noise;
    bd[i] = 0; ht[c]--;
    scored.push({ c, v });
    if (aborted) break;
  }
  scored.sort((x, y) => y.v - x.v);
  return scored.length ? scored[0].c : cands[0];
}

/* ==================== 行棋 ==================== */
function commit(c) {
  if (phase !== 'play') return;
  const i = landing(c);
  if (i < 0) return;
  const color = turn;
  bd[i] = color; ht[c]++;
  history.push({ i, c, color });
  anim = { i, c, color, t0: tNow };
  activeCol = c;
  hintCol = -1;
  sfx.tone(color === RED ? 320 : 430, 0.05, 'triangle', 0.2);
  const run = runAt(bd, i, color);
  if (run) {
    winCells = run;
    sfx.melody([[660, 0.07], [880, 0.07], [1100, 0.16]], 0.05);
    finish(color);
    return;
  }
  if (filled() >= CELLS) { sfx.melody([[440, 0.12], [392, 0.16]]); finish(0); return; }
  turn = opp(color);
  hud();
  save();
  if (isAiTurn()) scheduleAi();
}

function scheduleAi() {
  thinking = true;
  hud();
  if (aiTimer) clearTimeout(aiTimer);
  aiTimer = setTimeout(() => {
    aiTimer = null;
    thinking = false;
    if (phase !== 'play' || !isAiTurn()) { hud(); return; }
    commit(aiPick(MODES[mode]));
  }, 260 + Math.random() * 220);
}

function finish(win) {
  phase = 'over';
  thinking = false;
  winner = win;
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  const ai = MODES[mode].ai;
  if (ai) {
    if (win === HUMAN) {
      wins++; streak++;
      if (streak > bestStreak) bestStreak = streak;
      store.set('siziqi.wins', String(wins));
      store.set('siziqi.streak', String(bestStreak));
    } else if (win) {
      losses++; streak = 0;
      store.set('siziqi.losses', String(losses));
    } else {
      draws++;
      store.set('siziqi.draws', String(draws));
    }
  } else {
    if (win === RED) sess.r++; else if (win === YEL) sess.y++; else sess.d++;
    store.set('siziqi.pvp', sess.r + ':' + sess.y + ':' + sess.d);
  }
  store.del('siziqi.save');
  hud();
  setTimeout(showResult, 720);
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
  finish(MODES[mode].ai ? YEL : opp(turn));
}

function undo() {
  if (thinking || !history.length) return;
  if (phase === 'over') { phase = 'play'; winner = 0; winCells = []; overlay.classList.remove('show'); }
  const ai = MODES[mode].ai;
  const pop = () => {
    const h = history.pop();
    bd[h.i] = 0; ht[h.c]--;
    turn = h.color;
    return h;
  };
  pop();
  if (ai && turn !== HUMAN && history.length) pop();
  anim = null;
  hintCol = -1;
  winCells = [];
  sfx.tone(240, 0.09, 'sine', 0.14, 0, 170);
  hud();
  save();
}

function hint() {
  if (phase !== 'play' || thinking || !legalCols().length) return;
  hintCol = aiPick(MODES.hard);
  sfx.tone(880, 0.08, 'square', 0.1);
  hud();
  save();
}

function resetBoard() {
  bd.fill(0); ht.fill(0);
  history = [];
  turn = RED;
  winner = 0;
  winCells = [];
  thinking = false;
  resignArm = -99;
  hintCol = -1;
  hoverCol = -1;
  activeCol = 3;
  anim = null;
}

function newGame(keepPhase) {
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  resetBoard();
  phase = keepPhase || 'play';
  hud();
  save();
  if (phase === 'play' && isAiTurn()) scheduleAi();
}

/* ==================== 断点续玩 ==================== */
function save() {
  if (phase !== 'play') return;
  if (!history.length) { store.del('siziqi.save'); return; }
  store.set('siziqi.save', JSON.stringify({
    m: mode, mv: history.map((h) => h.c), t: turn,
    h: hintCol >= 0 ? hintCol : null,
  }));
}

function restore(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.mv) || !s.mv.length) return false;
  mode = MODES[s.m] ? s.m : mode;
  markMode();
  resetBoard();
  phase = 'play';
  for (let k = 0; k < s.mv.length; k++) {
    const c = Number(s.mv[k]);
    if (!(c >= 0 && c < COLS) || ht[c] >= ROWS) return false;
    const i = landing(c);
    bd[i] = turn; ht[c]++;
    history.push({ i, c, color: turn });
    if (runAt(bd, i, turn)) return false;              // 已分胜负的局面不作为续玩存档
    turn = opp(turn);
  }
  if (filled() >= CELLS) return false;
  if (s.h >= 0 && s.h < COLS && ht[s.h] < ROWS) hintCol = s.h;
  return true;
}

/* ==================== 界面 ==================== */
function hud() {
  const ai = MODES[mode].ai;
  movesEl.textContent = String(history.length);
  turnEl.classList.toggle('red', turn === RED);
  turnEl.classList.toggle('yellow', turn === YEL);
  turnEl.classList.toggle('think', thinking);
  if (phase === 'over') turnEl.textContent = winner ? NAME[winner] + '胜' : '平局';
  else if (thinking) turnEl.textContent = '电脑思考中';
  else turnEl.textContent = ai ? (turn === HUMAN ? '该你落子' : '该电脑') : NAME[turn];
  scoreEl.textContent = ai ? wins + ' 胜 ' + losses + ' 负' + (draws ? ' · ' + draws + ' 和' : '') + (streak > 1 ? ' · ' + streak + ' 连胜' : '')
    : '红 ' + sess.r + ' : ' + sess.y + ' 黄';
  btnUndo.disabled = !history.length || thinking;
  btnHint.disabled = phase !== 'play' || thinking || !legalCols().length;
  btnResign.disabled = phase !== 'play' || thinking;
  const armed = tNow - resignArm <= 4;
  btnResign.lastChild.textContent = armed ? '确认认输' : '认输';
  btnResign.classList.toggle('armed', armed);
}

function showIntro(keep) {
  overlayContent.innerHTML = '<div class="ov-emoji">🔴</div><h2>四子棋</h2>' +
    '<p class="hint">棋子只会往下掉，落定后不能移动。<br>横、竖、斜任意方向先连成 <b>四子</b> 就赢，42 子下满算平局。</p>' +
    '<div class="vs"><div class="rc"><b>●</b><span>红先行</span></div><em>vs</em>' +
    '<div class="yc"><b>●</b><span>' + (MODES[mode].ai ? '电脑黄子' : '黄后行') + '</span></div></div>' +
    '<div class="ov-actions">' +
    (keep ? '<button class="primary" data-act="resume">继续上一局</button>' : '') +
    '<button class="' + (keep ? 'ghost' : 'primary') + '" data-act="start">开一局</button></div>';
  overlay.classList.add('show');
}

function showResult() {
  const ai = MODES[mode].ai;
  let emoji = '🤝', title = '平局';
  if (winner) {
    const good = ai ? winner === HUMAN : true;
    emoji = good ? '🎉' : '💀';
    title = ai ? (good ? '你赢了' : '电脑赢了') : NAME[winner] + '胜';
  }
  let rc = 0, yc = 0;
  for (let i = 0; i < CELLS; i++) { if (bd[i] === RED) rc++; else if (bd[i] === YEL) yc++; }
  overlayContent.innerHTML = '<div class="ov-emoji">' + emoji + '</div><h2>' + title + '</h2>' +
    '<div class="vs"><div class="rc"><b>' + rc + '</b><span>红子</span></div><em>vs</em>' +
    '<div class="yc"><b>' + yc + '</b><span>黄子</span></div></div>' +
    '<p class="hint">' + (winner ? '四子连线已点亮' : '42 子下满') + ' · 共 ' + history.length + ' 手' +
    (ai ? ' · 最长连胜 ' + bestStreak : ' · 总比分 红 ' + sess.r + ' : ' + sess.y + ' 黄') + '</p>' +
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

const cxOf = (i) => colOf(i) * CELL + CELL / 2;
const cyOf = (i) => rowOf(i) * CELL + CELL / 2;
const R_HOLE = CELL * 0.43;
const R_DISC = CELL * 0.385;

function drawBoard(pulse) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#2563eb');
  g.addColorStop(0.55, '#1d4ed8');
  g.addColorStop(1, '#16337f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fillRect(0, 0, W, 5);
  // 指向列的柔光
  const hl = hoverCol >= 0 ? hoverCol : (activeCol >= 0 && phase === 'play' ? activeCol : -1);
  if (hl >= 0 && phase === 'play') {
    ctx.fillStyle = 'rgba(191, 219, 254, ' + (0.06 + 0.05 * pulse).toFixed(3) + ')';
    ctx.fillRect(hl * CELL + 3, 0, CELL - 6, H);
  }
  // 挖洞
  for (let i = 0; i < CELLS; i++) {
    ctx.fillStyle = 'rgba(4, 10, 28, 0.9)';
    ctx.beginPath();
    ctx.arc(cxOf(i), cyOf(i), R_HOLE, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(2, 6, 18, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cxOf(i), cyOf(i), R_HOLE, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawDisc(color, cx, cy, rx, ry, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.translate(cx, cy);
  ctx.scale(rx / R_DISC, ry == null ? 1 : ry / R_DISC);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  const g = ctx.createRadialGradient(-R_DISC * 0.35, -R_DISC * 0.42, R_DISC * 0.12, 0, 0, R_DISC);
  if (color === RED) {
    g.addColorStop(0, '#ffe4e6');
    g.addColorStop(0.45, '#f43f5e');
    g.addColorStop(1, '#7c1d2e');
  } else {
    g.addColorStop(0, '#fefce8');
    g.addColorStop(0.45, '#fbbf24');
    g.addColorStop(1, '#9a5b06');
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R_DISC, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, R_DISC * 0.97, Math.PI * 1.08, Math.PI * 1.72);
  ctx.stroke();
  ctx.restore();
}

function drawWin(pulse) {
  if (!winCells.length) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(253, 224, 71, ' + (0.75 + 0.25 * pulse).toFixed(3) + ')';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(253, 224, 71, 0.85)';
  ctx.shadowBlur = 16;
  const a = winCells[0], b = winCells[winCells.length - 1];
  ctx.beginPath();
  ctx.moveTo(cxOf(a), cyOf(a));
  ctx.lineTo(cxOf(b), cyOf(b));
  ctx.stroke();
  ctx.restore();
  for (const i of winCells) {
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.35 + 0.35 * pulse).toFixed(3) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cxOf(i), cyOf(i), R_HOLE - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function draw() {
  const pulse = 0.5 + 0.5 * Math.sin(tNow * 3.4);
  ctx.clearRect(0, 0, W, H);
  drawBoard(pulse);

  // 落点预览（人机提示 / 鼠标指向）
  if (phase === 'play') {
    const show = hintCol >= 0 ? hintCol : (thinking || isAiTurn() ? -1 : hoverCol);
    const i = landing(show);
    if (i >= 0) {
      drawDisc(turn, cxOf(i), cyOf(i), R_DISC * 0.9, null, 0.24 + 0.14 * pulse);
      if (hintCol >= 0 && show === hintCol) {
        ctx.strokeStyle = 'rgba(34, 211, 238, ' + (0.5 + 0.5 * pulse).toFixed(3) + ')';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(cxOf(i), cyOf(i), R_HOLE, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  for (let i = 0; i < CELLS; i++) {
    const v = bd[i];
    if (!v) continue;
    if (anim && anim.i === i) continue;
    drawDisc(v, cxOf(i), cyOf(i), R_DISC, null, 1);
  }

  // 最后落子的一圈红环
  const last = history[history.length - 1];
  if (last && phase !== 'over') {
    ctx.strokeStyle = 'rgba(248, 113, 113, ' + (0.45 + 0.5 * pulse).toFixed(3) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cxOf(last.i), cyOf(last.i), R_HOLE - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawWin(pulse);

  // 正在下落的棋子（画在挡板前面）
  if (anim) {
    const dur = 0.3;
    const k = (tNow - anim.t0) / dur;
    const target = cyOf(anim.i);
    if (k >= 1.22) {
      anim = null;
    } else {
      const kk = clamp(k, 0, 1);
      const y = -CELL * 0.5 + (target + CELL * 0.5) * kk * kk;
      let rx = R_DISC, ry = R_DISC;
      if (k > 1) {                                    // 落地压扁回弹
        const q = clamp((k - 1) / 0.22, 0, 1);
        const s = (1 - q) * 0.16;
        rx = R_DISC * (1 + s);
        ry = R_DISC * (1 - s);
      }
      drawDisc(anim.color, cxOf(anim.i), y, rx, ry, 1);
    }
  }
}

function frame(t) {
  const now = t || 0;
  const dt = clamp((now - (frame.last || now)) / 1000, 0, 0.05);
  frame.last = now;
  tNow += dt;
  if (resignArm > -90 && tNow - resignArm > 4) { resignArm = -99; hud(); }
  draw();
  requestAnimationFrame(frame);
}

/* ==================== 输入 ==================== */
function colFrom(ev) {
  const rect = cv.getBoundingClientRect();
  const s = (rect.width || W) / W;
  const x = ((ev.clientX || 0) - rect.left) / s;
  const y = ((ev.clientY || 0) - rect.top) / s;
  if (x < 0 || y < 0 || x >= W || y >= H) return -1;
  return clamp(Math.floor(x / CELL), 0, COLS - 1);
}

function play(c) {
  if (phase !== 'play' || thinking || isAiTurn()) return;
  if (c < 0 || c >= COLS) return;
  if (ht[c] >= ROWS) { sfx.tone(180, 0.08, 'sine', 0.12); return; }
  commit(c);
}

cv.addEventListener('pointerdown', (e) => {
  sfx.resume();
  const c = colFrom(e);
  hoverCol = c;
  play(c);
});
cv.addEventListener('pointermove', (e) => { hoverCol = colFrom(e); activeCol = hoverCol < 0 ? activeCol : hoverCol; });
cv.addEventListener('pointerleave', () => { hoverCol = -1; });

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
  store.set('siziqi.mode', mode);
  markMode();
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
  if (k >= '1' && k <= '7') { sfx.resume(); play(Number(k) - 1); e.preventDefault(); }
  else if (k === 'ArrowLeft') { activeCol = clamp(activeCol - 1, 0, COLS - 1); hoverCol = -1; e.preventDefault(); }
  else if (k === 'ArrowRight') { activeCol = clamp(activeCol + 1, 0, COLS - 1); hoverCol = -1; e.preventDefault(); }
  else if (k === ' ' || k === 'Enter') { sfx.resume(); play(activeCol); e.preventDefault(); }
  else if (k === 'u' || k === 'U') { sfx.resume(); undo(); e.preventDefault(); }
  else if (k === 'h' || k === 'H') { sfx.resume(); hint(); e.preventDefault(); }
  else if (k === 'r' || k === 'R') { resign(); e.preventDefault(); }
  else if (k === 'n' || k === 'N') { newGame('play'); e.preventDefault(); }
});

window.addEventListener('resize', resize);

/* ==================== 启动 ==================== */
markMode();
resize();
let saved = null;
try { saved = JSON.parse(store.get('siziqi.save') || 'null'); } catch (e) { saved = null; }
const keep = !!(saved && MODES[saved.m] && restore(saved) && phase === 'play' && history.length);
if (!keep) newGame('intro');
else {
  hud();
  if (isAiTurn()) scheduleAi();               // 轮到电脑时接着想
}
showIntro(keep);
requestAnimationFrame((t) => { frame.last = t; frame(t); });

})();
