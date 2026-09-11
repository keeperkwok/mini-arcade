(() => {
'use strict';

/* 3D 魔方：不引任何库，手写"投影 + 背面剔除 + 远近排序 + 光照"。
   模型只有 6 个面数组；转层用整数坐标旋转，所以永远不会漂出半个贴纸。
   交互：空白处拖动 = 转视角；贴着贴纸拖 = 转那一层；也可以点公式键。 */

/* ==================== 常量 ==================== */
const W = 460, H = 520;
const CX = W / 2, CY = 244;
const KEYS = ['U', 'D', 'L', 'R', 'F', 'B'];
const HALF = Math.PI / 2;
const TURN_DUR = 0.16;              // 单层动画秒数
const CAM0 = [-0.6, -0.42, 1];        // 默认相机

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* 每个面给一套正交基：N 朝外、R 是"贴纸行往下"、C 是"贴纸列往右"，且 C = R × N
   （坐标系 x 右 / y 下 / z 朝屏幕外，所以 U 的 y 是负的） */
const FACE_DEF = [
  { key: 'U', col: '#f1f5f9', plastic: '#20293a', N: [0, -1, 0], R: [0, 0, -1] },
  { key: 'D', col: '#fcd34d', plastic: '#1a2130', N: [0, 1, 0], R: [0, 0, -1] },
  { key: 'R', col: '#f87171', plastic: '#241b21', N: [1, 0, 0], R: [0, 1, 0] },
  { key: 'L', col: '#fb923c', plastic: '#241d18', N: [-1, 0, 0], R: [0, 1, 0] },
  { key: 'F', col: '#4ade80', plastic: '#16241c', N: [0, 0, 1], R: [0, 1, 0] },
  { key: 'B', col: '#60a5fa', plastic: '#161f2c', N: [0, 0, -1], R: [0, 1, 0] },
];
FACE_DEF.forEach((fd, i) => {
  fd.C = cross(fd.R, fd.N);
  fd.idx = i;
});
const FACE_BY_NORMAL = {};
FACE_DEF.forEach((fd) => { FACE_BY_NORMAL[fd.N.join(',')] = fd; });

/* 标准记法：axis 0/1/2 = x/y/z，layer 0 或 'max'，dir=+1 表示"看着这个面顺时针" */
const NOTATION = {
  U: { axis: 1, layer: 0, dir: -1 },
  D: { axis: 1, layer: 'max', dir: 1 },
  R: { axis: 0, layer: 'max', dir: 1 },
  L: { axis: 0, layer: 0, dir: -1 },
  F: { axis: 2, layer: 'max', dir: 1 },
  B: { axis: 2, layer: 0, dir: -1 },
};

/* ==================== 元素 ==================== */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const timeEl = document.getElementById('time');
const movesEl = document.getElementById('moves');
const bestEl = document.getElementById('best');
const undoNEl = document.getElementById('undoN');
const scrambleEl = document.getElementById('scrambleText');
const keypad = document.getElementById('keypad');
const diffEl = document.getElementById('diff');
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');
const btnUndo = document.getElementById('btnUndo');
const btnScramble = document.getElementById('btnScramble');
const btnNet = document.getElementById('btnNet');
const btnReset = document.getElementById('btnReset');

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
  del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
};
const sfx = window.Sfx.create({ storageKey: 'cube.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

/* ==================== 状态 ==================== */
let n = clampNum(store.get('cube.size'), 2, 4, 3);
let faces = [];
let history = [];
let moves = 0;
let seconds = 0;
let started = false;
let scrambled = false;
let scrambleText = '';
let turn = null;                   // 正在播放的转层动画
let queue = [];                    // 动画期间攒下的后续动作
let yaw = CAM0[0], pitch = CAM0[1], zoom = CAM0[2];
let netView = false;
let phase = 'intro';               // intro / play / solved
let drag = null;
let parts = [];
let flash = 0, tNow = 0, last = 0;
let hoverAxis = null;              // 拖动时高亮的那一层

/* ==================== 小工具 ==================== */
function clampNum(v, lo, hi, dflt) {
  if (v === null || v === undefined || v === '') return dflt;
  const x = Number(v);
  if (!Number.isFinite(x)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(x)));
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const rnd = (k) => Math.floor(Math.random() * k);
const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s) % 60).padStart(2, '0');
const bestKey = () => { return 'cube.best.' + n; };

/* ==================== 模型 ==================== */
function newCube() {
  faces = [];
  for (let fi = 0; fi < 6; fi++) {
    const arr = [];
    for (let i = 0; i < n * n; i++) arr.push(fi);
    faces.push(arr);
  }
}

// 贴纸中心（整数模型坐标，范围 [-n, n]）
function centerOf(fi, r, c) {
  const fd = FACE_DEF[fi];
  const vr = 2 * r - n + 1, vc = 2 * c - n + 1;
  return [
    fd.N[0] * n + fd.R[0] * vr + fd.C[0] * vc,
    fd.N[1] * n + fd.R[1] * vr + fd.C[1] * vc,
    fd.N[2] * n + fd.R[2] * vr + fd.C[2] * vc,
  ];
}

const layerOf = (p, axis) => clamp(Math.floor((p[axis] + n) / 2), 0, n - 1);

function cellFromVec(p, nrm) {
  const fd = FACE_BY_NORMAL[nrm.join(',')];
  const r = (dot(p, fd.R) + n - 1) / 2;
  const c = (dot(p, fd.C) + n - 1) / 2;
  return [fd.idx, r, c];
}

// 90° 整数旋转：dir=+1 是"顺着坐标轴右手系"，与 rotAbout 的 +90° 完全一致
function rotVec(axis, dir, v) {
  const x = v[0], y = v[1], z = v[2];
  if (axis === 0) return dir > 0 ? [x, -z, y] : [x, z, -y];
  if (axis === 1) return dir > 0 ? [z, y, -x] : [-z, y, x];
  return dir > 0 ? [-y, x, z] : [y, -x, z];
}

// 任意角度旋转（动画用），Rodrigues 公式
function rotAbout(axis, ang, v) {
  const a = [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0];
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  const k = dot(a, v);
  const cr = cross(a, v);
  return [
    v[0] * c + cr[0] * s + a[0] * k * t,
    v[1] * c + cr[1] * s + a[1] * k * t,
    v[2] * c + cr[2] * s + a[2] * k * t,
  ];
}

function layerCells(axis, layer) {
  const out = [];
  for (let fi = 0; fi < 6; fi++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const p = centerOf(fi, r, c);
        if (layerOf(p, axis) === layer) out.push({ fi, r, c, p });
      }
    }
  }
  return out;
}

function applyTurn(axis, layer, dir) {
  const cells = layerCells(axis, layer);
  const snap = faces.map((f) => f.slice());
  for (const cell of cells) {
    const nrm = FACE_DEF[cell.fi].N;
    const p2 = rotVec(axis, dir, cell.p);
    const n2 = rotVec(axis, dir, nrm);
    const to = cellFromVec(p2, n2);
    faces[to[0]][to[1] * n + to[2]] = snap[cell.fi][cell.r * n + cell.c];
  }
}

const isSolved = () => faces.every((f) => f.every((v) => v === f[0]));
const stickerCount = () => 6 * n * n;

function moveLayer(m) { return m.layer === 'max' ? n - 1 : m.layer; }

function doMove(key, dir) {
  const m = NOTATION[key];
  if (!m) return;
  pushTurn(m.axis, moveLayer(m), dir * m.dir);
}

function pushTurn(axis, layer, dir) {
  if (phase !== 'play') return;
  if (turn) { if (queue.length < 3) queue.push({ axis, layer, dir }); return; }
  turn = { axis, layer, dir, ang: 0 };
  if (!started) { started = true; seconds = 0; }
  sfx.tone(300 + layer * 40, 0.05, 'square', 0.06, 0, 520);
}

function commitTurn(t) {
  applyTurn(t.axis, t.layer, t.dir);
  history.push(t);
  moves++;
  partsBurst(t);
  saveState();
  if (scrambled && isSolved()) onSolved();
  hud();
}

function partsBurst(t) {
  if (Math.random() > 0.5) return;
  const cells = layerCells(t.axis, t.layer);
  const pick = cells[rnd(cells.length)];
  const pr = project(toView(renderVec(pick.p)));
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
    parts.push({ x: pr[0], y: pr[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, r: 1.6 + Math.random() * 2, col: '#c4b5fd', life: 0.5 });
  }
}

/* ==================== 打乱 / 撤销 / 存档 ==================== */
function scramble() {
  const len = n === 2 ? 10 : n === 3 ? 22 : 32;
  newCube();
  const seq = [];
  let lastAxis = -1, lastLayer = -1;
  while (seq.length < len) {
    const key = KEYS[rnd(6)];
    const m = NOTATION[key];
    const layer = moveLayer(m);
    if (m.axis === lastAxis && layer === lastLayer) continue;              // 别连着转同一层
    if (m.axis === lastAxis && Math.random() < 0.55) continue;             // 同轴换面容易互相抵消
    const dir = Math.random() < 0.5 ? 1 : -1;
    applyTurn(m.axis, layer, dir * m.dir);
    seq.push(key + (dir < 0 ? "'" : ''));
    lastAxis = m.axis; lastLayer = layer;
  }
  if (isSolved()) { scramble(); return; }        // 万一打乱把自己转回去了
  history = [];
  moves = 0;
  seconds = 0;
  started = false;
  scrambled = true;
  turn = null;
  queue = [];
  scrambleText = seq.join(' ');
  phase = 'play';
  overlay.classList.remove('show');
  saveState();
  hud();
}

function undoMove() {
  if (!history.length) { sfx.tone(120, 0.1, 'sawtooth', 0.07, 0, 80); return; }
  const t = history.pop();
  applyTurn(t.axis, t.layer, -t.dir);
  moves = Math.max(0, moves - 1);
  if (phase === 'solved') { phase = 'play'; overlay.classList.remove('show'); }
  sfx.tone(240, 0.06, 'triangle', 0.07, 0, 180);
  saveState();
  hud();
}

function resetCube() {
  newCube();
  history = [];
  moves = 0;
  seconds = 0;
  started = false;
  scrambled = false;
  turn = null;
  queue = [];
  scrambleText = '已复原 · 按「打乱」开一局（也可以自己拧着玩）';
  phase = 'play';
  overlay.classList.remove('show');
  store.del('cube.save');
  hud();
}

function saveState() {
  if (!scrambled || isSolved()) return;
  store.set('cube.save', JSON.stringify({
    size: n, faces: faces.map((f) => f.join('')), moves,
    seconds: Math.floor(seconds), scramble: scrambleText,
  }));
}

function restoreSaved(s) {
  faces = s.faces.map((row) => row.split('').map((ch) => Number(ch)));
  moves = Number(s.moves) || 0;
  seconds = Number(s.seconds) || 0;
  scrambleText = s.scramble || '';
  scrambled = true;
  started = true;
  history = [];
  turn = null;
  queue = [];
  phase = 'play';
  overlay.classList.remove('show');
  hud();
}

function readSaved() {
  const raw = store.get('cube.save');
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (!s || s.size !== n || !Array.isArray(s.faces) || s.faces.length !== 6) return null;
    const cnt = [0, 0, 0, 0, 0, 0];
    for (const row of s.faces) {
      if (typeof row !== 'string' || row.length !== n * n) return null;
      for (let i = 0; i < row.length; i++) {
        const v = row.charCodeAt(i) - 48;
        if (v < 0 || v > 5) return null;               // 颜色号越界会让绘制崩掉
        cnt[v]++;
      }
    }
    for (let v = 0; v < 6; v++) if (cnt[v] !== n * n) return null;   // 每色恰好 n² 张才算合法盘面
    return s;
  } catch (e) { return null; }
}

function onSolved() {
  phase = 'solved';
  flash = 1;
  const best = Number(store.get(bestKey()) || 0);
  const rec = !best || seconds < best;
  if (rec) store.set(bestKey(), String(Math.floor(seconds)));
  store.del('cube.save');
  sfx.melody([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.12], [1319, 0.22]]);
  showSolved(rec, best);
  hud();
}

function switchSize(size) {
  n = clampNum(size, 2, 4, 3);
  store.set('cube.size', String(n));
  cv.setAttribute('aria-label', n + ' 阶魔方');
  resetCube();
  hud();
}

/* ==================== 相机与绘制 ==================== */
function toView(v) { return rotAbout(0, pitch, rotAbout(1, yaw, v)); }

function project(v) {
  const d = 7 * n;
  const k = d / Math.max(0.8, d - v[2]);
  const s = (zoom * (0.285 * W) / n) * k;
  return [CX + v[0] * s, CY + v[1] * s];
}

// 正在转的那一层，按动画角度把坐标先旋出去
function renderVec(p) {
  if (!turn) return p;
  return layerOf(p, turn.axis) === turn.layer ? rotAbout(turn.axis, turn.dir * turn.ang * HALF, p) : p;
}

function shade(hex, k) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return 'rgb(' + Math.round(clamp(r * k, 0, 255)) + ',' + Math.round(clamp(g * k, 0, 255)) + ',' + Math.round(clamp(b * k, 0, 255)) + ')';
}

const LIGHT = (() => {
  const v = [0.32, -0.72, 0.62];
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
})();

function collectQuads() {
  const quads = [];
  for (let fi = 0; fi < 6; fi++) {
    const fd = FACE_DEF[fi];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const p = centerOf(fi, r, c);
        const inTurn = !!turn && layerOf(p, turn.axis) === turn.layer;
        const ang = inTurn ? turn.dir * turn.ang * HALF : 0;
        const mv = inTurn ? rotAbout(turn.axis, ang, p) : p;
        const nrm = inTurn ? rotAbout(turn.axis, ang, fd.N) : fd.N;
        const nv = toView(nrm);
        if (nv[2] <= 0.02) continue;                        // 背面剔除
        const vp = toView(mv);
        const vr = toView(fd.R), vc = toView(fd.C);
        const hs = 1;
        const cs = [];
        for (const [sr, sc] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const w = [
            mv[0] + fd.R[0] * hs * sr + fd.C[0] * hs * sc,
            mv[1] + fd.R[1] * hs * sr + fd.C[1] * hs * sc,
            mv[2] + fd.R[2] * hs * sr + fd.C[2] * hs * sc,
          ];
          cs.push(project(toView(w)));
        }
        const lam = clamp(dot(nv, LIGHT), 0, 1);
        quads.push({
          depth: vp[2],
          cell: { fi, r, c },
          color: faces[fi][r * n + c],
          pts: cs,
          light: 0.52 + 0.52 * lam * lam + 0.06 * Math.pow(lam, 12),
          hi: !!(hoverAxis && inTurn),
        });
      }
    }
  }
  quads.sort((a, b) => a.depth - b.depth);                  // 远的先画
  return quads;
}

function pathQuad(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function drawCube() {
  const quads = collectQuads();
  // 落地的软阴影：按真实轮廓算出来，换阶数/换视角/缩放都不会飘到方块外面去
  if (quads.length) {
    let loX = 1e9, hiX = -1e9, hiY = -1e9;
    for (const q of quads) {
      for (const p of q.pts) {
        if (p[0] < loX) loX = p[0];
        if (p[0] > hiX) hiX = p[0];
        if (p[1] > hiY) hiY = p[1];
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.ellipse((loX + hiX) / 2, Math.min(H - 16, hiY + 12), (hiX - loX) * 0.43, 20 * zoom, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(2,6,23,0.42)';
    ctx.fill();
    ctx.restore();
  }

  for (const q of quads) {
    const fd = FACE_DEF[q.color];
    pathQuad(q.pts);
    ctx.fillStyle = fd.plastic;
    ctx.fill();
    const inner = q.pts.map((p, i) => {
      const cx2 = q.pts.reduce((a, s) => a + s[0], 0) / 4;
      const cy2 = q.pts.reduce((a, s) => a + s[1], 0) / 4;
      const t = 0.84;
      return [cx2 + (p[0] - cx2) * t, cy2 + (p[1] - cy2) * t];
    });
    pathQuad(inner);
    ctx.fillStyle = shade(fd.col, q.light);
    ctx.fill();
    if (q.hi) {
      ctx.strokeStyle = 'rgba(251,191,36,' + (0.45 + 0.3 * Math.sin(tNow * 8)).toFixed(3) + ')';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(2,6,23,0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

function drawNet() {
  const cell = Math.floor(Math.min((W - 60) / (3 * n), (H - 90) / (4 * n)));
  const ox = CX - cell * 1.5 * n, oy = CY - cell * 2 * n;
  const spot = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], D: [1, 2], B: [1, 3] };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let fi = 0; fi < 6; fi++) {
    const fd = FACE_DEF[fi];
    const [sc, sr] = spot[fd.key];
    const bx = ox + sc * cell * n, by = oy + sr * cell * n;
    ctx.fillStyle = 'rgba(2,6,23,0.45)';
    ctx.fillRect(bx - 2, by - 2, cell * n + 4, cell * n + 4);
    const done = faces[fi].every((v) => v === faces[fi][0]);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const x = bx + c * cell, y = by + r * cell;
        ctx.fillStyle = shade(fd.col, 0.86 + 0.14 * ((r + c) % 2));
        ctx.fillRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
        ctx.strokeStyle = 'rgba(2,6,23,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
      }
    }
    ctx.strokeStyle = done ? 'rgba(52,211,153,0.9)' : 'rgba(148,163,184,0.35)';
    ctx.lineWidth = done ? 2.4 : 1.4;
    ctx.strokeRect(bx - 2, by - 2, cell * n + 4, cell * n + 4);
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = done ? '#34d399' : 'rgba(148,163,184,0.7)';
    ctx.fillText(fd.key, bx + cell * n / 2, by - 12);
  }
  ctx.font = '11.5px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(148,163,184,0.75)';
  ctx.fillText('展开图 · 绿框表示这一面已经归位', CX, oy + 4 * cell * n + 22);
}

function stepParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt * 1.4;
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
}

function drawParts() {
  for (const p of parts) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.col;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#141728');
  bg.addColorStop(1, '#080a13');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (netView) drawNet();
  else drawCube();
  drawParts();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(148,163,184,0.6)';
  ctx.fillText(n + ' 阶 · ' + stickerCount() + ' 张贴纸 · ' + (netView ? '展开图' : '拖动空白处转视角'), 14, 12);
  if (scrambled && !isSolved() && phase === 'play' && !started) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(251,191,36,0.9)';
    ctx.font = 'bold 12.5px system-ui, sans-serif';
    ctx.fillText('转第一下就开始计时', CX, H - 26);
  }
  if (flash > 0) {
    ctx.fillStyle = 'rgba(52,211,153,' + (flash * 0.18).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

/* ==================== 命中测试 ==================== */
function pointInQuad(x, y, pts) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    const cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (Math.abs(cr) < 1e-6) continue;
    const s = cr > 0 ? 1 : -1;
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function pickSticker(x, y) {
  if (netView) return null;
  const quads = collectQuads();
  for (let i = quads.length - 1; i >= 0; i--) {
    if (pointInQuad(x, y, quads[i].pts)) return quads[i];
  }
  return null;
}

// 按住贴纸拖动 = 转那一层。斜视角下"上下拖"和"前后拖"的屏幕投影很像，
// 所以不去比拖拽分量，而是反过来比两个候选转轴的屏幕速度，谁最顺手指就转谁。
function decideTurn(quad, dx, dy) {
  const cell = quad.cell;
  const fd = FACE_DEF[cell.fi];
  const p = centerOf(cell.fi, cell.r, cell.c);
  const len = Math.hypot(dx, dy);
  if (!len) return null;
  const ux = dx / len, uy = dy / len;                 // 手指方向
  let best = null;
  for (const base of [fd.R, fd.C]) {
    const axis = base[0] ? 0 : base[1] ? 1 : 2;
    const t3 = cross(base, p);                        // 候选转轴的速度：叉乘自带力臂
    const m3 = Math.hypot(t3[0], t3[1], t3[2]) || 1;
    const tv = toView([t3[0] / m3, t3[1] / m3, t3[2] / m3]);
    const visible = Math.hypot(tv[0], tv[1]);
    if (visible < 0.35) continue;                     // 只往屏幕里外动，转了也看不出来
    const score = tv[0] * ux + tv[1] * uy;            // 看得见又顺手指的优先
    if (!best || Math.abs(score) > best.abs) {
      best = { axis, layer: layerOf(p, axis), dir: (score > 0 ? 1 : -1) * base[axis], abs: Math.abs(score) };
    }
  }
  return best && best.abs > 0.03 ? best : null;
}

/* ==================== 输入 ==================== */
function toWorld(ev) {
  const rect = cv.getBoundingClientRect();
  const sx = (rect.width || W) / W;
  const sy = (rect.height || H) / H;
  return { x: ((ev.clientX || 0) - rect.left) / sx, y: ((ev.clientY || 0) - rect.top) / sy };
}

const ptrs = new Map();               // 多点触控：两指拉开 = 缩放
let pinch = null;

cv.addEventListener('pointerdown', (e) => {
  sfx.resume();
  const p = toWorld(e);
  if (e.pointerId !== undefined) ptrs.set(e.pointerId, p);
  if (ptrs.size >= 2) {               // 第二根手指落下，这一笔就当成捏合
    drag = null;
    cv.classList.remove('grabbing');
    const [a, b] = [...ptrs.values()];
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoom };
    return;
  }
  if (phase === 'intro' || netView) return;
  const quad = turn ? null : pickSticker(p.x, p.y);
  drag = quad
    ? { mode: 'maybe', quad, x0: p.x, y0: p.y }
    : { mode: 'orbit', x0: p.x, y0: p.y, yaw0: yaw, pitch0: pitch };
  if (drag.mode === 'orbit') cv.classList.add('grabbing');
});

cv.addEventListener('pointermove', (e) => {
  const p = toWorld(e);
  if (e.pointerId !== undefined && ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    zoom = clamp(pinch.z0 * ((Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinch.d0), 0.62, 1.7);
    return;
  }
  if (!drag) {
    const hit = !turn && !netView && pickSticker(p.x, p.y);
    cv.classList.toggle('face', !!hit);
    return;
  }
  const dx = p.x - drag.x0, dy = p.y - drag.y0;
  if (drag.mode === 'orbit') {
    yaw = drag.yaw0 + dx * 0.011;
    pitch = clamp(drag.pitch0 - dy * 0.009, -1.35, 1.35);   // 负号：让顶面跟着手指走
    return;
  }
  if (drag.mode === 'maybe' && Math.hypot(dx, dy) > 16) {
    const plan = decideTurn(drag.quad, dx, dy);
    drag = null;
    cv.classList.remove('grabbing');
    if (plan) {
      hoverAxis = plan;
      pushTurn(plan.axis, plan.layer, plan.dir);
      setTimeout(() => { hoverAxis = null; }, 220);
    }
  }
});

function endPointer(e) {
  if (e && e.pointerId !== undefined) ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  drag = null;
  cv.classList.remove('grabbing');
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
window.addEventListener('blur', () => { ptrs.clear(); pinch = null; drag = null; });

cv.addEventListener('wheel', (e) => {
  const d = e.deltaY || 0;
  zoom = clamp(zoom * (d > 0 ? 0.94 : 1.06), 0.62, 1.7);
  if (e.preventDefault) e.preventDefault();
}, { passive: false });

/* 公式键盘 */
for (const key of KEYS) {
  for (const variant of [[key, 1, ''], [key, -1, "'"]]) {
    const b = document.createElement('button');
    b.textContent = variant[0] + variant[2];
    b.className = variant[2] ? 'prime' : '';
    b.title = '转 ' + variant[0] + ' 面' + (variant[2] ? '逆时针' : '顺时针');
    b.addEventListener('click', () => { sfx.resume(); doMove(variant[0], variant[1]); });
    keypad.appendChild(b);
  }
}

for (const btn of diffEl.querySelectorAll('[data-size]')) {
  btn.addEventListener('click', () => {
    sfx.resume();
    switchSize(Number(btn.dataset.size));
  });
}

btnUndo.addEventListener('click', () => { sfx.resume(); undoMove(); });
btnScramble.addEventListener('click', () => { sfx.resume(); scramble(); });
btnReset.addEventListener('click', () => { sfx.resume(); resetCube(); });
btnNet.addEventListener('click', () => {
  netView = !netView;
  btnNet.classList.toggle('on', netView);
  sfx.tone(netView ? 660 : 440, 0.06, 'triangle', 0.08);
});
btnNew.addEventListener('click', () => { sfx.resume(); scramble(); });
btnSound.addEventListener('click', () => { btnSound.textContent = sfx.toggle() ? '🔇' : '🔊'; });

overlay.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  sfx.resume();
  const a = btn.dataset.act;
  if (a === 'start') scramble();
  else if (a === 'again') scramble();
  else if (a === 'resume') {
    const s = readSaved();
    if (s) restoreSaved(s);
    else scramble();
  } else if (a === 'free') { resetCube(); }
  else if (a === 'home') location.href = '../index.html';
});

window.addEventListener('keydown', (e) => {
  const k = e.key;
  const up = k.toUpperCase();
  if (k === 'z' || k === 'Z') { undoMove(); return; }
  if (k === 'g' || k === 'G') { btnNet.click(); return; }
  if (k === 'c' || k === 'C') { yaw = CAM0[0]; pitch = CAM0[1]; zoom = CAM0[2]; return; }
  if (k === 'Enter') { if (phase !== 'play') scramble(); return; }
  if (k === 'ArrowLeft') { yaw -= 0.16; e.preventDefault(); return; }
  if (k === 'ArrowRight') { yaw += 0.16; e.preventDefault(); return; }
  if (k === 'ArrowUp') { pitch = clamp(pitch + 0.12, -1.35, 1.35); e.preventDefault(); return; }
  if (k === 'ArrowDown') { pitch = clamp(pitch - 0.12, -1.35, 1.35); e.preventDefault(); return; }
  if (k === '2' || k === '3' || k === '4') { switchSize(Number(k)); return; }
  if (KEYS.indexOf(up) >= 0) {
    sfx.resume();
    if (phase === 'intro') return;
    doMove(up, e.shiftKey ? -1 : 1);
  }
});

/* ==================== HUD 与遮罩 ==================== */
function hud() {
  timeEl.textContent = fmtTime(seconds);
  movesEl.textContent = String(moves);
  const best = Number(store.get(bestKey()) || 0);
  bestEl.textContent = best > 0 ? fmtTime(best) : '--:--';
  undoNEl.textContent = String(history.length);
  btnUndo.disabled = history.length === 0;
  scrambleEl.textContent = scrambleText || '按「打乱」开始';
  for (const btn of diffEl.querySelectorAll('[data-size]')) {
    btn.classList.toggle('active', Number(btn.dataset.size) === n);
  }
}

function showIntro() {
  phase = 'intro';
  const saved = readSaved();
  const primary = saved
    ? '<button class="primary" data-act="resume">继续上一局</button><button class="ghost" data-act="start">重新打乱</button>'
    : '<button class="primary" data-act="start">打乱并开始</button>';
  showOverlay(
    '<div class="ov-emoji">🧊</div><h2>魔方</h2>' +
    '<p class="hint">这里没有贴图也没有 3D 库：' + n + ' 阶魔方的 ' + stickerCount() + ' 张贴纸<br>' +
    '是逐块投影、剔背面、按远近排序画出来的。<br>' +
    '<b>空白处拖动</b>转视角，<b>按住贴纸拖</b>就是转那一层。</p>' +
    '<div class="ov-actions">' + primary + '<a class="ghost" href="../index.html">回主页</a></div>'
  );
}

function showSolved(rec, prevBest) {
  showOverlay('<div class="ov-emoji">🎉</div><h2>还原成功！</h2>' +
    '<div class="final-score">' + fmtTime(seconds) + '</div>' +
    '<p class="final-sub">' + n + ' 阶 · ' + moves + ' 步 · ' +
    (rec ? '新纪录（原最佳 ' + (prevBest ? fmtTime(prevBest) : '无') + '）' : '最佳 ' + fmtTime(prevBest) + '，再加把劲') + '</p>' +
    '<div class="report"><div><b>' + moves + '</b><span>转动步数</span></div>' +
    '<div><b>' + (seconds > 0 ? Math.round(moves / seconds * 10) / 10 : 0) + '</b><span>每秒步数</span></div>' +
    '<div><b>' + n + '×</b><span>阶数</span></div></div>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再来一局</button>' +
    '<button class="ghost" data-act="free">自己拧着玩</button></div>');
}

function showOverlay(html) {
  overlayContent.innerHTML = html;
  overlay.classList.add('show');
}

/* ==================== 主循环 ==================== */
function resize() {
  const rect = cv.getBoundingClientRect();
  const cssW = rect.width || W;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.max(1, Math.round(cssW * dpr));
  cv.height = Math.max(1, Math.round(cssW * (H / W) * dpr));
  const k = cv.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}

function step(dt) {
  stepParts(dt);
  if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
  if (turn) {
    turn.ang += dt / TURN_DUR;
    if (turn.ang >= 1) {
      const done = turn;
      turn = null;
      commitTurn(done);
      if (queue.length) {
        const q = queue.shift();
        turn = { axis: q.axis, layer: q.layer, dir: q.dir, ang: 0 };
      }
    }
  }
  if (phase === 'play' && started) {
    seconds += dt;
    const shown = fmtTime(seconds);
    if (shown !== timeEl.textContent) timeEl.textContent = shown;
    if (Math.floor(seconds) % 5 === 0 && Math.floor(seconds) > 0) saveState();
  }
}

function frame(t) {
  requestAnimationFrame(frame);
  const now = t || 0;
  const dt = clamp((now - last) / 1000 || 0, 0, 0.05);
  last = now;
  tNow += dt;
  step(dt);
  draw();
}

/* ==================== 启动 ==================== */
resize();
window.addEventListener('resize', resize);
newCube();
cv.setAttribute('aria-label', n + ' 阶魔方');
hud();
showIntro();
requestAnimationFrame((t) => { last = t; frame(t); });

})();
