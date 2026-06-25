---
name: paper-note
description: Summarize an academic paper (arXiv/ar5iv/PDF/URL) into a bilingual study/ HTML "paper note" for the han-oqo.github.io repo. Use whenever the user supplies a paper link or arXiv id and asks to 정리/summarize/write a note. Reads the paper in full section-by-section, follows the fixed 5-part structure, embeds verbatim source quotes with jump-to anchors, explains the math in plain language, finds and code-walks the official repo with commit-pinned permalinks, draws diagrams, cites every external claim, then adds the study/index card and passes tools/check_theme.py.
---

# paper-note — turn a paper into a study/ HTML note

Produce one bilingual (EN/KO) **type-A** page under `study/` that follows this repo's
conventions (see CLAUDE.md §"논문 정리 (paper note) 규약" and §"페이지 타입 A").
Base template to copy: `study/llm-serving-software-aging.html` (hero + TOC + glossary
+ `blockquote.q` + `svg.fig`/`figcap` + `c-*` callouts + `.num` section chips).

## Hard requirements (do not drop any)

1. **Read every paragraph — no abstract-only summaries.** Fetch the full text and walk
   every section AND subsection (background, method, implementation, each results
   subsection, ablations, discussion, limitations/threats, key appendices). Every
   claim-bearing paragraph must be reflected. Confirm you covered all sections before writing.
2. **Fixed 5-part body structure** (h2 + numbered `.num` chip, in this order):
   1. **문제 정의 (Problem)** — the gap/limitation in prior work the paper attacks + the
      background a reader needs + how it differs from related work.
   2. **해결 방법 (Method)** — the authors' approach and design goals.
   3. **구현 방법 (Implementation)** — architecture/system/training details, datasets,
      hyperparameters, setup. Reconstruct config/system tables as HTML tables.
   4. **결과 (Results)** — every results subsection + key numbers; reconstruct the main
      result tables with real numbers; include threats/limitations.
   5. **Discussion** — the paper's conclusions + authors' future work, and (optional) an
      **editor's-note "우리 관점"** `c-purple` callout marked **"편집자 주 — 논문의 주장 아님"**.
3. **Diagrams for readability.** Use inline SVG (theme palette `var(--…)` only) for the
   system/method figure, a judgment/flow, key-number comparisons, etc. Caption every figure
   with `figcap` noting the source (paper Fig./Table number). A few good SVGs > many weak ones.
4. **Verbatim source quotes with jump anchors.** For every key claim/number, put the exact
   English sentence in a `blockquote.q` and in `<cite>` give the §section(·¶) + the arXiv
   HTML anchor link so the reader can jump to it (arXiv anchors: §I→`#S1`, §II-A→`#S2.SS1`,
   §IV-C→`#S4.SS3`). Quotes stay in English (shown in both langs); only commentary is EN/KO.
   Aim for ~8-15 quotes covering the main claims/results.
5. **Cite all external content.** Anything not from the paper carries a source URL (inline
   `a.src` + a Sources section). Mark blogs/vendor numbers as such; separate established
   facts from inferred ones.
6. **Explain the math in plain language.** For every key equation/definition/derivation:
   restate it, define every symbol, give the intuition (what it captures, why it matters),
   and walk any non-obvious step. Don't just paste the formula — make it understandable to
   someone who hasn't read the paper.
7. **Find and code-walk the repo, if any.** Search the paper/abstract/footnotes/project page
   /papers-with-code for an official GitHub repo. If found: shallow-clone it, pin the SHA,
   and add a section with (i) **repo structure** (top dirs/files + roles), (ii) **usage**
   (install + run from the README), (iii) a **code flow** of the core method with GitHub
   **permalinks** pinned to the cloned SHA (`https://github.com/<org>/<repo>/blob/<SHA>/<path>#L<a>-L<b>`)
   + short snippets. If no repo exists, say so explicitly.

## Workflow

1. **Research (fan out).** For a thorough read, launch a research subagent (general-purpose,
   has WebFetch/WebSearch/Bash) — or two if the paper is large (one for full section-by-section
   text + math + verbatim-quote anchors; one for the repo clone + code-flow permalinks). Have it
   return: metadata, section-by-section coverage, the 5-part fill, ~8-15 verbatim quotes with
   `#Sx.SSy` anchors, the math list with plain-language explanations, and the repo code-flow with
   pinned-SHA permalinks. Run independent papers' research concurrently (one agent set each).
2. **Write** `study/<english-slug>.html` from the base template:
   - hero: title + lede + `.meta` badges (arXiv abs link, HTML full-text link, subject·date,
     authors) + `post-meta` with today's date.
   - TOC → glossary (`grid3`+`mini`, 4-6 terms a reader needs) → "한 줄 요약" `c-blue` callout
     → the 5 body sections → Sources section → footer.
   - All visible prose in `<span class="en">…</span><span class="ko">…</span>` pairs; code/flags
     and verbatim quotes stay language-neutral. `<script src="../assets/i18n.js">` at the end.
   - **Keep the paper's TITLE in English in BOTH the en/ko spans.** In the hero `<h1>` and the
     index card `<h2>`, the `<span class="ko">` must show the English title verbatim — do NOT
     translate the paper title to Korean. Only a trailing label localizes ("paper note" →
     "논문 정리"); the lede and body prose still localize normally. (User preference: a paper's
     proper title is its identity; flipping the EN/KO toggle should leave the title English.)
   - Tag classes come from theme.css only; do not inline `.t-*`.
3. **Index card.** Add a card to `study/index.html` (newest first) — tag **`t-blue` "Paper note /
   논문 정리"**, `post-meta` = today's date (created; add `updated` only when later edited per
   CLAUDE.md §작성일/갱신일).
4. **Verify.** Run `python3 tools/check_theme.py` until it passes. Sanity-check: en/ko span
   counts balanced, permalinks pinned to a real SHA, no stray non-ASCII inside Latin words.
5. **Commit/push only when the user asks** (this repo auto-deploys on push to main; the pre-push
   hook re-runs check_theme + the post-meta-bump check). End commit messages with the repo's
   Co-Authored-By line.

## Notes
- Multiple papers in one request → research them concurrently (separate agent sets), write each
  as its own page, batch the check + push.
- This skill is the paper-specific sibling of the general feature/code deep-dive notes
  (e.g. the vLLM DBO / diffusion-LLM notes); both share the type-A template, permalink, diagram,
  and source-citation discipline. The difference here is the fixed 5-part paper structure, the
  verbatim-quote-with-anchor rule, and the plain-language math requirement.
