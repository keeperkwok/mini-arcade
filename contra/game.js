'use strict';

// ===================== DOM =====================
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const boardWrap = document.getElementById('boardWrap');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const stageEl = document.getElementById('stage');
const livesEl = document.getElementById('lives');
const btnSound = document.getElementById('btnSound');
const btnPause = document.getElementById('btnPause');
const touchEl = document.getElementById('touch');

// ===================== 工具 =====================
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, sans-serif';
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function segDist2(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return dist2(px, py, x0 + dx * t, y0 + dy * t);
}

// ===================== 视图 =====================
const VIEW_W = 960, VIEW_H = 540;
const GRAV = 2300;
let DPR = 1, scale = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const w = boardWrap.clientWidth, h = boardWrap.clientHeight;
  canvas.width = Math.max(1, Math.round(w * DPR));
  canvas.height = Math.max(1, Math.round(h * DPR));
  scale = w / VIEW_W;
}
window.addEventListener('resize', resize);
resize();

// ===================== 状态 =====================
const STATE = { TITLE: 0, PLAYING: 1, PAUSED: 2, OVER: 3 };
let state = STATE.TITLE;
let time = 0;
let score = 0;
let best = Number(localStorage.getItem('contra.best') || 0) || 0;
let muted = localStorage.getItem('contra.muted') === '1';
let lives = 3, stage = 1;
let konamiOn = false;
let camX = 0, shake = 0, flashA = 0;
let banner = null;
let clearT = 0, overT = 0, newRecord = false;

let level = null, boss = null, pendingEnemies = [];
const pBullets = [], eBullets = [], enemies = [], pods = [], items = [], beams = [];
const particles = [], popups = [];

function syncChips() {
  scoreEl.textContent = score;
  bestEl.textContent = Math.max(best, score);
  stageEl.textContent = stage;
  livesEl.textContent = Math.max(0, lives);
}

// ===================== 音频(Web Audio 合成) =====================
let AC = null, master = null, sfxBus = null, musicBus = null, delayNode = null, noiseBuf = null;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  AC = new Ctx();
  master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
  sfxBus = AC.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musicBus = AC.createGain(); musicBus.gain.value = 0.42; musicBus.connect(master);
  delayNode = AC.createDelay(0.6); delayNode.delayTime.value = 0.22;
  const fb = AC.createGain(); fb.gain.value = 0.2;
  const wet = AC.createGain(); wet.gain.value = 0.3;
  delayNode.connect(fb); fb.connect(delayNode); delayNode.connect(wet); wet.connect(musicBus);
  noiseBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 0.5), AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
function tone(opts) {
  if (!AC || muted) return;
  const t0 = opts.t0 != null ? opts.t0 : AC.currentTime;
  const dur = opts.dur || 0.1;
  const vol = opts.vol != null ? opts.vol : 0.15;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = opts.type || 'square';
  o.frequency.setValueAtTime(Math.max(opts.f0 || 440, 1), t0);
  if (opts.f1) o.frequency.exponentialRampToValueAtTime(Math.max(opts.f1, 1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(opts.bus || sfxBus);
  if (opts.echo && delayNode) g.connect(delayNode);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function noiseShot(opts) {
  if (!AC || muted) return;
  const t0 = opts.t0 != null ? opts.t0 : AC.currentTime;
  const dur = opts.dur || 0.3;
  const vol = opts.vol != null ? opts.vol : 0.3;
  const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.freq || 900;
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(t0); src.stop(t0 + dur + 0.05);
}
function jingle(notes, step = 0.09, type = 'square', vol = 0.12) {
  if (!AC || muted) return;
  notes.forEach((m, i) => { if (m) tone({ type, f0: midiHz(m), dur: step * 0.95, vol, t0: AC.currentTime + i * step, echo: true }); });
}
const sfxShoot = (w) => {
  if (w === 'L') { tone({ type: 'sawtooth', f0: 1500, f1: 180, dur: 0.18, vol: 0.13 }); return; }
  if (w === 'S') { tone({ f0: 760, f1: 240, dur: 0.09, vol: 0.12 }); return; }
  tone({ f0: 980, f1: 320, dur: 0.06, vol: w === 'M' ? 0.09 : 0.12 });
};
const sfxEnemyShoot = () => tone({ f0: 260, f1: 120, dur: 0.07, vol: 0.05 });
const sfxExplosion = () => { noiseShot({ dur: 0.45, vol: 0.4, freq: 750 }); tone({ type: 'sine', f0: 150, f1: 38, dur: 0.4, vol: 0.26 }); };
const sfxJump = () => tone({ f0: 210, f1: 560, dur: 0.12, vol: 0.06 });
const sfxPickup = () => jingle([74, 88], 0.07, 'square', 0.12);
const sfx1UP = () => jingle([69, 76, 81, 88], 0.07, 'triangle', 0.16);
const sfxDeath = () => { tone({ type: 'sawtooth', f0: 420, f1: 50, dur: 0.5, vol: 0.2 }); noiseShot({ dur: 0.35, vol: 0.25, freq: 500 }); };
const sfxSplash = () => { noiseShot({ dur: 0.35, vol: 0.28, freq: 700 }); tone({ type: 'sine', f0: 300, f1: 80, dur: 0.3, vol: 0.1 }); };
const sfxBossHit = () => { tone({ f0: 185, f1: 140, dur: 0.06, vol: 0.12 }); tone({ type: 'triangle', f0: 1150, f1: 880, dur: 0.05, vol: 0.06 }); };
const sfxHit = () => tone({ f0: 520, f1: 300, dur: 0.05, vol: 0.07 });
const sfxClear = () => jingle([72, 76, 79, 84, 88], 0.11, 'square', 0.13);
const sfxKonami = () => jingle([76, 80, 83, 88, 91], 0.08, 'square', 0.15);
const sfxWarning = () => jingle([45, 45, 57], 0.22, 'square', 0.16);
const sfxGameOver = () => jingle([57, 53, 50, 45], 0.22, 'sawtooth', 0.11);

// ---- 背景音乐(16 步循环) ----
let musicT = 0, musicStepI = 0;
const STEP_DUR = 0.145;
const BASSLINE = [45, 45, 57, 45, 43, 43, 55, 43, 41, 41, 53, 41, 43, 43, 55, 57];
const LEAD = [69, 0, 72, 0, 76, 0, 72, 0, 69, 0, 72, 76, 74, 72, 69, 0];
function tickMusic(dt) {
  if (!AC || muted || state !== STATE.PLAYING) return;
  musicT -= dt;
  if (musicT < -0.5) musicT = 0;
  while (musicT <= 0) {
    const i = musicStepI;
    if (BASSLINE[i]) tone({ f0: midiHz(BASSLINE[i] - 12), dur: 0.13, vol: 0.09, bus: musicBus });
    if (LEAD[i] && i % 2 === 0) tone({ type: 'triangle', f0: midiHz(LEAD[i]), dur: 0.12, vol: 0.045, bus: musicBus, echo: true });
    if (i % 4 === 2) noiseShot({ dur: 0.03, vol: 0.02, freq: 6000 });
    musicStepI = (musicStepI + 1) % 16;
    musicT += STEP_DUR;
  }
}

// ===================== 输入 =====================
const input = { left: false, right: false, up: false, down: false, jump: false, shoot: false };
let jumpPrev = false;
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyK: 'jump',
  KeyJ: 'shoot', KeyX: 'shoot', KeyZ: 'shoot',
};
const konamiTarget = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'];
let konamiSeq = [];
function pushKonami(tok) {
  if (konamiOn) return;
  konamiSeq.push(tok);
  for (let i = 0; i < konamiSeq.length; i++) {
    if (konamiSeq[i] !== konamiTarget[i]) {
      konamiSeq = tok === konamiTarget[0] ? [tok] : [];
      return;
    }
  }
  if (konamiSeq.length === konamiTarget.length) {
    konamiOn = true;
    lives = 30;
    sfxKonami();
    banner = { title: '↑↑↓↓←→←→BA', sub: '秘籍生效:30 条命!', t: 0, dur: 2.6, color: '#fcd34d' };
    syncChips();
  }
}
const KONAMI_TOKENS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'a', ArrowRight: 'right', KeyD: 'right',
  KeyB: 'b',
};

window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code] || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  initAudio();
  if (state === STATE.TITLE && KONAMI_TOKENS[e.code]) pushKonami(KONAMI_TOKENS[e.code]);
  const k = KEYMAP[e.code];
  if (k) {
    input[k] = true;
    if (state === STATE.TITLE && (k === 'jump' || k === 'shoot')) startGame();
    if (state === STATE.OVER && (k === 'jump' || k === 'shoot')) startGame();
    return;
  }
  if (e.code === 'KeyP') togglePause();
  else if (e.code === 'KeyM') toggleMute();
  else if (state === STATE.TITLE && e.code === 'Enter') startGame();
  else if (state === STATE.OVER && (e.code === 'Enter' || e.code === 'KeyR')) startGame();
});
window.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (k) input[k] = false;
});
window.addEventListener('blur', () => {
  for (const k in input) input[k] = false;
  if (state === STATE.PLAYING) togglePause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === STATE.PLAYING) togglePause();
});

// ---- 画布点击 / 触屏按钮 ----
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  initAudio();
  if (state === STATE.TITLE || state === STATE.OVER) startGame();
});
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) touchEl.hidden = false;
touchEl.querySelectorAll('.tbtn').forEach((btn) => {
  const k = btn.dataset.k;
  const on = (e) => {
    e.preventDefault();
    initAudio();
    if (state === STATE.TITLE || state === STATE.OVER) { startGame(); return; }
    input[k] = true;
    btn.classList.add('on');
  };
  const off = (e) => {
    e.preventDefault();
    input[k] = false;
    btn.classList.remove('on');
  };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('pointerleave', off);
});

function togglePause() {
  if (state === STATE.PLAYING) { state = STATE.PAUSED; btnPause.textContent = '▶'; }
  else if (state === STATE.PAUSED) { state = STATE.PLAYING; btnPause.textContent = '⏸'; }
}
function toggleMute() {
  muted = !muted;
  localStorage.setItem('contra.muted', muted ? '1' : '0');
  btnSound.textContent = muted ? '🔇' : '🔊';
}
btnSound.addEventListener('click', () => { initAudio(); toggleMute(); });
btnPause.addEventListener('click', () => { initAudio(); togglePause(); });
btnSound.textContent = muted ? '🔇' : '🔊';

// ===================== 玩家 =====================
const P = {
  x: 90, y: 470, vx: 0, vy: 0, dir: 1,
  prone: false, onGround: true,
  weapon: 'R', fireCd: 0, inv: 0,
  alive: true, deadT: 0, fell: false,
  jumping: false, flip: 0,
};
const WEAPONS = {
  R: { rate: 0.20, speed: 660, dmg: 1, name: '步枪' },
  M: { rate: 0.085, speed: 720, dmg: 1, name: '机枪' },
  S: { rate: 0.30, speed: 560, dmg: 1, name: '散射' },
  L: { rate: 0.52, dmg: 3, name: '激光' },
};
function pBox() {
  const w = P.prone ? 36 : 24, h = P.prone ? 18 : 44;
  return { x: P.x - w / 2, y: P.y - h, w, h };
}
function aimVec() {
  const moving = input.left || input.right;
  if (!P.onGround) {
    if (input.down) return moving ? { x: P.dir * 0.707, y: 0.707 } : { x: 0, y: 1 };
    if (input.up) return moving ? { x: P.dir * 0.707, y: -0.707 } : { x: 0, y: -1 };
    return { x: P.dir, y: 0 };
  }
  if (P.prone) return { x: P.dir, y: 0 };
  if (input.up) return moving ? { x: P.dir * 0.707, y: -0.707 } : { x: 0, y: -1 };
  return { x: P.dir, y: 0 };
}
function gunPos(aim) {
  if (!P.onGround && input.down && !(input.left || input.right)) return { x: P.x, y: P.y - 8 };
  if (aim.x === 0 && aim.y === -1) return { x: P.x + P.dir * 4, y: P.y - (P.prone ? 16 : 50) };
  return { x: P.x + P.dir * 12, y: P.y - (P.prone ? 10 : 32) };
}
function fireWeapon() {
  const w = WEAPONS[P.weapon];
  P.fireCd = w.rate;
  const aim = aimVec(), g = gunPos(aim);
  if (P.weapon === 'L') {
    let len = 620;
    if (boss && boss.wallX && aim.x > 0.5) len = Math.min(len, boss.wallX - g.x);
    beams.push({ x: g.x, y: g.y, dx: aim.x, dy: aim.y, len: Math.max(len, 60), t: 0, dur: 0.14, dmg: w.dmg });
    sfxShoot('L');
    return;
  }
  const n = P.weapon === 'S' ? 5 : 1;
  const baseAng = Math.atan2(aim.y, aim.x);
  for (let i = 0; i < n; i++) {
    const a = baseAng + (n > 1 ? (i - (n - 1) / 2) * 0.16 : 0);
    pBullets.push({ x: g.x, y: g.y, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, dmg: w.dmg, r: P.weapon === 'S' ? 5 : 4 });
  }
  particles.push({ x: g.x + aim.x * 8, y: g.y + aim.y * 8, vx: aim.x * 40, vy: aim.y * 40, life: 0.06, t: 0, size: 7, color: '#ffe9a8' });
  sfxShoot(P.weapon);
}

// ===================== 关卡生成 =====================
function buildLevel(n) {
  const rng = mulberry32((n * 2654435761) ^ 0x9e3779b9);
  const plats = [], waters = [], defs = [], capsuleTriggers = [], decor = [], hills = [], palms = [], stars = [];
  const groundY = 470;
  plats.push({ x: -80, y: groundY, w: 560, kind: 'ground' });
  let x = 480;
  const targetLen = 3000 + Math.min(n, 8) * 280;
  while (x < targetLen) {
    const segW = 300 + rng() * 280;
    plats.push({ x, y: groundY, w: segW, kind: 'ground' });
    if (rng() < 0.55) {
      const pw = 120 + rng() * 100;
      const px = x + 20 + rng() * Math.max(segW - pw - 40, 10);
      const py = groundY - (85 + rng() * 40);
      plats.push({ x: px, y: py, w: pw, kind: 'float' });
      if (rng() < 0.45 && n > 1) defs.push({ type: rng() < 0.6 ? 'sniper' : 'turret', x: px + pw / 2, y: py });
      else if (rng() < 0.3) defs.push({ type: 'runner', x: px + pw / 2, y: py, shooter: false });
    }
    let placed = 0;
    const want = 1 + (rng() < 0.45 + Math.min(n, 8) * 0.06 ? 1 : 0);
    while (placed < want && segW > 220) {
      const ex = x + 70 + rng() * (segW - 140);
      const r = rng();
      if (r < 0.4) defs.push({ type: 'runner', x: ex, y: groundY, shooter: rng() < 0.45 });
      else if (r < 0.62) defs.push({ type: 'jumper', x: ex, y: groundY });
      else if (r < 0.8) defs.push({ type: 'turret', x: ex, y: groundY });
      else defs.push({ type: 'sniper', x: ex, y: groundY });
      placed++;
    }
    const bushN = Math.floor(segW / 160);
    for (let i = 0; i < bushN; i++) decor.push({ x: x + rng() * segW, kind: rng() < 0.6 ? 'bush' : 'rock' });
    x += segW;
    if (x >= targetLen) break;
    const water = rng() < 0.4;
    const gap = water ? 120 + rng() * 90 : 80 + rng() * 70;
    if (water) waters.push({ x0: x - 8, x1: x + gap + 8 });
    x += gap;
  }
  plats.push({ x, y: groundY, w: 820, kind: 'ground' });
  const L = x + 820;
  for (let i = 0; i < 12; i++) hills.push({ x: rng() * (L + 900), w: 260 + rng() * 340, h: 90 + rng() * 130 });
  for (let cx = -100; cx < L + 400; cx += 150 + rng() * 130) palms.push({ x: cx, s: 0.7 + rng() * 0.7 });
  for (let i = 0; i < 60; i++) stars.push({ x: rng() * (VIEW_W + 80), y: rng() * 230, r: rng() * 1.5 + 0.5 });
  const letters = ['M', 'S', 'L'];
  let li = Math.floor(rng() * 3);
  for (let cx = 760; cx < L - 900; cx += 680 + rng() * 320) {
    const oneUp = rng() < 0.12;
    capsuleTriggers.push({ x: cx, letter: oneUp ? '1UP' : letters[li++ % 3], used: false });
  }
  defs.sort((a, b) => a.x - b.x);
  return { L, groundY, plats, waters, defs, capsuleTriggers, decor, hills, palms, stars, palIdx: (n - 1) % 3 };
}
function groundTopAt(x) {
  if (!level) return null;
  for (const p of level.plats) {
    if (p.kind === 'ground' && x >= p.x && x <= p.x + p.w) return p.y;
  }
  return null;
}
function landYAt(x, fromY) {
  let bestY = Infinity;
  for (const p of level.plats) {
    if (x >= p.x && x <= p.x + p.w && p.y >= fromY - 2 && p.y < bestY) bestY = p.y;
  }
  return bestY;
}
function supportAhead(e) {
  const x = e.x + e.dir * 22;
  for (const p of level.plats) {
    if (x >= p.x && x <= p.x + p.w && Math.abs(p.y - e.y) < 26) return true;
  }
  return false;
}

// ===================== 特效 =====================
function explosion(x, y, s = 1) {
  const n = Math.round(12 * s);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(40, 240) * s;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      life: rand(0.25, 0.6), t: 0, size: rand(2, 5) * s,
      color: ['#ffdd66', '#ff9933', '#ff5522', '#ffeeaa'][Math.floor(rand(0, 4))], grav: 420,
    });
  }
  particles.push({ x, y, vx: 0, vy: 0, life: 0.22, t: 0, size: 26 * s, color: '#fff6d8', ring: true });
  for (let i = 0; i < 5 * s; i++) {
    particles.push({
      x: x + rand(-8, 8) * s, y: y + rand(-8, 8) * s, vx: rand(-20, 20), vy: rand(-70, -20),
      life: rand(0.5, 0.9), t: 0, size: rand(5, 9) * s, color: 'rgba(90,90,90,0.5)', smoke: true,
    });
  }
  shake = Math.min(shake + 5 * s, 16);
}
function splash(x, y) {
  for (let i = 0; i < 16; i++) {
    particles.push({
      x: x + rand(-10, 10), y, vx: rand(-120, 120), vy: rand(-320, -80),
      life: rand(0.3, 0.6), t: 0, size: rand(2, 4), color: '#bfe6ff', grav: 900,
    });
  }
}
function popup(x, y, text, color = '#fff') {
  popups.push({ x, y, text, color, t: 0 });
}
function addScore(v, x, y) {
  score += v;
  if (x != null) popup(x, y, '+' + v, '#ffd75e');
  syncChips();
}

// ===================== 游戏流程 =====================
function startGame() {
  lives = konamiOn ? 30 : 3;
  score = 0; stage = 1;
  newRecord = false; overT = 0;
  P.weapon = 'R';
  startStage();
  state = STATE.PLAYING;
  btnPause.textContent = '⏸';
  jumpPrev = true;
  syncChips();
}
function startStage() {
  level = buildLevel(stage);
  pBullets.length = 0; eBullets.length = 0; enemies.length = 0;
  pods.length = 0; items.length = 0; beams.length = 0; particles.length = 0; popups.length = 0;
  pendingEnemies = level.defs.slice();
  P.x = 90; P.y = level.groundY; P.vx = 0; P.vy = 0;
  P.dir = 1; P.prone = false; P.onGround = true;
  P.jumping = false; P.flip = 0;
  P.alive = true; P.deadT = 0; P.fell = false; P.inv = 1.2; P.fireCd = 0;
  camX = 0; clearT = 0;
  boss = {
    active: false, dying: false, deadT: 0, dieT: 0,
    hp: 26 + stage * 8, maxHp: 26 + stage * 8,
    phase: 'closed', pt: 1.2, burstLeft: 0, burstT: 0, burstCd: 0, mortarCd: 1.0,
    flash: 0, wallX: level.L - 150, coreX: level.L - 84, coreY: 408, coreR: 26,
    boomCd: 0,
  };
  banner = { title: 'STAGE ' + stage, sub: stage === 1 ? '丛林突围 · 摧毁要塞' : '敌军火力升级 · 继续深入', t: 0, dur: 2.2, color: '#7dd3fc' };
  syncChips();
}
function killPlayer(fell) {
  if (!P.alive || P.inv > 0 || clearT > 0) return;
  P.alive = false; P.deadT = 0; P.fell = !!fell;
  lives--;
  syncChips();
  flashA = 0.45;
  if (fell) {
    const wy = waterAt(P.x) != null ? waterAt(P.x) : VIEW_H + 10;
    splash(P.x, Math.min(wy, VIEW_H));
    sfxSplash();
  } else {
    explosion(P.x, P.y - 22, 1.1);
    sfxDeath();
  }
}
function waterAt(x) {
  for (const w of level.waters) if (x >= w.x0 && x <= w.x1) return 500;
  return null;
}
function respawn() {
  if (lives <= 0) { gameOver(); return; }
  let x = clamp(camX + 70, 30, level.L - 200);
  let y = groundTopAt(x);
  while (y == null && x < level.L - 100) { x += 20; y = groundTopAt(x); }
  P.x = x; P.y = y != null ? y : level.groundY;
  P.vx = 0; P.vy = 0; P.prone = false; P.onGround = true;
  P.jumping = false; P.flip = 0;
  P.alive = true; P.inv = 2.4; P.fell = false;
}
function gameOver() {
  state = STATE.OVER; overT = 0;
  sfxGameOver();
  if (score > best) { best = score; newRecord = true; localStorage.setItem('contra.best', String(best)); }
  syncChips();
}
function stageClear() {
  const bonus = 1000 * stage;
  addScore(bonus);
  popup(boss.coreX - 60, boss.coreY, '奖励 +' + bonus, '#7dd3fc');
  banner = { title: 'STAGE ' + stage + ' CLEAR!', sub: '要塞摧毁 · 奖励 ' + bonus, t: 0, dur: 2.6, color: '#fcd34d' };
  clearT = 2.8;
  sfxClear();
}

// ===================== 敌人/道具 =====================
function spawnEnemy(d) {
  const e = {
    type: d.type, x: d.x, y: d.y, vx: 0, vy: 0, dir: -1,
    hp: 1, cd: rand(0.6, 1.6), t: rand(0, 10), flash: 0, onGround: true, moving: false,
    shooter: !!d.shooter, burstLeft: 0, burstT: 0, angle: Math.PI,
  };
  if (d.type === 'sniper') e.hp = 2;
  if (d.type === 'turret') { e.hp = 3; e.cd = rand(1.2, 2.2); }
  enemies.push(e);
}
function enemyFire(e, ox, oy, speed, spread = 0) {
  const dx = (P.x - ox), dy = ((P.y - 22) - oy);
  const d = Math.hypot(dx, dy) || 1;
  const a = Math.atan2(dy, dx) + rand(-spread, spread);
  eBullets.push({ x: ox, y: oy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 4 });
  sfxEnemyShoot();
}
function spawnPod(trig) {
  pods.push({ x: camX + VIEW_W + 40, y: 150 + rand(0, 70), baseY: 0, vx: -76, t: rand(0, 10), letter: trig.letter, r: 15 });
  pods[pods.length - 1].baseY = pods[pods.length - 1].y;
}
function dropItem(x, y, letter) {
  items.push({ x, y, vy: -60, letter, t: 0, grounded: false });
}
function hitEnemy(e, dmg) {
  e.hp -= dmg;
  e.flash = 0.08;
  if (e.hp <= 0) {
    const scores = { runner: 100, jumper: 150, sniper: 300, turret: 500 };
    explosion(e.x, e.y - 18, 0.9);
    addScore(scores[e.type] || 100, e.x, e.y - 34);
    sfxExplosion();
    enemies.splice(enemies.indexOf(e), 1);
    return true;
  }
  sfxHit();
  return false;
}
function hurtPlayerCheck() {
  if (!P.alive || P.inv > 0 || clearT > 0) return;
  const b = pBox();
  for (let i = eBullets.length - 1; i >= 0; i--) {
    const u = eBullets[i];
    if (u.x > b.x - 3 && u.x < b.x + b.w + 3 && u.y > b.y - 3 && u.y < b.y + b.h + 3) {
      eBullets.splice(i, 1);
      killPlayer(false);
      return;
    }
  }
  for (const e of enemies) {
    const hw = e.type === 'turret' ? 22 : 13, hh = e.type === 'sniper' ? 24 : e.type === 'turret' ? 26 : 40;
    const ex = e.x - hw, ey = e.y - hh;
    if (b.x < ex + hw * 2 && b.x + b.w > ex && b.y < ey + hh && b.y + b.h > ey) {
      killPlayer(false);
      return;
    }
  }
}

// ===================== 更新 =====================
function updatePlayer(dt) {
  if (!P.alive) {
    P.deadT += dt;
    if (P.deadT > 1.15) respawn();
    return;
  }
  P.inv = Math.max(0, P.inv - dt);
  P.fireCd -= dt;
  const speed = 292;
  let mv = 0;
  if (input.left) mv -= 1;
  if (input.right) mv += 1;
  const wantProne = P.onGround && input.down && !input.up;
  if (wantProne && !P.prone) { P.prone = true; }
  if (!wantProne && P.prone) P.prone = false;
  if (P.prone) mv = 0;
  P.vx = mv * speed;
  if (mv !== 0) P.dir = mv;

  const jumpPressed = input.jump && !jumpPrev;
  if (jumpPressed && P.onGround && !P.prone) {
    P.vy = -820;
    P.onGround = false;
    P.jumping = true;
    sfxJump();
  }
  if (!input.jump && P.vy < -260) P.vy = -260;
  jumpPrev = input.jump;

  P.vy += GRAV * dt;
  if (P.vy > 1300) P.vy = 1300;
  const prevY = P.y;
  P.x += P.vx * dt;
  P.y += P.vy * dt;
  const minX = boss && boss.active ? camX + 14 : 14;
  const maxX = boss && boss.active ? boss.wallX - 16 : level.L - 16;
  P.x = clamp(P.x, minX, maxX);

  P.onGround = false;
  if (P.vy >= 0) {
    for (const p of level.plats) {
      if (P.x >= p.x - 6 && P.x <= p.x + p.w + 6 && prevY <= p.y + 2 && P.y >= p.y) {
        P.y = p.y; P.vy = 0; P.onGround = true;
        P.jumping = false; P.flip = 0;
        break;
      }
    }
  }
  if (!P.onGround && P.jumping) P.flip = Math.min(P.flip + dt * 19, TAU);
  if (P.y > VIEW_H + 60) { killPlayer(true); return; }

  if (input.shoot && P.fireCd <= 0 && clearT <= 0) fireWeapon();
}
function updateEnemies(dt) {
  const bulletSpeed = Math.min(240 + stage * 18, 380);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    const dx = P.x - e.x;
    if (e.type === 'runner') {
      e.dir = dx > 0 ? 1 : -1;
      let sp = (e.shooter ? 92 : 132) + Math.min(stage, 8) * 6;
      if (!supportAhead(e)) {
        if (e.shooter) sp = 0;
        else e.dir *= -1;
      }
      e.moving = sp > 0;
      e.x += e.dir * sp * dt;
      if (e.shooter && P.alive) {
        e.cd -= dt;
        if (e.cd <= 0 && Math.abs(dx) < 560) {
          enemyFire(e, e.x + e.dir * 12, e.y - 26, bulletSpeed, 0.03);
          e.cd = rand(1.5, 2.6);
        }
      }
    } else if (e.type === 'jumper') {
      e.dir = dx > 0 ? 1 : -1;
      if (e.onGround) {
        e.cd -= dt;
        if (e.cd <= 0) {
          e.vy = -640; e.onGround = false;
          e.vx = e.dir * (120 + Math.min(stage, 8) * 8);
          if (!supportAhead(e)) e.vx *= 0.3;
        }
      } else {
        e.vy += GRAV * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const ly = landYAt(e.x, e.y - e.vy * dt - 2);
        if (e.vy >= 0 && e.y >= ly && ly < Infinity) {
          e.y = ly; e.vy = 0; e.vx = 0; e.onGround = true;
          e.cd = rand(0.7, 1.4);
        }
        if (e.y > VIEW_H + 80) { enemies.splice(i, 1); continue; }
      }
    } else if (e.type === 'sniper') {
      e.dir = dx > 0 ? 1 : -1;
      if (P.alive && Math.abs(dx) < 640) {
        e.cd -= dt;
        if (e.cd <= 0) {
          enemyFire(e, e.x + e.dir * 10, e.y - 16, bulletSpeed + 30, 0.015);
          e.cd = rand(1.4, 2.2);
        }
      }
    } else if (e.type === 'turret') {
      const ta = Math.atan2((P.y - 22) - (e.y - 22), P.x - e.x);
      let da = ta - e.angle;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      e.angle += clamp(da, -2.4 * dt, 2.4 * dt);
      if (P.alive && Math.abs(dx) < 620) {
        e.cd -= dt;
        if (e.cd <= 0) { e.burstLeft = 3; e.burstT = 0; e.cd = rand(2.0, 3.0); }
      }
      if (e.burstLeft > 0) {
        e.burstT -= dt;
        if (e.burstT <= 0) {
          const ox = e.x + Math.cos(e.angle) * 24, oy = (e.y - 22) + Math.sin(e.angle) * 24;
          eBullets.push({ x: ox, y: oy, vx: Math.cos(e.angle) * bulletSpeed, vy: Math.sin(e.angle) * bulletSpeed, r: 4 });
          sfxEnemyShoot();
          e.burstLeft--; e.burstT = 0.14;
        }
      }
    }
    if (e.x < camX - 260) enemies.splice(i, 1);
  }
}
function updateBoss(dt) {
  const b = boss;
  b.flash = Math.max(0, b.flash - dt);
  b.doorAnim = clamp((b.doorAnim || 0) + (b.phase === 'open' && !b.dying ? 3.2 : -3.2) * dt, 0, 1);
  if (b.dying) {
    b.dieT += dt;
    b.boomCd -= dt;
    if (b.boomCd <= 0) {
      explosion(b.wallX + rand(-20, 130), rand(120, level.groundY - 20), rand(0.8, 1.5));
      sfxExplosion();
      b.boomCd = 0.16;
    }
    if (b.dieT > 1.8 && clearT <= 0) stageClear();
    return;
  }
  if (!b.active) {
    if (P.x > level.L - 760) {
      b.active = true;
      b.pt = 1.2;
      banner = { title: 'WARNING!', sub: '敌方要塞 · 摧毁红色核心', t: 0, dur: 2.2, color: '#f87171' };
      sfxWarning();
    }
    return;
  }
  b.pt -= dt;
  if (b.pt <= 0) {
    b.phase = b.phase === 'closed' ? 'open' : 'closed';
    b.pt = b.phase === 'closed' ? rand(1.3, 1.8) : rand(2.2, 2.8);
    if (b.phase === 'open') { b.burstLeft = 0; }
    else b.mortarCd = 0.5;
  }
  if (b.phase === 'closed' && P.alive) {
    b.mortarCd -= dt;
    if (b.mortarCd <= 0) {
      const x0 = level.L - 60, y0 = 110;
      const T = rand(0.95, 1.2);
      const targetX = clamp(P.x + rand(-120, 120), camX + 40, b.wallX - 40);
      const vx = (targetX - x0) / T;
      const vy = (level.groundY - y0 - 0.5 * 1400 * T * T) / T;
      eBullets.push({ x: x0, y: y0, vx, vy, r: 6, grav: 1400, mortar: true });
      sfxEnemyShoot();
      b.mortarCd = rand(0.8, 1.3);
    }
  }
  if (b.phase === 'open' && P.alive) {
    if (b.burstLeft > 0) {
      b.burstT -= dt;
      if (b.burstT <= 0) {
        enemyFire({ x: b.coreX, y: b.coreY }, b.coreX, b.coreY, Math.min(300 + stage * 20, 420), 0.05);
        b.burstLeft--; b.burstT = 0.16;
        if (b.burstLeft === 0) b.burstCd = 0.7;
      }
    } else {
      b.burstCd -= dt;
      if (b.burstCd <= 0 && Math.abs(P.x - b.coreX) < 700) { b.burstLeft = 3; b.burstT = 0.1; }
    }
  }
}
function hitBossCore(x, y, r) {
  const b = boss;
  if (b.dying || !b.active) return false;
  if (b.phase === 'open' && dist2(x, y, b.coreX, b.coreY) < (b.coreR + r + 4) * (b.coreR + r + 4)) {
    return 'core';
  }
  if (x > b.wallX + 4 && y > 90) {
    const inDoor = b.doorAnim > 0.6 && Math.abs(y - b.coreY) < 62 && x < b.coreX + 30;
    if (!inDoor) {
      particles.push({ x: Math.max(x, b.wallX), y, vx: -60, vy: rand(-40, 40), life: 0.15, t: 0, size: 4, color: '#ffd27d' });
      return true;
    }
  }
  return false;
}
function damageBoss(dmg, x, y) {
  boss.hp -= dmg;
  boss.flash = 0.1;
  explosion(x, y, 0.5);
  sfxBossHit();
  if (boss.hp <= 0) {
    boss.dying = true;
    boss.dieT = 0; boss.boomCd = 0;
    addScore(5000, boss.coreX, boss.coreY - 40);
    shake = 14;
  }
}

function updateBullets(dt) {
  for (let i = pBullets.length - 1; i >= 0; i--) {
    const u = pBullets[i];
    u.x += u.vx * dt; u.y += u.vy * dt;
    if (u.x < camX - 60 || u.x > camX + VIEW_W + 60 || u.y < -60 || u.y > VIEW_H + 60) { pBullets.splice(i, 1); continue; }
    if ((boss.active || boss.dying) && !boss.deadT) {
      const res = hitBossCore(u.x, u.y, u.r);
      if (res === 'core') { damageBoss(u.dmg, u.x, u.y); pBullets.splice(i, 1); continue; }
      if (res) { pBullets.splice(i, 1); continue; }
    }
    let hit = false;
    for (const e of enemies) {
      const hw = e.type === 'turret' ? 22 : 13;
      const hh = e.type === 'turret' ? 26 : e.type === 'sniper' ? 24 : 40;
      if (u.x > e.x - hw - 2 && u.x < e.x + hw + 2 && u.y > e.y - hh - 2 && u.y < e.y + 2) {
        hitEnemy(e, u.dmg); hit = true; break;
      }
    }
    if (hit) { pBullets.splice(i, 1); continue; }
    for (let j = pods.length - 1; j >= 0; j--) {
      const pod = pods[j];
      if (dist2(u.x, u.y, pod.x, pod.y) < (pod.r + u.r + 2) * (pod.r + u.r + 2)) {
        addScore(200, pod.x, pod.y - 24);
        dropItem(pod.x, pod.y, pod.letter);
        explosion(pod.x, pod.y, 0.5);
        pods.splice(j, 1);
        pBullets.splice(i, 1);
        hit = true;
        break;
      }
    }
  }
  for (let i = eBullets.length - 1; i >= 0; i--) {
    const u = eBullets[i];
    if (u.grav) u.vy += u.grav * dt;
    u.x += u.vx * dt; u.y += u.vy * dt;
    if (u.mortar) {
      const g = groundTopAt(u.x);
      if (g != null && u.y >= g) {
        explosion(u.x, g - 4, 0.9);
        sfxExplosion();
        if (P.alive && P.inv <= 0 && clearT <= 0 && dist2(P.x, P.y - 20, u.x, g) < 62 * 62) killPlayer(false);
        eBullets.splice(i, 1);
        continue;
      }
    }
    if (u.x < camX - 120 || u.x > camX + VIEW_W + 120 || u.y > VIEW_H + 80 || u.y < -140) eBullets.splice(i, 1);
  }
}
function updateBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const bm = beams[i];
    bm.t += dt;
    if (bm.t < dt * 1.5) {
      const x1 = bm.x + bm.dx * bm.len, y1 = bm.y + bm.dy * bm.len;
      for (const e of enemies.slice()) {
        const r = e.type === 'turret' ? 24 : 18;
        if (segDist2(e.x, e.y - 16, bm.x, bm.y, x1, y1) < r * r) hitEnemy(e, bm.dmg);
      }
      for (let j = pods.length - 1; j >= 0; j--) {
        const pod = pods[j];
        if (segDist2(pod.x, pod.y, bm.x, bm.y, x1, y1) < (pod.r + 5) * (pod.r + 5)) {
          addScore(200, pod.x, pod.y - 24);
          dropItem(pod.x, pod.y, pod.letter);
          explosion(pod.x, pod.y, 0.5);
          pods.splice(j, 1);
        }
      }
      if (boss.active || boss.dying) {
        for (let s = 1; s <= 24; s++) {
          const t = s / 24;
          const px = bm.x + (x1 - bm.x) * t, py = bm.y + (y1 - bm.y) * t;
          const res = hitBossCore(px, py, 4);
          if (res === 'core') { damageBoss(bm.dmg, px, py); break; }
          if (res) break;
        }
      }
    }
    if (bm.t > bm.dur) beams.splice(i, 1);
  }
}
function updatePods(dt) {
  for (let i = pods.length - 1; i >= 0; i--) {
    const pod = pods[i];
    pod.t += dt;
    pod.x += pod.vx * dt;
    pod.y = pod.baseY + Math.sin(pod.t * 2.6) * 14;
    if (pod.x < camX - 60) pods.splice(i, 1);
  }
}
function updateItems(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.t += dt;
    if (!it.grounded) {
      it.vy += GRAV * 0.55 * dt;
      const prevY = it.y;
      it.y += it.vy * dt;
      const ly = landYAt(it.x, prevY);
      if (it.vy >= 0 && ly < Infinity && it.y >= ly) { it.y = ly; it.grounded = true; }
    }
    if (it.y > VIEW_H + 80 || it.t > 14) { items.splice(i, 1); continue; }
    if (P.alive) {
      const b = pBox();
      if (it.x > b.x - 14 && it.x < b.x + b.w + 14 && it.y - 14 < b.y + b.h && it.y > b.y - 16) {
        if (it.letter === '1UP') { lives++; sfx1UP(); popup(it.x, it.y - 22, '1UP!', '#86efac'); }
        else { P.weapon = it.letter; sfxPickup(); popup(it.x, it.y - 22, WEAPONS[it.letter].name + '!', '#fcd34d'); }
        syncChips();
        items.splice(i, 1);
      }
    }
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t >= p.life) { particles.splice(i, 1); continue; }
    if (p.grav) p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
}
function updatePopups(dt) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.t += dt; p.y -= 34 * dt;
    if (p.t > 0.9) popups.splice(i, 1);
  }
}
function update(dt) {
  time += dt;
  tickMusic(dt);
  if (banner) { banner.t += dt; if (banner.t > banner.dur) banner = null; }
  shake = Math.max(0, shake - dt * 26);
  flashA = Math.max(0, flashA - dt * 1.4);
  if (state === STATE.PLAYING) {
    if (clearT > 0) {
      clearT -= dt;
      if (clearT <= 0) { stage++; startStage(); }
    }
    updatePlayer(dt);
    updateEnemies(dt);
    updateBoss(dt);
    updateBullets(dt);
    updateBeams(dt);
    updatePods(dt);
    updateItems(dt);
    hurtPlayerCheck();
    let target = P.x - VIEW_W * 0.38;
    if (boss.active) target = level.L - VIEW_W;
    camX += (clamp(target, 0, level.L - VIEW_W) - camX) * Math.min(1, dt * 6);
    if (boss.active) camX = lerp(camX, level.L - VIEW_W, Math.min(1, dt * 8));
    while (pendingEnemies.length && pendingEnemies[0].x < camX + VIEW_W + 120) spawnEnemy(pendingEnemies.shift());
    for (const tr of level.capsuleTriggers) {
      if (!tr.used && camX + VIEW_W > tr.x) { tr.used = true; spawnPod(tr); }
    }
  } else if (state === STATE.OVER) {
    overT += dt;
  }
  updateParticles(dt);
  updatePopups(dt);
}

// ===================== 渲染 =====================
const PALS = [
  { skyTop: '#3f9be0', skyBot: '#cdeffd', hillFar: '#57a06f', hillNear: '#33754e', grass: '#46b45a', grassLight: '#7fd97f', dirt: '#8a5a33', dirtDark: '#6b4426', water: '#3d9be0', waterDeep: '#1f6cb0', sun: '#fff3b0', tree: '#1f7a44', trunk: '#7c4f2c', night: false },
  { skyTop: '#d96a35', skyBot: '#ffd9a0', hillFar: '#96523c', hillNear: '#66382a', grass: '#8fae4e', grassLight: '#c3d67a', dirt: '#7a4a2b', dirtDark: '#5c371f', water: '#e08a4f', waterDeep: '#a05a30', sun: '#ffdf8f', tree: '#3d6b35', trunk: '#5c371f', night: false },
  { skyTop: '#0c1430', skyBot: '#3a5480', hillFar: '#20443c', hillNear: '#152e28', grass: '#2e7d4f', grassLight: '#48a86a', dirt: '#4a3524', dirtDark: '#362617', water: '#28527e', waterDeep: '#16324e', sun: '#e8ecf5', tree: '#174a30', trunk: '#3d2a1a', night: true },
];
function pal() { return PALS[level ? level.palIdx : 0]; }

function drawBackground() {
  const p = pal();
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, p.skyTop);
  g.addColorStop(1, p.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (p.night) {
    ctx.fillStyle = '#dfe8ff';
    for (const s of level.stars) {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + s.x));
      ctx.globalAlpha = a * 0.8;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }
  const sunX = VIEW_W * 0.78, sunY = p.night ? 90 : 100;
  ctx.fillStyle = p.sun;
  ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.arc(sunX, sunY, p.night ? 26 : 34, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.25;
  ctx.beginPath(); ctx.arc(sunX, sunY, p.night ? 40 : 56, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // 远山(视差 0.25)
  ctx.save();
  ctx.translate(-camX * 0.25, 0);
  ctx.fillStyle = p.hillFar;
  for (const h of level.hills) {
    ctx.beginPath();
    ctx.ellipse(h.x, 480, h.w, h.h, 0, Math.PI, TAU);
    ctx.fill();
  }
  ctx.restore();
  // 近山(视差 0.45)
  ctx.save();
  ctx.translate(-camX * 0.45, 0);
  ctx.fillStyle = p.hillNear;
  for (let i = 0; i < level.hills.length; i++) {
    const h = level.hills[i];
    ctx.beginPath();
    ctx.ellipse(h.x + 200, 495, h.w * 0.7, h.h * 0.62, 0, Math.PI, TAU);
    ctx.fill();
  }
  ctx.restore();
  // 棕榈树(视差 0.6)
  ctx.save();
  ctx.translate(-camX * 0.6, 0);
  for (const t of level.palms) drawPalm(t.x, 486, t.s, p);
  ctx.restore();
}
function drawPalm(x, y, s, p) {
  ctx.strokeStyle = p.trunk;
  ctx.lineWidth = 5 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 8 * s, y - 40 * s, x + 16 * s, y - 72 * s);
  ctx.stroke();
  ctx.strokeStyle = p.tree;
  ctx.lineWidth = 3.4 * s;
  const tx = x + 16 * s, ty = y - 72 * s;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.15 + i * 0.17);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * 20 * s, ty - Math.sin(a) * 16 * s - 6 * s, tx + Math.cos(a) * 34 * s, ty - Math.sin(a) * 8 * s + 8 * s);
    ctx.stroke();
  }
}
function drawWater() {
  const p = pal();
  for (const w of level.waters) {
    const grd = ctx.createLinearGradient(0, 496, 0, VIEW_H);
    grd.addColorStop(0, p.water);
    grd.addColorStop(1, p.waterDeep);
    ctx.fillStyle = grd;
    ctx.fillRect(w.x0, 496, w.x1 - w.x0, VIEW_H - 496);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = w.x0; x <= w.x1; x += 6) {
      const y = 497 + Math.sin(time * 2.4 + x * 0.06) * 2.4;
      if (x === w.x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
function drawPlats() {
  const p = pal();
  for (const pl of level.plats) {
    if (pl.kind === 'ground') {
      ctx.fillStyle = p.dirt;
      ctx.fillRect(pl.x, pl.y, pl.w, VIEW_H - pl.y);
      ctx.fillStyle = p.dirtDark;
      for (let x = pl.x + 14; x < pl.x + pl.w - 8; x += 52) {
        const yy = pl.y + 26 + ((x * 7) % 3) * 14;
        ctx.fillRect(x, yy, 16, 5);
      }
      ctx.fillStyle = p.grass;
      ctx.fillRect(pl.x, pl.y, pl.w, 11);
      ctx.fillStyle = p.grassLight;
      ctx.fillRect(pl.x, pl.y, pl.w, 3);
    } else {
      ctx.fillStyle = '#9c7448';
      ctx.fillRect(pl.x, pl.y, pl.w, 12);
      ctx.fillStyle = '#c49a66';
      ctx.fillRect(pl.x, pl.y, pl.w, 3);
      ctx.fillStyle = '#6e4c2a';
      for (let x = pl.x + 8; x < pl.x + pl.w - 4; x += 26) ctx.fillRect(x, pl.y + 4, 3, 8);
    }
  }
}
function drawDecor() {
  const p = pal();
  for (const d of level.decor) {
    const gy = groundTopAt(d.x);
    if (gy == null) continue;
    if (d.kind === 'bush') {
      ctx.fillStyle = p.tree;
      ctx.beginPath();
      ctx.arc(d.x - 8, gy - 6, 8, 0, TAU);
      ctx.arc(d.x, gy - 10, 10, 0, TAU);
      ctx.arc(d.x + 9, gy - 6, 8, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = '#8b8f98';
      ctx.beginPath();
      ctx.moveTo(d.x - 10, gy);
      ctx.lineTo(d.x - 3, gy - 12);
      ctx.lineTo(d.x + 6, gy - 9);
      ctx.lineTo(d.x + 11, gy);
      ctx.closePath();
      ctx.fill();
    }
  }
}
function drawBoss() {
  const b = boss;
  if (!level || b.wallX > camX + VIEW_W + 260) return;
  const p = pal();
  const wx = b.wallX, gY = level.groundY;
  // 墙体
  ctx.fillStyle = '#5b6472';
  ctx.fillRect(wx, 96, camX + VIEW_W + 240 - wx, gY - 96);
  ctx.fillStyle = '#4a5260';
  for (let y = 130; y < gY; y += 56) ctx.fillRect(wx, y, camX + VIEW_W + 240 - wx, 4);
  ctx.fillStyle = '#6d7684';
  ctx.fillRect(wx, 96, 10, gY - 96);
  // 铆钉
  ctx.fillStyle = '#39404c';
  for (let y = 116; y < gY - 10; y += 56) {
    ctx.fillRect(wx + 16, y, 5, 5);
    ctx.fillRect(wx + 44, y, 5, 5);
  }
  // 顶部炮台口
  ctx.fillStyle = '#39404c';
  ctx.fillRect(level.L - 84, 96, 44, 18);
  // 警示条纹
  ctx.save();
  ctx.beginPath(); ctx.rect(wx, 96, 14, gY - 96); ctx.clip();
  for (let y = 80; y < gY + 20; y += 24) {
    ctx.fillStyle = (Math.floor(y / 24) % 2) ? '#f2c032' : '#22262e';
    ctx.beginPath();
    ctx.moveTo(wx, y); ctx.lineTo(wx + 14, y - 14); ctx.lineTo(wx + 14, y - 2); ctx.lineTo(wx, y + 12);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // 门与核心
  const open = b.doorAnim || 0;
  const cx = b.coreX, cy = b.coreY;
  ctx.fillStyle = '#333a45';
  ctx.fillRect(cx - 44, cy - 56, 88, 112);
  if (open > 0.02) {
    const pulse = 0.75 + 0.25 * Math.sin(time * 6);
    const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, b.coreR + 8);
    grd.addColorStop(0, '#ffd7d0');
    grd.addColorStop(0.35, '#ff5a48');
    grd.addColorStop(1, '#7a1512');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, b.coreR * (0.85 + 0.15 * open), 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,100,' + (0.5 * pulse) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, b.coreR + 6 + pulse * 3, 0, TAU); ctx.stroke();
  }
  // 闸门(上下两扇)
  const shut = 56 * (1 - open);
  ctx.fillStyle = '#79808e';
  ctx.fillRect(cx - 44, cy - 56, 88, shut);
  ctx.fillRect(cx - 44, cy + 56 - shut, 88, shut);
  ctx.fillStyle = '#5b6270';
  ctx.fillRect(cx - 44, cy - 56 + shut - 4, 88, 4);
  ctx.fillRect(cx - 44, cy + 56 - shut, 88, 4);
  if (b.flash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (b.flash * 6) + ')';
    ctx.fillRect(wx, 96, camX + VIEW_W + 240 - wx, gY - 96);
  }
}

const COL = {
  skin: '#e8b98d', skinDark: '#c9955f', band: '#d93a3a', pants: '#2d5fbe',
  shirt: '#e8e2d0', boot: '#23262d', gun: '#3a3f47', gunLight: '#5a616d',
  eShirt: '#8f96a0', ePants: '#3d434d', eHelmet: '#4a505a',
};
function drawSoldier(x, y, dir, opts) {
  ctx.save();
  ctx.translate(x, y);
  if (dir < 0) ctx.scale(-1, 1);
  if (opts.flip) {
    ctx.translate(0, -22);
    ctx.rotate(opts.flip);
    ctx.translate(0, 22);
  }
  const c = COL;
  const run = opts.run || 0;
  if (opts.prone) {
    ctx.fillStyle = opts.shirt || c.shirt;
    ctx.fillRect(-18, -13, 26, 10);
    ctx.fillStyle = opts.pants || c.pants;
    ctx.fillRect(-26, -10, 10, 7);
    ctx.fillStyle = c.skin;
    ctx.fillRect(8, -17, 10, 9);
    ctx.fillStyle = opts.helmet || c.band;
    ctx.fillRect(7, -19, 12, 4);
    ctx.fillStyle = c.gun;
    ctx.fillRect(14, -12, 18, 3);
    ctx.restore();
    return;
  }
  const airborne = !!opts.air;
  ctx.fillStyle = opts.pants || c.pants;
  if (airborne) {
    ctx.fillRect(-3, -19, 11, 6);
    ctx.fillRect(4, -14, 6, 8);
    ctx.fillStyle = c.boot;
    ctx.fillRect(3, -6, 9, 4);
  } else {
    const l1 = Math.sin(run) * 5;
    const l2 = -Math.sin(run) * 5;
    ctx.fillRect(-7 + l1 * 0.4, -18, 6, 18);
    ctx.fillRect(1 + l2 * 0.4, -18, 6, 18);
    ctx.fillStyle = c.boot;
    ctx.fillRect(-8 + l1 * 0.4, -4, 8, 4);
    ctx.fillRect(0 + l2 * 0.4, -4, 8, 4);
  }
  ctx.fillStyle = opts.shirt || c.shirt;
  ctx.fillRect(-8, -36, 16, 18);
  ctx.fillStyle = c.skin;
  ctx.fillRect(-6, -50, 12, 13);
  ctx.fillStyle = opts.helmet || c.band;
  ctx.fillRect(-7, -52, 14, 5);
  if (!opts.helmet) {
    ctx.fillRect(-12 - Math.sin(time * 9) * 2, -51, 6, 4);
    ctx.fillStyle = '#5a3d22';
    ctx.fillRect(-6, -53, 12, 3);
  }
  // 枪
  const aimA = opts.aimAngle != null ? opts.aimAngle : 0;
  ctx.save();
  ctx.translate(2, -31);
  ctx.rotate(aimA);
  ctx.fillStyle = c.skin;
  ctx.fillRect(-2, -2, 8, 5);
  ctx.fillStyle = c.gun;
  ctx.fillRect(2, -3, 19, 5);
  ctx.fillStyle = c.gunLight;
  ctx.fillRect(2, -3, 19, 2);
  if (opts.muzzle) {
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(24, 0, 5, 0, TAU); ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}
function drawPlayer() {
  if (!P.alive) return;
  if (state === STATE.PLAYING && P.inv > 0 && Math.floor(time * 14) % 2 === 0) return;
  const aim = aimVec();
  let aimA = Math.atan2(aim.y, aim.x * P.dir);
  const opts = {
    shirt: COL.shirt, pants: COL.pants,
    prone: P.prone, air: !P.onGround,
    run: (Math.abs(P.vx) > 1 && P.onGround) ? time * 16 : 0,
    aimAngle: aimA,
    muzzle: P.fireCd > WEAPONS[P.weapon].rate - 0.05,
    flip: (!P.onGround && P.jumping) ? P.flip % TAU : 0,
  };
  drawSoldier(P.x, P.y, P.dir, opts);
}
function drawEnemies() {
  for (const e of enemies) {
    const flash = e.flash > 0;
    if (e.type === 'runner' || e.type === 'jumper') {
      drawSoldier(e.x, e.y, e.dir, {
        shirt: flash ? '#ffffff' : COL.eShirt,
        pants: flash ? '#ffffff' : COL.ePants,
        helmet: flash ? '#ffffff' : (e.shooter ? '#a33327' : COL.eHelmet),
        air: !e.onGround,
        run: e.moving ? e.t * 15 : 0,
        aimAngle: e.dir > 0 ? 0 : 0,
        muzzle: e.cd > 100,
      });
    } else if (e.type === 'sniper') {
      drawSoldier(e.x, e.y, e.dir, {
        prone: true,
        shirt: flash ? '#ffffff' : COL.eShirt,
        pants: flash ? '#ffffff' : COL.ePants,
        helmet: flash ? '#ffffff' : '#a33327',
      });
      if (e.cd < 0.4 && P.alive && Math.abs(P.x - e.x) < 640) {
        ctx.strokeStyle = 'rgba(255,70,50,' + (0.5 * (1 - e.cd / 0.4)) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(e.x + e.dir * 20, e.y - 12);
        ctx.lineTo(P.x, P.y - 22);
        ctx.stroke();
      }
    } else if (e.type === 'turret') {
      ctx.fillStyle = flash ? '#ffffff' : '#4a505a';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 20, Math.PI, TAU);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = flash ? '#ffffff' : '#39404c';
      ctx.fillRect(e.x - 24, e.y - 4, 48, 4);
      ctx.save();
      ctx.translate(e.x, e.y - 14);
      ctx.rotate(e.angle);
      ctx.fillStyle = flash ? '#ffffff' : '#2c323b';
      ctx.fillRect(0, -3.5, 26, 7);
      ctx.restore();
      ctx.fillStyle = e.burstLeft > 0 ? '#ff5a48' : '#f2c032';
      ctx.beginPath(); ctx.arc(e.x, e.y - 14, 3, 0, TAU); ctx.fill();
    }
  }
}
function drawBullets() {
  for (const u of pBullets) {
    ctx.fillStyle = 'rgba(255,220,120,0.35)';
    ctx.beginPath(); ctx.arc(u.x - u.vx * 0.012, u.y - u.vy * 0.012, u.r + 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, TAU); ctx.fill();
  }
  for (const u of eBullets) {
    if (u.mortar) {
      ctx.fillStyle = '#2c323b';
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(120,120,120,0.4)';
      ctx.beginPath(); ctx.arc(u.x - u.vx * 0.02, u.y - u.vy * 0.02, 4, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,90,72,0.3)';
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 2.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff6a5a';
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, TAU); ctx.fill();
    }
  }
}
function drawBeams() {
  for (const bm of beams) {
    const a = 1 - bm.t / bm.dur;
    const x1 = bm.x + bm.dx * bm.len, y1 = bm.y + bm.dy * bm.len;
    ctx.strokeStyle = 'rgba(255,80,60,' + (0.55 * a) + ')';
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(bm.x, bm.y); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,235,' + a + ')';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(bm.x, bm.y); ctx.lineTo(x1, y1); ctx.stroke();
  }
}
function drawPods() {
  for (const pod of pods) {
    ctx.save();
    ctx.translate(pod.x, pod.y);
    ctx.fillStyle = '#c8ced8';
    ctx.beginPath(); ctx.arc(0, 0, pod.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#eef1f6';
    ctx.beginPath(); ctx.arc(-4, -5, pod.r * 0.45, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a92a0';
    ctx.beginPath(); ctx.moveTo(-pod.r - 6, 0); ctx.lineTo(-pod.r + 2, -6); ctx.lineTo(-pod.r + 2, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c23b2e';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '900 10px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pod.letter === '1UP' ? '★' : pod.letter, 0, 0.5);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}
function drawItems() {
  for (const it of items) {
    if (it.t > 11 && Math.floor(it.t * 8) % 2 === 0) continue;
    const bob = it.grounded ? Math.sin(time * 4 + it.x) * 2 : 0;
    const y = it.y - 12 + bob;
    ctx.fillStyle = '#c23b2e';
    ctx.fillRect(it.x - 12, y - 12, 24, 24);
    ctx.fillStyle = '#e8685c';
    ctx.fillRect(it.x - 12, y - 12, 24, 5);
    ctx.fillStyle = '#fff';
    ctx.font = '900 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(it.letter === '1UP' ? '★' : it.letter, it.x, y + 5);
  }
}
function drawParticles() {
  for (const p of particles) {
    const k = 1 - p.t / p.life;
    if (p.ring) {
      ctx.strokeStyle = 'rgba(255,240,210,' + (0.8 * k) + ')';
      ctx.lineWidth = 3 * k + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + (1 - k) * 2.2), 0, TAU); ctx.stroke();
    } else if (p.smoke) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = k * 0.7;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = k;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }
  }
}
function drawPopups() {
  ctx.font = '800 13px ' + FONT;
  ctx.textAlign = 'center';
  for (const p of popups) {
    const a = 1 - Math.max(0, (p.t - 0.5) / 0.4);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,14,24,0.8)';
    ctx.fillText(p.text, p.x + 1, p.y + 1);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  // 武器徽章
  const wCol = { R: '#9fb2c8', M: '#fbbf24', S: '#fb923c', L: '#7dd3fc' }[P.weapon];
  ctx.fillStyle = 'rgba(10,14,24,0.55)';
  roundRect(14, 14, 104, 34, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = 1;
  roundRect(14, 14, 104, 34, 10); ctx.stroke();
  ctx.fillStyle = wCol;
  ctx.font = '900 20px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillText(P.weapon === 'R' ? '▶' : P.weapon, 26, 39);
  ctx.fillStyle = '#cdd8e6';
  ctx.font = '700 13px ' + FONT;
  ctx.fillText(WEAPONS[P.weapon].name, 52, 36);
  // BOSS 血条
  if (boss && boss.active && !boss.dying) {
    const bw = 300, bx = (VIEW_W - bw) / 2, by = 18;
    ctx.fillStyle = 'rgba(10,14,24,0.55)';
    roundRect(bx - 6, by - 6, bw + 12, 24, 8); ctx.fill();
    ctx.fillStyle = '#3a1512';
    ctx.fillRect(bx, by, bw, 10);
    ctx.fillStyle = '#ff5a48';
    ctx.fillRect(bx, by, bw * clamp(boss.hp / boss.maxHp, 0, 1), 10);
    ctx.fillStyle = '#ffd7d0';
    ctx.font = '700 11px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('要塞核心', VIEW_W / 2, by + 26);
  }
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
function drawBanner() {
  if (!banner) return;
  const k = banner.t / banner.dur;
  const a = k < 0.12 ? k / 0.12 : k > 0.82 ? (1 - k) / 0.18 : 1;
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.textAlign = 'center';
  ctx.font = '900 44px ' + FONT;
  ctx.fillStyle = 'rgba(10,14,24,0.85)';
  ctx.fillText(banner.title, VIEW_W / 2 + 2, 202);
  ctx.fillStyle = banner.color || '#fff';
  ctx.fillText(banner.title, VIEW_W / 2, 200);
  if (banner.sub) {
    ctx.font = '700 17px ' + FONT;
    ctx.fillStyle = 'rgba(10,14,24,0.85)';
    ctx.fillText(banner.sub, VIEW_W / 2 + 1, 236 + 1);
    ctx.fillStyle = '#e6edf5';
    ctx.fillText(banner.sub, VIEW_W / 2, 236);
  }
  ctx.globalAlpha = 1;
}
function veil(a) {
  ctx.fillStyle = 'rgba(5,8,16,' + a + ')';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
function drawTitle() {
  veil(0.55);
  ctx.textAlign = 'center';
  const y0 = 168;
  ctx.font = '900 76px ' + FONT;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText('魂斗罗', VIEW_W / 2 + 4, y0 + 4);
  const grd = ctx.createLinearGradient(0, y0 - 60, 0, y0 + 10);
  grd.addColorStop(0, '#ffd7d0');
  grd.addColorStop(0.5, '#ff5a48');
  grd.addColorStop(1, '#b91c1c');
  ctx.fillStyle = grd;
  ctx.fillText('魂斗罗', VIEW_W / 2, y0);
  ctx.font = '800 20px ' + FONT;
  ctx.fillStyle = '#7dd3fc';
  ctx.fillText('C O N T R A · 横 版 突 击', VIEW_W / 2, y0 + 38);
  ctx.font = '600 14px ' + FONT;
  ctx.fillStyle = '#aab8ca';
  ctx.fillText('←→ 移动 · ↑↓ 瞄准/卧倒 · 空格 跳跃 · J 射击 · 击落胶囊换武器', VIEW_W / 2, y0 + 84);
  if (konamiOn) {
    ctx.fillStyle = '#fcd34d';
    ctx.font = '800 15px ' + FONT;
    ctx.fillText('↑↑↓↓←→←→BA · 秘籍生效 · 30 条命', VIEW_W / 2, y0 + 112);
  } else {
    ctx.fillStyle = '#5c6b80';
    ctx.fillText('传说:输入 ↑↑↓↓←→←→BA 可获得 30 条命', VIEW_W / 2, y0 + 112);
  }
  if (Math.floor(time * 2) % 2 === 0) {
    ctx.fillStyle = '#fcd34d';
    ctx.font = '800 20px ' + FONT;
    ctx.fillText('点击画面 或 按回车 / 空格 开始', VIEW_W / 2, y0 + 160);
  }
  ctx.fillStyle = '#8fa3bf';
  ctx.font = '700 13px ' + FONT;
  ctx.fillText('最高纪录 ' + Math.max(best, score), VIEW_W / 2, VIEW_H - 34);
}
function drawPaused() {
  veil(0.5);
  ctx.textAlign = 'center';
  ctx.font = '900 40px ' + FONT;
  ctx.fillStyle = '#e6edf5';
  ctx.fillText('已暂停', VIEW_W / 2, VIEW_H / 2 - 8);
  ctx.font = '600 15px ' + FONT;
  ctx.fillStyle = '#8fa3bf';
  ctx.fillText('按 P 或右上角按钮继续', VIEW_W / 2, VIEW_H / 2 + 26);
}
function drawOver() {
  veil(Math.min(0.65, overT * 1.2));
  ctx.textAlign = 'center';
  ctx.font = '900 58px ' + FONT;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText('GAME OVER', VIEW_W / 2 + 3, 233);
  ctx.fillStyle = '#ff5a48';
  ctx.fillText('GAME OVER', VIEW_W / 2, 230);
  ctx.font = '700 18px ' + FONT;
  ctx.fillStyle = '#e6edf5';
  ctx.fillText('得分 ' + score + ' · 最高纪录 ' + best, VIEW_W / 2, 278);
  if (newRecord) {
    ctx.fillStyle = '#fcd34d';
    ctx.font = '800 16px ' + FONT;
    ctx.fillText('★ 新纪录! ★', VIEW_W / 2, 306);
  }
  if (overT > 0.8 && Math.floor(time * 2) % 2 === 0) {
    ctx.fillStyle = '#fcd34d';
    ctx.font = '800 18px ' + FONT;
    ctx.fillText('点击画面 或 按 R 重新出击', VIEW_W / 2, 352);
  }
}
function render() {
  ctx.setTransform(DPR * scale, 0, 0, DPR * scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawBackground();
  const sx = shake > 0 ? rand(-shake, shake) * 0.45 : 0;
  const sy = shake > 0 ? rand(-shake, shake) * 0.45 : 0;
  ctx.save();
  ctx.translate(Math.round(-camX + sx), Math.round(sy));
  drawWater();
  drawPlats();
  drawDecor();
  drawBoss();
  drawItems();
  drawPods();
  drawEnemies();
  drawPlayer();
  drawBullets();
  drawBeams();
  drawParticles();
  drawPopups();
  ctx.restore();
  if (state !== STATE.TITLE) drawHUD();
  if (flashA > 0) {
    ctx.fillStyle = 'rgba(255,50,40,' + (flashA * 0.55) + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  drawBanner();
  if (state === STATE.TITLE) drawTitle();
  else if (state === STATE.PAUSED) drawPaused();
  else if (state === STATE.OVER) drawOver();
}

// ===================== 启动 =====================
startStage();
banner = null;
syncChips();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  if (state !== STATE.PAUSED) update(dt);
  render();
}
requestAnimationFrame(frame);
