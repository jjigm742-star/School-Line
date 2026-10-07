'use strict';
const school = require('../server');
function assert(condition, message) { if (!condition) throw new Error(message); }

assert(school.statsSeriesForBalanceVersion('1.6.2') === '1.7', 'current reset must map to stats 1.7');
assert(school.statsSeriesForBalanceVersion('1.7.0') === '1.7', '1.7.x must share stats 1.7');
assert(school.statsSeriesForBalanceVersion('1.7.9') === '1.7', '1.7 patch must not split');
assert(school.statsSeriesForBalanceVersion('1.8.0') === '1.8', '1.8 must split automatically');
assert(school.statsSeriesForBalanceVersion('2.0.1') === '2.0', '2.0 must split automatically');

function match(id, version, available, character) {
  return {
    matchId:id, statsVersion:version, balanceVersion:`${version}.0`, endedAt:'2026-10-06T00:00:00.000Z',
    availableCharacters:available, bans:[], winner:'A',
    finalAssignments:[{ playerId:`p-${id}`, character, team:'A' }],
    players:[{ playerId:`p-${id}`, stats:{ ultimateUses:1 } }]
  };
}
const oldRoster = match('m1', '1.7', ['old','support'], 'old');
const newRoster = match('m2', '1.7', ['old','support','new'], 'new');
const nextVersion = match('m3', '1.8', ['old','support','new'], 'new');
const rebuilt = school.rebuildCompetitiveStatsFromMatches([oldRoster,newRoster,newRoster,nextVersion]);
assert(rebuilt.totalMatches === 3, 'duplicate match_id must be ignored');
assert(rebuilt.versions['1.7'].totalMatches === 2, '1.7 count');
assert(rebuilt.versions['1.8'].totalMatches === 1, '1.8 separate count');
assert(rebuilt.versions['1.7'].characters.new.availableMatches === 1, 'new character denominator begins only after roster availability');
assert(rebuilt.versions['1.7'].characters.new.picks === 1, 'new character pick recorded');
assert(rebuilt.versions['1.7'].characters.old.availableMatches === 2, 'existing character remains available across both 1.7 matches');
console.log('School Line stats 1.7 self-test: OK');
