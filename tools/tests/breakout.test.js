'use strict';
/* 打砖块：定长帧物理 / 砖阵花样 / 连击与道具 三块地基
   重点核对：① 反弹方向按「穿透浅轴」判定，左右墙·顶墙·砖块四个面都要弹对，
        而且永远不许出现 |diry| < 0.3 的磨地球（不然中间那排砖永远打不着）
   ② 五种砖阵花样逐格数砖，血厚的砖要挨好几下才碎，每关至少 12 块，砖不许压到挡板线
   ③ 连击只认「不挨挡板」：敲碎才加，回到板上就清零；得分公式手算对拍
   ④ 道具必须用板子接住才生效，场上球数不许超过上限，掉出屏幕要记成「漏掉」
   ⑤ 同一个 #seed 必须复现同一串道具掉落；暂停/开遮罩必须冻住物理 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

const hook = `window.__g = {
  st: function () { return { phase: phase, diff: diff, level: level, score: score, lives: lives, chain: chain,
    bestChain: bestChain, clock: clock, paused: paused, awaitLaunch: awaitLaunch, padX: padX, keyDir: keyDir,
    wideUntil: wideUntil, slowUntil: slowUntil, brokenTotal: brokenTotal, caught: caught, missed: missed,
    lastGain: lastGain, seed: seedBase, left: bricksLeft(), speed: speedOf(level), speedNow: speedNow(), padW: padW(),
    balls: balls.length, ballStuck: balls.length ? !!balls[0].stuck : false, pusN: pus.length }; },
  K: function () { return { W: W, H: H, FRAME_MS: FRAME_MS, SUB: SUB, BALL_R: BALL_R, PAD_H: PAD_H, PAD_Y: PAD_Y,
    COLS: COLS, SIDE: SIDE, BRICK_TOP: BRICK_TOP, BRICK_H: BRICK_H, BRICK_GAP: BRICK_GAP, PU_SIZE: PU_SIZE,
    PU_FALL: PU_FALL, MAX_BALLS: MAX_BALLS, WIDE_ADD: WIDE_ADD, WIDE_MS: WIDE_MS, SLOW_MS: SLOW_MS, SLOW_K: SLOW_K,
    KEY_SPEED: KEY_SPEED, MAX_SPREAD: MAX_SPREAD, MIN_VY: MIN_VY, MAX_LEVEL: MAX_LEVEL }; },
  DIFFS: function () { return DIFFS; }, PUS: function () { return PUS; },
  D: D, speedOf: speedOf, rowsOf: rowsOf, styleOf: styleOf, brickW: brickW, brickRect: brickRect, hpOf: hpOf,
  buildBricks: buildBricks, hitGain: hitGain, breakGain: breakGain, levelBonus: levelBonus, clampDir: clampDir,
  angleFromPad: angleFromPad, rngOf: rngOf, num: num,
  brickAt: brickAt, bounceOffBrick: bounceOffBrick, moveBall: moveBall, movePaddle: movePaddle, fallPus: fallPus,
  stepFrame: stepFrame, pruneBalls: pruneBalls, newBall: newBall, stickBall: stickBall, launch: launch,
  damage: damage, levelUp: levelUp, loseLife: loseLife, gameOver: gameOver, winRun: winRun, spawnPu: spawnPu,
  applyPu: applyPu, setPad: setPad, padW: padW, speedNow: speedNow, bricksLeft: bricksLeft, newRound: newRound,
  startLevel: startLevel, saveRecords: saveRecords, togglePause: togglePause, act: act, stats: stats, intro: intro,
  hud: hud, hide: hide,
  balls: function () { return balls; }, bricksArr: function () { return bricks; }, pusArr: function () { return pus; },
  setSeed: function (v) { FIXED_SEED = v >>> 0; },
  setBricks: function (a) { bricks = a.slice(); hud(); },
  setBalls: function (a) { balls = a.slice(); },
  setPus: function (a) { pus = a.slice(); },
  setDiff: function (v) { diff = v; hud(); },
  setVars: function (k, v) {
    if (k === 'level') level = v; else if (k === 'score') score = v; else if (k === 'lives') lives = v;
    else if (k === 'chain') chain = v; else if (k === 'clock') clock = v; else if (k === 'paused') paused = v;
    else if (k === 'awaitLaunch') awaitLaunch = v; else if (k === 'padX') padX = v;
    else if (k === 'wideUntil') wideUntil = v; else if (k === 'slowUntil') slowUntil = v;
    else if (k === 'brokenTotal') brokenTotal = v; else if (k === 'caught') caught = v;
    else if (k === 'missed') missed = v; else if (k === 'keyDir') keyDir = v;
    else if (k === 'bestChain') bestChain = v; else if (k === 'phase') phase = v;
  },
  hudText: function () { return { lv: elLv.textContent, bricks: elBricks.textContent, chain: elChain.textContent,
    lives: elLives.textContent, score: elScore.textContent, launchOff: !!btnLaunch.disabled, pause: btnPause.innerHTML,
    sound: soundBtn ? soundBtn.textContent : '' }; },
  ov: function () { return ovContent.innerHTML; }, ovShown: function () { return !!ovShown(); },
  msgText: function () { return msgEl.innerHTML; },
};
`;
const inject = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('打砖块源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};
const G = (g) => g.ctx.__g;
const st = (g) => g.ctx.__g.st();
const plain = (h) => String(h).replace(/<[^>]*>/g, '');
const near = (a, b, eps) => Math.abs(a - b) < (eps === undefined ? 1e-6 : eps);
function boot(storage, seed) {
  const g = loadGame('breakout', { transform: inject, storage: storage || {} });
  g.pump(0.2);
  if (seed !== undefined) G(g).setSeed(seed);
  return g;
}
function open(seed, storage) {
  const g = boot(storage, seed);
  clickAct(g, 'start');
  return g;
}
function clickAct(g, name) {
  const b = g.byId('overlayContent').querySelectorAll('button').find((x) => x.dataset.act === name);
  if (b) b.dispatch('click');
  g.pump(0.1);
  return !!b;
}
function pickDiff(g, name) {
  const b = g.byId('diff').querySelectorAll('[data-diff]').find((x) => x.dataset.diff === name);
  if (b) b.dispatch('click');
  g.pump(0.1);
  return !!b;
}
const mkBrick = (x, y, w, h, hp) => ({ x, y, w, h, hp, max: hp, r: 0, c: 0, alive: true });
const mkBall = (x, y, dirx, diry, stuck) => ({ x, y, dirx, diry, stuck: !!stuck, off: 0 });

/* ==================== 1. 场地常量与难度曲线 ==================== */
const g = open(20260918);
const K = G(g).K();
chk(K.W === 480 && K.H === 620, '逻辑场地恒定 480×620，物理与屏宽无关');
chk(K.FRAME_MS === 16 && K.SUB === 4, '一帧 16ms，帧内切 4 个细步防穿模');
chk(K.COLS === 10 && K.SIDE === 12, '每排 10 列，左右各留 12px 边距');
chk(K.MAX_LEVEL === 12, '一共 12 关');
chk(near(K.MIN_VY, 0.3) && near(K.MAX_SPREAD, 1.05), '水平下限 0.3、挡板最大出射角约 60°');
const DIFFS = G(g).DIFFS();
chk(Object.keys(DIFFS).length === 3, '三档难度');
chk(DIFFS.casual.pad > DIFFS.arcade.pad && DIFFS.arcade.pad > DIFFS.insane.pad, '板子宽度松→硬核依次变窄');
chk(DIFFS.casual.lives > DIFFS.arcade.lives && DIFFS.arcade.lives > DIFFS.insane.lives, '命数依次变少');
chk(DIFFS.casual.speed < DIFFS.arcade.speed && DIFFS.arcade.speed < DIFFS.insane.speed, '初速依次变快');
chk(near(DIFFS.casual.mult, 0.8) && near(DIFFS.insane.mult, 1.6), '越难的分值倍率越高');
let mono = true;
for (let lv = 2; lv <= 30; lv++) if (G(g).speedOf(lv) < G(g).speedOf(lv - 1)) mono = false;
chk(mono, '球速随关卡单调不降');
chk(G(g).speedOf(200) === 640, '球速封顶 640，不至于打不着');
chk(G(g).rowsOf(200) === 9, '砖阵排数封顶 9 排');
let cyc = true;
for (let lv = 1; lv <= 20; lv++) if (G(g).styleOf(lv) !== (lv - 1) % 5) cyc = false;
chk(cyc && G(g).styleOf(6) === 0, '花样每 5 关轮回一次');
chk(st(g).lives === DIFFS.arcade.lives, '街机厅开局 ' + DIFFS.arcade.lives + ' 条命');

/* ==================== 2. 砖阵几何 ==================== */
chk(near(G(g).brickW(), 41.1, 0.01), '砖宽 (480-24-45)/10 = 41.1');
const r0c0 = G(g).brickRect(0, 0), r0c9 = G(g).brickRect(0, 9);
chk(r0c0.x === K.SIDE && near(r0c9.x + r0c9.w, K.W - K.SIDE, 1e-6), '砖阵左右对称，两头各留 12px 边距');
chk(r0c0.y === K.BRICK_TOP && near(r0c0.h, K.BRICK_H), '首排砖从 BRICK_TOP 起');
chk(near(G(g).brickRect(1, 0).y - r0c0.y, K.BRICK_H + K.BRICK_GAP), '排间距 = 砖高 + 缝隙');
let geomBad = '';
for (let lv = 1; lv <= K.MAX_LEVEL; lv++) {
  const bs = G(g).buildBricks(lv);
  const cells = new Set(bs.map((b) => b.r + ',' + b.c));
  const low = bs.every((b) => b.y + b.h < K.PAD_Y - 20);
  const inField = bs.every((b) => b.x >= K.SIDE - 1e-6 && b.x + b.w <= K.W - K.SIDE + 1e-6 && b.y >= K.BRICK_TOP);
  if (bs.length < 12) geomBad += lv + '砖少 ';
  if (cells.size !== bs.length) geomBad += lv + '重格 ';
  if (!low) geomBad += lv + '太低 ';
  if (!inField) geomBad += lv + '越界 ';
  if (bs.some((b) => b.hp < 1 || b.alive !== true)) geomBad += lv + '血量怪 ';
}
chk(geomBad === '', '1~12 关砖阵：每关 ≥12 块、不重叠、不越界、不打到挡板头顶' + (geomBad ? '（' + geomBad + '）' : ''));
const l1 = G(g).buildBricks(1);
chk(l1.length === 60, '街机厅第 1 关 6 排 × 10 = 60 块');
chk(l1.filter((b) => b.r % 2 === 0).every((b) => b.hp === 1) && l1.filter((b) => b.r % 2 === 1).every((b) => b.hp === 2), '横条花样：奇偶排 1 血 / 2 血交替');
const l2 = G(g).buildBricks(2);
chk(l2.every((b) => b.hp === ((b.r + b.c) % 2 ? 2 : 1)), '棋盘花样：格子奇偶决定 1/2 血');
const l3 = G(g).buildBricks(3);
chk(l3.length === 40, '金字塔花样 6 排共 40 块（越往下越宽，最宽铺满十列）');
chk(l3.every((b) => b.hp === 1 + Math.min(2, Math.floor(b.r / 2))), '金字塔越往下越硬，最厚 3 血');
chk(l3.filter((b) => b.r === 0).length === 2, '金字塔塔尖只有 2 块');
const l4 = G(g).buildBricks(4);
chk(l4.length === 42 && l4.every((b) => b.c % 3 !== 0 && b.hp === 1 + (b.c % 3)), '竖条花样：每 3 列抽掉一根，剩下 2/3 血');
const l5 = G(g).buildBricks(5);
chk(l5.length === 18, '钻石花样 7 排只有 18 块，比满屏稀疏');
chk(l5.filter((b) => b.r === 3 && (b.c === 4 || b.c === 5)).every((b) => b.hp === 3), '钻石正中心是 3 血硬块');
chk(l5.every((b) => b.hp === 1 || b.hp === 2 || b.hp === 3), '钻石由外向内 1→2→3 血');
const total = (rows, style) => { let n = 0; for (let r = 0; r < rows; r++) for (let c = 0; c < 10; c++) if (G(g).hpOf(style, r, c, rows) > 0) n++; return n; };
chk(total(5, 2) === 30 && total(5, 3) === 30, '五种花样逐格数砖能对上（金字塔/竖条 5 排各 30）');
chk(total(6, 1) === 60 && total(6, 0) === 60, '横条与棋盘不留空洞');
chk(G(g).hpOf(2, 0, 0, 6) === 0 && G(g).hpOf(4, 0, 0, 5) === 0, '金字塔第一排角上是空的');
chk(G(g).hpOf(3, 0, 0, 6) === 0, '竖条第 0 列整列抽掉');
// 稀疏花样兜底：把排数临时压到 2，金字塔只剩 6 块 → 退回横条
const savedRows = DIFFS.arcade.rows;
DIFFS.arcade.rows = 2;
const fb = G(g).buildBricks(3);
chk(fb.length === 20 && fb.every((b) => b.hp === 1 + (b.r % 2)), '花样太稀疏就退回横条，绝不发空场');
DIFFS.arcade.rows = savedRows;
chk(G(g).buildBricks(3).length === 40, '恢复排数后金字塔回到 40 块');

/* ==================== 3. 反弹角度 / 方向兜底 ==================== */
const half = K.PAD_H, pw = G(g).padW();
const mid = G(g).angleFromPad(240, 240);
chk(near(mid.t, 0) && near(mid.dirx, 0) && near(mid.diry, -1), '打挡板正中：直直顶回去');
const left = G(g).angleFromPad(240 - pw / 2, 240);
const right = G(g).angleFromPad(240 + pw / 2, 240);
chk(left.t === -1 && right.t === 1, '打两端 t = ∓1');
chk(left.dirx < 0 && right.dirx > 0 && near(left.dirx, -right.dirx), '越靠边飞得越斜，左右镜像');
chk(near(left.dirx * left.dirx + left.diry * left.diry, 1) && near(Math.acos(-left.diry) * 180 / Math.PI, 60, 1), '出射角约 60°，单位向量');
chk(G(g).angleFromPad(240 - pw * 3, 240).t === -1, '打到板子外面也按最边算，不会飞出离谱角度');
const flat = { x: 0, y: 0, dirx: 1, diry: 0.01, stuck: false, off: 0 };
G(g).clampDir(flat);
chk(near(flat.diry, 0.3, 1e-3) && near(flat.dirx * flat.dirx + flat.diry * flat.diry, 1, 1e-6), '快磨成水平时强行抬回 0.3 且保持单位长');
const down = { x: 0, y: 0, dirx: -0.9, diry: -0.05, stuck: false, off: 0 };
G(g).clampDir(down);
chk(down.diry < 0 && down.dirx < 0, '兜底不改上下/左右朝向');
const zero = { x: 0, y: 0, dirx: 0, diry: 0, stuck: false, off: 0 };
G(g).clampDir(zero);
chk(near(Math.abs(zero.diry), 0.3, 1e-3), '零向量也不会算出 NaN');
void half;

/* ==================== 4. 得分公式手算 ==================== */
G(g).setDiff('arcade');
G(g).setVars('chain', 0);
chk(G(g).hitGain() === 4 && G(g).breakGain() === 14, '零连击：敲一下 4 分，敲碎 14 分');
G(g).setVars('chain', 5);
chk(G(g).hitGain() === 14 && G(g).breakGain() === 34, '连击 ×5：4+10 = 14 / 14+20 = 34');
G(g).setVars('chain', 40);
chk(G(g).hitGain() === 24 && G(g).breakGain() === 54, '连击封顶 ×10：24 / 54 分');
G(g).setVars('chain', 3);
G(g).setDiff('casual');
chk(G(g).hitGain() === Math.round(10 * 0.8) && G(g).breakGain() === Math.round(26 * 0.8), '松一松 ×0.8 取整');
G(g).setDiff('insane');
chk(G(g).hitGain() === Math.round(10 * 1.6) && G(g).breakGain() === Math.round(26 * 1.6), '硬核 ×1.6 取整');
chk(G(g).levelBonus(1) === Math.round(60 * 1.6) && G(g).levelBonus(12) === Math.round(280 * 1.6), '过关分 (40+20×关) × 倍率');
G(g).setDiff('arcade');
G(g).setVars('chain', 0);

/* ==================== 5. 发球与粘球 ==================== */
const ig = boot();
chk(st(ig).phase === 'intro' && G(ig).launch() === false, '没上机前发球不动作');
chk(plain(G(ig).ov()).indexOf('打砖块') >= 0, '遮罩写着「打砖块」');
chk(clickAct(ig, 'start'), '点「上机」开始');
const p0 = st(ig);
chk(p0.awaitLaunch === true && p0.balls === 1 && p0.ballStuck, '开局一颗球粘在挡板上');
chk(p0.left === 60 && p0.phase === 'play', '街机厅第 1 关 60 块砖');
chk(plain(G(ig).msgText()).indexOf('发球') >= 0, '提示语让玩家发球');
G(ig).setPad(333);
const stuckBall = G(ig).balls()[0];
G(ig).moveBall(stuckBall, 16);
chk(near(stuckBall.x, 333) && stuckBall.y === K.PAD_Y - K.BALL_R - 1, '没发出去的球跟着挡板走');
G(ig).setPad(240);
G(ig).moveBall(stuckBall, 16);
chk(G(ig).launch() === true, '空格发球');
const fly = G(ig).balls()[0];
chk(fly.stuck === false && near(fly.dirx, 0.34 / Math.hypot(0.34, 1), 1e-6) && fly.diry < 0, '发球方向固定为斜向上，已归一化');
chk(st(ig).awaitLaunch === false && G(ig).launch() === false, '发出去的球不能二次发射');
G(ig).setVars('lives', 3);
/* ==================== 6. 墙壁与砖块反弹（穿透浅轴） ==================== */
const spare = () => mkBrick(400, 100, 41.1, 22, 3);
G(g).setBricks([]);
G(g).setVars('score', 0);
const bl = mkBall(9, 300, -0.6, -0.8, false);
G(g).moveBall(bl, 16);
chk(bl.x === K.BALL_R && bl.dirx > 0 && near(bl.diry, -0.8), '撞左墙：x 贴墙、横向反弹、纵向不变');
const br2 = mkBall(K.W - 9, 300, 0.6, -0.8, false);
G(g).moveBall(br2, 16);
chk(br2.x === K.W - K.BALL_R && br2.dirx < 0, '撞右墙：横向反向');
const bt = mkBall(240, 9, 0.3, -0.95, false);
G(g).moveBall(bt, 16);
chk(bt.y === K.BALL_R && bt.diry > 0, '撞顶墙：纵向反弹');
chk(st(g).score === 0 && st(g).left === 0, '光撞墙不扣分也不掉命');
const brick = mkBrick(100, 200, 41.1, 22, 2);
G(g).setBricks([brick, spare()]);
G(g).setVars('score', 0);
const fromBelow = mkBall(120, 230, 0, -1, false);
G(g).moveBall(fromBelow, 16);
chk(fromBelow.diry > 0 && fromBelow.y >= 222 - K.BALL_R + K.BALL_R, '从下面撞砖：往下弹并退出砖面');
chk(brick.hp === 1 && brick.alive === true, '2 血砖敲第一下只掉血不碎');
chk(st(g).score === 4 && st(g).chain === 0 && st(g).brokenTotal === 0, '没碎只算 hitGain，连击不涨');
const fromAbove = mkBall(120, 192, 0, 1, false);
G(g).moveBall(fromAbove, 16);
chk(fromAbove.diry < 0 && fromAbove.y <= 200 - K.BALL_R, '从上面撞砖：往上弹');
chk(brick.alive === false && st(g).chain === 1 && st(g).brokenTotal === 1, '第二下敲碎，连击 +1');
chk(st(g).score === 4 + 4 + 18, '敲碎 = hitGain(4) + breakGain(14+4)');
chk(g.storage._data['bo.brk'] === '1' && st(g).level === 1, '砸砖数落盘，还剩垫底砖没过关');
const sideBrick = mkBrick(100, 200, 41.1, 22, 1);
G(g).setBricks([sideBrick, spare()]);
const fromSide = mkBall(92, 211, 1, 0, false);
G(g).moveBall(fromSide, 16);
chk(fromSide.dirx < 0 && fromSide.x + K.BALL_R <= 100 + 1e-6, '从侧面撞砖：横向弹开并退到砖外');
chk(near(fromSide.diry, K.MIN_VY, 1e-3), '纯横向撞砖后立刻抬到最小竖速，不会磨地');
G(g).setBricks([Object.assign(mkBrick(100, 200, 41.1, 22, 1), { alive: false })]);
chk(G(g).brickAt(mkBall(120, 211, 0, 0, false)) === null, '碎砖不再参与碰撞');
const ghost = Object.assign(mkBrick(100, 200, 41.1, 22, 1), { alive: false });
const pass = mkBall(120, 230, 0, -1, false);
G(g).setBricks([ghost]);
G(g).moveBall(pass, 16);
chk(pass.diry < 0 && pass.y < 226, '球直接穿过已碎的砖继续飞');

/* ==================== 7. 挡板接球 ==================== */
G(g).setBricks([]);
G(g).setVars('padX', 240);
G(g).setVars('chain', 5);
G(g).setVars('score', 0);
const padHit = mkBall(240, K.PAD_Y - 8, 0, 1, false);
G(g).moveBall(padHit, 16);
chk(padHit.diry < 0 && near(padHit.dirx, 0, 1e-9), '板正中：球直直顶回去');
chk(st(g).chain === 0, '球一回到板上连击清零');
chk(plain(G(g).msgText()).indexOf('连击断了') >= 0, '断连击会给一句提示');
G(g).setVars('chain', 3);
const padLeft = mkBall(240 - 40, K.PAD_Y - 8, -0.2, 1, false);
G(g).moveBall(padLeft, 16);
chk(padLeft.dirx < 0, '打在板子左半边往左飞');
const padRight = mkBall(240 + 40, K.PAD_Y - 8, 0.2, 1, false);
G(g).moveBall(padRight, 16);
chk(padRight.dirx > 0, '打在右半边往右飞');
chk(Math.abs(padRight.dirx) > 0.6 && Math.abs(padRight.diry) >= K.MIN_VY, '靠边接球角度大，但仍不许水平');
G(g).setVars('padX', 240);
const noPad = mkBall(60, K.PAD_Y - 8, 0, 1, false);
G(g).moveBall(noPad, 16);
chk(noPad.diry > 0, '板子没接住就继续往下掉');
const rising = mkBall(240, K.PAD_Y - 2, 0, -1, false);
G(g).moveBall(rising, 16);
chk(rising.diry < 0, '向上的球不会被挡板再次接住（不会连弹）');

/* ==================== 8. 掉球、过关与翻脸 ==================== */
const lg = open(4321);
G(lg).setBricks([spare()]);
chk(st(lg).level === 1 && st(lg).lives === 3, '新的一局从第 1 关三条命开始');
G(lg).setVars('awaitLaunch', false);
G(lg).setVars('wideUntil', 999999);
G(lg).setVars('slowUntil', 999999);
G(lg).setVars('chain', 4);
G(lg).setBalls([mkBall(240, K.H + 30, 0, 1, false)]);
G(lg).pruneBalls();
chk(st(lg).lives === 2, '球掉出底部扣一条命');
chk(st(lg).awaitLaunch === true && st(lg).balls === 1 && st(lg).ballStuck, '扣命后重新粘球等发球');
chk(st(lg).chain === 0 && st(lg).padW === G(lg).D().pad, '掉球同时清零连击与道具加成');
G(lg).setBalls([mkBall(240, K.H + 30, 0, 1, false)]);
G(lg).setVars('awaitLaunch', true);
G(lg).pruneBalls();
chk(st(lg).lives === 2, '等发球期间不会再重复扣命');
G(lg).setVars('score', 777);
G(lg).setVars('lives', 1);
G(lg).setVars('awaitLaunch', false);
G(lg).setBalls([mkBall(240, K.H + 30, 0, 1, false)]);
G(lg).pruneBalls();
chk(st(lg).phase === 'over' && G(lg).ovShown(), '命没了立刻散场弹遮罩');
chk(plain(G(lg).ov()).indexOf('777') >= 0, '散场展示本局分数');
chk(lg.storage._data['bo.best'] === '777' && lg.storage._data['bo.lv'] === '1', '最高分与最远关卡落盘');
G(lg).hud();
chk(Number(G(lg).hudText().score) === 777, 'HUD 分数同步');
clickAct(lg, 'again');
chk(st(lg).phase === 'play' && st(lg).level === 1 && st(lg).score === 0 && st(lg).lives === 3, '「再来一局」从头开始');
chk(!G(lg).ovShown() && st(lg).left === 60, '重开后遮罩收起、砖阵重建');
const old = boot({ 'bo.best': '99999', 'bo.lv': '40' }, 88);
G(old).act('start');
G(old).setVars('score', 10);
G(old).gameOver();
chk(old.storage._data['bo.best'] === '99999' && old.storage._data['bo.lv'] === '40', '破不了纪录就不许覆盖旧纪录');
const lu = open(4322);
G(lu).setVars('level', 2);
G(lu).setVars('score', 0);
const sp2 = [spare()];
G(lu).setBricks(sp2);
G(lu).levelUp();
chk(st(lu).level === 3, '过关进第 3 关');
chk(st(lu).score === G(lu).levelBonus(2), '过关奖励 = (40+20×关)');
chk(G(lu).bricksArr().length === 40 && st(lu).left === 40, '第 3 关换金字塔花样 40 块');
chk(st(lu).awaitLaunch === true && st(lu).speed === 313, '过关后重新粘球，球速提到 313');
chk(plain(G(lu).msgText()).indexOf('第 3 关') >= 0, '过关提示写明新关卡');
G(lu).setVars('level', K.MAX_LEVEL);
G(lu).levelUp();
chk(st(lu).phase === 'over' && G(lu).ovShown(), '第 12 关拆光直接通关');
chk(plain(G(lu).ov()).indexOf('十二关') >= 0, '通关文案是「十二关全拆光」');
chk(lu.storage._data['bo.lv'] === '12', '最远关卡记到 12');
chk(G(lu).st().pusN === 0, '通关时不掉道具');

/* ==================== 9. 道具：接住才算 ==================== */
const pg = open(4323);
G(pg).setBricks([spare()]);
G(pg).spawnPu(120, 120);
chk(st(pg).pusN === 1, '敲砖能掉道具');
const pu = G(pg).pusArr()[0];
chk(['wide', 'slow', 'split'].indexOf(pu.kind) >= 0 && !!pu.glyph, '道具只有扩板/缓速/双球三种');
G(pg).setVars('caught', 0);
G(pg).setVars('padX', 240);
G(pg).setVars('wideUntil', -1);
G(pg).setPus([{ x: 240, y: K.PAD_Y - 4, kind: 'wide', name: '扩板', glyph: '⬌' }]);
G(pg).fallPus(16);
chk(st(pg).pusN === 0 && st(pg).caught === 1, '板子接住道具');
chk(st(pg).caught === 1 && st(pg).missed === 0 && st(pg).brokenTotal === 0, '接住计数 +1，漏掉仍是 0');
chk(st(pg).padW === G(pg).D().pad + K.WIDE_ADD, '扩板：板宽 +46');
chk(st(pg).wideUntil === st(pg).clock + K.WIDE_MS, '扩板持续 12 秒');
G(pg).setVars('clock', st(pg).wideUntil + 1);
chk(st(pg).padW === G(pg).D().pad, '时间一到板子缩回去');
G(pg).setVars('clock', 1000);
G(pg).setVars('slowUntil', -1);
G(pg).applyPu('slow');
chk(near(st(pg).speedNow, G(pg).D().speed * K.SLOW_K, 0.5), '缓速：球速 ×0.72');
chk(st(pg).slowUntil === 1000 + K.SLOW_MS, '缓速持续 9 秒');
G(pg).setVars('clock', 99999);
chk(near(st(pg).speedNow, st(pg).speed, 1e-9), '缓速结束后球速恢复');
G(pg).setVars('slowUntil', -1);
G(pg).setVars('awaitLaunch', false);
G(pg).setBalls([mkBall(240, 300, 0.5, -0.866, false)]);
G(pg).applyPu('split');
chk(st(pg).balls === 2, '双球：场上多一颗');
let guard = 0;
while (st(pg).balls < K.MAX_BALLS && guard++ < 10) G(pg).applyPu('split');
chk(st(pg).balls === K.MAX_BALLS, '球数能一路补到上限 4');
G(pg).applyPu('split');
G(pg).applyPu('split');
chk(st(pg).balls === K.MAX_BALLS, '接再多也不会超过 MAX_BALLS');
chk(G(pg).balls().every((b) => isFinite(b.x) && isFinite(b.dirx)), '复制出来的球参数都是合法的');
G(pg).setVars('wideUntil', -1);
G(pg).setVars('padX', 240);
const puAt = st(pg).pusN;
G(pg).setPus([{ x: 6, y: 100, kind: 'slow', name: '缓速', glyph: '◐' }]);
G(pg).fallPus(100);
chk(near(G(pg).pusArr()[0].y, 115, 1e-6), '道具按 0.15px/ms 下落');
const missedBefore = st(pg).missed;
let hops = 0;
while (st(pg).pusN && hops++ < 60) G(pg).fallPus(100);
chk(st(pg).missed === missedBefore + 1 && hops < 60 && st(pg).pusN === 0, '没接住的道具掉出屏幕，记成漏掉并移出列表');

/* ==================== 10. 同一 #seed 复现同一串掉落 ==================== */
function dropSeq(g, hits) {
  const out = [];
  for (let i = 0; i < hits; i++) {
    G(g).setPus([]);
    const arr = G(g).bricksArr().filter((b) => b.alive);
    if (!arr.length) continue;
    G(g).damage(arr[0], true);
    for (const p of G(g).pusArr()) out.push(p.kind);
  }
  return out.join(',');
}
function seqWith(seed) {
  const gg = boot({}, seed);
  clickAct(gg, 'start');
  G(gg).setVars('lives', 60);
  G(gg).setBricks(Array.from({ length: 40 }, (unused, i) => mkBrick(20 + (i % 10) * 46, 80 + Math.floor(i / 10) * 30, 41.1, 22, 1)));
  const kinds = dropSeq(gg, 60);
  return { seed: st(gg).seed, kinds: kinds };
}
const sA = seqWith(555);
const sB = seqWith(999);
const sC = seqWith(555);
chk(sA.seed === 555 && sC.seed === 555, 'setSeed 之后每局种子都对得上');
chk(sA.kinds.length > 0 && sA.kinds === sC.kinds, '同种子 → 同一条道具掉落序列（可复盘可分享）');
chk(sA.kinds !== sB.kinds, '换种子就是另一串掉落');
const rr = G(g).rngOf(7);
chk(near(rr(), G(g).rngOf(7)(), 1e-12), '同一个种子的随机流可复现');
chk(G(g).rngOf(7)() !== G(g).rngOf(8)(), '不同种子第一炮就不一样');
let inRange = true;
const rr2 = G(g).rngOf(20260918);
for (let i = 0; i < 200; i++) { const v = rr2(); if (!(v >= 0 && v < 1)) inRange = false; }
chk(inRange, '随机数恒在 [0,1)');

/* ==================== 11. HUD / 遮罩 / 输入 / 难度落盘 ==================== */
const hg = open(6161);
const h1 = G(hg).hudText();
chk(String(h1.lv) === '1' && String(h1.bricks) === String(st(hg).left) && String(h1.lives) === '3', '顶栏显示关卡/余砖/生命');
chk(h1.chain === '—' && String(h1.score) === '0', '零连击显示成破折号，开局零分');
G(hg).setVars('chain', 6);
G(hg).hud();
chk(G(hg).hudText().chain === '×6', '连击两格以上显示 ×N');
chk(h1.launchOff === false, '等发球时「发球」按钮可点');
G(hg).setVars('chain', 0);
G(hg).setVars('awaitLaunch', false);
G(hg).hud();
chk(G(hg).hudText().launchOff === true, '球在天上时发球按钮禁用');
chk(G(hg).hudText().pause.indexOf('暂停') >= 0, '默认按钮写着暂停');
G(hg).togglePause();
chk(G(hg).st().paused === true && G(hg).hudText().pause.indexOf('继续') >= 0, '暂停后按钮变继续');
const clockAt = st(hg).clock, yAt = G(hg).balls()[0].y;
G(hg).stepFrame(16);
chk(st(hg).clock === clockAt && G(hg).balls()[0].y === yAt, '暂停时物理彻底冻住');
G(hg).togglePause();
G(hg).stepFrame(16);
chk(st(hg).clock === clockAt + 16, '解除暂停后时钟按整帧推进');
G(hg).gameOver();
const frozenClock = st(hg).clock;
G(hg).stepFrame(16);
chk(st(hg).clock === frozenClock, '遮罩弹着的时候物理也不会偷偷跑');
G(hg).act('stats');
chk(plain(G(hg).ov()).indexOf('本机战绩') >= 0, '战绩页标题在位');
chk(plain(G(hg).ov()).indexOf('掉道具率 16%') >= 0, '街机厅掉率 16%');
chk(G(hg).ov().indexOf('data-act="again"') >= 0 && clickAct(hg, 'again'), '战绩页能一键再来一局');
const kg = boot();
chk(plain(G(kg).ov()).indexOf('上机') >= 0, '遮罩主按钮写着上机');
kg.win.dispatch('keydown', { key: 'Enter' });
kg.pump(0.1);
chk(st(kg).phase === 'play' && !G(kg).ovShown(), '回车直接上机');
kg.win.dispatch('keydown', { key: ' ' });
kg.pump(0.1);
chk(st(kg).awaitLaunch === false, '空格把球发出去');
kg.win.dispatch('keydown', { key: 'ArrowRight' });
const padBefore = st(kg).padX;
G(kg).stepFrame(16);
chk(st(kg).padX > padBefore, '按住右方向键挡板右移');
chk(near(st(kg).padX - padBefore, K.KEY_SPEED * 16, 1e-6), '键盘横移按 px/ms 计，帧率无关');
kg.win.dispatch('keyup', { key: 'ArrowRight' });
const padStill = st(kg).padX;
G(kg).stepFrame(16);
chk(st(kg).padX === padStill, '松手就停');
G(kg).setPad(-999);
chk(st(kg).padX === G(kg).padW() / 2, '挡板不会开出左边界');
G(kg).setPad(9999);
chk(st(kg).padX === K.W - G(kg).padW() / 2, '挡板不会开出右边界');
kg.byId('cv').dispatch('pointermove', { clientX: 460, offsetX: 460 });
chk(st(kg).padX === K.W - G(kg).padW() / 2, '手指划到画面最右，板子贴右墙');
kg.win.dispatch('keydown', { key: 't' });
kg.pump(0.1);
chk(plain(G(kg).ov()).indexOf('本机战绩') >= 0, 'T 键看战绩');
kg.win.dispatch('keydown', { key: 'n' });
kg.pump(0.1);
chk(st(kg).phase === 'intro' && G(kg).ovShown() && st(kg).level === 1, 'N 键重开并回到遮罩');
const oscBefore = kg.audio.created.osc + kg.audio.created.gain;
G(kg).act('start');
G(kg).launch();
for (let i = 0; i < 220; i++) G(kg).stepFrame(16);
chk(kg.audio.created.osc + kg.audio.created.gain > oscBefore, '球啃到砖就会发声');
chk(st(kg).score > 0 && st(kg).lastGain > 0, '斜向上发的一炮必然啃到砖（2 血砖要先敲两下才算碎）');
chk(kg.storage._data['bo.muted'] === undefined, '没动静音就不写键');
kg.win.dispatch('keydown', { key: 'm' });
chk(kg.storage._data['bo.muted'] === '1' && G(kg).hudText().sound === '🔇', 'M 键静音并落盘');
kg.win.dispatch('keydown', { key: 'm' });
chk(kg.storage._data['bo.muted'] === '0' && G(kg).hudText().sound === '🔊', '再按一次取消静音');
chk(boot({ 'bo.muted': '1' }).ctx.__g.hudText().sound === '🔇', '下次打开仍是静音状态');
const dg = boot({ 'bo.diff': 'insane' });
chk(st(dg).diff === 'insane', '难度选择记在本地');
const dg2 = boot({ 'bo.diff': 'not-a-diff' });
chk(st(dg2).diff === 'arcade', '认不出的难度回落街机厅');
chk(pickDiff(dg2, 'casual') && st(dg2).diff === 'casual', '点难度按钮能切换');
chk(dg2.storage._data['bo.diff'] === 'casual', '切难度立刻落盘');
chk(st(dg2).lives === DIFFS.casual.lives && st(dg2).left === 50, '松一松：4 条命 5 排 50 块砖');
const activeBtn = dg2.byId('diff').querySelectorAll('[data-diff]').find((b) => b.dataset.diff === 'casual');
chk(!!activeBtn && activeBtn._cls.indexOf('active') >= 0, '当前难度按钮高亮');

/* ==================== 12. 机器人挂机：物理稳定 + 真能过关 ==================== */
function playFrames(gg, frames) {
  let minAbsDy = 9, badNum = false, outX = false, maxBalls = 0, bestBroken = 0, bestLevel = 1, ran = 0;
  for (let i = 0; i < frames; i++) {
    const fly = G(gg).balls().find((b) => !b.stuck);
    if (!fly) { if (!G(gg).launch()) break; }
    else {
      const alive = G(gg).bricksArr().filter((b) => b.alive);
      if (alive.length) {
        let t = alive[0], bd = Infinity;
        for (const b of alive) { const d = Math.abs(b.x + b.w / 2 - fly.x); if (d < bd) { bd = d; t = b; } }
        const want = Math.max(-20, Math.min(20, (t.x + t.w / 2 - fly.x) * 0.05));
        G(gg).setPad(fly.x - want);          // 板子让球往「离它最近的砖」那边飞
      } else G(gg).setPad(fly.x);
    }
    G(gg).stepFrame(16);
    ran++;
    const s = st(gg);
    bestBroken = Math.max(bestBroken, s.brokenTotal);
    bestLevel = Math.max(bestLevel, s.level);
    maxBalls = Math.max(maxBalls, s.balls);
    for (const b of G(gg).balls()) {
      if (b.stuck) continue;
      minAbsDy = Math.min(minAbsDy, Math.abs(b.diry));
      if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.dirx) || !isFinite(b.diry)) badNum = true;
      if (b.x < -0.5 || b.x > 480.5) outX = true;
    }
    if (s.phase !== 'play') break;
  }
  return { minAbsDy: minAbsDy, badNum: badNum, outX: outX, maxBalls: maxBalls, broken: bestBroken,
    level: bestLevel, ran: ran, s: st(gg) };
}
const run1 = playFrames(open(20260921), 40000);
chk(run1.broken >= 150, '会瞄砖的机器人拆得很稳（实拆 ' + run1.broken + ' 块）');
chk(run1.level >= 3, '机器人真能连过几关（最高到第 ' + run1.level + ' 关）');
chk(!run1.badNum, '几万帧里没有 NaN');
chk(!run1.outX, '球始终在场内，没有穿墙出去');
chk(run1.minAbsDy >= K.MIN_VY - 1e-6, '全程竖速不低于下限，绝不会出现磨地球');
chk(run1.maxBalls <= K.MAX_BALLS, '接了一堆双球也不会超过 4 颗');
chk(run1.s.lives === 3, '板子跟着球走就几乎不掉命');
const run2 = playFrames(open(20260921), 40000);
chk(run2.broken === run1.broken && run2.level === run1.level, '同种子同机器人 → 拆砖数/过关数一模一样（物理可复现）');
const run3 = playFrames(open(20260922), 1200);
chk(run3.broken > 0, '换个种子也照样一开局就能拆砖');
const wait = open(20260927);
const clockWas = st(wait).clock;
for (let i = 0; i < 600; i++) G(wait).stepFrame(16);
chk(st(wait).lives === 3 && st(wait).balls === 1 && st(wait).ballStuck && st(wait).brokenTotal === 0, '不发炮就永远停在那儿，不会白白掉命');
chk(st(wait).clock === clockWas + 600 * 16, '粘球期间时钟照样推进（道具/动画不卡死）');
const slowRun = open(20260924);
G(slowRun).setVars('slowUntil', 1e9);
const s0 = G(slowRun).speedNow();
playFrames(slowRun, 60);
chk(G(slowRun).speedNow() < G(slowRun).speedOf(1) && near(G(slowRun).speedNow(), s0, 1e-9), '缓速道具期间球速恒定变慢');
const fast = open(20260925);
G(fast).setVars('level', 9);
G(fast).startLevel(9);
chk(st(fast).speed === Math.min(DIFFS.arcade.speed + 8 * DIFFS.arcade.accel, 640), '第 9 关球速按难度曲线加成');
chk(G(fast).bricksArr().length === G(fast).buildBricks(9).length, '高关卡砖阵继续加排');
chk(G(fast).rowsOf(9) === 8 && G(fast).styleOf(9) === 3, '第 9 关 8 排竖条');
const bot = open(20260926);
G(bot).setVars('lives', 30);
playFrames(bot, 40000);
chk(st(bot).level > 1 && String(bot.storage._data['bo.lv']) === String(st(bot).level), '最远关卡纪录跟着实况更新');
chk(Number(bot.storage._data['bo.brk']) >= st(bot).brokenTotal, '累计砸砖只增不减地写进本地');
chk(plain(G(bot).msgText()).length > 0, '全程都有文字反馈');

summary('打砖块', fails);
