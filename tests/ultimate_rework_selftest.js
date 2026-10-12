'use strict';
const assert=require('assert/strict');
const game=require('../server');
const {CHARACTERS,activateUltimate,updateProjectiles,updateRoom,grantUltimateCharge,
  effectiveSpeed,spawnPatternUltimateVolley,newRoom,dealDamageDetailed,applyHealing,hasStatus}=game;
const NOW=1000000;
let tests=0;
function ok(condition,message){assert.ok(condition,message);tests++;}
function eq(actual, expected, message){assert.equal(actual,expected,message);tests++;}
function near(actual, expected, message){assert.ok(Math.abs(actual-expected)<1e-5, `${message}: ${actual} != ${expected}`);tests++;}
function newTestRoom(){const room=newRoom('UT',{displayNumber:1}); room.state='playing';room.matchStartedAt=NOW; room.matchEndAt=NOW+180000;room.nextUltimateAutoChargeAt=NOW+4000;room.network=null;room.sentFx=[];const conn={send(m){room.sentFx.push(m); return true;}};room.clients.set('dummy',conn);return room;}
function makePlayer(room,id,character,team='A',x=21,y=21){
 const d=CHARACTERS[character];let p={id,character,team,name:id,x,y,aimX:x,aimY:y+20,hp:d.hp,maxHp:d.hp,alive:true,invulnerableUntil:0,respawnAt:0,
  ultimateCharge:d.ultimateCost,ultimateUntil:0,ultimateUseSeq:0, statuses:Object.create(null),stats:game.makeMatchStats(character),damageContributors:Object.create(null),supportContributors:Object.create(null),lastDamageAt:0,lastDamageAttackerId:null,
  shield:0,maxShield:0,shieldUntil:0,shieldUncredited:0,shieldCreditBySource:Object.create(null),lastCombatAt:NOW,input:{up:false,down:false,left:false,right:false,fire:false},
  nextFireAt:0,lastPeriodicActionAt:0,shotSeq:0,projectileHitSeq:0,healHitSeq:0,abilityUseSeq:0,lastHealFeedbackAt:0,
  diaUltimateVolleyHits:new Map(),diaUltimateBurstsRemaining:0,diaUltimateNextBurstAt:0,diaUltimateVolleySeq:0,patternUltimateRemaining:0,patternUltimateNextAt:0};room.players.set(id,p);return p;
}
function run(room,time){updateRoom(room,1/50,time);}
// R: valid target only; no charge lost on an invalid input.
{
 const room=newTestRoom(),r=makePlayer(room,'r','runner','A',21,21),enemy=makePlayer(room,'e','shooter','B',21,25),ally=makePlayer(room,'a','water','A',22,22);
 eq(CHARACTERS.runner.ultimateCost,700,'runner charge');
 eq(activateUltimate(room,r,NOW,null),false,'runner missing target');eq(r.ultimateCharge,700,'no spent charge');
 eq(activateUltimate(room,r,NOW,'a'),false,'cannot bomb ally');
 enemy.y=28;eq(activateUltimate(room,r,NOW,'e'),false,'cannot bomb beyond 6 m');
 enemy.y=25;eq(activateUltimate(room,r,NOW,'e'),true,'bomb attached');eq(r.ultimateCharge,0,'charge consumed once');
 eq(room.pendingRunnerBombs.length,1,'fuse pending');eq(grantUltimateCharge(r,100,NOW+1000),0,'active lock prevents gain');
 const speed=effectiveSpeed(r,NOW+500,room);eq(speed,CHARACTERS.runner.speed,'no old speed ult');
 enemy.y=42;run(room,NOW+2000);eq(enemy.hp,250,'no early bomb damage');
 run(room,NOW+3020);eq(enemy.hp,25,'bomb damages 225 regardless distance');eq(room.pendingRunnerBombs.length,0,'fuse cleared');eq(r.ultimateCharge,0,'bomb cannot charge next ult');
}
{
 const room=newTestRoom(),r=makePlayer(room,'r','runner','A',21,21),enemy=makePlayer(room,'e','iron','B',21,24);
 eq(activateUltimate(room,r,NOW,'e'),true,'bomb attach second');game.die(room,r,NOW+50);eq(r.alive,false,'owner dead');
 run(room,NOW+3020);near(enemy.hp,397.5,'bomb persists after owner death with new iron 10% DR');
}
{
 const room=newTestRoom(),r=makePlayer(room,'r','runner','A',21,21),e=makePlayer(room,'e','shooter','B',21,24);
 activateUltimate(room,r,NOW,'e');game.die(room,e,NOW+300);run(room,NOW+3020);
 eq(room.pendingRunnerBombs.length,0,'bomb removed after target death');
}
// L: wall agnostic rectangle, actual shield and no collision/proj. Damage uses target.maxHp, not HP.
{
 const room=newTestRoom(),l=makePlayer(room,'l','laser','A',21,21),a=makePlayer(room,'a','iron','B',21,30),b=makePlayer(room,'b','shooter','B',23.5,40),outside=makePlayer(room,'o','runner','B',25,30),rear=makePlayer(room,'back','water','B',21,20);
 b.hp=80;b.shield=40;b.maxShield=500;
 eq(activateUltimate(room,l,NOW),true,'laser cast');
 near(a.hp,429,'iron 600 HP -> 190 raw × 0.9 = 171 actual');near(b.hp,35,'250 max HP -> 85 effective; 40 shield then 45 hp');eq(outside.hp,175,'outside rectangle safe');eq(rear.hp,250,'behind caster safe');
 near(l.shield,256,'laser shield equals effective 171+85');eq(l.shieldUntil,NOW+3000,'shield expires 3s');
 eq(room.projectiles.size,0,'rect attack spawns no real projectiles');
 eq(room.sentFx.some(x=>x.type==='ultimate_fx'&&x.kind==='rect'&&x.character==='laser'),true,'laser rectangle FX dispatched');
 eq(l.ultimateCharge,0,'laser impact not recycled');
}
{
 const room=newTestRoom(),l=makePlayer(room,'l','laser','A',21,21),a=makePlayer(room,'a','iron','B',21,30),b=makePlayer(room,'b','mecha','B',21,35),c=makePlayer(room,'c','iron','B',21,39),d=makePlayer(room,'d','mecha','B',21,42);
 activateUltimate(room,l,NOW);
 eq(l.shield,500,'laser shield capped at 500');
}
// Light: recipient and caster healed separately, no automatic 25% healer bonus.
{
 const room=newTestRoom(),l=makePlayer(room,'l','light','A',21,21),ally=makePlayer(room,'a','iron','A',21,30),e=makePlayer(room,'e','shooter','B',21,35),outside=makePlayer(room,'o','shooter','B',25,30);
 l.hp=50;ally.hp=300;
 eq(CHARACTERS.light.ultimateCost,800,'spotlight cost');eq(activateUltimate(room,l,NOW),true,'light cast');
 eq(ally.hp,400,'ally +100');eq(l.hp,150,'caster +100 only, not +25 or +200');eq(e.hp,200,'enemy 50');eq(outside.hp,250,'outside safe');
 eq(l.ultimateCharge,0,'light heal/damage did not recycle');eq(room.projectiles.size,0,'light AoE not projectile');
}
// F: 5 × 4, 30° fan and new aim on each shot, normal 2s burn (no 4s override), no bonus charge.
{
 const room=newTestRoom(),f=makePlayer(room,'f','fire','A',21,21);
 eq(activateUltimate(room,f,NOW),true,'fire cast');eq(room.projectiles.size,5,'fire first five');
 let shots=[...room.projectiles.values()];eq(shots.every(x=>x.damage===40 && x.burnDuration===2 && x.burnDps===10 && !x.countsForUltimate),true,'fire damage burn and charge');
 const dirs=shots.map(x=>Math.atan2(x.vy,x.vx)*180/Math.PI-90);near(dirs[0],-15,'left fan -15');near(dirs[4],15,'right fan 15');
 f.aimX=41;f.aimY=21;run(room,NOW+1000);eq(f.patternUltimateRemaining,2,'fire second volley state');
 let second=[...room.projectiles.values()].filter(x=>x.ultimateVolleyId?.endsWith(':1'));eq(second.length,5,'fire next five');near(second[2].vy,0,'fire aim can rotate');
 run(room,NOW+2000);run(room,NOW+3000);eq(f.patternUltimateRemaining,0,'fire all volleys emitted');eq(f.ultimateCharge,0,'fire charge remains 0');
}
// Hit-once per volley even when several large projectiles physically contact same victim.
{
 const room=newTestRoom(),f=makePlayer(room,'f','fire','A',21,21),e=makePlayer(room,'e','iron','B',21,25);
 activateUltimate(room,f,NOW);updateProjectiles(room,0.20,NOW+200);ok(e.hp>=520,'fire duplicate hits cannot exceed 40 damage');
 const burn=game.getStatus(e,'burn',NOW+200);ok(burn===null || burn.until===NOW+2200,'fire original 2sec burn');
}
// S: 8 × 4, rotation +11.25 deg, collision radius .52, same-shot cap 25.
{
 const room=newTestRoom(),p=makePlayer(room,'s','spray','A',21,21);
 eq(activateUltimate(room,p,NOW),true,'spray cast');eq(room.projectiles.size,8,'first eight');
 let shots=[...room.projectiles.values()];eq(shots.every(x=>x.damage===25 && x.radius===.52 && x.range===24 && !x.countsForUltimate),true,'spray bullets spec');
 const first=shots[0];near(Math.atan2(first.vy,first.vx),0,'spray first bearing 0');
 run(room,NOW+1000);const second=[...room.projectiles.values()].find(x=>x.ultimateVolleyId?.endsWith(':1'));
 ok(second,'second volley exists');near(Math.atan2(second.vy,second.vx)*180/Math.PI,11.25,'spray rotates 11.25');
 run(room,NOW+2000);run(room,NOW+3000);eq(p.patternUltimateRemaining,0,'spray all waves');
}
{
 const room=newTestRoom(),p=makePlayer(room,'s','spray','A',21,21),e=makePlayer(room,'e','iron','B',23,21);
 activateUltimate(room,p,NOW);updateProjectiles(room,.08,NOW+80);ok(e.hp>=575,'one spray volley capped at 25');
}
// Dia ultimate (Crystal Burst) preserved; Dia basic/form values are verified by release_1_8_selftest.js.
{
 const room=newTestRoom(),p=makePlayer(room,'d','dia','A',21,21);
 eq(activateUltimate(room,p,NOW),true,'dia cast regression');eq(room.projectiles.size,16,'dia first volley 16');
}
console.log(`PASS: ${tests} focused School Line 1.8 ultimate rework assertions`);
// Extra edge cases: damage cap physically applied after overlapping trajectories; invuln, clipped healing, cooldown locks.
{
 const room=newTestRoom(),f=makePlayer(room,'f','fire','A',21,21),e=makePlayer(room,'e','iron','B',21,24);
 activateUltimate(room,f,NOW);
 for(const proj of room.projectiles.values()) {proj.x=21;proj.y=22;proj.vx=0;proj.vy=28;}
 updateProjectiles(room,.10,NOW+100);
 near(e.hp,564,'five guaranteed fire hit candidates resolve only one 40 × iron DR 0.9');
 const burn=game.getStatus(e,'burn',NOW+100);
 ok(burn && burn.until===NOW+2100,'guaranteed fire burn exactly 2s');
 eq(f.ultimateCharge,0,'fire status no charge');
}
{
 const room=newTestRoom(),s=makePlayer(room,'s','spray','A',21,21),e=makePlayer(room,'e','iron','B',21,24);
 activateUltimate(room,s,NOW);
 for(const proj of room.projectiles.values()) {proj.x=21;proj.y=22;proj.vx=0;proj.vy=28;}
 updateProjectiles(room,.10,NOW+100);
 near(e.hp,577.5,'eight guaranteed spray hit candidates resolve only one 25 × iron DR 0.9');
}
{
 const room=newTestRoom(),l=makePlayer(room,'l','laser','A',21,21),e=makePlayer(room,'e','iron','B',21,30);
 e.invulnerableUntil=NOW+1000;
 activateUltimate(room,l,NOW);
 near(e.hp,e.maxHp,'invulnerable target ignored by laser');eq(l.shield,0,'blocked damage cannot produce shield');
}
{
 const room=newTestRoom(),l=makePlayer(room,'l','light','A',21,21),a=makePlayer(room,'a','water','A',21,30);
 a.hp=a.maxHp-15;l.hp=l.maxHp-20;
 activateUltimate(room,l,NOW);
 near(a.hp,a.maxHp,'light does not overheal');near(l.hp,l.maxHp,'light does not overheal self');
 eq(l.stats.healing,35,'light credit only 15+20 actual healing');
}
{
 const room=newTestRoom(),f=makePlayer(room,'f','fire','A',21,21);
 activateUltimate(room,f,NOW);game.applyStatus(room,null,f,'stun',2500,NOW+1000);
 run(room,NOW+1000);run(room,NOW+2000);
 eq(f.patternUltimateRemaining,1,'stunned fire waves skipped rather than queued');
 run(room,NOW+3000);eq(f.patternUltimateRemaining,0,'all wave slots consumed');
}
console.log('PASS: additional cap / invulnerability / overheal / stun edge assertions');
