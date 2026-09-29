import assert from 'node:assert/strict';
import { personNamesLooselyMatch } from './person-name-match.ts';

assert.equal(
  personNamesLooselyMatch('Mr. OHAMEZE CHINEDU FRANCIS', 'Mr FRANCIS CHINEDU OHAMEZE'),
  true,
);
assert.equal(
  personNamesLooselyMatch('Mr. ALEX SOLOMON OSIREGBEMHE', 'Mr OSIREGBEMHE SOLOMON ALEX'),
  true,
);
assert.equal(personNamesLooselyMatch('Mr Chris', 'Chris Ijeli'), false);
assert.equal(personNamesLooselyMatch('Mr IJELI CHRIS', 'Mr CHRIS IJELI'), true);
assert.equal(personNamesLooselyMatch('', 'Mr FRANCIS CHINEDU OHAMEZE'), false);
