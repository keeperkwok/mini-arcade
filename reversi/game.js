(() => {
'use strict';

/* 黑白棋（奥赛罗）：落子必须把自己一颗子和另一颗子之间夹住的对方棋子翻色；
   无处可走就弃权，双方都走不动（或棋盘下满）时比子数。
   AI 用「位置权重 + 机动性 + 残局子数」的 negamax + alpha-beta，三档对应不同搜索深度。 */

const N = 8, CELLS = N * N, CELL = 70;
const W = N * CELL;
const BLACK = 1, WHITE = 2;
const NAME = { 1: '黑方', 2: '白方' };
const OFF = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const WT = [
  120, -22, 20, 6, 6, 20, -22, 120,
  -22, -45, -5, -3, -3, -5, -45, -22,
  20, -5, 15, 3, 3, 15, -5, 20,
  6, -3, 3, 3, 3, 3, -3, 6,
  6, -3, 3, 3, 3, 3, -3, 6,
  20, -5, 15, 3, 3, 15, -5, 20,
  -22, -45, -5, -3, -3, -5, -45, -22,
  120, -22, 20, 6, 6, 20, -22, 120,
];
const MODES = {
  pvp: { ai: false, name: '双人对战', depth: 0 },
  easy: { ai: true, lv: 'easy', name: '人机 · 新手', depth: 1, noise: 90 },
  mid: { ai: true, lv: 'mid', name: '人机 · 棋友', depth: 4, ms: 260 },
  hard: { ai: true, lv: 'hard', name: '人机 · 高手', depth: 7, ms: 700 },
};
const HUMAN = BLACK;

/* ==================== 元素 ==================== */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const turnEl = document.getElementById('turn');
const countEl = document.getElementById('count');
const scoreEl = document.getElementById('score');
const barBlk = document.getElementById('barBlk');
const barWht = document.getElementById('barWht');
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
const sfx = window.Sfx.create({ storageKey: 'reversi.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

/* ==================== 状态 ==================== */
const bd = new Uint8Array(CELLS);
let history = [];                        // {i, f, color, nextTurn}
let turn = BLACK;
let phase = 'intro';                     // intro | play | over
let winner = 0;
let passMsg = '';
let thinking = false;
let aiTimer = null;
let hintIdx = -1;
let hoverIdx = -1;
let anim = {};                           // i -> {t0, from}
let resignArm = -99;
let tNow = 0;
let mode = store.get('reversi.mode') || 'mid';
if (!MODES[mode]) mode = 'mid';
let wins = Number(store.get('reversi.wins')) || 0;
let losses = Number(store.get('reversi.losses')) || 0;
let draws = Number(store.get('reversi.draws')) || 0;
let bestStreak = Number(store.get('reversi.streak')) || 0;
let streak = 0;
let sess = { b: 0, w: 0, d: 0 };
try {
  const p = (store.get('reversi.pvp') || '').split(':');
  if (p.length === 3) sess = { b: Number(p[0]) || 0, w: Number(p[1]) || 0, d: Number(p[2]) || 0 };
} catch (e) { /* 忽略 */ }

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const idxOf = (c, r) => r * N + c;
const cs = (i) => i % N;
const rs = (i) => (i / N) | 0;
const opp = (c) => 3 - c;
const isAiTurn = () => MODES[mode].ai && turn === WHITE;

/* ==================== 规则 ==================== */
function flipsAt(b, i, color) {
  const c0 = cs(i), r0 = rs(i), enemy = opp(color);
  const out = [];
  for (const [dc, dr] of OFF) {
    const run = [];
    let c = c0 + dc, r = r0 + dr;
    while (c >= 0 && c < N && r >= 0 && r < N) {
      const j = r * N + c;
      if (b[j] === 0) break;
      if (b[j] === color) { for (const k of run) out.push(k); break; }
      run.push(j);
      c += dc; r += dr;
    }
  }
  return out;
}

function legalList(b, color) {
  const out = [];
  for (let i = 0; i < CELLS; i++) {
    if (b[i] === 0 && flipsAt(b, i, color).length) out.push(i);
  }
  return out;
}

function applyAt(b, i, color) {
  const f = flipsAt(b, i, color);
  b[i] = color;
  for (const j of f) b[j] = color;
  return f;
}

function revertAt(b, i, f, color) {
  b[i] = 0;
  for (const j of f) b[j] = opp(color);
}

function counts(b) {
  let blk = 0, wht = 0;
  for (let i = 0; i < CELLS; i++) { if (b[i] === BLACK) blk++; else if (b[i] === WHITE) wht++; }
  return { blk, wht, empty: CELLS - blk - wht };
}

/* ==================== AI ==================== */
function evaluate(b, color, myLegal) {
  let diff = 0, blk = 0, wht = 0;
  for (let i = 0; i < CELLS; i++) {
    const v = b[i];
    if (!v) continue;
    if (v === BLACK) blk++; else wht++;
    if (v === color) diff += WT[i]; else diff -= WT[i];
  }
  const mob = myLegal.length * 14 - legalList(b, opp(color)).length * 14;
  const filled = CELLS - blk - wht;
  let s = diff + mob;
  if (filled > 40) {                                   // 越到残局越看真实子数
    const mine = color === BLACK ? blk : wht;
    const theirs = color === BLACK ? wht : blk;
    const k = (filled - 40) / 24;
    s = s * (1 - k) + (mine - theirs) * 260 * k;
  }
  return s;
}

let deadline = 0, aborted = false, nodes = 0;

function search(b, color, depth, alpha, beta, passed) {
  if ((++nodes & 255) === 0 && Date.now() > deadline) aborted = true;
  if (aborted) return evaluate(b, color, legalList(b, color));
  const legal = legalList(b, color);
  if (!legal.length) {
    if (passed) {                                      // 双方都走不动 → 终局
      const c = counts(b);
      const mine = color === BLACK ? c.blk : c.wht;
      const theirs = color === BLACK ? c.wht : c.blk;
      return (mine - theirs) * 100000;
    }
    return -search(b, opp(color), depth, -beta, -alpha, true);
  }
  if (depth <= 0) return evaluate(b, color, legal);
  legal.sort((x, y) => WT[y] - WT[x]);
  let best = -1e9;
  for (const m of legal) {
    const f = applyAt(b, m, color);
    const v = -search(b, opp(color), depth - 1, -beta, -alpha, false);
    revertAt(b, m, f, color);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta || aborted) break;
  }
  return best;
}

function aiPick(color, legal, cfg) {
  if (!legal.length) return -1;
  if (cfg.noise) {
    let best = legal[0], bv = -1e9;
    for (const m of legal) {
      const f = applyAt(bd, m, color);
      deadline = Date.now() + 3000;
    const v = -search(bd, opp(color), 1, -1e9, 1e9, false) + Math.random() * cfg.noise;
      revertAt(bd, m, f, color);
      if (v > bv) { bv = v; best = m; }
    }
    return best;
  }
  deadline = Date.now() + (cfg.ms || 300);
  aborted = false;
  nodes = 0;
  let best = legal[0], bv = -1e9;
  const scored = [];
  for (const m of legal) {
    const f = applyAt(bd, m, color);
    const v = -search(bd, opp(color), cfg.depth - 1, -1e9, -bv, false);
    revertAt(bd, m, f, color);
    scored.push({ m, v });
    if (aborted) break;
  }
  if (aborted || !scored.length) return legal.sort((x, y) => WT[y] - WT[x])[0];
  scored.sort((x, y) => y.v - x.v);
  return scored[0].m;
}

/* ==================== 行棋 ==================== */
function commit(i) {
  if (i < 0) return;
  const f = applyAt(bd, i, turn);
  const color = turn;
  for (const j of f) anim[j] = { t0: tNow, from: opp(color) };
  history.push({ i, f, color, nextTurn: 0 });
  hintIdx = -1;
  sfx.tone(color === BLACK ? 320 : 400, 0.05, 'triangle', 0.2);
  if (f.length) sfx.melody(f.slice(0, 4).map((k, n) => [520 + n * 90, 0.04]), 0.035);
  advance();
}

function advanceTurn(lastColor) {
  const next = opp(lastColor);
  passMsg = '';
  if (legalList(bd, next).length) turn = next;
  else if (legalList(bd, lastColor).length) {
    turn = lastColor;
    passMsg = NAME[next] + '无处可走，' + NAME[lastColor] + '继续';
  } else {
    const c = counts(bd);
    finish(c.blk > c.wht ? BLACK : c.wht > c.blk ? WHITE : 0);
    return false;
  }
  return true;
}

function advance() {
  const last = history[history.length - 1];
  if (!advanceTurn(last.color)) return;
  last.nextTurn = turn;
  hud();
  save();
  if (phase === 'play' && isAiTurn()) scheduleAi();
}

/* ==================== 断点续玩 ==================== */
function save() {
  if (phase !== 'play') return;
  if (!history.length) { store.del('reversi.save'); return; }
  store.set('reversi.save', JSON.stringify({
    m: mode, mv: history.map((h) => [h.i, h.color]), t: turn,
    h: hintIdx >= 0 ? hintIdx : null,
  }));
}

function restore(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.mv) || !s.mv.length) return false;
  mode = MODES[s.m] ? s.m : mode;
  markMode();
  resetBoard();
  phase = 'play';
  for (const pair of s.mv) {
    const i = Number(pair[0]), c = Number(pair[1]);
    if (c !== turn || !(i >= 0 && i < CELLS) || bd[i] || !flipsAt(bd, i, c).length) return false;
    const f = applyAt(bd, i, c);
    history.push({ i, f, color: c, nextTurn: 0 });
    if (!advanceTurn(c)) return true;
    history[history.length - 1].nextTurn = turn;
  }
  if (s.h >= 0 && s.h < CELLS && bd[s.h] === 0 && flipsAt(bd, s.h, turn).length) hintIdx = s.h;
  return true;
}

function scheduleAi() {
  thinking = true;
  hud();
  if (aiTimer) clearTimeout(aiTimer);
  aiTimer = setTimeout(() => {
    aiTimer = null;
    thinking = false;
    if (phase !== 'play') return;
    const legal = legalList(bd, turn);
    if (!legal.length) { advance(); return; }
    commit(aiPick(turn, legal, MODES[mode]));
  }, 240 + Math.random() * 220);
}

function finish(win) {
  phase = 'over';
  thinking = false;
  winner = win;
  const ai = MODES[mode].ai;
  if (ai) {
    if (win === HUMAN) {
      wins++; streak++;
      if (streak > bestStreak) bestStreak = streak;
      store.set('reversi.wins', String(wins));
      store.set('reversi.streak', String(bestStreak));
      sfx.melody([[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.2]]);
    } else if (win === WHITE) {
      losses++; streak = 0;
      store.set('reversi.losses', String(losses));
      sfx.melody([[392, 0.12], [311, 0.16], [233, 0.24]]);
    } else {
      draws++;
      store.set('reversi.draws', String(draws));
      sfx.melody([[440, 0.12], [440, 0.16]]);
    }
  } else {
    if (win === BLACK) sess.b++; else if (win === WHITE) sess.w++; else sess.d++;
    store.set('reversi.pvp', sess.b + ':' + sess.w + ':' + sess.d);
    if (win) sfx.melody([[587, 0.09], [784, 0.09], [988, 0.18]]);
  }
  store.del('reversi.save');
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
  finish(MODES[mode].ai ? WHITE : opp(turn));
}

function undo() {
  if (thinking || !history.length) return;
  if (phase === 'over') { phase = 'play'; winner = 0; overlay.classList.remove('show'); }
  const ai = MODES[mode].ai;
  let guard = 6;
  do {
    const h = history.pop();
    revertAt(bd, h.i, h.f, h.color);
    turn = history.length ? history[history.length - 1].nextTurn : BLACK;
  } while (ai && turn !== HUMAN && history.length && guard-- > 0);
  passMsg = '';
  hintIdx = -1;
  anim = {};
  sfx.tone(240, 0.09, 'sine', 0.14, 0, 170);
  hud();
  save();
}

function hint() {
  if (phase !== 'play' || thinking) return;
  const legal = legalList(bd, turn);
  if (!legal.length) return;
  hintIdx = aiPick(turn, legal, MODES.hard);
  sfx.tone(880, 0.08, 'square', 0.1);
  hud();
  save();
}

function resetBoard() {
  bd.fill(0);
  bd[idxOf(3, 3)] = WHITE; bd[idxOf(4, 4)] = WHITE;
  bd[idxOf(3, 4)] = BLACK; bd[idxOf(4, 3)] = BLACK;
  history = [];
  turn = BLACK;
  winner = 0;
  passMsg = '';
  thinking = false;
  resignArm = -99;
  hintIdx = -1;
  anim = {};
}

function newGame(keepPhase) {
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  resetBoard();
  phase = keepPhase || 'play';
  hud();
  save();
  if (phase === 'play' && isAiTurn()) scheduleAi();
}
/* ==================== 界面 ==================== */
function hud() {
  const c = counts(bd);
  const ai = MODES[mode].ai;
  countEl.textContent = c.blk + ' : ' + c.wht;
  barBlk.style.flexGrow = String(Math.max(0.06, c.blk / 10));
  barWht.style.flexGrow = String(Math.max(0.06, c.wht / 10));
  turnEl.classList.toggle('black', turn === BLACK);
  turnEl.classList.toggle('white', turn === WHITE);
  turnEl.classList.toggle('think', thinking);
  turnEl.classList.toggle('pass', !!passMsg && phase === 'play');
  if (phase === 'over') turnEl.textContent = winner ? NAME[winner] + '胜' : '平局';
  else if (thinking) turnEl.textContent = '电脑思考中';
  else if (passMsg) turnEl.textContent = NAME[opp(turn)] + '弃权';
  else turnEl.textContent = ai ? (turn === HUMAN ? '该你落子' : '该电脑') : NAME[turn];
  scoreEl.textContent = ai ? wins + ' 胜 ' + losses + ' 负' + (streak > 1 ? ' · ' + streak + ' 连胜' : '')
    : '黑 ' + sess.b + ' : ' + sess.w + ' 白';
  btnUndo.disabled = !history.length || thinking;
  btnHint.disabled = phase !== 'play' || thinking || !legalList(bd, turn).length;
  btnResign.disabled = phase !== 'play' || thinking;
  const armed = tNow - resignArm <= 4;
  btnResign.lastChild.textContent = armed ? '确认认输' : '认输';
  btnResign.classList.toggle('armed', armed);
}

function showIntro(keep) {
  overlayContent.innerHTML = '<div class="ov-emoji">🌓</div><h2>黑白棋</h2>' +
    '<p class="hint">把对方的棋子上下左右斜着夹住就翻色，<br>棋盘见分时子多的一方获胜。走不动就弃权。</p>' +
    '<div class="vs"><div class="b1c"><b>●</b><span>黑先行</span></div><em>vs</em>' +
    '<div class="w1c"><b>○</b><span>' + (MODES[mode].ai ? '电脑白子' : '白后行') + '</span></div></div>' +
    '<div class="ov-actions">' +
    (keep ? '<button class="primary" data-act="resume">继续上一局</button>' : '') +
    '<button class="' + (keep ? 'ghost' : 'primary') + '" data-act="start">开一局</button></div>';
  overlay.classList.add('show');
}

function showResult() {
  const c = counts(bd);
  const ai = MODES[mode].ai;
  let emoji = '🤝', title = '平局';
  if (winner) {
    const good = ai ? winner === HUMAN : true;
    emoji = good ? '🎉' : '💀';
    title = ai ? (good ? '你赢了' : '电脑赢了') : NAME[winner] + '胜';
  }
  overlayContent.innerHTML = '<div class="ov-emoji">' + emoji + '</div><h2>' + title + '</h2>' +
    '<div class="vs"><div class="b1c"><b>' + c.blk + '</b><span>黑子</span></div><em>vs</em>' +
    '<div class="w1c"><b>' + c.wht + '</b><span>白子</span></div></div>' +
    '<p class="hint">' + (c.empty ? '还剩 ' + c.empty + ' 格' : '棋盘下满') + ' · 共 ' + history.length + ' 手' +
    (ai ? ' · 最长连胜 ' + bestStreak : ' · 总比分 黑 ' + sess.b + ' : ' + sess.w + ' 白') + '</p>' +
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
  g.addColorStop(0, '#14624a');
  g.addColorStop(0.5, '#0e4d3a');
  g.addColorStop(1, '#0a3b2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, W);
  ctx.strokeStyle = 'rgba(2, 20, 14, 0.55)';
  ctx.lineWidth = 1.4;
  for (let k = 1; k < N; k++) {
    ctx.beginPath(); ctx.moveTo(k * CELL, 0); ctx.lineTo(k * CELL, W); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, k * CELL); ctx.lineTo(W, k * CELL); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(2, 20, 14, 0.6)';
  for (const [c, r] of [[2, 2], [6, 2], [2, 6], [6, 6]]) {
    ctx.beginPath(); ctx.arc(c * CELL, r * CELL, 4, 0, Math.PI * 2); ctx.fill();
  }
}

function drawDisc(i, color, sx, sy, alpha, ring, rScale) {
  const cx = cs(i) * CELL + CELL / 2;
  const cy = rs(i) * CELL + CELL / 2;
  const base = CELL * 0.42 * (rScale || 1);
  const rx = base * sx;
  if (rx <= 0.4) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 3;
  const g = ctx.createRadialGradient(cx - rx * 0.35, cy - base * 0.4, base * 0.15, cx, cy, base);
  if (color === BLACK) {
    g.addColorStop(0, '#5a6472');
    g.addColorStop(0.5, '#1c232f');
    g.addColorStop(1, '#05080e');
  } else {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#eef2f7');
    g.addColorStop(1, '#aab4c3');
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, base * 0.98, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (ring) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 3, base * 0.98 + 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, W);
  drawBoard();
  const pulse = 0.5 + 0.5 * Math.sin(tNow * 4);
  const ai = MODES[mode].ai;
  const showHints = phase === 'play' && !thinking && !(ai && turn === WHITE);
  const legal = showHints ? legalList(bd, turn) : [];

  for (const m of legal) {
    ctx.fillStyle = 'rgba(250, 250, 250, 0.13)';
    ctx.beginPath();
    ctx.arc(m % N * CELL + CELL / 2, ((m / N) | 0) * CELL + CELL / 2, CELL * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(167, 243, 208, ' + (0.3 + 0.3 * pulse).toFixed(3) + ')';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // 悬停预览：会翻哪些子
  if (showHints && hoverIdx >= 0 && legal.indexOf(hoverIdx) >= 0) {
    const preview = flipsAt(bd, hoverIdx, turn);
    ctx.save();
    ctx.globalAlpha = 0.42;
    drawDisc(hoverIdx, turn, 1, 1, 0.42);
    ctx.restore();
    for (const j of preview) {
      ctx.strokeStyle = 'rgba(251, 191, 36, ' + (0.55 + 0.4 * pulse).toFixed(3) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(j % N * CELL + CELL / 2, ((j / N) | 0) * CELL + CELL / 2, CELL * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (hintIdx >= 0 && phase === 'play') {
    ctx.strokeStyle = 'rgba(34, 211, 238, ' + (0.5 + 0.5 * pulse).toFixed(3) + ')';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(hintIdx % N * CELL + CELL / 2, ((hintIdx / N) | 0) * CELL + CELL / 2, CELL * 0.47, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (let i = 0; i < CELLS; i++) {
    const v = bd[i];
    if (!v) continue;
    let sx = 1;
    const a = anim[i];
    if (a) {
      const k = (tNow - a.t0) / 0.28;
      if (k >= 1) delete anim[i];
      else {
        const flip = k < 0.5;
        sx = Math.abs(Math.cos(k * Math.PI));
        drawDisc(i, flip ? a.from : v, Math.max(0.04, sx), 1, 1);
        continue;
      }
    }
    drawDisc(i, v, sx, 1, 1);
  }

  const last = history[history.length - 1];
  if (last && phase !== 'over') {
    drawDisc(last.i, bd[last.i], 1, 1, 1, 'rgba(248, 113, 113, ' + (0.45 + 0.5 * pulse).toFixed(3) + ')');
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
function cellFrom(ev) {
  const rect = cv.getBoundingClientRect();
  const s = (rect.width || W) / W;
  const x = ((ev.clientX || 0) - rect.left) / s;
  const y = ((ev.clientY || 0) - rect.top) / s;
  const c = clamp(Math.floor(x / CELL), 0, N - 1);
  const r = clamp(Math.floor(y / CELL), 0, N - 1);
  if (x < 0 || y < 0 || x >= W || y >= W) return -1;
  return r * N + c;
}

cv.addEventListener('pointerdown', (e) => {
  sfx.resume();
  if (phase !== 'play' || thinking || isAiTurn()) return;
  const i = cellFrom(e);
  if (i < 0 || bd[i]) return;
  if (legalList(bd, turn).indexOf(i) < 0) { sfx.tone(180, 0.08, 'sine', 0.12); return; }
  commit(i);
});
cv.addEventListener('pointermove', (e) => { hoverIdx = cellFrom(e); });
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
  store.set('reversi.mode', mode);
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
  if (k === 'u' || k === 'U') { sfx.resume(); undo(); e.preventDefault(); }
  else if (k === 'h' || k === 'H') { sfx.resume(); hint(); e.preventDefault(); }
  else if (k === 'r' || k === 'R') { resign(); e.preventDefault(); }
  else if (k === 'n' || k === 'N') { newGame('play'); e.preventDefault(); }
});

window.addEventListener('resize', resize);
/* ==================== 启动 ==================== */
markMode();
resize();
let saved = null;
try { saved = JSON.parse(store.get('reversi.save') || 'null'); } catch (e) { saved = null; }
const keep = !!(saved && MODES[saved.m] && restore(saved) && phase === 'play' && history.length);
if (!keep) newGame('intro');
else {
  hud();
  if (isAiTurn()) scheduleAi();               // 轮到电脑时接着想
}
showIntro(keep);
requestAnimationFrame((t) => { frame.last = t; frame(t); });

})();
