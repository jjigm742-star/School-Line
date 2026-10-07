'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { DurableStore } = require('./durable_store');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const TICK_RATE = 50;
// Outbound state sync is intentionally slower than the 50 Hz authoritative simulation.
// The client already interpolates between snapshots, so 10 Hz during live play preserves
// smooth movement while cutting the dominant Render outbound traffic substantially.
// Draft/ready/idle states are event-driven and only need light heartbeat updates.
const SNAPSHOT_RATE_PLAYING = 10;
const SNAPSHOT_RATE_DRAFT = 1;
// Lobby/ended states are event-driven in BWOpt4; there is no periodic idle heartbeat.
const SNAPSHOT_RATE_IDLE = 0;
const SNAPSHOT_SCHEDULER_HZ = 20;
// BWOpt4 hard safety budget. The authoritative simulation remains 50 Hz; only outbound
// live snapshots are skipped when a room would exceed this byte budget.
const LIVE_ROOM_BUDGET_BPS = Math.max(32768, Number(process.env.SCHOOL_LINE_LIVE_ROOM_BUDGET_BPS || 131072));
const MAX_WS_PENDING_BYTES = Math.max(65536, Number(process.env.SCHOOL_LINE_MAX_WS_PENDING_BYTES || 262144));
const WS_PING_INTERVAL_MS = Math.max(5000, Number(process.env.SCHOOL_LINE_WS_PING_INTERVAL_MS || 10000));
const WS_STALE_TIMEOUT_MS = Math.max(WS_PING_INTERVAL_MS + 5000, Number(process.env.SCHOOL_LINE_WS_STALE_TIMEOUT_MS || 15000));
const DT = 1 / TICK_RATE;
const MATCH_SECONDS = 180;
const POST_GAME_ROOM_CLOSE_MS = 30000;
const MAX_ROOMS = 5;
const COMPETITIVE_BAN_MS = Math.max(100, Number(process.env.SCHOOL_LINE_COMP_BAN_MS || 10000));
const COMPETITIVE_PICK_MS = Math.max(100, Number(process.env.SCHOOL_LINE_COMP_PICK_MS || 10000));
const COMPETITIVE_READY_MS = Math.max(100, Number(process.env.SCHOOL_LINE_COMP_READY_MS || 20000));
const COMPETITIVE_DATA_DIR = path.join(__dirname, 'data'); // seed/static data only; runtime persistence lives in PostgreSQL.
const PLAYER_ACCOUNTS_SEED_FILE = path.join(COMPETITIVE_DATA_DIR, 'player_accounts_seed.json');
const RESPAWN_MS = 10000;
const RESPAWN_INVULN_MS = 2000;
const RESPAWN_POST_SHIELD = 100;
const RESPAWN_POST_SHIELD_MS = 3000;
const NONCOMBAT_REGEN_DELAY_MS = 4000;
const NONCOMBAT_REGEN_HPS = 30;
const ULTIMATE_AUTO_CHARGE_INTERVAL_MS = 4000;
const ULTIMATE_AUTO_CHARGE_RATIO = 0.03;
const SPECTATOR_PIN_HASH = '72a2d4365f37780690ee9d05b9a173e9036187fbfd5b5ae61785c5d5b0bf8a8a'; // SHA-256 of teacher PIN
const SPECTATOR_MAX_FAILURES = 5;
const SPECTATOR_LOCK_MS = 30000;
const ADMIN_STATS_PIN_HASH = SPECTATOR_PIN_HASH; // Same administrator PIN, kept hashed server-side.
const ADMIN_STATS_MAX_FAILURES = 5;
const ADMIN_STATS_LOCK_MS = 30000;
const ACCESS_ADMIN_PIN_HASH = SPECTATOR_PIN_HASH; // Reuse the same teacher PIN hash; plaintext never leaves the browser request.
const ACCESS_ADMIN_MAX_FAILURES = 5;
const ACCESS_ADMIN_LOCK_MS = 30000;
const BALANCE_VERSION = '1.6.2';
const GAME_VERSION = `Alpha ${BALANCE_VERSION}`;
const COMPETITIVE_STATS_SCHEMA_VERSION = 7;
// Stats series reset: historical 1.6 data is intentionally NOT imported. This build starts at 1.7.
// From gameplay 1.7 onward the series follows major.minor automatically, so 1.7.x / 1.8.x split without hard-coded lists.
function statsSeriesForBalanceVersion(balanceVersion) {
  const parts = String(balanceVersion || '').match(/(\d+)\.(\d+)/);
  if (!parts) return '1.7';
  const major = Number(parts[1]), minor = Number(parts[2]);
  if (major < 1 || (major === 1 && minor < 7)) return '1.7';
  return `${major}.${minor}`;
}
const COMPETITIVE_STATS_VERSION = statsSeriesForBalanceVersion(BALANCE_VERSION);
const COMPETITIVE_BUILD_ID = 'alpha-1.6.2-r22-stats1.7-postgres1-httpadmin1-durableaccounts1-autoseries1-rostersnapshot1';
const COMPETITIVE_ROSTER_VERSION = 'alpha-1.6.2-r22-allultimates';
const COMPETITIVE_PERSIST_RETRY_MS = Math.max(1000, Number(process.env.SCHOOL_LINE_PERSIST_RETRY_MS || 3000));
const durableStore = new DurableStore();
const pendingCompetitiveRecords = new Map();


const DEFAULT_PLAYER_ACCOUNT_NAMES = Object.freeze([
  '박지유','김가은','정도윤','최윤서','정주영','김윤서','김루환','김명서','심세윤','박영호',
  '공지호','오지환','정율하','권세하','이채은','김선','김온유','민건희','강예준','인서강',
  '김민준','곽준우','심서윤','박준형','김혜민'
]);
const TEACHER_ACCOUNT_ID = 'S010';

function randomStudentPin(used = new Set()) {
  for (let i = 0; i < 10000; i++) {
    const pin = String(1000 + crypto.randomInt(9000));
    if (!used.has(pin)) { used.add(pin); return pin; }
  }
  return String(1000 + crypto.randomInt(9000));
}
function normalizeAccountName(value) {
  const s = String(value || '').trim().replace(/[\r\n\t]/g, ' ');
  return s.slice(0, 12) || '학생';
}
function defaultPlayerAccounts() {
  const used = new Set();
  return DEFAULT_PLAYER_ACCOUNT_NAMES.map((name, i) => ({
    id: `S${String(i + 1).padStart(3, '0')}`,
    name,
    pin: randomStudentPin(used),
    role: `S${String(i + 1).padStart(3, '0')}` === TEACHER_ACCOUNT_ID ? 'teacher' : 'student',
    updatedAt: new Date().toISOString()
  }));
}
function loadBundledPlayerAccountSeed() {
  let loaded = null;
  try {
    if (fs.existsSync(PLAYER_ACCOUNTS_SEED_FILE)) loaded = JSON.parse(fs.readFileSync(PLAYER_ACCOUNTS_SEED_FILE, 'utf8'));
  } catch (err) {
    console.error('[accounts] seed read failed:', err && err.message ? err.message : err);
  }
  const defaults = defaultPlayerAccounts();
  const byId = new Map(Array.isArray(loaded?.accounts) ? loaded.accounts.map(a => [String(a?.id || ''), a]) : []);
  const usedPins = new Set();
  return defaults.map(def => {
    const old = byId.get(def.id) || {};
    let pin = /^\d{4}$/.test(String(old.pin || '')) ? String(old.pin) : def.pin;
    if (usedPins.has(pin)) pin = randomStudentPin(usedPins); else usedPins.add(pin);
    return {
      id: def.id,
      name: normalizeAccountName(old.name || def.name),
      pin,
      role: def.role,
      updatedAt: old.updatedAt || def.updatedAt
    };
  });
}
let playerAccounts = [];

async function initializePlayerAccountsFromDatabase() {
  const seed = loadBundledPlayerAccountSeed();
  const loaded = await durableStore.loadAccounts(seed);
  const byId = new Map(loaded.map(a => [String(a.id), a]));
  playerAccounts = seed.map(def => {
    const row = byId.get(def.id) || def;
    return {
      id: def.id,
      name: normalizeAccountName(row.name || def.name),
      pin: /^\d{4}$/.test(String(row.pin || '')) ? String(row.pin) : def.pin,
      role: def.role,
      updatedAt: row.updatedAt || def.updatedAt
    };
  });
  return playerAccounts;
}

function publicPlayerAccounts() {
  return playerAccounts.map(a => ({ id: a.id, name: a.name, role: a.role }));
}
function playerAccountById(value) {
  const id = String(value || '').trim().toUpperCase();
  return playerAccounts.find(a => a.id === id) || null;
}
function authenticatePlayerAccount(accountId, pin) {
  const account = playerAccountById(accountId);
  if (!account) return null;
  const cleanPin = String(pin || '').replace(/\D/g, '').slice(0, 4);
  return cleanPin.length === 4 && cleanPin === account.pin ? account : null;
}
function accountStatKey(accountId, fallbackName = '') {
  const stable = String(accountId || '').trim().toUpperCase();
  if (stable) return crypto.createHash('sha256').update(`account:${stable}`).digest('hex').slice(0, 20);
  return nicknameStatKey(fallbackName);
}
function findAccountReservation(accountId) {
  const wanted = String(accountId || '').trim().toUpperCase();
  if (!wanted) return null;
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (String(player.accountId || '').toUpperCase() === wanted) return { room, player };
    }
  }
  return null;
}


const WORLD = { width: 42, height: 68, aZoneEnd: 18, bZoneStart: 50 };
const SPEED_TIERS = [4.0, 5.0, 6.0, 7.0, 8.0, 9.2];
const GLOBAL_SHIELD_CAP = 500;
const MAX_EXTERNAL_HEAL_REDUCTION = 0.80;
const HEALER_ALLY_SELF_HEAL_RATIO = 0.25;
// Healing feedback reuses the existing healHitSeq/lastHealTargetId wire slots.
// Throttle at the authority layer so beam/link healing cannot generate audio events every 50 Hz tick.
const HEAL_FEEDBACK_INTERVAL_MS = 250;
// Small private healer HUD numbers are aggregated in 200 ms windows. They are sent only
// when effective healing was actually delivered to another ally, never as a recurring field.
const HEAL_NUMBER_INTERVAL_MS = 200;
const DAMAGE_TAKEN_MULTIPLIERS = Object.freeze({ iron: 0.80, shield: 0.90, mecha: 0.90 });
// Dual-purpose healing projectiles are intentionally easier to land on allies only.
// This is a server-side collision rule, so it adds no recurring WebSocket payload.
const DUAL_PURPOSE_HEAL_ALLY_RADIUS_MULTIPLIER = 1.4;

// Alpha 1.1 foundation: common target relations + generic status effects.
const TARGET_RELATION = Object.freeze({ SELF: 'SELF', ALLY: 'ALLY', ENEMY: 'ENEMY' });
const STATUS_DEFS = Object.freeze({
  burn:     { kind: 'harmful', clearOnDeath: true },
  poison:   { kind: 'harmful', clearOnDeath: true },
  radiation:{ kind: 'harmful', clearOnDeath: true },
  slow:     { kind: 'harmful', clearOnDeath: true },
  stun:     { kind: 'harmful', clearOnDeath: true },
  tailwind: { kind: 'beneficial', clearOnDeath: true }
});

const WALLS = [
  // Alpha 1.5 home-zone cover: symmetric 6 m x 1.8 m LOS blockers centered in each 18 m owned zone.
  // World coordinates use x across the 42 m width and y along the 68 m depth.
  { x: 20.1, y: 6, w: 1.8, h: 6 },
  { x: 5, y: 24, w: 10, h: 3 },
  { x: 27, y: 24, w: 10, h: 3 },
  { x: 18, y: 31, w: 6, h: 6 },
  { x: 5, y: 41, w: 10, h: 3 },
  { x: 27, y: 41, w: 10, h: 3 },
  { x: 20.1, y: 56, w: 1.8, h: 6 }
];

const CHARACTERS = {
  iron: {
    name: '아이언', role: '탱커', hp: 600, speed: 5.0, radius: 1.00,
    fireRate: 5, range: 24, projectileSpeed: 14, projectileRadius: 0.32,
    projectileType: 'attack', damage: 17,
    ultimateName: '분쇄', ultimateCost: 1200, ultimateDescription: '반경 12m 적에게 50 피해를 주고 1.5초 기절시킨다.', ultimateRadius: 12, ultimateDamage: 50, ultimateStunDuration: 1.5, ultimateDelay: 2
  },
  mecha: {
    name: '메카', role: '탱커', hp: 550, speed: 7.0, radius: 1.00,
    fireRate: 5, range: 16, projectileSpeed: 28, projectileRadius: 0.20,
    projectileType: 'attack', damage: 13,
    ultimateName: '자폭', ultimateCost: 1000, ultimateDescription: '4초 후 반경 16m 적에게 200 피해를 주고 자신도 200 피해를 받는다.', ultimateRadius: 16, ultimateDamage: 200, ultimateSelfDamage: 200, ultimateDelay: 4
  },
  jet: {
    name: '제트', role: '탱커', hp: 350, speed: 6.0, radius: 1.00,
    fireRate: 5, range: 12, projectileSpeed: 20, projectileRadius: 0.32,
    projectileType: 'attack', damage: 19,
    boostDistance: 12, boostDuration: 0.3, boostCooldown: 10,
    boostShield: 50, boostShieldDuration: 3, abilityId: 'boost',
    ultimateName: '로켓 러시', ultimateCost: 1000, ultimateDescription: '부스터를 즉시 재충전하고 8초간 재사용 대기시간이 2초가 된다.', ultimateDuration: 8, ultimateBoostCooldown: 2
  },
  solar: {
    name: '솔라', role: '탱커', hp: 375, speed: 5.0, radius: 1.00,
    attackType: 'beam', range: 16, beamDps: 55,
    solarFireRate: 1, solarProjectileRange: 24, solarProjectileSpeed: 28,
    solarProjectileRadius: 0.32, solarProjectileDamage: 25, solarSelfHeal: 25,
    ultimateName: '일출', ultimateCost: 1200, ultimateDescription: '4초간 반경 24m 적에게 초당 15 피해를 주고 자신은 초당 30 회복한다.', ultimateDuration: 4, ultimateRadius: 24, ultimateAuraDps: 15, ultimateSelfHealHps: 30
  },
  shield: {
    name: '쉴드', role: '탱커', hp: 450, speed: 5.0, radius: 1.00,
    fireRate: 5, range: 24, projectileSpeed: 14, projectileRadius: 0.32,
    projectileType: 'attack', damage: 15,
    abilityId: 'shield', shieldAmount: 175, shieldDuration: 3, shieldCap: GLOBAL_SHIELD_CAP,
    shieldMaxCharges: 2, shieldRecharge: 8,
    abilityTargeting: { relations: [TARGET_RELATION.SELF, TARGET_RELATION.ALLY], requireLos: false },
    ultimateName: '보호막 홍수', ultimateCost: 600, ultimateDescription: '자신과 모든 아군에게 3초간 300 보호막을 부여한다.', ultimateShield: 300, ultimateShieldDuration: 3
  },
  runner: {
    name: '러너', role: '딜러', hp: 175, speed: 8.0, radius: 0.65,
    fireRate: 5, range: 16, projectileSpeed: 28, projectileRadius: 0.20,
    projectileType: 'attack', damage: 11,
    sprintDuration: 4, sprintCooldown: 8, abilityId: 'sprint',
    ultimateName: '마지막 스퍼트', ultimateCost: 300, ultimateDescription: '8초간 이동속도가 9.2로 증가한다.', ultimateDuration: 8
  },
  shooter: {
    name: '슈터', role: '딜러', hp: 250, speed: 6.0, radius: 0.80,
    fireRate: 5, range: 24, projectileSpeed: 42, projectileRadius: 0.20,
    projectileType: 'attack', damage: 20,
    ultimateName: '자신감', ultimateCost: 1000, ultimateDescription: '8초간 이동속도가 2단계 증가하고 125 DPS, 사거리 32m가 된다.', ultimateDuration: 8, ultimateDamage: 25, ultimateRange: 32, ultimateSpeedTierDelta: 2
  },
  sniper: {
    name: '스나이퍼', role: '딜러', hp: 150, speed: 5.0, radius: 0.65,
    fireRate: 2, range: 36, projectileSpeed: 42, projectileRadius: 0.20,
    projectileType: 'attack', distanceDamage: true,
    distanceDamageBands: [{ max: 16, damage: 45 }, { max: 36, damage: 60 }],
    ultimateName: '집중 사격', ultimateCost: 800, ultimateDescription: '8초간 16m 밖의 적에게 200 DPS로 공격하고 투사체 크기가 증가한다.', ultimateDuration: 8, ultimateLongRangeDamage: 100, ultimateProjectileRadius: 0.32
  },
  cannon: {
    name: '캐논', role: '딜러', hp: 275, speed: 4.0, radius: 1.00,
    fireRate: 10, range: 24, projectileSpeed: 28, projectileRadius: 0.32,
    projectileType: 'attack', damage: 13,
    ultimateName: '초대형 포격', ultimateCost: 1300, ultimateDescription: '8초간 이동할 수 없는 대신 기본 공격이 180 DPS가 된다.', ultimateDuration: 8, ultimateDamage: 18
  },
  fire: {
    name: '파이어', role: '딜러', hp: 200, speed: 7.0, radius: 0.80,
    fireRate: 5, range: 24, projectileSpeed: 28, projectileRadius: 0.20,
    projectileType: 'attack', damage: 16, burnDps: 10, burnDuration: 2, burnHealReduction: 0.30,
    ultimateName: '대화재', ultimateCost: 800, ultimateDescription: '8초간 투사체가 커지고 화상 지속시간이 4초로 증가한다.', ultimateDuration: 8, ultimateProjectileRadius: 0.32, ultimateBurnDuration: 4
  },
  poison: {
    name: '포이즌', role: '딜러', hp: 250, speed: 6.0, radius: 0.80,
    attackType: 'beam', range: 16, beamDps: 75,
    poisonHealReduction: 0.50, poisonDuration: 1.5,
    ultimateName: '맹독', ultimateCost: 1200, ultimateDescription: '반경 12m 적에게 50 피해를 주고 3초간 치유를 차단한다.', ultimateRadius: 12, ultimateDamage: 50, ultimatePoisonDuration: 3
  },
  reactor: {
    name: '리액터', role: '딜러', hp: 225, speed: 6.0, radius: 0.80,
    fireRate: 5, range: 24, projectileSpeed: 20, projectileRadius: 0.32,
    projectileType: 'attack', damage: 16,
    // Official output stages use exclusive upper bounds for stages 1 and 2:
    // stage 1 = [0,33), stage 2 = [33,66), stage 3 = [66,100].
    // Alpha 1.5 structure pass: 80 / 105 / 130 DPS at 5 shots/s.
    reactorOutputBands: [
      { max: 33, damage: 16 },
      { max: 66, damage: 21 },
      { max: 100, damage: 26 }
    ],
    reactorDamagePerOutput: 5, reactorKillOutputGain: 10, reactorDecayDelay: 4, reactorDecayPerSecond: 20,
    reactorHighThreshold: 66, reactorHighSpeed: 7.0,
    radiationHealReduction: 0.25, radiationDuration: 1.5,
    ultimateName: '원자로 폭주', ultimateCost: 1000, ultimateDescription: '8초간 이동속도가 1단계 증가하고 출력 감소가 멈춘다.', ultimateDuration: 8, ultimateSpeedTierDelta: 1
  },
  spray: {
    name: '스프레이', role: '딜러', hp: 250, speed: 5.0, radius: 0.80,
    fireRate: 5, range: 24, projectileSpeed: 28, projectileRadius: 0.32,
    projectileType: 'attack', damage: 14,
    spraySideProjectileRadius: 0.20, spraySideDamage: 4,
    spraySideAngleDeg: 10, spraySideOffset: 1.2,
    ultimateName: '탄막', ultimateCost: 1400, ultimateDescription: '8초간 좌우 보조탄도 14 피해를 준다.', ultimateDuration: 8, ultimateSideDamage: 14
  },
  water: {
    name: '워터', role: '힐러', hp: 250, speed: 6.0, radius: 0.65,
    fireRate: 5, range: 24, projectileSpeed: 20, projectileRadius: 0.52,
    projectileType: 'heal', heal: 16, damage: 10,
    ultimateName: '범람', ultimateCost: 1200, ultimateDescription: '반경 16m의 아군을 150 회복하고, 적에게 25 피해와 1초 기절을 즉시 부여한다.',
    ultimateRadius: 16, ultimateHeal: 150, ultimateDamage: 25, ultimateStunDuration: 1
  },
  wind: {
    name: '윈드', role: '힐러', hp: 175, speed: 7.0, radius: 0.65,
    fireRate: 5, range: 24, projectileSpeed: 20, projectileRadius: 0.52,
    projectileType: 'heal', heal: 12, damage: 10,
    tailwindDuration: 4, tailwindCooldown: 15, abilityId: 'tailwind',
    ultimateName: '계절풍', ultimateCost: 1400, ultimateDescription: '8초간 반경 12m 자신과 아군을 초당 30 회복한다.', ultimateDuration: 8, ultimateRadius: 12, ultimateHealHps: 30
  },
  star: {
    name: '스타', role: '힐러', hp: 200, speed: 5.0, radius: 0.80,
    fireRate: 2, range: 30, projectileSpeed: 42, projectileRadius: 0.20,
    projectileType: 'heal', heal: 45, damage: 25,
    ultimateName: '슈퍼노바', ultimateCost: 1400, ultimateDescription: '반경 30m 자신과 아군을 150 회복하고 적에게 100 피해를 준다.', ultimateRadius: 30, ultimateHeal: 150, ultimateDamage: 100, ultimateDelay: 2
  },
  angel: {
    name: '엔젤', role: '힐러', hp: 175, speed: 6.0, radius: 0.65,
    fireRate: 5, range: 24, projectileSpeed: 28, projectileRadius: 0.20,
    projectileType: 'heal', heal: 10, damage: 10,
    abilityId: 'blessing', abilityCooldown: 12, abilityHeal: 100,
    abilityTargeting: { relations: [TARGET_RELATION.SELF, TARGET_RELATION.ALLY], requireLos: false },
    ultimateName: '기적', ultimateCost: 1300, ultimateDescription: '자신 또는 아군 1명을 3초간 무적으로 만든다.', ultimateDuration: 3
  },
  buffer: {
    name: '버퍼', role: '힐러', hp: 200, speed: 5.0, radius: 0.65,
    range: 16, noBasicAttack: true,
    linkHealHps: 45, actionSpeedBoost: 0.25,
    linkTargeting: { relations: [TARGET_RELATION.ALLY], range: 16, requireLos: false },
    ultimateName: '업그레이드', ultimateCost: 1000, ultimateDescription: '8초간 링크 치유량이 초당 65로 증가하고 대상 이동속도가 1단계 증가한다.', ultimateDuration: 8, ultimateLinkHealHps: 65, ultimateLinkedSpeedTierDelta: 1
  },
  light: {
    name: '라이트', role: '힐러', hp: 225, speed: 6.0, radius: 0.65,
    attackType: 'lightBeam', range: 16, healHps: 50, beamDps: 50,
    ultimateName: '스포트라이트', ultimateCost: 1200, ultimateDescription: '8초간 사거리 24m, 공격·치유량이 초당 70으로 증가한다.', ultimateDuration: 8, ultimateRange: 24, ultimateBeamDps: 70, ultimateHealHps: 70
  },
  laser: {
    name: '레이저', role: '딜러', hp: 275, speed: 6.0, radius: 0.80,
    attackType: 'beam', range: 16, beamDps: 65, maxHpDpsRatio: 0.10,
    ultimateName: '분해 광선', ultimateCost: 1400, ultimateDescription: '8초간 광선이 적 최대 체력의 15%/초 추가 피해를 준다.', ultimateDuration: 8, ultimateMaxHpDpsRatio: 0.15
  },
  ice: {
    name: '아이스', role: '딜러', hp: 275, speed: 6.0, radius: 0.80,
    attackType: 'beam', range: 16, beamDps: 70,
    slowTierDelta: -1, slowDuration: 1.5,
    ultimateName: '절대영도', ultimateCost: 1000, ultimateDescription: '반경 16m 적을 1초 기절시키고 자신은 300 회복한다.', ultimateRadius: 16, ultimateStunDuration: 1, ultimateHeal: 300, ultimateDelay: 2
  },
  dia: {
    name: '다이아', role: '탱커', hp: 350, speed: 5.0, radius: 1.00,
    fireRate: 5, range: 24, projectileSpeed: 20, projectileRadius: 0.20,
    projectileType: 'attack', damage: 13,
    formDuration: 6, formCooldown: 16, formHp: 450, formSpeed: 7.0,
    formRange: 16, formBeamDps: 90, formKillCooldownReduction: 6, abilityId: 'form',
    ultimateName: '수정 폭발', ultimateCost: 800, ultimateDescription: '3번에 걸쳐 총 48개의 수정 투사체를 사방으로 발사해 24m 이내의 적에게 투사체당 40 피해를 준다.', ultimateDamage: 40, ultimateProjectileCount: 16, ultimateVolleyCount: 3, ultimateVolleyInterval: 1
  }
};

// Dormant perk framework for a future balance version.
// Alpha 1.5 intentionally keeps this feature OFF: no offers, no UI activation,
// no gameplay effects and no live-snapshot fields are emitted while disabled.
const PERK_SYSTEM = Object.freeze({
  enabled: false,
  unlockAfterMs: 90_000,
  choicesPerCharacter: 2
});

// Future patches can populate each character with exactly two entries:
// [{ id: '...', name: '...', description: '...' }, { ... }].
// Gameplay effects remain server-authoritative and should key off player.perkChoiceId.
const CHARACTER_PERKS = Object.freeze({});

function resetPerkState(player) {
  if (!player) return;
  player.perkChoiceId = null;
  player.perkChosenAt = 0;
  player.perkOfferSent = false;
}

function perkOptionsForCharacter(character) {
  const raw = CHARACTER_PERKS[character];
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, PERK_SYSTEM.choicesPerCharacter);
}

function publicPerkOption(option) {
  if (!option || typeof option !== 'object') return null;
  return {
    id: String(option.id || ''),
    name: String(option.name || ''),
    description: String(option.description || '')
  };
}

function perkSelectionUnlocked(room, now = Date.now()) {
  return !!(
    PERK_SYSTEM.enabled &&
    room && room.state === 'playing' && room.matchStartedAt > 0 &&
    now - room.matchStartedAt >= PERK_SYSTEM.unlockAfterMs
  );
}

function maybeSendPerkOffer(room, player, conn, now = Date.now()) {
  if (!PERK_SYSTEM.enabled || !room || !player || !conn) return false;
  if (!perkSelectionUnlocked(room, now) || player.perkChoiceId || player.perkOfferSent) return false;
  const options = perkOptionsForCharacter(player.character).map(publicPerkOption).filter(Boolean);
  if (options.length !== PERK_SYSTEM.choicesPerCharacter || options.some(o => !o.id || !o.name)) return false;
  conn.send({
    type: 'perk_offer',
    character: player.character,
    unlockAtSeconds: PERK_SYSTEM.unlockAfterMs / 1000,
    options
  });
  player.perkOfferSent = true;
  return true;
}

function choosePerk(room, player, perkId, now = Date.now()) {
  if (!perkSelectionUnlocked(room, now) || !player || player.perkChoiceId) return null;
  const requested = String(perkId || '');
  const choice = perkOptionsForCharacter(player.character).find(option => String(option.id || '') === requested);
  if (!choice) return null;
  player.perkChoiceId = requested;
  player.perkChosenAt = now;
  player.perkOfferSent = true;
  return publicPerkOption(choice);
}

function updatePerkSystem(room, now = Date.now()) {
  if (!PERK_SYSTEM.enabled || !room || room.state !== 'playing') return;
  for (const [playerId, conn] of room.clients.entries()) {
    const player = room.players.get(playerId);
    if (player && player.connected !== false) maybeSendPerkOffer(room, player, conn, now);
  }
}

const rooms = new Map();
const spectatorAuthFailures = new Map();
const adminStatsAuthFailures = new Map();
const accessAdminAuthFailures = new Map();
const activeConnections = new Set();
const NETWORK_METRICS = {
  startedAt: Date.now(), totalBytes: 0, totalFrames: 0, byKind: Object.create(null),
  droppedBackpressure: 0, skippedLiveSnapshots: 0, staleConnectionsClosed: 0
};
let schoolLineAccessOpen = false; // Safe default: a server restart returns School Line to LOCKED.
let idCounter = 1;
let spectatorCounter = 1;


function ensureRoomNetwork(room) {
  if (!room) return null;
  if (!room.network) {
    room.network = {
      totalBytes: 0, totalFrames: 0, byKind: Object.create(null),
      rateWindowStartedAt: Date.now(), rateWindowBytes: 0, recentBps: 0,
      budgetWindowStartedAt: Date.now(), budgetWindowBytes: 0,
      skippedLiveSnapshots: 0, droppedBackpressure: 0
    };
  }
  return room.network;
}

function websocketFrameSize(payloadBytes) {
  const n = Math.max(0, Number(payloadBytes) || 0);
  return n + (n < 126 ? 2 : (n < 65536 ? 4 : 10));
}

function refreshRoomNetworkRate(room, now = Date.now()) {
  const net = ensureRoomNetwork(room);
  if (!net) return 0;
  const elapsed = Math.max(1, now - net.rateWindowStartedAt);
  if (elapsed >= 1000) {
    net.recentBps = Math.round(net.rateWindowBytes * 1000 / elapsed);
    net.rateWindowBytes = 0;
    net.rateWindowStartedAt = now;
  }
  return net.recentBps;
}

function recordWsOutbound(conn, frameBytes, kind = 'message', now = Date.now()) {
  const bytes = Math.max(0, Number(frameBytes) || 0);
  if (!bytes) return;
  NETWORK_METRICS.totalBytes += bytes;
  NETWORK_METRICS.totalFrames += 1;
  NETWORK_METRICS.byKind[kind] = (NETWORK_METRICS.byKind[kind] || 0) + bytes;
  if (conn) {
    conn.outboundBytes = (conn.outboundBytes || 0) + bytes;
    conn.outboundFrames = (conn.outboundFrames || 0) + 1;
  }
  const room = conn?.roomCode ? rooms.get(conn.roomCode) : null;
  if (room) {
    const net = ensureRoomNetwork(room);
    net.totalBytes += bytes;
    net.totalFrames += 1;
    net.byKind[kind] = (net.byKind[kind] || 0) + bytes;
    net.rateWindowBytes += bytes;
    refreshRoomNetworkRate(room, now);
  }
}

function noteBackpressureDrop(conn) {
  NETWORK_METRICS.droppedBackpressure += 1;
  const room = conn?.roomCode ? rooms.get(conn.roomCode) : null;
  if (room) ensureRoomNetwork(room).droppedBackpressure += 1;
}

function allowLiveRoomBroadcast(room, frameBytes, recipientCount, now = Date.now()) {
  if (!room || recipientCount <= 0) return false;
  const net = ensureRoomNetwork(room);
  if (now - net.budgetWindowStartedAt >= 1000) {
    net.budgetWindowStartedAt = now;
    net.budgetWindowBytes = 0;
  }
  const projected = Math.max(0, Number(frameBytes) || 0) * Math.max(0, Number(recipientCount) || 0);
  if (net.budgetWindowBytes + projected > LIVE_ROOM_BUDGET_BPS) {
    net.skippedLiveSnapshots += 1;
    NETWORK_METRICS.skippedLiveSnapshots += 1;
    return false;
  }
  net.budgetWindowBytes += projected;
  return true;
}

function publicNetworkStats() {
  const now = Date.now();
  const roomsOut = [];
  for (const room of rooms.values()) {
    const net = ensureRoomNetwork(room);
    refreshRoomNetworkRate(room, now);
    roomsOut.push({
      room: room.code, state: room.state,
      players: room.players.size, spectators: room.spectators.size,
      totalBytes: net.totalBytes, totalMiB: Math.round(net.totalBytes / 1048576 * 100) / 100,
      recentBps: net.recentBps,
      liveStateBytes: net.byKind.live_state || 0,
      skippedLiveSnapshots: net.skippedLiveSnapshots,
      droppedBackpressure: net.droppedBackpressure,
      liveBudgetBps: LIVE_ROOM_BUDGET_BPS
    });
  }
  const byKind = {};
  for (const [kind, bytes] of Object.entries(NETWORK_METRICS.byKind)) byKind[kind] = bytes;
  return {
    startedAt: new Date(NETWORK_METRICS.startedAt).toISOString(),
    totalBytes: NETWORK_METRICS.totalBytes,
    totalMiB: Math.round(NETWORK_METRICS.totalBytes / 1048576 * 100) / 100,
    totalFrames: NETWORK_METRICS.totalFrames,
    activeConnections: activeConnections.size,
    droppedBackpressure: NETWORK_METRICS.droppedBackpressure,
    skippedLiveSnapshots: NETWORK_METRICS.skippedLiveSnapshots,
    staleConnectionsClosed: NETWORK_METRICS.staleConnectionsClosed,
    liveRoomBudgetBps: LIVE_ROOM_BUDGET_BPS,
    byKind,
    rooms: roomsOut
  };
}

function publicAdminStatsPayload(statsVersion) {
  return { ...publicCompetitiveStats(statsVersion), network: publicNetworkStats(), persistence: { ...durableStore.status(), pendingSaves: pendingCompetitiveRecords.size } };
}

function competitiveStatsBackupPayload() {
  return {
    ...JSON.parse(JSON.stringify(competitiveStats)),
    schemaVersion: COMPETITIVE_STATS_SCHEMA_VERSION,
    statsSeriesMode: 'major.minor',
    backupMeta: {
      exportedAt: new Date().toISOString(),
      currentStatsVersion: COMPETITIVE_STATS_VERSION,
      currentBalanceVersion: BALANCE_VERSION,
      gameVersion: GAME_VERSION,
      buildId: COMPETITIVE_BUILD_ID,
      rosterVersion: COMPETITIVE_ROSTER_VERSION,
      persistence: { ...durableStore.status(), pendingSaves: pendingCompetitiveRecords.size }
    }
  };
}

function emptyCompetitiveCharacterStats() {
  return { availableMatches: 0, bans: 0, picks: 0, wins: 0, losses: 0, draws: 0, totalUltimateUses: 0 };
}

function emptyCompetitiveVersionStats() {
  return { totalMatches: 0, updatedAt: null, characters: {}, legacySegments: [] };
}

function emptyCompetitiveStats() {
  const characters = {};
  for (const id of Object.keys(CHARACTERS)) characters[id] = emptyCompetitiveCharacterStats();
  return {
    schemaVersion: COMPETITIVE_STATS_SCHEMA_VERSION,
    statsSeriesMode: 'major.minor',
    totalMatches: 0,
    updatedAt: null,
    characters,
    versions: {},
    matches: []
  };
}

function fullBalanceVersion(value) {
  const text = String(value || '').trim();
  const match = text.match(/(?:^|\b)(\d+\.\d+(?:\.\d+)?)(?:\b|$)/);
  return match ? match[1] : '';
}

function normalizeStatsVersion(value) {
  const full = fullBalanceVersion(value);
  if (!full) return '';
  const parts = full.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : full;
}

function versionSort(a, b) {
  const pa = String(a || '').split('.').map(Number);
  const pb = String(b || '').split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = Number.isFinite(pa[i]) ? pa[i] : 0;
    const bv = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (av !== bv) return av - bv;
  }
  return String(a || '').localeCompare(String(b || ''));
}

function statsVersionFromMatch(match) {
  return normalizeStatsVersion(match?.statsVersion) || normalizeStatsVersion(match?.balanceVersion) || normalizeStatsVersion(match?.gameVersion) || '';
}

function ensureVersionCharacterStats(bucket, id) {
  if (!bucket.characters[id]) bucket.characters[id] = emptyCompetitiveCharacterStats();
  return bucket.characters[id];
}

function addRecordedMatchToVersionBucket(bucket, match) {
  bucket.totalMatches += 1;
  bucket.updatedAt = typeof match?.endedAt === 'string' ? match.endedAt : bucket.updatedAt;
  for (const id of Array.isArray(match?.availableCharacters) ? match.availableCharacters : []) {
    ensureVersionCharacterStats(bucket, id).availableMatches += 1;
  }
  for (const ban of Array.isArray(match?.bans) ? match.bans : []) {
    if (ban?.character) ensureVersionCharacterStats(bucket, ban.character).bans += 1;
  }
  const recordedPlayers = new Map((Array.isArray(match?.players) ? match.players : []).map(p => [String(p?.playerId || ''), p]));
  for (const assignment of Array.isArray(match?.finalAssignments) ? match.finalAssignments : []) {
    if (!assignment?.character) continue;
    const stat = ensureVersionCharacterStats(bucket, assignment.character);
    stat.picks += 1;
    const playerRecord = recordedPlayers.get(String(assignment.playerId || ''));
    stat.totalUltimateUses += Math.max(0, Number(playerRecord?.stats?.ultimateUses) || 0);
    if (match.winner === 'DRAW') stat.draws += 1;
    else if (match.winner === assignment.team) stat.wins += 1;
    else stat.losses += 1;
  }
}

function mergeCharacterStatInto(target, source) {
  for (const key of ['availableMatches','bans','picks','wins','losses','draws','totalUltimateUses']) {
    target[key] = Math.max(0, Number(target[key]) || 0) + Math.max(0, Number(source?.[key]) || 0);
  }
}

function mergeVersionBucketInto(target, source) {
  target.totalMatches += Math.max(0, Number(source?.totalMatches) || 0);
  if (typeof source?.updatedAt === 'string' && (!target.updatedAt || source.updatedAt > target.updatedAt)) target.updatedAt = source.updatedAt;
  for (const [id, stat] of Object.entries(source?.characters || {})) mergeCharacterStatInto(ensureVersionCharacterStats(target, id), stat);
  if (Array.isArray(source?.legacySegments)) target.legacySegments.push(...source.legacySegments.map(seg => ({ ...seg })));
  return target;
}

function normalizeVersionBucket(raw) {
  const bucket = emptyCompetitiveVersionStats();
  if (!raw || typeof raw !== 'object') return bucket;
  bucket.totalMatches = Math.max(0, Number(raw.totalMatches) || 0);
  bucket.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
  bucket.legacySegments = Array.isArray(raw.legacySegments) ? raw.legacySegments.map(seg => ({ ...seg })) : [];
  for (const [id, srcRaw] of Object.entries(raw.characters || {})) {
    const src = srcRaw && typeof srcRaw === 'object' ? srcRaw : {};
    const stat = ensureVersionCharacterStats(bucket, id);
    for (const key of ['availableMatches','bans','picks','wins','losses','draws','totalUltimateUses']) stat[key] = Math.max(0, Number(src[key]) || 0);
  }
  return bucket;
}

function normalizeCompetitiveStats(raw) {
  const base = emptyCompetitiveStats();
  if (!raw || typeof raw !== 'object') return base;
  const sourceSchema = Math.max(1, Number(raw.schemaVersion) || 1);
  base.totalMatches = Math.max(0, Number(raw.totalMatches) || 0);
  base.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
  base.matches = Array.isArray(raw.matches) ? raw.matches : [];

  // Preserve all-time counters for export/backward compatibility.
  for (const [id, srcRaw] of Object.entries(raw.characters || {})) {
    if (!base.characters[id]) base.characters[id] = emptyCompetitiveCharacterStats();
    const src = srcRaw && typeof srcRaw === 'object' ? srcRaw : {};
    for (const key of ['bans','picks','wins','losses','draws','totalUltimateUses']) base.characters[id][key] = Math.max(0, Number(src[key]) || 0);
    if (sourceSchema >= 2 && Number.isFinite(Number(src.availableMatches))) base.characters[id].availableMatches = Math.max(0, Number(src.availableMatches) || 0);
    else base.characters[id].availableMatches = base.totalMatches;
  }

  // v3 stores explicit balance-version buckets. When upgrading v1/v2, reconstruct them
  // from saved match records. A match's version number, not its build/roster id, defines
  // which character-stat bucket it belongs to.
  let loadedVersionBuckets = false;
  if (sourceSchema >= 3 && raw.versions && typeof raw.versions === 'object') {
    for (const [version, bucketRaw] of Object.entries(raw.versions)) {
      const key = normalizeStatsVersion(version);
      if (!key) continue;
      if (!base.versions[key]) base.versions[key] = emptyCompetitiveVersionStats();
      mergeVersionBucketInto(base.versions[key], normalizeVersionBucket(bucketRaw));
      loadedVersionBuckets = true;
    }
  }
  if (!loadedVersionBuckets && base.matches.length) {
    for (const match of base.matches) {
      const version = statsVersionFromMatch(match) || COMPETITIVE_STATS_VERSION;
      if (!match.statsVersion) match.statsVersion = version;
      if (!base.versions[version]) base.versions[version] = emptyCompetitiveVersionStats();
      addRecordedMatchToVersionBucket(base.versions[version], match);
    }
  } else if (!loadedVersionBuckets && base.totalMatches > 0) {
    // Aggregate-only exports do not carry the internal versions map. Recover the bucket
    // from the export's own statsVersion/gameVersion instead of silently assigning it to
    // whatever build happens to be running now. This is what keeps 1.4/1.5 backups intact.
    const legacyVersion = normalizeStatsVersion(raw.statsVersion) || normalizeStatsVersion(raw.currentBuild?.statsVersion) || normalizeStatsVersion(raw.currentBuild?.gameVersion) || COMPETITIVE_STATS_VERSION;
    const bucket = emptyCompetitiveVersionStats();
    bucket.totalMatches = base.totalMatches;
    bucket.updatedAt = base.updatedAt;
    for (const [id, stat] of Object.entries(base.characters)) bucket.characters[id] = { ...stat };
    bucket.legacySegments.push({
      source: 'aggregate-import',
      statsVersion: legacyVersion,
      balanceVersion: fullBalanceVersion(raw.currentBuild?.gameVersion || raw.statsVersion),
      buildId: raw.currentBuild?.buildId || null,
      totalMatches: base.totalMatches,
      updatedAt: base.updatedAt
    });
    base.versions[legacyVersion] = bucket;
  }

  // Preserve visible version selectors even for a zero-match historical bucket (notably 1.5).
  for (const version of Array.isArray(raw.availableStatsVersions) ? raw.availableStatsVersions : []) {
    const key = normalizeStatsVersion(version);
    if (key && !base.versions[key]) base.versions[key] = emptyCompetitiveVersionStats();
  }

  // Ensure every stored match has an explicit statsVersion for future migrations.
  for (const match of base.matches) {
    if (!match.statsVersion) match.statsVersion = statsVersionFromMatch(match) || COMPETITIVE_STATS_VERSION;
  }
  base.schemaVersion = COMPETITIVE_STATS_SCHEMA_VERSION;
  base.statsSeriesMode = 'major.minor';
  return base;
}

function rebuildCompetitiveStatsFromMatches(matches) {
  const base = emptyCompetitiveStats();
  const seen = new Set();
  for (const rawMatch of Array.isArray(matches) ? matches : []) {
    if (!rawMatch || typeof rawMatch !== 'object') continue;
    const match = rawMatch;
    const matchId = String(match.matchId || '').trim();
    if (!matchId || seen.has(matchId)) continue;
    seen.add(matchId);
    if (!match.statsVersion) match.statsVersion = statsVersionFromMatch(match) || COMPETITIVE_STATS_VERSION;
    base.matches.push(match);
    base.totalMatches += 1;
    if (!base.versions[match.statsVersion]) base.versions[match.statsVersion] = emptyCompetitiveVersionStats();
    addRecordedMatchToVersionBucket(base.versions[match.statsVersion], match);
    for (const id of Array.isArray(match.availableCharacters) ? match.availableCharacters : []) {
      if (!base.characters[id]) base.characters[id] = emptyCompetitiveCharacterStats();
      base.characters[id].availableMatches += 1;
    }
    for (const ban of Array.isArray(match.bans) ? match.bans : []) {
      if (!ban?.character) continue;
      if (!base.characters[ban.character]) base.characters[ban.character] = emptyCompetitiveCharacterStats();
      base.characters[ban.character].bans += 1;
    }
    const recordedPlayers = new Map((Array.isArray(match.players) ? match.players : []).map(p => [String(p?.playerId || ''), p]));
    for (const assignment of Array.isArray(match.finalAssignments) ? match.finalAssignments : []) {
      if (!assignment?.character) continue;
      if (!base.characters[assignment.character]) base.characters[assignment.character] = emptyCompetitiveCharacterStats();
      const stat = base.characters[assignment.character];
      stat.picks += 1;
      const playerRecord = recordedPlayers.get(String(assignment.playerId || ''));
      stat.totalUltimateUses += Math.max(0, Number(playerRecord?.stats?.ultimateUses) || 0);
      if (match.winner === 'DRAW') stat.draws += 1;
      else if (match.winner === assignment.team) stat.wins += 1;
      else stat.losses += 1;
    }
    const endedAt = typeof match.endedAt === 'string' ? match.endedAt : null;
    if (endedAt && (!base.updatedAt || endedAt > base.updatedAt)) base.updatedAt = endedAt;
  }
  if (!base.versions[COMPETITIVE_STATS_VERSION]) base.versions[COMPETITIVE_STATS_VERSION] = emptyCompetitiveVersionStats();
  base.schemaVersion = COMPETITIVE_STATS_SCHEMA_VERSION;
  base.statsSeriesMode = 'major.minor';
  return base;
}

let competitiveStats = emptyCompetitiveStats();
competitiveStats.versions[COMPETITIVE_STATS_VERSION] = emptyCompetitiveVersionStats();

function isAcceptedStatsSeries(version) {
  const match = String(version || '').match(/^(\d+)\.(\d+)$/);
  if (!match) return false;
  const major = Number(match[1]), minor = Number(match[2]);
  return major > 1 || (major === 1 && minor >= 7);
}

async function refreshCompetitiveStatsFromDatabase() {
  const matches = await durableStore.loadMatches();
  const accepted = matches.filter(match => isAcceptedStatsSeries(statsVersionFromMatch(match)));
  competitiveStats = rebuildCompetitiveStatsFromMatches(accepted);
  return competitiveStats;
}

function competitiveStatsHasMatch(matchId) {
  const wanted = String(matchId || '');
  return !!wanted && (competitiveStats.matches || []).some(m => String(m?.matchId || '') === wanted);
}

function applyPersistedMatchToMemory(match) {
  if (!match || !match.matchId || competitiveStatsHasMatch(match.matchId)) return false;
  competitiveStats = rebuildCompetitiveStatsFromMatches([...(competitiveStats.matches || []), match]);
  return true;
}

// Kept only as a guard for older internal/test callers. Runtime JSON persistence is intentionally disabled.
function saveCompetitiveStats() {
  console.warn('[competitive] local JSON save ignored: PostgreSQL is the only authoritative store in stats series 1.7+');
  return false;
}

function wilsonInterval(wins, losses) {
  const w = Math.max(0, Number(wins) || 0), l = Math.max(0, Number(losses) || 0);
  const n = w + l;
  if (!n) return { low: 0, high: 0 };
  const z = 1.959963984540054;
  const p = w / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n) / denom;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function matchAssignments(match) {
  if (Array.isArray(match?.finalAssignments) && match.finalAssignments.length) return match.finalAssignments;
  return (Array.isArray(match?.players) ? match.players : []).map(p => ({
    playerId: p.playerId, accountId: p.accountId || null, playerName: p.playerName || p.nickname, team: p.team, character: p.character
  })).filter(p => p.character && (p.team === 'A' || p.team === 'B'));
}

function buildAdvancedCompetitiveStats(matches, aggregateCharacters = {}) {
  const safeMatches = Array.isArray(matches) ? matches : [];
  const playerMap = new Map(), pairMap = new Map(), trioMap = new Map(), compMap = new Map(), matchupMap = new Map();
  const draftChars = Object.create(null);
  const advancedChar = Object.create(null);
  const side = { A: { wins: 0, losses: 0, draws: 0 }, B: { wins: 0, losses: 0, draws: 0 } };
  let firstPickWins = 0, firstPickLosses = 0, firstPickDraws = 0, completeMatches = 0, partialMatches = 0, disconnectMatches = 0;

  const wl = (rec, outcome) => {
    if (outcome === 'W') rec.wins = (rec.wins || 0) + 1;
    else if (outcome === 'L') rec.losses = (rec.losses || 0) + 1;
    else rec.draws = (rec.draws || 0) + 1;
    rec.games = (rec.games || 0) + 1;
  };
  const outcomeForTeam = (match, team) => match.winner === 'DRAW' ? 'D' : (match.winner === team ? 'W' : 'L');

  for (const match of safeMatches) {
    const assignments = matchAssignments(match);
    const byTeam = {
      A: assignments.filter(a => a.team === 'A'),
      B: assignments.filter(a => a.team === 'B')
    };
    const qualityComplete = match?.dataQuality?.complete !== false && assignments.length === 8;
    if (qualityComplete) completeMatches += 1; else partialMatches += 1;
    if ((Array.isArray(match?.players) ? match.players : []).some(p => Number(p.disconnectCount || 0) > 0 || p.connectedAtEnd === false)) disconnectMatches += 1;

    if (match.winner === 'DRAW') { side.A.draws++; side.B.draws++; }
    else if (match.winner === 'A') { side.A.wins++; side.B.losses++; }
    else if (match.winner === 'B') { side.B.wins++; side.A.losses++; }

    if (match.firstPickTeam === 'A' || match.firstPickTeam === 'B') {
      const fpOutcome = outcomeForTeam(match, match.firstPickTeam);
      if (fpOutcome === 'W') firstPickWins++; else if (fpOutcome === 'L') firstPickLosses++; else firstPickDraws++;
    }

    const playerRecords = new Map((Array.isArray(match?.players) ? match.players : []).map(p => [String(p.playerId || ''), p]));
    for (const a of assignments) {
      const pr = playerRecords.get(String(a.playerId || '')) || {};
      const name = String(pr.playerName || pr.nickname || a.playerName || '학생');
      const key = String(pr.playerKey || accountStatKey(pr.accountId || a.accountId, name));
      if (!playerMap.has(key)) playerMap.set(key, { playerKey: key, nickname: name, games: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, assists: 0, damage: 0, damageTaken: 0, healing: 0, ultimateUses: 0, objectiveSeconds: 0, disconnects: 0, characters: {} });
      const ps = playerMap.get(key); ps.nickname = name;
      wl(ps, outcomeForTeam(match, a.team));
      const st = pr.stats || {};
      for (const k of ['kills','deaths','assists','damage','damageTaken','healing','ultimateUses','objectiveSeconds']) ps[k] += Math.max(0, Number(st[k]) || 0);
      ps.disconnects += Math.max(0, Number(pr.disconnectCount) || 0);
      if (!ps.characters[a.character]) ps.characters[a.character] = { games: 0, wins: 0, losses: 0, draws: 0 };
      wl(ps.characters[a.character], outcomeForTeam(match, a.team));
      if (!advancedChar[a.character]) advancedChar[a.character] = { games: 0, wins: 0, losses: 0, draws: 0, kills:0, deaths:0, assists:0, damage:0, damageTaken:0, healing:0, ultimateUses:0, objectiveSeconds:0 };
      const ac = advancedChar[a.character];
      wl(ac, outcomeForTeam(match, a.team));
      for (const k of ['kills','deaths','assists','damage','damageTaken','healing','ultimateUses','objectiveSeconds']) ac[k] += Math.max(0, Number(st[k]) || 0);
    }

    for (const team of ['A','B']) {
      const ids = byTeam[team].map(a => a.character).filter(Boolean).sort();
      const outcome = outcomeForTeam(match, team);
      for (const [a,b] of combinations(ids, 2)) {
        const key = `${a}|${b}`;
        if (!pairMap.has(key)) pairMap.set(key, { characters:[a,b], games:0,wins:0,losses:0,draws:0 });
        wl(pairMap.get(key), outcome);
      }
      for (const trio of combinations(ids, 3)) {
        const key = trio.join('|');
        if (!trioMap.has(key)) trioMap.set(key, { characters:trio, games:0,wins:0,losses:0,draws:0 });
        wl(trioMap.get(key), outcome);
      }
      if (ids.length) {
        const key = ids.join('|');
        if (!compMap.has(key)) compMap.set(key, { characters:ids, games:0,wins:0,losses:0,draws:0 });
        wl(compMap.get(key), outcome);
      }
    }

    for (const aa of byTeam.A) for (const bb of byTeam.B) {
      if (!aa.character || !bb.character) continue;
      const chars = [aa.character, bb.character].sort();
      const key = chars.join('|');
      if (!matchupMap.has(key)) matchupMap.set(key, { characters:chars, games:0, firstWins:0, secondWins:0, draws:0 });
      const rec = matchupMap.get(key); rec.games += 1;
      if (match.winner === 'DRAW') rec.draws += 1;
      else {
        const firstTeam = aa.character === chars[0] ? 'A' : 'B';
        if (match.winner === firstTeam) rec.firstWins += 1; else rec.secondWins += 1;
      }
    }

    for (const ban of Array.isArray(match?.bans) ? match.bans : []) {
      if (!ban?.character) continue;
      const d = draftChars[ban.character] ||= { bans:0,picks:0,autoPicks:0,banVotes:0,banOrders:{},pickOrders:{} };
      d.bans += 1;
      const order = Math.max(1, Number(ban.order) || 1);
      d.banOrders[order] = (d.banOrders[order] || 0) + 1;
      if (Array.isArray(ban.votes)) d.banVotes += ban.votes.length;
    }
    for (const pick of Array.isArray(match?.picks) ? match.picks : []) {
      if (!pick?.character) continue;
      const d = draftChars[pick.character] ||= { bans:0,picks:0,autoPicks:0,banVotes:0,banOrders:{},pickOrders:{} };
      d.picks += 1;
      if (pick.auto) d.autoPicks += 1;
      const order = Math.max(1, Number(pick.order) || 1);
      d.pickOrders[order] = (d.pickOrders[order] || 0) + 1;
    }
  }

  const finalizeWL = rec => {
    const decided = (rec.wins || 0) + (rec.losses || 0);
    rec.winRate = decided ? (rec.wins || 0) / decided : 0;
    rec.winRateCI = wilsonInterval(rec.wins || 0, rec.losses || 0);
    return rec;
  };
  const charRates = {};
  for (const [id, rec] of Object.entries(advancedChar)) {
    finalizeWL(rec);
    charRates[id] = rec.winRate;
    const g = Math.max(1, Number(rec.games)||0);
    rec.perGame = { kills:rec.kills/g, deaths:rec.deaths/g, assists:rec.assists/g, damage:rec.damage/g, damageTaken:rec.damageTaken/g, healing:rec.healing/g, ultimateUses:rec.ultimateUses/g, objectiveSeconds:rec.objectiveSeconds/g };
  }
  const pairs = [...pairMap.values()].map(rec => {
    finalizeWL(rec);
    const baseline = ((charRates[rec.characters[0]] ?? 0.5) + (charRates[rec.characters[1]] ?? 0.5)) / 2;
    rec.expectedBaseline = baseline;
    rec.synergyLift = rec.winRate - baseline;
    return rec;
  }).sort((a,b) => b.games-a.games || b.synergyLift-a.synergyLift);
  const trios = [...trioMap.values()].map(finalizeWL).sort((a,b) => b.games-a.games || b.winRate-a.winRate);
  const compositions = [...compMap.values()].map(finalizeWL).sort((a,b) => b.games-a.games || b.winRate-a.winRate);
  const matchups = [...matchupMap.values()].map(rec => {
    const decided = rec.firstWins + rec.secondWins;
    rec.firstWinRate = decided ? rec.firstWins / decided : 0;
    rec.firstWinRateCI = wilsonInterval(rec.firstWins, rec.secondWins);
    return rec;
  }).sort((a,b) => b.games-a.games || Math.abs(b.firstWinRate-.5)-Math.abs(a.firstWinRate-.5));
  const players = [...playerMap.values()].map(rec => {
    finalizeWL(rec);
    rec.kd = rec.deaths > 0 ? rec.kills / rec.deaths : rec.kills;
    rec.characters = Object.fromEntries(Object.entries(rec.characters).map(([id, cr]) => [id, finalizeWL(cr)]));
    return rec;
  }).sort((a,b) => b.games-a.games || b.winRate-a.winRate || b.kills-a.kills);

  for (const [id, rec] of Object.entries(draftChars)) {
    const agg = aggregateCharacters[id] || {};
    const available = Math.max(0, Number(agg.availableMatches) || 0);
    const unbanned = Math.max(0, available - (Number(agg.bans) || 0));
    rec.presenceRate = available ? ((Number(agg.bans)||0) + (Number(agg.picks)||0)) / available : 0;
    rec.unbannedPickRate = unbanned ? (Number(agg.picks)||0) / unbanned : 0;
  }

  const firstDecided = firstPickWins + firstPickLosses;
  return {
    recordedMatches: safeMatches.length,
    completeMatches,
    partialMatches,
    disconnectMatches,
    legacyAggregateOnlyMatches: Math.max(0, Math.max(...Object.values(aggregateCharacters).map(s => Number(s.availableMatches)||0), 0) - safeMatches.length),
    players,
    characters: advancedChar,
    synergy: { pairs, trios, compositions },
    matchups,
    draft: {
      characters: draftChars,
      firstPick: { wins:firstPickWins, losses:firstPickLosses, draws:firstPickDraws, winRate:firstDecided ? firstPickWins/firstDecided : 0, winRateCI:wilsonInterval(firstPickWins, firstPickLosses) }
    },
    side
  };
}

function publicCompetitiveStats(requestedVersion = COMPETITIVE_STATS_VERSION) {
  const availableStatsVersions = Object.keys(competitiveStats.versions || {}).sort(versionSort);
  if (!availableStatsVersions.includes(COMPETITIVE_STATS_VERSION)) availableStatsVersions.push(COMPETITIVE_STATS_VERSION);
  availableStatsVersions.sort(versionSort);
  const requested = normalizeStatsVersion(requestedVersion);
  const statsVersion = requested && availableStatsVersions.includes(requested) ? requested : COMPETITIVE_STATS_VERSION;
  const bucket = competitiveStats.versions?.[statsVersion] || emptyCompetitiveVersionStats();
  const characters = {};
  const ids = new Set([...Object.keys(CHARACTERS), ...Object.keys(bucket.characters || {})]);
  for (const id of ids) {
    const src = bucket.characters?.[id] || emptyCompetitiveCharacterStats();
    const available = Math.max(0, Number(src.availableMatches) || 0);
    const decided = (src.wins || 0) + (src.losses || 0);
    characters[id] = {
      availableMatches: available,
      bans: src.bans || 0, picks: src.picks || 0, wins: src.wins || 0, losses: src.losses || 0, draws: src.draws || 0,
      totalUltimateUses: Math.max(0, Number(src.totalUltimateUses) || 0),
      averageUltimateUsesPerPick: (src.picks || 0) > 0 ? Math.max(0, Number(src.totalUltimateUses) || 0) / (src.picks || 0) : 0,
      banRate: available > 0 ? (src.bans || 0) / available : 0,
      pickRate: available > 0 ? (src.picks || 0) / available : 0,
      presenceRate: available > 0 ? ((src.bans || 0) + (src.picks || 0)) / available : 0,
      unbannedMatches: Math.max(0, available - (src.bans || 0)),
      unbannedPickRate: Math.max(0, available - (src.bans || 0)) > 0 ? (src.picks || 0) / Math.max(1, available - (src.bans || 0)) : 0,
      winRate: decided > 0 ? (src.wins || 0) / decided : 0,
      winRateCI: wilsonInterval(src.wins || 0, src.losses || 0)
    };
  }
  const versionMatches = (Array.isArray(competitiveStats.matches) ? competitiveStats.matches : []).filter(m => (statsVersionFromMatch(m) || COMPETITIVE_STATS_VERSION) === statsVersion);
  const advanced = buildAdvancedCompetitiveStats(versionMatches, characters);
  return {
    schemaVersion: competitiveStats.schemaVersion || COMPETITIVE_STATS_SCHEMA_VERSION,
    statsVersion,
    availableStatsVersions,
    totalMatches: Math.max(0, Number(bucket.totalMatches) || 0),
    allTimeTotalMatches: Math.max(0, Number(competitiveStats.totalMatches) || 0),
    updatedAt: bucket.updatedAt || null,
    allTimeUpdatedAt: competitiveStats.updatedAt || null,
    currentBuild: {
      gameVersion: GAME_VERSION, balanceVersion: BALANCE_VERSION, statsVersion: COMPETITIVE_STATS_VERSION,
      buildId: COMPETITIVE_BUILD_ID, rosterVersion: COMPETITIVE_ROSTER_VERSION,
      availableCharacters: Object.keys(CHARACTERS)
    },
    characters,
    advanced,
    matches: versionMatches
  };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function distance(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function safeName(value) {
  const s = String(value || '').trim().replace(/[\r\n\t]/g, ' ');
  return s.slice(0, 12) || '학생';
}

// One nickname = one reserved player seat across the whole server.  This prevents
// students from leaving an ownerless seat in one match and joining another match
// with the same nickname. A disconnected seat can also be reclaimed by entering the
// same normalized nickname in the same room; a still-connected seat remains locked.
// Resume-token reconnection remains the preferred path and can replace a stale socket.
function canonicalNickname(value) {
  return safeName(value).normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR');
}
function findNicknameReservation(value) {
  const key = canonicalNickname(value);
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (canonicalNickname(player.name) === key) return { room, player };
    }
  }
  return null;
}
function safeRoom(value) {
  const s = String(value || '').toUpperCase().replace(/[^A-Z0-9가-힣_-]/g, '').slice(0, 10);
  return s || '6-1';
}
function safePin(value) { return String(value || '').replace(/\D/g, '').slice(0, 4); }
function hashText(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function newResumeToken() { return crypto.randomBytes(24).toString('hex'); }
function safeResumeToken(value) {
  const token = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{48}$/.test(token) ? token : '';
}
function spectatorAuthLocked(remoteAddress, now = Date.now()) {
  const entry = spectatorAuthFailures.get(remoteAddress);
  if (!entry) return false;
  if (entry.lockUntil && entry.lockUntil > now) return true;
  if (entry.lockUntil && entry.lockUntil <= now) spectatorAuthFailures.delete(remoteAddress);
  return false;
}
function noteSpectatorAuthFailure(remoteAddress, now = Date.now()) {
  const entry = spectatorAuthFailures.get(remoteAddress) || { count: 0, lockUntil: 0 };
  entry.count += 1;
  if (entry.count >= SPECTATOR_MAX_FAILURES) { entry.count = 0; entry.lockUntil = now + SPECTATOR_LOCK_MS; }
  spectatorAuthFailures.set(remoteAddress, entry);
}
function clearSpectatorAuthFailure(remoteAddress) { spectatorAuthFailures.delete(remoteAddress); }
function adminStatsAuthLocked(remoteAddress, now = Date.now()) {
  const entry = adminStatsAuthFailures.get(remoteAddress);
  if (!entry) return false;
  if (entry.lockUntil && entry.lockUntil > now) return true;
  if (entry.lockUntil && entry.lockUntil <= now) adminStatsAuthFailures.delete(remoteAddress);
  return false;
}
function noteAdminStatsAuthFailure(remoteAddress, now = Date.now()) {
  const entry = adminStatsAuthFailures.get(remoteAddress) || { count: 0, lockUntil: 0 };
  entry.count += 1;
  if (entry.count >= ADMIN_STATS_MAX_FAILURES) { entry.count = 0; entry.lockUntil = now + ADMIN_STATS_LOCK_MS; }
  adminStatsAuthFailures.set(remoteAddress, entry);
}
function clearAdminStatsAuthFailure(remoteAddress) { adminStatsAuthFailures.delete(remoteAddress); }
function accessAdminAuthLocked(remoteAddress, now = Date.now()) {
  const entry = accessAdminAuthFailures.get(remoteAddress);
  if (!entry) return false;
  if (entry.lockUntil && entry.lockUntil > now) return true;
  if (entry.lockUntil && entry.lockUntil <= now) accessAdminAuthFailures.delete(remoteAddress);
  return false;
}
function noteAccessAdminAuthFailure(remoteAddress, now = Date.now()) {
  const entry = accessAdminAuthFailures.get(remoteAddress) || { count: 0, lockUntil: 0 };
  entry.count += 1;
  if (entry.count >= ACCESS_ADMIN_MAX_FAILURES) { entry.count = 0; entry.lockUntil = now + ACCESS_ADMIN_LOCK_MS; }
  accessAdminAuthFailures.set(remoteAddress, entry);
}
function clearAccessAdminAuthFailure(remoteAddress) { accessAdminAuthFailures.delete(remoteAddress); }
function validCharacter(value) { return CHARACTERS[value] ? value : 'shooter'; }
function speedWithTierDelta(speed, delta) {
  let best = 0;
  for (let i = 1; i < SPEED_TIERS.length; i++) {
    if (Math.abs(SPEED_TIERS[i] - speed) < Math.abs(SPEED_TIERS[best] - speed)) best = i;
  }
  return SPEED_TIERS[clamp(best + delta, 0, SPEED_TIERS.length - 1)];
}

function resolveDistanceDamage(bands, traveled, fallback = 0) {
  if (!Array.isArray(bands) || bands.length === 0) return fallback;
  for (const band of bands) {
    if (traveled <= Number(band.max) + 1e-6) return Number(band.damage) || 0;
  }
  return Number(bands[bands.length - 1].damage) || fallback;
}

function isDiaForm(player, now) {
  return player.character === 'dia' && player.diaFormUntil > now;
}

function reactorStageForOutput(def, output) {
  const bands = Array.isArray(def && def.reactorOutputBands) ? def.reactorOutputBands : null;
  if (!bands || bands.length < 3) {
    const value = clamp(Number(output) || 0, 0, 100);
    return value >= 66 ? 3 : (value >= 33 ? 2 : 1);
  }
  const value = clamp(Number(output) || 0, 0, 100);
  if (value < Number(bands[0].max)) return 1;
  if (value < Number(bands[1].max)) return 2;
  return 3;
}

function reactorDamageForOutput(def, output) {
  const bands = Array.isArray(def && def.reactorOutputBands) ? def.reactorOutputBands : null;
  if (!bands || bands.length === 0) return Number(def && def.damage) || 0;
  const stage = reactorStageForOutput(def, output);
  const band = bands[Math.max(0, Math.min(bands.length - 1, stage - 1))];
  return Number(band && band.damage) || Number(def && def.damage) || 0;
}

function isUltimateActive(player, now = Date.now()) {
  return !!player && Number(player.ultimateUntil || 0) > now;
}

function currentAttackDef(player, now) {
  const def = CHARACTERS[player.character];
  if (isDiaForm(player, now)) {
    return { attackType: 'beam', range: def.formRange, beamDps: def.formBeamDps, maxHpDpsRatio: 0 };
  }
  if (player.character === 'reactor') {
    const damage = reactorDamageForOutput(def, player.reactorOutput);
    if (isUltimateActive(player, now)) return { ...def, damage };
    return { ...def, damage };
  }
  if (isUltimateActive(player, now)) {
    if (player.character === 'shooter') {
      return { ...def, damage: def.ultimateDamage, range: def.ultimateRange };
    }
    if (player.character === 'sniper') {
      return {
        ...def,
        projectileRadius: def.ultimateProjectileRadius,
        distanceDamageBands: [{ max: 16, damage: 45 }, { max: def.range, damage: def.ultimateLongRangeDamage }]
      };
    }
    if (player.character === 'fire') {
      return { ...def, projectileRadius: def.ultimateProjectileRadius, burnDuration: def.ultimateBurnDuration };
    }
    if (player.character === 'cannon') {
      return { ...def, damage: def.ultimateDamage };
    }
    if (player.character === 'spray') {
      return { ...def, spraySideDamage: def.ultimateSideDamage };
    }
    if (player.character === 'light') {
      return { ...def, range: def.ultimateRange, beamDps: def.ultimateBeamDps, healHps: def.ultimateHealHps };
    }
    if (player.character === 'laser') {
      return { ...def, maxHpDpsRatio: def.ultimateMaxHpDpsRatio };
    }
  }
  return def;
}

function currentBaseSpeed(player, now) {
  const def = CHARACTERS[player.character];
  if (isDiaForm(player, now)) return def.formSpeed;
  if (player.character === 'reactor' && reactorStageForOutput(def, player.reactorOutput) === 3) return def.reactorHighSpeed;
  return def.speed;
}

function effectiveSpeed(player, now, room = null) {
  if (player.character === 'runner' && isUltimateActive(player, now)) return SPEED_TIERS[SPEED_TIERS.length - 1];
  let delta = 0;
  if (player.character === 'runner' && player.sprintUntil > now) delta += 1;
  if (player.character === 'shooter' && isUltimateActive(player, now)) delta += Number(CHARACTERS.shooter.ultimateSpeedTierDelta) || 0;
  if (player.character === 'reactor' && isUltimateActive(player, now)) delta += Number(CHARACTERS.reactor.ultimateSpeedTierDelta) || 0;
  delta += linkedBufferUltimateSpeedDelta(room, player, now);
  const tailwind = getStatus(player, 'tailwind', now);
  const slow = getStatus(player, 'slow', now);
  if (tailwind) delta += Number(tailwind.data && tailwind.data.tierDelta) || 1;
  if (slow) delta += Number(slow.data && slow.data.tierDelta) || -1;
  return speedWithTierDelta(currentBaseSpeed(player, now), delta);
}


function resolveBufferTarget(room, buffer) {
  if (!room || !buffer || buffer.character !== 'buffer' || !buffer.bufferTargetId) return null;
  const target = room.players.get(String(buffer.bufferTargetId));
  if (!target || !target.alive || target.team !== buffer.team || target.id === buffer.id) return null;
  return target;
}

function bufferLinkState(room, buffer, now = Date.now()) {
  const target = resolveBufferTarget(room, buffer);
  if (!target) return { target: null, active: false };
  const def = CHARACTERS.buffer;
  const active = !!buffer.alive && buffer.connected !== false && !isStunned(buffer, now)
    && distance(buffer.x, buffer.y, target.x, target.y) <= Number(def.range || 16) + 1e-9;
  return { target, active };
}

function setBufferTarget(room, buffer, targetId) {
  if (!room || !buffer || buffer.character !== 'buffer' || !buffer.alive) return false;
  const target = room.players.get(String(targetId || ''));
  if (!target || !target.alive || target.id === buffer.id || target.team !== buffer.team) return false;
  buffer.bufferTargetId = target.id;
  return true;
}

function clearBufferTargetRefs(room, playerId) {
  if (!room || !playerId) return;
  for (const p of room.players.values()) {
    if (p.character === 'buffer' && p.bufferTargetId === playerId) p.bufferTargetId = null;
  }
}

function linkedBufferUltimateSpeedDelta(room, player, now = Date.now()) {
  if (!room || !player || !player.alive) return 0;
  for (const buffer of room.players.values()) {
    if (buffer.character !== 'buffer' || buffer.team !== player.team || !isUltimateActive(buffer, now)) continue;
    const state = bufferLinkState(room, buffer, now);
    if (state.active && state.target && state.target.id === player.id) return Number(CHARACTERS.buffer.ultimateLinkedSpeedTierDelta) || 0;
  }
  return 0;
}

function periodicActionRateMultiplier(room, player, now = Date.now()) {
  if (!room || !player || !player.alive) return 1;
  for (const buffer of room.players.values()) {
    if (buffer.character !== 'buffer' || buffer.team !== player.team) continue;
    const state = bufferLinkState(room, buffer, now);
    if (state.active && state.target && state.target.id === player.id) {
      return 1 + Math.max(0, Number(CHARACTERS.buffer.actionSpeedBoost) || 0);
    }
  }
  return 1;
}

function periodicActionReady(room, player, baseRate, now = Date.now()) {
  const rate = Math.max(0, Number(baseRate) || 0) * periodicActionRateMultiplier(room, player, now);
  if (rate <= 0) return false;
  const last = Number(player.lastPeriodicActionAt);
  if (!Number.isFinite(last) || last <= 0) return true;
  return now - last >= 1000 / rate - 1e-6;
}


function recordSupportContribution(source, target, now = Date.now()) {
  if (!source || !target || !source.id || !target.id) return false;
  if (source.id === target.id || source.team !== target.team) return false;
  if (!target.supportContributors || typeof target.supportContributors !== 'object') {
    target.supportContributors = Object.create(null);
  }
  target.supportContributors[String(source.id)] = now;
  return true;
}

function getTargetRelation(source, target) {
  if (!source || !target) return null;
  if (source.id === target.id) return TARGET_RELATION.SELF;
  return source.team === target.team ? TARGET_RELATION.ALLY : TARGET_RELATION.ENEMY;
}
function isTargetRelationAllowed(source, target, allowedRelations) {
  const relation = getTargetRelation(source, target);
  return !!relation && Array.isArray(allowedRelations) && allowedRelations.includes(relation);
}
function ensureStatuses(player) {
  if (!player.statuses || typeof player.statuses !== 'object') player.statuses = Object.create(null);
  return player.statuses;
}
function getStatus(player, statusId, now = Date.now()) {
  const statuses = ensureStatuses(player);
  const status = statuses[statusId];
  if (!status) return null;
  if (status.until <= now) { delete statuses[statusId]; return null; }
  return status;
}
function hasStatus(player, statusId, now = Date.now()) { return !!getStatus(player, statusId, now); }
function clearStatus(player, statusId) { delete ensureStatuses(player)[statusId]; }
function clearAllStatuses(player) { player.statuses = Object.create(null); }
function applyStatus(room, source, target, statusId, durationMs, now = Date.now(), data = {}) {
  const def = STATUS_DEFS[statusId];
  if (!def || !target || !target.alive) return false;
  if (def.kind === 'harmful' && target.invulnerableUntil > now) return false;
  const duration = Math.max(0, Number(durationMs) || 0);
  if (duration <= 0) return false;
  const statuses = ensureStatuses(target);
  const existing = getStatus(target, statusId, now);
  statuses[statusId] = {
    until: Math.max(existing ? existing.until : 0, now + duration),
    sourceId: source && source.id ? source.id : null,
    data: { ...(existing && existing.data ? existing.data : {}), ...(data || {}) }
  };
  if (def.kind === 'beneficial') recordSupportContribution(source, target, now);
  return true;
}
function isStunned(player, now = Date.now()) { return hasStatus(player, 'stun', now); }
function hasLineOfSight(ax, ay, bx, by) {
  for (const w of WALLS) {
    const t = segmentAabbT(ax, ay, bx, by, w.x, w.y, w.x + w.w, w.y + w.h);
    if (t !== null && t > 1e-6 && t < 1 - 1e-6) return false;
  }
  return true;
}
function resolveTargetedAbilityTarget(room, source, targetId, rule, now = Date.now()) {
  if (!room || !source || !source.alive || !rule || !targetId) return null;
  const target = room.players.get(String(targetId));
  if (!target || !target.alive) return null;
  if (!isTargetRelationAllowed(source, target, rule.relations || [])) return null;
  if (Number.isFinite(rule.range) && distance(source.x, source.y, target.x, target.y) > rule.range + 1e-9) return null;
  if (rule.requireLos && !hasLineOfSight(source.x, source.y, target.x, target.y)) return null;
  return target;
}
function resetShieldAttribution(player) {
  player.shieldCreditBySource = Object.create(null);
  player.shieldUncredited = 0;
}
function ensureShieldAttribution(player, shieldAmount = null) {
  if (!player.shieldCreditBySource || typeof player.shieldCreditBySource !== 'object') player.shieldCreditBySource = Object.create(null);
  if (!Number.isFinite(player.shieldUncredited)) player.shieldUncredited = 0;
  const current = shieldAmount == null ? Math.max(0, Number(player.shield) || 0) : Math.max(0, Number(shieldAmount) || 0);
  let tracked = Math.max(0, Number(player.shieldUncredited) || 0);
  for (const value of Object.values(player.shieldCreditBySource)) tracked += Math.max(0, Number(value) || 0);
  if (tracked < current - 1e-9) player.shieldUncredited += current - tracked;
  else if (tracked > current + 1e-9 && tracked > 0) {
    const scale = current / tracked;
    player.shieldUncredited *= scale;
    for (const key of Object.keys(player.shieldCreditBySource)) player.shieldCreditBySource[key] *= scale;
  }
}
function clearShield(player) {
  player.shield = 0; player.maxShield = 0; player.shieldUntil = 0;
  resetShieldAttribution(player);
  if (player.character === 'jet') player.jetShieldUntil = 0;
}
function applyShield(room, source, target, amount, options = {}) {
  if (!target || !target.alive) return 0;
  const raw = Math.max(0, Number(amount) || 0);
  if (raw <= 0) return 0;

  // Alpha 1.3 unified shield rule:
  // every temporary shield source shares one additive pool and the pool can never exceed 500.
  // The options argument is intentionally retained for backward-compatible callers/tests,
  // but per-source replace/cap behavior is no longer used.
  const before = Math.max(0, Number(target.shield) || 0);
  ensureShieldAttribution(target, before);
  target.maxShield = GLOBAL_SHIELD_CAP;
  target.shield = Math.min(GLOBAL_SHIELD_CAP, before + raw);
  const added = Math.max(0, target.shield - before);
  if (added > 0) {
    const supportNow = Number.isFinite(Number(options && options.now)) ? Number(options.now) : Date.now();
    recordSupportContribution(source, target, supportNow);
    if (source && source.character === 'shield') {
      const key = String(source.id);
      target.shieldCreditBySource[key] = Math.max(0, Number(target.shieldCreditBySource[key]) || 0) + added;
    } else {
      target.shieldUncredited = Math.max(0, Number(target.shieldUncredited) || 0) + added;
    }
  }
  ensureShieldAttribution(target, target.shield);
  return added;
}
function consumeShieldAttribution(room, target, shieldDamage, shieldBefore) {
  const damage = Math.max(0, Number(shieldDamage) || 0);
  const before = Math.max(0, Number(shieldBefore) || 0);
  if (damage <= 0 || before <= 0) return;
  ensureShieldAttribution(target, before);
  const ratio = Math.min(1, damage / before);
  for (const key of Object.keys(target.shieldCreditBySource || {})) {
    const amount = Math.max(0, Number(target.shieldCreditBySource[key]) || 0);
    if (amount <= 0) continue;
    const absorbed = amount * ratio;
    target.shieldCreditBySource[key] = Math.max(0, amount - absorbed);
    const source = room && room.players ? room.players.get(key) : null;
    if (source && source.character === 'shield') ensureMatchStats(source).shieldDamageBlocked += absorbed;
  }
  target.shieldUncredited = Math.max(0, Number(target.shieldUncredited) || 0) * (1 - ratio);
}

function updateShieldAbilityCharges(player, now = Date.now()) {
  if (!player || player.character !== 'shield') return;
  const def = CHARACTERS.shield;
  const maxCharges = Math.max(1, Math.floor(Number(def.shieldMaxCharges) || 2));
  const rechargeMs = Math.max(1, Number(def.shieldRecharge) || 9) * 1000;
  if (!Number.isFinite(player.shieldAbilityCharges)) player.shieldAbilityCharges = maxCharges;
  player.shieldAbilityCharges = clamp(Math.floor(player.shieldAbilityCharges), 0, maxCharges);
  if (player.shieldAbilityCharges >= maxCharges) { player.shieldRechargeAt = 0; return; }
  if (!Number.isFinite(player.shieldRechargeAt) || player.shieldRechargeAt <= 0) player.shieldRechargeAt = now + rechargeMs;
  while (player.shieldAbilityCharges < maxCharges && now >= player.shieldRechargeAt) {
    player.shieldAbilityCharges += 1;
    if (player.shieldAbilityCharges < maxCharges) player.shieldRechargeAt += rechargeMs;
    else player.shieldRechargeAt = 0;
  }
}

function activateShieldAbility(room, player, target, now = Date.now()) {
  if (!room || !player || player.character !== 'shield' || !player.alive || !target || !target.alive) return false;
  const def = CHARACTERS.shield;
  updateShieldAbilityCharges(player, now);
  if ((player.shieldAbilityCharges || 0) <= 0) return false;
  player.shieldAbilityCharges -= 1;
  if (!player.shieldRechargeAt) player.shieldRechargeAt = now + Number(def.shieldRecharge) * 1000;
  applyShield(room, player, target, def.shieldAmount, { now });
  target.shieldUntil = now + Number(def.shieldDuration) * 1000;
  if (target.character === 'jet') target.jetShieldUntil = target.shieldUntil;
  return true;
}

function schoolLineAccessPayload() {
  return { open: !!schoolLineAccessOpen, state: schoolLineAccessOpen ? 'OPEN' : 'LOCKED' };
}

function sendJson(res, statusCode, value) {
  const data = Buffer.from(JSON.stringify(value), 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': data.length
  });
  res.end(data);
}

function readJsonBody(req, callback) {
  let raw = '';
  let done = false;
  const finish = (err, value) => {
    if (done) return;
    done = true;
    callback(err, value);
  };
  req.setEncoding('utf8');
  req.on('data', chunk => {
    raw += chunk;
    if (raw.length > 2048) finish(new Error('body_too_large'));
  });
  req.on('end', () => {
    if (done) return;
    try { finish(null, raw ? JSON.parse(raw) : {}); }
    catch (_) { finish(new Error('invalid_json')); }
  });
  req.on('error', err => finish(err));
}

function setSchoolLineAccess(open) {
  const desired = !!open;
  if (schoolLineAccessOpen === desired) return;
  schoolLineAccessOpen = desired;
  if (desired) return;

  // Immediate classroom lock: terminate every current room/session and return all connected
  // browsers to the locked screen. No match or resume reservation survives the lock.
  const conns = [...activeConnections];
  for (const conn of conns) {
    try { conn.send({ type: 'access_locked', message: '관리자가 입장을 제한했습니다.' }); } catch (_) {}
  }
  for (const room of rooms.values()) {
    for (const player of room.players.values()) neutralizePlayerInput(player);
  }
  rooms.clear();
  setTimeout(() => {
    for (const conn of conns) {
      conn.playerId = null;
      conn.spectatorId = null;
      conn.roomCode = null;
      try { conn.close(); } catch (_) {}
    }
  }, 80);
}

function handleAccessControlRequest(req, res) {
  const remoteAddress = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (accessAdminAuthLocked(remoteAddress, now)) {
    sendJson(res, 429, { ok: false, error: 'locked_out', message: '관리자 암호 입력이 잠시 잠겼습니다. 30초 뒤 다시 시도하세요.', ...schoolLineAccessPayload() });
    return;
  }
  readJsonBody(req, (err, body) => {
    if (err) {
      sendJson(res, 400, { ok: false, error: 'bad_request', message: '요청을 처리할 수 없습니다.', ...schoolLineAccessPayload() });
      return;
    }
    const pin = safePin(body && body.pin);
    if (pin.length !== 4 || hashText(pin) !== ACCESS_ADMIN_PIN_HASH) {
      noteAccessAdminAuthFailure(remoteAddress, Date.now());
      sendJson(res, 403, { ok: false, error: 'bad_pin', message: '관리자 암호가 올바르지 않습니다.', ...schoolLineAccessPayload() });
      return;
    }
    const action = String(body && body.action || '').toLowerCase();
    if (action !== 'open' && action !== 'lock') {
      sendJson(res, 400, { ok: false, error: 'bad_action', message: '열기 또는 잠그기 동작을 선택하세요.', ...schoolLineAccessPayload() });
      return;
    }
    clearAccessAdminAuthFailure(remoteAddress);
    setSchoolLineAccess(action === 'open');
    sendJson(res, 200, {
      ok: true,
      action,
      message: action === 'open' ? '스쿨라인을 열었습니다.' : '스쿨라인을 잠갔습니다. 진행 중인 방과 경기는 종료되었습니다.',
      ...schoolLineAccessPayload()
    });
  });
}


function handlePlayerAccountsAdmin(req, res) {
  const remoteAddress = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (accessAdminAuthLocked(remoteAddress, now)) {
    sendJson(res, 429, { ok:false, error:'locked_out', message:'관리자 암호 입력이 잠시 잠겼습니다. 30초 뒤 다시 시도하세요.' });
    return;
  }
  readJsonBody(req, async (err, body) => {
    if (err) { sendJson(res, 400, { ok:false, error:'bad_request', message:'요청을 처리할 수 없습니다.' }); return; }
    const adminPin = safePin(body && body.adminPin);
    if (adminPin.length !== 4 || hashText(adminPin) !== ACCESS_ADMIN_PIN_HASH) {
      noteAccessAdminAuthFailure(remoteAddress, Date.now());
      sendJson(res, 403, { ok:false, error:'bad_pin', message:'관리자 암호가 올바르지 않습니다.' });
      return;
    }
    clearAccessAdminAuthFailure(remoteAddress);
    const action = String(body && body.action || 'list').toLowerCase();
    if (action === 'list') {
      sendJson(res, 200, { ok:true, accounts: playerAccounts.map(a => ({ ...a })) });
      return;
    }
    if (action !== 'update') {
      sendJson(res, 400, { ok:false, error:'bad_action', message:'지원하지 않는 계정 관리 동작입니다.' });
      return;
    }
    const account = playerAccountById(body && body.accountId);
    if (!account) { sendJson(res, 404, { ok:false, error:'account_missing', message:'고정 계정을 찾을 수 없습니다.' }); return; }
    const nextPin = String(body && body.pin || '').replace(/\D/g, '').slice(0, 4);
    const nextName = normalizeAccountName(body && body.name || account.name);
    if (nextPin.length !== 4) { sendJson(res, 400, { ok:false, error:'bad_student_pin', message:'계정 PIN은 숫자 4자리여야 합니다.' }); return; }
    if (playerAccounts.some(a => a.id !== account.id && a.pin === nextPin)) {
      sendJson(res, 409, { ok:false, error:'pin_duplicate', message:'다른 계정이 이미 사용하는 PIN입니다. 다른 번호를 입력하세요.' });
      return;
    }
    if (playerAccounts.some(a => a.id !== account.id && a.name.normalize('NFKC').trim() === nextName.normalize('NFKC').trim())) {
      sendJson(res, 409, { ok:false, error:'name_duplicate', message:'다른 계정이 이미 사용하는 이름입니다.' });
      return;
    }
    const updatedAccount = { ...account, name: nextName, pin: nextPin, updatedAt: new Date().toISOString() };
    try {
      await durableStore.saveAccount(updatedAccount);
    } catch (dbErr) {
      console.error('[accounts] durable save failed:', dbErr?.message || dbErr);
      const duplicate = String(dbErr?.code || '') === '23505';
      sendJson(res, duplicate ? 409 : 503, { ok:false, error: duplicate ? 'account_conflict' : 'database_unavailable', message: duplicate ? '다른 계정과 이름 또는 PIN이 중복됩니다.' : '영구 저장소에 계정을 저장하지 못했습니다. 잠시 뒤 다시 시도하세요.' });
      return;
    }
    Object.assign(account, updatedAccount);
    // An active player's display name follows an administrator correction immediately,
    // while immutable accountId continues to identify the same statistics record.
    for (const room of rooms.values()) {
      for (const player of room.players.values()) if (player.accountId === account.id) player.name = account.name;
      broadcast(room);
    }
    sendJson(res, 200, { ok:true, account:{ ...account }, message:`${account.name} 계정을 영구 저장했습니다.` });
  });
}

function sendJsonDownload(res, filename, value) {
  const data = Buffer.from(JSON.stringify(value, null, 2), 'utf8');
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="${String(filename).replace(/[^A-Za-z0-9_.-]/g, '_')}"`,
    'Cache-Control': 'no-store',
    'Content-Length': data.length
  });
  res.end(data);
}

function handleAdminCompetitiveStatsHttp(req, res, exportMode = false) {
  const remoteAddress = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (adminStatsAuthLocked(remoteAddress, now)) {
    sendJson(res, 429, { ok:false, error:'locked_out', message:'관리자 암호 입력이 잠시 잠겼습니다. 30초 뒤 다시 시도하세요.' });
    return;
  }
  readJsonBody(req, async (err, body) => {
    if (err) { sendJson(res, 400, { ok:false, error:'bad_request', message:'요청을 처리할 수 없습니다.' }); return; }
    const pin = safePin(body && body.pin);
    if (pin.length !== 4 || hashText(pin) !== ADMIN_STATS_PIN_HASH) {
      noteAdminStatsAuthFailure(remoteAddress, Date.now());
      sendJson(res, 403, { ok:false, error:'bad_pin', message:'관리자 암호가 올바르지 않습니다.' });
      return;
    }
    clearAdminStatsAuthFailure(remoteAddress);
    try {
      // Read directly from PostgreSQL before every admin view/export. This deliberately avoids
      // trusting Render's process memory as the source of truth after a restart/redeploy.
      await refreshCompetitiveStatsFromDatabase();
      if (exportMode) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        sendJsonDownload(res, `competitive_stats_backup_${stamp}.json`, competitiveStatsBackupPayload());
        return;
      }
      sendJson(res, 200, { ok:true, data: publicAdminStatsPayload(body && body.statsVersion) });
    } catch (dbErr) {
      console.error('[admin-stats] database read failed:', dbErr?.message || dbErr);
      sendJson(res, 503, { ok:false, error:'database_unavailable', message:'영구 통계 저장소를 읽을 수 없습니다. 잠시 뒤 다시 시도하세요.', persistence: durableStore.status() });
    }
  });
}

function mimeType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' })[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/access-status.json' && req.method === 'GET') {
    sendJson(res, 200, schoolLineAccessPayload());
    return;
  }
  if (urlPath === '/rooms.json' && req.method === 'GET') {
    sendJson(res, 200, { rooms: publicRoomList(), maxRooms: MAX_ROOMS, updatedAt: new Date().toISOString() });
    return;
  }
  if (urlPath === '/player-accounts.json' && req.method === 'GET') {
    sendJson(res, 200, { accounts: publicPlayerAccounts(), updatedAt: new Date().toISOString() });
    return;
  }
  if (urlPath === '/admin/competitive-stats' && req.method === 'POST') {
    handleAdminCompetitiveStatsHttp(req, res, false);
    return;
  }
  if (urlPath === '/admin/competitive-stats/export' && req.method === 'POST') {
    handleAdminCompetitiveStatsHttp(req, res, true);
    return;
  }
  if (urlPath === '/admin/player-accounts' && req.method === 'POST') {
    handlePlayerAccountsAdmin(req, res);
    return;
  }
  if (urlPath === '/admin/access-control' && req.method === 'POST') {
    handleAccessControlRequest(req, res);
    return;
  }
  if (urlPath === '/competitive-stats.json') {
    const data = Buffer.from(JSON.stringify({ error: 'admin_only' }), 'utf8');
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': data.length });
    res.end(data);
    return;
  }
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(file, (statErr, st) => {
    if (statErr || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { 'ETag': etag, 'Cache-Control': 'public, max-age=0, must-revalidate' });
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(file).toLowerCase();
      const compressible = ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json' || ext === '.svg';
      const acceptsGzip = /(?:^|,)\s*gzip(?:\s*[,;]|$)/i.test(String(req.headers['accept-encoding'] || ''));
      const headers = {
        'Content-Type': mimeType(file),
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'ETag': etag,
        'Vary': 'Accept-Encoding'
      };
      if (compressible && acceptsGzip && data.length >= 1024) {
        zlib.gzip(data, { level: zlib.constants.Z_BEST_SPEED }, (zipErr, zipped) => {
          if (zipErr) { res.writeHead(500); res.end('Compression error'); return; }
          headers['Content-Encoding'] = 'gzip';
          headers['Content-Length'] = zipped.length;
          res.writeHead(200, headers);
          res.end(zipped);
        });
        return;
      }
      headers['Content-Length'] = data.length;
      res.writeHead(200, headers);
      res.end(data);
    });
  });
});

function sendFrame(socket, opcode, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (body.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = body.length;
  } else if (body.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  const frame = Buffer.concat([header, body]);
  socket.write(frame);
  return frame.length;
}

function makeWsConnection(socket, remoteAddress = '') {
  const conn = {
    socket,
    buffer: Buffer.alloc(0),
    closed: false,
    playerId: null,
    spectatorId: null,
    roomCode: null,
    remoteAddress,
    lastPongAt: Date.now(),
    lastPingAt: 0,
    outboundBytes: 0,
    outboundFrames: 0,
    send(obj, kind = null) {
      if (this.closed || socket.destroyed) return false;
      try {
        const messageKind = kind || String(obj?.type || 'message');
        const bytes = sendFrame(socket, 0x1, JSON.stringify(obj));
        recordWsOutbound(this, bytes, messageKind);
        return true;
      } catch (_) { return false; }
    },
    sendSerialized(text, kind = 'message') {
      if (this.closed || socket.destroyed) return false;
      if (kind === 'live_state' && Number(socket.writableLength || 0) > MAX_WS_PENDING_BYTES) {
        noteBackpressureDrop(this);
        return false;
      }
      try {
        const bytes = sendFrame(socket, 0x1, text);
        recordWsOutbound(this, bytes, kind);
        return true;
      } catch (_) { return false; }
    },
    close() {
      if (this.closed) return;
      this.closed = true;
      try { const bytes = sendFrame(socket, 0x8, Buffer.alloc(0)); recordWsOutbound(this, bytes, 'close'); } catch (_) {}
      try { socket.end(); } catch (_) {}
    }
  };
  return conn;
}

server.on('upgrade', (req, socket) => {
  if ((req.url || '').split('?')[0] !== '/ws') { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n'
  ].join('\r\n'));

  const conn = makeWsConnection(socket, req.socket.remoteAddress || 'unknown');
  activeConnections.add(conn);
  socket.on('data', chunk => parseWsData(conn, chunk));
  socket.on('close', () => { activeConnections.delete(conn); disconnect(conn); });
  socket.on('error', () => { activeConnections.delete(conn); disconnect(conn); });
});

function parseWsData(conn, chunk) {
  conn.buffer = Buffer.concat([conn.buffer, chunk]);
  while (conn.buffer.length >= 2) {
    const b0 = conn.buffer[0], b1 = conn.buffer[1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (conn.buffer.length < 4) return;
      len = conn.buffer.readUInt16BE(2); offset = 4;
    } else if (len === 127) {
      if (conn.buffer.length < 10) return;
      const n = conn.buffer.readBigUInt64BE(2);
      if (n > BigInt(Number.MAX_SAFE_INTEGER)) { conn.close(); return; }
      len = Number(n); offset = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (conn.buffer.length < offset + maskLen + len) return;
    let payload = conn.buffer.subarray(offset + maskLen, offset + maskLen + len);
    if (masked) {
      const mask = conn.buffer.subarray(offset, offset + 4);
      const unmasked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) unmasked[i] = payload[i] ^ mask[i % 4];
      payload = unmasked;
    }
    conn.buffer = conn.buffer.subarray(offset + maskLen + len);

    if (opcode === 0x8) { conn.close(); return; }
    if (opcode === 0x9) {
      try { const bytes = sendFrame(conn.socket, 0xA, payload); recordWsOutbound(conn, bytes, 'pong'); } catch (_) {}
      continue;
    }
    if (opcode === 0xA) { conn.lastPongAt = Date.now(); continue; }
    if (opcode !== 0x1) continue;
    try { onMessage(conn, JSON.parse(payload.toString('utf8'))); } catch (_) {}
  }
}

function normalizeRoomMode(value) { return value === 'competitive' ? 'competitive' : 'casual'; }
function nextRoomDisplayNumber() {
  const used = new Set([...rooms.values()].map(room => Math.max(0, Number(room.displayNumber) || 0)).filter(Boolean));
  for (let n = 1; n <= MAX_ROOMS; n++) if (!used.has(n)) return n;
  return null;
}
function newInternalRoomCode() {
  let code;
  do code = `R${crypto.randomBytes(4).toString('hex').toUpperCase()}`; while (rooms.has(code));
  return code;
}
function roomDisplayName(room) {
  const n = Math.max(0, Number(room?.displayNumber) || 0);
  return n ? `방 ${n}` : '방';
}
function publicRoomList() {
  const entries = [...rooms.values()].map(room => {
    const connectedPlayers = [...room.players.values()].filter(p => p.connected !== false);
    const countA = connectedPlayers.filter(p => p.team === 'A').length;
    const countB = connectedPlayers.filter(p => p.team === 'B').length;
    const count = connectedPlayers.length;
    const hasTeamSlot = countA < 4 || countB < 4;
    const joinable = room.state === 'lobby' && count < 8 && hasTeamSlot;
    return {
      id: room.code, number: Math.max(0, Number(room.displayNumber) || 0), name: roomDisplayName(room),
      mode: normalizeRoomMode(room.mode), state: room.state, count, countA, countB, capacity: 8,
      joinable, oneMore: normalizeRoomMode(room.mode) === 'competitive' && count === 7 && joinable,
      closeTimeLeft: room.state === 'ended' && room.postGameDeleteAt
        ? Math.max(0, (room.postGameDeleteAt - Date.now()) / 1000)
        : 0
    };
  });
  const stateRank = entry => entry.joinable ? 0 : 1;
  const modeRank = entry => entry.mode === 'competitive' ? 0 : 1;
  entries.sort((a, b) => stateRank(a) - stateRank(b) || (a.joinable && b.joinable ? modeRank(a) - modeRank(b) : 0) || a.number - b.number);
  return entries;
}

function newRoom(code, options = {}) {
  const requestedDisplayNumber = Number(options.displayNumber) || nextRoomDisplayNumber();
  if (!Number.isInteger(requestedDisplayNumber) || requestedDisplayNumber < 1 || requestedDisplayNumber > MAX_ROOMS) {
    throw new Error('room_limit_reached');
  }
  return {
    code,
    displayNumber: requestedDisplayNumber,
    state: 'lobby',
    mode: normalizeRoomMode(options.mode),
    matchMode: null,
    competitive: null,
    players: new Map(),
    clients: new Map(),
    spectators: new Map(),
    projectiles: new Map(),
    beams: [],
    hostId: null,
    scoreA: 0,
    scoreB: 0,
    matchEndAt: 0,
    matchStartedAt: 0,
    endedAt: 0,
    postGameDeleteAt: 0,
    winner: null,
    winnerReason: null,
    projectileCounter: 1,
    sprayVolleyCounter: 1,
    projectileNetPendingSpawns: new Set(),
    projectileNetPendingRemoves: new Set(),
    lastProjectileNetSyncAt: 0,
    lastBroadcastAt: 0,
    network: null
  };
}

function countTeam(room, team) {
  let n = 0;
  for (const p of room.players.values()) if (p.team === team) n++;
  return n;
}

function teamKillTotals(room) {
  const totals = { A: 0, B: 0 };
  for (const p of room.players.values()) {
    if (p.team !== 'A' && p.team !== 'B') continue;
    totals[p.team] += Math.max(0, Number(ensureMatchStats(p).kills) || 0);
  }
  return totals;
}

function resolveMatchWinner(room) {
  if (room.scoreA > room.scoreB) return { winner: 'A', reason: 'score', kills: teamKillTotals(room) };
  if (room.scoreB > room.scoreA) return { winner: 'B', reason: 'score', kills: teamKillTotals(room) };
  const kills = teamKillTotals(room);
  if (kills.A > kills.B) return { winner: 'A', reason: 'kills', kills };
  if (kills.B > kills.A) return { winner: 'B', reason: 'kills', kills };
  return { winner: 'DRAW', reason: 'draw', kills };
}


function isCharacterTakenOnTeam(room, team, character, excludePlayerId = null) {
  for (const p of room.players.values()) {
    if (p.id !== excludePlayerId && p.team === team && p.character === character) return true;
  }
  return false;
}

function firstAvailableCharacter(room, team, preferredRole = null) {
  const entries = Object.entries(CHARACTERS);
  if (preferredRole) {
    const sameRole = entries.find(([id, c]) => c.role === preferredRole && !isCharacterTakenOnTeam(room, team, id));
    if (sameRole) return sameRole[0];
  }
  const any = entries.find(([id]) => !isCharacterTakenOnTeam(room, team, id));
  return any ? any[0] : 'shooter';
}


function randomChoice(items) { return items && items.length ? items[Math.floor(Math.random() * items.length)] : null; }
function shuffled(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function cancelPostGameRoomClose(room) {
  if (!room) return;
  room.postGameDeleteAt = 0;
  room.endedAt = 0;
}

function reopenEndedRoomForRematch(room, requester, now = Date.now()) {
  if (!room || room.state !== 'ended' || !requester || room.hostId !== requester.id) return false;
  // Remove seats that disconnected after the previous result before reopening the room.
  pruneDisconnectedEndedPlayers(room);
  cancelPostGameRoomClose(room);
  room.state = 'lobby';
  room.matchMode = null;
  room.competitive = null;
  room.matchStartedAt = 0;
  room.matchEndAt = 0;
  room.nextUltimateAutoChargeAt = 0;
  room.scoreA = 0;
  room.scoreB = 0;
  room.winner = null;
  room.winnerReason = null;
  clearProjectiles(room);
  room.beams = [];
  for (const p of room.players.values()) neutralizePlayerInput(p);
  return true;
}

function pruneDisconnectedEndedPlayers(room) {
  if (!room || room.state !== 'ended') return;
  for (const [pid, p] of [...room.players.entries()]) {
    if (p.connected === false) { room.players.delete(pid); room.clients.delete(pid); }
  }
  if (room.hostId && !room.players.has(room.hostId)) room.hostId = [...room.players.values()].find(p => p.connected !== false)?.id || null;
}
function isExactCompetitiveRoster(room) {
  return !!room && room.players.size === 8 && countTeam(room, 'A') === 4 && countTeam(room, 'B') === 4 && [...room.players.values()].every(p => p.connected !== false);
}
function competitiveTakenSet(room) {
  const set = new Set();
  const comp = room && room.competitive;
  if (!comp) return set;
  for (const b of comp.bans || []) if (b && b.character) set.add(b.character);
  for (const p of comp.picks || []) if (p && p.character) set.add(p.character);
  return set;
}
function competitiveAvailableCharacters(room, preferredRole = null) {
  const taken = competitiveTakenSet(room);
  return Object.entries(CHARACTERS)
    .filter(([id, def]) => !taken.has(id) && (!preferredRole || def.role === preferredRole))
    .map(([id]) => id);
}
function currentCompetitivePickerId(room) {
  const comp = room && room.competitive;
  if (!comp || comp.phase !== 'pick') return null;
  return comp.pickSequence[comp.pickIndex] || null;
}
function startCompetitiveDraft(room, now = Date.now()) {
  if (!isExactCompetitiveRoster(room)) return false;
  if (normalizeRoomMode(room.mode) !== 'competitive') return false;
  cancelPostGameRoomClose(room);
  room.state = 'draft';
  room.winner = null;
  room.winnerReason = null;
  room.endedAt = 0;
  room.scoreA = 0;
  room.scoreB = 0;
  clearProjectiles(room);
  room.beams = [];
  const firstTeam = Math.random() < 0.5 ? 'A' : 'B';
  const secondTeam = firstTeam === 'A' ? 'B' : 'A';
  const teamOrders = {
    A: shuffled([...room.players.values()].filter(p => p.team === 'A').map(p => p.id)),
    B: shuffled([...room.players.values()].filter(p => p.team === 'B').map(p => p.id))
  };
  const f = teamOrders[firstTeam], s = teamOrders[secondTeam];
  const pickSequence = [f[0], s[0], s[1], f[1], f[2], s[2], s[3], f[3]];
  for (const p of room.players.values()) {
    p.character = null;
    p.maxHp = 0; p.hp = 0;
    neutralizePlayerInput(p);
  }
  room.competitive = {
    phase: 'ban', firstTeam, secondTeam,
    activeBanTeam: firstTeam, banStep: 0,
    phaseEndAt: now + COMPETITIVE_BAN_MS,
    banVotes: { A: Object.create(null), B: Object.create(null) },
    bans: [], teamOrders, pickSequence, pickIndex: 0, picks: [],
    draftEvents: [], readySwaps: [], matchEvents: [],
    readyEndAt: 0, draftStartedAt: now, matchStartedAt: 0,
    finalAssignments: [],
    matchId: crypto.randomUUID(),
    recorded: false, recording: false, persistenceError: null, pendingResult: null
  };
  for (const p of room.players.values()) p.competitiveDisconnects = 0;
  return true;
}
function resolveCompetitiveBan(room, now = Date.now()) {
  const comp = room && room.competitive;
  if (!comp || comp.phase !== 'ban') return false;
  const team = comp.activeBanTeam;
  const available = competitiveAvailableCharacters(room);
  if (!available.length) return false;
  const counts = new Map();
  const votes = comp.banVotes[team] || {};
  for (const charId of Object.values(votes)) {
    if (!available.includes(charId)) continue;
    counts.set(charId, (counts.get(charId) || 0) + 1);
  }
  let candidates = [];
  if (counts.size) {
    const max = Math.max(...counts.values());
    candidates = [...counts.entries()].filter(([, n]) => n === max).map(([id]) => id);
  } else candidates = available;
  const character = randomChoice(candidates) || available[0];
  const voteCounts = Object.fromEntries([...counts.entries()]);
  const voteSnapshot = Object.entries(votes).map(([playerId, votedCharacter]) => {
    const voter = room.players.get(playerId);
    return { playerId, playerName: voter ? voter.name : null, character: votedCharacter };
  });
  const resolution = counts.size === 0 ? 'random_no_vote' : (candidates.length > 1 ? 'random_tie' : 'vote_winner');
  const banRecord = { order: comp.bans.length + 1, team, character, resolution, voteCounts, votes: voteSnapshot, resolvedAt: new Date(now).toISOString() };
  comp.bans.push(banRecord);
  comp.draftEvents.push({ type:'ban_resolved', atSec: Math.max(0, (now - comp.draftStartedAt) / 1000), ...banRecord });
  if (comp.banStep === 0) {
    comp.banStep = 1;
    comp.activeBanTeam = comp.secondTeam;
    comp.phaseEndAt = now + COMPETITIVE_BAN_MS;
  } else {
    comp.phase = 'pick';
    comp.activeBanTeam = null;
    comp.pickIndex = 0;
    comp.phaseEndAt = now + COMPETITIVE_PICK_MS;
  }
  return true;
}
function enterCompetitiveReady(room, now = Date.now()) {
  const comp = room && room.competitive;
  if (!comp) return false;
  room.state = 'ready';
  comp.phase = 'ready';
  comp.readyEndAt = now + COMPETITIVE_READY_MS;
  comp.phaseEndAt = comp.readyEndAt;
  return true;
}
function commitCompetitivePick(room, playerId, character, auto = false, now = Date.now()) {
  const comp = room && room.competitive;
  if (!comp || comp.phase !== 'pick') return false;
  if (currentCompetitivePickerId(room) !== playerId) return false;
  const available = competitiveAvailableCharacters(room);
  if (!available.includes(character)) return false;
  const player = room.players.get(playerId);
  if (!player) return false;
  player.character = character;
  const def = CHARACTERS[character];
  player.maxHp = def.hp; player.hp = def.hp;
  const pickRecord = { order: comp.picks.length + 1, playerId, team: player.team, character, auto: !!auto, pickedAt: new Date(now).toISOString() };
  comp.picks.push(pickRecord);
  comp.draftEvents.push({ type:'pick', atSec: Math.max(0, (now - comp.draftStartedAt) / 1000), ...pickRecord, playerName: player.name });
  comp.pickIndex += 1;
  if (comp.pickIndex >= comp.pickSequence.length) enterCompetitiveReady(room, now);
  else comp.phaseEndAt = now + COMPETITIVE_PICK_MS;
  return true;
}
function autoCompetitivePick(room, now = Date.now()) {
  const playerId = currentCompetitivePickerId(room);
  if (!playerId) return false;
  const dealerChoices = competitiveAvailableCharacters(room, '딜러');
  const choices = dealerChoices.length ? dealerChoices : competitiveAvailableCharacters(room);
  const character = randomChoice(choices);
  return character ? commitCompetitivePick(room, playerId, character, true, now) : false;
}
function swapCompetitiveReadyAssignments(room, requester, sourcePlayerId, targetPlayerId) {
  const comp = room && room.competitive;
  if (!comp || room.state !== 'ready' || comp.phase !== 'ready' || !requester) return false;
  const source = room.players.get(String(sourcePlayerId || ''));
  const target = room.players.get(String(targetPlayerId || ''));
  if (!source || !target || source.team !== requester.team || target.team !== requester.team || source.team !== target.team) return false;
  if (!source.character || !target.character) return false;
  const sourceBefore = source.character, targetBefore = target.character;
  [source.character, target.character] = [target.character, source.character];
  comp.readySwaps.push({ at: new Date().toISOString(), requesterId: requester.id, requesterName: requester.name, team: requester.team, sourcePlayerId: source.id, sourcePlayerName: source.name, targetPlayerId: target.id, targetPlayerName: target.name, sourceBefore, targetBefore, sourceAfter: source.character, targetAfter: target.character });
  comp.draftEvents.push({ type:'ready_swap', atSec: Math.max(0, (Date.now() - comp.draftStartedAt) / 1000), team: requester.team, sourcePlayerId: source.id, targetPlayerId: target.id, sourceBefore, targetBefore, sourceAfter: source.character, targetAfter: target.character });
  return true;
}
function finalizeCompetitiveReady(room, now = Date.now()) {
  const comp = room && room.competitive;
  if (!comp || room.state !== 'ready') return false;
  comp.finalAssignments = [...room.players.values()].map(p => ({ playerId: p.id, playerName: p.name, team: p.team, character: p.character }));
  comp.matchStartedAt = now;
  startMatch(room, now);
  return true;
}
function updateCompetitiveFlow(room, now = Date.now()) {
  const comp = room && room.competitive;
  if (!comp) return false;
  if (room.state === 'draft' && now >= comp.phaseEndAt) {
    if (comp.phase === 'ban') return !!resolveCompetitiveBan(room, now);
    if (comp.phase === 'pick') return !!autoCompetitivePick(room, now);
  } else if (room.state === 'ready' && now >= comp.readyEndAt) {
    // startMatch() already performs the immediate playing-state broadcast.
    finalizeCompetitiveReady(room, now);
    return false;
  }
  return false;
}
function competitiveTeamStats(players, team) {
  const rows = players.filter(p => p.team === team);
  const sum = key => rows.reduce((acc, p) => acc + Math.max(0, Number(p.stats?.[key]) || 0), 0);
  return {
    kills: sum('kills'), deaths: sum('deaths'), assists: sum('assists'), damage: sum('damage'), damageTaken: sum('damageTaken'), healing: sum('healing'),
    ultimateUses: sum('ultimateUses'), objectiveSeconds: sum('objectiveSeconds'), contestSeconds: sum('contestSeconds')
  };
}

function validateCompetitiveMatchRecord(result) {
  const errors = [], warnings = [];
  const assignments = Array.isArray(result.finalAssignments) ? result.finalAssignments : [];
  const bans = Array.isArray(result.bans) ? result.bans : [];
  if (assignments.length !== 8) errors.push(`assignment_count_${assignments.length}`);
  const teamA = assignments.filter(p => p.team === 'A').length, teamB = assignments.filter(p => p.team === 'B').length;
  if (teamA !== 4 || teamB !== 4) errors.push(`team_size_A${teamA}_B${teamB}`);
  const picked = assignments.map(p => p.character).filter(Boolean);
  if (new Set(picked).size !== picked.length) errors.push('duplicate_character_pick');
  if (bans.length !== 2) errors.push(`ban_count_${bans.length}`);
  const banned = new Set(bans.map(b => b.character).filter(Boolean));
  if (picked.some(id => banned.has(id))) errors.push('banned_character_picked');
  if (!['A','B','DRAW'].includes(result.winner)) errors.push('invalid_winner');
  if (!Number.isFinite(Number(result.score?.A)) || !Number.isFinite(Number(result.score?.B))) errors.push('invalid_score');
  const disconnects = (Array.isArray(result.players) ? result.players : []).reduce((n,p) => n + Math.max(0, Number(p.disconnectCount)||0), 0);
  if (disconnects > 0) warnings.push(`disconnects_${disconnects}`);
  for (const p of Array.isArray(result.players) ? result.players : []) {
    for (const [key, value] of Object.entries(p.stats || {})) {
      if (typeof value === 'number' && (!Number.isFinite(value) || value < -1e-9)) errors.push(`invalid_stat_${p.playerId}_${key}`);
    }
  }
  return { complete: errors.length === 0, errors, warnings, disconnects };
}

function buildCompetitiveResult(room, now = Date.now()) {
  const comp = room && room.competitive;
  if (!comp || room.matchMode !== 'competitive') return null;
  const players = [...room.players.values()].map(p => ({
    playerId: p.id, accountId: p.accountId || null, playerKey: accountStatKey(p.accountId, p.name), playerName: p.name, nickname: p.name, team: p.team, character: p.character,
    connectedAtEnd: p.connected !== false, disconnectCount: Math.max(0, Number(p.competitiveDisconnects) || 0),
    stats: { ...ensureMatchStats(p), shotsFired: Math.max(0, Number(p.shotSeq)||0), projectileHits: Math.max(0, Number(p.projectileHitSeq)||0), healFeedbackHits: Math.max(0, Number(p.healHitSeq)||0), abilityUses: Math.max(0, Number(p.abilityUseSeq)||0) }
  }));
  const result = {
    recordSchemaVersion: 3,
    matchId: String(comp.matchId || crypto.randomUUID()),
    statsVersion: COMPETITIVE_STATS_VERSION,
    balanceVersion: BALANCE_VERSION,
    gameVersion: GAME_VERSION, buildId: COMPETITIVE_BUILD_ID, rosterVersion: COMPETITIVE_ROSTER_VERSION,
    availableCharacters: Object.keys(CHARACTERS),
    rosterSnapshot: Object.fromEntries(Object.entries(CHARACTERS).map(([id, def]) => [id, { name: def.name, role: def.role }])),
    room: roomDisplayName(room), roomId: room.code, matchMode: room.matchMode,
    draftStartedAt: comp.draftStartedAt ? new Date(comp.draftStartedAt).toISOString() : null,
    matchStartedAt: comp.matchStartedAt ? new Date(comp.matchStartedAt).toISOString() : (room.matchStartedAt ? new Date(room.matchStartedAt).toISOString() : null),
    endedAt: new Date(now).toISOString(),
    durationSec: Math.max(0, (now - (comp.matchStartedAt || room.matchStartedAt || now)) / 1000),
    firstPickTeam: comp.firstTeam,
    bans: (comp.bans || []).map(b => ({ ...b })),
    picks: (comp.picks || []).map(pick => {
      const player = room.players.get(pick.playerId);
      return { ...pick, accountId: player ? (player.accountId || null) : null, playerName: player ? player.name : null, playerKey: player ? accountStatKey(player.accountId, player.name) : null };
    }),
    draft: {
      firstTeam: comp.firstTeam, secondTeam: comp.secondTeam,
      events: (comp.draftEvents || []).map(e => ({ ...e })),
      readySwaps: (comp.readySwaps || []).map(e => ({ ...e }))
    },
    events: (comp.matchEvents || []).map(e => ({ ...e })),
    finalAssignments: players.map(p => ({ playerId: p.playerId, accountId: p.accountId || null, playerName: p.playerName, team: p.team, character: p.character })),
    score: { A: Number(room.scoreA.toFixed(3)), B: Number(room.scoreB.toFixed(3)) },
    teamKills: teamKillTotals(room),
    winner: room.winner,
    winnerReason: room.winnerReason || (room.winner === 'DRAW' ? 'draw' : 'score'),
    players,
    teamStats: { A: competitiveTeamStats(players, 'A'), B: competitiveTeamStats(players, 'B') }
  };
  result.dataQuality = validateCompetitiveMatchRecord(result);
  return result;
}

async function persistPendingCompetitiveRecord(matchId) {
  const key = String(matchId || '');
  const pending = pendingCompetitiveRecords.get(key);
  if (!pending || pending.inFlight) return false;
  pending.inFlight = true;
  pending.attempts = (pending.attempts || 0) + 1;
  pending.lastAttemptAt = Date.now();
  try {
    await durableStore.insertMatch(pending.result);
    applyPersistedMatchToMemory(pending.result);
    pendingCompetitiveRecords.delete(key);
    const room = pending.roomCode ? rooms.get(pending.roomCode) : null;
    if (room?.competitive && String(room.competitive.matchId || '') === key) {
      room.competitive.recorded = true;
      room.competitive.recording = false;
      room.competitive.persistenceError = null;
      room.competitive.pendingResult = null;
      if (room.state === 'ended') room.postGameDeleteAt = Math.max(Number(room.postGameDeleteAt) || 0, Date.now() + 3000);
    }
    console.log(`[competitive] durable save OK ${key} (${pending.attempts} attempt${pending.attempts === 1 ? '' : 's'})`);
    return true;
  } catch (err) {
    const message = String(err?.message || err || 'database_error');
    pending.inFlight = false;
    pending.lastError = message;
    pending.nextAttemptAt = Date.now() + COMPETITIVE_PERSIST_RETRY_MS;
    const room = pending.roomCode ? rooms.get(pending.roomCode) : null;
    if (room?.competitive && String(room.competitive.matchId || '') === key) {
      room.competitive.recording = false;
      room.competitive.persistenceError = message;
    }
    console.error(`[competitive] durable save FAILED ${key}; retry scheduled:`, message);
    return false;
  }
}

function recordCompetitiveResult(room, now = Date.now()) {
  const comp = room && room.competitive;
  if (!comp || room.matchMode !== 'competitive' || comp.recorded) return false;
  if (!comp.pendingResult) comp.pendingResult = buildCompetitiveResult(room, now);
  const result = comp.pendingResult;
  if (!result) return false;
  const key = String(result.matchId || '');
  if (!pendingCompetitiveRecords.has(key)) {
    pendingCompetitiveRecords.set(key, { result, roomCode: room.code, attempts: 0, inFlight: false, nextAttemptAt: 0, lastError: null });
  }
  comp.recording = true;
  comp.persistenceError = null;
  void persistPendingCompetitiveRecord(key);
  return true;
}

function retryPendingCompetitiveRecords(now = Date.now()) {
  for (const [matchId, pending] of pendingCompetitiveRecords) {
    if (pending.inFlight) continue;
    if (Number(pending.nextAttemptAt || 0) > now) continue;
    void persistPendingCompetitiveRecord(matchId);
  }
}

function competitiveSnapshot(room, viewer, spectator, now) {
  const comp = room && room.competitive;
  if (!comp) return null;
  const voteCounts = {};
  let myBanVote = null;
  if (!spectator && viewer && comp.phase === 'ban' && viewer.team === comp.activeBanTeam) {
    for (const charId of Object.values(comp.banVotes[viewer.team] || {})) voteCounts[charId] = (voteCounts[charId] || 0) + 1;
    myBanVote = comp.banVotes[viewer.team]?.[viewer.id] || null;
  }
  return {
    phase: comp.phase,
    firstTeam: comp.firstTeam, secondTeam: comp.secondTeam,
    activeBanTeam: comp.activeBanTeam,
    phaseTimeLeft: Math.max(0, ((comp.phase === 'ready' ? comp.readyEndAt : comp.phaseEndAt) - now) / 1000),
    bans: (comp.bans || []).map(b => ({ ...b })),
    teamOrders: { A: [...(comp.teamOrders.A || [])], B: [...(comp.teamOrders.B || [])] },
    pickSequence: [...(comp.pickSequence || [])], pickIndex: comp.pickIndex || 0,
    currentPickerId: currentCompetitivePickerId(room),
    picks: (comp.picks || []).map(p => ({ ...p })),
    banVoteCounts: voteCounts, myBanVote,
    readyTimeLeft: room.state === 'ready' ? Math.max(0, (comp.readyEndAt - now) / 1000) : 0
  };
}

function sendCompetitiveBanVoteUpdate(room, team) {
  const comp = room && room.competitive;
  if (!comp || room.state !== 'draft' || comp.phase !== 'ban' || comp.activeBanTeam !== team) return;
  const counts = {};
  const votes = comp.banVotes[team] || {};
  for (const charId of Object.values(votes)) counts[charId] = (counts[charId] || 0) + 1;
  for (const [playerId, conn] of room.clients.entries()) {
    const player = room.players.get(playerId);
    if (!player || player.team !== team) continue;
    conn.send({
      type: 'ban_vote_update',
      activeBanTeam: team,
      banVoteCounts: counts,
      myBanVote: votes[playerId] || null
    });
  }
}

function spawnPoint(room, player) {
  const teammates = [...room.players.values()].filter(p => p.team === player.team).sort((a, b) => a.id.localeCompare(b.id));
  const idx = Math.max(0, teammates.findIndex(p => p.id === player.id));
  const xs = [14, 19, 23, 28];
  if (player.team === 'A') return { x: xs[idx % 4], y: 5 + Math.floor(idx / 4) * 2 };
  return { x: xs[idx % 4], y: 63 - Math.floor(idx / 4) * 2 };
}

function onMessage(conn, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (!schoolLineAccessOpen) {
    conn.send({ type: 'access_locked', message: '관리자가 입장을 제한했습니다.' });
    return;
  }
  if (msg.type === 'admin_stats_request') return sendAdminCompetitiveStats(conn, msg);
  if (msg.type === 'admin_stats_export_request') return sendAdminCompetitiveStatsBackup(conn);
  if (msg.type === 'spectator_join') return joinSpectator(conn, msg);
  if (msg.type === 'resume') return resumeRoom(conn, msg);
  if (msg.type === 'create_room') return createRoomAndJoin(conn, msg);
  if (msg.type === 'join_room') return joinRoom(conn, { ...msg, room: msg.roomId }, { allowCreate: false });
  if (msg.type === 'leave_room') return leaveRoomExplicit(conn);
  // Backward-compatible protocol path for older cached clients. New 1.6.2 UI never exposes room codes.
  if (msg.type === 'join') return joinRoom(conn, msg, { allowCreate: true });
  const room = rooms.get(conn.roomCode);
  if (!room || !conn.playerId) return;
  const player = room.players.get(conn.playerId);
  if (!player) return;

  if (msg.type === 'rematch_prepare') {
    if (room.hostId !== player.id) { conn.send({ type: 'rematch_error', message: '방장만 다시 게임 준비를 시작할 수 있습니다.' }); return; }
    if (room.state !== 'ended') { conn.send({ type: 'rematch_error', message: '경기가 종료된 뒤에만 다시 게임 준비를 할 수 있습니다.' }); return; }
    if (!reopenEndedRoomForRematch(room, player, Date.now())) { conn.send({ type: 'rematch_error', message: '다시 게임 준비를 시작하지 못했습니다.' }); return; }
    broadcast(room);
    return;
  }

  if (msg.type === 'set_team') {
    if (room.state !== 'lobby') { conn.send({ type: 'team_change_error', message: '경기 준비 또는 시작 후에는 팀을 변경할 수 없습니다.' }); return; }
    const nextTeam = msg.team === 'A' || msg.team === 'B' ? msg.team : null;
    if (!nextTeam) { conn.send({ type: 'team_change_error', message: 'A팀 또는 B팀을 선택하세요.' }); return; }
    if (nextTeam === player.team) { conn.send({ type: 'team_changed', team: player.team, characterReset: false, message: `이미 ${player.team}팀입니다.` }); return; }
    if (countTeam(room, nextTeam) >= 4) { conn.send({ type: 'team_change_error', message: `${nextTeam}팀은 이미 4명입니다.` }); return; }

    let characterReset = false;
    const previousCharacter = player.character;
    if (previousCharacter && isCharacterTakenOnTeam(room, nextTeam, previousCharacter, player.id)) {
      player.character = null;
      player.hp = 0;
      player.maxHp = 0;
      characterReset = true;
    }
    player.team = nextTeam;
    const sp = spawnPoint(room, player);
    player.x = sp.x; player.y = sp.y;
    player.aimX = sp.x; player.aimY = nextTeam === 'A' ? Math.min(WORLD.height, sp.y + 15) : Math.max(0, sp.y - 15);
    neutralizePlayerInput(player);
    conn.send({
      type: 'team_changed', team: nextTeam, characterReset,
      message: characterReset
        ? `${nextTeam}팀으로 이동했습니다. 같은 팀에 이미 같은 캐릭터가 있어 캐릭터 선택이 초기화되었습니다.`
        : `${nextTeam}팀으로 이동했습니다.`
    });
    broadcast(room);
    return;
  }

  if (msg.type === 'set_room_mode') {
    if (room.hostId !== player.id) { conn.send({ type: 'room_mode_error', message: '방장만 게임 모드를 변경할 수 있습니다.' }); return; }
    if (room.state !== 'lobby') { conn.send({ type: 'room_mode_error', message: '경기 시작 후에는 게임 모드를 변경할 수 없습니다.' }); return; }
    const nextMode = normalizeRoomMode(msg.mode);
    room.mode = nextMode;
    room.competitive = null;
    broadcast(room);
    return;
  }
  if (msg.type === 'select' && room.state === 'lobby') {
    const requested = validCharacter(msg.character);
    if (requested !== player.character && isCharacterTakenOnTeam(room, player.team, requested, player.id)) {
      conn.send({ type: 'pick_error', character: requested, message: '같은 팀에서 이미 사용 중인 캐릭터입니다.' });
      broadcast(room);
      return;
    }
    player.character = requested;
    player.respawnShieldAt = 0;
    const def = CHARACTERS[player.character];
    player.maxHp = def.hp; player.hp = Math.min(player.hp, def.hp);
    clearAllStatuses(player); clearShield(player); player.diaFormUntil = 0; player.diaCooldownUntil = 0; player.sprintUntil = 0; player.sprintCooldownUntil = 0; player.windTailwindCooldownUntil = 0; player.angelBlessCooldownUntil = 0; player.jetBoostUntil = 0; player.jetBoostCooldownUntil = 0; player.jetBoostStartAt = 0; player.jetBoostStartX = 0; player.jetBoostStartY = 0; player.jetBoostEndX = 0; player.jetBoostEndY = 0; player.jetShieldUntil = 0; player.reactorOutput = 0; player.reactorLastDamageAt = 0; player.ultimateCharge = 0; player.ultimateUntil = 0; player.ultimateUseSeq = 0; player.mechaSelfDestructAt = 0; player.pendingUltimateId = null; player.pendingUltimateAt = 0; player.diaUltimateBurstsRemaining = 0; player.diaUltimateNextBurstAt = 0; player.diaUltimateVolleySeq = 0; player.bufferTargetId = null; player.lastPeriodicActionAt = 0; player.lastAbilityTargetId = null; player.jetBoostDistance = 0; player.shieldUntil = 0; player.shieldAbilityCharges = player.character === 'shield' ? CHARACTERS.shield.shieldMaxCharges : 0; player.shieldRechargeAt = 0;
    resetPerkState(player);
    broadcast(room);
    return;
  }
  if (msg.type === 'start' && room.hostId === player.id && room.state === 'lobby') {
    if (normalizeRoomMode(room.mode) !== 'casual') { conn.send({ type: 'start_error', message: '현재 방은 경쟁전 모드입니다.' }); return; }
    pruneDisconnectedEndedPlayers(room);
    const unpicked = [...room.players.values()].filter(p => !p.character);
    if (unpicked.length) {
      conn.send({ type: 'start_error', message: `아직 캐릭터를 선택하지 않은 참가자가 ${unpicked.length}명 있습니다.` });
      return;
    }
    room.competitive = null;
    startMatch(room);
    return;
  }
  if (msg.type === 'competitive_start' && room.hostId === player.id && room.state === 'lobby') {
    if (normalizeRoomMode(room.mode) !== 'competitive') { conn.send({ type: 'start_error', message: '현재 방은 일반전 모드입니다.' }); return; }
    if (!durableStore.status().ready) { conn.send({ type: 'start_error', message: '영구 통계 저장소가 연결되지 않아 경쟁전을 시작할 수 없습니다. 데이터 보호를 위해 시작이 차단되었습니다.' }); return; }
    pruneDisconnectedEndedPlayers(room);
    if (!isExactCompetitiveRoster(room)) {
      conn.send({ type: 'start_error', message: '경쟁전은 A팀 4명 + B팀 4명, 총 8명이 모두 접속해 있어야 시작할 수 있습니다.' });
      return;
    }
    startCompetitiveDraft(room);
    broadcast(room);
    return;
  }
  if (msg.type === 'draft_ban_vote' && room.state === 'draft' && room.competitive?.phase === 'ban') {
    const comp = room.competitive;
    if (player.team !== comp.activeBanTeam) return;
    const requested = validCharacter(msg.character);
    if (!competitiveAvailableCharacters(room).includes(requested)) return;
    comp.banVotes[player.team][player.id] = requested;
    comp.draftEvents.push({ type:'ban_vote', atSec: Math.max(0, (Date.now() - comp.draftStartedAt) / 1000), team: player.team, playerId: player.id, playerName: player.name, character: requested });
    sendCompetitiveBanVoteUpdate(room, player.team);
    return;
  }
  if (msg.type === 'draft_pick' && room.state === 'draft' && room.competitive?.phase === 'pick') {
    const requested = validCharacter(msg.character);
    if (commitCompetitivePick(room, player.id, requested, false, Date.now())) broadcast(room);
    return;
  }
  if (msg.type === 'ready_swap' && room.state === 'ready') {
    if (swapCompetitiveReadyAssignments(room, player, msg.sourcePlayerId, msg.targetPlayerId)) broadcast(room);
    return;
  }
  if (msg.type === 'perk_choose' && room.state === 'playing') {
    if (!PERK_SYSTEM.enabled) return;
    const chosen = choosePerk(room, player, msg.perkId, Date.now());
    if (chosen) conn.send({ type: 'perk_selected', character: player.character, perk: chosen });
    return;
  }
  if (msg.type === 'ability' && room.state === 'playing') {
    const now = Date.now();
    if (!player.alive || isStunned(player, now)) return;
    const def = CHARACTERS[player.character];
    if (!def || msg.ability !== def.abilityId) return;
    let abilityTarget = null;
    if (def.abilityTargeting) {
      abilityTarget = resolveTargetedAbilityTarget(room, player, msg.targetId, def.abilityTargeting, now);
      if (!abilityTarget) return;
    }
    let activated = false;
    if (msg.ability === 'form') activated = activateDiaForm(player, now);
    if (msg.ability === 'sprint') activated = activateRunnerSprint(player, now);
    if (msg.ability === 'tailwind') activated = activateWindTailwind(room, player, now);
    if (msg.ability === 'blessing') activated = activateAngelBlessing(room, player, abilityTarget, now);
    if (msg.ability === 'shield') activated = activateShieldAbility(room, player, abilityTarget, now);
    if (msg.ability === 'boost') activated = activateJetBoost(room, player, now);
    if (activated) {
      player.abilityUseSeq = (player.abilityUseSeq || 0) + 1;
      player.lastAbilityTargetId = abilityTarget ? abilityTarget.id : null;
    }
    return;
  }
  if (msg.type === 'ultimate' && room.state === 'playing') {
    activateUltimate(room, player, Date.now(), msg.targetId || null);
    return;
  }
  if (msg.type === 'link_target' && room.state === 'playing') {
    if (player.character !== 'buffer' || !player.alive || isStunned(player, Date.now())) return;
    setBufferTarget(room, player, msg.targetId);
    return;
  }
  if (msg.type === 'input' && room.state === 'playing') {
    player.input.up = !!msg.up;
    player.input.down = !!msg.down;
    player.input.left = !!msg.left;
    player.input.right = !!msg.right;
    player.input.fire = !!msg.fire;
    const ax = Number(msg.aimX), ay = Number(msg.aimY);
    if (Number.isFinite(ax) && Number.isFinite(ay)) { player.aimX = ax; player.aimY = ay; }
  }
}

function sendAdminCompetitiveStats(conn, msg) {
  if (!conn.roomCode || (!conn.playerId && !conn.spectatorId)) {
    conn.send({ type: 'admin_stats_error', message: '먼저 방에 입장한 뒤 관리자 통계를 열어주세요.' });
    return;
  }
  if (conn.adminStatsAuthorized) {
    conn.send({ type: 'admin_stats_data', data: publicAdminStatsPayload(msg.statsVersion) });
    return;
  }
  const now = Date.now();
  if (adminStatsAuthLocked(conn.remoteAddress, now)) {
    conn.send({ type: 'admin_stats_error', message: '관리자 암호 입력이 잠시 잠겼습니다. 30초 뒤 다시 시도하세요.' });
    return;
  }
  const pin = safePin(msg.pin);
  if (pin.length !== 4 || hashText(pin) !== ADMIN_STATS_PIN_HASH) {
    noteAdminStatsAuthFailure(conn.remoteAddress, now);
    conn.send({ type: 'admin_stats_error', message: '관리자 암호가 올바르지 않습니다.' });
    return;
  }
  clearAdminStatsAuthFailure(conn.remoteAddress);
  conn.adminStatsAuthorized = true;
  conn.send({ type: 'admin_stats_data', data: publicAdminStatsPayload(msg.statsVersion) });
}

function sendAdminCompetitiveStatsBackup(conn) {
  if (!conn.roomCode || (!conn.playerId && !conn.spectatorId)) {
    conn.send({ type: 'admin_stats_error', message: '먼저 방에 입장한 뒤 관리자 통계를 열어주세요.' });
    return;
  }
  if (!conn.adminStatsAuthorized) {
    conn.send({ type: 'admin_stats_error', message: '관리자 통계를 먼저 인증해 주세요.' });
    return;
  }
  conn.send({ type: 'admin_stats_export_data', data: competitiveStatsBackupPayload() });
}

function joinSpectator(conn, msg) {
  if (conn.playerId || conn.spectatorId) return;
  const now = Date.now();
  if (spectatorAuthLocked(conn.remoteAddress, now)) {
    conn.send({ type: 'error', message: '관전자 PIN 입력이 잠시 잠겼습니다. 30초 뒤 다시 시도하세요.' });
    return;
  }
  const pin = safePin(msg.pin);
  if (pin.length !== 4 || hashText(pin) !== SPECTATOR_PIN_HASH) {
    noteSpectatorAuthFailure(conn.remoteAddress, now);
    conn.send({ type: 'error', message: '관전자 PIN이 올바르지 않습니다.' });
    return;
  }
  clearSpectatorAuthFailure(conn.remoteAddress);
  const code = safeRoom(msg.room);
  const room = rooms.get(code);
  if (!room) {
    conn.send({ type: 'error', message: '아직 만들어지지 않은 방입니다. 학생이 먼저 입장해야 합니다.' });
    return;
  }
  if (room.state === 'ended') {
    conn.send({ type: 'error', code: 'room_ending', message: '경기가 종료되어 이 방은 곧 자동으로 닫힙니다. 잠시 후 다시 입장해주세요.' });
    return;
  }
  const spectatorId = `S${spectatorCounter++}`;
  conn.spectatorId = spectatorId;
  conn.roomCode = code;
  room.spectators.set(spectatorId, conn);
  conn.send({
    type: 'spectator_joined', id: spectatorId, room: roomDisplayName(room), roomId: code, roomNumber: room.displayNumber, mode: room.mode,
    config: { world: WORLD, walls: WALLS, characters: publicCharacterDefs() }
  });
  if (!sendPlayingSnapshotToConnection(room, conn, Date.now())) conn.send(snapshot(room, null, true));
}

function joinRoom(conn, msg, options = {}) {
  if (conn.playerId) return false;
  const code = safeRoom(msg.roomId || msg.room);
  const account = authenticatePlayerAccount(msg.accountId, msg.pin);
  if (!account) {
    conn.send({ type:'error', code:'account_login_failed', message:'이름 또는 4자리 PIN이 올바르지 않습니다.' });
    return false;
  }
  const requestedName = account.name;
  const existing = findAccountReservation(account.id);
  if (existing) {
    const sameRoom = existing.room.code === code;
    const canRecoverByAccount = sameRoom
      && existing.player.connected === false
      && ['draft','ready','playing'].includes(existing.room.state);
    if (canRecoverByAccount) {
      return attachExistingPlayerConnection(conn, existing.room, existing.player, {
        rotateResumeToken: true,
        recoveredByAccount: true
      });
    }
    conn.send({
      type:'error', code:'account_in_use',
      message:sameRoom ? '이 계정은 이미 이 게임에 접속 중입니다. 기존 화면을 사용하세요.' : '이 계정은 이미 다른 게임에 참가 중입니다. 기존 게임을 먼저 종료하세요.'
    });
    return false;
  }

  let room = rooms.get(code);
  if (!room && options.allowCreate === true) {
    const displayNumber = nextRoomDisplayNumber();
    if (!displayNumber || rooms.size >= MAX_ROOMS) {
      conn.send({ type: 'error', code: 'room_limit', message: `현재 방이 ${MAX_ROOMS}개 모두 열려 있어 새 방을 만들 수 없습니다.` });
      return false;
    }
    room = newRoom(code, { mode: 'casual', displayNumber });
    rooms.set(code, room);
  }
  if (!room) { conn.send({ type: 'error', code: 'room_missing', message: '이 방은 더 이상 열려 있지 않습니다. 방 목록을 새로고침해주세요.' }); return false; }
  if (room.players.size >= 8) { conn.send({ type: 'error', message: '이 방은 이미 8명입니다.' }); return; }
  if (room.state === 'ended') { conn.send({ type: 'error', code: 'room_ending', message: '경기가 종료되어 이 방은 곧 자동으로 닫힙니다. 잠시 후 다시 입장해주세요.' }); return; }
  if (room.state !== 'lobby') { conn.send({ type: 'error', message: '이미 게임 준비 또는 경기가 진행 중입니다.' }); return; }

  const team = msg.team === 'A' || msg.team === 'B' ? msg.team : null;
  if (!team) { conn.send({ type: 'error', message: 'A팀 또는 B팀을 선택하세요.' }); return; }
  if (countTeam(room, team) >= 4) { conn.send({ type: 'error', message: `${team}팀은 이미 4명입니다.` }); return; }

  const id = `P${idCounter++}`;
  const player = {
    id, accountId: account.id, name: requestedName, team, character: null,
    resumeToken: newResumeToken(), connected: true, disconnectedAt: 0,
    x: 21, y: team === 'A' ? 5 : 63,
    hp: 0, maxHp: 0, alive: true, respawnAt: 0, invulnerableUntil: 0, respawnShieldAt: 0,
    aimX: 21, aimY: team === 'A' ? 20 : 48,
    input: { up: false, down: false, left: false, right: false, fire: false },
    nextFireAt: 0, lastPeriodicActionAt: 0,
    bufferTargetId: null,
    statuses: Object.create(null),
    shield: 0, maxShield: 0, shieldUntil: 0, shieldCreditBySource: Object.create(null), shieldUncredited: 0,
    shieldAbilityCharges: 0, shieldRechargeAt: 0,
    lastCombatAt: 0, damageContributors: Object.create(null), supportContributors: Object.create(null), lastDamageAttackerId: null, lastDamageAt: 0,
    diaFormUntil: 0, diaCooldownUntil: 0,
    sprintUntil: 0, sprintCooldownUntil: 0, windTailwindCooldownUntil: 0, angelBlessCooldownUntil: 0,
    jetBoostUntil: 0, jetBoostCooldownUntil: 0, jetBoostStartAt: 0,
    jetBoostStartX: 0, jetBoostStartY: 0, jetBoostEndX: 0, jetBoostEndY: 0, jetShieldUntil: 0,
    reactorOutput: 0, reactorLastDamageAt: 0, jetBoostDistance: 0, ultimateCharge: 0, ultimateUntil: 0, ultimateUseSeq: 0, mechaSelfDestructAt: 0, pendingUltimateId: null, pendingUltimateAt: 0, diaUltimateBurstsRemaining: 0, diaUltimateNextBurstAt: 0, diaUltimateVolleySeq: 0, diaUltimateVolleyHits: new Map(),
    perkChoiceId: null, perkChosenAt: 0, perkOfferSent: false,
    shotSeq: 0, projectileHitSeq: 0, healHitSeq: 0, lastHealTargetId: null, lastHealFeedbackAt: 0, healNumberPending: 0, healNumberFlushAt: 0, abilityUseSeq: 0, lastAbilityTargetId: null,
    stats: makeMatchStats(null)
  };
  room.players.set(id, player);
  room.clients.set(id, conn);
  if (!room.hostId) room.hostId = id;
  conn.playerId = id; conn.roomCode = code;
  const sp = spawnPoint(room, player); player.x = sp.x; player.y = sp.y;
  conn.send({
    type: 'joined', id, accountId: account.id, room: roomDisplayName(room), roomId: code, roomNumber: room.displayNumber, mode: room.mode, team, resumeToken: player.resumeToken,
    config: { world: WORLD, walls: WALLS, characters: publicCharacterDefs() }
  });
  broadcast(room);
  return true;
}

function createRoomAndJoin(conn, msg) {
  if (conn.playerId || conn.spectatorId) return false;
  const account = authenticatePlayerAccount(msg.accountId, msg.pin);
  if (!account) {
    conn.send({ type:'error', code:'account_login_failed', message:'이름 또는 4자리 PIN이 올바르지 않습니다.' });
    return false;
  }
  if (findAccountReservation(account.id)) {
    conn.send({ type:'error', code:'account_in_use', message:'이 계정은 이미 다른 게임에 참가 중입니다. 기존 게임을 먼저 종료하세요.' });
    return false;
  }
  const displayNumber = nextRoomDisplayNumber();
  if (!displayNumber || rooms.size >= MAX_ROOMS) {
    conn.send({ type: 'error', code: 'room_limit', message: `현재 방이 ${MAX_ROOMS}개 모두 열려 있어 새 방을 만들 수 없습니다.` });
    return false;
  }
  // New-room creators always start on A. They can freely switch teams in the waiting room.
  const team = 'A';
  const code = newInternalRoomCode();
  const room = newRoom(code, { mode: normalizeRoomMode(msg.mode), displayNumber });
  rooms.set(code, room);
  const joined = joinRoom(conn, { accountId: account.id, pin: account.pin, room: code, team }, { allowCreate: false });
  if (!joined && room.players.size === 0 && room.spectators.size === 0) rooms.delete(code);
  return joined;
}


function leaveRoomExplicit(conn) {
  const room = rooms.get(conn.roomCode);
  if (!room) {
    conn.playerId = null;
    conn.spectatorId = null;
    conn.roomCode = null;
    conn.send({ type: 'left_room', message: '방에서 나왔습니다.' });
    return true;
  }

  if (conn.spectatorId) {
    room.spectators.delete(conn.spectatorId);
    conn.spectatorId = null;
    conn.roomCode = null;
    conn.send({ type: 'left_room', message: '관전을 종료하고 방에서 나왔습니다.' });
    if (room.players.size === 0 && room.spectators.size === 0) rooms.delete(room.code);
    else broadcast(room);
    return true;
  }

  if (!conn.playerId) return false;
  const playerId = conn.playerId;
  const player = room.players.get(playerId);
  if (!player) {
    conn.playerId = null;
    conn.roomCode = null;
    conn.send({ type: 'left_room', message: '방에서 나왔습니다.' });
    return true;
  }
  if (!['lobby', 'ended'].includes(room.state)) {
    conn.send({ type: 'leave_room_error', message: '경기 준비 또는 진행 중에는 방을 나갈 수 없습니다.' });
    return false;
  }

  room.clients.delete(playerId);
  room.players.delete(playerId);
  for (const [pid, proj] of [...room.projectiles]) if (proj.ownerId === playerId) removeProjectile(room, pid);
  if (room.hostId === playerId) room.hostId = [...room.players.values()].find(p => p.connected !== false)?.id || null;

  conn.playerId = null;
  conn.roomCode = null;
  conn.send({ type: 'left_room', message: '방에서 나왔습니다.' });
  if (room.players.size === 0 && room.spectators.size === 0) rooms.delete(room.code);
  else broadcast(room);
  return true;
}

function neutralizePlayerInput(player) {
  if (!player) return;
  player.input = { up: false, down: false, left: false, right: false, fire: false };
}

function attachExistingPlayerConnection(conn, room, player, options = {}) {
  const rotateResumeToken = options.rotateResumeToken === true;
  const recoveredByNickname = options.recoveredByNickname === true;
  const recoveredByAccount = options.recoveredByAccount === true;
  const previousConn = room.clients.get(player.id);
  if (previousConn && previousConn !== conn) {
    // A mobile network change can leave the old TCP socket half-open. A valid token
    // may replace it. Nickname recovery only calls this helper for disconnected seats.
    previousConn.playerId = null;
    previousConn.roomCode = null;
    try { previousConn.close(); } catch (_) {}
  }

  if (rotateResumeToken) player.resumeToken = newResumeToken();
  room.clients.set(player.id, conn);
  player.connected = true;
  player.disconnectedAt = 0;
  neutralizePlayerInput(player);
  conn.playerId = player.id;
  conn.roomCode = room.code;
  if (!room.hostId || !room.players.get(room.hostId)?.connected) room.hostId = player.id;

  conn.send({
    type: 'resumed', id: player.id, room: roomDisplayName(room), roomId: room.code, roomNumber: room.displayNumber, mode: room.mode, team: player.team,
    resumeToken: player.resumeToken, recoveredByNickname, recoveredByAccount, accountId: player.accountId || null,
    config: { world: WORLD, walls: WALLS, characters: publicCharacterDefs() }
  });
  if (!sendPlayingSnapshotToConnection(room, conn, Date.now())) conn.send(snapshot(room, player.id));
  if (PERK_SYSTEM.enabled && room.state === 'playing') {
    if (player.perkChoiceId) {
      const chosen = perkOptionsForCharacter(player.character).find(option => String(option.id || '') === player.perkChoiceId);
      if (chosen) conn.send({ type: 'perk_selected', character: player.character, perk: publicPerkOption(chosen) });
    } else {
      player.perkOfferSent = false;
      maybeSendPerkOffer(room, player, conn, Date.now());
    }
  }
  broadcast(room);
  return player;
}

function resumeRoom(conn, msg) {
  if (conn.playerId || conn.spectatorId) return;
  const code = safeRoom(msg.room);
  const token = safeResumeToken(msg.resumeToken);
  if (!token) {
    conn.send({ type: 'error', code: 'resume_invalid', message: '재접속 정보가 올바르지 않습니다. 다시 입장해주세요.' });
    return;
  }
  const room = rooms.get(code);
  if (!room) {
    conn.send({ type: 'error', code: 'resume_invalid', message: '재접속할 방을 찾을 수 없습니다. 다시 입장해주세요.' });
    return;
  }
  const player = [...room.players.values()].find(p => p.resumeToken === token);
  if (!player) {
    conn.send({ type: 'error', code: 'resume_invalid', message: '이 경기의 재접속 자리를 찾을 수 없습니다. 다시 입장해주세요.' });
    return;
  }
  if (!['draft','ready','playing'].includes(room.state)) {
    conn.send({ type: 'error', code: 'resume_unavailable', message: '현재는 재접속할 진행 상태가 아닙니다. 일반 입장을 이용해주세요.' });
    return;
  }
  return attachExistingPlayerConnection(conn, room, player);
}

function publicCharacterDefs() {
  const out = {};
  const displayFields = [
    'range', 'fireRate', 'projectileType', 'attackType', 'damage', 'heal',
    'projectileSpeed', 'projectileRadius', 'beamDps', 'healHps', 'maxHpDpsRatio',
    'burnDps', 'burnDuration', 'burnHealReduction', 'poisonHealReduction', 'poisonDuration', 'radiationHealReduction', 'radiationDuration',
    'slowTierDelta', 'slowDuration', 'tailwindDuration', 'tailwindCooldown',
    'solarFireRate', 'solarProjectileRange', 'solarProjectileSpeed',
    'solarProjectileRadius', 'solarProjectileDamage', 'solarSelfHeal',
    'sprintDuration', 'sprintCooldown', 'abilityCooldown', 'abilityHeal',
    'boostDistance', 'boostDuration', 'boostCooldown', 'boostShield', 'boostShieldDuration',
    'shieldAmount', 'shieldDuration', 'shieldCap', 'shieldMaxCharges', 'shieldRecharge',
    'reactorDamagePerOutput', 'reactorKillOutputGain', 'reactorDecayDelay', 'reactorDecayPerSecond', 'reactorHighThreshold', 'reactorHighSpeed',
    'linkHealHps', 'actionSpeedBoost', 'noBasicAttack', 'spraySideProjectileRadius', 'spraySideDamage',
    'formDuration', 'formCooldown', 'formHp', 'formSpeed', 'formRange', 'formBeamDps', 'formKillCooldownReduction',
    'ultimateName', 'ultimateCost', 'ultimateDescription', 'ultimateRadius', 'ultimateDamage', 'ultimateStunDuration', 'ultimateDuration', 'ultimateRange', 'ultimateSpeedTierDelta', 'ultimateLongRangeDamage', 'ultimateProjectileRadius', 'ultimateBurnDuration', 'ultimateHeal', 'ultimateShield', 'ultimateShieldDuration', 'ultimateDelay', 'ultimateSelfDamage', 'ultimateBoostCooldown', 'ultimateAuraDps', 'ultimateSelfHealHps', 'ultimatePoisonDuration', 'ultimateSideDamage', 'ultimateHealHps', 'ultimateBeamDps', 'ultimateMaxHpDpsRatio', 'ultimateLinkHealHps', 'ultimateLinkedSpeedTierDelta', 'ultimateProjectileCount', 'ultimateVolleyCount', 'ultimateVolleyInterval'
  ];
  for (const [id, c] of Object.entries(CHARACTERS)) {
    const def = {
      name: c.name, role: c.role, hp: c.hp, speed: c.speed, radius: c.radius,
      abilityId: c.abilityId || null,
      abilityTargeting: c.abilityTargeting ? { ...c.abilityTargeting, relations: [...(c.abilityTargeting.relations || [])] } : null,
      linkTargeting: c.linkTargeting ? { ...c.linkTargeting, relations: [...(c.linkTargeting.relations || [])] } : null
    };
    for (const field of displayFields) {
      if (c[field] !== undefined) def[field] = c[field];
    }
    if (Array.isArray(c.distanceDamageBands)) {
      def.distanceDamageBands = c.distanceDamageBands.map(b => ({ max: b.max, damage: b.damage }));
    }
    if (Array.isArray(c.reactorOutputBands)) {
      def.reactorOutputBands = c.reactorOutputBands.map(b => ({ max: b.max, damage: b.damage }));
    }
    out[id] = def;
  }
  return out;
}

function disconnect(conn) {
  if (conn.closed && !conn.playerId && !conn.spectatorId) return;
  conn.closed = true;
  const room = rooms.get(conn.roomCode);
  if (!room) return;
  if (conn.spectatorId) {
    room.spectators.delete(conn.spectatorId);
    conn.spectatorId = null;
    if (room.players.size === 0 && room.spectators.size === 0) rooms.delete(room.code);
    conn.roomCode = null;
    return;
  }
  if (!conn.playerId) return;

  const playerId = conn.playerId;
  const player = room.players.get(playerId);
  // Ignore a late close from a transport that has already been replaced by resumeRoom.
  if (room.clients.get(playerId) !== conn) {
    conn.playerId = null;
    conn.roomCode = null;
    return;
  }

  room.clients.delete(playerId);

  if (['draft','ready','playing'].includes(room.state) && player) {
    // Keep the authoritative player object reserved for the rest of this match.
    // The body stays in-world and can take damage, but cannot move/fire or contest objectives.
    player.connected = false;
    player.disconnectedAt = Date.now();
    if (room.matchMode === 'competitive' || room.competitive) {
      player.competitiveDisconnects = Math.max(0, Number(player.competitiveDisconnects) || 0) + 1;
      appendCompetitiveMatchEvent(room, 'disconnect', { playerId: player.id, playerName: player.name, team: player.team, character: player.character }, Date.now());
    }
    neutralizePlayerInput(player);
    if (room.hostId === playerId) {
      room.hostId = [...room.players.values()].find(p => p.id !== playerId && p.connected)?.id || null;
    }
    broadcast(room);
  } else {
    room.players.delete(playerId);
    for (const [pid, proj] of [...room.projectiles]) if (proj.ownerId === playerId) removeProjectile(room, pid);
    if (room.hostId === playerId) room.hostId = [...room.players.values()].find(p => p.connected !== false)?.id || null;
    if (room.players.size === 0 && room.spectators.size === 0) rooms.delete(room.code); else broadcast(room);
  }

  conn.playerId = null;
  conn.roomCode = null;
}

function startMatch(room, now = Date.now()) {
  // Starting any new game is an authoritative cancellation of a pending post-game room deletion.
  cancelPostGameRoomClose(room);
  room.matchMode = normalizeRoomMode(room.mode);
  room.state = 'playing';
  room.scoreA = 0; room.scoreB = 0; room.winner = null; room.winnerReason = null;
  room.matchStartedAt = now;
  room.matchEndAt = now + MATCH_SECONDS * 1000;
  room.nextUltimateAutoChargeAt = now + ULTIMATE_AUTO_CHARGE_INTERVAL_MS;
  clearProjectiles(room);
  room.beams = [];
  // Force one fresh c5 static player dictionary at every match start.
  room.lastPlayerNetMetaSignature = null;
  for (const p of room.players.values()) {
    const def = CHARACTERS[p.character];
    const sp = spawnPoint(room, p);
    Object.assign(p, {
      x: sp.x, y: sp.y, hp: def.hp, maxHp: def.hp, alive: true, respawnAt: 0, invulnerableUntil: 0, respawnShieldAt: 0,
      connected: p.connected !== false, disconnectedAt: p.connected === false ? (p.disconnectedAt || now) : 0,
      nextFireAt: 0, lastPeriodicActionAt: 0, bufferTargetId: null, statuses: Object.create(null), shield: 0, maxShield: 0, shieldUntil: 0, shieldCreditBySource: Object.create(null), shieldUncredited: 0,
      shieldAbilityCharges: p.character === 'shield' ? CHARACTERS.shield.shieldMaxCharges : 0, shieldRechargeAt: 0,
      diaFormUntil: 0, diaCooldownUntil: 0, sprintUntil: 0, sprintCooldownUntil: 0, windTailwindCooldownUntil: 0, angelBlessCooldownUntil: 0,
      jetBoostUntil: 0, jetBoostCooldownUntil: 0, jetBoostStartAt: 0, jetBoostStartX: 0, jetBoostStartY: 0, jetBoostEndX: 0, jetBoostEndY: 0, jetShieldUntil: 0,
      reactorOutput: 0, reactorLastDamageAt: 0, jetBoostDistance: 0, ultimateCharge: 0, ultimateUntil: 0, ultimateUseSeq: 0, mechaSelfDestructAt: 0, pendingUltimateId: null, pendingUltimateAt: 0, diaUltimateBurstsRemaining: 0, diaUltimateNextBurstAt: 0, diaUltimateVolleySeq: 0, diaUltimateVolleyHits: new Map(), lastCombatAt: now, damageContributors: Object.create(null), supportContributors: Object.create(null), lastDamageAttackerId: null, lastDamageAt: 0,
      perkChoiceId: null, perkChosenAt: 0, perkOfferSent: false,
      shotSeq: 0, projectileHitSeq: 0, healHitSeq: 0, lastHealTargetId: null, lastHealFeedbackAt: 0, healNumberPending: 0, healNumberFlushAt: 0, abilityUseSeq: 0, lastAbilityTargetId: null,
      stats: makeMatchStats(p.character)
    });
    p.input = { up: false, down: false, left: false, right: false, fire: false };
  }
  broadcast(room);
}

function jetBoostCooldownSeconds(player, now = Date.now()) {
  const def = CHARACTERS.jet;
  if (player && player.character === 'jet' && isUltimateActive(player, now)) return Number(def.ultimateBoostCooldown || 2) || 2;
  return Number(def.boostCooldown || 10) || 10;
}

function currentBufferLinkHealHps(player, now = Date.now()) {
  const def = CHARACTERS.buffer;
  if (player && player.character === 'buffer' && isUltimateActive(player, now)) return Number(def.ultimateLinkHealHps || def.linkHealHps) || Number(def.linkHealHps) || 0;
  return Number(def.linkHealHps) || 0;
}

function isHealingFullyBlocked(player, now = Date.now()) {
  const poison = getStatus(player, 'poison', now);
  return !!(poison && poison.data && poison.data.fullBlock);
}

function activateDiaForm(player, now) {
  if (!player.alive || player.character !== 'dia') return false;
  if (player.diaFormUntil > now || player.diaCooldownUntil > now) return false;
  const def = CHARACTERS.dia;
  player.diaFormUntil = now + def.formDuration * 1000;
  player.diaCooldownUntil = now + def.formCooldown * 1000;
  player.maxHp = def.formHp;
  player.hp = Math.min(def.formHp, player.hp + (def.formHp - def.hp));
  return true;
}

function activateRunnerSprint(player, now) {
  if (!player.alive || player.character !== 'runner') return false;
  if (player.sprintUntil > now || player.sprintCooldownUntil > now) return false;
  const def = CHARACTERS.runner;
  player.sprintUntil = now + def.sprintDuration * 1000;
  player.sprintCooldownUntil = now + def.sprintCooldown * 1000;
  return true;
}

function activateWindTailwind(room, player, now) {
  if (!room || !player.alive || player.character !== 'wind') return false;
  if (player.windTailwindCooldownUntil > now) return false;
  const def = CHARACTERS.wind;
  player.windTailwindCooldownUntil = now + def.tailwindCooldown * 1000;
  let applications = 0;
  for (const target of room.players.values()) {
    if (!target.alive || target.team !== player.team) continue;
    if (applyStatus(room, player, target, 'tailwind', def.tailwindDuration * 1000, now, { tierDelta: 1 })) applications += 1;
  }
  ensureMatchStats(player).tailwindApplications += applications;
  return true;
}

function jetBoostEndpoint(player, def) {
  let dx = player.aimX - player.x, dy = player.aimY - player.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return null;
  dx /= len; dy /= len;

  const maxDistance = Math.max(0, Number(def.boostDistance) || 0);
  const radius = Number(def.radius) || 0;
  const validAt = dist => {
    const x = player.x + dx * dist, y = player.y + dy * dist;
    if (x < radius || x > WORLD.width - radius || y < radius || y > WORLD.height - radius) return false;
    return !collidesWall(x, y, radius);
  };

  // Jet ignores characters, but solid terrain/world bounds stop the boost. Sample the
  // short 12 m ray, then binary-search the first blocked interval so high boost speed
  // cannot tunnel through a wall between normal physics ticks.
  const step = 0.05;
  let lastValid = 0;
  let firstBlocked = null;
  for (let dist = Math.min(step, maxDistance); dist <= maxDistance + 1e-9; dist = Math.min(maxDistance, dist + step)) {
    if (!validAt(dist)) { firstBlocked = dist; break; }
    lastValid = dist;
    if (dist >= maxDistance - 1e-9) break;
  }
  if (firstBlocked !== null) {
    let lo = lastValid, hi = firstBlocked;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (validAt(mid)) lo = mid; else hi = mid;
    }
    lastValid = lo;
  }

  return {
    x: player.x + dx * lastValid,
    y: player.y + dy * lastValid,
    distance: lastValid
  };
}

function finishJetBoost(room, player, now) {
  if (!player || player.character !== 'jet') return false;
  if (Number.isFinite(player.jetBoostEndX) && Number.isFinite(player.jetBoostEndY)) {
    player.x = player.jetBoostEndX;
    player.y = player.jetBoostEndY;
  }
  player.jetBoostUntil = 0;
  player.jetBoostStartAt = 0;
  const def = CHARACTERS.jet;
  applyShield(room, player, player, def.boostShield, { now });
  player.shieldUntil = now + def.boostShieldDuration * 1000;
  player.jetShieldUntil = player.shieldUntil;
  return true;
}

function activateJetBoost(room, player, now) {
  if (!player.alive || player.character !== 'jet') return false;
  if (player.jetBoostUntil > now || player.jetBoostCooldownUntil > now) return false;
  const def = CHARACTERS.jet;
  const endpoint = jetBoostEndpoint(player, def);
  if (!endpoint) return false;

  player.jetBoostCooldownUntil = now + jetBoostCooldownSeconds(player, now) * 1000;
  player.jetBoostStartAt = now;
  player.jetBoostStartX = player.x;
  player.jetBoostStartY = player.y;
  player.jetBoostEndX = endpoint.x;
  player.jetBoostEndY = endpoint.y;
  player.jetBoostDistance = endpoint.distance;

  const boostSpeed = def.boostDistance / def.boostDuration;
  const durationMs = boostSpeed > 0 ? (endpoint.distance / boostSpeed) * 1000 : 0;
  if (durationMs <= 0.5) {
    player.jetBoostUntil = 0;
    finishJetBoost(room, player, now);
  } else {
    player.jetBoostUntil = now + durationMs;
  }
  return true;
}

function updateJetBoostPosition(player, now) {
  if (!player || player.character !== 'jet' || player.jetBoostUntil <= 0) return false;
  const duration = Math.max(1, player.jetBoostUntil - player.jetBoostStartAt);
  const progress = clamp((now - player.jetBoostStartAt) / duration, 0, 1);
  player.x = player.jetBoostStartX + (player.jetBoostEndX - player.jetBoostStartX) * progress;
  player.y = player.jetBoostStartY + (player.jetBoostEndY - player.jetBoostStartY) * progress;
  return true;
}

function activateAngelBlessing(room, player, target, now) {
  if (!player.alive || player.character !== 'angel' || !target || !target.alive) return false;
  if (player.angelBlessCooldownUntil > now) return false;
  const def = CHARACTERS.angel;
  player.angelBlessCooldownUntil = now + def.abilityCooldown * 1000;
  const actualHeal = applyHealing(room, player, target, def.abilityHeal, now);
  if (actualHeal > 0) {
    ensureMatchStats(player).angelBlessingHealing += actualHeal;
  }
  return true;
}

function endDiaForm(player) {
  if (player.character !== 'dia' || player.diaFormUntil <= 0) return;
  const def = CHARACTERS.dia;
  player.diaFormUntil = 0;
  player.maxHp = def.hp;
  player.hp = Math.min(player.hp, def.hp);
}

function appendCompetitiveMatchEvent(room, type, payload = {}, now = Date.now()) {
  const comp = room && room.competitive;
  if (!comp || room.matchMode !== 'competitive') return;
  if (!Array.isArray(comp.matchEvents)) comp.matchEvents = [];
  if (comp.matchEvents.length >= 2000) return;
  comp.matchEvents.push({ type, atSec: Math.max(0, (now - (comp.matchStartedAt || room.matchStartedAt || now)) / 1000), ...payload });
}

function registerKill(room, attackerId, now, direct = true) {
  const attacker = room.players.get(attackerId);
  if (!attacker) return;
  const stats = ensureMatchStats(attacker);
  stats.kills += 1;
  if (attacker.alive && attacker.character === 'reactor') {
    const reactorDef = CHARACTERS.reactor;
    attacker.reactorOutput = clamp(
      Number(attacker.reactorOutput || 0) + Number(reactorDef.reactorKillOutputGain || 10),
      0,
      100
    );
    attacker.reactorLastDamageAt = now;
  }
  if (direct && attacker.alive && isDiaForm(attacker, now)) {
    stats.diaFormKills += 1;
    attacker.diaCooldownUntil = Math.max(now, attacker.diaCooldownUntil - CHARACTERS.dia.formKillCooldownReduction * 1000);
  }
}

function registerDirectKill(room, attackerId, now) {
  registerKill(room, attackerId, now, true);
}

function die(room, player, now) {
  player.ultimateUntil = 0;
  ensureMatchStats(player).deaths += 1;
  const recentWindowMs = 5000;
  const killerId = player.lastDamageAttackerId && now - Number(player.lastDamageAt || 0) <= recentWindowMs ? player.lastDamageAttackerId : null;
  const killer = killerId ? room.players.get(killerId) : null;
  const assistIds = new Set();

  // Damage assist: dealt qualifying damage to the victim in the last 5 seconds,
  // but did not land the direct kill.
  const contributors = player.damageContributors && typeof player.damageContributors === 'object' ? player.damageContributors : {};
  for (const [sourceId, hitAt] of Object.entries(contributors)) {
    if (sourceId === killerId || now - Number(hitAt || 0) > recentWindowMs) continue;
    const source = room.players.get(sourceId);
    if (source && source.team !== player.team) assistIds.add(sourceId);
  }

  // Support assist: effectively healed or successfully buffed/supported the killer
  // in the last 5 seconds. Multiple qualifying paths from the same teammate are
  // deduplicated into a single assist for this kill.
  if (killer) {
    const supporters = killer.supportContributors && typeof killer.supportContributors === 'object' ? killer.supportContributors : {};
    for (const [sourceId, supportedAt] of Object.entries(supporters)) {
      if (sourceId === killerId || now - Number(supportedAt || 0) > recentWindowMs) continue;
      const source = room.players.get(sourceId);
      if (source && source.team === killer.team) assistIds.add(sourceId);
    }
  }

  for (const sourceId of assistIds) {
    const source = room.players.get(sourceId);
    if (source) ensureMatchStats(source).assists += 1;
  }
  appendCompetitiveMatchEvent(room, 'death', {
    victimId: player.id, victimName: player.name, victimTeam: player.team, victimCharacter: player.character,
    killerId: killer ? killer.id : null, killerName: killer ? killer.name : null, killerTeam: killer ? killer.team : null, killerCharacter: killer ? killer.character : null,
    x: Number(player.x.toFixed(2)), y: Number(player.y.toFixed(2))
  }, now);
  player.damageContributors = Object.create(null); player.supportContributors = Object.create(null); player.lastDamageAttackerId = null; player.lastDamageAt = 0;
  player.hp = 0;
  player.alive = false;
  player.respawnAt = now + RESPAWN_MS;
  player.invulnerableUntil = 0;
  player.respawnShieldAt = 0;
  clearAllStatuses(player); clearShield(player);
  if (player.character === 'dia') {
    player.diaFormUntil = 0;
    player.maxHp = CHARACTERS.dia.hp;
  }
  if (player.character === 'runner') player.sprintUntil = 0;
  if (player.character === 'mecha') player.mechaSelfDestructAt = 0;
  player.pendingUltimateId = null; player.pendingUltimateAt = 0;
  player.diaUltimateBurstsRemaining = 0; player.diaUltimateNextBurstAt = 0; player.diaUltimateVolleySeq = 0;
  if (player.character === 'jet') { player.jetBoostUntil = 0; player.jetBoostStartAt = 0; player.jetShieldUntil = 0; clearShield(player); }
  if (player.character === 'reactor') { player.reactorOutput = 0; player.reactorLastDamageAt = 0; }
  if (player.character === 'buffer') player.bufferTargetId = null;
  clearBufferTargetRefs(room, player.id);
  player.input.fire = false;
}

function respawn(room, player, now) {
  const def = CHARACTERS[player.character];
  const sp = spawnPoint(room, player);
  player.x = sp.x; player.y = sp.y;
  player.hp = def.hp; player.maxHp = def.hp;
  player.alive = true; player.respawnAt = 0; player.invulnerableUntil = now + RESPAWN_INVULN_MS;
  player.respawnShieldAt = player.invulnerableUntil;
  player.damageContributors = Object.create(null); player.supportContributors = Object.create(null); player.lastDamageAttackerId = null; player.lastDamageAt = 0;
  clearAllStatuses(player); clearShield(player);
  player.lastCombatAt = now;
  if (player.character === 'dia') player.diaFormUntil = 0;
  if (player.character === 'runner') player.sprintUntil = 0;
  if (player.character === 'mecha') player.mechaSelfDestructAt = 0;
  player.pendingUltimateId = null; player.pendingUltimateAt = 0;
  player.diaUltimateBurstsRemaining = 0; player.diaUltimateNextBurstAt = 0; player.diaUltimateVolleySeq = 0;
  if (player.character === 'jet') { player.jetBoostUntil = 0; player.jetBoostStartAt = 0; player.jetShieldUntil = 0; }
  if (player.character === 'reactor') { player.reactorOutput = 0; player.reactorLastDamageAt = 0; }
  if (player.character === 'buffer') player.bufferTargetId = null;
  player.lastPeriodicActionAt = 0;
}

function applyRespawnPostShield(room, player, now) {
  if (!player || !player.alive || !player.respawnShieldAt || now < player.respawnShieldAt) return false;
  player.respawnShieldAt = 0;
  applyShield(room, null, player, RESPAWN_POST_SHIELD, { now });
  player.shieldUntil = Math.max(Number(player.shieldUntil) || 0, now + RESPAWN_POST_SHIELD_MS);
  return true;
}

function collidesWall(x, y, r) {
  for (const w of WALLS) {
    const cx = clamp(x, w.x, w.x + w.w);
    const cy = clamp(y, w.y, w.y + w.h);
    if ((x - cx) ** 2 + (y - cy) ** 2 < r * r - 1e-9) return true;
  }
  return false;
}

function movePlayer(player, dx, dy, radius) {
  let nx = clamp(player.x + dx, radius, WORLD.width - radius);
  if (!collidesWall(nx, player.y, radius)) player.x = nx;
  let ny = clamp(player.y + dy, radius, WORLD.height - radius);
  if (!collidesWall(player.x, ny, radius)) player.y = ny;
}

function segmentCircleT(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a), t2 = (-b + disc) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}

function segmentAabbT(x1, y1, x2, y2, minX, minY, maxX, maxY) {
  const dx = x2 - x1, dy = y2 - y1;
  let tmin = 0, tmax = 1;
  for (const [p, qmin, qmax, d] of [[x1, minX, maxX, dx], [y1, minY, maxY, dy]]) {
    if (Math.abs(d) < 1e-12) {
      if (p < qmin || p > qmax) return null;
    } else {
      let t1 = (qmin - p) / d, t2 = (qmax - p) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function markCombat(room, attackerId, target, now) {
  const attacker = room.players.get(attackerId);
  if (attacker) attacker.lastCombatAt = now;
  if (target) target.lastCombatAt = now;
}

function makeMatchStats(character = null) {
  return {
    character,
    kills: 0,
    deaths: 0,
    assists: 0,
    ultimateUses: 0,
    damage: 0,
    hpDamage: 0,
    shieldDamage: 0,
    damageTaken: 0,
    hpDamageTaken: 0,
    shieldDamageTaken: 0,
    healing: 0,
    allyHealing: 0,
    selfHealing: 0,
    healingReceived: 0,
    aliveSeconds: 0,
    deadSeconds: 0,
    disconnectedSeconds: 0,
    enemyZoneSeconds: 0,
    ownZoneDefenseSeconds: 0,
    objectiveSeconds: 0,
    contestSeconds: 0,
    tailwindApplications: 0,
    diaFormKills: 0,
    healingPrevented: 0,
    reactorStage3Seconds: 0,
    shieldDamageBlocked: 0,
    bufferLinkSeconds: 0,
    burnDamage: 0,
    sniperLongRangeDamage: 0,
    solarProjectileHealing: 0,
    angelBlessingHealing: 0
  };
}

function ensureMatchStats(player) {
  if (!player.stats) player.stats = makeMatchStats(player.character || null);
  return player.stats;
}

function ultimateCostForPlayer(player) {
  if (!player) return 0;
  return Math.max(0, Number(CHARACTERS[player.character]?.ultimateCost) || 0);
}

function grantUltimateCharge(player, amount, now = Date.now()) {
  const cost = ultimateCostForPlayer(player);
  const gain = Math.max(0, Number(amount) || 0);
  if (cost <= 0 || gain <= 0 || isUltimateActive(player, now)) return 0;
  const before = clamp(Number(player.ultimateCharge) || 0, 0, cost);
  const after = Math.min(cost, before + gain);
  player.ultimateCharge = after;
  return after - before;
}

function ultimateChargePercent(player) {
  const cost = ultimateCostForPlayer(player);
  if (cost <= 0) return 0;
  return clamp((Number(player.ultimateCharge) || 0) / cost * 100, 0, 100);
}

function scheduleDelayedUltimate(player, character, now, delaySeconds) {
  const delayMs = Math.max(0, Number(delaySeconds) || 0) * 1000;
  player.pendingUltimateId = character;
  player.pendingUltimateAt = now + delayMs;
  // The charge remains locked at 0 during the telegraph window. The effect itself
  // is still a one-shot ultimate rather than a sustained buff.
  player.ultimateUntil = player.pendingUltimateAt;
}

function resolveDelayedUltimate(room, player, character, now, centerX = player.x, centerY = player.y) {
  const def = CHARACTERS[character];
  if (!def) return false;
  if (character === 'iron') {
    const radius = Number(def.ultimateRadius) || 12;
    for (const target of room.players.values()) {
      if (!target.alive || target.team === player.team || target.id === player.id) continue;
      if (distance(centerX, centerY, target.x, target.y) > radius + 1e-9) continue;
      const result = dealDamageDetailed(room, player.id, target, Number(def.ultimateDamage) || 50, now, { countsForUltimate: false });
      if (target.hp <= 0) {
        registerDirectKill(room, player.id, now);
        die(room, target, now);
        continue;
      }
      if (result.total > 0) applyStatus(room, player, target, 'stun', (Number(def.ultimateStunDuration) || 1.5) * 1000, now);
    }
    return true;
  }
  if (character === 'star') {
    const radius = Number(def.ultimateRadius) || 30;
    for (const target of room.players.values()) {
      if (!target.alive) continue;
      if (distance(centerX, centerY, target.x, target.y) > radius + 1e-9) continue;
      if (target.team === player.team) {
        applyHealing(room, player, target, Number(def.ultimateHeal) || 150, now, { countsForUltimate: false, suppressHealerSelfHeal: true });
      } else {
        dealDamageDetailed(room, player.id, target, Number(def.ultimateDamage) || 100, now, { countsForUltimate: false });
        if (target.hp <= 0) {
          registerDirectKill(room, player.id, now);
          die(room, target, now);
        }
      }
    }
    return true;
  }
  if (character === 'ice') {
    const radius = Number(def.ultimateRadius) || 16;
    for (const target of room.players.values()) {
      if (!target.alive || target.team === player.team || target.id === player.id) continue;
      if (distance(centerX, centerY, target.x, target.y) > radius + 1e-9) continue;
      applyStatus(room, player, target, 'stun', (Number(def.ultimateStunDuration) || 1) * 1000, now);
    }
    applyHealing(room, player, player, Number(def.ultimateHeal) || 300, now, { countsForUltimate: false, suppressHealerSelfHeal: true });
    return true;
  }
  return false;
}

function spawnDiaUltimateVolley(room, player, now) {
  if (!room || !player || !player.alive || player.character !== 'dia') return 0;
  const def = CHARACTERS.dia;
  const projectileCount = Math.max(1, Math.floor(Number(def.ultimateProjectileCount) || 16));
  const volleySeq = Math.max(0, Number(player.diaUltimateVolleySeq) || 0) + 1;
  player.diaUltimateVolleySeq = volleySeq;
  const volleyId = `${player.id}:diaU:${player.ultimateUseSeq || 0}:${volleySeq}:${Math.floor(now)}`;
  let spawned = 0;
  for (let i = 0; i < projectileCount; i++) {
    const angle = (Math.PI * 2 * i) / projectileCount;
    const id = spawnProjectileFromDirection(room, player, def, now, Math.cos(angle), Math.sin(angle), {
      projectileType: 'attack',
      damage: Number(def.ultimateDamage) || 40,
      countsForUltimate: false,
      diaUltimateVolleyId: volleyId,
      ultimateProjectile: true
    });
    if (id) spawned += 1;
  }
  return spawned;
}

function activateUltimate(room, player, now = Date.now(), targetId = null) {
  if (!room || !player || !player.alive || isStunned(player, now)) return false;
  const def = CHARACTERS[player.character];
  const cost = ultimateCostForPlayer(player);
  if (!def || cost <= 0 || (Number(player.ultimateCharge) || 0) + 1e-9 < cost) return false;

  let activated = false;
  if (player.character === 'iron') {
    scheduleDelayedUltimate(player, 'iron', now, Number(def.ultimateDelay) || 2);
    activated = true;
  } else if (player.character === 'water') {
    // Flood is an instantaneous radial pulse. Snapshot the caster position at the exact
    // activation moment so movement after the cast cannot change who was inside the 16 m area.
    const centerX = player.x, centerY = player.y;
    const radius = Number(def.ultimateRadius) || 16;
    const heal = Number(def.ultimateHeal) || 150;
    const damage = Number(def.ultimateDamage) || 25;
    const stunMs = (Number(def.ultimateStunDuration) || 1) * 1000;
    for (const target of room.players.values()) {
      if (!target.alive) continue;
      if (distance(centerX, centerY, target.x, target.y) > radius + 1e-9) continue;
      if (target.team === player.team) {
        // Includes Water herself. Ultimate healing never charges the next ultimate and does
        // not trigger the healer-role bonus self-sustain a second time.
        applyHealing(room, player, target, heal, now, { countsForUltimate: false, suppressHealerSelfHeal: true });
        continue;
      }
      dealDamageDetailed(room, player.id, target, damage, now, { countsForUltimate: false });
      if (target.hp <= 0) {
        registerDirectKill(room, player.id, now);
        die(room, target, now);
        continue;
      }
      // Reuse the normal stun status: movement, attacks and new actions are blocked, while
      // persistent effects such as already-active ultimates and Buffer links are not cleared.
      applyStatus(room, player, target, 'stun', stunMs, now);
    }
    activated = true;
  } else if (player.character === 'shooter' || player.character === 'sniper' || player.character === 'fire' || player.character === 'runner' || player.character === 'cannon' || player.character === 'reactor' || player.character === 'spray' || player.character === 'wind' || player.character === 'buffer' || player.character === 'light' || player.character === 'laser' || player.character === 'solar') {
    player.ultimateUntil = now + (Number(def.ultimateDuration) || 8) * 1000;
    if (player.character === 'jet') player.jetBoostCooldownUntil = now;
    activated = true;
  } else if (player.character === 'mecha') {
    player.mechaSelfDestructAt = now + (Number(def.ultimateDelay) || 4) * 1000;
    player.ultimateUntil = player.mechaSelfDestructAt;
    activated = true;
  } else if (player.character === 'jet') {
    player.jetBoostCooldownUntil = now;
    player.ultimateUntil = now + (Number(def.ultimateDuration) || 8) * 1000;
    activated = true;
  } else if (player.character === 'shield') {
    for (const target of room.players.values()) {
      if (!target.alive || target.team !== player.team) continue;
      applyShield(room, player, target, Number(def.ultimateShield) || 300, { now });
      target.shieldUntil = Math.max(Number(target.shieldUntil) || 0, now + (Number(def.ultimateShieldDuration) || 3) * 1000);
      if (target.character === 'jet') target.jetShieldUntil = target.shieldUntil;
    }
    activated = true;
  } else if (player.character === 'poison') {
    const radius = Number(def.ultimateRadius) || 12;
    for (const target of room.players.values()) {
      if (!target.alive || target.team === player.team || target.id === player.id) continue;
      if (distance(player.x, player.y, target.x, target.y) > radius + 1e-9) continue;
      const result = dealDamageDetailed(room, player.id, target, Number(def.ultimateDamage) || 50, now, { countsForUltimate: false });
      if (result.total > 0) applyStatus(room, player, target, 'poison', (Number(def.ultimatePoisonDuration) || 3) * 1000, now, { healReduction: 1, fullBlock: true });
      if (target.hp <= 0) {
        registerDirectKill(room, player.id, now);
        die(room, target, now);
      }
    }
    activated = true;
  } else if (player.character === 'star') {
    scheduleDelayedUltimate(player, 'star', now, Number(def.ultimateDelay) || 2);
    activated = true;
  } else if (player.character === 'angel') {
    const target = (targetId && room.players.get(String(targetId)) && room.players.get(String(targetId)).alive && room.players.get(String(targetId)).team === player.team)
      ? room.players.get(String(targetId))
      : player;
    player.ultimateUntil = now + (Number(def.ultimateDuration) || 3) * 1000;
    target.invulnerableUntil = Math.max(Number(target.invulnerableUntil) || 0, player.ultimateUntil);
    recordSupportContribution(player, target, now);
    activated = true;
  } else if (player.character === 'ice') {
    scheduleDelayedUltimate(player, 'ice', now, Number(def.ultimateDelay) || 2);
    activated = true;
  } else if (player.character === 'dia') {
    // Crystal Burst is independent from Dia's normal form-change ability.
    // The first radial volley is immediate; the next two are emitted from Dia's
    // then-current position at one-second intervals.
    player.diaUltimateVolleySeq = 0;
    spawnDiaUltimateVolley(room, player, now);
    player.diaUltimateBurstsRemaining = Math.max(0, (Number(def.ultimateVolleyCount) || 3) - 1);
    player.diaUltimateNextBurstAt = player.diaUltimateBurstsRemaining > 0
      ? now + (Number(def.ultimateVolleyInterval) || 1) * 1000
      : 0;
    activated = true;
  }

  if (!activated) return false;
  player.ultimateCharge = 0;
  player.ultimateUseSeq = (player.ultimateUseSeq || 0) + 1;
  ensureMatchStats(player).ultimateUses += 1;
  appendCompetitiveMatchEvent(room, 'ultimate', { playerId: player.id, playerName: player.name, team: player.team, character: player.character, targetId: targetId || null }, now);
  return true;
}


function dealDamageDetailed(room, attackerId, target, amount, now, options = null) {
  const incoming = Math.max(0, Number(amount) || 0);
  if (incoming <= 0 || !target || !target.alive || target.invulnerableUntil > now) return { total: 0, hp: 0, shield: 0 };
  // Defensive-role tuning: selected tanks use authoritative incoming-damage multipliers for
  // every damage path that reaches this resolver (projectiles, beams, DoT, etc.).
  // These remain intentionally hidden from student-facing trait text.
  const damageTakenMultiplier = Number(DAMAGE_TAKEN_MULTIPLIERS[target.character]) || 1;
  const raw = incoming * damageTakenMultiplier;
  let remaining = raw;
  const shieldBefore = Math.max(0, Number(target.shield) || 0);
  const shieldDamage = Math.min(shieldBefore, remaining);
  if (shieldDamage > 0) {
    consumeShieldAttribution(room, target, shieldDamage, shieldBefore);
    target.shield = shieldBefore - shieldDamage;
    remaining -= shieldDamage;
    if (target.shield <= 1e-9) clearShield(target);
  }
  const hpBefore = Math.max(0, target.hp);
  const hpDamage = Math.min(hpBefore, remaining);
  if (hpDamage > 0) target.hp = hpBefore - hpDamage;
  const total = shieldDamage + hpDamage;
  if (total <= 0) return { total: 0, hp: 0, shield: 0 };
  const attacker = room.players.get(attackerId);
  if (attacker && attacker.team !== target.team) {
    if (!target.damageContributors || typeof target.damageContributors !== 'object') target.damageContributors = Object.create(null);
    target.damageContributors[attacker.id] = now;
    target.lastDamageAttackerId = attacker.id;
    target.lastDamageAt = now;
  }
  const targetStats = ensureMatchStats(target);
  targetStats.damageTaken += total;
  targetStats.hpDamageTaken += hpDamage;
  targetStats.shieldDamageTaken += shieldDamage;
  if (attacker) {
    const attackerStats = ensureMatchStats(attacker);
    attackerStats.damage += total;
    attackerStats.hpDamage += hpDamage;
    attackerStats.shieldDamage += shieldDamage;
    const countsForUltimate = !options || options.countsForUltimate !== false;
    if (countsForUltimate && attacker.team !== target.team) grantUltimateCharge(attacker, total, now);
  }
  markCombat(room, attackerId, target, now);
  return { total, hp: hpDamage, shield: shieldDamage };
}
function dealDamage(room, attackerId, target, amount, now, options = null) { return dealDamageDetailed(room, attackerId, target, amount, now, options).total; }

function queueHealerNumberFeedback(healer, amount, now) {
  const value = Math.max(0, Number(amount) || 0);
  if (!healer || value <= 0) return;
  healer.healNumberPending = Math.max(0, Number(healer.healNumberPending) || 0) + value;
  if (!(Number(healer.healNumberFlushAt) > now)) healer.healNumberFlushAt = now + HEAL_NUMBER_INTERVAL_MS;
}

function flushHealerNumberFeedback(room, now) {
  if (!room || room.state !== 'playing') return 0;
  let sent = 0;
  for (const healer of room.players.values()) {
    const amount = Math.max(0, Number(healer.healNumberPending) || 0);
    const flushAt = Math.max(0, Number(healer.healNumberFlushAt) || 0);
    if (amount <= 0 || flushAt <= 0 || now < flushAt) continue;
    healer.healNumberPending = 0;
    healer.healNumberFlushAt = 0;
    const conn = room.clients.get(healer.id);
    if (!conn || healer.connected === false) continue;
    // One tiny private event, at most 5 Hz per actively healing player. The displayed
    // amount is the actual ally HP restored in the completed 200 ms window.
    if (conn.send({ type: 'heal_number', amount: roundWireNumber(amount, 1) }, 'heal_number')) sent += 1;
  }
  return sent;
}

function applyHealing(room, healer, target, amount, now, options = null) {
  const raw = Math.max(0, Number(amount) || 0);
  if (!target || !target.alive || raw <= 0) return 0;
  const before = Math.max(0, target.hp);
  const missing = Math.max(0, target.maxHp - before);
  if (missing <= 0) return 0;

  const fullBlock = getStatus(target, 'poison', now);
  if (fullBlock && fullBlock.data && fullBlock.data.fullBlock) {
    const prevented = Math.min(missing, raw);
    if (prevented > 0 && room && room.players) {
      const source = room.players.get(fullBlock.sourceId);
      if (source && source.character === 'poison') ensureMatchStats(source).healingPrevented += prevented;
    }
    return 0;
  }

  let effectiveRaw = raw;
  // Harmful anti-heal effects use simple additive reduction. Natural noncombat regen
  // and self-healing do not use this external-healing reduction path.
  const burn = getStatus(target, 'burn', now);
  const poison = getStatus(target, 'poison', now);
  const radiation = getStatus(target, 'radiation', now);
  if (healer && healer.id !== target.id && (burn || poison || radiation)) {
    const burnReduction = burn ? clamp(Number(burn.data && burn.data.healReduction) || CHARACTERS.fire.burnHealReduction, 0, 1) : 0;
    const poisonReduction = poison ? clamp(Number(poison.data && poison.data.healReduction) || CHARACTERS.poison.poisonHealReduction, 0, 1) : 0;
    const radiationReduction = radiation ? clamp(Number(radiation.data && radiation.data.healReduction) || CHARACTERS.reactor.radiationHealReduction, 0, 1) : 0;
    const nominalReduction = Math.max(0, burnReduction + poisonReduction + radiationReduction);
    const totalReduction = Math.min(MAX_EXTERNAL_HEAL_REDUCTION, nominalReduction);
    effectiveRaw = raw * (1 - totalReduction);

    // Credit prevented healing proportionally to each additive source. The actual
    // anti-heal is globally capped at 80%, while attribution still follows each
    // source's share of the uncapped additive reduction.
    const withoutReduction = Math.min(missing, raw);
    const withReduction = Math.min(missing, effectiveRaw);
    const prevented = Math.max(0, withoutReduction - withReduction);
    if (prevented > 0 && nominalReduction > 0) {
      if (poison && poisonReduction > 0) {
        const source = room.players.get(poison.sourceId);
        if (source && source.character === 'poison') ensureMatchStats(source).healingPrevented += prevented * (poisonReduction / nominalReduction);
      }
    }
  }

  const actual = Math.min(missing, effectiveRaw);
  if (actual <= 0) return 0;
  target.hp = before + actual;
  ensureMatchStats(target).healingReceived += actual;
  if (healer) {
    const healerStats = ensureMatchStats(healer);
    healerStats.healing += actual;
    if (healer.id !== target.id && healer.team === target.team) recordSupportContribution(healer, target, now);
    if (healer.id === target.id) healerStats.selfHealing += actual;
    else healerStats.allyHealing += actual;
    const countsForUltimate = !options || options.countsForUltimate !== false;
    const isSelfOrAlly = healer.id === target.id || healer.team === target.team;
    if (countsForUltimate && isSelfOrAlly) grantUltimateCharge(healer, actual, now);

    const isOtherAlly = healer.id !== target.id && healer.team === target.team;
    const healerDef = CHARACTERS[healer.character];

    // Private healer HUD feedback: only effective healing delivered to another ally is
    // accumulated. Generic 25% self-healing therefore never appears as a floating number.
    if (isOtherAlly && healerDef?.role === '힐러') queueHealerNumberFeedback(healer, actual, now);

    // Generic effective-healing feedback. This intentionally fires only for healing another ally:
    // self-healing (including the healer-role 25% sustain below) is silent. The existing compact
    // healHitSeq + lastHealTargetId fields are reused, so no new recurring WebSocket field is added.
    // Continuous beam/link heals are authority-throttled to avoid audio spam on 50 Hz healing ticks.
    if (isOtherAlly && now - (healer.lastHealFeedbackAt || 0) >= HEAL_FEEDBACK_INTERVAL_MS) {
      healer.lastHealFeedbackAt = now;
      healer.healHitSeq = (healer.healHitSeq || 0) + 1;
      healer.lastHealTargetId = target.id;
    }

    // Generic healer-role sustain rule: when a healer restores actual HP to a different
    // living ally, the healer restores 25% of that effective healing to themselves.
    // Overhealing does not count because `actual` is already capped by the ally's missing HP.
    // Calling applyHealing on self is safe: self-healing bypasses external anti-heal and the
    // target===healer guard below prevents recursive self-heal generation.
    const suppressHealerSelfHeal = !!(options && options.suppressHealerSelfHeal);
    if (!suppressHealerSelfHeal && healer.alive && healerDef?.role === '힐러' && isOtherAlly && HEALER_ALLY_SELF_HEAL_RATIO > 0) {
      applyHealing(room, healer, healer, actual * HEALER_ALLY_SELF_HEAL_RATIO, now, options);
    }
  }
  return actual;
}

function traceBeam(room, player, def, dt, now) {
  let dx = player.aimX - player.x, dy = player.aimY - player.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return;
  dx /= len; dy /= len;

  const x1 = player.x, y1 = player.y;
  const x2 = x1 + dx * def.range, y2 = y1 + dy * def.range;
  let bestT = 1, hit = null;

  // World boundary stops the beam. The shooter is always inside the world bounds.
  if (Math.abs(dx) > 1e-12) {
    const tx = dx > 0 ? (WORLD.width - x1) / (dx * def.range) : (0 - x1) / (dx * def.range);
    if (tx >= 0 && tx < bestT) { bestT = tx; hit = { kind: 'wall' }; }
  }
  if (Math.abs(dy) > 1e-12) {
    const ty = dy > 0 ? (WORLD.height - y1) / (dy * def.range) : (0 - y1) / (dy * def.range);
    if (ty >= 0 && ty < bestT) { bestT = ty; hit = { kind: 'wall' }; }
  }

  for (const w of WALLS) {
    const t = segmentAabbT(x1, y1, x2, y2, w.x, w.y, w.x + w.w, w.y + w.h);
    if (t !== null && t > 1e-6 && t < bestT) { bestT = t; hit = { kind: 'wall' }; }
  }

  for (const target of room.players.values()) {
    if (!target.alive || getTargetRelation(player, target) !== TARGET_RELATION.ENEMY) continue;
    const tr = CHARACTERS[target.character].radius;
    const t = segmentCircleT(x1, y1, x2, y2, target.x, target.y, tr);
    if (t !== null && t > 1e-6 && t < bestT) { bestT = t; hit = { kind: 'player', target }; }
  }

  const endX = x1 + (x2 - x1) * bestT;
  const endY = y1 + (y2 - y1) * bestT;
  let didDamage = false;

  if (hit && hit.kind === 'player') {
    const target = hit.target;
    if (target.invulnerableUntil <= now) {
      const dps = def.beamDps + target.maxHp * (def.maxHpDpsRatio || 0);
      didDamage = dealDamage(room, player.id, target, dps * dt, now) > 0;
      if (def.slowTierDelta < 0) applyStatus(room, player, target, 'slow', def.slowDuration * 1000, now, { tierDelta: def.slowTierDelta });
      if (def.poisonHealReduction > 0) applyStatus(room, player, target, 'poison', def.poisonDuration * 1000, now, { healReduction: def.poisonHealReduction });
      if (target.hp <= 0) {
        registerDirectKill(room, player.id, now);
        die(room, target, now);
      }
    }
  }
  room.beams.push({ ownerId: player.id, team: player.team, character: player.character, x1, y1, x2: endX, y2: endY, impact: hit ? hit.kind : null, hitEnemyId: hit && hit.kind === 'player' ? hit.target.id : null, didDamage });
}

function traceLightBeam(room, player, def, dt, now) {
  let dx = player.aimX - player.x, dy = player.aimY - player.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return;
  dx /= len; dy /= len;

  const x1 = player.x, y1 = player.y;
  const x2 = x1 + dx * def.range, y2 = y1 + dy * def.range;
  let wallT = 1;

  // World boundary and solid walls stop Light's beam.
  if (Math.abs(dx) > 1e-12) {
    const tx = dx > 0 ? (WORLD.width - x1) / (dx * def.range) : (0 - x1) / (dx * def.range);
    if (tx >= 0 && tx < wallT) wallT = tx;
  }
  if (Math.abs(dy) > 1e-12) {
    const ty = dy > 0 ? (WORLD.height - y1) / (dy * def.range) : (0 - y1) / (dy * def.range);
    if (ty >= 0 && ty < wallT) wallT = ty;
  }
  for (const w of WALLS) {
    const t = segmentAabbT(x1, y1, x2, y2, w.x, w.y, w.x + w.w, w.y + w.h);
    if (t !== null && t > 1e-6 && t < wallT) wallT = t;
  }

  const hits = [];
  for (const target of room.players.values()) {
    if (!target.alive || target.id === player.id) continue;
    const tr = CHARACTERS[target.character].radius;
    const t = segmentCircleT(x1, y1, x2, y2, target.x, target.y, tr);
    if (t !== null && t > 1e-6 && t < wallT) hits.push({ t, target });
  }
  hits.sort((a, b) => a.t - b.t || a.target.id.localeCompare(b.target.id));

  let healedAlly = null;
  let enemyHit = null;
  let endT = wallT;
  for (const hit of hits) {
    const target = hit.target;
    const relation = getTargetRelation(player, target);
    if (relation === TARGET_RELATION.ALLY) {
      if (!healedAlly) healedAlly = target;
      continue;
    }
    if (relation !== TARGET_RELATION.ENEMY) continue;
    enemyHit = target;
    endT = hit.t;
    break;
  }

  if (healedAlly) applyHealing(room, player, healedAlly, def.healHps * dt, now);
  let didDamage = false;
  if (enemyHit && enemyHit.invulnerableUntil <= now) {
    didDamage = dealDamage(room, player.id, enemyHit, def.beamDps * dt, now) > 0;
    if (enemyHit.hp <= 0) {
      registerDirectKill(room, player.id, now);
      die(room, enemyHit, now);
    }
  }

  const endX = x1 + (x2 - x1) * endT;
  const endY = y1 + (y2 - y1) * endT;
  room.beams.push({
    ownerId: player.id, team: player.team, character: player.character,
    x1, y1, x2: endX, y2: endY, healedId: healedAlly ? healedAlly.id : null, hitEnemyId: enemyHit ? enemyHit.id : null, impact: enemyHit ? 'player' : (wallT < 1 ? 'wall' : null), didDamage
  });
}


function resetProjectileNetState(room) {
  if (!room) return;
  if (!(room.projectileNetPendingSpawns instanceof Set)) room.projectileNetPendingSpawns = new Set();
  else room.projectileNetPendingSpawns.clear();
  if (!(room.projectileNetPendingRemoves instanceof Set)) room.projectileNetPendingRemoves = new Set();
  else room.projectileNetPendingRemoves.clear();
  room.lastProjectileNetSyncAt = 0;
}

function noteProjectileSpawn(room, projectile) {
  if (!room || !projectile) return;
  if (!(room.projectileNetPendingSpawns instanceof Set)) room.projectileNetPendingSpawns = new Set();
  if (!(room.projectileNetPendingRemoves instanceof Set)) room.projectileNetPendingRemoves = new Set();
  room.projectileNetPendingRemoves.delete(projectile.id);
  room.projectileNetPendingSpawns.add(projectile.id);
}

function removeProjectile(room, id) {
  if (!room || !room.projectiles) return false;
  const projectile = room.projectiles.get(id);
  if (!projectile) return false;
  room.projectiles.delete(id);
  if (!(room.projectileNetPendingSpawns instanceof Set)) room.projectileNetPendingSpawns = new Set();
  if (!(room.projectileNetPendingRemoves instanceof Set)) room.projectileNetPendingRemoves = new Set();
  if (room.projectileNetPendingSpawns.has(id)) {
    // Spawned and removed before the next delivered live snapshot: the browser never
    // observed it, so suppress both lifecycle events.
    room.projectileNetPendingSpawns.delete(id);
  } else {
    room.projectileNetPendingRemoves.add(id);
  }
  return true;
}

function clearProjectiles(room) {
  if (!room || !room.projectiles) return;
  room.projectiles.clear();
  resetProjectileNetState(room);
}

function projectileWireRow(p) {
  return [
    p.id,
    roundWireNumber(p.x, 3),
    roundWireNumber(p.y, 3),
    roundWireNumber(p.vx, 3),
    roundWireNumber(p.vy, 3),
    roundWireNumber(p.radius, 3),
    p.type === 'heal' ? 1 : 0,
    p.team === 'B' ? 1 : 0,
    p.character || null,
    p.reactorFxBand == null ? null : p.reactorFxBand,
    p.ultimateProjectile ? 1 : 0,
    p.diaUltimateVolleyId || null
  ];
}

function spawnProjectileFromDirection(room, player, def, now, dx, dy, options = {}) {
  if (Math.hypot(dx, dy) < 0.001) return null;
  const projectileRadius = Number(options.projectileRadius ?? def.projectileRadius) || 0;
  const startOffset = def.radius + projectileRadius + 0.04;
  const x = Number.isFinite(options.startX) ? options.startX : player.x + dx * startOffset;
  const y = Number.isFinite(options.startY) ? options.startY : player.y + dy * startOffset;
  const id = `B${room.projectileCounter++}`;
  room.projectiles.set(id, {
    id, ownerId: player.id, team: player.team, character: player.character,
    type: options.projectileType || def.projectileType,
    x, y,
    vx: dx * def.projectileSpeed,
    vy: dy * def.projectileSpeed,
    radius: projectileRadius,
    damage: Number(options.damage ?? def.damage) || 0,
    distanceDamage: !!def.distanceDamage,
    distanceDamageBands: Array.isArray(def.distanceDamageBands) ? def.distanceDamageBands.map(b => ({ ...b })) : null,
    heal: Number(options.heal ?? def.heal) || 0,
    range: def.range,
    traveled: 0,
    burnDps: def.burnDps || 0,
    burnDuration: def.burnDuration || 0,
    countsForUltimate: options.countsForUltimate === undefined ? !isUltimateActive(player, now) : options.countsForUltimate !== false,
    ultimateProjectile: !!options.ultimateProjectile,
    diaUltimateVolleyId: options.diaUltimateVolleyId || null,
    reactorFxBand: player.character === 'reactor' ? reactorStageForOutput(CHARACTERS.reactor, player.reactorOutput) - 1 : null,
    bornAt: now
  });
  if (options.sprayLane) room.projectiles.get(id).sprayLane = options.sprayLane;
  if (options.sprayVolleyId) room.projectiles.get(id).sprayVolleyId = options.sprayVolleyId;
  noteProjectileSpawn(room, room.projectiles.get(id));
  return id;
}

function spawnProjectile(room, player, def, now) {
  let dx = player.aimX - player.x, dy = player.aimY - player.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return;
  dx /= len; dy /= len;
  player.shotSeq = (player.shotSeq || 0) + 1;
  spawnProjectileFromDirection(room, player, def, now, dx, dy);
}

function spraySideOriginClear(player, x, y, projectileRadius) {
  const r = Math.max(0, Number(projectileRadius) || 0);
  if (x < r || x > WORLD.width - r || y < r || y > WORLD.height - r) return false;
  if (collidesWall(x, y, r)) return false;
  for (const w of WALLS) {
    const t = segmentAabbT(player.x, player.y, x, y, w.x - r, w.y - r, w.x + w.w + r, w.y + w.h + r);
    if (t !== null && t > 1e-6 && t <= 1 + 1e-9) return false;
  }
  return true;
}

function spawnSprayVolley(room, player, def, now) {
  let dx = player.aimX - player.x, dy = player.aimY - player.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return 0;
  dx /= len; dy /= len;

  const angle = (Number(def.spraySideAngleDeg) || 10) * Math.PI / 180;
  const offset = Math.max(0, Number(def.spraySideOffset) || 1.2);
  const sideRadius = Math.max(0, Number(def.spraySideProjectileRadius) || 0.20);
  const sideDamage = Math.max(0, Number(def.spraySideDamage) || 0);
  const leftX = -dy, leftY = dx;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const leftDx = dx * cos - dy * sin, leftDy = dx * sin + dy * cos;
  const rightDx = dx * cos + dy * sin, rightDy = -dx * sin + dy * cos;

  player.shotSeq = (player.shotSeq || 0) + 1;
  const volleyId = `V${room.sprayVolleyCounter++}`;
  let spawned = 0;
  if (spawnProjectileFromDirection(room, player, def, now, dx, dy, { sprayLane: 'center', sprayVolleyId: volleyId })) spawned += 1;

  const lx = player.x + leftX * offset, ly = player.y + leftY * offset;
  if (spraySideOriginClear(player, lx, ly, sideRadius)) {
    if (spawnProjectileFromDirection(room, player, def, now, leftDx, leftDy, { startX: lx, startY: ly, projectileRadius: sideRadius, damage: sideDamage, sprayLane: 'left', sprayVolleyId: volleyId })) spawned += 1;
  }
  const rx = player.x - leftX * offset, ry = player.y - leftY * offset;
  if (spraySideOriginClear(player, rx, ry, sideRadius)) {
    if (spawnProjectileFromDirection(room, player, def, now, rightDx, rightDy, { startX: rx, startY: ry, projectileRadius: sideRadius, damage: sideDamage, sprayLane: 'right', sprayVolleyId: volleyId })) spawned += 1;
  }
  return spawned;
}

function spawnSolarProjectile(room, player, def, now) {
  let dx = player.aimX - player.x, dy = player.aimY - player.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return;
  dx /= len; dy /= len;
  const startOffset = def.radius + def.solarProjectileRadius + 0.04;
  const id = `B${room.projectileCounter++}`;
  player.shotSeq = (player.shotSeq || 0) + 1;
  room.projectiles.set(id, {
    id, ownerId: player.id, team: player.team, character: player.character,
    type: 'attack',
    x: player.x + dx * startOffset,
    y: player.y + dy * startOffset,
    vx: dx * def.solarProjectileSpeed,
    vy: dy * def.solarProjectileSpeed,
    radius: def.solarProjectileRadius,
    damage: def.solarProjectileDamage,
    distanceDamage: false,
    distanceDamageBands: null,
    heal: 0,
    selfHealOnHit: def.solarSelfHeal,
    range: def.solarProjectileRange,
    traveled: 0,
    burnDps: 0,
    burnDuration: 0,
    bornAt: now
  });
  noteProjectileSpawn(room, room.projectiles.get(id));
}

function updateProjectiles(room, dt, now) {
  for (const [id, p] of [...room.projectiles.entries()]) {
    const step = p.range - p.traveled;
    if (step <= 0) { removeProjectile(room, id); continue; }
    let dx = p.vx * dt, dy = p.vy * dt;
    let moveLen = Math.hypot(dx, dy);
    if (moveLen > step) { const s = step / moveLen; dx *= s; dy *= s; moveLen = step; }
    const x2 = p.x + dx, y2 = p.y + dy;
    let bestT = 1.000001, hit = null;

    // World boundary is treated as a wall.
    if (x2 < p.radius || x2 > WORLD.width - p.radius || y2 < p.radius || y2 > WORLD.height - p.radius) {
      bestT = 0.999; hit = { kind: 'wall' };
    }
    for (const w of WALLS) {
      const t = segmentAabbT(p.x, p.y, x2, y2, w.x - p.radius, w.y - p.radius, w.x + w.w + p.radius, w.y + w.h + p.radius);
      if (t !== null && t < bestT) { bestT = t; hit = { kind: 'wall' }; }
    }
    for (const target of room.players.values()) {
      if (!target.alive || target.id === p.ownerId) continue;
      const owner = room.players.get(p.ownerId);
      const relation = owner ? getTargetRelation(owner, target) : (target.team === p.team ? TARGET_RELATION.ALLY : TARGET_RELATION.ENEMY);
      // Alpha 1.4: healing projectiles are dual-purpose without creating a second projectile.
      // They still use the same lifecycle/network row; the server decides the effect on first contact:
      // ally -> existing heal, enemy -> fixed projectile damage. Legacy heal-only projectiles remain ally-only.
      const hybridHealProjectile = p.type === 'heal' && p.heal > 0 && p.damage > 0;
      const valid = p.type === 'attack'
        ? relation === TARGET_RELATION.ENEMY
        : (hybridHealProjectile
          ? (relation === TARGET_RELATION.ALLY || relation === TARGET_RELATION.ENEMY)
          : relation === TARGET_RELATION.ALLY);
      if (!valid) continue;
      const tr = CHARACTERS[target.character].radius;
      // Generic School Line rule for every current/future dual-purpose healing projectile:
      // ally collision uses 140% of the ally body radius, while enemy collision stays 100%.
      // Projectile radius/visual size/lifecycle data are unchanged.
      const targetRadiusMultiplier = hybridHealProjectile && relation === TARGET_RELATION.ALLY
        ? DUAL_PURPOSE_HEAL_ALLY_RADIUS_MULTIPLIER
        : 1;
      const t = segmentCircleT(p.x, p.y, x2, y2, target.x, target.y, tr * targetRadiusMultiplier + p.radius);
      if (t !== null && t < bestT) { bestT = t; hit = { kind: 'player', target }; }
    }

    if (hit) {
      p.x += dx * Math.min(bestT, 1); p.y += dy * Math.min(bestT, 1);
      if (hit.kind === 'player') {
        const t = hit.target;
        if (p.diaUltimateVolleyId) {
          if (!(t.diaUltimateVolleyHits instanceof Map)) t.diaUltimateVolleyHits = new Map();
          for (const [key, expiry] of t.diaUltimateVolleyHits) if (Number(expiry) <= now) t.diaUltimateVolleyHits.delete(key);
          if (t.diaUltimateVolleyHits.has(p.diaUltimateVolleyId)) {
            // A body still physically absorbs the duplicate shard, but each target can
            // take damage only once from a single 16-projectile radial volley.
            removeProjectile(room, id);
            continue;
          }
          t.diaUltimateVolleyHits.set(p.diaUltimateVolleyId, now + 3000);
        }
        if (p.type === 'attack') {
          if (t.invulnerableUntil <= now) {
            const impactDistance = p.traveled + moveLen * Math.min(bestT, 1);
            const hitDamage = p.distanceDamage ? resolveDistanceDamage(p.distanceDamageBands, impactDistance, p.damage) : p.damage;
            const damageResult = dealDamageDetailed(room, p.ownerId, t, hitDamage, now, { countsForUltimate: p.countsForUltimate !== false });
            if (damageResult.total > 0) {
              const owner = room.players.get(p.ownerId);
              if (owner) {
                owner.projectileHitSeq = (owner.projectileHitSeq || 0) + 1;
                if (owner.character === 'sniper' && impactDistance > 16) {
                  ensureMatchStats(owner).sniperLongRangeDamage += damageResult.total;
                }
              }
            }
            const reactorOwner = room.players.get(p.ownerId);
            if (damageResult.hp > 0 && reactorOwner && reactorOwner.alive && reactorOwner.character === 'reactor') {
              const reactorDef = CHARACTERS.reactor;
              reactorOwner.reactorOutput = clamp(
                Number(reactorOwner.reactorOutput || 0) + damageResult.hp / reactorDef.reactorDamagePerOutput,
                0, 100
              );
              reactorOwner.reactorLastDamageAt = now;
              if (reactorStageForOutput(reactorDef, reactorOwner.reactorOutput) === 3) {
                applyStatus(room, reactorOwner, t, 'radiation', reactorDef.radiationDuration * 1000, now, { healReduction: reactorDef.radiationHealReduction });
              }
            }
            // Solar self-heal requires actual HP damage; shield-only hits do not count.
            if (damageResult.hp > 0 && p.selfHealOnHit > 0) {
              const owner = room.players.get(p.ownerId);
              if (owner && owner.alive) {
                const actualSelfHeal = applyHealing(room, owner, owner, p.selfHealOnHit, now);
                if (actualSelfHeal > 0 && owner.character === 'solar') {
                  ensureMatchStats(owner).solarProjectileHealing += actualSelfHeal;
                }
              }
            }
            if (p.burnDps > 0) {
              const owner = room.players.get(p.ownerId);
              applyStatus(room, owner, t, 'burn', p.burnDuration * 1000, now, {
                dps: p.burnDps,
                healReduction: Number(CHARACTERS[p.character]?.burnHealReduction) || 0,
                countsForUltimate: p.countsForUltimate !== false
              });
            }
            if (t.hp <= 0) {
              registerDirectKill(room, p.ownerId, now);
              die(room, t, now);
            }
          }
        } else {
          const healer = room.players.get(p.ownerId);
          const relation = healer ? getTargetRelation(healer, t) : (t.team === p.team ? TARGET_RELATION.ALLY : TARGET_RELATION.ENEMY);
          if (relation === TARGET_RELATION.ENEMY && p.damage > 0) {
            // Alpha 1.4 healer attack participation: the existing healing projectile damages
            // an enemy on first contact. No extra projectile or recurring wire field is created.
            if (t.invulnerableUntil <= now) {
              const damageResult = dealDamageDetailed(room, p.ownerId, t, p.damage, now);
              if (damageResult.total > 0 && healer) {
                healer.projectileHitSeq = (healer.projectileHitSeq || 0) + 1;
              }
              if (t.hp <= 0) {
                registerDirectKill(room, p.ownerId, now);
                die(room, t, now);
              }
            }
          } else if (relation === TARGET_RELATION.ALLY) {
            applyHealing(room, healer, t, p.heal, now);
          }
        }
      }
      removeProjectile(room, id);
      continue;
    }
    p.x = x2; p.y = y2; p.traveled += moveLen;
    if (p.traveled >= p.range - 1e-6) removeProjectile(room, id);
  }
}

function closeEndedRoom(room) {
  if (!room || room.state !== 'ended') return false;
  if (room.matchMode === 'competitive' && room.competitive && !room.competitive.recorded) {
    // Never destroy the only in-memory copy of a finished competitive match before PostgreSQL confirms it.
    // Keep the room alive and the retry queue running until durable insertion succeeds.
    room.postGameDeleteAt = Date.now() + Math.max(3000, COMPETITIVE_PERSIST_RETRY_MS);
    return false;
  }
  const connections = new Set([...room.clients.values(), ...room.spectators.values()]);
  const notice = {
    type: 'room_closed',
    code: 'match_ended',
    message: '경기가 종료되어 방이 자동으로 닫혔습니다.'
  };

  // Send an explicit final notice before closing sockets so clients can clear
  // reconnect credentials and return to the join screen without a false
  // "connection lost" warning.
  for (const conn of connections) {
    try { conn.send(notice, 'room_closed'); } catch (_) {}
  }

  clearProjectiles(room);
  room.beams = [];
  room.postGameDeleteAt = 0;
  room.clients.clear();
  room.spectators.clear();
  room.players.clear();
  room.hostId = null;
  rooms.delete(room.code);

  // Detach connection identity before transport close. The socket close handler
  // can then call disconnect() safely without trying to mutate the deleted room.
  for (const conn of connections) {
    conn.playerId = null;
    conn.spectatorId = null;
    conn.roomCode = null;
    try { conn.close(); } catch (_) {}
  }
  return true;
}

function updateRoom(room, dt, now) {
  const competitiveFlowChanged = updateCompetitiveFlow(room, now);
  if (competitiveFlowChanged) broadcast(room, now);
  if (room.state === 'ended') {
    const closeAt = Number(room.postGameDeleteAt) || (room.endedAt ? room.endedAt + POST_GAME_ROOM_CLOSE_MS : 0);
    if (closeAt && now >= closeAt) closeEndedRoom(room);
    return;
  }
  if (room.state !== 'playing') return;
  if (now >= room.matchEndAt) {
    room.state = 'ended';
    room.endedAt = now;
    room.postGameDeleteAt = now + POST_GAME_ROOM_CLOSE_MS;
    const resolved = resolveMatchWinner(room);
    room.winner = resolved.winner;
    room.winnerReason = resolved.reason;
    clearProjectiles(room);
    room.beams = [];
    for (const p of room.players.values()) p.input.fire = false;
    if (room.matchMode === 'competitive') recordCompetitiveResult(room, now);
    // Idle/ended heartbeat is disabled, so every mode receives one explicit final state.
    // The client shows the winner announcement locally and then opens the result screen.
    broadcast(room, now);
    return;
  }

  flushHealerNumberFeedback(room, now);
  updatePerkSystem(room, now);

  // Alpha 1.6.1: universal time-based ultimate safety net.
  // Every four seconds, each player receives 3% of that character's ultimate cost.
  // Death does not pause this clock. Sustained/self-buff ultimates still lock charge at 0,
  // so scheduled ticks that land during an active ultimate are intentionally skipped.
  if (!Number.isFinite(room.nextUltimateAutoChargeAt) || room.nextUltimateAutoChargeAt <= 0) {
    room.nextUltimateAutoChargeAt = Math.max(Number(room.matchStartedAt) || now, now) + ULTIMATE_AUTO_CHARGE_INTERVAL_MS;
  }
  while (now + 1e-9 >= room.nextUltimateAutoChargeAt) {
    const chargeAt = room.nextUltimateAutoChargeAt;
    room.nextUltimateAutoChargeAt += ULTIMATE_AUTO_CHARGE_INTERVAL_MS;
    for (const chargePlayer of room.players.values()) {
      const cost = ultimateCostForPlayer(chargePlayer);
      if (cost <= 0 || isUltimateActive(chargePlayer, chargeAt)) continue;
      grantUltimateCharge(chargePlayer, cost * ULTIMATE_AUTO_CHARGE_RATIO, chargeAt);
    }
  }

  room.beams = [];
  for (const player of room.players.values()) {
    const def = CHARACTERS[player.character];
    const timeStats = ensureMatchStats(player);
    if (player.connected === false) timeStats.disconnectedSeconds += dt;
    if (player.alive) timeStats.aliveSeconds += dt; else timeStats.deadSeconds += dt;
    if (player.character === 'shield') updateShieldAbilityCharges(player, now);
    if (!player.alive) {
      if (now >= player.respawnAt) respawn(room, player, now);
      continue;
    }
    applyRespawnPostShield(room, player, now);
    if (player.character === 'dia' && player.diaFormUntil > 0 && now >= player.diaFormUntil) endDiaForm(player);
    if (player.character === 'reactor') {
      const reactorDef = CHARACTERS.reactor;
      if (reactorStageForOutput(reactorDef, player.reactorOutput) === 3) {
        ensureMatchStats(player).reactorStage3Seconds += dt;
      }
      if (player.reactorOutput > 0 && player.reactorLastDamageAt > 0 && !isUltimateActive(player, now) && now - player.reactorLastDamageAt >= reactorDef.reactorDecayDelay * 1000) {
        player.reactorOutput = Math.max(0, player.reactorOutput - reactorDef.reactorDecayPerSecond * dt);
      }
    }
    if (player.shieldUntil > 0 && now >= player.shieldUntil) clearShield(player);
    const burn = getStatus(player, 'burn', now);
    if (burn && player.invulnerableUntil <= now) {
      const burnDps = Math.max(0, Number(burn.data && burn.data.dps) || 0);
      const burnResult = dealDamageDetailed(room, burn.sourceId, player, burnDps * dt, now, { countsForUltimate: burn.data?.countsForUltimate !== false });
      if (burnResult.total > 0) {
        const burnSource = room.players.get(burn.sourceId);
        if (burnSource && burnSource.character === 'fire') ensureMatchStats(burnSource).burnDamage += burnResult.total;
      }
      if (player.hp <= 0) {
        registerKill(room, burn.sourceId, now, false);
        die(room, player, now);
        continue;
      }
    }

    if (player.pendingUltimateAt > 0 && now >= player.pendingUltimateAt) {
      const pendingId = player.pendingUltimateId;
      const centerX = player.x, centerY = player.y;
      player.pendingUltimateId = null;
      player.pendingUltimateAt = 0;
      player.ultimateUntil = 0;
      // Reaching this branch means the caster survived the full server-authoritative warning delay.
      resolveDelayedUltimate(room, player, pendingId, now, centerX, centerY);
      if (!player.alive) continue;
    }

    if (player.character === 'dia' && player.diaUltimateBurstsRemaining > 0 && player.diaUltimateNextBurstAt > 0 && now >= player.diaUltimateNextBurstAt) {
      const intervalMs = (Number(CHARACTERS.dia.ultimateVolleyInterval) || 1) * 1000;
      while (player.alive && player.diaUltimateBurstsRemaining > 0 && now >= player.diaUltimateNextBurstAt) {
        spawnDiaUltimateVolley(room, player, player.diaUltimateNextBurstAt);
        player.diaUltimateBurstsRemaining -= 1;
        player.diaUltimateNextBurstAt = player.diaUltimateBurstsRemaining > 0 ? player.diaUltimateNextBurstAt + intervalMs : 0;
      }
    }

    if (player.character === 'mecha' && player.mechaSelfDestructAt > 0 && now >= player.mechaSelfDestructAt) {
      const radius = Number(CHARACTERS.mecha.ultimateRadius) || 16;
      player.mechaSelfDestructAt = 0;
      player.ultimateUntil = 0;
      for (const target of room.players.values()) {
        if (!target.alive || target.team === player.team || target.id === player.id) continue;
        if (distance(player.x, player.y, target.x, target.y) > radius + 1e-9) continue;
        dealDamageDetailed(room, player.id, target, Number(CHARACTERS.mecha.ultimateDamage) || 200, now, { countsForUltimate: false });
        if (target.hp <= 0) {
          registerDirectKill(room, player.id, now);
          die(room, target, now);
        }
      }
      player.hp = Math.max(0, player.hp - (Number(CHARACTERS.mecha.ultimateSelfDamage) || 200));
      if (player.hp <= 0) {
        die(room, player, now);
        continue;
      }
    }

    if (isUltimateActive(player, now)) {
      if (player.character === 'solar') {
        const udef = CHARACTERS.solar;
        for (const target of room.players.values()) {
          if (!target.alive || target.team === player.team || target.id === player.id) continue;
          if (distance(player.x, player.y, target.x, target.y) > (Number(udef.ultimateRadius) || 24) + 1e-9) continue;
          dealDamageDetailed(room, player.id, target, (Number(udef.ultimateAuraDps) || 15) * dt, now, { countsForUltimate: false });
          if (target.hp <= 0) {
            registerKill(room, player.id, now, false);
            die(room, target, now);
          }
        }
        applyHealing(room, player, player, (Number(udef.ultimateSelfHealHps) || 30) * dt, now, { countsForUltimate: false, suppressHealerSelfHeal: true });
      } else if (player.character === 'wind') {
        const udef = CHARACTERS.wind;
        for (const target of room.players.values()) {
          if (!target.alive || target.team !== player.team) continue;
          if (distance(player.x, player.y, target.x, target.y) > (Number(udef.ultimateRadius) || 12) + 1e-9) continue;
          applyHealing(room, player, target, (Number(udef.ultimateHealHps) || 30) * dt, now, { countsForUltimate: false, suppressHealerSelfHeal: true });
        }
      }
    }

    if (player.hp < player.maxHp && now - player.lastCombatAt >= NONCOMBAT_REGEN_DELAY_MS && !isHealingFullyBlocked(player, now)) {
      player.hp = Math.min(player.maxHp, player.hp + NONCOMBAT_REGEN_HPS * dt);
    }

    if (player.character === 'jet' && player.jetBoostUntil > 0) {
      if (now < player.jetBoostUntil) {
        updateJetBoostPosition(player, now);
        continue; // Booster locks ordinary movement and basic attacks for the dash.
      }
      updateJetBoostPosition(player, player.jetBoostUntil);
      finishJetBoost(room, player, now);
    }

    const stunned = isStunned(player, now);
    let mx = stunned ? 0 : (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
    let my = stunned ? 0 : (player.input.down ? 1 : 0) - (player.input.up ? 1 : 0);
    const ml = Math.hypot(mx, my);
    if (ml > 0) { mx /= ml; my /= ml; }
    const speed = effectiveSpeed(player, now, room);
    const lockedByUltimate = player.character === 'cannon' && isUltimateActive(player, now);
    movePlayer(player, (lockedByUltimate ? 0 : mx * speed * dt), (lockedByUltimate ? 0 : my * speed * dt), def.radius);

    if (player.character === 'buffer') {
      const link = bufferLinkState(room, player, now);
      if (!link.target && player.bufferTargetId) player.bufferTargetId = null;
      if (link.active) {
        ensureMatchStats(player).bufferLinkSeconds += dt;
        recordSupportContribution(player, link.target, now);
        applyHealing(room, player, link.target, currentBufferLinkHealHps(player, now) * dt, now);
      }
    }

    if (!stunned && player.input.fire && !def.noBasicAttack) {
      const attackDef = currentAttackDef(player, now);
      if (attackDef.attackType === 'beam') {
        traceBeam(room, player, attackDef, dt, now);
        if (player.character === 'solar' && periodicActionReady(room, player, attackDef.solarFireRate, now)) {
          spawnSolarProjectile(room, player, attackDef, now);
          player.lastPeriodicActionAt = now;
          player.nextFireAt = now + 1000 / (attackDef.solarFireRate * periodicActionRateMultiplier(room, player, now));
        }
      } else if (attackDef.attackType === 'lightBeam') {
        traceLightBeam(room, player, attackDef, dt, now);
      } else if (periodicActionReady(room, player, attackDef.fireRate, now)) {
        if (player.character === 'spray') spawnSprayVolley(room, player, attackDef, now);
        else spawnProjectile(room, player, attackDef, now);
        player.lastPeriodicActionAt = now;
        player.nextFireAt = now + 1000 / (attackDef.fireRate * periodicActionRateMultiplier(room, player, now));
      }
    }
  }

  updateProjectiles(room, dt, now);

  const aAttackers = [], bDefenders = [], bAttackers = [], aDefenders = [];
  for (const p of room.players.values()) {
    if (!p.alive || p.connected === false) continue;
    if (p.y >= WORLD.bZoneStart) {
      if (p.team === 'A') aAttackers.push(p); else if (p.team === 'B') bDefenders.push(p);
    }
    if (p.y <= WORLD.aZoneEnd) {
      if (p.team === 'B') bAttackers.push(p); else if (p.team === 'A') aDefenders.push(p);
    }
  }
  const aScoring = aAttackers.length > 0 && bDefenders.length === 0;
  const bScoring = bAttackers.length > 0 && aDefenders.length === 0;

  for (const p of aAttackers) ensureMatchStats(p).enemyZoneSeconds += dt;
  for (const p of bAttackers) ensureMatchStats(p).enemyZoneSeconds += dt;
  for (const p of aDefenders) ensureMatchStats(p).ownZoneDefenseSeconds += dt;
  for (const p of bDefenders) ensureMatchStats(p).ownZoneDefenseSeconds += dt;
  if (aScoring) for (const p of aAttackers) ensureMatchStats(p).objectiveSeconds += dt;
  if (bScoring) for (const p of bAttackers) ensureMatchStats(p).objectiveSeconds += dt;
  if (aAttackers.length && bDefenders.length) {
    for (const p of aAttackers) ensureMatchStats(p).contestSeconds += dt;
    for (const p of bDefenders) ensureMatchStats(p).contestSeconds += dt;
  }
  if (bAttackers.length && aDefenders.length) {
    for (const p of bAttackers) ensureMatchStats(p).contestSeconds += dt;
    for (const p of aDefenders) ensureMatchStats(p).contestSeconds += dt;
  }

  if (aScoring) room.scoreA += dt;
  if (bScoring) room.scoreB += dt;
}

function competitivePhaseWireSnapshot(room, viewerId = null, spectator = false, now = Date.now()) {
  const viewer = viewerId ? room.players.get(viewerId) : null;
  return {
    type: 'state', wireFormat: 'd1', state: room.state, mode: normalizeRoomMode(room.mode), matchMode: room.matchMode, room: roomDisplayName(room), roomNumber: room.displayNumber,
    scoreA: roundWireNumber(room.scoreA, 3), scoreB: roundWireNumber(room.scoreB, 3), timeLeft: 0,
    players: [...room.players.values()].map(p => [p.id, p.name, p.team, p.character || null, p.connected === false ? 0 : 1]),
    projectiles: [], beams: [],
    competitive: competitiveSnapshot(room, viewer, spectator, now),
    hostId: room.hostId
  };
}

function snapshot(room, viewerId = null, spectator = false) {
  const now = Date.now();
  if (room.state === 'draft' || room.state === 'ready') return competitivePhaseWireSnapshot(room, viewerId, spectator, now);
  const viewer = viewerId ? room.players.get(viewerId) : null;
  const hideEnemyPicks = room.state === 'lobby' && room.mode !== 'competitive' && !!viewer;
  const hideAllPicks = room.state === 'lobby' && room.mode !== 'competitive' && spectator;
  const playing = room.state === 'playing';
  const ended = room.state === 'ended';

  const out = {
    type: 'state', state: room.state, mode: playing ? (room.matchMode || normalizeRoomMode(room.mode)) : normalizeRoomMode(room.mode), matchMode: room.matchMode, room: roomDisplayName(room), roomNumber: room.displayNumber,
    scoreA: room.scoreA, scoreB: room.scoreB,
    timeLeft: playing ? Math.max(0, (room.matchEndAt - now) / 1000) : 0,
    players: [...room.players.values()].map(p => {
      const hideCharacter = hideAllPicks || (hideEnemyPicks && p.team !== viewer?.team);
      const burnStatus = getStatus(p, 'burn', now);
      const radiationStatus = getStatus(p, 'radiation', now);
      const row = {
        id: p.id, name: p.name, team: p.team, character: hideCharacter ? null : p.character,
        x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp,
        shield: Math.max(0, p.shield || 0), maxShield: Math.max(0, p.maxShield || 0),
        alive: p.alive,
        aimX: p.aimX, aimY: p.aimY,
        shotSeq: p.shotSeq || 0, projectileHitSeq: p.projectileHitSeq || 0,
        healHitSeq: p.healHitSeq || 0, abilityUseSeq: p.abilityUseSeq || 0, ultimateUseSeq: p.ultimateUseSeq || 0
      };

      if (!playing || p.connected === false) row.connected = p.connected !== false;
      if (!p.alive) row.respawnMs = Math.max(0, p.respawnAt - now);
      if (p.shield > 0 && p.shieldUntil > now) row.shieldMs = Math.max(0, p.shieldUntil - now);
      if (p.alive && p.invulnerableUntil > now) {
        row.invulnerable = true;
        row.invulnerableMs = Math.max(0, p.invulnerableUntil - now);
      }

      if (burnStatus) { row.burning = true; row.burnSourceId = burnStatus.sourceId || null; }
      if (hasStatus(p, 'poison', now)) row.poisoned = true;
      if (radiationStatus) { row.radiated = true; row.radiationSourceId = radiationStatus.sourceId || null; }
      if (hasStatus(p, 'tailwind', now)) row.tailwind = true;
      if (hasStatus(p, 'slow', now)) row.frozen = true;
      if (hasStatus(p, 'stun', now)) row.stunned = true;

      if (!hideCharacter && p.character === 'dia') {
        const active = isDiaForm(p, now);
        if (active) {
          row.diaForm = true;
          row.diaFormMs = Math.max(0, p.diaFormUntil - now);
        }
        const cd = Math.max(0, p.diaCooldownUntil - now);
        if (cd > 0) row.diaCooldownMs = cd;
      }
      if (!hideCharacter && p.character === 'runner') {
        if (p.sprintUntil > now) {
          row.sprint = true;
          row.sprintMs = Math.max(0, p.sprintUntil - now);
        }
        const cd = Math.max(0, p.sprintCooldownUntil - now);
        if (cd > 0) row.sprintCooldownMs = cd;
      }
      if (!hideCharacter && p.character === 'wind') {
        const activeMs = Math.max(0, (getStatus(p, 'tailwind', now)?.until || 0) - now);
        const cd = Math.max(0, p.windTailwindCooldownUntil - now);
        if (activeMs > 0) row.windTailwindMs = activeMs;
        if (cd > 0) row.windTailwindCooldownMs = cd;
      }
      if (!hideCharacter && p.character === 'angel') {
        const cd = Math.max(0, p.angelBlessCooldownUntil - now);
        if (cd > 0) row.angelBlessCooldownMs = cd;
      }
      if (!hideCharacter && p.character === 'shield') {
        updateShieldAbilityCharges(p, now);
        row.shieldAbilityCharges = Math.max(0, Math.floor(Number(p.shieldAbilityCharges) || 0));
        const rechargeMs = p.shieldRechargeAt > now ? Math.max(0, p.shieldRechargeAt - now) : 0;
        if (rechargeMs > 0) row.shieldRechargeMs = rechargeMs;
      }
      if (!hideCharacter && p.character === 'jet') {
        if (p.jetBoostUntil > now) {
          row.jetBoost = true;
          row.jetBoostMs = Math.max(0, p.jetBoostUntil - now);
          row.jetBoostStartX = Number(p.jetBoostStartX || 0);
          row.jetBoostStartY = Number(p.jetBoostStartY || 0);
          row.jetBoostEndX = Number(p.jetBoostEndX || 0);
          row.jetBoostEndY = Number(p.jetBoostEndY || 0);
          row.jetBoostDistance = Number(p.jetBoostDistance || 0);
        } else if (Number(p.jetBoostDistance || 0) > 0) {
          row.jetBoostStartX = Number(p.jetBoostStartX || 0);
          row.jetBoostStartY = Number(p.jetBoostStartY || 0);
          row.jetBoostEndX = Number(p.jetBoostEndX || 0);
          row.jetBoostEndY = Number(p.jetBoostEndY || 0);
          row.jetBoostDistance = Number(p.jetBoostDistance || 0);
        }
        const cd = Math.max(0, p.jetBoostCooldownUntil - now);
        if (cd > 0) row.jetBoostCooldownMs = cd;
        const shieldMs = p.shieldUntil > now ? Math.max(0, p.shieldUntil - now) : 0;
        if (shieldMs > 0) row.jetShieldMs = shieldMs;
      }
      if (!hideCharacter && p.character === 'reactor') {
        const output = clamp(Number(p.reactorOutput) || 0, 0, 100);
        if (output > 0) row.reactorOutput = output;
      }
      if (!hideCharacter && ultimateCostForPlayer(p) > 0) {
        row.ultimateCharge = clamp(Number(p.ultimateCharge) || 0, 0, ultimateCostForPlayer(p));
        row.ultimateUseSeq = p.ultimateUseSeq || 0;
        if (isUltimateActive(p, now)) row.ultimateActiveMs = Math.max(0, Number(p.ultimateUntil) - now);
        if (p.pendingUltimateAt > now && p.pendingUltimateId) {
          row.pendingUltimateMs = Math.max(0, Number(p.pendingUltimateAt) - now);
          row.pendingUltimateId = p.pendingUltimateId;
        }
      }
      if (!hideCharacter && p.character === 'buffer') {
        const target = resolveBufferTarget(room, p);
        if (target) {
          row.bufferTargetId = target.id;
          if (bufferLinkState(room, p, now).active) row.bufferLinkActive = true;
        }
      }

      if (p.lastHealTargetId) row.lastHealTargetId = p.lastHealTargetId;
      if (p.lastAbilityTargetId) row.lastAbilityTargetId = p.lastAbilityTargetId;
      if (ended) row.stats = { ...ensureMatchStats(p) };
      return row;
    }),
    projectiles: [...room.projectiles.values()].map(p => {
      const row = { id: p.id, x: p.x, y: p.y, radius: p.radius, type: p.type, team: p.team, character: p.character };
      if (p.reactorFxBand != null) row.reactorFxBand = p.reactorFxBand;
      if (p.ultimateProjectile) row.ultimateProjectile = true;
      if (p.diaUltimateVolleyId) row.diaUltimateVolleyId = p.diaUltimateVolleyId;
      if (p.character === 'spray') {
        if (p.sprayLane) row.sprayLane = p.sprayLane;
        if (p.sprayVolleyId) row.sprayVolleyId = p.sprayVolleyId;
      }
      return row;
    }),
    beams: room.beams.map(b => {
      const row = { ownerId: b.ownerId, team: b.team, character: b.character, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
      if (b.healedId) row.healedId = b.healedId;
      if (b.hitEnemyId) row.hitEnemyId = b.hitEnemyId;
      if (b.impact) row.impact = b.impact;
      if (b.didDamage) row.didDamage = true;
      return row;
    })
  };

  if (room.state === 'draft' || room.state === 'ready') out.competitive = competitiveSnapshot(room, viewer, spectator, now);
  if (!playing) out.hostId = room.hostId;
  if (ended) {
    out.winner = room.winner;
    out.winnerReason = room.winnerReason || null;
    out.teamKills = teamKillTotals(room);
    const closeAt = Number(room.postGameDeleteAt) || (room.endedAt ? room.endedAt + POST_GAME_ROOM_CLOSE_MS : 0);
    out.roomCloseAt = closeAt || 0;
    out.roomCloseTimeLeft = closeAt ? Math.max(0, (closeAt - now) / 1000) : 0;
  }
  return out;
}

function roundWireNumber(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}


function compactPlayerWireRow(p) {
  let flags = 0;
  if (p.burning) flags |= 1 << 0;
  if (p.poisoned) flags |= 1 << 1;
  if (p.radiated) flags |= 1 << 2;
  if (p.tailwind) flags |= 1 << 3;
  if (p.frozen) flags |= 1 << 4;
  if (p.stunned) flags |= 1 << 5;
  if (p.invulnerable) flags |= 1 << 6;
  if (p.diaForm) flags |= 1 << 7;
  if (p.sprint) flags |= 1 << 8;
  if (p.jetBoost) flags |= 1 << 9;
  if (p.bufferLinkActive) flags |= 1 << 10;
  const ms = value => value == null ? null : Math.max(0, Math.round(Number(value) || 0));
  const num = (value, digits = 3) => value == null ? null : roundWireNumber(value, digits);
  const row = [
    p.id, p.name, p.team === 'B' ? 1 : 0, p.character || null,
    num(p.x), num(p.y), num(p.hp), num(p.maxHp), num(p.shield), num(p.maxShield), p.alive ? 1 : 0,
    num(p.aimX), num(p.aimY), p.shotSeq || 0, p.projectileHitSeq || 0, p.healHitSeq || 0, p.abilityUseSeq || 0,
    flags, p.connected === false ? 0 : 1,
    ms(p.respawnMs), ms(p.shieldMs), ms(p.invulnerableMs), p.burnSourceId || null, p.radiationSourceId || null,
    ms(p.diaFormMs), ms(p.diaCooldownMs), ms(p.sprintMs), ms(p.sprintCooldownMs),
    ms(p.windTailwindMs), ms(p.windTailwindCooldownMs), ms(p.angelBlessCooldownMs),
    p.shieldAbilityCharges == null ? null : Math.max(0, Math.floor(Number(p.shieldAbilityCharges) || 0)), ms(p.shieldRechargeMs),
    ms(p.jetBoostMs), num(p.jetBoostStartX), num(p.jetBoostStartY), num(p.jetBoostEndX), num(p.jetBoostEndY), num(p.jetBoostDistance),
    ms(p.jetBoostCooldownMs), ms(p.jetShieldMs), p.reactorOutput == null ? null : num(p.reactorOutput, 2),
    p.bufferTargetId || null, p.lastHealTargetId || null, p.lastAbilityTargetId || null,
    p.ultimateCharge == null ? null : num(p.ultimateCharge, 2), p.ultimateUseSeq || 0, ms(p.ultimateActiveMs)
  ];
  while (row.length && row[row.length - 1] == null) row.pop();
  return row;
}

// BWOpt6/c5: player identity/team/character are static during a live match. They are
// sent once as playerMeta instead of being repeated in every 10 Hz row. Beam visuals
// also ride on two flag bits (active/contact) instead of full x1/y1/x2/y2 beam rows.
function compactPlayerWireRowV5(p, beamActive = false, beamDidDamage = false) {
  let flags = 0;
  if (p.burning) flags |= 1 << 0;
  if (p.poisoned) flags |= 1 << 1;
  if (p.radiated) flags |= 1 << 2;
  if (p.tailwind) flags |= 1 << 3;
  if (p.frozen) flags |= 1 << 4;
  if (p.stunned) flags |= 1 << 5;
  if (p.invulnerable) flags |= 1 << 6;
  if (p.diaForm) flags |= 1 << 7;
  if (p.sprint) flags |= 1 << 8;
  if (p.jetBoost) flags |= 1 << 9;
  if (p.bufferLinkActive) flags |= 1 << 10;
  if (beamActive) flags |= 1 << 11;
  if (beamDidDamage) flags |= 1 << 12;
  const ms = value => value == null ? null : Math.max(0, Math.round(Number(value) || 0));
  const num = (value, digits = 3) => value == null ? null : roundWireNumber(value, digits);
  const row = [
    num(p.x), num(p.y), num(p.hp), num(p.maxHp), num(p.shield), num(p.maxShield), p.alive ? 1 : 0,
    num(p.aimX), num(p.aimY), p.shotSeq || 0, p.projectileHitSeq || 0, p.healHitSeq || 0, p.abilityUseSeq || 0,
    flags, p.connected === false ? 0 : 1,
    ms(p.respawnMs), ms(p.shieldMs), ms(p.invulnerableMs), p.burnSourceId || null, p.radiationSourceId || null,
    ms(p.diaFormMs), ms(p.diaCooldownMs), ms(p.sprintMs), ms(p.sprintCooldownMs),
    ms(p.windTailwindMs), ms(p.windTailwindCooldownMs), ms(p.angelBlessCooldownMs),
    p.shieldAbilityCharges == null ? null : Math.max(0, Math.floor(Number(p.shieldAbilityCharges) || 0)), ms(p.shieldRechargeMs),
    ms(p.jetBoostMs), num(p.jetBoostStartX), num(p.jetBoostStartY), num(p.jetBoostEndX), num(p.jetBoostEndY), num(p.jetBoostDistance),
    ms(p.jetBoostCooldownMs), ms(p.jetShieldMs), p.reactorOutput == null ? null : num(p.reactorOutput, 2),
    p.bufferTargetId || null, p.lastHealTargetId || null, p.lastAbilityTargetId || null,
    p.ultimateCharge == null ? null : num(p.ultimateCharge, 2), p.ultimateUseSeq || 0, ms(p.ultimateActiveMs)
  ];
  while (row.length && row[row.length - 1] == null) row.pop();
  return row;
}

// BWOpt9/c6: keep the 15 always-needed live fields fixed, then append a sparse
// [tag,value,...] extension only for optional character/status data that actually
// exists. This removes c5's long runs of JSON null padding (especially for healer
// target IDs, Buffer links, Shield charges, Reactor output and Jet state) without
// changing any server-authoritative gameplay state or update frequency.
function compactPlayerWireRowV6(p, beamActive = false, beamDidDamage = false) {
  let flags = 0;
  if (p.burning) flags |= 1 << 0;
  if (p.poisoned) flags |= 1 << 1;
  if (p.radiated) flags |= 1 << 2;
  if (p.tailwind) flags |= 1 << 3;
  if (p.frozen) flags |= 1 << 4;
  if (p.stunned) flags |= 1 << 5;
  if (p.invulnerable) flags |= 1 << 6;
  if (p.diaForm) flags |= 1 << 7;
  if (p.sprint) flags |= 1 << 8;
  if (p.jetBoost) flags |= 1 << 9;
  if (p.bufferLinkActive) flags |= 1 << 10;
  if (beamActive) flags |= 1 << 11;
  if (beamDidDamage) flags |= 1 << 12;

  const ms = value => value == null ? null : Math.max(0, Math.round(Number(value) || 0));
  const num = (value, digits = 3) => value == null ? null : roundWireNumber(value, digits);
  const row = [
    num(p.x), num(p.y), num(p.hp), num(p.maxHp), num(p.shield), num(p.maxShield), p.alive ? 1 : 0,
    num(p.aimX), num(p.aimY), p.shotSeq || 0, p.projectileHitSeq || 0, p.healHitSeq || 0, p.abilityUseSeq || 0,
    flags, p.connected === false ? 0 : 1
  ];
  const ext = [];
  const add = (tag, value) => { if (value != null) ext.push(tag, value); };
  add(0, ms(p.respawnMs));
  add(1, ms(p.shieldMs));
  add(2, ms(p.invulnerableMs));
  add(3, p.burnSourceId || null);
  add(4, p.radiationSourceId || null);
  add(5, ms(p.diaFormMs));
  add(6, ms(p.diaCooldownMs));
  add(7, ms(p.sprintMs));
  add(8, ms(p.sprintCooldownMs));
  add(9, ms(p.windTailwindMs));
  add(10, ms(p.windTailwindCooldownMs));
  add(11, ms(p.angelBlessCooldownMs));
  add(12, p.shieldAbilityCharges == null ? null : Math.max(0, Math.floor(Number(p.shieldAbilityCharges) || 0)));
  add(13, ms(p.shieldRechargeMs));
  add(14, ms(p.jetBoostMs));
  add(15, num(p.jetBoostStartX));
  add(16, num(p.jetBoostStartY));
  add(17, num(p.jetBoostEndX));
  add(18, num(p.jetBoostEndY));
  add(19, num(p.jetBoostDistance));
  add(20, ms(p.jetBoostCooldownMs));
  add(21, ms(p.jetShieldMs));
  add(22, p.reactorOutput == null ? null : num(p.reactorOutput, 2));
  add(23, p.bufferTargetId || null);
  add(24, p.lastHealTargetId || null);
  add(25, p.lastAbilityTargetId || null);
  add(26, p.ultimateCharge == null || Number(p.ultimateCharge) <= 0 ? null : num(p.ultimateCharge, 2));
  add(27, p.ultimateUseSeq ? Math.max(0, Math.floor(Number(p.ultimateUseSeq) || 0)) : null);
  add(28, ms(p.ultimateActiveMs));
  add(29, ms(p.pendingUltimateMs));
  add(30, p.pendingUltimateId || null);
  if (ext.length) row.push(ext);
  return row;
}

function compactPlayingSnapshotForWire(state, room = null, now = Date.now(), forceProjectileSync = false) {
  if (!state || state.state !== 'playing') return state;

  let projectileSpawns = [];
  let projectileRemoves = [];
  let projectileSync = null;
  if (room) {
    if (!(room.projectileNetPendingSpawns instanceof Set)) room.projectileNetPendingSpawns = new Set();
    if (!(room.projectileNetPendingRemoves instanceof Set)) room.projectileNetPendingRemoves = new Set();

    for (const id of room.projectileNetPendingSpawns) {
      const p = room.projectiles.get(id);
      if (p) projectileSpawns.push(projectileWireRow(p));
    }
    projectileRemoves = [...room.projectileNetPendingRemoves];

    const periodicSyncDue = !room.lastProjectileNetSyncAt || now - room.lastProjectileNetSyncAt >= 2000;
    if (forceProjectileSync || periodicSyncDue) {
      projectileSync = [...room.projectiles.values()].map(projectileWireRow);
      projectileSpawns = [];
      projectileRemoves = [];
      room.lastProjectileNetSyncAt = now;
    }
  }

  const beamByOwner = new Map();
  for (const beam of (state.beams || [])) {
    const prev = beamByOwner.get(beam.ownerId);
    if (!prev) beamByOwner.set(beam.ownerId, { active: true, didDamage: !!beam.didDamage });
    else if (beam.didDamage) prev.didDamage = true;
  }

  const playerMeta = (state.players || []).map(p => [p.id, p.name, p.team === 'B' ? 1 : 0, p.character || null]);
  const playerMetaSignature = JSON.stringify(playerMeta);
  const includePlayerMeta = forceProjectileSync || !room || room.lastPlayerNetMetaSignature !== playerMetaSignature;
  if (room && includePlayerMeta) room.lastPlayerNetMetaSignature = playerMetaSignature;

  const out = {
    type: state.type,
    state: state.state,
    mode: state.mode,
    matchMode: state.matchMode || state.mode,
    room: state.room,
    roomNumber: state.roomNumber || 0,
    wireFormat: 'c6',
    scoreA: roundWireNumber(state.scoreA, 3),
    scoreB: roundWireNumber(state.scoreB, 3),
    timeLeft: roundWireNumber(state.timeLeft, 2),
    players: (state.players || []).map(p => {
      const beam = beamByOwner.get(p.id);
      return compactPlayerWireRowV6(p, !!beam, !!beam?.didDamage);
    })
  };
  if (includePlayerMeta) out.playerMeta = playerMeta;
  if (projectileSpawns.length || projectileRemoves.length) out.projectileEvents = [projectileSpawns, projectileRemoves];
  if (projectileSync !== null) out.projectileSync = projectileSync;
  // No recurring live beam rows in c5. Client reconstructs beam geometry visually from
  // authoritative player position/aim + static world/wall data; server 50 Hz beam hit,
  // damage, healing and status logic is untouched.
  return out;
}

function sendPlayingSnapshotToConnection(room, conn, now = Date.now()) {
  if (!room || !conn || room.state !== 'playing') return false;
  const text = JSON.stringify(compactPlayingSnapshotForWire(snapshot(room, null, true), room, now, true));
  conn.sendSerialized(text, 'live_state_sync');
  return true;
}

function broadcast(room, now = Date.now()) {
  if (room.state === 'playing') {
    // During live play there is no viewer-private draft information. Serialize once and
    // fan out the exact same authoritative packet. BWOpt4 reserves the actual framed
    // bytes against a hard per-room budget before sending; skipped snapshots do not
    // affect the 50 Hz simulation and pending projectile lifecycle events remain queued.
    const previousProjectileSyncAt = room.lastProjectileNetSyncAt;
    const previousPlayerMetaSignature = room.lastPlayerNetMetaSignature;
    const text = JSON.stringify(compactPlayingSnapshotForWire(snapshot(room, null, true), room, now, false));
    const recipientCount = room.clients.size + room.spectators.size;
    const framedBytes = websocketFrameSize(Buffer.byteLength(text, 'utf8'));
    if (!allowLiveRoomBroadcast(room, framedBytes, recipientCount, now)) {
      // Serialization may have prepared a periodic projectile full-sync; if the entire
      // snapshot is throttled, restore the timestamp so the next delivered packet can
      // still carry that authoritative resync.
      room.lastProjectileNetSyncAt = previousProjectileSyncAt;
      room.lastPlayerNetMetaSignature = previousPlayerMetaSignature;
      room.lastBroadcastAt = now;
      return false;
    }
    for (const conn of room.clients.values()) conn.sendSerialized(text, 'live_state');
    for (const conn of room.spectators.values()) conn.sendSerialized(text, 'live_state');
    room.projectileNetPendingSpawns?.clear();
    room.projectileNetPendingRemoves?.clear();
  } else {
    for (const [playerId, conn] of room.clients.entries()) conn.send(snapshot(room, playerId));
    for (const conn of room.spectators.values()) conn.send(snapshot(room, null, true));
  }
  room.lastBroadcastAt = now;
  return true;
}

function roomBroadcastIntervalMs(room) {
  if (!room) return Infinity;
  if (room.state === 'playing') return 1000 / SNAPSHOT_RATE_PLAYING;
  if (room.state === 'draft' || room.state === 'ready') return 1000 / SNAPSHOT_RATE_DRAFT;
  return Infinity;
}

async function startSchoolLineServer() {
  console.log('[startup] initializing durable PostgreSQL persistence...');
  await durableStore.init();
  await initializePlayerAccountsFromDatabase();
  await refreshCompetitiveStatsFromDatabase();
  console.log(`[startup] durable persistence ready · ${competitiveStats.totalMatches} persisted competitive matches · stats series ${COMPETITIVE_STATS_VERSION}`);

  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) updateRoom(room, DT, now);
  }, 1000 / TICK_RATE);

  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      const interval = roomBroadcastIntervalMs(room);
      if (!Number.isFinite(interval)) continue;
      if (!room.lastBroadcastAt || now - room.lastBroadcastAt >= interval - 1) broadcast(room, now);
    }
  }, 1000 / SNAPSHOT_SCHEDULER_HZ);

  setInterval(() => retryPendingCompetitiveRecords(Date.now()), Math.min(COMPETITIVE_PERSIST_RETRY_MS, 1000));

  setInterval(() => {
    void durableStore.checkHealth().catch(err => console.error('[database] health check failed:', err?.message || err));
  }, 30000);

  setInterval(() => {
    const now = Date.now();
    for (const conn of [...activeConnections]) {
      if (conn.closed || conn.socket.destroyed) continue;
      if (now - Number(conn.lastPongAt || 0) > WS_STALE_TIMEOUT_MS) {
        NETWORK_METRICS.staleConnectionsClosed += 1;
        try { conn.close(); } catch (_) {}
        continue;
      }
      if (now - Number(conn.lastPingAt || 0) >= WS_PING_INTERVAL_MS) {
        conn.lastPingAt = now;
        try {
          const bytes = sendFrame(conn.socket, 0x9, Buffer.alloc(0));
          recordWsOutbound(conn, bytes, 'ping', now);
        } catch (_) {}
      }
    }
  }, Math.min(WS_PING_INTERVAL_MS, 5000));

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\nSchool Line Mobile ${GAME_VERSION} · Competitive stats ${COMPETITIVE_STATS_VERSION} · PostgreSQL durable mode`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`LAN:   http://<이 컴퓨터의 IPv4 주소>:${PORT}\n`);
  });
}

async function shutdownSchoolLine(signal) {
  console.log(`[shutdown] ${signal} received; waiting briefly for durable match writes...`);
  const deadline = Date.now() + 8000;
  while (pendingCompetitiveRecords.size && Date.now() < deadline) {
    retryPendingCompetitiveRecords(Date.now());
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (pendingCompetitiveRecords.size) console.error(`[shutdown] ${pendingCompetitiveRecords.size} competitive record(s) still pending when shutdown deadline expired.`);
  try { await durableStore.close(); } catch (_) {}
  process.exit(0);
}

if (require.main === module) {
  startSchoolLineServer().catch(err => {
    console.error('\n[FATAL] School Line refused to start because durable PostgreSQL persistence is unavailable.');
    console.error('[FATAL]', err?.stack || err);
    console.error('[FATAL] No local JSON fallback will be used; this is intentional data-loss protection.\n');
    process.exit(1);
  });
  process.once('SIGTERM', () => { void shutdownSchoolLine('SIGTERM'); });
  process.once('SIGINT', () => { void shutdownSchoolLine('SIGINT'); });
}

module.exports = {
  server, CHARACTERS, TARGET_RELATION, STATUS_DEFS, GLOBAL_SHIELD_CAP, RESPAWN_INVULN_MS, RESPAWN_POST_SHIELD, RESPAWN_POST_SHIELD_MS, PERK_SYSTEM, CHARACTER_PERKS,
  resetPerkState, perkOptionsForCharacter, publicPerkOption, perkSelectionUnlocked, maybeSendPerkOffer, choosePerk, updatePerkSystem,
  getTargetRelation, isTargetRelationAllowed, resolveTargetedAbilityTarget, recordSupportContribution,
  applyStatus, getStatus, hasStatus, clearStatus, clearAllStatuses, isStunned,
  applyShield, clearShield, consumeShieldAttribution, dealDamage, dealDamageDetailed, applyHealing, queueHealerNumberFeedback, flushHealerNumberFeedback,
  ultimateCostForPlayer, grantUltimateCharge, ultimateChargePercent, isUltimateActive, activateUltimate, scheduleDelayedUltimate, resolveDelayedUltimate, spawnDiaUltimateVolley,
  reactorStageForOutput, reactorDamageForOutput, currentAttackDef,
  effectiveSpeed, resolveBufferTarget, bufferLinkState, setBufferTarget, clearBufferTargetRefs, periodicActionRateMultiplier, periodicActionReady,
  POST_GAME_ROOM_CLOSE_MS, MAX_ROOMS, cancelPostGameRoomClose, reopenEndedRoomForRematch, closeEndedRoom, updateRoom, snapshot, compactPlayingSnapshotForWire, compactPlayerWireRow, compactPlayerWireRowV5, compactPlayerWireRowV6, websocketFrameSize, publicNetworkStats, roomBroadcastIntervalMs, allowLiveRoomBroadcast, broadcast, speedWithTierDelta, hasLineOfSight,
  makeMatchStats, newRoom, spawnProjectile, spawnSprayVolley, spawnSolarProjectile, updateProjectiles,
  traceBeam, traceLightBeam, activateDiaForm, activateRunnerSprint, activateWindTailwind, activateShieldAbility, updateShieldAbilityCharges, activateJetBoost, finishJetBoost, updateJetBoostPosition, endDiaForm,
  registerDirectKill, die, respawn, applyRespawnPostShield, resumeRoom, disconnect, neutralizePlayerInput, safeResumeToken,
  startCompetitiveDraft, resolveCompetitiveBan, commitCompetitivePick, autoCompetitivePick, enterCompetitiveReady, swapCompetitiveReadyAssignments, finalizeCompetitiveReady, updateCompetitiveFlow, recordCompetitiveResult,
  competitiveAvailableCharacters, currentCompetitivePickerId, publicCompetitiveStats, saveCompetitiveStats, isExactCompetitiveRoster, normalizeCompetitiveStats, normalizeStatsVersion, fullBalanceVersion, statsVersionFromMatch, competitiveStatsBackupPayload, rebuildCompetitiveStatsFromMatches, statsSeriesForBalanceVersion, buildCompetitiveResult,
  teamKillTotals, resolveMatchWinner, competitivePhaseWireSnapshot, sendCompetitiveBanVoteUpdate,
  normalizeRoomMode, roomDisplayName, publicRoomList, nextRoomDisplayNumber, createRoomAndJoin, joinRoom, leaveRoomExplicit, startMatch, rooms
};
