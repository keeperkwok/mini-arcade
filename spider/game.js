(() => {
'use strict';

/* ==================== 常量与元素 ==================== */
const SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'];
const RANK_TEXT = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RED_SUIT = [false, true, true, false];
const COLS = 10;
const SETS = 8;                       // 需要凑齐 8 组 K→A
const HISTORY_MAX = 400;
const START_SCORE = 500;

const wrapEl = document.getElementById('boardWrap');
const boardEl = document.getElementById('board');
const layerEl = document.getElementById('layer');
const overlayEl = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const scoreEl = document.getElementById('score');
const timeEl = document.getElementById('time');
const bestEl = document.getElementById('best');
const btnSound = document.getElementById('btnSound');
const btnHint = document.getElementById('btnHint');
const btnUndo = document.getElementById('btnUndo');
const btnNew = document.getElementById('btnNew');
const modeEl = document.getElementById('mode');

/* ==================== 状态 ==================== */
let suitMode = +(localStorage.getItem('spider.suits') || 4);
if ([1, 2, 4].indexOf(suitMode) < 0) suitMode = 4;
let muted = localStorage.getItem('spider.muted') === '1';

const P = { stock: [[]], foundation: [], tableau: [] };
for (let i = 0; i < SETS; i++) P.foundation.push([]);
for (let i = 0; i < COLS; i++) P.tableau.push([]);
const KINDS = ['stock', 'foundation', 'tableau'];

const cardsById = new Map();
const elsById = new Map();
const posById = new Map();
let slots = [];
let geo = null;

let score = START_SCORE, seconds = 0, timerId = null, running = false;
let over = false, busy = false;
let history = [];
let sel = null;
let drag = null;
let lastMove = null;
let hintTimer = null;
let lastTap = { id: -1, at: 0 };

/* ==================== 音效 ==================== */
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function tone(freq, dur, type = 'sine', vol = 0.15, delay = 0, slideTo = 0) {
  if (muted || !audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}
const soundFlip = () => tone(640, 0.06, 'triangle', 0.06, 0, 420);
const soundPick = () => tone(420, 0.05, 'sine', 0.07, 0, 560);
const soundPlace = () => { tone(300, 0.05, 'square', 0.05); tone(500, 0.05, 'triangle', 0.05, 0.03); };
const soundBad = () => tone(150, 0.14, 'sawtooth', 0.09, 0, 90);
const soundDeal = () => { for (let i = 0; i < 10; i++) tone(420 + i * 26, 0.04, 'triangle', 0.05, i * 0.035); };
const soundSet = () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.14, 'triangle', 0.12, i * 0.07));
const soundWin = () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, i * 0.11));
const unlockAudio = () => {
  ensureAudio();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

/* ==================== 工具 ==================== */
const tr = (x, y) => 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
const isRed = (c) => RED_SUIT[c.s];

function fmt(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/* ==================== 建牌与发牌 ==================== */
function buildDeck() {
  cardsById.clear();
  elsById.clear();
  posById.clear();
  layerEl.innerHTML = '';
  slots = [];

  const addSlot = (kind, i, extra) => {
    const el = document.createElement('div');
    el.className = 'slot' + (extra ? ' ' + extra : '');
    el.dataset.kind = kind;
    el.dataset.i = i;
    layerEl.appendChild(el);
    slots.push({ kind, i, el });
  };
  for (let i = 0; i < SETS; i++) addSlot('foundation', i, 'foundation');
  addSlot('stock', 0, 'stockslot');
  for (let i = 0; i < COLS; i++) addSlot('tableau', i, 'tableauslot');

  const pool = [];
  for (let i = 0; i < SETS; i++) pool.push(i % suitMode);
  let id = 0;
  for (const s of pool) {
    for (let r = 0; r < 13; r++) {
      const card = { id: id++, r, s, up: false };
      cardsById.set(card.id, card);
      const el = document.createElement('div');
      el.className = 'card' + (isRed(card) ? ' red' : '');
      el.dataset.id = card.id;
      const label = RANK_TEXT[r] + '<i>' + SUITS[s] + '</i>';
      el.innerHTML =
        '<div class="card-inner">' +
          '<div class="c-front">' +
            '<b class="c-tl">' + label + '</b>' +
            '<b class="c-br">' + label + '</b>' +
            '<b class="c-pip">' + SUITS[s] + '</b>' +
          '</div>' +
          '<div class="c-back"></div>' +
        '</div>';
      elsById.set(card.id, el);
      layerEl.appendChild(el);
    }
  }
}

function deal() {
  KINDS.forEach((k) => P[k].forEach((pile) => { pile.length = 0; }));
  const deck = [];
  for (let i = 0; i < 104; i++) {
    const c = cardsById.get(i);
    c.up = false;
    deck.push(c);
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  let n = 0;
  for (let col = 0; col < COLS; col++) {
    const size = col < 4 ? 6 : 5;
    for (let k = 0; k < size; k++) {
      const c = deck[n++];
      c.up = k === size - 1;
      P.tableau[col].push(c);
    }
  }
  while (n < deck.length) P.stock[0].push(deck[n++]);
  score = START_SCORE;
  seconds = 0;
  over = false;
  busy = false;
  sel = null;
  drag = null;
  lastMove = null;
  history = [];
  stopTimer();
  hideOverlay();
  slots.forEach((s) => s.el.classList.remove('setdone'));
}

/* ==================== 布局 ==================== */
function computeGeo() {
  const availW = Math.max(300, Math.min(wrapEl.clientWidth || 700, 900) - 20);
  let cw = Math.floor(availW / 10.7);
  let gapX = Math.max(3, Math.round(cw * 0.07));
  cw = Math.max(28, Math.min(92, Math.floor((availW - (COLS - 1) * gapX) / COLS)));
  gapX = Math.max(3, Math.min(Math.round(cw * 0.07), Math.floor((availW - COLS * cw) / (COLS - 1)) || 3));
  const ch = Math.round(cw * 1.42);
  const gapY = Math.max(8, Math.round(ch * 0.16));
  const boardW = COLS * cw + (COLS - 1) * gapX;
  const tabY = ch + gapY;
  const downOff = Math.max(5, Math.round(ch * 0.08));

  const wrapTop = wrapEl.getBoundingClientRect().top;
  const availH = Math.max(360, Math.min(1000, window.innerHeight - wrapTop - 30)) - 20;
  let upOff = Math.round(ch * 0.28);
  for (const pile of P.tableau) {
    const d = downCount(pile);
    const u = pile.length - d;
    if (u > 1) {
      const room = availH - tabY - ch - d * downOff;
      upOff = Math.min(upOff, Math.floor(room / (u - 1)));
    }
  }
  upOff = Math.max(9, Math.min(upOff, Math.round(ch * 0.28)));

  let maxBottom = tabY + ch;
  for (const pile of P.tableau) {
    const d = downCount(pile);
    const u = pile.length - d;
    maxBottom = Math.max(maxBottom, tabY + d * downOff + Math.max(0, u - 1) * upOff + ch);
  }
  return { cw, ch, gapX, gapY, boardW, boardH: maxBottom + 4, tabY, downOff, upOff };
}

function pileXY(kind, i, g) {
  if (kind === 'stock') return [(COLS - 1) * (g.cw + g.gapX), 0];
  if (kind === 'foundation') return [i * (g.cw + g.gapX), 0];
  return [i * (g.cw + g.gapX), g.tabY];
}

function downCount(pile) { return pile.reduce((n, c) => (c.up ? n : n + 1), 0); }

function layout() {
  const g = computeGeo();
  geo = g;
  boardEl.style.width = g.boardW + 'px';
  boardEl.style.height = g.boardH + 'px';
  boardEl.style.setProperty('--cw', g.cw + 'px');
  boardEl.style.setProperty('--ch', g.ch + 'px');

  const dealsLeft = Math.ceil(P.stock[0].length / COLS);
  for (const s of slots) {
    const [x, y] = pileXY(s.kind, s.i, g);
    s.el.style.transform = tr(x, y);
    if (s.kind === 'stock') s.el.textContent = dealsLeft ? String(dealsLeft) : '';
    if (s.kind === 'foundation') s.el.textContent = P.foundation[s.i].length ? SUITS[P.foundation[s.i][0].s] : '';
  }

  posById.clear();
  for (const kind of KINDS) {
    const base = kind === 'tableau' ? 200 : kind === 'foundation' ? 60 : 90;
    P[kind].forEach((pile, i) => {
      const [px, py] = pileXY(kind, i, g);
      const d = downCount(pile);
      pile.forEach((c, index) => {
        const el = elsById.get(c.id);
        let x = px, y = py;
        if (kind === 'tableau') y += index < d ? index * g.downOff : d * g.downOff + (index - d) * g.upOff;
        const selected = !!sel && !drag && sel.kind === kind && sel.i === i && index >= sel.index;
        if (selected) y -= 7;
        if (drag && drag.cards.indexOf(c) !== -1) return;
        posById.set(c.id, [x, y]);
        el.style.transform = tr(x, y);
        el.style.zIndex = base + index;
        el.classList.toggle('up', c.up);
        el.classList.toggle('sel', selected);
      });
    });
  }
}

/* ==================== 规则 ==================== */
function locate(id) {
  for (const kind of KINDS) {
    const piles = P[kind];
    for (let i = 0; i < piles.length; i++) {
      const index = piles[i].findIndex((c) => c.id === id);
      if (index >= 0) return { kind, i, index };
    }
  }
  return null;
}

// Spider：只能搬动“同花色降序连牌”
function movableGroup(ref) {
  const pile = P[ref.kind][ref.i];
  if (!pile.length || ref.index < 0 || ref.index >= pile.length) return null;
  if (ref.kind === 'stock') return null;
  if (ref.kind === 'foundation') return null;
  const group = pile.slice(ref.index);
  for (let k = 0; k < group.length; k++) {
    if (!group[k].up) return null;
    if (k > 0) {
      const a = group[k - 1], b = group[k];
      if (a.r !== b.r + 1 || a.s !== b.s) return null;
    }
  }
  return group;
}

function canAccept(src, dst) {
  if (src.kind === dst.kind && src.i === dst.i) return false;
  if (dst.kind !== 'tableau') return false;
  const group = movableGroup(src);
  if (!group) return false;
  const first = group[0];
  const pile = P.tableau[dst.i];
  if (!pile.length) return true;
  const top = pile[pile.length - 1];
  return top.up && top.r === first.r + 1;
}

/* ==================== 行为 ==================== */
function pushHistory() {
  history.push({
    score,
    p: KINDS.map((k) => P[k].map((pile) => pile.map((c) => [c.id, c.up ? 1 : 0]))),
  });
  if (history.length > HISTORY_MAX) history.shift();
}

function undo() {
  if (!history.length || busy) return;
  const snap = history.pop();
  score = snap.score;
  KINDS.forEach((kind, ki) => {
    P[kind].forEach((pile, i) => {
      pile.length = 0;
      snap.p[ki][i].forEach((rec) => {
        const c = cardsById.get(rec[0]);
        c.up = !!rec[1];
        pile.push(c);
      });
    });
  });
  sel = null;
  lastMove = null;
  over = false;
  hideOverlay();
  refreshSetSlots();
  layout();
  syncUI();
  tone(360, 0.07, 'sine', 0.06, 0, 260);
}

function refreshSetSlots() {
  slots.forEach((s) => {
    if (s.kind === 'foundation') s.el.classList.toggle('setdone', P.foundation[s.i].length > 0);
  });
}

function commitMove(src, dst) {
  pushHistory();
  const from = P[src.kind][src.i];
  const moved = from.splice(src.index);
  P[dst.kind][dst.i].push(...moved);
  lastMove = { card: moved[0].id, n: moved.length, fk: src.kind, fi: src.i, tk: dst.kind, ti: dst.i };
  let revealed = false;
  if (src.kind === 'tableau') {
    const pile = P.tableau[src.i];
    const top = pile[pile.length - 1];
    if (top && !top.up) { top.up = true; revealed = true; }
  }
  ensureTimer();
  addScore(-1);
  soundPlace();
  if (revealed) setTimeout(soundFlip, 100);
  sel = null;
  clearHint();
  layout();
  syncUI();
  collectFinishedSets(() => afterAction());
}

// 收走完成的 K→A 同花色连牌
function collectFinishedSets(cb) {
  let collected = false;
  const finish = () => {
    if (!collected) { if (cb) cb(); return; }
    setTimeout(() => collectFinishedSets(cb), 150);
  };
  for (let i = 0; i < COLS; i++) {
    const pile = P.tableau[i];
    if (pile.length < 13) continue;
    const start = pile.length - 13;
    const tail = pile.slice(start);
    if (tail.some((c) => !c.up)) continue;
    const s = tail[0].s;
    let ok = true;
    for (let k = 0; k < 13; k++) {
      if (tail[k].s !== s || tail[k].r !== 12 - k) { ok = false; break; }
    }
    if (!ok) continue;
    const slot = P.foundation.findIndex((f) => !f.length);
    if (slot < 0) continue;
    pile.splice(start);
    P.foundation[slot].push(...tail);
    const top = pile[pile.length - 1];
    if (top && !top.up) top.up = true;
    collected = true;
    addScore(100);
    soundSet();
    refreshSetSlots();
    layout();
    break;
  }
  finish();
}

function dealFromStock() {
  if (over || busy) return;
  const stock = P.stock[0];
  if (!stock.length) { soundBad(); return; }
  const emptyCol = P.tableau.findIndex((pile) => !pile.length);
  if (emptyCol >= 0) {
    toast('第 ' + (emptyCol + 1) + ' 列是空的，先补满才能发牌');
    soundBad();
    const slot = slots.find((s) => s.kind === 'stock' && s.i === 0);
    slot.el.classList.add('shake');
    setTimeout(() => slot.el.classList.remove('shake'), 320);
    return;
  }
  pushHistory();
  for (let i = 0; i < COLS && stock.length; i++) {
    const c = stock.pop();
    c.up = true;
    P.tableau[i].push(c);
  }
  ensureTimer();
  soundDeal();
  sel = null;
  clearHint();
  layout();
  syncUI();
  collectFinishedSets(() => afterAction());
}

function autoPlace(ref) {
  const group = movableGroup(ref);
  if (!group) return false;
  const first = group[0];
  let best = -1, bestRank = -1;
  for (let i = 0; i < COLS; i++) {
    if (i === ref.i) continue;
    if (ref.index === 0 && !P.tableau[i].length) continue;   // 整列挪到空列没有意义
    if (!canAccept(ref, { kind: 'tableau', i })) continue;
    const pile = P.tableau[i];
    let rank;
    if (!pile.length) rank = 1;
    else rank = (pile[pile.length - 1].s === first.s ? 10 : 5) + (pile.length > 1 ? 1 : 0);
    if (rank > bestRank) { bestRank = rank; best = i; }
  }
  if (best < 0) return false;
  commitMove(ref, { kind: 'tableau', i: best });
  return true;
}

function afterAction() {
  if (P.foundation.reduce((n, f) => n + f.length, 0) === 104) { win(); return; }
  if (over) return;
  if (!findMoves().length && !P.stock[0].length) {
    const sets = P.foundation.filter((f) => f.length).length;
    over = true;
    stopTimer();
    showOverlay('<div class="ov-emoji">🕸️</div><h2>没有可走的牌了</h2>' +
      '<p class="hint-text">已完成 ' + sets + ' / 8 组同花色 K→A<br>撤销一步，或者重新开局</p>' +
      '<button class="primary" data-act="undo">↶ 撤销一步</button>');
    soundBad();
  }
}

/* ==================== 提示 ==================== */
function findMoves() {
  const srcs = [];
  for (let i = 0; i < COLS; i++) {
    const pile = P.tableau[i];
    for (let k = downCount(pile); k < pile.length; k++) srcs.push({ kind: 'tableau', i, index: k });
  }
  const list = [];
  for (const from of srcs) {
    const group = movableGroup(from);
    if (!group) continue;
    const back = !!lastMove && group.length === lastMove.n && group[0].id === lastMove.card &&
      from.kind === lastMove.tk && from.i === lastMove.ti;
    for (let i = 0; i < COLS; i++) {
      const to = { kind: 'tableau', i };
      if (!canAccept(from, to)) continue;
      if (back && to.i === lastMove.fi) continue;
      if (to.i === from.i) continue;
      if (from.index === 0 && !P.tableau[to.i].length) continue;      // 整列搬到空列没有意义
      const dst = P.tableau[to.i];
      let rank = 5;
      if (dst.length && dst[dst.length - 1].s === group[0].s) rank += 20;   // 同花色衔接最有价值
      if (from.index === downCount(P.tableau[from.i])) rank += 12;          // 能翻出暗牌
      if (group.length >= 13) rank += 30;                                   // 只差一步收尾
      if (!dst.length) rank -= 6;
      list.push({ from, to, rank });
    }
  }
  list.sort((a, b) => b.rank - a.rank);
  return list;
}

function showHint() {
  if (over || busy) return;
  clearHint();
  const moves = findMoves();
  if (!moves.length) {
    toast(P.stock[0].length ? '没有可走的牌，先点右下角发牌 🔽' : '没有可走的牌了');
    soundBad();
    return;
  }
  const m = moves[0];
  movableGroup(m.from).forEach((c) => elsById.get(c.id).classList.add('hint'));
  const slot = slots.find((s) => s.kind === m.to.kind && s.i === m.to.i);
  if (slot) slot.el.classList.add('dst');
  hintTimer = setTimeout(clearHint, 1800);
  tone(880, 0.08, 'sine', 0.05, 0, 1200);
}

function clearHint() {
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  layerEl.querySelectorAll('.hint').forEach((el) => el.classList.remove('hint'));
  slots.forEach((s) => s.el.classList.remove('dst'));
}

/* ==================== 计分 / 计时 / 界面 ==================== */
function bestKey() { return 'spider.best.' + suitMode; }
function bestScore() { return +(localStorage.getItem(bestKey()) || START_SCORE); }

function addScore(delta) {
  score = Math.max(0, score + delta);
  scoreEl.textContent = score;
  if (delta > 0) {
    scoreEl.classList.remove('pop');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('pop');
  }
}

function ensureTimer() {
  if (running || over) return;
  running = true;
  timerId = setInterval(() => {
    seconds += 1;
    timeEl.textContent = fmt(seconds);
  }, 1000);
}
function stopTimer() {
  running = false;
  if (timerId) { clearInterval(timerId); timerId = null; }
}

function syncUI() {
  scoreEl.textContent = score;
  bestEl.textContent = Math.max(bestScore(), score);
  timeEl.textContent = fmt(seconds);
  btnUndo.disabled = !history.length;
}

function showOverlay(html) {
  overlayContent.innerHTML = html;
  overlayEl.classList.add('show');
}
function hideOverlay() { overlayEl.classList.remove('show'); }

let toastEl = null, toastTimer = null;
function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.querySelector('.board-outer').appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1900);
}

function win() {
  over = true;
  stopTimer();
  const prev = bestScore();
  const isBest = score > prev;
  if (isBest) localStorage.setItem(bestKey(), String(score));
  confetti();
  soundWin();
  showOverlay('<div class="ov-emoji">🏆</div><h2>八组收齐，通关！</h2>' +
    '<div class="final-score">' + score + '<span> 分</span></div>' +
    '<p class="final-sub">用时 ' + fmt(seconds) + ' · ' + suitMode + ' 花色难度</p>' +
    (isBest ? '<p class="newbest">🏆 新纪录！</p>' : '') +
    '<button class="primary" data-act="new">再来一局</button>');
  syncUI();
}

function confetti(n) {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#34d399', '#22d3ee', '#fbbf24', '#f472b6', '#a78bfd'];
  for (let i = 0; i < (n || 90); i++) {
    const s = document.createElement('i');
    s.style.left = (Math.random() * 100) + '%';
    s.style.background = colors[i % colors.length];
    s.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    s.style.setProperty('--dy', (geo.boardH + 80) + 'px');
    s.style.setProperty('--rot', (Math.random() * 1000 - 500) + 'deg');
    s.style.animationDuration = (1.6 + Math.random() * 1.6) + 's';
    s.style.animationDelay = (Math.random() * 0.7) + 's';
    box.appendChild(s);
  }
  document.querySelector('.board-outer').appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

/* ==================== 指针交互 ==================== */
function boardPoint(ev) {
  const rect = boardEl.getBoundingClientRect();
  return [ev.clientX - rect.left, ev.clientY - rect.top];
}

function dropTarget(cx, cy) {
  const g = geo;
  if (cy < g.tabY - g.ch * 0.4) return null;          // 顶部功能行不作为落点
  for (let i = 0; i < COLS; i++) {
    const [x] = pileXY('tableau', i, g);
    if (cx >= x - g.gapX / 2 - 1 && cx <= x + g.cw + g.gapX / 2 + 1) return { kind: 'tableau', i };
  }
  return null;
}

function onDown(ev) {
  if (over || busy) return;
  const cardEl = ev.target.closest('.card');
  const slotEl = ev.target.closest('.slot');
  if (cardEl) {
    const loc = locate(+cardEl.dataset.id);
    if (!loc) return;
    if (loc.kind === 'stock') { ev.preventDefault(); dealFromStock(); return; }
    if (loc.kind !== 'tableau') { if (sel) { flash(cardEl); } return; }
    const group = movableGroup(loc);
    if (!group) {
      if (sel && canAccept(sel, { kind: 'tableau', i: loc.i })) { commitMove(sel, { kind: 'tableau', i: loc.i }); return; }
      flash(cardEl);
      return;
    }
    const [px, py] = boardPoint(ev);
    const cur = posById.get(group[0].id) || [px, py];
    drag = { loc, cards: group, dx: px - cur[0], dy: py - cur[1], sx: px, sy: py, moved: false };
    ev.preventDefault();
    return;
  }
  if (slotEl) {
    const kind = slotEl.dataset.kind;
    const i = +slotEl.dataset.i;
    if (kind === 'stock') { dealFromStock(); return; }
    if (kind === 'foundation') return;
    if (sel) {
      const dst = { kind: 'tableau', i };
      if (canAccept(sel, dst)) commitMove(sel, dst);
      else { sel = null; layout(); }
    }
  }
}

function onMove(ev) {
  if (!drag) return;
  const [px, py] = boardPoint(ev);
  if (!drag.moved) {
    if (Math.abs(px - drag.sx) + Math.abs(py - drag.sy) < 7) return;
    drag.moved = true;
    sel = null;
    layout();
    drag.cards.forEach((c, j) => {
      const el = elsById.get(c.id);
      el.classList.add('dragging', 'no-anim');
      el.style.zIndex = 2000 + j;
    });
  }
  const x = px - drag.dx;
  const y = py - drag.dy;
  const stackOff = Math.max(10, Math.round(geo.ch * 0.2));
  drag.cards.forEach((c, j) => { elsById.get(c.id).style.transform = tr(x, y + j * stackOff); });
  const dst = dropTarget(x + geo.cw / 2, y + geo.ch / 2);
  const ok = dst && canAccept(drag.loc, dst);
  slots.forEach((s) => s.el.classList.toggle('dst', !!ok && s.kind === dst.kind && s.i === dst.i));
}

function onUp(ev) {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.cards.forEach((c) => elsById.get(c.id).classList.remove('dragging', 'no-anim'));
  slots.forEach((s) => s.el.classList.remove('dst'));
  if (!d.moved) { handleTap(d.loc); return; }
  const [px, py] = boardPoint(ev);
  const dst = dropTarget(px - d.dx + geo.cw / 2, py - d.dy + geo.ch / 2);
  if (dst && canAccept(d.loc, dst)) commitMove(d.loc, dst);
  else { layout(); tone(200, 0.07, 'sine', 0.05, 0, 150); }
}

function handleTap(loc) {
  if (loc.kind !== 'tableau') { sel = null; layout(); return; }
  const pile = P.tableau[loc.i];
  const card = pile[loc.index];
  const now = performance.now();
  const dbl = lastTap.id === card.id && now - lastTap.at < 340;
  lastTap = { id: card.id, at: now };
  if (dbl) {
    sel = null;
    if (autoPlace(loc)) { lastTap.id = -1; return; }
  }
  if (sel && sel.kind === loc.kind && sel.i === loc.i && sel.index === loc.index) { sel = null; layout(); return; }
  if (sel && canAccept(sel, { kind: 'tableau', i: loc.i })) {
    const from = sel;
    commitMove(from, { kind: 'tableau', i: loc.i });
    return;
  }
  sel = { kind: 'tableau', i: loc.i, index: loc.index };
  soundPick();
  layout();
}

function flash(el) {
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 320);
  soundBad();
}

/* ==================== 启动 ==================== */
function setMode(n) {
  suitMode = [1, 2, 4].indexOf(n) >= 0 ? n : 4;
  localStorage.setItem('spider.suits', String(suitMode));
  modeEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.suits === suitMode));
  bestEl.textContent = bestScore();
}

function startGame() {
  deal();
  layout();
  syncUI();
}

btnSound.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('spider.muted', muted ? '1' : '0');
  btnSound.textContent = muted ? '🔇' : '🔊';
  btnSound.classList.toggle('active', muted);
});
btnHint.addEventListener('click', showHint);
btnUndo.addEventListener('click', undo);
btnNew.addEventListener('click', startGame);
modeEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-suits]');
  if (!b) return;
  setMode(+b.dataset.suits);
  buildDeck();
  startGame();
});
overlayContent.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  hideOverlay();
  if (btn.dataset.act === 'undo') { undo(); return; }
  startGame();
});

layerEl.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'n') startGame();
  else if (k === 'z' || k === 'u') undo();
  else if (k === 'h') showHint();
  else if (k === ' ' || k === 'arrowdown') { e.preventDefault(); dealFromStock(); }
  else if (k === 'escape') { sel = null; clearHint(); layout(); }
});

let rafId = null;
window.addEventListener('resize', () => {
  if (rafId) return;
  rafId = requestAnimationFrame(() => { rafId = null; layout(); });
});

btnSound.textContent = muted ? '🔇' : '🔊';
btnSound.classList.toggle('active', muted);
setMode(suitMode);
buildDeck();
deal();
layout();
syncUI();

})();
