---
name: model-deep-dive
description: Turn a model release (announcement blog / model card / tech report) into a bilingual models/ HTML "model report" for the han-oqo.github.io repo. Use whenever the user gives a model link or name (a vendor blog like z.ai/minimax.io/qwen, a HuggingFace card, an arXiv tech report) and asks to 조사/정리/deep-dive the model into a page. Always states modality up front, follows the fixed 7-part structure, hunts down the tech report/paper beyond the announcement blog, embeds the source's real architecture/attention figures with attribution, reconstructs benchmark tables with real numbers, cites every external claim and marks vendor claims as such, then adds the models/index card (t-coral) and passes tools/check_theme.py.
---

# model-deep-dive — turn a model release into a models/ HTML model report

Produce one bilingual (EN/KO) **type-A model report** under `models/` that follows this repo's
conventions (CLAUDE.md §"페이지 타입 A" + the model-report card tag rules).
**Base template to copy: `models/minimax-m3.html`** (hero with a modality `.badge.mod`,
`.meta` source badges, TOC, `.num` section chips, `c-*` callouts, `svg.fig` redrawn diagrams
AND `img.fig` embedded source figures, `blockquote.q` for vendor-claim quotes, benchmark tables).
This is the model sibling of `paper-note` (arXiv papers) and `feature-deep-dive` (code/features);
the difference here is the fixed 7-part model structure, the mandatory modality statement, and the
embed-the-source-figures rule.

## Hard requirements (do not drop any)

1. **Verify the model is real before writing.** Vendor blogs can be SPAs (plain curl returns an
   empty shell — use WebFetch, not curl, and WebSearch). Confirm the release exists and the
   version is right. If you cannot confirm it, say so and report the latest real version instead —
   never fabricate specs, sizes, or scores.
2. **Go beyond the announcement blog.** Hunt for the **tech report / paper** (arXiv), the
   **HuggingFace model card** (config.json gives exact dims/experts/layers), the **GitHub repo**,
   and papers-with-code. Mine those for architecture and training details the blog omits, and
   prefer primary numbers (model card / report) over blog prose.
3. **Modality is mandatory and up front.** Put a `.badge.mod` (coral) in the hero stating the exact
   modality — text-only? text+vision? +audio? +video? +computer-use? native vs adapter? — with a
   source link, and restate it in a `c-coral` callout in §2. Never leave modality implicit.
4. **Fixed 7-part body structure** (h2 + numbered `.num` chip, in this order — keep the KO titles):
   1. **의미와 오픈 모델 내 위치** (What it is & where it sits among open models) — what the model is,
      who made it, and its position vs other open-weight models (DeepSeek/Qwen/Llama/Kimi/MiniMax…)
      and vs closed frontier models. The headline claim (quote it) + honest positioning.
   2. **구조 · 크기 · 활성 파라미터** (Architecture · size · active params) — total & active params;
      if MoE: #experts/top-k/shared experts; #layers, hidden dim, attention type (MHA/GQA/MLA/
      linear/hybrid), context length, vocab, tokenizer. Reconstruct the config as an HTML table.
      **Embed the source architecture figure here** (see req 6).
   3. **학습 — 특이한 점** (Training — what's unusual) — pretraining tokens/data, post-training/RL,
      and specifically the *distinctive* techniques this release claims. Separate fact from claim.
   4. **연산적 특성 · 추론 포인트** (Computational characteristics · inference points) — attention/
      KV-cache cost, MoE routing cost, quantization, throughput/latency, serving support
      (vLLM/SGLang), hardware. Tie to this repo's serving interests. **Embed the attention/compute
      figure here** if one exists.
   5. **점수** (Scores) — benchmark numbers (MMLU/GPQA/AIME/LiveCodeBench/SWE-bench/agentic, etc.)
      reconstructed as an HTML table with the comparison models. Mark self-reported vs third-party.
   6. **오픈소스 릴리스** (Open-source release) — license (read the actual terms; flag "faux-open"),
      HF/GitHub URLs, weight variants & sizes, quantizations, API availability & pricing.
   7. **세상의 반응** (The world's reaction) — community/press reaction and notable takes, each
      marked as opinion with a source link. Optional editor's-note `c-purple` "우리 관점" (our take),
      marked **"편집자 주 — 모델 제작사의 주장 아님"**, connecting to this repo's serving work.
5. **Cite every external claim.** Inline `a.src` + a Sources section listing every URL. Mark blog/
   vendor numbers as vendor-claimed; separate confirmed facts from inferred/uncertain ones. Put the
   exact key claims in `blockquote.q` with a `<cite>` source link (quotes stay language-neutral).
6. **Embed the source's real figures (the user explicitly wants this).** If the blog / tech report /
   model card has an **architecture diagram or an attention/computation figure**, embed the actual
   image with `<img class="fig" src="<direct image URL>" alt="…">` + a `figcap` crediting the source
   ("Source: GLM-5.2 blog, Fig. N · z.ai" with a link). Prefer hot-linking the source's own CDN URL
   (e.g. `z-cdn.chatglm.cn`, `cdn-uploads.huggingface.co`, arxiv figure URLs) so the repo doesn't
   re-host the asset; if a needed figure is only available as a download, save it under
   `assets/model-figs/<slug>/` and reference it, always with visible attribution. Add your own
   redrawn `svg.fig` (theme palette `var(--…)` only) where a clean schematic helps, but do NOT
   replace the requested source figures with redraws — include both.
7. **Explain the hard parts in plain language.** Define MoE/active-params, the attention variant,
   any novel training trick in one plain sentence on first use; convert big numbers to intuition.

## Workflow

1. **Research (fan out).** Launch a general-purpose research subagent (has WebFetch/WebSearch/Bash)
   to: verify the model exists; fetch the blog via WebFetch; find the tech report + HF card + GitHub;
   fill all 7 sections with sourced facts; reconstruct the benchmark table; and **collect the direct
   image URLs of architecture/attention figures** (+ one-line captions + which source). Have it
   separate confirmed facts from vendor claims. For multiple models, one agent set each, concurrently.
2. **Write** `models/<model-slug>.html` from `models/minimax-m3.html`:
   - hero: `h1` (model + one-line what-it-is), `lede`, `.meta` badges = **modality `.badge.mod`** +
     blog + tech-report + HF + GitHub + size/arch + license + vendor·date, then `post-meta` = today.
   - TOC → (optional 4-6 term glossary `grid3`+`mini`) → "한 줄 요약" `c-blue` callout → the 7
     sections (with embedded figures) → Sources → footer.
   - All visible prose in `<span class="en">…</span><span class="ko">…</span>` pairs; model names,
     flags, and verbatim quotes stay language-neutral. `<script src="../assets/i18n.js">` at the end.
   - Tag classes come from theme.css only; do not inline `.t-*`.
3. **Index card.** Add a card to `models/index.html` (newest first) — tag **`t-coral` "Model report /
   모델 리포트"**, `post-meta` = today's date (created; add `updated` only on later edits per CLAUDE.md).
4. **Verify.** Run `python3 tools/check_theme.py`. NOTE: the checker scans only **git-tracked** files
   (`git ls-files`), so a brand-new untracked page is silently skipped — `git add` the new page +
   index before the final check so it is actually validated. Sanity-check: en/ko span counts balanced,
   every `img.fig` has a working src + attribution figcap, no stray non-ASCII inside Latin words.
5. **Commit/push only when the user asks** (push to main auto-deploys; the pre-push hook re-runs
   check_theme + the post-meta-bump check). End commit messages with the repo's Co-Authored-By line.

## Notes
- Figures from a vendor blog/report embedded with attribution for an educational note are fine;
  do NOT paste long copyrighted text — summarize, and quote only short key claims in `blockquote.q`.
- If the model has no tech report (blog-only release), say so explicitly and lean on the HF card's
  `config.json` for the hard architecture numbers.
- Reference reports already in the repo: `models/minimax-m3.html`, `models/mimo-v25-pro-ultraspeed.html`,
  `models/nemotron-3-ultra.html` (model reports, `t-coral`).
