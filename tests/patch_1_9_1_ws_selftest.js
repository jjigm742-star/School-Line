'use strict';
process.env.NODE_ENV='test';
const assert=require('node:assert/strict');
const g=require('../server');
const accounts=Array.from({length:8},(_,i)=>({id:`S${String(i+1).padStart(3,'0')}`,name:`WS학생${i+1}`,pin:String(3000+i),role:'student'}));
g.__test191.setAccounts(accounts);
g.__test191.setDurableReady(true);
function waitFor(predicate, timeout=8000){return new Promise((resolve,reject)=>{const until=Date.now()+timeout;const poll=()=>{if(predicate())return resolve();if(Date.now()>until)return reject(new Error('timeout in WebSocket scenario'));setTimeout(poll,20);};poll();});}
async function main(){
 const sockets=[];
 try{
  await new Promise(resolve=>g.server.listen(0,'127.0.0.1',resolve));
  const port=g.server.address().port;
  const response=await fetch(`http://127.0.0.1:${port}/admin/access-control`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'1832',action:'open'})});
  assert.equal(response.status,200,'administrator PIN works end-to-end');
  for(let i=0;i<8;i++){
   const sock=new WebSocket(`ws://127.0.0.1:${port}/ws`);
   sock.messages=[];
   sock.addEventListener('message', ev=>{try{sock.messages.push(JSON.parse(ev.data));}catch(_){}});
   await new Promise((resolve,reject)=>{sock.addEventListener('open',resolve,{once:true});sock.addEventListener('error',reject,{once:true});});
   sockets.push(sock);
   sock.send(JSON.stringify({type:'random_queue_join',accountId:accounts[i].id,pin:accounts[i].pin}));
  }
  await waitFor(()=>sockets.every(sock=>sock.messages.some(m=>m.type==='random_queue_status' && m.phase==='confirm')));
  for(const sock of sockets) sock.send(JSON.stringify({type:'random_queue_confirm'}));
  await waitFor(()=>g.rooms.size===1 && [...g.rooms.values()][0].state==='draft' && [...g.rooms.values()][0].players.size===8);
  const game=[...g.rooms.values()][0];
  await waitFor(()=>sockets.every(sock=>sock.messages.some(m=>m.type==='joined')));
  assert.equal(game.matchmakingMode,'random_queue');
  assert.equal([...game.players.values()].filter(p=>p.team==='A').length,4);
  assert.equal([...game.players.values()].filter(p=>p.team==='B').length,4);
  assert.equal(g.randomQueue.size,0);
  const assigned=sockets.map(sock=>sock.messages.find(m=>m.type==='joined'));
  assert.equal(new Set(assigned.map(m=>m.accountId)).size,8);
  // Manual team switch is refused even if a malicious client bypasses UI.
  sockets[0].send(JSON.stringify({type:'set_team',team:assigned[0].team==='A'?'B':'A'}));
  await waitFor(()=>sockets[0].messages.some(m=>m.type==='team_change_error'));
  console.log('PASS: HTTP administrator auth + 8 real WebSockets + queue + confirmation + random draft + team lock');
 } finally {
  for(const sock of sockets)try{sock.close();}catch(_){}
  await new Promise(resolve=>{g.server.close(()=>resolve());setTimeout(()=>{g.server.closeAllConnections();resolve();},2000).unref();});
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
