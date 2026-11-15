'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('./server');
const c = s.CHARACTERS;
const notes = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/latest-patch.json'), 'utf8'));
const client = fs.readFileSync(path.join(__dirname, 'public/game.js'), 'utf8');

assert.equal(Object.keys(c).length, 29, '29-person active roster');
assert.equal(notes.version, '1.13');
assert.equal(c.blade.ultimateName, '용검');
assert.equal(c.blade.hp, 250);
assert.equal(c.blade.speed, 6);
assert.equal(c.blade.attackType, 'melee');
assert.equal(c.blade.meleeTargetMode, 'nearest');
assert.equal(c.blade.ultimateMeleeTargetMode, 'all');
assert.equal(c.blade.bladeDashMaxCharges, 2);
assert.equal(c.blade.ultimateRange, 6);
assert.equal(c.flower.ultimateHeal, 100);
assert.equal(c.water.ultimateHeal, 125);
assert.equal(c.sniper.damage * c.sniper.fireRate, 100);
assert.equal(c.sniper.ultimateDamage * c.sniper.fireRate, 150);
assert.equal(c.magnet.magnetProjectileRadius, .70);
assert.equal(c.wind.ultimateCost, 1200);
assert.equal(c.rescue.ultimateHeal, 100);
assert.equal(s.publicCompetitiveStats().currentBuild.balanceVersion, '1.13');
assert.equal(s.publicCompetitiveStats().currentBuild.availableCharacters.length, 29);

for (const file of [
 'public/assets/characters/portrait_atlas.webp',
 'public/assets/characters/token_atlas.webp',
 'data/patch_notes/1.10.json',
 'data/patch_notes/1.11.json',
 'data/patch_notes/1.12.json'
]) assert.ok(fs.existsSync(path.join(__dirname,file)), file);
assert.match(client, /CHARACTER_ATLAS_IDS/);
assert.match(client, /characterPortraitHtml/);
assert.match(client, /portraitSourceForCharacter/);
assert.match(client, /tokenRect\.x/);
assert.match(client, /drawImage\(tokenImg, tokenRect\.x/);
assert.match(client, /bladeSlashSweepAngle/);
console.log('PASS: 1.13 slim atlas packaging, game balance, UI asset integrations, archive preservation');

// 1.13 final / ultimate visual-authority regression. Cosmetics must be emitted only
// after successful server-side actions and never change the actual gameplay result.
const makeUltimatePlayer=(id,team,character,x=10,y=10)=>({
  id,name:id,team,character,x,y,aimX:x+10,aimY:y,alive:true,connected:true,
  hp:c[character].hp,maxHp:c[character].hp,shield:0,maxShield:0,
  invulnerableUntil:0,ultimateCharge:Number(c[character].ultimateCost)||0,ultimateUntil:0,
  lastCombatAt:1800000000000,stats:s.makeMatchStats(character),
  statuses:Object.create(null), damageContributors:Object.create(null),supportContributors:Object.create(null),
  bladeDashCharges:0,bladeDashRechargeAt:0
});
const makeUltimateRoom=()=>{
  const room=s.newRoom('ULTFX',{displayNumber:1,mode:'casual'});
  room.state='playing';room.matchMode='casual';
  const messages=[];
  room.clients.set('visual-probe',{send:msg=>messages.push(msg)});
  return {room,messages};
};
const start=1800000000000;
{
  const {room,messages}=makeUltimateRoom();
  const angel=makeUltimatePlayer('angel','A','angel'),ally=makeUltimatePlayer('ally','A','shooter',11,10);
  room.players.set(angel.id,angel);room.players.set(ally.id,ally);
  assert.equal(s.activateUltimate(room,angel,start,ally.id),true);
  assert.ok(ally.invulnerableUntil >= start+3000);
  assert.equal(messages.find(m=>m.kind==='recipient' && m.character==='angel')?.targetId,ally.id);
  const count=messages.length;
  assert.equal(s.activateUltimate(room,angel,start+1,ally.id),false,'failed cast cannot emit cosmetics');
  assert.equal(messages.length,count);
}
{
  const {room,messages}=makeUltimateRoom();
  const flower=makeUltimatePlayer('flower','A','flower'),ally=makeUltimatePlayer('ally','A','shooter',11,10);
  ally.hp-=20;room.players.set(flower.id,flower);room.players.set(ally.id,ally);
  assert.equal(s.activateUltimate(room,flower,start,ally.id),true);
  assert.equal(ally.hp,ally.maxHp);
  assert.equal(ally.shield,80);
  assert.equal(messages.find(m=>m.kind==='recipient' && m.character==='flower')?.targetId,ally.id);
  assert.equal(messages.find(m=>m.kind==='recipient' && m.character==='flower')?.durationMs,8000);
}
{
  const {room,messages}=makeUltimateRoom();
  const rescue=makeUltimatePlayer('rescue','A','rescue'),ally=makeUltimatePlayer('ally','A','shooter',12,10);
  ally.hp-=50;room.players.set(rescue.id,rescue);room.players.set(ally.id,ally);
  assert.equal(s.activateUltimate(room,rescue,start),true);
  assert.equal(ally.hp,ally.maxHp);
  const paw=messages.find(m=>m.kind==='radial_burst' && m.character==='rescue');
  assert.equal(paw?.radius,12);
  assert.equal(paw?.x,10);
  assert.equal(paw?.y,10);
}
{
  const {room,messages}=makeUltimateRoom();
  const star=makeUltimatePlayer('star','A','star'),ally=makeUltimatePlayer('ally','A','shooter',12,10);
  ally.hp-=100;room.players.set(star.id,star);room.players.set(ally.id,ally);
  assert.equal(s.activateUltimate(room,star,start),true);
  assert.equal(messages.filter(m=>m.kind==='radial_burst').length,0,'no premature supernova star');
  assert.equal(s.resolveDelayedUltimate(room,star,'star',start+2000,star.x,star.y),true);
  assert.equal(ally.hp,ally.maxHp);
  const burst=messages.find(m=>m.kind==='radial_burst' && m.character==='star');
  assert.equal(burst?.radius,30);
}
{
  const {room,messages}=makeUltimateRoom();
  const iron=makeUltimatePlayer('iron','A','iron');room.players.set(iron.id,iron);
  assert.equal(s.activateUltimate(room,iron,start),true);
  assert.equal(messages.length,0,'iron cracks only on delayed hit');
  s.resolveDelayedUltimate(room,iron,'iron',start+2000,iron.x,iron.y);
  assert.ok(messages.some(m=>m.kind==='radial_burst'&&m.character==='iron'));
}

const css=fs.readFileSync(path.join(__dirname,'public/style.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8');
assert.match(html,/id="localUltimateReveal"/);
assert.match(html,/id="localUltimateRevealName"/);
assert.match(css,/\.local-ultimate-reveal\.playing/);
assert.match(css,/pointer-events:none/);
assert.match(client,/if \(after\.id===myId && !spectatorMode\) revealMyUltimate\(after\.character\)/);
assert.match(client,/function drawUltimateStarGlyph/);
assert.match(client,/function drawUltimatePawGlyph/);
assert.match(client,/function drawUltimateSnowflake/);
assert.match(client,/function drawSustainedUltimateAura/);
assert.match(client,/function drawUltimateRecipientAuras/);
assert.match(client,/function bladeSlashSweepAngle/);
assert.ok(notes.sections.some(section=>section.heading.includes('궁극기 시각효과')));
console.log('PASS: authoritative delayed star/iron burst, Angel/Flower recipients, Rescue paw, failed cast, 29-char client FX');


// School-themed cosmetics and shop regression tests (merged to keep SLIM file count low).
const {DurableStore} = require('./durable_store');
const game=s;
// Independent simulated SQL adapter. Does not replace the live PostgreSQL acceptance test.
function fakeDatabase(){
  const data={matches:new Set(),rewards:new Map(),wallets:new Map(),skins:new Map(),ledger:new Map()};
  let snapshot=null;
  const clone=()=>({
    matches:new Set(data.matches),rewards:new Map(data.rewards),wallets:new Map(data.wallets),
    skins:new Map([...data.skins].map(([k,v])=>[k,new Set(v)])),ledger:new Map(data.ledger)
  });
  const restore=old=>{for(const key of Object.keys(data))data[key]=old[key]};
  const query=async(sql,p=[])=>{
    const q=String(sql).replace(/\s+/g,' ').trim().toLowerCase();
    if(q==='begin'){snapshot=clone();return {rows:[],rowCount:0}}
    if(q==='commit'){snapshot=null;return {rows:[],rowCount:0}}
    if(q==='rollback'){if(snapshot)restore(snapshot);snapshot=null;return {rows:[],rowCount:0}}
    if(q.startsWith('insert into school_line_matches')){
      if(data.matches.has(p[0]))return {rows:[],rowCount:0};
      data.matches.add(p[0]);return {rows:[{match_id:p[0]}],rowCount:1};
    }
    if(q.startsWith('insert into school_line_match_rewards')){
      const key=p[0]+':'+p[1];if(data.rewards.has(key))return {rows:[],rowCount:0};
      data.rewards.set(key,{coins:p[2],outcome:p[3]});return {rows:[{account_id:p[1]}],rowCount:1};
    }
    if(q.startsWith('insert into school_line_wallets')){
      if(!data.wallets.has(p[0]))data.wallets.set(p[0],0);
      return {rows:[],rowCount:1};
    }
    if(q.startsWith('update school_line_wallets set coins=coins+')){
      const balance=(data.wallets.get(p[0])||0)+p[1];data.wallets.set(p[0],balance);
      return {rows:[{coins:balance}],rowCount:1};
    }
    if(q.startsWith('update school_line_wallets set coins=coins-')){
      const balance=(data.wallets.get(p[0])||0)-p[1];data.wallets.set(p[0],balance);
      return {rows:[{coins:balance}],rowCount:1};
    }
    if(q.startsWith('select coins from school_line_wallets where account_id=$1')){
      return data.wallets.has(p[0])?{rows:[{coins:data.wallets.get(p[0])}],rowCount:1}:{rows:[],rowCount:0};
    }
    if(q.startsWith('insert into school_line_coin_ledger')){
      assert.ok(!data.ledger.has(p[0]),'ledger writes must be unique');data.ledger.set(p[0],p);
      return {rows:[],rowCount:1};
    }
    if(q.startsWith('select skin_id from school_line_owned_skins')){
      const rows=[...(data.skins.get(p[0])||new Set())].map(skin_id=>({skin_id}));
      return {rows,rowCount:rows.length};
    }
    if(q.startsWith('select 1 from school_line_owned_skins')){
      const yes=data.skins.get(p[0])?.has(p[1]);return {rows:yes?[{'?column?':1}]:[],rowCount:yes?1:0};
    }
    if(q.startsWith('insert into school_line_owned_skins')){
      if(!data.skins.has(p[0]))data.skins.set(p[0],new Set());
      assert.ok(!data.skins.get(p[0]).has(p[1]));data.skins.get(p[0]).add(p[1]);
      return {rows:[],rowCount:1};
    }
    throw new Error('Unexpected fake SQL '+q.slice(0,140));
  };
  return {data,pool:{query,connect:async()=>({query,release(){}})}};
}
const skinCatalog=JSON.parse(fs.readFileSync(path.join(__dirname,'public/skins.json'),'utf8'));
assert.equal(skinCatalog.length,5,'only five launched skins');
assert.equal(skinCatalog.filter(s=>s.tier==='일반'&&s.price===500).length,4);
assert.equal(skinCatalog.filter(s=>s.tier==='특급'&&s.price===1000).length,1);
assert.ok(!skinCatalog.some(s=>s.characterId==='flower'),'Flower postponed to v1.14');
const atlasFile=path.join(__dirname,'public/assets/characters/token_atlas.webp');
assert.ok(fs.statSync(atlasFile).size>100000,'shared token atlas');
assert.equal(fs.existsSync(path.join(__dirname,'public/assets/skins')),false,'no per-skin assets');
const indices=new Set();
for(const skin of skinCatalog){
  assert.ok(Number.isInteger(skin.tokenIndex) && skin.tokenIndex>=29,'atlas slot '+skin.id);
  assert.ok(skin.tokenIndex<36,'within 6x6 atlas '+skin.id);
  assert.ok(!indices.has(skin.tokenIndex),'unique atlas slot '+skin.id);
  assert.ok(!skin.token,'no separate image URL '+skin.id);
  indices.add(skin.tokenIndex);
  assert.ok(skin.id&&skin.characterId&&skin.effectId);
}

(async()=>{
  const fake=fakeDatabase();const store=new DurableStore();store.pool=fake.pool;
  const makeMatch=(matchId,mode='competitive',seconds=180)=>({
    matchId,matchMode:mode,durationSec:seconds,winner:'A',players:[
      {accountId:'student-a',team:'A',connectedAtEnd:true},
      {accountId:'student-b',team:'B',connectedAtEnd:true},
      {accountId:'student-c',team:'B',connectedAtEnd:false},
      {accountId:'student-a',team:'A',connectedAtEnd:true}
    ]
  });
  const first=await store.insertMatch(makeMatch('match-1'));
  assert.deepEqual(first.rewards.map(a=>a.coins),[120,100]);
  assert.equal((await store.insertMatch(makeMatch('match-1'))).rewards.length,0,'retry cannot pay twice');
  assert.equal(fake.data.wallets.get('student-a'),120);
  assert.equal(fake.data.wallets.get('student-b'),100);
  assert.ok(!fake.data.wallets.has('student-c'),'disconnected end gets no reward');
  assert.equal((await store.insertMatch(makeMatch('casual-1','casual'))).rewards.length,0);
  assert.equal((await store.insertMatch(makeMatch('short-1','competitive',100))).rewards.length,0);
  const regular=skinCatalog.find(s=>s.id==='honor_shooter');
  const premium=skinCatalog.find(s=>s.id==='school_nurse_buffer');
  assert.equal((await store.buySkin('student-a',regular)).error,'not_enough_coins');
  for(let i=2;i<=5;i++)await store.insertMatch(makeMatch('match-'+i));
  assert.equal(fake.data.wallets.get('student-a'),600);
  assert.deepEqual(await store.buySkin('student-a',regular),{ok:true,skinId:regular.id,coins:100});
  assert.equal((await store.buySkin('student-a',regular)).error,'already_owned');
  assert.equal((await store.buySkin('student-a',premium)).error,'not_enough_coins');
  assert.deepEqual(await store.getShopAccount('student-a'),{coins:100,owned:[regular.id]});
  assert.equal(await store.ownsSkin('student-a',regular.id),true);
  assert.equal(await store.ownsSkin('student-b',regular.id),false);
  assert.equal(fake.data.rewards.size,10,'each of five full matches awards once per connected account');
  console.log('PASS: 5-skin catalog, wallet payouts, duplicate prevention, costs, purchase/inventory (simulated SQL)');

  const now=1800000000000;
  const makePlayer=(id,character,team='A',x=9,y=9)=>({
    id,character,name:id,team,x,y,aimX:x+5,aimY:y,alive:true,connected:true,
    hp:game.CHARACTERS[character].hp,maxHp:game.CHARACTERS[character].hp,shield:0,maxShield:0,
    stats:game.makeMatchStats(character),statuses:Object.create(null),
    damageContributors:Object.create(null),supportContributors:Object.create(null),input:{fire:false}
  });
  const makeRoom=()=>{
    const room=game.newRoom('SKINS',{displayNumber:1,mode:'casual'});room.state='playing';room.matchMode='casual';
    const messages=[];room.clients.set('observer',{send:m=>messages.push(m)});return {room,messages};
  };
  {
    const {room,messages}=makeRoom();const rescue=makePlayer('cat','rescue'),ally=makePlayer('ally','shooter','A',18,18);
    rescue.skinId='school_cat_rescue';room.players.set(rescue.id,rescue);room.players.set(ally.id,ally);
    assert.equal(game.activateNewHeroAbility(room,rescue,null,now),false);
    assert.equal(messages.some(m=>m.type==='skin_fx'),false,'invalid rescue cast no cosmetic');
    ally.hp-=50;
    assert.equal(game.activateNewHeroAbility(room,rescue,ally,now),true);
    assert.equal(rescue.x,18);assert.equal(rescue.y,18);
    assert.equal(messages.filter(m=>m.kind==='rescue_meow').length,1);
    assert.equal(game.activateNewHeroAbility(room,rescue,ally,now+1),false,'cooldown prevents spam');
    assert.equal(messages.filter(m=>m.kind==='rescue_meow').length,1);
  }
  {
    const {room,messages}=makeRoom();const shooter=makePlayer('shooter','shooter'),victim=makePlayer('victim','iron','B',16,13);
    shooter.skinId='honor_shooter';victim.lastDamageAttackerId=shooter.id;victim.lastDamageAt=now;
    room.players.set(shooter.id,shooter);room.players.set(victim.id,victim);
    game.die(room,victim,now);
    assert.equal(messages.filter(m=>m.kind==='shooter_hundred').length,1);
    assert.equal(messages.find(m=>m.kind==='shooter_hundred').x,16);
    assert.equal(messages.find(m=>m.kind==='shooter_hundred').y,13);
  }
  {
    const {room}=makeRoom();room.state='ready';room.matchMode='competitive';
    const a=makePlayer('a','star'),b=makePlayer('b','rescue');
    a.skinId='class_president_star';b.skinId='school_cat_rescue';
    room.players.set(a.id,a);room.players.set(b.id,b);
    room.competitive={phase:'ready',readyEndAt:now+20000,draftStartedAt:now-20000,
      pendingReadySwaps:new Map([['b',{requestId:'swap1',sourceId:'a',targetId:'b',team:'A',
        sourceCharacter:'star',targetCharacter:'rescue',expiresAt:now+10000}]]),
      readySwaps:[],draftEvents:[]};
    assert.equal(game.swapCompetitiveReadyAssignments(room,a,'a','b',b,now),true);
    assert.equal(a.character,'rescue');assert.equal(b.character,'star');
    assert.equal(a.skinId,null);assert.equal(b.skinId,null,'skin ownership cannot be swapped');
  }
  console.log('PASS: server-confirmed kill/teleport FX, failure/cooldown suppression, no skin transfer on swaps');
})().catch(err=>{console.error(err);process.exitCode=1});
