(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Qiang10 = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Counts were checked against the user's two current, original images.
  // Each card owns one local image and its counts; shuffling never separates them.
  const counts = {
    fish: [[3, 2], [5, 4], [2, 5], [4, 1], [1, 4], [5, 3]],
    turtle: [[3, 2], [6, 4], [2, 5], [4, 1], [1, 6], [5, 3]]
  };
  const DECKS = Object.freeze(Object.fromEntries(
    Object.entries(counts).map(([family, values]) => [family, Object.freeze({
      name: family === 'fish' ? '小丑鱼' : '海龟',
      cards: Object.freeze(values.map(([d, o], slot) => Object.freeze({
        id: `${family}-${slot}`, d, o,
        image: `assets/cards-v09/${family}-${slot}-d${d}-o${o}.webp`
      })))
    })])
  ));

  function shuffle(cards, random = Math.random) {
    const result = [...cards];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function totals(cards) {
    return cards.reduce((sum, card) => ({ d: sum.d + card.d, o: sum.o + card.o }), { d: 0, o: 0 });
  }

  function judge(sum) {
    // The user's original rule: either animal exceeding 10 rejects the card,
    // including a 10/11 combination. Both entry URLs use this same function.
    if (sum.d > 10 || sum.o > 10) return 'blocked';
    if (sum.d === 10 || sum.o === 10) return 'success';
    return 'selected';
  }

  class Game {
    constructor({ now = Date.now, random = Math.random, duration = 60000 } = {}) {
      this.now = now;
      this.random = random;
      this.duration = duration;
      this.running = false;
      this.questionId = 0;
      this.selected = new Set();
      this.cards = [];
    }

    start() {
      this.done = this.blockedCount = this.cancelled = 0;
      this.times = [];
      this.family = null;
      this.running = true;
      const time = this.now();
      this.deadline = time + this.duration;
      this.nextQuestion(time);
    }

    nextQuestion(time) {
      this.family = this.family === null
        ? (this.random() < 0.5 ? 'fish' : 'turtle')
        : (this.family === 'fish' ? 'turtle' : 'fish');
      this.cards = shuffle(DECKS[this.family].cards, this.random);
      this.selected = new Set();
      this.questionId++;
      this.questionStarted = time;
    }

    currentTotals() {
      return totals(this.cards.filter(card => this.selected.has(card.id)));
    }

    remaining() {
      return Math.max(0, this.deadline - this.now());
    }

    finish() {
      this.running = false;
      this.selected.clear();
    }

    click(id, questionId = this.questionId) {
      if (!this.running) return { kind: 'ignored' };
      const time = this.now();
      // Check here too: a background tab may not have delivered its timer tick.
      if (time >= this.deadline) {
        this.finish();
        return { kind: 'finished' };
      }
      if (questionId !== this.questionId || !this.cards.some(card => card.id === id)) {
        return { kind: 'ignored' };
      }
      if (this.selected.has(id)) {
        this.selected.delete(id);
        this.cancelled++;
        return { kind: 'cancelled', totals: this.currentTotals() };
      }

      const proposed = new Set(this.selected);
      proposed.add(id);
      const sum = totals(this.cards.filter(card => proposed.has(card.id)));
      const kind = judge(sum);
      if (kind === 'blocked') {
        this.blockedCount++;
        return { kind, totals: sum };
      }
      if (kind === 'success') {
        this.done++;
        this.times.push(time - this.questionStarted);
        // Synchronous advance: no old timeout can alter a later question/run.
        this.nextQuestion(time);
        return { kind, totals: sum };
      }
      this.selected = proposed;
      return { kind, totals: sum };
    }
  }

  return Object.freeze({ DECKS, Game, judge, totals, shuffle });
});
