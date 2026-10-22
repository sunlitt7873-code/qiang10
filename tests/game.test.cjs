'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { DECKS, Game } = require('../game-v09.js');

// Independent visual audit of the two user-supplied sheets, in row-major order.
const audit = {
  fish: [[3,2],[5,4],[2,5],[4,1],[1,4],[5,3]],
  turtle: [[3,2],[6,4],[2,5],[4,1],[1,6],[5,3]]
};
function makeGame(family = 'fish') {
  let time = 1000;
  const game = new Game({ now: () => time, random: () => family === 'fish' ? 0.17 : 0.73 });
  game.start();
  return { game, advance: ms => time += ms };
}
function permutations(list) {
  if (!list.length) return [[]];
  return list.flatMap((value, i) => permutations(list.filter((_, j) => i !== j)).map(rest => [value, ...rest]));
}

test('each verified picture has its own local asset and matching counts', () => {
  for (const [family, values] of Object.entries(audit)) {
    assert.deepEqual(DECKS[family].cards.map(c => [c.d,c.o]), values);
    for (const [slot, card] of DECKS[family].cards.entries()) {
      assert.equal(card.image, `assets/cards-v09/${family}-${slot}-d${values[slot][0]}-o${values[slot][1]}.webp`);
      assert.ok(existsSync(resolve(__dirname, '..', card.image)));
    }
  }
  assert.equal(new Set(Object.values(DECKS).flatMap(d => d.cards.map(c => c.image))).size, 12);
});

test('reported fish 4 + 1 + 5 advances for every click order', () => {
  for (const order of permutations(['fish-4','fish-3','fish-2'])) {
    const { game } = makeGame();
    const question = game.questionId;
    assert.equal(game.click(order[0]).kind, 'selected');
    assert.equal(game.click(order[1]).kind, 'selected');
    const result = game.click(order[2]);
    assert.deepEqual(result, { kind: 'success', totals: { d: 7, o: 10 } });
    assert.equal(game.done, 1);
    assert.equal(game.questionId, question + 1);
    assert.equal(game.family, 'turtle');
    assert.equal(game.selected.size, 0);
  }
});

test('reported turtle 4 + 6 advances for both click orders', () => {
  for (const order of [['turtle-1','turtle-4'],['turtle-4','turtle-1']]) {
    const { game } = makeGame('turtle');
    game.click(order[0]);
    assert.deepEqual(game.click(order[1]), { kind: 'success', totals: { d: 7, o: 10 } });
    assert.equal(game.done, 1);
  }
});

test('all 126 nonempty combinations and all valid winning click orders', () => {
  let checked = 0;
  for (const [family, values] of Object.entries(audit)) {
    for (let mask = 1; mask < 64; mask++) {
      const slots = values.map((_, i) => i).filter(i => mask & (1 << i));
      const sums = slots.reduce((s, i) => [s[0] + values[i][0], s[1] + values[i][1]], [0,0]);
      const expectedWin = Math.max(...sums) <= 10 && sums.includes(10);
      const orders = expectedWin ? permutations(slots) : [slots];
      for (const order of orders) {
        const { game } = makeGame(family);
        let visible = [];
        for (const slot of order) {
          const candidate = [...visible, slot].reduce((s,i) => [s[0]+values[i][0],s[1]+values[i][1]], [0,0]);
          const expected = Math.max(...candidate) > 10 ? 'blocked' : candidate.includes(10) ? 'success' : 'selected';
          const action = game.click(`${family}-${slot}`);
          assert.equal(action.kind, expected, `${family} ${order}: ${candidate}`);
          if (expected === 'success') break;
          if (expected === 'selected') visible.push(slot);
          assert.deepEqual([...game.selected].sort(), visible.map(i => `${family}-${i}`).sort());
        }
        if (expectedWin) assert.equal(game.done, 1);
      }
      checked++;
    }
  }
  assert.equal(checked, 126);
});

test('overflow refuses only the new card; cancellation permits a different solution', () => {
  const { game } = makeGame();
  game.click('fish-0'); game.click('fish-1');
  assert.equal(game.click('fish-2').kind, 'blocked'); // 10 dolphins, 11 fish: rejected.
  assert.deepEqual([...game.selected].sort(), ['fish-0','fish-1']);
  assert.equal(game.blockedCount, 1);
  assert.equal(game.click('fish-1').kind, 'cancelled');
  assert.equal(game.cancelled, 1);
  game.click('fish-2');
  assert.equal(game.click('fish-5').kind, 'success'); // 10 / 10.
});

test('the exact deadline and late clicks cannot score, even without a timer frame', () => {
  const { game, advance } = makeGame('turtle');
  game.click('turtle-1');
  advance(60000);
  assert.equal(game.click('turtle-4').kind, 'finished');
  assert.equal(game.done, 0);
  assert.equal(game.running, false);
  assert.equal(game.click('turtle-4').kind, 'ignored');
});

test('restart clears statistics and ignores clicks from a stale board', () => {
  const { game, advance } = makeGame('turtle');
  const staleQuestion = game.questionId;
  game.click('turtle-1'); advance(1250); game.click('turtle-4');
  assert.deepEqual(game.times, [1250]);
  assert.equal(game.click('turtle-4', staleQuestion).kind, 'ignored');
  game.finish(); game.start();
  assert.equal(game.done, 0);
  assert.deepEqual(game.times, []);
  assert.equal(game.selected.size, 0);
  assert.equal(game.remaining(), 60000);
  assert.equal(game.click('turtle-1', staleQuestion).kind, 'ignored');
});

test('old test URL redirects to the one current implementation', () => {
  const html = readFileSync(resolve(__dirname, '../test-v08.html'), 'utf8');
  assert.match(html, /location\.replace/);
  assert.doesNotMatch(html, /DECKS|function clickCard/);
  const main = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
  assert.match(main, /game-v09\.js/);
  assert.doesNotMatch(main, /shimo|background-position|class="sheet"/);
});
