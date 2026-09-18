/* 打砖块 —— 街机拆墙：一颗球一块板，把上面的砖全敲光就过关。
   机制：① 物理用「定长帧 + 每帧切 4 个细步」推进，坐标永远按 480×620 的逻辑坐标系算，
   所以换屏宽换帧率手感一模一样，测试也能一帧一帧复现；
   ② 球打在挡板的哪一段就往哪边飞（正中直顶、越靠边越斜），这是全部技巧的来源；
   ③ 连击只认「不挨挡板」：一帧一帧连着敲掉的砖越敲越值钱，球一回到板上就清零；
   ④ 敲碎的砖按概率掉道具，用板子接住才生效：⬌ 扩板 · ✚ 双球 · ◐ 缓速。
   纯前端零依赖。 */
(function () {
'use strict';

/* ==================== 场地常量（逻辑坐标系，永远 480×620） ==================== */
var W = 480, H = 620;
var FRAME_MS = 16;      // 一帧 16ms
var SUB = 4;            // 每帧切 4 个细步做碰撞，高速也不穿模
var BALL_R = 7;
var PAD_H = 14;
var PAD_Y = H - 46;
var COLS = 10;
var SIDE = 12;
var BRICK_TOP = 64;
var BRICK_H = 22;
var BRICK_GAP = 5;
var PU_SIZE = 16;
var PU_FALL = 0.15;     // px/ms
var MAX_BALLS = 4;
var WIDE_ADD = 46;
var WIDE_MS = 12000;
var SLOW_MS = 9000;
var SLOW_K = 0.72;
var KEY_SPEED = 0.62;   // px/ms 键盘横移速度
var MAX_SPREAD = 1.05;  // 挡板两端 ≈60°
var MIN_VY = 0.3;       // 不许把球磨成水平
var MAX_LEVEL = 12;
var DIFFS = {
  casual: { key: 'casual', label: '松一松', speed: 230, accel: 10, pad: 108, lives: 4, drop: 0.22, mult: 0.8, rows: 5 },
  arcade: { key: 'arcade', label: '街机厅', speed: 285, accel: 14, pad: 88, lives: 3, drop: 0.16, mult: 1, rows: 6 },
  insane: { key: 'insane', label: '硬核', speed: 340, accel: 18, pad: 70, lives: 2, drop: 0.12, mult: 1.6, rows: 8 },
};
var PUS = [
  { k: '⬌', n: '扩板', id: 'wide' },
  { k: '✚', n: '双球', id: 'split' },
  { k: '◐', n: '缓速', id: 'slow' },
];

function rngOf(seed) {
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FIXED_SEED：地址栏写 #seed=数字 就能钉住同一串道具掉落
var FIXED_SEED = (function () {
  var m = /seed=(\d+)/.exec((typeof location !== 'undefined' && location.hash) || '');
  return m ? (parseInt(m[1], 10) >>> 0) : 0;
})();
var seedBase = 0;
var rnd = rngOf(1);

/* ==================== 纯规则：关卡砖阵 / 球速 / 得分 ==================== */
function D() { return DIFFS[diff]; }
function speedOf(lv) { return Math.min(D().speed + (lv - 1) * D().accel, 640); }
function rowsOf(lv) { return Math.min(D().rows + Math.floor((lv - 1) / 3), 9); }
function styleOf(lv) { return (lv - 1) % 5; }
function brickW() { return (W - SIDE * 2 - BRICK_GAP * (COLS - 1)) / COLS; }
function brickRect(r, c) {
  return {
    x: SIDE + c * (brickW() + BRICK_GAP),
    y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
    w: brickW(),
    h: BRICK_H,
  };
}
// 五种花样：横条 / 棋盘 / 金字塔 / 竖条 / 钻石（血厚的一定要挨好几下才碎）
function hpOf(style, r, c, rows) {
  var mid = (COLS - 1) / 2;
  if (style === 0) return 1 + (r % 2);
  if (style === 1) return ((r + c) % 2) ? 2 : 1;
  if (style === 2) return Math.abs(c - mid) <= r + 0.5 ? 1 + Math.min(2, Math.floor(r / 2)) : 0;
  if (style === 3) return (c % 3 === 0) ? 0 : 1 + (c % 3);
  var d = Math.abs(c - mid) + Math.abs(r - (rows - 1) / 2);
  return d > 3.2 ? 0 : (d <= 1 ? 3 : (d <= 2.2 ? 2 : 1));
}
function buildBricks(lv) {
  var style = styleOf(lv), rows = rowsOf(lv);
  var out = [];
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < COLS; c++) {
      var hp = hpOf(style, r, c, rows);
      if (hp <= 0) continue;
      var rect = brickRect(r, c);
      out.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, hp: hp, max: hp, r: r, c: c, alive: true });
    }
  }
  if (out.length < 12) return buildBricks(1);     // 花样太稀疏就换回第一种
  return out;
}
function hitGain() { return Math.round((4 + Math.min(chain, 10) * 2) * D().mult); }
function breakGain() { return Math.round((14 + Math.min(chain, 10) * 4) * D().mult); }
function levelBonus(lv) { return Math.round((40 + lv * 20) * D().mult); }
function speedNow() { return speedOf(level) * (slowUntil > clock ? SLOW_K : 1); }
function padW() { return D().pad + (wideUntil > clock ? WIDE_ADD : 0); }
// 方向向量归一化 + 兜底：绝不允许出现水平磨地面打不着砖的球
function clampDir(b) {
  var m = Math.sqrt(b.dirx * b.dirx + b.diry * b.diry) || 1;
  b.dirx /= m;
  b.diry /= m;
  if (Math.abs(b.diry) < MIN_VY) {
    b.diry = b.diry < 0 ? -MIN_VY : MIN_VY;
    b.dirx = (b.dirx >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, 1 - b.diry * b.diry));
  }
}
function angleFromPad(hitX, center) {
  var half = padW() / 2;
  var t = Math.max(-1, Math.min(1, (hitX - center) / half));
  return { dirx: Math.sin(t * MAX_SPREAD), diry: -Math.cos(t * MAX_SPREAD), t: t };
}

/* ==================== 基础设施 ==================== */
function byId(id) { return document.getElementById(id); }
var store = {
  get: function (k, dflt) {
    try { var v = localStorage.getItem(k); return v === null ? dflt : v; }
    catch (e) { return dflt; }
  },
  set: function (k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* 无痕模式静默降级 */ } },
};
function num(k) { var v = parseInt(store.get(k, '0'), 10); return isNaN(v) ? 0 : v; }
var SILENT = {
  resume: function () {}, toggle: function () { return false; }, setMuted: function () { return false; },
  isMuted: function () { return true; }, tone: function () {}, noise: function () {}, melody: function () {},
};
var sfx = (window.Sfx ? window.Sfx.create({ storageKey: 'bo.muted' }) : null) || SILENT;
var soundBtn = byId('btnSound');
function syncSound() { if (soundBtn) soundBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; }

var cv = byId('cv');
var ctx = cv && cv.getContext ? cv.getContext('2d') : null;
var msgEl = byId('msg');
var overlayEl = byId('overlay'), ovContent = byId('overlayContent');
var elLv = byId('lv'), elBricks = byId('bricks'), elChain = byId('chain'), elLives = byId('lives'), elScore = byId('score');
var btnPause = byId('btnPause'), btnLaunch = byId('btnLaunch');

/* ==================== 局面状态 ==================== */
var phase = 'intro';       // intro | play | over
var diff = store.get('bo.diff', 'arcade');
if (!DIFFS[diff]) diff = 'arcade';
var level = 1, score = 0, lives = 3, chain = 0, bestChain = 0;
var bricks = [], balls = [], pus = [];
var padX = W / 2, keyDir = 0;
var clock = 0, paused = false, awaitLaunch = true;
var wideUntil = -1, slowUntil = -1;
var brokenTotal = 0, caught = 0, missed = 0, lastGain = 0;

function newBall(x, y, dirx, diry, stuck) {
  var b = { x: x, y: y, dirx: dirx || 0, diry: diry || -1, stuck: !!stuck, off: 0 };
  clampDir(b);
  return b;
}
function stickBall() {
  balls = [newBall(padX, PAD_Y - BALL_R - 1, 0, -1, true)];
  awaitLaunch = true;
  chain = 0;
}

/* ==================== 关卡流程 ==================== */
function newRound() {
  level = 1;
  score = 0;
  chain = 0;
  bestChain = 0;
  lives = D().lives;
  brokenTotal = 0;
  caught = 0;
  missed = 0;
  wideUntil = -1;
  slowUntil = -1;
  pus = [];
  padX = W / 2;
  clock = 0;
  paused = false;
  seedBase = (FIXED_SEED || ((Date.now() >>> 0) ^ (Math.floor(Math.random() * 0xffffffff) >>> 0))) >>> 0;
  rnd = rngOf(seedBase);
  startLevel(1);
}
function startLevel(lv) {
  level = lv;
  bricks = buildBricks(lv);
  stickBall();
  phase = 'play';
  if (lv > num('bo.lv')) store.set('bo.lv', lv);   // 「最远到第几关」以真正进关为准
  hud();
  msg('第 <b>' + lv + '</b> 关 · ' + bricks.length + ' 块砖 · 球速 <b>' + Math.round(speedOf(lv)) + '</b> —— 空格或点一下发球');
}
function launch() {
  if (phase !== 'play') return false;
  if (!awaitLaunch) return false;
  for (var i = 0; i < balls.length; i++) {
    var b = balls[i];
    if (!b.stuck) continue;
    b.stuck = false;
    b.dirx = 0.34;
    b.diry = -1;
    clampDir(b);
  }
  awaitLaunch = false;
  sfx.tone(620, 0.06, 'square', 0.13, 0, 980);
  hud();
  return true;
}
function damage(br, byBall) {
  br.hp--;
  score += hitGain();
  lastGain = hitGain();
  if (br.hp > 0) {
    sfx.tone(300 + br.max * 90, 0.03, 'square', 0.09);
    return;
  }
  br.alive = false;
  chain++;
  bestChain = Math.max(bestChain, chain);
  brokenTotal++;
  store.set('bo.brk', num('bo.brk') + 1);
  var g = breakGain();
  score += g;
  lastGain = g;
  sfx.tone(420 + Math.min(chain, 10) * 60, 0.05, 'square', 0.13, 0, 240);
  if (chain >= 5) msg('<span class="bo-good">连击 ×' + chain + '</span> 这一下 +' + g + ' 分');
  if (rnd() < D().drop) spawnPu(br.x + br.w / 2, br.y + br.h / 2);
  if (bricksLeft() === 0) levelUp();
  hud();
}
function bricksLeft() {
  var n = 0;
  for (var i = 0; i < bricks.length; i++) if (bricks[i].alive) n++;
  return n;
}
function levelUp() {
  var bonus = levelBonus(level);
  score += bonus;
  lastGain = bonus;
  sfx.melody([[659, 0.06], [880, 0.08], [1175, 0.12]]);
  if (level >= MAX_LEVEL) { winRun(); return; }
  startLevel(level + 1);
  msg('<span class="bo-good">第 ' + level + ' 关！</span>上一关结算 +' + bonus + ' 分 · 球速提到 ' +
    Math.round(speedOf(level)) + '，挡板准备接球');
}
function winRun() {
  phase = 'over';
  saveRecords();
  sfx.melody([[523, 0.09], [659, 0.09], [784, 0.09], [1046, 0.22]]);
  show('<div class="ov-emoji">🏆</div><h2>十二关全拆光</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">' + D().label + ' · 最长连击 ×' + bestChain + ' · 接住 ' + caught + ' 个道具 · 纪录 ' + num('bo.best') + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function loseLife() {
  lives--;
  chain = 0;
  wideUntil = -1;
  slowUntil = -1;
  if (lives <= 0) { gameOver(); return; }
  stickBall();
  sfx.melody([[330, 0.1], [247, 0.16]]);
  msg('<span class="bo-bad">掉球了</span> 还剩 ' + lives + ' 条命 —— 发球前想好往哪边打');
  hud();
}
function gameOver() {
  phase = 'over';
  saveRecords();
  sfx.melody([[392, 0.12], [330, 0.14], [262, 0.24]]);
  show('<div class="ov-emoji">🧱</div><h2>球掉了三次，机台翻脸</h2>' +
    '<p class="final-score">' + score + '<span> 分</span></p>' +
    '<p class="final-sub">' + D().label + ' · 拆到第 ' + level + ' 关 · 最长连击 ×' + bestChain +
    ' · 累计砸砖 ' + num('bo.brk') + ' 块 · 纪录 ' + num('bo.best') + ' 分</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function saveRecords() {
  if (score > num('bo.best')) store.set('bo.best', score);
  if (level > num('bo.lv')) store.set('bo.lv', level);
}

/* ==================== 道具 ==================== */
function spawnPu(x, y) {
  var pick = PUS[Math.floor(rnd() * PUS.length)];
  pus.push({ x: x, y: y, kind: pick.id, name: pick.n, glyph: pick.k });
}
function applyPu(id) {
  caught++;
  if (id === 'wide') { wideUntil = clock + WIDE_MS; msg('<span class="bo-good">接到 ⬌ 扩板</span> 板子加宽 12 秒'); }
  if (id === 'slow') { slowUntil = clock + SLOW_MS; msg('<span class="bo-good">接到 ◐ 缓速</span> 球速降到 ' + Math.round(speedNow()) + '，12 秒内抓紧拆'); }
  if (id === 'split') {
    var add = [];
    for (var i = 0; i < balls.length && balls.length + add.length < MAX_BALLS; i++) {
      var b = balls[i];
      if (b.stuck) continue;
      var nb = newBall(b.x, b.y, b.dirx, b.diry, false);
      nb.dirx = -b.dirx;
      clampDir(nb);
      add.push(nb);
    }
    if (!add.length && balls.length < MAX_BALLS) {
      var only = balls[0];
      if (only) { var nb2 = newBall(only.x, only.y, -only.dirx, only.diry, false); nb2.dirx += 0.4; clampDir(nb2); add.push(nb2); }
    }
    balls = balls.concat(add);
    msg('<span class="bo-good">接到 ✚ 双球</span> 场上 ' + balls.length + ' 颗球');
  }
  sfx.melody([[880, 0.05], [1320, 0.08]]);
}
function fallPus(ms) {
  var d = PU_FALL * ms;
  var half = padW() / 2;
  for (var i = pus.length - 1; i >= 0; i--) {
    var pu = pus[i];
    pu.y += d;
    if (pu.y + PU_SIZE / 2 >= PAD_Y && pu.y - PU_SIZE / 2 <= PAD_Y + PAD_H + 6 &&
        pu.x >= padX - half - PU_SIZE / 2 && pu.x <= padX + half + PU_SIZE / 2) {
      pus.splice(i, 1);
      applyPu(pu.kind);
      hud();
      continue;
    }
    if (pu.y > H + PU_SIZE) { pus.splice(i, 1); missed++; }
  }
}

/* ==================== 物理：定长帧 + 细步 ==================== */
function movePaddle(ms) {
  if (keyDir) padX += keyDir * KEY_SPEED * ms;
  padX = Math.max(padW() / 2, Math.min(W - padW() / 2, padX));
}
function setPad(x) {
  padX = Math.max(padW() / 2, Math.min(W - padW() / 2, x));
}
function brickAt(b) {
  for (var i = 0; i < bricks.length; i++) {
    var br = bricks[i];
    if (!br.alive) continue;
    if (b.x + BALL_R > br.x && b.x - BALL_R < br.x + br.w && b.y + BALL_R > br.y && b.y - BALL_R < br.y + br.h) return br;
  }
  return null;
}
function bounceOffBrick(b, br) {
  var ox = Math.min(b.x + BALL_R - br.x, br.x + br.w - (b.x - BALL_R));
  var oy = Math.min(b.y + BALL_R - br.y, br.y + br.h - (b.y - BALL_R));
  if (ox < oy) {
    b.dirx = b.x < br.x + br.w / 2 ? -Math.abs(b.dirx) : Math.abs(b.dirx);
    b.x += b.dirx < 0 ? -ox : ox;
  } else {
    b.diry = b.y < br.y + br.h / 2 ? -Math.abs(b.diry) : Math.abs(b.diry);
    b.y += b.diry < 0 ? -oy : oy;
  }
}
function moveBall(b, ms) {
  if (b.stuck) {
    b.x = padX + b.off;
    b.y = PAD_Y - BALL_R - 1;
    return;
  }
  var d = speedNow() * ms / 1000;
  b.x += b.dirx * d;
  b.y += b.diry * d;
  if (b.x < BALL_R) { b.x = BALL_R; b.dirx = Math.abs(b.dirx); sfx.tone(240, 0.02, 'triangle', 0.06); }
  else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.dirx = -Math.abs(b.dirx); sfx.tone(240, 0.02, 'triangle', 0.06); }
  if (b.y < BALL_R) { b.y = BALL_R; b.diry = Math.abs(b.diry); sfx.tone(300, 0.02, 'triangle', 0.06); }
  var br = brickAt(b);
  if (br) {
    bounceOffBrick(b, br);
    clampDir(b);            // 撞砖之后也要兜住竖速，否则理论上会出现永远啃不到砖的磨地球
    damage(br);
    return;
  }
  var half = padW() / 2;
  if (b.diry > 0 && b.y + BALL_R >= PAD_Y && b.y - BALL_R <= PAD_Y + PAD_H + 4 &&
      b.x >= padX - half - BALL_R * 0.6 && b.x <= padX + half + BALL_R * 0.6) {
    b.y = PAD_Y - BALL_R - 0.5;
    var a = angleFromPad(b.x, padX);
    b.dirx = a.dirx;
    b.diry = a.diry;
    clampDir(b);
    if (chain > 0) msg('连击断了（刚才连着敲了 ' + chain + ' 块）');
    chain = 0;
    sfx.tone(520, 0.03, 'triangle', 0.1);
  }
  clampDir(b);
}
function pruneBalls() {
  var left = [];
  for (var i = 0; i < balls.length; i++) if (balls[i].y - BALL_R <= H) left.push(balls[i]);
  if (!left.length && !awaitLaunch) { loseLife(); return; }
  balls = left;
}
function stepFrame(ms) {
  if (phase !== 'play' || paused || ovShown()) return;
  clock += ms;
  movePaddle(ms);
  var sub = ms / SUB;
  for (var s = 0; s < SUB; s++) {
    for (var i = 0; i < balls.length; i++) moveBall(balls[i], sub);
  }
  pruneBalls();
  fallPus(ms);
  hud();
}

/* ==================== 渲染 ==================== */
function resize() {
  if (!cv || !ctx) return;
  var rect = cv.getBoundingClientRect();
  var cssW = rect.width || W;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(cssW * dpr));
  cv.height = Math.max(1, Math.round(cssW * (H / W) * dpr));
  var k = cv.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}
function hpColor(hp) {
  return hp >= 3 ? '#f87171' : hp === 2 ? '#fbbf24' : '#38bdf8';
}
function draw() {
  rafId = window.requestAnimationFrame(draw);
  if (!ctx) return;
  stepFrame(lastDt());
  last = nowMs();
  ctx.clearRect(0, 0, W, H);
  var bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d1420');
  bg.addColorStop(1, '#070a10');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (var i = 0; i < bricks.length; i++) {
    var br = bricks[i];
    if (!br.alive) continue;
    ctx.fillStyle = hpColor(br.hp);
    ctx.globalAlpha = 0.35 + br.hp * 0.2;
    ctx.fillRect(br.x, br.y, br.w, br.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(br.x + 0.5, br.y + 0.5, br.w - 1, br.h - 1);
    if (br.hp > 1) {
      ctx.fillStyle = 'rgba(7,9,14,0.7)';
      ctx.font = 'bold 11px system-ui';
      ctx.fillText(String(br.hp), br.x + br.w / 2 - 3, br.y + br.h / 2 + 4);
    }
  }
  var half = padW() / 2;
  var grad = ctx.createLinearGradient(padX - half, 0, padX + half, 0);
  grad.addColorStop(0, '#38bdf8');
  grad.addColorStop(0.5, '#e2f4ff');
  grad.addColorStop(1, '#38bdf8');
  ctx.fillStyle = wideUntil > clock ? '#34d399' : grad;
  ctx.fillRect(padX - half, PAD_Y, padW(), PAD_H);
  ctx.fillStyle = 'rgba(226,244,255,0.22)';
  ctx.fillRect(padX - half, PAD_Y + PAD_H, padW(), 3);
  for (var b2 = 0; b2 < balls.length; b2++) {
    var bb = balls[b2];
    ctx.beginPath();
    ctx.arc(bb.x, bb.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bb.x - 2, bb.y - 2, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  }
  for (var p = 0; p < pus.length; p++) {
    var pu = pus[p];
    ctx.fillStyle = 'rgba(52,211,153,0.9)';
    ctx.fillRect(pu.x - PU_SIZE / 2, pu.y - PU_SIZE / 2, PU_SIZE, PU_SIZE);
    ctx.fillStyle = '#052018';
    ctx.font = 'bold 12px system-ui';
    ctx.fillText(pu.glyph, pu.x - 6, pu.y + 4);
  }
  if (awaitLaunch && phase === 'play') {
    ctx.fillStyle = 'rgba(251,191,36,0.95)';
    ctx.font = 'bold 22px system-ui';
    ctx.fillText('READY?', W / 2 - 40, PAD_Y - 60);
  }
  if (paused || ovShown()) {
    ctx.fillStyle = 'rgba(7,9,14,0.55)';
    ctx.fillRect(0, 0, W, H);
  }
}
function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
var last = nowMs();
var acc = 0;
function lastDt() {
  var now = nowMs();
  var dt = Math.min(Math.max(now - last, 0), 120);
  acc += dt;
  var use = 0;
  if (acc >= FRAME_MS) {
    use = Math.min(acc, FRAME_MS * 4);
    acc -= use;
  }
  return use;
}
var rafId = 0;

/* ==================== HUD / 遮罩 ==================== */
function hud() {
  if (!elLv) return;
  elLv.textContent = level;
  elBricks.textContent = bricksLeft();
  elChain.textContent = chain > 1 ? '×' + chain : '—';
  elLives.textContent = lives;
  elScore.textContent = score;
  if (btnLaunch) btnLaunch.disabled = !(phase === 'play' && awaitLaunch);
  if (btnPause) btnPause.innerHTML = paused ? '▶<span>继续</span>' : '⏸<span>暂停</span>';
}
function msg(html) { if (msgEl) msgEl.innerHTML = html; }
function show(html) {
  if (!ovContent) return;
  ovContent.innerHTML = html;
  overlayEl.classList.add('show');
}
function hide() { if (overlayEl) overlayEl.classList.remove('show'); }
function ovShown() { return !!(overlayEl && overlayEl._cls && overlayEl._cls.indexOf('show') >= 0); }
function intro() {
  phase = 'intro';
  hud();
  show('<div class="ov-emoji">🧱</div><h2>打砖块</h2>' +
    '<p class="hint">一颗球一块板，把上面的砖全敲光就过关。<b>球打在挡板的哪一段，就往哪边飞</b>：' +
    '正中直上直下，越靠边越斜，最多约 60°。<br>' +
    '<span class="bo-legend"><i>🔵 1 血</i><i>🟡 2 血</i><i>🔴 3 血</i><i>⬌ 扩板</i><i>✚ 双球</i><i>◐ 缓速</i></span><br>' +
    '<b>不挨挡板的连续敲击有连击加分</b>（最多 ×10 层），球一回到板上就清零；' +
    '砖碎了的道具要<b>用板子接住</b>才算。共 <b>' + MAX_LEVEL + '</b> 关，每关球更快；掉三次球就翻脸。</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">上机</button>' +
    '<button class="ghost" data-act="stats">战绩</button></div>');
}
function stats() {
  show('<h2>本机战绩</h2><div class="bo-ov">' +
    '<p>最高分 <b>' + Math.max(num('bo.best'), score) + '</b> 分 · 难度 <b>' + D().label + '</b></p>' +
    '<p>这一局：' + score + ' 分 · 第 ' + level + '/' + MAX_LEVEL + ' 关 · 累计砸砖 <b>' + num('bo.brk') + '</b> 块</p>' +
    '<p>球速 ' + Math.round(speedOf(level)) + (slowUntil > clock ? '（缓速中 ' + Math.round(speedNow()) + '）' : '') +
    ' · 板宽 ' + padW() + ' · 生命 ' + lives + ' · 掉道具率 ' + Math.round(D().drop * 100) + '%</p>' +
    '<p>连击：本局最长 ×' + bestChain + ' · 接住 ' + caught + ' 个道具 · 漏掉 ' + missed + ' 个 · 得分倍率 ×' + D().mult + '</p></div>' +
    '<div class="ov-actions"><button class="primary" data-act="' + (phase === 'play' ? 'resume' : 'again') + '">' +
    (phase === 'play' ? '继续打' : '再来一局') + '</button></div>');
}
function act(name) {
  if (name === 'start') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'again') { sfx.resume(); hide(); newRound(); return; }
  if (name === 'resume') { hide(); paused = false; hud(); return; }
  if (name === 'stats') { stats(); return; }
}
function togglePause() {
  if (phase !== 'play') return;
  paused = !paused;
  hud();
}

/* ==================== 输入 ==================== */
function pointerX(ev) {
  var rect = cv.getBoundingClientRect();
  var sx = (rect.width || W) / W;
  var cx = ev.clientX === undefined ? 0 : ev.clientX;
  if (!ev.clientX && ev.offsetX !== undefined) cx = ev.offsetX;
  return (cx - (ev.clientX ? rect.left : 0)) / (ev.clientX ? sx : 1);
}
if (cv) {
  cv.addEventListener('pointermove', function (ev) {
    if (phase !== 'play') return;
    setPad(pointerX(ev));
  });
  cv.addEventListener('pointerdown', function (ev) {
    sfx.resume();
    if (phase !== 'play') return;
    setPad(pointerX(ev));
    if (awaitLaunch) launch();
  });
}
window.addEventListener('keydown', function (ev) {
  var k = ev.key;
  if (k === 'm' || k === 'M') { sfx.toggle(); syncSound(); return; }
  if (k === 't' || k === 'T') { stats(); return; }
  if (k === 'n' || k === 'N') { newRound(); intro(); return; }
  if (phase === 'intro') { if (k === 'Enter' || k === ' ') { act('start'); } return; }
  if (phase === 'over') { if (k === 'Enter' || k === ' ') act('again'); return; }
  if (phase !== 'play') return;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keyDir = -1; return; }
  if (k === 'ArrowRight' || k === 'd' || k === 'D') { keyDir = 1; return; }
  if (k === ' ') {
    ev.preventDefault && ev.preventDefault();
    if (awaitLaunch) launch();
    else togglePause();
    return;
  }
  if (k === 'Escape') { paused = true; hud(); return; }
});
window.addEventListener('keyup', function (ev) {
  var k = ev.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ArrowRight' || k === 'd' || k === 'D') {
    if (keyDir) keyDir = 0;
  }
});
if (btnPause) btnPause.addEventListener('click', function () { sfx.resume(); togglePause(); });
if (btnLaunch) btnLaunch.addEventListener('click', function () { sfx.resume(); launch(); });
if (byId('btnStats')) byId('btnStats').addEventListener('click', stats);
if (byId('btnNew')) byId('btnNew').addEventListener('click', function () { newRound(); intro(); });
if (soundBtn) soundBtn.addEventListener('click', function () { sfx.resume(); sfx.toggle(); syncSound(); });
if (overlayEl) {
  overlayEl.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (t) act(t.dataset.act);
  });
}
(function () {
  var btns = byId('diff').querySelectorAll('[data-diff]');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-diff]') : null;
      if (!b || !DIFFS[b.dataset.diff]) return;
      diff = b.dataset.diff;
      store.set('bo.diff', diff);
      syncDiff();
      newRound();
      intro();
    });
  }
})();
function syncDiff() {
  var btns = byId('diff').querySelectorAll('[data-diff]');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.diff === diff);
}

/* ==================== 开局 ==================== */
resize();
if (window.addEventListener) window.addEventListener('resize', resize);
if (cv && 'ResizeObserver' in window) { try { new window.ResizeObserver(resize).observe(cv); } catch (e) { /* 老浏览器忽略 */ } }
syncSound();
syncDiff();
newRound();
intro();
if (window.requestAnimationFrame) rafId = window.requestAnimationFrame(draw);
})();
