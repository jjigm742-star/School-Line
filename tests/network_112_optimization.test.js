'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

// Standalone transport regression. No PostgreSQL, no external WebSocket package.
const root = path.join(__dirname, '..');
const oldServer = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const oldClient = fs.readFileSync(path.join(root, 'public', 'game.js'), 'utf8');
const original = fs.readFileSync(path.join(root, 'tests', 'patch111.test.js'), 'utf8');
const s = require('../server');

assert.match(oldServer, /const BALANCE_VERSION = '1\.12'/);
assert.match(oldServer, /const GAME_VERSION = '1\.12'/);
assert.match(oldServer, /const COMPETITIVE_STATS_SCHEMA_VERSION = 7/);
assert.match(oldServer, /WS_STALE_TIMEOUT_MS.*35000/);
assert.match(oldServer, /'stale_pong_timeout'/);
assert.match(oldClient, /function beginSessionReconnect\(/);
assert.match(oldClient, /function attemptSessionReconnect\(/);
assert.match(oldClient, /type:'resume'/);
assert.doesNotMatch(oldClient, /alert\(spectatorMode.*location\.reload\(\)/s, 'the automatic-reconnect path no longer reloads');
assert.match(oldServer, /monitorEventLoopDelay/);
assert.match(oldClient, /schoolLineNetworkHealth/);

const before = s.publicNetworkStats();
assert.equal(typeof before.eventLoopMaxDelayMs, 'number');
assert.equal(typeof before.massDisconnectWarnings, 'number');
assert.ok(Array.isArray(before.recentDisconnects));

// Test actual websocket frame + backpressure (full-sync is not allowed to bypass the limit).
const socket = new EventEmitter();
socket.destroyed = false;
socket.writableLength = 262145;
socket.output = [];
socket.write = b => { socket.output.push(b); return true; };
socket.end = () => {};
socket.destroy = () => {socket.destroyed=true;};
const clientConn = s.makeWsConnection(socket, 'no-log-ip');
assert.equal(clientConn.sendSerialized('{}','live_state'), false);
assert.equal(clientConn.sendSerialized('{}','live_state_sync'), false);
socket.writableLength = 0;
assert.equal(clientConn.sendSerialized('{}','live_state_sync'), true);
assert.equal(socket.output.length, 1);

// Test live broadcast: a skipped client receives an authoritative full state on next writable packet.
const room = s.newRoom('R_NETWORK_TEST', { displayNumber: 1, mode:'competitive' });
room.state='playing'; room.matchMode='competitive';
room.matchStartedAt = Date.now(); room.matchEndAt = Date.now()+180000;
room.clients.set('P1', clientConn);
const otherFrames = [];
const otherConn = { needsFullSync:false, sendSerialized(text, kind) { otherFrames.push({payload:JSON.parse(text),kind}); return true; } };
room.clients.set('P2', otherConn);
socket.writableLength = 262145;
assert.equal(s.broadcast(room, Date.now()), true);
assert.equal(clientConn.needsFullSync, true);
assert.equal(otherFrames[0].kind, 'live_state');
socket.writableLength = 0;
const prevWrites = socket.output.length;
// Can be within the same budget second; room has no players and negligible payload.
assert.equal(s.broadcast(room, Date.now()+110), true);
assert.equal(clientConn.needsFullSync, false);
assert.equal(socket.output.length, prevWrites+1);
const rawFrame = socket.output.at(-1);
const hdrLen = rawFrame[1] < 126 ? 2 : rawFrame[1] === 126 ? 4 : 10;
const recovered = JSON.parse(rawFrame.subarray(hdrLen).toString());
assert.equal(recovered.wireFormat, 'c6');
assert.ok(Array.isArray(recovered.playerMeta), 'full sync includes player metadata');
assert.ok(Array.isArray(recovered.projectileSync), 'full sync includes all current projectiles');

// Diagnostics must never store the remote address in public metrics.
clientConn.playerId = 'P1';
clientConn.roomCode = 'R_NETWORK_TEST';
s.recordConnectionClose(clientConn,'test_socket_close');
const diagnostics = s.publicNetworkStats();
assert.equal(diagnostics.disconnectsByReason.test_socket_close,1);
assert.equal(diagnostics.recentDisconnects.at(-1).reason,'test_socket_close');
assert.equal(JSON.stringify(diagnostics).includes('no-log-ip'),false);
assert.ok(diagnostics.droppedBackpressure >= before.droppedBackpressure+2);
console.log('1.12 preserved network optimization transport tests PASSED');
