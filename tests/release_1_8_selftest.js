'use strict';
// Official School Line 1.8: character balance, authoritative runtime behavior, and release metadata.
// This is a pure in-memory test; no PostgreSQL connection, server start, or live match is needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const game = require('../server');
const { CHARACTERS, newRoom, registerDirectKill, activateDiaForm, endDiaForm,
  currentAttackDef, dealDamageDetailed, spawnProjectile, resolveDelayedUltimate,
  getStatus, statsSeriesForBalanceVersion } = game;
const T = 1_000_000;
let assertions = 0;
function eq(a,b,why){assert.equal(a,b,why);assertions++;}
function truth(v,why){assert.ok(v,why);assertions++;}
function near(a,b,why){assert.ok(Math.abs(a-b)<1e-8,`${why}: ${a} != ${b}`);assertions++;}
function room(){const r=newRoom('RELEASE_18',{displayNumber:1});r.state='playing';r.matchStartedAt=T;r.matchEndAt=T+180000;return r;}
function player(r,id,character,team='A',x=17,y=17){
 const d=CHARACTERS[character];const p={id,name:id,character,team,x,y,aimX:x,aimY:y+18,
   hp:d.hp,maxHp:d.hp,alive:true,connected:true,invulnerableUntil:0,respawnAt:0,
   diaFormUntil:0,diaCooldownUntil:0,ultimateCharge:0,ultimateUntil:0,
   stats:game.makeMatchStats(character),statuses:Object.create(null),
   shield:0,maxShield:0,shieldUntil:0,shieldUncredited:0,shieldCreditBySource:Object.create(null),
   damageContributors:Object.create(null),supportContributors:Object.create(null),input:{up:false,down:false,left:false,right:false,fire:false},
   lastCombatAt:T,shotSeq:0,projectileHitSeq:0,healHitSeq:0,abilityUseSeq:0};
 r.players.set(id,p);return p;
}
// The release marker has no experimental patch suffix. Statistics must be a distinct 1.8 series.
const serverText=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const pkg=require('../package.json');
truth(serverText.includes("const BALANCE_VERSION = '1.8';"),'release balance version exactly 1.8');
truth(serverText.includes('const GAME_VERSION = BALANCE_VERSION;'),'display 1.8 (not an alpha prototype)');
truth(!serverText.includes("COMPETITIVE_BUILD_ID = '1.8.2"),'prototype build id removed');
eq(pkg.version,'1.8.0','package uses valid stable semver');
truth(html.includes('정식 1.8'),'player-facing version label updated');
const clientText=fs.readFileSync(path.join(__dirname,'../public/game.js'),'utf8');
truth(clientText.includes('95 DPS 광선'),'Dia in-game ability description updated to 95 DPS');
truth(clientText.includes('폼 상태와 관계없이 적 처치 시 폼체인지 쿨타임이 6초 감소'),'Dia in-game description now applies to all kills');
eq(statsSeriesForBalanceVersion('1.8'),'1.8','release belongs to 1.8 stats series');
eq(statsSeriesForBalanceVersion('1.7.1'),'1.7','old 1.7 stats preserved under separate series');
// Dia's projectile form values and kills outside and inside form.
eq(CHARACTERS.dia.formBeamDps,95,'Dia-form beam 95 DPS');
eq(CHARACTERS.dia.formKillCooldownReduction,6,'Dia credited kill cooldown reduction 6s');
{
 const r=room(), d=player(r,'dia','dia'), enemy=player(r,'enemy','shooter','B',17,22);
 // Base form, cooldown running (e.g. after a previous form use).
 d.diaCooldownUntil=T+14000;
 eq(currentAttackDef(d,T).damage,13,'Dia base attack remains 13 damage');
 registerDirectKill(r,d.id,T);
 eq(d.diaCooldownUntil,T+8000,'normal-form kill deducts 6 seconds');
 eq(d.stats.kills,1,'normal-form kill is recorded');
 eq(d.stats.diaFormKills,0,'normal-form kill does not alter historical Dia-form-only metric');
 registerDirectKill(r,d.id,T+500);
 eq(d.diaCooldownUntil,T+2000,'second kill also deducts 6 seconds');
 registerDirectKill(r,d.id,T+1000);
 eq(d.diaCooldownUntil,T+1000,'cooldown clamps to ready, never in past');
 eq(d.stats.diaFormKills,0,'base-form kills still excluded from Dia-form kill metric');
 d.diaCooldownUntil=0;
 registerDirectKill(r,d.id,T+1500);
 eq(d.diaCooldownUntil,0,'kill with no active cooldown does not initiate one');
 eq(enemy.hp,250,'test does not mutate targets');
}
{
 const r=room(),d=player(r,'dia','dia'), enemy=player(r,'enemy','shooter','B',17,22);
 eq(activateDiaForm(d,T),true,'Dia form still activates');
 eq(d.diaCooldownUntil,T+16000,'form initial cooldown stays 16 sec');
 eq(currentAttackDef(d,T+100).beamDps,95,'transformed attack uses 95 DPS');
 registerDirectKill(r,d.id,T+100);
 eq(d.diaCooldownUntil,T+10000,'Dia-form kill deducts 6 seconds');
 eq(d.stats.diaFormKills,1,'Dia-form kill tracking is retained');
 endDiaForm(d);
 eq(currentAttackDef(d,T+500).damage,13,'returning to base attack still works');
 registerDirectKill(r,d.id,T+500);
 eq(d.diaCooldownUntil,T+4000,'out-of-form kill shortens ongoing form cooldown');
 eq(d.stats.diaFormKills,1,'base-form kill does not inflate Dia-form metric');
 eq(enemy.hp,250,'unchanged enemy fixture');
}
// Iron: 20m/s projectile and 10% DR along the same damage resolver used by projectiles, beams etc.
eq(CHARACTERS.iron.hp,600,'Iron HP unchanged');
eq(CHARACTERS.iron.damage,17,'Iron base damage unchanged');
eq(CHARACTERS.iron.fireRate,5,'Iron fire rate unchanged');
eq(CHARACTERS.iron.range,24,'Iron range unchanged');
eq(CHARACTERS.iron.projectileSpeed,20,'Iron projectile speed raised 14 to 20');
eq(CHARACTERS.iron.projectileRadius,.32,'Iron projectile radius unchanged');
eq(CHARACTERS.iron.ultimateStunDuration,2,'Iron stun increases 1.5 to 2 sec');
eq(CHARACTERS.iron.ultimateDelay,2,'Iron 2 sec telegraph retained');
eq(CHARACTERS.iron.ultimateDamage,50,'Iron ultimate damage unchanged');
eq(CHARACTERS.iron.ultimateCost,1200,'Iron ult charge unchanged');
truth(CHARACTERS.iron.ultimateDescription.includes('2초 기절'),'Iron client-visible description matches new duration');
{
 const r=room(),iron=player(r,'iron','iron','A'),enemy=player(r,'enemy','shooter','B');
 const applied=dealDamageDetailed(r,enemy.id,iron,100,T);
 near(applied.total,90,'10% damage reduction yields 90 damage');
 near(iron.hp,510,'Iron actually loses 90 HP');
 spawnProjectile(r,iron,CHARACTERS.iron,T);
 const bullet=[...r.projectiles.values()][0];
 truth(!!bullet,'Iron projectile spawned');
 near(Math.hypot(bullet.vx,bullet.vy),20,'actual Iron projectile physics uses 20m/s');
 eq(bullet.damage,17,'Iron projectile damage unchanged');
}
{
 const r=room(),iron=player(r,'iron','iron','A',15,15),enemy=player(r,'enemy','shooter','B',15,20);
 const success=resolveDelayedUltimate(r,iron,'iron',T+2000);
 eq(success,true,'Iron delayed ultimate resolves');
 eq(enemy.hp,200,'Iron ultimate applies 50 to enemy');
 const status=getStatus(enemy,'stun',T+2000);
 truth(!!status,'enemy stunned by Iron');
 eq(status.until,T+4000,'stun is applied for precisely 2 seconds');
 truth(!!getStatus(enemy,'stun',T+3999),'stun remains until 1ms before expiry');
 eq(getStatus(enemy,'stun',T+4000),null,'stun expires on time');
}
// Spot-check all prior tuning still included, along with the two previously tuned supports.
eq(CHARACTERS.runner.damage * CHARACTERS.runner.fireRate,65,'Runner DPS preserved');
eq(CHARACTERS.runner.ultimateDamage,225,'Runner bomb retained');
eq(CHARACTERS.shooter.ultimateCost,700,'Shooter ultimate cost retained');
eq(CHARACTERS.sniper.damage,60,'Sniper base damage retained');
eq(CHARACTERS.sniper.ultimateDamage,80,'Sniper ultimate damage retained');
eq(CHARACTERS.light.beamAllyHitPadding,.5,'Light ally pad retained');
eq(CHARACTERS.light.beamEnemyHitPadding,.2,'Light enemy pad retained');
eq(CHARACTERS.buffer.linkHealHps,40,'Buffer base 40 HPS retained');
eq(CHARACTERS.buffer.ultimateLinkHealHps,65,'Buffer ult 65 HPS retained');
console.log(`PASS: ${assertions} official 1.8 release assertions (Dia/Iron/metadata/regressions)`);
