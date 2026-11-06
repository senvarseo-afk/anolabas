/* "Find a draw" (DrawFinder.astro): shows the draws of a chosen game/date/time in place.
 * Data: /data/{slug}.json = { columns:[date,slot,numbers,jackpot,winners,official], rows:[...] } newest first.
 * DOM built with textContent only. */
(function () {
  'use strict';
  var root = document.querySelector('[data-finder]'); if (!root) return;
  var cfg = []; try { cfg = JSON.parse(document.getElementById('fd-cfg').textContent || '[]'); } catch (e) {}
  var BY = {}; cfg.forEach(function (g) { BY[g.slug] = g; });
  var elGame = document.getElementById('fd-game'), elDate = document.getElementById('fd-date'), elSlot = document.getElementById('fd-slot'),
    elGo = document.getElementById('fd-go'), out = document.getElementById('fd-out');
  var cache = {};
  var SLOT = { '2PM': '2PM', '5PM': '5PM', '9PM': '9PM' };
  var ORDER = { '2PM': 1, '5PM': 2, '9PM': 3 };

  function game() { return BY[elGame ? elGame.value : cfg[0].slug]; }
  function load(slug) {
    if (cache[slug]) return Promise.resolve(cache[slug]);
    return fetch('/data/' + slug + '.json').then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (j) { cache[slug] = j.rows || []; return cache[slug]; });
  }
  function longDate(iso) {
    var p = iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ', ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + p[0];
  }
  function peso(n) { return n == null ? '' : '₱' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: n % 1 ? 2 : 0 }); }
  function pad(g, n) { return (g.type === 'lotto' || g.slug === '2d-lotto') ? String(n).padStart(2, '0') : String(n); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function balls(g, nums) {
    var w = el('div', 'balls sm'); w.setAttribute('role', 'list');
    nums.forEach(function (n) { var b = el('span', 'ball' + (g.ball === 'square' ? ' square' : ''), pad(g, n)); b.style.background = g.color; b.setAttribute('role', 'listitem'); w.appendChild(b); });
    return w;
  }
  function syncSlots() {
    var g = game(); if (!g) return;
    [].forEach.call(elSlot.options, function (o) { if (o.value) o.hidden = o.disabled = g.slots.indexOf(o.value) < 0; });
    if (elSlot.value && g.slots.indexOf(elSlot.value) < 0) elSlot.value = '';
    elSlot.parentNode.hidden = g.slots.length < 2;
    elDate.min = g.first; elDate.max = g.last;
  }
  function show() {
    var g = game(), date = elDate.value, slot = elSlot.value;
    out.textContent = '';
    if (!date) { out.appendChild(el('p', 'small muted', 'Choose a month, day and year first.')); return; }
    out.appendChild(el('p', 'small muted', 'Loading…'));
    load(g.slug).then(function (rows) {
      out.textContent = '';
      var day = rows.filter(function (r) { return r[0] === date && (!slot || r[1] === slot); }).sort(function (a, b) { return ORDER[b[1]] - ORDER[a[1]]; });
      var box = el('div', 'finder-result');
      var head = el('div', 'finder-result-head');
      head.appendChild(el('b', null, g.name + ' · ' + longDate(date)));
      if (day.length) { var a = el('a', null, 'Full page ›'); a.href = '/' + g.path + '/' + date + '/'; head.appendChild(a); }
      box.appendChild(head);
      if (day.length) {
        day.forEach(function (r) {
          var row = el('div', 'finder-row');
          row.appendChild(el('span', 'finder-slot', SLOT[r[1]] || r[1]));
          row.appendChild(balls(g, r[2]));
          var meta = (g.slots.length > 1 ? '' : g.type === 'lotto' ? 'Jackpot ' + peso(r[3]) + ' · ' : r[3] == null ? '' : 'First prize pool ' + peso(r[3]) + ' · ') + (r[4] == null ? '' : r[4] + ' winner' + (r[4] === 1 ? '' : 's'));
          row.appendChild(el('span', 'finder-meta', meta));
          box.appendChild(row);
        });
        box.appendChild(el('p', 'small muted', day.some(function (r) { return !r[5]; }) ? 'Includes an archive record. Verify against PCSO before relying on it for a claim.' : 'Verified vs PCSO.'));
      } else {
        // nearest draws before / after the chosen date
        var dates = []; rows.forEach(function (r) { if (dates[dates.length - 1] !== r[0]) dates.push(r[0]); });
        var after = null, before = null;
        for (var i = 0; i < dates.length; i++) { if (dates[i] > date) after = dates[i]; else if (dates[i] < date) { before = dates[i]; break; } }
        box.appendChild(el('p', null, 'No ' + g.name + (slot ? ' ' + SLOT[slot] : '') + ' draw on this date.'));
        var nav = el('div', 'chip-row');
        [before, after].forEach(function (d, k) {
          if (!d) return;
          var b = el('button', 'chip', (k ? 'Next: ' : 'Previous: ') + longDate(d)); b.type = 'button';
          b.addEventListener('click', function () { elDate.value = d; show(); });
          nav.appendChild(b);
        });
        box.appendChild(nav);
      }
      out.appendChild(box);
    }).catch(function () { out.textContent = ''; out.appendChild(el('p', 'small muted', 'Could not load results. Please try again.')); });
  }
  if (elGame) elGame.addEventListener('change', function () { syncSlots(); var g = game(); elDate.value = g.last; show(); });
  elGo.addEventListener('click', show);
  elDate.addEventListener('change', show);
  elSlot.addEventListener('change', function () { if (elDate.value) show(); });
  syncSlots();
  elDate.value = (game() || {}).last || root.getAttribute('data-latest');
})();
