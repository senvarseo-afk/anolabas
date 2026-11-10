/* "My number" lookup on hot-and-cold pages: how often a number was drawn, when last, how many draws ago.
   Reads /data/{slug}.json ({ rows:[[date,slot,numbers,jackpot,winners,official]...] newest first }). textContent only. */
(function () {
  'use strict';
  var box = document.querySelector('[data-nl]'); if (!box) return;
  var slug = box.getAttribute('data-nl'), path = box.getAttribute('data-path'), min = +box.getAttribute('data-min'), max = +box.getAttribute('data-max');
  var pad2 = box.getAttribute('data-pad') === '1';
  var input = box.querySelector('input'), btn = box.querySelector('button'), out = box.querySelector('[data-nl-out]');
  var rows = null, loading = null;
  function load() { if (rows) return Promise.resolve(rows); if (loading) return loading; loading = fetch('/anolabas/data/' + slug + '.json').then(function (r) { return r.json(); }).then(function (j) { rows = j.rows || []; return rows; }); return loading; }
  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
  function label(n) { return pad2 ? String(n).padStart(2, '0') : String(n); }
  function fmt(iso) { var p = iso.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; }
  function show() {
    var n = parseInt(input.value, 10);
    out.textContent = '';
    if (isNaN(n) || n < min || n > max) { out.appendChild(el('p', 'small muted', 'Enter a number from ' + label(min) + ' to ' + label(max) + '.')); return; }
    out.appendChild(el('p', 'small muted', 'Looking up ' + label(n) + '…'));
    if (window.anoTrack) window.anoTrack('number_lookup', { game: path });
    load().then(function (rs) {
      var total = rs.length, all = 0, last100 = 0, lastIdx = -1;
      for (var i = 0; i < rs.length; i++) {
        var hit = rs[i][2].indexOf(n) >= 0;
        if (hit) { all++; if (i < 100) last100++; if (lastIdx < 0) lastIdx = i; }
      }
      out.textContent = '';
      var card = el('div', 'nl-result');
      var ball = el('span', 'ball' + (box.getAttribute('data-ball') === 'square' ? ' square' : ''), label(n)); ball.style.background = box.getAttribute('data-color'); card.appendChild(ball);
      var txt = el('div', 'nl-txt');
      var exp100 = Math.min(100, total) * (+box.getAttribute('data-share') || 0);
      txt.appendChild(el('b', null, lastIdx < 0 ? 'Not drawn on record' : lastIdx === 0 ? 'Drawn in the latest draw' : 'Last drawn ' + fmt(rs[lastIdx][0]) + (rs[lastIdx][1] && box.getAttribute('data-digit') === '1' ? ' ' + rs[lastIdx][1] : '')));
      txt.appendChild(el('span', null, (lastIdx <= 0 ? '' : lastIdx + ' draw' + (lastIdx === 1 ? '' : 's') + ' ago · ') + last100 + ' time' + (last100 === 1 ? '' : 's') + ' in the last 100 draws' + (exp100 ? ' (equal share about ' + exp100.toFixed(1) + ')' : '') + ' · ' + all.toLocaleString() + ' time' + (all === 1 ? '' : 's') + ' in all ' + total.toLocaleString() + ' draws'));
      var a = el('a', null, 'Full history of ' + label(n) + ' ›'); a.href = '/anolabas/number/' + path + '/' + n + '/'; txt.appendChild(a);
      card.appendChild(txt); out.appendChild(card);
      out.appendChild(el('p', 'small muted', 'Past draws only. Every draw is random; this does not change the odds of ' + label(n) + ' next time.'));
    }).catch(function () { out.textContent = ''; out.appendChild(el('p', 'small muted', 'Could not load the draw history. Please try again.')); });
  }
  btn.addEventListener('click', show);
  // Board tiles and group balls that are not links: fill the box with that number and look it up.
  if (window.__nlPick) document.removeEventListener('click', window.__nlPick);
  window.__nlPick = function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-nl-pick]') : null; if (!t) return;
    input.value = t.getAttribute('data-nl-pick');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    show();
  };
  document.addEventListener('click', window.__nlPick);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); show(); } });
  input.addEventListener('focus', function () { load(); }, { once: true });
})();
