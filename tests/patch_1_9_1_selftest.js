'use strict';
process.env.NODE_ENV='test';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const g=require('../server');
const h=g.__test191;
let checks=0;
function eq(actual,expected,note){assert.equal(actual,expected,note);checks++;}
function ok(value,note){assert.ok(value,note);checks++;}
const origin=Date.now();
const accounts=Array.from({length:25},(_,i)=>({id:`S${String(i+1).padStart(3,'0')}`,name:`학생${i+1}`,pin:String(2000+i),role:'student'}));
h.setAccounts(accounts);h.setDurableReady(true);
function conn(id){return {closed:false,playerId:null,roomCode:null,queueAccountId:null,received:[],send(msg){this.received.push(msg);return true;},close(){this.closed=true;}};}
let c=new Map();
function join(i,t=origin){const acct=accounts[i-1],co=conn(acct.id);c.set(i,co);g.enrollRandomQueue(co,{accountId:acct.id,pin:acct.pin},t);return co;}
function reset(){g.resetRandomMatchQueue('reset');g.rooms.clear();c=new Map();}
function confirm(i,t=origin+10){g.confirmRandomQueue(c.get(i),t);}
// 1 to 7 participants never start a group.
for(let i=1;i<=7;i++)join(i);
eq(g.rooms.size,0,'1..7 people cannot start');eq(g.randomConfirmGroups.size,0,'no early confirmation group');
join(8);
eq(g.randomConfirmGroups.size,1,'eight immediately create one confirmation group');
for(let i=1;i<=8;i++)ok(g.queueAccount(accounts[i-1].id)?.groupId,'first eight reserved');
join(9);join(10);join(11);join(12);
for(let i=9;i<=12;i++)eq(g.queueAccount(accounts[i-1].id).groupId,null,'later four remain queued');
const dupe=conn('duplicate');g.enrollRandomQueue(dupe,{accountId:accounts[0].id,pin:accounts[0].pin},origin);
ok(dupe.received.some(x=>x.type==='random_queue_error'),'duplicate active session rejected');
for(let i=1;i<=8;i++)confirm(i);
eq(g.rooms.size,1,'first eight create exactly one game');
const room=[...g.rooms.values()][0];
eq(room.state,'draft','match proceeds into existing competitive draft');
eq(room.matchmakingMode,'random_queue','room records queue mode');
ok(room.queueLocked,'no manual joining/team switch');
eq(room.players.size,8,'exactly eight players attached');
eq([...room.players.values()].filter(p=>p.team==='A').length,4,'four players A');
eq([...room.players.values()].filter(p=>p.team==='B').length,4,'four players B');
eq(new Set([...room.players.values()].map(p=>p.accountId)).size,8,'all accounts unique');
for(let i=9;i<=12;i++)ok(g.queueAccount(accounts[i-1].id),'waiting players preserve reservation');
// First match players cannot jump back into queue while their room is active.
const attempted=conn('rejoin');g.enrollRandomQueue(attempted,{accountId:accounts[0].id,pin:accounts[0].pin},origin+20);
ok(attempted.received.some(x=>x.type==='random_queue_error'),'active match cannot also queue');
// Simulate room close: later applicants retain their FIFO seq before previous players reapply.
g.rooms.clear();
for(let i=1;i<=4;i++)join(i,origin+30);
eq(g.randomConfirmGroups.size,1,'old waiters plus returning players can form group');
const nextGroup=[...g.randomConfirmGroups.values()][0];
for(let i=9;i<=12;i++)ok(nextGroup.members.has(accounts[i-1].id),'old waiters selected before returning players');
for(let i=1;i<=4;i++)confirm(i,origin+40);
for(let i=9;i<=12;i++)confirm(i,origin+40);
eq(g.rooms.size,1,'second distinct group starts');
// 16 simultaneous entrants => two independent drafts where capacity permits.
reset();for(let i=1;i<=16;i++)join(i,origin+100);
eq(g.randomConfirmGroups.size,2,'16 applicants become two confirmation groups');
for(let i=1;i<=16;i++)confirm(i,origin+110);
eq(g.rooms.size,2,'two parallel rooms');
for(const r of g.rooms.values()){eq(r.players.size,8,'8 in each');eq(r.state,'draft','both in draft');}
// Decline refills from earlier waiting applicants; those who confirmed stay ahead.
reset();for(let i=1;i<=12;i++)join(i,origin+200);
for(let i=1;i<=7;i++)confirm(i,origin+210);
g.refuseRandomQueue(c.get(8),origin+220);
eq(g.randomConfirmGroups.size,1,'decline keeps cohort');
for(let i=1;i<=7;i++)ok(g.queueAccount(accounts[i-1].id).confirmed,'already-confirmed members keep yes vote');
ok(g.queueAccount(accounts[8].id).groupId,'first waiting replacement is #9');
confirm(9,origin+230);
eq(g.rooms.size,1,'replacement confirmation finishes draft');
// Timed-out non-confirmers leave; established confirmations stay, earliest replacement joins.
reset();for(let i=1;i<=12;i++)join(i,origin+300);
for(let i=1;i<=7;i++)confirm(i,origin+310);
g.processRandomMatchQueue(origin+300+21000);
eq(g.queueAccount(accounts[7].id),undefined,'timeout removes unconfirmed #8');
for(let i=1;i<=7;i++)ok(g.queueAccount(accounts[i-1].id)?.confirmed,'confirmed priority survives timeout');
ok(g.queueAccount(accounts[8].id)?.groupId,'#9 refills timeout');
confirm(9,origin+300+21010);
eq(g.rooms.size,1,'recovered group creates room');
// Reconnect within 30 seconds must retain original position and previous confirmation.
reset();const old=join(1,origin+400);
g.disconnect(old);
const still=g.queueAccount(accounts[0].id);
ok(still && still.disconnectedAt,'disconnect reservation retained');
for(let i=2;i<=8;i++)join(i,origin+410);
const replacement=conn('S001 reconnect');c.set(1,replacement);
g.enrollRandomQueue(replacement,{accountId:accounts[0].id,pin:accounts[0].pin},origin+420);
eq(g.queueAccount(accounts[0].id)?.seq,still.seq,'reconnect retains FIFO sequence');
for(let i=1;i<=8;i++)confirm(i,origin+430);
eq(g.rooms.size,1,'8-person game resumes after network recovery');
// Five occupied rooms must not drop a confirmed cohort; it starts when a slot opens.
reset();
for(let i=1;i<=5;i++){const manualRoom=g.newRoom(`BUSY${i}`,{displayNumber:i,mode:'competitive'});g.rooms.set(manualRoom.code,manualRoom);}
for(let i=1;i<=8;i++)join(i,origin+500);
for(let i=1;i<=8;i++)confirm(i,origin+510);
eq(g.rooms.size,5,'full room capacity prevents sixth room');
eq(g.randomQueue.size,8,'confirmed group waits without losing seats');
ok(c.get(1).received.some(m=>m.phase==='waiting_room'),'players told to wait for room capacity');
g.rooms.delete('BUSY5');g.processRandomMatchQueue(origin+520);
eq(g.rooms.size,5,'released room slot starts queue draft');
eq(g.randomQueue.size,0,'all reservations clear when attached to room');
// A 30-second disconnection grace expires if a player never returns.
reset();const disconnected=join(1,origin+700);
g.disconnect(disconnected);
const disconnectedAt=g.queueAccount(accounts[0].id).disconnectedAt;
for(let i=2;i<=8;i++)join(i,origin+710);
ok(g.queueAccount(accounts[0].id),'disconnect temporarily retains original seat');
g.processRandomMatchQueue(disconnectedAt+30001);
eq(g.queueAccount(accounts[0].id),undefined,'disconnected account evicted after 30 sec');
// Manual room still works, and random rooms reject manual join/team switch.
reset();const manual=g.newRoom('MANUAL191',{displayNumber:1,mode:'competitive'});g.rooms.set(manual.code,manual);
eq(manual.queueLocked,false,'manual room remains changeable');
eq(manual.matchmakingMode,'manual_room','manual room mode stored');
// Three filter modes must recompute every aggregate from exact original gameVersion.
function match(matchId,gameVersion,winner='A',matchmakingMode='manual_room'){
 const players=Array.from({length:8},(_,i)=>({playerId:`${matchId}-P${i}`,accountId:accounts[i].id,playerName:accounts[i].name,team:i<4?'A':'B',character:Object.keys(g.CHARACTERS)[i],connectedAtEnd:true,disconnectCount:0,stats:{damage:100,healing:10,kills:1,deaths:0,assists:0,ultimateUses:1,objectiveSeconds:5}}));
 return {matchId,gameVersion,balanceVersion:'1.9',statsVersion:'1.9',buildId:matchId,matchMode:'competitive',matchmakingMode,
  availableCharacters:Object.keys(g.CHARACTERS),players,
  finalAssignments:players.map(p=>({playerId:p.playerId,accountId:p.accountId,playerName:p.playerName,team:p.team,character:p.character})),
  bans:[{team:'A',character:'witch'},{team:'B',character:'hacker'}],picks:players.map((p,i)=>({character:p.character,playerId:p.playerId,order:i+1})),
  winner,score:{A:1,B:0},firstPickTeam:'A',endedAt:new Date().toISOString(),dataQuality:{complete:true}};
}
const oldMatch=match('old191','1.9','A');const newMatch=match('new191','1.9.1','B','random_queue');
h.setStats([oldMatch,newMatch,newMatch]);
const older=g.publicCompetitiveStats('1.9'), newer=g.publicCompetitiveStats('1.9.1'), combined=g.publicCompetitiveStats('1.9-combined');
eq(older.totalMatches,1,'1.9 only match');eq(newer.totalMatches,1,'1.9.1 only match');eq(combined.totalMatches,2,'both original matches deduped');
eq(older.matches[0].matchId,'old191','historic source preserved');eq(newer.matches[0].matchmakingMode,'random_queue','matchmaking mode in source');
eq(combined.characters.iron.wins,1,'aggregated iron winner in old');eq(combined.characters.iron.losses,1,'aggregated iron loser in new');
eq(combined.characters.iron.winRate,.5,'win rate is total W / total decisions');
eq(combined.advanced.players.find(p=>p.nickname==='학생1').games,2,'player rows recomputed');
eq(combined.advanced.draft.characters.witch.bans,2,'ban aggregate recomputed');
eq(g.competitiveStatsBackupPayload().matches.length,2,'backup preserves original deduped records');
ok(combined.availableStatsVersions.includes('1.9-combined'),'combined stats option');
eq(require('../package.json').version,'1.9.1','new game version');
const server=fs.readFileSync(path.resolve(__dirname,'../server.js'),'utf8');
ok(server.includes("const BALANCE_VERSION = '1.9';"),'balance series frozen at 1.9');
ok(server.includes("const GAME_VERSION = '1.9.1';"),'game version correct');
ok(server.includes("matchmakingMode: room.matchmakingMode || 'manual_room'"),'source record has matching mode');
const html=fs.readFileSync(path.resolve(__dirname,'../public/index.html'),'utf8');
for(const id of ['randomQueueJoinButton','randomQueuePanel','randomQueueConfirmButton','randomQueueCancelButton'])ok(html.includes(`id="${id}"`),`${id} in UI`);
console.log(`PASS: ${checks} School Line 1.9.1 queue/version/old-room assertions`);
