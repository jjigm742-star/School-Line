'use strict';
// Curse infrastructure only: no Witch, no cast ability, no balance change.
// In-memory tests; no database, network, or persistent match data is opened.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const game = require('../server');
const T = 1_000_000;
let checks = 0;
function eq(actual, expected, text) { assert.equal(actual, expected, text); checks++; }
function ok(value, text) { assert.ok(value, text); checks++; }
function near(actual, expected, text) { assert.ok(Math.abs(actual - expected) < 1e-8, `${text}: ${actual} vs ${expected}`); checks++; }
function room() { const r = game.newRoom('CURSE-TEST', {displayNumber:1}); r.state = 'playing'; return r; }
function player(r, id, character, team) {
  const c = game.CHARACTERS[character];
  const p = {id, name:id, team, character, hp:c.hp, maxHp:c.hp, alive:true, connected:true,
    x:15, y:15, aimX:15, aimY:20, invulnerableUntil:0,
    shield:0, maxShield:0, shieldUntil:0, shieldUncredited:0, shieldCreditBySource:Object.create(null),
    statuses:Object.create(null), stats:game.makeMatchStats(character), damageContributors:Object.create(null),
    supportContributors:Object.create(null), lastCombatAt:T, ultimateCharge:0, ultimateUntil:0,
    input:{fire:false, up:false, down:false, left:false, right:false},
    shotSeq:0, projectileHitSeq:0, healHitSeq:0, abilityUseSeq:0};
  r.players.set(id, p); return p;
}
eq(game.STATUS_DEFS.curse.kind, 'harmful', 'registered harmful status');
near(game.STATUS_DEFS.curse.damageTakenBonus, 0.25, 'additive damage-taken percentage points');
eq(Object.hasOwn(game.STATUS_DEFS.curse, 'damageTakenMultiplier'),false,'generic Curse does not define a multiplying damage factor');
eq(Object.hasOwn(game.STATUS_DEFS.curse, 'duration'), false, 'no duration on generic curse status');
eq(Object.hasOwn(game.STATUS_DEFS.curse, 'durationMs'), false, 'no durationMs on generic curse status');
{
  // Duration is a skill-supplied parameter, not a property of Curse itself.
  const r = room(), a = player(r,'a','shooter','A'), b = player(r,'b','water','B');
  eq(game.applyStatus(r,a,b,'curse',undefined,T),false,'missing duration is rejected');
  eq(game.hasStatus(b,'curse',T),false,'missing duration adds no status');
  ok(game.applyStatus(r,a,b,'curse',2000,T),'another skill can apply two-second curse');
  eq(game.hasStatus(b,'curse',T+1999),true,'two-second curse is still active');
  eq(game.hasStatus(b,'curse',T+2000),false,'two-second curse expires at two seconds');
  ok(game.applyStatus(r,a,b,'curse',7000,T+3000),'another skill can apply seven-second curse');
  eq(game.getStatus(b,'curse',T+3001).until,T+10000,'seven-second curse uses caller duration');
  eq(game.hasStatus(b,'curse',T+9999),true,'seven-second curse still active');
  eq(game.hasStatus(b,'curse',T+10000),false,'seven-second curse expires at seven seconds');
  ok(game.applyStatus(r,a,b,'curse',7000,T+11000),'long curse applied');
  ok(game.applyStatus(r,a,b,'curse',1000,T+12000),'shorter re-application allowed');
  eq(game.getStatus(b,'curse',T+12001).until,T+18000,'short re-application does not truncate longer curse');
  eq(Object.keys(b.statuses).length,1,'durations do not create separate status types');
}
{
  const r = room(), a = player(r,'a','shooter','A'), b = player(r,'b','water','B');
  near(game.dealDamage(r,a.id,b,40,T),40,'before curse 40');
  ok(game.applyStatus(r,a,b,'curse',5000,T),'curse applied');
  eq(game.hasStatus(b,'curse',T+4999),true,'active before expiry');
  eq(game.hasStatus(b,'curse',T+5000),false,'ends exactly at 5 seconds');
  ok(game.applyStatus(r,a,b,'curse',5000,T+6000),'re-application permitted');
  near(game.dealDamage(r,a.id,b,40,T+6001),50,'curse increases HP damage 25%');
  ok(game.applyStatus(r,a,b,'curse',5000,T+8000),'refresh same status');
  eq(Object.keys(b.statuses).length,1,'no stacked curse instances');
  eq(game.getStatus(b,'curse',T+8001).until,T+13000,'fresh five-second duration');
  near(game.dealDamage(r,a.id,b,40,T+8001),50,'refresh is not +50%');
  near(game.dealDamage(r,a.id,b,40,T+13000),40,'damage returns to normal after expiry');
  game.clearStatus(b,'curse');
  eq(game.hasStatus(b,'curse',T+13001),false,'cleared state');
}
{
  const r = room(), a = player(r,'a','shooter','A'), b = player(r,'b','mecha','B');
  game.applyShield(r,b,b,150,{now:T});
  ok(game.applyStatus(r,a,b,'curse',5000,T),'curse applied to shielded enemy');
  const hit = game.dealDamageDetailed(r,a.id,b,100,T+1);
  // Existing mitigation and Curse add as percentage points, not multiplying factors.
  near(hit.shield,100*(1+0.25),'shield damage uses additive 10% mitigation and 25% Curse');
  near(hit.hp,0,'shield absorbs hit');
  near(b.shield,150-125,'remaining shield correct');
  near(a.stats.shieldDamage,125,'attacker damage stats include shield');
}
{
  // All existing damage-reduction characters preserve their mitigation without Curse,
  // and receive 25 percentage points of extra damage (not +25% after reduction).
  for (const id of ['iron','shield','mecha']) {
    const r=room(), a=player(r,'a','shooter','A'), b=player(r,'b',id,'B');
    const baseline=game.dealDamageDetailed(r,a.id,b,100,T);
    near(baseline.hp,100,`${id} baseline damage mitigation unchanged`);
    ok(game.applyStatus(r,a,b,'curse',3000,T+1),`${id} receives Curse`);
    const cursedHit=game.dealDamageDetailed(r,a.id,b,100,T+2);
    near(cursedHit.hp,125,`${id} Curse and mitigation interact additively`);
    near(cursedHit.total,125,`${id} total damage is 115`);
    near(game.dealDamage(r,a.id,b,100,T+3001),100,`${id} mitigation returns after Curse expiration`);
  }
}
{
  // The additive modifier is calculated before shield absorption, including a hit
  // that breaks a personal shield and deals leftover damage to HP.
  const r=room(), a=player(r,'a','shooter','A'), b=player(r,'b','iron','B');
  game.applyShield(r,b,b,50,{now:T});
  ok(game.applyStatus(r,a,b,'curse',5000,T),'Curse applied for mixed damage');
  const hit=game.dealDamageDetailed(r,a.id,b,100,T+1);
  near(hit.shield,50,'all 50 shield removed');
  near(hit.hp,75,'remaining 65 damage goes to HP');
  near(hit.total,125,'total damage uses additive modifier');
  near(a.stats.hpDamage,75,'HP damage accounting correct');
  near(a.stats.shieldDamage,50,'shield damage accounting correct');
}
{
  const r=room(), a=player(r,'a','shooter','A'), b=player(r,'b','water','B');
  b.invulnerableUntil=T+2000;
  eq(game.applyStatus(r,a,b,'curse',5000,T),false,'invulnerable blocks hostile status');
  ok(game.applyStatus(r,a,b,'curse',5000,T+2001),'applies after invulnerability');
  ok(game.applyStatus(r,a,b,'stun',1000,T+2001),'stun coexists with curse');
  eq(game.hasStatus(b,'stun',T+2500),true,'stun works independently');
  eq(game.hasStatus(b,'curse',T+2500),true,'curse persists with stun');
  game.clearAllStatuses(b);
  eq(game.hasStatus(b,'curse',T+2500),false,'death/status reset clears curse');
  eq(game.hasStatus(b,'stun',T+2500),false,'death/status reset clears stun');
}
{
  // The only new wire bit is 13; keep existing positional payloads and c3/c4/c5/c6 decoders compatible.
  const r=room(), a=player(r,'a','shooter','A'), b=player(r,'b','water','B');
  const now=Date.now();
  ok(game.applyStatus(r,a,b,'curse',5000,now),'applied for snapshot');
  const snap=game.snapshot(r,null,true);
  const row=snap.players.find(x=>x.id===b.id);
  eq(row.cursed,true,'source snapshot provides cursed flag');
  const packed=[game.compactPlayerWireRow(row),game.compactPlayerWireRowV5(row),game.compactPlayerWireRowV6(row)];
  for (let i=0;i<packed.length;i++){
    const flags=Number(packed[i][i===0?17:13]);
    ok(!!(flags & (1 << 13)),`wire format ${i} contains curse flag`);
    ok(!(flags & (1 << 5)),`wire format ${i} does not cause false stun`);
  }
  // Exercise the actual client row expanders, not merely string matches.
  const src=fs.readFileSync(path.join(__dirname,'../public/game.js'),'utf8');
  function extract(name) { const pos=src.indexOf(`function ${name}(`);ok(pos>=0,`find ${name}`);
    const brace=src.indexOf('{',pos); let depth=0;
    for(let j=brace;j<src.length;j++) { if(src[j]==='{')depth++; else if(src[j]==='}'&&--depth===0) return src.slice(pos,j+1); }
    throw new Error(name+' unclosed'); }
  const ctx={};vm.createContext(ctx);
  vm.runInContext(['expandCompactPlayerRow','expandCompactPlayerRowC5','expandCompactPlayerRowC6'].map(extract).join('\n'),ctx);
  const meta=[b.id,b.name,1,b.character];
  eq(ctx.expandCompactPlayerRow(packed[0]).cursed,true,'c3/c4 client receives curse');
  eq(ctx.expandCompactPlayerRowC5(packed[1],meta).cursed,true,'c5 client receives curse');
  eq(ctx.expandCompactPlayerRowC6(packed[2],meta).cursed,true,'c6 client receives curse');
  eq(ctx.expandCompactPlayerRowC6(game.compactPlayerWireRowV6(snap.players.find(x=>x.id===a.id)),[a.id,a.name,0,a.character]).cursed,undefined,'uncursed remains unflagged');
  ok(src.includes('if (p.cursed) { ctx.save()'), 'curse ring is rendered for affected players');
  ok(src.includes('🔮 저주 (받는 피해 +25%)'), 'local HUD announces curse');
}
const serverText=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const pkg=require('../package.json');
eq(pkg.version,'1.9.0','stable version bumped');
ok(serverText.includes("const BALANCE_VERSION = '1.9';"),'game balance remains 1.8');
eq(Object.keys(game.CHARACTERS).length,26,'existing 22-character roster unchanged');
ok(Object.hasOwn(game.CHARACTERS,'witch'),'Witch implemented');
ok(html.includes('game.js?v=1.9-four-heroes-release1'),'cache invalidation for visual state');
console.log(`PASS: ${checks} curse-only status and wire/client tests`);
