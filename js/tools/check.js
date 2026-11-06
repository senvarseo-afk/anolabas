/* LottoPH Today — ticket checker. Needs common.js and window.LPH_CHECK = { games: [...] }. */
(function () {
  'use strict';
  var L = window.LPH, cfg = window.LPH_CHECK; if (!L || !cfg) return;
  var games = cfg.games, byId = {}; games.forEach(function (g) { byId[g.slug] = g; });
  var $ = function (id) { return document.getElementById(id); };
  var elGame = $('ck-game'), elDate = $('ck-date'), elDatePick = $('ck-date-pick'), elSlotWrap = $('ck-slot-wrap'), elSlot = $('ck-slot'),
      elBetWrap = $('ck-bet-wrap'), elBet = $('ck-bet'), elTickets = $('ck-tickets'), elAdd = $('ck-add'), elGo = $('ck-go'),
      elStatus = $('ck-status'), elOut = $('ck-out'), elWin = $('ck-winning'), elForm = $('ck-form'), elAmtWrap = $('ck-amt-wrap'), elAmt = $('ck-amt'), elSys = $('ck-sys-note');
  var data = null, g = null, ticketSeq = 0, pendingDate = null, pendingSlot = null, pendingNums = null, pendingBet = null;

  function setStatus(t) { elStatus.textContent = t || ''; }
  function venue(gross) { return (cfg.claim || []).filter(function (t) { return t.max == null || gross <= t.max; })[0]; }
  function amountPlayed() { var a = parseInt(elAmt.value, 10); return a >= 10 && a % 10 === 0 ? a : null; }
  function nInputs() { return g.type === 'lotto' ? g.pick : g.digits; }
  /* 4D and 6D: one draw on fixed days, digits count in exact order, first prize from a shared pool */
  function pool() { return g.type === 'digit' && g.slots.length === 1; }
  function betOptions() {
    if (!pool()) return [['standard', 'Standard (exact order)'], ['rambolito', 'Rambolito (any order)']];
    return g.digits === 4 ? [['standard', 'Standard (exact order)'], ['perm', 'Perm / rambol'], ['roll1', 'Roll 1 (first digit 0–9)'], ['roll4', 'Roll 4 (last digit 0–9)']] : [['standard', 'Standard (exact order)']];
  }
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
        if (isNaN(v) || v < g.range[0] || v > g.range[1]) { c.classList.add('bad'); ok = false; }
        vals.push(v);
      });
      if (g.type === 'lotto') { var seen = {}; cells.forEach(function (c, i) { if (seen[vals[i]]) { c.classList.add('bad'); ok = false; } seen[vals[i]] = 1; }); }
      out.push({ id: t.getAttribute('data-ticket'), nums: vals });
    });
    return ok ? out : null;
  }

  /* every combination a 4D play buys: Perm is each distinct arrangement, Roll swaps in 0 to 9 at one end (PCSO 4D page) */
  function combos(nums, bet) {
    if (bet === 'roll1' || bet === 'roll4') {
      var out = [];
      for (var d = 0; d < 10; d++) out.push(bet === 'roll1' ? [d].concat(nums.slice(1)) : nums.slice(0, 3).concat(d));
      return out;
    }
    if (bet !== 'perm') return [nums];
    var seen = {}, list = [];
    (function walk(left, built) {
      if (!left.length) { var k = built.join(''); if (!seen[k]) { seen[k] = 1; list.push(built); } return; }
      left.forEach(function (n, i) { walk(left.slice(0, i).concat(left.slice(i + 1)), built.concat(n)); });
    })(nums, []);
    return list;
  }
  function poolTier(c, win) {
    if (c.join('') === win.join('')) return { first: true, name: '1st prize' };
    var tiers = g.prize_tiers || [];
    for (var i = 0; i < tiers.length; i++) {
      var t = tiers[i], k = t.k;
      if (c.slice(-k).join('') === win.slice(-k).join('') || (t.side === 'both' && c.slice(0, k).join('') === win.slice(0, k).join(''))) return t;
    }
    return null;
  }
  function evalPool(draw, nums, bet, played) {
    var win = draw.numbers.map(Number), list = combos(nums, bet), r = { matched: nums.filter(function (n, i) { return n === win[i]; }).length, tier: 'No prize', prize: 0, note: '', pool: true, count: list.length, hits: [] };
    list.forEach(function (c) { var t = poolTier(c, win); if (t) r.hits.push({ c: c, t: t }); });
    if (!r.hits.length) return r;
    r.hits.sort(function (a, b) { return (b.t.first ? 1e9 : b.t.prize) - (a.t.first ? 1e9 : a.t.prize); });
    r.tier = r.hits[0].t.name;
    r.hits.forEach(function (h) {
      if (h.t.first) { r.first = true; r.firstMin = g.min_jackpot * (played / 10); }
      else r.prize += h.t.prize * (played / 10);
    });
    return r;
  }
  function evalTicket(draw, nums, bet, played) {
    if (pool()) return evalPool(draw, nums, bet, played);
    var win = draw.numbers.map(Number), r = { matched: 0, tier: 'No prize', prize: 0, note: '' };
    if (g.type === 'lotto') {
      var set = {}; win.forEach(function (n) { set[n] = 1; });
      r.matched = nums.filter(function (n) { return set[n]; }).length;
      if (r.matched === 6) { r.tier = 'Jackpot'; r.prize = draw.jackpot; r.jackpot = true; }
      else if (r.matched === 3 && g.prizes && g.prizes.cat4_fixed) { r.tier = '4th prize (fixed)'; r.prize = g.prizes.cat4_fixed; }
      else if (r.matched >= 3) {
        r.tier = r.matched === 5 ? '2nd prize' : r.matched === 4 ? '3rd prize' : '4th prize'; r.prize = null;
        if (g.prizes) r.pool = r.matched === 5 ? g.prizes.cat2_pool : r.matched === 4 ? g.prizes.cat3_pool : null;
      }
      return r;
    }
    var distinct = {}; nums.forEach(function (n) { distinct[n] = 1; }); var dcount = Object.keys(distinct).length;
    var exact = nums.join('-') === win.join('-');
    var sameSet = L.sortNums(nums).join('-') === L.sortNums(win).join('-');
    var canRambo = dcount > 1;
    if (bet === 'rambolito' && !canRambo) r.note = 'Rambolito is not offered for ' + (g.digits === 3 ? 'triple digits' : 'a doubled number') + '; checked as Standard.';
    if (bet === 'standard' || !canRambo) {
      r.matched = nums.filter(function (n, i) { return n === win[i]; }).length;
      if (exact) { r.tier = 'Standard (exact order)'; r.prize = g.prizes.standard; }
      return r;
    }
    r.matched = (function () { var w2 = win.slice(), c = 0; nums.forEach(function (n) { var i = w2.indexOf(n); if (i >= 0) { c++; w2.splice(i, 1); } }); return c; })();
    if (sameSet) {
      if (g.digits === 3) { r.tier = dcount === 2 ? 'Rambolito 3 (double digit, any order)' : 'Rambolito 6 (all different, any order)'; r.prize = dcount === 2 ? g.prizes.rambolito_3 : g.prizes.rambolito_6; }
      else { r.tier = 'Rambolito (any order)'; r.prize = g.prizes.rambolito; }
    }
    return r;
  }

  function renderResults(tickets) {
    var ds = selectedDraws(), bet = elBet.value || 'standard', html = '', anyWin = false, lines = [], played = amountPlayed() || 10;
    if (!ds.length) { elOut.innerHTML = '<div class="result-box lose">No draw recorded for this date.</div>'; return; }
    tickets.forEach(function (t) {
      ds.forEach(function (d) {
        var r = evalTicket(d, t.nums, bet, played), total = nInputs();
        if (g.type === 'digit' && !r.pool && r.prize > 0) r.prize = r.prize * (played / 10);
        var head = 'Ticket ' + t.id + ': ' + L.numsLabel(g, t.nums) + (ds.length > 1 ? ' · ' + L.slotTime(d.slot) : '');
        var body, cls;
        if (r.first) {
          // The pool is shared by winners whose stakes we do not know, so no exact amount, tax or take-home is shown here.
          cls = 'win'; anyWin = true;
          body = (r.count > 1 ? r.hits.map(function (h) { return h.c.join('') + ': ' + h.t.name; }).join(', ') : r.tier) + '. Guaranteed minimum <b class="tabnum">' + L.peso(r.firstMin) + '</b>' + (played !== 10 ? ' on ' + L.peso(played) + ' per combination' : '') + '.<span class="sub">';
          if (d.jackpot != null && d.winners > 0) body += 'PCSO lists a pool of ' + L.peso(d.jackpot) + ' and ' + d.winners + ' first prize winner' + (d.winners === 1 ? '' : 's') + ' for this draw. ' + (g.digits === 6 ? 'The pool is divided in proportion to each winner\'s bet. ' : 'The prize money is divided among the winners. ');
          else if (d.winners === 0) body += 'PCSO recorded 0 first prize winners for this draw' + (d.jackpot != null ? ', with a pool of ' + L.peso(d.jackpot) : '') + '. Double-check your date and numbers. ';
          else body += 'This archive record has no pool or winner count. ';
          if (r.prize > 0) body += 'Other combinations on this play add ' + L.peso(r.prize) + ' in fixed prizes. ';
          body += 'Only PCSO validation gives the final amount. A prize above ₱10,000 is taxed 20% on the whole amount and is claimed at a PCSO office.</span>';
        } else if (r.prize === null) {
          cls = 'win'; anyWin = true;
          body = 'Matched ' + r.matched + ' of ' + total + ' — ' + r.tier + '.<span class="sub">' + (r.pool
            ? 'Your share of the ' + L.peso(r.pool) + ' pool, divided equally among all winning standard bets this draw. The amount depends on how many tickets won, so only PCSO validation can give the final figure. '
            : 'Set by PCSO. ') + 'A share above ₱10,000 is taxed 20%. <a href="/lottoph/guide/how-to-play-' + g.path + '/">See the prize table</a></span>';
        } else if (r.prize > 0) {
          cls = 'win'; anyWin = true;
          var split = r.jackpot && d.winners > 1, gross = split ? r.prize / d.winners : r.prize;
          var tax = L.taxOn(gross), net = gross - tax, v = venue(gross);
          body = r.pool
            ? (r.count > 1 ? r.hits.map(function (h) { return h.c.join('') + ': ' + h.t.name; }).join(', ') : r.tier) + '. Prize <b class="tabnum">' + L.peso(gross) + '</b>' + (played !== 10 ? ' on ' + L.peso(played) + ' per combination' : '') + '.'
            : 'Matched ' + r.matched + ' of ' + total + ' — ' + r.tier + '. ' + (split ? 'Your share' : 'Prize') + ' <b class="tabnum">' + L.peso(gross) + '</b>' + (g.type === 'digit' && played !== 10 ? ' on a ' + L.peso(played) + ' play' : '') + '.';
          body += '<span class="sub">';
          if (split) body += 'PCSO recorded ' + d.winners + ' jackpot winners, so the ' + L.peso(r.prize) + ' pot is divided equally. ';
          body += tax > 0 ? '20% tax on the full amount: −' + L.peso(tax) + '. Estimated take-home <b class="tabnum">' + L.peso(net) + '</b>.' : 'No tax (₱10,000 and below). Take-home <b class="tabnum">' + L.peso(net) + '</b>.';
          if (v) body += ' Claim at: ' + L.esc(v.where) + '. ' + L.esc(v.mode) + '.';
          if (r.tier.indexOf('fixed') >= 0 || r.pool) body += ' Amount from PCSO\'s current prize table; very old draws may differ.';
          if (r.jackpot && d.winners === 0) body += ' Note: PCSO recorded 0 jackpot winners for this draw — double-check your date and numbers.';
          body += '</span>';
        } else {
          cls = 'lose';
          body = r.pool
            ? (r.count > 1 ? 'None of the ' + r.count + ' combinations won a prize.' : 'No prize.') + ' ' + (g.digits === 4 ? 'The last 2 digits must match in exact order.' : 'The first 2 or last 2 digits must match in exact order.')
            : 'Matched ' + r.matched + ' of ' + total + ' — no prize' + (g.type === 'lotto' ? ' (3 or more needed)' : '') + '.';
        }
        if (r.note) body += '<span class="sub">' + r.note + '</span>';
        html += '<div class="result-box ' + cls + '">' + head + '<span class="sub">' + body + '</span></div>';
        lines.push(head + ' — ' + (r.first ? r.tier + ' (minimum ' + L.peso(r.firstMin) + ', share of the pool)' : r.prize === null ? r.tier + ' (share of the prize pool)' : r.prize > 0 ? r.tier + ' ' + L.peso(r.jackpot && d.winners > 1 ? r.prize / d.winners : r.prize) : 'no prize'));
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
    elBet.innerHTML = betOptions().map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
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
