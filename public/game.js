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
  runner:  { role:'딜러', name:'러너', icon:'🏃', summary:'짧은 사거리와 질주를 활용하는 초고기동 딜러' },
  shooter: { role:'딜러', name:'슈터', icon:'🎯', summary:'가장 표준적인 원거리 딜러' },
  sniper:  { role:'딜러', name:'스나이퍼', icon:'🔭', summary:'멀수록 한 발이 강해지는 초장거리 딜러' },
  cannon:  { role:'딜러', name:'캐논', icon:'💥', summary:'기동성을 버리고 화력을 얻은 중화기 딜러' },
  fire:    { role:'딜러', name:'파이어', icon:'🔥', summary:'빠르게 움직이며 지속 피해를 남기는 딜러' },
  poison:  { role:'딜러', name:'포이즌', icon:'☠️', summary:'외부 치유를 약화시키는 안티힐 광선 딜러' },
  reactor: { role:'딜러', name:'리액터', icon:'☢️', summary:'공격을 이어갈수록 출력이 상승하는 성장형 딜러' },
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
let selectedJoinTeam = null;
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
    const oneSideDps = (Number(c.damage || 0) + Number(c.spraySideDamage || 0)) * Number(c.fireRate || 0);
    const maxDps = (Number(c.damage || 0) + 2 * Number(c.spraySideDamage || 0)) * Number(c.fireRate || 0);
    throughput = `${fmtNumber(centerDps)} / ${fmtNumber(oneSideDps)} / ${fmtNumber(maxDps)}`;
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
    throughputLabel = 'HPS';
    throughput = fmtNumber(Number(c.heal || 0) * Number(c.fireRate || 0));
    rateLabel = '치유 속도';
    rate = `${fmtNumber(c.fireRate)}발/s`;
  } else {
    throughput = fmtNumber(Number(c.damage || 0) * Number(c.fireRate || 0));
    rate = `${fmtNumber(c.fireRate)}발/s`;
  }

  return [
    ['체력', `${fmtNumber(c.hp)} HP`],
    ['공격 방식', attackType],
    ['사거리', range],
    [throughputLabel, throughput],
    [rateLabel, rate],
    ['이동속도', `${speedLabel(c.speed)} · ${fmtNumber(c.speed)} m/s`],
    ['크기', sizeLabel(c.radius)]
  ];
}

function buildCharacterMini(id, meta) {
  const c = characterPublicDef(id);
  if (!c) return meta.summary || '';
  const move = speedLabel(c.speed);
  if (c.role === '탱커') return `${fmtNumber(c.hp)} HP · ${move}`;
  if (id === 'buffer') return `${fmtNumber(c.linkHealHps)} HPS + 행동속도 ${fmtNumber(Number(c.actionSpeedBoost||0)*100)}% · ${move}`;
  if (c.projectileType === 'heal') return `${fmtNumber(Number(c.heal||0)*Number(c.fireRate||0))} HPS · ${move}`;
  if (c.attackType === 'lightBeam') return `${fmtNumber(c.healHps)} HPS · ${move}`;
  if (id === 'reactor' && Array.isArray(c.reactorOutputBands)) return `${c.reactorOutputBands.map(b=>fmtNumber(Number(b.damage||0)*Number(c.fireRate||0))).join('/')} DPS · ${move}`;
  if (id === 'sniper' && Array.isArray(c.distanceDamageBands)) return `${c.distanceDamageBands.map(b=>fmtNumber(Number(b.damage||0)*Number(c.fireRate||0))).join('/')} DPS · ${move}`;
  if (id === 'spray') return `${fmtNumber(Number(c.damage||0)*Number(c.fireRate||0))} DPS 중심 · 최대 ${fmtNumber((Number(c.damage||0)+2*Number(c.spraySideDamage||0))*Number(c.fireRate||0))} · ${move}`;
  if (c.attackType === 'beam') return `${fmtNumber(c.beamDps)} DPS · ${move}`;
  return `${fmtNumber(Number(c.damage||0)*Number(c.fireRate||0))} DPS · ${move}`;
}

function buildCharacterMechanic(id, fallback='') {
  const c = characterPublicDef(id);
  if (!c) return fallback;
  const bands = Array.isArray(c.distanceDamageBands) ? c.distanceDamageBands : [];
  switch (id) {
    case 'iron': return `높은 ${fmtNumber(c.hp)} HP로 전선을 버티는 캐릭터. 탄속은 느리지만 꾸준히 공격하면서 적 진입을 받아내기 좋다.`;
    case 'mecha': return `사거리 ${fmtNumber(c.range)} m로 짧고 화력은 낮지만, HP ${fmtNumber(c.hp)}와 ${speedLabel(c.speed)} 이동속도로 먼저 공간을 차지하고 적의 공격을 받아내는 데 강하다.`;
    case 'jet': return `능력을 사용하면 현재 조준 방향으로 최대 12m를 돌진한다. 돌진 중 벽이나 맵 경계에 닿으면 즉시 돌진이 끝난다. 돌진 후 50의 보호막을 얻는다.`;
    case 'dia': return `능력을 사용하면 6초간 다이아폼으로 변신해 50 더 높은 체력, 한 단계 더 높은 이동속도, 짧지만 더 강한 광선형 공격으로 변한다. 다이아폼에서 적을 직접 처치하면 남은 쿨다운이 6초 감소한다.`;
    case 'solar': return `공격하는 동안 사거리 ${fmtNumber(c.range)} m의 ${fmtNumber(c.beamDps)} DPS 광선을 유지하고, 동시에 초당 ${fmtNumber(c.solarFireRate)}발의 사거리 ${fmtNumber(c.solarProjectileRange)} m 태양탄(${fmtNumber(c.solarProjectileDamage)} 피해)을 발사한다. 태양탄이 적 본체에 실제 피해를 주면 HP를 ${fmtNumber(c.solarSelfHeal)} 회복한다.`;
    case 'runner': return `빠른 작은 투사체를 초당 ${fmtNumber(c.fireRate)}발 발사한다. Space 또는 능력 버튼을 누르면 ${fmtNumber(c.sprintDuration)}초 동안 이동속도가 한 단계 올라간다. 질주 재사용 대기시간은 ${fmtNumber(c.sprintCooldown)}초다.`;
    case 'shooter': return `빠르고 작은 탄을 초당 ${fmtNumber(c.fireRate)}발 발사한다. 특별한 조건 없이 꾸준한 화력을 내기 쉬워 입문용으로 좋다.`;
    case 'sniper': return bands.length >= 2 ? `매우 빠른 작은 투사체를 초당 ${fmtNumber(c.fireRate)}발 발사한다. 실제 비행거리 ${fmtNumber(bands[0].max)} m 이하는 발당 ${fmtNumber(bands[0].damage)} 피해(${fmtNumber(Number(bands[0].damage||0)*Number(c.fireRate||0))} DPS), 그보다 멀어 최대 ${fmtNumber(bands[1].max)} m까지는 발당 ${fmtNumber(bands[1].damage)} 피해(${fmtNumber(Number(bands[1].damage||0)*Number(c.fireRate||0))} DPS)를 준다.` : fallback;
    case 'cannon': return `초당 ${fmtNumber(c.fireRate)}발을 퍼붓는 높은 지속 화력을 가진다. 대신 이동속도가 ${speedLabel(c.speed)} ${fmtNumber(c.speed)} m/s라 위치를 잘못 잡으면 도망치기 어렵다.`;
    case 'fire': return `적중한 적에게 ${fmtNumber(c.burnDuration)}초 동안 ${fmtNumber(c.burnDps)} DPS의 화상을 남긴다. 체력은 낮지만 빠른 이동속도로 위치를 바꾸며 싸우기 좋다.`;
    case 'poison': return `광선이 적에게 닿으면 그 적이 다른 캐릭터에게 받는 치유량이 ${fmtNumber(c.poisonHealReduction*100)}% 감소한다. 중독은 마지막 적중 후 ${fmtNumber(c.poisonDuration)}초 유지되며 비전투 회복에는 영향을 주지 않는다.`;
    case 'reactor': return `적에게 피해를 준 만큼 출력이 조금씩 상승한다. 출력이 높아질수록 공격력이 증가하며, 66% 이상의 출력에 도달하면 '각성 상태'가 시작되어 이동속도가 한 단계 상승하고 투사체가 적중한 적에게 1.5초간 외부 치유가 25% 감소하는 상태 이상을 건다. 적에게 피해를 주지 못하면 출력이 다시 떨어지고, 죽었다 부활하면 출력이 0%가 된다.`;
    case 'spray': return `세 갈래로 나눠서 공격한다. 중앙탄은 가장 대미지가 높고, 좌우 보조탄은 대미지가 약하다. DPS는 중앙탄 75 / 좌측 보조탄 25 / 우측 보조탄 25다.`;
    case 'laser': return `기본 ${fmtNumber(c.beamDps)} DPS에 대상 최대 HP의 ${fmtNumber(c.maxHpDpsRatio*100)}%/s만큼 피해가 추가되어 체력이 높은 적을 상대할 때 특히 강하다.`;
    case 'ice': return `광선이 적에게 닿으면 이동속도를 1단계 낮춘다. 이 효과는 마지막 적중 후 1.5초 유지된다.`;
    case 'water': return `오른쪽 스틱으로 아군을 조준해 큰 치유탄을 초당 ${fmtNumber(c.fireRate)}발 발사한다. 치유탄은 적을 통과하고 처음 맞은 아군을 회복시킨다.`;
    case 'wind': return `치유탄은 기존처럼 아군을 회복한다. Space 또는 능력 버튼으로 순풍을 사용하면 자신을 포함한 살아 있는 모든 아군의 이동속도가 ${fmtNumber(c.tailwindDuration)}초 동안 1단계 빨라진다. 순풍 쿨다운은 ${fmtNumber(c.tailwindCooldown)}초이며 사용 즉시 시작한다.`;
    case 'star': return `초당 ${fmtNumber(c.fireRate)}발의 매우 빠른 작은 치유탄을 발사하며, 한 발당 아군 HP를 ${fmtNumber(c.heal)} 회복한다. 자신은 치유할 수 없고 공격 능력은 없다.`;
    case 'angel': return `자신 또는 살아 있는 아군을 지정한 뒤 능력을 사용하면 위치와 상관없이 즉시 100 HP를 회복시킨다.`;
    case 'buffer': return `살아 있는 아군을 클릭하면 그 대상을 강화한다. 16m 안에서 연결이 이어지며, 40 HPS와 공격 속도 25% 증가를 제공한다. 16m 밖으로 나가면 연결이 끊어진다. 광선형 공격과 능력 쿨다운은 가속하지 못한다.`;
    case 'light': return `광선이 처음 만난 아군 1명을 ${fmtNumber(c.healHps)} HPS로 치유한 뒤 관통하고, 이후 처음 만나는 적에게 ${fmtNumber(c.beamDps)} DPS를 준다. 적을 먼저 만나면 적에게만 피해를 준다.`;
    default: return fallback;
  }
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
  detail.innerHTML = `<div class="character-detail-head"><div class="character-detail-name">${m.icon} ${displayName}</div><span class="role-badge">${displayRole}</span></div><div class="character-stat-grid">${statHtml}</div><div class="character-traits"><div class="character-traits-title">특성</div><div class="character-summary">${m.summary}</div><div class="character-mechanic">${buildCharacterMechanic(detailId, m.mechanic)}</div></div>${taken ? '<div class="character-taken-note">🔒 같은 팀원이 사용 중</div>' : ''}`;
}

function selectLobbyCharacter(id) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type:'select', character:id }));
}

let ws = null, myId = null, config = null, state = null;
let spectatorMode = false;
let adminStatsAuthorized = false;
let lastAdminStatsData = null;
let selectedCompetitiveStatsVersion = null;
let selectedTargetId = null; // Targeted ability selection (Angel Blessing and future targeted abilities).

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
  const durations={muzzle:90,heal:220,death:380,respawn:420,ability:240,diaTransform:520,jetStart:260,jetEnd:300,jetWallSpark:220,reactor33:300,reactor66:420,reactor100:520,reactorDown:260,radiationStart:260,angelCast:260,angelBless:520,bufferLink:320,windTailwindCast:420};
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
      if (after.id===myId) playHealConfirm();
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
  }
}

$('nameInput').value = localStorage.getItem('schoolLineName') || '';
$('roomInput').value = localStorage.getItem('schoolLineRoom') || '6-1';


const RESUME_TOKEN_KEY = 'schoolLineResumeToken';
const RESUME_ROOM_KEY = 'schoolLineResumeRoom';

function getResumeCredentials() {
  const resumeToken = String(localStorage.getItem(RESUME_TOKEN_KEY) || '');
  const room = String(localStorage.getItem(RESUME_ROOM_KEY) || '');
  return resumeToken && room ? { resumeToken, room } : null;
}
function saveResumeCredentials(room, resumeToken) {
  if (!room || !resumeToken) return;
  localStorage.setItem(RESUME_ROOM_KEY, room);
  localStorage.setItem(RESUME_TOKEN_KEY, resumeToken);
  refreshResumeButton();
}
function clearResumeCredentials() {
  localStorage.removeItem(RESUME_ROOM_KEY);
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
    btn.textContent = `↩️ ${saved.room} 경기로 돌아가기`;
    hint.textContent = '경기 중 새로고침하거나 연결이 끊겼다면 기존 캐릭터·HP·위치·쿨다운으로 복귀합니다.';
  }
}
refreshResumeButton();

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
  draftScreen.classList.toggle('hidden', which !== 'draft');
  gameScreen.classList.toggle('hidden', which !== 'game');
}

function wsUrl() { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`; }

function openConnection(onOpen) {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  adminStatsAuthorized = false;
  lastAdminStatsData = null;
  selectedCompetitiveStatsVersion = null;
  ws = new WebSocket(wsUrl());
  ws.onopen = onOpen;
  ws.onmessage = ev => handleMessage(JSON.parse(ev.data));
  ws.onerror = () => $('joinError').textContent = '서버에 연결하지 못했습니다.';
  ws.onclose = () => {
    if (myId || spectatorMode) {
      alert(spectatorMode ? '서버 연결이 끊겼습니다.' : '서버 연결이 끊겼습니다. 다시 접속한 뒤 진행 중인 게임으로 돌아가기를 눌러주세요.');
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
  if (msg.type === 'error') {
    $('joinError').textContent = msg.message;
    if (msg.code === 'resume_invalid' || msg.code === 'resume_unavailable') clearResumeCredentials();
    if (ws) ws.close();
    return;
  }
  if (msg.type === 'joined') {
    myId = msg.id; config = msg.config; $('roomLabel').textContent = msg.room;
    saveResumeCredentials(msg.room, msg.resumeToken);
    pickerState.lobby.selected = null;
    lastLobbyPickerAvailabilityKey = null;
    const notice = $('pickNotice');
    if (notice) notice.textContent = `${msg.team}팀으로 입장했습니다. 캐릭터를 선택하세요.`;
    show('lobby'); return;
  }
  if (msg.type === 'resumed') {
    spectatorMode = false;
    document.body.classList.remove('spectator-mode');
    myId = msg.id;
    config = msg.config;
    $('roomLabel').textContent = msg.room;
    saveResumeCredentials(msg.room, msg.resumeToken);
    const notice = $('pickNotice');
    if (notice) notice.textContent = '↩️ 기존 경기 자리로 재접속했습니다.';
    show('lobby');
    return;
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
  if (msg.type === 'admin_stats_data') {
    adminStatsAuthorized = true;
    lastAdminStatsData = msg.data || null;
    selectedCompetitiveStatsVersion = msg.data?.statsVersion || selectedCompetitiveStatsVersion;
    $('competitiveStatsOverlay').classList.remove('hidden');
    renderCompetitiveStats(msg.data || {});
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
    } else if (state.state === 'draft' || state.state === 'ready') {
      stopBgm();
      show('draft');
      renderCompetitiveDraft();
    } else {
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

$('normalStartButton').onclick = () => ws && ws.send(JSON.stringify({ type:'start' }));
$('competitiveStartButton').onclick = () => ws && ws.send(JSON.stringify({ type:'competitive_start' }));
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
  if (me.character === 'wind' && me.windTailwindCooldownMs > 0) return;
  if (me.character === 'jet' && (me.jetBoost || me.jetBoostCooldownMs > 0)) return;
  if (me.character === 'angel' && (me.angelBlessCooldownMs > 0 || !selectedTargetId)) return;
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
  if (character === 'reactor') return `방사능으로 감소시킨 치유량 ${formatContributionNumber(stats.radiationHealingPrevented)}`;
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
function renderDraftBanSummary(comp) {
  const root = $('draftBanSummary');
  root.innerHTML = '';
  for (const team of ['A','B']) {
    const ban = (comp.bans || []).find(b => b.team === team);
    const box = document.createElement('div');
    box.className = `draft-ban-box team-${team.toLowerCase()}`;
    box.innerHTML = `<b>${team === 'A' ? '🔵' : '🔴'} ${team}팀 밴</b><span class="draft-ban-value">${ban ? characterLabel(ban.character) : '대기 중'}</span>`;
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
  for (const [id, m] of Object.entries(CHARACTER_META)) {
    const st = draftCardState(id, comp);
    const votes = Number(comp.banVoteCounts?.[id] || 0);
    const selectedVote = comp.myBanVote === id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `draft-char-card ${st.cls}${selectedVote ? ' vote-selected' : ''}`;
    const role = characterPublicDef(id)?.role || m.role;
    let stateText = st.text;
    if (!st.locked && comp.phase === 'ban' && canBan) stateText = votes ? `🗳️ ${votes}표${selectedVote ? ' · 내 표' : ''}` : (selectedVote ? '🗳️ 내 표' : '');
    if (!st.locked && comp.phase === 'pick' && canPick) stateText = '선택 가능';
    btn.innerHTML = `<span class="draft-char-name">${m.icon} ${escapeHtml(characterPublicDef(id)?.name || m.name)}</span><span class="draft-char-role">${escapeHtml(role)} · ${escapeHtml(buildCharacterMini(id,m))}</span><span class="draft-char-state">${stateText}</span>`;
    btn.disabled = st.locked || (!canBan && !canPick);
    if (!btn.disabled) {
      btn.onpointerdown = e => {
        e.preventDefault();
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (comp.phase === 'ban') ws.send(JSON.stringify({ type:'draft_ban_vote', character:id }));
        else if (comp.phase === 'pick') ws.send(JSON.stringify({ type:'draft_pick', character:id }));
      };
    }
    root.appendChild(btn);
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

function openCompetitiveStats() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert('먼저 방에 입장한 뒤 관리자 통계를 열어주세요.');
    return;
  }
  let pin = null;
  if (!adminStatsAuthorized) {
    pin = prompt('관리자 암호 4자리를 입력하세요.');
    if (pin === null) return;
    pin = String(pin).replace(/\D/g, '').slice(0, 4);
    if (pin.length !== 4) { alert('관리자 암호 4자리를 입력하세요.'); return; }
  }
  const overlay = $('competitiveStatsOverlay');
  overlay.classList.remove('hidden');
  $('competitiveStatsSummary').textContent = '관리자 인증 및 통계를 불러오는 중…';
  $('competitiveStatsBody').innerHTML = '';
  $('competitiveRecentMatches').innerHTML = '';
  ws.send(JSON.stringify({ type:'admin_stats_request', ...(pin ? { pin } : {}), ...(selectedCompetitiveStatsVersion ? { statsVersion:selectedCompetitiveStatsVersion } : {}) }));
}
function exportCompetitiveStatsJson() {
  if (!lastAdminStatsData) return;
  const blob = new Blob([JSON.stringify(lastAdminStatsData, null, 2)], { type:'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `school_line_competitive_stats_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
  $('competitiveStatsSummary').textContent = `${statsVersion || '현재'} 버전 경쟁 통계 ${total}판 · 전체 저장 ${allTimeTotal}판${rosterLabel}${data.updatedAt ? ` · 이 버전 마지막 기록 ${new Date(data.updatedAt).toLocaleString('ko-KR')}` : ''}`;
  const tbody = $('competitiveStatsBody');
  tbody.innerHTML = '';
  for (const [id,m] of Object.entries(CHARACTER_META)) {
    const st = data.characters?.[id] || {};
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.icon} ${escapeHtml(characterPublicDef(id)?.name || m.name)}</td><td>${Number(st.availableMatches||0)}</td><td>${Number(st.bans||0)}</td><td>${percent(st.banRate)}</td><td>${Number(st.picks||0)}</td><td>${percent(st.pickRate)}</td><td>${Number(st.wins||0)}-${Number(st.losses||0)}-${Number(st.draws||0)}</td><td>${percent(st.winRate)}</td>`;
    tbody.appendChild(tr);
  }
  const recent = $('competitiveRecentMatches');
  recent.innerHTML = '';
  const matches = Array.isArray(data.matches) ? data.matches.slice(-8).reverse() : [];
  if (!matches.length) recent.innerHTML = '<div class="stats-recent-row"><span>아직 저장된 경쟁 결과가 없습니다.</span></div>';
  for (const m of matches) {
    const row = document.createElement('div');
    row.className = 'stats-recent-row';
    const scoreA = Math.floor(Number(m.score?.A || 0)), scoreB = Math.floor(Number(m.score?.B || 0));
    const result = m.winner === 'DRAW' ? '무승부' : `${m.winner}팀 승리`;
    const killTie = m.winnerReason === 'kills' && m.teamKills ? ` · 킬 ${Number(m.teamKills.A||0)}:${Number(m.teamKills.B||0)}` : '';
    row.innerHTML = `<span>${escapeHtml(m.room || '')} · ${m.endedAt ? new Date(m.endedAt).toLocaleString('ko-KR') : ''}</span><b>${result} · ${scoreA}:${scoreB}${killTie}</b>`;
    recent.appendChild(row);
  }
}
$('competitiveStatsVersion').onchange = () => {
  if (!ws || ws.readyState !== WebSocket.OPEN || !adminStatsAuthorized) return;
  selectedCompetitiveStatsVersion = $('competitiveStatsVersion').value || null;
  ws.send(JSON.stringify({ type:'admin_stats_request', statsVersion:selectedCompetitiveStatsVersion }));
};
$('competitiveStatsButton').onclick = openCompetitiveStats;
$('competitiveStatsClose').onclick = closeCompetitiveStats;
$('competitiveStatsCloseBottom').onclick = closeCompetitiveStats;
$('competitiveStatsExport').onclick = exportCompetitiveStatsJson;
$('competitiveStatsOverlay').onclick = e => { if (e.target === $('competitiveStatsOverlay')) closeCompetitiveStats(); };

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
  $('competitiveStatsButton').classList.remove('hidden');
  const countA = state.players.filter(p => p.team === 'A' && p.connected !== false).length;
  const countB = state.players.filter(p => p.team === 'B' && p.connected !== false).length;
  const competitiveReady = state.players.length === 8 && countA === 4 && countB === 4 && state.players.every(p => p.connected !== false);
  $('normalStartButton').classList.toggle('hidden', !isHost);
  $('competitiveStartButton').classList.toggle('hidden', !isHost);
  $('competitiveStartButton').disabled = !competitiveReady;
  $('hostLabel').textContent = spectatorMode ? '📺 관전자 모드 · 경기 시작 대기 중' : (isHost ? '내가 방장입니다. 일반게임 또는 경쟁게임을 시작할 수 있습니다.' : '방장이 게임 모드를 선택해 시작합니다.');
  $('modeStartHint').textContent = isHost ? (competitiveReady ? '🏆 4 vs 4 완성 · 경쟁 시작 가능' : `🏆 경쟁게임 대기: A ${countA}/4 · B ${countB}/4`) : (competitiveReady ? '🏆 4 vs 4 완성 · 방장이 경쟁게임을 시작할 수 있습니다.' : `현재 A ${countA}/4 · B ${countB}/4`);
  $('resultBanner').classList.toggle('hidden', state.state !== 'ended');
  if (state.state === 'ended') {
    const finalScore = `${Math.floor(state.scoreA)} : ${Math.floor(state.scoreB)}`;
    const modeLabel = state.mode === 'competitive' ? '🏆 경쟁게임 · ' : '';
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
  return ({iron:'#aab3bf',mecha:'#9af0bd',solar:'#ffd45c',runner:'#ffd27a',shooter:'#8bbcff',sniper:'#eadcff',cannon:'#ffd66b',fire:'#ff9a45',poison:'#c58cff',spray:'#9ae7ff',water:'#65d7ff',wind:'#9ef7d5',star:'#fff3a8',angel:'#fff0c8',buffer:'#e5d8ff',light:'#fff0a6',laser:'#ff699a',ice:'#92efff',dia:'#d9fbff'})[character] || '#ffffff';
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
    } else if (fx.type==='windTailwindCast') {
      ctx.strokeStyle='#b1ffe1';
      for (let k=0;k<3;k++) {
        const phase=Math.max(0,Math.min(1,q-k*.10));
        ctx.globalAlpha=(1-phase)*(.62-k*.11);
        ctx.lineWidth=2.5-k*.45;
        ctx.beginPath(); ctx.arc(a.x,a.y,5+phase*(24+k*7),0,Math.PI*2); ctx.stroke();
      }
      ctx.globalAlpha=(1-q)*.16; ctx.fillStyle='#9ef7d5'; ctx.beginPath(); ctx.arc(a.x,a.y,11+q*6,0,Math.PI*2); ctx.fill();
    } else if (fx.type==='jetStart') {
      ctx.globalAlpha=(1-q)*.78; ctx.strokeStyle='#b8ecff'; ctx.lineWidth=3.0*(1-q)+.7;
      ctx.beginPath(); ctx.arc(a.x,a.y,5+q*24,0,Math.PI*2); ctx.stroke();
      if (fx.dx!=null) {
        const ex=worldToScreen(fx.x-fx.dx*(1.2+q*1.4),fx.y-fx.dy*(1.2+q*1.4));
        ctx.globalAlpha=(1-q)*.65; ctx.strokeStyle='#dff8ff'; ctx.lineWidth=2.1*(1-q)+.5;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(ex.x,ex.y); ctx.stroke();
      }
    } else if (fx.type==='jetEnd') {
      ctx.globalAlpha=(1-q)*.70; ctx.strokeStyle='#dff8ff'; ctx.lineWidth=2.8*(1-q)+.7;
      ctx.beginPath(); ctx.arc(a.x,a.y,4+q*20,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=(1-q)*.16; ctx.fillStyle='#8edcff'; ctx.beginPath(); ctx.arc(a.x,a.y,10+q*4,0,Math.PI*2); ctx.fill();
    } else if (fx.type==='jetWallSpark') {
      ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.5; ctx.globalAlpha=(1-q)*.86;
      for (let k=0;k<5;k++) { const ang=k*Math.PI*2/5+.35; const rr1=4+q*5, rr2=9+q*12; ctx.beginPath(); ctx.moveTo(a.x+Math.cos(ang)*rr1,a.y+Math.sin(ang)*rr1); ctx.lineTo(a.x+Math.cos(ang)*rr2,a.y+Math.sin(ang)*rr2); ctx.stroke(); }
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
      ctx.globalAlpha=(1-q)*.62; ctx.strokeStyle='#fff0c8'; ctx.lineWidth=2.2; ctx.beginPath(); ctx.arc(a.x,a.y,4+q*17,0,Math.PI*2); ctx.stroke();
    } else if (fx.type==='angelBless') {
      const alpha=Math.sin(Math.PI*Math.min(1,q));
      ctx.globalAlpha=alpha*.52; ctx.fillStyle='#fff7dc'; ctx.fillRect(a.x-2.2,a.y-30-q*8,4.4,60+q*16);
      ctx.globalAlpha=alpha*.84; ctx.strokeStyle='#fff0c8'; ctx.lineWidth=2.2;
      ctx.beginPath(); ctx.moveTo(a.x-2,a.y); ctx.bezierCurveTo(a.x-12,a.y-9,a.x-19,a.y-2,a.x-23,a.y+4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a.x+2,a.y); ctx.bezierCurveTo(a.x+12,a.y-9,a.x+19,a.y-2,a.x+23,a.y+4); ctx.stroke();
      ctx.fillStyle='#fff8df';
      for (let k=0;k<6;k++) { const ang=k*Math.PI/3+.2; const rr=8+q*(13+k%2*3); ctx.globalAlpha=alpha*(.45+.07*k); ctx.beginPath(); ctx.arc(a.x+Math.cos(ang)*rr,a.y+Math.sin(ang)*rr-q*10,1.2,0,Math.PI*2); ctx.fill(); }
    } else if (fx.type==='bufferLink') {
      ctx.globalAlpha=(1-q)*.65; ctx.strokeStyle='#dfb8ff'; ctx.lineWidth=2.4*(1-q)+.7; ctx.beginPath(); ctx.arc(a.x,a.y,5+q*17,0,Math.PI*2); ctx.stroke();
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
  for (const p of state.players) if (p.alive && p.character==='jet' && p.jetBoost) drawJetBoostTrail(p, beamFxNow);
  for (const buffer of state.players) {
    if (!buffer.alive || buffer.character !== 'buffer' || !buffer.bufferLinkActive || !buffer.bufferTargetId) continue;
    const target = state.players.find(p => p.id === buffer.bufferTargetId && p.alive);
    if (target) { drawBufferThread(buffer, target, beamFxNow); drawBufferTargetAura(target, beamFxNow); }
  }

  for (const p of state.projectiles) {
    const s=worldToScreen(p.x,p.y), r=Math.max(2,p.radius*SCALE);
    ctx.beginPath(); ctx.arc(s.x,s.y,r,0,Math.PI*2);
    if (p.type === 'heal') ctx.fillStyle = p.character === 'wind' ? '#9ef7d5' : (p.character === 'star' ? '#fff3a8' : (p.character === 'angel' ? '#fff0c8' : '#65d7ff'));
    else if (p.character === 'fire') ctx.fillStyle = '#ff9a45';
    else if (p.character === 'reactor') ctx.fillStyle = Number(p.reactorFxBand) >= 2 ? '#ff6a2c' : (Number(p.reactorFxBand) >= 1 ? '#ffae57' : '#ffd1a3');
    else if (p.character === 'spray') ctx.fillStyle = '#9ae7ff';
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
    ctx.fillStyle = ({iron:'#8893a3',mecha:'#7fd3a7',solar:'#e6a93d',runner:'#f0a64b',shooter:'#58a6ff',sniper:'#cba6ff',cannon:'#d9a441',fire:'#ff704d',poison:'#9b6bd6',reactor:'#cfd5dc',spray:'#5fc7e6',water:'#4cc9f0',wind:'#73d6a6',star:'#e8d66b',angel:'#f5e7b2',buffer:'#bda7e8',light:'#f6d86b',laser:'#e04b88',ice:'#68d9f5',dia:(p.diaForm?'#d9fbff':'#79c8e8')})[p.character];
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
      ctx.save(); ctx.globalAlpha=.25*jp; ctx.fillStyle='#b8ecff'; ctx.shadowColor='#b8ecff'; ctx.shadowBlur=18;
      ctx.beginPath(); ctx.arc(x,y,radius+9,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha=.90; ctx.lineWidth=2.6; ctx.strokeStyle='#dff8ff'; ctx.beginPath(); ctx.arc(x,y,radius+7,0,Math.PI*2); ctx.stroke(); ctx.restore();
    }
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
    if (p.character === 'reactor') {
      const output=Math.max(0,Math.min(100,Number(p.reactorOutput)||0));
      ctx.fillStyle='rgba(10,13,18,.86)'; ctx.fillRect(bx,by+7,bw,3);
      ctx.fillStyle='#ffffff'; ctx.fillRect(bx,by+7,bw*(output/100),3);
    }
    if (p.shield > 0 && p.maxShield > 0) {
      ctx.fillStyle='#1a2734'; ctx.fillRect(bx,by-5,bw,3);
      ctx.fillStyle='#65c7ff'; ctx.fillRect(bx,by-5,bw*Math.max(0,Math.min(1,p.shield/p.maxShield)),3);
    }
    drawText(p.name,x,by-7,11,'center','#f6f8fb');
  }

  const me = spectatorMode ? null : state.players.find(p => p.id === myId);
  if (me && me.character === 'buffer') {
    const serverTarget = me.bufferTargetId ? state.players.find(p => p.id === me.bufferTargetId && p.alive) : null;
    selectedTargetId = serverTarget ? serverTarget.id : null;
  } else if (!currentTargetingRule() || !state.players.some(p => p.id === selectedTargetId && p.alive)) selectedTargetId = null;
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
      const target = me.bufferTargetId ? state.players.find(p => p.id === me.bufferTargetId && p.alive) : null;
      if (!target) extra = '<br>🎛️ 연결 대상 선택 필요';
      else extra = `<br>🎛️ ${me.bufferLinkActive ? '연결 중' : '범위 밖 · 지정 유지'} · ${escapeHtml(target.name)}`;
    }
    else if (me.character === 'reactor') {
      extra = `<br>☢️ 출력 ${Math.round(Number(me.reactorOutput)||0)}%`;
      const reactorDef = characterPublicDef('reactor');
      if (reactorDef && Number(me.reactorOutput||0) >= Number(reactorDef.reactorHighThreshold||66)) extra += ' · 방사능 활성';
    }
    const shieldLine = me.shield > 0 ? `<br>🛡️ 보호막 ${Math.ceil(me.shield)}/${Math.ceil(me.maxShield || me.shield)}` : '';
    const stunLine = me.stunned ? '<br>💫 기절' : '';
    $('myInfo').innerHTML = `<b>${m.icon} ${m.name}</b><br>HP ${Math.max(0,Math.ceil(me.hp))}/${me.maxHp}${shieldLine}<br>${me.team}팀${stunLine}${extra}`;
    $('respawn').textContent = me.alive ? '' : `부활 ${(me.respawnMs/1000).toFixed(1)}초`;

    const ability = $('abilityButton');
    const hasAbility = me.character === 'dia' || me.character === 'runner' || me.character === 'wind' || me.character === 'angel' || me.character === 'jet';
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
    } else if (me.character === 'angel') {
      const target = state.players.find(p => p.id === selectedTargetId && p.alive);
      if (!me.alive) { ability.textContent = '😇 부활 대기'; ability.disabled = true; ability.classList.remove('active'); }
      else if (me.angelBlessCooldownMs > 0) { ability.textContent = `😇 쿨 ${(me.angelBlessCooldownMs/1000).toFixed(1)}`; ability.disabled = true; ability.classList.remove('active'); }
      else if (!target) { ability.textContent = '😇 대상 선택'; ability.disabled = true; ability.classList.remove('active'); }
      else { ability.textContent = `😇 축복 · ${target.name}`; ability.disabled = false; ability.classList.remove('active'); }
    }
  }
}
renderGame();
