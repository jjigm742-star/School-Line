'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const game = require('../server');
const { CHARACTERS, traceLightBeam, traceBeam, updateRoom, setBufferTarget } = game;
const NOW = 1500000;
let checks = 0;
function eq(actual, expected, message) { assert.equal(actual, expected, message); checks++; }
function near(actual, expected, message) { assert.ok(Math.abs(actual-expected) < 1e-5, `${message}: ${actual} != ${expected}`); checks++; }
function yes(value, message) { assert.ok(value, message); checks++; }
function roomFixture() {
  const room = game.newRoom('LIGHT-BUFFER', {displayNumber:1});
  room.state = 'playing';room.matchStartedAt=NOW;room.matchEndAt=NOW+180000;
  room.nextUltimateAutoChargeAt=NOW+4000;room.beams=[];room.pendingRunnerBombs=[];
  return room;
}
function player(room, id, character, team, x, y) {
  const d=CHARACTERS[character];
  const p={id,character,team,name:id,x,y,aimX:x,aimY:y+16,hp:d.hp,maxHp:d.hp,alive:true,connected:true,
    input:{up:false,down:false,left:false,right:false,fire:false},nextFireAt:0,lastPeriodicActionAt:0,
    invulnerableUntil:0,respawnAt:0,respawnShieldAt:0,shield:0,maxShield:0,shieldUntil:0,shieldUncredited:0,shieldCreditBySource:Object.create(null),
    ultimateCharge:0,ultimateUntil:0,statuses:Object.create(null),stats:game.makeMatchStats(character),
    damageContributors:Object.create(null),supportContributors:Object.create(null),lastDamageAt:0,lastDamageAttackerId:null,lastCombatAt:NOW,
    healHitSeq:0,lastHealTargetId:null,lastHealFeedbackAt:0,healNumberPending:0,healNumberFlushAt:0,
    shotSeq:0,projectileHitSeq:0,abilityUseSeq:0,
    patternUltimateRemaining:0,patternUltimateNextAt:0,diaUltimateVolleyHits:new Map()};
  room.players.set(id,p);return p;
}
function fireLight(room,caster,now=NOW) { room.beams=[];traceLightBeam(room,caster,CHARACTERS.light,1/50,now);return room.beams.at(-1); }

// Configuration: only the base Buffer link HPS changes; Light's core DPS/HPS/cost unchanged.
eq(CHARACTERS.buffer.linkHealHps,40,'Buffer base HPS 40');
eq(CHARACTERS.buffer.ultimateLinkHealHps,65,'Buffer ultimate HPS remains 65');
eq(CHARACTERS.buffer.actionSpeedBoost,.25,'Buffer action speed +25% preserved');
eq(CHARACTERS.buffer.ultimateCost,1000,'Buffer ultimate cost preserved');
eq(CHARACTERS.buffer.ultimateDuration,8,'Buffer ultimate length preserved');
eq(CHARACTERS.buffer.ultimateLinkedSpeedTierDelta,1,'Buffer ult speed tier preserved');
eq(CHARACTERS.buffer.range,16,'Buffer range preserved');
eq(CHARACTERS.light.beamAllyHitPadding,.5,'Light ally collision padding +0.5');
eq(CHARACTERS.light.beamEnemyHitPadding,.2,'Light enemy collision padding +0.2');
eq(CHARACTERS.light.range,16,'Light beam range unchanged');
eq(CHARACTERS.light.beamDps,50,'Light beam DPS unchanged');
eq(CHARACTERS.light.healHps,50,'Light HPS unchanged');
eq(CHARACTERS.light.ultimateCost,800,'Light ultimate cost preserved');
eq(CHARACTERS.light.ultimateSelfHeal,100,'Light ultimate self-heal preserved');

// Ally collision padding: 0.65 body radius, target center 1.0m off-axis; plain laser would miss.
{
 const r=roomFixture(),l=player(r,'light','light','A',21,15),a=player(r,'ally','water','A',22.0,22);
 a.hp-=100;const b=fireLight(r,l);
 near(a.hp,150.0+1,'ally just outside body radius still receives 1.0hp healing');
 eq(b.healedId,'ally','ally within 0.65 + 0.5');
 near(b.y2,31,'visual beam reaches full 16m range without a wall');
}
// Outside the widened ally radius should not heal.
{
 const r=roomFixture(),l=player(r,'light','light','A',21,15),a=player(r,'ally','water','A',22.20,22);a.hp=100;
 const b=fireLight(r,l);eq(a.hp,100,'ally beyond 1.15m is not selected');eq(b.healedId,null,'no ally hit');
}
// Enemy padding +0.2, not +0.5 (smaller than heal hit radius).
{
 const r=roomFixture(),l=player(r,'light','light','A',21,15),e=player(r,'enemy','water','B',21.80,22);
 const b=fireLight(r,l);near(e.hp,249,'enemy within 0.85m hit for 1hp');eq(b.hitEnemyId,'enemy','enemy selected');
}
{
 const r=roomFixture(),l=player(r,'light','light','A',21,15),e=player(r,'enemy','water','B',21.90,22);
 const b=fireLight(r,l);eq(e.hp,250,'enemy outside 0.85m is not hit');eq(b.hitEnemyId,null,'enemy target skipped');
}
// Full-health ally remains first/selected, does not pass healing to injured ally behind.
{
 const r=roomFixture(),l=player(r,'light','light','A',21,15),full=player(r,'full','water','A',21,19),hurt=player(r,'hurt','water','A',21,25);
 hurt.hp=100;const b=fireLight(r,l);eq(b.healedId,'full','full-health ally still selected');eq(full.hp,250,'full HP unchanged');eq(hurt.hp,100,'hurt ally behind full ally not healed');
}
// Enemy first then ally: both hit/heal, beam continues to full range.
{
 const r=roomFixture(),l=player(r,'light','light','A',21,15),e=player(r,'enemy','water','B',21,19),a=player(r,'ally','water','A',21,25);
 a.hp=100;const b=fireLight(r,l);near(e.hp,249,'near enemy takes damage');near(a.hp,101,'far ally heals despite enemy in front');
 eq(b.hitEnemyId,'enemy','enemy independent selection');eq(b.healedId,'ally','ally independent selection');near(b.y2,31,'beam does not terminate at enemy');eq(b.impact,null,'player does not produce beam-ending impact');
}
// Ally first then enemy: original dual-usage behavior preserved.
{
 const r=roomFixture(),l=player(r,'light','light','A',21,15),a=player(r,'ally','water','A',21,19),e=player(r,'enemy','water','B',21,25);
 a.hp=100;const b=fireLight(r,l);near(a.hp,101,'near ally receives healing');near(e.hp,249,'enemy behind ally takes damage');eq(b.healedId,'ally','ally selected');eq(b.hitEnemyId,'enemy','enemy selected');
}
// Multi-target each side: picks earliest hit only, regardless of insertion order.
{
 const r=roomFixture(),l=player(r,'light','light','A',21,15),farAlly=player(r,'aFar','water','A',21,26),farEnemy=player(r,'eFar','water','B',21,27),nearAlly=player(r,'aNear','water','A',21,20),nearEnemy=player(r,'eNear','water','B',21,19);
 farAlly.hp=100;nearAlly.hp=100;const b=fireLight(r,l);
 eq(b.healedId,'aNear','near ally wins even if created last');eq(b.hitEnemyId,'eNear','near enemy wins even if created last');
 near(nearAlly.hp,101,'near ally restored');eq(farAlly.hp,100,'far ally untouched');near(nearEnemy.hp,249,'near enemy damage');eq(farEnemy.hp,250,'far enemy untouched');
}
// Invulnerable enemy still visually intersected but does not interfere with ally heal.
{
 const r=roomFixture(),l=player(r,'light','light','A',21,15),e=player(r,'enemy','water','B',21,19),a=player(r,'ally','water','A',21,25);
 e.invulnerableUntil=NOW+100;a.hp=100;const b=fireLight(r,l);
 eq(e.hp,250,'invulnerable enemy remains unharmed');near(a.hp,101,'ally still healed through invulnerable enemy');eq(b.didDamage,false,'visual didDamage false');
}
// Caster never heals from its own beam even when damaged.
{
 const r=roomFixture(),l=player(r,'light','light','A',21,15);l.hp=100;
 fireLight(r,l);eq(l.hp,100,'caster is excluded from beam heal-targets');
}
// Terrain clips server beam: both sides cannot hit targets behind a wall.
{
 const r=roomFixture(),l=player(r,'light','light','A',21,26),a=player(r,'ally','water','A',21,39),e=player(r,'enemy','water','B',21,40);
 a.hp=100;const b=fireLight(r,l);
 eq(a.hp,100,'wall blocks ally');eq(e.hp,250,'wall blocks enemy');eq(b.healedId,null,'ally behind wall not selected');eq(b.hitEnemyId,null,'enemy behind wall not selected');near(b.y2,31,'beam terminates at central wall');eq(b.impact,'wall','wall impact');
}
// World bounds clip the beam, too.
{
 const r=roomFixture(),l=player(r,'light','light','A',21,65);l.aimY=85;
 const b=fireLight(r,l);near(b.y2,68,'world edge blocks beam');eq(b.impact,'wall','world-edge impact');
}
// Maximum range remains 16m.
{
 const r=roomFixture(),l=player(r,'light','light','A',17,10),a=player(r,'ally','water','A',17,28);
 a.hp=100;const b=fireLight(r,l);eq(a.hp,100,'outside light beam range not healed');near(b.y2,26,'beam length 16');
}
// Other beam characters must NOT inherit light-specific padding/penetration.
{
 const r=roomFixture(),i=player(r,'ice','ice','A',21,15),e=player(r,'enemy','water','B',21.8,22);
 r.beams=[];traceBeam(r,i,CHARACTERS.ice,1/50,NOW);eq(e.hp,250,'Ice hit radius stays body-only');
}
{
 const r=roomFixture(),i=player(r,'ice','ice','A',21,15),nearEnemy=player(r,'near','water','B',21,19),farEnemy=player(r,'far','water','B',21,25);
 r.beams=[];traceBeam(r,i,CHARACTERS.ice,1/50,NOW);
 near(nearEnemy.hp,250-70/50,'Ice still damages only first enemy');eq(farEnemy.hp,250,'Ice beam does not pierce enemies');
}
// Real Buffer healing is 40/50 each simulation tick in base, 65/50 during ultimate.
{
 const r=roomFixture(),b=player(r,'buffer','buffer','A',10,15),a=player(r,'ally','water','A',10,19);
 a.hp=100;b.hp=100;yes(setBufferTarget(r,b,'ally'),'Buffer selects linked teammate');
 updateRoom(r,1/50,NOW+20);near(a.hp,100+40/50,'base Buffer link heals 40HPS');near(b.hp,100+40/50*.25,'generic healer self-sustain still 25%');
 b.ultimateUntil=NOW+8000;updateRoom(r,1/50,NOW+40);near(a.hp,100+40/50+65/50,'Buffer ultimate heals 65HPS, not base 40');
}
// Display metadata and client behavior stay in sync with authoritative changes.
{
 const src=fs.readFileSync(path.join(__dirname,'../public/game.js'),'utf8');
 yes(src.includes('연결해 40 HPS와 공격속도 25%'), 'Buffer client tooltip reflects 40 HPS');
 yes(src.includes("if (p.character!=='light') for (const target of viewState.players)"), 'Light client visuals pass through enemy bodies');
 yes(src.includes('광선이 아군·적을 모두 관통'), 'Light tooltip explains symmetric pierce');
}
console.log(`PASS: ${checks} Light/Buffer focused assertions`);
