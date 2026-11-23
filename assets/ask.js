/* ask.js — "Ask Claude about this page" launcher.
 *
 * No backend, no API key. The reader types a question; we open a new claude.ai
 * chat pre-filled with this page's URL + the question, and ask Claude to read the
 * page AND the sources it cites (papers, commit-pinned code links) before answering.
 *
 * Bilingual (follows data-lang / lang), theme-matched.
 * Loaded automatically by i18n.js on every page that links it, or directly via
 * <script src="…/assets/ask.js" defer>.
 */
(function () {
  if (window.__askAiMounted) return;
  window.__askAiMounted = true;

  var CLAUDE_NEW = "https://claude.ai/new?q=";

  function ko() {
    var d = document.documentElement;
    return (d.getAttribute("data-lang") || d.getAttribute("lang") || "").slice(0, 2) === "ko";
  }
  function t(en, k) { return ko() ? k : en; }

  function buildPrompt(q) {
    var url = location.href.split("#")[0];
    var title = document.title || "";
    if (ko()) {
      return [
        "아래 페이지를 먼저 읽고 질문에 답해 줘.",
        "페이지: " + url + (title ? " (" + title + ")" : ""),
        "",
        "규칙:",
        "- 페이지 본문뿐 아니라 페이지가 인용한 출처(논문, 커밋 고정 코드 링크 등)도 직접 열어 보고 답해.",
        "- 답의 근거가 되는 출처 링크를 함께 적어 줘.",
        "- 페이지나 출처로 확인되지 않는 내용은 '출처 미확인 — 추정'이라고 밝혀 줘.",
        "",
        "질문: " + q
      ].join("\n");
    }
    return [
      "Read the page below first, then answer my question.",
      "Page: " + url + (title ? " (" + title + ")" : ""),
      "",
      "Rules:",
      "- Use not only the page text but also the sources it cites (papers, commit-pinned code links); open them.",
      "- Cite the source links that support your answer.",
      "- If something can't be verified from the page or its sources, say it's an unverified guess.",
      "",
      "Question: " + q
    ].join("\n");
  }

  var css =
    ".askai-fab{position:fixed;right:20px;bottom:20px;z-index:9998;display:inline-flex;align-items:center;gap:8px;" +
      "padding:13px 20px;border-radius:999px;border:1px solid var(--line,#e7e2d6);cursor:pointer;" +
      "background:var(--ink,#1f1e1b);color:var(--bg,#faf9f5);font:600 15px/1 -apple-system,'Apple SD Gothic Neo',sans-serif;" +
      "box-shadow:0 6px 22px rgba(0,0,0,.20)}" +
    ".askai-fab:hover{transform:translateY(-1px)}" +
    ".askai-panel{position:fixed;right:18px;bottom:76px;z-index:9999;width:min(400px,calc(100vw - 36px));display:none;" +
      "flex-direction:column;gap:10px;padding:14px;background:var(--card,#fff);color:var(--ink,#1f1e1b);" +
      "border:1px solid var(--line,#e7e2d6);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.22);" +
      "font:14px/1.55 -apple-system,'Apple SD Gothic Neo',sans-serif}" +
    ".askai-panel.open{display:flex}" +
    ".askai-hd{display:flex;align-items:center;gap:8px}" +
    ".askai-hd b{margin-right:auto;font-size:14px}" +
    ".askai-hd button{cursor:pointer;color:var(--muted,#86807a);background:none;border:none;font-size:16px;line-height:1}" +
    ".askai-note{margin:0;font-size:12px;color:var(--muted,#86807a)}" +
    ".askai-ta{width:100%;box-sizing:border-box;min-height:84px;resize:vertical;padding:9px 11px;border-radius:10px;" +
      "border:1px solid var(--line,#e7e2d6);background:var(--bg,#faf9f5);color:var(--ink,#1f1e1b);font:inherit}" +
    ".askai-go{align-self:flex-end;cursor:pointer;padding:8px 16px;border-radius:999px;border:none;" +
      "background:var(--ink,#1f1e1b);color:var(--bg,#faf9f5);font:600 13px/1 -apple-system,'Apple SD Gothic Neo',sans-serif}" +
    ".askai-go:disabled{opacity:.4;cursor:default}";
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var fab = document.createElement("button");
  fab.type = "button";
  fab.className = "askai-fab";

  var panel = document.createElement("div");
  panel.className = "askai-panel";
  panel.setAttribute("role", "dialog");
  panel.innerHTML =
    '<div class="askai-hd"><b></b><button type="button" class="askai-x" aria-label="close">✕</button></div>' +
    '<p class="askai-note"></p>' +
    '<textarea class="askai-ta"></textarea>' +
    '<button type="button" class="askai-go"></button>';
  var hd = panel.querySelector(".askai-hd b");
  var note = panel.querySelector(".askai-note");
  var ta = panel.querySelector(".askai-ta");
  var go = panel.querySelector(".askai-go");

  function label() {
    fab.textContent = "✦ " + t("Ask Claude", "Claude에게 질문");
    fab.setAttribute("aria-label", fab.textContent);
    hd.textContent = t("Ask Claude about this page", "이 페이지에 대해 Claude에게 질문");
    note.textContent = t(
      "Opens claude.ai in a new tab with this page's link and your question. Claude reads the page and its cited sources.",
      "새 탭에서 claude.ai를 열고 이 페이지 링크와 질문을 넘깁니다. Claude가 페이지와 인용된 출처를 읽고 답합니다.");
    ta.placeholder = t("e.g. Why divide by num_layers?", "예: 왜 num_layers로 한 번 더 나누나요?");
    go.textContent = t("Open in Claude ↗", "Claude에서 열기 ↗");
    go.disabled = !ta.value.trim();
  }

  function send() {
    var q = ta.value.trim();
    if (!q) return;
    window.open(CLAUDE_NEW + encodeURIComponent(buildPrompt(q)), "_blank", "noopener");
    ta.value = "";
    label();
    panel.classList.remove("open");
  }

  fab.addEventListener("click", function () {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) ta.focus();
  });
  panel.querySelector(".askai-x").addEventListener("click", function () { panel.classList.remove("open"); });
  ta.addEventListener("input", function () { go.disabled = !ta.value.trim(); });
  ta.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    if (e.key === "Escape") panel.classList.remove("open");
  });
  go.addEventListener("click", send);

  function mount() { label(); document.body.appendChild(fab); document.body.appendChild(panel); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ["data-lang", "lang"] });
})();
