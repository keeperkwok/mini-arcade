(() => {
'use strict';

/* 节拍雨：三首曲子全部由代码实时生成，伴奏用 WebAudio 现场合成（没有任何音频素材）。
   下落的就是主旋律本身 —— 按准 D F J K，这段旋律才算被你补完；漏一个音就哑一拍。 */

/* ==================== 谱面几何 ==================== */
const W = 460, H = 620;
const LANE_N = 4;
const LANE_W = 96;
const LX0 = (W - LANE_N * LANE_W) / 2;        // 38
const HIT_Y = 498;
const SPAWN_Y = -40;
const PAD_TOP = 520, PAD_BOT = 604;
const KEYS = ['d', 'f', 'j', 'k'];
const LANE_HUES = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24'];
const PERFECT_W = 0.055;                       // 判定窗（秒）
const GOOD_W = 0.115;
const MISS_W = 0.17;
const FEVER_LEN = 6;

/* ==================== DOM ==================== */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlayContent');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const accEl = document.getElementById('acc');
const hpEl = document.getElementById('hp');
const nowEl = document.getElementById('now');
const songsEl = document.getElementById('songs');
const btnSound = document.getElementById('btnSound');
const btnNew = document.getElementById('btnNew');
const btnAuto = document.getElementById('btnAuto');
const btnSlow = document.getElementById('btnSlow');
const btnPause = document.getElementById('btnPause');
const pauseLabel = document.getElementById('pauseLabel');
const autoState = document.getElementById('autoState');
const slowState = document.getElementById('slowState');

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
};
const sfx = window.Sfx.create({ storageKey: 'beat.muted' });
btnSound.textContent = sfx.isMuted() ? '🔇' : '🔊';

/* ==================== 随机与乐理 ==================== */
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
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
function bestKey(id) { return 'beat.best.' + id; }
function comboKey(id) { return 'beat.combo.' + id; }
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const PENTA = [0, 2, 4, 7, 9];                 // 大调五声
const CHORD = { I: [0, 4, 7], ii: [2, 5, 9], IV: [5, 9, 0], V: [7, 11, 2], vi: [9, 0, 4] };

const SONGS = [
  { id: 'easy', name: '晨跑', bpm: 96, bars: 26, root: 62, seed: 20260915, scroll: 1.16,
    prog: ['I', 'V', 'vi', 'IV'], dens: [0.30, 0.44, 0.58, 0.36, 0.64], gap: 0.2, feel: 'DREAMY · 八分为主' },
  { id: 'mid', name: '霓虹夜行', bpm: 124, bars: 30, root: 60, seed: 77881, scroll: 0.95,
    prog: ['I', 'IV', 'vi', 'V'], dens: [0.38, 0.52, 0.72, 0.42, 0.8], gap: 0.17, feel: 'FUNK · 切分与十六分' },
  { id: 'hard', name: '风暴骤雨', bpm: 152, bars: 34, root: 64, seed: 314159, scroll: 0.8,
    prog: ['vi', 'IV', 'I', 'V'], dens: [0.46, 0.62, 0.88, 0.5, 0.94], gap: 0.145, feel: 'STORM · 双手八分连打' },
];
const songById = (id) => SONGS.find((s) => s.id === id) || SONGS[0];

/* 段落：0 前奏 1 铺陈 2 副歌 3 间奏 4 尾声（密度递增，副歌有双押） */
function sections(bars) {
  const a = Math.max(2, Math.round(bars * 0.22));
  const b = a + Math.max(2, Math.round(bars * 0.18));
  const c = b + Math.max(4, Math.round(bars * 0.3));
  const d = c + Math.max(2, Math.round(bars * 0.12));
  return (bar) => (bar < a ? 0 : bar < b ? 1 : bar < c ? 2 : bar < d ? 3 : 4);
}

/* ==================== 谱面生成 ==================== */
function buildChart(song) {
  const rnd = mulberry(song.seed);
  const beat = 60 / song.bpm;
  const barLen = beat * 4;
  const which = sections(song.bars);
  const music = [];
  const notes = [];
  const lastAt = [0, 0, 0, 0];       // 各轨上一次出音时间，防同轨连打过密
  let lastMidi = song.root + 7;
  let contour = 1;                             // +1 往上走 / -1 往下走，到边界才折返

  const laneOf = (m) => clamp(Math.floor((m - song.root) / 6), 0, LANE_N - 1);
  const freeNear = (want, t, taken) => {
    for (const d of [0, 1, -1, 2, -2, 3]) {
      const lane = want + d;
      if (lane < 0 || lane >= LANE_N || taken.has(lane)) continue;
      if (t - lastAt[lane] < song.gap) continue;
      return lane;
    }
    return -1;
  };
  const pickPitch = (chord, strong) => {
    const pool = [];
    const src = strong ? chord : PENTA;
    for (const pc of src) {
      for (let o = 0; o < 2; o++) {
        const m = song.root + pc + 12 * o;
        if (m >= song.root && m <= song.root + 23) pool.push(m);
      }
    }
    if (lastMidi >= song.root + 19) contour = -1;           // 摸到高音边界就回头
    if (lastMidi <= song.root + 4) contour = 1;
    let best = pool[0], bestScore = 1e9;
    for (const m of pool) {
      const d = m - lastMidi;
      if (Math.abs(d) > 16 || d === 0) continue;
      const along = Math.sign(d) === contour ? -5 : 3;      // 顺着当前走势走，形成起伏的乐句
      const s = Math.abs(d) * 1.5 + along + (strong && Math.abs(d) > 9 ? 3 : 0) + rnd() * 5;
      if (s < bestScore) { bestScore = s; best = m; }
    }
    if (Math.sign(best - lastMidi) !== contour && Math.abs(best - lastMidi) > 1) contour *= -1;
    return best;
  };

  for (let b = 0; b < song.bars; b++) {
    const sec = b < 2 ? -1 : which(b);          // -1 = 前奏两小节：有伴奏、不出音符
    const t0 = b * barLen;
    const cname = song.prog[b % song.prog.length];
    const chord = CHORD[cname];

    /* --- 鼓与贝斯（自动演奏的伴奏） --- */
    const kicks = sec === 3 ? [0] : sec === 0 ? [0] : song.id === 'easy' ? [0, 4] : [0, 3, 4, 6];
    const snares = sec === 3 ? [4] : sec >= 1 ? [2, 6] : [];
    for (let s = 0; s < 8; s++) {
      const t = t0 + s * beat / 2;
      if (kicks.indexOf(s) >= 0) music.push({ t, kind: 'kick' });
      if (snares.indexOf(s) >= 0) music.push({ t, kind: 'snare' });
      if (sec >= 1 && s % 2 === 0) music.push({ t, kind: 'hat' });
      if (sec >= 2 && s % 2 === 1 && rnd() < 0.55) music.push({ t, kind: 'hat', open: true });
    }
    for (let s = 0; s < 4; s++) {
      if (sec === 0 && s % 2) continue;
      music.push({ t: t0 + s * beat, kind: 'bass', hz: midiHz(song.root - 12 + chord[0]) });
    }
    if (sec >= 1 && b % 2 === 1) {
      for (const c of chord) music.push({ t: t0 + beat * 1.5, kind: 'comp', hz: midiHz(song.root + 12 + c) });
    }
    if (sec >= 2) {
      for (const c of chord) music.push({ t: t0 + beat * 3.5, kind: 'comp', hz: midiHz(song.root + 12 + c) });
    }

    /* --- 主旋律 = 玩家的音符 --- */
    if (sec < 0) continue;
    const slots = [{ s: 0, on: true }];
    for (let s = 1; s < 8; s++) slots.push({ s, on: true });
    if (sec >= 2) {                                          // 副歌塞十六分
      for (let s = 0; s < 8; s++) {
        if (rnd() < (song.id === 'hard' ? 0.3 : song.id === 'mid' ? 0.18 : 0.08)) {
          slots.push({ s: s + 0.5, on: true });
        }
      }
    }
    slots.sort((p, q) => p.s - q.s);

    for (const slot of slots) {
      const t = t0 + slot.s * beat / 2;
      if (t >= song.bars * barLen - barLen * 0.5) continue;  // 收尾留一小节空拍
      const strong = slot.s % 4 === 0;
      const p = song.dens[sec] * (strong ? 1.5 : 1);
      if (rnd() > p) continue;
      const midi = pickPitch(chord, strong);
      const taken = new Set();
      const want = laneOf(midi);
      const lane = freeNear(want, t, taken);
      if (lane < 0) continue;
      taken.add(lane);
      lastAt[lane] = t;
      notes.push({ t, lane, midi, strong, hit: 0, judged: false });
      lastMidi = midi;

      if (sec >= 2 && strong && rnd() < (song.id === 'hard' ? 0.3 : 0.16)) {   // 双押
        const hi = pickPitch(chord, true);
        const m2 = Math.max(hi, midi + 7);
        const lane2 = freeNear(laneOf(Math.min(m2, song.root + 23)), t, taken);
        if (lane2 >= 0) {
          const mm = clamp(m2, song.root, song.root + 23);
          taken.add(lane2);
          lastAt[lane2] = t;
          notes.push({ t, lane: lane2, midi: mm, strong: true, hit: 0, judged: false });
          lastMidi = mm;
        }
      }
    }
  }

  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  music.sort((a, b) => a.t - b.t);
  const lastT = Math.max(notes.length ? notes[notes.length - 1].t : 0, music.length ? music[music.length - 1].t : 0);
  return { song, music, notes, beat, barLen, sec: 2, end: lastT + 2.4, total: notes.length, which };
}

/* ==================== 合成器 ==================== */
const band = (function () {
  let ac = null, master = null, bus = null, noiseBuf = null;
  function ensure() {
    if (ac) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.85;
      if (ac.createDynamicsCompressor) {
        const comp = ac.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ac.destination);
      } else master.connect(ac.destination);
      bus = master;
      const n = Math.max(1, Math.floor(ac.sampleRate * 0.4));
      noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { ac = null; return false; }
  }
  function now() { return ac ? ac.currentTime : 0; }
  function osc(t, type, hz, dur, vol, slideTo) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function nz(t, dur, vol, type, hz, q) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    const g = ac.createGain();
    f.type = type;
    f.frequency.setValueAtTime(hz, t);
    if (q) f.Q.setValueAtTime(q, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t); src.stop(t + dur + 0.03);
  }
  function play(ev, at) {
    if (sfx.isMuted() || !ensure()) return;
    const t = Math.max(now(), at);
    if (ev.kind === 'kick') { osc(t, 'sine', 148, 0.18, 0.9, 44); nz(t, 0.03, 0.2, 'lowpass', 900); pulse(0, 1); }
    else if (ev.kind === 'snare') { nz(t, 0.13, 0.26, 'highpass', 1500); osc(t, 'triangle', 186, 0.09, 0.22, 120); pulse(1, 1); }
    else if (ev.kind === 'hat') { nz(t, ev.open ? 0.14 : 0.032, ev.open ? 0.1 : 0.09, 'highpass', 7600); pulse(2, ev.open ? 0.6 : 0.4); }
    else if (ev.kind === 'bass') { osc(t, 'sawtooth', ev.hz, 0.19, 0.24); osc(t, 'sine', ev.hz / 2, 0.2, 0.14); }
    else if (ev.kind === 'comp') { osc(t, 'triangle', ev.hz, 0.13, 0.075); }
  }
  function lead(hz, at, bright, send) {
    if (sfx.isMuted() || !ensure()) return;
    const t = Math.max(now(), at);
    const o = ac.createOscillator();
    const o2 = ac.createOscillator();
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    o.type = bright ? 'square' : 'triangle';
    o2.type = 'sawtooth';
    o.frequency.setValueAtTime(hz, t);
    o2.frequency.setValueAtTime(hz * 1.005, t);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(bright ? 5200 : 900, t);
    const v = bright ? 0.19 : 0.09;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (bright ? 0.26 : 0.16));
    o.connect(f); o2.connect(f); f.connect(g); g.connect(bus);
    if (send && ac.createDelay) {
      const dly = ac.createDelay(1);
      const wet = ac.createGain();
      dly.delayTime.setValueAtTime(0.24, t);
      wet.gain.setValueAtTime(0.2, t);
      g.connect(dly); dly.connect(wet); wet.connect(bus);
    }
    o.start(t); o2.start(t);
    o.stop(t + 0.34); o2.stop(t + 0.34);
    pulse(3, bright ? 1 : 0.3);
  }
  function blip(kind) {
    if (sfx.isMuted()) return;
    if (!ensure()) return;
    if (kind === 'miss') { osc(now(), 'sawtooth', 170, 0.14, 0.1, 70); }
    else if (kind === 'fever') { sfx.melody([[659, 0.07], [880, 0.07], [1174, 0.14]]); }
    else if (kind === 'over') { sfx.melody([[523, 0.1], [392, 0.1], [330, 0.16], [262, 0.24]], 0.12); }
    else if (kind === 'start') { sfx.melody([[523, 0.07], [659, 0.07], [784, 0.07], [1046, 0.12]], 0.07); }
  }
  function pulse(lane, v) {
    if (lane < 4) energy[lane] = Math.min(1.6, energy[lane] + v);
  }
  return { ensure, play, lead, blip, now };
})();

const energy = [0, 0, 0, 0];          // 四条频谱柱的能量（kick/snare/hat/lead）
const bars = new Array(28).fill(0);

/* ==================== 状态 ==================== */
let song = songById(store.get('beat.song') || 'easy');
let chart = null;
let phase = 'intro';                  // intro | play | pause | result | fail
let mt = 0;                           // 音乐时间(秒)
let last = 0;
let mi = 0;                           // 伴奏调度指针
let score = 0, combo = 0, maxCombo = 0, hp = 100;
let fever = 0, feverT = 0;
let auto = false, slow = false;
let judged = { perfect: 0, good: 0, miss: 0 };
let pops = [], rings = [], parts = [];
let laneLit = [0, 0, 0, 0];
let keyHeld = [false, false, false, false];
let shake = 0, flash = 0, comboPop = 0;

/* ==================== HUD ==================== */
function accNow() {
  const done = judged.perfect + judged.good + judged.miss;
  if (!done || !chart) return 1;
  return (judged.perfect + judged.good * 0.6) / done;
}
function rankOf(a, failed) {
  if (failed) return 'F';
  if (a >= 0.95) return 'S';
  if (a >= 0.9) return 'A';
  if (a >= 0.8) return 'B';
  if (a >= 0.7) return 'C';
  return 'D';
}
function bump(el, text) {
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove('pop');
  el.classList.add('pop');
}
function hud() {
  bump(scoreEl, String(score));
  comboEl.textContent = String(combo);
  accEl.textContent = Math.round(accNow() * 100) + '%';
  hpEl.textContent = String(Math.max(0, Math.round(hp)));
  hpEl.classList.toggle('low', hp <= 25 && phase === 'play');
}
function songLabel() {
  return song.name + ' · ' + song.bpm + ' BPM · ' + chart.total + ' 个音';
}
function renderSongs() {
  songsEl.innerHTML = SONGS.map((s) =>
    '<button data-song="' + s.id + '" class="' + (s.id === song.id ? 'active' : '') + '">' +
    s.name + '<small>' + s.bpm + ' BPM' + '</small></button>').join('');
  nowEl.innerHTML = '♪ ' + songLabel() + ' · ' + song.feel + (num(bestKey(song.id)) ? ' · 本机 <b>' + num(bestKey(song.id)) + '</b>' : '');
}
function num(k) {
  const v = Number(store.get(k));
  return Number.isFinite(v) ? v : 0;
}

/* ==================== 遮罩 ==================== */
function show(html) { overlayContent.innerHTML = html; overlay.classList.add('show'); }
function hide() { overlay.classList.remove('show'); }

function showIntro() {
  phase = 'intro';
  chart = buildChart(song);
  hud();
  renderSongs();
  show('<div class="ov-emoji">🎵</div><h2>节拍雨</h2>' +
    '<p class="hint"><b>' + song.name + '</b> · ' + song.bpm + ' BPM · ' + song.feel + '<br>' +
    '谱面有 ' + chart.total + ' 个旋律音，伴奏是代码现场合成的<br>' +
    '<kbd>D</kbd><kbd>F</kbd><kbd>J</kbd><kbd>K</kbd> 对应四条轨，触屏点下方琴键</p>' +
    '<div class="ov-actions"><button class="primary" data-act="start">开演</button>' +
    '<button class="ghost" data-act="auto">🎧 先看一遍</button></div>');
}

function report(failed) {
  const a = accNow();
  const r = rankOf(a, failed);
  const bestK = bestKey(song.id);
  const comboK = comboKey(song.id);
  let news = false;
  if (!auto && !failed) {
    if (score > num(bestK)) { store.set(bestK, String(score)); news = true; }
    if (maxCombo > num(comboK)) store.set(comboK, String(maxCombo));
  }
  const total = judged.perfect + judged.good + judged.miss;
  const done = !failed && total >= chart.total;
  return '<div class="ov-emoji">' + (failed ? '💔' : done ? '🎉' : '⏳') + '</div>' +
    '<h2>' + (failed ? '演出中断' : done ? '一曲终了' : '提前落幕') + '</h2>' +
    '<div class="rank ' + r.toLowerCase() + '">' + r + '</div>' +
    '<div class="final-score">' + score + '<span> 分' + (news ? ' · 新纪录 🏆' : '') + '</span></div>' +
    '<div class="report">' +
    '<div><b>' + judged.perfect + '</b><span>PERFECT</span></div>' +
    '<div><b>' + judged.good + '</b><span>GOOD</span></div>' +
    '<div><b>' + judged.miss + '</b><span>MISS</span></div>' +
    '<div><b>' + maxCombo + '</b><span>最大连击</span></div>' +
    '<div><b>' + Math.round(a * 1000) / 10 + '%</b><span>准度</span></div>' +
    '<div><b>' + Math.round(mt) + 's</b><span>演奏时长</span></div>' +
    '</div>' +
    '<p class="final-sub">' + song.name + ' · ' + (auto ? '演示模式不计纪录' : '本机最高 ' + num(bestK) + ' 分 · 最长连击 ' + num(comboK)) + '</p>' +
    '<div class="ov-actions"><button class="primary" data-act="again">再演一次</button>' +
    '<button class="ghost" data-act="pick">换一首</button></div>';
}
function finish(failed) {
  if (phase === 'result' || phase === 'fail') return;
  phase = failed ? 'fail' : 'result';
  band.blip(failed ? 'over' : 'start');
  show(report(failed));
  hud();
}
function showPause() {
  phase = 'pause';
  show('<div class="ov-emoji">⏸</div><h2>已暂停</h2>' +
    '<p class="hint">' + song.name + ' · 进度 ' + Math.round((mt / chart.end) * 100) + '%</p>' +
    '<div class="ov-actions"><button class="primary" data-act="resume">继续</button>' +
    '<button class="ghost" data-act="stop">重开本曲</button></div>');
  pauseLabel.textContent = '继续';
}

/* ==================== 开局 ==================== */
function start(keepAuto) {
  chart = buildChart(song);
  phase = 'play';
  mt = 0; mi = 0;
  score = 0; combo = 0; maxCombo = 0; hp = 100;
  fever = 0; feverT = 0;
  judged = { perfect: 0, good: 0, miss: 0 };
  pops = []; rings = []; parts = [];
  laneLit = [0, 0, 0, 0];
  shake = 0; flash = 0;
  if (!keepAuto) auto = false;
  store.set('beat.song', song.id);
  band.ensure();
  band.blip('start');
  hide();
  renderSongs();
  hud();
  syncTools();
}

/* ==================== 判定 ==================== */
function mult() {
  return (1 + Math.min(combo, 60) / 60) * (feverT > 0 ? 2 : 1);
}
function popText(text, color, lane, big) {
  pops.push({ text, color, x: laneX(lane), y: HIT_Y - 46, life: big ? 0.9 : 0.62, max: big ? 0.9 : 0.62, big: !!big });
}
function burst(lane, color, n) {
  const x = laneX(lane);
  for (let i = 0; i < n; i++) {
    parts.push({ x, y: HIT_Y, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 300 - 40,
      life: 0.5 + Math.random() * 0.35, color });
  }
}
function laneX(i) { return LX0 + i * LANE_W + LANE_W / 2; }

function judgeNote(note, delta) {
  const ad = Math.abs(delta);
  const perfect = ad <= PERFECT_W;
  note.judged = true;
  note.hit = perfect ? 1 : 0.6;
  if (perfect) { judged.perfect++; combo++; }
  else { judged.good++; combo++; }
  maxCombo = Math.max(maxCombo, combo);
  const gain = Math.round((perfect ? 300 : 120) * mult());
  score += gain;
  fever = feverT > 0 ? fever : clamp(fever + (perfect ? 0.05 : 0.022), 0, 1);
  if (fever >= 1) {
    fever = 0; feverT = FEVER_LEN;
    flash = 1; band.blip('fever');
    for (let i = 0; i < LANE_N; i++) burst(i, '#f472b6', 12);
    pops.push({ text: 'FEVER!', color: '#fde68a', x: W / 2, y: HIT_Y - 150, life: 1.1, max: 1.1, big: true });
  }
  hp = Math.min(100, hp + (perfect ? 0.7 : 0.25));
  laneLit[note.lane] = 1;
  rings.push({ x: laneX(note.lane), life: 0.4, color: perfect ? LANE_HUES[note.lane] : '#94a3b8' });
  popText(perfect ? 'PERFECT' : (delta > 0 ? 'GOOD 晚' : 'GOOD 早'), perfect ? '#a7f3d0' : '#fbbf24', note.lane, perfect);
  if (combo > 2 && combo % 10 === 0) popText(combo + ' COMBO', '#ddd6fe', note.lane, true);
  band.lead(midiHz(note.midi), band.now(), perfect, true);
  comboPop = 1;
  hud();
}
function missNote(note) {
  note.judged = true;
  judged.miss++;
  combo = 0;
  hp -= 7;
  fever = clamp(fever - 0.14, 0, 1);
  shake = Math.max(shake, 0.35);
  popText('MISS', '#f87171', note.lane);
  band.lead(midiHz(note.midi), band.now(), false, false);   // 哑掉的旋律：闷、无延音
  hud();
  if (hp <= 0) { hp = 0; finish(true); }
}
function press(lane) {
  if (phase !== 'play' || lane < 0 || lane >= LANE_N) return;
  keyHeld[lane] = true;
  laneLit[lane] = Math.max(laneLit[lane], 0.55);
  const lead = chart.notes.find((n) => !n.judged && n.lane === lane && n.t - mt <= MISS_W);
  laneLit[lane] = 0.2;
  if (!lead) {                                                 // 四条轨都没音：敲空了，轻罚一下防乱拍
    combo = 0;
    hp = Math.max(0, hp - 1);
    sfx.tone(1200, 0.03, 'square', 0.05);
    hud();
    return;
  }
  const delta = mt - lead.t;
  // 差一点也没关系：音符留着不吞，等它进窗；真正漏掉的音会自己变成 MISS
  if (Math.abs(delta) <= GOOD_W) judgeNote(lead, delta);
}
function release(lane) { keyHeld[lane] = false; }

/* ==================== 推进 ==================== */
function update(dt) {
  if (phase !== 'play') return;
  const rate = slow ? 0.75 : 1;
  mt += dt * rate;

  while (mi < chart.music.length && chart.music[mi].t <= mt + 0.12) {
    const ev = chart.music[mi++];
    band.play(ev, band.now() + Math.max(0, (ev.t - mt) / rate));
  }
  for (const n of chart.notes) {
    if (n.judged) continue;
    if (n.t - mt > MISS_W) break;
    if (auto) { if (mt >= n.t) judgeNote(n, 0); }
    else if (mt - n.t > MISS_W) missNote(n);
  }
  if (feverT > 0) {
    // FEVER 时长按曲子时间走（不是墙钟）：演示/慢速档下墙钟更快，否则盖不到高潮段
    feverT = Math.max(0, feverT - dt * (slow ? 0.75 : 1));
    if (!feverT) popText('FEVER 结束', '#94a3b8', 1);
  }
  if (auto && judged.perfect + judged.good + judged.miss >= chart.total) finish(false);
  else if (mt >= chart.end) finish(false);

  for (let i = 0; i < LANE_N; i++) laneLit[i] = Math.max(0, laneLit[i] - dt * 3.2);
  for (let i = 0; i < 4; i++) energy[i] = Math.max(0, energy[i] - dt * 3.4);
  const beatIdx = Math.floor(mt / chart.beat);
  if (beatIdx !== (barsSeq | 0)) { barsSeq = beatIdx; bars.shift(); bars.push(0); }
  for (let i = 0; i < bars.length; i++) bars[i] = Math.max(0, bars[i] - dt * 2.2);
  bars[bars.length - 1] = Math.max(bars[bars.length - 1], energy[0] * 0.9 + energy[1] * 0.4);
  pops = pops.filter((p) => (p.life -= dt) > 0);
  rings = rings.filter((r) => (r.life -= dt * 2.4) > 0);
  for (const p of parts) { p.vy += 720 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  parts = parts.filter((p) => p.life > 0);
  shake = Math.max(0, shake - dt * 2.2);
  flash = Math.max(0, flash - dt * 2.6);
  comboPop = Math.max(0, comboPop - dt * 3.6);
  hud();
}
let barsSeq = 0;

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

function noteY(t) {
  const pxPerSec = (HIT_Y - SPAWN_Y) / song.scroll;
  return HIT_Y - (t - mt) * pxPerSec;
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#150a2b');
  bg.addColorStop(0.6, '#0b0f24');
  bg.addColorStop(1, '#080614');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 9, (Math.random() - 0.5) * shake * 6);

  /* 轨道底板 */
  for (let i = 0; i < LANE_N; i++) {
    const x = LX0 + i * LANE_W;
    const g = ctx.createLinearGradient(0, 0, 0, HIT_Y);
    g.addColorStop(0, 'rgba(148,163,184,0.03)');
    g.addColorStop(1, 'rgba(148,163,184,0.1)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, LANE_W, PAD_TOP);
    if (laneLit[i] > 0) {
      const lg = ctx.createLinearGradient(0, HIT_Y - 240, 0, HIT_Y);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(1, LANE_HUES[i]);
      ctx.globalAlpha = 0.16 + laneLit[i] * 0.22;
      ctx.fillStyle = lg;
      ctx.fillRect(x, HIT_Y - 240, LANE_W, 240);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(148,163,184,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, PAD_TOP);
    ctx.stroke();
  }

  /* 节拍横向网格 + 顶部频谱 */
  if (chart) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let b = 0; b < 12; b++) {
      const bt = (Math.floor(mt / chart.beat) + b) * chart.beat;
      const y = noteY(bt);
      if (y < 0 || y > HIT_Y) continue;
      ctx.beginPath();
      ctx.lineWidth = b === 0 ? 2 : 1;
      ctx.moveTo(LX0, y); ctx.lineTo(LX0 + LANE_N * LANE_W, y);
      ctx.stroke();
    }
  }
  const bw = W / bars.length;
  for (let i = 0; i < bars.length; i++) {
    const v = clamp(bars[i], 0, 1);
    ctx.fillStyle = 'rgba(167,139,250,' + (0.16 + v * 0.5).toFixed(3) + ')';
    ctx.fillRect(i * bw + 1, 26 - v * 22, bw - 2, v * 22);
  }
  ctx.fillStyle = 'rgba(8,6,20,0.72)';
  ctx.fillRect(0, 0, W, 6);
  if (chart) {
    ctx.fillStyle = '#a78bfa';
    ctx.fillRect(0, 0, W * clamp(mt / chart.end, 0, 1), 6);
  }

  /* FEVER 条 */
  const fw = LANE_N * LANE_W;
  ctx.fillStyle = 'rgba(148,163,184,0.14)';
  ctx.fillRect(LX0, 34, fw, 5);
  const fg = ctx.createLinearGradient(LX0, 0, LX0 + fw, 0);
  fg.addColorStop(0, '#f472b6');
  fg.addColorStop(1, '#fde68a');
  ctx.fillStyle = fg;
  if (feverT > 0) ctx.fillRect(LX0, 34, fw * (feverT / FEVER_LEN), 5);
  else ctx.fillRect(LX0, 34, fw * fever, 5);
  ctx.font = '700 10px -apple-system, PingFang SC, sans-serif';
  ctx.fillStyle = feverT > 0 ? '#fde68a' : 'rgba(148,163,184,0.7)';
  ctx.textAlign = 'right';
  ctx.fillText(feverT > 0 ? 'FEVER ×2' : 'FEVER ' + Math.round(fever * 100) + '%', LX0 + fw, 52);

  /* 音符 */
  if (chart) {
    for (const n of chart.notes) {
      const y = noteY(n.t);
      if (y < SPAWN_Y - 20 || y > PAD_TOP + 30) continue;
      const x = LX0 + n.lane * LANE_W;
      const h = n.strong ? 30 : 24;
      const alpha = n.judged && n.hit ? 0 : 1;
      if (alpha === 0) continue;
      ctx.globalAlpha = n.judged ? 0.28 : 1;
      const g = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
      g.addColorStop(0, n.judged ? '#64748b' : (n.strong ? '#fdf2f8' : LANE_HUES[n.lane]));
      g.addColorStop(1, n.judged ? '#334155' : LANE_HUES[n.lane]);
      ctx.fillStyle = g;
      roundRect(x + 9, y - h / 2, LANE_W - 18, h, 8);
      ctx.fill();
      if (!n.judged && (feverT > 0 || n.strong)) {
        ctx.strokeStyle = 'rgba(253,224,71,0.85)';
        ctx.lineWidth = 2;
        roundRect(x + 9, y - h / 2, LANE_W - 18, h, 8);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* 判定线 */
  const hg = ctx.createLinearGradient(LX0, 0, LX0 + LANE_N * LANE_W, 0);
  hg.addColorStop(0, '#22d3ee');
  hg.addColorStop(0.5, feverT > 0 ? '#fde68a' : '#f472b6');
  hg.addColorStop(1, '#a78bfa');
  ctx.strokeStyle = hg;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(LX0, HIT_Y); ctx.lineTo(LX0 + LANE_N * LANE_W, HIT_Y);
  ctx.stroke();
  for (const r of rings) {
    ctx.globalAlpha = clamp(r.life, 0, 1) * 0.8;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, HIT_Y, (1 - r.life) * 46 + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* 琴键（触屏区） */
  for (let i = 0; i < LANE_N; i++) {
    const x = LX0 + i * LANE_W;
    const held = keyHeld[i] || laneLit[i] > 0.3;
    ctx.fillStyle = held ? LANE_HUES[i] : 'rgba(148,163,184,0.1)';
    ctx.globalAlpha = held ? 0.32 : 1;
    roundRect(x + 6, PAD_TOP, LANE_W - 12, PAD_BOT - PAD_TOP, 12);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = held ? LANE_HUES[i] : 'rgba(148,163,184,0.26)';
    ctx.lineWidth = held ? 2 : 1;
    roundRect(x + 6, PAD_TOP, LANE_W - 12, PAD_BOT - PAD_TOP, 12);
    ctx.stroke();
    ctx.fillStyle = held ? '#fff' : 'rgba(226,232,240,0.55)';
    ctx.font = '800 21px -apple-system, PingFang SC, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(KEYS[i].toUpperCase(), x + LANE_W / 2, PAD_TOP + 44);
    ctx.font = '600 10px -apple-system, PingFang SC, sans-serif';
    ctx.fillStyle = 'rgba(148,163,184,0.6)';
    ctx.fillText(['1 指', '2 指', '3 指', '4 指'][i], x + LANE_W / 2, PAD_TOP + 64);
  }

  /* 连击 */
  if (combo > 1) {
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.9;
    ctx.font = '900 ' + Math.round(46 + comboPop * 12) + 'px -apple-system, PingFang SC, sans-serif';
    ctx.fillStyle = feverT > 0 ? '#fde68a' : '#ddd6fe';
    ctx.fillText(String(combo), W / 2, HIT_Y - 118);
    ctx.font = '700 11px -apple-system, PingFang SC, sans-serif';
    ctx.fillStyle = 'rgba(148,163,184,0.75)';
    ctx.fillText('COMBO', W / 2, HIT_Y - 102);
    ctx.globalAlpha = 1;
  }

  /* 判定文字 */
  for (const p of pops) {
    const k = p.life / p.max;
    ctx.globalAlpha = clamp(k * 1.4, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = (p.big ? '900 22px ' : '800 14px ') + '-apple-system, PingFang SC, sans-serif';
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y - (1 - k) * 26);
    ctx.globalAlpha = 1;
  }

  /* 粒子 */
  for (const p of parts) {
    ctx.globalAlpha = clamp(p.life * 1.8, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    ctx.globalAlpha = 1;
  }

  if (flash > 0) {
    ctx.fillStyle = 'rgba(253,224,71,' + (flash * 0.16).toFixed(3) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();

  if (auto && phase === 'play') {
    ctx.fillStyle = 'rgba(253,224,71,0.9)';
    ctx.font = '800 12px -apple-system, PingFang SC, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🎧 演示模式 · 不计纪录', LX0, H - 12);
  }
  if (slow && phase === 'play') {
    ctx.fillStyle = 'rgba(103,232,249,0.9)';
    ctx.font = '800 12px -apple-system, PingFang SC, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('🐢 0.75×', W - LX0, H - 12);
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ==================== 主循环 ==================== */
function frame(t) {
  requestAnimationFrame(frame);
  const now = t || 0;
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0));
  last = now;
  update(dt);
  draw();
}

/* ==================== 交互 ==================== */
function syncTools() {
  autoState.textContent = auto ? '开' : '关';
  btnAuto.classList.toggle('on', auto);
  slowState.textContent = slow ? '0.75×' : '关';
  btnSlow.classList.toggle('on', slow);
  pauseLabel.textContent = phase === 'pause' ? '继续' : '暂停';
}
function setSong(id) {
  song = songById(id);
  auto = false;
  showIntro();
}

btnSound.addEventListener('click', () => {
  btnSound.textContent = sfx.toggle() ? '🔇' : '🔊';
});
btnNew.addEventListener('click', () => { band.ensure(); start(false); });
btnAuto.addEventListener('click', () => {
  auto = !auto;
  band.ensure();
  start(true);
  syncTools();
});
btnSlow.addEventListener('click', () => {
  slow = !slow;
  syncTools();
  hud();
});
btnPause.addEventListener('click', () => {
  if (phase === 'play') showPause();
  else if (phase === 'pause') { phase = 'play'; hide(); syncTools(); }
});
songsEl.addEventListener('click', (e) => {
  const btn = e.target.closest ? e.target.closest('[data-song]') : null;
  if (btn) { band.ensure(); setSong(btn.dataset.song); }
});
overlay.addEventListener('click', (e) => {
  const btn = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!btn) return;
  band.ensure();
  const act = btn.dataset.act;
  if (act === 'start') start(false);
  else if (act === 'auto') { auto = true; start(true); syncTools(); }
  else if (act === 'again') start(auto);
  else if (act === 'pick') { auto = false; syncTools(); showIntro(); }
  else if (act === 'resume') { phase = 'play'; hide(); syncTools(); }
  else if (act === 'stop') start(auto);
});

/* 触屏 / 鼠标：下方琴键区按列判定，轨道区也允许（更直觉） */
function laneFromEvent(e) {
  const rect = cv.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / (rect.width || W)) * W;
  const i = Math.floor((x - LX0) / LANE_W);
  return clamp(i, 0, LANE_N - 1);
}
cv.addEventListener('pointerdown', (e) => {
  band.ensure();
  if (phase === 'intro') { start(false); return; }
  if (phase === 'pause') { phase = 'play'; hide(); syncTools(); return; }
  const lane = laneFromEvent(e);
  press(lane);
  if (cv.setPointerCapture && e.pointerId != null) { try { cv.setPointerCapture(e.pointerId); } catch (err) {} }
});
cv.addEventListener('pointerup', () => { for (let i = 0; i < LANE_N; i++) release(i); });
cv.addEventListener('pointercancel', () => { for (let i = 0; i < LANE_N; i++) release(i); });

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = (e.key || '').toLowerCase();
  const idx = KEYS.indexOf(k);
  if (idx >= 0) {
    band.ensure();
    if (phase === 'intro') start(false);
    press(idx);
    e.preventDefault();
    return;
  }
  if (k === 'p') {
    if (phase === 'play') showPause();
    else if (phase === 'pause') { phase = 'play'; hide(); syncTools(); }
  } else if (k === ' ' || k === 'enter') {
    if (phase === 'intro' || phase === 'result' || phase === 'fail') { band.ensure(); start(auto); }
    else if (phase === 'play') showPause();
    e.preventDefault();
  } else if (k === 'n') { band.ensure(); start(false); }
  else if (k === '1' || k === '2' || k === '3') setSong(SONGS[+k - 1].id);
});
window.addEventListener('keyup', (e) => {
  const idx = KEYS.indexOf((e.key || '').toLowerCase());
  if (idx >= 0) release(idx);
});
window.addEventListener('blur', () => { if (phase === 'play') showPause(); });

/* ==================== 启动 ==================== */
resize();
window.addEventListener('resize', resize);
showIntro();
syncTools();
requestAnimationFrame((t) => { last = t; frame(t); });

})();
