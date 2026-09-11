(() => {
'use strict';

/* 翻牌堆：一堆卡牌层层压叠，被压住的牌背面朝上；
   拿走盖着它的牌，下面那张才会"啪"地翻开——翻开才取得走。
   取走的牌进下方 7 格槽位并按图案归位，凑满 3 张同图案自动消除；
   槽位塞满、或者已经没有牌能救你，就输。 */

/* ==================== 常量 ==================== */
const W = 460, H = 620;
const TW = 56, TH = 64;                   // 卡牌尺寸
const PX = 64, PY = 72;                   // 同层格距（大于卡牌，保证同层互不遮挡）
const COV_X = TW - 10, COV_Y = TH - 10;   // 遮挡判定阈值
const CX = W / 2, BCY = 246;              // 牌堆中心
const SLOT_MAX = 7, BUF_MAX = 3;
const TRAY_Y = 570, BUF_Y = 498;
const TRAY_S = 0.86, BUF_S = 0.8;
const FLY_T = 0.15;                       // 飞进槽位耗时
const UNDO_N = 3, SHUF_N = 1, POP_N = 1;
const DIMS = [[6, 5], [6, 4], [5, 4], [5, 3], [4, 3], [4, 3]];

const FACES = [
  { e: '🍄', bg: '#fecdd3', edge: '#e11d48' },
  { e: '🌰', bg: '#fed7aa', edge: '#ea580c' },
  { e: '⭐', bg: '#fef08a', edge: '#ca8a04' },
  { e: '🍈', bg: '#bbf7d0', edge: '#16a34a' },
  { e: '🫐', bg: '#c7d2fe', edge: '#4f46e5' },
  { e: '🧊', bg: '#a5f3fc', edge: '#0891b2' },
  { e: '🌙', bg: '#e9d5ff', edge: '#7c3aed' },
  { e: '🔔', bg: '#fde68a', edge: '#b45309' },
  { e: '🦋', bg: '#bae6fd', edge: '#0369a1' },
  { e: '🍁', bg: '#fca5a5', edge: '#b91c1c' },
];

/* ==================== 元素 ==================== */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const levelEl = document.getElementById('level');
const leftEl = document.getElementById('left');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const undoNEl = document.getElementById('undoN');
const shufNEl = document.getElementById('shufN');
const popNEl = document.getElementById('popN');
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');
const btnUndo = document.getElementById('btnUndo');
const btnShuffle = document.getElementById('btnShuffle');
const btnPop = document.getElementById('btnPop');

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
};
const sfx = window.Sfx.create({ storageKey: 'fanpai.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

/* ==================== 状态 ==================== */
let level = 1;
let score = 0;
let best = Number(store.get('fanpai.best') || 0);
let maxLevel = Number(store.get('fanpai.level') || 1);
let tiles = [];
let slot = [];       // 槽位里的牌
let buf = [];        // 暂存台上的牌
let moves = [];      // 操作历史（撤回用）
let parts = [];
let pops = [];
let undosLeft = UNDO_N, shufLeft = SHUF_N, popLeft = POP_N;
let combo = 0, comboT = 0, cleared = 0;
let phase = 'intro';   // intro / play / paused / cleared / over
let hovered = -1, blockedFx = 0;
let shake = 0, flash = 0, tNow = 0, last = 0;

/* ==================== 小工具 ==================== */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rnd = (n) => Math.floor(Math.random() * n);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
const overlaps = (a, b) => Math.abs(a.x - b.x) < COV_X && Math.abs(a.y - b.y) < COV_Y;
const slotX = (i) => 40 + (i + 0.5) * ((W - 80) / SLOT_MAX);
const bufX = (i) => 40 + (i + 0.5) * ((W - 80) / BUF_MAX);

/* ==================== 关卡生成 ==================== */
function levelCfg(L) {
  return {
    kinds: clamp(4 + Math.ceil(L / 2), 5, 9),
    layers: clamp(2 + Math.ceil(L / 2), 3, 6),
    target: Math.min(24 + (L - 1) * 6, 84),
    stacks: L >= 3 ? clamp(1 + Math.floor((L - 3) / 3), 1, 3) : 0,
    stackH: L >= 6 ? 5 : 3,
  };
}

function frameCells(cfg) {
  const out = [];
  for (let z = 0; z < cfg.layers; z++) {
    const dims = DIMS[Math.min(z, DIMS.length - 1)];
    const cols = dims[0], rows = dims[1];
    const ox = CX - ((cols - 1) * PX) / 2 + (z % 2 ? PX / 2 : 0);
    const oy = BCY - ((rows - 1) * PY) / 2 + (z % 2 ? PY / 2 : 0);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        out.push({ x: clamp(ox + i * PX, 42, W - 42), y: clamp(oy + j * PY, 78, 446), z, wi: -1 });
      }
    }
  }
  // 牌墙：同一摞牌叠在同一个位置，只有最顶上那张露得出来
  const spots = [[134, BCY], [326, BCY], [230, 150]];
  for (let s = 0; s < cfg.stacks; s++) {
    const spot = spots[s % spots.length];
    for (let i = 0; i < cfg.stackH; i++) {
      // 每往上一张稍微挪一点，看得出是一摞
      out.push({ x: spot[0] + i * 2.5, y: spot[1] - i * 3, z: cfg.layers + i, wi: i });
    }
  }
  return out;
}

// 越靠下层越容易被选中，牌堆才有"压着"的层次
function pickCells(cfg) {
  const all = frameCells(cfg);
  const keyed = all.map((c) => ({ c, r: Math.random() * (1 + c.z * 0.9) }));
  keyed.sort((a, b) => a.r - b.r);
  return keyed.slice(0, cfg.target).map((o) => o.c);
}

// t.under = 被 t 压住的牌（t 拿走，它们少一层遮挡）
function linkTiles(list) {
  for (const t of list) t.under = [];
  for (const a of list) {
    for (const b of list) {
      if (a !== b && a.z > b.z && overlaps(a, b)) a.under.push(b);
    }
  }
  return list;
}

// 重算每张牌还压着几层（只有桌上的牌参与）
function countCover() {
  for (const t of tiles) t.cover = 0;
  for (const a of tiles) {
    if (a.state !== 'board') continue;
    for (const b of a.under) if (b.state === 'board') b.cover++;
  }
}

function mkTile(c, i, k, order) {
  return {
    id: i, x: c.x, y: c.y, z: c.z, wi: c.wi, k, order,
    state: 'board', cover: 0, up: false, flip: 0,
    rx: c.x, ry: c.y, sc: 1, tx: 0, ty: 0, ts: 1, fly: 0, shake: 0,
  };
}

/* ==== 构造式发牌 ====
   照着一条"合法取牌顺序"一张一张往下拆，每拆 3 张发同一个图案。
   这样图案数天然是 3 的倍数，而且这局一定有解：照那条顺序走，槽位连 7 格都撑不满。 */
const countAlive = (arr, taken) => arr.reduce((a, b) => a + (taken[b] ? 0 : 1), 0);

function dealKinds(cells, K) {
  const n = cells.length;
  if (n % 3) return null;
  const kinds = new Array(n).fill(-1);
  const order = new Array(n).fill(-1);
  const below = [];
  for (let i = 0; i < n; i++) below.push([]);
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a !== b && cells[a].z > cells[b].z && overlaps(cells[a], cells[b])) below[a].push(b);
    }
  }
  const cover = new Array(n).fill(0);
  for (let a = 0; a < n; a++) for (const b of below[a]) cover[b]++;
  const taken = new Array(n).fill(false);
  const need = new Array(K).fill(0);
  const used = new Array(K).fill(0);          // 每种图案已经发出去几张，用来摊平分布
  let left = n, step = 0, cursor = 0;

  // 同类里挑"发得最少"的那一种（并列则随机），图案数量才不会一边倒
  const choose = (arr) => {
    let b = arr[rnd(arr.length)];
    for (const k of arr) if (used[k] < used[b]) b = k;
    return b;
  };

  // 图案按轮转开新组，每种图案的张数最多只差 3 张
  const freshKind = () => {
    for (let j = 0; j < K; j++) {
      const k = (cursor + j) % K;
      if (need[k] === 0) { cursor = k + 1; return k; }
    }
    return -1;
  };

  while (left > 0) {
    const free = [];
    for (let i = 0; i < n; i++) if (!taken[i] && cover[i] === 0) free.push(i);
    if (!free.length) return null;
    const one = [], two = [];
    for (let k = 0; k < K; k++) { if (need[k] === 1) one.push(k); else if (need[k] === 2) two.push(k); }
    const pend = one.length + 2 * two.length;                // 槽位里已经占了几格
    const slack = left - (2 * one.length + two.length);      // 欠的牌还补不补得回来
    let kind = -1;
    // 补齐一组：槽位腾两格，永远合法，优先走
    if (two.length && (pend >= 5 || Math.random() < 0.6)) kind = choose(two);
    // 摊一对：槽位多占一格，但少欠一张牌
    else if (one.length && pend <= 4 && Math.random() < 0.5) kind = choose(one);
    // 开新图案：要求腾得出格子、也补得回来
    else if (pend <= 4 && slack >= 3) kind = freshKind();
    else if (one.length && pend <= 5) kind = choose(one);
    else if (two.length) kind = choose(two);
    else kind = freshKind();
    if (kind < 0) return null;
    let idx;
    if (Math.random() < 0.5) {                                    // 一半概率先拆压得最多的，保证一路拆得开
      idx = free[0];
      for (const i of free) if (countAlive(below[i], taken) > countAlive(below[idx], taken)) idx = i;
    } else idx = free[rnd(free.length)];
    kinds[idx] = kind;
    order[idx] = step++;
    taken[idx] = true;
    need[kind]++;
    used[kind]++;
    if (need[kind] === 3) need[kind] = 0;
    for (const b of below[idx]) cover[b]--;
    left--;
  }
  for (let k = 0; k < K; k++) if (need[k]) return null;
  return { kinds, order };
}

function makeTiles(cfg) {
  const cells = pickCells(cfg);
  const dealt = dealKinds(cells, cfg.kinds);
  if (!dealt) return null;
  return linkTiles(cells.map((c, i) => mkTile(c, i, dealt.kinds[i], dealt.order[i])));
}

// 兜底：万一发牌怎么都不顺，退回"纯随机三张一组"，图案数依旧守恒
function fallbackTiles(cfg) {
  const cells = pickCells(cfg);
  const kinds = [];
  for (let i = 0; i < cells.length / 3; i++) kinds.push(i % cfg.kinds, i % cfg.kinds, i % cfg.kinds);
  shuffle(kinds);
  return linkTiles(cells.map((c, i) => mkTile(c, i, kinds[i], -1)));
}

function buildLevel(L) {
  const cfg = levelCfg(L);
  for (let attempt = 0; attempt < 24; attempt++) {
    const list = makeTiles(cfg);
    if (list) return list;
  }
  return fallbackTiles(cfg);
}

/* ==================== 开局 / 关卡流程 ==================== */
function newGame() {
  score = 0;
  startLevel(1);
}

function startLevel(L) {
  level = L;
  tiles = buildLevel(L);
  slot = [];
  buf = [];
  moves = [];
  parts = [];
  pops = [];
  undosLeft = UNDO_N; shufLeft = SHUF_N; popLeft = POP_N;
  combo = 0; comboT = 0; cleared = 0;
  hovered = -1; blockedFx = 0; shake = 0; flash = 0;
  phase = 'play';
  overlay.classList.remove('show');
  countCover();
  for (const t of tiles) { t.up = t.cover === 0; t.flip = t.up ? 1 : 0; }
  hud();
}

const onTable = () => tiles.reduce((a, t) => a + (t.state === 'board' || t.state === 'fly' ? 1 : 0), 0);
const isDone = () => onTable() === 0 && !slot.length && !buf.length;

/* 槽位/暂存台里每张牌的目标坐标 */
function layout() {
  for (let i = 0; i < slot.length; i++) { slot[i].tx = slotX(i); slot[i].ty = TRAY_Y; slot[i].ts = TRAY_S; }
  for (let i = 0; i < buf.length; i++) { buf[i].tx = bufX(i); buf[i].ty = BUF_Y; buf[i].ts = BUF_S; }
}

function predictSlotX(k) {
  let at = slot.length;
  for (let i = slot.length - 1; i >= 0; i--) if (slot[i].k === k) { at = i + 1; break; }
  return slotX(at);
}

/* ==================== 取牌 ==================== */
function flyToSlot(t, from) {
  // 从暂存台回槽位：先把它从台上摘掉，免得它在两处各存一份
  if (from === 'buf') {
    const i = buf.indexOf(t);
    if (i >= 0) buf.splice(i, 1);
  }
  t.state = 'fly';
  t.fly = 0;
  t.ox = t.rx;
  t.oy = t.ry;
  t.fx = t.rx;
  t.fy = t.ry;
  t.tx = predictSlotX(t.k);
  t.ty = TRAY_Y;
  t.ts = TRAY_S;
  t.from = from;
  moves.push({ t, from });
  layout();
  sfxPick();
}

function arrive(t) {
  t.state = 'slot';
  t.flip = 1;
  t.sc = t.ts;
  let at = slot.length;
  for (let i = slot.length - 1; i >= 0; i--) if (slot[i].k === t.k) { at = i + 1; break; }
  slot.splice(at, 0, t);
  countCover();
  revealFlips();
  layout();
  afterChange();
}

// 露顶的牌自动翻开
function revealFlips() {
  let any = false;
  for (const t of tiles) {
    if (t.state !== 'board') continue;
    if (t.cover === 0 && !t.up) { t.up = true; t.flip = 0; any = true; }
    else if (t.cover > 0) t.up = false;
  }
  if (any) sfxFlip();
}

function resolveTriples() {
  let got = false;
  for (const arr of [slot, buf]) {
    const cnt = {};
    for (const t of arr) cnt[t.k] = (cnt[t.k] || 0) + 1;
    for (const key of Object.keys(cnt)) {
      if (cnt[key] < 3) continue;
      const k = Number(key);
      const anchor = arr.length ? arr[arr.length - 1] : null;
      let removed = 0;
      for (let i = arr.length - 1; i >= 0 && removed < 3; i--) {
        if (arr[i].k !== k) continue;
        const t = arr.splice(i, 1)[0];
        t.state = 'gone';
        burstAt(t.rx, t.ry, t.k);
        removed++;
      }
      cleared++;
      combo = comboT > 0 ? combo + 1 : 1;
      comboT = 4;
      const gain = Math.round(30 * level * (1 + Math.min(combo - 1, 6) * 0.25));
      score += gain;
      scorePop(anchor ? anchor.rx : CX, arr === slot ? TRAY_Y - 44 : BUF_Y - 40, '+' + gain, combo > 1);
      sfxMatch(combo);
      flash = Math.min(1, 0.4 + combo * 0.15);
      got = true;
    }
  }
  if (got) layout();
  return got;
}

function afterChange() {
  resolveTriples();
  if (slot.length >= SLOT_MAX) return lose('槽位塞满了');
  if (isDone()) return win();
  if (isDeadlocked()) return lose('无路可走');
  hud();
}

// 牌都还露着却凑不成第三张，道具也用光了 → 直接判死，省得玩家白点
function isDeadlocked() {
  if (undosLeft > 0 || shufLeft > 0 || popLeft > 0) return false;
  if (buf.length) return false;
  let flying = false, freeExists = false;
  const cnt = {};
  for (const s of slot) cnt[s.k] = (cnt[s.k] || 0) + 1;
  for (const t of tiles) {
    if (t.state === 'fly') flying = true;
    if (t.state === 'board' && t.cover === 0) {
      freeExists = true;
      if (cnt[t.k] === 2) return false;
    }
  }
  if (flying || !slot.length) return false;
  if (!freeExists) return true;
  return slot.length >= SLOT_MAX - 1;
}

function win() {
  phase = 'cleared';
  const bonus = 150 + 100 * level + 60 * (undosLeft + shufLeft + popLeft);
  score += bonus;
  pushBest();
  if (level + 1 > maxLevel) {
    maxLevel = level + 1;
    store.set('fanpai.level', String(maxLevel));
  }
  sfxWin();
  showClear(bonus);
  hud();
}

function lose(reason) {
  if (phase === 'over') return;
  phase = 'over';
  shake = 1;
  pushBest();
  sfxFail();
  showOver(reason);
  hud();
}

function pushBest() {
  if (score > best) {
    best = score;
    store.set('fanpai.best', String(best));
  }
}

/* ==================== 道具 ==================== */
function useUndo() {
  if (phase !== 'play' || undosLeft <= 0) return;
  let back = 0;
  for (let i = moves.length - 1; i >= 0 && back < 3; i--) {
    const mv = moves[i];
    const t = mv.t;
    const at = slot.indexOf(t);
    if (at < 0) continue;
    slot.splice(at, 1);
    moves.splice(i, 1);
    if (mv.from === 'buf') {
      t.state = 'buf';
      buf.push(t);
      t.rx = t.ox;
      t.ry = t.oy;
      t.tx = t.rx;
      t.ty = t.ry;
      t.sc = BUF_S;
    } else {
      t.state = 'board';
      t.rx = t.ox;
      t.ry = t.oy;
      t.sc = 1;
      t.flip = 0;
    }
    back++;
  }
  if (!back) { sfxBlocked(); return; }
  undosLeft--;
  countCover();
  for (const t of tiles) {
    if (t.state === 'board') { t.up = t.cover === 0; t.flip = t.up ? 1 : 0; }
  }
  layout();
  sfxPop();
  afterChange();
}

function useShuffle() {
  if (phase !== 'play' || shufLeft <= 0) return;
  const pool = tiles.filter((t) => t.state === 'board' || t.state === 'fly');
  if (pool.length < 3) { sfxBlocked(); return; }
  const kinds = pool.map((t) => t.k);
  for (let i = 0; i < 6 && shuffle(kinds).join(',') === pool.map((t) => t.k).join(','); i++) { /* 换一个新排列 */ }
  pool.forEach((t, i) => {
    if (t.k !== kinds[i]) {
      t.k = kinds[i];
      if (t.state === 'board' && t.cover === 0) t.flip = 0.55;
      if (t.state === 'fly') t.tx = predictSlotX(t.k);
    }
  });
  shufLeft--;
  sfxPop();
  hud();
}

function usePopOut() {
  if (phase !== 'play' || popLeft <= 0) return;
  if (buf.length || !slot.length) { sfxBlocked(); return; }
  const out = slot.splice(0, Math.min(BUF_MAX, slot.length));
  for (const t of out) { t.state = 'buf'; buf.push(t); }
  popLeft--;
  layout();
  sfxPop();
  afterChange();
}

/* ==================== 命中测试 ==================== */
function hitTile(x, y) {
  for (let i = buf.length - 1; i >= 0; i--) {
    const t = buf[i];
    if (Math.abs(x - t.rx) < (TW * BUF_S) / 2 && Math.abs(y - t.ry) < (TH * BUF_S) / 2) return { t, from: 'buf', free: true };
  }
  const cands = tiles.filter((t) => t.state === 'board');
  cands.sort((a, b) => b.z - a.z || b.y - a.y);
  for (const t of cands) {
    if (Math.abs(x - t.rx) < TW / 2 && Math.abs(y - t.ry) < TH / 2) return { t, from: 'board', free: t.cover === 0 };
  }
  return null;
}

function onTap(x, y) {
  if (phase !== 'play') return;
  const hit = hitTile(x, y);
  if (!hit) return;
  if (hit.from === 'buf') return flyToSlot(hit.t, 'buf');
  if (!hit.free) {
    hit.t.shake = 0.3;
    blockedFx = 0.3;
    sfxBlocked();
    return;
  }
  flyToSlot(hit.t, 'board');
}

/* ==================== 动画推进 ==================== */
function step(dt) {
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
  for (const t of tiles) {
    if (t.shake > 0) t.shake = Math.max(0, t.shake - dt);
    if (t.state === 'fly') {
      t.fly += dt / FLY_T;
      const p = clamp(t.fly, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      t.rx = t.fx + (t.tx - t.fx) * e;
      t.ry = t.fy + (t.ty - t.fy) * e - Math.sin(p * Math.PI) * 24;
      t.sc = 1 + (t.ts - 1) * e;
      if (p >= 1) { t.rx = t.tx; t.ry = t.ty; arrive(t); }
      continue;
    }
    if (t.state === 'slot' || t.state === 'buf') {
      const k = Math.min(1, dt * 18);
      t.rx += (t.tx - t.rx) * k;
      t.ry += (t.ty - t.ry) * k;
      t.sc += (t.ts - t.sc) * k;
    } else if (t.state === 'board' && t.cover === 0 && t.flip < 1) {
      t.flip = Math.min(1, t.flip + dt * 3.4);
    }
  }
}

function stepFx(dt) {
  if (shake > 0) shake = Math.max(0, shake - dt * 1.8);
  if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
  if (blockedFx > 0) blockedFx = Math.max(0, blockedFx - dt * 3);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt * 1.6;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 520 * dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.life -= dt * 1.1;
    p.y -= 42 * dt;
    if (p.life <= 0) pops.splice(i, 1);
  }
}

function burstAt(x, y, k) {
  const face = FACES[k % FACES.length];
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 90 + Math.random() * 190;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90, r: 2 + Math.random() * 3.4, col: face.edge, life: 0.6 + Math.random() * 0.4 });
  }
}
function scorePop(x, y, txt, big) {
  pops.push({ x, y, txt, life: 1, big });
}

/* ==================== 音效 ==================== */
function sfxPick() { sfx.tone(470 + Math.random() * 40, 0.06, 'triangle', 0.09, 0, 720); }
function sfxFlip() { sfx.tone(880, 0.07, 'sine', 0.07, 0, 1500); sfx.noise(0.05, 0.04); }
function sfxBlocked() { sfx.tone(120, 0.13, 'sawtooth', 0.08, 0, 74); }
function sfxMatch(n) {
  const base = [660, 880, 1100];
  for (let i = 0; i < 3; i++) sfx.tone(base[i] * (1 + (n - 1) * 0.06), 0.09, 'triangle', 0.11, i * 0.045);
  sfx.tone(1320 + n * 60, 0.13, 'sine', 0.08, 0.14);
}
function sfxPop() { sfx.noise(0.08, 0.07); sfx.tone(300, 0.1, 'square', 0.08, 0, 620); }
function sfxWin() { sfx.melody([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.2]]); }
function sfxFail() { sfx.melody([[392, 0.16], [311, 0.16], [262, 0.2], [196, 0.3]]); }

/* ==================== HUD 与遮罩 ==================== */
function hud() {
  levelEl.textContent = String(level);
  leftEl.textContent = String(onTable());
  if (scoreEl.textContent !== String(score)) {
    scoreEl.textContent = String(score);
    scoreEl.classList.remove('pop');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('pop');
  }
  bestEl.textContent = String(best);
  undoNEl.textContent = String(undosLeft);
  shufNEl.textContent = String(shufLeft);
  popNEl.textContent = String(popLeft);
  btnUndo.disabled = undosLeft <= 0;
  btnShuffle.disabled = shufLeft <= 0;
  btnPop.disabled = popLeft <= 0 || buf.length > 0 || !slot.length;
  btnUndo.classList.toggle('used', undosLeft <= 0);
  btnShuffle.classList.toggle('used', shufLeft <= 0);
  btnPop.classList.toggle('used', popLeft <= 0);
}

function showOverlay(html) {
  overlayContent.innerHTML = html;
  overlay.classList.add('show');
}

function showIntro() {
  phase = 'intro';
  const faces = [];
  for (let i = 0; i < 6; i++) faces.push('<i>' + FACES[i].e + '</i>');
  showOverlay(
    '<div class="ov-emoji">🀄</div><h2>翻牌堆</h2>' +
    '<div class="faces">' + faces.join('') + '</div>' +
    '<p class="hint">牌一张压一张，<b>被压住的看不见图案</b>。<br>' +
    '拿走盖着它的牌，下面这张就翻开——翻开才取得走。<br>' +
    '同图案凑满 3 张消除，槽位只有 7 格，塞满就输。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开始第 1 关</button>' +
    '<a class="ghost" href="../index.html">回主页</a></div>'
  );
}

function showPause() {
  showOverlay('<div class="ov-emoji">⏸️</div><h2>暂停中</h2>' +
    '<p class="hint">牌堆不会动，放心去想下一步</p>' +
    '<div class="ov-actions"><button class="primary" data-act="resume">继续</button>' +
    '<button class="ghost" data-act="replay">重开本关</button></div>');
}

function showClear(bonus) {
  showOverlay('<div class="ov-emoji">🎉</div><h2>第 ' + level + ' 关通过！</h2>' +
    '<div class="final-score">' + score + '<span> 分</span></div>' +
    '<p class="final-sub">消了 ' + cleared + ' 组 · 过关奖励 +' + bonus + '（道具没用完还有加成）</p>' +
    '<div class="ov-actions"><button class="primary" data-act="next">下一关</button>' +
    '<button class="ghost" data-act="again">从头再来</button></div>');
}

function showOver(reason) {
  showOverlay('<div class="ov-emoji">🧱</div><h2>' + reason + '</h2>' +
    '<div class="final-score">' + score + '<span> 分</span></div>' +
    '<p class="final-sub">倒在第 ' + level + ' 关 · 桌上还剩 ' + onTable() + ' 张 · 最高分 ' + best + '</p>' +
    '<div class="ov-actions"><button class="primary" data-act="retry">再来这关</button>' +
    '<button class="ghost" data-act="again">从头开始</button>' +
    '<a class="ghost" href="../index.html">回主页</a></div>');
}

function togglePause() {
  if (phase === 'play') { phase = 'paused'; showPause(); }
  else if (phase === 'paused') { phase = 'play'; overlay.classList.remove('show'); }
  hud();
}

/* ==================== 绘制 ==================== */
function resize() {
  const rect = cv.getBoundingClientRect();
  const cssW = rect.width || W;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(cssW * dpr));
  cv.height = Math.max(1, Math.round(cssW * (H / W) * dpr));
  const k = cv.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}

function rrect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawBack(x, y, w, h, dim) {
  const g = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
  g.addColorStop(0, dim ? '#2c3a55' : '#3d4d70');
  g.addColorStop(1, dim ? '#151d2e' : '#1f2940');
  rrect(x - w / 2, y - h / 2, w, h, 9);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,' + (dim ? 0.2 : 0.36) + ')';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  rrect(x - w / 2 + 5, y - h / 2 + 5, w - 10, h - 10, 6);
  ctx.strokeStyle = 'rgba(148,163,184,0.22)';
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 9);
  ctx.lineTo(x + 8, y);
  ctx.lineTo(x, y + 9);
  ctx.lineTo(x - 8, y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(167,139,250,0.32)';
  ctx.fill();
}

function drawFace(x, y, w, h, k, glow) {
  const face = FACES[k % FACES.length];
  const g = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
  g.addColorStop(0, '#fdfbf5');
  g.addColorStop(1, face.bg);
  rrect(x - w / 2, y - h / 2, w, h, 9);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = face.edge;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  rrect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8, 6);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = Math.round(h * 0.52) + 'px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.fillText(face.e, x, y + 1);
  if (glow) {
    rrect(x - w / 2, y - h / 2, w, h, 9);
    ctx.strokeStyle = 'rgba(251,191,36,' + (0.55 + 0.3 * Math.sin(tNow * 5)).toFixed(3) + ')';
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }
}

/* flip: 0 完全背面 → 0.5 侧过来 → 1 完全正面 */
function drawCard(x, y, k, flip, s, glow) {
  const w = TW * s, h = TH * s;
  ctx.save();
  ctx.shadowColor = 'rgba(2,6,23,0.55)';
  ctx.shadowBlur = 10 * s;
  ctx.shadowOffsetY = 5 * s;
  if (flip >= 1) drawFace(x, y, w, h, k, glow);
  else if (flip <= 0) drawBack(x, y, w, h, true);
  else if (flip < 0.5) drawBack(x, y, Math.max(4, w * (1 - flip * 2)), h, false);
  else {
    ctx.shadowColor = 'rgba(2,6,23,0.2)';
    drawFace(x, y, Math.max(4, w * (flip * 2 - 1)), h, k, glow);
  }
  ctx.restore();
}

function drawTable() {
  rrect(18, 20, W - 36, 452, 16);
  ctx.fillStyle = 'rgba(15,23,42,0.44)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.12)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(148,163,184,0.55)';
  ctx.fillText('第 ' + level + ' 关 · 桌上 ' + onTable() + ' 张', 28, 27);
  if (combo > 1 && comboT > 0) {
    ctx.textAlign = 'right';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('连消 ×' + combo, W - 28, 25);
  }
}

function drawTiles() {
  const list = tiles.filter((t) => t.state === 'board' || t.state === 'fly');
  list.sort((a, b) => (a.state === 'fly' ? 1 : 0) - (b.state === 'fly' ? 1 : 0) || a.z - b.z || a.y - b.y);
  for (const t of list) {
    let x = t.rx, y = t.ry;
    if (t.shake > 0) x += Math.sin(t.shake * 70) * 4;
    if (t.state === 'fly') {
      drawCard(x, y, t.k, 1, t.sc, false);
      continue;
    }
    const free = t.cover === 0;
    drawCard(x, y, t.k, free ? t.flip : 0, 1, free && hovered === t.id);
    if (free && t.flip >= 1) {
      ctx.beginPath();
      ctx.arc(x + TW / 2 - 7, y - TH / 2 + 7, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(52,211,153,0.8)';
      ctx.fill();
    }
  }
}

function drawTray() {
  const sw = (W - 80) / SLOT_MAX;
  rrect(30, TRAY_Y - (TH * TRAY_S) / 2 - 8, W - 60, TH * TRAY_S + 16, 14);
  ctx.fillStyle = 'rgba(2,6,23,0.52)';
  ctx.fill();
  ctx.strokeStyle = slot.length >= SLOT_MAX - 1 ? 'rgba(248,113,113,0.6)' : 'rgba(148,163,184,0.22)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  for (let i = 0; i < SLOT_MAX; i++) {
    const x = 40 + (i + 0.5) * sw;
    rrect(x - sw / 2 + 3, TRAY_Y - (TH * TRAY_S) / 2 - 3, sw - 6, TH * TRAY_S + 6, 8);
    ctx.fillStyle = 'rgba(148,163,184,0.07)';
    ctx.fill();
  }
  for (let i = 0; i < slot.length; i++) {
    const t = slot[i];
    drawCard(t.rx, t.ry, t.k, 1, t.sc, false);
  }
}

function drawBuf() {
  if (!buf.length && popLeft <= 0) return;
  const sw = (W - 80) / BUF_MAX;
  ctx.save();
  ctx.globalAlpha = buf.length ? 1 : 0.45;
  rrect(30, BUF_Y - (TH * BUF_S) / 2 - 6, W - 60, TH * BUF_S + 12, 12);
  ctx.fillStyle = 'rgba(2,6,23,0.36)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.18)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  for (let i = 0; i < BUF_MAX; i++) {
    const x = 40 + (i + 0.5) * sw;
    rrect(x - sw / 2 + 4, BUF_Y - (TH * BUF_S) / 2, sw - 8, TH * BUF_S, 8);
    ctx.fillStyle = 'rgba(148,163,184,0.06)';
    ctx.fill();
  }
  ctx.restore();
  for (let i = 0; i < buf.length; i++) {
    const t = buf[i];
    drawCard(t.rx, t.ry, t.k, 1, t.sc, hovered === t.id);
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#151129');
  bg.addColorStop(1, '#080611');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 10, (Math.random() - 0.5) * shake * 10);
  drawTable();
  drawTiles();
  drawBuf();
  drawTray();
  ctx.restore();

  for (const p of parts) {
    ctx.globalAlpha = clamp(p.life * 1.5, 0, 1);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.col;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of pops) {
    ctx.globalAlpha = clamp(p.life * 1.4, 0, 1);
    ctx.font = (p.big ? 'bold 22px ' : 'bold 16px ') + 'system-ui, sans-serif';
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = 'rgba(2,6,23,0.7)';
    ctx.strokeText(p.txt, p.x, p.y);
    ctx.fillStyle = p.big ? '#fbbf24' : '#34d399';
    ctx.fillText(p.txt, p.x, p.y);
  }
  ctx.globalAlpha = 1;

  if (blockedFx > 0) {
    ctx.fillStyle = 'rgba(248,113,113,' + (blockedFx * 0.16).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  if (flash > 0) {
    ctx.fillStyle = 'rgba(251,191,36,' + (flash * 0.12).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

/* ==================== 主循环 ==================== */
function frame(t) {
  requestAnimationFrame(frame);
  const now = t || 0;
  const dt = clamp((now - last) / 1000 || 0, 0, 0.05);
  last = now;
  tNow += dt;
  if (phase === 'play') step(dt);
  stepFx(dt);
  draw();
}

/* ==================== 输入 ==================== */
function toWorld(ev) {
  const rect = cv.getBoundingClientRect();
  const sx = (rect.width || W) / W;
  const sy = (rect.height || H) / H;
  return { x: ((ev.clientX || 0) - rect.left) / sx, y: ((ev.clientY || 0) - rect.top) / sy };
}

cv.addEventListener('pointerdown', (e) => {
  sfx.resume();
  const p = toWorld(e);
  onTap(p.x, p.y);
});
cv.addEventListener('pointermove', (e) => {
  if (phase !== 'play') { hovered = -1; return; }
  const p = toWorld(e);
  const hit = hitTile(p.x, p.y);
  hovered = hit && hit.free ? hit.t.id : -1;
});
cv.addEventListener('pointerleave', () => { hovered = -1; });

btnUndo.addEventListener('click', () => { sfx.resume(); useUndo(); });
btnShuffle.addEventListener('click', () => { sfx.resume(); useShuffle(); });
btnPop.addEventListener('click', () => { sfx.resume(); usePopOut(); });
btnNew.addEventListener('click', () => { sfx.resume(); newGame(); });
btnSound.addEventListener('click', () => { btnSound.textContent = sfx.toggle() ? '🔇' : '🔊'; });

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  sfx.resume();
  const a = btn.dataset.act;
  if (a === 'start') startLevel(1);
  else if (a === 'next') startLevel(level + 1);
  else if (a === 'retry' || a === 'replay') startLevel(level);
  else if (a === 'again') newGame();
  else if (a === 'resume') { phase = 'play'; overlay.classList.remove('show'); hud(); }
});

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'u' || k === 'U') useUndo();
  else if (k === 's' || k === 'S') useShuffle();
  else if (k === 'd' || k === 'D') usePopOut();
  else if (k === 'r' || k === 'R') { sfx.resume(); startLevel(level); }
  else if (k === 'p' || k === 'P') togglePause();
  else if (k === 'Escape' && phase === 'play') togglePause();
  else if (k === 'h' || k === 'H' || k === '?') showIntro();
});

/* ==================== 启动 ==================== */
resize();
window.addEventListener('resize', resize);
startLevel(1);
showIntro();
requestAnimationFrame((t) => { last = t; frame(t); });

})();
