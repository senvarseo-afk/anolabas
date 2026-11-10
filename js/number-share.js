/* Share cards for number stats pages: renders a 1080x1080 PNG with <canvas> from data-* attributes on
   each [data-share-card] element. data-kind: "number" (one big ball + 3 stat lines), "hotcold" (rows of
   hot and cold balls) or "streaks" (current runs). Style and the share drawer come from /js/share.js
   (window.LPHCard / window.LPHShare), loaded on every page by Base.astro. */
(function () {
  'use strict';
  var S = 1080;
  var NAVY = '#0f2a5f', GOLD = '#f5b400';
  var FONT = '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
  var FOOT = 'Unofficial · Past results only · Not a prediction · 18+';

  // Drawing uses the shared broadcast-style helpers from /js/share.js (window.LPHCard).
  function C() { return window.LPHCard; }
  function fit(ctx, text, weight, max, maxWidth) { return C().fit(ctx, text, weight, max, maxWidth); }
  function ball(ctx, cx, cy, r, color, square, label, alpha) { C().ball(ctx, cx, cy, r, color, square, label, alpha); }
  function frame(ctx, kicker, title, sub) {
    C().background(ctx);
    var y = C().header(ctx, { pill: 'PAST RESULTS', pillMuted: true, kicker: kicker, title: title, sub: sub || '' });
    C().footer(ctx, FOOT);
    return y;
  }

  function drawNumber(ctx, D) {
    C().background(ctx);
    C().header(ctx, { pill: 'PAST RESULTS', pillMuted: true, kicker: 'Number story · ' + (D.game || '') });
    ball(ctx, S / 2, 470, 165, D.color || NAVY, D.shape === 'square', D.num || '');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    var lines = [D.line1, D.line2, D.line3].filter(Boolean);
    var y = 735;
    for (var i = 0; i < lines.length; i++) {
      ctx.fillStyle = i === 0 ? '#ffffff' : '#c9d4ea';
      fit(ctx, lines[i], i === 0 ? '800' : '600', i === 0 ? 50 : 40, S - 144);
      ctx.fillText(lines[i], S / 2, y);
      y += i === 0 ? 66 : 56;
    }
    ctx.textAlign = 'left';
    C().footer(ctx, FOOT);
  }

  function parseBalls(s) {
    return (s || '').split(',').filter(Boolean).map(function (x) { var p = x.split(':'); return { n: p[0], c: p[1] || '' }; });
  }

  function ballRow(ctx, items, y, color, square, muted) {
    var n = items.length; if (!n) return;
    var gap = 24, r = Math.min(68, ((S - 144) - gap * (n - 1)) / n / 2);
    var w = n * r * 2 + (n - 1) * gap, x0 = (S - w) / 2 + r;
    for (var i = 0; i < n; i++) {
      var cx = x0 + i * (r * 2 + gap);
      ball(ctx, cx, y, r, color, square, items[i].n, muted ? 0.6 : 1);
      ctx.fillStyle = '#c9d4ea';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      var cap = items[i].c + (items[i].c === '1' ? ' time' : ' times');
      fit(ctx, cap, '600', 28, r * 2 + gap - 4);
      ctx.fillText(cap, cx, y + r + 40);
    }
    ctx.textAlign = 'left';
  }

  function label(ctx, text, y) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = GOLD; ctx.font = '800 36px ' + FONT;
    ctx.fillText(text, 72, y);
  }

  function drawHotCold(ctx, D) {
    var top = frame(ctx, 'Hot and cold', D.game || '', D.window || '');
    var color = D.color || NAVY, sq = D.shape === 'square';
    label(ctx, 'Most drawn (hot)', top + 20);
    ballRow(ctx, parseBalls(D.hot), top + 120, color, sq, false);
    label(ctx, 'Least drawn (cold)', top + 300);
    ballRow(ctx, parseBalls(D.cold), top + 400, color, sq, true);
  }

  function drawStreaks(ctx, D) {
    var top = frame(ctx, 'Current streaks', D.game || '', D.window || '');
    var items = (D.items || '').split(';').filter(Boolean).slice(0, 3).map(function (x) { var p = x.split('|'); return { n: p[0], t: p[1] || '' }; });
    var bottom = S - 130, gapY = 24;
    var avail = bottom - top, h = Math.min(190, (avail - gapY * (items.length - 1)) / Math.max(1, items.length));
    var y = top + (avail - (items.length * h + (items.length - 1) * gapY)) / 2;
    for (var i = 0; i < items.length; i++) {
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      C().roundRect(ctx, 72, y, S - 144, h, 24); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2; ctx.stroke();
      ball(ctx, 72 + 28 + h * 0.34, y + h / 2, h * 0.34, D.color || NAVY, D.shape === 'square', items[i].n);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      var tx = 72 + 28 + h * 0.68 + 32;
      fit(ctx, items[i].t, '800', 44, S - 72 - 28 - tx);
      ctx.fillText(items[i].t, tx, y + h / 2);
      ctx.textBaseline = 'alphabetic';
      y += h + gapY;
    }
  }

  function draw(D) {
    var c = document.createElement('canvas');
    c.width = S; c.height = S;
    var ctx = c.getContext('2d');
    if (D.kind === 'hotcold') drawHotCold(ctx, D);
    else if (D.kind === 'streaks') drawStreaks(ctx, D);
    else drawNumber(ctx, D);
    return c;
  }

  function toBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('toBlob failed')); }, 'image/png');
      else {
        try {
          var bin = atob(canvas.toDataURL('image/png').split(',')[1]);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: 'image/png' }));
        } catch (e) { reject(e); }
      }
    });
  }

  var fontsReady = null;
  function fonts() {
    if (!fontsReady) fontsReady = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('800 40px "Inter Variable"'), document.fonts.load('600 40px "Inter Variable"'), document.fonts.load('800 60px "Barlow Condensed"')]).catch(function () {})
      : Promise.resolve();
    return fontsReady;
  }

  function setup(box) {
    var D = box.dataset;
    var section = box.closest('.ns-share') || box.parentNode;
    var statusEl = section.querySelector('.ns-status');
    var cached = null, pending = null;
    var fname = D.filename || 'anolabas.png';

    function say(msg) { if (statusEl) statusEl.textContent = msg; }

    function make() {
      if (cached) return Promise.resolve(cached);
      if (pending) return pending;
      var dataUrl = '';
      pending = fonts().then(function () {
        var c = draw(D);
        try { dataUrl = c.toDataURL('image/png'); } catch (e) { dataUrl = ''; }
        return toBlob(c);
      }).then(function (blob) {
        // blob URL for the download; data URL for the preview so in-app browsers can long-press to save it
        cached = { blob: blob, url: URL.createObjectURL(blob), dataUrl: dataUrl };
        return cached;
      });
      pending.catch(function () { pending = null; });
      return pending;
    }

    function download(img) {
      var a = document.createElement('a');
      a.href = img.url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    function share(btn) {
      say('Making the image...');
      make().then(function (img) {
        say('');
        if (window.LPHShare) window.LPHShare.open({ blob: img.blob, dataUrl: img.dataUrl, text: D.title || document.title, url: D.url || location.href, filename: fname, opener: btn, title: 'Share this card', source: 'number' });
        else { download(img); say('Image downloaded.'); }
      }).catch(function () { say('Could not make the image in this browser.'); });
    }

    function copyLink() {
      if (window.anoTrack) window.anoTrack('share_complete', { method: 'copy' });
      var url = D.url || location.href;
      function fallback() {
        var t = document.createElement('textarea');
        t.value = url; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
        document.body.appendChild(t); t.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        t.remove();
        say(ok ? 'Link copied.' : 'Copy this link: ' + url);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { say('Link copied.'); }, fallback);
      else fallback();
    }

    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b) return;
      if (b.getAttribute('data-act') === 'share') share(b);
      else if (b.getAttribute('data-act') === 'copy') copyLink();
    });
    box._lphPrerender = function () { make().catch(function () {}); };
  }

  var boxes = Array.prototype.slice.call(document.querySelectorAll('[data-share-card]'));
  if (!boxes.length) return;
  boxes.forEach(setup);

  // Pre-render visible cards once the page is idle; hidden ones (other windows) render when shown.
  var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1200); };
  function prerenderVisible() { boxes.forEach(function (b) { if (b.offsetParent !== null && b._lphPrerender) b._lphPrerender(); }); }
  window.lphSharePrerender = function () { idle(prerenderVisible); };
  if (document.readyState === 'complete') idle(prerenderVisible);
  else window.addEventListener('load', function () { idle(prerenderVisible); });
})();
