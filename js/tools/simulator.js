/* LottoPH Today — number simulator (for fun) + decision aids. Needs common.js and window.LPH_SIM = { game, games, dream, site }. */
(function () {
  'use strict';
  var L = window.LPH, cfg = window.LPH_SIM; if (!L || !cfg) return;
  var g = cfg.game, isLotto = g.type === 'lotto', N = isLotto ? g.pick : g.digits, lo = g.range[0], hi = g.range[1];
  var $ = function (id) { return document.getElementById(id); };
  var data = null, mode = 'random', windowN = 100, lastSets = [], busy = false;
  var MODE_LABEL = { random: 'Random', hot: 'Hot (most drawn)', cold: 'Cold (least drawn)', 'longest-gap': 'Longest gap (descriptive)', personal: 'Personal numbers', dream: 'Dream keyword (folklore)', today: 'Daily set' };

  function setStatus(t) { $('sim-status').textContent = t || ''; }
  function allNums() { var a = []; for (var i = lo; i <= hi; i++) a.push(i); return a; }

  /* ---------- generators ---------- */
  function genRandom(rng) {
    var out = [];
    if (isLotto) { var pool = allNums(); for (var i = 0; i < N; i++) { var j = L.randInt(pool.length, rng); out.push(pool.splice(j, 1)[0]); } return L.sortNums(out); }
    for (var k = 0; k < N; k++) out.push(lo + L.randInt(hi - lo + 1, rng));
    return out;
  }
  function freqStats(n) {
    var rows = data.draws.slice(0, n), counts = {}, gap = {};
    allNums().forEach(function (x) { counts[x] = 0; gap[x] = rows.length; });
    rows.forEach(function (d, idx) { d.numbers.forEach(function (x) { if (counts[x] == null) return; counts[x]++; if (gap[x] === rows.length) gap[x] = idx; }); });
    return { counts: counts, gap: gap, sample: rows.length, from: rows.length ? rows[rows.length - 1].date : null, to: rows.length ? rows[0].date : null };
  }
  function weightsFor(m, st) {
    var w = {}, max = 0; allNums().forEach(function (x) { if (st.counts[x] > max) max = st.counts[x]; });
    allNums().forEach(function (x) { w[x] = m === 'hot' ? st.counts[x] + 1 : m === 'cold' ? (max - st.counts[x]) + 1 : st.gap[x] + 1; });
    return w;
  }
  function pickWeighted(pool, w, rng) {
    var total = 0; pool.forEach(function (x) { total += w[x]; });
    var r = (rng ? rng() : L.randInt(1000000) / 1000000) * total, acc = 0;
    for (var i = 0; i < pool.length; i++) { acc += w[pool[i]]; if (r < acc) return i; }
    return pool.length - 1;
  }
  function genWeighted(m) {
    var st = freqStats(windowN), w = weightsFor(m, st), out = [];
    if (isLotto) { var pool = allNums(); for (var i = 0; i < N; i++) out.push(pool.splice(pickWeighted(pool, w), 1)[0]); return L.sortNums(out); }
    var all = allNums(); for (var k = 0; k < N; k++) out.push(all[pickWeighted(all, w)]);
    return out;
  }
  function fitRange(x) { x = Math.abs(Math.round(x)); if (isLotto || g.slug === '2d-lotto') { var span = hi - lo + 1; return ((x - lo) % span + span) % span + lo; } return x % 10; }
  function fillUnique(seed, rng) {
    var out = [], seen = {};
    seed.forEach(function (x) { if (!isNaN(x) && !seen[x] && out.length < N) { seen[x] = 1; out.push(x); } });
    if (isLotto) { while (out.length < N) { var r = lo + L.randInt(hi - lo + 1, rng); if (!seen[r]) { seen[r] = 1; out.push(r); } } return L.sortNums(out); }
    while (out.length < N) out.push(lo + L.randInt(hi - lo + 1, rng));
    return out;
  }
  function personalSeeds(bday, text) {
    var seeds = [], digits = (bday || '').replace(/\D/g, '') + (text || '').replace(/\D/g, '');
    if (bday) { var p = bday.split('-').map(Number); if (p.length === 3) { seeds.push(p[2], p[1], p[0] % 100, (p[0] % 100) + p[1], p[2] + p[1]); } }
    var t = (text || '').replace(/\D/g, '');
    for (var i = 0; i + 2 <= t.length; i += 2) seeds.push(parseInt(t.slice(i, i + 2), 10));
    if (!isLotto) { seeds = []; var pool = (bday ? bday.split('-').reverse().join('') : '') + t; for (var k = 0; k < pool.length; k++) seeds.push(parseInt(pool[k], 10)); if (g.slug === '2d-lotto') { seeds = []; if (bday) { var q = bday.split('-').map(Number); seeds.push(q[2], q[1]); } for (var m = 0; m + 2 <= t.length; m += 2) seeds.push(parseInt(t.slice(m, m + 2), 10)); } }
    return seeds.map(fitRange).filter(function (x) { return x >= lo && x <= hi; });
  }
  function genPersonal() {
    var bday = $('sim-bday').value, text = $('sim-plate').value;
    if (!bday && !text.replace(/\D/g, '')) { setStatus('Enter a birthday or a plate/anniversary number first.'); return null; }
    var seeds = personalSeeds(bday, text);
    return isLotto ? fillUnique(seeds) : fillUnique(seeds.slice(0, N));
  }
  function dreamMatch(kw) {
    kw = (kw || '').trim().toLowerCase(); if (!kw) return null;
    for (var i = 0; i < cfg.dream.length; i++) { var e = cfg.dream[i]; if (e.k.some(function (k) { return k === kw || kw.indexOf(k) >= 0 || k.indexOf(kw) >= 0; })) return e; }
    return null;
  }
  function genDream() {
    var e = dreamMatch($('sim-dream-kw').value);
    if (!e) { setStatus('No folklore entry for that word. Try one from the list (e.g. ahas, tubig, pera).'); return null; }
    var seeds = isLotto ? e.n.slice() : String(e.n.join('')).split('').map(Number);
    if (g.slug === '2d-lotto') seeds = e.n.slice();
    return fillUnique(seeds.map(fitRange));
  }
  function genToday() {
    var bday = $('sim-bday').value;
    if (!bday) { setStatus('Enter your birthday to get your one set for today.'); return null; }
    var rng = L.mulberry32(L.hashStr(bday + '|' + L.todayManila() + '|' + g.slug));
    return genRandom(rng);
  }
  function generateOne() {
    if (mode === 'random') return genRandom();
    if (mode === 'hot' || mode === 'cold' || mode === 'longest-gap') { if (!data) { setStatus('Draw history is still loading…'); return null; } return genWeighted(mode); }
    if (mode === 'personal') return genPersonal();
    if (mode === 'dream') return genDream();
    if (mode === 'today') return genToday();
    return genRandom();
  }

  /* ---------- pattern / crowding analysis (prize sharing only) ---------- */
  function analyze(nums) {
    var flags = [], s = L.sortNums(nums);
    if (isLotto) {
      if (s[s.length - 1] <= 31) flags.push(['Birthday range 1–31', 'All numbers 1–31 (birthday range). Many players use dates, so a jackpot on this set would be shared among more winners.']);
      var run = 1, best = 1; for (var i = 1; i < s.length; i++) { run = s[i] === s[i - 1] + 1 ? run + 1 : 1; if (run > best) best = run; }
      if (best === s.length) flags.push(['Six consecutive', 'Six consecutive numbers (e.g. 1-2-3-4-5-6): one of the most-played pattern tickets, so heavy sharing if it ever hits.']);
      else if (best >= 3) flags.push(['Run of ' + best + ' consecutive', 'Contains a run of ' + best + ' consecutive numbers. Pattern tickets are popular, which means more sharing.']);
      var d = s[1] - s[0], arith = true; for (var j = 2; j < s.length; j++) if (s[j] - s[j - 1] !== d) arith = false;
      if (arith && best < s.length) flags.push(['Arithmetic pattern', 'Arithmetic pattern (step ' + d + '). Often played straight down a betting slip column.']);
      var ev = s.filter(function (x) { return x % 2 === 0; }).length;
      if (ev === s.length) flags.push(['All even', 'All even numbers — a common slip pattern.']); else if (ev === 0) flags.push(['All odd', 'All odd numbers — a common slip pattern.']);
      if (Math.floor(s[0] / 10) === Math.floor(s[s.length - 1] / 10)) flags.push(['Same ten-block', 'All numbers in the same ten-block (' + Math.floor(s[0] / 10) * 10 + 's).']);
      if (s.every(function (x) { return x % 5 === 0; })) flags.push(['Multiples of 5', 'All multiples of 5 — a common slip pattern.']);
    } else {
      var distinct = {}; nums.forEach(function (x) { distinct[x] = 1; }); var dc = Object.keys(distinct).length;
      if (dc === 1) flags.push(['Repeated digits', 'Repeated digits (' + nums.join('-') + '). Digit games pay a fixed prize per ticket, so crowding does not cut your prize, but outlets may stop selling a heavily bet combination once PCSO\'s limit for it is reached.']);
      if (nums.join('') === '123' || nums.join('') === '321' || (g.slug === '2d-lotto' && Math.abs(nums[0] - nums[1]) === 1)) flags.push(['Sequential digits', 'Sequential digits — popular "pasakay" pick.']);
    }
    if (data && data.draws.length) {
      var last = data.draws[0];
      if (L.keyOf(g, last.numbers) === L.keyOf(g, nums)) flags.push(['Same as last draw', 'Identical to the last draw (' + L.fmtShort(last.date) + (isLotto ? '' : ' ' + last.slot) + '). It is as likely as any other set, but it is the most-copied combination, so a repeat would be heavily shared.']);
    }
    return flags;
  }
  function flagsHTML(nums) {
    var f = analyze(nums);
    if (!f.length) return '<span class="flag ok">No crowd-pattern flags</span> <span class="small muted">Equally likely as any other set.</span>';
    return f.map(function (t) { return '<span class="flag" title="' + L.esc(t[1]) + '">' + L.esc(t[0]) + '</span>'; }).join('') + '<div class="small muted">' + f.map(function (t) { return L.esc(t[1]); }).join(' ') + ' Every combination is equally likely; this only affects prize sharing.</div>';
  }

  /* ---------- render sets ---------- */
  function setHTML(idx, nums) {
    var label = L.numsLabel(g, nums);
    return '<div class="sim-set" data-idx="' + idx + '">' +
      '<div class="card-head"><span class="sim-label">Simulation · set ' + (idx + 1) + '</span><span class="small muted">' + L.esc(MODE_LABEL[mode]) + '</span></div>' +
      L.ballsHTML(g, nums, 'lg', 'Simulated set ' + (idx + 1)) +
      '<div class="pattern small">' + flagsHTML(nums) + '</div>' +
      '<div class="btn-row">' +
      '<button type="button" class="btn sec sm" data-act="copy">Copy</button>' +
      '<button type="button" class="btn sec sm" data-act="appeared">Has this appeared?</button>' +
      '<button type="button" class="btn pri sm" data-act="download">Download card</button>' +
      '<button type="button" class="btn ghost sm" data-act="share">Share</button>' +
      '<button type="button" class="btn ghost sm" data-act="save">Save to my numbers</button>' +
      '</div>' +
      '<div class="status" data-out></div><div class="card-preview" data-preview hidden></div>' +
      '</div>';
  }
  /* Tambiolo reveal. Timeline (ms): drum spins 0-SPIN; set 1 balls drop at SPIN + i*STEP (DROP each);
     set 1 pattern/buttons fade in just before the last ball lands; sets 2..n fade in SET_GAP apart; then done.
     CSS animations + a few setTimeouts only; the numbers shown are exactly `sets`. */
  var SPIN = 1400, STEP = 120, DROP = 420, FADE = 300, SET_GAP = 150, timers = [];
  function prefersReduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function doneText(n) { return 'Done: ' + n + ' simulated set' + (n > 1 ? 's' : '') + ' ready.'; }
  function keepInView(stage, box) { // make sure the first result row will be on screen (bottom nav covers the last ~60px on phones)
    try {
      var row = box.querySelector('.balls') || box, rb = row.getBoundingClientRect().bottom, st = stage.getBoundingClientRect().top;
      var nav = document.querySelector('.bottomnav'), navH = nav ? nav.getBoundingClientRect().height : 0;
      var dy = Math.min(rb + 12 - (window.innerHeight - navH), st - 8);
      if (dy > 0) { try { window.scrollBy({ top: dy, behavior: 'smooth' }); } catch (e) { window.scrollBy(0, dy); } }
    } catch (e) {}
  }
  function revealSets(sets) {
    var out = $('sim-out'), go = $('sim-go'), stage = $('sim-stage'), label = $('sim-stage-label');
    timers.forEach(clearTimeout); timers = [];
    out.innerHTML = sets.map(function (s, i) { return setHTML(i, s); }).join('');
    if (!stage || prefersReduced()) { // checked at click time: no drum, results at once
      if (stage) stage.classList.remove('is-spin');
      busy = false; go.disabled = false; out.removeAttribute('aria-busy');
      setStatus(doneText(sets.length));
      return;
    }
    var boxes = out.querySelectorAll('.sim-set'), first = boxes[0], firstBalls = first.querySelectorAll('.balls .ball'), tail = first.querySelectorAll('.pattern, .btn-row');
    var hadFocus = document.activeElement === go;
    busy = true; go.disabled = true; out.setAttribute('aria-busy', 'true');
    first.classList.add('tb-wait');
    each(tail, function (el) { el.classList.add('tb-hide'); });
    for (var i = 1; i < boxes.length; i++) boxes[i].classList.add('tb-hide');
    if (label) label.textContent = 'SIMULATION · Random draw';
    stage.classList.remove('is-spin'); void stage.offsetWidth; stage.classList.add('is-spin');
    setStatus('Drawing ' + sets.length + ' simulated set' + (sets.length > 1 ? 's' : '') + '…');
    keepInView(stage, first);
    later(function () {
      stage.classList.remove('is-spin');
      each(firstBalls, function (b, k) { b.style.animationDelay = (k * STEP) + 'ms'; });
      first.classList.remove('tb-wait'); first.classList.add('tb-drop');
    }, SPIN);
    var landed = SPIN + (firstBalls.length - 1) * STEP + DROP;
    later(function () { each(tail, function (el) { el.classList.remove('tb-hide'); el.classList.add('tb-show'); }); }, landed - 120);
    each(boxes, function (box, k) {
      if (k === 0) return;
      later(function () { box.classList.remove('tb-hide'); box.classList.add('tb-show'); }, landed + (k - 1) * SET_GAP);
    });
    var end = Math.max(landed - 120 + FADE, boxes.length > 1 ? landed + (boxes.length - 2) * SET_GAP + FADE : 0);
    later(function () {
      first.classList.remove('tb-drop');
      each(firstBalls, function (b) { b.style.animationDelay = ''; });
      each(out.querySelectorAll('.tb-show'), function (el) { el.classList.remove('tb-show'); });
      if (label) label.textContent = 'SIMULATION · Done';
      busy = false; go.disabled = false; out.removeAttribute('aria-busy');
      if (hadFocus && (!document.activeElement || document.activeElement === document.body)) { try { go.focus({ preventScroll: true }); } catch (e) {} }
      setStatus(doneText(sets.length));
    }, end);
  }
  function cardFor(nums) {
    return L.drawCard({ title: g.display, subtitle: L.fmtDate(L.todayManila()) + ' · ' + MODE_LABEL[mode], numbers: (isLotto ? L.sortNums(nums) : nums).map(function (n) { return L.pad(g, n); }), square: g.ball === 'square', mode: 'Simulated set · not a draw result', site: (cfg.site || '').replace(/^https?:\/\//, '') });
  }
  $('sim-out').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]'); if (!btn) return;
    var box = btn.closest('.sim-set'), idx = +box.getAttribute('data-idx'), nums = lastSets[idx], out = box.querySelector('[data-out]'), act = btn.getAttribute('data-act');
    var label = L.numsLabel(g, nums), text = g.display + ' simulated set: ' + label + ' — for fun only, not a prediction. ' + cfg.site + '/simulator/' + g.path + '/';
    if (act === 'copy') { L.copyText(text).then(function () { out.textContent = 'Copied: ' + label; }, function () { out.textContent = 'Copy not available on this browser.'; }); }
    if (act === 'appeared') {
      if (!data) { out.textContent = 'Draw history still loading…'; return; }
      var hits = L.findCombination(g, data.draws, nums), total = data.draws.length, since = data.draws[total - 1].date;
      out.innerHTML = hits.length
        ? 'This exact ' + (isLotto ? 'combination (any order)' : 'result') + ' appeared ' + hits.length + ' time' + (hits.length > 1 ? 's' : '') + ': ' + hits.slice(0, 5).map(function (d) { return L.fmtShort(d.date) + (isLotto ? '' : ' ' + d.slot); }).join('; ') + (hits.length > 5 ? '…' : '') + '. Past appearance does not change the odds of the next draw.'
        : 'Never appeared in the ' + total.toLocaleString() + ' recorded draws since ' + L.fmtShort(since) + '. That is normal — most combinations have never been drawn — and it does not change the odds.';
    }
    if (act === 'download' || act === 'share') {
      var c = cardFor(nums), fname = 'lottoph-' + g.path + '-simulation-' + label.replace(/[^0-9]+/g, '-') + '.png';
      var prev = box.querySelector('[data-preview]');
      prev.innerHTML = '<img alt="Simulation card for ' + L.esc(label) + '" src="' + c.toDataURL('image/png') + '"><p class="small muted">If the download did not start, long-press the image to save it.</p>'; prev.hidden = false;
      if (act === 'download') L.downloadCanvas(c, fname).then(function () { out.textContent = 'Card ready (1080×1350).'; }, function () { out.textContent = 'Long-press the image to save.'; });
      else L.shareCanvas(c, g.display + ' simulation', text, cfg.site + '/simulator/' + g.path + '/', fname).then(function () { out.textContent = 'Shared.'; }, function () { out.textContent = 'Share cancelled or not available; use Download card instead.'; });
    }
    if (act === 'save') {
      var list = L.myNumbers(); list.unshift({ game: g.slug, path: g.path, short: g.short, nums: isLotto ? L.sortNums(nums) : nums, saved: L.todayManila() });
      out.textContent = L.saveMyNumbers(list) ? 'Saved on this phone (see "My numbers" below).' : 'Could not save (storage blocked).';
      renderMy();
    }
  });

  /* ---------- controls ---------- */
  function setMode(m) {
    mode = m;
    document.querySelectorAll('#sim-mode button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === m ? 'true' : 'false'); });
    $('sim-window-wrap').hidden = !(m === 'hot' || m === 'cold' || m === 'longest-gap');
    $('sim-personal').hidden = !(m === 'personal' || m === 'today');
    $('sim-plate-wrap').hidden = m !== 'personal';
    $('sim-dream').hidden = m !== 'dream';
    $('sim-count-wrap').hidden = m === 'today';
    $('sim-mode-note').textContent = {
      random: 'Every set is drawn with crypto-grade randomness. Every combination has the same chance: 1 in ' + (isLotto ? g.odds_jackpot : g.odds_straight).toLocaleString() + ' for the top prize.',
      hot: 'Numbers that appeared more often in the sample window get more weight. Descriptive only — frequency does not change the next draw.',
      cold: 'Numbers that appeared less often in the sample window get more weight. Descriptive only — no number is "due".',
      'longest-gap': 'Numbers with the longest gap since their last appearance get more weight. Descriptive only — a long gap does not change the odds.',
      personal: 'Birthday, plate or anniversary digits become numbers; the rest are filled randomly. Note: dates only cover 1–31, and birthday tickets are very common, so a jackpot on such a set is more likely to be shared.',
      dream: 'Folklore table of common Filipino dream symbols and the numbers tradition attaches to them. Entertainment only; it has no effect on the draw.',
      today: 'One fixed set per day, made from your birthday + today\'s date. Same input gives the same set until midnight (Manila). It does not raise your chance of winning.'
    }[m];
    updateWindowNote();
  }
  function updateWindowNote() {
    var n = $('sim-window-note'); if (!data) { n.textContent = 'Loading draw history…'; return; }
    var st = freqStats(windowN);
    n.textContent = 'Sample window: last ' + st.sample + ' draws, ' + L.fmtShort(st.from) + ' to ' + L.fmtShort(st.to) + ' (all draw times). Past frequency is descriptive and does not change future odds.';
  }
  document.querySelectorAll('#sim-mode button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });
  $('sim-window').addEventListener('change', function () { windowN = +$('sim-window').value; updateWindowNote(); });
  $('sim-dream-kw').addEventListener('input', function () { var e = dreamMatch($('sim-dream-kw').value); $('sim-dream-note').textContent = e ? 'Folklore: ' + e.t + ' → ' + e.n.join(', ') : ''; });
  $('sim-go').addEventListener('click', function () {
    if (busy) return;
    var count = mode === 'today' ? 1 : Math.min(5, Math.max(1, +$('sim-count').value || 1)), sets = [];
    setStatus('');
    for (var i = 0; i < count; i++) { var s = generateOne(); if (!s) return; sets.push(s); }
    lastSets = sets; revealSets(sets);
    try { localStorage.setItem('lph_sim_bday', $('sim-bday').value || ''); } catch (e) {}
  });
  try { var sb = localStorage.getItem('lph_sim_bday'); if (sb) $('sim-bday').value = sb; } catch (e) {}

  /* ---------- decision aids ---------- */
  function drawsPerWeek() { return g.days === 'daily' ? 7 * g.slots.length : g.days.length * g.slots.length; }
  function drawsInNextDays(days) {
    var now = L.manilaNow(), count = 0;
    for (var a = 0; a < days; a++) { var d = new Date(now); d.setDate(now.getDate() + a); var wd = L.DAY3[d.getDay()]; if (g.days === 'daily' || g.days.indexOf(wd) >= 0) count += g.slots.length; }
    return count;
  }
  function budget() {
    var b = +$('aid-budget-input').value || 0, out = $('aid-budget-out'); if (!b) { out.innerHTML = ''; return; }
    var plays = Math.floor(b / g.price_php), perDraw = Math.floor(plays / drawsPerWeek()), left = b - plays * g.price_php;
    var rows = cfg.games.map(function (x) { return '<tr><td>' + L.esc(x.display) + '</td><td class="num">₱' + x.price_php + '</td><td class="num">' + Math.floor(b / x.price_php) + '</td></tr>'; }).join('');
    out.innerHTML = '<div class="kv"><span>Weekly cap</span><b>' + L.peso(b) + '</b><span>' + L.esc(g.display) + ' plays at ₱' + g.price_php + '</span><b>' + plays + '</b><span>Spread over ' + drawsPerWeek() + ' draws this week</span><b>' + perDraw + ' per draw</b><span>Left over</span><b>' + L.peso(left) + '</b></div>' +
      '<details><summary class="small">If the whole cap went to one game instead…</summary><div class="table-wrap"><table><thead><tr><th>Game</th><th class="num">Price</th><th class="num">Plays</th></tr></thead><tbody>' + rows + '</tbody></table></div></details>' +
      '<p class="small muted">Budget tool only; it does not increase your chance of winning. Set the cap first, then stop when it is spent.</p>';
  }
  $('aid-budget-input').addEventListener('input', budget);
  function spend() {
    var plays = Math.max(0, +$('aid-spend-plays').value || 0), out = $('aid-spend-out');
    var rows = [7, 14, 30].map(function (days) { var n = drawsInNextDays(days); return '<tr><td>' + days + ' days</td><td class="num">' + n + '</td><td class="num">' + L.peso(n * plays * g.price_php) + '</td></tr>'; }).join('');
    out.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Period</th><th class="num">Draws</th><th class="num">Spend</th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="small muted">' + plays + ' play' + (plays === 1 ? '' : 's') + ' × ₱' + g.price_php + ' per draw, counting ' + L.esc(g.display) + ' draw days from today (Manila). Buying more draws does not make a win due; never chase losses.</p>';
  }
  $('aid-spend-plays').addEventListener('input', spend); spend();
  function parseOwn(str) { var a = String(str || '').split(/[^0-9]+/).filter(Boolean).map(Number); return a; }
  $('aid-pattern-go').addEventListener('click', function () {
    var nums = parseOwn($('aid-pattern-input').value), out = $('aid-pattern-out');
    var bad = nums.length !== N || nums.some(function (x) { return x < lo || x > hi; }) || (isLotto && new Set(nums).size !== N);
    if (bad) { out.innerHTML = '<p class="warn">Enter exactly ' + N + ' numbers from ' + lo + ' to ' + hi + (isLotto ? ', no repeats' : '') + ', separated by dashes or spaces.</p>'; return; }
    var hits = data ? L.findCombination(g, data.draws, nums) : [];
    out.innerHTML = L.ballsHTML(g, isLotto ? L.sortNums(nums) : nums, 'sm') + '<div class="small" style="margin-top:6px">' + flagsHTML(nums) + '</div>' +
      (data ? '<p class="small muted">' + (hits.length ? 'Appeared before: ' + hits.slice(0, 3).map(function (d) { return L.fmtShort(d.date); }).join(', ') + (hits.length > 3 ? '…' : '') : 'Never appeared in ' + data.draws.length.toLocaleString() + ' recorded draws.') + '</p>' : '') +
      '<div class="btn-row"><button type="button" class="btn ghost sm" id="aid-pattern-save">Save to my numbers</button><a class="btn sec sm" href="/lottoph/check/?game=' + g.slug + '&n=' + nums.join('-') + '">Check this vs latest draw</a></div>';
    $('aid-pattern-save').addEventListener('click', function () { var list = L.myNumbers(); list.unshift({ game: g.slug, path: g.path, short: g.short, nums: isLotto ? L.sortNums(nums) : nums, saved: L.todayManila() }); L.saveMyNumbers(list); renderMy(); setStatus('Saved to my numbers.'); });
  });
  function renderMy() {
    var list = L.myNumbers(), ul = $('my-list');
    if (!list.length) { ul.innerHTML = '<li class="muted small">Nothing saved yet. Use "Save to my numbers" on any set.</li>'; return; }
    ul.innerHTML = list.map(function (it, i) {
      var gg = cfg.games.filter(function (x) { return x.slug === it.game; })[0] || g;
      return '<li><span class="chip">' + L.esc(it.short || gg.short) + '</span><span class="nums">' + it.nums.map(function (n) { return L.pad(gg, n); }).join('-') + '</span><span class="small muted">' + L.esc(it.saved || '') + '</span>' +
        '<a class="btn pri sm" href="/lottoph/check/?game=' + encodeURIComponent(it.game) + '&n=' + it.nums.join('-') + '">Check</a><button type="button" class="btn link sm" data-del="' + i + '">Remove</button></li>';
    }).join('');
  }
  $('my-list').addEventListener('click', function (e) { var b = e.target.closest('[data-del]'); if (!b) return; var list = L.myNumbers(); list.splice(+b.getAttribute('data-del'), 1); L.saveMyNumbers(list); renderMy(); });
  $('my-clear').addEventListener('click', function () { if (confirm('Remove all saved numbers from this phone?')) { L.saveMyNumbers([]); renderMy(); } });
  renderMy();

  /* ---------- boot ---------- */
  setMode('random');
  L.loadGame(g.slug).then(function (j) {
    data = j; updateWindowNote();
    var last = j.draws[0];
    if (last) $('aid-last-note').textContent = 'Last draw: ' + L.fmtShort(last.date) + (isLotto ? '' : ' ' + L.slotTime(last.slot)) + ' — ' + L.numsLabel(g, last.numbers) + '. Generated sets are compared against it automatically.';
  }).catch(function () { setStatus('Could not load draw history; Random, Personal and Dream modes still work.'); $('sim-window-note').textContent = 'Draw history unavailable right now.'; });
})();
