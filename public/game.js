'use strict';

const $ = id => document.getElementById(id);
const joinScreen = $('joinScreen'), lobbyScreen = $('lobbyScreen'), gameScreen = $('gameScreen');
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
const SCALE = 15; // world y -> screen x, world x -> screen y (mobile landscape rotation)

const CHARACTER_META = {
  iron: {
    role:'탱커', name:'아이언', icon:'⚙️', mini:'HP 600 · 느림',
    stats:[['체력','600 HP'],['공격 방식','투사체'],['사거리','24 m'],['DPS','65'],['공격 속도','5발/s'],['이동속도','느림 · 5.0 m/s'],['크기','큼']],
    summary:'가장 단단한 정통 탱커',
    mechanic:'높은 체력으로 전선을 버티는 캐릭터. 탄속은 느리지만 꾸준히 공격하면서 적 진입을 받아내기 좋다.'
  },
  mecha: {
    role:'탱커', name:'메카', icon:'🤖', mini:'HP 550 · 빠름',
    stats:[['체력','550 HP'],['공격 방식','투사체'],['사거리','16 m'],['DPS','45'],['공격 속도','5발/s'],['이동속도','빠름 · 7.0 m/s'],['크기','큼']],
    summary:'높은 체력과 빠른 속도로 전선을 밀어내는 탱커',
    mechanic:'사거리 16 m로 짧고 화력은 낮지만, HP 550과 빠른 이동속도로 먼저 공간을 차지하고 적의 공격을 받아내는 데 강하다.'
  },
  dia: {
    role:'탱커', name:'다이아', icon:'💎', mini:'HP 350 · 변신',
    stats:[['체력','350 HP'],['공격 방식','투사체'],['사거리','24 m'],['DPS','65'],['공격 속도','5발/s'],['이동속도','느림 · 5.0 m/s'],['크기','큼']],
    summary:'타이밍을 잡아 강해지는 변신 탱커',
    mechanic:'카드에는 기본형 수치를 표시한다. Space 또는 능력 버튼을 누르면 6초간 HP 400, 이동속도 보통 6.0 m/s, 사거리 16 m, 80 DPS 광선폼이 된다. 변신 쿨은 16초이며 폼 중 직접 처치하면 6초 감소한다.'
  },
  solar: {
    role:'탱커', name:'솔라', icon:'☀️', mini:'광선 · 태양탄 자힐',
    stats:[['체력','375 HP'],['공격 방식','광선 + 투사체'],['사거리','16 m / 24 m'],['DPS','80 (55 + 25)'],['공격 속도','태양탄 1발/s'],['이동속도','느림 · 5.0 m/s'],['크기','큼']],
    summary:'광선과 태양탄을 함께 다루는 자가회복 탱커',
    mechanic:'공격하는 동안 사거리 16 m의 55 DPS 광선을 유지하고, 동시에 1초마다 같은 조준 방향으로 사거리 24 m의 태양탄(25 피해)을 발사한다. 태양탄이 적 본체에 실제 피해를 주면 HP를 25 회복하며, 이 자가회복은 포이즌의 외부 치유 감소 영향을 받지 않는다.'
  },
  runner: {
    role:'딜러', name:'러너', icon:'🏃', mini:'55 DPS · 질주',
    stats:[['체력','175 HP'],['공격 방식','투사체'],['사거리','16 m'],['DPS','55'],['공격 속도','5발/s'],['이동속도','빠름 · 7.0 m/s'],['크기','작음']],
    summary:'짧은 사거리와 질주를 활용하는 초고기동 딜러',
    mechanic:'빠른 작은 투사체를 초당 5발 발사하며 한 발당 11 피해를 준다. Space 또는 능력 버튼을 누르면 4초 동안 이동속도가 한 단계 올라 매우 빠름 8.0 m/s가 된다. 질주 재사용 대기시간은 10초이며, 윈드의 순풍과 함께 적용되면 초고속 9.2 m/s까지 올라갈 수 있다.'
  },
  shooter: {
    role:'딜러', name:'슈터', icon:'🎯', mini:'100 DPS · 안정적',
    stats:[['체력','250 HP'],['공격 방식','투사체'],['사거리','24 m'],['DPS','100'],['공격 속도','5발/s'],['이동속도','보통 · 6.0 m/s'],['크기','중간']],
    summary:'가장 표준적인 원거리 딜러',
    mechanic:'빠르고 작은 탄을 초당 5발 발사한다. 특별한 조건 없이 꾸준한 화력을 내기 쉬워 입문용으로 좋다.'
  },
  sniper: {
    role:'딜러', name:'스나이퍼', icon:'🔭', mini:'장거리 · 거리비례 피해',
    stats:[['체력','150 HP'],['공격 방식','투사체'],['사거리','36 m'],['DPS','80 / 110'],['공격 속도','1발/s'],['이동속도','느림 · 5.0 m/s'],['크기','작음']],
    summary:'멀수록 한 발이 강해지는 초장거리 딜러',
    mechanic:'매우 빠른 작은 투사체를 초당 1발 발사한다. 실제 비행거리 기준 0~16 m에서는 80 피해, 16 m 초과~36 m에서는 110 피해를 준다.'
  },
  cannon: {
    role:'딜러', name:'캐논', icon:'💥', mini:'130 DPS · 느림',
    stats:[['체력','275 HP'],['공격 방식','투사체'],['사거리','24 m'],['DPS','130'],['공격 속도','10발/s'],['이동속도','매우 느림 · 4.0 m/s'],['크기','큼']],
    summary:'기동성을 버리고 화력을 얻은 중화기 딜러',
    mechanic:'초당 10발을 퍼붓는 최고 수준의 지속 화력을 가진다. 대신 이동속도가 매우 느려 위치를 잘못 잡으면 도망치기 어렵다.'
  },
  fire: {
    role:'딜러', name:'파이어', icon:'🔥', mini:'80 DPS · 화상',
    stats:[['체력','200 HP'],['공격 방식','투사체'],['사거리','24 m'],['DPS','80'],['공격 속도','5발/s'],['이동속도','빠름 · 7.0 m/s'],['크기','중간']],
    summary:'빠르게 움직이며 지속 피해를 남기는 딜러',
    mechanic:'적중한 적에게 2초 동안 10 DPS의 화상을 남긴다. 체력은 낮지만 빠른 이동속도로 위치를 바꾸며 싸우기 좋다.'
  },
  poison: {
    role:'딜러', name:'포이즌', icon:'☠️', mini:'85 DPS · 치유 감소',
    stats:[['체력','250 HP'],['공격 방식','광선'],['사거리','16 m'],['DPS','85'],['공격 속도','없음 (지속형)'],['이동속도','보통 · 6.0 m/s'],['크기','중간']],
    summary:'외부 치유를 약화시키는 안티힐 광선 딜러',
    mechanic:'광선이 적에게 닿으면 그 적이 다른 캐릭터에게 받는 치유량이 50% 감소한다. 중독은 마지막 적중 후 1.5초 유지되며 다시 맞으면 갱신된다. 비전투 회복에는 영향을 주지 않는다.'
  },
  laser: {
    role:'딜러', name:'레이저', icon:'🔴', mini:'광선 · 탱커 압박',
    stats:[['체력','275 HP'],['공격 방식','광선'],['사거리','16 m'],['DPS','80 + 최대 HP 10%/s'],['공격 속도','없음 (지속형)'],['이동속도','보통 · 6.0 m/s'],['크기','중간']],
    summary:'체력이 높은 적일수록 더 아픈 광선 딜러',
    mechanic:'조준한 방향으로 즉시 광선을 연결한다. 기본 80 DPS에 대상 최대 HP의 10%/s만큼 피해가 추가되어 탱커를 상대할 때 특히 강하다.'
  },
  ice: {
    role:'딜러', name:'아이스', icon:'🧊', mini:'80 DPS · 감속',
    stats:[['체력','275 HP'],['공격 방식','광선'],['사거리','16 m'],['DPS','80'],['공격 속도','없음 (지속형)'],['이동속도','보통 · 6.0 m/s'],['크기','중간']],
    summary:'적의 움직임을 묶는 제어형 광선 딜러',
    mechanic:'광선이 적에게 닿으면 이동속도를 1단계 낮춘다. 감속은 마지막 적중 후 1.5초 유지되며 윈드의 순풍과 만나면 서로 상쇄된다.'
  },
  water: {
    role:'힐러', name:'워터', icon:'💧', mini:'70 HPS · 안정 치유',
    stats:[['체력','250 HP'],['공격 방식','치유 투사체'],['사거리','24 m'],['HPS','70'],['치유 속도','5발/s'],['이동속도','보통 · 6.0 m/s'],['크기','작음']],
    summary:'가장 단순하고 안정적인 기본 힐러',
    mechanic:'오른쪽 스틱으로 아군을 조준해 큰 치유탄을 발사한다. 치유탄은 적을 통과하고 처음 맞은 아군을 회복시킨다.'
  },
  wind: {
    role:'힐러', name:'윈드', icon:'🌪️', mini:'55 HPS · 순풍',
    stats:[['체력','225 HP'],['공격 방식','치유 투사체'],['사거리','24 m'],['HPS','55'],['치유 속도','5발/s'],['이동속도','빠름 · 7.0 m/s'],['크기','작음']],
    summary:'치유와 기동력 지원을 함께 주는 힐러',
    mechanic:'치유탄에 맞은 아군은 2초 동안 이동속도가 1단계 빨라진다. 빠른 본체 속도까지 활용해 전선을 따라다니기 좋다.'
  },
  star: {
    role:'힐러', name:'스타', icon:'⭐', mini:'70 HPS · 초장거리',
    stats:[['체력','175 HP'],['공격 방식','치유 투사체'],['사거리','30 m'],['HPS','70'],['치유 속도','2발/s'],['이동속도','느림 · 5.0 m/s'],['크기','중간']],
    summary:'아주 먼 거리에서 높은 치유량을 공급하는 후방 힐러',
    mechanic:'초당 2발의 매우 빠른 작은 치유탄을 발사하며, 한 발당 아군 HP를 35 회복한다. 치유탄은 적을 통과하고 처음 맞은 아군을 회복시키며 자신은 치유할 수 없다. 공격 능력은 없다.'
  },
  light: {
    role:'힐러', name:'라이트', icon:'✨', mini:'광선 · 힐+딜',
    stats:[['체력','225 HP'],['공격 방식','광선 (치유 + 공격)'],['사거리','16 m'],['DPS / HPS','60 / 50'],['공격·치유 속도','없음 (지속형)'],['이동속도','보통 · 6.0 m/s'],['크기','작음']],
    summary:'한 줄에서 치유와 공격을 동시에 만드는 광선 힐러',
    mechanic:'광선이 처음 만난 아군 1명을 치유한 뒤 그 아군을 관통한다. 이후 처음 만나는 적에게 60 DPS를 주고 그 적에서 광선이 끝난다. 적을 먼저 만나면 적에게만 피해를 준다.'
  }
};

const CHARACTER_STORIES = {
  iron: {
    title:'아이언', icon:'⚙️',
    text:'엄청난 맷집을 자랑하는 보디빌더. 강한 상대와 힘을 겨루는 것을 좋아해서 언제나 가장 앞에 서지만, 정작 공격을 맞을 때마다 속으로는 “아프잖아!”라고 생각한다.'
  },
  mecha: {
    title:'메카', icon:'🤖',
    text:'오랫동안 창고에 방치되어 있던 기계에 어느 날 갑자기 영혼이 깃들었다. 깨어나자마자 세상을 구경하고 싶어졌고, 튼튼한 몸과 빠른 다리를 이용해 여기저기 돌아다니며 싸움에도 끼어들고 있다. 자신이 왜 깨어났는지는 메카 자신도 모른다.'
  },
  dia: {
    title:'다이아', icon:'💎',
    text:'광선 자매들의 엄마. 반짝이는 것을 너무 좋아한 나머지 특별한 기술을 이용해 잠시 동안 자기 몸을 다이아몬드처럼 변화시키는 능력을 얻었다. 문제는 이제 평범한 모습보다 다이아몬드 모습의 자신을 훨씬 더 마음에 들어 한다는 것이다.'
  },
  solar: {
    title:'솔라', icon:'☀️',
    text:'광선 자매들의 아버지. 광선 자매들을 강하게 키우기 위해 혹독한 훈련을 시켰고, 자신 역시 수련을 게을리하지 않았다. 그 결과 광선과 투사체 공격을 동시에 다룰 줄 아는 엄청난 존재가 되었다.'
  },
  runner: {
    title:'러너', icon:'🏃',
    text:'하루 종일 달리기만 연습해 온 프로 마라토너. 이제는 싸움까지 잘하고 싶다며 싸움판에 뛰어들었다. 달리기 실력은 여전하지만 아직 싸움에는 익숙하지 않아 조금 약하다. 광선 자매 중 둘째인 아이스에게는 늘 기가 죽는다고 한다.'
  },
  cannon: {
    title:'캐논', icon:'💥',
    text:'싸우기 위해 만들어진 인공지능 대포. 엄청난 공격 능력을 가진 대신 움직이는 것이 매우 느리다. 본인은 이것을 단점이라고 생각하지 않는다. 상대가 먼저 사라지면 따라갈 필요도 없다고 생각하기 때문이다.'
  },
  shooter: {
    title:'슈터', icon:'🎯',
    text:'무슨 일이든 총으로 해결하려는 단순한 성격. 정확하고 꾸준한 공격이 장점이며, 특별한 기술이 없다는 말을 들을 때마다 “잘 쏘는 게 특별한 기술이야!”라고 반박한다. 워터와는 오래된 친구지만 서로 싸우는 방식이 너무 달라 자주 티격태격한다.'
  },
  water: {
    title:'워터', icon:'💧',
    text:'예전에는 슈터와 함께 이것저것 경쟁했지만, 어느 순간부터 상대를 맞히는 것보다 아군을 맞혀 회복시키는 것이 더 재미있다는 사실을 깨달았다. 지금도 슈터와 만나면 누가 팀에 더 도움이 되는지를 가지고 자주 말다툼한다.'
  },
  fire: {
    title:'파이어', icon:'🔥',
    text:'워터의 형. 뜨거운 성격답게 뭐든 먼저 달려들고 보는 편이다. 자신이 슈터를 좋아하기 때문에, 워터가 슈터와 사귈까봐 항상 걱정한다.'
  },
  sniper: {
    title:'스나이퍼', icon:'🔭',
    text:'멀리서 쏘는 것만큼은 자신이 최고라고 생각하며 실제로도 꽤 잘한다. 항상 혼자 멀찍이 떨어져 있는 이유는 좋은 사격 위치를 찾기 위해서라고 주장하지만, 사실 사람들 사이에 끼어 대화하는 것이 조금 부담스러울 뿐이다.'
  },
  laser: {
    title:'레이저 — 첫째', icon:'🔴',
    text:'광선 자매의 첫째. 여섯 자매 중 힘이 가장 세고 목소리도 가장 크다. 엄청난 괴력을 갖고 있기 때문에, 여동생들은 부모님보다 레이저에게 혼나는 것을 더 무서워한다.'
  },
  ice: {
    title:'아이스 — 둘째', icon:'🧊',
    text:'광선 자매의 둘째. 차가운 분위기를 좋아하고 언젠가는 모든 것을 꽁꽁 얼려버리는 것이 목표다. 하지만 아직 실력이 부족해서 상대의 이동속도를 조금 느리게 만드는 것밖에 못 한다. 본인은 이 사실을 부끄러워 한다.'
  },
  poison: {
    title:'포이즌 — 셋째', icon:'☠️',
    text:'광선 자매의 셋째. 언니들처럼 눈에 띄는 재능이 없다는 말을 듣자 독기를 품고 혼자 열심히 연습했다. 그 결과 상대를 직접 쓰러뜨리는 것보다 상대가 치료받는 것을 방해하는 심술궂은 능력을 터득했다.'
  },
  light: {
    title:'라이트 — 넷째', icon:'✨',
    text:'광선 자매의 넷째. 언니들과 달리 싸우는 것보다 남을 도와주는 데 관심이 많다. 결국 광선을 이용해 공격과 치유를 동시에 하는 자기만의 기술을 만들었고, 자매들 중 가장 먼저 독립해서 살기 시작했다. 언니들은 아직도 라이트가 집을 나간 것을 싫어한다.'
  },
  wind: {
    title:'윈드', icon:'🌪️',
    text:'스스로를 바람의 요정이라고 소개하며 다른 사람에게 더 빨리 움직이라고 힘을 준다. 하지만 아무리 조사해도 그가 요정이라는 증거는 발견되지 않았다. 주변에서는 그냥 남들에게 빨리 움직이라고 재촉하는 평범한 잔소리쟁이라고 생각한다.'
  },
  star: {
    title:'스타', icon:'⭐',
    text:'오랫동안 별을 바라보다가 어느 순간부터 자신이 별이라고 착각하고 있다. 멀리서 싸우는 사람들을 지켜보며 치유탄을 쏴 주는데, 가끔은 그 사람들이 자신을 바라보며 감사해 주기를 은근히 기대한다.'
  }
};

const ROLE_ORDER = ['탱커','딜러','힐러'];
const ROLE_LABEL = { '탱커':'🛡️ 탱커', '딜러':'⚔️ 딜러', '힐러':'💚 힐러' };
const savedCharacter = localStorage.getItem('schoolLineCharacter');
const initialRole = CHARACTER_META[savedCharacter]?.role || '딜러';
const pickerState = {
  lobby: { selected: null, role: initialRole }
};
let selectedJoinTeam = null;
let lastLobbyPickerAvailabilityKey = null;

function isTeamCharacterTaken(id) {
  if (!state || !myId) return false;
  const me = state.players.find(p => p.id === myId);
  if (!me) return false;
  return state.players.some(p => p.id !== myId && p.team === me.team && p.character === id);
}

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
      renderPicker(kind);
    };
    tabs.appendChild(btn);
  }

  const roleEntries = Object.entries(CHARACTER_META).filter(([,m]) => m.role === ps.role);
  for (const [id, m] of roleEntries) {
    const taken = kind === 'lobby' && isTeamCharacterTaken(id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.disabled = taken;
    btn.className = 'character-choice' + (ps.selected === id ? ' selected' : '') + (taken ? ' unavailable' : '');
    btn.innerHTML = `<span class="char-name">${m.icon} ${m.name}</span><span class="char-mini">${taken ? '🔒 사용 중' : m.mini}</span>`;
    btn.onclick = () => {
      if (taken) return;
      ps.selected = id;
      localStorage.setItem('schoolLineCharacter', id);
      renderPicker(kind);
      if (kind === 'lobby') selectLobbyCharacter(id);
    };
    choices.appendChild(btn);
  }

  const visibleIds = roleEntries.map(([id]) => id);
  let detailId = visibleIds.includes(ps.selected) ? ps.selected : null;
  if (!detailId) detailId = visibleIds.find(id => kind !== 'lobby' || !isTeamCharacterTaken(id)) || visibleIds[0];
  const m = CHARACTER_META[detailId];
  const taken = kind === 'lobby' && isTeamCharacterTaken(detailId);
  const statHtml = (m.stats || []).map(([label, value]) => `<div class="character-stat-item"><span>${label}</span><b>${value}</b></div>`).join('');
  detail.innerHTML = `<div class="character-detail-head"><div class="character-detail-name">${m.icon} ${m.name}</div><span class="role-badge">${m.role}</span></div><div class="character-stat-grid">${statHtml}</div><div class="character-traits"><div class="character-traits-title">특성</div><div class="character-summary">${m.summary}</div><div class="character-mechanic">${m.mechanic}</div></div>${taken ? '<div class="character-taken-note">🔒 같은 팀원이 사용 중</div>' : ''}`;
}

function selectLobbyCharacter(id) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type:'select', character:id }));
}

let ws = null, myId = null, config = null, state = null;
let spectatorMode = false;
let selectedTargetId = null; // Alpha 1.1 targeted-ability selection; current roster has no targeted ability yet.

// Alpha 1.1.1: render-only snapshot interpolation. Server state remains authoritative.
const playerMotionTracks = new Map();
let lastPlayingSnapshotAt = 0;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function samplePlayerMotionTrack(track, now=performance.now()) {
  if (!track) return null;
  const duration = Math.max(1, track.duration || 1);
  const t = clamp01((now - track.start) / duration);
  return {
    x: track.fromX + (track.toX - track.fromX) * t,
    y: track.fromY + (track.toY - track.fromY) * t
  };
}

function updatePlayerMotionTracks(previousState, nextState) {
  const now = performance.now();
  if (!nextState || nextState.state !== 'playing') {
    playerMotionTracks.clear();
    lastPlayingSnapshotAt = 0;
    return;
  }

  const continuing = previousState && previousState.state === 'playing';
  const rawInterval = continuing && lastPlayingSnapshotAt ? now - lastPlayingSnapshotAt : 50;
  const snapshotInterval = Math.max(35, Math.min(85, rawInterval));
  lastPlayingSnapshotAt = now;
  const beforeById = new Map(((previousState && previousState.players) || []).map(p => [p.id, p]));
  const liveIds = new Set();

  for (const p of (nextState.players || [])) {
    liveIds.add(p.id);
    const before = beforeById.get(p.id);
    const oldTrack = playerMotionTracks.get(p.id);
    const movedFar = before ? Math.hypot(p.x - before.x, p.y - before.y) > 6 : true;
    const shouldSnap = !continuing || !before || !before.alive || !p.alive || movedFar;
    if (shouldSnap) {
      playerMotionTracks.set(p.id, {fromX:p.x, fromY:p.y, toX:p.x, toY:p.y, start:now, duration:1});
      continue;
    }

    const sampled = samplePlayerMotionTrack(oldTrack, now) || {x:before.x, y:before.y};
    // Local movement catches up faster to reduce perceived input latency; remote players favor smoothness.
    const duration = p.id === myId
      ? Math.max(24, Math.min(36, snapshotInterval * 0.60))
      : Math.max(35, Math.min(55, snapshotInterval * 0.90));
    playerMotionTracks.set(p.id, {
      fromX: sampled.x, fromY: sampled.y, toX: p.x, toY: p.y, start: now, duration
    });
  }

  for (const id of playerMotionTracks.keys()) if (!liveIds.has(id)) playerMotionTracks.delete(id);
}

function renderedPlayerWorldPosition(player, now=performance.now()) {
  return samplePlayerMotionTrack(playerMotionTracks.get(player.id), now) || {x:player.x, y:player.y};
}

function characterRadiusWorld(characterId) {
  const value = config && config.characters && config.characters[characterId] && config.characters[characterId].radius;
  return Number.isFinite(value) ? value : 0.80;
}

renderPicker('lobby');

let keys = { up:false, down:false, left:false, right:false };
let mouseWorld = { x: 21, y: 34 };
let firing = false;
let lastAimDir = { x: 0, y: 1 }; // world direction, A->B by default


// Alpha 0.6: lightweight Web Audio + haptics. No external audio assets are required.
const AUDIO_VOLUME_MULTIPLIER = 9;
const HIT_VOLUME_MULTIPLIER = 0.3; // incoming-damage cue only; keep important cues audible
const BGM_VOLUME_MULTIPLIER = 1.5;
let audioCtx = null;
let masterGain = null;
let audioCompressor = null;
let bgmGain = null;
let sfxGain = null;
let bgmTimer = null;
let bgmStep = 0;
let lastHitFeedbackAt = 0;
let lastProjectileHitAt = 0;
let lastHealConfirmAt = 0;
let beamHum = null;
let matchAlertTimer = null;
const shownTimeWarnings = new Set();
const worldFx = [];
const playerHitFlashUntil = new Map();
let audioEnabled = localStorage.getItem('schoolLineAudio') !== 'off';

function ensureAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
    masterGain = audioCtx.createGain();
    audioCompressor = audioCtx.createDynamicsCompressor();
    bgmGain = audioCtx.createGain();
    sfxGain = audioCtx.createGain();
    masterGain.gain.value = audioEnabled ? AUDIO_VOLUME_MULTIPLIER : 0;
    // Catch overlapping event peaks without flattening ordinary cues.
    audioCompressor.threshold.value = -10;
    audioCompressor.knee.value = 12;
    audioCompressor.ratio.value = 6;
    audioCompressor.attack.value = 0.003;
    audioCompressor.release.value = 0.16;
    bgmGain.gain.value = 0.050 * BGM_VOLUME_MULTIPLIER;
    sfxGain.gain.value = 0.72;
    bgmGain.connect(masterGain);
    sfxGain.connect(masterGain);
    masterGain.connect(audioCompressor);
    audioCompressor.connect(audioCtx.destination);
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

function noiseBurst(duration=.07, gain=.08, target=sfxGain) {
  const ac = ensureAudio();
  if (!ac || !target || !audioEnabled) return;
  const count = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, count, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<count;i++) data[i] = (Math.random()*2-1) * (1-i/count);
  const src = ac.createBufferSource();
  const amp = ac.createGain();
  amp.gain.value = gain;
  src.buffer = buffer; src.connect(amp); amp.connect(target); src.start();
}

function playHitFeedback() {
  const now = performance.now();
  if (now - lastHitFeedbackAt < 220) return;
  lastHitFeedbackAt = now;
  if (navigator.vibrate) navigator.vibrate(24);
  synthTone({freq:145, endFreq:105, duration:.055, type:'triangle', gain:.045 * HIT_VOLUME_MULTIPLIER});
  noiseBurst(.028, .025 * HIT_VOLUME_MULTIPLIER);
}

function playProjectileHitConfirm() {
  const now = performance.now();
  if (now - lastProjectileHitAt < 85) return;
  lastProjectileHitAt = now;
  synthTone({freq:920, endFreq:760, duration:.032, type:'square', gain:.025});
  synthTone({freq:1380, endFreq:1120, duration:.020, type:'triangle', gain:.013, when:.004});
}

function playHealConfirm() {
  const now = performance.now();
  if (now - lastHealConfirmAt < 145) return;
  lastHealConfirmAt = now;
  synthTone({freq:660, endFreq:760, duration:.075, type:'sine', gain:.022});
  synthTone({freq:990, endFreq:1180, duration:.090, type:'sine', gain:.015, when:.025});
}

function playSniperShotCue() {
  // Local-only high-speed 'shing' cue; no generic projectile firing sounds.
  synthTone({freq:1750, endFreq:720, duration:.080, type:'sawtooth', gain:.018});
  synthTone({freq:2400, endFreq:1100, duration:.055, type:'triangle', gain:.011, when:.006});
  noiseBurst(.030, .010);
}

function playDiaTransformCue(local=false) {
  const scale = local ? 1 : .52;
  synthTone({freq:240, endFreq:620, duration:.22, type:'sawtooth', gain:.030 * scale});
  synthTone({freq:520, endFreq:1320, duration:.28, type:'triangle', gain:.024 * scale, when:.025});
  synthTone({freq:980, endFreq:1760, duration:.20, type:'sine', gain:.018 * scale, when:.075});
  synthTone({freq:1540, endFreq:2200, duration:.12, type:'sine', gain:.012 * scale, when:.16});
  noiseBurst(.075, .012 * scale);
}

function playFireIgniteCue() {
  // One-shot ignition cue. Repeated burn refreshes intentionally do not retrigger it.
  noiseBurst(.105, .020);
  synthTone({freq:210, endFreq:360, duration:.11, type:'sawtooth', gain:.012});
  synthTone({freq:520, endFreq:340, duration:.08, type:'triangle', gain:.008, when:.025});
}

function playTimeWarningCue(seconds) {
  if (seconds <= 10) {
    synthTone({freq:820, endFreq:980, duration:.070, type:'triangle', gain:.018});
    synthTone({freq:980, endFreq:1180, duration:.070, type:'triangle', gain:.018, when:.11});
    synthTone({freq:1180, endFreq:1320, duration:.080, type:'triangle', gain:.020, when:.22});
  } else if (seconds <= 30) {
    synthTone({freq:720, endFreq:860, duration:.085, type:'triangle', gain:.016});
    synthTone({freq:860, endFreq:980, duration:.085, type:'triangle', gain:.015, when:.12});
  } else {
    synthTone({freq:620, endFreq:760, duration:.095, type:'sine', gain:.014});
  }
}

function showMatchAlert(seconds) {
  const el=$('matchAlert');
  if (!el) return;
  el.textContent = seconds === 60 ? '⏱️ 1분 남았습니다!' : `⏱️ ${seconds}초 남았습니다!`;
  el.classList.remove('hidden','urgent');
  if (seconds <= 10) el.classList.add('urgent');
  void el.offsetWidth;
  el.classList.add('show');
  if (matchAlertTimer) clearTimeout(matchAlertTimer);
  matchAlertTimer=setTimeout(() => { el.classList.remove('show','urgent'); el.classList.add('hidden'); }, seconds <= 10 ? 1800 : 1450);
  playTimeWarningCue(seconds);
}

function processMatchTimeWarnings(previousState, nextState) {
  if (!nextState || nextState.state !== 'playing') {
    if (previousState && previousState.state === 'playing') shownTimeWarnings.clear();
    return;
  }
  if (!previousState || previousState.state !== 'playing' || (nextState.timeLeft||0) > (previousState.timeLeft||0) + 5) {
    shownTimeWarnings.clear();
    return;
  }
  const prev=Number(previousState.timeLeft)||0, next=Number(nextState.timeLeft)||0;
  for (const threshold of [60,30,10]) {
    if (!shownTimeWarnings.has(threshold) && prev > threshold && next <= threshold) {
      shownTimeWarnings.add(threshold);
      showMatchAlert(threshold);
    }
  }
}

function playAbilityUseFeedback() {
  synthTone({freq:380, endFreq:620, duration:.095, type:'triangle', gain:.026});
  synthTone({freq:760, endFreq:920, duration:.075, type:'sine', gain:.014, when:.025});
}

function playRemoteDeathCue() {
  synthTone({freq:210, endFreq:95, duration:.18, type:'triangle', gain:.018});
  noiseBurst(.055, .018);
}

function playRespawnCue(local=false) {
  synthTone({freq:430, endFreq:690, duration:.14, type:'sine', gain:local ? .030 : .016});
  synthTone({freq:690, endFreq:980, duration:.12, type:'triangle', gain:local ? .018 : .010, when:.045});
}

function startBeamHum() {
  const ac = ensureAudio();
  if (!ac || !audioEnabled || beamHum) return;
  const gain = ac.createGain();
  const osc1 = ac.createOscillator();
  const osc2 = ac.createOscillator();
  osc1.type='sawtooth'; osc2.type='triangle';
  osc1.frequency.value=155; osc2.frequency.value=310;
  const t=ac.currentTime;
  gain.gain.setValueAtTime(.0001,t);
  gain.gain.exponentialRampToValueAtTime(.0045,t+.035);
  osc1.connect(gain); osc2.connect(gain); gain.connect(sfxGain);
  osc1.start(t); osc2.start(t);
  beamHum={gain,osc1,osc2};
}

function stopBeamHum() {
  if (!beamHum || !audioCtx) { beamHum=null; return; }
  const h=beamHum; beamHum=null;
  const t=audioCtx.currentTime;
  try {
    h.gain.gain.cancelScheduledValues(t);
    h.gain.gain.setValueAtTime(Math.max(.0001,h.gain.gain.value),t);
    h.gain.gain.exponentialRampToValueAtTime(.0001,t+.055);
    h.osc1.stop(t+.07); h.osc2.stop(t+.07);
  } catch (_) {}
}

function updateBeamHum(nextState) {
  if (!audioEnabled || spectatorMode || !myId || !nextState || nextState.state !== 'playing') { stopBeamHum(); return; }
  const active=(nextState.beams || []).some(b => b.ownerId===myId && b.didDamage);
  if (active) startBeamHum(); else stopBeamHum();
}

function pulseAbilityButton() {
  const btn=$('abilityButton');
  if (!btn) return;
  btn.classList.remove('fx-pulse');
  void btn.offsetWidth;
  btn.classList.add('fx-pulse');
  setTimeout(() => btn.classList.remove('fx-pulse'), 260);
}

function addWorldFx(type, player, extra={}) {
  if (!player) return;
  const now=performance.now();
  const durations={muzzle:90,heal:220,death:380,respawn:420,ability:240,diaTransform:520};
  worldFx.push({type,x:player.x,y:player.y,character:player.character,team:player.team,start:now,end:now+(durations[type]||180),...extra});
  if (worldFx.length>80) worldFx.splice(0,worldFx.length-80);
}

function addMuzzleFx(player) {
  if (!player || !config || !player.character) return;
  const def=config.characters && config.characters[player.character];
  const r=(def && def.radius) || .8;
  let dx=player.aimX-player.x, dy=player.aimY-player.y;
  const len=Math.hypot(dx,dy)||1; dx/=len; dy/=len;
  addWorldFx('muzzle', player, {x:player.x+dx*(r+.22), y:player.y+dy*(r+.22), dx,dy});
}

function playDeathFeedback() {
  lastHitFeedbackAt = performance.now();
  if (navigator.vibrate) navigator.vibrate([130, 55, 220]);
  synthTone({freq:320, endFreq:62, duration:.58, type:'sawtooth', gain:.30});
  synthTone({freq:155, endFreq:42, duration:.68, type:'square', gain:.20, when:.035});
  synthTone({freq:72, endFreq:38, duration:.72, type:'sine', gain:.26, when:.02});
  noiseBurst(.22, .24);
}

// Upbeat arcade loop: 16-step pattern at ~100 BPM, with a light kick/hat pulse.
const BGM_NOTES = [440,0,523.25,659.25,587.33,0,523.25,493.88,392,0,493.88,587.33,523.25,0,493.88,440];
const BGM_BASS  = [110,0,110,0,130.81,0,130.81,0,98,0,98,0,110,0,110,0];
function bgmTick() {
  if (!audioEnabled || !state || state.state !== 'playing') return;
  const step = bgmStep % BGM_NOTES.length;
  const n = BGM_NOTES[step];
  const b = BGM_BASS[step];
  if (n) synthTone({freq:n, duration:.12, type:'triangle', gain:.055, target:bgmGain});
  if (b) synthTone({freq:b, duration:.22, type:'sine', gain:.070, target:bgmGain});
  if (step % 4 === 0) synthTone({freq:105, endFreq:48, duration:.085, type:'sine', gain:.115, target:bgmGain});
  if (step % 2 === 1) noiseBurst(.025, .020, bgmGain);
  if (step === 4 || step === 12) noiseBurst(.045, .032, bgmGain);
  bgmStep++;
}
function startBgm() {
  ensureAudio();
  if (bgmTimer || !audioEnabled) return;
  bgmStep = 0;
  bgmTick();
  bgmTimer = setInterval(bgmTick, 150);
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
  if (masterGain) masterGain.gain.value = audioEnabled ? AUDIO_VOLUME_MULTIPLIER : 0;
  if (audioEnabled && state && state.state === 'playing') startBgm(); else stopBgm();
  if (!audioEnabled) stopBeamHum(); else if (state) updateBeamHum(state);
  updateSoundButton();
}
function processCombatFeedback(previousState, nextState) {
  processMatchTimeWarnings(previousState, nextState);
  if (!previousState || !nextState) return;
  const beforeById = new Map((previousState.players || []).map(p => [p.id,p]));
  const afterById = new Map((nextState.players || []).map(p => [p.id,p]));

  for (const after of (nextState.players || [])) {
    const before=beforeById.get(after.id);
    if (!before) continue;

    if (before.alive && !after.alive) {
      addWorldFx('death', after);
      if (after.id===myId) playDeathFeedback(); else playRemoteDeathCue();
    } else if (!before.alive && after.alive) {
      addWorldFx('respawn', after);
      playRespawnCue(after.id===myId);
    }

    if (before.alive && after.alive) {
      const hpLoss=(before.hp||0)-(after.hp||0);
      const shieldLoss=(before.shield||0)-(after.shield||0);
      const maxHpDrop=Math.max(0,(before.maxHp||0)-(after.maxHp||0));
      if ((hpLoss >= 1.2 && hpLoss > maxHpDrop + .2) || shieldLoss >= 1.2) {
        playerHitFlashUntil.set(after.id, performance.now()+95);
        if (after.id===myId) playHitFeedback();
      }
    }

    if (!before.burning && after.burning && (after.id===myId || after.burnSourceId===myId)) {
      playFireIgniteCue();
    }

    if ((after.shotSeq||0) > (before.shotSeq||0)) {
      addMuzzleFx(after);
      if (after.id===myId && after.character==='sniper') playSniperShotCue();
    }

    if ((after.projectileHitSeq||0) > (before.projectileHitSeq||0) && after.id===myId) {
      playProjectileHitConfirm();
    }

    if ((after.healHitSeq||0) > (before.healHitSeq||0)) {
      const target=afterById.get(after.lastHealTargetId);
      if (target) addWorldFx('heal', target);
      if (after.id===myId) playHealConfirm();
    }

    if ((after.abilityUseSeq||0) > (before.abilityUseSeq||0)) {
      const diaTransform = after.character==='dia' && !before.diaForm && after.diaForm;
      addWorldFx(diaTransform ? 'diaTransform' : 'ability', after);
      if (diaTransform) {
        playDiaTransformCue(after.id===myId);
        if (after.id===myId) pulseAbilityButton();
      } else if (after.id===myId) {
        playAbilityUseFeedback(); pulseAbilityButton();
      }
    }
  }
}

$('nameInput').value = localStorage.getItem('schoolLineName') || '';
$('roomInput').value = localStorage.getItem('schoolLineRoom') || '6-1';

function selectJoinTeam(team) {
  selectedJoinTeam = team;
  $('joinTeamA').classList.toggle('selected', team === 'A');
  $('joinTeamB').classList.toggle('selected', team === 'B');
}
$('joinTeamA').onclick = () => selectJoinTeam('A');
$('joinTeamB').onclick = () => selectJoinTeam('B');

function show(which) {
  joinScreen.classList.toggle('hidden', which !== 'join');
  lobbyScreen.classList.toggle('hidden', which !== 'lobby');
  gameScreen.classList.toggle('hidden', which !== 'game');
}

function wsUrl() { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`; }

function openConnection(onOpen) {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  ws = new WebSocket(wsUrl());
  ws.onopen = onOpen;
  ws.onmessage = ev => handleMessage(JSON.parse(ev.data));
  ws.onerror = () => $('joinError').textContent = '서버에 연결하지 못했습니다.';
  ws.onclose = () => {
    if (myId || spectatorMode) { alert('서버 연결이 끊겼습니다.'); location.reload(); }
  };
}

$('joinButton').onclick = () => {
  ensureAudio();
  updateSoundButton();
  $('joinError').textContent = '';
  if (!selectedJoinTeam) {
    $('joinError').textContent = 'A팀 또는 B팀을 먼저 선택하세요.';
    return;
  }
  localStorage.setItem('schoolLineName', $('nameInput').value);
  localStorage.setItem('schoolLineRoom', $('roomInput').value);
  openConnection(() => ws.send(JSON.stringify({ type:'join', name:$('nameInput').value, room:$('roomInput').value, team:selectedJoinTeam })));
};

$('spectatorJoinButton').onclick = () => {
  ensureAudio();
  updateSoundButton();
  $('joinError').textContent = '';
  const pin = String($('spectatorPinInput').value || '').replace(/\D/g, '').slice(0, 4);
  if (pin.length !== 4) {
    $('joinError').textContent = '관전자 PIN 4자리를 입력하세요.';
    return;
  }
  localStorage.setItem('schoolLineRoom', $('roomInput').value);
  openConnection(() => ws.send(JSON.stringify({ type:'spectator_join', room:$('roomInput').value, pin })));
};

function handleMessage(msg) {
  if (msg.type === 'error') { $('joinError').textContent = msg.message; if (ws) ws.close(); return; }
  if (msg.type === 'joined') {
    myId = msg.id; config = msg.config; $('roomLabel').textContent = msg.room;
    pickerState.lobby.selected = null;
    lastLobbyPickerAvailabilityKey = null;
    const notice = $('pickNotice');
    if (notice) notice.textContent = `${msg.team}팀으로 입장했습니다. 캐릭터를 선택하세요.`;
    show('lobby'); return;
  }
  if (msg.type === 'spectator_joined') {
    spectatorMode = true;
    myId = null;
    config = msg.config;
    document.body.classList.add('spectator-mode');
    $('roomLabel').textContent = msg.room;
    const panel = $('characterPanel');
    if (panel) panel.classList.add('hidden');
    const badge = $('spectatorBadge');
    if (badge) badge.classList.remove('hidden');
    show('lobby');
    return;
  }
  if (msg.type === 'pick_error') {
    const notice = $('pickNotice');
    if (notice) notice.textContent = `⚠️ ${msg.message}`;
    if (state && myId) {
      const me = state.players.find(p => p.id === myId);
      pickerState.lobby.selected = me?.character || null;
      lastLobbyPickerAvailabilityKey = null;
      renderLobby();
    }
    return;
  }
  if (msg.type === 'start_error') {
    const notice = $('pickNotice');
    if (notice) notice.textContent = `⚠️ ${msg.message}`;
    return;
  }
  if (msg.type === 'state') {
    const previousState = state;
    processCombatFeedback(previousState, msg);
    updatePlayerMotionTracks(previousState, msg);
    state = msg;
    updateBeamHum(state);
    if (state.state === 'playing') {
      closeMyCharacterStory();
      startBgm();
      show('game');
      const me = spectatorMode ? null : state.players.find(p => p.id === myId);
      if (me && !rightStick.active) {
        lastAimDir = me.team === 'A' ? {x:0,y:1} : {x:0,y:-1};
      }
    } else {
      stopBgm();
      show('lobby'); renderLobby();
    }
  }
}

function setHelpGuideTab(tabName) {
  const tabs = document.querySelectorAll('[data-help-tab]');
  const panels = document.querySelectorAll('[data-help-panel]');
  tabs.forEach(tab => {
    const active = tab.dataset.helpTab === tabName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  panels.forEach(panel => panel.classList.toggle('hidden', panel.dataset.helpPanel !== tabName));
}

function openHelpGuide() {
  const overlay = $('helpGuideOverlay');
  if (!overlay) return;
  setHelpGuideTab('basics');
  overlay.classList.remove('hidden');
  const firstTab = document.querySelector('[data-help-tab="basics"]');
  if (firstTab) firstTab.focus();
}

function closeHelpGuide() {
  const overlay = $('helpGuideOverlay');
  if (overlay) overlay.classList.add('hidden');
}

document.querySelectorAll('[data-help-tab]').forEach(tab => {
  tab.addEventListener('click', () => setHelpGuideTab(tab.dataset.helpTab));
});
$('joinHelpButton').onclick = openHelpGuide;
$('lobbyHelpButton').onclick = openHelpGuide;
$('helpGuideCloseTop').onclick = closeHelpGuide;
$('helpGuideCloseButton').onclick = closeHelpGuide;
window.addEventListener('keydown', e => {
  if (e.code === 'Escape' && !$('helpGuideOverlay').classList.contains('hidden')) {
    e.preventDefault();
    closeHelpGuide();
  }
});

$('startButton').onclick = () => ws && ws.send(JSON.stringify({ type:'start' }));
$('fullscreenButton').onclick = enterGameDisplayMode;
$('gameFullscreenButton').onclick = enterGameDisplayMode;
$('soundButton').onclick = toggleSound;
$('abilityButton').onclick = useAbility;
$('storyButton').onclick = openMyCharacterStory;
$('storyCloseButton').onclick = closeMyCharacterStory;
$('storyOverlay').onclick = e => { if (e.target === $('storyOverlay')) closeMyCharacterStory(); };
updateSoundButton();

function useAbility() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !state || state.state !== 'playing') return;
  const me = state.players.find(p => p.id === myId);
  if (!me || !me.alive) return;
  const def = config && config.characters ? config.characters[me.character] : null;
  const abilityId = def && def.abilityId;
  if (!abilityId) return;
  if (me.character === 'dia' && (me.diaForm || me.diaCooldownMs > 0)) return;
  if (me.character === 'runner' && (me.sprint || me.sprintCooldownMs > 0)) return;
  const payload = { type:'ability', ability:abilityId };
  if (selectedTargetId) payload.targetId = selectedTargetId;
  ws.send(JSON.stringify(payload));
}

async function enterGameDisplayMode() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  } catch (_) {}
  try {
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) {}
}

function formatContributionNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString('ko-KR');
}

function contributionSpecialLine(character, stats) {
  if (character === 'wind') return `순풍 적용 ${formatContributionNumber(stats.tailwindApplications)}회`;
  if (character === 'poison') return `감소된 치유량 ${formatContributionNumber(stats.healingPrevented)}`;
  if (character === 'dia') return `다이아폼 킬 ${formatContributionNumber(stats.diaFormKills)}회`;
  return '';
}

function renderResultStats() {
  const root = $('resultStats');
  if (!root || !state || state.state !== 'ended') {
    if (root) root.classList.add('hidden');
    return;
  }
  root.classList.remove('hidden');
  root.innerHTML = '';

  for (const team of ['A', 'B']) {
    const section = document.createElement('section');
    section.className = `result-team result-team-${team.toLowerCase()}`;
    const title = document.createElement('h3');
    title.textContent = `${team === 'A' ? '🔵' : '🔴'} ${team}팀 기여도`;
    section.appendChild(title);

    const list = document.createElement('div');
    list.className = 'result-player-list';
    for (const p of state.players.filter(player => player.team === team)) {
      const stats = p.stats || {};
      const playedCharacter = stats.character || p.character;
      const meta = CHARACTER_META[playedCharacter] || { icon:'●', name:'미선택' };
      const row = document.createElement('div');
      row.className = 'result-player-row' + (p.id === myId ? ' you' : '');
      const special = contributionSpecialLine(playedCharacter, stats);
      row.innerHTML = `
        <div class="result-player-name">${meta.icon} ${escapeHtml(p.name)} <span>${meta.name}</span></div>
        <div class="result-player-core">킬 <b>${formatContributionNumber(stats.kills)}</b> · 데스 <b>${formatContributionNumber(stats.deaths)}</b> · 딜 <b>${formatContributionNumber(stats.damage)}</b> · 힐 <b>${formatContributionNumber(stats.healing)}</b></div>
        ${special ? `<div class="result-player-special">${special}</div>` : ''}`;
      list.appendChild(row);
    }
    section.appendChild(list);
    root.appendChild(section);
  }
}

function getMyPlayedCharacter() {
  if (spectatorMode || !state || state.state !== 'ended' || !myId) return null;
  const me = state.players.find(p => p.id === myId);
  return me?.stats?.character || me?.character || null;
}

function updateStoryButton() {
  const button = $('storyButton');
  if (!button) return;
  const character = getMyPlayedCharacter();
  button.classList.toggle('hidden', !character || !CHARACTER_STORIES[character]);
}

function openMyCharacterStory() {
  const character = getMyPlayedCharacter();
  const story = character ? CHARACTER_STORIES[character] : null;
  if (!story) return;
  $('storyTitle').textContent = `${story.icon} ${story.title}`;
  $('storyText').textContent = story.text;
  $('storyOverlay').classList.remove('hidden');
}

function closeMyCharacterStory() {
  const overlay = $('storyOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function renderLobby() {
  if (!state) return;
  const me = state.players.find(p => p.id === myId);
  if (me) {
    if (me.character && pickerState.lobby.selected !== me.character) {
      pickerState.lobby.selected = me.character;
      pickerState.lobby.role = CHARACTER_META[me.character].role;
      localStorage.setItem('schoolLineCharacter', me.character);
    }
    // Snapshots arrive at 20 Hz. Rebuilding the picker on every snapshot replaces
    // the pressed DOM button before pointerup/click can fire on mobile. Only
    // rebuild when same-team pick availability actually changes.
    const availabilityKey = state.players
      .filter(p => p.team === me.team)
      .map(p => `${p.id}:${p.character || '-'}`)
      .sort()
      .join('|');
    if (availabilityKey !== lastLobbyPickerAvailabilityKey) {
      lastLobbyPickerAvailabilityKey = availabilityKey;
      renderPicker('lobby');
    }
  }
  const isHost = !spectatorMode && state.hostId === myId;
  $('startButton').classList.toggle('hidden', !isHost);
  $('hostLabel').textContent = spectatorMode ? '📺 관전자 모드 · 경기 시작 대기 중' : (isHost ? '내가 방장입니다.' : '방장이 경기를 시작합니다.');
  $('resultBanner').classList.toggle('hidden', state.state !== 'ended');
  if (state.state === 'ended') {
    const finalScore = `${Math.floor(state.scoreA)} : ${Math.floor(state.scoreB)}`;
    $('resultBanner').textContent = state.winner === 'DRAW' ? `무승부! ${finalScore}` : `${state.winner}팀 승리! ${finalScore}`;
  }
  renderResultStats();
  updateStoryButton();
  for (const team of ['A','B']) {
    const root = $(team === 'A' ? 'teamAList' : 'teamBList'); root.innerHTML = '';
    for (const p of state.players.filter(p => p.team === team)) {
      const div = document.createElement('div'); div.className = 'player-row' + (p.id === myId ? ' you' : '');
      const isOwnTeam = !spectatorMode && me && p.team === me.team;
      let pickText;
      if (spectatorMode || !isOwnTeam) pickText = '🔒 픽 비공개';
      else if (!p.character) pickText = '⌛ 미선택';
      else pickText = `${CHARACTER_META[p.character].icon} ${CHARACTER_META[p.character].name}`;
      div.innerHTML = `<span>${p.id === state.hostId ? '👑 ' : ''}${escapeHtml(p.name)}</span><span>${pickText}</span>`;
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

const TARGET_RELATION = Object.freeze({ SELF:'SELF', ALLY:'ALLY', ENEMY:'ENEMY' });
function localTargetRelation(source, target) {
  if (!source || !target) return null;
  if (source.id === target.id) return TARGET_RELATION.SELF;
  return source.team === target.team ? TARGET_RELATION.ALLY : TARGET_RELATION.ENEMY;
}
function currentTargetingRule() {
  if (!state || !config || !myId) return null;
  const me = state.players.find(p => p.id === myId);
  return me && config.characters && config.characters[me.character] ? config.characters[me.character].abilityTargeting : null;
}
function selectableTargetAt(clientX, clientY) {
  const rule = currentTargetingRule();
  if (!rule || !Array.isArray(rule.relations) || !state) return null;
  const me = state.players.find(p => p.id === myId);
  if (!me || !me.alive) return null;
  const world = clientToWorld(clientX, clientY);
  let best = null, bestD = Infinity;
  for (const target of state.players) {
    if (!target.alive) continue;
    const relation = localTargetRelation(me, target);
    if (!rule.relations.includes(relation)) continue;
    const radius = (config.characters[target.character]?.radius || 0.5) + 0.8;
    const d = Math.hypot(target.x - world.x, target.y - world.y);
    if (d <= radius && d < bestD) { best = target; bestD = d; }
  }
  return best;
}
function selectTargetFromPointer(clientX, clientY) {
  const target = selectableTargetAt(clientX, clientY);
  if (!target) return false;
  selectedTargetId = target.id;
  return true;
}
function targetSelectionState(me, target) {
  const rule = currentTargetingRule();
  if (!rule || !me || !target) return null;
  const relation = localTargetRelation(me, target);
  if (!rule.relations.includes(relation)) return { valid:false, inRange:false };
  const inRange = !Number.isFinite(rule.range) || Math.hypot(target.x - me.x, target.y - me.y) <= rule.range + 1e-9;
  return { valid:true, inRange };
}

window.addEventListener('keydown', e => {
  if (spectatorMode || gameScreen.classList.contains('hidden')) return;
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
canvas.parentElement.addEventListener('pointerdown', e => {
  if (spectatorMode || gameScreen.classList.contains('hidden')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target && e.target.closest && e.target.closest('button')) return;
  // Capture before the virtual-stick zones: directly touching a valid character selects it.
  // A normal stick touch still reaches the joystick whenever no selectable character is under the finger.
  if (selectTargetFromPointer(e.clientX, e.clientY)) {
    e.preventDefault();
    e.stopPropagation();
    firing = false;
  }
}, true);
canvas.addEventListener('mousedown', e => {
  if (spectatorMode || e.button !== 0) return;
  if (selectableTargetAt(e.clientX, e.clientY)) return;
  firing = true;
});
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
  if (spectatorMode) return;
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

function beamFxPalette(character) {
  if (character === 'solar') return { core:'#fff3ae', mid:'#ffd45c', glow:'rgba(255,196,64,.22)', impact:'rgba(255,221,120,.72)' };
  if (character === 'ice') return { core:'#e8fcff', mid:'#78e9ff', glow:'rgba(120,235,255,.20)', impact:'rgba(160,244,255,.72)' };
  if (character === 'dia') return { core:'#f2ffff', mid:'#8df6ff', glow:'rgba(120,235,255,.20)', impact:'rgba(185,252,255,.76)' };
  if (character === 'light') return { core:'#fffde5', mid:'#ffe66d', glow:'rgba(255,230,109,.22)', impact:'rgba(255,244,168,.76)' };
  if (character === 'poison') return { core:'#f4e8ff', mid:'#b878ff', glow:'rgba(184,120,255,.22)', impact:'rgba(210,165,255,.74)' };
  return { core:'#ffe8f0', mid:'#ff477e', glow:'rgba(255,70,120,.22)', impact:'rgba(255,130,160,.76)' };
}

function drawBeamFx(beam, nowMs) {
  const a=worldToScreen(beam.x1,beam.y1), z=worldToScreen(beam.x2,beam.y2);
  const p=beamFxPalette(beam.character);
  const phase=(nowMs * 0.008 + (String(beam.ownerId || '').charCodeAt(0) || 0)) % (Math.PI*2);
  const pulse=(Math.sin(phase)+1)*0.5;
  const outerWidth=8.5 + pulse*1.5;
  const midWidth=4.4 + pulse*0.5;
  ctx.save();
  ctx.lineCap='round';
  ctx.globalAlpha=.82;
  ctx.strokeStyle=p.glow; ctx.lineWidth=outerWidth;
  ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(z.x,z.y); ctx.stroke();
  ctx.globalAlpha=.92;
  ctx.strokeStyle=p.mid; ctx.lineWidth=midWidth;
  ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(z.x,z.y); ctx.stroke();
  ctx.globalAlpha=.98;
  ctx.strokeStyle=p.core; ctx.lineWidth=1.6 + pulse*.25;
  ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(z.x,z.y); ctx.stroke();
  if (beam.impact) {
    const r=3.2 + pulse*1.4;
    ctx.globalAlpha=.46 + pulse*.22;
    ctx.fillStyle=p.impact;
    ctx.beginPath(); ctx.arc(z.x,z.y,r,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=.88;
    ctx.fillStyle=p.core;
    ctx.beginPath(); ctx.arc(z.x,z.y,1.5 + pulse*.35,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function fxCharacterColor(character) {
  return ({iron:'#aab3bf',mecha:'#9af0bd',solar:'#ffd45c',runner:'#ffd27a',shooter:'#8bbcff',sniper:'#eadcff',cannon:'#ffd66b',fire:'#ff9a45',poison:'#c58cff',water:'#65d7ff',wind:'#9ef7d5',star:'#fff3a8',light:'#fff0a6',laser:'#ff699a',ice:'#92efff',dia:'#d9fbff'})[character] || '#ffffff';
}

function drawWorldFx(nowMs) {
  for (let i=worldFx.length-1;i>=0;i--) {
    const fx=worldFx[i];
    if (nowMs>=fx.end) { worldFx.splice(i,1); continue; }
    const q=Math.max(0,Math.min(1,(nowMs-fx.start)/(fx.end-fx.start)));
    const a=worldToScreen(fx.x,fx.y);
    const c=fxCharacterColor(fx.character);
    ctx.save();
    if (fx.type==='muzzle') {
      ctx.globalAlpha=(1-q)*.85;
      ctx.fillStyle=c;
      ctx.beginPath(); ctx.arc(a.x,a.y,2.5+(1-q)*3.5,0,Math.PI*2); ctx.fill();
      if (fx.dx!=null) {
        const ex=worldToScreen(fx.x+fx.dx*.7,fx.y+fx.dy*.7);
        ctx.strokeStyle=c; ctx.lineWidth=2.2*(1-q)+.6;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(ex.x,ex.y); ctx.stroke();
      }
    } else if (fx.type==='heal') {
      ctx.globalAlpha=(1-q)*.72;
      ctx.strokeStyle='#b8ffe2'; ctx.lineWidth=2.8*(1-q)+.8;
      ctx.beginPath(); ctx.arc(a.x,a.y,6+q*18,0,Math.PI*2); ctx.stroke();
    } else if (fx.type==='death') {
      ctx.globalAlpha=(1-q)*.72;
      ctx.strokeStyle=c; ctx.lineWidth=3*(1-q)+.7;
      ctx.beginPath(); ctx.arc(a.x,a.y,5+q*24,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=(1-q)*.20; ctx.fillStyle=c;
      ctx.beginPath(); ctx.arc(a.x,a.y,14*(1-q),0,Math.PI*2); ctx.fill();
    } else if (fx.type==='respawn') {
      const alpha=Math.sin(Math.PI*Math.min(1,q));
      ctx.globalAlpha=alpha*.72; ctx.strokeStyle='#fff1a8'; ctx.lineWidth=2.6;
      ctx.beginPath(); ctx.arc(a.x,a.y,5+q*27,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=alpha*.18; ctx.fillStyle='#fff8cf';
      ctx.beginPath(); ctx.arc(a.x,a.y,13+q*8,0,Math.PI*2); ctx.fill();
    } else if (fx.type==='ability') {
      ctx.globalAlpha=(1-q)*.55; ctx.strokeStyle='#a8efff'; ctx.lineWidth=2.6*(1-q)+.8;
      ctx.beginPath(); ctx.arc(a.x,a.y,5+q*21,0,Math.PI*2); ctx.stroke();
    } else if (fx.type==='diaTransform') {
      const pulse=Math.sin(Math.PI*Math.min(1,q));
      ctx.globalAlpha=pulse*.82; ctx.strokeStyle='#ecffff'; ctx.lineWidth=3.4*(1-q)+1.0;
      ctx.beginPath(); ctx.arc(a.x,a.y,7+q*31,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=pulse*.28; ctx.fillStyle='#bdf8ff';
      ctx.beginPath(); ctx.arc(a.x,a.y,18+q*7,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=pulse*.9; ctx.fillStyle='#ffffff';
      for (let k=0;k<6;k++) {
        const ang=k*Math.PI/3 + q*1.8; const rr=13+q*23;
        ctx.beginPath(); ctx.arc(a.x+Math.cos(ang)*rr,a.y+Math.sin(ang)*rr,1.3+(1-q)*1.8,0,Math.PI*2); ctx.fill();
      }
    }
    ctx.restore();
  }
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

  const beamFxNow = performance.now();
  for (const b of (state.beams || [])) drawBeamFx(b, beamFxNow);

  for (const p of state.projectiles) {
    const s=worldToScreen(p.x,p.y), r=Math.max(2,p.radius*SCALE);
    ctx.beginPath(); ctx.arc(s.x,s.y,r,0,Math.PI*2);
    if (p.type === 'heal') ctx.fillStyle = p.character === 'wind' ? '#9ef7d5' : (p.character === 'star' ? '#fff3a8' : '#65d7ff');
    else if (p.character === 'fire') ctx.fillStyle = '#ff9a45';
    else if (p.character === 'sniper') ctx.fillStyle = '#e6d5ff';
    else if (p.character === 'mecha') ctx.fillStyle = '#b7ffd1';
    else if (p.character === 'runner') ctx.fillStyle = '#ffd27a';
    else if (p.character === 'solar') ctx.fillStyle = '#ffd45c';
    else ctx.fillStyle = p.team === 'A' ? '#8bbcff' : '#ff9c9c';
    ctx.fill();
  }

  drawWorldFx(beamFxNow);

  for (const p of state.players) {
    if (!p.alive) continue;
    const radius = characterRadiusWorld(p.character) * SCALE;
    const renderWorld = renderedPlayerWorldPosition(p, beamFxNow);
    const s=worldToScreen(renderWorld.x,renderWorld.y), x=s.x,y=s.y;
    ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2);
    ctx.fillStyle = ({iron:'#8893a3',mecha:'#7fd3a7',solar:'#e6a93d',runner:'#f0a64b',shooter:'#58a6ff',sniper:'#cba6ff',cannon:'#d9a441',fire:'#ff704d',poison:'#9b6bd6',water:'#4cc9f0',wind:'#73d6a6',star:'#e8d66b',light:'#f6d86b',laser:'#e04b88',ice:'#68d9f5',dia:(p.diaForm?'#d9fbff':'#79c8e8')})[p.character];
    ctx.fill();
    if ((playerHitFlashUntil.get(p.id)||0) > beamFxNow) {
      ctx.save(); ctx.globalAlpha=.48; ctx.fillStyle='#ffffff';
      ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    ctx.lineWidth = p.id === myId ? 4 : 2.2; ctx.strokeStyle = p.team === 'A' ? '#2f77ff' : '#ff4545'; ctx.stroke();
    if (p.shield > 0) {
      const spulse=.72 + .18*Math.sin(beamFxNow*.010 + x*.01);
      ctx.save(); ctx.globalAlpha=spulse; ctx.lineWidth=2.4; ctx.strokeStyle='#67d8ff';
      ctx.beginPath(); ctx.arc(x,y,radius+6,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=.10; ctx.fillStyle='#67d8ff'; ctx.beginPath(); ctx.arc(x,y,radius+4,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    if (p.id === selectedTargetId) {
      const meForTarget = state.players.find(q => q.id === myId);
      const targetState = targetSelectionState(meForTarget, p);
      if (targetState && targetState.valid) {
        ctx.save();
        ctx.lineWidth=3.5; ctx.strokeStyle=targetState.inRange ? '#67e8f9' : '#9aa6b2';
        ctx.setLineDash(targetState.inRange ? [] : [5,4]);
        ctx.beginPath(); ctx.arc(x,y,radius+12,0,Math.PI*2); ctx.stroke();
        ctx.restore();
      }
    }
    if (p.burning) { ctx.save(); ctx.globalAlpha=.68+.24*Math.sin(beamFxNow*.018+x*.02); ctx.lineWidth=2.2; ctx.strokeStyle='#ffb347'; ctx.beginPath(); ctx.arc(x,y,radius+4,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    if (p.poisoned) { ctx.save(); ctx.globalAlpha=.72+.18*Math.sin(beamFxNow*.012+y*.02); ctx.lineWidth=2.5; ctx.strokeStyle='#c58cff'; ctx.beginPath(); ctx.arc(x,y,radius+5,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    if (p.tailwind) { ctx.lineWidth=2; ctx.strokeStyle='#b1ffe1'; ctx.beginPath(); ctx.arc(x,y,radius+7,0,Math.PI*2); ctx.stroke(); }
    if (p.frozen) { ctx.save(); ctx.globalAlpha=.72+.18*Math.sin(beamFxNow*.011+x*.015); ctx.lineWidth=2.5; ctx.strokeStyle='#92efff'; ctx.beginPath(); ctx.arc(x,y,radius+5,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    if (p.stunned) { ctx.lineWidth=3; ctx.strokeStyle='#ffe36e'; ctx.beginPath(); ctx.arc(x,y,radius+9,0,Math.PI*2); ctx.stroke(); }
    if (p.diaForm) {
      const dp=.68+.24*Math.sin(beamFxNow*.010 + x*.013);
      ctx.save();
      ctx.globalAlpha=.20*dp; ctx.fillStyle='#bdf8ff'; ctx.beginPath(); ctx.arc(x,y,radius+11,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=.78+.18*Math.sin(beamFxNow*.014); ctx.lineWidth=3.2; ctx.strokeStyle='#e9ffff'; ctx.beginPath(); ctx.arc(x,y,radius+8,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle='#ffffff';
      for (let k=0;k<4;k++) { const ang=beamFxNow*.0018+k*Math.PI/2; const rr=radius+13+2*Math.sin(beamFxNow*.006+k); ctx.globalAlpha=.52+.38*Math.sin(beamFxNow*.012+k); ctx.beginPath(); ctx.arc(x+Math.cos(ang)*rr,y+Math.sin(ang)*rr,1.4,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
    }
    if (p.invulnerable) {
      ctx.save();
      ctx.lineWidth=3.5; ctx.strokeStyle='#fff4a8'; ctx.globalAlpha=.95;
      ctx.beginPath(); ctx.arc(x,y,radius+11,0,Math.PI*2); ctx.stroke();
      ctx.lineWidth=7; ctx.strokeStyle='rgba(255,244,168,.18)';
      ctx.beginPath(); ctx.arc(x,y,radius+11,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    const target=worldToScreen(p.aimX,p.aimY), adx=target.x-x, ady=target.y-y, al=Math.hypot(adx,ady)||1;
    ctx.strokeStyle='rgba(255,255,255,.65)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+(adx/al)*(radius+9),y+(ady/al)*(radius+9)); ctx.stroke();

    // Keep the simple colored circle, but make character identity readable at a glance.
    const meta = CHARACTER_META[p.character];
    if (meta) {
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      const emojiSize=Math.max(12,Math.min(17,radius*1.65));
      ctx.font=`${emojiSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.shadowColor='rgba(0,0,0,.65)'; ctx.shadowBlur=2;
      ctx.fillText(meta.icon,x,y+0.5);
      ctx.shadowBlur=0;
      ctx.font='700 10px system-ui';
      ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.88)';
      ctx.strokeText(meta.name,x,y+radius+12);
      ctx.fillStyle='#ffffff';
      ctx.fillText(meta.name,x,y+radius+12);
      ctx.restore();
    }

    const bw=42,bh=5,bx=x-bw/2,by=y-radius-15;
    ctx.fillStyle='#241e24'; ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle='#7ee18b'; ctx.fillRect(bx,by,bw*Math.max(0,p.hp/p.maxHp),bh);
    if (p.shield > 0 && p.maxShield > 0) {
      ctx.fillStyle='#1a2734'; ctx.fillRect(bx,by-5,bw,3);
      ctx.fillStyle='#65c7ff'; ctx.fillRect(bx,by-5,bw*Math.max(0,Math.min(1,p.shield/p.maxShield)),3);
    }
    drawText(p.name,x,by-7,11,'center','#f6f8fb');
  }

  const me = spectatorMode ? null : state.players.find(p => p.id === myId);
  if (!currentTargetingRule() || !state.players.some(p => p.id === selectedTargetId && p.alive)) selectedTargetId = null;
  const t = Math.ceil(state.timeLeft); $('timer').textContent = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  if (spectatorMode) {
    $('myInfo').innerHTML = '';
    $('respawn').textContent = '';
    $('abilityButton').classList.add('hidden');
  }
  $('scoreA').textContent = Math.floor(state.scoreA); $('scoreB').textContent = Math.floor(state.scoreB);
  if (me) {
    const m=CHARACTER_META[me.character];
    let extra = '';
    if (me.character === 'dia') {
      if (me.diaForm) extra = `<br>💎 다이아폼 ${(me.diaFormMs/1000).toFixed(1)}초`;
      else if (me.diaCooldownMs > 0) extra = `<br>변신 쿨 ${(me.diaCooldownMs/1000).toFixed(1)}초`;
      else extra = '<br>변신 준비 완료';
    } else if (me.character === 'runner') {
      if (me.sprint) extra = `<br>🏃 질주 ${(me.sprintMs/1000).toFixed(1)}초`;
      else if (me.sprintCooldownMs > 0) extra = `<br>질주 쿨 ${(me.sprintCooldownMs/1000).toFixed(1)}초`;
      else extra = '<br>질주 준비 완료';
    }
    const shieldLine = me.shield > 0 ? `<br>🛡️ 보호막 ${Math.ceil(me.shield)}/${Math.ceil(me.maxShield || me.shield)}` : '';
    const stunLine = me.stunned ? '<br>💫 기절' : '';
    $('myInfo').innerHTML = `<b>${m.icon} ${m.name}</b><br>HP ${Math.max(0,Math.ceil(me.hp))}/${me.maxHp}${shieldLine}<br>${me.team}팀${stunLine}${extra}`;
    $('respawn').textContent = me.alive ? '' : `부활 ${(me.respawnMs/1000).toFixed(1)}초`;

    const ability = $('abilityButton');
    const hasAbility = me.character === 'dia' || me.character === 'runner';
    ability.classList.toggle('hidden', !hasAbility);
    if (me.character === 'dia') {
      if (!me.alive) { ability.textContent = '💎 부활 대기'; ability.disabled = true; ability.classList.remove('active'); }
      else if (me.diaForm) { ability.textContent = `💎 폼 ${(me.diaFormMs/1000).toFixed(1)}`; ability.disabled = true; ability.classList.add('active'); }
      else if (me.diaCooldownMs > 0) { ability.textContent = `💎 쿨 ${(me.diaCooldownMs/1000).toFixed(1)}`; ability.disabled = true; ability.classList.remove('active'); }
      else { ability.textContent = '💎 변신'; ability.disabled = false; ability.classList.remove('active'); }
    } else if (me.character === 'runner') {
      if (!me.alive) { ability.textContent = '🏃 부활 대기'; ability.disabled = true; ability.classList.remove('active'); }
      else if (me.sprint) { ability.textContent = `🏃 질주 ${(me.sprintMs/1000).toFixed(1)}`; ability.disabled = true; ability.classList.add('active'); }
      else if (me.sprintCooldownMs > 0) { ability.textContent = `🏃 쿨 ${(me.sprintCooldownMs/1000).toFixed(1)}`; ability.disabled = true; ability.classList.remove('active'); }
      else { ability.textContent = '🏃 질주'; ability.disabled = false; ability.classList.remove('active'); }
    }
  }
}
renderGame();
