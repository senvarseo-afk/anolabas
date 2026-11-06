/* LottoPH Today — shared helpers for client-side tools. Vanilla JS, no dependencies.
   Data: /data/{slug}.json = {game, generated_at, columns, rows:[[date, slot, [ints], jackpot, winners, official, archive]]} newest first. */
(function (w) {
  'use strict';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DISCLAIMER = 'This is not a prediction. PCSO draws are random. Past results do not change future odds. Play only what you can afford. 18+.';
  var cache = {};

  function loadGame(slug) {
    if (!cache[slug]) {
      cache[slug] = fetch('/lottoph/data/' + slug + '.json').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (j) {
        j.draws = (j.rows || []).map(function (r) { return { date: r[0], slot: r[1], numbers: r[2], jackpot: r[3], winners: r[4], official: !!r[5], archive: !!r[6] }; });
        var seen = {}; j.dates = [];
        j.draws.forEach(function (d) { if (!seen[d.date]) { seen[d.date] = 1; j.dates.push(d.date); } });
        return j;
      }).catch(function (e) { delete cache[slug]; throw e; });
    }
    return cache[slug];
  }

  function parseDate(iso) { var p = iso.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
  function fmtDate(iso, withDay) {
    if (!iso) return '';
    var d = parseDate(iso);
    var s = MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
    return withDay === false ? s : DAYS[d.getUTCDay()] + ', ' + s;
  }
  function fmtShort(iso) { var d = parseDate(iso); return DAY3[d.getUTCDay()] + ' ' + MONTHS[d.getUTCMonth()].slice(0, 3) + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear(); }
  function slotTime(s) { return s === '2PM' ? '2PM' : s === '5PM' ? '5PM' : '9PM'; }
  function todayManila() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function manilaNow() { try { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })); } catch (e) { return new Date(); } }

  function pad(g, n) { n = parseInt(n, 10); return (g.type === 'lotto' || g.slug === '2d-lotto') ? (n < 10 ? '0' + n : String(n)) : String(n); }
  function peso(n) {
    if (n == null || isNaN(n)) return '—';
    var f = Math.round(n * 100) / 100;
    return '₱' + f.toLocaleString('en-PH', { minimumFractionDigits: f % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function taxOn(gross) { return gross > 10000 ? Math.round(gross * 0.2 * 100) / 100 : 0; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ballsHTML(g, nums, size, label) {
    return '<div class="balls ' + (size || '') + '" role="list" aria-label="' + esc(label || 'numbers') + '">' + nums.map(function (n) {
      return '<span class="ball ' + (g.ball === 'square' ? 'square' : '') + '" role="listitem" style="background:' + esc(g.color) + '">' + pad(g, n) + '</span>';
    }).join('') + '</div>';
  }
  function sortNums(a) { return a.slice().sort(function (x, y) { return x - y; }); }
  function keyOf(g, nums) { return (g.type === 'lotto' ? sortNums(nums) : nums).map(Number).join('-'); }
  function findCombination(g, draws, nums) { var k = keyOf(g, nums); return draws.filter(function (d) { return keyOf(g, d.numbers) === k; }); }
  function numsLabel(g, nums) { return (g.type === 'lotto' ? sortNums(nums) : nums).map(function (n) { return pad(g, n); }).join('-'); }

  /* randomness */
  function randInt(n, rng) {
    if (rng) return Math.floor(rng() * n);
    if (w.crypto && w.crypto.getRandomValues) {
      var buf = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n, x;
      do { w.crypto.getRandomValues(buf); x = buf[0]; } while (x >= lim);
      return x % n;
    }
    return Math.floor(Math.random() * n);
  }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function comb(n, k) { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }

  /* clipboard + files */
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (res, rej) {
      var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); res(); } catch (e) { rej(e); } document.body.removeChild(ta);
    });
  }
  function canvasBlob(canvas) { return new Promise(function (res) { if (canvas.toBlob) canvas.toBlob(res, 'image/png'); else { var b = atob(canvas.toDataURL('image/png').split(',')[1]), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); res(new Blob([u], { type: 'image/png' })); } }); }
  function downloadCanvas(canvas, filename) {
    return canvasBlob(canvas).then(function (blob) {
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return blob;
    });
  }
  function shareCanvas(canvas, title, text, url, filename) {
    return canvasBlob(canvas).then(function (blob) {
      var file; try { file = new File([blob], filename, { type: 'image/png' }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: title, text: text });
      if (navigator.share) return navigator.share({ title: title, text: text, url: url });
      w.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url) + '&quote=' + encodeURIComponent(text), '_blank', 'noopener');
    });
  }
  function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }

  /* 1080x1350 simulation card */
  function wrapText(ctx, text, maxW) {
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function (wd) { var t = cur ? cur + ' ' + wd : wd; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; });
    if (cur) lines.push(cur); return lines;
  }
  function roundRect(ctx, x, y, wd, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + wd, y, x + wd, y + h, r); ctx.arcTo(x + wd, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + wd, y, r); ctx.closePath(); }
  function drawCard(opts) {
    var W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    var ctx = c.getContext('2d'), font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#fffdf7'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(0, 0, W, 250);
    ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(92, 110, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f1300'; ctx.font = '900 30px ' + font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PH', 92, 112);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '900 58px ' + font; ctx.fillText('LottoPH Today', 150, 108);
    ctx.fillStyle = '#fde68a'; ctx.font = '800 32px ' + font; ctx.fillText(opts.kicker || 'NUMBER SIMULATOR · FOR FUN', 150, 172);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1e293b'; ctx.font = '900 66px ' + font; ctx.fillText(opts.title, W / 2, 360);
    ctx.fillStyle = '#64748b'; ctx.font = '600 36px ' + font; ctx.fillText(opts.subtitle || '', W / 2, 430);
    // SIMULATION pill
    ctx.fillStyle = '#fef3c7'; roundRect(ctx, W / 2 - 200, 500, 400, 72, 36); ctx.fill();
    ctx.fillStyle = '#b45309'; ctx.font = '900 34px ' + font; ctx.fillText('S I M U L A T I O N', W / 2, 538);
    // balls
    var nums = opts.numbers, n = nums.length, size = n > 4 ? 150 : n > 3 ? 190 : 230, gap = n > 4 ? 22 : 36;
    var total = n * size + (n - 1) * gap, x0 = (W - total) / 2, cy = 740;
    nums.forEach(function (txt, i) {
      var cx = x0 + i * (size + gap) + size / 2;
      ctx.fillStyle = 'rgba(0,0,0,.14)';
      if (opts.square) { roundRect(ctx, cx - size / 2, cy - size / 2 + 8, size, size, 30); ctx.fill(); } else { ctx.beginPath(); ctx.arc(cx, cy + 8, size / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#f59e0b';
      if (opts.square) { roundRect(ctx, cx - size / 2, cy - size / 2, size, size, 30); ctx.fill(); } else { ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.round(size * 0.5) + 'px ' + font; ctx.fillText(txt, cx, cy + 4);
    });
    // mode + note
    ctx.fillStyle = '#1e293b'; ctx.font = '700 34px ' + font; ctx.fillText(opts.mode || '', W / 2, 900);
    ctx.fillStyle = '#475569'; ctx.font = '500 30px ' + font;
    var lines = wrapText(ctx, DISCLAIMER, 900), y = 980;
    lines.forEach(function (l) { ctx.fillText(l, W / 2, y); y += 44; });
    // diagonal watermark
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 6); ctx.globalAlpha = 0.06; ctx.fillStyle = '#1d4ed8'; ctx.font = '900 150px ' + font; ctx.fillText('SIMULATION', 0, 0); ctx.restore();
    // footer bar
    ctx.fillStyle = '#1d4ed8'; ctx.fillRect(0, H - 150, W, 150);
    ctx.fillStyle = '#fff'; ctx.font = '800 30px ' + font; ctx.fillText('LottoPH Today · Random · Not a prediction · Not a tip · 18+', W / 2, H - 92);
    ctx.fillStyle = '#bfdbfe'; ctx.font = '600 26px ' + font; ctx.fillText((opts.site || 'lottophtoday.com') + '  ·  Not affiliated with PCSO', W / 2, H - 48);
    return c;
  }

  /* localStorage "my numbers" */
  var MY_KEY = 'lph_my_numbers';
  function myNumbers() { try { return JSON.parse(localStorage.getItem(MY_KEY) || '[]'); } catch (e) { return []; } }
  function saveMyNumbers(list) { try { localStorage.setItem(MY_KEY, JSON.stringify(list.slice(0, 30))); return true; } catch (e) { return false; } }

  w.LPH = { DISCLAIMER: DISCLAIMER, loadGame: loadGame, fmtDate: fmtDate, fmtShort: fmtShort, slotTime: slotTime, todayManila: todayManila, manilaNow: manilaNow, pad: pad, peso: peso, taxOn: taxOn, esc: esc, ballsHTML: ballsHTML, sortNums: sortNums, keyOf: keyOf, findCombination: findCombination, numsLabel: numsLabel, randInt: randInt, hashStr: hashStr, mulberry32: mulberry32, comb: comb, copyText: copyText, downloadCanvas: downloadCanvas, shareCanvas: shareCanvas, isMobile: isMobile, drawCard: drawCard, myNumbers: myNumbers, saveMyNumbers: saveMyNumbers, DAY3: DAY3 };
})(window);
