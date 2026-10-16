'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const g=require('../server');
const T=1_000_000;let n=0;
const ok=(v,msg)=>{assert.ok(v,msg);n++};
const eq=(v,e,msg)=>{assert.equal(v,e,msg);n++};
const near=(v,e,msg)=>{assert.ok(Math.abs(v-e)<1e-6,`${msg}: ${v} !== ${e}`);n++};
function room(){const r=g.newRoom('PATCH19',{displayNumber:1});r.state='playing';r.matchStartedAt=T;r.matchEndAt=T+180000;r.nextUltimateAutoChargeAt=T+4000;return r;}
function player(r,id,character,team='A',x=12,y=15){
 const d=g.CHARACTERS[character];const p={id,name:id,character,team,x,y,aimX:x,aimY:y+24,hp:d.hp,maxHp:d.hp,alive:true,connected:true,
  invulnerableUntil:0,respawnAt:0,ultimateCharge:0,ultimateUntil:0,ultimateUseSeq:0,statuses:Object.create(null),
  stats:g.makeMatchStats(character),damageContributors:Object.create(null),supportContributors:Object.create(null),lastDamageAt:0,lastDamageAttackerId:null,
  shield:0,maxShield:0,shieldUntil:0,shieldUncredited:0,shieldCreditBySource:Object.create(null),lastCombatAt:T,
  input:{up:false,down:false,left:false,right:false,fire:false},nextFireAt:0,lastPeriodicActionAt:0,shotSeq:0,projectileHitSeq:0,healHitSeq:0,abilityUseSeq:0,
  diaUltimateVolleyHits:new Map(),diaUltimateBurstsRemaining:0,diaUltimateNextBurstAt:0,patternUltimateRemaining:0,patternUltimateNextAt:0,
  pendingUltimateAt:0,pendingUltimateId:null,respawnShieldAt:0};r.players.set(id,p);return p;
}
const expected={witch:['탱커',500,5,1,1400],hacker:['딜러',225,7,.8,1000],rescue:['힐러',200,6,.65,1000],drain:['딜러',250,6,.8,1000]};
eq(Object.keys(g.CHARACTERS).length,26,'26-character roster');
for (const [id,arr] of Object.entries(expected)) {
 const d=g.CHARACTERS[id];
 eq(d.role,arr[0],id+' role');eq(d.hp,arr[1],id+' hp');eq(d.speed,arr[2],id+' speed');eq(d.radius,arr[3],id+' radius');eq(d.ultimateCost,arr[4],id+' ultimate cost');
 for (const file of ['portrait.webp','token.webp']) ok(fs.statSync(path.join(__dirname,'../public/assets/characters',id,file)).size>1000,`${id} ${file} asset`);
}
eq(g.CHARACTERS.witch.beamDps,70,'witch beam DPS');eq(g.CHARACTERS.witch.range,16,'witch beam range');
eq(g.CHARACTERS.hacker.damage,18,'hacker shot damage');eq(g.CHARACTERS.hacker.fireRate,5,'hacker rate');eq(g.CHARACTERS.hacker.range,12,'hacker range');
eq(g.CHARACTERS.rescue.heal,12,'rescue heal/shot');eq(g.CHARACTERS.rescue.damage,10,'rescue damage/shot');
eq(g.CHARACTERS.drain.damage,16,'drain shot damage');eq(g.CHARACTERS.drain.lifestealOnHit,4,'drain lifesteal');
for(const id of ['iron','shield','mecha']){
 const r=room(),t=player(r,'target',id),a=player(r,'attacker','shooter','B');
 near(g.dealDamageDetailed(r,a.id,t,100,T).total,100,`${id} 0% DR`);
 g.applyStatus(r,a,t,'curse',5000,T+1);
 near(g.dealDamageDetailed(r,a.id,t,100,T+2).total,125,`${id} curse +25% with zero DR`);
}
// Witch single-target ability ignores wall/range, nonstacking, immunity and cooldown.
{
 const r=room(),w=player(r,'w','witch','A',10,10),e=player(r,'e','iron','B',40,58);
 ok(g.activateNewHeroAbility(r,w,e,T),'witch curse no LOS or range');
 eq(g.getStatus(e,'curse',T+1).until,T+5000,'witch applies 5 seconds');
 ok(!g.activateNewHeroAbility(r,w,e,T+9000),'witch ability 10-sec cooldown');
 ok(g.activateNewHeroAbility(r,w,e,T+10000),'witch can reapply at 10sec');
 eq(Object.keys(e.statuses).length,1,'witch curse does not stack');
 e.invulnerableUntil=T+22000;
 ok(!g.activateNewHeroAbility(r,w,e,T+20000),'invulnerability blocks harmful curse');
}
// Witch warning must move with caster, resolve on live position, and lock charge for full 7s.
{
 const r=room(),w=player(r,'w','witch','A',10,15),nearFinal=player(r,'final','shooter','B',32,29),nearOld=player(r,'old','shooter','B',10,16);
 w.ultimateCharge=1400;
 ok(g.activateUltimate(r,w,T),'witch ultimate cast');
 eq(w.pendingUltimateAt,T+2000,'two-second telegraph');eq(w.ultimateUntil,T+7000,'seven-second charge lock');
 w.x=32;w.y=28;
 g.updateRoom(r,.02,T+2000);
 ok(g.hasStatus(nearFinal,'curse',T+2000),'target near final position cursed');
 ok(g.hasStatus(nearFinal,'slow',T+2000),'target near final position slowed');
 ok(!g.hasStatus(nearOld,'curse',T+2000),'target near old position untouched');
 near(g.effectiveSpeed(nearFinal,T+2001,r),5,'movement slow is one speed tier');
 eq(g.grantUltimateCharge(w,500,T+6000),0,'full charge lock survives warning');
 eq(g.getStatus(nearFinal,'curse',T+2001).until,T+7000,'ultimate curse lasts 5 seconds');
 eq(g.grantUltimateCharge(w,10,T+7000),10,'charge resumes after 7 sec');
}
{
 const r=room(),w=player(r,'w','witch');w.ultimateCharge=1400;
 g.activateUltimate(r,w,T);g.die(r,w,T+1000);
 eq(w.pendingUltimateId,null,'witch dying in warning cancels cast');eq(w.ultimateCharge,0,'charge spent despite failure');
}
// Hacker remains targetable by ordinary damage even when stealthed.
{
 const r=room(),h=player(r,'h','hacker'),e=player(r,'e','shooter','B');
 ok(g.activateNewHeroAbility(r,h,null,T),'hacker stealth');eq(h.stealthUntil,T+4000,'stealth four sec');
 eq(g.dealDamageDetailed(r,e.id,h,20,T+100).total,20,'invisible is not invulnerable');
 ok(!g.activateNewHeroAbility(r,h,null,T+4001),'stealth cooldown is 12 sec from cast');
 h.ultimateCharge=1000;g.applyShield(r,e,e,175,{now:T});
 ok(g.activateUltimate(r,h,T),'hacker EMP');eq(e.shield,0,'EMP removes old shield');
 eq(e.hp,e.maxHp,'EMP deals no HP damage');ok(g.hasStatus(e,'stun',T+500),'EMP stun one sec');
 g.applyShield(r,e,e,50,{now:T+200});eq(e.shield,50,'EMP does not suppress newly created shields');
 eq(g.grantUltimateCharge(h,3,T+999),0,'EMP recharge lock');eq(g.grantUltimateCharge(h,3,T+1000),3,'EMP lock ends 1 sec');
}
// Rescue teleport (own center exactly overlaps target) + 30 actual healing.
{
 const r=room(),h=player(r,'h','rescue'),ally=player(r,'a','shooter','A',40,58),other=player(r,'other','shooter','B',15,17);
 ally.hp-=90;
 ok(g.activateNewHeroAbility(r,h,ally,T),'rescue targets ally across map');
 near(h.x,ally.x,'teleport exactly matches target X');near(h.y,ally.y,'teleport exactly matches target Y');
 near(ally.hp,g.CHARACTERS.shooter.hp-60,'rescue heals 30');
 ok(!g.activateNewHeroAbility(r,h,ally,T+1000),'rescue cooldown');
 ok(!g.activateNewHeroAbility(r,h,h,T+12000),'rescue cannot target self');
 ok(!g.activateNewHeroAbility(r,h,other,T+12000),'rescue cannot target enemy');
}
// Rescue overflow split correctly, including full HP and exact 500 shield cap.
{
 const r=room(),h=player(r,'h','rescue','A',15,15),a=player(r,'a','shooter','A',15,16),b=player(r,'b','shooter','A',15,17),c=player(r,'c','shooter','A',15,18);
 h.hp-=100;a.hp-=50;b.hp-=25; // c full
 h.ultimateCharge=1000;
 ok(g.activateUltimate(r,h,T),'rescue ultimate');
 near(h.hp,175,'self deficit100 receives75');eq(h.shield,0,'self excess zero');
 near(a.hp,250,'deficit50 filled');eq(a.shield,25,'deficit50 makes 25shield');
 near(b.hp,250,'deficit25 filled');eq(b.shield,50,'deficit25 makes 50shield');
 eq(c.shield,75,'full HP grants 75shield');
 eq(h.ultimateCharge,0,'ultimate does not recharge itself');
 eq(a.shieldUntil,T+3000,'shield lasts 3 seconds');
 eq(g.grantUltimateCharge(h,10,T+2999),0,'3s rescue ultimate charge lock');
 eq(g.grantUltimateCharge(h,10,T+3000),10,'rescue ultimate lock expires');
}
// Rescue's new shield grant expires in 3s even if an earlier personal shield lasts longer.
{
 const r=room(),h=player(r,'h','rescue','A',12,15),a=player(r,'a','iron','A',12,16);
 g.applyShield(r,h,a,100,{now:T});a.shieldUntil=T+10000;
 h.ultimateCharge=1000;
 ok(g.activateUltimate(r,h,T),'rescue shield can coexist with old shield');
 eq(a.shield,175,'old 100 + rescue75 shields add');
 eq(a.shieldUntil,T+10000,'old shield expiration remains intact');
 g.updateRoom(r,.02,T+2999);
 eq(a.shield,175,'rescue shield lasts until 3s');
 g.updateRoom(r,.02,T+3000);
 near(a.shield,100,'exact rescue 75 expires at 3s; prior 100 survives');
 eq(a.shieldUntil,T+10000,'old shield still has original expiry');
}

// Drain on-hit lifesteal includes shield contact and only effective self-heal charges.
{
 const r=room(),d=player(r,'d','drain','A',12,15),e=player(r,'e','iron','B',12,19);
 d.hp-=40;g.applyShield(r,e,e,100,{now:T});
 d.ultimateCharge=0;
 g.spawnProjectile(r,d,g.CHARACTERS.drain,T);
 g.updateProjectiles(r,.20,T+200);
 near(e.shield,84,'drain 16 damage vs shield');near(d.hp,214,'drain heals 4 on shield hit');
 near(d.ultimateCharge,20,'effective shield damage 16 + real healing 4 both charge');
 d.hp=d.maxHp;d.ultimateCharge=0;
 g.spawnProjectile(r,d,g.CHARACTERS.drain,T+300);
 g.updateProjectiles(r,.20,T+500);
 near(d.hp,d.maxHp,'full HP drain does not overheal');near(d.ultimateCharge,16,'full HP drain only receives damage charge');
 d.hp=d.maxHp-100;d.ultimateCharge=1000;
 ok(g.activateUltimate(r,d,T+600),'drain ultimate');near(d.hp,d.maxHp,'vampire heals100');eq(d.ultimateCharge,0,'vampire heal does not recharge');
 near(g.periodicActionRateMultiplier(r,d,T+700),1.25,'vampire attack speed +25%');
 eq(g.grantUltimateCharge(d,30,T+700),0,'vampire 8-second recharge lock');
 near(g.periodicActionRateMultiplier(r,d,T+8600),1,'vampire attack boost expires');
}
// Live client can decode invisible flag/ability cooldown in compressed network format.
{
 const src=fs.readFileSync(path.join(__dirname,'../public/game.js'),'utf8');
 function extract(name){const pos=src.indexOf(`function ${name}(`),brace=src.indexOf('{',pos);let depth=0;for(let j=brace;j<src.length;j++) {if(src[j]==='{')depth++;else if(src[j]==='}'&&--depth===0) return src.slice(pos,j+1);}throw new Error(name);}
 const ctx={};vm.createContext(ctx);vm.runInContext(['expandCompactPlayerRow','expandCompactPlayerRowC5','expandCompactPlayerRowC6'].map(extract).join('\n'),ctx);
 const p={id:'h',name:'h',team:'A',character:'hacker',x:1,y:1,hp:200,maxHp:225,shield:0,maxShield:0,alive:true,aimX:1,aimY:4,stealthed:true,newAbilityCooldownMs:9000,stealthMs:4000};
 for(const [wire,fn,meta] of [[g.compactPlayerWireRow(p),'expandCompactPlayerRow',undefined],[g.compactPlayerWireRowV5(p),'expandCompactPlayerRowC5',['h','h',0,'hacker']],[g.compactPlayerWireRowV6(p),'expandCompactPlayerRowC6',['h','h',0,'hacker']]]){
  const decoded=ctx[fn](wire,meta);eq(decoded.stealthed,true,fn+' invis flag');eq(decoded.newAbilityCooldownMs,9000,fn+' cooldown');eq(decoded.stealthMs,4000,fn+' duration');
 }
 ok(src.includes("p.stealthed && !spectatorMode"),'enemy-only render suppression exists');
 ok(src.includes("p.id === myId) ctx.globalAlpha = 0.42"),'stealth caster-only alpha effect exists');
 for(const id of Object.keys(expected)){ok(src.includes(`${id}: { title:`),`story ${id} available`);}
}
eq(require('../package.json').version,'1.9.0','package version');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');ok(html.includes('정식 1.9'),'client label 1.9');
console.log(`PASS: ${n} School Line 1.9 hero/DR/wire/asset integration assertions`);
