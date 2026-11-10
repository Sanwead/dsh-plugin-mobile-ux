import z from "@deepseek-ai/schemastery";

export const name = "mobile-ux";

export const Config = z.object({
  enabled: z.boolean().default(true),
  narrowBreakpoint: z.natural().default(1024),
  tapClickDelayMs: z.natural().default(60),
  slideDistancePx: z.natural().default(48),
});

const VIEWPORT_CONTENT =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, interactive-widget=resizes-content";

// Rewrite the viewport meta: stop iOS focus auto-zoom and let Android Chrome
// resize the layout instead of overlaying the keyboard.
const viewportScript = `(function () {
  var vp = ${JSON.stringify(VIEWPORT_CONTENT)};
  var apply = function () {
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) meta.setAttribute('content', vp);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
})();`;

// iOS keyboard: translate only the chat column up by the keyboard overlap so
// the composer stays above the keyboard (left sidebar stays fixed). Polls after
// focusin/focusout to catch the keyboard-open transition.
const iosKeyboardScript = `(function () {
  function isIOS() {
    var ua = window.navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (ua.indexOf('Macintosh') !== -1 && navigator.maxTouchPoints > 1);
  }
  if (!isIOS()) return;
  var vv = window.visualViewport;
  if (!vv) return;
  var MIN_KB = 20;
  function centerColumn() { return document.querySelector('.pI_x6G_centerCol'); }
  function resetScroll() {
    window.scrollTo(0, 0);
    var d = document.documentElement;
    if (d) d.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }
  function sync() {
    var el = centerColumn();
    var layoutH = document.documentElement ? document.documentElement.clientHeight : window.innerHeight;
    var overlap = layoutH - vv.offsetTop - vv.height;
    if (overlap > MIN_KB) {
      if (el) el.style.transform = 'translateY(-' + overlap + 'px)';
    } else {
      if (el) el.style.transform = '';
      resetScroll();
    }
  }
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
  function editable(t) {
    return !!(t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'));
  }
  document.addEventListener('focusin', function (e) {
    if (!editable(e.target)) return;
    [0, 50, 150, 300, 600, 1000, 1500].forEach(function (ms) { setTimeout(sync, ms); });
  });
  document.addEventListener('focusout', function (e) {
    if (!editable(e.target)) return;
    [100, 300, 650].forEach(function (ms) { setTimeout(sync, ms); });
  });
  sync();
})();`;

// Narrow-screen sidebar: collapse after a session becomes selected.
function sidebarCollapseScript(breakpoint) {
  return `(function () {
  var NARROW = ${breakpoint};
  function isNarrow() { return window.innerWidth < NARROW; }
  function isCollapsed() { return !!document.querySelector('[data-sidebar-collapsed]'); }
  function collapseSidebar() {
    if (isCollapsed()) return;
    var toggle = document.querySelector('.hHd-Xa_toggle');
    if (toggle) toggle.click();
  }
  function scheduleCollapse() {
    if (!isNarrow()) return;
    setTimeout(collapseSidebar, 300);
    setTimeout(function () { if (!isCollapsed()) collapseSidebar(); }, 700);
  }
  function start() {
    if (!document.body) return;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type !== 'attributes' || m.attributeName !== 'aria-selected') continue;
        var el = m.target;
        var key = el && el.getAttribute ? el.getAttribute('data-row-key') : null;
        if (key && key.indexOf('session:') === 0 && el.getAttribute('aria-selected') === 'true') {
          scheduleCollapse();
          return;
        }
      }
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();`;
}

// Touch devices: native HTML5 drag-and-drop is broken and on iOS it also makes
// the first tap on a session row fail to fire click. Strip draggable on touch.
const touchDragFixScript = `(function () {
  var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (!isTouch) return;
  function strip() {
    var els = document.querySelectorAll('[draggable="true"]');
    for (var i = 0; i < els.length; i++) els[i].setAttribute('draggable', 'false');
  }
  function start() {
    strip();
    var observer = new MutationObserver(strip);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['draggable'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();`;

// Tap-to-click: on touch the first tap on a session row can swallow the native
// click. Detect whether a real click fires within a short window; if not, force
// one so a single tap selects with minimal added latency.
function tapToClickScript(delay) {
  return `(function () {
  var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (!isTouch) return;
  var sx = 0, sy = 0;
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'touch') return;
    sx = e.clientX; sy = e.clientY;
  }, { passive: true });
  document.addEventListener('pointerup', function (e) {
    if (e.pointerType !== 'touch') return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (dx * dx + dy * dy > 144) return;
    var el = e.target;
    var row = el && typeof el.closest === 'function' ? el.closest('[data-row-key^="session:"]') : null;
    if (!row) return;
    if (el.closest && el.closest('button')) return;
    var clicked = false;
    function mark() { clicked = true; }
    row.addEventListener('click', mark, { once: true, capture: true });
    setTimeout(function () {
      row.removeEventListener('click', mark, { capture: true });
      if (!clicked) row.click();
    }, ${delay});
  }, { passive: true });
})();`;
}

// GPU-accelerated slide+fade for the sidebar collapse/expand. Disable the janky
// grid-width animation (grid-template-columns reflows every frame on mobile).
function mobileCss(slide) {
  return `@media (max-width: 1024px) {
  input, textarea, select { font-size: 16px !important; }
  [data-row-key^="session:"], [data-row-key^="workspace:"] { -webkit-user-drag: none; }
  .pI_x6G_frame[data-animating] { transition: none !important; }
  .hHd-Xa_fading > * {
    opacity: 0 !important;
    transform: translateX(-${slide}px) !important;
    transition: opacity 0.2s ease, transform 0.2s ease !important;
  }
  .hHd-Xa_wide { animation: dshMobileSidebarIn 0.22s ease !important; }
  @keyframes dshMobileSidebarIn {
    from { opacity: 0; transform: translateX(-${slide}px); }
    to   { opacity: 1; transform: translateX(0); }
  }
}`;
}

export function apply(ctx, config) {
  if (!config.enabled) return;
  ctx.on("webserver/index-inject", (table) => {
    table.push({ kind: "style", text: mobileCss(config.slideDistancePx) });
    table.push({ kind: "script", placement: "head", text: viewportScript });
    table.push({ kind: "script", placement: "head", text: iosKeyboardScript });
    table.push({ kind: "script", placement: "head", text: sidebarCollapseScript(config.narrowBreakpoint) });
    table.push({ kind: "script", placement: "head", text: touchDragFixScript });
    table.push({ kind: "script", placement: "head", text: tapToClickScript(config.tapClickDelayMs) });
  });
}
