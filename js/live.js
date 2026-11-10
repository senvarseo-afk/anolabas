/* Ano Labas — live layer (motion package C, reviewed with Codex 2026-11-04; interaction pass 2026-11-05).
 * - Countdown / draw-window / awaiting-result status in Manila time (UTC+8, no DST)
 * - Today's 2PM / 5PM / 9PM timeline (published only when every scheduled game is in)
 * - Polls /live/current.json (60 s near draws, 5 min otherwise; paused in background; timeout + backoff)
 * - New or corrected result: updates the matching board row / card in place, flashes it, red dot on the game tab,
 *   and shows a "Just drawn" toast that jumps to the row
 * - Home board rows expand in place; bottom nav / game strip active state + sliding indicators
 * - Ticker pause, jackpot count-up (once per session), scroll reveal (with a safety net)
 * Works with Astro's ClientRouter: module state lives across navigations, DOM bindings re-run on astro:page-load.
 * DOM is built with textContent only. All server HTML stays valid without this file.
 */
(function () {
  'use strict';
  if (window.__lphLive) return; // the script tag can be evaluated again after a client-side navigation
  window.__lphLive = true;

  var CFG = { games: [], latest: {} };
  function readCfg() { var el = document.getElementById('lph-schedule'); try { if (el) CFG = JSON.parse(el.textContent || '{}'); } catch (e) {} }
  readCfg();
  var GAMES = CFG.games || [];
  var BY = {}; GAMES.forEach(function (g) { BY[g.slug] = g; });

  var reduce = function () { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var SLOT_MIN = { '2PM': 14 * 60, '5PM': 17 * 60, '9PM': 21 * 60 };
  var WINDOW_MIN = { '2PM': 20, '5PM': 20, '9PM': 35 };
  var WAIT_MAX_MIN = 240;
  var SLOT_LABEL = { '2PM': '2PM', '5PM': '5PM', '9PM': '9PM' };
  var DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ORDER = { '2PM': 1, '5PM': 2, '9PM': 3 };

  /* ---------- helpers ---------- */
  function mnl(ms) { return new Date((ms === undefined ? Date.now() : ms) + 8 * 3600e3); } // read with getUTC*
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function startMs(dateIso, slot) { var p = dateIso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2], 0, SLOT_MIN[slot]) - 8 * 3600e3; }
  function noDrawOn(d) { return (CFG.noDraw || []).indexOf(iso(d)) >= 0; }
  function drawsOnDay(g, d) { return !noDrawOn(d) && (g.days === 'daily' || (g.days || []).indexOf(DAY3[d.getUTCDay()]) >= 0); }
  function addDays(d, n) { return new Date(d.getTime() + n * 86400e3); }
  function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
  function time12(hhmm) { var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); if (!m) return hhmm || ''; var h = +m[1], ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return m[2] === '00' ? h + ap : h + ':' + m[2] + ' ' + ap; }
  function fmtPeso(n) { if (n == null || isNaN(n)) return '—'; return '₱' + Math.round(Number(n)).toLocaleString('en-PH', { maximumFractionDigits: 0 }); }
  function fmtDateLong(dIso) {
    var p = dIso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()] + ', ' +
      ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + p[0];
  }
  function fmtDateShort(dIso) { var p = dIso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return DAY3[d.getUTCDay()] + ', ' + MON3[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + p[0]; }
  function fmtDateRow(dIso) { var p = dIso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return DAY3[d.getUTCDay()] + ', ' + MON3[d.getUTCMonth()] + ' ' + d.getUTCDate(); }
  function fmtCountdown(ms) {
    var s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h >= 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
    if (h >= 1) return h + 'h ' + pad(m) + 'm';
    return m + ':' + pad(sec);
  }
  function dayLabel(dIso, now) {
    if (dIso === iso(mnl(now))) return 'today';
    if (dIso === iso(addDays(mnl(now), 1))) return 'tomorrow';
    var p = dIso.split('-'); return MON3[+p[1] - 1] + ' ' + (+p[2]);
  }
  /* Swertres and EZ2 draw several times a day; 4D and 6D follow the single-draw flow of the six-number games */
  function daily(g) { return g.slots.length > 1; }
  function prizeLow(g) { return g.type === 'lotto' ? 'jackpot' : 'first prize'; }
  function prizeCap(g) { return g.type === 'lotto' ? 'Jackpot' : 'First prize'; }
  function padN(g, n) { var v = parseInt(n, 10); return (g.type === 'lotto' || g.slug === '2d-lotto') ? pad(v) : String(v); }
  function mdShort(dIso) { var p = dIso.split('-'); return MON3[+p[1] - 1] + ' ' + (+p[2]); }
  /** Next scheduled draw for a game, regardless of live or awaiting state. */
  function nextSlot(g, now) {
    var today = mnl(now), best = null;
    for (var add = 0; add <= 8 && !best; add++) {
      var day = addDays(today, add);
      if (!drawsOnDay(g, day)) continue;
      g.slots.forEach(function (slot) { var at = startMs(iso(day), slot); if (at > now && (!best || at < best.at)) best = { date: iso(day), slot: slot, at: at }; });
    }
    return best;
  }
  function winnersText(n, one) { return n == null ? '—' : Number(n).toLocaleString() + ' ' + (one || 'winner') + (n === 1 ? '' : 's'); }

  /* ---------- known results: received (any status) vs official ---------- */
  var received = {}, official = {}, sigs = {}, latestDate = {};
  function seedLatest() {
    Object.keys(CFG.latest || {}).forEach(function (slug) {
      var l = CFG.latest[slug]; if (!l) return;
      if (!latestDate[slug] || l.date > latestDate[slug]) latestDate[slug] = l.date;
      (l.slots || []).forEach(function (s) {
        var k = slug + '|' + l.date + '|' + s;
        received[k] = official[k] = true;
        if (l.sigs && l.sigs[s] && !sigs[k]) sigs[k] = l.sigs[s]; // what the page was built with, so a later PCSO correction is noticed
      });
    });
  }
  seedLatest();
  function isReceived(slug, date, slot) { return !!received[slug + '|' + date + '|' + slot] || !!(latestDate[slug] && latestDate[slug] > date); }

  /* ---------- per-game state (live > awaiting > next) ---------- */
  function gameState(g, now, only) {
    var today = mnl(now), slots = [];
    for (var add = -1; add <= 8; add++) {
      var day = addDays(today, add), dIso = iso(day);
      if (!drawsOnDay(g, day)) continue;
      g.slots.forEach(function (slot) { if (!only || only === slot) slots.push({ date: dIso, slot: slot, at: startMs(dIso, slot) }); });
    }
    slots.sort(function (a, b) { return a.at - b.at; });
    var next = null, wait = null;
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i], end = s.at + WINDOW_MIN[s.slot] * 60e3;
      if (now >= s.at && now < end) return { kind: 'live', date: s.date, slot: s.slot, at: s.at };
      if (now < s.at) { next = s; break; }
      var nextStart = slots[i + 1] ? slots[i + 1].at : Infinity;
      if (now < Math.min(end + WAIT_MAX_MIN * 60e3, nextStart) && !isReceived(g.slug, s.date, s.slot)) wait = s;
    }
    if (wait) return { kind: 'wait', date: wait.date, slot: wait.slot, at: wait.at };
    return next ? { kind: 'next', date: next.date, slot: next.slot, at: next.at } : null;
  }

  /* ---------- status lines ---------- */
  var statusEls = [], timeline = null;
  var newMsg = null, newUntil = 0;
  function setState(el, cls) { ['is-live', 'is-wait', 'is-new'].forEach(function (c) { el.classList.toggle(c, c === cls); }); }
  function groupNewest(arr) { arr.sort(function (a, b) { return b.s.at - a.s.at; }); return arr.filter(function (x) { return x.s.at === arr[0].s.at; }); }
  function renderStatus(el, now) {
    var key = el.getAttribute('data-status'), only = el.getAttribute('data-status-slot'), txt = el.querySelector('.st-text'), cd = el.querySelector('.st-cd');
    if (newMsg && now < newUntil && (key === 'all' || key === newMsg.slug) && (!only || only === newMsg.slot)) { setState(el, 'is-new'); setText(txt, newMsg.text); setText(cd, ''); return; }
    var states = (key === 'all' ? GAMES : [BY[key]]).filter(Boolean).map(function (g) { var s = gameState(g, now, only); return s ? { g: g, s: s } : null; }).filter(Boolean);
    if (!states.length) return;
    var pick = function (k) { return states.filter(function (x) { return x.s.kind === k; }); };
    var live = pick('live'), wait = pick('wait'), next = pick('next');
    var names = function (arr) { return arr.map(function (x) { return x.g.short; }).join(', '); };
    if (live.length) {
      live = groupNewest(live); setState(el, 'is-live');
      setText(txt, 'Live na ang draw · ' + SLOT_LABEL[live[0].s.slot] + (key === 'all' ? ' · ' + names(live) : '')); setText(cd, '');
    } else if (wait.length) {
      wait = groupNewest(wait); setState(el, 'is-wait');
      setText(txt, 'Waiting for official result · ' + SLOT_LABEL[wait[0].s.slot] + (key === 'all' ? ' · ' + names(wait) : '')); setText(cd, '');
    } else if (next.length) {
      next.sort(function (a, b) { return a.s.at - b.s.at; });
      var first = next[0], same = next.filter(function (x) { return x.s.at === first.s.at; });
      setState(el, '');
      var when = SLOT_LABEL[first.s.slot] + ' ' + dayLabel(first.s.date, now);
      setText(txt, key === 'all' ? 'Next: ' + when + ' · ' + names(same) : 'Next ' + first.g.short + ' draw: ' + when + ' · Bola na in');
      setText(cd, fmtCountdown(first.s.at - now));
    }
  }

  /* ---------- today's timeline ---------- */
  function renderTimeline(now) {
    if (!timeline) return;
    var todayD = mnl(now), today = iso(todayD);
    [].forEach.call(timeline.querySelectorAll('.tl-step'), function (step) {
      var slot = step.getAttribute('data-slot'), st = startMs(today, slot), end = st + WINDOW_MIN[slot] * 60e3;
      var games = GAMES.filter(function (g) { return g.slots.indexOf(slot) >= 0 && drawsOnDay(g, todayD); });
      var got = games.filter(function (g) { return received[g.slug + '|' + today + '|' + slot]; }).length;
      var all = games.length > 0 && got === games.length;
      var cls = all ? 'done' : (now >= st && now < end) ? 'live' : (got > 0 || now >= end) ? 'wait' : '';
      var label = all ? 'Published' : cls === 'live' ? 'Live na' : got > 0 ? 'Partly out' : cls === 'wait' ? 'Awaiting result' : 'Upcoming';
      ['done', 'live', 'wait'].forEach(function (c) { step.classList.toggle(c, c === cls); });
      setText(step.querySelector('.tl-state'), label);
    });
  }

  /* Game pages: say plainly when the card below is not the draw the reader may be waiting for. */
  function renderDrawNotes(now) {
    [].forEach.call(document.querySelectorAll('[data-drawnote]'), function (el) {
      var g = BY[el.getAttribute('data-drawnote')], only = el.getAttribute('data-note-slot') || undefined;
      var card = document.querySelector('article.card[data-game="' + el.getAttribute('data-drawnote') + '"]'), s = g && gameState(g, now, only), text = '';
      if (s && card) {
        var today = iso(mnl(now)), date = card.getAttribute('data-date'), slot = card.getAttribute('data-slot');
        var below = 'Below is the ' + (date === today ? SLOT_LABEL[slot] : fmtDateRow(date) + ' ' + SLOT_LABEL[slot]) + ' result.';
        var shown = date === s.date && slot === s.slot;
        if (s.kind === 'wait' && !shown) text = SLOT_LABEL[s.slot] + ' drawn. Waiting for the official result. ' + below;
        else if (s.kind === 'live' && !shown) text = 'Today ' + SLOT_LABEL[s.slot] + ' is being drawn. ' + below;
        else if (s.kind === 'next' && s.date === today && !shown) text = 'Today ' + SLOT_LABEL[s.slot] + ' is not drawn yet. ' + below;
      }
      setText(el, text); el.hidden = !text;
    });
  }
  /* Right after a draw, everything from that draw time goes in the home hero. Other hours keep the normal hero. */
  function setHomeJust(on, date, slot) {
    var head = document.querySelector('.home-board'); if (!head) return;
    head.classList.toggle('hb-just', on);
    [].forEach.call(document.querySelectorAll('[data-hero-extra]'), function (el) { el.hidden = !(on && el.getAttribute('data-date') === date && el.getAttribute('data-slot') === slot); });
    // A Swertres or EZ2 result still on its way must not be offered by "Check this draw" with an older draw.
    [].forEach.call(document.querySelectorAll('[data-hero-game]'), function (el) {
      if (on && !(el.getAttribute('data-date') === date && el.getAttribute('data-slot') === slot)) el.setAttribute('data-hero-skip', ''); else el.removeAttribute('data-hero-skip');
    });
    [].forEach.call(document.querySelectorAll('.hboard .brow'), function (el) { el.hidden = !!(on && el.getAttribute('data-date') === date && el.getAttribute('data-slot') === slot); });
    var h = document.querySelector('[data-home-h]'); if (h) setText(h, on ? 'Other games' : 'Latest results');
    var btn = document.querySelector('[data-home-check]');
    if (btn) {
      btn.classList.toggle('is-just', on); setText(btn, on ? 'Check this draw' : 'Check my ticket');
      var cta = btn.parentNode, bar = document.querySelector('.drawbar');
      if (bar && cta.parentNode === bar.parentNode && (on !== (cta.nextElementSibling === bar))) cta.parentNode.insertBefore(on ? cta : bar, on ? bar : cta);
    }
  }
  /* /yesterday/ carries two days, because the site is not rebuilt at midnight: show the one that is yesterday in Manila now. */
  function renderYesterday(now) {
    var secs = [].slice.call(document.querySelectorAll('[data-yday]')); if (!secs.length) return;
    var y = iso(addDays(mnl(now), -1)), hit = secs.filter(function (s) { return s.getAttribute('data-yday') === y; })[0];
    var stale = document.querySelector('[data-yday-stale]'); if (stale) stale.hidden = !!hit;
    if (!hit) return;
    secs.forEach(function (s) { s.hidden = s !== hit; });
    var t = hit.getAttribute('data-title'); if (t) document.title = t;
    var hd = document.querySelector('[data-yday-date]'), sh = hit.getAttribute('data-short'); if (hd && sh) hd.textContent = sh;
  }
  /* ---------- home "today" grid: Swertres and EZ2, one cell per draw time ---------- */
  var dayNums = {}, dayRoll = {}; // dayNums[slug][date][slot] = numbers (built + live); dayRoll marks draws that should roll in
  function seedDayNums() {
    var box = document.querySelector('[data-hday]'); if (!box) return;
    var j = {}; try { j = JSON.parse(box.getAttribute('data-hday') || '{}'); } catch (e) {}
    Object.keys(j).forEach(function (slug) {
      var m = dayNums[slug] || (dayNums[slug] = {});
      Object.keys(j[slug]).forEach(function (date) {
        var day = m[date] || (m[date] = {});
        Object.keys(j[slug][date]).forEach(function (slot) { if (!day[slot]) day[slot] = j[slug][date][slot]; });
      });
    });
  }
  function hasDay(slugs, date) { return slugs.some(function (s) { return dayNums[s] && dayNums[s][date] && Object.keys(dayNums[s][date]).length; }); }
  function renderHeroDay(now) {
    var box = document.querySelector('[data-hday]'); if (!box) return;
    var rows = [].slice.call(box.querySelectorAll('[data-hd-game]')), slugs = rows.map(function (r) { return r.getAttribute('data-hd-game'); });
    var d = mnl(now), today = iso(d), day = today;
    // Before the first draw (or on a no-draw day) the newest finished day is what readers want: last night's results.
    if (!hasDay(slugs, today) && (now < startMs(today, '2PM') || noDrawOn(d))) {
      var dates = []; slugs.forEach(function (s) { Object.keys(dayNums[s] || {}).forEach(function (k) { if (k < today) dates.push(k); }); });
      day = dates.sort().reverse()[0] || today;
    }
    box.setAttribute('data-day', day);
    var firstNext = null;
    if (day === today) ['2PM', '5PM', '9PM'].some(function (s) { if (startMs(today, s) > now) { firstNext = s; return true; } return false; });
    rows.forEach(function (row) {
      var slug = row.getAttribute('data-hd-game'), g = BY[slug]; if (!g) return;
      var m = (dayNums[slug] || {})[day] || {}, newest = null;
      ['2PM', '5PM', '9PM'].forEach(function (slot) { if (m[slot]) newest = slot; });
      ['2PM', '5PM', '9PM'].forEach(function (slot) {
        var cell = row.querySelector('.hd-cell[data-slot="' + slot + '"]'); if (!cell) return;
        var nums = m[slot], kind, line = '', strong = '';
        if (nums) kind = 'done';
        else if (day !== today) { kind = 'none'; line = 'No result'; }
        else {
          var at = startMs(today, slot), end = at + WINDOW_MIN[slot] * 60e3;
          if (now < at) { kind = 'next'; if (slot === firstNext) { line = 'Draw in'; strong = fmtCountdown(at - now); } else line = 'Later today'; }
          else if (now < end) { kind = 'live'; line = 'Drawing now'; }
          else { kind = 'wait'; line = 'Waiting for PCSO'; }
        }
        var sig = day + '|' + kind + '|' + (nums ? nums.join('-') : line + strong);
        if (cell.__sig !== sig) {
          cell.__sig = sig;
          cell.textContent = '';
          var t = document.createElement('span'); t.className = 'hd-t'; t.textContent = slot; cell.appendChild(t);
          if (nums) {
            var k = slug + '|' + day + '|' + slot;
            cell.appendChild(ballsEl(g, nums, !!dayRoll[k], 'sm')); delete dayRoll[k];
            cell.querySelector('.balls').setAttribute('aria-label', g.name + ' ' + slot + ' winning numbers');
          } else {
            var st = document.createElement('span'); st.className = 'hd-st'; st.textContent = line;
            if (strong) { var b = document.createElement('b'); b.textContent = strong; st.appendChild(b); }
            cell.appendChild(st);
          }
        }
        ['is-done', 'is-live', 'is-wait', 'is-next'].forEach(function (c) { cell.classList.toggle(c, c === 'is-' + kind); });
        var isNew = !!nums && slot === newest;
        cell.classList.toggle('is-new', isNew);
        // "Check this draw" (check-sheet.js) reads the newest drawn cell of each game.
        if (isNew) { cell.setAttribute('data-hero-game', slug); cell.setAttribute('data-date', day); }
        else { cell.removeAttribute('data-hero-game'); cell.removeAttribute('data-date'); }
      });
    });
  }
  /* The home label is built at deploy time; say what the newest draw is relative to right now. */
  function renderHomeClock(now) {
    var lb = document.querySelector('[data-hb-label]'); if (!lb) return;
    var date = lb.getAttribute('data-date'), slot = lb.getAttribute('data-slot'); if (!date || !slot) return;
    var d = mnl(now), today = iso(d), yest = iso(addDays(d, -1)), full = fmtDateRow(date) + ', ' + SLOT_LABEL[slot], text;
    var just = !noDrawOn(d) && date === today && now - startMs(date, slot) < 2 * 3600e3;
    if (noDrawOn(d)) text = 'Last draw · ' + full;
    else if (date === today) text = just ? 'Just drawn · ' + fmtDateRow(date) + ' · ' + SLOT_LABEL[slot] : 'Resulta ngayon · ' + SLOT_LABEL[slot];
    else if (date === yest && slot === '9PM') text = 'Resulta kagabi · ' + fmtDateRow(date);
    else text = 'Latest draw · ' + full;
    setText(lb, text);
    setHomeJust(just, date, slot);
  }

  /* ---------- tick loop ---------- */
  var timer = null;
  function tick() {
    clearTimeout(timer);
    if (document.hidden) return;
    var now = Date.now();
    statusEls.forEach(function (el) { renderStatus(el, now); });
    renderTimeline(now);
    renderHeroDay(now);
    renderHomeClock(now);
    renderDrawNotes(now);
    renderYesterday(now);
    if (!statusEls.length && !timeline) return;
    var fast = statusEls.some(function (el) { var c = el.querySelector('.st-cd'); return c && /^\d+:\d\d$/.test(c.textContent); });
    timer = setTimeout(tick, fast ? 1000 - (now % 1000) + 5 : 20000);
  }

  /* ---------- polling /live/current.json ---------- */
  var pollTimer = null, failures = 0, inFlight = false, reqId = 0, pollingStarted = false;
  function nearDraw(now) {
    return GAMES.some(function (g) { var s = gameState(g, now); return s && (s.kind === 'live' || s.kind === 'wait' || (s.kind === 'next' && s.at - now < 15 * 60e3)); });
  }
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (document.hidden) return;
    var base = nearDraw(Date.now()) ? 60e3 : 300e3;
    pollTimer = setTimeout(poll, base * Math.min(4, 1 + failures));
  }
  function poll() {
    if (document.hidden || inFlight) return;
    inFlight = true;
    var id = ++reqId, ctrl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    fetch('/anolabas/live/current.json', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (id !== reqId) return; failures = 0; if (j && Array.isArray(j.draws)) ingest(j); })
      .catch(function () { failures++; })
      .then(function () { clearTimeout(to); inFlight = false; schedulePoll(); });
  }

  function sigOf(d) { return [d.numbers.map(Number).join('-'), d.status, d.jackpot, d.winners].join('|'); }
  var applied = {}; // draws newer than the built pages: a client-side navigation brings back built HTML, so bind() replays them
  var replaying = false; // a replay restores what the reader already saw, so it must not roll or count as new
  function replayApplied() {
    replaying = true;
    Object.keys(applied).map(function (k) { return applied[k]; })
      .sort(function (a, b) { return a.date === b.date ? ORDER[a.slot] - ORDER[b.slot] : (a.date < b.date ? -1 : 1); })
      .forEach(applyDraw);
    replaying = false;
    toFlash = [];
  }
  function ingest(j) {
    var changed = [], fresh = [];
    j.draws.forEach(function (d) {
      if (!d || !BY[d.game] || !Array.isArray(d.numbers) || !ORDER[d.slot] || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return;
      d.numbers = d.numbers.map(String);
      if (daily(BY[d.game])) d.winners = null; // not national figures; see src/data/data-quality.json
      var k = d.game + '|' + d.date + '|' + d.slot, sig = sigOf(d);
      var wasReceived = isReceived(d.game, d.date, d.slot), prevSig = sigs[k];
      sigs[k] = sig;
      received[k] = true;
      if (d.status === 'official') official[k] = true;
      if (!latestDate[d.game] || d.date > latestDate[d.game]) latestDate[d.game] = d.date;
      if (!wasReceived) fresh.push(d);
      else if (prevSig && prevSig !== sig) changed.push(d);
    });
    var all = fresh.concat(changed);
    if (all.length) {
      all.sort(function (a, b) { return a.date === b.date ? ORDER[a.slot] - ORDER[b.slot] : (a.date < b.date ? -1 : 1); });
      all.forEach(function (d) { applied[d.game + '|' + d.date + '|' + d.slot] = d; applyDraw(d); });
      flushFlashes();
    }
    if (fresh.length) {
      var d0 = fresh.slice().sort(function (a, b) { return a.date === b.date ? ORDER[b.slot] - ORDER[a.slot] : (a.date < b.date ? 1 : -1); })[0], g0 = BY[d0.game];
      newMsg = { slug: d0.game, slot: d0.slot, text: 'May bagong resulta! ' + g0.short + (g0.slots.length > 1 ? ' ' + d0.slot : '') + ': ' + d0.numbers.join('-') + (j.updated_at_pht ? ' · As of ' + time12(String(j.updated_at_pht).slice(11, 16)) : '') + (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ' more)' : '') };
      newUntil = Date.now() + 90e3;
      showToast(g0, d0, fresh.length);
    }
    tick();
  }

  /* ---------- DOM updates ---------- */
  var toFlash = [];
  function flushFlashes() {
    if (reduce() || !toFlash.length) { toFlash = []; return; }
    toFlash.forEach(function (el) { el.classList.remove('flash'); });
    void document.body.offsetWidth;
    toFlash.forEach(function (el) { el.classList.add('flash'); });
    toFlash = [];
  }
  /* Balls roll in only the first time a reader sees a draw. No storage means no record, so nothing rolls. */
  var SEEN_KEY = 'lph_seen_draws', SEEN_MAX = 200;
  function seenList() { try { var v = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return null; } }
  function seenSave(list) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-SEEN_MAX))); } catch (e) {} }
  function rollFirstSeen() {
    var els = document.querySelectorAll('.balls[data-roll]'), seen = els.length ? seenList() : null, added = false;
    if (!seen) return;
    [].forEach.call(els, function (el) {
      var k = el.getAttribute('data-roll');
      if (seen.indexOf(k) >= 0) return;
      seen.push(k); added = true;
      if (!reduce()) el.classList.add('roll');
    });
    if (added) seenSave(seen);
  }
  function markSeen(d) {
    var k = d.game + '|' + d.date + '|' + d.slot, seen = seenList();
    if (seen && seen.indexOf(k) < 0) { seen.push(k); seenSave(seen); }
  }
  function ballsEl(g, nums, roll, size) {
    var wrap = document.createElement('div');
    wrap.className = 'balls' + (size ? ' ' + size : '') + (roll && !reduce() && !replaying ? ' roll' : '');
    wrap.setAttribute('role', 'list');
    wrap.setAttribute('aria-label', g.name + ' winning numbers');
    nums.forEach(function (n) {
      var b = document.createElement('span');
      b.className = 'ball' + (g.ball === 'square' ? ' square' : '');
      b.setAttribute('role', 'listitem');
      b.style.background = g.color;
      b.textContent = String(n);
      wrap.appendChild(b);
    });
    return wrap;
  }
  function applyDraw(d) {
    var g = BY[d.game];
    if (!replaying) markSeen(d);
    var dot = document.querySelector('[data-strip="' + d.game + '"] .newdot'); if (dot) dot.hidden = false;
    var bn = document.querySelector('[data-bn="today"]'); if (bn) bn.classList.add('has-new');
    var card = document.querySelector('[data-card="' + d.game + '"]');
    updateHero(g, d); updateJackpots(g, d);
    if (card && card.classList.contains('brow')) updateBoardRow(card, g, d);
    else if (card) updateHomeCard(card, g, d);
    var slotPage = document.querySelector('[data-slot-page]');
    if (slotPage) { // a draw-time page moves only for its own game and draw time
      if (slotPage.getAttribute('data-game') === d.game && slotPage.getAttribute('data-slot-page') === d.slot) { updateHub(g, d); updateSlotRows(g, d); }
    } else if (document.querySelector('[data-status="' + d.game + '"]')) updateHub(g, d);
    updateTicker(g, d);
  }
  function setBadge(badge, statuses) {
    if (!badge) return;
    var ok = statuses.length > 0 && statuses.every(function (s) { return s === 'official'; });
    setText(badge, ok ? 'Verified' : 'Provisional');
    badge.className = 'badge ' + (ok ? 'ok' : 'pending');
  }
  /* board row (home) */
  function updateBoardRow(row, g, d) {
    var shown = row.getAttribute('data-date') || '';
    if (d.date < shown) return;
    var f = function (k) { return row.querySelector('[data-f="' + k + '"]'); };
    var ballsWrap = f('balls');
    if (daily(g)) {
      var slots = f('slots'); if (!slots) return;
      if (d.date > shown) slots.textContent = '';
      var box = document.createElement('div'); box.className = 'bslot'; box.setAttribute('data-slot', d.slot); box.setAttribute('data-st', d.status || 'official');
      var t = document.createElement('span'); t.className = 'bslot-t'; t.textContent = SLOT_LABEL[d.slot];
      box.appendChild(t); box.appendChild(ballsEl(g, d.numbers, true, 'sm'));
      var existing = slots.querySelector('.bslot[data-slot="' + d.slot + '"]');
      if (existing) slots.replaceChild(box, existing);
      else {
        var before = null;
        [].some.call(slots.querySelectorAll('.bslot'), function (b) { if (ORDER[b.getAttribute('data-slot')] > ORDER[d.slot]) { before = b; return true; } return false; });
        slots.insertBefore(box, before);
      }
      var all = [].slice.call(slots.querySelectorAll('.bslot'));
      var newest = all.slice().sort(function (a, b) { return ORDER[b.getAttribute('data-slot')] - ORDER[a.getAttribute('data-slot')]; })[0];
      if (newest && newest === box) { // header shows the latest draw time
        var old = ballsWrap && ballsWrap.querySelector('.balls'); if (old) old.parentNode.replaceChild(ballsEl(g, d.numbers, true), old);
        setText(f('topslot'), SLOT_LABEL[d.slot]);
        row.setAttribute('data-slot', d.slot); row.setAttribute('data-st', d.status || 'official');
      }
      setText(f('draws'), all.length + ' draw' + (all.length === 1 ? '' : 's'));
    } else {
      var oldB = ballsWrap && ballsWrap.querySelector('.balls'); if (oldB) oldB.parentNode.replaceChild(ballsEl(g, d.numbers, true), oldB);
      setText(f('jackpot'), fmtPeso(d.jackpot)); setText(f('kv-jackpot'), fmtPeso(d.jackpot));
      setText(f('winners-text'), d.winners == null ? 'winners pending' : d.winners === 0 ? 'No ' + prizeLow(g) + ' winner' : winnersText(d.winners, prizeLow(g) + ' winner'));
      setText(f('kv-winners'), d.winners == null ? '—' : String(d.winners));
      setText(f('kv-drawn'), fmtDateRow(d.date) + ' · ' + SLOT_LABEL[d.slot]);
      setText(f('kv-status'), d.status === 'official' ? 'Verified vs PCSO' : 'Provisional');
      row.setAttribute('data-slot', d.slot); row.setAttribute('data-st', d.status || 'official');
    }
    row.setAttribute('data-date', d.date);
    var dateA = f('date'); if (dateA) { setText(dateA, 'Draw page: ' + fmtDateShort(d.date) + ' ›'); dateA.setAttribute('href', '/anolabas/' + g.path + '/' + d.date + '/'); }
    var sub = f('sub'); if (sub) setText(sub, fmtDateRow(d.date) + ' · ' + (daily(g) ? ((row.querySelectorAll('.bslot').length) + ' of ' + g.slots.length + ' draws') : SLOT_LABEL[d.slot]));
    toFlash.push(row);
  }
  /* legacy card (kept for pages that still render GameResultCard) */
  function updateHomeCard(card, g, d) {
    var dateA = card.querySelector('[data-f="date"]');
    if (daily(g)) {
      var tbody = card.querySelector('tbody'); if (!tbody) return;
      var rows = tbody.querySelectorAll('tr[data-date]'), shownDate = rows.length ? rows[0].getAttribute('data-date') : '';
      if (d.date < shownDate) return;
      if (d.date > shownDate) tbody.textContent = '';
      var tr = document.createElement('tr');
      tr.setAttribute('data-game', d.game); tr.setAttribute('data-date', d.date); tr.setAttribute('data-slot', d.slot); tr.setAttribute('data-st', d.status || 'official');
      var th = document.createElement('th'); th.setAttribute('scope', 'row'); th.textContent = SLOT_LABEL[d.slot];
      var td = document.createElement('td'); td.appendChild(ballsEl(g, d.numbers, true, 'sm'));
      tr.appendChild(th); tr.appendChild(td);
      if (!daily(g)) { var tw = document.createElement('td'); tw.className = 'num muted small'; tw.textContent = winnersText(d.winners); tr.appendChild(tw); }
      var existing = tbody.querySelector('tr[data-slot="' + d.slot + '"]');
      if (existing) tbody.replaceChild(tr, existing);
      else {
        var before = null;
        [].some.call(tbody.querySelectorAll('tr'), function (r) { if (ORDER[r.getAttribute('data-slot')] < ORDER[d.slot]) { before = r; return true; } return false; });
        tbody.insertBefore(tr, before);
      }
      setBadge(card.querySelector('[data-f="badge"]'), [].map.call(tbody.querySelectorAll('tr[data-st]'), function (r) { return r.getAttribute('data-st'); }));
    } else {
      var shown = card.getAttribute('data-date') || '';
      if (d.date < shown) return;
      var old = card.querySelector('.gcard-body .balls');
      if (old) old.parentNode.replaceChild(ballsEl(g, d.numbers, true), old);
      var jp = card.querySelector('[data-f="jackpot"]'); if (jp) setText(jp, fmtPeso(d.jackpot));
      var wn = card.querySelector('[data-f="winners"]'); if (wn) setText(wn, d.winners == null ? '—' : String(d.winners));
      card.setAttribute('data-date', d.date); card.setAttribute('data-slot', d.slot); card.setAttribute('data-st', d.status || 'official');
      setBadge(card.querySelector('[data-f="badge"]'), [d.status || 'official']);
    }
    if (dateA) { setText(dateA, fmtDateShort(d.date)); dateA.setAttribute('href', '/anolabas/' + g.path + '/' + d.date + '/'); }
    toFlash.push(card);
  }
  /* home: the hero shows the newest Swertres and EZ2 draw; six-number draws of that evening are named under it */
  function slotKey(date, slot) { return date + '|' + ORDER[slot]; }
  function updateHero(g, d) {
    var box = document.querySelector('[data-hero]'); if (!box) return;
    var lb = document.querySelector('[data-hb-label]'), also = document.querySelector('[data-hb-also]');
    if (daily(g)) {
      var m = dayNums[d.game] || (dayNums[d.game] = {}), day = m[d.date] || (m[d.date] = {});
      var nums = d.numbers.map(function (n) { return padN(g, n); });
      if (!day[d.slot] || day[d.slot].join('-') !== nums.join('-')) { day[d.slot] = nums; if (!replaying) dayRoll[d.game + '|' + d.date + '|' + d.slot] = true; }
      renderHeroDay(Date.now());
      if (lb && slotKey(d.date, d.slot) > slotKey(lb.getAttribute('data-date'), lb.getAttribute('data-slot'))) {
        lb.setAttribute('data-date', d.date); lb.setAttribute('data-slot', d.slot);
        if (also && also.getAttribute('data-date') < d.date) { also.hidden = true; also.textContent = ''; }
      }
      return;
    }
    if (!also || !lb || d.date < lb.getAttribute('data-date')) return;
    heroExtra(box, g, d);
    if (also.hidden || !also.textContent) { also.textContent = 'Also drawn at 9PM: '; also.hidden = false; }
    also.setAttribute('data-date', d.date);
    if ([].some.call(also.querySelectorAll('a'), function (a) { return a.textContent === g.short; })) return;
    if (also.querySelector('a')) also.appendChild(document.createTextNode(', '));
    var a = document.createElement('a'); a.href = '/anolabas/' + g.path + '/'; a.textContent = g.short; also.appendChild(a);
  }
  /* a six-number, 4D or 6D draw that arrives live joins the hero the same way a built one does */
  function heroExtra(box, g, d) {
    var el = box.querySelector('[data-hero-extra="' + d.game + '"]');
    if (!el) {
      el = document.createElement('div'); el.className = 'hb-game hb-extra'; el.setAttribute('data-hero-extra', d.game); el.hidden = true;
      var name = document.createElement('div'); name.className = 'hb-name';
      var a = document.createElement('a'); a.href = '/anolabas/' + g.path + '/'; a.textContent = g.short;
      var slot = document.createElement('span'); slot.setAttribute('data-f', 'slot');
      name.appendChild(a); name.appendChild(slot); el.appendChild(name); el.appendChild(ballsEl(g, [], false, 'sm')); box.appendChild(el);
    }
    setText(el.querySelector('[data-f="slot"]'), SLOT_LABEL[d.slot]);
    el.replaceChild(ballsEl(g, d.numbers.map(function (n) { return padN(g, n); }), true, 'sm'), el.querySelector('.balls'));
    el.setAttribute('data-date', d.date); el.setAttribute('data-slot', d.slot);
    renderHomeClock(Date.now());
  }
  /* home: the jackpot list and the "biggest jackpot" head, recomputed from the list */
  function updateJackpots(g, d) {
    var li = document.querySelector('[data-jpx-row="' + d.game + '"]'); if (!li || d.jackpot == null || d.date < (li.getAttribute('data-date') || '')) return;
    li.setAttribute('data-date', d.date); li.setAttribute('data-jackpot', d.jackpot); li.setAttribute('data-winners', d.winners == null ? '' : d.winners);
    var now = Date.now(), nx = nextSlot(g, now);
    setText(li.querySelector('[data-f="amt"]'), fmtPeso(Math.floor(d.jackpot)));
    setText(li.querySelector('.jpx-v small'), d.winners == null ? 'as of ' + mdShort(d.date) : winnersText(d.winners) + ' · ' + mdShort(d.date));
    if (nx) setText(li.querySelector('a small'), (g.days === 'daily' ? 'Daily' : g.days.join(', ')) + ' · next ' + mdShort(nx.date) + ', ' + SLOT_LABEL[nx.slot]);
    var rows = [].slice.call(document.querySelectorAll('[data-jpx-row]')).sort(function (a, b) { return (+b.getAttribute('data-jackpot') || 0) - (+a.getAttribute('data-jackpot') || 0); });
    var top = rows[0], tg = top && BY[top.getAttribute('data-jpx-row')]; if (!tg) return;
    var tw = top.getAttribute('data-winners'), td = top.getAttribute('data-date'), tn = nextSlot(tg, now);
    setText(document.querySelector('.jpx-k'), 'Biggest jackpot now · ' + tg.name);
    setText(document.querySelector('.jpx-amt'), fmtPeso(+top.getAttribute('data-jackpot')));
    setText(document.querySelector('.jpx-s'), (tw && +tw > 0 ? winnersText(+tw, 'jackpot winner') + ' on ' + mdShort(td) : 'No jackpot winner on ' + mdShort(td)) + (tn ? ' · Next draw ' + fmtDateRow(tn.date) + ', ' + SLOT_LABEL[tn.slot] : ''));
  }
  /* game page: every place that repeats the latest draw moves together, so a new date never sits beside old numbers */
  function updateHubText(g, d, oldDate) {
    var cards = [].slice.call(document.querySelectorAll('article.card[data-game="' + d.game + '"]'));
    var nums = function (c) { return [].map.call(c.querySelectorAll('.ball'), function (b) { return b.textContent; }).join('-'); };
    var hd = document.querySelector('[data-hub="date"]'); if (hd) setText(hd, fmtDateLong(d.date));
    var hl = document.querySelector('[data-hub="day"]'); if (hl) hl.setAttribute('href', '/anolabas/' + g.path + '/' + d.date + '/');
    var hn = document.querySelector('[data-hub="numbers"]'); if (hn) setText(hn, d.numbers.map(function (n) { return padN(g, n); }).join('-'));
    var hj = document.querySelector('[data-hub="jackpot"]'); if (hj) setText(hj, fmtPeso(d.jackpot));
    var hw = document.querySelector('[data-hub="winners"]'); if (hw) setText(hw, d.winners == null ? '' : d.winners === 0 ? ', no ' + prizeLow(g) + ' winner' : ', ' + winnersText(d.winners, prizeLow(g) + ' winner'));
    var hs = document.querySelector('[data-hub="slots"]');
    if (hs) {
      hs.textContent = '';
      cards.forEach(function (c, i) {
        hs.appendChild(document.createTextNode((i ? ', ' : '') + SLOT_LABEL[c.getAttribute('data-slot')] + ' '));
        var st = document.createElement('strong'); st.className = 'tabnum'; st.textContent = nums(c); hs.appendChild(st);
      });
    }
    var v = document.querySelector('[data-hub="verdict"]');
    if (v) {
      var nx = nextSlot(g, Date.now()), b = v.querySelector('b'), sp = v.querySelector('span');
      var nextText = nx ? 'Next draw ' + mdShort(nx.date) + ', ' + SLOT_LABEL[nx.slot] + '.' : '';
      if (daily(g)) {
        v.hidden = false;
      } else {
        v.hidden = d.winners == null;
        if (d.winners != null) { setText(b, d.winners ? prizeCap(g) + ' won' : 'No ' + prizeLow(g) + ' winner'); b.className = d.winners ? 'won' : ''; }
      }
      if (sp) setText(sp, sp.textContent.replace(/Next draw .*$/, nextText));
    }
    if (oldDate && d.date > oldDate) {
      var bar = document.querySelector('[data-datebar]');
      if (bar) {
        setText(bar.querySelector('.db-d b'), fmtDateShort(d.date));
        var prev = bar.querySelector('a[data-dir="prev"]');
        if (prev) { prev.setAttribute('href', '/anolabas/' + g.path + '/' + oldDate + '/'); prev.setAttribute('aria-label', 'Previous draw: ' + fmtDateRow(oldDate)); }
      }
    }
  }
  function checkedAt(ts, drawDate) {
    if (!ts || ts.indexOf('T') < 0) return '';
    var t = new Date(ts); if (isNaN(t.getTime())) return '';
    var m = new Date(t.getTime() + 8 * 3600e3), h = m.getUTCHours(), day = m.toISOString().slice(0, 10);
    return (day === drawDate ? '' : mdShort(day) + ', ') + (h % 12 || 12) + ':' + pad(m.getUTCMinutes()) + (h >= 12 ? ' PM' : ' AM') + ' PHT';
  }
  /* the line under a result card: same order and same omissions as DrawCard.astro */
  function drawStat(g, d) {
    var p = document.createElement('p'); p.className = 'drawstat';
    var st = document.createElement('b'); st.textContent = d.status === 'official' ? 'Published' : 'Provisional'; p.appendChild(st);
    var at = d.status === 'official' ? checkedAt(d.source_updated_at, d.date) : '';
    if (at) p.appendChild(document.createTextNode(' · Checked ' + at));
    if (d.jackpot != null) {
      p.appendChild(document.createTextNode(' · ' + (daily(g) ? 'Prize' : prizeCap(g)) + ' '));
      var v = document.createElement('span'); v.className = 'tabnum'; v.setAttribute('data-f', 'card-prize'); v.textContent = fmtPeso(d.jackpot); p.appendChild(v);
    }
    if (!daily(g) && d.winners != null) {
      p.appendChild(document.createTextNode(' · '));
      var w = document.createElement('span'); w.className = 'tabnum'; w.setAttribute('data-f', 'card-winners'); w.textContent = Number(d.winners).toLocaleString(); p.appendChild(w);
      p.appendChild(document.createTextNode(' winner' + (d.winners === 1 ? '' : 's')));
    }
    return p;
  }
  function updateHub(g, d) {
    var cards = document.querySelectorAll('article.card[data-game="' + d.game + '"]');
    if (!cards.length) return;
    var first = cards[0], shownDate = first.getAttribute('data-date');
    if (d.date < shownDate) return;
    var art = document.createElement('article');
    art.className = 'card'; art.setAttribute('data-game', d.game); art.setAttribute('data-date', d.date); art.setAttribute('data-slot', d.slot);
    art.setAttribute('data-st', d.status || 'official');
    var head = document.createElement('div'); head.className = 'card-head';
    var l = document.createElement('span'); l.textContent = fmtDateRow(d.date) + ' · ' + SLOT_LABEL[d.slot];
    head.appendChild(l);
    var sh = document.createElement('button'); sh.type = 'button'; sh.className = 'sharebtn'; sh.setAttribute('data-share', ''); sh.setAttribute('aria-label', 'Share ' + g.name + ' ' + d.slot + ' result'); sh.textContent = 'Share';
    head.appendChild(sh);
    var newBalls = ballsEl(g, d.numbers.map(function (n) { return padN(g, n); }), true, 'lg');
    art.appendChild(head); art.appendChild(newBalls); art.appendChild(drawStat(g, d));
    var parent = first.parentNode;
    if (d.date > shownDate) {
      var oldBalls = first.querySelector('.balls'), scope = oldBalls && oldBalls.getAttribute('data-astro-transition-scope');
      if (scope) newBalls.setAttribute('data-astro-transition-scope', scope); // keeps the shared-element flight to this page
      [].forEach.call(cards, function (c, i) { if (i > 0) c.parentNode.removeChild(c); });
      parent.replaceChild(art, first);
    } else {
      var same = [].filter.call(cards, function (c) { return c.getAttribute('data-slot') === d.slot; })[0];
      if (same) parent.replaceChild(art, same);
      else {
        var before = [].filter.call(cards, function (c) { return ORDER[c.getAttribute('data-slot')] < ORDER[d.slot]; })[0];
        if (before) parent.insertBefore(art, before);
        else parent.insertBefore(art, cards[cards.length - 1].nextSibling);
      }
    }
    updateHubText(g, d, shownDate);
    toFlash.push(art);
  }
  /* draw-time page: the newest draw joins the top of its table */
  function updateSlotRows(g, d) {
    var tb = document.querySelector('[data-slot-rows]'); if (!tb) return;
    var href = '/anolabas/' + g.path + '/' + d.date + '/', firstRow = tb.querySelector('tr'), firstA = firstRow && firstRow.querySelector('a');
    if (firstA && firstA.getAttribute('href') > href) return;
    var tr = document.createElement('tr'), td1 = document.createElement('td'), td2 = document.createElement('td'), td3 = document.createElement('td'), a = document.createElement('a');
    a.href = href; a.textContent = fmtDateRow(d.date); td1.appendChild(a);
    td2.className = 'balls-cell'; td2.appendChild(ballsEl(g, d.numbers.map(function (n) { return padN(g, n); }), false, 'sm'));
    td3.className = 'num'; td3.setAttribute('data-label', 'Winners'); td3.textContent = d.winners == null ? '—' : String(d.winners);
    tr.appendChild(td1); tr.appendChild(td2); if (!daily(g)) tr.appendChild(td3);
    if (firstA && firstA.getAttribute('href') === href) { tb.replaceChild(tr, firstRow); return; }
    tb.insertBefore(tr, firstRow);
    if (tb.children.length > 30) tb.removeChild(tb.lastElementChild);
  }
  function updateTicker(g, d) {
    [].forEach.call(document.querySelectorAll('[data-tk="' + d.game + '|' + d.slot + '"] b'), function (b) { setText(b, d.numbers.join('-')); });
  }

  /* ---------- "Just drawn" toast ---------- */
  var toastEl = null, toastTimer = null, toastTarget = null;
  function showToast(g, d, count) {
    if (!toastEl) {
      toastEl = document.createElement('button'); toastEl.type = 'button'; toastEl.className = 'lph-toast'; toastEl.setAttribute('aria-live', 'polite');
      var txt = document.createElement('span'); txt.className = 'lph-toast-txt';
      var tt = document.createElement('span'); tt.className = 'tt'; var tb = document.createElement('span'); tb.className = 'tb';
      txt.appendChild(tt); txt.appendChild(tb);
      var bw = document.createElement('span'); bw.className = 'lph-toast-balls';
      toastEl.appendChild(txt); toastEl.appendChild(bw);
      toastEl.addEventListener('click', function () {
        if (window.anoTrack && toastTarget) window.anoTrack('live_update_click', { game: toastTarget.path, draw_slot: toastTarget.slot });
        hideToast(); jumpTo(toastTarget);
      });
      document.body.appendChild(toastEl);
    }
    toastTarget = { slug: g.slug, path: g.path, slot: String(d.slot || '').toLowerCase() };
    // GA4 (growth/29 §4): Q4, does anyone wait for the draw and tap through?
    if (window.anoTrack) window.anoTrack('live_update_shown', { game: g.path, draw_slot: toastTarget.slot });
    setText(toastEl.querySelector('.tt'), 'Just drawn · ' + g.short + (g.slots.length > 1 ? ' ' + SLOT_LABEL[d.slot] : '') + (count > 1 ? ' +' + (count - 1) : ''));
    setText(toastEl.querySelector('.tb'), 'Tap to see the result');
    var bw2 = toastEl.querySelector('.lph-toast-balls'); bw2.textContent = ''; bw2.appendChild(ballsEl(g, d.numbers, false, 'sm'));
    clearTimeout(toastTimer);
    void toastEl.offsetWidth; toastEl.classList.add('on');
    toastTimer = setTimeout(hideToast, 8000);
  }
  function hideToast() { if (toastEl) toastEl.classList.remove('on'); clearTimeout(toastTimer); }
  function jumpTo(t) {
    if (!t) return;
    var row = document.querySelector('.brow[data-card="' + t.slug + '"]');
    if (row) {
      setOpen(row, true);
      row.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' });
      row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
    } else if (window.lphNavigate) window.lphNavigate('/anolabas/' + t.path + '/');
    else location.href = '/anolabas/' + t.path + '/';
  }

  /* ---------- board rows: expand in place ---------- */
  function setOpen(row, open) {
    row.classList.toggle('open', open);
    var btn = row.querySelector('.brow-btn'); if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('a, [data-share]')) return;      // links and the share button keep their own behaviour
    var head = e.target.closest('[data-brow-toggle]'); if (!head) return;
    var row = head.closest('.brow'); if (!row) return;
    setOpen(row, !row.classList.contains('open'));
  });

  /* ---------- directional page swaps: date ‹ ›, game tabs, swipe ---------- */
  var pendingDir = null, pendingSkel = false;
  function setDir(dir, skel) { pendingDir = dir; pendingSkel = !!skel; }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    if (a.closest('.datebar')) { setDir(a.getAttribute('data-dir'), true); return; }
    var strip = a.closest('.gamestrip-inner');
    if (strip) {
      var tabs = [].slice.call(strip.querySelectorAll('a')), cur = tabs.findIndex(function (t) { return t.classList.contains('on'); }), to = tabs.indexOf(a);
      if (cur >= 0 && to >= 0 && cur !== to) setDir(to > cur ? 'next' : 'prev', false);
    }
  });
  document.addEventListener('astro:before-preparation', function (e) {
    if (!pendingDir) return;
    document.documentElement.setAttribute('data-lph-dir', pendingDir);
    if (pendingSkel && !reduce()) {
      var block = document.querySelector('[data-drawblock]'); if (block) block.classList.add('skel');
      var orig = e.loader; var started = Date.now();
      e.loader = function () { return Promise.all([orig(), new Promise(function (r) { setTimeout(r, 260); })]).then(function (x) { return x[0]; }); };
    }
    pendingDir = null; pendingSkel = false;
  });
  document.addEventListener('astro:page-load', function () { setTimeout(function () { document.documentElement.removeAttribute('data-lph-dir'); }, 450); });
  // Swipe left / right on the content switches to the neighbouring game tab (same links as the strip).
  var sx = 0, sy = 0, swiping = false, lock = null;
  function swipeOK(t) { return !(t.closest && t.closest('.hc-board, .table-wrap, .ticker, .gamestrip, .sheet-root, input, textarea, select, button, [data-no-swipe], .balls.roll')); }
  document.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse' || !swipeOK(e.target)) { swiping = false; return; } sx = e.clientX; sy = e.clientY; swiping = true; lock = null; }, { passive: true });
  document.addEventListener('pointermove', function (e) { if (!swiping || lock) return; var dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) > 10 || Math.abs(dy) > 10) lock = Math.abs(dx) > Math.abs(dy) * 2 ? 'x' : 'y'; }, { passive: true });
  document.addEventListener('pointerup', function (e) {
    if (!swiping) return; swiping = false;
    var dx = e.clientX - sx; if (lock !== 'x' || Math.abs(dx) < 80 || Math.abs(e.clientY - sy) * 2 > Math.abs(dx)) return;
    var strip = document.querySelector('.gamestrip-inner'); if (!strip) return;
    var tabs = [].slice.call(strip.querySelectorAll('a')), cur = tabs.findIndex(function (t) { return t.classList.contains('on'); });
    if (cur < 0) return;
    var to = dx < 0 ? cur + 1 : cur - 1; if (to < 0 || to >= tabs.length) return;
    setDir(dx < 0 ? 'next' : 'prev', false);
    if (window.lphNavigate) window.lphNavigate(tabs[to].getAttribute('href')); else location.href = tabs[to].getAttribute('href');
  }, { passive: true });

  /* ---------- footer link groups (collapsed on phones) ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-footer-toggle]'); if (!b) return;
    var grp = b.closest('.footer-grp'); if (!grp) return;
    var open = !grp.classList.contains('open');
    grp.classList.toggle('open', open); b.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  /* ---------- nav state (header + bottom nav persist across client-side navigations) ---------- */
  function syncNav() {
    var nav = document.body.getAttribute('data-nav') || '', game = document.body.getAttribute('data-game') || '';
    var links = [].slice.call(document.querySelectorAll('.bottomnav a[data-bn]'));
    links.forEach(function (a, i) {
      var on = a.getAttribute('data-bn') === nav;
      if (on) { a.setAttribute('aria-current', 'page'); a.closest('.bottomnav').style.setProperty('--x', (i * 20) + '%'); } else a.removeAttribute('aria-current');
    });
    [].forEach.call(document.querySelectorAll('.mainnav a'), function (a) {
      var href = a.getAttribute('href'); var on = (nav && href === ({ today: '/anolabas/', history: '/anolabas/history/', simulator: '/anolabas/simulator/', check: '/anolabas/check/', guides: '/anolabas/guide/' })[nav]) || (href !== '/anolabas/' && location.pathname.indexOf(href) === 0 && href.length > 1 && !nav);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var strip = document.querySelector('.gamestrip-inner');
    if (strip) {
      var tabs = [].slice.call(strip.querySelectorAll('a')), active = null;
      tabs.forEach(function (a) {
        var on = game ? a.getAttribute('data-strip') && a.getAttribute('href') === '/anolabas/' + game + '/' : a.getAttribute('href') === '/anolabas/' && location.pathname === '/anolabas/';
        a.classList.toggle('on', !!on); if (on) active = a;
      });
      var ind = strip.querySelector('.gs-ind');
      if (!ind) { ind = document.createElement('span'); ind.className = 'gs-ind'; ind.setAttribute('aria-hidden', 'true'); strip.appendChild(ind); strip.classList.add('has-ind'); }
      if (active) {
        ind.style.left = active.offsetLeft + 10 + 'px'; ind.style.width = Math.max(0, active.offsetWidth - 20) + 'px'; ind.style.opacity = '1';
        // Horizontal only. scrollIntoView also moves the page, which pulled readers back up to this strip.
        var left = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
        if (strip.scrollTo) try { strip.scrollTo({ left: left, behavior: reduce() ? 'auto' : 'smooth' }); } catch (e) { strip.scrollLeft = left; }
      } else ind.style.opacity = '0';
    }
  }

  /* ---------- ticker, count-up (once per session), scroll reveal ---------- */
  function bindTicker() {
    var ticker = document.querySelector('[data-ticker]');
    if (!ticker || reduce()) return;
    var btn = ticker.querySelector('[data-ticker-toggle]');
    if (!btn || btn.__bound) return; btn.__bound = true;
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var p = ticker.classList.toggle('paused');
      btn.textContent = p ? 'Play' : 'Pause';
      btn.setAttribute('aria-pressed', p ? 'true' : 'false');
    });
  }
  function countUp(el) {
    var a = parseFloat(el.getAttribute('data-countup-from')), b = parseFloat(el.getAttribute('data-countup-to'));
    if (!(a > 0) || !(b > a) || reduce()) return;
    var key = 'lph-cu:' + b;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
    var final = el.textContent, t0 = 0;
    function step(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / 900), v = a + (b - a) * (1 - Math.pow(1 - k, 3));
      el.textContent = k < 1 ? fmtPeso(Math.round(v)) : final;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function bindReveal() {
    var cu = [].slice.call(document.querySelectorAll('[data-countup-from][data-countup-to]'));
    var rv = [].slice.call(document.querySelectorAll('[data-reveal]'));
    if ('IntersectionObserver' in window && !reduce()) {
      var vh = window.innerHeight || 800, ioAlive = false;
      var io = new IntersectionObserver(function (entries) {
        ioAlive = true;
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var el = e.target; io.unobserve(el);
          if (el.hasAttribute('data-countup-to')) { countUp(el); return; }
          el.classList.add('rv-in'); el.classList.remove('rv-pre');
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
      rv.forEach(function (el) { if (el.getBoundingClientRect().top > vh) { el.classList.add('rv-pre'); io.observe(el); } });
      cu.forEach(function (el) { io.observe(el); });
      setTimeout(function () { if (!ioAlive) [].forEach.call(document.querySelectorAll('.rv-pre'), function (el) { el.classList.remove('rv-pre'); }); }, 1500);
    } else {
      cu.forEach(countUp);
    }
  }

  /* ---------- bind to the current document (initial load + every client-side navigation) ---------- */
  function bind() {
    readCfg(); seedLatest(); seedDayNums();
    statusEls = [].slice.call(document.querySelectorAll('[data-status]'));
    timeline = document.querySelector('[data-timeline]');
    syncNav(); bindTicker(); bindReveal();
    replayApplied();
    tick();
    if (!pollingStarted) {
      pollingStarted = true;
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { clearTimeout(timer); clearTimeout(pollTimer); }
        else { tick(); poll(); }
      });
      poll();
    }
  }
  rollFirstSeen();
  document.addEventListener('astro:after-swap', rollFirstSeen);
  document.addEventListener('astro:page-load', bind);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { if (!window.__lphBoundOnce) bind(); });
  else if (!window.__lphBoundOnce) bind();
  document.addEventListener('astro:page-load', function () { window.__lphBoundOnce = true; }, { once: true });
  // Phones fire resize when the address bar slides away during a scroll; only a width change affects the strip.
  var navWidth = window.innerWidth;
  window.addEventListener('resize', function () { if (window.innerWidth === navWidth) return; navWidth = window.innerWidth; syncNav(); });
  // QA hook: window.__lph.ingest({ updated_at_pht, draws: [...] }) simulates a live.json update.
  window.__lph = { ingest: ingest, state: function (slug, ms) { return gameState(BY[slug], ms || Date.now()); }, toast: showToast };
})();
