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
