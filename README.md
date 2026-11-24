# han-oqo.github.io

AI Inference Study — notes on LLM inference internals. Source for [https://han-oqo.github.io/](https://han-oqo.github.io/).

## Structure

- `index.html` — landing page
- `learn/` — Inference Onboarding (Basic question sheet + 13-week Advanced track) and concept explainers
- `papers/` — paper notes · `models/` — model reports · `engines/` — serving-engine code walks
- `lab/` — experiments, benchmarks, runbooks, infra ops · `briefings/` — daily AI briefings
- `study/`, `logs/`, `infra/`, `post-training/`, `onboarding/` — redirect stubs only (moved 2026-11-24)
- `assets/` — shared CSS/JS (language toggle `i18n.js`, "Ask Claude" launcher `ask.js`)

Each page supports an English ↔ Korean toggle (top-right). Default is English; the choice is remembered in `localStorage`.

## "Ask Claude about this page" button

Every page has a floating **✦ Ask Claude** button (bottom-right). Type a question and
it opens a new **claude.ai** chat (new tab) pre-filled with this page's URL and your
question, asking Claude to read the page **and the sources it cites** (papers,
commit-pinned code links) and to cite them in the answer. No API key, no backend —
it uses the reader's own claude.ai account. Implemented in `assets/ask.js`, loaded
automatically by `i18n.js` (and injected by CI via `tools/inject_ask_widget.py`).

(It replaced the earlier BYO-key multi-provider widget / Claude bot on 2026-11-23.)

## Local preview

Any static server works, e.g.:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Gated pages

Some company-internal pages (under `engines/` and `lab/`) are encrypted client-side with [StatiCrypt](https://github.com/robinmoisson/staticrypt). The unencrypted sources are not committed (`*.unencrypted.html` is in `.gitignore`).

## Format & theme consistency (enforced)

All pages must share the same skeleton and the cream/warm palette defined in
`assets/theme.css`. The full conventions live in [CLAUDE.md](CLAUDE.md); they are
enforced automatically:

```sh
sh tools/install-hooks.sh        # once after cloning — enables the pre-push hook
python3 tools/check_theme.py     # run the consistency check manually
```

A failing check **blocks `git push`** (pre-push hook) and **blocks deployment**
(CI job in `.github/workflows/pages.yml`).
