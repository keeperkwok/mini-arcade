'use strict';

// ===================== 玩家 =====================
const player = {
  x: 0, y: 0, vx: 0, vy: 0, r: 9,
  speedLv: 1, weaponLv: 0, laser: false, barrier: 0,
  fireCd: 0, laserCd: 0, alive: false, invT: 0, respawnT: 0, t: 0, bank: 0,
};

function resetPlayer(full) {
  player.x = W / 2; player.y = H - 110;
  player.vx = 0; player.vy = 0;
  if (full) { player.speedLv = 1; player.weaponLv = 0; player.laser = false; player.barrier = 0; }
  player.alive = true; player.invT = 3;
  player.fireCd = 0; player.laserCd = 0;
}

function firePlayer() {
  player.fireCd = Math.max(0.09, 0.17 - player.speedLv * 0.015 - player.weaponLv * 0.01);
  const y0 = player.y - 24;
  const mk = (vx, vy) => pBullets.push({ x: player.x, y: y0, vx, vy, r: 4.5, dmg: 1, kind: 'shot' });
  const sp = -760;
  mk(0, sp);
  if (player.weaponLv >= 1) { mk(-110, sp * 0.98); mk(110, sp * 0.98); }
  if (player.weaponLv >= 2) { mk(-230, sp * 0.94); mk(230, sp * 0.94); }
  SFX.shoot();
  addParticle({ x: player.x, y: y0, vx: 0, vy: -40, life: 0.12, t: 0, r: 5, color: '#fff9c4', drag: 1 });
  if (player.laser && player.laserCd <= 0) {
    player.laserCd = 0.26;
    pBullets.push({ x: player.x, y: y0, vx: 0, vy: -980, r: 7, dmg: 3, kind: 'laser', hitSet: new Set() });
    SFX.laser();
  }
}

function updatePlayer(dt) {
  player.t += dt;
  if (!player.alive) {
    player.respawnT -= dt;
    if (player.respawnT <= 0) {
      if (lives > 0) resetPlayer(true);
      else doGameOver();
    }
    return;
  }
  player.invT = Math.max(0, player.invT - dt);
  const L = keys.ArrowLeft || keys.KeyA, R = keys.ArrowRight || keys.KeyD;
  const U = keys.ArrowUp || keys.KeyW, D = keys.ArrowDown || keys.KeyS;
  let ax = (R ? 1 : 0) - (L ? 1 : 0), ay = (D ? 1 : 0) - (U ? 1 : 0);
  if (ax && ay) { ax *= 0.7071; ay *= 0.7071; }
  const maxV = 250 + player.speedLv * 65;
  const k = Math.min(1, dt * 9);
  player.vx += (ax * maxV - player.vx) * k;
  player.vy += (ay * maxV * 0.85 - player.vy) * k;
  pointer.vxHint *= Math.pow(0.001, dt);
  player.x = clamp(player.x + player.vx * dt, 22, W - 22);
  player.y = clamp(player.y + player.vy * dt, 70, H - 26);
  const bankSrc = pointer.down ? clamp(pointer.vxHint, -320, 320) : player.vx;
  player.bank = lerp(player.bank, clamp(bankSrc / 320, -1, 1), Math.min(1, dt * 10));
  if (Math.random() < dt * 22) {
    addParticle({
      x: player.x + rand(-3, 3), y: player.y + 22,
      vx: rand(-8, 8), vy: rand(30, 60),
      life: rand(0.25, 0.5), t: 0, r: rand(2, 4), color: 'smoke', drag: 1,
    });
  }
  player.fireCd -= dt; player.laserCd -= dt;
  const shooting = keys.Space || keys.KeyZ || keys.KeyJ || pointer.down;
  if (shooting && player.fireCd <= 0) firePlayer();
}

// ===================== 子弹 =====================
function updateBullets(dt) {
  for (let i = pBullets.length - 1; i >= 0; i--) {
    const b = pBullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -60 || b.x < -30 || b.x > W + 30) { pBullets.splice(i, 1); continue; }
    let consumed = false;
    // 铃铛云
    for (let j = bellClouds.length - 1; j >= 0; j--) {
      const c = bellClouds[j];
      if (b.kind === 'laser' && b.hitSet.has(c)) continue;
      const rr = c.r * 0.9 + b.r;
      if (dist2(b.x, b.y, c.x, c.y) < rr * rr) {
        if (b.kind === 'laser') b.hitSet.add(c);
        c.hp -= b.dmg; c.flash = 1;
        burst(b.x, b.y, 4, { colors: ['#ffffff', '#dbeefb'], s1: 120, life: 0.35 });
        if (c.hp <= 0) {
          SFX.cloud();
          burst(c.x, c.y, 18, { colors: ['#ffffff', '#eef7ff', '#dbeefb'], s1: 160, life: 0.6, r: 6 });
          spawnBell(c.x, c.y);
          bellClouds.splice(j, 1);
        } else SFX.hit();
        if (b.kind !== 'laser') { consumed = true; break; }
      }
    }
    if (consumed) { pBullets.splice(i, 1); continue; }
    // 铃铛（打一下变一次色）
    for (const bl of bells) {
      if (b.kind === 'laser' && b.hitSet.has(bl)) continue;
      const rr = 15 + b.r;
      if (dist2(b.x, b.y, bl.x, bl.y) < rr * rr) {
        if (b.kind === 'laser') b.hitSet.add(bl);
        bl.color = (bl.color + 1) % 4;
        bl.vy = -150; bl.vx = rand(-30, 30); bl.flash = 1;
        score += 50;
        SFX.bell();
        if (b.kind !== 'laser') { consumed = true; break; }
      }
    }
    if (consumed) { pBullets.splice(i, 1); continue; }
    // 敌机
    for (let j = enemies.length - 1; j >= 0; j--) {
      const e = enemies[j];
      if (b.kind === 'laser' && b.hitSet.has(e)) continue;
      const rr = e.r + b.r;
      if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
        if (b.kind === 'laser') b.hitSet.add(e);
        damageEnemy(j, b.dmg);
        if (b.kind !== 'laser') { consumed = true; break; }
      }
    }
    if (consumed) { pBullets.splice(i, 1); continue; }
    // BOSS
    if (boss && !boss.dying && !(b.kind === 'laser' && b.hitSet.has(boss))) {
      const dx = b.x - boss.x, dy = b.y - boss.y;
      if ((dx * dx) / (100 * 100) + (dy * dy) / (44 * 44) < 1) {
        if (b.kind === 'laser') b.hitSet.add(boss);
        boss.hp -= b.dmg; boss.flash = 1;
        burst(b.x, b.y, 3, { colors: ['#ffffff', '#ffd54f'], s1: 100, life: 0.3 });
        SFX.hit();
        if (boss.hp <= 0) { boss.dying = true; boss.dieT = 2.0; SFX.boom(true); shake = 12; flashA = 0.5; }
        if (b.kind !== 'laser') { pBullets.splice(i, 1); consumed = true; }
      }
    }
    if (consumed) continue;
  }
}
function updateEnemyBullets(dt) {
  for (let i = eBullets.length - 1; i >= 0; i--) {
    const b = eBullets[i];
    b.t += dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y > H + 30 || b.y < -30 || b.x < -30 || b.x > W + 30) eBullets.splice(i, 1);
  }
}
function aimAt(from, to, speed) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
}
function fireEnemyBullet(x, y, v, r) {
  eBullets.push({ x, y, vx: v.vx, vy: v.vy, r: r || 5, t: 0 });
}

// ===================== 敌机 =====================
function spawnEnemy(type, x, y) {
  const e = {
    type, x, y, t: rand(0, TAU), hp: 1, r: 14, flying: true, flash: 0,
    baseX: x, vx: 0, vy: 80, amp: 40, freq: 2, shootT: 2, targetY: 200,
  };
  enemies.push(e);
  return e;
}
function updateEnemies(dt) {
  const gs = groundSpeed();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.t += dt; e.flash = Math.max(0, e.flash - dt * 6);
    switch (e.type) {
      case 'bird':
        e.y += e.vy * dt;
        e.x = e.baseX + Math.sin(e.t * e.freq) * e.amp;
        break;
      case 'eye':
        if (e.y < e.targetY) e.y += 90 * dt;
        else if (e.t < 9) {
          e.x += e.vx * dt;
          if (e.x < 40 || e.x > W - 40) e.vx *= -1;
          e.y += Math.sin(e.t * 2) * 12 * dt;
          e.shootT -= dt;
          if (e.shootT <= 0 && player.alive) {
            e.shootT = rand(1.4, 2.2);
            fireEnemyBullet(e.x, e.y, aimAt(e, player, rand(120, 170)));
          }
        } else e.y += 100 * dt;
        break;
      case 'drone':
        e.vx = clamp((player.x - e.x) * 0.5, -130, 130);
        e.x += e.vx * dt; e.y += e.vy * dt;
        break;
      case 'potato':
        e.y += gs * dt; e.x += e.vx * dt;
        if (e.x < 30 || e.x > W - 30) e.vx *= -1;
        break;
      case 'tomato':
        e.y += gs * dt;
        e.shootT -= dt;
        if (e.shootT <= 0 && player.alive && e.y > 0 && e.y < H - 100) {
          e.shootT = rand(2.2, 3.2);
          fireEnemyBullet(e.x, e.y - 10, aimAt(e, player, 150));
        }
        break;
    }
    if (e.y > H + 60 || e.x < -80 || e.x > W + 80) enemies.splice(i, 1);
  }
}
function damageEnemy(idx, dmg) {
  const e = enemies[idx];
  e.hp -= dmg; e.flash = 1;
  if (e.hp > 0) { SFX.hit(); return; }
  enemies.splice(idx, 1);
  killEnemy(e);
}
function killEnemy(e) {
  const scores = { bird: 100, drone: 150, potato: 200, tomato: 300, eye: 300 };
  const pts = scores[e.type] || 100;
  score += pts;
  burst(e.x, e.y, 14, { colors: ['#ffd54f', '#ff7043', '#ffffff'], life: 0.6 });
  ring(e.x, e.y, '#ffd54f', 4, 220);
  SFX.boom(false);
  if (pts >= 200) addPopup(e.x, e.y, '+' + pts, '#ffffff');
  if (e.type === 'eye' && Math.random() < 0.22) spawnStar(e.x, e.y);
  if (e.type === 'drone' && Math.random() < 0.08) spawnStar(e.x, e.y);
}

// ===================== BOSS =====================
function startWarning() { warnT = 2.6; SFX.warn(); }
function spawnBoss() {
  const hp = 130 + stage * 55;
  boss = {
    x: W / 2, y: -120, ty: Math.min(130, H * 0.2),
    hp, maxHp: hp, t: 0, dir: 1,
    atk1: 2, atk2: 5, atk3: 3,
    dying: false, dieT: 0, flash: 0,
  };
}
function updateBoss(dt) {
  if (warnT > 0) { warnT -= dt; if (warnT <= 0) spawnBoss(); return; }
  if (!boss) return;
  boss.t += dt; boss.flash = Math.max(0, boss.flash - dt * 6);
  if (boss.dying) {
    boss.dieT -= dt;
    if (Math.random() < dt * 8) {
      const bx = boss.x + rand(-80, 80), by = boss.y + rand(-25, 25);
      burst(bx, by, 10, { colors: ['#ffd54f', '#ff7043', '#ffffff'] });
      SFX.boom(false);
      shake = Math.max(shake, 5);
    }
    if (boss.dieT <= 0) bossDefeated();
    return;
  }
  if (boss.y < boss.ty) { boss.y += 60 * dt; return; }
  boss.x += boss.dir * (46 + stage * 4) * dt;
  if (boss.x < 130) boss.dir = 1;
  if (boss.x > W - 130) boss.dir = -1;
  boss.y = boss.ty + Math.sin(boss.t * 1.2) * 10;
  boss.atk1 -= dt;
  if (boss.atk1 <= 0 && player.alive) {
    boss.atk1 = Math.max(0.9, 1.7 - stage * 0.08);
    const base = Math.atan2(player.y - boss.y, player.x - boss.x);
    for (let k = -2; k <= 2; k++) {
      const a = base + k * 0.16;
      fireEnemyBullet(boss.x, boss.y + 26, { vx: Math.cos(a) * 190, vy: Math.sin(a) * 190 }, 6);
    }
  }
  boss.atk2 -= dt;
  if (boss.atk2 <= 0) {
    boss.atk2 = 4.2;
    spawnEnemy('drone', boss.x - 70, boss.y + 10).vy = 200;
    spawnEnemy('drone', boss.x + 70, boss.y + 10).vy = 200;
  }
  if (boss.hp < boss.maxHp * 0.5) {
    boss.atk3 -= dt;
    if (boss.atk3 <= 0) {
      boss.atk3 = 3;
      for (let k = 0; k < 14; k++) {
        const a = k / 14 * TAU + boss.t;
        fireEnemyBullet(boss.x, boss.y, { vx: Math.cos(a) * 140, vy: Math.sin(a) * 140 }, 5);
      }
    }
    if (Math.random() < dt * 6) smoke(boss.x + rand(-60, 60), boss.y + rand(-15, 20));
  }
}
function bossDefeated() {
  SFX.boom(true);
  shake = 18; flashA = 0.9;
  const gain = 5000 * stage;
  score += gain;
  addPopup(boss.x, boss.y, '+' + gain, '#ffe082', true);
  burst(boss.x, boss.y, 90, { s1: 380, life: 1.2, r: 6, colors: ['#ffd54f', '#ff7043', '#ffffff', '#4fc3f7'] });
  ring(boss.x, boss.y, '#ffffff', 20, 700);
  spawnBell(boss.x - 60, boss.y);
  spawnBell(boss.x, boss.y - 20);
  spawnBell(boss.x + 60, boss.y);
  spawnStar(boss.x, boss.y + 30);
  boss = null;
  stage++; stageTimer = 0;
  banner = { text: 'STAGE ' + stage, sub: stageSubtitle(stage), t: 0, dur: 2.6 };
  SFX.stage();
}

// ===================== 导演器（刷怪） =====================
function director(dt) {
  if (!boss && warnT <= 0 && stageTimer > 38) { startWarning(); return; }
  if (boss || warnT > 0) return;
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = Math.max(0.55, 1.7 - stage * 0.15) * rand(0.7, 1.3);
    const roll = Math.random();
    if (roll < 0.28) {
      const n = irand(3, 5), bx = rand(60, W - 60);
      for (let i = 0; i < n; i++) {
        const e = spawnEnemy('bird', bx, -40 - i * 46);
        e.baseX = bx;
        e.amp = rand(26, 70);
        e.freq = rand(1.6, 2.6);
        e.vy = rand(75, 105);
      }
    } else if (roll < 0.44) {
      const e = spawnEnemy('eye', rand(70, W - 70), -40);
      e.targetY = rand(90, Math.max(140, H * 0.32));
      e.vx = rand(-40, 40);
      e.hp = 3 + Math.floor(stage / 2);
    } else if (roll < 0.68) {
      const e = spawnEnemy('drone', clamp(player.x + rand(-160, 160), 40, W - 40), -30);
      e.vy = rand(240, 320);
    } else if (roll < 0.84) {
      const e = spawnEnemy('potato', rand(50, W - 50), -40);
      e.flying = false; e.hp = 2; e.r = 15;
      e.vx = rand(-25, 25);
    } else {
      const e = spawnEnemy('tomato', rand(50, W - 50), -40);
      e.flying = false; e.hp = 2; e.r = 15;
    }
  }
  cloudT -= dt;
  if (cloudT <= 0) {
    cloudT = rand(2.8, 4.6);
    if (bellClouds.length < (stage >= 3 ? 4 : 3)) {
      bellClouds.push(makeBellCloud(rand(60, W - 60), -60));
    }
  }
}

// ===================== 受击与阵亡 =====================
function hitPlayer() {
  if (!player.alive || player.invT > 0) return;
  if (player.barrier > 0) {
    player.barrier--;
    player.invT = Math.max(player.invT, 0.4);
    SFX.shield();
    ring(player.x, player.y, '#4fc3f7', 24, 300);
    burst(player.x, player.y, 8, { colors: ['#4fc3f7', '#ffffff'], s1: 160, life: 0.4 });
    return;
  }
  playerDie();
}
function playerDie() {
  SFX.die();
  player.alive = false;
  player.respawnT = 2.2;
  lives--;
  bellChain = 0;
  shake = 16; flashA = 0.6;
  burst(player.x, player.y, 60, { s1: 340, life: 1, r: 5, colors: ['#ffffff', '#ffd54f', '#ff7043', '#ef5350'] });
  ring(player.x, player.y, '#ffffff', 10, 600);
  for (const b of eBullets) burst(b.x, b.y, 2, { colors: ['#ffffff'], s1: 60, life: 0.3 });
  eBullets.length = 0;
}
function checkPlayerHits() {
  if (!player.alive || player.invT > 0) return;
  for (let i = eBullets.length - 1; i >= 0; i--) {
    const b = eBullets[i];
    const rr = b.r + player.r;
    if (dist2(b.x, b.y, player.x, player.y) < rr * rr) {
      eBullets.splice(i, 1);
      hitPlayer();
      return;
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e.flying) continue;
    const rr = e.r + player.r;
    if (dist2(e.x, e.y, player.x, player.y) < rr * rr) {
      enemies.splice(i, 1);
      killEnemy(e);
      hitPlayer();
      return;
    }
  }
  if (boss && !boss.dying) {
    const dx = player.x - boss.x, dy = player.y - boss.y;
    if ((dx * dx) / (100 * 100) + (dy * dy) / (46 * 46) < 1) hitPlayer();
  }
}

// ===================== 流程控制 =====================
function startGame() {
  score = 0; lives = 3; stage = 1; stageTimer = 0;
  bellChain = 0; chainTimer = 0;
  pBullets.length = 0; eBullets.length = 0; enemies.length = 0;
  bells.length = 0; stars.length = 0; bellClouds.length = 0;
  particles.length = 0; popups.length = 0;
  boss = null; warnT = 0;
  spawnT = 1.2; cloudT = 1;
  resetPlayer(true);
  player.invT = 2;
  banner = { text: 'STAGE 1', sub: stageSubtitle(1), t: 0, dur: 2.6 };
  state = STATE.PLAYING;
  initAudio();
  if (!muted) startMusic();
  SFX.stage();
  syncChips();
  syncPauseBtn();
}
function pauseGame() {
  if (state !== STATE.PLAYING) return;
  state = STATE.PAUSED;
  stopMusic();
  if (AC) AC.suspend();
  syncPauseBtn();
}
function resumeGame() {
  if (state !== STATE.PAUSED) return;
  state = STATE.PLAYING;
  if (AC) AC.resume();
  if (!muted) startMusic();
  syncPauseBtn();
}
function setMuted(m) {
  muted = m;
  try { localStorage.setItem('twinbee.muted', m ? '1' : '0'); } catch (e) {}
  btnSound.textContent = m ? '🔇' : '🔊';
  if (m) stopMusic();
  else if (state === STATE.PLAYING && AC) startMusic();
}
function doGameOver() {
  state = STATE.OVER;
  overT = 0;
  stopMusic();
  SFX.over();
  if (score > best) {
    best = score;
    try { localStorage.setItem('twinbee.best', String(best)); } catch (e) {}
    newRecord = true;
  } else newRecord = false;
  syncChips();
}

// ===================== 主更新 =====================
function update(dt) {
  stageTimer += dt;
  if (chainTimer > 0) {
    chainTimer -= dt;
    if (chainTimer <= 0) bellChain = 0;
  }
  if (banner) {
    banner.t += dt;
    if (banner.t > banner.dur) banner = null;
  }
  updateGround(dt);
  updateDecor(dt);
  updateClouds(dt);
  updateBells(dt);
  updateStars(dt);
  updateEnemies(dt);
  updateBoss(dt);
  updatePlayer(dt);
  updateBullets(dt);
  updateEnemyBullets(dt);
  checkPlayerHits();
  director(dt);
  updateParticles(dt);
  updatePopups(dt);
  shake = Math.max(0, shake - dt * 34);
  flashA = Math.max(0, flashA - dt * 2);
}
