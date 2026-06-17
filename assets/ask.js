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
  // Default "My Claude bot" endpoint — a URL is NOT a secret, so it's fine to bake.
  // No token is baked: the bot server gates by Origin allowlist + rate limit instead
  // (a client-side token can't be hidden, so it wouldn't add real security anyway).
  var DEFAULT_BOT_URL = "https://askbot.ce.moreh.dev/ask";

  function ko() { var d = document.documentElement; return (d.getAttribute("data-lang") || d.getAttribute("lang") || "").slice(0, 2) === "ko"; }
  function t(en, k) { return ko() ? k : en; }
  /* i18n registry — labels re-apply when the site EN/KO toggle flips data-lang,
     so the widget chrome follows the toggle instead of freezing at mount time. */
  var i18nApply = [];
  function reg(fn) { fn(); i18nApply.push(fn); return fn; }
  function tsp(en, k) { var s = document.createElement("span"); reg(function () { s.textContent = t(en, k); }); return s; }
  function tat(node, attr, en, k) { reg(function () { node.setAttribute(attr, t(en, k)); }); return node; }
  function relang() { i18nApply.forEach(function (fn) { fn(); }); }
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
    groq: {
      label: "Groq (free)",
      models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
      defModel: "llama-3.3-70b-versatile",
      url: function () { return "https://api.groq.com/openai/v1/chat/completions"; },
      headers: function (key) { return { "content-type": "application/json", "authorization": "Bearer " + key }; },
      body: function (model, sys, msgs) {
        return { model: model, max_tokens: 1500,
          messages: [{ role: "system", content: (typeof sys === "string" ? sys : "") }].concat(msgs) };
      },
      parse: function (d) {
        if (d.error) return { err: d.error.message || JSON.stringify(d.error) };
        var text = "";
        (d.choices || []).forEach(function (c) { if (c.message && c.message.content) text += c.message.content; });
        return { text: text, cites: [] };
      }
    },
    claude: {
      label: "Claude",
      models: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-8"],
      defModel: "claude-haiku-4-5-20251001",
      url: function () { return "https://api.anthropic.com/v1/messages"; },
      headers: function (key) {
        var h = { "content-type": "application/json", "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true" };
        // `claude setup-token` issues an OAuth token (sk-ant-oat…) → Bearer auth,
        // not x-api-key. A normal Console key (sk-ant-api…) uses x-api-key.
        if (/^sk-ant-oat/.test(key)) { h["authorization"] = "Bearer " + key; h["anthropic-beta"] = "oauth-2025-04-20"; }
        else { h["x-api-key"] = key; }
        return h;
      },
      body: function (model, sys, msgs, web) {
        var b = { model: model, max_tokens: 1500, system: sys,
          messages: msgs.map(function (m) { return { role: m.role, content: m.content }; }) };
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
      body: function (model, sys, msgs, web) {
        var b = { model: model, instructions: sys,
          input: msgs.map(function (m) { return { role: m.role, content: m.content }; }) };
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
      body: function (model, sys, msgs, web) {
        var b = { systemInstruction: { parts: [{ text: sys }] },
          contents: msgs.map(function (m) { return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }; }) };
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
    label: "Proxy (your API key)", models: PROVIDERS.claude.models, defModel: PROVIDERS.claude.defModel, needsUrl: true,
    url: function () { return lsget("ask-ai-url-proxy", ""); },
    headers: function (key) { var h = { "content-type": "application/json" }; if (key) h["x-access-token"] = key; return h; },
    body: PROVIDERS.claude.body, parse: PROVIDERS.claude.parse
  };
  /* Your own Claude Agent SDK bot (uses a Claude subscription via the local
     `claude` login / setup-token — the same pattern as a Claude-Code/Agent-SDK
     Slack bot). The bot server (assets/ask-bot-server/server.py) exposes /ask
     and returns {answer, sources}. Browser holds only an optional access token. */
  PROVIDERS.bot = {
    label: "My Claude bot (Agent SDK)", needsUrl: true,
    // Fallback list (gateway-served, claude-moreh-* = local vLLM, no Anthropic burn);
    // the live list is fetched from <bot>/models and replaces these in the dropdown.
    models: ["claude-moreh-Qwen3.6-27B", "claude-moreh-gemma-4-31B-it", "claude-moreh-DeepSeek-V4-Flash",
      "claude-moreh-deepseek/deepseek-v4-pro", "claude-moreh-xiaomi/mimo-v2.5-pro", "claude-moreh-z-ai/glm-5.1"],
    // Claude cloud models stay available too (routed via the gateway → Anthropic = subscription).
    cloudModels: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    defModel: "claude-moreh-Qwen3.6-27B",
    url: function () {
      var u = (lsget("ask-ai-url-bot", "") || DEFAULT_BOT_URL).trim().replace(/\/+$/, "");
      return /\/ask$/.test(u) ? u : u + "/ask";   // default baked in; /ask appended if missing
    },
    headers: function (key) { var h = { "content-type": "application/json" }; if (key) h["x-access-token"] = key; return h; },
    body: function (model, sys, msgs, web) {
      var q = msgs.length === 1 ? msgs[0].content
        : msgs.map(function (m) { return (m.role === "user" ? "User: " : "Assistant: ") + m.content; }).join("\n\n");
      return { model: model, system: (typeof sys === "string" ? sys : ""), question: q, messages: msgs, web: !!web,
        edit: lsget("ask-ai-edit", "") === "1",   // edit-mode checkbox (honored only by a local ALLOW_EDITS bot)
        page_url: location.pathname };             // lets the bot find the page's source file
    },
    parse: function (d) {
      if (d.error) return { err: (d.error.message || d.error) };
      return { text: d.answer || "", cites: (d.sources || []) };
    },
    // The deployed bot is TWO-STEP (the public edge caps responses at ~4s):
    //   POST /ask -> {id}      then  GET /result?id=.. -> {status: pending|done|error}
    // send() handles both that and a synchronous {answer} server, returning {text,cites}.
    send: function (ctx) {
      var prov = this, headers = prov.headers(ctx.key), askUrl = prov.url();
      var resBase = askUrl.replace(/\/ask$/, "/result");
      return fetch(askUrl, { method: "POST", headers: headers, body: JSON.stringify(prov.body(ctx.model, ctx.sys, ctx.convo, ctx.web)) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) throw new Error(d.error.message || d.error);
          if (d.answer != null) return { text: d.answer, cites: d.sources || [] };   // synchronous server
          if (!d.id) throw new Error("no job id from bot");
          return new Promise(function (resolve, reject) {                              // poll /result
            var tries = 0, MAX = 360, IVL = 1000;                                      // ~360 x 1s ≈ 6 min
            (function poll() {
              if (ctx.alive && !ctx.alive()) { resolve({ cancelled: true }); return; } // stopped/superseded — quit polling
              tries++;
              fetch(resBase + "?id=" + encodeURIComponent(d.id), { headers: headers })
                .then(function (r) { return r.json(); })
                .then(function (j) {
                  if (j.status === "done") resolve({ text: j.answer || "", cites: j.sources || [] });
                  else if (j.status === "error") reject(new Error(j.error || "bot error"));
                  else if (tries >= MAX) reject(new Error("timeout waiting for the bot"));
                  else { if ((j.partial || j.thinking) && ctx.onProgress) ctx.onProgress(j.partial || "", j.thinking || ""); setTimeout(poll, IVL); }  // stream partial answer + thinking
                })
                .catch(function (e) { if (tries >= MAX) reject(e); else setTimeout(poll, IVL); });
            })();
          });
        });
    }
  };
  function curProv() { var p = lsget(LS_PROV, "bot"); return PROVIDERS[p] ? p : "bot"; }

  /* ---------------- styles ---------------- */
  var css = "" +
    ".askai-fab{position:fixed;right:20px;bottom:20px;z-index:9998;display:inline-flex;align-items:center;gap:8px;" +
      "padding:15px 24px;border-radius:999px;border:1px solid var(--line,#e7e2d6);cursor:pointer;" +
      "background:var(--ink,#1f1e1b);color:var(--bg,#faf9f5);font:600 16px/1 -apple-system,'Apple SD Gothic Neo',sans-serif;" +
      "box-shadow:0 6px 22px rgba(0,0,0,.20)}" +
    ".askai-fab:hover{transform:translateY(-1px)}" +
    ".askai-panel{position:fixed;right:18px;bottom:70px;z-index:9999;width:min(420px,calc(100vw - 36px));" +
      "max-height:min(640px,calc(100vh - 100px));display:none;flex-direction:column;overflow:hidden;" +
      "background:var(--card,#fff);color:var(--ink,#1f1e1b);border:1px solid var(--line,#e7e2d6);border-radius:14px;" +
      "box-shadow:0 12px 40px rgba(0,0,0,.22);font:14px/1.55 -apple-system,'Apple SD Gothic Neo',sans-serif}" +
    ".askai-panel.open{display:flex}" +
    ".askai-hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line,#e7e2d6)}" +
    ".askai-hdl{display:flex;flex-direction:column;gap:1px;margin-right:auto;min-width:0}" +
    ".askai-hd b{font-size:13.5px}" +
    ".askai-model{font-size:11px;font-weight:400;color:var(--muted,#86807a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".askai-model b{font-weight:600;color:var(--ink,#1f1e1b);font-size:11px}" +
    ".askai-hd button{cursor:pointer;color:var(--muted,#86807a);background:none;border:none;font-size:16px;line-height:1}" +
    ".askai-body{padding:12px 14px;overflow-y:auto;flex:1}" +
    ".askai-thread{display:flex;flex-direction:column;gap:10px}" +
    ".askai-msg{max-width:88%;padding:8px 11px;border-radius:11px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word}" +
    ".askai-u{align-self:flex-end;background:var(--blue-bg,#e6f1fb);color:var(--blue-ink,#0c447c)}" +
    ".askai-b{align-self:flex-start;background:var(--gray-bg,#f1efe8);color:var(--ink,#1f1e1b)}" +
    ".askai-empty{color:var(--muted,#86807a);font-size:12.5px;text-align:center;padding:18px 6px}" +
    ".askai-think{color:var(--muted,#86807a);font-size:12px;font-weight:600;display:block;margin-bottom:4px}" +
    ".askai-reason{color:var(--muted,#86807a);font-size:12px;line-height:1.5;font-style:italic;white-space:pre-wrap;max-height:120px;overflow:hidden}" +
    ".askai-dots{animation:askblink 1.2s ease-in-out infinite;letter-spacing:1px}" +
    ".askai-cursor{display:inline-block;color:var(--muted,#86807a);animation:askblink 1s steps(1) infinite;margin-left:1px}" +
    "@keyframes askblink{50%{opacity:.25}}" +
    "@media(prefers-reduced-motion:reduce){.askai-dots,.askai-cursor{animation:none}}" +
    ".askai-md{white-space:normal}" +
    ".askai-md p{margin:0 0 8px}.askai-md p:last-child{margin-bottom:0}" +
    ".askai-md pre{background:var(--code-bg,#2b2a27);color:var(--code-ink,#f3f1ea);padding:9px 11px;border-radius:8px;overflow-x:auto;margin:6px 0;font:12.5px/1.45 ui-monospace,Menlo,Consolas,monospace}" +
    ".askai-md pre code{background:none;padding:0;font-size:inherit;color:inherit}" +
    ".askai-md code{background:var(--gray-bg,#ece9e0);padding:1px 5px;border-radius:4px;font:.9em ui-monospace,Menlo,Consolas,monospace}" +
    ".askai-md ul,.askai-md ol{margin:4px 0 8px;padding-left:20px}.askai-md li{margin:2px 0}" +
    ".askai-md h4,.askai-md h5,.askai-md h6{margin:8px 0 4px;font-size:13.5px;font-weight:600}" +
    ".askai-md blockquote{margin:6px 0;padding:2px 10px;border-left:3px solid var(--line,#e7e2d6);color:var(--muted,#86807a)}" +
    ".askai-md a{color:var(--blue-ink,#2456b8);text-decoration:underline}.askai-md strong{font-weight:600}" +
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
    ".askai-go.askai-stop{background:var(--red-ink,#b3402e)}" +
    ".askai-divider{align-self:center;font-size:11px;color:var(--muted,#86807a);margin:6px 0;padding:2px 10px;border:1px solid var(--line,#e7e2d6);border-radius:999px;background:var(--gray-bg,#f1efe8)}" +
    ".askai-chk{font-size:12px;color:var(--muted,#86807a);display:flex;align-items:center;gap:5px;cursor:pointer}" +
    ".askai-chks{margin-left:auto;display:flex;gap:12px;align-items:center}" +
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

  /* ---- tiny, dependency-free, XSS-safe Markdown → HTML (for bot answers) ---- */
  function mdEsc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function mdInline(s) {                                   // s is already HTML-escaped
    return s
      .replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function mdToHtml(src) {
    // protect LaTeX math ($$…$$, $…$, \[…\], \(…\)) from markdown mangling; restored at the end for KaTeX
    var math = [];
    var prepped = String(src || "").trim().replace(
      /\$\$[\s\S]+?\$\$|\$[^\n$]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/g,
      function (m) { math.push(m); return "M" + (math.length - 1) + ""; });
    var lines = mdEsc(prepped).replace(/\r\n?/g, "\n").split("\n");
    var out = [], code = null, list = null, listBuf = [], para = [];
    function flushList() { if (list) { out.push("<" + list + ">" + listBuf.join("") + "</" + list + ">"); list = null; listBuf = []; } }
    function flushPara() { if (para.length) { out.push("<p>" + para.map(mdInline).join("<br>") + "</p>"); para = []; } }
    function flushAll() { flushPara(); flushList(); }
    lines.forEach(function (ln) {
      var f = ln.match(/^```(.*)$/);
      if (f) { if (code !== null) { out.push("<pre><code>" + code.join("\n") + "</code></pre>"); code = null; } else { flushAll(); code = []; } return; }
      if (code !== null) { code.push(ln); return; }
      var h = ln.match(/^(#{1,6})\s+(.*)$/);
      if (h) { flushAll(); var lv = Math.min(h[1].length + 2, 6); out.push("<h" + lv + ">" + mdInline(h[2]) + "</h" + lv + ">"); return; }
      var ol = ln.match(/^\s*\d+[.)]\s+(.*)$/), ul = ln.match(/^\s*[-*+]\s+(.*)$/);
      if (ol) { flushPara(); if (list !== "ol") { flushList(); list = "ol"; } listBuf.push("<li>" + mdInline(ol[1]) + "</li>"); return; }
      if (ul) { flushPara(); if (list !== "ul") { flushList(); list = "ul"; } listBuf.push("<li>" + mdInline(ul[1]) + "</li>"); return; }
      var bq = ln.match(/^&gt;\s?(.*)$/);    // '>' was HTML-escaped to '&gt;' above
      if (bq) { flushAll(); out.push("<blockquote>" + mdInline(bq[1]) + "</blockquote>"); return; }
      if (ln.trim() === "") { flushAll(); return; }
      flushList(); para.push(ln);
    });
    if (code !== null) out.push("<pre><code>" + code.join("\n") + "</code></pre>");
    flushAll();
    var html = out.join("");
    if (math.length) html = html.replace(/M(\d+)/g, function (_, i) { return mdEsc(math[+i]); });  // restore LaTeX (HTML-escaped) for KaTeX
    return html;
  }

  /* ---------------- KaTeX (math) — lazy-loaded only when an answer contains LaTeX ---------------- */
  var KX = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/";
  var katexReady = null;   // Promise once loading starts
  function loadCss(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.async = true;
      s.onload = res; s.onerror = function () { rej(new Error("load " + src)); };
      document.head.appendChild(s);
    });
  }
  function ensureKatex() {
    if (katexReady) return katexReady;
    loadCss(KX + "katex.min.css");
    katexReady = loadScript(KX + "katex.min.js")
      .then(function () { return loadScript(KX + "contrib/auto-render.min.js"); });
    return katexReady;
  }
  var MATH_RE = /\$\$[\s\S]+?\$\$|\$[^\n$]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/;
  function typesetMath(elem) {
    if (!elem || !MATH_RE.test(elem.textContent || "")) return;   // no math → skip the network entirely
    ensureKatex().then(function () {
      if (!window.renderMathInElement) return;
      try {
        window.renderMathInElement(elem, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false },
            { left: "$", right: "$", display: false }
          ],
          throwOnError: false, ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"]
        });
      } catch (e) {}
    }, function () {});
  }

  /* ---------------- UI ---------------- */
  var fab = el("button", { class: "askai-fab", type: "button", "aria-label": "Ask AI" }, ["✦ ", tsp("Ask AI", "AI에게 질문")]);
  var thread = el("div", { class: "askai-thread" });
  var errBox = el("div", { class: "askai-err" });
  var CKEY = "askai:convo:" + location.pathname;   // chat history per page (this tab)
  function loadConvo() { try { return JSON.parse(sessionStorage.getItem(CKEY) || "[]"); } catch (e) { return []; } }
  function saveConvo() { try { sessionStorage.setItem(CKEY, JSON.stringify(convo)); } catch (e) {} }
  var convo = loadConvo();
  var askStart = 0;     // ms timestamp of the in-flight request (0 = idle), for the elapsed counter
  var reqSeq = 0;       // bumped on each ask()/stop() — stale callbacks check this and no-op
  var curTick = 0, curPartial = "", curThinking = "", busy = false;   // in-flight state (for Stop)
  function renderThread(pending, partial, thinking) {
    thread.textContent = "";
    if (!convo.length && !pending)
      thread.appendChild(el("div", { class: "askai-empty" }, [t("Ask anything about this page — follow-ups keep context (saved while you're on this page).", "이 페이지에 대해 무엇이든 물어보세요 — 후속 질문은 맥락이 이어집니다(이 페이지에 있는 동안 저장).")]));
    convo.forEach(function (m) {
      if (m.role === "divider") {     // model switch marker (UI-only, not sent to the model)
        thread.appendChild(el("div", { class: "askai-divider" }, ["⇄ " + mlabel(m.from) + " → " + mlabel(m.to)]));
        return;
      }
      var b = el("div", { class: "askai-msg " + (m.role === "user" ? "askai-u" : "askai-b") });
      if (m.role === "user") {
        b.appendChild(document.createTextNode(m.content));
      } else {
        var md = el("div", { class: "askai-md" });
        md.innerHTML = mdToHtml(m.content);     // bot answers render as Markdown
        typesetMath(md);                        // render any LaTeX ($…$, \[…\]) via KaTeX
        b.appendChild(md);
      }
      if (m.role === "assistant" && m.cites && m.cites.length) {
        var s = el("div", { class: "askai-src" }), seen = {};
        m.cites.filter(function (c) { if (seen[c.url]) return false; seen[c.url] = 1; return true; })
          .forEach(function (c, i) {
            if (i === 0) s.appendChild(el("div", null, [t("Sources:", "출처:")]));
            s.appendChild(el("a", { href: c.url, target: "_blank", rel: "noopener" }, ["• " + c.title]));
          });
        b.appendChild(s);
      }
      thread.appendChild(b);
    });
    if (pending) {
      var sec = askStart ? Math.round((Date.now() - askStart) / 1000) : 0;
      var pb = el("div", { class: "askai-msg askai-b" });
      if (partial && partial.trim()) {                       // streaming the answer-so-far
        var pm = el("div", { class: "askai-md" });
        pm.innerHTML = mdToHtml(partial) + '<span class="askai-cursor">▍</span>';
        typesetMath(pm);                        // typeset math in the streaming partial too
        pb.appendChild(pm);
      } else if (thinking && thinking.trim()) {              // reasoning streaming before the answer
        var head = el("div", { class: "askai-think" }, ["💭 " + t("reasoning", "생각하는 중") + (sec ? " · " + sec + "s" : "")]);
        var body = el("div", { class: "askai-reason" });
        var tail = thinking.length > 600 ? "…" + thinking.slice(-600) : thinking;  // show the latest reasoning
        body.textContent = tail;
        body.appendChild(el("span", { class: "askai-cursor" }, ["▍"]));
        pb.appendChild(head); pb.appendChild(body);
      } else {                                               // not started yet: live "thinking (Ns)"
        pb.appendChild(el("span", { class: "askai-think" },
          [t("Thinking", "생각 중") + (sec ? " · " + sec + "s" : "") + " ", el("span", { class: "askai-dots" }, ["•••"])]));
      }
      thread.appendChild(pb);
    }
    thread.scrollTop = thread.scrollHeight;
  }
  var ta = tat(el("textarea", { class: "askai-ta" }), "placeholder", "Ask about this page…", "이 페이지 내용을 물어보세요…");
  var webChk = el("input", { type: "checkbox" });
  webChk.checked = lsget(LS_WEB, "1") !== "0";
  webChk.addEventListener("change", function () { lsset(LS_WEB, webChk.checked ? "1" : "0"); });
  var webLabel = el("label", { class: "askai-chk" }, [webChk, tsp("web search", "웹 검색")]);
  var editChk = el("input", { type: "checkbox" });
  editChk.checked = lsget("ask-ai-edit", "") === "1";
  editChk.addEventListener("change", function () { lsset("ask-ai-edit", editChk.checked ? "1" : "0"); });
  var editLabel = el("label", { class: "askai-chk" }, [editChk, tsp("edit mode", "편집 모드")]);
  tat(editLabel, "title", "Edit this page's HTML (local bot only)", "이 페이지 HTML 편집 (로컬 봇 전용)");
  editLabel.style.display = "none"; // shown only for the bot provider
  var goSpan = el("span", null, [t("Ask", "물어보기")]);   // label managed by applyGoLabel() (state-aware, not auto-tsp)
  var go = el("button", { class: "askai-go", type: "button" }, [goSpan]);

  /* settings */
  var provSel = el("select");
  Object.keys(PROVIDERS).forEach(function (p) {
    var o = el("option", { value: p }, [PROVIDERS[p].label]);
    if (p === curProv()) o.setAttribute("selected", "selected");
    provSel.appendChild(o);
  });
  var keyLabel = el("label", null, [t("API key", "API 키")]);
  var keyInput = el("input", { type: "password", placeholder: "API key" });
  var urlLabel = el("label", null, [tsp("Proxy URL", "프록시 URL")]);
  var urlInput = el("input", { type: "text", placeholder: "https://your-worker.workers.dev" });
  var modelSelect = el("select");
  var modelTag = el("span", { class: "askai-model" });   // shows the active model in the header
  function showModel() {
    var p = curProv(), m = lsget(modelLS(p), "") || PROVIDERS[p].defModel;
    modelTag.innerHTML = "";
    modelTag.appendChild(document.createTextNode(t("model: ", "모델: ")));
    modelTag.appendChild(el("b", null, [mlabel(m)]));
    modelTag.title = PROVIDERS[p].label + " · " + m;
  }
  function mlabel(id) { return String(id).replace(/^claude-moreh-/, ""); }   // prettier dropdown text
  function optFor(m, saved) {                                                 // m: id string or {id,name}
    var id = (typeof m === "string") ? m : m.id, nm = (typeof m === "string") ? mlabel(m) : (m.name || mlabel(m.id));
    var o = el("option", { value: id }, [nm]);
    if (id === saved) o.setAttribute("selected", "selected");
    return o;
  }
  function fillModels(list, saved) {
    modelSelect.innerHTML = "";
    list.forEach(function (m) { modelSelect.appendChild(optFor(m, saved)); });
  }
  // Bot dropdown keeps BOTH: Claude cloud (subscription) and local gateway models (free).
  function fillBotModels(localList, saved) {
    modelSelect.innerHTML = "";
    var gc = el("optgroup", { label: t("Claude — cloud (subscription)", "Claude — 클라우드 (구독)") });
    (PROVIDERS.bot.cloudModels || []).forEach(function (m) { gc.appendChild(optFor(m, saved)); });
    var gl = el("optgroup", { label: t("Local — gateway (free)", "로컬 — 게이트웨이 (무료)") });
    (localList || []).forEach(function (m) { gl.appendChild(optFor(m, saved)); });
    if (gc.children.length) modelSelect.appendChild(gc);
    if (gl.children.length) modelSelect.appendChild(gl);
  }
  function fetchBotModels() {                                                 // live discovery from <bot>/models
    var base = (lsget("ask-ai-url-bot", "") || DEFAULT_BOT_URL).trim().replace(/\/+$/, "").replace(/\/ask$/, "");
    var tok = lsget(keyLS("bot"), "").trim(), h = {}; if (tok) h["x-access-token"] = tok;
    fetch(base + "/models", { headers: h }).then(function (r) { return r.json(); }).then(function (d) {
      if (provSel.value !== "bot" || !d || !d.models || !d.models.length) return;
      fillBotModels(d.models, lsget(modelLS("bot"), "") || PROVIDERS.bot.defModel);
    }).catch(function () {});
  }
  function loadProvFields() {
    var p = provSel.value, needsUrl = !!PROVIDERS[p].needsUrl;
    keyInput.value = lsget(keyLS(p), "");
    var saved = lsget(modelLS(p), "") || PROVIDERS[p].defModel;
    if (p === "bot") fillBotModels(PROVIDERS.bot.models, saved); else fillModels(PROVIDERS[p].models, saved);
    keyLabel.textContent = needsUrl ? t("Access token (optional)", "접근 토큰 (선택)") : t("API key", "API 키");
    urlInput.value = lsget("ask-ai-url-" + p, "") || (p === "bot" ? DEFAULT_BOT_URL : "");
    urlLabel.style.display = urlInput.style.display = needsUrl ? "" : "none";
    editLabel.style.display = (p === "bot") ? "" : "none"; // edit mode only via the local Claude bot
    if (p === "bot") fetchBotModels();                     // refresh local group with the gateway's live models
  }
  provSel.addEventListener("change", function () { lsset(LS_PROV, provSel.value); loadProvFields(); showModel(); });
  loadProvFields();
  var saveBtn = el("button", { class: "askai-go", type: "button" }, [tsp("Save", "저장")]);
  saveBtn.addEventListener("click", function () {
    var p = provSel.value;
    lsset(LS_PROV, p);
    lsset(keyLS(p), keyInput.value.trim());
    lsset(modelLS(p), modelSelect.value);
    if (PROVIDERS[p].needsUrl) lsset("ask-ai-url-" + p, urlInput.value.trim());
    setBox.classList.remove("open"); errBox.textContent = ""; showModel();
  });
  var setBox = el("div", { class: "askai-set" }, [
    el("label", null, [tsp("Provider", "프로바이더")]), provSel,
    urlLabel, urlInput,
    keyLabel, keyInput,
    el("label", null, [tsp("Model", "모델")]), modelSelect,
    el("div", { class: "askai-row" }, [saveBtn]),
    el("div", { class: "askai-note" }, [tsp("Key/token stored only in this browser (localStorage), sent only to the provider or your proxy. Web search is billed per use.",
      "키/토큰은 이 브라우저(localStorage)에만 저장되고 프로바이더(또는 내 프록시)로만 전송됩니다. 웹 검색은 사용량만큼 과금됩니다.")])
  ]);

  var gear = tat(el("button", { type: "button" }, ["⚙"]), "title", "Settings", "설정");
  gear.addEventListener("click", function () { setBox.classList.toggle("open"); });
  var clearBtn = tat(el("button", { type: "button" }, ["🗑"]), "title", "New chat (clear history)", "새 대화 (기록 지우기)");
  clearBtn.addEventListener("click", function () {
    if (busy) { reqSeq++; clearInterval(curTick); askStart = 0; setIdle(); }   // cancel any in-flight request
    convo = []; curPartial = ""; curThinking = ""; saveConvo(); errBox.textContent = ""; renderThread(false);
  });
  var closeBtn = tat(el("button", { type: "button", "aria-label": "Minimize" }, ["—"]), "title", "Minimize (keeps the chat)", "최소화 (대화 유지)");
  closeBtn.addEventListener("click", function () { panel.classList.remove("open"); });

  var panel = el("div", { class: "askai-panel" }, [
    el("div", { class: "askai-hd" }, [
      el("div", { class: "askai-hdl" }, [el("b", null, [tsp("Ask about this page", "이 페이지에 대해 질문")]), modelTag]),
      clearBtn, gear, closeBtn]),
    setBox,
    el("div", { class: "askai-body" }, [thread, errBox]),
    el("div", { class: "askai-foot" }, [ta,
      el("div", { class: "askai-row" }, [go, el("div", { class: "askai-chks" }, [webLabel, editLabel])])])
  ]);

  fab.addEventListener("click", function () {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
      var p = curProv();
      if (PROVIDERS[p].needsUrl ? !PROVIDERS[p].url() : !lsget(keyLS(p), "")) setBox.classList.add("open");
      showModel();
      renderThread(false);
      ta.focus();
    }
  });

  function applyGoLabel() { goSpan.textContent = busy ? t("Stop", "중단") : t("Ask", "물어보기"); }   // state + lang aware
  function setBusy() { busy = true; go.classList.add("askai-stop"); applyGoLabel(); }
  function setIdle() { busy = false; go.classList.remove("askai-stop"); applyGoLabel(); }
  function stop() {                                   // abandon the in-flight generation
    if (!busy) return;
    reqSeq++;                                         // invalidate its callbacks + stop polling
    clearInterval(curTick); askStart = 0;
    if (curPartial && curPartial.trim())             // keep what was generated so far
      { convo.push({ role: "assistant", content: curPartial.trim() + "\n\n— " + t("(stopped)", "(중단됨)"), cites: [] }); saveConvo(); }
    curPartial = ""; curThinking = ""; setIdle(); renderThread(false);
  }
  function ask() {
    if (busy) return;                                 // locked while generating — use Stop first
    var p = curProv(), prov = PROVIDERS[p];
    var key = lsget(keyLS(p), "").trim();
    var model = lsget(modelLS(p), "").trim() || prov.defModel;
    var q = ta.value.trim();
    errBox.textContent = "";
    if (prov.needsUrl) {
      if (!prov.url()) { setBox.classList.add("open"); errBox.textContent = t("Set the server URL first.", "먼저 서버 URL을 입력하세요."); return; }
    } else if (!key) {
      setBox.classList.add("open"); errBox.textContent = t("Enter your API key first.", "먼저 API 키를 입력하세요."); return;
    }
    if (!q) return;

    // model-switch divider: if the model changed since the last question, mark it in the thread
    var prevModel = null;
    for (var i = convo.length - 1; i >= 0; i--) { if (convo[i].role === "user" && convo[i].model) { prevModel = convo[i].model; break; } }
    if (prevModel && prevModel !== model) convo.push({ role: "divider", from: prevModel, to: model });

    convo.push({ role: "user", content: q, model: model }); saveConvo(); ta.value = "";
    var myReq = ++reqSeq;                              // this generation's token
    askStart = Date.now(); curPartial = ""; curThinking = "";
    curTick = setInterval(function () { if (myReq === reqSeq) renderThread(true, curPartial, curThinking); }, 1000);
    renderThread(true, curPartial, curThinking);
    setBusy();

    var sys = "You are a study assistant embedded in a technical blog page. The reader is viewing the page whose text is given below. " +
      "This is a multi-turn conversation — use the prior turns as context. Prefer and ground your answer in the PAGE CONTENT. " +
      "If the page does not cover it, or the question needs current/external/broader information, use web search and cite sources. " +
      "Be concise and clear. Answer in " + (ko() ? "Korean." : "English.") +
      " If asked which model or LLM you are, answer honestly that you are being served as '" + model + "'." +
      "\n\n=== PAGE CONTENT ===\n" + pageText();

    var sendConvo = convo.filter(function (m) { return m.role === "user" || m.role === "assistant"; });  // drop dividers
    var run = prov.send
      ? prov.send({ model: model, key: key, sys: sys, convo: sendConvo, web: webChk.checked,
          alive: function () { return myReq === reqSeq; },                                  // poll stops when superseded/stopped
          onProgress: function (pp, th) { if (myReq !== reqSeq) return; curPartial = pp; curThinking = th || ""; renderThread(true, curPartial, curThinking); } })
      : fetch(prov.url(model, key), {
          method: "POST", headers: prov.headers(key), body: JSON.stringify(prov.body(model, sys, sendConvo, webChk.checked))
        }).then(function (r) { return r.json(); }).then(function (d) {
          var out = prov.parse(d);
          if (out.err) throw new Error(out.err);
          return out;
        });
    run.then(function (out) {
      if (myReq !== reqSeq) return;                   // stale (stopped / superseded) — ignore
      if (out && out.cancelled) return;
      convo.push({ role: "assistant", content: out.text || t("(no answer)", "(응답 없음)"), cites: out.cites || [] });
      saveConvo(); renderThread(false);
    }).catch(function (e) {
      if (myReq !== reqSeq) return;
      var msg = (e && e.message ? e.message : String(e));
      if (/unauthorized|401/i.test(msg)) {
        setBox.classList.add("open");
        errBox.textContent = t("Enter your access token in settings (⚙).", "설정(⚙)에서 접근 토큰을 입력하세요.");
      } else {
        errBox.textContent = t("Request failed: ", "요청 실패: ") + msg +
          t("  (check URL / key / model / network)", "  (URL·키·모델·네트워크 확인)");
      }
      renderThread(false);
    }).then(function () { if (myReq !== reqSeq) return; clearInterval(curTick); askStart = 0; setIdle(); });
  }
  go.addEventListener("click", function () { busy ? stop() : ask(); });
  ta.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!busy) ask(); }  // locked while generating
  });

  function mount() { document.body.appendChild(fab); document.body.appendChild(panel); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  // Follow the site EN/KO toggle: when i18n.js flips data-lang, re-apply every
  // registered label, refresh the provider fields, and re-render the thread.
  new MutationObserver(function () {
    relang();
    loadProvFields();              // keyLabel + any per-provider text in current lang
    showModel();                   // "model:" label in current lang
    applyGoLabel();   // keep Stop/Ask label correct (and in the new language) during generation
    renderThread(false);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-lang", "lang"] });
})();
