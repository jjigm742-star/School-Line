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
const RESPAWN_MS = 5000;

const WORLD = { width: 42, height: 68, aZoneEnd: 18, bZoneStart: 50 };
const SPEED_TIERS = [3.2, 4.0, 5.0, 6.0, 7.2, 8.2];

const WALLS = [
  { x: 5, y: 24, w: 10, h: 3 },
  { x: 27, y: 24, w: 10, h: 3 },
  { x: 18, y: 31, w: 6, h: 6 },
  { x: 5, y: 41, w: 10, h: 3 },
  { x: 27, y: 41, w: 10, h: 3 }
];

const CHARACTERS = {
  iron: {
    name: '아이언', role: '탱커', hp: 600, speed: 4.0, radius: 0.65,
    fireRate: 5, range: 24, projectileSpeed: 14, projectileRadius: 0.20,
    projectileType: 'attack', damage: 13
  },
  shooter: {
    name: '슈터', role: '딜러', hp: 250, speed: 5.0, radius: 0.50,
    fireRate: 5, range: 24, projectileSpeed: 28, projectileRadius: 0.12,
    projectileType: 'attack', damage: 20
  },
  cannon: {
    name: '캐논', role: '딜러', hp: 275, speed: 3.2, radius: 0.65,
    fireRate: 10, range: 24, projectileSpeed: 28, projectileRadius: 0.20,
    projectileType: 'attack', damage: 14
  },
  fire: {
    name: '파이어', role: '딜러', hp: 200, speed: 6.0, radius: 0.50,
    fireRate: 5, range: 24, projectileSpeed: 28, projectileRadius: 0.12,
    projectileType: 'attack', damage: 16, burnDps: 10, burnDuration: 2
  },
  water: {
    name: '워터', role: '힐러', hp: 250, speed: 5.0, radius: 0.40,
    fireRate: 5, range: 24, projectileSpeed: 20, projectileRadius: 0.12,
    projectileType: 'heal', heal: 13
  },
  wind: {
    name: '윈드', role: '힐러', hp: 225, speed: 6.0, radius: 0.40,
    fireRate: 5, range: 24, projectileSpeed: 20, projectileRadius: 0.35,
    projectileType: 'heal', heal: 11, tailwindDuration: 2
  },
  light: {
    name: '라이트', role: '힐러', hp: 225, speed: 6.0, radius: 0.40,
    attackType: 'lightBeam', range: 16, healHps: 55, beamDps: 60
  },
  laser: {
    name: '레이저', role: '딜러', hp: 275, speed: 5.0, radius: 0.50,
    attackType: 'beam', range: 16, beamDps: 80, maxHpDpsRatio: 0.10
  },
  ice: {
    name: '아이스', role: '딜러', hp: 275, speed: 5.0, radius: 0.50,
    attackType: 'beam', range: 16, beamDps: 80,
    slowTierDelta: -1, slowDuration: 1.5
  },
  dia: {
    name: '다이아', role: '탱커', hp: 350, speed: 4.0, radius: 0.65,
    fireRate: 5, range: 24, projectileSpeed: 20, projectileRadius: 0.12,
    projectileType: 'attack', damage: 13,
    formDuration: 6, formCooldown: 16, formHp: 400, formSpeed: 5.0,
    formRange: 16, formBeamDps: 80
  }
};

const rooms = new Map();
let idCounter = 1;

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
function validCharacter(value) { return CHARACTERS[value] ? value : 'shooter'; }
function speedWithTierDelta(speed, delta) {
  let best = 0;
  for (let i = 1; i < SPEED_TIERS.length; i++) {
    if (Math.abs(SPEED_TIERS[i] - speed) < Math.abs(SPEED_TIERS[best] - speed)) best = i;
  }
  return SPEED_TIERS[clamp(best + delta, 0, SPEED_TIERS.length - 1)];
}

function isDiaForm(player, now) {
  return player.character === 'dia' && player.diaFormUntil > now;
}

function currentAttackDef(player, now) {
  const def = CHARACTERS[player.character];
  if (isDiaForm(player, now)) {
    return { attackType: 'beam', range: def.formRange, beamDps: def.formBeamDps, maxHpDpsRatio: 0 };
  }
  return def;
}

function currentBaseSpeed(player, now) {
  const def = CHARACTERS[player.character];
  return isDiaForm(player, now) ? def.formSpeed : def.speed;
}

function effectiveSpeed(player, now) {
  let delta = 0;
  if (player.tailwindUntil > now) delta += 1;
  if (player.iceSlowUntil > now) delta -= 1;
  return speedWithTierDelta(currentBaseSpeed(player, now), delta);
}

function mimeType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' })[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
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

function makeWsConnection(socket) {
  const conn = {
    socket,
    buffer: Buffer.alloc(0),
    closed: false,
    playerId: null,
    roomCode: null,
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

  const conn = makeWsConnection(socket);
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
    players: new Map(),
    clients: new Map(),
    projectiles: new Map(),
    beams: [],
    hostId: null,
    scoreA: 0,
    scoreB: 0,
    matchEndAt: 0,
    winner: null,
    projectileCounter: 1
  };
}

function countTeam(room, team) {
  let n = 0;
  for (const p of room.players.values()) if (p.team === team) n++;
  return n;
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
  if (msg.type === 'join') return joinRoom(conn, msg);
  const room = rooms.get(conn.roomCode);
  if (!room || !conn.playerId) return;
  const player = room.players.get(conn.playerId);
  if (!player) return;

  if (msg.type === 'select' && room.state !== 'playing') {
    player.character = validCharacter(msg.character);
    const def = CHARACTERS[player.character];
    player.maxHp = def.hp; player.hp = Math.min(player.hp, def.hp);
    player.iceSlowUntil = 0; player.diaFormUntil = 0; player.diaCooldownUntil = 0;
    broadcast(room);
    return;
  }
  if (msg.type === 'start' && room.hostId === player.id && room.state !== 'playing') {
    startMatch(room);
    return;
  }
  if (msg.type === 'ability' && room.state === 'playing') {
    if (msg.ability === 'form') activateDiaForm(player, Date.now());
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

function joinRoom(conn, msg) {
  if (conn.playerId) return;
  const code = safeRoom(msg.room);
  let room = rooms.get(code);
  if (!room) { room = newRoom(code); rooms.set(code, room); }
  if (room.players.size >= 8) { conn.send({ type: 'error', message: '이 방은 이미 8명입니다.' }); return; }
  if (room.state === 'playing') { conn.send({ type: 'error', message: '이미 경기가 진행 중입니다.' }); return; }

  const team = countTeam(room, 'A') <= countTeam(room, 'B') ? 'A' : 'B';
  const id = `P${idCounter++}`;
  const character = validCharacter(msg.character);
  const def = CHARACTERS[character];
  const player = {
    id, name: safeName(msg.name), team, character,
    x: 21, y: team === 'A' ? 5 : 63,
    hp: def.hp, maxHp: def.hp, alive: true, respawnAt: 0,
    aimX: 21, aimY: team === 'A' ? 20 : 48,
    input: { up: false, down: false, left: false, right: false, fire: false },
    nextFireAt: 0,
    burnUntil: 0, burnDps: 0,
    tailwindUntil: 0, iceSlowUntil: 0,
    diaFormUntil: 0, diaCooldownUntil: 0
  };
  room.players.set(id, player);
  room.clients.set(id, conn);
  if (!room.hostId) room.hostId = id;
  conn.playerId = id; conn.roomCode = code;
  const sp = spawnPoint(room, player); player.x = sp.x; player.y = sp.y;
  conn.send({ type: 'joined', id, room: code, config: { world: WORLD, walls: WALLS, characters: publicCharacterDefs() } });
  broadcast(room);
}

function publicCharacterDefs() {
  const out = {};
  for (const [id, c] of Object.entries(CHARACTERS)) {
    out[id] = {
      name: c.name, role: c.role, hp: c.hp, speed: c.speed,
      fireRate: c.fireRate || 0, projectileType: c.projectileType || null, attackType: c.attackType || 'projectile'
    };
  }
  return out;
}

function disconnect(conn) {
  if (conn.closed && !conn.playerId) return;
  conn.closed = true;
  const room = rooms.get(conn.roomCode);
  if (!room || !conn.playerId) return;
  room.players.delete(conn.playerId);
  room.clients.delete(conn.playerId);
  for (const [pid, proj] of room.projectiles) if (proj.ownerId === conn.playerId) room.projectiles.delete(pid);
  if (room.hostId === conn.playerId) room.hostId = room.players.keys().next().value || null;
  if (room.players.size === 0) rooms.delete(room.code); else broadcast(room);
  conn.playerId = null; conn.roomCode = null;
}

function startMatch(room) {
  room.state = 'playing';
  room.scoreA = 0; room.scoreB = 0; room.winner = null;
  room.matchEndAt = Date.now() + MATCH_SECONDS * 1000;
  room.projectiles.clear();
  room.beams = [];
  for (const p of room.players.values()) {
    const def = CHARACTERS[p.character];
    const sp = spawnPoint(room, p);
    Object.assign(p, {
      x: sp.x, y: sp.y, hp: def.hp, maxHp: def.hp, alive: true, respawnAt: 0,
      nextFireAt: 0, burnUntil: 0, burnDps: 0, tailwindUntil: 0, iceSlowUntil: 0,
      diaFormUntil: 0, diaCooldownUntil: 0
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

function endDiaForm(player) {
  if (player.character !== 'dia' || player.diaFormUntil <= 0) return;
  const def = CHARACTERS.dia;
  player.diaFormUntil = 0;
  player.maxHp = def.hp;
  player.hp = Math.min(player.hp, def.hp);
}

function registerDirectKill(room, attackerId, now) {
  const attacker = room.players.get(attackerId);
  if (!attacker || !attacker.alive || !isDiaForm(attacker, now)) return;
  attacker.diaCooldownUntil = Math.max(now, attacker.diaCooldownUntil - 6000);
}

function die(room, player, now) {
  player.hp = 0;
  player.alive = false;
  player.respawnAt = now + RESPAWN_MS;
  player.burnUntil = 0; player.burnDps = 0; player.tailwindUntil = 0; player.iceSlowUntil = 0;
  if (player.character === 'dia') {
    player.diaFormUntil = 0;
    player.maxHp = CHARACTERS.dia.hp;
  }
  player.input.fire = false;
}

function respawn(room, player) {
  const def = CHARACTERS[player.character];
  const sp = spawnPoint(room, player);
  player.x = sp.x; player.y = sp.y;
  player.hp = def.hp; player.maxHp = def.hp;
  player.alive = true; player.respawnAt = 0;
  player.burnUntil = 0; player.burnDps = 0; player.tailwindUntil = 0; player.iceSlowUntil = 0;
  if (player.character === 'dia') player.diaFormUntil = 0;
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
    if (!target.alive || target.id === player.id || target.team === player.team) continue;
    const tr = CHARACTERS[target.character].radius;
    const t = segmentCircleT(x1, y1, x2, y2, target.x, target.y, tr);
    if (t !== null && t > 1e-6 && t < bestT) { bestT = t; hit = { kind: 'player', target }; }
  }

  const endX = x1 + (x2 - x1) * bestT;
  const endY = y1 + (y2 - y1) * bestT;
  room.beams.push({ ownerId: player.id, team: player.team, character: player.character, x1, y1, x2: endX, y2: endY });

  if (hit && hit.kind === 'player') {
    const target = hit.target;
    const dps = def.beamDps + target.maxHp * (def.maxHpDpsRatio || 0);
    target.hp -= dps * dt;
    if (def.slowTierDelta < 0) target.iceSlowUntil = now + def.slowDuration * 1000;
    if (target.hp <= 0) {
      registerDirectKill(room, player.id, now);
      die(room, target, now);
    }
  }
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
    if (target.team === player.team) {
      if (!healedAlly) healedAlly = target;
      continue;
    }
    enemyHit = target;
    endT = hit.t;
    break;
  }

  if (healedAlly) healedAlly.hp = Math.min(healedAlly.maxHp, healedAlly.hp + def.healHps * dt);
  if (enemyHit) {
    enemyHit.hp -= def.beamDps * dt;
    if (enemyHit.hp <= 0) {
      registerDirectKill(room, player.id, now);
      die(room, enemyHit, now);
    }
  }

  const endX = x1 + (x2 - x1) * endT;
  const endY = y1 + (y2 - y1) * endT;
  room.beams.push({
    ownerId: player.id, team: player.team, character: player.character,
    x1, y1, x2: endX, y2: endY, healedId: healedAlly ? healedAlly.id : null, hitEnemyId: enemyHit ? enemyHit.id : null
  });
}

function spawnProjectile(room, player, def, now) {
  let dx = player.aimX - player.x, dy = player.aimY - player.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return;
  dx /= len; dy /= len;
  const startOffset = def.radius + def.projectileRadius + 0.04;
  const id = `B${room.projectileCounter++}`;
  room.projectiles.set(id, {
    id, ownerId: player.id, team: player.team, character: player.character,
    type: def.projectileType,
    x: player.x + dx * startOffset,
    y: player.y + dy * startOffset,
    vx: dx * def.projectileSpeed,
    vy: dy * def.projectileSpeed,
    radius: def.projectileRadius,
    damage: def.damage || 0,
    heal: def.heal || 0,
    range: def.range,
    traveled: 0,
    burnDps: def.burnDps || 0,
    burnDuration: def.burnDuration || 0,
    tailwindDuration: def.tailwindDuration || 0,
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
      const valid = p.type === 'attack' ? target.team !== p.team : target.team === p.team;
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
          t.hp -= p.damage;
          if (p.burnDps > 0) { t.burnDps = p.burnDps; t.burnUntil = now + p.burnDuration * 1000; }
          if (t.hp <= 0) {
            registerDirectKill(room, p.ownerId, now);
            die(room, t, now);
          }
        } else {
          t.hp = Math.min(t.maxHp, t.hp + p.heal);
          if (p.tailwindDuration > 0) t.tailwindUntil = now + p.tailwindDuration * 1000;
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
  if (room.state !== 'playing') return;
  if (now >= room.matchEndAt) {
    room.state = 'ended';
    room.winner = room.scoreA === room.scoreB ? 'DRAW' : (room.scoreA > room.scoreB ? 'A' : 'B');
    room.projectiles.clear();
    room.beams = [];
    for (const p of room.players.values()) p.input.fire = false;
    return;
  }

  room.beams = [];
  for (const player of room.players.values()) {
    const def = CHARACTERS[player.character];
    if (!player.alive) {
      if (now >= player.respawnAt) respawn(room, player);
      continue;
    }
    if (player.character === 'dia' && player.diaFormUntil > 0 && now >= player.diaFormUntil) endDiaForm(player);
    if (player.burnUntil > now) {
      player.hp -= player.burnDps * dt;
      if (player.hp <= 0) { die(room, player, now); continue; }
    } else { player.burnDps = 0; }

    let mx = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
    let my = (player.input.down ? 1 : 0) - (player.input.up ? 1 : 0);
    const ml = Math.hypot(mx, my);
    if (ml > 0) { mx /= ml; my /= ml; }
    const speed = effectiveSpeed(player, now);
    movePlayer(player, mx * speed * dt, my * speed * dt, def.radius);

    if (player.input.fire) {
      const attackDef = currentAttackDef(player, now);
      if (attackDef.attackType === 'beam') {
        traceBeam(room, player, attackDef, dt, now);
      } else if (attackDef.attackType === 'lightBeam') {
        traceLightBeam(room, player, attackDef, dt, now);
      } else if (now >= player.nextFireAt) {
        spawnProjectile(room, player, attackDef, now);
        player.nextFireAt = now + 1000 / attackDef.fireRate;
      }
    }
  }

  updateProjectiles(room, dt, now);

  let aInB = false, bInB = false, bInA = false, aInA = false;
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    if (p.y >= WORLD.bZoneStart) { if (p.team === 'A') aInB = true; else bInB = true; }
    if (p.y <= WORLD.aZoneEnd) { if (p.team === 'B') bInA = true; else aInA = true; }
  }
  if (aInB && !bInB) room.scoreA += dt;
  if (bInA && !aInA) room.scoreB += dt;
}

function snapshot(room) {
  const now = Date.now();
  return {
    type: 'state', state: room.state, room: room.code, hostId: room.hostId,
    scoreA: room.scoreA, scoreB: room.scoreB,
    timeLeft: room.state === 'playing' ? Math.max(0, (room.matchEndAt - now) / 1000) : 0,
    winner: room.winner,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, team: p.team, character: p.character,
      x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp, alive: p.alive,
      respawnMs: p.alive ? 0 : Math.max(0, p.respawnAt - now),
      aimX: p.aimX, aimY: p.aimY,
      burning: p.burnUntil > now, tailwind: p.tailwindUntil > now, frozen: p.iceSlowUntil > now,
      diaForm: isDiaForm(p, now),
      diaFormMs: isDiaForm(p, now) ? Math.max(0, p.diaFormUntil - now) : 0,
      diaCooldownMs: p.character === 'dia' ? Math.max(0, p.diaCooldownUntil - now) : 0
    })),
    projectiles: [...room.projectiles.values()].map(p => ({ id: p.id, x: p.x, y: p.y, radius: p.radius, type: p.type, team: p.team, character: p.character })),
    beams: room.beams.map(b => ({ ownerId: b.ownerId, team: b.team, character: b.character, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, healedId: b.healedId || null, hitEnemyId: b.hitEnemyId || null }))
  };
}

function broadcast(room) {
  const data = snapshot(room);
  for (const conn of room.clients.values()) conn.send(data);
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) updateRoom(room, DT, now);
}, 1000 / TICK_RATE);

setInterval(() => {
  for (const room of rooms.values()) broadcast(room);
}, 1000 / SNAPSHOT_RATE);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nSchool Line Mobile Alpha 0.3`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`LAN:   http://<이 컴퓨터의 IPv4 주소>:${PORT}\n`);
});
