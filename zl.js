/* Zec Labs kit v2. Load in <head> WITHOUT defer:  <script src="zl.js"></script>
   Set <html data-app="split-it">. Provides window.ZL: toast, confirm, tour, store, copy, icon, apps. */
(function () {
  "use strict";
  var APPS = [
    { id: "split-it", name: "Split It", blurb: "Split costs with friends", repo: "split-it", url: "https://lz-split-it.pages.dev/", accent: "#168A3E", accent2: "#4CD964", ink: "#137A37", on: "#FFFFFF",
      glyph: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="#fff" stroke="none"/>' },
    { id: "streaks", name: "Streaks", blurb: "Build habits that stick", repo: "streaks", url: "https://lz-streaks.pages.dev/", accent: "#F59E0B", accent2: "#FFD60A", ink: "#B45309", on: "#1D1D1F",
      glyph: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.3 1.2-3.8 2.5-5 .3 1.8 1.2 2.8 2.5 3 0-3 .2-5.5 0-8z" fill="rgba(255,255,255,.3)"/>' },
    { id: "resistor-lab", name: "Resistor Lab", blurb: "Electronics calculators", repo: "resistor-lab", url: "https://lz-resistor-lab.pages.dev/", accent: "#7C4DFF", accent2: "#B39DFF", ink: "#6D3FF0", on: "#FFFFFF",
      glyph: '<path d="M2 12h4l1.5-4 3 8 3-8 3 8 1.5-4h4"/>' },
    { id: "plotline", name: "Plotline", blurb: "Graph any function", repo: "plotline", url: "https://lz-plotline.pages.dev/", accent: "#0A6CDF", accent2: "#64B5FF", ink: "#0A5FC4", on: "#FFFFFF",
      glyph: '<path d="M4 4v16h16"/><path d="M6.5 14c2-6 4-6 6 0s4 6 6 0"/>' },
    { id: "plate-math", name: "Plate Math", blurb: "Lift calculator and loader", repo: "plate-math", url: "https://lz-plate-math.pages.dev/", accent: "#E0283E", accent2: "#FF6B7D", ink: "#C81E33", on: "#FFFFFF",
      glyph: '<path d="M2 12h20"/><path d="M6 7.5v9M9 5v14M15 5v14M18 7.5v9" stroke-width="2.6"/>' },
    { id: "interval", name: "Interval", blurb: "Workout and rest timer", repo: "interval", url: "https://lz-interval.pages.dev/", accent: "#0A8A66", accent2: "#34D399", ink: "#087A5A", on: "#FFFFFF",
      glyph: '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V9.5M10 3h4M18.2 6.8l1.4-1.4"/>' },
    { id: "keystroke", name: "Keystroke", blurb: "Typing speed test", repo: "keystroke", url: "https://lz-keystroke.pages.dev/", accent: "#D6246E", accent2: "#FF6FA8", ink: "#BE1D60", on: "#FFFFFF",
      glyph: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M7 10h.01M10 10h.01M13 10h.01M16.5 10h.01M8 14h8"/>' },
    { id: "rewrite", name: "Rewrite", blurb: "AI message rewriter", repo: "rewrite-ai", url: "https://lz-rewrite.pages.dev/", accent: "#5856D6", accent2: "#8E8CFF", ink: "#4F4DC8", on: "#FFFFFF",
      glyph: '<path d="M4 20l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M19.5 14v5M17 16.5h5"/>' },
    { id: "study-buddy", name: "Study Buddy", blurb: "AI notes to quizzes", repo: "study-buddy-ai", url: "https://lz-study-buddy.pages.dev/", accent: "#0B8A96", accent2: "#40C8D6", ink: "#0A7782", on: "#FFFFFF",
      glyph: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v5"/>' },
    { id: "homebase", name: "Homebase", blurb: "Your browser start page", repo: "homebase", url: "https://lz-homebase.pages.dev/", accent: "#FF8A3D", accent2: "#FFB27A", ink: "#C2410C", on: "#1D1D1F",
      glyph: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5M10 20v-5h4v5"/>' }
  ];
  var HOME = { id: "lazarzec", name: "Zec Labs", blurb: "All apps", repo: "lazarzec18.github.io", url: "https://lazarzec.pages.dev/", accent: "#1D1D1F", accent2: "#636366", ink: "#1D1D1F", on: "#FFFFFF",
    glyph: '<path d="M6 5v14h5.5"/><path d="M13 5h6l-6 14h6"/>' };
  var GH = "https://github.com/LAZARZEC18/";
  var root = document.documentElement;
  var appId = root.getAttribute("data-app") || "lazarzec";
  var app = APPS.filter(function (a) { return a.id === appId; })[0] || HOME;

  /* ---- storage (never throws) ---- */
  var store = {
    get: function (k, fb) { try { var v = localStorage.getItem("zl:" + appId + ":" + k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } },
    set: function (k, v) { try { localStorage.setItem("zl:" + appId + ":" + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem("zl:" + appId + ":" + k); } catch (e) {} }
  };
  function gget(k) { try { return localStorage.getItem("zl:" + k); } catch (e) { return null; } }
  function gset(k, v) { try { localStorage.setItem("zl:" + k, v); } catch (e) {} }

  /* ---- accent + theme before first paint ---- */
  root.style.setProperty("--accent", app.accent);
  root.style.setProperty("--accent-2", app.accent2);
  root.style.setProperty("--on-accent", app.on);
  var lightInk = document.createElement("style");
  lightInk.textContent = ":root:not([data-theme=dark]){--accent-ink:" + app.ink + "}@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--accent-ink:" + app.accent2 + "}}";
  document.head.appendChild(lightInk);
  var savedTheme = gget("theme");
  if (savedTheme === "light" || savedTheme === "dark") root.setAttribute("data-theme", savedTheme);
  function isDark() { var t = root.getAttribute("data-theme"); return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; }
  function syncThemeColor() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
    m.content = isDark() ? "#000000" : "#FBFBFD";
  }
  syncThemeColor();

  /* ---- icons ---- */
  function icon(a, extraClass) {
    a = a || app;
    var gid = "zlg-" + a.id + "-" + Math.random().toString(36).slice(2, 7);
    return '<svg class="zl-icon ' + (extraClass || "") + '" viewBox="0 0 64 64" aria-hidden="true">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a.accent2 + '"/><stop offset="1" stop-color="' + a.accent + '"/></linearGradient></defs>' +
      '<path d="M32 0C9.6 0 0 9.6 0 32s9.6 32 32 32 32-9.6 32-32S54.4 0 32 0z" fill="url(#' + gid + ')"/>' +
      '<path d="M32 1C10.4 1 1 10.4 1 32" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.2"/>' +
      '<g transform="translate(14 14) scale(1.5)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + a.glyph + "</g></svg>";
  }
  function faviconUri(a) {
    var svg = icon(a).replace(/class="[^"]*"/, 'xmlns="http://www.w3.org/2000/svg"');
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }
  if (!document.querySelector('link[rel="icon"]')) {
    var l = document.createElement("link"); l.rel = "icon"; l.href = faviconUri(app); document.head.appendChild(l);
  }

  var I = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.3a3 3 0 0 1 5.6 1c0 2-2.8 2.4-2.8 4.2M12 17.5h.01"/></svg>',
    gh: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5M12 7.5h.01"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---- toasts ---- */
  var toastBox;
  function toast(msg, opts) {
    opts = opts || {};
    if (!toastBox) { toastBox = document.createElement("div"); toastBox.className = "zl-toasts"; toastBox.setAttribute("role", "status"); toastBox.setAttribute("aria-live", "polite"); document.body.appendChild(toastBox); }
    var type = opts.type || "good";
    var t = document.createElement("div");
    t.className = "zl-toast " + type;
    t.innerHTML = (type === "bad" ? I.alert : type === "info" ? I.info : I.check) + "<span>" + esc(msg) + "</span>";
    if (opts.action) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = opts.action.label;
      b.onclick = function () { opts.action.fn(); remove(); };
      t.appendChild(b);
    }
    while (toastBox.children.length > 2) toastBox.firstChild.remove();
    toastBox.appendChild(t);
    var timer = setTimeout(remove, opts.duration || (opts.action ? 6000 : 3200));
    function remove() { clearTimeout(timer); if (t.parentNode) t.remove(); }
    return remove;
  }

  /* ---- confirm dialog ---- */
  function confirmDlg(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var d = document.createElement("dialog");
      d.className = "zl-dialog";
      d.innerHTML = '<form method="dialog"><div class="zl-dialog-head"><h2>' + esc(o.title || "Are you sure?") + '</h2></div>' +
        '<div class="zl-dialog-body"><p style="margin:0;color:var(--ink-2)">' + esc(o.body || "") + '</p></div>' +
        '<div class="zl-dialog-foot"><button class="zl-btn zl-btn-secondary" value="cancel">' + esc(o.cancelLabel || "Cancel") + '</button>' +
        '<button class="zl-btn ' + (o.danger ? "zl-btn-danger" : "zl-btn-primary") + '" value="ok">' + esc(o.confirmLabel || "Continue") + "</button></div></form>";
      document.body.appendChild(d);
      d.addEventListener("close", function () { resolve(d.returnValue === "ok"); d.remove(); });
      d.showModal();
      d.querySelector('[value="ok"]').focus();
    });
  }

  /* ---- copy ---- */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    return Promise.resolve(fallback());
    function fallback() {
      var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove(); return ok;
    }
  }

  /* ---- guided tour ---- */
  var tourSteps = null, tourIdx = 0, ring, card, onKey;
  function tour(steps, opts) {
    tourSteps = steps; opts = opts || {};
    if (opts.autoStart !== false && !store.get("toured", false)) {
      // Start once the visitor reaches the app, so the hero is never skipped on first load.
      var started = false;
      var go = function () { if (started) return; started = true; setTimeout(function () { if (!store.get("toured", false) && !card) startTour(); }, opts.delay || 700); };
      var target = document.getElementById("app");
      if (!target || !("IntersectionObserver" in window)) { go(); return; }
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var enough = e.intersectionRect.height >= Math.min(160, innerHeight * 0.2) || e.intersectionRatio >= 0.35;
          if (e.isIntersecting && enough) { io.disconnect(); go(); }
        });
      }, { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.35, 0.5, 0.75, 1] });
      io.observe(target);
    }
  }
  function startTour() {
    if (!tourSteps || !tourSteps.length) { toast("Scroll down to see how it works", { type: "info" }); return; }
    endTour(true);
    tourIdx = 0;
    ring = document.createElement("div"); ring.className = "zl-tour-ring";
    card = document.createElement("div"); card.className = "zl-tour-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-live", "polite");
    document.body.append(ring, card);
    onKey = function (e) { if (e.key === "Escape") endTour(); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    document.addEventListener("keydown", onKey);
    addEventListener("resize", place); addEventListener("scroll", place, { passive: true });
    show();
  }
  function go(d) { var n = tourIdx + d; if (n < 0) return; if (n >= tourSteps.length) { endTour(); toast("You're all set"); return; } tourIdx = n; show(); }
  function show() {
    var s = tourSteps[tourIdx];
    var el = typeof s.el === "string" ? document.querySelector(s.el) : s.el;
    if (s.before) try { s.before(); } catch (e) {}
    card.innerHTML = "<h3>" + esc(s.title) + "</h3><p>" + esc(s.body) + '</p><div class="zl-tour-foot"><span class="zl-tour-count">' + (tourIdx + 1) + " of " + tourSteps.length + "</span>" +
      '<button class="zl-btn zl-btn-ghost zl-btn-sm" data-t="skip">' + (tourIdx === tourSteps.length - 1 ? "Close" : "Skip") + "</button>" +
      (tourIdx > 0 ? '<button class="zl-btn zl-btn-secondary zl-btn-sm" data-t="back">Back</button>' : "") +
      '<button class="zl-btn zl-btn-primary zl-btn-sm" data-t="next">' + (tourIdx === tourSteps.length - 1 ? "Done" : "Next") + "</button></div>";
    card.querySelector('[data-t="next"]').onclick = function () { go(1); };
    card.querySelector('[data-t="skip"]').onclick = function () { endTour(); };
    var bk = card.querySelector('[data-t="back"]'); if (bk) bk.onclick = function () { go(-1); };
    card._el = el;
    if (el) el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setTimeout(place, 350); place();
    card.querySelector('[data-t="next"]').focus({ preventScroll: true });
  }
  function place() {
    if (!card) return;
    var el = card._el, pad = 8, vw = innerWidth, vh = innerHeight;
    if (!el) { ring.style.cssText = "top:50%;left:50%;width:0;height:0"; card.style.top = (vh / 2 - 80) + "px"; card.style.left = Math.max(16, vw / 2 - 170) + "px"; return; }
    var r = el.getBoundingClientRect();
    ring.style.top = (r.top - pad) + "px"; ring.style.left = (r.left - pad) + "px"; ring.style.width = (r.width + pad * 2) + "px"; ring.style.height = (r.height + pad * 2) + "px";
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var top = r.bottom + 16; if (top + ch > vh - 12) top = r.top - ch - 16; if (top < 12) top = Math.min(vh - ch - 12, Math.max(12, r.top + 12));
    var left = Math.min(Math.max(16, r.left + r.width / 2 - cw / 2), vw - cw - 16);
    card.style.top = top + "px"; card.style.left = left + "px";
  }
  function endTour(silent) {
    if (ring) ring.remove(); if (card) card.remove(); ring = card = null;
    if (onKey) document.removeEventListener("keydown", onKey);
    removeEventListener("resize", place); removeEventListener("scroll", place);
    if (!silent) store.set("toured", true);
  }

  /* ---- build chrome ---- */
  function build() {
    syncThemeColor();
    // nav
    var navHost = document.querySelector('[data-zl="nav"]');
    if (navHost) {
      var links = Array.prototype.map.call(document.querySelectorAll("[data-nav]"), function (s) {
        return '<a href="#' + s.id + '">' + esc(s.getAttribute("data-nav")) + "</a>";
      }).join("");
      navHost.outerHTML = '<header class="zl-nav"><div class="zl-wrap">' +
        '<a class="zl-brand" href="' + (app === HOME ? "#top" : HOME.url) + '" aria-label="Zec Labs home">' + icon(HOME) + "</a>" +
        '<a class="zl-brand" href="#top">' + (app === HOME ? "Zec Labs" : esc(app.name)) + "</a>" +
        '<nav class="zl-nav-links" aria-label="On this page">' + links + "</nav>" +
        '<div class="zl-nav-tools">' +
        (app === HOME ? "" : '<button class="zl-iconbtn" type="button" id="zl-help" aria-label="Show me around" data-tip="Show me around">' + I.help + "</button>") +
        '<button class="zl-iconbtn" type="button" id="zl-theme" aria-label="Switch light or dark mode">' + (isDark() ? I.sun : I.moon) + "</button>" +
        '<a class="zl-iconbtn" href="' + GH + app.repo + '" aria-label="View the code on GitHub">' + I.gh + "</a>" +
        '<button class="zl-iconbtn" type="button" id="zl-apps" aria-label="All Zec Labs apps" aria-expanded="false" aria-controls="zl-switcher">' + I.grid + "</button>" +
        "</div></div></header>" +
        '<div class="zl-switcher" id="zl-switcher" role="dialog" aria-label="Zec Labs apps"><h2>Zec Labs apps</h2><div class="zl-switcher-grid">' +
        APPS.map(function (a) { return '<a href="' + a.url + '"' + (a.id === appId ? ' aria-current="page"' : "") + ">" + icon(a) + esc(a.name) + "</a>"; }).join("") +
        '</div><div class="zl-switcher-foot"><a href="' + HOME.url + '">See all projects</a><a href="' + GH + 'LAZARZEC18">GitHub profile</a></div></div>';
      var th = document.getElementById("zl-theme");
      th.onclick = function () {
        var next = isDark() ? "light" : "dark"; root.setAttribute("data-theme", next); gset("theme", next);
        th.innerHTML = isDark() ? I.sun : I.moon; syncThemeColor(); document.dispatchEvent(new CustomEvent("zl:theme", { detail: next }));
      };
      var hp = document.getElementById("zl-help"); if (hp) hp.onclick = startTour;
      var ab = document.getElementById("zl-apps"), sw = document.getElementById("zl-switcher");
      ab.onclick = function (e) { e.stopPropagation(); var o = !sw.hasAttribute("data-open"); sw.toggleAttribute("data-open", o); ab.setAttribute("aria-expanded", o); if (o) sw.querySelector("a").focus(); };
      document.addEventListener("click", function (e) { if (!sw.contains(e.target)) { sw.removeAttribute("data-open"); ab.setAttribute("aria-expanded", "false"); } });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sw.hasAttribute("data-open")) { sw.removeAttribute("data-open"); ab.setAttribute("aria-expanded", "false"); ab.focus(); } });
    }
    // hero icon slots
    Array.prototype.forEach.call(document.querySelectorAll('[data-zl="icon"]'), function (n) {
      var a = APPS.filter(function (x) { return x.id === n.getAttribute("data-id"); })[0] || app;
      n.outerHTML = icon(a);
    });
    // footer
    var foot = document.querySelector('[data-zl="footer"]');
    if (foot) {
      foot.outerHTML = '<footer class="zl-footer"><div class="zl-wrap"><h2>' + (app === HOME ? "All apps" : "More from Zec Labs") + '</h2><div class="zl-footer-apps">' +
        APPS.filter(function (a) { return a.id !== appId; }).map(function (a) {
          return '<a href="' + a.url + '">' + icon(a) + "<span><b>" + esc(a.name) + "</b><small>" + esc(a.blurb) + "</small></span></a>";
        }).join("") +
        '</div><div class="zl-footer-base"><span>Designed and built by Lazar Zec in Perth, Western Australia.</span><span>' +
        '<a href="' + GH + app.repo + '">Source code</a> &nbsp;&nbsp; <a href="' + HOME.url + '">All projects</a> &nbsp;&nbsp; <a href="' + GH + 'LAZARZEC18">GitHub</a></span></div></div></footer>';
    }
    // reveal
    var rv = document.querySelectorAll(".zl-reveal");
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("zl-in"); io.unobserve(e.target); } }); }, { rootMargin: "0px 0px -8% 0px" });
      rv.forEach(function (n) { io.observe(n); });
    } else rv.forEach(function (n) { n.classList.add("zl-in"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();

  window.ZL = { apps: APPS, home: HOME, app: app, icon: icon, faviconUri: faviconUri, toast: toast, confirm: confirmDlg, copy: copy, store: store, tour: tour, startTour: startTour, isDark: isDark, esc: esc, icons: I };
})();
