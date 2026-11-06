/* LottoPH Today — "Check this draw": a drawer that checks a ticket without leaving the results.
 * The draw is locked; the rules are the checker page's own (tools/check-core.js), loaded on first use.
 * Every trigger is a real link to /check/, so the page still works when this script or its data cannot load. */
(function () {
  'use strict';
  var ready = null, byId = {}, claim = [];

  function addScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }
  function boot() {
    if (ready) return ready;
    var rules = window.LPH && window.LPH.checker ? Promise.resolve() : addScript('/lottoph/js/tools/common.js').then(function () { return addScript('/lottoph/js/tools/check-core.js'); });
    ready = rules.then(function () { return fetch('/lottoph/data/check-config.json'); })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { j.games.forEach(function (g) { byId[g.slug] = g; }); claim = j.claim; })
      .catch(function (e) { ready = null; throw e; });
    return ready;
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fullUrl(t) { return '/lottoph/check/?game=' + t.game + '&date=' + t.date + '&slot=' + t.slot; }
  function numbersIn(root) { return [].map.call(root.querySelectorAll('.ball'), function (b) { return b.textContent.trim(); }); }

  function fromRow(row) {
    return { game: row.getAttribute('data-game'), date: row.getAttribute('data-date'), slot: row.getAttribute('data-slot'), numbers: numbersIn(row.querySelector('[data-f="balls"]')) };
  }
  function fromHero() {
    return [].filter.call(document.querySelectorAll('[data-hero-game], [data-hero-extra]'), function (e) { return !e.hidden; }).map(function (e) {
      return { game: e.getAttribute('data-hero-game') || e.getAttribute('data-hero-extra'), date: e.getAttribute('data-date'), slot: e.getAttribute('data-slot'), numbers: numbersIn(e) };
    });
  }
  function ballRow(g, nums) {
    var w = el('div', 'balls sm'); w.setAttribute('role', 'list'); w.setAttribute('aria-label', 'Winning numbers');
    nums.forEach(function (n) { var b = el('span', 'ball' + (g.ball === 'square' ? ' square' : ''), n); b.style.background = g.color; b.setAttribute('role', 'listitem'); w.appendChild(b); });
    return w;
  }
  function chipRow(items, on, pick, label) {
    var row = el('div', 'ckd-chips'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', label);
    items.forEach(function (it) {
      var b = el('button', 'chip' + (it.value === on ? ' on' : ''), it.label); b.type = 'button'; b.setAttribute('aria-pressed', it.value === on ? 'true' : 'false');
      b.addEventListener('click', function () { pick(it.value); }); row.appendChild(b);
    });
    return row;
  }
  function draw(body, targets, t, bet) {
    var L = window.LPH, g = byId[t.game], core = L.checker(g, claim), n = core.nInputs();
    bet = bet || 'standard';
    body.textContent = '';
    body.appendChild(el('h3', null, 'Check this draw'));

    var lock = el('div', 'ckd-lock');
    lock.appendChild(el('b', null, g.short + ' · ' + L.fmtShort(t.date).replace(/, \d{4}$/, '').replace(' ', ', ') + ' · ' + t.slot));
    lock.appendChild(ballRow(g, t.numbers));
    body.appendChild(lock);

    if (targets.length > 1) body.appendChild(chipRow(targets.map(function (x, i) { return { value: i, label: byId[x.game].short }; }), targets.indexOf(t), function (i) { draw(body, targets, targets[i]); }, 'Game'));
    if (g.type !== 'lotto') {
      body.appendChild(chipRow(core.betOptions().map(function (o) { return { value: o[0], label: o[1].replace(/ \(.*$/, '') }; }), bet, function (v) { draw(body, targets, t, v); }, 'Bet type'));
    }

    var label = el('p', 'ckd-label', 'Your ' + n + ' numbers'), cells = el('div', 'numrow');
    body.appendChild(label); body.appendChild(cells);
    var inputs = [];
    for (var i = 0; i < n; i++) {
      var c = el('input'); c.type = 'number'; c.inputMode = 'numeric'; c.min = g.range[0]; c.max = g.range[1]; c.setAttribute('pattern', '[0-9]*'); c.setAttribute('aria-label', 'Number ' + (i + 1)); c.setAttribute('enterkeyhint', i === n - 1 ? 'done' : 'next');
      cells.appendChild(c); inputs.push(c);
    }
    var maxLen = String(g.range[1]).length;
    inputs.forEach(function (c, i) {
      c.addEventListener('input', function () { c.classList.remove('bad'); if (c.value.length >= maxLen && inputs[i + 1]) inputs[i + 1].focus(); });
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    });

    var go = el('button', 'btn pri block', 'Check'); go.type = 'button';
    var out = el('div', 'ckd-out'); out.setAttribute('aria-live', 'polite');
    body.appendChild(go); body.appendChild(out);
    var note = el('p', 'small muted', 'Prizes shown for a ₱10 play. Only PCSO validation is final. ');
    var more = el('a', null, 'Open the full ticket checker ›'); more.href = fullUrl(t); note.appendChild(more);
    body.appendChild(note);

    function run() {
      var vals = inputs.map(function (c) { return c.value === '' ? NaN : parseInt(c.value, 10); });
      var bad = core.badCells(vals);
      inputs.forEach(function (c) { c.classList.remove('bad'); });
      if (bad.length) {
        bad.forEach(function (i) { inputs[i].classList.add('bad'); });
        out.textContent = ''; out.appendChild(el('p', 'small', 'Enter ' + n + ' numbers from ' + g.range[0] + ' to ' + g.range[1] + (g.type === 'lotto' ? ', with no repeats.' : '.')));
        return;
      }
      out.textContent = ''; out.appendChild(el('p', 'small muted', 'Checking…'));
      L.loadGame(g.slug).catch(function () { return { draws: [] }; }).then(function (j) {
        var d = j.draws.filter(function (x) { return x.date === t.date && x.slot === t.slot; })[0];
        // A draw that arrived after the last build is not in the data file yet: check it against the numbers on screen.
        if (!d) d = { date: t.date, slot: t.slot, numbers: t.numbers.map(Number), jackpot: null, winners: null, official: false, archive: false };
        var v = core.verdict(d, vals, bet, 10);
        out.innerHTML = '<div class="result-box ' + v.cls + '">' + L.numsLabel(g, vals) + '<span class="sub">' + v.body + '</span></div>';
      });
    }
    go.addEventListener('click', run);
    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) inputs[0].focus({ preventScroll: true });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-check-draw], [data-home-check].is-just');
    if (!a || !window.LPHShare || e.metaKey || e.ctrlKey) return;
    var row = a.closest('.brow'), targets = row ? [fromRow(row)] : fromHero();
    if (!targets.length) return;
    e.preventDefault(); e.stopPropagation();
    var panel = window.LPHShare.panel({ label: 'Check this draw', opener: a });
    panel.body.appendChild(el('p', 'small muted', 'Loading…'));
    boot().then(function () { draw(panel.body, targets, targets[0]); }, function () { location.href = fullUrl(targets[0]); });
  }, true);
})();
