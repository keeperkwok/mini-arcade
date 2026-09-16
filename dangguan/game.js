(() => {
'use strict';

/* 一夫当关：这一作的塔和墙都是「路障」。
   敌人永远走当下最短的那条路，所以你放下的每一格都会当场改写全场路线；
   堵得太狠会不放行（必须留一条通路），而 🐏 只会直线冲、👻 会飞——它们在专门治「纯堆墙」。 */

/* ==================== 几何 ==================== */
const CELL = 40, COLS = 11, ROWS = 8;
const W = COLS * CELL, H = ROWS * CELL;
const MID_R = (ROWS / 2) | 0;
const SPAWN = { c: 0, r: MID_R };
const GATE = { c: COLS - 1, r: MID_R };
const cx = (c) => c * CELL + CELL / 2;
const cy = (r) => r * CELL + CELL / 2;
const gatePos = () => ({ x: cx(GATE.c), y: cy(GATE.r) });
const EMOJI_FONT = 'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';

/* ==================== DOM ==================== */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const goldEl = document.getElementById('gold');
const bricksEl = document.getElementById('bricks');
const livesEl = document.getElementById('lives');
const waveEl = document.getElementById('wave');
const modesEl = document.getElementById('modes');
const buildEl = document.getElementById('build');
const panelEl = document.getElementById('panel');
const routeEl = document.getElementById('route');
const btnWave = document.getElementById('btnWave');
const btnSpeed = document.getElementById('btnSpeed');
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
};
const sfx = window.Sfx.create({ storageKey: 'dangguan.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

/* ==================== 数值表 ==================== */
const DIFFS = [
  { id: 'easy', name: '新手', lives: 30, gold: 250, budget: 0.8, desc: '城防 30 · 敌人少两成' },
  { id: 'mid', name: '守将', lives: 20, gold: 210, budget: 1, desc: '标准难度' },
  { id: 'hard', name: '死守', lives: 15, gold: 180, budget: 1.3, desc: '城防 15 · 敌人多三成' },
];
const diffById = (id) => DIFFS.find((d) => d.id === id) || DIFFS[1];

const TOWERS = {
  bolt: { name: '连弩', emoji: '🏹', cost: 50, up: [45, 90], range: 3.0, cd: 0.5, dmg: 9,
    tip: '单体快射；重甲每中一箭都要减伤，它最吃亏' },
  bomb: { name: '投石', emoji: '💥', cost: 110, up: [95, 175], range: 3.3, cd: 1.55, dmg: 20, splash: 1.05,
    tip: '范围砸落、破甲减半；落点预判，但打不到飞行的 👻' },
  frost: { name: '冰井', emoji: '❄️', cost: 80, up: [70, 140], range: 2.7, cd: 0.95, dmg: 4, slow: 0.45, slowT: 1.6,
    tip: '伤害低但减速 45%，靠它给别的塔拖时间' },
};
const BRICK_COST = 2;          // 一面墙的砖
const WALL_HP = 110;
const RAM_DPS = 34;
const MAX_BRICKS = 24;
const BUILDS = ['bolt', 'bomb', 'frost', 'brick', 'wipe'];
const ACTS = ['start', 'resume', 'restart', 'pick'];
const UPACTS = ['up', 'sell'];
const WAVE_BRICKS = 3;

const KINDS = {
  grunt: { name: '走卒', emoji: '🐇', hp: 26, spd: 1.55, gold: 6, leak: 1, cost: 2, r: 12 },
  fast: { name: '轻燕', emoji: '🕊️', hp: 15, spd: 2.75, gold: 8, leak: 1, cost: 3, r: 11 },
  armor: { name: '重甲', emoji: '🛡️', hp: 74, spd: 0.98, gold: 16, leak: 2, cost: 6, r: 14, armor: 5 },
  ghost: { name: '幽灵', emoji: '👻', hp: 34, spd: 1.5, gold: 13, leak: 1, cost: 7, r: 12, fly: true },
  ram: { name: '撞墙兵', emoji: '🐏', hp: 58, spd: 1.15, gold: 12, leak: 1, cost: 5, r: 13, ram: true },
  boss: { name: '首领', emoji: '👹', hp: 430, spd: 0.82, gold: 75, leak: 4, cost: 25, r: 17, boss: true, armor: 3 },
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (k) => {
  const v = Number(store.get(k));
  return Number.isFinite(v) ? v : 0;
};
function waveKey(d) { return 'dangguan.wave.' + d; }

/* ==================== 网格 · 寻路 ==================== */
// occ: 'c,r' → { kind:'tower'|'wall', ref }
let occ = new Map();
let routeVer = 0;
let route = [];                 // 入口 → 城门的最短路（画出来给玩家看）
let routeCells = 0;

const cellKey = (c, r) => c + ',' + r;
const inGrid = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
const isGateCell = (c, r) => (c === SPAWN.c && r === SPAWN.r) || (c === GATE.c && r === GATE.r);

function blockedFor(c, r, from) {
  if (!inGrid(c, r)) return true;
  if (from && c === from.c && r === from.r) return false;   // 出发格（可能正被塔压住）永远可走
  return occ.has(cellKey(c, r));
}

/* BFS 最短路径：4 邻格，返回 [{x,y,c,r}, …]（不含起点）；无路返回 null */
function findPathFrom(c0, r0) {
  if (!inGrid(c0, r0)) return null;
  const start = r0 * COLS + c0;
  const goal = GATE.r * COLS + GATE.c;
  if (start === goal) return [];
  const prev = new Int32Array(COLS * ROWS).fill(-1);
  const seen = new Uint8Array(COLS * ROWS);
  const q = [start];
  seen[start] = 1;
  let head = 0;
  let found = false;
  while (head < q.length) {
    const cur = q[head++];
    if (cur === goal) { found = true; break; }
    const cc = cur % COLS, rr = (cur / COLS) | 0;
    const nb = [[cc + 1, rr], [cc - 1, rr], [cc, rr + 1], [cc, rr - 1]];
    for (const [nc, nr] of nb) {
      if (!inGrid(nc, nr)) continue;
      const id = nr * COLS + nc;
      if (seen[id]) continue;
      if (blockedFor(nc, nr, { c: c0, r: r0 })) continue;
      seen[id] = 1;
      prev[id] = cur;
      q.push(id);
    }
  }
  if (!found) return null;
  const cells = [];
  for (let id = goal; id !== start; id = prev[id]) {
    cells.push({ c: id % COLS, r: (id / COLS) | 0 });
    if (prev[id] < 0) return null;
  }
  cells.reverse();
  return cells.map((s) => ({ x: cx(s.c), y: cy(s.r), c: s.c, r: s.r }));
}
const routeExists = () => !!findPathFrom(SPAWN.c, SPAWN.r);

function pathLen(path, fromX, fromY) {
  let n = fromX == null ? 0 : Math.hypot(path[0].x - fromX, path[0].y - fromY);
  for (let i = 1; i < path.length; i++) n += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return n;
}
const cellOf = (x, y) => ({ c: clamp(Math.floor(x / CELL), 0, COLS - 1), r: clamp(Math.floor(y / CELL), 0, ROWS - 1) });

/* 布局变了：所有走地敌人重新找路（从自己脚下这一格出发） */
function relayout() {
  route = findPathFrom(SPAWN.c, SPAWN.r) || [];
  routeCells = route.length + 1;
  routeVer++;
  for (const e of enemies) {
    if (e.fly || e.ram || e.dead) continue;
    const at = cellOf(e.x, e.y);
    const p = findPathFrom(at.c, at.r);
    if (p && p.length) { e.path = p; e.pi = 0; }
    else if (p) { e.pi = e.path.length; }        // 已经站在城门格上
    e.left = e.path && e.path.length ? pathLen(e.path, e.x, e.y) : 0;
  }
  hudRoute();
}

/* ==================== 状态 ==================== */
let diff = diffById(store.get('dangguan.diff') || 'mid');
let phase = 'intro';            // intro | build | fight | pause | over
let towers = [];
let walls = [];
let enemies = [];
let shots = [];
let zaps = [];
let burns = [];
let parts = [];
let floats = [];
let queue = [];                 // 本波待出兵
let spawnT = 0;
let wave = 1;
let gold = 0, lives = 0, bricks = 0, kills = 0, score = 0, smashes = 0;
let tool = null;                // 当前选中的建造工具
let sel = null;                 // 选中的塔
let hover = null;               // {c,r}
let speed = 1;
let seconds = 0;
let shake = 0, gateFlash = 0;
let clock = 0;
let runSeed = 1;
let bankedKills = 0;          // 已并入累计击杀的部分，避免重复累加
let grnd = mulberry(1);         // 本局掉落/冰冻概率：换局才换序列，保证同样的仗能复现

/* ==================== HUD ==================== */
function bump(el, text) {
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove('pop');
  el.classList.add('pop');
}
function hud() {
  bump(goldEl, String(gold));
  bump(bricksEl, String(bricks));
  bump(livesEl, String(lives));
  bump(waveEl, String(wave));
  btnWave.textContent = phase === 'fight'
    ? ' ⚔ 第 ' + wave + ' 波进行中'
    : (wave === 1 ? ' ▶ 开打第 1 波' : ' ▶ 开打第 ' + wave + ' 波');
  btnWave.disabled = phase === 'fight' || phase === 'intro' || phase === 'over';
  btnSpeed.textContent = speed === 2 ? '2×' : '1×';
  renderBuild();
}
let routeHTML = '';
function hudRoute() {
  const left = queue.length + enemies.length;
  const html = '路线 <b>' + (routeCells || 0) + '</b> 格 · 击杀 <b>' + kills + '</b>' +
    (phase === 'fight' ? ' · 场上还剩 <b>' + left + '</b> 只' : '');
  if (html === routeHTML) return;
  routeHTML = html;
  routeEl.innerHTML = html;
}
function renderLegend() {
  const el = document.getElementById('legend');
  if (!el) return;
  el.innerHTML = Object.keys(KINDS).map((k) => {
    const v = KINDS[k];
    const tag = v.fly ? '无视路障' : v.ram ? '直线撞墙' : v.boss ? '每 5 波' : v.armor ? '减伤 ' + v.armor : '普通';
    return '<i>' + v.emoji + ' ' + v.name + ' · ' + tag + '</i>';
  }).join('');
}
function renderModes() {
  modesEl.innerHTML = DIFFS.map((d) =>
    '<button data-diff="' + d.id + '" class="' + (d.id === diff.id ? 'active' : '') + '" title="' + d.desc + '">' +
    d.name + '<small>' + (num(waveKey(d.id)) ? '最高 ' + num(waveKey(d.id)) + ' 波' : d.desc) + '</small></button>').join('');
}
function renderBuild() {
  const rows = [
    { k: 'bolt', i: '🏹', n: '连弩', c: String(TOWERS.bolt.cost), ok: gold >= TOWERS.bolt.cost },
    { k: 'bomb', i: '💥', n: '投石', c: String(TOWERS.bomb.cost), ok: gold >= TOWERS.bomb.cost },
    { k: 'frost', i: '❄️', n: '冰井', c: String(TOWERS.frost.cost), ok: gold >= TOWERS.frost.cost },
    { k: 'brick', i: '🧱', n: '砌墙', c: '砖×' + BRICK_COST, ok: bricks >= BRICK_COST },
    { k: 'wipe', i: '🗑', n: '拆除', c: '退款', ok: true },
  ];
  buildEl.innerHTML = rows.map((b) =>
    '<button class="b2' + (tool === b.k ? ' on' : '') + (b.ok ? '' : ' broke') + '" data-build="' + b.k + '"' +
    (b.ok ? '' : ' disabled') + '><i>' + b.i + '</i><span>' + b.n + '</span><b>' + b.c + '</b></button>').join('');
}
function towerStats(t) {
  const b = TOWERS[t.type];
  const k = clamp(t.lv - 1, 0, 2);
  return {
    dmg: b.dmg * [1, 1.75, 3.1][k],
    cd: b.cd * [1, 0.86, 0.74][k],
    range: (b.range + 0.25 * k) * CELL,
    splash: b.splash ? (b.splash + 0.14 * k) * CELL : 0,
    slow: b.slow ? b.slow + 0.07 * k : 0,
    slowT: b.slowT ? b.slowT + 0.35 * k : 0,
    shots: t.lv >= 3 && t.type === 'bolt' ? 2 : 1,
    burn: t.type === 'bomb' && t.lv >= 3,
    stun: t.type === 'frost' && t.lv >= 3,
  };
}
function upCost(t) {
  const b = TOWERS[t.type];
  return t.lv >= 3 ? 0 : b.up[t.lv - 1];
}
function sellValue(t) {
  const b = TOWERS[t.type];
  let paid = b.cost;
  for (let i = 1; i < t.lv; i++) paid += b.up[i - 1];
  return Math.round(paid * 0.6);
}
function showPanel() {
  if (!sel || !towers.includes(sel)) { panelEl.hidden = true; panelEl.innerHTML = ''; return; }
  const st = towerStats(sel);
  const b = TOWERS[sel.type];
  const cost = upCost(sel);
  const dps = st.dmg / st.cd * st.shots;
  panelEl.hidden = false;
  panelEl.innerHTML =
    '<span class="pi">' + b.emoji + '</span>' +
    '<span><span class="pn">' + b.name + ' Lv' + sel.lv + '</span></span>' +
    '<span class="pd">单发 ' + Math.round(st.dmg * 10) / 10 + ' · 间隔 ' + Math.round(st.cd * 100) / 100 +
    's · 射程 ' + Math.round(st.range / CELL * 10) / 10 + ' 格 · 约 ' + Math.round(dps) + ' DPS<br>' +
    (sel.lv >= 3 ? '已满级：' + (sel.type === 'bolt' ? '一息双发' : sel.type === 'bomb' ? '落点火势不灭' : '三成概率冻住') : b.tip) +
    '</span>' +
    (cost ? '<button class="up" data-act="up">升级 ' + cost + '</button>' : '') +
    '<button data-act="sell">卖掉 +' + sellValue(sel) + '</button>';
}

/* ==================== 遮罩 ==================== */
function show(html) { overlayContent.innerHTML = html; overlay.classList.add('show'); }
function hide() { overlay.classList.remove('show'); }

function introHTML(hasSave) {
  const s = hasSave ? readSave() : null;
  return '<div class="ov-emoji">🏰</div><h2>一夫当关</h2>' +
    '<p class="hint">塔和墙<b>都是路障</b>：敌人永远走当下最短的那条路，<br>' +
    '你放下的每一格，都会当场改写全场路线。<br>' +
    '🐏 撞墙兵只走直线、会砸烂挡路的墙；👻 幽灵直接飞过去。<br>' +
    '<b>必须给敌人留一条通路</b>，堵死了不放行。</p>' +
    '<div class="ov-actions">' +
    (s ? '<button class="primary" data-act="resume">继续第 ' + s.wave + ' 波</button>' : '') +
    '<button class="' + (s ? 'ghost' : 'primary') + '" data-act="start">开筑防线</button></div>';
}
function showIntro() {
  phase = 'intro';
  show(introHTML(readSave()));
  hud();
}
function showPause() {
  if (phase !== 'fight' && phase !== 'build') return;
  const back = phase;
  phase = 'pause';
  show('<div class="ov-emoji">⏸</div><h2>已暂停</h2>' +
    '<p class="hint">第 ' + wave + ' 波 · 城防 ' + lives + ' · 金币 ' + gold + '</p>' +
    '<div class="ov-actions"><button class="primary" data-act="resume">继续</button>' +
    '<button class="ghost" data-act="restart">放弃重开</button></div>');
  pauseBack = back;
}
let pauseBack = 'build';
function showOver() {
  phase = 'over';
  const bestW = num(waveKey(diff.id));
  sfx.melody([[392, 0.12], [330, 0.14], [262, 0.24]], 0.13);
  show('<div class="ov-emoji">💥</div><h2>城门失守</h2>' +
    '<p class="hint">' + diff.name + ' · 倒在第 <b>' + wave + '</b> 波 · 已守住 ' + Math.max(0, wave - 1) + ' 波' +
    (wave - 1 >= bestW && wave > 1 ? ' · 新纪录 🏆' : ' · 本机最佳 ' + bestW + ' 波') + '</p>' +
    '<div class="final-score">' + score + '<span> 分</span></div>' +
    '<div class="report">' +
    '<div><b>' + kills + '</b><span>击杀</span></div>' +
    '<div><b>' + towers.length + '</b><span>存活塔</span></div>' +
    '<div><b>' + walls.length + '</b><span>剩余墙</span></div>' +
    '<div><b>' + smashes + '</b><span>被砸墙</span></div>' +
    '<div><b>' + Math.round(seconds) + 's</b><span>坚守时长</span></div>' +
    '<div><b>' + bestW + '</b><span>该难度最佳</span></div>' +
    '</div>' +
    '<div class="ov-actions"><button class="primary" data-act="restart">再守一次</button>' +
    '<button class="ghost" data-act="pick">换难度</button></div>');
  hud();
}

/* ==================== 建造 ==================== */
function dropSave() {
  try { localStorage.removeItem('dangguan.save'); } catch (e) {}
}
function towerAt(c, r) { return towers.find((t) => t.c === c && t.r === r) || null; }
function wallAt(c, r) { return walls.find((w) => w.c === c && w.r === r) || null; }
function enemyAtCell(c, r) {
  return enemies.some((e) => {
    if (e.dead) return false;
    const at = cellOf(e.x, e.y);
    return at.c === c && at.r === r;
  });
}
function occupied(c, r) { return occ.has(cellKey(c, r)); }

function place(c, r) {
  if (phase === 'intro' || phase === 'over' || phase === 'pause') return false;
  if (!inGrid(c, r) || isGateCell(c, r)) return flash(c, r, '不能建在这里');
  const o = tool;
  if (!o) {
    const t = towerAt(c, r);
    sel = t || null;
    showPanel();
    return false;
  }
  if (o === 'wipe') {
    const t = towerAt(c, r);
    if (t) {
      gold += sellValue(t);
      occ.delete(cellKey(c, r));
      towers = towers.filter((x) => x !== t);
      sel = null;
      sfx.tone(300, 0.09, 'triangle', 0.14, 0, 170);
      floatText(cx(c), cy(r), '+' + sellValue(t), '#fbbf24');
    } else {
      const w = wallAt(c, r);
      if (!w) return flash(c, r, '这一格没东西');
      bricks = Math.min(MAX_BRICKS, bricks + BRICK_COST);
      occ.delete(cellKey(c, r));
      walls = walls.filter((x) => x !== w);
      sfx.tone(220, 0.07, 'square', 0.1);
      floatText(cx(c), cy(r), '回收砖×' + BRICK_COST, '#cbd5e1');
    }
    relayout();
    hud();
    showPanel();
    return true;
  }
  if (occupied(c, r)) return flash(c, r, '这一格已经满了');
  if (enemyAtCell(c, r)) return flash(c, r, '有敌人正在经过');
  if (o === 'brick') {
    if (bricks < BRICK_COST) return flash(c, r, '砖不够');
    const w = { c, r, hp: WALL_HP, maxHp: WALL_HP, hit: 0 };
    occ.set(cellKey(c, r), { kind: 'wall', ref: w });
    walls.push(w);
    bricks -= BRICK_COST;
    sfx.tone(520, 0.06, 'square', 0.12);
  } else {
    const def = TOWERS[o];
    if (!def) return false;
    if (gold < def.cost) return flash(c, r, '金币不够');
    const t = { type: o, c, r, lv: 1, cool: 0, flash: 0, aim: -Math.PI / 2, born: 0 };
    occ.set(cellKey(c, r), { kind: 'tower', ref: t });
    towers.push(t);
    gold -= def.cost;
    sel = t;
    sfx.tone(660, 0.07, 'triangle', 0.14);
  }
  // 放不下就当场回滚：必须留一条通路
  if (!routeExists()) {
    if (o === 'brick') {
      walls.pop();
      bricks += BRICK_COST;
    } else {
      towers.pop();
      gold += TOWERS[o].cost;
      sel = null;
    }
    occ.delete(cellKey(c, r));
    return flash(c, r, '路会被堵死！');
  }
  relayout();
  hud();
  showPanel();
  return true;
}
let badFlash = null;
function flash(c, r, msg) {
  badFlash = { c, r, life: 0.45, msg };
  floatText(cx(c), cy(r), msg, '#f87171');
  sfx.noise(0.08, 0.08);
  return false;
}
function floatText(x, y, text, color) {
  floats.push({ x, y, text, color, life: 1, max: 1 });
}
function upgrade() {
  if (!sel) return;
  const cost = upCost(sel);
  if (!cost || gold < cost) { sfx.noise(0.07, 0.07); return; }
  gold -= cost;
  sel.lv++;
  sel.flash = 1;
  sfx.melody([[659, 0.06], [880, 0.1]], 0.06);
  floatText(cx(sel.c), cy(sel.r), 'Lv' + sel.lv, '#34d399');
  hud();
  showPanel();
}

/* ==================== 波次 ==================== */
function hpMul(w) { return 1 + (w - 1) * 0.22 + Math.pow(w, 1.55) * 0.03; }

/* 出怪表用「种子 = 本局 + 波次」生成：同一难度下每一波的编成是固定的，可复现可测试 */
function wavePlan(w) {
  const rnd = mulberry(runSeed * 7919 + w * 104729);
  const pool = [['grunt', KINDS.grunt.cost]];
  if (w >= 2) pool.push(['fast', KINDS.fast.cost]);
  if (w >= 3) pool.push(['armor', KINDS.armor.cost]);
  if (w >= 4) pool.push(['ghost', KINDS.ghost.cost]);
  if (w >= 5) pool.push(['ram', KINDS.ram.cost]);
  let budget = Math.round((4 + w * 2.3 + Math.pow(w, 1.5) * 0.5) * diff.budget);
  const list = [];
  let guard = 0;
  while (budget > 0 && guard++ < 400) {
    const aff = pool.filter((p) => p[1] <= budget);
    if (!aff.length) break;
    const pick = aff[(rnd() * aff.length) | 0];
    list.push(pick[0]);
    budget -= pick[1];
  }
  if (w % 5 === 0) list.push('boss');
  return list;
}
function startWave() {
  if (phase !== 'build') return;
  queue = wavePlan(wave);
  spawnT = 0.5;
  phase = 'fight';
  sel = null;
  showPanel();
  sfx.melody([[392, 0.07], [523, 0.07], [659, 0.12]], 0.06);
  hud();
}
function spawn(kind) {
  const k = KINDS[kind];
  const e = {
    kind, name: k.name, emoji: k.emoji, r: k.r, fly: !!k.fly, ram: !!k.ram, boss: !!k.boss,
    armor: k.armor || 0, leak: k.leak, gold: Math.round(k.gold * (1 + wave * 0.02)),
    maxHp: Math.round(k.hp * hpMul(wave) * (k.boss ? 1.15 : 1)), x: cx(SPAWN.c), y: cy(SPAWN.r),
    spd: k.spd * CELL, slowT: 0, slow: 0, stun: 0, hit: 0, dead: false, wob: Math.random() * 6.28,
    path: [], pi: 0, left: 0, smash: 0,
  };
  e.hp = e.maxHp;
  const g = gatePos();
  if (e.fly) e.path = [{ x: g.x, y: g.y }];
  else if (e.ram) e.path = [{ x: g.x, y: e.y }];
  else {
    e.path = findPathFrom(SPAWN.c, SPAWN.r) || [{ x: g.x, y: g.y }];
  }
  e.left = pathLen(e.path, e.x, e.y);
  enemies.push(e);
}
function waveClear() {
  const bonus = 25 + wave * 6 + (lives === diff.lives ? 15 : 0);
  gold += bonus;
  score += 120;
  bricks = Math.min(MAX_BRICKS, bricks + WAVE_BRICKS);
  floatText(cx(GATE.c) - 40, cy(GATE.r) - 26, '+' + bonus + ' 金', '#fbbf24');
  sfx.melody([[784, 0.07], [988, 0.09], [1319, 0.14]], 0.07);
  wave++;
  phase = 'build';
  bank();
  saveRun();
  hud();
  renderModes();
}

/* ==================== 战斗 ==================== */
function hurt(e, dmg, opts) {
  const o = opts || {};
  let d = dmg;
  if (e.armor) d -= o.pierce ? e.armor * 0.5 : e.armor;
  d = Math.max(1, d);
  e.hp -= d;
  e.hit = 1;
  if (o.slow) { e.slow = Math.max(e.slow, o.slow); e.slowT = Math.max(e.slowT, o.slowT); }
  if (o.stun && grnd() < 0.3) e.stun = 0.7;
  if (e.hp <= 0 && !e.dead) kill(e);
  return d;
}
function kill(e) {
  e.dead = true;
  kills++;
  score += 10;
  gold += e.gold;
  if (grnd() < 0.12 && bricks < MAX_BRICKS) {
    bricks++;
    floatText(e.x, e.y - 20, '砖+1', '#cbd5e1');
  }
  floatText(e.x, e.y - 8, '+' + e.gold, '#fbbf24');
  burst(e.x, e.y, e.boss ? 26 : 10, e.boss ? '#f87171' : '#a7f3d0');
  if (e.boss) { shake = Math.max(shake, 0.5); sfx.noise(0.3, 0.16); }
  hudRoute();
  hud();
}
function leak(e) {
  e.dead = true;
  lives -= e.leak;
  gateFlash = 1;
  shake = Math.max(shake, 0.45);
  floatText(cx(GATE.c) - 20, cy(GATE.r) - 30, '-' + e.leak + ' 城防', '#f87171');
  sfx.tone(160, 0.22, 'sawtooth', 0.18, 0, 70);
  hud();
  if (lives <= 0) {
    lives = 0;
    endRun();
  }
}
/* 纪录每清一波就当场入档：中途关页面不该白打。
   口径是「守住了几波」——正在打第 N 波时城破，只算守住 N-1 波。 */
function bank() {
  const w = Math.max(0, wave - 1);
  if (w > num('dangguan.wave')) store.set('dangguan.wave', String(w));
  const wk = waveKey(diff.id);
  if (w > num(wk)) store.set(wk, String(w));
  if (score > num('dangguan.best')) store.set('dangguan.best', String(score));
  if (kills > bankedKills) {
    store.set('dangguan.kills', String(num('dangguan.kills') + (kills - bankedKills)));
    bankedKills = kills;
  }
}
function endRun() {
  bank();
  if (score > num('dangguan.best')) store.set('dangguan.best', String(score));
  store.set('dangguan.kills', String(num('dangguan.kills') + kills));
  store.set('dangguan.diff', diff.id);
  try { localStorage.removeItem('dangguan.save'); } catch (err) {}
  showOver();
}
function predict(e, ft) {
  if (!e.path || e.pi >= e.path.length) return { x: e.x, y: e.y };
  const w = e.path[e.pi];
  const dx = w.x - e.x, dy = w.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const v = e.spd * (e.slowT > 0 ? 1 - e.slow : 1) * (e.stun > 0 ? 0 : 1);
  return { x: e.x + dx / d * v * ft, y: e.y + dy / d * v * ft };
}
function fire(t, st) {
  const tx = cx(t.c), ty = cy(t.r);
  const targets = [];
  let left = st.shots;
  const taken = new Set();
  while (left-- > 0) {
    let pick = null;
    for (const e of enemies) {
      if (e.dead || taken.has(e)) continue;
      if (Math.hypot(e.x - tx, e.y - ty) > st.range + e.r * 0.5) continue;
      if (!pick || e.left < pick.left) pick = e;
    }
    if (!pick) break;
    taken.add(pick);
    targets.push(pick);
  }
  if (!targets.length) return false;
  t.aim = Math.atan2(targets[0].y - ty, targets[0].x - tx);
  t.flash = 1;
  for (const tgt of targets) {
    if (t.type === 'bolt') {
      shots.push({ kind: 'bolt', x: tx, y: ty, tgt, dmg: st.dmg, spd: 520, dead: false });
      sfx.tone(1250, 0.035, 'square', 0.05);
    } else if (t.type === 'bomb') {
      const d = Math.hypot(tgt.x - tx, tgt.y - ty);
      const ft = d / 300;
      const p = predict(tgt, ft);
      shots.push({ kind: 'bomb', x: tx, y: ty, x0: tx, y0: ty, tx: p.x, ty: p.y, t: 0, ft,
        dmg: st.dmg, splash: st.splash, burn: st.burn, dead: false });
      sfx.tone(240, 0.09, 'sawtooth', 0.08, 0, 150);
    } else {
      hurt(tgt, st.dmg, { slow: st.slow, slowT: st.slowT, stun: st.stun, pierce: true });
      zaps.push({ x1: tx, y1: ty, x2: tgt.x, y2: tgt.y, life: 0.16 });
      sfx.tone(1600, 0.05, 'sine', 0.05, 0, 900);
    }
  }
  return true;
}
function burst(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    parts.push({ x, y, vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 200, life: 0.4 + Math.random() * 0.4, color });
  }
}

function update(dt) {
  if (phase !== 'build' && phase !== 'fight') {
    for (const p of parts) { p.life -= dt * 0.6; }
    parts = parts.filter((p) => p.life > 0);
    return;
  }
  seconds += dt;
  dt *= speed;

  if (phase === 'fight') {
    spawnT -= dt;
    if (queue.length && spawnT <= 0) {
      spawn(queue.shift());
      spawnT = Math.max(0.3, 0.62 - wave * 0.012);
    }
  }

  /* 敌人前进 */
  for (const e of enemies) {
    if (e.dead) continue;
    e.hit = Math.max(0, e.hit - dt * 4);
    e.wob += dt * 6;
    if (e.stun > 0) { e.stun -= dt; continue; }
    if (e.slowT > 0) e.slowT = Math.max(0, e.slowT - dt);
    const spd = e.spd * (e.slowT > 0 ? 1 - e.slow : 1);
    if (e.ram) {
      const rr = cellOf(e.x, e.y).r;
      const aheadC = Math.floor((e.x + CELL * 0.52) / CELL);
      const o = occ.get(cellKey(aheadC, rr));
      if (o && o.kind === 'wall') {
        const w = o.ref;
        w.hp -= RAM_DPS * dt;
        w.hit = 1;
        e.smash = 1;
        if (grnd() < dt * 8) burst(cx(aheadC) - 14, e.y, 2, '#cbd5e1');
        if (w.hp <= 0) {
          occ.delete(cellKey(aheadC, rr));
          walls = walls.filter((x) => x !== w);
          smashes++;
          shake = Math.max(shake, 0.4);
          sfx.noise(0.22, 0.14);
          floatText(cx(aheadC), cy(rr), '墙塌了！', '#f87171');
          relayout();
        }
        e.left = Math.max(1, gatePos().x - e.x);
        continue;
      }
      e.smash = 0;
    }
    const done = walkAlong(e, dt, spd);
    if (done) leak(e);
  }
  enemies = enemies.filter((e) => !e.dead);

  /* 塔开火 */
  for (const t of towers) {
    t.cool -= dt;
    t.flash = Math.max(0, t.flash - dt * 5);
    if (t.cool > 0) continue;
    const st = towerStats(t);
    if (fire(t, st)) t.cool = st.cd;
    else t.cool = 0.12;
  }

  /* 弹道 */
  for (const s of shots) {
    if (s.kind === 'bolt') {
      const tgt = s.tgt;
      if (!tgt || tgt.dead) { s.dead = true; continue; }
      const dx = tgt.x - s.x, dy = tgt.y - s.y;
      const d = Math.hypot(dx, dy);
      const step = s.spd * dt;
      if (d <= step + 4) {
        hurt(tgt, s.dmg, {});
        burst(tgt.x, tgt.y, 3, '#fde68a');
        s.dead = true;
      } else {
        s.x += dx / d * step;
        s.y += dy / d * step;
      }
    } else {
      s.t += dt;
      if (s.t >= s.ft) {
        s.dead = true;
        for (const e of enemies) {
          if (e.dead || e.fly) continue;
          if (Math.hypot(e.x - s.tx, e.y - s.ty) <= s.splash + e.r * 0.4) hurt(e, s.dmg, { pierce: true });
        }
        burst(s.tx, s.ty, 12, '#fbbf24');
        shake = Math.max(shake, 0.18);
        sfx.noise(0.16, 0.1);
        if (s.burn) burns.push({ x: s.tx, y: s.ty, r: s.splash * 0.9, life: 1.8, dps: 8 });
      }
    }
  }
  shots = shots.filter((s) => !s.dead);

  for (const b of burns) {
    b.life -= dt;
    for (const e of enemies) {
      if (e.dead || e.fly) continue;
      if (Math.hypot(e.x - b.x, e.y - b.y) <= b.r) hurt(e, b.dps * dt, { pierce: true });
    }
  }
  burns = burns.filter((b) => b.life > 0);
  for (const z of zaps) z.life -= dt;
  zaps = zaps.filter((z) => z.life > 0);
  for (const w of walls) w.hit = Math.max(0, (w.hit || 0) - dt * 3);

  for (const p of parts) { p.vy += 620 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  parts = parts.filter((p) => p.life > 0);
  for (const f of floats) { f.life -= dt * 1.1; f.y -= dt * 22; }
  floats = floats.filter((f) => f.life > 0);
  if (badFlash) { badFlash.life -= dt; if (badFlash.life <= 0) badFlash = null; }
  shake = Math.max(0, shake - dt * 2.4);
  gateFlash = Math.max(0, gateFlash - dt * 2);

  enemies = enemies.filter((e) => !e.dead);
  hudRoute();
  if (phase === 'fight' && !queue.length && !enemies.length) waveClear();
}

function walkAlong(e, dt, spd) {
  let move = spd * dt;
  while (move > 0) {
    if (e.pi >= e.path.length) return true;
    const w = e.path[e.pi];
    const dx = w.x - e.x, dy = w.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d <= move || d === 0) {
      e.x = w.x; e.y = w.y;
      e.left = Math.max(0, e.left - d);
      move -= d;
      e.pi++;
    } else {
      e.x += dx / d * move;
      e.y += dy / d * move;
      e.left = Math.max(0, e.left - move);
      move = 0;
    }
  }
  return false;
}

/* ==================== 存档 ==================== */
function saveRun() {
  if (wave <= 1) return;
  const data = {
    diff: diff.id, wave, gold, lives, bricks, score, kills, seconds: Math.round(seconds),
    towers: towers.map((t) => [t.type, t.c, t.r, t.lv]),
    walls: walls.map((w) => [w.c, w.r]),
  };
  store.set('dangguan.save', JSON.stringify(data));
}
function readSave() {
  let s = null;
  try { s = store.get('dangguan.save') ? JSON.parse(store.get('dangguan.save')) : null; } catch (e) { return null; }
  if (!s || !Array.isArray(s.towers) || !Array.isArray(s.walls)) return null;
  const w = Number(s.wave);
  if (!(w >= 2) || !Number.isFinite(Number(s.gold)) || !Number.isFinite(Number(s.lives))) return null;
  const inCell = (v, hi) => Number(v) >= 0 && Number(v) <= hi;
  if (s.towers.some((t) => !Array.isArray(t) || t.length !== 4 || !TOWERS[t[0]] ||
    !inCell(t[1], COLS - 1) || !inCell(t[2], ROWS - 1) || !(Number(t[3]) >= 1 && Number(t[3]) <= 3))) return null;
  if (s.walls.some((v) => !Array.isArray(v) || v.length !== 2 ||
    !inCell(v[0], COLS - 1) || !inCell(v[1], ROWS - 1))) return null;
  return s;
}
function loadSave() {
  const s = readSave();
  if (!s) return false;
  resetRun(diffById(s.diff));
  diff = diffById(s.diff);
  wave = Number(s.wave);
  gold = Number(s.gold);
  lives = Number(s.lives);
  bricks = Number(s.bricks) || 0;
  score = Number(s.score) || 0;
  kills = Number(s.kills) || 0;
  bankedKills = kills;
  seconds = Number(s.seconds) || 0;
  for (const t of s.towers) {
    const tower = { type: t[0], c: Number(t[1]), r: Number(t[2]), lv: Number(t[3]) || 1, cool: 0, flash: 0, aim: -Math.PI / 2 };
    occ.set(cellKey(tower.c, tower.r), { kind: 'tower', ref: tower });
    towers.push(tower);
  }
  for (const v of s.walls) {
    const w = { c: Number(v[0]), r: Number(v[1]), hp: WALL_HP, maxHp: WALL_HP, hit: 0 };
    occ.set(cellKey(w.c, w.r), { kind: 'wall', ref: w });
    walls.push(w);
  }
  relayout();
  phase = 'build';
  hide();
  hud();
  showPanel();
  renderModes();
  return true;
}

/* ==================== 开局 ==================== */
function resetRun(nextDiff) {
  diff = nextDiff || diff;
  store.set('dangguan.diff', diff.id);
  runSeed = 1 + (DIFFS.indexOf(diff) + 1) * 977;
  occ = new Map();
  towers = [];
  walls = [];
  enemies = [];
  shots = [];
  zaps = [];
  burns = [];
  parts = [];
  floats = [];
  queue = [];
  spawnT = 0;
  wave = 1;
  gold = diff.gold;
  lives = diff.lives;
  bricks = 10;
  kills = 0;
  bankedKills = 0;
  grnd = mulberry(runSeed * 2654435761);
  score = 0;
  smashes = 0;
  tool = 'bolt';
  sel = null;
  hover = null;
  speed = 1;
  seconds = 0;
  shake = 0;
  gateFlash = 0;
  badFlash = null;
  relayout();
  hud();
  showPanel();
  renderModes();
  renderLegend();
}
function newRun(d) {
  resetRun(d);
  phase = 'build';
  hide();
  hud();
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

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 8, (Math.random() - 0.5) * shake * 8);

  /* 草地 */
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const even = (c + r) % 2 === 0;
      ctx.fillStyle = even ? '#16241d' : '#132019';
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  }
  ctx.strokeStyle = 'rgba(148,163,184,0.07)';
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) { ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke(); }
  for (let r = 1; r < ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke(); }

  /* 燃烧的地面 */
  for (const b of burns) {
    ctx.globalAlpha = clamp(b.life / 1.8, 0, 1) * 0.4;
    const g = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, b.r);
    g.addColorStop(0, '#fb923c');
    g.addColorStop(1, 'rgba(120,53,15,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* 敌人的必经之路 */
  if (route.length) {
    ctx.strokeStyle = 'rgba(251,191,36,0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([9, 9]);
    ctx.lineDashOffset = -(clockNow() * 26) % 18;
    ctx.beginPath();
    ctx.moveTo(cx(SPAWN.c), cy(SPAWN.r));
    for (const s of route) ctx.lineTo(s.x, s.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* 入口 / 城门 */
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 26 + EMOJI_FONT;
  ctx.fillText('⛺', cx(SPAWN.c), cy(SPAWN.r));
  ctx.save();
  if (gateFlash > 0) { ctx.globalAlpha = 0.4 + gateFlash * 0.6; }
  ctx.fillText('🏯', cx(GATE.c), cy(GATE.r));
  ctx.restore();
  ctx.font = 'bold 9px -apple-system,"PingFang SC",sans-serif';
  ctx.fillStyle = 'rgba(226,232,240,0.7)';
  ctx.fillText('入口', cx(SPAWN.c), cy(SPAWN.r) + 17);
  ctx.fillStyle = gateFlash > 0 ? '#f87171' : 'rgba(226,232,240,0.7)';
  ctx.fillText('城门 ' + lives, cx(GATE.c), cy(GATE.r) + 17);

  /* 悬停 / 可建提示 */
  if (hover && (tool || towerAt(hover.c, hover.r))) drawGhost();
  if (sel) drawRange(cx(sel.c), cy(sel.r), towerStats(sel).range, 'rgba(52,211,153,0.9)');

  /* 墙 */
  for (const w of walls) {
    const x = w.c * CELL, y = w.r * CELL;
    ctx.fillStyle = w.hit ? '#fca5a5' : '#7c5c3e';
    ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 3 + i * ((CELL - 6) / 3));
      ctx.lineTo(x + CELL - 3, y + 3 + i * ((CELL - 6) / 3));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x + CELL / 2, y + 3); ctx.lineTo(x + CELL / 2, y + 3 + (CELL - 6) / 3);
    ctx.moveTo(x + CELL / 4, y + 3 + (CELL - 6) / 3); ctx.lineTo(x + CELL / 4, y + 3 + (CELL - 6) * 2 / 3);
    ctx.stroke();
    if (w.hp < w.maxHp) hpBar(x + 4, y + CELL - 6, CELL - 8, w.hp / w.maxHp, '#fbbf24');
  }

  /* 塔 */
  for (const t of towers) drawTower(t);

  /* 敌人 */
  for (const e of enemies) drawEnemy(e);

  /* 弹道 */
  for (const s of shots) {
    if (s.kind === 'bolt') {
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 2;
      const a = s.tgt ? Math.atan2(s.tgt.y - s.y, s.tgt.x - s.x) : 0;
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(a) * 7, s.y - Math.sin(a) * 7);
      ctx.lineTo(s.x + Math.cos(a) * 7, s.y + Math.sin(a) * 7);
      ctx.stroke();
    } else {
      const p = clamp(s.t / s.ft, 0, 1);
      const x = s.x0 + (s.tx - s.x0) * p;
      const y = s.y0 + (s.ty - s.y0) * p - Math.sin(Math.PI * p) * 26;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(s.x0 + (s.tx - s.x0) * p, s.y0 + (s.ty - s.y0) * p, 6, 3, 0, 0, 6.3); ctx.fill();
      ctx.font = 16 + EMOJI_FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🪨', x, y);
    }
  }
  for (const z of zaps) {
    ctx.globalAlpha = clamp(z.life / 0.16, 0, 1);
    ctx.strokeStyle = '#a5f3fc';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(z.x1, z.y1); ctx.lineTo(z.x2, z.y2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* 粒子 / 飘字 */
  for (const p of parts) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of floats) {
    ctx.globalAlpha = clamp(f.life * 1.3, 0, 1);
    ctx.font = 'bold 12px -apple-system,"PingFang SC",sans-serif';
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

}
function hpBar(x, y, w, k, color) {
  ctx.fillStyle = 'rgba(2,6,23,0.65)';
  ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(k, 0, 1), 3);
}
function drawRange(x, y, r, color) {
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
function drawTower(t) {
  const b = TOWERS[t.type];
  const x = cx(t.c), y = cy(t.r);
  ctx.fillStyle = 'rgba(2,6,23,0.35)';
  ctx.beginPath();
  ctx.arc(x, y + 3, 15, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(x - 15, y - 15, x + 15, y + 15);
  g.addColorStop(0, t.type === 'bolt' ? '#3f2d16' : t.type === 'bomb' ? '#3b2412' : '#0f2f3a');
  g.addColorStop(1, t.type === 'bolt' ? '#78501f' : t.type === 'bomb' ? '#7c3a12' : '#155e75');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = t === sel ? '#fde68a' : 'rgba(148,163,184,0.35)';
  ctx.lineWidth = t === sel ? 2 : 1;
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  if (t.flash > 0.5) ctx.scale(1 + (t.flash - 0.5) * 0.2, 1 + (t.flash - 0.5) * 0.2);
  ctx.font = 19 + EMOJI_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.emoji, 0, -1);
  ctx.restore();
  ctx.font = 'bold 10px ui-monospace,Menlo,monospace';
  ctx.fillStyle = ['#cbd5e1', '#a7f3d0', '#fde68a'][t.lv - 1];
  ctx.textAlign = 'right';
  ctx.fillText('L' + t.lv, x + 15, y + 13);
}
function drawEnemy(e) {
  const bob = e.fly ? Math.sin(e.wob) * 3 - 6 : 0;
  const x = e.x, y = e.y + bob;
  if (!e.fly) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.7, e.r * 0.7, e.r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.slowT > 0) {
    ctx.strokeStyle = 'rgba(165,243,252,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, e.r + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.save();
  if (e.hit > 0) {
    ctx.globalAlpha = 1;
    ctx.shadowColor = '#f87171';
    ctx.shadowBlur = 12 * e.hit;
  }
  ctx.font = Math.round(e.r * 1.9) + EMOJI_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e.emoji, x, y);
  ctx.restore();
  if (e.smash > 0) {
    ctx.font = 12 + EMOJI_FONT;
    ctx.fillText('💢', x + 12, y - 12);
  }
  const k = e.hp / e.maxHp;
  if (k < 1 || e.boss) hpBar(x - e.r, y - e.r - 8, e.r * 2, k, e.boss ? '#f87171' : k > 0.5 ? '#34d399' : k > 0.25 ? '#fbbf24' : '#f87171');
}
function drawGhost() {
  const { c, r } = hover;
  if (isGateCell(c, r) || occupied(c, r)) return;
  const bad = enemyAtCell(c, r) || (tool === 'brick' && bricks < BRICK_COST) ||
    (tool && TOWERS[tool] && gold < TOWERS[tool].cost);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = bad ? 'rgba(248,113,113,0.35)' : 'rgba(52,211,153,0.28)';
  ctx.fillRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4);
  ctx.globalAlpha = 1;
  if (tool && TOWERS[tool]) {
    drawRange(cx(c), cy(r), towerStats({ type: tool, lv: 1 }).range, bad ? '#f87171' : '#34d399');
    ctx.font = 18 + EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.85;
    ctx.fillText(TOWERS[tool].emoji, cx(c), cy(r));
    ctx.globalAlpha = 1;
  } else if (tool === 'brick') {
    ctx.font = 18 + EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.85;
    ctx.fillText('🧱', cx(c), cy(r));
    ctx.globalAlpha = 1;
  }
}
function clockNow() { return clock; }

/* ==================== 主循环 ==================== */
let last = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const now = t || 0;
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0));
  last = now;
  clock += dt;
  update(dt);
  draw();
}

/* ==================== 交互 ==================== */
function setTool(k) {
  tool = tool === k ? null : k;
  if (tool) { sel = null; showPanel(); }
  hud();
}
buildEl.addEventListener('click', (e) => {
  const btn = e.target.closest ? e.target.closest('[data-build]') : null;
  if (!btn || !BUILDS.includes(btn.dataset.build)) return;
  sfx.resume();
  setTool(btn.dataset.build);
});
modesEl.addEventListener('click', (e) => {
  const btn = e.target.closest ? e.target.closest('[data-diff]') : null;
  if (!btn || !diffById(btn.dataset.diff).id) return;
  sfx.resume();
  const d = diffById(btn.dataset.diff);
  if (d.id === diff.id) return;
  if ((wave > 1 || towers.length || walls.length) && !confirm('换难度会重开这一局，确定？')) return;
  dropSave();
  newRun(d);
});
panelEl.addEventListener('click', (e) => {
  const btn = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!btn || !sel || !UPACTS.includes(btn.dataset.act)) return;
  const act = btn.dataset.act;
  if (act === 'up') upgrade();
  else if (act === 'sell') {
    const keep = tool;
    tool = 'wipe';
    place(sel.c, sel.r);
    tool = keep;
    hud();
  }
});
btnWave.addEventListener('click', () => {
  sfx.resume();
  if (phase === 'build') startWave();
});
btnSpeed.addEventListener('click', () => {
  speed = speed === 1 ? 2 : 1;
  hud();
});
btnSound.addEventListener('click', () => {
  btnSound.textContent = sfx.toggle() ? '🔇' : '🔊';
});
btnNew.addEventListener('click', () => {
  if ((wave > 1 || towers.length) && !confirm('重开一局？')) return;
  dropSave();
  newRun();
});
overlay.addEventListener('click', (e) => {
  const btn = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!btn || !ACTS.includes(btn.dataset.act)) return;
  const act = btn.dataset.act;
  sfx.resume();
  if (phase === 'pause') {                      // 暂停时只有「继续 / 重开」两个出口
    if (act === 'resume') { phase = pauseBack; hide(); hud(); }
    else if (act === 'restart') { dropSave(); newRun(); }
    return;
  }
  if (act === 'start') newRun();
  else if (act === 'resume') loadSave();
  else if (act === 'restart') { dropSave(); newRun(); }
  else if (act === 'pick') showIntro();
});

function cellFromEvent(ev) {
  const rect = cv.getBoundingClientRect();
  const sx = rect.width || W, sy = rect.height || H;
  const x = ((ev.clientX - (rect.left || 0)) / sx) * W;
  const y = ((ev.clientY - (rect.top || 0)) / sy) * H;
  return { c: Math.floor(x / CELL), r: Math.floor(y / CELL), x, y };
}
cv.addEventListener('pointermove', (ev) => {
  const at = cellFromEvent(ev);
  hover = inGrid(at.c, at.r) ? at : null;
});
cv.addEventListener('pointerleave', () => { hover = null; });
cv.addEventListener('pointerdown', (ev) => {
  sfx.resume();
  if (phase === 'intro') { newRun(); return; }
  if (phase === 'over' || phase === 'pause') return;
  const at = cellFromEvent(ev);
  if (!inGrid(at.c, at.r)) return;
  hover = at;
  place(at.c, at.r);
});

window.addEventListener('keydown', (e) => {
  const k = (e.key || '').toLowerCase();
  if (k === '1' || k === '2' || k === '3' || k === '4') setTool(['bolt', 'bomb', 'frost', 'brick'][+k - 1]);
  else if (k === 'q') setTool('wipe');
  else if (k === ' ') { if (phase === 'build') startWave(); e.preventDefault(); }
  else if (k === 'p') { if (phase === 'pause') { phase = pauseBack; hide(); hud(); } else showPause(); }
  else if (k === 's') { speed = speed === 1 ? 2 : 1; hud(); }
  else if (k === 'escape') { tool = null; sel = null; showPanel(); hud(); }
  else if (k === 'n') { if (phase === 'build' || phase === 'fight') newRun(); }
});

/* ==================== 启动 ==================== */
resize();
window.addEventListener('resize', resize);
resetRun();
showIntro();
hudRoute();
requestAnimationFrame((t) => { last = t; frame(t); });

})();
