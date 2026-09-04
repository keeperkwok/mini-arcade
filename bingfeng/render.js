'use strict';

// ===================== 预渲染精灵 =====================
const bulletSprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 28;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(14, 14, 1, 14, 14, 13);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.35, '#ffe9a8');
  gr.addColorStop(0.7, 'rgba(255,170,60,0.55)');
  gr.addColorStop(1, 'rgba(255,150,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 28, 28);
  return c;
})();
const laserSprite = (() => {
  const c = document.createElement('canvas');
  c.width = 18; c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 18, 0);
  gr.addColorStop(0, 'rgba(120,240,255,0)');
  gr.addColorStop(0.5, '#e0fbff');
  gr.addColorStop(1, 'rgba(120,240,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 18, 64);
  g.fillStyle = '#ffffff';
  g.fillRect(8, 0, 2, 64);
  return c;
})();
const eBulletSprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 22;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(11, 11, 1, 11, 11, 10);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.4, '#ff80ab');
  gr.addColorStop(1, 'rgba(233,30,99,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 22, 22);
  return c;
})();

// ===================== 天空 =====================
function drawSky() {
  const p = palette();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, p.top);
  g.addColorStop(1, p.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (p.name === 'night') {
    ensureStars();
    for (const s of skyStars) {
      ctx.globalAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 2 + s.ph));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H * 0.8, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const mx = W * 0.82, my = H * 0.14;
    ctx.fillStyle = '#f4f6ff';
    ctx.beginPath(); ctx.arc(mx, my, 26, 0, TAU); ctx.fill();
    ctx.fillStyle = p.top;
    ctx.beginPath(); ctx.arc(mx + 10, my - 6, 22, 0, TAU); ctx.fill();
  } else {
    const sx = W * 0.84, sy = p.name === 'sunset' ? H * 0.26 : H * 0.12;
    const sr = p.name === 'sunset' ? 46 : 34;
    const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, sr * 3.2);
    sg.addColorStop(0, 'rgba(255,250,220,0.95)');
    sg.addColorStop(0.3, 'rgba(255,235,150,0.35)');
    sg.addColorStop(1, 'rgba(255,235,150,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sx, sy, sr * 3.2, 0, TAU); ctx.fill();
    ctx.fillStyle = p.sun;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
  }
}

// ===================== 场景绘制 =====================
function drawIslands() {
  for (const s of islands) {
    ctx.drawImage(s.img, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
  }
}
function drawFarClouds() {
  for (const c of farClouds) ctx.drawImage(c.img, c.x - c.img.width / 2, c.y - c.img.width / 2);
}
function drawNearClouds() {
  for (const c of nearClouds) ctx.drawImage(c.img, c.x - c.img.width / 2, c.y - c.img.width / 2);
}
function drawBellClouds() {
  for (const c of bellClouds) {
    const bobY = c.y + Math.sin(c.t * 1.4 + c.ph) * 3;
    const L = c.spr.L;
    ctx.drawImage(c.spr.img, c.x - L / 2, bobY - L / 2, L, L);
    if (c.flash > 0) {
      ctx.save();
      ctx.globalAlpha = c.flash * 0.6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(c.spr.img, c.x - L / 2, bobY - L / 2, L, L);
      ctx.restore();
    }
  }
}

// ===================== 铃铛与星星 =====================
function drawBellShape(g, x, y, colorIdx, t, flash, scale) {
  const col = BELL_COLORS[colorIdx];
  g.save();
  g.translate(x, y);
  g.rotate(Math.sin(t * 3) * 0.18);
  g.scale(scale || 1, scale || 1);
  const gl = g.createRadialGradient(0, 0, 2, 0, 0, 26);
  gl.addColorStop(0, col.glow);
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl;
  g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.fill();
  const bg = g.createLinearGradient(-12, -12, 12, 10);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(0.25, col.main);
  bg.addColorStop(1, col.dark);
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(0, -13);
  g.bezierCurveTo(9, -13, 11, -4, 11, 3);
  g.lineTo(13, 6);
  g.lineTo(-13, 6);
  g.lineTo(-11, 3);
  g.bezierCurveTo(-11, -4, -9, -13, 0, -13);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(60,40,0,0.35)'; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = col.dark;
  g.fillRect(-13, 5, 26, 3.4);
  g.beginPath(); g.arc(0, 10, 3, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.beginPath(); g.ellipse(-4.5, -6, 2, 4.5, -0.35, 0, TAU); g.fill();
  if (flash > 0) {
    g.globalAlpha = flash * 0.8;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(0, -2, 15, 0, TAU); g.fill();
  }
  g.restore();
}
function drawBells() {
  for (const b of bells) drawBellShape(ctx, b.x, b.y, b.color, b.t, b.flash, 1);
}
function drawStarShape(g, x, y, r, rot, color) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = i / 10 * TAU - Math.PI / 2;
    if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = color || '#ffd54f';
  g.fill();
  g.strokeStyle = '#f57f17'; g.lineWidth = 1.5; g.stroke();
  g.restore();
}
function drawStars() {
  for (const s of stars) {
    ctx.save();
    const gl = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 24);
    gl.addColorStop(0, 'rgba(255,235,130,0.6)');
    gl.addColorStop(1, 'rgba(255,235,130,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(s.x, s.y, 24, 0, TAU); ctx.fill();
    ctx.restore();
    drawStarShape(ctx, s.x, s.y, 12, s.t * 3, '#ffd54f');
  }
}

// ===================== 玩家 =====================
function drawPlayerSprite(g, x, y, s, bank, opts) {
  opts = opts || {};
  g.save();
  g.translate(x, y);
  g.rotate(bank * 0.25);
  g.scale(s * (1 - Math.abs(bank) * 0.12), s);
  if (!opts.noFlame) {
    const fl = 10 + Math.sin(time * 40 + x) * 3 + (opts.thrust || 0);
    const fg = g.createLinearGradient(0, 20, 0, 28 + fl);
    fg.addColorStop(0, 'rgba(255,235,130,0.95)');
    fg.addColorStop(1, 'rgba(255,90,40,0)');
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(-4, 19);
    g.quadraticCurveTo(0, 28 + fl, 4, 19);
    g.closePath(); g.fill();
  }
  g.lineWidth = 1.2; g.strokeStyle = '#8fa3b8';
  for (const dir of [-1, 1]) {
    g.fillStyle = '#f2f6fb';
    g.beginPath();
    g.moveTo(dir * 6, 0);
    g.quadraticCurveTo(dir * 20, 4, dir * 30, 12);
    g.quadraticCurveTo(dir * 33, 14, dir * 30, 17);
    g.quadraticCurveTo(dir * 16, 16, dir * 6, 11);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ff5252';
    g.beginPath();
    g.moveTo(dir * 27, 10.5);
    g.lineTo(dir * 33, 14);
    g.lineTo(dir * 30, 17);
    g.lineTo(dir * 25.5, 14.5);
    g.closePath(); g.fill();
  }
  g.fillStyle = '#ff5252';
  g.beginPath(); g.moveTo(-6, 12); g.lineTo(-13, 22); g.lineTo(-5, 20); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(6, 12); g.lineTo(13, 22); g.lineTo(5, 20); g.closePath(); g.fill();
  const bg = g.createLinearGradient(-10, 0, 10, 0);
  bg.addColorStop(0, '#c9d8ea');
  bg.addColorStop(0.35, '#ffffff');
  bg.addColorStop(0.75, '#eef4fb');
  bg.addColorStop(1, '#b9c9dd');
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(0, -25);
  g.bezierCurveTo(7, -20, 9, -8, 9, 4);
  g.bezierCurveTo(9, 13, 6, 19, 0, 20);
  g.bezierCurveTo(-6, 19, -9, 13, -9, 4);
  g.bezierCurveTo(-9, -8, -7, -20, 0, -25);
  g.closePath(); g.fill();
  g.strokeStyle = '#7d92a8'; g.lineWidth = 1.4; g.stroke();
  const ng = g.createLinearGradient(0, -26, 0, -12);
  ng.addColorStop(0, '#ff8a80');
  ng.addColorStop(1, '#e53935');
  g.fillStyle = ng;
  g.beginPath();
  g.moveTo(0, -25);
  g.bezierCurveTo(6.5, -20.5, 7.6, -16, 7.8, -12);
  g.quadraticCurveTo(0, -8.5, -7.8, -12);
  g.bezierCurveTo(-7.6, -16, -6.5, -20.5, 0, -25);
  g.closePath(); g.fill();
  const cg = g.createLinearGradient(0, -10, 0, 6);
  cg.addColorStop(0, '#d9f2ff');
  cg.addColorStop(1, '#2f86d6');
  g.fillStyle = cg;
  g.beginPath(); g.ellipse(0, -2, 4.6, 7.5, 0, 0, TAU); g.fill();
  g.strokeStyle = '#1b5e9e'; g.lineWidth = 1; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.ellipse(-1.6, -5, 1.3, 2.2, -0.4, 0, TAU); g.fill();
  g.restore();
}
function drawPlayer() {
  if (!player.alive) return;
  const blink = player.invT > 0 && Math.floor(player.invT * 12) % 2 === 0;
  ctx.save();
  if (blink) ctx.globalAlpha = 0.35;
  drawPlayerSprite(ctx, player.x, player.y, 1.05, player.bank, { thrust: Math.abs(player.vx) * 0.02 });
  ctx.restore();
  if (player.barrier > 0) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(time * 1.8);
    ctx.strokeStyle = 'rgba(105,210,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([14, 9]);
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(105,210,255,0.10)';
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ===================== 敌机绘制 =====================
function enemyFlash(e, rx, ry) {
  if (e.flash <= 0) return;
  ctx.globalAlpha = e.flash * 0.7;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}
function drawBird(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const flap = Math.sin(e.t * 13) * 0.7;
  ctx.rotate(Math.sin(e.t * 2) * 0.06);
  ctx.fillStyle = '#ff8a80';
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.rotate(dir * flap * 0.5);
    ctx.beginPath();
    ctx.moveTo(dir * 6, -2);
    ctx.quadraticCurveTo(dir * 20, -10 - flap * 6, dir * 24, -2);
    ctx.quadraticCurveTo(dir * 16, 4, dir * 6, 3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  const g = ctx.createRadialGradient(-3, -4, 2, 0, 0, 14);
  g.addColorStop(0, '#ffc4bd');
  g.addColorStop(1, '#f4511e');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 11, 13, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffe9e0';
  ctx.beginPath(); ctx.ellipse(0, 4, 6.5, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-3.5, -5, 3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(3.5, -5, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#333333';
  ctx.beginPath(); ctx.arc(-3.5, -4.5, 1.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(3.5, -4.5, 1.4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffb300';
  ctx.beginPath(); ctx.moveTo(-2.5, -1); ctx.lineTo(2.5, -1); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
  enemyFlash(e, 12, 14);
  ctx.restore();
}
function drawEye(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const pulse = 1 + Math.sin(e.t * 5) * 0.05;
  ctx.scale(pulse, pulse);
  const g = ctx.createRadialGradient(-5, -6, 3, 0, 0, 18);
  g.addColorStop(0, '#d1b3ff');
  g.addColorStop(1, '#6a3ab2');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4527a0'; ctx.lineWidth = 1.5; ctx.stroke();
  const a = player.alive ? Math.atan2(player.y - e.y, player.x - e.x) : Math.PI / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 10, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#333333';
  ctx.beginPath(); ctx.arc(Math.cos(a) * 3.5, Math.sin(a) * 3.5, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(Math.cos(a) * 3.5 - 1.5, Math.sin(a) * 3.5 - 1.5, 1.3, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4527a0'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-8, -12); ctx.lineTo(-2, -9);
  ctx.moveTo(8, -12); ctx.lineTo(2, -9);
  ctx.stroke();
  enemyFlash(e, 17, 17);
  ctx.restore();
}
function drawDrone(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(Math.atan2(e.vy, e.vx) - Math.PI / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.ellipse(-10, 0, 7, 3, 0.5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(10, 0, 7, 3, -0.5, 0, TAU); ctx.fill();
  const g = ctx.createLinearGradient(-7, 0, 7, 0);
  g.addColorStop(0, '#ffd54f');
  g.addColorStop(1, '#ff8f00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4e342e';
  ctx.fillRect(-7, -4, 14, 3);
  ctx.fillRect(-7, 2, 14, 3);
  ctx.fillStyle = '#e53935';
  ctx.beginPath(); ctx.moveTo(-4, 10); ctx.quadraticCurveTo(0, 16, 4, 10); ctx.closePath(); ctx.fill();
  enemyFlash(e, 9, 13);
  ctx.restore();
}
function drawPotato(e) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(e.x + 4, e.y + 14, 14, 5, 0, 0, TAU); ctx.fill();
  ctx.translate(e.x, e.y);
  ctx.rotate(Math.sin(e.t * 6) * 0.08);
  const g = ctx.createRadialGradient(-4, -5, 2, 0, 0, 16);
  g.addColorStop(0, '#e8c39e');
  g.addColorStop(1, '#a9743f');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 13, 15, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#7c4a1e'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = 'rgba(124,74,30,0.5)';
  ctx.beginPath(); ctx.arc(-5, 4, 2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -3, 1.8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-4, -5, 3.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -5, 3.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.arc(-4, -4.5, 1.5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(4, -4.5, 1.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7c4a1e';
  const step = Math.sin(e.t * 10) * 2;
  ctx.beginPath(); ctx.ellipse(-5, 14 + step * 0.5, 3, 2, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(5, 14 - step * 0.5, 3, 2, 0, 0, TAU); ctx.fill();
  enemyFlash(e, 14, 16);
  ctx.restore();
}
function drawTomato(e) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(e.x + 4, e.y + 14, 14, 5, 0, 0, TAU); ctx.fill();
  ctx.translate(e.x, e.y);
  const squash = e.shootT < 0.4 ? (0.4 - e.shootT) * 0.4 : 0;
  ctx.scale(1 + squash, 1 - squash);
  const g = ctx.createRadialGradient(-4, -5, 2, 0, 0, 16);
  g.addColorStop(0, '#ff8a65');
  g.addColorStop(1, '#d32f2f');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#8e1c1c'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = '#43a047';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.5;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 6, -12 + Math.sin(a) * 2, 5, 2.4, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-4.5, -3, 3.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(4.5, -3, 3.4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath(); ctx.arc(-4.5, -2.5, 1.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(4.5, -2.5, 1.6, 0, TAU); ctx.fill();
  enemyFlash(e, 15, 15);
  ctx.restore();
}
function drawGroundEnemies() {
  for (const e of enemies) {
    if (e.flying) continue;
    if (e.type === 'potato') drawPotato(e); else drawTomato(e);
  }
}
function drawFlyingEnemies() {
  for (const e of enemies) {
    if (!e.flying) continue;
    if (e.type === 'bird') drawBird(e);
    else if (e.type === 'eye') drawEye(e);
    else drawDrone(e);
  }
}

// ===================== BOSS 绘制 =====================
function drawBoss() {
  if (!boss) return;
  const b = boss;
  ctx.save();
  ctx.translate(b.x, b.y + Math.sin(b.t * 1.5) * 2);
  const hg = ctx.createLinearGradient(0, -40, 0, 40);
  hg.addColorStop(0, '#eceff1');
  hg.addColorStop(0.5, '#90a4ae');
  hg.addColorStop(1, '#546e7a');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.ellipse(0, 8, 95, 30, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#37474f'; ctx.lineWidth = 2; ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + b.t * 1.2;
    const lx = Math.cos(a) * 78, ly = 8 + Math.sin(a) * 22;
    ctx.fillStyle = (Math.floor(b.t * 4 + i) % 2) ? '#ffeb3b' : '#ff5252';
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, TAU); ctx.fill();
  }
  const dg = ctx.createRadialGradient(-15, -30, 5, 0, -18, 45);
  dg.addColorStop(0, 'rgba(224,247,255,0.95)');
  dg.addColorStop(1, 'rgba(41,121,255,0.55)');
  ctx.fillStyle = dg;
  ctx.beginPath(); ctx.ellipse(0, -8, 42, 36, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  const ea = player.alive ? Math.atan2(player.y - b.y, player.x - b.x) : Math.PI / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0, -22, 13, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d32f2f';
  ctx.beginPath(); ctx.arc(Math.cos(ea) * 4, -22 + Math.sin(ea) * 4, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.beginPath(); ctx.arc(Math.cos(ea) * 5, -22 + Math.sin(ea) * 5, 3.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#455a64';
  ctx.fillRect(-88, 2, 18, 14);
  ctx.fillRect(70, 2, 18, 14);
  ctx.fillStyle = '#263238';
  ctx.fillRect(-84, 14, 10, 10);
  ctx.fillRect(74, 14, 10, 10);
  if (b.flash > 0) {
    ctx.globalAlpha = b.flash * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(0, 0, 98, 42, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ===================== 子弹与特效 =====================
function drawBullets() {
  for (const b of pBullets) {
    if (b.kind === 'laser') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(laserSprite, b.x - 9, b.y - 32, 18, 64);
      ctx.restore();
    } else {
      ctx.drawImage(bulletSprite, b.x - 14, b.y - 14);
    }
  }
}
function drawEnemyBullets() {
  for (const b of eBullets) ctx.drawImage(eBulletSprite, b.x - 11, b.y - 11);
}
function drawParticles() {
  for (const p of particles) {
    const k = 1 - p.t / p.life;
    if (p.ring) {
      ctx.globalAlpha = k;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2 + k * 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
    } else if (p.color === 'smoke') {
      ctx.globalAlpha = k * 0.3;
      ctx.fillStyle = '#eceff1';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + p.t * 2), 0, TAU); ctx.fill();
    } else {
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.r * k), 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function outlineText(text, x, y, color) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(20,30,50,0.55)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
function drawPopups() {
  ctx.textAlign = 'center';
  for (const p of popups) {
    const k = p.t / 1.1;
    ctx.globalAlpha = 1 - k;
    ctx.font = (p.big ? 'bold 26px ' : 'bold 15px ') + FONT;
    outlineText(p.text, p.x, p.y - k * 36, p.color);
  }
  ctx.globalAlpha = 1;
}

// ===================== 画布内 HUD =====================
function drawHUD() {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px ' + FONT;
  outlineText('STAGE ' + stage + ' · ' + stageSubtitle(stage), W / 2, 24, '#ffffff');
  if (boss && !boss.dying) {
    const bw = Math.min(320, W - 140), bx = W / 2 - bw / 2, by = 36;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
    const frac = clamp(boss.hp / boss.maxHp, 0, 1);
    const bg2 = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    bg2.addColorStop(0, '#ff8a65');
    bg2.addColorStop(1, '#e53935');
    ctx.fillStyle = bg2;
    ctx.fillRect(bx, by, bw * frac, 8);
    ctx.font = 'bold 10px ' + FONT;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText('BOSS', bx - 8, by + 8);
    ctx.textAlign = 'center';
  }
  if (bellChain > 0 && chainTimer > 0) {
    drawBellShape(ctx, W / 2 - 52, 68, 0, time, 0, 0.75);
    ctx.font = 'bold 16px ' + FONT;
    outlineText('连击 x' + bellChain, W / 2 + 6, 74, '#ffe082');
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(W / 2 - 40, 82, 80 * (chainTimer / 5), 3);
  }
  let px = 14, py = H - 22;
  for (let i = 0; i < player.speedLv; i++) drawStarShape(ctx, px + 10 + i * 20, py, 8, time * 2, '#ffd54f');
  px += 10 + 3 * 20 + 8;
  ctx.font = 'bold 13px ' + FONT;
  ctx.textAlign = 'left';
  outlineText('火力 ' + ['I', 'II', 'III'][player.weaponLv], px, py + 5, '#4fc3f7');
  px += 62;
  if (player.laser) { outlineText('激光', px, py + 5, '#ef5350'); px += 44; }
  if (player.barrier > 0) outlineText('护盾x' + player.barrier, px, py + 5, '#b3e5fc');
  ctx.restore();
}
function drawWarning() {
  const a = Math.sin(time * 12) * 0.5 + 0.5;
  ctx.fillStyle = 'rgba(229,57,53,' + (0.12 + a * 0.12) + ')';
  ctx.fillRect(0, 0, W, 70);
  ctx.fillRect(0, H - 70, W, 70);
  ctx.textAlign = 'center';
  ctx.font = 'bold 38px ' + FONT;
  ctx.globalAlpha = 0.5 + a * 0.5;
  outlineText('!! WARNING !!', W / 2, H * 0.4, '#ff5252');
  ctx.font = 'bold 17px ' + FONT;
  outlineText('BOSS 接近中…', W / 2, H * 0.4 + 32, '#ffcdd2');
  ctx.globalAlpha = 1;
}
function drawBanner() {
  const b = banner;
  const k = clamp(Math.min(1, b.t * 2.5, (b.dur - b.t) * 1.8), 0, 1);
  ctx.save();
  ctx.globalAlpha = k;
  ctx.textAlign = 'center';
  ctx.font = 'bold 50px ' + FONT;
  outlineText(b.text, W / 2, H * 0.42, '#ffffff');
  ctx.font = 'bold 20px ' + FONT;
  outlineText(b.sub, W / 2, H * 0.42 + 36, '#ffe082');
  ctx.restore();
}

// ===================== 画面：标题 / 结算 / 暂停 =====================
function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawTitle() {
  ctx.fillStyle = 'rgba(15,30,60,0.30)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.24 + Math.sin(time * 1.6) * 5;
  for (let i = 0; i < 3; i++) {
    const a = time * 0.9 + i * TAU / 3;
    drawBellShape(ctx, cx + Math.cos(a) * Math.min(190, W * 0.32), cy + Math.sin(a) * 30 + 30, ((i + Math.floor(time / 2)) % 4 + 4) % 4, time + i, 0, 0.85);
  }
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.font = 'bold ' + Math.min(58, W * 0.11) + 'px ' + FONT;
  const lg = ctx.createLinearGradient(0, -46, 0, 16);
  lg.addColorStop(0, '#ffffff');
  lg.addColorStop(0.55, '#ffe082');
  lg.addColorStop(1, '#ff9800');
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(120,60,10,0.9)';
  ctx.strokeText('兵蜂大作战', 0, 0);
  ctx.fillStyle = lg;
  ctx.fillText('兵蜂大作战', 0, 0);
  ctx.font = 'bold 14px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText('TWINBEE 风格 · 云端铃铛射击', 0, 28);
  ctx.restore();
  drawPlayerSprite(ctx, cx, H * 0.5 + Math.sin(time * 2.2) * 7, 1.15, Math.sin(time * 1.3) * 0.25, {});
  const pw = Math.min(470, W - 36), ph = 132, px = cx - pw / 2, py = H * 0.615;
  ctx.fillStyle = 'rgba(12,28,54,0.55)';
  roundRectPath(px, py, pw, ph, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5;
  roundRectPath(px, py, pw, ph, 14); ctx.stroke();
  ctx.font = '13.5px ' + FONT;
  ctx.fillStyle = '#e3f2fd';
  const lines = [
    '方向键 / WASD 移动 · 空格或 J 射击(按住连发)',
    '触屏：按住拖动移动 · 自动射击',
    '射击云朵放出铃铛 · 打铃铛变色 · 接住变强',
    '黄=分数 蓝=散射 红=激光 白=护盾 · ⭐ 加速',
  ];
  lines.forEach((s, i) => ctx.fillText(s, cx, py + 30 + i * 26));
  ctx.globalAlpha = 0.55 + Math.sin(time * 3.5) * 0.45;
  ctx.font = 'bold 21px ' + FONT;
  ctx.fillStyle = '#fff176';
  ctx.fillText('点击画面 或 按 回车 开始', cx, H * 0.9);
  ctx.globalAlpha = 1;
  ctx.font = '12.5px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('最高分 ' + best, cx, H * 0.94);
}
function drawOver() {
  ctx.fillStyle = 'rgba(25,10,35,0.55)';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  ctx.textAlign = 'center';
  ctx.font = 'bold ' + Math.min(54, W * 0.1) + 'px ' + FONT;
  const g = ctx.createLinearGradient(0, H * 0.3 - 40, 0, H * 0.3 + 10);
  g.addColorStop(0, '#ffcdd2');
  g.addColorStop(1, '#e53935');
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(60,10,20,0.9)';
  ctx.strokeText('游戏结束', cx, H * 0.3);
  ctx.fillStyle = g;
  ctx.fillText('游戏结束', cx, H * 0.3);
  ctx.font = 'bold 24px ' + FONT;
  outlineText('得分  ' + score, cx, H * 0.42, '#ffffff');
  outlineText('最高分  ' + best, cx, H * 0.42 + 34, 'rgba(255,255,255,0.85)');
  if (newRecord) {
    ctx.save();
    ctx.translate(cx, H * 0.42 + 76);
    ctx.rotate(Math.sin(time * 3) * 0.06);
    drawStarShape(ctx, -64, -7, 12, time * 2, '#ffd54f');
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillStyle = '#ffd54f';
    ctx.fillText('新纪录!', 10, 0);
    ctx.restore();
  }
  if (overT > 0.8) {
    ctx.globalAlpha = 0.55 + Math.sin(time * 3.5) * 0.45;
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillStyle = '#fff176';
    ctx.fillText('点击 或 按 回车 再来一局', cx, H * 0.76);
    ctx.globalAlpha = 1;
  }
}
function drawPaused() {
  ctx.fillStyle = 'rgba(10,20,40,0.5)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px ' + FONT;
  outlineText('已暂停', W / 2, H / 2, '#ffffff');
  ctx.font = '15px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('按 P 或点击画面继续', W / 2, H / 2 + 34);
}

// ===================== 总渲染 =====================
function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
  drawSky();
  drawIslands();
  drawFarClouds();
  drawGroundEnemies();
  drawBellClouds();
  drawStars();
  drawBells();
  drawFlyingEnemies();
  drawBoss();
  drawBullets();
  drawPlayer();
  drawEnemyBullets();
  drawParticles();
  drawNearClouds();
  drawPopups();
  ctx.restore();
  const p = palette();
  if (p.tint) { ctx.fillStyle = p.tint; ctx.fillRect(0, 0, W, H); }
  if (flashA > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + flashA + ')';
    ctx.fillRect(0, 0, W, H);
  }
  if (warnT > 0 && state === STATE.PLAYING) drawWarning();
  if (state === STATE.PLAYING || state === STATE.PAUSED) drawHUD();
  if (banner && state === STATE.PLAYING) drawBanner();
  if (state === STATE.TITLE) drawTitle();
  if (state === STATE.OVER) drawOver();
  if (state === STATE.PAUSED) drawPaused();
}

// ===================== 环境动画（非战斗画面） =====================
function updateAmbient(dt, slow) {
  updateGround(dt * (slow ? 0.6 : 1));
  updateDecor(dt);
  updateParticles(dt);
  updatePopups(dt);
}

// ===================== 主循环 =====================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0;
  if (dt > 0.05) dt = 0.05;
  time += dt;
  if (state === STATE.PLAYING) update(dt);
  else if (state === STATE.TITLE) updateAmbient(dt, false);
  else if (state === STATE.OVER) { overT += dt; updateAmbient(dt, true); }
  syncChips();
  render();
}

// ===================== 按钮与启动 =====================
function syncPauseBtn() { btnPause.textContent = state === STATE.PAUSED ? '▶️' : '⏸'; }
btnPause.addEventListener('click', () => {
  initAudio();
  if (state === STATE.PLAYING) pauseGame();
  else if (state === STATE.PAUSED) resumeGame();
});
btnSound.addEventListener('click', () => {
  initAudio();
  setMuted(!muted);
});
if (muted) btnSound.textContent = '🔇';
syncChips();
requestAnimationFrame(frame);
