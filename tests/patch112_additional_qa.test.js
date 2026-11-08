'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('../server');
const c = s.CHARACTERS;
const base = path.resolve(__dirname, '..');
const client = fs.readFileSync(path.join(base,'public','game.js'),'utf8');

// Match displayed descriptions to authoritative 1.12 mechanics.
assert.match(client, /case 'shield': return \{name:'보호막'.*?c\.shieldAbilityRange/);
assert.doesNotMatch(client, /case 'shield': return \{[^\n]*거리·시야 제한 없음/);
assert.match(client, /case 'magnet': return \{name:'자석'.*?c\.magnetHookDamage/);
assert.doesNotMatch(client, /피해와 기절 없음/);
assert.match(client, /case 'dia': effect=`시전 후 .*?c\.ultimateHealPerHit/);
assert.doesNotMatch(client, /case 'dia': effect=`\$\{n\(c\.ultimateVolleyCount\)\}/);

// Verify Spray inherits 1.11 Dia's radial fire pattern (and not the former rotating Spray barrage).
const now = Date.now();
const room = s.newRoom('AUDIT_SPRAY_112', { displayNumber: 4, mode: 'casual'});
room.state='playing';room.matchMode='casual';
room.matchStartedAt=now; room.matchEndAt=now+180000; room.nextUltimateAutoChargeAt=now+4000;
const spray = {
 id:'spray', name:'spray', team:'A', character:'spray', x:21,y:34,
 aimX:25,aimY:34, hp:c.spray.hp, maxHp:c.spray.hp, alive:true, connected:true,
 input:{up:false,down:false,left:false,right:false,fire:false},
 shield:0,ultimateCharge:1200,ultimateUntil:0,invulnerableUntil:0,respawnAt:0,
 nextFireAt:now+50000,lastCombatAt:now,stats:s.makeMatchStats('spray')
};
room.players.set(spray.id,spray);
assert.equal(s.activateUltimate(room,spray,now),true);
assert.equal(room.projectileCounter,17,'16 projectiles in first volley (counter starts at 1)');
assert.equal(spray.patternUltimateRemaining,2);
assert.equal(spray.ultimateUntil,0,'old Dia radial ultimate had no charge lock');
assert.equal(s.grantUltimateCharge(spray,50,now+100),50,'normal gauge accrual remains available, unlike an active time-locked ultimate');
// The old Dia pattern continues after a stun, but stops if caster dies.
const initial=room.projectileCounter;
s.applyStatus(room, null, spray, 'stun', 3000, now);
s.updateRoom(room,.02,now+1000);
assert.equal(room.projectileCounter-initial,16,'second volley fires during stun like old Dia');
const second=room.projectileCounter;
s.updateRoom(room,.02,now+2000);
assert.equal(room.projectileCounter-second,16,'third volley fires during stun like old Dia');
assert.equal(spray.patternUltimateRemaining,0);
assert.equal(room.projectileCounter-1,48);

// Version is independently recorded; 1.11 archive and original assets remain available.
assert.equal(s.publicCompetitiveStats().currentBuild.balanceVersion,'1.12');
const backup = s.competitiveStatsBackupPayload();
assert.equal(backup.backupMeta.currentBalanceVersion,'1.12');
assert.equal(backup.patchNotesByVersion['1.11'].version,'1.11');
assert.equal(backup.patchNotesByVersion['1.12'].version,'1.12');

console.log('1.12 additional UI text, inherited Spray waves/stun/charge and stat-series QA PASSED');
