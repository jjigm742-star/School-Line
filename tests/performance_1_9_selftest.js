'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const client = fs.readFileSync(path.join(__dirname,'../public/game.js'),'utf8');
const server = fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
const html = fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
function between(start,end) {
  const a=client.indexOf(start),b=client.indexOf(end,a);
  assert(a>=0 && b>a, `missing client segment: ${start}`);
  return client.slice(a,b);
}
const snippet = between('function drawHomeZoneLabels(', '\nfunction updateHealerLowHpAttention(')
  + '\n' + between('let battlefieldBackgroundCache = null;', '\n// HUD content is based on 10 Hz');
let paints=0, backgroundBuilds=0;
function context(background=false){
  const methods={save(){},restore(){},strokeText(){},fillText(){},fillRect(){},
    setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},drawImage(){if(!background) paints++;}};
  return methods;
}
const canvas={width:1020,height:630};
const config={world:{width:42,height:68,aZoneEnd:18,bZoneStart:50},walls:[{x:10,y:20,w:3,h:7}]};
const env={config, canvas, ctx:context(),SCALE:15, spectatorMode:false,myId:'mine',
  document:{createElement(tag){assert.equal(tag,'canvas');backgroundBuilds++;return {
    width:0,height:0,getContext(type){assert.equal(type,'2d');return context(true);}};}}};
vm.createContext(env);
vm.runInContext(snippet,env);
const game={players:[{id:'mine',team:'A'}]};
assert.equal(env.drawCachedBattlefield(game),true);
assert.equal(backgroundBuilds,1);
assert.equal(paints,1);
env.drawCachedBattlefield(game);env.drawCachedBattlefield(game);
assert.equal(backgroundBuilds,1,'reuse cached static map across frames');
assert.equal(paints,3,'draw cached image for each frame');
game.players[0].team='B'; env.drawCachedBattlefield(game);
assert.equal(backgroundBuilds,2,'invalidate background when viewer team changes');
canvas.width=1018;env.drawCachedBattlefield(game);
assert.equal(backgroundBuilds,3,'invalidate background when canvas dimension changes');
env.config={...config}; env.drawCachedBattlefield(game);
assert.equal(backgroundBuilds,4,'invalidate background when game config changes');
env.spectatorMode=true;env.drawCachedBattlefield(game);
assert.equal(backgroundBuilds,5,'invalidate background for spectator perspective');
assert(client.includes('if (viewState !== lastHudSnapshot || selectedTargetId !== lastHudTargetId ||'), 'HUD updated for fresh snapshots or target selection');
assert(client.includes('beamFxNow - lastHudRefreshAt >= HUD_REFRESH_MS'), 'HUD updates at a bounded cadence');
assert(client.includes('if ($(' + "'myInfo'" + ').innerHTML !== infoHtml)'), 'avoid redundant HUD markup regeneration');
assert(client.includes('CHARACTER_FILL_COLORS[p.character]'), 'reuse per-character color palette');
assert(html.includes('game.js?v=1.9.1-queue-fps1'), 'new game.js cache-busting version');
const hash='e0687aaa8689e196e8bdb1d9c79b6c7631067a21246bfd7372657e6cd129bd72';
assert(server.includes(`const SPECTATOR_PIN_HASH = '${hash}'`), 'spectator PIN uses administrator secret');
for (const endpoint of ['ADMIN_STATS_PIN_HASH = SPECTATOR_PIN_HASH','ACCESS_ADMIN_PIN_HASH = SPECTATOR_PIN_HASH']) {
  assert(server.includes(endpoint),`PIN shared for ${endpoint}`);
}
assert(!server.includes('72a2d4365f37780690ee9d05b9a173e9036187fbfd5b5ae61785c5d5b0bf8a8a'),'old PIN hash removed');
assert(server.includes("const BALANCE_VERSION = '1.9'"),'competitive series preserved');
console.log('PASS: 1.9 FPS optimization cache invalidation, HUD/palette, and 3 administrator PIN paths');
