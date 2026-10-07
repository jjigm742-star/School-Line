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


const comboRows = school.combinations(['a','b','c','d'], 2);
assert(comboRows.length === 6, '4C2 combinations must produce six pairs');
assert(comboRows.some(row => row.join('|') === 'a|b'), 'combinations must include a|b');

const advancedFixture = {
  matchId:'adv1', statsVersion:'1.7', balanceVersion:'1.6.2', winner:'A', firstPickTeam:'A',
  bans:[], picks:[], dataQuality:{ complete:true },
  finalAssignments:[
    {playerId:'a1',team:'A',character:'angel'}, {playerId:'a2',team:'A',character:'cannon'},
    {playerId:'a3',team:'A',character:'solar'}, {playerId:'a4',team:'A',character:'spray'},
    {playerId:'b1',team:'B',character:'buffer'}, {playerId:'b2',team:'B',character:'poison'},
    {playerId:'b3',team:'B',character:'reactor'}, {playerId:'b4',team:'B',character:'shield'}
  ],
  players:[
    {playerId:'a1',playerName:'A1',stats:{kills:1,deaths:0,assists:2}},
    {playerId:'a2',playerName:'A2',stats:{kills:1,deaths:0,assists:2}},
    {playerId:'a3',playerName:'A3',stats:{kills:1,deaths:0,assists:2}},
    {playerId:'a4',playerName:'A4',stats:{kills:1,deaths:0,assists:2}},
    {playerId:'b1',playerName:'B1',stats:{kills:0,deaths:1,assists:0}},
    {playerId:'b2',playerName:'B2',stats:{kills:0,deaths:1,assists:0}},
    {playerId:'b3',playerName:'B3',stats:{kills:0,deaths:1,assists:0}},
    {playerId:'b4',playerName:'B4',stats:{kills:0,deaths:1,assists:0}}
  ]
};
const adv = school.buildAdvancedCompetitiveStats([advancedFixture], {});
assert(adv.synergy.pairs.length === 12, 'one complete 4v4 match must yield 12 unique team pair rows');
assert(adv.synergy.trios.length === 8, 'one complete 4v4 match must yield 8 unique team trio rows');
assert(adv.synergy.compositions.length === 2, 'one complete match must yield two 4-character compositions');

console.log('School Line stats 1.7 self-test: OK');
