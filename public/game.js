'use strict';

const $ = id => document.getElementById(id);
const joinScreen = $('joinScreen'), lobbyScreen = $('lobbyScreen'), draftScreen = $('draftScreen'), gameScreen = $('gameScreen');
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
const SCALE = 15; // world y -> screen x, world x -> screen y (mobile landscape rotation)

const CHARACTER_META = {
  iron:    { role:'탱커', name:'아이언', icon:'⚙️', summary:'가장 단단한 정통 탱커' },
  mecha:   { role:'탱커', name:'메카', icon:'🤖', summary:'높은 체력과 빠른 속도로 전선을 밀어내는 탱커' },
  jet:     { role:'탱커', name:'제트', icon:'🚀', summary:'부스터로 전선을 가로지르고 보호막으로 착지하는 돌진 탱커' },
  dia:     { role:'탱커', name:'다이아', icon:'💎', summary:'타이밍을 잡아 강해지는 변신 탱커' },
  solar:   { role:'탱커', name:'솔라', icon:'☀️', summary:'광선과 태양탄을 함께 다루는 자가회복 탱커' },
  shield:  { role:'탱커', name:'쉴드', icon:'🛡️', summary:'멀리 있는 아군에게 순간 보호막을 씌우는 보호형 탱커' },
  runner:  { role:'딜러', name:'러너', icon:'🏃', summary:'짧은 사거리와 질주를 활용하는 초고기동 딜러' },
  shooter: { role:'딜러', name:'슈터', icon:'🎯', summary:'가장 표준적인 원거리 딜러' },
  sniper:  { role:'딜러', name:'스나이퍼', icon:'🔭', summary:'멀수록 한 발이 강해지는 초장거리 딜러' },
  cannon:  { role:'딜러', name:'캐논', icon:'💥', summary:'기동성을 버리고 화력을 얻은 중화기 딜러' },
  fire:    { role:'딜러', name:'파이어', icon:'🔥', summary:'빠르게 움직이며 지속 피해를 남기는 딜러' },
  poison:  { role:'딜러', name:'포이즌', icon:'☠️', summary:'외부 치유를 약화시키는 안티힐 광선 딜러' },
  reactor: { role:'딜러', name:'리액터', icon:'☢️', summary:'공격을 이어갈수록 출력 에너지가 상승하는 성장형 딜러' },
  spray:   { role:'딜러', name:'스프레이', icon:'🔫', summary:'세 갈래 고정 화망을 뿌리는 포킹 딜러' },
  laser:   { role:'딜러', name:'레이저', icon:'🔴', summary:'체력이 높은 적일수록 더 아픈 광선 딜러' },
  ice:     { role:'딜러', name:'아이스', icon:'🧊', summary:'적의 움직임을 묶는 제어형 광선 딜러' },
  water:   { role:'힐러', name:'워터', icon:'💧', summary:'가장 단순하고 안정적인 기본 힐러' },
  wind:    { role:'힐러', name:'윈드', icon:'🌪️', summary:'치유와 기동력 지원을 함께 주는 힐러' },
  star:    { role:'힐러', name:'스타', icon:'⭐', summary:'아주 먼 거리에서 높은 치유량을 공급하는 후방 힐러' },
  angel:   { role:'힐러', name:'엔젤', icon:'😇', summary:'축복으로 어디서든 아군을 즉시 구조하는 힐러' },
  buffer:  { role:'힐러', name:'버퍼', icon:'🎛️', summary:'한 명을 계속 연결해 치유와 행동속도를 함께 증폭하는 힐러' },
  light:   { role:'힐러', name:'라이트', icon:'✨', summary:'한 줄에서 치유와 공격을 동시에 만드는 광선 힐러' }
};

const VISUAL_ASSET_VERSION = '1.7.1-final';
const artPath = path => `${path}?v=${VISUAL_ASSET_VERSION}`;

const CHARACTER_ART = Object.freeze({
  iron:    { portrait:artPath('/assets/characters/iron/portrait.webp'),    token:artPath('/assets/characters/iron/token.webp'),    renderScale:1.00 },
  mecha:   { portrait:artPath('/assets/characters/mecha/portrait.webp'),   token:artPath('/assets/characters/mecha/token.webp'),   renderScale:1.00 },
  jet:     { portrait:artPath('/assets/characters/jet/portrait.webp'),     token:artPath('/assets/characters/jet/token.webp'),     renderScale:1.00 },
  dia:     { portrait:artPath('/assets/characters/dia/portrait.webp'),     token:artPath('/assets/characters/dia/token.webp'),     renderScale:1.00 },
  solar:   { portrait:artPath('/assets/characters/solar/portrait.webp'),   token:artPath('/assets/characters/solar/token.webp'),   renderScale:1.00 },
  shield:  { portrait:artPath('/assets/characters/shield/portrait.webp'),  token:artPath('/assets/characters/shield/token.webp'),  renderScale:1.00 },
  runner:  { portrait:artPath('/assets/characters/runner/portrait.webp'),  token:artPath('/assets/characters/runner/token.webp'),  renderScale:1.00 },
  shooter: { portrait:artPath('/assets/characters/shooter/portrait.webp'), token:artPath('/assets/characters/shooter/token.webp'), renderScale:1.00 },
  sniper:  { portrait:artPath('/assets/characters/sniper/portrait.webp'),  token:artPath('/assets/characters/sniper/token.webp'),  renderScale:1.00 },
  cannon:  { portrait:artPath('/assets/characters/cannon/portrait.webp'),  token:artPath('/assets/characters/cannon/token.webp'),  renderScale:1.00 },
  fire:    { portrait:artPath('/assets/characters/fire/portrait.webp'),    token:artPath('/assets/characters/fire/token.webp'),    renderScale:1.00 },
  poison:  { portrait:artPath('/assets/characters/poison/portrait.webp'),  token:artPath('/assets/characters/poison/token.webp'),  renderScale:1.00 },
  reactor: { portrait:artPath('/assets/characters/reactor/portrait.webp'), token:artPath('/assets/characters/reactor/token.webp'), renderScale:1.00 },
  spray:   { portrait:artPath('/assets/characters/spray/portrait.webp'),   token:artPath('/assets/characters/spray/token.webp'),   renderScale:1.00 },
  laser:   { portrait:artPath('/assets/characters/laser/portrait.webp'),   token:artPath('/assets/characters/laser/token.webp'),   renderScale:1.00 },
  ice:     { portrait:artPath('/assets/characters/ice/portrait.webp'),     token:artPath('/assets/characters/ice/token.webp'),     renderScale:1.00 },
  water:   { portrait:artPath('/assets/characters/water/portrait.webp'),   token:artPath('/assets/characters/water/token.webp'),   renderScale:1.00 },
  wind:    { portrait:artPath('/assets/characters/wind/portrait.webp'),    token:artPath('/assets/characters/wind/token.webp'),    renderScale:1.00 },
  star:    { portrait:artPath('/assets/characters/star/portrait.webp'),    token:artPath('/assets/characters/star/token.webp'),    renderScale:1.00 },
  angel:   { portrait:artPath('/assets/characters/angel/portrait.webp'),   token:artPath('/assets/characters/angel/token.webp'),   renderScale:1.00 },
  buffer:  { portrait:artPath('/assets/characters/buffer/portrait.webp'),  token:artPath('/assets/characters/buffer/token.webp'),  renderScale:1.00 },
  light:   { portrait:artPath('/assets/characters/light/portrait.webp'),   token:artPath('/assets/characters/light/token.webp'),   renderScale:1.00 }
});

// Character art is visual-only. All 22 characters already have stable asset slots.
// Missing files show a placeholder in the picker and use the legacy circle + emoji in-game.
// 1.7.1 visual update: all 22 characters now have wired portrait/token asset slots.
const CHARACTER_TOKEN_IMAGES = new Map();
function characterArt(id) { return CHARACTER_ART[id] || null; }
function characterTokenImage(id) {
  const art = characterArt(id);
  if (!art || !art.token) return null;
  let img = CHARACTER_TOKEN_IMAGES.get(id);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.dataset.failed = '0';
    img.onload = () => { img.dataset.failed = '0'; };
    img.onerror = () => { img.dataset.failed = '1'; };
    img.src = art.token;
    CHARACTER_TOKEN_IMAGES.set(id, img);
  }
  return img.dataset.failed !== '1' && img.complete && img.naturalWidth > 0 ? img : null;
}
function characterPortraitHtml(id, name) {
  const art = characterArt(id);
  const icon = CHARACTER_META[id]?.icon || '◈';
  const src = art?.portrait || '';
  const safeName = escapeHtml(name);
  const imageHtml = src
    ? `<img class="character-portrait" src="${src}" alt="${safeName} 캐릭터 일러스트" loading="lazy" decoding="async" onload="this.parentElement.classList.add('art-loaded')" onerror="this.classList.add('hidden')">`
    : '';
  return `<button type="button" class="character-portrait-wrap" data-character-name="${safeName}" aria-label="${safeName} 일러스트 크게 보기">${imageHtml}<div class="character-portrait-placeholder" aria-hidden="true"><span>${icon}</span><small>일러스트 준비 중</small></div><span class="character-portrait-zoom" aria-hidden="true">🔍</span></button>`;
}

const CHARACTER_STORIES = {
  iron: {
    title:'아이언', icon:'⚙️',
    text:'엄청난 맷집을 자랑하는 보디빌더. 강한 상대와 힘을 겨루는 것을 좋아해서 언제나 가장 앞에 서지만, 정작 공격을 맞을 때마다 속으로는 “아프잖아!”라고 생각한다.'
  },
  mecha: {
    title:'메카', icon:'🤖',
    text:'오랫동안 창고에 방치되어 있던 기계에 어느 날 갑자기 영혼이 깃들었다. 깨어나자마자 세상을 구경하고 싶어졌고, 튼튼한 몸과 빠른 다리를 이용해 여기저기 돌아다니며 싸움에도 끼어들고 있다. 자신이 왜 깨어났는지는 메카 자신도 모른다.'
  },
  jet: {
    title:'제트', icon:'🚀',
    text:'어릴 때부터 우주를 동경해 우주비행사가 되었다. 하지만 지금은 로켓 기술을 이용해 싸움터를 누비는 것이 더 즐겁다고 한다.'
  },
  dia: {
    title:'다이아', icon:'💎',
    text:'광선 자매들의 엄마. 반짝이는 것을 너무 좋아한 나머지 특별한 기술을 이용해 잠시 동안 자기 몸을 다이아몬드처럼 변화시키는 능력을 얻었다. 문제는 이제 평범한 모습보다 다이아몬드 모습의 자신을 훨씬 더 마음에 들어 한다는 것이다.'
  },
  solar: {
    title:'솔라', icon:'☀️',
    text:'광선 자매들의 아버지. 광선 자매들을 강하게 키우기 위해 혹독한 훈련을 시켰고, 자신 역시 수련을 게을리하지 않았다. 그 결과 광선과 투사체 공격을 동시에 다룰 줄 아는 엄청난 존재가 되었다.'
  },
  shield: {
    title:'쉴드', icon:'🛡️',
    text:'처음에는 자신을 지키려는 생각으로 보호막 기술을 만들었다. 지금은 다른 사람들을 지키기 위해 그 기술을 사용하고 있다.'
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
  reactor: {
    title:'리액터', icon:'☢️',
    text:'버퍼가 개발한 인공지능 원자로. 의도적으로 과부하를 일으켜 엄청난 괴력을 얻을 수 있다. 주인인 버퍼에게 충성스럽지만 언제나 붙어다니는 것은 가끔 불편하다고.'
  },
  spray: {
    title:'스프레이', icon:'🔫',
    text:'여러 개의 탄환을 만들어낼 수 있는 초능력자. 정작 이 능력 때문에 아무도 자신에게 정면으로 다가오지 않아서 조금 슬퍼하지만, 본인은 부정하고 있다.'
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
  },
  angel: {
    title:'엔젤', icon:'😇',
    text:'고통받는 사람들을 치유하기 위해 원격 치료 기술을 개발했다. 하지만 자신의 원격 치료를 받고 다시 싸우러 뛰쳐나가는 이들을 보면 한숨이 나온다.'
  },
  buffer: {
    title:'버퍼', icon:'🎛️',
    text:'남을 칭찬하는 것을 좋아하는 과학자. 버퍼가 칭찬해준 사람은 반드시 큰 일을 해낸다고 한다. 하지만 정작 본인은 아무에게도 칭찬받은 적이 없어서 공격 능력이 전혀 없다.'
  }
};

const ROLE_ORDER = ['탱커','딜러','힐러'];
const ROLE_LABEL = { '탱커':'🛡️ 탱커', '딜러':'⚔️ 딜러', '힐러':'💚 힐러' };
const savedCharacter = localStorage.getItem('schoolLineCharacter');
const initialRole = CHARACTER_META[savedCharacter]?.role || '딜러';
const pickerState = {
  lobby: { selected: null, role: initialRole }
};
let roomDirectory = [];
let roomDirectoryMaxRooms = 5;
let roomDirectoryRequestInFlight = false;
let lastLobbyPickerAvailabilityKey = null;
let lastCompetitiveRenderKey = null;
let readyDrag = null;

function characterPublicDef(id) {
  return (config && config.characters && config.characters[id]) || null;
}

function fmtNumber(value, digits=1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/\.0$/, '');
}

function speedLabel(speed) {
  const n = Number(speed);
  if (n <= 4.01) return '매우 느림';
  if (n <= 5.01) return '느림';
  if (n <= 6.01) return '보통';
  if (n <= 7.01) return '빠름';
  if (n <= 8.01) return '매우 빠름';
  return '초고속';
}

function sizeLabel(radius) {
  const r = Number(radius);
  if (r <= .66) return '작음';
  if (r <= .81) return '중간';
  return '큼';
}

function attackDisplayName(c) {
  if (!c) return '—';
  if (c.attackType === 'lightBeam') return '광선 (치유 + 공격)';
  if (c.attackType === 'beam') return '광선';
  if (c.projectileType === 'heal' && Number(c.damage || 0) > 0) return '치유 + 공격 투사체';
  if (c.projectileType === 'heal') return '치유 투사체';
  return '투사체';
}

function buildCharacterStats(id) {
  const c = characterPublicDef(id);
  if (!c) return [];
  let attackType = attackDisplayName(c);
  let range = c.range != null ? `${fmtNumber(c.range)} m` : '—';
  let throughputLabel = 'DPS';
  let throughput = '—';
  let rateLabel = '공격 속도';
  let rate = '—';

  if (id === 'solar') {
    attackType = '광선 + 투사체';
    range = `${fmtNumber(c.range)} m / ${fmtNumber(c.solarProjectileRange)} m`;
    const projectileDps = Number(c.solarProjectileDamage || 0) * Number(c.solarFireRate || 0);
    const total = Number(c.beamDps || 0) + projectileDps;
    throughput = `${fmtNumber(total)} (${fmtNumber(c.beamDps)} + ${fmtNumber(projectileDps)})`;
    rate = `태양탄 ${fmtNumber(c.solarFireRate)}발/s`;
  } else if (id === 'reactor' && Array.isArray(c.reactorOutputBands)) {
    throughput = c.reactorOutputBands.map(b => fmtNumber(Number(b.damage || 0) * Number(c.fireRate || 0))).join(' / ');
    rate = `${fmtNumber(c.fireRate)}발/s`;
  } else if (id === 'sniper' && Array.isArray(c.distanceDamageBands)) {
    throughput = c.distanceDamageBands.map(b => fmtNumber(Number(b.damage || 0) * Number(c.fireRate || 0))).join(' / ');
    rate = `${fmtNumber(c.fireRate)}발/s`;
  } else if (id === 'spray') {
    const centerDps = Number(c.damage || 0) * Number(c.fireRate || 0);
    const sideDps = Number(c.spraySideDamage || 0) * Number(c.fireRate || 0);
    throughput = `${fmtNumber(centerDps)} / ${fmtNumber(sideDps)} / ${fmtNumber(sideDps)}`;
    rateLabel = '발사 속도';
    rate = `${fmtNumber(c.fireRate)}발리/s · 발리당 3발`;
  } else if (id === 'buffer') {
    attackType = '단일 연결 지원';
    range = `${fmtNumber(c.range)} m`;
    throughputLabel = 'HPS';
    throughput = fmtNumber(c.linkHealHps);
    rateLabel = '주기형 행동속도';
    rate = `+${fmtNumber(Number(c.actionSpeedBoost||0)*100)}%`;
  } else if (c.attackType === 'lightBeam') {
    throughputLabel = 'DPS / HPS';
    throughput = `${fmtNumber(c.beamDps)} / ${fmtNumber(c.healHps)}`;
    rateLabel = '공격·치유 속도';
    rate = '없음 (지속형)';
  } else if (c.attackType === 'beam') {
    if (Number(c.maxHpDpsRatio || 0) > 0) {
      throughput = `${fmtNumber(c.beamDps)} + 최대 HP ${fmtNumber(c.maxHpDpsRatio * 100)}%/s`;
    } else {
      throughput = fmtNumber(c.beamDps);
    }
    rate = '없음 (지속형)';
  } else if (c.projectileType === 'heal') {
    const healHps = Number(c.heal || 0) * Number(c.fireRate || 0);
    const damageDps = Number(c.damage || 0) * Number(c.fireRate || 0);
    if (damageDps > 0) {
      throughputLabel = 'DPS / HPS';
      throughput = `${fmtNumber(damageDps)} / ${fmtNumber(healHps)}`;
      rateLabel = '공격·치유 속도';
    } else {
      throughputLabel = 'HPS';
      throughput = fmtNumber(healHps);
      rateLabel = '치유 속도';
    }
    rate = `${fmtNumber(c.fireRate)}발/s`;
  } else {
    throughput = fmtNumber(Number(c.damage || 0) * Number(c.fireRate || 0));
    rate = `${fmtNumber(c.fireRate)}발/s`;
  }

  const rows = [
    ['체력', `${fmtNumber(c.hp)} HP`],
    ['공격 방식', attackType],
    ['사거리', range],
    [throughputLabel, throughput],
    [rateLabel, rate],
    ['이동속도', `${speedLabel(c.speed)} · ${fmtNumber(c.speed)} m/s`],
    ['크기', sizeLabel(c.radius)]
  ];
  if (Number(c.ultimateCost || 0) > 0) rows.push(['궁극기 충전', fmtNumber(c.ultimateCost)]);
  return rows;
}

function buildCharacterMini(id, meta) {
  const c = characterPublicDef(id);
  if (!c) return meta.summary || '';
  const move = speedLabel(c.speed);
  if (c.role === '탱커') return `${fmtNumber(c.hp)} HP · ${move}`;
  if (id === 'buffer') return `${fmtNumber(c.linkHealHps)} HPS + 행동속도 ${fmtNumber(Number(c.actionSpeedBoost||0)*100)}% · ${move}`;
  if (c.projectileType === 'heal') {
    const healHps = Number(c.heal||0)*Number(c.fireRate||0);
    const damageDps = Number(c.damage||0)*Number(c.fireRate||0);
    return damageDps > 0 ? `${fmtNumber(damageDps)} DPS / ${fmtNumber(healHps)} HPS · ${move}` : `${fmtNumber(healHps)} HPS · ${move}`;
  }
  if (c.attackType === 'lightBeam') return `${fmtNumber(c.healHps)} HPS · ${move}`;
  if (id === 'reactor' && Array.isArray(c.reactorOutputBands)) return `${c.reactorOutputBands.map(b=>fmtNumber(Number(b.damage||0)*Number(c.fireRate||0))).join('/')} DPS · ${move}`;
  if (id === 'sniper' && Array.isArray(c.distanceDamageBands)) return `${c.distanceDamageBands.map(b=>fmtNumber(Number(b.damage||0)*Number(c.fireRate||0))).join('/')} DPS · ${move}`;
  if (id === 'spray') {
    const centerDps = Number(c.damage||0)*Number(c.fireRate||0);
    return `중심 ${fmtNumber(centerDps)} DPS`;
  }
  if (c.attackType === 'beam') return `${fmtNumber(c.beamDps)} DPS · ${move}`;
  return `${fmtNumber(Number(c.damage||0)*Number(c.fireRate||0))} DPS · ${move}`;
}

function buildCharacterMechanic(id, fallback='') {
  const c = characterPublicDef(id);
  if (!c) return fallback;
  const bands = Array.isArray(c.distanceDamageBands) ? c.distanceDamageBands : [];
  switch (id) {
    case 'iron': return '높은 체력으로 전선을 버티며 느린 투사체로 압박합니다.';
    case 'mecha': return '짧은 사거리 대신 높은 체력과 빠른 이동속도로 공간을 장악합니다.';
    case 'jet': return '부스터로 최대 12m 돌진하고 종료 후 보호막 50을 얻습니다.';
    case 'dia': return '6초간 다이아폼으로 변신해 이동속도 7.0과 90 DPS 광선을 얻으며, 폼에서 직접 처치하면 남은 쿨다운이 줄어듭니다.';
    case 'solar': return '광선과 태양탄을 함께 사용하며, 태양탄이 실제 HP에 피해를 주면 자신을 회복합니다.';
    case 'shield': return '거리 제한 없이 자신 또는 아군에게 보호막을 부여하며 최대 2회 충전됩니다.';
    case 'runner': return '질주를 사용하면 4초간 이동속도가 1단계 상승합니다.';
    case 'shooter': return '매우 빠른 투사체로 안정적인 기본 공격에 집중합니다.';
    case 'sniper': return '매우 빠른 장거리 투사체를 사용합니다.';
    case 'cannon': return '높은 연사 화력 대신 이동속도가 매우 느립니다.';
    case 'fire': return '공격 적중 시 2초간 10 DPS의 화상을 남기며, 화상 중에는 대상이 받는 외부 치유량이 30% 감소합니다.';
    case 'poison': return '광선 적중 시 대상이 받는 외부 치유량을 50% 감소시킵니다.';
    case 'reactor': return '실제 HP 피해와 적 처치로 출력 에너지가 상승하며 3단계에서 더 강하고 빨라집니다.';
    case 'spray': return '한 번에 중앙탄과 좌우 보조탄을 함께 발사합니다.';
    case 'laser': return '대상 최대 체력이 높을수록 추가 피해가 커집니다.';
    case 'ice': return '광선 적중 시 1.5초간 이동속도를 1단계 낮춥니다.';
    case 'water': return '같은 투사체로 아군을 치유하고 적에게 50 DPS를 줄 수 있습니다.';
    case 'wind': return '치유탄으로 적에게 50 DPS를 줄 수 있으며, 순풍으로 팀의 이동속도도 높입니다.';
    case 'star': return '매우 빠른 장거리 투사체로 아군을 치유하고 적에게 50 DPS를 줄 수 있습니다.';
    case 'angel': return '치유탄으로 적에게 50 DPS를 줄 수 있으며, 축복으로 어디서든 아군을 도울 수 있습니다.';
    case 'buffer': return '아군 한 명을 연결해 45 HPS와 공격속도 25% 증가를 제공합니다.';
    case 'light': return '광선으로 아군을 치유하고 그 뒤의 적에게 동시에 피해를 줄 수 있습니다.';
    default: return fallback;
  }
}

function buildCharacterUltimateSection(id) {
  const c = characterPublicDef(id);
  if (!c || Number(c.ultimateCost || 0) <= 0) return '';
  const name = escapeHtml(c.ultimateName || '궁극기');
  const description = escapeHtml(c.ultimateDescription || '');
  const cost = fmtNumber(c.ultimateCost);
  return `<div class="character-ultimate-section"><div class="character-ultimate-title">궁극기 설명</div><div class="character-ultimate-name">⚡ ${name} <span>충전 ${cost}</span></div><div class="character-ultimate-description">${description}</div></div>`;
}

function closePortraitHoverPreview() {
  const preview = $('portraitHoverPreview');
  if (preview) preview.classList.add('hidden');
}

function showPortraitHoverPreview(button) {
  const preview = $('portraitHoverPreview');
  const img = button?.querySelector('.character-portrait');
  if (!preview || !img || !button.classList.contains('art-loaded') || !img.naturalWidth) return;
  const previewImg = preview.querySelector('img');
  if (!previewImg) return;
  previewImg.src = img.currentSrc || img.src;
  previewImg.alt = img.alt || '';
  const r = button.getBoundingClientRect();
  preview.classList.remove('hidden');
  const w = Math.min(280, Math.max(220, window.innerWidth * .22));
  preview.style.width = `${w}px`;
  const pad = 12;
  const desiredLeft = r.right + 12;
  const left = desiredLeft + w <= window.innerWidth - pad ? desiredLeft : Math.max(pad, r.left - w - 12);
  const top = Math.max(pad, Math.min(r.top, window.innerHeight - Math.min(390, window.innerHeight * .72) - pad));
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
}

function openPortraitLightbox(button) {
  const overlay = $('portraitLightbox');
  const img = button?.querySelector('.character-portrait');
  if (!overlay || !img || !button.classList.contains('art-loaded') || !img.naturalWidth) return;
  closePortraitHoverPreview();
  const large = $('portraitLightboxImage');
  const caption = $('portraitLightboxCaption');
  large.src = img.currentSrc || img.src;
  large.alt = img.alt || '';
  if (caption) caption.textContent = button.dataset.characterName || '';
  overlay.classList.remove('hidden');
  document.body.classList.add('portrait-lightbox-open');
}

function closePortraitLightbox() {
  const overlay = $('portraitLightbox');
  if (overlay) overlay.classList.add('hidden');
  document.body.classList.remove('portrait-lightbox-open');
}

function wireCharacterPortraitPreview(detail) {
  const button = detail?.querySelector('.character-portrait-wrap');
  if (!button) return;
  const canHover = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if (canHover) {
    button.addEventListener('mouseenter', () => showPortraitHoverPreview(button));
    button.addEventListener('mouseleave', closePortraitHoverPreview);
    button.addEventListener('focus', () => showPortraitHoverPreview(button));
    button.addEventListener('blur', closePortraitHoverPreview);
  }
  button.addEventListener('click', () => openPortraitLightbox(button));
}

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

  const roleEntries = Object.entries(CHARACTER_META).filter(([id,m]) => (characterPublicDef(id)?.role || m.role) === ps.role);
  for (const [id, m] of roleEntries) {
    const taken = kind === 'lobby' && isTeamCharacterTaken(id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.disabled = taken;
    btn.className = 'character-choice' + (ps.selected === id ? ' selected' : '') + (taken ? ' unavailable' : '');
    const publicDef = characterPublicDef(id);
    const displayName = publicDef?.name || m.name;
    btn.innerHTML = `<span class="char-name">${m.icon} ${displayName}</span><span class="char-mini">${taken ? '🔒 사용 중' : buildCharacterMini(id, m)}</span>`;
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
  const publicDef = characterPublicDef(detailId);
  const displayName = publicDef?.name || m.name;
  const displayRole = publicDef?.role || m.role;
  const taken = kind === 'lobby' && isTeamCharacterTaken(detailId);
  const statHtml = buildCharacterStats(detailId).map(([label, value]) => `<div class="character-stat-item"><span>${label}</span><b>${value}</b></div>`).join('');
  const sniperRangeGuideNote = detailId === 'sniper' ? '<div class="character-mechanic">빨간색 원 밖의 적에게 더 높은 피해를 줍니다.</div>' : '';
  const healerSelfHealNote = displayRole === '힐러' ? '<div class="character-mechanic">자신이 아군을 치유했을 때 치유량의 25%를 자신이 회복합니다.</div>' : '';
  const portraitHtml = characterPortraitHtml(detailId, displayName);
  detail.classList.add('has-character-art');
  const ultimateSection = buildCharacterUltimateSection(detailId);
  detail.innerHTML = `<div class="character-detail-hero">${portraitHtml}<div class="character-detail-headcopy"><div class="character-detail-name">${m.icon} ${displayName}</div><span class="role-badge">${displayRole}</span></div></div><div class="character-stat-grid">${statHtml}</div><div class="character-traits"><div class="character-traits-title">특성</div><div class="character-summary">${m.summary}</div><div class="character-mechanic">${buildCharacterMechanic(detailId, m.mechanic)}</div>${sniperRangeGuideNote}${healerSelfHealNote}</div>${ultimateSection}${taken ? '<div class="character-taken-note">🔒 같은 팀원이 사용 중</div>' : ''}`;
  wireCharacterPortraitPreview(detail);
}

function selectLobbyCharacter(id) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type:'select', character:id }));
}

let ws = null, myId = null, config = null, state = null;

// Live projectile rendering is reconstructed locally from server-authoritative lifecycle events.
// This registry is visual-only; hit/damage/heal/collision/range decisions remain entirely server-side.
const liveProjectileRegistry = new Map();
const seenDiaUltimateVolleys = new Set();
// BWOpt6/c5 static live-player identity dictionary. Identity/team/character are sent
// only when the roster changes or a connection force-syncs into an active match.
let livePlayerMeta = [];

function clearLiveProjectileRegistry() {
  liveProjectileRegistry.clear();
  seenDiaUltimateVolleys.clear();
}

function applyProjectileWireRow(row, nowPerf = performance.now()) {
  if (!Array.isArray(row) || !row[0]) return;
  liveProjectileRegistry.set(row[0], {
    id: row[0],
    x: Number(row[1] || 0),
    y: Number(row[2] || 0),
    vx: Number(row[3] || 0),
    vy: Number(row[4] || 0),
    radius: Number(row[5] || 0.20),
    type: row[6] ? 'heal' : 'attack',
    team: row[7] ? 'B' : 'A',
    character: row[8] || null,
    reactorFxBand: row[9] == null ? null : Number(row[9]),
    ultimateProjectile: !!row[10],
    diaUltimateVolleyId: row[11] || null,
    basePerf: nowPerf
  });
}

function applyProjectileNetworkUpdate(msg) {
  const nowPerf = performance.now();
  if (Array.isArray(msg?.projectileSync)) {
    liveProjectileRegistry.clear();
    for (const row of msg.projectileSync) applyProjectileWireRow(row, nowPerf);
  }
  const events = Array.isArray(msg?.projectileEvents) ? msg.projectileEvents : [];
  const spawns = Array.isArray(events[0]) ? events[0] : [];
  const removes = Array.isArray(events[1]) ? events[1] : [];
  for (const row of spawns) {
    applyProjectileWireRow(row, nowPerf);
    const volleyId = row?.[11] || null;
    if (row?.[8] === 'dia' && row?.[10] && volleyId && !seenDiaUltimateVolleys.has(volleyId)) {
      seenDiaUltimateVolleys.add(volleyId);
      const vx=Number(row[3]||0), vy=Number(row[4]||0), speed=Math.hypot(vx,vy)||1;
      const projectileRadius=Number(row[5]||0.20);
      const offset=characterRadiusWorld('dia')+projectileRadius+0.04;
      const cx=Number(row[1]||0)-(vx/speed)*offset;
      const cy=Number(row[2]||0)-(vy/speed)*offset;
      addWorldFx('diaUltimateWave', {x:cx,y:cy,character:'dia',team:row[7]?'B':'A'});
    }
  }
  for (const id of removes) liveProjectileRegistry.delete(id);
}

function liveNetworkProjectiles(nowPerf = performance.now()) {
  const out = [];
  for (const p of liveProjectileRegistry.values()) {
    const dt = Math.max(0, Math.min(2.5, (nowPerf - p.basePerf) / 1000));
    out.push({
      id: p.id,
      x: p.x + p.vx * dt,
      y: p.y + p.vy * dt,
      radius: p.radius,
      type: p.type,
      team: p.team,
      character: p.character,
      reactorFxBand: p.reactorFxBand,
      ultimateProjectile: !!p.ultimateProjectile,
      diaUltimateVolleyId: p.diaUltimateVolleyId || null,
      vx: p.vx, vy: p.vy
    });
  }
  return out;
}

// Compatibility helpers for c2/c3 servers. BWOpt5 c4 itself uses the generic registry above.
function applyCannonWireRow(row, nowPerf = performance.now()) {
  if (!Array.isArray(row) || !row[0]) return;
  applyProjectileWireRow([
    row[0], row[1], row[2], row[3], row[4],
    Number(config?.characters?.cannon?.projectileRadius || 0.32), 0, row[5] ? 1 : 0, 'cannon', null
  ], nowPerf);
}

function applyCannonNetworkUpdate(msg) {
  const nowPerf = performance.now();
  if (Array.isArray(msg?.cannonSync)) {
    for (const [id, p] of [...liveProjectileRegistry.entries()]) if (p.character === 'cannon') liveProjectileRegistry.delete(id);
    for (const row of msg.cannonSync) applyCannonWireRow(row, nowPerf);
  }
  const events = Array.isArray(msg?.cannonEvents) ? msg.cannonEvents : [];
  const spawns = Array.isArray(events[0]) ? events[0] : [];
  const removes = Array.isArray(events[1]) ? events[1] : [];
  for (const row of spawns) applyCannonWireRow(row, nowPerf);
  for (const id of removes) liveProjectileRegistry.delete(id);
}

// Dormant perk-selection client shell. Alpha 1.5 receives no perk_offer while the
// server PERK_SYSTEM flag is disabled, so these controls never become visible.
let activePerkOffer = null;

function hidePerkChoicePanel() {
  activePerkOffer = null;
  const panel = $('perkChoicePanel');
  if (panel) panel.classList.add('hidden');
}

function perkButtonText(option, index) {
  const name = String(option?.name || `특전 ${index + 1}`);
  const description = String(option?.description || '');
  return description ? `${name}\n${description}` : name;
}

function showPerkChoicePanel(msg) {
  if (spectatorMode || !msg || !Array.isArray(msg.options) || msg.options.length !== 2) return;
  activePerkOffer = msg;
  const panel = $('perkChoicePanel');
  const buttons = [$('perkChoiceA'), $('perkChoiceB')];
  if (!panel || buttons.some(b => !b)) return;
  buttons.forEach((button, index) => {
    const option = msg.options[index];
    button.textContent = perkButtonText(option, index);
    button.disabled = !option?.id;
    button.dataset.perkId = option?.id || '';
  });
  panel.classList.remove('hidden');
}

function submitPerkChoice(button) {
  const perkId = String(button?.dataset?.perkId || '');
  if (!perkId || !activePerkOffer || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type:'perk_choose', perkId }));
  const a = $('perkChoiceA'), b = $('perkChoiceB');
  if (a) a.disabled = true;
  if (b) b.disabled = true;
}

if ($('perkChoiceA')) $('perkChoiceA').addEventListener('click', event => submitPerkChoice(event.currentTarget));
if ($('perkChoiceB')) $('perkChoiceB').addEventListener('click', event => submitPerkChoice(event.currentTarget));
let spectatorMode = false;
let schoolLineAccessOpen = false;
let accessLockActive = true;
let accessStatusRequestInFlight = false;
let postGameSequence = { active:false, timers:[], finalState:null };
let adminStatsAuthorized = false;
let adminStatsPin = ''; // memory-only; never stored in localStorage/sessionStorage.
let lastAdminStatsData = null;
let selectedCompetitiveStatsVersion = null;
let selectedTargetId = null; // Targeted ability selection (Angel Blessing and future targeted abilities).
// Local-only healer awareness UI. A teammate enters the attention set at <=50% HP
// and stays highlighted until >=60% HP to prevent threshold flicker.
const healerLowHpAttention = new Set();

const CHARACTER_INTRO_TIPS = Object.freeze({
  iron: { role:'tank', text:'혼자 깊게 들어가기보다 팀과 함께 뭉쳐서 움직이세요. 속도가 느리니 방어에 집중하세요.' },
  mecha: { role:'tank', text:'빠른 속도로 적의 시선을 끌고 싸움을 흔드세요. 위험하면 도망쳐서 우리 팀 힐러에게 치유받거나, 4초 동안 구석에서 공격받지 않으면 체력이 차오릅니다.' },
  jet: { role:'tank', text:'부스터로 빠르게 진입해 연약한 적을 공격하세요. 아군이 따라올 수 없는 곳까지 혼자 들어가면 위험해요.' },
  solar: { role:'tank', text:'무리하게 돌진하기보다 태양탄을 명중시키며 계속 회복하세요. 속도가 느리니 방어에 집중하세요.' },
  shield: { role:'tank', text:'보호막이 필요한 아군에게 빨리 스킬을 써주세요. 속도가 느리니 방어에 집중하세요.' },
  dia: { role:'tank', text:'적의 체력이 깎였을 때 변신해서 적을 처치하세요. 변신하면 체력이 회복되니 생존용으로도 써보세요.' },
  water: { role:'healer', text:'뒤에서 팀원을 조준해 꾸준히 치유하세요. 적이 공격하면 즉시 아군에게 도움을 요청하세요.' },
  wind: { role:'healer', text:'뒤에서 팀원을 조준해 꾸준히 치유하세요. 스킬로 팀 전원의 이동속도를 올려 위기에서 도망칠 수 있습니다.' },
  star: { role:'healer', text:'뒤에서 팀원을 조준해 꾸준히 치유하세요. 이동속도가 느리니 적이 접근하면 즉시 도움을 요청하세요.' },
  angel: { role:'healer', text:'뒤에서 팀원을 조준해 꾸준히 치유하세요. 축복으로 어디에 있는 아군이든 도울 수 있습니다.' },
  buffer: { role:'healer', text:'연결을 유지해서 강한 팀원을 살리고 강화하는 데 집중하세요.' },
  light: { role:'healer', text:'공격에 욕심내 앞으로 나가지 말고 팀 힐링과 자기 생존을 우선하세요.' }
});
let characterIntroTimer = null;

function hideCharacterIntroTip() {
  if (characterIntroTimer) { clearTimeout(characterIntroTimer); characterIntroTimer = null; }
  const card = $('characterIntroTip');
  if (!card) return;
  card.classList.add('hidden');
  card.classList.remove('show','tank','healer');
}

function showCharacterIntroTip(characterId) {
  const tip = CHARACTER_INTRO_TIPS[characterId];
  if (!tip || spectatorMode) { hideCharacterIntroTip(); return; }
  const card = $('characterIntroTip');
  const nameEl = $('characterIntroName');
  const textEl = $('characterIntroText');
  if (!card || !nameEl || !textEl) return;
  if (characterIntroTimer) clearTimeout(characterIntroTimer);
  const meta = CHARACTER_META[characterId] || {};
  nameEl.textContent = `${meta.icon || (tip.role === 'tank' ? '🛡️' : '💚')} ${meta.name || characterId}`;
  textEl.textContent = tip.text;
  card.classList.remove('hidden','show','tank','healer');
  card.classList.add(tip.role);
  void card.offsetWidth;
  card.classList.add('show');
  characterIntroTimer = setTimeout(hideCharacterIntroTip, 4850);
}

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
  const snapshotInterval = Math.max(35, Math.min(110, rawInterval));
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
    // Local movement still catches up slightly faster, while 10 Hz network snapshots are
    // interpolated across most of their interval so bandwidth savings do not look choppy.
    const duration = p.id === myId
      ? Math.max(30, Math.min(75, snapshotInterval * 0.80))
      : Math.max(40, Math.min(90, snapshotInterval * 0.95));
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


function clearPostGameTimers() {
  for (const id of postGameSequence.timers || []) clearTimeout(id);
  postGameSequence.timers = [];
}

function schedulePostGame(fn, ms) {
  const id = setTimeout(fn, ms);
  postGameSequence.timers.push(id);
  return id;
}

function resetPostGameSequence() {
  clearPostGameTimers();
  postGameSequence.active = false;
  postGameSequence.finalState = null;
  document.body.classList.remove('post-game-sequence');
  $('postGameOverlay')?.classList.add('hidden');
  $('postGameOverlay')?.classList.remove('fade-black');
  $('postGameWinner')?.classList.add('hidden');
}

function postGameWinnerText(finalState) {
  if (!finalState) return '';
  const score = `${Number(finalState.scoreA || 0).toFixed(1).replace(/\.0$/,'')} : ${Number(finalState.scoreB || 0).toFixed(1).replace(/\.0$/,'')}`;
  if (finalState.winner === 'DRAW') return `무승부!  ${score}`;
  if (finalState.winnerReason === 'kills') return `${finalState.winner}팀 승리!  ${score}\n킬 타이브레이크 ${Number(finalState.teamKills?.A||0)} : ${Number(finalState.teamKills?.B||0)}`;
  return `${finalState.winner}팀 승리!  ${score}`;
}

function finishPostGameSequence() {
  const finalState = postGameSequence.finalState || state;
  $('postGameOverlay')?.classList.add('hidden');
  $('postGameOverlay')?.classList.remove('fade-black');
  document.body.classList.remove('post-game-sequence');
  postGameSequence.active = false;
  clearPostGameTimers();
  if (finalState) state = finalState;
  show('lobby');
  renderLobby();
}

function fadeToPostGameResults() {
  const overlay = $('postGameOverlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.classList.add('fade-black');
    $('postGameWinner')?.classList.add('hidden');
  }
  schedulePostGame(finishPostGameSequence, 350);
}

function startPostGameSequence(finalState) {
  resetPostGameSequence();
  if (!finalState) return;
  postGameSequence.active = true;
  postGameSequence.finalState = finalState;
  state = finalState;
  stopBgm();
  stopBeamHum();
  selectedTargetId = null;
  clearLiveProjectileRegistry();
  playerMotionTracks.clear();
  document.body.classList.add('post-game-sequence');
  show('game');
  const overlay = $('postGameOverlay');
  overlay?.classList.remove('hidden','fade-black');
  const winner = $('postGameWinner');
  winner.textContent = postGameWinnerText(finalState);
  winner.style.whiteSpace = 'pre-line';
  winner.classList.remove('hidden');
  schedulePostGame(fadeToPostGameResults, 1800);
}

renderPicker('lobby');

let keys = { up:false, down:false, left:false, right:false };
let mouseWorld = { x: 21, y: 34 };
let firing = false;
let lastAimDir = { x: 0, y: 1 }; // world direction, A->B by default

// Mouse-only desktop clients never use the virtual joysticks. Hide their large
// pointer zones entirely so every battlefield mouse click reaches the canvas.
// Touch-capable/coarse-pointer devices retain the dual-stick UI.
const HAS_TOUCH_INPUT = (Number(navigator.maxTouchPoints) || 0) > 0
  || (window.matchMedia && window.matchMedia('(any-pointer: coarse)').matches);
const HAS_FINE_PRIMARY_POINTER = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
if (HAS_FINE_PRIMARY_POINTER && !HAS_TOUCH_INPUT) document.body.classList.add('desktop-controls-only');


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
let lastHealReceivedAt = 0;
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
  // Local healer cue: "I successfully restored an ally's actual HP."
  const now = performance.now();
  if (now - lastHealConfirmAt < 250) return;
  lastHealConfirmAt = now;
  synthTone({freq:660, endFreq:760, duration:.075, type:'sine', gain:.022});
  synthTone({freq:990, endFreq:1180, duration:.090, type:'sine', gain:.015, when:.025});
}

function playHealReceivedCue() {
  // Local recipient cue: "An ally just restored my actual HP." Kept softer/lower than
  // the healer-success cue so simultaneous team healing stays readable rather than noisy.
  const now = performance.now();
  if (now - lastHealReceivedAt < 300) return;
  lastHealReceivedAt = now;
  synthTone({freq:520, endFreq:640, duration:.105, type:'sine', gain:.017});
  synthTone({freq:780, endFreq:900, duration:.115, type:'sine', gain:.011, when:.035});
}

function showHealNumber(amount) {
  if (spectatorMode || !state || state.state !== 'playing') return;
  const value = Math.max(0, Number(amount) || 0);
  if (value <= 0) return;
  const layer = $('healNumberLayer');
  if (!layer) return;
  const popup = document.createElement('span');
  popup.className = 'heal-number-popup';
  // Keep the HUD compact: integer display is easier to read at 5 Hz, while the server
  // still aggregates exact effective healing before sending the 200 ms total.
  popup.textContent = `+${Math.max(1, Math.round(value))}`;
  layer.appendChild(popup);
  while (layer.children.length > 5) layer.firstElementChild?.remove();
  popup.addEventListener('animationend', () => popup.remove(), { once:true });
  setTimeout(() => popup.remove(), 700);
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

function playJetBoostStartCue() {
  noiseBurst(.085, .030);
  synthTone({freq:180, endFreq:620, duration:.13, type:'sawtooth', gain:.026});
  synthTone({freq:420, endFreq:980, duration:.10, type:'triangle', gain:.015, when:.018});
}

function playJetBoostEndCue(blocked=false) {
  synthTone({freq:blocked ? 165 : 240, endFreq:blocked ? 105 : 155, duration:.070, type:'triangle', gain:.020});
  if (blocked) noiseBurst(.040, .022);
  synthTone({freq:980, endFreq:1280, duration:.080, type:'sine', gain:.012, when:.028});
}

function playReactorThresholdCue(level) {
  if (level === 33) {
    synthTone({freq:430, endFreq:520, duration:.075, type:'triangle', gain:.014});
  } else if (level === 66) {
    synthTone({freq:520, endFreq:680, duration:.085, type:'triangle', gain:.018});
    synthTone({freq:760, endFreq:980, duration:.090, type:'sine', gain:.014, when:.055});
  } else if (level === 100) {
    synthTone({freq:760, endFreq:1180, duration:.11, type:'sawtooth', gain:.018});
    synthTone({freq:1180, endFreq:1640, duration:.11, type:'triangle', gain:.014, when:.045});
    noiseBurst(.045, .010);
  } else if (level === 'down66') {
    synthTone({freq:620, endFreq:360, duration:.11, type:'triangle', gain:.014});
  }
}

function playRadiationApplyCue() {
  noiseBurst(.040, .011);
  synthTone({freq:1180, endFreq:720, duration:.055, type:'square', gain:.010});
}

function playAngelBlessCue() {
  synthTone({freq:660, endFreq:700, duration:.13, type:'sine', gain:.017});
  synthTone({freq:830, endFreq:880, duration:.13, type:'sine', gain:.016, when:.045});
  synthTone({freq:1040, endFreq:1120, duration:.15, type:'sine', gain:.015, when:.090});
}

function playBufferLinkCue(kind='connect') {
  if (kind === 'drop') {
    synthTone({freq:410, endFreq:260, duration:.090, type:'triangle', gain:.010});
    return;
  }
  const reconnect = kind === 'reconnect';
  synthTone({freq:reconnect ? 540 : 470, endFreq:reconnect ? 760 : 650, duration:.085, type:'triangle', gain:.012});
  synthTone({freq:reconnect ? 820 : 760, endFreq:reconnect ? 1040 : 940, duration:.090, type:'sine', gain:.010, when:.035});
}

function playWindTailwindCue(local=false) {
  const scale = local ? 1 : .72;
  noiseBurst(.12, .017 * scale);
  synthTone({freq:260, endFreq:520, duration:.16, type:'triangle', gain:.014 * scale});
  synthTone({freq:540, endFreq:860, duration:.13, type:'sine', gain:.010 * scale, when:.035});
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
  const me=(nextState.players || []).find(p => p.id===myId);
  const active=!!(me && me.beamActive && me.beamDidDamage);
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

function pulseUltimateButton() {
  const btn=$('ultimateButton');
  if (!btn) return;
  btn.classList.remove('fx-pulse');
  void btn.offsetWidth;
  btn.classList.add('fx-pulse');
  setTimeout(() => btn.classList.remove('fx-pulse'), 320);
}

function playUltimateUseFeedback(local=false) {
  synthTone({freq:local?330:260,endFreq:local?660:430,duration:.24,type:'sawtooth',gain:local?.18:.10});
  synthTone({freq:local?660:520,endFreq:local?990:720,duration:.18,type:'square',gain:local?.10:.06,when:.06});
  if (local && navigator.vibrate) navigator.vibrate([45,25,80]);
}

function playCharacterUltimateCue(character, local=false) {
  playUltimateUseFeedback(local);
  const gain = local ? 1 : .72;
  if (character==='angel' || character==='star' || character==='water' || character==='wind' || character==='light') {
    synthTone({freq:520,endFreq:820,duration:.18,type:'sine',gain:.030*gain});
    synthTone({freq:820,endFreq:1180,duration:.16,type:'triangle',gain:.018*gain,when:.05});
  } else if (character==='fire' || character==='mecha' || character==='cannon' || character==='reactor' || character==='poison' || character==='laser') {
    noiseBurst(.070, .028*gain);
    synthTone({freq:190,endFreq:120,duration:.20,type:'sawtooth',gain:.028*gain});
  } else if (character==='runner' || character==='jet' || character==='shooter' || character==='sniper' || character==='spray') {
    synthTone({freq:440,endFreq:940,duration:.18,type:'triangle',gain:.022*gain});
    synthTone({freq:980,endFreq:1320,duration:.10,type:'sine',gain:.013*gain,when:.04});
  } else {
    synthTone({freq:360,endFreq:760,duration:.20,type:'triangle',gain:.020*gain});
  }
}

function addWorldFx(type, player, extra={}) {
  if (!player) return;
  const now=performance.now();
  const durations={muzzle:90,heal:220,death:380,respawn:420,ability:240,diaTransform:520,jetStart:260,jetEnd:300,jetWallSpark:220,reactor33:300,reactor66:420,reactor100:520,reactorDown:260,radiationStart:260,angelCast:260,angelBless:520,bufferLink:320,windTailwindCast:420,ultimateCast:760,ultimateWindup:520,diaUltimateWave:520,ironUltimate:700,mechaUltimate:760,jetUltimate:620,solarUltimate:760,shieldUltimate:820,runnerUltimate:620,shooterUltimate:650,sniperUltimate:650,cannonUltimate:700,fireUltimate:720,poisonUltimate:720,reactorUltimate:680,sprayUltimate:680,waterUltimate:900,windUltimate:780,starUltimate:900,angelUltimate:880,bufferUltimate:720,lightUltimate:720,laserUltimate:720,iceUltimate:820,diaUltimate:760};
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
function addCharacterUltimateFx(player, phase='cast', extra={}) {
  if (!player || !player.character) return;
  const def=characterPublicDef(player.character) || {};
  addWorldFx(`${player.character}Ultimate`, player, {
    phase,
    radiusWorld: Math.max(0, Number(def.ultimateRadius) || 0),
    ...extra
  });
}

function isDelayedWarningUltimate(character) {
  return character === 'iron' || character === 'ice' || character === 'star';
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

    if (!before.radiated && after.radiated) {
      addWorldFx('radiationStart', after);
      if (after.id===myId || after.radiationSourceId===myId) playRadiationApplyCue();
    }

    if (after.character==='reactor') {
      const prevOut=Number(before.reactorOutput)||0, nextOut=Number(after.reactorOutput)||0;
      if (prevOut < 33 && nextOut >= 33) { addWorldFx('reactor33', after); if (after.id===myId) playReactorThresholdCue(33); }
      if (prevOut < 66 && nextOut >= 66) { addWorldFx('reactor66', after); if (after.id===myId) playReactorThresholdCue(66); }
      if (prevOut < 99.999 && nextOut >= 99.999) { addWorldFx('reactor100', after); if (after.id===myId) playReactorThresholdCue(100); }
      if (prevOut >= 66 && nextOut < 66) { addWorldFx('reactorDown', after); if (after.id===myId) playReactorThresholdCue('down66'); }
    }

    if (after.character==='jet' && before.jetBoost && !after.jetBoost && after.alive) {
      const jetDef=characterPublicDef('jet');
      const blocked=Number(after.jetBoostDistance||0) > 0 && jetDef && Number(after.jetBoostDistance||0) < Number(jetDef.boostDistance||12)-.10;
      addWorldFx('jetEnd', after);
      if (blocked) addWorldFx('jetWallSpark', after);
      if (after.id===myId) playJetBoostEndCue(!!blocked);
    }

    if (after.character==='buffer') {
      const oldTarget=before.bufferTargetId || null, newTarget=after.bufferTargetId || null;
      const target=afterById.get(newTarget);
      if (newTarget && newTarget !== oldTarget) {
        if (target) addWorldFx('bufferLink', target, {character:'buffer'});
        if (after.id===myId || newTarget===myId) playBufferLinkCue('connect');
      } else if (newTarget && !before.bufferLinkActive && after.bufferLinkActive) {
        if (target) addWorldFx('bufferLink', target, {character:'buffer'});
        if (after.id===myId || newTarget===myId) playBufferLinkCue('reconnect');
      } else if (newTarget && before.bufferLinkActive && !after.bufferLinkActive) {
        if (after.id===myId) playBufferLinkCue('drop');
      }
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
      // Two separate local-only cues: healer success vs. recipient confirmation.
      // Self-healing never raises healHitSeq on the server, so the 50% healer sustain is silent.
      if (after.id===myId) playHealConfirm();
      if (after.id!==myId && after.lastHealTargetId===myId) playHealReceivedCue();
    }

    if ((after.abilityUseSeq||0) > (before.abilityUseSeq||0)) {
      const diaTransform = after.character==='dia' && !before.diaForm && after.diaForm;
      if (diaTransform) {
        addWorldFx('diaTransform', after);
        playDiaTransformCue(after.id===myId);
        if (after.id===myId) pulseAbilityButton();
      } else if (after.character==='jet') {
        let dx=Number(after.jetBoostEndX||after.x)-Number(after.jetBoostStartX||after.x);
        let dy=Number(after.jetBoostEndY||after.y)-Number(after.jetBoostStartY||after.y);
        const dl=Math.hypot(dx,dy)||1; dx/=dl; dy/=dl;
        addWorldFx('jetStart', after, {x:Number(after.jetBoostStartX||after.x),y:Number(after.jetBoostStartY||after.y),dx,dy});
        if (after.id===myId) { playJetBoostStartCue(); pulseAbilityButton(); }
      } else if (after.character==='wind') {
        addWorldFx('windTailwindCast', after);
        const localPlayer=afterById.get(myId);
        if (spectatorMode || after.id===myId || (localPlayer && localPlayer.team===after.team)) playWindTailwindCue(after.id===myId);
        if (after.id===myId) pulseAbilityButton();
      } else if (after.character==='shield') {
        const target=afterById.get(after.lastAbilityTargetId);
        addWorldFx('ability', after, {character:'shield'});
        if (target) addWorldFx('ability', target, {character:'shield'});
        if (after.id===myId || after.lastAbilityTargetId===myId) playAbilityUseFeedback();
        if (after.id===myId) pulseAbilityButton();
      } else if (after.character==='angel') {
        const target=afterById.get(after.lastAbilityTargetId);
        addWorldFx('angelCast', after);
        if (target) addWorldFx('angelBless', target, {character:'angel'});
        if (after.id===myId || after.lastAbilityTargetId===myId) playAngelBlessCue();
        if (after.id===myId) pulseAbilityButton();
      } else {
        addWorldFx('ability', after);
        if (after.id===myId) { playAbilityUseFeedback(); pulseAbilityButton(); }
      }
    }

    const beforePending = Number(before.pendingUltimateMs || 0) > 0 ? (before.pendingUltimateId || before.character) : null;
    const afterPending = Number(after.pendingUltimateMs || 0) > 0 ? (after.pendingUltimateId || after.character) : null;
    if (beforePending && !afterPending && after.alive && isDelayedWarningUltimate(beforePending)) {
      addCharacterUltimateFx({...after, character:beforePending}, 'resolve');
    }

    if ((after.ultimateUseSeq||0) > (before.ultimateUseSeq||0)) {
      if (isDelayedWarningUltimate(after.character)) {
        addWorldFx('ultimateWindup', after, { radiusWorld: Math.max(0, Number(characterPublicDef(after.character)?.ultimateRadius) || 0) });
      } else if (after.character === 'shield') {
        for (const target of afterById.values()) {
          if (target.alive && target.team === after.team) addCharacterUltimateFx({...target, character:'shield'}, 'recipient');
        }
      } else if (after.character === 'angel') {
        // Miracle is a targeted protection ultimate. Put its strong wings/halo on the
        // player whose invulnerability actually increased, rather than on Angel merely
        // because Angel's own ultimate timer is used for charge lock.
        let target=null, bestIncrease=-Infinity;
        for (const candidate of afterById.values()) {
          if (!candidate.alive || candidate.team !== after.team) continue;
          const prevCandidate=beforeById.get(candidate.id);
          const increase=Number(candidate.invulnerableMs||0)-Number(prevCandidate?.invulnerableMs||0);
          if (Number(candidate.invulnerableMs||0)>0 && increase>bestIncrease) { target=candidate; bestIncrease=increase; }
        }
        if (target && bestIncrease > 100) addCharacterUltimateFx({...target, character:'angel'}, 'recipient');
        else addCharacterUltimateFx(after, 'cast');
      } else {
        addCharacterUltimateFx(after, 'cast');
      }
      playCharacterUltimateCue(after.character, after.id===myId);
      if (after.id===myId) pulseUltimateButton();
    }
  }
}

const PLAYER_ACCOUNT_KEY = 'schoolLinePlayerAccountId';
let playerAccountDirectory = [];
let accountAdminPinCache = '';

async function refreshPlayerAccounts() {
  try {
    const res = await fetch('/player-accounts.json', { cache:'no-store' });
    if (!res.ok) throw new Error('accounts');
    const data = await res.json();
    playerAccountDirectory = Array.isArray(data.accounts) ? data.accounts : [];
    const select = $('accountSelect');
    if (!select) return;
    const remembered = localStorage.getItem(PLAYER_ACCOUNT_KEY) || select.value || '';
    select.innerHTML = '<option value="">이름 선택</option>';
    for (const account of playerAccountDirectory) {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = account.role === 'teacher' ? `${account.name} (교사)` : account.name;
      select.appendChild(option);
    }
    if (playerAccountDirectory.some(a => a.id === remembered)) select.value = remembered;
  } catch (_) {
    $('joinError').textContent = '고정 계정 목록을 불러오지 못했습니다. 새로고침해주세요.';
  }
}
refreshPlayerAccounts();
setInterval(() => { if (!myId && !spectatorMode) refreshPlayerAccounts(); }, 30000);
$('accountPinInput')?.addEventListener('input', e => { e.target.value = String(e.target.value || '').replace(/\D/g,'').slice(0,4); });
$('accountSelect')?.addEventListener('change', e => {
  if (e.target.value) localStorage.setItem(PLAYER_ACCOUNT_KEY, e.target.value);
});


const RESUME_TOKEN_KEY = 'schoolLineResumeToken';
function updateAccessUi(open, message='') {
  schoolLineAccessOpen = !!open;
  accessLockActive = !schoolLineAccessOpen;
  document.body.classList.remove('access-checking');
  document.body.classList.toggle('access-locked', accessLockActive);
  $('accessLockScreen')?.classList.toggle('hidden', schoolLineAccessOpen);
  if ($('accessLockMessage')) $('accessLockMessage').textContent = schoolLineAccessOpen
    ? ''
    : (message || '관리자가 입장을 제한했습니다.');
  const status = $('accessAdminStatus');
  if (status) {
    status.textContent = schoolLineAccessOpen ? '🟢 현재 상태: 이용 가능' : '🔴 현재 상태: 이용 불가';
    status.classList.toggle('open', schoolLineAccessOpen);
    status.classList.toggle('locked', !schoolLineAccessOpen);
  }
  if ($('accessOpenButton')) $('accessOpenButton').disabled = schoolLineAccessOpen;
  if ($('accessLockButton')) $('accessLockButton').disabled = !schoolLineAccessOpen;
  for (const id of ['resumeButton','spectatorJoinButton','refreshRoomsButton']) {
    const el = $(id);
    if (el) el.disabled = !schoolLineAccessOpen;
  }
  updateRoomCreationAvailability();
}

function resetClientForAccessLock(message='') {
  updateAccessUi(false, message);
  resetPostGameSequence();
  stopBgm();
  stopBeamHum();
  clearResumeCredentials();
  myId = null;
  spectatorMode = false;
  clearLiveProjectileRegistry();
  state = null;
  config = null;
  selectedTargetId = null;
  document.body.classList.remove('spectator-mode');
  $('spectatorBadge')?.classList.add('hidden');
  show('join');
}

async function refreshAccessStatus() {
  if (accessStatusRequestInFlight) return;
  if (ws && ws.readyState === WebSocket.OPEN && (myId || spectatorMode)) return; // Active sessions receive an immediate server push on lock.
  accessStatusRequestInFlight = true;
  try {
    const res = await fetch('/access-status.json', { cache:'no-store' });
    if (!res.ok) throw new Error('status');
    const data = await res.json();
    if (!data.open && schoolLineAccessOpen) resetClientForAccessLock('관리자가 입장을 제한했습니다.');
    else updateAccessUi(!!data.open);
  } catch (_) {
    if (document.body.classList.contains('access-checking')) {
      updateAccessUi(false, '서버 이용 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.');
    }
  } finally {
    accessStatusRequestInFlight = false;
  }
}

function openAccessAdmin() {
  $('accessAdminMessage').textContent = '';
  $('accessAdminOverlay').classList.remove('hidden');
  setTimeout(() => $('accessAdminPin')?.focus(), 0);
}
function closeAccessAdmin() {
  $('accessAdminOverlay').classList.add('hidden');
  $('accessAdminMessage').textContent = '';
  if ($('accountAdminMessage')) $('accountAdminMessage').textContent = '';
  if ($('accountAdminList')) $('accountAdminList').classList.add('hidden');
  accountAdminPinCache = '';
  if ($('accessAdminPin')) $('accessAdminPin').value = '';
}

async function submitAccessControl(action) {
  const pin = String($('accessAdminPin')?.value || '').replace(/\D/g, '').slice(0, 4);
  if (pin.length !== 4) {
    $('accessAdminMessage').textContent = '관리자 비밀번호 4자리를 입력하세요.';
    return;
  }
  const buttons = [$('accessOpenButton'), $('accessLockButton')].filter(Boolean);
  buttons.forEach(btn => btn.disabled = true);
  $('accessAdminMessage').textContent = '처리 중...';
  try {
    const res = await fetch('/admin/access-control', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      cache:'no-store',
      body:JSON.stringify({ pin, action })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      $('accessAdminMessage').textContent = data.message || '이용 상태를 변경하지 못했습니다.';
      updateAccessUi(!!data.open);
      return;
    }
    if (action === 'lock') resetClientForAccessLock(data.message || '관리자가 입장을 제한했습니다.');
    else updateAccessUi(true);
    $('accessAdminMessage').textContent = data.message || (action === 'open' ? '스쿨라인을 열었습니다.' : '스쿨라인을 잠갔습니다.');
    accountAdminPinCache = pin;
    if (action === 'open' && $('accountAdminList')?.classList.contains('hidden')) setTimeout(closeAccessAdmin, 450);
  } catch (_) {
    $('accessAdminMessage').textContent = '서버에 연결하지 못했습니다.';
  } finally {
    if ($('accessOpenButton')) $('accessOpenButton').disabled = schoolLineAccessOpen;
    if ($('accessLockButton')) $('accessLockButton').disabled = !schoolLineAccessOpen;
  }
}

$('accessAdminButton').onclick = openAccessAdmin;
$('accessLockAdminButton').onclick = openAccessAdmin;
$('accessAdminClose').onclick = closeAccessAdmin;
$('accessAdminOverlay').addEventListener('click', e => { if (e.target === $('accessAdminOverlay')) closeAccessAdmin(); });
$('accessOpenButton').onclick = () => submitAccessControl('open');
$('accessLockButton').onclick = () => submitAccessControl('lock');
$('accessAdminPin').addEventListener('input', e => { e.target.value = String(e.target.value || '').replace(/\D/g, '').slice(0, 4); });
$('accessAdminPin').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  submitAccessControl(schoolLineAccessOpen ? 'lock' : 'open');
});

function renderAccountAdminList(accounts) {
  const root = $('accountAdminList');
  if (!root) return;
  root.innerHTML = '';
  for (const account of accounts || []) {
    const row = document.createElement('div');
    row.className = 'account-admin-row';
    row.dataset.accountId = account.id;
    row.innerHTML = `<span class="account-admin-id">${escapeHtml(account.id)}${account.role === 'teacher' ? ' · 교사' : ''}</span><input class="account-admin-name" maxlength="12" value="${escapeHtml(account.name || '')}" aria-label="${escapeHtml(account.id)} 이름"><input class="account-admin-pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" value="${escapeHtml(account.pin || '')}" aria-label="${escapeHtml(account.id)} PIN"><button type="button">저장</button>`;
    const pinInput = row.querySelector('.account-admin-pin');
    pinInput.addEventListener('input', e => { e.target.value = String(e.target.value || '').replace(/\D/g,'').slice(0,4); });
    row.querySelector('button').onclick = () => saveAccountAdminRow(row);
    root.appendChild(row);
  }
  root.classList.remove('hidden');
}

async function loadAccountAdminList() {
  const adminPin = String($('accessAdminPin')?.value || accountAdminPinCache || '').replace(/\D/g,'').slice(0,4);
  if (adminPin.length !== 4) { $('accountAdminMessage').textContent = '위 관리자 비밀번호 4자리를 먼저 입력하세요.'; return; }
  $('accountAdminMessage').textContent = '계정 불러오는 중...';
  try {
    const res = await fetch('/admin/player-accounts', { method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', body:JSON.stringify({ adminPin, action:'list' }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) { $('accountAdminMessage').textContent = data.message || '계정을 불러오지 못했습니다.'; return; }
    accountAdminPinCache = adminPin;
    renderAccountAdminList(data.accounts || []);
    $('accountAdminMessage').textContent = 'PIN을 바로 확인하거나 수정할 수 있습니다.';
  } catch (_) { $('accountAdminMessage').textContent = '서버에 연결하지 못했습니다.'; }
}

async function saveAccountAdminRow(row) {
  const accountId = row?.dataset?.accountId;
  const name = String(row?.querySelector('.account-admin-name')?.value || '').trim();
  const pin = String(row?.querySelector('.account-admin-pin')?.value || '').replace(/\D/g,'').slice(0,4);
  if (!accountId || !name || pin.length !== 4) { $('accountAdminMessage').textContent = '이름과 숫자 4자리 PIN을 확인하세요.'; return; }
  if (accountAdminPinCache.length !== 4) { $('accountAdminMessage').textContent = '관리자 인증을 다시 해주세요.'; return; }
  const button = row.querySelector('button'); if (button) button.disabled = true;
  try {
    const res = await fetch('/admin/player-accounts', { method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', body:JSON.stringify({ adminPin:accountAdminPinCache, action:'update', accountId, name, pin }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) { $('accountAdminMessage').textContent = data.message || '계정을 저장하지 못했습니다.'; return; }
    $('accountAdminMessage').textContent = data.message || '저장했습니다.';
    await refreshPlayerAccounts();
  } catch (_) { $('accountAdminMessage').textContent = '서버에 연결하지 못했습니다.'; }
  finally { if (button) button.disabled = false; }
}
$('accountAdminLoadButton').onclick = loadAccountAdminList;
refreshAccessStatus();
setInterval(refreshAccessStatus, 3000);

const RESUME_ROOM_KEY = 'schoolLineResumeRoom';
const RESUME_ROOM_LABEL_KEY = 'schoolLineResumeRoomLabel';

function getResumeCredentials() {
  const resumeToken = String(localStorage.getItem(RESUME_TOKEN_KEY) || '');
  const room = String(localStorage.getItem(RESUME_ROOM_KEY) || '');
  const roomLabel = String(localStorage.getItem(RESUME_ROOM_LABEL_KEY) || '진행 중인 방');
  return resumeToken && room ? { resumeToken, room, roomLabel } : null;
}
function saveResumeCredentials(room, resumeToken, roomLabel='') {
  if (!room || !resumeToken) return;
  localStorage.setItem(RESUME_ROOM_KEY, room);
  localStorage.setItem(RESUME_TOKEN_KEY, resumeToken);
  if (roomLabel) localStorage.setItem(RESUME_ROOM_LABEL_KEY, roomLabel);
  refreshResumeButton();
}
function clearResumeCredentials() {
  localStorage.removeItem(RESUME_ROOM_KEY);
  localStorage.removeItem(RESUME_ROOM_LABEL_KEY);
  localStorage.removeItem(RESUME_TOKEN_KEY);
  refreshResumeButton();
}
function refreshResumeButton() {
  const btn = $('resumeButton');
  const hint = $('resumeHint');
  if (!btn || !hint) return;
  const saved = getResumeCredentials();
  btn.classList.toggle('hidden', !saved);
  hint.classList.toggle('hidden', !saved);
  if (saved) {
    btn.textContent = `↩️ ${saved.roomLabel} 경기로 돌아가기`;
    hint.textContent = '경기 중 연결이 끊겼다면 이 버튼으로 복귀할 수 있습니다. 버튼이 없어도 같은 방에 같은 계정과 PIN으로 다시 입장하면 기존 자리로 돌아갑니다.';
  }
}
refreshResumeButton();

function rememberJoinedTeam(team) {
  if (team === 'A' || team === 'B') localStorage.setItem('schoolLineTeam', team);
}

function roomStateLabel(entry) {
  if (!entry) return '';
  if (entry.state === 'lobby') return '대기 중';
  if (entry.state === 'draft') return '밴·픽 중';
  if (entry.state === 'ready') return '경쟁전 준비 중';
  if (entry.state === 'playing') return '게임 중';
  if (entry.state === 'ended') {
    const seconds = Math.max(0, Math.ceil(Number(entry.closeTimeLeft || 0)));
    return seconds > 0 ? `종료 · ${seconds}초 후 삭제` : '종료 중';
  }
  return String(entry.state || '');
}
function roomModeLabel(mode) { return mode === 'competitive' ? '🏆 경쟁전' : '🎮 일반전'; }
function updateRoomCreationAvailability() {
  const maxRooms = Math.max(1, Number(roomDirectoryMaxRooms) || 5);
  const atLimit = Array.isArray(roomDirectory) && roomDirectory.length >= maxRooms;
  for (const id of ['createCasualRoomButton','createCompetitiveRoomButton']) {
    const btn = $(id);
    if (btn) btn.disabled = !schoolLineAccessOpen || atLimit;
  }
  const help = $('roomCreateHelp');
  if (help) help.textContent = atLimit
    ? `현재 방 ${maxRooms}개가 모두 사용 중입니다. 기존 방이 닫히면 새 방을 만들 수 있습니다.`
    : `최대 ${maxRooms}개 방까지 만들 수 있습니다. 일반전은 자유 인원, 경쟁전은 A 4명 / B 4명이 필요합니다.`;
}
function renderRoomDirectory() {
  const root = $('openRoomList');
  if (!root) return;
  const rooms = Array.isArray(roomDirectory) ? roomDirectory : [];
  updateRoomCreationAvailability();
  if (!rooms.length) {
    root.innerHTML = '<div class="open-room-empty">현재 열린 방이 없습니다. 새 방을 만들어 첫 게임을 시작해 보세요.</div>';
  } else {
    root.innerHTML = '';
    for (const entry of rooms) {
      const card = document.createElement('article');
      card.className = `open-room-card ${entry.mode === 'competitive' ? 'competitive' : 'casual'}${entry.joinable ? '' : ' unavailable'}`;
      const teamCount = `A ${Number(entry.countA||0)}/4 · B ${Number(entry.countB||0)}/4`;
      const countText = entry.mode === 'competitive' ? `${Number(entry.count||0)}/8명` : `${Number(entry.count||0)}명`;
      const fire = entry.oneMore ? '<div class="open-room-hot">🔥 1명만 더 오면 시작!</div>' : '';
      const meta = document.createElement('div');
      meta.className = 'open-room-meta';
      meta.innerHTML = `<div class="open-room-title"><b>${escapeHtml(entry.name || `방 ${entry.number||''}`)}</b><span class="open-room-mode">${roomModeLabel(entry.mode)}</span></div><div class="open-room-sub">${countText} · ${teamCount} · ${escapeHtml(roomStateLabel(entry))}</div>${fire}`;
      const actions = document.createElement('div');
      actions.className = 'open-room-team-actions';
      for (const team of ['A','B']) {
        const count = team === 'A' ? Number(entry.countA||0) : Number(entry.countB||0);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `open-room-join ${team === 'A' ? 'team-a-choice' : 'team-b-choice'}`;
        const teamFull = count >= 4;
        btn.disabled = !schoolLineAccessOpen || !entry.joinable || teamFull;
        btn.textContent = !entry.joinable ? '입장 불가' : teamFull ? `${team}팀 4/4` : `${team === 'A' ? '🔵' : '🔴'} ${team}팀 입장 ${count}/4`;
        btn.onclick = () => joinExistingRoom(entry.id, team);
        actions.appendChild(btn);
      }
      card.append(meta, actions);
      root.appendChild(card);
    }
  }
  const select = $('spectatorRoomSelect');
  if (select) {
    const current = select.value;
    select.innerHTML = '<option value="">관전할 방 선택</option>';
    for (const entry of rooms.filter(r => r.state !== 'ended')) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = `${entry.name} · ${entry.mode === 'competitive' ? '경쟁전' : '일반전'} · ${roomStateLabel(entry)}`;
      select.appendChild(option);
    }
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }
}
async function refreshRoomDirectory() {
  if (roomDirectoryRequestInFlight || accessLockActive) return;
  roomDirectoryRequestInFlight = true;
  const status = $('openRoomRefreshStatus');
  try {
    const res = await fetch('/rooms.json', { cache:'no-store' });
    if (!res.ok) throw new Error('rooms');
    const data = await res.json();
    roomDirectory = Array.isArray(data.rooms) ? data.rooms : [];
    roomDirectoryMaxRooms = Math.max(1, Number(data.maxRooms) || 5);
    if (status) status.textContent = `현재 ${roomDirectory.length}/${roomDirectoryMaxRooms}개`;
    renderRoomDirectory();
  } catch (_) {
    if (status) status.textContent = '목록을 불러오지 못했습니다.';
  } finally {
    roomDirectoryRequestInFlight = false;
  }
}
function selectedAccountCredentials() {
  const accountId = String($('accountSelect')?.value || '').trim();
  const pin = String($('accountPinInput')?.value || '').replace(/\D/g,'').slice(0,4);
  if (!accountId) { $('joinError').textContent = '내 이름을 선택하세요.'; return null; }
  if (pin.length !== 4) { $('joinError').textContent = '4자리 PIN을 입력하세요.'; return null; }
  localStorage.setItem(PLAYER_ACCOUNT_KEY, accountId);
  return { accountId, pin };
}
function createRoom(mode) {
  ensureAudio();
  updateSoundButton();
  $('joinError').textContent = '';
  const credentials = selectedAccountCredentials();
  if (!credentials) return;
  openConnection(() => ws.send(JSON.stringify({ type:'create_room', ...credentials, team:'A', mode })));
}
function joinExistingRoom(roomId, team) {
  ensureAudio();
  updateSoundButton();
  $('joinError').textContent = '';
  const credentials = selectedAccountCredentials();
  if (!credentials) return;
  if (team !== 'A' && team !== 'B') { $('joinError').textContent = '입장할 팀을 선택하세요.'; return; }
  const entry = roomDirectory.find(room => room.id === roomId);
  if (!entry || !entry.joinable) { $('joinError').textContent = '이 방은 더 이상 입장할 수 없습니다. 방 목록을 새로고침해주세요.'; refreshRoomDirectory(); return; }
  const count = team === 'A' ? Number(entry.countA||0) : Number(entry.countB||0);
  if (count >= 4) { $('joinError').textContent = `${team}팀은 이미 4명입니다.`; refreshRoomDirectory(); return; }
  rememberJoinedTeam(team);
  openConnection(() => ws.send(JSON.stringify({ type:'join_room', ...credentials, roomId, team })));
}
$('createCasualRoomButton').onclick = () => createRoom('casual');
$('createCompetitiveRoomButton').onclick = () => createRoom('competitive');
$('refreshRoomsButton').onclick = refreshRoomDirectory;
$('leaveRoomButton').onclick = () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  $('leaveRoomButton').disabled = true;
  ws.send(JSON.stringify({ type:'leave_room' }));
  setTimeout(() => { if ($('leaveRoomButton')) $('leaveRoomButton').disabled = false; }, 1200);
};

refreshRoomDirectory();
setInterval(() => { if (!myId && !spectatorMode) refreshRoomDirectory(); }, 1000);

function show(which) {
  joinScreen.classList.toggle('hidden', which !== 'join');
  lobbyScreen.classList.toggle('hidden', which !== 'lobby');
  draftScreen.classList.toggle('hidden', which !== 'draft');
  gameScreen.classList.toggle('hidden', which !== 'game');
}

function wsUrl() { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`; }

function openConnection(onOpen) {
  if (accessLockActive) { $('joinError').textContent = '관리자가 입장을 제한했습니다.'; return; }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  adminStatsAuthorized = false;
  lastAdminStatsData = null;
  selectedCompetitiveStatsVersion = null;
  ws = new WebSocket(wsUrl());
  ws.onopen = onOpen;
  
function expandCompactPlayerRow(p) {
  if (!Array.isArray(p)) return p;
  const flags = Number(p[17] || 0);
  const out = {
    id:p[0], name:p[1], team:p[2] === 1 ? 'B' : 'A', character:p[3] || null,
    x:Number(p[4] || 0), y:Number(p[5] || 0), hp:Number(p[6] || 0), maxHp:Number(p[7] || 0),
    shield:Number(p[8] || 0), maxShield:Number(p[9] || 0), alive:!!p[10],
    aimX:Number(p[11] || 0), aimY:Number(p[12] || 0),
    shotSeq:Number(p[13] || 0), projectileHitSeq:Number(p[14] || 0), healHitSeq:Number(p[15] || 0), abilityUseSeq:Number(p[16] || 0),
    connected:p[18] !== 0
  };
  const setNum = (key, index) => { if (p[index] != null) out[key] = Number(p[index] || 0); };
  if (flags & (1 << 0)) out.burning = true;
  if (flags & (1 << 1)) out.poisoned = true;
  if (flags & (1 << 2)) out.radiated = true;
  if (flags & (1 << 3)) out.tailwind = true;
  if (flags & (1 << 4)) out.frozen = true;
  if (flags & (1 << 5)) out.stunned = true;
  if (flags & (1 << 6)) out.invulnerable = true;
  if (flags & (1 << 7)) out.diaForm = true;
  if (flags & (1 << 8)) out.sprint = true;
  if (flags & (1 << 9)) out.jetBoost = true;
  if (flags & (1 << 10)) out.bufferLinkActive = true;
  setNum('respawnMs', 19); setNum('shieldMs', 20); setNum('invulnerableMs', 21);
  if (p[22]) out.burnSourceId = p[22];
  if (p[23]) out.radiationSourceId = p[23];
  setNum('diaFormMs', 24); setNum('diaCooldownMs', 25); setNum('sprintMs', 26); setNum('sprintCooldownMs', 27);
  setNum('windTailwindMs', 28); setNum('windTailwindCooldownMs', 29); setNum('angelBlessCooldownMs', 30);
  if (p[31] != null) out.shieldAbilityCharges = Number(p[31] || 0);
  setNum('shieldRechargeMs', 32); setNum('jetBoostMs', 33); setNum('jetBoostStartX', 34); setNum('jetBoostStartY', 35);
  setNum('jetBoostEndX', 36); setNum('jetBoostEndY', 37); setNum('jetBoostDistance', 38); setNum('jetBoostCooldownMs', 39);
  setNum('jetShieldMs', 40); setNum('reactorOutput', 41);
  if (p[42]) out.bufferTargetId = p[42];
  if (p[43]) out.lastHealTargetId = p[43];
  if (p[44]) out.lastAbilityTargetId = p[44];
  if (p[45] != null) out.ultimateCharge = Number(p[45] || 0);
  if (p[46] != null) out.ultimateUseSeq = Number(p[46] || 0);
  if (p[47] != null) out.ultimateActiveMs = Number(p[47] || 0);
  return out;
}


function expandCompactPlayerRowC5(p, meta) {
  if (!Array.isArray(p)) return p;
  const m = Array.isArray(meta) ? meta : [];
  const flags = Number(p[13] || 0);
  const out = {
    id:m[0] || null, name:m[1] || '', team:m[2] === 1 ? 'B' : 'A', character:m[3] || null,
    x:Number(p[0] || 0), y:Number(p[1] || 0), hp:Number(p[2] || 0), maxHp:Number(p[3] || 0),
    shield:Number(p[4] || 0), maxShield:Number(p[5] || 0), alive:!!p[6],
    aimX:Number(p[7] || 0), aimY:Number(p[8] || 0),
    shotSeq:Number(p[9] || 0), projectileHitSeq:Number(p[10] || 0), healHitSeq:Number(p[11] || 0), abilityUseSeq:Number(p[12] || 0),
    connected:p[14] !== 0
  };
  const setNum = (key, index) => { if (p[index] != null) out[key] = Number(p[index] || 0); };
  if (flags & (1 << 0)) out.burning = true;
  if (flags & (1 << 1)) out.poisoned = true;
  if (flags & (1 << 2)) out.radiated = true;
  if (flags & (1 << 3)) out.tailwind = true;
  if (flags & (1 << 4)) out.frozen = true;
  if (flags & (1 << 5)) out.stunned = true;
  if (flags & (1 << 6)) out.invulnerable = true;
  if (flags & (1 << 7)) out.diaForm = true;
  if (flags & (1 << 8)) out.sprint = true;
  if (flags & (1 << 9)) out.jetBoost = true;
  if (flags & (1 << 10)) out.bufferLinkActive = true;
  if (flags & (1 << 11)) out.beamActive = true;
  if (flags & (1 << 12)) out.beamDidDamage = true;
  setNum('respawnMs', 15); setNum('shieldMs', 16); setNum('invulnerableMs', 17);
  if (p[18]) out.burnSourceId = p[18];
  if (p[19]) out.radiationSourceId = p[19];
  setNum('diaFormMs', 20); setNum('diaCooldownMs', 21); setNum('sprintMs', 22); setNum('sprintCooldownMs', 23);
  setNum('windTailwindMs', 24); setNum('windTailwindCooldownMs', 25); setNum('angelBlessCooldownMs', 26);
  if (p[27] != null) out.shieldAbilityCharges = Number(p[27] || 0);
  setNum('shieldRechargeMs', 28); setNum('jetBoostMs', 29); setNum('jetBoostStartX', 30); setNum('jetBoostStartY', 31);
  setNum('jetBoostEndX', 32); setNum('jetBoostEndY', 33); setNum('jetBoostDistance', 34); setNum('jetBoostCooldownMs', 35);
  setNum('jetShieldMs', 36); setNum('reactorOutput', 37);
  if (p[38]) out.bufferTargetId = p[38];
  if (p[39]) out.lastHealTargetId = p[39];
  if (p[40]) out.lastAbilityTargetId = p[40];
  if (p[41] != null) out.ultimateCharge = Number(p[41] || 0);
  if (p[42] != null) out.ultimateUseSeq = Number(p[42] || 0);
  if (p[43] != null) out.ultimateActiveMs = Number(p[43] || 0);
  return out;
}

function expandCompactPlayerRowC6(p, meta) {
  if (!Array.isArray(p)) return p;
  const m = Array.isArray(meta) ? meta : [];
  const flags = Number(p[13] || 0);
  const out = {
    id:m[0] || null, name:m[1] || '', team:m[2] === 1 ? 'B' : 'A', character:m[3] || null,
    x:Number(p[0] || 0), y:Number(p[1] || 0), hp:Number(p[2] || 0), maxHp:Number(p[3] || 0),
    shield:Number(p[4] || 0), maxShield:Number(p[5] || 0), alive:!!p[6],
    aimX:Number(p[7] || 0), aimY:Number(p[8] || 0),
    shotSeq:Number(p[9] || 0), projectileHitSeq:Number(p[10] || 0), healHitSeq:Number(p[11] || 0), abilityUseSeq:Number(p[12] || 0),
    connected:p[14] !== 0
  };
  if (flags & (1 << 0)) out.burning = true;
  if (flags & (1 << 1)) out.poisoned = true;
  if (flags & (1 << 2)) out.radiated = true;
  if (flags & (1 << 3)) out.tailwind = true;
  if (flags & (1 << 4)) out.frozen = true;
  if (flags & (1 << 5)) out.stunned = true;
  if (flags & (1 << 6)) out.invulnerable = true;
  if (flags & (1 << 7)) out.diaForm = true;
  if (flags & (1 << 8)) out.sprint = true;
  if (flags & (1 << 9)) out.jetBoost = true;
  if (flags & (1 << 10)) out.bufferLinkActive = true;
  if (flags & (1 << 11)) out.beamActive = true;
  if (flags & (1 << 12)) out.beamDidDamage = true;

  const ext = Array.isArray(p[15]) ? p[15] : [];
  for (let i = 0; i + 1 < ext.length; i += 2) {
    const tag = Number(ext[i]);
    const value = ext[i + 1];
    switch (tag) {
      case 0: out.respawnMs = Number(value || 0); break;
      case 1: out.shieldMs = Number(value || 0); break;
      case 2: out.invulnerableMs = Number(value || 0); break;
      case 3: if (value) out.burnSourceId = value; break;
      case 4: if (value) out.radiationSourceId = value; break;
      case 5: out.diaFormMs = Number(value || 0); break;
      case 6: out.diaCooldownMs = Number(value || 0); break;
      case 7: out.sprintMs = Number(value || 0); break;
      case 8: out.sprintCooldownMs = Number(value || 0); break;
      case 9: out.windTailwindMs = Number(value || 0); break;
      case 10: out.windTailwindCooldownMs = Number(value || 0); break;
      case 11: out.angelBlessCooldownMs = Number(value || 0); break;
      case 12: out.shieldAbilityCharges = Number(value || 0); break;
      case 13: out.shieldRechargeMs = Number(value || 0); break;
      case 14: out.jetBoostMs = Number(value || 0); break;
      case 15: out.jetBoostStartX = Number(value || 0); break;
      case 16: out.jetBoostStartY = Number(value || 0); break;
      case 17: out.jetBoostEndX = Number(value || 0); break;
      case 18: out.jetBoostEndY = Number(value || 0); break;
      case 19: out.jetBoostDistance = Number(value || 0); break;
      case 20: out.jetBoostCooldownMs = Number(value || 0); break;
      case 21: out.jetShieldMs = Number(value || 0); break;
      case 22: out.reactorOutput = Number(value || 0); break;
      case 23: if (value) out.bufferTargetId = value; break;
      case 24: if (value) out.lastHealTargetId = value; break;
      case 25: if (value) out.lastAbilityTargetId = value; break;
      case 26: out.ultimateCharge = Number(value || 0); break;
      case 27: out.ultimateUseSeq = Number(value || 0); break;
      case 28: out.ultimateActiveMs = Number(value || 0); break;
      case 29: out.pendingUltimateMs = Number(value || 0); break;
      case 30: if (value) out.pendingUltimateId = value; break;
      default: break;
    }
  }
  return out;
}

function expandWireMessage(msg) {
  if (!msg) return msg;
  if (msg.type !== 'state') return msg;
  if (msg.wireFormat === 'd1') {
    msg.players = (msg.players || []).map(p => ({ id:p[0], name:p[1], team:p[2], character:p[3], connected:!!p[4] }));
    delete msg.wireFormat;
    return msg;
  }
  if (msg.wireFormat !== 'c1' && msg.wireFormat !== 'c2' && msg.wireFormat !== 'c3' && msg.wireFormat !== 'c4' && msg.wireFormat !== 'c5' && msg.wireFormat !== 'c6') return msg;
  const wireFormat = msg.wireFormat;
  if (wireFormat === 'c5' || wireFormat === 'c6') {
    if (Array.isArray(msg.playerMeta)) livePlayerMeta = msg.playerMeta.map(row => Array.isArray(row) ? row.slice() : row);
    msg.players = (msg.players || []).map((row, i) => wireFormat === 'c6' ? expandCompactPlayerRowC6(row, livePlayerMeta[i]) : expandCompactPlayerRowC5(row, livePlayerMeta[i]));
    delete msg.playerMeta;
  } else if (wireFormat === 'c3' || wireFormat === 'c4') msg.players = (msg.players || []).map(expandCompactPlayerRow);
  msg.projectiles = (msg.projectiles || []).map(p => ({
    id:p[0], x:p[1], y:p[2], radius:p[3], type:p[4], team:p[5], character:p[6],
    reactorFxBand:p[7] == null ? null : p[7]
  }));
  if (wireFormat === 'c4' || wireFormat === 'c5' || wireFormat === 'c6') {
    applyProjectileNetworkUpdate(msg);
    delete msg.projectileEvents;
    delete msg.projectileSync;
  } else if (wireFormat === 'c2' || wireFormat === 'c3') {
    for (const volley of (msg.sprayVolleys || [])) {
      const volleyId = volley[0];
      const team = volley[1] ? 'B' : 'A';
      for (const lane of (Array.isArray(volley[2]) ? volley[2] : [])) {
        const laneCode = Number(lane[0] || 0);
        const sprayDef = config?.characters?.spray || {};
        const radius = laneCode === 0
          ? Number(sprayDef.projectileRadius || 0.32)
          : Number(sprayDef.spraySideProjectileRadius || 0.20);
        msg.projectiles.push({
          id:`${volleyId}:${laneCode}`,
          x:Number(lane[1] || 0), y:Number(lane[2] || 0), radius,
          type:'attack', team, character:'spray'
        });
      }
    }
    applyCannonNetworkUpdate(msg);
    delete msg.sprayVolleys;
    delete msg.cannonEvents;
    delete msg.cannonSync;
  }
  if (wireFormat === 'c5' || wireFormat === 'c6') {
    // Beam geometry is reconstructed visually from player position/aim + static map.
    msg.beams = [];
  } else {
    msg.beams = (msg.beams || []).map(b => ({
      ownerId:b[0], team:b[1], character:b[2], x1:b[3], y1:b[4], x2:b[5], y2:b[6],
      healedId:b[7] || null, hitEnemyId:b[8] || null,
      impact:Array.isArray(b[9]) ? {x:b[9][0], y:b[9][1]} : null,
      didDamage:!!b[10]
    }));
  }
  delete msg.wireFormat;
  return msg;
}

ws.onmessage = ev => handleMessage(expandWireMessage(JSON.parse(ev.data)));
  ws.onerror = () => $('joinError').textContent = '서버에 연결하지 못했습니다.';
  ws.onclose = () => {
    if (accessLockActive) return;
    if (myId || spectatorMode) {
      alert(spectatorMode ? '서버 연결이 끊겼습니다.' : '서버 연결이 끊겼습니다. 돌아가기 버튼을 누르거나, 같은 방에 같은 이름으로 다시 입장하면 기존 자리로 복귀합니다.');
      location.reload();
    }
  };
}

$('resumeButton').onclick = () => {
  ensureAudio();
  updateSoundButton();
  $('joinError').textContent = '';
  const saved = getResumeCredentials();
  if (!saved) { refreshResumeButton(); return; }
  openConnection(() => ws.send(JSON.stringify({ type:'resume', room:saved.room, resumeToken:saved.resumeToken })));
};

$('spectatorJoinButton').onclick = () => {
  ensureAudio();
  updateSoundButton();
  $('joinError').textContent = '';
  const pin = String($('spectatorPinInput').value || '').replace(/\D/g, '').slice(0, 4);
  const roomId = String($('spectatorRoomSelect')?.value || '');
  if (!roomId) { $('joinError').textContent = '관전할 방을 선택하세요.'; return; }
  if (pin.length !== 4) {
    $('joinError').textContent = '관전자 PIN 4자리를 입력하세요.';
    return;
  }
  openConnection(() => ws.send(JSON.stringify({ type:'spectator_join', room:roomId, pin })));
};

function handleMessage(msg) {
  if (msg.type === 'room_closed') {
    const message = msg.message || '경기가 종료되어 방이 자동으로 닫혔습니다.';
    resetPostGameSequence();
    stopBgm();
    stopBeamHum();
    hideCharacterIntroTip();
    hidePerkChoicePanel();
    clearResumeCredentials();
    clearLiveProjectileRegistry();
    playerMotionTracks.clear();
    selectedTargetId = null;
    myId = null;
    spectatorMode = false;
    state = null;
    config = null;
    document.body.classList.remove('spectator-mode');
    $('spectatorBadge')?.classList.add('hidden');
    show('join');
    $('joinError').textContent = message;
    refreshRoomDirectory();
    return;
  }
  if (msg.type === 'left_room') {
    resetPostGameSequence();
    stopBgm();
    stopBeamHum();
    hideCharacterIntroTip();
    hidePerkChoicePanel();
    clearResumeCredentials();
    clearLiveProjectileRegistry();
    playerMotionTracks.clear();
    selectedTargetId = null;
    myId = null;
    spectatorMode = false;
    state = null;
    config = null;
    document.body.classList.remove('spectator-mode');
    $('spectatorBadge')?.classList.add('hidden');
    $('characterPanel')?.classList.remove('hidden');
    show('join');
    $('joinError').textContent = msg.message || '방에서 나왔습니다.';
    const oldWs = ws;
    ws = null;
    if (oldWs && (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING)) {
      try { oldWs.close(); } catch (_) {}
    }
    refreshRoomDirectory();
    return;
  }
  if (msg.type === 'leave_room_error') {
    const hint = $('modeStartHint');
    if (hint) hint.textContent = `⚠️ ${msg.message || '지금은 방에서 나갈 수 없습니다.'}`;
    return;
  }
  if (msg.type === 'access_locked') {
    resetClientForAccessLock(msg.message || '관리자가 입장을 제한했습니다.');
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) { try { ws.close(); } catch (_) {} }
    return;
  }
  if (msg.type === 'error') {
    $('joinError').textContent = msg.message;
    if (msg.code === 'resume_invalid' || msg.code === 'resume_unavailable') clearResumeCredentials();
    if (msg.code === 'room_limit') setTimeout(refreshRoomDirectory, 0);
    if (ws) ws.close();
    return;
  }
  if (msg.type === 'joined') {
    if (msg.accountId) localStorage.setItem(PLAYER_ACCOUNT_KEY, msg.accountId);
    if ($('accountPinInput')) $('accountPinInput').value = '';
    clearLiveProjectileRegistry();
    myId = msg.id; config = msg.config; $('roomLabel').textContent = msg.room;
    saveResumeCredentials(msg.roomId || msg.room, msg.resumeToken, msg.room);
    pickerState.lobby.selected = null;
    lastLobbyPickerAvailabilityKey = null;
    const notice = $('pickNotice');
    if (notice) notice.textContent = `${msg.team}팀으로 입장했습니다. 캐릭터를 선택하세요.`;
    show('lobby'); return;
  }
  if (msg.type === 'resumed') {
    if (msg.accountId) localStorage.setItem(PLAYER_ACCOUNT_KEY, msg.accountId);
    if ($('accountPinInput')) $('accountPinInput').value = '';
    clearLiveProjectileRegistry();
    spectatorMode = false;
    document.body.classList.remove('spectator-mode');
    myId = msg.id;
    config = msg.config;
    $('roomLabel').textContent = msg.room;
    saveResumeCredentials(msg.roomId || msg.room, msg.resumeToken, msg.room);
    const notice = $('pickNotice');
    if (notice) notice.textContent = msg.recoveredByAccount ? '↩️ 같은 계정의 기존 경기 자리로 복귀했습니다.' : '↩️ 기존 경기 자리로 재접속했습니다.';
    show('lobby');
    return;
  }
  if (msg.type === 'spectator_joined') {
    clearLiveProjectileRegistry();
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
  if (msg.type === 'admin_stats_data') {
    adminStatsAuthorized = true;
    lastAdminStatsData = msg.data || null;
    selectedCompetitiveStatsVersion = msg.data?.statsVersion || selectedCompetitiveStatsVersion;
    $('competitiveStatsOverlay').classList.remove('hidden');
    renderCompetitiveStats(msg.data || {});
    return;
  }
  if (msg.type === 'admin_stats_export_data') {
    downloadCompetitiveStatsBackup(msg.data || {});
    return;
  }
  if (msg.type === 'admin_stats_error') {
    adminStatsAuthorized = false;
    lastAdminStatsData = null;
    selectedCompetitiveStatsVersion = null;
    $('competitiveStatsOverlay').classList.add('hidden');
    alert(msg.message || '관리자 통계를 열 수 없습니다.');
    return;
  }
  if (msg.type === 'rematch_error') {
    const hint = $('modeStartHint');
    if (hint) hint.textContent = `⚠️ ${msg.message || '다시 게임 준비를 시작하지 못했습니다.'}`;
    return;
  }
  if (msg.type === 'team_changed') {
    rememberJoinedTeam(msg.team);
    lastLobbyPickerAvailabilityKey = null;
    const notice = $('pickNotice');
    if (notice) notice.textContent = msg.message || `${msg.team}팀으로 이동했습니다.`;
    return;
  }
  if (msg.type === 'team_change_error') {
    const notice = $('pickNotice');
    if (notice) notice.textContent = `⚠️ ${msg.message || '팀을 변경하지 못했습니다.'}`;
    return;
  }
  if (msg.type === 'room_mode_error') {
    $('modeStartHint').textContent = `⚠️ ${msg.message || '방 모드를 변경하지 못했습니다.'}`;
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
  if (msg.type === 'ban_vote_update') {
    if (state && state.competitive && (state.state === 'draft' || state.state === 'ready')) {
      state.competitive.banVoteCounts = msg.banVoteCounts || {};
      state.competitive.myBanVote = msg.myBanVote || null;
      if (msg.activeBanTeam) state.competitive.activeBanTeam = msg.activeBanTeam;
      renderCompetitiveDraft();
    }
    return;
  }
  if (msg.type === 'perk_offer') {
    showPerkChoicePanel(msg);
    return;
  }
  if (msg.type === 'perk_selected') {
    hidePerkChoicePanel();
    return;
  }
  if (msg.type === 'heal_number') {
    showHealNumber(msg.amount);
    return;
  }
  if (msg.type === 'state') {
    const previousState = state;
    const startedPlaying = msg.state === 'playing' && (!previousState || previousState.state !== 'playing');
    if (msg.state === 'ended' && previousState?.state === 'playing') {
      hideCharacterIntroTip();
      state = msg;
      startPostGameSequence(msg);
      return;
    }
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
      if (startedPlaying && me) showCharacterIntroTip(me.character);
    } else if (state.state === 'draft' || state.state === 'ready') {
      hideCharacterIntroTip();
      clearLiveProjectileRegistry();
      hidePerkChoicePanel();
      stopBgm();
      show('draft');
      renderCompetitiveDraft();
    } else {
      hideCharacterIntroTip();
      clearLiveProjectileRegistry();
      hidePerkChoicePanel();
      stopBgm();
      lastCompetitiveRenderKey = null;
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

$('rematchPrepareButton').onclick = () => ws && ws.send(JSON.stringify({ type:'rematch_prepare' }));
$('normalStartButton').onclick = () => ws && ws.send(JSON.stringify({ type:'start' }));
$('competitiveStartButton').onclick = () => ws && ws.send(JSON.stringify({ type:'competitive_start' }));
$('setCasualModeButton').onclick = () => ws && ws.send(JSON.stringify({ type:'set_room_mode', mode:'casual' }));
$('setCompetitiveModeButton').onclick = () => ws && ws.send(JSON.stringify({ type:'set_room_mode', mode:'competitive' }));

function requestLobbyTeamChange(team) {
  if (spectatorMode || !myId || !state || state.state !== 'lobby') return;
  if (team !== 'A' && team !== 'B') return;
  const me = state.players.find(p => p.id === myId);
  if (!me || me.team === team) return;
  ws?.send(JSON.stringify({ type:'set_team', team }));
}
$('switchTeamAButton').onclick = () => requestLobbyTeamChange('A');
$('switchTeamBButton').onclick = () => requestLobbyTeamChange('B');
$('fullscreenButton').onclick = enterGameDisplayMode;
$('gameFullscreenButton').onclick = enterGameDisplayMode;
$('soundButton').onclick = toggleSound;
bindCombatActionButton($('abilityButton'), useAbility);
bindCombatActionButton($('ultimateButton'), useUltimate);
$('storyButton').onclick = openMyCharacterStory;
$('storyCloseButton').onclick = closeMyCharacterStory;
$('storyOverlay').onclick = e => { if (e.target === $('storyOverlay')) closeMyCharacterStory(); };
$('portraitLightboxClose').onclick = closePortraitLightbox;
$('portraitLightbox').onclick = e => { if (e.target === $('portraitLightbox')) closePortraitLightbox(); };
window.addEventListener('keydown', e => {
  if (e.code === 'Escape' && !$('portraitLightbox').classList.contains('hidden')) {
    e.preventDefault();
    closePortraitLightbox();
  }
});
window.addEventListener('resize', closePortraitHoverPreview);
window.addEventListener('scroll', closePortraitHoverPreview, true);
updateSoundButton();

function bindCombatActionButton(button, action) {
  if (!button || typeof action !== 'function') return;
  let suppressSyntheticClickUntil = 0;

  // Mobile browsers do not reliably synthesize `click` for a third touch while
  // move/aim pointers are already held. Fire combat actions directly from that
  // pointer without disturbing either joystick pointer capture. Desktop mouse
  // keeps the normal click path so keyboard/mouse semantics remain unchanged.
  button.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    e.preventDefault();
    e.stopPropagation();
    suppressSyntheticClickUntil = performance.now() + 750;
    action();
  });
  button.addEventListener('click', e => {
    if (performance.now() < suppressSyntheticClickUntil) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    action();
  });
}

function useAbility() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !state || state.state !== 'playing') return;
  const me = state.players.find(p => p.id === myId);
  if (!me || !me.alive) return;
  const def = config && config.characters ? config.characters[me.character] : null;
  const abilityId = def && def.abilityId;
  if (!abilityId) return;
  if (me.character === 'dia' && (me.diaForm || me.diaCooldownMs > 0)) return;
  if (me.character === 'runner' && (me.sprint || me.sprintCooldownMs > 0)) return;
  if (me.character === 'wind' && me.windTailwindCooldownMs > 0) return;
  if (me.character === 'jet' && (me.jetBoost || me.jetBoostCooldownMs > 0)) return;
  if (me.character === 'angel' && (me.angelBlessCooldownMs > 0 || !selectedTargetId)) return;
  if (me.character === 'shield' && ((Number(me.shieldAbilityCharges)||0) <= 0 || !selectedTargetId)) return;
  const payload = { type:'ability', ability:abilityId };
  if (selectedTargetId) payload.targetId = selectedTargetId;
  ws.send(JSON.stringify(payload));
}

function useUltimate() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !state || state.state !== 'playing') return;
  const me = state.players.find(p => p.id === myId);
  if (!me || !me.alive || me.stunned) return;
  const def = config && config.characters ? config.characters[me.character] : null;
  const cost = Math.max(0, Number(def && def.ultimateCost) || 0);
  if (cost <= 0 || (Number(me.ultimateCharge) || 0) + 1e-9 < cost) return;
  const payload = { type:'ultimate' };
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
  if (character === 'shield') return `보호막으로 막은 피해량 ${formatContributionNumber(stats.shieldDamageBlocked)}`;
  if (character === 'buffer') return `연결 시간 ${formatContributionNumber(stats.bufferLinkSeconds)}초`;
  if (character === 'fire') return `화상 피해량 ${formatContributionNumber(stats.burnDamage)}`;
  if (character === 'wind') return `순풍으로 가속된 팀원 ${formatContributionNumber(stats.tailwindApplications)}명`;
  if (character === 'poison') return `감소된 치유량 ${formatContributionNumber(stats.healingPrevented)}`;
  if (character === 'reactor') return `출력 에너지 3단계 유지 시간 ${formatContributionNumber(stats.reactorStage3Seconds)}초`;
  if (character === 'sniper') return `장거리 피해량 ${formatContributionNumber(stats.sniperLongRangeDamage)}`;
  if (character === 'solar') return `태양탄으로 회복한 체력 ${formatContributionNumber(stats.solarProjectileHealing)}`;
  if (character === 'angel') return `축복으로 회복한 체력 ${formatContributionNumber(stats.angelBlessingHealing)}`;
  if (character === 'dia') return `다이아폼 킬 ${formatContributionNumber(stats.diaFormKills)}회`;
  return '';
}

function resultAwardLeaders(players) {
  const metrics = [
    ['kills', '킬 최다', 'kill'],
    ['assists', '어시스트 최다', 'assist'],
    ['damage', '딜 최다', 'damage'],
    ['healing', '힐 최다', 'healing']
  ];
  const awards = new Map();
  for (const [key, label, kind] of metrics) {
    const values = players.map(p => Math.max(0, Number(p.stats?.[key]) || 0));
    const maxValue = values.length ? Math.max(...values) : 0;
    if (maxValue <= 0) continue;
    players.forEach((p, i) => {
      if (Math.abs(values[i] - maxValue) > 1e-6) return;
      if (!awards.has(p.id)) awards.set(p.id, []);
      awards.get(p.id).push({ label, kind });
    });
  }
  return awards;
}

function resultAwardBadges(awards) {
  if (!awards?.length) return '';
  return `<span class="result-awards">${awards.map(a => `<span class="result-award result-award-${a.kind}">✦ ${a.label}</span>`).join('')}</span>`;
}

function renderResultStats() {
  const root = $('resultStats');
  if (!root || !state || state.state !== 'ended') {
    if (root) root.classList.add('hidden');
    return;
  }
  root.classList.remove('hidden');
  root.innerHTML = '';
  const awardMap = resultAwardLeaders(state.players || []);

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
        <div class="result-player-name">${meta.icon} ${escapeHtml(p.name)} <span>${meta.name}</span>${resultAwardBadges(awardMap.get(p.id))}</div>
        <div class="result-player-core">킬 <b>${formatContributionNumber(stats.kills)}</b> · 어시 <b>${formatContributionNumber(stats.assists)}</b> · 데스 <b>${formatContributionNumber(stats.deaths)}</b> · 딜 <b>${formatContributionNumber(stats.damage)}</b> · 힐 <b>${formatContributionNumber(stats.healing)}</b></div>
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


function playerFromState(id) { return state && state.players ? state.players.find(p => p.id === id) : null; }
function characterLabel(id) {
  const m = CHARACTER_META[id];
  const def = characterPublicDef(id);
  return m ? `${m.icon} ${def?.name || m.name}` : (id || '—');
}
function teamPlayerOrder(team, comp) {
  const ids = comp?.teamOrders?.[team] || [];
  return ids.map(id => playerFromState(id)).filter(Boolean);
}
function draftRoleCounts(team, comp) {
  const counts = { '탱커':0, '딜러':0, '힐러':0 };
  for (const pick of (comp.picks || [])) {
    if (pick.team !== team) continue;
    const meta = CHARACTER_META[pick.character];
    const role = characterPublicDef(pick.character)?.role || meta?.role;
    if (Object.prototype.hasOwnProperty.call(counts, role)) counts[role] += 1;
  }
  return counts;
}
function renderDraftBanSummary(comp) {
  const root = $('draftBanSummary');
  root.innerHTML = '';
  for (const team of ['A','B']) {
    const ban = (comp.bans || []).find(b => b.team === team);
    const counts = draftRoleCounts(team, comp);
    const box = document.createElement('div');
    box.className = `draft-ban-box team-${team.toLowerCase()}`;
    box.innerHTML = `<div class="draft-ban-main"><b>${team === 'A' ? '🔵' : '🔴'} ${team}팀 밴</b><span class="draft-ban-value">${ban ? characterLabel(ban.character) : '대기 중'}</span></div><div class="draft-role-counts" aria-label="${team}팀 역할 구성"><span>🛡️ 탱커 <strong>${counts['탱커']}</strong></span><span>⚔️ 딜러 <strong>${counts['딜러']}</strong></span><span>💚 힐러 <strong>${counts['힐러']}</strong></span></div>`;
    root.appendChild(box);
  }
}
function renderDraftOrder(comp) {
  const root = $('draftOrder');
  root.innerHTML = '';
  const picksByPlayer = new Map((comp.picks || []).map(p => [p.playerId, p]));
  (comp.pickSequence || []).forEach((id, index) => {
    const p = playerFromState(id);
    const pick = picksByPlayer.get(id);
    const chip = document.createElement('div');
    chip.className = `draft-order-chip team-${(p?.team || 'a').toLowerCase()}` + (index < comp.pickIndex ? ' done' : '') + (comp.phase === 'pick' && index === comp.pickIndex ? ' active' : '');
    chip.innerHTML = `<strong>${index + 1}. ${p?.team || '?'} · ${escapeHtml(p?.name || id)}</strong><span>${pick ? characterLabel(pick.character) + (pick.auto ? ' · AUTO' : '') : '대기'}</span>`;
    root.appendChild(chip);
  });
}
function draftCardState(id, comp) {
  const banned = (comp.bans || []).find(b => b.character === id);
  if (banned) return { locked:true, cls:'banned', text:`🚫 ${banned.team}팀 BAN` };
  const picked = (comp.picks || []).find(p => p.character === id);
  if (picked) return { locked:true, cls:`picked-${picked.team.toLowerCase()}`, text:`${picked.team}팀 PICK` };
  return { locked:false, cls:'', text:'' };
}
function renderDraftCharacterGrid(comp) {
  const root = $('draftCharacterGrid');
  root.innerHTML = '';
  const me = !spectatorMode ? playerFromState(myId) : null;
  const canBan = !!me && comp.phase === 'ban' && me.team === comp.activeBanTeam;
  const canPick = !!me && comp.phase === 'pick' && comp.currentPickerId === myId;
  for (const roleName of ROLE_ORDER) {
    const section = document.createElement('section');
    section.className = `draft-role-section role-${roleName === '탱커' ? 'tank' : roleName === '딜러' ? 'damage' : 'healer'}`;
    const title = document.createElement('div');
    title.className = 'draft-role-title';
    title.textContent = ROLE_LABEL[roleName] || roleName;
    const cards = document.createElement('div');
    cards.className = 'draft-role-cards';
    const roleEntries = Object.entries(CHARACTER_META).filter(([id, m]) => (characterPublicDef(id)?.role || m.role) === roleName);
    for (const [id, m] of roleEntries) {
      const st = draftCardState(id, comp);
      const votes = Number(comp.banVoteCounts?.[id] || 0);
      const selectedVote = comp.myBanVote === id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `draft-char-card ${st.cls}${selectedVote ? ' vote-selected' : ''}`;
      let stateText = st.text;
      if (!st.locked && comp.phase === 'ban' && canBan) stateText = votes ? `🗳️ ${votes}표${selectedVote ? ' · 내 표' : ''}` : (selectedVote ? '🗳️ 내 표' : '');
      if (!st.locked && comp.phase === 'pick' && canPick) stateText = '선택 가능';
      btn.innerHTML = `<span class="draft-char-name">${m.icon} ${escapeHtml(characterPublicDef(id)?.name || m.name)}</span><span class="draft-char-role">${escapeHtml(buildCharacterMini(id,m))}</span><span class="draft-char-state">${stateText}</span>`;
      btn.disabled = st.locked || (!canBan && !canPick);
      if (!btn.disabled) {
        btn.onpointerdown = e => {
          e.preventDefault();
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          if (comp.phase === 'ban') ws.send(JSON.stringify({ type:'draft_ban_vote', character:id }));
          else if (comp.phase === 'pick') ws.send(JSON.stringify({ type:'draft_pick', character:id }));
        };
      }
      cards.appendChild(btn);
    }
    section.appendChild(title);
    section.appendChild(cards);
    root.appendChild(section);
  }
}
function renderReadyAssignments(comp) {
  const root = $('readyAssignments');
  root.innerHTML = '';
  const me = !spectatorMode ? playerFromState(myId) : null;
  for (const team of ['A','B']) {
    const section = document.createElement('section');
    section.className = `ready-team team-${team.toLowerCase()}-ready`;
    const h = document.createElement('h3');
    h.textContent = `${team === 'A' ? '🔵' : '🔴'} ${team}팀 ${me?.team === team ? '· 우리 팀은 드래그로 자유 교환' : ''}`;
    section.appendChild(h);
    const players = teamPlayerOrder(team, comp);
    for (const p of players) {
      const slot = document.createElement('div');
      slot.className = 'ready-player-slot';
      slot.dataset.playerId = p.id;
      const draggable = !!me && me.team === team;
      const card = document.createElement('div');
      card.className = 'ready-character-card' + (draggable ? ' draggable' : '');
      card.dataset.sourcePlayerId = p.id;
      card.innerHTML = `<span>${characterLabel(p.character)}</span><small>${draggable ? '↔ 드래그' : ''}</small>`;
      if (draggable) card.onpointerdown = e => startReadyDrag(p.id, e);
      slot.innerHTML = `<div class="ready-player-name">${p.id === myId ? '⭐ ' : ''}${escapeHtml(p.name)}${p.connected === false ? ' · 📡' : ''}</div>`;
      slot.appendChild(card);
      section.appendChild(slot);
    }
    root.appendChild(section);
  }
}
function startReadyDrag(sourcePlayerId, e) {
  if (!state || state.state !== 'ready' || spectatorMode || readyDrag) return;
  const source = playerFromState(sourcePlayerId);
  const me = playerFromState(myId);
  if (!source || !me || source.team !== me.team) return;
  e.preventDefault();
  const ghost = document.createElement('div');
  ghost.className = 'ready-drag-ghost';
  ghost.textContent = characterLabel(source.character);
  document.body.appendChild(ghost);
  readyDrag = { sourcePlayerId, pointerId:e.pointerId, ghost };
  moveReadyGhost(e.clientX, e.clientY);
}
function moveReadyGhost(x,y) {
  if (!readyDrag?.ghost) return;
  readyDrag.ghost.style.left = `${x}px`;
  readyDrag.ghost.style.top = `${y}px`;
}
function clearReadyDropTargets() { document.querySelectorAll('.ready-player-slot.drop-target').forEach(el => el.classList.remove('drop-target')); }
window.addEventListener('pointermove', e => {
  if (!readyDrag || e.pointerId !== readyDrag.pointerId) return;
  e.preventDefault();
  moveReadyGhost(e.clientX, e.clientY);
  clearReadyDropTargets();
  const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.ready-player-slot');
  if (hit) hit.classList.add('drop-target');
}, { passive:false });
window.addEventListener('pointerup', e => {
  if (!readyDrag || e.pointerId !== readyDrag.pointerId) return;
  const drag = readyDrag;
  const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.ready-player-slot');
  const targetPlayerId = hit?.dataset?.playerId || null;
  if (targetPlayerId && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type:'ready_swap', sourcePlayerId:drag.sourcePlayerId, targetPlayerId }));
  }
  clearReadyDropTargets();
  drag.ghost?.remove();
  readyDrag = null;
});
window.addEventListener('pointercancel', () => {
  if (!readyDrag) return;
  clearReadyDropTargets();
  readyDrag.ghost?.remove();
  readyDrag = null;
});
function renderCompetitiveDraft() {
  if (!state || !state.competitive) return;
  const comp = state.competitive;
  const me = !spectatorMode ? playerFromState(myId) : null;
  $('draftRoomLabel').textContent = state.room || '';
  const seconds = Math.max(0, Math.ceil(Number(comp.phaseTimeLeft || 0)));
  $('draftTimer').textContent = seconds;
  $('draftTimer').classList.toggle('danger', seconds <= 3);
  const structuralKey = JSON.stringify({
    state:state.state, phase:comp.phase, activeBanTeam:comp.activeBanTeam, bans:comp.bans, picks:comp.picks,
    pickIndex:comp.pickIndex, currentPickerId:comp.currentPickerId, myBanVote:comp.myBanVote, banVoteCounts:comp.banVoteCounts,
    assignments:state.players.map(p=>[p.id,p.character,p.connected]), teamOrders:comp.teamOrders
  });
  if (structuralKey === lastCompetitiveRenderKey) return;
  lastCompetitiveRenderKey = structuralKey;
  renderDraftBanSummary(comp);
  renderDraftOrder(comp);

  if (state.state === 'ready' || comp.phase === 'ready') {
    $('draftPhaseTitle').textContent = '준비 단계';
    $('draftPhaseSubtitle').textContent = '20초 동안 우리 팀의 4개 픽을 팀원 슬롯 사이에서 드래그해 최종 담당자를 정합니다.';
    $('draftNotice').textContent = me ? '우리 팀 캐릭터 카드를 원하는 팀원에게 드래그하세요. 이미 캐릭터가 있으면 두 픽이 즉시 서로 바뀝니다.' : '양 팀이 최종 담당 캐릭터를 정하는 중입니다.';
    $('draftCharacterGrid').classList.add('hidden');
    $('readyAssignments').classList.remove('hidden');
    $('draftHelp').textContent = '준비시간이 끝나면 자동으로 배치가 잠기고 경쟁 경기가 시작됩니다.';
    renderReadyAssignments(comp);
    return;
  }

  $('draftCharacterGrid').classList.remove('hidden');
  $('readyAssignments').classList.add('hidden');
  if (comp.phase === 'ban') {
    $('draftPhaseTitle').textContent = `${comp.activeBanTeam === 'A' ? '🔵' : '🔴'} ${comp.activeBanTeam}팀 밴 투표`;
    $('draftPhaseSubtitle').textContent = '팀원 4명이 10초 동안 투표합니다. 최다득표 캐릭터가 밴되며 동률이면 공동 1위 후보 중 무작위로 결정됩니다.';
    if (me?.team === comp.activeBanTeam) $('draftNotice').textContent = '우리 팀 밴 차례입니다. 원하는 캐릭터를 눌러 투표하세요. 제한시간 안에는 언제든 표를 바꿀 수 있습니다.';
    else $('draftNotice').textContent = `${comp.activeBanTeam}팀이 밴 투표 중입니다. 상대 팀의 실시간 표는 공개되지 않습니다.`;
    $('draftHelp').textContent = '한 팀당 1밴, 총 2밴입니다. 표가 하나도 없으면 선택 가능한 캐릭터 중 무작위 밴됩니다.';
  } else {
    const picker = playerFromState(comp.currentPickerId);
    $('draftPhaseTitle').textContent = `${picker?.team === 'A' ? '🔵' : '🔴'} ${escapeHtml(picker?.name || '플레이어')}의 픽`;
    $('draftPhaseSubtitle').textContent = '스네이크 순서: 선픽 1 → 후픽 2 → 선픽 2 → 후픽 2 → 선픽 1. 밴·픽된 캐릭터는 양 팀 모두 다시 고를 수 없습니다.';
    $('draftNotice').textContent = comp.currentPickerId === myId ? '내 픽 차례입니다. 우리 팀이 확보할 캐릭터 1명을 선택하세요.' : `${escapeHtml(picker?.name || '현재 플레이어')}의 선택을 기다리는 중입니다.`;
    $('draftHelp').textContent = '10초 안에 선택하지 않으면 현재 선택 가능한 딜러 중 1명이 자동으로 픽됩니다.';
  }
  renderDraftCharacterGrid(comp);
}

async function requestCompetitiveStatsHttp(statsVersion = selectedCompetitiveStatsVersion) {
  if (!/^\d{4}$/.test(adminStatsPin)) {
    const entered = prompt('관리자 암호 4자리를 입력하세요.');
    if (entered === null) return false;
    adminStatsPin = String(entered).replace(/\D/g, '').slice(0, 4);
    if (adminStatsPin.length !== 4) { adminStatsPin = ''; alert('관리자 암호 4자리를 입력하세요.'); return false; }
  }
  try {
    const response = await fetch('/admin/competitive-stats', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      cache:'no-store',
      body:JSON.stringify({ pin:adminStatsPin, ...(statsVersion ? { statsVersion } : {}) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      if (response.status === 403 || payload.error === 'bad_pin') { adminStatsAuthorized = false; adminStatsPin = ''; }
      throw new Error(payload.message || '관리자 통계를 불러오지 못했습니다.');
    }
    adminStatsAuthorized = true;
    lastAdminStatsData = payload.data || {};
    selectedCompetitiveStatsVersion = lastAdminStatsData.statsVersion || selectedCompetitiveStatsVersion;
    renderCompetitiveStats(lastAdminStatsData);
    return true;
  } catch (err) {
    alert(err?.message || '관리자 통계를 불러오지 못했습니다.');
    return false;
  }
}

async function openCompetitiveStats() {
  const overlay = $('competitiveStatsOverlay');
  overlay.classList.remove('hidden');
  $('competitiveStatsSummary').textContent = 'PostgreSQL 영구 통계를 불러오는 중…';
  $('competitiveStatsBody').innerHTML = '';
  $('competitiveRecentMatches').innerHTML = '';
  for (const id of ['competitivePlayerStatsBody','competitiveSynergyBody','competitiveMatchupBody','competitiveCompositionBody','competitiveDraftStatsBody']) { const el=$(id); if (el) el.innerHTML=''; }
  if ($('competitiveStatsDataQuality')) $('competitiveStatsDataQuality').textContent = '';
  const badge = $('competitiveStatsPersistenceBadge');
  if (badge) { badge.textContent = '영구 저장소 확인 중…'; badge.classList.remove('ok','error'); }
  const ok = await requestCompetitiveStatsHttp(selectedCompetitiveStatsVersion);
  if (!ok && !adminStatsAuthorized) overlay.classList.add('hidden');
}

function downloadCompetitiveStatsBackup(data) {
  const blob = data instanceof Blob ? data : new Blob([JSON.stringify(data, null, 2)], { type:'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `competitive_stats_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportCompetitiveStatsJson() {
  if (!/^\d{4}$/.test(adminStatsPin)) {
    const ok = await requestCompetitiveStatsHttp(selectedCompetitiveStatsVersion);
    if (!ok) return;
  }
  const buttons = [$('competitiveStatsExportTop'), $('competitiveStatsExport')].filter(Boolean);
  buttons.forEach(button => { button.disabled = true; });
  try {
    const response = await fetch('/admin/competitive-stats/export', {
      method:'POST', headers:{ 'Content-Type':'application/json' }, cache:'no-store',
      body:JSON.stringify({ pin:adminStatsPin })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (response.status === 403) { adminStatsAuthorized = false; adminStatsPin = ''; }
      throw new Error(payload.message || 'JSON 백업을 생성하지 못했습니다.');
    }
    downloadCompetitiveStatsBackup(await response.blob());
  } catch (err) {
    alert(err?.message || 'JSON 백업을 생성하지 못했습니다.');
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}
function closeCompetitiveStats() { $('competitiveStatsOverlay').classList.add('hidden'); }

function percent(value) { return `${(Number(value || 0) * 100).toFixed(1)}%`; }
function renderCompetitiveStats(data) {
  const total = Number(data.totalMatches || 0);
  const allTimeTotal = Number(data.allTimeTotalMatches ?? total);
  const statsVersion = String(data.statsVersion || data.currentBuild?.statsVersion || '');
  selectedCompetitiveStatsVersion = statsVersion || selectedCompetitiveStatsVersion;
  const versionSelect = $('competitiveStatsVersion');
  const versions = Array.isArray(data.availableStatsVersions) ? data.availableStatsVersions : (statsVersion ? [statsVersion] : []);
  versionSelect.innerHTML = '';
  for (const version of versions) {
    const option = document.createElement('option');
    option.value = String(version);
    option.textContent = `${version} 통계`;
    option.selected = String(version) === statsVersion;
    versionSelect.appendChild(option);
  }
  versionSelect.disabled = versions.length <= 1;
  const rosterLabel = data.currentBuild?.rosterVersion ? ` · 현재 로스터 ${data.currentBuild.rosterVersion}` : '';
  const net = data.network || null;
  const netLabel = net ? ` · WS ${Number(net.totalMiB || 0).toFixed(1)}MB / 현재 ${Number(net.activeConnections || 0)}연결 / 차단 ${Number(net.skippedLiveSnapshots || 0)}회` : '';
  $('competitiveStatsSummary').textContent = `${statsVersion || '현재'} 버전 경쟁 통계 ${total}판 · 전체 저장 ${allTimeTotal}판${rosterLabel}${netLabel}${data.updatedAt ? ` · 이 버전 마지막 기록 ${new Date(data.updatedAt).toLocaleString('ko-KR')}` : ''}`;
  const persistence = data.persistence || {};
  const persistenceBadge = $('competitiveStatsPersistenceBadge');
  if (persistenceBadge) {
    const pending = Number(persistence.pendingSaves || 0);
    persistenceBadge.classList.toggle('ok', !!persistence.ready && pending === 0);
    persistenceBadge.classList.toggle('error', !persistence.ready || pending > 0);
    if (persistence.ready && pending === 0) {
      persistenceBadge.textContent = `🟢 PostgreSQL 영구 저장 정상${persistence.lastMatchWriteAt ? ` · 마지막 경기 저장 ${new Date(persistence.lastMatchWriteAt).toLocaleString('ko-KR')}` : ' · 저장된 경기 없음'}`;
    } else if (persistence.ready) {
      persistenceBadge.textContent = `🟠 영구 저장 대기 ${pending}건 · 자동 재시도 중`;
    } else {
      persistenceBadge.textContent = `🔴 영구 저장소 연결 오류${persistence.lastError ? ` · ${persistence.lastError}` : ''}`;
    }
  }

  const adv = data.advanced || {};
  const quality = $('competitiveStatsDataQuality');
  if (quality) {
    quality.textContent = `고급 원본 기록 ${Number(adv.recordedMatches||0)}판 · 완전 기록 ${Number(adv.completeMatches||0)}판 · 부분/불완전 ${Number(adv.partialMatches||0)}판 · 연결끊김 발생 경기 ${Number(adv.disconnectMatches||0)}판 · 원본 없이 누적치만 남은 과거 경기 ${Number(adv.legacyAggregateOnlyMatches||0)}판`;
  }
  const charText = id => {
    const m = CHARACTER_META[id];
    return m ? `${m.icon} ${characterPublicDef(id)?.name || m.name}` : id;
  };
  const ciText = ci => ci && Number.isFinite(Number(ci.low)) && Number.isFinite(Number(ci.high)) ? `${percent(ci.low)}~${percent(ci.high)}` : '—';
  const avg = (value, games) => games > 0 ? (Number(value||0)/games).toFixed(0) : '0';

  const tbody = $('competitiveStatsBody');
  tbody.innerHTML = '';
  for (const [id,m] of Object.entries(CHARACTER_META)) {
    const st = data.characters?.[id] || {};
    const ast = adv.characters?.[id] || null;
    const pg = ast?.perGame || null;
    const kda = pg ? `${Number(pg.kills||0).toFixed(1)}-${Number(pg.deaths||0).toFixed(1)}-${Number(pg.assists||0).toFixed(1)}` : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.icon} ${escapeHtml(characterPublicDef(id)?.name || m.name)}</td><td>${Number(st.availableMatches||0)}</td><td>${Number(st.bans||0)}</td><td>${percent(st.banRate)}</td><td>${Number(st.picks||0)}</td><td>${percent(st.pickRate)}</td><td>${percent(st.presenceRate)}</td><td>${percent(st.unbannedPickRate)}</td><td>${Number(st.wins||0)}-${Number(st.losses||0)}-${Number(st.draws||0)}</td><td>${percent(st.winRate)}</td><td>${ciText(st.winRateCI)}</td><td>${kda}</td><td>${pg?Number(pg.damage||0).toFixed(0):'—'}</td><td>${pg?Number(pg.damageTaken||0).toFixed(0):'—'}</td><td>${pg?Number(pg.healing||0).toFixed(0):'—'}</td><td>${pg?Number(pg.objectiveSeconds||0).toFixed(1):'—'}</td><td>${Number(st.totalUltimateUses||0)}</td><td>${Number(st.averageUltimateUsesPerPick||0).toFixed(2)}</td>`;
    tbody.appendChild(tr);
  }

  const playerBody = $('competitivePlayerStatsBody');
  playerBody.innerHTML = '';
  const players = Array.isArray(adv.players) ? adv.players : [];
  if (!players.length) playerBody.innerHTML = '<tr><td colspan="11">경기별 닉네임 원본 기록이 아직 없습니다.</td></tr>';
  for (const p of players) {
    const entries = Object.entries(p.characters || {}).sort((a,b) => Number(b[1]?.games||0)-Number(a[1]?.games||0));
    const main = entries.length ? `${charText(entries[0][0])} ${Number(entries[0][1]?.games||0)}판` : '—';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${escapeHtml(p.nickname||'학생')}</td><td>${Number(p.games||0)}</td><td>${Number(p.wins||0)}-${Number(p.losses||0)}-${Number(p.draws||0)}</td><td>${percent(p.winRate)}</td><td>${Number(p.kills||0)}-${Number(p.deaths||0)}-${Number(p.assists||0)}</td><td>${avg(p.damage,p.games)}</td><td>${avg(p.damageTaken,p.games)}</td><td>${avg(p.healing,p.games)}</td><td>${p.games? (Number(p.objectiveSeconds||0)/p.games).toFixed(1):'0.0'}</td><td>${Number(p.disconnects||0)}</td><td>${main}</td>`;
    playerBody.appendChild(tr);
  }

  const synergyBody=$('competitiveSynergyBody'); synergyBody.innerHTML='';
  const pairs=Array.isArray(adv.synergy?.pairs)?adv.synergy.pairs:[];
  if(!pairs.length) synergyBody.innerHTML='<tr><td colspan="5">조합 원본 기록이 아직 없습니다.</td></tr>';
  for(const r of pairs){ const tr=document.createElement('tr'); const lift=Number(r.synergyLift||0); tr.innerHTML=`<td>${r.characters.map(charText).join(' + ')}</td><td>${Number(r.games||0)}</td><td>${Number(r.wins||0)}-${Number(r.losses||0)}-${Number(r.draws||0)}</td><td>${percent(r.winRate)}</td><td>${lift>=0?'+':''}${(lift*100).toFixed(1)}%p</td>`; synergyBody.appendChild(tr); }

  const matchupBody=$('competitiveMatchupBody'); matchupBody.innerHTML='';
  const matchups=Array.isArray(adv.matchups)?adv.matchups:[];
  if(!matchups.length) matchupBody.innerHTML='<tr><td colspan="5">상대전적 원본 기록이 아직 없습니다.</td></tr>';
  for(const r of matchups){ const tr=document.createElement('tr'); tr.innerHTML=`<td>${charText(r.characters?.[0])} vs ${charText(r.characters?.[1])}</td><td>${Number(r.games||0)}</td><td>${Number(r.firstWins||0)}-${Number(r.secondWins||0)}-${Number(r.draws||0)}</td><td>${percent(r.firstWinRate)}</td><td>${ciText(r.firstWinRateCI)}</td>`; matchupBody.appendChild(tr); }

  const compositionBody=$('competitiveCompositionBody'); compositionBody.innerHTML='';
  const comps=Array.isArray(adv.synergy?.compositions)?adv.synergy.compositions:[];
  if(!comps.length) compositionBody.innerHTML='<tr><td colspan="4">4인 조합 원본 기록이 아직 없습니다.</td></tr>';
  for(const r of comps){ const tr=document.createElement('tr'); tr.innerHTML=`<td>${(r.characters||[]).map(charText).join(' / ')}</td><td>${Number(r.games||0)}</td><td>${Number(r.wins||0)}-${Number(r.losses||0)}-${Number(r.draws||0)}</td><td>${percent(r.winRate)}</td>`; compositionBody.appendChild(tr); }

  const draftBody=$('competitiveDraftStatsBody'); draftBody.innerHTML='';
  const draftChars=adv.draft?.characters || {};
  const draftIds=Object.keys(CHARACTER_META).filter(id => (data.characters?.[id]?.bans||0)+(data.characters?.[id]?.picks||0)>0 || draftChars[id]).sort((a,b)=>((data.characters?.[b]?.bans||0)+(data.characters?.[b]?.picks||0))-((data.characters?.[a]?.bans||0)+(data.characters?.[a]?.picks||0)));
  if(!draftIds.length) draftBody.innerHTML='<tr><td colspan="9">드래프트 기록이 아직 없습니다.</td></tr>';
  const orders=o=>Object.entries(o||{}).sort((a,b)=>Number(a[0])-Number(b[0])).map(([k,v])=>`${k}순:${v}`).join(' · ')||'—';
  for(const id of draftIds){ const r=draftChars[id]||{}; const st=data.characters?.[id]||{}; const tr=document.createElement('tr'); tr.innerHTML=`<td>${charText(id)}</td><td>${Number(st.bans||0)}</td><td>${Number(r.banVotes||0)}</td><td>${orders(r.banOrders)}</td><td>${Number(st.picks||0)}</td><td>${orders(r.pickOrders)}</td><td>${Number(r.autoPicks||0)}</td><td>${percent(st.presenceRate)}</td><td>${percent(st.unbannedPickRate)}</td>`; draftBody.appendChild(tr); }
  const fp=adv.draft?.firstPick||{};
  $('competitiveDraftSummary').textContent=`선픽팀 전적 ${Number(fp.wins||0)}-${Number(fp.losses||0)}-${Number(fp.draws||0)} · 선픽팀 승률 ${percent(fp.winRate)} · A팀 ${Number(adv.side?.A?.wins||0)}-${Number(adv.side?.A?.losses||0)}-${Number(adv.side?.A?.draws||0)} / B팀 ${Number(adv.side?.B?.wins||0)}-${Number(adv.side?.B?.losses||0)}-${Number(adv.side?.B?.draws||0)}`;

  const recent = $('competitiveRecentMatches');
  recent.innerHTML = '';
  const matches = Array.isArray(data.matches) ? data.matches.slice(-12).reverse() : [];
  if (!matches.length) recent.innerHTML = '<div class="stats-recent-row"><span>경기별 원본 결과가 아직 없습니다.</span></div>';
  for (const m of matches) {
    const row = document.createElement('div');
    row.className = 'stats-recent-row';
    const scoreA = Math.floor(Number(m.score?.A || 0)), scoreB = Math.floor(Number(m.score?.B || 0));
    const result = m.winner === 'DRAW' ? '무승부' : `${m.winner}팀 승리`;
    const killTie = m.winnerReason === 'kills' && m.teamKills ? ` · 킬 ${Number(m.teamKills.A||0)}:${Number(m.teamKills.B||0)}` : '';
    const assigns=Array.isArray(m.finalAssignments)?m.finalAssignments:[];
    const teamLine=team=>assigns.filter(p=>p.team===team).map(p=>`${escapeHtml(p.playerName||'학생')}(${escapeHtml(characterPublicDef(p.character)?.name||p.character||'?')})`).join(', ');
    const bans=(Array.isArray(m.bans)?m.bans:[]).map(b=>`${b.team}:${escapeHtml(characterPublicDef(b.character)?.name||b.character||'?')}`).join(' / ');
    const dq=m.dataQuality?.complete===false?' ⚠️ 불완전':'';
    row.innerHTML = `<span>${escapeHtml(m.room || '')} · ${m.endedAt ? new Date(m.endedAt).toLocaleString('ko-KR') : ''}<small class="stats-match-detail">밴 ${bans||'—'}<br>A ${teamLine('A')||'—'}<br>B ${teamLine('B')||'—'}</small></span><b>${result} · ${scoreA}:${scoreB}${killTie}${dq}</b>`;
    recent.appendChild(row);
  }
}
$('competitiveStatsVersion').onchange = () => {
  selectedCompetitiveStatsVersion = $('competitiveStatsVersion').value || null;
  void requestCompetitiveStatsHttp(selectedCompetitiveStatsVersion);
};
$('competitiveStatsButton').onclick = () => { void openCompetitiveStats(); };
if ($('joinCompetitiveStatsButton')) $('joinCompetitiveStatsButton').onclick = () => { void openCompetitiveStats(); };
$('competitiveStatsClose').onclick = closeCompetitiveStats;
$('competitiveStatsCloseBottom').onclick = closeCompetitiveStats;
$('competitiveStatsExport').onclick = () => { void exportCompetitiveStatsJson(); };
if ($('competitiveStatsExportTop')) $('competitiveStatsExportTop').onclick = () => { void exportCompetitiveStatsJson(); };
$('competitiveStatsOverlay').onclick = e => { if (e.target === $('competitiveStatsOverlay')) closeCompetitiveStats(); };

function postGameCountdownSeconds() {
  if (!state || state.state !== 'ended') return 0;
  const closeAt = Number(state.roomCloseAt || 0);
  if (closeAt > 0) return Math.max(0, Math.ceil((closeAt - Date.now()) / 1000));
  return Math.max(0, Math.ceil(Number(state.roomCloseTimeLeft || 0)));
}

function updatePostGameCountdownUi() {
  if (!state || state.state !== 'ended') return;
  const seconds = postGameCountdownSeconds();
  const isHost = !spectatorMode && state.hostId === myId;
  const label = $('hostLabel');
  const hint = $('modeStartHint');
  const rematch = $('rematchPrepareButton');
  if (label) label.textContent = `🏁 경기가 종료되었습니다. 방 자동 삭제까지 ${seconds}초`;
  if (hint) hint.textContent = isHost
    ? '↻ 다시 게임 준비를 누르면 삭제 예약이 즉시 취소되고 같은 방에서 다음 경기를 준비할 수 있습니다.'
    : '방장이 다시 게임 준비를 누르면 이 방을 유지하고 다음 경기를 준비할 수 있습니다.';
  if (rematch) rematch.textContent = `↻ 다시 게임 준비 (${seconds}초)`;
}

setInterval(updatePostGameCountdownUi, 250);

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
  const roomEnding = state.state === 'ended';
  const roomMode = state.mode === 'competitive' ? 'competitive' : 'casual';
  if ($('roomLabel')) $('roomLabel').textContent = state.room || $('roomLabel').textContent || '방';
  if ($('roomModeBadge')) {
    $('roomModeBadge').textContent = roomMode === 'competitive' ? '· 경쟁전 4v4' : '· 일반전';
    $('roomModeBadge').classList.toggle('competitive', roomMode === 'competitive');
  }
  $('competitiveStatsButton').classList.remove('hidden');
  const countA = state.players.filter(p => p.team === 'A' && p.connected !== false).length;
  const countB = state.players.filter(p => p.team === 'B' && p.connected !== false).length;
  const competitiveReady = state.players.length === 8 && countA === 4 && countB === 4 && state.players.every(p => p.connected !== false);
  const teamControls = $('lobbyTeamControls');
  if (teamControls) teamControls.classList.toggle('hidden', spectatorMode || roomEnding || state.state !== 'lobby' || !me);
  if (me) {
    const switchA = $('switchTeamAButton');
    const switchB = $('switchTeamBButton');
    switchA.classList.toggle('selected', me.team === 'A');
    switchB.classList.toggle('selected', me.team === 'B');
    switchA.disabled = me.team === 'A' || countA >= 4;
    switchB.disabled = me.team === 'B' || countB >= 4;
    switchA.textContent = me.team === 'A' ? `🔵 A팀 ✓ (${countA}/4)` : `🔵 A팀으로 이동 (${countA}/4)`;
    switchB.textContent = me.team === 'B' ? `🔴 B팀 ✓ (${countB}/4)` : `🔴 B팀으로 이동 (${countB}/4)`;
    const status = $('lobbyTeamSwitchStatus');
    if (status) status.textContent = `현재 ${me.team}팀`;
  }
  const modeControls = $('roomModeControls');
  if (modeControls) modeControls.classList.toggle('hidden', !isHost || roomEnding || state.state !== 'lobby');
  $('setCasualModeButton').classList.toggle('active', roomMode === 'casual');
  $('setCompetitiveModeButton').classList.toggle('active', roomMode === 'competitive');
  const rematchPrepareButton = $('rematchPrepareButton');
  if (rematchPrepareButton) rematchPrepareButton.classList.toggle('hidden', !isHost || !roomEnding);
  $('normalStartButton').classList.toggle('hidden', !isHost || roomEnding || roomMode !== 'casual');
  $('competitiveStartButton').classList.toggle('hidden', !isHost || roomEnding || roomMode !== 'competitive');
  $('competitiveStartButton').disabled = roomEnding || !competitiveReady;
  if (roomEnding) {
    updatePostGameCountdownUi();
  } else if (roomMode === 'competitive') {
    $('hostLabel').textContent = spectatorMode ? '📺 관전자 모드 · 경쟁전 시작 대기 중' : (isHost ? '내가 방장입니다. 필요하면 위에서 일반전으로 바꿀 수 있습니다.' : '🏆 경쟁전 방 · 방장만 모드를 변경할 수 있습니다.');
    $('modeStartHint').textContent = competitiveReady
      ? (isHost ? '🏆 A 4명 / B 4명 완성 · 경쟁전 시작 가능' : '🏆 A 4명 / B 4명 완성 · 방장이 경쟁전을 시작할 수 있습니다.')
      : `🏆 경쟁전은 A 4명 / B 4명이 필요합니다. 현재 A ${countA}/4 · B ${countB}/4`;
  } else {
    $('hostLabel').textContent = spectatorMode ? '📺 관전자 모드 · 일반전 시작 대기 중' : (isHost ? '내가 방장입니다. 일반전은 현재 인원 그대로 시작할 수 있습니다.' : '🎮 일반전 방 · 방장만 모드를 변경할 수 있습니다.');
    $('modeStartHint').textContent = `🎮 일반전 · 자유 인원 · 현재 A ${countA}명 / B ${countB}명`;
  }
  $('resultBanner').classList.toggle('hidden', state.state !== 'ended');
  if (state.state === 'ended') {
    const finalScore = `${Math.floor(state.scoreA)} : ${Math.floor(state.scoreB)}`;
    const modeLabel = state.mode === 'competitive' ? '🏆 경쟁전 · ' : '🎮 일반전 · ';
    if (state.winner === 'DRAW') {
      $('resultBanner').textContent = modeLabel + `무승부! ${finalScore} · 킬 ${Number(state.teamKills?.A||0)} : ${Number(state.teamKills?.B||0)}`;
    } else if (state.winnerReason === 'kills') {
      $('resultBanner').textContent = modeLabel + `${state.winner}팀 승리! ${finalScore} · 킬 타이브레이크 ${Number(state.teamKills?.A||0)} : ${Number(state.teamKills?.B||0)}`;
    } else {
      $('resultBanner').textContent = modeLabel + `${state.winner}팀 승리! ${finalScore}`;
    }
  }
  renderResultStats();
  updateStoryButton();
  for (const team of ['A','B']) {
    const root = $(team === 'A' ? 'teamAList' : 'teamBList'); root.innerHTML = '';
    for (const p of state.players.filter(p => p.team === team)) {
      const div = document.createElement('div'); div.className = 'player-row' + (p.id === myId ? ' you' : '') + (p.connected === false ? ' offline' : '');
      const isOwnTeam = !spectatorMode && me && p.team === me.team;
      const revealAll = state.state === 'ended';
      let pickText;
      if (!revealAll && (spectatorMode || !isOwnTeam)) pickText = '🔒 픽 비공개';
      else if (!p.character) pickText = '⌛ 미선택';
      else pickText = `${CHARACTER_META[p.character]?.icon || '●'} ${CHARACTER_META[p.character]?.name || p.character}`;
      div.innerHTML = `<span>${p.id === state.hostId ? '👑 ' : ''}${escapeHtml(p.name)}${p.connected === false ? ' · 📡' : ''}</span><span>${pickText}</span>`;
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
  const def = me && config.characters && config.characters[me.character] ? config.characters[me.character] : null;
  return def ? (def.linkTargeting || def.abilityTargeting || null) : null;
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
function commitTargetSelection(target) {
  if (!target) return false;
  selectedTargetId = target.id;
  const me = state && state.players ? state.players.find(p => p.id === myId) : null;
  if (me && me.character === 'buffer' && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type:'link_target', targetId:target.id }));
  }
  return true;
}
function selectTargetFromPointer(clientX, clientY) {
  const target = selectableTargetAt(clientX, clientY);
  return commitTargetSelection(target);
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
  if (e.code === 'KeyR' && !e.repeat) useUltimate();
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyR'].includes(e.code)) e.preventDefault();
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
  // Mouse clicks select immediately. Touches inside joystick zones use tap-vs-drag
  // handling in makeStick so a target under a thumb does not steal movement/aim input.
  if (e.pointerType !== 'mouse' && e.target && e.target.closest && e.target.closest('.control-zone')) return;
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
  const stick = { zone, knob, isAim, pointerId:null, active:false, pendingTargetId:null, pendingX:0, pendingY:0, cx:0, cy:0, radius:50, dx:0, dy:0 };
  zone.addEventListener('pointerdown', e => startStick(stick, e));
  zone.addEventListener('pointermove', e => moveStick(stick, e));
  zone.addEventListener('pointerup', e => endStick(stick, e));
  zone.addEventListener('pointercancel', e => { if (e.pointerId === stick.pointerId) { e.preventDefault(); resetStick(stick); } });
  zone.addEventListener('lostpointercapture', e => { if (stick.pointerId === e.pointerId) resetStick(stick); });
  return stick;
}

function getStickBase(stick) {
  const base = stick.knob.parentElement.getBoundingClientRect();
  return { cx: base.left + base.width/2, cy: base.top + base.height/2, radius: base.width * 0.38 };
}

function startStick(stick, e) {
  // Virtual sticks are touch/pen controls only. A desktop mouse must never be
  // captured by these large invisible control zones, because that can turn a
  // normal battlefield click into unintended movement/aim-stick input.
  if (e.pointerType === 'mouse') return;
  if (stick.active || stick.pointerId !== null) return;
  e.preventDefault();
  stick.pointerId = e.pointerId;
  stick.zone.setPointerCapture(e.pointerId);
  const target = currentTargetingRule() ? selectableTargetAt(e.clientX, e.clientY) : null;
  if (target && e.pointerType !== 'mouse') {
    stick.pendingTargetId = target.id;
    stick.pendingX = e.clientX; stick.pendingY = e.clientY;
    return;
  }
  stick.active = true;
  const b = getStickBase(stick); stick.cx=b.cx; stick.cy=b.cy; stick.radius=b.radius;
  updateStick(stick, e.clientX, e.clientY);
  if (stick.isAim) firing = true;
}
function moveStick(stick, e) {
  if (e.pointerId !== stick.pointerId) return;
  e.preventDefault();
  if (stick.pendingTargetId) {
    if (Math.hypot(e.clientX-stick.pendingX, e.clientY-stick.pendingY) < 12) return;
    stick.pendingTargetId = null;
    stick.active = true;
    const b = getStickBase(stick); stick.cx=b.cx; stick.cy=b.cy; stick.radius=b.radius;
    if (stick.isAim) firing = true;
  }
  if (stick.active) updateStick(stick, e.clientX, e.clientY);
}
function endStick(stick, e) {
  if (e.pointerId !== stick.pointerId) return;
  e.preventDefault();
  if (stick.pendingTargetId) {
    const target = state && state.players ? state.players.find(p => p.id === stick.pendingTargetId && p.alive) : null;
    if (target && selectableTargetAt(e.clientX, e.clientY)?.id === target.id) commitTargetSelection(target);
  }
  resetStick(stick);
}
function resetStick(stick) {
  if (!stick) return;
  stick.active=false; stick.pointerId=null; stick.pendingTargetId=null; stick.pendingX=0; stick.pendingY=0; stick.dx=0; stick.dy=0;
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


function visualSegmentAabbT(x1,y1,x2,y2,minX,minY,maxX,maxY) {
  const dx=x2-x1, dy=y2-y1;
  let tmin=0, tmax=1;
  for (const [p,q1,q2] of [[dx,minX-x1,maxX-x1],[dy,minY-y1,maxY-y1]]) {
    if (Math.abs(p)<1e-9) { if (q1>0 || q2<0) return null; continue; }
    let a=q1/p, b=q2/p; if (a>b) [a,b]=[b,a];
    tmin=Math.max(tmin,a); tmax=Math.min(tmax,b); if (tmin>tmax) return null;
  }
  return tmin>=0 && tmin<=1 ? tmin : null;
}

function visualSegmentCircleT(x1,y1,x2,y2,cx,cy,r) {
  const dx=x2-x1, dy=y2-y1, fx=x1-cx, fy=y1-cy;
  const a=dx*dx+dy*dy; if (a<1e-9) return null;
  const b=2*(fx*dx+fy*dy), c=fx*fx+fy*fy-r*r;
  const disc=b*b-4*a*c; if (disc<0) return null;
  const root=Math.sqrt(disc), t1=(-b-root)/(2*a), t2=(-b+root)/(2*a);
  if (t1>1e-6 && t1<=1) return t1;
  if (t2>1e-6 && t2<=1) return t2;
  return null;
}

function liveVisualBeams(viewState, nowMs=performance.now()) {
  if (!viewState || !Array.isArray(viewState.players) || !config?.world) return [];
  const out=[];
  for (const p of viewState.players) {
    if (!p?.alive || !p.beamActive || !p.character) continue;
    const def=config?.characters?.[p.character] || {};
    const range=(p.character==='dia' && p.diaForm) ? Number(def.formRange||def.range||16) : Number(def.range||16);
    const sourcePos=renderedPlayerWorldPosition(p, nowMs);
    let dx=Number(p.aimX||0)-Number(sourcePos.x||0), dy=Number(p.aimY||0)-Number(sourcePos.y||0);
    const len=Math.hypot(dx,dy); if (len<1e-6) continue; dx/=len; dy/=len;
    const x1=Number(sourcePos.x||0), y1=Number(sourcePos.y||0), x2=x1+dx*range, y2=y1+dy*range;
    let bestT=1, impact=null;
    if (Math.abs(dx)>1e-12) {
      const tx=dx>0 ? (Number(config.world.width)-x1)/(dx*range) : (0-x1)/(dx*range);
      if (tx>=0 && tx<bestT) { bestT=tx; impact='wall'; }
    }
    if (Math.abs(dy)>1e-12) {
      const ty=dy>0 ? (Number(config.world.height)-y1)/(dy*range) : (0-y1)/(dy*range);
      if (ty>=0 && ty<bestT) { bestT=ty; impact='wall'; }
    }
    for (const w of (config.walls||[])) {
      const t=visualSegmentAabbT(x1,y1,x2,y2,Number(w.x),Number(w.y),Number(w.x)+Number(w.w),Number(w.y)+Number(w.h));
      if (t!==null && t>1e-6 && t<bestT) { bestT=t; impact='wall'; }
    }
    for (const target of viewState.players) {
      if (!target?.alive || target.id===p.id || target.team===p.team) continue;
      const tr=Number(config?.characters?.[target.character]?.radius || .8);
      const targetPos=renderedPlayerWorldPosition(target, nowMs);
      const t=visualSegmentCircleT(x1,y1,x2,y2,Number(targetPos.x||0),Number(targetPos.y||0),tr);
      if (t!==null && t>1e-6 && t<bestT) { bestT=t; impact='player'; }
    }
    out.push({
      ownerId:p.id, team:p.team, character:p.character,
      x1, y1, x2:x1+(x2-x1)*bestT, y2:y1+(y2-y1)*bestT,
      impact:impact ? true : null, didDamage:!!p.beamDidDamage
    });
  }
  return out;
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
  return ({iron:'#b56d00',mecha:'#168f55',jet:'#1179a8',solar:'#c98200',shield:'#1268c4',runner:'#d97900',shooter:'#176dc1',sniper:'#7442b6',cannon:'#a86100',fire:'#e24818',poison:'#7436a8',reactor:'#c14b12',spray:'#087f9f',water:'#0879b8',wind:'#16875a',star:'#ad7c00',angel:'#a86f00',buffer:'#7050a3',light:'#a87c00',laser:'#c52864',ice:'#087f9f',dia:'#276fae'})[character] || '#46515f';
}

const ULTIMATE_FX_STYLE = Object.freeze({
  iron:{color:'#d88500',dark:'#5b3500'}, mecha:{color:'#119455',dark:'#064a2b'}, jet:{color:'#087fac',dark:'#073b52'},
  solar:{color:'#d88a00',dark:'#684100'}, shield:{color:'#1268d1',dark:'#073e82'}, runner:{color:'#e17b00',dark:'#6a3600'},
  shooter:{color:'#176fd0',dark:'#083c78'}, sniper:{color:'#7543bd',dark:'#3c1d70'}, cannon:{color:'#b86b00',dark:'#5b3300'},
  fire:{color:'#ea4718',dark:'#7e1b05'}, poison:{color:'#7938b1',dark:'#3f1769'}, reactor:{color:'#c84b12',dark:'#682100'},
  spray:{color:'#087f9f',dark:'#06475a'}, water:{color:'#087cbf',dark:'#06456d'}, wind:{color:'#168b5c',dark:'#075033'},
  star:{color:'#b47e00',dark:'#654500'}, angel:{color:'#ad7100',dark:'#614000'}, buffer:{color:'#7250aa',dark:'#3b2860'},
  light:{color:'#aa7c00',dark:'#5e4300'}, laser:{color:'#c92968',dark:'#6d1035'}, ice:{color:'#0785a5',dark:'#064858'},
  dia:{color:'#2478ba',dark:'#0b416c'}
});

function traceRegularPolygon(cx, cy, radius, sides, rotation=0) {
  ctx.beginPath();
  for (let i=0;i<sides;i++) {
    const ang=rotation+i*Math.PI*2/sides;
    const x=cx+Math.cos(ang)*radius, y=cy+Math.sin(ang)*radius;
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath();
}

function drawCharacterUltimateWorldFx(fx, q, a) {
  const ch=fx.character;
  const style=ULTIMATE_FX_STYLE[ch] || {color:fxCharacterColor(ch),dark:'#24303d'};
  const color=style.color, dark=style.dark, fade=Math.max(0,1-q);
  const exact=Math.max(0,Number(fx.radiusWorld)||0)*SCALE;
  const phase=q*Math.PI*2;

  // Exact gameplay-radius effects get a dark outer keyline first so they stay legible on white.
  if (exact > 0 && ['iron','mecha','solar','poison','water','wind','star','ice'].includes(ch)) {
    ctx.globalAlpha=fade*.64; ctx.strokeStyle=dark; ctx.lineWidth=6-2*q;
    ctx.beginPath(); ctx.arc(a.x,a.y,exact,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=fade*.94; ctx.strokeStyle=color; ctx.lineWidth=3.2-1.1*q;
    ctx.beginPath(); ctx.arc(a.x,a.y,exact,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=fade*.075; ctx.fillStyle=color;
    ctx.beginPath(); ctx.arc(a.x,a.y,exact,0,Math.PI*2); ctx.fill();
  }

  if (ch==='shield') {
    for (let k=0;k<3;k++) {
      const rr=16+q*(18+k*6);
      ctx.globalAlpha=fade*(.76-k*.14); ctx.lineWidth=5-k; ctx.strokeStyle=k===0?dark:color;
      traceRegularPolygon(a.x,a.y,rr,6,Math.PI/6+phase*.06*(k+1)); ctx.stroke();
    }
    ctx.globalAlpha=fade*.16; ctx.fillStyle=color; traceRegularPolygon(a.x,a.y,21+q*7,6,Math.PI/6); ctx.fill();
  } else if (ch==='water') {
    // Flood: a fast outward surge rather than a lingering protection aura. The outer
    // boundary is already drawn above at the exact 16 m gameplay radius; these waves
    // make the instantaneous heal/damage/stun pulse read as a single expanding flood.
    const maxR=exact||28;
    for (let k=0;k<5;k++) {
      const local=Math.max(0,Math.min(1,q-k*.075));
      if (local<=0) continue;
      const rr=maxR*(.08+.92*local);
      ctx.globalAlpha=fade*(.90-k*.11); ctx.strokeStyle=k%2?color:dark; ctx.lineWidth=k%2?3.0:5.0;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
    }
    // Short splash spokes at the advancing front keep the effect visible over the white field.
    for (let k=0;k<12;k++) {
      const ang=k*Math.PI/6+phase*.035;
      const r1=maxR*Math.min(.94,.16+.76*q);
      const r2=Math.min(maxR,maxR*(.23+.82*q)+(k%3)*3);
      ctx.globalAlpha=fade*(k%2?.78:.56); ctx.strokeStyle=k%2?color:dark; ctx.lineWidth=k%2?2.2:3.8;
      ctx.beginPath(); ctx.moveTo(a.x+Math.cos(ang)*r1,a.y+Math.sin(ang)*r1);
      ctx.lineTo(a.x+Math.cos(ang)*r2,a.y+Math.sin(ang)*r2); ctx.stroke();
    }
    ctx.globalAlpha=fade*.13; ctx.fillStyle=color;
    ctx.beginPath(); ctx.arc(a.x,a.y,maxR*Math.min(1,.18+q*1.05),0,Math.PI*2); ctx.fill();
  } else if (ch==='angel') {
    ctx.globalAlpha=fade*.88; ctx.strokeStyle=dark; ctx.lineWidth=5.0;
    ctx.beginPath(); ctx.moveTo(a.x-3,a.y); ctx.bezierCurveTo(a.x-16-q*8,a.y-18,a.x-35-q*10,a.y-6,a.x-41-q*8,a.y+8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x+3,a.y); ctx.bezierCurveTo(a.x+16+q*8,a.y-18,a.x+35+q*10,a.y-6,a.x+41+q*8,a.y+8); ctx.stroke();
    ctx.globalAlpha=fade*.98; ctx.strokeStyle=color; ctx.lineWidth=2.7;
    ctx.beginPath(); ctx.moveTo(a.x-3,a.y); ctx.bezierCurveTo(a.x-16-q*8,a.y-18,a.x-35-q*10,a.y-6,a.x-41-q*8,a.y+8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x+3,a.y); ctx.bezierCurveTo(a.x+16+q*8,a.y-18,a.x+35+q*10,a.y-6,a.x+41+q*8,a.y+8); ctx.stroke();
    ctx.globalAlpha=fade*.92; ctx.strokeStyle=color; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(a.x,a.y-22-q*8,14+q*5,5+q*2,0,0,Math.PI*2); ctx.stroke();
  } else if (ch==='dia') {
    const wave=fx.type==='diaUltimateWave';
    const count=wave?16:8;
    for (let k=0;k<count;k++) {
      const ang=k*Math.PI*2/count+(wave?0:phase*.08);
      const r1=wave?5+q*10:7+q*8, r2=wave?18+q*32:19+q*24;
      ctx.globalAlpha=fade*(wave?.88:.72); ctx.strokeStyle=dark; ctx.lineWidth=4.2;
      ctx.beginPath(); ctx.moveTo(a.x+Math.cos(ang)*r1,a.y+Math.sin(ang)*r1); ctx.lineTo(a.x+Math.cos(ang)*r2,a.y+Math.sin(ang)*r2); ctx.stroke();
      ctx.globalAlpha=fade*.96; ctx.strokeStyle=color; ctx.lineWidth=2.0;
      ctx.beginPath(); ctx.moveTo(a.x+Math.cos(ang)*r1,a.y+Math.sin(ang)*r1); ctx.lineTo(a.x+Math.cos(ang)*r2,a.y+Math.sin(ang)*r2); ctx.stroke();
    }
    ctx.save(); ctx.translate(a.x,a.y); ctx.rotate(Math.PI/4+phase*.05); ctx.globalAlpha=fade*.20; ctx.fillStyle=color; ctx.fillRect(-13-q*4,-13-q*4,26+q*8,26+q*8); ctx.restore();
  } else if (ch==='fire') {
    for (let k=0;k<8;k++) {
      const ang=k*Math.PI/4+phase*.10, r1=8+q*8, r2=20+q*(25+(k%2)*7);
      ctx.globalAlpha=fade*(.9-k*.035); ctx.strokeStyle=k%2?color:dark; ctx.lineWidth=k%2?2.8:4.8;
      ctx.beginPath(); ctx.moveTo(a.x+Math.cos(ang)*r1,a.y+Math.sin(ang)*r1); ctx.lineTo(a.x+Math.cos(ang)*r2,a.y+Math.sin(ang)*r2); ctx.stroke();
    }
  } else if (ch==='sniper') {
    const rr=12+q*34;
    ctx.globalAlpha=fade*.82; ctx.strokeStyle=dark; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=fade*.98; ctx.strokeStyle=color; ctx.lineWidth=2.3; ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x-rr-10,a.y); ctx.lineTo(a.x+rr+10,a.y); ctx.moveTo(a.x,a.y-rr-10); ctx.lineTo(a.x,a.y+rr+10); ctx.stroke();
  } else if (ch==='jet' || ch==='runner') {
    for (let k=0;k<4;k++) {
      const rr=10+q*(20+k*8), st=phase*.45+k*1.45;
      ctx.globalAlpha=fade*(.9-k*.12); ctx.strokeStyle=k===0?dark:color; ctx.lineWidth=k===0?5:2.6;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr,st,st+1.0); ctx.stroke();
    }
  } else if (ch==='shooter' || ch==='reactor' || ch==='laser' || ch==='light' || ch==='buffer') {
    for (let k=0;k<6;k++) {
      const ang=k*Math.PI/3-phase*.08, rr=13+q*(20+(k%2)*8);
      ctx.globalAlpha=fade*(.85-k*.055); ctx.fillStyle=k%2?color:dark;
      ctx.beginPath(); ctx.arc(a.x+Math.cos(ang)*rr,a.y+Math.sin(ang)*rr,k%2?3:4.5,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=fade*.92; ctx.strokeStyle=color; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(a.x,a.y,9+q*25,0,Math.PI*2); ctx.stroke();
  } else if (ch==='spray') {
    for (let k=0;k<12;k++) {
      const ang=k*Math.PI/6+phase*.12, r1=8+q*9, r2=18+q*(24+(k%3)*5);
      ctx.globalAlpha=fade*(.88-(k%3)*.10); ctx.strokeStyle=(k%2)?color:dark; ctx.lineWidth=(k%2)?2.4:4.0;
      ctx.beginPath(); ctx.moveTo(a.x+Math.cos(ang)*r1,a.y+Math.sin(ang)*r1); ctx.lineTo(a.x+Math.cos(ang)*r2,a.y+Math.sin(ang)*r2); ctx.stroke();
    }
  } else if (ch==='cannon' || ch==='iron' || ch==='poison' || ch==='ice' || ch==='star' || ch==='solar' || ch==='wind' || ch==='mecha') {
    const rr=exact>0 ? exact*Math.min(1,.18+q*.82) : 10+q*36;
    ctx.globalAlpha=fade*.78; ctx.strokeStyle=dark; ctx.lineWidth=5.2; ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=fade*.98; ctx.strokeStyle=color; ctx.lineWidth=2.8; ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
    const spikes=ch==='star'?10:(ch==='ice'?8:6);
    for (let k=0;k<spikes;k++) {
      const ang=k*Math.PI*2/spikes+phase*.05, r1=8+q*8, r2=18+q*25;
      ctx.globalAlpha=fade*.78; ctx.strokeStyle=color; ctx.lineWidth=2.2;
      ctx.beginPath(); ctx.moveTo(a.x+Math.cos(ang)*r1,a.y+Math.sin(ang)*r1); ctx.lineTo(a.x+Math.cos(ang)*r2,a.y+Math.sin(ang)*r2); ctx.stroke();
    }
  }
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
      const rr=6+q*18;
      ctx.globalAlpha=(1-q)*.68; ctx.strokeStyle='#07523b'; ctx.lineWidth=5.0*(1-q)+1.4;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=(1-q)*.96; ctx.strokeStyle='#16a56f'; ctx.lineWidth=2.5*(1-q)+.8;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
    } else if (fx.type==='death') {
      ctx.globalAlpha=(1-q)*.72;
      ctx.strokeStyle=c; ctx.lineWidth=3*(1-q)+.7;
      ctx.beginPath(); ctx.arc(a.x,a.y,5+q*24,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=(1-q)*.20; ctx.fillStyle=c;
      ctx.beginPath(); ctx.arc(a.x,a.y,14*(1-q),0,Math.PI*2); ctx.fill();
    } else if (fx.type==='respawn') {
      const alpha=Math.sin(Math.PI*Math.min(1,q)), rr=5+q*27;
      ctx.globalAlpha=alpha*.72; ctx.strokeStyle='#6b4700'; ctx.lineWidth=5.2;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=alpha*.98; ctx.strokeStyle='#d99a00'; ctx.lineWidth=2.6;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=alpha*.11; ctx.fillStyle='#d99a00';
      ctx.beginPath(); ctx.arc(a.x,a.y,13+q*8,0,Math.PI*2); ctx.fill();
    } else if (fx.type==='ability') {
      const rr=5+q*21;
      ctx.globalAlpha=(1-q)*.66; ctx.strokeStyle='#064c61'; ctx.lineWidth=4.8*(1-q)+1.3;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=(1-q)*.96; ctx.strokeStyle='#1599bd'; ctx.lineWidth=2.4*(1-q)+.75;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
    } else if (fx.type==='windTailwindCast') {
      for (let k=0;k<3;k++) {
        const phase=Math.max(0,Math.min(1,q-k*.10)), rr=5+phase*(24+k*7);
        ctx.globalAlpha=(1-phase)*(.58-k*.09); ctx.strokeStyle='#075238'; ctx.lineWidth=4.8-k*.45;
        ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
        ctx.globalAlpha=(1-phase)*(.94-k*.10); ctx.strokeStyle='#189563'; ctx.lineWidth=2.3-k*.3;
        ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
      }
      ctx.globalAlpha=(1-q)*.10; ctx.fillStyle='#189563'; ctx.beginPath(); ctx.arc(a.x,a.y,11+q*6,0,Math.PI*2); ctx.fill();
    } else if (fx.type==='jetStart') {
      const rr=5+q*24;
      ctx.globalAlpha=(1-q)*.70; ctx.strokeStyle='#08445f'; ctx.lineWidth=5.0*(1-q)+1.3;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=(1-q)*.98; ctx.strokeStyle='#158ab5'; ctx.lineWidth=2.6*(1-q)+.7;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
      if (fx.dx!=null) {
        const ex=worldToScreen(fx.x-fx.dx*(1.2+q*1.4),fx.y-fx.dy*(1.2+q*1.4));
        ctx.globalAlpha=(1-q)*.72; ctx.strokeStyle='#08445f'; ctx.lineWidth=4.0*(1-q)+1.0;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(ex.x,ex.y); ctx.stroke();
        ctx.globalAlpha=(1-q)*.98; ctx.strokeStyle='#46b9df'; ctx.lineWidth=1.9*(1-q)+.5;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(ex.x,ex.y); ctx.stroke();
      }
    } else if (fx.type==='jetEnd') {
      const rr=4+q*20;
      ctx.globalAlpha=(1-q)*.66; ctx.strokeStyle='#08445f'; ctx.lineWidth=4.8*(1-q)+1.2;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=(1-q)*.96; ctx.strokeStyle='#158ab5'; ctx.lineWidth=2.4*(1-q)+.7;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=(1-q)*.09; ctx.fillStyle='#158ab5'; ctx.beginPath(); ctx.arc(a.x,a.y,10+q*4,0,Math.PI*2); ctx.fill();
    } else if (fx.type==='jetWallSpark') {
      for (let k=0;k<5;k++) { const ang=k*Math.PI*2/5+.35; const rr1=4+q*5, rr2=9+q*12;
        ctx.globalAlpha=(1-q)*.72; ctx.strokeStyle='#08445f'; ctx.lineWidth=3.8; ctx.beginPath(); ctx.moveTo(a.x+Math.cos(ang)*rr1,a.y+Math.sin(ang)*rr1); ctx.lineTo(a.x+Math.cos(ang)*rr2,a.y+Math.sin(ang)*rr2); ctx.stroke();
        ctx.globalAlpha=(1-q)*.98; ctx.strokeStyle='#46b9df'; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(a.x+Math.cos(ang)*rr1,a.y+Math.sin(ang)*rr1); ctx.lineTo(a.x+Math.cos(ang)*rr2,a.y+Math.sin(ang)*rr2); ctx.stroke(); }
    } else if (fx.type==='ultimateWindup') {
      const exact=Math.max(0,Number(fx.radiusWorld)||0)*SCALE;
      const wc=fxCharacterColor(fx.character), wd=ULTIMATE_FX_STYLE[fx.character]?.dark || '#24303d';
      if (exact>0) {
        ctx.globalAlpha=(1-q)*.78; ctx.strokeStyle=wd; ctx.lineWidth=5.4; ctx.setLineDash([9,7]); ctx.beginPath(); ctx.arc(a.x,a.y,exact,0,Math.PI*2); ctx.stroke();
        ctx.globalAlpha=(1-q)*.96; ctx.strokeStyle=wc; ctx.lineWidth=2.6; ctx.beginPath(); ctx.arc(a.x,a.y,exact,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
      }
    } else if (fx.type==='diaUltimateWave' || /Ultimate$/.test(fx.type)) {
      drawCharacterUltimateWorldFx(fx,q,a);
    } else if (fx.type==='ultimateCast') {
      const radius=Math.max(0,Number(fx.radiusWorld)||0)*SCALE;
      if (radius > 0) {
        ctx.globalAlpha=(1-q)*.88; ctx.strokeStyle=c; ctx.lineWidth=4.0-1.8*q; ctx.beginPath(); ctx.arc(a.x,a.y,radius,0,Math.PI*2); ctx.stroke();
        ctx.globalAlpha=(1-q)*.16; ctx.fillStyle=c; ctx.beginPath(); ctx.arc(a.x,a.y,radius,0,Math.PI*2); ctx.fill();
      }
      if (fx.character==='angel') {
        const alpha=Math.sin(Math.PI*Math.min(1,q));
        ctx.globalAlpha=alpha*.85; ctx.strokeStyle='#fff4cd'; ctx.lineWidth=2.6; ctx.beginPath(); ctx.arc(a.x,a.y,7+q*20,0,Math.PI*2); ctx.stroke();
      } else if (fx.character==='jet' || fx.character==='runner' || fx.character==='shooter' || fx.character==='sniper') {
        ctx.globalAlpha=(1-q)*.86; ctx.strokeStyle=c; ctx.lineWidth=2.8;
        for (let k=0;k<3;k++) { const rr=8+q*(18+k*7); ctx.beginPath(); ctx.arc(a.x,a.y,rr,k*2.05+q*2,k*2.05+q*2+.85); ctx.stroke(); }
      } else if (fx.character==='mecha' || fx.character==='cannon' || fx.character==='reactor' || fx.character==='poison') {
        ctx.strokeStyle=c; ctx.lineWidth=3.0;
        for (let k=0;k<6;k++) { const ang=k*Math.PI/3+q*.9; const r1=8+q*10, r2=15+q*25; ctx.globalAlpha=(1-q)*(.88-k*.06); ctx.beginPath(); ctx.moveTo(a.x+Math.cos(ang)*r1,a.y+Math.sin(ang)*r1); ctx.lineTo(a.x+Math.cos(ang)*r2,a.y+Math.sin(ang)*r2); ctx.stroke(); }
      } else {
        ctx.globalAlpha=(1-q)*.82; ctx.strokeStyle=c; ctx.lineWidth=2.8; ctx.beginPath(); ctx.arc(a.x,a.y,6+q*24,0,Math.PI*2); ctx.stroke();
      }
    } else if (fx.type==='reactor33' || fx.type==='reactor66' || fx.type==='reactor100' || fx.type==='reactorDown') {
      const strong=fx.type==='reactor100'?1:(fx.type==='reactor66' ? .78:(fx.type==='reactor33' ? .48:.34));
      ctx.globalAlpha=(1-q)*(.50+strong*.32); ctx.strokeStyle=fx.type==='reactorDown'?'#d08a63':'#ff7a2e'; ctx.lineWidth=1.7+strong*2.0;
      ctx.beginPath(); ctx.arc(a.x,a.y,5+q*(18+strong*15),0,Math.PI*2); ctx.stroke();
      if (fx.type==='reactor66' || fx.type==='reactor100') {
        ctx.globalAlpha=(1-q)*.72; ctx.fillStyle=fx.type==='reactor100'?'#fff3cf':'#ffb16b';
        const count=fx.type==='reactor100'?7:4;
        for (let k=0;k<count;k++) { const ang=k*Math.PI*2/count+q*1.2; const rr=9+q*22; ctx.beginPath(); ctx.arc(a.x+Math.cos(ang)*rr,a.y+Math.sin(ang)*rr,1.1+(1-q)*1.0,0,Math.PI*2); ctx.fill(); }
      }
    } else if (fx.type==='radiationStart') {
      ctx.strokeStyle='#ff8a3d'; ctx.lineWidth=2.2; ctx.globalAlpha=(1-q)*.80;
      for (let k=0;k<3;k++) { const r=6+q*(12+k*3); ctx.beginPath(); ctx.arc(a.x,a.y,r,k*2.1+q,k*2.1+q+1.05); ctx.stroke(); }
    } else if (fx.type==='angelCast') {
      const rr=4+q*17;
      ctx.globalAlpha=(1-q)*.66; ctx.strokeStyle='#684800'; ctx.lineWidth=4.6; ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=(1-q)*.98; ctx.strokeStyle='#c58a12'; ctx.lineWidth=2.2; ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
    } else if (fx.type==='angelBless') {
      const alpha=Math.sin(Math.PI*Math.min(1,q));
      ctx.globalAlpha=alpha*.16; ctx.fillStyle='#c58a12'; ctx.fillRect(a.x-3.0,a.y-30-q*8,6.0,60+q*16);
      ctx.globalAlpha=alpha*.74; ctx.strokeStyle='#684800'; ctx.lineWidth=5.0;
      ctx.beginPath(); ctx.moveTo(a.x-2,a.y); ctx.bezierCurveTo(a.x-12,a.y-9,a.x-19,a.y-2,a.x-23,a.y+4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a.x+2,a.y); ctx.bezierCurveTo(a.x+12,a.y-9,a.x+19,a.y-2,a.x+23,a.y+4); ctx.stroke();
      ctx.globalAlpha=alpha*.98; ctx.strokeStyle='#c58a12'; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.moveTo(a.x-2,a.y); ctx.bezierCurveTo(a.x-12,a.y-9,a.x-19,a.y-2,a.x-23,a.y+4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a.x+2,a.y); ctx.bezierCurveTo(a.x+12,a.y-9,a.x+19,a.y-2,a.x+23,a.y+4); ctx.stroke();
      ctx.fillStyle='#d99a1b';
      for (let k=0;k<6;k++) { const ang=k*Math.PI/3+.2; const rr=8+q*(13+k%2*3); ctx.globalAlpha=alpha*(.55+.06*k); ctx.beginPath(); ctx.arc(a.x+Math.cos(ang)*rr,a.y+Math.sin(ang)*rr-q*10,1.5,0,Math.PI*2); ctx.fill(); }
    } else if (fx.type==='bufferLink') {
      const rr=5+q*17;
      ctx.globalAlpha=(1-q)*.64; ctx.strokeStyle='#43245f'; ctx.lineWidth=4.6*(1-q)+1.2; ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=(1-q)*.98; ctx.strokeStyle='#8053b5'; ctx.lineWidth=2.3*(1-q)+.7; ctx.beginPath(); ctx.arc(a.x,a.y,rr,0,Math.PI*2); ctx.stroke();
    } else if (fx.type==='diaTransform') {
      const pulse=Math.sin(Math.PI*Math.min(1,q)), rr0=7+q*31;
      ctx.globalAlpha=pulse*.68; ctx.strokeStyle='#0b4d7a'; ctx.lineWidth=5.6*(1-q)+1.6;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr0,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=pulse*.98; ctx.strokeStyle='#258dcc'; ctx.lineWidth=2.8*(1-q)+.9;
      ctx.beginPath(); ctx.arc(a.x,a.y,rr0,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=pulse*.12; ctx.fillStyle='#258dcc';
      ctx.beginPath(); ctx.arc(a.x,a.y,18+q*7,0,Math.PI*2); ctx.fill();
      for (let k=0;k<6;k++) {
        const ang=k*Math.PI/3 + q*1.8; const rr=13+q*23, sx=a.x+Math.cos(ang)*rr, sy=a.y+Math.sin(ang)*rr;
        ctx.globalAlpha=pulse*.72; ctx.fillStyle='#0b4d7a'; ctx.beginPath(); ctx.arc(sx,sy,2.6+(1-q)*1.5,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha=pulse*.98; ctx.fillStyle='#72d3ee'; ctx.beginPath(); ctx.arc(sx,sy,1.3+(1-q)*1.0,0,Math.PI*2); ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawJetBoostTrail(player, nowMs) {
  if (!player || !player.jetBoost) return;
  const pos=renderedPlayerWorldPosition(player, nowMs);
  const a=worldToScreen(pos.x,pos.y);
  let dx=Number(player.jetBoostEndX||0)-Number(player.jetBoostStartX||0), dy=Number(player.jetBoostEndY||0)-Number(player.jetBoostStartY||0);
  const len=Math.hypot(dx,dy)||1; dx/=len; dy/=len;
  const sx=dy, sy=-dx;
  ctx.save();
  for (let k=0;k<3;k++) {
    const side=(k-1)*4.0;
    const tail=13+k*5;
    ctx.globalAlpha=.44-k*.09; ctx.strokeStyle=k===1?'#e8fbff':'#86d9ff'; ctx.lineWidth=2.2-k*.35;
    ctx.beginPath(); ctx.moveTo(a.x+sx*side-dx*4,a.y+sy*side-dy*4); ctx.lineTo(a.x+sx*side-dx*tail,a.y+sy*side-dy*tail); ctx.stroke();
  }
  for (let k=1;k<=2;k++) {
    ctx.globalAlpha=.13; ctx.fillStyle='#a6e5ff'; ctx.beginPath(); ctx.arc(a.x-dx*(k*11),a.y-dy*(k*11),Math.max(3,characterRadiusWorld(player.character)*SCALE*(1-k*.22)),0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function drawBufferTargetAura(target, nowMs) {
  if (!target) return;
  const tw=renderedPlayerWorldPosition(target, nowMs), a=worldToScreen(tw.x,tw.y);
  const radius=characterRadiusWorld(target.character)*SCALE+8;
  const phase=nowMs*.0018;
  ctx.save(); ctx.strokeStyle='#d9b3ff'; ctx.lineWidth=2.1; ctx.globalAlpha=.72;
  for (let k=0;k<4;k++) { const start=phase+k*Math.PI/2; ctx.beginPath(); ctx.arc(a.x,a.y,radius,start,start+.42); ctx.stroke(); }
  ctx.globalAlpha=.10; ctx.fillStyle='#c99cff'; ctx.beginPath(); ctx.arc(a.x,a.y,radius-2,0,Math.PI*2); ctx.fill(); ctx.restore();
}

function drawBufferOutOfRangeMarker(target, nowMs) {
  if (!target) return;
  const tw=renderedPlayerWorldPosition(target, nowMs), a=worldToScreen(tw.x,tw.y);
  const y=a.y-characterRadiusWorld(target.character)*SCALE-25;
  const bob=Math.sin(nowMs*.006)*2;
  ctx.save(); ctx.translate(a.x,y+bob); ctx.rotate(Math.PI/4); ctx.strokeStyle='#c7b7d8'; ctx.lineWidth=2; ctx.globalAlpha=.82; ctx.strokeRect(-4,-4,8,8); ctx.restore();
}

function drawBufferThread(buffer, target, nowMs) {
  if (!buffer || !target || !buffer.bufferLinkActive) return;
  const bw = renderedPlayerWorldPosition(buffer, nowMs);
  const tw = renderedPlayerWorldPosition(target, nowMs);
  const a = worldToScreen(bw.x, bw.y), z = worldToScreen(tw.x, tw.y);
  const dx = z.x-a.x, dy = z.y-a.y, len = Math.hypot(dx,dy) || 1;
  const nx = -dy/len, ny = dx/len;
  const phase = nowMs * 0.008 + (String(buffer.id||'').charCodeAt(0)||0);
  const amp = Math.min(7, 2.5 + len*0.012);
  const c1 = { x:a.x+dx*.33 + nx*Math.sin(phase)*amp, y:a.y+dy*.33 + ny*Math.sin(phase)*amp };
  const c2 = { x:a.x+dx*.66 + nx*Math.sin(phase+1.8)*amp, y:a.y+dy*.66 + ny*Math.sin(phase+1.8)*amp };
  ctx.save();
  ctx.lineCap='round';
  ctx.shadowColor='rgba(220,205,255,.55)'; ctx.shadowBlur=7;
  ctx.strokeStyle='rgba(225,215,255,.82)'; ctx.lineWidth=1.6;
  ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,z.x,z.y); ctx.stroke();
  ctx.shadowBlur=0; ctx.strokeStyle='rgba(255,255,255,.85)'; ctx.lineWidth=.7;
  ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,z.x,z.y); ctx.stroke();
  ctx.restore();
}

let scoringStatusUiKey = '';

function scoringStateFromPlayers(viewState) {
  if (!viewState || !config?.world) return { a:false, b:false };
  let aAttackers=0, bDefenders=0, bAttackers=0, aDefenders=0;
  for (const p of (viewState.players || [])) {
    if (!p.alive || p.connected === false) continue;
    if (Number(p.y) >= Number(config.world.bZoneStart)) {
      if (p.team === 'A') aAttackers++;
      else if (p.team === 'B') bDefenders++;
    }
    if (Number(p.y) <= Number(config.world.aZoneEnd)) {
      if (p.team === 'B') bAttackers++;
      else if (p.team === 'A') aDefenders++;
    }
  }
  return { a:aAttackers>0 && bDefenders===0, b:bAttackers>0 && aDefenders===0 };
}

function clearScoringStatusUi() {
  const el=$('scoringStatus');
  if (el) { el.classList.add('hidden'); el.classList.remove('score-a','score-b','score-both'); }
  $('scoreA')?.parentElement?.classList.remove('scoring');
  $('scoreB')?.parentElement?.classList.remove('scoring');
  scoringStatusUiKey = '';
}

function updateScoringStatusUi(viewState) {
  if (!viewState || viewState.state !== 'playing') { clearScoringStatusUi(); return; }
  const scoring=scoringStateFromPlayers(viewState);
  const me = spectatorMode ? null : (viewState.players || []).find(p => p.id === myId);
  const perspective = spectatorMode || !me ? 'spectator' : me.team;
  const key=`${scoring.a?'A':''}${scoring.b?'B':''}:${perspective}`;
  if (key === scoringStatusUiKey) return;
  scoringStatusUiKey=key;
  const el=$('scoringStatus');
  const pillA=$('scoreA')?.parentElement, pillB=$('scoreB')?.parentElement;
  pillA?.classList.toggle('scoring', scoring.a);
  pillB?.classList.toggle('scoring', scoring.b);
  if (!el) return;
  el.classList.remove('score-a','score-b','score-both');
  if (!scoring.a && !scoring.b) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  if (scoring.a && scoring.b) {
    el.textContent='⚔️ 양 팀 득점 중 · A +1/초 · B +1/초';
    el.classList.add('score-both');
    return;
  }
  const team=scoring.a?'A':'B';
  if (perspective === 'spectator') el.textContent=`${team}팀 득점 중 · +1/초`;
  else if (perspective === team) el.textContent=`✅ 우리 팀 득점 중 · ${team}팀 +1/초`;
  else el.textContent=`⚠️ 상대 팀 득점 중! · ${team}팀 +1/초`;
  el.classList.add(team === 'A' ? 'score-a' : 'score-b');
}

function drawHomeZoneLabels(viewState) {
  if (!config?.world) return;
  const me = !spectatorMode ? (viewState.players || []).find(p => p.id === myId) : null;
  let left='A 구역', right='B 구역';
  if (me?.team === 'A') { left='우리 집'; right='적 집'; }
  else if (me?.team === 'B') { left='적 집'; right='우리 집'; }
  const leftX=(Number(config.world.aZoneEnd)/2)*SCALE;
  const rightX=((Number(config.world.bZoneStart)+Number(config.world.height))/2)*SCALE;
  const y=canvas.height*0.50;
  ctx.save();
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='900 22px system-ui';
  ctx.lineWidth=3; ctx.globalAlpha=.18; ctx.strokeStyle='rgba(0,0,0,.9)';
  ctx.strokeText(left,leftX,y); ctx.strokeText(right,rightX,y);
  ctx.fillStyle='#43689a'; ctx.fillText(left,leftX,y);
  ctx.fillStyle='#9b5151'; ctx.fillText(right,rightX,y);
  ctx.restore();
}

function updateHealerLowHpAttention(viewState, localPlayer) {
  const role = localPlayer ? (characterPublicDef(localPlayer.character)?.role || CHARACTER_META[localPlayer.character]?.role) : null;
  if (!localPlayer || !localPlayer.alive || role !== '힐러') {
    healerLowHpAttention.clear();
    return false;
  }

  const eligibleIds = new Set();
  for (const ally of (viewState.players || [])) {
    if (!ally.alive || ally.id === localPlayer.id || ally.team !== localPlayer.team || !(Number(ally.maxHp) > 0)) continue;
    eligibleIds.add(ally.id);
    const hpRatio = Math.max(0, Math.min(1, Number(ally.hp || 0) / Number(ally.maxHp)));
    if (hpRatio <= 0.50) healerLowHpAttention.add(ally.id);
    else if (hpRatio >= 0.60) healerLowHpAttention.delete(ally.id);
  }

  for (const id of [...healerLowHpAttention]) {
    if (!eligibleIds.has(id)) healerLowHpAttention.delete(id);
  }
  return true;
}

function renderGame() {
  requestAnimationFrame(renderGame);
  const viewState = state;
  if (!viewState || viewState.state !== 'playing' || !config) { clearScoringStatusUi(); return; }
  updateScoringStatusUi(viewState);
  const healerViewer = spectatorMode ? null : viewState.players.find(p => p.id === myId);
  const healerAttentionEnabled = updateHealerLowHpAttention(viewState, healerViewer);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);

  // Owned zones are left/right in mobile landscape view.
  ctx.fillStyle = 'rgba(65,130,255,.09)'; ctx.fillRect(0,0,config.world.aZoneEnd*SCALE,canvas.height);
  ctx.fillStyle = 'rgba(255,80,80,.075)'; ctx.fillRect(config.world.bZoneStart*SCALE,0,(config.world.height-config.world.bZoneStart)*SCALE,canvas.height);
  ctx.strokeStyle = 'rgba(55,65,81,.28)'; ctx.setLineDash([7,7]);
  for (const y of [config.world.aZoneEnd, config.world.bZoneStart]) { ctx.beginPath(); ctx.moveTo(y*SCALE,0); ctx.lineTo(y*SCALE,canvas.height); ctx.stroke(); }
  ctx.setLineDash([]);

  // Player-perspective home labels are local-only orientation aids. Spectators keep neutral A/B labels.
  drawHomeZoneLabels(viewState);

  // Walls rotated into landscape view.
  ctx.fillStyle = '#5c6675';
  for (const w of config.walls) ctx.fillRect(w.y*SCALE,w.x*SCALE,w.h*SCALE,w.w*SCALE);

  const beamFxNow = performance.now();

  // Solar/Wind are moving area ultimates. Keep the exact gameplay radius visible
  // for the whole active duration, underneath character art and combat effects.
  for (const p of viewState.players) {
    if (!p.alive || Number(p.ultimateActiveMs||0) <= 0 || (p.character !== 'solar' && p.character !== 'wind')) continue;
    const activeDef=characterPublicDef(p.character) || {};
    const activeRadius=Math.max(0,Number(activeDef.ultimateRadius)||0)*SCALE;
    if (!(activeRadius > 0)) continue;
    const rw=renderedPlayerWorldPosition(p,beamFxNow);
    const rs=worldToScreen(rw.x,rw.y);
    const ustyle=ULTIMATE_FX_STYLE[p.character] || {color:fxCharacterColor(p.character),dark:'#24303d'};
    const phase=beamFxNow*.006;
    const rangePulse=.88+.12*Math.sin(phase*.85 + rs.x*.006);
    ctx.save();
    ctx.setLineDash([10,7]);
    ctx.globalAlpha=.66+.10*rangePulse; ctx.strokeStyle=ustyle.dark; ctx.lineWidth=5.2;
    ctx.beginPath(); ctx.arc(rs.x,rs.y,activeRadius,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=.88+.08*rangePulse; ctx.strokeStyle=ustyle.color; ctx.lineWidth=2.7;
    ctx.beginPath(); ctx.arc(rs.x,rs.y,activeRadius,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha=p.character==='solar' ? .045 : .035; ctx.fillStyle=ustyle.color;
    ctx.beginPath(); ctx.arc(rs.x,rs.y,activeRadius,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  const renderBeams = liveVisualBeams(viewState, beamFxNow);
  for (const b of renderBeams) drawBeamFx(b, beamFxNow);
  for (const p of viewState.players) if (p.alive && p.character==='jet' && p.jetBoost) drawJetBoostTrail(p, beamFxNow);
  for (const buffer of viewState.players) {
    if (!buffer.alive || buffer.character !== 'buffer' || !buffer.bufferLinkActive || !buffer.bufferTargetId) continue;
    const target = viewState.players.find(p => p.id === buffer.bufferTargetId && p.alive);
    if (target) { drawBufferThread(buffer, target, beamFxNow); drawBufferTargetAura(target, beamFxNow); }
  }

  const renderProjectiles = [...(viewState.projectiles || []), ...liveNetworkProjectiles(beamFxNow)];
  for (const p of renderProjectiles) {
    const s=worldToScreen(p.x,p.y), r=Math.max(2,p.radius*SCALE);
    if (p.character === 'dia' && p.ultimateProjectile) {
      const angle=Math.atan2(Number(p.vy)||0,Number(p.vx)||1);
      ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(angle+Math.PI/4);
      ctx.globalAlpha=.98; ctx.fillStyle='#258dcc'; ctx.strokeStyle='#0a3f69'; ctx.lineWidth=Math.max(1.4,Math.min(2.4,r*.48));
      const size=Math.max(4.5,r*1.75);
      ctx.beginPath(); ctx.moveTo(size,0); ctx.lineTo(0,size*.58); ctx.lineTo(-size,0); ctx.lineTo(0,-size*.58); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.globalAlpha=.78; ctx.strokeStyle='#d7f4ff'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(size*.55,0); ctx.lineTo(-size*.15,0); ctx.stroke();
      ctx.restore();
      continue;
    }
    ctx.beginPath(); ctx.arc(s.x,s.y,r,0,Math.PI*2);
    if (p.type === 'heal') ctx.fillStyle = p.character === 'wind' ? '#35b97e' : (p.character === 'star' ? '#d39a13' : (p.character === 'angel' ? '#c58a18' : '#168bc4'));
    else if (p.character === 'fire') ctx.fillStyle = '#ed5a25';
    else if (p.character === 'reactor') ctx.fillStyle = Number(p.reactorFxBand) >= 2 ? '#df4312' : (Number(p.reactorFxBand) >= 1 ? '#d8751d' : '#b56c32');
    else if (p.character === 'spray') ctx.fillStyle = '#1689a9';
    else if (p.character === 'sniper') ctx.fillStyle = '#8054bb';
    else if (p.character === 'mecha') ctx.fillStyle = '#2d9a61';
    else if (p.character === 'runner') ctx.fillStyle = '#d78113';
    else if (p.character === 'solar') ctx.fillStyle = '#d28b10';
    else ctx.fillStyle = p.team === 'A' ? '#3979d8' : '#dc5555';
    ctx.fill();
    ctx.strokeStyle='rgba(28,36,48,.82)'; ctx.lineWidth=Math.max(1,Math.min(1.9,r*.38)); ctx.stroke();
  }

  drawWorldFx(beamFxNow);

  // Sniper-only local distance guide. This is a purely client-side aid: the
  // first damage-band boundary (currently 16 m) is drawn only for the player
  // controlling Sniper, never for opponents or spectators.
  if (!spectatorMode) {
    const sniperGuidePlayer = viewState.players.find(p => p.id === myId && p.alive && p.character === 'sniper');
    if (sniperGuidePlayer) {
      const sniperDef = characterPublicDef('sniper');
      const guideRadiusWorld = Number(sniperDef?.distanceDamageBands?.[0]?.max || 16);
      const guideWorld = renderedPlayerWorldPosition(sniperGuidePlayer, beamFxNow);
      const guideScreen = worldToScreen(guideWorld.x, guideWorld.y);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,0,0,.92)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(guideScreen.x, guideScreen.y, guideRadiusWorld * SCALE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Local-only pre-cast radius guide for Iron/Water. Opponents never see this readiness guide;
    // the authoritative warning/effect rings are rendered for everyone after use.
    const ultGuidePlayer = viewState.players.find(p => p.id === myId && p.alive && (p.character === 'iron' || p.character === 'water'));
    if (ultGuidePlayer) {
      const udef = characterPublicDef(ultGuidePlayer.character);
      const cost = Math.max(0, Number(udef?.ultimateCost) || 0);
      const charge = Math.max(0, Number(ultGuidePlayer.ultimateCharge) || 0);
      const radiusWorld = Math.max(0, Number(udef?.ultimateRadius) || 0);
      if (cost > 0 && charge + 1e-9 >= cost && radiusWorld > 0) {
        const uw = renderedPlayerWorldPosition(ultGuidePlayer, beamFxNow);
        const us = worldToScreen(uw.x, uw.y);
        const pulse=.26+.06*Math.sin(beamFxNow*.006);
        ctx.save(); ctx.globalAlpha=pulse+.12; ctx.strokeStyle=ultGuidePlayer.character==='iron'?'#9a5a00':'#0876af'; ctx.lineWidth=2.0; ctx.setLineDash([7,7]);
        ctx.beginPath(); ctx.arc(us.x,us.y,radiusWorld*SCALE,0,Math.PI*2); ctx.stroke(); ctx.restore();
      }
    }
  }

  for (const p of viewState.players) {
    if (!p.alive) continue;
    const hitRadius = characterRadiusWorld(p.character) * SCALE;
    const renderWorld = renderedPlayerWorldPosition(p, beamFxNow);
    const s=worldToScreen(renderWorld.x,renderWorld.y), x=s.x,y=s.y;
    const characterFill = ({iron:'#8893a3',mecha:'#7fd3a7',solar:'#e6a93d',shield:'#4f9ed6',runner:'#f0a64b',shooter:'#58a6ff',sniper:'#cba6ff',cannon:'#d9a441',fire:'#ff704d',poison:'#9b6bd6',reactor:'#cfd5dc',spray:'#5fc7e6',water:'#4cc9f0',wind:'#73d6a6',star:'#e8d66b',angel:'#f5e7b2',buffer:'#bda7e8',light:'#f6d86b',laser:'#e04b88',ice:'#68d9f5',dia:(p.diaForm?'#d9fbff':'#79c8e8')})[p.character] || '#8793a3';
    const tokenImg = characterTokenImage(p.character);
    const art = characterArt(p.character);
    const tokenSize = tokenImg ? Math.max(30, Math.min(58, hitRadius * 3.65 * Number(art?.renderScale || 1))) : 0;
    // `radius` below is a visual radius used by rings/labels. Server hit/collision radius remains `hitRadius`.
    const radius = tokenImg ? Math.max(hitRadius, tokenSize/2) : hitRadius;
    // Faint body disc shows the true server hitbox footprint underneath the larger chibi art.
    ctx.save(); ctx.globalAlpha=tokenImg ? .16 : 1; ctx.fillStyle=characterFill;
    ctx.beginPath(); ctx.arc(x,y,hitRadius,0,Math.PI*2); ctx.fill(); ctx.restore();
    if (tokenImg) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tokenImg, x-tokenSize/2, y-tokenSize/2, tokenSize, tokenSize);
      if ((playerHitFlashUntil.get(p.id)||0) > beamFxNow) {
        ctx.globalAlpha=.52; ctx.filter='brightness(1.9) saturate(.35)';
        ctx.drawImage(tokenImg, x-tokenSize/2, y-tokenSize/2, tokenSize, tokenSize);
      }
      ctx.restore();
    } else if ((playerHitFlashUntil.get(p.id)||0) > beamFxNow) {
      ctx.save(); ctx.globalAlpha=.48; ctx.fillStyle='#ffffff';
      ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    // Always-visible team ring sits outside the token and is independent of character palette.
    ctx.save(); ctx.lineWidth = p.id === myId ? 4 : 2.2; ctx.strokeStyle = p.team === 'A' ? '#2f77ff' : '#ff4545';
    ctx.beginPath(); ctx.arc(x,y,radius+1.5,0,Math.PI*2); ctx.stroke(); ctx.restore();
    if (Number(p.ultimateActiveMs||0) > 0 && p.character !== 'angel') {
      const phase=beamFxNow*.006;
      const ustyle=ULTIMATE_FX_STYLE[p.character];
      const palette=ustyle?.color;
      const dark=ustyle?.dark || '#24303d';
      if (palette) {
        const rr=radius+10+2*Math.sin(phase);
        ctx.save();
        ctx.globalAlpha=.64+.16*Math.sin(phase+x*.01); ctx.strokeStyle=dark; ctx.lineWidth=5.2;
        ctx.beginPath(); ctx.arc(x,y,rr,0,Math.PI*2); ctx.stroke();
        ctx.globalAlpha=.88+.10*Math.sin(phase+x*.01); ctx.strokeStyle=palette; ctx.lineWidth=2.7;
        ctx.beginPath(); ctx.arc(x,y,rr,0,Math.PI*2); ctx.stroke();
        ctx.globalAlpha=.10; ctx.fillStyle=palette; ctx.beginPath(); ctx.arc(x,y,radius+8,0,Math.PI*2); ctx.fill();
        if (p.character==='runner' || p.character==='jet') {
          ctx.globalAlpha=.92; ctx.lineWidth=2.2;
          for (let k=0;k<3;k++) { const ar=radius+12+k*5; ctx.beginPath(); ctx.arc(x,y,ar,phase*2+k*2.0,phase*2+k*2.0+.8); ctx.stroke(); }
        }
        ctx.restore();
      }
      if (p.character === 'mecha') {
        const warningPulse=.65+.35*Math.sin(beamFxNow*.026);
        const mechaDef=characterPublicDef('mecha') || {};
        const dangerRadius=Math.max(0,Number(mechaDef.ultimateRadius)||16)*SCALE;
        ctx.save();
        // Keep the full real danger radius visible for the entire server-authoritative fuse.
        if (dangerRadius>0) {
          ctx.setLineDash([11,7]);
          ctx.globalAlpha=.76+.18*warningPulse; ctx.strokeStyle='#5d0b08'; ctx.lineWidth=6.2;
          ctx.beginPath(); ctx.arc(x,y,dangerRadius,0,Math.PI*2); ctx.stroke();
          ctx.globalAlpha=.96; ctx.strokeStyle='#d62f20'; ctx.lineWidth=3.1;
          ctx.beginPath(); ctx.arc(x,y,dangerRadius,0,Math.PI*2); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha=.055+.035*warningPulse; ctx.fillStyle='#d62f20';
          ctx.beginPath(); ctx.arc(x,y,dangerRadius,0,Math.PI*2); ctx.fill();
        }
        ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='900 25px system-ui';
        ctx.lineWidth=5; ctx.strokeStyle='#4b0705'; ctx.fillStyle='#ffe23b';
        ctx.globalAlpha=.82+.18*warningPulse;
        ctx.strokeText('!',x,y-radius-30); ctx.fillText('!',x,y-radius-30);
        // A small inner pulse keeps the armed Mecha itself easy to identify inside the large circle.
        ctx.globalAlpha=.82; ctx.strokeStyle='#d62f20'; ctx.lineWidth=3.4;
        ctx.beginPath(); ctx.arc(x,y,radius+14+3*warningPulse,0,Math.PI*2); ctx.stroke();
        ctx.restore();
      }
    }
    if (Number(p.pendingUltimateMs||0) > 0 && isDelayedWarningUltimate(p.pendingUltimateId || p.character)) {
      const warningId=p.pendingUltimateId || p.character;
      const warningDef=characterPublicDef(warningId) || {};
      const warningRadius=Math.max(0,Number(warningDef.ultimateRadius)||0)*SCALE;
      const warningStyle=ULTIMATE_FX_STYLE[warningId] || {color:'#d97706',dark:'#4b2d00'};
      const warningPulse=.60+.40*Math.sin(beamFxNow*.030);
      ctx.save();
      if (warningRadius>0) {
        ctx.globalAlpha=.72+.20*warningPulse; ctx.setLineDash([10,7]); ctx.strokeStyle=warningStyle.dark; ctx.lineWidth=6;
        ctx.beginPath(); ctx.arc(x,y,warningRadius,0,Math.PI*2); ctx.stroke();
        ctx.globalAlpha=.92; ctx.strokeStyle=warningStyle.color; ctx.lineWidth=2.8;
        ctx.beginPath(); ctx.arc(x,y,warningRadius,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha=.06+.04*warningPulse; ctx.fillStyle=warningStyle.color; ctx.beginPath(); ctx.arc(x,y,warningRadius,0,Math.PI*2); ctx.fill();
      }
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='900 27px system-ui';
      ctx.globalAlpha=.88+.12*warningPulse; ctx.lineWidth=6; ctx.strokeStyle='#2b1c08'; ctx.fillStyle='#ffe53d';
      ctx.strokeText('!',x,y-radius-31); ctx.fillText('!',x,y-radius-31);
      ctx.restore();
    }
    if (p.shield > 0) {
      const spulse=.72 + .18*Math.sin(beamFxNow*.010 + x*.01);
      ctx.save();
      ctx.globalAlpha=.65+.15*spulse; ctx.lineWidth=5.0; ctx.strokeStyle='#07518a';
      ctx.beginPath(); ctx.arc(x,y,radius+6,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=.92; ctx.lineWidth=2.5; ctx.strokeStyle='#1598d2';
      ctx.beginPath(); ctx.arc(x,y,radius+6,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=.08; ctx.fillStyle='#1598d2'; ctx.beginPath(); ctx.arc(x,y,radius+4,0,Math.PI*2); ctx.fill(); ctx.restore();
    }
    if (p.id === selectedTargetId) {
      const meForTarget = viewState.players.find(q => q.id === myId);
      const targetState = targetSelectionState(meForTarget, p);
      if (targetState && targetState.valid) {
        ctx.save();
        ctx.lineWidth=3.5; ctx.strokeStyle=targetState.inRange ? '#67e8f9' : '#9aa6b2';
        ctx.setLineDash(targetState.inRange ? [] : [5,4]);
        ctx.beginPath(); ctx.arc(x,y,radius+12,0,Math.PI*2); ctx.stroke();
        ctx.restore();
        if (meForTarget && meForTarget.character==='buffer' && meForTarget.bufferTargetId===p.id && !meForTarget.bufferLinkActive) drawBufferOutOfRangeMarker(p, beamFxNow);
      }
    }
    if (p.burning) { ctx.save(); ctx.globalAlpha=.68+.24*Math.sin(beamFxNow*.018+x*.02); ctx.lineWidth=2.2; ctx.strokeStyle='#ffb347'; ctx.beginPath(); ctx.arc(x,y,radius+4,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    if (p.poisoned) { ctx.save(); ctx.globalAlpha=.72+.18*Math.sin(beamFxNow*.012+y*.02); ctx.lineWidth=2.5; ctx.strokeStyle='#c58cff'; ctx.beginPath(); ctx.arc(x,y,radius+5,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    if (p.radiated) {
      ctx.save(); ctx.globalAlpha=.68+.18*Math.sin(beamFxNow*.013+x*.017); ctx.lineWidth=2.3; ctx.strokeStyle='#ff8a3d';
      const rr=radius+6, rp=beamFxNow*.0022;
      for (let k=0;k<3;k++) { const start=rp+k*Math.PI*2/3; ctx.beginPath(); ctx.arc(x,y,rr,start,start+.92); ctx.stroke(); }
      ctx.restore();
    }
    const reactorDef = characterPublicDef('reactor');
    if (p.character === 'reactor' && reactorDef && Number(p.reactorOutput||0) >= Number(reactorDef.reactorHighThreshold||66)) {
      const glowPulse=.72+.18*Math.sin(beamFxNow*.012+x*.011);
      ctx.save(); ctx.globalAlpha=.28*glowPulse; ctx.fillStyle='#ff6f22'; ctx.shadowColor='#ff6f22'; ctx.shadowBlur=16;
      ctx.beginPath(); ctx.arc(x,y,radius+8,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=.82; ctx.lineWidth=2.6; ctx.strokeStyle='#ff8a3d'; ctx.beginPath(); ctx.arc(x,y,radius+7,0,Math.PI*2); ctx.stroke(); ctx.restore();
    }
    if (p.character === 'jet' && p.jetBoost) {
      const jp=.72+.22*Math.sin(beamFxNow*.022);
      ctx.save();
      ctx.globalAlpha=.12*jp; ctx.fillStyle='#158ab5'; ctx.beginPath(); ctx.arc(x,y,radius+9,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=.76; ctx.lineWidth=4.8; ctx.strokeStyle='#08445f'; ctx.beginPath(); ctx.arc(x,y,radius+7,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=.98; ctx.lineWidth=2.2; ctx.strokeStyle='#2fa9d2'; ctx.beginPath(); ctx.arc(x,y,radius+7,0,Math.PI*2); ctx.stroke(); ctx.restore();
    }
    if (p.tailwind) { ctx.save(); ctx.globalAlpha=.78; ctx.lineWidth=4.2; ctx.strokeStyle='#07563a'; ctx.beginPath(); ctx.arc(x,y,radius+7,0,Math.PI*2); ctx.stroke(); ctx.globalAlpha=.96; ctx.lineWidth=2; ctx.strokeStyle='#24a86f'; ctx.beginPath(); ctx.arc(x,y,radius+7,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    if (p.frozen) { ctx.save(); ctx.globalAlpha=.72+.18*Math.sin(beamFxNow*.011+x*.015); ctx.lineWidth=4.5; ctx.strokeStyle='#07566d'; ctx.beginPath(); ctx.arc(x,y,radius+5,0,Math.PI*2); ctx.stroke(); ctx.lineWidth=2.3; ctx.strokeStyle='#159cbd'; ctx.beginPath(); ctx.arc(x,y,radius+5,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    if (p.stunned) { ctx.save(); ctx.lineWidth=5; ctx.strokeStyle='#684b00'; ctx.beginPath(); ctx.arc(x,y,radius+9,0,Math.PI*2); ctx.stroke(); ctx.lineWidth=2.8; ctx.strokeStyle='#e3a700'; ctx.beginPath(); ctx.arc(x,y,radius+9,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    if (p.diaForm) {
      const dp=.68+.24*Math.sin(beamFxNow*.010 + x*.013);
      ctx.save();
      ctx.globalAlpha=.10*dp; ctx.fillStyle='#258dcc'; ctx.beginPath(); ctx.arc(x,y,radius+11,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=.76+.18*Math.sin(beamFxNow*.014); ctx.lineWidth=4.6; ctx.strokeStyle='#0b4d7a'; ctx.beginPath(); ctx.arc(x,y,radius+8,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle='#258dcc';
      for (let k=0;k<4;k++) { const ang=beamFxNow*.0018+k*Math.PI/2; const rr=radius+13+2*Math.sin(beamFxNow*.006+k); ctx.globalAlpha=.52+.38*Math.sin(beamFxNow*.012+k); ctx.beginPath(); ctx.arc(x+Math.cos(ang)*rr,y+Math.sin(ang)*rr,1.4,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
    }
    if (p.invulnerable) {
      ctx.save();
      const ip=.74+.22*Math.sin(beamFxNow*.014+x*.01);
      ctx.globalAlpha=.68*ip; ctx.lineWidth=8; ctx.strokeStyle='#6e4900';
      ctx.beginPath(); ctx.arc(x,y,radius+11,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=.98; ctx.lineWidth=3.2; ctx.strokeStyle='#c58a12';
      ctx.beginPath(); ctx.arc(x,y,radius+11,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=.10; ctx.fillStyle='#dca21b'; ctx.beginPath(); ctx.arc(x,y,radius+8,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    const target=worldToScreen(p.aimX,p.aimY), adx=target.x-x, ady=target.y-y, al=Math.hypot(adx,ady)||1;
    ctx.strokeStyle='rgba(28,36,48,.58)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+(adx/al)*(radius+9),y+(ady/al)*(radius+9)); ctx.stroke();

    // Art-enabled characters use the fixed token above. Others keep the legacy emoji fallback.
    const meta = CHARACTER_META[p.character];
    if (meta) {
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      if (!tokenImg) {
        const emojiSize=Math.max(12,Math.min(17,radius*1.65));
        ctx.font=`${emojiSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.shadowColor='rgba(0,0,0,.65)'; ctx.shadowBlur=2;
        ctx.fillText(meta.icon,x,y+0.5);
        ctx.shadowBlur=0;
      }
      ctx.font='700 10px system-ui';
      ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.88)';
      ctx.strokeText(meta.name,x,y+radius+12);
      ctx.fillStyle='#ffffff';
      ctx.fillText(meta.name,x,y+radius+12);
      ctx.restore();
    }

    const bw=42,bh=5,bx=x-bw/2,by=y-radius-15;
    const needsHealingAttention = healerAttentionEnabled && healerViewer && p.id !== healerViewer.id && p.team === healerViewer.team && healerLowHpAttention.has(p.id);
    if (!spectatorMode && p.id === myId) {
      // Local-only "this is me" marker. No network data is needed.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x-6,by-34); ctx.lineTo(x+6,by-34); ctx.lineTo(x,by-24); ctx.closePath();
      ctx.lineWidth=2; ctx.strokeStyle='rgba(0,0,0,.88)'; ctx.fillStyle='#ffffff';
      ctx.stroke(); ctx.fill();
      ctx.restore();
    }
    if (needsHealingAttention) {
      const hpRatio=Math.max(0,Math.min(1,Number(p.hp||0)/Math.max(1,Number(p.maxHp||1))));
      const danger=Math.max(0,Math.min(1,(0.50-hpRatio)/0.50));
      const pulse=.72+.28*Math.sin(beamFxNow*.012 + x*.018 + y*.011);
      ctx.save();
      ctx.globalAlpha=.58+.22*pulse;
      ctx.fillStyle='rgba(111,255,157,.24)';
      ctx.shadowColor='#6fff9d';
      ctx.shadowBlur=(10+14*danger)*pulse;
      ctx.fillRect(bx-2,by-2,bw+4,bh+4);
      ctx.restore();
    }
    ctx.fillStyle='#241e24'; ctx.fillRect(bx,by,bw,bh);
    if (needsHealingAttention) {
      const hpRatio=Math.max(0,Math.min(1,Number(p.hp||0)/Math.max(1,Number(p.maxHp||1))));
      const danger=Math.max(0,Math.min(1,(0.50-hpRatio)/0.50));
      const pulse=.76+.24*Math.sin(beamFxNow*.012 + x*.018 + y*.011);
      ctx.save();
      ctx.fillStyle='#a8ffbf';
      ctx.shadowColor='#6fff9d';
      ctx.shadowBlur=(7+11*danger)*pulse;
      ctx.fillRect(bx,by,bw*hpRatio,bh);
      ctx.restore();
    } else {
      ctx.fillStyle='#7ee18b'; ctx.fillRect(bx,by,bw*Math.max(0,p.hp/p.maxHp),bh);
    }
    if (p.character === 'reactor') {
      const output=Math.max(0,Math.min(100,Number(p.reactorOutput)||0));
      ctx.fillStyle='rgba(10,13,18,.86)'; ctx.fillRect(bx,by+7,bw,3);
      ctx.fillStyle='#ffffff'; ctx.fillRect(bx,by+7,bw*(output/100),3);
    }
    if (p.shield > 0 && p.maxShield > 0) {
      ctx.fillStyle='#1a2734'; ctx.fillRect(bx,by-5,bw,3);
      ctx.fillStyle='#65c7ff'; ctx.fillRect(bx,by-5,bw*Math.max(0,Math.min(1,p.shield/p.maxShield)),3);
    }
    ctx.save();
    ctx.font='700 11px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.lineWidth=3; ctx.lineJoin='round'; ctx.strokeStyle='rgba(255,255,255,.92)';
    ctx.strokeText(`${p.team} ${p.name}`,x,by-7);
    ctx.fillStyle='#17202a'; ctx.fillText(`${p.team} ${p.name}`,x,by-7);
    ctx.restore();
    if (needsHealingAttention) {
      const hpRatio=Math.max(0,Math.min(1,Number(p.hp||0)/Math.max(1,Number(p.maxHp||1))));
      const danger=Math.max(0,Math.min(1,(0.50-hpRatio)/0.50));
      const pulse=.78+.22*Math.sin(beamFxNow*.012 + x*.018 + y*.011);
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font='800 9px system-ui';
      ctx.lineWidth=2.5; ctx.strokeStyle='rgba(7,24,14,.92)';
      ctx.strokeText('치유 필요!',x,by-19);
      ctx.globalAlpha=.88+.12*pulse;
      ctx.fillStyle=danger>.55 ? '#d7ffe1' : '#b8ffca';
      ctx.shadowColor='#6fff9d'; ctx.shadowBlur=(4+7*danger)*pulse;
      ctx.fillText('치유 필요!',x,by-19);
      ctx.restore();
    }
  }

  const me = spectatorMode ? null : viewState.players.find(p => p.id === myId);
  if (me && me.character === 'buffer') {
    const serverTarget = me.bufferTargetId ? viewState.players.find(p => p.id === me.bufferTargetId && p.alive) : null;
    selectedTargetId = serverTarget ? serverTarget.id : null;
  } else if (!currentTargetingRule() || !viewState.players.some(p => p.id === selectedTargetId && p.alive)) selectedTargetId = null;
  const t = Math.ceil(viewState.timeLeft); $('timer').textContent = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  if (spectatorMode) {
    $('myInfo').innerHTML = '';
    $('respawn').textContent = '';
    $('actionButtons').classList.add('hidden');
    $('abilityButton').classList.add('hidden');
    $('ultimateButton').classList.add('hidden');
    $('ultimateHud').classList.add('hidden');
  }
  $('scoreA').textContent = Math.floor(viewState.scoreA); $('scoreB').textContent = Math.floor(viewState.scoreB);
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
    } else if (me.character === 'wind') {
      if (me.windTailwindMs > 0) extra = `<br>🌪️ 순풍 ${(me.windTailwindMs/1000).toFixed(1)}초 · 쿨 ${(me.windTailwindCooldownMs/1000).toFixed(1)}초`;
      else if (me.windTailwindCooldownMs > 0) extra = `<br>🌪️ 순풍 쿨 ${(me.windTailwindCooldownMs/1000).toFixed(1)}초`;
      else extra = '<br>🌪️ 순풍 준비 완료';
    } else if (me.character === 'angel') {
      if (me.angelBlessCooldownMs > 0) extra = `<br>😇 축복 쿨 ${(me.angelBlessCooldownMs/1000).toFixed(1)}초`;
      else extra = `<br>축복 준비 완료${selectedTargetId ? '' : ' · 대상 선택 필요'}`;
    } else if (me.character === 'jet') {
      if (me.jetBoost) extra = `<br>🚀 부스터 ${(me.jetBoostMs/1000).toFixed(1)}초`;
      else if (me.jetBoostCooldownMs > 0) extra = `<br>🚀 부스터 쿨 ${(me.jetBoostCooldownMs/1000).toFixed(1)}초`;
      else extra = '<br>🚀 부스터 준비 완료';
      if (me.shield > 0 && me.jetShieldMs > 0) extra += ` · 보호막 ${(me.jetShieldMs/1000).toFixed(1)}초`;
    } else if (me.character === 'buffer') {
      const target = me.bufferTargetId ? viewState.players.find(p => p.id === me.bufferTargetId && p.alive) : null;
      if (!target) extra = '<br>🎛️ 연결 대상 선택 필요';
      else extra = `<br>🎛️ ${me.bufferLinkActive ? '연결 중' : '범위 밖 · 지정 유지'} · ${escapeHtml(target.name)}`;
    }
    else if (me.character === 'shield') {
      const target = selectedTargetId ? viewState.players.find(p => p.id === selectedTargetId && p.alive) : null;
      const charges = Math.max(0, Number(me.shieldAbilityCharges) || 0);
      extra = `<br>🛡️ 충전 ${charges}/${fmtNumber(characterPublicDef('shield')?.shieldMaxCharges || 2)}`;
      if (me.shieldRechargeMs > 0) extra += ` · 다음 ${(me.shieldRechargeMs/1000).toFixed(1)}초`;
      if (target) extra += ` · 대상 ${escapeHtml(target.name)}`;
    }
    else if (me.character === 'reactor') {
      const reactorOutput = Math.max(0, Math.min(100, Number(me.reactorOutput) || 0));
      const reactorStage = reactorOutput >= 66 ? 3 : (reactorOutput >= 33 ? 2 : 1);
      extra = `<br>☢️ 출력 에너지 ${Math.round(reactorOutput)}% · ${reactorStage}단계`;
      if (reactorStage === 3) extra += ' · 방사능 활성';
    }
    const shieldLine = me.shield > 0 ? `<br>🛡️ 보호막 ${Math.ceil(me.shield)}/${Math.ceil(me.maxShield || me.shield)}${me.shieldMs > 0 ? ` · ${(me.shieldMs/1000).toFixed(1)}초` : ''}` : '';
    const stunLine = me.stunned ? '<br>💫 기절' : '';
    const ultDef = characterPublicDef(me.character);
    const ultCost = Math.max(0, Number(ultDef?.ultimateCost) || 0);
    const ultCharge = ultCost > 0 ? Math.max(0, Math.min(ultCost, Number(me.ultimateCharge) || 0)) : 0;
    const ultPct = ultCost > 0 ? Math.floor(ultCharge / ultCost * 100) : 0;
    const ultReady = ultCost > 0 && ultCharge + 1e-9 >= ultCost;
    const ultActiveMs = Math.max(0, Number(me.ultimateActiveMs) || 0);
    let ultInfoLine = '';
    if (ultCost > 0) {
      const ultName = escapeHtml(ultDef?.ultimateName || '궁극기');
      if (ultActiveMs > 0) {
        ultInfoLine = `<span class="my-info-ultimate active">⚡ ${ultName} 0% · 활성 ${(ultActiveMs/1000).toFixed(1)}초</span>`;
      } else if (ultReady) {
        ultInfoLine = `<span class="my-info-ultimate ready">⚡ ${ultName} 100% · 준비 완료</span>`;
      } else {
        ultInfoLine = `<span class="my-info-ultimate">⚡ ${ultName} ${ultPct}% · ${Math.floor(ultCharge)}/${Math.floor(ultCost)}</span>`;
      }
    }
    $('myInfo').innerHTML = `<b>${m.icon} ${m.name}</b><br>HP ${Math.max(0,Math.ceil(me.hp))}/${me.maxHp}${shieldLine}<br>${me.team}팀${stunLine}${extra}${ultInfoLine}`;
    $('respawn').textContent = me.alive ? '' : `부활 ${(me.respawnMs/1000).toFixed(1)}초`;

    // Alpha 1.6.1: ultimate charge now lives in the top-left personal info card.
    // Keep the legacy bottom-center meter hidden; the action button remains the cast control.
    const ultimateHud = $('ultimateHud');
    if (ultimateHud) ultimateHud.classList.add('hidden');
    const ultimateButton = $('ultimateButton');
    if (ultCost > 0) {
      ultimateButton.classList.remove('hidden');
      ultimateButton.classList.toggle('ready', ultReady);
      ultimateButton.disabled = !me.alive || me.stunned || !ultReady;
      ultimateButton.textContent = ultReady ? `⚡ ${ultDef?.ultimateName || '궁극기'} · R` : `⚡ ${ultPct}%`;
    } else {
      ultimateButton.classList.add('hidden');
      ultimateButton.classList.remove('ready');
      ultimateButton.disabled = true;
    }

    const ability = $('abilityButton');
    const hasAbility = me.character === 'dia' || me.character === 'runner' || me.character === 'wind' || me.character === 'angel' || me.character === 'shield' || me.character === 'jet';
    ability.classList.toggle('hidden', !hasAbility);
    const actionButtons = $('actionButtons');
    actionButtons.classList.toggle('hidden', !hasAbility && ultCost <= 0);
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
    } else if (me.character === 'wind') {
      if (!me.alive) { ability.textContent = '🌪️ 부활 대기'; ability.disabled = true; ability.classList.remove('active'); }
      else if (me.windTailwindMs > 0) { ability.textContent = `🌪️ 순풍 ${(me.windTailwindMs/1000).toFixed(1)}`; ability.disabled = true; ability.classList.add('active'); }
      else if (me.windTailwindCooldownMs > 0) { ability.textContent = `🌪️ 쿨 ${(me.windTailwindCooldownMs/1000).toFixed(1)}`; ability.disabled = true; ability.classList.remove('active'); }
      else { ability.textContent = '🌪️ 순풍'; ability.disabled = false; ability.classList.remove('active'); }
    } else if (me.character === 'jet') {
      if (!me.alive) { ability.textContent = '🚀 부활 대기'; ability.disabled = true; ability.classList.remove('active'); }
      else if (me.jetBoost) { ability.textContent = `🚀 부스터 ${(me.jetBoostMs/1000).toFixed(1)}`; ability.disabled = true; ability.classList.add('active'); }
      else if (me.jetBoostCooldownMs > 0) { ability.textContent = `🚀 쿨 ${(me.jetBoostCooldownMs/1000).toFixed(1)}`; ability.disabled = true; ability.classList.remove('active'); }
      else { ability.textContent = '🚀 부스터'; ability.disabled = false; ability.classList.remove('active'); }
    } else if (me.character === 'shield') {
      const target = viewState.players.find(p => p.id === selectedTargetId && p.alive);
      const def = characterPublicDef('shield');
      const charges = Math.max(0, Number(me.shieldAbilityCharges) || 0);
      const maxCharges = Number(def?.shieldMaxCharges || 2);
      if (!me.alive) { ability.textContent = '🛡️ 부활 대기'; ability.disabled = true; ability.classList.remove('active'); }
      else if (charges <= 0) { ability.textContent = `🛡️ 충전 0/${maxCharges}${me.shieldRechargeMs > 0 ? ` · ${(me.shieldRechargeMs/1000).toFixed(1)}초` : ''}`; ability.disabled = true; ability.classList.remove('active'); }
      else if (!target) { ability.textContent = `🛡️ 대상 선택 · ${charges}/${maxCharges}`; ability.disabled = true; ability.classList.remove('active'); }
      else { ability.textContent = `🛡️ 보호막 · ${target.name} · ${charges}/${maxCharges}`; ability.disabled = false; ability.classList.remove('active'); }
    } else if (me.character === 'angel') {
      const target = viewState.players.find(p => p.id === selectedTargetId && p.alive);
      if (!me.alive) { ability.textContent = '😇 부활 대기'; ability.disabled = true; ability.classList.remove('active'); }
      else if (me.angelBlessCooldownMs > 0) { ability.textContent = `😇 쿨 ${(me.angelBlessCooldownMs/1000).toFixed(1)}`; ability.disabled = true; ability.classList.remove('active'); }
      else if (!target) { ability.textContent = '😇 대상 선택'; ability.disabled = true; ability.classList.remove('active'); }
      else { ability.textContent = `😇 축복 · ${target.name}`; ability.disabled = false; ability.classList.remove('active'); }
    }
  }
}
renderGame();
