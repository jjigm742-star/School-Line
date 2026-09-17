'use strict';

const $ = id => document.getElementById(id);
const joinScreen = $('joinScreen'), lobbyScreen = $('lobbyScreen'), gameScreen = $('gameScreen');
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
const SCALE = 15; // world y -> screen x, world x -> screen y (mobile landscape rotation)

const CHARACTER_META = {
  iron: { role:'탱커', name:'아이언', icon:'⚙️', mini:'HP 600 · 느림', stat:'HP 600 · 속도 4.0 · 사거리 24 · 65 DPS', summary:'가장 단단한 정통 탱커', mechanic:'높은 체력으로 전선을 버티는 캐릭터. 탄속은 느리지만 꾸준히 공격하면서 적 진입을 받아내기 좋다.' },
  mecha: { role:'탱커', name:'메카', icon:'🤖', mini:'HP 550 · 빠름', stat:'HP 550 · 속도 6.0 · 사거리 16 · 45 DPS', summary:'높은 체력과 빠른 속도로 전선을 밀어내는 탱커', mechanic:'별도 변신이나 조종사 상태가 없는 단일 상태 탱커. 사거리는 16으로 짧고 화력은 낮지만, HP 550과 속도 6.0으로 먼저 공간을 차지하고 적의 공격을 받아내는 데 강하다.' },
  dia: { role:'탱커', name:'다이아', icon:'💎', mini:'HP 350 · 변신', stat:'HP 350 · 속도 4.0 · 기본 65 DPS · 변신 6초', summary:'타이밍을 잡아 강해지는 변신 탱커', mechanic:'기본형은 투사체로 싸운다. Space 또는 변신 버튼을 누르면 6초간 HP 400, 속도 5.0, 80 DPS 광선폼이 된다. 변신 쿨은 16초이며 폼 중 직접 처치하면 6초 감소한다.' },
  shooter: { role:'딜러', name:'슈터', icon:'🎯', mini:'100 DPS · 안정적', stat:'HP 250 · 속도 5.0 · 사거리 24 · 100 DPS', summary:'가장 표준적인 원거리 딜러', mechanic:'빠르고 작은 탄을 초당 5발 발사한다. 특별한 조건 없이 꾸준한 화력을 내기 쉬워 입문용으로 좋다.' },
  sniper: { role:'딜러', name:'스나이퍼', icon:'🔭', mini:'장거리 · 거리비례 피해', stat:'HP 150 · 속도 4.0 · 사거리 36 · 초당 1발', summary:'멀수록 한 발이 강해지는 초장거리 딜러', mechanic:'매우 빠른 작은 투사체를 초당 1발 발사한다. 실제로 날아가 충돌한 거리 기준으로 16 이하는 65, 16 초과~32 이하는 85, 32 초과~36 이하는 105 피해를 준다. 가까이 붙으면 약해진다.' },
  cannon: { role:'딜러', name:'캐논', icon:'💥', mini:'140 DPS · 느림', stat:'HP 275 · 속도 3.2 · 사거리 24 · 140 DPS', summary:'기동성을 버리고 화력을 얻은 중화기 딜러', mechanic:'초당 10발을 퍼붓는 최고 수준의 지속 화력. 대신 이동속도가 매우 느려 위치를 잘못 잡으면 도망치기 어렵다.' },
  fire: { role:'딜러', name:'파이어', icon:'🔥', mini:'80 DPS · 화상', stat:'HP 200 · 속도 6.0 · 사거리 24 · 80 DPS + 화상', summary:'빠르게 움직이며 지속 피해를 남기는 딜러', mechanic:'적중한 적에게 2초 동안 화상을 남긴다. 체력은 낮지만 빠른 이동속도로 위치를 바꾸며 싸우기 좋다.' },
  laser: { role:'딜러', name:'레이저', icon:'🔴', mini:'광선 · 탱커 압박', stat:'HP 275 · 속도 5.0 · 사거리 16 · 80 + 최대HP 10% DPS', summary:'체력이 높은 적일수록 더 아픈 광선 딜러', mechanic:'조준한 방향으로 즉시 광선을 연결한다. 기본 80 DPS에 대상 최대 체력의 10%만큼 DPS가 추가되어 탱커를 상대할 때 특히 강하다.' },
  ice: { role:'딜러', name:'아이스', icon:'🧊', mini:'80 DPS · 감속', stat:'HP 275 · 속도 5.0 · 사거리 16 · 80 DPS', summary:'적의 움직임을 묶는 제어형 광선 딜러', mechanic:'광선이 적에게 닿으면 이동속도를 1단계 낮춘다. 감속은 마지막 적중 후 1.5초 유지되며 윈드의 순풍과 만나면 서로 상쇄된다.' },
  water: { role:'힐러', name:'워터', icon:'💧', mini:'65 HPS · 안정 치유', stat:'HP 250 · 속도 5.0 · 사거리 24 · 65 HPS', summary:'가장 단순하고 안정적인 기본 힐러', mechanic:'오른쪽 스틱으로 아군을 조준해 치유탄을 발사한다. 치유탄은 적을 통과하고 처음 맞은 아군을 회복시킨다.' },
  wind: { role:'힐러', name:'윈드', icon:'🌪️', mini:'55 HPS · 순풍', stat:'HP 225 · 속도 6.0 · 사거리 24 · 55 HPS', summary:'치유와 기동력 지원을 함께 주는 힐러', mechanic:'치유탄에 맞은 아군은 2초 동안 이동속도가 1단계 빨라진다. 빠른 본체 속도까지 활용해 전선을 따라다니기 좋다.' },
  light: { role:'힐러', name:'라이트', icon:'✨', mini:'광선 · 힐+딜', stat:'HP 225 · 속도 6.0 · 사거리 16 · 55 HPS / 60 DPS', summary:'한 줄에서 치유와 공격을 동시에 만드는 광선 힐러', mechanic:'광선이 처음 만난 아군 1명을 치유한 뒤 그 아군을 관통한다. 이후 처음 만나는 적에게 60 DPS를 주고 그 적에서 광선이 끝난다. 적을 먼저 만나면 적에게만 피해를 준다.' }
};

const ROLE_ORDER = ['탱커','딜러','힐러'];
const ROLE_LABEL = { '탱커':'🛡️ 탱커', '딜러':'⚔️ 딜러', '힐러':'💚 힐러' };
const savedCharacter = localStorage.getItem('schoolLineCharacter');
const initialCharacter = CHARACTER_META[savedCharacter] ? savedCharacter : 'shooter';
const pickerState = {
  join: { selected: initialCharacter, role: CHARACTER_META[initialCharacter].role },
  lobby: { selected: initialCharacter, role: CHARACTER_META[initialCharacter].role }
};

function renderPicker(kind) {
  const tabs = $(`${kind}RoleTabs`);
  const choices = $(`${kind}CharacterChoices`);
  const detail = $(`${kind}CharacterDetail`);
  const ps = pickerState[kind];
  tabs.innerHTML = '';
  choices.innerHTML = '';

  for (const role of ROLE_ORDER) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'role-tab' + (ps.role === role ? ' active' : '');
    btn.textContent = ROLE_LABEL[role];
    btn.onclick = () => {
      ps.role = role;
      const candidates = Object.keys(CHARACTER_META).filter(id => CHARACTER_META[id].role === role);
      if (!candidates.includes(ps.selected)) ps.selected = candidates[0];
      renderPicker(kind);
      if (kind === 'lobby') selectLobbyCharacter(ps.selected);
    };
    tabs.appendChild(btn);
  }

  for (const [id, m] of Object.entries(CHARACTER_META).filter(([,m]) => m.role === ps.role)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'character-choice' + (ps.selected === id ? ' selected' : '');
    btn.innerHTML = `<span class="char-name">${m.icon} ${m.name}</span><span class="char-mini">${m.mini}</span>`;
    btn.onclick = () => {
      ps.selected = id;
      localStorage.setItem('schoolLineCharacter', id);
      renderPicker(kind);
      if (kind === 'lobby') selectLobbyCharacter(id);
    };
    choices.appendChild(btn);
  }

  const m = CHARACTER_META[ps.selected];
  detail.innerHTML = `<div class="character-detail-head"><div class="character-detail-name">${m.icon} ${m.name}</div><span class="role-badge">${m.role}</span></div><div class="character-statline">${m.stat}</div><div class="character-summary">${m.summary}</div><div class="character-mechanic">${m.mechanic}</div>`;
}

function selectLobbyCharacter(id) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type:'select', character:id }));
}

renderPicker('join');
renderPicker('lobby');

let ws = null, myId = null, config = null, state = null;
let keys = { up:false, down:false, left:false, right:false };
let mouseWorld = { x: 21, y: 34 };
let firing = false;
let lastAimDir = { x: 0, y: 1 }; // world direction, A->B by default


// Alpha 0.4: lightweight Web Audio + haptics. No external audio assets are required.
let audioCtx = null;
let masterGain = null;
let bgmGain = null;
let sfxGain = null;
let bgmTimer = null;
let bgmStep = 0;
let lastHitFeedbackAt = 0;
let audioEnabled = localStorage.getItem('schoolLineAudio') !== 'off';

function ensureAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
    masterGain = audioCtx.createGain();
    bgmGain = audioCtx.createGain();
    sfxGain = audioCtx.createGain();
    masterGain.gain.value = audioEnabled ? 1 : 0;
    bgmGain.gain.value = 0.050;
    sfxGain.gain.value = 0.72;
    bgmGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function synthTone({freq=440, endFreq=null, duration=.1, type='sine', gain=.12, when=0, target=sfxGain}={}) {
  const ac = ensureAudio();
  if (!ac || !target || !audioEnabled) return;
  const t = ac.currentTime + when;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, freq), t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), t + .006);
  amp.gain.exponentialRampToValueAtTime(.0001, t + duration);
  osc.connect(amp); amp.connect(target);
  osc.start(t); osc.stop(t + duration + .02);
}

function noiseBurst(duration=.07, gain=.08) {
  const ac = ensureAudio();
  if (!ac || !sfxGain || !audioEnabled) return;
  const count = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, count, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<count;i++) data[i] = (Math.random()*2-1) * (1-i/count);
  const src = ac.createBufferSource();
  const amp = ac.createGain();
  amp.gain.value = gain;
  src.buffer = buffer; src.connect(amp); amp.connect(sfxGain); src.start();
}

function playHitFeedback() {
  const now = performance.now();
  if (now - lastHitFeedbackAt < 180) return;
  lastHitFeedbackAt = now;
  if (navigator.vibrate) navigator.vibrate(38);
  synthTone({freq:165, endFreq:88, duration:.095, type:'square', gain:.22});
  synthTone({freq:310, endFreq:170, duration:.055, type:'triangle', gain:.11, when:.008});
  noiseBurst(.060, .16);
}

function playDeathFeedback() {
  lastHitFeedbackAt = performance.now();
  if (navigator.vibrate) navigator.vibrate([130, 55, 220]);
  synthTone({freq:320, endFreq:62, duration:.58, type:'sawtooth', gain:.30});
  synthTone({freq:155, endFreq:42, duration:.68, type:'square', gain:.20, when:.035});
  synthTone({freq:72, endFreq:38, duration:.72, type:'sine', gain:.26, when:.02});
  noiseBurst(.22, .24);
}

const BGM_NOTES = [220,0,277.18,0,329.63,0,277.18,0,196,0,246.94,0,293.66,0,246.94,0];
const BGM_BASS  = [110,0,0,0,98,0,0,0,82.41,0,0,0,98,0,0,0];
function bgmTick() {
  if (!audioEnabled || !state || state.state !== 'playing') return;
  const n = BGM_NOTES[bgmStep % BGM_NOTES.length];
  const b = BGM_BASS[bgmStep % BGM_BASS.length];
  if (n) synthTone({freq:n, duration:.16, type:'triangle', gain:.055, target:bgmGain});
  if (b) synthTone({freq:b, duration:.30, type:'sine', gain:.075, target:bgmGain});
  bgmStep++;
}
function startBgm() {
  ensureAudio();
  if (bgmTimer || !audioEnabled) return;
  bgmStep = 0;
  bgmTick();
  bgmTimer = setInterval(bgmTick, 190);
}
function stopBgm() {
  if (bgmTimer) clearInterval(bgmTimer);
  bgmTimer = null;
}
function updateSoundButton() {
  const btn = $('soundButton');
  if (btn) { btn.textContent = audioEnabled ? '🔊' : '🔇'; btn.title = audioEnabled ? '소리 끄기' : '소리 켜기'; }
}
function toggleSound() {
  audioEnabled = !audioEnabled;
  localStorage.setItem('schoolLineAudio', audioEnabled ? 'on' : 'off');
  ensureAudio();
  if (masterGain) masterGain.gain.value = audioEnabled ? 1 : 0;
  if (audioEnabled && state && state.state === 'playing') startBgm(); else stopBgm();
  updateSoundButton();
}
function processCombatFeedback(previousState, nextState) {
  if (!myId || !previousState || !nextState) return;
  const before = previousState.players?.find(p => p.id === myId);
  const after = nextState.players?.find(p => p.id === myId);
  if (!before || !after) return;
  if (before.alive && !after.alive) {
    playDeathFeedback();
    return;
  }
  if (!after.alive || !before.alive) return;
  const hpLoss = before.hp - after.hp;
  const maxHpDrop = Math.max(0, before.maxHp - after.maxHp);
  // Ignore Dia form ending if the apparent HP loss is only the max-HP cap returning to normal.
  if (hpLoss > .2 && hpLoss > maxHpDrop + .2) playHitFeedback();
}

$('nameInput').value = localStorage.getItem('schoolLineName') || '';
$('roomInput').value = localStorage.getItem('schoolLineRoom') || '6-1';

function show(which) {
  joinScreen.classList.toggle('hidden', which !== 'join');
  lobbyScreen.classList.toggle('hidden', which !== 'lobby');
  gameScreen.classList.toggle('hidden', which !== 'game');
}

function wsUrl() { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`; }

$('joinButton').onclick = () => {
  ensureAudio();
  updateSoundButton();
  $('joinError').textContent = '';
  localStorage.setItem('schoolLineName', $('nameInput').value);
  localStorage.setItem('schoolLineRoom', $('roomInput').value);
  ws = new WebSocket(wsUrl());
  ws.onopen = () => ws.send(JSON.stringify({ type:'join', name:$('nameInput').value, room:$('roomInput').value, character:pickerState.join.selected }));
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
    const previousState = state;
    processCombatFeedback(previousState, msg);
    state = msg;
    if (state.state === 'playing') {
      startBgm();
      show('game');
      const me = state.players.find(p => p.id === myId);
      if (me && !rightStick.active) {
        lastAimDir = me.team === 'A' ? {x:0,y:1} : {x:0,y:-1};
      }
    } else {
      stopBgm();
      show('lobby'); renderLobby();
    }
  }
}

$('startButton').onclick = () => ws && ws.send(JSON.stringify({ type:'start' }));
$('fullscreenButton').onclick = enterGameDisplayMode;
$('gameFullscreenButton').onclick = enterGameDisplayMode;
$('soundButton').onclick = toggleSound;
$('abilityButton').onclick = useAbility;
updateSoundButton();

function useAbility() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !state || state.state !== 'playing') return;
  const me = state.players.find(p => p.id === myId);
  if (!me || !me.alive || me.character !== 'dia' || me.diaForm || me.diaCooldownMs > 0) return;
  ws.send(JSON.stringify({ type:'ability', ability:'form' }));
}

async function enterGameDisplayMode() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  } catch (_) {}
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) {}
}

function renderLobby() {
  if (!state) return;
  const me = state.players.find(p => p.id === myId);
  if (me) {
    if (pickerState.lobby.selected !== me.character) {
      pickerState.lobby.selected = me.character;
      pickerState.lobby.role = CHARACTER_META[me.character].role;
      renderPicker('lobby');
    }
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
window.addEventListener('keydown', e => {
  if (gameScreen.classList.contains('hidden')) return;
  setKey(e.code, true);
  if (e.code === 'Space' && !e.repeat) useAbility();
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
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

  for (const b of (state.beams || [])) {
    const a=worldToScreen(b.x1,b.y1), z=worldToScreen(b.x2,b.y2);
    const beamColor = b.character === 'ice' ? '#78e9ff' : (b.character === 'dia' ? '#8df6ff' : (b.character === 'light' ? '#ffe66d' : '#ff477e'));
    const glowColor = b.character === 'laser' ? 'rgba(255,70,120,.28)' : (b.character === 'light' ? 'rgba(255,230,109,.32)' : 'rgba(120,235,255,.30)');
    ctx.save();
    ctx.lineCap='round';
    ctx.strokeStyle=glowColor; ctx.lineWidth=8;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(z.x,z.y); ctx.stroke();
    ctx.strokeStyle=beamColor; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(z.x,z.y); ctx.stroke();
    ctx.restore();
  }

  for (const p of state.projectiles) {
    const s=worldToScreen(p.x,p.y), r=Math.max(2,p.radius*SCALE);
    ctx.beginPath(); ctx.arc(s.x,s.y,r,0,Math.PI*2);
    if (p.type === 'heal') ctx.fillStyle = p.character === 'wind' ? '#9ef7d5' : '#65d7ff';
    else if (p.character === 'fire') ctx.fillStyle = '#ff9a45';
    else if (p.character === 'sniper') ctx.fillStyle = '#e6d5ff';
    else if (p.character === 'mecha') ctx.fillStyle = '#b7ffd1';
    else ctx.fillStyle = p.team === 'A' ? '#8bbcff' : '#ff9c9c';
    ctx.fill();
  }

  for (const p of state.players) {
    if (!p.alive) continue;
    const radius = ({iron:.65,mecha:.65,shooter:.5,sniper:.4,cannon:.65,fire:.5,water:.4,wind:.4,light:.4,laser:.5,ice:.5,dia:.65})[p.character] * SCALE;
    const s=worldToScreen(p.x,p.y), x=s.x,y=s.y;
    ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2);
    ctx.fillStyle = ({iron:'#8893a3',mecha:'#7fd3a7',shooter:'#58a6ff',sniper:'#cba6ff',cannon:'#d9a441',fire:'#ff704d',water:'#4cc9f0',wind:'#73d6a6',light:'#f6d86b',laser:'#e04b88',ice:'#68d9f5',dia:(p.diaForm?'#d9fbff':'#79c8e8')})[p.character];
    ctx.fill();
    ctx.lineWidth = p.id === myId ? 4 : 2.2; ctx.strokeStyle = p.team === 'A' ? '#2f77ff' : '#ff4545'; ctx.stroke();
    if (p.burning) { ctx.lineWidth=2; ctx.strokeStyle='#ffb347'; ctx.beginPath(); ctx.arc(x,y,radius+4,0,Math.PI*2); ctx.stroke(); }
    if (p.tailwind) { ctx.lineWidth=2; ctx.strokeStyle='#b1ffe1'; ctx.beginPath(); ctx.arc(x,y,radius+7,0,Math.PI*2); ctx.stroke(); }
    if (p.frozen) { ctx.lineWidth=2.5; ctx.strokeStyle='#92efff'; ctx.beginPath(); ctx.arc(x,y,radius+5,0,Math.PI*2); ctx.stroke(); }
    if (p.diaForm) { ctx.lineWidth=3; ctx.strokeStyle='#e4fdff'; ctx.beginPath(); ctx.arc(x,y,radius+8,0,Math.PI*2); ctx.stroke(); }

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
    let extra = '';
    if (me.character === 'dia') {
      if (me.diaForm) extra = `<br>💎 다이아폼 ${(me.diaFormMs/1000).toFixed(1)}초`;
      else if (me.diaCooldownMs > 0) extra = `<br>변신 쿨 ${(me.diaCooldownMs/1000).toFixed(1)}초`;
      else extra = '<br>변신 준비 완료';
    }
    $('myInfo').innerHTML = `<b>${m.icon} ${m.name}</b><br>HP ${Math.max(0,Math.ceil(me.hp))}/${me.maxHp}<br>${me.team}팀${extra}`;
    $('respawn').textContent = me.alive ? '' : `부활 ${(me.respawnMs/1000).toFixed(1)}초`;

    const ability = $('abilityButton');
    ability.classList.toggle('hidden', me.character !== 'dia');
    if (me.character === 'dia') {
      if (!me.alive) { ability.textContent = '💎 부활 대기'; ability.disabled = true; ability.classList.remove('active'); }
      else if (me.diaForm) { ability.textContent = `💎 폼 ${(me.diaFormMs/1000).toFixed(1)}`; ability.disabled = true; ability.classList.add('active'); }
      else if (me.diaCooldownMs > 0) { ability.textContent = `💎 쿨 ${(me.diaCooldownMs/1000).toFixed(1)}`; ability.disabled = true; ability.classList.remove('active'); }
      else { ability.textContent = '💎 변신'; ability.disabled = false; ability.classList.remove('active'); }
    }
  }
}
renderGame();
