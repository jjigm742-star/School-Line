'use strict';
const assert=require('node:assert/strict');
const s=require('../server');
const NOW=Date.now();
const makeRoom=(mode='competitive')=>s.newRoom('TEST_'+mode,{mode,displayNumber:1});
const withRoster=(room)=>{
  const ids=['iron','mecha','magnet','jet','shield','fire','water','buffer'];
  for(let i=0;i<8;i++){
    const id=`p${i}`,ch=ids[i];
    room.players.set(id,{id,name:id,team:i<4?'A':'B',connected:true,character:ch,accountId:id,aimX:21,aimY:50,x:21,y:15,stats:s.makeMatchStats(ch),input:{up:false,down:false,left:false,right:false,fire:false}});
  }
};
assert.equal(s.CHARACTERS.shield.hp,400);
assert.equal(s.CHARACTERS.shield.shieldAmount,150);
assert.equal(s.CHARACTERS.fire.damage,14);
assert.equal(s.CHARACTERS.fire.burnDps,10);
assert.equal(s.CHARACTERS.magnet.magnetProjectileSpeed,42);
assert.equal(s.CHARACTERS.magnet.magnetCooldown,12);
assert.equal(s.MAP_DEFS.classroom.walls.length,7);
assert.equal(s.MAP_DEFS.playground.walls.length,6);
assert.equal(s.MAP_DEFS.playground.healthPacks.length,2);
const room=makeRoom();withRoster(room);
const random=Math.random;
try{
  Math.random=()=>0.1;
  assert.equal(s.startCompetitiveDraft(room,NOW),true);
  assert.equal(room.mapId,'classroom');
  assert.equal(s.competitivePhaseWireSnapshot(room).mapId,'classroom');
  assert.equal(s.getRoomWalls(room).length,7);
  assert.equal(s.hasLineOfSight(21,29,21,39,room),false);
  Math.random=()=>0.9;
  assert.equal(s.startCompetitiveDraft(room,NOW+100),true);
  assert.equal(room.mapId,'playground');
  assert.equal(s.competitivePhaseWireSnapshot(room).mapId,'playground');
  assert.equal(s.getRoomWalls(room).length,6);
  assert.equal(s.hasLineOfSight(21,29,21,39,room),true);
}finally{Math.random=random;}
// Draft deliberately clears character assignments; restore an eight-pick result.
for (const [i, player] of [...room.players.values()].entries()) player.character=['iron','mecha','magnet','jet','shield','fire','water','buffer'][i];
s.startMatch(room,NOW+500);
assert.equal(room.healthPacks.length,2);
assert.equal(s.snapshot(room).mapId,'playground');
assert.equal(s.compactPlayingSnapshotForWire(s.snapshot(room),room,NOW+500,true).mapId,'playground');
// Pickup: server heals a wounded player only once and rejects full-HP recipients.
const p=room.players.get('p0');p.x=3;p.y=34;p.hp=250;p.maxHp=600;
s.updateRoomHealthPacks(room,NOW+600);
assert.equal(p.hp,350);assert.equal(room.healthPacks[0].readyAt,NOW+600+20000);
s.updateRoomHealthPacks(room,NOW+700);assert.equal(p.hp,350);
p.hp=p.maxHp;s.updateRoomHealthPacks(room,NOW+22000);assert.equal(room.healthPacks[0].readyAt,NOW+600+20000);
p.hp=300;s.updateRoomHealthPacks(room,NOW+22000);assert.equal(p.hp,400);
const live=s.compactPlayingSnapshotForWire(s.snapshot(room),room,NOW+22000,true);
assert.equal(live.healthPacks.length,2);assert.ok(live.healthPacks[0][3] > 0 && live.healthPacks[0][3] <= 43);
// The recorded result includes an explicit map, so previous 1.10 records aren't mislabelled.
room.competitive.matchStartedAt=NOW+500;room.winner='A';room.winnerReason='score';
const record=s.buildCompetitiveResult(room,NOW+23000);
assert.equal(record.mapId,'playground');assert.equal(record.mapName,'운동장');
const adv=s.buildAdvancedCompetitiveStats([record],{});
assert.equal(adv.maps.playground.games,1);
assert.equal(adv.maps.playground.characters.fire.picks,1);
// No map is a valid default for legacy matches: new builds don't retroactively misattribute old games.
const legacy={...record};delete legacy.mapId;delete legacy.mapName;
assert.equal(s.buildAdvancedCompetitiveStats([legacy],{}).maps.unknown.games,1);
const casual=makeRoom('casual');withRoster(casual);casual.mapId='playground';s.startMatch(casual,NOW+24000);
assert.equal(casual.mapId,'classroom');assert.equal(casual.healthPacks.length,0);
// Projectile-solid-wall regression: the same projectile is stopped by the
// Classroom center wall but travels unimpeded across the Playground center.
for (const [mapId,blocked] of [['classroom',true],['playground',false]]) {
  const rr=makeRoom();rr.mapId=mapId;rr.state='playing';
  rr.projectiles.set('test',{id:'test',x:21,y:29,vx:0,vy:20,range:24,traveled:0,radius:0.2,type:'attack',team:'A',character:'shooter',ownerId:'owner',damage:20});
  s.updateProjectiles(rr,0.6,NOW+500);
  assert.equal(rr.projectiles.has('test'),!blocked,`projectile center-wall ${mapId}`);
}
// Magnet's new 42m/s hook can pull through the opened middle of Playground
// and must not throw due to a missing room argument during hit resolution.
const mr=makeRoom();mr.mapId='playground';mr.state='playing';
const magnet={id:'m',team:'A',character:'magnet',x:21,y:29,aimX:21,aimY:49,alive:true,connected:true,stats:s.makeMatchStats('magnet')};
const target={id:'t',team:'B',character:'shield',x:21,y:38,alive:true,connected:true,invulnerableUntil:0,stats:s.makeMatchStats('shield')};
mr.players.set('m',magnet);mr.players.set('t',target);
mr.projectiles.set('hook',{id:'hook',x:21,y:29,vx:0,vy:42,range:20,traveled:0,radius:0.52,type:'attack',team:'A',character:'magnet',ownerId:'m',damage:0,magnetHook:true});
s.updateProjectiles(mr,0.3,NOW+1000);
assert.ok(target.magnetPull && target.magnetPull.until>NOW+1000, 'magnet hook pulls target');
assert.equal(magnet.stats.magnetHookHits,1);
console.log('1.11 regression assertions PASSED');
