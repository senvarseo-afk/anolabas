/* Ano Labas — ticket rules: what a ticket won on one draw, and the sentence that says so.
   One copy, used by the checker page (check.js) and the in-place drawer (check-sheet.js). Needs common.js.
   L.checker(game, claimTiers) binds the rules to a game; prizes come from games.json. */
(function (w) {
  'use strict';
  var L = w.LPH;
  L.checker = function (g, claim) {
  function venue(gross) { return (claim || []).filter(function (t) { return t.max == null || gross <= t.max; })[0]; }
  function nInputs() { return g.type === 'lotto' ? g.pick : g.digits; }
  /* 4D and 6D: one draw on fixed days, digits count in exact order, first prize from a shared pool */
  function pool() { return g.type === 'digit' && g.slots.length === 1; }
  function betOptions() {
    if (!pool()) return [['standard', 'Standard (exact order)'], ['rambolito', 'Rambolito (any order)']];
    return g.digits === 4 ? [['standard', 'Standard (exact order)'], ['perm', 'Perm / rambol'], ['roll1', 'Roll 1 (first digit 0–9)'], ['roll4', 'Roll 4 (last digit 0–9)']] : [['standard', 'Standard (exact order)']];
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

  /* cells a ticket cannot have: out of range, or a repeated number in a six-number game */
  function badCells(vals) {
    var bad = [], seen = {};
    vals.forEach(function (v, i) {
      if (isNaN(v) || v < g.range[0] || v > g.range[1] || (g.type === 'lotto' && seen[v])) bad.push(i);
      seen[v] = 1;
    });
    return bad;
  }
  /* one ticket on one draw: { cls: 'win'|'lose', win, body (HTML), summary (plain line) } */
  function verdict(d, nums, bet, played) {
    var win = false;
        var r = evalTicket(d, nums, bet, played), total = nInputs();
        if (g.type === 'digit' && !r.pool && r.prize > 0) r.prize = r.prize * (played / 10);
        var body, cls;
        if (r.first) {
          // The pool is shared by winners whose stakes we do not know, so no exact amount, tax or take-home is shown here.
          cls = 'win'; win = true;
          body = (r.count > 1 ? r.hits.map(function (h) { return h.c.join('') + ': ' + h.t.name; }).join(', ') : r.tier) + '. Guaranteed minimum <b class="tabnum">' + L.peso(r.firstMin) + '</b>' + (played !== 10 ? ' on ' + L.peso(played) + ' per combination' : '') + '.<span class="sub">';
          if (d.jackpot != null && d.winners > 0) body += 'PCSO lists a pool of ' + L.peso(d.jackpot) + ' and ' + d.winners + ' first prize winner' + (d.winners === 1 ? '' : 's') + ' for this draw. ' + (g.digits === 6 ? 'The pool is divided in proportion to each winner\'s bet. ' : 'The prize money is divided among the winners. ');
          else if (d.winners === 0) body += 'PCSO recorded 0 first prize winners for this draw' + (d.jackpot != null ? ', with a pool of ' + L.peso(d.jackpot) : '') + '. Double-check your date and numbers. ';
          else body += 'This archive record has no pool or winner count. ';
          if (r.prize > 0) body += 'Other combinations on this play add ' + L.peso(r.prize) + ' in fixed prizes. ';
          body += 'Only PCSO validation gives the final amount. A prize above ₱10,000 is taxed 20% on the whole amount and is claimed at a PCSO office.</span>';
        } else if (r.jackpot && d.winners == null) {
          // A record without a winner count cannot say whether the jackpot was shared, so no personal amount or tax is shown.
          cls = 'win'; win = true; r.unknownShare = true;
          body = 'Matched ' + r.matched + ' of ' + total + ' — ' + r.tier + '.<span class="sub">PCSO listed a jackpot of ' + L.peso(r.prize) + ' for this draw. This record has no winner count, so we cannot tell if it was shared. Only PCSO validation gives your amount. Prizes above ₱10,000 are taxed 20% and the jackpot is claimed at the PCSO Main Office.</span>';
        } else if (r.prize === null) {
          cls = 'win'; win = true;
          body = 'Matched ' + r.matched + ' of ' + total + ' — ' + r.tier + '.<span class="sub">' + (r.pool
            ? 'Your share of the ' + L.peso(r.pool) + ' pool, divided equally among all winning standard bets this draw. The amount depends on how many tickets won, so only PCSO validation can give the final figure. '
            : 'Set by PCSO. ') + 'A share above ₱10,000 is taxed 20%. <a href="/lottoph/guide/how-to-play-' + g.path + '/">See the prize table</a></span>';
        } else if (r.prize > 0) {
          cls = 'win'; win = true;
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
    return { cls: cls, win: win, body: body, summary: (r.unknownShare ? r.tier + ' (amount depends on PCSO validation)' : r.first ? r.tier + ' (minimum ' + L.peso(r.firstMin) + ', share of the pool)' : r.prize === null ? r.tier + ' (share of the prize pool)' : r.prize > 0 ? r.tier + ' ' + L.peso(r.jackpot && d.winners > 1 ? r.prize / d.winners : r.prize) : 'no prize') };
  }
  return { pool: pool, betOptions: betOptions, nInputs: nInputs, badCells: badCells, verdict: verdict };
  };
})(window);
