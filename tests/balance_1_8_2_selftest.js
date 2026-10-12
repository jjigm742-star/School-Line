'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const game = require('../server');
const { CHARACTERS, currentAttackDef, newRoom, spawnProjectile, updateProjectiles, activateUltimate, statsSeriesForBalanceVersion, effectiveSpeed } = game;
const NOW = 1000000;
let checks = 0;
function eq(actual, expected, what) { assert.equal(actual, expected, what); checks++; }
function ok(actual, what) { assert.ok(actual, what); checks++; }
function makeRoom() { const room = newRoom('T182', { displayNumber: 1 }); room.state='playing'; room.matchStartedAt=NOW; room.matchEndAt=NOW+180000; return room; }
function makePlayer(room, id, character, team, x, y) {
  const d = CHARACTERS[character];
  const p = {
    id, name: id, character, team, x, y, aimX: x, aimY: y + 40,
    hp: d.hp, maxHp: d.hp, alive: true, invulnerableUntil: 0, respawnAt:0,
    ultimateCharge: d.ultimateCost, ultimateUntil: 0, ultimateUseSeq:0,
    statuses: Object.create(null), stats:game.makeMatchStats(character),
    damageContributors: Object.create(null), supportContributors: Object.create(null),
    shield:0, maxShield:0, shieldUntil:0, shieldUncredited:0,
    shieldCreditBySource:Object.create(null), input:{up:false,down:false,left:false,right:false,fire:false},
    shotSeq:0, projectileHitSeq:0, healHitSeq:0, abilityUseSeq:0, lastDamageAt:0,
    diaUltimateVolleyHits:new Map()
  };
  room.players.set(id,p);
  return p;
}
// Numbers, retained movement, ability, and stats-series safeguards.
eq(CHARACTERS.runner.damage, 13, 'runner bullet: 13');
eq(CHARACTERS.runner.fireRate, 5, 'runner five bullets/sec');
eq(CHARACTERS.runner.damage * CHARACTERS.runner.fireRate, 65, 'runner DPS 65');
eq(CHARACTERS.runner.ultimateDamage, 225, 'runner bomb 225');
eq(CHARACTERS.runner.ultimateCost, 700, 'runner bomb cost unchanged');
eq(CHARACTERS.shooter.ultimateCost, 700, 'shooter charge reduced by 300');
eq(CHARACTERS.shooter.ultimateDuration, 8, 'shooter ultimate duration intact');
eq(CHARACTERS.sniper.damage, 60, 'sniper base hit 60');
eq(CHARACTERS.sniper.ultimateDamage, 80, 'sniper ult hit 80');
eq(CHARACTERS.sniper.damage * CHARACTERS.sniper.fireRate, 120, 'sniper base DPS 120');
eq(CHARACTERS.sniper.ultimateDamage * CHARACTERS.sniper.fireRate, 160, 'sniper ult DPS 160');
eq(CHARACTERS.sniper.fireRate, 2, 'sniper 2 shots/sec');
eq(CHARACTERS.sniper.range, 36, 'sniper 36m');
eq(CHARACTERS.sniper.projectileSpeed, 42, 'sniper projectile velocity retained');
eq(CHARACTERS.sniper.projectileRadius, .20, 'sniper base projectile radius');
eq(CHARACTERS.sniper.ultimateProjectileRadius, .32, 'sniper ultimate projectile radius');
eq(CHARACTERS.sniper.ultimateCost, 800, 'sniper ult charge kept');
eq(CHARACTERS.sniper.ultimateName, '정밀사격', 'sniper ult name');
ok(!('distanceDamage' in CHARACTERS.sniper) && !('distanceDamageBands' in CHARACTERS.sniper), 'no sniper distance bands');
eq(statsSeriesForBalanceVersion('1.8.2-prototype'), '1.8', '1.8.2 stays isolated in 1.8 stats series');
{
  const room=makeRoom(), s=makePlayer(room,'s','shooter','A',17,21);
  eq(activateUltimate(room,s,NOW),true,'shooter ultimate activates at 700');
  eq(s.ultimateCharge,0,'shooter expends precisely 700');
  eq(currentAttackDef(s,NOW).damage,25,'shooter ultimate damage preserved');
  eq(currentAttackDef(s,NOW).range,32,'shooter ultimate range preserved');
  ok(effectiveSpeed(s,NOW,room) > CHARACTERS.shooter.speed, 'shooter ultimate speed remains');
}
// Actual server projectile physics, not just config inspection: 5m, 22m, 34m.
for (const ult of [false,true]) {
  for (const range of [5,22,34]) {
    const room=makeRoom(), s=makePlayer(room,'s','sniper','A',17,21), t=makePlayer(room,'target','shooter','B',17,21+range);
    if(ult) eq(activateUltimate(room,s,NOW),true,'sniper ulti activates');
    const attack=currentAttackDef(s,NOW + 5);
    eq(attack.damage,ult?80:60,`attack config ${range}m ${ult?'ult':'base'}`);
    eq(attack.projectileRadius,ult?.32:.20,'radius corresponding to ult state');
    spawnProjectile(room,s,attack,NOW+10);
    eq(room.projectiles.size,1,'single sniper bullet spawned');
    const bullet=[...room.projectiles.values()][0];
    eq(bullet.damage,ult?80:60,'sniper shot snapshots damage');
    eq(bullet.range,36,'shot preserves 36m range');
    updateProjectiles(room,1,NOW+100);
    eq(t.hp,250-(ult?80:60),`sniper damage ${range}m ${ult?'ult':'base'}`);
    eq(room.projectiles.size,0,'sniper bullet removed on hit');
    eq(s.stats.sniperLongRangeDamage,0,'retired long-range bonus stat not incremented');
    if(ult) {
      eq(currentAttackDef(s,NOW+8500).damage,60,'ultimate expiration returns damage 60');
      eq(currentAttackDef(s,NOW+8500).projectileRadius,.2,'ultimate expiration returns projectile size');
    }
  }
}
// A 36m-range guide must only exist inside local Sniper and not duplicate the old ring.
{
  const client=fs.readFileSync(path.join(__dirname,'../public/game.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const area=client.slice(client.indexOf('// Only the player controlling Sniper sees'),client.indexOf('// Local-only pre-cast radius guide for Iron/Water'));
  ok(area.includes('if (!spectatorMode)') && area.includes('p.id === myId') && area.includes("p.character === 'sniper'"),'guide strictly local Sniper');
  ok(area.includes('rightStick.active') && area.includes('lastAimDir'),'aim stick uses current input, not old frozen bearing');
  ok(area.includes('sniperDef?.range') && area.includes('ctx.setLineDash([4, 8])'),'guide uses full range and faded dashed stroke');
  ok(!area.includes('ctx.arc('),'no 16m circle drawn');
  ok(!client.includes('빨간색 원 밖의 적') && !client.includes('distanceDamageBands'), 'UI has no legacy distance damage labels');
  ok(!server.includes('resolveDistanceDamage(') && !server.includes('distanceDamageBands'), 'server no longer computes distance damage');
  ok(server.includes('sniperLongRangeDamage: 0'), 'historical stat field remains for schema compatibility');
}
console.log(`PASS: ${checks} focused School Line 1.8.2 balance / projectile / local guide assertions`);
