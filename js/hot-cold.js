/* Hot and cold window switch: all panels are in the HTML; this only shows one at a time.
   Remembers the choice in the URL hash (#last-100, #last-30, #all-records). No dependencies. */
(function () {
  'use strict';
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.hc-switch [data-win]'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.hc-panel[data-win]'));
  if (!buttons.length || !panels.length) return;

  function show(key, push) {
    var found = panels.some(function (p) { return p.getAttribute('data-win') === key; });
    if (!found) return;
    panels.forEach(function (p) { p.hidden = p.getAttribute('data-win') !== key; });
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-win') === key ? 'true' : 'false'); });
    if (push && window.history && history.replaceState) {
      try { history.replaceState(null, '', key === panels[0].getAttribute('data-win') ? location.pathname : '#' + key); } catch (e) {}
    }
    if (window.lphSharePrerender) window.lphSharePrerender();
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-win'), true); });
  });
  var h = (location.hash || '').slice(1);
  if (h) show(h, false);
  if (window.__hcHash) window.removeEventListener('hashchange', window.__hcHash);
  window.__hcHash = function () { show((location.hash || '').slice(1), false); };
  window.addEventListener('hashchange', window.__hcHash);
})();
