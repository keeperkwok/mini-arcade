(() => {
'use strict';

/* 祖玛珠链：一串珠子沿轨道往洞口爬，青蛙在原地转脸吐珠，
   三颗同色相连即爆，一次爆多了会把链条顶回去，全消光才过关。 */

const W = 460, H = 640;
const R = 14;                 // 珠子半径
const GAP = 28;               // 珠心间距
const PROJ_V = 780;           // 吐珠初速
const BOMB = -2;
const FREEZE_AT = 6;          // 一次消掉这么多颗 → 短暂冻结

const SKINS = [
  ['#ffe4e6', '#e11d48'],     // 玫红
  ['#dbeafe', '#2563eb'],     // 蓝
  ['#dcfce7', '#16a34a'],     // 绿
  ['#fef3c7', '#d97706'],     // 橙
  ['#ede9fe', '#7c3aed'],     // 紫
  ['#cffafe', '#0891b2'],     // 青
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
const dangerEl = document.getElementById('danger');
const dlabEl = document.getElementById('dlab');
const dangerBar = dangerEl.parentNode;
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');
const btnSwap = document.getElementById('btnSwap');
const btnPause = document.getElementById('btnPause');
const btnHelp = document.getElementById('btnHelp');

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
};
const sfx = window.Sfx.create({ storageKey: 'zuma.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

/* ==================== 工具 ==================== */
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rnd = (n) => Math.floor(Math.random() * n);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/* ==================== 轨道 ==================== */
// 折线 + 圆角：waypoints 之间用二次贝塞尔把拐角磨圆
function roundedPolyline(wps, radius) {
  const out = [];
  const push = (x, y) => out.push({ x, y });
  push(wps[0][0], wps[0][1]);
  for (let i = 1; i < wps.length - 1; i++) {
    const [px, py] = wps[i - 1], [cx, cy] = wps[i], [nx, ny] = wps[i + 1];
    const din = Math.hypot(cx - px, cy - py) || 1;
    const dout = Math.hypot(nx - cx, ny - cy) || 1;
    const ux = (cx - px) / din, uy = (cy - py) / din;
    const vx = (nx - cx) / dout, vy = (ny - cy) / dout;
    const turn = Math.acos(clamp(ux * vx + uy * vy, -1, 1));
    const d = Math.min(radius, 0.42 * din, 0.42 * dout);
    const ax = cx - ux * d, ay = cy - uy * d;
    const bx = cx + vx * d, by = cy + vy * d;
    push(ax, ay);
    const n = Math.max(4, Math.round(turn * 9));
    for (let k = 1; k < n; k++) {
      const t = k / n, it = 1 - t;
      push(it * it * ax + 2 * it * t * cx + t * t * bx, it * it * ay + 2 * it * t * cy + t * t * by);
    }
    push(bx, by);
  }
  push(wps[wps.length - 1][0], wps[wps.length - 1][1]);
  return out;
}

function mkPath(src) {
  const pts = Array.isArray(src) ? src : src;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y));
  return { pts, cum, len: cum[cum.length - 1] };
}

function sample(fn, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const p = fn(i / steps);
    pts.push({ x: p[0], y: p[1] });
  }
  return pts;
}

// 弧长 s 处的坐标与切线角
function at(p, s) {
  const pts = p.pts, cum = p.cum, n = pts.length - 1;
  if (s <= 0) return { x: pts[0].x, y: pts[0].y, a: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) };
  if (s >= p.len) return { x: pts[n].x, y: pts[n].y, a: Math.atan2(pts[n].y - pts[n - 1].y, pts[n].x - pts[n - 1].x) };
  let lo = 0, hi = n;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid; else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const k = (s - cum[lo]) / seg;
  const A = pts[lo], B = pts[hi];
  return { x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k, a: Math.atan2(B.y - A.y, B.x - A.x) };
}

const SHAPES = {
  wave: () => sample((t) => [40 + 380 * t, 116 + 90 * Math.sin(t * Math.PI * 6.8) + 392 * t], 700),
  spiral: () => sample((t) => {
    const a = t * Math.PI * 2 * 2.9 - 1.1;
    const r = 202 - 136 * t;
    return [230 + r * Math.cos(a), 316 + r * Math.sin(a) * 1.24];
  }, 660),
  zigzag: () => roundedPolyline([
    [70, 96], [392, 96], [392, 208], [70, 208], [70, 320], [392, 320], [392, 432], [70, 432], [70, 544], [330, 544],
  ], 58),
  eight: () => sample((t) => [230 + 166 * Math.sin(t * Math.PI * 2), 306 + 196 * Math.sin(t * Math.PI * 4)], 560),
  pretzel: () => sample((t) => [
    228 + 164 * Math.sin(t * Math.PI * 4 + 0.7),
    306 + 196 * Math.sin(t * Math.PI * 6),
  ], 820),
  snail: () => sample((t) => {
    const a = t * Math.PI * 2 * 4.1 + 2.4;
    const r = 206 - 140 * t;
    return [228 + r * Math.cos(a), 316 + r * Math.sin(a) * 1.2];
  }, 900),
};

const LEVELS = [
  { name: '草原', shape: 'wave', colors: 4, balls: 27, speed: 26 },
  { name: '蛇形', shape: 'zigzag', colors: 4, balls: 33, speed: 31 },
  { name: '葫芦', shape: 'eight', colors: 5, balls: 36, speed: 33 },
  { name: '漩涡', shape: 'spiral', colors: 5, balls: 42, speed: 35, frogAt: [230, 316] },
  { name: '麻花', shape: 'pretzel', colors: 6, balls: 45, speed: 37 },
  { name: '蜗牛', shape: 'snail', colors: 6, balls: 51, speed: 40, frogAt: [228, 316] },
];
function levelCfg(lv) {
  const base = LEVELS[(lv - 1) % LEVELS.length];
  const loop = Math.floor((lv - 1) / LEVELS.length);
  return {
    name: loop ? base.name + ' ' + (loop + 1) + ' 圈' : base.name,
    shape: base.shape,
    colors: Math.min(SKINS.length, base.colors + (loop ? 1 : 0)),
    balls: base.balls + loop * 6,
    speed: base.speed * (1 + loop * 0.14) * (1 + Math.min(0.4, (lv - 1) * 0.02)),
    frogAt: base.frogAt,
  };
}

/* ==================== 状态 ==================== */
let phase = 'intro';         // intro | play | paused | between | over
let level = 1;
let cfg = LEVELS[0];
let path = mkPath(SHAPES.wave());
let frog = { x: 230, y: 560 };
let balls = [];              // 颜色序列，0 = 最靠前(离洞口最近)
let lead = 0;                // 头珠的弧长位置
let retreat = 0;             // 消子后的回推速度
let cur = 0, next = 0;
let projs = [], parts = [], pops = [];
let aim = -Math.PI / 2;
let score = 0, shots = 0, hits = 0, cleared = 0;
let combo = 0, comboT = 0, freeze = 0;
let shake = 0, flash = 0, glow = 0, tNow = 0;
let best = Number(store.get('zuma.best')) || 0;
let maxLevel = Number(store.get('zuma.level')) || 1;
let last = 0;

/* ==================== 关卡 ==================== */
// 离轨道越远越好；关卡指定过 frogAt 就优先用它（螺旋中心是祖玛的经典位）
function clearOf(p, x, y) {
  let m = 1e9;
  for (let i = 0; i < p.pts.length; i += 2) m = Math.min(m, dist(x, y, p.pts[i].x, p.pts[i].y));
  return m;
}

function pickFrog(p, preferred) {
  if (preferred && clearOf(p, preferred[0], preferred[1]) >= R * 3) return { x: preferred[0], y: preferred[1] };
  const cands = [[230, 320], [230, 580], [76, 580], [384, 580], [40, 320], [420, 320], [230, 60], [110, 100], [350, 100]];
  let bestC = cands[0], bestD = -1;
  for (const c of cands) {
    const m = clearOf(p, c[0], c[1]);
    if (m > bestD) { bestD = m; bestC = c; }
  }
  return { x: bestC[0], y: bestC[1] };
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// 队列按「三连」为最小单位生成：每种颜色总数永远是 3 的倍数，不会有清不掉的残珠；
// 相邻两组还必须不同色，否则会出现 6 连、9 连，一发下去整条链原地爆炸。
function makeGroups(colors, count) {
  const n = Math.max(2, Math.round(count / 3));
  const g = [];
  for (let i = 0; i < n; i++) g.push(rnd(colors));
  shuffle(g);
  for (let i = 1; i < g.length; i++) {
    if (g[i] !== g[i - 1]) continue;
    for (let j = i + 1; j < g.length; j++) {
      if (g[j] !== g[i] && (j + 1 >= g.length || g[j + 1] !== g[i])) {
        const t = g[i]; g[i] = g[j]; g[j] = t;
        break;
      }
    }
  }
  // 实在拆不开的相邻组：改色兜底(仍保持三色一组)
  for (let i = 1; i < g.length; i++) if (g[i] === g[i - 1]) g[i] = (g[i] + 1) % colors;
  return g;
}

function makeQueue(colors, count) {
  const q = [];
  for (const c of makeGroups(colors, count)) q.push(c, c, c);
  const bombs = level >= 3 ? (level >= 6 ? 2 : 1) : 0;
  for (let b = 0; b < bombs; b++) q.splice(10 + rnd(Math.max(1, q.length - 14)), 0, BOMB);
  return q;
}

// 只发盘面上还剩的颜色，保证玩家手里的珠总有地方用
function randBallColor() {
  // 只在盘面上真有炸弹时才发炸弹，不然玩家手里囤一堆用不掉的货
  if (level >= 3 && balls.indexOf(BOMB) >= 0 && Math.random() < 0.06) return BOMB;
  const present = [];
  for (let i = 0; i < balls.length; i++) if (balls[i] !== BOMB && present.indexOf(balls[i]) < 0) present.push(balls[i]);
  if (!present.length) return 0;
  return present[rnd(present.length)];
}

function startLevel(lv) {
  level = lv;
  cfg = levelCfg(lv);
  path = mkPath(SHAPES[cfg.shape]());
  frog = pickFrog(path, cfg.frogAt);
  // 轨道必须装得下整条珠链，否则尾珠永远出不来 → 按轨道长度封顶(保持 3 的倍数)
  const cap = Math.max(9, Math.floor((path.len - 90) / GAP / 3) * 3);
  balls = makeQueue(cfg.colors, Math.min(cfg.balls, cap));
  lead = 0;
  retreat = 0;
  projs = []; parts = []; pops = [];
  shots = 0; hits = 0; cleared = 0;
  combo = 0; comboT = 0; freeze = 0;
  cur = randBallColor(); next = randBallColor();
  aim = -Math.PI / 2;
  phase = 'play';
  overlay.classList.remove('show');
  if (lv > maxLevel) maxLevel = lv;
  store.set('zuma.level', String(maxLevel));
  hud();
}

function newGame() {
  score = 0;
  startLevel(1);
}

/* ==================== 珠子位置 ==================== */
const ballS = (i) => lead - i * GAP;

function ballXY(i) {
  return at(path, ballS(i));
}

/* ==================== 消除 ==================== */
function runAt(k) {
  const c = balls[k];
  if (c == null || c === BOMB) return null;
  let a = k;
  while (a > 0 && balls[a - 1] === c) a--;
  let b = k;
  while (b < balls.length - 1 && balls[b + 1] === c) b++;
  const len = b - a + 1;
  return len >= 3 ? { a, b, len, color: c } : null;
}

function blast(from, to, reason) {
  const lo = Math.max(0, from), hi = Math.min(balls.length - 1, to);
  if (hi < lo) return 0;
  const n = hi - lo + 1;
  const cut = balls.slice(lo, hi + 1);
  for (let i = 0; i < cut.length; i++) {
    const p = ballXY(lo + i);
    burst(p.x, p.y, cut[i]);
  }
  balls.splice(lo, n);
  cleared += n;
  combo++;
  comboT = 1.6;
  const gain = Math.round(10 * n * Math.max(1, n - 2) * (1 + (combo - 1) * 0.6) * (1 + (level - 1) * 0.12));
  score += gain;
  const mid = ballXY(clamp(lo, 0, Math.max(0, balls.length - 1)));
  pops.push({ x: mid.x, y: mid.y - 26, txt: '+' + gain, life: 1.1, col: combo > 1 ? '#fbbf24' : '#e2e8f0', big: combo > 1 });
  if (combo > 1) pops.push({ x: mid.x, y: mid.y - 48, txt: combo + ' 连锁', life: 1.2, col: '#f87171', big: true });
  retreat = Math.min(200, retreat + 34 + n * 13);
  shake = Math.min(1, shake + 0.25 + n * 0.05);
  flash = Math.min(1, flash + 0.2 + combo * 0.1);
  glow = 1;
  sfx.tone(300 + n * 60 + combo * 90, 0.1, 'triangle', 0.11, 0, 620 + n * 70);
  if (combo > 1) sfx.melody([[660, 0.05], [880, 0.05], [1180, 0.08]], 0.045);
  if (n >= FREEZE_AT) { freeze = 2.6; pops.push({ x: mid.x, y: mid.y - 66, txt: '❄ 冻结', life: 1.4, col: '#a5f3fc', big: true }); }
  if (reason === 'bomb') sfx.noise(0.3, 0.16);
  return n;
}

// 打中炸弹：连它自己往前后各清 3 颗
function bombBlast(index) {
  let lo = index, hi = index;
  for (let k = 0; k < 3; k++) {
    if (lo > 0) lo--;
    if (hi < balls.length - 1) hi++;
  }
  const n = blast(lo, hi, 'bomb');
  combo = 0;
  return n;
}

// 消子后回到缺口处继续找：缺口两侧一旦又同色就连锁下去
function tryMatch(k) {
  let idx = k;
  let guard = 0;
  while (guard++ < 40 && balls.length) {
    idx = clamp(idx, 0, balls.length - 1);
    const run = runAt(idx) || (idx > 0 ? runAt(idx - 1) : null);
    if (!run) return;
    blast(run.a, run.b, 'match');
    idx = run.a;
  }
}

/* ==================== 吐珠 ==================== */
function fire() {
  if (phase !== 'play') return;
  const a = aim;
  projs.push({ x: frog.x + Math.cos(a) * 26, y: frog.y + Math.sin(a) * 26, vx: Math.cos(a) * PROJ_V, vy: Math.sin(a) * PROJ_V, c: cur });
  cur = next;
  next = randBallColor();
  shots++;
  sfx.tone(520, 0.05, 'square', 0.07, 0, 240);
  burstRing(frog.x + Math.cos(a) * 26, frog.y + Math.sin(a) * 26);
}

function swap() {
  if (phase !== 'play') return;
  const t = cur; cur = next; next = t;
  sfx.tone(700, 0.05, 'sine', 0.06, 0, 500);
}

/* ==================== 插入与碰撞 ==================== */
function insertAndMatch(index, color) {
  balls.splice(clamp(index, 0, balls.length), 0, color);
  combo = 0;
  tryMatch(clamp(index, 0, balls.length - 1));
  checkLevelState();
}

// 撞上游珠：打中炸弹直接引爆；否则按飞来方向插进链条
function collide(bj, p) {
  hits++;
  const q = at(path, ballS(bj));
  burst(p.x, p.y, p.c);
  if (balls[bj] === BOMB) { bombBlast(bj); checkLevelState(); return; }
  const front = (p.x - q.x) * Math.cos(q.a) + (p.y - q.y) * Math.sin(q.a) > 0;
  sfx.tone(240, 0.04, 'sine', 0.05);
  insertAndMatch(front ? bj : bj + 1, p.c);
}

function stepProjs(dt) {
  if (!projs.length) return;
  for (const p of projs) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < -30 || p.x > W + 30 || p.y < -30 || p.y > H + 30) { p.dead = true; continue; }
    for (let i = 0; i < balls.length; i++) {
      const s = ballS(i);
      if (s < 0 || s > path.len) continue;
      const q = at(path, s);
      if (dist(p.x, p.y, q.x, q.y) < R * 1.75) {
        p.dead = true;
        collide(i, p);
        break;
      }
    }
  }
  projs = projs.filter((p) => !p.dead);
}

function checkLevelState() {
  if (!balls.length) {
    const acc = shots ? Math.round(hits / shots * 100) : 0;
    const bonus = 400 * level + Math.round(acc * 1.5);
    score += bonus;
    phase = 'between';
    sfx.melody([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.22]], 0.09);
    showClear(bonus, acc);
    saveBest();
    hud();
    return;
  }
  if (lead >= path.len - 2) lose();
}

function lose() {
  phase = 'over';
  sfx.melody([[392, 0.14], [330, 0.14], [262, 0.16], [196, 0.3]], 0.12);
  shake = 1;
  showOver();
  saveBest();
  hud();
}

function saveBest() {
  if (score > best) { best = score; store.set('zuma.best', String(best)); }
  if (level > maxLevel) { maxLevel = level; store.set('zuma.level', String(maxLevel)); }
}

/* ==================== 推进 ==================== */
function step(dt) {
  if (phase !== 'play') return;
  if (freeze > 0) {
    freeze = Math.max(0, freeze - dt);
  } else {
    lead += cfg.speed * dt;
  }
  if (retreat > 0) {
    lead = Math.max(0, lead - retreat * dt);
    retreat = Math.max(0, retreat - dt * 130);
  }
  lead = Math.min(lead, path.len);
  if (comboT > 0) { comboT = Math.max(0, comboT - dt); if (!comboT) combo = 0; }
  stepProjs(dt);
  if (lead >= path.len - 0.5 && balls.length) lose();
}

/* ==================== 粒子 ==================== */
function burst(x, y, color) {
  const skin = SKINS[color] || ['#e2e8f0', '#64748b'];
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 170;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.4 + Math.random() * 0.4, r: 1.6 + Math.random() * 2.6, col: i % 2 ? skin[1] : skin[0] });
  }
}
function burstRing(x, y) {
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    parts.push({ x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.22, r: 1.8, col: '#f8fafc' });
  }
}
function stepFx(dt) {
  for (const p of parts) { p.vy += 620 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  parts = parts.filter((p) => p.life > 0);
  for (const p of pops) { p.y -= 30 * dt; p.life -= dt; }
  pops = pops.filter((p) => p.life > 0);
  if (shake > 0) shake = Math.max(0, shake - dt * 2.6);
  if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
  if (glow > 0) glow = Math.max(0, glow - dt * 1.4);
}

/* ==================== HUD / 遮罩 ==================== */
function hud() {
  levelEl.textContent = level + ' · ' + cfg.name;
  leftEl.textContent = String(balls.length);
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
  const p = path.len ? clamp(lead / path.len, 0, 1) : 0;
  const leftDist = Math.max(0, path.len - lead);
  const hot = leftDist < path.len * 0.16;
  dangerEl.style.width = (p * 100).toFixed(1) + '%';
  dangerBar.classList.toggle('hot', hot);
  dlabEl.classList.toggle('hot', hot);
  dlabEl.textContent = hot ? '距洞 ' + Math.round(leftDist) : '剩 ' + Math.round(leftDist);
  btnPause.textContent = phase === 'paused' ? '▶' : '⏸';
}

function showIntro() {
  phase = 'intro';
  overlayContent.innerHTML = '<div class="ov-emoji">🐸</div><h2>祖玛珠链</h2>' +
    '<p class="hint">珠子沿轨道往洞口爬，<b>爬到洞口就输</b>。<br>' +
    '转脸吐珠，让三颗以上同色连在一起即可爆破。<br>' +
    '一次消得越多，链条被顶得越回去。</p>' +
    '<div class="legend"><i>🔴🔵🟢 同色 3 连即爆</i><i>💣 黑珠 = 炸弹，打中它清一片</i><i>❄ 一次消 6 颗冻结轨道</i></div>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开始第 1 关</button></div>';
  overlay.classList.add('show');
}

function showClear(bonus, acc) {
  overlayContent.innerHTML = '<div class="ov-emoji">🎋</div><h2>' + cfg.name + ' 清空！</h2>' +
    '<div class="final-score">' + score + '<span> 分</span></div>' +
    '<div class="report"><div><b>' + bonus + '</b><span>过关奖励</span></div>' +
    '<div><b>' + acc + '%</b><span>命中率</span></div>' +
    '<div><b>' + cleared + '</b><span>消子总数</span></div></div>' +
    '<p class="hint">下一关更快、更多色。打光全部珠子才判过关。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="next">进第 ' + (level + 1) + ' 关</button>' +
    '<button class="ghost" data-act="home">回游戏厅</button></div>';
  overlay.classList.add('show');
}

function showOver() {
  const rec = score >= best && score > 0;
  overlayContent.innerHTML = '<div class="ov-emoji">💀</div><h2>珠子进洞了</h2>' +
    '<div class="final-score">' + score + '<span> 分</span></div>' +
    (rec ? '<p class="hint" style="color:var(--amber)">新纪录 🏆</p>' : '') +
    '<div class="report"><div><b>' + level + '</b><span>到达关卡</span></div>' +
    '<div><b>' + (shots ? Math.round(hits / shots * 100) : 0) + '%</b><span>命中率</span></div>' +
    '<div><b>' + best + '</b><span>最高分</span></div></div>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="home">回游戏厅</button></div>';
  overlay.classList.add('show');
}

function showPaused() {
  overlayContent.innerHTML = '<div class="ov-emoji">⏸</div><h2>暂停中</h2>' +
    '<p class="hint">轨道停住了，随时回来继续。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="resume">继续</button>' +
    '<button class="ghost" data-act="again">重开本关</button></div>';
  overlay.classList.add('show');
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

function drawTrack() {
  const pts = path.pts;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = 'rgba(2,6,23,0.85)';
  ctx.lineWidth = GAP + 12;
  ctx.stroke();
  ctx.strokeStyle = '#16223c';
  ctx.lineWidth = GAP + 4;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(148,163,184,0.18)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 9]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 起点：出珠口
  const s0 = at(path, 0);
  ctx.save();
  ctx.translate(s0.x, s0.y);
  ctx.rotate(s0.a);
  ctx.fillStyle = '#0b1220';
  ctx.strokeStyle = 'rgba(148,163,184,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(-4, -GAP / 2 - 5, 26, GAP + 10);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // 终点：黑洞
  const e = at(path, path.len);
  const hot = clamp(lead / path.len, 0, 1) > 0.84;
  for (let ring = 3; ring >= 1; ring--) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, 9 + ring * 6, tNow * (hot ? 2.6 : 1.1) + ring, tNow * (hot ? 2.6 : 1.1) + ring + 4.4);
    ctx.strokeStyle = hot ? 'rgba(248,113,113,' + (0.22 + ring * 0.12) + ')' : 'rgba(167,139,250,' + (0.14 + ring * 0.08) + ')';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(e.x, e.y, 11, 0, Math.PI * 2);
  ctx.fillStyle = hot ? '#3b0a12' : '#0a0713';
  ctx.fill();
}

function drawBall(x, y, c, scale) {
  const r = R * (scale || 1);
  const skin = c === BOMB ? ['#4b5563', '#111827'] : (SKINS[c] || SKINS[0]);
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.42, r * 0.16, x, y, r);
  g.addColorStop(0, skin[0]);
  g.addColorStop(0.55, skin[1]);
  g.addColorStop(1, 'rgba(2,6,23,0.9)');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(2,6,23,0.5)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x - r * 0.34, y - r * 0.4, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
  if (c === BOMB) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', x, y + 0.5);
  }
}

function drawChain() {
  for (let i = balls.length - 1; i >= 0; i--) {
    const s = ballS(i);
    if (s < -GAP) continue;
    const p = at(path, Math.max(0, s));
    drawBall(p.x, p.y, balls[i], s < 0 ? 0.6 : 1);
  }
  // 头珠高亮：越接近洞口越红
  if (balls.length) {
    const h = at(path, Math.min(lead, path.len));
    const near = clamp(lead / path.len, 0, 1);
    ctx.beginPath();
    ctx.arc(h.x, h.y, R + 4 + Math.sin(tNow * 8) * 1.6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(248,113,113,' + (0.15 + near * 0.55) + ')';
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }
}

function drawFrog() {
  const a = aim;
  ctx.save();
  ctx.translate(frog.x, frog.y);
  // 蓄力光圈
  ctx.beginPath();
  ctx.arc(0, 0, 30 + glow * 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(52,211,153,' + (0.07 + glow * 0.14) + ')';
  ctx.fill();
  // 身体
  ctx.rotate(a);
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 20, 0, 0, Math.PI * 2);
  const bg = ctx.createLinearGradient(0, -20, 0, 20);
  bg.addColorStop(0, '#4ade80');
  bg.addColorStop(1, '#065f46');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(2,6,23,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 嘴
  ctx.beginPath();
  ctx.moveTo(16, -9);
  ctx.lineTo(34, -6);
  ctx.lineTo(34, 6);
  ctx.lineTo(16, 9);
  ctx.closePath();
  ctx.fillStyle = '#052e2b';
  ctx.fill();
  // 眼睛
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(6, sgn * 13, 6.4, 0, Math.PI * 2);
    ctx.fillStyle = '#f0fdf4';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(8.4, sgn * 13, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
  }
  // 嘴里的珠 + 备用的珠
  drawBall(26, 0, cur, 0.92);
  ctx.restore();
  ctx.save();
  ctx.translate(frog.x, frog.y);
  drawBall(-22, -20, next, 0.62);
  ctx.restore();
}

function drawAim() {
  if (phase !== 'play') return;
  const a = aim;
  ctx.save();
  ctx.setLineDash([3, 11]);
  ctx.strokeStyle = 'rgba(226,232,240,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(frog.x + Math.cos(a) * 34, frog.y + Math.sin(a) * 34);
  ctx.lineTo(frog.x + Math.cos(a) * 210, frog.y + Math.sin(a) * 210);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(frog.x + Math.cos(a) * 210, frog.y + Math.sin(a) * 210, 6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(52,211,153,0.5)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0c1626');
  bg.addColorStop(1, '#060b16');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (shake > 0) {
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake * 9, (Math.random() - 0.5) * shake * 9);
  }
  drawTrack();
  drawChain();
  for (const p of projs) drawBall(p.x, p.y, p.c, 0.96);
  drawAim();
  drawFrog();
  for (const p of parts) {
    ctx.globalAlpha = clamp(p.life * 2.4, 0, 1);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.col;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of pops) {
    ctx.globalAlpha = clamp(p.life * 1.5, 0, 1);
    ctx.font = (p.big ? 'bold 21px ' : 'bold 15px ') + 'system-ui, sans-serif';
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = 'rgba(2,6,23,0.75)';
    ctx.strokeText(p.txt, p.x, p.y);
    ctx.fillStyle = p.col;
    ctx.fillText(p.txt, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  if (shake > 0) ctx.restore();

  if (freeze > 0) {
    ctx.fillStyle = 'rgba(103,232,249,' + (0.06 + 0.05 * Math.sin(tNow * 6)) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  if (flash > 0) {
    ctx.fillStyle = 'rgba(251,191,36,' + (flash * 0.16).toFixed(3) + ')';
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
  hud();
}

/* ==================== 输入 ==================== */
function aimAt(ev) {
  const rect = cv.getBoundingClientRect();
  const sx = (rect.width || W) / W, sy = (rect.height || W * (H / W)) / H;
  const x = ((ev.clientX || 0) - rect.left) / sx;
  const y = ((ev.clientY || 0) - rect.top) / sy;
  aim = Math.atan2(y - frog.y, x - frog.x);
}

cv.addEventListener('pointerdown', (e) => {
  sfx.resume();
  if (phase !== 'play') return;
  aimAt(e);
  fire();
});
cv.addEventListener('pointermove', (e) => { if (phase === 'play') aimAt(e); });
cv.addEventListener('contextmenu', (e) => e.preventDefault());

btnSwap.addEventListener('click', () => { sfx.resume(); swap(); });
btnPause.addEventListener('click', () => { togglePause(); });
btnHelp.addEventListener('click', () => { if (phase === 'play') togglePause(); showIntro(); });
btnNew.addEventListener('click', () => { sfx.resume(); newGame(); });
btnSound.addEventListener('click', () => { btnSound.textContent = sfx.toggle() ? '🔇' : '🔊'; });

function togglePause() {
  if (phase === 'play') { phase = 'paused'; showPaused(); }
  else if (phase === 'paused') { phase = 'play'; overlay.classList.remove('show'); }
  hud();
}

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  sfx.resume();
  const a = btn.dataset.act;
  if (a === 'start') startLevel(1);
  else if (a === 'next') startLevel(level + 1);
  else if (a === 'again') newGame();
  else if (a === 'resume') { phase = 'play'; overlay.classList.remove('show'); hud(); }
  else if (a === 'replay') startLevel(level);
  else if (a === 'home') location.href = '../index.html';
});

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft') { aim -= 0.045; e.preventDefault(); }
  else if (k === 'ArrowRight') { aim += 0.045; e.preventDefault(); }
  else if (k === 'ArrowUp') { aim = -Math.PI / 2; e.preventDefault(); }
  else if (k === ' ' || k === 'Enter') { sfx.resume(); if (phase === 'play') fire(); e.preventDefault(); }
  else if (k === 's' || k === 'S') swap();
  else if (k === 'p' || k === 'P') togglePause();
  else if (k === 'n' || k === 'N') newGame();
  else if (k === '?') showIntro();
});

/* ==================== 启动 ==================== */
resize();
window.addEventListener('resize', resize);
cfg = levelCfg(1);
path = mkPath(SHAPES[cfg.shape]());
frog = pickFrog(path, cfg.frogAt);
balls = makeQueue(cfg.colors, cfg.balls);
hud();
showIntro();
requestAnimationFrame((t) => { last = t; frame(t); });

})();
