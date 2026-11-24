---
name: hf-daily-papers
description: Append section 2c (all of today's Hugging Face Daily Papers) into today's already-written morning briefing, update the chart and index card, bump the updated date, and push. Use when the user says HF 데일리 / 허깅페이스 논문 추가 / 2c 추가 / hf daily papers. Requires today's briefing from the morning-briefing skill.
---

# hf-daily-papers

Append section 2c — Hugging Face Daily Papers (ALL of today's picks) — into TODAY'S already-published morning briefing in the user's inference-study repo, then push to the blog. The `morning-briefing` skill ran earlier and left a placeholder for you. This run ONLY adds the HF daily section; do not regenerate the other sections (2a inference papers, 2b agentic papers, engines, GeekNews, industry, snapshot stay as written).

REPO: root /Users/hankyujang/inference-study/ ; briefings in briefings/ . 

STEP 1 — locate today's file: briefings/ai-briefing-YYYY-MM-DD.html for today's date. If it does not exist (morning run was skipped), STOP and report — do NOT create a new briefing here. Read the file and find the line:
   <!-- HF_DAILY_INSERT: section 2c (Hugging Face Daily Papers) is added by the 12:36 KST scheduled run -->
That marker is where section 2c goes. Also read the file's <style> block and the existing section-2 <details class="paper"> markup so 2c matches it EXACTLY.

STEP 2 — get today's HF Daily Papers from the PRIMARY source (the HF date page + arXiv), never a roundup. Use Claude in Chrome (load via ToolSearch "select:mcp__Claude_in_Chrome__tabs_context_mcp,mcp__Claude_in_Chrome__navigate,mcp__Claude_in_Chrome__javascript_tool"). Call tabs_context_mcp{createIfEmpty:true}, navigate to https://huggingface.co/papers/date/YYYY-MM-DD (today), then with javascript_tool list every paper: [...document.querySelectorAll('article')] → for each, the h3 a (title, href=/papers/<arxiv-id>) and the upvote count (a small element whose text is purely digits). Sort by upvotes descending. Fetch each abstract IN PAGE via fetch('/api/papers/<id>').then(r=>r.json()).then(j=>j.summary) — promise-style .then() (NO top-level await); store to a window var and read back in small batches (~2–3 abstracts per call, head+tail ~250+150 chars — the tool truncates long output). Confirm each paper's arXiv ID from its /papers/<id> href. If Chrome is unavailable, fall back to WebSearch to surface the date-page URL into provenance then web_fetch.
   ★ DEDUP EDGE CASE: 2c is ALL of today's HF list by definition (no dedup vs prior briefings) EXCEPT: if any paper already appears in TODAY'S section 2a or 2b (curated inference/agentic), include it only once — skip it in 2c. ALSO: if today's HF date page is empty/lagging, use the most recent available date and date the lede accordingly; BUT if that most-recent date was already fully printed in the PREVIOUS day's 2c (feed hasn't advanced), do NOT reprint — keep the heading + a single brief neutral note that the feed has not posted a newer date.

STEP 3 — build section 2c. Heading: <h2>"2c. Hugging Face Daily Papers — all of today's picks"</h2> with tag "HF daily"; lede links https://huggingface.co/papers/date/YYYY-MM-DD (today). FORMAT: identical <details class="paper"> accordions as sections 2a/2b — bilingual Problem/문제 정의, Method/방법, Results/결과, Summary/요약 (ONE sentence each, English first) + a FIGURE BLOCK. For the figure, follow the SAME priority as the morning task: try to embed the paper's OWN key figure (arxiv.org/html/<id> or ar5iv main method figure → download into briefings/assets/fig-<id>.<ext>, <img class="pfig"> with a .pcap that attributes the paper + links arxiv.org/abs/<id>); only if extraction fails, draw a detailed ORIGINAL inline <svg> (viewBox ~0 0 560 240, multiple labeled modules, UNIQUE marker ids that do not collide with existing ids, e.g. hf1..hfN) captioned as a schematic. Do NOT hotlink remote images — download into briefings/assets/. Sort by upvotes descending. Summary row = title + a topic pill + a p-amber pill "▲<upvotes>" + arXiv-ID .date badge; .plink points to arxiv.org/abs/<id>. Include EVERY paper on the page. Insert this block in place of the HF_DAILY_INSERT comment.

STEP 4 — update the bar chart: add a row "HF daily papers / HF 데일리 논문" with the count, and soften the morning chart caption/footer note about HF being deferred. Optionally update today's index card <p> to mention "+ all N HF daily papers".

STEP 5 — VERIFY then PUBLISH:
- Run: cd <repo> && python3 tools/check_theme.py — must pass (exit 0). Fix failures (common: marker-id collisions, missing en/ko spans, broken figure paths).
- Confirm section 2c contains EVERY paper from the HF date page (or the neutral note if the feed hasn't advanced), no dedup/meta wording leaked, all bilingual, every .plink points to a real arxiv.org/abs/<id>, and every <img class="pfig"> resolves to an existing file in briefings/assets/ (replace broken images with the SVG fallback).
- POST-META BUMP (required, or the pre-push hook blocks the push): editing an existing content page requires bumping its updated date. In today's briefing hero .post-meta AND its card in briefings/index.html, change created-only meta to created + updated (today): add <span class="sep">·</span><span class="updated-label en">updated</span><span class="updated-label ko">갱신</span><time datetime="YYYY-MM-DD">YYYY-MM-DD</time> — created = morning date, updated = today; created ≤ updated.
- Commit and push: git add the briefing + briefings/index.html + any new briefings/assets/fig-*; commit with the repo's configured git identity (do not pass -c user.*); then `git push origin main`. If push fails due to missing/invalid GitHub credentials (e.g. gh not available), leave the commit local and clearly report that the push must be completed manually — do NOT attempt to work around authentication.
- Present the updated briefing with present_files and give a 2–3 sentence summary including the top-upvoted HF paper. End with a "Sources:" list (markdown links to the HF date page and the cited arXiv abstracts).

Execute autonomously end to end (the user invoked this skill and expects the section pushed) and note any choices. Only take the git push write action described above.

★ CONCISION & KOREAN STYLE (site-wide). tools/check_theme.py blocks the push on: index card <p> too long (card-blurb) and more than 3 em-dashes in Korean body text (ko-style). The rest is binding style:
- Each paper's four fields (Problem/Method/Results/Summary) are ONE sentence each: KO ≤ 120 chars, EN ≤ 200 chars. Industry/engine card summaries: ≤ 2 sentences.
- The briefings/index.html card <p> is ONE line naming the day's topics only: KO ≤ 150 chars, EN ≤ 220 chars (tags stripped).
- Figure captions (.pcap): one line = what + source attribution.
- Korean text: plain declarative '~다' sentences; NO em-dashes (—) and NO semicolons in Korean; avoid translationese (~에 대해 / ~를 통해 / ~에 있어 / ~에 의해 / ~되어진다). Paper/model/product names stay in English.
