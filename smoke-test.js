'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('./server');
const c = s.CHARACTERS;
const notes = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/latest-patch.json'), 'utf8'));
const client = fs.readFileSync(path.join(__dirname, 'public/game.js'), 'utf8');

assert.equal(Object.keys(c).length, 29, '29-person active roster');
assert.equal(notes.version, '1.14');
assert.equal(c.blade.ultimateName, '용검');
assert.equal(c.blade.hp, 250);
assert.equal(c.blade.speed, 6.5);
assert.equal(c.blade.attackType, 'melee');
assert.equal(c.blade.meleeTargetMode, 'nearest');
assert.equal(c.blade.ultimateMeleeTargetMode, 'all');
assert.equal(c.blade.bladeDashMaxCharges, 2);
assert.equal(c.blade.ultimateRange, 6);
assert.equal(c.flower.ultimateHeal, 100);
assert.equal(c.water.ultimateHeal, 125);
assert.equal(c.sniper.damage * c.sniper.fireRate, 90);
assert.equal(c.sniper.ultimateDamage * c.sniper.fireRate, 150);
assert.equal(c.magnet.magnetProjectileRadius, .70);
assert.equal(c.wind.ultimateCost, 1200);
assert.equal(c.rescue.ultimateHeal, 100);
assert.equal(s.publicCompetitiveStats().currentBuild.balanceVersion, '1.14');
assert.equal(s.publicCompetitiveStats().currentBuild.availableCharacters.length, 29);

for (const file of [
 'public/assets/characters/portrait_atlas.webp',
 'public/assets/characters/token_atlas.webp',
 'data/patch_notes/1.10.json',
 'data/patch_notes/1.11.json',
 'data/patch_notes/1.12.json',
 'data/patch_notes/1.13.json'
]) assert.ok(fs.existsSync(path.join(__dirname,file)), file);
assert.match(client, /CHARACTER_ATLAS_IDS/);
assert.match(client, /characterPortraitHtml/);
assert.match(client, /portraitSourceForCharacter/);
assert.match(client, /tokenRect\.x/);
assert.match(client, /drawImage\(tokenImg, tokenRect\.x/);
assert.match(client, /bladeSlashSweepAngle/);
console.log('PASS: 1.13 slim atlas packaging, game balance, UI asset integrations, archive preservation');

// 1.14 personal in-match HUD regression: server owns counters; 1 Hz private
// messages must not expose other players' stats or appear for spectators.
{
  const st = s.makeMatchStats('water');
  Object.assign(st, {kills:3,deaths:2,assists:7,damage:123.45,healing:456.75});
  const player={id:'hud-water',character:'water',connected:true,stats:st};
  const payload=s.personalStatsPayload(player);
  assert.deepEqual(payload,{type:'personal_stats',k:3,d:2,a:7,damage:123.5,healing:456.8});
  const room=s.newRoom('HUD-TEST',{displayNumber:1,mode:'casual'});
  room.state='playing';
  room.players.set('hud-water',player);
  const other={id:'hud-buffer',character:'buffer',connected:true,stats:s.makeMatchStats('buffer')};
  other.stats.healing=999;
  room.players.set(other.id,other);
  const sentWater=[],sentBuffer=[],sentSpectator=[];
  room.clients.set('hud-water',{playerId:'hud-water',send:(msg,kind)=>{sentWater.push({msg,kind});return true;}});
  room.clients.set('hud-buffer',{playerId:'hud-buffer',send:(msg,kind)=>{sentBuffer.push({msg,kind});return true;}});
  room.spectators.set('observer',{send:msg=>{sentSpectator.push(msg);return true;}});
  assert.equal(s.broadcastPersonalStats(room),2);
  assert.deepEqual(sentWater,[{msg:payload,kind:'personal_stats'}]);
  assert.equal(sentBuffer[0]?.msg.healing,999);
  assert.equal(sentWater[0]?.msg.healing,456.8,'other player healing is never included');
  assert.equal(sentSpectator.length,0,'spectators cannot receive private match counters');
  room.state='ended';
  assert.equal(s.broadcastPersonalStats(room),0,'no update outside live match');
  const localHudCode=client.slice(client.indexOf('// Show a healing counter only'),client.indexOf('const CHARACTER_ATLAS_COLUMNS = 6;'));
  assert.ok(localHudCode.startsWith('// Show a healing counter only'),'client contains HUD rules');
  const vm=require('node:vm');
  const h=vm.runInNewContext(localHudCode+`
personalCombatStats={k:3,d:2,a:7,damage:123.5,healing:456.8};
({
    buffer: personalStatsHudHtml('buffer'),
    cannon: personalStatsHudHtml('cannon'),
    water: personalStatsHudHtml('water'),
    solar: personalStatsHudHtml('solar'),
    list:[...HUD_HEALING_CHARACTERS]
  })`);
  assert.equal(h.list.length,13);
  assert.match(h.buffer,/힐/);assert.doesNotMatch(h.buffer,/딜/);
  assert.match(h.cannon,/딜/);assert.doesNotMatch(h.cannon,/힐/);
  assert.match(h.water,/딜/);assert.match(h.water,/힐/);
  assert.match(h.solar,/딜/);assert.match(h.solar,/힐/);
  const atlastIds=client.match(/const CHARACTER_ATLAS_IDS = Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1];
  assert.ok(atlastIds,'29 characters in atlas');
  const all=[...atlastIds.matchAll(/'([a-z]+)'/g)].map(m=>m[1]);
  assert.equal(all.length,29);
  assert.equal(new Set(all).size,29);
  for(const name of h.list)assert.ok(all.includes(name),'HUD healing id exists: '+name);
  assert.equal(all.filter(name=>!h.list.includes(name)).length,16);
  assert.equal(c.buffer.noBasicAttack,true);
  assert.match(client,/clearPersonalCombatStats\(\)/);
  console.log('PASS: personal HUD private 1 Hz counters, 29-char role display, postgame cleanup, no spectators');
}


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
assert.ok(JSON.parse(fs.readFileSync(path.join(__dirname, 'data/patch_notes/1.13.json'), 'utf8')).sections.some(section=>section.heading.includes('궁극기 시각효과')));
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
      if(data.ledger.has(p[0])){
        if(q.includes('on conflict (id) do nothing'))return {rows:[],rowCount:0};
        assert.fail('ledger writes must be unique');
      }
      data.ledger.set(p[0],p);
      return {rows:q.includes('returning id')?[{id:p[0]}]:[],rowCount:1};
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
assert.equal(skinCatalog.length,9,'five existing plus four 1.14 skins');
assert.equal(skinCatalog.filter(s=>s.tier==='일반'&&s.price===300).length,7);
assert.equal(skinCatalog.filter(s=>s.tier==='특급'&&s.price===600).length,2);
assert.ok(skinCatalog.some(s=>s.characterId==='flower'),'Flower launched in v1.14');
const atlasFile=path.join(__dirname,'public/assets/characters/token_atlas.webp');
assert.ok(fs.statSync(atlasFile).size>100000,'shared token atlas');
assert.equal(fs.existsSync(path.join(__dirname,'public/assets/skins')),false,'no per-skin assets');
const indices=new Set();
for(const skin of skinCatalog){
  assert.ok(Number.isInteger(skin.tokenIndex) && skin.tokenIndex>=29,'atlas slot '+skin.id);
  assert.ok(skin.tokenIndex<42,'within 6x7 atlas '+skin.id);
  assert.ok(!indices.has(skin.tokenIndex),'unique atlas slot '+skin.id);
  assert.ok(!skin.token,'no separate image URL '+skin.id);
  indices.add(skin.tokenIndex);
  assert.ok(skin.id&&skin.characterId&&skin.effectId);
}


// 1.14 skin 2: stable IDs, atlas indices and correct Ice/Witch slowdown separation.
{
  const skins=JSON.parse(fs.readFileSync(path.join(__dirname,'public/skins.json'),'utf8'));
  for(const [sid,cid,idx,price] of [
    ['rebel_blade','blade',34,600],['cold_ice','ice',35,300],
    ['track_runner','runner',36,300],['queen_flower','flower',37,300]]) {
    const skin=skins.find(s=>s.id===sid);assert.ok(skin);assert.equal(skin.characterId,cid);
    assert.equal(skin.tokenIndex,idx);assert.equal(skin.price,price);
  }
  const src=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'public/game.js'),'utf8');
  assert.match(src,/getStatus\(player, 'freeze'/);
  assert.match(src,/getStatus\(player, 'witch_slow'/);
  assert.match(src,/cosmeticSkinId: player\.skinId === 'cold_ice'/);
  assert.match(src,/killer\.skinId === 'rebel_blade'/);
  assert.match(src,/activated && player\.skinId === 'track_runner'/);
  assert.match(ui,/p\.iceSkinFreeze && p\.frozen/);
  assert.match(ui,/p\.witchSlowed/);
  assert.match(ui,/projectileOwner\?\.skinId==='queen_flower'/);
  console.log('PASS: 1.14 new skins catalog, UI and status origin separation');
}

(async()=>{
  const fake=fakeDatabase();const store=new DurableStore();store.pool=fake.pool;
  // Teacher gift is deliberately restricted to S010 at call site, and unique per ledger ID.
  fake.data.wallets.set('S010',500); // Pre-existing balance is preserved, not replaced.
  const teacherGiftId='teacher_gift_500k_school_skins_113';
  assert.deepEqual(await store.grantOneTimeCoins('S010',500000,teacherGiftId),{granted:true});
  assert.equal(fake.data.wallets.get('S010'),500500,'teacher receives 500k plus existing balance');
  assert.deepEqual(await store.grantOneTimeCoins('S010',500000,teacherGiftId),{granted:false},'redeploy cannot repeat gift');
  assert.equal(fake.data.wallets.get('S010'),500500,'grant is one-time');
  assert.ok(!fake.data.wallets.has('S009'),'student account unaffected');
  assert.equal(fake.data.ledger.get(teacherGiftId)[1],'S010','gift is recorded for teacher');
  console.log('PASS: teacher S010 one-time +500,000 coins, persistent idempotency and other account isolation');
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
  assert.equal((await store.buySkin('student-a',premium)).error,'not_enough_coins');
  await store.insertMatch(makeMatch('match-2'));
  assert.equal(fake.data.wallets.get('student-a'),240);
  assert.equal((await store.buySkin('student-a',regular)).error,'not_enough_coins','2 wins insufficient for regular');
  await store.insertMatch(makeMatch('match-3'));
  assert.equal(fake.data.wallets.get('student-a'),360);
  assert.deepEqual(await store.buySkin('student-a',regular),{ok:true,skinId:regular.id,coins:60},'regular costs 300');
  assert.equal((await store.buySkin('student-a',regular)).error,'already_owned');
  assert.equal((await store.buySkin('student-a',premium)).error,'not_enough_coins');
  for(let i=4;i<=8;i++)await store.insertMatch(makeMatch('match-'+i));
  assert.equal(fake.data.wallets.get('student-a'),660);
  assert.deepEqual(await store.buySkin('student-a',premium),{ok:true,skinId:premium.id,coins:60},'premium costs 600');
  assert.equal((await store.buySkin('student-a',premium)).error,'already_owned');
  assert.deepEqual(await store.getShopAccount('student-a'),{coins:60,owned:[regular.id,premium.id]});
  assert.equal(await store.ownsSkin('student-a',regular.id),true);
  assert.equal(await store.ownsSkin('student-a',premium.id),true);
  assert.equal(await store.ownsSkin('student-b',regular.id),false);
  assert.equal(fake.data.rewards.size,16,'each of eight full matches awards once per connected account');
  assert.equal(fake.data.wallets.get('S010'),500500,'other match and purchase transactions do not alter the gift');
  console.log('PASS: 9-skin catalog, wallet payouts, duplicate prevention, costs, purchase/inventory (simulated SQL)');

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
  { // Skin 2: only server-confirmed Blade kills trigger cosmetic burst; no duplicate death effect.
    const {room,messages}=makeRoom();const blade=makePlayer('blade','blade');const victim=makePlayer('victim','iron','B',16,13);
    blade.skinId='rebel_blade';victim.lastDamageAttackerId=blade.id;victim.lastDamageAt=now;
    room.players.set(blade.id,blade);room.players.set(victim.id,victim);
    game.die(room,victim,now);
    assert.equal(messages.filter(m=>m.kind==='blade_blue_burst').length,1);
    game.die(room,victim,now+1);
    assert.equal(messages.filter(m=>m.kind==='blade_blue_burst').length,1,'no duplicate kill burst');
  }
  { // A regular Blade without the skin cannot make that effect.
    const {room,messages}=makeRoom();const blade=makePlayer('plain','blade');const victim=makePlayer('victim','iron','B',16,13);
    victim.lastDamageAttackerId=blade.id;victim.lastDamageAt=now;
    room.players.set(blade.id,blade);room.players.set(victim.id,victim);
    game.die(room,victim,now);assert.equal(messages.filter(m=>m.kind==='blade_blue_burst').length,0);
  }
  { // Sprint cosmetic does not alter Runner's authoritative speed or cooldown.
    const runner=makePlayer('runner','runner');runner.skinId='track_runner';
    assert.equal(game.activateRunnerSprint(runner,now),true);
    assert.equal(game.effectiveSpeed(runner,now),9);
    assert.equal(game.activateRunnerSprint(runner,now+1),false);
  }
  { // Ice and Witch are genuinely different server statuses; the skin tag persists.
    const {room}=makeRoom(),icy=makePlayer('ice','ice'),witch=makePlayer('witch','witch'),victim=makePlayer('victim','runner','B');
    icy.skinId='cold_ice';room.players.set(icy.id,icy);room.players.set(witch.id,witch);room.players.set(victim.id,victim);
    assert.equal(game.applyStatus(room,icy,victim,'freeze',1500,now,{speedDelta:-1.5,cosmeticSkinId:icy.skinId}),true);
    assert.equal(game.applyStatus(room,witch,victim,'witch_slow',2000,now,{speedDelta:-1}),true);
    assert.equal(game.effectiveSpeed(victim,now,room),5.5);
    const serialized=game.snapshot(room,null,true).players.find(p=>p.id===victim.id);
    assert.equal(serialized.frozen,true);assert.equal(serialized.witchSlowed,true);assert.equal(serialized.iceSkinFreeze,true);
    const flags=game.compactPlayerWireRowV6(serialized)[13];
    assert.ok((flags&(1<<4))&&(flags&(1<<15))&&(flags&(1<<16)),'all three bits preserved in c6 wire protocol');
    game.clearStatus(victim,'freeze');
    const without=game.snapshot(room,null,true).players.find(p=>p.id===victim.id);
    assert.equal(without.iceSkinFreeze,undefined);assert.equal(without.frozen,undefined);assert.equal(without.witchSlowed,true);
  }
  console.log('PASS: server-confirmed kill/teleport FX, failure/cooldown suppression, no skin transfer on swaps');
})().catch(err=>{console.error(err);process.exitCode=1});

// Reward notifications may be visible briefly, but cannot intercept taps on "방 나가기".
const rewardCss=fs.readFileSync(path.join(__dirname, 'public/style.css'), 'utf8');
const rewardRule=rewardCss.match(/\.school-reward-toast\{([^}]+)\}/)?.[1] || '';
assert.match(rewardRule, /pointer-events\s*:\s*none/, 'reward toast must never intercept pointer events');
assert.match(rewardRule, /bottom\s*:/, 'reward toast must be clear of the top-row exit button');
assert.match(client, /schoolRewardToastTimer=setTimeout\(hideSchoolReward,3000\)/, 'reward toast must dismiss promptly');
assert.match(client, /hideSchoolReward\(\);\s*\$\('leaveRoomButton'\)\.disabled/, 'leaving immediately dismisses reward');
console.log('PASS: competitive reward toast never blocks exit or captures taps');


// 1.14 system-only migration regression. All 1.13 character power/HP/cooldowns
// must remain unchanged except numeric translation of movement modifiers and
// generalized anti-heal. No extra test or asset files are created.
{
  const now = 1900000000000;
  const player = (id, character, team = 'A') => ({
    id, name:id, character, team, x:10, y:10, alive:true, connected:true,
    hp:game.CHARACTERS[character].hp - 150, maxHp:game.CHARACTERS[character].hp,
    shield:0, invulnerableUntil:0, statuses:Object.create(null),
    stats:game.makeMatchStats(character), lastCombatAt:now,
    supportContributors:Object.create(null),damageContributors:Object.create(null),ultimateUntil:0
  });
  const room=game.newRoom('SYS114',{displayNumber:1,mode:'casual'});
  room.state='playing';room.matchMode='casual';
  const enemy=player('enemy','poison','B');
  const self=player('self','solar');
  room.players.set(enemy.id,enemy);room.players.set(self.id,self);
  assert.equal(game.CHARACTERS.wind.tailwindSpeedBonus, 1.0, 'Wind 1.14 buff not yet applied');
  assert.equal(game.CHARACTERS.ice.slowSpeedDelta, -1.5, 'Ice slow adjusted in 1.14');
  assert.equal(game.CHARACTERS.blade.speed, 6.5, 'Blade movement adjusted in 1.14');
  assert.equal(game.CHARACTERS.flower.flowerThornsCooldown, 5, 'Flower two-shot ability has five-second cooldown');
  assert.equal(game.additiveMovementSpeed(6, 1.5), 7.5, 'speed uses real numbers without tier snapping');
  assert.equal(game.additiveMovementSpeed(9.2, 4), 13.2, 'no upper speed cap');
  assert.equal(game.additiveMovementSpeed(4, -15), 2, 'final speed floor');
  assert.equal(game.effectiveSpeed(self, now, room), 5, 'Solar base speed unchanged');
  game.applyStatus(room, enemy, self, 'freeze', 2000, now, {speedDelta:-1});
  game.applyStatus(room, enemy, self, 'witch_slow', 2000, now, {speedDelta:-1});
  assert.equal(game.effectiveSpeed(self, now, room), 3, 'Ice and Witch slows stack additively');
  game.applyStatus(room, self, self, 'tailwind', 2000, now, {speedDelta:1});
  assert.equal(game.effectiveSpeed(self, now, room), 4, 'speed buff offsets sum of slows');
  game.clearAllStatuses(self);
  game.applyStatus(room, enemy, self, 'poison', 1500, now, {healReduction:.5});
  assert.equal(game.applyHealing(room, self, self, 100, now), 50, 'Poison anti-heal affects self healing');
  assert.equal(self.stats.selfHealing, 50, 'self heal statistics report effective amount');
  self.hp=self.maxHp-150;
  assert.equal(game.applyHealing(room, null, self, 100, now), 50, 'health packs affected even without a healer');
  const ally=player('ally','water');room.players.set(ally.id,ally);
  ally.hp=ally.maxHp-150;
  assert.equal(game.applyHealing(room, ally, self, 100, now), 50, 'external healing unchanged');
  game.applyStatus(room, enemy, self, 'burn', 2000, now, {healReduction:.3});
  game.applyStatus(room, enemy, self, 'radiation', 2000, now, {healReduction:.3});
  self.hp=self.maxHp-150;
  assert.ok(Math.abs(game.applyHealing(room, self, self, 100, now)-20)<1e-8, 'additive anti-heal capped at 80%');
  game.clearAllStatuses(self);
  game.applyStatus(room, enemy, self, 'poison_full_block', 3000, now);
  assert.equal(game.applyHealing(room, self, self, 100, now), 0, 'Poison ultimate blocks all HP restoration');
  game.applyStatus(room, enemy, self, 'poison', 1500, now+1000, {healReduction:.5});
  assert.equal(game.hasStatus(self,'poison_full_block',now+3001),false, 'Poison normal hit cannot extend ult block');
  self.hp=self.maxHp-150;
  assert.equal(game.applyHealing(room, self, self, 100, now+3001), 100, 'healing returns after 3 s ultimate block');
  // Validate that numeric speeds cannot tunnel through thin solid walls.
  const wallRoom=game.newRoom('WALL114',{displayNumber:1,mode:'casual'});
  wallRoom.mapId='classroom';
  const wp=player('wall','runner');wp.x=5;wp.y=5;
  const walls=game.getRoomWalls(wallRoom);
  if (walls.length) {
    const w=walls[0];
    wp.x=Math.max(.8,w.x-1.3);wp.y=w.y+w.h/2;
    const start=wp.x;
    game.movePlayer(wp, 30, 0, .65, wallRoom);
    assert.ok(wp.x<=w.x-.65+0.05 || start>=w.x+w.w, 'large speed step must not skip collision');
  }
  console.log('PASS: 1.14 numeric speed, additive slows, self/external/pack anti-heal, cap, Poision ultimate lifetime, 1.13 character numbers');
}

// 1.14 character updates and server-authoritative Flower two-shot projectile test.
{
  const now=1900100000000;
  const c=s.CHARACTERS;
  assert.equal(c.magnet.magnetCooldown,9);
  assert.equal(c.magnet.ultimateMagnetCooldown,4);
  assert.equal(c.blade.speed,6.5);
  assert.equal(c.shooter.ultimateDamage,35);
  assert.equal(c.sniper.damage,45);assert.equal(c.sniper.ultimateDamage,75);
  assert.equal(c.ice.slowSpeedDelta,-1.5);
  assert.equal(c.runner.ultimateDamage,250);
  assert.equal(c.rescue.abilityCooldown,10);assert.equal(c.rescue.heal,13);assert.equal(c.rescue.abilityHeal,30);
  assert.equal(c.water.heal,15);assert.equal(c.water.ultimateHeal,125);
  assert.equal(c.flower.flowerThornsRange,36);
  assert.equal(c.flower.flowerThornsProjectileSpeed,42);
  assert.equal(c.flower.flowerThornsProjectileRadius,.32);
  assert.equal(c.flower.flowerThornsHealReduction,.4);
  assert.equal(c.flower.flowerThornsHealReductionDuration,2);
  assert.equal(c.flower.flowerThornsVolleyInterval,.5);

  const player=(id,character,team,x,y)=>({
    id,name:id,team,character,x,y,aimX:x+10,aimY:y,alive:true,connected:true,
    hp:c[character].hp,maxHp:c[character].hp,shield:0,invulnerableUntil:0,
    statuses:Object.create(null),stats:s.makeMatchStats(character),
    input:{up:false,down:false,left:false,right:false,fire:false},
    damageContributors:Object.create(null),supportContributors:Object.create(null),
    lastCombatAt:now,ultimateCharge:0,ultimateUntil:0,nextFireAt:0,lastPeriodicActionAt:0
  });
  const room=s.newRoom('THORN114',{mode:'casual',displayNumber:1});
  room.state='playing';room.matchMode='casual';room.matchStartedAt=now;room.matchEndAt=now+180000;
  room.mapId='classroom';room.nextUltimateAutoChargeAt=now+4000;
  const flower=player('flower','flower','A',15,10),enemy=player('enemy','iron','B',20,10);
  enemy.hp=350;room.players.set(flower.id,flower);room.players.set(enemy.id,enemy);
  const ordinary=s.currentAttackDef(flower,now);
  assert.equal(ordinary.projectileType,'heal');assert.equal(ordinary.heal,14);
  assert.equal(s.activateFlowerThorns(room,flower,now),true);
  assert.equal(room.projectiles.size,1);
  const first=[...room.projectiles.values()][0];
  assert.equal(first.flowerThorns,true);assert.equal(first.damage,25);
  assert.equal(first.range,36);assert.equal(first.vx,42);
  assert.equal(first.radius,.32);assert.equal(first.type,'attack');
  assert.equal(s.currentAttackDef(flower,now).projectileType,'heal','normal heal stays enabled');
  assert.equal(flower.newAbilityCooldownUntil,now+5000);
  assert.equal(flower.flowerThornsSecondAt,now+500);
  assert.equal(s.activateFlowerThorns(room,flower,now+200),false,'cooldown starts at first shot');
  s.updateProjectiles(room,.12,now+120);
  assert.equal(enemy.hp,325,'first thorn deals 25');
  assert.equal(flower.stats.flowerThornsDamage,25);
  assert.equal(s.getStatus(enemy,'flower_thorns_antiheal',now+120)?.until,now+2120);
  assert.equal(s.applyHealing(room,enemy,enemy,100,now+200),60,'thorns reduce self healing by 40%');
  s.applyStatus(room,flower,enemy,'poison',1800,now+220,{healReduction:.5});
  enemy.hp=300;
  assert.ok(Math.abs(s.applyHealing(room,enemy,enemy,100,now+250)-20)<1e-8,'40+50 capped at 80%');
  s.updateRoom(room,.02,now+500);
  assert.equal(room.projectiles.size,1,'second thorn spawned by tick');
  const second=[...room.projectiles.values()][0];
  assert.equal(second.flowerThorns,true);
  s.updateProjectiles(room,.12,now+650);
  assert.equal(flower.stats.flowerThornsDamage,50,'both thorn hits credited');
  assert.equal(s.getStatus(enemy,'flower_thorns_antiheal',now+650)?.until,now+2650,'second hit refreshes duration');
  assert.equal(s.getStatus(enemy,'flower_thorns_antiheal',now+2651),null,'expires after two seconds');
  const row=s.snapshot(room,flower.id).projectiles;
  assert.ok(Array.isArray(row));
  assert.match(fs.readFileSync(path.join(__dirname,'public/game.js'),'utf8'),/p\.character === 'flower_thorns'/);
  assert.match(fs.readFileSync(path.join(__dirname,'public/game.js'),'utf8'),/flowerGuide/);

  const interrupted=s.newRoom('INT114',{mode:'casual',displayNumber:1});
  interrupted.state='playing';interrupted.matchMode='casual';interrupted.matchStartedAt=now;
  interrupted.matchEndAt=now+180000;interrupted.nextUltimateAutoChargeAt=now+4000;
  const caster=player('caster','flower','A',15,10);interrupted.players.set(caster.id,caster);
  assert.equal(s.activateFlowerThorns(interrupted,caster,now),true);
  s.applyStatus(interrupted,caster,caster,'stun',1000,now+100);
  s.updateRoom(interrupted,.02,now+510);
  assert.equal(interrupted.projectiles.size,1,'stun cancels queued second shot');
  assert.equal(caster.flowerThornsSecondAt,0);
  assert.equal(caster.newAbilityCooldownUntil,now+5000,'interruption does not refund cooldown');
  const dying=player('dying','flower','A',15,15);interrupted.players.set(dying.id,dying);
  assert.equal(s.activateFlowerThorns(interrupted,dying,now),true);
  s.die(interrupted,dying,now+200);
  assert.equal(dying.flowerThornsSecondAt,0,'death cancels second shot');
  console.log('PASS: 1.14 numeric balance, flower thorn damage, independently retained healing, double volley, antiheal/refresh/cap, death/stun cancellation');
}

// 1.14 casual-mode skins: the lobby equips owned cosmetics using the ranked
// ownership guard, but starting a casual match must not erase those selections.
{
  const src=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8');
  assert.match(src,/room\.state === 'lobby' && normalizeRoomMode\(room\.mode\) === 'casual'/);
  assert.match(src,/durableStore\.ownsSkin\(player\.accountId, requested\)/);
  assert.match(ui,/id="casualSkinPicker"/);
  assert.match(client,/function renderCasualSkinPicker\(/);
  assert.match(client,/skinInventoryLoaded/);
  const room=s.newRoom('CASUAL_SKIN_TEST',{displayNumber:1,mode:'casual'});
  const p={id:'P1',name:'casual tester',accountId:'S001',team:'A',character:'blade',skinId:'rebel_blade',
    connected:true,alive:true,x:15,y:10,aimX:15,aimY:20,hp:c.blade.hp,maxHp:c.blade.hp,
    statuses:Object.create(null),input:{up:false,down:false,left:false,right:false,fire:false},
    stats:s.makeMatchStats('blade')};
  room.players.set(p.id,p);
  s.startMatch(room);
  assert.equal(room.matchMode,'casual');
  assert.equal(p.skinId,'rebel_blade','casual start must preserve equipped owned skin');
  assert.equal(s.snapshot(room,p.id).players[0].skinId,'rebel_blade','casual skin is broadcast to participants');
  console.log('PASS: casual skin picker, DB ownership gate, mode-safe equip, match-start skin preservation');
}

// 1.14 final editorial patch note, four cosmetic skins, and unchanged atlas regression.
assert.ok(typeof notes.markdown === 'string' && notes.markdown.startsWith('# 🎮 《스쿨라인》 1.14 패치노트'));
assert.equal(notes.sections.length,5);
assert.ok(notes.markdown.includes('## 🎀 5. 신규 학교 컨셉 스킨 4종 출시!'));
assert.ok(notes.markdown.includes('**총 9종의 스킨**'));
assert.ok(notes.markdown.includes('경쟁전과 일반전 모두에서 사용'));
assert.ok(notes.markdown.includes('### 🐉 반항아 블레이드 — 특급 스킨'));
assert.ok(notes.markdown.includes('### ❄️ 냉혈한 아이스'));
assert.ok(notes.markdown.includes('### 🏃 육상부원 러너'));
assert.ok(notes.markdown.includes('### 💗 퀸카 플라워'));
assert.match(client,/className = 'latest-patch-markdown'/);
console.log('PASS: 1.14 final Korean patch notes rendered, four new skins listed');

// 1.14 final pre-season DPS correction. Must not accidentally enable proposed
// 1.15 cannon 300-DPS ultimate or change any other class, skin, or stats series.
assert.equal(c.cannon.fireRate, 10);
assert.equal(c.cannon.damage, 14);
assert.equal(c.cannon.damage * c.cannon.fireRate, 140);
assert.equal(c.cannon.ultimateDamage, 20);
assert.equal(c.cannon.ultimateDamage * c.cannon.fireRate, 200);
assert.equal(c.hacker.fireRate, 5);
assert.equal(c.hacker.damage, 20);
assert.equal(c.hacker.damage * c.hacker.fireRate, 100);
assert.equal(s.currentAttackDef({character:'cannon',ultimateUntil:0},Date.now()).damage,14);
assert.equal(s.currentAttackDef({character:'hacker',ultimateUntil:0},Date.now()).damage,20);
const ultimateCheckNow = Date.now();
assert.equal(s.currentAttackDef({character:'cannon',ultimateUntil:ultimateCheckNow+5000},ultimateCheckNow).damage,20);
assert.equal(s.publicCompetitiveStats().currentBuild.balanceVersion,'1.14');
assert.ok(notes.markdown.includes('캐논:** 기본 공격 DPS **130 → 140**'));
assert.ok(notes.markdown.includes('해커:** 기본 공격 DPS **90 → 100**'));
assert.equal(notes.sections.length, 5, 'only five integrated 1.14 patch sections');
assert.ok(notes.markdown.includes('### 📈 버프 — 8종'));
assert.ok(!notes.markdown.includes('최종 추가 밸런스 조정'));
assert.ok(!notes.markdown.includes('## ⚡ 6.'));
assert.equal(notes.markdown.match(/💣 \*\*캐논:\*\*/g)?.length, 1);
assert.equal(notes.markdown.match(/💻 \*\*해커:\*\*/g)?.length, 1);
const balanceBuff = notes.sections.find(section=>section.heading.includes('캐릭터 밸런스 변경'))?.groups?.[0];
assert.equal(balanceBuff?.label, '📈 버프 — 8종');
assert.equal(balanceBuff.items[0].name, '📈 버프 — 8종');
assert.match(balanceBuff.items[0].text,/캐논:\*\* 기본 공격 DPS \*\*130 → 140\*\*/);
assert.match(balanceBuff.items[0].text,/해커:\*\* 기본 공격 DPS \*\*90 → 100\*\*/);
console.log('PASS: cannon 140 DPS, hacker 100 DPS; cannon ultimate stays 200 DPS; v1.14 stats & patch notes');
