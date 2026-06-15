/* ask.js — BYO-key "Ask about this page" AI widget (multi-provider).
 *
 * Static-site friendly: no backend. The reader supplies their own API key,
 * stored ONLY in their browser (localStorage), sent ONLY to the provider.
 * Grounds answers in the current page text (.wrap); can use the provider's
 * built-in web search. Bilingual (follows data-lang), theme-matched.
 *
 * Providers: Claude (Anthropic), OpenAI, Gemini (Google) — switch in settings.
 * Loaded automatically by i18n.js on every page that links it.
 */
(function () {
  if (window.__askAiMounted) return;
  window.__askAiMounted = true;

  var LS_PROV = "ask-ai-provider";
  var LS_WEB = "ask-ai-web";
  var keyLS = function (p) { return "ask-ai-key-" + p; };
  var modelLS = function (p) { return "ask-ai-model-" + p; };

  function ko() { return document.documentElement.getAttribute("data-lang") === "ko"; }
  function t(en, k) { return ko() ? k : en; }
  function lsget(k, d) { try { return localStorage.getItem(k) || d || ""; } catch (e) { return d || ""; } }
  function lsset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var a in attrs) {
      if (a === "class") n.className = attrs[a];
      else if (a === "style") n.style.cssText = attrs[a];
      else n.setAttribute(a, attrs[a]);
    }
    (kids || []).forEach(function (c) { n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }

  /* ---------------- providers ---------------- */
  var PROVIDERS = {
    claude: {
      label: "Claude",
      models: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-8"],
      defModel: "claude-haiku-4-5-20251001",
      url: function () { return "https://api.anthropic.com/v1/messages"; },
      headers: function (key) {
        return { "content-type": "application/json", "x-api-key": key,
          "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
      },
      body: function (model, sys, q, web) {
        var b = { model: model, max_tokens: 1500, system: sys, messages: [{ role: "user", content: q }] };
        if (web) b.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
        return b;
      },
      parse: function (d) {
        if (d.error) return { err: d.error.message || JSON.stringify(d.error) };
        var text = "", cites = [];
        (d.content || []).forEach(function (b) {
          if (b.type === "text") {
            text += b.text;
            (b.citations || []).forEach(function (c) { if (c.url) cites.push({ url: c.url, title: c.title || c.url }); });
          }
        });
        return { text: text, cites: cites };
      }
    },
    openai: {
      label: "OpenAI",
      models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
      defModel: "gpt-4o-mini",
      url: function () { return "https://api.openai.com/v1/responses"; },
      headers: function (key) { return { "content-type": "application/json", "authorization": "Bearer " + key }; },
      body: function (model, sys, q, web) {
        var b = { model: model, instructions: sys, input: q };
        if (web) b.tools = [{ type: "web_search_preview" }];
        return b;
      },
      parse: function (d) {
        if (d.error) return { err: d.error.message || JSON.stringify(d.error) };
        var text = "", cites = [];
        if (typeof d.output_text === "string" && d.output_text) text = d.output_text;
        (d.output || []).forEach(function (item) {
          (item.content || []).forEach(function (c) {
            if (c.type === "output_text") {
              if (!text) text += c.text || "";
              (c.annotations || []).forEach(function (a) {
                if (a.url) cites.push({ url: a.url, title: a.title || a.url });
              });
            }
          });
        });
        return { text: text, cites: cites };
      }
    },
    gemini: {
      label: "Gemini",
      models: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
      defModel: "gemini-2.0-flash",
      url: function (model, key) {
        return "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) +
          ":generateContent?key=" + encodeURIComponent(key);
      },
      headers: function () { return { "content-type": "application/json" }; },
      body: function (model, sys, q, web) {
        var b = { systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: "user", parts: [{ text: q }] }] };
        if (web) b.tools = [{ google_search: {} }];
        return b;
      },
      parse: function (d) {
        if (d.error) return { err: (d.error.message || JSON.stringify(d.error)) };
        var text = "", cites = [], cand = (d.candidates || [])[0];
        if (cand && cand.content && cand.content.parts) {
          cand.content.parts.forEach(function (p) { if (p.text) text += p.text; });
        }
        if (cand && cand.groundingMetadata && cand.groundingMetadata.groundingChunks) {
          cand.groundingMetadata.groundingChunks.forEach(function (g) {
            if (g.web && g.web.uri) cites.push({ url: g.web.uri, title: g.web.title || g.web.uri });
          });
        }
        return { text: text, cites: cites };
      }
    }
  };
  /* Proxy mode: browser holds NO provider key — only your server's access token.
     Your server (e.g. a Cloudflare Worker) holds the real Anthropic key and
     forwards the Claude-shaped body to api.anthropic.com. */
  PROVIDERS.proxy = {
    label: "Proxy (your server)", models: PROVIDERS.claude.models, defModel: PROVIDERS.claude.defModel, needsUrl: true,
    url: function () { return lsget("ask-ai-proxy-url", ""); },
    headers: function (key) { var h = { "content-type": "application/json" }; if (key) h["x-access-token"] = key; return h; },
    body: PROVIDERS.claude.body, parse: PROVIDERS.claude.parse
  };
  function curProv() { var p = lsget(LS_PROV, "claude"); return PROVIDERS[p] ? p : "claude"; }

  /* ---------------- styles ---------------- */
  var css = "" +
    ".askai-fab{position:fixed;right:18px;bottom:18px;z-index:9998;display:inline-flex;align-items:center;gap:7px;" +
      "padding:10px 15px;border-radius:999px;border:1px solid var(--line,#e7e2d6);cursor:pointer;" +
      "background:var(--ink,#1f1e1b);color:var(--bg,#faf9f5);font:600 13px/1 -apple-system,'Apple SD Gothic Neo',sans-serif;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.16)}" +
    ".askai-fab:hover{transform:translateY(-1px)}" +
    ".askai-panel{position:fixed;right:18px;bottom:70px;z-index:9999;width:min(420px,calc(100vw - 36px));" +
      "max-height:min(640px,calc(100vh - 100px));display:none;flex-direction:column;overflow:hidden;" +
      "background:var(--card,#fff);color:var(--ink,#1f1e1b);border:1px solid var(--line,#e7e2d6);border-radius:14px;" +
      "box-shadow:0 12px 40px rgba(0,0,0,.22);font:14px/1.55 -apple-system,'Apple SD Gothic Neo',sans-serif}" +
    ".askai-panel.open{display:flex}" +
    ".askai-hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line,#e7e2d6)}" +
    ".askai-hd b{font-size:13.5px;margin-right:auto}" +
    ".askai-hd button{cursor:pointer;color:var(--muted,#86807a);background:none;border:none;font-size:16px;line-height:1}" +
    ".askai-body{padding:12px 14px;overflow-y:auto;flex:1}" +
    ".askai-ans{white-space:pre-wrap;font-size:13.5px;margin:4px 0 0}" +
    ".askai-ans code{background:var(--blue-bg,#eef);padding:1px 5px;border-radius:4px;font-size:.9em}" +
    ".askai-src{margin-top:10px;font-size:12px;color:var(--muted,#86807a)}" +
    ".askai-src a{color:var(--blue-ink,#2456b8);display:block;margin:2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".askai-foot{padding:10px 14px;border-top:1px solid var(--line,#e7e2d6)}" +
    ".askai-ta{width:100%;box-sizing:border-box;resize:vertical;min-height:54px;padding:8px 10px;border-radius:8px;" +
      "border:1px solid var(--line,#e7e2d6);background:var(--bg,#faf9f5);color:var(--ink,#1f1e1b);font:13.5px/1.5 inherit}" +
    ".askai-row{display:flex;align-items:center;gap:8px;margin-top:8px}" +
    ".askai-go{flex:0 0 auto;padding:8px 14px;border-radius:8px;border:none;cursor:pointer;" +
      "background:var(--ink,#1f1e1b);color:var(--bg,#faf9f5);font:600 13px inherit}" +
    ".askai-go[disabled]{opacity:.5;cursor:default}" +
    ".askai-chk{font-size:12px;color:var(--muted,#86807a);display:flex;align-items:center;gap:5px;cursor:pointer;margin-left:auto}" +
    ".askai-set{display:none;padding:10px 14px;border-top:1px solid var(--line,#e7e2d6)}" +
    ".askai-set.open{display:block}" +
    ".askai-set label{font-size:11.5px;color:var(--muted,#86807a);display:block;margin-top:8px}" +
    ".askai-set input,.askai-set select{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:7px;" +
      "border:1px solid var(--line,#e7e2d6);background:var(--bg,#faf9f5);color:var(--ink,#1f1e1b);font:12.5px inherit;margin-top:3px}" +
    ".askai-note{font-size:11.5px;color:var(--muted,#86807a);margin:8px 0 0}" +
    ".askai-err{color:var(--red,#c5302a);font-size:12.5px;margin-top:8px}";
  document.head.appendChild(el("style", null, [css]));

  /* ---------------- page context ---------------- */
  function pageText() {
    var root = document.querySelector(".wrap") || document.body;
    var txt = (root.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
    return txt.length > 16000 ? txt.slice(0, 16000) + "\n…(truncated)" : txt;
  }

  /* ---------------- UI ---------------- */
  var fab = el("button", { class: "askai-fab", type: "button", "aria-label": "Ask AI" }, ["✦ ", t("Ask AI", "AI에게 질문")]);
  var ans = el("div", { class: "askai-ans" });
  var src = el("div", { class: "askai-src" });
  var errBox = el("div", { class: "askai-err" });
  var ta = el("textarea", { class: "askai-ta", placeholder: t("Ask about this page…", "이 페이지 내용을 물어보세요…") });
  var webChk = el("input", { type: "checkbox" });
  webChk.checked = lsget(LS_WEB, "1") !== "0";
  webChk.addEventListener("change", function () { lsset(LS_WEB, webChk.checked ? "1" : "0"); });
  var go = el("button", { class: "askai-go", type: "button" }, [t("Ask", "물어보기")]);

  /* settings */
  var provSel = el("select");
  Object.keys(PROVIDERS).forEach(function (p) {
    var o = el("option", { value: p }, [PROVIDERS[p].label]);
    if (p === curProv()) o.setAttribute("selected", "selected");
    provSel.appendChild(o);
  });
  var keyLabel = el("label", null, [t("API key", "API 키")]);
  var keyInput = el("input", { type: "password", placeholder: "API key" });
  var urlLabel = el("label", null, [t("Proxy URL", "프록시 URL")]);
  var urlInput = el("input", { type: "text", placeholder: "https://your-worker.workers.dev" });
  var modelSelect = el("select");
  function loadProvFields() {
    var p = provSel.value, isProxy = (p === "proxy");
    keyInput.value = lsget(keyLS(p), "");
    modelSelect.innerHTML = "";
    var saved = lsget(modelLS(p), "") || PROVIDERS[p].defModel;
    PROVIDERS[p].models.forEach(function (m) {
      var o = el("option", { value: m }, [m]);
      if (m === saved) o.setAttribute("selected", "selected");
      modelSelect.appendChild(o);
    });
    keyLabel.textContent = isProxy ? t("Access token (optional)", "접근 토큰 (선택)") : t("API key", "API 키");
    urlInput.value = lsget("ask-ai-proxy-url", "");
    urlLabel.style.display = urlInput.style.display = isProxy ? "" : "none";
  }
  provSel.addEventListener("change", function () { lsset(LS_PROV, provSel.value); loadProvFields(); });
  loadProvFields();
  var saveBtn = el("button", { class: "askai-go", type: "button" }, [t("Save", "저장")]);
  saveBtn.addEventListener("click", function () {
    var p = provSel.value;
    lsset(LS_PROV, p);
    lsset(keyLS(p), keyInput.value.trim());
    lsset(modelLS(p), modelSelect.value);
    if (p === "proxy") lsset("ask-ai-proxy-url", urlInput.value.trim());
    setBox.classList.remove("open"); errBox.textContent = "";
  });
  var setBox = el("div", { class: "askai-set" }, [
    el("label", null, [t("Provider", "프로바이더")]), provSel,
    urlLabel, urlInput,
    keyLabel, keyInput,
    el("label", null, [t("Model", "모델")]), modelSelect,
    el("div", { class: "askai-row" }, [saveBtn]),
    el("div", { class: "askai-note" }, [t("Key/token stored only in this browser (localStorage), sent only to the provider or your proxy. Web search is billed per use.",
      "키/토큰은 이 브라우저(localStorage)에만 저장되고 프로바이더(또는 내 프록시)로만 전송됩니다. 웹 검색은 사용량만큼 과금됩니다.")])
  ]);

  var gear = el("button", { type: "button", title: t("Settings", "설정") }, ["⚙"]);
  gear.addEventListener("click", function () { setBox.classList.toggle("open"); });
  var closeBtn = el("button", { type: "button", "aria-label": "Close" }, ["×"]);
  closeBtn.addEventListener("click", function () { panel.classList.remove("open"); });

  var panel = el("div", { class: "askai-panel" }, [
    el("div", { class: "askai-hd" }, [el("b", null, [t("Ask about this page", "이 페이지에 대해 질문")]), gear, closeBtn]),
    setBox,
    el("div", { class: "askai-body" }, [ans, src, errBox]),
    el("div", { class: "askai-foot" }, [ta,
      el("div", { class: "askai-row" }, [go, el("label", { class: "askai-chk" }, [webChk, t("web search", "웹 검색")])])])
  ]);

  fab.addEventListener("click", function () {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
      if (!lsget(keyLS(curProv()), "")) setBox.classList.add("open");
      ta.focus();
    }
  });

  function renderCites(cites) {
    src.textContent = "";
    var seen = {};
    cites.filter(function (c) { if (seen[c.url]) return false; seen[c.url] = 1; return true; })
      .forEach(function (c, i) {
        if (i === 0) src.appendChild(el("div", null, [t("Sources:", "출처:")]));
        src.appendChild(el("a", { href: c.url, target: "_blank", rel: "noopener" }, ["• " + c.title]));
      });
  }

  function ask() {
    var p = curProv(), prov = PROVIDERS[p];
    var key = lsget(keyLS(p), "").trim();
    var model = lsget(modelLS(p), "").trim() || prov.defModel;
    var q = ta.value.trim();
    errBox.textContent = "";
    if (!key) { setBox.classList.add("open"); errBox.textContent = t("Enter your API key first.", "먼저 API 키를 입력하세요."); return; }
    if (!q) return;
    go.disabled = true; go.textContent = t("Thinking…", "생각 중…"); ans.textContent = ""; src.textContent = "";

    var sys = "You are a study assistant embedded in a technical blog page. The reader is viewing the page whose text is given below. " +
      "Answer their question. Prefer and ground your answer in the PAGE CONTENT. If the page does not cover it, or the question needs " +
      "current/external/broader information, use web search and cite sources. Be concise and clear. " +
      "Answer in " + (ko() ? "Korean." : "English.") +
      "\n\n=== PAGE CONTENT ===\n" + pageText();

    fetch(prov.url(model, key), {
      method: "POST", headers: prov.headers(key), body: JSON.stringify(prov.body(model, sys, q, webChk.checked))
    }).then(function (r) { return r.json(); }).then(function (d) {
      var out = prov.parse(d);
      if (out.err) { errBox.textContent = out.err; return; }
      ans.textContent = out.text || t("(no answer)", "(응답 없음)");
      renderCites(out.cites || []);
    }).catch(function (e) {
      errBox.textContent = t("Request failed: ", "요청 실패: ") + (e && e.message ? e.message : e) +
        t("  (check key / model / network)", "  (키·모델·네트워크 확인)");
    }).then(function () { go.disabled = false; go.textContent = t("Ask", "물어보기"); });
  }
  go.addEventListener("click", ask);
  ta.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") ask(); });

  function mount() { document.body.appendChild(fab); document.body.appendChild(panel); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
