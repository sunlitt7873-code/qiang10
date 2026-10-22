(() => {
  'use strict';
  const { DECKS, Game } = window.Qiang10;
  const $ = id => document.getElementById(id);
  const game = new Game();
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const images = Object.values(DECKS).flatMap(deck => deck.cards.map(card => card.image));
  let ready = false;
  let loading = false;
  let frame = 0;
  let toastTimeout = 0;

  function show(screen) {
    for (const id of ['home', 'game', 'result']) $(id).hidden = id !== screen;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const timeout = setTimeout(() => reject(new Error('image timeout')), 20000);
      img.onload = () => { clearTimeout(timeout); resolve(img); };
      img.onerror = () => { clearTimeout(timeout); reject(new Error('image unavailable')); };
      img.src = src;
    });
  }

  async function prepareImages() {
    if (loading) return;
    loading = true;
    $('startBtn').disabled = true;
    $('startBtn').textContent = '正在加载卡片…';
    $('loadStatus').textContent = '卡片加载完成后，就可以开始。';
    try {
      await Promise.all(images.map(loadImage));
      ready = true;
      $('startBtn').textContent = '开始60秒挑战';
      $('loadStatus').textContent = '';
    } catch (_) {
      $('startBtn').textContent = '重新加载卡片';
      $('loadStatus').textContent = '有卡片还没加载出来，请检查网络后重试。倒计时尚未开始。';
    } finally {
      loading = false;
      $('startBtn').disabled = false;
    }
  }

  function showDebug(sum = game.currentTotals(), label = '当前') {
    $('debug').hidden = !debug;
    if (debug) $('debug').textContent = `${label}：海豚 ${sum.d} ｜ ${DECKS[game.family].name} ${sum.o}`;
  }

  function hideToast() {
    clearTimeout(toastTimeout);
    $('toast').classList.remove('show');
  }

  function renderBoard() {
    hideToast();
    const fragment = document.createDocumentFragment();
    for (const card of game.cards) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'card';
      button.dataset.cardId = card.id;
      button.dataset.question = String(game.questionId);
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${card.d}只海豚，${card.o}只${DECKS[game.family].name}`);
      const img = document.createElement('img');
      img.className = 'card-image';
      img.src = card.image;
      img.alt = '';
      img.draggable = false;
      img.width = img.height = 512;
      button.append(img);
      fragment.append(button);
    }
    $('board').replaceChildren(fragment);
    $('done').textContent = game.done;
    showDebug();
  }

  function updateSelection() {
    for (const button of $('board').children) {
      const selected = game.selected.has(button.dataset.cardId);
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    showDebug();
  }

  function finish() {
    game.finish();
    cancelAnimationFrame(frame);
    hideToast();
    $('finalDone').textContent = game.done;
    $('blockedCount').textContent = game.blockedCount;
    $('cancelled').textContent = game.cancelled;
    const seconds = ms => `${(ms / 1000).toFixed(2)}秒`;
    $('fastest').textContent = game.times.length ? seconds(Math.min(...game.times)) : '—';
    $('average').textContent = game.times.length
      ? seconds(game.times.reduce((a, b) => a + b, 0) / game.times.length) : '—';
    show('result');
  }

  function tick() {
    if (!game.running) return;
    const remaining = game.remaining();
    $('timer').textContent = (remaining / 1000).toFixed(1);
    $('timer').classList.toggle('danger', remaining <= 10000);
    if (remaining <= 0) return finish();
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (!ready) return prepareImages();
    cancelAnimationFrame(frame);
    hideToast();
    game.start();
    show('game');
    renderBoard();
    tick();
  }

  $('board').addEventListener('click', event => {
    const button = event.target.closest('button.card');
    if (!button || !$('board').contains(button)) return;
    const action = game.click(button.dataset.cardId, Number(button.dataset.question));
    if (action.kind === 'finished') return finish();
    if (action.kind === 'success') return renderBoard();
    if (action.kind === 'blocked') {
      button.classList.remove('blocked');
      void button.offsetWidth;
      button.classList.add('blocked');
      hideToast();
      $('toast').classList.add('show');
      toastTimeout = setTimeout(hideToast, 900);
      showDebug(action.totals, '这张牌加入后（已拒绝）');
      return;
    }
    if (action.kind !== 'ignored') {
      button.classList.remove('blocked');
      updateSelection();
    }
  });
  $('board').addEventListener('animationend', event => event.target.classList.remove('blocked'));
  document.addEventListener('visibilitychange', () => {
    if (game.running && game.remaining() <= 0) finish();
  });
  $('startBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);
  $('backBtn').addEventListener('click', () => show('home'));
  prepareImages();
})();
