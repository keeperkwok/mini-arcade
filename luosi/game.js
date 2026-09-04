(() => {
'use strict';

/* ==================== 常量 ==================== */
const WORLD_W = 460, WORLD_H = 600;
const GW = 6, GH = 6, CELL = 64, OX = 38, OY = 54;   // 板材网格
const TRAY_Y = 528, TRAY_R = 20, TRAY_MAX = 7;
const SCREW_R = 16;
const UNDO_PER_LEVEL = 3, HINT_PER_LEVEL = 3;

const COLORS = [
  null,
  { c1: '#fecaca', c2: '#dc2626', name: '红' },
  { c1: '#bfdbfe', c2: '#2563eb', name: '蓝' },
  { c1: '#bbf7d0', c2: '#16a34a', name: '绿' },
  { c1: '#fde68a', c2: '#d97706', name: '黄' },
  { c1: '#ddd6fe', c2: '#7c3aed', name: '紫' },
  { c1: '#99f6e4', c2: '#0d9488', name: '青' },
];
const PLATE_TONES = [
  ['#3b4a63', '#232f44'], ['#4a4462', '#2b2740'], ['#3f5450', '#25332f'],
  ['#55453a', '#32271f'], ['#3a4560', '#232a3c'],
];

/* ==================== 元素 ==================== */
const canvas = document.getElementById('screw-canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const levelEl = document.getElementById('level');
const leftEl = document.getElementById('left');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const undoNEl = document.getElementById('undoN');
const hintNEl = document.getElementById('hintN');
const btnSound = document.getElementById('btnSound');
const btnRestart = document.getElementById('btnRestart');
const btnUndo = document.getElementById('btnUndo');
const btnHint = document.getElementById('btnHint');
const btnSkip = document.getElementById('btnSkip');

/* ==================== 状态 ==================== */
let level = 1;
let score = 0;
let bestLevel = Number(localStorage.getItem('luosi.level') || 1);
let bestScore = Number(localStorage.getItem('luosi.best') || 0);
let plates = [];
let screws = [];
let tray = [];
let parts = [];
let shake = 0;
let undosLeft = UNDO_PER_LEVEL, hintsLeft = HINT_PER_LEVEL;
let snapshots = [];
let hovered = -1, hintId = -1, hintT = 0;
let over = false, cleared = false;
let scale = 1;
let muted = localStorage.getItem('luosi.muted') === '1';

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
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}
function noise(dur, vol) {
  if (muted || !audioCtx) return;
  const n = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = audioCtx.createBufferSource();
  const g = audioCtx.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(audioCtx.destination);
  src.start();
}
const soundPick = (n) => { tone(420 + n * 55, 0.07, 'square', 0.08, 0, 620 + n * 60); noise(0.05, 0.05); };
const soundBlocked = () => { tone(110, 0.14, 'sawtooth', 0.09, 0, 70); };
const soundClear = (k) => { [660, 880, 1100].forEach((f, i) => tone(f, 0.1, 'triangle', 0.11, i * 0.05)); tone(1400 + k * 80, 0.14, 'sine', 0.09, 0.12); };
const soundPlate = () => { noise(0.18, 0.09); tone(180, 0.2, 'sine', 0.1, 0, 80); };
const soundWin = () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.17, 'triangle', 0.12, i * 0.08));
const soundFail = () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.24, 'sawtooth', 0.1, i * 0.13));
const unlockAudio = () => {
  ensureAudio();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

/* ==================== 工具 ==================== */
const rnd = (n) => Math.floor(Math.random() * n);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const cellIndex = (cx, cy) => cy * GW + cx;
const cellX = (c) => OX + (c % GW) * CELL + CELL / 2;
const cellY = (c) => OY + ((c / GW) | 0) * CELL + CELL / 2;
const traySlot = (i) => ({ x: 43 + i * ((WORLD_W - 86) / (TRAY_MAX - 1)), y: TRAY_Y });

/* ==================== 关卡生成 ==================== */
function levelPlan(L) {
  return {
    plates: Math.min(3 + ((L - 1) / 2 | 0), 7),
    colors: Math.min(3 + (L / 3 | 0), 6),
    perPlate: 3 + Math.min(1, (L / 4 | 0)),
  };
}

function tryBuild(L) {
  const plan = levelPlan(L);
  const pl = [];
  const sc = [];
  for (let i = 0; i < plan.plates; i++) {
    const w = 2 + rnd(2), h = 2 + rnd(2);
    let placed = null;
    for (let a = 0; a < 50; a++) {
      const gx = rnd(GW - w + 1), gy = rnd(GH - h + 1);
      const cells = [];
      let mask = 0;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const ci = cellIndex(gx + dx, gy + dy);
          cells.push(ci);
          mask |= 1 << ci;
        }
      }
      if (i === 0 || pl.some((p) => p.mask & mask)) { placed = { cells, mask, gx, gy, w, h }; break; }
    }
    if (!placed) return null;
    const plate = { i, alive: true, fall: 0, tone: i % PLATE_TONES.length, screwIds: [], ...placed };
    pl.push(plate);
    const pool = shuffle(placed.cells.slice());
    const k = Math.min(plan.perPlate + rnd(2), pool.length);
    if (k < 2) return null;
    for (let n = 0; n < k; n++) {
      const cell = pool[n];
      const s = {
        id: sc.length, plate: i, cell, color: 0, alive: true, free: false,
        x: cellX(cell) + (Math.random() - 0.5) * 10, y: cellY(cell) + (Math.random() - 0.5) * 10,
        wob: 0, ring: 0,
      };
      sc.push(s);
      plate.screwIds.push(s.id);
    }
  }
  // 螺丝总数必须是 3 的倍数,否则同色永远清不空 -> 先补齐,补不了就削掉
  const rem = sc.length % 3;
  if (rem !== 0) {
    let need = 3 - rem, guard = 0;
    while (need > 0 && guard++ < 60) {
      const cands = pl.filter((p) => countOn(sc, p.i) < 5 && p.cells.length > countOn(sc, p.i));
      if (!cands.length) break;
      const p = cands[rnd(cands.length)];
      const cell = p.cells.find((c) => !sc.some((s) => s.plate === p.i && s.cell === c));
      if (cell === undefined) break;
      sc.push(mkScrew(sc.length, p.i, cell));
      need--;
    }
    if (need > 0) {
      let cut = rem, guard2 = 0;
      while (cut > 0 && guard2++ < 60) {
        const cands = pl.filter((p) => countOn(sc, p.i) > 2);
        if (!cands.length) break;
        const p = cands[cands.length - 1];
        const onPlate = sc.filter((s) => s.plate === p.i);
        sc.splice(sc.indexOf(onPlate[onPlate.length - 1]), 1);
        cut--;
      }
    }
  }
  if (sc.length % 3 !== 0 || sc.length < 6) return null;
  pl.forEach((p) => { p.screwIds = []; });
  sc.forEach((s, i) => { s.id = i; pl[s.plate].screwIds.push(i); });
  return { plates: pl, screws: sc };
}

// 构造式着色:沿一条合法拧螺丝顺序边走边染色,
// 每步都保证收纳槽不超限、剩余步数足够把所有已开颜色补成三元组,
// 这样生成的关卡天然可解(而不是随机染色后再碰运气验证)。
function assignColors(built, colorCount, openP) {
  const n = built.screws.length;
  if (n % 3 !== 0) return false;
  const alive = built.screws.map(() => true);
  const pAlive = built.plates.map(() => true);
  const left = built.plates.map((p) => p.screwIds.length);
  const counts = new Array(colorCount + 1).fill(0);
  let trayTotal = 0, openNeed = 0, R = n;

  function freeList() {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const s = built.screws[i];
      let blocked = false;
      for (const p of built.plates) {
        if (p.i > s.plate && pAlive[p.i] && (p.mask & (1 << s.cell))) { blocked = true; break; }
      }
      if (!blocked) out.push(s);
    }
    return out;
  }

  for (let step = 0; step < n; step++) {
    const free = freeList();
    if (!free.length) return false;
    const s = free[rnd(free.length)];
    const Rleft = R - 1;
    const cands = [];
    for (let c = 1; c <= colorCount; c++) {
      const cur = counts[c];
      const need = openNeed + (cur === 0 ? 2 : -1);
      const total = trayTotal + (cur === 2 ? -2 : 1);
      // 槽位一旦满 7 且没凑成三消当场判负,所以可行的中转状态必须 <= 6
      if (need < 0 || total >= TRAY_MAX || need > Rleft || (Rleft - need) % 3 !== 0) continue;
      cands.push({ c, rank: cur === 2 ? 0 : cur === 1 ? 1 : 2 });
    }
    if (!cands.length) return false;
    // 多数时候先凑成/延续已有颜色,但按 openP 概率故意开新色,
    // 否则高关卡也会只用两三色,玩家永远不会把收纳槽塞满
    const openers = cands.filter((c) => c.rank === 2);
    let take;
    if (openers.length && Math.random() < openP) {
      take = openers[rnd(openers.length)];
    } else {
      cands.sort((a, b) => a.rank - b.rank);
      take = cands.length > 1 && Math.random() < 0.4 ? cands[1 + rnd(Math.min(2, cands.length - 1))] : cands[0];
    }
    const cur = counts[take.c];
    counts[take.c] = cur === 2 ? 0 : cur + 1;
    trayTotal += cur === 2 ? -2 : 1;
    openNeed += cur === 0 ? 2 : -1;
    s.color = take.c;
    alive[s.id] = false;
    left[s.plate]--;
    if (!left[s.plate]) pAlive[s.plate] = false;
    R--;
  }
  if (trayTotal !== 0 || openNeed !== 0) return false;
  return new Set(built.screws.map((s) => s.color)).size >= 2;
}

function mkScrew(id, plateIdx, cell) {
  return {
    id, plate: plateIdx, cell, color: 0, alive: true, free: false,
    x: cellX(cell) + (Math.random() - 0.5) * 10, y: cellY(cell) + (Math.random() - 0.5) * 10,
    wob: 0, ring: 0,
  };
}
const countOn = (sc, plateIdx) => sc.reduce((n, s) => (s.plate === plateIdx ? n + 1 : n), 0);

// 用"人类会怎么想"的贪心策略模拟一遍:能凑三消就先凑,其次接续,最后才开新色。
// 生成器已按合法顺序着色,这里再过滤掉需要歪门邪道才能过关的布局。
function greedyRun(built, random) {
  const alive = built.screws.map(() => true);
  const pAlive = built.plates.map(() => true);
  const left = built.plates.map((p) => p.screwIds.length);
  const counts = new Array(COLORS.length).fill(0);
  let total = 0, picked = 0;
  for (;;) {
    const tiers = [[], [], []];
    for (let i = 0; i < alive.length; i++) {
      if (!alive[i]) continue;
      const s = built.screws[i];
      let blocked = false;
      for (const p of built.plates) {
        if (p.i > s.plate && pAlive[p.i] && (p.mask & (1 << s.cell))) { blocked = true; break; }
      }
      if (blocked) continue;
      const c = counts[s.color];
      tiers[c === 2 ? 0 : c === 1 ? 1 : 2].push(i);
    }
    const pool = tiers[0].length ? tiers[0] : tiers[1].length ? tiers[1] : tiers[2];
    if (!pool.length) break;
    const id = random ? pool[rnd(pool.length)] : pool[0];
    const s = built.screws[id];
    alive[id] = false;
    picked++;
      counts[s.color]++;
      if (counts[s.color] === 3) { counts[s.color] = 0; total -= 2; } else total++;
      if (total >= TRAY_MAX) return false;
    left[s.plate]--;
    if (!left[s.plate]) pAlive[s.plate] = false;
  }
  return picked === alive.length && total === 0;
}

function isSolvable(built) {
  for (let t = 0; t < 8; t++) if (greedyRun(built, t > 1)) return true;
  return false;
}

function buildLevel(L) {
  const plan = levelPlan(L);
  for (let attempt = 0; attempt < 90; attempt++) {
    const built = tryBuild(L);
    const openP = 0.12 + (plan.colors - 3) * 0.15;
    if (built && assignColors(built, plan.colors, openP) && isSolvable(built)) return built;
  }
  // 兜底:一个必定可解的简单结构
  const cells = [cellIndex(1, 1), cellIndex(2, 1), cellIndex(1, 2), cellIndex(2, 2), cellIndex(3, 2), cellIndex(3, 3)];
  const pl = [
    { i: 0, alive: true, fall: 0, tone: 0, gx: 0, gy: 0, w: 3, h: 3, mask: 0, cells: [], screwIds: [] },
    { i: 1, alive: true, fall: 0, tone: 1, gx: 1, gy: 1, w: 3, h: 3, mask: 0, cells: [], screwIds: [] },
  ];
  const sc = [];
  pl.forEach((p, pi) => {
    for (let yy = p.gy; yy < p.gy + p.h; yy++) {
      for (let xx = p.gx; xx < p.gx + p.w; xx++) {
        const ci = cellIndex(xx, yy);
        p.cells.push(ci);
        p.mask |= 1 << ci;
      }
    }
    const use = pi === 0 ? cells.slice(0, 3) : cells.slice(3, 6);
    use.forEach((ci) => {
      const s = {
        id: sc.length, plate: pi, cell: ci, color: pi + 1, alive: true, free: false,
        x: cellX(ci), y: cellY(ci), wob: 0, ring: 0,
      };
      sc.push(s);
      p.screwIds.push(s.id);
    });
  });
  return { plates: pl, screws: sc };
}

/* ==================== 局面 ==================== */
function startLevel(L, keepScore) {
  level = L;
  const built = buildLevel(L);
  plates = built.plates.map((p) => Object.assign({}, p, { alive: true, fall: 0 }));
  screws = built.screws.map((s) => Object.assign({}, s, { alive: true, wob: 0, ring: 0 }));
  tray = [];
  parts = [];
  snapshots = [];
  undosLeft = UNDO_PER_LEVEL;
  hintsLeft = HINT_PER_LEVEL;
  if (!keepScore) score = 0;
  over = false;
  cleared = false;
  hovered = -1;
  hintId = -1;
  levelEl.textContent = level;
  scoreEl.textContent = score;
  bestEl.textContent = Math.max(bestLevel, level);
  hideOverlay();
  refreshFree();
  updateHud();
}

function refreshFree() {
  for (const s of screws) {
    if (!s.alive) { s.free = false; continue; }
    let free = true;
    for (const p of plates) {
      if (p.i > s.plate && p.alive && (p.mask & (1 << s.cell))) { free = false; break; }
    }
    s.free = free;
  }
}

function aliveScrews() {
  let n = 0;
  for (const s of screws) if (s.alive) n++;
  return n;
}

function bump(el) {
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

function updateHud() {
  leftEl.textContent = aliveScrews();
  undoNEl.textContent = undosLeft;
  hintNEl.textContent = hintsLeft;
  btnUndo.disabled = !snapshots.length || undosLeft <= 0 || over || cleared;
  btnHint.disabled = hintsLeft <= 0 || over || cleared;
}

function snapshot() {
  snapshots.push({
    alive: screws.map((s) => s.alive),
    pAlive: plates.map((p) => p.alive),
    tray: tray.filter((t) => !t.clearing).map((t) => ({ color: t.color, x: t.x, y: t.y, slot: t.slot })),
    score,
  });
  if (snapshots.length > 24) snapshots.shift();
}

function undo() {
  if (!snapshots.length || undosLeft <= 0 || over || cleared) return;
  const s = snapshots.pop();
  undosLeft--;
  screws.forEach((f, i) => { f.alive = s.alive[i]; f.ring = 0; });
  plates.forEach((p, i) => {
    p.alive = s.pAlive[i];
    if (p.alive) p.fall = 0;
  });
  tray = s.tray.map((t) => makeTrayItem(t.color, t.x, t.y, t.slot));
  score = s.score;
  scoreEl.textContent = score;
  refreshFree();
  updateHud();
  tone(300, 0.08, 'sine', 0.08, 0, 200);
}

function makeTrayItem(color, x, y, slot) {
  return { color, x, y, slot: slot || 0, clearing: 0 };
}
function trayHoldCount() {
  let n = 0;
  for (const t of tray) if (!t.clearing) n++;
  return n;
}

/* ==================== 操作 ==================== */
function topPlateAt(x, y) {
  for (let i = plates.length - 1; i >= 0; i--) {
    const p = plates[i];
    if (!p.alive) continue;
    if (x >= OX + p.gx * CELL && x < OX + (p.gx + p.w) * CELL &&
        y >= OY + p.gy * CELL && y < OY + (p.gy + p.h) * CELL) return p;
  }
  return null;
}

function hoverScrew(x, y) {
  const p = topPlateAt(x, y);
  if (!p) return { screw: null, plate: null };
  let best = null, bd = 1e9;
  for (const id of p.screwIds) {
    const s = screws[id];
    if (!s.alive) continue;
    const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
    if (d < bd) { bd = d; best = s; }
  }
  if (best && bd <= (SCREW_R + 9) * (SCREW_R + 9)) return { screw: best, plate: p };
  return { screw: null, plate: p };
}

function pick(id) {
  const s = screws[id];
  if (!s || !s.alive || !s.free || over || cleared) return;
  if (trayHoldCount() >= TRAY_MAX) return;
  snapshot();
  s.alive = false;
  refreshFree();
  score += 5;
  scoreEl.textContent = score;
  bump(scoreEl);
  soundPick(trayHoldCount());
  if (navigator.vibrate) navigator.vibrate(6);
  tray.push(makeTrayItem(s.color, s.x, s.y, trayHoldCount()));
  checkTray();
  const plate = plates[s.plate];
  let anyLeft = false;
  for (const pid of plate.screwIds) if (screws[pid].alive) anyLeft = true;
  if (!anyLeft && plate.alive) {
    plate.alive = false;
    plate.fall = 0.0001;
    score += 25;
    scoreEl.textContent = score;
    soundPlate();
    refreshFree();
    checkPlateCleared();
  }
  updateHud();
}

function checkTray() {
  const counts = {};
  tray.forEach((t, i) => {
    if (t.clearing) return;
    (counts[t.color] = counts[t.color] || []).push(i);
  });
  for (const c in counts) {
    if (counts[c].length >= 3) {
      const take = counts[c].slice(0, 3);
      take.forEach((i) => { tray[i].clearing = 0.0001; });
      const bonus = 60 + level * 6;
      score += bonus;
      scoreEl.textContent = score;
      bump(scoreEl);
      popScore(bonus);
      soundClear(level);
      if (navigator.vibrate) navigator.vibrate([12, 30, 12]);
      shake = 4;
      return;
    }
  }
  if (trayHoldCount() >= TRAY_MAX) gameOver();
}

function checkPlateCleared() {
  if (aliveScrews() === 0) {
    const bonus = 150 + level * 40;
    score += bonus;
    scoreEl.textContent = score;
    popScore(bonus);
    cleared = true;
    if (level >= bestLevel) {
      bestLevel = level + 1;
      localStorage.setItem('luosi.level', String(bestLevel));
    }
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('luosi.best', String(bestScore));
    }
    bestEl.textContent = bestLevel;
    soundWin();
    setTimeout(() => {
      if (!cleared) return;
      showOverlay('<div class="ov-emoji">🔧</div><h2>第 ' + level + ' 关完成</h2>' +
        '<p class="final-score">' + score + '<span> 分</span></p>' +
        '<p class="final-sub">奖励 ' + bonus + ' 分 · 收纳槽已腾空</p>' +
        '<div class="ov-actions"><button class="primary" data-act="next">下一关 ▶</button></div>');
    }, 900);
  }
}

function popScore(bonus) {
  for (let i = 0; i < Math.min(26, 8 + ((bonus / 20) | 0)); i++) {
    const a = Math.random() * 6.283;
    parts.push({ x: WORLD_W / 2, y: TRAY_Y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160 - 90, life: 0.5, max: 0.5, size: 2 + Math.random() * 3, color: '#a7f3d0' });
  }
}

function gameOver() {
  if (over || cleared) return;
  over = true;
  soundFail();
  shake = 10;
  if (navigator.vibrate) navigator.vibrate([40, 60, 120]);
  setTimeout(() => {
    if (!over) return;
    showOverlay('<div class="ov-emoji">🫠</div><h2>收纳槽塞满了</h2>' +
      '<p class="final-score">' + score + '<span> 分</span></p>' +
      '<p class="hint">差一步!想想哪颗螺丝该先拧<br>被上层板压住的是取不出来的</p>' +
      '<div class="ov-actions"><button class="primary" data-act="retry">重来本关</button>' +
      '<button class="ghost" data-act="undo1">撤销一步</button></div>');
  }, 500);
}

function useHint() {
  if (hintsLeft <= 0 || over || cleared) return;
  const freeList = screws.filter((s) => s.alive && s.free);
  if (!freeList.length) return;
  const counts = {};
  tray.forEach((t) => { if (!t.clearing) counts[t.color] = (counts[t.color] || 0) + 1; });
  freeList.sort((a, b) => {
    const ra = counts[a.color] === 2 ? 0 : counts[a.color] === 1 ? 1 : 2;
    const rb = counts[b.color] === 2 ? 0 : counts[b.color] === 1 ? 1 : 2;
    return ra - rb;
  });
  hintsLeft--;
  hintId = freeList[0].id;
  hintT = 2.4;
  screws[hintId].ring = 1;
  tone(880, 0.1, 'sine', 0.1, 0, 1200);
  updateHud();
}

/* ==================== 渲染 ==================== */
function resize() {
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width || WORLD_W;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssW * (WORLD_H / WORLD_W) * dpr));
  scale = cssW / WORLD_W;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
}
window.addEventListener('resize', resize);

function draw() {
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);
  ctx.save();
  if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  bg.addColorStop(0, '#0e1729');
  bg.addColorStop(1, '#070c17');
  ctx.fillStyle = bg;
  ctx.fillRect(-20, -20, WORLD_W + 40, WORLD_H + 40);

  // 网格底纹
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= GW; i++) {
    ctx.beginPath();
    ctx.moveTo(OX + i * CELL, OY);
    ctx.lineTo(OX + i * CELL, OY + GH * CELL);
    ctx.stroke();
  }
  for (let j = 0; j <= GH; j++) {
    ctx.beginPath();
    ctx.moveTo(OX, OY + j * CELL);
    ctx.lineTo(OX + GW * CELL, OY + j * CELL);
    ctx.stroke();
  }

  // 板材与螺丝(按层序)
  for (const p of plates) {
    if (!p.alive && !p.fall) continue;
    drawPlate(p);
    if (!p.alive) continue;
    for (const id of p.screwIds) {
      const s = screws[id];
      if (s.alive) drawScrew(s.x, s.y, s.color, SCREW_R, s.wob, s.ring, s.free);
    }
  }

  if (hovered >= 0 && screws[hovered] && screws[hovered].alive && screws[hovered].free) {
    const hs = screws[hovered];
    ctx.strokeStyle = 'rgba(167, 243, 208, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(hs.x, hs.y, SCREW_R + 5, 0, 6.2832);
    ctx.stroke();
  }

  drawTray();

  for (const q of parts) {
    ctx.globalAlpha = Math.max(0, q.life / q.max);
    ctx.fillStyle = q.color;
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.size, 0, 6.2832);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPlate(p) {
  const x = OX + p.gx * CELL + 3, y = OY + p.gy * CELL + 3;
  const w = p.w * CELL - 6, h = p.h * CELL - 6;
  ctx.save();
  if (!p.alive) {
    const k = Math.min(1, p.fall / 0.6);
    ctx.globalAlpha = 1 - k;
    ctx.translate(x + w / 2, y + h / 2 + k * k * 260);
    ctx.rotate(k * 0.5);
    ctx.translate(-x - w / 2, -y - h / 2);
  }
  ctx.shadowColor = 'rgba(2, 6, 23, 0.8)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 7;
  const tone = PLATE_TONES[p.tone];
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, tone[0]);
  g.addColorStop(1, tone[1]);
  roundRect(x, y, w, h, 12);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1.5;
  roundRect(x + 3, y + 3, w - 6, h - 6, 9);
  ctx.stroke();
  // 板角铆钉
  ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
  const cs = [[x + 12, y + 12], [x + w - 12, y + 12], [x + 12, y + h - 12], [x + w - 12, y + h - 12]];
  for (const [cx, cy] of cs) {
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6, 0, 6.2832);
    ctx.fill();
  }
  ctx.restore();
}

function drawScrew(x, y, color, r, wob, ring, free) {
  const c = COLORS[color] || COLORS[1];
  ctx.save();
  const t = performance.now() / 1000;
  ctx.translate(x, y);
  if (wob > 0) ctx.rotate(Math.sin(t * 40) * wob * 0.28);
  if (!free) ctx.globalAlpha = 0.45;

  ctx.beginPath();
  ctx.arc(0, r * 0.28, r, 0, 6.2832);
  ctx.fillStyle = 'rgba(2, 6, 23, 0.5)';
  ctx.fill();

  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
  g.addColorStop(0, c.c1);
  g.addColorStop(1, c.c2);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 6.2832);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(4, 8, 16, 0.55)';
  ctx.stroke();

  // 十字槽
  ctx.strokeStyle = 'rgba(4, 8, 16, 0.6)';
  ctx.lineWidth = Math.max(2, r * 0.17);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, 0); ctx.lineTo(r * 0.55, 0);
  ctx.moveTo(0, -r * 0.55); ctx.lineTo(0, r * 0.55);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 0.34, r * 0.3, 3.6, 5.4);
  ctx.stroke();

  if (ring > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 9);
    ctx.strokeStyle = 'rgba(251, 191, 36,' + (0.35 + pulse * 0.55) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 6 + pulse * 4, 0, 6.2832);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTray() {
  ctx.save();
  // 槽底板
  roundRect(20, TRAY_Y - 32, WORLD_W - 40, 64, 16);
  const g = ctx.createLinearGradient(0, TRAY_Y - 32, 0, TRAY_Y + 32);
  g.addColorStop(0, 'rgba(30, 41, 59, 0.85)');
  g.addColorStop(1, 'rgba(15, 23, 42, 0.9)');
  ctx.fillStyle = g;
  ctx.fill();
  const full = trayHoldCount();
  ctx.strokeStyle = full >= TRAY_MAX - 1 ? 'rgba(248, 113, 113, 0.75)' : 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 1.5;
  roundRect(20, TRAY_Y - 32, WORLD_W - 40, 64, 16);
  ctx.stroke();
  for (let i = 0; i < TRAY_MAX; i++) {
    const sp = traySlot(i);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, TRAY_R + 3, 0, 6.2832);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  let holdIdx = 0;
  tray.forEach((t) => {
    if (!t.clearing) t.slot = holdIdx++;
    const sp = traySlot(clamp(t.slot, 0, TRAY_MAX - 1));
    t.x += (sp.x - t.x) * 0.24;
    t.y += (sp.y - t.y) * 0.24;
    let r = TRAY_R;
    if (t.clearing) {
      const k = Math.min(1, t.clearing / 0.26);
      r = TRAY_R * (1 + 0.5 * Math.sin(k * 3.14)) * (1 - k);
    }
    if (r > 0.5) drawScrew(t.x, t.y, t.color, r, 0, 0, true);
  });
  ctx.restore();
}

/* ==================== 动画步进 ==================== */
function update(dt) {
  if (shake > 0) shake = Math.max(0, shake - dt * 30);
  if (hintT > 0) {
    hintT -= dt;
    if (hintT <= 0 && hintId >= 0) { if (screws[hintId]) screws[hintId].ring = 0; hintId = -1; }
  }
  // 注意:绝不能从 plates 里删除元素,层号即下标
  for (const p of plates) {
    if (!p.fall) continue;
    p.fall += dt;
    if (p.fall > 0.7) p.fall = 0;
  }
  let removed = false;
  tray.forEach((t) => { if (t.clearing) t.clearing += dt; });
  const keep = [];
  for (const t of tray) {
    if (t.clearing && t.clearing > 0.26) {
      removed = true;
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * 6.283;
        parts.push({ x: t.x, y: t.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150 - 60, life: 0.4, max: 0.4, size: 2 + Math.random() * 3, color: (COLORS[t.color] || COLORS[1]).c1 });
      }
      continue;
    }
    keep.push(t);
  }
  if (removed) {
    tray = keep;
    checkTray();
    updateHud();
  }
  for (const s of screws) if (s.wob > 0) s.wob = Math.max(0, s.wob - dt * 3.4);
  for (const q of parts) {
    q.vy += 620 * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.life -= dt;
  }
  if (parts.length) parts = parts.filter((q) => q.life > 0);
}

/* ==================== 输入 ==================== */
function worldPos(e) {
  const rect = canvas.getBoundingClientRect();
  const k = (rect.width || WORLD_W) / WORLD_W;
  return { x: (e.clientX - (rect.left || 0)) / k, y: (e.clientY - (rect.top || 0)) / k };
}

canvas.addEventListener('pointermove', (e) => {
  if (over || cleared) { hovered = -1; return; }
  const p = worldPos(e);
  const hit = hoverScrew(p.x, p.y);
  const id = hit.screw && hit.screw.free ? hit.screw.id : -1;
  if (id !== hovered) hovered = id;
  canvas.style.cursor = hit.screw ? (hit.screw.free ? 'pointer' : 'not-allowed') : 'default';
});

canvas.addEventListener('pointerdown', (e) => {
  ensureAudio();
  if (over || cleared) return;
  const p = worldPos(e);
  const hit = hoverScrew(p.x, p.y);
  if (!hit.plate) return;
  if (!hit.screw) {
    for (const id of hit.plate.screwIds) if (screws[id].alive) screws[id].wob = 0.7;
    soundBlocked();
    return;
  }
  if (!hit.screw.free) {
    hit.screw.wob = 1;
    soundBlocked();
    return;
  }
  pick(hit.screw.id);
});

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'next') startLevel(level + 1, true);
  else if (act === 'retry') { over = false; hideOverlay(); startLevel(level, false); }
  else if (act === 'undo1') { hideOverlay(); over = false; undo(); }
});

btnRestart.addEventListener('click', () => startLevel(level, false));
btnUndo.addEventListener('click', undo);
btnHint.addEventListener('click', useHint);
btnSkip.addEventListener('click', () => { if (!over) startLevel(level + 1, true); });
btnSound.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem('luosi.muted', muted ? '1' : '0');
  btnSound.textContent = muted ? '🔇' : '🔊';
});

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'u') undo();
  else if (k === 'h') useHint();
  else if (k === 'r') startLevel(level, false);
  else if (k === 'enter' && cleared) startLevel(level + 1, true);
});

function showOverlay(html) { overlayContent.innerHTML = html; overlay.classList.add('show'); }
function hideOverlay() { overlay.classList.remove('show'); }

/* ==================== 主循环 ==================== */
let last = 0;
function frame(t) {
  const dt = Math.max(0, Math.min(0.05, (t - last) / 1000 || 0));
  last = t;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

/* ==================== 启动 ==================== */
btnSound.textContent = muted ? '🔇' : '🔊';
resize();
startLevel(1, false);
requestAnimationFrame((t) => { last = t; frame(t); });

})();
