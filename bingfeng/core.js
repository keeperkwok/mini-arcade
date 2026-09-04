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

// ===================== 工具 =====================
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const lerp = (a, b, t) => a + (b - a) * t;
const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, sans-serif';

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = boardWrap.clientWidth;
  H = boardWrap.clientHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ===================== 状态 =====================
const STATE = { TITLE: 0, PLAYING: 1, PAUSED: 2, OVER: 3 };
let state = STATE.TITLE;
let time = 0;
let score = 0;
let best = Number(localStorage.getItem('twinbee.best') || 0) || 0;
let muted = localStorage.getItem('twinbee.muted') === '1';
let lives = 3, stage = 1, stageTimer = 0;
let bellChain = 0, chainTimer = 0;
let shake = 0, flashA = 0;
let banner = null;
let overT = 0, newRecord = false;

const pBullets = [], eBullets = [], enemies = [], bellClouds = [], bells = [], stars = [];
const islands = [], farClouds = [], nearClouds = [], particles = [], popups = [];
let boss = null, warnT = 0;
let spawnT = 1.2, cloudT = 1.5, islandT = 0, farCloudT = 0, nearCloudT = 0;

function syncChips() {
  scoreEl.textContent = score;
  bestEl.textContent = Math.max(best, score);
  stageEl.textContent = stage;
  livesEl.textContent = Math.max(0, lives);
}

// ===================== 音频（Web Audio 合成） =====================
let AC = null, master = null, sfxBus = null, musicBus = null, delayNode = null;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  AC = new Ctx();
  master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
  sfxBus = AC.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musicBus = AC.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
  delayNode = AC.createDelay(0.6); delayNode.delayTime.value = 0.24;
  const fb = AC.createGain(); fb.gain.value = 0.22;
  const wet = AC.createGain(); wet.gain.value = 0.3;
  delayNode.connect(fb); fb.connect(delayNode); delayNode.connect(wet); wet.connect(musicBus);
}
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

function tone(opts) {
  if (!AC || muted) return;
  const type = opts.type || 'square';
  const f0 = opts.f0 || 440;
  const t0 = opts.t0 != null ? opts.t0 : AC.currentTime;
  const dur = opts.dur || 0.1;
  const vol = opts.vol != null ? opts.vol : 0.15;
  const bus = opts.bus || sfxBus;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(f0, 1), t0);
  if (opts.f1) o.frequency.exponentialRampToValueAtTime(Math.max(opts.f1, 1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(bus);
  if (opts.echo) g.connect(delayNode);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
let noiseBuf = null;
function noiseShot(opts) {
  if (!AC || muted) return;
  const t0 = opts.t0 != null ? opts.t0 : AC.currentTime;
  const dur = opts.dur || 0.3;
  const vol = opts.vol != null ? opts.vol : 0.3;
  const bus = opts.bus || sfxBus;
  if (!noiseBuf) {
    noiseBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 1.2), AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  const f = AC.createBiquadFilter();
  f.type = opts.type || 'lowpass';
  f.frequency.value = opts.freq || 800;
  f.Q.value = opts.q || 0.8;
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(bus);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

const SFX = {
  shoot() { tone({ type: 'square', f0: 950, f1: 480, dur: 0.06, vol: 0.05 }); },
  laser() { tone({ type: 'sawtooth', f0: 1400, f1: 220, dur: 0.14, vol: 0.07 }); },
  hit() { tone({ type: 'square', f0: 260, f1: 160, dur: 0.05, vol: 0.08 }); },
  cloud() { noiseShot({ dur: 0.18, vol: 0.12, freq: 500 }); },
  boom(big) {
    noiseShot({ dur: big ? 0.7 : 0.35, vol: big ? 0.5 : 0.25, freq: big ? 320 : 600 });
    tone({ type: 'sine', f0: big ? 130 : 190, f1: 40, dur: big ? 0.6 : 0.3, vol: big ? 0.4 : 0.2 });
  },
  bell() {
    if (!AC) return;
    const t = AC.currentTime;
    tone({ type: 'triangle', f0: 1568, dur: 0.25, vol: 0.16, t0: t });
    tone({ type: 'triangle', f0: 2093, dur: 0.3, vol: 0.1, t0: t + 0.06 });
  },
  power() {
    if (!AC) return;
    const t = AC.currentTime;
    [72, 76, 79, 84].forEach((m, i) => tone({ type: 'square', f0: midiHz(m), dur: 0.09, vol: 0.12, t0: t + i * 0.07, echo: true, bus: musicBus }));
  },
  star() { if (AC) tone({ type: 'square', f0: 600, f1: 2400, dur: 0.25, vol: 0.12 }); },
  shield() { tone({ type: 'triangle', f0: 520, f1: 880, dur: 0.12, vol: 0.12 }); },
  die() {
    if (!AC) return;
    const t = AC.currentTime;
    noiseShot({ t0: t, dur: 0.8, vol: 0.4, freq: 400 });
    tone({ type: 'sawtooth', f0: 500, f1: 60, dur: 0.7, vol: 0.2, t0: t });
  },
  warn() {
    if (!AC) return;
    const t = AC.currentTime;
    for (let i = 0; i < 4; i++) {
      tone({ type: 'square', f0: 660, dur: 0.18, vol: 0.12, t0: t + i * 0.4 });
      tone({ type: 'square', f0: 880, dur: 0.18, vol: 0.12, t0: t + i * 0.4 + 0.2 });
    }
  },
  stage() {
    if (!AC) return;
    const t = AC.currentTime;
    [72, 79, 84, 88].forEach((m, i) => tone({ type: 'triangle', f0: midiHz(m), dur: 0.14, vol: 0.14, t0: t + i * 0.09, echo: true, bus: musicBus }));
  },
  over() {
    if (!AC) return;
    const t = AC.currentTime;
    [76, 72, 69, 64].forEach((m, i) => tone({ type: 'triangle', f0: midiHz(m), dur: 0.3, vol: 0.14, t0: t + i * 0.22 }));
  },
};

// ===================== 背景音乐（原创欢快循环） =====================
const MELODY = [
  76, 79, 84, 79, 76, 79, 84, 79, 74, 79, 83, 79, 74, 79, 83, 79,
  76, 81, 84, 81, 76, 81, 84, 81, 72, 77, 81, 77, 74, 79, 83, 79,
  76, 79, 84, 79, 88, 86, 84, 83, 74, 79, 83, 79, 83, 81, 79, 74,
  76, 81, 84, 81, 84, 83, 81, 79, 77, 81, 84, 81, 79, 83, 84, -1,
];
const BASS = [
  48, -1, 48, -1, 48, -1, 48, -1, 43, -1, 43, -1, 43, -1, 43, -1,
  45, -1, 45, -1, 45, -1, 45, -1, 41, -1, 41, -1, 43, -1, 43, -1,
  48, -1, 48, -1, 48, -1, 48, -1, 43, -1, 43, -1, 43, -1, 43, -1,
  45, -1, 45, -1, 45, -1, 45, -1, 41, -1, 41, -1, 43, -1, 43, -1,
];
const STEP_DUR = 60 / 140 / 2;
let musicTimer = null, nextNote = 0, stepIdx = 0;
function startMusic() {
  if (!AC || musicTimer || muted) return;
  nextNote = AC.currentTime + 0.1;
  musicTimer = setInterval(() => {
    if (!AC || AC.state !== 'running') return;
    while (nextNote < AC.currentTime + 0.18) {
      playStep(stepIdx, nextNote);
      nextNote += STEP_DUR;
      stepIdx = (stepIdx + 1) % MELODY.length;
    }
  }, 40);
}
function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
function playStep(i, t) {
  const m = MELODY[i];
  if (m > 0) tone({ type: 'square', f0: midiHz(m), dur: STEP_DUR * 0.9, vol: 0.055, t0: t, bus: musicBus, echo: true });
  const b = BASS[i];
  if (b > 0) tone({ type: 'triangle', f0: midiHz(b), dur: STEP_DUR * 1.8, vol: 0.13, t0: t, bus: musicBus });
  if (i % 2 === 1) noiseShot({ t0: t, dur: 0.03, vol: 0.018, freq: 6000, type: 'highpass', bus: musicBus });
}

// ===================== 输入 =====================
const keys = Object.create(null);
const pointer = { down: false, id: -1, x: 0, y: 0, vxHint: 0 };

window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  initAudio();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'Enter' || e.code === 'Space') {
    if (state === STATE.TITLE) startGame();
    else if (state === STATE.OVER && overT > 0.8) startGame();
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state === STATE.PLAYING) pauseGame();
    else if (state === STATE.PAUSED) resumeGame();
  }
  if (e.code === 'KeyM') setMuted(!muted);
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { if (state === STATE.PLAYING) pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === STATE.PLAYING) pauseGame(); });

canvas.addEventListener('pointerdown', e => {
  initAudio();
  if (state === STATE.TITLE) { startGame(); return; }
  if (state === STATE.OVER) { if (overT > 0.8) startGame(); return; }
  if (state === STATE.PAUSED) { resumeGame(); return; }
  pointer.down = true; pointer.id = e.pointerId;
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.vxHint = 0;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!pointer.down || e.pointerId !== pointer.id) return;
  const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
  pointer.x = e.clientX; pointer.y = e.clientY;
  pointer.vxHint = clamp(dx * 45, -320, 320);
  if (state === STATE.PLAYING && player.alive) {
    player.x = clamp(player.x + dx * 1.8, 22, W - 22);
    player.y = clamp(player.y + dy * 1.8, 70, H - 26);
  }
});
const endPointer = e => { if (e.pointerId === pointer.id) pointer.down = false; };
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// ===================== 场景配色 =====================
const PALETTES = [
  { name: 'day', top: '#4fb3f2', bottom: '#c8ecff', tint: null, sun: '#fff6c9' },
  { name: 'sunset', top: '#6a7bd9', bottom: '#ffc98a', tint: 'rgba(255,120,50,0.10)', sun: '#ffd27d' },
  { name: 'night', top: '#1d2f63', bottom: '#5a7fd6', tint: 'rgba(20,40,110,0.16)', sun: '#f4f6ff' },
];
const palette = () => PALETTES[(stage - 1) % 3];
const stageSubtitle = s => ['蔚蓝天空', '落日云海', '星夜巡航'][(s - 1) % 3];
const groundSpeed = () => 70 + stage * 8;
let skyStars = null;
function ensureStars() {
  if (skyStars) return;
  skyStars = [];
  for (let i = 0; i < 70; i++) skyStars.push({ x: Math.random(), y: Math.random() * 0.9, r: rand(0.6, 1.6), ph: rand(0, TAU) });
}

// ===================== 浮岛 =====================
function makeIslandSprite(r) {
  const size = Math.ceil(r * 2.7);
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  const cx = size / 2, cy = size / 2;
  const n = 12;
  const rnd = Array.from({ length: n }, () => Math.random());
  function blob(radiusFactor, yFactor) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + 0.3;
      const rr = r * radiusFactor * (0.82 + rnd[i] * 0.28);
      arr.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * yFactor]);
    }
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = arr[i % n], q = arr[(i + 1) % n];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (i === 0) g.moveTo(mx, my); else g.quadraticCurveTo(p[0], p[1], mx, my);
    }
    g.closePath();
  }
  blob(1.08, 0.95); g.fillStyle = '#e6c98f'; g.fill();
  blob(1.0, 0.9);
  const grad = g.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.1, cx, cy, r * 1.05);
  grad.addColorStop(0, '#a8e687'); grad.addColorStop(0.65, '#6fce62'); grad.addColorStop(1, '#46a84f');
  g.fillStyle = grad; g.fill();
  const trees = irand(2, 5);
  for (let i = 0; i < trees; i++) {
    const a = rand(0, TAU), d = rand(0.15, 0.6) * r;
    const tx = cx + Math.cos(a) * d, ty = cy + Math.sin(a) * d * 0.85;
    const s = rand(0.10, 0.16) * r;
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath(); g.ellipse(tx + s * 0.3, ty + s * 0.9, s * 1.1, s * 0.45, 0, 0, TAU); g.fill();
    g.fillStyle = '#7a5230'; g.fillRect(tx - s * 0.12, ty - s * 0.2, s * 0.24, s * 0.7);
    g.fillStyle = '#2e8b3d'; g.beginPath(); g.arc(tx, ty - s * 0.55, s * 0.75, 0, TAU); g.fill();
    g.fillStyle = '#54b25e'; g.beginPath(); g.arc(tx - s * 0.25, ty - s * 0.75, s * 0.5, 0, TAU); g.fill();
  }
  for (let i = 0; i < 8; i++) {
    const a = rand(0, TAU), d = rand(0.1, 0.75) * r;
    const fx = cx + Math.cos(a) * d, fy = cy + Math.sin(a) * d * 0.85;
    g.fillStyle = ['#ff80ab', '#fff176', '#ff8a65', '#e1bee7'][irand(0, 3)];
    g.beginPath(); g.arc(fx, fy, Math.max(1.2, r * 0.02), 0, TAU); g.fill();
  }
  return { img: c, size };
}
function updateGround(dt) {
  islandT -= dt;
  const gs = groundSpeed();
  if (islandT <= 0) {
    islandT = rand(0.8, 1.5);
    const r = rand(50, Math.min(110, W * 0.2));
    const spr = makeIslandSprite(r);
    islands.push({ x: rand(r, W - r), y: -r * 1.6, r, img: spr.img, size: spr.size, sp: gs * rand(0.92, 1.08) });
  }
  for (let i = islands.length - 1; i >= 0; i--) {
    const s = islands[i];
    s.y += s.sp * dt;
    if (s.y > H + s.r * 2) islands.splice(i, 1);
  }
}

// ===================== 装饰云（视差） =====================
const softCache = new Map();
function makeSoftCloud(r, alpha) {
  const L = Math.ceil(r * 3);
  const c = document.createElement('canvas');
  c.width = c.height = L;
  const g = c.getContext('2d');
  const puffs = [[0, 0, r], [-r * 0.8, r * 0.15, r * 0.62], [r * 0.85, r * 0.18, r * 0.58], [-r * 0.35, -r * 0.35, r * 0.55], [r * 0.4, -r * 0.3, r * 0.5]];
  for (const [px, py, pr] of puffs) {
    const gr = g.createRadialGradient(L / 2 + px, L / 2 + py, pr * 0.1, L / 2 + px, L / 2 + py, pr);
    gr.addColorStop(0, 'rgba(255,255,255,' + alpha + ')');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(L / 2 + px, L / 2 + py, pr, 0, TAU); g.fill();
  }
  return c;
}
function getSoftCloud(r, alpha) {
  const key = Math.round(r) + '|' + alpha;
  let s = softCache.get(key);
  if (!s) { s = makeSoftCloud(r, alpha); softCache.set(key, s); }
  return s;
}
function updateDecor(dt) {
  const gs = groundSpeed();
  farCloudT -= dt;
  if (farCloudT <= 0) {
    farCloudT = rand(1.4, 2.6);
    farClouds.push({ x: rand(-60, W + 60), y: -160, img: getSoftCloud(rand(45, 90), 0.5), sp: rand(0.4, 0.55) });
  }
  nearCloudT -= dt;
  if (nearCloudT <= 0) {
    nearCloudT = rand(3, 6);
    nearClouds.push({ x: rand(-120, W + 120), y: -320, img: getSoftCloud(rand(100, 180), 0.3), sp: rand(1.5, 1.9) });
  }
  for (let i = farClouds.length - 1; i >= 0; i--) {
    const c = farClouds[i];
    c.y += gs * c.sp * dt;
    if (c.y > H + 200) farClouds.splice(i, 1);
  }
  for (let i = nearClouds.length - 1; i >= 0; i--) {
    const c = nearClouds[i];
    c.y += gs * c.sp * dt;
    if (c.y > H + 360) nearClouds.splice(i, 1);
  }
}

// ===================== 铃铛云 =====================
function makeBellCloudSprite(r) {
  const L = Math.ceil(r * 3.2);
  const c = document.createElement('canvas');
  c.width = c.height = L * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  const cx = L / 2, cy = L / 2;
  const puffs = [[0, 0, r], [-r * 0.75, r * 0.12, r * 0.6], [r * 0.78, r * 0.14, r * 0.58], [-r * 0.38, -r * 0.4, r * 0.55], [r * 0.42, -r * 0.36, r * 0.52]];
  g.fillStyle = 'rgba(120,160,200,0.55)';
  for (const [px, py, pr] of puffs) { g.beginPath(); g.arc(cx + px, cy + py + 4, pr, 0, TAU); g.fill(); }
  for (const [px, py, pr] of puffs) {
    const gr = g.createRadialGradient(cx + px - pr * 0.3, cy + py - pr * 0.35, pr * 0.15, cx + px, cy + py, pr);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#dbeefb');
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx + px, cy + py, pr, 0, TAU); g.fill();
  }
  return { img: c, L };
}
function makeBellCloud(x, y) {
  const r = rand(30, 42);
  return { x, y, r, hp: 3, t: 0, flash: 0, ph: rand(0, TAU), spr: makeBellCloudSprite(r) };
}
function updateClouds(dt) {
  for (let i = bellClouds.length - 1; i >= 0; i--) {
    const c = bellClouds[i];
    c.t += dt; c.flash = Math.max(0, c.flash - dt * 5);
    c.y += (42 + stage * 4) * dt;
    c.x += Math.sin(c.t * 0.6 + c.ph) * 8 * dt;
    if (c.y > H + 80) bellClouds.splice(i, 1);
  }
}

// ===================== 铃铛与星星 =====================
const BELL_COLORS = [
  { main: '#ffd54f', dark: '#f57f17', glow: 'rgba(255,213,79,0.55)' },
  { main: '#4fc3f7', dark: '#0277bd', glow: 'rgba(79,195,247,0.55)' },
  { main: '#ef5350', dark: '#b71c1c', glow: 'rgba(239,83,80,0.55)' },
  { main: '#f5f5f5', dark: '#90a4ae', glow: 'rgba(255,255,255,0.6)' },
];
function spawnBell(x, y) { bells.push({ x, y, vx: rand(-20, 20), vy: -120, color: 0, t: 0, flash: 0 }); }
function spawnStar(x, y) { stars.push({ x, y, t: 0 }); }
function updateBells(dt) {
  for (let i = bells.length - 1; i >= 0; i--) {
    const b = bells[i];
    b.t += dt; b.flash = Math.max(0, b.flash - dt * 4);
    b.vy = Math.min(b.vy + 140 * dt, 46);
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.vx *= Math.pow(0.4, dt);
    if (player.alive) {
      const d2 = dist2(b.x, b.y, player.x, player.y);
      if (d2 < 95 * 95) {
        const d = Math.sqrt(d2) || 1;
        b.x += (player.x - b.x) / d * 300 * dt;
        b.y += (player.y - b.y) / d * 300 * dt;
      }
      if (d2 < 26 * 26) { collectBell(b); bells.splice(i, 1); continue; }
    }
    if (b.y > H + 40) bells.splice(i, 1);
  }
}
function collectBell(b) {
  SFX.bell();
  burst(b.x, b.y, 10, { colors: ['#ffffff', BELL_COLORS[b.color].main], s1: 160, life: 0.4 });
  if (b.color === 0) {
    const pts = [500, 1000, 2500, 5000, 10000][Math.min(bellChain, 4)];
    score += pts; bellChain++; chainTimer = 5;
    addPopup(b.x, b.y, '+' + pts, '#ffe082');
  } else if (b.color === 1) {
    if (player.weaponLv < 2) {
      player.weaponLv++;
      addPopup(b.x, b.y, player.weaponLv === 1 ? '双子射击!' : '五路散射!', '#4fc3f7');
      SFX.power();
    } else { score += 2000; addPopup(b.x, b.y, '+2000', '#4fc3f7'); }
  } else if (b.color === 2) {
    if (!player.laser) { player.laser = true; addPopup(b.x, b.y, '激光解锁!', '#ef5350'); SFX.power(); }
    else { score += 2000; addPopup(b.x, b.y, '+2000', '#ef5350'); }
  } else {
    player.barrier = Math.min(6, player.barrier + 3);
    addPopup(b.x, b.y, '护盾 +3!', '#ffffff');
    SFX.power();
  }
}
function updateStars(dt) {
  for (let i = stars.length - 1; i >= 0; i--) {
    const s = stars[i];
    s.t += dt;
    s.y += 50 * dt;
    s.x += Math.sin(s.t * 2.5) * 20 * dt;
    if (player.alive) {
      const d2 = dist2(s.x, s.y, player.x, player.y);
      if (d2 < 95 * 95) {
        const d = Math.sqrt(d2) || 1;
        s.x += (player.x - s.x) / d * 300 * dt;
        s.y += (player.y - s.y) / d * 300 * dt;
      }
      if (d2 < 26 * 26) {
        if (player.speedLv < 3) { player.speedLv++; addPopup(s.x, s.y, '加速!', '#ffd54f'); }
        else { score += 2000; addPopup(s.x, s.y, '+2000', '#ffd54f'); }
        SFX.star();
        burst(s.x, s.y, 10, { colors: ['#fff59d', '#ffffff'], s1: 140, life: 0.4 });
        stars.splice(i, 1); continue;
      }
    }
    if (s.y > H + 30) stars.splice(i, 1);
  }
}

// ===================== 粒子与飘字 =====================
function addParticle(p) { if (particles.length < 500) particles.push(p); }
function burst(x, y, n, opts) {
  opts = opts || {};
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(opts.s0 || 40, opts.s1 || 220);
    addParticle({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rand(0.3, opts.life || 0.7), t: 0,
      r: rand(1.5, opts.r || 4),
      color: opts.colors ? opts.colors[irand(0, opts.colors.length - 1)] : '#ffd54f',
      drag: opts.drag || 2,
    });
  }
}
function ring(x, y, color, r0, speed) {
  addParticle({ ring: true, x, y, r: r0 || 6, vr: speed || 260, life: 0.45, t: 0, color });
}
function smoke(x, y) {
  addParticle({ x, y, vx: rand(-15, 15), vy: rand(10, 40), life: rand(0.5, 1), t: 0, r: rand(4, 9), color: 'smoke', drag: 1 });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t > p.life) { particles.splice(i, 1); continue; }
    if (p.ring) { p.r += p.vr * dt; continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const damp = Math.pow(0.5, dt * p.drag);
    p.vx *= damp; p.vy *= damp;
  }
}
function addPopup(x, y, text, color, big) {
  popups.push({ x, y, text, color: color || '#fff', t: 0, big: !!big });
}
function updatePopups(dt) {
  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].t += dt;
    if (popups[i].t > 1.1) popups.splice(i, 1);
  }
}
