/* 共享音效层 —— 新游戏直接用，老游戏保留各自的副本（避免回归风险）
   用法：<script src="../shared/sfx.js"></script>
         const sfx = Sfx.create({ storageKey: 'mygame.muted' });
         sfx.tone(440, 0.08);                       // 单音
         sfx.tone(220, 0.2, 'sawtooth', 0.2, 0, 60); // 滑音
         sfx.noise(0.12, 0.1);                       // 白噪(爆炸/撞击)
         sfx.melody([[523, 0.09], [659, 0.09], [784, 0.16]]);
         sfx.toggle();                               // 返回静音后的新状态
   浏览器要求用户手势后才允许出声，首次交互时调用 sfx.resume()。 */
(function (global) {
'use strict';

function create(opts) {
  const o = opts || {};
  const storageKey = o.storageKey || null;
  let muted = false;
  if (storageKey) {
    try { muted = localStorage.getItem(storageKey) === '1'; } catch (e) { muted = false; }
  }

  let ctx = null;
  function resume() {
    try {
      if (!ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
    return ctx;
  }
  function at(delay) { return ctx.currentTime + (delay || 0); }

  function tone(freq, dur, type, vol, delay, slideTo) {
    if (muted) return;
    dur = dur || 0.1;
    if (!ctx && !resume()) return;
    type = type || 'sine';
    vol = vol == null ? 0.15 : vol;
    delay = delay || 0;
    try {
      const t0 = at(delay);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (e) { /* 音频不可用时静默 */ }
  }

  function noise(dur, vol, delay) {
    if (muted) return;
    dur = dur || 0.12;
    if (!ctx && !resume()) return;
    vol = vol == null ? 0.12 : vol;
    try {
      const t0 = at(delay);
      const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buf;
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(gain).connect(ctx.destination);
      src.start(t0);
    } catch (e) { /* 同上 */ }
  }

  function melody(notes, gap) {
    if (muted || !notes || !notes.length) return;
    gap = gap == null ? 0.07 : gap;
    let t = 0;
    for (const n of notes) {
      const freq = Array.isArray(n) ? n[0] : n;
      const dur = Array.isArray(n) ? (n[1] || 0.1) : 0.1;
      tone(freq, dur, 'square', 0.13, t);
      t += gap;
    }
  }

  function persist() {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, muted ? '1' : '0'); } catch (e) { /* 忽略 */ }
  }
  function setMuted(v) { muted = !!v; persist(); return muted; }

  return {
    tone, noise, melody, setMuted,
    isMuted: () => muted,
    toggle: () => setMuted(!muted),
    resume,
  };
}

global.Sfx = { create };
})(typeof window !== 'undefined' ? window : this);
