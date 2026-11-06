/* LottoPH Today — ticket checker. Needs common.js and window.LPH_CHECK = { games: [...] }. */
(function () {
  'use strict';
  var L = window.LPH, cfg = window.LPH_CHECK; if (!L || !cfg) return;
  var games = cfg.games, byId = {}; games.forEach(function (g) { byId[g.slug] = g; });
  var $ = function (id) { return document.getElementById(id); };
  var elGame = $('ck-game'), elDate = $('ck-date'), elDatePick = $('ck-date-pick'), elSlotWrap = $('ck-slot-wrap'), elSlot = $('ck-slot'),
      elBetWrap = $('ck-bet-wrap'), elBet = $('ck-bet'), elTickets = $('ck-tickets'), elAdd = $('ck-add'), elGo = $('ck-go'),
      elStatus = $('ck-status'), elOut = $('ck-out'), elWin = $('ck-winning'), elForm = $('ck-form'), elAmtWrap = $('ck-amt-wrap'), elAmt = $('ck-amt'), elSys = $('ck-sys-note');
  var data = null, g = null, core = null, ticketSeq = 0, pendingDate = null, pendingSlot = null, pendingNums = null, pendingBet = null;

  function setStatus(t) { elStatus.textContent = t || ''; }
  function amountPlayed() { var a = parseInt(elAmt.value, 10); return a >= 10 && a % 10 === 0 ? a : null; }
  function nInputs() { return core.nInputs(); }
  function pool() { return core.pool(); }
  function rangeHint() { return g.range[0] + '–' + g.range[1]; }

  function ticketRow(prefill) {
    var id = ++ticketSeq, n = nInputs(), wrap = document.createElement('div');
    wrap.className = 'ticket'; wrap.setAttribute('data-ticket', id);
    var inputs = '';
    for (var i = 0; i < n; i++) {
      var v = prefill && prefill[i] != null ? prefill[i] : '';
      inputs += '<input type="number" inputmode="numeric" pattern="[0-9]*" min="' + g.range[0] + '" max="' + g.range[1] + '" aria-label="Number ' + (i + 1) + '" value="' + v + '" placeholder="' + (g.type === 'lotto' ? '–' : '') + '" enterkeyhint="next">';
    }
    wrap.innerHTML = '<div class="ticket-head"><span>Ticket ' + id + ' <span class="muted">(' + n + ' numbers, ' + rangeHint() + ')</span></span><button type="button" class="btn link sm" data-remove>Remove</button></div><div class="numrow">' + inputs + '</div>';
    elTickets.appendChild(wrap);
    // auto-advance when a cell is full
    var cells = wrap.querySelectorAll('input');
    cells.forEach(function (inp, idx) {
      inp.addEventListener('input', function () {
        inp.classList.remove('bad');
        var maxLen = String(g.range[1]).length;
        if (inp.value.length >= maxLen && idx < cells.length - 1) cells[idx + 1].focus();
      });
    });
    wrap.querySelector('[data-remove]').addEventListener('click', function () { if (elTickets.children.length > 1) wrap.remove(); else cells.forEach(function (c) { c.value = ''; }); });
    return wrap;
  }
  function resetTickets(list) {
    elTickets.innerHTML = ''; ticketSeq = 0;
    if (list && list.length) list.forEach(function (t) { ticketRow(t); }); else ticketRow();
  }

  function fillDates() {
    var dates = data.dates, keep = dates.slice(0, 60);
    elDate.innerHTML = keep.map(function (d) { return '<option value="' + d + '">' + L.fmtShort(d) + '</option>'; }).join('') + '<option value="__more">Older date…</option>';
    elDatePick.min = dates[dates.length - 1]; elDatePick.max = dates[0];
    var want = pendingDate && dates.indexOf(pendingDate) >= 0 ? pendingDate : dates[0];
    if (pendingDate && dates.indexOf(pendingDate) < 0) setStatus('No ' + g.short + ' draw recorded on ' + pendingDate + '. Showing the latest draw instead.');
    setDate(want); pendingDate = null;
  }
  function setDate(d) {
    var has = Array.prototype.some.call(elDate.options, function (o) { return o.value === d; });
    if (!has) { var o = document.createElement('option'); o.value = d; o.textContent = L.fmtShort(d); elDate.insertBefore(o, elDate.firstChild); }
    elDate.value = d; elDatePick.value = d;
    fillSlots();
  }
  function drawsOnDate() { return data.draws.filter(function (d) { return d.date === elDate.value; }); }
  function fillSlots() {
    var ds = drawsOnDate();
    elSys.hidden = g.type !== 'lotto';
    if (g.type === 'lotto') { elSlotWrap.hidden = true; elBetWrap.hidden = true; elAmtWrap.hidden = true; renderWinning(); return; }
    elSlotWrap.hidden = g.slots.length < 2; elBetWrap.hidden = elBet.options.length < 2; elAmtWrap.hidden = false;
    var order = ['2PM', '5PM', '9PM'], have = order.filter(function (s) { return ds.some(function (d) { return d.slot === s; }); });
    elSlot.innerHTML = have.map(function (s) { return '<option value="' + s + '">' + L.slotTime(s) + ' draw</option>'; }).join('') + (have.length > 1 ? '<option value="all">All draws that day</option>' : '');
    var want = pendingSlot && have.indexOf(pendingSlot) >= 0 ? pendingSlot : have[have.length - 1];
    elSlot.value = want || ''; pendingSlot = null;
    renderWinning();
  }
  function selectedDraws() {
    var ds = drawsOnDate();
    if (g.type === 'lotto') return ds.slice(0, 1);
    if (elSlot.value === 'all') return ['2PM', '5PM', '9PM'].map(function (s) { return ds.filter(function (d) { return d.slot === s; })[0]; }).filter(Boolean);
    return ds.filter(function (d) { return d.slot === elSlot.value; });
  }
  function renderWinning() {
    var ds = selectedDraws();
    if (!ds.length) { elWin.innerHTML = '<p class="muted small">No draw recorded for this selection.</p>'; return; }
    elWin.innerHTML = ds.map(function (d) {
      return '<div class="card"><div class="card-head"><span>' + L.esc(g.display) + ' · ' + L.slotTime(d.slot) + ' · ' + L.fmtDate(d.date, false) + '</span><span class="badge ' + (d.official ? 'ok' : d.archive ? 'third' : 'pending') + '">' + (d.official ? 'Verified vs PCSO' : d.archive ? 'Archive record' : 'Provisional') + '</span></div>' +
        L.ballsHTML(g, d.numbers, 'lg', 'Winning numbers') +
        '<div class="meta"><span>' + (g.type === 'lotto' ? 'Jackpot' : pool() ? 'First prize pool' : 'Prize') + ': <b class="tabnum">' + L.peso(d.jackpot != null ? d.jackpot : (g.prizes && g.prizes.standard)) + '</b></span><span>Winners: <b class="tabnum">' + (d.winners == null ? '—' : d.winners) + '</b></span></div></div>';
    }).join('');
  }

  function readTickets() {
    var out = [], ok = true;
    elTickets.querySelectorAll('.ticket').forEach(function (t) {
      var vals = [], cells = t.querySelectorAll('input'), empty = true;
      cells.forEach(function (c) { if (c.value !== '') empty = false; });
      if (empty) return;
      cells.forEach(function (c) {
        var v = c.value === '' ? NaN : parseInt(c.value, 10);
        vals.push(v);
      });
      core.badCells(vals).forEach(function (i) { cells[i].classList.add('bad'); ok = false; });
      out.push({ id: t.getAttribute('data-ticket'), nums: vals });
    });
    return ok ? out : null;
  }

  function renderResults(tickets) {
    var ds = selectedDraws(), bet = elBet.value || 'standard', html = '', anyWin = false, lines = [], played = amountPlayed() || 10;
    if (!ds.length) { elOut.innerHTML = '<div class="result-box lose">No draw recorded for this date.</div>'; return; }
    tickets.forEach(function (t) {
      ds.forEach(function (d) {
        var head = 'Ticket ' + t.id + ': ' + L.numsLabel(g, t.nums) + (ds.length > 1 ? ' · ' + L.slotTime(d.slot) : '');
        var v = core.verdict(d, t.nums, bet, played);
        if (v.win) anyWin = true;
        html += '<div class="result-box ' + v.cls + '">' + head + '<span class="sub">' + v.body + '</span></div>';
        lines.push(head + ' — ' + v.summary);
      });
    });
    var share = g.display + ' · ' + L.fmtDate(elDate.value, false) + (g.type === 'digit' && elSlot.value !== 'all' && g.slots.length > 1 ? ' ' + L.slotTime(elSlot.value) : '') + '\n' + lines.join('\n') + '\nChecked on LottoPH Today — only PCSO validation is final. ' + location.origin + '/lottoph/check/';
    html += '<div class="btn-row"><button type="button" class="btn sec sm" id="ck-copy">Copy result</button>' + (anyWin ? '<a class="btn pri sm" href="/lottoph/guide/how-to-claim/">How to claim →</a>' : (g.tools ? '<a class="btn ghost sm" href="/lottoph/simulator/' + g.path + '/">Try the simulator</a>' : '<a class="btn ghost sm" href="/lottoph/guide/how-to-play-' + g.path + '/">Prize table</a>')) + '</div>';
    elOut.innerHTML = html;
    $('ck-copy').addEventListener('click', function () { L.copyText(share).then(function () { setStatus('Result copied.'); }, function () { setStatus('Copy not available on this browser.'); }); });
    elOut.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function loadFor(slug) {
    g = byId[slug]; if (!g) return;
    core = L.checker(g, cfg.claim);
    elBet.innerHTML = core.betOptions().map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
    if (pendingBet) { elBet.value = pendingBet; if (!elBet.value) elBet.value = 'standard'; pendingBet = null; }
    resetTickets(pendingNums); pendingNums = null;
    elOut.innerHTML = ''; elWin.innerHTML = '<p class="status">Loading ' + L.esc(g.display) + ' draws…</p>';
    elGo.disabled = true;
    L.loadGame(slug).then(function (j) {
      data = j; elGo.disabled = false; setStatus('');
      if (!j.dates.length) { setStatus('No draws recorded for this game yet.'); return; }
      fillDates();
    }).catch(function () { setStatus('Could not load draw data. Check your connection and try again.'); elWin.innerHTML = ''; });
  }

  // URL params: ?game=slug&date=YYYY-MM-DD&slot=2PM&bet=rambolito|perm|roll1|roll4&n=1-2-3&n=4-5-6
  var q = new URLSearchParams(location.search);
  var qg = q.get('game'); if (qg && byId[qg]) elGame.value = qg;
  if (!byId[elGame.value]) elGame.value = games[0].slug;
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '')) pendingDate = q.get('date');
  if (/^(2PM|5PM|9PM)$/.test(q.get('slot') || '')) pendingSlot = q.get('slot');
  if (/^(rambolito|perm|roll1|roll4)$/.test(q.get('bet') || '')) pendingBet = q.get('bet');
  var qn = q.getAll('n').map(function (s) { return s.split(/[-,\s]+/).map(function (x) { return parseInt(x, 10); }).filter(function (x) { return !isNaN(x); }); }).filter(function (a) { return a.length; });
  if (qn.length) pendingNums = qn;

  elGame.addEventListener('change', function () { loadFor(elGame.value); history.replaceState(null, '', '/lottoph/check/?game=' + elGame.value); });
  elDate.addEventListener('change', function () {
    if (elDate.value === '__more') { elDatePick.hidden = false; elDatePick.focus(); try { elDatePick.showPicker && elDatePick.showPicker(); } catch (e) {} return; }
    elDatePick.hidden = true; fillSlots(); elOut.innerHTML = '';
  });
  elDatePick.addEventListener('change', function () {
    var d = elDatePick.value; if (!d) return;
    if (data.dates.indexOf(d) < 0) { setStatus('No ' + g.short + ' draw recorded on ' + L.fmtDate(d) + '. Check the date or the draw schedule.'); return; }
    setStatus(''); setDate(d); elOut.innerHTML = '';
  });
  elSlot.addEventListener('change', function () { renderWinning(); elOut.innerHTML = ''; });
  elAdd.addEventListener('click', function () { var r = ticketRow(); r.querySelector('input').focus(); });
  elForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!data) return;
    var tickets = readTickets();
    if (!tickets) { setStatus('Fix the highlighted numbers: each must be ' + rangeHint() + (g.type === 'lotto' ? ' with no repeats.' : '.')); return; }
    if (!tickets.length) { setStatus('Enter the numbers on at least one ticket.'); return; }
    if (g.type === 'digit' && !amountPlayed()) { setStatus('Enter the amount played in steps of ₱10, for example 10, 20 or 50.'); elAmt.focus(); return; }
    setStatus(''); renderResults(tickets);
  });
  loadFor(elGame.value);
})();
