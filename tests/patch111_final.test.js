'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const s = require('../server');
const cd=s.CHARACTERS;
const NOW=Date.now();
// All requested 1.11 values (the previous patch's Shield/Fire/Magnet remain unchanged).
assert.equal(cd.shield.hp,400); assert.equal(cd.shield.shieldAmount,150);
assert.equal(cd.fire.damage,14);assert.equal(cd.magnet.magnetProjectileSpeed,42);
assert.equal(cd.shooter.ultimateDamage,30);assert.equal(cd.shooter.ultimateDamage*cd.shooter.fireRate,150);
assert.equal(cd.laser.ultimateMaxHpDamageRatio,0.40);assert.equal(cd.laser.beamDps,55);
assert.equal(cd.ice.beamDps,80);assert.equal(cd.poison.beamDps,85);
assert.equal(cd.light.healHps,60);assert.equal(cd.light.beamDps,50);assert.equal(cd.light.range,16);
assert.equal(cd.wind.speed,8);assert.equal(s.speedWithTierDelta(cd.wind.speed,1),9.2);
assert.equal(cd.runner.damage,14);assert.equal(cd.runner.damage*cd.runner.fireRate,70);
assert.equal(cd.witch.ultimateCost,1400);assert.equal(cd.witch.ultimateEffectDuration,5);
assert.equal(cd.witch.ultimateSpeedTierDelta,-1);assert.equal(cd.witch.ultimateDelay,undefined);
assert.equal(cd.witch.ultimateRadius,undefined);
assert.equal(cd.drain.ultimateAttackSpeedBoost,.25);assert.equal(cd.buffer.actionSpeedBoost,.25);
const makePlayer=(id,character,team,x,y,options={})=>({
  id,name:id,accountId:id,character,team,x,y,aimX:x,aimY:y+10,
  alive:true,connected:true,hp:cd[character].hp,maxHp:cd[character].hp,shield:0,
  invulnerableUntil:0,ultimateCharge:cd[character].ultimateCost||0,ultimateUntil:0,ultimateUseSeq:0,
  stats:s.makeMatchStats(character),input:{up:false,down:false,left:false,right:false,fire:false},
  ...options
});
// Witch: enemy at >16m hit in cast moment, no telegraph or delayed targeting;
// allies, dead and invulnerable enemies unaffected, no delayed curse for respawns.
const room=s.newRoom('ULT_WITCH_TEST',{mode:'competitive',displayNumber:1});
const caster=makePlayer('caster','witch','A',2,3);
const ally=makePlayer('ally','iron','A',18,30);
const far=makePlayer('far','runner','B',40,65);
const near=makePlayer('near','mecha','B',3,5);
const immune=makePlayer('immune','sniper','B',4,6,{invulnerableUntil:NOW+5000});
const dead=makePlayer('dead','shooter','B',4,7,{alive:false});
for (const p of [caster,ally,far,near,immune,dead]) room.players.set(p.id,p);
assert.equal(s.activateUltimate(room,caster,NOW),true);
assert.equal(caster.ultimateCharge,0);assert.equal(caster.ultimateUseSeq,1);
assert.equal(caster.pendingUltimateId,undefined);assert.equal(caster.ultimateUntil,NOW+5000);
for(const target of [far,near]) {
  assert.equal(s.getStatus(target,'curse',NOW)?.until,NOW+5000);
  assert.equal(s.getStatus(target,'slow',NOW)?.data?.tierDelta,-1);
  assert.equal(s.effectiveSpeed(target,NOW,room),s.speedWithTierDelta(cd[target.character].speed,-1));
}
for(const target of [ally,immune,dead]) {
  assert.equal(s.hasStatus(target,'curse',NOW),false,`${target.id} should not be cursed`);
  assert.equal(s.hasStatus(target,'slow',NOW),false,`${target.id} should not be slowed`);
}
// +25% curse damage amplification uses the existing damage resolver.
const result=s.dealDamageDetailed(room,caster.id,far,100,NOW+10);
assert.equal(result.total,125);
assert.equal(s.getStatus(far,'curse',NOW+5000),null);
assert.equal(s.getStatus(near,'slow',NOW+5000),null);
// Normal witch skill retains its own 5s curse, independent of the new ultimate.
assert.equal(cd.witch.abilityCooldown,10);assert.equal(cd.witch.curseDuration,5);
// Laser: 10 + 40% max HP, without extra ult charge gain.
const laserRoom=s.newRoom('ULT_LASER_TEST',{mode:'casual',displayNumber:1});
const laser=makePlayer('laser','laser','A',21,25,{aimX:21,aimY:50});
const tank=makePlayer('tank','iron','B',21,40,{hp:500,maxHp:500});
laserRoom.players.set(laser.id,laser);laserRoom.players.set(tank.id,tank);
assert.equal(s.activateUltimate(laserRoom,laser,NOW),true);
assert.equal(tank.hp,290,'Laser deals 10 + 40% * 500 = 210');
assert.equal(laser.shield,210,'Laser gains shield based on actual damage');
// Public character definitions, used for character guide/skill descriptions, reflect new values.
const pub=s.publicCharacterDefs();
assert.equal(pub.witch.ultimateDelay,undefined);assert.equal(pub.witch.ultimateRadius,undefined);
assert.equal(pub.light.healHps,60);assert.equal(pub.runner.damage,14);
// Verify UI is no longer rendering a false 16m Witch warning/ready-radius.
const client=fs.readFileSync(path.join(__dirname,'../public/game.js'),'utf8');
assert.match(client,/return character === 'iron' \|\| character === 'ice' \|\| character === 'star';/);
assert.doesNotMatch(client,/\['iron','water','witch','hacker','rescue'\]\.includes/);
assert.match(client,/witchCurseBurst/);assert.match(client,/target\.cursed/);
assert.match(client,/case 'witch': effect=`즉시 전장 전체/);
// Audio: exactly three shared role signatures; local output is 1.5x baseline,
// with existing compressor handling overlap. No legacy character-per-sound grouping.
const code=client.match(/const ULTIMATE_ROLE_CUE_MULTIPLIER = 1\.5;[\s\S]*?\n\}\n\nfunction addWorldFx/);
assert.ok(code, 'shared ultimate role audio implementation exists');
const calls=[];
const audioCtx={
  CHARACTER_META:{iron:{role:'탱커'},fire:{role:'딜러'},water:{role:'힐러'},shooter:{role:'딜러'},shield:{role:'탱커'}},
  navigator:{vibrate:()=>{}},
  synthTone:args=>calls.push({type:'tone',...args}),
  noiseBurst:(duration,gain)=>calls.push({type:'noise',duration,gain}),
};
vm.createContext(audioCtx);
vm.runInContext(code[0].replace(/\nfunction addWorldFx$/,''),audioCtx);
function signature(character){calls.length=0;vm.runInContext(`playCharacterUltimateCue('${character}',true)`,audioCtx);return calls.map(x=>`${x.type}:${x.freq||0}:${x.gain}`).join('|');}
const a=signature('iron'),b=signature('fire'),h=signature('water');
assert.notEqual(a,b);assert.notEqual(b,h);assert.notEqual(a,h);
assert.equal(signature('shooter'),b);assert.equal(signature('shield'),a);
assert.match(code[0],/ULTIMATE_ROLE_CUE_MULTIPLIER/);
// Verify all current patch notes and preserved older archive are reflected in stats backups.
const notes=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/latest-patch.json'),'utf8'));
const old=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/patch_notes/1.10.json'),'utf8'));
assert.equal(notes.version,'1.11');assert.equal(old.version,'1.10');
const itemNames=notes.sections.flatMap(x=>x.groups||[]).flatMap(x=>x.items||[]).map(x=>x.name);
for(const name of ['《운동장》','힐팩','랜덤 맵','쉴드','파이어','마그넷','슈터','레이저','아이스','포이즌','라이트','윈드','러너','위치']) assert.ok(itemNames.includes(name),`patch notes missing ${name}`);
const backup=s.competitiveStatsBackupPayload();
assert.deepEqual(backup.patchNotesByVersion['1.10'],old);
assert.deepEqual(backup.patchNotesByVersion['1.11'],notes);
console.log('1.11 final additional-balance, instant/global witch, shared role audio, patch-notes tests PASSED');
