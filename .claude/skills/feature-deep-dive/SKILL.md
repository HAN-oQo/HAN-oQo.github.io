---
name: feature-deep-dive
description: Research an inference-serving feature, system, or codebase (vLLM / llm-d / SGLang / TRT-LLM / a technique / a repo) and write a bilingual study/ HTML deep-dive note with a code-flow + commit-pinned permalinks, diagrams, and cited sources. Use when the user asks to 조사/분석/deep-dive a serving feature or codebase and write a note — NOT an academic paper (use /paper-note for arXiv papers). Code analysis is the core, wrapped with just enough theory / usage / effects / sources to make the note self-contained.
---

# feature-deep-dive — code/system analysis → study/ HTML note

The code/feature/codebase sibling of `/paper-note`. Output: one bilingual (EN/KO)
**type-A** page under `study/` following this repo's conventions (CLAUDE.md §"테마",
§"페이지 타입 A", §"카드 태그 버튼 색"). Proven examples to copy from:
`study/vllm-dual-batch-overlap.html`, `study/vllm-diffusion-llm.html`,
`study/llm-d-agentic-serving.html` (same style block + section pattern).

Scope = any inference-serving topic, not just vLLM: a vLLM feature (DBO, diffusion
LLMs), another system (llm-d, SGLang, TRT-LLM), a serving technique, or a codebase walk.

## Core requirement — code analysis with commit-pinned permalinks

The heart of the note is a **code flow**: trace the real implementation and cite it.
- **Shallow-clone the repo(s)** and pin the exact SHA (`git clone --depth 1 <url> /tmp/<x>`,
  `git -C /tmp/<x> rev-parse HEAD`). grep for the relevant symbols; trace the end-to-end path.
- Every code reference = a GitHub **permalink pinned to that SHA**, exact form
  `https://github.com/<org>/<repo>/blob/<SHA>/<path>#L<a>-L<b>`, with a one-line description
  and (for the key spots) a 2-6 line verbatim snippet.
- State enablement (flags / env / config) and implementation status (experimental? merged
  PR/RFC numbers + URLs? constraints?).
- If there is **no public repo**, say so explicitly and drop the code-flow section.

## What wraps the code (so the note stands alone)

- **Theory / what & why** — what the feature is and the problem it solves; the background a
  reader needs. Use verbatim quotes (`blockquote.q`) with source links for load-bearing claims.
- **How it works** — the mechanism, with a diagram.
- **Effects / pros & cons** — separate **theory** from **what's actually been reported**; be
  honest (flag vendor/blog numbers, combined-vs-isolated gains, single-node-vs-multi-node, what
  is *not* measured). Don't overclaim.
- **Usage** — exact flags/commands/config to run it.
- **Status** — maturity, supported configs, open PRs/issues.
- **Sources** — a dedicated section; every external (non-repo) claim carries a URL; mark blogs.
- **Editor's note ("우리 관점")** — optional `c-purple` callout marked **"편집자 주 — (출처)의 주장
  아님"**, connecting to our work (MI250 / heimdall / llm-d) and the practical boundary.

Section count/titles are flexible (unlike the fixed paper 5-part) — fit them to the topic. A
typical spine: ① theory/what-why → ② how it works → ③ effects (theory vs reported) → ④ usage
→ ⑤ code flow (permalinks) → ⑥ status → ⑦ sources. Always include a glossary (`grid3`+`mini`,
the terms a reader needs) and a "한 줄 요약" `c-blue` callout near the top.

## Workflow

1. **Research (fan out, can run in background).** Launch general-purpose subagents (WebFetch/
   WebSearch/Bash):
   - a **code agent**: clone + pin SHA, locate the implementation, trace the flow, return
     permalink-ready `path:Lx-Ly` + snippets + enablement + status (PRs/RFCs).
   - a **theory/docs/sources agent**: official docs, blog, PRs, related papers; the why, the
     expected/ reported effects with cited URLs, honest caveats.
   Independent topics → run their agent sets concurrently. Background agents notify on completion.
2. **Write** `study/<english-slug>.html` from a proven example's style block:
   hero (title + lede + `.meta` badges: docs link, key PR, `code @ <short-SHA>` tree link, a
   "Deep dive · code-walk" badge) + `post-meta` today → TOC → glossary → "한 줄 요약" → the
   body sections → Sources → footer. All prose in `<span class="en">…</span><span class="ko">…</span>`
   pairs; code/flags/quotes language-neutral. `<script src="../assets/i18n.js">` at the end.
   Tag classes from theme.css only (never inline `.t-*`).
3. **Diagrams** — inline SVG with `var(--…)` tokens only (mechanism, timeline, comparison),
   each with a `figcap` citing the source. Reuse SVG patterns from the example notes.
4. **Index card** — add to `study/index.html` (newest first), tag **`t-green` "Deep dive ·
   code-walk"** (or "· config-walk"), `post-meta` = today.
5. **Verify** — `python3 tools/check_theme.py` until pass; sanity-check en/ko span balance,
   permalinks pinned to a real SHA, no stray non-ASCII in Latin words.
6. **Commit/push only when asked** (auto-deploys on push to main; pre-push re-runs check_theme
   + the post-meta-bump check). Co-Authored-By the repo's standard line.

## Notes
- `/paper-note` = academic papers (fixed 5-part, verbatim-quote-with-anchor, plain-language math).
  `/feature-deep-dive` = features/systems/codebases (flexible sections, code-flow permalinks).
  Both share the type-A template, diagram, and source-citation discipline.
- Honesty defaults: pin line numbers to a SHA (they drift); never present a combined gain as
  isolated; flag what's vendor-reported vs measured; if you couldn't confirm something, say so.
