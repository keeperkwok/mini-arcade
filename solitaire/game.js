(() => {
'use strict';

/* ==================== 常量与元素 ==================== */
const SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'];   // ♠ ♥ ♦ ♣
const RANK_TEXT = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RED_SUIT = [false, true, true, false];
const KINDS = ['stock', 'waste', 'foundation', 'tableau'];
const KIND_LEN = { stock: 1, waste: 1, foundation: 4, tableau: 7 };
const HISTORY_MAX = 400;

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
const btnAuto = document.getElementById('btnAuto');
const btnNew = document.getElementById('btnNew');
const modeEl = document.getElementById('mode');

/* ==================== 状态 ==================== */
let drawCount = localStorage.getItem('klondike.draw') === '3' ? 3 : 1;
let muted = localStorage.getItem('klondike.muted') === '1';

const P = {
  stock: [[]],
  waste: [[]],
  foundation: [[], [], [], []],
  tableau: [[], [], [], [], [], [], []],
};

const cardsById = new Map();   // id -> { id, r, s, up }
const elsById = new Map();     // id -> DOM
const posById = new Map();     // id -> [x, y]
let slots = [];                // { kind, i, el }
let geo = null;

let score = 0, seconds = 0, timerId = null, running = false;
let over = false, busy = false;
let history = [];
let sel = null;                // { kind, i, index }
let drag = null;
let lastMove = null;           // 上一步：让提示避免来回倒牌
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
const soundFlip = () => tone(660, 0.06, 'triangle', 0.07, 0, 420);
const soundPick = () => tone(420, 0.05, 'sine', 0.08, 0, 560);
const soundPlace = () => { tone(300, 0.05, 'square', 0.05); tone(520, 0.05, 'triangle', 0.06, 0.03); };
const soundBad = () => tone(150, 0.14, 'sawtooth', 0.09, 0, 90);
const soundScore = () => [784, 1047].forEach((f, i) => tone(f, 0.09, 'triangle', 0.09, i * 0.06));
const soundWin = () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.13, i * 0.11));
const unlockAudio = () => {
  ensureAudio();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

/* ==================== 工具 ==================== */
const tr = (x, y) => 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
const pileOf = (ref) => P[ref.kind][ref.i];
const downCount = (pile) => pile.reduce((n, c) => (c.up ? n : n + 1), 0);
const isRed = (card) => RED_SUIT[card.s];

function fmt(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/* ==================== 建牌 ==================== */
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
  addSlot('stock', 0, 'stockslot');
  addSlot('waste', 0, 'wasteslot');
  for (let i = 0; i < 4; i++) addSlot('foundation', i, 'foundation');
  for (let i = 0; i < 7; i++) addSlot('tableau', i, 'tableauslot');

  for (let s = 0; s < 4; s++) {
    for (let r = 0; r < 13; r++) {
      const card = { id: s * 13 + r, r, s, up: false };
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
  for (let id = 0; id < 52; id++) {
    const c = cardsById.get(id);
    c.up = false;
    deck.push(c);
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  let n = 0;
  for (let col = 0; col < 7; col++) {
    for (let k = 0; k <= col; k++) {
      const c = deck[n++];
      c.up = k === col;
      P.tableau[col].push(c);
    }
  }
  while (n < deck.length) P.stock[0].push(deck[n++]);
  score = 0;
  seconds = 0;
  over = false;
  busy = false;
  sel = null;
  drag = null;
  history = [];
  lastMove = null;
  stopTimer();
  hideOverlay();
}

/* ==================== 布局 ==================== */
function computeGeo() {
  const availW = Math.max(300, Math.min(wrapEl.clientWidth || 700, 780) - 22);
  const cw = Math.max(38, Math.min(98, Math.floor(availW / 7.72)));
  const ch = Math.round(cw * 1.42);
  const gapX = Math.max(4, Math.round(cw * 0.12));
  const gapY = Math.max(6, Math.round(ch * 0.14));
  const boardW = 7 * cw + 6 * gapX;
  const tabY = ch + gapY;
  const downOff = Math.max(7, Math.round(ch * 0.13));
  const fanX = Math.round(cw * 0.3);

  const wrapTop = wrapEl.getBoundingClientRect().top;
  const availH = Math.max(340, Math.min(940, window.innerHeight - wrapTop - 34)) - 20;
  let upOff = Math.round(ch * 0.32);
  for (const pile of P.tableau) {
    const d = downCount(pile);
    const u = pile.length - d;
    if (u > 1) {
      const room = availH - tabY - ch - d * downOff;
      upOff = Math.min(upOff, Math.floor(room / (u - 1)));
    }
  }
  upOff = Math.max(12, Math.min(upOff, Math.round(ch * 0.32)));

  let maxBottom = tabY + ch;
  for (const pile of P.tableau) {
    const d = downCount(pile);
    const u = pile.length - d;
    const bottom = tabY + d * downOff + Math.max(0, u - 1) * upOff + ch;
    maxBottom = Math.max(maxBottom, bottom);
  }
  return { cw, ch, gapX, gapY, boardW, boardH: maxBottom + 4, tabY, downOff, upOff, fanX };
}

function pileXY(kind, i, g) {
  if (kind === 'stock') return [0, 0];
  if (kind === 'waste') return [g.cw + g.gapX, 0];
  if (kind === 'foundation') return [g.boardW - (4 * g.cw + 3 * g.gapX) + i * (g.cw + g.gapX), 0];
  return [i * (g.cw + g.gapX), g.tabY];
}

function layout() {
  const g = computeGeo();
  geo = g;
  boardEl.style.width = g.boardW + 'px';
  boardEl.style.height = g.boardH + 'px';
  boardEl.style.setProperty('--cw', g.cw + 'px');
  boardEl.style.setProperty('--ch', g.ch + 'px');

  for (const s of slots) {
    const [x, y] = pileXY(s.kind, s.i, g);
    s.el.style.transform = tr(x, y);
  }

  posById.clear();
  for (const kind of KINDS) {
    const base = kind === 'tableau' ? 200 : kind === 'foundation' ? 60 : 90;
    P[kind].forEach((pile, i) => {
      const [px, py] = pileXY(kind, i, g);
      const d = downCount(pile);
      const hidden = kind === 'waste' ? Math.max(0, pile.length - 4) : 0;
      pile.forEach((c, index) => {
        const el = elsById.get(c.id);
        let x = px;
        let y = py;
        if (kind === 'tableau') {
          y += index < d ? index * g.downOff : d * g.downOff + (index - d) * g.upOff;
        } else if (kind === 'waste') {
          x += Math.max(0, index - hidden) * g.fanX;
        }
        const selected = !!sel && !drag && sel.kind === kind && sel.i === i && index >= sel.index;
        if (selected) y -= 8;
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

function movableGroup(ref) {
  const pile = pileOf(ref);
  if (!pile.length || ref.index < 0 || ref.index >= pile.length) return null;
  if (ref.kind === 'stock') return null;
  if (ref.kind === 'waste' || ref.kind === 'foundation') {
    return ref.index === pile.length - 1 ? pile.slice(ref.index) : null;
  }
  const group = pile.slice(ref.index);
  for (let k = 0; k < group.length; k++) {
    if (!group[k].up) return null;
    if (k > 0) {
      const a = group[k - 1], b = group[k];
      if (a.r !== b.r + 1 || isRed(a) === isRed(b)) return null;
    }
  }
  return group;
}

function canAccept(src, dst) {
  if (src.kind === dst.kind && src.i === dst.i) return false;
  if (dst.kind !== 'foundation' && dst.kind !== 'tableau') return false;
  if (src.kind === 'foundation' && dst.kind === 'foundation') return false;
  const group = movableGroup(src);
  if (!group) return false;
  const first = group[0];
  const pile = P[dst.kind][dst.i];
  if (dst.kind === 'foundation') {
    if (group.length > 1) return false;
    if (!pile.length) return first.r === 0;
    const top = pile[pile.length - 1];
    return top.s === first.s && top.r === first.r - 1;
  }
  if (dst.kind !== 'tableau') return false;
  if (!pile.length) return first.r === 12;
  const top = pile[pile.length - 1];
  return top.up && top.r === first.r + 1 && isRed(top) !== isRed(first);
}

function moveScore(src, dst) {
  if (dst.kind === 'foundation') return src.kind === 'waste' ? 10 : 10;
  if (src.kind === 'waste' && dst.kind === 'tableau') return 5;
  if (src.kind === 'foundation' && dst.kind === 'tableau') return -15;
  return 0;
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
  over = false;
  hideOverlay();
  lastMove = null;
  layout();
  syncUI();
  tone(360, 0.07, 'sine', 0.07, 0, 260);
}

function commitMove(src, dst) {
  pushHistory();
  const from = P[src.kind][src.i];
  const moved = from.splice(src.index);
  P[dst.kind][dst.i].push(...moved);
  lastMove = { card: moved[0].id, n: moved.length, fk: src.kind, fi: src.i, tk: dst.kind, ti: dst.i };
  let revealed = false;
  if (src.kind === 'tableau') {
    const top = P.tableau[src.i][P.tableau[src.i].length - 1];
    if (top && !top.up) { top.up = true; revealed = true; }
  }
  ensureTimer();
  addScore(moveScore(src, dst) + (revealed ? 5 : 0));
  if (dst.kind === 'foundation') soundScore(); else soundPlace();
  if (revealed) setTimeout(soundFlip, 110);
  sel = null;
  clearHint();
  layout();
  syncUI();
  afterAction();
}

function autoToFoundation(ref) {
  for (let i = 0; i < 4; i++) {
    if (canAccept(ref, { kind: 'foundation', i })) {
      commitMove(ref, { kind: 'foundation', i });
      return true;
    }
  }
  return false;
}

function clickStock() {
  if (over || busy) return;
  const stock = P.stock[0];
  const waste = P.waste[0];
  if (!stock.length) {
    if (!waste.length) { soundBad(); return; }
    pushHistory();
    for (let i = waste.length - 1; i >= 0; i--) {
      const c = waste[i];
      c.up = false;
      stock.push(c);
    }
    waste.length = 0;
    addScore(drawCount === 1 ? -100 : -7);
    tone(240, 0.16, 'triangle', 0.08, 0, 420);
  } else {
    pushHistory();
    const n = Math.min(drawCount, stock.length);
    for (let k = 0; k < n; k++) {
      const c = stock.pop();
      c.up = true;
      waste.push(c);
    }
    ensureTimer();
    soundFlip();
  }
  sel = null;
  clearHint();
  layout();
  syncUI();
  afterAction();
}

function afterAction() {
  if (P.foundation.reduce((n, f) => n + f.length, 0) === 52) { win(); return; }
  if (over) return;
  const dead = !findMoves().length && !P.stock[0].length && !P.waste[0].length;
  if (dead) {
    over = true;
    stopTimer();
    showOverlay('<div class="ov-emoji">🫥</div><h2>无路可走</h2>' +
      '<p class="hint-text">这一步没有可走的牌了<br>可以撤销重来，或者开新局</p>' +
      '<button class="primary" data-act="undo">↶ 撤销一步</button>');
    soundBad();
  }
}

/* ==================== 提示与自动收牌 ==================== */
function findMoves() {
  const srcs = [];
  if (P.waste[0].length) srcs.push({ kind: 'waste', i: 0, index: P.waste[0].length - 1 });
  for (let i = 0; i < 7; i++) {
    const pile = P.tableau[i];
    for (let k = downCount(pile); k < pile.length; k++) srcs.push({ kind: 'tableau', i, index: k });
  }
  // 提示不建议从顶牌堆取回（合法但几乎总是倒退，且会造成来回倒牌）
  const list = [];
  for (const from of srcs) {
    const group = movableGroup(from);
    if (!group) continue;
    // 刚刚做过的反向搬动不再作为提示，避免来回倒牌
    const back = !!lastMove && group.length === lastMove.n && group[0].id === lastMove.card &&
      from.kind === lastMove.tk && from.i === lastMove.ti;
    for (let i = 0; i < 4; i++) {
      const to = { kind: 'foundation', i };
      if (canAccept(from, to)) list.push({ from, to, rank: 100 });
    }
    for (let i = 0; i < 7; i++) {
      const to = { kind: 'tableau', i };
      if (!canAccept(from, to)) continue;
      if (back && to.kind === lastMove.fk && to.i === lastMove.fi) continue;
      const dst = P.tableau[i];
      let rank = 10;
      if (!dst.length) {
        if (from.kind !== 'tableau') rank = 6;
        else if (from.index === 0) continue;             // 整列 K 挪到空列没有意义
        else rank = 8;
      }
      if (from.kind === 'tableau' && from.index === downCount(P.tableau[from.i])) rank += 5; // 能翻出暗牌
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
    toast('没有可走的牌，试试翻牌堆 🔼');
    soundBad();
    return;
  }
  const m = moves[0];
  const group = movableGroup(m.from);
  group.forEach((c) => elsById.get(c.id).classList.add('hint'));
  const slot = slots.find((s) => s.kind === m.to.kind && s.i === m.to.i);
  if (slot) slot.el.classList.add('dst');
  hintTimer = setTimeout(clearHint, 1800);
  tone(880, 0.08, 'sine', 0.06, 0, 1200);
}

function clearHint() {
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  layerEl.querySelectorAll('.hint').forEach((el) => el.classList.remove('hint'));
  slots.forEach((s) => s.el.classList.remove('dst'));
}

function canAuto() {
  if (over || busy) return false;
  for (const pile of P.tableau) for (const c of pile) if (!c.up) return false;
  return !!findMoves().some((m) => m.to.kind === 'foundation');
}

function autoFinish() {
  if (!canAuto()) return;
  busy = true;
  btnAuto.classList.remove('show');
  const step = () => {
    const move = findMoves().find((m) => m.to.kind === 'foundation');
    if (!move) {
      busy = false;
      layout();
      syncUI();
      afterAction();
      return;
    }
    commitMove(move.from, move.to);
    setTimeout(step, 110);
  };
  step();
}

/* ==================== 计分 / 计时 / 界面 ==================== */
function bestKey() { return 'klondike.best.' + drawCount; }
function bestScore() { return +(localStorage.getItem(bestKey()) || 0); }

function addScore(delta) {
  if (!delta) return;
  const next = Math.max(0, score + delta);
  if (next !== score) {
    score = next;
    scoreEl.textContent = score;
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
  btnAuto.classList.toggle('show', canAuto());
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
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1700);
}

function win() {
  over = true;
  busy = false;
  stopTimer();
  const prev = bestScore();
  const isBest = score > prev;
  if (isBest) localStorage.setItem(bestKey(), String(score));
  confetti();
  soundWin();
  P.foundation.forEach((f, i) => {
    f.forEach((c, j) => {
      const el = elsById.get(c.id);
      setTimeout(() => {
        el.classList.add('win');
        setTimeout(() => el.classList.remove('win'), 700);
      }, (i * 13 + j) * 22);
    });
  });
  setTimeout(() => {
    showOverlay('<div class="ov-emoji">👑</div><h2>恭喜通关！</h2>' +
      '<div class="final-score">' + score + '<span> 分</span></div>' +
      '<p class="final-sub">用时 ' + fmt(seconds) + ' · 一次翻 ' + drawCount + ' 张</p>' +
      (isBest ? '<p class="newbest">🏆 新纪录！</p>' : '') +
      '<button class="primary" data-act="new">再来一局</button>');
  }, 900);
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
  for (let i = 0; i < 4; i++) {
    const [x, y] = pileXY('foundation', i, g);
    if (cx >= x - 6 && cx <= x + g.cw + 6 && cy >= y - 6 && cy <= y + g.ch + 6) return { kind: 'foundation', i };
  }
  const [wx] = pileXY('waste', 0, g);
  if (cx >= wx && cx <= wx + g.cw && cy < g.tabY) return null;
  if (cy < g.tabY - g.ch * 0.35) return null;
  for (let i = 0; i < 7; i++) {
    const [x] = pileXY('tableau', i, g);
    if (cx >= x - g.gapX / 2 && cx <= x + g.cw + g.gapX / 2) return { kind: 'tableau', i };
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
    if (loc.kind === 'stock') { ev.preventDefault(); clickStock(); return; }
    const group = movableGroup(loc);
    if (!group) {
      if (sel) {
        const dst = { kind: loc.kind, i: loc.i };
        if (canAccept(sel, dst)) { commitMove(sel, dst); return; }
      }
      flash(cardEl);
      return;
    }
    const [px, py] = boardPoint(ev);
    const cur = posById.get(group[0].id) || [px, py];
    drag = {
      loc, cards: group,
      dx: px - cur[0], dy: py - cur[1],
      sx: px, sy: py, moved: false,
    };
    ev.preventDefault();
    return;
  }
  if (slotEl) {
    const kind = slotEl.dataset.kind;
    const i = +slotEl.dataset.i;
    if (kind === 'stock') { clickStock(); return; }
    if (sel && kind !== 'waste') {
      const dst = { kind, i };
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
    drag.cards.forEach((c) => elsById.get(c.id).classList.add('dragging', 'no-anim'));
    layout();
    drag.cards.forEach((c) => {
      const el = elsById.get(c.id);
      el.classList.add('dragging', 'no-anim');
      el.style.zIndex = 2000 + drag.cards.indexOf(c);
    });
  }
  const x = px - drag.dx;
  const y = py - drag.dy;
  const stackOff = Math.max(12, Math.round(geo.ch * 0.18));
  drag.cards.forEach((c, j) => {
    elsById.get(c.id).style.transform = tr(x, y + j * stackOff);
  });
  const dst = dropTarget(x + geo.cw / 2, y + geo.ch / 2);
  const ok = dst && canAccept(drag.loc, dst);
  slots.forEach((s) => s.el.classList.toggle('dst', !!ok && s.kind === dst.kind && s.i === dst.i));
}

function onUp(ev) {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.cards.forEach((c) => {
    const el = elsById.get(c.id);
    el.classList.remove('dragging', 'no-anim');
  });
  slots.forEach((s) => s.el.classList.remove('dst'));
  if (!d.moved) {
    handleTap(d.loc);
    return;
  }
  const [px, py] = boardPoint(ev);
  const dst = dropTarget(px - d.dx + geo.cw / 2, py - d.dy + geo.ch / 2);
  if (dst && canAccept(d.loc, dst)) commitMove(d.loc, dst);
  else { layout(); tone(200, 0.07, 'sine', 0.05, 0, 150); }
}

function handleTap(loc) {
  const pile = P[loc.kind][loc.i];
  const card = pile[loc.index];
  const now = performance.now();
  const dbl = lastTap.id === card.id && now - lastTap.at < 340;
  lastTap = { id: card.id, at: now };
  if (dbl) {
    sel = null;
    if (autoToFoundation(loc)) { lastTap.id = -1; return; }
  }
  if (sel && sel.kind === loc.kind && sel.i === loc.i && sel.index === loc.index) { sel = null; layout(); return; }
  if (sel && canAccept(sel, { kind: loc.kind, i: loc.i })) {
    const from = sel;
    commitMove(from, { kind: loc.kind, i: loc.i });
    return;
  }
  sel = { kind: loc.kind, i: loc.i, index: loc.index };
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
  drawCount = n === 3 ? 3 : 1;
  localStorage.setItem('klondike.draw', String(drawCount));
  modeEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.draw === drawCount));
  bestEl.textContent = bestScore();
}

function startGame() {
  deal();
  layout();
  syncUI();
}

btnSound.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('klondike.muted', muted ? '1' : '0');
  btnSound.textContent = muted ? '🔇' : '🔊';
  btnSound.classList.toggle('active', muted);
});
btnHint.addEventListener('click', showHint);
btnUndo.addEventListener('click', undo);
btnAuto.addEventListener('click', autoFinish);
btnNew.addEventListener('click', startGame);
modeEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-draw]');
  if (!b) return;
  setMode(+b.dataset.draw);
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
  else if (k === ' ' || k === 'arrowdown') { e.preventDefault(); clickStock(); }
  else if (k === 'escape') { sel = null; clearHint(); layout(); }
});

let rafId = null;
window.addEventListener('resize', () => {
  if (rafId) return;
  rafId = requestAnimationFrame(() => { rafId = null; layout(); });
});

btnSound.textContent = muted ? '🔇' : '🔊';
btnSound.classList.toggle('active', muted);
setMode(drawCount);
buildDeck();
deal();
layout();
syncUI();

})();
