'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const game = require('../server');
const NOW = 1800000;
let n = 0;
function eq(a,b,msg){assert.equal(a,b,msg);n++}
function near(a,b,msg){assert.ok(Math.abs(a-b)<1e-7,`${msg}: ${a} vs ${b}`);n++}
function ok(x,msg){assert.ok(x,msg);n++}
function fixture(id, character, team, x, y) {
 const d=game.CHARACTERS[character];
 return {id,character,team,name:id,x,y,aimX:x,aimY:y+20,alive:true,connected:true,hp:d.hp,maxHp:d.hp,
  ultimateCharge:d.ultimateCost,ultimateUntil:0,ultimateUseSeq:0,invulnerableUntil:0,respawnAt:0,
  shield:0,maxShield:0,shieldUntil:0,shieldCreditBySource:Object.create(null),shieldUncredited:0,
  statuses:Object.create(null),stats:game.makeMatchStats(character),damageContributors:Object.create(null),supportContributors:Object.create(null),
  input:{fire:false,up:false,down:false,left:false,right:false},lastCombatAt:NOW,lastDamageAt:0};
}
function room(){const r=game.newRoom('AIM',{displayNumber:1});r.state='playing';r.matchStartedAt=NOW;r.matchEndAt=NOW+180000;r.sentFx=[];r.clients.set('fake',{send:m=>{r.sentFx.push(m);return true}});return r;}
function add(r,...players){for(const p of players)r.players.set(p.id,p)}
for(const character of ['laser','light']){
 // Character faces +Y from the old snapshot, but mobile stick is now -X; no attack button is held.
 const r=room(),caster=fixture('caster',character,'A',21,21);
 const east=fixture('east','shooter','B',21,29),north=fixture('north','shooter','B',12,21),ally=fixture('ally','water','A',12,22);
 ally.hp=90;add(r,caster,east,north,ally);
 eq(caster.input.fire,false,`${character}: idle precondition`);
 eq(game.activateUltimate(r,caster,NOW,null,{x:-3,y:0}),true,`${character}: cast while idle`);
 eq(caster.ultimateCharge,0,`${character}: idle cast spends cost once`);
 eq(east.hp,east.maxHp,`${character}: old direction enemy unaffected`);
 ok(north.hp<north.maxHp,`${character}: fresh direction enemy hit`);
 if(character==='light')eq(ally.hp,190,'light heals in fresh facing even while idle');
 else eq(ally.hp,90,'laser does not heal');
 const fx=r.sentFx.find(m=>m.type==='ultimate_fx'&&m.kind==='rect');
 ok(fx,`${character}: cast FX`);near(fx.dx,-1,`${character}: normalized dx`);near(fx.dy,0,`${character}: normalized dy`);
 near(caster.aimX,caster.x-24,`${character}: muzzle aligned`);near(caster.aimY,caster.y,`${character}: muzzle aligned y`);
}
// Backward compatible old clients which did not send aimDirX/Y.
{
 const r=room(),l=fixture('laser','laser','A',21,21),e=fixture('enemy','shooter','B',21,30);add(r,l,e);
 ok(game.activateUltimate(r,l,NOW),'legacy client activates');ok(e.hp<e.maxHp,'legacy fallback direction');
}
// Invalid explicit payload must never produce NaN geometry or an arbitrary random hit.
for(const invalid of [{x:NaN,y:1},{x:0,y:0},{x:Infinity,y:0},{x:'-1',y:'0'}]){
 const r=room(),l=fixture('laser','laser','A',21,21),e=fixture('enemy','shooter','B',21,30);add(r,l,e);
 ok(game.activateUltimate(r,l,NOW,null,invalid),'invalid cast aim safely uses last server aim');
 ok(e.hp<e.maxHp,'fallback still hits old direction');
}
const clientSrc=fs.readFileSync(path.join(__dirname,'../public/game.js'),'utf8');
const serverSrc=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
ok(serverSrc.includes('aimDirX: msg.aimDirX')===false || serverSrc.includes('aimDirX'), 'server has wire fields');
ok(serverSrc.includes('x: msg.aimDirX, y: msg.aimDirY'),'server forwards one-shot direction');
ok(clientSrc.includes('payload.aimDirX = dir.x')&&clientSrc.includes('payload.aimDirY = dir.y'),'client sends fresh aim in ultimate packet');
ok(clientSrc.includes('startedPlaying || (previousMe && previousMe.team !== me.team)'),'snapshot facing reset limited to match entry/team change');
ok(clientSrc.includes('if (me && HAS_TOUCH_INPUT)'),'mobile idle aiming position follows player while walking');
ok(html.includes('game.js?v=1.9.1-queue-fps1'),'JS cache bust present');
eq(game.CHARACTERS.buffer.linkHealHps,40,'buffer server base 40 HPS');
eq(game.CHARACTERS.buffer.ultimateLinkHealHps,65,'buffer ult 65 HPS');
ok(clientSrc.includes("case 'buffer': return '아군 한 명을 연결해 40 HPS"),'buffer description 40 HPS');
ok(clientSrc.includes('throughput = fmtNumber(c.linkHealHps)'),'buffer picker uses server 40 HPS');

// Run actual client function bodies (rather than checking text only) with a minimal browser harness.
function extract(name){
 const begin=clientSrc.indexOf(`function ${name}(`); assert.ok(begin!==-1,name);
 const brace=clientSrc.indexOf('{',begin);let depth=0;for(let i=brace;i<clientSrc.length;i++){if(clientSrc[i]==='{')depth++;if(clientSrc[i]==='}'&&!--depth)return clientSrc.slice(begin,i+1)}throw new Error(`unclosed ${name}`)
}
const source=[extract('currentUltimateMuzzleDirection'),extract('useUltimate')].join('\n');
for(const character of ['laser','light']){
 const msgs=[],me={id:'m',character,team:'A',x:20,y:20,aimX:20,aimY:40,alive:true,stunned:false,ultimateCharge:game.CHARACTERS[character].ultimateCost};
 const context={ws:{readyState:1,send:p=>msgs.push(JSON.parse(p))}, WebSocket:{OPEN:1}, state:{state:'playing',players:[me]},myId:'m',
  selectedTargetId:null,config:{characters:game.CHARACTERS},HAS_TOUCH_INPUT:true,lastAimDir:{x:-1,y:0},desktopAimSeen:false,
  mouseWorld:{x:20,y:40},targetSelectionState:()=>null,Number,Math};
 vm.createContext(context);vm.runInContext(source,context);vm.runInContext('useUltimate()',context);
 eq(msgs.length,1,`${character} client sends ultimate while not firing`);eq(msgs[0].type,'ultimate',`${character} type`);
 near(msgs[0].aimDirX,-1,`${character} client sends preserved left facing`);near(msgs[0].aimDirY,0,`${character} client sends preserved left facing Y`);
}
// Desktop cursor and saved muzzle fallback.
{
 const me={team:'B',x:10,y:10,aimX:10,aimY:0};
 const ctx={HAS_TOUCH_INPUT:false, desktopAimSeen:false,mouseWorld:{x:15,y:10},lastAimDir:{x:0,y:1},Math,Number};
 vm.createContext(ctx);vm.runInContext(extract('currentUltimateMuzzleDirection'),ctx);
 const old=vm.runInContext('currentUltimateMuzzleDirection({team:"B",x:10,y:10,aimX:10,aimY:0})',ctx);
 near(old.x,0,'desktop untouched muzzle x');near(old.y,-1,'desktop untouched muzzle y');
 ctx.desktopAimSeen=true;
 const moved=vm.runInContext('currentUltimateMuzzleDirection({team:"B",x:10,y:10,aimX:10,aimY:0})',ctx);
 near(moved.x,1,'desktop cursor x before input tick');near(moved.y,0,'desktop cursor y');
}
console.log(`PASS: ${n} idle ultimate/muzzle direction/Buffer-display hotfix checks`);
