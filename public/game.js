'use strict';

const $ = id => document.getElementById(id);
const joinScreen = $('joinScreen'), lobbyScreen = $('lobbyScreen'), gameScreen = $('gameScreen');
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
const SCALE = 15; // world y -> screen x, world x -> screen y (mobile landscape rotation)

const CHARACTER_META = {
  iron:   { name: '아이언', icon: '⚙️', desc: 'HP 600 · 느림 · 65 DPS · 느린 중간탄' },
  shooter:{ name: '슈터', icon: '🎯', desc: 'HP 250 · 보통 · 100 DPS · 빠른 작은탄' },
  cannon: { name: '캐논', icon: '💥', desc: 'HP 275 · 매우 느림 · 140 DPS · 초당 10발' },
  fire:   { name: '파이어', icon: '🔥', desc: 'HP 200 · 빠름 · 80 DPS · 적중 시 화상' },
  water:  { name: '워터', icon: '💧', desc: 'HP 250 · 보통 · 65 HPS · 치유탄 전용' },
  wind:   { name: '윈드', icon: '🌪️', desc: 'HP 225 · 빠름 · 55 HPS · 치유탄+순풍' }
};

for (const select of [$('characterInput'), $('lobbyCharacter')]) {
  for (const [id, m] of Object.entries(CHARACTER_META)) {
    const opt = document.createElement('option'); opt.value = id; opt.textContent = `${m.icon} ${m.name}`; select.appendChild(opt);
  }
}
$('characterInput').value = 'shooter';
$('lobbyCharacter').value = 'shooter';

let ws = null, myId = null, config = null, state = null;
let keys = { up:false, down:false, left:false, right:false };
let mouseWorld = { x: 21, y: 34 };
let firing = false;
let lastAimDir = { x: 0, y: 1 }; // world direction, A->B by default

$('nameInput').value = localStorage.getItem('schoolLineName') || '';
$('roomInput').value = localStorage.getItem('schoolLineRoom') || '6-1';

function show(which) {
  joinScreen.classList.toggle('hidden', which !== 'join');
  lobbyScreen.classList.toggle('hidden', which !== 'lobby');
  gameScreen.classList.toggle('hidden', which !== 'game');
}

function wsUrl() { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`; }

$('joinButton').onclick = () => {
  $('joinError').textContent = '';
  localStorage.setItem('schoolLineName', $('nameInput').value);
  localStorage.setItem('schoolLineRoom', $('roomInput').value);
  ws = new WebSocket(wsUrl());
  ws.onopen = () => ws.send(JSON.stringify({ type:'join', name:$('nameInput').value, room:$('roomInput').value, character:$('characterInput').value }));
  ws.onmessage = ev => handleMessage(JSON.parse(ev.data));
  ws.onerror = () => $('joinError').textContent = '서버에 연결하지 못했습니다.';
  ws.onclose = () => { if (myId) { alert('서버 연결이 끊겼습니다.'); location.reload(); } };
};

function handleMessage(msg) {
  if (msg.type === 'error') { $('joinError').textContent = msg.message; if (ws) ws.close(); return; }
  if (msg.type === 'joined') {
    myId = msg.id; config = msg.config; $('roomLabel').textContent = msg.room; show('lobby'); return;
  }
  if (msg.type === 'state') {
    state = msg;
    if (state.state === 'playing') {
      show('game');
      const me = state.players.find(p => p.id === myId);
      if (me && !rightStick.active) {
        lastAimDir = me.team === 'A' ? {x:0,y:1} : {x:0,y:-1};
      }
    } else { show('lobby'); renderLobby(); }
  }
}

$('lobbyCharacter').onchange = () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type:'select', character:$('lobbyCharacter').value }));
  renderCharacterCard($('lobbyCharacter').value);
};
$('startButton').onclick = () => ws && ws.send(JSON.stringify({ type:'start' }));
$('fullscreenButton').onclick = enterGameDisplayMode;
$('gameFullscreenButton').onclick = enterGameDisplayMode;

async function enterGameDisplayMode() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  } catch (_) {}
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) {}
}

function renderCharacterCard(id) {
  const m = CHARACTER_META[id];
  $('characterCard').className = 'character-card';
  $('characterCard').innerHTML = `<b>${m.icon} ${m.name}</b><br>${m.desc}`;
}
renderCharacterCard('shooter');

function renderLobby() {
  if (!state) return;
  const me = state.players.find(p => p.id === myId);
  if (me) {
    $('lobbyCharacter').value = me.character;
    renderCharacterCard(me.character);
  }
  const isHost = state.hostId === myId;
  $('startButton').classList.toggle('hidden', !isHost);
  $('hostLabel').textContent = isHost ? '내가 방장입니다.' : '방장이 경기를 시작합니다.';
  $('resultBanner').classList.toggle('hidden', state.state !== 'ended');
  if (state.state === 'ended') $('resultBanner').textContent = state.winner === 'DRAW' ? '무승부!' : `${state.winner}팀 승리! 방장이 다시 시작할 수 있습니다.`;
  for (const team of ['A','B']) {
    const root = $(team === 'A' ? 'teamAList' : 'teamBList'); root.innerHTML = '';
    for (const p of state.players.filter(p => p.team === team)) {
      const div = document.createElement('div'); div.className = 'player-row' + (p.id === myId ? ' you' : '');
      div.innerHTML = `<span>${p.id === state.hostId ? '👑 ' : ''}${escapeHtml(p.name)}</span><span>${CHARACTER_META[p.character].icon} ${CHARACTER_META[p.character].name}</span>`;
      root.appendChild(div);
    }
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

// Desktop fallback controls remain available.
function setKey(code, value) {
  // The mobile arena is rotated: screen up/down changes world x, screen left/right changes world y.
  if (code === 'KeyW' || code === 'ArrowUp') keys.left = value;
  if (code === 'KeyS' || code === 'ArrowDown') keys.right = value;
  if (code === 'KeyA' || code === 'ArrowLeft') keys.up = value;
  if (code === 'KeyD' || code === 'ArrowRight') keys.down = value;
}
window.addEventListener('keydown', e => { if (!gameScreen.classList.contains('hidden')) { setKey(e.code, true); if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault(); } });
window.addEventListener('keyup', e => setKey(e.code, false));
window.addEventListener('blur', resetInputs);
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousemove', e => {
  if (matchMedia('(pointer:fine)').matches) {
    const p = clientToWorld(e.clientX, e.clientY); mouseWorld.x = p.x; mouseWorld.y = p.y;
  }
});
canvas.addEventListener('mousedown', e => { if (e.button === 0) firing = true; });
window.addEventListener('mouseup', e => { if (e.button === 0) firing = false; });

document.addEventListener('visibilitychange', () => { if (document.hidden) resetInputs(); });
function resetInputs() {
  keys = {up:false,down:false,left:false,right:false}; firing = false;
  resetStick(leftStick); resetStick(rightStick);
}

function clientToWorld(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const sx = (clientX - r.left) * canvas.width / r.width;
  const sy = (clientY - r.top) * canvas.height / r.height;
  // screen x = world y, screen y = world x
  return { x: sy / SCALE, y: sx / SCALE };
}

// Dual-stick mobile controls.
const leftStick = makeStick($('moveZone'), $('moveKnob'), false);
const rightStick = makeStick($('aimZone'), $('aimKnob'), true);

function makeStick(zone, knob, isAim) {
  const stick = { zone, knob, isAim, pointerId:null, active:false, cx:0, cy:0, radius:50, dx:0, dy:0 };
  zone.addEventListener('pointerdown', e => startStick(stick, e));
  zone.addEventListener('pointermove', e => moveStick(stick, e));
  zone.addEventListener('pointerup', e => endStick(stick, e));
  zone.addEventListener('pointercancel', e => endStick(stick, e));
  zone.addEventListener('lostpointercapture', e => { if (stick.pointerId === e.pointerId) resetStick(stick); });
  return stick;
}

function getStickBase(stick) {
  const base = stick.knob.parentElement.getBoundingClientRect();
  return { cx: base.left + base.width/2, cy: base.top + base.height/2, radius: base.width * 0.38 };
}

function startStick(stick, e) {
  if (stick.active) return;
  e.preventDefault();
  stick.pointerId = e.pointerId; stick.active = true;
  stick.zone.setPointerCapture(e.pointerId);
  const b = getStickBase(stick); stick.cx=b.cx; stick.cy=b.cy; stick.radius=b.radius;
  updateStick(stick, e.clientX, e.clientY);
  if (stick.isAim) firing = true;
}
function moveStick(stick, e) {
  if (!stick.active || e.pointerId !== stick.pointerId) return;
  e.preventDefault(); updateStick(stick, e.clientX, e.clientY);
}
function endStick(stick, e) {
  if (!stick.active || e.pointerId !== stick.pointerId) return;
  e.preventDefault(); resetStick(stick);
}
function resetStick(stick) {
  if (!stick) return;
  stick.active=false; stick.pointerId=null; stick.dx=0; stick.dy=0;
  stick.knob.style.transform = 'translate(-50%,-50%)';
  if (stick.isAim) firing=false;
  else keys = {up:false,down:false,left:false,right:false};
}
function updateStick(stick, clientX, clientY) {
  let dx=clientX-stick.cx, dy=clientY-stick.cy;
  const len=Math.hypot(dx,dy); const clamped=Math.min(len,stick.radius);
  if (len>0.001) { dx=dx/len*clamped; dy=dy/len*clamped; } else { dx=0; dy=0; }
  stick.dx=dx/stick.radius; stick.dy=dy/stick.radius;
  stick.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  if (stick.isAim) {
    const mag=Math.hypot(stick.dx,stick.dy);
    if (mag>0.15) {
      // screen dx -> world y; screen dy -> world x
      lastAimDir={ x:stick.dy/mag, y:stick.dx/mag };
    }
  } else {
    const dead=.22;
    // Rotated arena mapping: screen horizontal -> world y, screen vertical -> world x.
    keys.up=stick.dx < -dead; keys.down=stick.dx > dead;
    keys.left=stick.dy < -dead; keys.right=stick.dy > dead;
  }
}

setInterval(() => {
  if (!ws || ws.readyState !== WebSocket.OPEN || !state || state.state !== 'playing') return;
  const me = state.players.find(p => p.id === myId);
  if (me && rightStick.active) {
    mouseWorld.x = me.x + lastAimDir.x * 24;
    mouseWorld.y = me.y + lastAimDir.y * 24;
  }
  ws.send(JSON.stringify({ type:'input', ...keys, fire:firing, aimX:mouseWorld.x, aimY:mouseWorld.y }));
}, 1000/30);

function worldToScreen(x,y) { return { x:y*SCALE, y:x*SCALE }; }
function drawText(text, x, y, size=12, align='center', color='#fff') {
  ctx.font = `600 ${size}px system-ui`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, x, y);
}

function renderGame() {
  requestAnimationFrame(renderGame);
  if (!state || state.state !== 'playing' || !config) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#121821'; ctx.fillRect(0,0,canvas.width,canvas.height);

  // Owned zones are left/right in mobile landscape view.
  ctx.fillStyle = 'rgba(65,130,255,.16)'; ctx.fillRect(0,0,config.world.aZoneEnd*SCALE,canvas.height);
  ctx.fillStyle = 'rgba(255,80,80,.14)'; ctx.fillRect(config.world.bZoneStart*SCALE,0,(config.world.height-config.world.bZoneStart)*SCALE,canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.setLineDash([7,7]);
  for (const y of [config.world.aZoneEnd, config.world.bZoneStart]) { ctx.beginPath(); ctx.moveTo(y*SCALE,0); ctx.lineTo(y*SCALE,canvas.height); ctx.stroke(); }
  ctx.setLineDash([]);

  // Walls rotated into landscape view.
  ctx.fillStyle = '#4b5565';
  for (const w of config.walls) ctx.fillRect(w.y*SCALE,w.x*SCALE,w.h*SCALE,w.w*SCALE);

  for (const p of state.projectiles) {
    const s=worldToScreen(p.x,p.y), r=Math.max(2,p.radius*SCALE);
    ctx.beginPath(); ctx.arc(s.x,s.y,r,0,Math.PI*2);
    if (p.type === 'heal') ctx.fillStyle = p.character === 'wind' ? '#9ef7d5' : '#65d7ff';
    else if (p.character === 'fire') ctx.fillStyle = '#ff9a45';
    else ctx.fillStyle = p.team === 'A' ? '#8bbcff' : '#ff9c9c';
    ctx.fill();
  }

  for (const p of state.players) {
    if (!p.alive) continue;
    const radius = ({iron:.65,shooter:.5,cannon:.65,fire:.5,water:.4,wind:.4})[p.character] * SCALE;
    const s=worldToScreen(p.x,p.y), x=s.x,y=s.y;
    ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2);
    ctx.fillStyle = ({iron:'#8893a3',shooter:'#58a6ff',cannon:'#d9a441',fire:'#ff704d',water:'#4cc9f0',wind:'#73d6a6'})[p.character];
    ctx.fill();
    ctx.lineWidth = p.id === myId ? 4 : 2.2; ctx.strokeStyle = p.team === 'A' ? '#2f77ff' : '#ff4545'; ctx.stroke();
    if (p.burning) { ctx.lineWidth=2; ctx.strokeStyle='#ffb347'; ctx.beginPath(); ctx.arc(x,y,radius+4,0,Math.PI*2); ctx.stroke(); }
    if (p.tailwind) { ctx.lineWidth=2; ctx.strokeStyle='#b1ffe1'; ctx.beginPath(); ctx.arc(x,y,radius+7,0,Math.PI*2); ctx.stroke(); }

    const target=worldToScreen(p.aimX,p.aimY), adx=target.x-x, ady=target.y-y, al=Math.hypot(adx,ady)||1;
    ctx.strokeStyle='rgba(255,255,255,.65)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+(adx/al)*(radius+9),y+(ady/al)*(radius+9)); ctx.stroke();

    const bw=42,bh=5,bx=x-bw/2,by=y-radius-15;
    ctx.fillStyle='#241e24'; ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle='#7ee18b'; ctx.fillRect(bx,by,bw*Math.max(0,p.hp/p.maxHp),bh);
    drawText(p.name,x,by-7,11,'center','#f6f8fb');
  }

  const me = state.players.find(p => p.id === myId);
  const t = Math.ceil(state.timeLeft); $('timer').textContent = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  $('scoreA').textContent = Math.floor(state.scoreA); $('scoreB').textContent = Math.floor(state.scoreB);
  if (me) {
    const m=CHARACTER_META[me.character];
    $('myInfo').innerHTML = `<b>${m.icon} ${m.name}</b><br>HP ${Math.max(0,Math.ceil(me.hp))}/${me.maxHp}<br>${me.team}팀`;
    $('respawn').textContent = me.alive ? '' : `부활 ${(me.respawnMs/1000).toFixed(1)}초`;
  }
}
renderGame();
