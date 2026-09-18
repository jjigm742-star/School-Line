'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const TICK_RATE = 50;
const SNAPSHOT_RATE = 20;
const DT = 1 / TICK_RATE;
const MATCH_SECONDS = 180;
const COMPETITIVE_BAN_MS = Math.max(100, Number(process.env.SCHOOL_LINE_COMP_BAN_MS || 10000));
const COMPETITIVE_PICK_MS = Math.max(100, Number(process.env.SCHOOL_LINE_COMP_PICK_MS || 10000));
const COMPETITIVE_READY_MS = Math.max(100, Number(process.env.SCHOOL_LINE_COMP_READY_MS || 20000));
const COMPETITIVE_DATA_DIR = process.env.SCHOOL_LINE_DATA_DIR ? path.resolve(process.env.SCHOOL_LINE_DATA_DIR) : path.join(__dirname, 'data');
const COMPETITIVE_STATS_FILE = path.join(COMPETITIVE_DATA_DIR, 'competitive_stats.json');
const RESPAWN_MS = 10000;
const RESPAWN_INVULN_MS = 2000;
const NONCOMBAT_REGEN_DELAY_MS = 3000;
const NONCOMBAT_REGEN_HPS = 50;
const SPECTATOR_PIN_HASH = '72a2d4365f37780690ee9d05b9a173e9036187fbfd5b5ae61785c5d5b0bf8a8a'; // SHA-256 of teacher PIN
const SPECTATOR_MAX_FAILURES = 5;
const SPECTATOR_LOCK_MS = 30000;
const ADMIN_STATS_PIN_HASH = SPECTATOR_PIN_HASH; // Same administrator PIN, kept hashed server-side.
const ADMIN_STATS_MAX_FAILURES = 5;
const ADMIN_STATS_LOCK_MS = 30000;
const BALANCE_VERSION = '1.3';
const GAME_VERSION = `Alpha ${BALANCE_VERSION}`;
const COMPETITIVE_STATS_SCHEMA_VERSION = 3;
const COMPETITIVE_STATS_VERSION = BALANCE_VERSION;
const COMPETITIVE_BUILD_ID = 'alpha-1.3-r21-spray-kill-tiebreak';
const COMPETITIVE_ROSTER_VERSION = 'alpha-1.3-r21-spray';

const WORLD = { width: 42, height: 68, aZoneEnd: 18, bZoneStart: 50 };
const SPEED_TIERS = [4.0, 5.0, 6.0, 7.0, 8.0, 9.2];

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
  { x: 5, y: 24, w: 10, h: 3 },
  { x: 27, y: 24, w: 10, h: 3 },
  { x: 18, y: 31, w: 6, h: 6 },
  { x: 5, y: 41, w: 10, h: 3 },
  { x: 27, y: 41, w: 10, h: 3 }
];

const CHARACTERS = {
  iron: {
    name: '아이언', role: '탱커', hp: 600, speed: 5.0, radius: 1.00,
    fireRate: 5, range: 24, projectileSpeed: 14, projectileRadius: 0.32,
    projectileType: 'attack', damage: 13
  },
  mecha: {
    name: '메카', role: '탱커', hp: 550, speed: 7.0, radius: 1.00,
    fireRate: 5, range: 16, projectileSpeed: 28, projectileRadius: 0.20,
    projectileType: 'attack', damage: 9
  },
  jet: {
    name: '제트', role: '탱커', hp: 300, speed: 6.0, radius: 1.00,
    fireRate: 5, range: 12, projectileSpeed: 20, projectileRadius: 0.32,
    projectileType: 'attack', damage: 19,
    boostDistance: 12, boostDuration: 0.3, boostCooldown: 10,
    boostShield: 50, boostShieldDuration: 3, abilityId: 'boost'
  },
  solar: {
    name: '솔라', role: '탱커', hp: 375, speed: 5.0, radius: 1.00,
    attackType: 'beam', range: 16, beamDps: 55,
    solarFireRate: 1, solarProjectileRange: 24, solarProjectileSpeed: 28,
    solarProjectileRadius: 0.32, solarProjectileDamage: 25, solarSelfHeal: 25
  },
  runner: {
    name: '러너', role: '딜러', hp: 175, speed: 8.0, radius: 0.65,
    fireRate: 5, range: 16, projectileSpeed: 28, projectileRadius: 0.20,
    projectileType: 'attack', damage: 11,
    sprintDuration: 4, sprintCooldown: 8, abilityId: 'sprint'
  },
  shooter: {
    name: '슈터', role: '딜러', hp: 250, speed: 6.0, radius: 0.80,
    fireRate: 5, range: 24, projectileSpeed: 28, projectileRadius: 0.20,
    projectileType: 'attack', damage: 20
  },
  sniper: {
    name: '스나이퍼', role: '딜러', hp: 150, speed: 5.0, radius: 0.65,
    fireRate: 2, range: 36, projectileSpeed: 42, projectileRadius: 0.20,
    projectileType: 'attack', distanceDamage: true,
    distanceDamageBands: [{ max: 16, damage: 45 }, { max: 36, damage: 60 }]
  },
  cannon: {
    name: '캐논', role: '딜러', hp: 275, speed: 4.0, radius: 1.00,
    fireRate: 10, range: 24, projectileSpeed: 28, projectileRadius: 0.32,
    projectileType: 'attack', damage: 13
  },
  fire: {
    name: '파이어', role: '딜러', hp: 200, speed: 7.0, radius: 0.80,
    fireRate: 5, range: 24, projectileSpeed: 28, projectileRadius: 0.20,
    projectileType: 'attack', damage: 16, burnDps: 10, burnDuration: 2
  },
  poison: {
    name: '포이즌', role: '딜러', hp: 250, speed: 6.0, radius: 0.80,
    attackType: 'beam', range: 16, beamDps: 75,
    poisonHealReduction: 0.50, poisonDuration: 1.5
  },
  reactor: {
    name: '리액터', role: '딜러', hp: 225, speed: 6.0, radius: 0.80,
    fireRate: 5, range: 24, projectileSpeed: 20, projectileRadius: 0.32,
    projectileType: 'attack', damage: 18,
    reactorOutputBands: [
      { max: 32, damage: 18 },
      { max: 65, damage: 22 },
      { max: 100, damage: 26 }
    ],
    reactorDamagePerOutput: 5, reactorDecayDelay: 2, reactorDecayPerSecond: 20,
    reactorHighThreshold: 66, reactorHighSpeed: 7.0,
    radiationHealReduction: 0.25, radiationDuration: 1.5
  },
  spray: {
    name: '스프레이', role: '딜러', hp: 250, speed: 5.0, radius: 0.80,
    fireRate: 5, range: 24, projectileSpeed: 28, projectileRadius: 0.32,
    projectileType: 'attack', damage: 15,
    spraySideProjectileRadius: 0.20, spraySideDamage: 5,
    spraySideAngleDeg: 10, spraySideOffset: 1.2
  },
  water: {
    name: '워터', role: '힐러', hp: 250, speed: 6.0, radius: 0.65,
    fireRate: 5, range: 24, projectileSpeed: 20, projectileRadius: 0.52,
    projectileType: 'heal', heal: 15
  },
  wind: {
    name: '윈드', role: '힐러', hp: 225, speed: 7.0, radius: 0.65,
    fireRate: 5, range: 24, projectileSpeed: 20, projectileRadius: 0.52,
    projectileType: 'heal', heal: 13,
    tailwindDuration: 4, tailwindCooldown: 20, abilityId: 'tailwind'
  },
  star: {
    name: '스타', role: '힐러', hp: 175, speed: 5.0, radius: 0.80,
    fireRate: 2, range: 30, projectileSpeed: 42, projectileRadius: 0.20,
    projectileType: 'heal', heal: 40
  },
  angel: {
    name: '엔젤', role: '힐러', hp: 200, speed: 6.0, radius: 0.65,
    fireRate: 5, range: 24, projectileSpeed: 28, projectileRadius: 0.20,
    projectileType: 'heal', heal: 8,
    abilityId: 'blessing', abilityCooldown: 12, abilityHeal: 100,
    abilityTargeting: { relations: [TARGET_RELATION.SELF, TARGET_RELATION.ALLY], requireLos: false }
  },
  buffer: {
    name: '버퍼', role: '힐러', hp: 225, speed: 5.0, radius: 0.65,
    range: 16, noBasicAttack: true,
    linkHealHps: 40, actionSpeedBoost: 0.25,
    linkTargeting: { relations: [TARGET_RELATION.ALLY], range: 16, requireLos: false }
  },
  light: {
    name: '라이트', role: '힐러', hp: 225, speed: 6.0, radius: 0.65,
    attackType: 'lightBeam', range: 16, healHps: 50, beamDps: 50
  },
  laser: {
    name: '레이저', role: '딜러', hp: 275, speed: 6.0, radius: 0.80,
    attackType: 'beam', range: 16, beamDps: 65, maxHpDpsRatio: 0.10
  },
  ice: {
    name: '아이스', role: '딜러', hp: 275, speed: 6.0, radius: 0.80,
    attackType: 'beam', range: 16, beamDps: 70,
    slowTierDelta: -1, slowDuration: 1.5
  },
  dia: {
    name: '다이아', role: '탱커', hp: 350, speed: 5.0, radius: 1.00,
    fireRate: 5, range: 24, projectileSpeed: 20, projectileRadius: 0.20,
    projectileType: 'attack', damage: 13,
    formDuration: 6, formCooldown: 18, formHp: 400, formSpeed: 6.0,
    formRange: 16, formBeamDps: 80, formKillCooldownReduction: 6, abilityId: 'form'
  }
};

const rooms = new Map();
const spectatorAuthFailures = new Map();
const adminStatsAuthFailures = new Map();
let idCounter = 1;
let spectatorCounter = 1;

function emptyCompetitiveCharacterStats() {
  return { availableMatches: 0, bans: 0, picks: 0, wins: 0, losses: 0, draws: 0 };
}

function emptyCompetitiveVersionStats() {
  return { totalMatches: 0, updatedAt: null, characters: {} };
}

function emptyCompetitiveStats() {
  const characters = {};
  for (const id of Object.keys(CHARACTERS)) characters[id] = emptyCompetitiveCharacterStats();
  return {
    schemaVersion: COMPETITIVE_STATS_SCHEMA_VERSION,
    totalMatches: 0,
    updatedAt: null,
    characters,
    versions: {},
    matches: []
  };
}

function normalizeStatsVersion(value) {
  const text = String(value || '').trim();
  const match = text.match(/(?:^|\b)(\d+\.\d+)(?:\b|$)/);
  return match ? match[1] : '';
}

function statsVersionFromMatch(match) {
  return normalizeStatsVersion(match?.statsVersion) || normalizeStatsVersion(match?.gameVersion) || '';
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
  for (const assignment of Array.isArray(match?.finalAssignments) ? match.finalAssignments : []) {
    if (!assignment?.character) continue;
    const stat = ensureVersionCharacterStats(bucket, assignment.character);
    stat.picks += 1;
    if (match.winner === 'DRAW') stat.draws += 1;
    else if (match.winner === assignment.team) stat.wins += 1;
    else stat.losses += 1;
  }
}

function normalizeVersionBucket(raw) {
  const bucket = emptyCompetitiveVersionStats();
  if (!raw || typeof raw !== 'object') return bucket;
  bucket.totalMatches = Math.max(0, Number(raw.totalMatches) || 0);
  bucket.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
  for (const [id, srcRaw] of Object.entries(raw.characters || {})) {
    const src = srcRaw && typeof srcRaw === 'object' ? srcRaw : {};
    const stat = ensureVersionCharacterStats(bucket, id);
    for (const key of ['availableMatches','bans','picks','wins','losses','draws']) stat[key] = Math.max(0, Number(src[key]) || 0);
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
    for (const key of ['bans','picks','wins','losses','draws']) base.characters[id][key] = Math.max(0, Number(src[key]) || 0);
    if (sourceSchema >= 2 && Number.isFinite(Number(src.availableMatches))) base.characters[id].availableMatches = Math.max(0, Number(src.availableMatches) || 0);
    else base.characters[id].availableMatches = base.totalMatches;
  }

  // v3 stores explicit balance-version buckets. When upgrading v1/v2, reconstruct them
  // from saved match records. A match's version number, not its build/roster id, defines
  // which character-stat bucket it belongs to.
  if (sourceSchema >= 3 && raw.versions && typeof raw.versions === 'object') {
    for (const [version, bucketRaw] of Object.entries(raw.versions)) {
      const key = normalizeStatsVersion(version);
      if (key) base.versions[key] = normalizeVersionBucket(bucketRaw);
    }
  } else if (base.matches.length) {
    for (const match of base.matches) {
      const version = statsVersionFromMatch(match) || COMPETITIVE_STATS_VERSION;
      if (!match.statsVersion) match.statsVersion = version;
      if (!base.versions[version]) base.versions[version] = emptyCompetitiveVersionStats();
      addRecordedMatchToVersionBucket(base.versions[version], match);
    }
  } else if (base.totalMatches > 0) {
    // Aggregate-only legacy fallback. At the moment of this migration the live balance
    // number is 1.3, so old counters without per-match metadata are assigned to 1.3.
    const bucket = emptyCompetitiveVersionStats();
    bucket.totalMatches = base.totalMatches;
    bucket.updatedAt = base.updatedAt;
    for (const [id, stat] of Object.entries(base.characters)) bucket.characters[id] = { ...stat };
    base.versions[COMPETITIVE_STATS_VERSION] = bucket;
  }

  // Ensure every stored match has an explicit statsVersion for future migrations.
  for (const match of base.matches) {
    if (!match.statsVersion) match.statsVersion = statsVersionFromMatch(match) || COMPETITIVE_STATS_VERSION;
  }
  base.schemaVersion = COMPETITIVE_STATS_SCHEMA_VERSION;
  return base;
}

function loadCompetitiveStats() {
  try {
    if (!fs.existsSync(COMPETITIVE_STATS_FILE)) return emptyCompetitiveStats();
    return normalizeCompetitiveStats(JSON.parse(fs.readFileSync(COMPETITIVE_STATS_FILE, 'utf8')));
  } catch (err) {
    console.error('[competitive] stats load failed:', err && err.message ? err.message : err);
    return emptyCompetitiveStats();
  }
}

let competitiveStats = loadCompetitiveStats();

function saveCompetitiveStats() {
  try {
    fs.mkdirSync(COMPETITIVE_DATA_DIR, { recursive: true });
    const tmp = `${COMPETITIVE_STATS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(competitiveStats, null, 2), 'utf8');
    fs.renameSync(tmp, COMPETITIVE_STATS_FILE);
    return true;
  } catch (err) {
    console.error('[competitive] stats save failed:', err && err.message ? err.message : err);
    return false;
  }
}

function versionSort(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
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
      banRate: available > 0 ? (src.bans || 0) / available : 0,
      pickRate: available > 0 ? (src.picks || 0) / available : 0,
      winRate: decided > 0 ? (src.wins || 0) / decided : 0
    };
  }
  const versionMatches = (Array.isArray(competitiveStats.matches) ? competitiveStats.matches : []).filter(m => (statsVersionFromMatch(m) || COMPETITIVE_STATS_VERSION) === statsVersion);
  return {
    schemaVersion: competitiveStats.schemaVersion || COMPETITIVE_STATS_SCHEMA_VERSION,
    statsVersion,
    availableStatsVersions,
    totalMatches: Math.max(0, Number(bucket.totalMatches) || 0),
    allTimeTotalMatches: Math.max(0, Number(competitiveStats.totalMatches) || 0),
    updatedAt: bucket.updatedAt || null,
    allTimeUpdatedAt: competitiveStats.updatedAt || null,
    currentBuild: {
      gameVersion: GAME_VERSION, statsVersion: COMPETITIVE_STATS_VERSION,
      buildId: COMPETITIVE_BUILD_ID, rosterVersion: COMPETITIVE_ROSTER_VERSION,
      availableCharacters: Object.keys(CHARACTERS)
    },
    characters,
    matches: versionMatches,
    allMatches: Array.isArray(competitiveStats.matches) ? competitiveStats.matches : []
  };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function distance(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function safeName(value) {
  const s = String(value || '').trim().replace(/[\r\n\t]/g, ' ');
  return s.slice(0, 12) || '학생';
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

function reactorDamageForOutput(def, output) {
  const bands = Array.isArray(def && def.reactorOutputBands) ? def.reactorOutputBands : null;
  if (!bands || bands.length === 0) return Number(def && def.damage) || 0;
  const value = clamp(Number(output) || 0, 0, 100);
  for (const band of bands) {
    if (value <= Number(band.max) + 1e-9) return Number(band.damage) || 0;
  }
  return Number(bands[bands.length - 1].damage) || 0;
}

function currentAttackDef(player, now) {
  const def = CHARACTERS[player.character];
  if (isDiaForm(player, now)) {
    return { attackType: 'beam', range: def.formRange, beamDps: def.formBeamDps, maxHpDpsRatio: 0 };
  }
  if (player.character === 'reactor') {
    return { ...def, damage: reactorDamageForOutput(def, player.reactorOutput) };
  }
  return def;
}

function currentBaseSpeed(player, now) {
  const def = CHARACTERS[player.character];
  if (isDiaForm(player, now)) return def.formSpeed;
  if (player.character === 'reactor' && Number(player.reactorOutput || 0) >= Number(def.reactorHighThreshold || 66)) return def.reactorHighSpeed;
  return def.speed;
}

function effectiveSpeed(player, now) {
  let delta = 0;
  if (player.character === 'runner' && player.sprintUntil > now) delta += 1;
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
function clearShield(player) { player.shield = 0; player.maxShield = 0; }
function applyShield(room, source, target, amount, options = {}) {
  if (!target || !target.alive) return 0;
  const raw = Math.max(0, Number(amount) || 0);
  if (raw <= 0) return 0;
  const mode = options.mode === 'replace' ? 'replace' : 'add';
  const capValue = Number(options.cap);
  const cap = Number.isFinite(capValue) && capValue > 0 ? capValue : (mode === 'replace' ? raw : Math.max(raw, Number(target.maxShield) || 0));
  const before = Math.max(0, Number(target.shield) || 0);
  target.maxShield = Math.max(0, cap);
  target.shield = mode === 'replace' ? Math.min(target.maxShield, raw) : Math.min(target.maxShield, before + raw);
  return Math.max(0, target.shield - before);
}

function mimeType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' })[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
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
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mimeType(file), 'Cache-Control': 'no-store' });
    res.end(data);
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
  socket.write(Buffer.concat([header, body]));
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
    send(obj) {
      if (this.closed || socket.destroyed) return;
      try { sendFrame(socket, 0x1, JSON.stringify(obj)); } catch (_) {}
    },
    close() {
      if (this.closed) return;
      this.closed = true;
      try { sendFrame(socket, 0x8, Buffer.alloc(0)); } catch (_) {}
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
  socket.on('data', chunk => parseWsData(conn, chunk));
  socket.on('close', () => disconnect(conn));
  socket.on('error', () => disconnect(conn));
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
    if (opcode === 0x9) { sendFrame(conn.socket, 0xA, payload); continue; }
    if (opcode !== 0x1) continue;
    try { onMessage(conn, JSON.parse(payload.toString('utf8'))); } catch (_) {}
  }
}

function newRoom(code) {
  return {
    code,
    state: 'lobby',
    mode: 'normal',
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
    winner: null,
    winnerReason: null,
    projectileCounter: 1
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
  room.mode = 'competitive';
  room.state = 'draft';
  room.winner = null;
  room.winnerReason = null;
  room.endedAt = 0;
  room.scoreA = 0;
  room.scoreB = 0;
  room.projectiles.clear();
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
    readyEndAt: 0, draftStartedAt: now, matchStartedAt: 0,
    finalAssignments: [], recorded: false
  };
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
  comp.bans.push({ team, character });
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
  comp.picks.push({ order: comp.picks.length + 1, playerId, team: player.team, character, auto: !!auto });
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
  [source.character, target.character] = [target.character, source.character];
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
  if (!comp) return;
  if (room.state === 'draft' && now >= comp.phaseEndAt) {
    if (comp.phase === 'ban') resolveCompetitiveBan(room, now);
    else if (comp.phase === 'pick') autoCompetitivePick(room, now);
  } else if (room.state === 'ready' && now >= comp.readyEndAt) finalizeCompetitiveReady(room, now);
}
function recordCompetitiveResult(room, now = Date.now()) {
  const comp = room && room.competitive;
  if (!comp || room.mode !== 'competitive' || comp.recorded) return false;
  comp.recorded = true;
  const players = [...room.players.values()].map(p => ({
    playerId: p.id, playerName: p.name, team: p.team, character: p.character,
    connectedAtEnd: p.connected !== false, stats: { ...ensureMatchStats(p) }
  }));
  const result = {
    matchId: `${now}-${crypto.randomBytes(4).toString('hex')}`,
    statsVersion: COMPETITIVE_STATS_VERSION,
    gameVersion: GAME_VERSION, buildId: COMPETITIVE_BUILD_ID, rosterVersion: COMPETITIVE_ROSTER_VERSION,
    availableCharacters: Object.keys(CHARACTERS), room: room.code,
    draftStartedAt: comp.draftStartedAt ? new Date(comp.draftStartedAt).toISOString() : null,
    matchStartedAt: comp.matchStartedAt ? new Date(comp.matchStartedAt).toISOString() : (room.matchStartedAt ? new Date(room.matchStartedAt).toISOString() : null),
    endedAt: new Date(now).toISOString(),
    firstPickTeam: comp.firstTeam,
    bans: (comp.bans || []).map(b => ({ ...b })),
    picks: (comp.picks || []).map(pick => {
      const player = room.players.get(pick.playerId);
      return { ...pick, playerName: player ? player.name : null };
    }),
    finalAssignments: players.map(p => ({ playerId: p.playerId, playerName: p.playerName, team: p.team, character: p.character })),
    score: { A: Number(room.scoreA.toFixed(3)), B: Number(room.scoreB.toFixed(3)) },
    teamKills: teamKillTotals(room),
    winner: room.winner,
    winnerReason: room.winnerReason || (room.winner === 'DRAW' ? 'draw' : 'score'),
    players
  };
  competitiveStats.totalMatches = (competitiveStats.totalMatches || 0) + 1;
  for (const id of result.availableCharacters) {
    if (!competitiveStats.characters[id]) competitiveStats.characters[id] = emptyCompetitiveCharacterStats();
    competitiveStats.characters[id].availableMatches += 1;
  }
  for (const b of result.bans) if (competitiveStats.characters[b.character]) competitiveStats.characters[b.character].bans += 1;
  for (const p of result.finalAssignments) {
    const stat = competitiveStats.characters[p.character];
    if (!stat) continue;
    stat.picks += 1;
    if (room.winner === 'DRAW') stat.draws += 1;
    else if (room.winner === p.team) stat.wins += 1;
    else stat.losses += 1;
  }
  competitiveStats.matches.push(result);
  competitiveStats.updatedAt = new Date(now).toISOString();
  if (!competitiveStats.versions[COMPETITIVE_STATS_VERSION]) competitiveStats.versions[COMPETITIVE_STATS_VERSION] = emptyCompetitiveVersionStats();
  addRecordedMatchToVersionBucket(competitiveStats.versions[COMPETITIVE_STATS_VERSION], result);
  saveCompetitiveStats();
  return true;
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

function spawnPoint(room, player) {
  const teammates = [...room.players.values()].filter(p => p.team === player.team).sort((a, b) => a.id.localeCompare(b.id));
  const idx = Math.max(0, teammates.findIndex(p => p.id === player.id));
  const xs = [14, 19, 23, 28];
  if (player.team === 'A') return { x: xs[idx % 4], y: 5 + Math.floor(idx / 4) * 2 };
  return { x: xs[idx % 4], y: 63 - Math.floor(idx / 4) * 2 };
}

function onMessage(conn, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'admin_stats_request') return sendAdminCompetitiveStats(conn, msg);
  if (msg.type === 'spectator_join') return joinSpectator(conn, msg);
  if (msg.type === 'resume') return resumeRoom(conn, msg);
  if (msg.type === 'join') return joinRoom(conn, msg);
  const room = rooms.get(conn.roomCode);
  if (!room || !conn.playerId) return;
  const player = room.players.get(conn.playerId);
  if (!player) return;

  if (msg.type === 'select' && (room.state === 'lobby' || room.state === 'ended')) {
    const requested = validCharacter(msg.character);
    if (requested !== player.character && isCharacterTakenOnTeam(room, player.team, requested, player.id)) {
      conn.send({ type: 'pick_error', character: requested, message: '같은 팀에서 이미 사용 중인 캐릭터입니다.' });
      broadcast(room);
      return;
    }
    player.character = requested;
    const def = CHARACTERS[player.character];
    player.maxHp = def.hp; player.hp = Math.min(player.hp, def.hp);
    clearAllStatuses(player); clearShield(player); player.diaFormUntil = 0; player.diaCooldownUntil = 0; player.sprintUntil = 0; player.sprintCooldownUntil = 0; player.windTailwindCooldownUntil = 0; player.angelBlessCooldownUntil = 0; player.jetBoostUntil = 0; player.jetBoostCooldownUntil = 0; player.jetBoostStartAt = 0; player.jetBoostStartX = 0; player.jetBoostStartY = 0; player.jetBoostEndX = 0; player.jetBoostEndY = 0; player.jetShieldUntil = 0; player.reactorOutput = 0; player.reactorLastDamageAt = 0; player.bufferTargetId = null; player.lastPeriodicActionAt = 0; player.lastAbilityTargetId = null; player.jetBoostDistance = 0;
    broadcast(room);
    return;
  }
  if (msg.type === 'start' && room.hostId === player.id && (room.state === 'lobby' || room.state === 'ended')) {
    pruneDisconnectedEndedPlayers(room);
    const unpicked = [...room.players.values()].filter(p => !p.character);
    if (unpicked.length) {
      conn.send({ type: 'start_error', message: `아직 캐릭터를 선택하지 않은 참가자가 ${unpicked.length}명 있습니다.` });
      return;
    }
    room.mode = 'normal';
    room.competitive = null;
    startMatch(room);
    return;
  }
  if (msg.type === 'competitive_start' && room.hostId === player.id && (room.state === 'lobby' || room.state === 'ended')) {
    pruneDisconnectedEndedPlayers(room);
    if (!isExactCompetitiveRoster(room)) {
      conn.send({ type: 'start_error', message: '경쟁게임은 A팀 4명 + B팀 4명, 총 8명이 모두 접속해 있어야 시작할 수 있습니다.' });
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
    broadcast(room);
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
    if (msg.ability === 'boost') activated = activateJetBoost(room, player, now);
    if (activated) {
      player.abilityUseSeq = (player.abilityUseSeq || 0) + 1;
      player.lastAbilityTargetId = abilityTarget ? abilityTarget.id : null;
    }
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
    conn.send({ type: 'admin_stats_data', data: publicCompetitiveStats(msg.statsVersion) });
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
  conn.send({ type: 'admin_stats_data', data: publicCompetitiveStats(msg.statsVersion) });
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
  const spectatorId = `S${spectatorCounter++}`;
  conn.spectatorId = spectatorId;
  conn.roomCode = code;
  room.spectators.set(spectatorId, conn);
  conn.send({
    type: 'spectator_joined', id: spectatorId, room: code,
    config: { world: WORLD, walls: WALLS, characters: publicCharacterDefs() }
  });
  conn.send(snapshot(room, null, true));
}

function joinRoom(conn, msg) {
  if (conn.playerId) return;
  const code = safeRoom(msg.room);
  let room = rooms.get(code);
  if (!room) { room = newRoom(code); rooms.set(code, room); }
  if (room.players.size >= 8) { conn.send({ type: 'error', message: '이 방은 이미 8명입니다.' }); return; }
  if (room.state !== 'lobby' && room.state !== 'ended') { conn.send({ type: 'error', message: '이미 게임 준비 또는 경기가 진행 중입니다.' }); return; }

  const team = msg.team === 'A' || msg.team === 'B' ? msg.team : null;
  if (!team) { conn.send({ type: 'error', message: 'A팀 또는 B팀을 선택하세요.' }); return; }
  if (countTeam(room, team) >= 4) { conn.send({ type: 'error', message: `${team}팀은 이미 4명입니다.` }); return; }

  const id = `P${idCounter++}`;
  const player = {
    id, name: safeName(msg.name), team, character: null,
    resumeToken: newResumeToken(), connected: true, disconnectedAt: 0,
    x: 21, y: team === 'A' ? 5 : 63,
    hp: 0, maxHp: 0, alive: true, respawnAt: 0, invulnerableUntil: 0,
    aimX: 21, aimY: team === 'A' ? 20 : 48,
    input: { up: false, down: false, left: false, right: false, fire: false },
    nextFireAt: 0, lastPeriodicActionAt: 0,
    bufferTargetId: null,
    statuses: Object.create(null),
    shield: 0, maxShield: 0,
    lastCombatAt: 0,
    diaFormUntil: 0, diaCooldownUntil: 0,
    sprintUntil: 0, sprintCooldownUntil: 0, windTailwindCooldownUntil: 0, angelBlessCooldownUntil: 0,
    jetBoostUntil: 0, jetBoostCooldownUntil: 0, jetBoostStartAt: 0,
    jetBoostStartX: 0, jetBoostStartY: 0, jetBoostEndX: 0, jetBoostEndY: 0, jetShieldUntil: 0,
    reactorOutput: 0, reactorLastDamageAt: 0, jetBoostDistance: 0,
    shotSeq: 0, projectileHitSeq: 0, healHitSeq: 0, lastHealTargetId: null, abilityUseSeq: 0, lastAbilityTargetId: null,
    stats: makeMatchStats(null)
  };
  room.players.set(id, player);
  room.clients.set(id, conn);
  if (!room.hostId) room.hostId = id;
  conn.playerId = id; conn.roomCode = code;
  const sp = spawnPoint(room, player); player.x = sp.x; player.y = sp.y;
  conn.send({
    type: 'joined', id, room: code, team, resumeToken: player.resumeToken,
    config: { world: WORLD, walls: WALLS, characters: publicCharacterDefs() }
  });
  broadcast(room);
}


function neutralizePlayerInput(player) {
  if (!player) return;
  player.input = { up: false, down: false, left: false, right: false, fire: false };
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
  if (!['draft','ready','playing','ended'].includes(room.state)) {
    conn.send({ type: 'error', code: 'resume_unavailable', message: '현재는 재접속할 진행 상태가 아닙니다. 일반 입장을 이용해주세요.' });
    return;
  }

  const previousConn = room.clients.get(player.id);
  if (previousConn && previousConn !== conn) {
    // A mobile network change can leave the old TCP socket half-open. The token owner
    // is authoritative; replace the transport without letting the stale close event
    // mark the player offline again.
    previousConn.playerId = null;
    previousConn.roomCode = null;
    try { previousConn.close(); } catch (_) {}
  }

  room.clients.set(player.id, conn);
  player.connected = true;
  player.disconnectedAt = 0;
  neutralizePlayerInput(player);
  conn.playerId = player.id;
  conn.roomCode = code;
  if (!room.hostId || !room.players.get(room.hostId)?.connected) room.hostId = player.id;

  conn.send({
    type: 'resumed', id: player.id, room: code, team: player.team,
    resumeToken: player.resumeToken,
    config: { world: WORLD, walls: WALLS, characters: publicCharacterDefs() }
  });
  conn.send(snapshot(room, player.id));
  broadcast(room);
}

function publicCharacterDefs() {
  const out = {};
  const displayFields = [
    'range', 'fireRate', 'projectileType', 'attackType', 'damage', 'heal',
    'projectileSpeed', 'projectileRadius', 'beamDps', 'healHps', 'maxHpDpsRatio',
    'burnDps', 'burnDuration', 'poisonHealReduction', 'poisonDuration', 'radiationHealReduction', 'radiationDuration',
    'slowTierDelta', 'slowDuration', 'tailwindDuration', 'tailwindCooldown',
    'solarFireRate', 'solarProjectileRange', 'solarProjectileSpeed',
    'solarProjectileRadius', 'solarProjectileDamage', 'solarSelfHeal',
    'sprintDuration', 'sprintCooldown', 'abilityCooldown', 'abilityHeal',
    'boostDistance', 'boostDuration', 'boostCooldown', 'boostShield', 'boostShieldDuration',
    'reactorDamagePerOutput', 'reactorDecayDelay', 'reactorDecayPerSecond', 'reactorHighThreshold', 'reactorHighSpeed',
    'linkHealHps', 'actionSpeedBoost', 'noBasicAttack',
    'formDuration', 'formCooldown', 'formHp', 'formSpeed', 'formRange', 'formBeamDps', 'formKillCooldownReduction'
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
    neutralizePlayerInput(player);
    if (room.hostId === playerId) {
      room.hostId = [...room.players.values()].find(p => p.id !== playerId && p.connected)?.id || null;
    }
    broadcast(room);
  } else {
    room.players.delete(playerId);
    for (const [pid, proj] of room.projectiles) if (proj.ownerId === playerId) room.projectiles.delete(pid);
    if (room.hostId === playerId) room.hostId = [...room.players.values()].find(p => p.connected !== false)?.id || null;
    if (room.players.size === 0 && room.spectators.size === 0) rooms.delete(room.code); else broadcast(room);
  }

  conn.playerId = null;
  conn.roomCode = null;
}

function startMatch(room, now = Date.now()) {
  room.state = 'playing';
  room.scoreA = 0; room.scoreB = 0; room.winner = null; room.winnerReason = null; room.endedAt = 0;
  room.matchStartedAt = now;
  room.matchEndAt = now + MATCH_SECONDS * 1000;
  room.projectiles.clear();
  room.beams = [];
  for (const p of room.players.values()) {
    const def = CHARACTERS[p.character];
    const sp = spawnPoint(room, p);
    Object.assign(p, {
      x: sp.x, y: sp.y, hp: def.hp, maxHp: def.hp, alive: true, respawnAt: 0, invulnerableUntil: 0,
      connected: p.connected !== false, disconnectedAt: p.connected === false ? (p.disconnectedAt || now) : 0,
      nextFireAt: 0, lastPeriodicActionAt: 0, bufferTargetId: null, statuses: Object.create(null), shield: 0, maxShield: 0,
      diaFormUntil: 0, diaCooldownUntil: 0, sprintUntil: 0, sprintCooldownUntil: 0, windTailwindCooldownUntil: 0, angelBlessCooldownUntil: 0,
      jetBoostUntil: 0, jetBoostCooldownUntil: 0, jetBoostStartAt: 0, jetBoostStartX: 0, jetBoostStartY: 0, jetBoostEndX: 0, jetBoostEndY: 0, jetShieldUntil: 0,
      reactorOutput: 0, reactorLastDamageAt: 0, jetBoostDistance: 0, lastCombatAt: now,
      shotSeq: 0, projectileHitSeq: 0, healHitSeq: 0, lastHealTargetId: null, abilityUseSeq: 0, lastAbilityTargetId: null,
      stats: makeMatchStats(p.character)
    });
    p.input = { up: false, down: false, left: false, right: false, fire: false };
  }
  broadcast(room);
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
  applyShield(room, player, player, def.boostShield, { mode: 'replace', cap: def.boostShield });
  player.jetShieldUntil = now + def.boostShieldDuration * 1000;
  return true;
}

function activateJetBoost(room, player, now) {
  if (!player.alive || player.character !== 'jet') return false;
  if (player.jetBoostUntil > now || player.jetBoostCooldownUntil > now) return false;
  const def = CHARACTERS.jet;
  const endpoint = jetBoostEndpoint(player, def);
  if (!endpoint) return false;

  player.jetBoostCooldownUntil = now + def.boostCooldown * 1000;
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
    player.healHitSeq = (player.healHitSeq || 0) + 1;
    player.lastHealTargetId = target.id;
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

function registerKill(room, attackerId, now, direct = true) {
  const attacker = room.players.get(attackerId);
  if (!attacker) return;
  const stats = ensureMatchStats(attacker);
  stats.kills += 1;
  if (direct && attacker.alive && isDiaForm(attacker, now)) {
    stats.diaFormKills += 1;
    attacker.diaCooldownUntil = Math.max(now, attacker.diaCooldownUntil - CHARACTERS.dia.formKillCooldownReduction * 1000);
  }
}

function registerDirectKill(room, attackerId, now) {
  registerKill(room, attackerId, now, true);
}

function die(room, player, now) {
  ensureMatchStats(player).deaths += 1;
  player.hp = 0;
  player.alive = false;
  player.respawnAt = now + RESPAWN_MS;
  player.invulnerableUntil = 0;
  clearAllStatuses(player); clearShield(player);
  if (player.character === 'dia') {
    player.diaFormUntil = 0;
    player.maxHp = CHARACTERS.dia.hp;
  }
  if (player.character === 'runner') player.sprintUntil = 0;
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
  clearAllStatuses(player); clearShield(player);
  player.lastCombatAt = now;
  if (player.character === 'dia') player.diaFormUntil = 0;
  if (player.character === 'runner') player.sprintUntil = 0;
  if (player.character === 'jet') { player.jetBoostUntil = 0; player.jetBoostStartAt = 0; player.jetShieldUntil = 0; }
  if (player.character === 'reactor') { player.reactorOutput = 0; player.reactorLastDamageAt = 0; }
  if (player.character === 'buffer') player.bufferTargetId = null;
  player.lastPeriodicActionAt = 0;
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
    damage: 0,
    healing: 0,
    tailwindApplications: 0,
    diaFormKills: 0,
    healingPrevented: 0,
    radiationHealingPrevented: 0
  };
}

function ensureMatchStats(player) {
  if (!player.stats) player.stats = makeMatchStats(player.character || null);
  return player.stats;
}

function dealDamageDetailed(room, attackerId, target, amount, now) {
  const raw = Math.max(0, Number(amount) || 0);
  if (raw <= 0 || !target || !target.alive || target.invulnerableUntil > now) return { total: 0, hp: 0, shield: 0 };
  let remaining = raw;
  const shieldBefore = Math.max(0, Number(target.shield) || 0);
  const shieldDamage = Math.min(shieldBefore, remaining);
  if (shieldDamage > 0) {
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
  if (attacker) ensureMatchStats(attacker).damage += total;
  markCombat(room, attackerId, target, now);
  return { total, hp: hpDamage, shield: shieldDamage };
}
function dealDamage(room, attackerId, target, amount, now) { return dealDamageDetailed(room, attackerId, target, amount, now).total; }

function applyHealing(room, healer, target, amount, now) {
  const raw = Math.max(0, Number(amount) || 0);
  const before = Math.max(0, target.hp);
  const missing = Math.max(0, target.maxHp - before);
  if (raw <= 0 || missing <= 0) return 0;

  let effectiveRaw = raw;
  // Harmful anti-heal effects use simple additive reduction. Natural noncombat regen
  // and self-healing do not use this external-healing reduction path.
  const poison = getStatus(target, 'poison', now);
  const radiation = getStatus(target, 'radiation', now);
  if (healer && healer.id !== target.id && (poison || radiation)) {
    const poisonReduction = poison ? clamp(Number(poison.data && poison.data.healReduction) || CHARACTERS.poison.poisonHealReduction, 0, 1) : 0;
    const radiationReduction = radiation ? clamp(Number(radiation.data && radiation.data.healReduction) || CHARACTERS.reactor.radiationHealReduction, 0, 1) : 0;
    const totalReduction = clamp(poisonReduction + radiationReduction, 0, 1);
    effectiveRaw = raw * (1 - totalReduction);

    // Credit prevented healing proportionally to each additive source. With Poison 50%
    // + Radiation 25%, Poison receives 2/3 and Reactor 1/3 of the actually prevented heal.
    const withoutReduction = Math.min(missing, raw);
    const withReduction = Math.min(missing, effectiveRaw);
    const prevented = Math.max(0, withoutReduction - withReduction);
    if (prevented > 0 && totalReduction > 0) {
      if (poison && poisonReduction > 0) {
        const source = room.players.get(poison.sourceId);
        if (source && source.character === 'poison') ensureMatchStats(source).healingPrevented += prevented * (poisonReduction / totalReduction);
      }
      if (radiation && radiationReduction > 0) {
        const source = room.players.get(radiation.sourceId);
        if (source && source.character === 'reactor') ensureMatchStats(source).radiationHealingPrevented += prevented * (radiationReduction / totalReduction);
      }
    }
  }

  const actual = Math.min(missing, effectiveRaw);
  if (actual <= 0) return 0;
  target.hp = before + actual;
  if (healer) ensureMatchStats(healer).healing += actual;
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
    reactorFxBand: player.character === 'reactor' ? (Number(player.reactorOutput || 0) >= 66 ? 2 : (Number(player.reactorOutput || 0) >= 33 ? 1 : 0)) : null,
    bornAt: now
  });
  if (options.sprayLane) room.projectiles.get(id).sprayLane = options.sprayLane;
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
  let spawned = 0;
  if (spawnProjectileFromDirection(room, player, def, now, dx, dy, { sprayLane: 'center' })) spawned += 1;

  const lx = player.x + leftX * offset, ly = player.y + leftY * offset;
  if (spraySideOriginClear(player, lx, ly, sideRadius)) {
    if (spawnProjectileFromDirection(room, player, def, now, leftDx, leftDy, { startX: lx, startY: ly, projectileRadius: sideRadius, damage: sideDamage, sprayLane: 'left' })) spawned += 1;
  }
  const rx = player.x - leftX * offset, ry = player.y - leftY * offset;
  if (spraySideOriginClear(player, rx, ry, sideRadius)) {
    if (spawnProjectileFromDirection(room, player, def, now, rightDx, rightDy, { startX: rx, startY: ry, projectileRadius: sideRadius, damage: sideDamage, sprayLane: 'right' })) spawned += 1;
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
}

function updateProjectiles(room, dt, now) {
  for (const [id, p] of [...room.projectiles.entries()]) {
    const step = p.range - p.traveled;
    if (step <= 0) { room.projectiles.delete(id); continue; }
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
      const valid = p.type === 'attack' ? relation === TARGET_RELATION.ENEMY : relation === TARGET_RELATION.ALLY;
      if (!valid) continue;
      const tr = CHARACTERS[target.character].radius;
      const t = segmentCircleT(p.x, p.y, x2, y2, target.x, target.y, tr + p.radius);
      if (t !== null && t < bestT) { bestT = t; hit = { kind: 'player', target }; }
    }

    if (hit) {
      p.x += dx * Math.min(bestT, 1); p.y += dy * Math.min(bestT, 1);
      if (hit.kind === 'player') {
        const t = hit.target;
        if (p.type === 'attack') {
          if (t.invulnerableUntil <= now) {
            const impactDistance = p.traveled + moveLen * Math.min(bestT, 1);
            const hitDamage = p.distanceDamage ? resolveDistanceDamage(p.distanceDamageBands, impactDistance, p.damage) : p.damage;
            const damageResult = dealDamageDetailed(room, p.ownerId, t, hitDamage, now);
            if (damageResult.total > 0) {
              const owner = room.players.get(p.ownerId);
              if (owner) owner.projectileHitSeq = (owner.projectileHitSeq || 0) + 1;
            }
            const reactorOwner = room.players.get(p.ownerId);
            if (damageResult.hp > 0 && reactorOwner && reactorOwner.alive && reactorOwner.character === 'reactor') {
              const reactorDef = CHARACTERS.reactor;
              reactorOwner.reactorOutput = clamp(
                Number(reactorOwner.reactorOutput || 0) + damageResult.hp / reactorDef.reactorDamagePerOutput,
                0, 100
              );
              reactorOwner.reactorLastDamageAt = now;
              if (reactorOwner.reactorOutput >= reactorDef.reactorHighThreshold) {
                applyStatus(room, reactorOwner, t, 'radiation', reactorDef.radiationDuration * 1000, now, { healReduction: reactorDef.radiationHealReduction });
              }
            }
            // Solar self-heal requires actual HP damage; shield-only hits do not count.
            if (damageResult.hp > 0 && p.selfHealOnHit > 0) {
              const owner = room.players.get(p.ownerId);
              if (owner && owner.alive) applyHealing(room, owner, owner, p.selfHealOnHit, now);
            }
            if (p.burnDps > 0) {
              const owner = room.players.get(p.ownerId);
              applyStatus(room, owner, t, 'burn', p.burnDuration * 1000, now, { dps: p.burnDps });
            }
            if (t.hp <= 0) {
              registerDirectKill(room, p.ownerId, now);
              die(room, t, now);
            }
          }
        } else {
          const healer = room.players.get(p.ownerId);
          const actualHeal = applyHealing(room, healer, t, p.heal, now);
          if (actualHeal > 0 && healer) {
            healer.healHitSeq = (healer.healHitSeq || 0) + 1;
            healer.lastHealTargetId = t.id;
          }
        }
      }
      room.projectiles.delete(id);
      continue;
    }
    p.x = x2; p.y = y2; p.traveled += moveLen;
    if (p.traveled >= p.range - 1e-6) room.projectiles.delete(id);
  }
}

function updateRoom(room, dt, now) {
  updateCompetitiveFlow(room, now);
  if (room.state === 'ended') {
    if (room.endedAt && now - room.endedAt >= 60000) {
      for (const [pid, p] of [...room.players.entries()]) {
        if (p.connected === false) { room.players.delete(pid); room.clients.delete(pid); }
      }
      if (room.hostId && !room.players.has(room.hostId)) room.hostId = [...room.players.values()].find(p => p.connected !== false)?.id || null;
      if (room.players.size === 0 && room.spectators.size === 0) rooms.delete(room.code);
    }
    return;
  }
  if (room.state !== 'playing') return;
  if (now >= room.matchEndAt) {
    room.state = 'ended';
    room.endedAt = now;
    const resolved = resolveMatchWinner(room);
    room.winner = resolved.winner;
    room.winnerReason = resolved.reason;
    room.projectiles.clear();
    room.beams = [];
    for (const p of room.players.values()) p.input.fire = false;
    if (room.mode === 'competitive') recordCompetitiveResult(room, now);
    return;
  }

  room.beams = [];
  for (const player of room.players.values()) {
    const def = CHARACTERS[player.character];
    if (!player.alive) {
      if (now >= player.respawnAt) respawn(room, player, now);
      continue;
    }
    if (player.character === 'dia' && player.diaFormUntil > 0 && now >= player.diaFormUntil) endDiaForm(player);
    if (player.character === 'reactor' && player.reactorOutput > 0) {
      const reactorDef = CHARACTERS.reactor;
      if (player.reactorLastDamageAt > 0 && now - player.reactorLastDamageAt >= reactorDef.reactorDecayDelay * 1000) {
        player.reactorOutput = Math.max(0, player.reactorOutput - reactorDef.reactorDecayPerSecond * dt);
      }
    }
    if (player.character === 'jet' && player.jetShieldUntil > 0 && now >= player.jetShieldUntil) {
      player.jetShieldUntil = 0;
      clearShield(player);
    }
    const burn = getStatus(player, 'burn', now);
    if (burn && player.invulnerableUntil <= now) {
      const burnDps = Math.max(0, Number(burn.data && burn.data.dps) || 0);
      dealDamage(room, burn.sourceId, player, burnDps * dt, now);
      if (player.hp <= 0) {
        registerKill(room, burn.sourceId, now, false);
        die(room, player, now);
        continue;
      }
    }

    if (player.hp < player.maxHp && now - player.lastCombatAt >= NONCOMBAT_REGEN_DELAY_MS) {
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
    const speed = effectiveSpeed(player, now);
    movePlayer(player, mx * speed * dt, my * speed * dt, def.radius);

    if (player.character === 'buffer') {
      const link = bufferLinkState(room, player, now);
      if (!link.target && player.bufferTargetId) player.bufferTargetId = null;
      if (link.active) applyHealing(room, player, link.target, def.linkHealHps * dt, now);
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

  let aInB = false, bInB = false, bInA = false, aInA = false;
  for (const p of room.players.values()) {
    if (!p.alive || p.connected === false) continue;
    if (p.y >= WORLD.bZoneStart) { if (p.team === 'A') aInB = true; else bInB = true; }
    if (p.y <= WORLD.aZoneEnd) { if (p.team === 'B') bInA = true; else aInA = true; }
  }
  if (aInB && !bInB) room.scoreA += dt;
  if (bInA && !aInA) room.scoreB += dt;
}

function snapshot(room, viewerId = null, spectator = false) {
  const now = Date.now();
  const viewer = viewerId ? room.players.get(viewerId) : null;
  const hideEnemyPicks = room.state === 'lobby' && room.mode !== 'competitive' && !!viewer;
  const hideAllPicks = room.state === 'lobby' && room.mode !== 'competitive' && spectator;
  return {
    type: 'state', state: room.state, mode: room.mode || 'normal', room: room.code, hostId: room.hostId,
    scoreA: room.scoreA, scoreB: room.scoreB,
    competitive: competitiveSnapshot(room, viewer, spectator, now),
    timeLeft: room.state === 'playing' ? Math.max(0, (room.matchEndAt - now) / 1000) : 0,
    winner: room.winner,
    winnerReason: room.winnerReason || null,
    teamKills: teamKillTotals(room),
    players: [...room.players.values()].map(p => {
      const hideCharacter = hideAllPicks || (hideEnemyPicks && p.team !== viewer.team);
      const burnStatus = getStatus(p, 'burn', now);
      const radiationStatus = getStatus(p, 'radiation', now);
      return {
        id: p.id, name: p.name, team: p.team, character: hideCharacter ? null : p.character,
        x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, shield: Math.max(0, p.shield || 0), maxShield: Math.max(0, p.maxShield || 0), alive: p.alive, connected: p.connected !== false,
        respawnMs: p.alive ? 0 : Math.max(0, p.respawnAt - now),
        invulnerable: p.alive && p.invulnerableUntil > now,
        invulnerableMs: p.alive ? Math.max(0, p.invulnerableUntil - now) : 0,
        aimX: p.aimX, aimY: p.aimY,
        burning: !!burnStatus, burnSourceId: burnStatus ? burnStatus.sourceId : null, poisoned: hasStatus(p, 'poison', now), radiated: !!radiationStatus, radiationSourceId: radiationStatus ? radiationStatus.sourceId : null, tailwind: hasStatus(p, 'tailwind', now), frozen: hasStatus(p, 'slow', now), stunned: hasStatus(p, 'stun', now),
        diaForm: !hideCharacter && isDiaForm(p, now),
        diaFormMs: !hideCharacter && isDiaForm(p, now) ? Math.max(0, p.diaFormUntil - now) : 0,
        diaCooldownMs: !hideCharacter && p.character === 'dia' ? Math.max(0, p.diaCooldownUntil - now) : 0,
        sprint: !hideCharacter && p.character === 'runner' && p.sprintUntil > now,
        sprintMs: !hideCharacter && p.character === 'runner' && p.sprintUntil > now ? Math.max(0, p.sprintUntil - now) : 0,
        sprintCooldownMs: !hideCharacter && p.character === 'runner' ? Math.max(0, p.sprintCooldownUntil - now) : 0,
        windTailwindMs: !hideCharacter && p.character === 'wind' ? Math.max(0, (getStatus(p, 'tailwind', now)?.until || 0) - now) : 0,
        windTailwindCooldownMs: !hideCharacter && p.character === 'wind' ? Math.max(0, p.windTailwindCooldownUntil - now) : 0,
        angelBlessCooldownMs: !hideCharacter && p.character === 'angel' ? Math.max(0, p.angelBlessCooldownUntil - now) : 0,
        jetBoost: !hideCharacter && p.character === 'jet' && p.jetBoostUntil > now,
        jetBoostMs: !hideCharacter && p.character === 'jet' && p.jetBoostUntil > now ? Math.max(0, p.jetBoostUntil - now) : 0,
        jetBoostCooldownMs: !hideCharacter && p.character === 'jet' ? Math.max(0, p.jetBoostCooldownUntil - now) : 0,
        jetBoostStartX: !hideCharacter && p.character === 'jet' ? Number(p.jetBoostStartX || 0) : 0,
        jetBoostStartY: !hideCharacter && p.character === 'jet' ? Number(p.jetBoostStartY || 0) : 0,
        jetBoostEndX: !hideCharacter && p.character === 'jet' ? Number(p.jetBoostEndX || 0) : 0,
        jetBoostEndY: !hideCharacter && p.character === 'jet' ? Number(p.jetBoostEndY || 0) : 0,
        jetBoostDistance: !hideCharacter && p.character === 'jet' ? Number(p.jetBoostDistance || 0) : 0,
        jetShieldMs: !hideCharacter && p.character === 'jet' && p.jetShieldUntil > now ? Math.max(0, p.jetShieldUntil - now) : 0,
        reactorOutput: !hideCharacter && p.character === 'reactor' ? clamp(Number(p.reactorOutput) || 0, 0, 100) : 0,
        bufferTargetId: !hideCharacter && p.character === 'buffer' ? (resolveBufferTarget(room, p)?.id || null) : null,
        bufferLinkActive: !hideCharacter && p.character === 'buffer' ? bufferLinkState(room, p, now).active : false,
        shotSeq: p.shotSeq || 0, projectileHitSeq: p.projectileHitSeq || 0, healHitSeq: p.healHitSeq || 0,
        lastHealTargetId: p.lastHealTargetId || null, abilityUseSeq: p.abilityUseSeq || 0, lastAbilityTargetId: p.lastAbilityTargetId || null,
        stats: room.state === 'ended' ? { ...ensureMatchStats(p) } : null
      };
    }),
    projectiles: [...room.projectiles.values()].map(p => ({ id: p.id, x: p.x, y: p.y, radius: p.radius, type: p.type, team: p.team, character: p.character, reactorFxBand: p.reactorFxBand == null ? null : p.reactorFxBand })),
    beams: room.beams.map(b => ({ ownerId: b.ownerId, team: b.team, character: b.character, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, healedId: b.healedId || null, hitEnemyId: b.hitEnemyId || null, impact: b.impact || null, didDamage: !!b.didDamage }))
  };
}

function broadcast(room) {
  for (const [playerId, conn] of room.clients.entries()) conn.send(snapshot(room, playerId));
  for (const conn of room.spectators.values()) conn.send(snapshot(room, null, true));
}

if (require.main === module) {
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) updateRoom(room, DT, now);
  }, 1000 / TICK_RATE);

  setInterval(() => {
    for (const room of rooms.values()) broadcast(room);
  }, 1000 / SNAPSHOT_RATE);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`
School Line Mobile ${GAME_VERSION} · Competitive Mode`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`LAN:   http://<이 컴퓨터의 IPv4 주소>:${PORT}
`);
  });
}

module.exports = {
  server, CHARACTERS, TARGET_RELATION, STATUS_DEFS,
  getTargetRelation, isTargetRelationAllowed, resolveTargetedAbilityTarget,
  applyStatus, getStatus, hasStatus, clearStatus, clearAllStatuses, isStunned,
  applyShield, clearShield, dealDamage, dealDamageDetailed, applyHealing,
  effectiveSpeed, resolveBufferTarget, bufferLinkState, setBufferTarget, clearBufferTargetRefs, periodicActionRateMultiplier, periodicActionReady,
  updateRoom, snapshot, speedWithTierDelta, hasLineOfSight,
  makeMatchStats, newRoom, spawnProjectile, spawnSprayVolley, spawnSolarProjectile, updateProjectiles,
  traceBeam, traceLightBeam, activateDiaForm, activateRunnerSprint, activateWindTailwind, activateJetBoost, finishJetBoost, updateJetBoostPosition, endDiaForm,
  registerDirectKill, die, respawn, resumeRoom, disconnect, neutralizePlayerInput, safeResumeToken,
  startCompetitiveDraft, resolveCompetitiveBan, commitCompetitivePick, autoCompetitivePick, enterCompetitiveReady, swapCompetitiveReadyAssignments, finalizeCompetitiveReady, updateCompetitiveFlow, recordCompetitiveResult,
  competitiveAvailableCharacters, currentCompetitivePickerId, publicCompetitiveStats, saveCompetitiveStats, isExactCompetitiveRoster, normalizeCompetitiveStats, normalizeStatsVersion, statsVersionFromMatch,
  teamKillTotals, resolveMatchWinner
};
