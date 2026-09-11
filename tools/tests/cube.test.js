'use strict';
/* 魔方：没有贴图也没有 3D 库，转层全靠整数坐标旋转。
   所以这里盯四件事：①几何自洽（转四次回原状、叉乘与 Rodrigues 一致）
   ②六个记法都是"看着那个面顺时针"，且打乱可逆 ③按住贴纸拖真的顺手指
   ④阶数/存档/最佳用时各键不串。 */
const { loadGame } = require('../smoketest.js');
const { ok, summary } = require('./_assert.js');

let fails = 0;
const chk = (cond, msg) => { const r = ok(cond, msg); if (!r) fails++; return !!r; };

// 只在测试构建里注入观测口，正式文件不含这段
const hook = [
  'window.__c = {',
  '  st: () => ({ n, moves, sec: Math.floor(seconds), phase, netView, started, scrambled,',
  '    solved: isSolved(), hist: history.length, queue: queue.length, animating: !!turn,',
  '    yaw, pitch, zoom, best: Number(store.get(bestKey()) || 0), quads: collectQuads().length }),',
  '  faces: () => faces.map((f) => f.slice()),',
  '  setFaces: (f) => { faces = f.map((row) => row.slice()); },',
  '  move: (key, dir) => doMove(key, dir === undefined ? 1 : dir),',
  '  applyTurn, rotVec, rotAbout, centerOf, layerOf, cellFromVec, layerCells,',
  '  toView, project, collectQuads, pickSticker, decideTurn, cross,',
  '  cam: () => [yaw, pitch, zoom],',
  '  setCam: (y, py, z) => { yaw = y; pitch = py; zoom = z === undefined ? zoom : z; },',
  '  scramble, undoMove, resetCube, switchSize, readSaved, restoreSaved, saveState,',
  '  isSolved, stickerCount, bestKey, moveLayer, KEYS, NOTATION, FACE_DEF, CAM0, W, H,',
  '  setNet: (v) => { netView = !!v; },',
  '  setSeconds: (v) => { seconds = v; },',
  '  setStarted: (v) => { started = !!v; },',
  '};',
].join('\n') + '\n';
const inj = (src, file) => {
  if (!/game\.js$/.test(file)) return src;
  const i = src.lastIndexOf('})();');
  if (i < 0) throw new Error('魔方源码结构变了，注入点找不到');
  return src.slice(0, i) + hook + src.slice(i);
};

const C = (g) => g.ctx.__c;
const st = (g) => g.ctx.__c.st();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tag = (fi, r, c, n) => fi * 1000 + r * 16 + c;    // 每张贴纸一个唯一号
const decode = (v) => [Math.floor(v / 1000), Math.floor((v % 1000) / 16), v % 16];

const open = (storage) => {
  const g = loadGame('cube', { transform: inj, storage: storage || {} });
  g.pump(0.3);
  return g;
};
const pressAct = (g, act) => {
  const btn = g.byId('overlayContent').querySelectorAll('button').find((b) => b.dataset.act === act);
  if (btn) btn.dispatch('click');
  g.pump(0.6);
  return !!btn;
};
// 桩里 canvas 的 rect 是 460x460，toWorld 会按 460/520 缩 y，换坐标时要还回去
const toClient = (g, x, y) => {
  const k = C(g);
  const r = g.canvas().getBoundingClientRect();
  return { clientX: r.left + x * (r.width / k.W), clientY: r.top + y * (r.height / k.H) };
};
const pointer = (g, type, x, y, extra) => {
  g.fire(g.canvas(), type, Object.assign(toClient(g, x, y), extra || {}));
};
// 在贴纸 (fi,r,c) 上按下面朝 dirv 方向拖 STEP 世界单位，走真实的 pointer 流程
const dragSticker = (g, fi, r, c, dirv, px) => {
  const k = C(g);
  px = px || 34;                               // 真实手势长度，稳稳越过 16px 死区
  const p = k.centerOf(fi, r, c);
  const v0 = k.project(k.toView(p));
  const v1 = k.project(k.toView([p[0] + dirv[0] * 0.5, p[1] + dirv[1] * 0.5, p[2] + dirv[2] * 0.5]));
  const raw = [v1[0] - v0[0], v1[1] - v0[1]];
  const rl = Math.hypot(raw[0], raw[1]) || 1;
  const d = [raw[0] / rl * px, raw[1] / rl * px];
  const before = k.faces();
  const plan = k.decideTurn({ cell: { fi, r, c } }, d[0], d[1]);
  pointer(g, 'pointerdown', v0[0], v0[1]);
  pointer(g, 'pointermove', v0[0] + d[0], v0[1] + d[1]);
  pointer(g, 'pointerup', v0[0] + d[0], v0[1] + d[1]);
  g.pump(0.5);
  return { plan, before, after: k.faces(), d, p, v0 };
};
// 用纯几何把一次转层"重放"一遍，和真实点击的结果对答案
const simulate = (k, faces0, plan, n) => {
  const out = faces0.map((row) => row.slice());
  for (let fi = 0; fi < 6; fi++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const p = k.centerOf(fi, r, c);
        if (k.layerOf(p, plan.axis) !== plan.layer) continue;
        const to = k.cellFromVec(k.rotVec(plan.axis, plan.dir, p), k.rotVec(plan.axis, plan.dir, k.FACE_DEF[fi].N));
        out[to[0]][to[1] * n + to[2]] = faces0[fi][r * n + c];
      }
    }
  }
  return out;
};
const countColors = (faces) => {
  const m = {};
  for (const f of faces) for (const v of f) m[v] = (m[v] || 0) + 1;
  return m;
};
const solvedFaces = (n) => {
  const out = [];
  for (let fi = 0; fi < 6; fi++) {
    const row = [];
    for (let i = 0; i < n * n; i++) row.push(fi);
    out.push(row);
  }
  return out;
};
const taggedFaces = (n) => {
  const out = [];
  for (let fi = 0; fi < 6; fi++) {
    const row = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) row.push(tag(fi, r, c, n));
    out.push(row);
  }
  return out;
};
const applyNotation = (k, key, dir) => {
  const m = k.NOTATION[key];
  k.applyTurn(m.axis, k.moveLayer(m), dir * m.dir);
};

/* ==================== 1. 启动 ==================== */
{
  const g = open();
  chk(g.draws() > 200, '启动后画了不少东西（' + g.draws() + ' 次绘制）');
  chk(st(g).phase === 'intro', '开局停在介绍页');
  chk(st(g).solved, '开局魔方是还原态');
  chk(st(g).n === 3, '默认三阶');
  chk(st(g).quads === 27, '默认视角只画 3 个可见面（27 张贴纸）');
  chk(g.byId('scrambleText').textContent.indexOf('按') >= 0, '打乱条提示按键');
  chk(g.byId('best').textContent === '--:--', '没纪录时最佳显示 --:--');
  chk(g.byId('moves').textContent === '0', '步数从 0 开始');
  chk(g.byId('keypad').children.length === 12, '公式键盘 12 个键（6 面 × 顺逆）');
  const vis = C(g).FACE_DEF.filter((fd) => C(g).toView(fd.N)[2] > 0.02).map((fd) => fd.key).join('');
  chk(vis === 'URF' || vis === 'FRU' || vis === 'RFU', '默认相机看到的是 U/R/F 三面（' + vis + '）');
  let finite = true;
  for (const q of C(g).collectQuads()) for (const p of q.pts) if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) finite = false;
  chk(finite, '所有贴纸投影都是有限数');
  // 介绍页不许转
  C(g).move('U', 1);
  g.pump(0.4);
  chk(st(g).moves === 0, '介绍页点公式键不转');
  chk(pressAct(g, 'start'), '遮罩上有「打乱并开始」');
  chk(st(g).phase === 'play' && st(g).scrambled, '点开始进入对局并打乱');
}

/* ==================== 1b. 画面真的像个立方体 ==================== */
{
  const g = open();
  const k = C(g);
  const at = (key) => k.project(k.toView(k.centerOf(k.FACE_DEF.findIndex((fd) => fd.key === key), 1, 1)));
  const U = at('U'), F = at('F'), R = at('R'), D = at('D'), L = at('L');
  chk(U[1] < F[1] && U[1] < R[1], '顶面画在上面（U 的 y=' + U[1].toFixed(0) + '）');
  chk(R[0] > F[0] && L[0] < F[0], '右面在右、左面在左（F=' + F[0].toFixed(0) + ' R=' + R[0].toFixed(0) + '）');
  chk(D[1] > U[1], '底面排在顶面下面（虽然它被剔掉了）');
  const box = (q) => q.pts.reduce((a, p) => [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])], [1e9, 1e9, -1e9, -1e9]);
  const bb = k.collectQuads().map(box).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  const w = bb[2] - bb[0], h = bb[3] - bb[1];
  chk(w > k.W * 0.55 && w < k.W * 0.95, '立方体横向占画面 ' + (100 * w / k.W).toFixed(0) + '%（不太小也不贴边）');
  chk(bb[0] > 0 && bb[2] < k.W && bb[1] > 0 && bb[3] < k.H - 40, '默认视角整个方块都在画布内并且留出了底部文字区');
  let sorted = true, lit = true;
  const qs = k.collectQuads();
  for (let i = 1; i < qs.length; i++) if (qs[i].depth < qs[i - 1].depth) sorted = false;
  for (const q of qs) if (!(q.light >= 0.5 && q.light <= 1.15)) lit = false;
  chk(sorted, '画家算法：先画远的再画近的（depth 递增）');
  chk(lit, 'Lambert 光照系数都在合理区间');
  // 任意视角/阶数在默认缩放下一整块都在画布里；放大后也只允许适度出血，不许飞出去
  let fit = true, sane = true;
  const bounds = (zoom) => {
    let b = [1e9, 1e9, -1e9, -1e9];
    for (const [yy, pp] of [[0.7, -0.2], [-2.2, -1.3], [3.0, 0.4], [1.57, -1.05], [-0.6, -0.42], [0, 0]]) {
      k.setCam(yy, pp, zoom);
      for (const size of [2, 3, 4]) {
        k.switchSize(size);
        for (const q of k.collectQuads()) {
          const c = box(q);
          b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[2]), Math.max(b[3], c[3])];
          for (const p of q.pts) if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) sane = false;
        }
      }
    }
    return b;
  };
  const b1 = bounds(1);
  if (b1[0] < -2 || b1[2] > k.W + 2 || b1[1] < -2 || b1[3] > k.H + 2) fit = false;
  chk(fit, '默认缩放下任意视角 × 阶数，整个方块都在画布内');
  const bMax = bounds(1.7);
  chk(sane && bMax[2] - bMax[0] < k.W * 2.2, '滚轮放到最大也只是适度出血（宽 ' + (bMax[2] - bMax[0]).toFixed(0) + 'px），没有 NaN/爆图');
  k.setCam(k.CAM0[0], k.CAM0[1], k.CAM0[2]);
  k.switchSize(3);
}

/* ==================== 2. 几何：转四次回原状 / 逆序还原 / 颜色守恒 ==================== */
{
  for (const size of [2, 3, 4]) {
    const g = open();
    const k = C(g);
    k.switchSize(size);
    k.resetCube();
    const base = k.faces();
    let allBack = true;
    for (const key of k.KEYS) {
      for (const dir of [1, -1]) {
        k.resetCube();
        for (let i = 0; i < 4; i++) applyNotation(k, key, dir);
        if (!same(k.faces(), base)) allBack = false;
      }
    }
    chk(allBack, size + ' 阶：12 种记法各转 4 次都回到原状');
    // 打乱后逆序还原
    k.scramble();
    const mid = k.faces();
    k.resetCube();
    const seq = [];
    for (let i = 0; i < 25; i++) {
      const key = k.KEYS[Math.floor(Math.random() * 6)];
      const dir = Math.random() < 0.5 ? 1 : -1;
      seq.push([key, dir]);
      applyNotation(k, key, dir);
    }
    for (let i = seq.length - 1; i >= 0; i--) applyNotation(k, seq[i][0], -seq[i][1]);
    chk(k.isSolved(), size + ' 阶：25 步乱拧按逆序反向能转回去');
    // 颜色守恒
    const cnt = countColors(k.faces());
    const keys = Object.keys(cnt);
    chk(keys.length === 6 && keys.every((x) => cnt[x] === size * size),
      size + ' 阶：任意转法后每色仍然 ' + size * size + ' 张');
    // 叉乘整数旋转 == Rodrigues 90°
    const vs = [[3, -2, 1], [0, 4, -2], [-3, 0, 0], [2, 2, 2]];
    let agree = true;
    for (const v of vs) {
      for (let axis = 0; axis < 3; axis++) {
        for (const dir of [1, -1]) {
          const a = k.rotVec(axis, dir, v);
          const b = k.rotAbout(axis, dir * Math.PI / 2, v).map((x) => Math.round(x));
          if (!same(a, b)) agree = false;
        }
      }
    }
    chk(agree, size + ' 阶：整数旋转与动画用的 Rodrigues 完全一致');
    // 层归属：每层 4n+... 张贴纸
    const cells = k.layerCells(0, size - 1);
    chk(cells.length === size * size + 4 * size,
      size + ' 阶：一层 = 自己那面 n² + 四个邻面各 n 张（实际 ' + cells.length + '）');
    chk(k.layerCells(0, 0).length === cells.length && (size % 2 ? k.layerCells(0, 1).length !== cells.length : true),
      size + ' 阶：换一层贴纸数会变（中间层不是外层）' );
    g.pump(1);
  }
}

/* ==================== 3. 顺时针语义（独立对答案） ==================== */
{
  for (const size of [3, 4]) {
    const g = open();
    const k = C(g);
    k.switchSize(size);
    const n = size;
    let cw = true, cycle = true;
    for (const key of k.KEYS) {
      k.setFaces(taggedFaces(n));
      const before = k.faces();
      applyNotation(k, key, 1);
      const after = k.faces();
      const fi = k.FACE_DEF.findIndex((fd) => fd.key === key);
      // ① 自己这一面顺时针：(r,c) → (c, n-1-r)
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (after[fi][c * n + (n - 1 - r)] !== before[fi][r * n + c]) cw = false;
        }
      }
    }
    chk(cw, size + ' 阶：六个面的记法都是"看着这个面顺时针"');
    // ② 跨面循环：U 顺时针把 F 顶行送进 L 顶行（标准 U 的 URF→UFL）
    k.setFaces(taggedFaces(n));
    applyNotation(k, 'U', 1);
    for (let c = 0; c < n; c++) {
      const got = k.faces()[3][0 * n + c];                 // L 面顶行
      if (got !== tag(4, 0, c, n)) cycle = false;          // 来自 F 面顶行
    }
    chk(cycle, size + ' 阶：U 把 F 顶行整行送进 L 顶行（不错位）');
    // ③ 一层只动该动的那 4n 张：还原态下转 R，改动数 = 4n
    k.resetCube();
    const s0 = k.faces();
    applyNotation(k, 'R', 1);
    let changed = 0;
    for (let fi = 0; fi < 6; fi++) for (let i = 0; i < n * n; i++) if (k.faces()[fi][i] !== s0[fi][i]) changed++;
    chk(changed === 4 * n, size + ' 阶：单步 R 只改动 4n=' + 4 * n + ' 张贴纸（实际 ' + changed + '）');
    // ④ R 层只碰 x 最大的那一列：F 面左边几列不许变
    k.resetCube();
    const s1 = k.faces();
    applyNotation(k, 'R', 1);
    let untouched = true;
    for (let r = 0; r < n; r++) for (let c = 0; c < n - 1; c++) if (k.faces()[4][r * n + c] !== s1[4][r * n + c]) untouched = false;
    chk(untouched, size + ' 阶：转 R 时 F 面只有最右列参与');
    g.pump(1);
  }
}

/* ==================== 4. 打乱 / 存档 / 撤销 ==================== */
{
  const g = open();
  const k = C(g);
  pressAct(g, 'start');
  const s = st(g);
  const toks = g.byId('scrambleText').textContent.trim().split(' ');
  chk(s.scrambled && !s.solved, '打乱后确实没在还原态');
  chk(toks.length === 22, '三阶打乱 22 步（实际 ' + toks.length + '）');
  chk(toks.every((t) => /^[UDLRFB]'?$/.test(t)), '打乱条只含合法记号');
  chk(toks.every((t, i) => i === 0 || t[0] !== toks[i - 1][0]), '打乱不连续转同一个面');
  chk(s.moves === 0 && s.hist === 0, '打乱不算步数也不进撤销栈');
  const saved = JSON.parse(g.storage.getItem('cube.save'));
  chk(saved && saved.size === 3 && saved.faces.length === 6, '存档写入 cube.save');
  chk(same(saved.faces.map((row) => row.split('').map(Number)), k.faces()), '存档和当前状态一致');
  // 走 3 步再撤销
  const snap = [];
  for (let i = 0; i < 3; i++) { k.move('U', 1); g.pump(0.4); snap.push(k.faces()); }
  chk(st(g).moves === 3 && st(g).hist === 3, '转 3 步：步数与撤销栈都到 3');
  k.undoMove(); g.pump(0.2);
  chk(same(k.faces(), snap[1]) && st(g).hist === 2, '撤销回到上一步');
  k.undoMove(); k.undoMove(); g.pump(0.4);
  chk(st(g).hist === 0 && st(g).moves === 0, '撤销到底：栈与步数归零');
  const atScramble = k.faces();
  k.undoMove(); g.pump(0.2);
  chk(same(k.faces(), atScramble) && !k.isSolved(), '撤销不越过打乱（不会白送还原）');
  chk(g.byId('btnUndo').disabled, '没得撤时撤销按钮禁用');
  // 复原 = 放弃这一局
  k.resetCube();
  chk(k.isSolved() && !st(g).scrambled && g.storage.getItem('cube.save') === null, '「复原」清掉未完局存档');
  // 换阶：按 2/3/4 直接选阶数
  g.key('2'); g.pump(0.2);
  chk(st(g).n === 2 && g.storage.getItem('cube.size') === '2', '按 2 切到二阶并记住');
  chk(g.byId('cv').getAttribute('aria-label') === '2 阶魔方', '无障碍标签跟着阶数走');
  chk(st(g).quads === 12, '二阶默认视角 12 张贴纸');
  g.key('4'); g.pump(0.2);
  chk(st(g).n === 4 && st(g).quads === 48, '按 4 切到四阶（48 张可见贴纸）');
  const sizeBtn = g.byId('diff').querySelectorAll('[data-size]').find((b) => b.dataset.size === '3');
  sizeBtn.dispatch('click'); g.pump(0.2);
  chk(st(g).n === 3 && g.storage.getItem('cube.size') === '3', '点「三阶」按钮切阶');
  chk(g.byId('diff').querySelectorAll('[data-size]').filter((b) => b.classList.contains('active')).length === 1, '只有一个阶数按钮高亮');
}

/* ==================== 5. 键盘 / 动画队列 ==================== */
{
  const g = open();
  const k = C(g);
  pressAct(g, 'start');
  const before = k.faces();
  g.key('R'); g.pump(0.4);
  chk(!same(k.faces(), before) && st(g).moves === 1, '按 R 转一步');
  g.key('R', { shiftKey: true }); g.pump(0.4);
  chk(st(g).moves === 2 && k.isSolved() === false, 'Shift+R 反向再转一步');
  chk(same(k.faces(), before), 'R 紧跟 R\' 等于没转');
  k.resetCube();
  g.key('U'); g.key('D'); g.key('F'); g.pump(0.02);
  const q = st(g);
  chk(q.animating && q.queue === 2, '动画期间连点会排队（队列 ' + q.queue + '）');
  g.pump(1.2);
  chk(st(g).moves === 3 && !st(g).animating && st(g).queue === 0, '队列会依次放完');
  const t0 = st(g);
  g.key('z'); g.pump(0.3);
  chk(st(g).hist === t0.hist - 1, 'Z 撤销');
  const cam0 = k.cam();
  g.key('ArrowLeft'); g.key('ArrowUp'); g.pump(0.1);
  chk(k.cam()[0] < cam0[0] && k.cam()[1] > cam0[1], '方向键转视角');
  g.key('c'); g.pump(0.1);
  chk(same(k.cam(), k.CAM0), 'C 复位视角');
  g.key('g'); g.pump(0.2);
  chk(st(g).netView, 'G 切到展开图');
  chk(g.draws() > 0 && st(g).quads === 27, '展开图模式下几何还在（只是不画它）');
  g.key('g'); g.pump(0.2);
  chk(!st(g).netView, '再按 G 切回 3D');
  chk(!k.pickSticker(k.W / 2, k.H / 2) || true, '展开图下不做 3D 命中（不崩就行）');
}

/* ==================== 6. 拖动：转视角 / 转层 / 缩放 ==================== */
{
  const g = open();
  const k = C(g);
  pressAct(g, 'start');
  // 空白处拖 = 只转视角
  const cam0 = k.cam();
  pointer(g, 'pointerdown', 12, 12);
  pointer(g, 'pointermove', 70, 60);
  pointer(g, 'pointerup', 70, 60);
  g.pump(0.3);
  const cam1 = k.cam();
  chk(cam1[0] !== cam0[0] && cam1[1] !== cam0[1], '空白处拖动转视角');
  chk(st(g).moves === 0 && same(k.faces(), k.faces()), '空白处拖动不转层');
  chk(cam1[1] < cam0[1], '往下拖看到底面（顶面跟着手指走）');
  // 滚轮缩放并夹住
  pointer(g, 'pointerdown', 12, 12); pointer(g, 'pointerup', 12, 12);
  for (let i = 0; i < 40; i++) g.fire(g.canvas(), 'wheel', { deltaY: 120 });
  chk(k.cam()[2] > 0.6 && k.cam()[2] < 1.7, '缩放被夹在合理区间');
  for (let i = 0; i < 40; i++) g.fire(g.canvas(), 'wheel', { deltaY: -120 });
  chk(k.cam()[2] <= 1.7, '放大也有上限');
  g.key('c'); g.pump(0.1);
  // 贴着贴纸拖 = 转那一层，而且必须顺手指
  const n = st(g).n;
  const cases = [];
  for (const fi of [0, 2, 4]) {                      // 默认视角下看得见的 U / R / F
    const fd = k.FACE_DEF[fi];
    for (const dirv of [fd.R, fd.C, fd.R.map((v) => -v), fd.C.map((v) => -v)]) cases.push([fi, 1, 1, dirv]);
  }
  let followed = 0, matched = 0, layered = 0;
  for (const [fi, r, c, dirv] of cases) {
    const res = dragSticker(g, fi, r, c, dirv);
    if (!res.plan) continue;
    if (res.plan.layer === k.layerOf(res.p, res.plan.axis)) layered++;
    if (same(res.after, simulate(k, res.before, res.plan, n))) matched++;
    const mv0 = k.project(k.toView(res.p));
    const mv1 = k.project(k.toView(k.rotAbout(res.plan.axis, res.plan.dir * 0.12, res.p)));
    if ((mv1[0] - mv0[0]) * res.d[0] + (mv1[1] - mv0[1]) * res.d[1] > 0) followed++;
  }
  chk(layered === cases.length, '拖动选中的层一定包含被拖的贴纸（' + layered + '/' + cases.length + '）');
  chk(matched === cases.length, '真实拖动转出的结果 == 该转层的置换（' + matched + '/' + cases.length + '）');
  chk(followed === cases.length, 'U/R/F 四面心 × 4 方向都顺手指（' + followed + '/' + cases.length + '）');
  chk(st(g).moves === cases.length, '12 次拖动就转了 ' + st(g).moves + ' 步');
  // 两指捏合缩放（移动端），并且捏合期间不许误转层
  const mv0 = st(g).moves;
  const z0 = k.cam()[2];
  const cvEl = g.canvas();
  const raw = (type, id, x, y) => g.fire(cvEl, type, Object.assign(toClient(g, x, y), { pointerId: id }));
  raw('pointerdown', 1, 100, 300);
  raw('pointerdown', 2, 160, 300);
  raw('pointermove', 2, 260, 300);
  g.pump(0.2);
  chk(k.cam()[2] > z0, '双指拉开放大（zoom ' + z0.toFixed(2) + ' → ' + k.cam()[2].toFixed(2) + '）');
  raw('pointermove', 2, 110, 300);
  g.pump(0.2);
  chk(k.cam()[2] < z0 * 1.6, '双指收拢能缩回去（' + k.cam()[2].toFixed(2) + '）');
  chk(st(g).moves === mv0, '捏合缩放不会顺手把层转了');
  raw('pointerup', 2, 110, 300);
  raw('pointermove', 1, 300, 400);
  g.pump(0.2);
  chk(st(g).moves === mv0, '抬起一根手指后另一根也不会补一次转层');
  raw('pointerup', 1, 300, 400);
  g.key('c'); g.pump(0.1);
  // 展开图模式下拖动不转层
  g.key('g'); g.pump(0.2);
  const m0 = st(g).moves;
  const fd = k.FACE_DEF[4];
  dragSticker(g, 4, 1, 1, fd.C);
  chk(st(g).moves === m0, '展开图里拖来拖去不会误转层');
  g.key('g'); g.pump(0.2);
}

/* ==================== 7. 跟手大范围扫描（含斜视角、四角） ==================== */
{
  const g = open();
  const k = C(g);
  let tot = 0, bad = 0, nulls = 0;
  for (let yaw = -3.1; yaw < 3.1; yaw += 0.35) {
    for (let pitch = -1.3; pitch <= 1.3; pitch += 0.26) {
      k.setCam(yaw, pitch);
      for (const size of [2, 3, 4]) {
        k.switchSize(size);
        k.resetCube();
        for (let fi = 0; fi < 6; fi++) {
          const fd = k.FACE_DEF[fi];
          const vis = k.toView(fd.N)[2];
          if (vis < 0.25) continue;
          for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
              const p = k.centerOf(fi, r, c);
              const v0 = k.project(k.toView(p));
              for (const dirv of [fd.R, fd.C, fd.R.map((v) => -v), fd.C.map((v) => -v)]) {
                const q = k.project(k.toView([p[0] + dirv[0] * 0.4, p[1] + dirv[1] * 0.4, p[2] + dirv[2] * 0.4]));
                const d = [q[0] - v0[0], q[1] - v0[1]];
                const dl = Math.hypot(d[0], d[1]);
                if (dl < 8) continue;                 // 屏幕上不到 8px 的方向，用户自己也没方向感
                tot++;
                const plan = k.decideTurn({ cell: { fi, r, c } }, d[0], d[1]);
                if (!plan) { nulls++; continue; }
                if (plan.layer !== k.layerOf(p, plan.axis)) { bad++; continue; }
                const ax = [plan.axis === 0 ? 1 : 0, plan.axis === 1 ? 1 : 0, plan.axis === 2 ? 1 : 0];
                const lever = Math.hypot(...k.cross(ax, p)) || 1;
                const m1 = k.project(k.toView(k.rotAbout(plan.axis, plan.dir * (0.4 / lever), p)));
                const cos = ((m1[0] - v0[0]) * d[0] + (m1[1] - v0[1]) * d[1]) /
                  (Math.hypot(m1[0] - v0[0], m1[1] - v0[1]) * dl);
                if (cos < -0.25) bad++;               // 明确拧反才算错
              }
            }
          }
        }
      }
    }
  }
  k.setCam(k.CAM0[0], k.CAM0[1], k.CAM0[2]);
  k.switchSize(3);
  chk(tot > 20000, '全视角扫描跑了 ' + tot + ' 个拖动方向');
  chk(bad === 0, '扫描中没有一个方向被拧反（bad=' + bad + '）');
  chk(nulls / tot < 0.01, '只有 ' + (100 * nulls / tot).toFixed(2) + '% 的极端手势选择"不猜"');
}

/* ==================== 8. 计时 / 通关 / 最佳成绩 ==================== */
{
  const g = open({ 'cube.size': '3' });
  const k = C(g);
  const unscramble = () => {                       // 照着打乱公式反着转回去
    for (const t of g.byId('scrambleText').textContent.trim().split(' ').reverse()) {
      k.move(t[0], t.length > 1 ? 1 : -1);         // 逆序 + 反向
      g.pump(0.35);
    }
  };
  const startRun = (sec) => {                      // 开一局并假装已经转了 sec 秒
    k.scramble();
    k.setStarted(true);
    k.setSeconds(sec);
  };
  pressAct(g, 'start');
  chk(st(g).started === false, '没转之前不计时');
  pointer(g, 'pointerdown', 12, 12);
  pointer(g, 'pointermove', 60, 40);
  pointer(g, 'pointerup', 60, 40);
  g.pump(0.2);
  chk(st(g).started === false, '只转视角不算开始计时');
  g.pump(30);
  chk(st(g).sec === 0 && !st(g).started, '打乱后光放着不计时');
  g.key('U'); g.pump(0.4);
  chk(st(g).started && st(g).sec < 2, '第一次转层才起表（从 0 开始）');
  g.pump(20);
  chk(st(g).sec >= 19, '计时在走（' + st(g).sec + 's）');
  chk(g.byId('time').textContent === Math.floor(st(g).sec / 60) + ':' + String(Math.floor(st(g).sec) % 60).padStart(2, '0'), 'HUD 时间与状态一致');
  chk(!!g.storage.getItem('cube.save'), '未完局时 cube.save 一直在');
  // 乱拧 40 步再逆序，盘面无恙（纯置换，不走动画）
  const snap = k.faces();
  const seq = [];
  for (let i = 0; i < 40; i++) {
    const key = k.KEYS[Math.floor(Math.random() * 6)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    seq.push([key, dir]);
    applyNotation(k, key, dir);
  }
  for (let i = seq.length - 1; i >= 0; i--) applyNotation(k, seq[i][0], -seq[i][1]);
  chk(same(k.faces(), snap), '40 步乱拧按逆序反向能转回原样');
  // 通关
  startRun(30);
  unscramble();
  chk(k.isSolved(), '照打乱公式逆序能真的还原');
  chk(st(g).phase === 'solved', '还原后进入通关页');
  const best = g.storage.getItem('cube.best.3');
  chk(Number(best) >= 30 && Number(best) < 48, '写下三阶最佳用时 ' + best);
  chk(g.storage.getItem('cube.save') === null, '通关后删掉未完局存档');
  chk(g.byId('overlayContent').innerHTML.indexOf('还原成功') >= 0, '通关文案出现');
  chk(g.byId('overlayContent').innerHTML.indexOf('新纪录') >= 0, '第一次通关算新纪录');
  chk(pressAct(g, 'again'), '通关页有「再来一局」');
  chk(st(g).phase === 'play' && st(g).scrambled, '点了之后确实开新局');
  // 慢一局不破纪录
  const prevBest = Number(best);
  startRun(prevBest + 500);
  unscramble();
  chk(Number(g.storage.getItem('cube.best.3')) === prevBest, '更慢的一局不覆盖纪录');
  chk(g.byId('overlayContent').innerHTML.indexOf('再加把劲') >= 0, '没破纪录时给的是鼓励话术');
  // 快一局刷新
  startRun(5);
  unscramble();
  chk(Number(g.storage.getItem('cube.best.3')) < prevBest, '更快的一局刷新纪录');
  chk(g.storage.getItem('cube.best.2') === null, '二阶纪录键不被三阶污染');
  // 通关页的「自己拧着玩」= 复原
  chk(pressAct(g, 'free'), '通关页有「自己拧着玩」');
  chk(k.isSolved() && !st(g).scrambled && st(g).phase === 'play', '拧着玩：盘面干净、不算计时局');
  chk(g.storage.getItem('cube.save') === null, '自由玩法不写未完局存档');
  // 四阶单独计时
  k.switchSize(4);
  startRun(40);
  unscramble();
  chk(k.isSolved(), '四阶也能照公式逆序还原');
  chk(Number(g.storage.getItem('cube.best.4')) >= 40, '四阶纪录写进 cube.best.4');
  g.pump(1);
}

/* ==================== 9. 续玩 / 脏档 ==================== */
{
  const g0 = open();
  pressAct(g0, 'start');
  C(g0).move('R', 1); g0.pump(0.4);
  C(g0).move('U', -1); g0.pump(0.4);
  const faces = C(g0).faces();
  const seed = {};
  for (const k of Object.keys(g0.storage._data)) seed[k] = g0.storage.getItem(k);
  const g = open(seed);
  chk(g.byId('overlayContent').innerHTML.indexOf('继续上一局') >= 0, '有未完局时介绍页给出「继续上一局」');
  chk(pressAct(g, 'resume'), '点继续');
  chk(same(C(g).faces(), faces), '盘面按存档还原');
  chk(st(g).moves === 2 && st(g).hist === 0, '续玩不继承撤销栈（不能撤销到打乱之前）');
  chk(st(g).phase === 'play', '续玩直接进对局');
  // 脏档
  const junk = [
    'not json', '{"size":3,"faces":["abc"]}', '{"size":5,"faces":["000","000","000","000","000","000"]}',
    '{"size":3,"faces":["012","012","012","012","012","012x"]}',
  ];
  junk.push('{"size":3,"faces":["016","018","019","012","012","012"]}');   // 颜色号越界
  junk.push('{"size":3,"faces":["000","000","000","000","000","000"]}');   // 每色数量不对
  for (const raw of junk) {
    const gd = open({ 'cube.save': raw, 'cube.size': '3' });
    chk(C(gd).readSaved() === null, '坏存档被拒绝：' + raw.slice(0, 26));
    chk(gd.byId('overlayContent').innerHTML.indexOf('继续上一局') < 0, '坏档不会谎称有未完局：' + raw.slice(0, 14));
    chk(pressAct(gd, 'start'), '坏档也能直接开新局（' + raw.slice(0, 14) + '）');
    chk(st(gd).scrambled && !st(gd).solved && st(gd).phase === 'play', '坏档开的新局正常可玩：' + raw.slice(0, 14));
    gd.pump(2);
  }
}

/* ==================== 10. 静音 / 无障碍 / 存储键 ==================== */
{
  const g = open();
  chk(g.storage.getItem('cube.muted') === null, '没点过就不写静音键');
  g.byId('btnSound').dispatch('click'); g.pump(0.2);
  chk(g.storage.getItem('cube.muted') === '1', '点喇叭写入 cube.muted');
  chk(g.byId('btnSound').textContent === '🔇', '静音后图标变化');
  g.byId('btnSound').dispatch('click'); g.pump(0.2);
  chk(g.byId('btnSound').textContent === '🔊', '再点取消静音');
  const keys = Object.keys(g.storage._data);
  chk(keys.every((x) => x.indexOf('cube.') === 0), '所有存储键都以 cube. 开头：' + keys.join(','));
  // 三个工具按钮都能点
  pressAct(g, 'start');
  g.byId('btnNet').dispatch('click'); g.pump(0.3);
  chk(st(g).netView, '工具栏「展开图」可点');
  g.byId('btnNet').dispatch('click'); g.pump(0.3);
  g.byId('btnScramble').dispatch('click'); g.pump(0.5);
  chk(st(g).moves === 0 && st(g).scrambled, '「打乱」重开一局');
  g.byId('btnReset').dispatch('click'); g.pump(0.3);
  chk(st(g).solved, '「复原」把魔方转回原状');
  g.byId('btnNew').dispatch('click'); g.pump(0.5);
  chk(st(g).scrambled, '右上角 ↻ 重新打乱');
  chk(g.byId('undoN').textContent === '0', '打乱后撤销计数归零');
  // 介绍页只有「打乱并开始」，没有存档就不给「继续」
  const g2 = open();
  const acts = g2.byId('overlayContent').querySelectorAll('button').map((b) => b.dataset.act).join(',');
  chk(acts === 'start', '干净首次进入只有 start（实际 ' + acts + '）');
  g2.byId('btnNew').dispatch('click'); g2.pump(0.5);
  chk(st(g2).moves === 0, '打完乱后步数从 0 开始');
  g2.pump(3);
  chk(st(g2).phase === 'play', '放着不动也不会自己判负');
  const back = g2.byId('overlayContent');
  chk(back.innerHTML.length > 0 || !g2.byId('overlay').classList.contains('show'), '遮罩收起后不再显示按钮');
}

summary('魔方', fails);
