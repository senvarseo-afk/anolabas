/* Ano Labas — sharing (style 1 "broadcast" cards + bottom-drawer share sheet, chosen 2026-11-04).
 * window.LPHCard  : shared 1080×1080 drawing helpers (navy broadcast background, gold-ringed balls, footer)
 * window.LPHShare : open({ blob | canvas, dataUrl?, text, url, filename, opener }) -> bottom drawer with
 *                   Share (system, when files are supported) · Save · Facebook · Messenger · Viber · Copy link
 * Result cards: [data-share] buttons inside .gcard / article.card render from what the card shows now.
 * Text via textContent only; no third-party scripts. Official PCSO game logos are NOT used (see games.json _meta).
 */
(function () {
  'use strict';
  var cfg = { games: [] };
  try { cfg = JSON.parse((document.getElementById('lph-schedule') || {}).textContent || '{}'); } catch (e) {}
  var BY = {}; (cfg.games || []).forEach(function (g) { BY[g.slug] = g; });
  var SITE = location.origin + '/anolabas';
  var HOST = SITE.replace(/^https?:\/\//, '');
  var S = 1080, GOLD = '#f5b400';
  var FONT = '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
  /* Brand (growth/28 §11, F2): three-shape mark + "Ano Labas" whose o is a gold ring sized to the x-height. */
  function brandMark(x, px, py, s) { var k = s / 64; x.save(); x.translate(px, py); x.scale(k, k); x.fillStyle = '#0f2a5f'; rr(x, 0, 0, 64, 64, 14); x.fill(); x.strokeStyle = '#f5b400'; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); x.moveTo(13, 26); x.lineTo(22, 26); x.moveTo(10, 34); x.lineTo(20, 34); x.stroke(); x.fillStyle = '#f5b400'; x.beginPath(); x.arc(39, 32, 15, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 3.5; x.beginPath(); x.arc(39, 32, 10.5, Math.PI * 1.15, Math.PI * 1.55); x.stroke(); x.restore(); }
  function brandWord(x, px, py, size, color) { x.save(); x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.font = '900 ' + size + 'px ' + FONT; x.fillStyle = color; var base = py + size * 0.36; x.fillText('An', px, base); var w = x.measureText('An').width, d = size * 0.58, cx = px + w + size * 0.02 + d / 2, cy = base - d / 2 + size * 0.01; x.strokeStyle = '#f5b400'; x.lineWidth = d * 0.26; x.beginPath(); x.arc(cx, cy, d / 2 - d * 0.13, 0, Math.PI * 2); x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = d * 0.08; x.lineCap = 'round'; x.beginPath(); x.arc(cx, cy, d / 2 - d * 0.13, Math.PI * 1.1, Math.PI * 1.45); x.stroke(); x.fillText('Labas', cx + d / 2 + size * 0.26, base); x.restore(); }
  var COND = '"Barlow Condensed", "Arial Narrow", ' + FONT; // display type, same as the site headings
  var MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

  /* ---------- drawing helpers (style 1: broadcast) ---------- */
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function fit(x, text, weight, max, maxW, fam) { var s = max; for (; s > 14; s -= 2) { x.font = weight + ' ' + s + 'px ' + (fam || FONT); if (x.measureText(text).width <= maxW) break; } return s; }
  var LPHCard = {
    S: S, FONT: FONT, COND: COND, MONO: MONO, fit: fit, roundRect: rr,
    background: function (x) {
      var g = x.createRadialGradient(S * 0.78, S * 0.16, 40, S * 0.6, S * 0.5, S * 0.95);
      g.addColorStop(0, '#2a4d93'); g.addColorStop(0.55, '#0f2a5f'); g.addColorStop(1, '#0a1d44');
      x.fillStyle = g; x.fillRect(0, 0, S, S);
    },
    /** brand row + optional VERIFIED pill + kicker / title / sub; returns the y where content can start */
    header: function (x, o) {
      x.textBaseline = 'middle'; x.textAlign = 'left';
      brandMark(x, 66, 66, 52); brandWord(x, 132, 94, 34, '#fff');
      if (o.pill) {
        x.font = '800 24px ' + FONT; var w = x.measureText(o.pill).width + 44;
        x.fillStyle = o.pillMuted ? 'rgba(255,255,255,.18)' : GOLD; rr(x, S - 66 - w, 68, w, 50, 25); x.fill();
        x.fillStyle = o.pillMuted ? '#fff' : '#0f2a5f'; x.textAlign = 'center'; x.fillText(o.pill, S - 66 - w / 2, 94); x.textAlign = 'left';
      }
      x.textBaseline = 'alphabetic';
      var y = 230, mw = S - 144;
      if (o.logo && o.logo.naturalWidth) { // official game logo on a white tile, top right under the pill
        var tw = 200, th = 120, tx = S - 72 - tw, ty = 196; mw -= tw + 28;
        x.fillStyle = '#fff'; rr(x, tx, ty, tw, th, 18); x.fill();
        var sc = Math.min((tw - 24) / o.logo.naturalWidth, (th - 20) / o.logo.naturalHeight), lw = o.logo.naturalWidth * sc, lh = o.logo.naturalHeight * sc;
        x.drawImage(o.logo, tx + (tw - lw) / 2, ty + (th - lh) / 2, lw, lh);
      }
      if (o.kicker) { x.fillStyle = GOLD; fit(x, o.kicker.toUpperCase(), '800', 38, mw, COND); x.fillText(o.kicker.toUpperCase(), 72, y); y += 82; }
      if (o.title) { x.fillStyle = '#fff'; fit(x, o.title.toUpperCase(), '800', 92, mw, COND); x.fillText(o.title.toUpperCase(), 72, y); y += 56; }
      if (o.sub) { x.fillStyle = '#c9d4ea'; fit(x, o.sub, '600', 34, mw); x.fillText(o.sub, 72, y); y += 30; }
      return y + 30;
    },
    footer: function (x, note) {
      x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 2; x.beginPath(); x.moveTo(72, S - 104); x.lineTo(S - 72, S - 104); x.stroke();
      x.textBaseline = 'middle'; x.fillStyle = '#9eabc6'; x.textAlign = 'left'; x.font = '600 26px ' + FONT; x.fillText(HOST, 72, S - 62);
      x.textAlign = 'right'; fit(x, note || 'Unofficial · Not affiliated with PCSO · 18+', '600', 26, S - 144 - x.measureText(HOST).width - 40);
      x.fillText(note || 'Unofficial · Not affiliated with PCSO · 18+', S - 72, S - 62);
      x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    },
    /** ball (round or square) in the game colour with a gold ring; (cx, cy) = centre, r = half size */
    ball: function (x, cx, cy, r, color, square, label, alpha) {
      x.save(); x.globalAlpha = alpha == null ? 1 : alpha;
      var path = function () { if (square) rr(x, cx - r, cy - r, r * 2, r * 2, r * 0.24); else { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); } };
      x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = r * 0.25; x.shadowOffsetY = r * 0.08;
      path(); x.fillStyle = color || '#1d4ed8'; x.fill();
      x.shadowColor = 'transparent';
      path(); x.save(); x.clip();
      var g = x.createLinearGradient(0, cy - r, 0, cy + r); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.2)');
      x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); x.restore();
      path(); x.strokeStyle = 'rgba(245,180,0,.9)'; x.lineWidth = Math.max(3, r * 0.07); x.stroke();
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      fit(x, label, '800', r * 1.25, r * 1.6, COND); x.fillText(label, cx, cy + r * 0.07);
      x.restore(); x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    },
  };
  window.LPHCard = LPHCard;

  /* ---------- result card -> image ---------- */
  function balls(root) { return root ? [].map.call(root.querySelectorAll('.ball'), function (b) { return b.textContent.trim(); }) : []; }
  function longDate(iso) {
    var p = (iso || '').split('-'); if (p.length !== 3) return iso || '';
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()] + ', ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + p[0];
  }
  function readCard(card) {
    var slug = card.getAttribute('data-card') || card.getAttribute('data-game');
    var g = BY[slug] || { name: slug, color: '#1d4ed8', ball: 'round', path: '', slots: ['9PM'] };
    var rows = [], verified = true, date, url, prize = '', winners = '';
    if (card.matches('.brow')) {
      var slots = card.querySelectorAll('.bslot');
      if (slots.length) [].forEach.call(slots, function (b) { rows.push({ label: (b.querySelector('.bslot-t') || {}).textContent || '', nums: balls(b) }); if (b.getAttribute('data-st') && b.getAttribute('data-st') !== 'official') verified = false; });
      else { rows.push({ label: '9PM', nums: balls(card.querySelector('[data-f="balls"]')) }); if (card.getAttribute('data-st') && card.getAttribute('data-st') !== 'official') verified = false; }
      date = longDate(card.getAttribute('data-date'));
      var jpb = card.querySelector('[data-f="jackpot"]'), kw = card.querySelector('[data-f="kv-winners"]');
      if (jpb) { prize = jpb.textContent.trim(); winners = kw ? kw.textContent.trim() : ''; }
      url = SITE + '/' + g.path + '/';
    } else if (card.matches('.gcard')) {
      var trs = card.querySelectorAll('tbody tr');
      if (trs.length) [].forEach.call(trs, function (tr) { rows.push({ label: (tr.querySelector('th') || {}).textContent || '', nums: balls(tr) }); if (tr.getAttribute('data-st') && tr.getAttribute('data-st') !== 'official') verified = false; });
      else rows.push({ label: '9PM', nums: balls(card.querySelector('.gcard-body')) });
      var badge = card.querySelector('[data-f="badge"]'); if (badge && /provisional/i.test(badge.textContent)) verified = false;
      var rowDate = (card.querySelector('tbody tr[data-date]') || card).getAttribute('data-date');
      date = rowDate ? longDate(rowDate) : ((card.querySelector('[data-f="date"]') || {}).textContent || '');
      var jp = card.querySelector('[data-f="jackpot"]'), wn = card.querySelector('[data-f="winners"]');
      if (jp) { prize = jp.textContent.trim(); winners = wn ? wn.textContent.trim() : ''; }
      url = SITE + '/' + g.path + '/';
    } else {
      var slot = card.getAttribute('data-slot'), d = card.getAttribute('data-date');
      rows.push({ label: slot === '2PM' ? '2PM' : slot === '5PM' ? '5PM' : '9PM', nums: balls(card) });
      verified = card.getAttribute('data-st') === 'official';
      var mp = card.querySelector('[data-f="card-prize"]'), mw = card.querySelector('[data-f="card-winners"]'); prize = mp ? mp.textContent.trim() : ''; winners = mw ? mw.textContent.trim() : '';
      date = longDate(d); url = SITE + '/' + g.path + '/' + d + '/';
    }
    return { g: g, rows: rows, date: date, prize: prize, winners: winners, url: url, verified: verified };
  }
  var DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var HOUR = { '2PM': 14, '5PM': 17, '9PM': 21 };
  /** "Next draw: Today, 9PM" / "Next draw: Fri, Nov 6, 9PM" from the schedule, Manila time */
  function nextDraw(g) {
    if (!g.slots || !g.days) return '';
    var now = new Date(Date.now() + 8 * 3600e3); // Manila wall clock in UTC fields
    for (var i = 0; i < 8; i++) {
      var d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
      if (g.days !== 'daily' && g.days.indexOf(DAY3[d.getUTCDay()]) < 0) continue;
      if ((cfg.noDraw || []).indexOf(d.toISOString().slice(0, 10)) >= 0) continue;
      for (var k = 0; k < g.slots.length; k++) {
        var h = HOUR[g.slots[k]];
        if (i === 0 && now.getUTCHours() >= h) continue;
        var t = (h > 12 ? h - 12 : h) + 'PM';
        return 'Next draw: ' + (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY3[d.getUTCDay()] + ', ' + MON3[d.getUTCMonth()] + ' ' + d.getUTCDate()) + ', ' + t;
      }
    }
    return '';
  }
  function renderResult(info) {
    var c = document.createElement('canvas'); c.width = S; c.height = S; var x = c.getContext('2d');
    LPHCard.background(x);
    var multi = info.rows.length > 1;
    var y = LPHCard.header(x, { pill: info.verified ? 'VERIFIED vs PCSO' : 'PROVISIONAL', pillMuted: !info.verified, kicker: info.g.name, title: multi ? "Today's Results" : 'Winning Numbers', sub: info.date, logo: info.logo });
    var next = nextDraw(info.g);
    if (multi) {
      var rows = info.rows.slice(0, 3);
      var maxN = Math.max.apply(null, rows.map(function (r) { return r.nums.length; }).concat([1]));
      var left = 250, gap = 22, size = Math.min(150, (S - left - 72 - gap * (maxN - 1)) / maxN), rowH = size + 30;
      var block = rows.length * rowH - 30, top = y + 10 + Math.max(0, (S - 104 - 120 - y - block) / 2);
      rows.forEach(function (r, i) {
        var cy = top + i * rowH + size / 2;
        x.fillStyle = '#c9d4ea'; x.font = '800 34px ' + FONT; x.textBaseline = 'middle'; x.fillText(r.label, 72, cy); x.textBaseline = 'alphabetic';
        r.nums.forEach(function (n, k) { LPHCard.ball(x, left + k * (size + gap) + size / 2, cy, size / 2, info.g.color, info.g.ball === 'square', n); });
      });
    } else {
      // layout B (2026-11-04): big balls + broadcast lower-third (draw / prize / winners) + next draw
      var nums = info.rows[0].nums, n = Math.max(1, nums.length), g2 = 22;
      var sz = Math.min(212, (S - 144 - g2 * (n - 1)) / n), cy = y + 30 + sz / 2, st = (S - (n * sz + (n - 1) * g2)) / 2;
      nums.forEach(function (v, k) { LPHCard.ball(x, st + k * (sz + g2) + sz / 2, cy, sz / 2, info.g.color, info.g.ball === 'square', v); });
      var Y = cy + sz / 2 + 50, H = 150;
      x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(0, Y, S, H);
      x.fillStyle = GOLD; x.fillRect(0, Y, 14, H);
      var cols = [['Draw', info.rows[0].label], [info.g.type === 'lotto' ? 'Jackpot' : info.g.slots && info.g.slots.length === 1 ? 'First prize' : 'Prize', (info.prize || '—').replace(/\.\d+$/, '')], ['Winners', info.winners || '—']];
      if (info.g.slots && info.g.slots.length > 1) cols.pop(); // no confirmed winner count for Swertres and EZ2
      var cw = (S - 144) / 3;
      cols.forEach(function (col, i) {
        var X = 72 + i * cw;
        if (i) { x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(X - 16, Y + 30, 2, H - 60); }
        x.fillStyle = GOLD; x.font = '800 24px ' + FONT; x.fillText(col[0].toUpperCase(), X, Y + 52);
        x.fillStyle = i === 1 ? GOLD : '#fff'; fit(x, col[1], '700', 46, cw - 30, i === 1 ? MONO : COND); x.fillText(col[1], X, Y + 112);
      });
      y = Y + H;
    }
    if (next) { x.fillStyle = '#c9d4ea'; fit(x, next, '700', 34, S - 144); x.textAlign = 'center'; x.fillText(next, S / 2, multi ? S - 150 : Math.min(S - 150, y + 70)); x.textAlign = 'left'; }
    LPHCard.footer(x);
    return c;
  }

  /* ---------- home "today" card: every Swertres and EZ2 draw time of the day shown in the hero ---------- */
  function readToday() {
    var box = document.querySelector('[data-hday]'); if (!box) return null;
    var day = box.getAttribute('data-day') || '';
    var games = [].map.call(box.querySelectorAll('[data-hd-game]'), function (row) {
      var g = BY[row.getAttribute('data-hd-game')] || { name: row.getAttribute('data-hd-game'), color: '#1d4ed8', ball: 'round' };
      var cells = [].map.call(row.querySelectorAll('.hd-cell'), function (c) {
        var pending = c.classList.contains('is-live') || c.classList.contains('is-wait');
        return { slot: c.getAttribute('data-slot'), nums: balls(c), note: c.classList.contains('is-done') ? '' : pending ? 'Waiting' : /No result/.test(c.textContent) ? 'No result' : 'Not yet drawn' };
      });
      return { g: g, cells: cells };
    });
    var extras = [].filter.call(document.querySelectorAll('[data-hero-extra]'), function (e) { return e.getAttribute('data-date') === day; })
      .map(function (e) { return { g: BY[e.getAttribute('data-hero-extra')] || { name: e.getAttribute('data-hero-extra'), color: '#1d4ed8' }, nums: balls(e) }; })
      .filter(function (e) { return e.nums.length; });
    var top = [].slice.call(document.querySelectorAll('[data-jpx-row]')).sort(function (a, b) { return (+b.getAttribute('data-jackpot') || 0) - (+a.getAttribute('data-jackpot') || 0); })[0];
    var jackpot = top && +top.getAttribute('data-jackpot') ? { name: (BY[top.getAttribute('data-jpx-row')] || {}).name || '', amt: '₱' + Math.round(+top.getAttribute('data-jackpot')).toLocaleString('en-PH') } : null;
    var today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    return { day: day, isToday: day === today, games: games, extras: extras, jackpot: jackpot };
  }
  function renderToday(t) {
    var W = S, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d');
    x.save(); x.scale(1, H / S); LPHCard.background(x); x.restore();
    var y = LPHCard.header(x, { pill: 'PCSO LOTTO', pillMuted: true, kicker: t.isToday ? 'Resulta ngayon' : 'Latest results', title: t.isToday ? "Today's results" : 'PCSO results', sub: longDate(t.day) });
    var colGap = 24, colW = (W - 144 - colGap * 2) / 3, cellH = 140;
    t.games.forEach(function (gm) {
      x.textBaseline = 'middle'; x.textAlign = 'left';
      x.fillStyle = gm.g.color || GOLD; x.beginPath(); x.arc(84, y + 18, 10, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#fff'; x.font = '800 42px ' + COND; x.fillText(gm.g.name, 106, y + 20);
      var top = y + 48;
      gm.cells.forEach(function (cell, i) {
        var cx = 72 + i * (colW + colGap);
        x.fillStyle = cell.nums.length ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.04)'; rr(x, cx, top, colW, cellH, 18); x.fill();
        x.fillStyle = GOLD; x.font = '800 28px ' + FONT; x.textAlign = 'left'; x.fillText(cell.slot, cx + 20, top + 30);
        if (cell.nums.length) {
          var n = cell.nums.length, gap = 10, size = Math.min(74, (colW - 40 - gap * (n - 1)) / n), st = cx + (colW - (n * size + (n - 1) * gap)) / 2;
          cell.nums.forEach(function (v, k) { LPHCard.ball(x, st + k * (size + gap) + size / 2, top + 92, size / 2, gm.g.color, gm.g.ball === 'square', v); });
        } else { x.fillStyle = '#9eabc6'; x.font = '600 28px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(cell.note, cx + colW / 2, top + 90); }
      });
      y = top + cellH + 40;
    });
    if (t.extras.length) {
      x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = GOLD; x.font = '800 30px ' + FONT; x.fillText('ALSO DRAWN · 9PM', 72, y + 8); y += 50;
      t.extras.slice(0, 5).forEach(function (e) {
        var n = e.nums.length, gap = 8, size = 50, w = n * size + (n - 1) * gap, st = W - 72 - w;
        x.fillStyle = '#fff'; fit(x, e.g.name, '700', 34, st - 72 - 20, COND); x.textAlign = 'left'; x.fillText(e.g.name, 72, y + size / 2);
        e.nums.forEach(function (v, k) { LPHCard.ball(x, st + k * (size + gap) + size / 2, y + size / 2, size / 2, e.g.color, e.g.ball === 'square', v); });
        y += size + 16;
      });
    }
    if (t.jackpot && y + 70 < H - 120) {
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#c9d4ea'; fit(x, 'Biggest jackpot now · ' + t.jackpot.name + ' ' + t.jackpot.amt, '700', 32, W - 144);
      x.fillText('Biggest jackpot now · ' + t.jackpot.name + ' ', W / 2 - x.measureText(t.jackpot.amt).width / 2, y + 30);
      x.fillStyle = GOLD; x.textAlign = 'left'; var full = x.measureText('Biggest jackpot now · ' + t.jackpot.name + ' ' + t.jackpot.amt).width;
      x.fillText(t.jackpot.amt, W / 2 + full / 2 - x.measureText(t.jackpot.amt).width, y + 30);
    }
    x.save(); x.translate(0, H - S); LPHCard.footer(x); x.restore();
    return c;
  }
  function todayText(t) {
    var parts = t.games.map(function (gm) {
      var done = gm.cells.filter(function (c) { return c.nums.length; }).map(function (c) { return c.slot + ' ' + c.nums.join('-'); });
      return done.length ? (gm.g.short || gm.g.name) + ' ' + done.join(', ') : '';
    }).filter(Boolean);
    t.extras.forEach(function (e) { parts.push((e.g.short || e.g.name) + ' ' + e.nums.join('-')); });
    return 'PCSO results ' + longDate(t.day) + ': ' + parts.join(' | ');
  }

  /* ---------- bottom drawer ---------- */
  var ICON = {
    share: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
    save: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    fb: '<path fill="#fff" stroke="none" d="M14 8h2.5V4.5H14c-2.5 0-4 1.6-4 4V11H7.5v3.5H10V21h3.5v-6.5H16l.5-3.5h-3V8.8c0-.5.3-.8.5-.8z"/>',
    ms: '<path fill="#fff" stroke="none" d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.9.2 1.8.4 2.7.4 5 0 9-3.7 9-8.4S17 3 12 3zm1 11.2-2.3-2.4-4.4 2.4 4.8-5.1 2.3 2.4 4.4-2.4-4.8 5.1z"/>',
    vb: '<path fill="#fff" stroke="none" d="M12 3c4.6 0 8 2.7 8 7.6 0 4.6-3.2 7.6-8 7.6-.7 0-1.4-.1-2-.2L7 20v-2.8C5 16 4 13.7 4 10.6 4 5.7 7.4 3 12 3zm-2.6 4.3c-.4 0-.9.4-.9 1 .2 2.9 2.8 5.6 5.8 6 .6.1 1-.4 1-.8l-1.3-1c-.3-.2-.7-.1-.9.1l-.4.5c-1-.4-1.9-1.3-2.3-2.3l.5-.4c.3-.2.3-.6.1-.9l-1-1.2c-.2-.1-.4-.1-.6 0z"/>',
  };
  function icon(name, stroke) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', stroke || '#fff');
    s.setAttribute('stroke-width', '2.2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICON[name]; // static constant markup, no user data
    return s;
  }
  var open = null;
  function close() {
    if (!open) return;
    var o = open; open = null;
    o.root.classList.remove('is-open');
    document.documentElement.classList.remove('sheet-lock');
    setTimeout(function () { o.root.remove(); if (o.url) URL.revokeObjectURL(o.url); }, 220);
    if (o.opener && o.opener.focus) o.opener.focus({ preventScroll: true });
  }
  // GA4 (growth/29 §4): opts.game (game path) and opts.source (result | number) describe what is shared.
  function track(n, p) { if (window.anoTrack) window.anoTrack(n, p); }
  var ACTION = { share: 'share', save: 'save', fb: 'facebook', ms: 'messenger', vb: 'viber', link: 'copy' };
  function shareSheet(opts) {
    close();
    track('share_open', { game: opts.game, method: opts.source });
    var root = document.createElement('div'); root.className = 'sheet-root';
    var dim = document.createElement('div'); dim.className = 'sheet-dim'; dim.addEventListener('click', close);
    var sheet = document.createElement('div'); sheet.className = 'sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', opts.title || 'Share');
    var grab = document.createElement('div'); grab.className = 'sheet-grab';
    var head = document.createElement('div'); head.className = 'sheet-head';
    var h = document.createElement('b'); h.textContent = opts.title || 'Share this result';
    var x = document.createElement('button'); x.type = 'button'; x.className = 'sheet-close'; x.textContent = 'Close'; x.addEventListener('click', close);
    head.appendChild(h); head.appendChild(x);
    var img = document.createElement('img'); img.className = 'sheet-img'; img.alt = opts.text || 'Share image'; img.width = 220; img.height = 220;
    var hint = document.createElement('p'); hint.className = 'sheet-hint'; hint.textContent = 'Long-press the image to save it · I-share sa GC ninyo';
    var row = document.createElement('div'); row.className = 'sheet-icons';
    var status = document.createElement('p'); status.className = 'sheet-status'; status.setAttribute('role', 'status');
    sheet.appendChild(grab); sheet.appendChild(head); sheet.appendChild(img); sheet.appendChild(hint); sheet.appendChild(row); sheet.appendChild(status);
    root.appendChild(dim); root.appendChild(sheet); document.body.appendChild(root);
    document.documentElement.classList.add('sheet-lock');
    var state = { root: root, opener: opts.opener, url: null };
    open = state;
    void sheet.offsetHeight; root.classList.add('is-open'); // reflow, then animate in

    function item(label, name, cls, onClick, href) {
      var a = document.createElement(href ? 'a' : 'button');
      a.className = 'sheet-ic';
      if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener'; } else a.type = 'button';
      var c = document.createElement('span'); c.className = 'sheet-ic-c ' + cls; c.appendChild(icon(name, cls === 'ic-link' ? '#0f2a5f' : '#fff'));
      var t = document.createElement('span'); t.textContent = label;
      a.appendChild(c); a.appendChild(t);
      a.addEventListener('click', function () { track('share_complete', { game: opts.game, method: ACTION[name] || name }); });
      if (onClick) a.addEventListener('click', onClick);
      row.appendChild(a); return a;
    }
    var blobP = opts.blob ? Promise.resolve(opts.blob) : new Promise(function (res) { opts.canvas.toBlob(function (b) { res(b); }, 'image/png'); });
    blobP.then(function (blob) {
      if (!blob || !open || open !== state) return;
      var url = URL.createObjectURL(blob); state.url = url;
      img.src = opts.dataUrl || url;
      var fname = opts.filename || 'anolabas.png', file = null;
      try { file = new File([blob], fname, { type: 'image/png' }); } catch (e) {}
      var canFiles = !!(file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
      if (navigator.share) item('Share', 'share', 'ic-share', function () {
        var data = { title: 'Ano Labas', text: opts.text || '', url: opts.url };
        if (canFiles) data = { files: [file], title: 'Ano Labas', text: (opts.text || '') + ' ' + (opts.url || '') };
        navigator.share(data).catch(function () {});
      });
      item('Save', 'save', 'ic-save', function () { var a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); status.textContent = 'Image saved to your downloads.'; });
      item('Facebook', 'fb', 'ic-fb', null, 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(opts.url));
      item('Messenger', 'ms', 'ic-ms', null, 'fb-messenger://share/?link=' + encodeURIComponent(opts.url));
      item('Viber', 'vb', 'ic-vb', null, 'viber://forward?text=' + encodeURIComponent((opts.text ? opts.text + ' ' : '') + opts.url));
      item('Copy link', 'link', 'ic-link', function () {
        var t = (opts.text ? opts.text + ' ' : '') + opts.url;
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { status.textContent = 'Link copied.'; }).catch(function () { status.textContent = opts.url; });
      });
      var first = row.querySelector('.sheet-ic'); if (first) first.focus({ preventScroll: true });
    });
  }
  /* Info sheet: the same drawer, filled from a <template id="lph-sheet-{key}"> rendered by the page (no HTML strings here). */
  function infoSheet(key, opener) {
    var tpl = document.getElementById('lph-sheet-' + key); if (!tpl) return;
    close();
    var root = document.createElement('div'); root.className = 'sheet-root';
    var dim = document.createElement('div'); dim.className = 'sheet-dim'; dim.addEventListener('click', close);
    var sheet = document.createElement('div'); sheet.className = 'sheet sheet-info'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
    var grab = document.createElement('div'); grab.className = 'sheet-grab';
    var body = document.createElement('div'); body.className = 'sheet-body'; body.appendChild(tpl.content.cloneNode(true));
    var h3 = body.querySelector('h3'); if (h3) sheet.setAttribute('aria-label', h3.textContent);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'btn sec sheet-close-btn'; x.textContent = 'Close'; x.addEventListener('click', close);
    sheet.appendChild(grab); sheet.appendChild(body); sheet.appendChild(x);
    root.appendChild(dim); root.appendChild(sheet); document.body.appendChild(root);
    document.documentElement.classList.add('sheet-lock');
    open = { root: root, opener: opener, url: null };
    void sheet.offsetHeight; root.classList.add('is-open');
    x.focus({ preventScroll: true });
  }
  /* Empty drawer for a caller to fill (ticket check). Same shell, focus handling and close rules as the other sheets. */
  function panelSheet(opts) {
    close();
    var root = document.createElement('div'); root.className = 'sheet-root';
    var dim = document.createElement('div'); dim.className = 'sheet-dim'; dim.addEventListener('click', close);
    var sheet = document.createElement('div'); sheet.className = 'sheet sheet-info sheet-panel'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', opts.label || 'Panel');
    var grab = document.createElement('div'); grab.className = 'sheet-grab';
    var body = document.createElement('div'); body.className = 'sheet-body';
    var x = document.createElement('button'); x.type = 'button'; x.className = 'btn sec sheet-close-btn'; x.textContent = 'Close'; x.addEventListener('click', close);
    sheet.appendChild(grab); sheet.appendChild(body); sheet.appendChild(x);
    root.appendChild(dim); root.appendChild(sheet); document.body.appendChild(root);
    document.documentElement.classList.add('sheet-lock');
    open = { root: root, opener: opts.opener, url: null };
    void sheet.offsetHeight; root.classList.add('is-open');
    x.focus({ preventScroll: true });
    return { body: body, close: close };
  }
  window.LPHShare = { open: shareSheet, close: close, info: infoSheet, panel: panelSheet };
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-sheet]'); if (!b) return;
    e.preventDefault(); infoSheet(b.getAttribute('data-sheet'), b);
  });
  document.addEventListener('astro:before-swap', close);

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-share]');
    if (!b) return;
    var card = b.closest('.gcard, article.card, .brow');
    if (!card) return;
    e.preventDefault();
    var info = readCard(card);
    var text = info.g.name + ' · ' + info.date + ': ' + info.rows.map(function (r) { return (info.rows.length > 1 ? r.label + ' ' : '') + r.nums.join('-'); }).join(' | ');
    var draw = function () { shareSheet({ canvas: renderResult(info), text: text, url: info.url, filename: 'anolabas-' + (info.g.path || 'result') + '.png', opener: b, title: 'Share this result', game: info.g.path, source: 'result' }); };
    var waits = [];
    if (document.fonts && document.fonts.load) waits.push(document.fonts.load('900 60px "Inter Variable"'), document.fonts.load('800 60px "Barlow Condensed"'), document.fonts.load('700 40px "IBM Plex Mono"'));
    if (info.g.logo) waits.push(new Promise(function (res) { var im = new Image(); im.onload = function () { info.logo = im; res(); }; im.onerror = function () { res(); }; setTimeout(res, 900); im.src = info.g.logo; }));
    Promise.all(waits).then(draw, draw);
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-share-today]'); if (!b) return;
    var t = readToday(); if (!t) return;
    e.preventDefault();
    var draw = function () { shareSheet({ canvas: renderToday(t), text: todayText(t), url: SITE + '/', filename: 'anolabas-results-' + t.day + '.png', opener: b, title: "Share today's results", game: 'all', source: 'today' }); };
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('900 60px "Inter Variable"'), document.fonts.load('800 60px "Barlow Condensed"')]).then(draw, draw);
    else draw();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab' || !open) return;
    // Keep keyboard focus inside the open sheet.
    var items = [].filter.call(open.root.querySelectorAll('a[href], button, input, select, textarea'), function (el) { return !el.disabled && el.offsetParent !== null; });
    if (!items.length) { e.preventDefault(); return; }
    var first = items[0], last = items[items.length - 1], at = document.activeElement;
    if (e.shiftKey && (at === first || !open.root.contains(at))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (at === last || !open.root.contains(at))) { e.preventDefault(); first.focus(); }
  });
})();
