'use strict';

// Alpha 1.8.1: authoritative collision regression tests. No production DB/server needed.
const assert = require('node:assert/strict');
const game = require('../server');
const {CHARACTERS, newRoom, spawnProjectile, updateProjectiles, makeMatchStats} = game;
const NOW = 1_000_000;
let assertions = 0;
const eq = (a, b, message) => {assert.equal(a, b, message); assertions++;};
const ok = (cond, message) => {assert.ok(cond, message); assertions++;};

function room() {
  const r = newRoom('HP', { displayNumber: 1 });
  r.state = 'playing';
  r.matchStartedAt = NOW;
  r.matchEndAt = NOW + 180000;
  return r;
}
function player(r, id, char, team, x, y, hp = null) {
  const def = CHARACTERS[char];
  const p = {
    id, name: id, team, character: char, x, y, aimX: x, aimY: y + 20,
    alive: true, hp: hp == null ? def.hp : hp, maxHp: def.hp,
    invulnerableUntil: 0, statuses: Object.create(null),
    stats: makeMatchStats(char), damageContributors: Object.create(null),
    supportContributors: Object.create(null), shield: 0, maxShield: 0,
    ultimateCharge: 0, ultimateUntil: 0, lastCombatAt: NOW,
    projectileHitSeq: 0, healHitSeq: 0, shotSeq: 0, lastHealFeedbackAt: 0,
    shieldCreditBySource: Object.create(null)
  };
  r.players.set(id, p);
  return p;
}
function shoot(r, p, options = {}) {
  spawnProjectile(r, p, CHARACTERS[p.character], NOW);
  const spawned = [...r.projectiles.values()][r.projectiles.size - 1];
  assert.ok(spawned, 'projectile must spawn');
  Object.assign(spawned, options);
  return spawned;
}
function advance(r, seconds = .4) {
  updateProjectiles(r, seconds, NOW + Math.round(seconds * 1000));
}

for (const char of ['water', 'wind', 'star', 'angel']) {
  // A full-HP friendly standing directly in the firing lane must NOT absorb a
  // hybrid healing/attack projectile: the enemy behind takes the normal damage.
  {
    const r = room();
    const caster = player(r, 'h', char, 'A', 21, 21);
    const full = player(r, 'full', 'shooter', 'A', 21, 24);
    const enemy = player(r, 'enemy', 'shooter', 'B', 21, 28);
    const bullet = shoot(r, caster);
    eq(bullet.type, 'heal', `${char}: healing type preserved`);
    advance(r, .48);
    eq(full.hp, full.maxHp, `${char}: full-health ally not healed`);
    ok(enemy.hp < enemy.maxHp, `${char}: enemy behind full-health ally takes damage`);
    eq(r.projectiles.size, 0, `${char}: enemy absorbs projectile`);
  }
  // Wounded friendlies keep the ordinary heal collision, including 99% HP.
  {
    const r = room();
    const caster = player(r, 'h', char, 'A', 21, 21);
    const ally = player(r, 'hurt', 'shooter', 'A', 21, 24, CHARACTERS.shooter.hp * .99);
    const enemy = player(r, 'enemy', 'shooter', 'B', 21, 28);
    const before = ally.hp;
    shoot(r, caster);
    advance(r, .48);
    ok(ally.hp > before, `${char}: wounded ally receives healing`);
    eq(enemy.hp, enemy.maxHp, `${char}: wounded ally absorbs projectile first`);
    eq(r.projectiles.size, 0, `${char}: healed ally consumes bullet`);
  }
}

// Several full-health allies, including overlap, do not block a wounded teammate.
{
  const r = room();
  const caster = player(r, 'h', 'water', 'A', 21, 21);
  player(r, 'full1', 'shooter', 'A', 21, 24);
  player(r, 'full2', 'shooter', 'A', 21, 26);
  const injured = player(r, 'wounded', 'shooter', 'A', 21, 28, 120);
  shoot(r, caster);
  advance(r, .48);
  ok(injured.hp > 120, 'projectile passes through two full-HP allies then heals injured ally');
  eq(r.projectiles.size, 0, 'healed ally absorbs projectile');
}
{
  const r = room();
  const caster = player(r, 'h', 'wind', 'A', 21, 21);
  player(r, 'full', 'shooter', 'A', 21, 25);
  const injured = player(r, 'wounded', 'shooter', 'A', 21, 25, 140);
  shoot(r, caster);
  advance(r, .3);
  ok(injured.hp > 140, 'overlapping full-HP player is transparent and wounded player still heals');
}

// Tiny floating-point HP deficits count as full; real deficits are not skipped.
{
  const r = room();
  const caster = player(r, 'h', 'water', 'A', 21, 21);
  const nearFull = player(r, 'almost-full', 'shooter', 'A', 21, 24, 250 - 1e-7);
  const injured = player(r, 'wounded', 'shooter', 'A', 21, 28, 190);
  shoot(r, caster);
  advance(r, .48);
  eq(nearFull.hp, 250 - 1e-7, 'sub-micro HP float deficit does not intercept');
  ok(injured.hp > 190, 'projectile still reaches meaningful injury');
}

// Heal-only legacy projectile (no enemy damage): full ally transparent, wounded ally absorbs.
{
  const r = room();
  const caster = player(r, 'h', 'water', 'A', 21, 21);
  player(r, 'full', 'shooter', 'A', 21, 24);
  const wounded = player(r, 'wounded', 'shooter', 'A', 21, 28, 100);
  shoot(r, caster, {damage: 0});
  advance(r, .48);
  ok(wounded.hp > 100, 'heal-only shot also pierces full-health teammate');
}

// The pierce changes neither anti-heal behavior nor enemy collision immunity.
{
  const r = room();
  const caster = player(r, 'h', 'water', 'A', 21, 21);
  const injured = player(r, 'injured', 'shooter', 'A', 21, 24, 140);
  player(r, 'enemy', 'shooter', 'B', 21, 28);
  game.applyStatus(r, null, injured, 'poison', 2000, NOW, {fullBlock:true});
  shoot(r, caster);
  advance(r, .48);
  eq(injured.hp, 140, 'heal-blocked injured ally does not gain HP');
  eq(r.projectiles.size, 0, 'heal-blocked injured ally still blocks projectile');
}

// Walls must still intercept a bullet, even after it passes a full-health teammate.
{
  const r = room();
  const caster = player(r, 'h', 'water', 'A', 21, 23);
  player(r, 'full', 'shooter', 'A', 21, 26);
  const beyond = player(r, 'beyond', 'shooter', 'A', 21, 40, 100);
  shoot(r, caster);
  advance(r, .95);
  eq(beyond.hp, 100, 'center wall blocks healing beyond it');
  eq(r.projectiles.size, 0, 'wall consumes heal projectile after full ally pass');
}

// Ordinary attack projectiles retain their established ally-pierce/enemy-hit behavior.
{
  const r = room();
  const caster = player(r, 'd', 'shooter', 'A', 21, 21);
  player(r, 'full', 'shooter', 'A', 21, 24);
  const enemy = player(r, 'enemy', 'shooter', 'B', 21, 28);
  shoot(r, caster);
  advance(r, .30);
  ok(enemy.hp < enemy.maxHp, 'damage projectile still hits enemy behind ally');
}

// A healing projectile that meets only a full teammate continues flying.
{
  const r = room();
  const caster = player(r, 'h', 'water', 'A', 21, 21);
  player(r, 'full', 'shooter', 'A', 21, 24);
  shoot(r, caster);
  advance(r, .2);
  eq(r.projectiles.size, 1, 'heal projectile remains alive after passing full-health ally');
}

console.log(`PASS: ${assertions} School Line 1.8.1 heal-projectile pierce assertions`);
