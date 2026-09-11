(() => {
'use strict';

/* 保质期 · 鲜度解谜
   核心机制：整座仓库和你自己都在倒计时。每走一步（或等一步、注一步）就是一回合，
   场上所有「会坏的东西」和玩家各 -1 鲜度；鲜度归零就翻面：
     货 🍎 → 腐堆（永久路障）｜板 🪵 → 塌成洞｜藤 🥬 → 烂开变路
   「灌注」不额外花时间：牺牲自己 1 点，让相邻一格本回合不衰减 —— 鲜度守恒，只有时间是泄漏。
   玩家鲜度上限 9，所以吃太新鲜的货会溢出浪费：什么时候吃、什么时候喂，就是这游戏的全部。 */

/* ==================== 关卡 ====================
   图例：# 墙  . 地板  D 门  P 出发位  1-9 货(数字=鲜度)
        a-i 板(序数=鲜度)  A-I 藤(序数=鲜度)  X 腐堆  ~ 洞 */
const LEVELS = [
  { name: '第一口', fresh: 4, tip: '踩到货就吃掉：它的鲜度加到你身上，但最多攒到 9 点', map: [
    '#####',
    '#P#D#',
    '#.3.#',
  ] },
  { name: '藤会烂', fresh: 6, tip: '🥬 藤会一格格烂掉，烂开就是新路 —— 原地等也是过一回合', map: [
    '#########',
    '#3P.C..D#',
    '#########',
  ] },
  { name: '桥在塌', fresh: 8, tip: '🪵 板每回合掉一格鲜度，塌成洞就再也回不去了 —— 别磨蹭', map: [
    '#########',
    '#P.cde.D#',
    '#########',
  ] },
  { name: '定格', fresh: 8, tip: '🫗 灌注：你 -2，相邻那一格本回合不烂 —— 撑住脚下的桥', map: [
    '##########',
    '#P.cC.9.D#',
    '##########',
  ] },
  { name: '堵门', fresh: 9, tip: '🍎 烂掉的货会变成 🦠 永久堵死那一格：要过门就得赶在它烂之前', map: [
    '###########',
    '#P.2.C.6.7#',
    '##.#####.D#',
    '#.......#.#',
    '###########',
  ] },
  { name: '两条路', fresh: 5, tip: '近路没补给，远路有整排货 —— 先算算自己的命够不够长', map: [
    '############',
    '#P.4.F....D#',
    '##.######.##',
    '#.9..9..9..#',
    '############',
  ] },
  { name: '回廊', fresh: 5, tip: '回字形货架：随时能回头，但鲜度只减不加，来回一趟就是两条命', map: [
    '###########',
    '#P..d..G..#',
    '#.#.....#.#',
    '#.9.d.c.9.#',
    '#......C..#',
    '#####D#####',
    '###########',
  ] },
  { name: '仓库深处', fresh: 7, tip: '最后一关：藤、桥、货全在一起，别把灌注留到最后一步', map: [
    '###########',
    '#P..b.9..D#',
    '#.c#.#.C#.#',
    '#..9...8..#',
    '###########',
  ] },
];

/* ==================== 常量 ==================== */
const T = { FLOOR: 0, WALL: 1, DOOR: 2, GOOD: 3, PLANK: 4, VINE: 5, ROT: 6, HOLE: 7 };
const MAXF = 9;
const VINE_CHARS = 'ABCEFGHIJ';   // 藤的鲜度 1-9（跳过 D，D 是门）
const UNDOS_PER_LEVEL = 3;
const PAD = 12;
const WORLD_W = 460;
const WORLD_H = 400;
const STRIP_H = 34;

/* ==================== 元素 ==================== */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const levelEl = document.getElementById('level');
const freshEl = document.getElementById('fresh');
const goodsEl = document.getElementById('goods');
const scoreEl = document.getElementById('score');
const undoNEl = document.getElementById('undoN');
const pourStateEl = document.getElementById('pourState');
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');
const btnUndo = document.getElementById('btnUndo');
const btnWait = document.getElementById('btnWait');
const btnPour = document.getElementById('btnPour');

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
};
const sfx = window.Sfx.create({ storageKey: 'baozhiqi.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

/* ==================== 状态 ==================== */
let level = 1;
let score = 0;
let best = Number(store.get('baozhiqi.best') || 0);
let maxLevel = Number(store.get('baozhiqi.level') || 1);
if (!(maxLevel >= 1)) maxLevel = 1;

let cols = 0, rows = 0;
let type = [], fresh = [];
let px = 0, py = 0, pf = 0;
let turn = 0, eaten = 0, goodsTotal = 0;
let phase = 'title';          // title | play | dead | clear | alldone
let endWhy = '';
let undosLeft = UNDOS_PER_LEVEL;
let hist = [];
let face = { dx: 1, dy: 0 };
let pourMode = false;
let fx = [];                   // 漂浮文字 / 粒子
let cellSize = 48, gridX = 0, gridY = 0;
let anim = 0;                  // 全局动画时钟
let shake = 0;
let bob = 0;
let missedTip = false;

/* ==================== 小工具 ==================== */
const idx = (x, y) => y * cols + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
const perishable = (t) => t === T.GOOD || t === T.PLANK || t === T.VINE;
const walkable = (t) => t === T.FLOOR || t === T.DOOR || t === T.PLANK || t === T.GOOD;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

function parseCell(ch) {
  if (ch === '#') return { t: T.WALL, f: 0 };
  if (ch === 'D') return { t: T.DOOR, f: 0 };
  if (ch === 'X') return { t: T.ROT, f: 0 };
  if (ch === '~') return { t: T.HOLE, f: 0 };
  if (ch >= '1' && ch <= '9') return { t: T.GOOD, f: ch.charCodeAt(0) - 48 };
  if (ch >= 'a' && ch <= 'i') return { t: T.PLANK, f: ch.charCodeAt(0) - 96 };
  const v = VINE_CHARS.indexOf(ch);
  if (v >= 0) return { t: T.VINE, f: v + 1 };
  return { t: T.FLOOR, f: 0 };
}

/* ==================== 关卡装载 ==================== */
function startLevel(L, keepScore) {
  const cfg = LEVELS[clamp(L, 1, LEVELS.length) - 1];
  level = clamp(L, 1, LEVELS.length);
  rows = cfg.map.length;
  cols = cfg.map[0].length;
  type = [];
  fresh = [];
  goodsTotal = 0;
  eaten = 0;
  turn = 0;
  pf = cfg.fresh;
  hist = [];
  fx = [];
  undosLeft = UNDOS_PER_LEVEL;
  pourMode = false;
  shake = 0;
  endWhy = '';
  missedTip = false;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = cfg.map[y][x] || '#';
      if (ch === 'P') { px = x; py = y; type.push(T.FLOOR); fresh.push(0); continue; }
      const c = parseCell(ch);
      type.push(c.t);
      fresh.push(c.f);
      if (c.t === T.GOOD) goodsTotal++;
    }
  }
  if (!keepScore) score = 0;
  phase = 'play';
  hideOverlay();
  layout();
  hud();
}

function nextLevel() {
  if (level >= LEVELS.length) {
    phase = 'alldone';
    showAllDone();
    return;
  }
  startLevel(level + 1, true);
}

/* ==================== 回合推进 ==================== */
// pourIdx：本回合被灌注的格子（-1 表示没有）；返回 'ok' | 'dead' | 'lost'
function tickTurn(pourIdx) {
  turn++;
  pf -= 1;
  let fell = false;
  for (let i = 0; i < type.length; i++) {
    if (!perishable(type[i]) || fresh[i] <= 0) continue;
    fresh[i] -= 1;                          // 时间对所有人一视同仁
  }
  if (pourIdx >= 0 && perishable(type[pourIdx])) {
    pf -= 1;                                // 倒鲜度要额外付自己 1 点
    fresh[pourIdx] = Math.min(MAXF, fresh[pourIdx] + 1);
  }
  for (let i = 0; i < type.length; i++) {
    if (!perishable(type[i]) || fresh[i] > 0) continue;
    const x = i % cols, y = (i - x) / cols;
    if (type[i] === T.GOOD) {
      type[i] = T.ROT;                        // 烂货变永久路障：它会堵死走廊
      burst(x, y, '#a855f7');
      floatText(x, y, '烂了', '#c084fc');
    } else if (type[i] === T.PLANK) {
      type[i] = T.HOLE;                       // 板塌成洞：路会在时间里消失
      burst(x, y, '#94a3b8');
      if (x === px && y === py) fell = true;
    } else {
      type[i] = T.FLOOR;                      // 藤烂开：时间也能开路
      burst(x, y, '#a3e635');
      floatText(x, y, '开了', '#a3e635');
    }
    fresh[i] = 0;
  }
  if (pf <= 0) { pf = 0; return fail('你过期了'); }
  if (fell) return fail('脚下的桥塌了');
  if (!doorReachable()) return fail('路断了，再也到不了门口');
  return 'ok';
}

/* 死局判定：墙/洞/腐堆是永久障碍；藤早晚会烂开、板来得及踩，所以都算能过 */
function doorReachable() {
  let target = -1;
  for (let i = 0; i < type.length; i++) if (type[i] === T.DOOR) { target = i; break; }
  if (target < 0) return true;
  const seen = new Uint8Array(type.length);
  const start = idx(px, py);
  const q = [start];
  seen[start] = 1;
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    if (i === target) return true;
    const x = i % cols, y = (i - x) / cols;
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (let k = 0; k < 4; k++) {
      const nx = nb[k][0], ny = nb[k][1];
      if (!inBounds(nx, ny)) continue;
      const j = idx(nx, ny);
      if (seen[j]) continue;
      const t = type[j];
      if (t === T.WALL || t === T.HOLE || t === T.ROT) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return false;
}

function fail(why) {
  endWhy = why;
  phase = 'dead';
  shake = 0.6;
  sfxFail();
  if (score > best) { best = score; store.set('baozhiqi.best', String(best)); }
  hud();
  showDead();
  return 'fail';
}

function checkWin() {
  if (phase !== 'play') return false;
  if (type[idx(px, py)] !== T.DOOR) return false;
  if (eaten < goodsTotal) {
    missedTip = true;
    floatText(px, py, '还有 ' + (goodsTotal - eaten) + ' 件货', '#fbbf24');
  }
  endLevel();
  return true;
}

function endLevel() {
  phase = 'clear';
  const bonus = pf * 30 + undosLeft * 40;
  score += bonus;
  if (level + 1 > maxLevel) {
    maxLevel = level + 1;
    store.set('baozhiqi.level', String(Math.min(maxLevel, LEVELS.length)));
  }
  if (score > best) { best = score; store.set('baozhiqi.best', String(best)); }
  sfxWin();
  hud();
  showClear(bonus);
}

/* ==================== 玩家行动 ==================== */
function pushHist() {
  hist.push({
    type: type.slice(), fresh: fresh.slice(),
    px: px, py: py, pf: pf, turn: turn, eaten: eaten, score: score,
  });
  if (hist.length > 40) hist.shift();
}

function eatAt(i) {
  const got = fresh[i];
  const waste = Math.max(0, pf + got - MAXF);
  pf = Math.min(MAXF, pf + got);
  const x = i % cols, y = (i - x) / cols;
  floatText(x, y, '+' + got, waste ? '#f87171' : '#a3e635', waste ? '溢出 ' + waste : '');
  if (waste) shake = Math.max(shake, 0.18);
  type[i] = T.FLOOR;
  fresh[i] = 0;
  eaten++;
  score += 60 + level * 20;
  sfxEat();
}

function tryStep(dx, dy) {
  if (phase !== 'play') return false;
  face = { dx: dx, dy: dy };
  if (!inBounds(px + dx, py + dy)) { sfxBlocked(); shake = 0.18; return false; }
  const i = idx(px + dx, py + dy);
  const t = type[i];
  if (!walkable(t)) { sfxBlocked(); shake = 0.18; floatText(px + dx, py + dy, blockedWord(t), '#8fa3bf'); return false; }
  pushHist();
  px += dx; py += dy;
  bob = 1;
  if (type[i] === T.GOOD) eatAt(i);
  const r = tickTurn(-1);
  afterAction(r);
  return r !== false;
}

function blockedWord(t) {
  if (t === T.VINE) return '藤';
  if (t === T.ROT) return '腐';
  if (t === T.HOLE) return '洞';
  return '墙';
}

function waitTurn() {
  if (phase !== 'play') return false;
  pushHist();
  const r = tickTurn(-1);
  afterAction(r);
  return r !== false;
}

function canPour(i) {
  if (phase !== 'play') return false;
  if (pf < 3) return false;              // 灌注要额外付 1 点，别拿命开玩笑
  if (i < 0 || i >= type.length) return false;
  if (!perishable(type[i])) return false;
  const x = i % cols, y = (i - x) / cols;
  return Math.abs(x - px) + Math.abs(y - py) === 1 || (x === px && y === py);
}

function pour(i) {
  if (!canPour(i)) { sfxBlocked(); return false; }
  pushHist();
  const x = i % cols, y = (i - x) / cols;
  floatText(x, y, '续', '#22d3ee');
  const r = tickTurn(i);
  sfxPour();
  afterAction(r);
  return r !== false;
}

function pourFace() {
  return pour(idx(px + face.dx, py + face.dy));
}

function afterAction(r) {
  hud();
  if (r === 'fail') return;
  if (phase === 'play') checkWin();
  hud();
}

function useUndo() {
  if (phase === 'play' || phase === 'dead') {
    if (!undosLeft || !hist.length) { sfxBlocked(); return false; }
    const s = hist.pop();
    type = s.type.slice();
    fresh = s.fresh.slice();
    px = s.px; py = s.py; pf = s.pf;
    turn = s.turn; eaten = s.eaten; score = s.score;
    undosLeft--;
    phase = 'play';
    endWhy = '';
    fx = [];
    sfxUndo();
    hud();
    hideOverlay();
    return true;
  }
  return false;
}

function restartLevel() { startLevel(level, false); }

/* ==================== 音效 ==================== */
function sfxEat() { sfx.tone(620, 0.07, 'triangle', 0.1, 0, 980); sfx.tone(940, 0.09, 'sine', 0.07, 0.05); }
function sfxPour() { sfx.tone(300, 0.1, 'sine', 0.09, 0, 700); sfx.noise(0.05, 0.03); }
function sfxBlocked() { sfx.tone(140, 0.11, 'sawtooth', 0.07, 0, 90); }
function sfxUndo() { sfx.tone(700, 0.1, 'sine', 0.08, 0, 320); }
function sfxWin() { sfx.melody([[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.2]]); }
function sfxFail() { sfx.melody([[392, 0.15], [311, 0.15], [262, 0.2], [180, 0.3]]); }

/* ==================== 特效 ==================== */
function floatText(x, y, text, color, extra) {
  fx.push({ kind: 'text', x: x, y: y, text: text, extra: extra || '', color: color || '#e2e8f0', t: 0, life: 1.1 });
}
function burst(x, y, color) {
  for (let k = 0; k < 9; k++) {
    const a = (Math.PI * 2 * k) / 9 + Math.random();
    fx.push({ kind: 'dot', x: x, y: y, vx: Math.cos(a) * (34 + Math.random() * 40), vy: Math.sin(a) * 34 - 20, color: color, t: 0, life: 0.6 });
  }
}
/* ==================== 布局 / 尺寸 ==================== */
let scale = 1;
function layout() {
  const availW = WORLD_W - PAD * 2;
  const availH = WORLD_H - STRIP_H - PAD * 2;
  cellSize = Math.max(10, Math.floor(Math.min(availW / cols, availH / rows, 64)));
  gridX = Math.round((WORLD_W - cellSize * cols) / 2);
  gridY = Math.round(STRIP_H + (WORLD_H - STRIP_H - cellSize * rows) / 2);
}

function resize() {
  const rect = cv.getBoundingClientRect();
  const cssW = rect.width || WORLD_W;
  const k = cssW / WORLD_W;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(WORLD_W * k * dpr));
  cv.height = Math.max(1, Math.round(WORLD_H * k * dpr));
  scale = k * dpr;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
window.addEventListener('resize', resize);

function toWorld(e) {
  const rect = cv.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / (rect.width || WORLD_W)) * WORLD_W;
  const y = ((e.clientY - rect.top) / (rect.height || WORLD_H)) * WORLD_H;
  return { x: x, y: y };
}
function toCell(wx, wy) {
  const x = Math.floor((wx - gridX) / cellSize);
  const y = Math.floor((wy - gridY) / cellSize);
  return inBounds(x, y) ? { x: x, y: y } : null;
}

/* ==================== HUD ==================== */
function hud() {
  levelEl.textContent = String(level);
  freshEl.textContent = String(pf);
  goodsEl.textContent = eaten + '/' + goodsTotal;
  scoreEl.textContent = String(score);
  undoNEl.textContent = String(undosLeft);
  pourStateEl.textContent = pourMode ? '开' : '关';
  btnUndo.disabled = !undosLeft || !hist.length;
  btnUndo.classList.toggle('used', !undosLeft);
  btnPour.classList.toggle('on', pourMode);
  goodsEl.classList.toggle('danger', goodsTotal - eaten > 0 && minGoodFresh() <= 1);
  btnWait.disabled = phase !== 'play';
  btnPour.disabled = phase !== 'play';
  freshEl.classList.toggle('pop', false);
}

function minGoodFresh() {
  let m = 9;
  for (let i = 0; i < type.length; i++) if (type[i] === T.GOOD && fresh[i] > 0 && fresh[i] < m) m = fresh[i];
  return m;
}

/* ==================== 遮罩 ==================== */
function showOverlay(html) { overlayContent.innerHTML = html; overlay.classList.add('show'); }
function hideOverlay() { overlay.classList.remove('show'); }

function showIntro() {
  showOverlay('<div class="ov-emoji">🧺</div><h2>保质期</h2>' +
    '<p class="hint">整仓货都在烂，你自己也在烂。<br>' +
    '每动一次 = 一回合 = 场上所有会坏的东西和你各 -1 鲜度。<br>' +
    '🍎 吃掉它续命加分，烂掉则永久堵路<br>' +
    '🪵 板会塌成洞 ｜ 🥬 藤会烂出通路 ｜ 🚪 活着走到门口就赢<br>' +
    '🫗 灌注：花自己 1 点，换相邻一格这回合不衰减（上限 9，太新鲜的吃了会溢出）</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开始营业</button>' +
    '<button class="ghost" data-act="free">跳到第 ' + Math.min(maxLevel, LEVELS.length) + ' 关</button></div>');
}

function showClear(bonus) {
  const last = level >= LEVELS.length;
  showOverlay('<div class="ov-emoji">✅</div><h2>第 ' + level + ' 关 · ' + LEVELS[level - 1].name + '</h2>' +
    '<div class="final-score">' + score + '<span> 分</span></div>' +
    '<div class="report">' +
    '<div><b>' + eaten + '/' + goodsTotal + '</b><span>收货</span></div>' +
    '<div><b>' + pf + '</b><span>剩余鲜度</span></div>' +
    '<div><b>+' + bonus + '</b><span>通关奖励</span></div>' +
    '</div>' +
    (eaten < goodsTotal ? '<p class="final-sub">漏收 ' + (goodsTotal - eaten) + ' 件货 —— 它们迟早会变成 🦠 把路堵死</p>' : '') +
    (last ? '' : '<p class="hint">下一关「' + LEVELS[level].name + '」：' + LEVELS[level].tip + '</p>') +
    '<div class="ov-actions">' +
    (last ? '<button class="primary" data-act="next">打烊结算</button>'
          : '<button class="primary" data-act="next">下一关</button>') +
    '<button class="ghost" data-act="replay">重打本关</button></div>');
}

function showDead() {
  showOverlay('<div class="ov-emoji">🦠</div><h2>' + (endWhy || '这单废了') + '</h2>' +
    '<p class="hint">' + LEVELS[level - 1].tip + '</p>' +
    '<p class="hint">第 ' + level + ' 关 · ' + LEVELS[level - 1].name +
    ' ｜ 收了 ' + eaten + '/' + goodsTotal + ' 件货 ｜ 活了 ' + turn + ' 回合</p>' +
    '<div class="ov-actions">' +
    (undosLeft && hist.length ? '<button class="primary" data-act="undo">↶ 倒回一回合（剩 ' + undosLeft + '）</button>' : '') +
    '<button class="' + (undosLeft && hist.length ? 'ghost' : 'primary') + '" data-act="retry">重来本关</button></div>');
}

function showAllDone() {
  if (score > best) { best = score; store.set('baozhiqi.best', String(best)); }
  showOverlay('<div class="ov-emoji">🏆</div><h2>全部清空，打烊！</h2>' +
    '<div class="final-score">' + score + '<span> 分</span></div>' +
    '<p class="hint">本机最高 ' + best + ' 分 ｜ ' + LEVELS.length + ' 关全部收工</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再开一天</button></div>');
}

/* ==================== 绘制 ==================== */
const COL = { floorA: '#101a2b', floorB: '#0d1625' };
const KIND_EMOJI = {};
KIND_EMOJI[T.GOOD] = '🍎';
KIND_EMOJI[T.PLANK] = '🪵';
KIND_EMOJI[T.VINE] = '🥬';
KIND_EMOJI[T.ROT] = '🦠';
KIND_EMOJI[T.DOOR] = '🚪';

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function freshColor(f) {
  if (f >= 5) return '#a3e635';
  if (f >= 3) return '#fbbf24';
  if (f === 2) return '#fb923c';
  return '#f87171';
}

function cellRect(x, y, inset) {
  const s = cellSize;
  return { x: gridX + x * s + inset, y: gridY + y * s + inset, w: s - inset * 2, h: s - inset * 2 };
}

function drawBase(x, y) {
  const i = idx(x, y);
  const t = type[i];
  const r = cellRect(x, y, 2);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  if (t === T.WALL) {
    ctx.fillStyle = '#222e45';
    roundRect(r.x, r.y, r.w, r.h, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(r.x, r.y, r.w, Math.max(2, r.h * 0.22), 7); ctx.fill();
    return;
  }
  if (t === T.HOLE) {
    ctx.fillStyle = '#05080f';
    roundRect(r.x, r.y, r.w, r.h, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.16)';
    ctx.lineWidth = 1.5;
    roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 8); ctx.stroke();
    return;
  }
  // 其余都先铺一层地板
  ctx.fillStyle = (x + y) % 2 ? COL.floorB : COL.floorA;
  roundRect(r.x, r.y, r.w, r.h, 9); ctx.fill();

  if (t === T.ROT) {
    ctx.fillStyle = 'rgba(120, 60, 140, 0.35)';
    roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 8); ctx.fill();
  }
  if (t === T.PLANK) {
    ctx.fillStyle = '#6b4a2b';
    roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(r.x + 3, r.y + r.h * 0.32, r.w - 6, 2);
    ctx.fillRect(r.x + 3, r.y + r.h * 0.66, r.w - 6, 2);
  }
  if (t === T.VINE) {
    ctx.fillStyle = 'rgba(21, 128, 61, 0.45)';
    roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 10); ctx.fill();
  }
  if (t === T.DOOR) {
    const ready = eaten >= goodsTotal;
    const pulse = ready ? 0.5 + 0.5 * Math.sin(anim * 4) : 0.18;
    ctx.fillStyle = 'rgba(163, 230, 53, ' + (0.1 + pulse * 0.28).toFixed(3) + ')';
    roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 10); ctx.fill();
    ctx.strokeStyle = ready ? 'rgba(163,230,53,0.85)' : 'rgba(148,163,184,0.3)';
    ctx.lineWidth = 2;
    roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 10); ctx.stroke();
  }
  if (t === T.GOOD) {
    ctx.fillStyle = 'rgba(163, 230, 53, 0.1)';
    roundRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4, 10); ctx.fill();
  }

  const emoji = KIND_EMOJI[t];
  if (emoji) {
    const danger = perishable(t) && fresh[i] === 1;
    ctx.save();
    if (danger) {
      ctx.globalAlpha = 0.62 + 0.38 * Math.abs(Math.sin(anim * 6));
      ctx.strokeStyle = 'rgba(248,113,113,0.85)';
      ctx.lineWidth = 2;
      roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 10); ctx.stroke();
    }
    ctx.font = Math.round(cellSize * 0.44) + 'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy - cellSize * 0.04);
    ctx.restore();
  }
  if (perishable(t) && fresh[i] > 0) drawFreshRing(cx, cy, fresh[i]);
}

function drawFreshRing(cx, cy, f) {
  const rad = cellSize * 0.36;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(148,163,184,0.16)';
  ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
  const a0 = -Math.PI / 2;
  ctx.strokeStyle = freshColor(f);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, rad, a0, a0 + Math.PI * 2 * (f / MAXF));
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.font = 'bold ' + Math.round(cellSize * 0.22) + 'px ui-monospace,Menlo,monospace';
  ctx.fillStyle = freshColor(f);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(String(f), cx + rad * 0.98, cy + rad * 1.02);
}

function drawHighlights() {
  if (phase !== 'play') return;
  // 灌注模式：亮起所有可注目标
  const targets = [];
  for (let d = 0; d < 4; d++) {
    const dx = [1, -1, 0, 0][d], dy = [0, 0, 1, -1][d];
    if (!inBounds(px + dx, py + dy)) continue;
    const i = idx(px + dx, py + dy);
    if (canPour(i)) targets.push(i);
  }
  if (pourMode) {
    for (const i of targets) {
      const x = i % cols, y = (i - x) / cols;
      const r = cellRect(x, y, 4);
      ctx.strokeStyle = 'rgba(34,211,238,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -anim * 22;
      roundRect(r.x, r.y, r.w, r.h, 9); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // 面向格（按 E 会注入这里）
  const fi = idx(px + face.dx, py + face.dy);
  if (pourMode && inBounds(px + face.dx, py + face.dy) && canPour(fi)) {
    const x = fi % cols, y = (fi - x) / cols;
    const r = cellRect(x, y, 1);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2.5;
    roundRect(r.x, r.y, r.w, r.h, 11); ctx.stroke();
  }
}

function drawPlayer() {
  const r = cellRect(px, py, 3);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dy = Math.sin(anim * 3) * cellSize * 0.02 - bob * cellSize * 0.06;
  const danger = pf <= 2;
  ctx.save();
  ctx.fillStyle = danger ? 'rgba(248,113,113,0.22)' : 'rgba(226,232,240,0.1)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + cellSize * 0.3, cellSize * 0.28, cellSize * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  const rad = cellSize * 0.36;
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(148,163,184,0.2)';
  ctx.beginPath(); ctx.arc(cx, cy + dy, rad, 0, Math.PI * 2); ctx.stroke();
  const a0 = -Math.PI / 2;
  ctx.strokeStyle = freshColor(pf);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + dy, rad, a0, a0 + Math.PI * 2 * (pf / MAXF));
  ctx.stroke();
  ctx.lineCap = 'butt';
  if (danger) {
    ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(anim * 7));
  }
  ctx.font = Math.round(cellSize * 0.46) + 'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🚶', cx, cy + dy - cellSize * 0.02);
  ctx.globalAlpha = 1;
  ctx.font = 'bold ' + Math.round(cellSize * 0.26) + 'px ui-monospace,Menlo,monospace';
  ctx.fillStyle = freshColor(pf);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(String(pf), cx, cy + dy + rad * 0.62);
  ctx.restore();
}

function drawStrip() {
  ctx.fillStyle = 'rgba(148,163,184,0.07)';
  ctx.fillRect(0, 0, WORLD_W, STRIP_H - 6);
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 13px -apple-system,"PingFang SC",sans-serif';
  ctx.fillStyle = '#67e8f9';
  ctx.textAlign = 'left';
  ctx.fillText('第 ' + level + ' 关 · ' + LEVELS[level - 1].name, PAD, STRIP_H / 2 - 2);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('🍎 ' + eaten + '/' + goodsTotal + '   ⏳ 第 ' + turn + ' 回合   ↶ ' + undosLeft, WORLD_W - PAD, STRIP_H / 2 - 2);
}

function drawFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i];
    p.t += dt;
    const k = p.t / p.life;
    if (k >= 1) { fx.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - k * k;
    if (p.kind === 'text') {
      const r = cellRect(p.x, p.y, 0);
      ctx.font = 'bold 14px -apple-system,"PingFang SC",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, r.x + r.w / 2, r.y + r.h * 0.5 - k * 26);
      if (p.extra) {
        ctx.font = '11px -apple-system,"PingFang SC",sans-serif';
        ctx.fillStyle = '#f87171';
        ctx.fillText(p.extra, r.x + r.w / 2, r.y + r.h * 0.5 - k * 26 + 15);
      }
    } else {
      const cx = gridX + (p.x + 0.5) * cellSize + p.vx * p.t;
      const cy = gridY + (p.y + 0.5) * cellSize + p.vy * p.t + 160 * p.t * p.t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(0.5, 3.2 * (1 - k)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function draw() {
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = '#070c17';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  drawStrip();
  if (!cols) return;
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 12, (Math.random() - 0.5) * shake * 12);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) drawBase(x, y);
  drawHighlights();
  drawPlayer();
  drawFx(Math.min(0.05, animDt));
  ctx.restore();
}

let animDt = 0;
/* ==================== 更新 ==================== */
function update(dt) {
  anim += dt;
  animDt = dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 1.8);
  if (bob > 0) bob = Math.max(0, bob - dt * 6);
}

/* ==================== 输入 ==================== */
function act(dx, dy, pourIt) {
  if (phase !== 'play') return;
  if (pourIt) {
    const i = idx(px + dx, py + dy);
    pour(i);
    face = { dx: dx, dy: dy };
    return;
  }
  tryStep(dx, dy);
}

function tapCell(c, pourIt) {
  if (phase !== 'play') return;
  if (c.x === px && c.y === py) { waitTurn(); return; }
  const dx = c.x - px, dy = c.y - py;
  if (Math.abs(dx) + Math.abs(dy) !== 1) { floatText(c.x, c.y, '太远了', '#8fa3bf'); return; }
  const i = idx(c.x, c.y);
  if (pourIt || (pourMode && canPour(i))) { act(dx, dy, canPour(i)); return; }
  if (walkable(type[i])) { act(dx, dy, false); return; }
  if (canPour(i)) act(dx, dy, true);
  else { sfxBlocked(); floatText(c.x, c.y, blockedWord(type[i]), '#8fa3bf'); }
}

let down = null;
cv.addEventListener('pointerdown', (e) => {
  sfx.resume();
  const w = toWorld(e);
  down = { x: w.x, y: w.y, t: Date.now(), shift: !!e.shiftKey };
});
cv.addEventListener('pointerup', (e) => {
  if (!down) return;
  const w = toWorld(e);
  const dx = w.x - down.x, dy = w.y - down.y;
  const dist = Math.hypot(dx, dy);
  const shift = down.shift || !!e.shiftKey;
  down = null;
  if (dist > 26) {
    const horiz = Math.abs(dx) > Math.abs(dy);
    const mx = horiz ? (dx > 0 ? 1 : -1) : 0;
    const my = horiz ? 0 : (dy > 0 ? 1 : -1);
    if (phase === 'play') act(mx, my, shift || pourMode);
    return;
  }
  const c = toCell(w.x, w.y);
  if (c) tapCell(c, shift);
});
cv.addEventListener('pointercancel', () => { down = null; });

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const lower = String(k).toLowerCase();
  const dirs = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  };
  if (phase === 'title' && (k === 'Enter' || k === ' ')) { sfx.resume(); startLevel(1, false); return; }
  if (phase === 'clear' && (k === 'Enter' || k === ' ')) { sfx.resume(); nextLevel(); return; }
  if ((phase === 'dead' || phase === 'alldone') && (k === 'Enter' || k === ' ')) {
    sfx.resume();
    if (phase === 'alldone') { score = 0; startLevel(1, false); } else restartLevel();
    return;
  }
  const d = dirs[k] || dirs[lower];
  if (d) {
    e.preventDefault();
    sfx.resume();
    act(d[0], d[1], !!e.shiftKey);
    return;
  }
  if (lower === ' ') { sfx.resume(); waitTurn(); return; }
  if (lower === 'e') { sfx.resume(); facePour(); return; }
  if (lower === 'q') { sfx.resume(); pourMode = !pourMode; hud(); return; }
  if (lower === 'u') { sfx.resume(); useUndo(); return; }
  if (lower === 'r') { sfx.resume(); restartLevel(); return; }
});

function facePour() {
  if (phase !== 'play') return;
  if (!canPour(idx(px + face.dx, py + face.dy))) {
    // 面向格不能注时，找一个能注的相邻格
    let found = -1;
    for (let d = 0; d < 4; d++) {
      const dx = [1, -1, 0, 0][d], dy = [0, 0, 1, -1][d];
      if (inBounds(px + dx, py + dy) && canPour(idx(px + dx, py + dy))) { found = idx(px + dx, py + dy); face = { dx: dx, dy: dy }; break; }
    }
    if (found < 0) { sfxBlocked(); floatText(px, py, '无处可注', '#8fa3bf'); return; }
  }
  pourFace();
}

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!btn) return;
  const act2 = btn.dataset.act;
  sfx.resume();
  if (act2 === 'start') startLevel(1, false);
  else if (act2 === 'free') startLevel(Math.min(maxLevel, LEVELS.length), false);
  else if (act2 === 'next') nextLevel();
  else if (act2 === 'replay') startLevel(level, false);
  else if (act2 === 'retry') restartLevel();
  else if (act2 === 'undo') useUndo();
  else if (act2 === 'again') { score = 0; startLevel(1, false); }
});

btnUndo.addEventListener('click', () => { sfx.resume(); useUndo(); });
btnWait.addEventListener('click', () => { sfx.resume(); waitTurn(); });
btnPour.addEventListener('click', () => { sfx.resume(); pourMode = !pourMode; hud(); });
btnNew.addEventListener('click', () => { sfx.resume(); score = 0; startLevel(1, false); });
btnSound.addEventListener('click', () => {
  const m = sfx.toggle();
  btnSound.textContent = m ? '🔇' : '🔊';
});

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
layout();
resize();
phase = 'title';
hud();
showIntro();
requestAnimationFrame((t) => { last = t; frame(t); });

})();
