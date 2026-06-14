(function () {
  var KEY = "site-lang";
  var DEFAULT = "en";
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  var lang = (saved === "ko" || saved === "en") ? saved : DEFAULT;
  document.documentElement.setAttribute("data-lang", lang);
  document.documentElement.setAttribute("lang", lang);

  function mountToggle() {
    if (document.querySelector(".lang-toggle")) return;
    var wrap = document.createElement("div");
    wrap.className = "lang-toggle";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Language");
    ["en", "ko"].forEach(function (code) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = code.toUpperCase();
      b.setAttribute("data-set", code);
      if (code === document.documentElement.getAttribute("data-lang")) b.classList.add("active");
      b.addEventListener("click", function () {
        var next = b.getAttribute("data-set");
        document.documentElement.setAttribute("data-lang", next);
        document.documentElement.setAttribute("lang", next);
        try { localStorage.setItem(KEY, next); } catch (e) {}
        wrap.querySelectorAll("button").forEach(function (x) {
          x.classList.toggle("active", x.getAttribute("data-set") === next);
        });
      });
      wrap.appendChild(b);
    });
    document.body.appendChild(wrap);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToggle);
  } else {
    mountToggle();
  }
})();

/* Load the "Ask about this page" AI widget from the same assets dir. */
(function () {
  var s = document.currentScript;
  if (!s) {
    var ss = document.getElementsByTagName("script");
    for (var i = 0; i < ss.length; i++) { if (/i18n\.js(\?|$)/.test(ss[i].src)) { s = ss[i]; break; } }
  }
  if (!s || !s.src) return;
  var url = s.src.replace(/i18n\.js(\?.*)?$/, "ask.js");
  var a = document.createElement("script");
  a.src = url; a.defer = true;
  document.head.appendChild(a);
})();
